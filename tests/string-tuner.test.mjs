// registry/apps/string-tuner: the tuner's maths (its <script id="logic">, kept free of the DOM), run in Node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";

const html = readFileSync(join(ROOT, "registry/apps/string-tuner/index.html"), "utf8");
const src = /<script id="logic">([\s\S]*?)<\/script>/.exec(html)[1];
const Tuner = new Function(src + "\nreturn Tuner;")();
const std = Tuner.byId("gtr-std");
const hzs = (t, a4 = 440) => t.notes.map((n) => Tuner.hz(n, a4));

test("string-tuner: standard tuning is E2 A2 D3 G3 B3 E4 at the usual frequencies, every tuning has unique ids", () => {
  assert.deepEqual(hzs(std).map((f) => Math.round(f * 100) / 100), [82.41, 110, 146.83, 196, 246.94, 329.63]);
  assert.deepEqual(std.notes.map((m) => { const n = Tuner.name(m); return n.n + n.o; }), ["E2", "A2", "D3", "G3", "B3", "E4"]);
  const ids = Tuner.TUNINGS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of Tuner.TUNINGS) assert.ok(t.group === "chrom" ? t.notes.length === 0 : t.notes.length === (t.group === "guitar" ? 6 : 4), t.id);
  assert.equal(Tuner.name(39, true).n, "Eb", "the half-step-down tuning names flats");
  assert.equal(Tuner.name(67).n + Tuner.name(67).o, "G4", "the ukulele's high G");
});

test("string-tuner: auto picks the nearest string, folds an octave-high low E, and holds the current string near a boundary", () => {
  const t = hzs(std);
  assert.equal(Tuner.pick(110.5, t, -1), 1);
  assert.equal(Tuner.pick(82.41 * 2, t, -1), 0, "E3 (the low E's second harmonic) reads as the low E string");
  assert.equal(Tuner.pick(330, t, -1), 5);
  /* the ukulele's G4 and A4 are a whole tone apart: just past halfway the shown string stays, further on it changes */
  const uke = hzs(Tuner.byId("uke-std"));
  assert.equal(Tuner.pick(392 * Math.pow(2, 105 / 1200), uke, 0), 0);
  assert.equal(Tuner.pick(392 * Math.pow(2, 105 / 1200), uke, -1), 3, "with nothing shown, the nearest");
  assert.equal(Tuner.pick(392 * Math.pow(2, 135 / 1200), uke, 0), 3, "a clearly closer string takes over");
  const r = Tuner.read(Tuner.hz(40, 440) * 2 * Math.pow(2, 5 / 1200), std, 440, -1, -1);
  assert.equal(r.i, 0);
  assert.ok(Math.abs(r.cents - 5) < 0.01, "cents are measured after the octave fold: " + r.cents);
});

test("string-tuner: a locked string reads only that string, A4 moves every target, chromatic names the nearest note", () => {
  const r = Tuner.read(220.5, std, 440, -1, 1);
  assert.equal(r.i, 1);
  assert.ok(Math.abs(r.cents - Tuner.cents(110.25, 110)) < 1e-9, "220.5 Hz folds an octave down against A2");
  assert.equal(Tuner.read(330, std, 440, -1, 1).i, 1, "locked: even a reading near another string");
  assert.ok(Math.abs(Tuner.read(442, std, 442, -1, 5).target - Tuner.hz(64, 442)) < 1e-9);
  const c = Tuner.read(445, Tuner.byId("chromatic"), 440, -1, -1);
  assert.equal(c.midi, 69);
  assert.ok(c.cents > 19 && c.cents < 20);
});

test("string-tuner: the smoother waits for two readings, drops a lone glitch, and follows a new note after two", () => {
  const s = Tuner.smoother();
  assert.equal(s.push(110), null);
  assert.equal(s.push(110.2), 110.2);
  assert.equal(s.push(150), 110.2, "one reading far off is held back");
  assert.equal(s.push(110.1), 110.1, "and dropped when the next is back on the note");
  assert.equal(s.push(147), 110.1);
  assert.equal(s.push(146.8), 147, "two that agree are the new note");
  s.reset();
  assert.equal(s.push(82.4), null);
  for (const f of [82.5, 82.3, 82.6, 82.2]) s.push(f);
  assert.equal(s.push(82.4), 82.4, "the median of the last three");
});
