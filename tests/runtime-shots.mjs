// Screenshot regression for the runtime: proves a refactor changes nothing the user sees.
// Not a node:test file (no *.test.mjs); needs Playwright, which the repo does not depend on.
//
//   node tests/runtime-shots.mjs capture <repoRoot> <outDir>   serve <repoRoot>, drive /runtime/, write PNGs + downloads
//   node tests/runtime-shots.mjs compare <dirA> <dirB>         pixel-compare same-named files; exit 1 on any DIFF/missing
//                                                              (per-channel differences up to 2 count as equal, see TOLERANCE;
//                                                              diff images for differing PNGs go to <dirB>/diff/)
//
// Typical use: capture the old tree and the new tree into two dirs, then compare them.
//
// Why two runs of the same code give identical files:
//  - Date: page.clock.setFixedTime freezes Date.now()/new Date() (status clock, note times, film date
//    stamps, roll ids) while timers keep running. Time zone is pinned to UTC, locale to zh-CN.
//  - Math.random is replaced by a seeded generator (addInitScript).
//  - Fonts: the runtime ships its own (runtime/fonts/); screenshots wait for document.fonts.ready.
//    Older trees loaded them from Google Fonts; those requests are fetched with curl (needs network).
//  - A fresh browser context per run: empty IndexedDB, no service worker (blocked).
//  - prefers-reduced-motion: reduce skips the camera boot animation; screenshots use animations:"disabled".
//  - The camera is Chromium's fake device fed from a static y4m file generated here, so every
//    viewfinder frame and every shot is the same picture.
//  - navigator.storage.estimate/persisted are stubbed (Settings shows the real usage otherwise), and the
//    version line and the version number in the update row in Settings are masked, since a refactor is allowed (required) to bump RUNTIME_VERSION.
//  - Screenshots wait for the toast to disappear (it fades after 2.6 s) and for loads to settle.
//
// Downloads: platform.js uses navigator.share only on a coarse pointer. The context has no touch, so the
// pointer is fine and saves go through <a download>, which Playwright captures as download events.
// All driving is through clicks, keys and setInputFiles, never internal functions, so the script works
// on any tree that keeps the same element ids. Home tiles are found by their label, so adding or removing a
// program does not shift the others. Paint was a built-in up to runtime 0.4.1 and is a preinstalled app
// since 0.5.0: each tree gets the shots for the paint it has (05-paint* or 05-paint-app*). Likewise the cutter
// (up to 0.13.x: 10-cam-develop-menu, strip/card/cut downloads, 11-13 cutter) and the darkroom that replaced it
// (0.14.0+: 10-cam-done-menu, 11-13b darkroom, negative.png).
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { join, extname, normalize, resolve, dirname, delimiter } from "node:path";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json" };

/* ES imports ignore NODE_PATH, so a globally installed Playwright is found through require instead */
async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const dirs = (process.env.NODE_PATH || "").split(delimiter).filter(Boolean).concat(join(dirname(dirname(process.execPath)), "lib", "node_modules"));
  for (const d of dirs) { try { return createRequire(join(d, "x.js"))("playwright"); } catch {} }
  console.error("Playwright is not installed (npm i --no-save playwright)"); process.exit(2);
}

/* ---------------- capture ---------------- */

/* A static 320x240 YUV420 clip: a horizontal gradient, a dark disc, a bright box and a diagonal bar.
   Ten identical frames; Chromium loops them. */
function makeY4M() {
  const W = 320, H = 240, frames = 10;
  const Y = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 40 + Math.round((x / W) * 170);
    if ((x - 110) ** 2 + (y - 110) ** 2 < 55 ** 2) v = 30;
    if (x > 200 && x < 290 && y > 40 && y < 100) v = 235;
    if (Math.abs((x - y) - 60) < 8 && y > 150) v = 20;
    Y[y * W + x] = v;
  }
  const U = Buffer.alloc((W / 2) * (H / 2), 128), V = Buffer.alloc((W / 2) * (H / 2), 128);
  const head = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), Y, U, V]);
  return Buffer.concat([head, ...Array.from({ length: frames }, () => frame)]);
}

function serve(root) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    const file = join(root, path.endsWith("/") ? path + "index.html" : path);
    try { res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" }); res.end(await readFile(file)); }
    catch { res.writeHead(404); res.end(); }
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

/* runs in the page before any script: seeded Math.random (mulberry32) and a fixed storage report */
function initScript() {
  let a = 0x2f6e2b1;
  Math.random = function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    Object.defineProperty(navigator, "storage", { configurable: true, value: {
      estimate: () => Promise.resolve({ usage: 123456, quota: 1e9 }),
      persisted: () => Promise.resolve(false),
      persist: () => Promise.resolve(false) } });
  } catch (e) {}
}

async function capture(rootArg, outArg) {
  const pw = await loadPlaywright();
  const root = resolve(rootArg), out = resolve(outArg);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const scratch = join(tmpdir(), "lopda-shots-" + process.pid);
  await mkdir(scratch, { recursive: true });
  const y4m = join(scratch, "fake-cam.y4m");
  await writeFile(y4m, makeY4M());

  const server = await serve(root);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pw.chromium.launch({ args: [
    "--disable-site-isolation-trials",      /* sandboxed iframes render blank without it */
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`,
    "--force-color-profile=srgb", "--font-render-hinting=none"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: false,
    reducedMotion: "reduce", timezoneId: "UTC", locale: "zh-CN", serviceWorkers: "block", acceptDownloads: true,
    permissions: ["camera"] });
  await ctx.addInitScript(initScript);
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date("2026-10-11T09:41:00Z"));
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  const names = [];
  const settle = async (ms = 250) => {
    await p.waitForFunction(() => document.getElementById("toast").hidden, null, { timeout: 8000 });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(ms);
  };
  const shot = async (name) => { await settle(); await p.screenshot({ path: join(out, name + ".png"), animations: "disabled", caret: "hide" }); names.push(name); };
  const download = async (action, name) => {
    const [d] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), action()]);
    await d.saveAs(join(out, name)); names.push(name);
  };
  const LABEL = { notes: "记事本", paint: "点阵画板", camera: "点阵相机", cutter: "裁片机", darkroom: "冲洗店", cart: "卡带机", store: "应用商店", settings: "设置" };
  const tile = (name) => p.locator("#home .app", { has: p.locator(".label", { hasText: new RegExp("^" + LABEL[name] + "$") }) }).click();
  const home = async () => { await p.click("#home-key"); await p.waitForTimeout(200); };

  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LopdaPlatform && window.LopdaStrings);
  await p.waitForFunction(() => document.getElementById("savestate").textContent !== "启动中…", null, { timeout: 8000 });
  /* 0.5.0+ installs the preinstalled apps from the registry on first start: wait for the network to go quiet */
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(600);
  await shot("01-home");

  /* notes */
  await tile("notes"); await p.waitForTimeout(300);
  await shot("02-notes-empty");
  await p.click("#note-new");
  await p.keyboard.type("买胶卷\n周六去裁片。Film: 8 frames.", { delay: 10 });
  await p.waitForFunction(() => document.getElementById("note-state").textContent === "已保存", null, { timeout: 5000 });
  await shot("03-note-editor");
  await p.click("#note-back"); await p.waitForTimeout(300);
  await shot("04-notes-list");

  /* paint: the built-in (up to 0.4.1) or the preinstalled app (0.5.0+) */
  await home(); await tile("paint"); await p.waitForTimeout(600);
  const builtinPaint = await p.locator("#paint-cv").count() > 0;
  const paintFrame = builtinPaint ? null : p.frameLocator("#run-frame");
  const canvas = builtinPaint ? p.locator("#paint-cv") : paintFrame.locator("canvas").first();
  const pick = (builtinSel, n) => builtinPaint ? p.click(builtinSel) : paintFrame.locator("[data-c]").nth(n).click();
  const pre = builtinPaint ? "05-paint" : "05-paint-app";
  await canvas.waitFor();
  await shot(pre);
  const box = await canvas.boundingBox();
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  const stroke = async (pts) => {
    await p.mouse.move(...at(...pts[0])); await p.mouse.down();
    for (const q of pts.slice(1)) await p.mouse.move(...at(...q), { steps: 6 });
    await p.mouse.up();
  };
  await stroke([[0.15, 0.2], [0.5, 0.15], [0.85, 0.3]]);
  await pick(".sw-1", 1); await stroke([[0.2, 0.8], [0.5, 0.45], [0.8, 0.8]]);
  await pick(".sw-2", 2);
  if (builtinPaint) await p.click("#paint-size"); else await paintFrame.locator("#size").click();
  await stroke([[0.1, 0.55], [0.9, 0.6]]);
  await shot(pre + "-strokes");

  /* camera: no film, so the back opens on the roll picker */
  await home(); await tile("camera");
  await p.waitForSelector("#cam-load:not([hidden])"); await p.waitForTimeout(700);
  await shot("07-cam-load");
  await p.click("#roll-next"); await p.waitForTimeout(900);
  await p.click("#roll-count"); await p.click("#roll-count");   /* 12 -> 16 -> 8, the quickest roll */
  await p.waitForTimeout(200);
  await shot("08-cam-load-second-roll-8");
  await p.click("#roll-go");
  await p.waitForSelector("#cam-live-tag:not([hidden])", { timeout: 10000 });
  await p.waitForTimeout(1500);                                 /* several viewfinder frames */
  await shot("09-cam-live");
  for (let i = 0; i < 8; i++) {
    await p.click("#cam-shutter");
    await p.waitForFunction(() => document.getElementById("cam-shut").hidden, null, { timeout: 3000 });
    await p.waitForTimeout(450);
  }
  await p.waitForSelector("#cam-menu:not([hidden])");
  await p.waitForTimeout(400);
  /* up to 0.13.x the camera developed the roll and the cutter cut prints; since 0.14.0 the roll is unloaded into
     the darkroom's film box (docs/design/darkroom.md). Each tree gets the shots for what it has. */
  const darkroom = await p.locator("#v-dark").count() > 0;
  if (darkroom) {
    await shot("10-cam-done-menu");
    await p.click("#menu-list li:nth-child(1)");                                   /* 取出胶卷 */
    await p.waitForSelector("#cam-load:not([hidden])");
    await settle(400);

    /* darkroom: the film box, a roll's menu, naming, the export confirmation, the negative */
    await home(); await tile("darkroom");
    await p.waitForSelector("#dk-list li.on"); await p.waitForTimeout(300);
    await shot("11-darkroom-box");
    await p.keyboard.press("x"); await p.waitForSelector("#dk-sheet:not([hidden])");
    await shot("12-darkroom-menu");
    await p.keyboard.press("x"); await p.waitForSelector("#dk-name");
    await p.keyboard.type("海边", { delay: 10 });
    await shot("13-darkroom-name");
    await p.keyboard.press("Enter"); await p.waitForTimeout(200);
    await p.keyboard.press("ArrowDown"); await p.keyboard.press("x");
    await p.waitForSelector("#dk-sheet .dk-note"); await p.waitForTimeout(800);
    await shot("13b-darkroom-export");
    await p.keyboard.press("ArrowUp");
    await download(() => p.keyboard.press("x"), "negative.png");
    await settle(400);
  } else {
  await shot("10-cam-develop-menu");
  await download(() => p.click("#menu-list li:nth-child(1)"), "strip.png");      /* 冲洗长条 */
  await settle(600);
  await download(() => p.click("#menu-list li:nth-child(2)"), "card.png");       /* 印样卡 */
  await settle(600);

  /* cutter */
  await home(); await tile("cutter"); await p.waitForTimeout(300);
  await shot("11-cutter-empty");
  await p.setInputFiles("#cut-file", join(out, "strip.png"));
  await p.waitForFunction(() => !document.getElementById("cut-go").disabled, null, { timeout: 10000 });
  await p.waitForTimeout(500);
  await shot("12-cutter-strip");
  await download(() => p.click("#cut-go"), "cut.png");
  await settle(400);
  await p.click("#cut-edge"); await p.waitForTimeout(200);
  await shot("13-cutter-edge");
  await p.waitForFunction(() => !document.getElementById("cut-go").disabled);
  await download(() => p.click("#cut-go"), "cut-edge.png");
  await settle(400);
  }

  /* cartridge player, empty library */
  await home(); await tile("cart"); await p.waitForTimeout(600);
  await shot("14-cartridge");

  /* settings, English and back */
  const settings = async (name) => {
    /* the version changes with every runtime release; mask it so a version bump is not a diff.
       Only the number goes: the label next to it ("系统版本") is still compared. */
    await p.evaluate(() => {
      document.getElementById("set-version").textContent = "Lo-PDA (version masked)";
      const upd = document.getElementById("upd-label");
      upd.textContent = upd.textContent.replace(/\d+\.\d+\.\d+/g, "x.y.z");
    });
    await shot(name);
  };
  await home(); await tile("settings"); await p.waitForTimeout(700);
  await settings("15-settings");
  await p.click("[data-lang=en]"); await p.waitForTimeout(400);
  await settings("16-settings-en");
  await home(); await p.waitForTimeout(300);
  await shot("17-home-en");
  await p.locator("#home .app.builtin").last().click(); await p.waitForTimeout(500);   /* Settings, labelled in English now */
  await p.click("[data-lang=zh]"); await p.waitForTimeout(400);
  await home();

  /* store: list, install one small static app, run it */
  await tile("store");
  await p.waitForSelector("#store-list .store-item", { timeout: 10000 });
  await p.waitForTimeout(500);
  await shot("18-store");
  const item = p.locator("#store-list .store-item", { hasText: "五子棋" });
  await item.locator("button").click();
  await p.waitForFunction(() => { const li = [...document.querySelectorAll("#store-list .store-item")].find((e) => /五子棋/.test(e.textContent)); return li && li.querySelector("button").textContent === "打开"; }, null, { timeout: 10000 });
  await settle(300);
  await shot("19-store-installed");
  await item.locator("button").click();
  await p.waitForSelector("#v-run:not([hidden])"); await p.waitForTimeout(1000);
  await shot("20-runner");
  await p.click("#run-back"); await p.waitForTimeout(500);
  await shot("21-home-installed");

  await browser.close(); server.close();
  await rm(scratch, { recursive: true, force: true });
  console.log(`captured ${names.length} files into ${out}`);
  /* informational only (the sandboxed app frame logs a service-worker complaint on every load) */
  const seen = new Map(); for (const e of errors) seen.set(e, (seen.get(e) || 0) + 1);
  for (const [e, n] of seen) console.log(`page error x${n}: ${e.slice(0, 160)}`);
}

/* ---------------- compare ---------------- */

/* Chromium's software rasteriser very rarely lands one pixel one level off (e.g. 26,28,24 vs 26,29,25 in a
   panel corner) between identical runs. Real changes move a pixel by a whole tone (30+ levels), so a
   per-channel difference of up to 2 counts as the same pixel. */
const TOLERANCE = 2;
async function compare(aArg, bArg) {
  const A = resolve(aArg), B = resolve(bArg);
  const list = async (d) => (await readdir(d, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
  const [la, lb] = await Promise.all([list(A), list(B)]);
  const all = [...new Set([...la, ...lb])].sort();
  let bad = 0;
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch();
  const page = await browser.newPage();
  await mkdir(join(B, "diff"), { recursive: true });
  await rm(join(B, "diff"), { recursive: true, force: true });
  /* decode both PNGs in the page and count pixels whose RGBA differs; also build a red-on-grey diff image */
  const pixelDiff = (a64, b64) => page.evaluate(async ([x, y, TOL]) => {
    const dec = async (s) => {
      const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + s)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(bmp, 0, 0); return g.getImageData(0, 0, bmp.width, bmp.height);
    };
    const [p, q] = [await dec(x), await dec(y)];
    if (p.width !== q.width || p.height !== q.height) return { size: [p.width, p.height, q.width, q.height] };
    let n = 0; const o = new ImageData(p.width, p.height);
    for (let i = 0; i < p.data.length; i += 4) {
      const d = Math.max(Math.abs(p.data[i] - q.data[i]), Math.abs(p.data[i + 1] - q.data[i + 1]), Math.abs(p.data[i + 2] - q.data[i + 2]), Math.abs(p.data[i + 3] - q.data[i + 3])) > TOL;
      if (d) { n++; o.data.set([255, 0, 0, 255], i); } else { const g = (q.data[i] >> 2) + 150; o.data.set([g, g, g, 255], i); }
    }
    if (!n) return { n };
    const c = new OffscreenCanvas(p.width, p.height); c.getContext("2d").putImageData(o, 0, 0);
    const blob = await c.convertToBlob({ type: "image/png" });
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (const v of buf) s += String.fromCharCode(v);
    return { n, diff: btoa(s) };
  }, [a64, b64, TOLERANCE]);

  for (const name of all) {
    if (!la.includes(name)) { console.log(`${name}: MISSING in ${aArg}`); bad++; continue; }
    if (!lb.includes(name)) { console.log(`${name}: MISSING in ${bArg}`); bad++; continue; }
    const [x, y] = await Promise.all([readFile(join(A, name)), readFile(join(B, name))]);
    if (x.equals(y)) { console.log(`${name}: same`); continue; }
    if (extname(name) !== ".png") { console.log(`${name}: DIFF (bytes)`); bad++; continue; }
    const r = await pixelDiff(x.toString("base64"), y.toString("base64"));
    if (r.size) { console.log(`${name}: DIFF size ${r.size[0]}x${r.size[1]} vs ${r.size[2]}x${r.size[3]}`); bad++; }
    else if (!r.n) console.log(`${name}: same (PNG bytes differ, pixels within tolerance)`);
    else {
      await mkdir(join(B, "diff"), { recursive: true });
      await writeFile(join(B, "diff", name), Buffer.from(r.diff, "base64"));
      console.log(`${name}: DIFF ${r.n} pixels (diff/${name})`); bad++;
    }
  }
  await browser.close();
  console.log(bad ? `${bad} of ${all.length} files differ` : `all ${all.length} files same`);
  process.exit(bad ? 1 : 0);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "capture" && a && b) await capture(a, b);
else if (cmd === "compare" && a && b) await compare(a, b);
else { console.error("usage: node tests/runtime-shots.mjs capture <repoRoot> <outDir> | compare <dirA> <dirB>"); process.exit(2); }
