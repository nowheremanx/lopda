# 和弦大全 / Chords: notes for maintainers

A guitar chord dictionary for Lo-PDA, standard tuning only. It has 19 chord qualities plus slash chords and up to 24
voicings each. There are four pictures of a chord, 23 common progressions with a note on why each works, a scale view
for improvising, and a finder that names the chord your fingers make. Sound is a plucked string made in the app.

This file says where things are and what must not break. Why things are the way they are is in
[`docs/design/chord-book.md`](../../../docs/design/chord-book.md) (the design, section 13 for each version's changes) and
[`docs/decisions.md`](../../../docs/decisions.md) section 76 (each version's decisions, with the owner's requests).

## Files

`index.html` is the shipped app. Its `<script data-src="src/...">` blocks are filled from `src/` by the bundler, so edit
`src/` and never the filled blocks. The CSS and the markup live in `index.html` itself.

| File | What it holds | Pure (no DOM, no PAD) |
|---|---|---|
| `src/chords.js` | Note names, the 19 qualities, name parsing and spelling, the hand-written shapes, the voicing generator, fingers, scores, sorting, naming a voicing (`identify`), each string's note and degree | yes |
| `src/draw.js` | The four pictures as tone buffers (0 ink, 1 dark, 2 mid, 3 paper), their hit tests, and `paint` onto a canvas | yes, except `paint` |
| `src/guitar.js` | The Karplus-Strong string and the strum, with the app's own AudioContext | no |
| `src/progs.js` | The progressions table and its why-it-works notes; `forChord` finds and spells the ones a chord is in | yes |
| `src/scales.js` | The improv view's scales per quality, the four kinds of note, picking the mode from a key | yes |
| `src/app.js` | Screens, keys, the save | no |

The load order in `index.html` matters: chords, draw, guitar, progs, scales, app. The later files use the earlier
ones' globals (`Chords`, `Draw`, `Guitar`, `Progs`, `Scales`).

## The main screen

From top to bottom:

- **Header:** the chord name, which opens the picker; 连接, the progressions; the view button.
- **Picture:** one of four views.
- **Quality line:** the chord quality, or in the improv view the scale's name.
- **Info line:** the frets, the voicing's number and its position, or in the improv view the scale's degrees.
- **Bottom row:** one 44 x 44 cell per string, or in the improv view the why and the legend.
- **Footer:** previous, strum, next.

The view button cycles through four views. The view is saved as `set.view`.

| `set.view` | Shows | A tap plays | Left / right |
|---|---|---|---|
| `box` (框图) | The voicing on 6 strings x 5 frets, fingers in the dots, the root as a square | the note at that string and fret, among the five frets (and the open strings when the box starts at the nut) | voicing |
| `neck` (指板) | The voicing on 15 frets, with the chord's notes elsewhere as small dots | the note anywhere on 15 frets | voicing |
| `map` (度数) | The box's five frets with every place named by its degree | as `box` | voicing |
| `scale` (即兴) | The chosen scale on 15 frets: root square, chord tone dot, tension ring, avoid cross | as `neck` | scale |

A swipe slides the picture (`slide()` in app.js). The words and the hit tests change at once; only the picture moves.

### Rules the screen depends on

- **The picture's scale.** `Draw.paint` scales the canvas by a whole number to fit `#pwrap`, so every row around
  the picture has a fixed height. If a row grows, the picture drops from 3x to 2x for that one chord. An e2e test steps
  through every voicing of C and Ebmaj7 on the smallest and a large screen to catch this.
- **Four tones only.** Every pixel is one of `#1f2a14 #4a5a32 #7d8a58 #a3ad7e`. That is why the slide moves in whole
  css pixels and never fades. It is also why the degree names are dark or mid text and not colours.
- **No `drawImage` after `putImageData`.** Safari swaps red and blue on that path. The sliding ghost canvas is painted
  with `Draw.paint` from the previous buffer.
- **Sound starts on release.** The strum plays on `pointerup` (a long press is the arpeggio), because iPhone only lets
  audio start in a gesture that ends.
- **No chin pad.** SELECT exists only as Shift on a computer keyboard. Every key has a button on screen.

## Data that is ours

Nothing comes from an outside chord database. The shapes in `chords.js` are hand-written. The rest are generated and
scored. The progression notes and the scale explanations are our own words. A progression or a mode is not anyone's
property; songs are not named.

`scales.js` writes the avoid notes by hand per chord and scale instead of deriving them from one rule, because the
textbook exceptions matter. A b9 over a dominant chord is a tension. The 3 over a sus4 is avoided although it sits
below a chord tone. The tests check that every avoid note is a half step over a chord tone, or the 3 of a sus4.

## Saved state

`PAD.save("set", {v: 1, cur: {root, q, bass, i}, sort, view, vol, recent})`. `adopt()` in app.js reads older saves:

- 1.2.0's `map: true` becomes `view: "map"`.
- Anything it does not know is dropped.

The scale chosen in the improv view is not saved: a new chord starts on its default.

## Build and test

From the repo root:

```sh
node tools/bundle-app.mjs registry/apps/chord-book   # after any change in src/
node tools/check-app.mjs registry/apps/chord-book
node tools/build-index.mjs                           # after a version or manifest change
node --test tests/chord-book.test.mjs                # the pure files in node:vm
node --test tests/e2e-chord-book.test.mjs            # the screens in Chromium; skipped without Playwright, run in CI
```

- **Unit tests:** `tests/chord-book.test.mjs` checks the shapes, the golden first choices for common chords, the
  generator's rules, the progressions, the degree names, the hit tests and the scales. The objects come from another
  realm (`node:vm`), so spread an array (`[...x]`) before `deepEqual`.
- **Screen tests:** `tests/e2e-chord-book.test.mjs` drives the screens with a fake PAD. `window.__press(k)` is a key,
  `window.__saves` the save store. Wrap `window.Guitar.play` to see which notes played.
- **Phone:** the PR preview link opens the app on a phone. iPhone Safari is the target that matters.

A change to this app alone needs no runtime version bump. Bump `version` in `manifest.json` and add a line to the
design doc's section 13 and to decisions.md section 76.

## Ideas not built yet

These are in `docs/design/chord-book.md` section 11:

- exporting a progression to Tape4;
- naming an arpeggio by ear with the microphone;
- tab phrases.
