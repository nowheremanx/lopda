# lo-title: the shared title screen

`sdk/lo-title.js` (MIT) draws an app's first screen the same way in every app, the fog title: the cover picture
covers the whole screen edge to edge, a dithered fog rises from the bottom over its lower third, and the menu stands
in the fog as bare words. The chosen item is big, painted like a sign (a paper-to-mid gradient, an ink outline and a
drop shadow); the items before and after it are small and dim. Up and Down roll the menu (it stops at the ends),
A or START picks; on touch, a tap on the big word picks, a tap on a small word rolls to it, and a finger dragged up
or down turns it. An ink bar at the bottom holds one live line and the keys. There are no detail lines under the
items: what an item needs to say goes on the bar.

Use it for the title of a game or a story (two to five items). Long lists, round pickers and shops are not this menu.

## Put it in an app

1. Keep an empty block before your own scripts, and run the bundler:

   ```html
   <script data-lo-title="0.1.0"></script>
   ```

   `node tools/bundle-app.mjs registry/apps/<id>` fills it with the released copy and writes a `data-lo-font` block
   with the lopix12 glyphs your app uses (one block feeds both lo-game and lo-title when an app has the two).
   The checker accepts only unmodified released copies (`sdk/lo-title.versions.json`).

2. Give it a canvas sized by your CSS (the whole screen, or what is left under a top bar), and your picture as
   tone indices:

   ```js
   var menu = LoTitle.mount(document.getElementById("title"), {
     art: { w: 156, h: 156, px: tones },        // Uint8Array, 0 paper, 1 mid, 2 dark, 3 ink, row by row
     title: { text: "矿工老张", sub: "钩金子", x: 17, y: 6, w: 86 },
     items: [
       { label: "继续", status: "第 3 关 · $1,200" },
       { label: "随机关", locked: true, reason: "通关 30 关后开放" },
       { label: "玩法" }
     ],
     index: 0,
     note: "最高 第 5 关",
     hint: "选 · A 确定",
     onMove: function (i) { PAD.sfx("move"); },
     onPick: function (i) { /* open item i */ },
     onLocked: function (i) { PAD.sfx("err"); }
   });
   PAD.on("press", function (b) { if (onTitle) menu.press(b); });
   ```

   `menu.set({items, index, note})` changes the text later (say, once the save is read); `menu.index()` is the chosen
   item. A canvas that leaves the page is forgotten on the next resize.

## The options

| option | what it is |
| --- | --- |
| `art` | the picture, `{w, h, px}` tone indices. Leave the app's name out of it when you pass `title`. |
| `title` | optional `{text, sub?, x?, y?, w?}`: the name painted into the sky, four LCD pixels a font pixel (fewer when it is wider than `w`), and `sub` under it at half that size. `x`, `y`, `w` are in picture pixels; without `x` the name is centred. |
| `items` | `[{label, status?, locked?, reason?}]`. `status` is the bar's line while that item is chosen (a run's level and cash). A `locked` item is a tone darker with a padlock; picking it shakes the word, shows `reason` on the bar for 1.5 s and calls `onLocked`, never `onPick`. |
| `index` | the chosen item at first. |
| `note` | the bar's line while the chosen item has no `status` (a record, a save warning). |
| `hint` | the keys, drawn after the up and down arrows this file draws (so leave the arrows out of the text). |
| `maxScale` | optional: the largest size of the big word, in LCD pixels a font pixel. Without it the word is as big as fits, at most 6. |
| `calm` | optional: the picture row from which the menu may cover it (default two thirds down). |
| `onMove(i)`, `onPick(i)`, `onLocked(i)` | item `i` became the chosen one; was picked; was picked but is locked. Play the sounds here. |

## The layout

- The picture is as wide as the screen in whole device pixels a picture pixel (cropped evenly at the sides), so it
  never wobbles; on a screen taller than the picture, dark ground goes on under it.
- The fog starts a little above the calm row and is near ink behind the menu, so the words read on any picture.
  Draw the picture with its lower third calm (ground, water, a floor) and keep the name and the subject in the upper
  two thirds. The menu stands between the calm row and the bar when there is room, else it hangs off the bar.
- The big word is as large as fits the width while the menu keeps off the picture's upper 40 percent; `maxScale`
  caps it.
- Every pixel is one of the four tones, written with `putImageData` (no `drawImage`, UI.md section 9). Frames run
  only while something moves.

`registry/apps/lao-zhang` is the example.
