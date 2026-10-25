// runtime/geotag.js: picking a fix, the readable key and the sealed place (decisions.md section 40).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { runScript } from "./helpers.mjs";

const G = runScript("runtime/geotag.js").LopdaGeotag;
const subtle = globalThis.crypto.subtle;
const NOW = 10_000_000;

const fix = (lat, lon, acc, age) => ({ lat, lon, acc, at: NOW - age });

test("pick: a fresh good fix beats an older, more accurate one", () => {
  const got = G.pick([fix(1, 2, 5, 40000), fix(3, 4, 70, 1000)], NOW);
  assert.deepEqual({ ...got }, { lat: 3, lon: 4, acc: 70, at: NOW - 1000 });
});

test("pick: a fresh fix beats a cached first fix that is still young", () => {
  const got = G.pick([fix(1, 2, 10, 25000), fix(3, 4, 90, 1000)], NOW);
  assert.deepEqual({ ...got }, { lat: 3, lon: 4, acc: 90, at: NOW - 1000 });
});

test("pick: only coarse fixes -> the most accurate within 120 s, a tie goes to the newest", () => {
  const fixes = [fix(1, 1, 300, 10000), fix(2, 2, 250, 80000), fix(3, 3, 250, 60000), fix(4, 4, 50, 130000)];
  assert.deepEqual({ ...G.pick(fixes, NOW) }, { lat: 3, lon: 3, acc: 250, at: NOW - 60000 });
});

test("pick: every fix worse than 1000 m is no fix", () => {
  assert.equal(G.pick([fix(1, 1, 1001, 1000), fix(2, 2, 5000, 2000)], NOW), null);
});

test("pick: no fixes at all", () => {
  assert.equal(G.pick([], NOW), null);
  assert.equal(G.pick(null, NOW), null);
});

test("pick: a timestamp in the future counts as fresh", () => {
  const got = G.pick([fix(1, 1, 10, 1000), fix(9, 9, 50, -5000)], NOW);
  assert.deepEqual({ ...got }, { lat: 9, lon: 9, acc: 50, at: NOW + 5000 });
  assert.deepEqual({ ...G.pick([fix(9, 9, 50, -5000)], NOW) }, { lat: 9, lon: 9, acc: 50, at: NOW + 5000 });
});

test("pick: entries with non-finite numbers are ignored, and the result is a copy", () => {
  const fixes = [{ lat: NaN, lon: 1, acc: 5, at: NOW - 1000 }, { lat: 1, lon: 2, acc: Infinity, at: NOW - 2000 },
    fix(3, 4, 20, 3000)];
  const got = G.pick(fixes, NOW);
  assert.deepEqual({ ...got }, { lat: 3, lon: 4, acc: 20, at: NOW - 3000 });
  got.lat = 99;
  assert.equal(fixes[2].lat, 3, "the chosen fix is copied");
});

const KEY = Uint8Array.from({ length: 16 }, (_, i) => i * 7 + 1);

test("keyText: eight groups of four, then a check group; parseKey round trips", () => {
  const text = G.keyText(KEY);
  assert.match(text, /^[0-9A-F]{4}(?:-[0-9A-F]{4}){8}$/);
  assert.deepEqual(Array.from(G.parseKey(text)), Array.from(KEY));
});

test("parseKey accepts lower case, spaces and no dashes", () => {
  const text = G.keyText(KEY);
  assert.deepEqual(Array.from(G.parseKey(text.toLowerCase())), Array.from(KEY));
  assert.deepEqual(Array.from(G.parseKey("  " + text.replace(/-/g, " ").toLowerCase() + "  ")), Array.from(KEY));
  assert.deepEqual(Array.from(G.parseKey(text.replace(/-/g, ""))), Array.from(KEY));
});

test("parseKey refuses one changed digit, a wrong length or another character", () => {
  const text = G.keyText(KEY);
  const first = text[0] === "0" ? "1" : "0";
  assert.equal(G.parseKey(first + text.slice(1)), null, "a data digit changes the CRC");
  const last = text.at(-1) === "0" ? "1" : "0";
  assert.equal(G.parseKey(text.slice(0, -1) + last), null, "a check digit");
  assert.equal(G.parseKey(text.slice(0, -1)), null, "too short");
  assert.equal(G.parseKey(text + "0"), null, "too long");
  assert.equal(G.parseKey(text.replace(/-/g, "") + "0"), null, "too many hex digits");
  assert.equal(G.parseKey(text.slice(0, -1) + "Z"), null, "not hex");
  assert.equal(G.parseKey(null), null);
});

test("keyId is the first four SHA-256 bytes as eight lower-case hex digits, and stable", async () => {
  const want = createHash("sha256").update(Buffer.from(KEY)).digest("hex").slice(0, 8);
  const a = await G.keyId(subtle, KEY);
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(a, want);
  assert.equal(await G.keyId(subtle, KEY), a);
});

test("toHex and fromHex: 16 bytes to 32 hex digits and back", () => {
  const hex = G.toHex(KEY);
  assert.match(hex, /^[0-9a-f]{32}$/);
  assert.deepEqual(Array.from(G.fromHex(hex)), Array.from(KEY));
  assert.deepEqual(Array.from(G.fromHex(hex.toUpperCase())), Array.from(KEY));
  for (const bad of ["", "abcd", hex + "0", hex.slice(1), "g" + hex.slice(1), null]) assert.equal(G.fromHex(bad), null, String(bad));
});

test("seal and open round trip, with the place rounded as the negative stores it", async () => {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const sealed = await G.seal(subtle, KEY, iv, { lat: 12.5000004, lon: -45.2500004, acc: 8.6 });
  assert.equal(sealed.k, await G.keyId(subtle, KEY));
  assert.equal(typeof sealed.iv, "string");
  assert.equal(typeof sealed.ct, "string");
  const got = await G.open(subtle, [{ id: sealed.k, bytes: KEY }], sealed);
  assert.deepEqual({ ...got }, { lat: 12.5, lon: -45.25, acc: 9 });
});

test("open tries the named key first, then every other key in order", async () => {
  const other = new Uint8Array(16).fill(200);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const sealed = await G.seal(subtle, KEY, iv, { lat: 12.5, lon: 45.25, acc: 12 });
  const keyring = [{ id: await G.keyId(subtle, other), bytes: other }, { id: await G.keyId(subtle, KEY), bytes: KEY }];
  assert.deepEqual({ ...await G.open(subtle, keyring, sealed) }, { lat: 12.5, lon: 45.25, acc: 12 });
  /* a keyring whose ids are wrong is still tried: the id is a hint, the tag decides */
  assert.deepEqual({ ...await G.open(subtle, [{ id: "00000000", bytes: KEY }], sealed) }, { lat: 12.5, lon: 45.25, acc: 12 });
});

test("open returns null for a wrong key, a damaged ciphertext or a garbage envelope", async () => {
  const other = new Uint8Array(16).fill(200);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const sealed = await G.seal(subtle, KEY, iv, { lat: 1.5, lon: 2.5, acc: 3 });
  assert.equal(await G.open(subtle, [{ id: await G.keyId(subtle, other), bytes: other }], sealed), null);
  const damaged = { ...sealed, ct: sealed.ct.slice(0, 8) + (sealed.ct[8] === "A" ? "B" : "A") + sealed.ct.slice(9) };
  assert.equal(await G.open(subtle, [{ id: sealed.k, bytes: KEY }], damaged), null);
  for (const bad of [null, undefined, "x", {}, { iv: sealed.iv }, { iv: "!!!!", ct: sealed.ct },
    { iv: sealed.iv, ct: "!!!!" }, { iv: G.toHex(new Uint8Array(12)), ct: sealed.ct }]) {
    assert.equal(await G.open(subtle, [{ id: sealed.k, bytes: KEY }], bad), null, JSON.stringify(bad));
  }
  /* the IV must be twelve bytes; AES-GCM itself would refuse one, so open must check before it decrypts */
  const shortIv = { k: sealed.k, iv: Buffer.from(new Uint8Array(11)).toString("base64"), ct: sealed.ct };
  assert.equal(await G.open(subtle, [{ id: sealed.k, bytes: KEY }], shortIv), null);
});

test("open returns null when the plaintext is JSON but not a place", async () => {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await subtle.importKey("raw", KEY, { name: "AES-GCM" }, false, ["encrypt"]);
  const make = async (text) => {
    const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, new TextEncoder().encode(text)));
    const b64 = (u8) => Buffer.from(u8).toString("base64");
    return { k: await G.keyId(subtle, KEY), iv: b64(iv), ct: b64(ct) };
  };
  for (const text of ["not json", '{"lat":1,"lon":2}', '{"lat":91,"lon":2,"acc":3}',
    '{"lat":1,"lon":181,"acc":3}', '{"lat":1,"lon":2,"acc":-1}', '{"lat":"1","lon":2,"acc":3}']) {
    assert.equal(await G.open(subtle, [{ id: "whatever", bytes: KEY }], await make(text)), null, text);
  }
});

/* ---------- the keyring: a restore merges this phone's keys with the backup's ---------- */

const H1 = "00112233445566778899aabbccddeeff", H2 = "ffeeddccbbaa99887766554433221100", H3 = "0123456789abcdef0123456789abcdef";
const e = (id, key, added = 1000) => ({ id, key, added });
const doc = (keys, current) => ({ keys, current });
const plain = (v) => JSON.parse(JSON.stringify(v));

test("mergeRing: a phone with no keys takes the backup's ring as it was", () => {
  const theirs = doc([e("aaaa0001", H1, 7)], "aaaa0001");
  assert.deepEqual(plain(G.mergeRing(null, theirs)), theirs);
});

test("mergeRing: disjoint rings become a union in mine's order, with the backup's current key", () => {
  const mine = doc([e("11111111", H1)], "11111111");
  const theirs = doc([e("22222222", H2)], "22222222");
  const got = plain(G.mergeRing(mine, theirs));
  assert.deepEqual(got.keys.map((k) => k.id), ["11111111", "22222222"]);
  assert.equal(got.current, "22222222");
});

test("mergeRing: a key both sides hold appears once, and mine's copy is kept", () => {
  const mine = doc([e("11111111", H1, 1), e("22222222", H2, 2)], "11111111");
  const theirs = doc([e("11111111", H1, 99), e("33333333", H3, 3)], "33333333");
  const got = plain(G.mergeRing(mine, theirs));
  assert.deepEqual(got.keys.map((k) => k.id), ["11111111", "22222222", "33333333"]);
  assert.equal(got.keys[0].added, 1, "mine's entry wins on an overlap");
  assert.equal(got.current, "33333333", "the backup's current key is in the union");
});

test("mergeRing: a garbage backup leaves this phone's ring untouched", () => {
  const mine = doc([e("11111111", H1), e("22222222", H2)], "22222222");
  for (const junk of [null, "x", {}, { keys: "nope" }, { keys: [{ id: "short", key: H1 }, { id: "11111111" }] }]) {
    assert.deepEqual(plain(G.mergeRing(mine, junk)), plain(G.cleanRing(mine)), JSON.stringify(junk));
  }
});

test("mergeRing: no valid keys on either side is null", () => {
  assert.equal(G.mergeRing(null, null), null);
  assert.equal(G.mergeRing({}, { keys: [] }), null);
  assert.equal(G.mergeRing({ keys: [{ id: "00000000", key: "nothex" }] }, { keys: [] }), null);
});

test("mergeRing: a key only on this phone is never lost, and its current key stays when the backup has none", () => {
  const mine = doc([e("11111111", H1), e("22222222", H2)], "22222222");
  const theirs = doc([e("11111111", H1)], "deadbeef");
  const got = plain(G.mergeRing(mine, theirs));
  assert.deepEqual(got.keys.map((k) => k.id), ["11111111", "22222222"]);
  assert.equal(got.current, "22222222");
});
