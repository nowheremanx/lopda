// runtime/studio-command.js: the phrases that do not need a model (docs/design/studio.md 12.16).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const C = runScript("runtime/studio-command.js").LopdaStudioCommand;
const plain = (v) => JSON.parse(JSON.stringify(v));
const ops = (text, focus) => {
  const r = C.parse(text, focus);
  return r && Object.assign({}, r, { ops: plain(r.ops) });
};

test("parse: tempo, faster and slower", () => {
  assert.deepEqual(ops("节奏更快点").ops, [{ op: "bpm", delta: 4 }]);
  assert.deepEqual(ops("慢一点").ops, [{ op: "bpm", delta: -4 }]);
  assert.deepEqual(ops("100 BPM").ops, [{ op: "setBpm", value: 100 }]);
  assert.deepEqual(ops("bpm 128").ops, [{ op: "setBpm", value: 128 }]);
});

test("parse: swing, and the note that swing is global", () => {
  const r = ops("AB段要更摇摆一点");
  assert.deepEqual(r.ops, [{ op: "swing", delta: 0.02 }]);
  assert.equal(r.note, "swing-global");
  assert.deepEqual(ops("直一点").ops, [{ op: "swing", delta: -0.02 }]);
  assert.equal(ops("swing"), null);
});

test("parse: track volume and mute in both languages", () => {
  assert.deepEqual(ops("贝斯小一点").ops, [{ op: "trackVol", track: "bass", delta: -0.1 }]);
  assert.deepEqual(ops("鼓大声点").ops, [{ op: "trackVol", track: "drums", delta: 0.1 }]);
  assert.deepEqual(ops("静音贝斯").ops, [{ op: "setTrackMute", track: "bass", mute: true }]);
  assert.deepEqual(ops("取消静音贝斯").ops, [{ op: "setTrackMute", track: "bass", mute: false }]);
  assert.deepEqual(ops("mute melody").ops, [{ op: "setTrackMute", track: "melody", mute: true }]);
});

test("parse: copy, clear by letter and clear the current pattern", () => {
  assert.deepEqual(ops("把 A 复制到 B").ops, [{ op: "copyPattern", from: 0, to: 1 }]);
  assert.deepEqual(ops("清空B段旋律").ops, [{ op: "clearTrack", pattern: 1, track: "melody" }]);
  assert.deepEqual(ops("清空贝斯", { pattern: 3 }).ops, [{ op: "clearTrack", pattern: 3, track: "bass" }]);
  assert.deepEqual(ops("clear the drums in pattern C").ops, [{ op: "clearTrack", pattern: 2, track: "drums" }]);
});

test("parse: tape colour, keys and scales", () => {
  assert.deepEqual(ops("磁带味重一点").ops, [{ op: "tape", delta: 1 }]);
  assert.deepEqual(ops("干净一点").ops, [{ op: "tape", delta: -1 }]);
  assert.deepEqual(ops("换成 C 大调").ops, [{ op: "setKey", value: 0 }, { op: "setScale", value: "major" }]);
  assert.deepEqual(ops("A 小调").ops, [{ op: "setKey", value: 9 }, { op: "setScale", value: "minor" }]);
  assert.deepEqual(ops("C 小调五声").ops, [{ op: "setKey", value: 0 }, { op: "setScale", value: "minor-penta" }]);
  assert.deepEqual(ops("多利亚").ops, [{ op: "setScale", value: "dorian" }]);
});

test("parse: a sentence with several clear moves becomes several ops", () => {
  const r = ops("C 大调，100 BPM，再摇摆一点，贝斯小一点");
  assert.deepEqual(r.ops.map((o) => o.op), ["trackVol", "setBpm", "swing", "setKey", "setScale"]);
});

test("parse: a per-section ask is left for the model, not applied to every bar", () => {
  assert.equal(ops("副歌鼓轻一点"), null);
  assert.equal(ops("A段贝斯小一点"), null);
  assert.deepEqual(ops("AB段更摇摆").ops, [{ op: "swing", delta: 0.02 }]);
  assert.deepEqual(ops("清空B段旋律").ops, [{ op: "clearTrack", pattern: 1, track: "melody" }]);
});

test("parse: unrelated text is not a command", () => {
  assert.equal(ops("今天天气不错"), null);
  assert.equal(ops(""), null);
  assert.equal(ops(null), null);
});
