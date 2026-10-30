// runtime/studio-song.js: the song format of the four-track tape machine, validate, the drum grid, scheduling with swing,
// scale degrees, the grid's pitch and chords, the patterns and the song chain (docs/design/studio.md sections 3, 11 and 12).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const S = runScript("runtime/studio-song.js").LopdaSong;
const plain = (v) => JSON.parse(JSON.stringify(v));
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg} (${a} vs ${b})`);
const fresh = () => plain(S.newSong(1000));
// Since 12.9 the demo also has bass and chords; event tests that count drum hits alone start from this song.
const drumsOnly = () => { const s = fresh(); s.patterns[0].notes.bass = []; s.patterns[0].notes.chords = []; return s; };
const broken = (mut) => { const s = fresh(); mut(s); return S.validate(s); };
const P = 16 * S.STEP; // one pattern at the demo length

test("constants: format, tracks, scales, demo beat", () => {
  assert.equal(S.V, 1);
  assert.equal(S.TPB, 96);
  assert.equal(S.STEP, 24);
  assert.equal(S.STEPS, 16);
  assert.deepEqual([S.BPM_MIN, S.BPM_MAX, S.BPM_DEFAULT, S.BPM_STEP], [60, 140, 82, 2]);
  assert.deepEqual(plain(S.DRUMS), ["kick", "snare", "hat", "perc"]);
  assert.deepEqual(plain(S.KITS), ["chip", "soft"]);
  assert.deepEqual(plain(S.KINDS), ["drum", "note", "chord", "voice"]);
  assert.deepEqual(plain(S.TRACKS), [
    { id: "drums", kind: "drum", vol: 1, mute: false },
    { id: "bass", kind: "note", vol: 1, mute: false },
    { id: "chords", kind: "chord", vol: 1, mute: false },
    { id: "melody", kind: "note", vol: 1, mute: false },
    { id: "voice", kind: "voice", vol: 1, mute: false },
  ]);
  assert.deepEqual(plain(S.SCALES), {
    "minor-penta": [0, 3, 5, 7, 10],
    "major-penta": [0, 2, 4, 7, 9],
    minor: [0, 2, 3, 5, 7, 8, 10],
    major: [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
  });
  assert.deepEqual([S.SWING_MIN, S.SWING_MAX, S.SWING_DEFAULT], [0.5, 0.75, 0.55]);
  assert.equal(S.TAPE_MAX, 4);
  assert.equal(S.PATTERNS_MAX, 16);
  assert.equal(S.SONG_MAX, 96);
  assert.equal(S.NAME_MAX, 40);
  assert.deepEqual(plain(S.DEMO), {
    kick: [1, 8, 11],
    snare: [5, 13],
    hat: [1, 3, 5, 7, 9, 11, 13],
    perc: [16],
    vel: { kick: 1, snare: 0.9, hat: 0.55, perc: 0.7 },
  });
});

test("newSong: validates, carries the demo beat, and copies the default tracks", () => {
  const song = S.newSong(1234);
  assert.equal(S.validate(song).error, undefined);
  assert.equal(song.updated, 1234);
  assert.equal(S.newSong().updated, 0);
  assert.equal(song.v, 1);
  assert.equal(song.name, "");
  assert.equal(song.bpm, 82);
  assert.equal(song.key, 9);
  assert.equal(song.scale, "minor-penta");
  assert.equal(song.swing, 0.55);
  assert.equal(song.tape, 2);
  assert.equal(song.kit, "soft");
  assert.deepEqual(plain(song.song), [0]);
  assert.deepEqual(plain(song.clips), []);

  // the stored tracks are a copy: editing a song never edits the constant
  song.tracks[0].id = "changed";
  assert.equal(S.TRACKS[0].id, "drums");
  // 12.14: the mixer's two fields start at full volume, unmuted
  assert.deepEqual(plain(S.newSong().tracks.map((t) => [t.id, t.vol, t.mute])), [
    ["drums", 1, false], ["bass", 1, false], ["chords", 1, false], ["melody", 1, false], ["voice", 1, false],
  ]);

  const p = song.patterns[0];
  assert.equal(p.len, 16);
  assert.deepEqual(Object.keys(p.notes).sort(), ["bass", "chords", "drums", "melody"]);
  // 12.9: bass on steps 1, 9, 11 (degrees 0, 2, 3), chords on steps 1, 9 (degrees 0, 3), lengths tied to the next note
  assert.deepEqual(plain(p.notes.bass), [
    { t: 0, len: 192, deg: 0, vel: S.NOTE_VEL },
    { t: 192, len: 48, deg: 2, vel: S.NOTE_VEL },
    { t: 240, len: 144, deg: 3, vel: S.NOTE_VEL },
  ]);
  assert.deepEqual(plain(p.notes.chords), [
    { t: 0, len: 192, deg: 0, vel: S.NOTE_VEL },
    { t: 192, len: 192, deg: 3, vel: S.NOTE_VEL },
  ]);
  assert.deepEqual(plain(p.notes.melody), []);

  const expected = [];
  for (const drum of S.DRUMS) {
    for (const step of S.DEMO[drum]) expected.push({ t: (step - 1) * S.STEP, len: S.STEP, key: drum, vel: S.DEMO.vel[drum] });
  }
  expected.sort((a, b) => a.t - b.t || S.DRUMS.indexOf(a.key) - S.DRUMS.indexOf(b.key));
  const drums = plain(p.notes.drums);
  assert.deepEqual(drums, expected);

  // the beat that is written on the grid, 1-based: kick 1, 8, 11; snare 5, 13; hat the odd steps up to 13 (not 15); perc 16
  const steps = (drum) => drums.filter((n) => n.key === drum).map((n) => n.t / S.STEP + 1);
  assert.deepEqual(steps("kick"), [1, 8, 11]);
  assert.deepEqual(steps("snare"), [5, 13]);
  assert.deepEqual(steps("hat"), [1, 3, 5, 7, 9, 11, 13]);
  assert.deepEqual(steps("perc"), [16]);
  for (const n of drums) {
    assert.equal(n.len, S.STEP);
    assert.equal(n.vel, S.DEMO.vel[n.key]);
  }

  // sorted by tick, then by the drum row
  for (let i = 1; i < drums.length; i++) {
    assert.ok(drums[i - 1].t < drums[i].t || (drums[i - 1].t === drums[i].t && S.DRUMS.indexOf(drums[i - 1].key) < S.DRUMS.indexOf(drums[i].key)));
  }
});

test("validate: hands back a deep copy; unknown fields survive", () => {
  const song = fresh();
  song.extra = { from: "a later minor writer" };
  song.patterns[0].notes.drums[0].human = true;
  song.patterns[0].notes.bass = [{ t: 0, len: 24, deg: 0, vel: 1, slide: 3 }];

  const ok = S.validate(song);
  assert.ok(ok.song);
  assert.deepEqual(plain(ok.song), song);
  assert.notEqual(ok.song, song);

  // editing what validate returned leaves the document it was given alone
  ok.song.name = "changed";
  ok.song.patterns[0].notes.drums[0].key = "snare";
  ok.song.patterns[0].notes.drums.push({ t: 0, len: 24, key: "perc", vel: 1 });
  assert.equal(song.name, "");
  assert.equal(song.patterns[0].notes.drums[0].key, "kick");
  assert.equal(song.patterns[0].notes.drums.length, 13);
});

test("validate: type, newer (before the fields), version", () => {
  for (const x of [null, undefined, [], "song", 3, new Date(0)]) assert.equal(S.validate(x).error, "type", String(x));
  assert.equal(broken((s) => { s.v = 2; }).error, "newer");
  // a too-new file is refused as too new even when a field we know is broken
  assert.equal(broken((s) => { s.v = 2; s.bpm = 1; }).error, "newer");
  assert.equal(broken((s) => { delete s.v; }).error, "version");
  assert.equal(broken((s) => { s.v = 0; }).error, "version");
  assert.equal(broken((s) => { s.v = 1.5; }).error, "version");
  assert.equal(broken((s) => { s.v = "1"; }).error, "version");
});

test("validate: bpm, key, scale, swing, tape, kit, name, updated", () => {
  const cases = [
    [(s) => { s.bpm = 59; }, "bpm"],
    [(s) => { s.bpm = 141; }, "bpm"],
    [(s) => { s.bpm = "82"; }, "bpm"],
    [(s) => { delete s.bpm; }, "bpm"],
    [(s) => { s.key = -1; }, "key"],
    [(s) => { s.key = 12; }, "key"],
    [(s) => { s.key = 1.5; }, "key"],
    [(s) => { s.scale = "blues"; }, "scale"],
    [(s) => { delete s.scale; }, "scale"],
    [(s) => { s.swing = 0.49; }, "swing"],
    [(s) => { s.swing = 0.76; }, "swing"],
    [(s) => { s.swing = "0.55"; }, "swing"],
    [(s) => { s.tape = -1; }, "tape"],
    [(s) => { s.tape = 5; }, "tape"],
    [(s) => { s.tape = 2.5; }, "tape"],
    [(s) => { s.kit = "loud"; }, "kit"],
    [(s) => { delete s.kit; }, "kit"],
    [(s) => { s.name = "x".repeat(41); }, "name"],
    [(s) => { s.name = 5; }, "name"],
    [(s) => { s.updated = -1; }, "updated"],
    [(s) => { s.updated = Infinity; }, "updated"],
    [(s) => { s.updated = "1"; }, "updated"],
    [(s) => { delete s.updated; }, "updated"],
  ];
  for (const [mut, code] of cases) assert.equal(broken(mut).error, code, code);
  assert.equal(broken((s) => { s.name = "x".repeat(40); }).error, undefined);
  assert.equal(broken((s) => { s.updated = 0; }).error, undefined);
  // 40 code points may be 80 UTF-16 units (astral); 41 is refused by the cheap length check before Array.from
  assert.equal(broken((s) => { s.name = "\u{1D11E}".repeat(40); }).error, undefined);
  assert.equal(broken((s) => { s.name = "\u{1D11E}".repeat(41); }).error, "name");
});

test("validate: an absurdly deep unknown field is refused, not thrown", () => {
  const song = fresh();
  let node = song;
  for (let i = 0; i < 20000; i++) { node.deep = {}; node = node.deep; }
  assert.equal(S.validate(song).error, "type");
});

test("validate: tracks", () => {
  const cases = [
    (s) => { s.tracks = "nope"; },
    (s) => { s.tracks = []; },
    (s) => { s.tracks = Array.from({ length: 9 }, (_, i) => ({ id: "t" + i, kind: "drum" })); },
    (s) => { s.tracks[0].id = ""; },
    (s) => { s.tracks[0].id = "x".repeat(17); },
    (s) => { s.tracks[0].id = 7; },
    (s) => { s.tracks[0].id = "__proto__"; },
    (s) => { s.tracks[0].id = "Drums"; },
    (s) => { s.tracks[0].id = "1drums"; },
    (s) => { s.tracks[0].id = "drums_2"; },
    (s) => { s.tracks[1].kind = "pad"; },
    (s) => { delete s.tracks[1].kind; },
    (s) => { s.tracks[1].id = s.tracks[0].id; },
    (s) => { s.tracks[0] = null; },
    (s) => { s.tracks[0] = []; },
    (s) => { s.tracks[0].vol = -0.1; },
    (s) => { s.tracks[0].vol = 1.1; },
    (s) => { s.tracks[0].vol = "0.5"; },
    (s) => { s.tracks[0].vol = null; },
    (s) => { s.tracks[0].mute = "yes"; },
    (s) => { s.tracks[0].mute = 1; },
    (s) => { s.tracks[0].mute = null; },
  ];
  for (const mut of cases) assert.equal(broken(mut).error, "tracks");

  // 12.14: a 1b-1 tape without the mixer fields reads at full volume and unmuted, without editing the input
  const old = fresh();
  old.tracks.forEach((tr) => { delete tr.vol; delete tr.mute; });
  const read = S.validate(old);
  assert.equal(read.error, undefined);
  assert.deepEqual(plain(read.song.tracks.map((tr) => [tr.vol, tr.mute])), [[1, false], [1, false], [1, false], [1, false], [1, false]]);
  assert.equal("vol" in old.tracks[0], false, "validate does not write the defaults into the document it was given");
  assert.equal("mute" in old.tracks[0], false);

  // "constructor" is a legal slug and a harmless map key because the lookup adds "$"
  const ctor = fresh();
  ctor.tracks[0].id = "constructor";
  ctor.patterns[0].notes.constructor = ctor.patterns[0].notes.drums;
  delete ctor.patterns[0].notes.drums;
  assert.equal(S.validate(ctor).error, undefined);
});

test("validate: patterns", () => {
  const cases = [
    (s) => { s.patterns = "nope"; },
    (s) => { s.patterns = []; },
    (s) => { s.patterns = Array.from({ length: 17 }, () => ({ len: 16, notes: {} })); },
    (s) => { s.patterns[0].len = 0; },
    (s) => { s.patterns[0].len = 65; },
    (s) => { s.patterns[0].len = 1.5; },
    (s) => { delete s.patterns[0].len; },
    (s) => { delete s.patterns[0].notes; },
    (s) => { s.patterns[0].notes = []; },
    (s) => { s.patterns[0].notes = null; },
    (s) => { s.patterns[0] = null; },
  ];
  for (const mut of cases) assert.equal(broken(mut).error, "patterns");
});

test("validate: sixteen patterns are a song, seventeen are not", () => {
  const song = fresh();
  song.patterns = Array.from({ length: S.PATTERNS_MAX }, () => S.emptyPattern());
  song.song = song.patterns.map((_, i) => i);
  assert.equal(S.PATTERNS_MAX, 16);
  assert.equal(S.validate(song).error, undefined, "A-P is the format's limit");
  song.patterns.push(S.emptyPattern());
  assert.equal(song.patterns.length, 17);
  assert.equal(S.validate(song).error, "patterns", "a seventeenth pattern is refused");
});

test("validate: notes", () => {
  const cases = [
    (s) => { s.patterns[0].notes.lead = []; }, // a key with no track
    (s) => { s.patterns[0].notes.voice = [{ t: 0, len: 24, deg: 0, vel: 1 }]; }, // the voice holds clips
    (s) => { s.patterns[0].notes.bass = {}; },
    (s) => { s.patterns[0].notes.bass = [null]; },
    (s) => { s.patterns[0].notes.drums[0].t = -1; },
    (s) => { s.patterns[0].notes.drums[0].t = 16 * S.STEP; },
    (s) => { s.patterns[0].notes.drums[0].t = 0.5; },
    (s) => { s.patterns[0].notes.drums[0].len = 0; },
    (s) => { s.patterns[0].notes.drums[0].len = 16 * S.STEP + 1; },
    (s) => { s.patterns[0].notes.drums[0].vel = 1.1; },
    (s) => { s.patterns[0].notes.drums[0].vel = -0.1; },
    (s) => { s.patterns[0].notes.drums[0].vel = "1"; },
    (s) => { s.patterns[0].notes.drums[0].key = "clap"; },
    (s) => { s.patterns[0].notes.bass = [{ t: 0, len: 24, deg: 33, vel: 1 }]; },
    (s) => { s.patterns[0].notes.bass = [{ t: 0, len: 24, deg: -33, vel: 1 }]; },
    (s) => { s.patterns[0].notes.bass = [{ t: 0, len: 24, deg: 1.5, vel: 1 }]; },
    (s) => { s.patterns[0].notes.chords = [{ t: 0, len: 24, vel: 1 }]; },
  ];
  for (const mut of cases) assert.equal(broken(mut).error, "notes");

  // the edges are allowed: a one-tick note at the end, a degree on both ends of the range, a longer pattern
  assert.equal(broken((s) => {
    s.patterns[0].len = 64;
    s.patterns[0].notes.bass = [
      { t: 0, len: 64 * S.STEP, deg: -32, vel: 0 },
      { t: 64 * S.STEP - 1, len: 1, deg: 32, vel: 1 },
    ];
  }).error, undefined);
  assert.equal(broken((s) => { s.patterns[0].notes.bass = [{ t: 0, len: 24, deg: 32, vel: 1 }]; }).error, undefined);

  // at most 1024 notes in one track of one pattern
  const many = (n) => Array.from({ length: n }, () => ({ t: 0, len: 1, deg: 0, vel: 1 }));
  assert.equal(broken((s) => { s.patterns[0].notes.bass = many(1024); }).error, undefined);
  assert.equal(broken((s) => { s.patterns[0].notes.bass = many(1025); }).error, "notes");
});

test("validate: song, clips", () => {
  assert.equal(broken((s) => { s.song = "0"; }).error, "song");
  assert.equal(broken((s) => { s.song = []; }).error, "song");
  assert.equal(broken((s) => { s.song = Array(97).fill(0); }).error, "song");
  assert.equal(broken((s) => { s.song = [1]; }).error, "song");
  assert.equal(broken((s) => { s.song = [-1]; }).error, "song");
  assert.equal(broken((s) => { s.song = [0.5]; }).error, "song");
  assert.equal(broken((s) => { s.song = ["0"]; }).error, "song");
  assert.equal(broken((s) => { s.clips = {}; }).error, "clips");
  assert.equal(broken((s) => { delete s.clips; }).error, "clips");

  // the 64-slot example and the 96-slot cap; a slot may name the last pattern
  assert.equal(broken((s) => {
    s.patterns.push({ len: 16, notes: {} });
    s.song = Array(64).fill(1);
  }).error, undefined);
  assert.equal(broken((s) => {
    s.patterns.push({ len: 16, notes: {} });
    s.song = Array(96).fill(1);
  }).error, undefined);
});

test("toggle: adds, has() agrees, removes again, leaves the input alone, keeps the order", () => {
  const song = fresh();
  const before = plain(song);
  assert.equal(S.has(song, 0, "drums", "perc", 4), false);

  const on = S.toggle(song, 0, "drums", "perc", 4);
  assert.equal(S.has(on, 0, "drums", "perc", 4), true);
  assert.equal(S.has(song, 0, "drums", "perc", 4), false, "toggle does not mutate its song");
  assert.deepEqual(plain(song), before);

  const hits = plain(on.patterns[0].notes.drums);
  assert.deepEqual(hits.filter((n) => n.key === "perc" && n.t === 4 * S.STEP), [{ t: 96, len: 24, key: "perc", vel: 1 }]);
  assert.equal(hits.length, 14);
  for (let i = 1; i < hits.length; i++) {
    assert.ok(hits[i - 1].t < hits[i].t || (hits[i - 1].t === hits[i].t && S.DRUMS.indexOf(hits[i - 1].key) < S.DRUMS.indexOf(hits[i].key)));
  }

  const off = S.toggle(on, 0, "drums", "perc", 4);
  assert.equal(S.has(off, 0, "drums", "perc", 4), false);
  assert.deepEqual(plain(off), before);

  // an existing hit is removed by the same call, at its exact tick
  const gone = S.toggle(song, 0, "drums", "kick", 0);
  assert.equal(S.has(gone, 0, "drums", "kick", 0), false);
  assert.equal(plain(gone.patterns[0].notes.drums).length, 12);
  assert.equal(S.has(gone, 0, "drums", "kick", 1), false, "a hit one step later is a different step");

  // a velocity is kept; no velocity means 1
  const soft = S.toggle(song, 0, "drums", "perc", 14, 0.3);
  const added = plain(soft.patterns[0].notes.drums).find((n) => n.key === "perc" && n.t === 14 * S.STEP);
  assert.deepEqual(added, { t: 14 * S.STEP, len: S.STEP, key: "perc", vel: 0.3 });
});

test("toggle: a missing notes array for the track is created", () => {
  const song = fresh();
  delete song.patterns[0].notes.drums;
  const out = S.toggle(song, 0, "drums", "kick", 2);
  assert.deepEqual(plain(out.patterns[0].notes.drums), [{ t: 2 * S.STEP, len: S.STEP, key: "kick", vel: 1 }]);
  assert.equal(song.patterns[0].notes.drums, undefined);
});

test("events: absolute ticks, sorted; a range across the pattern end wraps into the next loop", () => {
  const song = drumsOnly();
  const all = plain(S.events(song, 0, 0, 3 * P));
  assert.equal(all.length, 39, "13 hits per loop, three loops");
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].tick <= all[i].tick);
  for (const e of all) {
    assert.ok(e.tick >= 0 && e.tick < 3 * P);
    assert.equal(e.track, "drums");
    assert.equal(e.len, S.STEP);
  }

  // loop 0 ends at 384; the perc on step 16 is swung by 2.4, the next loop starts with kick and hat
  const wrap = plain(S.events(song, 0, P - S.STEP, P + 16));
  assert.deepEqual(wrap.map((e) => e.key), ["perc", "kick", "hat"]);
  assert.deepEqual(wrap.map((e) => e.track), ["drums", "drums", "drums"]);
  assert.equal(wrap[0].tick, P - S.STEP + S.swingTicks(0.55));
  assert.equal(wrap[1].tick, P);
  assert.equal(wrap[2].tick, P);

  // loop 1 is loop 0 shifted by exactly one pattern
  const one = plain(S.events(song, 0, 0, P));
  const two = plain(S.events(song, 0, P, 2 * P));
  assert.equal(two.length, one.length);
  two.forEach((e, i) => close(e.tick - P, one[i].tick, "loop " + i));
});

test("events: many loops later, starting mid-loop; empty ranges", () => {
  const song = fresh();
  const n = 5;
  const mid = plain(S.events(song, 0, n * P + 96, n * P + 96 + 1));
  assert.deepEqual(mid.map((e) => ({ tick: e.tick, key: e.key })), [
    { tick: n * P + 96, key: "snare" },
    { tick: n * P + 96, key: "hat" },
  ], "snare before hat by the drum row");

  const one = plain(S.events(song, 0, 0, P));
  const far = plain(S.events(song, 0, n * P, n * P + P));
  assert.equal(far.length, one.length);
  far.forEach((e, i) => close(e.tick - n * P, one[i].tick, "far loop " + i));

  assert.deepEqual(plain(S.events(song, 0, 10, 10)), []);
  assert.deepEqual(plain(S.events(song, 0, 20, 10)), []);
  assert.deepEqual(plain(S.events(song, 0, 0, 0)), []);
});

test("events: consecutive ranges equal one big range, with an off-grid swung note and with the demo", () => {
  const song = fresh();
  song.swing = 0.75;
  // t = P-1 sits on step index 15 (odd) and the 12-tick swing carries it into the next loop
  song.patterns[0].notes.drums.push({ t: P - 1, len: 1, key: "perc", vel: 0.6 });
  const all = plain(S.events(song, 0, 0, 3 * P));
  assert.ok(all.some((e) => e.tick === P + 11), "the off-grid note from loop 0 is heard in loop 1");

  const slices = [];
  for (let a = 0; a < 3 * P; a += 10) slices.push(...plain(S.events(song, 0, a, Math.min(a + 10, 3 * P))));
  assert.deepEqual(slices, all, "each event exactly once, same order");

  // 7 does not divide the 384-tick pattern, so these slices cut through every swung tick
  const demo = fresh();
  const big = plain(S.events(demo, 0, 0, 3 * P));
  const cut = [];
  for (let a = 0; a < 3 * P; a += 7) cut.push(...plain(S.events(demo, 0, a, Math.min(a + 7, 3 * P))));
  assert.deepEqual(cut, big, "the grid demo in 7-tick slices is the same list");
});

test("events: swing pushes only the odd 16ths, by swingTicks", () => {
  const song = drumsOnly();
  close(S.swingTicks(0.55), 2.4, "default swing");
  assert.equal(S.swingTicks(0.5), 0);
  close(S.swingTicks(0.75), 12, "max swing");

  const early = plain(S.events(song, 0, 0, 60));
  // step 0 (even): no offset
  assert.deepEqual(early.filter((e) => e.tick === 0).map((e) => e.key), ["kick", "hat"]);
  // step 7 (odd, t = 168, the kick on step 8): late by 2.4 ticks
  const swung = plain(S.events(song, 0, 160, 180)).filter((e) => e.key === "kick");
  assert.equal(swung.length, 1);
  assert.equal(swung[0].tick, 168 + S.swingTicks(0.55));
  close(swung[0].tick, 170.4, "0.55 adds 2.4 ticks");

  // straight time: the same kick sits exactly on the step
  const straight = fresh();
  straight.swing = 0.5;
  const kick168 = plain(S.events(straight, 0, 160, 180)).filter((e) => e.key === "kick");
  assert.equal(kick168.length, 1);
  assert.equal(kick168[0].tick, 168);
});

test("events: an odd-step note is in the range only once its swung tick is", () => {
  const song = fresh();
  const at = 360 + S.swingTicks(0.55); // the swung perc on step 16, 362.4
  const hasAt = (a, b) => plain(S.events(song, 0, a, b)).some((e) => e.tick === at);

  assert.equal(hasAt(0, 362), false, "toTick is exclusive");
  assert.equal(hasAt(0, 363), true);
  assert.equal(hasAt(363, 370), false, "the range starts after the swung tick");
  assert.equal(hasAt(at, at + 1), true, "fromTick is inclusive");
  assert.equal(hasAt(at - 0.1, at), false);
});

test("events: track order, deg instead of key, voice and muted tracks yield nothing", () => {
  const song = fresh();
  song.patterns[0].notes.bass = [{ t: 0, len: 24, deg: 0, vel: 1 }];
  song.patterns[0].notes.chords = [
    { t: 0, len: 24, deg: 2, vel: 0.8 },
    { t: 0, len: 24, deg: 0, vel: 0.8 },
  ];
  song.patterns[0].notes.voice = [{ t: 0, len: 24, deg: 0, vel: 1 }];

  const e = plain(S.events(song, 0, 0, 1));
  assert.deepEqual(e.map((x) => x.track), ["drums", "drums", "bass", "chords", "chords"]);
  assert.deepEqual(e.slice(0, 2).map((x) => x.key), ["kick", "hat"]);
  assert.equal("deg" in e[0], false);
  assert.equal(e[0].len, 24);
  assert.equal(e[0].vel, 1);
  assert.equal("key" in e[2], false);
  assert.equal(e[2].deg, 0);
  assert.deepEqual(e.slice(3).map((x) => x.deg), [0, 2], "chord degrees rise");

  song.tracks[0].mute = true;
  assert.deepEqual(plain(S.events(song, 0, 0, 1)).map((x) => x.track), ["bass", "chords", "chords"]);
});

test("degreeToMidi: scale degrees wrap into lower and higher octaves", () => {
  const A = (deg, oct = 4) => S.degreeToMidi(9, "minor-penta", deg, oct);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((d) => A(d)), [69, 72, 74, 76, 79, 81]);
  assert.equal(A(-1), 67, "the G below A4");
  assert.equal(A(-5), 57, "A3");
  assert.equal(S.degreeToMidi(0, "major", 0, 4), 60);
  assert.equal(S.degreeToMidi(0, "major", 7, 4), 72, "the octave above C4");
  assert.equal(S.degreeToMidi(0, "major", -1, 4), 59, "B3");
  assert.equal(S.degreeToMidi(9, "minor", 2, 4), 72);
  assert.equal(S.degreeToMidi(9, "dorian", 0, 3), 57);
});

test("ticksToSec and clampBpm", () => {
  assert.equal(S.ticksToSec(96, 60), 1);
  assert.equal(S.ticksToSec(384, 82), (384 * 60) / (82 * S.TPB));
  assert.equal(S.ticksToSec(0, 140), 0);
  assert.equal(S.clampBpm(200), 140);
  assert.equal(S.clampBpm(59.6), 60);
  assert.equal(S.clampBpm(82.4), 82);
  assert.equal(S.clampBpm(82.6), 83);
  assert.equal(S.clampBpm(140), 140);
  assert.equal(S.clampBpm(60), 60);
});

test("constants: parent scales, voices, note velocity, chord cells, note names, demo pairs", () => {
  assert.deepEqual(plain(S.PARENT), {
    "minor-penta": "minor",
    "major-penta": "major",
    minor: "minor",
    major: "major",
    dorian: "dorian",
  });
  assert.deepEqual(plain(S.SOUND), { bass: "bass", chords: "keys", melody: "flute" });
  assert.equal(S.NOTE_VEL, 0.8);
  assert.equal(S.REST_VEL, 0);
  assert.deepEqual(plain(S.CHORD_STEPS), [0, 8]);
  assert.deepEqual(plain(S.NAMES), ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]);
  assert.deepEqual(plain(S.DEMO_BASS), [[1, 0], [9, 2], [11, 3]]);
  assert.deepEqual(plain(S.DEMO_CHORDS), [[1, 0], [9, 3]]);
});

test("tonic: the bass window E2-D#3, the melody one octave up, other tracks null", () => {
  // A minor (key 9) puts the bass tonic on A2 45, E on 40, D# on 51; 12.12 puts the melody on A3 57
  assert.equal(S.tonic("bass", 9), 45);
  assert.equal(S.tonic("bass", 4), 40);
  assert.equal(S.tonic("bass", 3), 51);
  assert.equal(S.tonic("melody", 9), 57);
  assert.equal(S.tonic("melody", 4), 52);
  assert.equal(S.tonic("melody", 3), 63);
  for (const track of ["drums", "chords", "voice", "lead", undefined]) assert.equal(S.tonic(track, 9), null);
  assert.equal(S.tonic("bass", "9"), null);
  assert.equal(S.tonic("bass", 1.5), null);
});

test("noteMidi: scale degrees from the tonic, wrapping both ways; non-note tracks null", () => {
  const A = { key: 9, scale: "minor-penta" };
  assert.equal(S.noteMidi(A, "bass", 0), 45);
  assert.equal(S.noteMidi(A, "bass", 1), 48);
  assert.equal(S.noteMidi(A, "bass", 4), 55);
  assert.equal(S.noteMidi(A, "bass", 5), 57, "one octave above the tonic");
  assert.equal(S.noteMidi(A, "bass", -1), 43, "the G below A2");
  assert.equal(S.noteMidi(A, "melody", 0), 57);
  assert.equal(S.noteMidi(A, "melody", -5), 45);
  assert.equal(S.noteMidi({ key: 9, scale: "minor" }, "bass", 6), 55);
  assert.equal(S.noteMidi(A, "chords", 0), null);
  assert.equal(S.noteMidi(A, "drums", 0), null);
  assert.equal(S.noteMidi(A, "bass", 1.5), null);
  assert.equal(S.noteMidi({ key: 9, scale: "blues" }, "bass", 0), null);
  assert.equal(S.noteMidi({ key: 9, scale: "constructor" }, "bass", 0), null);
  assert.equal(S.noteMidi(null, "bass", 0), null);
});

test("noteName: pitch classes without an octave, negative midi included", () => {
  assert.equal(S.noteName(57), "A");
  assert.equal(S.noteName(60), "C");
  assert.equal(S.noteName(61), "C#");
  assert.equal(S.noteName(63), "Eb");
  assert.equal(S.noteName(70), "Bb");
  assert.equal(S.noteName(71), "B");
  assert.equal(S.noteName(72), "C");
  assert.equal(S.noteName(-1), "B");
  assert.equal(S.noteName(1.5), null);
});

test("chords: A minor-penta built on natural minor, names and voicings", () => {
  const A = { key: 9, scale: "minor-penta" };
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((d) => plain(S.chordName(A, d))), [
    { roman: "i", name: "Am9" },
    { roman: "iiø", name: "Bm7b5" },
    { roman: "III", name: "Cmaj9" },
    { roman: "iv", name: "Dm9" },
    { roman: "v", name: "Em7" },
    { roman: "VI", name: "Fmaj9" },
  ]);
  assert.deepEqual(plain(S.chordNotes(A, 0)), [57, 60, 67, 71], "Am9 drops the fifth");
  assert.deepEqual(plain(S.chordNotes(A, 1)), [59, 62, 65, 69], "Bm7b5 keeps the fifth");
  assert.deepEqual(plain(S.chordNotes(A, 2)), [48, 52, 59, 62], "Cmaj9");
  assert.deepEqual(plain(S.chordNotes(A, 3)), [50, 53, 60, 64], "Dm9");
  assert.deepEqual(plain(S.chordNotes(A, 4)), [52, 55, 59, 62], "Em7");
  assert.deepEqual(plain(S.chordNotes(A, 5)), [53, 57, 64, 67], "Fmaj9");
});

test("chords: C major built on the major scale", () => {
  const C = { key: 0, scale: "major" };
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((d) => plain(S.chordName(C, d))), [
    { roman: "I", name: "Cmaj9" },
    { roman: "ii", name: "Dm9" },
    { roman: "iii", name: "Em7" },
    { roman: "IV", name: "Fmaj9" },
    { roman: "V", name: "G9" },
    { roman: "vi", name: "Am9" },
  ]);
  assert.deepEqual(plain(S.chordNotes(C, 0)), [48, 52, 59, 62]);
  assert.deepEqual(plain(S.chordNotes(C, 4)), [55, 59, 65, 69], "G9 drops the fifth");
  assert.deepEqual(plain(S.chordNotes(C, 5)), [57, 60, 67, 71]);
});

test("chords: penta scales borrow their parent, degree 7 wraps to 0, bad input is null", () => {
  const penta = { key: 9, scale: "minor-penta" };
  const minor = { key: 9, scale: "minor" };
  for (let d = 0; d < 6; d++) {
    assert.deepEqual(S.chordNotes(penta, d), S.chordNotes(minor, d));
    assert.deepEqual(S.chordName(penta, d), S.chordName(minor, d));
  }
  const majPenta = { key: 0, scale: "major-penta" };
  const major = { key: 0, scale: "major" };
  assert.deepEqual(S.chordName(majPenta, 4), S.chordName(major, 4));

  assert.deepEqual(S.chordNotes(penta, 7), S.chordNotes(penta, 0), "7 steps up is the same chord");
  assert.deepEqual(S.chordName(penta, 7), S.chordName(penta, 0));
  assert.equal(S.chordNotes(penta, -1).length, 4, "a root below the tonic still voices a chord");

  assert.equal(S.chordNotes(penta, 1.5), null);
  assert.equal(S.chordNotes({ key: 9, scale: "blues" }, 0), null);
  assert.equal(S.chordNotes({ key: 9, scale: "constructor" }, 0), null);
  assert.equal(S.chordName(penta, "0"), null);
  assert.equal(S.chordName(null, 0), null);
});

test("patterns: emptyPattern is fresh, ensurePattern fills up to the index and leaves the input alone", () => {
  const a = S.emptyPattern(), b = S.emptyPattern();
  assert.deepEqual(plain(a), { len: 16, notes: { drums: [], bass: [], chords: [], melody: [] } });
  assert.notEqual(a, b);
  assert.notEqual(a.notes, b.notes);
  a.notes.bass.push({ t: 0, len: 24, deg: 0, vel: 1 });
  assert.deepEqual(plain(b.notes.bass), []);

  const song = fresh();
  const snapshot = plain(song);
  const same = S.ensurePattern(song, 0);
  assert.deepEqual(plain(same), snapshot);
  assert.notEqual(same.patterns[0], song.patterns[0]);

  const three = S.ensurePattern(song, 2);
  assert.equal(three.patterns.length, 3);
  assert.deepEqual(plain(three.patterns[1]), plain(S.emptyPattern()));
  assert.deepEqual(plain(three.patterns[2]), plain(S.emptyPattern()));
  assert.deepEqual(plain(song), snapshot, "the input is untouched");
  assert.equal(S.validate(three).error, undefined);

  for (const bad of [-1, 16, 2.5, "2", undefined]) {
    assert.deepEqual(plain(S.ensurePattern(song, bad)), snapshot, String(bad));
  }
});

test("hasNotes and patternEmpty: missing patterns and tracks read as empty", () => {
  const song = fresh();
  assert.equal(S.hasNotes(song, 0, "drums"), true);
  assert.equal(S.hasNotes(song, 0, "bass"), true);
  assert.equal(S.hasNotes(song, 0, "melody"), false);
  assert.equal(S.hasNotes(song, 0, "lead"), false);
  assert.equal(S.hasNotes(song, 1, "drums"), false);

  assert.equal(S.patternEmpty(song, 0), false);
  assert.equal(S.patternEmpty(song, 1), true);
  assert.equal(S.patternEmpty(song, 99), true);

  const empty = drumsOnly();
  for (const track of ["bass", "chords", "melody"]) empty.patterns[0].notes[track] = [];
  empty.patterns[0].notes.drums = [];
  assert.equal(S.patternEmpty(empty, 0), true);
});

test("copyPattern: copies len and a deep clone of the notes, or leaves the song unchanged", () => {
  const song = fresh();
  song.patterns[0].len = 8;
  song.patterns[0].notes.bass = [{ t: 0, len: 8 * S.STEP, deg: 1, vel: 0.5 }];
  const snapshot = plain(song);
  const out = S.copyPattern(song, 0, 2);
  assert.equal(out.patterns.length, 3);
  assert.equal(out.patterns[2].len, 8, "the source's len, not the default 16");
  assert.deepEqual(plain(out.patterns[2]), plain(song.patterns[0]));
  assert.notEqual(out.patterns[2].notes, out.patterns[0].notes);
  assert.notEqual(out.patterns[2].notes.bass, out.patterns[0].notes.bass);
  assert.deepEqual(plain(song), snapshot, "the input is untouched");

  // from === to, a missing from, or an index outside A-P: unchanged
  assert.deepEqual(plain(S.copyPattern(song, 0, 0)), snapshot);
  assert.deepEqual(plain(S.copyPattern(song, 4, 2)), snapshot);
  assert.deepEqual(plain(S.copyPattern(song, -1, 2)), snapshot);
  assert.deepEqual(plain(S.copyPattern(song, 0, 16)), snapshot);
  assert.deepEqual(plain(song), snapshot);
});

test("setNote: adds a note, defaults the velocity, and re-ties the whole track", () => {
  const song = fresh();
  const before = plain(song);
  const out = S.setNote(song, 0, "bass", 4 * S.STEP, 4);
  assert.deepEqual(plain(song), before, "the input song is not edited");
  assert.deepEqual(plain(out.patterns[0].notes.bass).map((n) => [n.t, n.deg, n.vel, n.len]), [
    [0, 0, S.NOTE_VEL, 96],
    [4 * S.STEP, 4, S.NOTE_VEL, 96],
    [192, 2, S.NOTE_VEL, 48],
    [240, 3, S.NOTE_VEL, 144],
  ]);
  assert.equal(S.validate(out).error, undefined);

  // the same tick changes the degree and keeps the note's velocity; the next note still ends it
  const changed = S.setNote(song, 0, "bass", 192, 5, 0.2);
  const at = plain(changed.patterns[0].notes.bass).find((n) => n.t === 192);
  assert.deepEqual(at, { t: 192, len: 48, deg: 5, vel: S.NOTE_VEL });

  // a note at the very end lasts one tick, and one alone lasts the rest of the pattern
  const end = S.setNote(song, 0, "melody", P - 1, 2, 0.3);
  assert.deepEqual(plain(end.patterns[0].notes.melody), [{ t: P - 1, len: 1, deg: 2, vel: 0.3 }]);
  const only = S.setNote(song, 0, "melody", 0, 0);
  assert.deepEqual(plain(only.patterns[0].notes.melody), [{ t: 0, len: P, deg: 0, vel: S.NOTE_VEL }]);

  // a shorter pattern ends the last note at its own end
  const short = drumsOnly();
  short.patterns[0].len = 8;
  const shortOut = S.setNote(short, 0, "bass", 0, 0);
  assert.deepEqual(plain(shortOut.patterns[0].notes.bass), [{ t: 0, len: 8 * S.STEP, deg: 0, vel: S.NOTE_VEL }]);
});

test("setNote: ensures the pattern, but drums, unknown tracks and bad input leave a copy unchanged", () => {
  const song = fresh();
  const before = plain(song);

  const two = S.setNote(song, 2, "melody", 0, 0);
  assert.equal(two.patterns.length, 3);
  assert.deepEqual(plain(two.patterns[2].notes.melody), [{ t: 0, len: P, deg: 0, vel: S.NOTE_VEL }]);
  assert.equal(S.validate(two).error, undefined);

  for (const [p, track, t, deg, vel] of [
    [0, "drums", 0, 0, undefined],
    [0, "voice", 0, 0, undefined],
    [0, "lead", 0, 0, undefined],
    [0, "bass", -1, 0, undefined],
    [0, "bass", P, 0, undefined],
    [0, "bass", 0.5, 0, undefined],
    [0, "bass", 0, 1.5, undefined],
    [0, "bass", 0, 33, undefined],
    [0, "bass", 0, 0, 2],
    [0, "bass", 0, 0, "0.8"],
    [16, "bass", 0, 0, undefined],
    [-1, "bass", 0, 0, undefined],
  ]) {
    assert.deepEqual(plain(S.setNote(song, p, track, t, deg, vel)), before, `${p} ${track} ${t} ${deg} ${vel}`);
  }
});

test("setNote: an existing pattern with a broken len is refused instead of tying NaN lengths", () => {
  // 0, a fraction, a string and a missing len are all invalid on a pattern that already exists
  for (const len of [0, -1, 1.5, "16", null, undefined]) {
    const song = fresh();
    if (len === undefined) delete song.patterns[0].len;
    else song.patterns[0].len = len;
    const snapshot = plain(song);
    const out = S.setNote(song, 0, "bass", 0, 1);
    assert.deepEqual(plain(out), snapshot, String(len));
    assert.deepEqual(plain(song), snapshot, "the input is untouched");
  }
  // a missing pattern is not a broken one: it is created with the default length
  const song = fresh();
  const out = S.setNote(song, 1, "bass", 0, 1);
  assert.equal(out.patterns.length, 2);
  assert.deepEqual(plain(out.patterns[1].notes.bass), [{ t: 0, len: P, deg: 1, vel: S.NOTE_VEL }]);
  assert.equal(S.validate(out).error, undefined);
});

test("removeNote: removes and re-ties; noteAt finds by exact tick", () => {
  const song = fresh();
  const before = plain(song);
  assert.equal(S.noteAt(song, 0, "bass", 192).deg, 2);
  assert.equal(S.noteAt(song, 0, "bass", 192 - 1), null);
  assert.equal(S.noteAt(song, 0, "melody", 0), null);
  assert.equal(S.noteAt(song, 1, "bass", 0), null);

  // noteAt hands back a copy: editing it never edits the song
  const found = S.noteAt(song, 0, "bass", 192);
  assert.deepEqual(plain(found), { t: 192, len: 48, deg: 2, vel: S.NOTE_VEL });
  found.deg = 9;
  found.extra = true;
  assert.equal(S.noteAt(song, 0, "bass", 192).deg, 2);
  assert.equal(S.noteAt(song, 0, "bass", 192).extra, undefined);
  assert.deepEqual(plain(song), before);

  const out = S.removeNote(song, 0, "bass", 192);
  assert.deepEqual(plain(song), before);
  assert.deepEqual(plain(out.patterns[0].notes.bass), [
    { t: 0, len: 240, deg: 0, vel: S.NOTE_VEL },
    { t: 240, len: 144, deg: 3, vel: S.NOTE_VEL },
  ]);
  assert.equal(S.validate(out).error, undefined);

  // nothing at that tick is still a re-tied copy; drums and unknown tracks are untouched
  const missing = S.removeNote(song, 0, "bass", S.STEP);
  assert.deepEqual(plain(missing.patterns[0].notes.bass), plain(song.patterns[0].notes.bass));
  assert.deepEqual(plain(S.removeNote(song, 0, "drums", 0)), before);
  assert.deepEqual(plain(S.removeNote(song, 0, "lead", 0)), before);
  assert.deepEqual(plain(S.removeNote(song, 1, "bass", 0)), before);
});

test("setRest and isRest: a vel-0 note is a rest, it ends the note before it, and setNote revives it", () => {
  const song = fresh();
  const before = plain(song);
  assert.equal(S.isRest({ t: 0, len: 24, deg: 0, vel: 0 }), true);
  assert.equal(S.isRest({ t: 0, len: 24, deg: 0, vel: S.NOTE_VEL }), false);
  assert.equal(S.isRest(null), false);

  // the rest replaces the bass note on step 9; the first note now ends there, and the rest ties to step 11
  const out = S.setRest(song, 0, "bass", 8 * S.STEP);
  assert.deepEqual(plain(song), before, "the input is untouched");
  assert.deepEqual(plain(out.patterns[0].notes.bass), [
    { t: 0, len: 192, deg: 0, vel: S.NOTE_VEL },
    { t: 192, len: 48, deg: 0, vel: 0 },
    { t: 240, len: 144, deg: 3, vel: S.NOTE_VEL },
  ]);
  assert.equal(S.validate(out).error, undefined);
  assert.equal(S.isRest(S.noteAt(out, 0, "bass", 192)), true);

  // a rest on an empty tick is added and tied like a note; it has no pitch
  const added = S.setRest(song, 0, "melody", S.STEP);
  assert.deepEqual(plain(added.patterns[0].notes.melody), [{ t: S.STEP, len: P - S.STEP, deg: 0, vel: 0 }]);
  assert.equal(S.noteAt(added, 0, "melody", S.STEP).deg, 0);

  // setNote over a rest writes the pitch at NOTE_VEL, even if a velocity is passed: the key sets a pitch
  const revived = S.setNote(out, 0, "bass", 8 * S.STEP, 4, 0.2);
  assert.deepEqual(plain(revived.patterns[0].notes.bass), [
    { t: 0, len: 192, deg: 0, vel: S.NOTE_VEL },
    { t: 192, len: 48, deg: 4, vel: S.NOTE_VEL },
    { t: 240, len: 144, deg: 3, vel: S.NOTE_VEL },
  ]);
  // a real note still keeps its own velocity
  const own = fresh();
  own.patterns[0].notes.bass[2].vel = 0.5;
  assert.equal(S.noteAt(S.setNote(own, 0, "bass", 240, 5, 0.2), 0, "bass", 240).vel, 0.5);

  // chord tracks are editable too; a fresh pattern is created with the rest at the default length
  assert.equal(S.isRest(S.noteAt(S.setRest(song, 0, "chords", 0), 0, "chords", 0)), true);
  const fresh2 = S.setRest(song, 2, "melody", 0);
  assert.equal(fresh2.patterns.length, 3);
  assert.deepEqual(plain(fresh2.patterns[2].notes.melody), [{ t: 0, len: P, deg: 0, vel: 0 }]);
  assert.equal(S.validate(fresh2).error, undefined);

  // drums, unknown tracks, bad ticks, patterns and a broken len leave an unchanged copy
  for (const [p, track, t] of [
    [0, "drums", 0],
    [0, "voice", 0],
    [0, "lead", 0],
    [0, "bass", -1],
    [0, "bass", P],
    [0, "bass", 0.5],
    [16, "bass", 0],
    [-1, "bass", 0],
  ]) {
    assert.deepEqual(plain(S.setRest(song, p, track, t)), before, `${p} ${track} ${t}`);
  }
  for (const len of [0, 1.5, "16", null]) {
    const bad = fresh();
    bad.patterns[0].len = len;
    const snapshot = plain(bad);
    assert.deepEqual(plain(S.setRest(bad, 0, "bass", 0)), snapshot, String(len));
  }
});

test("song chain: setSlot, addSlot and dropSlot copy, ensure the pattern, and keep the limits", () => {
  const song = fresh();
  const before = plain(song);

  const set = S.setSlot(song, 0, 2);
  assert.deepEqual(plain(set.song), [2]);
  assert.equal(set.patterns.length, 3);
  assert.equal(S.validate(set).error, undefined);
  assert.deepEqual(plain(song), before);

  const added = S.addSlot(song, 1);
  assert.deepEqual(plain(added.song), [0, 1]);
  assert.equal(added.patterns.length, 2);
  assert.equal(S.validate(added).error, undefined);

  assert.deepEqual(plain(S.dropSlot(added).song), [0]);
  assert.deepEqual(plain(S.dropSlot(song)), plain(song), "never below one slot");

  // the 96 slots cap
  const full = fresh();
  full.song = Array(S.SONG_MAX).fill(0);
  assert.deepEqual(plain(S.addSlot(full, 1)), plain(full));
  assert.equal(S.addSlot(full, 1).patterns.length, 1, "a refused add does not add a pattern either");

  // bad slots, patterns and songs: unchanged copies
  for (const [i, p] of [[1, 0], [-1, 0], [0, 16], [0, -1], [0, 1.5], ["0", 0], [0, "1"]]) {
    assert.deepEqual(plain(S.setSlot(song, i, p)), before, `${i} ${p}`);
  }
  for (const p of [-1, 16, 1.5, "1"]) assert.deepEqual(plain(S.addSlot(song, p)), before, String(p));
});

test("insertSlot and removeSlot: index 0, the end, the 96 cap, one slot left, bad input", () => {
  const song = fresh(); // [0]
  const before = plain(song);

  // insert at the front adds a pattern and moves the old slot right
  const front = S.insertSlot(song, 0, 2);
  assert.deepEqual(plain(front.song), [2, 0]);
  assert.equal(front.patterns.length, 3);
  assert.equal(S.validate(front).error, undefined);
  assert.deepEqual(plain(song), before, "the input is untouched");

  // i === length appends
  const end = S.insertSlot(song, 1, 1);
  assert.deepEqual(plain(end.song), [0, 1]);
  assert.equal(end.patterns.length, 2);
  assert.equal(S.validate(end).error, undefined);

  // 96 is the cap: a refused insert changes neither slots nor patterns
  const full = fresh();
  full.song = Array(S.SONG_MAX).fill(0);
  assert.deepEqual(plain(S.insertSlot(full, 0, 1)), plain(full));
  assert.deepEqual(plain(S.insertSlot(full, S.SONG_MAX, 1)), plain(full));
  assert.equal(S.insertSlot(full, S.SONG_MAX, 1).patterns.length, 1);

  // bad indexes, patterns and songs are unchanged copies
  for (const [i, p] of [[-1, 1], [2, 1], [1.5, 1], ["1", 1], [0, 16], [0, -1], [0, 1.5], [0, "1"]]) {
    assert.deepEqual(plain(S.insertSlot(song, i, p)), before, `${i} ${p}`);
  }
  const noSong = fresh();
  delete noSong.song;
  assert.deepEqual(plain(S.insertSlot(noSong, 0, 1)), plain(noSong));

  // remove from the middle, the front or the end
  const three = S.insertSlot(S.insertSlot(song, 1, 1), 2, 2); // [0, 1, 2]
  assert.deepEqual(plain(S.removeSlot(three, 1).song), [0, 2]);
  assert.deepEqual(plain(S.removeSlot(three, 0).song), [1, 2]);
  assert.deepEqual(plain(S.removeSlot(three, 2).song), [0, 1]);
  assert.equal(S.validate(S.removeSlot(three, 1)).error, undefined);
  assert.deepEqual(plain(three.song), [0, 1, 2], "removeSlot copies");

  // never below one slot, and a bad index or song is an unchanged copy
  assert.deepEqual(plain(S.removeSlot(song, 0)), before);
  for (const i of [-1, 1, 0.5, "0"]) assert.deepEqual(plain(S.removeSlot(song, i)), before, String(i));
  assert.deepEqual(plain(S.removeSlot(three, 3)), plain(three));
  const noSlots = fresh();
  noSlots.song = null;
  assert.deepEqual(plain(S.removeSlot(noSlots, 0)), plain(noSlots));
});

test("chainEvents: one slot is events() plus p and slot, over several ranges and loops", () => {
  const song = fresh();
  const strip = (list) => list.map(({ p, slot, ...e }) => e);
  for (const [a, b] of [[0, P], [0, 3 * P], [P + 5, P + 200], [7, 700], [P - S.STEP, P + 16], [5 * P, 6 * P + 100], [10, 10]]) {
    const out = plain(S.chainEvents(song, [0], a, b));
    assert.deepEqual(strip(out), plain(S.events(song, 0, a, b)), `${a}..${b}`);
    for (const e of out) {
      assert.equal(e.p, 0);
      assert.equal(e.slot, 0);
    }
  }

  // with swing 0.75 the off-grid last step crosses into the next loop; both sides still agree
  const swung = fresh();
  swung.swing = 0.75;
  swung.patterns[0].notes.drums.push({ t: P - 1, len: 1, key: "perc", vel: 0.6 });
  for (const [a, b] of [[0, 2 * P], [P, P + 20], [P + 11, P + 12], [P, P + 11]]) {
    const out = plain(S.chainEvents(swung, [0], a, b));
    assert.deepEqual(strip(out), plain(S.events(swung, 0, a, b)), `${a}..${b}`);
  }
});

test("chainEvents: a three-slot chain plays each pattern at its own offset", () => {
  const song = fresh();
  song.patterns.push(S.emptyPattern());
  song.patterns[1].notes.bass = [{ t: 0, len: P, deg: 4, vel: 0.8 }];
  song.patterns[1].notes.melody = [{ t: 0, len: P, deg: 5, vel: 0.8 }];

  const all = plain(S.chainEvents(song, [0, 1, 0], 0, 3 * P));
  assert.ok(all.length > 0);
  for (const e of all) {
    assert.equal(e.p, [0, 1, 0][e.slot]);
    assert.ok(e.tick >= 0 && e.tick < 3 * P);
    if (e.p === 1) assert.equal(e.slot, 1, "pattern B only plays in slot 1");
  }
  const find = (track, tick) => all.find((e) => e.track === track && e.tick === tick);

  // slot 0 is the demo; slot 1 adds its own bass and melody at the segment's start; slot 2 repeats the demo
  assert.deepEqual(find("bass", P), { tick: P, track: "bass", deg: 4, vel: 0.8, len: P, p: 1, slot: 1 });
  assert.deepEqual(find("melody", P), { tick: P, track: "melody", deg: 5, vel: 0.8, len: P, p: 1, slot: 1 });
  assert.equal(find("bass", 2 * P).p, 0);
  assert.equal(find("bass", 2 * P).slot, 2);
  assert.equal(find("chords", 0).slot, 0);
  assert.equal(find("chords", 2 * P).slot, 2);
  assert.equal(all.some((e) => e.track === "melody" && e.tick === 2 * P), false, "slot 2 plays pattern A, which has no melody");
  assert.deepEqual(find("bass", 2 * P + 192).deg, 2, "pattern A's step 9 comes back in slot 2");

  // the next pass is the same list shifted by the chain's length
  const next = plain(S.chainEvents(song, [0, 1, 0], 3 * P, 6 * P));
  assert.equal(next.length, all.length);
  next.forEach((e, i) => {
    close(e.tick - 3 * P, all[i].tick, "pass " + i);
    assert.equal(e.p, all[i].p);
    assert.equal(e.slot, all[i].slot);
  });
});

test("chainEvents: a swung last step spills into the next segment and across the chain's end", () => {
  const song = fresh();
  song.swing = 0.75;
  song.patterns.push(S.emptyPattern());
  song.patterns[1].notes.bass = [{ t: 0, len: P, deg: 4, vel: 0.8 }];
  let s = S.setNote(song, 0, "melody", P - 1, 2, 0.5);

  const spillOf = (list) => plain(list).filter((e) => e.track === "melody");
  // t = P-1 is the last odd 16th, pushed 12 ticks into slot 1, but still slot 0's note
  const out = spillOf(S.chainEvents(s, [0, 1], P, P + 20));
  assert.deepEqual(out, [{ tick: P + 11, track: "melody", deg: 2, vel: 0.5, len: 1, p: 0, slot: 0 }]);
  assert.ok(plain(S.chainEvents(s, [0, 1], P, P + 20)).some((e) => e.track === "bass" && e.tick === P), "slot 1 starts on P");
  assert.equal(spillOf(S.chainEvents(s, [0, 1], P + 11, P + 12)).length, 1, "fromTick is inclusive");
  assert.equal(spillOf(S.chainEvents(s, [0, 1], P, P + 11)).length, 0, "toTick is exclusive");
  assert.deepEqual(spillOf(S.chainEvents(s, [0], P, P + 20)), out, "same spill with a one-slot chain");

  // the same note in the last slot spills into the next pass, not into a missing segment
  s = S.setNote(s, 1, "melody", P - 1, 1, 0.5);
  const wrap = spillOf(S.chainEvents(s, [0, 1], 2 * P, 2 * P + 20));
  assert.deepEqual(wrap, [{ tick: 2 * P + 11, track: "melody", deg: 1, vel: 0.5, len: 1, p: 1, slot: 1 }]);
});

test("chainEvents: several passes, 7-tick slices make the same list", () => {
  const song = fresh();
  song.patterns.push(S.emptyPattern());
  song.patterns[1].notes.melody = [{ t: 0, len: P, deg: 3, vel: 0.8 }];
  const total = S.chainTicks(song, [0, 1]);
  assert.equal(total, 2 * P);

  const all = plain(S.chainEvents(song, [0, 1], 0, 5 * total));
  assert.ok(all.length > 40);
  const slices = [];
  for (let a = 0; a < 5 * total; a += 7) slices.push(...plain(S.chainEvents(song, [0, 1], a, Math.min(a + 7, 5 * total))));
  assert.deepEqual(slices, all, "each event exactly once, in the same order");

  // every pass is identical apart from its base tick
  const one = plain(S.chainEvents(song, [0, 1], 0, total));
  const four = plain(S.chainEvents(song, [0, 1], 4 * total, 5 * total));
  assert.equal(four.length, one.length);
  four.forEach((e, i) => close(e.tick - 4 * total, one[i].tick, "pass " + i));
});

test("chainEvents: patterns of different len in one chain keep their own bars", () => {
  const song = fresh(); // A, 16 steps
  song.patterns.push(S.emptyPattern()); // B, 8 steps
  song.patterns[1].len = 8;
  song.patterns[1].notes.bass = [{ t: 0, len: 8 * S.STEP, deg: 4, vel: 0.8 }];

  const chain = [0, 1, 0];
  const total = S.chainTicks(song, chain);
  assert.equal(total, P + 8 * S.STEP + P, "A + short B + A");
  assert.equal(total, 960);

  const all = plain(S.chainEvents(song, chain, 0, total));
  const find = (track, tick) => all.find((e) => e.track === track && e.tick === tick);

  // B starts at P and lasts 192 ticks, so the third slot starts at P + 192
  assert.deepEqual(find("bass", P), { tick: P, track: "bass", deg: 4, vel: 0.8, len: 8 * S.STEP, p: 1, slot: 1 });
  assert.equal(find("bass", P + 8 * S.STEP).p, 0);
  assert.equal(find("bass", P + 8 * S.STEP).slot, 2);
  assert.equal(find("bass", P + 8 * S.STEP + 192).deg, 2, "A's step 9 is back, 8 steps into the last bar");
  assert.equal(all.some((e) => e.slot === 2 && e.tick < P + 8 * S.STEP), false);

  assert.deepEqual(plain(S.chainAt(song, chain, P + 8 * S.STEP)), { slot: 2, p: 0, t: 0 });
  assert.deepEqual(plain(S.chainAt(song, chain, total)), { slot: 0, p: 0, t: 0 });
});

test("chainEvents: non-finite bounds are empty; a negative fromTick starts at zero", () => {
  const song = fresh();
  for (const [a, b] of [
    [0, Infinity],
    [-Infinity, 100],
    [-Infinity, Infinity],
    [Infinity, Infinity],
    [0, NaN],
    [NaN, 100],
  ]) {
    assert.deepEqual(plain(S.chainEvents(song, [0], a, b)), [], `${a}..${b}`);
  }

  const fromZero = plain(S.chainEvents(song, [0], 0, 300));
  assert.deepEqual(plain(S.chainEvents(song, [0], -50, 300)), fromZero, "a negative fromTick is 0");
  assert.deepEqual(plain(S.chainEvents(song, [0], -1e15, 300)), fromZero, "a huge negative fromTick is 0");
  assert.deepEqual(plain(S.chainEvents(song, [0], -1e15, -1e14)), [], "after the clamp the range is empty");
});

test("chainEvents: a dense 64-slot song gives the same events as a straightforward scan", () => {
  // a fixed LCG so a failing window can be reproduced
  let seed = 0x5eed;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (n) => Math.floor(rand() * n);

  // the scheduler's worst accepted song: 16 patterns, 4 tracks of 1024 notes, all 64 slots
  const song = fresh();
  song.swing = 0.75;
  song.patterns = [];
  for (let pi = 0; pi < S.PATTERNS_MAX; pi++) {
    const notes = { drums: [], bass: [], chords: [], melody: [] };
    for (const track of ["drums", "bass", "chords", "melody"]) {
      for (let j = 0; j < 1024; j++) {
        const note = { t: pick(P), len: 1 + pick(P), vel: rand() };
        if (track === "drums") note.key = S.DRUMS[pick(S.DRUMS.length)];
        else note.deg = pick(33) - 16;
        notes[track].push(note);
      }
    }
    song.patterns.push({ len: 16, notes });
  }
  song.song = Array.from({ length: S.SONG_MAX }, (_, i) => i % S.PATTERNS_MAX);
  assert.equal(S.validate(song).error, undefined);

  // the old shape: every slot, every note, every pass around the window, then the same sort and filter
  const reference = (fromTick, toTick) => {
    const out = [];
    if (!isFinite(fromTick) || !isFinite(toTick)) return out;
    if (fromTick < 0) fromTick = 0;
    if (!(toTick > fromTick)) return out;
    const segs = [];
    let total = 0;
    for (let i = 0; i < song.song.length; i++) {
      const p = song.song[i];
      const pat = song.patterns[p];
      const len = pat && Number.isInteger(pat.len) && pat.len >= 1 ? pat.len : S.STEPS;
      segs.push({ slot: i, p, start: total, ticks: len * S.STEP });
      total += len * S.STEP;
    }
    const off = S.swingTicks(song.swing);
    const place = {};
    song.tracks.forEach((tr, i) => { place["$" + tr.id] = i; });
    for (let pass = Math.floor(fromTick / total) - 1; pass <= Math.floor(toTick / total) + 1; pass++) {
      const base = pass * total;
      for (const seg of segs) {
        const pat = song.patterns[seg.p];
        if (!pat) continue;
        for (const tr of song.tracks) {
          if (tr.kind === "voice" || tr.mute) continue;
          for (const note of pat.notes[tr.id] || []) {
            const tick = base + seg.start + note.t + (Math.floor(note.t / S.STEP) % 2 ? off : 0);
            if (tick < fromTick || tick >= toTick) continue;
            const e = { tick, track: tr.id };
            if (tr.kind === "drum") e.key = note.key;
            else e.deg = note.deg;
            e.vel = note.vel;
            e.len = note.len;
            e.p = seg.p;
            e.slot = seg.slot;
            out.push(e);
          }
        }
      }
    }
    out.sort((a, b) => {
      if (a.tick !== b.tick) return a.tick - b.tick;
      const d = place["$" + a.track] - place["$" + b.track];
      if (d) return d;
      const da = S.DRUMS.indexOf(a.key), db = S.DRUMS.indexOf(b.key);
      if (da >= 0 || db >= 0) return da - db;
      return (a.deg || 0) - (b.deg || 0);
    });
    return out;
  };

  const total = S.chainTicks(song, song.song);
  const windows = [];
  for (let w = 0; w < 12; w++) {
    const from = pick(total * 2);
    windows.push([from, from + 1 + pick(500)]);
  }
  // start of the song, a pass boundary, and one tick of a new pass
  windows.push([0, 400], [total - 20, total + 20], [total, total + 1]);
  for (const [from, to] of windows) {
    assert.deepEqual(plain(S.chainEvents(song, song.song, from, to)), plain(reference(from, to)), `window ${from}..${to}`);
  }
});

test("chainEvents: missing patterns count as empty 16-step bars; empty chains and ranges", () => {
  const song = fresh();
  assert.equal(S.chainTicks(song, [5]), P);
  assert.equal(S.chainTicks(song, [0, 5]), 2 * P);
  assert.equal(S.chainTicks(song, []), 0);
  assert.deepEqual(plain(S.chainEvents(song, [5], 0, P)), []);
  assert.deepEqual(plain(S.chainEvents(song, [], 0, P)), []);
  assert.deepEqual(plain(S.chainEvents(song, [0], P, P)), []);
  assert.deepEqual(plain(S.chainEvents(song, [0], P, P - 1)), []);
  assert.equal(S.chainAt(song, [], 10), null);

  const one = plain(S.chainEvents(song, [0], 0, P));
  const out = plain(S.chainEvents(song, [0, 5], 0, 2 * P));
  assert.equal(out.length, one.length);
  out.forEach((e, i) => {
    assert.equal(e.tick, one[i].tick);
    assert.equal(e.p, 0);
    assert.equal(e.slot, 0);
  });
});

test("chainEvents: voice and muted tracks make no events, same as events()", () => {
  const song = fresh();
  song.patterns[0].notes.voice = [{ t: 0, len: P, deg: 0, vel: 1 }];
  song.tracks[0].mute = true;
  const out = plain(S.chainEvents(song, [0], 0, P));
  assert.equal(out.some((e) => e.track === "drums"), false);
  assert.equal(out.some((e) => e.track === "voice"), false);
  assert.equal(out.some((e) => e.track === "bass"), true);
  assert.deepEqual(out.map(({ p, slot, ...e }) => e), plain(S.events(song, 0, 0, P)));
});

test("chainTicks and chainAt: wrap after one pass, and before the start", () => {
  let song = fresh();
  song = S.ensurePattern(song, 1);
  song.patterns[1].len = 8;
  const chain = [0, 1];
  assert.equal(S.chainTicks(song, chain), P + 8 * S.STEP);

  assert.deepEqual(plain(S.chainAt(song, chain, 0)), { slot: 0, p: 0, t: 0 });
  assert.deepEqual(plain(S.chainAt(song, chain, P - 1)), { slot: 0, p: 0, t: P - 1 });
  assert.deepEqual(plain(S.chainAt(song, chain, P)), { slot: 1, p: 1, t: 0 });
  assert.deepEqual(plain(S.chainAt(song, chain, P + 191)), { slot: 1, p: 1, t: 191 });
  assert.deepEqual(plain(S.chainAt(song, chain, P + 192)), { slot: 0, p: 0, t: 0 }, "one pass wraps");
  assert.deepEqual(plain(S.chainAt(song, chain, 1000)), { slot: 1, p: 1, t: 40 });
  assert.deepEqual(plain(S.chainAt(song, chain, -5)), { slot: 0, p: 0, t: 0 });
});

test("demoSong: eight patterns in two four-bar phrases, A dorian, ghost notes and rests from DEMO_SONG", () => {
  const song = S.demoSong(2000);
  assert.equal(S.validate(song).error, undefined);
  assert.equal(song.updated, 2000);
  assert.equal(S.demoSong().updated, 0);
  assert.equal(song.v, 1);
  assert.deepEqual([song.bpm, song.key, song.scale, song.swing, song.kit], [78, 9, "dorian", 0.62, "soft"]);
  assert.equal(song.patterns.length, 8);
  assert.deepEqual(plain(song.song), [0, 1, 2, 3, 0, 1, 2, 3, 4, 5, 6, 7, 4, 5, 6, 7, 0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(plain(S.DEMO_SONG.song), plain(song.song));
  // the example is its own song: a new tape stays the single demo bar
  assert.deepEqual(plain(S.newSong().song), [0]);
  assert.equal(S.newSong().scale, "minor-penta");

  // the progression, by chord name and step
  const chords = plain(song.patterns).map((p) => p.notes.chords.map((n) => S.chordName(song, n.deg).name + "@" + (n.t / S.STEP + 1)).join(" "));
  assert.deepEqual(chords, ["Am9@1", "D9@1", "Cmaj9@1 Bm7@9", "Em9@1 D9@9", "Cmaj9@1", "Bm7@1 Em9@9", "Am9@1 F#m7b5@9", "D9@1"]);

  // rows as [step, value]; a rest is step + null, and lens come from the tie
  const rows = (p, track) => plain(song.patterns[p].notes[track]).map((n) => [n.t / S.STEP + 1, S.isRest(n) ? null : n.deg]);
  assert.deepEqual(rows(0, "bass"), [[1, 0], [3, null], [4, 0], [7, 4], [8, null], [11, 6], [13, 7], [15, 6]]);
  assert.deepEqual(rows(7, "melody"), [[1, 5], [3, 4], [5, 3], [7, null]]);
  // the bass reaches the next chord's root a 16th early: C's B on step 8 under Bm7 from step 9
  assert.deepEqual(rows(2, "bass")[4], [8, 1]);
  // a third number is a velocity; without one a note plays at NOTE_VEL
  const a = song.patterns[0].notes;
  assert.equal(a.bass.find((n) => n.t === 3 * S.STEP).vel, 0.6);
  assert.equal(a.bass[0].vel, S.NOTE_VEL);
  for (const n of song.patterns[0].notes.melody) if (n.t === S.STEP * 14) assert.equal(n.vel, 0);

  // drums: a bare step plays at the row's velocity, [step, vel] is a ghost or an accent
  const hits = (p, drum) => plain(song.patterns[p].notes.drums).filter((n) => n.key === drum).map((n) => [n.t / S.STEP + 1, n.vel]);
  assert.deepEqual(hits(0, "snare"), [[5, 0.9], [10, 0.22], [13, 0.9], [16, 0.28]]);
  assert.deepEqual(hits(0, "kick"), [[1, 0.85], [8, 0.75], [11, 0.9]]);
  assert.deepEqual(hits(7, "snare").map((h) => h[0]), [5, 9, 11, 13, 14, 15, 16], "H rolls back to the top");
  for (const p of song.patterns) for (const n of p.notes.drums) assert.ok(n.vel > 0 && n.vel <= 1);

  // every degree stays on the grid the screens can show (keys 0-7, chords 0-5)
  for (const p of song.patterns) {
    for (const t of ["bass", "melody"]) for (const n of p.notes[t]) assert.ok(n.deg >= 0 && n.deg <= 7, `${t} ${n.deg}`);
    for (const n of p.notes.chords) assert.ok(n.deg >= 0 && n.deg <= 5);
    // and the chords sit on the two cells of the chord screen
    for (const n of p.notes.chords) assert.ok(n.t === 0 || n.t === 8 * S.STEP);
  }

  // over the whole chain every rest is an event with vel 0 and no pitch, with a real len from the tie
  const total = S.chainTicks(song, song.song);
  assert.equal(total, 24 * P);
  const ev = plain(S.chainEvents(song, song.song, 0, total));
  const rests = ev.filter((e) => e.vel === 0);
  assert.ok(rests.length > 0);
  for (const r of rests) {
    assert.equal(r.deg, 0);
    assert.ok(r.track === "melody" || r.track === "bass", r.track);
    assert.ok(r.len >= S.STEP, `rest len ${r.len}`);
  }
  for (const tr of ["melody", "bass", "chords", "drums"]) assert.ok(ev.some((e) => e.track === tr && e.vel > 0), tr);
});

test("newSong: the demo bass and chords validate, keep their velocities, and do not alias the constants", () => {
  const song = S.newSong(1000);
  assert.equal(S.validate(song).error, undefined);
  const notes = song.patterns[0].notes;
  assert.deepEqual(plain(notes.bass.map((n) => [n.t / S.STEP + 1, n.deg, n.len])), [[1, 0, 192], [9, 2, 48], [11, 3, 144]]);
  assert.deepEqual(plain(notes.chords.map((n) => [n.t / S.STEP + 1, n.deg, n.len])), [[1, 0, 192], [9, 3, 192]]);
  for (const n of notes.bass.concat(notes.chords)) assert.equal(n.vel, S.NOTE_VEL);

  notes.bass[0].t = 99;
  assert.deepEqual(plain(S.DEMO_BASS[0]), [1, 0], "the pair constant is a template, not the stored note");
  assert.deepEqual(plain(S.DEMO_CHORDS[1]), [9, 3]);
});

/* ---------- 12.15/12.16: the arrangement helpers, the pop example and the AI draft ---------- */

test("setDrum: adds, moves the velocity, removes, and is sorted with the other drums", () => {
  let s = S.setDrum(fresh(), 0, "snare", 9, true, 0.2);
  let hit = s.patterns[0].notes.drums.find((n) => n.key === "snare" && n.t === 9 * S.STEP);
  assert.ok(hit);
  assert.equal(hit.vel, 0.2);
  assert.equal(hit.len, S.STEP);
  s = S.setDrum(s, 0, "snare", 9, true, 0.95);
  hit = s.patterns[0].notes.drums.find((n) => n.key === "snare" && n.t === 9 * S.STEP);
  assert.equal(hit.vel, 0.95);
  s = S.setDrum(s, 0, "snare", 9, false);
  assert.equal(s.patterns[0].notes.drums.some((n) => n.key === "snare" && n.t === 9 * S.STEP), false);
  // a missing pattern is created, a bad drum/step/velocity is refused
  const made = S.setDrum(fresh(), 4, "hat", 0, true, 1);
  assert.equal(made.patterns[4].notes.drums.length, 1);
  assert.equal(S.setDrum(fresh(), 0, "cowbell", 0, true).patterns[0].notes.drums.length, 13);
  assert.equal(S.setDrum(fresh(), 0, "kick", 16, true).patterns[0].notes.drums.length, 13);
  assert.equal(S.setDrum(fresh(), 0, "kick", 0, true, 2).patterns[0].notes.drums.length, 13);
});

test("clearTrack and setTrackMix: the arrangement and mixer helpers", () => {
  let s = S.clearTrack(fresh(), 0, "bass");
  assert.deepEqual(plain(s.patterns[0].notes.bass), []);
  assert.equal(s.patterns[0].notes.drums.length, 13, "the other tracks stay");
  assert.deepEqual(plain(S.clearTrack(fresh(), 7, "melody").patterns[7].notes),
    { drums: [], bass: [], chords: [], melody: [] });
  assert.equal(S.clearTrack(fresh(), 0, "voice").patterns[0].notes.voice, undefined, "voice is not editable yet");
  s = S.setTrackMix(fresh(), "drums", { vol: 0.56, mute: true });
  assert.equal(s.tracks[0].vol, 0.6);
  assert.equal(s.tracks[0].mute, true);
  assert.equal(S.setTrackMix(fresh(), "bass", { vol: 1.1 }).tracks[1].vol, 1);
  assert.equal(S.setTrackMix(fresh(), "nope", { vol: 0.5 }).tracks[0].vol, 1);
});

test("popSong: C major, 96 BPM, straight, a 64-bar I-V-vi-IV band sketch", () => {
  const s = S.popSong(1234);
  assert.equal(S.validate(s).error, undefined);
  assert.equal(s.name, "白日流行");
  assert.equal(s.bpm, 96);
  assert.equal(s.key, 0);
  assert.equal(s.scale, "major");
  assert.equal(s.swing, 0.5);
  assert.equal(s.tape, 1);
  assert.equal(s.kit, "soft");
  assert.equal(s.patterns.length, 10);
  assert.equal(s.song.length, 64);
  assert.deepEqual(plain(s.song.slice(0, 8)), [8, 8, 8, 8, 0, 1, 2, 3]);
  // the four chord roots of the verse and chorus, one per bar
  for (const p of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const c = s.patterns[p].notes.chords;
    assert.equal(c.length, 1, `pattern ${p} has one chord`);
    assert.equal(c[0].t, 0);
    assert.equal(c[0].len, S.STEPS * S.STEP, "the chord fills the bar");
    assert.ok([0, 3, 4, 5].includes(c[0].deg));
  }
  // every note track is tied and every drum hit lands on a 16th
  for (const p of s.patterns) {
    for (const track of ["bass", "chords", "melody"]) {
      const list = p.notes[track];
      for (let i = 0; i < list.length; i++) {
        assert.equal(list[i].t % S.STEP, 0);
        if (i + 1 < list.length) assert.equal(list[i].len, list[i + 1].t - list[i].t);
      }
    }
    for (const h of p.notes.drums) assert.equal(h.t % S.STEP, 0);
  }
  // the intro has no chords, the outro has no drums
  assert.deepEqual(plain(s.patterns[8].notes.chords), []);
  assert.deepEqual(plain(s.patterns[9].notes.drums), []);
});

test("fromDraft: steps and velocities become a valid tied song, with tracks and a default chain", () => {
  const draft = {
    name: "Draft", bpm: 100, key: 0, scale: "major", swing: 0.5, tape: 1, kit: "soft",
    tracks: { drums: { vol: 0.8, mute: false }, bass: { vol: 0.6, mute: true } },
    patterns: [
      { drums: [[0, "kick", 1], [4, "snare", 0.8]], bass: [[0, 0, 0.8], [8, 2, 0.7]], chords: [[0, 0, 0.65]], melody: [[2, 4, 0.6]] },
      { drums: [], bass: [[0, 5, 0.8]], chords: [[0, 5, 0.65]], melody: [] },
    ],
  };
  const r = S.fromDraft(draft, 2000);
  assert.equal(r.error, undefined);
  assert.equal(S.validate(r.song).error, undefined);
  assert.equal(r.song.name, "Draft");
  assert.equal(r.song.bpm, 100);
  assert.deepEqual(plain(r.song.song), [0, 1], "no chain gives one pass in order");
  assert.equal(r.song.tracks[0].vol, 0.8);
  assert.equal(r.song.tracks[1].mute, true);
  assert.equal(r.song.updated, 2000);
  assert.equal(r.song.patterns[0].notes.bass[0].len, 8 * S.STEP);
  assert.equal(r.song.patterns[0].notes.melody[0].len, 14 * S.STEP);
  // the empty drum list is an empty track, not a missing one
  assert.deepEqual(plain(r.song.patterns[1].notes.drums), []);
});

test("fromDraft: a bad shape is refused instead of half-built", () => {
  const base = () => ({ name: "x", bpm: 90, key: 0, scale: "major", swing: 0.5, tape: 1, kit: "soft",
    patterns: [{ drums: [[0, "kick", 1]], bass: [[0, 0, 0.8]], chords: [[0, 0, 0.65]], melody: [] }] });
  for (const mut of [
    (d) => { d.patterns = []; },
    (d) => { d.patterns = new Array(17).fill({}); },
    (d) => { d.patterns[0].drums = [[0, "cowbell", 1]]; },
    (d) => { d.patterns[0].drums = [[16, "kick", 1]]; },
    (d) => { d.patterns[0].drums = [[0, "kick", 2]]; },
    (d) => { d.patterns[0].bass = [[0, 0, -0.1]]; },
    (d) => { d.patterns[0].chords = [[0, 6, 0.6]]; },
    (d) => { d.song = [0, 1]; },
    (d) => { d.tracks = { drums: { vol: 2 } }; },
    (d) => { d.tracks = { drums: { mute: "yes" } }; },
  ]) {
    const d = base(); mut(d);
    assert.ok(S.fromDraft(d).error, JSON.stringify(d));
  }
  assert.ok(S.fromDraft(null).error);
  assert.ok(S.fromDraft({ patterns: [{ drums: "x" }] }).error);
});

/* ---------- 12.17: folders and the two public-domain tunes ---------- */

test("newSong and validate: a tape has an optional folder, old tapes read as the default folder", () => {
  const song = S.newSong(1);
  assert.equal(song.folder, "");
  assert.equal(S.validate(song).error, undefined);
  const old = fresh();
  delete old.folder;
  const read = S.validate(old);
  assert.equal(read.error, undefined);
  assert.equal(read.song.folder, "");
  assert.equal(broken((s) => { s.folder = 7; }).error, "folder");
  assert.equal(broken((s) => { s.folder = "x".repeat(41); }).error, "folder");
  assert.equal(broken((s) => { s.folder = "Ideas"; }).error, undefined);
  assert.equal(broken((s) => { s.template = 7; }).error, "template");
  assert.equal(broken((s) => { s.template = 0; }).error, "template");
  assert.equal(broken((s) => { s.template = "saints"; }).error, undefined);
});

test("saintsSong and jasmineSong: two 64-bar, 16-pattern public-domain arrangements", () => {
  for (const [make, name, bpm] of [[S.saintsSong, "When the Saints", 104], [S.jasmineSong, "茉莉花", 84]]) {
    const s = make(1234);
    assert.equal(S.validate(s).error, undefined);
    assert.equal(s.name, name);
    assert.equal(s.bpm, bpm);
    assert.equal(s.key, 0);
    assert.equal(s.scale, "major");
    assert.equal(s.patterns.length, 16);
    assert.equal(s.song.length, 64, "64 one-bar slots is a normal 2.5-3 minute song");
    assert.deepEqual(plain(s.song.slice(0, 16)), [0,1,2,3,4,5,6,7,0,1,2,3,4,5,6,7]);
    assert.deepEqual(plain(s.song.slice(16, 24)), [8,9,10,11,12,13,14,15], "the chorus is the second group of eight");
    // both halves have a melody, chords and bass; the chorus melody is an octave up
    assert.ok(s.patterns[0].notes.melody.length > 0);
    assert.ok(s.patterns[0].notes.chords.length > 0);
    assert.ok(s.patterns[0].notes.bass.length > 0);
    assert.ok(s.patterns[8].notes.melody.length > 0);
    assert.ok(s.patterns[8].notes.melody[0].deg >= s.patterns[0].notes.melody[0].deg, "the chorus is not lower");
    // every note is tied and inside its bar
    for (const p of s.patterns) {
      for (const track of ["bass", "chords", "melody"]) {
        const list = p.notes[track];
        for (let i = 0; i < list.length; i++) {
          assert.ok(list[i].t >= 0 && list[i].t < S.STEPS * S.STEP);
          if (i + 1 < list.length) assert.equal(list[i].len, list[i + 1].t - list[i].t);
        }
      }
      for (const h of p.notes.drums) assert.equal(h.t % S.STEP, 0);
    }
  }
});
