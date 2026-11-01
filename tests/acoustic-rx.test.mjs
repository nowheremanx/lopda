// runtime/acoustic-rx.js: the incremental receiver, fed blocks of synthesised frames.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const AC = require("../runtime/acoustic.js");
const L = require("../runtime/acoustic-link.js");
const RX = require("../runtime/acoustic-rx.js");

/* A deterministic LCG stream: a CPU guard that reruns must behave the same. */
function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function noisy(samples, random, amp) {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < out.length; i++) out[i] = samples[i] + (random() - 0.5) * amp;
  return out;
}

function pushBlocks(rx, samples, t0 = 0, block = 4096) {
  for (let i = 0; i < samples.length; i += block) {
    rx.push(samples.subarray(i, Math.min(samples.length, i + block)), t0 + i);
  }
}

function dataFrame(payload, seq = 1) {
  return L.encode(L.TYPES.DATA, 0x1234, seq, 0, payload, false);
}

test("one frame decodes at each rate, 48 kHz and 44.1 kHz", () => {
  for (const sampleRate of [48000, 44100]) {
    for (const symbolMs of [10, 20, 40]) {
      const bytes = dataFrame([1, 2, 3, 4, 0xA5, 0x5A, 0x00, 0xFF]);
      const samples = AC.synth(bytes, { sampleRate, symbolMs });
      const rx = RX.create({ sampleRate, rates: [10, 20, 40] });
      pushBlocks(rx, samples);
      const frames = rx.frames();
      assert.equal(frames.length, 1, `${sampleRate} Hz ${symbolMs} ms`);
      assert.equal(frames[0].rate, symbolMs, `${sampleRate} Hz ${symbolMs} ms rate`);
      assert.deepEqual(frames[0].bytes, bytes, `${sampleRate} Hz ${symbolMs} ms bytes`);
      assert.ok(frames[0].endSample > frames[0].startSample);
    }
  }
});

test("two frames back to back both come out once, in order", () => {
  const sampleRate = 48000;
  for (const [firstMs, secondMs] of [[20, 20], [20, 10], [40, 10]]) {
    const first = dataFrame([1, 2, 3], 1);
    const second = dataFrame([9, 8, 7, 6, 5], 2);
    const s1 = AC.synth(first, { sampleRate, symbolMs: firstMs });
    const s2 = AC.synth(second, { sampleRate, symbolMs: secondMs });
    const all = new Float32Array(s1.length + s2.length);
    all.set(s1, 0);
    all.set(s2, s1.length);
    const rx = RX.create({ sampleRate, rates: [10, 20, 40] });
    pushBlocks(rx, all);
    const frames = rx.frames();
    assert.equal(frames.length, 2, `${firstMs}/${secondMs} ms`);
    assert.deepEqual(frames[0].bytes, first);
    assert.deepEqual(frames[1].bytes, second);
    assert.ok(frames[0].startSample < frames[1].startSample);
    assert.equal(frames[0].rate, firstMs);
    assert.equal(frames[1].rate, secondMs);
  }
});

test("truly back to back frames (tailMs 0, then leadMs 0) both decode", () => {
  const sampleRate = 48000;
  for (const [firstMs, secondMs] of [[20, 20], [20, 10], [40, 10]]) {
    const first = dataFrame([1, 2, 3], 1);
    const second = dataFrame([9, 8, 7, 6, 5], 2);
    const s1 = AC.synth(first, { sampleRate, symbolMs: firstMs, tailMs: 0 });
    const s2 = AC.synth(second, { sampleRate, symbolMs: secondMs, leadMs: 0 });
    const all = new Float32Array(s1.length + s2.length);
    all.set(s1, 0);
    all.set(s2, s1.length);
    const rx = RX.create({ sampleRate, rates: [10, 20, 40] });
    pushBlocks(rx, all);
    const frames = rx.frames();
    assert.equal(frames.length, 2, `${firstMs}/${secondMs} ms`);
    assert.deepEqual(frames[0].bytes, first);
    assert.deepEqual(frames[1].bytes, second);
    assert.ok(frames[0].endSample <= frames[1].startSample);
  }
});

test("a real frame during a false frame's declared payload preempts it", () => {
  const sampleRate = 48000;
  /* version 2, DATA, a header that claims all 60 payload bytes, then only four of them. */
  const fake = [2, 3, 0x12, 0x34, 0, 1, 0, 0, 60, 1, 2, 3, 4];
  const real = dataFrame([0xDE, 0xAD, 0xBE, 0xEF], 2);
  for (const symbolMs of [10, 20, 40]) {
    const s1 = AC.synth(fake, { sampleRate, symbolMs, tailMs: 0 });
    const s2 = AC.synth(real, { sampleRate, symbolMs, leadMs: 0 });
    const all = new Float32Array(s1.length + s2.length);
    all.set(s1, 0);
    all.set(s2, s1.length);
    const rx = RX.create({ sampleRate, rates: [10, 20, 40] });
    pushBlocks(rx, all);
    const frames = rx.frames();
    assert.equal(frames.length, 1, `${symbolMs} ms`);
    assert.deepEqual(frames[0].bytes, real);
    assert.equal(frames[0].rate, symbolMs);
  }
});

test("a frame inside low-level noise still decodes; pure noise invents nothing", () => {
  const sampleRate = 48000;
  const random = prng(0xC0FFEE);
  const bytes = dataFrame([0xDE, 0xAD, 0xBE, 0xEF, 1, 2, 3, 4]);
  for (const symbolMs of [10, 20, 40]) {
    const samples = noisy(AC.synth(bytes, { sampleRate, symbolMs }), random, 0.05);
    const rx = RX.create({ sampleRate, rates: [10, 20, 40] });
    pushBlocks(rx, samples);
    const frames = rx.frames();
    assert.equal(frames.length, 1, `${symbolMs} ms in noise`);
    assert.deepEqual(frames[0].bytes, bytes);
  }

  const noise = RX.create({ sampleRate, rates: [10, 20, 40] });
  const seconds = 5;
  let at = 0;
  while (at < sampleRate * seconds) {
    const n = Math.min(4096, sampleRate * seconds - at);
    const block = new Float32Array(n);
    for (let i = 0; i < n; i++) block[i] = (random() - 0.5) * 0.1;
    noise.push(block, at);
    at += n;
  }
  assert.deepEqual(noise.frames(), []);
});

test("a muted span hides a frame; the same frame decodes once unmuted", () => {
  const sampleRate = 48000;
  const bytes = dataFrame([7, 7, 7, 7]);
  const samples = AC.synth(bytes, { sampleRate, symbolMs: 20 });
  const rx = RX.create({ sampleRate, rates: [10, 20, 40] });

  rx.mute(0, samples.length);
  pushBlocks(rx, samples, 0);
  assert.deepEqual(rx.frames(), []);

  pushBlocks(rx, samples, sampleRate * 5);
  const frames = rx.frames();
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0].bytes, bytes);
});

test("muting a span already fed wipes its grid and blocks the frame", () => {
  const sampleRate = 48000, symbolMs = 20;
  const bytes = dataFrame([1, 2, 3]);
  const samples = AC.synth(bytes, { sampleRate, symbolMs, leadMs: 0, tailMs: 0 });
  const preambleEnd = Math.round(16 * sampleRate * symbolMs / 1000);
  const rx = RX.create({ sampleRate, rates: [10, 20, 40] });
  rx.push(samples.subarray(0, preambleEnd), 0);
  rx.mute(0, preambleEnd);
  rx.push(samples.subarray(preambleEnd), preambleEnd);
  assert.deepEqual(rx.frames(), []);
});

test("a frame split over odd block boundaries decodes", () => {
  const sampleRate = 44100;
  const bytes = dataFrame([3, 1, 4, 1, 5, 9, 2, 6]);
  const samples = AC.synth(bytes, { sampleRate, symbolMs: 20 });
  const sizes = [1000, 333, 2048, 17, 5000];
  const rx = RX.create({ sampleRate, rates: [10, 20, 40] });
  let at = 0, k = 0;
  while (at < samples.length) {
    const n = Math.min(sizes[k++ % sizes.length], samples.length - at);
    rx.push(samples.subarray(at, at + n), at);
    at += n;
  }
  const frames = rx.frames();
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0].bytes, bytes);
});

test("a gap in t0 neither crashes nor hides a later frame", () => {
  const sampleRate = 48000;
  const bytes = dataFrame([2, 4, 6, 8]);
  const samples = AC.synth(bytes, { sampleRate, symbolMs: 20 });
  const rx = RX.create({ sampleRate, rates: [10, 20, 40] });

  pushBlocks(rx, new Float32Array(1000), 0);
  rx.push(samples.subarray(0, 500), 400); // overlap: the receiver drops what it has seen
  pushBlocks(rx, samples, sampleRate * 30); // a 30 s jump resets the receiver
  const frames = rx.frames();
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0].bytes, bytes);
  assert.ok(frames[0].startSample >= sampleRate * 30);

  pushBlocks(rx, samples, sampleRate * 33);
  const more = rx.frames();
  assert.equal(more.length, 1);
  assert.deepEqual(more[0].bytes, bytes);
});

test("a backward jump larger than the ring resets the receiver", () => {
  const sampleRate = 48000;
  const bytes = dataFrame([4, 3, 2, 1]);
  const samples = AC.synth(bytes, { sampleRate, symbolMs: 20 });
  const rx = RX.create({ sampleRate, rates: [10, 20, 40] });
  pushBlocks(rx, new Float32Array(1000), sampleRate * 10);
  pushBlocks(rx, samples, 0);
  const frames = rx.frames();
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0].bytes, bytes);
});

test("CPU guard: 60 s of noise at 48 kHz stays far below the wall clock", () => {
  const sampleRate = 48000, seconds = 60;
  const random = prng(123456789);
  const rx = RX.create({ sampleRate, rates: [10, 20, 40] });
  const started = Date.now();
  let at = 0;
  while (at < sampleRate * seconds) {
    const n = Math.min(4096, sampleRate * seconds - at);
    const block = new Float32Array(n);
    for (let i = 0; i < n; i++) block[i] = (random() - 0.5) * 0.1;
    rx.push(block, at);
    at += n;
  }
  const elapsed = Date.now() - started;
  console.log(`acoustic-rx CPU guard: ${elapsed} ms for 60 s of 48 kHz noise`);
  assert.ok(elapsed < 20000, `${elapsed} ms`);
  assert.deepEqual(rx.frames(), []);
});
