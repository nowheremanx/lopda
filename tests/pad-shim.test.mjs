// sdk/pad-shim.js: the PAD bridge apps see, and the wrapper that puts it in front of an app.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { runScript, read } from "./helpers.mjs";

/* a fake app window: records what the shim posts to the runtime and lets a test send messages back */
function app(opts) {
  const listeners = {}, posted = [];
  const parent = { postMessage: (msg, origin) => posted.push({ msg, origin }) };
  const ctx = runScript("sdk/pad-shim.js", {
    parent,
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
    setTimeout,
  });
  ctx.lopdaPadShim(opts);
  const fire = (type, e) => (listeners[type] || []).forEach((fn) => fn(e));
  return {
    PAD: ctx.PAD, ctx, posted: () => posted.map((p) => JSON.parse(JSON.stringify(p.msg))), origins: () => posted.map((p) => p.origin),
    fire,
    fromRuntime: (data, source = parent) => fire("message", { data, source }),
    key: (type, key, extra) => { const e = Object.assign({ key, repeat: false, target: {}, preventDefault() { e.prevented = true; } }, extra); fire(type, e); return e; },
  };
}

test("PAD constants", () => {
  const { PAD } = app();
  assert.equal(PAD.spec, "lopda/1");
  assert.deepEqual([...PAD.TONES], ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"]);
  assert.deepEqual([...PAD.BUTTONS], ["up", "down", "left", "right", "a", "b", "start", "select"]);
  assert.deepEqual([...PAD.SOUNDS], ["tap", "tick", "move", "ok", "err", "hit", "miss", "coin", "win", "lose"]);
  assert.ok(Object.isFrozen(PAD) && Object.isFrozen(PAD.TONES));
});

test("PAD.lang is zh, en or undefined", () => {
  assert.equal(app({ lang: "zh" }).PAD.lang, "zh");
  assert.equal(app({ lang: "en" }).PAD.lang, "en");
  assert.equal(app({ lang: "fr" }).PAD.lang, undefined);
  assert.equal(app().PAD.lang, undefined);
});

test("save, remove, exit and sfx post to the runtime", () => {
  const a = app();
  a.PAD.save(7, { n: 1 });
  a.PAD.remove("k");
  a.PAD.exit();
  a.PAD.sfx("coin");
  a.PAD.sfx("explosion");
  assert.deepEqual(a.posted(), [
    { op: "save", k: "7", v: { n: 1 }, pad: 1 },
    { op: "remove", k: "k", pad: 1 },
    { op: "exit", pad: 1 },
    { op: "sfx", name: "coin", pad: 1 },
  ]);
  /* a sandboxed frame has an opaque origin, so "*" is the only target that works */
  assert.ok(a.origins().every((o) => o === "*"));
});

test("load resolves from the matching reply, only from the parent", async () => {
  const a = app();
  const p1 = a.PAD.load("x"), p2 = a.PAD.load("y");
  const [r1, r2] = a.posted();
  assert.equal(r1.op, "load"); assert.equal(r1.k, "x");
  assert.notEqual(r1.i, r2.i);
  a.fromRuntime({ pad: 1, op: "loaded", i: r2.i, v: "spoofed" }, {});   /* not from the parent: ignored */
  a.fromRuntime({ pad: 1, op: "loaded", i: r2.i, v: 2 });
  a.fromRuntime({ pad: 1, op: "loaded", i: r1.i, v: 1 });
  assert.deepEqual(await Promise.all([p1, p2]), [1, 2]);
});

test("a save the runtime cannot read rejects PAD.load with its code", async () => {
  const a = app();
  const p = a.PAD.load("x");
  const req = a.posted()[0];
  assert.equal(req.op, "load");
  a.fromRuntime({ pad: 1, op: "loaded", i: req.i, error: "corrupt" });
  await assert.rejects(p, (e) => e.code === "corrupt" && /PAD\.load/.test(e.message));
});

test("saveInfo asks for the save's metadata; setSchema records an integer only", async () => {
  const a = app();
  const p = a.PAD.saveInfo();
  const req = a.posted()[0];
  assert.deepEqual(req, { op: "info", i: req.i, pad: 1 });
  a.fromRuntime({ pad: 1, op: "infoed", i: req.i, v: { schema: 2, version: "1.2.0", updated: 9, bytes: 12 } });
  assert.deepEqual(await p, { schema: 2, version: "1.2.0", updated: 9, bytes: 12 });

  const bad = a.PAD.saveInfo();
  const badReq = a.posted()[1];
  a.fromRuntime({ pad: 1, op: "infoed", i: badReq.i, error: "newer" });
  await assert.rejects(bad, (e) => e.code === "newer");

  a.PAD.setSchema(3.9);
  assert.deepEqual(a.posted()[2], { op: "schema", n: 3, pad: 1 });
  a.PAD.setSchema(-1);
  a.PAD.setSchema("2");
  assert.equal(a.posted().length, 3, "invalid schemas post nothing");
});

test("chin buttons: press, release, isDown, off", () => {
  const a = app(), log = [];
  const onPress = (b) => log.push("+" + b);
  a.PAD.on("press", onPress);
  a.PAD.on("release", (b) => log.push("-" + b));
  a.fromRuntime({ pad: 1, op: "button", b: "a", down: true });
  a.fromRuntime({ pad: 1, op: "button", b: "a", down: true });     /* already down: no second press */
  assert.equal(a.PAD.isDown("a"), true);
  a.fromRuntime({ pad: 1, op: "button", b: "nope", down: true });  /* unknown button: ignored */
  a.fromRuntime({ pad: 1, op: "button", b: "a", down: false });
  assert.equal(a.PAD.isDown("a"), false);
  a.PAD.off("press", onPress);
  a.fromRuntime({ pad: 1, op: "button", b: "b", down: true });
  a.fromRuntime({ pad: 1, op: "release-all" });
  assert.deepEqual(log, ["+a", "-a", "-b"]);
});

test("a throwing listener does not stop the others", (t) => {
  const thrown = [];
  const a = app();
  a.ctx.setTimeout = (fn) => { try { fn(); } catch (e) { thrown.push(e.message); } };
  const log = [];
  a.PAD.on("press", () => { throw new Error("boom"); });
  a.PAD.on("press", (b) => log.push(b));
  a.fromRuntime({ pad: 1, op: "button", b: "up", down: true });
  assert.deepEqual(log, ["up"]);
  assert.deepEqual(thrown, ["boom"]);
});

test("keyboard maps to buttons only while the app listens, and not while typing", () => {
  const a = app(), log = [];
  assert.equal(a.key("keydown", "x").prevented, undefined, "no listener: keys left alone");
  a.key("keyup", "x");
  a.PAD.on("press", (b) => log.push(b));
  assert.equal(a.key("keydown", "x").prevented, true);
  a.key("keydown", "x", { repeat: true });
  a.key("keyup", "x");
  a.key("keydown", "Enter"); a.key("keyup", "Enter");
  a.key("keydown", "Shift"); a.key("keyup", "Shift");
  a.key("keydown", "ArrowLeft", { target: { nodeName: "INPUT" } });
  a.key("keydown", "q");
  assert.deepEqual(log, ["a", "start", "select"]);
  a.key("keydown", "Z");
  a.fire("blur", {});
  assert.equal(a.PAD.isDown("b"), false);
});

test("uncaught errors are reported to the runtime", () => {
  const a = app();
  a.fire("error", { message: "x is not defined", lineno: 3, colno: 9 });
  a.fire("unhandledrejection", { reason: new Error("nope") });
  assert.deepEqual(a.posted().map((m) => m.msg), ["x is not defined @3:9", "Promise: nope"]);
});

test("PAD.music is there only when the runtime can play it, like PAD.lang", () => {
  assert.equal(app().PAD.music, undefined);
  assert.equal(app({ lang: "zh" }).PAD.music, undefined);
  assert.equal(app({ music: "yes" }).PAD.music, undefined);
  const { PAD } = app({ lang: "en", music: true });
  assert.equal(typeof PAD.music.play, "function");
  assert.ok(Object.isFrozen(PAD.music));
});

test("music play and stop post plain data; loop is on unless it is false", () => {
  const a = app({ music: true });
  const song = { bpm: 96, p1: "c d e", tri: "o2 c", extra: () => 1, odd: { x: 1 }, gone: undefined };
  a.PAD.music.play(song);
  a.PAD.music.play({ p1: "c" }, { loop: false });
  a.PAD.music.play({ p1: "c" }, { loop: 0 });
  a.PAD.music.stop();
  assert.deepEqual(a.posted(), [
    /* what cannot be copied becomes a string, so the runtime can say what is wrong with it */
    { op: "music", action: "play", song: { bpm: 96, p1: "c d e", tri: "o2 c", extra: "() => 1", odd: "[object Object]" }, loop: true, pad: 1 },
    { op: "music", action: "play", song: { p1: "c" }, loop: false, pad: 1 },
    { op: "music", action: "play", song: { p1: "c" }, loop: true, pad: 1 },
    { op: "music", action: "stop", pad: 1 },
  ]);
});

test("sfx takes an object: only the sound's own keys are sent", () => {
  const a = app({ music: true });
  a.PAD.sfx({ wave: "noise", from: 900, to: 120, ms: 180, attack: 5, decay: 175, vol: 0.8, onend: () => 1, x: 1 });
  a.PAD.sfx({});
  a.PAD.sfx(null);
  a.PAD.sfx(7);
  assert.deepEqual(a.posted(), [
    { op: "sfx", params: { wave: "noise", from: 900, to: 120, ms: 180, attack: 5, decay: 175, vol: 0.8 }, pad: 1 },
    { op: "sfx", params: {}, pad: 1 },
  ]);
});

test("sfx: vibrato goes across as {depth, rate}, plain numbers or strings only", () => {
  const a = app({ music: true });
  a.PAD.sfx({ from: 440, vibrato: { depth: 0.5, rate: 7, shape: "sine" } });
  a.PAD.sfx({ from: 440, vibrato: { depth: () => 1 } });
  a.PAD.sfx({ from: 440, vibrato: 3 });
  assert.deepEqual(a.posted(), [
    { op: "sfx", params: { from: 440, vibrato: { depth: 0.5, rate: 7 } }, pad: 1 },
    { op: "sfx", params: { from: 440, vibrato: { depth: "() => 1" } }, pad: 1 },
    { op: "sfx", params: { from: 440 }, pad: 1 },
  ]);
});

test("PAD.ambience is there only when the runtime can play it, and posts a name and a level", () => {
  assert.equal(app().PAD.ambience, undefined);
  assert.equal(app({ music: true }).PAD.ambience, undefined);
  assert.equal(app({ ambience: 1 }).PAD.ambience, undefined);
  const a = app({ music: true, ambience: true });
  a.PAD.ambience("rain", 0.6);
  a.PAD.ambience("waves");
  a.PAD.ambience(null);
  a.PAD.ambience();
  a.PAD.ambience("wind", "loud");
  a.PAD.ambience({ toString: () => "fire" }, 1);
  assert.deepEqual(a.posted(), [
    { op: "ambience", name: "rain", level: 0.6, pad: 1 },
    { op: "ambience", name: "waves", pad: 1 },
    { op: "ambience", name: null, pad: 1 },
    { op: "ambience", name: null, pad: 1 },
    /* the runtime checks the name and clamps the level */
    { op: "ambience", name: "wind", level: "loud", pad: 1 },
    { op: "ambience", name: "fire", level: 1, pad: 1 },
  ]);
});

test("CSP blocks the network and allows only inline code and data: media", () => {
  const { LOPDA_APP_CSP: csp } = runScript("sdk/pad-shim.js", {});
  assert.equal(csp, "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
    "img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'");
});

test("lopdaWrapApp puts CSP and shim first in every shape of document", () => {
  const { lopdaWrapApp: wrap } = runScript("sdk/pad-shim.js", {});
  const shapes = [
    '<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>t</title></head><body>APP</body></html>',
    "<html><body>APP</body></html>",
    "<p>APP</p>",
  ];
  for (const html of shapes) {
    const out = wrap(html, { lang: "en" });
    const csp = out.indexOf("Content-Security-Policy"), shim = out.indexOf("lopdaPadShim"), body = out.indexOf("APP");
    assert.ok(csp > 0 && csp < shim && shim < body, html);
    assert.ok(out.includes('{"lang":"en"}'), "passes the language");
    assert.equal((out.match(/Content-Security-Policy/g) || []).length, 1);
  }
  assert.ok(wrap("<p>x</p>", { lang: "de" }).includes("lopdaPadShim(opts)") && !wrap("<p>x</p>", { lang: "de" }).includes('"lang"'));
  assert.ok(wrap("<p>x</p>", { lang: "zh", music: true }).includes('({"lang":"zh","music":true});'), "passes music");
  assert.ok(wrap("<p>x</p>", { music: 1 }).includes(")();"), "music only when it is true");
  assert.ok(wrap("<p>x</p>", { lang: "en", music: true, ambience: true }).includes('({"lang":"en","music":true,"ambience":true});'), "passes ambience");
  assert.ok(wrap("<p>x</p>", { ambience: "yes" }).includes(")();"), "ambience only when it is true");
  assert.ok(wrap("<p>x</p>", { music: true, ambience: true, sensors: true }).includes('({"music":true,"ambience":true,"sensors":true});'), "passes sensors");
  assert.ok(wrap("<p>x</p>", { sensors: 1 }).includes(")();"), "sensors only when it is true");
  /* the injected shim is the real function source and runs on its own */
  const src = wrap("<p>x</p>").match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(src));
});

test("the shim, lo-game and the checker agree on buttons and sounds", () => {
  const { PAD } = app();
  const list = (src, name) => JSON.parse(src.match(new RegExp(name + " = (\\[[^\\]]*\\])"))[1]);
  assert.deepEqual(list(read("tools/check-app.mjs"), "SOUNDS"), [...PAD.SOUNDS]);
  assert.deepEqual(list(read("sdk/lo-game.js"), "BUTTONS"), [...PAD.BUTTONS]);
  const chip = runScript("runtime/chip.js", {}).LopdaChip;
  assert.deepEqual(list(read("tools/check-app.mjs"), "AMBIENCES"), [...chip.AMBIENCES], "the checker knows the chip's presets");
});

test("exportFile and importFile ask the runtime and settle from its matching reply", async () => {
  const a = app();
  const ex = a.PAD.exportFile({ name: "a.png", type: "image/png", data: "data:image/png;base64,AAAA" });
  const im = a.PAD.importFile({ accept: ["image/*", 7] });
  const [e, i] = a.posted();
  assert.deepEqual(e, { kind: "export", name: "a.png", type: "image/png", data: "data:image/png;base64,AAAA", op: "file", i: e.i, pad: 1 });
  assert.deepEqual(i, { kind: "import", accept: ["image/*"], op: "file", i: i.i, pad: 1 });
  a.fromRuntime({ pad: 1, op: "filed", i: i.i, v: null }, {});            /* not from the parent: ignored */
  a.fromRuntime({ pad: 1, op: "filed", i: i.i, v: { name: "b.png", type: "image/png", data: "data:," } });
  a.fromRuntime({ pad: 1, op: "filed", i: e.i, v: "cancelled" });
  assert.equal(await ex, "cancelled");
  assert.deepEqual(JSON.parse(JSON.stringify(await im)), { name: "b.png", type: "image/png", data: "data:," });
});

test("file calls reject on the runtime's refusal, bad arguments and files over 2 MB", async () => {
  const a = app();
  const p = a.PAD.importFile();
  a.fromRuntime({ pad: 1, op: "filed", i: a.posted()[0].i, error: 'this app has no "files" permission' });
  await assert.rejects(p, /permission/);
  await assert.rejects(a.PAD.exportFile({ name: "a.txt" }), /needs \{name, type, data\}/);
  await assert.rejects(a.PAD.exportFile({ name: "a.txt", type: "text/plain", data: "x".repeat(2 * 1024 * 1024 + 1) }), /2 MB/);
  /* base64 counts by the bytes it decodes to: 2.6 M characters is under 2 MB */
  const big = "data:image/png;base64," + "A".repeat(2.6 * 1024 * 1024);
  a.PAD.exportFile({ name: "b.png", type: "image/png", data: big });
  assert.equal(a.posted().length, 2);
});

/* ---------- tilt and the microphone (runtime 0.24.0, SPEC.md 6.4) ---------- */
test("sensor: PAD.motion and PAD.mic exist only when the runtime offers them", () => {
  assert.equal(app().PAD.motion, undefined);
  assert.equal(app({ music: true, ambience: true }).PAD.mic, undefined);
  const { PAD } = app({ sensors: true });
  assert.deepEqual(Object.keys(PAD.motion).sort(), ["start", "stop", "zero"]);
  assert.deepEqual(Object.keys(PAD.mic).sort(), ["start", "stop"]);
  assert.ok(Object.isFrozen(PAD.motion) && Object.isFrozen(PAD.mic));
});

test("sensor: start() asks the runtime and settles from its matching reply; stop and zero post", async () => {
  const a = app({ sensors: true });
  const m = a.PAD.motion.start(), k = a.PAD.mic.start();
  a.PAD.motion.zero(); a.PAD.motion.stop(); a.PAD.mic.stop();
  const [pm, pk, ...rest] = a.posted();
  assert.deepEqual(pm, { op: "sense", i: pm.i, kind: "motion", action: "start", pad: 1 });
  assert.deepEqual(pk, { op: "sense", i: pk.i, kind: "mic", action: "start", pad: 1 });
  assert.deepEqual(rest, [
    { op: "sense", kind: "motion", action: "zero", pad: 1 },
    { op: "sense", kind: "motion", action: "stop", pad: 1 },
    { op: "sense", kind: "mic", action: "stop", pad: 1 },
  ]);
  a.fromRuntime({ pad: 1, op: "sensed", i: pk.i, v: "on" }, {});   /* not from the parent: ignored */
  a.fromRuntime({ pad: 1, op: "sensed", i: pk.i, v: "none" });
  a.fromRuntime({ pad: 1, op: "sensed", i: pm.i, v: "on" });
  assert.deepEqual(await Promise.all([m, k]), ["on", "none"]);
});

test("sensor: without the permission the runtime says denied, and anything odd reads as denied", async () => {
  const a = app({ sensors: true });
  const m = a.PAD.motion.start(), k = a.PAD.mic.start();
  const [pm, pk] = a.posted();
  a.fromRuntime({ pad: 1, op: "sensed", i: pm.i, v: "denied" });
  a.fromRuntime({ pad: 1, op: "sensed", i: pk.i, v: { evil: 1 } });
  assert.deepEqual(await Promise.all([m, k]), ["denied", "denied"]);
});

test("sensor: tilt, shake and sound events reach PAD.on listeners; malformed ones are dropped", () => {
  const a = app({ sensors: true }), log = [];
  a.PAD.on("tilt", (t) => log.push(["tilt", t.x, t.y, t.heading]));
  a.PAD.on("shake", () => log.push(["shake"]));
  const snd = (s) => log.push(["sound", s.level, s.pitch]);
  a.PAD.on("sound", snd);
  a.fromRuntime({ pad: 1, op: "tilt", x: 0.5, y: -0.25, heading: 90 });
  a.fromRuntime({ pad: 1, op: "tilt", x: 0, y: 0, heading: null });
  a.fromRuntime({ pad: 1, op: "tilt", x: 5, y: 0 });                /* out of range */
  a.fromRuntime({ pad: 1, op: "tilt", x: "1", y: 0 });              /* not a number */
  a.fromRuntime({ pad: 1, op: "shake" });
  a.fromRuntime({ pad: 1, op: "sound", level: 0.5, pitch: 440 });
  a.fromRuntime({ pad: 1, op: "sound", level: 0, pitch: "x" });
  a.fromRuntime({ pad: 1, op: "shake" }, {});                       /* not from the parent */
  a.PAD.off("sound", snd);
  a.fromRuntime({ pad: 1, op: "sound", level: 1, pitch: null });
  assert.deepEqual(log, [["tilt", 0.5, -0.25, 90], ["tilt", 0, 0, null], ["shake"], ["sound", 0.5, 440], ["sound", 0, null]]);
});

test("sensor: the tilt's absolute flat reading passes through when valid, undefined on older runtimes", () => {
  const a = app({ sensors: true }), log = [];
  a.PAD.on("tilt", (t) => log.push(t));
  a.fromRuntime({ pad: 1, op: "tilt", x: 0.5, y: -0.25, heading: 90, flat: { x: 0.25, y: -0.5 } });
  a.fromRuntime({ pad: 1, op: "tilt", x: 0.5, y: -0.25, heading: 90 });                     /* an older runtime */
  a.fromRuntime({ pad: 1, op: "tilt", x: 0.5, y: -0.25, heading: 90, flat: { x: 5, y: 0 } });  /* out of range */
  a.fromRuntime({ pad: 1, op: "tilt", x: 0.5, y: -0.25, heading: 90, flat: { x: "0.25", y: 0 } });  /* not a number */
  a.fromRuntime({ pad: 1, op: "tilt", x: 0.5, y: -0.25, heading: 90, flat: null });             /* no object */
  assert.equal(log.length, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(log[0])), { x: 0.5, y: -0.25, heading: 90, flat: { x: 0.25, y: -0.5 } });
  for (const t of log.slice(1)) {
    assert.equal(t.flat, undefined);
    assert.deepEqual({ x: t.x, y: t.y, heading: t.heading }, { x: 0.5, y: -0.25, heading: 90 }, "x, y and heading still arrive");
  }
});

test("sensor: an app on an older runtime gets no sensor events", () => {
  const a = app(), log = [];
  a.PAD.on("tilt", () => log.push(1));
  a.fromRuntime({ pad: 1, op: "tilt", x: 0, y: 0, heading: null });
  assert.deepEqual(log, []);
});

test("notes: PAD.notes and PAD.say exist only when the runtime offers them", () => {
  assert.equal(app().PAD.notes, undefined);
  assert.equal(app().PAD.say, undefined);
  assert.equal(app({ sensors: true }).PAD.notes, undefined);
  const { PAD } = app({ notes: true, say: true });
  assert.deepEqual(Object.keys(PAD.notes), ["append"]);
  assert.ok(Object.isFrozen(PAD.notes));
  assert.equal(typeof PAD.say, "function");
  assert.deepEqual([...PAD.say.languages], ["zh", "en", "ja"]);
  const { lopdaWrapApp: wrap } = runScript("sdk/pad-shim.js", {});
  assert.match(wrap("<p>x</p>", { notes: true, say: true, nope: true }), /\(\{"notes":true,"say":true\}\);/);
});

test("notes: append asks the runtime with strings and settles from its matching reply", async () => {
  const a = app({ notes: true });
  const one = a.PAD.notes.append("Scores", "Mon 120"), two = a.PAD.notes.append(42, null);
  const [p1, p2] = a.posted();
  assert.deepEqual(p1, { op: "notes", title: "Scores", text: "Mon 120", i: p1.i, pad: 1 });
  assert.deepEqual(p2, { op: "notes", title: "42", text: "", i: p2.i, pad: 1 });
  a.fromRuntime({ pad: 1, op: "noted", i: p1.i, v: "saved" }, {});   /* not from the parent: ignored */
  a.fromRuntime({ pad: 1, op: "noted", i: p2.i, v: "denied" });
  a.fromRuntime({ pad: 1, op: "noted", i: p1.i, v: "saved" });
  assert.deepEqual(await Promise.all([one, two]), ["saved", "denied"]);
});

test("notes: without the permission or past the limits the runtime says denied; anything odd reads as denied", async () => {
  const a = app({ notes: true });
  const one = a.PAD.notes.append("t", "x".repeat(5000)), two = a.PAD.notes.append("t", "x");
  const [p1, p2] = a.posted();
  assert.equal(p1.text.length, 5000, "the shim sends the text whole: the runtime is the one that checks");
  a.fromRuntime({ pad: 1, op: "noted", i: p1.i, v: "denied" });
  a.fromRuntime({ pad: 1, op: "noted", i: p2.i, v: { saved: true } });
  assert.deepEqual(await Promise.all([one, two]), ["denied", "denied"]);
});

test("say: the text is cut to 200 characters, lang is zh, en or ja and PAD.lang by default; the reply settles it", async () => {
  const zh = app({ say: true, lang: "zh" }), en = app({ say: true, lang: "en" }), old = app({ say: true });
  const long = "測".repeat(150) + "😀".repeat(100);
  const r1 = zh.PAD.say(long), r2 = zh.PAD.say("hello", { lang: "en" }), r3 = zh.PAD.say("あ", { lang: "ja" }), r4 = zh.PAD.say("x", { lang: "fr" });
  en.PAD.say("hi"); old.PAD.say("hi");
  const [s1, s2, s3, s4] = zh.posted();
  assert.equal(Array.from(s1.text).length, 200);
  assert.equal(s1.text, "測".repeat(150) + "😀".repeat(50), "cut by characters, never inside a surrogate pair");
  assert.deepEqual([s1.lang, s2.lang, s3.lang, s4.lang, en.posted()[0].lang, old.posted()[0].lang], ["zh", "en", "ja", "zh", "en", "zh"]);
  assert.deepEqual(s2, { op: "say", text: "hello", lang: "en", i: s2.i, pad: 1 });
  assert.deepEqual(s3, { op: "say", text: "あ", lang: "ja", i: s3.i, pad: 1 });
  zh.fromRuntime({ pad: 1, op: "said", i: s1.i, v: "stopped" });
  zh.fromRuntime({ pad: 1, op: "said", i: s2.i, v: "done" });
  zh.fromRuntime({ pad: 1, op: "said", i: s3.i, v: "done" });
  zh.fromRuntime({ pad: 1, op: "said", i: s4.i, v: "boom" });
  assert.deepEqual(await Promise.all([r1, r2, r3, r4]), ["stopped", "done", "done", "unavailable"]);
});

/* ---------- the camera (SPEC.md 6.6, decisions.md section 28) ---------- */
test("camera: PAD.camera exists only when the runtime offers it, and the wrapper passes camera", () => {
  assert.equal(app().PAD.camera, undefined);
  assert.equal(app({ sensors: true, notes: true, say: true }).PAD.camera, undefined);
  const { PAD } = app({ camera: true });
  assert.deepEqual(Object.keys(PAD.camera), ["snap"]);
  assert.ok(Object.isFrozen(PAD.camera));
  const { lopdaWrapApp: wrap } = runScript("sdk/pad-shim.js", {});
  assert.match(wrap("<p>x</p>", { say: true, camera: true }), /\(\{"say":true,"camera":true\}\);/);
});

test("camera: snap asks for small or large, and the picture comes back as {w, h, px} with tones 0-3", async () => {
  const a = app({ camera: true });
  const U8 = vm.runInContext("Uint8Array", a.ctx);   /* what a postMessage into the app's frame makes */
  const one = a.PAD.camera.snap(), two = a.PAD.camera.snap({ size: "large" }), three = a.PAD.camera.snap({ size: "huge" });
  const [p1, p2, p3] = a.posted();
  assert.deepEqual(p1, { op: "snap", size: "small", i: p1.i, pad: 1 });
  assert.deepEqual([p2.size, p3.size], ["large", "small"]);
  const small = new U8(128 * 112).map((_, i) => i % 4), large = new U8(256 * 224).fill(3);
  a.fromRuntime({ pad: 1, op: "snapped", i: p1.i, v: { w: 128, h: 112, px: small } }, {});   /* not from the parent: ignored */
  a.fromRuntime({ pad: 1, op: "snapped", i: p1.i, v: { w: 128, h: 112, px: small } });
  a.fromRuntime({ pad: 1, op: "snapped", i: p2.i, v: { w: 256, h: 224, px: large } });
  a.fromRuntime({ pad: 1, op: "snapped", i: p3.i, v: null });
  const [r1, r2, r3] = await Promise.all([one, two, three]);
  assert.deepEqual([r1.w, r1.h, r1.px.length, r1.px[5]], [128, 112, 128 * 112, 1]);
  assert.equal(r1.px, small, "the same array, not a copy");
  assert.deepEqual([r2.w, r2.h, r2.px.length], [256, 224, 256 * 224]);
  assert.equal(r3, null);
});

test("camera: null without the permission; anything that is not a proper picture reads as null", async () => {
  const a = app({ camera: true });
  const U8 = vm.runInContext("Uint8Array", a.ctx);
  const bad = [
    null,                                                   /* the runtime: no "camera", cancelled, no camera */
    { w: 128, h: 112, px: new U8(10) },                     /* wrong length */
    { w: 100, h: 100, px: new U8(10000) },                  /* not one of the two sizes */
    { w: 128, h: 112, px: new U8(128 * 112).fill(4) },      /* a tone that does not exist */
    { w: 128, h: 112, px: Array.from({ length: 128 * 112 }, () => 0) },   /* not a Uint8Array */
    "photo",
  ];
  const calls = bad.map(() => a.PAD.camera.snap());
  a.posted().forEach((p, k) => a.fromRuntime({ pad: 1, op: "snapped", i: p.i, v: bad[k] }));
  assert.deepEqual(await Promise.all(calls), bad.map(() => null));
});

/* ---------- the dictionary (SPEC.md 6.7, decisions.md section 35) ---------- */
test("dict: PAD.dict exists only when the runtime offers it, and the wrapper passes dict", () => {
  assert.equal(app().PAD.dict, undefined);
  assert.equal(app({ say: true, camera: true }).PAD.dict, undefined);
  assert.equal(app({ dict: "yes" }).PAD.dict, undefined);
  const { PAD } = app({ dict: true });
  assert.equal(PAD.dict.version, "ecdict-1");
  assert.deepEqual(Object.keys(PAD.dict).sort(), ["addWord", "inBook", "lookup", "removeWord", "version", "words"]);
  assert.ok(Object.isFrozen(PAD.dict));
  const { lopdaWrapApp: wrap } = runScript("sdk/pad-shim.js", {});
  assert.match(wrap("<p>x</p>", { say: true, dict: true }), /\(\{"say":true,"dict":true\}\);/);
  assert.ok(wrap("<p>x</p>", { dict: 1 }).includes(")();"), "dict only when it is true");
});

test("dict: words posts its query as plain data and settles from the matching reply", async () => {
  const a = app({ dict: true });
  const one = a.PAD.dict.words({ len: 5, pattern: "?a???", fn: () => 1, nested: { x: 1 }, gone: undefined });
  const two = a.PAD.dict.words();
  const three = a.PAD.dict.words({ letters: "planet", len: [3, 6], level: 3 });
  const [p1, p2, p3] = a.posted();
  assert.deepEqual(p1, { op: "dict", kind: "words", q: { len: 5, pattern: "?a???", fn: "() => 1", nested: "[object Object]" }, i: p1.i, pad: 1 });
  assert.deepEqual(p2, { op: "dict", kind: "words", q: {}, i: p2.i, pad: 1 });
  assert.deepEqual(p3.q, { letters: "planet", len: [3, 6], level: 3 }, "[min, max] stays an array");
  a.fromRuntime({ pad: 1, op: "dicted", i: p1.i, v: { words: ["spoofed"], more: false } }, {});   /* not from the parent: ignored */
  a.fromRuntime({ pad: 1, op: "dicted", i: p1.i, v: { words: ["cat", "dog"], more: 1 } });
  a.fromRuntime({ pad: 1, op: "dicted", i: p2.i, v: { words: [], more: false } });
  assert.deepEqual(JSON.parse(JSON.stringify(await one)), { words: ["cat", "dog"], more: true });
  assert.deepEqual(JSON.parse(JSON.stringify(await two)), { words: [], more: false });
});

test("dict: odd word pages read as null; only strings in words, more is a boolean", async () => {
  const a = app({ dict: true });
  const bad = [null, "words", [], { words: "cat" }, { words: ["cat", 7] }, { more: true }];
  const good = a.PAD.dict.words({});
  const calls = bad.map(() => a.PAD.dict.words({}));
  const ps = a.posted();
  bad.forEach((v, k) => a.fromRuntime({ pad: 1, op: "dicted", i: ps[k + 1].i, v }));
  a.fromRuntime({ pad: 1, op: "dicted", i: ps[0].i, v: { words: ["cat"], more: "yes" } });
  assert.deepEqual(await Promise.all(calls), bad.map(() => null));
  assert.deepEqual(JSON.parse(JSON.stringify(await good)), { words: ["cat"], more: true });
});

test("dict: lookup posts the word and settles from the matching reply, form only when it is a string", async () => {
  const a = app({ dict: true });
  const base = a.PAD.dict.lookup("Ran"), exact = a.PAD.dict.lookup("run"), odd = a.PAD.dict.lookup(42);
  const [p1, p2, p3] = a.posted();
  assert.deepEqual(p1, { op: "dict", kind: "lookup", word: "Ran", i: p1.i, pad: 1 });
  assert.deepEqual(p3, { op: "dict", kind: "lookup", word: "42", i: p3.i, pad: 1 });
  a.fromRuntime({ pad: 1, op: "dicted", i: p1.i, v: { word: "run", form: "ran", zh: ["v. 跑"], en: ["move quickly"] } });
  a.fromRuntime({ pad: 1, op: "dicted", i: p2.i, v: { word: "run", form: 7, zh: ["v. 跑"], en: [] } });
  a.fromRuntime({ pad: 1, op: "dicted", i: p3.i, v: { word: "run", zh: ["v. 跑"], en: [] } });
  assert.deepEqual(JSON.parse(JSON.stringify(await base)), { word: "run", form: "ran", zh: ["v. 跑"], en: ["move quickly"] });
  assert.deepEqual(JSON.parse(JSON.stringify(await exact)), { word: "run", zh: ["v. 跑"], en: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(await odd)), { word: "run", zh: ["v. 跑"], en: [] });
});

test("dict: odd entries read as null, and a runtime error rejects with the PAD.dict prefix", async () => {
  const a = app({ dict: true });
  const bad = [null, "run", {}, { word: 7, zh: [], en: [] }, { word: "run", zh: ["v. 跑"], en: "move" }, { word: "run", zh: [1], en: [] }];
  const calls = bad.map(() => a.PAD.dict.lookup("run"));
  const ps = a.posted();
  bad.forEach((v, k) => a.fromRuntime({ pad: 1, op: "dicted", i: ps[k].i, v }));
  assert.deepEqual(await Promise.all(calls), bad.map(() => null));
  const w = a.PAD.dict.words({ len: 1 }), l = a.PAD.dict.lookup("");
  const [pw, pl] = a.posted().slice(-2);
  a.fromRuntime({ pad: 1, op: "dicted", i: pw.i, error: "len is a whole number from 2 to 15, or [min, max]" });
  a.fromRuntime({ pad: 1, op: "dicted", i: pl.i, error: "the word is 1 to 32 letters a-z" });
  await assert.rejects(w, /PAD\.dict\.words: len is a whole number/);
  await assert.rejects(l, /PAD\.dict\.lookup: the word is 1 to 32 letters/);
});

/* ---------- the word book (SPEC.md 6.7, decisions.md section 35) ---------- */
test("wordbook: inBook posts the words and settles from the matching reply, checked to the same length", async () => {
  const a = app({ dict: true });
  const one = a.PAD.dict.inBook(["Cat", "dog"]);
  const [p1] = a.posted();
  assert.deepEqual(p1, { op: "dict", kind: "inBook", words: ["Cat", "dog"], i: p1.i, pad: 1 });
  a.fromRuntime({ pad: 1, op: "dicted", i: p1.i, v: [true, false] }, {});   /* not from the parent: ignored */
  a.fromRuntime({ pad: 1, op: "dicted", i: p1.i, v: [true, false] });
  assert.deepEqual(await one, [true, false]);

  /* odd replies read as null: not an array, wrong length, a value that is not a boolean */
  const bad = [null, "yes", [true], [true, false, true], [true, 1], { 0: true }];
  const calls = bad.map(() => a.PAD.dict.inBook(["cat", "dog"]));
  const ps = a.posted().slice(1);
  bad.forEach((v, k) => a.fromRuntime({ pad: 1, op: "dicted", i: ps[k].i, v }));
  assert.deepEqual(await Promise.all(calls), bad.map(() => null));
});

test("wordbook: addWord and removeWord post the word and resolve one of saved, denied, full or null", async () => {
  const a = app({ dict: true });
  const add = a.PAD.dict.addWord("Cat"), rem = a.PAD.dict.removeWord("dog");
  const [pa, pr] = a.posted();
  assert.deepEqual(pa, { op: "dict", kind: "add", word: "Cat", i: pa.i, pad: 1 });
  assert.deepEqual(pr, { op: "dict", kind: "remove", word: "dog", i: pr.i, pad: 1 });
  a.fromRuntime({ pad: 1, op: "dicted", i: pa.i, v: "saved" }, {});   /* not from the parent: ignored */
  a.fromRuntime({ pad: 1, op: "dicted", i: pa.i, v: "saved" });
  a.fromRuntime({ pad: 1, op: "dicted", i: pr.i, v: "full" });
  assert.deepEqual(await Promise.all([add, rem]), ["saved", "full"]);

  /* anything that is not one of the four answers reads as null */
  const bad = ["weird", true, {}, [], "SAVED", null];
  const calls = bad.map(() => a.PAD.dict.addWord("cat"));
  const ps = a.posted().slice(2);
  bad.forEach((v, k) => a.fromRuntime({ pad: 1, op: "dicted", i: ps[k].i, v }));
  assert.deepEqual(await Promise.all(calls), bad.map(() => null));
  assert.deepEqual(await (() => { const p = a.PAD.dict.removeWord("cat"); a.fromRuntime({ pad: 1, op: "dicted", i: a.posted().slice(-1)[0].i, v: "denied" }); return p; })(), "denied");
});

test("wordbook: bad arguments reject with PAD.dict.<method>, and nothing is posted", async () => {
  const a = app({ dict: true });
  await assert.rejects(a.PAD.dict.inBook("cat"), /PAD\.dict\.inBook: words is an array of 1 to 20 words/);
  await assert.rejects(a.PAD.dict.inBook([]), /PAD\.dict\.inBook: words is an array of 1 to 20 words/);
  await assert.rejects(a.PAD.dict.inBook(new Array(21).fill("cat")), /PAD\.dict\.inBook: words is an array of 1 to 20 words/);
  await assert.rejects(a.PAD.dict.inBook(["cat", 7]), /PAD\.dict\.inBook: the word is 1 to 32 letters a-z/);
  await assert.rejects(a.PAD.dict.inBook(["two words"]), /PAD\.dict\.inBook: the word is 1 to 32 letters a-z/);
  await assert.rejects(a.PAD.dict.addWord(""), /PAD\.dict\.addWord: the word is 1 to 32 letters a-z/);
  await assert.rejects(a.PAD.dict.addWord("café"), /PAD\.dict\.addWord: the word is 1 to 32 letters a-z/);
  await assert.rejects(a.PAD.dict.removeWord("x".repeat(33)), /PAD\.dict\.removeWord: the word is 1 to 32 letters a-z/);
  await assert.rejects(a.PAD.dict.removeWord(42), /PAD\.dict\.removeWord: the word is 1 to 32 letters a-z/);
  assert.equal(a.posted().length, 0);
});

test("wordbook: a runtime error rejects with the method's name, not the message kind", async () => {
  const a = app({ dict: true });
  const add = a.PAD.dict.addWord("cat"), rem = a.PAD.dict.removeWord("cat"), book = a.PAD.dict.inBook(["cat"]);
  const [pa, pr, pb] = a.posted();
  a.fromRuntime({ pad: 1, op: "dicted", i: pa.i, error: "no word book" });
  a.fromRuntime({ pad: 1, op: "dicted", i: pr.i, error: "no word book" });
  a.fromRuntime({ pad: 1, op: "dicted", i: pb.i, error: "no word book" });
  await assert.rejects(add, /PAD\.dict\.addWord: no word book/);
  await assert.rejects(rem, /PAD\.dict\.removeWord: no word book/);
  await assert.rejects(book, /PAD\.dict\.inBook: no word book/);
});

/* ---------- the link (SPEC.md 6.8, runtime 0.58.0) ---------- */
test("link: PAD.link exists only when the runtime offers it, and the wrapper passes link", () => {
  assert.equal(app().PAD.link, undefined);
  assert.equal(app({ sensors: true, notes: true, say: true, camera: true, dict: true }).PAD.link, undefined);
  assert.equal(app({ link: "yes" }).PAD.link, undefined);
  const { PAD } = app({ link: true });
  assert.equal(typeof PAD.link.open, "function");
  assert.equal(typeof PAD.link.send, "function");
  assert.equal(typeof PAD.link.close, "function");
  assert.equal(PAD.link.state, "closed");
  assert.equal(PAD.link.initiator, false);
  assert.ok(Object.isFrozen(PAD.link));
  const { lopdaWrapApp: wrap } = runScript("sdk/pad-shim.js", {});
  assert.match(wrap("<p>x</p>", { dict: true, link: true }), /\(\{"dict":true,"link":true\}\);/);
  assert.ok(wrap("<p>x</p>", { link: 1 }).includes(")();"), "link only when it is true");
});

test("link: open posts proto (default empty) and settles from the matching reply; state and initiator follow", async () => {
  const a = app({ link: true });
  const one = a.PAD.link.open({ proto: "gomoku1" });
  const [p1] = a.posted();
  assert.deepEqual(p1, { op: "link", i: p1.i, action: "open", proto: "gomoku1", pad: 1 });
  a.fromRuntime({ pad: 1, op: "linked", i: p1.i, v: "open", initiator: true }, {});   /* not from the parent: ignored */
  assert.equal(a.PAD.link.state, "closed");
  a.fromRuntime({ pad: 1, op: "linked", i: p1.i, v: "open", initiator: true });
  assert.equal(await one, "open");
  assert.equal(a.PAD.link.state, "open");
  assert.equal(a.PAD.link.initiator, true);

  const two = a.PAD.link.open();
  const p2 = a.posted()[1];
  assert.equal(p2.proto, "", "proto defaults to empty");
  a.fromRuntime({ pad: 1, op: "linked", i: p2.i, v: "denied" });
  assert.equal(await two, "denied");
  assert.equal(a.PAD.link.state, "closed");
  assert.equal(a.PAD.link.initiator, false);

  /* proto: ASCII, at most 16 characters; a bad one rejects before anything is posted */
  const posted = a.posted().length;
  await assert.rejects(a.PAD.link.open({ proto: "x".repeat(17) }), /PAD\.link\.open: proto/);
  await assert.rejects(a.PAD.link.open({ proto: "café" }), /PAD\.link\.open: proto/);
  await assert.rejects(a.PAD.link.open({ proto: "gomoku1\u0080" }), /PAD\.link\.open: proto/);
  await assert.rejects(a.PAD.link.open({ proto: 7 }), /PAD\.link\.open: proto/);
  assert.equal(a.posted().length, posted);
});

test("link: send takes a string or a Uint8Array of at most 200 bytes and settles from the reply", async () => {
  const a = app({ link: true });
  const U8 = vm.runInContext("Uint8Array", a.ctx);
  const one = a.PAD.link.send("m,1,2,3"), two = a.PAD.link.send(new U8([1, 2, 3]));
  const [p1, p2] = a.posted();
  assert.deepEqual(p1, { op: "link", i: p1.i, action: "send", data: "m,1,2,3", pad: 1 });
  assert.deepEqual(p2, { op: "link", i: p2.i, action: "send", data: { 0: 1, 1: 2, 2: 3 }, pad: 1 });
  /* strings count their UTF-8 bytes: 67 chinese characters are 201, so the shim answers "big" without posting */
  assert.equal(await a.PAD.link.send("測".repeat(67)), "big");
  assert.equal(await a.PAD.link.send(new U8(201)), "big");
  await assert.rejects(a.PAD.link.send(7), /PAD\.link\.send: data is a string or a Uint8Array/);
  await assert.rejects(a.PAD.link.send([1, 2, 3]), /PAD\.link\.send: data is a string or a Uint8Array/);
  await assert.rejects(a.PAD.link.send(null), /PAD\.link\.send: data is a string or a Uint8Array/);
  assert.equal(a.posted().length, 2, "a refused message posts nothing");
  a.fromRuntime({ pad: 1, op: "linked", i: p1.i, v: "sent" }, {});   /* not from the parent: ignored */
  a.fromRuntime({ pad: 1, op: "linked", i: p1.i, v: "sent" });
  a.fromRuntime({ pad: 1, op: "linked", i: p2.i, v: "big" });
  assert.deepEqual(await Promise.all([one, two]), ["sent", "big"]);
});

test("link: incoming messages and close reach PAD.on('link'); close sets state", async () => {
  const a = app({ link: true });
  const U8 = vm.runInContext("Uint8Array", a.ctx);
  const log = [];
  const fn = (ev) => log.push(ev);
  a.PAD.on("link", fn);
  const p = a.PAD.link.open({ proto: "x" });
  a.fromRuntime({ pad: 1, op: "linked", i: a.posted()[0].i, v: "open", initiator: false });
  await p;
  assert.equal(a.PAD.link.state, "open");
  assert.equal(a.PAD.link.initiator, false);

  a.fromRuntime({ pad: 1, op: "link", event: "message", data: "hello" }, {});   /* not from the parent: ignored */
  a.fromRuntime({ pad: 1, op: "link", event: "message", data: "hello" });
  a.fromRuntime({ pad: 1, op: "link", event: "message", data: new U8([1, 2]) });
  a.fromRuntime({ pad: 1, op: "link", event: "message", data: { evil: 1 } });    /* not a string or bytes: dropped */
  a.fromRuntime({ pad: 1, op: "link", event: "message", data: null });
  assert.equal(log.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(log[0])), { type: "message", data: "hello" });
  assert.equal(log[1].data.length, 2);

  a.fromRuntime({ pad: 1, op: "link", event: "close", reason: "lost" });
  assert.equal(a.PAD.link.state, "closed");
  assert.equal(a.PAD.link.initiator, false);
  assert.deepEqual(JSON.parse(JSON.stringify(log[2])), { type: "close", reason: "lost" });

  a.PAD.off("link", fn);
  a.fromRuntime({ pad: 1, op: "link", event: "message", data: "after off" });
  assert.equal(log.length, 3, "PAD.off stops the listener");
});
