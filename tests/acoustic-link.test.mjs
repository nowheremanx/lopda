// runtime/acoustic-link.js: v2 frame, header, HELLO payload, CRC and port.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const L = require("../runtime/acoustic-link.js");

test("CRC-16/CCITT-FALSE known vector", () => {
  assert.equal(L.crc16([...Buffer.from("123456789")]), 0x29B1);
  assert.equal(L.crc16([0x00]), 0xE1F0);
});

test("the v2 header is nine bytes with session, seq, ack and a one-byte length", () => {
  assert.equal(L.VERSION, 2);
  assert.equal(L.HEADER, 9);
  assert.equal(L.MAX_PAYLOAD, 60);
  assert.equal(L.MORE, 0x80);
  const bytes = L.encode(L.TYPES.DATA, 0x1234, 7, 9, [1, 2, 3], true);
  assert.equal(bytes.length, L.frameLength(3));
  assert.equal(bytes[1], 0x80 | L.TYPES.DATA);
  const h = L.header(bytes);
  assert.deepEqual({ version: h.version, type: h.type, typeName: h.typeName, more: h.more, session: h.session, seq: h.seq, ack: h.ack, length: h.length },
    { version: 2, type: L.TYPES.DATA, typeName: "DATA", more: true, session: 0x1234, seq: 7, ack: 9, length: 3 });
});

test("every v2 type round-trips with ack and MORE", () => {
  for (const type of Object.values(L.TYPES)) {
    const payload = type === L.TYPES.DATA ? [0xA5, 0x5A, 0x00, 0xFF] : [];
    for (const more of type === L.TYPES.DATA ? [false, true] : [false]) {
      const bytes = L.encode(type, 0x1234, 7, 0xBEEF, payload, more);
      assert.equal(bytes.length, L.frameLength(payload.length));
      const r = L.parse(bytes);
      assert.equal(r.ok, true, r.reason);
      assert.equal(r.frame.type, type);
      assert.equal(r.frame.typeName, L.typeName(type));
      assert.equal(r.frame.more, more);
      assert.equal(r.frame.session, 0x1234);
      assert.equal(r.frame.seq, 7);
      assert.equal(r.frame.ack, 0xBEEF);
      assert.deepEqual(r.frame.payload, payload);
    }
  }
});

test("MORE may also arrive through the type argument", () => {
  const bytes = L.encode(L.TYPES.DATA | L.MORE, 1, 2, 3, [1], false);
  assert.equal(bytes[1], 0x80 | L.TYPES.DATA);
  assert.equal(L.header(bytes).more, true);
});

test("MORE belongs to DATA only", () => {
  for (const type of Object.values(L.TYPES)) {
    if (type === L.TYPES.DATA) continue;
    assert.throws(() => L.encode(type, 1, 2, 3, [], true), /MORE/);
    assert.throws(() => L.encode(type | L.MORE, 1, 2, 3, [], false), /MORE/);
    const bytes = L.encode(L.TYPES.DATA, 1, 2, 3, [1]);
    bytes[1] = L.MORE | type;
    assert.equal(L.header(bytes), null);
    assert.equal(L.parse(bytes).reason, "header");
  }
});

test("a bad CRC, version, type or length is refused", () => {
  const bytes = L.encode(L.TYPES.DATA, 9, 1, 0, [1, 2, 3]);
  const badCrc = [...bytes]; badCrc[badCrc.length - 1] ^= 0x01;
  assert.equal(L.parse(badCrc).reason, "crc");

  const oldVersion = [...bytes]; oldVersion[0] = 1;
  assert.equal(L.header(oldVersion), null);
  assert.equal(L.parse(oldVersion).reason, "header");

  const badType = [...bytes]; badType[1] = 99;
  assert.equal(L.header(badType), null);
  assert.equal(L.parse(badType).reason, "header");

  const reserved = [...bytes]; reserved[1] = 0x10 | L.TYPES.DATA;
  assert.equal(L.header(reserved), null);
  assert.equal(L.parse(reserved).reason, "header");

  const longLength = [...bytes]; longLength[8] = L.MAX_PAYLOAD + 1;
  assert.equal(L.header(longLength), null);
  assert.equal(L.parse(longLength).reason, "header");

  const short = bytes.slice(0, bytes.length - 1);
  assert.equal(L.parse(short).reason, "length");
  const extra = [...bytes, 0];
  assert.equal(L.parse(extra).reason, "length");
});

test("a version-1 frame is never read as v2", () => {
  const payload = [1, 2, 3];
  const v1 = [1, L.TYPES.DATA, 0, 9, 0, 1, 0, payload.length, ...payload];
  const c = L.crc16(v1, 0, v1.length);
  v1.push((c >> 8) & 255, c & 255);
  assert.equal(L.header(v1), null);
  assert.equal(L.parse(v1).reason, "header");
});

test("payloads longer than MAX_PAYLOAD are refused", () => {
  assert.throws(() => L.encode(L.TYPES.DATA, 1, 1, 0, new Array(L.MAX_PAYLOAD + 1).fill(0)), /payload/);
  const header = new Array(L.HEADER).fill(0);
  header[0] = 2; header[1] = L.TYPES.DATA; header[8] = L.MAX_PAYLOAD + 1;
  assert.equal(L.header(header), null);
});

test("an empty or short buffer has no header", () => {
  assert.equal(L.header([]), null);
  assert.equal(L.header(new Array(8).fill(0)), null);
  assert.equal(L.parse([]).reason, "header");
});

test("HELLO carries the link protocol, port, nonce and proto", () => {
  const p = L.hello({ port: 0x12345678, nonce: 0xBEEF, proto: "gomoku" });
  assert.equal(p.length, 7 + 6);
  assert.equal(p[0], 1);
  assert.deepEqual(p.slice(1, 5), [0x12, 0x34, 0x56, 0x78]);
  assert.deepEqual(p.slice(5, 7), [0xBE, 0xEF]);
  assert.deepEqual(L.parseHello(p), { linkProto: 1, port: 0x12345678, nonce: 0xBEEF, proto: "gomoku" });
  assert.deepEqual(L.parseHello(L.hello({ port: 1, nonce: 2, proto: "" })),
    { linkProto: 1, port: 1, nonce: 2, proto: "" });
});

test("malformed HELLO payloads are refused", () => {
  assert.equal(L.parseHello(null), null);
  assert.equal(L.parseHello([]), null);
  assert.equal(L.parseHello([1, 0, 0, 0, 0, 0]), null);
  const p = L.hello({ port: 1, nonce: 2, proto: "radio" });
  p[p.length - 1] = 0x80;
  assert.equal(L.parseHello(p), null);
  const oldProto = L.hello({ port: 1, nonce: 2, proto: "radio" });
  oldProto[0] = 2;
  assert.equal(L.parseHello(oldProto), null);
  assert.throws(() => L.hello({ port: 1, nonce: 2, proto: "中文" }), /ASCII/);
  assert.throws(() => L.hello({ port: 1, nonce: 2, proto: "0123456789abcdefg" }), /long/);
});

test("port() is FNV-1a 32 over the app id's UTF-8 bytes", () => {
  assert.equal(L.port(""), 0x811C9DC5);
  assert.equal(L.port("a"), 0xE40C292C);
  assert.equal(L.port("radio"), 0xAE401EB4);
  assert.ok(L.port("radio") >= 0);
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

test("HELLO, HELLO_ACK, DATA, ACK, BYE and PING survive the modem at every rate", () => {
  for (const symbolMs of [10, 20, 40]) {
    for (const [type, payload] of [
      [L.TYPES.HELLO, L.hello({ port: L.port("radio"), nonce: 0x1234, proto: "radio" })],
      [L.TYPES.HELLO_ACK, L.hello({ port: L.port("radio"), nonce: 0x1234, proto: "radio" })],
      [L.TYPES.DATA, AC.testBytes("a5")], [L.TYPES.ACK, []], [L.TYPES.BYE, []], [L.TYPES.PING, []]
    ]) {
      const bytes = L.encode(type, 0x4321, 7, 9, payload, type === L.TYPES.DATA);
      const samples = AC.synth(bytes, { sampleRate: 48000, symbolMs });
      const r = receive(samples, 48000, symbolMs);
      assert.equal(r.ok, true, `${symbolMs} ms ${L.typeName(type)}: ${r.reason}`);
      assert.equal(r.frame.type, type);
      assert.equal(r.frame.more, type === L.TYPES.DATA);
      assert.equal(r.frame.session, 0x4321);
      assert.equal(r.frame.seq, 7);
      assert.equal(r.frame.ack, 9);
      assert.deepEqual(r.frame.payload, payload);
    }
  }
});
