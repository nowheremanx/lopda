// runtime/studio-styles.js: the style cards, original grooves and bass rhythms, and the seeded roll (studio.md 12.19.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { runScript, read } from "./helpers.mjs";

const ctx = runScript("runtime/studio-song.js");
vm.runInContext(read("runtime/studio-styles.js"), ctx, { filename: "runtime/studio-styles.js" });
const S = ctx.LopdaSong, ST = ctx.LopdaStudioStyles;
const plain = (v) => JSON.parse(JSON.stringify(v));
const SCALES = ["major", "minor", "dorian"];
const KITS = ["soft", "chip"];
const MOVES = ["root", "fifth", "octave", "approach"];
const SECTIONS = ["intro", "verse", "pre", "chorus", "bridge", "outro"];

test("CARDS: about sixteen cards with short original names and every palette id real", () => {
  assert.ok(Array.isArray(ST.CARDS));
  assert.ok(ST.CARDS.length >= 14 && ST.CARDS.length <= 18, "about 16 cards");
  const seen = new Set();
  for (const c of ST.CARDS) {
    assert.match(c.id, /^[a-z][a-z0-9-]{0,15}$/, c.id);
    assert.ok(!seen.has(c.id), `${c.id} is unique`);
    seen.add(c.id);
    assert.equal(typeof c.zh, "string");
    assert.equal(typeof c.en, "string");
    assert.ok(Array.from(c.zh).length >= 1 && Array.from(c.zh).length <= 12, `${c.id}: zh is short`);
    assert.ok(c.en.length >= 1 && c.en.length <= 12, `${c.id}: en is short`);
    assert.ok(Array.isArray(c.bpm) && c.bpm.length === 2, `${c.id}: bpm range`);
    assert.ok(Number.isInteger(c.bpm[0]) && Number.isInteger(c.bpm[1]), `${c.id}: bpm integers`);
    assert.ok(c.bpm[0] <= c.bpm[1] && c.bpm[0] >= 60 && c.bpm[1] <= 140, `${c.id}: bpm inside 60-140`);
    assert.ok(Array.isArray(c.scales) && c.scales.length > 0, `${c.id}: scales`);
    for (const s of c.scales) assert.ok(SCALES.includes(s), `${c.id}: ${s}`);
    assert.ok(Array.isArray(c.swing) && c.swing.length === 2, `${c.id}: swing range`);
    assert.ok(c.swing[0] <= c.swing[1] && c.swing[0] >= 0.5 && c.swing[1] <= 0.75, `${c.id}: swing inside 0.5-0.75`);
    assert.ok(Number.isInteger(c.tape[0]) && Number.isInteger(c.tape[1]), `${c.id}: tape integers`);
    assert.ok(c.tape[0] <= c.tape[1] && c.tape[0] >= 0 && c.tape[1] <= 4, `${c.id}: tape inside 0-4`);
    assert.ok(KITS.includes(c.kit), `${c.id}: kit`);
    assert.ok(Array.isArray(c.grooves) && c.grooves.length >= 1, `${c.id}: grooves`);
    for (const g of c.grooves) assert.ok(ST.GROOVES[g], `${c.id}: groove ${g} exists`);
    assert.ok(Array.isArray(c.bass) && c.bass.length >= 1, `${c.id}: bass`);
    for (const b of c.bass) assert.ok(ST.BASS[b], `${c.id}: bass ${b} exists`);
    assert.ok(ST.FORMS[c.form], `${c.id}: form ${c.form} exists`);
  }
});

test("GROOVES: about twelve original 16-step drum patterns with ghosts and accents", () => {
  const ids = Object.keys(ST.GROOVES);
  assert.ok(ids.length >= 10 && ids.length <= 14, "about 12 grooves");
  for (const id of ids) {
    const g = ST.GROOVES[id];
    assert.match(id, /^[a-z][a-z0-9-]{0,15}$/, id);
    assert.ok(g && g.steps, `${id}: steps`);
    let ghost = false, accent = false;
    for (const drum of ["kick", "snare", "hat", "perc"]) {
      assert.ok(Array.isArray(g.steps[drum]), `${id}: ${drum} row`);
      for (const hit of g.steps[drum]) {
        assert.ok(Array.isArray(hit) && hit.length === 2, `${id}: ${drum} hit shape`);
        assert.ok(Number.isInteger(hit[0]) && hit[0] >= 0 && hit[0] < 16, `${id}: ${drum} step`);
        assert.ok(typeof hit[1] === "number" && hit[1] > 0 && hit[1] <= 1, `${id}: ${drum} velocity`);
        if (hit[1] <= 0.25) ghost = true;
        if (hit[1] >= 0.8) accent = true;
      }
    }
    assert.ok(ghost, `${id}: has a ghost`);
    assert.ok(accent, `${id}: has an accent`);
  }
});

test("BASS: the seven named rhythms, each a one-bar list of [step, vel, move]", () => {
  for (const id of ["whole", "half", "pulse", "eighths", "octaves", "walk", "syncopated"]) {
    assert.ok(Array.isArray(ST.BASS[id]) && ST.BASS[id].length > 0, `${id} exists`);
  }
  for (const id of Object.keys(ST.BASS)) {
    for (const note of ST.BASS[id]) {
      assert.ok(Array.isArray(note) && note.length === 3, `${id}: note shape`);
      assert.ok(Number.isInteger(note[0]) && note[0] >= 0 && note[0] < 16, `${id}: step`);
      assert.ok(typeof note[1] === "number" && note[1] > 0 && note[1] <= 1, `${id}: velocity`);
      assert.ok(MOVES.includes(note[2]), `${id}: move ${note[2]}`);
    }
  }
});

test("FORMS: every form is a short order of section names", () => {
  for (const id of Object.keys(ST.FORMS)) {
    const f = ST.FORMS[id];
    assert.ok(Array.isArray(f.order) && f.order.length > 0, `${id}: order`);
    for (const s of f.order) assert.ok(SECTIONS.includes(s), `${id}: ${s}`);
  }
});

test("roll: reproducible with the same seed; every field stays in its card", () => {
  const a = ST.roll(ST.seeded(7)), b = ST.roll(ST.seeded(7));
  assert.deepEqual(plain(a), plain(b));
  assert.ok(a.card);
  assert.ok(Number.isInteger(a.key) && a.key >= 0 && a.key <= 11);
  assert.ok(a.card.scales.includes(a.scale));
  assert.ok(Number.isInteger(a.bpm) && a.bpm % 2 === 0, "bpm is even");
  assert.ok(a.bpm >= a.card.bpm[0] && a.bpm <= a.card.bpm[1], "bpm inside the card");
  assert.ok(a.swing >= a.card.swing[0] && a.swing <= a.card.swing[1], "swing inside the card");
  assert.equal(a.swing, Math.round(a.swing * 100) / 100, "swing has two decimals");
  assert.ok(Number.isInteger(a.tape) && a.tape >= a.card.tape[0] && a.tape <= a.card.tape[1]);
  assert.equal(a.kit, a.card.kit);
  assert.equal(a.grooves.length, 2);
  assert.notEqual(a.grooves[0], a.grooves[1], "two different grooves");
  for (const g of a.grooves) assert.ok(a.card.grooves.includes(g) && ST.GROOVES[g]);
  assert.equal(a.bass.length, 2);
  assert.notEqual(a.bass[0], a.bass[1], "two different bass rhythms");
  for (const id of a.bass) assert.ok(a.card.bass.includes(id) && ST.BASS[id]);
  assert.equal(a.form, a.card.form);
});

test("roll: the key covers all twelve keys in 200 rolls", () => {
  const rand = ST.seeded(20261030), keys = new Set();
  for (let i = 0; i < 200; i++) keys.add(ST.roll(rand).key);
  assert.equal(keys.size, 12, "all twelve keys appear");
});

test("roll: never calls Math.random itself", () => {
  const r = vm.runInContext(
    "(function(){var o=Math.random;Math.random=function(){throw new Error('Math.random was called')};" +
    "try{return LopdaStudioStyles.roll(LopdaStudioStyles.seeded(99));}finally{Math.random=o;}})()",
    ctx
  );
  const out = plain(r);
  assert.ok(out.card && out.grooves.length === 2);
});

test("seeded: the same n gives the same stream and values stay in [0,1)", () => {
  const a = ST.seeded(5), b = ST.seeded(5);
  for (let i = 0; i < 20; i++) {
    const x = a(), y = b();
    assert.equal(x, y);
    assert.ok(x >= 0 && x < 1);
  }
});
