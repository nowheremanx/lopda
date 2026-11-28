// Gomoku's screens in the dev harness: the radio match stays the second choice on the start panel, and a
// finished game leaves the board uncovered with its winning line visible in a result dock at the bottom.
// Needs Playwright, which the repo does not depend on, so the tests skip without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-gomoku.test.mjs
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
  await p.goto(`${base}/sdk/dev.html?app=${APP}&lang=zh`);
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

/* the canvas point of a board intersection, in stage CSS pixels */
async function boardPoint(t, frame, x, y) {
  const s = await state(frame);
  const box = await frame.locator("#c").boundingBox();
  return {
    x: box.x + (s.bx + s.pad + x * s.cell) * box.width / s.W,
    y: box.y + (s.by + s.pad + y * s.cell) * box.height / s.H
  };
}
/* place a stone through the canvas, the way a mouse player would (the game maps the border back to the board) */
async function place(t, frame, x, y) {
  const p = await boardPoint(t, frame, x, y);
  await t.p.mouse.click(p.x, p.y);
}
/* tap one of the buttons the canvas paints (the bottom bar has no HTML buttons any more) */
async function tapButton(t, frame, id) {
  const s = await state(frame), b = s.buttons[id];
  assert.ok(b, `the ${id} button is painted in the bar`);
  const box = await frame.locator("#c").boundingBox();
  await t.p.mouse.click(box.x + (b.x + b.w / 2) * box.width / s.W, box.y + (b.y + b.h / 2) * box.height / s.H);
}

/* a message from the harness's side, as the dev shim would deliver one (pad-shim accepts it from parent) */
async function inject(t, data) {
  await t.p.evaluate((d) => {
    document.getElementById("app").contentWindow.postMessage({ pad: 1, op: "link", event: "message", data: d }, "*");
  }, data);
}

/* the result is painted in the bottom bar now: the board stays uncovered and the whole canvas still covers the stage */
async function assertResultBar(frame, title) {
  assert.equal(await frame.evaluate(() => document.getElementById("ov").classList.contains("hide")), true, "the start overlay stays hidden");
  const g = await frame.evaluate(() => {
    const c = document.getElementById("c").getBoundingClientRect(), s = window.__gomoku();
    return { canvas: { x: c.x, y: c.y, w: c.width, h: c.height }, vw: innerWidth, vh: innerHeight, s };
  });
  assert.ok(Math.abs(g.canvas.x) <= 1 && Math.abs(g.canvas.y) <= 1, "the canvas starts at the stage's corner");
  assert.ok(Math.abs(g.canvas.w - g.vw) <= 1 && Math.abs(g.canvas.h - g.vh) <= 1, "the canvas covers the stage edge to edge");
  assert.equal(g.s.result.title, title, "the result title is shown");
  assert.ok(g.s.result.note.length > 0, "the note is shown");
  assert.ok(g.s.buttons.again && g.s.buttons.again.h >= 44, "the result button is a 44 px target");
  assert.ok(g.s.over && g.s.winLine, "the board still holds the winning line");
}

const BLACK_MOVES = [[7, 7], [6, 7], [8, 7], [5, 7], [4, 7]];
const WHITE_MOVES = [[0, 0], [1, 0], [2, 0], [3, 0]];

test("gomoku: the radio match is secondary, and a win keeps the board and its line in view", { skip, timeout: 120000 }, async (t) => {
  const solo = await tab(t);
  const p = solo.p, frame = solo.frame;

  // 331 x 359: the smallest app area, the one the layout must not spill out of
  await p.evaluate(() => {
    const s = document.querySelector(".screen");
    s.style.width = "331px";
    s.style.height = "359px";
  });
  await sleep(200);
  await frame.evaluate(() => window.dispatchEvent(new Event("resize")));

  // the stage can be sized after the app starts with no resize event: the frame loop refits it (UI.md 13)
  await p.evaluate(() => {
    const s = document.querySelector(".screen");
    s.style.width = "386px";
    s.style.height = "738px";
  });
  await waitState(frame, () => window.__gomoku().W === 386 && window.__gomoku().H === 738, null, 5000);
  const wideRow = await frame.evaluate(() => {
    const r = document.getElementById("st").getBoundingClientRect();
    return { w: r.width, vw: innerWidth };
  });
  assert.ok(wideRow.w >= wideRow.vw - 20, "the start row is full-stage wide on a wide screen");
  await p.evaluate(() => {
    const s = document.querySelector(".screen");
    s.style.width = "331px";
    s.style.height = "359px";
  });
  await waitState(frame, () => window.__gomoku().W === 331 && window.__gomoku().H === 359, null, 5000);

  // (c) the title screen (1.8.0): 开始 is the solid primary, 对战（电波） an outlined second choice below it
  await frame.waitForSelector("#lk:not(.hide)");
  const style = await frame.evaluate(() => {
    const read = (id) => {
      const el = document.getElementById(id), r = el.getBoundingClientRect(), c = getComputedStyle(el);
      return { x: r.x, y: r.y, w: r.width, h: r.height, bg: c.backgroundColor, color: c.color, border: c.borderTopColor };
    };
    const ov = document.getElementById("ov").getBoundingClientRect();
    return { st: read("st"), lk: read("lk"), ov: { x: ov.x, y: ov.y, w: ov.width, h: ov.height }, vw: innerWidth, vh: innerHeight };
  });
  assert.ok(style.st.h >= 44 && style.lk.h >= 44, "both start buttons are 44 px tall");
  assert.ok(style.st.w >= style.vw - 20, "each start button is a full-stage-width row");
  assert.ok(style.lk.y >= style.st.y + style.st.h + 5, "the radio row sits under 开始");
  assert.ok(style.ov.x === 0 && style.ov.y === 0 && style.ov.w === style.vw && style.ov.h === style.vh,
    "the title overlay covers the whole stage, not a box");
  assert.notEqual(style.lk.bg, style.st.bg, "the radio button does not use the solid primary fill");
  assert.equal(style.lk.bg, "rgb(163, 173, 126)", "the radio button is paper");
  assert.equal(style.lk.color, "rgb(31, 42, 20)", "the radio button's text is ink");
  assert.equal(style.lk.border, "rgb(31, 42, 20)", "the radio button is outlined in ink");

  // start a solo game and put four black stones in a row, then win with the fifth
  await frame.click("#st");
  await waitState(frame, () => window.__gomoku().mode === "solo" && document.getElementById("ov").classList.contains("hide"));
  await frame.evaluate(() => window.__gomoku.set([[6, 7, 1], [7, 7, 1], [8, 7, 1], [9, 7, 1]]));
  await place(solo, frame, 5, 7);
  await waitState(frame, () => window.__gomoku().over && window.__gomoku().winLine, null, 5000);

  // (a) the result appears after the beat, painted in the bottom bar, and the board stays uncovered
  await waitState(frame, () => window.__gomoku().result, null, 5000);
  await assertResultBar(frame, "你赢了");

  // (b) the winning line is still known to the page (and was drawn at endGame)
  const s = await state(frame);
  assert.deepEqual(s.winLine, [5, 7, 9, 7], "the five in a row are reported");
  assert.equal(s.wins >= 1, true, "the win is counted");

  // AGAIN clears the board and the result
  await tapButton(solo, frame, "again");
  await waitState(frame, () => !window.__gomoku().over && !window.__gomoku().result);
  assert.equal((await state(frame)).winLine, null, "a new game has no winning line");

  assert.deepEqual(solo.errors, [], "no page errors");
});

test("gomoku link: a decided match ends in the same dock, not the full-screen overlay", { skip, timeout: 120000 }, async (t) => {
  const one = await tab(t);
  const two = await tab(t);

  // both open the match from the start menu; the runtime's pairing pairs the two tabs
  await one.frame.click("#lk");
  await two.frame.click("#lk");
  await waitState(one.frame, () => window.__gomoku() && window.__gomoku().open);
  await waitState(two.frame, () => window.__gomoku() && window.__gomoku().open);

  const s1 = await state(one.frame), s2 = await state(two.frame);
  const black = s1.colour === 1 ? one : two;
  assert.equal([s1.colour, s2.colour].sort().join(","), "1,2", "exactly one side is black");

  // black plays five in a row; white's answers are injected into black only, which is enough for its board
  for (let i = 0; i < 5; i++) {
    await place(black, black.frame, BLACK_MOVES[i][0], BLACK_MOVES[i][1]);
    await waitState(black.frame, (n) => window.__gomoku().moves === n, 2 * i + 1);
    if (i < 4) {
      await inject(black, `m,${WHITE_MOVES[i][0]},${WHITE_MOVES[i][1]},${2 * i + 2}`);
      await waitState(black.frame, (n) => window.__gomoku().moves === n, 2 * i + 2);
      await waitState(black.frame, () => !window.__gomoku().sending, null, 15000);
    }
  }

  await waitState(black.frame, () => window.__gomoku().over && window.__gomoku().winLine, null, 5000);
  await waitState(black.frame, () => window.__gomoku().result, null, 5000);
  await assertResultBar(black.frame, "你赢了");
  const s = await state(black.frame);
  assert.deepEqual(s.winLine, [4, 7, 8, 7], "the match's five in a row are reported");
  assert.equal(s.result.label, "回到菜单", "a match's result goes back to the menu");
  assert.deepEqual(Object.keys(s.buttons), ["again"], "the link controls stand aside for the one result row");

  for (const tabi of [one, two]) assert.deepEqual(tabi.errors, [], "no page errors");
});
