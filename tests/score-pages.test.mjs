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

test("score page pixels convert between grayscale RGBA and luma", () => {
  const rgba = S.grayRgba(new Uint8Array([0, 128, 255]));
  assert.deepEqual([...rgba], [0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255]);
  assert.deepEqual([...S.rgbaLuma(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]))], [0, 255]);
});

test("score page scaling keeps its aspect and long side limit", () => {
  assert.deepEqual({ ...S.scaleSize(3200, 1600, 1600) }, { w: 1600, h: 800 });
  const scaled = S.scaleLuma(new Uint8Array([0, 40, 80, 120, 160, 200]), 3, 2, 2);
  assert.deepEqual({ w: scaled.w, h: scaled.h, gray: [...scaled.gray] }, { w: 2, h: 1, gray: [60, 120] });
  const paper = new Uint8Array(64).fill(255);
  for (let y = 0; y < 8; y++) paper[y * 8 + 2] = 0;
  assert.deepEqual([...S.scaleLuma(paper, 8, 8, 2).gray], [191, 255, 191, 255], "a one-pixel line still shows after scaling down");
  assert.deepEqual({ ...S.scaleSize(3, 2, 1600) }, { w: 3, h: 2 });
});

test("score page order moves without mutation and caps the tray at six", () => {
  const pages = Array.from({ length: 6 }, (_, id) => ({ id }));
  const moved = S.movePage(pages, 1, -1);
  assert.deepEqual(moved.map((page) => page.id), [1, 0, 2, 3, 4, 5]);
  assert.deepEqual(pages.map((page) => page.id), [0, 1, 2, 3, 4, 5]);
  assert.equal(S.moveIndex(1, -1, 6), 0);
  assert.equal(S.moveIndex(5, 1, 6), 5);
  assert.equal(S.appendPage(pages, { id: 6 }), null);
  assert.equal(S.appendPage(pages.slice(0, 5), { id: 5 }).length, 6);
  assert.equal(S.MAX_PAGES, 6);
});
