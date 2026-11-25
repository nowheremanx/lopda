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
