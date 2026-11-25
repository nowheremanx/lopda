// Whack-a-mole 4.1.0 in the dev harness: the menu's best line with and without records, the dirt tell
// before a mole rises (window.__mole, tests only), and a 60 s game that still ends at 60 s.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-whack-a-mole.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "registry/apps/whack-a-mole";
/* the dev harness keeps PAD.save in localStorage, one key per manifest id */
const SAVE = "lopda-dev:whack-a-mole";
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
  browser = await pw.chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* one dev harness tab on the app in its own context, so one test's save never reaches the next */
async function tab(t, { lang, clock } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  t.after(() => context.close());
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  if (clock) await p.clock.install({ time: clock });
  await p.goto(`${base}/sdk/dev.html?app=${APP}${lang ? "&lang=" + lang : ""}`, { waitUntil: "load" });
  return { p, frame: await appFrame(p), errors };
}

/* the app frame inside the harness (srcdoc, sandboxed: the harness is the only parent) */
async function appFrame(p) {
  await p.waitForFunction(() => /loaded registry\/apps\/whack-a-mole|load failed/.test(document.getElementById("log").textContent), null, { timeout: 10000 });
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) {
    const f = p.frames().find((x) => x !== p.mainFrame());
    if (f) { try { await f.waitForSelector("#c", { timeout: 500 }); frame = f; } catch {} }
    if (!frame) await sleep(100);
  }
  assert.ok(frame, "the app frame loads");
  return frame;
}

const bests = (frame) => frame.evaluate(() => document.getElementById("bests").textContent.trim());

test("whack-a-mole: 「还没有记录」 with no record yet, the numbers once a save has them", { skip, timeout: 60000 }, async (t) => {
  const zh = await tab(t, { lang: "zh" });
  await zh.frame.waitForFunction(() => document.getElementById("bests").textContent.trim() === "还没有记录", null, { timeout: 5000 });
  assert.equal(await bests(zh.frame), "还没有记录", "two dashes would read as a broken screen");
  assert.equal(await zh.frame.evaluate(() => document.getElementById("bests").classList.contains("hide")), false, "the line is on the menu");
  assert.deepEqual(zh.errors, []);

  const en = await tab(t, { lang: "en" });
  await en.frame.waitForFunction(() => document.getElementById("bests").textContent.trim() === "No records yet", null, { timeout: 5000 });
  assert.deepEqual(en.errors, []);

  /* a save written by the old 4.0.0 (same keys and shapes): the menu reads it back as numbers */
  const saved = await tab(t, { lang: "zh" });
  await saved.p.evaluate(([key, v]) => localStorage.setItem(key, JSON.stringify(v)), [SAVE, { best60: 42, bestEndless: 9, bestEndlessTime: 95 }]);
  await saved.p.reload({ waitUntil: "load" });
  const frame = await appFrame(saved.p);
  await frame.waitForFunction(() => /\d/.test(document.getElementById("bests").textContent), null, { timeout: 5000 });
  assert.equal(await bests(frame), "60 秒 42 · 无尽 1:35", "both records, the endless one as time");
  assert.equal(await frame.evaluate(() => document.getElementById("bs").textContent.trim()), "最高 42", "the HUD's best follows the mode");

  /* only one record: a dash for the missing one is enough */
  await saved.p.evaluate(([key, v]) => localStorage.setItem(key, JSON.stringify(v)), [SAVE, { best60: 7 }]);
  await saved.p.reload({ waitUntil: "load" });
  const one = await appFrame(saved.p);
  await one.waitForFunction(() => /\d/.test(document.getElementById("bests").textContent), null, { timeout: 5000 });
  assert.equal(await bests(one), "60 秒 7 · 无尽 --");
  assert.deepEqual(saved.errors, []);
});

test("whack-a-mole: a hole's dirt twitches for at least 0.2 s before its mole is up", { skip, timeout: 60000 }, async (t) => {
  const { frame, errors } = await tab(t);

  /* tests only: log each hole's state changes from the read-only hook, once a frame */
  await frame.evaluate(() => {
    window.__moleLog = { log: [], until: performance.now() + 25000 };
    const seen = [];
    const tick = () => {
      const now = performance.now(), st = window.__mole();
      st.holes.forEach((h, i) => {
        if (seen[i] === h.s) return;
        if (h.s !== "down") window.__moleLog.log.push({ i, s: h.s, kind: h.kind, t: now });
        seen[i] = h.s;
      });
      if (now < window.__moleLog.until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await frame.locator("#btns button").first().click();   /* 60 秒 */
  assert.equal(await frame.evaluate(() => window.__mole().playing), true, "the 60 s game started");
  /* wait for two tell -> rise -> up cycles to be complete, not just two tells */
  await frame.waitForFunction(() => {
    const l = window.__moleLog.log;
    let n = 0;
    l.forEach((e, k) => {
      if (e.s !== "tell") return;
      const after = l.slice(k + 1).filter((x) => x.i === e.i);
      if (after.some((x) => x.s === "rise") && after.some((x) => x.s === "up")) n++;
    });
    return n >= 2;
  }, null, { timeout: 25000 });

  const runs = await frame.evaluate(() => {
    const l = window.__moleLog.log, out = [];
    l.forEach((e, k) => {
      if (e.s !== "tell") return;
      const after = l.slice(k + 1).filter((x) => x.i === e.i);
      const rise = after.find((x) => x.s === "rise");
      const up = after.find((x) => x.s === "up");
      if (rise && up) out.push({ i: e.i, kind: e.kind, tell: e.t, rise: rise.t, up: up.t });
    });
    return out;
  });
  assert.ok(runs.length >= 2, "two holes were told and then rose: " + JSON.stringify(runs));
  for (const r of runs) {
    assert.ok(r.rise - r.tell >= 200, `hole ${r.i}: rose only ${Math.round(r.rise - r.tell)} ms after its tell`);
    assert.ok(r.up - r.tell >= 200, `hole ${r.i}: up only ${Math.round(r.up - r.tell)} ms after its tell`);
  }
  /* the mole's own rise is still the quick one: the tell, not a slow pop, is the warning */
  const quickest = Math.min(...runs.map((r) => r.up - r.rise));
  assert.ok(quickest < 300, "the rise stays quick: " + Math.round(quickest) + " ms");
  assert.deepEqual(errors, []);
});

test("whack-a-mole: a 60 s game still ends at 60 s", { skip, timeout: 90000 }, async (t) => {
  const { p, frame, errors } = await tab(t, { lang: "zh", clock: new Date(2026, 10, 24, 12, 0) });
  await frame.locator("#btns button").first().click();
  assert.equal(await frame.evaluate(() => window.__mole().playing), true);

  /* freeze the wall clock, then move only by hand: a second of runFor is a second of play */
  await p.clock.pauseAt(new Date(await p.evaluate(() => Date.now()) + 1000));
  await p.clock.runFor(57000);
  assert.equal(await frame.evaluate(() => window.__mole().playing), true, "still playing after 57 s");
  await p.clock.runFor(4000);

  const end = await frame.evaluate(() => ({
    playing: window.__mole().playing,
    title: document.getElementById("ot").textContent.trim(),
    clock: document.getElementById("tm").textContent.trim(),
    result: document.getElementById("op").textContent.trim(),
    overlay: !document.getElementById("ov").classList.contains("hide")
  }));
  assert.equal(end.playing, false, "over by 61 s");
  assert.equal(end.overlay, true, "the result screen is up");
  assert.equal(end.title, "时间到");
  assert.equal(end.clock, "0 秒");
  assert.match(end.result, /命中 \d+\/\d+/);
  assert.deepEqual(errors, []);
});
