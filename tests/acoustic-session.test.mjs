// runtime/acoustic-session.js: symmetric pairing and a reliable link over a fake
// half-duplex channel with a manual clock.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const S = require("../runtime/acoustic-session.js");
const L = require("../runtime/acoustic-link.js");

const PORT = L.port("radio");
const PROTO = "test";

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The first call is beginListen's duration; the collision test fixes it so both
// sides speak at exactly the same instant.
function makeRandom(seed, firstListen) {
  const base = mulberry32(seed);
  let first = true;
  return function () {
    if (first && firstListen !== null) { first = false; return firstListen; }
    first = false;
    return base();
  };
}

class Side {
  constructor({ port, proto, random, firstSeq }) {
    this.session = S.create({ port, proto, random, firstSeq });
    this.startAt = 0;
    this.tx = null;
    this.frames = [];
    this.statuses = [];
    this.opens = [];
    this.rates = [];
    this.messages = [];
    this.results = [];
    this.closes = [];
  }
}

class Harness {
  constructor({ portA = PORT, protoA = PROTO, seedA = 11, portB = PORT, protoB = PROTO, seedB = 22,
    startA = 0, startB = 0, loss = 0, lossSeed = 1, dropHelloRate = null, dropHelloAcks = 0,
    firstListen = null, firstSeq, noSent = false, deafStart = 0, deafAfterTx = 0, senseDelay = 0 } = {}) {
    this.t = 0;
    // A phone is not a perfect radio: its microphone takes a while to start (deafStart, from the side's own
    // start), an iPhone closes it while it sends and needs a while to reopen it (deafAfterTx), and carrier
    // sense notices the other side's burst only after a microphone block or two (senseDelay).
    this.deafStart = deafStart;
    this.deafAfterTx = deafAfterTx;
    this.senseDelay = senseDelay;
    this.loss = loss;
    this.lossRng = mulberry32(lossSeed);
    this.dropHelloRate = dropHelloRate;
    this.dropHelloAcks = dropHelloAcks;
    this.helloDrops = new Map();
    this.noSent = noSent;
    this.afterStep = null;
    this.a = new Side({ port: portA, proto: protoA, random: makeRandom(seedA, firstListen), firstSeq });
    this.b = new Side({ port: portB, proto: protoB, random: makeRandom(seedB, firstListen), firstSeq });
    this.a.startAt = startA;
    this.b.startAt = startB;
    this.a.other = this.b;
    this.b.other = this.a;
    this.sides = [this.a, this.b];
    this.intervals = [];
  }

  // One 10 ms tick: finish bursts whose air time is over, keep the listener's
  // carrier sense fresh, tick both sessions, then start whatever they asked for.
  step() {
    this.t += 10;
    const t = this.t;
    for (const s of this.sides) {
      if (!s.tx || t < s.tx.end) continue;
      const tx = s.tx;
      s.tx = null;
      // Overlapping bursts garble each other in both directions.
      const overlap = this.intervals.some((o) => o.side !== s && o.start < tx.end && tx.start < o.end);
      const p = L.parse(tx.bytes);
      let deliver = !overlap && p.ok && this.lossRng() >= this.loss;
      if (deliver && this.dropHelloRate !== null && p.frame.type === L.TYPES.HELLO && tx.rate === this.dropHelloRate) {
        // Each side loses its first three HELLOs at this rate, so it steps up.
        const n = this.helloDrops.get(s) || 0;
        if (n < 3) { this.helloDrops.set(s, n + 1); deliver = false; }
      }
      if (deliver && this.dropHelloAcks > 0 && p.frame.type === L.TYPES.HELLO_ACK) {
        this.dropHelloAcks--;
        deliver = false;
      }
      if (!this.noSent) s.session.sent(t);
      s.lastTxEnd = t;
      // a deaf receiver does not hear a frame whose start it missed
      if (deliver && !this.deaf(s.other, tx.start) && !this.deaf(s.other, t)) s.other.session.heard(tx.bytes, t, tx.rate);
    }
    for (const s of this.sides) {
      if (s.other.tx && s.other.tx.start + this.senseDelay <= t && t < s.other.tx.end && !this.deaf(s, t)) s.session.busy(t);
    }
    for (const s of this.sides) if (t >= s.startAt) s.session.tick(t);
    for (const s of this.sides) this.pump(s, t);
    if (this.afterStep) this.afterStep();
    if (this.intervals.length > 64) this.intervals = this.intervals.filter((o) => o.end > t - 3000);
  }

  deaf(side, t) {
    if (t < side.startAt + this.deafStart) return true;
    if (side.tx) return true;                       // half duplex: our own burst is on the air
    return side.lastTxEnd != null && t < side.lastTxEnd + this.deafAfterTx;
  }

  pump(side, t) {
    for (const a of side.session.poll()) {
      if (a.do === "tx") {
        if (side.tx) {
          const p = L.parse(a.bytes);
          if (!p.ok || p.frame.type !== L.TYPES.BYE) throw new Error("second tx before sent()");
        }
        side.tx = { bytes: a.bytes, rate: a.rate, start: t, end: t + S.airMs(a.bytes.length, a.rate) };
        this.intervals.push({ side, start: side.tx.start, end: side.tx.end });
        const p = L.parse(a.bytes);
        side.frames.push({ t, rate: a.rate, ok: p.ok, frame: p.ok ? p.frame : null, bytes: a.bytes });
      } else if (a.do === "message") side.messages.push(a.data);
      else if (a.do === "result") side.results.push(a);
      else if (a.do === "close") side.closes.push(a.reason);
      else if (a.do === "open") side.opens.push(a);
      else if (a.do === "status") side.statuses.push(a);
      else if (a.do === "rate") side.rates.push(a.rate);
      else throw new Error("unknown action " + a.do);
    }
  }
}

function run(h, ms) {
  for (let i = 0; i < ms / 10; i++) h.step();
}

function runUntil(h, cond, maxMs) {
  let waited = 0;
  while (waited < maxMs) {
    if (cond()) return waited;
    h.step();
    waited += 10;
  }
  return waited;
}

function opened(h, ms = 40000) {
  runUntil(h, () => h.a.opens.length && h.b.opens.length, ms);
  assert.equal(h.a.opens.length, 1, "a should open once");
  assert.equal(h.b.opens.length, 1, "b should open once");
  assert.equal(h.a.session.state, "open");
  assert.equal(h.b.session.state, "open");
  assert.notEqual(h.a.opens[0].initiator, h.b.opens[0].initiator, "exactly one initiator");
  assert.equal(h.a.opens[0].rate, h.b.opens[0].rate, "both choose the same rate");
  assert.ok(S.RATES.includes(h.a.opens[0].rate));
}

function sendWhenReady(side, data) {
  const r = side.session.send(data);
  assert.equal(typeof r, "number", "send should queue, got " + r);
  return r;
}

test("pairing: both start at the same tick, exactly one initiator and one rate", () => {
  const h = new Harness({ seedA: 3, seedB: 8 });
  opened(h);
  assert.ok(h.a.statuses.some((s) => s.phase === "listen" && s.rate === 20));
});

test("pairing: a late start still pairs", () => {
  const h = new Harness({ seedA: 4, seedB: 9, startB: 2600 });
  opened(h, 60000);
});

test("pairing: a few seeds all pair", () => {
  for (let seed = 1; seed <= 6; seed++) {
    const h = new Harness({ seedA: seed * 7, seedB: seed * 13 + 1 });
    opened(h);
  }
});

test("pairing under 20% and 30% frame loss", () => {
  for (const loss of [0.2, 0.3]) {
    let ok = 0, failed = 0, mixed = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const h = new Harness({ seedA: 7000 + seed * 29, seedB: 9000 + seed * 31, loss, lossSeed: seed });
      runUntil(h,
        () => (h.a.opens.length && h.b.opens.length) || (h.a.closes.length && h.b.closes.length),
        200000);
      if (h.a.opens.length && h.b.opens.length) {
        if (h.a.opens.length !== 1 || h.b.opens.length !== 1 ||
          h.a.opens[0].initiator === h.b.opens[0].initiator ||
          h.a.session.rate !== h.b.session.rate) {
          throw new Error("bad open at loss " + loss + " seed " + seed);
        }
        ok++;
      } else if (h.a.closes.length && h.b.closes.length) {
        failed++;
      } else {
        mixed++;
      }
    }
    console.log("pairing at " + Math.round(loss * 100) + "% loss: " +
      ok + " open, " + failed + " failed, " + mixed + " mixed");
    assert.equal(mixed, 0, "pairing must settle on both sides");
    assert.ok(ok >= 45, "most seeds should pair");
  }
});

test("a forced collision of both first HELLOs still pairs later", () => {
  const h = new Harness({ seedA: 41, seedB: 43, firstListen: 0.25 });
  opened(h, 60000);
  const ah = h.a.frames.find((f) => f.ok && f.frame.type === L.TYPES.HELLO);
  const bh = h.b.frames.find((f) => f.ok && f.frame.type === L.TYPES.HELLO);
  assert.ok(ah && bh);
  assert.equal(ah.t, bh.t, "both HELLOs go out on the same 10 ms tick");
  const hellos = h.a.frames.concat(h.b.frames).filter((f) => f.ok && f.frame.type === L.TYPES.HELLO);
  assert.ok(hellos.length >= 3, "the collision cost at least one retry");
});

test("each side's first three 20 ms HELLOs are lost, so both open at 40", () => {
  const h = new Harness({ seedA: 51, seedB: 53, dropHelloRate: 20 });
  opened(h, 90000);
  assert.equal(h.a.session.rate, 40);
  assert.equal(h.b.session.rate, 40);
  assert.equal(h.a.frames.filter((f) => f.ok && f.frame.type === L.TYPES.HELLO && f.rate === 20).length, 3);
  assert.equal(h.b.frames.filter((f) => f.ok && f.frame.type === L.TYPES.HELLO && f.rate === 20).length, 3);
});

test("the responder follows a repeated HELLO to a new rate", () => {
  // Three lost HELLO_ACKs push the initiator to 40 ms; the responder, still
  // waiting for the initiator's ACK (three-way handshake), answers at 40 and
  // opens there.
  const h = new Harness({ seedA: 71, seedB: 73, dropHelloAcks: 3 });
  runUntil(h, () => h.a.opens.length && h.b.opens.length, 120000);
  assert.equal(h.a.session.state, "open");
  assert.equal(h.b.session.state, "open");
  assert.notEqual(h.a.opens[0].initiator, h.b.opens[0].initiator);
  assert.equal(h.a.session.rate, 40);
  assert.equal(h.b.session.rate, 40);
  const follower = h.a.opens[0].initiator ? h.b : h.a;
  assert.equal(follower.opens[0].rate, 40, "the responder opened at 40");
});

test("a lost first HELLO_ACK plus a queued responder message still pairs", () => {
  const h = new Harness({ seedA: 61, seedB: 63, dropHelloAcks: 1 });
  let responder = null;
  h.afterStep = () => {
    if (responder) return;
    // the responder is the side that opens as non-initiator (it opens after the initiator's ACK)
    const first = h.a.opens.length && !h.a.opens[0].initiator ? h.a : (h.b.opens.length && !h.b.opens[0].initiator ? h.b : null);
    if (first) {
      responder = first;
      assert.equal(typeof responder.session.send("queued on the responder"), "number");
    }
  };
  runUntil(h, () => h.a.opens.length === 1 && h.b.opens.length === 1, 90000);
  assert.ok(responder, "one side opened as responder");
  const initiator = responder === h.a ? h.b : h.a;
  assert.equal(h.a.session.state, "open");
  assert.equal(h.b.session.state, "open");
  assert.notEqual(h.a.opens[0].initiator, h.b.opens[0].initiator);
  runUntil(h, () => initiator.messages.length === 1, 60000);
  assert.deepEqual(initiator.messages, ["queued on the responder"]);
  // The initiator retried after the lost ACK, with a fresh nonce.
  const hellos = initiator.frames.filter((f) => f.ok && f.frame.type === L.TYPES.HELLO);
  assert.ok(hellos.length >= 2, "the initiator retried its HELLO");
  const n0 = L.parseHello(hellos[0].frame.payload).nonce;
  const n1 = L.parseHello(hellos[hellos.length - 1].frame.payload).nonce;
  assert.notEqual(n0, n1, "each HELLO attempt has a new nonce");
});

test("messages both ways: Chinese text and bytes arrive with their type", () => {
  const h = new Harness({ seedA: 5, seedB: 12 });
  opened(h);

  sendWhenReady(h.a, "你好，世界");
  runUntil(h, () => h.b.messages.length === 1, 60000);
  assert.equal(h.b.messages.length, 1);
  assert.equal(typeof h.b.messages[0], "string");
  assert.equal(h.b.messages[0], "你好，世界");

  sendWhenReady(h.b, new Uint8Array([0, 1, 2, 250, 255]));
  runUntil(h, () => h.a.messages.length === 1, 60000);
  assert.equal(h.a.messages.length, 1);
  assert.ok(h.a.messages[0] instanceof Uint8Array);
  assert.deepEqual([...h.a.messages[0]], [0, 1, 2, 250, 255]);

  sendWhenReady(h.b, "第二台机器的中文");
  runUntil(h, () => h.a.messages.length === 2, 60000);
  assert.equal(h.a.messages[1], "第二台机器的中文");
  assert.equal(typeof h.a.messages[1], "string");
});

test("a 200-byte message is four DATA fragments and arrives whole", () => {
  const h = new Harness({ seedA: 6, seedB: 14 });
  opened(h);
  const text = "a".repeat(200);
  const before = h.a.frames.length;
  sendWhenReady(h.a, text);
  runUntil(h, () => h.b.messages.length === 1, 60000);
  assert.equal(h.b.messages.length, 1);
  assert.equal(h.b.messages[0], text);
  const data = h.a.frames.slice(before).filter((f) => f.ok && f.frame.type === L.TYPES.DATA);
  assert.equal(data.length, 4, "kind byte + 200 bytes is 4 chunks of 60");
  assert.equal(data.filter((f) => f.frame.more).length, 3);
});

test("201 bytes is too big", () => {
  const h = new Harness({ seedA: 7, seedB: 15 });
  opened(h);
  assert.equal(h.a.session.send("a".repeat(201)), "big");
  assert.equal(h.a.session.send(new Uint8Array(201)), "big");
  assert.equal(h.a.session.send(new Uint8Array(200)), 1);
});

test("the fifth queued message is refused", () => {
  const h = new Harness({ seedA: 8, seedB: 16 });
  opened(h);
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push(h.a.session.send("m" + i));
  assert.deepEqual(ids, [1, 2, 3, 4]);
  assert.equal(h.a.session.send("m4"), "busy");
});

test("results come back in order", () => {
  const h = new Harness({ seedA: 9, seedB: 17 });
  opened(h);
  for (const s of ["one", "two", "three"]) sendWhenReady(h.a, s);
  runUntil(h, () => h.a.results.length === 3, 120000);
  assert.deepEqual(h.a.results.map((r) => r.id), [1, 2, 3]);
  assert.deepEqual(h.a.results.map((r) => r.v), ["sent", "sent", "sent"]);
});

test("16-bit wrap: sequence numbers cross 65535 and 0 is skipped", () => {
  const h = new Harness({ seedA: 19, seedB: 29, firstSeq: 65535 });
  opened(h);
  for (let i = 0; i < 4; i++) sendWhenReady(h.a, "w" + i);
  runUntil(h, () => h.a.results.length >= 1, 120000);
  sendWhenReady(h.a, "w4");
  runUntil(h, () => h.b.messages.length === 5 && h.a.results.length === 5, 240000);
  assert.deepEqual(h.b.messages, ["w0", "w1", "w2", "w3", "w4"]);
  assert.deepEqual(h.a.results.map((r) => r.id), [1, 2, 3, 4, 5]);
  assert.ok(h.a.results.every((r) => r.v === "sent"));
  const seqs = h.a.frames.filter((f) => f.ok && f.frame.type === L.TYPES.DATA).map((f) => f.frame.seq);
  assert.deepEqual(seqs.slice(0, 5), [65535, 1, 2, 3, 4]);
});

test("20% frame loss still delivers five messages each way, in order", () => {
  // Five tries per frame at 20 % loss: about one conversation in 50 still ends "lost" (60 seeds measured, before
  // and after the three-way handshake), so these seeds are ones that get through, not a guarantee.
  for (const seed of [3, 5, 9]) {
    const h = new Harness({ seedA: 20 + seed, seedB: 40 + seed, lossSeed: seed });
    opened(h);
    h.loss = 0.2;
    for (let i = 0; i < 4; i++) {
      sendWhenReady(h.a, "a-" + i);
      sendWhenReady(h.b, "b-" + i);
    }
    runUntil(h, () => h.a.results.length >= 1 && h.b.results.length >= 1, 120000);
    sendWhenReady(h.a, "a-4");
    sendWhenReady(h.b, "b-4");

    runUntil(
      h,
      () => h.a.messages.length === 5 && h.b.messages.length === 5 &&
        h.a.results.length === 5 && h.b.results.length === 5,
      600000
    );
    assert.equal(h.a.messages.length, 5, "seed " + seed + ": every message reached a");
    assert.equal(h.b.messages.length, 5, "seed " + seed + ": every message reached b");
    assert.deepEqual(h.b.messages, ["a-0", "a-1", "a-2", "a-3", "a-4"]);
    assert.deepEqual(h.a.messages, ["b-0", "b-1", "b-2", "b-3", "b-4"]);
    assert.deepEqual(h.a.results.map((r) => r.id), [1, 2, 3, 4, 5]);
    assert.deepEqual(h.b.results.map((r) => r.id), [1, 2, 3, 4, 5]);
    assert.ok(h.a.results.every((r) => r.v === "sent"));
    assert.ok(h.b.results.every((r) => r.v === "sent"));
    assert.deepEqual(h.a.closes, []);
    assert.deepEqual(h.b.closes, []);
  }
});

test("20% data loss over 100 seeded pairs", () => {
  let ok = 0, bad = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const h = new Harness({ seedA: 3000 + seed * 13, seedB: 5000 + seed * 17, lossSeed: seed });
    opened(h, 60000);
    h.loss = 0.2;
    for (let i = 0; i < 4; i++) {
      sendWhenReady(h.a, "a-" + i);
      sendWhenReady(h.b, "b-" + i);
    }
    runUntil(h, () => (h.a.results.length >= 1 && h.b.results.length >= 1) ||
      h.a.closes.length || h.b.closes.length, 120000);
    if (!h.a.closes.length && !h.b.closes.length) {
      h.a.session.send("a-4");
      h.b.session.send("b-4");
    }
    runUntil(h,
      () => (h.a.messages.length === 5 && h.b.messages.length === 5 &&
        h.a.results.length === 5 && h.b.results.length === 5) ||
        h.a.closes.length || h.b.closes.length,
      300000);
    const good = h.a.messages.length === 5 && h.b.messages.length === 5 &&
      h.a.results.length === 5 && h.b.results.length === 5 &&
      h.a.results.every((r) => r.v === "sent") && h.b.results.every((r) => r.v === "sent") &&
      !h.a.closes.length && !h.b.closes.length;
    if (good) ok++; else bad++;
  }
  console.log("20% data loss: " + ok + "/100 pairs delivered five messages each way (" + bad + " failed)");
  assert.ok(ok >= 90, "at least 90 of 100 seeds should deliver everything");
});

test("a silent peer makes both sides close lost, and the in-flight message loses", () => {
  const h = new Harness({ seedA: 21, seedB: 33 });
  opened(h);
  sendWhenReady(h.a, "into the void");
  run(h, 1500); // let the DATA frame go out
  h.loss = 1;

  runUntil(h, () => h.a.closes.length && h.b.closes.length, 180000);
  assert.deepEqual(h.a.closes, ["lost"]);
  assert.deepEqual(h.b.closes, ["lost"]);
  const lost = h.a.results.find((r) => r.v === "lost");
  assert.ok(lost, "the in-flight message reports lost");
});

test("close() sends one BYE and the peer closes bye", () => {
  const h = new Harness({ seedA: 23, seedB: 35 });
  opened(h);
  h.a.session.close();
  h.step(); // collects the BYE tx and the local close action
  assert.deepEqual(h.a.closes, ["local"]);
  assert.equal(h.a.session.state, "closed");
  assert.equal(h.a.session.send("nope"), "closed");
  runUntil(h, () => h.b.closes.length === 1, 30000);
  assert.deepEqual(h.b.closes, ["bye"]);
  assert.equal(h.b.session.state, "closed");
  assert.equal(h.a.frames.filter((f) => f.ok && f.frame.type === L.TYPES.BYE).length, 1,
    "exactly one BYE goes out");
});

test("a different port is other-app on both sides", () => {
  const h = new Harness({ seedA: 24, seedB: 36, portB: PORT ^ 0x0101 });
  runUntil(h, () => h.a.closes.length && h.b.closes.length, 30000);
  assert.deepEqual(h.a.closes, ["other-app"]);
  assert.deepEqual(h.b.closes, ["other-app"]);
});

test("a different proto is other-app on both sides", () => {
  const h = new Harness({ seedA: 25, seedB: 37, protoB: "gomoku" });
  runUntil(h, () => h.a.closes.length && h.b.closes.length, 30000);
  assert.deepEqual(h.a.closes, ["other-app"]);
  assert.deepEqual(h.b.closes, ["other-app"]);
});

test("nobody answers: 60 s of HELLOs steps 20 -> 40, then timeout", () => {
  const session = S.create({ port: PORT, proto: PROTO, random: mulberry32(77) });
  let tx = null, closeReason = null;
  const rates = [];
  for (let t = 0; t <= 65000; t += 10) {
    if (tx && t >= tx.end) { session.sent(t); tx = null; }
    session.tick(t);
    for (const a of session.poll()) {
      if (a.do === "tx") {
        assert.equal(tx, null);
        tx = { end: t + S.airMs(a.bytes.length, a.rate) };
        const p = L.parse(a.bytes);
        if (p.ok && p.frame.type === L.TYPES.HELLO) rates.push(a.rate);
      } else if (a.do === "close") {
        closeReason = a.reason;
      }
    }
  }
  assert.equal(closeReason, "timeout");
  // 40 ms HELLOs are long, and every unanswered HELLO widens the quiet time before the next (exponential backoff)
  // and waits for the slowest answer (TURN_MAX): 10 is not reached in 60 s
  assert.deepEqual(rates.slice(0, 4), [20, 20, 20, 40]);
});

test("a host that never calls sent() is rescued by the watchdog", () => {
  const h = new Harness({ seedA: 81, seedB: 82, noSent: true });
  opened(h, 90000);
});

test("the heartbeat keeps an idle link open for five minutes", () => {
  const h = new Harness({ seedA: 26, seedB: 38 });
  opened(h);
  run(h, 300000);
  assert.equal(h.a.session.state, "open");
  assert.equal(h.b.session.state, "open");
  assert.deepEqual(h.a.closes, []);
  assert.deepEqual(h.b.closes, []);
  const pings = h.a.frames.concat(h.b.frames).filter((f) => f.ok && f.frame.type === L.TYPES.PING);
  assert.ok(pings.length >= 8, "expected regular PINGs, saw " + pings.length);
  assert.ok(pings.length <= 14, "PINGs should be about one per 25 s, saw " + pings.length);
});

test("a duplicate DATA frame is re-acked and not delivered twice", () => {
  const h = new Harness({ seedA: 27, seedB: 39 });
  opened(h);
  sendWhenReady(h.a, "only once");
  runUntil(h, () => h.b.messages.length === 1, 60000);
  const sent = h.a.frames.find((f) => f.ok && f.frame.type === L.TYPES.DATA && f.frame.seq === 1);
  assert.ok(sent);
  run(h, 4000); // let the exchange settle

  const before = h.b.messages.length;
  const acksBefore = h.b.frames.filter((f) => f.ok && f.frame.type === L.TYPES.ACK).length;
  h.b.session.heard(sent.bytes, h.t, sent.rate);
  run(h, 4000);   // a duplicate also makes B answer later (its ACK came too soon), so allow the longer turn

  assert.equal(h.b.messages.length, before, "the duplicate is dropped");
  const acks = h.b.frames.filter((f) => f.ok && f.frame.type === L.TYPES.ACK);
  assert.ok(acks.length > acksBefore, "the duplicate is re-acked");
  assert.ok(acks[acks.length - 1].frame.ack >= sent.frame.seq);
});

/* Two phones pressed within a second of each other, with an iPhone's deaf times. link.js starts the session only once
   the microphone delivers sound, so there is no deaf start; but an iPhone closes the microphone while it sends and
   needs 1-2 s to reopen it (deafAfterTx), and carrier sense notices a burst a block or two late (senseDelay).
   Before 0.60.0 (answers after 1.5 s, fixed listen window) a 2 s reopen never paired at all. */
function pairRate(n, opts) {
  let ok = 0;
  const times = [];
  for (let i = 1; i <= n; i++) {
    const rng = mulberry32(i * 101);
    const h = new Harness({ seedA: i * 7 + 1, seedB: i * 13 + 5, startA: 0, startB: Math.floor(rng() * 100) * 10, ...opts });
    const w = runUntil(h, () => h.a.opens.length && h.b.opens.length, 60000);
    if (h.a.opens.length && h.b.opens.length) { ok++; times.push(w); }
  }
  times.sort((x, y) => x - y);
  return { rate: ok / n, median: times[Math.floor(times.length / 2)] || null };
}

test("pairing with an iPhone's deaf times: a 2 s reopen pairs at the first try", () => {
  const r = pairRate(200, { deafAfterTx: 2000, senseDelay: 200 });
  console.log("# 2 s reopen: " + JSON.stringify(r));
  assert.ok(r.rate >= 0.99, "paired " + r.rate);
  assert.ok(r.median <= 15000, "median " + r.median);
});

test("pairing with a slower phone: a 2.5 s reopen still pairs once the turn has grown", () => {
  const r = pairRate(200, { deafAfterTx: 2500, senseDelay: 200 });
  console.log("# 2.5 s reopen: " + JSON.stringify(r));
  assert.ok(r.rate >= 0.95, "paired " + r.rate);
});

test("a microphone that starts late costs at most one more round", () => {
  const r = pairRate(200, { deafStart: 1500, deafAfterTx: 2000, senseDelay: 200 });
  console.log("# late microphone: " + JSON.stringify(r));
  assert.ok(r.rate >= 0.98, "paired " + r.rate);
});
