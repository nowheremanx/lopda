// 矿工老张 in the dev harness at the smallest screen (331 x 359): the level's tip box (#intro) sits low over the dirt
// and never covers 老张 and his winch at the top of the mine, with the shortest and the longest tip, zh and en.
// Needs Playwright, which the repo does not depend on, so the test skips without it.
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
  browser = await pw.chromium.launch({ args: ["--disable-site-isolation-trials"] });
});
after(async () => { await browser?.close(); server?.close(); });

/* the miner stands on GM.GROUND (src/00-data.js) of the 144-row mine; his cap and the winch are above it.
   Leave him and a margin of 16 rows clear. */
const MINER_ROWS = 23 + 16;

for (const lang of ["zh", "en"]) {
  test(`lao-zhang: the level tip never covers the miner at 331 x 359 (${lang})`, { skip, timeout: 60000 }, async () => {
    const p = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    await p.goto(`${base}/sdk/dev.html?app=registry/apps/lao-zhang`);
    await p.selectOption("#lang", lang);
    await p.addStyleTag({ content: ".screen{width:331px!important;height:359px!important;border:0!important}" });
    await p.waitForTimeout(1500);
    const f = p.frames().find((x) => x !== p.mainFrame());
    /* 新游戏 / New game is the selected title button: A starts level 1, whose tip shows in #intro */
    const box = await p.locator(".screen").boundingBox();
    await p.mouse.click(box.x + 165, box.y + 2);
    await p.keyboard.down("x"); await p.waitForTimeout(150); await p.keyboard.up("x");
    await f.waitForSelector("#intro:not([hidden])", { timeout: 10000 });
    /* the real tip first, then the longest tip text in either language put in its place */
    const longest = lang === "zh" ? "第 10 关之后，老王也来抢矿。他越挖越精，抢到东西还会嘲笑你。"
      : "Past level 10, Old Wang digs beside you. He sharpens every level, and gloats when he steals one.";
    for (const text of [null, longest]) {
      const g = await f.evaluate((text) => {
        const intro = document.getElementById("intro"), cv = document.getElementById("c");
        if (text) intro.innerHTML = "<b>Level 11 · $9,999</b><span>" + text + "</span><span>Strength · Clover · Book</span>";
        const a = intro.getBoundingClientRect(), c = cv.getBoundingClientRect();
        return { top: a.top, bottom: a.bottom, ct: c.top, ch: c.height, cb: c.bottom, vh: innerHeight, sky: GM.L.sky, rows: GM.L.H };
      }, text);
      /* the canvas is the sky band (the scoreboard), then the mine's 144 rows at 2 canvas rows each */
      const minerBottom = g.ct + g.ch * (g.sky + MINER_ROWS * 2) / g.rows;
      assert.ok(g.top >= minerBottom, `${lang}${text ? " (longest tip)" : ""}: the tip's top ${g.top.toFixed(1)} is above the miner's line ${minerBottom.toFixed(1)}`);
      assert.ok(g.bottom <= g.vh, `${lang}: the tip runs off the screen (${g.bottom} > ${g.vh})`);
    }
    await p.close();
  });
}

/* A return to the title from pause replaces the canvas. mountTitle() must destroy the menu it replaces: lo-title
   0.1.1's destroy() removes its window resize listener, its pointer listeners, its pending frame and its full-screen
   buffers. The spy wraps LoTitle.mount before the app's own script assigns LoTitle, so it sees each menu and its
   destroy() calls; a leaked menu would leave mounts ahead of destroys (and its buffers alive until a resize). */
test("lao-zhang: returning to the title destroys the previous menu", { skip, timeout: 90000 }, async () => {
  const p = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  await p.addInitScript(() => {
    let lib = null;
    window.__lt = { mounts: 0, destroys: 0 };
    Object.defineProperty(window, "LoTitle", {
      configurable: true,
      get() { return lib; },
      set(v) {
        if (lib) return;                     /* the first assignment is the bundled library */
        lib = v;
        const mount = v.mount;
        v.mount = function (canvas, opts) {
          const menu = mount.call(this, canvas, opts);
          window.__lt.mounts++;
          const destroy = menu.destroy;
          menu.destroy = function () {
            if (menu.__live) { menu.__live = false; window.__lt.destroys++; }
            return destroy.call(this);
          };
          menu.__live = true;
          return menu;
        };
      }
    });
  });
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/lao-zhang&lang=zh`);
  await p.addStyleTag({ content: ".screen{width:331px!important;height:359px!important;border:0!important}" });
  await p.waitForTimeout(1200);
  const f = p.frames().find((x) => x !== p.mainFrame());
  await f.waitForSelector("#tt", { timeout: 15000 });
  const stats = () => f.evaluate(() => ({
    mounts: window.__lt.mounts, destroys: window.__lt.destroys,
    canvases: document.querySelectorAll("canvas.lotitle").length
  }));
  /* the boot mounts the title before the saves are read, then again when they arrive: the first menu is destroyed */
  const first = await stats();
  assert.equal(first.canvases, 1, "one title canvas at boot");
  assert.equal(first.mounts - first.destroys, 1, "the title that is up is the only live menu: " + JSON.stringify(first));
  for (let i = 0; i < 3; i++) {
    await p.keyboard.press("x");                       /* 新游戏 / 继续: into the level tip */
    await p.waitForTimeout(400);
    await p.keyboard.press("Enter");                   /* START pauses, also from the tip */
    await p.waitForTimeout(300);
    await p.keyboard.press("ArrowDown");               /* 返回标题 / title */
    await p.waitForTimeout(200);
    await p.keyboard.press("x");
    await f.waitForSelector("#tt", { timeout: 10000 });
    await p.waitForTimeout(300);
    const now = await stats();
    assert.equal(now.canvases, 1, `return ${i + 1}: one title canvas, got ${now.canvases}`);
    assert.equal(now.mounts, first.mounts + i + 1, `return ${i + 1}: the title was mounted again`);
    assert.equal(now.destroys, first.destroys + i + 1, `return ${i + 1}: the menu it replaced was destroyed`);
    assert.equal(now.mounts - now.destroys, 1, `return ${i + 1}: exactly one live menu, old ones destroyed`);
  }
  await p.close();
});
