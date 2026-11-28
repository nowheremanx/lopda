// 滚珠迷宫 / Marble on lo-game 1.5.0's fill layout: the canvas covers the stage edge to edge at the five
// phone sizes of sdk/UI.md 13, the bands around the 160 x 176 world are the stone wall and flagstones the
// tray stands on rather than paper, and a tap or drag that starts in a band never starts the game, picks a
// level, dismisses a card or pulls the ball.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT, read, readJSON, runScript } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const LoGame = runScript("sdk/lo-game.js").LoGame;
const APP = join(ROOT, "registry", "apps", "tilt-maze", "index.html");
const W = 160, H = 176;
const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];
const TONES = { "31,42,20": 0, "74,90,50": 1, "125,138,88": 2, "163,173,126": 3 };

test("tilt-maze fill: the canvas covers the stage with less than one canvas pixel to spare", () => {
  for (const [sw, sh] of SIZES) {
    const L = LoGame.fillLayout(sw, sh, W, H);
    assert.ok(L.w * L.k >= sw - 1e-9, `${sw}x${sh}: ${L.w} x ${L.k} is narrower than the stage`);
    assert.ok(L.h * L.k >= sh - 1e-9, `${sw}x${sh}: ${L.h} x ${L.k} is shorter than the stage`);
    assert.ok(L.w * L.k - sw < L.k, `${sw}x${sh}: ${L.w * L.k - sw} px over at the sides`);
    assert.ok(L.h * L.k - sh < L.k, `${sw}x${sh}: ${L.h * L.k - sh} px over above or below`);
    assert.ok(L.x >= 0 && L.y >= 0 && L.x + W <= L.w && L.y + H <= L.h, `${sw}x${sh}: the world is cut`);
    assert.equal(L.x, Math.floor((L.w - W) / 2), `${sw}x${sh}: the world is not centred across`);
    assert.equal(L.y, Math.floor((L.h - H) / 2), `${sw}x${sh}: the world is not centred down`);
  }
});

test("tilt-maze fill: 331 x 359 fits by height and grows a jamb each side, not a paper bar", () => {
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

test("tilt-maze fill: with fill off the old containment keeps the world whole in paper", () => {
  /* before 1.5.0, 331 x 359 held a 320 x 352 canvas between paper bars */
  const c = LoGame.containLayout(331, 359, W, H, 1);
  assert.equal(c.w, 320); assert.equal(c.h, 352); assert.equal(c.k, 2);
  for (const [sw, sh] of SIZES) {
    const L = LoGame.containLayout(sw, sh, W, H, 1);
    assert.ok(L.k <= Math.min(sw / W, sh / H) + 1e-9, `${sw}x${sh}: contain grew past the stage`);
    assert.ok(L.w <= Math.ceil(sw) && L.h <= Math.ceil(sh), `${sw}x${sh}: contain overflows`);
  }
});

test("tilt-maze app: is on 2.1.0, on lo-game 1.5.0, and asks for a fill screen with bands", () => {
  assert.equal(readJSON("registry/apps/tilt-maze/manifest.json").version, "2.1.0");
  const src = read("registry/apps/tilt-maze/index.html");
  assert.match(src, /LoGame\.create\(\{ width: 160, height: 176, lang: "zh", fill: true, bands: paintBands \}\)/);
  assert.match(src, /data-lo-game="1\.5\.0"/);
  assert.ok(!/<style/i.test(src.slice(0, src.indexOf("<body"))), "no CSS matte around the canvas");
});

/* ---- the app on a phone-sized stage ---- */
function pad(store) {
  const listeners = {};
  const p = {
    lang: "zh", on(t, fn) { (listeners[t] ||= []).push(fn); }, off() {}, isDown() { return false; }, sfx() {},
    save(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    load(k) { return Promise.resolve(store[k] == null ? null : JSON.parse(JSON.stringify(store[k]))); },
    remove(k) { delete store[k]; }
  };
  p.listeners = listeners;
  return p;
}
const flush = () => new Promise((r) => setImmediate(r));
async function bootAt(sw, sh, store = {}) {
  let last = null;
  const p = pad(store);
  const app = boot(APP, { pad: p, seed: 1, stage: { w: sw, h: sh }, onPut: (img) => { last = img; } });
  const run = async (n = 1) => { for (let i = 0; i < n; i++) { app.frame(); await flush(); } };
  await run(8);
  return { app, pad: p, run, image: () => last, ctx: app.ctx, game: app.ctx.get("game") };
}
async function press(a, b) {
  (a.pad.listeners.press || []).forEach((fn) => fn(b)); await a.run(2);
  (a.pad.listeners.release || []).forEach((fn) => fn(b)); await a.run(1);
}
function stageDown(a, sx, sy) { const st = a.game.stage; a.app.pointerRaw("pointerdown", sx * st.k, sy * st.k); }
function stageMove(a, sx, sy) { const st = a.game.stage; a.app.pointerRaw("pointermove", sx * st.k, sy * st.k); }
function stageUp(a, sx, sy) { const st = a.game.stage; a.app.pointerRaw("pointerup", sx * st.k, sy * st.k); }
async function tapStage(a, sx, sy) {
  stageDown(a, sx, sy); await a.run(2);
  stageUp(a, sx, sy); await a.run(2);
}
function toneAt(img, x, y) {
  const d = img.data, i = (y * img.width + x) * 4;
  return TONES[d[i] + "," + d[i + 1] + "," + d[i + 2]];
}
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
/* the bands: above and below the world, and the jambs beside it */
function bands(img, st) {
  return [
    [0, 0, st.w, st.y],
    [0, st.y + H, st.w, st.h],
    [0, st.y, st.x, st.y + H],
    [st.x + W, st.y, st.w, st.y + H]
  ].filter(([x0, y0, x1, y1]) => x1 > x0 && y1 > y0);
}

test("tilt-maze app: the fitted stage covers all five phone sizes", async () => {
  for (const [sw, sh] of SIZES) {
    const a = await bootAt(sw, sh);
    const game = a.game, st = game.stage;
    assert.equal(game.width, W);
    assert.equal(game.height, H);
    const want = LoGame.fillLayout(sw, sh, W, H);
    for (const key of ["w", "h", "k", "x", "y"]) assert.equal(st[key], want[key], `${sw}x${sh}: the app fitted another ${key}`);
    assert.ok(st.w * st.k >= sw - 1e-9 && st.h * st.k >= sh - 1e-9, `${sw}x${sh}: paper at an edge`);
  }
});

test("tilt-maze app: the bands are stone, never a paper bar, and flat on the title", async () => {
  for (const [sw, sh] of SIZES) {
    const a = await bootAt(sw, sh);
    const st = a.game.stage;
    const img = a.image();
    assert.ok(img.width === st.w && img.height === st.h, `${sw}x${sh}: the frame is not the canvas`);
    for (const [x0, y0, x1, y1] of bands(img, st)) {
      assert.equal(paperShare(img, x0, y0, x1, y1), 0, `${sw}x${sh}: paper in a band`);
    }
    /* the still title gets flat stone: dark, with only the tray's rim lines */
    if (st.y > 0) {
      const top = tones(img, 0, 0, st.w, st.y);
      assert.deepEqual([...top].sort(), [1, 2], `${sw}x${sh}: the title's wall is not flat stone`);
      assert.ok(paperShare(img, 0, 0, st.w, st.y) === 0, `${sw}x${sh}: paper above the title`);
    }
    if (st.h > st.y + H) assert.ok(!tones(img, 0, st.y + H, st.w, st.h).has(3), `${sw}x${sh}: paper below the title`);
  }
});

test("tilt-maze app: play grows a coursed wall above and flagstones below the tray", async () => {
  for (const [sw, sh] of [[346, 518], [386, 738]]) {
    const a = await bootAt(sw, sh);
    const game = a.game, st = game.stage;
    await tapStage(a, st.x + 120, st.y + 160);      /* the title's dark band starts level 1 */
    await a.run(40);
    assert.equal(a.ctx.get("state"), "intro");
    await a.run(120);                              /* the area's card, then the roll */
    assert.equal(a.ctx.get("state"), "roll");
    const img = a.image();
    const top = tones(img, 0, 0, st.w, st.y);
    assert.ok(top.has(0) && top.has(1), `${sw}x${sh}: the wall above the maze is not coursed stone`);
    assert.ok(paperShare(img, 0, 0, st.w, st.y) < 0.25, `${sw}x${sh}: a paper bar above the maze`);
    const bottom = tones(img, 0, st.y + H, st.w, st.h);
    assert.ok(bottom.has(0) && bottom.has(1) && bottom.has(2), `${sw}x${sh}: the floor below the tray is not stone`);
    assert.ok(paperShare(img, 0, st.y + H, st.w, st.h) < 0.1, `${sw}x${sh}: a paper bar below the maze`);
  }
});

test("tilt-maze app: a band tap starts nothing on the title", async () => {
  const a = await bootAt(346, 518);
  const game = a.game, st = game.stage;
  const title = game.top();
  await tapStage(a, st.x + 80, 4);                 /* the wall above the world */
  await a.run(40);
  assert.equal(game.top(), title, "a top-band tap started the game");
  await tapStage(a, st.x + 80, st.y + H + 8);      /* the flagstones below it */
  await a.run(40);
  assert.equal(game.top(), title, "a bottom-band tap started the game");
  await tapStage(a, st.x + 120, st.y + 172);       /* the world's own dark band still starts it */
  await a.run(40);
  assert.equal(game.top(), a.ctx.get("playScene"), "a tap on the title itself did not start");
});

test("tilt-maze app: a band tap picks nothing on the level list", async () => {
  const a = await bootAt(346, 518);
  const game = a.game, st = game.stage;
  await press(a, "down");                          /* the title's DOWN opens the level list */
  await a.run(30);
  const listTop = game.top();
  assert.notEqual(listTop, a.ctx.get("playScene"), "DOWN from the title opens a list");
  await tapStage(a, st.x + 80, 2);
  await a.run(40);
  assert.equal(game.top(), listTop, "a band tap left the level list");
  await tapStage(a, st.x + 80, st.y + H + 6);
  await a.run(40);
  assert.equal(game.top(), listTop, "a band tap on the flagstones left the level list");
  await tapStage(a, st.x + 80, st.y + 16 + 21);    /* the garden's level 1 row */
  await a.run(40);
  assert.equal(game.top(), a.ctx.get("playScene"), "a tap on a row did not start the level");
});

test("tilt-maze app: a band tap or drag never starts the ball, nor skips the area's card", async () => {
  /* at 346 x 518 there are 32 rows of wall above the world and 32 of floor below it */
  const a = await bootAt(346, 518);
  const game = a.game, st = game.stage;
  await tapStage(a, st.x + 120, st.y + 160);        /* start level 1 from the title */
  await a.run(40);
  assert.equal(a.ctx.get("state"), "intro");
  await tapStage(a, st.x + 80, 4);                 /* a band tap would dismiss the card */
  await a.run(20);
  assert.equal(a.ctx.get("state"), "intro", "a band tap skipped the area's card");
  await tapStage(a, st.x + 80, st.y + 60);         /* a tap on the world does carry on */
  await a.run(2);
  assert.equal(a.ctx.get("state"), "roll");

  const ballNow = () => a.ctx.get("ball");
  const reset = async () => { a.ctx.get("placeBall")(); await a.run(2); };
  await reset();
  const x0 = ballNow().x, y0 = ballNow().y;
  stageDown(a, st.x + 80, 3);                      /* a finger held in the wall */
  await a.run(40);
  stageUp(a, st.x + 80, 3);
  assert.equal(ballNow().x, x0); assert.equal(ballNow().y, y0, "a band press moved the ball");

  await reset();
  stageDown(a, st.x + 80, 3);                      /* a drag from the wall onto the maze */
  await a.run(2);
  stageMove(a, st.x + 150, st.y + 40);
  await a.run(40);
  stageUp(a, st.x + 150, st.y + 40);
  assert.equal(ballNow().x, x0); assert.equal(ballNow().y, y0, "a drag that started in a band pulled the ball");

  await reset();
  stageDown(a, st.x + 150, st.y + 40);             /* a finger on the maze still pulls it */
  await a.run(30);
  stageUp(a, st.x + 150, st.y + 40);
  assert.ok(ballNow().x > x0 + 1, "a finger on the world no longer pulls the ball");

  /* the pause menu: a band tap must not close it */
  await a.run(20);
  await press(a, "start");
  await a.run(4);
  assert.equal(a.ctx.get("paused"), true, "START opens the pause menu");
  await tapStage(a, st.x + 80, 4);
  await a.run(6);
  assert.equal(a.ctx.get("paused"), true, "a band tap closed the pause menu");
  await press(a, "b");
  await a.run(4);
  assert.equal(a.ctx.get("paused"), false, "B resumes");
});

test("tilt-maze app: a press is judged where it went down, not where the finger slid by the next frame", async () => {
  /* 346 x 518: the title, a band down two rows under the tray that slides two rows up before the tick */
  let a = await bootAt(346, 518);
  let game = a.game, st = game.stage;
  const title = game.top();
  stageDown(a, st.x + 120, st.y + H + 2);          /* on the flagstones, under the title */
  stageMove(a, st.x + 120, st.y + H - 2);          /* up into the world's dark band, no frame between */
  await a.run(4);
  stageUp(a, st.x + 120, st.y + H - 2);
  await a.run(40);
  assert.equal(game.top(), title, "a band down that slid into the world started the game");

  /* 348 x 323: the jamb on a short stage, a down two columns out that slides five columns in */
  a = await bootAt(348, 323);
  game = a.game; st = game.stage;
  await press(a, "a");                             /* the title starts level 1 from the key */
  await a.run(80);
  if (a.ctx.get("state") === "intro") { await press(a, "a"); await a.run(4); }
  assert.equal(a.ctx.get("state"), "roll");
  const ballNow = () => a.ctx.get("ball");
  const reset = async () => { a.ctx.get("placeBall")(); await a.run(2); };
  await reset();
  const x0 = ballNow().x, y0 = ballNow().y;
  stageDown(a, st.x - 2, st.y + 40);               /* in the left jamb */
  stageMove(a, st.x + 5, st.y + 40);               /* into the maze, no frame between */
  await a.run(30);
  stageUp(a, st.x + 5, st.y + 40);
  assert.equal(ballNow().x, x0); assert.equal(ballNow().y, y0, "a jamb down that slid into the maze pulled the ball");

  /* and the other way: a down on the world keeps pulling after the finger leaves it */
  await reset();
  stageDown(a, st.x + 80, st.y + 40);              /* on the maze */
  stageMove(a, st.x + W + 6, st.y + 40);           /* out into the right jamb, no frame between */
  await a.run(30);
  stageUp(a, st.x + W + 6, st.y + 40);
  assert.ok(ballNow().x > x0 + 1, "a drag that went down on the world stopped pulling when it left it");
});

test("tilt-maze app: pause, the area's card and the tally keep the bands flat and still", async () => {
  const a = await bootAt(386, 738);
  const game = a.game, st = game.stage;
  await tapStage(a, st.x + 120, st.y + 160);
  await a.run(40);
  assert.equal(a.ctx.get("state"), "intro");
  let img = a.image();
  for (const [x0, y0, x1, y1] of bands(img, st)) assert.equal(paperShare(img, x0, y0, x1, y1), 0, "paper on the area's card");
  const cardTop = tones(img, 0, 0, st.w, st.y);

  await a.run(120);
  assert.equal(a.ctx.get("state"), "roll");
  img = a.image();
  assert.notDeepEqual(tones(img, 0, 0, st.w, st.y), cardTop, "the wall during play is not the card's flat stone");

  await press(a, "start");
  await a.run(4);
  assert.equal(a.ctx.get("paused"), true);
  img = a.image();
  for (const [x0, y0, x1, y1] of bands(img, st)) assert.equal(paperShare(img, x0, y0, x1, y1), 0, "paper while paused");
  assert.deepEqual(tones(img, 0, 0, st.w, st.y), cardTop, "the pause does not return the bands to flat stone");

  await press(a, "b");
  await a.run(4);
  const ctx = a.ctx;
  ctx.get("placeBall")();
  const ball = ctx.get("ball"), G0 = ctx.get("G0");
  ball.x = G0.x; ball.y = G0.y;
  await a.run(4);
  assert.equal(ctx.get("state"), "clear");
  img = a.image();
  for (const [x0, y0, x1, y1] of bands(img, st)) assert.equal(paperShare(img, x0, y0, x1, y1), 0, "paper on the tally");
  assert.deepEqual(tones(img, 0, 0, st.w, st.y), cardTop, "the tally does not return the bands to flat stone");
});

