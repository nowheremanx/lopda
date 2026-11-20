// runtime/inflate.js: pure-JS RFC 1951 and 1952 fallback, checked against node:zlib.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import zlib from "node:zlib";
import { ROOT, runScript } from "./helpers.mjs";

const ctx = runScript("runtime/inflate.js", { Blob, Response, Promise, Uint8Array });
const I = ctx.LopdaInflate;
const bytes = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);

function samples() {
  const random = randomBytes(100 * 1024);
  const seed = randomBytes(32768);
  for (let i = 0; i < seed.length; i++) seed[i] = 32 + (seed[i] % 95);
  const long = Buffer.alloc(1024 * 1024);
  for (let i = 0; i < long.length; i++) long[i] = seed[i % seed.length];
  return [
    ["empty", Buffer.alloc(0)], ["one byte", Buffer.from([0x7f])], ["random", random],
    ["long matches at distance 32768", long], ["UTF-8 Chinese", Buffer.from("春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。".repeat(1000))],
  ];
}

test("raw deflate and gzip round trips across levels and data shapes", () => {
  for (const [name, data] of samples()) {
    for (const level of [0, 1, 6, 9]) {
      const raw = zlib.deflateRawSync(data, { level });
      assert.deepEqual(bytes(I.inflateRaw(raw)), data, `${name}, raw level ${level}`);
      const gz = zlib.gzipSync(data, { level });
      assert.deepEqual(bytes(I.gunzip(gz)), data, `${name}, gzip level ${level}`);
    }
  }
});

test("built-in ECDICT gzip files decode to the zlib output; dictzip is fast", () => {
  const dir = join(ROOT, "runtime/vendor/ecdict");
  for (const name of ["ecdict.dict.dz", "ecdict.words.gz", "ecdict.lemma.gz"]) {
    const source = readFileSync(join(dir, name));
    const expected = zlib.gunzipSync(source);
    const before = performance.now();
    const actual = bytes(I.gunzip(source));
    const elapsed = performance.now() - before;
    assert.deepEqual(actual, expected, name);
    if (name === "ecdict.dict.dz") assert.ok(elapsed < 2000, `dictzip took ${elapsed.toFixed(1)} ms`);
  }
});

test("concatenated gzip members are joined", () => {
  const a = Buffer.from("first member 你好"), b = Buffer.from("second member"), c = Buffer.alloc(0);
  const joined = Buffer.concat([zlib.gzipSync(a), zlib.gzipSync(b), zlib.gzipSync(c)]);
  assert.deepEqual(bytes(I.gunzip(joined)), Buffer.concat([a, b, c]));
});

test("gzip optional header fields are skipped", () => {
  const plain = Buffer.from("optional fields"), gz = zlib.gzipSync(plain);
  const extra = Buffer.from([0x52, 0x41, 1, 0, 0, 0]);
  const header = Buffer.from(gz.subarray(0, 10));
  header[3] = 4 | 8 | 16 | 2;
  const fields = Buffer.concat([Buffer.from([extra.length, 0]), extra, Buffer.from("name\0comment\0"), Buffer.from([0x34, 0x12])]);
  const member = Buffer.concat([header, fields, gz.subarray(10)]);
  assert.deepEqual(bytes(I.gunzip(member)), plain);
});

test("corrupt and truncated streams throw", () => {
  assert.throws(() => I.inflateRaw(Uint8Array.from([7])), /block type/);
  assert.throws(() => I.inflateRaw(zlib.deflateRawSync(Buffer.from("truncated stream")).subarray(0, 1)));
  assert.throws(() => I.gunzip(Buffer.from("not gzip")), /bad gzip magic/);
  const gz = zlib.gzipSync(Buffer.from("size check"));
  const badSize = Buffer.from(gz); badSize[badSize.length - 1] ^= 1;
  assert.throws(() => I.gunzip(badSize), /size mismatch/);
  assert.throws(() => I.gunzip(gz.subarray(0, gz.length - 4)), /truncated/);
});

test("raw() and gzip() use the JavaScript path without DecompressionStream", async () => {
  const noStream = runScript("runtime/inflate.js", { Blob, Response, Promise, Uint8Array });
  assert.equal("DecompressionStream" in noStream, false);
  const api = noStream.LopdaInflate, input = Buffer.from("fallback data 你好 ".repeat(100));
  const raw = await api.raw(zlib.deflateRawSync(input));
  const gzip = await api.gzip(zlib.gzipSync(input));
  assert.deepEqual(bytes(raw), input);
  assert.deepEqual(bytes(gzip), input);
});

test("raw() falls back to JavaScript when DecompressionStream lacks the format", async () => {
  /* some engines have the API but not "deflate-raw": the constructor throws */
  function DecompressionStream(format) { if (format === "deflate-raw") throw new TypeError("unsupported"); }
  const partial = runScript("runtime/inflate.js", { Blob, Response, Promise, Uint8Array, DecompressionStream });
  const input = Buffer.from("partial support ".repeat(50));
  assert.deepEqual(bytes(await partial.LopdaInflate.raw(zlib.deflateRawSync(input))), input);
});
