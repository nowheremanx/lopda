// Fake Yu's music data, checked without a browser: lengths, charts, gazes and MML.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
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
