#!/usr/bin/env node
// M1 verification: Chromium + a generated WAV on the fake microphone.
// It proves the page's microphone graph, FFT/Goertzel detector and oscillator output graph.
// It cannot prove the phone's speaker or microphone hardware; the in-page loop self-test does that.
//
// Usage:
//   node experiments/acoustic-lab/verify.mjs
//   PLAYWRIGHT_DIR=/path/to/node_modules/playwright node experiments/acoustic-lab/verify.mjs
//
// Chromium is the development check. iPhone Safari is the target and needs the manual pass in README.md.

import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../..");
const LAB = "/experiments/acoustic-lab/index.html";
const TONES = [1500, 2500, 3500, 4500];
const SAMPLE_RATE = 48000;

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".wav": "audio/wav"
};

function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(ROOT, path);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end("no"); return; }
    if (path.endsWith("/")) file = join(file, "index.html");
    if (!existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
    try {
      const body = readFileSync(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/* 16-bit mono WAV: eight tones, with silence between, so the fake device loops a known pattern. */
function makeWav(file) {
  const seq = [0, 1, 2, 3, 0, 1, 2, 3];
  const dur = 0.70, gap = 0.25, amp = 0.32, fade = 0.020;
  const total = seq.length * (dur + gap) + 0.5;
  const n = Math.round(total * SAMPLE_RATE);
  const pcm = new Int16Array(n);
  const fadeN = Math.round(fade * SAMPLE_RATE);
  const durN = Math.round(dur * SAMPLE_RATE);
  const stepN = Math.round((dur + gap) * SAMPLE_RATE);
  for (let s = 0; s < seq.length; s++) {
    const at = s * stepN;
    const hz = TONES[seq[s]];
    for (let i = 0; i < durN; i++) {
      let g = 1;
      if (i < fadeN) g = i / fadeN;
      else if (i > durN - fadeN) g = (durN - i) / fadeN;
      pcm[at + i] = Math.round(Math.sin(2 * Math.PI * hz * i / SAMPLE_RATE) * amp * g * 32767);
    }
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  writeFileSync(file, buf);
}

async function loadPlaywright() {
  try { return await import("playwright"); } catch (e) { /* fall through */ }
  const dir = process.env.PLAYWRIGHT_DIR;
  if (dir) {
    const p = dir.endsWith(".mjs") ? dir : join(dir, "index.mjs");
    if (existsSync(p)) return await import(pathToFileURL(p).href);
  }
  throw new Error("playwright not found. Run `npm i --no-save playwright` in the repo, or set PLAYWRIGHT_DIR to its node_modules/playwright directory.");
}

function ok(cond, msg, out) {
  out.push((cond ? "PASS " : "FAIL ") + msg);
  if (!cond) process.exitCode = 1;
}

const { chromium } = await loadPlaywright();
const server = await serve();
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "tone-lab-"));
const wav = join(dir, "tones.wav");
makeWav(wav);

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${wav}`,
    "--autoplay-policy=no-user-gesture-required"
  ]
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  permissions: ["microphone"]
});
await context.grantPermissions(["microphone"], { origin });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

const out = [];
let report;
try {
  await page.goto(origin + LAB, { waitUntil: "load" });
  await page.waitForFunction(() => window.__TONE_LAB__ && window.__TONE_LAB__.version === "m1");
  const env = await page.evaluate(() => ({
    secure: window.isSecureContext, top: window.self === window.top,
    hasAudio: !!(window.AudioContext || window.webkitAudioContext),
    hasGum: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  }));
  ok(env.secure, "secure context (localhost)", out);
  ok(env.top, "runs top-level, not in the Lo-PDA sandbox", out);
  ok(env.hasAudio, "Web Audio API present", out);
  ok(env.hasGum, "getUserMedia present", out);

  await page.click("#micBtn");
  await page.waitForFunction(() => window.__TONE_LAB__.snapshot().micOn === true, null, { timeout: 8000 });
  const mic = await page.evaluate(() => window.__TONE_LAB__.snapshot());
  ok(mic.ctxState === "running", "AudioContext is running after the click", out);
  ok(mic.sampleRate >= 8000, `sample rate ${mic.sampleRate} Hz`, out);
  ok(mic.fftSize === 2048, `FFT size ${mic.fftSize}`, out);
  ok(mic.binHz > 15 && mic.binHz < 30, `FFT resolution ${mic.binHz.toFixed(1)} Hz/bin`, out);

  /* The fake device loops known tones; wait long enough to hear all four. */
  await page.waitForTimeout(5200);
  const heard = await page.evaluate(() => window.__TONE_LAB__.snapshot());
  for (let i = 0; i < 4; i++) {
    ok(heard.counts[i] > 5, `tone ${i + 1} (${TONES[i]} Hz) detected ${heard.counts[i]} times`, out);
  }
  ok(heard.counts.some((n) => n > 0), "detector produced symbols", out);

  const dsp = await page.evaluate(() => window.__TONE_LAB__.dspSelfCheck());
  ok(dsp.pass === 4, `synthetic DSP self-check ${dsp.pass}/4`, out);

  /* Output graph: the post-gain analyser must see the four scheduled tones. */
  const peaks = [];
  for (let i = 0; i < 4; i++) {
    await page.evaluate((i) => window.__TONE_LAB__.playTone(i, 600), i);
    await page.waitForTimeout(260);
    const snap = await page.evaluate(() => window.__TONE_LAB__.snapshot());
    peaks.push(snap.txPeakHz);
    ok(snap.txPeakHz !== null && Math.abs(snap.txPeakHz - TONES[i]) <= 30,
      `oscillator output ${i + 1}: ${snap.txPeakHz} Hz (want ${TONES[i]})`, out);
    await page.waitForTimeout(420);
  }

  const probe = await page.evaluate(() => window.__TONE_LAB__.probeSandbox());
  out.push(`INFO sandbox getUserMedia: ${probe.ok ? "ALLOWED" : "BLOCKED"} ${probe.name || ""} ${probe.message || ""}`.trim());

  await page.click("#micBtn");
  await page.waitForTimeout(200);
  const stopped = await page.evaluate(() => window.__TONE_LAB__.snapshot());
  ok(stopped.micOn === false, "stop button closes the microphone", out);

  report = {
    at: new Date().toISOString(), browser: "chromium " + browser.version(), origin,
    env, mic: { state: mic.ctxState, sampleRate: mic.sampleRate, fftSize: mic.fftSize, binHz: mic.binHz },
    counts: heard.counts, dsp: dsp.pass, txPeaks: peaks, sandboxProbe: probe, errors
  };
} catch (e) {
  out.push("FAIL exception: " + (e && e.stack || e));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}

if (errors.length) out.push("INFO page errors:\n  " + errors.join("\n  "));
out.push("RESULT " + (process.exitCode ? "FAIL" : "PASS"));
console.log(out.join("\n"));
console.log("\nREPORT " + JSON.stringify(report || {}, null, 2));
