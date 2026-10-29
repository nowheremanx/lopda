// runtime/acoustic.js: 4-FSK symbol mapping, synth and known-sequence decode (M2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AC = require("../runtime/acoustic.js");

function noisy(samples, amount) {
  const out = new Float32Array(samples);
  for (let i = 0; i < out.length; i++) out[i] += (Math.random() - 0.5) * amount;
  return out;
}

test("four tones and a 16-symbol preamble", () => {
  assert.deepEqual(AC.TONES, [1500, 2500, 3500, 4500]);
  assert.equal(AC.PREAMBLE.length, 16);
  assert.deepEqual([...new Set(AC.PREAMBLE)].sort(), [0, 1, 2, 3]);
});

test("a byte is four symbols, MSB pair first", () => {
  assert.deepEqual(AC.bytesToSymbols([0xB4]), [2, 3, 1, 0]);
  assert.deepEqual(AC.bytesToSymbols([0x00, 0xFF]), [0, 0, 0, 0, 3, 3, 3, 3]);
  assert.deepEqual(AC.symbolsToBytes([2, 3, 1, 0]), [0xB4]);
  assert.deepEqual(AC.symbolsToBytes([2, -1, 1, 0]), [null]);
  assert.equal(AC.hex([0x00, 0xA5, 0xFF]), "00 A5 FF");
});

test("known bytes round-trip at every M2 rate, 48 kHz and 44.1 kHz", () => {
  for (const sampleRate of [48000, 44100]) {
    for (const symbolMs of AC.RATES) {
      const bytes = AC.testBytes("a5");
      const samples = AC.synth(bytes, { sampleRate, symbolMs });
      const result = AC.decode(samples, { sampleRate, symbolMs, expectedBytes: bytes });
      assert.equal(result.ok, true, `${sampleRate} Hz ${symbolMs} ms: ${result.reason}`);
      assert.equal(result.sync.ok, true, `${sampleRate} Hz ${symbolMs} ms sync`);
      assert.equal(result.sync.score, 16);
      assert.deepEqual(result.bytes, bytes);
      assert.equal(result.symbolErrors, 0);
      assert.equal(result.byteErrors, 0);
    }
  }
});

test("a noisy burst still decodes at 40 and 10 ms", () => {
  for (const symbolMs of [40, 10]) {
    const bytes = AC.testBytes("count");
    const samples = noisy(AC.synth(bytes, { sampleRate: 48000, symbolMs }), 0.012);
    const result = AC.decode(samples, { sampleRate: 48000, symbolMs, expectedBytes: bytes });
    assert.equal(result.ok, true, `${symbolMs} ms: ${result.reason}`);
    assert.deepEqual(result.bytes, bytes);
  }
});

test("silence and a short buffer do not invent a frame", () => {
  const bytes = AC.testBytes("random");
  const silence = new Float32Array(48000 * 4);
  const quiet = AC.decode(silence, { sampleRate: 48000, symbolMs: 40, expectedBytes: bytes });
  assert.equal(quiet.ok, false);
  assert.equal(quiet.sync.ok, false);

  const short = AC.decode(new Float32Array(1000), { sampleRate: 48000, symbolMs: 40, expectedBytes: bytes });
  assert.equal(short.ok, false);
  assert.equal(short.reason, "short");
});

test("a truncated burst reports no sync or errors, never a pass", () => {
  const bytes = AC.testBytes("a5");
  const samples = AC.synth(bytes, { sampleRate: 48000, symbolMs: 20 });
  const cut = samples.subarray(0, Math.floor(samples.length * 0.45));
  const result = AC.decode(cut, { sampleRate: 48000, symbolMs: 20, expectedBytes: bytes });
  assert.equal(result.ok, false);
});

test("the reported timing is the lead silence of the synthesised burst", () => {
  const bytes = AC.testBytes("a5");
  const samples = AC.synth(bytes, { sampleRate: 48000, symbolMs: 40, leadMs: 150 });
  const result = AC.decode(samples, { sampleRate: 48000, symbolMs: 40, expectedBytes: bytes });
  assert.ok(result.sync.ok);
  assert.ok(Math.abs(result.sync.offsetMs - 150) < 8, `offset ${result.sync.offsetMs}`);
});
