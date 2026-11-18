// The launch video's clips: drives the runtime in Chromium at a phone's size and records each scene as frames.
// Needs Playwright (as tools/readme-shots.mjs) and ffmpeg on the PATH. Nothing it writes belongs in the repo.
//
//   node tools/launch-video.mjs record <outDir> [--lang=en|zh] [--only=boot,camera,...]
//   node tools/launch-video.mjs edit <outDir> [--lang=en|zh] [--maze=<phone clip>]
//
// record writes <outDir>/clips-<lang>/<scene>.mp4 (the screen alone, 30 fps) and music.wav (Tape4's neo-soul demo).
// edit cuts them into <outDir>/lopda-<lang>.mp4: 1080 x 1920, the screen in a phone outline, a caption under it.
// --maze takes a clip filmed on a real phone for the tilt shot (the recorded one is the stand-in).
//
// The camera is Chromium's fake device fed from docs/images/stocks/0-original.jpg (the owner's own photo, already
// shown in the README), moving slowly as a hand would. Frames come from the DevTools screencast with their own
// timestamps, so every clip plays at the speed it ran. The cartridge player is never shown: Lo-PDA ships no games.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, normalize, resolve, dirname, delimiter } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".ttf": "font/ttf" };
const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { stdio: "inherit" });

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

const args = process.argv.slice(2);
const MODE = args[0];
const OUT = resolve(args[1] || "launch-video");
const opt = (k, d) => { const a = args.find((x) => x.startsWith("--" + k + "=")); return a ? a.slice(k.length + 3) : d; };
const LANG = opt("lang", "en");
const ONLY = opt("only", "").split(",").filter(Boolean);
const want = (n) => !ONLY.length || ONLY.includes(n);
if (MODE !== "record" && MODE !== "edit") { console.error("usage: launch-video.mjs record|edit <outDir> [--lang=en|zh]"); process.exit(2); }

/* the screen's size in css px, and the scale of the frames */
const VW = 390, VH = 844, DPR = 2;

const T = {
  zh: { camera: "点阵相机", darkroom: "冲洗店", reader: "阅读器", book: "Alice", store: "应用商店", pet: "宠物", studio: "四轨机",
        library: "磁带库", file: "文件", maze: "滚珠迷宫", open: "打开", play: "播放" },
  en: { camera: "Camera", darkroom: "Darkroom", reader: "Reader", book: "Alice", store: "Store", pet: "Pet", studio: "Tape4",
        library: "Tape library", file: /^File/, maze: "Marble", open: "Open", play: "Play" },
}[LANG];


/* ======================================== record ======================================== */
async function record() {
  const pw = await loadPlaywright();
  const clips = join(OUT, "clips-" + LANG), work = join(OUT, "work");
  await mkdir(clips, { recursive: true }); await mkdir(work, { recursive: true });

  /* the fake camera: the photo, a 4:3 window drifting slowly over it with a little hand shake, 12 s looping */
  const cam = join(work, "scene.y4m");
  if (!existsSync(cam)) ff("-loop", "1", "-i", join(ROOT, "docs/images/stocks/0-original.jpg"), "-t", "12", "-r", "15",
    "-vf", "scale=1600:1400,crop=1120:840:x='200+120*sin(t/12*2*PI)+6*sin(t*5.3)':y='300+60*sin(t/12*2*PI+1)+5*sin(t*4.1)',scale=640:480,format=yuv420p",
    "-f", "yuv4mpegpipe", cam);

  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pw.chromium.launch({ args: ["--disable-site-isolation-trials",
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${cam}`,
    "--force-color-profile=srgb", "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, hasTouch: false,
    timezoneId: "Asia/Shanghai", locale: LANG === "zh" ? "zh-CN" : "en-US", serviceWorkers: "block", acceptDownloads: true,
    permissions: ["camera"] });
  await ctx.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 404, body: "not found" }));

  const newPage = async (q = "") => {
    const p = await ctx.newPage();
    await p.clock.install({ time: new Date("2026-10-22T09:41:00+08:00") });   /* a weekday morning; time runs */
    await p.goto(base + "/runtime/" + q, { waitUntil: "load" });
    return p;
  };
  const ready = async (p) => {
    await p.waitForFunction(() => window.LP && LP.S && LP.S.db && document.getElementById("toast"));
    await p.waitForLoadState("networkidle"); await p.waitForTimeout(600);
  };
  const tile = (p, label) => p.locator("#home .app", { has: p.locator(".label", { hasText: new RegExp("^" + label + "$") }) }).click();
  const home = async (p) => { await p.click("#home-key"); await p.waitForTimeout(400); };
  const key = async (p, k, n = 1, gap = 160) => { for (let i = 0; i < n; i++) { await p.keyboard.press(k); await p.waitForTimeout(gap); } };

  /* a clip: the screencast's frames with their timestamps, then one mp4 at 30 fps that keeps the timing */
  /* shots: screenshots in a loop instead of the screencast, for a sandboxed app (the screencast stops drawing its frame) */
  async function film(p, name, act, shots = false) {
    const dir = join(work, name); await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
    const frames = [], file = () => join(dir, String(frames.length).padStart(5, "0") + ".jpg");
    let cdp = null, t0, t1;
    if (shots) {
      let done = false; t0 = Date.now() / 1000;
      const loop = (async () => { while (!done) { const f = file(), t = Date.now() / 1000;
        await p.screenshot({ path: f, type: "jpeg", quality: 92 }); frames.push({ file: f, t }); } })();
      await act(); t1 = Date.now() / 1000; done = true; await loop;
    } else {
      cdp = await ctx.newCDPSession(p);
      cdp.on("Page.screencastFrame", async (f) => {
        const out = file();
        frames.push({ file: out, t: f.metadata.timestamp });
        writeFile(out, Buffer.from(f.data, "base64"));
        try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch {}
      });
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: VW * DPR, maxHeight: VH * DPR, everyNthFrame: 1 });
      t0 = Date.now() / 1000;
      await act();
      t1 = Date.now() / 1000;
      await cdp.send("Page.stopScreencast"); await p.waitForTimeout(300); await cdp.detach();
      t1 -= t0 - frames[0]?.t || 0; t0 = frames[0]?.t;   /* the screencast's own clock */
    }
    if (!frames.length) throw new Error(name + ": no frames");
    /* the screencast only sends a frame when the screen changes: each frame lasts until the next one */
    let list = "ffconcat version 1.0\n";
    frames.forEach((f, i) => { const end = i + 1 < frames.length ? frames[i + 1].t : Math.max(f.t + 0.04, t1);
      list += `file '${f.file}'\nduration ${Math.max(0.001, end - f.t).toFixed(4)}\n`; });
    list += `file '${frames.at(-1).file}'\n`;
    await writeFile(join(dir, "list.txt"), list);
    ff("-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", `fps=30,scale=${VW * DPR}:${VH * DPR}:flags=neighbor,format=yuv420p`,
      "-c:v", "libx264", "-crf", "14", "-preset", "slow", join(clips, name + ".mp4"));
    console.log("clip", name, frames.length, "frames", (t1 - t0).toFixed(1) + " s");
  }

  /* ---- boot: the first start, the home screen drawing ---- */
  let p = await ctx.newPage();
  await p.clock.install({ time: new Date("2026-10-22T09:41:00+08:00") });
  await p.goto("about:blank");
  if (want("boot")) await film(p, "boot", async () => { await p.goto(base + "/runtime/", { waitUntil: "load" }); await ready(p); await p.waitForTimeout(1500); });
  else { await p.goto(base + "/runtime/", { waitUntil: "load" }); await ready(p); }

  /* ---- camera: load a roll of 8, look around, shoot it all ---- */
  if (want("camera")) {
    await tile(p, T.camera);
    await p.waitForSelector("#cam-load:not([hidden])"); await p.waitForTimeout(700);
    await p.click("#roll-count"); await p.click("#roll-count");   /* 12 -> 16 -> 8 */
    await film(p, "camera", async () => {
      await p.waitForTimeout(500);
      await p.click("#roll-go");
      await p.waitForSelector("#cam-live-tag:not([hidden])", { timeout: 10000 });
      await p.waitForTimeout(2500);
      for (let i = 0; i < 8; i++) {
        await p.click("#cam-shutter");
        await p.waitForFunction(() => document.getElementById("cam-shut").hidden, null, { timeout: 3000 });
        await p.waitForTimeout(i < 2 ? 900 : 350);
      }
      await p.waitForSelector("#cam-menu:not([hidden])"); await p.waitForTimeout(500);
    });
    await p.click("#menu-list li:nth-child(1)");                  /* 取出胶卷 */
    await p.waitForSelector("#cam-load:not([hidden])"); await p.waitForTimeout(500);

    /* ---- darkroom: develop the roll, then the colour pictures ---- */
    await home(p); await tile(p, T.darkroom);
    await p.waitForSelector("#dk-list li.on"); await p.waitForTimeout(400);
    await film(p, "darkroom", async () => {
      await p.waitForTimeout(500);
      await key(p, "x"); await p.waitForSelector("#dk-sheet:not([hidden])"); await p.waitForTimeout(500);
      await key(p, "x");                                            /* 冲洗 */
      await p.waitForSelector("#dk-view:not([hidden])", { timeout: 60000 });
      await p.waitForFunction(() => document.getElementById("dk-vwait").hidden, null, { timeout: 20000 });
      await p.waitForTimeout(2500);
      for (let i = 0; i < 3; i++) { await key(p, "ArrowRight"); await p.waitForFunction(() => document.getElementById("dk-vwait").hidden, null, { timeout: 20000 }); await p.waitForTimeout(1300); }
    });
    await key(p, "z"); await home(p);
  }

  /* ---- the tilt maze (stand-in): installed from the store, pushed with the D-pad ---- */
  if (want("maze")) {
    await home(p); await tile(p, T.store);
    await p.waitForSelector("#store-list .store-item", { timeout: 10000 }); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
    const item = p.locator("#store-list .store-item", { hasText: T.maze }).first();
    await item.scrollIntoViewIfNeeded();
    if ((await item.locator("button").textContent()) !== T.open) {
      await item.locator("button").click(); await p.waitForTimeout(400);
      const ask = p.locator("#file-ask .box button").first(); if (await ask.count()) await ask.click();
      await p.waitForFunction(([l, o]) => { const li = [...document.querySelectorAll("#store-list .store-item")].find((e) => e.textContent.includes(l)); return li && li.querySelector("button").textContent === o; }, [T.maze, T.open], { timeout: 15000 });
      await p.waitForTimeout(500);
    }
    await home(p);
    /* the app runs in a page without the fake clock: Playwright's clock does not reach into the sandboxed frame */
    /* the phone's tilt, as tests/e2e.test.mjs fakes it: the prompt granted, deviceorientation sent from window.__tilt */
    const m = await ctx.newPage();
    await m.addInitScript(() => {
      const grant = () => Promise.resolve("granted");
      DeviceOrientationEvent.requestPermission = grant; DeviceMotionEvent.requestPermission = grant;
      window.__tilt = { beta: 40, gamma: 0 };
      setInterval(() => window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", window.__tilt)), 30);
    });
    await m.goto(base + "/runtime/", { waitUntil: "load" }); await ready(m);
    await tile(m, T.maze); await m.waitForSelector("#v-run:not([hidden])"); await m.waitForTimeout(1500);
    await key(m, "x"); await m.waitForTimeout(500);
    /* the runtime asks for a tap (iPhone's motion prompt needs one), then its own dialog: A allows */
    if (await m.locator("#sense-tap").count()) await m.click("#sense-tap"); await m.waitForSelector("#file-ask .box", { timeout: 5000 }).catch(() => {});
    if (await m.locator("#file-ask .box").count()) { await m.waitForTimeout(300); await key(m, "x"); }
    await m.waitForTimeout(800);
    await film(m, "maze", async () => {
      /* a hand: tip it down past the wall, right, then up to the flag, eased like a wrist */
      for (const [b, g, ms] of [[40, 0, 200], [66, -2, 700], [64, 0, 600], [44, 24, 600], [42, 22, 500], [16, 4, 700], [14, 0, 900], [40, 0, 900]]) {
        const from = await m.evaluate(() => window.__tilt), steps = Math.round(ms / 30);
        for (let i = 1; i <= steps; i++) { const k = 0.5 - Math.cos(Math.PI * i / steps) / 2;
          await m.evaluate(([b, g]) => { window.__tilt = { beta: b, gamma: g }; }, [from.beta + (b - from.beta) * k, from.gamma + (g - from.gamma) * k]);
          await m.waitForTimeout(30); }
      }
    });
    await m.close();
  }

  /* ---- the montage: pet, Tape4, the reader's lookup, the store ---- */
  if (want("pet")) {
    const q = await newPage("?debug"); await ready(q);
    await tile(q, T.pet);
    await q.waitForFunction(() => window.LOPDA_DEBUG.pet && LOPDA_DEBUG.pet.save());
    await q.evaluate(() => LOPDA_DEBUG.pet.hatch()); await q.waitForTimeout(400);
    await q.evaluate(() => LOPDA_DEBUG.pet.setDay(5)); await q.waitForTimeout(1200);
    await film(q, "pet", async () => { await q.waitForTimeout(4000); });
    await q.close();
  }
  if (want("studio")) {
    await home(p); await tile(p, T.studio);
    await p.waitForSelector("#v-studio:not([hidden])"); await p.waitForTimeout(800);
    const skipTour = async () => { const b = p.locator("#v-studio .st-tour-box button:visible", { hasText: /Skip|跳过/ }); if (await b.count()) { await b.first().click(); await p.waitForTimeout(300); } };
    await skipTour();
    await p.click("#studio-menu"); await p.waitForTimeout(300);
    await p.locator("#studio-sheet li", { hasText: T.library }).first().click(); await p.waitForTimeout(500);
    await p.locator("#studio-sheet .st-proj-list li").first().click(); await p.waitForTimeout(400);
    await p.locator("#studio-sheet .st-proj-list li").nth(0).click(); await p.waitForTimeout(300);   /* neo-soul */
    await p.locator("#studio-sheet .st-ask .btn:not(.ghost)").click(); await p.waitForTimeout(800);
    await skipTour();
    /* the music: the same tape through the WAV export */
    await p.click("#studio-menu"); await p.waitForTimeout(300);
    await p.locator("#studio-sheet li", { hasText: T.file }).first().click(); await p.waitForTimeout(300);
    const [d] = await Promise.all([p.waitForEvent("download", { timeout: 120000 }),
      p.locator("#studio-sheet li", { hasText: /WAV/ }).first().click()]);
    await d.saveAs(join(OUT, "music.wav")); console.log("music.wav");
    await p.waitForTimeout(1500);
    await p.click('#studio-screens .st-scr[data-screen="drums"]'); await p.waitForTimeout(400); await skipTour();
    await p.click("#studio-play");                                 /* playing before the clip starts, past the first toast */
    await p.waitForFunction(() => document.getElementById("toast").hidden, null, { timeout: 10000 }); await p.waitForTimeout(300);
    await film(p, "studio", async () => { await p.waitForTimeout(3000); });
    await p.click("#studio-play");
    await home(p);
  }
  if (want("reader")) {
    await home(p); await tile(p, T.reader); await p.waitForSelector("#rd-list li", { timeout: 10000 }); await p.waitForTimeout(500);
    await p.locator("#rd-list li", { hasText: T.book }).first().click();
    await p.waitForSelector("#rd-book:not([hidden])", { timeout: 15000 }); await p.waitForTimeout(800);
    await key(p, "ArrowRight", 2, 900);
    await film(p, "reader", async () => {
      await p.waitForTimeout(500);
      /* a long press on a word in the middle of the page: the selection, then its lookup */
      const pt = await p.evaluate(() => {
        const page = document.querySelector("#rd-book"), r = page.getBoundingClientRect();
        const w = document.createTreeWalker(page, NodeFilter.SHOW_TEXT); let n;
        while ((n = w.nextNode())) { const m = /[A-Za-z]{6,}/.exec(n.textContent); if (!m) continue;
          const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
          const b = rg.getClientRects()[0]; if (b && b.top > r.top + r.height * 0.35) return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await p.waitForTimeout(800); await p.mouse.up();
      await p.waitForTimeout(700); await key(p, "x");               /* A: look it up */
      await p.waitForTimeout(2500);
    });
    await home(p);
  }
  if (want("store")) {
    /* the store, scrolled slowly from the top: how many apps there are */
    await home(p); await tile(p, T.store);
    await p.waitForSelector("#store-list .store-item", { timeout: 10000 }); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
    await film(p, "store", async () => {
      await p.waitForTimeout(400); await p.mouse.move(VW / 2, VH * 0.4);
      for (let i = 0; i < 110; i++) { await p.mouse.wheel(0, 14 + 10 * Math.sin(Math.PI * i / 110)); await p.waitForTimeout(30); }
      await p.waitForTimeout(300);
    });
    await home(p);
  }

  /* ---- the grid: store apps being played, each started straight from the registry as tests/e2e.test.mjs does,
     in a page without the fake clock (it would stop the sandboxed frame) ---- */
  if (want("apps")) {
    const a = await ctx.newPage(); await a.goto(base + "/runtime/", { waitUntil: "load" }); await ready(a);
    const keys = async (list) => { for (const [k, ms] of list) { if (k === "wait") await a.waitForTimeout(ms);
      else if (k === "tap") { const box = await a.locator("#run-frame").boundingBox(); await a.mouse.click(box.x + box.width * ms[0], box.y + box.height * ms[1]); await a.waitForTimeout(120); }
      else { await a.keyboard.down(k); await a.waitForTimeout(ms); await a.keyboard.up(k); await a.waitForTimeout(60); } } };
    const play = (n) => { const out = []; const ks = ["ArrowRight", "ArrowUp", "ArrowLeft", "x", "ArrowDown", "ArrowRight", "x", "ArrowUp"];
      for (let i = 0; i < n; i++) out.push([ks[i % ks.length], ks[i % ks.length] === "x" ? 80 : 260]); return out; };
    const taps = (n) => Array.from({ length: n }, (_, i) => ["tap", [0.2 + 0.6 * ((i * 0.37) % 1), 0.3 + 0.5 * ((i * 0.61) % 1)]]);
    /* [id, before the clip, during it]: a few presses into play first, then about four seconds of playing */
    const APPS = [
      ["vector-dream", [["x", 80], ["wait", 1500]], [["wait", 1800], ["x", 80], ["wait", 2200]]],
      ["zhenyao-tower", [["x", 80], ["wait", 1200], ["x", 80], ["wait", 1200], ["x", 80], ["wait", 1500]], [["ArrowUp", 1500], ["ArrowLeft", 700], ["ArrowUp", 1500]]],
      ["fake-yu", [["ArrowDown", 80], ["x", 80], ["wait", 800], ["x", 80], ["wait", 4000]], [["wait", 1200], ["x", 80], ["wait", 900], ["x", 80], ["wait", 1500]]],
      ["lao-zhang", [["x", 80], ["wait", 1000], ["x", 80], ["wait", 1200]], [["wait", 900], ["x", 80], ["wait", 1500], ["x", 80], ["wait", 1300]]],
      ["paper-tower", [["x", 80], ["wait", 800], ["x", 80], ["wait", 800], ["x", 80], ["wait", 800]], play(12)],
      ["whack-a-mole", [["tap", [0.5, 0.6]], ["wait", 800], ["tap", [0.5, 0.6]], ["wait", 800]], taps(16)],
      ["shanjiao-diner", [["x", 80], ["wait", 1000], ["x", 80], ["wait", 1000], ["x", 80], ["wait", 1000]], play(12)],
      ["sisyphus", [["x", 80], ["wait", 1200]], [["ArrowRight", 3800]]],
      ["daily-box", [["x", 80], ["wait", 1000]], play(12)],
    ];
    for (const [id, before, during] of APPS) {
      if (ONLY.length && !want("apps") ) continue;
      const [man, html] = await Promise.all([readFile(join(ROOT, "registry/apps", id, "manifest.json"), "utf8"), readFile(join(ROOT, "registry/apps", id, "index.html"), "utf8")]);
      await a.evaluate(([man, html]) => { const x = Object.assign({}, JSON.parse(man), { html }); window.LP.upsert("apps", x); window.LP.runApp(x); }, [man, html]);
      await a.waitForSelector("#v-run:not([hidden])"); await a.waitForTimeout(2000);
      await keys(before);
      await film(a, "app-" + id, () => keys(during));
      await home(a);
    }
    await a.close();
  }
  await browser.close(); server.close();
}

/* ======================================== edit ======================================== */
/* 1080 x 1920 at 30 fps. The phone: the screen (780 x 1688 frames) at 664 x 1436, inside a body drawn once in a page. */
const W = 1080, H = 1920, SX = 208, SY = 120, SW = 664, SH = 1436, BEZ = 16;
const CAPS = {
  en: ["A handheld from 1986 that never existed", "A four-tone camera", "Develop the roll. The prints come out in colour.",
       "Tilt it to play", "A pet that lives in it", "A four-track tape machine", "Look up any word as you read",
       "An app store full of small apps", "Games, stories, even 3D, on a 1986 screen",
       "Runs in your phone’s browser.<br>Make your own apps with AI."],
  zh: ["一台从未存在过的 1986 年掌机", "四色点阵相机", "冲洗胶卷，照片是彩色的", "歪一歪就能玩", "里面住着一只宠物", "四轨录音机",
       "读书时随手查词", "应用商店，装满小应用", "游戏、故事、3D，都在 1986 年的屏幕上",
       "在手机浏览器里运行。<br>用 AI 做你自己的应用。"],
};
/* [clip, from, to, speed, caption]: the screen's shots in order. "grid" is the apps at play, nine at once, full frame. */
const SHOTS = [
  ["boot", 0.4, 1.9, 1, 0],
  ["camera", 1.1, 2.1, 1, 1], ["camera", 4.0, 6.8, 2.8, 1],
  ["darkroom", 1.0, 4.6, 3.6, 2], ["darkroom", 4.8, 6.8, 1, 2],
  ["maze", 0.6, 3.6, 1, 3],
  ["pet", 0.8, 1.8, 1, 4], ["studio", 0.5, 1.5, 1, 5], ["reader", 2.4, 3.4, 1, 6],
  ["store", 0.4, 5.9, 2.2, 7],
  ["grid", 0, 3, 1, 8],
];
const GRID = [["vector-dream", 1.0], ["fake-yu", 0.3], ["zhenyao-tower", 0.3], ["lao-zhang", 0.3], ["whack-a-mole", 0], ["sisyphus", 0.3],
  ["paper-tower", 0.3], ["daily-box", 0.3], ["shanjiao-diner", 0.3]];   /* [app, where its clip starts] */
const END = 2.0;                       /* the end card's seconds */
const SHUTTER = [4.27, 5.40, 5.97, 6.53]; /* the camera clip's shutters (its screen goes dark), for the click */

async function edit() {
  const pw = await loadPlaywright();
  const clips = join(OUT, "clips-" + LANG), work = join(OUT, "work", "edit-" + LANG);
  await mkdir(work, { recursive: true });
  const C = CAPS[LANG];
  const MAZE = opt("maze", "");

  /* the layers, drawn in Chromium with the runtime's own fonts: the background with the phone, its glass, captions, end card */
  const server = await serve(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(base + "/runtime/fonts/none.html");   /* the server's origin, so the fonts load (they need no CORS then) */
  const css = `<link rel="stylesheet" href="${base}/runtime/fonts/fonts.css"><style>
    html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
    .cap{position:absolute;left:60px;right:60px;top:${SY + SH + BEZ + 70}px;text-align:center;color:#d6dcb4;
      font:52px/1.3 "DotGothic16","WenQuanYi Zen Hei Sharp",monospace;letter-spacing:1px}
  </style>`;
  const layer = async (name, html, transparent) => {
    await page.setContent(css + html, { waitUntil: "networkidle" });
    await page.evaluate((t) => Promise.all([document.fonts.load('52px "DotGothic16"', t), document.fonts.load("58px VT323", t)]), html.replace(/<[^>]*>/g, ""));
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
    const f = join(work, name + ".png"); await page.screenshot({ path: f, omitBackground: transparent }); return f;
  };
  const bg = await layer("bg", `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,#3a4628 0%,#1f2a14 55%,#141b0c 100%)"></div>
    <div style="position:absolute;left:${SX - BEZ}px;top:${SY - BEZ}px;width:${SW + 2 * BEZ}px;height:${SH + 2 * BEZ}px;border-radius:84px;background:#0c0d0a;
      box-shadow:0 0 0 3px #3b3d36,0 30px 80px rgba(0,0,0,.6)"></div>`, false);
  const plain = await layer("plain", `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,#3a4628 0%,#1f2a14 55%,#141b0c 100%)"></div>`, false);
  /* the glass: the screen's rounded corners, over the picture */
  const glass = await layer("glass", `<svg width="${W}" height="${H}" style="position:absolute;inset:0"><defs><mask id="m">
      <rect width="${W}" height="${H}" fill="#fff"/><rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" rx="68" fill="#000"/></mask></defs>
      <rect width="${W}" height="${H}" fill="#0c0d0a" mask="url(#m)"/></svg>
`, true);
  const caps = [];
  for (let i = 0; i < C.length - 1; i++) caps.push(await layer("cap" + i, `<div class="cap">${C[i]}</div>`, true));
  const end = await layer("end", `<div style="position:absolute;inset:0;background:#1f2a14;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px;color:#a3ad7e;text-align:center">
      <img src="${base}/runtime/icons/icon-512.png" style="width:300px;height:300px;image-rendering:pixelated;border-radius:56px">
      <div style="font:150px/1 VT323,monospace;color:#d6dcb4;letter-spacing:4px">LO-PDA</div>
      <div style="font:50px/1.4 'DotGothic16','WenQuanYi Zen Hei Sharp',monospace;padding:0 70px">${C.at(-1)}</div>
      <div style="font:58px/1 VT323,monospace;color:#d6dcb4">nowheremanx.github.io/lopda</div></div>`, false);
  await browser.close(); server.close();

  /* the screen: each shot trimmed, sped up where it says, one stream */
  const ins = [], parts = [];
  let t = 0; const times = [];
  SHOTS.forEach(([clip, a, b, sp, cap], k) => {
    const len = (b - a) / sp, outside_maze = !(MAZE && clip === "maze");
    if (clip === "grid") { ins.push("-f", "lavfi", "-i", `color=c=black:s=${SW}x${SH}:r=30:d=${len}`); parts.push(`[${k}:v]setsar=1,format=yuv420p[s${k}]`); }
    else {
      ins.push("-i", join(clips, clip + ".mp4"));
      parts.push(`[${k}:v]trim=${a}:${b},setpts=(PTS-STARTPTS)/${sp},fps=30,scale=${SW}:${SH}:flags=lanczos,setsar=1,format=yuv420p[s${k}]`);
    }
    times.push({ t, len, cap, clip }); t += len;
  });
  const total = t + END;
  const n = SHOTS.length;
  let fc = parts.join(";") + ";" + SHOTS.map((_, k) => `[s${k}]`).join("") + `concat=n=${n}:v=1:a=0[scr];`;
  let idx = n;
  const add = (...a) => { ins.push(...a); return idx++; };
  const iBg = add("-loop", "1", "-t", String(total), "-i", bg);
  const iGlass = add("-loop", "1", "-t", String(total), "-i", glass);
  fc += `[${iBg}:v]fps=30,format=yuv420p[bg];[bg][scr]overlay=${SX}:${SY}:eof_action=pass[v0];[v0][${iGlass}:v]overlay=0:0[v1];`;
  let v = "v1", vn = 2;
  /* the real phone's maze, full frame, over the stand-in */
  if (MAZE) {
    const m = times.find((x) => x.clip === "maze");
    const iM = add("-i", MAZE);
    fc += `[${iM}:v]trim=0:${m.len},setpts=PTS-STARTPTS+${m.t.toFixed(3)}/TB,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30[mz];` +
      `[${v}][mz]overlay=0:0:eof_action=pass:enable='between(t,${m.t.toFixed(3)},${(m.t + m.len).toFixed(3)})'[v${vn}];`; v = "v" + vn++;
  }
  /* the grid: each app's screen (the LCD under its title bar), three by three over the background */
  const g = times.find((x) => x.clip === "grid");
  if (g) {
    /* the app's own area: under the runtime's status line and the app's title bar, above the chin */
    const CX = 26, CY = 256, CWS = 728, CHS = 1000;
    const CW = 330, CH = Math.round(CW * CHS / CWS / 2) * 2, GAP = 15, X0 = (W - 3 * CW - 2 * GAP) / 2, Y0 = Math.round((SY + SH + BEZ + 40 - 3 * CH - 2 * GAP) / 2);
    const iGb = add("-loop", "1", "-t", String(g.len), "-i", plain);
    fc += `[${iGb}:v]fps=30,format=yuv420p[gb0];`;
    GRID.forEach(([id, at], i) => {
      const iA = add("-i", join(clips, "app-" + id + ".mp4"));
      fc += `[${iA}:v]trim=${at}:${at + g.len},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${g.len},trim=0:${g.len},fps=30,` +
        `crop=${CWS}:${CHS}:${CX}:${CY},scale=${CW}:${CH}:flags=lanczos,setsar=1[ga${i}];` +
        `[gb${i}][ga${i}]overlay=${X0 + (i % 3) * (CW + GAP)}:${Y0 + Math.floor(i / 3) * (CH + GAP)}[gb${i + 1}];`;
    });
    fc += `[gb${GRID.length}]setpts=PTS-STARTPTS+${g.t.toFixed(3)}/TB[grid];[${v}][grid]overlay=0:0:eof_action=pass:enable='between(t,${g.t.toFixed(3)},${(g.t + g.len).toFixed(3)})'[v${vn}];`; v = "v" + vn++;
  }
  /* one caption for each run of shots that share it, faded in */
  const runs = [];
  for (const x of times) { const r = runs.at(-1); if (r && r.cap === x.cap) r.len += x.len; else runs.push({ cap: x.cap, t: x.t, len: x.len }); }
  for (const r of runs) {
    const iC = add("-loop", "1", "-t", String(total), "-i", caps[r.cap]);
    fc += `[${iC}:v]format=rgba,fade=in:st=${(r.t + 0.1).toFixed(3)}:d=0.25:alpha=1[c${r.cap}];[${v}][c${r.cap}]overlay=0:0:enable='between(t,${r.t.toFixed(3)},${(r.t + r.len).toFixed(3)})'[v${vn}];`; v = "v" + vn++;
  }
  const iEnd = add("-loop", "1", "-t", String(total), "-i", end);
  fc += `[${iEnd}:v]format=rgba,fade=in:st=${t.toFixed(3)}:d=0.4:alpha=1[e];[${v}][e]overlay=0:0:enable='gte(t,${t.toFixed(3)})',fade=in:st=0:d=0.4,format=yuv420p[vout];`;

  /* the sound: Tape4's tape from its start, out at the end; a short click on each shutter */
  const iMus = add("-i", join(OUT, "music.wav"));
  const cam2 = times[2], clicks = SHUTTER.map((s) => cam2.t + (s - SHOTS[2][1]) / SHOTS[2][3]).filter((s) => s >= cam2.t && s < cam2.t + cam2.len);
  const iClick = add("-f", "lavfi", "-t", "0.05", "-i", "anoisesrc=d=0.05:c=white:a=0.5:r=44100");
  fc += `[${iMus}:a]aresample=44100,atrim=0:${total},afade=out:st=${(total - 1.5).toFixed(2)}:d=1.5,volume=0.9[mus];` +
    `[${iClick}:a]afade=out:st=0:d=0.05,asplit=${clicks.length}${clicks.map((_, i) => `[k${i}]`).join("")};` +
    clicks.map((s, i) => `[k${i}]adelay=${Math.round(s * 1000)}:all=1[kd${i}]`).join(";") + ";" +
    `[mus]${clicks.map((_, i) => `[kd${i}]`).join("")}amix=inputs=${clicks.length + 1}:normalize=0:duration=first[aout]`;

  const file = join(OUT, `lopda-${LANG}.mp4`);
  ff(...ins, "-filter_complex", fc, "-map", "[vout]", "-map", "[aout]", "-t", total.toFixed(3),
    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", file);
  /* stills for a look: the camera, the colour print, the end card */
  const still = (at, name) => ff("-ss", at.toFixed(2), "-i", file, "-frames:v", "1", join(OUT, `still-${LANG}-${name}.png`));
  still(times[4].t + 1.0, "print"); still(times[9].t + 1.5, "store"); still(g.t + 1.5, "grid");
  console.log("wrote", file, total.toFixed(2) + " s");
}

if (MODE === "record") await record();
else await edit();
