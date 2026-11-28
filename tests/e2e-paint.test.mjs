// Paint at the smallest app frame, 331x359, in both languages: the tool rows are a fixed five-column
// grid (no label wraps onto a line of its own), the board takes the rest of the screen, and Redo mirrors Undo.
// 1.4.0 draws the board at a whole number of CSS pixels a dot (192 px on the SE, 288 px on the Pro Max),
// so no pixel block is 2 px wide and its neighbour 3.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-paint.test.mjs
//
// Canvas width before the 1.2.0 layout, measured at 331x359: 178 px with Chinese tools and 132 px with
// English ones (the English second row wrapped, so the tools ate the stage). 1.2.0 gave 202 px; 1.4.0
// gives the crisp 192 px, and a tall screen adds the six-sheet strip under it.
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
async function open(t, locale, [w, h] = [331, 359]) {
  const lang = /^zh/i.test(locale) ? "zh" : "en";
  const p = await browser.newPage({ viewport: { width: 500, height: 900 }, hasTouch: true, locale });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  t.after(() => p.close());
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/paint`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded registry\/apps\/paint/.test(document.getElementById("log").textContent));
  /* set the size first, then the language (the harness starts the app again on a language change) */
  await p.evaluate(([w, h]) => { const f = document.getElementById("app"); f.style.width = w + "px"; f.style.height = h + "px"; }, [w, h]);
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

/* one tap in the middle of a dot, through the canvas's pointer handlers.
   The 3 px ink frame is not picture, so the dots start 3 px in and are (box - 6) / 96 wide */
async function dot(p, frame, x, y) {
  const box = await frame.locator("#cv").boundingBox();
  const k = (box.width - 6) / 96;
  await p.mouse.click(box.x + 3 + (x + 0.5) * k, box.y + 3 + (y + 0.5) * k);
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
    assert.equal(layout.buttons.length, 10, "colours and width, tool / undo / redo / more, and the sheet number in the title");

    /* (b) the board is square, crisp, and exactly two CSS pixels a dot: 96 x 2 + the 3 px frame each side */
    const cvStyle = await frame.evaluate(() => document.getElementById("cv").style.width);
    assert.equal(cvStyle, "192px", "the dots are exactly 2 CSS px");
    assert.equal(layout.canvas.w, 198, "192 px of dots plus the 3 px ink frame each side");
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

test("paint at 386x738: three CSS px a dot and the six-sheet strip", { skip, timeout: 60000 }, async (t) => {
  const { p, app, frame, errors } = await open(t, "zh-CN", [386, 738]);
  const layout = await frame.evaluate(() => {
    const box = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const cv = document.getElementById("cv");
    return {
      vw: innerWidth, vh: innerHeight, sw: document.scrollingElement.scrollWidth, sh: document.scrollingElement.scrollHeight,
      style: cv.style.width, canvas: box(cv), sheets: box(document.getElementById("sheets")),
      hidden: document.getElementById("sheets").classList.contains("hide"),
      tabs: [...document.querySelectorAll("#sheets .tab")].map((b) => ({ ...box(b), label: b.getAttribute("aria-label"), current: b.getAttribute("aria-current") }))
    };
  });
  assert.deepEqual([layout.vw, layout.vh], [386, 738]);
  assert.ok(layout.sh <= 738 && layout.sw <= 386, "no scrolling in either direction");
  /* 96 x 3 = 288 px of dots; the 3 px ink frame each side makes the element 294 px */
  assert.equal(layout.style, "288px", "three CSS px a dot");
  assert.equal(layout.canvas.w, layout.canvas.h, "the board is square");
  assert.ok(layout.canvas.w >= 288 && layout.canvas.w < 288 + 2 * 3 + 4, `the board keeps its 288 px of dots (${layout.canvas.w})`);
  assert.equal(layout.hidden, false, "a tall stage shows the six-sheet strip");
  assert.equal(layout.tabs.length, 6);
  layout.tabs.forEach((b, i) => {
    assert.ok(b.w >= 44 && b.h >= 44, `tab ${i + 1} is a thumb target (${b.w}x${b.h})`);
    assert.equal(b.label, `第 ${i + 1} 张`);
    assert.equal(b.current, i === 0 ? "true" : "false");
  });
  assert.ok(layout.sheets.y >= layout.canvas.y + layout.canvas.h, "the strip is below the board");
  assert.ok(Math.abs(layout.canvas.x + layout.canvas.w / 2 - 193) <= 3, `the board is centred (x=${layout.canvas.x})`);

  /* a tap in dot (10, 10) is that dot at 3x, and tab 2 opens sheet 2 */
  await dot(p, frame, 10, 10);
  assert.deepEqual(await readPixel(frame, 10, 10), INK, "the tap lands on the dot under the finger");
  assert.deepEqual(await readPixel(frame, 11, 10), PAPER, "no spill into the next dot");
  await app.locator("#sheets .tab").nth(1).click();
  await p.waitForTimeout(250);
  assert.equal((await frame.textContent("#sheet")).trim(), "2/6", "tab 2 opens sheet 2");
  assert.deepEqual(await readPixel(frame, 10, 10), PAPER, "sheet 2 is blank");
  assert.deepEqual(errors, []);
});

/* ---------- 1.3.0: tools, mirror and six sheets ---------- */

/* drag on the canvas from one pixel to another (press, a few moves, release) */
async function drag(p, frame, [x0, y0], [x1, y1]) {
  const box = await frame.locator("#cv").boundingBox();
  const k = (box.width - 6) / 96, at = (x, y) => [box.x + 3 + (x + 0.5) * k, box.y + 3 + (y + 0.5) * k];
  await p.mouse.move(...at(x0, y0)); await p.mouse.down();
  await p.mouse.move(...at(x1, y1), { steps: 5 }); await p.mouse.up();
  await p.waitForTimeout(50);
}
const tool = async (app, id) => { await app.locator("#tool").click(); await app.locator("#" + id).click(); };
/* the app's own picture as a digit string: the canvas pixels read back into tones */
const sheetDigits = (frame) => frame.evaluate(() => {
  const d = document.getElementById("cv").getContext("2d").getImageData(0, 0, 96, 96).data, T = [31, 74, 125, 163];
  let s = ""; for (let i = 0; i < d.length; i += 4) s += T.indexOf(d[i]); return s;
});
const store = (p) => p.evaluate(() => {
  return JSON.parse(localStorage.getItem("lopda-dev:paint") || "{}");
});

test("paint 1.3.0: an old px drawing opens as sheet 1, sheets save and come back", { skip, timeout: 60000 }, async (t) => {
  const { p, app, frame, errors } = await open(t, "zh-CN");
  /* a 1.2.0 save: only "px", no "sheet". Write it into the harness's store and start the app again */
  const old = "0123".repeat(2304);
  await p.evaluate((old) => {
    localStorage.setItem("lopda-dev:paint", JSON.stringify({ px: old }));
  }, old);
  await p.reload({ waitUntil: "load" });
  await p.waitForFunction(() => /loaded registry\/apps\/paint/.test(document.getElementById("log").textContent));
  await p.evaluate(() => { const f = document.getElementById("app"); f.style.width = "331px"; f.style.height = "359px"; });
  const fr = () => p.frames().find((x) => x !== p.mainFrame());
  await p.waitForTimeout(400);
  const f = fr(); await f.waitForSelector("#cv");
  assert.equal((await f.textContent("#sheet")).trim(), "1/6", "the title says sheet 1 of 6");
  assert.ok(await sheetDigits(f) === old, "the old drawing is sheet 1, pixel for pixel");

  /* sheet 2 is empty, drawing on it writes px2, and px stays the old drawing */
  const a = p.frameLocator("#app");
  await a.locator("#sheet").click(); await p.waitForTimeout(200);
  assert.equal((await f.textContent("#sheet")).trim(), "2/6");
  assert.ok(await sheetDigits(f) === "3".repeat(9216), "sheet 2 starts blank");
  let s = await store(p);
  assert.equal(s.px2, undefined, "an empty sheet writes nothing");
  await dot(p, f, 5, 5);
  /* switch at once: the waiting save goes out before sheet 3 opens */
  await a.locator("#sheet").click(); await p.waitForTimeout(200);
  s = await store(p);
  assert.equal(s.px2[5 * 96 + 5], "0", "sheet 2's dot is saved");
  assert.ok(s.px === old, "sheet 1's key is untouched");
  assert.equal(String(s.sheet), "3", "the open sheet is remembered");
  for (let i = 0; i < 4; i++) { await a.locator("#sheet").click(); await p.waitForTimeout(150); }
  assert.equal((await f.textContent("#sheet")).trim(), "1/6", "six sheets, then back to the first");
  assert.ok(await sheetDigits(f) === old, "sheet 1 comes back");
  await a.locator("#sheet").click(); await p.waitForTimeout(200);
  assert.deepEqual(await readPixel(f, 5, 5), INK, "sheet 2 comes back with its dot");
  assert.deepEqual(errors, []);
});

test("paint 1.3.0: fill, mirror, line and box", { skip, timeout: 60000 }, async (t) => {
  const { p, app, frame, errors } = await open(t, "en-US");
  await p.waitForTimeout(200);
  /* a box outline, one undo step */
  await tool(app, "tbox");
  assert.match((await app.locator("#tool").textContent()).trim(), /^Box/, "the tool button names the tool");
  assert.ok(await app.locator("#toolpop").isHidden(), "picking a tool closes the menu");
  await drag(p, frame, [10, 10], [30, 30]);
  for (const [x, y] of [[10, 10], [30, 10], [30, 30], [10, 30], [20, 10], [10, 20]]) assert.deepEqual(await readPixel(frame, x, y), INK, `box edge ${x},${y}`);
  assert.deepEqual(await readPixel(frame, 20, 20), PAPER, "a box is only an outline");
  assert.deepEqual(await readPixel(frame, 50, 50), PAPER, "the preview left nothing behind");

  /* fill inside the box with dark: it stops at the ink outline */
  await app.locator("#sw1").click();
  await tool(app, "tfill");
  await dot(p, frame, 20, 20);
  const DARK = [74, 90, 50];
  assert.deepEqual(await readPixel(frame, 20, 20), DARK, "the inside fills");
  assert.deepEqual(await readPixel(frame, 11, 29), DARK, "to the corner");
  assert.deepEqual(await readPixel(frame, 10, 10), INK, "the outline stays");
  assert.deepEqual(await readPixel(frame, 40, 40), PAPER, "the fill stops at the other tone");

  /* undo: fill, then the box, one step each */
  await app.locator("#undo").click(); await p.waitForTimeout(50);
  assert.deepEqual(await readPixel(frame, 20, 20), PAPER, "undo takes the fill");
  assert.deepEqual(await readPixel(frame, 10, 10), INK, "and only the fill");
  await app.locator("#undo").click(); await p.waitForTimeout(50);
  assert.deepEqual(await readPixel(frame, 10, 10), PAPER, "the next undo takes the whole box");
  assert.deepEqual(await readPixel(frame, 30, 30), PAPER);

  /* a line with the mirror on writes both halves, and the guide is not in the pixels */
  await app.locator("#sw0").click();
  await tool(app, "tmir");
  assert.ok(await app.locator("#guide").isVisible(), "the guide shows");
  await tool(app, "tline");
  await drag(p, frame, [5, 60], [25, 60]);
  for (const x of [5, 15, 25, 90, 80, 70]) assert.deepEqual(await readPixel(frame, x, 60), INK, `line at ${x}`);
  assert.deepEqual(await readPixel(frame, 48, 60), PAPER, "nothing between the halves");
  assert.deepEqual(await readPixel(frame, 47, 40), PAPER, "the guide is not drawn into the picture");
  assert.deepEqual(await readPixel(frame, 48, 40), PAPER);
  await app.locator("#undo").click(); await p.waitForTimeout(50);
  assert.deepEqual(await readPixel(frame, 5, 60), PAPER, "one undo takes the line");
  assert.deepEqual(await readPixel(frame, 90, 60), PAPER, "and its mirror");

  /* the pen, tapped again, turns bold */
  await tool(app, "tpen"); await app.locator("#size").click();
  assert.equal((await app.locator("#size").textContent()).trim(), "Bold");
  await dot(p, frame, 20, 80);
  assert.deepEqual(await readPixel(frame, 19, 81), INK, "bold is 3 px");
  assert.deepEqual(await readPixel(frame, 75, 80), INK, "mirrored too");
  assert.deepEqual(errors, []);
});

for (const locale of ["zh-CN", "en-US"]) {
  test(`paint 1.3.0 menus fit 331x359 and close on an outside tap (${locale})`, { skip, timeout: 60000 }, async (t) => {
    const { p, app, frame, errors } = await open(t, locale);
    for (const [btn, pop, items] of [["#tool", "#toolpop", 5], ["#more", "#morepop", 3]]) {
      await app.locator(btn).click();
      const r = await frame.evaluate((pop) => {
        const box = document.querySelector(pop).getBoundingClientRect();
        const items = [...document.querySelectorAll(pop + " button")].map((b) => {
          const q = b.getBoundingClientRect(); return { id: b.id, w: q.width, h: q.height, sw: b.scrollWidth, cw: b.clientWidth };
        });
        return { top: box.top, bottom: box.bottom, row: document.getElementById("t2").getBoundingClientRect().top, items,
          scroll: document.scrollingElement.scrollHeight <= innerHeight };
      }, pop);
      assert.equal(r.items.length, items);
      for (const b of r.items) { assert.ok(b.h >= 44 && b.w >= 44, `${b.id} ${b.w}x${b.h}`); assert.ok(b.sw <= b.cw, `${b.id} fits`); }
      assert.ok(r.top >= 0 && r.bottom <= r.row, `${pop} opens above the bottom row, on screen`);
      assert.ok(r.scroll, "no scrolling");
      if (process.env.PAINT_SHOTS) await p.screenshot({ path: `${process.env.PAINT_SHOTS}/${pop.slice(1)}-${locale}.png`, clip: await p.locator("#app").boundingBox() });
      /* a tap outside (on the canvas) closes the menu and draws nothing */
      await dot(p, frame, 48, 10);
      assert.ok(await app.locator(pop).isHidden(), `${pop} closes`);
      assert.deepEqual(await readPixel(frame, 48, 10), PAPER, "the closing tap did not draw");
    }
    /* clear: the first tap asks, closing forgets, two taps clear */
    await dot(p, frame, 30, 30);
    await app.locator("#more").click(); await app.locator("#clr").click();
    assert.deepEqual(await readPixel(frame, 30, 30), INK, "one tap does not clear");
    await dot(p, frame, 60, 60);
    await app.locator("#more").click(); await app.locator("#clr").click();
    assert.deepEqual(await readPixel(frame, 30, 30), INK, "the question was forgotten when the menu closed");
    await app.locator("#clr").click();
    assert.deepEqual(await readPixel(frame, 30, 30), PAPER, "the second tap clears");
    assert.deepEqual(errors, []);
  });
}
