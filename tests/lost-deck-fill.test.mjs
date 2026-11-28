// 失联站 / Lost Deck on lo-game 1.5.0's fill layout: the canvas covers the stage edge to edge at the five phone
// sizes from sdk/UI.md 13 (with the world whole and centred), and fill off keeps the old containment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJSON, runScript } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const LoGame = runScript("sdk/lo-game.js").LoGame;
const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];
const W = 160, H = 160;

test("lost-deck fill: the canvas covers the stage with less than one canvas pixel to spare", () => {
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

test("lost-deck fill: a short stage fits by height and grows wider, the promise of the pixel sizes", () => {
  const L = LoGame.fillLayout(348, 323, W, H);
  assert.ok(L.w > W, "the 348 x 323 stage is shorter than a 160 x 160 world and must grow wider");
  assert.equal(L.h, H);
  assert.equal(L.y, 0);
  assert.equal(L.k, 323 / H);

  const tall = LoGame.fillLayout(386, 738, W, H);
  assert.equal(tall.w, W);
  assert.equal(tall.x, 0);
  assert.ok(tall.h > H && tall.y > 0);
});

test("lost-deck fill: fill off keeps the old contain layout, paper and all", () => {
  /* 331 x 359 has room for the world at 2x with paper above and below, as before 1.5.0 */
  const c = LoGame.containLayout(331, 359, W, H, 1);
  assert.equal(c.w, 320); assert.equal(c.h, 320); assert.equal(c.k, 2);
  assert.ok(c.w <= 331 && c.h <= 359, "containment never overflows the stage");
  /* and it is at most the fit, never covering: the stage is wider than the scaled world */
  for (const [sw, sh] of SIZES) {
    const L = LoGame.containLayout(sw, sh, W, H, 1);
    assert.ok(L.k <= Math.min(sw / W, sh / H) + 1e-9, `${sw}x${sh}: contain grew past the stage`);
    assert.ok(L.w <= Math.ceil(sw) && L.h <= Math.ceil(sh), `${sw}x${sh}: contain overflows`);
  }
});

/* the app: boot it on each stage and read the layout it actually fitted */
const APP = join(ROOT, "registry/apps/lost-deck/index.html");
function pad() {
  return {
    lang: "zh", on() {}, off() {}, isDown() { return false; }, sfx() {},
    save() { return Promise.resolve(); }, load() { return Promise.resolve(null); }, remove() {}, setSchema() {}
  };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

test("lost-deck app: is on 1.1.0 and asks lo-game for a fill screen", () => {
  assert.equal(readJSON("registry/apps/lost-deck/manifest.json").version, "1.1.0");
  const src = readFileSync(join(ROOT, "registry/apps/lost-deck/src/60-game.js"), "utf8");
  assert.match(src, /LoGame\.create\(\{[^}]*fill: true[^}]*bands: paintBands/);
});

test("lost-deck app: the fitted stage covers all five phone sizes", async () => {
  for (const [sw, sh] of SIZES) {
    const app = boot(APP, { pad: pad(), seed: 3, stage: { w: sw, h: sh } });
    await settle();
    for (let i = 0; i < 5; i++) app.frame();
    const game = app.ctx.get("LD").game, st = game.stage;
    assert.equal(game.width, W);
    assert.equal(game.height, H);
    const want = LoGame.fillLayout(sw, sh, W, H);
    for (const key of ["w", "h", "k", "x", "y"]) assert.equal(st[key], want[key], `${sw}x${sh}: the app fitted another ${key}`);
    assert.ok(st.w * st.k >= sw - 1e-9 && st.h * st.k >= sh - 1e-9, `${sw}x${sh}: paper at an edge`);
  }
});

/* a pointer event at canvas (stage) pixels of a fill app: the stage rect is at 0, 0 and k CSS px a canvas pixel */
function tapStage(app, game, stageX, stageY) {
  const k = game.stage.k, x = stageX * k, y = stageY * k;
  app.pointerRaw("pointerdown", x, y);
  app.frame();
  app.pointerRaw("pointerup", x, y);
  for (let i = 0; i < 3; i++) app.frame();
}

test("lost-deck app: a tap or drag started in the bands is not a world tap", async () => {
  /* the short stage's left band is at canvas x < 6; a tap there used to clamp to x 0 and choose a title row */
  let app = boot(APP, { pad: pad(), seed: 3, stage: { w: 348, h: 323 } });
  await settle(); for (let i = 0; i < 5; i++) app.frame();
  let L = app.ctx.get("LD"), game = L.game, title = game.top();
  tapStage(app, game, 3, 94);                       /* left band, level with the title's first row (y 91..105) */
  for (let i = 0; i < 40; i++) { app.frame(); await settle(); }
  assert.equal(game.top(), title, "a left-band tap chose a title row");
  tapStage(app, game, game.stage.x + 80, 94);       /* the same row, inside the world */
  for (let i = 0; i < 40; i++) { app.frame(); await settle(); }
  assert.notEqual(game.top(), title, "a tap on the title row itself still works");

  /* play: a tap in the top band used to clamp to y 0, start a touch and fire on release */
  app = boot(APP, { pad: pad(), seed: 3, stage: { w: 331, h: 359 } });
  await settle(); L = app.ctx.get("LD"); L.dbgStart(0);
  for (let i = 0; i < 10; i++) app.frame();
  game = L.game;
  const P = L.dbg().P, ammo = P.ammo;
  tapStage(app, game, 80, 2);                        /* the band above the world (world starts at y 7) */
  assert.equal(P.ammo, ammo, "a top-band tap fired");
  tapStage(app, game, game.stage.x + 80, game.stage.y + 64);   /* the view, dead centre */
  assert.equal(P.ammo, ammo - 1, "a tap in the view still fires");
});
