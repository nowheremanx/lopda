// runtime/homeorder.js: the home screen's order, stored once and only ever grown at the end (decisions.md section 71).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const H = runScript("runtime/homeorder.js", {}).LopdaHomeOrder;
const plain = (v) => JSON.parse(JSON.stringify(v));
/* registration order, as index.html loads the built-ins */
const BUILTINS = ["notes", "calendar", "dict", "reader", "camera", "darkroom", "studio", "cart", "radio", "tuner", "pet", "store", "scripts", "settings"];
const PRE = [{ id: "calculator", preinstalled: 1, installed: 5 }, { id: "paint", preinstalled: 2, installed: 6 }];

test("a phone with no document gets the default order, then its own apps by install time", () => {
  const apps = [...PRE, { id: "gomoku", installed: 20 }, { id: "klotski", installed: 10 }];
  const r = H.arrange(null, BUILTINS, apps, true);
  assert.deepEqual(plain(r.keys), [
    "b:notes", "b:calendar", "b:pet", "b:camera", "b:darkroom", "b:reader", "b:dict", "b:tuner", "b:studio",
    "b:cart", "b:radio", "b:scripts", "b:store", "b:settings", "a:calculator", "a:paint", "a:klotski", "a:gomoku"]);
  assert.equal(r.changed, true);
});

test("the first start stores the places of paint and the calculator before they are installed", () => {
  const r = H.arrange(null, BUILTINS, [], true);
  assert.deepEqual(plain(r.keys), plain(H.DEFAULT).filter((k) => k[0] === "b"));
  assert.deepEqual(plain(r.order), plain(H.DEFAULT));
  const later = H.arrange(r.order, BUILTINS, PRE, true);
  assert.equal(later.changed, false);
  assert.deepEqual(plain(later.keys.slice(-2)), ["a:calculator", "a:paint"]);
});

test("a stored order is kept as it is, and a new install goes last", () => {
  const stored = ["a:paint", "b:settings", "b:notes", "a:gomoku", "b:calendar", "b:dict", "b:reader", "b:camera", "b:darkroom",
    "b:studio", "b:cart", "b:radio", "b:tuner", "b:pet", "b:store", "b:scripts", "a:calculator"];
  const apps = [...PRE, { id: "gomoku", installed: 30 }];
  const same = H.arrange(stored, BUILTINS, apps, true);
  assert.equal(same.changed, false);
  assert.deepEqual(plain(same.keys), stored);
  const more = H.arrange(stored, BUILTINS, [...apps, { id: "klotski", installed: 1 }], true);
  assert.equal(more.changed, true);
  assert.deepEqual(plain(more.keys), [...stored, "a:klotski"]);
});

test("a new built-in goes after everything the phone already has", () => {
  const stored = plain(H.DEFAULT).filter((k) => k !== "b:tuner").concat(["a:gomoku"]);
  const apps = [...PRE, { id: "gomoku", installed: 30 }];
  const r = H.arrange(stored, BUILTINS, apps, true);
  assert.deepEqual(plain(r.keys), [...stored, "b:tuner"]);
});

test("an uninstall takes away only its own tile; nothing else moves", () => {
  const stored = [...plain(H.DEFAULT), "a:gomoku", "a:klotski"];
  const r = H.arrange(stored, BUILTINS, [...PRE, { id: "klotski", installed: 9 }], true);
  assert.deepEqual(plain(r.order), [...plain(H.DEFAULT), "a:klotski"]);
  assert.equal(r.changed, true);
});

test("before the installed apps are read, their places are kept but not drawn", () => {
  const stored = [...plain(H.DEFAULT), "a:gomoku"];
  const r = H.arrange(stored, BUILTINS, [], false);
  assert.deepEqual(plain(r.order), stored);
  assert.equal(r.changed, false);
  assert.ok(!r.keys.some((k) => k[0] === "a"));
});

test("a built-in this runtime does not have keeps its place (an older cache opened the phone)", () => {
  const stored = [...plain(H.DEFAULT), "b:future"];
  const r = H.arrange(stored, BUILTINS, PRE, true);
  assert.equal(r.changed, false);
  assert.ok(!r.keys.includes("b:future"));
});

test("an app whose id is a built-in's gets a tile of its own", () => {
  const r = H.arrange(plain(H.DEFAULT), BUILTINS, [...PRE, { id: "notes", installed: 50 }], true);
  assert.deepEqual(plain(r.keys.slice(-1)), ["a:notes"]);
  assert.ok(r.keys.includes("b:notes"));
});

test("a damaged document reads as no order, and junk keys are dropped", () => {
  assert.equal(H.read(null), null);
  assert.equal(H.read({ order: "b:notes" }), null);
  assert.equal(H.read([]), null);
  assert.deepEqual(plain(H.read({ v: 1, order: ["b:notes", 7, "x:y", "b:", "b:notes", "a:paint"] })), ["b:notes", "a:paint"]);
  assert.deepEqual(plain(H.doc(["b:notes"])), { v: 1, order: ["b:notes"] });
});
