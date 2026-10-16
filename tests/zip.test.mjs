// runtime/zip.js: the notes export zip (stored, UTF-8 names) and reading zips with stored and deflated entries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync, inflateRawSync, crc32 as zcrc } from "node:zlib";
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { runScript, tempDir } from "./helpers.mjs";

const ctx = runScript("runtime/negative.js", { TextEncoder, TextDecoder });
const Z = runScript("runtime/zip.js", { TextEncoder, TextDecoder, LopdaNegative: ctx.LopdaNegative }).LopdaZip;
const enc = (s) => new TextEncoder().encode(s);
const dec = (u) => new TextDecoder().decode(u);
const inflate = (u) => new Uint8Array(inflateRawSync(u));
const plain = (v) => JSON.parse(JSON.stringify(v));

/* an independent reader on Node's side: walk the central directory with Buffer and check every entry with zlib's CRC */
function nodeUnzip(u8) {
  const b = Buffer.from(u8), out = {};
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd >= 0, "end of central directory");
  let p = b.readUInt32LE(eocd + 16);
  for (let i = 0; i < b.readUInt16LE(eocd + 10); i++) {
    assert.equal(b.readUInt32LE(p), 0x02014b50);
    const flags = b.readUInt16LE(p + 8), method = b.readUInt16LE(p + 10), crc = b.readUInt32LE(p + 16);
    const csize = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), off = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nl).toString("utf8");
    assert.equal(flags & 0x0800, 0x0800, "UTF-8 flag on " + name);
    assert.equal(b.readUInt32LE(off), 0x04034b50);
    const start = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28);
    let data = b.subarray(start, start + csize);
    if (method === 8) data = inflateRawSync(data);
    assert.equal(zcrc(data), crc, "CRC of " + name);
    out[name] = data.toString("utf8");
    p += 46 + nl + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  return out;
}
/* a zip the way other tools write one: per entry stored or deflated; flagged or not; optional data descriptor */
function foreignZip(files) {
  const parts = [], cd = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8"), raw = Buffer.from(f.data, "utf8");
    const data = f.deflate ? deflateRawSync(raw) : raw, crc = zcrc(raw), flags = (f.utf8 === false ? 0 : 0x0800) | (f.descriptor ? 8 : 0);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(flags, 6); h.writeUInt16LE(f.deflate ? 8 : 0, 8);
    if (!f.descriptor) { h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); }
    h.writeUInt16LE(name.length, 26);
    const extra = Buffer.from([0x55, 0x54, 0x01, 0x00, 0x00]);    /* an extra field in the local header only, as Info-ZIP writes */
    h.writeUInt16LE(extra.length, 28);
    const parts1 = [h, name, extra, data];
    if (f.descriptor) { const d = Buffer.alloc(16); d.writeUInt32LE(0x08074b50, 0); d.writeUInt32LE(crc, 4); d.writeUInt32LE(data.length, 8); d.writeUInt32LE(raw.length, 12); parts1.push(d); }
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(flags, 8); c.writeUInt16LE(f.deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    cd.push(c, name);
    for (const x of parts1) { parts.push(x); off += x.length; }
  }
  const cdBuf = Buffer.concat(cd), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cdBuf.length, 12); e.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cdBuf, e]));
}

const FILES = [
  { name: "读书 (2).md", data: "---\ntags: [读书]\n---\n读书\n第一行 #读书\n" },
  { name: "日记/10月15日 周四.md", data: "10月15日 周四 · 九月初六\n今天。" },
  { name: "Idea.md", data: "Idea\n" + "long line ".repeat(500) },
  { name: "empty.md", data: "" }
];

test("write: a stored zip that Node's own reading opens, names in UTF-8", () => {
  const z = Z.write(FILES.map((f) => ({ ...f, time: new Date(2026, 9, 15, 23, 43, 10).getTime() })));
  const got = nodeUnzip(z);
  assert.deepEqual(Object.keys(got), FILES.map((f) => f.name));
  for (const f of FILES) assert.equal(got[f.name], f.data);
  /* stored: the text is there as it is */
  assert.ok(Buffer.from(z).includes(Buffer.from("第一行 #读书", "utf8")));
  /* local time in DOS form: 23:43:10 on 2026-10-15 */
  const b = Buffer.from(z);
  assert.equal(b.readUInt16LE(10), (23 << 11) | (43 << 5) | 5);
  assert.equal(b.readUInt16LE(12), ((2026 - 1980) << 9) | (10 << 5) | 15);
});

test("write: unzip -l and unzip -p read it, when unzip is installed", (t) => {
  if (spawnSync("unzip", ["-v"]).status !== 0) { t.skip("unzip is not installed"); return; }
  const dir = tempDir(t), file = join(dir, "notes.zip");
  writeFileSync(file, Z.write(FILES));
  /* a UTF-8 locale, as the CI runner has: Debian's unzip mangled our names there until the zip said "made by Unix" */
  const env = { ...process.env, LC_ALL: "C.UTF-8", LANG: "C.UTF-8" };
  const l = spawnSync("unzip", ["-l", file], { encoding: "utf8", env });
  assert.equal(l.status, 0, l.stderr);
  for (const f of FILES) assert.ok(l.stdout.includes(f.name), f.name + " in\n" + l.stdout);
  const tst = spawnSync("unzip", ["-t", file], { encoding: "utf8", env });
  assert.equal(tst.status, 0, tst.stdout + tst.stderr);
  assert.match(tst.stdout, /No errors detected/);
  const one = spawnSync("unzip", ["-p", file, "日记/10月15日 周四.md"], { encoding: "utf8", env });
  assert.equal(one.stdout, FILES[1].data);
  /* extracted files are plain rw-r--r-- files */
  const out = join(dir, "out");
  assert.equal(spawnSync("unzip", ["-q", file, "-d", out], { env }).status, 0);
  assert.equal(statSync(join(out, "日记/10月15日 周四.md")).mode & 0o777, 0o644);
  assert.equal(readFileSync(join(out, "读书 (2).md"), "utf8"), FILES[0].data);
});

test("read: our own zip back, entry by entry", async () => {
  const z = Z.write(FILES), list = Z.list(z);
  assert.deepEqual(plain(list.map((e) => e.name)), FILES.map((f) => f.name));
  for (let i = 0; i < FILES.length; i++) assert.equal(dec(await Z.read(z, list[i])), FILES[i].data);
  assert.deepEqual(plain(list.map((e) => e.method)), [0, 0, 0, 0]);
});

test("read: stored and deflated entries, data descriptors, a name without the UTF-8 flag, folders", async () => {
  const z = foreignZip([
    { name: "notes/", data: "" },
    { name: "notes/a.md", data: "stored 存储", descriptor: false },
    { name: "notes/b.md", data: "deflated 压缩 ".repeat(200), deflate: true, descriptor: true },
    { name: "notes/c.txt", data: "Mac 的归档工具", deflate: true, utf8: false },
    { name: "__MACOSX/notes/._a.md", data: "junk" }
  ]);
  const list = Z.list(z);
  assert.deepEqual(plain(list.map((e) => [e.name, e.dir, e.method])), [["notes/", true, 0], ["notes/a.md", false, 0], ["notes/b.md", false, 8], ["notes/c.txt", false, 8], ["__MACOSX/notes/._a.md", false, 0]]);
  assert.equal(dec(await Z.read(z, list[1], inflate)), "stored 存储");
  assert.equal(dec(await Z.read(z, list[2], inflate)), "deflated 压缩 ".repeat(200));
  assert.equal(dec(await Z.read(z, list[3], inflate)), "Mac 的归档工具");
  /* an inflate function that answers with a promise, as DecompressionStream does */
  assert.equal(dec(await Z.read(z, list[2], (u) => Promise.resolve(inflate(u)))), "deflated 压缩 ".repeat(200));
});

test("read: a deflated entry without an inflate function says so", async () => {
  const z = foreignZip([{ name: "a.md", data: "x".repeat(100), deflate: true }]);
  await assert.rejects(Z.read(z, Z.list(z)[0]), (e) => e.code === "noinflate");
});

test("a broken zip throws a clean error and never hangs or crashes", async () => {
  const bad = (f) => assert.throws(f, (e) => typeof e.message === "string" && e.code === "badzip" && /^zip: /.test(e.message));
  bad(() => Z.list(new Uint8Array(0)));
  bad(() => Z.list(enc("not a zip at all, just some text that is long enough to scan")));
  const z = Z.write(FILES);
  bad(() => Z.list(z.subarray(0, z.length - 30)));                               /* cut off before the end record */
  const cd = new Uint8Array(z); cd[z.length - 22 + 16] ^= 0xff; bad(() => Z.list(cd)); /* the directory points elsewhere */
  const sig = new Uint8Array(z); new DataView(sig.buffer).setUint32(new DataView(z.buffer).getUint32(z.length - 6, true), 0, true); bad(() => Z.list(sig));
  /* a flipped byte in the data: the CRC catches it */
  const flip = new Uint8Array(z), list = Z.list(flip);
  flip[30 + enc(FILES[0].name).length] ^= 1;
  await assert.rejects(Z.read(flip, list[0]), (e) => e.code === "badzip" && /CRC/.test(e.message));
  /* a local header that is not one */
  const lh = new Uint8Array(z); lh[0] = 0; await assert.rejects(Z.read(lh, Z.list(lh)[0]), (e) => e.code === "badzip");
  /* deflate data that is not deflate */
  const junk = foreignZip([{ name: "a.md", data: "hello hello hello", deflate: true }]);
  const jl = Z.list(junk); junk[30 + 4 + 5] ^= 0xff; junk[30 + 4 + 6] ^= 0xff;
  await assert.rejects(Z.read(junk, jl[0], inflate), (e) => e.code === "badzip");
  /* an unknown method */
  const m = foreignZip([{ name: "a.md", data: "x" }]); new DataView(m.buffer).setUint16(m.length - 22 - 46 - 4 + 10, 12, true);
  await assert.rejects(Z.read(m, Z.list(m)[0], inflate), (e) => e.code === "badzip" && /method 12/.test(e.message));
});

test("crc32 is negative.js's, and matches zlib", () => {
  const data = enc("记事本 2.0");
  assert.equal(ctx.LopdaNegative.crc32(data), zcrc(Buffer.from(data)));
});
