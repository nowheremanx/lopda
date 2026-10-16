// tools/stamp-preview.mjs: the version stamp the pages workflow puts on every PR preview.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { read, tool, tempDir } from "./helpers.mjs";

const SHA = "0123abcdef4567890123abcdef4567890123abcd";

/* copies of the real core.js and sw.js in <tmp>/runtime/ */
function copy(t, edit = (s) => s) {
  const dir = tempDir(t);
  mkdirSync(join(dir, "runtime"));
  for (const f of ["core.js", "sw.js"]) writeFileSync(join(dir, "runtime", f), edit(read(`runtime/${f}`), f));
  return dir;
}
const readRt = (dir, f) => readFileSync(join(dir, "runtime", f), "utf8");

test("stamps core.js and sw.js with the same version, which the update check reads", (t) => {
  const dir = copy(t);
  const base = read("runtime/core.js").match(/var RUNTIME_VERSION="([^"]+)"/)[1];
  const r = tool("stamp-preview.mjs", dir, SHA);
  assert.equal(r.code, 0, r.out);
  const want = `${base}+0123abc`;
  assert.equal(r.out.trim(), want);
  const rt = readRt(dir, "core.js").match(/var RUNTIME_VERSION="([^"]+)"/)[1];
  /* the same pattern as latestVersion() in core.js */
  const sw = /VERSION\s*=\s*"lopda-v([^"]+)"/.exec(readRt(dir, "sw.js"))[1];
  assert.equal(rt, want);
  assert.equal(sw, want);
  /* the rest of each file is untouched */
  assert.equal(readRt(dir, "core.js").replace(want, base), read("runtime/core.js"));
  assert.equal(readRt(dir, "sw.js").replace(want, base), read("runtime/sw.js"));
});

test("fails loudly when either version line is missing", (t) => {
  for (const f of ["core.js", "sw.js"]) {
    const dir = copy(t, (s, name) => (name === f ? s.replace(/VERSION/g, "V") : s));
    const r = tool("stamp-preview.mjs", dir, SHA);
    assert.equal(r.code, 1, f);
    assert.match(r.out, new RegExp(`${f}: no var`), f);
    assert.equal(readRt(dir, "core.js").includes("+0123abc"), false, "nothing written");
  }
});

test("refuses a bad sha, a second stamp, and versions that differ", (t) => {
  assert.equal(tool("stamp-preview.mjs", copy(t), "main").code, 1);
  const dir = copy(t);
  assert.equal(tool("stamp-preview.mjs", dir, SHA).code, 0);
  assert.match(tool("stamp-preview.mjs", dir, SHA).out, /already stamped/);
  const odd = copy(t, (s, name) => (name === "sw.js" ? s.replace(/lopda-v[^"]+"/, 'lopda-v9.9.9"') : s));
  assert.match(tool("stamp-preview.mjs", odd, SHA).out, /differ/);
});
