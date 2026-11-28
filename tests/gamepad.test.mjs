/* runtime/gamepad.js in node:vm with fake controllers, a fake DOM and a fake store:
   the default keys, the chin pad gate, press-to-bind on Settings -> 手柄, keyboard keys, what is stored,
   and the 1.7.4 fixes (first press, blur, typing, modifiers, hysteresis, one animation loop). */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../runtime/gamepad.js", import.meta.url), "utf8");

function el() {
  const set = new Set();
  return {
    hidden: false, style: {}, textContent: "", children: [], className: "", attrs: {},
    appendChild(c) { this.children.push(c); },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    focus() { this.focused = true; },
    querySelector(sel) {
      const m = /data-k="([^"]+)"/.exec(sel);
      return m ? this.children.find((c) => c.attrs && c.attrs["data-k"] === m[1]) || null : null;
    },
    addEventListener() {},
    classList: { contains: (k) => set.has(k), add: (k) => set.add(k), remove: (k) => set.delete(k) },
  };
}
function boot({ id = "Xbox Wireless Controller", mapping = "standard", stored = null, present = true, buttons: buttonCount = 17 } = {}) {
  const L = {}, on = (t, f) => (L[t] = L[t] || []).push(f);
  const els = { gamepad: el() };
  ["v-set-pad", "set-pad-list", "set-pad-who", "set-pad-msg", "set-pad-live", "set-pad-reset"].forEach((k) => { els[k] = el(); });
  els["v-set-pad"].hidden = true;
  const buttons = Array.from({ length: buttonCount }, () => ({ pressed: false, value: 0 }));
  const gp = { index: 0, id, mapping, connected: true, buttons, axes: [0, 0, 0, 0] };
  let here = !!present;
  let raf = [], rafId = 0, timers = [];
  const calls = [], writes = [];
  const builtins = [];
  const document = {
    hidden: false, documentElement: el(), activeElement: null,
    getElementById: (k) => els[k], addEventListener: (t, f) => on("d" + t, f), createElement: () => el(),
  };
  const ctx = {
    document,
    navigator: { getGamepads: () => (here ? [gp] : []) },
    requestAnimationFrame: (f) => { const id = ++rafId; raf.push({ id, f }); return id; },
    cancelAnimationFrame: (id) => { raf = raf.filter((x) => x.id !== id); },
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout: () => {},
    Math, Object, Array, JSON,
  };
  ctx.window = ctx; ctx.addEventListener = (t, f) => on("w" + t, f);
  ctx.LP = { $: (k) => els[k], setButton: (b, d) => calls.push(b + (d ? "+" : "-")), toast() {}, sfx() {},
    tr: (k, v) => k + (v ? JSON.stringify(v) : ""), own: (d) => d, builtin: (b) => { builtins.push(b); return b; },
    S: { db: { doc: () => ({ get: () => Promise.resolve(stored ? { exists: true, data: () => stored } : { exists: false }) }) } },
    put: (r, d) => writes.push(JSON.parse(JSON.stringify(d))) };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const page = builtins.find((b) => b.id === "set-pad");
  const step = () => { const r = raf; raf = []; r.forEach((x) => x.f()); };
  const press = (i, down, which = gp) => { which.buttons[i].pressed = down; which.buttons[i].value = down ? 1 : 0; step(); };
  const tap = (i, ...more) => { press(i, true); press(i, false); more.forEach((j) => tap(j)); };
  const key = (type, k, props = {}) => {
    const target = props.target || { nodeName: props.nodeName || "BODY" };
    L["d" + type].forEach((f) => f({ key: k, code: props.code, target,
      ctrlKey: !!props.ctrlKey, altKey: !!props.altKey, metaKey: !!props.metaKey, shiftKey: !!props.shiftKey,
      isComposing: !!props.isComposing, preventDefault() {}, stopPropagation() {} }));
  };
  const connect = () => { here = true; L.wgamepadconnected[0]({ gamepad: gp }); step(); };
  const blur = () => L.wblur.forEach((f) => f());
  const tab = (hidden) => { document.hidden = hidden; L.dvisibilitychange.forEach((f) => f()); };
  const kb = (on) => { if (on) document.documentElement.classList.add("kb"); else document.documentElement.classList.remove("kb"); };
  const openPage = () => { els["v-set-pad"].hidden = false; page.enter(); step(); };
  const closePage = () => { els["v-set-pad"].hidden = true; page.leave(); };
  const row = (k) => els["set-pad-list"].children[["up", "down", "left", "right", "a", "b", "start", "select"].indexOf(k)];
  if (present) connect();
  return { gp, els, document, calls, writes, page, step, press, tap, key, connect, blur, tab, kb, openPage, closePage, row, timers,
    frames: () => raf.length, ready: () => page.ready() };
}

test("gamepad: a standard pad presses A, B, START, SELECT and the D-pad by the spec's numbering", () => {
  const t = boot();
  t.tap(0, 1, 9, 8, 12, 5, 4);
  assert.deepEqual(t.calls, ["a+", "a-", "b+", "b-", "start+", "start-", "select+", "select-", "up+", "up-", "start+", "start-", "select+", "select-"]);
  t.calls.length = 0;
  t.gp.axes[0] = -0.9; t.step(); t.gp.axes[0] = 0; t.step();
  assert.deepEqual(t.calls, ["left+", "left-"], "the left stick is the D-pad too");
});

test("gamepad: a single Joy-Con on the iPhone (empty mapping) has A on 0 and 2, B on 1 and 3, SL / SR as SELECT / START", () => {
  const t = boot({ id: "Joy-Con (L)", mapping: "" });
  t.tap(0, 2, 1, 3, 4, 5);
  assert.deepEqual(t.calls, ["a+", "a-", "a+", "a-", "b+", "b-", "b+", "b-", "select+", "select-", "start+", "start-"]);
});

test("gamepad: a six-axis raw pad's hat is the D-pad; a four-axis pad's right stick is not", () => {
  const t = boot({ id: "Some Pad", mapping: "" });
  t.gp.axes = [0, 0, 0, 0, 0, -1]; t.step(); t.gp.axes = [0, 0, 0, 0, 0, 0]; t.step();
  t.gp.axes = [0, 0, 0, 0, 0, -0.7]; t.step();
  assert.deepEqual(t.calls, ["up+", "up-"]);
  t.calls.length = 0;
  t.gp.axes = [0, 0, 1, 0]; t.step();
  assert.deepEqual(t.calls, [], "four axes are two sticks, not a stick and a hat");
});

test("gamepad: nothing is pressed while the chin pad is hidden, and a held key lets go when it hides", () => {
  const t = boot();
  t.press(0, true);
  t.els.gamepad.hidden = true; t.step();
  t.press(1, true);
  assert.deepEqual(t.calls, ["a+", "a-"]);
});

test("gamepad: Settings -> 手柄 binds a button to a key, takes it from the other keys and stores it per controller", () => {
  const t = boot();
  t.openPage();
  t.row("a").onclick();
  assert.equal(t.calls.length, 0);
  t.press(7, true);
  const m = t.writes.at(-1).maps["Xbox Wireless Controller"];
  assert.deepEqual(m.a, ["b7"]);
  assert.ok(!m.start.includes("b7"), "button 7 is no longer START");
  t.press(7, false);
  t.closePage(); t.calls.length = 0;
  t.tap(7, 0);
  assert.deepEqual(t.calls, ["a+", "a-"], "7 is A now, 0 is nothing");
});

test("gamepad: binding a stick direction binds its opposite on the same stick", () => {
  const t = boot();
  t.openPage();
  t.row("up").onclick();
  t.gp.axes[3] = 0.9; t.step();
  const m = t.writes.at(-1).maps["Xbox Wireless Controller"];
  assert.deepEqual(m.up, ["a3+"]); assert.deepEqual(m.down, ["a3-"]);
});

test("gamepad: a button held when the key is tapped is not taken; a press with nothing new times out", () => {
  const t = boot();
  t.press(2, true);
  t.openPage();
  t.row("b").onclick(); t.step();
  assert.equal(t.writes.length, 0, "the held button is the baseline");
  t.timers.at(-1)();
  assert.match(t.els["set-pad-msg"].textContent, /pad\.timeout/);
});

test("gamepad: the press that connects a pad during capture is bound, not swallowed", () => {
  const t = boot({ present: false });
  t.openPage();
  t.row("a").onclick();
  t.press(0, true, t.gp);
  t.connect();
  assert.deepEqual(t.writes.at(-1).maps["Xbox Wireless Controller"].a, ["b0"]);
});

test("gamepad: keyboard keys bind on the page (letters by their lower case) and press only while the chin pad shows", () => {
  const t = boot();
  t.openPage();
  t.row("up").onclick(); t.key("keydown", "W");
  t.row("a").onclick(); t.key("keydown", "j");
  assert.deepEqual(t.writes.at(-1).keys, { w: "up", j: "a" });
  t.closePage(); t.calls.length = 0;
  t.key("keydown", "w"); t.key("keydown", "w"); t.key("keyup", "w");
  t.key("keydown", "j", { nodeName: "INPUT" });
  assert.deepEqual(t.calls, ["up+", "up-"], "a repeat presses once; a text field keeps its letters");
  t.els.gamepad.hidden = true; t.key("keydown", "j");
  assert.deepEqual(t.calls, ["up+", "up-"]);
  t.els.gamepad.hidden = false;
  t.openPage(); t.row("up").onclick(); t.key("keydown", "Escape");
  assert.deepEqual(t.writes.at(-1).keys, { w: "up", j: "a" }, "Escape cancels");
  t.row("up").onclick(); t.key("keydown", "ArrowUp");
  assert.deepEqual(t.writes.at(-1).keys, { ArrowUp: "up", j: "a" }, "a key bound again replaces the old one");
});

test("gamepad: a physical key is stored by code; Shift and shortcuts are not bound", () => {
  const t = boot();
  t.openPage();
  t.row("up").onclick(); t.key("keydown", "w", { code: "KeyW" });
  assert.deepEqual(t.writes.at(-1).keys, { KeyW: "up" });
  t.row("b").onclick(); t.key("keydown", "Shift", { code: "ShiftLeft" });
  assert.deepEqual(t.writes.at(-1).keys, { KeyW: "up" }, "Shift is a modifier, not a key");
  t.key("keydown", "w", { code: "KeyW", ctrlKey: true });
  assert.deepEqual(t.writes.at(-1).keys, { KeyW: "up" }, "Ctrl+W is a shortcut, not a bind");
  t.closePage(); t.calls.length = 0;
  t.key("keydown", "w", { code: "KeyW" }); t.key("keyup", "w", { code: "KeyW" });
  assert.deepEqual(t.calls, ["up+", "up-"], "the same physical key works after a layout change");
  t.key("keydown", "w", { code: "KeyW", isComposing: true });
  assert.deepEqual(t.calls, ["up+", "up-"], "an IME composition is not a game key");
});

test("gamepad: axes press at 0.6 and let go at 0.35", () => {
  const t = boot();
  t.gp.axes[0] = 0.55; t.step(); assert.deepEqual(t.calls, []);
  t.gp.axes[0] = 0.65; t.step(); assert.deepEqual(t.calls, ["right+"]);
  t.calls.length = 0;
  t.gp.axes[0] = 0.45; t.step(); assert.deepEqual(t.calls, [], "still held between the two lines");
  t.gp.axes[0] = 0.3; t.step(); assert.deepEqual(t.calls, ["right-"]);
});

test("gamepad: a controller held through a blur is not released and pressed again", () => {
  const t = boot();
  t.press(0, true);
  assert.deepEqual(t.calls, ["a+"]);
  t.calls.length = 0;
  t.blur(); t.step();
  assert.deepEqual(t.calls, [], "the poll keeps the still-held button down");
});

test("gamepad: a pad is quiet while a text field has the soft keyboard", () => {
  const t = boot();
  t.kb(true); t.press(0, true);
  assert.deepEqual(t.calls, [], "the chin pad is hidden by html.kb");
  t.kb(false); t.press(0, false); t.press(0, true);
  assert.deepEqual(t.calls, ["a+"]);
});

test("gamepad: hiding and showing again leaves one animation loop", () => {
  const t = boot();
  assert.equal(t.frames(), 1, "one loop while the pad is shown");
  t.tab(true);
  t.tab(false);
  assert.equal(t.frames(), 1, "the hidden loop was cancelled, not stacked");
  t.step();
  assert.equal(t.frames(), 1);
});

test("gamepad: stored bindings load, junk is dropped, and reset forgets this controller and the keyboard", async () => {
  const t = boot({ stored: { v: 1, maps: { "Xbox Wireless Controller": { a: ["b6", 3], b: "x" } }, keys: { k: "b", q: "fly" } } });
  t.ready(); await new Promise((r) => setImmediate(r));
  t.tap(6, 0);
  assert.deepEqual(t.calls, ["a+", "a-"]);
  t.calls.length = 0;
  t.key("keydown", "k"); t.key("keyup", "k"); t.key("keydown", "q");
  assert.deepEqual(t.calls, ["b+", "b-"]);
  t.openPage(); t.els["set-pad-reset"].onclick();
  assert.deepEqual(t.writes.at(-1), { v: 1, maps: {}, keys: {} });
});

test("gamepad: a six-axis raw pad shows its hat source as the D-pad", () => {
  const t = boot({ id: "Some Pad", mapping: "" });
  t.gp.axes = [0, 0, 0, 0, 0, 0];
  t.openPage();
  const state = t.row("up").children[1].textContent;
  assert.match(state, /pad\.src\.hat/, JSON.stringify(state));
});
