// runtime/studio-song.js: the song format of the four-track tape machine, validate, the drum grid, scheduling with swing,
// and scale degrees (docs/design/studio.md sections 3 and 11).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const S = runScript("runtime/studio-song.js").LopdaSong;
const plain = (v) => JSON.parse(JSON.stringify(v));
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg} (${a} vs ${b})`);
const fresh = () => plain(S.newSong(1000));
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
    { id: "drums", kind: "drum" },
    { id: "bass", kind: "note" },
    { id: "chords", kind: "chord" },
    { id: "melody", kind: "note" },
    { id: "voice", kind: "voice" },
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
  assert.equal(S.PATTERNS_MAX, 8);
  assert.equal(S.SONG_MAX, 64);
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

  const p = song.patterns[0];
  assert.equal(p.len, 16);
  assert.deepEqual(Object.keys(p.notes).sort(), ["bass", "chords", "drums", "melody"]);
  assert.deepEqual(plain(p.notes.bass), []);
  assert.deepEqual(plain(p.notes.chords), []);
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
  ];
  for (const mut of cases) assert.equal(broken(mut).error, "tracks");

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
    (s) => { s.patterns = Array.from({ length: 9 }, () => ({ len: 16, notes: {} })); },
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
  assert.equal(broken((s) => { s.song = Array(65).fill(0); }).error, "song");
  assert.equal(broken((s) => { s.song = [1]; }).error, "song");
  assert.equal(broken((s) => { s.song = [-1]; }).error, "song");
  assert.equal(broken((s) => { s.song = [0.5]; }).error, "song");
  assert.equal(broken((s) => { s.song = ["0"]; }).error, "song");
  assert.equal(broken((s) => { s.clips = {}; }).error, "clips");
  assert.equal(broken((s) => { delete s.clips; }).error, "clips");

  // 64 slots, and a slot may name the last pattern
  assert.equal(broken((s) => {
    s.patterns.push({ len: 16, notes: {} });
    s.song = Array(64).fill(1);
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
  const song = fresh();
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
  const song = fresh();
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
