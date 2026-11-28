// The paint board's geometry (registry/apps/paint/index.html, <script id="fit">), with no browser:
// a dot is always a whole number of CSS pixels, so no pixel block is 2 px wide and its neighbour 3;
// the board is centred on whole pixels; and the six-sheet strip appears only where it fits, starting
// on the board's left edge, with the larger tabs a tall screen can take.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";

const html = readFileSync(join(ROOT, "registry/apps/paint/index.html"), "utf8");
const src = /<script id="fit">([\s\S]*?)<\/script>/.exec(html)[1];
const PaintFit = new Function(src + "\nreturn PaintFit;")();

/* The stage the app leaves at each size of sdk/UI.md section 1: the app's width less 8 px padding each side,
   and its height less 149 px (8 of padding, 16 of gaps, an 18 px title line, a 15 px message line, the two
   44 px tool rows and the 4 px above the second). The 331x359 and 386x738 stages are also measured in
   tests/e2e-paint.test.mjs; the others keep the layout honest on the phones in between. */
const SIZES = [
  [315, 210, "331x359, the smallest"],
  [330, 369, "346x518 with the chin pad"],
  [315, 324, "331x473 without the pad"],
  [330, 501, "346x650 without the pad"],
  [370, 457, "386x606 with the chin pad"],
  [370, 589, "386x738, the largest"],
];

test("paint: the smallest screen draws two CSS px a dot, the largest three", () => {
  const small = PaintFit.plan(315, 210);
  assert.equal(small.scale, 2);
  assert.equal(small.sheet, 192, "96 x 2");
  assert.equal(small.box, 198, "and the 3 px ink frame each side");

  const large = PaintFit.plan(370, 589);
  assert.equal(large.scale, 3);
  assert.equal(large.sheet, 288, "96 x 3");
  assert.equal(large.box, 294);

  for (const L of [small, large]) {
    assert.ok(Number.isInteger(L.scale), `a whole scale (${L.scale})`);
    assert.equal(L.sheet, 96 * L.scale, "every one of the 96 columns is the same width");
    assert.equal(L.box, L.sheet + 6, "the frame is beside the dots, not part of them");
  }
});

for (const [w, h, where] of SIZES) {
  test(`paint layout: ${where} fits without scrolling`, () => {
    const L = PaintFit.plan(w, h);
    assert.ok(Number.isInteger(L.scale) && L.scale >= 1, `whole scale k=${L.scale}`);
    assert.equal(L.sheet % 96, 0);
    assert.ok(Number.isInteger(L.left) && Number.isInteger(L.top), "the board starts on a whole pixel");
    assert.ok(L.left >= 0 && L.left + L.box + 4 <= w, `the board and its shadow fit across (${L.left}+${L.box})`);
    const block = L.box + 4 + (L.strip ? 8 + L.tab : 0);
    assert.ok(L.top >= 0 && L.top + block <= h, `the block fits down (${L.top}+${block} of ${h})`);
    /* centred: the paper each side of the shadowed board is at most a pixel apart */
    assert.ok(Math.abs((w - (L.box + 4)) / 2 - L.left) <= 1, "the board is centred across");
  });
}

test("paint: the six-sheet strip appears only where it fits under the whole-scale board", () => {
  assert.equal(!!PaintFit.plan(315, 210).strip, false, "331x359 keeps the board alone, as before");
  assert.equal(!!PaintFit.plan(315, 324).strip, false, "331x473 still has no room for the strip");
  assert.equal(!!PaintFit.plan(370, 589).strip, true, "386x738 shows all six sheets");
  assert.equal(!!PaintFit.plan(370, 457).strip, true, "386x606 too");
  /* 6 x 52 + 5 x 4 = 332 px plus the board's 36 px left edge still fits 370: the big tabs */
  const big = PaintFit.plan(370, 589);
  assert.equal(big.tab, 52);
  assert.equal(big.preview, 48, "exactly half of 96");
  assert.equal(big.gap, 4);
  assert.equal(big.stripWidth, 332);
  assert.equal(big.stripLeft, big.left, "the strip starts on the board's left edge");
  assert.ok(big.stripLeft + big.stripWidth <= 370, "and ends inside the stage");
  /* 6 x 44 + 5 x 8 = 304 px is the fallback where 332 does not fit beside the board */
  const mid = PaintFit.plan(330, 369);
  assert.equal(mid.tab, 44);
  assert.equal(mid.preview, 40);
  assert.equal(mid.stripWidth, 304);
  assert.equal(mid.stripLeft, mid.left);
  assert.ok(mid.stripLeft + mid.stripWidth <= 330);
  /* 304 px still needs a stage that is wide enough: 300 leaves the strip out, not the drawing */
  const narrow = PaintFit.plan(300, 900);
  assert.equal(narrow.scale, 3, "the board still gets its 3 px dots");
  assert.equal(narrow.strip, null, "but no strip across 300 px");
  assert.ok(narrow.left + narrow.box + 4 <= 300);
  assert.equal(narrow.tab, 0);
});

test("paint: a stage too small for 2 px dots still gets a 1 px board, on the screen", () => {
  const L = PaintFit.plan(150, 150);
  assert.equal(L.scale, 1, "96 x 1");
  assert.equal(L.sheet, 96);
  assert.equal(L.left, 22);
  assert.equal(L.top, 22);
  assert.equal(L.strip, null);
});
