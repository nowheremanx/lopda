// 拍照拼图 1.5.1 (registry/apps/photo-puzzle) in the dev harness at the smallest LCD, 331 × 359:
//   (a) the main menu's mode entry reads as a two-state switch (both states shown, the one in force filled) and a tap
//       moves the mark;
//   (b) a hinted solve says it is not recorded and leaves the saved best alone;
//   (c) an arcade game left to run out says how many pieces were home, the hole not counted.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-photo-puzzle.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "registry/apps/photo-puzzle";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".wasm": "application/wasm" };
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

/* the dev harness at 331 × 359 (its .screen is a content box, so its 6 px frame sits outside), zh */
async function openApp(t) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  t.after(() => ctx.close());
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}/sdk/dev.html?app=${APP}&lang=zh`);
  await p.evaluate(() => {
    const s = document.querySelector(".screen");
    s.style.width = "331px"; s.style.height = "359px";
  });
  const f = await appFrame(p);
  return { p, f, errors };
}

/* the srcdoc frame the harness filled with the app (the harness reads src/ itself, so this is the real bundle) */
async function appFrame(p, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    for (const f of p.frames()) {
      if (f === p.mainFrame()) continue;
      try { if (await f.evaluate(() => !!window.PUZZLE && !!window.Solver)) return f; } catch {}
    }
    await sleep(100);
  }
  throw new Error("the app frame did not load");
}

const st = (f) => f.evaluate(() => window.PUZZLE.state());
const labels = (f) => f.$$eval("#menu button", (bs) => bs.map((b) => b.textContent + (b.classList.contains("off") ? " off" : "")));
const msg = (f) => f.textContent("#msg");
const waitState = (f, fn, arg, timeout = 15000) => f.waitForFunction(fn, arg, { timeout });
const waitScreen = (f, name, timeout) =>
  waitState(f, (n) => !!window.PUZZLE && window.PUZZLE.state().screen === n, name, timeout);

/* a harness pad button, the way the harness's own finger events do it */
async function press(p, b) {
  const el = p.locator(`#pad button[data-b="${b}"]`);
  await el.dispatchEvent("pointerdown");
  await el.dispatchEvent("pointerup");
}

/* PAD.save straight from the app frame, then reload the harness: the store is localStorage, per app id */
async function seed(f, puzzle, game) {
  await f.evaluate((e) => {
    if (e.puzzle) PAD.save("puzzle", e.puzzle);
    if (e.game) PAD.save("game", e.game);
  }, { puzzle, game });
  await sleep(250);
}

async function reload(p, f) {
  await p.click("#reload");
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await waitScreen(f, "title");
}

const GAME = (more) => Object.assign({ v: 1, n: 3, tiles: [0, 1, 2, 3, 8, 5, 6, 4, 7], moves: 0, src: "builtin",
  picKey: "lake", helped: false, arcade: false, left: 0 }, more);

test("photo puzzle: the mode entry is a two-state switch, both states shown, the one in force filled", { skip, timeout: 60000 }, async (t) => {
  const { p, f, errors } = await openApp(t);
  await waitScreen(f, "main");
  assert.deepEqual(await f.evaluate(() => [innerWidth, innerHeight]), [331, 359], "the smallest LCD with the chin pad");

  const sw = f.locator("#menu button.sw");
  assert.equal(await sw.count(), 1, "one mode switch, the third button");
  assert.deepEqual(await sw.locator(".swo .o").allTextContents(), ["普通", "街机"], "both states are on it");
  assert.equal(await sw.locator(".swo .o.on").textContent(), "普通", "normal is the one in force");
  assert.equal(await sw.getAttribute("aria-label"), "模式 普通");
  const box = await sw.boundingBox();
  assert.ok(box.height >= 44 && box.width >= 44, `the whole switch is a thumb target (${box.width}×${box.height})`);
  assert.equal(await f.$eval("#menu button.sw .swo .o.on", (e) => getComputedStyle(e).backgroundColor), "rgb(31, 42, 20)",
    "the state in force is reversed out");
  assert.equal(await f.$eval("#menu button.sw .swo .o:not(.on)", (e) => getComputedStyle(e).backgroundColor), "rgba(0, 0, 0, 0)",
    "the other state is not filled");

  /* one tap flips it, and the mark moves rather than the label changing under the thumb */
  await sw.click();
  await waitState(f, () => window.PUZZLE.state().arcade === true);
  assert.equal(await sw.locator(".swo .o.on").textContent(), "街机");
  assert.equal(await sw.getAttribute("aria-label"), "模式 街机");
  assert.deepEqual(await sw.locator(".swo .o").allTextContents(), ["普通", "街机"], "both states still there after the flip");
  await sw.click();
  await waitState(f, () => window.PUZZLE.state().arcade === false);
  assert.equal(await sw.locator(".swo .o.on").textContent(), "普通");

  /* a tap also selects the switch, so the whole button is reversed and the state in force is paper */
  assert.equal((await st(f)).sel, 2);
  assert.equal(await f.$eval("#menu button.sw.on .swo .o.on", (e) => getComputedStyle(e).backgroundColor), "rgb(163, 173, 126)");
  assert.equal(await f.$eval("#menu button.sw.on .swo .o:not(.on)", (e) => getComputedStyle(e).color), "rgb(163, 173, 126)");
  /* leaving it keeps the filled mark: another plain button selected, the state still ink on paper */
  await press(p, "right");
  await waitState(f, (was) => window.PUZZLE.state().sel !== was, 2);
  assert.equal((await st(f)).sel, 3);
  assert.equal(await f.$eval("#menu button.sw:not(.on) .swo .o.on", (e) => getComputedStyle(e).backgroundColor), "rgb(31, 42, 20)");

  /* the plain buttons beside it still read as buttons, not as states */
  assert.deepEqual(await labels(f), ["拍一张", "内置图片", "模式普通街机", "怎么玩"]);
  const layout = await f.evaluate(() => {
    const main = document.querySelector("main"), btns = [...document.querySelectorAll("#menu button")];
    return { scroll: main.scrollHeight, client: main.clientHeight, heights: btns.map((b) => b.getBoundingClientRect().height) };
  });
  assert.ok(layout.scroll <= layout.client + 1, "the menu still fits the screen without scrolling");
  assert.ok(layout.heights.every((h) => h >= 44), JSON.stringify(layout.heights));
  assert.deepEqual(errors, []);
});

test("photo puzzle: a hinted win says it is not recorded and leaves the best alone", { skip, timeout: 120000 }, async (t) => {
  const { p, f, errors } = await openApp(t);
  await waitScreen(f, "main");
  await seed(f, { best: { "3": 40 }, big: false, time: {}, arcade: false, n: 3, pickPic: "lake" }, GAME());
  await reload(p, f);
  assert.equal((await st(f)).best, 40, "a best of 40 moves is on the device");
  await press(p, "a");   /* 继续 */
  await waitScreen(f, "play");

  /* the first help in this game says, once, that the game will not count */
  await press(p, "select");
  await waitState(f, () => window.PUZZLE.state().helped === true);
  assert.equal(await msg(f), "用了提示，不计记录");
  assert.equal(await f.$eval("#msg", (e) => e.className), "note", "the line is on the note band");

  /* play the solver's plan with the pad keys: a hinted solve is still a solve */
  const dirs = await f.evaluate(() => {
    const s = window.PUZZLE.state(), tiles = s.tiles.slice(), N = s.n * s.n, plan = Solver.solve(s.n, tiles), out = [];
    for (const step of plan) {
      const g = tiles.indexOf(N - 1), q = step.p;
      out.push(q === g + s.n ? "up" : q === g - s.n ? "down" : q === g + 1 ? "left" : "right");
      tiles[g] = tiles[q]; tiles[q] = N - 1;
    }
    return out;
  });
  assert.ok(dirs.length >= 2);
  /* the note was for the first help only: the next slide puts the board's own line back */
  for (let i = 0; i < dirs.length; i++) {
    const before = (await st(f)).moves;
    await press(p, dirs[i]);
    await waitState(f, (m) => window.PUZZLE.state().moves === m, before + 1);
    if (i === 0) {
      assert.equal(await msg(f), "", "the one-time line gives way to the move");
      assert.equal((await st(f)).helped, true);
    }
  }
  await waitScreen(f, "solved");
  await waitState(f, () => window.PUZZLE.state().animDone === true);
  await press(p, "a");
  await waitScreen(f, "won");

  const won = await st(f);
  assert.equal(won.helped, true);
  assert.ok(won.moves < 40, `this solve would beat the best of 40 (${won.moves} moves)`);
  assert.match(await msg(f), /用了提示，不计记录$/, "the win screen says the solve does not count");
  assert.doesNotMatch(await msg(f), /新纪录/);
  assert.equal(won.best, 40, "the best is untouched");
  await sleep(300);
  const saved = await f.evaluate(() => PAD.load("puzzle"));
  assert.equal(saved.best["3"], 40, "the best on the device is still 40");
  assert.deepEqual(errors, []);
});

test("photo puzzle: an arcade time-up says how many pieces were home, the hole not counted", { skip, timeout: 60000 }, async (t) => {
  const { p, f, errors } = await openApp(t);
  await waitScreen(f, "main");
  /* an arcade game with two seconds left, six pieces home and the hole on its own corner (which must not add a seventh) */
  await seed(f, null, GAME({ arcade: true, left: 2 }));
  await reload(p, f);
  await press(p, "a");   /* 继续 */
  await waitScreen(f, "play");
  assert.equal((await st(f)).gameArcade, true);
  await waitScreen(f, "lost", 10000);
  assert.equal((await st(f)).left, 0);
  assert.equal(await msg(f), "时间到。已拼好 6/9");
  assert.deepEqual(await labels(f), ["再来一局", "主菜单"]);
  assert.deepEqual(errors, []);
});
