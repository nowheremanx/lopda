// 滥竽充数 / Fake Yu on lo-game 1.5.0's fill layout: the court covers the phone edge to edge at the five
// sizes from sdk/UI.md 13, the bands are painted (never paper) on the title, the rhythm stage and the pause,
// and fill off still contains. The world stays 160 x 144 throughout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJSON, runScript } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const LoGame = runScript("sdk/lo-game.js").LoGame;
const APP = join(ROOT, "registry/apps/fake-yu/index.html");
const SRC = join(ROOT, "registry/apps/fake-yu/src/game.js");
const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];
const W = 160, H = 144;
/* the four tones as the app draws them */
const TONES = [[0x1f, 0x2a, 0x14], [0x4a, 0x5a, 0x32], [0x7d, 0x8a, 0x58], [0xa3, 0xad, 0x7e]];
function toneAt(img, x, y) {
  const o = (y * img.width + x) * 4, d = img.data;
  for (let i = 0; i < 4; i++) if (d[o] === TONES[i][0] && d[o + 1] === TONES[i][1] && d[o + 2] === TONES[i][2]) return i;
  throw new Error(`pixel ${x},${y} is not one of the four tones`);
}

test("fake-yu fill: the canvas covers the stage edge to edge at every size", () => {
  for (const [sw, sh] of SIZES) {
    const L = LoGame.fillLayout(sw, sh, W, H);
    assert.ok(L.w * L.k >= sw - 1e-9, `${sw}x${sh}: ${L.w}x${L.k} is narrower than the stage`);
    assert.ok(L.h * L.k >= sh - 1e-9, `${sw}x${sh}: ${L.h}x${L.k} is shorter than the stage`);
    assert.ok(L.w * L.k - sw < L.k, `${sw}x${sh}: ${L.w * L.k - sw} css px of paper at the sides`);
    assert.ok(L.h * L.k - sh < L.k, `${sw}x${sh}: ${L.h * L.k - sh} css px of paper above or below`);
    /* the world is whole and centred in the canvas */
    assert.ok(L.x >= 0 && L.y >= 0 && L.x + W <= L.w && L.y + H <= L.h, `${sw}x${sh}: the world is cut`);
    assert.equal(L.x, Math.floor((L.w - W) / 2), `${sw}x${sh}: the world is not centred across`);
    assert.equal(L.y, Math.floor((L.h - H) / 2), `${sw}x${sh}: the world is not centred down`);
  }
});

test("fake-yu fill: fill off still contains the world, at dpr 1 and 3", () => {
  for (const dpr of [1, 3]) for (const [sw, sh] of SIZES) {
    const c = LoGame.containLayout(sw, sh, W, H, dpr);
    assert.ok(c.k <= Math.min(sw / W, sh / H) + 1e-9, `${sw}x${sh} dpr ${dpr}: contain grew past the stage`);
    assert.ok(c.w <= sw + 1e-9 && c.h <= sh + 1e-9, `${sw}x${sh} dpr ${dpr}: contain overflows`);
    assert.ok(c.w >= W * c.k - 1 && c.h >= H * c.k - 1, `${sw}x${sh} dpr ${dpr}: the world is squeezed`);
  }
});

/* one run of the app with a fake PAD and a manual clock */
function harness(sw, sh) {
  const on = { press: [], release: [] }, down = new Set();
  let image = null;
  const pad = {
    lang: "zh", spec: "lopda/1",
    on: (type, fn) => { if (on[type]) on[type].push(fn); }, off() {},
    isDown: (b) => down.has(b),
    load: () => Promise.resolve(null), save() {}, remove() {}, exit() {}, sfx() {},
    music: { play() {}, stop() {} }, ambience() {}
  };
  const app = boot(APP, { pad, seed: 5, stage: { w: sw, h: sh }, onPut: (img) => { image = img; } });
  const frame = async (n) => {
    for (let i = 0; i < n; i++) { app.frame(); await app.ctx.get("__yield")(); }
  };
  const press = (b) => { if (down.has(b)) return; down.add(b); on.press.forEach((f) => f(b)); };
  const release = (b) => { if (!down.has(b)) return; down.delete(b); on.release.forEach((f) => f(b)); };
  return { app, game: app.ctx.get("game"), frame, press, release, image: () => image };
}
/* a tap at stage-canvas pixel (sx, sy) through the app-vm's pointer, in CSS pixels of the stage */
function stageTapEvent(h, type, sx, sy) {
  const k = h.game.stage.k;
  h.app.pointer(type, (sx + 0.5) * k - 0.5, (sy + 0.5) * k - 0.5);
}

/* every pixel outside the world, per canvas row: how many are there, how many are paper */
function bandRows(img, st) {
  const rows = [];
  for (let y = 0; y < st.h; y++) {
    let total = 0, paper = 0;
    for (let x = 0; x < st.w; x++) {
      if (x >= st.x && x < st.x + W && y >= st.y && y < st.y + H) continue;   /* the world itself */
      total++;
      if (toneAt(img, x, y) === 3) paper++;
    }
    if (total) rows.push({ y, total, paper });
  }
  return rows;
}
function tonesIn(img, y0, y1) {
  const seen = new Set();
  for (let y = y0; y < y1; y++) for (let x = 0; x < img.width; x++) seen.add(toneAt(img, x, y));
  return seen;
}
function noPaper(rows, label) {
  const bare = rows.find((r) => r.paper === r.total);
  assert.equal(bare, undefined, `${label}: a paper row at y=${bare ? bare.y : "?"}`);
}

test("fake-yu app: is on 2.3.0 and asks lo-game for the court's fill screen", () => {
  assert.equal(readJSON("registry/apps/fake-yu/manifest.json").version, "2.3.0");
  const src = readFileSync(SRC, "utf8");
  assert.match(src, /LoGame\.create\(\{[^}]*fill: true[^}]*bands: paintBands/);
  assert.match(src, /width: 160, height: 144/);
});

test("fake-yu app: the fitted stage covers all five sizes, with no paper in the bands", async () => {
  for (const [sw, sh] of SIZES) {
    const h = harness(sw, sh);
    await h.frame(12);                                     /* boot -> title */
    const want = LoGame.fillLayout(sw, sh, W, H);
    const st = h.game.stage;
    assert.equal(h.game.width, W);
    assert.equal(h.game.height, H);
    for (const key of ["w", "h", "k", "x", "y"]) assert.equal(st[key], want[key], `${sw}x${sh}: another ${key}`);
    assert.ok(st.w * st.k >= sw - 1e-9 && st.h * st.k >= sh - 1e-9, `${sw}x${sh}: paper at an edge`);

    /* the title: the hall's ceiling and boards are painted, and no band row is bare paper */
    let img = h.image();
    let rows = bandRows(img, st);
    assert.ok(rows.length > 0, `${sw}x${sh}: the title has no bands at all`);
    noPaper(rows, `${sw}x${sh} title`);
    if (st.y >= 8) assert.ok(tonesIn(img, 0, st.y).size >= 3, `${sw}x${sh}: the title's ceiling is one flat tone`);
    if (st.h - (st.y + H) >= 8) assert.ok(tonesIn(img, st.y + H, st.h).size >= 3, `${sw}x${sh}: the title's boards are one flat tone`);

    /* the rhythm stage: the curtain above and the boards below, drawn over the whole band */
    h.game.go("play", { i: 0, story: false }, { fade: false });
    await h.frame(3);
    img = h.image();
    rows = bandRows(img, st);
    noPaper(rows, `${sw}x${sh} stage`);
    if (st.y >= 8) assert.ok(tonesIn(img, 0, st.y).size >= 2, `${sw}x${sh}: the stage's curtain is one flat tone`);

    /* the pause: calm and flat, and still no paper */
    h.press("start");
    await h.frame(2);
    h.release("start");
    await h.frame(1);
    assert.ok(h.app.ctx.get("P").pause, `${sw}x${sh}: START did not pause`);
    img = h.image();
    rows = bandRows(img, st);
    noPaper(rows, `${sw}x${sh} pause`);
  }
});

test("fake-yu app: a tap on the scenery is inert in play, and on the how-to page", async () => {
  const h = harness(346, 518);
  await h.frame(12);                                     /* boot -> title */
  h.game.go("play", { i: 0, story: false }, { fade: false });
  const note = h.app.ctx.get("P").chart[0].t;
  for (let i = 0; i < 600 && h.app.ctx.get("P").t < note - 0.01; i++) await h.frame(1);
  const P = h.app.ctx.get("P"), st = h.game.stage;
  assert.ok(P.t >= note - 0.03 && P.t < note, `the run should sit on the first note, t=${P.t}`);
  const before = { score: P.score, noise: P.noise, judged: Object.keys(P.judged).join(","), touchA: P.touchA };
  /* the top band, at the x a world tap would play at */
  stageTapEvent(h, "pointerdown", 80, 4);
  await h.frame(1);
  assert.equal(P.touchA, false, "a band tap held A");
  assert.equal(P.score, before.score, "a band tap scored");
  assert.equal(P.noise, before.noise, "a band tap added noise");
  assert.equal(Object.keys(P.judged).join(","), before.judged, "a band tap judged a note");
  stageTapEvent(h, "pointerup", 80, 4);
  await h.frame(1);
  /* the same tap on the world is still the flute */
  stageTapEvent(h, "pointerdown", 80, st.y + 80);
  await h.frame(1);
  const after = h.app.ctx.get("P");
  assert.ok(after.score > before.score, `a world tap did not play (score ${before.score} -> ${after.score})`);
  stageTapEvent(h, "pointerup", 80, st.y + 80);
  await h.frame(1);

  /* the how-to page turns on a world tap only */
  h.game.go("howto", null, { fade: false });
  await h.frame(15);                                     /* howLock is 0.2 s */
  assert.equal(h.app.ctx.get("howPage"), 0);
  stageTapEvent(h, "pointerdown", 80, 3);
  await h.frame(1);
  stageTapEvent(h, "pointerup", 80, 3);
  await h.frame(1);
  assert.equal(h.app.ctx.get("howPage"), 0, "a band tap turned the how-to page");
  stageTapEvent(h, "pointerdown", 80, st.y + 80);
  await h.frame(1);
  stageTapEvent(h, "pointerup", 80, st.y + 80);
  await h.frame(1);
  assert.equal(h.app.ctx.get("howPage"), 1, "a world tap no longer turns the how-to page");
});

test("fake-yu app: a tap in the side bands does nothing on the title and the song list", async () => {
  const h = harness(600, 300);                           /* shorter than 160:144: the canvas grows side bands */
  await h.frame(12);
  const st = h.game.stage;
  assert.ok(st.x >= 40, `the wide stage should grow side bands, x=${st.x}`);
  const title = h.game.top();
  stageTapEvent(h, "pointerdown", 10, st.y + 127);        /* the 怎么玩 row, out in the left band */
  await h.frame(1);
  stageTapEvent(h, "pointerup", 10, st.y + 127);
  await h.frame(20);                                     /* a go() fade would have swapped the scene by now */
  assert.equal(h.app.ctx.get("titleSel"), 0, "a side-band tap moved the title's selection");
  assert.equal(h.game.top(), title, "a side-band tap left the title");

  h.game.go("select", null, { fade: false });
  await h.frame(15);                                     /* selectLock is 0.18 s */
  const selTop = h.game.top();
  stageTapEvent(h, "pointerdown", 10, st.y + 69);        /* the third row, out in the left band */
  await h.frame(1);
  stageTapEvent(h, "pointerup", 10, st.y + 69);
  await h.frame(20);
  assert.equal(h.app.ctx.get("selectSel"), 0, "a side-band tap changed the song");
  assert.equal(h.game.top(), selTop, "a side-band tap started a song");
});
