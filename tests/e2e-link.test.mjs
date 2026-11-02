// The Radio link, end to end: two tabs of one browser over the ?linkfake BroadcastChannel.
// Needs Playwright, which the repo does not depend on, so this test skips without it:
//   node --test tests/e2e-link.test.mjs
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
  browser = await pw.chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

const logOf = (p) => p.evaluate(() => (window.LOPDA_DEBUG.radio.log || []).map((e) => ({
  dir: e.dir, kind: e.kind, text: e.text, pic: e.pic, lost: !!e.lost, pending: !!e.pending
})));

async function waitOut(p, kind, text) {
  await p.waitForFunction(({ kind, text }) => {
    const r = window.LOPDA_DEBUG && window.LOPDA_DEBUG.radio;
    return !!r && r.log.some((e) => e.dir === "out" && e.kind === kind && !e.pending && (text == null || e.text === text));
  }, { kind, text }, { timeout: 60000 });
}
async function waitIn(p, kind, text) {
  await p.waitForFunction(({ kind, text }) => {
    const r = window.LOPDA_DEBUG && window.LOPDA_DEBUG.radio;
    return !!r && r.log.some((e) => e.dir === "in" && e.kind === kind && (text == null || e.text === text));
  }, { kind, text }, { timeout: 60000 });
}

test("radio link: two tabs, text both ways, a picture, then hang up", { skip, timeout: 240000 }, async (t) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, locale: "zh-CN", serviceWorkers: "block"
  });
  t.after(() => context.close());
  const errors = [];

  async function openRadio() {
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await p.goto(base + "/runtime/?linkfake&debug", { waitUntil: "networkidle" });
    await p.waitForFunction(() => document.getElementById("savestate").textContent !== "启动中…", null, { timeout: 15000 });
    await p.locator("#home .app", { has: p.locator(".label", { hasText: /^电波台$/ }) }).click();
    await p.locator("#radio-page-menu").waitFor({ state: "visible" });
    return p;
  }

  const a = await openRadio();
  const b = await openRadio();

  await a.locator('#radio-menu li[data-act="link"]').click();
  await a.waitForTimeout(300);
  await b.locator('#radio-menu li[data-act="link"]').click();
  await a.locator("#radio-page-link").waitFor({ state: "visible", timeout: 90000 });
  await b.locator("#radio-page-link").waitFor({ state: "visible", timeout: 90000 });

  async function sendText(p, peer, text) {
    await p.locator("#radio-write").click();
    await p.locator("#radio-page-write").waitFor({ state: "visible" });
    await p.locator("#radio-write-input").fill(text);
    await p.locator("#radio-write-send").click();
    await p.locator("#radio-page-link").waitFor({ state: "visible" });
    await waitOut(p, "text", text);
    await waitIn(peer, "text", text);
  }

  await sendText(a, b, "第一行");
  await sendText(b, a, "reply");

  /* one picture from A: two painted cells, the rest paper. The 64 bytes must arrive byte for byte. */
  await a.locator("#radio-draw").click();
  await a.locator("#radio-page-draw").waitFor({ state: "visible" });
  await a.locator("#radio-draw-cv").click({ position: { x: 40, y: 40 } });
  await a.locator("#radio-draw-cv").click({ position: { x: 88, y: 72 } });
  await a.locator("#radio-draw-send").click();
  await a.locator("#radio-page-link").waitFor({ state: "visible" });
  await waitOut(a, "pic");
  await waitIn(b, "pic");

  /* the log opens with a system line where the link began; the messages follow */
  const all = await logOf(a);
  assert.equal(all[0].dir, "sys", JSON.stringify(all));
  assert.equal(all[0].kind, "open");
  const msgs = (l) => l.filter((e) => e.dir !== "sys");
  const la = msgs(await logOf(a)), lb = msgs(await logOf(b));
  assert.deepEqual(la.map((e) => [e.dir, e.kind]), [["out", "text"], ["in", "text"], ["out", "pic"]], JSON.stringify(la));
  assert.deepEqual(lb.map((e) => [e.dir, e.kind]), [["in", "text"], ["out", "text"], ["in", "pic"]], JSON.stringify(lb));
  assert.equal(la[0].text, "第一行");
  assert.equal(la[1].text, "reply");
  assert.equal(lb[0].text, "第一行");
  assert.equal(lb[1].text, "reply");
  assert.equal(la[2].pic.length, 64, "a picture is 64 bytes");
  assert.equal(lb[2].pic.length, 64, "a picture is 64 bytes");
  assert.deepEqual(lb[2].pic, la[2].pic, "the picture arrived intact");
  assert.ok(la[2].pic.some((v) => v !== 255), "the painted cells are in the bytes");
  assert.ok(la.every((e) => !e.pending && !e.lost), "nothing is still pending or lost");
  assert.ok(lb.every((e) => !e.pending && !e.lost), "nothing is still pending or lost");

  /* the chat: ours on the right with a tick once acknowledged, theirs on the left; the bar shows the bars and the tag */
  assert.equal(await a.locator("#radio-link-log .radio-msg.out").count(), 2);
  assert.equal(await a.locator("#radio-link-log .radio-msg.in").count(), 1);
  assert.equal(await a.locator("#radio-link-log .radio-msg.out .radio-ok").count(), 2);
  assert.equal(await a.locator("#radio-link-log .radio-sys").count(), 1);
  assert.ok(await a.locator("#radio-sig").isVisible(), "the signal bars show while linked");
  assert.ok((await a.locator("#radio-sig i.on").count()) >= 1, "at least one bar lit");
  assert.match(await a.textContent("#radio-title"), /在线/);
  assert.match(await a.textContent("#radio-bar .radio-exp"), /试验/);
  assert.ok(await a.locator("#link-mark").isVisible(), "the antenna shows in the status bar");

  /* the status line (only with ?debug) names the side and the rate */
  await a.waitForFunction(() => /ms/.test(document.getElementById("radio-link-rate").textContent));
  assert.match(await a.textContent("#radio-link-role"), /发起方|应答方/);
  assert.match(await b.textContent("#radio-link-role"), /发起方|应答方/);

  /* A hangs up; the BYE reaches B, which returns to the menu with the log still in the document */
  await a.locator("#radio-hangup").click();
  await a.locator("#radio-page-menu").waitFor({ state: "visible", timeout: 60000 });
  await b.locator("#radio-page-menu").waitFor({ state: "visible", timeout: 60000 });
  assert.match(await b.textContent("#radio-menu-note"), /已断开/);
  const lbAfter = await logOf(b);
  assert.equal(msgs(lbAfter).length, 3, "B keeps its log after the hang-up");
  assert.deepEqual(lbAfter.filter((e) => e.dir === "sys").map((e) => e.kind), ["open", "close"], "B marks where the link began and ended");

  assert.deepEqual(errors, []);
});
