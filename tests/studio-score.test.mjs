// runtime/studio-score.js: local conversion of score transcriptions into Tape4 songs.
// These short jianpu examples are our own transcriptions of public-domain folk tunes.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read, runScript } from "./helpers.mjs";

const ctx = runScript("runtime/studio-song.js");
vm.runInContext(read("runtime/studio-styles.js"), ctx, { filename: "runtime/studio-styles.js" });
vm.runInContext(read("runtime/studio-score.js"), ctx, { filename: "runtime/studio-score.js" });
const S = ctx.LopdaScore, Song = ctx.LopdaSong;
const plain = (v) => JSON.parse(JSON.stringify(v));
const beats = ["0", "0", "0", "0"];
const bar = (chords = [], melody = beats) => ({ chords, beats: melody });
const score = (bars, extra = {}) => ({ key: "C", meter: "4/4", bars, ...extra });

test("parseBeat accepts the supported subdivisions, dot, hold, and tie markers", () => {
  assert.deepEqual(plain(S.parseBeat("1")), [{ deg: 1, oct: 0, acc: 0, len16: 4, tie: false, hold: false }]);
  assert.deepEqual(plain(S.parseBeat("12" )).map((n) => n.len16), [2, 2]);
  assert.deepEqual(plain(S.parseBeat("1234")).map((n) => n.len16), [1, 1, 1, 1]);
  assert.deepEqual(plain(S.parseBeat("1.5")).map((n) => n.len16), [3, 1]);
  assert.deepEqual(plain(S.parseBeat("#5''")), [{ deg: 5, oct: 2, acc: 1, len16: 4, tie: false, hold: false }]);
  assert.equal(plain(S.parseBeat("4~"))[0].tie, true);
  assert.deepEqual(plain(S.parseBeat("-")), [{ deg: 0, oct: 0, acc: 0, len16: 4, tie: false, hold: true }]);
});

test("check is strict about the score shape and locates beat grammar errors", () => {
  const ok = S.check(score([bar()]));
  assert.equal(ok.error, undefined);
  assert.equal(ok.score.capo, 0);
  assert.equal(S.check(score([bar()], { meter: "3/4" })).error, "meter");
  for (const [bad, error] of [["123", "triplet"], ["", "empty"], ["12345", "tokens"], ["1.", "length"], ["1x", "token"]]) {
    const result = S.check(score([bar([], [bad, "0", "0", "0"])]));
    assert.equal(result.error, error);
    assert.deepEqual(plain(result.at), { bar: 0, beat: 0 });
  }
  assert.equal(S.check({ ...score([bar()]), extra: true }).error, "shape");
  assert.equal(S.check(score([bar()], { capo: 12 })).error, "capo");
  assert.equal(S.check({ ...score([bar()]), bars: [bar([], ["0", "0", "0"])] }).error, "beats");
  const threeChords = S.check(score([bar(["C", "F", "G"])]));
  assert.equal(threeChords.error, "chords");
  assert.deepEqual(plain(threeChords.at), { bar: 0 });
  const nonString = S.check(score([bar([], ["0", "0", null, "0"])]));
  assert.equal(nonString.error, "beat");
  assert.deepEqual(plain(nonString.at), { bar: 0, beat: 2 });
});

test("keyPc accounts for capo and recognizes natural-minor key spelling", () => {
  assert.equal(S.keyPc("G", 4), 11);
  assert.equal(S.keyPc("A", 2), 11);
  assert.equal(S.keyPc("Em", 0), 4);
  assert.equal(S.keyPc("Bb", 0), 10);
  assert.equal(S.keyPc("E#", 0), 5);
  assert.equal(S.keyPc("H", 0), null);
});

test("chord maps the Tape4 qualities and aliases", () => {
  const pairs = [
    ["C", "maj"], ["Cm", "m"], ["C7", "7"], ["Cmaj7", "maj7"], ["CM7", "maj7"], ["CΔ", "maj7"],
    ["Cm7", "m7"], ["C9", "9"], ["Cm9", "m9"], ["C6", "6"], ["Cm6", "m6"], ["Cadd9", "add9"],
    ["Cadd2", "add9"], ["Csus2", "sus2"], ["Csus4", "sus4"], ["Csus", "sus4"], ["Cdim", "dim"],
    ["Cdim7", "dim7"], ["Caug", "aug"], ["C+", "aug"], ["Cm7b5", "m7b5"], ["Cø", "m7b5"], ["C5", "5"],
  ];
  for (const [symbol, q] of pairs) assert.equal(S.chord(symbol, 0).q, q, symbol);
  const fallback = [
    ["Cm7add11", "m7"], ["Cadd11", "maj"], ["Cm(add9)", "m"], ["Cmadd9", "m"], ["Cmaj9", "maj7"],
    ["C11", "7"], ["C13", "9"], ["Cm11", "m7"], ["Csus4add9", "sus4"], ["C7sus4", "sus4"], ["CmMaj7", "m"],
  ];
  for (const [symbol, q] of fallback) {
    const result = S.chord(symbol, 0);
    assert.equal(result.q, q, symbol);
    assert.equal(result.lost, `chord:${symbol}>${q}`);
  }
  for (const [symbol, q] of [["Cmaj", "maj"], ["Cmaj13", "maj7"], ["Cmin7", "m"], ["Cmystery", "m"], ["Cxyz", "maj"]]) {
    const result = S.chord(symbol, 0);
    assert.equal(result.q, q, symbol);
    assert.equal(result.lost, `chord:${symbol}>${q}`);
  }
  for (const suffix of ["constructor", "toString", "__proto__"]){
    const result = S.chord("C" + suffix, 0);
    assert.equal(result.q, "maj", suffix);
    assert.equal(result.lost, `chord:C${suffix}>maj`, suffix);
  }
  assert.equal(S.chord("Codd", 0).q, "maj");
  assert.equal(S.chord("Cmystery", 0).q, "m");
  assert.equal(S.chord("Codd", 0).lost, "chord:Codd>maj");
});

test("chord resolves slash bass and sharp/flat out-of-scale roots", () => {
  assert.deepEqual(plain(S.chord("Bsus2/G#", 11)), { deg: 0, acc: 0, q: "sus2", bassPc: 8 });
  assert.deepEqual(plain(S.chord("E#", 11)), { deg: 3, acc: 1, q: "maj" });
  assert.deepEqual(plain(S.chord("Bb", 0)), { deg: 6, acc: -1, q: "maj" });
});

test("jianpu octaves follow the nearest previous sounding note, with ties downward", () => {
  const out = S.toSong(score([
    bar([], ["1", "5", "5", "3"]),
    bar([], ["5", "5", "0", "0"]),
  ]), 123);
  assert.ok(out.song);
  const notes = out.song.patterns[0].notes.melody.concat(out.song.patterns[1].notes.melody);
  const midis = notes.filter((n) => n.vel > 0).map((n) => Song.noteMidi(out.song, "melody", n.deg, n.acc));
  assert.deepEqual(plain(midis), [72, 67, 67, 64, 67, 67], "the mean below 60 triggers the one-octave lift");
  // A single note at the tritone midpoint chooses the lower octave.
  const tieDown = S.toSong(score([bar([], ["1", "#4", "0", "0"])]));
  const midi = tieDown.song.patterns[0].notes.melody.filter((n) => n.vel > 0).map((n) => Song.noteMidi(tieDown.song, "melody", n.deg, n.acc));
  assert.deepEqual(plain(midi), [72, 66], "the midpoint chooses the lower octave before the mean lift");
  const sixBelow = S.toSong(score([bar([], ["1116", "0", "0", "0"])]));
  const sixMidis = sixBelow.song.patterns[0].notes.melody.filter((n) => n.vel > 0)
    .map((n) => Song.noteMidi(sixBelow.song, "melody", n.deg, n.acc));
  assert.deepEqual(plain(sixMidis), [72, 72, 72, 69], "6 sits below 1 by the nearest-octave rule");
});

test("explicit octave marks are honored and the below-60 mean is shifted up", () => {
  const up = S.toSong(score([bar([], ["1'", "0", "0", "0"])]));
  assert.equal(Song.noteMidi(up.song, "melody", up.song.patterns[0].notes.melody[0].deg, up.song.patterns[0].notes.melody[0].acc), 72);
  const shifted = S.toSong(score([bar([], ["1", "0", "0", "0"])], { key: "B" }));
  assert.equal(Song.noteMidi(shifted.song, "melody", shifted.song.patterns[0].notes.melody[0].deg, shifted.song.patterns[0].notes.melody[0].acc), 71);
  const unchanged = S.toSong(score([bar([], ["1", "0", "0", "0"])]));
  assert.equal(Song.noteMidi(unchanged.song, "melody", unchanged.song.patterns[0].notes.melody[0].deg, unchanged.song.patterns[0].notes.melody[0].acc), 60);
});

test("rests, same-pitch ties, slurs to a different pitch, and a barline re-strike", () => {
  const same = S.toSong(score([bar([], ["1~", "1", "0", "0"])]));
  assert.deepEqual(plain(same.song.patterns[0].notes.melody.map((n) => n.t)), [0, 192, 288]);
  const different = S.toSong(score([bar([], ["1~", "2", "0", "0"])]));
  assert.deepEqual(plain(different.song.patterns[0].notes.melody.map((n) => n.t)), [0, 96, 192, 288]);
  const line = S.toSong(score([
    bar([], ["0", "0", "0", "1"]),
    bar([], ["-", "0", "0", "0"]),
  ]));
  assert.equal(line.song.patterns[1].notes.melody[0].t, 0);
  assert.equal(line.song.patterns[1].notes.melody[0].vel, Song.NOTE_VEL);
  assert.equal(line.song.patterns[0].notes.melody[0].vel, Song.REST_VEL);
  const tiedAtLine = S.toSong(score([
    bar([], ["0", "0", "0", "1~"]),
    bar([], ["1", "0", "0", "0"]),
  ]));
  assert.equal(tiedAtLine.song.patterns[1].notes.melody.find((n) => n.vel > 0).t, 0);
  const restThenHold = S.toSong(score([
    bar([], ["0", "0", "0", "0"]),
    bar([], ["-", "0", "0", "0"]),
  ]));
  assert.equal(restThenHold.song.patterns[1].notes.melody.some((n) => n.vel > 0), false);
  const noMeanDoubleCount = S.toSong(score([
    bar([], ["#1", "0", "0", "b1"]),
    bar([], ["-", "0", "0", "0"]),
  ]));
  const restruck = noMeanDoubleCount.song.patterns[1].notes.melody.find((n) => n.vel > 0);
  assert.equal(Song.noteMidi(noMeanDoubleCount.song, "melody", restruck.deg, restruck.acc), 59);
});

test("chords, carry, bass, groove, metadata and event playback form a valid song", () => {
  const tape = S.toSong(score([
    bar(["C", "G7"], ["1", "2", "3", "4"]),
    bar([], ["5", "6", "7", "1"]),
  ], { title: "PD folk", bpm: 240 }), 9876);
  assert.equal(tape.error, undefined);
  assert.equal(tape.song.name, "PD folk");
  assert.equal(tape.song.bpm, 140);
  assert.equal(tape.song.updated, 9876);
  assert.equal(tape.song.swing, 0.5);
  assert.equal(tape.song.tape, 2);
  assert.equal(tape.song.kit, "soft");
  assert.equal(tape.song.tracks.find((t) => t.id === "chords").voice, "guitar");
  assert.equal(tape.song.tracks.find((t) => t.id === "melody").voice, "flute");
  assert.equal(tape.song.patterns[0].notes.chords.length, 2);
  assert.deepEqual(plain(tape.song.patterns[0].notes.chords.map((n) => n.t)), [0, 8 * Song.STEP]);
  assert.equal(tape.song.patterns[0].notes.bass.length, 4);
  assert.deepEqual(plain(tape.song.patterns[0].notes.bass.map((n) => n.t)), [0, 6 * Song.STEP, 8 * Song.STEP, 14 * Song.STEP]);
  assert.ok(tape.song.patterns[0].notes.drums.length > 0);
  assert.deepEqual(plain(tape.song.patterns[1].notes.chords.map((n) => [n.t, n.deg])), [[0, 4]], "empty chords carry the last chord");
  assert.equal(Song.validate(tape.song).error, undefined);
  assert.ok(Song.events(tape.song, tape.song.song[0], 0, 16 * Song.STEP).length > 0);
  assert.equal(S.toSong(score([bar()], { bpm: null })).song.bpm, 80);
  assert.equal(S.toSong(score([bar()], { bpm: 30 })).song.bpm, Song.BPM_MIN);
});

test("titles are truncated to 40 code points while check accepts long titles", () => {
  const title = "x".repeat(50);
  assert.equal(S.check(score([bar()], { title })).error, undefined);
  const result = S.toSong(score([bar()], { title }));
  assert.ok(result.song);
  assert.equal(Array.from(result.song.name).length, 40);
});

test("drums play for a melody pickup, but not for a silent chordless bar", () => {
  const pickup = S.toSong(score([bar([], ["1", "0", "0", "0"])]));
  const silent = S.toSong(score([bar()]));
  assert.ok(pickup.song.patterns[0].notes.drums.length > 0);
  assert.equal(silent.song.patterns[0].notes.drums.length, 0);
});

test("the examples are self-written public-domain jianpu and convert into playable tapes", () => {
  // Our own short jianpu sketches of 茉莉花 and When the Saints Go Marching In.
  const jasmine = S.toSong(score([
    bar(["C", "G7"], ["3", "5", "6", "5"]),
    bar(["C"], ["3", "5", "6", "5"]),
    bar(["G7"], ["2", "3", "2", "1"]),
    bar(["C"], ["2", "1", "6", "5"]),
  ]));
  const saints = S.toSong(score([
    bar(["C"], ["1", "3", "4", "5"]),
    bar(["C"], ["1", "3", "4", "5"]),
    bar(["C"], ["1", "3", "4", "5"]),
    bar(["C"], ["5", "4", "3", "1"]),
  ]));
  for (const result of [jasmine, saints]) {
    assert.ok(result.song);
    assert.equal(Song.validate(result.song).error, undefined);
    assert.ok(Song.chainEvents(result.song, result.song.song, 0, result.song.song.length * 16 * Song.STEP).length > 0);
  }
  const minor = S.toSong(score([bar(["Em"])], { key: "Em" }));
  assert.equal(minor.song.scale, "minor");
});

test("identical bars share patterns, while 64 patterns and 96 chain slots are hard limits", () => {
  const same = S.toSong(score([bar(["C"]), bar(["C"]), bar(["C"])]));
  assert.equal(same.song.patterns.length, 1);
  assert.deepEqual(plain(same.song.song), [0, 0, 0]);
  const quality = ["", "m", "7", "maj7", "m7", "9", "m9", "6", "m6", "add9", "sus2", "sus4", "dim", "dim7", "aug", "m7b5", "5"];
  const many = [];
  for (let root = 0; root < 4; root++) for (let q = 0; q < quality.length; q++) {
    many.push(bar(["CDEG"[root] + quality[q]]));
    if (many.length === 65) break;
  }
  const cut = S.toSong(score(many));
  assert.equal(cut.song.patterns.length, 64);
  assert.equal(cut.song.song.length, 64);
  assert.ok(cut.lost.includes("bars:65"));
  const slots = S.toSong(score(Array.from({ length: 100 }, () => bar(["C"]))));
  assert.equal(slots.song.song.length, 96);
  assert.ok(slots.lost.includes("bars:97"));
});

test("only surviving bars affect the auto-octave mean and lost chord codes", () => {
  const quality = ["", "m", "7", "maj7", "m7", "9", "m9", "6", "m6", "add9", "sus2", "sus4", "dim", "dim7", "aug", "m7b5", "5"];
  const bars = [];
  for (const root of ["C", "D", "E", "G"]) {
    for (const q of quality) {
      if (bars.length === 64) break;
      bars.push(bar([root + q], ["1", "0", "0", "0"]));
    }
  }
  bars.push(bar(["Cconstructor"], ["1,,,", "0", "0", "0"]));
  const result = S.toSong(score(bars));
  assert.equal(result.song.song.length, 64);
  const first = result.song.patterns[0].notes.melody.find((n) => n.vel > 0);
  assert.equal(Song.noteMidi(result.song, "melody", first.deg, first.acc), 60);
  assert.deepEqual(plain(result.lost), ["bars:65"]);
});

test("degreeFor is an exact inverse of noteMidi across the playable pitch range", () => {
  for (const key of [0, 4, 9, 11]) for (const scale of ["major", "minor"]) {
    const song = { key, scale };
    for (let midi = 36; midi <= 84; midi++) {
      const degree = S.degreeFor(song, "melody", midi);
      assert.ok(degree, `${key}/${scale} MIDI ${midi}`);
      assert.equal(Song.noteMidi(song, "melody", degree.deg, degree.acc), midi);
    }
  }
});

test("degreeFor prefers in-scale spelling, then sharp, then flat, without losing round trips", () => {
  assert.deepEqual(plain(S.degreeFor({ key: 0, scale: "major" }, "melody", 65)), { deg: 3, acc: 0 });
  assert.deepEqual(plain(S.degreeFor({ key: 0, scale: "major" }, "melody", 72)), { deg: 7, acc: 0 });
  for (const song of [{ key: 0, scale: "major" }, { key: 7, scale: "major" }, { key: 9, scale: "minor" }]) {
    for (let midi = 36; midi <= 84; midi++) {
      const inScale = Array.from({ length: 65 }, (_, i) => i - 32)
        .some((deg) => Song.noteMidi(song, "melody", deg, 0) === midi);
      const degree = S.degreeFor(song, "melody", midi);
      if (inScale) assert.equal(degree.acc, 0, `${song.key}/${song.scale} MIDI ${midi}`);
      assert.equal(Song.noteMidi(song, "melody", degree.deg, degree.acc), midi);
    }
  }
});
