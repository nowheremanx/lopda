// The four-track tape machine's drum and melodic synth (runtime/studio-synth.js), rendered offline in headless Chromium.
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
  await p.addScriptTag({ content: await readFile(join(ROOT, "runtime/studio-tape.js"), "utf8") });
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
    /* all four drums on the same step, into a gain of 1: the worst case for headroom */
    window.renderStep = async (kit, vel = 1) => {
      const oc = new OfflineAudioContext(1, SR, SR);
      const out = oc.createGain(); out.gain.value = 1; out.connect(oc.destination);
      const synth = LopdaStudioSynth.create(oc, out);
      for (const drum of ["kick", "snare", "hat", "perc"]) synth.hit(kit, drum, 0.02, vel);
      return stats((await oc.startRendering()).getChannelData(0));
    };
    /* one note of one voice, at 0.02 s, into a gain of 1 */
    window.renderNote = async (voice, midi, dur, vel = 1, seconds = 1) => {
      const oc = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
      const out = oc.createGain(); out.gain.value = 1; out.connect(oc.destination);
      const synth = LopdaStudioSynth.create(oc, out);
      synth.note(voice, midi, 0.02, dur, vel);
      return stats((await oc.startRendering()).getChannelData(0));
    };
    /* drums and notes together; an event is {kit, drum} or {voice, midi, at, dur}, both with at and vel */
    window.renderEvents = async (events, seconds = 1) => {
      const oc = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
      const out = oc.createGain(); out.gain.value = 1; out.connect(oc.destination);
      const synth = LopdaStudioSynth.create(oc, out);
      for (const e of events) {
        if (e.voice) synth.note(e.voice, e.midi, e.at || 0, e.dur, e.vel == null ? 1 : e.vel);
        else synth.hit(e.kit, e.drum, e.at || 0, e.vel == null ? 1 : e.vel);
      }
      return stats((await oc.startRendering()).getChannelData(0));
    };
    /* one snare through the tape chain at a chosen level, and how much the wave moves sample to sample (a cheap
       high-frequency meter: the lowpass and the crush both bring it down) */
    window.renderTape = async (level) => {
      const oc = new OfflineAudioContext(1, Math.ceil(SR * 2), SR);
      const tape = LopdaStudioTape.create(oc, oc.destination);
      tape.set(level);
      tape.start(0, 2);
      const synth = LopdaStudioSynth.create(oc, tape.input);
      synth.hit("soft", "snare", 0.05, 1);
      const d = (await oc.startRendering()).getChannelData(0), s = stats(d);
      let diff = 0, n = 0;
      for (let i = Math.floor(0.05 * SR); i < Math.floor(1.5 * SR); i++) { diff += (d[i] - d[i - 1]) ** 2; n++; }
      tape.dispose(); synth.dispose();
      return { peak: s.peak, rms: s.rms, diff: Math.sqrt(diff / n) };
    };
    /* the largest absolute sample between two times, in seconds */
    window.peakBetween = (d, from, to) => {
      let m = 0;
      for (let i = Math.max(0, Math.floor(from * SR)); i < Math.min(d.length, Math.ceil(to * SR)); i++) m = Math.max(m, Math.abs(d[i]));
      return m;
    };
    /* the fundamental in `d` over [from, to]: normalised autocorrelation, searched around the expected period and
       interpolated between lags. One lag is far too coarse (about 16 cents at 440 Hz / 48 kHz) for a 3-cent check. */
    window.pitchAt = (d, sr, expected, from, to) => {
      const a = Math.max(0, Math.floor(from * sr)), b = Math.min(d.length, Math.floor(to * sr));
      const x = new Float64Array(b - a);
      let mean = 0;
      for (let i = 0; i < x.length; i++) mean += d[a + i];
      mean /= x.length;
      for (let i = 0; i < x.length; i++) x[i] = d[a + i] - mean;
      const period = sr / expected;
      const lo = Math.max(2, Math.floor(period * 0.8)), hi = Math.ceil(period * 1.2);
      const corr = [];
      for (let lag = lo - 1; lag <= hi + 1; lag++) {
        let sum = 0, e0 = 0, e1 = 0;
        for (let i = 0; i + lag < x.length; i++) {
          sum += x[i] * x[i + lag]; e0 += x[i] * x[i]; e1 += x[i + lag] * x[i + lag];
        }
        corr.push(sum / Math.sqrt(e0 * e1 || 1));
      }
      let best = 1;
      for (let i = 1; i < corr.length - 1; i++) if (corr[i] > corr[best]) best = i;
      const y0 = corr[best - 1], y1 = corr[best], y2 = corr[best + 1];
      const denom = y0 - 2 * y1 + y2;
      const delta = Math.abs(denom) > 1e-12 ? 0.5 * (y0 - y2) / denom : 0;
      const freq = sr / (lo - 1 + best + delta);
      return { freq, cents: 1200 * Math.log2(freq / expected) };
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
  /* Chromium's offline renderer can leave a float trace between two identical renders; below 1e-4 it is the same sound */
  for (const kit of ["chip", "soft"]) assert.ok(r.repeats[kit] < 1e-4, `${kit} renders the same twice (max difference ${r.repeats[kit]})`);
  assert.deepEqual(errors, []);
});

test("studio synth: all four drums on one step peak under 0.9", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t, false);
  const r = await p.evaluate(async () => {
    const out = {};
    for (const kit of ["chip", "soft"]) out[kit] = await renderStep(kit, 1);
    return out;
  });
  for (const kit of ["chip", "soft"]) {
    t.diagnostic(`${kit} all four: peak ${r[kit].peak.toFixed(3)}`);
    assert.ok(r[kit].peak <= 0.85, `${kit}: all four drums together peak <= 0.85, not just 0.9 (${r[kit].peak})`);
    assert.ok(r[kit].peak > 0.05, `${kit}: the four still sound together (${r[kit].peak})`);
  }
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

    /* velocity 0 schedules nothing at all: no envelope starts, so no exponential ramp from zero */
    oc = new OfflineAudioContext(1, SR, SR);
    gain = oc.createGain(); gain.gain.value = 1; gain.connect(oc.destination);
    synth = LopdaStudioSynth.create(oc, gain);
    try {
      synth.hit("chip", "kick", 0.02, 0);
      synth.hit("soft", "snare", 0.02, 0);
    } catch (e) { out.threw = true; }
    out.zeroPeak = stats((await oc.startRendering()).getChannelData(0)).peak;

    /* dispose disconnects the master, so a hit already scheduled before it is silenced too, and later hits do nothing */
    oc = new OfflineAudioContext(1, SR, SR);
    gain = oc.createGain(); gain.gain.value = 1; gain.connect(oc.destination);
    synth = LopdaStudioSynth.create(oc, gain);
    try { synth.hit("chip", "nope", 0.01, 1); } catch (e) { out.threw = true; }
    synth.hit("chip", "kick", 0.05, 1);
    synth.dispose();
    try { synth.hit("chip", "kick", 0.3, 1); } catch (e) { out.threw = true; }
    const d = (await oc.startRendering()).getChannelData(0);
    const at = (from, to) => { let m = 0; for (let i = Math.floor(from * SR); i < Math.min(d.length, to * SR); i++) m = Math.max(m, Math.abs(d[i])); return m; };
    out.whole = stats(d).peak;
    out.after = at(0.3, 1);
    return out;
  });
  assert.equal(r.threw, false, "unknown kit or drum and hits after dispose never throw");
  assert.equal(r.silentPeak, 0, "a disposed synth renders silence");
  assert.equal(r.zeroPeak, 0, "velocity 0 schedules no sound");
  assert.equal(r.whole, 0, "the hit scheduled before dispose is silenced too (the master is disconnected)");
  assert.equal(r.after, 0, "nothing sounds after dispose");
  assert.deepEqual(errors, []);
});

test("studio synth: every melodic voice sounds low and high, under its target, and renders the same twice", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t, false);
  const targets = { bass: 0.30, keys: 0.075, pluck: 0.28 };
  const pitches = { bass: [33, 57], keys: [48, 72], pluck: [57, 84] };
  const r = await p.evaluate(async (pitches) => {
    const out = { notes: [] };
    for (const voice of Object.keys(pitches)) {
      for (const midi of pitches[voice]) {
        const a = await renderNote(voice, midi, 0.4);
        const b = await renderNote(voice, midi, 0.4);
        out.notes.push({ voice, midi, peak: a.peak, last: a.last, diff: maxDiff(a.data, b.data) });
      }
    }
    return out;
  }, pitches);
  for (const n of r.notes) {
    t.diagnostic(`${n.voice} ${n.midi}: peak ${n.peak.toFixed(4)}, ends ${n.last.toFixed(3)} s`);
    assert.ok(n.peak > 0.02, `${n.voice} ${n.midi} is audible (peak ${n.peak})`);
    assert.ok(n.peak <= targets[n.voice] * 1.1, `${n.voice} ${n.midi} peak ${n.peak} is under ${(targets[n.voice] * 1.1).toFixed(3)}`);
    assert.ok(n.diff < 1e-4, `${n.voice} ${n.midi} renders the same twice (max difference ${n.diff})`);
  }
  assert.deepEqual(errors, []);
});

test("studio synth: the flute sounds at 57 and 79, peaks at 0.22, renders the same twice and stops after its release", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t, false);
  const r = await p.evaluate(async () => {
    const out = { notes: [] };
    for (const midi of [57, 79]) {
      const a = await renderNote("flute", midi, 0.4);
      const b = await renderNote("flute", midi, 0.4);
      out.notes.push({ midi, peak: a.peak, last: a.last, diff: maxDiff(a.data, b.data) });
    }
    /* 40 ms attack, a 120 ms release at at+dur: nothing may be left 50 ms after the release */
    const at = 0.05, dur = 0.3, release = 0.12;
    const s = await renderEvents([{ voice: "flute", midi: 57, at, dur }], 1.5);
    out.after = peakBetween(s.data, at + dur + release + 0.05, 1.4);
    out.cut = at + dur + release + 0.05;
    return out;
  });
  for (const n of r.notes) {
    t.diagnostic(`flute ${n.midi}: peak ${n.peak.toFixed(4)}, ends ${n.last.toFixed(3)} s, repeat diff ${n.diff.toExponential(2)}`);
    assert.ok(n.peak > 0.02, `flute ${n.midi} is audible (peak ${n.peak})`);
    assert.ok(n.peak <= 0.22 * 1.1, `flute ${n.midi} peak ${n.peak} is under 0.242`);
    assert.ok(n.diff < 1e-4, `flute ${n.midi} renders the same twice (max difference ${n.diff})`);
  }
  t.diagnostic(`flute after its release at ${r.cut.toFixed(3)} s: peak ${r.after.toExponential(2)}`);
  assert.ok(r.after < 1e-3, `the flute is silent after at + dur + release + 50 ms (${r.after})`);
  assert.deepEqual(errors, []);
});

test("studio synth: pluck stays in tune at 44.1 and 48 kHz", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t, false);
  const r = await p.evaluate(async () => {
    const out = [];
    for (const sr of [44100, 48000]) {
      for (const midi of [57, 69, 86]) {
        const oc = new OfflineAudioContext(1, Math.ceil(sr * 0.5), sr);
        const gain = oc.createGain(); gain.gain.value = 1; gain.connect(oc.destination);
        const synth = LopdaStudioSynth.create(oc, gain);
        synth.note("pluck", midi, 0.02, 0.5, 1);
        const d = (await oc.startRendering()).getChannelData(0);
        const expected = 440 * Math.pow(2, (midi - 69) / 12);
        const m = pitchAt(d, sr, expected, 0.1, 0.4);
        out.push({ sr, midi, expected, freq: m.freq, cents: m.cents });
      }
    }
    return out;
  });
  for (const n of r) {
    t.diagnostic(`${n.sr} Hz, midi ${n.midi}: ${n.freq.toFixed(3)} Hz (wanted ${n.expected.toFixed(3)}), ${n.cents.toFixed(2)} cents`);
    assert.ok(Math.abs(n.cents) <= 3, `${n.sr} Hz midi ${n.midi} is within 3 cents (${n.cents.toFixed(2)})`);
  }
  assert.deepEqual(errors, []);
});

test("studio synth: bass, keys and pluck stop after their release", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t, false);
  const r = await p.evaluate(async () => {
    const out = {};
    /* after at + dur + release + 50 ms nothing of the note may be left; the source stops at the release end */
    for (const [voice, dur, release] of [["bass", 0.2, 0.08], ["keys", 0.2, 0.25], ["pluck", 0.2, 0.06]]) {
      const at = 0.05;
      const s = await renderEvents([{ voice, midi: 57, at, dur }], 1.5);
      out[voice] = { peak: s.peak, after: peakBetween(s.data, at + dur + release + 0.05, 1.4), cut: at + dur + release + 0.05 };
    }
    return out;
  });
  for (const voice of ["bass", "keys", "pluck"]) {
    t.diagnostic(`${voice}: peak ${r[voice].peak.toFixed(4)}, after ${r[voice].cut.toFixed(3)} s peak ${r[voice].after.toExponential(2)}`);
    assert.ok(r[voice].peak > 0.02, `${voice} note sounds before its release (${r[voice].peak})`);
    assert.ok(r[voice].after < 1e-3, `${voice} is silent after at + dur + release + 50 ms (${r[voice].after})`);
  }
  assert.deepEqual(errors, []);
});

test("studio synth: a dense hit stays under the soft clip, and the melodic parts alone under 0.6", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t, false);
  const r = await p.evaluate(async () => {
    const drums = ["kick", "snare", "hat", "perc"].map((drum) => ({ kit: "soft", drum, at: 0 }));
    const bass = { voice: "bass", midi: 45, at: 0, dur: 1 };
    const keys = [57, 60, 67, 71].map((midi) => ({ voice: "keys", midi, at: 0, dur: 1 }));
    const pluck = { voice: "pluck", midi: 69, at: 0, dur: 1 };
    const dense = await renderEvents([...drums, bass, ...keys, pluck], 1.5);
    const melodic = await renderEvents([bass, ...keys, pluck], 1.5);
    return { dense: dense.peak, melodic: melodic.peak };
  });
  t.diagnostic(`soft kit + bass 45 + keys 57 60 67 71 + pluck 69: peak ${r.dense.toFixed(3)}`);
  t.diagnostic(`bass 45 + keys 57 60 67 71 + pluck 69: peak ${r.melodic.toFixed(3)}`);
  assert.ok(r.dense <= 0.95, `the dense hit peaks <= 0.95 (${r.dense})`);
  assert.ok(r.melodic <= 0.6, `the melodic parts alone peak <= 0.6 (${r.melodic})`);
  assert.deepEqual(errors, []);
});

test("studio synth: the four-bar demo pattern with the soft kit peaks under 0.9", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t, false);
  const r = await p.evaluate(async () => {
    const SR = 22050;
    const song = LopdaSong.newSong();
    const ticks = 4 * LopdaSong.STEPS * LopdaSong.STEP;
    const ev = LopdaSong.chainEvents(song, song.song, 0, ticks);
    const seconds = LopdaSong.ticksToSec(ticks, song.bpm);
    const oc = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
    const out = oc.createGain(); out.gain.value = 1; out.connect(oc.destination);
    const synth = LopdaStudioSynth.create(oc, out);
    for (const e of ev) {
      const at = LopdaSong.ticksToSec(e.tick, song.bpm);
      const dur = LopdaSong.ticksToSec(e.len, song.bpm);
      if (e.track === "drums") synth.hit(song.kit, e.key, at, e.vel);
      else if (e.track === "bass") synth.note(LopdaSong.SOUND.bass, LopdaSong.noteMidi(song, "bass", e.deg), at, dur, e.vel);
      else if (e.track === "chords") {
        for (const midi of LopdaSong.chordNotes(song, e.deg)) synth.note(LopdaSong.SOUND.chords, midi, at, dur, e.vel);
      } else if (e.track === "melody") synth.note(LopdaSong.SOUND.melody, LopdaSong.noteMidi(song, "melody", e.deg), at, dur, e.vel);
    }
    return { kit: song.kit, seconds, events: ev.length, peak: stats((await oc.startRendering()).getChannelData(0)).peak };
  });
  t.diagnostic(`${r.events} events over 4 bars (${r.seconds.toFixed(3)} s) with the ${r.kit} kit: peak ${r.peak.toFixed(3)}`);
  assert.ok(r.peak <= 0.9, `the four-bar demo peaks <= 0.9 (${r.peak})`);
  assert.ok(r.peak > 0.2, `the four-bar demo sounds (${r.peak})`);
  assert.deepEqual(errors, []);
});

test("studio synth: the whole example song, 24 bars of every track through SOUND, peaks under 0.9", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await studioPage(t, false);
  const r = await p.evaluate(async () => {
    const SR = 22050;
    const song = LopdaSong.demoSong();
    const ticks = LopdaSong.chainTicks(song, song.song);
    const ev = LopdaSong.chainEvents(song, song.song, 0, ticks);
    const seconds = LopdaSong.ticksToSec(ticks, song.bpm);
    const oc = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
    const out = oc.createGain(); out.gain.value = 1; out.connect(oc.destination);
    const synth = LopdaStudioSynth.create(oc, out);
    const used = {};
    for (const e of ev) {
      if (e.vel <= 0) continue; // rests: the synth would ignore vel 0 anyway
      used[e.track] = true;
      const at = LopdaSong.ticksToSec(e.tick, song.bpm);
      const dur = LopdaSong.ticksToSec(e.len, song.bpm);
      if (e.track === "drums") synth.hit(song.kit, e.key, at, e.vel);
      else if (e.track === "chords") {
        for (const midi of LopdaSong.chordNotes(song, e.deg)) synth.note(LopdaSong.SOUND.chords, midi, at, dur, e.vel);
      } else synth.note(LopdaSong.SOUND[e.track], LopdaSong.noteMidi(song, e.track, e.deg), at, dur, e.vel);
    }
    const s = stats((await oc.startRendering()).getChannelData(0));
    return { kit: song.kit, seconds, bars: song.song.length, events: ev.length,
      rests: ev.filter((e) => e.vel === 0).length, used: Object.keys(used).sort(), peak: s.peak, rms: s.rms };
  });
  t.diagnostic(`${r.events} events (${r.rests} rests skipped) over ${r.bars} bars (${r.seconds.toFixed(3)} s) with the ${r.kit} kit: peak ${r.peak.toFixed(3)}, rms ${r.rms.toFixed(4)}`);
  assert.equal(r.bars, 24);
  assert.equal(r.kit, "soft");
  assert.deepEqual(r.used, ["bass", "chords", "drums", "melody"]);
  assert.ok(r.rests > 0, "the song has rests (they are skipped, not played)");
  assert.ok(r.peak <= 0.9, `the whole example song peaks <= 0.9 (${r.peak})`);
  assert.ok(r.peak > 0.2, `the whole example song sounds (${r.peak})`);
  assert.deepEqual(errors, []);
});

test("studio synth: the soft clip leaves a single soft kick alone", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t, false);
  const r = await p.evaluate(async () => {
    const full = await renderDrum("soft", "kick");
    const half = await renderEvents([{ kit: "soft", drum: "kick", at: 0.02, vel: 0.5 }]);
    return { full: full.peak, half: half.peak };
  });
  t.diagnostic(`soft kick at velocity 1: peak ${r.full.toFixed(4)}; at 0.5: ${r.half.toFixed(4)}`);
  assert.ok(r.full < 0.7, `the kick stays below the clip knee (${r.full})`);
  const off = Math.abs(r.half - r.full * 0.5) / (r.full * 0.5);
  t.diagnostic(`half velocity differs from half the peak by ${(off * 100).toFixed(2)}%`);
  assert.ok(off < 0.01, `velocity 0.5 scales the peak by half within 1% (${off * 100}%)`);
  assert.deepEqual(errors, []);
});

test("studio synth: dispose stops later notes; an unknown voice or bad note args is ignored", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t, false);
  const r = await p.evaluate(async () => {
    const SR = 22050;
    const out = { threw: false };
    /* unknown voice, a non-finite pitch, zero length and zero velocity schedule nothing and never throw */
    let oc = new OfflineAudioContext(1, SR, SR);
    let gain = oc.createGain(); gain.gain.value = 1; gain.connect(oc.destination);
    let synth = LopdaStudioSynth.create(oc, gain);
    try {
      synth.note("nope", 60, 0.02, 0.2, 1);
      synth.note("bass", NaN, 0.02, 0.2, 1);
      synth.note("bass", Infinity, 0.02, 0.2, 1);
      synth.note("bass", 45, 0.02, 0, 1);
      synth.note("bass", 45, 0.02, -0.1, 1);
      synth.note("bass", 45, 0.02, 0.2, 0);
      synth.note("keys", 60, 0.02, 0.2, -1);
      synth.note("bass", 45, 0.02, Infinity, 1);
      synth.note("keys", 60, 0.02, Infinity, 1);
      synth.note("bass", 1e6, 0.02, 0.2, 1);
      synth.note("bass", -1e6, 0.02, 0.2, 1);
      synth.note("keys", 1e6, 0.02, 0.2, 1);
      synth.note("keys", -1e6, 0.02, 0.2, 1);
    } catch (e) { out.threw = true; }
    out.badPeak = stats((await oc.startRendering()).getChannelData(0)).peak;

    /* a note already scheduled is silenced by dispose (the master is cut), and later notes do nothing */
    oc = new OfflineAudioContext(1, SR, SR);
    gain = oc.createGain(); gain.gain.value = 1; gain.connect(oc.destination);
    synth = LopdaStudioSynth.create(oc, gain);
    synth.note("bass", 45, 0.05, 0.3, 1);
    synth.dispose();
    try {
      synth.note("bass", 52, 0.3, 0.3, 1);
      synth.note("keys", 60, 0.3, 0.3, 1);
    } catch (e) { out.threw = true; }
    const d = (await oc.startRendering()).getChannelData(0);
    out.whole = stats(d).peak;
    out.after = peakBetween(d, 0.3, 1);
    return out;
  });
  assert.equal(r.threw, false, "bad voices and bad note arguments never throw");
  assert.equal(r.badPeak, 0, "an unknown voice or bad arguments schedule no sound");
  assert.equal(r.whole, 0, "the note scheduled before dispose is silenced too");
  assert.equal(r.after, 0, "nothing sounds after dispose");
  assert.deepEqual(errors, []);
});

test("studio synth: the straight pop example peaks under 0.9 and sounds", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await studioPage(t);
  const r = await p.evaluate(async () => {
    const song = LopdaSong.popSong(0), ticks = LopdaSong.chainTicks(song, song.song);
    const seconds = LopdaSong.ticksToSec(ticks, song.bpm);
    const oc = new OfflineAudioContext(1, Math.ceil(seconds * 22050), 22050);
    const out = oc.createGain(); out.gain.value = 1; out.connect(oc.destination);
    const synth = LopdaStudioSynth.create(oc, out);
    for (const e of LopdaSong.chainEvents(song, song.song, 0, ticks)) {
      if (!e.vel) continue;
      const at = LopdaSong.ticksToSec(e.tick, song.bpm), dur = LopdaSong.ticksToSec(e.len, song.bpm);
      if (e.track === "drums") synth.hit(song.kit, e.key, at, e.vel);
      else if (e.track === "chords") for (const midi of LopdaSong.chordNotes(song, e.deg)) synth.note(LopdaSong.SOUND.chords, midi, at, dur, e.vel);
      else synth.note(LopdaSong.SOUND[e.track], LopdaSong.noteMidi(song, e.track, e.deg), at, dur, e.vel);
    }
    const d = (await oc.startRendering()).getChannelData(0);
    return Object.assign(stats(d), { seconds, bars: song.song.length });
  });
  assert.ok(r.peak > 0.2, `the pop example sounds (${r.peak})`);
  assert.ok(r.peak <= 0.9, `the pop example peaks under the soft ceiling (${r.peak})`);
  assert.ok(Math.abs(r.seconds - 160) < 10, `about two and a half minutes of music (${r.seconds}s)`);
  assert.deepEqual(errors, []);
});

test("studio tape: position 0 is a clean wire, 4 muffles the same hit, and both still sound", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await studioPage(t);
  const r = await p.evaluate(async () => ({ clean: await renderTape(0), worn: await renderTape(4), again: await renderTape(4) }));
  assert.ok(r.clean.peak > 0.05, `the clean chain still sounds (${r.clean.peak})`);
  assert.ok(r.worn.peak > 0.03, `the worn chain still sounds (${r.worn.peak})`);
  assert.ok(r.worn.diff < r.clean.diff * 0.75, `position 4 takes the top off (${r.worn.diff} vs ${r.clean.diff})`);
  assert.equal(r.worn.peak, r.again.peak, "the same level renders the same twice");
  assert.equal(r.worn.diff, r.again.diff);
  assert.deepEqual(errors, []);
});

/* ---------------- the rhythm screen (runtime/apps/studio.js) ---------------- */
/* the runtime at a chosen viewport; each page is its own browser context, so its store starts empty */
async function rtPage(t, viewport, locale) {
  const p = await browser.newPage({ viewport: viewport || { width: 390, height: 844 }, locale: locale || "zh-CN", hasTouch: true });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  t.after(() => p.close());
  return { p, errors };
}
const studioLabel = (locale) => (locale === "en-US" ? "Tape4" : "四轨机");
/* the tile, then the screen; the tape is read after open, so wait for the demo kick (step 1) */
async function openTile(p, locale = "zh-CN") {
  await p.locator("#home .app", { hasText: studioLabel(locale) }).click();
  await p.waitForSelector("#v-studio:not([hidden])");
  await p.waitForFunction(() => document.querySelector("#v-studio").getAttribute("data-loaded") === "true");
  await p.waitForFunction(() => document.querySelectorAll("#v-studio .st-cell").length === 16);
  await p.waitForFunction(() => {
    const c = document.querySelector('#v-studio .st-cell[data-step="0"]');
    return c && c.classList.contains("on");
  });
}
async function studioOpen(p, locale = "zh-CN") {
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p, locale);
}
const tourBox = (p) => p.locator("#v-studio .st-tour-box");
const tourText = (p) => p.textContent("#v-studio .st-tour-box p");
/* existing tests that need the whole screen press B once; the first open's tour would cover it */
async function skipTour(p) {
  await p.waitForSelector("#v-studio .st-tour-box");
  await p.keyboard.press("z");
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
}
/* screens that another test only passes through: dismiss a per-screen tour it happens to start (12.10) */
async function skipScreenTour(p) {
  if (await p.locator("#v-studio .st-tour-box").count()) {
    await p.keyboard.press("z");
    await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  }
}
async function openMenu(p) {
  await p.click("#studio-menu");
  await p.waitForSelector("#studio-sheet:not([hidden])");
}
async function openEdit(p) {
  await openMenu(p);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "编辑" }).click();
  await p.waitForSelector("#studio-sheet .lcd-menu");
}
async function openFileMenu(p) {
  await openMenu(p);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "文件" }).click();
  await p.waitForSelector("#studio-sheet .lcd-menu");
}
async function openFolders(p) {
  await openMenu(p);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "磁带库" }).click();
  await p.waitForSelector("#studio-sheet .st-proj-list");
  await p.waitForFunction(() => !/读取中/.test((document.querySelector("#studio-sheet .st-proj-list") || {}).textContent || ""));
}
async function openMyTapes(p) {
  if (await p.isHidden("#studio-sheet")) await openFolders(p);
  await p.locator("#studio-sheet .st-proj-list li", { hasText: "我的磁带" }).click();
  await p.waitForSelector("#studio-sheet .st-proj-list");
}
async function openDemo(p) {
  if (await p.isHidden("#studio-sheet")) await openFolders(p);
  await p.locator("#studio-sheet .st-proj-list li", { hasText: "示例" }).first().click();
  await p.waitForSelector("#studio-sheet .st-proj-list");
}
async function useTemplate(p, name) {
  await openDemo(p);
  await p.locator("#studio-sheet .st-proj-list li", { hasText: name }).click();
  await p.waitForSelector("#studio-sheet .st-ask");
  await p.locator("#studio-sheet .st-ask .btn", { hasText: "确认" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
}
async function waitTour(p, re) {
  await p.waitForFunction((src) => {
    const t = document.querySelector("#v-studio .st-tour-box p");
    return t && new RegExp(src).test(t.textContent);
  }, re.source);
}
/* Counts every drum hit and melodic note the studio schedules, and every chainEvents call; installed before boot
   because that is when the synth and the song helper are defined. */
async function hitCountingPage(t) {
  const { p, errors } = await rtPage(t);
  await p.addInitScript(() => {
    let synth, song;
    Object.defineProperty(window, "LopdaSong", {
      configurable: true,
      get() { return song; },
      set(v) {
        if (v && typeof v.chainEvents === "function" && !v.__chainWrapped) {
          const chainEvents = v.chainEvents;
          v.chainEvents = function (sg, chain, from, to) {
            const ev = chainEvents.call(v, sg, chain, from, to);
            window.__studioScheduled = to;      /* the scheduler's frontier after this call */
            window.__studioChain.push({
              chain: chain.slice(), from, to,
              events: ev.map((e) => ({ p: e.p, tick: e.tick, track: e.track, key: e.key, vel: e.vel })),
            });
            return ev;
          };
          const chainAt = v.chainAt;
          v.chainAt = function (sg, chain, tick) {
            if (typeof tick === "number") window.__studioHeard = tick;   /* the tick the player asks about */
            return chainAt.call(v, sg, chain, tick);
          };
          v.__chainWrapped = true;
        }
        song = v;
      }
    });
    Object.defineProperty(window, "LopdaStudioSynth", {
      configurable: true,
      get() { return synth; },
      set(v) {
        if (v && typeof v.create === "function" && !v.__hitsWrapped) {
          const create = v.create;
          v.create = function (ctx, out) {
            const s = create.call(v, ctx, out);
            const hit = s.hit;
            s.hit = function (kit, drum, at, vel) {
              window.__studioHits.push({ kit, drum, at, vel, wall: performance.now() });
              return hit.apply(s, arguments);
            };
            const note = s.note;
            s.note = function (voice, midi, at, dur, vel) {
              window.__studioNotes.push({ voice, midi, at, dur, vel, wall: performance.now() });
              return note.apply(s, arguments);
            };
            return s;
          };
          v.__hitsWrapped = true;
        }
        synth = v;
      }
    });
    window.__studioHits = [];
    window.__studioNotes = [];
    window.__studioChain = [];
    window.__studioHeard = 0;
    window.__studioScheduled = 0;
  });
  return { p, errors };
}
const storedKick = (p, step) => p.evaluate(async (n) => {
  const meta = (await LopdaPlatform.db.doc("data/users/local/studio").get()).data();
  const item = await LopdaPlatform.db.doc("data/users/local/studio/items/" + meta.current).get();
  return !!item.data().patterns[0].notes.drums.some((x) => x.key === "kick" && Math.round(x.t / 24) === n);
}, step);
const storedSong = (p) => p.evaluate(async () => {
  const meta = (await LopdaPlatform.db.doc("data/users/local/studio").get()).data();
  const item = await LopdaPlatform.db.doc("data/users/local/studio/items/" + meta.current).get();
  return item.data();
});
/* wait for the debounced save to land in IndexedDB: want.song, or want.pat's track as [t, len, deg] rows.
   Polled from Node: page.waitForFunction does not unwrap an async predicate's promise (it reads the promise as
   truthy), so an async predicate there would pass at once. */
function storedMatches(data, want) {
  if (want.song && JSON.stringify(data.song) !== JSON.stringify(want.song)) return false;
  if (want.key != null && data.key !== want.key) return false;
  if (want.scale != null && data.scale !== want.scale) return false;
  if (want.swing != null && data.swing !== want.swing) return false;
  if (want.tape != null && data.tape !== want.tape) return false;
  if (want.tracks) {
    for (const [id, fields] of Object.entries(want.tracks)) {
      const tr = (data.tracks || []).find((x) => x.id === id);
      if (!tr) return false;
      for (const [k, v] of Object.entries(fields)) if (tr[k] !== v) return false;
    }
  }
  if (want.pat != null) {
    const pat = data.patterns && data.patterns[want.pat];
    if (!pat) return false;
    if (want.notes) {
      const list = (pat.notes && pat.notes[want.track]) || [];
      if (JSON.stringify(list.map((n) => [n.t, n.len, n.deg])) !== JSON.stringify(want.notes)) return false;
    }
  }
  return true;
}
async function waitStored(p, want, timeout = 6000) {
  const end = Date.now() + timeout;
  for (;;) {
    let data = null;
    try { data = await storedSong(p); } catch { /* not written yet */ }
    if (data && storedMatches(data, want)) return;
    if (Date.now() > end) throw new Error("the stored tape never matched " + JSON.stringify(want));
    await p.waitForTimeout(50);
  }
}
/* the kick steps of one stored pattern, as 0-based step numbers */
async function waitKicks(p, pat, steps, timeout = 6000) {
  const end = Date.now() + timeout;
  for (;;) {
    let data = null;
    try { data = await storedSong(p); } catch { /* not written yet */ }
    const list = data && data.patterns[pat] ? data.patterns[pat].notes.drums : null;
    if (list) {
      const got = list.filter((n) => n.key === "kick").map((n) => Math.round(n.t / 24));
      if (JSON.stringify(got) === JSON.stringify(steps)) return;
    }
    if (Date.now() > end) throw new Error(`stored pattern ${pat} kicks never became ${JSON.stringify(steps)}`);
    await p.waitForTimeout(50);
  }
}
const cellOn = (p, step) => p.locator(`#v-studio .st-cell[data-step="${step}"]`).evaluate((c) => c.classList.contains("on"));
async function cellWidths(p) {
  return p.$$eval("#v-studio .st-cell", (cells) => cells.map((c) => {
    const b = c.getBoundingClientRect();
    return { w: b.width, h: b.height };
  }));
}
/* a stored demo tape with a chosen chain and tempo, tours already seen: the four demo bars are distinct, which is
   what the song player's bar tests need */
async function preparedTape(p, chain, bpm) {
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.evaluate(async ({ chain, bpm }) => {
    const song = LopdaSong.demoSong(Date.now());
    song.bpm = bpm;
    song.song = chain.slice();
    await LopdaPlatform.db.doc("data/users/local/studio").set({
      current: "studio-chain", hushTip: true,
      toured: { rhythm: true, notes: true, chords: true, song: true },
    });
    await LopdaPlatform.db.doc("data/users/local/studio/items/studio-chain").set(song);
  }, { chain, bpm });
  await openTile(p);
  await p.click('#studio-screens .st-scr[data-screen="song"]');
}
const chainLetters = (p) => p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
/* open the sheet of slot idx: the first tap selects it, the second opens it (if it was already selected, one tap) */
async function openSlotSheet(p, idx) {
  const cell = p.locator("#studio-chain .st-chain-cell").nth(idx);
  await cell.click();
  if (await p.locator("#studio-sheet").isHidden()) await cell.click();
  await p.waitForSelector("#studio-sheet:not([hidden])");
}
/* Read the synth calls back as one pattern per absolute bar. Every demo bar starts with a kick on tick 0, so the
   earliest kick is bar 0; each event's absolute tick comes from its audio time and the tempo. Drums plus bass and
   melody identify a demo pattern (chords are left out: one chord event expands to several synth notes). */
async function scheduledBarPatterns(p, bpm) {
  return p.evaluate((bpm) => {
    const BAR = LopdaSong.STEPS * LopdaSong.STEP, TPS = bpm * LopdaSong.TPB / 60;
    const hits = window.__studioHits, notes = window.__studioNotes;
    let at0 = Infinity;
    for (const h of hits) if (h.drum === "kick" && h.at < at0) at0 = h.at;
    if (!isFinite(at0)) return { bars: [], at0: null };
    const buckets = new Map();
    const put = (tok, at) => {
      const tick = (at - at0) * TPS;
      const bar = Math.max(0, Math.floor((tick + 0.5) / BAR));
      const step = Math.round((tick - bar * BAR) / LopdaSong.STEP) % LopdaSong.STEPS;
      if (!buckets.has(bar)) buckets.set(bar, new Set());
      buckets.get(bar).add(tok + ":" + ((step + LopdaSong.STEPS) % LopdaSong.STEPS));
    };
    for (const h of hits) put("d:" + h.drum, h.at);
    for (const n of notes) {
      if (n.voice === "keys") continue;
      put((n.voice === "flute" ? "m:" : "b:") + n.midi, n.at);
    }
    const demo = LopdaSong.demoSong(), sigs = [];
    for (let pat = 0; pat < 4; pat++) {
      const set = new Set();
      for (const e of LopdaSong.events(demo, pat, 0, BAR)) {
        if (!e.vel) continue;
        if (e.track === "drums") set.add("d:" + e.key + ":" + Math.round(e.tick / LopdaSong.STEP));
        else if (e.track === "bass" || e.track === "melody") {
          const midi = LopdaSong.noteMidi(demo, e.track, e.deg);
          if (midi != null) set.add((e.track === "bass" ? "b:" : "m:") + midi + ":" + Math.round(e.tick / LopdaSong.STEP));
        }
      }
      sigs.push([...set].sort().join("|"));
    }
    const last = Math.max(...buckets.keys());
    const bars = [];
    for (let bar = 0; bar <= last; bar++) {
      const sig = [...(buckets.get(bar) || [])].sort().join("|");
      bars.push({ bar, sig, pats: sigs.map((s, i) => s === sig ? i : -1).filter((x) => x >= 0) });
    }
    return { bars, at0 };
  }, bpm);
}
function assertBars(bars, expected) {
  assert.ok(bars.length >= expected.length, `saw ${bars.length} bars, wanted ${expected.length}: ${JSON.stringify(bars)}`);
  const seen = bars.slice(0, expected.length);
  for (const b of seen) assert.equal(b.pats.length, 1, `bar ${b.bar} has events of exactly one demo pattern: ${JSON.stringify(b)}`);
  assert.deepEqual(seen.map((b) => b.pats[0]), expected, `bar patterns: ${JSON.stringify(seen)}`);
}

test("studio: the tape opens from home with the demo beat's kick on the grid", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  assert.equal(await p.locator("#v-studio .st-cell").count(), 16);
  const on = await p.$$eval("#v-studio .st-cell", (cells) => cells.map((c, i) => (c.classList.contains("on") ? i + 1 : 0)).filter(Boolean));
  assert.deepEqual(on, [1, 8, 11], "the demo kick: steps 1, 8 and 11");
  assert.equal(await p.locator("#v-studio .st-tab.on").getAttribute("data-drum"), "kick");
  assert.match(await p.textContent("#studio-bpm"), /82 BPM/);
  assert.equal(await p.locator("#studio-tour").count(), 1);
  assert.equal(await p.locator("#studio-menu").count(), 1);
  assert.deepEqual(errors, []);
});

test("studio: a tapped cell stays on after leaving and reloading", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  assert.equal(await cellOn(p, 1), false);
  await p.locator('#v-studio .st-cell[data-step="1"]').click();
  assert.equal(await cellOn(p, 1), true, "the cell turned on");
  await p.click("#home-key");
  await p.waitForTimeout(250);   /* leave flushes; give the write a moment before the page goes */
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  assert.equal(await cellOn(p, 1), true, "still on after the reload");
  assert.equal(await cellOn(p, 0), true, "the demo beat is still there");
  assert.deepEqual(errors, []);
});

test("studio: play lights the step being heard, and HOME stops it", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await p.click("#studio-play");
  assert.equal(await p.getAttribute("#v-studio", "data-playing"), "true");
  await p.waitForTimeout(600);
  assert.ok(await p.locator("#v-studio .st-cell.playing").count() >= 1, "a step is lit while it sounds");
  await p.click("#home-key");
  await p.waitForFunction(() => document.querySelector("#v-studio").getAttribute("data-playing") === "false");
  assert.equal(await p.locator("#v-studio .st-cell.playing").count(), 0, "no step is lit after HOME");
  assert.equal((await p.textContent("#studio-play-glyph")).trim(), "", "the triangle is drawn in CSS, not a glyph");
  const glyph = await p.locator("#studio-play-glyph").evaluate((g) => {
    const s = getComputedStyle(g);
    return { w: s.width, borderLeft: s.borderLeftWidth, playing: g.parentNode.getAttribute("data-playing") };
  });
  assert.equal(glyph.playing, "false");
  assert.equal(glyph.borderLeft, "14px");
  assert.deepEqual(errors, []);
});

test("studio: a new tape while playing keeps the beat going at the new tempo", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await hitCountingPage(t);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await skipTour(p);
  for (let i = 0; i < 19; i++) await p.click("#studio-plus");   /* 82 -> 120 */
  assert.match(await p.textContent("#studio-bpm"), /120 BPM/);
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").getAttribute("data-playing") === "true");
  await p.waitForTimeout(1500);
  const before = await p.evaluate(() => window.__studioHits.length);
  assert.ok(before > 0, "the 120 BPM tape is scheduling hits");

  await openEdit(p);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "清空这一盘" }).click();
  await p.locator("#studio-sheet .st-ask .btn").first().click();       /* 确认 */
  const at = Date.now();
  await p.waitForFunction((n) => window.__studioHits.length > n, before, { timeout: 1500 });
  const waited = Date.now() - at;
  t.diagnostic(`first hit after the 82 BPM tape: ${waited} ms`);
  assert.ok(waited < 500, `hits keep coming within 0.5 s (${waited} ms)`);
  assert.match(await p.textContent("#studio-bpm"), /82 BPM/);
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").getAttribute("data-playing") === "false");
  assert.deepEqual(errors, []);
});

test("studio: an edit whose write failed is still there after HOME and reopen", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.waitForFunction(async () => {
    const meta = (await LopdaPlatform.db.doc("data/users/local/studio").get()).data();
    if (!meta || !meta.current) return false;
    const item = await LopdaPlatform.db.doc("data/users/local/studio/items/" + meta.current).get();
    return item.exists;
  });
  await p.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.__studioFailItemWrites = true;
    IDBObjectStore.prototype.put = function (value, key) {
      if (window.__studioFailItemWrites && value && typeof value.path === "string" && value.path.indexOf("/studio/items/") >= 0) {
        throw new Error("test: the tape write failed");
      }
      return put.call(this, value, key);
    };
  });
  assert.equal(await cellOn(p, 1), false);
  await p.locator('#v-studio .st-cell[data-step="1"]').click();
  assert.equal(await cellOn(p, 1), true);

  await p.click("#home-key");
  await p.waitForSelector("#toast:not([hidden])");
  assert.match(await p.textContent("#toast"), /存档失败/);
  assert.equal(await storedKick(p, 1), false, "the failed write left the stored tape alone");

  await openTile(p);
  assert.equal(await cellOn(p, 1), true, "reopening does not read the stale tape over the edit");
  assert.equal(await cellOn(p, 0), true);
  assert.deepEqual(errors, []);
});

test("studio: a broken tape is kept and a fresh one takes its place", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.evaluate(async () => {
    await LopdaPlatform.db.doc("data/users/local/studio").set({ current: "broken-tape", toured: { kept: true }, hushTip: false, extra: 7 });
    await LopdaPlatform.db.doc("data/users/local/studio/items/broken-tape").set({ v: 99, nope: true });
  });
  await openTile(p);
  await p.waitForSelector("#toast:not([hidden])");
  assert.match(await p.textContent("#toast"), /读不出来/);
  const saved = await p.evaluate(async () => {
    const broken = await LopdaPlatform.db.doc("data/users/local/studio/items/broken-tape").get();
    const meta = await LopdaPlatform.db.doc("data/users/local/studio").get();
    return { broken: broken.data(), meta: meta.data() };
  });
  assert.equal(saved.broken.v, 99, "the broken tape is never written over");
  assert.deepEqual(saved.broken.nope, true);
  assert.notEqual(saved.meta.current, "broken-tape");
  assert.equal(saved.meta.extra, 7, "unknown fields in the studio meta survive");
  assert.equal(saved.meta.toured.kept, true);
  assert.equal(await p.locator("#v-studio .st-cell.on").count() >= 3, true, "the fresh tape has the demo beat");
  assert.deepEqual(errors, []);
});

test("studio: at 375x667 the screen does not scroll and every cell is at least 56 px", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t, { width: 375, height: 667 });
  await studioOpen(p);
  const m = await p.evaluate(() => {
    const v = document.querySelector("#v-studio");
    return { scroll: v.scrollHeight, client: v.clientHeight };
  });
  assert.ok(m.scroll <= m.client, `no scrolling (${m.scroll} <= ${m.client})`);
  const cells = await cellWidths(p);
  assert.equal(cells.length, 16);
  const small = cells.filter((c) => c.w < 56 || c.h < 56);
  assert.deepEqual(small, [], `every cell is at least 56 px: ${JSON.stringify(cells.map((c) => Math.round(c.w)))}`);
  assert.deepEqual(errors, []);
});

/* ---------------- the tour (runtime/apps/studio.js, docs/design/studio.md 11.6) ---------------- */
const touredRhythm = (p) => p.evaluate(async () => {
  const doc = await LopdaPlatform.db.doc("data/users/local/studio").get();
  return !!(doc.exists && doc.data().toured && doc.data().toured.rhythm === true);
});
async function firstOpenTour(p, locale = "zh-CN") {
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p, locale);
  await p.waitForSelector("#v-studio .st-tour-box");
}
const tourHi = (p) => p.locator("#v-studio .st-tour-hi").getAttribute("id");
/* the five steps, visited with the same taps a player uses; visits get the step number */
async function walkTour(p, visit, en) {
  await visit(0);
  await p.click("#studio-play");
  await waitTour(p, en ? /These 16 squares/ : /这 16 格是一小节/);
  await visit(1);
  await p.locator("#v-studio .st-tour-next").click();
  await waitTour(p, en ? /Tap an empty square/ : /点一个空格/);
  await visit(2);
  await p.locator('#v-studio .st-cell[data-step="1"]').click();
  await waitTour(p, en ? /Four drums/ : /四只鼓各有自己的 16 格/);
  await visit(3);
  await p.locator('#studio-tabs .st-tab[data-drum="snare"]').click();
  await waitTour(p, en ? /set the speed/ : /调快慢/);
  await visit(4);
}

test("studio tour: the first open walks five steps from play to Done", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await firstOpenTour(p);
  assert.match(await tourText(p), /按 ▸ 听听这盘磁带。/);
  assert.equal(await tourHi(p), "studio-play");
  assert.equal(await p.locator("#v-studio .st-tour-next").isVisible(), false, "an action step has no Next");
  assert.equal(await p.locator("#v-studio .st-tour-skip").isVisible(), true, "every step can skip");

  await p.click("#studio-play");
  await waitTour(p, /这 16 格是一小节/);
  assert.equal(await tourHi(p), "studio-grid");
  assert.equal(await p.locator("#studio-tabs .st-tab.on").getAttribute("data-drum"), "kick", "the kick grid is the one shown");
  assert.equal(await p.locator("#v-studio .st-tour-next").isVisible(), true, "a Next step has Next");
  assert.equal(await p.locator("#toast").evaluate((e) => getComputedStyle(e).zIndex), "60", "the hush toast rises above the bubble");
  await p.locator("#v-studio .st-tour-next").click();
  await waitTour(p, /点一个空格/);
  assert.equal(await tourHi(p), "studio-grid", "step 3 still frames the grid");
  assert.equal(await p.locator("#v-studio .st-tour-next").isVisible(), false, "step 3 waits for a toggle");

  assert.equal(await cellOn(p, 1), false);
  await p.locator('#v-studio .st-cell[data-step="1"]').click();
  await waitTour(p, /四只鼓各有自己的 16 格/);
  assert.equal(await cellOn(p, 1), true, "the tap that moved the tour on also toggled the cell");
  assert.equal(await tourHi(p), "studio-tabs");

  await p.locator('#studio-tabs .st-tab[data-drum="snare"]').click();
  await waitTour(p, /调快慢/);
  assert.equal(await tourHi(p), "studio-tempo", "step 5 frames −, the BPM and + together");
  assert.equal(await p.textContent("#v-studio .st-tour-next"), "好了", "the last step says Done");

  await p.locator("#v-studio .st-tour-next").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.equal(await p.locator("#toast").evaluate((e) => getComputedStyle(e).zIndex), "5", "the toast goes back to its own layer");
  assert.equal(await touredRhythm(p), true, "Done records the tour");
  assert.deepEqual(errors, []);
});

test("studio tour: at step 3 the play button still stops the beat and the tour stays", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await firstOpenTour(p);
  await p.click("#studio-play");
  await waitTour(p, /这 16 格是一小节/);
  await p.locator("#v-studio .st-tour-next").click();
  await waitTour(p, /点一个空格/);
  assert.equal(await p.getAttribute("#v-studio", "data-playing"), "true", "the beat is playing at step 3");

  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").getAttribute("data-playing") === "false");
  assert.match(await tourText(p), /点一个空格/, "stopping the beat does not move the tour");
  assert.equal(await tourHi(p), "studio-grid");
  assert.equal(await tourBox(p).count(), 1, "the bubble is still there");
  assert.deepEqual(errors, []);
});

test("studio tour: an untargeted + works at step 2 and does not end the tour", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await firstOpenTour(p);
  await p.click("#studio-play");
  await waitTour(p, /这 16 格是一小节/);
  assert.match(await p.textContent("#studio-bpm"), /82 BPM/);
  await p.click("#studio-plus");
  assert.match(await p.textContent("#studio-bpm"), /84 BPM/, "the + outside the target still works");
  assert.match(await tourText(p), /这 16 格是一小节/, "the tour stays on step 2");
  assert.equal(await tourHi(p), "studio-grid");
  await p.keyboard.press("z");
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.deepEqual(errors, []);
});

const intersects = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

test("studio tour: the bubble clears the bar and the target, and the play button stays reachable, both languages", { skip, timeout: 180000 }, async (t) => {
  for (const viewport of [{ width: 375, height: 667 }, { width: 430, height: 932 }]) {
    for (const locale of ["zh-CN", "en-US"]) {
      const { p, errors } = await rtPage(t, viewport, locale);
      await firstOpenTour(p, locale);
      await walkTour(p, async (i) => {
        const m = await p.evaluate(() => {
          const rect = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
          const view = document.querySelector("#v-studio");
          const bar = view.querySelector(".st-bar");
          const box = document.querySelector("#v-studio .st-tour-box");
          const hi = document.querySelector("#v-studio .st-tour-hi");
          const play = document.querySelector("#studio-play").getBoundingClientRect();
          const hit = document.elementFromPoint(play.left + play.width / 2, play.top + play.height / 2);
          return {
            b: rect(box), t: rect(hi), bar: rect(bar), v: rect(view), inBar: bar.contains(hi),
            play: !!(hit && hit.closest && hit.closest("#studio-play")), hit: hit && (hit.id || hit.tagName),
          };
        });
        const where = `step ${i + 1} at ${viewport.width}x${viewport.height} ${locale}`;
        assert.ok(m.b.b <= m.t.t || m.b.t >= m.t.b, `${where}: the bubble is above or below the target (${JSON.stringify(m)})`);
        assert.equal(intersects(m.b, m.t), false, `${where}: the bubble never covers the target (${JSON.stringify(m)})`);
        if (!m.inBar) assert.equal(intersects(m.b, m.bar), false, `${where}: the bubble never covers the bar (${JSON.stringify(m)})`);
        assert.ok(m.play, `${where}: the play button's centre reaches #studio-play, not ${m.hit} (${JSON.stringify(m)})`);
        assert.ok(m.b.l >= m.v.l + 4 - 0.5 && m.b.r <= m.v.r - 4 + 0.5, `${where}: the bubble is inside the view with 4 px margins`);
      }, locale === "en-US");
      assert.equal(await touredRhythm(p), false, "the walk itself did not end the tour");
      await p.keyboard.press("z");
      await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
      assert.deepEqual(errors, []);
    }
  }
});

test("studio tour: a sheet hides the tour, is fully tappable, and the bubble comes back on step 5", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await firstOpenTour(p);
  await walkTour(p, async () => {});
  assert.match(await tourText(p), /调快慢/, "step 5 is showing");
  await p.click("#studio-menu");
  await p.waitForSelector("#studio-sheet:not([hidden])");
  if (await p.isVisible("#toast")) await p.waitForSelector("#toast", { state: "hidden" });

  const open = await p.evaluate(() => {
    const box = document.querySelector("#v-studio .st-tour-box");
    const hi = document.querySelector("#v-studio .st-tour-hi");
    const menu = document.querySelector("#studio-sheet .lcd-menu");
    const sh = menu.getBoundingClientRect();
    const rows = [...menu.querySelectorAll("li")].filter((li) => {
      const r = li.getBoundingClientRect();
      return r.top >= sh.top - 1 && r.bottom <= sh.bottom + 1;
    }).map((li) => {
      const r = li.getBoundingClientRect();
      const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { text: li.textContent.trim(), hit: !!(e && (e === li || li.contains(e))) };
    });
    return { box: getComputedStyle(box).display, outline: getComputedStyle(hi).outlineStyle, z: getComputedStyle(hi).zIndex, rows };
  });
  assert.equal(open.box, "none", "the bubble is hidden while the sheet is open");
  assert.equal(open.outline, "none", "the target's frame is hidden while the sheet is open");
  assert.equal(open.z, "auto", "the framed target cannot sit over the sheet");
  assert.ok(open.rows.length >= 3, `the menu has its rows (${JSON.stringify(open.rows)})`);
  for (const row of open.rows) assert.ok(row.hit, `the row's centre reaches it: ${row.text}`);

  /* the menu's way back is the 44 px button in its title row, always visible */
  const close = await p.locator("#studio-sheet .st-sheet-close").boundingBox();
  assert.ok(close.width >= 44 && close.height >= 44, "the menu's close button is a 44 px target");
  await p.mouse.click(close.x + close.width / 2, close.y + close.height / 2);
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.equal(await tourBox(p).isVisible(), true, "the bubble is back after the sheet closes");
  assert.match(await tourText(p), /调快慢/, "still on step 5");
  assert.equal(await tourHi(p), "studio-tempo");
  assert.equal(await p.locator("#v-studio .st-tour-hi").evaluate((e) => getComputedStyle(e).outlineStyle), "solid", "the frame is back");
  assert.deepEqual(errors, []);
});

test("studio tour: every colour it draws is one of the four tones", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  const tones = ["rgb(31, 42, 20)", "rgb(74, 90, 50)", "rgb(125, 138, 88)", "rgb(163, 173, 126)", "rgba(0, 0, 0, 0)", "transparent"];
  await firstOpenTour(p);
  const bad = [];
  await walkTour(p, async (i) => {
    bad.push(...(await p.evaluate((allowed) => {
      const props = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor"];
      const out = [];
      for (const el of document.querySelectorAll('#v-studio [class*="st-tour"]')) {
        const check = (s, pseudo) => {
          for (const prop of props) {
            const v = s[prop];
            if (!allowed.includes(v)) out.push({ cls: String(el.className), tag: el.id || el.tagName, pseudo, prop, v });
          }
        };
        check(getComputedStyle(el), "");
        for (const pseudo of ["::before", "::after"]) {
          const s = getComputedStyle(el, pseudo);
          if (s.content === "none" || s.content === "normal") continue;
          check(s, pseudo);
        }
      }
      return out;
    }, tones)).map((b) => ({ step: i + 1, ...b })));
  });
  assert.deepEqual(bad, [], "the tour paints only ink, dark, mid and paper");
  await p.keyboard.press("z");
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.deepEqual(errors, []);
});

test("studio tour: played before the tour, step 1 offers Next instead of waiting", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").getAttribute("data-playing") === "true");
  await p.click("#studio-tour");
  await p.waitForSelector("#v-studio .st-tour-box");
  assert.match(await tourText(p), /按 ▸ 听听这盘磁带。/);
  assert.equal(await p.locator("#v-studio .st-tour-next").isVisible(), true, "an already-done play step shows Next");
  assert.equal(await p.textContent("#v-studio .st-tour-next"), "下一步");
  await p.locator("#v-studio .st-tour-next").click();
  await waitTour(p, /这 16 格是一小节/);
  await p.keyboard.press("z");
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.deepEqual(errors, []);
});

test("studio tour: after Done a reopen has no tour; ? replays it", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await firstOpenTour(p);
  await p.locator("#v-studio .st-tour-skip").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  await p.waitForFunction(async () => {
    const doc = await LopdaPlatform.db.doc("data/users/local/studio").get();
    return !!(doc.exists && doc.data().toured && doc.data().toured.rhythm === true);
  });

  await p.click("#home-key");
  await p.waitForTimeout(250);
  await openTile(p);
  assert.equal(await tourBox(p).count(), 0, "the tour does not come back by itself");

  await p.click("#studio-tour");
  await p.waitForSelector("#v-studio .st-tour-box");
  assert.match(await tourText(p), /按 ▸ 听听这盘磁带。/, "? starts again from step 1");
  await p.keyboard.press("z");
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.deepEqual(errors, []);
});

test("studio tour: Skip ends it and a reload stays quiet", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await firstOpenTour(p);
  await p.locator("#v-studio .st-tour-skip").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  await p.waitForFunction(async () => {
    const doc = await LopdaPlatform.db.doc("data/users/local/studio").get();
    return !!(doc.exists && doc.data().toured && doc.data().toured.rhythm === true);
  });

  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  assert.equal(await tourBox(p).count(), 0, "a reload does not bring it back");
  assert.equal(await touredRhythm(p), true);
  assert.deepEqual(errors, []);
});

test("studio tour: z ends it", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await firstOpenTour(p);
  await p.keyboard.press("z");
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.equal(await p.locator("#studio-sheet").isHidden(), true, "B closed the tour, not a sheet");
  assert.equal(await touredRhythm(p), true, "B records the tour");
  assert.deepEqual(errors, []);
});

test("studio tour: HOME ends it unseen, so the next open shows it again", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await firstOpenTour(p);
  await p.click("#home-key");
  await p.waitForTimeout(250);
  assert.equal(await touredRhythm(p), false, "HOME does not record the tour as seen");
  await openTile(p);
  await p.waitForSelector("#v-studio .st-tour-box");
  assert.match(await tourText(p), /按 ▸ 听听这盘磁带。/);
  await p.keyboard.press("z");
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.deepEqual(errors, []);
});

/* ---------------- the note, chord and song tours (docs/design/studio.md 12.10) ---------------- */
const touredAny = (p) => p.evaluate(async () => {
  const doc = await LopdaPlatform.db.doc("data/users/local/studio").get();
  return (doc.exists && doc.data().toured) || {};
});
async function tourTarget(p) {
  return p.evaluate(() => {
    const e = document.querySelector("#v-studio .st-tour-hi");
    return e ? { id: e.id, cls: String(e.className) } : null;
  });
}
/* each walk assumes its screen is showing and its tour is on step 1 */
async function walkNotesTour(p, visit) {
  await visit(0);
  await p.locator('#studio-grid .st-cell[data-step="5"]').click();
  await waitTour(p, /8 个键|8 keys/);
  await visit(1);
  await p.locator('#studio-keys .st-key[data-deg="2"]').click();
  await waitTour(p, /想断开就放一个「停」|place a Rest/);
  await visit(2);
}
async function walkChordsTour(p, visit) {
  await visit(0);
  /* both demo halves already hold a chord: the first tap selects one and is enough for step 1 */
  await p.locator('.st-chord-cell[data-half="1"]').click();
  await waitTour(p, /点一个和弦|Tap a chord/);
  await visit(1);
}
async function walkSongTour(p, visit) {
  await visit(0);
  await p.locator("#v-studio .st-tour-next").click();
  await waitTour(p, /这一串|This row/);
  await visit(1);
  /* the sheet hides the bubble: tap the selected slot, then a letter in the slot sheet */
  await p.locator("#studio-chain .st-chain-cell").nth(0).click();
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="0"]').click();
  await waitTour(p, /在前面插一段|insert before it/);
  await visit(2);
}
const NEW_TOURS = [
  { screen: "bass", key: "notes", first: /16 格还是一小节|16 squares are still one bar/, done: /点一个空格|Tap an empty one/ },
  { screen: "chords", key: "chords", first: /一小节两格|Two squares per bar/, done: /点一个和弦|Tap a chord/ },
  { screen: "song", key: "song", first: /十六段|sixteen patterns/, done: /加一段|adds a slot/ },
];

test("studio tour: the note, chord and song tours walk their steps to Done; a reopen is quiet and ? replays each", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);

  /* the note tour, on bass */
  await p.click('#studio-screens .st-scr[data-screen="bass"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, NEW_TOURS[0].first);
  assert.deepEqual(await tourTarget(p), { id: "studio-grid", cls: "st-grid st-tour-hi" }, "step 1 frames the grid");
  assert.equal(await p.locator("#v-studio .st-tour-next").isVisible(), false, "step 1 waits for a note");
  await walkNotesTour(p, async (i) => {
    if (i === 0) return;
    if (i === 1) {
      assert.deepEqual((await tourTarget(p)).id, "studio-keys-wrap", "step 2 frames the pitch keys");
      assert.match(await tourText(p), /点一个，换这一格的音高|change this square's pitch/);
    } else {
      assert.deepEqual((await tourTarget(p)).id, "studio-grid", "step 3 frames the grid again");
      assert.equal(await p.textContent("#v-studio .st-tour-next"), "好了", "the last note step says Done");
    }
  });
  await p.locator("#v-studio .st-tour-next").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.equal((await touredAny(p)).notes, true, "Done records the shared note tour");

  /* the chord tour */
  await p.click('#studio-screens .st-scr[data-screen="chords"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, NEW_TOURS[1].first);
  assert.deepEqual((await tourTarget(p)).id, "studio-chord-cells", "step 1 frames the two chord cells");
  assert.match(await tourText(p), /点一格选中它|Tap one to select it/);
  assert.equal(await p.locator("#v-studio .st-tour-next").isVisible(), false, "step 1 waits for a chord cell to be selected");
  await walkChordsTour(p, async (i) => {
    if (i === 1) {
      assert.deepEqual((await tourTarget(p)).id, "studio-chord-keys", "step 2 frames the chord keys");
      assert.match(await tourText(p), /点一个和弦换掉它|Tap a chord to change it/);
      assert.equal(await p.textContent("#v-studio .st-tour-next"), "好了", "the last chord step says Done");
    }
  });
  await p.locator("#v-studio .st-tour-next").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.equal((await touredAny(p)).chords, true, "Done records the chord tour");

  /* the song tour */
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, NEW_TOURS[2].first);
  assert.deepEqual((await tourTarget(p)).id, "studio-pat", "step 1 frames the pattern letter");
  assert.equal(await p.locator("#v-studio .st-tour-next").isVisible(), true, "step 1 offers Next");
  await walkSongTour(p, async (i) => {
    if (i === 1) {
      assert.deepEqual((await tourTarget(p)).id, "studio-chain", "step 2 frames the chain");
      assert.equal(await tourText(p), "这一串就是整首歌，从左往右放，一行四小节。点一格选中，再点一次换字母。", "step 2's exact text");
      assert.equal(await p.locator("#v-studio .st-tour-next").isVisible(), false, "step 2 waits for a letter tap");
    } else if (i === 2) {
      const target = await tourTarget(p);
      assert.match(target.cls, /st-song-btns/, "step 3 frames the + row");
      assert.equal(await p.locator("#v-studio .st-tour-hi #studio-add").count(), 1, "the framed row is the + button's row");
      assert.match(await tourText(p), /点选中的格|Tap the selected slot/, "the new song step 3 text");
      assert.equal(await p.locator("#v-studio .st-tour-next").textContent(), "好了", "the last song step says Done");
    }
  });
  await p.locator("#v-studio .st-tour-next").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.equal((await touredAny(p)).song, true, "Done records the song tour");

  /* every screen is quiet now, and still quiet after a real page reload */
  for (const tour of NEW_TOURS) {
    await p.click(`#studio-screens .st-scr[data-screen="${tour.screen}"]`);
    assert.equal(await p.locator("#v-studio .st-tour-box").count(), 0, `${tour.screen} does not bring its tour back`);
  }
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  for (const tour of NEW_TOURS) {
    await p.click(`#studio-screens .st-scr[data-screen="${tour.screen}"]`);
    assert.equal(await p.locator("#v-studio .st-tour-box").count(), 0, `${tour.screen} stays quiet after a reload`);
  }

  /* ? replays the tour of the screen being shown */
  for (const tour of NEW_TOURS) {
    await p.click(`#studio-screens .st-scr[data-screen="${tour.screen}"]`);
    await p.click("#studio-tour");
    await p.waitForSelector("#v-studio .st-tour-box");
    await waitTour(p, tour.first);
    assert.equal((await tourTarget(p)).id, tour.screen === "song" ? "studio-pat" : tour.screen === "chords" ? "studio-chord-cells" : "studio-grid",
      `${tour.screen}: ? starts its own tour at step 1`);
    await p.keyboard.press("z");
    await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  }
  assert.deepEqual(errors, []);
});

test("studio tour: a tour on bass counts for melody too", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="bass"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, NEW_TOURS[0].first);
  await walkNotesTour(p, async () => {});
  await p.locator("#v-studio .st-tour-next").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.equal((await touredAny(p)).notes, true);

  await p.click('#studio-screens .st-scr[data-screen="melody"]');
  assert.equal(await p.locator("#v-studio .st-tour-box").count(), 0, "melody shares the note tour's key");
  await p.click("#studio-tour");
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, NEW_TOURS[0].first);
  assert.deepEqual((await tourTarget(p)).id, "studio-grid");
  await p.keyboard.press("z");
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.deepEqual(errors, []);
});

test("studio tour: switching screen mid-tour ends it unseen, starts the new screen's tour, and going back shows the first again", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);

  await p.click('#studio-screens .st-scr[data-screen="bass"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, NEW_TOURS[0].first);
  await p.locator('#studio-grid .st-cell[data-step="5"]').click();
  await waitTour(p, /8 个键|8 keys/);
  assert.deepEqual((await touredAny(p)).notes, undefined, "the unfinished tour is not seen yet");

  await p.click('#studio-screens .st-scr[data-screen="chords"]');
  await p.waitForFunction(() => {
    const t = document.querySelector("#v-studio .st-tour-box p");
    return t && /一小节两格|Two squares per bar/.test(t.textContent);
  });
  assert.deepEqual((await touredAny(p)).notes, undefined, "switching away leaves the note tour unseen");
  assert.deepEqual((await tourTarget(p)).id, "studio-chord-cells", "the chord tour starts by itself");

  await p.click('#studio-screens .st-scr[data-screen="bass"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, NEW_TOURS[0].first);
  assert.deepEqual((await tourTarget(p)).id, "studio-grid", "going back shows the unfinished note tour from step 1");
  assert.deepEqual((await touredAny(p)).chords, undefined, "the interrupted chord tour is unseen too");
  await p.keyboard.press("z");
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.deepEqual(errors, []);
});

test("studio tour: the pitch step waits for a key that sets a selected note", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="bass"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, NEW_TOURS[0].first);

  await p.locator('#studio-grid .st-cell[data-step="5"]').click();
  await waitTour(p, /8 个键|8 keys/);
  /* tapping the selected cell again removes it and clears the selection */
  await p.locator('#studio-grid .st-cell[data-step="5"]').click();
  assert.equal(await p.locator("#v-studio .st-tour-hi").getAttribute("id"), "studio-keys-wrap", "still on step 2");
  await p.locator('#studio-keys .st-key[data-deg="3"]').click();
  assert.match(await tourText(p), /8 个键|8 keys/, "a key tap with no selected note does not advance");

  /* with a note selected again, a key tap sets its pitch and moves on */
  await p.locator('#studio-grid .st-cell[data-step="5"]').click();
  await p.locator('#studio-keys .st-key[data-deg="3"]').click();
  await waitTour(p, /再点一次|selected square/);
  assert.equal(await p.locator("#v-studio .st-tour-hi").getAttribute("id"), "studio-grid");
  await p.locator("#v-studio .st-tour-next").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.deepEqual(errors, []);
});

test("studio tour: a new tape from a note tour leaves the drums screen untoured and the note tour unseen", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="bass"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, NEW_TOURS[0].first);

  await openEdit(p);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "清空这一盘" }).click();
  await p.waitForSelector("#studio-sheet .st-ask");
  await p.locator("#studio-sheet .st-ask .btn", { hasText: "确认" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });

  assert.equal(await p.getAttribute("#v-studio", "data-screen"), "drums", "a new tape opens on the drums screen");
  assert.equal(await p.locator("#v-studio .st-tour-box").count(), 0, "the note tour does not stand on the drums screen");
  assert.deepEqual((await touredAny(p)).notes, undefined, "the unfinished note tour stays unseen");
  assert.deepEqual(errors, []);
});

/* the bubble on every new step: inside the view with its 4 px margin, off its target, and the play button still
   reaches #studio-play (the bar itself may be given up on the 331x359 screen, where there is no room) */
test("studio tour: every new step's bubble sits inside the view, off its target, and leaves play reachable, two sizes and both languages", { skip, timeout: 240000 }, async (t) => {
  for (const viewport of [{ width: 375, height: 667 }, { width: 375, height: 503 }]) {
    for (const locale of ["zh-CN", "en-US"]) {
      const { p, errors } = await rtPage(t, viewport, locale);
      await studioOpen(p, locale);
      await skipTour(p);
      const dims = await p.evaluate(() => {
        const r = document.querySelector("#v-studio").getBoundingClientRect();
        return [Math.round(r.width), Math.round(r.height)];
      });
      if (viewport.height === 503) assert.deepEqual(dims, [331, 359], "the short view is 331x359");
      const where = (screen, step) => `${screen} step ${step + 1} at ${viewport.width}x${viewport.height} ${locale}`;
      const check = async (screen, step) => {
        const m = await p.evaluate(() => {
          const rect = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
          const view = document.querySelector("#v-studio");
          const box = document.querySelector("#v-studio .st-tour-box");
          const hi = document.querySelector("#v-studio .st-tour-hi");
          const play = document.querySelector("#studio-play").getBoundingClientRect();
          const hit = document.elementFromPoint(play.left + play.width / 2, play.top + play.height / 2);
          return {
            v: rect(view), b: rect(box), t: rect(hi),
            play: !!(hit && hit.closest && hit.closest("#studio-play")), hit: hit && (hit.id || hit.tagName),
            outline: getComputedStyle(hi).outlineStyle,
          };
        });
        assert.ok(m.b.l >= m.v.l + 4 - 0.5 && m.b.r <= m.v.r - 4 + 0.5, `${where(screen, step)}: the bubble is inside the view horizontally`);
        assert.ok(m.b.t >= m.v.t + 4 - 0.5 && m.b.b <= m.v.b - 4 + 0.5, `${where(screen, step)}: the bubble is inside the view vertically`);
        assert.equal(intersects(m.b, m.t), false, `${where(screen, step)}: the bubble never covers the target`);
        if (screen === "bass") {
          if (step === 1) assert.ok(m.b.b <= m.t.t + 0.5, `${where(screen, step)}: the key bubble sits above the keys`);
          else assert.ok(m.b.t >= m.t.b - 0.5, `${where(screen, step)}: the bubble sits below the grid`);
        }
        assert.ok(m.play, `${where(screen, step)}: the play button's centre reaches #studio-play, not ${m.hit}`);
        assert.equal(m.outline, "solid", `${where(screen, step)}: the target is framed`);
        if (viewport.width === 375 && viewport.height === 667 && !(screen === "song" && step === 1)) {
          const nav = await p.evaluate(() => {
            const reaches = (el) => {
              const r = el.getBoundingClientRect();
              const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return !!(hit && (hit === el || el.contains(hit)));
            };
            return {
              pat: reaches(document.querySelector("#studio-pat")),
              tabs: [...document.querySelectorAll("#studio-screens .st-scr")].map(reaches),
            };
          });
          assert.equal(nav.pat, true, `${where(screen, step)}: the pattern letter stays tappable`);
          assert.deepEqual(nav.tabs, [true, true, true, true, true, true], `${where(screen, step)}: every screen tab stays tappable`);
        }
      };

      await p.click('#studio-screens .st-scr[data-screen="bass"]');
      await p.waitForSelector("#v-studio .st-tour-box");
      await waitTour(p, NEW_TOURS[0].first);
      await walkNotesTour(p, (i) => check("bass", i));
      await p.locator("#v-studio .st-tour-next").click();
      await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });

      await p.click('#studio-screens .st-scr[data-screen="chords"]');
      await p.waitForSelector("#v-studio .st-tour-box");
      await waitTour(p, NEW_TOURS[1].first);
      await walkChordsTour(p, (i) => check("chords", i));
      await p.locator("#v-studio .st-tour-next").click();
      await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });

      await p.click('#studio-screens .st-scr[data-screen="song"]');
      await p.waitForSelector("#v-studio .st-tour-box");
      await waitTour(p, NEW_TOURS[2].first);
      await walkSongTour(p, (i) => check("song", i));
      await p.locator("#v-studio .st-tour-next").click();
      await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });

      await p.click('#studio-screens .st-scr[data-screen="mixer"]');
      await p.waitForSelector("#v-studio .st-tour-box");
      await waitTour(p, /一行一条轨|One row per track/);
      await check("mixer", 0);
      await p.locator("#v-studio .st-tour-next").click();
      await check("mixer", 1);
      await p.locator("#v-studio .st-tour-next").click();
      await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
      assert.deepEqual(errors, []);
    }
  }
});

test("studio tour: every colour on the new screens and their tours is one of the four tones", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  const tones = ["rgb(31, 42, 20)", "rgb(74, 90, 50)", "rgb(125, 138, 88)", "rgb(163, 173, 126)", "rgba(0, 0, 0, 0)", "transparent"];
  await studioOpen(p);
  await skipTour(p);
  const bad = [];
  const scan = async (where) => {
    bad.push(...(await p.evaluate((allowed) => {
      const props = ["color", "backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "outlineColor"];
      const out = [];
      for (const el of document.querySelectorAll("#v-studio *")) {
        const check = (s, pseudo) => {
          for (const prop of props) {
            const v = s[prop];
            if (!allowed.includes(v)) out.push({ cls: String(el.className).slice(0, 40), tag: el.id || el.tagName, pseudo, prop, v });
          }
        };
        check(getComputedStyle(el), "");
        for (const pseudo of ["::before", "::after"]) {
          const s = getComputedStyle(el, pseudo);
          if (s.content === "none" || s.content === "normal") continue;
          check(s, pseudo);
        }
      }
      return out;
    }, tones)).map((b) => ({ where, ...b })));
  };

  await p.click('#studio-screens .st-scr[data-screen="bass"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, NEW_TOURS[0].first);
  await walkNotesTour(p, (i) => scan(`bass step ${i + 1}`));
  await p.locator("#v-studio .st-tour-next").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  await scan("bass screen");

  await p.click('#studio-screens .st-scr[data-screen="chords"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, NEW_TOURS[1].first);
  await walkChordsTour(p, (i) => scan(`chords step ${i + 1}`));
  await p.locator("#v-studio .st-tour-next").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  await scan("chords screen");

  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, NEW_TOURS[2].first);
  await walkSongTour(p, (i) => scan(`song step ${i + 1}`));
  await p.locator("#v-studio .st-tour-next").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  await scan("song screen");

  await p.click('#studio-screens .st-scr[data-screen="mixer"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, /一行一条轨|One row per track/);
  await scan("mixer step 1");
  await p.locator("#v-studio .st-tour-next").click();
  await scan("mixer step 2");
  await p.locator("#v-studio .st-tour-next").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  await scan("mixer screen");
  await p.click("#studio-mix-key");
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await scan("key sheet");
  await p.click("#studio-sheet .st-sheet-close");
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  await p.click("#studio-mix-sound");
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await scan("sound sheet");
  await p.click("#studio-sheet .st-sheet-close");
  await p.waitForSelector("#studio-sheet", { state: "hidden" });

  assert.deepEqual(bad, [], "the new screens and tours paint only ink, dark, mid and paper");
  assert.deepEqual(errors, []);
});

/* ---------------- the sixteen patterns, the note / chord / song screens and the player (docs/design/studio.md 12) ---------------- */
test("studio tour: selecting a rest cell advances the chord tour's first step and auditions nothing", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await hitCountingPage(t);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="chords"]');
  await skipScreenTour(p);

  /* a rest on the second half, then select the first half again, so the rest is not the selected cell */
  await p.locator('.st-chord-cell[data-half="1"]').click();
  await p.locator("#studio-chord-rest").click();
  await p.locator('.st-chord-cell[data-half="0"]').click();
  await p.click("#studio-tour");
  await p.waitForSelector("#v-studio .st-tour-box");
  await waitTour(p, /一小节两格|Two squares per bar/);
  assert.equal(await p.locator("#v-studio .st-tour-hi").getAttribute("id"), "studio-chord-cells");

  const before = await p.evaluate(() => window.__studioNotes.length);
  await p.locator('.st-chord-cell[data-half="1"]').click();
  await waitTour(p, /点一个和弦|Tap a chord/);
  assert.equal(await p.evaluate(() => window.__studioNotes.length), before, "selecting a rest auditions nothing");
  assert.equal(await p.locator("#v-studio .st-tour-hi").getAttribute("id"), "studio-chord-keys", "the tour moved to step 2");
  await p.keyboard.press("z");
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.deepEqual(errors, []);
});

test("studio tour: B closes a visible sheet first, then the tour", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await firstOpenTour(p);
  assert.equal(await tourHi(p), "studio-play");
  await p.click("#studio-menu");
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await p.keyboard.press("z");
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.equal(await p.locator("#v-studio .st-tour-box").count(), 1, "the sheet closed, the tour stays");
  assert.equal(await tourHi(p), "studio-play", "still on the same step");
  await p.keyboard.press("z");
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.equal(await touredRhythm(p), true, "the second B ends the tour");
  assert.deepEqual(errors, []);
});

test("studio: the navigation row carries the pattern letter and six screens, and the demo's bass and chords show", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  assert.equal(await p.getAttribute("#v-studio", "data-screen"), "drums", "opening lands on drums");
  assert.equal(await p.getAttribute("#v-studio", "data-pat"), "0", "opening lands on pattern A");
  assert.equal(await p.textContent("#studio-pat"), "A");
  assert.equal(await p.getAttribute("#studio-pat", "aria-label"), "第 A 段");
  const patBox = await p.locator("#studio-pat").boundingBox();
  assert.ok(patBox.width >= 44 && patBox.height >= 44, "the letter button is 44x44");

  const tabs = await p.$$eval("#studio-screens .st-scr", (els) => els.map((e) => [e.dataset.screen, e.textContent.trim()]));
  assert.deepEqual(tabs.map((x) => x[0]), ["drums", "bass", "chords", "melody", "song", "mixer"]);
  assert.deepEqual(tabs.map((x) => x[1]), ["鼓", "贝斯", "和弦", "旋律", "歌曲", "调音台"]);

  await p.click('#studio-screens .st-scr[data-screen="bass"]');
  await skipScreenTour(p);
  assert.equal(await p.getAttribute("#v-studio", "data-screen"), "bass");
  assert.equal(await p.locator("#v-studio .st-cell").count(), 16);
  assert.equal(await p.locator("#studio-keys .st-key").count(), 8);
  const bass = await p.$$eval("#v-studio .st-cell", (els) => els.map((e) => e.textContent));
  assert.equal(bass[0], "A", "bass step 1 is A");
  assert.equal(bass[8], "D", "bass step 9 is D");
  assert.equal(bass[10], "E", "bass step 11 is E");
  assert.equal(await p.locator('#studio-screens .st-scr[data-screen="bass"] .st-dot.on').count(), 1, "the bass tab has a dot");

  await p.click('#studio-screens .st-scr[data-screen="chords"]');
  await skipScreenTour(p);
  const chords = await p.$$eval("#studio-chord-cells .st-chord-cell", (els) => els.map((e) => e.textContent));
  assert.match(chords[0], /i/, "first half is i");
  assert.match(chords[0], /Am9/, "first half is Am9");
  assert.match(chords[1], /iv/, "second half is iv");
  assert.match(chords[1], /Dm9/, "second half is Dm9");
  assert.deepEqual(errors, []);
});

test("studio: the mixer sets a track's level and mute, and they survive a reload", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="mixer"]');
  await skipScreenTour(p);
  assert.equal(await p.locator("#studio-mix-rows .st-mix-row").count(), 4, "four instrument rows");
  assert.deepEqual(await p.$$eval("#studio-mix-rows .st-mix-name", (els) => els.map((e) => e.textContent)), ["鼓", "贝斯", "和弦", "旋律"]);
  assert.match(await p.textContent("#studio-mix-key"), /调式 A · 小调五声/);
  assert.match(await p.textContent("#studio-mix-sound"), /磁带 2 · 摇摆 55%/);

  const drums = p.locator('#studio-mix-rows .st-mix-row[data-track="drums"]');
  assert.equal(await drums.locator(".st-mix-vol").textContent(), "10", "a fresh tape is at full level");
  await drums.locator(".st-mix-minus").click();
  await drums.locator(".st-mix-minus").click();
  assert.equal(await drums.locator(".st-mix-vol").textContent(), "8");
  await drums.locator(".st-mix-mute").click();
  assert.equal(await drums.locator(".st-mix-mute").getAttribute("aria-pressed"), "true");
  assert.equal(await drums.evaluate((e) => e.classList.contains("muted")), true);
  await waitStored(p, { tracks: { drums: { vol: 0.8, mute: true } } });

  await p.click("#home-key");
  await p.waitForTimeout(250);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await p.click('#studio-screens .st-scr[data-screen="mixer"]');
  await skipScreenTour(p);
  const back = p.locator('#studio-mix-rows .st-mix-row[data-track="drums"]');
  assert.equal(await back.locator(".st-mix-vol").textContent(), "8", "the level survives the reload");
  assert.equal(await back.locator(".st-mix-mute").getAttribute("aria-pressed"), "true", "the mute survives too");
  assert.deepEqual(errors, []);
});

test("studio: the mixer's level scales the scheduled hits and a muted track schedules nothing", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await hitCountingPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="mixer"]');
  await skipScreenTour(p);
  const drums = p.locator('#studio-mix-rows .st-mix-row[data-track="drums"]');
  for (let i = 0; i < 5; i++) await drums.locator(".st-mix-minus").click();       /* 10 -> 5 */
  await p.locator('#studio-mix-rows .st-mix-row[data-track="bass"] .st-mix-mute').click();
  assert.equal(await drums.locator(".st-mix-vol").textContent(), "5");
  await p.evaluate(() => { window.__studioHits.length = 0; window.__studioNotes.length = 0; });
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "pattern");
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => ({
    hits: window.__studioHits.map((h) => ({ drum: h.drum, vel: h.vel })),
    voices: [...new Set(window.__studioNotes.map((n) => n.voice))],
  }));
  assert.ok(r.hits.length > 0, "the drum track still plays");
  assert.ok(r.hits.every((h) => h.vel <= 0.5001), `every hit is at half velocity: ${JSON.stringify(r.hits.slice(0, 6))}`);
  assert.ok(r.hits.some((h) => h.drum === "kick" && h.vel > 0.49), "the kick is at 0.5");
  assert.equal(r.voices.includes("bass"), false, "the muted bass scheduled no notes");
  assert.equal(r.voices.includes("keys"), true, "the unmuted chords still sound");
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "");
  assert.deepEqual(errors, []);
});

test("studio: the key sheet sets the key and scale, and the mixer shows both", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="mixer"]');
  await skipScreenTour(p);
  await p.click("#studio-mix-key");
  await p.waitForSelector("#studio-sheet:not([hidden])");
  assert.equal(await p.textContent("#studio-sheet .sheet-title span"), "调式");
  assert.equal(await p.locator("#studio-sheet .st-key-btn").count(), 12, "twelve keys");
  assert.equal(await p.locator("#studio-sheet .st-scale-btn").count(), 5, "five scales");
  const close = await p.locator("#studio-sheet .st-sheet-close").boundingBox();
  assert.ok(close.width >= 44 && close.height >= 44, "the sheet's back button is a 44 px target");
  await p.locator('#studio-sheet .st-key-btn[data-key="0"]').click();
  await p.locator('#studio-sheet .st-scale-btn[data-scale="major"]').click();
  assert.match(await p.textContent("#studio-mix-key"), /调式 C · 大调/);
  assert.equal(await p.isHidden("#studio-sheet"), false, "picking a key leaves the sheet open");
  await waitStored(p, { key: 0, scale: "major" });
  await p.click("#studio-sheet .st-sheet-close");
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.deepEqual(errors, []);
});

test("studio: the sound sheet sets the tape colour and the swing, and the mixer shows both", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="mixer"]');
  await skipScreenTour(p);
  await p.click("#studio-mix-sound");
  await p.waitForSelector("#studio-sheet:not([hidden])");
  assert.equal(await p.textContent("#studio-sheet .sheet-title span"), "声音");
  assert.equal(await p.locator("#studio-sheet .st-tape-btn").count(), 5, "positions 0 to 4");
  assert.equal(await p.textContent("#studio-swing-val"), "55%");
  await p.locator('#studio-sheet .st-tape-btn[data-level="4"]').click();
  await p.locator("#studio-sheet .st-swing-row .st-swing-plus").click();
  assert.equal(await p.textContent("#studio-swing-val"), "56%");
  assert.match(await p.textContent("#studio-mix-sound"), /磁带 4 · 摇摆 56%/);
  assert.equal(await p.locator('#studio-sheet .st-tape-btn[data-level="4"]').evaluate((e) => e.classList.contains("on")), true);
  await waitStored(p, { tape: 4, swing: 0.56 });
  await p.click("#studio-sheet .st-sheet-close");
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.deepEqual(errors, []);
});

test("studio: the key and sound sheets fit the 331x359 screen with 44 px controls", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t, { width: 375, height: 503 });
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="mixer"]');
  await skipScreenTour(p);
  for (const which of ["studio-mix-key", "studio-mix-sound"]) {
    await p.click("#" + which);
    await p.waitForSelector("#studio-sheet:not([hidden])");
    const sheet = await p.evaluate(() => {
      const sh = document.querySelector("#studio-sheet");
      return { scroll: sh.scrollHeight, client: sh.clientHeight, small: [...sh.querySelectorAll("button")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.width < 44 - 0.5 || r.height < 44 - 0.5);
      }).map((e) => ({ text: e.textContent.trim(), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })) };
    });
    assert.ok(sheet.scroll <= sheet.client, `${which}: the sheet does not scroll (${sheet.scroll} <= ${sheet.client})`);
    assert.deepEqual(sheet.small, [], `${which}: every button is at least 44 px`);
    await p.click("#studio-sheet .st-sheet-close");
    await p.waitForSelector("#studio-sheet", { state: "hidden" });
  }
  assert.deepEqual(errors, []);
});

test("studio: 导出 WAV writes a mono 16-bit 22.05 kHz WAV with sound in it", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.evaluate(() => {
    window.__wav = null;
    LopdaPlatform.downloads.save = async ({ filename, data }) => {
      const b = new Uint8Array(await data.arrayBuffer()), v = new DataView(b.buffer);
      let sum = 0;
      for (let i = 44; i + 1 < b.length; i += 2) { const s = v.getInt16(i, true) / 32768; sum += s * s; }
      window.__wav = {
        filename, type: data.type, size: b.length,
        riff: String.fromCharCode(...b.slice(0, 4)), wave: String.fromCharCode(...b.slice(8, 12)),
        format: v.getUint16(20, true), channels: v.getUint16(22, true), rate: v.getUint32(24, true),
        bits: v.getUint16(34, true), data: v.getUint32(40, true),
        rms: Math.sqrt(sum / ((b.length - 44) / 2)),
      };
      return { status: "saved" };
    };
  });
  await openFileMenu(p);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "导出 WAV" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  await p.waitForFunction(() => window.__wav, null, { timeout: 60000 });
  const w = await p.evaluate(() => window.__wav);
  assert.match(w.filename, /^tape4-\d{8}-\d{4}\.wav$/, "a dated tape4 name");
  assert.equal(w.type, "audio/wav");
  assert.equal(w.riff, "RIFF");
  assert.equal(w.wave, "WAVE");
  assert.equal(w.format, 1, "PCM");
  assert.equal(w.channels, 1, "mono");
  assert.equal(w.rate, 22050);
  assert.equal(w.bits, 16);
  assert.equal(w.data, w.size - 44, "the data chunk is the whole rest of the file");
  assert.ok(w.size > 44 + 22050, `at least a second of audio (${w.size} bytes)`);
  assert.ok(w.rms > 0.01, `the render is not silence (${w.rms})`);
  assert.deepEqual(errors, []);
});

test("studio tour: the mixer tour walks two steps to Done and a reopen is quiet", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="mixer"]');
  await p.waitForSelector("#v-studio .st-tour-box");
  assert.match(await tourText(p), /一行一条轨|One row per track/);
  assert.deepEqual(await tourTarget(p), { id: "", cls: "st-mix-row st-tour-hi" }, "step 1 frames the first track row");
  await p.locator("#v-studio .st-tour-next").click();
  assert.match(await tourText(p), /磁带味和摇摆|tape colour and the swing/);
  assert.deepEqual(await tourTarget(p), { id: "studio-mix-top", cls: "st-mix-top st-tour-hi" }, "step 2 frames the top row");
  await p.locator("#v-studio .st-tour-next").click();
  await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
  assert.equal((await touredAny(p)).mixer, true, "Done records the mixer tour");
  await p.click('#studio-screens .st-scr[data-screen="drums"]');
  await p.click('#studio-screens .st-scr[data-screen="mixer"]');
  assert.equal(await p.locator("#v-studio .st-tour-box").count(), 0, "the mixer tour does not come back");
  assert.deepEqual(errors, []);
});

test("studio: a note is added, its pitch changed, removed, and the lengths re-tied; it survives a reload", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="bass"]');
  await skipScreenTour(p);

  assert.equal(await p.textContent('#studio-grid .st-cell[data-step="1"]'), "");
  await p.locator('#studio-grid .st-cell[data-step="1"]').click();
  assert.equal(await p.textContent('#studio-grid .st-cell[data-step="1"]'), "A", "an empty cell takes the last degree (A)");
  await p.locator('#studio-keys .st-key[data-deg="2"]').click();
  assert.equal(await p.textContent('#studio-grid .st-cell[data-step="1"]'), "D", "the pitch key changes the selected cell");
  await waitStored(p, { pat: 0, track: "bass", notes: [[0, 24, 0], [24, 168, 2], [192, 48, 2], [240, 144, 3]] });

  await p.locator('#studio-grid .st-cell[data-step="1"]').click();
  assert.equal(await p.textContent('#studio-grid .st-cell[data-step="1"]'), "", "tapping the selected cell removes it");
  await waitStored(p, { pat: 0, track: "bass", notes: [[0, 192, 0], [192, 48, 2], [240, 144, 3]] });

  /* put one back so the reload has something of this edit to show */
  await p.locator('#studio-grid .st-cell[data-step="1"]').click();
  await p.locator('#studio-keys .st-key[data-deg="2"]').click();
  await p.click("#home-key");
  await p.waitForTimeout(250);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await p.click('#studio-screens .st-scr[data-screen="bass"]');
  await skipScreenTour(p);
  assert.equal(await p.textContent('#studio-grid .st-cell[data-step="1"]'), "D", "the note is still there after the reload");
  assert.deepEqual(errors, []);
});

test("studio: the second chord becomes VI/Fmaj9 and removing it re-ties the first to the whole bar", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="chords"]');
  await skipScreenTour(p);

  await p.locator('.st-chord-cell[data-half="1"]').click();
  await p.locator('.st-chord-key[data-deg="5"]').click();
  const second = await p.textContent('.st-chord-cell[data-half="1"]');
  assert.match(second, /VI/, "the second half reads VI");
  assert.match(second, /Fmaj9/, "the second half reads Fmaj9");
  await waitStored(p, { pat: 0, track: "chords", notes: [[0, 192, 0], [192, 192, 5]] });

  await p.locator('.st-chord-cell[data-half="1"]').click();
  assert.equal(await p.textContent('.st-chord-cell[data-half="1"]'), "", "tapping the selected chord removes it");
  await waitStored(p, { pat: 0, track: "chords", notes: [[0, 384, 0]] });
  assert.deepEqual(errors, []);
});

test("studio: the rest key makes a bass cell a silent event, ends the note before it, and keeps the last degree", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await hitCountingPage(t);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="bass"]');
  await skipScreenTour(p);

  /* no selected cell: the rest key does nothing and auditions nothing */
  const before = await p.evaluate(() => window.__studioNotes.length);
  await p.locator("#studio-note-rest").click();
  assert.equal(await p.evaluate(() => window.__studioNotes.length), before, "the rest key auditions nothing");
  assert.equal(await p.textContent('#studio-grid .st-cell[data-step="0"]'), "A", "with no selection the grid is unchanged");

  /* last used degree becomes D (2): step 1 is selected and a pitch key sets it */
  await p.locator('#studio-grid .st-cell[data-step="0"]').click();
  await p.locator('#studio-keys .st-key[data-deg="2"]').click();
  await waitStored(p, { pat: 0, track: "bass", notes: [[0, 192, 2], [192, 48, 2], [240, 144, 3]] });

  /* select step 9 (D) and put a rest there */
  await p.locator('#studio-grid .st-cell[data-step="8"]').click();
  await p.locator("#studio-note-rest").click();
  const cell = p.locator('#studio-grid .st-cell[data-step="8"]');
  assert.equal(await cell.textContent(), "–", "the cell shows an en dash");
  assert.equal(await cell.evaluate((c) => c.classList.contains("rest")), true);
  assert.equal(await cell.evaluate((c) => c.classList.contains("on")), false, "a rest is not a filled note");
  assert.equal(await cell.getAttribute("aria-label"), "第 9 步：停");
  const paint = await cell.evaluate((c) => {
    const s = getComputedStyle(c);
    return { bg: s.backgroundColor, ink: s.color, border: parseFloat(s.borderTopWidth) };
  });
  assert.equal(paint.bg, "rgb(163, 173, 126)", "paper");
  assert.equal(paint.ink, "rgb(31, 42, 20)", "ink");
  assert.ok(paint.border >= 3, `a heavy frame (${paint.border}px)`);

  /* the previous note now ends at the rest; the rest itself is vel 0 */
  await waitStored(p, { pat: 0, track: "bass", notes: [[0, 192, 2], [192, 48, 0], [240, 144, 3]] });
  const restRow = await p.evaluate(async () => {
    const meta = (await LopdaPlatform.db.doc("data/users/local/studio").get()).data();
    const item = await LopdaPlatform.db.doc("data/users/local/studio/items/" + meta.current).get();
    return item.data().patterns[0].notes.bass.find((n) => n.t === 192);
  });
  assert.deepEqual(restRow, { t: 192, len: 48, deg: 0, vel: 0 }, "stored as a vel-0 note");

  /* the rest key did not change the last used degree: an empty cell takes D, not A */
  await p.locator('#studio-grid .st-cell[data-step="1"]').click();
  assert.equal(await p.textContent('#studio-grid .st-cell[data-step="1"]'), "D", "the last-used degree is still D");
  await p.locator('#studio-grid .st-cell[data-step="1"]').click();   /* remove it again */

  /* while playing, no bass note sounds for the rest (it is the only degree-0 bass event) */
  const midis = await p.evaluate(() => ({
    a: LopdaSong.noteMidi(LopdaSong.newSong(), "bass", 0),
  }));
  await p.evaluate(() => { window.__studioNotes.length = 0; });
  await p.click("#studio-play");
  await p.waitForTimeout(1600);
  const played = await p.evaluate(() => ({
    bass: window.__studioNotes.filter((n) => n.voice === "bass").map((n) => n.midi),
    rest: window.__studioChain.some((c) => c.events.some((e) => e.track === "bass" && e.vel === 0)),
    playing: document.querySelectorAll("#v-studio .st-cell.playing").length,
  }));
  assert.ok(played.rest, "the player schedules the rest event");
  assert.equal(played.bass.includes(midis.a), false, `no A (degree 0) bass note is auditioned while the rest is scheduled: ${JSON.stringify(played.bass)}`);
  assert.ok(played.playing >= 1, "the playhead still paints");
  await p.waitForFunction(() => document.querySelector('#studio-grid .st-cell[data-step="8"]').classList.contains("playing"), null, { timeout: 4000 });
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").getAttribute("data-playing") === "false");

  /* a rest cell selects and removes like a note */
  await p.locator('#studio-grid .st-cell[data-step="8"]').click();
  assert.equal(await p.textContent('#studio-grid .st-cell[data-step="8"]'), "–", "a tap selects the rest");
  assert.equal(await p.getAttribute('#studio-grid .st-cell[data-step="8"]', "aria-pressed"), "true");
  await p.locator('#studio-grid .st-cell[data-step="8"]').click();
  assert.equal(await p.textContent('#studio-grid .st-cell[data-step="8"]'), "", "tapping the selected rest removes it");
  await waitStored(p, { pat: 0, track: "bass", notes: [[0, 240, 2], [240, 144, 3]] });
  assert.deepEqual(errors, []);
});

test("studio: the rest key makes a chord cell a silent event, and no chord sounds there while playing", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await hitCountingPage(t);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="chords"]');
  await skipScreenTour(p);

  /* both demo halves are full; the second (iv) becomes VI first, so the last-used chord is not the default */
  await p.locator('.st-chord-cell[data-half="1"]').click();
  await p.locator('.st-chord-key[data-deg="5"]').click();
  assert.match(await p.textContent('.st-chord-cell[data-half="1"]'), /VI/);
  await waitStored(p, { pat: 0, track: "chords", notes: [[0, 192, 0], [192, 192, 5]] });

  /* the selection is still the second half: the rest key replaces VI with a rest */
  await p.locator("#studio-chord-rest").click();
  const cell = p.locator('.st-chord-cell[data-half="1"]');
  assert.equal(await cell.textContent(), "–", "the chord cell shows an en dash");
  assert.equal(await cell.evaluate((c) => c.classList.contains("rest")), true);
  assert.equal(await cell.evaluate((c) => c.classList.contains("has-chord")), false, "a rest is not a filled chord");
  assert.equal(await cell.getAttribute("aria-label"), "第 9 步：停");
  const paint = await cell.evaluate((c) => {
    const s = getComputedStyle(c);
    return { bg: s.backgroundColor, ink: s.color, border: parseFloat(s.borderTopWidth) };
  });
  assert.equal(paint.bg, "rgb(163, 173, 126)", "paper");
  assert.equal(paint.ink, "rgb(31, 42, 20)", "ink");
  assert.ok(paint.border >= 3, `a heavy frame (${paint.border}px)`);
  await waitStored(p, { pat: 0, track: "chords", notes: [[0, 192, 0], [192, 192, 0]] });
  const restRow = await p.evaluate(async () => {
    const meta = (await LopdaPlatform.db.doc("data/users/local/studio").get()).data();
    const item = await LopdaPlatform.db.doc("data/users/local/studio/items/" + meta.current).get();
    return item.data().patterns[0].notes.chords.find((n) => n.t === 192);
  });
  assert.deepEqual(restRow, { t: 192, len: 192, deg: 0, vel: 0 }, "stored as a vel-0 chord event");

  /* the rest key did not change the last used chord: rest the first half, clear it, and it comes back as VI */
  await p.locator('.st-chord-cell[data-half="0"]').click();
  await p.locator("#studio-chord-rest").click();
  await p.locator('.st-chord-cell[data-half="0"]').click();       /* selected rest: remove */
  await p.locator('.st-chord-cell[data-half="0"]').click();       /* empty: the last-used chord comes back */
  assert.match(await p.textContent('.st-chord-cell[data-half="0"]'), /Fmaj9/, "the last-used chord is still VI");
  await waitStored(p, { pat: 0, track: "chords", notes: [[0, 192, 5], [192, 192, 0]] });

  /* only the first chord's notes may sound: the i-only pitches of a skipped rest never reach the synth */
  const only = await p.evaluate(() => {
    const song = LopdaSong.newSong();
    const first = LopdaSong.chordNotes(song, 0), second = LopdaSong.chordNotes(song, 5);
    return first.filter((m) => !second.includes(m));
  });
  assert.ok(only.length > 0, "Am9 has pitches Fmaj9 does not");
  await p.evaluate(() => { window.__studioNotes.length = 0; });
  await p.click("#studio-play");
  await p.waitForTimeout(1600);
  const keys = await p.evaluate(() => window.__studioNotes.filter((n) => n.voice === "keys").map((n) => n.midi));
  assert.ok(keys.length > 0, "the first chord still sounds");
  assert.deepEqual(keys.filter((m) => only.includes(m)), [], `no rest chord note sounds: ${JSON.stringify(keys)}`);
  await p.waitForFunction(() => document.querySelector('.st-chord-cell[data-half="1"]').classList.contains("playing"), null, { timeout: 4000 });
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").getAttribute("data-playing") === "false");
  assert.deepEqual(errors, []);
});

test("studio: the pattern sheet switches to C, and copying A over a full C asks before it overwrites", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);

  await p.click("#studio-pat");
  assert.equal(await p.textContent("#studio-sheet .sheet-title span"), "第 A 段");
  assert.equal(await p.locator("#studio-sheet .st-pat-btn").count(), 16, "A-P in the sheet");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="2"]').click();
  assert.equal(await p.getAttribute("#v-studio", "data-pat"), "2", "picked C");
  assert.equal(await p.isHidden("#studio-sheet"), true, "the sheet closes after a pick");
  assert.equal(await p.locator("#studio-grid .st-cell.on").count(), 0, "C starts empty");

  /* give C one kick so copying over it has to ask */
  await p.locator('#studio-grid .st-cell[data-step="2"]').click();
  await waitKicks(p, 2, [2]);

  /* edit A again, then copy A to C */
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="0"]').click();
  await p.click("#studio-pat");
  await p.locator("#studio-sheet .st-sheet-btn", { hasText: "复制 A 到…" }).click();
  assert.equal(await p.textContent("#studio-sheet .sheet-title span"), "把 A 复制到哪一段？");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="2"]').click();
  assert.ok(await p.locator("#studio-sheet .st-copy-ask").count(), "a full target asks first");
  assert.match(await p.textContent("#studio-sheet .st-copy-ask p"), /C 段会被盖掉/);

  await p.locator("#studio-sheet .st-copy-ask .btn.ghost").click();   /* cancel */
  assert.match(await p.textContent("#studio-sheet .sheet-title"), /把 A 复制到哪一段/, "B/cancel goes back to the copy sheet");
  /* give any debounced write the time it would need, then check both the tape and what the editor holds now */
  await p.waitForTimeout(1200);
  const kept = await storedSong(p);
  assert.equal(kept.patterns[2].notes.drums.length, 1, "cancel leaves C alone on the tape");
  assert.equal(kept.patterns[2].notes.drums[0].t, 48, "C's own kick is still at step 3");
  assert.equal(await p.locator('#studio-sheet .st-pat-btn[data-pat="2"] .st-dot.on').count(), 1,
    "the copy sheet still shows C as a pattern with notes");

  await p.locator('#studio-sheet .st-pat-btn[data-pat="2"]').click();
  await p.locator("#studio-sheet .st-copy-ask .btn").first().click(); /* confirm */
  assert.equal(await p.getAttribute("#v-studio", "data-pat"), "2", "confirm switches to C");
  assert.match(await p.textContent("#toast"), /已复制到 C/);
  const on = await p.$$eval("#studio-grid .st-cell.on", (els) => els.map((e) => Number(e.dataset.step)));
  assert.deepEqual(on, [0, 7, 10], "C now has A's kicks");
  await waitKicks(p, 2, [0, 7, 10]);
  assert.deepEqual(errors, []);
});

test("studio: picking pattern P in the sheet and editing it survives a reload", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click("#studio-pat");
  await p.waitForSelector("#studio-sheet:not([hidden])");
  assert.equal(await p.locator("#studio-sheet .st-pat-btn").count(), 16);
  assert.equal(await p.textContent('#studio-sheet .st-pat-btn[data-pat="15"]'), "P", "the sixteenth letter is P");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="15"]').click();
  assert.equal(await p.getAttribute("#v-studio", "data-pat"), "15", "picked P");
  assert.equal(await p.isHidden("#studio-sheet"), true);
  assert.equal(await p.locator("#studio-grid .st-cell.on").count(), 0, "P starts empty");
  await p.locator('#studio-grid .st-cell[data-step="0"]').click();
  await waitKicks(p, 15, [0]);

  await p.click("#home-key");
  await p.waitForTimeout(250);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="15"]').click();
  assert.equal(await p.getAttribute("#v-studio", "data-pat"), "15", "P is still the edit pattern");
  assert.equal(await p.locator("#studio-grid .st-cell.on").count(), 1, "P's kick is still there");
  assert.equal(await cellOn(p, 0), true);
  assert.deepEqual(errors, []);
});

test("studio: the song chain renders four equal slots a row at 375x667 and 331x359", { skip, timeout: 120000 }, async (t) => {
  for (const viewport of [{ width: 375, height: 667 }, { width: 375, height: 503 }]) {
    const { p, errors } = await rtPage(t, viewport);
    await studioOpen(p);
    await skipTour(p);
    await p.click('#studio-screens .st-scr[data-screen="song"]');
    await skipScreenTour(p);
    for (let i = 0; i < 7; i++) await p.click("#studio-add");   /* 8 slots: two rows of four */
    const rows = await p.evaluate(() => {
      const chain = document.querySelector("#studio-chain");
      const out = [];
      for (const e of chain.querySelectorAll(".st-chain-cell")) {
        const r = e.getBoundingClientRect();
        const row = out.find((x) => Math.abs(x.top - r.top) < 1);
        const item = { l: r.left, w: r.width, h: r.height };
        if (row) row.items.push(item);
        else out.push({ top: r.top, items: [item] });
      }
      return { rows: out.map((r) => r.items), width: chain.getBoundingClientRect().width };
    });
    const where = `${viewport.width}x${viewport.height}`;
    assert.equal(rows.rows.length, 2, `${where}: two rows`);
    assert.deepEqual(rows.rows.map((r) => r.length), [4, 4], `${where}: four slots a row`);
    const widths = rows.rows.flat().map((r) => r.w);
    assert.ok(Math.max(...widths) - Math.min(...widths) < 1, `${where}: every slot is the same width (${widths})`);
    assert.ok(widths[0] >= 44 && widths[0] <= rows.width / 4 + 0.5, `${where}: a slot fills a quarter (${widths[0]} of ${rows.width})`);
    for (const r of rows.rows.flat()) assert.ok(r.h >= 44, `${where}: a slot is at least 44 px tall (${r.h})`);
    for (let c = 1; c < 4; c++) {
      assert.ok(Math.abs(rows.rows[0][c].l - rows.rows[1][c].l) < 1, `${where}: column ${c + 1} lines up across the rows`);
    }
    assert.deepEqual(errors, []);
  }
});

test("studio: + appends the edit letter, a letter in the slot sheet changes the selected slot, and the slot sheet inserts, copies and deletes", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  assert.equal(await p.locator(".st-chain-cell").count(), 1);
  assert.equal(await p.locator("#studio-drop").count(), 0, "the − button is gone");
  const add = await p.locator("#studio-add").boundingBox();
  const songBox = await p.locator("#studio-song").boundingBox();
  assert.ok(add.width >= songBox.width - 24, `+ spans the row (${add.width} of ${songBox.width})`);

  await p.click("#studio-add");
  let chain = await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
  assert.deepEqual(chain, ["A", "A"], "+ appends the edit pattern (A)");

  await openSlotSheet(p, 1);
  assert.equal(await p.textContent("#studio-sheet .sheet-title span"), "第 2 格：A", "the slot's sheet names the slot and its letter");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="1"]').click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  chain = await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
  assert.deepEqual(chain, ["A", "B"], "a letter in the slot sheet changes the selected slot");
  await waitStored(p, { song: [0, 1] });

  await p.click("#home-key");
  await p.waitForTimeout(250);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  chain = await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
  assert.deepEqual(chain, ["A", "B"], "the chain survives a reload");

  /* slot 1 (B): select it, then tap it again for its sheet */
  await p.locator(".st-chain-cell").nth(1).click();
  assert.equal(await p.isHidden("#studio-sheet"), true, "a tap on another slot only selects it");
  await p.locator(".st-chain-cell").nth(1).click();
  await p.waitForSelector("#studio-sheet:not([hidden])");
  assert.equal(await p.textContent("#studio-sheet .sheet-title span"), "第 2 格：B");
  const rows = await p.$$eval("#studio-sheet .lcd-menu li", (els) => els.map((e) => e.textContent.trim()));
  assert.deepEqual(rows, ["前面插一段", "后面复制一段", "删掉这一格", "返回"]);
  assert.equal(await p.getAttribute("#studio-sheet .lcd-menu li:nth-child(3)", "aria-disabled"), null, "delete is enabled at two slots");

  /* insert before keeps B and puts a B at the same index, selected */
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "前面插一段" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  chain = await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
  assert.deepEqual(chain, ["A", "B", "B"]);
  assert.equal(await p.getAttribute("#v-studio .st-chain-cell.sel", "data-slot"), "1", "the inserted slot is selected");
  await waitStored(p, { song: [0, 1, 1] });

  /* copy after puts a copy at i+1 and selects it */
  await p.locator(".st-chain-cell").nth(1).click();
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "后面复制一段" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  chain = await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
  assert.deepEqual(chain, ["A", "B", "B", "B"]);
  assert.equal(await p.getAttribute("#v-studio .st-chain-cell.sel", "data-slot"), "2");
  await waitStored(p, { song: [0, 1, 1, 1] });

  /* delete the selected slot and select min(i, length - 1) */
  await p.locator(".st-chain-cell").nth(2).click();
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "删掉这一格" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  chain = await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
  assert.deepEqual(chain, ["A", "B", "B"]);
  assert.equal(await p.getAttribute("#v-studio .st-chain-cell.sel", "data-slot"), "2");
  await waitStored(p, { song: [0, 1, 1] });

  /* at one slot delete is disabled and leaves the chain alone */
  await p.locator(".st-chain-cell").nth(2).click();
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "删掉这一格" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  chain = await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
  assert.deepEqual(chain, ["A", "B"], "a second delete leaves two slots");
  await p.locator(".st-chain-cell").nth(1).click();
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "删掉这一格" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  chain = await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
  assert.deepEqual(chain, ["A"], "three deletes, then one slot");
  await p.locator(".st-chain-cell").first().click();
  await p.waitForSelector("#studio-sheet:not([hidden])");
  assert.equal(await p.locator("#studio-sheet .lcd-menu li.disabled").count(), 1, "delete is disabled at one slot");
  assert.equal(await p.getAttribute("#studio-sheet .lcd-menu li.disabled", "aria-disabled"), "true");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "删掉这一格" }).click();
  chain = await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
  assert.deepEqual(chain, ["A"], "a disabled delete does nothing");
  assert.equal(await p.isHidden("#studio-sheet"), false, "the sheet stays for 返回");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "返回" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.deepEqual(errors, []);
});

test("studio: 96 slots is the limit, and the slot sheet's insert toasts rather than adding a 97th", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  for (let i = 0; i < 95; i++) await p.click("#studio-add");
  assert.equal(await p.locator(".st-chain-cell").count(), 96);
  const selected = await p.getAttribute("#v-studio .st-chain-cell.sel", "data-slot");
  assert.equal(selected, "95", "+ selects the new last slot");
  await p.locator(".st-chain-cell").nth(95).click();
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "前面插一段" }).click();
  await p.waitForSelector("#toast:not([hidden])");
  assert.match(await p.textContent("#toast"), /最多 96 段/);
  assert.equal(await p.locator(".st-chain-cell").count(), 96, "still 96 slots");
  assert.equal(await p.isHidden("#studio-sheet"), false, "the sheet stays open at the limit");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "后面复制一段" }).click();
  assert.equal(await p.locator(".st-chain-cell").count(), 96, "copy after is refused too");
  assert.deepEqual(errors, []);
});

test("studio: the slot sheet's edits work while the whole song plays", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  await p.click("#studio-add");
  await p.click("#studio-add");
  assert.equal(await p.locator(".st-chain-cell").count(), 3);
  let chain;
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "song");

  /* the selected slot is the last one: copy it after itself without stopping */
  await p.locator(".st-chain-cell").nth(2).click();
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "后面复制一段" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.equal(await p.locator(".st-chain-cell").count(), 4, "the chain grew while playing");
  assert.equal(await p.getAttribute("#v-studio", "data-playing"), "true", "the song keeps playing");
  assert.equal(await p.getAttribute("#v-studio", "data-mode"), "song");
  await p.waitForTimeout(400);
  assert.ok(await p.locator("#v-studio .st-chain-cell.playing").count() >= 1, "the playhead still paints");
  await waitStored(p, { song: [0, 0, 0, 0] });

  await p.locator(".st-chain-cell").nth(3).click();
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "删掉这一格" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.equal(await p.locator(".st-chain-cell").count(), 3, "the chain shrank while playing");
  assert.equal(await p.getAttribute("#v-studio", "data-playing"), "true");
  await waitStored(p, { song: [0, 0, 0] });

  /* the letters in the slot sheet change a slot while the song plays too */
  await p.locator(".st-chain-cell").nth(2).click();
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="2"]').click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  await waitStored(p, { song: [0, 0, 2] });
  chain = await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
  assert.deepEqual(chain, ["A", "A", "C"], "the slot sheet's letter changed the slot while playing");
  assert.equal(await p.getAttribute("#v-studio", "data-playing"), "true", "the song still plays");
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "");
  assert.deepEqual(errors, []);
});

test("studio: a chain edit while the song plays freezes the heard bar and acts from the next one", { skip, timeout: 180000 }, async (t) => {
  const { p, errors } = await hitCountingPage(t);
  const BPM = 140, EDITED = [0, 1, 2];
  const play = async () => {
    await p.evaluate(() => { window.__studioHits.length = 0; window.__studioNotes.length = 0; window.__studioChain.length = 0; });
    await p.click("#studio-play");
    await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "song");
  };
  const heard = (slot, pat) => p.waitForFunction(({ slot, pat }) => {
    const d = document.querySelector("#v-studio").dataset;
    return d.playSlot === slot && d.playPat === pat;
  }, { slot, pat }, { timeout: 15000 });
  const stop = async () => {
    await p.click("#studio-play");
    await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "");
  };
  const attr = (name) => p.getAttribute("#v-studio", name);

  /* (a) insert before the heard slot: the heard B keeps sounding and moves to index 2; the next bar is C */
  await preparedTape(p, EDITED, BPM);
  await play();
  await heard("1", "1");
  await openSlotSheet(p, 0);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "前面插一段" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.equal(await attr("data-play-slot"), "2", "insert before the heard slot moves the playhead to index 2");
  assert.equal(await attr("data-play-pat"), "1", "the heard bar keeps its pattern");
  assert.deepEqual(await chainLetters(p), ["A", "A", "B", "C"]);
  await heard("0", "0");                       /* bar 3, after the next one has played */
  await stop();
  assertBars((await scheduledBarPatterns(p, BPM)).bars, [0, 1, 2]);

  /* (b) delete before the heard slot: the heard B stays at index 0; the chain's C follows it */
  await preparedTape(p, EDITED, BPM);
  await play();
  await heard("1", "1");
  await openSlotSheet(p, 0);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "删掉这一格" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.equal(await attr("data-play-slot"), "0", "delete before the heard slot moves the playhead to index 0");
  assert.equal(await attr("data-play-pat"), "1", "the heard bar keeps its pattern");
  assert.deepEqual(await chainLetters(p), ["B", "C"]);
  await heard("1", "2");                       /* the next bar is C */
  await heard("0", "1");                       /* and then B again */
  await stop();
  assertBars((await scheduledBarPatterns(p, BPM)).bars, [0, 1, 2]);

  /* (c) delete the heard slot: B finishes at index 1, whose letter is now C; the next bar is that C */
  await preparedTape(p, EDITED, BPM);
  await play();
  await heard("1", "1");
  await openSlotSheet(p, 1);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "删掉这一格" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.equal(await attr("data-play-slot"), "1", "the following slot slides into the heard index");
  assert.equal(await attr("data-play-pat"), "1", "the deleted slot's bar still finishes with its own pattern");
  assert.deepEqual(await chainLetters(p), ["A", "C"]);
  await heard("1", "2");                       /* the following C, at the same index */
  await heard("0", "0");
  await stop();
  assertBars((await scheduledBarPatterns(p, BPM)).bars, [0, 1, 2]);

  /* (d) change the heard slot's letter: B's bar finishes, C follows, and the new letter plays on the next pass */
  await preparedTape(p, EDITED, BPM);
  await play();
  await heard("1", "1");
  await openSlotSheet(p, 1);                                        /* select slot 1, then its sheet */
  await p.locator('#studio-sheet .st-pat-btn[data-pat="2"]').click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.equal(await attr("data-play-slot"), "1");
  assert.equal(await attr("data-play-pat"), "1", "the heard B is not replaced mid-bar");
  assert.deepEqual(await chainLetters(p), ["A", "C", "C"]);
  await heard("2", "2");                       /* C, the following slot */
  await heard("0", "0");                       /* A, the next pass's first slot */
  await heard("1", "2");                       /* the changed letter, now on its next pass */
  await heard("0", "0");
  await stop();
  assertBars((await scheduledBarPatterns(p, BPM)).bars, [0, 1, 2, 0, 2]);

  assert.deepEqual(errors, []);
});

test("studio: the demo tape loads 24 slots and survives a reload", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await openMenu(p);
  const items = await p.$$eval("#studio-sheet .lcd-menu li", (els) => els.map((e) => e.textContent.trim()));
  assert.ok(items.some((x) => x.startsWith("磁带库")), "the tape library is in the menu");
  assert.ok(items.includes("编辑"), "the edit submenu is in the menu");
  assert.ok(items.includes("文件"), "the file submenu is in the menu");
  await p.click("#studio-sheet .st-sheet-close");
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  await openDemo(p);
  await p.locator("#studio-sheet .st-proj-list li", { hasText: "夜色" }).click();
  await p.waitForSelector("#studio-sheet .st-ask");
  assert.match(await p.textContent("#studio-sheet .st-ask p"), /复制到我的磁带/);
  await p.locator("#studio-sheet .st-ask .btn", { hasText: "确认" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });

  assert.equal(await p.getAttribute("#v-studio", "data-screen"), "drums", "the demo opens on the drums screen");
  assert.equal(await p.getAttribute("#v-studio", "data-pat"), "0", "pattern A");
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  assert.equal(await p.locator(".st-chain-cell").count(), 24, "the demo tape is 24 slots");
  const chain = await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
  assert.deepEqual(chain.join(""), "ABCDABCDEFGHEFGHABCDEFGH");
  await waitStored(p, { song: [0, 1, 2, 3, 0, 1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7] });

  await p.click("#home-key");
  await p.waitForTimeout(250);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  assert.equal(await p.locator(".st-chain-cell").count(), 24, "still 24 slots after the reload");
  assert.deepEqual(errors, []);
});

test("studio: the demo template opens with its own patterns, not the old C", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  /* give C a kick, then load the demo tape: C is the demo's own third pattern now */
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="2"]').click();
  await p.locator('#studio-grid .st-cell[data-step="2"]').click();
  await waitKicks(p, 2, [2]);
  await useTemplate(p, "夜色");
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="2"]').click();
  const kicks = await p.$$eval("#studio-grid .st-cell.on", (els) => els.map((e) => Number(e.dataset.step)));
  assert.deepEqual(kicks, [0, 7, 10], "C is the demo's third bar, not the old edit");
  assert.deepEqual(errors, []);
});

test("studio: playing the song [A, B] at 140 BPM walks slot 0 -> 1 -> 0 and schedules both patterns", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await hitCountingPage(t);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await skipTour(p);
  /* B is a pattern of its own: one kick, no demo notes */
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="1"]').click();
  assert.equal(await p.locator("#studio-grid .st-cell.on").count(), 0, "B starts empty");
  await p.locator('#studio-grid .st-cell[data-step="2"]').click();
  for (let i = 0; i < 29; i++) await p.click("#studio-plus");          /* 82 -> 140 */
  assert.match(await p.textContent("#studio-bpm"), /140 BPM/);

  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  assert.deepEqual(await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent)), ["A"]);
  await p.click("#studio-add");
  assert.deepEqual(await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent)), ["A", "B"]);
  /* ▸ on the song screen starts at the selected slot: pick the first one to hear the whole chain from the top */
  await p.locator(".st-chain-cell").first().click();
  await p.evaluate(() => { window.__studioChain.length = 0; window.__studioHits.length = 0; window.__studioNotes.length = 0; });

  await p.click("#studio-play");
  assert.equal(await p.getAttribute("#v-studio", "data-mode"), "song");
  assert.equal(await p.getAttribute("#v-studio", "data-play-slot"), "0");
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "0");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.playSlot === "1", null, { timeout: 15000 });
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "1");
  assert.deepEqual(await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.classList.contains("playing"))), [false, true]);
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.playSlot === "0", null, { timeout: 15000 });
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "0");

  const pats = await p.evaluate(() => {
    const seen = new Set();
    for (const call of window.__studioChain) for (const e of call.events) seen.add(e.p);
    return [...seen];
  });
  assert.deepEqual(pats.sort(), [0, 1], "chainEvents scheduled both patterns");
  assert.ok(await p.evaluate(() => window.__studioHits.length > 0), "drum hits were scheduled");
  assert.ok(await p.evaluate(() => window.__studioNotes.length > 0), "melodic notes were scheduled");
  assert.deepEqual(errors, []);
});

test("studio: ▸ on the song screen starts at the selected slot and wraps after the last one", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await hitCountingPage(t);
  const BPM = 140;
  await preparedTape(p, [0, 1, 2, 3], BPM);
  await p.locator("#studio-chain .st-chain-cell").nth(2).click();
  assert.equal(await p.getAttribute("#v-studio .st-chain-cell.sel", "data-slot"), "2", "slot 3 is selected");
  assert.equal(await p.getAttribute("#studio-play", "aria-label"), "从第 3 格播放", "the play button says where it starts");
  await p.evaluate(() => { window.__studioChain.length = 0; window.__studioHits.length = 0; window.__studioNotes.length = 0; });

  await p.click("#studio-play");
  assert.equal(await p.getAttribute("#v-studio", "data-mode"), "song");
  assert.equal(await p.getAttribute("#v-studio", "data-play-slot"), "2", "the selected slot is heard first");
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "2");
  assert.deepEqual(await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.classList.contains("playing"))), [false, false, true, false]);
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.playSlot === "3", null, { timeout: 15000 });
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "3");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.playSlot === "0", null, { timeout: 15000 });
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "0", "after the last slot the chain wraps to the top");
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "");
  assertBars((await scheduledBarPatterns(p, BPM)).bars, [2, 3]);
  assert.deepEqual(errors, []);
});

test("studio: the slot sheet's play button starts the chain at that slot", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await hitCountingPage(t);
  await preparedTape(p, [0, 1, 2, 3], 140);
  await openSlotSheet(p, 1);
  assert.equal(await p.getAttribute("#studio-sheet .st-slot-play", "aria-label"), "从这里播放");
  const box = await p.locator("#studio-sheet .st-slot-play").boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, `the slot play button is a 44 px target (${box.width}x${box.height})`);
  await p.click("#studio-sheet .st-slot-play");
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "song");
  assert.equal(await p.getAttribute("#v-studio", "data-play-slot"), "1", "the sheet's slot is heard first");
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "1");
  assert.equal(await p.getAttribute("#studio-play", "aria-label"), "停止", "the play button is now Stop");
  assert.deepEqual(errors, []);
});

test("studio: a pattern picked while A plays waits for the bar boundary and never schedules B early", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await hitCountingPage(t);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await skipTour(p);
  /* make B distinct: one kick on step 3 */
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="1"]').click();
  await p.locator('#studio-grid .st-cell[data-step="2"]').click();
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="0"]').click();
  await p.evaluate(() => { window.__studioChain.length = 0; });

  await p.click("#studio-play");
  assert.equal(await p.getAttribute("#v-studio", "data-mode"), "pattern");
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "0");
  await p.waitForTimeout(300);

  await p.click("#studio-pat");
  /* what the scheduler knew at the instant B was tapped: the last scheduled tick and the heard tick */
  await p.evaluate(() => {
    window.__queueClick = null;
    document.querySelector("#studio-sheet").addEventListener("click", (e) => {
      const btn = e.target.closest && e.target.closest(".st-pat-btn");
      if (!btn || btn.dataset.pat !== "1" || window.__queueClick) return;
      window.__queueClick = { heard: window.__studioHeard, scheduled: window.__studioScheduled };
    }, true);
  });
  await p.locator('#studio-sheet .st-pat-btn[data-pat="1"]').click();
  const click = await p.evaluate(() => window.__queueClick);
  assert.ok(click, "the B tap was recorded");
  const boundary = Math.ceil(Math.max(click.scheduled, click.heard + 1) / 384) * 384;
  assert.equal(await p.getAttribute("#v-studio", "data-pat"), "1", "the edit view is B at once");
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "0", "the ears are still on A");
  assert.equal(await p.locator("#studio-pat.queued").count(), 1, "the letter blinks while it waits");
  const period = await p.locator("#studio-pat").evaluate((e) => parseFloat(getComputedStyle(e).animationDuration));
  assert.ok(Math.abs(period - 120 / 82) < 0.02, `two beats at 82 BPM, got ${period}s`);
  await p.waitForTimeout(100);
  assert.equal(await p.locator("#v-studio .st-cell.playing").count(), 0, "no playhead until the ears reach B");

  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.playPat === "1", null, { timeout: 15000 });
  assert.equal(await p.locator("#studio-pat.queued").count(), 0, "the blink stops at the boundary");
  /* the scheduler runs 0.1 s ahead; wait until B's first event has been scheduled, then look at where it landed */
  await p.waitForFunction(() => window.__studioChain.some((c) => c.chain.length === 1 && c.chain[0] === 1 && c.events.some((e) => e.p === 1)), null, { timeout: 5000 });

  const sched = await p.evaluate(() => {
    const out = { b: [], a: [] };
    for (const call of window.__studioChain) {
      const p = call.chain.length === 1 ? call.chain[0] : null;
      for (const e of call.events) {
        if (p === 1 && e.track === "drums" && e.key === "kick") out.b.push({ from: call.from, tick: e.tick });
        if (p === 0) out.a.push({ from: call.from, tick: e.tick });
      }
    }
    return out;
  });
  assert.ok(sched.b.length > 0, "B's kick was scheduled");
  /* B's kick is step 3 (tick 48, an even step, so no swing), placed from the boundary */
  assert.equal(sched.b[0].tick, boundary + 48, `B starts exactly at the boundary ${boundary}`);
  assert.ok(sched.b.every((e) => e.from >= boundary && e.tick >= boundary), `no B event before bar tick ${boundary}: ${JSON.stringify(sched.b.slice(0, 5))}`);
  assert.deepEqual(sched.a.filter((e) => e.tick >= boundary), [], "A has no event at or after the boundary");
  assert.deepEqual(errors, []);
});

test("studio: a second shot while queued replaces the first, and stop clears a waiting queue", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await hitCountingPage(t);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await skipTour(p);
  /* B: a kick on step 2; C: a kick on step 4 */
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="1"]').click();
  await p.locator('#studio-grid .st-cell[data-step="1"]').click();
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="2"]').click();
  await p.locator('#studio-grid .st-cell[data-step="3"]').click();
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="0"]').click();
  await p.evaluate(() => { window.__studioChain.length = 0; });

  await p.click("#studio-play");
  await p.waitForTimeout(250);
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="1"]').click();
  assert.equal(await p.locator("#studio-pat.queued").count(), 1, "B is queued");
  /* before the scheduler crosses the boundary, a second pick replaces the first */
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="2"]').click();
  assert.equal(await p.locator("#studio-pat.queued").count(), 1, "C is now the queued one");
  assert.equal(await p.getAttribute("#v-studio", "data-pat"), "2");
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "0", "the ears are still on A");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.playPat === "2", null, { timeout: 15000 });
  assert.equal(await p.evaluate(() => window.__studioChain.some((c) => c.chain.length === 1 && c.chain[0] === 1)), false,
    "the replaced B pick was never scheduled");

  /* a queue that is still waiting dies with stop */
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "");
  await p.click("#studio-play");
  await p.waitForTimeout(200);
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="1"]').click();
  assert.equal(await p.locator("#studio-pat.queued").count(), 1, "B is queued again");
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "");
  assert.equal(await p.locator("#studio-pat.queued").count(), 0, "stop clears the blink");
  const scheduled = await p.evaluate(() => window.__studioChain.length);
  await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => window.__studioChain.length), scheduled, "nothing is scheduled after stop");
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "");
  assert.deepEqual(errors, []);
});

test("studio: picking the pattern the ears hear cancels a queue the scheduler has not crossed", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await hitCountingPage(t);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await skipTour(p);
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="1"]').click();
  await p.locator('#studio-grid .st-cell[data-step="1"]').click();
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="0"]').click();
  await p.evaluate(() => { window.__studioChain.length = 0; });

  await p.click("#studio-play");
  await p.waitForTimeout(250);
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="1"]').click();
  assert.equal(await p.locator("#studio-pat.queued").count(), 1, "B is queued");
  /* A is what the ears hear and the scheduler has not crossed: picking A cancels the queue */
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="0"]').click();
  assert.equal(await p.locator("#studio-pat.queued").count(), 0, "the blink is gone");
  assert.equal(await p.getAttribute("#v-studio", "data-pat"), "0");
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "0");
  await p.waitForTimeout(3400);                 /* past the boundary it would have used */
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "0", "A kept playing");
  assert.equal(await p.evaluate(() => window.__studioChain.some((c) => c.chain.length === 1 && c.chain[0] === 1)), false,
    "B was never scheduled after the cancel");
  assert.deepEqual(errors, []);
});

test("studio: every screen fits at 375x667 with 44 px buttons and 56 px grid cells, and stays in the view at 331x359", { skip, timeout: 120000 }, async (t) => {
  const screens = ["drums", "bass", "chords", "melody", "song", "mixer"];
  const { p, errors } = await rtPage(t, { width: 375, height: 667 });
  await studioOpen(p);
  await skipTour(p);
  for (const screen of screens) {
    await p.click(`#studio-screens .st-scr[data-screen="${screen}"]`);
    await skipScreenTour(p);
    const m = await p.evaluate(() => {
      const v = document.querySelector("#v-studio");
      return { scroll: v.scrollHeight, client: v.clientHeight };
    });
    assert.ok(m.scroll <= m.client, `${screen}: no page scroll (${m.scroll} <= ${m.client})`);
    const small = await p.$$eval("#v-studio button", (els) => els.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 44 - 0.5 || r.height < 44 - 0.5);
    }).map((e) => ({ id: e.id || e.className, text: e.textContent.trim(), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })));
    assert.deepEqual(small, [], `${screen}: every button is at least 44 px`);
    if (screen === "drums" || screen === "bass" || screen === "melody") {
      const cells = await cellWidths(p);
      assert.equal(cells.length, 16);
      assert.deepEqual(cells.filter((c) => c.w < 56 || c.h < 56), [], `${screen}: every cell is at least 56 px`);
    }
  }

  /* the same view made 331x359 tall (a 375-wide phone with more browser chrome) must not spill */
  const { p: q, errors: errors2 } = await rtPage(t, { width: 375, height: 503 });
  await studioOpen(q);
  await skipTour(q);
  const view = await q.evaluate(() => {
    const r = document.querySelector("#v-studio").getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  assert.ok(view.w >= 330 && view.w <= 332 && view.h >= 358 && view.h <= 360, `the view is 331x359 (${view.w}x${view.h})`);
  const cellsAt331 = {};
  for (const screen of screens) {
    await q.click(`#studio-screens .st-scr[data-screen="${screen}"]`);
    await skipScreenTour(q);
    const bad = await q.evaluate(() => {
      const v = document.querySelector("#v-studio");
      const vr = v.getBoundingClientRect();
      const out = [];
      for (const e of v.querySelectorAll("*")) {
        const r = e.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.left < vr.left - 1 || r.right > vr.right + 1 || r.top < vr.top - 1 || r.bottom > vr.bottom + 1) {
          out.push({ tag: e.tagName, cls: String(e.className).slice(0, 40), id: e.id,
            l: Math.round(r.left - vr.left), t: Math.round(r.top - vr.top),
            r: Math.round(r.right - vr.left), b: Math.round(r.bottom - vr.top) });
        }
      }
      return { out: out.slice(0, 8), scroll: v.scrollHeight, client: v.clientHeight, sw: v.scrollWidth, cw: v.clientWidth };
    });
    assert.deepEqual(bad.out, [], `${screen}: nothing overflows the 331x359 view: ${JSON.stringify(bad)}`);
    assert.ok(bad.scroll <= bad.client && bad.sw <= bad.cw, `${screen}: the view does not scroll at 331x359`);
    /* the 44 px rule holds for every button that is not one of the 16 drum/note grid cells */
    const small = await q.$$eval("#v-studio button", (els) => els.filter((e) => {
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || e.classList.contains("st-cell")) return false;
      return r.width < 44 - 0.5 || r.height < 44 - 0.5;
    }).map((e) => ({ id: e.id || e.className, text: e.textContent.trim(), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })));
    assert.deepEqual(small, [], `${screen}: every non-cell button is at least 44 px at 331x359: ${JSON.stringify(small)}`);
    if (screen === "drums" || screen === "bass" || screen === "melody") {
      const cells = await cellWidths(q);
      assert.equal(cells.length, 16);
      cellsAt331[screen] = { minW: Math.min(...cells.map((c) => c.w)), minH: Math.min(...cells.map((c) => c.h)),
        maxW: Math.max(...cells.map((c) => c.w)), maxH: Math.max(...cells.map((c) => c.h)) };
      assert.deepEqual(cells.filter((c) => c.w < 40 - 0.5 || c.h < 40 - 0.5), [],
        `${screen}: every cell is at least 40 px at 331x359: ${JSON.stringify(cellsAt331[screen])}`);
    }
  }
  t.diagnostic(`331x359 grid cells: ${JSON.stringify(cellsAt331)}`);
  t.diagnostic(`331x359 view: ${view.w}x${view.h}`);
  const clippedTabs = await q.$$eval("#studio-screens .st-scr-name", (els) => els
    .filter((e) => e.scrollWidth > e.clientWidth + 1)
    .map((e) => ({ text: e.textContent, scroll: e.scrollWidth, client: e.clientWidth })));
  assert.deepEqual(clippedTabs, [], `331x359: every screen label fits (${JSON.stringify(clippedTabs)})`);

  /* "+" brings the new last slot into the chain's own viewport; the view itself never scrolls */
  await q.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(q);
  for (let i = 0; i < 30; i++) await q.click("#studio-add");
  const chainScroll = await q.evaluate(() => {
    const chain = document.querySelector("#studio-chain");
    const cells = chain.children, last = cells[cells.length - 1];
    const cr = chain.getBoundingClientRect(), lr = last.getBoundingClientRect();
    const v = document.querySelector("#v-studio");
    return { count: cells.length, top: chain.scrollTop, lastVisible: lr.top >= cr.top - 1 && lr.bottom <= cr.bottom + 1,
      viewTop: v.scrollTop, viewHeight: v.scrollHeight, viewClient: v.clientHeight };
  });
  assert.equal(chainScroll.count, 31);
  assert.ok(chainScroll.top > 0, "the chain scrolled");
  assert.ok(chainScroll.lastVisible, `the new last slot is in view: ${JSON.stringify(chainScroll)}`);
  assert.equal(chainScroll.viewTop, 0, "only the chain area scrolled");
  assert.ok(chainScroll.viewHeight <= chainScroll.viewClient);

  /* the sheets have to fit too, each with an on-screen way back */
  const sheetState = () => q.evaluate(() => {
    const v = document.querySelector("#v-studio"), vr = v.getBoundingClientRect();
    const sh = document.querySelector("#studio-sheet"), out = [];
    for (const e of sh.querySelectorAll("*")) {
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const box = e.closest(".lcd-menu");
      const scrolls = box && box !== e && box.scrollHeight > box.clientHeight + 1;
      /* a tall menu is a scroll box: its off-screen rows are allowed, but a row that spills sideways is not */
      if (scrolls && !(r.left < vr.left - 1 || r.right > vr.right + 1)) continue;
      if (r.left < vr.left - 1 || r.right > vr.right + 1 || r.top < vr.top - 1 || r.bottom > vr.bottom + 1) {
        out.push({ tag: e.tagName, cls: String(e.className).slice(0, 40) });
      }
    }
    return { out: out.slice(0, 8), hidden: sh.hidden, scroll: sh.scrollHeight, client: sh.clientHeight };
  });
  /* every button and row a sheet offers is a 44 px target */
  const sheetSmall = () => q.$$eval("#studio-sheet button, #studio-sheet .lcd-menu li", (els) => els.filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.width < 44 - 0.5 || r.height < 44 - 0.5);
  }).map((e) => ({ text: e.textContent.trim(), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })));
  await q.click('#studio-screens .st-scr[data-screen="drums"]');
  await skipScreenTour(q);
  await q.click("#studio-pat");
  let sheet = await sheetState();
  assert.equal(sheet.hidden, false);
  assert.deepEqual(sheet.out, [], `the pattern sheet fits at 331x359: ${JSON.stringify(sheet)}`);
  assert.ok(sheet.scroll <= sheet.client);
  assert.deepEqual(await sheetSmall(), [], "the pattern sheet's buttons are at least 44 px");
  await q.locator("#studio-sheet .st-sheet-btn", { hasText: "返回" }).click();
  assert.equal(await q.isHidden("#studio-sheet"), true, "the pattern sheet's back button closes it");

  /* make B hold A's content first, then copy B over A to get the overwrite question */
  await q.click("#studio-pat");
  await q.locator("#studio-sheet .st-sheet-btn", { hasText: "复制" }).click();
  await q.locator('#studio-sheet .st-pat-btn[data-pat="1"]').click();   /* empty: copies at once */
  await q.click("#studio-pat");
  await q.locator("#studio-sheet .st-sheet-btn", { hasText: "复制" }).click();
  await q.locator('#studio-sheet .st-pat-btn[data-pat="0"]').click();   /* A is full: asks */
  assert.equal(await q.locator("#studio-sheet .st-copy-ask").count(), 1);
  sheet = await sheetState();
  assert.deepEqual(sheet.out, [], `the copy question fits at 331x359: ${JSON.stringify(sheet)}`);
  assert.ok(sheet.scroll <= sheet.client);
  assert.deepEqual(await sheetSmall(), [], "the copy question's buttons are at least 44 px");
  await q.locator("#studio-sheet .st-copy-ask .btn.ghost").click();     /* 取消: back to the copy sheet */
  assert.match(await q.textContent("#studio-sheet .sheet-title"), /复制/, "cancel is a way back to the sheet");
  await q.locator("#studio-sheet .st-sheet-btn", { hasText: "返回" }).click();
  await q.locator("#studio-sheet .st-sheet-btn", { hasText: "返回" }).click();
  assert.equal(await q.isHidden("#studio-sheet"), true);

  await q.click("#studio-menu");
  sheet = await sheetState();
  assert.equal(sheet.hidden, false);
  assert.deepEqual(sheet.out, [], `the menu fits at 331x359: ${JSON.stringify(sheet)}`);
  assert.ok(sheet.scroll <= sheet.client);
  assert.deepEqual(await sheetSmall(), [], "every menu row is at least 44 px");
  await q.locator("#studio-sheet .st-sheet-close").click();
  assert.equal(await q.isHidden("#studio-sheet"), true, "the menu's title close button closes it");

  /* the slot sheet: the 16 letters, then the four edits two by two; every button is 44 px and all fits */
  await q.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(q);
  await q.locator(".st-chain-cell").first().click();
  assert.equal(await q.isHidden("#studio-sheet"), true, "a tap on another slot only selects it");
  await q.locator(".st-chain-cell").first().click();
  await q.waitForSelector("#studio-sheet:not([hidden])");
  sheet = await sheetState();
  assert.deepEqual(sheet.out, [], `the slot sheet fits at 331x359: ${JSON.stringify(sheet)}`);
  assert.ok(sheet.scroll <= sheet.client);
  const shot = await q.evaluate(() => {
    const letters = [...document.querySelectorAll("#studio-sheet .st-pat-btn")];
    const actions = [...document.querySelectorAll("#studio-sheet .st-slot-actions li")];
    const rect = (e) => e.getBoundingClientRect();
    const rows = (els) => {
      const out = [];
      for (const e of els) {
        const r = rect(e);
        const row = out.find((x) => Math.abs(x.top - r.top) < 1);
        if (row) row.items.push(e);
        else out.push({ top: r.top, items: [e] });
      }
      return out;
    };
    return {
      letters: letters.length,
      play: !!document.querySelector("#studio-sheet .st-slot-play"),
      letterRows: rows(letters).map((r) => r.items.length),
      inverted: letters.filter((e) => e.classList.contains("on")).map((e) => e.dataset.pat),
      actions: actions.map((e) => e.textContent.trim()),
      actionRows: rows(actions).map((r) => r.items.length),
      actionH: Math.min(...actions.map((e) => rect(e).height)),
    };
  });
  assert.equal(shot.letters, 16, "the slot sheet shows the 16 letters");
  assert.equal(shot.play, true, "the slot sheet's title has the play-from-here button");
  assert.deepEqual(shot.letterRows, [4, 4, 4, 4], "four rows of four letters");
  assert.deepEqual(shot.inverted, ["0"], "the slot's own letter is inverted");
  assert.deepEqual(shot.actions, ["前面插一段", "后面复制一段", "删掉这一格", "返回"]);
  assert.deepEqual(shot.actionRows, [2, 2], "the four edits sit two by two");
  assert.ok(shot.actionH >= 44, `each slot action is 44 px (${shot.actionH})`);
  const smallSheet = await sheetSmall();
  assert.deepEqual(smallSheet, [], `every slot sheet button is at least 44 px: ${JSON.stringify(smallSheet)}`);
  await q.locator('#studio-sheet .st-pat-btn[data-pat="2"]').click();
  await q.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.deepEqual((await q.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent.slice(0, 1)))).slice(0, 3), ["C", "A", "A"],
    "the slot sheet's letter works at 331x359");

  assert.deepEqual(errors, []);
  assert.deepEqual(errors2, []);
});

test("studio: edits made before the tape read lands are refused, and the late song is still intact", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  /* hold the studio meta read for three seconds, so the demo screen is up while T.loaded is still false */
  await p.addInitScript(() => {
    let platform;
    Object.defineProperty(window, "LopdaPlatform", {
      configurable: true,
      get() { return platform; },
      set(v) {
        if (v && v.db && !v.db.__slowStudio) {
          const db = v.db, doc = db.doc;
          db.doc = function (path) {
            const d = doc.call(db, path);
            if (path === "data/users/local/studio" && d && typeof d.get === "function") {
              const get = d.get;
              d.get = function () {
                const started = get.apply(d, arguments);
                return new Promise((resolve, reject) => setTimeout(() => started.then(resolve, reject), 3000));
              };
            }
            return d;
          };
          db.__slowStudio = true;
        }
        platform = v;
      }
    });
  });
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: studioLabel("zh-CN") }).click();
  await p.waitForSelector("#v-studio:not([hidden])");
  await p.waitForFunction(() => document.querySelectorAll("#v-studio .st-cell").length === 16);
  assert.notEqual(await p.getAttribute("#v-studio", "data-loaded"), "true", "the read is still in flight");

  /* the pattern pick does nothing and closes the sheet */
  await p.click("#studio-pat");
  await p.locator('#studio-sheet .st-pat-btn[data-pat="2"]').click();
  assert.equal(await p.getAttribute("#v-studio", "data-pat"), "0", "the pattern pick was refused");
  assert.equal(await p.isHidden("#studio-sheet"), true);

  /* "+" on the song screen does nothing either */
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  assert.equal(await p.locator(".st-chain-cell").count(), 1);
  await p.click("#studio-add");
  assert.equal(await p.locator(".st-chain-cell").count(), 1, "+ was refused before the read");

  /* tapping the selected slot / its sheet is refused before the read too */
  await p.locator(".st-chain-cell").first().click();
  assert.equal(await p.isHidden("#studio-sheet"), true, "the slot sheet does not open before the read");
  assert.equal(await p.getAttribute("#v-studio .st-chain-cell", "data-slot"), "0", "the selection did not move");

  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.loaded === "true", null, { timeout: 10000 });
  await p.waitForTimeout(100);                  /* the tour may open once the tape is in */
  if (await p.locator("#v-studio .st-tour-box").count()) await p.keyboard.press("z");
  assert.equal(await p.getAttribute("#v-studio", "data-pat"), "0", "the real tape still shows pattern A");
  assert.equal(await p.locator(".st-chain-cell").count(), 1, "the late tape still has its one slot");
  assert.deepEqual(errors, []);
});

test("studio: a hidden page stops song playback and flushes the chain", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  await p.click("#studio-add");                 /* A, A: a dirty change for pause to flush */
  assert.equal(await p.locator(".st-chain-cell").count(), 2);
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "song");
  await p.waitForTimeout(250);
  assert.ok(await p.locator("#v-studio .st-chain-cell.playing").count() >= 1);

  await p.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "");
  assert.equal(await p.getAttribute("#v-studio", "data-playing"), "false");
  assert.equal(await p.getAttribute("#v-studio", "data-play-slot"), "");
  assert.equal(await p.locator("#v-studio .st-chain-cell.playing").count(), 0);
  await waitStored(p, { song: [0, 0] });        /* pause flushed; the debounce would not have fired yet */
  assert.deepEqual(errors, []);
});

test("studio: HOME stops the song player too", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  await p.click("#studio-play");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "song");
  await p.waitForTimeout(300);
  assert.equal(await p.getAttribute("#v-studio", "data-play-slot"), "0");
  assert.ok(await p.locator("#v-studio .st-chain-cell.playing").count() >= 1, "the playing slot is inverted");
  await p.click("#home-key");
  await p.waitForFunction(() => document.querySelector("#v-studio").dataset.mode === "");
  assert.equal(await p.getAttribute("#v-studio", "data-play-slot"), "");
  assert.equal(await p.getAttribute("#v-studio", "data-play-pat"), "");
  assert.equal(await p.locator("#v-studio .st-chain-cell.playing").count(), 0);
  assert.deepEqual(errors, []);
});

/* ---------------- 12.15/12.16: projects, undo, versions, the workspace, the guide and the AI ---------------- */
test("studio: undo and redo from the menu put an edit back and take it away again", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  const cell = p.locator('#studio-grid .st-cell[data-step="0"]');
  assert.equal(await cell.evaluate((e) => e.classList.contains("on")), true, "the demo kick starts on");
  await cell.click();
  assert.equal(await cell.evaluate((e) => e.classList.contains("on")), false);
  await p.click("#studio-menu");
  await p.waitForSelector("#studio-sheet:not([hidden])");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "撤销" }).first().click();
  assert.equal(await cell.evaluate((e) => e.classList.contains("on")), true, "undo brings the kick back");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "重做" }).first().click();
  assert.equal(await cell.evaluate((e) => e.classList.contains("on")), false, "redo removes it again");
  assert.deepEqual(errors, []);
});

test("studio: the tape library renames, opens, copies and deletes tapes", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  const openLibrary = async () => {
    if (await p.isHidden("#studio-sheet")) await openMyTapes(p);
  };
  await openLibrary();
  assert.equal(await p.locator("#studio-sheet .st-proj-list li").count(), 1, "one tape at first");
  await p.locator("#studio-sheet .st-proj-actions li", { hasText: "改名" }).click();
  await p.waitForSelector("#studio-sheet .st-name");
  await p.fill("#studio-sheet .st-name", "第一盘");
  await p.locator("#studio-sheet .st-sheet-btn", { hasText: "确认" }).click();
  await p.waitForFunction(() => /第一盘/.test((document.querySelector("#studio-sheet .st-proj-list") || {}).textContent || ""));

  await p.locator("#studio-sheet .st-proj-actions li", { hasText: "新磁带" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  await p.locator('#studio-grid .st-cell[data-step="3"]').click();      /* step 4, not in the demo */
  await waitKicks(p, 0, [0, 3, 7, 10]);
  await openLibrary();
  assert.equal(await p.locator("#studio-sheet .st-proj-list li").count(), 2, "the library holds both tapes");
  await p.locator("#studio-sheet .st-proj-list li", { hasText: "第一盘" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.equal(await cellOn(p, 3), false, "the first tape did not get the second tape's step 4");
  await openLibrary();
  await p.locator("#studio-sheet .st-proj-list li", { hasText: "未命名磁带" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.equal(await cellOn(p, 3), true, "the second tape still has its step 4");

  await openLibrary();
  await p.locator("#studio-sheet .st-proj-actions li", { hasText: "复制这一盘" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  await openLibrary();
  assert.equal(await p.locator("#studio-sheet .st-proj-list li").count(), 3, "the copy is a third tape");
  assert.match(await p.textContent("#studio-sheet .st-proj-list"), /未命名磁带 副本/);
  await p.locator("#studio-sheet .st-proj-actions li", { hasText: "删掉这一盘" }).click();
  await p.waitForSelector("#studio-sheet .st-ask");
  await p.locator("#studio-sheet .st-ask .btn", { hasText: "删掉" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  await openLibrary();
  assert.equal(await p.locator("#studio-sheet .st-proj-list li").count(), 2, "the copy is gone");
  assert.deepEqual(errors, []);
});

test("studio: a version saves the tape and restores it after a change, across a reload", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click("#studio-plus");
  await p.click("#studio-plus");
  assert.match(await p.textContent("#studio-bpm"), /86 BPM/);
  const openVersions = async () => {
    await openEdit(p);
    await p.locator("#studio-sheet .lcd-menu li", { hasText: "版本" }).first().click();
    await p.waitForSelector("#studio-sheet .st-proj-list");
    await p.waitForFunction(() => !/读取中/.test((document.querySelector("#studio-sheet .st-proj-list") || {}).textContent || ""));
  };
  await openVersions();
  await p.locator("#studio-sheet .st-proj-list li", { hasText: "存一个版本" }).click();
  await p.waitForFunction(() => document.querySelectorAll("#studio-sheet .st-proj-list li").length === 2);
  await p.locator("#studio-sheet .st-proj-list li").last().click();       /* the saved version */
  await p.waitForSelector("#studio-sheet .st-ask");
  await p.locator("#studio-sheet .st-ask .btn", { hasText: "确认" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });

  await p.click("#studio-plus");
  await p.click("#studio-plus");
  assert.match(await p.textContent("#studio-bpm"), /90 BPM/);
  await openVersions();
  assert.equal(await p.locator("#studio-sheet .st-proj-list li").count(), 3, "saving before a restore adds a version");
  await p.locator("#studio-sheet .st-proj-list li").nth(2).click();      /* the 86 BPM version */
  await p.waitForSelector("#studio-sheet .st-ask");
  await p.locator("#studio-sheet .st-ask .btn", { hasText: "确认" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.match(await p.textContent("#studio-bpm"), /86 BPM/, "the version's tempo is back");

  await p.click("#home-key");
  await p.waitForTimeout(250);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  assert.match(await p.textContent("#studio-bpm"), /86 BPM/, "the restored tempo survives the reload");
  await openEdit(p);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "版本" }).first().click();
  await p.waitForSelector("#studio-sheet .st-proj-list");
  assert.equal(await p.locator("#studio-sheet .st-proj-list li").count(), 4, "the save row and three versions are still there after the reload");
  assert.deepEqual(errors, []);
});

test("studio: the workspace zip comes back with every tape and version", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.evaluate(() => {
    window.__ws = null;
    LopdaPlatform.downloads.save = async ({ filename, data }) => {
      window.__ws = { filename, bytes: Array.from(new Uint8Array(await data.arrayBuffer())) };
      return { status: "saved" };
    };
  });
  await openFileMenu(p);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "导出工作区" }).click();
  await p.waitForFunction(() => window.__ws, null, { timeout: 30000 });
  const ws = await p.evaluate(() => window.__ws);
  assert.match(ws.filename, /^tape4-workspace-\d{8}\.zip$/);
  await p.locator('#studio-grid .st-cell[data-step="0"]').click();       /* a change the import should undo */
  assert.equal(await cellOn(p, 0), false);
  await p.setInputFiles("#studio-import-file", { name: "workspace.zip", mimeType: "application/zip", buffer: Buffer.from(ws.bytes) });
  await p.waitForSelector("#studio-sheet .st-ask", { timeout: 30000 });
  await p.locator("#studio-sheet .st-ask .btn", { hasText: "确认" }).click();
  await p.waitForFunction(() => document.querySelector("#v-studio").getAttribute("data-loaded") === "true", null, { timeout: 30000 });
  await p.waitForFunction(() => document.querySelector('#studio-grid .st-cell[data-step="0"]').classList.contains("on"));
  assert.deepEqual(errors, []);
});

test("studio: the guide, the pop example and clear-track", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click("#studio-menu");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "怎么玩" }).click();
  await p.waitForSelector("#studio-sheet .st-guide");
  assert.match(await p.textContent("#studio-sheet .sheet-title"), /怎么玩 1\/5/);
  for (let i = 0; i < 4; i++) await p.locator("#studio-sheet .st-sheet-btn", { hasText: "下一步" }).click();
  assert.match(await p.textContent("#studio-sheet .sheet-title"), /怎么玩 5\/5/);
  await p.locator("#studio-sheet .st-sheet-btn", { hasText: "开始玩" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });

  await useTemplate(p, "白日流行");
  assert.match(await p.textContent("#studio-bpm"), /96 BPM/);
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  assert.equal(await p.locator(".st-chain-cell").count(), 64, "the pop example is 64 bars");

  await p.click('#studio-screens .st-scr[data-screen="drums"]');
  await skipScreenTour(p);
  assert.ok(await p.locator("#studio-grid .st-cell.on").count() > 0);
  await openEdit(p);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "清空这条轨" }).click();
  assert.equal(await p.locator("#studio-grid .st-cell.on").count(), 0, "the drum track is empty");
  await p.click("#studio-menu");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "撤销" }).first().click();
  assert.ok(await p.locator("#studio-grid .st-cell.on").count() > 0, "undo brings the drums back");
  assert.deepEqual(errors, []);
});

test("studio: quick AI commands work with no key, and an AI reply is previewed and undoable", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await p.click("#studio-menu");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "让 AI 改" }).click();
  await p.waitForSelector("#studio-ai-input");
  await p.fill("#studio-ai-input", "节奏更快点");
  await p.locator("#studio-sheet .st-sheet-btn", { hasText: "说" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.match(await p.textContent("#studio-bpm"), /86 BPM/, "the quick command changed the tempo");

  await p.evaluate(() => {
    LP.ai.on = () => true;
    LP.ai.ask = () => Promise.resolve('{"reply":"改到 100","ops":[{"op":"setBpm","value":100}]}');
  });
  await p.click("#studio-menu");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "让 AI 改" }).click();
  await p.waitForSelector("#studio-ai-input");
  await p.fill("#studio-ai-input", "改成 100");
  await p.locator("#studio-sheet .st-sheet-btn", { hasText: "说" }).click();
  await p.waitForSelector("#studio-sheet .st-ai-preview");
  assert.match(await p.textContent("#studio-sheet .st-ai-reply"), /改到 100/);
  await p.locator("#studio-sheet .st-sheet-btn", { hasText: "采用并试听" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  assert.match(await p.textContent("#studio-bpm"), /100 BPM/);
  await p.click("#studio-menu");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "撤销" }).first().click();
  assert.match(await p.textContent("#studio-bpm"), /86 BPM/, "the AI edit is one undo step");
  assert.deepEqual(errors, []);
});

test("studio: an AI draft becomes a new tape and leaves the current one alone", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  const draft = {
    name: "AI 测试", bpm: 88, key: 9, scale: "minor", swing: 0.5, tape: 1, kit: "soft",
    patterns: [{ drums: [[0, "kick", 1], [4, "snare", 0.9]], bass: [[0, 0, 0.8]], chords: [[0, 0, 0.65]], melody: [] }],
    song: [0],
  };
  await p.evaluate((draft) => {
    LP.ai.on = () => true;
    LP.ai.ask = () => Promise.resolve(JSON.stringify({ reply: "给你一盘", draft }));
  }, draft);
  await p.click("#studio-menu");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "让 AI 改" }).click();
  await p.waitForSelector("#studio-ai-input");
  await p.fill("#studio-ai-input", "来个雨夜骨架");
  await p.locator("#studio-sheet .st-sheet-btn", { hasText: "说" }).click();
  await p.waitForSelector("#studio-sheet .st-ai-preview");
  assert.match(await p.textContent("#studio-sheet .st-sheet-label"), /新磁带/);
  await p.locator("#studio-sheet .st-sheet-btn", { hasText: "采用并试听" }).click();
  await p.waitForFunction(() => /88 BPM/.test((document.querySelector("#studio-bpm") || {}).textContent || ""));
  assert.equal(await p.getAttribute("#v-studio", "data-screen"), "drums");
  await openMyTapes(p);
  await p.waitForFunction(() => /AI 测试/.test((document.querySelector("#studio-sheet .st-proj-list") || {}).textContent || ""));
  assert.equal(await p.locator("#studio-sheet .st-proj-list li").count(), 2, "the original tape is still there");
  assert.deepEqual(errors, []);
});

test("studio: the guide, library, versions and AI sheets fit 331x359 with 44 px controls", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await rtPage(t, { width: 375, height: 503 });
  await studioOpen(p);
  await skipTour(p);
  const check = async (where) => {
    const m = await p.evaluate(() => {
      const v = document.querySelector("#v-studio"), vr = v.getBoundingClientRect();
      const sh = document.querySelector("#studio-sheet"), sr = sh.getBoundingClientRect(), out = [];
      for (const e of sh.querySelectorAll("*")) {
        const r = e.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const box = e.closest(".lcd-menu, .st-guide");
        const scrolls = box && box !== e && box.scrollHeight > box.clientHeight + 1;
        if (scrolls && !(r.left < vr.left - 1 || r.right > vr.right + 1)) continue;
        if (r.left < vr.left - 1 || r.right > vr.right + 1 || r.top < vr.top - 1 || r.bottom > vr.bottom + 1) out.push({ tag: e.tagName, cls: String(e.className).slice(0, 30), id: e.id });
      }
      const small = [...sh.querySelectorAll("button")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.width < 44 - 0.5 || r.height < 44 - 0.5);
      }).map((e) => ({ text: e.textContent.trim().slice(0, 20), w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }));
      const input = sh.querySelector("input");
      return { out: out.slice(0, 8), small, scroll: sh.scrollHeight, client: sh.clientHeight,
        input: input ? { w: input.getBoundingClientRect().width, h: input.getBoundingClientRect().height } : null };
    });
    assert.deepEqual(m.out, [], `${where}: nothing spills sideways or out of the view`);
    assert.deepEqual(m.small, [], `${where}: every button is at least 44 px`);
    assert.ok(m.scroll <= m.client + 1, `${where}: the sheet itself does not scroll (${m.scroll} <= ${m.client})`);
    if (m.input) assert.ok(m.input.h >= 44 - 0.5 && m.input.w >= 44 - 0.5, `${where}: the text field is a 44 px target`);
  };

  await p.click("#studio-menu");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "怎么玩" }).click();
  await check("guide");
  await p.click("#studio-sheet .st-sheet-close");
  await p.waitForSelector("#studio-sheet", { state: "hidden" });

  await openFolders(p);
  await check("folders");
  await p.locator("#studio-sheet .st-proj-list li", { hasText: "我的磁带" }).click();
  await p.waitForSelector("#studio-sheet .st-proj-list");
  await check("library");
  await p.locator("#studio-sheet .st-proj-actions li", { hasText: "改名" }).click();
  await p.waitForSelector("#studio-sheet .st-name");
  await check("rename");
  await p.click("#studio-sheet .st-sheet-btn", { hasText: "取消" });
  await p.waitForSelector("#studio-sheet .st-proj-actions");
  await p.click("#studio-sheet .st-sheet-close");
  await p.waitForSelector("#studio-sheet .st-proj-list");
  await p.click("#studio-sheet .st-sheet-close");
  await p.waitForSelector("#studio-sheet", { state: "hidden" });

  await openEdit(p);
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "版本" }).first().click();
  await p.waitForSelector("#studio-sheet .st-proj-list");
  await check("versions");
  await p.click("#studio-sheet .st-sheet-close");
  await p.waitForSelector("#studio-sheet", { state: "hidden" });

  await p.click("#studio-menu");
  await p.locator("#studio-sheet .lcd-menu li", { hasText: "让 AI 改" }).click();
  await p.waitForSelector("#studio-ai-input");
  await check("AI");
  assert.deepEqual(errors, []);
});

test("studio: the Demo folder holds four templates and copies one without touching the current tape", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await openFolders(p);
  assert.match(await p.textContent("#studio-sheet .st-proj-list"), /示例/);
  assert.match(await p.textContent("#studio-sheet .st-proj-list"), /我的磁带/);
  await openDemo(p);
  const names = await p.$$eval("#studio-sheet .st-proj-list li span", (els) => els.map((e) => e.textContent));
  assert.deepEqual(names, ["夜色（neo-soul）", "白日流行", "When the Saints", "茉莉花"]);
  await p.locator("#studio-sheet .st-sheet-close").click();       /* folder -> folders */
  await p.waitForSelector("#studio-sheet .st-proj-list");
  await p.locator("#studio-sheet .st-sheet-close").click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });

  await useTemplate(p, "When the Saints");
  assert.match(await p.textContent("#studio-bpm"), /104 BPM/);
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  assert.equal(await p.locator(".st-chain-cell").count(), 64, "the Saints arrangement is 64 bars");
  assert.match(await p.textContent("#studio-song-info"), /64 格 · 2:2\d/);
  const letters = await p.$$eval(".st-chain-cell", (els) => els.map((e) => e.textContent));
  assert.equal(letters.slice(0, 8).join(""), "ABCDEFGH", "the first four-bar phrase is its own row");
  assert.equal(await p.locator(".st-chain-cell.same").count(), 3, "the selected pattern marks its three repeats");

  await useTemplate(p, "茉莉花");
  assert.match(await p.textContent("#studio-bpm"), /84 BPM/);
  await p.click('#studio-screens .st-scr[data-screen="song"]');
  await skipScreenTour(p);
  assert.equal(await p.locator(".st-chain-cell").count(), 64);
  assert.match(await p.textContent("#studio-song-info"), /64 格 · 3:0\d/);
  assert.deepEqual(errors, []);
});

test("studio: folders can be made, renamed and deleted, and their tapes return to My tapes", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await rtPage(t);
  await studioOpen(p);
  await skipTour(p);
  await openFolders(p);
  await p.locator("#studio-sheet .st-proj-actions li", { hasText: "新文件夹" }).click();
  await p.waitForSelector("#studio-sheet .st-name");
  await p.fill("#studio-sheet .st-name", "Ideas");
  await p.locator("#studio-sheet .st-sheet-btn", { hasText: "确认" }).click();
  await p.waitForSelector("#studio-sheet .st-proj-list");
  assert.match(await p.textContent("#studio-sheet .sheet-title"), /Ideas/);
  await p.locator("#studio-sheet .st-proj-actions li", { hasText: "新磁带" }).click();
  await p.waitForSelector("#studio-sheet", { state: "hidden" });
  await openFolders(p);
  assert.match(await p.textContent("#studio-sheet .st-proj-list"), /Ideas\s*1/);

  await p.locator("#studio-sheet .st-proj-list li", { hasText: "Ideas" }).click();
  await p.waitForSelector("#studio-sheet .st-proj-list");
  await p.locator("#studio-sheet .st-proj-actions li", { hasText: "改名文件夹" }).click();
  await p.waitForSelector("#studio-sheet .st-name");
  await p.fill("#studio-sheet .st-name", "Songs");
  await p.locator("#studio-sheet .st-sheet-btn", { hasText: "确认" }).click();
  await p.waitForSelector("#studio-sheet .st-proj-list");
  assert.match(await p.textContent("#studio-sheet .sheet-title"), /Songs/);
  await p.locator("#studio-sheet .st-proj-actions li", { hasText: "删掉文件夹" }).click();
  await p.waitForSelector("#studio-sheet .st-ask");
  await p.locator("#studio-sheet .st-ask .btn", { hasText: "删掉" }).click();
  await p.waitForSelector("#studio-sheet .st-proj-list");
  assert.doesNotMatch(await p.textContent("#studio-sheet .st-proj-list"), /Songs/);
  assert.match(await p.textContent("#studio-sheet .st-proj-list"), /我的磁带\s*2/, "the tape moved back to My tapes");
  assert.deepEqual(errors, []);
});
