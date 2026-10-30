// runtime/acoustic-link.js: M3 frame, CRC and header.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("../runtime/acoustic-link.js");

test("CRC-16/CCITT-FALSE known vector", () => {
  assert.equal(L.crc16([...Buffer.from("123456789")]), 0x29B1);
  assert.equal(L.crc16([0x00]), 0xE1F0);
});

test("every M3 type round-trips with a header and payload", () => {
  for (const type of Object.values(L.TYPES)) {
    const payload = type === L.TYPES.DATA ? [0xA5, 0x5A, 0x00, 0xFF] : [];
    const bytes = L.encode(type, 0x1234, 7, payload);
    assert.equal(bytes.length, L.frameLength(payload.length));
    const h = L.header(bytes);
    assert.deepEqual({ version: h.version, type: h.type, session: h.session, seq: h.seq, length: h.length },
      { version: 1, type, session: 0x1234, seq: 7, length: payload.length });
    const r = L.parse(bytes);
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.frame.type, type);
    assert.equal(r.frame.session, 0x1234);
    assert.equal(r.frame.seq, 7);
    assert.deepEqual(r.frame.payload, payload);
  }
});

test("a changed payload, length or CRC is refused", () => {
  const bytes = L.encode(L.TYPES.DATA, 9, 1, [1, 2, 3]);
  const badCrc = [...bytes]; badCrc[badCrc.length - 1] ^= 0x01;
  assert.equal(L.parse(badCrc).reason, "crc");

  const badVersion = [...bytes]; badVersion[0] = 2;
  assert.equal(L.parse(badVersion).reason, "header");

  const badType = [...bytes]; badType[1] = 99;
  assert.equal(L.parse(badType).reason, "header");

  const short = bytes.slice(0, bytes.length - 1);
  assert.equal(L.parse(short).reason, "length");
});

test("payloads longer than MAX_PAYLOAD are refused", () => {
  assert.throws(() => L.encode(L.TYPES.DATA, 1, 1, new Array(L.MAX_PAYLOAD + 1).fill(0)), /payload/);
  const header = new Array(L.HEADER).fill(0);
  header[0] = 1; header[1] = 3; header[7] = L.MAX_PAYLOAD + 1;
  assert.equal(L.header(header), null);
});

test("an empty or short buffer has no header", () => {
  assert.equal(L.header([]), null);
  assert.equal(L.header(new Array(7).fill(0)), null);
  assert.equal(L.parse([]).reason, "header");
});

// The frame as it travels through the M2 modem: preamble + frame bytes at every rate.
import { createRequire as req2 } from "node:module";
const AC = req2(import.meta.url)("../runtime/acoustic.js");

function receive(samples, sampleRate, symbolMs) {
  const head = AC.decode(samples, { sampleRate, symbolMs, symbolCount: L.HEADER * 4 });
  if (!head.sync.ok) return { ok: false, reason: "sync" };
  const h = L.header(head.bytes);
  if (!h) return { ok: false, reason: "header" };
  const body = AC.decodePayload(samples, {
    sampleRate, symbolMs, startSample: head.sync.startSample, symbolCount: L.frameLength(h.length) * 4
  });
  return L.parse(body.bytes);
}

test("HELLO, DATA, ACK and FIN survive the modem at every M3 rate", () => {
  for (const symbolMs of [10, 20, 40]) {
    for (const [type, payload] of [
      [L.TYPES.HELLO, []], [L.TYPES.HELLO_ACK, []], [L.TYPES.DATA, AC.testBytes("a5")],
      [L.TYPES.ACK, []], [L.TYPES.NACK, []], [L.TYPES.FIN, []]
    ]) {
      const bytes = L.encode(type, 0x4321, 7, payload);
      const samples = AC.synth(bytes, { sampleRate: 48000, symbolMs });
      const r = receive(samples, 48000, symbolMs);
      assert.equal(r.ok, true, `${symbolMs} ms ${L.typeName(type)}: ${r.reason}`);
      assert.equal(r.frame.type, type);
      assert.equal(r.frame.session, 0x4321);
      assert.equal(r.frame.seq, 7);
      assert.deepEqual(r.frame.payload, payload);
    }
  }
});
