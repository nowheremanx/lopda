// 玄机阁 in the dev harness at the smallest app frame, driven only by the chin-pad keys.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-luck-compass.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "registry/apps/luck-compass";
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

async function appFrame(p) {
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  for (let i = 0; i < 60; i++) {
    const frame = p.frames().find((x) => x !== p.mainFrame());
    if (frame) {
      try {
        await frame.waitForFunction(() => typeof section !== "undefined" && section === "counter", null, { timeout: 500 });
        return frame;
      } catch {}
    }
    await sleep(100);
  }
  assert.fail("the app frame did not start at the counter");
}

test("luck-compass: counter sections, daily slip and notes work from keys", { skip, timeout: 60000 }, async (t) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  t.after(() => context.close());
  const p = await context.newPage(), errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(`${base}/sdk/dev.html?app=${APP}&lang=zh`);
  const frame = await appFrame(p);
  await p.evaluate(() => {
    const el = document.getElementById("app");
    el.style.width = "331px";
    el.style.height = "359px";
  });
  await p.waitForTimeout(150);
  assert.deepEqual(await frame.evaluate(() => [document.documentElement.clientWidth, document.documentElement.clientHeight]),
    [331, 359], "the app frame is the smallest screen");

  const key = async (value) => { await p.keyboard.press(value); await p.waitForTimeout(60); };
  const state = () => frame.evaluate(() => ({
    section: typeof section === "undefined" ? null : section,
    cursor: typeof counterCursor === "undefined" ? null : counterCursor
  }));
  assert.deepEqual(await state(), { section: "counter", cursor: 0 }, "the app opens at the counter");

  const sections = ["almanac", "fortune", "compass", "hexagram"];
  for (let i = 0; i < sections.length; i++) {
    const cursor = (await state()).cursor;
    for (let n = (i - cursor + sections.length) % sections.length; n > 0; n--) await key("ArrowDown");
    await key("x");
    await frame.waitForFunction((expected) => typeof section !== "undefined" && section === expected, sections[i]);
    assert.equal((await state()).section, sections[i], `${sections[i]} opens from the counter`);
    await key("z");
    await frame.waitForFunction(() => typeof section !== "undefined" && section === "counter");
    assert.equal((await state()).section, "counter", `B returns from ${sections[i]}`);
  }
  assert.doesNotMatch(await p.textContent("#log"), /notes\.append dialog:/, "B does not write a note");

  const cursor = (await state()).cursor;
  for (let n = (1 - cursor + sections.length) % sections.length; n > 0; n--) await key("ArrowDown");
  await key("x");
  await frame.waitForFunction(() => typeof section !== "undefined" && section === "fortune");
  await frame.waitForFunction(() => typeof loadComplete !== "undefined" && loadComplete);
  const dateKey = await frame.evaluate(() => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  });
  await key("x");
  await p.waitForFunction((today) => {
    try {
      const save = JSON.parse(localStorage.getItem("lopda-dev:luck-compass") || "{}").slip;
      return save && save.dateKey === today && Number.isInteger(save.slip) && save.written === false;
    } catch { return false; }
  }, dateKey, { timeout: 10000 });
  await frame.waitForFunction(() => slipRevealAt >= 0 && game.time - slipRevealAt >= 0.64);
  const saved = async () => p.evaluate(() => JSON.parse(localStorage.getItem("lopda-dev:luck-compass") || "{}").slip);
  const firstDraw = await saved();
  await key("ArrowRight");
  await key("x");
  assert.deepEqual(await saved(), firstDraw, "a second A does not change today's saved slip");
  assert.doesNotMatch(await p.textContent("#log"), /notes\.append dialog:/, "A and the arrows never write a note; only START does");

  await key("Enter");
  await p.waitForFunction(() => /notes\.append dialog:/.test(document.getElementById("log").textContent) &&
    /-> saved/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  await frame.waitForFunction(() => slipState && slipState.written);
  assert.equal((await saved()).written, true, "START saves the written flag with the slip");
  assert.deepEqual(await frame.evaluate(() => ({ written: slipState.written, section })), { written: true, section: "fortune" },
    "the slip shows as written and remains on screen");
  assert.deepEqual(errors, []);
});
