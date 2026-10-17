# Lo-PDA app UI: rules that make a small screen work

Read this before laying out any app screen. The rules are concrete on purpose: follow them as written and
the app will be usable on every phone the handheld runs on. Games that draw everything on one canvas still
need sections 1, 2, 5 and 9; `LO-GAME.md` covers the rest for them.

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
- Short labels, like an old device: "存档", "SAVE", not sentences.

## 5. The cursor (apps with `"buttons": true`)

- One thing is selected at all times, drawn **inverted** (ink background, paper text). Never only an outline
  or a small arrow: those vanish on a bright screen.
- Up and Down move the selection; it wraps or stops at the ends, the same in every list of the app.
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
- Show that tilt is live (the ball moves, a small level mark) and what happens when it is not: `"denied"` or `"none"`
  quietly falls back to keys, with one line saying so.
- Turn the microphone on only while the app listens for something (a candle to blow out), and off as soon as it is
  done: while it is on the phone's silent switch does nothing. Say what to do ("对着话筒吹"), and give a key that does
  the same (hold A to blow).

## 10. Check before you submit

1. Open the app in `sdk/dev.html` and in the runtime at the smallest size (331 × 359 with the pad, 331 × 473
   without) and the largest (386 × 738). In desktop browsers use the device toolbar.
2. Nothing is cut off; the main content is visible without scrolling at the smallest size, or it is the one
   scrolling area and scrolls all the way to its last line.
3. Tap every control with a finger-sized target; use every key the footer lists; press the keys it does not list.
4. Read every text at arm's length on a phone. If you squint, it is too small or too low in contrast.
5. Run `node tools/check-app.mjs` (it checks colors, size and the rest of SPEC.md; it cannot check layout).

## Mistakes seen in this repo, and the fix

| Mistake | Fix |
|---|---|
| A test app with three big buttons and the result in a small scrolling box below them, plus a chin pad it did not need | No pad; the result is `main` and scrolls; the buttons go in the header in one row |
| A catalogue whose Left/Right changed a level on some rows and jumped sections on others | Left/Right only change the level; SELECT goes to the next group |
| Hints in 12 px dark text on paper | 13 px or more, or ink |
