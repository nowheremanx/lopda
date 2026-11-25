// Kana (registry/apps/kana-cards) at the smallest handheld screen, 331x359: the mode label and the key guide
// are separate in English and Chinese, a quiz counts its own questions instead of the kana's table position,
// and the kana grid says whether it goes on beyond its top and bottom edges.
// Needs Playwright, which the repo does not depend on, so this test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-kana-cards.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "registry/apps/kana-cards";
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
  /* without this flag, sandboxed iframes render blank in headless Chromium */
  browser = await pw.chromium.launch({ args: ["--disable-site-isolation-trials"] });
});
after(async () => { await browser?.close(); server?.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* one dev-harness page with the app frame at the smallest size; a fresh browser context, so no saved cursor */
async function open(t, lang) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  t.after(() => p.close());
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(`${base}/sdk/dev.html?app=${APP}${lang === "zh" ? "&lang=zh" : ""}`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    const f = p.frames().find((x) => x !== p.mainFrame());
    if (f) { try { await f.waitForFunction(() => !!window.PAD, null, { timeout: 300 }); frame = f; } catch {} }
    if (!frame) await sleep(50);
  }
  assert.ok(frame, "the app frame loads");
  await p.locator("#app").evaluate((el) => { el.style.width = "331px"; el.style.height = "359px"; el.style.flex = "none"; });
  await frame.waitForFunction((want) => document.documentElement.lang === want, lang === "zh" ? "zh-CN" : "en", { timeout: 5000 });
  await frame.waitForFunction(() => document.body.classList.contains("list"), null, { timeout: 5000 });
  return { p, frame, errors };
}

async function guideBoxes(frame) {
  return frame.evaluate(() => {
    const box = (id) => {
      const el = document.querySelector(id), r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    };
    const root = document.documentElement;
    return { size: [root.clientWidth, root.clientHeight], mode: box("#mode"), guide: box("#guide"), meta: box("#meta") };
  });
}

async function assertGuideRow(frame, where) {
  const lay = await guideBoxes(frame);
  assert.deepEqual(lay.size, [331, 359], `${where}: the app frame is the smallest screen`);
  const { mode, guide, meta } = lay;
  const overlap = !(mode.right <= guide.left || guide.right <= mode.left || mode.bottom <= guide.top || guide.bottom <= mode.top);
  assert.equal(overlap, false, `${where}: the mode label and the key guide do not overlap`);
  assert.ok(guide.left - mode.right >= 7, `${where}: a real gap (${(guide.left - mode.right).toFixed(1)}px) between the label and the help`);
  assert.ok(mode.scrollWidth <= mode.clientWidth, `${where}: the mode label is not cut (${mode.scrollWidth} <= ${mode.clientWidth})`);
  assert.ok(guide.scrollWidth <= guide.clientWidth, `${where}: the key guide is not cut (${guide.scrollWidth} <= ${guide.clientWidth})`);
  assert.ok(mode.left >= meta.left - 0.5 && guide.right <= meta.right + 0.5, `${where}: both stay inside the guide row`);
  assert.ok(mode.top >= 0 && guide.bottom <= 359, `${where}: the guide row is inside the screen`);
}

test("kana-cards: the mode label and the key guide are separate in the list and the quiz", { skip, timeout: 90000 }, async (t) => {
  for (const lang of ["en", "zh"]) {
    const { p, frame, errors } = await open(t, lang);
    await assertGuideRow(frame, `${lang} list`);
    await p.locator('#pad [data-b="start"]').click();
    await frame.waitForFunction(() => document.body.classList.contains("quiz"));
    await assertGuideRow(frame, `${lang} quiz`);
    assert.deepEqual(errors, [], `${lang}: no page errors`);
  }
});

/* answer the selected choice; a miss shows the right answer and waits for A, then moves on */
async function answerOne(p, frame) {
  const before = await frame.textContent("#qnum");
  await p.locator('#pad [data-b="a"]').click();
  await frame.waitForFunction((prev) => document.querySelector("#qnum").textContent !== prev ||
    /Review|再看看/.test(document.getElementById("status").textContent), before, { timeout: 5000 });
  if ((await frame.textContent("#qnum")) === before) {
    await p.locator('#pad [data-b="a"]').click();
    await frame.waitForFunction((prev) => document.querySelector("#qnum").textContent !== prev, before, { timeout: 5000 });
  }
}

test("kana-cards: the quiz counts this session's questions, not the kana's table position", { skip, timeout: 90000 }, async (t) => {
  for (const lang of ["en", "zh"]) {
    const { p, frame, errors } = await open(t, lang);
    const want = (n) => lang === "en" ? `Q ${n}` : `第${n}题`;
    await p.locator('#pad [data-b="start"]').click();
    await frame.waitForFunction(() => document.body.classList.contains("quiz"));
    assert.equal(await frame.textContent("#qnum"), want(1), `${lang}: the first question is question 1`);
    for (let i = 0; i < 3; i++) await answerOne(p, frame);
    assert.equal(await frame.textContent("#qnum"), want(4), `${lang}: three answers later it is question 4`);

    const shown = await frame.evaluate(() => ({
      table: getComputedStyle(document.querySelector("#count")).display !== "none",
      header: document.querySelector("header").innerText,
      tally: document.querySelector("#qnum").innerText.trim()
    }));
    assert.equal(shown.tally, want(4), `${lang}: the header shows the session count`);
    assert.equal(shown.table, false, `${lang}: the table position is hidden during a quiz`);
    assert.ok(!shown.header.includes("/71"), `${lang}: no table position is left in the quiz header (${shown.header.replace(/\n/g, " | ")})`);
    assert.deepEqual(errors, [], `${lang}: no page errors`);
  }
});

test("kana-cards: the list's edges say there is more above and below", { skip, timeout: 60000 }, async (t) => {
  const { p, frame, errors } = await open(t, "en");
  const cues = () => frame.evaluate(() => {
    const visible = (id) => {
      const el = document.querySelector(id), r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
    };
    const ref = document.querySelector("#reference");
    return { top: visible("#cue-top"), bottom: visible("#cue-bottom"), scrollTop: ref.scrollTop, max: ref.scrollHeight - ref.clientHeight };
  });

  let cue = await cues();
  assert.equal(cue.scrollTop, 0, "the list starts at the top");
  assert.ok(cue.max > 0, "the kana grid is taller than the screen");
  assert.equal(cue.top, false, "at the top there is no cue above");
  assert.equal(cue.bottom, true, "the bottom cue says more kana are below");

  await frame.evaluate(() => {
    const ref = document.querySelector("#reference");
    ref.scrollTop = Math.round((ref.scrollHeight - ref.clientHeight) / 2);
  });
  await frame.waitForFunction(() => document.querySelector("#reference").scrollTop > 0);
  await sleep(100);
  cue = await cues();
  assert.equal(cue.top, true, "in the middle the top edge says there is more above");
  assert.equal(cue.bottom, true, "in the middle the bottom edge says there is more below");

  await frame.evaluate(() => {
    const ref = document.querySelector("#reference");
    ref.scrollTop = ref.scrollHeight;
  });
  await frame.waitForFunction(() => {
    const ref = document.querySelector("#reference");
    return ref.scrollTop >= ref.scrollHeight - ref.clientHeight - 1;
  });
  await sleep(100);
  cue = await cues();
  assert.equal(cue.top, true, "at the bottom the top cue stays");
  assert.equal(cue.bottom, false, "at the bottom there is no cue below");
  assert.deepEqual(errors, [], "no page errors");
});
