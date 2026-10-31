// runtime/studio-critic.js: the AI's melody moves and a teacher's notes (docs/design/studio.md 12.20.13).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { runScript, read } from "./helpers.mjs";

const ctx = runScript("runtime/studio-song.js");
for (const f of ["studio-styles.js", "studio-tools.js", "studio-critic.js"]) vm.runInContext(read("runtime/" + f), ctx, { filename: "runtime/" + f });
const S = ctx.LopdaSong, K = ctx.LopdaStudioCritic;
const plain = (v) => JSON.parse(JSON.stringify(v));
const song = (key, scale) => Object.assign(plain(S.newSong(0)), { key, scale });
const C4 = [{ root: 0, q: "maj" }, { root: 5, q: "m" }, { root: 3, q: "maj" }, { root: 4, q: "maj" }];

test("expand: repeat with a new end, sequence, invert and rest develop earlier bars", () => {
  const a = [[0, 2, 0.9], [3, 3, 0.7], [8, 4, 0.8]];
  const r = plain(K.expand([a, { repeat: 1, end: [[8, 1, 0.9]] }, { sequence: 1, by: 2 }, { invert: 1 }, { rest: true }]));
  assert.deepEqual(r.bars[1], [[0, 2, 0.9], [3, 3, 0.7], [8, 1, 0.9]]);
  assert.deepEqual(r.bars[2].map((n) => n[1]), [4, 5, 6]);
  assert.deepEqual(r.bars[3].map((n) => n[1]), [2, 1, 0]);
  assert.deepEqual(r.bars[4], []);
  assert.match(K.expand([{ repeat: 1 }]).error, /earlier bar/);
  assert.match(K.expand([a, { sequence: 1, by: 0 }]).error, /by/);
  assert.match(K.expand([[[4, 1], [2, 2]]]).error, /rising/);
});

test("review: a scale run, a broken chord, even notes, no breath and a narrow line each get a note; a good tune none", () => {
  const s = song(0, "major");
  const good = plain(K.expand([[[0, 2, 0.9], [3, 3, 0.7], [4, 4, 0.8], [8, 2, 0.8], [12, 1, 0.7]], { repeat: 1, end: [[8, 4, 0.9]] }, { sequence: 1, by: 1 }, [[0, 2, 0.9], [6, 1, 0.7], [8, 0, 0.9]]]).bars);
  assert.deepEqual(plain(K.review(s, good, C4, [])), []);
  const run = [[[0, 0, 0.8], [2, 1, 0.8], [4, 2, 0.8], [6, 3, 0.8], [8, 4, 0.8], [10, 5, 0.8], [12, 6, 0.8]]];
  const notes = K.review(s, run, C4, []).join(" | ");
  assert.match(notes, /even notes/);
  assert.match(notes, /by step for six notes/);
  const arp = [[[0, 0, 0.8], [3, 2, 0.8], [4, 4, 0.8], [8, 7, 0.8], [14, 4, 0.8]], [[0, 0, 0.8], [3, 2, 0.8], [4, 4, 0.8], [8, 7, 0.8], [14, 4, 0.8]]];
  assert.match(K.review(s, arp, C4, []).join(" "), /arpeggiates/);
  assert.match(K.review(s, arp, C4, []).join(" "), /never breathes/);
  assert.match(K.review(s, good, C4, [{ id: "verse", bars: good }]).join(" "), /repeats the verse exactly/);
});

test("fitToChord moves the weighty notes onto the new chord; endOtherWay flips the ending", () => {
  const s = song(0, "major");
  const bar = [[0, 0, 0.9], [4, 1, 0.7], [8, 0, 0.9]];
  const f = plain(K.fitToChord(s, bar, { root: 4, q: "maj" }, -3, 9));
  for (const n of [f[0], f[2]]) assert.ok([7, 11, 2].includes(S.noteMidi(s, "melody", n[1], n[3]) % 12), "on G, B or D");
  assert.equal(f[1][1], 1, "a quick note between stays");
  const home = [[0, 4, 0.9], [8, 7, 0.9]];
  const open = plain(K.endOtherWay(s, home, { root: 0, q: "maj" }));
  assert.notEqual(S.noteMidi(s, "melody", open[1][1], open[1][3]) % 12, 0, "home becomes open");
  const back = plain(K.endOtherWay(s, open, { root: 0, q: "maj" }));
  assert.equal(S.noteMidi(s, "melody", back[1][1], back[1][3]) % 12, 0, "open becomes home");
});

test("expand reads an ornament written where acc goes; a half phrase ending on a held beat breathes", () => {
  const r = plain(K.expand([[[0, 2, 0.8, "vib"], [8, 3, 0.8]]]));
  assert.deepEqual(r.bars[0][0], [0, 2, 0.8, 0, "vib"]);
  const s = song(0, "major");
  const bars = [[[0, 2, 0.8], [3, 3, 0.7], [6, 4, 0.8], [8, 2, 0.8], [10, 1, 0.7]], [[0, 2, 0.8], [3, 3, 0.7], [6, 4, 0.8], [12, 1, 0.8]]];
  assert.doesNotMatch(K.review(s, bars, C4, []).join(" "), /breathes/);
});
