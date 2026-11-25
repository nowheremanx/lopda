// Paint 1.2.0 at the smallest app frame, 331x359, in both languages: the tool rows are a fixed five-column
// grid (no label wraps onto a line of its own), the canvas takes the rest of the screen, and Redo mirrors Undo.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-paint.test.mjs
//
// Canvas width before this change, measured on the 1.1.1 layout at 331x359: 178 px with Chinese tools and
// 132 px with English ones (the English second row wrapped, so the tools ate the stage). 1.2.0 gives 202 px
// in both languages; the assertion below keeps at least 200.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

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
const MESSAGES = { zh: { noredo: "没有可以重做的了。" }, en: { noredo: "Nothing to redo." } };
const INK = [31, 42, 20], PAPER = [163, 173, 126];

/* the dev harness (as tests/e2e-gomoku-link.test.mjs uses it), the app pinned to UI.md's smallest screen */
async function open(t, locale) {
  const lang = /^zh/i.test(locale) ? "zh" : "en";
  const p = await browser.newPage({ viewport: { width: 500, height: 700 }, hasTouch: true, locale });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  t.after(() => p.close());
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/paint`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded registry\/apps\/paint/.test(document.getElementById("log").textContent));
  /* set the size first, then the language (the harness starts the app again on a language change) */
  await p.evaluate(() => { const f = document.getElementById("app"); f.style.width = "331px"; f.style.height = "359px"; });
  if (lang === "en") await p.selectOption("#lang", "en");
  const app = p.frameLocator("#app");
  await app.locator("#cv").waitFor();
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) {
    const f = p.frames().find((x) => x !== p.mainFrame());
    if (f) { try { await f.waitForSelector("#cv", { timeout: 500 }); frame = f; } catch {} }
    if (!frame) await sleep(100);
  }
  assert.ok(frame, `${lang}: the app frame loads`);
  await frame.waitForFunction((l) => document.documentElement.lang === l, lang, { timeout: 5000 });
  await p.waitForTimeout(100);
  return { p, app, frame, errors };
}

const readPixel = (frame, x, y) => frame.evaluate(([x, y]) =>
  Array.from(document.getElementById("cv").getContext("2d").getImageData(x, y, 1, 1).data.slice(0, 3)), [x, y]);

/* one tap in the middle of a pixel, through the canvas's pointer handlers */
async function dot(p, frame, x, y) {
  const box = await frame.locator("#cv").boundingBox();
  const k = box.width / 96;
  await p.mouse.click(box.x + (x + 0.5) * k, box.y + (y + 0.5) * k);
  await p.waitForTimeout(50);
}

for (const locale of ["zh-CN", "en-US"]) {
  const lang = locale.startsWith("zh") ? "zh" : "en";
  test(`paint at 331x359 in ${lang}: a five-column toolbar, as much canvas as fits, and redo`, { skip, timeout: 60000 }, async (t) => {
    const { p, app, frame, errors } = await open(t, locale);

    /* (a) every tool button keeps its cell, its label fits, and the whole screen fits without scrolling */
    const layout = await frame.evaluate(() => {
      const root = document.scrollingElement;
      const buttons = [...document.querySelectorAll("button")]
        .filter((b) => b.offsetParent !== null)
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { id: b.id, text: b.textContent, x: r.x, y: r.y, w: r.width, h: r.height, sw: b.scrollWidth, cw: b.clientWidth };
        });
      const cv = document.getElementById("cv"), r = cv.getBoundingClientRect();
      return {
        vw: innerWidth, vh: innerHeight, sw: root.scrollWidth, sh: root.scrollHeight,
        buttons, canvas: { w: r.width, h: r.height }, rendering: getComputedStyle(cv).imageRendering
      };
    });
    assert.deepEqual([layout.vw, layout.vh], [331, 359], "the app frame is 331x359");
    assert.ok(layout.sh <= layout.vh, `the page does not scroll vertically (${layout.sh} > ${layout.vh})`);
    assert.ok(layout.sw <= layout.vw, `the page does not scroll sideways (${layout.sw} > ${layout.vw})`);
    for (const b of layout.buttons) {
      assert.ok(b.w >= 44 && b.h >= 44, `${b.id} "${b.text}" is at least 44x44 (got ${b.w}x${b.h})`);
      assert.ok(b.sw <= b.cw, `${b.id} "${b.text}" fits its cell (scrollWidth ${b.sw} > clientWidth ${b.cw})`);
    }
    for (let i = 0; i < layout.buttons.length; i++) for (let j = i + 1; j < layout.buttons.length; j++) {
      const a = layout.buttons[i], b = layout.buttons[j];
      const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
        * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      assert.equal(overlap, 0, `${a.id} and ${b.id} do not overlap`);
    }
    assert.equal(layout.buttons.length, 10, "five buttons in each of the two rows");

    /* (b) the canvas takes what the tools leave: square, crisp, and larger than the 1.1.1 layout */
    assert.ok(layout.canvas.w >= 200, `canvas is at least 200 css px wide (got ${layout.canvas.w}; was 178 zh / 132 en)`);
    assert.equal(layout.canvas.w, layout.canvas.h, "the canvas is square");
    assert.ok(/pixelated|crisp-edges/.test(layout.rendering), `the canvas stays crisp (${layout.rendering})`);

    /* (c) draw, Undo, Redo: the same pixel comes back */
    await dot(p, frame, 10, 10);
    assert.deepEqual(await readPixel(frame, 10, 10), INK, "the stroke is ink");
    await app.locator("#undo").click();
    await p.waitForTimeout(50);
    assert.deepEqual(await readPixel(frame, 10, 10), PAPER, "Undo takes the stroke away");
    await app.locator("#redo").click();
    await p.waitForTimeout(50);
    assert.deepEqual(await readPixel(frame, 10, 10), INK, "Redo puts the same stroke back");

    /* a new stroke after an Undo throws the redo away, and Redo says so */
    await dot(p, frame, 20, 20);
    await app.locator("#undo").click();
    await p.waitForTimeout(50);
    assert.deepEqual(await readPixel(frame, 20, 20), PAPER, "the second stroke is undone");
    await dot(p, frame, 30, 30);
    assert.deepEqual(await readPixel(frame, 30, 30), INK, "a new stroke is drawn");
    await app.locator("#redo").click();
    assert.equal((await app.locator("#msg").textContent()).trim(), MESSAGES[lang].noredo, "Redo is empty after a new stroke");
    assert.deepEqual(await readPixel(frame, 30, 30), INK, "the new stroke stays");
    assert.deepEqual(await readPixel(frame, 20, 20), PAPER, "the undone stroke does not come back");

    assert.deepEqual(errors, [], "no page errors");
  });
}
