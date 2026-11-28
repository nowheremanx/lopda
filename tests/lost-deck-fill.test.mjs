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

test("lost-deck app: is on 1.1.1 and asks lo-game for a fill screen", () => {
  assert.equal(readJSON("registry/apps/lost-deck/manifest.json").version, "1.1.1");
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

/* the four tones as RGB, so a captured stage can be read back by tone index */
const TONES = ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
function toneIndex(img, x, y, w) {
  const o = (y * w + x) * 4;
  for (let i = 0; i < TONES.length; i++) {
    if (img.data[o] === TONES[i][0] && img.data[o + 1] === TONES[i][1] && img.data[o + 2] === TONES[i][2]) return i;
  }
  return -1;
}
async function titleShot(sw, sh) {
  let shot = null;
  const app = boot(APP, { pad: pad(), seed: 3, stage: { w: sw, h: sh }, onPut: (img) => { shot = { img, w: img.width, h: img.height }; } });
  await settle();
  for (let i = 0; i < 6; i++) app.frame();
  return { shot, game: app.ctx.get("LD").game };
}

test("lost-deck app: the top band is the ship's ceiling, not a starfield", async () => {
  const { shot, game } = await titleShot(386, 738);
  const w = shot.w, sky = game.stage.y;
  assert.ok(sky > 40, `a tall stage has a deep top band (${sky})`);
  /* the lit lip just above the world mirrors the floor's lit edge just below it */
  for (let x = 0; x < w; x++) assert.equal(toneIndex(shot.img, x, sky - 1, w), 2, `the lip at x ${x} is not lit`);
  /* a rib at the floor's column runs from the top of the band (col 50 is clear of the lights) */
  for (let y = 0; y < sky - 2; y++) assert.equal(toneIndex(shot.img, 50, y, w), 1, `rib at y ${y} is missing`);
  /* plating seams are dotted like the floor's, not a starfield */
  let seam = 0;
  for (let x = 0; x < w; x++) if (toneIndex(shot.img, x, sky - 5, w) === 1) seam++;
  assert.ok(seam >= 8 && seam <= w * 0.5, `seam row ${sky - 5} has ${seam} dark pixels`);
  /* a recessed strip light: a long run of bright pixels, which stars never make */
  const brightRun = (y) => {
    let run = 0, best = 0;
    for (let x = 0; x < w; x++) { run = toneIndex(shot.img, x, y, w) >= 2 ? run + 1 : 0; best = Math.max(best, run); }
    return best;
  };
  let lights = 0;
  for (let y = 0; y < sky - 1; y++) if (brightRun(y) >= 8) lights++;
  assert.ok(lights >= 1, "no recessed light in the top band");
  /* and no stars: every bright pixel belongs to a lit fixture row */
  for (let y = 0; y < sky - 1; y++) for (let x = 0; x < w; x++) {
    if (toneIndex(shot.img, x, y, w) === 3) assert.ok(brightRun(y) >= 6, `a lone bright pixel at ${x},${y} is a star`);
  }
  /* the band is mostly plate, not empty space */
  let ink = 0;
  for (let y = 0; y < sky - 1; y++) for (let x = 0; x < w; x++) if (toneIndex(shot.img, x, y, w) === 0) ink++;
  assert.ok(ink > w * (sky - 1) * 0.7, `the top band is only ${Math.round(ink / (w * (sky - 1)) * 100)}% plate`);
});

test("lost-deck app: a shallow top band still shows deck lip, seams and a light", async () => {
  const { shot, game } = await titleShot(331, 359);
  const w = shot.w, sky = game.stage.y;
  assert.ok(sky >= 5 && sky < 16, `the 331 x 359 stage has a shallow top band (${sky})`);
  for (let x = 0; x < w; x++) assert.equal(toneIndex(shot.img, x, sky - 1, w), 2, `the lip at x ${x} is not lit`);
  let light = 0;
  for (let x = 0; x < w; x++) if (toneIndex(shot.img, x, 1, w) === 2) light++;
  assert.ok(light >= 8, `the shallow band has no strip light (${light} lit pixels)`);
  /* a rib away from the slim lights */
  for (let y = 0; y < sky - 2; y++) assert.equal(toneIndex(shot.img, 86, y, w), 1, `rib at y ${y} is missing`);
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
