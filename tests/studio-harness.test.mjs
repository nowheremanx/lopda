// runtime/studio-harness.js: the skeleton pipeline, the edit loop, rewrites and stop (docs/design/studio.md 12.19.4-6).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { runScript, read } from "./helpers.mjs";

const ctx = runScript("runtime/studio-song.js");
for (const f of ["studio-styles.js", "studio-tools.js", "studio-edit.js", "studio-prompts.js", "studio-ai.js", "studio-harness.js"]) {
  vm.runInContext(read("runtime/" + f), ctx, { filename: "runtime/" + f });
}
const S = ctx.LopdaSong, ST = ctx.LopdaStudioStyles, E = ctx.LopdaStudioEdit, H = ctx.LopdaStudioHarness;
const plain = (v) => JSON.parse(JSON.stringify(v));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/* A scripted ask: an array of answers, or a function of (step, messages, index). It records every call and returns a
   promise with .stop(), like studio.js's wrapper around LP.ai.ask. */
function makeAsk(script) {
  const seen = [];
  const ask = (messages) => {
    const system = messages.find((m) => m.role === "system");
    const match = String(system && system.content).match(/TAPE4 STEP: (\w+)/);
    const step = match ? match[1] : "?";
    const index = seen.length;
    const item = typeof script === "function" ? script(step, messages, index) : script[index];
    const entry = { step, messages: plain(messages), answer: item, promise: null };
    seen.push(entry);
    let stopped = false;
    const p = new Promise((resolve, reject) => {
      if (item && item.pending) return;              /* never settles: the test stops the job */
      if (item && item.error) return reject(item.error);
      resolve(typeof item === "string" ? item : JSON.stringify(item));
    });
    p.stop = () => { stopped = true; };
    p.wasStopped = () => stopped;
    entry.promise = p;
    return p;
  };
  ask.seen = seen;
  return ask;
}

function planFor(bpm = 100) {
  return {
    card: 1,
    name: "Rain on the tram",
    bpm,
    sections: [
      { id: "intro", chords: [0], groove: "lofi-a", energy: 0, bass: "whole", melody: false },
      { id: "verse", chords: [0, 5, 3, 4], groove: "lofi-a", energy: 1, bass: "pulse", melody: true },
      { id: "chorus", chords: [3, 4, 0, 5], groove: "lofi-b", energy: 2, bass: "eighths", melody: true },
      { id: "outro", chords: [0], groove: "lofi-a", energy: 0, bass: "whole", melody: false },
    ],
    /* 42 bars at 100 BPM: 100.8 s, 10 patterns, 42 chain slots */
    order: [["intro", 1], ["verse", 3], ["chorus", 3], ["verse", 2], ["chorus", 2], ["outro", 1]],
  };
}

function melodyBars(messages) {
  const user = messages.find((m) => m.role === "user").content;
  const count = (user.match(/^bar \d+:/gm) || []).length;
  const bars = [];
  for (let i = 0; i < count; i++) {
    const lift = i % 2;                             /* not every bar is the same */
    bars.push([[0, 2 + lift, 0.8], [4, 4 + lift, 0.7], [8, 5, 0.6], [12, 3 + lift, 0.8]]);
  }
  return { bars };
}

const listenAnswer = { reply: "A rainy little tune at 100 BPM.", calls: [{ tool: "ghost", pattern: 0, amount: 1 }] };

function fullAnswers(plan) {
  return (step, messages) => {
    if (step === "plan") return plan;
    if (step === "melody") return melodyBars(messages);
    if (step === "listen") return listenAnswer;
    throw new Error("unexpected step " + step);
  };
}

async function skeletonOnce({ seed, plan = planFor(), stages = [] }) {
  const ask = makeAsk(fullAnswers(plan));
  const job = H.skeleton({
    text: "a rainy night song", ask, rand: ST.seeded(seed), now: 1000,
    onStage: (s) => stages.push(s),
  });
  return { ask, stages, out: await job };
}

test("skeleton: card, plan, laid bars, melodies and a listen-back", async () => {
  const stages = [];
  const { ask, out } = await skeletonOnce({ seed: 1, stages });
  assert.equal(out.draft, true);
  assert.equal(out.reply, listenAnswer.reply);
  assert.ok(out.card && typeof out.card.id === "string");
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].op, "replaceSong");

  assert.equal(S.validate(out.song).error, undefined);
  assert.equal(S.validate(out.ops[0].song).error, undefined);
  assert.equal(out.song.song.length, 42);
  assert.equal(out.song.patterns.length, 10);
  assert.equal(out.song.bpm, 100);
  assert.equal(out.song.name, "Rain on the tram");

  const roll = ST.roll(ST.seeded(1));
  assert.equal(out.song.key, roll.key);
  assert.equal(out.song.scale, roll.scale);
  assert.equal(out.song.swing, roll.swing);
  assert.equal(out.song.tape, roll.tape);
  assert.equal(out.song.kit, roll.kit);
  assert.equal(out.card.id, roll.card.id);

  assert.deepEqual(stages.map((s) => s.id), ["plan", "card", "lay", "melody", "melody", "listen"]);
  assert.equal(stages[1].vars.card, roll.card.en);
  assert.equal(stages[1].vars.key, S.NAMES[roll.key]);
  assert.equal(stages[1].vars.scale, roll.scale);
  assert.equal(stages[1].vars.bpm, 100, "the plan's tempo, not the dice's");
  assert.equal(stages[3].vars.section, "verse");
  assert.equal(stages[4].vars.section, "chorus");
  assert.equal(stages[3].n, 1);
  assert.equal(stages[3].of, 2);

  assert.deepEqual(ask.seen.map((s) => s.step), ["plan", "melody", "melody", "listen"]);
  const melodyUser = ask.seen[1].messages.find((m) => m.role === "user").content;
  assert.match(melodyUser, /SECTION: verse \(the 2nd of 4 sections, before the chorus\), 4 bars/);
  assert.match(melodyUser, /bar 1: chord \S+, chord tones \d/);
});

test("skeleton: two different seeds draw different keys", async () => {
  const a = await skeletonOnce({ seed: 1 });
  const b = await skeletonOnce({ seed: 2 });
  assert.notEqual(a.out.song.key, b.out.song.key);
  assert.equal(a.out.song.key, ST.roll(ST.seeded(1)).key);
  assert.equal(b.out.song.key, ST.roll(ST.seeded(2)).key);
});

test("skeleton: a too-short plan is sent back with the reason and then fixed", async () => {
  const short = {
    card: 1, name: "too short", bpm: 100,
    sections: [
      { id: "intro", chords: [0], groove: "lofi-a", energy: 0, bass: "whole", melody: false },
      { id: "outro", chords: [0], groove: "lofi-a", energy: 0, bass: "whole", melody: false },
    ],
    order: [["intro", 1], ["outro", 1]],
  };
  let planCalls = 0;
  const ask = makeAsk((step, messages) => {
    if (step === "plan") return planCalls++ === 0 ? short : planFor();
    if (step === "melody") return melodyBars(messages);
    if (step === "listen") return listenAnswer;
    throw new Error("unexpected step " + step);
  });
  const out = await H.skeleton({ text: "x", ask, rand: ST.seeded(1), now: 1000 });
  assert.equal(planCalls, 2);
  assert.equal(S.validate(out.song).error, undefined);
  const retry = ask.seen[1].messages;
  assert.equal(retry[retry.length - 2].role, "assistant");
  assert.match(retry[retry.length - 1].content, /That JSON was rejected: the song is \d+ s; add repeats so it is 100-200 s/);
});

test("skeleton: a melody with the wrong bar count is rewritten", async () => {
  let melodyCalls = 0;
  const ask = makeAsk((step, messages) => {
    if (step === "plan") return planFor();
    if (step === "melody") {
      melodyCalls++;
      if (melodyCalls === 1) return { bars: [[[0, 2, 0.8]]] };
      return melodyBars(messages);
    }
    if (step === "listen") return listenAnswer;
    throw new Error("unexpected step " + step);
  });
  const out = await H.skeleton({ text: "x", ask, rand: ST.seeded(1), now: 1000 });
  assert.equal(melodyCalls, 3, "one rewrite, then the two sections");
  assert.equal(S.validate(out.song).error, undefined);
  const retry = ask.seen[2].messages;                     /* the first melody ask, then its rewrite */
  assert.match(retry[retry.length - 1].content, /write exactly 4 bars/);
});

test("skeleton: an empty answer is a rewrite with the reason 'empty answer'", async () => {
  let planCalls = 0;
  const ask = makeAsk((step, messages) => {
    if (step === "plan") return planCalls++ === 0 ? "" : planFor();
    if (step === "melody") return melodyBars(messages);
    if (step === "listen") return listenAnswer;
    throw new Error("unexpected step " + step);
  });
  await H.skeleton({ text: "x", ask, rand: ST.seeded(1), now: 1000 });
  assert.equal(planCalls, 2);
  assert.match(ask.seen[1].messages.at(-1).content, /empty answer/);
});

test("skeleton: three unreadable answers reject with unreadable and the stage", async () => {
  const ask = makeAsk(() => "not json");
  const job = H.skeleton({ text: "x", ask, rand: ST.seeded(1), now: 1000 });
  await assert.rejects(job, (e) => {
    assert.equal(e.code, "unreadable");
    assert.equal(e.stage, "plan");
    return true;
  });
  assert.equal(ask.seen.length, 3, "the first answer and two rewrites");
});

test("skeleton: stop() stops the current ask and asks nothing more", async () => {
  const ask = makeAsk((step) => (step === "plan" ? { pending: true } : null));
  const job = H.skeleton({ text: "x", ask, rand: ST.seeded(1), now: 1000 });
  await tick();
  assert.equal(ask.seen.length, 1);
  job.stop();
  await assert.rejects(job, (e) => e.code === "stopped");
  assert.ok(ask.seen[0].promise.wasStopped(), "the current ask was stopped");
  await tick();
  assert.equal(ask.seen.length, 1, "nothing further is asked");
});

test("skeleton: a wrong key ends the job at once; a dropped line is retried, then the user decides", async () => {
  const now = (f) => f();
  const key = Object.assign(new Error("key"), { code: "key" });
  let ask = makeAsk(() => ({ error: key }));
  await assert.rejects(H.skeleton({ text: "x", ask, rand: ST.seeded(1), now: 1000, later: now }), (e) => e === key);
  assert.equal(ask.seen.length, 1, "no retry for a key the server refused");

  const busy = Object.assign(new Error("busy"), { code: "busy" });
  ask = makeAsk(() => ({ error: busy }));
  const stages = [];
  await assert.rejects(H.skeleton({ text: "x", ask, rand: ST.seeded(1), now: 1000, later: now, onStage: (s) => stages.push(s.id) }), (e) => e === busy);
  assert.equal(ask.seen.length, 1 + H.AUTO_RETRY, "asked again AUTO_RETRY times, then gave up with no one to ask");
  assert.equal(stages.filter((s) => s === "retry").length, H.AUTO_RETRY);

  /* the user says "keep trying": the line comes back and the job finishes from where it was */
  let fails = 5, troubles = 0;
  const answers = fullAnswers(planFor());
  ask = makeAsk((step, messages) => (fails-- > 0 ? { error: Object.assign(new Error("t"), { code: "timeout" }) } : answers(step, messages)));
  const out = await H.skeleton({ text: "x", ask, rand: ST.seeded(1), now: 1000, later: now, onTrouble: () => { troubles++; return Promise.resolve(true); } });
  assert.equal(out.draft, true);
  assert.equal(troubles, 1, "asked the user once, after the automatic retries");

  /* the user says "stop": the job ends with the line's error */
  ask = makeAsk(() => ({ error: busy }));
  await assert.rejects(H.skeleton({ text: "x", ask, rand: ST.seeded(1), now: 1000, later: now, onTrouble: () => Promise.resolve(false) }), (e) => e === busy);
});

/* ---------- the edit loop ---------- */

function makeEdit(script) {
  const ask = makeAsk(script);
  const original = S.demoSong(1000);
  return { ask, original, job: H.edit({ song: original, text: "make it breathe", ask, focus: { screen: "drums", pattern: 0 } }) };
}

test("edit: read, calls, done; the ops re-apply on the original song", async () => {
  let turn = 0;
  const ask = makeAsk((step) => {
    assert.equal(step, "edit");
    turn++;
    if (turn === 1) return { calls: [{ tool: "read", pattern: 0 }], done: false };
    if (turn === 2) return { calls: [{ tool: "mix", track: "bass", vol: 0.8 }], done: false };
    return { reply: "A little more room for the bass.", calls: [], done: true };
  });
  const original = S.demoSong(1000);
  const stages = [];
  const out = await H.edit({
    song: S.demoSong(1000), text: "make it breathe", ask,
    focus: { screen: "drums", pattern: 0 }, onStage: (s) => stages.push(s),
  });
  assert.equal(out.draft, false);
  assert.equal(out.reply, "A little more room for the bass.");
  assert.equal(S.validate(out.song).error, undefined);
  assert.equal(out.song.tracks.find((t) => t.id === "bass").vol, 0.8);
  assert.equal(out.ops.length, 1);
  assert.equal(out.ops[0].op, "setTrackVolume");

  assert.deepEqual(stages.map((s) => s.id), ["read", "edit", "edit", "check"]);
  assert.equal(stages[1].vars.turn, 2);
  assert.match(ask.seen[1].messages.at(-1).content, /RESULTS\n1 read A: /);
  assert.match(ask.seen[2].messages.at(-1).content, /RESULTS\n1 ok\n\nContinue\./);

  const replay = E.apply(original, out.ops);
  assert.equal(replay.error, undefined);
  assert.deepEqual(plain(replay.song), plain(out.song));
});

test("edit: a failing call is reported back and the fixed turn lands", async () => {
  let turn = 0;
  const { ask, original, job } = makeEdit((step, messages) => {
    turn++;
    if (turn === 1) return { calls: [{ tool: "groove", pattern: 0, style: "jazzz" }], done: false };
    assert.ok(messages.some((m) => m.role === "user" && /Fix the failed calls\./.test(m.content)));
    return { reply: "That groove does not exist; here is a ghost instead.", calls: [{ tool: "ghost", pattern: 0, amount: 1 }], done: true };
  });
  const out = await job;
  assert.equal(out.reply, "That groove does not exist; here is a ghost instead.");
  assert.equal(S.validate(out.song).error, undefined);
  assert.match(ask.seen[1].messages.at(-1).content, /RESULTS\n1 error: groove: unknown style 'jazzz'/);
  assert.match(ask.seen[1].messages.at(-1).content, /Fix the failed calls\./);
  const replay = E.apply(original, out.ops);
  assert.deepEqual(plain(replay.song), plain(out.song));
});

test("edit: after MAX_TURNS turns the successful ops are returned with no reply", async () => {
  const ask = makeAsk(() => ({ calls: [{ tool: "mix", track: "bass", vol: 0.8 }], done: false }));
  const out = await H.edit({ song: S.demoSong(1000), text: "keep going", ask });
  assert.equal(ask.seen.length, H.MAX_TURNS);
  assert.equal(out.reply, "");
  assert.equal(out.draft, false);
  assert.equal(out.song.tracks.find((t) => t.id === "bass").vol, 0.8);
  assert.equal(S.validate(out.song).error, undefined);
  assert.equal(out.ops.length, H.MAX_TURNS, "every successful call is kept");
});

test("skeleton: the plan may take another card and another scale for a named mood", async () => {
  const plan = { ...planFor(), card: 2, scale: "dorian" };
  const ask = makeAsk(fullAnswers(plan));
  const out = await H.skeleton({ text: "a rainy night song", ask, rand: ST.seeded(5), now: 1000 });
  const planUser = ask.seen[0].messages.find((m) => m.role === "user").content;
  assert.match(planUser, /CARD 1: [\s\S]*CARD 2: [\s\S]*CARD 3: /);
  const ids = [...planUser.matchAll(/CARD \d+: ([^.]+)\./g)].map((m) => m[1]);
  assert.equal(ids.length, ST.CARDS.length, "every card is offered");
  assert.equal(new Set(ids).size, ids.length, "each card once");
  assert.equal(out.card.en, ids[1]);
  assert.equal(out.song.scale, "dorian");
  const bad = makeAsk((step, messages) => (step === "plan" ? (messages.length > 2 ? planFor() : { ...planFor(), card: 99 }) : fullAnswers(planFor())(step, messages)));
  await H.skeleton({ text: "x", ask: bad, rand: ST.seeded(5), now: 1000 });
  assert.match(bad.seen[1].messages.at(-1).content, new RegExp("card must be 1-" + ST.CARDS.length));
});

test("skeleton: a section may write its own drums and strum its chords as stabs", async () => {
  const plan = planFor();
  plan.sections[1] = { ...plan.sections[1], groove: undefined, drums: { kick: [[0, 0.9], [8, 0.85]], snare: [[4, 0.8], [12, 0.8]] }, strum: "stabs", bass: "boom" };
  delete plan.sections[1].groove;
  const out = await H.skeleton({ text: "x", ask: makeAsk(fullAnswers(plan)), rand: ST.seeded(3), now: 1000 });
  const verse = out.song.patterns[1].notes;   // intro is pattern 0, the verse starts at 1
  assert.deepEqual(plain(verse.drums.filter((n) => n.key === "kick").map((n) => n.t / S.STEP)), [0, 8]);
  assert.deepEqual(plain(verse.chords.filter((n) => n.vel > 0).map((n) => n.t / S.STEP)), [4, 12]);
  const bad = planFor();
  bad.sections[1] = { ...bad.sections[1], drums: { kick: [[20, 1]] }, strum: "strum" };
  delete bad.sections[1].groove;
  const ask = makeAsk((step, messages) => (step === "plan" ? (messages.length > 2 ? planFor() : bad) : fullAnswers(planFor())(step, messages)));
  await H.skeleton({ text: "x", ask, rand: ST.seeded(3), now: 1000 });
  assert.match(ask.seen[1].messages.at(-1).content, /steps must be 0-15/);
});

test("skeleton: the plan picks the sound, typed and borrowed chords and its own bass; melodies may leave the scale", async () => {
  const plan = { ...planFor(), key: 2, scale: "major", kit: "rock", voices: { chords: "guitar", melody: "bowed" } };
  plan.sections = plan.sections.map((s) => ({ ...s }));
  plan.sections[1].chords = [0, { root: 5, acc: 1, q: "maj" }, { root: 3, q: "m7" }, { root: 4, q: "sus4" }];
  plan.sections[1].bass = [[0, 0.9, "root"], [6, 0.6, "third"], [8, 0.8, "fifth"]];
  const answers = fullAnswers(plan);
  const ask = makeAsk((step, messages) => (step === "melody" ? { bars: melodyBars(messages).bars.map((b) => [[0, 2, 0.8, 1, "slide"], ...b.slice(1)]) } : answers(step, messages)));
  const out = await H.skeleton({ text: "x", ask, rand: ST.seeded(4), now: 1000 });
  const song = out.song;
  assert.equal(song.key, 2);
  assert.equal(song.kit, "rock");
  assert.equal(S.voiceOf(song, "chords"), "guitar");
  assert.equal(S.voiceOf(song, "melody"), "bowed");
  const verse2 = song.patterns[2].notes;            // intro is 0, the verse's second bar is 2
  const ch = verse2.chords.find((n) => n.vel > 0);
  assert.equal(ch.acc, 1);
  assert.equal(ch.q, "maj");
  assert.equal(S.chordName(song, ch.deg, ch.q, ch.acc).name, "C", "bVII of D major is C");
  const bass0 = verse2.bass.find((n) => n.t === 0);
  assert.equal(S.noteMidi(song, "bass", bass0.deg, bass0.acc) % 12, 0, "the bass plays the borrowed chord's root, C");
  assert.ok(song.patterns[1].notes.melody.some((n) => n.acc === 1 && n.orn === "slide"));
  const melodyUser = ask.seen.find((s) => s.step === "melody").messages.find((m) => m.role === "user").content;
  assert.match(melodyUser, /bar 2: chord C, chord tones/);
});

test("wantsNewSong: words of making a song, or a fresh tape, start a new song; edits stay edits", () => {
  const fresh = S.newSong(0), demo = S.demoSong(0);
  for (const t of ["写一个俄罗斯风格的曲子", "来个骨架", "做一首中国风的歌", "write me a sad song", "an upbeat tune for a walk", "compose something"])
    assert.equal(H.wantsNewSong(t, demo), true, t);
  for (const t of ["副歌的军鼓加点 ghost note", "把 B 段的旋律去掉", "make it faster", "整首更欢快一点"])
    assert.equal(H.wantsNewSong(t, demo), false, t);
  assert.equal(H.wantsNewSong("俄罗斯风格", fresh), true, "a fresh tape with a style word becomes a new song");
  assert.equal(H.wantsNewSong("更快一点", fresh), false);
});

test("the edit prompt names the scale's own chords so a model does not guess Cm in A minor", () => {
  const song = JSON.parse(JSON.stringify(S.newSong(0)));
  song.key = 9; song.scale = "minor";
  const text = ctx.LopdaStudioPrompts.chordTable(song);
  assert.match(text, /0 = Am, 1 = Bdim, 2 = C, 3 = Dm, 4 = Em, 5 = F/);
});
