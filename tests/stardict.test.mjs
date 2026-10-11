// runtime/stardict.js and tools/stardict-write.mjs: a small made-up dictionary through the whole path.
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { runScript } from "./helpers.mjs";
import { writeStarDict, dictzip } from "../tools/stardict-write.mjs";

const SD = runScript("runtime/stardict.js", {
  TextDecoder, Blob, Response, DecompressionStream, Uint8Array, Uint32Array, DataView, Promise, String,
}).LopdaStarDict;

const ENTRIES = [
  { word: "Run", text: "Run (noun): a short trip. 跑步", syns: ["ran"] },
  { word: "run", text: "run (verb): to move fast. 跑" },
  { word: "running", text: "running: the act of run. 奔跑" },
  { word: "apple", text: "apple: a round fruit. 苹果" },
  { word: "apply", text: "apply: to put on. 申请" },
  { word: "application", text: "application: a request. 应用" },
  { word: "über", text: "über: above. 超" },
  { word: "color", text: "color: hue. 颜色", syns: ["colour"] },
];
const u8 = (b) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
const files = (w, extra) => Object.assign({
  ifo: w.ifo, idx: u8(w.idx), dict: u8(w.dict || w.dictdz), syn: w.syn ? u8(w.syn) : undefined,
}, extra);
const texts = async (book) => {
  const out = [];
  for (let i = 0; i < book.index.words.length; i++) out.push((await SD.read(book, i)).text);
  return out;
};
const words = (book, pos) => Array.from(pos).map((i) => book.index.words[i]);

test("parseIfo: values, numbers, CRLF, BOM, bad header", () => {
  const w = writeStarDict({ bookname: "Tiny", author: "me", entries: ENTRIES, dictzip: false });
  const info = SD.parseIfo(w.ifo);
  assert.equal(info.bookname, "Tiny");
  assert.equal(info.wordcount, 8);
  assert.equal(info.synwordcount, 2);
  assert.equal(info.idxfilesize, w.idx.length);
  assert.equal(info.idxoffsetbits, 32);
  assert.equal(info.sametypesequence, "m");
  const odd = SD.parseIfo("﻿StarDict's dict ifo file\r\nversion=2.4.2\r\nbookname=X\r\nwordcount=3\r\n");
  assert.equal(odd.bookname, "X");
  assert.equal(odd.wordcount, 3);
  assert.throws(() => SD.parseIfo("hello\nbookname=x\n"), /not a StarDict/);
  assert.equal(SD.parseIfo("StarDict's dict ifo file\nversion=2.4.2\nidxoffsetbits=64\n").idxoffsetbits, 32);
});

test("open: plain .dict and dictzip give identical texts", async () => {
  const plain = await SD.open(files(writeStarDict({ bookname: "T", entries: ENTRIES, dictzip: false })));
  const zipped = await SD.open(files(writeStarDict({ bookname: "T", entries: ENTRIES }), { dictDz: true }));
  const sniffed = await SD.open(files(writeStarDict({ bookname: "T", entries: ENTRIES })));
  const a = await texts(plain);
  assert.deepEqual(await texts(zipped), a);
  assert.deepEqual(await texts(sniffed), a);
  assert.equal(plain.name, "T");
  assert.ok(a.includes("apple: a round fruit. 苹果"));
});

test("find is case-insensitive and may return several hits", async () => {
  const book = await SD.open(files(writeStarDict({ bookname: "T", entries: ENTRIES, dictzip: false })));
  const hits = SD.find(book.index, " RUN ");
  assert.deepEqual(words(book, hits).sort(), ["Run", "run"]);
  assert.deepEqual(Array.from(SD.find(book.index, "nothing")), []);
  const r = await SD.read(book, SD.find(book.index, "apple")[0]);
  assert.equal(r.head, "apple");
  assert.equal(r.text, "apple: a round fruit. 苹果");
});

test("syn lookup returns the headword", async () => {
  const book = await SD.open(files(writeStarDict({ bookname: "T", entries: ENTRIES, dictzip: false })));
  const [p] = SD.find(book.index, "ran");
  const r = await SD.read(book, p);
  assert.equal(r.word, "ran");
  assert.equal(r.head, "Run");
  assert.equal(r.text, "Run (noun): a short trip. 跑步");
  assert.equal((await SD.read(book, SD.find(book.index, "colour")[0])).head, "color");
});

test("prefix: sorted, limited, empty prefix gives nothing", async () => {
  const book = await SD.open(files(writeStarDict({ bookname: "T", entries: ENTRIES, dictzip: false })));
  assert.deepEqual(words(book, SD.prefix(book.index, "app", 10)), ["apple", "application", "apply"]);
  assert.deepEqual(words(book, SD.prefix(book.index, "APP", 2)), ["apple", "application"]);
  assert.deepEqual(Array.from(SD.prefix(book.index, "", 5)), []);
  assert.deepEqual(Array.from(SD.prefix(book.index, "zzz", 5)), []);
});

test("non-ASCII word", async () => {
  const book = await SD.open(files(writeStarDict({ bookname: "T", entries: ENTRIES, dictzip: false })));
  const [p] = SD.find(book.index, "ÜBER");
  assert.equal(book.index.words[p], "über");
  assert.equal((await SD.read(book, p)).text, "über: above. 超");
});

test("64-bit idx", async () => {
  const dict = Buffer.from("hello there", "utf8");
  const idx = Buffer.alloc(0);
  const ent = Buffer.alloc(4 + 8 + 4 + 1);
  ent.write("word", 0);
  ent.writeUInt32BE(0, 5); ent.writeUInt32BE(6, 9); ent.writeUInt32BE(5, 13);
  const ifo = "StarDict's dict ifo file\nversion=3.0.0\nbookname=B\nwordcount=1\nidxoffsetbits=64\nsametypesequence=m\n";
  const book = await SD.open({ ifo, idx: u8(Buffer.concat([idx, ent])), dict: u8(dict) });
  assert.equal(book.info.idxoffsetbits, 64);
  assert.equal((await SD.read(book, 0)).text, "there");
  ent.writeUInt32BE(1, 5);
  assert.throws(() => SD.parseIdx(u8(ent), 64), /4 GB/);
});

test("entryText without sametypesequence", () => {
  const item = (t, s) => Buffer.concat([Buffer.from(t), Buffer.from(s), Buffer.from([0])]);
  const bin = Buffer.from([1, 2, 3]);
  const w = Buffer.concat([Buffer.from("W"), (() => { const b = Buffer.alloc(4); b.writeUInt32BE(3); return b; })(), bin]);
  const bytes = Buffer.concat([
    item("m", "plain"),
    item("g", "a<b>bold</b> &lt;x&gt; &amp; &quot;q&quot;&nbsp;&#65;&#x42;<br/>line2</p>"),
    w,
    item("t", "rʌn"),
  ]);
  assert.equal(SD.entryText(u8(bytes), ""), "plain\nabold <x> & \"q\" AB\nline2\n\n[rʌn]");
});

test("entryText with sametypesequence tm: last item unterminated", () => {
  const bytes = Buffer.concat([Buffer.from("rʌn"), Buffer.from([0]), Buffer.from("to run 跑")]);
  assert.equal(SD.entryText(u8(bytes), "tm"), "[rʌn]\nto run 跑");
  const w = writeStarDict({ bookname: "T", entries: [{ word: "run", text: bytes }], sametypesequence: "tm", dictzip: false });
  return SD.open(files(w)).then((book) => SD.read(book, 0)).then((r) => assert.equal(r.text, "[rʌn]\nto run 跑"));
});

test("wordcount mismatch throws", async () => {
  const w = writeStarDict({ bookname: "T", entries: ENTRIES, dictzip: false });
  await assert.rejects(SD.open(files(w, { ifo: w.ifo.replace("wordcount=8", "wordcount=7") })), /wordcount mismatch/);
});

test("lemma table", () => {
  const t = SD.parseLemma("running\trun\nleaves\tleaf/leave\nbroken line\n\n  \tx\nRan\trun\n");
  assert.deepEqual(Array.from(SD.lemmas(t, "Running")), ["run"]);
  assert.deepEqual(Array.from(SD.lemmas(t, "leaves")), ["leaf", "leave"]);
  assert.deepEqual(Array.from(SD.lemmas(t, "ran")), ["run"]);
  assert.deepEqual(Array.from(SD.lemmas(t, "zebra")), []);
  assert.deepEqual(Array.from(SD.lemmas(t, "constructor")), []);
});

test("index survives structuredClone and prepare()", async () => {
  const w = writeStarDict({ bookname: "T", entries: ENTRIES, dictzip: false });
  const book = await SD.open(files(w));
  const raw = SD.buildIndex(SD.parseIdx(u8(w.idx), 32), SD.parseSyn(u8(w.syn)));
  const copy = structuredClone(raw);
  assert.equal(copy.keys, undefined);
  SD.prepare(copy);
  assert.strictEqual(SD.prepare(copy), copy);
  assert.deepEqual(words(book, SD.find(copy, "ran")).length, 1);
  assert.deepEqual(Array.from(copy.words), Array.from(book.index.words));
  assert.deepEqual({ ...copy.head }, { ...book.index.head });
  assert.deepEqual(words({ index: copy }, SD.prefix(copy, "app", 5)), ["apple", "application", "apply"]);
  // syn entries whose target is out of range are dropped
  const idx = SD.parseIdx(u8(w.idx), 32);
  const bad = SD.buildIndex(idx, { words: ["zz"], target: new Uint32Array([99]) });
  assert.equal(bad.words.length, idx.words.length);
});

test("read: Blob as book.data", async () => {
  const w = writeStarDict({ bookname: "T", entries: ENTRIES, dictzip: false });
  const book = await SD.open(files(w));
  book.data = new Blob([book.data]);
  const [p] = SD.find(book.index, "apply");
  assert.equal((await SD.read(book, p)).text, "apply: to put on. 申请");
});

test("dictzip: gunzip round trip, small and multi-chunk, random access", () => {
  assert.equal(zlib.gunzipSync(dictzip(Buffer.alloc(0))).length, 0);
  const small = Buffer.from("hello dictzip");
  assert.deepEqual(zlib.gunzipSync(dictzip(small)), small);
  let s = 1;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff);
  const big = Buffer.from(Array.from({ length: 70000 }, () => "w" + (rnd() % 5000).toString(36) + " ").join(""));
  assert.ok(big.length > 200000);
  const z = dictzip(big);
  assert.deepEqual(zlib.gunzipSync(z), big);
  // header: FEXTRA only, "RA" subfield, version 1, chunk length 58315
  assert.equal(z[3], 4);
  assert.equal(z.toString("latin1", 12, 14), "RA");
  assert.equal(z.readUInt16LE(16), 1);
  assert.equal(z.readUInt16LE(18), 58315);
  const cnt = z.readUInt16LE(20);
  assert.equal(cnt, Math.ceil(big.length / 58315));
  let pos = 12 + 4 + z.readUInt16LE(14) + 0;
  for (let k = 0; k < cnt; k++) {
    const size = z.readUInt16LE(22 + 2 * k);
    const part = zlib.inflateRawSync(z.subarray(pos, pos + size), { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    assert.deepEqual(part, big.subarray(k * 58315, (k + 1) * 58315), "chunk " + k);
    pos += size;
  }
});
