// 拼字格 / Crossing 2.0.0 on the smallest screen (331x359, as on an iPhone SE with the chin pad):
// a long hint stays two lines and the keys line under it never moves, RANDOM opens after round 30, and the
// results card's rows are 32 px so the six-word card still fits without scrolling.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-crossing.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "registry/apps/crossing";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json" };
let server, base, browser, context;

before(async () => {
  if (skip) return;
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    const file = join(ROOT, path.endsWith("/") ? path + "index.html" : path);
    try { res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }); res.end(await readFile(file)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  /* without this flag, sandboxed iframes render blank in headless Chromium */
  browser = await pw.chromium.launch({ args: ["--disable-site-isolation-trials"] });
  context = await browser.newContext({ viewport: { width: 900, height: 900 }, hasTouch: true });
});
after(async () => { await context?.close(); await browser?.close(); server?.close(); });

const until = async (p, fn, what) => {
  for (let i = 0; i < 200; i++) {
    if (await fn()) return;
    await p.waitForTimeout(100);
  }
  assert.fail("timed out waiting for " + what);
};
const press = async (p, b) => { await p.locator(`#pad [data-b="${b}"]`).click(); await p.waitForTimeout(20); };

/* a dev harness page with the given save, its app frame at 331x359, and the title up: the app builds a round
   only when the player opens one, so every test starts from its own save */
async function open(t, save, lang = "zh") {
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  t.after(() => p.close());
  await p.goto(`${base}/sdk/dev.html?app=${APP}&lang=${lang}`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  await p.evaluate((s) => localStorage.setItem("lopda-dev:crossing", JSON.stringify({ game: s })), save);
  await p.reload({ waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  const frame = () => p.frames().find((x) => x !== p.mainFrame());
  await until(p, async () => {
    const f = frame();
    return !!f && await f.evaluate(() => !!(window.game && game.phase === "title")).catch(() => false);
  }, "the title screen");
  await p.locator("#app").evaluate((el) => { el.style.width = "331px"; el.style.height = "359px"; el.style.flex = "none"; });
  await p.waitForTimeout(150);
  return { p, errors, frame };
}

/* a round's words learned from the app itself, so the tests never guess the dictionary's grid */
async function openRound(t, save) {
  const { p, errors, frame } = await open(t, save);
  await press(p, "a");
  const f = frame();
  await until(p, () => f.evaluate(() => game.phase === "play" || game.phase === "done" || game.phase === "demo"), "the round");
  if (await f.evaluate(() => game.phase === "demo")) {
    await until(p, () => f.evaluate(() => game.phase === "demoEnd"), "the demo to end");
    await press(p, "a");
  }
  return { p, errors, frame: f };
}

test("crossing at 331x359: a long hint keeps two lines and the keys line under it does not move", { skip, timeout: 60000 }, async (t) => {
  /* round 1's grid is scale, case, sale, lace, sea; with every other word filled, HINT can only mean "scale",
     whose Chinese line is the longest in the round (eleven senses) */
  const { p, errors, frame } = await openRound(t, {
    round: 1, cleared: 0, taught: true, hints: 1, done: ["case", "sale", "lace", "sea"]
  });
  const f = frame;
  await until(p, async () => (await f.evaluate(() => game.placed.map((w) => w.word).join(","))) === "scale,case,sale,lace,sea", "round 1's grid");
  const before = await f.evaluate(() => {
    const g = (sel) => { const el = document.querySelector(sel), r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    return { goal: g("#goal"), goalText: document.getElementById("goal").textContent, note: g("#note"), text: document.getElementById("note-text").textContent };
  });
  assert.equal(before.goalText, "划过字母拼单词，填满右边的格子");
  assert.equal(before.text, "", "nothing in the note before the hint");
  await f.click("#hint");
  await until(p, async () => {
    const s = await f.evaluate(() => document.getElementById("note-text").textContent);
    return s.indexOf("提示：") === 0 && s.slice(-1) === "…";
  }, "the long hint, trimmed");
  const hint = await f.evaluate(() => {
    const nt = document.getElementById("note-text"), note = document.getElementById("note"), goal = document.getElementById("goal");
    const lh = parseFloat(getComputedStyle(nt).lineHeight) || 18;
    const g = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    /* count the content's lines with the CSS clamp out of the way: the trim itself must be what holds two lines */
    const clamped = nt.style.webkitLineClamp;
    nt.style.webkitLineClamp = "none";
    const lines = Math.round(nt.getBoundingClientRect().height / lh);
    nt.style.webkitLineClamp = clamped;
    return { text: nt.textContent, lines, lh, note: g(note), goal: g(goal), goalText: goal.textContent,
      noteH: Math.round(note.getBoundingClientRect().height) };
  });
  assert.ok(hint.lines <= 2, "the hint takes at most two lines: " + hint.lines + " in " + JSON.stringify(hint.text));
  assert.ok(hint.text.indexOf("刻度") > 0, "the first sense survives: " + hint.text);
  /* the app trimmed real senses, not characters: the line is the dictionary's own, cut at a comma */
  const full = await f.evaluate(async () => { const e = await PAD.dict.lookup("scale"); return e && e.zh && e.zh[0]; });
  assert.ok(full && full.slice(-1) !== "…", "the dictionary line is the untrimmed one: " + full);
  assert.equal(("提示：" + full).indexOf(hint.text.slice(0, -1)), 0, "the hint keeps the line's first senses: " + hint.text);
  assert.ok(hint.text.split(",").length < full.split(",").length, "the later senses are dropped: " + hint.text);
  assert.equal(hint.noteH, 36, "the note keeps its 36 px, so nothing below it moves");
  assert.deepEqual(hint.note, before.note, "the note box does not move");
  assert.deepEqual(hint.goal, before.goal, "the keys line keeps its place");
  assert.equal(hint.goalText, before.goalText);
  assert.ok(hint.goal[1] + hint.goal[3] <= 359, "the keys line stays on the screen");
  assert.deepEqual(errors, [], "no page errors");
});

test("crossing at 331x359: RANDOM opens after round 30, and before it the locked item says 30", { skip, timeout: 90000 }, async (t) => {
  /* a player past 30: the RANDOM item is open and really starts a random round */
  let { p, errors, frame } = await open(t, { round: 31, cleared: 30, taught: true });
  const title = (f) => f.evaluate(() => {
    const t = game.title;
    return {
      labels: t.items.map((li) => li.label),
      status: t.items.map((li) => li.status || ""),
      locked: t.items.map((li) => li.locked === true),
      reason: t.items[2] ? t.items[2].reason || "" : "",
      note: t.note,
      canvas: [document.getElementById("lotitle").getBoundingClientRect().width, document.getElementById("lotitle").getBoundingClientRect().height],
      size: [document.documentElement.clientWidth, document.documentElement.clientHeight],
    };
  });
  let ts = await title(frame());
  assert.deepEqual(ts.size, [331, 359]);
  assert.deepEqual(ts.canvas, [331, 359], "the shared title canvas fills the screen in CSS pixels");
  assert.deepEqual(ts.labels, ["继续", "选关", "随机关", "玩法"]);
  assert.equal(ts.status[0], "第 31 关", "继续 names the round it opens");
  assert.deepEqual(ts.locked, [false, false, false, false], "no item is locked at cleared 30");
  await press(p, "down");
  await press(p, "down");
  await press(p, "a");
  await until(p, () => frame().evaluate(() => game.mode === "random"), "a random round past round 30");
  assert.deepEqual(errors, [], "no page errors");

  /* a save at round 12 is still before the unlock, and the bar says which round opens it */
  ({ p, errors, frame } = await open(t, { round: 12, cleared: 11, taught: true }));
  ts = await title(frame());
  assert.deepEqual(ts.labels, ["继续", "选关", "随机关", "玩法"]);
  assert.equal(ts.status[0], "第 12 关");
  assert.equal(ts.reason, "通关 30 关后开放", "the locked item names round 30");
  assert.deepEqual(ts.locked, [false, false, true, false], "RANDOM is closed at round 12");
  await press(p, "down");
  await press(p, "down");
  await press(p, "a");
  await p.waitForTimeout(300);
  assert.equal(await frame().evaluate(() => game.phase), "title", "a locked RANDOM does not start");
  assert.deepEqual(errors, [], "no page errors");

  /* the English item says the same number */
  ({ p, errors, frame } = await open(t, { round: 12, cleared: 11, taught: true }, "en"));
  ts = await title(frame());
  assert.deepEqual(ts.labels, ["CONTINUE", "ROUNDS", "RANDOM", "HOW TO PLAY"]);
  assert.equal(ts.status[0], "ROUND 12");
  assert.equal(ts.reason, "Clear 30 levels to unlock", "the English locked item names round 30");
  assert.deepEqual(ts.locked, [false, false, true, false], "RANDOM is closed at round 12 in English too");
  assert.deepEqual(errors, [], "no page errors");
});

test("crossing at 331x359: the results card's word rows are 32 px and the six-word card does not scroll", { skip, timeout: 60000 }, async (t) => {
  /* round 5's grid is the largest the app builds, six words: every one filled, the card is at its tallest */
  const { p, errors, frame } = await openRound(t, {
    round: 5, cleared: 4, taught: true, bookTip: true,
    done: ["stick", "sick", "its", "sit", "ski", "kit"]
  });
  const f = frame;
  await until(p, () => f.evaluate(() => game.phase === "done"), "the finished round's card");
  await p.waitForTimeout(200);
  const card = await f.evaluate(() => {
    const cover = document.getElementById("cover"), root = document.documentElement;
    const rows = [...document.querySelectorAll("#cover-list li")];
    const box = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), h: Math.round(r.height) }; };
    return {
      size: [root.clientWidth, root.clientHeight],
      words: rows.map((li) => li.textContent),
      rows: rows.map((li) => {
        const own = li.getBoundingClientRect(), mark = li.querySelector(".mark").getBoundingClientRect();
        return { h: Math.round(own.height), markTop: Math.round(mark.top - own.top), markH: Math.round(mark.height) };
      }),
      detail: box(document.getElementById("cover-detail")),
      button: box(document.getElementById("cover-btn")),
      scroll: cover.scrollHeight, client: cover.clientHeight,
    };
  });
  assert.deepEqual(card.size, [331, 359]);
  assert.deepEqual(card.words, ["STICK", "SICK", "ITS", "SIT", "SKI", "KIT"], "the six-word grid is the card");
  assert.equal(card.rows.length, 6);
  card.rows.forEach((r, i) => {
    assert.ok(r.h >= 32, "row " + i + " is at least 32 px tall: " + r.h);
    assert.ok(r.markTop >= 0 && r.markTop + r.markH <= r.h, "row " + i + "'s bookmark ribbon stays inside it: " + JSON.stringify(r));
  });
  assert.ok(card.scroll <= card.client, "the card needs no scrolling: " + card.scroll + " <= " + card.client);
  assert.ok(card.detail.b <= 359 && card.button.b <= 359, "the detail box and NEXT ROUND stay on the screen");
  assert.ok(card.button.h >= 44, "NEXT ROUND is still a finger target");
  assert.deepEqual(errors, [], "no page errors");
});

test("crossing: the tutorial's word is saved with taught, so leaving on the last card does not replay the demo (#300)", { skip, timeout: 90000 }, async (t) => {
  let { p, errors, frame } = await open(t, { round: 1, cleared: 0, taught: false, hints: 3, done: [] });
  await press(p, "a");
  let f = frame();
  await until(p, () => f.evaluate(() => game.phase === "demoEnd"), "the demo to end");
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("lopda-dev:crossing")).game);
  assert.equal(saved.taught, true, "the save that wrote the demo's word did not write taught");
  const given = saved.done.length;
  /* leave on the "your turn" card (no START) and come back */
  await p.reload({ waitUntil: "load" });
  await until(p, async () => { f = frame(); return !!f && await f.evaluate(() => !!(window.game && game.phase === "title")).catch(() => false); }, "the title again");
  await press(p, "a");
  await until(p, () => f.evaluate(() => game.phase === "play" || game.phase === "demo"), "the round again");
  assert.equal(await f.evaluate(() => game.phase), "play", "the demo played a second time");
  const again = await p.evaluate(() => JSON.parse(localStorage.getItem("lopda-dev:crossing")).game);
  assert.equal(again.done.length, given, "a second word was handed over");
  assert.deepEqual(errors, []);
});
