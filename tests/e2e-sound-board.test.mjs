// Sound board 1.1.0 in the dev harness: a song's code box holds the whole playable song (it parses, and its notes are
// the ones the app plays), wraps without sideways scrolling at the smallest screen, marks the player's position in the
// group, and the app follows PAD.lang.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-sound-board.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "registry/apps/sound-board";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json" };
let server, base, browser;

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
  browser = await pw.chromium.launch({ args: ["--disable-site-isolation-trials"] });
});
after(async () => { await browser?.close(); server?.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* a dev harness tab on the app, and the app frame inside it */
async function open(t, lang) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  t.after(() => p.close());
  await p.goto(`${base}/sdk/dev.html?app=${APP}&lang=${lang}`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) {
    const f = p.frames().find((x) => x !== p.mainFrame());
    if (f) { try { await f.waitForSelector("#list .row", { timeout: 500 }); frame = f; } catch {} }
    if (!frame) await sleep(100);
  }
  assert.ok(frame, "the app frame loads");
  return { p, frame, errors };
}

/* the app at the smallest size the runtime gives it, 331 x 359 with the chin pad */
async function smallest(p) {
  await p.evaluate(() => { const f = document.getElementById("app"); f.style.width = "331px"; f.style.height = "359px"; });
}

/* the selected row's song as the app holds it, plus what the code box shows */
const shown = (frame) => frame.evaluate(() => {
  const table = SONGS[rows[sel].id], el = document.getElementById("code");
  return {
    table: JSON.parse(JSON.stringify(table)),
    text: el.textContent,
    scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
    bottom: el.getBoundingClientRect().bottom,
    page: { scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight }
  };
});

/* the object literal at the head of "PAD.music.play({ ... }, { loop: true })", by brace depth */
function objectLiteral(code) {
  const start = code.indexOf("{");
  assert.ok(start >= 0, "the code box shows an object: " + code);
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(start, i + 1);
  }
  throw new Error("the object literal is not closed: " + code);
}

const pos = (frame) => frame.evaluate(() => {
  const marks = [...document.querySelectorAll("#list h2 .pos")];
  return { count: marks.length, text: marks.length ? marks[0].textContent.trim() : null };
});

/* a key, then wait for the position mark it should leave: the harness posts the key to the app frame, so the
   key's own effect lands a task or two after keyboard.press resolves */
async function mark(p, frame, key, want) {
  await p.keyboard.press(key);
  await frame.waitForFunction((w) => {
    const el = document.querySelector("#list h2 .pos");
    return el && el.textContent.trim() === w;
  }, want, { timeout: 5000 });
}

test("sound board: a song's code box is the whole song, parses, wraps at 331 px, and marks the position", { skip, timeout: 90000 }, async (t) => {
  const { p, frame, errors } = await open(t, "zh");
  await smallest(p);

  /* dusk, the first row: every part of the song in the box, and the same values in the app's own table */
  let s = await shown(frame);
  let song = new Function("return (" + objectLiteral(s.text) + ")")();
  assert.match(s.text, /^PAD\.music\.play\(\{/, "the call is shown in full: " + s.text.slice(0, 40));
  assert.match(s.text, /\}, \{ loop: true \}\)$/, "the song loops, as the app plays it");
  assert.equal(s.text.includes("..."), false, "no ellipsis: the strings are complete");
  assert.deepEqual([song.bpm, song.p1, song.p2, song.tri, song.noise],
    [s.table.bpm, s.table.p1, s.table.p2, s.table.tri, s.table.noise]);
  assert.equal(song.bpm, 76);
  assert.ok(s.scrollWidth <= s.clientWidth + 1, `no sideways scroll (${s.scrollWidth} > ${s.clientWidth})`);
  assert.ok(s.bottom <= s.page.clientHeight + 1, "the code box stays on the screen");
  assert.ok(s.page.scrollHeight <= s.page.clientHeight + 1, "nothing is cut off at 331 x 359");

  /* the app plays that song, looping: the harness says so */
  await p.keyboard.press("x");
  await p.waitForFunction(() => /music play, looping/.test(document.getElementById("log").textContent), null, { timeout: 5000 });

  /* the position mark: 1 / 2 in Music, then 2 / 2 on the next row, and 1 / 6 in Ambience after SELECT */
  assert.deepEqual(await pos(frame), { count: 1, text: "1 / 2" });
  await mark(p, frame, "ArrowDown", "2 / 2");
  s = await shown(frame);
  song = new Function("return (" + objectLiteral(s.text) + ")")();
  assert.deepEqual([song.bpm, song.p1], [s.table.bpm, s.table.p1]);
  assert.equal(song.bpm, 132, "the second song is On the road");
  assert.deepEqual(await pos(frame), { count: 1, text: "2 / 2" });
  assert.ok(s.scrollWidth <= s.clientWidth + 1, "the second song wraps too");

  await mark(p, frame, "Shift", "1 / 6");
  assert.deepEqual(await pos(frame), { count: 1, text: "1 / 6" }, "a group heading carries its own count");
  await mark(p, frame, "ArrowDown", "2 / 6");
  assert.deepEqual(await pos(frame), { count: 1, text: "2 / 6" });

  assert.deepEqual(errors, []);
});

test("sound board: PAD.lang en gives English labels, headings and key hints", { skip, timeout: 60000 }, async (t) => {
  const { frame, errors } = await open(t, "en");
  await frame.waitForSelector("#list h2 .pos");
  const ui = await frame.evaluate(() => ({
    title: document.title,
    htmlLang: document.documentElement.lang,
    head: document.getElementById("title").textContent,
    groups: [...document.querySelectorAll("#list h2")].map((h) => h.firstChild.textContent.trim()),
    keys: document.getElementById("keys").textContent,
    rows: [...document.querySelectorAll("#list .row")].map((r) => r.firstChild.textContent.trim().replace(/^>/, "")),
    body: document.body.innerText
  }));
  assert.equal(ui.title, "Sounds");
  assert.equal(ui.htmlLang, "en");
  assert.equal(ui.head, "Sounds");
  assert.deepEqual(ui.groups, ["Music", "Ambience", "Named sounds", "Custom sounds"]);
  assert.match(ui.keys, /^↑↓ pick  A play  B stop  SELECT group$/);
  assert.ok(ui.rows.includes("Dusk") && ui.rows.includes("On the road") && ui.rows.includes("Rain"), JSON.stringify(ui.rows));
  assert.doesNotMatch(ui.body, /[\u4e00-\u9fff]/, "no Chinese left on the screen: " + ui.body);
  assert.deepEqual(errors, []);
});
