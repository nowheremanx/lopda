// Lo-PDA: write a StarDict dictionary (.ifo .idx .dict[.dz] .syn) from a list of entries. Used by the dictionary
// generator and by the tests. Node 20+, no dependencies.
// Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
import zlib from "node:zlib";

const CHUNK = 58315; // the size dictzip writers use; the .dz header records it

// g_ascii_strcasecmp: only A-Z fold, so non-ASCII bytes compare as they are
function stardictCompare(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] >= 65 && a[i] <= 90 ? a[i] + 32 : a[i];
    const y = b[i] >= 65 && b[i] <= 90 ? b[i] + 32 : b[i];
    if (x !== y) return x - y;
  }
  if (a.length !== b.length) return a.length - b.length;
  return Buffer.compare(a, b);
}

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const clean = (s) => String(s).replace(/[\r\n]+/g, " ").trim();

let crcTable = null;
function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf);
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A real dictzip: gzip with an "RA" extra field listing each chunk's compressed size. Every chunk but the last
// ends on a full flush, so a reader can inflate any chunk alone.
export function dictzip(buf) {
  const chunks = [];
  const count = Math.max(1, Math.ceil(buf.length / CHUNK));
  for (let i = 0; i < count; i++) {
    const part = buf.subarray(i * CHUNK, (i + 1) * CHUNK);
    const last = i === count - 1;
    const z = last ? zlib.deflateRawSync(part)
      : zlib.deflateRawSync(part, { finishFlush: zlib.constants.Z_FULL_FLUSH });
    if (z.length > 65535) throw new Error("dictzip chunk too large");
    chunks.push(z);
  }
  if (count > 65535) throw new Error("dictzip: too many chunks");
  const ra = Buffer.alloc(6 + 2 * count);
  ra.writeUInt16LE(1, 0);
  ra.writeUInt16LE(CHUNK, 2);
  ra.writeUInt16LE(count, 4);
  chunks.forEach((c, i) => ra.writeUInt16LE(c.length, 6 + 2 * i));
  if (4 + ra.length > 65535) throw new Error("dictzip: header too large");
  const head = Buffer.alloc(12);
  head.set([0x1f, 0x8b, 8, 4, 0, 0, 0, 0, 0, 3]);
  head.writeUInt16LE(4 + ra.length, 10);
  const sub = Buffer.from([0x52, 0x41, 0, 0]);
  sub.writeUInt16LE(ra.length, 2);
  const tail = Buffer.alloc(8);
  tail.writeUInt32LE(crc32(buf), 0);
  tail.writeUInt32LE(buf.length >>> 0, 4);
  return Buffer.concat([head, sub, ra, ...chunks, tail]);
}

export function writeStarDict({ bookname, description, author, entries, dictzip: zip = true, sametypesequence = "m" }) {
  const list = entries.map((e) => ({
    key: Buffer.from(e.word, "utf8"),
    data: Buffer.isBuffer(e.text) ? e.text : Buffer.from(e.text, "utf8"),
    syns: e.syns || [],
  }));
  list.sort((a, b) => stardictCompare(a.key, b.key));
  const idxParts = [], dictParts = [];
  let offset = 0;
  list.forEach((e) => {
    idxParts.push(e.key, Buffer.from([0]), u32(offset), u32(e.data.length));
    dictParts.push(e.data);
    offset += e.data.length;
  });
  const syns = [];
  list.forEach((e, i) => e.syns.forEach((s) => syns.push({ key: Buffer.from(s, "utf8"), i })));
  syns.sort((a, b) => stardictCompare(a.key, b.key));
  const synBuf = syns.length
    ? Buffer.concat(syns.flatMap((s) => [s.key, Buffer.from([0]), u32(s.i)])) : null;
  const idx = Buffer.concat(idxParts);
  const dict = Buffer.concat(dictParts);
  const lines = ["StarDict's dict ifo file", "version=2.4.2", "bookname=" + clean(bookname),
    "wordcount=" + list.length];
  if (syns.length) lines.push("synwordcount=" + syns.length);
  lines.push("idxfilesize=" + idx.length);
  if (author) lines.push("author=" + clean(author));
  if (description) lines.push("description=" + clean(description));
  lines.push("sametypesequence=" + sametypesequence);
  const out = { ifo: lines.join("\n") + "\n", idx, syn: synBuf };
  if (zip) out.dictdz = dictzip(dict); else out.dict = dict;
  return out;
}
