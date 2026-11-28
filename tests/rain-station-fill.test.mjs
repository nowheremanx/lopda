// 雨站 / Rain Station on lo-game 1.5.0's fill layout: the rainy station covers the stage edge to edge at the
// five phone sizes from sdk/UI.md 13 (and a wide desktop stage), the story keeps its 160 x 144 world, and fill
// off keeps the old paper.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJSON, runScript } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const LoGame = runScript("sdk/lo-game.js").LoGame;
const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];
const WIDE = [900, 420];   /* a desktop window: shorter than the world is wide, so the canvas grows sideways */
const LAYOUTS = [...SIZES, WIDE];
const W = 160, H = 144;

test("rain-station fill: the canvas covers the stage with less than one canvas pixel to spare", () => {
  for (const [sw, sh] of LAYOUTS) {
    const L = LoGame.fillLayout(sw, sh, W, H);
    assert.ok(L.w * L.k >= sw - 1e-9, `${sw}x${sh}: ${L.w}x${L.k} is narrower than the stage`);
    assert.ok(L.h * L.k >= sh - 1e-9, `${sw}x${sh}: ${L.h}x${L.k} is shorter than the stage`);
    assert.ok(L.w * L.k - sw < L.k, `${sw}x${sh}: ${L.w * L.k - sw} px of paper at the sides`);
    assert.ok(L.h * L.k - sh < L.k, `${sw}x${sh}: ${L.h * L.k - sh} px of paper above or below`);
    /* the story's world is whole and centred in the canvas */
    assert.ok(L.x >= 0 && L.y >= 0 && L.x + W <= L.w && L.y + H <= L.h, `${sw}x${sh}: the world is cut`);
    assert.equal(L.x, Math.floor((L.w - W) / 2), `${sw}x${sh}: the world is not centred across`);
    assert.equal(L.y, Math.floor((L.h - H) / 2), `${sw}x${sh}: the world is not centred down`);
  }
});

test("rain-station fill: the 348 x 323 Safari stage leaves only a thin band and no paper", () => {
  const L = LoGame.fillLayout(348, 323, W, H);
  assert.equal(L.w, W);
  assert.equal(L.x, 0);
  assert.ok(L.h > H && L.y > 0);
  assert.ok(L.h - H <= 6, `${L.h - H} rows of scenery is more than the short stage leaves`);
});

test("rain-station fill: a wide stage grows sideways, with the story whole in the middle", () => {
  const L = LoGame.fillLayout(...WIDE, W, H);
  assert.ok(L.x > 0 && L.x + W < L.w, `${WIDE.join("x")}: no columns beside the world`);
  assert.equal(L.y, 0);
  assert.equal(L.h, H);
  assert.equal(L.k, WIDE[1] / H);
});

test("rain-station fill: fill off keeps the old contain layout, paper and all", () => {
  /* 331 x 359 has room for the 160 x 144 world at 2x, the old 320 x 288 postage stamp */
  const c = LoGame.containLayout(331, 359, W, H, 1);
  assert.equal(c.w, 320); assert.equal(c.h, 288); assert.equal(c.k, 2);
  assert.ok(c.w <= 331 && c.h <= 359, "containment never overflows the stage");
  for (const [sw, sh] of LAYOUTS) {
    const L = LoGame.containLayout(sw, sh, W, H, 1);
    assert.ok(L.k <= Math.min(sw / W, sh / H) + 1e-9, `${sw}x${sh}: contain grew past the stage`);
    assert.ok(L.w <= Math.ceil(sw) && L.h <= Math.ceil(sh), `${sw}x${sh}: contain overflows`);
  }
});

/* the app, booted on a stage: run frames, PAD keys and taps in page CSS pixels, and the last canvas image */
const APP = join(ROOT, "registry/apps/rain-station/index.html");
const PAPER_TONE = "163,173,126";   /* tone 3, #a3ad7e */
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
function stageApp(sw, sh, onPut) {
  const on = { press: [], release: [] };
  const pad = {
    lang: "zh", spec: "lopda/1", on: (type, f) => { if (on[type]) on[type].push(f); }, off() {}, isDown: () => false,
    load: () => Promise.resolve(null), save() {}, remove() {}, exit() {}, sfx() {},
    music: { play() {}, stop() {} }, ambience() {}
  };
  const app = boot(APP, { pad, seed: 3, stage: { w: sw, h: sh }, onPut });
  const run = async (n) => { for (let i = 0; i < n; i++) { app.frame(); await app.ctx.get("__yield")(); } };
  const key = async (b) => { on.press.forEach((f) => f(b)); await run(2); on.release.forEach((f) => f(b)); await run(4); };
  /* app-vm's pointer leaves the point in CSS pixels when it is given the default 160 x 144 screen */
  const tap = async (x, y) => { app.pointer("pointerdown", x, y); await run(2); app.pointer("pointerup", x, y); await run(4); };
  return { app, run, key, tap };
}
/* every row above or below the world, and every column beside it on a wide stage, must have been painted:
   losing a band leaves whole rows (or columns) of bare PAPER, so bound the PAPER a band may hold. The
   busiest real row is the platform's dashed lip at 96 of 160 (60%); the dawn sky dither is 50%. */
function assertScenery(shot, st, label) {
  assert.ok(shot, `${label}: nothing was drawn`);
  const tone = (x, y) => {
    const o = (y * shot.width + x) * 4;
    return shot.data[o] + "," + shot.data[o + 1] + "," + shot.data[o + 2];
  };
  let rowMax = 0;
  for (let y = 0; y < shot.height; y++) {
    if (y >= st.y && y < st.y + H) continue;
    let paper = 0;
    for (let x = 0; x < shot.width; x++) if (tone(x, y) === PAPER_TONE) paper++;
    rowMax = Math.max(rowMax, paper);
    assert.ok(paper <= shot.width * 0.6, `${label}: row ${y} is ${paper}/${shot.width} paper`);
  }
  assert.ok(rowMax <= shot.width * 0.75, `${label}: a row is ${rowMax}/${shot.width} paper`);
  for (let x = 0; x < shot.width; x++) {
    if (x >= st.x && x < st.x + W) continue;
    let paper = 0;
    for (let y = st.y; y < st.y + H; y++) if (tone(x, y) === PAPER_TONE) paper++;
    assert.ok(paper <= H * 0.6, `${label}: column ${x} is ${paper}/${H} paper`);
  }
}
/* the screens with their own bands: title (night), chapter card and log and choice (calm), end card (dawn) */
const STATES = ["title", "chapter", "log", "choice", "end"];
async function stateShot(sw, sh, state) {
  let shot = null;
  const { app, run, key } = stageApp(sw, sh, (img) => { shot = img; });
  await settle();
  await run(10);
  const game = app.ctx.get("game"), STORY = app.ctx.get("STORY"), v = app.ctx.get("SAVE_VERSION");
  if (state === "chapter") { game.go("play", null, { fade: false }); await run(6); }
  else if (state === "log") {
    const at = STORY.findIndex((s, i) => i > 0 && s.text && !s.when);
    game.go("play", { v, at, flags: {}, scene: "outside", stage: { rain: 2 } }, { fade: false });
    await run(6); await key("b"); await run(6);
  } else if (state === "choice") {
    const at = STORY.findIndex((s) => s.choice);
    game.go("play", { v, at, flags: {}, scene: "waiting", stage: { dad: "bench", board: true } }, { fade: false });
    await run(6);
  } else if (state === "end") {
    const at = STORY.findIndex((s) => s.end);
    game.go("play", { v, at, flags: {}, scene: "platform", stage: { rain: 0 } }, { fade: false });
    await run(6);
  }
  await run(2);
  return { shot, st: game.stage };
}

test("rain-station app: is on 3.1.0 and asks lo-game for a fill screen", () => {
  assert.equal(readJSON("registry/apps/rain-station/manifest.json").version, "3.1.0");
  const src = readFileSync(join(ROOT, "registry/apps/rain-station/src/player.js"), "utf8");
  assert.match(src, /LoGame\.create\(\{[^}]*fill: true[^}]*bands: paintBands/);
});

test("rain-station app: every stage is filled edge to edge", async () => {
  for (const [sw, sh] of LAYOUTS) {
    const { app } = stageApp(sw, sh);
    await settle();
    for (let i = 0; i < 5; i++) app.frame();
    const game = app.ctx.get("game"), st = game.stage;
    assert.equal(game.width, W);
    assert.equal(game.height, H);
    const want = LoGame.fillLayout(sw, sh, W, H);
    for (const key of ["w", "h", "k", "x", "y"]) assert.equal(st[key], want[key], `${sw}x${sh}: the app fitted another ${key}`);
    assert.ok(st.w * st.k >= sw - 1e-9 && st.h * st.k >= sh - 1e-9, `${sw}x${sh}: paper at an edge`);
  }
});

test("rain-station app: no bare paper outside the world, on the title, a calm screen or the end card", async () => {
  for (const [sw, sh] of LAYOUTS) {
    for (const state of STATES) {
      const { shot, st } = await stateShot(sw, sh, state);
      assertScenery(shot, st, `${sw}x${sh} ${state}`);
    }
  }
});

/* lo-game clamps a tap in the scenery to the near edge of the world, so the app gates pointer presses
   to the world's rect: a tap on the rainy sky or the platform must not advance the story, choose, pick a
   title row or close the log, while a tap on the world itself must still work */
test("rain-station app: a tap in the scenery bands is inert; a tap inside the world still acts", async () => {
  const SW = 331, SH = 359, K = SW / W, TOP = Math.floor((Math.ceil(SH / K) - H) / 2);
  const { app, run, key, tap } = stageApp(SW, SH);
  await settle();
  await run(10);

  const game = app.ctx.get("game"), STORY = app.ctx.get("STORY");
  const at = STORY.findIndex((s, i) => i > 0 && s.text && !s.when);
  game.go("play", { v: app.ctx.get("SAVE_VERSION"), at, flags: {}, scene: "outside", stage: { rain: 2 } });
  await run(90);   /* the line types out */
  assert.equal(app.ctx.get("cur").kind, "say");

  /* the top band ends on the world's first row and the bottom band on its last, both clamped by lo-game */
  assert.ok(TOP > 2, "the short phone has a scenery band to tap");
  await tap(80, 2);
  await tap(80, SH - 2);
  assert.equal(app.ctx.get("S").at, at, "a tap in the scenery advanced the story");

  await tap(80, Math.round(SH * 0.62));   /* a point on the picture, inside the world */
  assert.notEqual(app.ctx.get("S").at, at, "a tap in the world did not advance the story");
  await run(60);

  await key("b");
  assert.equal(app.ctx.get("view"), "log");
  await tap(80, 2);
  assert.equal(app.ctx.get("view"), "log", "a tap in the scenery closed the log");
  await tap(80, Math.round(SH * 0.62));
  assert.equal(app.ctx.get("view"), "play", "a tap in the world did not close the log");

  /* the title's menu is in the world; the scenery above and below it does nothing */
  game.go("title", null, { fade: false });
  await run(20);
  assert.equal(app.ctx.get("titleOn"), true);
  await tap(80, 2);
  assert.equal(app.ctx.get("titleOn"), true, "a tap in the scenery started the story from the title");
  await tap(80, Math.round(SH * 0.7));   /* the first menu row, in the box */
  await run(40);                          /* go() fades out before the play scene enters */
  assert.equal(app.ctx.get("titleOn"), false, "a tap on the title's menu row did not start");
});

test("rain-station app: a band tap leaves a choice alone; a tap on a row picks it", async () => {
  const SW = 331, SH = 359;
  const { app, run, tap } = stageApp(SW, SH);
  await settle();
  await run(10);
  const game = app.ctx.get("game"), STORY = app.ctx.get("STORY"), v = app.ctx.get("SAVE_VERSION");
  const at = STORY.findIndex((s) => s.choice);
  game.go("play", { v, at, flags: {}, scene: "waiting", stage: { dad: "bench", board: true } }, { fade: false });
  await run(8);
  const S = app.ctx.get("S"), cur = app.ctx.get("cur");
  assert.equal(cur.kind, "choice");
  const idx = cur.idx, picked = cur.items[1].set;

  await tap(80, 2);          /* the sky above the picture */
  await tap(80, SH - 2);     /* the platform under the box */
  assert.equal(S.at, at, "a tap in the scenery advanced the choice");
  assert.equal(cur.idx, idx, "a tap in the scenery moved the choice cursor");

  const lay = game.stage, row = app.ctx.get("choiceRow")(1, 2);
  await tap((row.x + row.w / 2 + lay.x) * lay.k, (row.y + row.h / 2 + lay.y) * lay.k);
  assert.equal(S.flags[picked], true, "a tap on the world row did not pick it");
  assert.notEqual(S.at, at, "a tap on the world row did not advance");
});
