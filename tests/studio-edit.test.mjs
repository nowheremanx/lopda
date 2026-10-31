// runtime/studio-edit.js: the AI's op language, validated and applied atomically (docs/design/studio.md 12.16).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { runScript, read } from "./helpers.mjs";

const ctx = runScript("runtime/studio-song.js");
vm.runInContext(read("runtime/studio-edit.js"), ctx, { filename: "runtime/studio-edit.js" });
const S = ctx.LopdaSong, E = ctx.LopdaStudioEdit;
const plain = (v) => JSON.parse(JSON.stringify(v));
const fresh = () => plain(S.newSong(1000));
const apply = (song, ops) => E.apply(song, ops);

test("apply: tempo, swing, key, scale, tape, name and kit land on a validated copy", () => {
  const song = fresh();
  const r = apply(song, [
    { op: "setBpm", value: 150 },
    { op: "swing", delta: 0.03 },
    { op: "setKey", value: 0 },
    { op: "setScale", value: "major" },
    { op: "setTape", value: 9 },
    { op: "setName", value: "Demo" },
    { op: "setKit", value: "chip" },
  ]);
  assert.equal(r.error, undefined);
  assert.equal(r.ops, 7);
  assert.equal(r.song.bpm, 140, "an absolute tempo is clamped");
  assert.equal(r.song.swing, 0.58, "a relative swing is rounded");
  assert.equal(r.song.key, 0);
  assert.equal(r.song.scale, "major");
  assert.equal(r.song.tape, 4, "the tape colour is clamped");
  assert.equal(r.song.name, "Demo");
  assert.equal(r.song.kit, "chip");
  assert.equal(S.validate(r.song).error, undefined);
  assert.equal(song.bpm, 82, "the input is never edited");
});

test("apply: an invalid op leaves the song untouched, even after a valid one", () => {
  const song = fresh();
  const r = apply(song, [{ op: "bpm", delta: 4 }, { op: "setKey", value: 42 }]);
  assert.equal(r.error, "value");
  assert.equal(r.at, 1);
  assert.equal(r.song, undefined);
  assert.equal(song.bpm, 82);
});

test("apply: track volume and mute, including a relative move", () => {
  const song = fresh();
  const a = apply(song, [{ op: "setTrackVolume", track: "drums", value: 0.54 }, { op: "setTrackMute", track: "bass", mute: true }]);
  assert.equal(a.error, undefined);
  assert.equal(a.song.tracks[0].vol, 0.5, "volumes are stored in tenths");
  assert.equal(a.song.tracks[1].mute, true);
  const b = apply(a.song, [{ op: "trackVol", track: "bass", delta: 0.1 }, { op: "setTrackMute", track: "bass", mute: false }]);
  assert.equal(b.song.tracks[1].vol, 1);
  assert.equal(b.song.tracks[1].mute, false);
});

test("apply: a drum hit can be set on, moved in velocity and set off", () => {
  let r = apply(fresh(), [{ op: "setDrum", pattern: 0, drum: "snare", step: 9, on: true, vel: 0.2 }]);
  let list = r.song.patterns[0].notes.drums.filter((n) => n.key === "snare" && n.t === 9 * S.STEP);
  assert.equal(list.length, 1);
  assert.equal(list[0].vel, 0.2);
  r = apply(r.song, [{ op: "setDrum", pattern: 0, drum: "snare", step: 9, on: true, vel: 0.9 }]);
  list = r.song.patterns[0].notes.drums.filter((n) => n.key === "snare" && n.t === 9 * S.STEP);
  assert.equal(list[0].vel, 0.9);
  r = apply(r.song, [{ op: "setDrum", pattern: 0, drum: "snare", step: 9, on: false }]);
  assert.equal(r.song.patterns[0].notes.drums.some((n) => n.key === "snare" && n.t === 9 * S.STEP), false);
});

test("apply: notes, rests and removals re-tie the track", () => {
  let r = apply(S.clearTrack(fresh(), 0, "bass"), [
    { op: "setNote", pattern: 0, track: "bass", step: 4, deg: 2, vel: 0.6 },
    { op: "setNote", pattern: 0, track: "bass", step: 12, deg: 4 },
  ]);
  const bass = r.song.patterns[0].notes.bass;
  const at4 = bass.find((n) => n.t === 4 * S.STEP);
  assert.equal(at4.len, 8 * S.STEP, "the new note rings to the next one");
  assert.equal(at4.vel, 0.6);
  const at12 = bass.find((n) => n.t === 12 * S.STEP);
  assert.equal(at12.len, 4 * S.STEP);
  r = apply(r.song, [{ op: "setRest", pattern: 0, track: "bass", step: 4 }]);
  assert.equal(r.song.patterns[0].notes.bass.find((n) => n.t === 4 * S.STEP).vel, 0);
  r = apply(r.song, [{ op: "removeNote", pattern: 0, track: "bass", step: 4 }]);
  assert.equal(r.song.patterns[0].notes.bass.some((n) => n.t === 4 * S.STEP), false);
});

test("apply: chords only take degrees 0-5; clearTrack and clearPattern empty the asked tracks", () => {
  let r = apply(fresh(), [{ op: "setNote", pattern: 0, track: "chords", step: 8, deg: 6 }]);
  assert.equal(r.error, "value");
  r = apply(fresh(), [{ op: "clearTrack", pattern: 0, track: "drums" }]);
  assert.deepEqual(plain(r.song.patterns[0].notes.drums), []);
  r = apply(r.song, [{ op: "clearPattern", pattern: 0 }]);
  assert.deepEqual(plain(r.song.patterns[0].notes), { drums: [], bass: [], chords: [], melody: [] });
});

test("apply: copyPattern, slots and inserts are the song-chain operations", () => {
  let r = apply(fresh(), [{ op: "copyPattern", from: 0, to: 1 }, { op: "addSlot", pattern: 1 }]);
  assert.deepEqual(plain(r.song.song), [0, 1]);
  assert.equal(r.song.patterns[1].notes.bass.length, r.song.patterns[0].notes.bass.length);
  r = apply(r.song, [{ op: "setSlot", slot: 0, pattern: 1 }, { op: "insertSlot", at: 1, pattern: 0 }]);
  assert.deepEqual(plain(r.song.song), [1, 0, 1]);
  r = apply(r.song, [{ op: "removeSlot", at: 1 }]);
  assert.deepEqual(plain(r.song.song), [1, 1]);
});

test("apply: a replaceSong is validated and becomes the new song", () => {
  const draft = {
    name: "Draft", bpm: 100, key: 0, scale: "major", swing: 0.5, tape: 1, kit: "soft",
    patterns: [{ drums: [[0, "kick", 1]], bass: [[0, 0, 0.8]], chords: [[0, 0, 0.65]], melody: [] }],
    song: [0],
  };
  const built = S.fromDraft(draft, 2000);
  assert.ok(built.song);
  const r = apply(fresh(), [{ op: "replaceSong", song: built.song }, { op: "bpm", delta: 2 }]);
  assert.equal(r.error, undefined);
  assert.equal(r.song.name, "Draft");
  assert.equal(r.song.bpm, 102);
  assert.equal(S.validate(r.song).error, undefined);
});

test("apply: setChain replaces the whole chain and creates the patterns it names", () => {
  let r = apply(fresh(), [{ op: "setChain", song: [0, 2, 2, 5] }]);
  assert.equal(r.error, undefined);
  assert.deepEqual(plain(r.song.song), [0, 2, 2, 5]);
  assert.ok(r.song.patterns[2], "pattern C exists");
  assert.ok(r.song.patterns[5], "pattern F exists");
  assert.equal(r.song.patterns[0].notes.bass.length, S.newSong(1).patterns[0].notes.bass.length, "an existing pattern is kept");
  assert.deepEqual(plain(r.song.patterns[5].notes), { drums: [], bass: [], chords: [], melody: [] });
  assert.equal(S.validate(r.song).error, undefined);
  const empty = Array(96).fill(0);
  r = apply(fresh(), [{ op: "setChain", song: empty }]);
  assert.equal(r.error, undefined, "96 slots are allowed");
  assert.equal(r.song.song.length, 96);
});

test("apply: setChain refuses an empty, long, out-of-range or non-integer chain", () => {
  assert.equal(apply(fresh(), [{ op: "setChain", song: [] }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setChain", song: Array(97).fill(0) }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setChain", song: [0, 64] }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setChain", song: [0, -1] }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setChain", song: [0, 1.5] }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setChain", song: "0" }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setBpm", value: 90 }, { op: "setChain", song: [0, 64] }]).at, 1);
});

test("apply: unknown ops, a non-array and malformed values are refused", () => {
  assert.equal(apply(fresh(), "nope").error, "ops");
  assert.equal(apply(fresh(), [{ op: "nope" }]).error, "unknown");
  assert.equal(apply(fresh(), [{ op: "setNote", pattern: 0, track: "drums", step: 0, deg: 0 }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setNote", pattern: 0, track: "bass", step: 16, deg: 0 }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setSwing", value: "x" }]).error, "value");
});

test("apply: setVoice picks a voice of that track and leaves the input alone", () => {
  const song = fresh();
  let r = apply(song, [{ op: "setVoice", track: "bass", value: "pick" }]);
  assert.equal(r.error, undefined);
  assert.equal(r.ops, 1);
  assert.equal(r.song.tracks[1].voice, "pick");
  assert.equal(S.voiceOf(r.song, "bass"), "pick");
  assert.equal(song.tracks[1].voice, undefined, "the input is never edited");
  assert.equal(S.validate(r.song).error, undefined);

  r = apply(r.song, [
    { op: "setVoice", track: "chords", value: "strings" },
    { op: "setVoice", track: "melody", value: "square" },
  ]);
  assert.equal(r.error, undefined);
  assert.equal(r.ops, 2);
  assert.equal(S.voiceOf(r.song, "chords"), "strings");
  assert.equal(S.voiceOf(r.song, "melody"), "square");

  /* a default voice may be set explicitly too; the shape is the same as a fallback but it is stored */
  r = apply(r.song, [{ op: "setVoice", track: "bass", value: "bass" }]);
  assert.equal(r.song.tracks[1].voice, "bass");
});

test("apply: setVoice refuses another track's voice, an unknown voice and a bad track", () => {
  assert.equal(apply(fresh(), [{ op: "setVoice", track: "bass", value: "piano" }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setVoice", track: "bass", value: "made-up-voice" }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setVoice", track: "bass", value: 5 }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setVoice", track: "bass", value: null }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setVoice", track: "drums", value: "bass" }]).error, "track");
  assert.equal(apply(fresh(), [{ op: "setVoice", track: "nope", value: "bass" }]).error, "track");
  assert.equal(apply(fresh(), [{ op: "setVoice", value: "bass" }]).error, "track");
  /* atomic: the earlier op is not kept when a later one fails */
  const r = apply(fresh(), [{ op: "setVoice", track: "bass", value: "sub" }, { op: "setVoice", track: "bass", value: "piano" }]);
  assert.equal(r.error, "value");
  assert.equal(r.at, 1);
  assert.equal(r.song, undefined);
});

test("apply: setKit takes every kit in the cycle", () => {
  for (const kit of S.KIT_CHOICES) {
    const r = apply(fresh(), [{ op: "setKit", value: kit }]);
    assert.equal(r.error, undefined, kit);
    assert.equal(r.song.kit, kit);
    assert.equal(S.validate(r.song).error, undefined);
  }
  assert.equal(apply(fresh(), [{ op: "setKit", value: "made-up-kit" }]).error, "value");
  assert.equal(apply(fresh(), [{ op: "setKit", value: "Soft" }]).error, "value");
});

/* ---------- 12.20.5: the optional note fields and the setNoteExtra op ---------- */
test("apply: setNote takes acc, gate and orn on notes, and q and acc on chords", () => {
  let r = apply(fresh(), [{ op: "setNote", pattern: 0, track: "melody", step: 4, deg: 2, vel: 0.7, acc: 1, gate: 0.5, orn: "vib" }]);
  assert.equal(r.error, undefined);
  let note = r.song.patterns[0].notes.melody.find((n) => n.t === 4 * S.STEP);
  assert.deepEqual(plain(note), { t: 4 * S.STEP, len: 288, deg: 2, vel: 0.7, acc: 1, gate: 0.5, orn: "vib" });
  assert.equal(S.validate(r.song).error, undefined);

  r = apply(r.song, [{ op: "setNote", pattern: 0, track: "bass", step: 4, deg: 0, orn: "slide", gate: 1 }]);
  assert.equal(r.error, undefined);
  note = r.song.patterns[0].notes.bass.find((n) => n.t === 4 * S.STEP);
  assert.equal(note.orn, "slide");
  assert.equal(note.gate, 1);

  r = apply(fresh(), [{ op: "setNote", pattern: 0, track: "chords", step: 4, deg: 3, vel: 0.6, q: "m7", acc: -1 }]);
  assert.equal(r.error, undefined);
  note = r.song.patterns[0].notes.chords.find((n) => n.t === 4 * S.STEP);
  assert.deepEqual(plain(note), { t: 4 * S.STEP, len: 96, deg: 3, vel: 0.6, q: "m7", acc: -1 });
  assert.equal(S.validate(r.song).error, undefined);

  // an unknown q is a later writer's: it validates and is kept, but plays as absent
  r = apply(fresh(), [{ op: "setNote", pattern: 0, track: "chords", step: 4, deg: 0, q: "a-later-quality" }]);
  assert.equal(r.error, undefined);
  assert.equal(r.song.patterns[0].notes.chords.find((n) => n.t === 4 * S.STEP).q, "a-later-quality");
  assert.equal(S.validate(r.song).error, undefined);
});

test("apply: a bad optional field on setNote is refused like the format", () => {
  const base = { op: "setNote", pattern: 0, track: "melody", step: 4, deg: 0 };
  for (const extra of [{ acc: 0 }, { acc: 2 }, { acc: "1" }, { gate: 0.05 }, { gate: 1.1 }, { gate: "0.5" },
    { orn: "trill" }, { orn: 1 }, { q: "m7" }])
    assert.equal(apply(fresh(), [{ ...base, ...extra }]).error, "value", JSON.stringify(extra));
  assert.equal(apply(fresh(), [{ ...base, track: "bass", orn: "vib" }]).error, "value", "the bass only slides");
  assert.equal(apply(fresh(), [{ ...base, track: "chords", deg: 0, gate: 0.5 }]).error, "value");
  assert.equal(apply(fresh(), [{ ...base, track: "chords", deg: 0, orn: "slide" }]).error, "value");
  assert.equal(apply(fresh(), [{ ...base, track: "chords", deg: 0, q: 7 }]).error, "value");
  assert.equal(apply(fresh(), [{ ...base, vel: 0, acc: 1 }]).error, "value", "a rest keeps no extra fields");
  // the valid edges
  assert.equal(apply(fresh(), [{ ...base, acc: -1, gate: 0.1, orn: "slide" }]).error, undefined);
  assert.equal(apply(fresh(), [{ ...base, track: "chords", deg: 0, q: "maj", acc: 1 }]).error, undefined);
});

test("apply: setNoteExtra changes only the optional fields, null removes, and deg and vel stay", () => {
  let r = apply(fresh(), [{ op: "setNote", pattern: 0, track: "melody", step: 4, deg: 2, vel: 0.7, acc: 1, gate: 0.5, orn: "vib" }]);
  const before = plain(r.song.patterns[0].notes.melody.find((n) => n.t === 4 * S.STEP));
  r = apply(r.song, [{ op: "setNoteExtra", pattern: 0, track: "melody", step: 4, acc: -1, gate: null }]);
  assert.equal(r.error, undefined);
  let note = plain(r.song.patterns[0].notes.melody.find((n) => n.t === 4 * S.STEP));
  assert.deepEqual(note, { t: 4 * S.STEP, len: 288, deg: 2, vel: 0.7, acc: -1, orn: "vib" });
  assert.equal(note.deg, before.deg);
  assert.equal(note.vel, before.vel);
  assert.equal(S.validate(r.song).error, undefined);

  r = apply(r.song, [{ op: "setNoteExtra", pattern: 0, track: "melody", step: 4, orn: null, acc: null }]);
  assert.equal(r.error, undefined);
  assert.deepEqual(plain(r.song.patterns[0].notes.melody.find((n) => n.t === 4 * S.STEP)),
    { t: 4 * S.STEP, len: 288, deg: 2, vel: 0.7 });

  r = apply(fresh(), [{ op: "setNote", pattern: 0, track: "chords", step: 0, deg: 0, q: "maj" }]);
  r = apply(r.song, [{ op: "setNoteExtra", pattern: 0, track: "chords", step: 0, q: "m7", acc: -1 }]);
  assert.equal(r.error, undefined);
  note = plain(r.song.patterns[0].notes.chords.find((n) => n.t === 0));
  assert.equal(note.q, "m7");
  assert.equal(note.acc, -1);
  assert.equal(note.deg, 0);
  assert.equal(note.vel, S.NOTE_VEL);

  r = apply(fresh(), [{ op: "setNoteExtra", pattern: 0, track: "bass", step: 0, orn: "slide" }]);
  assert.equal(r.error, undefined);
  assert.equal(r.song.patterns[0].notes.bass.find((n) => n.t === 0).orn, "slide");
});

test("apply: setNoteExtra refuses a missing note, a rest, a bad value or a field on the wrong track", () => {
  const song = apply(fresh(), [{ op: "setNote", pattern: 0, track: "melody", step: 4, deg: 2, vel: 0.7, acc: 1 }]).song;
  const at = (extra) => apply(song, [{ op: "setNoteExtra", pattern: 0, track: "melody", step: 4, ...extra }]);
  assert.equal(at({ acc: 1 }).error, undefined);
  assert.equal(at({ acc: 0 }).error, "value");
  assert.equal(at({ acc: "1" }).error, "value");
  assert.equal(at({ gate: 0.05 }).error, "value");
  assert.equal(at({ gate: 1.1 }).error, "value");
  assert.equal(at({ orn: "trill" }).error, "value");
  assert.equal(at({ q: "m7" }).error, "value", "q is a chord field");
  assert.equal(at({}).error, "value", "give at least one field");
  assert.equal(apply(song, [{ op: "setNoteExtra", pattern: 0, track: "melody", step: 8, acc: 1 }]).error, "value", "no note there");
  assert.equal(apply(song, [{ op: "setNoteExtra", pattern: 0, track: "bass", step: 0, orn: "vib" }]).error, "value", "the bass only slides");
  assert.equal(apply(song, [{ op: "setNoteExtra", pattern: 0, track: "chords", step: 0, gate: 0.5 }]).error, "value");
  assert.equal(apply(song, [{ op: "setNoteExtra", pattern: 0, track: "chords", step: 0, orn: "slide" }]).error, "value");

  const rest = apply(fresh(), [{ op: "setRest", pattern: 0, track: "melody", step: 4 }]).song;
  assert.equal(apply(rest, [{ op: "setNoteExtra", pattern: 0, track: "melody", step: 4, acc: 1 }]).error, "value");
  assert.equal(apply(rest, [{ op: "setNoteExtra", pattern: 0, track: "melody", step: 4, acc: null }]).error, undefined, "removing nothing is a no-op");

  // atomic: a later bad op drops the earlier good one
  const r = apply(song, [
    { op: "setNoteExtra", pattern: 0, track: "melody", step: 4, gate: 0.5 },
    { op: "setNoteExtra", pattern: 0, track: "melody", step: 8, acc: 1 },
  ]);
  assert.equal(r.error, "value");
  assert.equal(r.at, 1);
  assert.equal(r.song, undefined);
});

test("applyAll: more than 64 operations land in pieces, still all or nothing", () => {
  const song = fresh();
  const ops = [];
  for (let i = 0; i < 86; i++) ops.push({ op: "setDrum", pattern: 0, drum: "hat", step: i % 16, on: i % 2 === 0, vel: 0.4 });
  assert.equal(E.apply(song, ops).error, "many");
  const r = E.applyAll(song, ops);
  assert.equal(r.error, undefined);
  assert.equal(r.ops, 86);
  const bad = ops.concat([{ op: "setBpm", value: "x" }]);
  const b = E.applyAll(song, bad);
  assert.equal(b.error, "value");
  assert.equal(b.at, 86);
});
