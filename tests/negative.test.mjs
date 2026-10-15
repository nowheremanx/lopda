// runtime/negative.js: the negative PNG and its lpDa chunk (docs/design/darkroom.md section 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { runScript } from "./helpers.mjs";

/* once with the platform's TextEncoder/TextDecoder, once with the ES5 fallback */
const N = runScript("runtime/negative.js", { TextEncoder, TextDecoder }).LopdaNegative;
const N5 = runScript("runtime/negative.js").LopdaNegative;
const plain = (v) => JSON.parse(JSON.stringify(v));

/* a real PNG: w x h, 8-bit greyscale, stored the way any encoder would */
function png(w = 4, h = 3) {
  const crcOf = (b) => N.crc32(b);
  const chunk = (type, data) => {
    const c = Buffer.alloc(12 + data.length);
    c.writeUInt32BE(data.length, 0); c.write(type, 4, "ascii"); data.copy(c, 8);
    c.writeUInt32BE(crcOf(c.subarray(4, 8 + data.length)), 8 + data.length);
    return c;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (x * 60) & 255;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
/* seeded bytes that look like a JPEG to the checks (FF D8 ... FF D9) and do not compress */
function jpeg(len, seed) {
  const b = new Uint8Array(len); let a = seed >>> 0;
  for (let i = 0; i < len; i++) { a = (a * 1664525 + 1013904223) >>> 0; b[i] = a >>> 24; }
  b[0] = 0xff; b[1] = 0xd8; b[len - 2] = 0xff; b[len - 1] = 0xd9;
  return b;
}
function roll({ size = 4, res = 1, name = "海边" } = {}) {
  const px = (k) => Array.from({ length: 128 * res * 112 * res }, (_, i) => String((i * 7 + k) % 4)).join("");
  return {
    id: "rmg7x2kq1a2b", no: 7, stock: "portrait", size, res, seed: 4000000000, loaded: 1791700000000, out: 1791800000000, name,
    frames: Array.from({ length: size }, (_, k) => k === size - 1
      ? { n: k + 1, px: "3".repeat(128 * res * 112 * res), taken: 1791790000000, blank: "light" }
      : { n: k + 1, px: px(k), taken: 1791710000000 + k, dated: k % 2 === 0, lens: ["uw", "w", "t", "f"][k % 4], exposure: (k % 7) - 3, contrast: 1 })
  };
}
const jpegsFor = (r, len = 3000) => r.frames.map((f, k) => f.blank ? null : jpeg(len + k, k + 1));
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return "no error"; };

function pngChunk(bytes, wanted) {
  for (let o = 8; o + 12 <= bytes.length;) {
    const len = Buffer.from(bytes).readUInt32BE(o), type = Buffer.from(bytes.subarray(o + 4, o + 8)).toString("ascii");
    if (type === wanted) return { start: o, data: o + 8, length: len, end: o + 12 + len };
    o += 12 + len;
  }
  return null;
}
function withLpDa(pngBytes, payload) {
  const source = Buffer.from(pngBytes), existing = pngChunk(source, "lpDa");
  const chunk = Buffer.alloc(12 + payload.length);
  chunk.writeUInt32BE(payload.length, 0); chunk.write("lpDa", 4, "ascii"); Buffer.from(payload).copy(chunk, 8);
  chunk.writeUInt32BE(N.crc32(chunk.subarray(4, 8 + payload.length)), 8 + payload.length);
  if (existing) return new Uint8Array(Buffer.concat([source.subarray(0, existing.start), chunk, source.subarray(existing.end)]));
  const iend = pngChunk(source, "IEND");
  return new Uint8Array(Buffer.concat([source.subarray(0, iend.start), chunk, source.subarray(iend.start)]));
}
function v1Negative(pngBytes, r, jpegs) {
  const latent = []; let jpegBytes = 0;
  jpegs.forEach((j) => {
    if (j && j.length) { latent.push([jpegBytes, j.length]); jpegBytes += j.length; }
    else latent.push(null);
  });
  const json = Buffer.from(JSON.stringify({ roll: r, latent }), "utf8");
  const data = Buffer.alloc(14 + json.length + jpegBytes + 4);
  Buffer.from(N.MAGIC, "ascii").copy(data, 0); data[9] = 1; data.writeUInt32BE(json.length, 10); json.copy(data, 14);
  let o = 14 + json.length;
  jpegs.forEach((j) => { if (j && j.length) { Buffer.from(j).copy(data, o); o += j.length; } });
  data.writeUInt32BE(N.crc32(data, 0, o), o);
  return withLpDa(pngBytes, data);
}

test("v2 round trip byte for byte: metadata, pixels and every JPEG", () => {
  for (const M of [N, N5]) {
    const r = roll(), j = jpegsFor(r), out = M.pack(png(), r, j);
    const back = M.unpack(out);
    assert.deepEqual(plain(back.roll), r);
    assert.equal(back.jpegs.length, j.length);
    back.jpegs.forEach((b, k) => { if (j[k] === null) assert.equal(b, null); else assert.ok(Buffer.from(b).equals(Buffer.from(j[k])), "jpeg " + k); });
  }
});

test("a v1 negative still reads with its original roll and JPEGs", () => {
  const r = roll(), j = jpegsFor(r), out = v1Negative(png(), r, j);
  const back = N.unpack(out);
  assert.deepEqual(plain(back.roll), r);
  back.jpegs.forEach((b, k) => {
    if (j[k] === null) assert.equal(b, null);
    else assert.ok(Buffer.from(b).equals(Buffer.from(j[k])), "jpeg " + k);
  });
});

test("v2 packs pixels four per byte, most significant bits first", () => {
  const r = roll({ size: 1 });
  r.frames[0].px = "0123" + r.frames[0].px.slice(4);
  const out = N.pack(png(), r, jpegsFor(r)), chunk = pngChunk(out, "lpDa");
  const jsonLength = Buffer.from(out).readUInt32BE(chunk.data + 10);
  assert.equal(out[chunk.data + 14 + jsonLength], 0x1b);
});

test("packing does not mutate the roll or its frames", () => {
  const r = roll(), original = r.frames[0].px;
  N.pack(png(), r, jpegsFor(r));
  assert.equal(r.frames[0].px, original);
});

test("the picture stays a valid PNG: the chunk sits right before IEND, every chunk CRC is right, the image data is untouched", () => {
  const src = png(), out = N.pack(src, roll(), jpegsFor(roll()));
  const list = [];
  for (let o = 8; o < out.length;) {
    const len = Buffer.from(out).readUInt32BE(o), type = Buffer.from(out.subarray(o + 4, o + 8)).toString("ascii");
    assert.equal(N.crc32(out.subarray(o + 4, o + 8 + len)), Buffer.from(out).readUInt32BE(o + 8 + len), type + " CRC");
    list.push(type); o += 12 + len;
  }
  assert.deepEqual(list, ["IHDR", "IDAT", "lpDa", "IEND"]);
  assert.ok(Buffer.from(out.subarray(0, src.length - 12)).equals(Buffer.from(src.subarray(0, src.length - 12))), "everything before IEND as it was");
  /* packing again replaces the chunk instead of adding a second one */
  const again = N.pack(out, roll({ name: "" }), jpegsFor(roll()));
  assert.equal(N.unpack(again).roll.name, "");
  assert.equal(Buffer.from(again).toString("latin1").split("lpDa").length - 1, 1);
});

test("CRC-32 matches the standard check value", () => {
  assert.equal(N.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("any one changed byte in the chunk is reported as damaged", () => {
  const r = roll(), out = N.pack(png(), r, jpegsFor(r));
  const at = Buffer.from(out).indexOf("lpDa", 0, "latin1");
  const len = Buffer.from(out).readUInt32BE(at - 4);
  /* the magic, the version, the JSON, a JPEG, the content CRC, the chunk CRC */
  for (const off of [4 + 2, 4 + 9, 4 + 20, 4 + len - 900, 4 + len - 2, 4 + len + 1]) {
    const bad = out.slice(); bad[at + off] ^= 0x10;
    assert.equal(code(() => N.unpack(bad)), "damaged", "byte at +" + off);
  }
  /* the content CRC alone also catches a change when the PNG CRC is made to fit */
  const bad = out.slice(); bad[at + 4 + 30] ^= 1;
  Buffer.from(bad.buffer).writeUInt32BE(N.crc32(bad.subarray(at, at + 4 + len)), at + 4 + len);
  assert.equal(code(() => N.unpack(bad)), "damaged");
  /* cut short, as a broken download would be */
  assert.equal(code(() => N.unpack(out.slice(0, out.length - 40))), "damaged");
});

test("not a negative: a PNG without the chunk, a JPEG, nothing", () => {
  assert.equal(code(() => N.unpack(png())), "notneg");
  assert.equal(code(() => N.unpack(jpeg(5000, 9))), "notneg");
  assert.equal(code(() => N.unpack(new Uint8Array(0))), "notneg");
  /* a chunk named lpDa from someone else */
  const other = N.pack(png(), roll(), jpegsFor(roll()));
  const at = Buffer.from(other).indexOf("LOPDA-NEG", 0, "latin1"); other[at] = 0x58;   /* "XOPDA-NEG", CRCs fixed below */
  const c = Buffer.from(other.buffer), start = Buffer.from(other).indexOf("lpDa", 0, "latin1"), len = c.readUInt32BE(start - 4);
  c.writeUInt32BE(N.crc32(other.subarray(at, at + len - 4)), at + len - 4);
  c.writeUInt32BE(N.crc32(other.subarray(start, start + 4 + len)), start + 4 + len);
  assert.equal(code(() => N.unpack(other)), "notneg");
});

test("a negative from a newer format version is refused, not half read", () => {
  const out = N.pack(png(), roll(), jpegsFor(roll())), c = Buffer.from(out.buffer);
  const at = c.indexOf("LOPDA-NEG", 0, "latin1"), start = c.indexOf("lpDa", 0, "latin1"), len = c.readUInt32BE(start - 4);
  out[at + 9] = 3;
  c.writeUInt32BE(N.crc32(out.subarray(at, at + len - 4)), at + len - 4);
  c.writeUInt32BE(N.crc32(out.subarray(start, start + 4 + len)), start + 4 + len);
  assert.equal(code(() => N.unpack(out)), "version");
});

test("a v2 chunk truncated inside PIXELS is damaged even with valid lengths and CRCs", () => {
  const r = roll({ size: 1 }), j = jpegsFor(r), out = N.pack(png(), r, j);
  const chunk = pngChunk(out, "lpDa"), data = Buffer.from(out.subarray(chunk.data, chunk.data + chunk.length));
  const jsonEnd = 14 + data.readUInt32BE(10), pixelBytes = 128 * r.res * 112 * r.res / 4;
  const truncated = Buffer.alloc(jsonEnd + pixelBytes - 1 + 4);
  data.copy(truncated, 0, 0, jsonEnd + pixelBytes - 1);
  truncated.writeUInt32BE(N.crc32(truncated, 0, truncated.length - 4), truncated.length - 4);
  assert.equal(code(() => N.unpack(withLpDa(out, truncated))), "damaged");
});

test("bad metadata is refused when writing and when reading", () => {
  const r = roll();
  for (const bad of [
    { ...r, id: "../x" }, { ...r, no: 0 }, { ...r, size: 5 }, { ...r, res: 3 }, { ...r, name: "x".repeat(65) },
    { ...r, frames: r.frames.map((f, k) => k === 1 ? { ...f, px: f.px.slice(1) } : f) },
    { ...r, frames: r.frames.map((f, k) => k === 1 ? { ...f, px: "4" + f.px.slice(1) } : f) },
    { ...r, frames: r.frames.map((f, k) => k === 1 ? { ...f, lens: "zoom" } : f) },
    { ...r, frames: r.frames.map((f, k) => k === 1 ? { ...f, extra: 1 } : f) }
  ]) assert.equal(code(() => N.pack(png(), bad, jpegsFor(r))), "badroll");
  assert.equal(code(() => N.pack(png(), r, jpegsFor(r).slice(1))), "badroll");
});

test("a whole fine-grain roll: 16 frames with 120 KB JPEGs writes and reads", () => {
  const r = roll({ size: 16, res: 2 }), j = r.frames.map((f, k) => jpeg(120 * 1024, 100 + k));
  const out = N.pack(png(64, 64), r, j);
  assert.ok(out.length > 16 * 120 * 1024 + 16 * 256 * 224 / 4, "it is all in there: " + out.length);
  assert.ok(out.length < 4 * 1024 * 1024, "under the 4 MB import limit: " + out.length);
  const old = v1Negative(png(64, 64), r, j);
  assert.ok(old.length - out.length >= 650 * 1024, "v1 " + old.length + " bytes, v2 " + out.length + " bytes");
  const back = N.unpack(out);
  assert.deepEqual(plain(back.roll), r);
  back.jpegs.forEach((b, k) => assert.ok(Buffer.from(b).equals(Buffer.from(j[k])), "jpeg " + k));
});
