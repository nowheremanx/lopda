// 西西弗斯 / Sisyphus on lo-game 1.5.0's fill layout: the canvas covers the stage edge to edge at the
// five phone sizes of sdk/UI.md 13, the bands around the 160 x 178 world are the mountain itself
// rather than paper, and a tap or drag that starts in a band never counts as a tap on the screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT, read, readJSON, runScript } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const LoGame = runScript("sdk/lo-game.js").LoGame;
const APP = join(ROOT, "registry", "apps", "sisyphus", "index.html");
const W = 160, H = 178;
const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];
const TONES = { "31,42,20": 0, "74,90,50": 1, "125,138,88": 2, "163,173,126": 3 };

test("sisyphus fill: the canvas covers the stage with less than one canvas pixel to spare", () => {
  for (const [sw, sh] of SIZES) {
    const L = LoGame.fillLayout(sw, sh, W, H);
    assert.ok(L.w * L.k >= sw - 1e-9, `${sw}x${sh}: ${L.w} x ${L.k} is narrower than the stage`);
    assert.ok(L.h * L.k >= sh - 1e-9, `${sw}x${sh}: ${L.h} x ${L.k} is shorter than the stage`);
    assert.ok(L.w * L.k - sw < L.k, `${sw}x${sh}: ${L.w * L.k - sw} px over at the sides`);
    assert.ok(L.h * L.k - sh < L.k, `${sw}x${sh}: ${L.h * L.k - sh} px over above or below`);
    /* the world is whole and centred in the canvas */
    assert.ok(L.x >= 0 && L.y >= 0 && L.x + W <= L.w && L.y + H <= L.h, `${sw}x${sh}: the world is cut`);
    assert.equal(L.x, Math.floor((L.w - W) / 2), `${sw}x${sh}: the world is not centred across`);
    assert.equal(L.y, Math.floor((L.h - H) / 2), `${sw}x${sh}: the world is not centred down`);
  }
});

test("sisyphus fill: 331 x 359 fits by height and grows 2 columns each side, not a paper bar", () => {
  const L = LoGame.fillLayout(331, 359, W, H);
  assert.equal(L.h, H);
  assert.equal(L.y, 0);
  assert.ok(L.w > W && L.x > 0, "the short stage grows wider than the world");
  assert.equal(L.k, 359 / H);
  const tall = LoGame.fillLayout(386, 738, W, H);
  assert.equal(tall.w, W);
  assert.equal(tall.x, 0);
  assert.ok(tall.h > H && tall.y > 0);
});

test("sisyphus fill: with fill off, the old containment still keeps the world whole in paper", () => {
  /* 331 x 359 was a 320 x 356 canvas with paper above and below, before 1.5.0 */
  const c = LoGame.containLayout(331, 359, W, H, 1);
  assert.equal(c.w, 320); assert.equal(c.h, 356); assert.equal(c.k, 2);
  for (const [sw, sh] of SIZES) {
    const L = LoGame.containLayout(sw, sh, W, H, 1);
    assert.ok(L.k <= Math.min(sw / W, sh / H) + 1e-9, `${sw}x${sh}: contain grew past the stage`);
    assert.ok(L.w <= Math.ceil(sw) && L.h <= Math.ceil(sh), `${sw}x${sh}: contain overflows`);
  }
});

/* the app: a phone-sized stage, a save store, none of the sound/notes APIs the play does not need */
function makePad(store = {}) {
  const listeners = {};
  const pad = {
    lang: "zh",
    save(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    load(k) { return Promise.resolve(store[k] == null ? null : JSON.parse(JSON.stringify(store[k]))); },
    remove(k) { delete store[k]; },
    sfx() {}, ambience() {}, music: { play() {}, stop() {} },
    on(t, fn) { (listeners[t] ||= []).push(fn); }, off() {}, isDown() { return false; }
  };
  pad.listeners = listeners;
  return pad;
}
const flush = () => new Promise((r) => setImmediate(r));
async function bootAt(sw, sh, store) {
  let last = null;
  const pad = makePad(store);
  const app = boot(APP, { pad, seed: 1, stage: { w: sw, h: sh }, onPut: (img) => { last = img; } });
  const run = async (n = 1) => { for (let i = 0; i < n; i++) { app.frame(); await flush(); } };
  const press = async (b) => {
    (pad.listeners.press || []).forEach((fn) => fn(b)); await run(2);
    (pad.listeners.release || []).forEach((fn) => fn(b)); await run(1);
  };
  await run(5);
  return { app, pad, run, press, image: () => last, ctx: app.ctx };
}
/* a pointer event at canvas (stage) pixels: the fake stage rect starts at 0, 0, k CSS px a canvas pixel */
function stageDown(app, game, sx, sy) {
  app.pointerRaw("pointerdown", sx * game.stage.k, sy * game.stage.k);
}
function stageUp(app, game, sx, sy) {
  app.pointerRaw("pointerup", sx * game.stage.k, sy * game.stage.k);
}
function stageMove(app, game, sx, sy) {
  app.pointerRaw("pointermove", sx * game.stage.k, sy * game.stage.k);
}
async function tapStage(app, game, run, sx, sy) {
  stageDown(app, game, sx, sy); await run(2);
  stageUp(app, game, sx, sy); await run(2);
}
function toneAt(img, x, y) {
  const d = img.data, i = (y * img.width + x) * 4;
  return TONES[d[i] + "," + d[i + 1] + "," + d[i + 2]];
}
/* the tones of a stage rect */
function tones(img, x0, y0, x1, y1) {
  const seen = new Set();
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) seen.add(toneAt(img, x, y));
  return seen;
}
function paperShare(img, x0, y0, x1, y1) {
  let n = 0, paper = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; if (toneAt(img, x, y) === 3) paper++; }
  return paper / n;
}
/* into the climb from the title, at a chosen height */
async function climbTo(a, p) {
  const game = a.ctx.get("game"), st = game.stage;
  await tapStage(a.app, game, a.run, st.x + 80, st.y + 80);
  await a.run(40);                       /* the title's fade */
  a.ctx.get("S").p = p;
  await a.run(2);
}

test("sisyphus app: is on 0.3.0 and asks lo-game for a fill screen with bands", () => {
  assert.equal(readJSON("registry/apps/sisyphus/manifest.json").version, "0.3.0");
  const src = read("registry/apps/sisyphus/src/main.js");
  assert.match(src, /LoGame\.create\(\{[^}]*fill: true/);
  assert.match(src, /bands: function \(s, st\) \{ ART\.paintBands\(s, st, S, calmBands\(\)\); \}/);
  /* the matte frame that clipped at 331 x 359 is gone: the fill canvas is the edge now */
  const html = read("registry/apps/sisyphus/index.html");
  assert.ok(!/<style/i.test(html), "no CSS matte around the canvas");
  assert.ok(!/outline\s*:/.test(html.slice(0, html.indexOf("<body"))), "no CSS outline in the page head");
  assert.match(html, /data-lo-game="1\.5\.0"/);
});

test("sisyphus app: the fitted stage covers all five phone sizes", async () => {
  for (const [sw, sh] of SIZES) {
    const a = await bootAt(sw, sh);
    const game = a.ctx.get("game"), st = game.stage;
    assert.equal(game.width, W);
    assert.equal(game.height, H);
    const want = LoGame.fillLayout(sw, sh, W, H);
    for (const key of ["w", "h", "k", "x", "y"]) assert.equal(st[key], want[key], `${sw}x${sh}: the app fitted another ${key}`);
    assert.ok(st.w * st.k >= sw - 1e-9 && st.h * st.k >= sh - 1e-9, `${sw}x${sh}: paper at an edge`);
    /* 331 x 359 is the smallest: its canvas is the phone's edge, no clipped matte outside it */
    if (sw === 331) assert.ok(st.w * st.k >= sw && st.h * st.k >= sh, "the canvas covers the smallest stage");
  }
});

test("sisyphus app: the bands are the mountain, never a paper bar", async () => {
  for (const [sw, sh] of SIZES) {
    const a = await bootAt(sw, sh);
    const game = a.ctx.get("game"), st = game.stage;
    /* midway up: a dark sky above, rock below, and no field of untouched paper */
    await climbTo(a, 0.6);
    const img = a.image();
    if (st.y > 0) {
      const top = tones(img, 0, 0, st.w, st.y);
      assert.ok(paperShare(img, 0, 0, st.w, st.y) < 0.25, `${sw}x${sh}: paper left in the sky above the world`);
      assert.ok(top.size >= 2, `${sw}x${sh}: the sky band is one flat tone`);
      const bottom = tones(img, 0, st.y + H, st.w, st.h);
      assert.ok(!bottom.has(3), `${sw}x${sh}: paper left under the world`);
    }
    if (st.x > 0) {
      /* the columns at the sides carry the cliff's foot, not paper */
      const side = new Set();
      for (let y = st.y + H - 12; y < st.y + H; y++) {
        for (let x = 0; x < st.x; x++) side.add(toneAt(img, x, y));
        for (let x = st.x + W; x < st.w; x++) side.add(toneAt(img, x, y));
      }
      assert.ok(!side.has(3), `${sw}x${sh}: paper beside the world's foot`);
      assert.ok(side.has(0) || side.has(1), `${sw}x${sh}: the side bands are not rock`);
    }
  }
});

test("sisyphus app: pause and a quote keep the bands calm and still painted", async () => {
  const a = await bootAt(386, 738, { sisyphus: { summits: 2, seen: ["16", "3"], deck: [], lastQuote: "16" } });
  const game = a.ctx.get("game"), S = a.ctx.get("S"), st = game.stage;
  await climbTo(a, 0.7);
  await a.press("start");
  assert.equal(S.menuOpen, true, "START opens the pause menu");
  await a.run(2);
  let img = a.image();
  assert.ok(paperShare(img, 0, 0, st.w, st.y) < 0.25, "paper above the world while paused");
  assert.ok(!tones(img, 0, st.y + H, st.w, st.h).has(3), "paper below the world while paused");
  const pausedTop = tones(img, 0, 0, st.w, st.y);

  await a.press("b");                    /* back to the climb */
  await a.run(2);
  const q = a.ctx.get("QS").byId["7"];
  game.push("quote", { q: q, n: 3 });
  await a.run(3);
  img = a.image();
  assert.ok(paperShare(img, 0, 0, st.w, st.y) < 0.25, "paper above the world on the quote");
  assert.deepEqual(tones(img, 0, 0, st.w, st.y), pausedTop, "the calm bands do not drift");
  game.pop("skip");
  await a.run(2);
});

test("sisyphus app: a tap or drag started in a band is not a tap on the screen", async () => {
  /* the title at 346 x 518 has a 31-row sky band above the world: a tap there must not start the climb */
  const save = { sisyphus: { summits: 2, seen: ["16", "3"], deck: [], lastQuote: "16" } };
  let a = await bootAt(346, 518, save);
  let game = a.ctx.get("game"), S = a.ctx.get("S"), st = game.stage;
  await tapStage(a.app, game, a.run, 80, 10);
  await a.run(30);
  assert.equal(S.mode, "title", "a top-band tap started the climb");
  await tapStage(a.app, game, a.run, st.x + 80, st.y + 80);
  await a.run(40);                       /* the fade to the climb */
  assert.equal(S.mode, "climb", "a tap on the title itself still starts the climb");

  /* a finger held in the bottom band must not push the stone */
  stageDown(a.app, game, 80, st.y + H + 10);
  await a.run(30);
  assert.equal(S.p, 0, "a bottom-band drag pushed the stone");
  stageUp(a.app, game, 80, st.y + H + 10);
  await a.run(2);
  stageDown(a.app, game, st.x + 80, st.y + 120);
  await a.run(30);
  assert.ok(S.p > 0, "a finger on the world still pushes");
  stageUp(a.app, game, st.x + 80, st.y + 120);
  await a.run(2);

  /* where the press started decides: a drag from the top band onto the world is no push ... */
  S.p = 0.2; S.idle = 0; S.wasPush = false;
  await a.run(1);
  const held = S.p;
  stageDown(a.app, game, st.x + 80, st.y - 5);
  await a.run(1);
  stageMove(a.app, game, st.x + 80, st.y + 120);     /* onto the world, still down */
  await a.run(30);
  assert.equal(S.p, held, "a drag that started in a band pushed the stone once it reached the world");
  stageUp(a.app, game, st.x + 80, st.y + 120);
  await a.run(2);
  /* ... while a drag that starts on the world keeps pushing when it slides off it */
  stageDown(a.app, game, st.x + 80, st.y + 120);
  await a.run(1);
  stageMove(a.app, game, st.x + 80, st.y + H + 10);
  await a.run(30);
  assert.ok(S.p > held, "a drag that started on the world stopped pushing when it left it");
  stageUp(a.app, game, st.x + 80, st.y + H + 10);
  await a.run(2);

  /* the pause menu: a band tap would clamp to the window's edge and close it; it must do nothing */
  await a.press("start");
  assert.equal(S.menuOpen, true);
  await tapStage(a.app, game, a.run, st.x + 80, st.y - 5);
  assert.equal(S.menuOpen, true, "a top-band tap closed the pause menu");

  /* the handbook: a band tap would clamp to the card body and turn a page */
  await a.press("down"); await a.press("a");     /* 语录 */
  await a.run(2);
  assert.ok(S.galleryList.length >= 2, "the handbook has the two saved lines");
  assert.equal(S.galleryIndex, 0);
  await tapStage(a.app, game, a.run, st.x + 80, st.y - 5);
  assert.equal(S.galleryIndex, 0, "a top-band tap turned a page of the handbook");
  await a.press("b");
});
