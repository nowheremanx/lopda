# Lo-PDA app UI: rules that make a small screen work

Read this before laying out any app screen. The rules are concrete on purpose: follow them as written and
the app will be usable on every phone the handheld runs on. Games that draw everything on one canvas still
need sections 1, 2, 5, 9 and 11; `LO-GAME.md` covers the rest for them.

## 1. Know the screen you get

The app fills the handheld's LCD, an iframe. Measured in the runtime (CSS pixels):

| Phone | Without the chin pad | With `"buttons": true` |
|---|---|---|
| iPhone SE (375×667) | 331 × 473 | **331 × 359** |
| iPhone 14/15/16 (390×844) | 346 × 650 | 346 × 518 |
| iPhone Pro Max (430×932) | 386 × 738 | 386 × 606 |

- **The chin pad costs about 120 px of height**, a fifth of the screen. Set `"buttons": true` only when the
  app needs the pad: games, and apps whose main way of working is moving a cursor. An app driven by taps
  (a form, a list you tap, a tool with on-screen buttons) must leave it out and use the space.
  Local scripts in the Scripts app follow the same rule without a manifest: their runner shows the pad only when
  the code reads `PAD.isDown`, `PAD.on("press")`, `PAD.on("release")` or `PAD.BUTTONS`.
- Design for **331 × 359** (the smallest) and check at **386 × 738** (the largest). Nothing may be cut off at
  the smallest size, and nothing may look lost at the largest.

## 2. One layout skeleton

Every screen is a column of three parts: a fixed header, **one** content area that takes all the space left
and scrolls if it must, and an optional fixed footer.

```html
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #a3ad7e; color: #1f2a14; font-family: monospace; }
  body { display: flex; flex-direction: column; }
  header { flex: none; }
  main { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }  /* min-height: 0 is required */
  footer { flex: none; }
</style>
<body><header>...</header><main>...</main><footer>...</footer></body>
```

- `min-height: 0` on the scrolling child is not optional. Without it a flex child grows to fit its content,
  never scrolls, and the bottom is cut off by `overflow: hidden` on the body.
- **At most one scrolling area per screen**, and it is the main one. Never put a small scrolling box inside
  a page of fixed controls: the player can only scroll inside that small box, which feels broken.
- Keep header and footer short (one or two lines each). If controls do not fit beside the content, the
  content is the scrolling `main` and the controls go in it too, or on a separate screen.
- No horizontal scrolling, ever. Long words and numbers wrap: `overflow-wrap: anywhere` on text that can be long.

## 3. Touch targets

- Every tappable thing is **at least 44 px tall** and as wide as it can be (a list row is the full width).
  Apple's guidelines ask for 44 × 44 points; anything smaller is missed by thumbs.
- At least 8 px between separate targets.
- A tap does one thing, on `pointerup` or `click`, not both. Use `touch-action: manipulation` on tappable
  things (the runtime already sets it) so a double tap does not zoom.

## 4. Text and the four tones

Contrast of the four tones against each other (WCAG contrast ratio):

| Text on background | Ratio | Use it for |
|---|---|---|
| ink `#1f2a14` on paper `#a3ad7e` | 6.3 | **all normal text** |
| paper on ink | 6.3 | inverted text: the selected row, primary buttons |
| ink on mid `#7d8a58` | 4.0 | text on a mid panel, at 14 px or more |
| dark `#4a5a32` on paper | 3.2 | secondary text only, 14 px or more (hints, units) |
| anything with mid on paper, or ink on dark | 1.6 – 2.0 | **never text**; only lines, fills, shadows |

- Sizes: body text **15 px** or more (Chinese needs it more than Latin), secondary text 13 px or more, nothing
  under 12 px.
- Text inputs: **font-size 16 px or more**. Smaller makes iPhone Safari zoom the page when the field gets focus.
  Style the placeholder too (`::placeholder { color: #4a5a32 }`); the browser's default light gray reads as white on paper.
- Short labels, like an old device: "存档", "SAVE", not sentences.

## 5. The cursor (apps with `"buttons": true`)

- One thing is selected at all times, drawn **inverted** (ink background, paper text). Never only an outline
  or a small arrow: those vanish on a bright screen.
- Up and Down move the selection; it wraps or stops at the ends, the same in every list of the app.
- When the buttons sit in more than one row, treat them as a grid, not one long list: Left and Right move along
  the row, Up and Down move between rows (same column, clamped when the last row is shorter). A button that spans
  the full width is its own row. Never make every arrow walk a two-column grid one item at a time in reading order:
  Down then visibly goes Right, and choices in the lower row look unreachable.
- When the selection moves, keep it on screen: `el.scrollIntoView({ block: "nearest" })`.
- A confirms, B goes back or cancels (SPEC section 4). The pad and touch do the same things: tapping a row
  selects it and acts, like A.
- Left and Right do one clear thing on the whole screen or nothing. Do not make them change a value on some
  rows and jump between sections on others.
- START and SELECT only when there is a natural job (a menu, the next group); unused keys are fine.

## 6. Say what the keys do

- A one-line footer lists only the keys that work **on this screen**, in this order: arrows, A, B, then
  START and SELECT. `↑↓ 选　A 播放　B 返回`.
- Change the footer when the screen changes. A hint for a key that does nothing here is a bug.

## 7. Feedback

- Every action gives two answers: a sound (`PAD.sfx`) and a visible change. A failed action plays `err` and
  says why in a few words.
- **A sound that repeats must not sting.** The handheld's speaker is small and bright, and its loudest volume
  is set well above comfortable. A pickup, a step, a hit or a menu blip is heard hundreds of times; it has to
  stay soft at that volume. The worst offender is a square wave that climbs above about 1 kHz.
- For bright sounds prefer `"triangle"` or `"noise"` to `"square"`, keep the top note under about 1.2 kHz, use
  an `attack` of 3 ms or more, and let `decay` fade to the end instead of cutting off. Lower `vol` before you
  shorten the sound: a short piercing click is worse than a slightly longer soft one. The ten named sounds are
  already balanced; use one of them when it fits.
- Test on the phone's own speaker at the loudest volume, never only in headphones, and play the effect twenty
  times in a row. If it makes you flinch, it will make the player flinch.
- Anything that takes longer than about half a second shows it is working ("…", a counter, an animation)
  and ignores repeated presses until it is done.
- Disabled controls look disabled (dark text, or a dashed border) and play `err` when pressed.

## 8. Lists, dialogs, screens

- A list of more than about 8 items scrolls in `main` (section 2), with the cursor kept in view.
- Group long lists with small headings (secondary text), not boxes inside boxes.
- A confirmation is a small in-app panel with two choices, the safe one selected first. Never `alert`/`confirm`.
- Prefer a new screen to a crowded one. Two simple screens beat one screen with ten controls.

## 9. Tilt and the microphone (SPEC.md 6.4)

- They are another way to play. Every screen also works with keys or touch, and the first screen says how to switch
  (`倾斜机身，或用方向键`).
- A tilt app offers a recentre action (`PAD.motion.zero()`), on a key the footer names (START or SELECT) or a button,
  and starts with "the way you hold it now is level". Never ask the player to lay the phone flat: nobody plays that way.
  An app that is meant to be used lying flat (a compass, a level) may say so and guide the player with `flat` (runtime 0.35.0+).
- Show that tilt is live (the ball moves, a small level mark) and what happens when it is not: `"denied"` or `"none"`
  quietly falls back to keys, with one line saying so.
- Turn the microphone on only while the app listens for something (a candle to blow out), and off as soon as it is
  done: while it is on the phone's silent switch does nothing. Say what to do ("对着话筒吹"), and give a key that does
  the same (hold A to blow).

## 10. The camera (SPEC.md 6.6)

- Ask for a photo when the player chooses to (a "拍一张" button or key), never on start: every `snap()` covers the app
  with the runtime's viewfinder.
- Show the picture the player took, as it is, before using it, with two choices: use it (A) and take it again (B, which
  calls `snap()` once more). People blink.
- `null` is normal (cancelled, no camera, refused): go back to where the player was, with one line at most, and keep a way
  to play without a photo (a drawn face, a built-in picture).
- Draw the picture with the four tones at whole-pixel scale (`image-rendering: pixelated`), never smoothed.

## 11. Art: retro, not ugly

Four tones and big pixels are the charm, not an excuse. The models to copy are LostDeck (`lost-deck`), Paper Tower
(`paper-tower`) and Foothill (`shanjiao-diner`): open them in `sdk/dev.html` before you draw.

1. **A title screen for every game and story**: a pixel illustration of the app's world plus its name, not a line of
   text over a menu. The gallery (`gallery/`) uses it as the app's cover, so draw it once and draw it well. A tool
   (a calculator, a dictionary card) opens straight on the tool instead (rule 6); its name and a small drawing can sit
   in the header. Draw the title's menu with `sdk/lo-title.js` (`LO-TITLE.md`): the picture over a wheel menu, one
   layout for every app, so the store and the gallery read as one family.
2. **Dither only large gradients**: a sky, a shadow, a fade to dark, at most a third of the screen. Under text and
   buttons the tone is always flat. A whole screen of grain reads as noise on a phone, not as "retro".
3. **Small text is ink on paper, or paper on ink**: never mid on anything, never dark on mid (section 4). If the scene
   behind a line is busy, put the line on a flat paper or ink band.
4. **Show the game, not a list of buttons**: a game screen is sprites and a scene (the mole, the board, the crate), with
   text only for what a picture cannot say. A row of text buttons standing in for the play is a prototype, not an app.
5. **A pixel font and few sizes**: games draw text in lopix12 (`sdk/lo-game.js` embeds the glyphs the app uses,
   `LO-GAME.md`); plain HTML screens keep the one font of section 2's skeleton. Use the sizes of section 4 (body,
   secondary, and a title if the screen has one) and no others: three sizes at most on one screen.
6. **One thing per screen**: the first screen shows the game or the tool, not a page of instructions. Teach in one line
   at the moment it matters (a hint the first time, the key legend of section 6), and put the rest behind a help key.

## 12. Check before you submit

1. Open the app in `sdk/dev.html` and in the runtime at the smallest size (331 × 359 with the pad, 331 × 473
   without) and the largest (386 × 738). In desktop browsers use the device toolbar.
2. Nothing is cut off; the main content is visible without scrolling at the smallest size, or it is the one
   scrolling area and scrolls all the way to its last line.
3. Tap every control with a finger-sized target; use every key the footer lists; press the keys it does not list.
4. Read every text at arm's length on a phone. If you squint, it is too small or too low in contrast.
5. Run `node tools/check-app.mjs` (it checks colors, size and the rest of SPEC.md; it cannot check layout).

## 13. A game's play screen: fill the phone

A game whose world has a fixed size (a 160 × 144 mine, a board, a level) still fills the whole app screen during play.
A small fixed square with HTML bars above and below it reads as a prototype. `registry/apps/lao-zhang`
(`src/22-hud.js`, `GM.frameLayout`) is the worked example. These rules come from making it fit on an iPhone.

1. **The world keeps its size and its rules.** Never stretch or reshape the playfield to fit a phone: levels, item
   positions, reach and difficulty would change with the screen. Grow the canvas around the world instead.
2. **One canvas, edge to edge.** The play screen is one `<canvas>` filling the stage, with no HTML bars around it.
   Work out the layout from the stage's size, in canvas pixels, with `k` CSS pixels to a canvas pixel:
   - Normally the world's width fills the stage's width (`k = w / worldW`). The canvas is as many rows as the height
     allows, and the rows over the world's height become scenery: sky above, bedrock or a floor below.
   - When the stage is too short for that (Safari's bars leave as little as **348 × 323**, shorter than the
     331 × 359 the handheld promises), fit by height instead and make the canvas **wider** than the world. The
     extra columns at the sides carry the world's edge on: the same sky, ground line and dirt, with no items, and
     out of the hook's or player's reach. A wide desktop window works the same way.
   - Paper (or any flat bars) beside or under the canvas is the bug this section is about.
3. **Size the canvas from the exact box, and round toward covering.** Read the stage with
   `getBoundingClientRect()`, whose sizes can be fractional on an iPhone. Set the canvas's CSS size to
   `W * k` and `H * k` without rounding: a rounded width left a one-pixel line of paper down each side in the
   home-screen app. Round the canvas's rows *up* (`Math.ceil`), so the stage cuts off part of a row rather than
   leaving a gap, and centre the canvas in a stage with `overflow: hidden`.
4. **Fit again whenever the stage changes, not only on `resize`.** On the iPhone the page can be sized after the app
   starts, with no resize event afterwards, so the game kept its first, too-small size. Compare the stage's
   `clientWidth` / `clientHeight` with the last fit on every animation frame, and fit again when they differ (it
   costs two reads a frame). Setting `canvas.height` clears the canvas, so redraw straight after a fit.
5. **The scoreboard is drawn in the scenery, not on the world.** Paint level, score, target, time and items into
   the extra sky with the app's pixel font (lopix12, at 1x and 2x). Keep it outside the world's own rows, so nothing
   in the world (a rival, a speech bubble, a label) can cover it or be covered by it. Plan the rows it needs:
   - full: a label, the number at 2x and a gauge, about 56 canvas rows;
   - slim: one line of about 18 rows, for when the screen is short.
   Check the screens where the most is on screen at once (lao-zhang: level 11, with Old Wang and his taunts).
6. **Use the leftover space for something that plays along.** On tall phones, lao-zhang's bedrock band has mine carts
   that fill as the level's cash comes in, one for the player and one for the rival. Blank bands read as unfinished.
   Keep such extras for the screen sizes that have room for them, and skip them on the smallest.
7. **Count progress within the level.** When the score runs over the whole game, a gauge of score / target opens
   nearly full on later levels. Remember the score when the level started, and count from that.
8. **Teach the keys when the level opens**, in the tip box over the world, not in a key line under it all game.
9. **Paint with `putImageData` into ImageData only.** Put the world at its offset (`x0`, the sky's height) and each
   band at its own position. Never `drawImage` one canvas onto another (Safari swaps red and blue on that path).
   Repaint a band only when what it shows changes: build a key from its values and compare it with the last one.
10. **Test the layout as numbers, then look.** Write a unit test that the layout covers the stage edge to edge
    (`W * k >= w`, `H * k >= h`, less than one canvas pixel over) for 331 × 359, 346 × 518, 386 × 606, a Safari-short
    stage (348 × 323) and a wide window. Then take screenshots at those sizes in `sdk/dev.html`, and try the app in
    both Safari and the home-screen app on an iPhone: they differ.

## Mistakes seen in this repo, and the fix

| Mistake | Fix |
|---|---|
| A test app with three big buttons and the result in a small scrolling box below them, plus a chin pad it did not need | No pad; the result is `main` and scrolls; the buttons go in the header in one row |
| A catalogue whose Left/Right changed a level on some rows and jumped sections on others | Left/Right only change the level; SELECT goes to the next group |
| A two-column button grid where every arrow moved to the next button in reading order: Down went right, and the lower rows sat below the fold | Keep the screen fixed, use 4 buttons in a 2×2 grid, and make Up/Down move a row (section 5) |
| Hints in 12 px dark text on paper | 13 px or more, or ink |
| A gem or pickup chirp on a square wave, climbing to 1.8 kHz; it stings after the tenth haul at full volume | Drop an octave, use `triangle`, keep the top note under 1.2 kHz and soften `vol` (section 7) |
| A game played in a fixed square with HTML stat bars above and below, and paper at the sides in Safari | One canvas over the whole stage: the world at full width, the scoreboard in the extra sky, wider scenery when short (section 13) |
| A canvas sized once at start, and to rounded pixels: thin paper lines down both sides on an iPhone | Fit from `getBoundingClientRect()` without rounding, rows rounded up, and fit again on any frame where the stage's size changed (section 13) |
