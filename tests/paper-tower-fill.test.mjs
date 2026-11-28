// 纸塔 / Paper Tower on lo-game 1.5.0's fill layout and lo-title 0.1.0: the canvas covers the five phone
// stages from sdk/UI.md 13 with the world whole and centred, a tap that starts in the bands is not a world
// tap, and the fog title is the app's title screen with the save state's items.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT, read, readJSON, runScript } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const LoGame = runScript("sdk/lo-game.js").LoGame;
const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];
const W = 160, H = 144;
const APP = join(ROOT, "registry/apps/paper-tower/index.html");
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };

/* a PAD that delivers presses the way the runtime does, so the game's own PAD.on("press") receives them */
function padFor(lang, store) {
  const on = { press: [], release: [] };
  return {
    lang: lang || "zh", spec: "lopda/1",
    on(type, f) { (on[type] = on[type] || []).push(f); },
    off() {}, isDown() { return false; }, sfx() {}, exit() {},
    load(k) { return Promise.resolve(store && store[k] != null ? JSON.parse(JSON.stringify(store[k])) : null); },
    save(k, v) { if (store) store[k] = JSON.parse(JSON.stringify(v)); },
    remove(k) { if (store) delete store[k]; },
    press(b) { (on.press || []).forEach((f) => f(b)); },
    release(b) { (on.release || []).forEach((f) => f(b)); }
  };
}
async function frames(app, n) {
  for (let i = 0; i < n; i++) { app.frame(); await settle(); }
}
async function tap(app, pad, b) {
  pad.press(b); await frames(app, 2);
  pad.release(b); await frames(app, 2);
}
/* 新的一页 from the title, the fade, and the first visit's three-page intro */
async function startPlay(app, pad) {
  await frames(app, 10);
  await tap(app, pad, "a");
  await frames(app, 60);
  for (let i = 0; i < 14 && app.ctx.get("busy"); i++) await tap(app, pad, "a");
  await frames(app, 4);
}

test("paper-tower fill: the canvas covers the stage with less than one canvas pixel to spare", () => {
  for (const [sw, sh] of SIZES) {
    const L = LoGame.fillLayout(sw, sh, W, H);
    assert.ok(L.w * L.k >= sw - 1e-9, `${sw}x${sh}: ${L.w}x${L.k} is narrower than the stage`);
    assert.ok(L.h * L.k >= sh - 1e-9, `${sw}x${sh}: ${L.h}x${L.k} is shorter than the stage`);
    assert.ok(L.w * L.k - sw < L.k, `${sw}x${sh}: ${L.w * L.k - sw} px of paper at the sides`);
    assert.ok(L.h * L.k - sh < L.k, `${sw}x${sh}: ${L.h * L.k - sh} px of paper above or below`);
    assert.ok(L.x >= 0 && L.y >= 0 && L.x + W <= L.w && L.y + H <= L.h, `${sw}x${sh}: the world is cut`);
    assert.equal(L.x, Math.floor((L.w - W) / 2), `${sw}x${sh}: the world is not centred across`);
    assert.equal(L.y, Math.floor((L.h - H) / 2), `${sw}x${sh}: the world is not centred down`);
  }
});

test("paper-tower fill: a short or wide stage fits by height and grows wider", () => {
  /* 160 x 144 is shorter than 160 x 160, so these phone stages fit by width; a genuinely short, wide
     stage (a desktop window) grows the canvas sideways and the world stays whole */
  const L = LoGame.fillLayout(700, 300, W, H);
  assert.ok(L.w > W, "a wide, short stage grows wider than the world");
  assert.equal(L.h, H);
  assert.equal(L.y, 0);
  assert.ok(L.x > 0 && L.x + W <= L.w, "the world is centred in the wider canvas");
  assert.equal(L.k, 300 / H);
});

test("paper-tower fill: fill off keeps the old contain layout, paper and all", () => {
  const c = LoGame.containLayout(331, 359, W, H, 1);
  assert.equal(c.w, 320); assert.equal(c.h, 288); assert.equal(c.k, 2);
  for (const [sw, sh] of SIZES) {
    const L = LoGame.containLayout(sw, sh, W, H, 1);
    assert.ok(L.k <= Math.min(sw / W, sh / H) + 1e-9, `${sw}x${sh}: contain grew past the stage`);
    assert.ok(L.w <= Math.ceil(sw) && L.h <= Math.ceil(sh), `${sw}x${sh}: contain overflows`);
  }
});

test("paper-tower app: is on 2.1.0 and asks lo-game for a fill screen with bands", () => {
  assert.equal(readJSON("registry/apps/paper-tower/manifest.json").version, "2.1.0");
  const src = read("registry/apps/paper-tower/src/game.js");
  assert.match(src, /LoGame\.create\(\{[^}]*width: 160, height: 144[^}]*fill: true[^}]*bands: paintBands/);
  const html = read("registry/apps/paper-tower/index.html");
  assert.match(html, /<script data-lo-title="0\.1\.0">/);
  assert.match(html, /<script data-lo-game="1\.5\.0">/);
});

test("paper-tower app: the fitted stage covers all five phone sizes", async () => {
  for (const [sw, sh] of SIZES) {
    const app = boot(APP, { pad: padFor("zh"), seed: 3, stage: { w: sw, h: sh } });
    await settle(); await frames(app, 3);
    const game = app.ctx.get("game"), st = game.stage;
    assert.equal(game.width, W);
    assert.equal(game.height, H);
    const want = LoGame.fillLayout(sw, sh, W, H);
    for (const key of ["w", "h", "k", "x", "y"]) assert.equal(st[key], want[key], `${sw}x${sh}: the app fitted another ${key}`);
    assert.ok(st.w * st.k >= sw - 1e-9 && st.h * st.k >= sh - 1e-9, `${sw}x${sh}: paper at an edge`);
  }
});

test("paper-tower app: a press that starts in the bands does not walk or act", async () => {
  const p = padFor("zh");
  const app = boot(APP, { pad: p, seed: 3, stage: { w: 331, h: 359 } });
  await startPlay(app, p);
  const game = app.ctx.get("game"), st = game.stage;
  const S = app.ctx.get("S"), hero = app.ctx.get("p");
  assert.equal(app.ctx.get("playScene"), game.top(), "the play scene is up");
  assert.equal(S.flags.intro, true);
  assert.equal(app.ctx.get("busy"), false, "the intro is over");
  assert.equal(game.pointer.pressed, false);

  /* the band above the world: a tap there clamps the pointer to y 0, which used to be a world tap */
  const steps = S.steps, sx = S.x, sy = S.y, toast = app.ctx.get("toastMsg");
  game.pointer.pressed = true;
  game.pointer.stageX = st.x + 80; game.pointer.stageY = st.y - 1;
  game.pointer.x = 80; game.pointer.y = 0;
  game.top().update(1 / 60);
  assert.equal(S.steps, steps, "a top-band tap walked");
  assert.equal(S.x, sx); assert.equal(S.y, sy, "a top-band tap moved the hero");
  assert.equal(app.ctx.get("toastMsg"), toast, "a top-band tap acted on the page");
  assert.equal(hero.moving, null, "a top-band tap started a walk");

  /* a band below the world clamps to the last world row, which used to walk south */
  game.pointer.pressed = true;
  game.pointer.stageX = st.x + 80; game.pointer.stageY = st.y + H + 1;
  game.pointer.x = 80; game.pointer.y = H - 1;
  game.top().update(1 / 60);
  assert.equal(S.x, sx); assert.equal(S.y, sy, "a bottom-band tap moved the hero");
  assert.equal(hero.moving, null, "a bottom-band tap started a walk");

  /* and the world's own tile under the hero is still a tap: it talks to the page */
  const cam = app.ctx.get("camera")();
  const px = S.x * app.ctx.get("TS") + 8 - cam.x, py = app.ctx.get("HUD") + S.y * app.ctx.get("TS") + 8 - cam.y;
  game.pointer.pressed = true;
  game.pointer.stageX = st.x + px; game.pointer.stageY = st.y + py;
  game.pointer.x = px; game.pointer.y = py;
  game.top().update(1 / 60);
  assert.ok(app.ctx.get("toastT") > 0, "a tap inside the world still acts");
});

test("the title is the shared fog screen over a tower cover with a calm lower third", async () => {
  const p = padFor("zh");
  const app = boot(APP, { pad: p, seed: 3, stage: { w: 331, h: 359 } });
  await settle(); await frames(app, 3);
  assert.ok(app.ctx.get("titleCanvas"), "the title canvas is mounted");
  assert.ok(app.ctx.get("titleMenu"), "LoTitle.mount made the menu");
  assert.equal(app.ctx.get("S"), null);

  const cover = app.ctx.get("PT").titleCover;
  assert.equal(cover.W, 208); assert.equal(cover.H, 156);
  const px = cover.draw();
  assert.equal(px.length, cover.W * cover.H);
  const tones = new Set(px);
  for (const t of tones) assert.ok(t >= 0 && t <= 3, `a tone outside the palette: ${t}`);
  assert.ok(tones.size >= 3, "the cover uses paper, mid and dark/ink");
  let tower = 0;
  for (let y = 40; y < 92; y++) for (let x = 60; x < 148; x++) if (px[y * 208 + x] === 0 || px[y * 208 + x] === 1) tower++;
  assert.ok(tower > 500, `the tower reads in the upper two thirds (${tower} lit pixels)`);
  for (let y = 110; y < 156; y++) for (let x = 0; x < 208; x++) {
    assert.equal(px[y * 208 + x], 2, `the calm lower third is not flat at ${x},${y}`);
  }
});

test("the title menu lists the save state's items and A starts 新的一页", async () => {
  const p = padFor("zh");
  const app = boot(APP, { pad: p, seed: 3, stage: { w: 331, h: 359 } });
  await settle(); await frames(app, 6);
  const spec = app.ctx.get("titleSpec")();
  assert.deepEqual(spec.items.map((i) => i.label), ["新的一页", "读取存档", "怎么玩"]);
  assert.ok(spec.hint.includes("A"));
  assert.ok(spec.note.length > 0);
  assert.equal(app.ctx.get("titleMenu").index(), 0);

  await tap(app, p, "down");
  assert.equal(app.ctx.get("titleMenu").index(), 1, "down rolls the menu");
  await tap(app, p, "up");
  assert.equal(app.ctx.get("titleMenu").index(), 0, "up rolls it back");

  await tap(app, p, "a");
  await frames(app, 60);
  assert.ok(app.ctx.get("S"), "A on 新的一页 makes a run");
  for (let i = 0; i < 14 && app.ctx.get("busy"); i++) await tap(app, p, "a");
  await frames(app, 4);
  assert.equal(app.ctx.get("playScene"), app.ctx.get("game").top(), "the play scene is up");
});

test("with a run on card the title offers 继续 with its page, and A continues it", async () => {
  const store = { auto: { v: 3, floor: 3 }, meta: { cleared: true } };
  const p = padFor("en", store);
  const app = boot(APP, { pad: p, seed: 3, stage: { w: 386, h: 606 } });
  await settle(); await frames(app, 12);
  const spec = app.ctx.get("titleSpec")();
  assert.equal(spec.items[0].label, "Continue");
  assert.equal(spec.items[0].status, "page 3");
  assert.equal(spec.note, "the lamp is lit", "the record is on the bar");
  assert.equal(app.ctx.get("titleSpec")().acts[0], "continue");

  await tap(app, p, "a");
  await frames(app, 60);
  assert.equal(app.ctx.get("S").floor, 3, "the run on card is the one that plays");
  for (let i = 0; i < 14 && app.ctx.get("busy"); i++) await tap(app, p, "a");
  await frames(app, 4);
  assert.equal(app.ctx.get("playScene"), app.ctx.get("game").top());
});
