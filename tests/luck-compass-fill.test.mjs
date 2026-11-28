// 玄机阁 / Oracle on lo-game 1.5.0's fill layout: the canvas covers the stage edge to edge at the five phone
// sizes from sdk/UI.md 13, the bands leave no paper bar, and a tap in the night sky or on the altar is not a
// tap on the page. fill off keeps the old containment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJSON, runScript } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const LoGame = runScript("sdk/lo-game.js").LoGame;
const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];
const W = 216, H = 240;
const APP = join(ROOT, "registry/apps/luck-compass/index.html");
const TONES = [[0x1f, 0x2a, 0x14], [0x4a, 0x5a, 0x32], [0x7d, 0x8a, 0x58], [0xa3, 0xad, 0x7e]];

test("fill: the canvas covers the stage with less than one canvas pixel to spare", () => {
  for (const [sw, sh] of SIZES) {
    const L = LoGame.fillLayout(sw, sh, W, H);
    assert.ok(L.w * L.k >= sw - 1e-9, `${sw}x${sh}: ${L.w}x${L.k} is narrower than the stage`);
    assert.ok(L.h * L.k >= sh - 1e-9, `${sw}x${sh}: ${L.h}x${L.k} is shorter than the stage`);
    assert.ok(L.w * L.k - sw < L.k, `${sw}x${sh}: ${L.w * L.k - sw} px of paper at the sides`);
    assert.ok(L.h * L.k - sh < L.k, `${sw}x${sh}: ${L.h * L.k - sh} px of paper above or below`);
    assert.ok(L.x >= 0 && L.y >= 0 && L.x + W <= L.w && L.y + H <= L.h, `${sw}x${sh}: the page is cut`);
    assert.equal(L.x, Math.floor((L.w - W) / 2), `${sw}x${sh}: the page is not centred across`);
    assert.equal(L.y, Math.floor((L.h - H) / 2), `${sw}x${sh}: the page is not centred down`);
  }
});

test("fill: the short Safari stage fits by height and grows wider, with the cabinet at the sides", () => {
  const L = LoGame.fillLayout(348, 323, W, H);
  assert.ok(L.w > W, "a stage shorter than the page must grow wider");
  assert.equal(L.h, H);
  assert.equal(L.y, 0);
  assert.equal(L.k, 323 / H);
  assert.ok(L.x > 0 && L.x === Math.floor((L.w - W) / 2));
  const tall = LoGame.fillLayout(386, 738, W, H);
  assert.equal(tall.w, W);
  assert.equal(tall.x, 0);
  assert.ok(tall.h > H && tall.y > 0, "a tall stage keeps the page's width and gains rows above and below");
});

test("fill off keeps the old contain layout: the page whole, paper around it", () => {
  const small = LoGame.containLayout(331, 359, W, H, 1);
  assert.deepEqual({ w: small.w, h: small.h }, { w: 323, h: 359 }, "331 x 359 used to hold a 323 x 359 page");
  const one = LoGame.containLayout(346, 518, W, H, 1);
  assert.deepEqual({ w: one.w, h: one.h }, { w: 346, h: 384 }, "346 x 518 used to hold a 346 x 384 page");
  for (const [sw, sh] of SIZES) {
    const L = LoGame.containLayout(sw, sh, W, H, 1);
    assert.ok(L.k <= Math.min(sw / W, sh / H) + 1e-9, `${sw}x${sh}: contain grew past the stage`);
    assert.ok(L.w <= Math.ceil(sw) && L.h <= Math.ceil(sh), `${sw}x${sh}: contain overflows`);
  }
});

/* ---- the app on each stage ---- */
function pad() {
  return {
    lang: "zh", on() {}, off() {}, isDown() { return false; }, sfx() {},
    load() { return Promise.resolve(null); }, save() {}, remove() {}
  };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

async function bootOn(sw, sh, lang = "zh") {
  let last = null;
  const app = boot(APP, { pad: { ...pad(), lang }, seed: 1, stage: { w: sw, h: sh }, onPut: (img) => { last = img; } });
  await settle();
  for (let i = 0; i < 4; i++) app.frame();
  last = null;
  app.frame();
  return { app, img: last, game: app.ctx.get("game") };
}
function toneAt(img, sw, x, y) {
  const i = (y * sw + x) * 4;
  for (let t = 0; t < 4; t++) {
    if (img.data[i] === TONES[t][0] && img.data[i + 1] === TONES[t][1] && img.data[i + 2] === TONES[t][2]) return t;
  }
  return -1;
}
/* a pointer at canvas (stage) pixels: the fake stage rect starts at 0, 0 and k CSS px go to a canvas pixel */
function tapStage(app, game, stageX, stageY) {
  const k = game.stage.k, x = stageX * k, y = stageY * k;
  app.pointerRaw("pointerdown", x, y);
  app.frame();
  app.pointerRaw("pointerup", x, y);
  for (let i = 0; i < 3; i++) app.frame();
}

test("the app is on 2.1.0 and asks lo-game for a fill screen with the bands", () => {
  assert.equal(readJSON("registry/apps/luck-compass/manifest.json").version, "2.1.0");
  const src = readFileSync(join(ROOT, "registry/apps/luck-compass/src/app.js"), "utf8");
  assert.match(src, /LoGame\.create\(\{[^}]*width: 216, height: 240[^}]*fill: true, bands: LUCK_BANDS\.paint/);
});

test("the fitted stage covers all five phone sizes and the page keeps its 216 x 240", async () => {
  for (const [sw, sh] of SIZES) {
    const { game } = await bootOn(sw, sh);
    assert.equal(game.width, W);
    assert.equal(game.height, H);
    const want = LoGame.fillLayout(sw, sh, W, H);
    for (const key of ["w", "h", "k", "x", "y"]) assert.equal(game.stage[key], want[key], `${sw}x${sh}: another ${key}`);
    assert.ok(game.stage.w * game.stage.k >= sw - 1e-9 && game.stage.h * game.stage.k >= sh - 1e-9, `${sw}x${sh}: paper at an edge`);
  }
});

test("outside the page the bands are scenery, not a paper bar, at every size", async () => {
  for (const [sw, sh] of SIZES) {
    const { img, game } = await bootOn(sw, sh);
    const st = game.stage;
    assert.ok(img, `${sw}x${sh}: no composed stage was drawn`);
    let paper = 0, outside = 0;
    for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
      const tone = toneAt(img, st.w, x, y);
      assert.notEqual(tone, -1, `${sw}x${sh}: (${x}, ${y}) is not one of the four tones`);
      if (x >= st.x && x < st.x + W && y >= st.y && y < st.y + H) continue;
      outside++;
      if (tone === 3) paper++;
    }
    assert.ok(outside > 0, `${sw}x${sh}: the stage is exactly the page, so this test proves nothing`);
    /* the moon, the candle, the books' page edges and the cloud tops are paper; the rest of the band is not */
    assert.ok(paper / outside < 0.06, `${sw}x${sh}: ${paper} of ${outside} band pixels are paper`);
  }
});

test("a band tap in the menu chooses nothing; a tap on a row still opens it", async () => {
  /* the short stage puts a 21 px cabinet at each side; a side tap clamps to page x 0, which used to land on
     the first row at y 50..82 */
  const { app, game } = await bootOn(348, 323);
  assert.equal(app.ctx.get("section"), "counter");
  tapStage(app, game, 4, 60);
  for (let i = 0; i < 20; i++) { app.frame(); await settle(); }
  assert.equal(app.ctx.get("section"), "counter", "a tap in the side band opened a section");
  assert.equal(app.ctx.get("counterCursor"), 0, "a tap in the side band moved the row cursor");
  tapStage(app, game, game.stage.x + 108, 60);
  for (let i = 0; i < 20; i++) { app.frame(); await settle(); }
  assert.equal(app.ctx.get("section"), "almanac", "a tap on the first row still opens the almanac");
});

test("a band tap does not draw a fortune slip", async () => {
  const { app, game } = await bootOn(348, 323);
  app.ctx.get("openSection")("fortune");
  for (let i = 0; i < 4; i++) app.frame();
  tapStage(app, game, 4, 100);                     /* the left cabinet, level with the cup */
  for (let i = 0; i < 60; i++) { app.frame(); await settle(); }
  assert.equal(app.ctx.get("slipState").slip, null, "a band tap drew the day's slip");
  assert.equal(app.ctx.get("slipState").animating, false);
  tapStage(app, game, game.stage.x + 108, game.stage.y + 120);
  for (let i = 0; i < 140; i++) { app.frame(); await settle(); }
  assert.notEqual(app.ctx.get("slipState").slip, null, "a tap on the cup still draws");
});

test("a band tap leaves the compass panel open; a tap on the dial closes it", async () => {
  const { app, game } = await bootOn(346, 518);
  app.ctx.get("openSection")("compass");
  app.frame();
  app.ctx.get("openPanel")();
  app.frame();
  assert.equal(app.ctx.get("panel"), true);
  tapStage(app, game, 108, 6);                     /* the night sky above the page */
  assert.equal(app.ctx.get("panel"), true, "a band tap closed the compass panel");
  tapStage(app, game, game.stage.x + 108, game.stage.y + 106);   /* the dial itself */
  assert.equal(app.ctx.get("panel"), false, "a tap on the dial still closes the panel");
});
