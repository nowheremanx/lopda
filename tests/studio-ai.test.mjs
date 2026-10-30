// runtime/studio-ai.js: the system prompt, the compact project state and the one-JSON answer (docs/design/studio.md 12.16).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { runScript, read } from "./helpers.mjs";

const ctx = runScript("runtime/studio-song.js");
vm.runInContext(read("runtime/studio-ai.js"), ctx, { filename: "runtime/studio-ai.js" });
const S = ctx.LopdaSong, A = ctx.LopdaStudioAI;
const song = S.demoSong(1000);
const plain = (v) => JSON.parse(JSON.stringify(v));

test("summary: the settings, the chain, the used patterns and the focus", () => {
  const s = A.summary(song, { screen: "bass", pattern: 2, slot: 5 });
  assert.equal(s.bpm, 78);
  assert.equal(s.key, "A");
  assert.equal(s.scale, "dorian");
  assert.equal(s.swing, 0.62);
  assert.deepEqual(plain(s.song), plain(song.song));
  assert.equal(s.focus.screen, "bass");
  assert.equal(s.focus.pattern, 2);
  const used = new Set(song.song);
  for (const p of s.patterns) assert.ok(used.has(p.p) || p.p === 2, `pattern ${p.p} is referenced`);
  assert.ok(s.patterns.length <= 9, "unused patterns are left out");
  assert.ok(Array.isArray(s.patterns[0].drums));
  assert.ok(s.tracks.some((t) => t.id === "drums" && t.vol === 1));
});

test("messages: one system prompt and a user message with the state and the request", () => {
  const m = A.messages(song, { screen: "drums", pattern: 0 }, "把鼓做得更轻一点");
  assert.equal(m.length, 2);
  assert.equal(m[0].role, "system");
  assert.match(m[0].content, /ONE JSON object/);
  assert.match(m[0].content, /setTrackVolume/);
  assert.match(m[0].content, /draft/);
  assert.equal(m[1].role, "user");
  assert.match(m[1].content, /CURRENT PROJECT/);
  assert.match(m[1].content, /把鼓做得更轻一点/);
  assert.match(m[1].content, /"bpm":78/);
});

test("parse: an ops answer, even inside a code fence with a sentence around it", () => {
  const r = A.parse('Sure:\n```json\n{"reply":"已加快","ops":[{"op":"bpm","delta":4}]}\n```', 2000);
  assert.equal(r.error, undefined);
  assert.equal(r.reply, "已加快");
  assert.deepEqual(plain(r.ops), [{ op: "bpm", delta: 4 }]);
  assert.equal(r.draft, undefined);
});

test("parse: a draft becomes a validated replaceSong", () => {
  const draft = {
    name: "Rainy", bpm: 92, key: 9, scale: "minor", swing: 0.55, tape: 2, kit: "soft",
    patterns: [
      { drums: [[0, "kick", 1], [4, "snare", 0.9], [8, "kick", 0.8]], bass: [[0, 0, 0.8], [8, 5, 0.7]], chords: [[0, 0, 0.65]], melody: [[4, 4, 0.6]] },
      { drums: [[0, "kick", 1], [4, "snare", 0.9]], bass: [[0, 5, 0.8]], chords: [[0, 5, 0.65]], melody: [] },
    ],
    song: [0, 1, 0, 1],
  };
  const r = A.parse(JSON.stringify({ reply: "写好了", draft }), 2000);
  assert.equal(r.error, undefined);
  assert.equal(r.draft, true);
  assert.equal(r.reply, "写好了");
  assert.equal(r.ops.length, 1);
  assert.equal(r.ops[0].op, "replaceSong");
  assert.equal(r.ops[0].song.name, "Rainy");
  assert.equal(r.ops[0].song.song.length, 4);
  assert.equal(S.validate(r.ops[0].song).error, undefined);
  assert.equal(r.ops[0].song.patterns[0].notes.bass[0].len, 8 * S.STEP, "the draft builder ties notes");
});

test("parse: malformed answers are refused with a word", () => {
  assert.equal(A.parse("not json").error, "shape");
  assert.equal(A.parse('{"reply":"x"}').error, "shape");
  assert.equal(A.parse('{"reply":"x","ops":[],"draft":{}}').error, "shape");
  assert.equal(A.parse('{"reply":"x","ops":[{"op":"bad"}]}').error, undefined, "shape is for the edit layer; ops are not checked here");
  assert.equal(A.parse('{"reply":"x","ops":' + JSON.stringify(new Array(65).fill({ op: "bpm", delta: 1 })) + "}").error, "shape");
  assert.equal(A.parse(JSON.stringify({ reply: "x", draft: { bpm: 999 } })).error, "draft");
  assert.equal(A.parse(JSON.stringify({ reply: "x", draft: { bpm: 90, patterns: [{ drums: [[99, "kick", 1]] }] } })).error, "draft");
});
