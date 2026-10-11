// Frame times of registry/apps/zhenyao-tower in headless Chromium, for the budget in docs/decisions.md 12.2.
// Plays the scenes of tests/zhenyao-play.js in the real browser, one fresh page each, and prints a Markdown
// table: triangles and point lights per frame (the maximum), and the time of each screen refresh
// (game step + drawing + putImageData) as median, 95th and 99th percentile and maximum
// (the first second apart: it includes compiling). Single slow frames at random places are garbage collection.
//   npm i --no-save playwright && node tests/zhenyao-perf.mjs [scenes] [--cpu 4]
// --cpu N slows the CPU down N times (Chrome DevTools throttling), a rough stand-in for an old phone.
// Not a test: timings depend on the machine. tests/zhenyao-budget.test.mjs checks the counts.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

const { chromium } = await import("playwright");
const args = process.argv.slice(2);
const cpuAt = args.indexOf("--cpu"), cpu = cpuAt >= 0 ? Number(args.splice(cpuAt, 2)[1]) : 1;
const scenes = args[0] ? args[0].split(",") : ["town", "pagoda", "boss", "tower", "rain", "road", "floor1", "floor2", "top"];

const server = createServer(async (req, res) => {
  const file = join(ROOT, normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, ""));
  try { res.writeHead(200, { "content-type": extname(file) === ".js" ? "text/javascript" : "text/html" }); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

/* the page's clock is ours: rAF callbacks wait for __frame(), and Math.random is seeded as in tests/app-vm.mjs */
const INIT = () => {
  const raf = [];
  let ts = 0, a = 1;
  window.requestAnimationFrame = (f) => { raf.push(f); return raf.length; };
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__frame = () => {
    const q = raf.splice(0), t0 = performance.now();
    ts += 1000 / 60 + 1e-4; q.forEach((f) => f(ts));
    window.__ms = performance.now() - t0;
  };
  const ch = new MessageChannel(), waiting = [];
  ch.port1.onmessage = () => waiting.shift()();
  window.__yield = () => new Promise((r) => { waiting.push(r); ch.port2.postMessage(0); });
};

const q = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const rows = [];
for (const name of scenes) {
  const page = await browser.newPage();
  if (cpu > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.addInitScript(INIT);
  await page.goto(base + "/registry/apps/zhenyao-tower/index.html");
  await page.addScriptTag({ path: join(ROOT, "tests", "zhenyao-play.js") });
  const frames = await page.evaluate(async (n) => {
    const out = [];
    await PLAY.run(n, (i) => out.push([i.tris, i.lights, window.__ms]));
    return out;
  }, name);
  await page.close();
  /* the first second includes compiling and the first glyphs; its worst frame is shown apart */
  const ms = frames.map((f) => f[2]), warm = ms.slice(60);
  rows.push(`| ${name} | ${frames.length} | ${Math.max(...frames.map((f) => f[0]))} | ${Math.max(...frames.map((f) => f[1]))} | ${q(ms, 0.5).toFixed(1)} | ${q(ms, 0.95).toFixed(1)} | ${q(warm, 0.99).toFixed(1)} | ${Math.max(...warm).toFixed(1)} (frame ${warm.indexOf(Math.max(...warm)) + 60}) | ${Math.max(...ms.slice(0, 60)).toFixed(1)} |`);
}
await browser.close(); server.close();
console.log(`Chromium ${browser.version()}, CPU x${cpu}\n`);
console.log("| scene | frames | triangles (max) | lights (max) | median ms | p95 ms | p99 ms | max ms | max ms, first second |\n|---|---|---|---|---|---|---|---|---|\n" + rows.join("\n"));
