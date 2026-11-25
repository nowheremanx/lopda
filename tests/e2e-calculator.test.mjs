// Calculator 1.2.0: key sizes on the smallest frame, the arithmetic paths a player uses, and an old save that
// must open at 0 with its memory kept. Needs Playwright, which the repo does not depend on, so the browser tests
// skip without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-calculator.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "registry/apps/calculator";
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
  browser = await pw.chromium.launch({ args: ["--disable-site-isolation-trials"] });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
});
after(async () => { await context?.close(); await browser?.close(); server?.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* the dev harness with the one app frame resized to the smallest size the runtime gives an app without a chin pad */
async function open(t) {
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  t.after(() => p.close());
  await p.goto(`${base}/sdk/dev.html?app=${APP}`);
  await p.waitForFunction(() => document.getElementById("log").textContent.includes("loaded registry/apps/calculator"));
  await p.evaluate(() => {
    const s = document.querySelector(".screen");
    s.style.width = "331px";
    s.style.height = "359px";
  });
  await sleep(100);
  const frame = await appFrame(p);
  return { p, frame, errors };
}

async function appFrame(p) {
  for (let i = 0; i < 60; i++) {
    for (const f of p.frames()) {
      if (f === p.mainFrame()) continue;
      try {
        await f.waitForSelector("#keys button", { timeout: 200 });
        await f.waitForFunction(() => typeof window.__calc === "function", null, { timeout: 2000 });
        return f;
      } catch {}
    }
    await sleep(100);
  }
  throw new Error("the app frame did not load");
}

const state = (frame) => frame.evaluate(() => window.__calc());
const tap = (frame, label) => frame.getByRole("button", { name: label, exact: true }).click();

test("calculator: keys are 44 px or more (memory 32), do not overlap, and nothing scrolls at 331x359", { skip, timeout: 60000 }, async (t) => {
  const { frame, errors } = await open(t);
  assert.equal(await frame.evaluate(() => innerWidth), 331, "the app frame is 331 px wide");
  assert.equal(await frame.evaluate(() => innerHeight), 359, "the app frame is 359 px tall");

  const m = await frame.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("#keys button"));
    const boxes = buttons.map((el) => {
      const r = el.getBoundingClientRect();
      return { m: el.classList.contains("m"), label: el.textContent, x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix > 0.5 && iy > 0.5) overlaps.push(a.label + "/" + b.label);
    }
    const de = document.documentElement, body = document.body;
    return {
      boxes, overlaps,
      scrollW: Math.max(de.scrollWidth, body.scrollWidth), scrollH: Math.max(de.scrollHeight, body.scrollHeight),
      w: innerWidth, h: innerHeight
    };
  });

  assert.deepEqual(m.overlaps, [], "no two keys overlap");
  assert.ok(m.scrollH <= m.h + 1, `the page does not scroll vertically (${m.scrollH} > ${m.h})`);
  assert.ok(m.scrollW <= m.w + 1, `the page does not scroll sideways (${m.scrollW} > ${m.w})`);

  const memory = m.boxes.filter((b) => b.m), main = m.boxes.filter((b) => !b.m);
  assert.equal(memory.length, 4, "MC / MR / M- / M+ are the short row");
  for (const b of memory) assert.ok(b.h >= 32, `${b.label} is ${b.h.toFixed(1)} px tall, want >= 32`);
  for (const b of main) assert.ok(b.h >= 44, `${b.label} is ${b.h.toFixed(1)} px tall, want >= 44`);

  // the order players know
  assert.deepEqual(main.map((b) => b.label).slice(0, 4), ["C", "±", "%", "÷"]);
  assert.deepEqual(main.map((b) => b.label).slice(4, 8), ["7", "8", "9", "×"]);
  assert.deepEqual(main.map((b) => b.label).slice(-3), ["0", ".", "="]);
  assert.deepEqual(errors, [], "no page errors");
});

test("calculator: 7 x 8 = 56, 122 + 11 % = 135.42, and the memory keys still add and recall", { skip, timeout: 60000 }, async (t) => {
  const { frame, errors } = await open(t);
  for (const k of ["7", "×", "8", "="]) await tap(frame, k);
  assert.equal((await state(frame)).text, "56");

  for (const k of ["C", "1", "2", "2", "+", "1", "1", "%"]) await tap(frame, k);
  assert.equal((await state(frame)).text, "135.42");

  for (const k of ["C", "7", "M+", "C", "MR"]) await tap(frame, k);
  assert.equal((await state(frame)).mem, 7, "M+ adds the shown number to memory");
  assert.equal((await state(frame)).text, "7", "MR shows the memory");

  await tap(frame, "MC");
  await tap(frame, "MR");
  assert.equal((await state(frame)).text, "0", "MC clears the memory");
  assert.deepEqual(errors, [], "no page errors");
});

test("calculator: an old save with a last result opens at 0; the memory comes back", { skip, timeout: 60000 }, async (t) => {
  const { p } = await open(t);
  // exactly what calculator 1.1.1 stored: the memory and the last display
  await p.evaluate(() => localStorage.setItem("lopda-dev:calculator", JSON.stringify({ calc: { m: 42, a: 78 } })));
  const navigated = p.waitForEvent("framenavigated", (f) => f !== p.mainFrame());
  await p.click("#reload");
  await navigated;

  const frame = await appFrame(p);
  await frame.waitForFunction(() => window.__calc().mem === 42, null, { timeout: 5000 });
  const s = await state(frame);
  assert.equal(s.text, "0", "the display starts at 0, not at the old result");
  assert.equal(s.mem, 42, "the memory register is restored");

  await tap(frame, "MR");
  assert.equal((await state(frame)).text, "42", "MR returns the restored memory");
});

test("check-app passes the calculator without a warning", () => {
  const out = execFileSync(process.execPath, ["tools/check-app.mjs", APP], { cwd: ROOT, encoding: "utf8" });
  assert.match(out, /PASS\s+calculator/);
  assert.doesNotMatch(out, /\bwarn:/);
});
