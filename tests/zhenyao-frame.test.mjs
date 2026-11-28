// registry/apps/zhenyao-tower: the shrine frame around the 3D window (src/frame.js).
// The painter is pure, so the layout and the tones can be checked without a browser: at every stage
// size the frame covers the stage edge to edge, keeps the whole-pixel view inside it, and leaves no
// blank paper. The live DOM (inert frame taps, the view on top) is in tests/e2e-zhenyao-frame.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read, runScript } from "./helpers.mjs";

const ctx = runScript("sdk/lo-game.js");
vm.runInContext(read("registry/apps/zhenyao-tower/src/frame.js"), ctx, { filename: "src/frame.js" });
const Frame = ctx.ZTFrame;
const INK = 0, PAPER = 3;

const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];
const DPRS = [1, 3];

/* the largest square of bare paper outside the window: no blank paper, only highlights on the frame */
function largestPaperBlock(w, h, view) {
  const x0 = Math.round(view.x), y0 = Math.round(view.y);
  const x1 = Math.round(view.x + view.w), y1 = Math.round(view.y + view.h);
  const inView = (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
  const buf = Frame.paint(w, h, view), dp = new Uint16Array(w * h);
  let best = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (inView(x, y) || buf[y * w + x] !== PAPER) continue;
    const a = x > 0 ? dp[y * w + x - 1] : 0;
    const b = y > 0 ? dp[(y - 1) * w + x] : 0;
    const c = x > 0 && y > 0 ? dp[(y - 1) * w + x - 1] : 0;
    const n = 1 + Math.min(a, b, c);
    dp[y * w + x] = n;
    if (n > best) best = n;
  }
  return best;
}

for (const [w, h] of SIZES) for (const dpr of DPRS) {
  test(`frame: ${w}x${h} at dpr ${dpr} fills the stage around a whole-pixel window`, () => {
    const v = Frame.viewRect(w, h, dpr);
    /* centred and inside */
    assert.ok(v.x > 0 && v.y > 0, "a margin on every side");
    assert.ok(v.x + v.w <= w && v.y + v.h <= h, "the window is inside the stage");
    assert.ok(Math.abs(v.x - (w - v.w) / 2) <= 0.5, "centred across");
    assert.ok(Math.abs(v.y - (h - v.h) / 2) <= 0.5, "centred down");
    /* the game's own 160 x 144 buffer is scaled to whole CSS pixels, never stretched to the stage */
    assert.equal(v.w, Math.round(160 * v.k), "the window width follows the scale");
    assert.equal(v.h, Math.round(144 * v.k), "the window height follows the scale");
    assert.ok(Number.isInteger(v.w) && Number.isInteger(v.h), "no fractional window size");
    assert.ok(v.k >= 1, "the window is not shrunk below its own pixels");

    const buf = Frame.paint(w, h, v);
    assert.equal(buf.length, w * h);
    for (const tone of buf) assert.ok(tone >= INK && tone <= PAPER, `tone ${tone} is one of the four`);
    /* the outermost pixel is the frame's ink band, not a stripe of bare paper */
    for (let x = 0; x < w; x++) {
      assert.equal(buf[x], INK, `top edge at ${x}`);
      assert.equal(buf[(h - 1) * w + x], INK, `bottom edge at ${x}`);
    }
    for (let y = 0; y < h; y++) {
      assert.equal(buf[y * w], INK, `left edge at ${y}`);
      assert.equal(buf[y * w + w - 1], INK, `right edge at ${y}`);
    }
    /* paper is an ornament (the plaque, lantern panes, ofuda), never a blank field */
    const x0 = Math.round(v.x), y0 = Math.round(v.y), x1 = Math.round(v.x + v.w), y1 = Math.round(v.y + v.h);
    let paper = 0, outside = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      outside++;
      if (buf[y * w + x] === PAPER) paper++;
    }
    assert.ok(paper / outside < 0.12, `${(paper / outside * 100).toFixed(1)}% paper outside the window`);
    assert.ok(largestPaperBlock(w, h, v) <= 12, "no blank paper block");
    /* the shrine's name board is painted in the top margin at every size */
    let topPaper = 0;
    for (let y = 0; y < y0; y++) for (let x = 0; x < w; x++) if (buf[y * w + x] === PAPER) topPaper++;
    assert.ok(topPaper > 100, "the plaque is in the top margin");
  });
}
