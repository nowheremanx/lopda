# 和弦大全 / Chords: notes for maintainers

A guitar chord dictionary for Lo-PDA. This version covers **32 chord qualities plus slash chords, in standard tuning
(EADGBE) only, with a capo from 0 to 12**; other tunings and a left-handed layout are not planned yet. It has 65
hand-written open and slash shapes, up to 24 voicings each, four pictures of a chord,
32 common progressions with a note on why each works, a scale view for improvising, and a finder that names the chord
your fingers make. Sound is a plucked string made in the app.

This file says where things are and what must not break. Why things are the way they are is in
[`docs/design/chord-book.md`](../../../docs/design/chord-book.md) (the design, section 13 for each version's changes) and
[`docs/decisions.md`](../../../docs/decisions.md) section 76 (each version's decisions, with the owner's requests).

## Files

`index.html` is the shipped app. Its `<script data-src="src/...">` blocks are filled from `src/` by the bundler, so edit
`src/` and never the filled blocks. The CSS and the markup live in `index.html` itself.

| File | What it holds | Pure (no DOM, no PAD) |
|---|---|---|
| `src/chords.js` | Note names, the 32 qualities, name parsing and spelling, the hand-written shapes, the voicing generator, fingers, scores, sorting, naming a voicing (`identify`), each string's note and degree | yes |
| `src/draw.js` | The four pictures as tone buffers (0 ink, 1 dark, 2 mid, 3 paper), their hit tests, and `paint` onto a canvas | yes, except `paint` |
| `src/guitar.js` | The Karplus-Strong string and the strum, with the app's own AudioContext | no |
| `src/progs.js` | The progressions table and its why-it-works notes; `forChord` finds and spells the ones a chord is in | yes |
| `src/scales.js` | The improv view's scales per quality, the four kinds of note, picking the mode from a key | yes |
| `src/app.js` | Screens, keys, the save | no |

The load order in `index.html` matters: chords, draw, guitar, progs, scales, app. The later files use the earlier
ones' globals (`Chords`, `Draw`, `Guitar`, `Progs`, `Scales`).

## The main screen

From top to bottom:

- **Header:** the chord name, which opens the picker; 连接, the progressions; the view button. A chord opened from a
  progression keeps the key's spelling here (`G#dim7`), and the quality line adds the book's own name (`减七 · Abdim7`);
  a normal pick, search or recent chip clears the note (1.4.4).
- **Picture:** one of four views.
- **Quality line:** the chord quality, or in the improv view the scale's name.
- **Info line:** the frets, the voicing's number and its position, or in the improv view the scale's degrees. With a capo
  on, the frets are followed by `变调夹 n · 实际 X` / `Capo n · sounds X`: the frets, the capo and the real chord are
  never dropped when the line is long; the voicing's number goes first, then the position.
- **Bottom row:** one 44 x 44 cell per string, or in the improv view the why and the legend. A tap on the why opens it
  in full on its own screen (`#whyfull`).
- **Footer:** previous, strum, next, mute. In the improv view previous and next become Prev scale and Next scale, and
  both are off when the chord has a single scale. Mute turns the guitar off, or back to the last level that made a sound
  (mid by default; kept across restarts).

The view button cycles through four views. The view is saved as `set.view`.

| `set.view` | Shows | A tap plays | Left / right |
|---|---|---|---|
| `box` (框图) | The voicing on 6 strings x 5 frets, fingers in the dots, the root as a square, a barre as a bar (finger 1, or a ring finger as in C9 x32333) | the note at that string and fret, among the five frets (and the open strings when the box starts at the nut) | voicing |
| `neck` (指板) | The voicing on 15 frets, with the chord's notes elsewhere as small dots | the note anywhere on 15 frets | voicing |
| `map` (度数) | The box's five frets with every place named by its degree | as `box` | voicing |
| `scale` (即兴) | The chosen scale on 15 frets: root square, chord tone dot, tension ring, avoid cross | as `neck` | scale (both buttons off when there is only one) |

A swipe slides the picture (`slide()` in app.js). The words and the hit tests change at once; only the picture moves.
The finder opened from the picker starts from the pending chord's first voicing, and its Back returns to the picker
(`finderFromPicker` in app.js); 看这个和弦 always goes to the main screen.

### The picker

The root and bass grids write the common enharmonic beside the book's name (`C#/Db`, `Eb/D#`, `F#/Gb`, `Ab/G#`,
`Bb/A#`), from the pure array `Chords.PICK_NAMES`. Only those labels change: a tap still selects the pitch class, the
selected state is still the pitch class, the bass grid still leaves the root out, and the title and every chord name,
tone name, search result and save keep `Chords.NAMES` (so tapping `C#/Db` gives C#). Five characters fit the four-column
grid at 331, and the cells stay 44 px tall (1.4.5).

The last row is the capo, 0-12 (`#capo`, a `grid4` with 13 cells). It takes effect at once, like the order and the
sound: `set.capo`, then `store()` and a repaint of the main screen behind the picker. A new capo is a new real chord and
a new real scale, so the key's spelling (`spelledName`) and the chosen scale (`md`) are cleared with it (1.4.10).

### The capo: a shape and the chord it sounds

The header, the picker, the voicings, the save and the finder's frets all hold the **shape**; everything played or worked
out by key holds the **sounding** chord, `Chords.transpose(shape, capo)` (root and bass moved, quality unchanged). So C
x32010 under capo 2 is written `C` in the header and `实际 D` in the info line, and its strings are D F# A D F# with the
shape's degrees R 3 5 R 3.

`Chords.midiOf(frets, capo)`, `strings(frets, c, capo)`, `identify(frets, capo)` and `Draw.scale(notes, capo)` take the
capo as an optional last argument; 0 is a no-op. `strings` looks its degrees up with `OPEN + frets` (the shape) and adds
the capo only to `midi` / `pc`. `Draw.box`, `map` and `neck` take no capo at all: they are pictures of the shape, so the
four pictures are the same at every capo (an e2e test compares `#pic` pixel by pixel at 0, 2 and 12).

### The progressions screen

32 hand-written progressions (`src/progs.js`), each a card with its key, Roman numerals, a chip per chord (the one you
came from underlined), a Play button and a note on why it works. The sequence strums one chord a bar, holds a chord for
its `p.bars[i]` bars and fills the chip that is sounding; a second tap stops it. A chip opens that chord on the main
screen on the voicing it was played with, and the key's spelling follows.

`#gbar` above the scrolling list has one filter button. All cards show by default; `只看主和弦 / Tonic only` keeps only
the cards where the chord is the tonic of its key (`r.p.ch[r.at][0] === 0`, 12 of C's 15), and the button then reads
`全部 / All` in the on style. The filtered array is the list everywhere: the cards drawn, the `seq.card` index, the
keyboard focus and what Play plays. Toggling stops a running sequence, clears the focus and scrolls to the top; every
visit starts with all cards. The row appears only when there is a mix to choose between: a chord with no tonic card
(Bdim is only vii° of the circle) or with every card already tonic (Cmaj7's two) hides it and disables the button, so the
filter never leaves an empty screen or does nothing (1.4.5).

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
- **A chord with no voicing never opens.** Eighteen root / quality / bass combinations have no voicing: `Ab9/B`, the m9
  family over some basses (`Ebm9` over G, Bb and B; `Bbm9` over D, F, F# and B), the 1.4.7 batch's `D7#9/Eb`,
  `F7#9` over C, C# and Bb, `A7#9/Bb`, `Bb7#9/Eb`, `Ab6/9/B` and `Bbmaj9/C#`, `C7b9/B`, and 1.4.9's `Cm13/B`. `go()` in
  app.js checks `Chords.voicings(c)` first, plays `err` and leaves the main screen
  alone; the picker's 好, search, recent chips and 在指板上点出和弦 all stay put and say 这个和弦没有按法 / No voicing for
  this chord, and the finder does not open. The main screen's ↑ ↓ 换性质 is refused too, but silently apart from the
  `err` sound (the main screen has no message row). An old save holding one of them starts on C (1.4.4).
- **No chin pad.** SELECT exists only as Shift on a computer keyboard. Every key has a button on screen.
- **Keys are what the code does.** In the picker ← → change the root and ↑ ↓ the quality; the bass row is touch-only.
  In the finder ← → move the position; its x / o row and 6 x 5 grid are touch-only. Every one of those actions also has
  a button (the bass row, the grid, the why line, the mute).

## Data that is ours

Nothing comes from an outside chord database. The shapes in `chords.js` are hand-written. The rest are generated and
scored. The progression notes and the scale explanations are our own words. A progression or a mode is not anyone's
property; songs are not named.

`scales.js` writes the avoid notes by hand per chord and scale instead of deriving them from one rule, because the
textbook exceptions matter. A b9 over a dominant chord is a tension. The 3 over a sus4 is avoided although it sits
below a chord tone. The tests check that every avoid note is a half step over a chord tone, or the 3 of a sus4.

## Saved state

`PAD.save("set", {v: 1, cur: {root, q, bass, i}, sort, view, vol, lastVol, capo, recent})`. `adopt()` in app.js reads older saves:

- 1.2.0's `map: true` becomes `view: "map"`.
- a save from before 1.4.10 has no `capo`: it opens at 0; only a whole number 0-12 is believed.
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
