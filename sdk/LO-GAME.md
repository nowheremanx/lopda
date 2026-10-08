# lo-game.js

A small game framework for Lo-PDA apps. MIT License. Version 1.2.0.

It gives every game the same base: a four-tone pixel screen, crisp Chinese and English text,
the chin buttons, scenes, dialogue boxes, menus, tile maps and saving. You write
the game; the framework handles the handheld.

**Writing a game with an AI?** Paste this whole file into the conversation, then
describe your game. The assistant only writes your game code; it never retypes
the framework.

---

## 1. Setting up an app

```
registry/apps/<id>/
  manifest.json    "spec": "lopda/1", and "buttons": true if you use the D-pad
  index.html
```

`index.html` has an empty framework block, then your code:

```html
<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><title>My game</title></head>
<body>
<script data-lo-game="1.2.0"></script>
<script>
var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
var T = game.t;
game.scene("main", {
  update: function (dt) { if (game.pressed("a")) game.sfx("tap"); },
  draw: function (g) { g.clear(g.PAPER); g.text(T({ zh: "你好", en: "Hello" }), 80, 64, { align: "center" }); }
});
game.start("main");
</script>
</body>
</html>
```

Then fill in the framework and check the app:

```sh
node tools/bundle-app.mjs registry/apps/<id>  # (lo-game.mjs is the same tool) copies sdk/lo-game.js in, adds the pixel-font block
node tools/check-app.mjs registry/apps/<id>   # verifies the copy is unmodified
```

While developing, `sdk/dev.html?app=registry/apps/<id>` fills an empty block by
itself, so you can edit and reload without running the tool.

Do not edit the framework inside your app. The checker rejects a modified copy.
That keeps review short: reviewers read your game, not the framework.

`sdk/template-game/` is a complete small example: a title menu, walking on a tile
map, talking to a cat, a choice, picking up an item, and saving, in Chinese and English.

## 2. The screen

- `LoGame.create({ width, height, lang })`. `lang` is your game's own language
  (`"zh"`, the default, or `"en"`), used when the runtime does not say (section 7.1). The default size is 160×144, the size of a Game Boy
  screen. Any size works; keep it small. The framework scales it to fit with even
  pixels and fills the rest of the screen with paper.
- Every pixel is one of four tones. Use the numbers, not colours:

| Name | Value | Hex |
|---|---|---|
| `g.INK` | 0 | `#1f2a14` |
| `g.DARK` | 1 | `#4a5a32` |
| `g.MID` | 2 | `#7d8a58` |
| `g.PAPER` | 3 | `#a3ad7e` |

- Draw everything in `draw(g)`. The screen is not cleared for you.

## 3. Drawing: `g`

All positions are in screen pixels. Numbers are rounded.

```js
g.clear(tone)                         // fill the screen (default PAPER)
g.rect(x, y, w, h, tone)              // filled rectangle
g.frame(x, y, w, h, tone)             // 1-pixel outline
g.pixel(x, y, tone)
g.line(x0, y0, x1, y1, tone)
g.circle(cx, cy, r, tone, fill)       // fill: true for a disc
g.dither(x, y, w, h, tone, level)     // level 0-4: 2 is a checkerboard, for shading
g.sprite(s, x, y, { flip, flipY, color, map })
                                      // color: paint every pixel one tone (silhouettes, hit flashes)
                                      // map: [a,b,c,d] swaps tones 0-3
g.text(str, x, y, { color, align, width, shadow })  // returns the height drawn
                                      // align "center"/"right": around x, or inside width if given
                                      // width: wraps lines (Chinese wraps by character)
g.measure(str)                        // width in pixels
g.wrap(str, width)                    // -> array of lines
g.lineHeight                          // 14 with the default 12-pixel font
g.window(x, y, w, h, { thin })        // the standard box: paper inside, ink border
g.arrow(x, y, "right" | "down", tone) // small triangle, for menus
g.origin(x, y)                        // shift everything drawn after this; g.origin(0, 0) to reset
g.clip(x, y, w, h)                    // only draw inside; g.clip() to reset
g.get(x, y)                           // tone at a pixel, or null
```

Text uses lopix12, a 12-pixel bitmap font (derived from Fusion Pixel Font,
SIL OFL 1.1). The tool copies in only the characters your app's text contains,
plus all of ASCII, so a typical game carries a few hundred glyphs (10-20 KB).
**Run the tool again whenever you add new text**, or new characters fall back to
the phone's own font, which is blurrier. `LoGame.create({ font: { system: true } })`
forces the phone's font. About 13 Chinese characters fit across 160 pixels.

## 4. Sprites and maps

```js
var hero = LoGame.sprite([      // any size; every row the same length
  "..0000..",                   // 0 ink, 1 dark, 2 mid, 3 paper, . clear
  ".011110.",
  "..0110..",
]);
var ART = LoGame.sprites({ hero: [...], tree: [...] });   // many at once

var map = LoGame.tilemap({
  size: 8,                                     // tile size in pixels
  tiles: { ".": ART.grass, "#": ART.wall },    // one character per tile
  solid: "#",                                  // characters you cannot walk through
  map: ["#####", "#...#", "#####"]
});
map.draw(g, camX, camY)       // draws only what is on screen
map.get(tx, ty)               // character at a tile, null outside
map.set(tx, ty, ch)
map.solid(tx, ty)             // true for solid tiles and outside the map
map.find("D")                 // -> [{x, y}] every tile with that character
map.at(px, py)                // pixel position -> tile {x, y}
map.width, map.height         // in pixels

var cam = LoGame.camera(px, py, viewW, viewH, map.width, map.height)  // -> {x, y}, keeps px,py centred
```

Animate by picking a frame from the clock: `frames[Math.floor(game.time * 6) % frames.length]`.

## 5. Scenes

```js
game.scene("battle", {
  enter: function (args) {},   // when the scene starts
  update: function (dt) {},    // 60 times a second, dt = 1/60
  draw: function (g) {},       // once per screen refresh
  exit: function () {}
});
game.start("title");                       // first scene
game.go("battle", args)                    // switch scenes with a fade; returns a Promise
game.go("battle", args, { fade: false })
game.go("battle", args, { to: g.INK })     // fade through black instead of paper
```

Overlays sit on top of the current scene. Only the top one updates; all of them draw.

```js
game.push(sceneOrName, args)  // -> Promise of whatever game.pop(value) passes
game.pop(value)
game.top()                    // the scene that is updating now
```

`game.go` clears timers and tweens. Promises from `game.wait` that are pending at
that moment never resolve, so don't wait across a scene change.

## 6. Input

```js
game.btn("left")        // held now
game.pressed("a")       // went down this frame (never missed, even a very quick tap)
game.released("a")
game.repeat("down")     // on press, then every 0.09 s after 0.32 s held: for menus
game.dir()              // {x, y}: -1, 0 or 1 from the D-pad, with repeat
game.ok()               // A, START or a tap on the screen
game.pointer            // {x, y, down, pressed, released} in screen pixels
```

Buttons: `up down left right a b start select`. On Lo-PDA they come from the chin
(set `"buttons": true` in the manifest). The keyboard works too: arrows, X = A,
Z = B, Enter = START, Shift = SELECT. Say on your first screen which button does what.

## 7. Dialogue and menus

Both pause the scene underneath and return Promises, so a story reads top to bottom:

```js
async function talkToCat() {
  await game.say(["喵。", "一只橘猫看着你。"], { name: "猫" });
  var i = await game.choose(["摸摸它", "走开"]);
  if (i === 0) await game.say("它呼噜呼噜。");
}
```

- `game.say(text or [pages], { name, top, lines, speed, blip })` types the text out.
  A or a tap shows the whole page, then turns it. Long text pages itself.
  `name` puts a name tag on the box, `top: true` moves the box to the top,
  `speed` is characters per second (40), `blip: false` turns off the typing sound.
- `game.choose(items, { title, x, y, width, index, cancel })` resolves with the
  chosen index, or -1 when the player presses B (`cancel: false` disables that).

Set a `busy` flag of your own while a script runs, so a held D-pad doesn't walk
the hero between two lines.

### 7.1 Two languages

Lo-PDA runs in Chinese or English. Bilingual games are recommended, not required.
Write each piece of text once with both languages and let `game.t` pick:

```js
var T = game.t;
await game.say([T({ zh: "喵。", en: "Mew." }), T({ zh: "一只橘猫看着你。", en: "A ginger cat watches you." })],
               { name: T({ zh: "猫", en: "Cat" }) });
var i = await game.choose([T({ zh: "摸摸它", en: "Pet it" }), T({ zh: "走开", en: "Leave" })]);
g.text(T({ zh: "分 {n}", en: "PTS {n}" }, { n: score }), 4, 2);   // {name} is filled from the second argument
```

- `game.t(text, vars)`: `text` is `{zh, en}` or a plain string (passed through).
  It picks `PAD.lang`; on runtimes that don't set it, the `lang` you gave `create`;
  when an entry is missing, whichever language is there.
- `game.lang` is the language in use, `"zh"` or `"en"`. It does not change while the
  game runs; switching language in Settings starts the game again.
- `LoGame.t(text, vars)` does the same outside a game (it uses `PAD.lang`, else `zh`).
- English takes more room than Chinese: about 26 letters fit across 160 pixels.
  Keep it terse, and look at both languages before you publish.
- The font block holds the glyphs of both languages, since both are in your source.
- Add `"i18n": {"en": {"name": "...", "description": "..."}}` to the manifest so the
  store shows your game in the player's language.

## 8. Time, motion, effects

```js
game.time, game.frame                 // seconds and frames since start
game.after(sec, fn)                   // -> cancel function
game.every(sec, fn)                   // -> cancel function
await game.wait(sec)
await game.tween(obj, { x: 40 }, 0.3, "out")   // eases: linear, in, out, inOut
await game.fade("out" | "in", sec, tone)
game.flash(sec)                       // invert the screen briefly: hits, pickups
game.shake(pixels, sec)
```

## 9. Sound and saving

```js
game.sfx("hit")      // tap tick move ok err hit miss coin win lose
game.save("slot1", { hp: 30, x: 4 })  // any JSON value, up to 256 KB per app
var v = await game.load("slot1")      // null when nothing was saved
game.remove("slot1")
```

Sounds follow the player's volume and mute settings. Save at meaningful moments
(a save point, a level cleared), not every frame.

## 10. Helpers

```js
LoGame.clamp(v, min, max)
LoGame.lerp(a, b, t)
LoGame.approach(v, target, step)
var r = LoGame.rng(seed)    // r.next() 0..1, r.int(a, b), r.pick(array), r.chance(p)
```

## 11. Rules that still apply

Everything in `SPEC.md` holds: one HTML file up to 512 KB with the framework
included (it is about 28 KB), no network, no `eval`, no emoji, short text in Chinese,
English or (recommended) both, and a first screen that says how to play.
