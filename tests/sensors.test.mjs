// runtime/sensors.js: the coarse readings apps get, the rates, the shake, zero(), level and pitch, and the audio session
// going back to "ambient" on every way the microphone can end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const LS = runScript("runtime/sensors.js", {}).LopdaSensors;

/* a manual clock with timers */
function clock() {
  let t = 1000, id = 0;
  const timers = new Map();
  const c = {
    now: () => t,
    setTimeout: (f, ms) => { timers.set(++id, { f, at: t + ms }); return id; },
    clearTimeout: (i) => timers.delete(i),
    setInterval: (f, ms) => { timers.set(++id, { f, at: t + ms, every: ms }); return id; },
    clearInterval: (i) => timers.delete(i),
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [i, x] of timers) if (x.at <= end && (!next || x.at < next[1].at)) next = [i, x];
        if (!next) break;
        const [i, x] = next;
        t = x.at;
        if (x.every) x.at += x.every; else timers.delete(i);
        x.f();
      }
      t = end;
    },
    timers,
  };
  return c;
}
const sine = (hz, rate, n, amp = 0.8) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

test("sensor: quantize to 1/32 steps, clamped to -1..1", () => {
  assert.equal(LS.quantize(0), 0);
  assert.equal(LS.quantize(0.01), 0);
  assert.equal(LS.quantize(0.02), 1 / 32);
  assert.equal(LS.quantize(-0.5), -0.5);
  assert.equal(LS.quantize(3), 1);
  assert.equal(LS.quantize(-3), -1);
  assert.ok(Object.is(LS.quantize(-0.001), 0), "no negative zero");
  const steps = new Set();
  for (let v = -1.2; v <= 1.2; v += 0.001) steps.add(LS.quantize(v));
  assert.equal(steps.size, 65);
});

test("sensor motion: tilt from beta and gamma, y from the start pose, about 45 degrees to the end", () => {
  assert.deepEqual({ ...LS.tilt(40, 0, 40) }, { x: 0, y: 0 });
  assert.deepEqual({ ...LS.tilt(40, 45, 40) }, { x: 1, y: 0 });
  assert.deepEqual({ ...LS.tilt(40, -90, 40) }, { x: -1, y: 0 });
  /* the top edge raised (beta grows) is -1, lowered is +1 */
  assert.equal(LS.tilt(62.5, 0, 40).y, -0.5);
  assert.equal(LS.tilt(17.5, 0, 40).y, 0.5);
});

test("sensor motion: heading on a 32-point compass, null without one", () => {
  assert.equal(LS.heading(0), 0);
  assert.equal(LS.heading(359), 0);
  assert.equal(LS.heading(90), 90);
  assert.equal(LS.heading(10), 11.25);
  assert.equal(LS.heading(null), null);
  assert.equal(LS.heading(undefined), null);
  assert.equal(LS.heading(-1), null);
});

test("sensor motion: shake at 15 m/s2, then nothing for 0.5 s", () => {
  const c = clock(), shake = LS.shaker(c.now);
  assert.equal(shake({ x: 10, y: 10, z: 0 }), false, "14.1 m/s2");
  assert.equal(shake({ x: 12, y: 9, z: 0 }), true, "15 m/s2");
  c.advance(200); assert.equal(shake({ x: 40, y: 0, z: 0 }), false, "within 0.5 s");
  c.advance(299); assert.equal(shake({ x: 40, y: 0, z: 0 }), false);
  c.advance(1); assert.equal(shake({ x: 0, y: 0, z: -22 }), true, "0.5 s later");
  assert.equal(shake(null), false);
});

test("sensor: the limiter sends at most hz values a second, only new ones, and the last one late", () => {
  const c = clock(), sent = [], lim = LS.limiter(30, c.now, c.setTimeout);
  const send = (v) => sent.push(v);
  lim(send, 1);
  lim(send, 2); lim(send, 3);          /* too soon: held, the newest wins */
  assert.deepEqual(sent, [1]);
  c.advance(34);
  assert.deepEqual(sent, [1, 3]);
  lim(send, 3);                         /* the same value again: nothing */
  c.advance(100);
  assert.deepEqual(sent, [1, 3]);
  /* a steady 60 Hz stream comes out at 30 Hz */
  const many = [], lim2 = LS.limiter(30, c.now, c.setTimeout);
  for (let i = 0; i < 60; i++) { lim2((v) => many.push(v), i); c.advance(1000 / 60); }
  assert.ok(many.length <= 31 && many.length >= 29, "about 30 a second: " + many.length);
  assert.equal(many.at(-1), 59, "the last value arrives");
});

test("sensor mic: level is 0 on silence, near 1 on a loud sine, in 1/32 steps", () => {
  assert.equal(LS.level(new Float32Array(2048)), 0);
  const loud = LS.level(sine(440, 48000, 2048, 1));
  assert.ok(loud >= 0.9 && loud <= 1, String(loud));
  const quiet = LS.level(sine(440, 48000, 2048, 0.01));   /* -43 dB */
  assert.ok(quiet > 0.2 && quiet < 0.35, String(quiet));
  for (const v of [loud, quiet]) assert.equal(v * 32, Math.round(v * 32));
});

test("sensor mic: pitch of a synthetic sine within 2 %, null for silence and noise", () => {
  for (const rate of [44100, 48000]) for (const hz of [55, 110, 220, 440, 880, 1400]) {
    const p = LS.pitch(sine(hz, rate, 2048), rate);
    assert.ok(Number.isInteger(p), `${hz} Hz at ${rate}: ${p}`);
    assert.ok(Math.abs(p - hz) / hz <= 0.02, `${hz} Hz at ${rate}: ${p}`);
  }
  assert.equal(LS.pitch(new Float32Array(2048), 48000), null);
  let seed = 7;
  const noise = Float32Array.from({ length: 2048 }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1);
  assert.equal(LS.pitch(noise, 48000), null);
});

/* ---------- the host: fake window, document, navigator, audio ---------- */
function world({ ios = true, micFails = null } = {}) {
  const c = clock();
  const listeners = (o) => { const l = {}; o.addEventListener = (t, f) => (l[t] ||= []).push(f); o.removeEventListener = (t, f) => { l[t] = (l[t] || []).filter((x) => x !== f); }; o.fire = (t, e) => (l[t] || []).slice().forEach((f) => f(e || {})); o.count = (t) => (l[t] || []).length; return o; };
  const asked = [];
  const perm = (name) => Object.assign(function () {}, { requestPermission: () => { asked.push(name); return Promise.resolve("granted"); } });
  const W = listeners({ DeviceOrientationEvent: ios ? perm("orientation") : function () {}, DeviceMotionEvent: ios ? perm("motion") : function () {} });
  const D = listeners({ hidden: false });
  const session = { type: "ambient", log: [] };
  const tracks = [];
  const N = {
    audioSession: session,
    mediaDevices: {
      getUserMedia: () => {
        session.log.push("gum:" + session.type);
        if (micFails) return Promise.reject(Object.assign(new Error("no"), { name: micFails }));
        if (session.type !== "play-and-record") return Promise.reject(Object.assign(new Error("AudioSession category is not compatible with audio capture"), { name: "InvalidStateError" }));
        const t = { readyState: "live", stop() { this.readyState = "ended"; } };
        tracks.push(t);
        return Promise.resolve({ getTracks: () => [t] });
      },
    },
  };
  let wave = new Float32Array(2048);
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1 } });
  const ctx = {
    sampleRate: 48000, state: "running", destination: {},
    createMediaStreamSource: () => node(), createGain: () => node(),
    createAnalyser: () => Object.assign(node(), { fftSize: 2048, getFloatTimeDomainData: (buf) => buf.set(wave.subarray(0, buf.length)) }),
  };
  const sent = [], marks = [];
  const app = { name: "app" }, other = { name: "other" };
  let front = app;
  const host = LS.host({
    window: W, document: D, navigator: N,
    context: () => ctx,
    session: (t) => { session.type = t; session.log.push(t); },
    owner: () => front,
    send: (win, msg) => sent.push({ win, msg }),
    mic: (on) => marks.push(on),
    resume: (win, kinds) => sent.push({ win, msg: { resumed: kinds } }),
    now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, setInterval: c.setInterval, clearInterval: c.clearInterval,
  });
  return {
    c, W, D, N, session, tracks, sent, marks, host, asked, app, other,
    setFront: (w) => { front = w; },
    setWave: (w) => { wave = w; },
    orient: (beta, gamma, compass) => W.fire("deviceorientation", { beta, gamma, webkitCompassHeading: compass }),
    msgs: (op) => sent.filter((s) => s.msg.op === op).map((s) => s.msg),
  };
}

test("sensor motion: one tap asks orientation and motion together, then readings flow, quantized and at most 30 a second", async () => {
  const w = world();
  assert.equal(await w.host.askMotion(), "granted");
  assert.deepEqual(w.asked, ["orientation", "motion"]);
  assert.equal(await w.host.askMotion(), "granted");
  assert.equal(w.asked.length, 2, "this page passed the prompt already: no second ask");
  const started = w.host.startMotion(w.app);
  w.orient(40, 10.1, 91);
  assert.equal(await started, "on");
  assert.deepEqual({ ...w.msgs("tilt")[0] }, { op: "tilt", x: 0.21875, y: 0, heading: 90 });
  for (let i = 0; i < 60; i++) { w.orient(40 + i / 4, 10, null); w.c.advance(1000 / 60); }
  const n = w.msgs("tilt").length;
  assert.ok(n <= 32, "at most about 30 a second: " + n);
  assert.equal(w.msgs("tilt").at(-1).heading, null);
});

test("sensor motion: no events within a second is \"none\" (a desktop), and the listeners go", async () => {
  const w = world({ ios: false });
  assert.equal(await w.host.askMotion(), "granted");
  assert.equal(w.asked.length, 0, "nothing to ask outside iOS");
  const p = w.host.startMotion(w.app);
  w.c.advance(1000);
  assert.equal(await p, "none");
  assert.equal(w.W.count("deviceorientation"), 0);
});

test("sensor motion: zero() makes the pose now y = 0", async () => {
  const w = world();
  const p = w.host.startMotion(w.app); w.orient(40, 0); await p;
  w.c.advance(100); w.orient(62.5, 0);
  assert.equal(w.msgs("tilt").at(-1).y, -0.5);
  w.c.advance(100); w.host.zero(w.app);
  assert.equal(w.msgs("tilt").at(-1).y, 0);
  w.c.advance(100); w.orient(40, 0);
  assert.equal(w.msgs("tilt").at(-1).y, 0.5);
  w.host.zero(w.other);   /* not the app that has motion: ignored */
  assert.equal(w.msgs("tilt").at(-1).y, 0.5);
});

test("sensor motion: a shake is sent once, debounced 0.5 s", async () => {
  const w = world();
  const p = w.host.startMotion(w.app); w.orient(40, 0); await p;
  w.W.fire("devicemotion", { acceleration: { x: 30, y: 0, z: 0 } });
  w.W.fire("devicemotion", { acceleration: { x: 30, y: 0, z: 0 } });
  w.c.advance(500);
  w.W.fire("devicemotion", { acceleration: { x: 30, y: 0, z: 0 } });
  assert.equal(w.msgs("shake").length, 2);
});

test("sensor motion: readings reach only the app in front", async () => {
  const w = world();
  const p = w.host.startMotion(w.app); w.orient(40, 0); await p;
  w.setFront(w.other);
  w.c.advance(100); w.orient(50, 20);
  assert.ok(w.sent.every((s) => s.win === w.app));
  assert.equal(w.host.live.motion, null, "stopped");
  assert.equal(w.W.count("deviceorientation"), 0);
});

test("sensor mic: the session is play-and-record before getUserMedia, readings flow at most 20 a second, ambient after stop", async () => {
  const w = world();
  w.setWave(sine(440, 48000, 2048, 0.8));
  assert.equal(await w.host.startMic(w.app), "on");
  assert.deepEqual(w.session.log, ["play-and-record", "gum:play-and-record"]);
  assert.deepEqual(w.marks, [true]);
  w.c.advance(1000);
  const s = w.msgs("sound");
  assert.ok(s.length >= 1 && s.length <= 20);
  assert.ok(Math.abs(s[0].pitch - 440) <= 9, String(s[0].pitch));
  assert.ok(s[0].level > 0.9);
  assert.deepEqual(Object.keys(s[0]).sort(), ["level", "op", "pitch"], "two numbers, never samples");
  w.setWave(new Float32Array(2048)); w.c.advance(100);
  assert.deepEqual({ ...w.msgs("sound").at(-1) }, { op: "sound", level: 0, pitch: null });
  w.host.stopMic();
  assert.equal(w.session.type, "ambient");
  assert.equal(w.tracks[0].readyState, "ended");
  assert.deepEqual(w.marks, [true, false]);
  const n = w.sent.length; w.c.advance(1000);
  assert.equal(w.sent.length, n, "nothing after stop");
});

test("sensor mic: a refusal or no microphone sets ambient back", async () => {
  for (const [name, want] of [["NotAllowedError", "denied"], ["NotFoundError", "none"]]) {
    const w = world({ micFails: name });
    assert.equal(await w.host.startMic(w.app), want);
    assert.equal(w.session.type, "ambient", name);
    assert.equal(w.host.live.mic, null);
  }
});

/* Every way out of a mic app must stop the tracks and give the silent switch back (task part 2). store.js calls
   stopAll() from the runner's leave hook and runApp; the host's own check of the owner catches anything else. */
const EXITS = [
  ["PAD.mic.stop()", (w) => w.host.stopMic()],
  ["HOME (the runner's leave hook)", (w) => { w.setFront(null); w.host.stopAll(); }],
  ["HOME, caught by the owner check alone", (w) => { w.setFront(null); w.c.advance(250); }],
  ["switching to another program", (w) => { w.setFront(w.other); w.c.advance(250); }],
  ["the app closing (PAD.exit)", (w) => { w.setFront(null); w.c.advance(250); }],
  ["the app crashing (its frame gone)", (w) => { w.setFront({ name: "a new frame" }); w.c.advance(250); }],
  ["the app being removed", (w) => { w.setFront(null); w.host.stopAll(); }],
  ["visibilitychange to hidden", (w) => { w.D.hidden = true; w.D.fire("visibilitychange"); }],
  ["pagehide", (w) => w.W.fire("pagehide")],
];
for (const [name, exit] of EXITS) {
  test("sensor mic exit: " + name + " stops the tracks and sets the session to ambient", async () => {
    const w = world();
    assert.equal(await w.host.startMic(w.app), "on");
    assert.equal(w.session.type, "play-and-record");
    exit(w);
    assert.equal(w.session.type, "ambient");
    assert.equal(w.tracks[0].readyState, "ended");
    assert.equal(w.host.live.mic, null);
    assert.equal(w.marks.at(-1), false, "the status bar mark goes");
  });
}

test("sensor mic exit: the app leaving while the prompt is up never leaves play-and-record behind", async () => {
  const w = world();
  const p = w.host.startMic(w.app);
  w.setFront(null);
  w.c.advance(250);
  assert.equal(await p, "denied");
  assert.equal(w.session.type, "ambient");
  assert.equal(w.tracks[0].readyState, "ended", "the late stream is stopped at once");
});

test("sensor: shown again with the same app in front, the runtime is told what was on; another app gets nothing", async () => {
  const w = world();
  const p = w.host.startMotion(w.app); w.orient(40, 0); await p;
  await w.host.startMic(w.app);
  w.D.hidden = true; w.D.fire("visibilitychange");
  assert.equal(w.host.live.motion, null);
  w.D.hidden = false; w.D.fire("visibilitychange");
  assert.deepEqual({ ...w.sent.at(-1).msg.resumed }, { motion: true, mic: true });
  const w2 = world();
  await w2.host.startMic(w2.app);
  w2.D.hidden = true; w2.D.fire("visibilitychange");
  w2.setFront(w2.other);
  w2.D.hidden = false; w2.D.fire("visibilitychange");
  assert.ok(!w2.sent.some((s) => s.msg.resumed));
});
