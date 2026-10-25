// runtime/qr.js: the module matrix for the share page, from the vendored encoder.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read, runScript } from "./helpers.mjs";

/* the vendor script and ours share one context: qr.js reads the global qrcode() */
const ctx = runScript("runtime/vendor/qrcode-generator/qrcode.js", { Uint8Array });
vm.runInContext(read("runtime/qr.js"), ctx, { filename: "runtime/qr.js" });
const Q = ctx.LopdaQR;
const URL = "https://nowheremanx.github.io/lopda/";

const isDark = (m, row, col) => m.dark[row * m.n + col] === 1;
const finder = (m, top, left) => {
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    const ring = r === 0 || r === 6 || c === 0 || c === 6;
    const centre = r >= 2 && r <= 4 && c >= 2 && c <= 4;
    assert.equal(isDark(m, top + r, left + c), ring || centre ? true : false, `finder ${top},${left} at ${r},${c}`);
  }
};

test("the public URL is version 3: n = 17 + 4 * version, at least 21", () => {
  const m = Q.matrix(URL);
  assert.equal((m.n - 17) % 4, 0);
  assert.ok(m.n >= 21);
  assert.equal(m.n, 17 + 4 * ((m.n - 17) / 4));
  assert.equal(m.dark.length, m.n * m.n);
});

test("the three finder patterns are seven-module rings with a three-module centre", () => {
  const m = Q.matrix(URL);
  finder(m, 0, 0);
  finder(m, 0, m.n - 7);
  finder(m, m.n - 7, 0);
});

test("the timing row alternates between the finders", () => {
  const m = Q.matrix(URL);
  for (let c = 8; c <= m.n - 9; c++) assert.equal(isDark(m, 6, c), c % 2 === 0, "timing column " + c);
});

test("UTF-8 text encodes without throwing (the vendor's UTF-8 byte table is in use)", () => {
  const m = Q.matrix("中文 Lo-PDA");
  assert.ok(m.n >= 21);
  assert.equal(m.dark.length, m.n * m.n);
  const again = Q.matrix("中文 Lo-PDA");
  assert.equal(again.n, m.n);
  assert.deepEqual(Array.from(again.dark), Array.from(m.dark));
});

test("text over 500 bytes throws, as documented", () => {
  assert.throws(() => Q.matrix("中".repeat(200)), /500/);
});

test("the matrix is deterministic", () => {
  const a = Q.matrix(URL), b = Q.matrix(URL), c = Q.matrix(URL);
  assert.equal(a.n, b.n);
  assert.deepEqual(Array.from(a.dark), Array.from(b.dark));
  assert.deepEqual(Array.from(a.dark), Array.from(c.dark));
});
