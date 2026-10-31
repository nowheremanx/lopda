// runtime/studio-tools.js: each AI tool builds studio-edit ops, with errors a small model can act on (studio.md 12.19.3).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { runScript, read } from "./helpers.mjs";

const ctx = runScript("runtime/studio-song.js");
for (const f of ["runtime/studio-edit.js", "runtime/studio-styles.js", "runtime/studio-tools.js"]) {
  vm.runInContext(read(f), ctx, { filename: f });
}
const S = ctx.LopdaSong, E = ctx.LopdaStudioEdit, ST = ctx.LopdaStudioStyles, T = ctx.LopdaStudioTools;
const plain = (v) => JSON.parse(JSON.stringify(v));
const fresh = () => plain(S.newSong(1000));
const apply = (song, ops) => E.apply(song, ops);

test("TOOLS: the twelve tools of the table", () => {
  assert.deepEqual(plain(T.TOOLS), ["ops", "groove", "chords", "bass", "ghost", "fill", "stop", "melody", "copy", "chain", "set", "mix"]);
});

test("every tool's valid answer is an ops list that apply() accepts", () => {
  const cases = [
    { tool: "ops", ops: [{ op: "setBpm", value: 100 }] },
    { tool: "groove", pattern: 0, style: "lofi-a", energy: 1, fill: true },
    { tool: "chords", pattern: 0, roots: [0, 5, 3, 4] },
    { tool: "bass", pattern: 0, rhythm: "walk" },
    { tool: "ghost", pattern: 0, amount: 3 },
    { tool: "fill", pattern: 0 },
    { tool: "melody", pattern: 0, notes: [[0, 0, 0.9], [4, 2, 0.7], [8, 4]] },
    { tool: "copy", from: 0, to: 1, change: "same" },
    { tool: "copy", from: 0, to: 1, change: "sparse" },
    { tool: "copy", from: 0, to: 1, change: "no-melody" },
    { tool: "copy", from: 0, to: 1, change: "lift" },
    { tool: "chain", song: [0, 1, 2] },
    { tool: "set", bpm: 96, key: 4, scale: "major", swing: 0.6, tape: 2, kit: "soft", name: "Test" },
    { tool: "mix", track: "drums", vol: 0.8, mute: false },
  ];
  for (const call of cases) {
    const r = T.run(fresh(), call);
    assert.equal(r.error, undefined, `${call.tool}: ${r.error}`);
    assert.ok(Array.isArray(r.ops), call.tool);
    assert.ok(r.ops.length <= 64, call.tool + " stays under the op cap");
    const a = apply(fresh(), r.ops);
    assert.equal(a.error, undefined, `${call.tool}: apply -> ${a.error} at ${a.at}`);
    assert.ok(a.song, call.tool);
    assert.equal(S.validate(a.song).error, undefined, call.tool);
  }
});

test("groove: energy changes the hats, the kick and the perc; fill ends in a snare roll", () => {
  const low = apply(fresh(), T.run(fresh(), { tool: "groove", pattern: 0, style: "pop-a", energy: 0 }).ops).song;
  const high = apply(fresh(), T.run(fresh(), { tool: "groove", pattern: 0, style: "pop-a", energy: 2 }).ops).song;
  const hats = (s) => s.patterns[0].notes.drums.filter((n) => n.key === "hat").length;
  assert.ok(hats(high) > hats(low));
  assert.equal(high.patterns[0].notes.drums.some((n) => n.key === "perc"), true);
  assert.equal(low.patterns[0].notes.drums.some((n) => n.key === "perc"), false);
  assert.equal(low.patterns[0].notes.drums.filter((n) => n.key === "kick").every((n) => n.t % (4 * S.STEP) === 0), true);
  const filled = apply(fresh(), T.run(fresh(), { tool: "groove", pattern: 0, style: "lofi-a", energy: 1, fill: true }).ops).song;
  for (let step = 12; step < 16; step++) {
    assert.equal(filled.patterns[0].notes.drums.some((n) => n.key === "snare" && n.t === step * S.STEP), true, "snare " + step);
  }
});

test("chords: the roots land at 0/8 or 0/4/8/12 and the old chord track is cleared", () => {
  const r = T.run(fresh(), { tool: "chords", pattern: 0, roots: [0, 5, 3, 4] });
  const song = apply(fresh(), r.ops).song;
  const chords = song.patterns[0].notes.chords;
  assert.deepEqual(plain(chords.map((n) => [n.t, n.deg])), [[0, 0], [4 * S.STEP, 5], [8 * S.STEP, 3], [12 * S.STEP, 4]]);
  assert.equal(chords.every((n) => n.vel === 0.65), true);
});

test("bass: degrees follow the pattern's chords and stay in -3..9", () => {
  const r = T.run(fresh(), { tool: "bass", pattern: 0, rhythm: "walk" });
  const song = apply(fresh(), r.ops).song;
  const bass = song.patterns[0].notes.bass;
  assert.deepEqual(plain(bass.map((n) => [n.t / S.STEP, n.deg])), [[0, 0], [4, 3], [8, 7], [12, 2]]);
  for (const n of bass) assert.ok(n.deg >= -3 && n.deg <= 9);
  /* no chords at all reads as the tonic */
  const bare = apply(fresh(), [{ op: "clearTrack", pattern: 0, track: "chords" }]).song;
  const b = apply(bare, T.run(bare, { tool: "bass", pattern: 0, rhythm: "whole" }).ops).song;
  assert.equal(b.patterns[0].notes.bass[0].deg, T.rootDegree(bare, 0));
});

test("ghost and fill: ghosts sit on fixed free snare steps; the fill replaces 12-15", () => {
  const g = apply(fresh(), T.run(fresh(), { tool: "ghost", pattern: 0, amount: 2 }).ops).song;
  const snareSteps = g.patterns[0].notes.drums.filter((n) => n.key === "snare" && n.vel === 0.2).map((n) => n.t / S.STEP);
  assert.deepEqual(plain(snareSteps.sort((a, b) => a - b)), [3, 11]);
  const f = apply(fresh(), T.run(fresh(), { tool: "fill", pattern: 0 }).ops).song;
  for (let step = 12; step < 16; step++) {
    const hit = f.patterns[0].notes.drums.find((n) => n.key === "snare" && n.t === step * S.STEP);
    assert.ok(hit, "snare " + step);
  }
});

test("melody: the track is cleared and the new degrees and velocities are written", () => {
  const song = apply(fresh(), T.run(fresh(), { tool: "melody", pattern: 0, notes: [[0, 5, 0.9], [4, -2], [8, 10, 0.4]] }).ops).song;
  const mel = song.patterns[0].notes.melody;
  assert.deepEqual(plain(mel.map((n) => [n.t / S.STEP, n.deg])), [[0, 5], [4, -2], [8, 10]]);
  assert.equal(mel[1].vel, S.NOTE_VEL);
  assert.equal(mel[2].vel, 0.4);
});

test("copy: same, sparse, no-melody and lift all apply and change the target as named", () => {
  let base = apply(fresh(), [
    { op: "setNote", pattern: 0, track: "melody", step: 0, deg: 2, vel: 0.8 },
    { op: "setNote", pattern: 0, track: "melody", step: 2, deg: 3, vel: 0.6 },
  ]).song;
  const same = apply(base, T.run(base, { tool: "copy", from: 0, to: 1, change: "same" }).ops).song;
  assert.deepEqual(plain(same.patterns[1].notes), plain(same.patterns[0].notes));

  const sparse = apply(base, T.run(base, { tool: "copy", from: 0, to: 1, change: "sparse" }).ops).song;
  const hats = sparse.patterns[1].notes.drums.filter((n) => n.key === "hat").length;
  const srcHats = base.patterns[0].notes.drums.filter((n) => n.key === "hat").length;
  assert.ok(hats < srcHats, "some hats are gone");
  assert.deepEqual(plain(sparse.patterns[1].notes.melody.map((n) => n.t / S.STEP)), [0], "only the strong beat stays");

  const noMel = apply(base, T.run(base, { tool: "copy", from: 0, to: 1, change: "no-melody" }).ops).song;
  assert.deepEqual(plain(noMel.patterns[1].notes.melody), []);

  const lift = apply(base, T.run(base, { tool: "copy", from: 0, to: 1, change: "lift" }).ops).song;
  const lifted = lift.patterns[1].notes.melody.find((n) => n.t === 0);
  assert.equal(lifted.deg, 2 + S.SCALES[base.scale].length, "the melody moves up an octave");
  assert.ok(lift.patterns[1].notes.drums.filter((n) => n.key === "hat").length > srcHats);
});

test("chain, set and mix become their setChain and set operations", () => {
  const chain = apply(fresh(), T.run(fresh(), { tool: "chain", song: [0, 2, 5] }).ops);
  assert.deepEqual(plain(chain.song.song), [0, 2, 5]);
  assert.ok(chain.song.patterns[5]);
  const set = apply(fresh(), T.run(fresh(), { tool: "set", bpm: 96, key: 4, scale: "major", swing: 0.6, tape: 2, kit: "chip", name: "Tape" }).ops).song;
  assert.equal(set.bpm, 96);
  assert.equal(set.key, 4);
  assert.equal(set.scale, "major");
  assert.equal(set.swing, 0.6);
  assert.equal(set.tape, 2);
  assert.equal(set.kit, "chip");
  assert.equal(set.name, "Tape");
  const mix = apply(fresh(), T.run(fresh(), { tool: "mix", track: "bass", vol: 0.5, mute: true }).ops).song;
  assert.equal(mix.tracks.find((tr) => tr.id === "bass").vol, 0.5);
  assert.equal(mix.tracks.find((tr) => tr.id === "bass").mute, true);
});

test("errors: each bad argument is named, and short value lists are printed", () => {
  const error = (call) => T.run(fresh(), call).error || "";
  assert.match(error(null), /tool/);
  assert.match(error({ tool: "nope" }), /unknown tool 'nope'/);
  assert.match(error({ tool: "ops", ops: "x" }), /^ops:/);
  assert.match(error({ tool: "ops", ops: Array(65).fill({ op: "setBpm", value: 90 }) }), /^ops:/);
  assert.match(error({ tool: "groove", pattern: 16, style: "lofi-a" }), /^pattern:/);
  assert.match(error({ tool: "groove", pattern: 0, style: "jazzz" }), /^groove:.*jazzz.*lofi-a/);
  assert.match(error({ tool: "groove", pattern: 0, style: "lofi-a", energy: 3 }), /^energy:/);
  assert.match(error({ tool: "chords", pattern: 0, roots: [] }), /^roots:/);
  assert.match(error({ tool: "chords", pattern: 0, roots: [6] }), /^roots:/);
  assert.match(error({ tool: "bass", pattern: 0, rhythm: "bounce" }), /^bass:.*bounce.*whole/);
  assert.match(error({ tool: "ghost", pattern: 0, amount: 0 }), /^amount:/);
  assert.match(error({ tool: "fill", pattern: -1 }), /^pattern:/);
  assert.match(error({ tool: "melody", pattern: 0, notes: [[0, 0], [0, 2]] }), /^step:/);
  assert.match(error({ tool: "melody", pattern: 0, notes: [[0, 13]] }), /^deg:/);
  assert.match(error({ tool: "melody", pattern: 0, notes: Array(17).fill([0, 0]) }), /^notes:/);
  assert.match(error({ tool: "copy", from: 0, to: 1, change: "fast" }), /^change:.*fast.*same/);
  assert.match(error({ tool: "copy", from: 16, to: 1 }), /^from:/);
  assert.match(error({ tool: "copy", from: 0, to: 0 }), /^to:/);
  assert.match(error({ tool: "chain", song: [] }), /^song:/);
  assert.match(error({ tool: "chain", song: [16] }), /^song:/);
  assert.match(error({ tool: "set" }), /^set:/);
  assert.match(error({ tool: "set", scale: "blues" }), /^scale:.*blues.*major/);
  assert.match(error({ tool: "set", bpm: 200 }), /^bpm:/);
  assert.match(error({ tool: "mix", track: "voice", vol: 0.5 }), /^track:/);
  assert.match(error({ tool: "mix", track: "bass" }), /^mix:/);
  assert.match(error({ tool: "mix", track: "bass", vol: 2 }), /^vol:/);
});

test("rootDegree: seven-note scales land on the root; a missing pentatonic note falls to the note below", () => {
  const major = plain(fresh());
  major.key = 0;
  major.scale = "major";
  assert.equal(T.rootDegree(major, 0), 0);
  assert.equal(T.rootDegree(major, 4), 4);
  assert.equal(T.rootDegree(major, 5), 5);

  const penta = plain(fresh());
  penta.key = 9;             /* A */
  penta.scale = "minor-penta";
  assert.equal(T.rootDegree(penta, 0), 0);  /* A */
  assert.equal(T.rootDegree(penta, 2), 1);  /* C */
  assert.equal(T.rootDegree(penta, 1), 0);  /* B is not in A minor penta: the A below it */
  assert.equal(T.rootDegree(penta, 5), 3);  /* F is not there: the E below it */

  const majorPenta = plain(fresh());
  majorPenta.key = 0;
  majorPenta.scale = "major-penta";
  assert.equal(T.rootDegree(majorPenta, 3), 2);  /* F is not in C major penta: the E below it */
});

test("chordTones: root, third, fifth and seventh as grid degrees in 0..9", () => {
  const major = plain(fresh());
  major.key = 0;
  major.scale = "major";
  assert.deepEqual(plain(T.chordTones(major, 0)), [0, 2, 4, 6]);

  const minorPenta = plain(fresh());
  minorPenta.key = 9;
  minorPenta.scale = "minor-penta";
  assert.deepEqual(plain(T.chordTones(minorPenta, 0)), [0, 1, 3, 4]);

  for (const [scale, key] of [["major", 0], ["minor", 9], ["dorian", 2], ["major-penta", 0], ["minor-penta", 9]]) {
    const song = plain(fresh());
    song.key = key;
    song.scale = scale;
    for (let root = 0; root < 6; root++) {
      const tones = T.chordTones(song, root);
      assert.equal(tones.length, 4, `${scale} ${root}`);
      for (const d of tones) assert.ok(Number.isInteger(d) && d >= 0 && d <= 9, `${scale} ${root}: ${d}`);
    }
  }
});

test("bass fifth is the chord's fifth by pitch, also on a five-note grid; ghost skips a step that already has a snare", () => {
  const song = JSON.parse(JSON.stringify(S.newSong(0)));
  song.key = 9; song.scale = "minor-penta";
  let r = E.apply(song, T.run(song, { tool: "chords", pattern: 0, roots: [0] }).ops);
  const bass = T.run(r.song, { tool: "bass", pattern: 0, rhythm: "octaves" });
  assert.equal(bass.error, undefined);
  // A minor pentatonic: A C D E G -> the fifth of Am (E) is degree 3, never 4 (G)
  const fifthRhythm = Object.keys(ST.BASS).find((k) => ST.BASS[k].some((e) => e[2] === "fifth"));
  if (fifthRhythm) {
    const out = T.run(r.song, { tool: "bass", pattern: 0, rhythm: fifthRhythm });
    const i = ST.BASS[fifthRhythm].findIndex((e) => e[2] === "fifth");
    const notes = out.ops.filter((o) => o.op === "setNote");
    assert.equal(notes[i].deg, 3);
  }
  r = E.apply(r.song, [{ op: "setDrum", pattern: 0, drum: "snare", step: 3, on: true, vel: 0.9 }]);
  const g = T.run(r.song, { tool: "ghost", pattern: 0, amount: 1 });
  assert.deepEqual(plain(g.ops.map((o) => o.step)), [11]);
});

test("groove takes steps the model wrote; chords strum as stabs on 2 and 4 with rests after them", () => {
  const g = T.run(fresh(), { tool: "groove", pattern: 0, steps: { kick: [[0, 0.9], 8], snare: [[4, 0.8], [12, 0.8]] } });
  assert.equal(g.error, undefined);
  const song = apply(fresh(), g.ops).song;
  assert.deepEqual(plain(song.patterns[0].notes.drums.map((n) => [n.key, n.t / S.STEP]).sort()), [["kick", 0], ["kick", 8], ["snare", 12], ["snare", 4]]);
  assert.match(T.run(fresh(), { tool: "groove", pattern: 0, steps: { kick: [[16, 1]] } }).error, /0-15/);
  assert.match(T.run(fresh(), { tool: "groove", pattern: 0, steps: {} }).error, /no hits/);
  const c = apply(fresh(), T.run(fresh(), { tool: "chords", pattern: 0, roots: [3], rhythm: "stabs" }).ops).song;
  assert.deepEqual(plain(c.patterns[0].notes.chords.map((n) => [n.t / S.STEP, n.vel > 0])), [[4, true], [6, false], [12, true], [14, false]]);
  assert.match(T.run(fresh(), { tool: "chords", pattern: 0, roots: [0, 3], rhythm: "stabs" }).error, /one chord root/);
  assert.match(T.run(fresh(), { tool: "chords", pattern: 0, roots: [0], rhythm: "strum" }).error, /hold, stabs, pulse/);
});

test("bass under stabbed chords takes the bar's chord from beat 1", () => {
  const c = apply(fresh(), T.run(fresh(), { tool: "chords", pattern: 0, roots: [3], rhythm: "stabs" }).ops).song;
  const b = T.run(c, { tool: "bass", pattern: 0, rhythm: "boom" });
  assert.equal(b.ops.find((o) => o.op === "setNote" && o.step === 0).deg, T.rootDegree(c, 3));
});

/* ---------- 12.20.5: a chord root may name a quality and a semitone shift ---------- */
test("chords: object roots carry q and acc; a bare number is still the automatic chord", () => {
  const r = T.run(fresh(), { tool: "chords", pattern: 0, roots: [{ root: 0, q: "m7", acc: -1 }, { root: 4, q: "sus4" }, 5] });
  assert.equal(r.error, undefined);
  const song = apply(fresh(), r.ops).song;
  const chords = song.patterns[0].notes.chords;
  assert.deepEqual(plain(chords.map((n) => [n.t / S.STEP, n.deg, n.q, n.acc])), [
    [0, 0, "m7", -1], [8, 4, "sus4", null], [12, 5, null, null],
  ]);
  assert.equal(chords.every((n) => n.vel === 0.65), true);
  assert.equal(S.validate(song).error, undefined);

  // stabs and pulse take one root object and put its quality on every strike
  const c = apply(fresh(), T.run(fresh(), { tool: "chords", pattern: 0, roots: [{ root: 3, q: "7", acc: 1 }], rhythm: "stabs" }).ops).song;
  const struck = c.patterns[0].notes.chords.filter((n) => n.vel > 0);
  assert.deepEqual(plain(struck.map((n) => [n.t / S.STEP, n.deg, n.q, n.acc])), [[4, 3, "7", 1], [12, 3, "7", 1]]);
  assert.equal(S.validate(c).error, undefined);
});

test("chords: bad object roots are named, and the error lists the qualities", () => {
  const error = (roots) => T.run(fresh(), { tool: "chords", pattern: 0, roots }).error || "";
  assert.match(error([{ root: 6, q: "m7" }]), /^roots:/);
  assert.match(error([{ q: "m7" }]), /^roots:/);
  assert.match(error([{ root: 0, q: "blues" }]), /^roots:.*blues.*maj, m, 7/);
  assert.match(error([{ root: 0, q: "blues" }]), /m7b5/);
  assert.match(error([{ root: 0, acc: 0 }]), /^roots:.*acc/);
  assert.match(error([{ root: 0, acc: 2 }]), /^roots:.*acc/);
  assert.match(error(["0"]), /^roots:/);
  assert.match(error([0.5]), /^roots:/);
  assert.match(error([{ root: 0, q: 7 }]), /^roots:.*q/);
});

test("diatonicQ: a bare degree is the scale's own triad or seventh; rich leaves it to the machine", () => {
  const song = plain(S.newSong(0));
  song.key = 9; song.scale = "harmonic-minor";
  assert.deepEqual([0, 3, 4, 5].map((d) => T.diatonicQ(song, d, "triad")), ["m", "m", "maj", "maj"]);
  assert.deepEqual([0, 4].map((d) => T.diatonicQ(song, d, "seventh")), ["m7", "7"]);
  assert.equal(T.diatonicQ(song, 0, "rich"), null);
  song.scale = "major";
  assert.deepEqual([0, 1, 4].map((d) => T.diatonicQ(song, d, "seventh")), ["maj7", "m7", "7"]);
});

test("stop: everything after beat 3 goes, the band hits beat 3 and the tracks rest from step 10", () => {
  let song = fresh();
  song = apply(song, T.run(song, { tool: "melody", pattern: 0, notes: [[0, 2, 0.8], [6, 4, 0.7], [12, 3, 0.8]] }).ops).song;
  const r = apply(song, T.run(song, { tool: "stop", pattern: 0 }).ops).song;
  const notes = r.patterns[0].notes;
  assert.ok(notes.drums.every((n) => n.t <= 8 * S.STEP), "no drums after beat 3");
  assert.ok(notes.drums.some((n) => n.key === "snare" && n.t === 8 * S.STEP));
  for (const tr of ["bass", "chords", "melody"]) {
    const after = notes[tr].filter((n) => n.t >= 10 * S.STEP);
    assert.ok(after.length === 1 && after[0].vel === 0, tr + " rests from step 10");
  }
});
