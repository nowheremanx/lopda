// 拼字格 / Crossing 2.0.0's title: the shared fog screen (sdk/lo-title.js) covers the whole stage, its items are
// 继续 / 选关 / 随机关 (locked before round 30) / 玩法, and the play screen under it is untouched.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/crossing-title.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "registry/apps/crossing";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json" };
const SIZES = [[331, 359], [386, 606]];
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

const until = async (p, fn, what) => {
  for (let i = 0; i < 200; i++) {
    if (await fn()) return;
    await p.waitForTimeout(100);
  }
  assert.fail("timed out waiting for " + what);
};
const press = async (p, b) => { await p.locator(`#pad [data-b="${b}"]`).click(); await p.waitForTimeout(20); };

/* a dev harness page with the given save, its app frame at w x h, and the title up; each test gets its own
   context so a device pixel ratio of 3 can be asked for */
async function open(t, save, lang = "zh", w = 331, h = 359, dpr = 1) {
  const context = await browser.newContext({ viewport: { width: 900, height: 900 }, hasTouch: true, deviceScaleFactor: dpr });
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  t.after(() => context.close());
  await p.goto(`${base}/sdk/dev.html?app=${APP}&lang=${lang}`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  await p.evaluate((s) => localStorage.setItem("lopda-dev:crossing", JSON.stringify({ game: s })), save);
  await p.reload({ waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  const frame = () => p.frames().find((x) => x !== p.mainFrame());
  await until(p, async () => {
    const f = frame();
    return !!f && await f.evaluate(() => !!(window.game && game.phase === "title")).catch(() => false);
  }, "the title screen");
  await p.locator("#app").evaluate((el, s) => { el.style.width = s[0] + "px"; el.style.height = s[1] + "px"; el.style.flex = "none"; }, [w, h]);
  await p.waitForTimeout(250);
  return { p, errors, frame };
}

test("crossing title: the fog title covers the stage and carries the four items and the record", { skip, timeout: 90000 }, async (t) => {
  const save = { round: 12, cleared: 11, taught: true };
  for (const [w, h] of SIZES) {
    const { p, errors, frame } = await open(t, save, "zh", w, h);
    const f = frame();
    const ts = await f.evaluate(() => {
      const c = document.getElementById("lotitle"), r = c.getBoundingClientRect(), cover = document.getElementById("cover");
      return {
        info: game.title,
        canvas: [r.left, r.top, r.width, r.height],
        pixels: [c.width, c.height],
        dpr: window.devicePixelRatio,
        coverTitle: cover.classList.contains("title"),
        oldArt: !!document.getElementById("title-art"),
      };
    });
    assert.deepEqual(ts.canvas, [0, 0, w, h], `${w}x${h}: the title canvas fills the stage`);
    assert.deepEqual(ts.pixels, [Math.round(w * ts.dpr), Math.round(h * ts.dpr)], `${w}x${h}: the canvas has one device pixel a screen pixel`);
    assert.equal(ts.dpr, 1);
    assert.equal(ts.coverTitle, true);
    assert.equal(ts.oldArt, false, "the old framed title picture is gone");
    assert.deepEqual(ts.info.items.map((i) => i.label), ["继续", "选关", "随机关", "玩法"]);
    assert.equal(ts.info.items[0].status, "第 12 关", "继续 says which round it continues");
    assert.deepEqual(ts.info.items.map((i) => i.locked === true), [false, false, true, false], "RANDOM is closed at round 12");
    assert.equal(ts.info.items[2].reason, "通关 30 关后开放");
    assert.equal(ts.info.note, "已通关 11/100", "the bar carries the record");
    assert.equal(ts.info.hint, "选 · A 确定");
    assert.deepEqual(errors, [], "no page errors");
    await p.close();
  }

  /* a device pixel ratio of 3 gives the canvas three device pixels a screen pixel too */
  const { p, errors, frame } = await open(t, save, "zh", 331, 359, 3);
  const f = frame();
  const ts = await f.evaluate(() => {
    const c = document.getElementById("lotitle"), r = c.getBoundingClientRect();
    return { canvas: [r.left, r.top, r.width, r.height], pixels: [c.width, c.height], dpr: window.devicePixelRatio };
  });
  assert.equal(ts.dpr, 3);
  assert.deepEqual(ts.canvas, [0, 0, 331, 359]);
  assert.deepEqual(ts.pixels, [993, 1077], "the fog is drawn at the screen's own resolution");
  assert.deepEqual(errors, []);
});

test("crossing title: A continues, 选关 opens the picker, the locked 随机关 shakes and says why, 玩法 teaches", { skip, timeout: 90000 }, async (t) => {
  const { p, errors, frame } = await open(t, { round: 12, cleared: 11, taught: true });
  const ev = (fn) => frame().evaluate(fn);
  const info = () => ev(() => game.title);

  await press(p, "a");
  await until(p, () => ev(() => game.phase === "play"), "继续 to open round 12");
  assert.deepEqual(errors, []);

  /* 选关, then B back to the title */
  await p.reload({ waitUntil: "load" });
  await until(p, async () => { const fr = frame(); return !!fr && await fr.evaluate(() => !!(window.game && game.phase === "title")).catch(() => false); }, "the title again");
  await press(p, "down");
  assert.equal((await info()).index, 1, "down rolls to 选关");
  await press(p, "a");
  await until(p, () => ev(() => game.phase === "pick"), "选关 to open the picker");
  await press(p, "b");
  await until(p, () => ev(() => game.phase === "title"), "B back to the title");
  assert.equal((await info()).index, 1, "the title comes back on the item the player left");

  /* the locked RANDOM: the big word shakes, the bar says why, and no random round starts */
  await press(p, "down");
  assert.equal((await info()).index, 2);
  await press(p, "a");
  await p.waitForTimeout(400);
  assert.equal(await ev(() => game.phase), "title", "a locked RANDOM never starts");
  assert.equal((await info()).items[2].reason, "通关 30 关后开放");

  /* 玩法 opens the practice round */
  await press(p, "down");
  assert.equal((await info()).index, 3);
  await press(p, "a");
  await until(p, () => ev(() => game.mode === "practice"), "玩法 to start practice");
  assert.deepEqual(errors, []);

  /* round 30 clears the lock: 随机关 is a plain item and opens a random round */
  const again = await open(t, { round: 31, cleared: 30, taught: true });
  await press(again.p, "down");
  await press(again.p, "down");
  const open30 = await again.frame().evaluate(() => game.title);
  assert.equal(open30.items[2].label, "随机关");
  assert.equal(open30.items[2].locked, undefined, "past round 30 RANDOM is open");
  assert.equal(open30.items[2].reason, undefined, "an open item has no reason");
  await press(again.p, "a");
  await until(again.p, () => again.frame().evaluate(() => game.mode === "random"), "a random round past round 30");
  assert.deepEqual(again.errors, []);

  /* the English menu says the same things */
  const en = await open(t, { round: 12, cleared: 11, taught: true }, "en");
  const enInfo = await en.frame().evaluate(() => game.title);
  assert.deepEqual(enInfo.items.map((i) => i.label), ["CONTINUE", "ROUNDS", "RANDOM", "HOW TO PLAY"]);
  assert.equal(enInfo.items[0].status, "ROUND 12");
  assert.equal(enInfo.items[2].reason, "Clear 30 levels to unlock");
  assert.equal(enInfo.note, "Cleared 11/100");
  assert.equal(enInfo.hint, "A picks");
  assert.deepEqual(en.errors, []);
});

test("crossing title: a tap on the chosen word picks, a neighbour rolls, and the return guard blocks both", { skip, timeout: 90000 }, async (t) => {
  const { p, errors, frame } = await open(t, { round: 1, cleared: 0, taught: true });
  const ev = (fn) => frame().evaluate(fn);
  const tap = async (y) => { await frame().locator("#lotitle").tap({ position: { x: 165, y: y } }); await p.waitForTimeout(250); };
  const info = () => ev(() => game.title);

  /* 331 x 359, dpr 1: the big word's slot is around y 245, the small word under it around y 290 */
  await tap(290);
  assert.equal(await ev(() => game.phase), "title", "a tap on a neighbour only rolls");
  assert.equal((await info()).index, 1, "the neighbour became the chosen item");
  await tap(245);
  await until(p, () => ev(() => game.phase === "pick"), "a tap on the chosen word to pick 选关");
  assert.deepEqual(errors, []);
  await press(p, "b");
  await until(p, () => ev(() => game.phase === "title"), "B back to the title");

  /* leave a round: the closing panel's 300 ms guard takes the canvas's pointer, so even a roll is swallowed */
  await press(p, "up");
  await press(p, "a");
  await until(p, () => ev(() => game.phase === "play"), "round 1");
  await press(p, "b");
  await until(p, () => ev(() => game.phase === "leave"), "the leave panel");
  await frame().locator("#cover-btn2").tap();
  assert.equal(await ev(() => game.phase), "title", "LEAVE closes onto the title");
  const before = (await info()).index;
  const box = await frame().locator("#lotitle").boundingBox();
  /* a raw mouse click dispatches at once; Playwright's tap waits for actionability and would outlast 300 ms */
  await p.mouse.click(box.x + 165, box.y + 290);
  await p.waitForTimeout(100);
  assert.equal(await ev(() => game.phase), "title");
  assert.equal((await info()).index, before, "the guard swallows a tap that would roll the menu");
  await p.waitForTimeout(350);
  await p.mouse.click(box.x + 165, box.y + 290);
  await p.waitForTimeout(250);
  assert.equal((await info()).index, before + 1, "after the guard a neighbour tap rolls again");
  assert.deepEqual(errors, []);
});

test("crossing title: the play screen under the title is unchanged", { skip, timeout: 90000 }, async (t) => {
  const { p, errors, frame } = await open(t, { round: 6, cleared: 5, taught: true });
  const f = frame();
  await press(p, "a");
  await until(p, () => f.evaluate(() => game.phase === "play"), "round 6");
  await p.waitForTimeout(200);
  const geo = await f.evaluate(() => {
    const g = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    const c = document.getElementById("lotitle");
    return {
      size: [document.documentElement.clientWidth, document.documentElement.clientHeight],
      header: g("header"), typed: g("#typed"), wheel: g("#wheel"), board: g("#board"), note: g("#note"), goal: g("#goal"),
      cell: (() => { const el = document.querySelector(".cell"); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
      keys: [...document.querySelectorAll("#wheel .key")].map((k) => { const r = k.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; }),
      coverHidden: document.getElementById("cover").hidden,
      titleShown: getComputedStyle(c).display !== "none",    };
  });
  /* the values 1.9.0 gave at 331 x 359: the migration touched the title only */
  assert.deepEqual(geo, {
    size: [331, 359],
    header: [0, 0, 331, 52],
    typed: [4, 71, 323, 26],
    wheel: [6, 101, 180, 180],
    board: [192, 124, 134, 134],
    note: [4, 285, 323, 36],
    goal: [0, 339, 331, 20],
    cell: [26, 26],
    keys: [[77, 104, 38], [142, 151, 38], [117, 227, 38], [37, 227, 38], [12, 151, 38]],
    coverHidden: true,
    titleShown: false,
  });
  assert.deepEqual(errors, []);
});
