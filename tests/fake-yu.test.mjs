// Fake Yu's music data, checked without a browser: lengths, charts, gazes and MML.
// The app itself runs in tests/app-vm.mjs for its layout and the king's waking eye.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { boot } from "./app-vm.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..");
const APP = join(ROOT, "registry/apps/fake-yu/index.html");
global.window = {};
require("../runtime/chip.js");
const { FAKE_SONGS } = require("../registry/apps/fake-yu/src/music.js");
const { STORY } = require("../registry/apps/fake-yu/src/story.js");

function notesSeconds(song) {
  return song.chart.length / song.seconds;
}

test("ten songs, all long enough, with a valid chart and MML", () => {
  assert.equal(FAKE_SONGS.length, 10);
  let total = 0;
  for (const song of FAKE_SONGS) {
    total += song.seconds;
    assert.ok(song.seconds >= 45, `${song.id}: ${song.seconds}s is too short`);
    assert.ok(song.chart.length > 0, `${song.id}: empty chart`);
    const mml = song.music.p1 + song.music.p2 + song.music.tri + song.music.noise;
    assert.ok(mml.length <= 8192, `${song.id}: ${mml.length} MML characters`);
    const parsed = global.window.LopdaChip.parse(song.music);
    assert.equal(parsed.error, undefined, `${song.id}: ${parsed.error}`);
    assert.ok(song.difficulty >= 1 && song.difficulty <= 4, `${song.id}: difficulty`);
    for (let i = 1; i < song.chart.length; i++) {
      assert.ok(song.chart[i].t >= song.chart[i - 1].end - 0.001, `${song.id}: chart overlap at ${i}`);
    }
  }
  assert.ok(total > 600, `total music is only ${total.toFixed(0)}s`);
});

test("every gaze has a release hold before it and a re-entry note after it", () => {
  for (const song of FAKE_SONGS) {
    assert.ok(song.watch.length >= 1, `${song.id}: no gaze`);
    assert.ok(song.encoreChart.length >= song.chart.length, `${song.id}: encore chart is thinner`);
    for (const [label, chart] of [["normal", song.chart], ["encore", song.encoreChart]]) {
      for (const [start, end] of song.watch) {
        const pre = chart.filter((n) => n.lane === "a" && Math.abs(n.end - start) <= 0.02);
        const post = chart.filter((n) => Math.abs(n.t - end) <= 0.02);
        assert.ok(pre.length, `${song.id} ${label}: no note ends at gaze ${start.toFixed(2)}s`);
        assert.ok(post.length, `${song.id} ${label}: no note starts at gaze ${end.toFixed(2)}s`);
        assert.ok(pre.some((n) => n.hold), `${song.id} ${label}: gaze ${start.toFixed(2)}s has no hold`);
      }
      for (let i = 1; i < chart.length; i++) {
        assert.ok(chart[i].t >= chart[i - 1].end - 0.001, `${song.id} ${label}: chart overlap at ${i}`);
      }
    }
  }
});

test("every gaze ends on a bar line", () => {
  for (const song of FAKE_SONGS) {
    const meter = song.meter || 4;
    for (const [, end] of song.watch) {
      const endBeat = end * song.bpm / 60;
      assert.ok(Math.abs(endBeat / meter - Math.round(endBeat / meter)) < 1e-6,
        `${song.id}: gaze ends at beat ${endBeat.toFixed(2)}, not a bar line`);
    }
  }
});

test("the Turkish A theme keeps its octave from start to finish", () => {
  const turkish = FAKE_SONGS.find((s) => s.id === "turkish");
  const beatSec = 60 / turkish.bpm;
  const at = (beat) => turkish.chart.find((n) => Math.abs(n.t / beatSec - beat) < 0.01);
  assert.equal(at(13).note, "b4", "the B A G# A figure should not drop an octave");
  assert.equal(at(14).note, "c5");
  assert.equal(at(108).note, "b5", "the octave-up statement should stay up");
  assert.equal(at(110).note, "c6");
});

test("the three rewritten pieces have the shape the plan promised", () => {
  const canon = FAKE_SONGS.find((s) => s.id === "canon");
  assert.equal(canon.chordsPerBar, 2);
  assert.ok(canon.seconds >= 75);
  assert.ok(canon.chart.some((n) => n.lane === "b"), "canon has no chimes");
  assert.ok(canon.encoreChart.length > canon.chart.length, "canon encore should add the runs");

  const turkish = FAKE_SONGS.find((s) => s.id === "turkish");
  assert.ok(turkish.seconds >= 65);
  assert.ok(turkish.watch.length >= 3);
  assert.ok(notesSeconds(turkish) < notesSeconds(FAKE_SONGS.find((s) => s.id === "hungarian")),
    "Turkish should not be denser than the Hungarian Dance");

  const serenade = FAKE_SONGS.find((s) => s.id === "serenade");
  assert.equal(serenade.meter, 3);
  assert.ok(serenade.seconds >= 65);
  assert.ok(serenade.watch.length >= 3);
});

test("resuming at any bar yields playable MML, including the 3/4 finale", () => {
  for (const song of FAKE_SONGS) {
    const points = [0, song.meter, Math.floor(song.totalBeats / 2), song.totalBeats - song.meter];
    for (const beat of points) {
      const parsed = global.window.LopdaChip.parse(song.resumeAt(beat));
      assert.equal(parsed.error, undefined, `${song.id} at ${beat}: ${parsed.error}`);
    }
  }
});

test("story still has ten chapters, one choice and four endings", () => {
  assert.equal(STORY.CHAPTERS.length, FAKE_SONGS.length);
  assert.ok(STORY.CHAPTERS.every((c) => Array.isArray(c.before) || Array.isArray(c.beforeTruth) || Array.isArray(c.beforeLie)));
  assert.ok(STORY.CHAPTERS[8].choice, "chapter 9 should still offer the choice");
  assert.deepEqual(Object.keys(STORY.ENDINGS).sort(), ["chief", "home", "horses", "trueSong"]);

  const cast = new Set(Object.keys(STORY.CAST));
  const fields = ["before", "after", "interlude", "postlude", "beforeTruth", "beforeLie"];
  for (const chapter of STORY.CHAPTERS) {
    for (const field of fields) {
      for (const line of chapter[field] || []) {
        assert.ok(cast.has(line.who), `${chapter.song}.${field}: unknown speaker ${line.who}`);
        assert.ok(line.text && line.text.zh && line.text.en, `${chapter.song}.${field}: missing text`);
      }
    }
  }
  for (const ending of Object.values(STORY.ENDINGS)) {
    assert.ok(ending.pages.length >= 4, `${ending.art}: ending should have at least 4 pages`);
    for (const page of ending.pages) assert.ok(page.zh && page.en, `${ending.art}: missing ending text`);
  }
});

/* ---------- the app in the VM: edge spacing and the waking eye ---------- */

/* one run of the app with a fake PAD and a manual clock; press()/release() go through
   PAD's press/release events, exactly as the chin buttons do */
function harness(file, seed, lang) {
  const on = { press: [], release: [] }, down = new Set();
  let image = null;
  const pad = {
    lang: lang || "zh", spec: "lopda/1",
    on: (type, fn) => { if (on[type]) on[type].push(fn); }, off() {},
    isDown: (b) => down.has(b),
    load: () => Promise.resolve(null), save() {}, remove() {}, exit() {}, sfx() {},
    music: { play() {}, stop() {} }, ambience() {}
  };
  const app = boot(file, { pad, seed: seed || 7, onPut: (img) => { image = img; } });
  const frame = async (n) => {
    for (let i = 0; i < n; i++) { app.frame(); await app.ctx.get("__yield")(); }
  };
  const press = (b) => { if (down.has(b)) return; down.add(b); on.press.forEach((f) => f(b)); };
  const release = (b) => { if (!down.has(b)) return; down.delete(b); on.release.forEach((f) => f(b)); };
  return { app, game: app.ctx.get("game"), frame, press, release, down, image: () => image };
}

/* the bundle's lopix12 subset, so a text call's row can be turned into the rows its
   glyphs actually ink; text(y) is the top of the cell, not a baseline */
function inkBounds(html, str) {
  const m = /LoGame\.font\((\{[\s\S]*?\})\);/.exec(html);
  assert.ok(m, "the bundle carries its pixel font");
  const font = JSON.parse(m[1]);
  let top = 99, bottom = -1;
  for (const ch of str) {
    const gl = font.glyphs[ch];
    if (!gl) continue;   /* a space (no glyph) or a character dropped from the subset */
    const cut = gl.indexOf(":"), w = +gl.slice(0, cut), buf = Buffer.from(gl.slice(cut + 1), "base64");
    for (let y = 0; y < font.cell; y++) for (let x = 0; x < w; x++) {
      if ((buf[(y * w + x) >> 3] >> (7 - ((y * w + x) & 7))) & 1) {
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  assert.ok(bottom >= 0, `no ink for ${JSON.stringify(str)} in the font`);
  return { top, bottom };
}

/* record one frame's g.text calls; y is the top of the glyph cell */
function recordText(game) {
  const calls = [], draw = game.g.text;
  game.g.text = function (str, x, y, o) { calls.push({ str, x, y }); return draw.call(game.g, str, x, y, o); };
  return calls;
}

const W = 160, H = 144;
function inkInEyeBox(img) {
  let n = 0;
  for (let y = 38; y <= 60; y++) for (let x = 49; x < 111; x++) {
    const o = (y * W + x) * 4;
    if (img.data[o] === 0x1f && img.data[o + 1] === 0x2a && img.data[o + 2] === 0x14) n++;
  }
  return n;
}

test("edge spacing: the title's top line and the pause footer keep 2 px", async () => {
  const html = readFileSync(APP, "utf8");
  const h = harness(APP);
  await h.frame(12);                      /* boot -> title */
  const calls = recordText(h.game);
  calls.length = 0;
  await h.frame(1);
  const topKeys = calls.find((c) => c.str === "↑↓选 A好");
  const endings = calls.find((c) => /^结局 \d+\/4$/.test(c.str));
  assert.ok(topKeys, "the title draws its key line");
  assert.ok(endings, "the title draws its ending count");
  for (const c of [topKeys, endings]) {
    const ink = inkBounds(html, c.str);
    assert.ok(c.y + ink.top >= 2, `"${c.str}" inks row ${c.y + ink.top}: less than 2 px from the top`);
    /* the line sat at y=2 and was pushed down to make room */
    assert.ok(c.y >= 4, `"${c.str}" starts at y=${c.y}, not 2 px lower than before`);
  }

  h.game.go("play", { i: 0 }, { fade: false });
  await h.frame(3);
  h.press("start");
  await h.frame(1);
  h.release("start");
  calls.length = 0;
  await h.frame(1);
  const footer = calls.find((c) => c.str.indexOf("START") >= 0 && c.str.indexOf("继续") >= 0);
  assert.ok(footer, "the pause menu draws its key footer");
  const ink = inkBounds(html, footer.str);
  assert.ok(footer.y >= 2, `pause footer starts at y=${footer.y}`);
  const bottom = footer.y + ink.bottom;
  assert.ok(H - 1 - bottom >= 2, `pause footer inks row ${bottom}: less than 2 px from the bottom`);
});

/* play song 0 by pressing each note on its frame, so the run reaches the first watch;
   returns one record per frame and the ink count in the eye's box at three moments */
async function playFirstSong(file) {
  const h = harness(file);
  await h.frame(6);
  h.game.go("play", { i: 0 }, { fade: false });
  await h.frame(2);
  const song = FAKE_SONGS[0], ws = song.watch[0][0], lead = 30 / song.bpm;
  const held = { a: null, b: null }, timeline = [], shots = { before: null, warn: null, open: null };
  for (let guard = 0; guard < 60 * 26; guard++) {
    const P = h.app.ctx.get("P");
    if (!P) break;
    const nextT = P.t + 1 / 60;
    /* let a hold go at its end; a tap goes on the frame after its press */
    for (const lane of ["a", "b"]) {
      const n = held[lane];
      if (!n) continue;
      if (!n.hold || nextT >= n.end - 0.005) { h.release(lane); held[lane] = null; }
    }
    /* press a note when its time is on this frame; never while the eye is open */
    if (!P.eye && !P.ended) {
      for (const n of P.chart) {
        if (P.judged[n.t]) continue;
        if (n.t > nextT - 0.009 && n.t <= nextT + 0.009) {
          if (held[n.lane]) { h.release(n.lane); held[n.lane] = null; }
          h.press(n.lane); held[n.lane] = n;
        }
      }
    }
    await h.frame(1);
    const Q = h.app.ctx.get("P"), t = +Q.t.toFixed(3);
    timeline.push({
      t, score: Q.score, suspicion: Q.suspicion, perfect: Q.perfect, good: Q.good,
      miss: Q.miss, noise: Q.noise, caught: Q.caught, eye: !!Q.eye, wake: Q.eyeWake || 0
    });
    if (t < ws - lead - 0.005 && t >= ws - lead - 0.15) shots.before = inkInEyeBox(h.image());
    else if (shots.warn == null && t >= ws - lead && t < ws && timeline[timeline.length - 1].wake === 0.5) {
      shots.warn = inkInEyeBox(h.image());
    }
    if (shots.open == null && Q.eye && t >= ws + 0.1) shots.open = inkInEyeBox(h.image());
    if (Q.ended || t > 25.5) break;
  }
  return { timeline, shots };
}

test("the king's eye twitches before it opens, and scoring is unchanged", async (t) => {
  const song = FAKE_SONGS[0];
  const [ws, we] = song.watch[0], lead = 30 / song.bpm;   /* half a beat */
  const now = await playFirstSong(APP);

  const before = now.timeline.filter((f) => f.t < ws - lead - 0.02);
  assert.ok(before.length > 20, "the run reaches the warning");
  assert.ok(before.every((f) => f.wake === 0), "the eye is quiet before its half beat");
  const warning = now.timeline.filter((f) => f.t >= ws - lead + 0.002 && f.t < ws - 0.002);
  assert.ok(warning.length >= 6, `only ${warning.length} frames in the warning half beat`);
  assert.ok(warning.every((f) => f.wake > 0 && f.wake < 0.7), "the eye is only ever half open (or shut) in the lead-up");
  assert.ok(warning.every((f) => !f.eye), "the watch itself has not begun");
  assert.ok(new Set(warning.map((f) => f.wake)).size >= 2, "the eyelid flickers instead of holding one frame");
  const open = now.timeline.filter((f) => f.t >= ws + 0.02 && f.t < we - 0.02);
  assert.ok(open.length > 60, "the run covers the whole watch");
  assert.ok(open.every((f) => f.eye && f.wake === 0), "the full eye, and no warning, while it watches");

  /* and it is really drawn: ink in the eye's box only from the lead-up on */
  assert.ok(now.shots.before < 20, `ink in the eye box before the warning: ${now.shots.before}`);
  assert.ok(now.shots.warn > now.shots.before + 40, `the warning eye draws (${now.shots.warn} ink pixels)`);
  assert.ok(now.shots.open > now.shots.warn, "the open eye is bigger than the half-open warning");

  /* the same scripted run on the last committed bundle: score and suspicion must match */
  let oldHtml;
  try {
    oldHtml = execFileSync("git", ["show", "HEAD:registry/apps/fake-yu/index.html"], { cwd: ROOT, encoding: "utf8", maxBuffer: 8 << 20 });
  } catch (e) {
    t.skip("no git to read the previous bundle: " + e.message);
    return;
  }
  const tmp = join(import.meta.dirname, "tmp-fakeyu-old.html");
  try {
    writeFileSync(tmp, oldHtml);
    const old = await playFirstSong(tmp);
    const norm = (tl) => tl.map((f) => [f.score, f.suspicion, f.perfect, f.good, f.miss, f.noise, f.caught]);
    assert.deepEqual(norm(now.timeline), norm(old.timeline), "score and suspicion changed");
  } finally {
    try { unlinkSync(tmp); } catch (e) {}
  }
});


/* The play HUD and the B touch button, in both languages and for every song: the key hints sit between
   the song's short name and the suspicion eye (from x = 112) without touching either, and the touch
   button and its label stay on the 160 px screen. (An iPhone showed "A play B hit" running into the eye
   and "B chime" cut off at the right edge in English.) */
for (const lang of ["zh", "en"]) {
  test(`the play HUD and the B button fit the screen for every song (${lang})`, async () => {
    const h = harness(APP, 7, lang);
    await h.frame(12);
    const calls = recordText(h.game);
    for (let i = 0; i < FAKE_SONGS.length; i++) {
      h.game.go("play", { i, story: false }, { fade: false });
      await h.frame(3);
      calls.length = 0;
      await h.frame(1);
      const m = (str) => h.game.g.measure(str);
      const hud = calls.filter((c) => c.y <= 3 && !/^\d+$/.test(c.str));
      const short = FAKE_SONGS[i].short[lang];
      const name = hud.find((c) => c.str === short);
      assert.ok(name, `${short}: the HUD draws the song's short name`);
      const nameEnd = name.x + m(name.str);
      for (const c of hud) {
        if (c === name) continue;
        assert.ok(c.x > nameEnd, `${short}: "${c.str}" at x=${c.x} runs into the name ending at ${nameEnd}`);
        assert.ok(c.x + m(c.str) <= 112, `${short}: "${c.str}" ends at ${c.x + m(c.str)}, over the eye at 112`);
      }
      const words = hud.filter((c) => c !== name).sort((a, b) => a.x - b.x);
      for (let k = 1; k < words.length; k++) {
        assert.ok(words[k].x >= words[k - 1].x + m(words[k - 1].str), `${short}: "${words[k - 1].str}" and "${words[k].str}" overlap`);
      }
      const P = h.app.ctx.get("P");
      if (P.hasB) {
        const B = h.app.ctx.get("TOUCH_B");
        const label = calls.find((c) => c.y === B.y + 3);
        assert.ok(label, `${short}: the B button draws its label`);
        assert.ok(B.x >= 0 && B.x + B.w <= 160, `${short}: the B button spans ${B.x}..${B.x + B.w}`);
        assert.ok(m(label.str) <= B.w - 4, `${short}: "${label.str}" (${m(label.str)} px) does not fit the ${B.w} px button`);
      }
    }
  });
}

test("an unreadable save: the title says so and a cleared song writes nothing over it (#311)", async () => {
  let saves = 0;
  const pad = {
    lang: "zh", spec: "lopda/1", on() {}, off() {}, isDown: () => false,
    load: () => { const e = new Error("PAD.load: corrupt"); e.code = "corrupt"; return Promise.reject(e); },
    save() { saves++; }, remove() {}, exit() {}, sfx() {},
    music: { play() {}, stop() {} }, ambience() {}
  };
  const app = boot(APP, { pad, seed: 7 });
  for (let i = 0; i < 12; i++) { app.frame(); await app.ctx.get("__yield")(); }
  assert.equal(app.ctx.get("canSave"), false);
  const game = app.ctx.get("game"), calls = recordText(game);
  app.frame();
  assert.ok(calls.some((c) => c.str === "存档读不出，这次不存"), "the title says the save cannot be read");
  app.ctx.get("saveProfile")();
  assert.equal(saves, 0, "nothing is written over the unreadable save");
});
