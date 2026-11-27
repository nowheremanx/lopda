# lo-title: the shared title screen

`sdk/lo-title.js` (MIT) draws an app's first screen the same way in every app: the cover picture with the name
drawn into it (UI.md section 11.1), and under it a menu that turns like a wheel. The chosen item sits big in an ink
band with one line of detail under it ("Level 3 · $1,200", "0 / 30 cleared"); the items before and after it show
small above and below. Up and Down roll the wheel, A or START picks; on touch, a tap on the band picks, a tap on a
small item rolls to it, and a finger dragged up or down turns it. One line under the wheel can hold a record or a
save warning, and the key line sits at the bottom.

Use it for the title of a game or a story (three to five items). Long lists, round pickers and shops are not wheels.

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
     items: [
       { label: "继续", sub: "第 3 关 · $1,200" },
       { label: "随机关", sub: "通关 30 关后开放", locked: true },
       { label: "玩法" }
     ],
     index: 0,
     note: "最高 第 5 关",                       // optional: a record or a warning
     hint: "↑↓ 选　A 确定",
     onMove: function (i) { PAD.sfx("move"); },
     onPick: function (i) { /* open item i; for a locked one, PAD.sfx("err") */ }
   });
   PAD.on("press", function (b) { if (onTitle) menu.press(b); });
   ```

   `menu.set({items, index, note})` changes the text later (say, once the save is read); `menu.index()` is the item in
   the band. A canvas that leaves the page is forgotten on the next resize.

## The layout

- The picture is as large as fits in whole device pixels per picture pixel, so it stays sharp; it is centred with
  the wheel in the room above the note and the key line.
- The band spans the screen; a detail line too long for it ends in "...".
- Small screens show one item above and below the band, tall screens with more than three items show two.
- Every pixel is one of the four tones, written with `putImageData` (no `drawImage`, UI.md section 9).

`registry/apps/lao-zhang` is the example.
