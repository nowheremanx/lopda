// Structure checks for the generated test font. MIT, Copyright (c) 2026 Haowei Wu.
import test from "node:test";
import assert from "node:assert/strict";
import { makeFont, fontFile, checksum } from "./font-fixture.mjs";

function parse(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getUint16(4);
  const tables = {};
  const order = [];
  for (let i = 0; i < n; i++) {
    const at = 12 + 16 * i;
    const tag = String.fromCharCode(...bytes.subarray(at, at + 4));
    order.push(tag);
    tables[tag] = { sum: v.getUint32(at + 4), offset: v.getUint32(at + 8), length: v.getUint32(at + 12) };
  }
  return { v, n, tables, order };
}

test("font: table directory is sorted, aligned and checksummed", () => {
  const bytes = makeFont();
  const { v, n, tables, order } = parse(bytes);
  assert.equal(v.getUint32(0), 0x00010000);
  assert.deepEqual(order, order.slice().sort());
  for (const t of ["OS/2", "cmap", "glyf", "head", "hhea", "hmtx", "loca", "maxp", "name", "post"]) assert.ok(tables[t], t);
  assert.equal(v.getUint16(6), 8 * 16); // searchRange for 10 tables
  assert.equal(v.getUint16(8), 3);
  assert.equal(v.getUint16(10), n * 16 - 128);
  for (const tag of order) {
    const t = tables[tag];
    assert.equal(t.offset % 4, 0, tag);
    const data = bytes.slice(t.offset, t.offset + ((t.length + 3) & ~3));
    if (tag === "head") data.fill(0, 8, 12);
    assert.equal(checksum(data), t.sum, tag + " checksum");
  }
});

test("font: head checkSumAdjustment makes the file sum 0xB1B0AFBA", () => {
  const bytes = makeFont();
  assert.equal(bytes.length % 4, 0);
  assert.equal(checksum(bytes), 0xb1b0afba);
  const { v, tables } = parse(bytes);
  assert.equal(v.getUint32(tables.head.offset + 12), 0x5f0f3cf5);
  assert.equal(v.getUint16(tables.head.offset + 18), 1000);
});

test("font: cmap maps A to a glyph with the requested advance", () => {
  for (const advance of [900, 1200]) {
    const bytes = makeFont({ advance });
    const { v, tables } = parse(bytes);
    const cm = tables.cmap.offset;
    assert.equal(v.getUint16(cm + 4), 3);
    assert.equal(v.getUint16(cm + 6), 1);
    const sub = cm + v.getUint32(cm + 8);
    assert.equal(v.getUint16(sub), 4);
    const segs = v.getUint16(sub + 6) / 2;
    const ends = sub + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2;
    assert.equal(v.getUint16(ends + (segs - 1) * 2), 0xffff);
    const gid = (cp) => {
      for (let s = 0; s < segs; s++) {
        if (cp <= v.getUint16(ends + s * 2)) {
          if (cp < v.getUint16(starts + s * 2)) return 0;
          return (cp + v.getInt16(deltas + s * 2)) & 0xffff;
        }
      }
      return 0;
    };
    const numGlyphs = v.getUint16(tables.maxp.offset + 4);
    assert.equal(numGlyphs, 96);
    const a = gid(0x41);
    assert.ok(a > 0 && a < numGlyphs);
    assert.equal(v.getUint16(tables.hmtx.offset + a * 4), advance);
    assert.equal(gid(0x4e2d), 0); // CJK is not covered
    assert.equal(gid(0x7e), numGlyphs - 1);
  }
});

test("font: loca and glyf agree", () => {
  const bytes = makeFont();
  const { v, tables } = parse(bytes);
  const numGlyphs = v.getUint16(tables.maxp.offset + 4);
  assert.equal(v.getInt16(tables.head.offset + 50), 1);
  assert.equal(tables.loca.length, (numGlyphs + 1) * 4);
  let prev = 0;
  for (let g = 0; g <= numGlyphs; g++) {
    const o = v.getUint32(tables.loca.offset + g * 4);
    assert.ok(o >= prev && o % 4 === 0);
    prev = o;
  }
  assert.equal(prev, tables.glyf.length);
  const g0 = v.getUint32(tables.loca.offset);
  assert.equal(v.getInt16(tables.glyf.offset + g0), 1); // .notdef has one contour
  assert.equal(v.getUint32(tables.loca.offset + 4), v.getUint32(tables.loca.offset + 8)); // glyph 1 (space) empty
});

test("font: name table carries the family; fontFile shapes a Playwright file", () => {
  const f = fontFile("x.ttf", { family: "Abc Face" });
  assert.equal(f.name, "x.ttf");
  assert.equal(f.mimeType, "font/ttf");
  assert.ok(Buffer.isBuffer(f.buffer));
  const utf16 = Buffer.from("Abc Face", "utf16le").swap16();
  assert.ok(f.buffer.includes(utf16));
});
