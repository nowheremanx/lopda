// 每日推箱 / DailyBox on lo-game 1.5.0's fill layout: the 160 x 144 world stays whole while the canvas
// covers the stage edge to edge at the five phone sizes from sdk/UI.md 13. Fill off keeps the old
// containment, paper and all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJSON, runScript } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const LoGame = runScript("sdk/lo-game.js").LoGame;
const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];
const W = 160, H = 144;

test("daily-box fill: the canvas covers the stage with less than one canvas pixel to spare", () => {
  for (const [sw, sh] of SIZES) {
    const L = LoGame.fillLayout(sw, sh, W, H);
    assert.ok(L.w * L.k >= sw - 1e-9, `${sw}x${sh}: ${L.w}x${L.k} is narrower than the stage`);
    assert.ok(L.h * L.k >= sh - 1e-9, `${sw}x${sh}: ${L.h}x${L.k} is shorter than the stage`);
    assert.ok(L.w * L.k - sw < L.k, `${sw}x${sh}: ${L.w * L.k - sw} px of paper at the sides`);
    assert.ok(L.h * L.k - sh < L.k, `${sw}x${sh}: ${L.h * L.k - sh} px of paper above or below`);
    /* the world is whole and centred in the canvas */
    assert.ok(L.x >= 0 && L.y >= 0 && L.x + W <= L.w && L.y + H <= L.h, `${sw}x${sh}: the world is cut`);
    assert.equal(L.x, Math.floor((L.w - W) / 2), `${sw}x${sh}: the world is not centred across`);
    assert.equal(L.y, Math.floor((L.h - H) / 2), `${sw}x${sh}: the world is not centred down`);
  }
});

test("daily-box fill: the five phone stages all fit by width; only a shorter one grows wider", () => {
  for (const [sw, sh] of SIZES) {
    const L = LoGame.fillLayout(sw, sh, W, H);
    assert.equal(L.w, W, `${sw}x${sh}: no side bands expected at this ratio`);
    assert.equal(L.x, 0);
    assert.ok(L.y > 0, `${sw}x${sh}: a 160 x 144 world cannot fill this height alone`);
  }
  const short = LoGame.fillLayout(300, 240, W, H);
  assert.ok(short.w > W, "a stage shorter than the world's ratio must grow wider");
  assert.equal(short.h, H);
  assert.equal(short.y, 0);
});

test("daily-box fill: fill off keeps the old contain layout, paper and all", () => {
  /* 331 x 359 has room for the world at 2x with paper above and below, as before 1.5.0 */
  const c = LoGame.containLayout(331, 359, W, H, 1);
  assert.equal(c.w, 320); assert.equal(c.h, 288); assert.equal(c.k, 2);
  assert.ok(c.w <= 331 && c.h <= 359, "containment never overflows the stage");
  for (const [sw, sh] of SIZES) {
    const L = LoGame.containLayout(sw, sh, W, H, 1);
    assert.ok(L.k <= Math.min(sw / W, sh / H) + 1e-9, `${sw}x${sh}: contain grew past the stage`);
    assert.ok(L.w <= Math.ceil(sw) && L.h <= Math.ceil(sh), `${sw}x${sh}: contain overflows`);
  }
});

/* the app: boot it on each stage and read the layout it actually fitted */
const APP = join(ROOT, "registry/apps/daily-box/index.html");
function pad() {
  return {
    lang: "zh", on() {}, off() {}, isDown() { return false; }, sfx() {},
    save() { return Promise.resolve(); }, load() { return Promise.resolve(null); }, remove() {}, setSchema() {}
  };
}
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

test("daily-box app: is on 1.2.0 and asks lo-game for a fill screen", () => {
  assert.equal(readJSON("registry/apps/daily-box/manifest.json").version, "1.2.0");
  const src = readFileSync(join(ROOT, "registry/apps/daily-box/src/game.js"), "utf8");
  assert.match(src, /LoGame\.create\(\{[^}]*fill: true[^}]*bands: paintBands/);
});

test("daily-box app: the fitted stage covers all five phone sizes", async () => {
  for (const [sw, sh] of SIZES) {
    const app = boot(APP, { pad: pad(), seed: 3, stage: { w: sw, h: sh } });
    await settle();
    for (let i = 0; i < 6; i++) app.frame();
    const game = app.ctx.get("game"), st = game.stage;
    assert.equal(game.width, W);
    assert.equal(game.height, H);
    const want = LoGame.fillLayout(sw, sh, W, H);
    for (const key of ["w", "h", "k", "x", "y"]) assert.equal(st[key], want[key], `${sw}x${sh}: the app fitted another ${key}`);
    assert.ok(st.w * st.k >= sw - 1e-9 && st.h * st.k >= sh - 1e-9, `${sw}x${sh}: paper at an edge`);
    /* the canvas' own pixels are the world plus the bands: the world's hit tests never move */
    assert.equal(app.ctx.get("BOX").state().ui, "title");
  }
});
