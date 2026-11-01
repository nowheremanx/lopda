// Gomoku 1.6.0's radio match (PAD.link) in the dev harness: two tabs of sdk/dev.html on the same app pair over
// BroadcastChannel by themselves (600 ms each way), so this plays a real game between two app frames.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-gomoku-link.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "registry/apps/gomoku";
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
  browser = await pw.chromium.launch();
  // ONE context for both tabs: BroadcastChannel and localStorage are shared, as two windows of one handheld's browser
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
});
after(async () => { await context?.close(); await browser?.close(); server?.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* a dev harness tab, and the app frame inside it (srcdoc, sandboxed: the harness is the only parent) */
async function tab(t) {
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  t.after(() => p.close());
  await p.goto(`${base}/sdk/dev.html?app=${APP}`);
  await p.waitForFunction(() => document.getElementById("log").textContent.includes("loaded registry/apps/gomoku"));
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) {
    const f = p.frames().find((x) => x !== p.mainFrame());
    if (f) { try { await f.waitForSelector("#c", { timeout: 500 }); frame = f; } catch {} }
    if (!frame) await sleep(100);
  }
  assert.ok(frame, "the app frame loads");
  return { p, frame, errors };
}

const state = (frame) => frame.evaluate(() => window.__gomoku());

async function waitState(frame, fn, arg, timeout = 15000) {
  await frame.waitForFunction(fn, arg, { timeout });
}

/* place a stone through the canvas, the way a mouse player would (the game maps the border back to the board) */
async function place(t, frame, x, y) {
  const s = await state(frame);
  const box = await frame.locator("#c").boundingBox();
  const k = box.width / s.size;
  await t.p.mouse.click(box.x + (s.pad + x * s.cell) * k, box.y + (s.pad + y * s.cell) * k);
}
const waitMoves = (frame, n) => waitState(frame, (want) => window.__gomoku().moves === want, n);

/* a message from the harness's side, as the dev shim would deliver one (pad-shim accepts it from parent) */
async function inject(t, data) {
  await t.p.evaluate((d) => {
    document.getElementById("app").contentWindow.postMessage({ pad: 1, op: "link", event: "message", data: d }, "*");
  }, data);
}

const BLACK_MOVES = [[7, 7], [6, 7], [8, 7], [7, 6], [7, 8], [9, 7]];
const WHITE_MOVES = [[2, 2], [3, 3], [4, 4], [2, 4], [4, 2]];

test("gomoku link: pair, five moves each, duplicate ignored, missed move resynced after a reconnect, a gap asks for sync", { skip, timeout: 120000 }, async (t) => {
  const one = await tab(t);
  const two = await tab(t);
  for (const tabi of [one, two]) assert.equal(await tabi.frame.evaluate(() => !!window.PAD.link), true, "PAD.link is offered");

  // both open the match from the start menu; the runtime's pairing pairs the two tabs
  await one.frame.click("#lk");
  await two.frame.click("#lk");
  await waitState(one.frame, () => window.__gomoku() && window.__gomoku().open);
  await waitState(two.frame, () => window.__gomoku() && window.__gomoku().open);

  const s1 = await state(one.frame), s2 = await state(two.frame);
  assert.equal([s1.colour, s2.colour].sort().join(","), "1,2", "exactly one side is black");
  assert.equal(s1.initiator, s1.colour === 1, "the initiator is black");
  assert.equal(s2.initiator, s2.colour === 1, "the responder is white");
  const black = s1.colour === 1 ? one : two, white = black === one ? two : one;
  t.diagnostic(`black is tab ${black === one ? "one" : "two"}`);

  // five moves each way, alternating: every move takes a real 600 ms trip through BroadcastChannel
  for (let i = 0; i < 5; i++) {
    await place(black, black.frame, BLACK_MOVES[i][0], BLACK_MOVES[i][1]);
    await waitMoves(white.frame, 2 * i + 1);
    await place(white, white.frame, WHITE_MOVES[i][0], WHITE_MOVES[i][1]);
    await waitMoves(black.frame, 2 * i + 2);
  }
  const bAfter = await state(black.frame), wAfter = await state(white.frame);
  assert.equal(bAfter.moves, 10);
  assert.deepEqual(bAfter.board, wAfter.board, "both boards hold the same ten stones");
  assert.equal(bAfter.board[7][7], 1, "black's first stone is black on both sides");
  assert.equal(wAfter.board[2][2], 2, "white's first stone is white");

  // a duplicate move message (move 10 again) is ignored: same board, same count
  const dup = `m,${WHITE_MOVES[4][0]},${WHITE_MOVES[4][1]},10`;
  await inject(black, dup);
  await sleep(300);
  const bDup = await state(black.frame);
  assert.equal(bDup.moves, 10, "a seen move number is not placed twice");
  assert.deepEqual(bDup.board, bAfter.board);

  // black's move 11 goes over the link; white's move 12 is delivered to black only, so white misses it
  await place(black, black.frame, BLACK_MOVES[5][0], BLACK_MOVES[5][1]);
  await waitMoves(white.frame, 11);
  await inject(black, "m,10,10,12");
  await waitMoves(black.frame, 12);
  const bMiss = await state(black.frame), wMiss = await state(white.frame);
  assert.equal(wMiss.moves, 11, "white missed the message");
  assert.equal(bMiss.board[10][10], 2, "black has the white stone white never sent");
  assert.equal(wMiss.board[10][10], 0, "white never got it");

  // a disconnect: white closes, both keep their stones, and both get a reconnect button
  await white.frame.evaluate(() => window.PAD.link.close());
  await waitState(black.frame, () => !window.__gomoku().open);
  await waitState(white.frame, () => !window.__gomoku().open);
  assert.equal((await state(black.frame)).moves, 12, "the board stays after a close");
  assert.equal((await state(white.frame)).moves, 11, "the board stays after a close");

  // reconnect on both sides: each says "n,<count>", white has fewer and asks for the whole game
  await black.frame.click("#rc");
  await white.frame.click("#rc");
  await waitState(black.frame, () => window.__gomoku().open);
  await waitState(white.frame, () => window.__gomoku().open);
  await waitMoves(white.frame, 12);
  const bRe = await state(black.frame), wRe = await state(white.frame);
  assert.deepEqual(wRe.board, bRe.board, "the missed move is resynced");
  assert.equal(bRe.colour, bAfter.colour, "black stays black after a reconnect");
  assert.equal(wRe.colour, wAfter.colour, "white stays white after a reconnect");

  // a message with a gap in its numbers asks for sync; the peer answers with its whole game
  const syncsBefore = wRe.syncs;
  await inject(white, "m,11,11,14");   // move 13 is expected: this skips ahead
  await waitState(white.frame, (n) => window.__gomoku().syncs > n, syncsBefore);
  await sleep(1200);                    // syncs out, "all,..." comes back
  const wGap = await state(white.frame), bGap = await state(black.frame);
  assert.equal(wGap.moves, 12, "a gap does not place a stone");
  assert.deepEqual(wGap.board, bGap.board, "the board is unchanged by the reply");

  // Leave during a match asks nothing and goes back to the start menu, closing the link
  await black.frame.dispatchEvent("#ln", "pointerdown");
  await waitState(black.frame, () => window.__gomoku().mode === "solo");
  await black.frame.waitForFunction(() => window.PAD.link.state === "closed", null, { timeout: 5000 });
  await waitState(white.frame, () => !window.__gomoku().open);
  assert.equal(await black.frame.evaluate(() => document.getElementById("ov").classList.contains("hide")), false, "the start menu is back");

  for (const tabi of [one, two]) assert.deepEqual(tabi.errors, [], "no page errors");
});
