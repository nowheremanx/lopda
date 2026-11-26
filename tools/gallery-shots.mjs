// The gallery's pictures: for each app in gallery/gallery.js, a short silent loop and a few stills of the app's own
// screen, filmed in the runtime in Chromium. Needs Playwright (npm i --no-save playwright) and ffmpeg on the PATH.
//
//   node tools/gallery-shots.mjs [--only=<id>,<id>] [--lang=en|zh] [--gif]
//
// Writes gallery/media/<id>/<lang>.mp4 (the loop), <lang>-1.png, <lang>-2.png... (the stills, the first is the cover).
// Both languages unless --lang says one: the apps draw their own text in the player's language.
// --gif also writes <lang>.gif into the work folder (for a forum post; GIFs stay out of the repo, they are ten times larger).
//
// How it films: the app is started the way the store starts it (LP.runApp, as tools/launch-video.mjs), the scene's
// "setup" steps run, then screenshots of the app's frame are taken in a loop while the "clip" steps run. Each frame keeps
// the time it was taken, so the loop plays at the speed the app ran. The frame is sandboxed: the DevTools screencast
// stops drawing it, so this is screenshots, not a screencast.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import { join, extname, normalize, resolve, dirname, delimiter } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".ttf": "font/ttf" };
const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { stdio: "inherit" });

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith("--" + k + "=")); return a ? a.slice(k.length + 3) : d; };
const ONLY = opt("only", "").split(",").filter(Boolean);
const LANGS = opt("lang", "") ? [opt("lang", "")] : ["en", "zh"];
const GIF = args.includes("--gif");
/* a phone's screen; the app's frame comes out about 390 x 470 css px, filmed at 2x */
const VW = 390, VH = 844, DPR = 2;

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

/* gallery.js is a browser script that sets window.LOPDA_GALLERY; run it in a sandbox to read it */
const box = { window: {} };
vm.runInNewContext(await readFile(join(ROOT, "gallery/gallery.js"), "utf8"), box);
const entries = (box.window.LOPDA_GALLERY || []).filter((e) => !ONLY.length || ONLY.includes(e.id));
if (!entries.length) { console.error("no gallery entries" + (ONLY.length ? " for " + ONLY.join(",") : "")); process.exit(2); }

const pw = await loadPlaywright();
const server = await serve(ROOT);
const base = "http://127.0.0.1:" + server.address().port;
/* Screenshots of a sandboxed iframe come out blank without this flag (CLAUDE.md, deeper UI checks). */
const browser = await pw.chromium.launch({ args: ["--disable-site-isolation-trials", "--force-color-profile=srgb", "--autoplay-policy=no-user-gesture-required"] });
const work = join(tmpdir(), "lopda-gallery");
/* gallery/media.js says which films and how many stills exist, so the page asks for no file that is not there */
const mediaFile = join(ROOT, "gallery/media.js"), mbox = { window: {} };
try { vm.runInNewContext(await readFile(mediaFile, "utf8"), mbox); } catch {}
const MEDIA = mbox.window.LOPDA_GALLERY_MEDIA || {};
await mkdir(work, { recursive: true });

for (const lang of LANGS) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, hasTouch: false,
    locale: lang === "zh" ? "zh-CN" : "en-US", timezoneId: "Asia/Shanghai", serviceWorkers: "block" });
  await ctx.route("https://**", (r) => r.fulfill({ status: 404, body: "" }));   /* the films never reach another site */
  const a = await ctx.newPage();
  await a.goto(base + "/runtime/", { waitUntil: "load" });
  await a.waitForFunction(() => window.LP && LP.S && LP.S.db && document.getElementById("toast"));
  await a.waitForTimeout(800);

  for (const e of entries) {
    const dir = join(work, e.id + "-" + lang), out = join(ROOT, "gallery/media", e.id);
    await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true }); await mkdir(out, { recursive: true });
    const [man, html] = await Promise.all([readFile(join(ROOT, "registry/apps", e.id, "manifest.json"), "utf8"), readFile(join(ROOT, "registry/apps", e.id, "index.html"), "utf8")]);
    /* scene.kv: the app's saved data for this run only (this browser is thrown away), e.g. tips already seen, so a
       film shows play and not a first-time hint. It replaces whatever the previous scene left. */
    await a.evaluate(([man, html, kv]) => { const x = Object.assign({}, JSON.parse(man), { html });
      LP.S.kv[x.id] = JSON.parse(JSON.stringify(kv || {})); window.LP.upsert("apps", x); window.LP.runApp(x); }, [man, html, e.scene.kv || null]);
    await a.waitForSelector("#v-run:not([hidden])"); await a.waitForTimeout(2000);
    const frameEl = a.locator("#run-frame"), clip = await frameEl.boundingBox();
    const appFrame = () => a.frames().find((f) => f !== a.mainFrame() && f.parentFrame() === a.mainFrame());
    /* stills: pictures (Buffers) in the order they will be numbered. The clip's come first (the cover is from the film),
       then those taken in setup or after the clip. marks: the times of the stills asked for while filming. */
    const shots = [], marks = [];
    let filming = false;
    const still = async () => { if (filming) marks.push(Date.now() / 1000); else shots.push(await a.screenshot({ clip })); };
    let cover = null;   /* ["cover"]: the box art, the app's own title screen; it goes first */
    const run = async (steps) => {
      for (const s of steps || []) {
        const [k, x, y, z] = s;
        if (k === "wait") await a.waitForTimeout(x);
        else if (k === "key") { await a.keyboard.down(x); await a.waitForTimeout(y || 80); await a.keyboard.up(x); await a.waitForTimeout(60); }
        else if (k === "tap") { await a.mouse.click(clip.x + clip.width * x, clip.y + clip.height * y); await a.waitForTimeout(120); }
        else if (k === "tapIn") { const b = await a.frameLocator("#run-frame").locator(x).first().boundingBox();
          await a.mouse.click(b.x + b.width * y, b.y + b.height * z); await a.waitForTimeout(120); }
        else if (k === "stroke") {   /* a finger drawing through points given in a size x size grid over an element */
          const b = await a.frameLocator("#run-frame").locator(x).first().boundingBox(), at = ([px, py]) => [b.x + b.width * px / z, b.y + b.height * py / z];
          await a.mouse.move(...at(y[0])); await a.mouse.down();
          for (let i = 1; i < y.length; i++) { const [x0, y0] = y[i - 1], [x1, y1] = y[i], n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 3));
            for (let j = 1; j <= n; j++) { await a.mouse.move(...at([x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n])); await a.waitForTimeout(22); } }
          await a.mouse.up(); await a.waitForTimeout(200);
        }
        else if (k === "swipe") {   /* a finger through the elements matching x whose text is each letter of y in turn (a word wheel) */
          const items = a.frameLocator("#run-frame").locator(x), n = await items.count(), boxes = [], used = new Set();
          for (const ch of y) { for (let i = 0; i < n; i++) { if (used.has(i)) continue;
            if ((await items.nth(i).textContent()).trim().toLowerCase() === ch.toLowerCase()) { used.add(i); boxes.push(await items.nth(i).boundingBox()); break; } } }
          const pts = boxes.map((b) => [b.x + b.width / 2, b.y + b.height / 2]);
          if (pts.length) { await a.mouse.move(...pts[0]); await a.mouse.down();
            for (let i = 1; i < pts.length; i++) for (let j = 1; j <= 8; j++) { await a.mouse.move(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * j / 8, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * j / 8); await a.waitForTimeout(18); }
            await a.waitForTimeout(80); await a.mouse.up(); await a.waitForTimeout(250); }
        }
        /* code that returns a promise (a scene pushed, say) is not waited for: only the call itself */
        else if (k === "eval") await appFrame().evaluate((c) => { (0, eval)(c); }, x);
        else if (k === "still") await still();
        else if (k === "cover") cover = await a.screenshot({ clip });
        else throw new Error(e.id + ": unknown step " + k);
      }
    };
    await run(e.scene.setup);

    /* the clip: screenshots in a loop while the steps run, each with the time it was taken */
    const frames = []; let done = false;
    const loop = (async () => { while (!done) { const f = join(dir, String(frames.length).padStart(5, "0") + ".png"), t = Date.now() / 1000;
      await a.screenshot({ path: f, clip }); frames.push({ f, t }); } })();
    const t0 = Date.now() / 1000;
    filming = true; await run(e.scene.clip); filming = false;
    done = true; await loop; const t1 = Date.now() / 1000;
    if (!frames.length) throw new Error(e.id + ": no frames");
    let list = "ffconcat version 1.0\n";
    frames.forEach((fr, i) => { const end = i + 1 < frames.length ? frames[i + 1].t : Math.max(fr.t + 0.05, t1);
      list += `file '${fr.f}'\nduration ${Math.max(0.001, end - fr.t).toFixed(4)}\n`; });
    list += `file '${frames.at(-1).f}'\n`;
    await writeFile(join(dir, "list.txt"), list);
    /* 30 fps, yuv420p for Safari, no sound track; the screen is flat colour so a high crf stays sharp */
    const mp4 = join(out, lang + ".mp4");
    ff("-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=neighbor,format=yuv420p",
      "-c:v", "libx264", "-crf", "30", "-preset", "slow", "-tune", "animation", "-movflags", "+faststart", "-an", mp4);
    await run(e.scene.after);
    /* the stills asked for while filming: the clip's own frame nearest that moment (no screenshot out of turn);
       a scene with no still in its clip gets the clip's last frame as its cover */
    if (!marks.length) marks.push(t1);
    const fromClip = [];
    for (const m of marks) fromClip.push(await readFile(frames.reduce((b, x) => Math.abs(x.t - m) < Math.abs(b.t - m) ? x : b, frames[0]).f));
    const stills = [];
    for (const buf of (cover ? [cover] : []).concat(fromClip, shots)) { const f = join(out, lang + "-" + (stills.length + 1) + ".png"); await writeFile(f, buf); stills.push(f); }
    /* old stills past the new count would linger: remove them */
    for (let n = stills.length + 1; n < 20; n++) await rm(join(out, lang + "-" + n + ".png"), { force: true });
    (MEDIA[e.id] = MEDIA[e.id] || {})[lang] = { stills: stills.length };
    if (GIF) ff("-i", mp4, "-vf", "fps=15,split[a][b];[a]palettegen=max_colors=8[p];[b][p]paletteuse=dither=none", join(work, e.id + "-" + lang + ".gif"));
    const kb = async (f) => Math.round((await stat(f)).size / 1024);
    console.log(`${e.id} ${lang}: ${frames.length} frames, ${(t1 - t0).toFixed(1)} s, mp4 ${await kb(mp4)} KB, stills ${(await Promise.all(stills.map(kb))).join(" + ")} KB`);
    await a.click("#home-key"); await a.waitForTimeout(500);
  }
  await ctx.close();
}
await browser.close(); server.close();
const ids = Object.keys(MEDIA).sort();
await writeFile(mediaFile, "/* Generated by tools/gallery-shots.mjs: which films exist in gallery/media/<id>/ and how many stills each has. */\n" +
  "window.LOPDA_GALLERY_MEDIA = {\n" + ids.map((id) => "  " + JSON.stringify(id) + ": " + JSON.stringify(MEDIA[id])).join(",\n") + "\n};\n");
