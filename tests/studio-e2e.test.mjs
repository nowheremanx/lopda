// The four-track tape machine's drum synth (runtime/studio-synth.js), rendered offline in headless Chromium.
// Needs Playwright, which the repo does not depend on, so these tests skip without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/studio-e2e.test.mjs
// Kept out of tests/e2e.test.mjs so the big suite is not touched by the studio work.
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
  browser = await pw.chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function page(t) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  t.after(() => p.close());
  return { p, errors };
}

/* a blank page with the two studio scripts, and small offline-render helpers (like chipPage in e2e.test.mjs) */
async function studioPage(t, withChip) {
  const { p, errors } = await page(t);
  await p.setContent("<!doctype html><html><body></body></html>");
  await p.addScriptTag({ content: await readFile(join(ROOT, "runtime/studio-song.js"), "utf8") });
  await p.addScriptTag({ content: await readFile(join(ROOT, "runtime/studio-synth.js"), "utf8") });
  if (withChip) {
    await p.addScriptTag({ content: await readFile(join(ROOT, "runtime/chip.js"), "utf8") });
    await p.addScriptTag({ content: await readFile(join(ROOT, "registry/apps/paper-tower/src/music.js"), "utf8") });
  }
  await p.evaluate(() => {
    const SR = 22050;
    window.stats = (d) => {
      let peak = 0, sum = 0, last = -1;
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
        sum += d[i] * d[i];
        if (a > 1e-4) last = i;
      }
      return { peak, rms: Math.sqrt(sum / d.length), last: last < 0 ? 0 : last / SR, data: d };
    };
    window.maxDiff = (a, b) => {
      let m = 0;
      for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > m) m = d; }
      return m;
    };
    /* one drum alone, into a gain of 1 */
    window.renderDrum = async (kit, drum) => {
      const oc = new OfflineAudioContext(1, SR, SR);
      const out = oc.createGain(); out.gain.value = 1; out.connect(oc.destination);
      const synth = LopdaStudioSynth.create(oc, out);
      synth.hit(kit, drum, 0.02, 1);
      return stats((await oc.startRendering()).getChannelData(0));
    };
    /* `seconds` of the DEMO beat from the song data, swing included */
    window.renderBeat = async (kit, seconds) => {
      const song = LopdaSong.newSong();
      const ticks = 4 * LopdaSong.STEPS * LopdaSong.STEP;
      const ev = LopdaSong.events(song, 0, 0, ticks);
      const oc = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
      const out = oc.createGain(); out.gain.value = 1; out.connect(oc.destination);
      const synth = LopdaStudioSynth.create(oc, out);
      for (const e of ev) {
        if (e.key) synth.hit(kit, e.key, LopdaSong.ticksToSec(e.tick, song.bpm), e.vel);
      }
      return stats((await oc.startRendering()).getChannelData(0));
    };
    /* the paper tower's title tune through the runtime's own chip, for `seconds` */
    window.renderTune = async (seconds) => {
      const oc = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
      const out = oc.createGain(); out.gain.value = 1; out.connect(oc.destination);
      const chip = LopdaChip.create(oc, out, { offline: true });
      chip.play(LopdaChip.parse(PT.MUSIC.title).song, { loop: false, at: 0 });
      chip.pump(1e9);
      return stats((await oc.startRendering()).getChannelData(0));
    };
  });
  return { p, errors };
}

test("studio synth: every drum of both kits sounds, peaks under 0.9, and renders the same twice", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t, false);
  const r = await p.evaluate(async () => {
    const out = { drums: [], repeats: {} };
    for (const kit of ["chip", "soft"]) {
      for (const drum of ["kick", "snare", "hat", "perc"]) {
        const a = await renderDrum(kit, drum);
        out.drums.push({ kit, drum, peak: a.peak, last: a.last });
      }
    }
    for (const kit of ["chip", "soft"]) {
      const a = await renderDrum(kit, "snare"), b = await renderDrum(kit, "snare");
      out.repeats[kit] = maxDiff(a.data, b.data);
    }
    return out;
  });
  for (const d of r.drums) {
    t.diagnostic(`${d.kit} ${d.drum}: peak ${d.peak.toFixed(3)}, ends ${d.last.toFixed(3)} s`);
    assert.ok(d.peak > 0.05, `${d.kit} ${d.drum} is audible (peak ${d.peak})`);
    assert.ok(d.peak <= 0.9, `${d.kit} ${d.drum} peak ${d.peak} is under 0.9`);
    assert.ok(d.last < 0.9, `${d.kit} ${d.drum} ends before 0.9 s (${d.last})`);
  }
  assert.equal(r.repeats.chip, 0, "the chip kit renders identically twice");
  assert.equal(r.repeats.soft, 0, "the soft kit renders identically twice");
  assert.deepEqual(errors, []);
});

test("studio synth: the demo beat sits near PAD.music", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t, true);
  const r = await p.evaluate(async () => {
    const song = LopdaSong.newSong();
    const seconds = LopdaSong.ticksToSec(4 * LopdaSong.STEPS * LopdaSong.STEP, song.bpm);
    const tune = await renderTune(seconds);
    const soft = await renderBeat("soft", seconds);
    const chip = await renderBeat("chip", seconds);
    return { seconds, tuneRms: tune.rms, tunePeak: tune.peak,
      soft: { rms: soft.rms, peak: soft.peak, ratio: soft.rms / tune.rms },
      chip: { rms: chip.rms, peak: chip.peak, ratio: chip.rms / tune.rms } };
  });
  t.diagnostic(`4 bars at ${r.seconds.toFixed(3)} s; paper-tower title tune rms ${r.tuneRms.toFixed(4)} (peak ${r.tunePeak.toFixed(3)})`);
  for (const kit of ["soft", "chip"]) {
    const b = r[kit];
    t.diagnostic(`${kit} beat: rms ${b.rms.toFixed(4)}, peak ${b.peak.toFixed(3)}, rms ratio ${b.ratio.toFixed(3)}`);
    assert.ok(b.ratio >= 0.5 && b.ratio <= 2, `${kit} beat sits near the tune by rms (${b.ratio})`);
    assert.ok(b.peak <= 0.9, `${kit} beat peak ${b.peak} is under 0.9`);
  }
  assert.deepEqual(errors, []);
});

test("studio synth: dispose stops later hits; unknown kit or drum is ignored", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t, false);
  const r = await p.evaluate(async () => {
    const SR = 22050;
    const out = { threw: false };
    /* disposed before any hit: nothing sounds, nothing throws */
    let oc = new OfflineAudioContext(1, SR, SR);
    let gain = oc.createGain(); gain.gain.value = 1; gain.connect(oc.destination);
    let synth = LopdaStudioSynth.create(oc, gain);
    synth.dispose();
    try {
      synth.hit("chip", "kick", 0.02, 1);
      synth.hit("soft", "snare", 0.03, 1);
      synth.hit("nope", "kick", 0.04, 1);
      synth.hit("chip", "nope", 0.05, 1);
    } catch (e) { out.threw = true; }
    out.silentPeak = stats((await oc.startRendering()).getChannelData(0)).peak;

    /* a hit before dispose still sounds; the later one does not */
    oc = new OfflineAudioContext(1, SR, SR);
    gain = oc.createGain(); gain.gain.value = 1; gain.connect(oc.destination);
    synth = LopdaStudioSynth.create(oc, gain);
    try { synth.hit("chip", "nope", 0.01, 1); } catch (e) { out.threw = true; }
    synth.hit("chip", "kick", 0.05, 1);
    synth.dispose();
    try { synth.hit("chip", "kick", 0.3, 1); } catch (e) { out.threw = true; }
    const d = (await oc.startRendering()).getChannelData(0);
    const at = (from, to) => { let m = 0; for (let i = Math.floor(from * SR); i < Math.min(d.length, to * SR); i++) m = Math.max(m, Math.abs(d[i])); return m; };
    out.after = at(0.3, 1);
    return out;
  });
  assert.equal(r.threw, false, "unknown kit or drum and hits after dispose never throw");
  assert.equal(r.silentPeak, 0, "a disposed synth renders silence");
  assert.equal(r.after, 0, "nothing sounds after dispose");
  assert.deepEqual(errors, []);
});
