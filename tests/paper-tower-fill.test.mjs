// 纸塔 / Paper Tower on lo-game 1.5.0's fill layout and lo-title 0.1.1: the canvas covers the five phone
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

test("paper-tower app: is on 2.1.1 and asks lo-game for a fill screen with bands", () => {
  assert.equal(readJSON("registry/apps/paper-tower/manifest.json").version, "2.1.1");
  const src = read("registry/apps/paper-tower/src/game.js");
  assert.match(src, /LoGame\.create\(\{[^}]*width: 160, height: 144[^}]*fill: true[^}]*bands: paintBands/);
  assert.match(src, /PT\.FRAME\.draw\(s, i, \{/, "the bands are the page frame");
  assert.doesNotMatch(src, /bandWall|bandFloor/, "the old brick wall and floor are gone");
  const html = read("registry/apps/paper-tower/index.html");
  assert.match(html, /<script data-lo-title="0\.1\.1">/);
  assert.match(html, /<script data-lo-game="1\.5\.0">/);
});

/* a drawing surface backed by a tone buffer, enough for PT.FRAME (rect, line, frame, text, clear) */
function frameSurface(w, h) {
  const px = new Uint8Array(w * h).fill(3);
  const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = c; };
  const s = {
    width: w, height: h, px,
    clear(c) { px.fill(c == null ? 3 : c); },
    pixel: put,
    rect(x, y, ww, hh, c) {
      x = Math.round(x); y = Math.round(y); ww = Math.round(ww); hh = Math.round(hh);
      for (let j = 0; j < hh; j++) for (let i = 0; i < ww; i++) put(x + i, y + j, c);
    },
    line(x0, y0, x1, y1, c) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
    },
    frame(x, y, ww, hh, c) { s.rect(x, y, ww, 1, c); s.rect(x, y + hh - 1, ww, 1, c); s.rect(x, y, 1, hh, c); s.rect(x + ww - 1, y, 1, hh, c); },
    textCalls: 0,
    text() { s.textCalls++; return 12; }
  };
  return s;
}
const frameTone = (s, x, y) => s.px[y * s.width + x];
const countRow = (s, y, tone, x0 = 0, x1 = s.width) => {
  let n = 0;
  for (let x = x0; x < x1; x++) if (frameTone(s, x, y) === tone) n++;
  return n;
};
const countCol = (s, x, tone, y0 = 0, y1 = s.height) => {
  let n = 0;
  for (let y = y0; y < y1; y++) if (frameTone(s, x, y) === tone) n++;
  return n;
};

test("paper-tower frame: tall margins cap the frame and pattern the rest of the mat", () => {
  const FRAME = runScript("registry/apps/paper-tower/src/art.js", { LoGame: { sprites: (t) => t } }).PT.FRAME;
  const [sw, sh] = [386, 606];
  const L = LoGame.fillLayout(sw, sh, W, H);
  const s = frameSurface(L.w, L.h);
  FRAME.draw(s, { w: L.w, h: L.h, x: L.x, y: L.y, worldW: W, worldH: H },
    { calm: false, floor: 3, pages: 12 });

  /* the row above the world is the page's paper margin, not a brick wall or a floor (the leaf's
     edge rules run down the sides, so check the span inside them) */
  for (let x = 6; x < L.w - 6; x++) assert.equal(frameTone(s, x, L.y - 1), 3, `paper above the status bar at x ${x}`);
  for (let x = 6; x < L.w - 6; x++) assert.equal(frameTone(s, x, L.y - 2), 3, `paper two rows above the status bar at x ${x}`);
  for (let y = 0; y < L.y; y++) assert.equal(countRow(s, y, 1), 0, `the top margin has no dark scenery on row ${y}`);

  /* the picture's own frame is 20 canvas pixels: inner rule, sewn line, bold outer edge */
  assert.ok(countRow(s, 2, 0) > L.w * 0.9, "the outer rule runs around the page");
  assert.ok(countRow(s, 4, 2) > L.w * 0.9, "the second rule is a lighter page edge");
  assert.ok(countRow(s, L.y - 3, 0) > L.w * 0.9, "an ink rule closes the picture at the top");
  const stitch = countRow(s, L.y - 6, 0);
  assert.ok(stitch > 60 && stitch < L.w * 0.8, `the sewn line is dashed (${stitch} inked pixels)`);
  assert.ok(countRow(s, L.y - 17, 0) > L.w * 0.9, "the picture's frame closes at 17 px");
  assert.ok(countRow(s, L.y - 19, 2) > L.w * 0.9, "a lighter page edge closes it at 19 px");
  assert.ok(countRow(s, L.y + H + 17, 0) > L.w * 0.9, "the foot's frame is the same thickness");

  /* beyond the frame is a patterned mat, not blank paper: diamonds in the outer margin.
     The fill layout centres the world, so the two mats are the same depth; both carry the grid. */
  assert.equal(L.y, L.h - (L.y + H), "the top and bottom mats are the same depth");
  assert.ok(countRow(s, 12, 2) > 8, "the top mat's diamond row is drawn");
  const bottomRow = 12 + 12 * Math.ceil((L.y + H + 20 - 12) / 12);
  assert.ok(countRow(s, bottomRow, 2) > 8, "the bottom mat's diamond row is drawn");

  /* a small printer's ornament above the picture; no running head in the band at all */
  let ornament = 0;
  for (let y = L.y - 17; y < L.y - 8; y++) for (let x = 64; x < 96; x++) if (frameTone(s, x, y) === 0 || frameTone(s, x, y) === 2) ornament++;
  assert.ok(ornament > 30, `the small ornament is drawn (${ornament} pixels)`);
  assert.equal(s.textCalls, 0, "no engine-font running head in the bands");

  /* twelve page tabs at the foot, pages read solid, the open page inked, the rest waiting faintly */
  const ty = L.y + H + 8, tw = 5, gap = 2, total = 12 * tw + 11 * gap, tx = Math.round((L.w - total) / 2);
  assert.equal(frameTone(s, tx + 2, ty + 5), 0, "a page already read has its dark tab edge");
  const cur = tx + 2 * (tw + gap);
  assert.equal(frameTone(s, cur, ty + 2), 0, "the page being read is an inked tab");
  assert.equal(frameTone(s, cur + 2, ty + 2), 3, "the open tab has its paper slit");
  for (let i = 3; i < 12; i++) assert.equal(frameTone(s, tx + i * (tw + gap) + 2, ty + 5), 2, `page tab ${i + 1} waits`);

  /* the whole frame stays paper, ink and mid: no dark fill that could pass for scenery */
  const tones = new Set(s.px);
  assert.deepEqual([...tones].sort(), [0, 2, 3], "the frame uses paper, mid and ink only");
});

test("paper-tower frame: landscape side gutters wear the same mat, rules and folded corners", () => {
  const FRAME = runScript("registry/apps/paper-tower/src/art.js", { LoGame: { sprites: (t) => t } }).PT.FRAME;
  const [sw, sh] = [738, 386];
  const L = LoGame.fillLayout(sw, sh, W, H);
  assert.equal(L.y, 0, "a landscape stage fits by height, with no top band");
  assert.ok(L.x >= 28, "the side gutters are deep enough for the mat");
  const s = frameSurface(L.w, L.h);
  FRAME.draw(s, { w: L.w, h: L.h, x: L.x, y: L.y, worldW: W, worldH: H }, { calm: false, floor: 5, pages: 12 });

  /* the weave is in the horizontal gutters too, not just the portrait top and bottom */
  assert.ok(countRow(s, 12, 2, 2, L.x - 20) > 4, "the left mat has its diamond row");
  assert.ok(countRow(s, 12, 2, L.x + W + 20, L.w - 2) > 4, "the right mat has its diamond row");
  assert.ok(countCol(s, 6, 2) > L.h * 0.9, "the left page edge runs down the gutter");
  assert.ok(countCol(s, L.w - 6, 2) > L.h * 0.9, "the right page edge runs down the gutter");

  /* the same capped side frame: inner rule, dashed seam, bold double outer edge */
  assert.ok(countCol(s, L.x - 3, 0) > L.h * 0.9, "the inner rule runs beside the picture");
  const seam = countCol(s, L.x - 6, 0);
  assert.ok(seam > 50 && seam < L.h * 0.9, `the side seam is dashed (${seam} inked pixels)`);
  assert.ok(countCol(s, L.x - 17, 0) > L.h * 0.8, "the frame closes at 17 px on the left");
  assert.ok(countCol(s, L.x + W + 17, 0) > L.h * 0.8, "the frame closes at 17 px on the right");

  /* all four stage corners fold, though there is no top or bottom band */
  assert.equal(frameTone(s, 0, 0), 2, "top-left folded");
  assert.equal(frameTone(s, L.w - 1, 0), 2, "top-right folded");
  assert.equal(frameTone(s, 0, L.h - 1), 2, "bottom-left folded");
  assert.equal(frameTone(s, L.w - 1, L.h - 1), 2, "bottom-right folded");
  for (let y = 0; y < L.h; y++) assert.equal(countRow(s, y, 1), 0, `no dark scenery on row ${y}`);
  const tones = new Set(s.px);
  assert.deepEqual([...tones].sort(), [0, 2, 3], "the landscape frame uses paper, mid and ink only");
});

test("paper-tower frame: a thin frame keeps its rules and corners, and still no wall above the status bar", () => {
  const FRAME = runScript("registry/apps/paper-tower/src/art.js", { LoGame: { sprites: (t) => t } }).PT.FRAME;
  const [sw, sh] = [331, 359];
  const L = LoGame.fillLayout(sw, sh, W, H);
  assert.ok(L.y >= 10 && L.y < 20, "the smallest phone has a thin margin");
  const s = frameSurface(L.w, L.h);
  FRAME.draw(s, { w: L.w, h: L.h, x: L.x, y: L.y, worldW: W, worldH: H }, { calm: true, floor: 1, pages: 12 });

  for (let x = 6; x < L.w - 6; x++) assert.equal(frameTone(s, x, L.y - 1), 3, "paper above the status bar");
  for (let y = 0; y < L.y; y++) assert.equal(countRow(s, y, 1), 0, "no dark scenery in the top margin");
  assert.ok(countRow(s, 2, 0) > L.w * 0.8, "the outer rule is there");
  assert.ok(countRow(s, L.y - 3, 0) > L.w * 0.8, "the rule above the picture is there");
  assert.ok(countRow(s, L.y - 6, 0) > 20, "the sewn line is there");
  assert.ok(frameTone(s, 0, 0) === 2 && frameTone(s, L.w - 1, L.h - 1) === 2, "the corners fold");
  /* no room for tabs on this stage: the foot below the world is only the frame's own margin */
  assert.equal(countRow(s, L.y + H + 7, 2, 10, L.w - 10), 0, "no tabs are squeezed into a thin margin");
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

test("a meta save that cannot be read refreshes the title's bar instead of leaving it stale", async () => {
  const store = { auto: { v: 3, floor: 2, flags: { intro: true } } };
  const on = { press: [], release: [] };
  let rejectMeta = null;
  const p = {
    lang: "zh", spec: "lopda/1",
    on(type, f) { (on[type] = on[type] || []).push(f); },
    off() {}, isDown() { return false; }, sfx() {}, exit() {},
    load(k) {
      if (k === "meta") return new Promise((res, rej) => { rejectMeta = rej; });
      return Promise.resolve(store[k] != null ? JSON.parse(JSON.stringify(store[k])) : null);
    },
    save() {}, remove() {},
    press(b) { (on.press || []).forEach((f) => f(b)); },
    release(b) { (on.release || []).forEach((f) => f(b)); }
  };
  const app = boot(APP, { pad: p, seed: 3, stage: { w: 331, h: 359 } });
  await settle();
  const menu = app.ctx.get("titleMenu");
  assert.ok(menu && rejectMeta, "the title is up and its meta read is pending");
  const notes = [], set = menu.set;
  menu.set = function (opts) { if (opts && opts.note) notes.push(opts.note); return set.call(menu, opts); };
  rejectMeta(new Error("corrupt meta"));
  await frames(app, 4);
  assert.equal(app.ctx.get("canSave"), false);
  assert.ok(notes.some((n) => /存档读不出/.test(n)), "the mounted menu took the warning note");
  assert.equal(menu.index(), 0, "an untouched title starts on 继续");
  assert.equal(app.ctx.get("titleSpec")().acts[menu.index()], "continue");
  assert.equal(app.ctx.get("titleSpec")().items[0].status, undefined,
    "no page status on 继续, so the warning is the bar's line");
});

test("a late save does not move a title the player has already rolled", async () => {
  const on = { press: [], release: [] };
  let resolveAuto = null;
  const p = {
    lang: "zh", spec: "lopda/1",
    on(type, f) { (on[type] = on[type] || []).push(f); },
    off() {}, isDown() { return false; }, sfx() {}, exit() {},
    load(k) {
      if (k === "auto") return new Promise((res) => { resolveAuto = res; });
      return Promise.resolve(null);
    },
    save() {}, remove() {},
    press(b) { (on.press || []).forEach((f) => f(b)); },
    release(b) { (on.release || []).forEach((f) => f(b)); }
  };
  const app = boot(APP, { pad: p, seed: 3, stage: { w: 331, h: 359 } });
  await settle(); await frames(app, 3);
  const menu = app.ctx.get("titleMenu");
  assert.ok(menu && resolveAuto, "the title is up and its auto read is pending");
  assert.equal(menu.index(), 0);
  await tap(app, p, "down");
  assert.equal(menu.index(), 1, "the player rolled to 读取存档");
  resolveAuto({ v: 3, floor: 2, flags: { intro: true } });
  await frames(app, 4);
  assert.equal(app.ctx.get("titleSpec")().acts[menu.index()], "load", "the chosen item stayed chosen");
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
