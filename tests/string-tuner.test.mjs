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
  const COUNT = { guitar: 6, bass: [4, 5], uke: 4, violin: 4, viola: 4, cello: 4, mandolin: 4, banjo: 5, erhu: 2, pipa: 4, chrom: 0 };
  for (const t of Tuner.TUNINGS) assert.ok([].concat(COUNT[t.group]).includes(t.notes.length), t.id);
  assert.deepEqual(Tuner.GROUPS, Object.keys(COUNT), "every instrument is in the list, in order");
  assert.equal(Tuner.inGroup("violin").length, 1);
  assert.equal(Tuner.name(39, true).n, "Eb", "the half-step-down tuning names flats");
  assert.equal(Tuner.name(67).n + Tuner.name(67).o, "G4", "the ukulele's high G");
  assert.deepEqual(Tuner.byId("bass-std").notes.map((m) => { const n = Tuner.name(m); return n.n + n.o; }), ["E1", "A1", "D2", "G2"]);
  assert.deepEqual(Tuner.byId("cello").notes.map((m) => { const n = Tuner.name(m); return n.n + n.o; }), ["C2", "G2", "D3", "A3"]);
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

test("string-tuner: a bass's low E, read at its second harmonic (82 Hz, over the mic's 50 Hz floor), is the E1 string", () => {
  const bass = Tuner.byId("bass-std");
  const r = Tuner.read(82.41, bass, 440, -1, -1);
  assert.equal(r.i, 0);
  assert.ok(Math.abs(r.cents) < 1, String(r.cents));
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

test("string-tuner: the start screen's art is the largest whole-pixel copy that fits above the prompt", () => {
  const PROMPT = 48;          // the prompt's measured height: its 44 px plus the 2 px border
  const STAGES = [[331, 359, 1], [331, 473, 2], [346, 518, 2], [386, 738, 2]];
  for (const [w, h, k] of STAGES) {
    assert.equal(Tuner.artScale(w, h, PROMPT), k, `${w}x${h}`);
    const size = 160 * k;
    assert.ok(size <= w - 8 && size <= h - 12 - PROMPT - 12, "fits the stage with air around it");
    assert.ok(160 * (k + 1) > w - 8 || 160 * (k + 1) > h - 12 - PROMPT - 12, "and is the largest: one step more would not");
  }
  /* a desktop window is allowed its larger copy; a zero-sized stage still gives one pixel's worth */
  assert.ok(Tuner.artScale(1200, 900, PROMPT) >= 5);
  assert.equal(Tuner.artScale(120, 120, PROMPT), 1);
});

test("string-tuner: the meter fills its band, 40-220 rows, and nothing overflows a 331 x 359 stage", () => {
  /* the wrap's css width/height and the picture rows the app reaches on the three stages of sdk/UI.md 1: 331 x 473,
     346 x 518 and 386 x 738 (the app has no chin pad, so 331 x 473 is its smallest stage there) */
  const BANDS = [[307, 161, 82], [322, 206, 101], [362, 390, 173]];
  for (const [w, h, rows] of BANDS) {
    assert.equal(Tuner.meterRows(w, h), rows, `${w}x${h}`);
    const px = Tuner.meterHeight(rows, w);
    assert.ok(px > h - 2 && px < h + 2, `the picture fills the band: ${px} of ${h}`);
  }
  assert.equal(Tuner.meterRows(160, 4000), 220, "and is capped on a very tall box");
  assert.equal(Tuner.meterRows(3000, 100), 40, "and has a floor on a very wide one");

  /* 331 x 359, the short layout: header 48, main's padding 14, reading 52, message 30, strings 44, three 8 px gaps,
     footer 50 — the meter takes what is left */
  const fixed = 48 + 14 + 52 + 30 + 44 + 24 + 50;
  const wrap = 359 - fixed;
  assert.ok(wrap >= 90, String(wrap));
  assert.equal(Tuner.meterRows(315, wrap), 47, "the short stage's own band");
  assert.ok(Tuner.meterHeight(Tuner.meterRows(315, wrap), 315) <= wrap + 1, "the meter fits the leftover band");
  assert.ok(fixed + wrap <= 359, "and the screen adds up to the stage with nothing cut off");
});

