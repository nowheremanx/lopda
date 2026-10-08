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
  /* the injected shim is the real function source and runs on its own */
  const src = wrap("<p>x</p>").match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(src));
});

test("the shim, lo-game and the checker agree on buttons and sounds", () => {
  const { PAD } = app();
  const list = (src, name) => JSON.parse(src.match(new RegExp(name + " = (\\[[^\\]]*\\])"))[1]);
  assert.deepEqual(list(read("tools/check-app.mjs"), "SOUNDS"), [...PAD.SOUNDS]);
  assert.deepEqual(list(read("sdk/lo-game.js"), "BUTTONS"), [...PAD.BUTTONS]);
});
