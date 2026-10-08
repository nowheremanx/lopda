// End-to-end: the real runtime and every registry app in headless Chromium.
// Needs Playwright, which the repo does not depend on, so these tests skip without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e.test.mjs
// Serves the repo root on a random port, as `python3 -m http.server` would.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
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

async function page(t) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  t.after(() => p.close());
  return { p, errors };
}

test("the runtime boots without errors and shows the home screen", { skip }, async (t) => {
  const { p, errors } = await page(t);
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LopdaPlatform && window.LopdaStrings);
  await p.waitForTimeout(500);
  assert.ok(await p.evaluate(() => document.body.innerText.length > 0));
  assert.deepEqual(errors, []);
});

for (const id of readdirSync(join(ROOT, "registry", "apps"))) {
  test(`app ${id} loads in the dev harness and reports no errors`, { skip }, async (t) => {
    const { p, errors } = await page(t);
    await p.goto(`${base}/sdk/dev.html?app=registry/apps/${id}`, { waitUntil: "load" });
    await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
    /* press a few buttons, as a player would */
    for (const key of ["x", "ArrowDown", "x", "Enter", "z"]) { await p.keyboard.press(key); await p.waitForTimeout(120); }
    await p.waitForTimeout(500);
    const log = await p.textContent("#log");
    assert.doesNotMatch(log, /ERROR|load failed/, log);
    assert.deepEqual(errors, []);
  });
}
