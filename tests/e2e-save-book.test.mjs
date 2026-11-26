// SaveBook's add form must hold still while tallies are added, so two quick "type, tap Add" rounds land
// on the same button instead of the row the first round pushed down. The info page's footer must name
// only the keys that work there. The app frame is the smallest handheld screen with the chin pad,
// 331x359 (sdk/UI.md 1). Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-save-book.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "sdk/examples/save-book";
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
  /* without this flag a sandboxed iframe can render blank in headless Chromium, as tests/e2e.test.mjs notes */
  browser = await pw.chromium.launch({ args: ["--disable-site-isolation-trials"] });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
});
after(async () => { await context?.close(); await browser?.close(); server?.close(); });

/* open the dev harness, shrink its screen to 331x359, and wait for the app to finish loading */
async function open(t) {
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  t.after(() => p.close());
  await p.goto(`${base}/sdk/dev.html?app=${APP}&lang=zh`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  await p.evaluate(() => {
    const screen = document.querySelector(".screen");
    screen.style.width = "331px";
    screen.style.height = "359px";
  });
  const app = p.frameLocator("#app");
  /* disabled until PAD.saveInfo and PAD.load have answered */
  await app.locator("#add:not([disabled])").waitFor({ timeout: 5000 });
  const frameSize = await app.locator("html").evaluate((el) => [el.clientWidth, el.clientHeight]);
  assert.deepEqual(frameSize, [331, 359], "the app frame is the smallest handheld screen");
  return { p, app, errors };
}

test("save-book: adding tallies never moves the add form; the info page names its own keys", { skip, timeout: 60000 }, async (t) => {
  const { p, app, errors } = await open(t);

  /* measure the Add button once, then aim every tap at that same point */
  const add = app.locator("#add");
  const box = await add.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, "the Add button is laid out");
  assert.ok(box.height >= 44, `the Add button is 44 px tall (got ${box.height})`);
  const target = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  for (const name of ["coffee", "tea", "water"]) {
    await app.locator("#name").fill(name);
    /* the same page point every time, as a thumb tapping twice without looking would */
    await p.mouse.click(target.x, target.y);
  }

  assert.equal(await app.locator(".counter").count(), 3, "three tallies were added");
  assert.deepEqual(await app.locator(".counter .entry span").allTextContents(), ["coffee", "tea", "water"]);
  assert.deepEqual(await app.locator(".counter .entry strong").allTextContents(), ["0", "0", "0"],
    "no tap landed on the new row's - button");

  /* the form did not move when the list grew below it */
  const after = await add.boundingBox();
  for (const key of ["x", "y", "width", "height"]) {
    assert.ok(Math.abs(after[key] - box[key]) < 0.5,
      `the Add button's ${key} stays put (${box[key]} -> ${after[key]})`);
  }

  /* the info page's footer lists A and B, not the main screen's keys */
  await p.locator("#pad:not([hidden])").waitFor();
  await p.locator('#pad [data-b="start"]').click();
  await app.locator("#infoScreen:not(.hidden)").waitFor();
  assert.equal((await app.locator("#hint").textContent()).trim(), "A / B 返回");
  assert.doesNotMatch(await app.locator("#hint").textContent(), /加一|START/);
  assert.notEqual((await app.locator("#infoDetail").textContent()).trim(), "", "the save details are shown");

  /* B leaves the info page, and the main screen's keys come back */
  await p.locator('#pad [data-b="b"]').click();
  await app.locator("#add").waitFor();
  assert.equal((await app.locator("#hint").textContent()).trim(), "↑↓ 选择　A 加一　START 信息");

  /* the same footer rule in English */
  await p.selectOption("#lang", "en");
  await app.locator("#hint").filter({ hasText: "START Info" }).waitFor({ timeout: 5000 });
  await app.locator("#add:not([disabled])").waitFor({ timeout: 5000 });
  await p.locator('#pad [data-b="start"]').click();
  await app.locator("#infoScreen:not(.hidden)").waitFor();
  assert.equal((await app.locator("#hint").textContent()).trim(), "A / B back");

  assert.deepEqual(errors, [], "no page errors");
});
