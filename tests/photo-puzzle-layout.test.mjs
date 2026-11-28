// The screen layout of registry/apps/photo-puzzle/src/layout.js (sdk/UI.md 13): the canvas covers the stage edge to
// edge with no paper left over, the photo stays 128 x 112 at a whole number of CSS pixels an art pixel, the status
// and caption bands never cut into it, and the play card (status, photo, caption) is centred on the page while a
// menu screen keeps its header and footer at the edges and centres the photo between them.
// Sizes: the handheld's smallest and largest, the tall phones, and the short stage Safari's bars can leave.
// No browser needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read } from "./helpers.mjs";

const rel = "registry/apps/photo-puzzle/src/layout.js";
const ctx = vm.createContext({});
vm.runInContext(read(rel), ctx, { filename: rel });
const PZ = ctx.PZ;

const SIZES = [
  [331, 359, "iPhone SE with the chin pad"],
  [346, 518, "iPhone 14/15/16 with the chin pad"],
  [386, 650, "a tall stage"],
  [348, 323, "Safari with its bars"],
  [386, 738, "iPhone Pro Max without the pad"],
];

/* the two ways the bands are measured: during play the message is part of the bottom band; on a menu screen the
   sheet floats over the board, so only the header and the footer take rows */
const BANDS = {
  play: [28, 45, false],
  short: [24, 40, false],
  menu: [30, 20, true],
};

for (const [name, [top, bottom, overlay]] of Object.entries(BANDS)) {
  for (const [w, h, where] of SIZES) {
    test(`photo-puzzle layout (${name}): ${w}x${h} ${where}`, () => {
      const L = PZ.fit(w, h, top, bottom, overlay);
      assert.ok(Number.isInteger(L.k) && L.k >= 1, `whole scale k=${L.k}`);
      assert.ok(Number.isInteger(L.x0) && Number.isInteger(L.y0), "the photo starts on a whole art pixel");
      /* the canvas covers the stage: never rounded down, and less than one art pixel over */
      assert.ok(L.cssW >= w && L.cssH >= h, `canvas ${L.cssW}x${L.cssH} covers ${w}x${h}`);
      assert.ok(L.cssW - w < L.k && L.cssH - h < L.k, `canvas overhangs by less than one art pixel`);
      /* the largest whole scale that fits the photo between the bands */
      const byW = Math.floor(w / 128), byH = Math.floor((h - top - bottom - 2 * PZ.GAP) / 112);
      assert.equal(L.k, Math.max(1, Math.min(byW, byH >= 1 ? byH : 1)));
      /* the photo is whole, inside the canvas, and clear of both bands */
      assert.ok(L.x0 >= 0 && L.x0 + L.picW <= L.W, "the photo fits across");
      assert.ok(L.y0 * L.k >= L.photoTop - L.k, "the photo starts on its measured row");
      assert.ok(L.y0 + L.picH <= L.H, "the photo's rows are in the canvas");
      assert.ok(L.photoTop >= top, "the status band is above the photo");
      assert.ok(L.photoBottom + bottom <= h + 1, "the caption band has room below the photo");
      if (overlay) {
        assert.equal(L.padTop, 0);
        assert.equal(L.padBottom, 0);
        assert.ok(L.y0 >= L.topRows, "the photo is below the header");
        assert.ok(L.y0 + L.picH <= L.H - L.botRows, "the photo is above the footer");
      } else {
        /* the card is centred: the two page margins plus the card are exactly the stage */
        const cardH = top + bottom + 112 * L.k + 2 * PZ.GAP;
        assert.equal(L.padTop + L.padBottom + cardH, h, "the card is the screen and the margins fit exactly");
        assert.ok(Math.abs(L.padTop - L.padBottom) <= 1, "the card is centred");
        assert.equal(L.photoTop, L.padTop + top + PZ.GAP, "the status band sits on the card");
      }
    });
  }
}

test("photo-puzzle layout: the small screen keeps a two-pixel picture, the large one three", () => {
  const small = PZ.fit(331, 359, 28, 45), large = PZ.fit(386, 738, 28, 45);
  assert.equal(small.k, 2, "256 x 224 on the SE");
  assert.equal(large.k, 3, "384 x 336 on the Pro Max");
  assert.ok(large.x0 + 128 <= large.W);
});

test("photo-puzzle layout: a fractional stage box is covered without a line of paper", () => {
  for (const [w, h] of [[331.5, 359.25], [345.5, 517.75], [385.75, 737.5], [347.5, 322.5]]) {
    for (const overlay of [false, true]) {
      const L = PZ.fit(w, h, 28, 45, overlay);
      assert.ok(L.cssW >= w && L.cssH >= h, `${w}x${h}`);
      assert.ok(L.cssW - w < L.k && L.cssH - h < L.k, `${w}x${h} overhang ${L.cssW - w}`);
      assert.ok(L.k * L.W >= w && L.k * L.H >= h);
      assert.ok(L.y0 >= L.topRows && L.y0 + L.picH <= L.H, `${w}x${h} photo inside`);
    }
  }
});

test("photo-puzzle layout: a menu covers the stage from edge to edge", () => {
  for (const [w, h] of SIZES) {
    const L = PZ.fit(w, h, 30, 20, true);
    assert.equal(L.padTop, 0, "the header keeps the top edge");
    assert.equal(L.padBottom, 0, "the footer keeps the bottom edge");
    assert.ok(L.photoTop >= 30 && L.photoBottom <= h - 20 + 1, "the photo is between them");
  }
});

test("photo-puzzle layout: a stage too small for bands still puts the photo on a whole pixel", () => {
  const L = PZ.fit(100, 100, 40, 40);
  assert.equal(L.k, 1);
  assert.ok(L.x0 >= 0 && L.y0 >= 0);
  assert.ok(L.cssW >= 100 && L.cssH >= 100, "the canvas still covers the stage");
  assert.ok(L.y0 + L.picH <= L.H, "the photo is in the canvas even when the card overflows");
});
