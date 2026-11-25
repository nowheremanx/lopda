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
