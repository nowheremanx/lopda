// registry/apps/zhenyao-tower: the shrine frame in the real page at the five app sizes, dpr 1 and 3.
// The frame canvas covers the stage, the 160 x 144 view stays whole-pixel and on top, and a press on the
// wood or the stone never reaches the game. Needs Playwright, which the repo does not depend on:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-zhenyao-frame.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };
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

const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];

/* read the frame canvas back: every pixel painted, no pale field outside the window, no blank paper */
async function screen(p, w, h) {
  return p.evaluate(({ w, h }) => {
    const stage = document.getElementById("frame-stage"), art = document.getElementById("frame-art");
    const cv = document.querySelector("#frame-view canvas");
    const sr = stage.getBoundingClientRect(), cr = cv.getBoundingClientRect();
    const view = { x: cr.left - sr.left, y: cr.top - sr.top, w: cr.width, h: cr.height };
    const ctx = art.getContext("2d"), d = ctx.getImageData(0, 0, art.width, art.height).data;
    const TONES = [[31, 42, 20], [74, 90, 50], [125, 138, 88], [163, 173, 126]];
    const tone = (o) => {
      for (let i = 0; i < 4; i++) if (d[o] === TONES[i][0] && d[o + 1] === TONES[i][1] && d[o + 2] === TONES[i][2]) return i;
      return -1;
    };
    let bad = 0, paper = 0, out = 0;
    const x0 = Math.round(view.x), y0 = Math.round(view.y), x1 = Math.round(view.x + view.w), y1 = Math.round(view.y + view.h);
    for (let y = 0; y < art.height; y++) for (let x = 0; x < art.width; x++) {
      const t = tone((y * art.width + x) * 4);
      if (t < 0) bad++;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      out++;
      if (t === 3) paper++;
    }
    const edge = [];
    for (let x = 0; x < art.width; x += 9) { edge.push(tone(x * 4), tone(((art.height - 1) * art.width + x) * 4)); }
    for (let y = 0; y < art.height; y += 9) { edge.push(tone(y * art.width * 4), tone((y * art.width + art.width - 1) * 4)); }
    return {
      stage: [sr.width, sr.height], view: view, art: [art.width, art.height], painted: art.__paint,
      bad, paper: paper / out, edgeInk: edge.every((t) => t === 0),
      onTop: document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2) === cv,
      frameTarget: document.elementFromPoint(sr.left + 2, sr.top + 2) === art
    };
  }, { w, h });
}

for (const dpr of [1, 3]) {
  test(`frame: it covers the stage and stays inert at every size (dpr ${dpr})`, { skip, timeout: 120000 }, async (t) => {
    const context = await browser.newContext({ viewport: { width: 331, height: 359 }, deviceScaleFactor: dpr });
    t.after(() => context.close());
    const p = await context.newPage(), errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${base}/registry/apps/zhenyao-tower/index.html`, { waitUntil: "load" });
    await p.waitForFunction(() => window.ZTFrame && document.getElementById("frame-art").__paint === "331x359");
    assert.equal(await p.evaluate(() => document.getElementById("frame-art").__title), "1", "the title board starts blank");

    for (const [w, h] of SIZES) {
      await p.setViewportSize({ width: w, height: h });
      await p.waitForFunction((s) => {
        const a = document.getElementById("frame-art");
        return a && a.__paint === s;
      }, `${w}x${h}`, { timeout: 5000 });
      const s = await screen(p, w, h);
      assert.deepEqual(s.stage, [w, h], `${w}x${h}: the stage is the screen`);
      assert.deepEqual(s.art, [w, h], `${w}x${h}: the frame canvas covers it edge to edge`);
      assert.equal(s.painted, `${w}x${h}`, `${w}x${h}: the frame was painted for this size`);
      assert.equal(s.bad, 0, `${w}x${h}: every frame pixel is one of the four tones`);
      assert.ok(s.edgeInk, `${w}x${h}: the outer band is ink, not paper`);
      assert.ok(s.view.x > 0 && s.view.y > 0 && s.view.x + s.view.w <= w && s.view.y + s.view.h <= h,
        `${w}x${h}: the view is inside the frame`);
      assert.ok(Number.isInteger(s.view.w) && Number.isInteger(s.view.h), `${w}x${h}: whole-pixel view`);
      assert.ok(Math.abs(s.view.x - (w - s.view.w) / 2) <= 0.5 && Math.abs(s.view.y - (h - s.view.h) / 2) <= 0.5,
        `${w}x${h}: the view is centred`);
      assert.ok(s.paper < 0.12, `${w}x${h}: no blank paper (${(s.paper * 100).toFixed(1)}% paper outside)`);
      assert.ok(s.onTop, `${w}x${h}: the game canvas is over the frame`);
      assert.ok(!s.frameTarget, `${w}x${h}: the frame canvas takes no pointer`);

      /* a tap on the frame must not reach the game; a tap on the window must */
      await p.evaluate(() => {
        window.__viewTaps = 0;
        const cv = document.querySelector("#frame-view canvas");
        if (!cv.dataset.hooked) { cv.dataset.hooked = "1"; cv.addEventListener("pointerdown", () => { window.__viewTaps++; }); }
      });
      await p.mouse.move(Math.round(s.view.x + s.view.w / 2), Math.round(s.view.y + s.view.h / 2));
      const world = await p.evaluate(() => [game.pointer.x, game.pointer.y]);
      assert.ok(Math.abs(world[0] - 80) <= 1 && Math.abs(world[1] - 72) <= 1,
        `${w}x${h}: the window's centre is still world 80,72 (${world})`);
      await p.mouse.click(2, Math.round(h / 2));
      await p.waitForTimeout(40);
      assert.equal(await p.evaluate(() => window.__viewTaps), 0, `${w}x${h}: a side frame tap is inert`);
      await p.mouse.click(Math.round(s.view.x + s.view.w / 2), Math.round(s.view.y + s.view.h / 2));
      await p.waitForTimeout(40);
      assert.equal(await p.evaluate(() => window.__viewTaps), 1, `${w}x${h}: the window still takes the tap`);
    }
    /* leaving the title puts the shrine's name back on the board */
    await p.evaluate(() => ZT.goto("town", { entered: true }));
    await p.waitForFunction(() => document.getElementById("frame-art").__title === "0", null, { timeout: 5000 });
    assert.equal(await p.evaluate(() => document.getElementById("frame-art").__title), "0", "the name board returns outside the title");
    assert.deepEqual(errors, []);
  });
}
