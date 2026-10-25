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
    /* all four drums on the same step, into a gain of 1: the worst case for headroom */
    window.renderStep = async (kit, vel = 1) => {
      const oc = new OfflineAudioContext(1, SR, SR);
      const out = oc.createGain(); out.gain.value = 1; out.connect(oc.destination);
      const synth = LopdaStudioSynth.create(oc, out);
      for (const drum of ["kick", "snare", "hat", "perc"]) synth.hit(kit, drum, 0.02, vel);
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

/* ---------------- the rhythm screen (runtime/apps/studio.js) ---------------- */
/* the runtime at a chosen viewport; each page is its own browser context, so its store starts empty */
async function rtPage(t, viewport) {
  const p = await browser.newPage({ viewport: viewport || { width: 390, height: 844 }, locale: "zh-CN", hasTouch: true });
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
async function waitTour(p, re) {
  await p.waitForFunction((src) => {
    const t = document.querySelector("#v-studio .st-tour-box p");
    return t && new RegExp(src).test(t.textContent);
  }, re.source);
}
/* counts every drum hit the studio schedules; installed before boot because that is when the synth is defined */
async function hitCountingPage(t) {
  const { p, errors } = await rtPage(t);
  await p.addInitScript(() => {
    let synth;
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
              window.__studioHits.push({ kit, drum, at, wall: performance.now() });
              return hit.apply(s, arguments);
            };
            return s;
          };
          v.__hitsWrapped = true;
        }
        synth = v;
      }
    });
    window.__studioHits = [];
  });
  return { p, errors };
}
const storedKick = (p, step) => p.evaluate(async (n) => {
  const meta = (await LopdaPlatform.db.doc("data/users/local/studio").get()).data();
  const item = await LopdaPlatform.db.doc("data/users/local/studio/items/" + meta.current).get();
  return !!item.data().patterns[0].notes.drums.some((x) => x.key === "kick" && Math.round(x.t / 24) === n);
}, step);
const cellOn = (p, step) => p.locator(`#v-studio .st-cell[data-step="${step}"]`).evaluate((c) => c.classList.contains("on"));
async function cellWidths(p) {
  return p.$$eval("#v-studio .st-cell", (cells) => cells.map((c) => {
    const b = c.getBoundingClientRect();
    return { w: b.width, h: b.height };
  }));
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

  await p.click("#studio-menu");
  await p.locator("#studio-sheet .lcd-menu li").first().click();       /* 新磁带 */
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
async function firstOpenTour(p) {
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await openTile(p);
  await p.waitForSelector("#v-studio .st-tour-box");
}
const tourHi = (p) => p.locator("#v-studio .st-tour-hi").getAttribute("id");
/* the five steps, visited with the same taps a player uses; visits get the step number */
async function walkTour(p, visit) {
  await visit(0);
  await p.click("#studio-play");
  await waitTour(p, /这 16 格是一小节/);
  await visit(1);
  await p.locator("#v-studio .st-tour-next").click();
  await waitTour(p, /点一个空格/);
  await visit(2);
  await p.locator('#v-studio .st-cell[data-step="1"]').click();
  await waitTour(p, /四只鼓各有自己的 16 格/);
  await visit(3);
  await p.locator('#studio-tabs .st-tab[data-drum="snare"]').click();
  await waitTour(p, /调快慢/);
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

test("studio tour: the bubble stays outside the target at 375x667 and 390x844, every step", { skip, timeout: 120000 }, async (t) => {
  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
    const { p, errors } = await rtPage(t, viewport);
    await firstOpenTour(p);
    await walkTour(p, async (i) => {
      const m = await p.evaluate(() => {
        const b = document.querySelector("#v-studio .st-tour-box").getBoundingClientRect();
        const t = document.querySelector("#v-studio .st-tour-hi").getBoundingClientRect();
        const v = document.querySelector("#v-studio").getBoundingClientRect();
        return { b: { l: b.left, r: b.right, t: b.top, b: b.bottom }, t: { l: t.left, r: t.right, t: t.top, b: t.bottom }, v: { l: v.left, r: v.right, t: v.top, b: v.bottom } };
      });
      const where = `step ${i + 1} at ${viewport.width}x${viewport.height}`;
      assert.ok(m.b.b <= m.t.t || m.b.t >= m.t.b, `${where}: the bubble is above or below the target (${JSON.stringify(m)})`);
      assert.ok(m.b.l >= m.v.l + 4 - 0.5 && m.b.r <= m.v.r - 4 + 0.5, `${where}: the bubble is inside the view with 4 px margins (${JSON.stringify(m)})`);
    });
    assert.equal(await touredRhythm(p), false, "the walk itself did not end the tour");
    await p.keyboard.press("z");
    await p.waitForSelector("#v-studio .st-tour-box", { state: "detached" });
    assert.deepEqual(errors, []);
  }
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
