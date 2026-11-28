/* runtime/gamepad.js in node:vm with a fake controller, a fake DOM and a fake store:
   the default keys, the chin pad gate, press-to-bind on Settings -> 手柄, keyboard keys, and what is stored. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

const SRC = fs.readFileSync(new URL("../runtime/gamepad.js", import.meta.url), "utf8");

function el() {
  return { hidden: false, style: {}, textContent: "", children: [], className: "",
    appendChild(c) { this.children.push(c); }, setAttribute() {}, addEventListener() {} };
}
function boot({ id = "Xbox Wireless Controller", mapping = "standard", stored = null } = {}) {
  const L = {}, on = (t, f) => (L[t] = L[t] || []).push(f);
  const els = { gamepad: el() };
  ["v-set-pad", "set-pad-list", "set-pad-who", "set-pad-msg", "set-pad-live", "set-pad-reset"].forEach((k) => { els[k] = el(); });
  els["v-set-pad"].hidden = true;
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  const gp = { index: 0, id, mapping, connected: true, buttons, axes: [0, 0, 0, 0] };
  let raf = [], timers = [];
  const calls = [], writes = [];
  const builtins = [];
  const document = { hidden: false, getElementById: (k) => els[k], addEventListener: (t, f) => on("d" + t, f), createElement: () => el() };
  const ctx = { document, navigator: { getGamepads: () => [gp] }, requestAnimationFrame: (f) => raf.push(f),
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout: () => {}, Math, Object, Array, JSON };
  ctx.window = ctx; ctx.addEventListener = (t, f) => on("w" + t, f);
  ctx.LP = { $: (k) => els[k], setButton: (b, d) => calls.push(b + (d ? "+" : "-")), toast() {}, sfx() {},
    tr: (k, v) => k + (v ? JSON.stringify(v) : ""), own: (d) => d, builtin: (b) => { builtins.push(b); return b; },
    S: { db: { doc: () => ({ get: () => Promise.resolve(stored ? { exists: true, data: () => stored } : { exists: false }) }) } },
    put: (r, d) => writes.push(JSON.parse(JSON.stringify(d))) };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const page = builtins.find((b) => b.id === "set-pad");
  const step = () => { const r = raf; raf = []; r.forEach((f) => f()); };
  const press = (i, down) => { buttons[i].pressed = down; step(); };
  const tap = (i, ...more) => { press(i, true); press(i, false); more.forEach((j) => tap(j)); };
  const key = (type, k, target = { nodeName: "BODY" }) => L["d" + type].forEach((f) => f({ key: k, target, preventDefault() {}, stopPropagation() {} }));
  const openPage = () => { els["v-set-pad"].hidden = false; page.enter(); step(); };
  const closePage = () => { els["v-set-pad"].hidden = true; page.leave(); };
  const row = (k) => els["set-pad-list"].children[["up", "down", "left", "right", "a", "b", "start", "select"].indexOf(k)];
  L.wgamepadconnected[0]({ gamepad: gp });
  step();
  return { gp, els, calls, writes, page, step, press, tap, key, openPage, closePage, row, timers, ready: () => page.ready() };
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

test("gamepad: a raw pad's hat on the last two axes is the D-pad; a stick resting between values is not", () => {
  const t = boot({ id: "Some Pad", mapping: "" });
  t.gp.axes = [0, 0, 0, 0, 0, -1]; t.step(); t.gp.axes = [0, 0, 0, 0, 0, 0]; t.step();
  t.gp.axes = [0, 0, 0, 0, 0, -0.7]; t.step();
  assert.deepEqual(t.calls, ["up+", "up-"]);
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
