// Builds a tiny but valid TrueType font for tests (Chromium's sanitizer accepts it). No dependencies.
// Every ASCII glyph U+0020..U+007E is a filled quadrilateral with the same wide advance, so text set in it
// is plainly wider than in any system font; CJK is not covered and falls back. MIT, Copyright (c) 2026 Haowei Wu.

const UPM = 1000;

function u16(n) { return [(n >> 8) & 255, n & 255]; }
function i16(n) { return u16(n & 0xffff); }
function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function pad4(a) { while (a.length % 4) a.push(0); return a; }

export function checksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    sum = (sum + (((bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0)) >>> 0)) >>> 0;
  }
  return sum;
}

function utf16be(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) out.push(...u16(s.charCodeAt(i)));
  return out;
}

function glyph(advance) {
  // One contour, four on-curve points, clockwise: a slightly slanted block.
  const pts = [[100, 0], [160, 700], [advance - 100, 700], [advance - 100, 0]];
  const out = [...i16(1), ...i16(100), ...i16(0), ...i16(advance - 100), ...i16(700)];
  out.push(...u16(3), ...u16(0));
  for (let i = 0; i < 4; i++) out.push(0x01); // on curve, x and y as full int16 deltas
  let px = 0, py = 0;
  for (const p of pts) { out.push(...i16(p[0] - px)); px = p[0]; }
  for (const p of pts) { out.push(...i16(p[1] - py)); py = p[1]; }
  return pad4(out);
}

export function makeFont({ family = "Lopda Test", advance = 900 } = {}) {
  const FIRST = 0x20, LAST = 0x7e;
  const numGlyphs = 1 + (LAST - FIRST + 1); // .notdef + ASCII
  const body = glyph(advance);

  // glyf + loca (long format); .notdef and every mapped glyph but space has an outline.
  const glyf = [], loca = [];
  for (let g = 0; g < numGlyphs; g++) {
    loca.push(...u32(glyf.length));
    if (g !== 1) glyf.push(...body); // glyph 1 is space: empty
  }
  loca.push(...u32(glyf.length));

  const hmtx = [];
  for (let g = 0; g < numGlyphs; g++) hmtx.push(...u16(advance), ...i16(g === 1 ? 0 : 100));

  // cmap: format 4, one segment 0x20..0x7E -> glyph 1.., plus the 0xFFFF end segment.
  const sub = [
    ...u16(4), ...u16(32), ...u16(0), ...u16(4),
    ...u16(4), ...u16(1), ...u16(0),
    ...u16(LAST), ...u16(0xffff),
    ...u16(0),
    ...u16(FIRST), ...u16(0xffff),
    ...i16(1 - FIRST), ...i16(1),
    ...u16(0), ...u16(0),
  ];
  const cmap = [...u16(0), ...u16(1), ...u16(3), ...u16(1), ...u32(12), ...sub];

  const head = [
    ...u16(1), ...u16(0), ...u16(1), ...u16(0), // version 1.0, fontRevision 1.0
    ...u32(0), ...u32(0x5f0f3cf5), ...u16(0x0003), ...u16(UPM),
    ...u32(0), ...u32(0), ...u32(0), ...u32(0), // created, modified (LONGDATETIME)
    ...i16(0), ...i16(0), ...i16(advance), ...i16(700),
    ...u16(0), ...u16(8), ...i16(2), ...i16(1), ...i16(0), // macStyle, lowestRecPPEM, direction hint, long loca, glyph format
  ];
  const hhea = [
    ...u16(1), ...u16(0), ...i16(800), ...i16(-200), ...i16(0),
    ...u16(advance), ...i16(0), ...i16(0), ...i16(advance - 100),
    ...i16(1), ...i16(0), ...i16(0), ...i16(0), ...i16(0), ...i16(0), ...i16(0), ...i16(0),
    ...u16(numGlyphs),
  ];
  const maxp = [
    ...u32(0x00010000), ...u16(numGlyphs), ...u16(4), ...u16(1), ...u16(0), ...u16(0),
    ...u16(1), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
  ];

  const strings = [[1, family], [2, "Regular"], [3, family + " Regular 1.0"], [4, family + " Regular"], [5, "Version 1.0"], [6, family.replace(/[^A-Za-z0-9]/g, "") + "-Regular"]];
  const recs = [];
  for (const s of strings) recs.push({ pid: 1, eid: 0, lid: 0, id: s[0], data: Array.from(s[1], (c) => c.charCodeAt(0) & 127) });
  for (const s of strings) recs.push({ pid: 3, eid: 1, lid: 0x409, id: s[0], data: utf16be(s[1]) });
  recs.sort((a, b) => a.pid - b.pid || a.eid - b.eid || a.lid - b.lid || a.id - b.id);
  const storage = [];
  const name = [...u16(0), ...u16(recs.length), ...u16(6 + 12 * recs.length)];
  for (const r of recs) {
    name.push(...u16(r.pid), ...u16(r.eid), ...u16(r.lid), ...u16(r.id), ...u16(r.data.length), ...u16(storage.length));
    storage.push(...r.data);
  }
  name.push(...storage);

  const os2 = [
    ...u16(4), ...i16(advance), ...u16(400), ...u16(5), ...u16(0),
    ...i16(650), ...i16(600), ...i16(0), ...i16(75), ...i16(650), ...i16(600), ...i16(0), ...i16(350), ...i16(50), ...i16(300),
    ...i16(0), 2, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ...u32(1), ...u32(0), ...u32(0), ...u32(0), // ulUnicodeRange: Basic Latin
    0x4c, 0x4f, 0x50, 0x41, // vendor "LOPA"
    ...u16(0x40), ...u16(FIRST), ...u16(LAST),
    ...i16(800), ...i16(-200), ...i16(0), ...u16(900), ...u16(250),
    ...u32(1), ...u32(0), // code page Latin 1
    ...i16(500), ...i16(700), ...u16(0), ...u16(32), ...u16(1),
  ];
  const post = [...u32(0x00030000), ...u32(0), ...i16(-100), ...i16(50), ...u32(1), ...u32(0), ...u32(0), ...u32(0), ...u32(0)];

  const tables = { "OS/2": os2, cmap, glyf, head, hhea, hmtx, loca, maxp, name, post };
  const tags = Object.keys(tables).sort();
  const n = tags.length;
  let sr = 1, es = 0;
  while (sr * 2 <= n) { sr *= 2; es++; }
  const out = [...u32(0x00010000), ...u16(n), ...u16(sr * 16), ...u16(es), ...u16(n * 16 - sr * 16)];
  let offset = 12 + 16 * n;
  const placed = [];
  for (const tag of tags) {
    const data = tables[tag].slice();
    const length = data.length;
    pad4(data);
    out.push(...Array.from(tag, (c) => c.charCodeAt(0)), ...u32(checksum(data)), ...u32(offset), ...u32(length));
    placed.push({ tag, data, offset });
    offset += data.length;
  }
  for (const p of placed) out.push(...p.data);
  // head.checkSumAdjustment sits 8 bytes into the head table (currently 0 in `out`).
  const headAt = placed.find((p) => p.tag === "head").offset;
  const adj = (0xb1b0afba - checksum(out)) >>> 0;
  out.splice(headAt + 8, 4, ...u32(adj));
  return Uint8Array.from(out);
}

// For Playwright's setInputFiles.
export function fontFile(name = "test.ttf", opts) {
  return { name, mimeType: "font/ttf", buffer: Buffer.from(makeFont(opts)) };
}
