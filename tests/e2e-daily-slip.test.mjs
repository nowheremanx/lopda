// daily-slip 1.2.0 in the dev harness at the smallest app frame (331 x 359, the chin pad's screen):
// a saved draw keeps its slip, every English line stays on one line, and a drawn slip says so once.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-daily-slip.test.mjs
// The catalogue itself (100+ slips, entries 1-32 unchanged, unique first lines) is tests/daily-slip.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import vm from "node:vm";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "registry/apps/daily-slip";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json" };
let server, base, browser;

/* the slips the page ships, read from the page source */
const DATA = (() => {
  const src = readFileSync(join(ROOT, APP, "index.html"), "utf8");
  const start = src.indexOf("var DATA = [");
  const end = src.indexOf("\n  ];", start);
  assert.ok(start > 0 && end > start, "DATA in the page");
  return JSON.parse(JSON.stringify(vm.runInNewContext("(" + src.slice(start + "var DATA = ".length, end + 4).trim() + ")", {})));
})();

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
});
after(async () => { await browser?.close(); server?.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

/* the app frame inside the dev harness, once the app's script has run (a saved draw already hides the
   draw button, so the button cannot be waited for by visibility) */
async function appFrame(p) {
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  for (let i = 0; i < 60; i++) {
    const frame = p.frames().find((x) => x !== p.mainFrame());
    if (frame) {
      try {
        await frame.waitForSelector("#drawBtn", { state: "attached", timeout: 500 });
        await frame.waitForFunction(() => {
          const el = document.getElementById("today");
          return !!el && el.textContent.trim().length > 0;
        }, null, { timeout: 500 });
        return frame;
      } catch {}
    }
    await sleep(100);
  }
  assert.fail("the app frame did not load");
}

/* one tab at the smallest screen; its own context, so a saved draw never leaks into another test */
async function open(t, lang = "zh") {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  t.after(() => context.close());
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(`${base}/sdk/dev.html?app=${APP}&lang=${lang}`);
  let frame = await appFrame(p);
  await p.evaluate(() => { const el = document.getElementById("app"); el.style.width = "331px"; el.style.height = "359px"; });
  await p.waitForTimeout(150);
  const reload = async () => {
    await p.reload({ waitUntil: "load" });
    frame = await appFrame(p);
    await p.evaluate(() => { const el = document.getElementById("app"); el.style.width = "331px"; el.style.height = "359px"; });
    await p.waitForTimeout(150);
  };
  /* as PAD.save would have left it after an earlier draw (the dev harness stores PAD saves in localStorage) */
  const save = (data) => p.evaluate((data) => {
    localStorage.setItem("lopda-dev:daily-slip", JSON.stringify({ "daily-slip": data }));
  }, data);
  return { p, frame: () => frame, reload, save, errors };
}

const dateKeyOf = (frame) => frame.evaluate(() => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
});

test("daily-slip: a saved draw for today shows its saved slip, not the day's new slot", { skip, timeout: 60000 }, async (t) => {
  const app = await open(t, "zh");
  const frame = app.frame();
  const dateKey = await dateKeyOf(frame);
  await app.save({ dateKey, slip: 5, written: false });
  await app.reload();
  const f = app.frame();
  await f.waitForSelector("#slip.show");
  assert.equal(clean(await f.textContent("#num")), "第 6 签", "slip 5 is the sixth slip");
  assert.equal(clean(await f.textContent("#grade")), DATA[5].grade.zh, "its grade");
  assert.deepEqual(await f.$$eval("#verse .line", (l) => l.map((x) => x.textContent)), DATA[5].verse.zh, "its three lines");
  assert.equal(clean(await f.textContent("#meaning")), DATA[5].meaning.zh, "its note");
  assert.equal(await f.evaluate(() => getComputedStyle(document.getElementById("drawBtn")).display), "none", "no draw prompt once drawn");
  assert.equal(await f.evaluate(() => document.getElementById("writeBtn").disabled), false, "the note can still be written");
  /* and it is still there after another start, as a real save is */
  await app.reload();
  await app.frame().waitForSelector("#slip.show");
  assert.equal(clean(await app.frame().textContent("#num")), "第 6 签", "the save survives a restart");
  assert.deepEqual(app.errors, []);
});

test("daily-slip: every slip's English fits one line of the slip at 331 x 359", { skip, timeout: 60000 }, async (t) => {
  const app = await open(t, "en");
  const frame = app.frame();
  await frame.click("#drawBtn");
  await frame.waitForSelector("#slip.show");
  const out = await frame.evaluate((entries) => {
    const verse = document.getElementById("verse");
    const meaning = document.getElementById("meaning");
    const slip = document.getElementById("slip");
    const main = document.querySelector("main");
    const lh = parseFloat(getComputedStyle(verse).lineHeight);
    const bad = [];
    for (const entry of entries) {
      verse.textContent = "";
      for (const text of entry.verse.en) {
        const el = document.createElement("span");
        el.className = "line";
        el.textContent = text;
        verse.appendChild(el);
      }
      meaning.textContent = entry.meaning.en;
      const lines = [...verse.children].map((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return { text: el.textContent, height: el.getBoundingClientRect().height, rects: range.getClientRects().length,
          words: el.textContent.trim().split(/\s+/).length };
      });
      for (const line of lines) {
        if (Math.abs(line.height - lh) > 0.5 || line.rects > 1) bad.push({ num: entry.num, wrapped: line });
        /* with the line on one line there can be no orphaned word; this also catches a one-word line */
        if (line.words < 2) bad.push({ num: entry.num, oneWord: line.text });
      }
      if (main.scrollHeight > main.clientHeight + 1) bad.push({ num: entry.num, scrolls: [main.scrollHeight, main.clientHeight] });
      if (slip.scrollWidth > slip.clientWidth + 1) bad.push({ num: entry.num, across: [slip.scrollWidth, slip.clientWidth] });
    }
    return { bad, lh, size: [document.documentElement.clientWidth, document.documentElement.clientHeight], count: entries.length };
  }, DATA);
  assert.deepEqual(out.size, [331, 359], "the app frame is the smallest screen");
  assert.equal(out.count, DATA.length);
  assert.equal(out.lh, 21, "the slip's line height at this size");
  assert.deepEqual(out.bad, [], "no English line wraps, no slip scrolls");
  assert.deepEqual(app.errors, []);
});

test("daily-slip: a drawn slip says today is drawn, and the footer only says it once", { skip, timeout: 60000 }, async (t) => {
  const zh = await open(t, "zh");
  const zf = zh.frame();
  assert.equal(clean(await zf.textContent("#footer")), "A 抽签 · 也可以点签筒", "before the draw, the draw prompt");
  await zf.click("#drawBtn");
  await zf.waitForSelector("#slip.show");
  await zf.waitForFunction(() => getComputedStyle(document.getElementById("writeBtn")).display !== "none");
  assert.equal(clean(await zf.textContent("#footer")), "今天已抽 · 明天再来", "the draw prompt's place now says today is drawn");
  assert.doesNotMatch(clean(await zf.textContent("#footer")), /START|写入/, "the footer does not repeat the button");
  assert.equal(clean(await zf.textContent("#writeBtn")), "START 写入", "the button keeps the key it answers to");

  const en = await open(t, "en");
  const ef = en.frame();
  assert.equal(clean(await ef.textContent("#footer")), "A draw · or tap the cup", "before the draw, the draw prompt");
  await ef.click("#drawBtn");
  await ef.waitForSelector("#slip.show");
  await ef.waitForFunction(() => getComputedStyle(document.getElementById("writeBtn")).display !== "none");
  const footer = clean(await ef.textContent("#footer"));
  assert.equal(footer, "Drawn today · back tomorrow");
  assert.doesNotMatch(footer, /START|Notes/i, "the footer does not repeat the button");
  assert.equal(clean(await ef.textContent("#writeBtn")), "START Notes");
  const shown = await ef.evaluate(() => {
    const el = document.getElementById("footer");
    const box = el.getBoundingClientRect();
    return { height: box.height, bottom: box.bottom, screen: window.innerHeight, visible: getComputedStyle(el).visibility };
  });
  assert.ok(shown.height > 0 && shown.bottom <= shown.screen + 0.5, "the line is on screen: " + JSON.stringify(shown));
  assert.equal(shown.visible, "visible");

  /* writing adds to the notes; the footer still says the day is drawn and only the button changes */
  await en.p.locator('#pad [data-b="start"]').click();
  await ef.waitForFunction(() => document.getElementById("writeBtn").textContent === "Saved", null, { timeout: 5000 });
  assert.equal(clean(await ef.textContent("#footer")), "Drawn today · back tomorrow", "no second line about writing");
  assert.equal(await ef.evaluate(() => document.getElementById("writeBtn").disabled), true);
  assert.deepEqual([...zh.errors, ...en.errors], []);
});
