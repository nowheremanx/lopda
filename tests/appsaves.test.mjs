// runtime/appsaves.js: the save document's shape, what counts as damaged, and what a new record keeps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const A = runScript("runtime/appsaves.js", {}).LopdaAppSaves;
const plain = (v) => JSON.parse(JSON.stringify(v));   /* values from the vm realm compare as plain ones */

test("a legacy {kv} document reads as a save, with no schema and no app name", () => {
  const r = A.read({ kv: { score: 3 } }, "probe");
  assert.deepEqual(plain(r.kv), { score: 3 });
  assert.equal(r.code, null);
  assert.equal(r.schema, null);
  assert.equal(r.updated, 0);
  assert.equal(r.bytes, A.size({ score: 3 }));
  assert.deepEqual(plain(r.app), { id: "probe" }, "the id is the fallback name");
});

test("a missing kv is an empty save, not damage; a non-object kv is damage", () => {
  assert.deepEqual(plain(A.read({}, "x").kv), {});
  assert.equal(A.read({}, "x").code, null);
  assert.equal(A.read({ kv: "oops" }, "x").code, "corrupt");
  assert.equal(A.read({ kv: [] }, "x").code, "corrupt");
  assert.equal(A.read(null, "x").code, "corrupt");
  assert.equal(A.read("oops", "x").code, "corrupt");
});

test("a document format this runtime does not know is newer, and is not mistaken for damage", () => {
  const r = A.read({ v: 2, kv: { a: 1 } }, "x");
  assert.equal(r.code, "newer");
  assert.deepEqual(plain(r.kv), {}, "nothing is handed to the app");
  assert.equal(A.read({ v: 1, kv: { a: 1 } }, "x").code, null);
});

test("schema must be a finite, non-negative integer", () => {
  assert.equal(A.read({ kv: {}, schema: 3 }, "x").schema, 3);
  assert.equal(A.read({ kv: {}, schema: 3.9 }, "x").schema, 3);
  assert.equal(A.read({ kv: {}, schema: -1 }, "x").schema, null);
  assert.equal(A.read({ kv: {}, schema: "4" }, "x").schema, null);
  assert.equal(A.validSchema(Infinity), null);
  assert.equal(A.validSchema(A.MAX_SCHEMA + 1), null);
  assert.equal(A.validSchema(0), 0);
});

test("record keeps the schema, the size, the time and enough of the app to name it later", () => {
  const app = { id: "gomoku", name: "五子棋", version: "1.2.0", author: "Haowei Wu", i18n: { en: { name: "Gomoku" } } };
  const r = A.record("gomoku", { board: [1, 2] }, { schema: 2, app: { id: "old", name: "Old" } }, app, 1234);
  assert.deepEqual(plain(r), {
    v: 1,
    kv: { board: [1, 2] },
    updated: 1234,
    bytes: A.size({ board: [1, 2] }),
    schema: 2,
    app,
  });
  assert.deepEqual(plain(A.info(r)), { schema: 2, version: "1.2.0", updated: 1234, bytes: A.size({ board: [1, 2] }) });
});

test("record without an installed app keeps the app name it had, or falls back to the id", () => {
  const kept = A.record("gone", { a: 1 }, { schema: 1, app: { id: "gone", name: "Gone" } }, null, 7);
  assert.deepEqual(plain(kept.app), { id: "gone", name: "Gone" });
  const bare = A.record("bare", {}, null, null, 7);
  assert.deepEqual(plain(bare.app), { id: "bare" });
  assert.equal(bare.schema, undefined);
});

test("appInfo keeps only the fields the shelf needs, and refuses non-objects", () => {
  assert.equal(A.appInfo(null), null);
  assert.equal(A.appInfo([]), null);
  assert.deepEqual(plain(A.appInfo({ id: "a", name: "A", version: "1", author: "B", i18n: { zh: { name: "甲" } }, glyph: "x", web: 1 })),
    { id: "a", name: "A", version: "1", author: "B", i18n: { zh: { name: "甲" } } });
});

test("info on nothing is all nulls; size survives values JSON cannot hold", () => {
  assert.deepEqual(plain(A.info(null)), { schema: null, version: null, updated: 0, bytes: 0 });
  assert.equal(A.size({}), 2);
  assert.equal(A.size(undefined), 0);
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(A.size(cyclic), 0);
});

test("error carries the code the app and the runtime switch on", () => {
  const e = A.error("corrupt");
  assert.equal(e.code, "corrupt");
  assert.match(e.message, /corrupt/);
  assert.equal(A.error().code, "readfail");
});
