// The README's pictures: drives the runtime in Chromium and writes docs/images/.
// Needs Playwright (not a dependency: npm i --no-save playwright, or a global install found through NODE_PATH).
//
//   node tools/readme-shots.mjs [outDir] [--lang=en|zh] [--raw] [--only=camera,notes,calendar,dict,reader,store,games]
//
// Writes screens.png, builtins.png, apps.png (four screens each) into outDir, plus contact-sheet.png and film-strip.png
// in English (the prints are the same in both languages). The default outDir is docs/images for English (README.md)
// and docs/images/zh for Chinese (README.zh.md). --raw keeps every single screen in <outDir>/raw/; --only runs some
// parts (a row whose screens are missing is skipped).
//
// The camera is Chromium's fake device fed from tools/readme-scene.mjs (a lake drawn in code), so the photos
// belong to nobody. The clock, Math.random and crypto are fixed as in tests/runtime-shots.mjs, so two runs give
// the same pictures. The cartridge player is never shown with a game: Lo-PDA ships none.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, normalize, resolve, dirname, delimiter } from "node:path";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { y4m } from "./readme-scene.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8" };

async function loadPlaywright() {
  try { return await import("playwright"); } catch {}
  const dirs = (process.env.NODE_PATH || "").split(delimiter).filter(Boolean).concat(join(dirname(dirname(process.execPath)), "lib", "node_modules"));
  for (const d of dirs) { try { return createRequire(join(d, "x.js"))("playwright"); } catch {} }
  console.error("Playwright is not installed (npm i --no-save playwright)"); process.exit(2);
}

function serve(root) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    const file = join(root, path.endsWith("/") ? path + "index.html" : path);
    try { const body = await readFile(file); res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

/* in the page before any script: seeded Math.random and crypto, a fixed storage report (as tests/runtime-shots.mjs) */
function initScript() {
  let a = 0x2f6e2b1;
  Math.random = function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let c = 0x51ed2701;
  crypto.getRandomValues = function (arr) { for (let i = 0; i < arr.length; i++) { c = (Math.imul(c, 1664525) + 1013904223) >>> 0; arr[i] = c; } return arr; };
  try {
    Object.defineProperty(navigator, "storage", { configurable: true, value: {
      estimate: () => Promise.resolve({ usage: 123456, quota: 1e9 }),
      persisted: () => Promise.resolve(false), persist: () => Promise.resolve(false) } });
  } catch (e) {}
}

const args = process.argv.slice(2);
const LANG = (args.find((a) => a.startsWith("--lang=")) || "--lang=en").slice(7);
if (LANG !== "en" && LANG !== "zh") { console.error("--lang is en or zh"); process.exit(2); }
const OUT = resolve(args.find((a) => !a.startsWith("--")) || join(ROOT, "docs", "images", LANG === "zh" ? "zh" : ""));

/* what the script reads on the screen, and what it writes into the notes, in each language */
const T = {
  zh: { boot: "启动中…", open: "打开", camera: "点阵相机", darkroom: "冲洗店", notes: "记事本", calendar: "万年历", dict: "词典",
        reader: "阅读器", book: "論語", store: "应用商店", puzzle: "拍照拼图", tower: "纸塔", yu: "滥竽充数", rain: "雨站",
        today: "去湖边拍完了一卷胶卷。船从左边划到右边，正好八张。", earlier: "秋天第一次穿外套。",
        quote: "《論語》\n學而時習之，不亦說乎。#摘抄", todo: "买胶卷\n周六去冲洗店。#待办" },
  en: { boot: "BOOT…", open: "Open", camera: "Camera", darkroom: "Darkroom", notes: "Notes", calendar: "Calendar", dict: "Dict",
        reader: "Reader", book: "Alice", store: "Store", puzzle: "SnapTile", tower: "Paper", yu: "Fake Yu", rain: "Rain Stn",
        today: "Shot a whole roll by the lake. The boat crossed from left to right, eight frames exactly.",
        earlier: "First cold morning. Wore a coat.",
        quote: "Alice\u2019s Adventures in Wonderland\n\u201cCuriouser and curiouser!\u201d cried Alice. #quotes",
        todo: "Buy film\nTake the roll to the darkroom on Saturday. #todo" },
}[LANG];
const RAW = join(OUT, "raw");
const KEEP_RAW = args.includes("--raw");

const pw = await loadPlaywright();
await mkdir(RAW, { recursive: true });
const scratch = join(tmpdir(), "lopda-readme-" + process.pid);
await mkdir(scratch, { recursive: true });
const cam = join(scratch, "scene.y4m");
await writeFile(cam, y4m(10));

const server = await serve(ROOT);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await pw.chromium.launch({ args: [
  "--disable-site-isolation-trials",
  "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${cam}`,
  "--force-color-profile=srgb", "--font-render-hinting=none"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: false,
  reducedMotion: "reduce", timezoneId: "Asia/Shanghai", locale: LANG === "zh" ? "zh-CN" : "en-US", serviceWorkers: "block", acceptDownloads: true,
  permissions: ["camera"] });
await ctx.addInitScript(initScript);
const p = await ctx.newPage();
await p.clock.setFixedTime(new Date("2026-10-22T09:41:00+08:00"));
await p.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 404, body: "not found" }));

const settle = async (ms = 250) => {
  await p.waitForFunction(() => document.getElementById("toast").hidden, null, { timeout: 8000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(ms);
};
const shot = async (name, ms) => { await settle(ms); await p.screenshot({ path: join(RAW, name + ".png"), animations: "disabled", caret: "hide" }); console.log("shot", name); };
const download = async (action, name) => {
  const [d] = await Promise.all([p.waitForEvent("download", { timeout: 20000 }), action()]);
  await d.saveAs(join(RAW, name)); console.log("file", name);
};
const tile = (label) => p.locator("#home .app", { has: p.locator(".label", { hasText: new RegExp("^" + label + "$") }) }).click();
const home = async () => { await p.click("#home-key"); await p.waitForTimeout(300); };
const key = async (k, n = 1, gap = 120) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await p.waitForTimeout(gap); } };

await p.goto(base + "/runtime/", { waitUntil: "load" });
await p.waitForFunction(() => window.LopdaPlatform && window.LopdaStrings);
await p.waitForFunction((boot) => document.getElementById("savestate").textContent !== boot, T.boot, { timeout: 8000 });
await p.waitForLoadState("networkidle");
await p.waitForTimeout(800);

const ONLY = (args.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
const want = (name) => !ONLY.length || ONLY.includes(name);

/* ---- camera: a roll of 8, shot while the boat crosses the lake, unloaded into the film box ---- */
if (want("camera")) {
await tile(T.camera);
await p.waitForSelector("#cam-load:not([hidden])"); await p.waitForTimeout(700);
await p.click("#roll-count"); await p.click("#roll-count");   /* 12 -> 16 -> 8 */
await p.click("#roll-go");
await p.waitForSelector("#cam-live-tag:not([hidden])", { timeout: 10000 });
await p.waitForTimeout(1500);
await shot("camera");
for (let i = 0; i < 8; i++) {
  await p.click("#cam-shutter");
  await p.waitForFunction(() => document.getElementById("cam-shut").hidden, null, { timeout: 3000 });
  await p.waitForTimeout(330 + i * 37);                       /* the clip loops once a second: a different frame each time */
}
await p.waitForSelector("#cam-menu:not([hidden])");
await p.click("#menu-list li:nth-child(1)");                  /* 取出胶卷 */
await p.waitForSelector("#cam-load:not([hidden])");
await settle(400);

/* ---- darkroom: develop, the colour viewer, the contact sheet and the film strip ---- */
await home(); await tile(T.darkroom);
await p.waitForSelector("#dk-list li.on"); await p.waitForTimeout(300);
await key("x"); await p.waitForSelector("#dk-sheet:not([hidden])");
await key("x");                                               /* 冲洗 */
await p.waitForSelector("#dk-view:not([hidden])", { timeout: 60000 });
await p.waitForFunction(() => document.getElementById("dk-vwait").hidden, null, { timeout: 20000 });
await key("ArrowRight", 3);
await p.waitForFunction(() => document.getElementById("dk-vwait").hidden, null, { timeout: 20000 });
await shot("darkroom");
await key("Enter"); await p.waitForSelector("#dk-sheet:not([hidden])");
await key("ArrowDown");
await download(() => p.keyboard.press("x"), "contact.png"); await settle(400);
await key("Enter"); await key("ArrowDown", 2);
await download(() => p.keyboard.press("x"), "filmstrip.png"); await settle(400);
await key("z");
await home();
}

/* ---- notes: today's diary, so the calendar has a folded corner on it too ---- */
if (want("notes") || want("calendar")) {
  await p.evaluate((T) => {
    const now = Date.now(), d = (n) => now - n * 864e5, day = (n) => new Date(d(n) + 8 * 36e5).toISOString().slice(0, 10);
    const title = (k) => LopdaNoteText.diaryTitle(k, LP.I18N.lang, LP.tr, window.LopdaLunar);
    const notes = LP.S.refs.notes;
    notes.doc().set({ body: title(day(0)) + "\n" + T.today, day: day(0), created: d(0), updated: d(0) });
    notes.doc().set({ body: title(day(4)) + "\n" + T.earlier, day: day(4), created: d(4), updated: d(4) });
    notes.doc().set({ body: T.quote, src: "reader", created: d(2), updated: d(2) });
    notes.doc().set({ body: T.todo, created: d(1), updated: d(1) });
  }, T);
  await p.evaluate(() => LP.refresh("notes"));
}
if (want("notes")) {
  await home(); await tile(T.notes); await p.waitForTimeout(500);
  await shot("notes");
}
if (want("calendar")) {
  await home(); await tile(T.calendar); await p.locator("#v-cal:not([hidden])").waitFor(); await p.waitForTimeout(500);
  await shot("calendar");
}

/* ---- dictionary: one entry from the built-in ECDICT ---- */
if (want("dict")) {
  await home(); await tile(T.dict); await p.waitForTimeout(800);
  await p.fill("#dict-q", "film"); await p.waitForTimeout(600);
  await p.keyboard.press("Enter"); await p.waitForTimeout(800);
  await shot("dict");
}

/* ---- reader: a sample book (the Analects in Chinese, Alice in English), a few pages in ---- */
if (want("reader")) {
  await home(); await tile(T.reader); await p.waitForSelector("#rd-list li", { timeout: 10000 }); await p.waitForTimeout(500);
  await p.locator("#rd-list li", { hasText: T.book }).first().click();
  await p.waitForSelector("#rd-book:not([hidden])", { timeout: 15000 }); await p.waitForTimeout(800);
  await key("ArrowRight", 3, 400);
  await shot("reader", 800);
}

/* ---- store ---- */
if (want("store")) {
  await home(); await tile(T.store);
  await p.waitForSelector("#store-list .store-item", { timeout: 10000 }); await p.waitForTimeout(500);
  await shot("store");
}

/* ---- store apps: install, run, a few presses into play ---- */
const play = async (label, steps) => {
  await home(); await tile(T.store);
  await p.waitForSelector("#store-list .store-item", { timeout: 10000 });
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);   /* the list draws again once the index arrives */
  const item = p.locator("#store-list .store-item", { hasText: label }).first();
  await item.scrollIntoViewIfNeeded();
  if ((await item.locator("button").textContent()) !== T.open) {
    await item.locator("button").click();
    await p.waitForFunction(([l, open]) => { const li = [...document.querySelectorAll("#store-list .store-item")].find((e) => e.textContent.includes(l)); return li && li.querySelector("button").textContent === open; }, [label, T.open], { timeout: 15000 });
    await settle(300);
  }
  await item.locator("button").click();
  await p.waitForSelector("#v-run:not([hidden])"); await p.waitForTimeout(1500);
  for (const s of steps) {
    if (typeof s === "number") await p.waitForTimeout(s);
    else if (/^[a-z][a-z-]+$/.test(s)) await shot(s, 100);   /* "x" and "ArrowDown" are keys */
    else await key(s, 1, 250);
  }
};
/* "name" takes a screenshot called name; a number waits; anything else is a key */
const GAMES = [
  [T.puzzle, ["x", 800, "x", 1500, "x", 1500, "x", 2500, "puzzle"]],          /* allow the camera, shoot the lake, use it */
  [T.tower, ["x", 800, "x", 800, "x", 800, "paper-tower"]],
  [T.yu, ["ArrowDown", "x", 800, "x", 8000, "fake-yu"]],                  /* 选曲, the first song, mid-song */
  [T.rain, ["x", 800, "x", 3000, "rain-station"]],
];
for (const [label, steps] of GAMES) if (want("games")) await play(label, steps);

await home();
await shot("home");

/* ---- the README's pictures: four screens side by side, and the darkroom's own prints as they are ---- */
const ROWS = {
  "screens.png": ["home", "camera", "darkroom", "puzzle"],
  "builtins.png": ["notes", "calendar", "dict", "reader"],
  "apps.png": ["paper-tower", "fake-yu", "rain-station", "store"],
};
for (const [file, names] of Object.entries(ROWS)) {
  if (!names.every((n) => existsSync(join(RAW, n + ".png")))) { console.log("skip", file); continue; }
  const pngs = await Promise.all(names.map((n) => readFile(join(RAW, n + ".png"), "base64")));
  const out = await p.evaluate(async (list) => {
    const bmps = await Promise.all(list.map(async (s) => createImageBitmap(await (await fetch("data:image/png;base64," + s)).blob())));
    const c = new OffscreenCanvas(bmps.reduce((w, b) => w + b.width, 0), bmps[0].height), g = c.getContext("2d");
    let x = 0; for (const b of bmps) { g.drawImage(b, x, 0); x += b.width; }
    const buf = new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer());
    let s = ""; for (const v of buf) s += String.fromCharCode(v); return btoa(s);
  }, pngs);
  await writeFile(join(OUT, file), Buffer.from(out, "base64")); console.log("wrote", file);
}
/* the prints at the size the README shows them (the darkroom writes them at 2x and 3x) */
if (LANG === "en") for (const [from, to, w, h] of [["contact.png", "contact-sheet.png", 720, 960], ["filmstrip.png", "film-strip.png", 1212, 160]]) {
  if (!existsSync(join(RAW, from))) continue;
  const out = await p.evaluate(async ([png, w, h]) => {
    const b = await createImageBitmap(await (await fetch("data:image/png;base64," + png)).blob());
    const c = new OffscreenCanvas(w, h), g = c.getContext("2d");
    g.imageSmoothingQuality = "high"; g.drawImage(b, 0, 0, w, h);
    const buf = new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer());
    let s = ""; for (const v of buf) s += String.fromCharCode(v); return btoa(s);
  }, [await readFile(join(RAW, from), "base64"), w, h]);
  await writeFile(join(OUT, to), Buffer.from(out, "base64")); console.log("wrote", to);
}

await browser.close(); server.close();
await rm(scratch, { recursive: true, force: true });
if (!KEEP_RAW) await rm(RAW, { recursive: true, force: true });
