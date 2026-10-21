// runtime/chip.js: the MML parser and the custom sound parameters (pure functions), and how the shim, lo-game
// and the yard example use them. Synthesis itself is rendered in Chromium (tests/e2e.test.mjs, OfflineAudioContext).
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT, runScript } from "./helpers.mjs";
import { scripted } from "./frame-hashes.mjs";
import { boot } from "./app-vm.mjs";

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
  const p = (o) => { const r = plain(C.sfxParams(o)); delete r.vibrato; return r; };
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

test("vibrato: depth in semitones 0-2 (0, none, by default), rate in Hz 1-20 (6 by default), clamped", () => {
  const v = (o) => plain(C.sfxParams(o)).vibrato;
  assert.deepEqual(v({}), { depth: 0, rate: 6 });
  assert.deepEqual(v({ vibrato: { depth: 0.5, rate: 8 } }), { depth: 0.5, rate: 8 });
  assert.deepEqual(v({ vibrato: { depth: 5, rate: 99 } }), { depth: 2, rate: 20 });
  assert.deepEqual(v({ vibrato: { depth: -1, rate: 0 } }), { depth: 0, rate: 1 });
  assert.deepEqual(v({ vibrato: { depth: "1", rate: "fast" } }), { depth: 1, rate: 6 });
  assert.deepEqual(v({ vibrato: 3 }), { depth: 0, rate: 6 }, "a number is not a shape: ignored");
  assert.deepEqual(v({ vibrato: { rate: 10 } }), { depth: 0, rate: 10 });
});

test("ambience: six presets by name, null for silence, the level pulled into 0-1", () => {
  const a = (n, l) => plain(C.ambienceParams(n, l));
  assert.deepEqual(plain(C.AMBIENCES), ["rain", "waves", "waterfall", "wind", "fire", "stream"]);
  for (const n of C.AMBIENCES) assert.deepEqual(a(n, 0.3), { name: n, level: 0.3 });
  assert.deepEqual(a("rain"), { name: "rain", level: 0.5 }, "no level: the default");
  assert.deepEqual(a("rain", 7), { name: "rain", level: 1 });
  assert.deepEqual(a("rain", -1), { name: "rain", level: 0 });
  assert.deepEqual(a("rain", "0.25"), { name: "rain", level: 0.25 });
  assert.deepEqual(a("rain", "heavy"), { name: "rain", level: 0.5 });
  assert.deepEqual(a(null), { name: null, level: 0 });
  assert.deepEqual(a(undefined, 1), { name: null, level: 0 });
  assert.equal(a("thunder").error, 'unknown ambience "thunder": one of rain, waves, waterfall, wind, fire, stream, or null');
  assert.match(a("Rain").error, /unknown ambience "Rain"/, "names are lower case, as written");
  assert.match(a("").error, /unknown ambience ""/);
  assert.match(a(3).error, /unknown ambience "3"/);
  assert.equal(a("x".repeat(500)).error.length < 140, true, "a long name is cut in the message");
});

/* the host's rules, on a fake AudioContext: what waits, what is held over the rate, what stops */
function fakeHost() {
  const calls = [];
  const node = () => { const n = { connect() {}, disconnect() {}, gain: param(), frequency: param(), Q: param(), playbackRate: param(), detune: param(), start() {}, stop() {} }; return n; };
  function param() { return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} }; }
  const ctx = { state: "running", currentTime: 0, sampleRate: 8000, destination: node(),
    createGain: node, createOscillator: node, createBufferSource: node, createBiquadFilter: node,
    createPeriodicWave: () => ({}), createBuffer: (c, n) => ({ duration: n / 8000, getChannelData: () => new Float32Array(n) }),
    resume: () => Promise.resolve(), suspend() { calls.push("suspend"); } };
  const H = runScript("runtime/chip.js", { setTimeout: (f, ms) => { calls.push(["timer", ms]); return 1; }, clearTimeout() {} }).LopdaChip;
  let made = false;
  const host = H.host({ context: (make) => { if (make) made = true; return made ? ctx : null; }, output: () => ctx.destination });
  return { host, ctx, calls, make: () => { made = true; } };
}

test("ambience in the host: waits for the first touch, the newest call over the rate waits its turn, silence goes at once", () => {
  const { host, make } = fakeHost();
  const st = () => plain(host.state());
  assert.equal(host.ambience({ name: "rain", level: 0.6 }), null);
  assert.deepEqual([st().ambience, st().ambienceWaiting], [null, true], "no context yet: it waits");
  make(); host.unlock();
  assert.deepEqual([st().ambience, st().level, st().ambienceWaiting], ["rain", 0.6, false]);
  assert.equal(host.ambience({ name: "fire" }), null);
  host.ambience({ name: "wind", level: 0.2 }); host.ambience({ name: "waves", level: 0.9 });
  /* four calls this second: the fifth and sixth are held, and only the newest of them counts */
  assert.match(plain(host.ambience({ name: "stream", level: 0.1 })).held, /more than 4 calls a second/);
  assert.match(plain(host.ambience({ name: "fire", level: 0.4 })).held, /more than 4/);
  assert.equal(st().ambience, "waves");
  /* silence is never held, and drops what was waiting */
  assert.equal(host.ambience({ name: null }), null);
  assert.equal(st().ambience, null);
  assert.match(plain(host.ambience({ name: "lava" })).error, /unknown ambience "lava"/);
  host.ambience({ name: "rain", level: 0.5 });
  host.stop();
  assert.deepEqual(st(), { playing: false, waiting: false, paused: false, ambience: null, level: 0, ambienceWaiting: false });
});

test("ambience in the host: it goes on in a new context with the same preset and level; it holds the page's pause", () => {
  const { host, calls, make } = fakeHost();
  make();
  host.ambience({ name: "waterfall", level: 0.35 });
  host.pause();
  assert.ok(calls.includes("suspend"), "ambience alone is enough to suspend with the page");
  assert.equal(plain(host.state()).paused, true);
  host.resume();
  host.rebuild();
  assert.deepEqual([plain(host.state()).ambience, plain(host.state()).level], ["waterfall", 0.35]);
});

test("the yard's tune parses: four channels, 40 seconds, every channel the same length", () => {
  const ctx = runScript("registry/apps/xiaoyuan/src/music.js", {});
  const song = ctx.YARD_SONG;
  for (const ch of C.CHANNELS) assert.equal(parse({ bpm: song.bpm, [ch]: song[ch] }).song.beats, 64, ch);
  const r = parse(song);
  assert.equal(r.song.seconds, 40);
  assert.ok(JSON.stringify(song).length < C.MAX_TEXT);
});

test("the rain station: rain under the title and the station, lighter on the train, none at dawn; the same frames", async () => {
  const file = join(ROOT, "registry/apps/rain-station/index.html");
  const without = await scripted(file), withAmb = await scripted(file, { music: true, ambience: true });
  assert.deepEqual(withAmb.frames, without.frames);
  const amb = withAmb.calls.filter((c) => c[0] === "ambience").map((c) => c[1] + " " + c[2]);
  assert.deepEqual(amb.slice(0, 2), ["rain 0.4", "rain 0.7"], "the title, then the station");
  for (const a of amb) assert.match(a, /^(rain (0\.4|0\.7|0\.5|0\.8|0\.15|0\.3)|null 0)$/);
  assert.ok(!without.calls.some((c) => c[0] === "ambience"), "an old runtime: no calls");
  /* Two whole stories, driven fast: A only (the night train), and two DOWNs before A (stay, to dawn). */
  const story = async (keys) => {
    const on = { press: [], release: [] }, down = new Set(), heard = [];
    const pad = { lang: "zh", spec: "lopda/1", on: (type, f) => { if (on[type]) on[type].push(f); }, off() {}, isDown: (b) => down.has(b),
      load: () => Promise.resolve(null), save() {}, remove() {}, exit() {}, sfx() {}, music: { play() {}, stop() {} },
      ambience: (n, l) => heard.push(n ? n + " " + l : "quiet") };
    const app = boot(file, { pad });
    const run = async (n) => { for (let i = 0; i < n; i++) { app.frame(); await app.ctx.get("__yield")(); } };
    const tap = async (k) => { down.add(k); on.press.forEach((f) => f(k)); await run(2); down.delete(k); on.release.forEach((f) => f(k)); await run(1); };
    await run(30);
    for (let i = 0; i < 800; i++) {
      for (const k of keys) await tap(k);
      const cur = app.ctx.get("cur");
      if (cur && cur.kind === "end") break;
    }
    return heard;
  };
  assert.deepEqual(await story(["a"]), ["rain 0.4", "rain 0.7", "rain 0.5", "rain 0.8", "rain 0.15", "rain 0.8", "rain 0.3", "rain 0.15"]);
  assert.deepEqual(await story(["down", "down", "a"]), ["rain 0.4", "rain 0.7", "rain 0.5", "rain 0.8", "rain 0.15", "rain 0.8", "rain 0.5", "quiet"]);
});

test("the rain station: a finished chapter unlocks in Select and replays from its start", async () => {
  const file = join(ROOT, "registry/apps/rain-station/index.html");
  const store = {};
  const on = { press: [], release: [] }, down = new Set();
  const pad = {
    lang: "zh", spec: "lopda/1",
    on: (type, f) => { if (on[type]) on[type].push(f); }, off() {}, isDown: (b) => down.has(b),
    load: (k) => Promise.resolve(k in store ? store[k] : null),
    save: (k, v) => { store[k] = v; }, remove: (k) => { delete store[k]; }, exit() {}, sfx() {},
    music: { play() {}, stop() {} }, ambience() {}
  };
  const app = boot(file, { pad });
  const run = async (n) => { for (let i = 0; i < n; i++) { app.frame(); await app.ctx.get("__yield")(); } };
  const tap = async (k) => {
    down.add(k); on.press.forEach((f) => f(k)); await run(2);
    down.delete(k); on.release.forEach((f) => f(k)); await run(2);
  };
  await run(5);
  const game = app.ctx.get("game"), SCRIPT = app.ctx.get("SCRIPT");
  const ch3 = SCRIPT.findIndex((s) => s.id === "ch3");
  const ch4 = SCRIPT.findIndex((s) => s.id === "ch4");
  const start = { v: app.ctx.get("STORY_VERSION"), pc: ch3, flags: { tape: true, truth: true }, bg: "waiting", left: "mei", right: null, chapter: null };
  game.go("play", start, { fade: false });
  await run(2);
  assert.equal(app.ctx.get("S").chapter.id, "ch3");
  /* leaving for the next chapter is what marks this one finished */
  app.ctx.get("S").pc = ch4;
  app.ctx.get("run")();
  await run(2);
  assert.deepEqual(app.ctx.get("chapterList")().map((c) => c.id), ["ch3"]);
  assert.deepEqual(plain(store.chapters.done.ch3), { flags: { tape: true, truth: true }, bg: "waiting", left: "mei", right: null });
  /* title -> Select -> chapter menu */
  game.go("title", undefined, { fade: false });
  await run(5);
  await tap("select");
  await run(40);
  assert.equal(app.ctx.get("chFrom"), "title");
  assert.deepEqual(app.ctx.get("chapterList")().map((c) => c.id), ["ch3"]);
  /* A replays the chapter card, with the flags and portraits it started with */
  await tap("a");
  await run(40);
  const replay = app.ctx.get("S");
  assert.equal(replay.pc, ch3 + 1);
  assert.equal(replay.chapter.id, "ch3");
  assert.deepEqual(plain(replay.flags), { tape: true, truth: true });
  assert.equal(replay.bg, "waiting");
  assert.equal(replay.left, "mei");
  assert.equal(replay.right, null);
  /* Select during play opens the same menu; B comes back to the story */
  await tap("select");
  await run(40);
  assert.equal(app.ctx.get("chFrom"), "play");
  await tap("b");
  await run(40);
  assert.equal(app.ctx.get("S").chapter.id, "ch3");
  assert.ok(app.ctx.get("S").pc >= ch3 + 1);
  assert.deepEqual(plain(app.ctx.get("S").flags), { tape: true, truth: true });
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
