// runtime/studio-compose.js: a motif and the chords become singable phrases (docs/design/studio.md 12.20.10).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { runScript, read } from "./helpers.mjs";

const ctx = runScript("runtime/studio-song.js");
for (const f of ["studio-styles.js", "studio-tools.js", "studio-compose.js"]) vm.runInContext(read("runtime/" + f), ctx, { filename: "runtime/" + f });
const S = ctx.LopdaSong, C = ctx.LopdaStudioCompose;
const song = (key, scale) => Object.assign(JSON.parse(JSON.stringify(S.newSong(0))), { key, scale });
const plain = (v) => JSON.parse(JSON.stringify(v));
const motif = { rhythm: [0, 3, 4, 8, 12], answer: [0, 6, 8, 12], contour: [1, 1, -2, 1], register: "mid", ending: "home" };
const bars = [{ root: 0, q: "m" }, { root: 5, q: "maj" }, { root: 3, q: "m" }, { root: 4, q: "maj" }];

test("phrase: the motif's rhythm and its answer, strong beats on chord tones, a long last note home", () => {
  const s = song(9, "harmonic-minor");
  const p = plain(C.phrase(s, motif, bars, {}));
  assert.equal(p.length, 4);
  assert.deepEqual(p[0].map((n) => n[0]), [0, 3, 4, 8, 12], "bar 1 is the motif's rhythm");
  assert.deepEqual(p[1].filter((n) => n[2] > 0).map((n) => n[0]), [0, 6, 8, 12], "bar 2 answers");
  for (let i = 0; i < 4; i++) {
    const chord = S.chordNotes(s, bars[i].root, bars[i].q).map((m) => m % 12);
    const first = p[i][0];
    assert.ok(chord.includes(S.noteMidi(s, "melody", first[1], first[3]) % 12), "bar " + (i + 1) + " starts on a chord tone");
  }
  const last = p[3][p[3].length - 1];
  assert.equal(S.noteMidi(s, "melody", last[1], last[3]) % 12, 9, "it ends home on A");
  assert.ok(last[0] <= 8, "and the last note is long");
  assert.deepEqual(plain(C.phrase(s, motif, bars, {})), p, "the same motif and chords give the same melody");
});

test("phrase: the second hearing ends open; no three equal notes in a row; inside the register", () => {
  const s = song(2, "minor");
  const a = plain(C.phrase(s, motif, bars, {})), b = plain(C.phrase(s, motif, bars, { variant: 1 }));
  assert.notDeepEqual(a[3], b[3]);
  const lastB = b[3][b[3].length - 1];
  assert.notEqual(S.noteMidi(s, "melody", lastB[1], lastB[3]) % 12, 2, "the variant does not end on the tonic D");
  for (const bar of a) {
    for (let i = 2; i < bar.length; i++) assert.ok(!(bar[i][1] === bar[i - 1][1] && bar[i][1] === bar[i - 2][1]), "no drone");
    for (const n of bar) assert.ok(n[1] >= -3 && n[1] <= 12);
  }
});

test("checkMotif: refuses even notes, a flat contour and bad words, with a reason", () => {
  assert.equal(C.checkMotif(motif), "");
  assert.match(C.checkMotif({ ...motif, rhythm: [0, 2, 4, 6, 8, 10, 12] }), /one length only/);
  assert.match(C.checkMotif({ ...motif, rhythm: [0, 2, 4, 6, 8, 10, 12, 14] }), /2-7 onset/);
  assert.match(C.checkMotif({ ...motif, contour: [0, 0] }), /must move/);
  assert.match(C.checkMotif({ ...motif, register: "top" }), /register/);
  assert.match(C.checkMotif({ ...motif, ending: "end" }), /ending/);
});
