// runtime/exif.js: the EXIF APP1 segment of a single print (decisions.md section 38, docs/design/darkroom.md section 6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const X = runScript("runtime/exif.js").LopdaExif;

/* A JPEG as far as insert/read care: SOI, APP0 JFIF, an old APP1 Exif, COM, SOS with a few scan bytes, EOI.
   insert and read stop at SOS, so no entropy-coded image is needed. */
function segment(marker, payload) {
  const b = Buffer.alloc(4 + payload.length);
  b[0] = 0xff; b[1] = marker; b.writeUInt16BE(payload.length + 2, 2); payload.copy(b, 4);
  return b;
}
function jpeg({ app1 = true } = {}) {
  const app0 = segment(0xe0, Buffer.concat([Buffer.from("JFIF\0", "latin1"), Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0])]));
  /* a browser-style segment we must drop: MM TIFF, IFD0 with no entries */
  const old = segment(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0])]));
  const com = segment(0xfe, Buffer.from("made by hand", "latin1"));
  const sos = segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8]), app0, ...(app1 ? [old] : []), com, sos,
    Buffer.from([0x12, 0x34, 0x56, 0xff, 0x00]), Buffer.from([0xff, 0xd9])]));
}
/* every segment up to SOS, as {marker, start, length}; then the scan start */
function segments(buf) {
  buf = Buffer.from(buf);
  const out = []; let o = 2;
  while (o + 1 < buf.length) {
    assert.equal(buf[o], 0xff, "segment marker at " + o);
    const m = buf[o + 1];
    if (m === 0xda || m === 0xd9) { out.push({ marker: m, start: o, scan: m === 0xda }); break; }
    const len = buf.readUInt16BE(o + 2);
    out.push({ marker: m, start: o, length: len });
    o += 2 + len;
  }
  return out;
}
const offset = (tz) => `${tz < 0 ? "-" : "+"}${String(Math.floor(Math.abs(tz) / 60)).padStart(2, "0")}:${String(Math.abs(tz) % 60).padStart(2, "0")}`;

/* 2026-10-24 20:30 UTC: +08:00 is already the next day, 04:30 local */
const TAKEN = Date.UTC(2026, 9, 24, 20, 30, 0);

test("the local wall clock is taken + tz, for east, zero and west offsets", () => {
  for (const [tz, want] of [[480, "2026:10:25 04:30:00"], [0, "2026:10:24 20:30:00"], [-300, "2026:10:24 15:30:00"], [330, "2026:10:25 02:00:00"]]) {
    const out = X.insert(jpeg(), { taken: TAKEN, tz, software: "Lo-PDA 0.39.0" });
    const got = X.read(out);
    assert.equal(got.dateTimeOriginal, want, "tz " + tz);
    assert.equal(got.offsetTimeOriginal, offset(tz), "offset " + tz);
  }
});

test("a midnight crossing in local time does not become the UTC day", () => {
  /* +08:00: 2026-10-24 20:30 UTC is 2026-10-25 04:30 in the shooting time zone */
  const got = X.read(X.insert(jpeg(), { taken: TAKEN, tz: 480, software: "Lo-PDA 0.39.0" }));
  assert.equal(got.dateTimeOriginal, "2026:10:25 04:30:00");
  assert.notEqual(got.dateTimeOriginal.slice(0, 10), new Date(TAKEN).toISOString().slice(0, 10).replace(/-/g, ":"));
  /* and the other way: -05:00, still the day before in UTC */
  const back = X.read(X.insert(jpeg(), { taken: Date.UTC(2026, 9, 25, 2, 0, 0), tz: -300, software: "Lo-PDA 0.39.0" }));
  assert.equal(back.dateTimeOriginal, "2026:10:24 21:00:00");
});

test("Make, Model and Software are Lo-PDA; ExifVersion 0232 is written", () => {
  const out = X.insert(jpeg(), { taken: TAKEN, tz: 480, software: "Lo-PDA 0.39.0" });
  const got = X.read(out);
  assert.equal(got.make, "Lo-PDA");
  assert.equal(got.model, "Lo-PDA");
  assert.equal(got.software, "Lo-PDA 0.39.0");
  assert.ok(Buffer.from(out).includes(Buffer.from("0232", "latin1")), "ExifVersion");
});

test("every out-of-line value starts on an even offset; the Exif pointer is the Exif IFD start", () => {
  const out = X.insert(jpeg(), { taken: TAKEN, tz: 480, software: "Lo-PDA 0.39.0" });
  const seg = segments(out).find((s) => s.marker === 0xe1);
  const tiff = Buffer.from(out.subarray(seg.start + 10, seg.start + 2 + seg.length));
  const u16 = (o) => tiff.readUInt16BE(o), u32 = (o) => tiff.readUInt32BE(o);
  const typeBytes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const walk = (at) => {
    assert.equal(at % 2, 0, "an IFD starts even");
    const n = u16(at), entries = {};
    /* where this IFD and its out-of-line values end, so the next IFD can be checked against it */
    let end = at + 2 + n * 12 + 4;
    for (let i = 0; i < n; i++) {
      const o = at + 2 + i * 12, tag = u16(o), type = u16(o + 2), count = u32(o + 4);
      const bytes = (typeBytes[type] || 1) * count;
      entries[tag] = { type, count, pos: o, value: u32(o + 8) };
      if (bytes > 4) {
        const v = u32(o + 8);
        assert.equal(v % 2, 0, "tag 0x" + tag.toString(16) + " at an even offset");
        assert.ok(v + bytes <= tiff.length, "value inside the TIFF block");
        end = Math.max(end, v + ((bytes + 1) & ~1));
      }
    }
    return { entries, end };
  };
  const ifd0 = walk(u32(4));
  const pointer = ifd0.entries[0x8769].value;
  assert.equal(pointer, ifd0.end, "0x8769 points exactly at the Exif IFD");
  const exif = walk(pointer).entries;
  assert.equal(exif[0x9000].type, 7, "ExifVersion is UNDEFINED");
  assert.equal(exif[0x9000].count, 4);
  assert.equal(tiff.toString("latin1", exif[0x9000].pos + 8, exif[0x9000].pos + 12), "0232");
});

test("an impossible tz falls back to the device's offset at that instant", () => {
  const fallback = -new Date(TAKEN).getTimezoneOffset();
  for (const tz of [900, 1e12, -841, 1.5, NaN]) {
    const got = X.read(X.insert(jpeg(), { taken: TAKEN, tz, software: "Lo-PDA 0.39.0" }));
    assert.equal(got.offsetTimeOriginal, offset(fallback), "tz " + tz);
  }
});

test("the result is still a JPEG: SOI first, one Exif APP1 after it, segments parse, EOI last", () => {
  const out = X.insert(jpeg(), { taken: TAKEN, tz: 480, software: "Lo-PDA 0.39.0" });
  assert.deepEqual([...out.subarray(0, 3)], [0xff, 0xd8, 0xff], "SOI then a marker");
  assert.deepEqual([...out.subarray(out.length - 2)], [0xff, 0xd9], "EOI");
  const segs = segments(out);
  assert.equal(segs[0].marker, 0xe1, "the Exif APP1 goes right after SOI");
  assert.ok(Buffer.from(out).subarray(segs[0].start + 4, segs[0].start + 10).equals(Buffer.from("Exif\0\0", "latin1")));
  assert.deepEqual(segs.map((s) => s.marker), [0xe1, 0xe0, 0xfe, 0xda], "APP1, APP0, COM, SOS");
  assert.ok(segs.at(-1).scan, "the scan data starts at SOS");
});

test("an existing Exif APP1 is replaced, not duplicated; its old bytes are gone", () => {
  const out = X.insert(jpeg({ app1: true }), { taken: TAKEN, tz: 0, software: "Lo-PDA 0.39.0" });
  const exif = segments(out).filter((s) => s.marker === 0xe1);
  assert.equal(exif.length, 1, "one APP1");
  assert.ok(exif[0].length > 100, "it is the new segment, not the old empty IFD");
  assert.equal(X.read(out).dateTimeOriginal, "2026:10:24 20:30:00");
});

test("a JPEG without EXIF, and a byte array that is not a JPEG", () => {
  assert.equal(X.read(jpeg({ app1: false })), null);
  assert.equal(X.read(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), null);
  assert.equal(X.read(new Uint8Array(0)), null);
  assert.throws(() => X.insert(new Uint8Array([1, 2, 3, 4]), { taken: TAKEN, tz: 0 }), /not a JPEG/);
});

test("insert does not change its input", () => {
  const src = jpeg();
  const before = Buffer.from(src);
  X.insert(src, { taken: TAKEN, tz: 480, software: "Lo-PDA 0.39.0" });
  assert.ok(Buffer.from(src).equals(before));
});
