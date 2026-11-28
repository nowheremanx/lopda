// VecDream's picture and its screensaver behaviour: the auto-tour starts after the idle time and a key stops it,
// the numbers stay out of sight until START, and the hills and the crystal are readable in the four tones.
// tests/vecdream-frames.test.mjs guards the exact frames; this one guards the things the owner asked for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const FILE = join(ROOT, "registry", "apps", "vector-dream", "index.html");
const W = 160, H = 144;
const TONE = { "31,42,20": 0, "74,90,50": 1, "125,138,88": 2, "163,173,126": 3 };

function launch() {
  const handlers = [], down = new Set();
  const pad = {
    lang: "zh",
    on: (type, f) => { if (type === "press") handlers.push(f); },
    isDown: (b) => down.has(b),
    sfx() {}
  };
  let shot = null;
  const app = boot(FILE, { pad, onPut: (img) => { shot = Uint8Array.from(img.data); } });
  const page = app.ctx.get("window");
  return {
    state: () => page.VECDREAM.state(),
    press: (b) => handlers.forEach((f) => f(b)),
    run: (n) => { for (let i = 0; i < n; i++) app.frame(); },
    shot: () => shot
  };
}

function toneCounts(img) {
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < img.length; i += 4) {
    const t = TONE[img[i] + "," + img[i + 1] + "," + img[i + 2]];
    assert.notEqual(t, undefined, `pixel ${i / 4} is not one of the four tones`);
    counts[t]++;
  }
  return counts;
}

function toneAt(img, x, y) {
  const i = (y * W + x) * 4;
  return TONE[img[i] + "," + img[i + 1] + "," + img[i + 2]];
}

/* the water's surface: the biggest 4-connected blob of the water tone (2), not the dithered far hills */
function waterMask(img) {
  const seen = new Uint8Array(W * H);
  let best = [];
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || toneAt(img, s % W, (s / W) | 0) !== 2) continue;
    const queue = [s], blob = [];
    seen[s] = 1;
    while (queue.length) {
      const k = queue.pop();
      blob.push(k);
      const x = k % W, y = (k / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (seen[nk] || toneAt(img, nx, ny) !== 2) continue;
        seen[nk] = 1;
        queue.push(nk);
      }
    }
    if (blob.length > best.length) best = blob;
  }
  const mask = new Uint8Array(W * H);
  for (const k of best) mask[k] = 1;
  return mask;
}

/* how far the boundary runs straight through (x, y) along (dx, dy), counting boundary pixels only */
function straightRun(boundary, x, y, dx, dy) {
  let n = 1;
  for (let cx = x + dx, cy = y + dy; cx >= 0 && cy >= 0 && cx < W && cy < H && boundary.has(cy * W + cx); cx += dx, cy += dy) n++;
  return n;
}

test("vector-dream: the auto-tour changes the scene after the idle time, and a key stops it", () => {
  const v = launch();
  v.run(30);
  assert.equal(v.state().scene, 0);
  assert.equal(v.state().tour, false);
  v.run(620);                                    /* past 10 s */
  const touring = v.state();
  assert.equal(touring.tour, true);
  assert.notEqual(touring.scene, 0, "the tour moves to the next scene when it starts");
  v.press("left");
  v.run(1);
  assert.equal(v.state().tour, false);
  v.press("left");                               /* not needed, but a second key keeps the idle clock fresh */
  v.run(300);                                    /* 5 s: neither the idle time nor the tour interval has passed */
  assert.equal(v.state().scene, touring.scene, "a key press stops the tour");
});

test("vector-dream: the numbers are hidden by default, START shows them with the legend, START hides them", () => {
  const v = launch();
  v.run(30);
  let s = v.state();
  assert.equal(s.hud, false);
  assert.equal(s.hudText, "");
  v.press("start");
  v.run(1);
  s = v.state();
  assert.equal(s.hud, true);
  assert.equal(s.legend, true);
  assert.match(s.hudText, /帧率\s+\d+/);
  assert.match(s.hudText, /面数\s+\d+/);
  v.press("start");
  v.run(1);
  s = v.state();
  assert.equal(s.hud, false);
  assert.equal(s.legend, false);
});

test("vector-dream: A names the scene it switched to, and the card goes after 1.2 s", () => {
  const v = launch();
  v.run(3);
  assert.equal(v.state().card, false);
  v.press("a");
  v.run(1);
  let s = v.state();
  assert.equal(s.scene, 1);
  assert.equal(s.card, true);
  assert.equal(s.cardText, "场景 2/3  飞越");
  v.run(70);                                     /* 1.18 s: still up */
  assert.equal(v.state().card, true);
  v.run(2);                                      /* past 1.2 s */
  assert.equal(v.state().card, false, "the card stays up too long");
  v.press("a");                                  /* a second press names the next scene at once */
  v.run(1);
  s = v.state();
  assert.equal(s.card, true);
  assert.equal(s.cardText, "场景 3/3  晶体");
});

test("vector-dream: the flyover uses at least three tones, and the crystal's centre is not a blob of ink", () => {
  const v = launch();
  v.run(5);
  v.press("a");                                  /* the flyover */
  v.run(1);
  const fly = toneCounts(v.shot());
  const enough = fly.filter((n) => n >= W * H * 0.08).length;
  assert.ok(enough >= 3, `only ${enough} tones cover 8% of the flyover: ${fly.join(", ")}`);
  v.press("a");                                  /* the crystal */
  v.run(1);
  const cry = v.shot();
  let ink = 0, total = 0;
  for (let y = 48; y < 96; y++) for (let x = 56; x < 104; x++) {
    const i = (y * W + x) * 4;
    total++;
    if (cry[i] === 31 && cry[i + 1] === 42 && cry[i + 2] === 20) ink++;
  }
  assert.ok(ink / total < 0.9, `the crystal's centre is ${Math.round(100 * ink / total)}% ink`);
});

// The owner read the first lake as an ancient city wall: the water was built from whole terrain cells, so
// its edge was a staircase of straight grid lines, and every lake edge carried a 0.12-high ink band. Both
// show in the flyover's first solid frame. This test measures two things there:
//  - the share of the water/land boundary that lies in straight horizontal or vertical runs of 6 px or
//    more. A cell-edged lake is mostly long straight runs (the old frame: 69%); a shoreline cut by the
//    terrain's true heights wanders and only a few pixels stay on one axis (the new frame: 11%).
//  - the ink pixels directly above and below each column's water run. A raised ink shore reads as a
//    band 2-4 px thick; the flat plane adds no ink at all (the old frame had bands up to 10 px).
test("vector-dream: the lake's edge is a natural contour with no ink wall", () => {
  const v = launch();
  v.run(5);
  v.press("a");                                  /* the flyover */
  v.run(1);
  const img = v.shot();
  const mask = waterMask(img);
  let water = 0;
  for (let k = 0; k < mask.length; k++) water += mask[k];
  assert.ok(water > 500, `the flyover shows only ${water} px of water`);

  /* boundary: a water pixel with a non-water 4-neighbour */
  const boundary = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!mask[k]) continue;
    if ((x > 0 && !mask[k - 1]) || (x < W - 1 && !mask[k + 1]) || (y > 0 && !mask[k - W]) || (y < H - 1 && !mask[k + W])) boundary.add(k);
  }
  let straight = 0;
  for (const k of boundary) {
    const x = k % W, y = (k / W) | 0;
    const across = Math.max(straightRun(boundary, x, y, 1, 0), straightRun(boundary, x, y, -1, 0));
    const down = Math.max(straightRun(boundary, x, y, 0, 1), straightRun(boundary, x, y, 0, -1));
    if (Math.max(across, down) >= 6) straight++;
  }
  const share = straight / boundary.size;
  assert.ok(share < 0.4, `${Math.round(100 * share)}% of the lake's edge is straight horizontal/vertical runs of 6 px or more`);

  /* no ink band: look just above and just below every column's water run */
  let thickest = 0;
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const k = y * W + x;
    if (!mask[k] || (y > 0 && mask[k - W])) continue;      /* the top of a water run */
    let above = 0, yy = y - 1;
    while (yy >= 0 && toneAt(img, x, yy) === 0) { above++; yy--; }
    let end = y;
    while (end + 1 < H && mask[(end + 1) * W + x]) end++;
    let below = 0;
    for (yy = end + 1; yy < H && toneAt(img, x, yy) === 0; yy++) below++;
    thickest = Math.max(thickest, above, below);
  }
  assert.ok(thickest <= 2, `${thickest} px of ink lie between the water and the land`);
});
