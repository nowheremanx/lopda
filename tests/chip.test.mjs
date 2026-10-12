// runtime/chip.js: the MML parser and the custom sound parameters (pure functions), and how the shim, lo-game
// and the yard example use them. Synthesis itself is rendered in Chromium (tests/e2e.test.mjs, OfflineAudioContext).
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT, runScript } from "./helpers.mjs";
import { scripted } from "./frame-hashes.mjs";

const C = runScript("runtime/chip.js", {}).LopdaChip;
/* plain copies: values made in the vm have the vm's prototypes, which deepEqual tells apart */
const plain = (x) => JSON.parse(JSON.stringify(x));
const parse = (song) => plain(C.parse(song));
const one = (text, ch = "p1") => { const r = parse({ [ch]: text }); if (r.error) throw new Error(r.error); return r.song; };
const notes = (text, ch) => one(text, ch).events.map((e) => [e.t, e.d, e.m ?? e.hit]);
const err = (song) => parse(song).error;

test("notes, sharps and flats, rests, octaves", () => {
  /* o4 c is middle C (MIDI 60); the default length is a quarter (one beat) */
  assert.deepEqual(notes("c d e f g a b"), [[0, 1, 60], [1, 1, 62], [2, 1, 64], [3, 1, 65], [4, 1, 67], [5, 1, 69], [6, 1, 71]]);
  assert.deepEqual(notes("c+ d- e++ b-- C"), [[0, 1, 61], [1, 1, 61], [2, 1, 66], [3, 1, 69], [4, 1, 60]]);
  assert.deepEqual(notes("c r d"), [[0, 1, 60], [2, 1, 62]]);
  assert.deepEqual(notes("o2 c > c >> c < c o7 b"), [[0, 1, 36], [1, 1, 48], [2, 1, 72], [3, 1, 60], [4, 1, 107]]);
  const a = one("o4 a").events[0];
  assert.equal(a.f, 440);
});

test("lengths, dots, the default length, ties", () => {
  assert.deepEqual(notes("c8 c16 c2 c1 c3"), [[0, 0.5, 60], [0.5, 0.25, 60], [0.75, 2, 60], [2.75, 4, 60], [6.75, 4 / 3, 60]]);
  assert.deepEqual(notes("c4. c4.. c8."), [[0, 1.5, 60], [1.5, 1.75, 60], [3.25, 0.75, 60]]);
  assert.deepEqual(notes("l8 c d l2. e f4"), [[0, 0.5, 60], [0.5, 0.5, 62], [1, 3, 64], [4, 1, 65]]);
  /* & joins the same pitch into one note; another pitch just follows */
  assert.deepEqual(notes("c4&c8 & c16 d"), [[0, 1.75, 60], [1.75, 1, 62]]);
  assert.deepEqual(notes("c&d e"), [[0, 1, 60], [1, 1, 62], [2, 1, 64]]);
  assert.deepEqual(notes("c r&r c"), [[0, 1, 60], [3, 1, 60]]);
  assert.equal(one("c4 r2.").beats, 4);
});

test("volume and duty carry on until changed; spaces and bar lines are ignored", () => {
  const ev = one("v3 c @0 | d\n v15 @3\te").events.map((e) => [e.v, e.duty]);
  assert.deepEqual(ev, [[3, 2], [3, 0], [15, 3]]);
  assert.deepEqual(one("c").events.map((e) => [e.v, e.duty]), [[10, 2]], "defaults: v10, @2 (50 %)");
});

test("repeats: a count, the default of two, nesting, and state carried through", () => {
  assert.deepEqual(notes("[c d]3").map((n) => n[2]), [60, 62, 60, 62, 60, 62]);
  assert.deepEqual(notes("[c]").map((n) => n[2]), [60, 60]);
  assert.deepEqual(notes("[c [d e]2]2").map((n) => n[2]), [60, 62, 64, 62, 64, 60, 62, 64, 62, 64]);
  /* an octave change inside a repeat counts each time round, as on paper */
  assert.deepEqual(notes("o3 [c >]3").map((n) => n[2]), [48, 60, 72]);
  assert.equal(one("l8 [c d e f]4").beats, 8);
});

test("the noise channel: x short, X long, with lengths", () => {
  assert.deepEqual(notes("x X8 x4. r X", "noise"), [[0, 1, "x"], [1, 0.5, "X"], [1.5, 1.5, "x"], [4, 1, "X"]]);
  assert.deepEqual(notes("l16 [x]4 X4&X4", "noise").map((n) => n[1]), [0.25, 0.25, 0.25, 0.25, 2]);
});

test("a whole song: bpm, channels merged in time order, loop length is the longest channel", () => {
  const r = parse({ bpm: 120, p1: "@2 v12 o4 l8 [cdeg a4 g4]2 >c2", p2: "@1 v8 o3 l4 c e g e", tri: "o2 l4 c c g g", noise: "l8 [x r x x]4" });
  assert.ok(r.song);
  assert.equal(r.song.bpm, 120);
  assert.equal(r.song.beats, 10);
  assert.equal(r.song.seconds, 5);
  const ts = r.song.events.map((e) => e.t);
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
  assert.deepEqual(r.song.events.slice(0, 4).map((e) => e.ch), ["p1", "p2", "tri", "noise"]);
  assert.equal(parse({ p1: "c" }).song.bpm, 120, "default bpm");
  assert.equal(parse({ bpm: 5, p1: "c" }).song.bpm, 30, "bpm is clamped");
  assert.equal(parse({ bpm: 900, p1: "c" }).song.bpm, 300);
});

test("mistakes are reported with the channel and the column", () => {
  assert.equal(err({ p1: "c d q" }), "p1:5: unknown command 'q'");
  assert.equal(err({ p1: "c", p2: "c [d e" }), "p2:3: '[' is never closed");
  assert.equal(err({ tri: "c ]" }), "tri:3: ']' without '['");
  assert.equal(err({ p1: "c99" }), "p1:2: length 99 is out of range (1-64)");
  assert.equal(err({ p1: "c0" }), "p1:2: length 0 is out of range (1-64)");
  assert.equal(err({ p1: "c4..." }), "p1:5: at most two dots");
  assert.equal(err({ p1: "l" }), "p1:1: l needs a length, like l8");
  assert.equal(err({ p1: "o9 c" }), "p1:1: o needs an octave 0-7");
  assert.equal(err({ p1: "o7 >c" }), "p1:4: octave goes out of range (0-7)");
  assert.equal(err({ p1: "v16" }), "p1:1: v needs a volume 0-15");
  assert.equal(err({ p1: "@4" }), "p1:1: @ needs a duty 0-3");
  assert.equal(err({ p1: "[c]0" }), "p1:1: repeat count must be 1-99");
  assert.equal(err({ noise: "x c" }), "noise:3: the noise channel plays only x and X");
  assert.equal(err({ p1: "c x" }), "p1:3: x and X are for the noise channel");
  assert.equal(err({ p1: "[[[[[[[[[c]]]]]]]]]" }), "p1:9: repeats nest too deep (at most 8)");
  assert.equal(err({ p1: "[[[[c]99]99]99]9" }), "p1:5: too many notes (more than 20000 after repeats)");
});

test("the shape of a song: at most four named channels, 8 KB of text, something to play", () => {
  assert.match(err({ p1: "c", lead: "c" }), /unknown key "lead"/);
  assert.match(err({ p1: 7 }), /p1 must be a string/);
  assert.match(err({ bpm: 100 }), /no channels/);
  assert.match(err({ bpm: "fast", p1: "c" }), /bpm must be a number/);
  assert.match(err({ p1: " | " }), /empty/);
  assert.equal(parse({ p1: "r1" }).song.seconds, 2, "a song of rests is silence, not a mistake");
  assert.match(err(null), /a song is an object/);
  assert.match(err("c d e"), /a song is an object/);
  assert.match(err({ p1: "c ".repeat(2048), p2: "c ".repeat(2048) + "c" }), /8193 characters; the limit is 8192/);
  assert.ok(parse({ p1: "c ".repeat(2048), p2: "c ".repeat(2048) }).song);
});

test("custom sound parameters are pulled into range, never refused", () => {
  const p = (o) => plain(C.sfxParams(o));
  assert.deepEqual(p({}), { wave: "square", duty: 2, from: 440, to: 440, ms: 150, attack: 2, decay: 148, vol: 0.7 });
  assert.deepEqual(p({ wave: "saw", duty: 9, from: 1, to: 99999, ms: 5000, attack: -3, decay: 9999, vol: 2 }),
    { wave: "square", duty: 3, from: 20, to: 12000, ms: 1500, attack: 0, decay: 1500, vol: 1 });
  assert.deepEqual(p({ wave: "noise", from: 900, to: 120, ms: 180, attack: 5, decay: 175, vol: 0.8 }),
    { wave: "noise", duty: 2, from: 900, to: 120, ms: 180, attack: 5, decay: 175, vol: 0.8 });
  /* attack and decay fit inside the length */
  assert.deepEqual(p({ ms: 100, attack: 300, decay: 300 }).attack, 100);
  assert.deepEqual(p({ ms: 100, attack: 30, decay: 300 }).decay, 70);
  assert.deepEqual(p({ wave: "triangle", duty: 1.6, ms: "80", vol: "loud", from: NaN }), { wave: "triangle", duty: 2, from: 440, to: 440, ms: 80, attack: 2, decay: 78, vol: 0.7 });
  assert.deepEqual(p(null), p({}));
  assert.deepEqual(p("coin"), p({}));
});

test("the yard's tune parses: four channels, 40 seconds, every channel the same length", () => {
  const ctx = runScript("registry/apps/xiaoyuan/src/music.js", {});
  const song = ctx.YARD_SONG;
  for (const ch of C.CHANNELS) assert.equal(parse({ bpm: song.bpm, [ch]: song[ch] }).song.beats, 64, ch);
  const r = parse(song);
  assert.equal(r.song.seconds, 40);
  assert.ok(JSON.stringify(song).length < C.MAX_TEXT);
});

test("the yard draws the same frames with and without music, and plays its tune and its own sounds", async () => {
  const file = join(ROOT, "registry/apps/xiaoyuan/index.html");
  const without = await scripted(file), withMusic = await scripted(file, { music: true });
  assert.deepEqual(withMusic.frames, without.frames);
  const kinds = (calls) => calls.map((c) => c[0] + ":" + (typeof c[1] === "object" ? "object" : c[1]));
  assert.equal(withMusic.calls.filter((c) => c[0] === "play").length, 1, "the tune starts once");
  assert.ok(parse(withMusic.calls.find((c) => c[0] === "play")[1]).song);
  assert.ok(!kinds(without.calls).some((k) => /object|play/.test(k)), "an old runtime gets named sounds only");
});
