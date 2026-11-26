// The launch video's clips: drives the runtime in Chromium at a phone's size and records each scene as frames.
// Needs Playwright (as tools/readme-shots.mjs) and ffmpeg on the PATH. Its work files stay out of the repo. This was the
// first 34 s launch film; the landing page now shows the two promo films in docs/video/ (intro-<lang>, first-app-<lang>).
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
//
// Scenes for the promo films, recorded only when named in --only (the edit for those films lives outside the repo):
//   home-cam, notes2, calendar2   home into the camera and one shot; today's diary with 那年今日; diary corners
//   tuner                         the tuner's dial swept by a finger and stepped back (silent stand-in streams)
//   pet-act                       the pet's Run pack;  ai-add  the AI lines' provider list (refuses if any line is stored)
//   scripts-gen, scripts-revise   Scripts writing (--idea) and revising (--ask) a program over a DeepSeek line; the key
//                                 comes only from the DEEPSEEK_KEY environment variable and never reaches the screen;
//                                 --runonly replays saved programs (--timer, --revised) without the AI; --hold sets how
//                                 long a run is filmed after the dial is let go
//   events, store-new             the events page (each part scrolled to just under the header); the newest app's badge
//                                 (--badge=updated takes the UPDATED badge)
//   studio-tape, studio-bars      Tape4 playing --tape=<song.json> (its WAV exported; --slot starts at a bar); the drums
//                                 and melody pages playing --bars=<n,...> one bar at a time, for cutting in step
// Other flags: --clock=<ISO time> (the fixed clock), --audio (the page's own sound under each clip), --long (grid apps
// played twice as long), --only=app:<id>,... (just those apps).
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
const LONG = args.includes("--long");
/* --clock=<ISO time>: the fixed clock (the English film sets late November so the calendar shows US holidays) */
const CLOCK = opt("clock", "2026-10-22T09:41:00+08:00");
/* --audio: also record what the page plays (the runtime's one AudioContext, tapped where it meets the speakers) and put
   it under each clip, so the edit has the real UI sounds */
const AUDIO = args.includes("--audio");
if (MODE !== "record" && MODE !== "edit") { console.error("usage: launch-video.mjs record|edit <outDir> [--lang=en|zh]"); process.exit(2); }

/* the screen's size in css px, and the scale of the frames */
const VW = 390, VH = 844, DPR = 2;

const T = {
  zh: { camera: "点阵相机", darkroom: "冲洗店", reader: "阅读器", book: "Alice", store: "应用商店", pet: "宠物", studio: "四轨机", tuner: "收音机",
        library: "磁带库", file: "文件", maze: "滚珠迷宫", open: "打开", play: "播放", notes: "记事本", calendar: "万年历", dict: "词典",
        today: "去湖边拍完了一卷胶卷。山上的叶子全红了，正好八张。", earlier: "秋天第一次穿外套。",
        quote: "《论语》\n学而时习之，不亦说乎。#摘抄", todo: "买胶卷\n周六去冲洗店。#待办" },
  en: { camera: "Camera", darkroom: "Darkroom", reader: "Reader", book: "Alice", store: "Store", pet: "Pet", studio: "Tape4", tuner: "Tuner",
        library: "Tape library", file: /^File/, maze: "Marble", open: "Open", play: "Play", notes: "Notes", calendar: "Calendar", dict: "Dict",
        today: "Shot a whole roll by the lake. The hills have gone red, eight frames exactly.", earlier: "First cold morning. Wore a coat.",
        quote: "Alice\u2019s Adventures in Wonderland\n\u201cCuriouser and curiouser!\u201d cried Alice. #quotes", todo: "Buy film\nTake the roll to the darkroom on Saturday. #todo" },
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
  /* the tuner's seeded stations: a quiet WAV stands in for every stream (as tests/e2e-tuner.test.mjs), so a film never
     reaches a broadcaster and never carries one of their programmes; what it hears between stations is the runtime's hiss */
  const quietWav = (() => { const sr = 8000, n = sr * 60, b = Buffer.alloc(44 + n * 2);
    b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32);
    b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40); return b; })();
  await ctx.route(/streamtheworld|radiofrance|radioparadise|nhkworld|myalicdn|akamaized/, (r) => r.fulfill({ status: 200, contentType: "audio/wav", body: quietWav }));
  if (AUDIO) await ctx.addInitScript(() => {
    const connect = AudioNode.prototype.connect, taps = new Map();
    window.__lpRec = { taps };
    AudioNode.prototype.connect = function (target, ...rest) {
      const r = connect.call(this, target, ...rest);
      try { if (target && target === this.context.destination) {
        let d = taps.get(this.context); if (!d) { d = this.context.createMediaStreamDestination(); taps.set(this.context, d); }
        connect.call(this, d); } } catch (e) {}
      return r;
    };
  });
  const recStart = async (p) => p.evaluate(() => {
    if (window.LP && LP.audio) LP.audio();
    const d = window.__lpRec && [...window.__lpRec.taps.values()][0]; if (!d) return false;
    const r = window.__lpRec.rec = new MediaRecorder(d.stream, { mimeType: "audio/webm" }); window.__lpRec.chunks = [];
    r.ondataavailable = (e) => window.__lpRec.chunks.push(e.data); r.start(200); return true;
  }).catch(() => false);
  const recStop = async (p) => p.evaluate(() => new Promise((ok) => {
    const R = window.__lpRec; if (!R || !R.rec) return ok(null);
    R.rec.onstop = () => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.readAsDataURL(new Blob(R.chunks, { type: "audio/webm" })); };
    R.rec.stop();
  })).catch(() => null);

  const newPage = async (q = "") => {
    const p = await ctx.newPage();
    await p.clock.install({ time: new Date(CLOCK) });   /* a weekday morning; time runs */
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
    let cdp = null, t0, t1, recAt = null, rec = null;
    const begin = async () => { if (AUDIO && await recStart(p)) recAt = Date.now() / 1000; };
    const finish = async () => { if (recAt != null) rec = await recStop(p); };
    if (shots) {
      await begin();
      let done = false; t0 = Date.now() / 1000;
      const loop = (async () => { while (!done) { const f = file(), t = Date.now() / 1000;
        await p.screenshot({ path: f, type: "jpeg", quality: 92 }); frames.push({ file: f, t }); } })();
      await act(); t1 = Date.now() / 1000; done = true; await loop; await finish();
    } else {
      cdp = await ctx.newCDPSession(p);
      cdp.on("Page.screencastFrame", async (f) => {
        const out = file();
        frames.push({ file: out, t: f.metadata.timestamp });
        writeFile(out, Buffer.from(f.data, "base64"));
        try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch {}
      });
      await begin();
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: VW * DPR, maxHeight: VH * DPR, everyNthFrame: 1 });
      t0 = Date.now() / 1000; film.t0 = Date.now();
      await act();
      t1 = Date.now() / 1000; await finish();
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
    /* the page's sound under the clip: the recorder started recAt (epoch s), the picture at t0 (the screencast's clock) */
    if (rec) {
      const webm = join(dir, "sound.webm"), tmp = join(dir, "with-sound.mp4"); await writeFile(webm, Buffer.from(rec, "base64"));
      const off = recAt - t0, af = off >= 0 ? `adelay=${Math.round(off * 1000)}:all=1,apad` : `atrim=start=${(-off).toFixed(3)},asetpts=PTS-STARTPTS,apad`;
      ff("-i", join(clips, name + ".mp4"), "-i", webm, "-filter_complex", `[1:a]${af}[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", tmp);
      await rm(join(clips, name + ".mp4")); await writeFile(join(clips, name + ".mp4"), await readFile(tmp));
    }
  }

  /* ---- boot: the first start, the home screen drawing ---- */
  let p = await ctx.newPage();
  await p.clock.install({ time: new Date(CLOCK) });
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
    /* a steady hand: the ball's position is read from the app each step and the phone is tipped toward the next
       point of the path (level 1: down the left side, under the wall, right, then up to the flag), until it clears */
    const app = m.frames().find((f) => f !== m.mainFrame());
    const at = (c, r) => ({ x: c * 8 + 4, y: 16 + r * 8 + 4 });
    const PATH = [at(2, 14), at(14, 14), at(13, 3)];
    await film(m, "maze", async () => {
      await m.waitForTimeout(600);
      let k = 0, t0 = Date.now();
      while (Date.now() - t0 < 9000) {
        const b = await app.evaluate(() => ({ x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, state }));
        if (b.state === "clear") break;
        const w = PATH[k], dx = w.x - b.x, dy = w.y - b.y;
        if (k < PATH.length - 1 && Math.hypot(dx, dy) < 6) { k++; continue; }
        const cl = (v) => Math.max(-0.7, Math.min(0.7, v));
        const ax = cl(dx * 0.03 - b.vx * 0.012), ay = cl(dy * 0.03 - b.vy * 0.012);
        /* gamma 22.5 is x = 0.5; a raised top edge (beta up from the zero) sends the ball down */
        await m.evaluate(([g, be]) => { window.__tilt = { beta: be, gamma: g }; }, [ax * 45, 40 + ay * 45]);
        await m.waitForTimeout(30);
      }
      await m.evaluate(() => { window.__tilt = { beta: 40, gamma: 0 }; });
      await m.waitForTimeout(2000);
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
  /* ---- the pet doing something: its Run play pack (the play icon, the first pack), jumping on A ---- */
  if (ONLY.includes("pet-act")) {
    const q = await newPage("?debug"); await ready(q);
    await tile(q, T.pet);
    await q.waitForFunction(() => window.LOPDA_DEBUG.pet && LOPDA_DEBUG.pet.save());
    await q.evaluate(() => LOPDA_DEBUG.pet.hatch()); await q.waitForTimeout(400);
    await q.evaluate(() => LOPDA_DEBUG.pet.setDay(5)); await q.waitForTimeout(600);
    await q.evaluate(() => LOPDA_DEBUG.pet.gameSeed(7)); await q.waitForTimeout(1500);
    await key(q, "ArrowRight"); await q.waitForTimeout(300);
    await key(q, "x"); await q.waitForTimeout(600);               /* the pack list */
    await key(q, "x"); await q.waitForTimeout(800);               /* Run: its start card */
    await film(q, "pet-act", async () => {
      await q.waitForTimeout(600);
      await key(q, "x"); await q.waitForTimeout(500);             /* the round starts */
      for (let i = 0; i < 9; i++) { await q.keyboard.down("x"); await q.waitForTimeout(i % 3 ? 120 : 260); await q.keyboard.up("x"); await q.waitForTimeout(520); }
      await q.waitForTimeout(800);
    });
    await q.close();
  }
  /* ---- Scripts writing a program with the AI: only with --only=scripts-gen and DEEPSEEK_KEY in the environment.
     The key is written straight into the AI lines document (the shape settings.js keeps, runtime/ailines.js) and never
     shown: the Settings pages are not opened. The answer is kept in <outDir>/wind-up-timer/. ---- */
  if (ONLY.includes("scripts-gen")) {
    const KEY = process.env.DEEPSEEK_KEY;
    if (!KEY) throw new Error("scripts-gen needs DEEPSEEK_KEY in the environment");
    const IDEA = opt("idea", LANG === "zh" ? "一个发条蛋表" : "A wind-up egg timer");
    const q = await newPage(); await ready(q);
    await q.evaluate((k) => LP.S.db.doc("data/users/local/ai").set({ v: 2, next: 2, def: "l1", use: {},
      lines: [{ id: "l1", provider: "deepseek", n: 1, key: k, model: "", visionModel: "", on: true, added: Date.now() }] }), KEY);
    await q.reload({ waitUntil: "load" }); await ready(q);
    await tile(q, LANG === "zh" ? "脚本" : "Scripts"); await q.waitForSelector("#v-scripts:not([hidden])"); await q.waitForTimeout(600);
    await film(q, "scripts-gen", async () => {
      await q.waitForTimeout(500);
      await q.click("#scripts-write"); await q.waitForSelector("#v-script-idea:not([hidden])"); await q.waitForTimeout(500);
      await q.click("#scripts-idea");
      for (const ch of IDEA) { await q.keyboard.type(ch); await q.waitForTimeout(220); }
      await q.waitForTimeout(700);
      await q.click("#idea-copy");                                   /* 生成 */
      await q.waitForSelector("#v-script-edit:not([hidden])");
      await q.waitForFunction(() => !document.getElementById("script-run").disabled && document.getElementById("script-code").value.length > 50,
        null, { timeout: 15 * 60000, polling: 500 });
      await q.waitForTimeout(1500);
    });
    const code = await q.$eval("#script-code", (e) => e.value);
    const dir = join(OUT, "wind-up-timer"); await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(join(dir, "timer-" + stamp + ".html"), code);
    console.log("scripts-gen: " + code.length + " characters, " + join(dir, "timer-" + stamp + ".html"));
    /* the running program is a sandboxed frame: screenshots instead of the screencast */
    await film(q, "scripts-run", async () => {
      await q.click("#script-run"); await q.waitForSelector("#v-run:not([hidden])", { timeout: 10000 }); await q.waitForTimeout(1500);
      const box = await q.locator("#run-frame").boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height * 0.45, r = box.width * 0.25;
      await q.mouse.move(cx + r, cy); await q.mouse.down();
      for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 1.6; await q.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a)); await q.waitForTimeout(25); }
      await q.mouse.up(); await q.waitForTimeout(800);
      await key(q, "ArrowUp", 3, 250); await key(q, "x"); await q.waitForTimeout(3000);
    }, true);
    await q.close();
  }
  /* ---- Scripts revising a program with 改一改: the wind-up timer that scripts-gen wrote (the newest file in
     <outDir>/wind-up-timer/, or --timer=<file>) is put into Scripts, run once as it is, revised with one line, run again.
     Only with --only=scripts-revise and DEEPSEEK_KEY in the environment, as scripts-gen. ---- */
  if (ONLY.includes("scripts-revise")) {
    /* --runonly: no AI at all: run the newest saved timer and its newest revised version (for clips with sound) */
    const RUNONLY = args.includes("--runonly");
    const KEY = process.env.DEEPSEEK_KEY || (RUNONLY ? "" : null);
    if (KEY == null) throw new Error("scripts-revise needs DEEPSEEK_KEY in the environment");
    const { readdirSync } = await import("node:fs");
    const tdir = join(OUT, "wind-up-timer");
    const file = opt("timer", "") || join(tdir, readdirSync(tdir).filter((f) => /^timer-.*\.html$/.test(f)).sort().at(-1));
    const body = await readFile(file, "utf8");
    const ASK = opt("ask", LANG === "zh" ? "数字再大一点" : "Make the numbers bigger");
    const NAME = opt("name", LANG === "zh" ? "发条蛋表" : "Wind-up egg timer");
    const q = await newPage(); await ready(q);
    await q.evaluate(([k, body, name]) => Promise.all([
      LP.S.db.doc("data/users/local/ai").set({ v: 2, next: 2, def: "l1", use: {},
        lines: [{ id: "l1", provider: "deepseek", n: 1, key: k, model: "", visionModel: "", on: true, added: Date.now() }] }),
      LP.S.db.doc("data/users/local/scripts/items/timer").set({ v: 1, id: "timer", name, body, created: Date.now(), updated: Date.now() })]),
      [KEY, body, NAME]);
    await q.reload({ waitUntil: "load" }); await ready(q);
    const openTimer = async () => {
      await tile(q, LANG === "zh" ? "脚本" : "Scripts"); await q.waitForSelector("#v-scripts:not([hidden])"); await q.waitForTimeout(500);
      await q.locator("#scripts-list li", { hasText: NAME }).first().click(); await q.waitForSelector("#v-script-edit:not([hidden])"); await q.waitForTimeout(500);
    };
    const play = async () => {
      const box = await q.locator("#run-frame").boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height * 0.45, r = box.width * 0.25;
      await q.mouse.move(cx + r, cy); await q.mouse.down();
      for (let i = 0; i <= 50; i++) { const a = i / 50 * Math.PI * 1.4; await q.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a)); await q.waitForTimeout(25); }
      await q.mouse.up(); await q.waitForTimeout(+opt("hold", "1800"));   /* --hold: how long the countdown runs after release */
    };
    await openTimer();
    await film(q, "scripts-old", async () => {
      await q.click("#script-run"); await q.waitForSelector("#v-run:not([hidden])", { timeout: 10000 }); await q.waitForTimeout(1200);
      await play();
    }, true);
    if (RUNONLY) {
      const rfile = opt("revised", "") || join(tdir, readdirSync(tdir).filter((f) => /^revised-.*\.html$/.test(f)).sort().at(-1));
      await home(q);
      await q.evaluate(([body, name]) => LP.S.db.doc("data/users/local/scripts/items/timer").set({ v: 1, id: "timer", name, body, created: Date.now(), updated: Date.now() }), [await readFile(rfile, "utf8"), NAME]);
      await q.reload({ waitUntil: "load" }); await ready(q); await openTimer();
      await film(q, "scripts-revised", async () => {
        await q.click("#script-run"); await q.waitForSelector("#v-run:not([hidden])", { timeout: 10000 }); await q.waitForTimeout(1200);
        await play();
      }, true);
      await q.close();
    } else {
    await home(q); await openTimer();
    const t0 = Date.now();
    await film(q, "scripts-revise", async () => {
      await q.waitForTimeout(600);
      await q.click("#script-paste");                               /* 改一改 */
      await q.waitForSelector("#v-script-revise:not([hidden])"); await q.waitForTimeout(500);
      await q.click("#revise-ask");
      for (const ch of ASK) { await q.keyboard.type(ch); await q.waitForTimeout(220); }
      await q.waitForTimeout(600);
      await q.click("#revise-go");                                  /* 改 */
      await q.waitForSelector("#v-script-edit:not([hidden])");
      await q.waitForFunction(() => !document.getElementById("script-run").disabled && /改好了|Revised|Done|不满意|not happy/.test(document.getElementById("script-hint").textContent),
        null, { timeout: 15 * 60000, polling: 500 });
      await q.waitForTimeout(1500);
    });
    const hint = await q.$eval("#script-hint", (e) => e.textContent);
    const code = await q.$eval("#script-code", (e) => e.value);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeFile(join(tdir, "revised-" + stamp + ".html"), code);
    console.log("scripts-revise: " + ((Date.now() - t0) / 1000).toFixed(0) + " s, " + code.length + " characters; " + hint.split("\n")[0]);
    await film(q, "scripts-revised", async () => {
      await q.click("#script-run"); await q.waitForSelector("#v-run:not([hidden])", { timeout: 10000 }); await q.waitForTimeout(1200);
      await play();
    }, true);
    await q.close();
    }
  }
  /* ---- the events page at a phone's width: the list, the first event, its two ways (their little screens typing), the cards ---- */
  if (ONLY.includes("events")) {
    const q = await ctx.newPage();
    await q.addInitScript((l) => { try { localStorage.setItem("lopda-landing-lang", l); } catch (e) {} }, LANG);
    await q.goto(base + "/events/", { waitUntil: "networkidle" }); await q.waitForTimeout(800);
    const glide = async (dy, ms) => { const n = Math.max(1, Math.round(ms / 30)); for (let i = 0; i < n; i++) { await q.mouse.wheel(0, dy / n); await q.waitForTimeout(30); } };
    /* scroll an element (or the section that holds it) to just under the site's header, so the frame starts inside that
       section and no strip of the section above shows (owner, 2026-11-23); off > 0 places it that far lower */
    const to = async (sel, ms, off = 0, section = false) => { const y = await q.evaluate(([s, o, sec]) => { let e = document.querySelector(s); if (e && sec) e = e.closest("section") || e;
      const nav = document.querySelector("nav"), top = nav ? nav.getBoundingClientRect().bottom : 0; return e ? e.getBoundingClientRect().top - top - o : 0; }, [sel, off, section]); await glide(y, ms); };
    await q.mouse.move(VW / 2, VH / 2);
    await film(q, "events", async () => {
      await q.waitForTimeout(900);
      await q.locator("a.ev").first().click(); await q.waitForTimeout(1200);
      await to("#way-phone", 900); await q.waitForTimeout(2600);
      await to("#way-phone .screen", 600, 110); await q.waitForTimeout(800);
      await to(".way:not(#way-phone)", 900); await q.waitForTimeout(2400);
      await to(".card", 900, 0, true); await q.waitForTimeout(600);
      await glide(2200, 2600); await q.waitForTimeout(500);
    });
    await q.close();
  }
  /* ---- the store's newest app with its NEW badge: a page on the real date (the badge lasts seven days from the
     index's released date), scrolled to the first badged entry ---- */
  if (ONLY.includes("store-new")) {
    const q = await ctx.newPage(); await q.goto(base + "/runtime/", { waitUntil: "load" }); await ready(q);
    await tile(q, T.store);
    await q.waitForSelector("#store-list .store-item", { timeout: 10000 }); await q.waitForLoadState("networkidle"); await q.waitForTimeout(800);
    /* --badge=updated looks for the UPDATED badge instead, for a week when no app is new */
    const NEW = opt("badge", "") === "updated" ? (LANG === "zh" ? "更新" : "UPDATED") : (LANG === "zh" ? "新" : "NEW");
    const y = await q.evaluate((n) => { const b = [...document.querySelectorAll("#store-list .store-badge")].find((e) => e.textContent === n);
      return b ? b.closest(".store-item").getBoundingClientRect().top - 220 : null; }, NEW);
    if (y == null) throw new Error("store-new: no app has the " + NEW + " badge today");
    await q.mouse.move(VW / 2, VH * 0.4);
    await film(q, "store-new", async () => {
      await q.waitForTimeout(500);
      const n = 60; for (let i = 0; i < n; i++) { await q.mouse.wheel(0, y / n); await q.waitForTimeout(30); }
      await q.waitForTimeout(2200);
    });
    await q.close();
  }
  /* ---- film 1 v2's opening: the home screen, the eight keys pressed in turn (their drawn caps light), a pause, then a tap
     on the camera's tile straight into the viewfinder (a roll already loaded) and one shot. The tile's box is printed
     so the edit can draw the fingertip where the tap really was. ---- */
  if (ONLY.includes("home-cam")) {
    const q = await newPage("?debug"); await ready(q);
    await tile(q, T.camera);
    await q.waitForSelector("#cam-load:not([hidden])"); await q.waitForTimeout(500);
    await q.click("#roll-count"); await q.click("#roll-count"); await q.click("#roll-go");
    await q.waitForSelector("#cam-live-tag:not([hidden])", { timeout: 10000 }); await q.waitForTimeout(800);
    await home(q); await q.waitForTimeout(1200);
    const box = await q.locator("#home .app", { has: q.locator(".label", { hasText: new RegExp("^" + T.camera + "$") }) }).boundingBox();
    console.log("home-cam: camera tile", JSON.stringify(box));
    await film(q, "home-cam", async () => {
      await q.waitForTimeout(1600);
      for (const b of ["up", "right", "down", "left", "b", "a", "select", "start"]) {
        await q.evaluate((b) => LOPDA_DEBUG.setButton(b, true), b); await q.waitForTimeout(260);
        await q.evaluate((b) => LOPDA_DEBUG.setButton(b, false), b); await q.waitForTimeout(140);
      }
      await q.waitForTimeout(5200);
      const t = Date.now(); await q.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      console.log("home-cam: tap at", ((t - film.t0) / 1000).toFixed(2), "s");
      await q.waitForSelector("#cam-live-tag:not([hidden])", { timeout: 10000 }); await q.waitForTimeout(2600);
      await q.click("#cam-shutter");
      await q.waitForFunction(() => document.getElementById("cam-shut").hidden, null, { timeout: 3000 });
      await q.waitForTimeout(1800);
    });
    await q.close();
  }
  /* ---- notes and calendar for film 1 v2: diaries on today, a year and two years ago (那年今日) and a few October days
     (the calendar's folded corners) ---- */
  if (ONLY.includes("notes2") || ONLY.includes("calendar2")) {
    const q = await newPage(); await ready(q);
    const YEARS = LANG === "zh" ? ["去年今天，第一次自己冲胶卷，八张里糊了五张。", "前年今天，在旧货市场看见一台掌机，没舍得买。"] : ["A year ago today: my first roll, five of eight blurred.", "Two years ago: saw an old handheld at the flea market. Didn't buy it."];
    const MORE = LANG === "zh" ? ["重阳，爬了一趟山。", "下雨，在家读完一本书。"] : ["Climbed the hill.", "Rain. Finished a book at home."];
    await q.evaluate(([T, YEARS, MORE]) => {
      const now = Date.now(), d = (n) => now - n * 864e5, day = (n) => new Date(d(n) + 8 * 36e5).toISOString().slice(0, 10);
      const title = (k) => LopdaNoteText.diaryTitle(k, LP.I18N.lang, LP.tr, window.LopdaLunar);
      const notes = LP.S.refs.notes;
      const diary = (n, text) => notes.doc().set({ body: title(day(n)) + "\n" + text, day: day(n), created: d(n), updated: d(n) });
      diary(0, T.today); diary(365, YEARS[0]); diary(730, YEARS[1]);
      diary(4, T.earlier); diary(9, MORE[0]); diary(15, MORE[1]);
      notes.doc().set({ body: T.quote, src: "reader", created: d(2), updated: d(2) });
      notes.doc().set({ body: T.todo, created: d(1), updated: d(1) });
    }, [T, YEARS, MORE]);
    await q.evaluate(() => LP.refresh("notes")); await q.waitForTimeout(500);
    if (ONLY.includes("notes2")) {
      await tile(q, T.notes); await q.waitForTimeout(900);
      await film(q, "notes2", async () => { await q.waitForTimeout(1400); await key(q, "x"); await q.waitForTimeout(4200); });
      await home(q);
    }
    if (ONLY.includes("calendar2")) {
      await tile(q, T.calendar); await q.locator("#v-cal:not([hidden])").waitFor(); await q.waitForTimeout(800);
      await film(q, "calendar2", async () => { await q.waitForTimeout(2600); await key(q, "ArrowLeft", 4, 320); await q.waitForTimeout(700); await key(q, "x"); await q.waitForTimeout(2800); });
      await home(q);
    }
    await q.close();
  }
  /* ---- Tape4 playing a given tape (--tape=<song.json>, a LopdaSong document): put into the library as the current
     tape, exported as <outDir>/<name>.wav through the machine's own WAV export, then played on the song screen ---- */
  if (ONLY.includes("studio-tape")) {
    const file = opt("tape", ""); if (!file) throw new Error("studio-tape needs --tape=<song.json>");
    const song = JSON.parse(await readFile(file, "utf8"));
    const q = await newPage(); await ready(q);
    await q.evaluate((song) => Promise.all([
      LP.S.db.doc("data/users/local/studio/items/filmtape").set(song),
      LP.S.db.doc("data/users/local/studio").set({ current: "filmtape", toured: { drums: true, bass: true, chords: true, melody: true, song: true, mixer: true }, hushTip: true })]), song);
    await q.reload({ waitUntil: "load" }); await ready(q);
    await tile(q, T.studio); await q.waitForSelector("#v-studio:not([hidden])"); await q.waitForTimeout(1000);
    const skipTour = async () => { const b = q.locator("#v-studio .st-tour-box button:visible", { hasText: /Skip|跳过/ }); if (await b.count()) { await b.first().click(); await q.waitForTimeout(300); } };
    await skipTour();
    await q.click("#studio-menu"); await q.waitForTimeout(300);
    await q.locator("#studio-sheet li", { hasText: T.file }).first().click(); await q.waitForTimeout(300);
    const [d] = await Promise.all([q.waitForEvent("download", { timeout: 180000 }), q.locator("#studio-sheet li", { hasText: /WAV/ }).first().click()]);
    const wav = resolve(file).replace(/\.json$/, "") + ".wav"; await d.saveAs(wav); console.log("studio-tape:", wav);
    await q.waitForFunction(() => document.getElementById("toast").hidden, null, { timeout: 15000 }).catch(() => {}); await q.waitForTimeout(500);
    /* --slot=<n>: start the chain at bar n (1-based): the song screen's play key starts from the selected slot, so the picture can match the
       bar the film's soundtrack is at; otherwise from the top */
    const slot = +opt("slot", "0");
    for (const scr of opt("screens", "song,drums").split(",")) {
      await q.click(`#studio-screens .st-scr[data-screen="${scr}"]`); await q.waitForTimeout(400); await skipTour();
      if (slot > 0 && scr === "song") {
        await q.locator("#studio-chain > *").nth(slot - 1).click(); await q.waitForTimeout(400);
        if (await q.locator("#studio-sheet:not([hidden])").count()) { await key(q, "z"); await q.waitForTimeout(300); }
        await q.click("#studio-play"); await q.waitForTimeout(200);
      } else { await q.click("#studio-play"); await q.waitForTimeout(400); }
      await film(q, "studio-" + scr, async () => { await q.waitForTimeout(7000); });
      await q.click("#studio-play"); await q.waitForTimeout(500);
    }
    await q.close();
  }
  /* ---- Tape4 bar by bar: for each --bars=<n,...> (1-based chain slots of --tape=<song.json>), the drums page and the
     melody page playing that bar's own pattern from its first step, so the edit can cut them in at the moment the
     soundtrack plays that bar. Clips studio-<--tag>-<drums|melody>-b<n>; the pattern starts about 0.4 s in. ---- */
  if (ONLY.includes("studio-bars")) {
    const file = opt("tape", ""), tag = opt("tag", "tape"), bars = opt("bars", "").split(",").filter(Boolean).map(Number);
    if (!file || !bars.length) throw new Error("studio-bars needs --tape and --bars");
    const song = JSON.parse(await readFile(file, "utf8"));
    const q = await newPage(); await ready(q);
    await q.evaluate((song) => Promise.all([
      LP.S.db.doc("data/users/local/studio/items/filmtape").set(song),
      LP.S.db.doc("data/users/local/studio").set({ current: "filmtape", toured: { drums: true, bass: true, chords: true, melody: true, song: true, mixer: true }, hushTip: true })]), song);
    await q.reload({ waitUntil: "load" }); await ready(q);
    await tile(q, T.studio); await q.waitForSelector("#v-studio:not([hidden])"); await q.waitForTimeout(1000);
    const skipTour = async () => { const b = q.locator("#v-studio .st-tour-box button:visible", { hasText: /Skip|跳过/ }); if (await b.count()) { await b.first().click(); await q.waitForTimeout(300); } };
    await skipTour();
    for (const n of bars) {
      const pat = song.song[n - 1];
      for (const scr of ["drums", "melody"]) {
        await q.click("#studio-pat"); await q.waitForTimeout(300);
        await q.click(`#studio-sheet .st-pat-btn[data-pat="${pat}"]`); await q.waitForTimeout(300);
        await q.click(`#studio-screens .st-scr[data-screen="${scr}"]`); await q.waitForTimeout(400); await skipTour();
        await film(q, `studio-${tag}-${scr}-b${n}`, async () => {
          await q.waitForTimeout(400); await q.click("#studio-play");   /* the drums / melody page plays its pattern */
          await q.waitForTimeout(2800);
        });
        await q.click("#studio-play"); await q.waitForTimeout(400);
      }
    }
    await q.close();
  }
  /* ---- the AI lines' provider list (Settings -> AI lines -> Add a line), for "bring a key from any of these". Only in a
     fresh profile: the run refuses to film if any line (any key) is stored. The shot ends with a finger pressing on
     DeepSeek and stops before the press lands, so no key page or key field is ever opened. ---- */
  if (ONLY.includes("ai-add")) {
    const q = await newPage(); await ready(q);
    const lines = await q.evaluate(() => LP.S.db.doc("data/users/local/ai").get().then((s) => (s.exists && Array.isArray(s.data().lines) ? s.data().lines.length : 0)));
    if (lines) throw new Error("ai-add: this profile has AI lines stored; it only runs in a fresh one");
    await tile(q, LANG === "zh" ? "设置" : "Settings"); await q.waitForTimeout(700);
    await film(q, "ai-add", async () => {
      await q.waitForTimeout(500);
      await q.click("#set-ai-open"); await q.waitForSelector("#set-ai-main:not([hidden])"); await q.waitForTimeout(700);
      await q.click("#set-ai-add-open"); await q.waitForSelector("#set-ai-providers li"); await q.waitForTimeout(2200);
      const b = await q.locator('#set-ai-providers li[data-provider="deepseek"]').boundingBox();
      await q.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await q.mouse.down(); await q.waitForTimeout(350);
    });
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
  /* ---- the tuner: switched on at the first station, then a finger sweeps the dial through the hiss and lets go on
     the third; LEFT steps back one (NHK is HLS, which the stand-in WAV cannot play) (recorded only when named: tuner) ---- */
  if (ONLY.includes("tuner")) {
    const q = await newPage("?debug"); await ready(q);
    await tile(q, T.tuner);
    await q.waitForFunction(() => window.LOPDA_DEBUG.tuner && LOPDA_DEBUG.tuner.T.loaded && document.querySelectorAll("#tn-scale .tn-mark").length > 0);
    const press = (b) => q.evaluate((x) => { LOPDA_DEBUG.setButton(x, true); LOPDA_DEBUG.setButton(x, false); }, b);
    await press("a");
    await q.waitForFunction(() => LOPDA_DEBUG.tuner.E.state === "playing", null, { timeout: 15000 }); await q.waitForTimeout(600);
    await film(q, "tuner", async () => {
      const on = (n) => q.waitForFunction((n) => LOPDA_DEBUG.tuner.E.state === "playing" && LOPDA_DEBUG.tuner.E.st && LOPDA_DEBUG.tuner.E.st.name !== n, n, { timeout: 15000 });
      const name = () => q.evaluate(() => LOPDA_DEBUG.tuner.E.st && LOPDA_DEBUG.tuner.E.st.name);
      let was = await name();
      await q.waitForTimeout(700);
      const box = await q.locator("#tn-dial").boundingBox(), y = box.y + box.height * 0.6;
      await q.mouse.move(box.x + box.width * 0.7, y); await q.mouse.down();
      for (let i = 1; i <= 40; i++) { await q.mouse.move(box.x + box.width * (0.7 - 0.45 * i / 40), y); await q.waitForTimeout(35); }
      await q.mouse.up();
      await on(was); await q.waitForTimeout(1600);
      was = await name(); await press("left"); await on(was); await q.waitForTimeout(1600);
    });
    await press("a"); await q.close();
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
  /* ---- notes, calendar and dictionary: a few days of diary seeded first, as tools/readme-shots.mjs does ---- */
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
    await home(p); await tile(p, T.notes); await p.waitForTimeout(800);
    await film(p, "notes", async () => { await p.waitForTimeout(1200); await key(p, "x"); await p.waitForTimeout(2200); });
    await home(p);
  }
  if (want("calendar")) {
    await home(p); await tile(p, T.calendar); await p.locator("#v-cal:not([hidden])").waitFor(); await p.waitForTimeout(800);
    await film(p, "calendar", async () => { await p.waitForTimeout(900); await key(p, "ArrowLeft", 4, 280); await p.waitForTimeout(400); await key(p, "x"); await p.waitForTimeout(2000); });
    await home(p);
  }
  if (want("dict")) {
    await home(p); await tile(p, T.dict); await p.waitForTimeout(800);
    await film(p, "dict", async () => {
      await p.waitForTimeout(400); await p.click("#dict-q");
      for (const ch of "lantern") { await p.keyboard.type(ch); await p.waitForTimeout(140); }
      await p.waitForTimeout(500); await p.keyboard.press("Enter"); await p.waitForTimeout(2500);
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
  const pick = ONLY.filter((o) => o.startsWith("app:"));   /* --only=app:<id>,... films just those */
  if (want("apps") || pick.length) {
    const a = await ctx.newPage(); await a.goto(base + "/runtime/", { waitUntil: "load" }); await ready(a);
    const keys = async (list) => { for (const [k, ms] of list) { if (k === "wait") await a.waitForTimeout(ms);
      else if (k === "fn") await ms(a.frameLocator("#run-frame"));
      else if (k === "drag") { const box = await a.locator("#run-frame").boundingBox(), pt = ([x, y]) => [box.x + box.width * x, box.y + box.height * y];
        await a.mouse.move(...pt(ms[0])); await a.mouse.down();
        for (let i = 1; i < ms.length; i++) { const [x0, y0] = pt(ms[i - 1]), [x1, y1] = pt(ms[i]); for (let j = 1; j <= 20; j++) { await a.mouse.move(x0 + (x1 - x0) * j / 20, y0 + (y1 - y0) * j / 20); await a.waitForTimeout(25); } }
        await a.mouse.up(); }
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
      /* one tap at a time: each tap draws its own hammer for 260 ms, so quick taps show several hammers at once */
      ["whack-a-mole", [["fn", (f) => f.locator("#btns button").first().click()], ["wait", 900]], taps(9).flatMap((x) => [x, ["wait", 330]])],
      ["shanjiao-diner", [["x", 80], ["wait", 1000], ["x", 80], ["wait", 1000], ["x", 80], ["wait", 1000]], play(12)],
      /* Sisyphus pushes while A is held (not the D-pad) */
      ["sisyphus", [["x", 80], ["wait", 1200]], [["x", 3800]]],
      ["daily-box", [["x", 80], ["wait", 1000]], play(12)],
      ["rain-station", [["x", 80], ["wait", 800], ["x", 80], ["wait", 2500]], [["wait", 1200], ["x", 80], ["wait", 1500], ["x", 80], ["wait", 800]]],
      /* Gomoku is touch only: START, then a few points of the 15 x 15 board; the computer answers each one */
      ["gomoku", [["fn", (f) => f.locator("#st").click()], ["wait", 800]], [["fn", async (f) => {
        const box = await f.locator("#c").boundingBox(), cell = box.width / 15;
        for (const [x, y] of [[7, 7], [8, 6], [6, 8]]) { await a.mouse.click(box.x + (x + 0.5) * cell, box.y + (y + 0.5) * cell); await a.waitForTimeout(1200); }
      }]]],
      ["klotski", [["x", 80], ["wait", 1000]], play(12)],
      ["crossing", [["x", 80], ["wait", 1200]], [["x", 80], ["wait", 600], ...play(8)]],
      ["kana-cards", [["x", 80], ["wait", 1000]], [["x", 80], ["wait", 900], ["ArrowRight", 80], ["wait", 900], ["x", 80], ["wait", 900], ["ArrowRight", 80], ["wait", 800]]],
      /* Paint: a little handheld drawn stroke by stroke on the 96 x 96 canvas with the bold pen (original drawing):
         the body, its screen, a smile on the screen, the cross, two round keys */
      ["paint", [["fn", (f) => f.locator("#size").click()], ["wait", 400]], [["fn", async (f) => {
        const box = await f.locator("#cv").boundingBox(), at = ([x, y]) => [box.x + box.width * x / 96, box.y + box.height * y / 96];
        const ring = (cx, cy, r, n = 10) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(2 * Math.PI * i / n), cy + r * Math.sin(2 * Math.PI * i / n)]);
        const strokes = [
          [[30, 12], [66, 12], [66, 84], [30, 84], [30, 12]],      /* body */
          [[36, 18], [60, 18], [60, 42], [36, 42], [36, 18]],      /* screen */
          [[42, 32], [45, 35], [51, 35], [54, 32]],                /* a smile on it */
          [[35, 60], [47, 60]], [[41, 54], [41, 66]],              /* the cross */
          ring(55, 64, 3, 8), ring(61, 56, 3, 8),                  /* two keys */
        ];
        for (const st of strokes) {
          await a.mouse.move(...at(st[0])); await a.mouse.down();
          for (let i = 1; i < st.length; i++) { const [x0, y0] = st[i - 1], [x1, y1] = st[i], n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3));
            for (let j = 1; j <= n; j++) { await a.mouse.move(...at([x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n])); await a.waitForTimeout(22); } }
          await a.mouse.up(); await a.waitForTimeout(220);
        }
      }], ["wait", 900]]],
      ["sound-board", [["wait", 300]], [["x", 80], ["wait", 700], ["ArrowDown", 80], ["x", 80], ["wait", 700], ["ArrowDown", 80], ["x", 80], ["wait", 700], ["ArrowDown", 80], ["x", 80], ["wait", 700]]],
      ["daily-slip", [["x", 80], ["wait", 1200]], play(10)],
      /* Save book: two tallies named first (the name field, then the handheld's A: the app's own 新增 button is a form
         submit, which the sandbox blocks), then counted up by tapping them */
      ["save-book", [["fn", async (f) => { for (const n of (LANG === "zh" ? ["喝水", "练琴"] : ["Water", "Piano"])) {
          await f.locator("#name").fill(n); await f.locator("#name").focus();
          const bx = await a.locator('.gamepad [data-b="a"]').boundingBox(); await a.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await a.waitForTimeout(400); } }], ["wait", 500]],
        [["fn", async (f) => { const rows = f.locator("#list > *"); for (const k of [0, 0, 1, 0, 1, 1, 0, 1, 0]) { await rows.nth(k).click({ position: { x: 40, y: 12 } }); await a.waitForTimeout(420); } }]]],
      /* the marble maze pushed with the D-pad, as a player without tilt would (no autopilot) */
      ["tilt-maze", [["x", 80], ["wait", 900], ["z", 80], ["wait", 700]],   /* B: "Don't allow" tilt, the D-pad then */ [["ArrowDown", 900], ["ArrowRight", 700], ["ArrowDown", 500], ["ArrowRight", 900], ["ArrowUp", 600], ["ArrowRight", 500]]],
      /* Photo puzzle with a built-in picture (no camera): pick one, then slide tiles */
      ["photo-puzzle", [["x", 80], ["wait", 900], ["x", 80], ["wait", 900], ["x", 80], ["wait", 900]], play(14)],
      /* Candles: hold A to blow (no microphone needed) */
      ["blow-candles", [["x", 80], ["wait", 900], ["x", 80], ["wait", 700]], [["x", 1400], ["wait", 500], ["x", 1200], ["wait", 500], ["x", 1000], ["wait", 400]]],
      ["calculator", [["wait", 300]], [["tap", [0.15, 0.62]], ["wait", 250], ["tap", [0.4, 0.62]], ["wait", 250], ["tap", [0.65, 0.75]], ["wait", 250], ["tap", [0.15, 0.75]], ["wait", 250], ["tap", [0.88, 0.88]], ["wait", 1500]]],
    ];
    /* what the second half of a --long clip plays where repeating the first would not look like play */
    const LONG_EXTRA = {
      paint: [["wait", 600]],   /* the picture is finished: it stays */
      gomoku: [["fn", async (f) => {
        const box = await f.locator("#c").boundingBox(), cell = box.width / 15;
        for (const [x, y] of [[5, 9], [9, 5], [8, 8]]) { await a.mouse.click(box.x + (x + 0.5) * cell, box.y + (y + 0.5) * cell); await a.waitForTimeout(1200); }
      }]],
    };
    for (const [id, before, during] of APPS) {
      if (pick.length && !pick.includes("app:" + id)) continue;
      /* the developer examples (sound-board, save-book) left the store for sdk/examples */
      const dir = existsSync(join(ROOT, "registry/apps", id)) ? join(ROOT, "registry/apps", id) : join(ROOT, "sdk/examples", id);
      const [man, html] = await Promise.all([readFile(join(dir, "manifest.json"), "utf8"), readFile(join(dir, "index.html"), "utf8")]);
      await a.evaluate(([man, html]) => { const x = Object.assign({}, JSON.parse(man), { html }); window.LP.upsert("apps", x); window.LP.runApp(x); }, [man, html]);
      await a.waitForSelector("#v-run:not([hidden])"); await a.waitForTimeout(2000);
      await keys(before);
      /* --long: the playing part twice over, for a grid that stays on screen longer (clips named app-<id>-long) */
      await film(a, "app-" + id + (LONG ? "-long" : ""), async () => { await keys(during); if (LONG) await keys(LONG_EXTRA[id] || during); });
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
       "A diary that opens on today", "A lunar calendar, with your diary in it", "An English-Chinese dictionary, built in",
       "Look up any word as you read", "A pet that lives in it", "A four-track tape machine",
       "An app store full of small apps", "Games, stories, even 3D, on a 1986 screen",
       "Runs in your phone’s browser.<br>Make your own apps with AI."],
  zh: ["一台从未存在过的 1986 年掌机", "四色点阵相机", "冲洗胶卷，照片是彩色的",
       "记事本，打开就是今天的日记", "万年历，农历节气，还有你的日记", "内置英汉词典",
       "读书时随手查词", "里面住着一只宠物", "四轨录音机",
       "应用商店，装满小应用", "游戏、故事、3D，都在 1986 年的屏幕上",
       "在手机浏览器里运行。<br>用 AI 做你自己的应用。"],
};
/* [clip, from, to, speed, caption, grid]: the screen's shots in order. "grid" is apps at play, nine at once, full frame. */
const SHOTS = [
  ["boot", 0.4, 2.4, 1, 0],
  ["camera", 1.5, 3.0, 1, 1], ["camera", 4.0, 5.0, 1, 1],
  ["darkroom", 1.0, 4.6, 3.6, 2], ["darkroom", 4.8, 6.8, 1, 2],
  ["notes", 0.6, 3.2, 1, 3], ["calendar", 0.6, 4.0, 1.4, 4], ["dict", 0.3, 3.8, 1.4, 5],
  ["reader", 1.4, 3.6, 1, 6], ["pet", 1.0, 3.0, 1, 7], ["studio", 0.4, 2.4, 1, 8],
  ["store", 0.4, 6.3, 1.5, 9],
  ["grid", 0, 3, 1, 10, 0], ["grid", 0, 3, 1, 10, 1],
];
/* the grids: [app, where its clip starts] */
const GRIDS = [
  [["vector-dream", 1.0], ["fake-yu", 0.3], ["zhenyao-tower", 0.3], ["lao-zhang", 0.3], ["whack-a-mole", 0], ["sisyphus", 0.3],
   ["paper-tower", 0.3], ["daily-box", 0.3], ["shanjiao-diner", 0.3]],
  [["rain-station", 0.3], ["gomoku", 0.3], ["klotski", 0.3], ["crossing", 0.3], ["kana-cards", 0.3], ["paint", 0.3],
   ["sound-board", 0.3], ["daily-slip", 0.3], ["calculator", 0.3]],
];
const END = 3.0;                       /* the end card's seconds */
const SHUTTER = [4.27, 5.40, 5.97, 6.53, 7.07, 7.63]; /* the camera clip's shutters (its screen goes dark), for the click */

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
      parts.push(`[${k}:v]trim=${a}:${b},setpts=(PTS-STARTPTS)/${sp},tpad=stop_mode=clone:stop_duration=${len},trim=0:${len},fps=30,scale=${SW}:${SH}:flags=lanczos,setsar=1,format=yuv420p[s${k}]`);
    }
    times.push({ t, len, cap, clip, k }); t += len;
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
  const grids = times.filter((x) => x.clip === "grid");
  grids.forEach((g, n) => {
    const GRID = GRIDS[SHOTS[g.k][5]], q = "g" + n + "_";
    /* the app's own area: under the runtime's status line and the app's title bar, above the chin */
    const CX = 26, CY = 256, CWS = 728, CHS = 1000;
    const CW = 330, CH = Math.round(CW * CHS / CWS / 2) * 2, GAP = 15, X0 = (W - 3 * CW - 2 * GAP) / 2, Y0 = Math.round((SY + SH + BEZ + 40 - 3 * CH - 2 * GAP) / 2);
    const iGb = add("-loop", "1", "-t", String(g.len), "-i", plain);
    fc += `[${iGb}:v]fps=30,format=yuv420p[${q}b0];`;
    GRID.forEach(([id, at], i) => {
      const iA = add("-i", join(clips, "app-" + id + ".mp4"));
      fc += `[${iA}:v]trim=${at}:${at + g.len},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${g.len},trim=0:${g.len},fps=30,` +
        `crop=${CWS}:${CHS}:${CX}:${CY},scale=${CW}:${CH}:flags=lanczos,setsar=1[${q}a${i}];` +
        `[${q}b${i}][${q}a${i}]overlay=${X0 + (i % 3) * (CW + GAP)}:${Y0 + Math.floor(i / 3) * (CH + GAP)}[${q}b${i + 1}];`;
    });
    fc += `[${q}b${GRID.length}]setpts=PTS-STARTPTS+${g.t.toFixed(3)}/TB[${q}g];[${v}][${q}g]overlay=0:0:eof_action=pass:enable='between(t,${g.t.toFixed(3)},${(g.t + g.len).toFixed(3)})'[v${vn}];`; v = "v" + vn++;
  });
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
  const clicks = [];
  SHOTS.forEach(([clip, a, b, sp], k) => { if (clip === "camera") for (const x of SHUTTER) if (x >= a && x < b) clicks.push(times[k].t + (x - a) / sp); });
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
  const at = (c) => times.find((x) => x.clip === c);
  still(at("darkroom").t + 2.0, "print"); still(at("calendar").t + 1.5, "calendar"); still(grids[1].t + 1.5, "grid");
  console.log("wrote", file, total.toFixed(2) + " s");
}

if (MODE === "record") await record();
else await edit();
