import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const S = runScript("runtime/score-pages.js").LopdaScorePages;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("score model listing keeps image-input models, trims fields and sorts by prompt price", () => {
  const list = plain(S.models({ data: [
    { id: "text/only", name: "Text", architecture: { input_modalities: ["text"] }, pricing: { prompt: "0.000001", completion: "0.000002" }, extra: true },
    { id: "vision/second", name: "Second", architecture: { input_modalities: ["text", "image"] }, pricing: { prompt: "0.0000003", completion: "0.0000008" }, extra: true },
    { id: "vision/first", name: "First", architecture: { input_modalities: ["image"] }, pricing: { prompt: "0.0000001", completion: "0.0000004" } },
  ] }));
  assert.deepEqual(list, [
    { id: "vision/first", name: "First", in: 0.1, out: 0.4 },
    { id: "vision/second", name: "Second", in: 0.3, out: 0.8 },
  ]);
});

test("score model cache sanitation stores only the trimmed fields", () => {
  assert.deepEqual(plain(S.cleanModels([
    { id: "b", name: "Bee", in: 2, out: 3, architecture: { input_modalities: ["image"] }, junk: true },
    { id: "a", name: "Ay", in: 1, out: null, junk: true },
    { name: "missing id", in: 0, out: 0 },
  ])), [
    { id: "a", name: "Ay", in: 1, out: null },
    { id: "b", name: "Bee", in: 2, out: 3 },
  ]);
});

test("score model prices format as per-million input and output prices", () => {
  assert.equal(S.DEFAULT_MODEL, "openai/gpt-6.2-sol");
  assert.equal(S.formatPrice(0.2), "$0.20");
  assert.equal(S.formatPrice(0.001), "$0.001");
  assert.equal(S.formatPrice(0), "$0");
  assert.equal(S.formatPrice(0.00001), "<$0.0001");
  assert.equal(S.formatPrice(null), "—");
  assert.equal(S.formatModelPrice({ in: 0.2, out: 0.4 }), "$0.20 / $0.40");
});
