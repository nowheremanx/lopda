// registry/apps/vector-dream 0.5.0: the toy (the 160 x 144 3D buffer) sits in the stage at the largest whole-pixel
// scale that fits, centred, and the rest of the stage is its dark room (grid, bezel and stand). The canvas covers the
// stage edge to edge with no paper; every view put is an exact K x K copy of the 160 x 144 buffer, so the picture
// itself is untouched (tests/vecdream-frames.test.mjs still pins its 145 frames).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";
import { vecdream } from "./frame-hashes.mjs";

const FILE = join(ROOT, "registry", "apps", "vector-dream", "index.html");
const W = 160, H = 144;
/* sdk/UI.md section 1 and 13: the smallest (chin pad), the two modern phones without a pad, Safari-short, the largest */
const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];
const TONE = { "31,42,20": 0, "74,90,50": 1, "125,138,88": 2, "163,173,126": 3 };
const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 16);

function pad() {
  return { lang: "zh", on() {}, off() {}, isDown() { return false; }, sfx() {} };
}
/* a snapshot of every put: the app reuses its ImageData, so the pixels must be copied in the callback */
function launch(w, h) {
  const puts = [];
  const app = boot(FILE, {
    pad: pad(), stage: { w, h },
    onPut: (img, x, y) => puts.push({ data: Uint8Array.from(img.data), x, y, w: img.width, h: img.height })
  });
  return { app, puts, state: () => app.ctx.get("window").VECDREAM.state(),
    fit: (sw, sh) => app.ctx.get("window").VECDREAM.fit(sw, sh),
    run: (n) => { for (let i = 0; i < n; i++) app.frame(); } };
}
const toneAt = (data, w, x, y) => TONE[data[(y * w + x) * 4] + "," + data[(y * w + x) * 4 + 1] + "," + data[(y * w + x) * 4 + 2]];

/* The pinned 145-frame script, run on a real phone stage: every 2x view put, reduced back to 160 x 144, hashes
   exactly like the fixture. This is the crop comparison the frame-hash test's 1x run cannot show. */
test("vector-dream fill: all 145 pinned frames are the same picture at 2x", () => {
  const want = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "vecdream-frames.json"), "utf8"));
  const buf = Buffer.alloc(W * H * 4), hashes = [];
  vecdream(FILE, { stage: { w: 331, h: 359 }, onPut: (img) => {
    if (img.width !== 320 || img.height !== 288) return;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * 2 * 320 + x * 2) * 4, o = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) buf[o + c] = img.data[i + c];
    }
    hashes.push(sha(buf));
  } });
  assert.equal(hashes.length, want.length, "one view put a frame");
  const bad = want.findIndex((h, i) => h !== hashes[i]);
  assert.ok(bad < 0, `frame ${bad} at 2x is not the pinned frame (${want[bad]} vs ${hashes[bad]})`);
});

test("vector-dream fill: the toy is the largest whole-pixel copy that fits, centred in a canvas that covers the stage", () => {
  const { fit } = launch(W, H);
  for (const [w, h] of SIZES) {
    const L = fit(w, h);
    assert.ok(Number.isInteger(L.k) && L.k >= 1, `${w}x${h}: k ${L.k} is not a whole number`);
    assert.equal(L.vw, W * L.k, `${w}x${h}: the view is not W * k wide`);
    assert.equal(L.vh, H * L.k, `${w}x${h}: the view is not H * k tall`);
    assert.ok(L.vw <= w && L.vh <= h, `${w}x${h}: the ${L.vw}x${L.vh} view does not fit`);
    assert.ok(L.vw + W > w || L.vh + H > h, `${w}x${h}: ${L.vw + W}x${L.vh + H} would also have fitted, so k is not the largest`);
    /* the canvas covers the stage, and goes past it by less than one canvas pixel (the stage cuts the last row) */
    assert.equal(L.cw, Math.ceil(w), `${w}x${h}: canvas columns`);
    assert.equal(L.ch, Math.ceil(h), `${w}x${h}: canvas rows`);
    assert.ok(L.x >= 0 && L.y >= 0 && L.x + L.vw <= L.cw && L.y + L.vh <= L.ch, `${w}x${h}: the view is cut`);
    assert.ok(L.cw - L.vw - L.x - L.x <= 1, `${w}x${h}: the view is not centred across`);
    assert.ok(L.ch - L.vh - L.y - L.y <= 1, `${w}x${h}: the view is not centred down`);
    assert.equal(L.ui, w >= 360 ? 15 : 13, `${w}x${h}: the HUD size`);
  }
});

test("vector-dream fill: the app fits that layout on every phone, with the canvas edge to edge", () => {
  for (const [w, h] of SIZES) {
    const v = launch(w, h);
    v.run(2);
    const L = v.state().layout, want = v.fit(w, h);
    for (const key of ["k", "vw", "vh", "x", "y", "cw", "ch", "ui"]) assert.equal(L[key], want[key], `${w}x${h}: ${key}`);
    assert.ok(L.ui >= 13, `${w}x${h}: HUD text under 13 px`);
  }
});

test("vector-dream fill: the room covers the stage, uses the four tones, and leaves no paper around the toy", () => {
  for (const [w, h] of SIZES) {
    const v = launch(w, h);
    v.run(2);
    const L = v.state().layout;
    const room = v.puts.find((p) => p.w === L.cw && p.h === L.ch);
    assert.ok(room, `${w}x${h}: no room was painted`);
    assert.equal(room.x, 0); assert.equal(room.y, 0);
    const counts = [0, 0, 0, 0];
    for (let y = 0; y < room.h; y++) for (let x = 0; x < room.w; x++) {
      const t = toneAt(room.data, room.w, x, y);
      assert.notEqual(t, undefined, `${w}x${h}: room pixel ${x},${y} is not one of the four tones`);
      counts[t]++;
      if (x < L.x || x >= L.x + L.vw || y < L.y || y >= L.y + L.vh) {
        assert.notEqual(t, 3, `${w}x${h}: paper in the room at ${x},${y}`);
      }
    }
    assert.ok(counts[0] > room.w * room.h * 0.5, `${w}x${h}: the room is not a dark void`);
    assert.ok(counts[1] > 20, `${w}x${h}: no grid or stand`);
    assert.ok(counts[2] > 20, `${w}x${h}: no lit bezel edge`);
  }
});

/* The picture itself must be untouched: the view put is the 160 x 144 buffer at exactly K x K, whole pixels, no
   resampling. Run the same frames at 1x and at a phone size and compare every source pixel with its block. */
test("vector-dream fill: every view put is a whole-pixel copy of the 160 x 144 buffer", () => {
  const small = launch(W, H), big = launch(331, 359);
  small.run(9); big.run(9);
  const sb = small.state().layout, bb = big.state().layout;
  assert.equal(sb.k, 1);
  assert.equal(bb.k, 2);
  const ref = small.puts[small.puts.length - 1];
  assert.equal(ref.w, W); assert.equal(ref.h, H);
  const views = big.puts.filter((p) => p.w === bb.vw && p.h === bb.vh);
  assert.equal(views.length, 9, "one view put a frame");
  for (const p of views) {
    assert.equal(p.x, bb.x, "the view is not at the layout's x");
    assert.equal(p.y, bb.y, "the view is not at the layout's y");
  }
  const v = views[views.length - 1];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    for (let dy = 0; dy < bb.k; dy++) for (let dx = 0; dx < bb.k; dx++) {
      const j = ((y * bb.k + dy) * v.w + x * bb.k + dx) * 4;
      assert.equal(v.data[j], ref.data[i], `pixel ${x},${y}: red`);
      assert.equal(v.data[j + 1], ref.data[i + 1], `pixel ${x},${y}: green`);
      assert.equal(v.data[j + 2], ref.data[i + 2], `pixel ${x},${y}: blue`);
      assert.equal(v.data[j + 3], ref.data[i + 3], `pixel ${x},${y}: alpha`);
    }
  }
});
