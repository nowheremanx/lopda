// registry/apps/sisyphus: the sixteen lines, the first-summit rule, the font coverage, and the
// climb's progress, warning and pause-menu rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { read, readJSON, runScript, ROOT } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const QS = runScript("registry/apps/sisyphus/src/quotes.js").QS;
const FONT = readJSON("sdk/fonts/lopix12.json");
const APP = join(ROOT, "registry", "apps", "sisyphus", "index.html");

test("sixteen lines, each with a Chinese and an English text, and unique ids", () => {
  assert.equal(QS.QUOTES.length, 16);
  const ids = new Set();
  for (const q of QS.QUOTES) {
    assert.match(q.id, /^\d+$/);
    assert.ok(!ids.has(q.id), `duplicate id ${q.id}`);
    ids.add(q.id);
    assert.ok(q.zh.length > 0 && q.en.length > 0);
    assert.ok(q.zh.length <= 45, `zh too long for the card: ${q.id}`);
    assert.ok(q.en.length <= 110, `en too long for the card: ${q.id}`);
  }
});

test("the first summit is always the last line; later draws never repeat the previous line", () => {
  const first = { summits: 0, seen: [], deck: [], lastQuote: null };
  const q = QS.next(first);
  assert.equal(q.id, "16");
  assert.equal(first.lastQuote, "16");

  const state = { summits: 1, seen: [], deck: [], lastQuote: "16" };
  let previous = "16";
  for (let i = 0; i < 200; i++) {
    const next = QS.next(state);
    assert.notEqual(next.id, previous, `repeat at draw ${i}`);
    previous = next.id;
  }
});

test("the note carries both languages, the source and the summit number", () => {
  const q = QS.byId["7"];
  const text = QS.noteText(q, 3);
  assert.ok(text.includes(q.zh));
  assert.ok(text.includes(q.en));
  assert.ok(text.includes("第 3 次登顶"));
  assert.ok(text.includes("加缪《西西弗斯神话》"));
  assert.ok(text.length < 4096);
});

test("every character of every line has a lopix12 glyph", () => {
  const missing = [];
  for (const q of QS.QUOTES) {
    for (const ch of q.zh + q.en) if (!FONT.glyphs[ch]) missing.push(ch);
  }
  assert.deepEqual([...new Set(missing)], []);
});

test("a saved seen list keeps its order and ignores unknown ids", () => {
  const list = QS.seenList({ seen: ["16", "nope", "3", "16"] });
  assert.equal(list.map((q) => q.id).join(","), "16,3,16");
});

test("the source file is the bundled one and the manifest is a store app", () => {
  const html = read("registry/apps/sisyphus/index.html");
  const src = read("registry/apps/sisyphus/src/quotes.js");
  assert.ok(html.includes(src.trim().slice(0, 80)));
  const m = readJSON("registry/apps/sisyphus/manifest.json");
  assert.equal(m.id, "sisyphus");
  assert.equal(m.spec, "lopda/1");
  assert.equal(m.buttons, true);
  assert.deepEqual(m.permissions, ["notes"]);
  assert.ok(m.icon.length === 16 && m.icon.every((r) => r.length === 16));
});

/* ---- the play screen, driven on the manual clock ------------------------------------------------ */

/* a fake PAD: a save store, none of the storage/notes/sound APIs the climb does not need, and
   the button listeners the test presses */
function makePad(store = {}) {
  const listeners = {};
  const pad = {
    lang: "zh",
    save(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    load(k) { return Promise.resolve(store[k] == null ? null : JSON.parse(JSON.stringify(store[k]))); },
    remove(k) { delete store[k]; },
    sfx() {}, ambience() {}, music: { play() {}, stop() {} },
    on(t, fn) { (listeners[t] ||= []).push(fn); },
    off() {},
    isDown() { return false; }
  };
  pad.listeners = listeners;
  return { listeners, pad };
}

const flush = () => new Promise((r) => setImmediate(r));
async function run(app, n = 1) {
  for (let i = 0; i < n; i++) { app.frame(); await flush(); }
}
function down(pad, b) { (pad.listeners.press || []).forEach((fn) => fn(b)); }
function up(pad, b) { (pad.listeners.release || []).forEach((fn) => fn(b)); }
async function press(app, pad, b) { down(pad, b); await run(app, 2); up(pad, b); await run(app, 1); }

/* the climb from the title, with A held down the whole way */
async function climbWithA(app, pad, S) {
  await run(app, 5);                       /* the save loads on a microtask */
  down(pad, "a");
  let guard = 0;
  while (S.mode !== "climb" && guard++ < 400) await run(app, 1);
  assert.equal(S.mode, "climb", "A on the title starts the climb");
}

/* Measured on the 0.1.2 bundle (git show HEAD:registry/apps/sisyphus/index.html) with the same seed
   and the same input: 3972 frames from the climb scene's first tick to the summit. */
const CLIMB_FRAMES = 3972;
const SLIDE_FRAME = 57;                    /* release -> the first frame the stone moves back */

test("the climb still takes the same frames of holding A", async () => {
  const { pad } = makePad();
  const app = boot(APP, { pad, seed: 1 });
  const S = app.ctx.get("S");
  await climbWithA(app, pad, S);
  let frames = 0;
  while (S.mode !== "summit" && frames < 10000) { await run(app, 1); frames++; }
  up(pad, "a");
  assert.equal(S.mode, "summit");
  assert.equal(frames, CLIMB_FRAMES, "the climb's length is unchanged");
});

test("survey marks show progress on the climb, and the summit tally appears after a summit", async () => {
  const { pad } = makePad();
  const app = boot(APP, { pad, seed: 1 });
  const S = app.ctx.get("S"), WORLD = app.ctx.get("WORLD"), game = app.ctx.get("game");

  const marks = [];
  const line = game.g.line;
  game.g.line = function (x0, y0, x1, y1, tone) {
    if (x0 === x1) marks.push({ x: x0, y0, y1, tone });
    return line.apply(game.g, arguments);
  };
  const texts = [];
  const text = game.g.text;
  game.g.text = function (s) { texts.push(String(s)); return text.apply(game.g, arguments); };

  await climbWithA(app, pad, S);
  await run(app, 1);
  marks.length = 0;
  await run(app, 1);
  const tenth = Math.round(WORLD.pathX(0.1) - S.cam.x);
  assert.ok(marks.some((m) => m.x === tenth && m.y1 - m.y0 === 2 && m.tone === 0),
    "the tenth-of-the-height mark stands on the slope at x " + tenth);

  /* the last stretch, then the summit and the quote; B lets the quote go */
  S.p = 0.971;
  let guard = 0;
  while (S.mode !== "summit" && guard++ < 400) await run(app, 1);
  assert.equal(S.mode, "summit");
  guard = 0;
  while (S.summits === 0 && guard++ < 400) await run(app, 1);
  assert.equal(S.summits, 1, "the summit was counted");
  await run(app, 50);
  await press(app, pad, "b");
  guard = 0;
  while (S.mode !== "climb" && guard++ < 2500) await run(app, 1);
  up(pad, "a");
  assert.equal(S.mode, "climb", "the fall and the walk down return to the foot");

  texts.length = 0;
  await run(app, 1);
  assert.ok(texts.includes("第 1 次"), "the summit tally is quiet on the play screen: " + texts.join(" | "));
});

test("the stone warns for the last 0.4 s before it slides, and slides on the same frame as before", async () => {
  const { pad } = makePad();
  const app = boot(APP, { pad, seed: 1 });
  const S = app.ctx.get("S");
  await climbWithA(app, pad, S);
  await run(app, 900);
  S.dust.length = 0;                       /* any step dust is gone; what appears next is the warning's */
  up(pad, "a");

  let slide = -1, firstWarn = -1, lastWarn = -1, warnFrames = 0, dustAtWarn = 0;
  const poses = new Set();
  let prev = S.p;
  for (let f = 1; f <= 120; f++) {
    await run(app, 1);
    if (S.warn) {
      warnFrames++;
      if (firstWarn < 0) { firstWarn = f; dustAtWarn = S.dust.length; }
      lastWarn = f;
      poses.add(S.pose);
    }
    if (S.p < prev - 1e-9) { slide = f; break; }
    prev = S.p;
  }
  assert.equal(slide, SLIDE_FRAME, "the slide still starts on the same frame");
  assert.ok(firstWarn > 0 && firstWarn < slide, "the warning comes first");
  assert.equal(lastWarn, slide - 1, "the warning runs right up to the slide");
  assert.ok(warnFrames >= 20 && warnFrames <= 30, "about 0.4 s of warning: " + warnFrames + " frames");
  assert.deepEqual([...poses], ["strain"], "Sisyphus strains while the stone shivers");
  assert.ok(dustAtWarn > 0, "a puff of dust marks the moment");
});

test("About is its own dialogue, with the pause menu closed; B puts the menu back", async () => {
  const { pad } = makePad();
  const app = boot(APP, { pad, seed: 1 });
  const S = app.ctx.get("S"), game = app.ctx.get("game");
  const texts = [];
  const text = game.g.text;
  game.g.text = function (s) { texts.push(String(s)); return text.apply(game.g, arguments); };

  await climbWithA(app, pad, S);
  up(pad, "a");
  await run(app, 20);                      /* let the title's fade finish, so the menu updates */
  await press(app, pad, "start");
  assert.equal(S.menuOpen, true, "START opens the pause menu");
  await press(app, pad, "down");
  await press(app, pad, "down");
  texts.length = 0;
  down(pad, "a"); await run(app, 2); up(pad, "a"); await run(app, 1);

  assert.equal(S.menuOpen, false, "the menu is closed while About is open");
  await run(app, 30);
  assert.ok(texts.includes("西西弗斯 / Sisyphus"), "the first About page is drawn: " + texts.join(" | "));
  assert.ok(!texts.includes("暂停"), "the menu title is not drawn under it");
  assert.ok(!texts.includes("继续"), "no menu row is drawn under it");
  assert.ok(!texts.includes("↑↓选 A确认 B返回"), "the menu footer is not drawn under it");

  let guard = 0;
  while (!S.menuOpen && guard++ < 40) await press(app, pad, "b");
  assert.equal(S.menuOpen, true, "B closes About and returns to the pause menu");
  texts.length = 0;
  await run(app, 1);
  assert.ok(texts.includes("暂停"), "the pause menu is drawn again");
});

test("the lines menu counts collected lines toward the sixteen", async () => {
  const { pad } = makePad({ sisyphus: { summits: 1, seen: ["16"], deck: ["3"], lastQuote: "16" } });
  const app = boot(APP, { pad, seed: 1 });
  const game = app.ctx.get("game"), S = app.ctx.get("S");
  await run(app, 5);
  assert.deepEqual(S.seen, ["16"], "the old save loads");
  const texts = [];
  const text = game.g.text;
  game.g.text = function (s) { texts.push(String(s)); return text.apply(game.g, arguments); };
  game.push("gallery");
  await run(app, 2);
  assert.ok(texts.includes("1 / " + QS.QUOTES.length),
    "the line count shows the real total: " + texts.join(" | "));
});

/* ---------------- touch, the summit tally, and the handbook's dates (DeepSeek review #430 #431 #433) ---------------- */

async function tap(app, x, y) {
  app.pointer("pointerdown", x, y, 160, 178); await run(app, 2);
  app.pointer("pointerup", x, y, 160, 178); await run(app, 1);
}

test("touch works on the pause menu, the lines and the summit card (#430)", async () => {
  const { pad } = makePad({ sisyphus: { summits: 2, seen: ["16", "3"], deck: ["5"], lastQuote: "3" } });
  const notes = [];
  pad.notes = { append(title, text) { notes.push(text); return Promise.resolve("saved"); } };
  const app = boot(APP, { pad, seed: 1 });
  const S = app.ctx.get("S"), game = app.ctx.get("game");
  await climbWithA(app, pad, S);
  up(pad, "a");
  await run(app, 20);
  await press(app, pad, "start");
  assert.equal(S.menuOpen, true, "START opens the pause menu");
  await tap(app, 80, 75);                     /* the 继续 row */
  assert.equal(S.menuOpen, false, "a tap on 继续 resumes");
  await press(app, pad, "start");
  await tap(app, 80, 4);                      /* outside the window */
  assert.equal(S.menuOpen, false, "a tap outside the menu is B");
  await press(app, pad, "start");
  await tap(app, 80, 91);                     /* the 语录 row */
  assert.equal(game.top() && S.galleryList.length, 2, "a tap on 语录 opens the lines");
  assert.equal(S.galleryIndex, 0);
  await tap(app, 120, 80);                    /* the right half of the card: the next line */
  assert.equal(S.galleryIndex, 1, "the right half of the card turns forward");
  await tap(app, 30, 80);
  assert.equal(S.galleryIndex, 0, "the left half turns back");
  await tap(app, 30, 160);                    /* 「A 写入」 */
  for (let i = 0; i < 5 && S.gallerySaving; i++) await run(app, 1);
  assert.equal(notes.length, 1, "a tap on 「A 写入」 writes the line");
  await run(app, 60);                         /* the 已写入 line fades back to the hint */
  await tap(app, 120, 160);                   /* 「B 返回」 */
  assert.equal(S.menuOpen, true, "a tap on 「B 返回」 goes back to the menu");

  /* the summit card: a tap on the card lets the line pass */
  S.menuOpen && await press(app, pad, "b");
  let popped = null;
  game.push("quote", { q: QS.byId["5"], n: 3 }).then((r) => { popped = r; });
  await run(app, 60);
  await tap(app, 80, 80);
  assert.equal(popped, "skip", "a tap on the card body lets the line pass");
  popped = null;
  game.push("quote", { q: QS.byId["5"], n: 3 }).then((r) => { popped = r; });
  await run(app, 60);
  await tap(app, 30, 160);
  for (let i = 0; i < 70 && popped === null; i++) await run(app, 1);
  assert.equal(popped, "saved", "a tap on 「A 记下」 writes the line");
  assert.equal(notes.length, 2);
});

test("the summit tally sits on a tag that contrasts all the way up (#431)", async () => {
  const { pad } = makePad({ sisyphus: { summits: 4, seen: ["16"], deck: [], lastQuote: "16" } });
  const app = boot(APP, { pad, seed: 1 });
  const S = app.ctx.get("S"), game = app.ctx.get("game"), ART = app.ctx.get("ART");
  await run(app, 5);
  const g = game.g, calls = [];
  const { rect, text } = g;
  g.rect = function (x, y, w, h, c) { calls.push({ k: "rect", y, c }); return rect.apply(g, arguments); };
  g.text = function (s, x, y, o) { calls.push({ k: "text", s: String(s), c: o && o.color }); return text.apply(g, arguments); };
  const drawHud = app.ctx.get("drawRunHud");
  for (const [p, weather] of [[0.1, "clear"], [0.6, "clear"], [0.95, "clear"], [0.65, "rain"], [0.99, "rain"]]) {
    S.mode = "climb"; S.p = p; S.weather = weather;
    calls.length = 0;
    drawHud(g);
    const t = calls.find((c) => c.k === "text" && c.s === "第 4 次");
    const tag = calls.find((c) => c.k === "rect" && c.y === 3);
    assert.ok(t && tag, `the tally and its tag are drawn at p=${p}`);
    assert.ok((t.c === 0 && tag.c === 3) || (t.c === 3 && tag.c === 0), `ink on paper or paper on ink at p=${p}: ${t.c} on ${tag.c}`);
    /* the tag is the sky's own end of the scale, so it stays quiet */
    const sky = ART.skyTop(S);
    assert.equal(tag.c, sky >= 1.75 ? 3 : 0, `the tag follows the sky at p=${p} (sky ${sky.toFixed(2)})`);
  }
});

test("the handbook writes a line with the summit and the day it was given, not today's (#433)", async () => {
  const head = (t) => t.split("\n")[0];
  const q = QS.byId["16"];
  assert.equal(head(QS.noteText(q, { n: 1, d: "2026年3月2日" })), "2026年3月2日 · 第 1 次登顶");
  assert.match(head(QS.noteText(q, null)), /^抄于 \d{4}年\d{1,2}月\d{1,2}日$/, "no record: only the day it was copied");
  assert.equal(JSON.stringify(QS.cleanGot({ 16: { n: 1, d: "x" }, 3: { n: 0, d: "y" }, 9: { n: 2, d: "z" } }, ["16", "3"])), JSON.stringify({ 16: { n: 1, d: "x" } }));

  const store = { sisyphus: { summits: 5, seen: ["16", "3"], got: { 16: { n: 1, d: "2026年3月2日" } }, deck: [], lastQuote: "3" } };
  const { pad } = makePad(store);
  const notes = [];
  pad.notes = { append(title, text) { notes.push(text); return Promise.resolve("saved"); } };
  const app = boot(APP, { pad, seed: 1 });
  const S = app.ctx.get("S"), game = app.ctx.get("game");
  await run(app, 5);
  game.push("gallery");
  await run(app, 2);
  await press(app, pad, "a");                 /* line 16, given at the first summit */
  await run(app, 60);
  await press(app, pad, "down");
  await press(app, pad, "a");                 /* line 3: an older save kept no record of it */
  await run(app, 5);
  assert.equal(notes.length, 2);
  assert.equal(head(notes[0]), "2026年3月2日 · 第 1 次登顶", "the recorded summit and day, not summit 5 today");
  assert.match(head(notes[1]), /^抄于 /, "without a record the note claims no summit");

  /* a new line records its summit and day, and the record is saved */
  S.summits = 5; S.deck = ["7"];
  app.ctx.get("openQuote")();
  await run(app, 2);
  assert.equal(store.sisyphus.got["7"].n, 6);
  assert.match(store.sisyphus.got["7"].d, /^\d{4}年/);
});
