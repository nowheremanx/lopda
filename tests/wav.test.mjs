// runtime/wav.js: the tape machine's mono 16-bit WAV writer (docs/design/studio.md section 12.14).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const W = runScript("runtime/wav.js").LopdaWav;
const text = (bytes, at, n) => String.fromCharCode(...bytes.slice(at, at + n));
const u32 = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, true);
const u16 = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(at, true);
const i16 = (bytes, at) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt16(at, true);

test("encode: a canonical 44-byte mono 16-bit RIFF header", () => {
  const bytes = W.encode(new Float32Array([0, 0.5, -0.5, 1, -1]), 22050);
  assert.equal(W.HEADER, 44);
  assert.equal(bytes.length, 44 + 5 * 2);
  assert.equal(text(bytes, 0, 4), "RIFF");
  assert.equal(u32(bytes, 4), 36 + 5 * 2);
  assert.equal(text(bytes, 8, 4), "WAVE");
  assert.equal(text(bytes, 12, 4), "fmt ");
  assert.equal(u32(bytes, 16), 16);
  assert.equal(u16(bytes, 20), 1, "PCM");
  assert.equal(u16(bytes, 22), 1, "mono");
  assert.equal(u32(bytes, 24), 22050);
  assert.equal(u32(bytes, 28), 22050 * 2, "byte rate");
  assert.equal(u16(bytes, 32), 2, "block align");
  assert.equal(u16(bytes, 34), 16, "bits");
  assert.equal(text(bytes, 36, 4), "data");
  assert.equal(u32(bytes, 40), 5 * 2);
});

test("encode: samples become little-endian 16-bit, with the asymmetric ends and clamping", () => {
  const bytes = W.encode([0, 0.5, -0.5, 1, -1, 2, -2], 22050);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((i) => i16(bytes, 44 + i * 2)),
    [0, 16384, -16384, 32767, -32768, 32767, -32768]);
});

test("encode: empty, odd and damaged input still makes a valid file", () => {
  const empty = W.encode(new Float32Array(0), 22050);
  assert.equal(empty.length, 44);
  assert.equal(u32(empty, 40), 0);
  const odd = W.encode([0.25, NaN, Infinity, "x"], 16000);
  assert.equal(odd.length, 44 + 8);
  assert.deepEqual([0, 1, 2, 3].map((i) => i16(odd, 44 + i * 2)), [8192, 0, 0, 0]);
  assert.equal(u32(odd, 24), 16000);
});
