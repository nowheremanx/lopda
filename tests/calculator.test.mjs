// The calculator's arithmetic (its <script id="logic">, kept free of the DOM), run in Node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";

const html = readFileSync(join(ROOT, "registry/apps/calculator/index.html"), "utf8");
const src = /<script id="logic">([\s\S]*?)<\/script>/.exec(html)[1];
const Calc = new Function(src + "\nreturn Calc;")();

function run(keys) {
  const s = Calc.create();
  for (const k of keys) Calc.press(s, k);
  const v = Calc.view(s);
  return (v.neg ? "-" : "") + v.text + (v.err ? " E" : "");
}
const keys = (str) => str.split(" ");

test("calculator: a third times three is whole again, as on a business calculator", () => {
  assert.equal(run(keys("1 / 3 * 3 =")), "1");
  assert.equal(run(keys("1 0 0 / 3 * 3 =")), "100");
  assert.equal(run(keys("2 / 3 * 3 =")), "2");
  assert.equal(run(keys("1 / 3 =")), "0.3333333", "the display still rounds to eight digits");
  assert.equal(run(keys("2 / 3 =")), "0.6666667");
});

test("calculator: the everyday paths still give the same answers", () => {
  assert.equal(run(keys("7 * 8 =")), "56");
  assert.equal(run(keys("2 + 3 * 4 =")), "20", "chain math, left to right");
  assert.equal(run(keys("1 2 2 + 1 1 %")), "135.42");
  assert.equal(run(keys("2 0 0 + 1 0 %")), "220");
  assert.equal(run(keys(". 1 + . 2 =")), "0.3");
  assert.equal(run(keys(". 1 + . 2 - . 3 =")), "0", "no double noise left over");
  assert.equal(run(keys("5 + 2 = = =")), "11", "= repeats the last step");
  assert.equal(run(keys("1 / 0 =")), "0 E");
  assert.equal(run(keys("9 9 9 9 9 9 9 9 + 1 =")), "0 E", "nine digits overflow");
});

test("calculator: memory keeps the full value, like the result register", () => {
  assert.equal(run(keys("1 / 3 = M+ C 3 * MR =")), "1");
});

test("calculator: ± on a result keeps the full value too, and typing over a recalled number starts afresh", () => {
  assert.equal(run(keys("1 / 3 = n * 3 =")), "-1");
  assert.equal(run(keys("1 / 3 = M+ C MR 5 + 1 =")), "6");
  assert.equal(run(keys("1 / 3 = M+ C MR < ")), "0.3333333", "backspace does nothing on a recalled number");
});
