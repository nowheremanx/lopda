// Sensor Desk 1.0.1: the "more" cue on the smallest screen, and the code sample running as it is pasted.
// The app is plain HTML with no runtime around it here: a fake PAD, as SPEC.md 6.4 describes it, is injected
// before the app's own script. Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-sensor-desk.test.mjs
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
const SMALL = { width: 331, height: 359 };   // the smallest LCD, sdk/UI.md section 1
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
  browser = await pw.chromium.launch();
  context = await browser.newContext({ viewport: SMALL, hasTouch: true });
});
after(async () => { await context?.close(); await browser?.close(); server?.close(); });

/* the app's only outside contact: the PAD object the runtime injects (SPEC.md 6.4), with both sensors on */
const fakePad = () => {
  const handlers = {};
  window.__fire = (kind, data) => (handlers[kind] || []).forEach((fn) => fn(data));
  window.PAD = {
    lang: "zh",
    sfx() {},
    on(kind, fn) { (handlers[kind] = handlers[kind] || []).push(fn); },
    off() {},
    isDown() { return false; },
    motion: { start() { return Promise.resolve("on"); }, stop() {}, zero() {} },
    mic: { start() { return Promise.resolve("on"); }, stop() {} }
  };
};

async function appPage(t) {
  const p = await context.newPage();
  t.after(() => p.close());
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(fakePad);
  await p.goto(`${base}/registry/apps/sensor-desk/index.html`);
  await p.waitForFunction(() => document.getElementById("mic-hint").textContent.length > 0);
  return { p, errors };
}

test("sensor-desk: at 331x359 the more cue shows until the page is scrolled to the end", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await appPage(t);
  const top = await p.evaluate(() => {
    const main = document.querySelector("main"), cue = document.getElementById("more-cue");
    const m = main.getBoundingClientRect(), c = cue.getBoundingClientRect(), h = document.getElementById("sound-title").getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight, scrollTop: main.scrollTop,
      scrollable: main.scrollHeight > main.clientHeight,
      cue: getComputedStyle(cue).visibility, cueText: cue.textContent,
      cueInView: c.top >= m.top && c.bottom <= innerHeight,
      headingBelow: h.top >= m.bottom,
      more: main.scrollHeight - main.clientHeight
    };
  });
  assert.equal(top.width, 331, "the LCD is 331 px wide at the smallest size");
  assert.equal(top.height, 359);
  assert.ok(top.scrollable, "the page is longer than the smallest screen: " + JSON.stringify(top));
  assert.equal(top.headingBelow, true, "the sound heading is below the first screen, so the cue is what says so");
  assert.equal(top.more > 24, true, "there is more than a hair below: " + top.more);
  assert.equal(top.cue, "visible", "the cue is visible before scrolling");
  assert.equal(top.cueText, "更多 ↓");
  assert.equal(top.cueInView, true, "the cue sits at the bottom edge");

  await p.evaluate(() => { const m = document.querySelector("main"); m.scrollTop = m.scrollHeight; });
  await p.waitForFunction(() => getComputedStyle(document.getElementById("more-cue")).visibility === "hidden");
  const end = await p.evaluate(() => {
    const main = document.querySelector("main"), pre = document.getElementById("code");
    const m = main.getBoundingClientRect(), r = pre.getBoundingClientRect();
    return { atEnd: main.scrollTop + main.clientHeight >= main.scrollHeight - 1, lastLine: r.bottom - m.bottom };
  });
  assert.equal(end.atEnd, true);
  assert.ok(end.lastLine <= 1, "the last line of the code is in view at the end: " + end.lastLine);
  assert.equal(await p.isVisible("#more-cue"), false, "the cue goes at the end");

  await p.evaluate(() => { document.querySelector("main").scrollTop = 0; });
  await p.waitForFunction(() => getComputedStyle(document.getElementById("more-cue")).visibility === "visible");
  assert.equal(await p.isVisible("#more-cue"), true, "and comes back on the way up");
  assert.deepEqual(errors, []);
});

test("sensor-desk: the code sample runs as pasted, and tilt and sound reach #out", { skip, timeout: 60000 }, async (t) => {
  const app = await appPage(t);
  const code = await app.p.textContent("#code");
  assert.match(code, /PAD\.motion/, "the sample is the app's own tilt path");
  assert.match(code, /PAD\.mic/);

  const p = await context.newPage();
  t.after(() => p.close());
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.setContent('<!doctype html><meta charset="utf-8"><div id="out"></div>');
  await p.evaluate((code) => {
    const handlers = {};
    window.__fire = (kind, data) => (handlers[kind] || []).forEach((fn) => fn(data));
    window.PAD = {
      on(kind, fn) { (handlers[kind] = handlers[kind] || []).push(fn); },
      off() {},
      motion: { start() { return Promise.resolve("on"); }, stop() {}, zero() {} },
      mic: { start() { return Promise.resolve("on"); }, stop() {} }
    };
    new Function(code)();
  }, code);

  /* start() resolved "on": the sample writes the answer, and the readings replace it */
  await p.waitForFunction(() => document.getElementById("out").textContent === "on");
  await p.evaluate(() => window.__fire("tilt", { x: 0.5, y: -0.25, heading: 90, flat: { x: 0, y: 0 } }));
  assert.equal(await p.textContent("#out"), "x 0.50 y -0.25 90");
  await p.evaluate(() => window.__fire("sound", { level: 0.75, pitch: 440 }));
  assert.equal(await p.textContent("#out"), "level 0.75 440");
  /* null is normal: no compass, no clear note (SPEC.md 6.4) */
  await p.evaluate(() => window.__fire("tilt", { x: -0.5, y: 0.25, heading: null }));
  assert.equal(await p.textContent("#out"), "x -0.50 y 0.25 -");
  await p.evaluate(() => window.__fire("sound", { level: 0, pitch: null }));
  assert.equal(await p.textContent("#out"), "level 0.00 -");

  /* the other two answers, and the guard: before runtime 0.24.0 neither sensor exists and the sample still runs */
  await p.evaluate((code) => {
    document.getElementById("out").textContent = "";
    window.PAD = { on() {}, off() {}, motion: { start() { return Promise.resolve("denied"); }, stop() {} } };
    new Function(code)();
  }, code);
  await p.waitForFunction(() => document.getElementById("out").textContent === "denied");
  await p.evaluate((code) => { window.PAD = {}; new Function(code)(); }, code);
  assert.equal(await p.textContent("#out"), "denied", "the guard has nothing to say, and says nothing");
  assert.deepEqual(app.errors, [], "the app's own page stays clean");
  assert.deepEqual(errors, []);
});

test("sensor-desk: the code sample stays inside its box, no line scrolls sideways", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await appPage(t);
  const box = await p.evaluate(() => {
    const pre = document.getElementById("code"), main = document.querySelector("main");
    main.scrollTop = main.scrollHeight;
    const lines = pre.textContent.split("\n");
    return {
      inner: innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth,
      mainClient: main.clientWidth, mainScroll: main.scrollWidth,
      preClient: pre.clientWidth, preScroll: pre.scrollWidth,
      count: lines.length, longest: Math.max.apply(null, lines.map((s) => s.length))
    };
  });
  assert.ok(box.doc <= box.inner && box.body <= box.inner, "no horizontal page scroll: " + JSON.stringify(box));
  assert.ok(box.mainScroll <= box.mainClient, "main does not scroll sideways: " + box.mainScroll + " > " + box.mainClient);
  assert.ok(box.preScroll <= box.preClient, "the sample does not scroll sideways: " + box.preScroll + " > " + box.preClient);
  assert.ok(box.longest <= 38, "no line runs on past the column: " + box.longest + " characters");
  assert.ok(box.count <= 46, "the sample stays a page or so: " + box.count + " lines");
  assert.deepEqual(errors, []);
});
