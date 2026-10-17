// runtime/backup.js: the whole-device backup file. The manifest, values in and out, and every check before a restore.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32 as zcrc } from "node:zlib";
import { runScript } from "./helpers.mjs";

const NEG = runScript("runtime/negative.js", { TextEncoder, TextDecoder }).LopdaNegative;
const Z = runScript("runtime/zip.js", { TextEncoder, TextDecoder, LopdaNegative: NEG }).LopdaZip;
const B = runScript("runtime/backup.js", { TextEncoder, TextDecoder, Blob, File, LopdaNegative: NEG, LopdaZip: Z }).LopdaBackup;
const tag = (v) => Object.prototype.toString.call(v).slice(8, -1);
const enc = (s) => new TextEncoder().encode(s);
const dec = (u) => new TextDecoder().decode(u);
const plain = (v) => JSON.parse(JSON.stringify(v));   /* arrays from the vm realm compare as plain ones */
const BASE = "data/users/local";
const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);

function sample() {
  return {
    docs: [
      { path: BASE + "/notes/items/n1", data: { body: "你好 #日记", updated: 1, day: "2026-10-17" } },
      { path: BASE + "/settings", data: { volume: 3, lang: "en", sound: true } },
      { path: BASE + "/appdata/items/paint", data: { v: "{\"px\":[1,2]}" } },
    ],
    files: [
      { key: "roll/r1/01.jpg", value: new Blob([new Uint8Array([255, 216, 255, 0, 1])], { type: "image/jpeg" }) },
      { key: "dict/d1/index", value: { info: { name: "d", wordcount: 2 }, index: { words: ["a", "b"], off: new Uint32Array([0, 7]), len: new Uint32Array([7, 3]), head: JSON.parse('{"__proto__": 1, "$lp": 2}') } } },
      { key: "font/f1", value: new File([new Uint8Array([1, 2, 3])], "pixel.ttf", { type: "font/ttf" }) },
      { key: "raw/u8", value: new Uint8Array([9, 8, 7]).subarray(1) },
    ],
  };
}
async function zipOf(dump, opts) {
  const p = await B.pack(dump, Object.assign({ runtime: "0.25.0", now: NOW }, opts));
  const parts = Z.writeParts(p.entries);
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of parts) { out.set(x, o); o += x.length; }
  return { pack: p, bytes: out };
}
/* rebuild a backup with one change made to its entries */
async function tampered(fn) {
  const { pack } = await zipOf(sample());
  const entries = pack.entries.map((e) => ({ name: e.name, data: e.data, time: NOW }));
  fn(entries);
  return Z.write(entries);
}
const rejectsWith = (p, code) => assert.rejects(p, (e) => e.code === code);

test("fileName is lopda-backup-YYYYMMDD.zip in local time", () => {
  assert.equal(B.fileName(new Date(2026, 9, 7, 23, 59).getTime()), "lopda-backup-20261007.zip");
});

test("the manifest lists the format, runtime, time, documents and each file's key, type, size and CRC", async () => {
  const { pack, bytes } = await zipOf(sample());
  const m = pack.manifest;
  assert.equal(m.format, 1);
  assert.equal(m.runtime, "0.25.0");
  assert.equal(m.created, "2026-10-17T12:00:00.000Z");
  assert.equal(m.docs, 3);
  assert.deepEqual(plain(m.files.map((f) => [f.key, f.type, f.mime || null, f.name || null])), [
    ["roll/r1/01.jpg", "blob", "image/jpeg", null],
    ["dict/d1/index", "json", null, null],
    ["font/f1", "blob", "font/ttf", "pixel.ttf"],
    ["raw/u8", "Uint8Array", null, null],
  ]);
  assert.equal(m.files[0].size, 5);
  assert.equal(m.files[0].crc32, zcrc(Buffer.from([255, 216, 255, 0, 1])));
  /* the zip itself: the entries in order, stored, and the size pack() promised */
  assert.equal(bytes.length, pack.size);
  const list = Z.list(bytes);
  assert.deepEqual(plain(list.map((e) => e.name)), ["manifest.json", "docs.json", "files/0", "files/1", "files/2", "files/3"]);
  assert.ok(list.every((e) => e.method === 0));
  const manifest = JSON.parse(dec(await Z.read(bytes, list[0])));
  assert.deepEqual(manifest, JSON.parse(JSON.stringify(m)));
  const docs = JSON.parse(dec(await Z.read(bytes, list[1])));
  assert.deepEqual(docs[0], sample().docs[0]);
  assert.deepEqual([...await Z.read(bytes, list[2])], [255, 216, 255, 0, 1]);
});

test("pack, then unpack gives back every document and every value", async () => {
  const { bytes } = await zipOf(sample());
  const back = await B.unpack(bytes);
  assert.equal(back.manifest.format, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(back.docs)), sample().docs);
  const [jpg, index, font, u8] = back.files.map((f) => f.value);
  assert.deepEqual(plain(back.files.map((f) => f.key)), sample().files.map((f) => f.key));
  assert.equal(tag(jpg), "Blob");
  assert.equal(jpg.type, "image/jpeg");
  assert.deepEqual([...new Uint8Array(await jpg.arrayBuffer())], [255, 216, 255, 0, 1]);
  assert.equal(tag(index.index.off), "Uint32Array");
  assert.deepEqual([...index.index.off], [0, 7]);
  assert.deepEqual(plain(index.index.words), ["a", "b"]);
  /* keys that look like the format's own stay plain keys */
  assert.deepEqual(plain(Object.keys(index.index.head)), ["__proto__", "$lp"]);
  assert.equal(index.index.head["$lp"], 2);
  assert.equal(Object.getPrototypeOf(index.index.head), Object.getPrototypeOf(index.info));
  assert.equal(tag(font), "File");
  assert.equal(font.name, "pixel.ttf");
  assert.equal(tag(u8), "Uint8Array");
  assert.deepEqual([...u8], [8, 7]);
});

test("values JSON cannot carry survive: Blobs inside, dates, NaN, -0, undefined, escaped keys", async () => {
  const v = { pic: new Blob(["hi"], { type: "text/plain" }), at: new Date(5), n: [NaN, Infinity, -Infinity, -0, 1], u: undefined, arr: [undefined, 2],
    "$lp$": "x", deep: { "$lp": { "$lp$$": true } }, buf: new Uint16Array([1, 65535]).buffer, dv: new DataView(new Uint8Array([4, 5]).buffer) };
  const back = B.decodeJSON(await B.encodeJSON(v));
  assert.equal(await back.pic.text(), "hi");
  assert.equal(back.pic.type, "text/plain");
  assert.equal(back.at.getTime(), 5);
  assert.ok(Number.isNaN(back.n[0]));
  assert.deepEqual([...back.n.slice(1, 3)], [Infinity, -Infinity]);
  assert.ok(Object.is(back.n[3], -0));
  assert.ok("u" in back && back.u === undefined);
  assert.equal(back.arr.length, 2);
  assert.equal(back.arr[0], undefined);
  assert.equal(back["$lp$"], "x");
  assert.deepEqual(plain(Object.keys(back.deep["$lp"])), ["$lp$$"]);
  assert.deepEqual([...new Uint16Array(back.buf)], [1, 65535]);
  assert.equal(tag(back.dv), "DataView");
  assert.equal(back.dv.getUint8(1), 5);
});

test("a value the format cannot hold fails the backup instead of losing data", async () => {
  await rejectsWith(B.pack({ docs: [], files: [{ key: "k", value: { m: new Map() } }] }, { now: NOW }), "unsupported");
  const loop = {}; loop.self = loop;
  await rejectsWith(B.pack({ docs: [], files: [{ key: "k", value: loop }] }, { now: NOW }), "unsupported");
  await rejectsWith(B.pack({ docs: [{ path: "data/users/other/x/y", data: {} }], files: [] }, { now: NOW }), "unsupported");
});

test("an empty handheld makes a backup that restores to nothing", async () => {
  const { bytes } = await zipOf({ docs: [], files: [] });
  const back = await B.unpack(bytes);
  assert.deepEqual([back.docs.length, back.files.length], [0, 0]);
});

/* ---------- every check before a restore ---------- */

test("refused: not a zip, an empty file, a zip without a manifest", async () => {
  await rejectsWith(B.unpack(enc("hello, not a zip at all")), "corrupt");
  await rejectsWith(B.unpack(new Uint8Array(0)), "corrupt");
  await rejectsWith(B.unpack(Z.write([{ name: "notes/a.md", data: "x" }])), "corrupt");
});

test("refused: a newer format, with its own error", async () => {
  const bytes = await tampered((es) => {
    const m = JSON.parse(dec(es[0].data)); m.format = 2; es[0].data = enc(JSON.stringify(m));
  });
  await rejectsWith(B.unpack(bytes), "newer");
  const zero = await tampered((es) => { const m = JSON.parse(dec(es[0].data)); m.format = 0; es[0].data = enc(JSON.stringify(m)); });
  await rejectsWith(B.unpack(zero), "corrupt");
});

test("refused: a listed file missing", async () => {
  await rejectsWith(B.unpack(await tampered((es) => es.splice(3, 1))), "corrupt");
});

test("refused: a file whose CRC or size does not match the manifest", async () => {
  /* the zip's own CRC is right (zip.write computes it), only the manifest's disagrees */
  await rejectsWith(B.unpack(await tampered((es) => { es[2].data = new Uint8Array([255, 216, 255, 0, 2]); })), "corrupt");
  await rejectsWith(B.unpack(await tampered((es) => { es[2].data = new Uint8Array([255, 216, 255, 0]); })), "corrupt");
});

test("refused: damaged bytes inside the zip (its CRC)", async () => {
  const { bytes } = await zipOf(sample());
  const at = Z.list(bytes)[2].offset + 30 + "files/0".length;
  const bad = bytes.slice(); bad[at] ^= 0xff;
  await rejectsWith(B.unpack(bad), "corrupt");
  await rejectsWith(B.unpack(bytes.subarray(0, bytes.length - 30)), "corrupt");
});

test("refused: a document path outside data/users/local, a bad path, a duplicate, a wrong count", async () => {
  const withDocs = (fn) => tampered((es) => { const d = JSON.parse(dec(es[1].data)); fn(d); es[1].data = enc(JSON.stringify(d)); });
  await rejectsWith(B.unpack(await withDocs((d) => { d[0].path = "data/users/other/notes/items/n1"; })), "corrupt");
  await rejectsWith(B.unpack(await withDocs((d) => { d[0].path = BASE + "/../../x/y"; })), "corrupt");
  await rejectsWith(B.unpack(await withDocs((d) => { d[0].path = BASE + "/notes/items"; })), "corrupt");
  await rejectsWith(B.unpack(await withDocs((d) => { d[0].path = BASE + "//items/n1"; })), "corrupt");
  await rejectsWith(B.unpack(await withDocs((d) => { d[1].path = d[0].path; })), "corrupt");
  await rejectsWith(B.unpack(await withDocs((d) => { d.pop(); })), "corrupt");
  await rejectsWith(B.unpack(await tampered((es) => { es[1].data = enc("[{"); })), "corrupt");
});

test("refused: a manifest entry that is not well formed, or a value that does not decode", async () => {
  const withManifest = (fn) => tampered((es) => { const m = JSON.parse(dec(es[0].data)); fn(m); es[0].data = enc(JSON.stringify(m)); });
  await rejectsWith(B.unpack(await withManifest((m) => { m.files[1].key = m.files[0].key; })), "corrupt");
  await rejectsWith(B.unpack(await withManifest((m) => { delete m.files[0].crc32; })), "corrupt");
  await rejectsWith(B.unpack(await withManifest((m) => { m.files[3].type = "Float64Array"; })), "corrupt");
  await rejectsWith(B.unpack(await withManifest((m) => { m.files[3].type = "Map"; })), "corrupt");
  await rejectsWith(B.unpack(await tampered((es) => { es[0].data = enc("{not json"); })), "corrupt");
});
