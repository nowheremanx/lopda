// registry/apps/chord-book: the chord maths with no DOM and no PAD (docs/design/chord-book.md section 9).
// The golden list is the shape a guitarist expects first for the most played chords; every other check is a rule
// the voicings must keep (the notes are the chord's, the lowest is the bass, the hand can reach it).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read } from "./helpers.mjs";

const ctx = vm.createContext({ console });
vm.runInContext(read("registry/apps/chord-book/src/chords.js"), ctx, { filename: "chords.js" });
vm.runInContext(read("registry/apps/chord-book/src/draw.js"), ctx, { filename: "draw.js" });
vm.runInContext(read("registry/apps/chord-book/src/progs.js"), ctx, { filename: "progs.js" });
vm.runInContext(read("registry/apps/chord-book/src/scales.js"), ctx, { filename: "scales.js" });
const C = ctx.Chords;
const P = ctx.Progs;
const D = ctx.Draw;
const S = ctx.Scales;
const mod = (n) => ((n % 12) + 12) % 12;
const pcs = (frets) => C.midiOf(frets).map(mod);
const bassOf = (frets) => mod(Math.min(...C.midiOf(frets)));
const every = () => {
  const out = [];
  for (let root = 0; root < 12; root++) for (const q of C.QUALS) out.push({ root, q: q.id, bass: null });
  return out;
};

/* the voicing's notes are the chord's (plus its bass), every required tone is there, and the lowest note is the bass */
function fits(c, frets) {
  const Q = C.qual(c.q), bass = c.bass === null ? c.root : c.bass;
  const allowed = new Set(Q.iv.map((i) => mod(c.root + i)).concat([bass]));
  const have = new Set(pcs(frets));
  for (const pc of have) if (!allowed.has(pc)) return `has ${C.NAMES[pc]}, not in the chord`;
  for (const i of Q.iv) if (!Q.opt.includes(i) && !have.has(mod(c.root + i))) return `lacks ${C.NAMES[mod(c.root + i)]}`;
  if (!have.has(bass)) return "lacks the bass";
  if (bassOf(frets) !== bass) return `lowest note is ${C.NAMES[bassOf(frets)]}, not ${C.NAMES[bass]}`;
  return null;
}

test("every hand-written shape holds its chord's notes, with the right bass, at all twelve roots", () => {
  let n = 0;
  for (const [name, frets] of C.OPENS) {
    const c = C.parse(name);
    assert.ok(c, `${name} parses`);
    assert.equal(fits(c, C.fr(frets)), null, `${name} ${frets}`);
    n++;
  }
  const shapes = C.shapes();
  for (const key of Object.keys(shapes)) {
    const [root, q, bass] = key.split(":");
    const c = { root: +root, q, bass: bass === "" ? null : +bass };
    for (const s of shapes[key]) {
      assert.equal(fits(c, s.frets), null, `${C.name(c)} ${C.fretText(s.frets)}`);
      assert.ok(s.frets.every((f) => f <= C.MAX_FRET), `${C.name(c)} ${C.fretText(s.frets)} stays within ${C.MAX_FRET} frets`);
      assert.equal(s.fingers.length, 6);
      s.frets.forEach((f, i) => { if (f <= 0) assert.equal(s.fingers[i], 0, `${C.name(c)} ${C.fretText(s.frets)}: no finger on string ${i}`); });
      n++;
    }
  }
  assert.ok(n > 300, `${n} shapes checked`);
});

test("golden list: the shape a guitarist expects comes first under Common", () => {
  const golden = {
    C: "x32010", D: "xx0232", E: "022100", F: "133211", G: ["320003", "320033"], A: "x02220", B: "x24442", Bb: "x13331",
    Am: "x02210", Bm: "x24432", Cm: "x35543", Dm: "xx0231", Em: "022000", Fm: "133111", Gm: "355333",
    C7: "x32310", D7: "xx0212", E7: "020100", G7: "320001", A7: "x02020", B7: "x21202",
    Am7: "x02010", Dm7: "xx0211", Em7: ["022030", "020000"],
    Cmaj7: "x32000", Dmaj7: "xx0222", Fmaj7: "xx3210", Gmaj7: "320002", Amaj7: "x02120",
    Asus2: "x02200", Asus4: "x02230", Dsus2: "xx0230", Dsus4: "xx0233", Esus4: "022200", Cadd9: "x32030",
    Cmaj9: "x3243x", C13: "x30355", "E7#9": "076780", "C6/9": "x32233", Cm11: "x31311", Cadd11: "x32011",
    "E7b9": "07676x", C7b5: "x34310", "C7#5": "x36350",
    "Cmaj7#11": "x34000", Cm13: "x30345", C9sus4: "x3333x", Cmadd9: "x3103x",
    "D/F#": "2x0232", "G/B": "x20003", "C/G": "332010"
  };
  for (const [name, want] of Object.entries(golden)) {
    const first = C.fretText(C.voicings(C.parse(name))[0].frets);
    assert.ok([].concat(want).includes(first), `${name}: ${first}, want ${want}`);
  }
});

test("barres: a hand-written shape draws a barre only where its own fingers bar the strings", () => {
  const shapes = C.shapes();
  let barred = 0, checked = 0;
  for (const key of Object.keys(shapes)) {
    const [root, q, bass] = key.split(":");
    const c = { root: +root, q, bass: bass === "" ? null : +bass };
    const byFret = new Map(C.voicings(c).map((v) => [v.frets.join(","), v]));
    for (const s of shapes[key]) {
      const v = byFret.get(s.frets.join(","));
      assert.ok(v, `${C.name(c)} ${C.fretText(s.frets)} is a voicing`);
      checked++;
      if (!v.barre) continue;
      barred++;
      for (let i = v.barre.from; i <= v.barre.to; i++) {
        if (v.frets[i] === v.barre.fret) assert.equal(v.fingers[i], v.barre.finger, `${C.name(c)} ${C.fretText(v.frets)}: string ${i} under the barre is finger ${v.barre.finger}`);
        else assert.ok(v.frets[i] > v.barre.fret, `${C.name(c)} ${C.fretText(v.frets)}: string ${i} inside the barre`);
      }
    }
  }
  assert.ok(checked > 400 && barred > 150, `${checked} hand-written voicings, ${barred} with a barre`);
});

test("barres: shapes played with separate fingers draw none; the E shape still bars across all six strings", () => {
  const first = (name) => C.voicings(C.parse(name))[0];
  for (const name of ["D", "A", "Em", "Asus2", "Asus4", "Em7", "Emaj7", "Ammaj7", "E5", "A5", "Esus4", "D/A"])
    assert.equal(first(name).barre, null, `${name} ${C.fretText(first(name).frets)}: no barre`);
  const f = first("F");
  assert.equal(C.fretText(f.frets), "133211");
  assert.deepEqual({ ...f.barre }, { fret: 1, from: 0, to: 5, finger: 1 });
});

test("barres: the canonical shapes keep their real barre", () => {
  const canon = {
    F: ["133211", { fret: 1, from: 0, to: 5, finger: 1 }],
    Bb: ["x13331", { fret: 1, from: 1, to: 5, finger: 1 }],
    Bm: ["x24432", { fret: 2, from: 1, to: 5, finger: 1 }],
    B: ["x24442", { fret: 2, from: 1, to: 5, finger: 1 }],
    "F#m": ["244222", { fret: 2, from: 0, to: 5, finger: 1 }],
    "C#m": ["x46654", { fret: 4, from: 1, to: 5, finger: 1 }],
    Dmaj7: ["xx0222", { fret: 2, from: 3, to: 5, finger: 1 }],
    A6: ["x02222", { fret: 2, from: 2, to: 5, finger: 1 }],
    "F/C": ["x33211", { fret: 1, from: 4, to: 5, finger: 1 }],
    Dm7: ["xx0211", { fret: 1, from: 4, to: 5, finger: 1 }]
  };
  for (const [name, [frets, want]] of Object.entries(canon)) {
    const v = C.voicings(C.parse(name)).find((x) => C.fretText(x.frets) === frets);
    assert.ok(v, `${name} ${frets} is a voicing`);
    assert.deepEqual({ ...v.barre }, want, `${name} ${frets}`);
  }
});

test("barres: C9 x32333 is barred by the ring finger across G-B-E, and the box draws it; D/A has none", () => {
  const c = C.parse("C9"), v = C.voicings(c).find((x) => C.fretText(x.frets) === "x32333");
  assert.ok(v, "C9 x32333 is a voicing");
  assert.deepEqual({ ...v.barre }, { fret: 3, from: 3, to: 5, finger: 3 }, "the ring finger lies across the top three strings");
  const b = D.box(v, c.root), x = 83, y = 58;
  assert.equal(b.px[y * b.w + x], 0, "ink between the B and high E strings at fret 3 is the barre");
  const d = C.voicings(C.parse("D/A"))[0];
  assert.equal(C.fretText(d.frets), "x00232");
  assert.equal(d.barre, null, "D/A x00232 uses separate fingers");
});

test("barres: a guessed finder shape is fingered by fingerCount, so x12222 has no barre", () => {
  const frets = C.fr("x12222"), fingers = C.assignFingers(frets);
  assert.equal(C.fingerCount(frets).barre, null, "six strings, five notes: no barre");
  /* assignFingers clamps at 4, leaving three strings on that guess; barreFromFingers would call it a barre, which is
     exactly why the finder's temporary voicing must ask fingerCount (1.4.4) */
  assert.ok(C.barreFromFingers(frets, fingers), "the clamped guess is not a barre");
});

test("every one of the 12 x 32 chords has at least 3 voicings, and every voicing keeps the rules", () => {
  for (const c of every()) {
    const list = C.voicings(c);
    assert.ok(list.length >= 3, `${C.name(c)} has ${list.length}`);
    assert.ok(list.length <= C.LIMIT);
    const ids = new Set();
    for (const v of list) {
      const t = C.fretText(v.frets);
      assert.ok(!ids.has(t), `${C.name(c)} ${t} listed once`);
      ids.add(t);
      assert.equal(fits(c, v.frets), null, `${C.name(c)} ${t}`);
      const fretted = v.frets.filter((f) => f > 0);
      if (v.tier === 0) {
        assert.ok(fretted.length === 0 || Math.max(...fretted) - Math.min(...fretted) <= 3, `${C.name(c)} ${t} spans 4 frets at most`);
        assert.ok(C.fingerCount(v.frets).n <= 4, `${C.name(c)} ${t} needs 4 fingers at most`);
      }
      assert.ok(v.pos >= 0 && v.pos <= C.MAX_FRET);
    }
    const pos = C.byPosition(list).map((v) => v.pos);
    assert.deepEqual(pos, pos.slice().sort((a, b) => a - b), `${C.name(c)}: Position order climbs the neck`);
  }
  for (const name of ["D/F#", "G/B", "C/E", "Am/G", "F/C", "E/G#", "Bb/D"]) assert.ok(C.voicings(C.parse(name)).length >= 3, name);
});

test("names: every chord's name reads back as the same chord; aliases and enharmonics work; nonsense is null", () => {
  for (const c of every()) assert.deepEqual({ ...C.parse(C.name(c)) }, c, C.name(c));
  const same = (a, b) => assert.deepEqual({ ...C.parse(a) }, { ...C.parse(b) }, `${a} = ${b}`);
  same("CM7", "Cmaj7"); same("CΔ7", "Cmaj7"); same("Cmin7", "Cm7"); same("C-7", "Cm7"); same("Cø", "Cm7b5"); same("Cm7-5", "Cm7b5");
  same("C°7", "Cdim7"); same("Co", "Cdim"); same("C+", "Caug"); same("Csus", "Csus4"); same("Cadd2", "Cadd9");
  same("CmM7", "Cmmaj7"); same("Cm(maj7)", "Cmmaj7"); same("C#m7b5", "Dbm7b5"); same("E♭m", "Ebm"); same("D#", "Eb");
  same("CMAJ7", "Cmaj7"); same("c", "C"); same(" G / B ", "G/B"); same("Fb", "E"); same("B#", "C"); same("C/C", "C");
  /* 1.4.7's six qualities and the names players write for them */
  same("CM9", "Cmaj9"); same("CΔ9", "Cmaj9"); same("Cma9", "Cmaj9"); same("Cmajor9", "Cmaj9");
  same("Cdom13", "C13"); same("C7(#9)", "C7#9"); same("C69", "C6/9"); same("C6add9", "C6/9"); same("CM6/9", "C6/9");
  same("Cmin11", "Cm11"); same("C-11", "Cm11"); same("Cadd4", "Cadd11"); same("C(add11)", "Cadd11");
  same("CmAdd9", "Cmadd9"); same("CmADD9", "Cmadd9"); same("Cm(ADD9)", "Cmadd9");
  assert.equal(C.parse("CM11"), null, "a major 11 is not this book's minor 11");
  assert.equal(C.parse("Cm6/9"), null, "a minor 6/9 is not this book's major 6/9");
  assert.equal(C.parse("cM11"), null, "the reject is not case sensitive either");
  assert.equal(C.name({ root: 9, q: "mmaj7", bass: null }), "Am(maj7)", "the minor-major is written as players write it");
  assert.deepEqual({ ...C.parse("Am(maj7)") }, { root: 9, q: "mmaj7", bass: null });
  for (const [name, q] of [["Cmaj9", "maj9"], ["C13", "13"], ["C7#9", "7#9"], ["C6/9", "6/9"], ["Cm11", "m11"], ["Cadd11", "add11"]]) {
    assert.equal(C.parse(name).q, q, `${name} reads as ${q}`);
    assert.equal(C.name(C.parse(name)), name, `${name} is written back the same way`);
  }
  /* 1.4.8's three altered dominants, and aug7 as another name for 7#5 (not a second quality) */
  for (const [name, q] of [["C7b9", "7b9"], ["C7b5", "7b5"], ["C7#5", "7#5"]]) {
    assert.equal(C.parse(name).q, q, `${name} reads as ${q}`);
    assert.equal(C.name(C.parse(name)), name, `${name} is written back the same way`);
  }
  for (const [a, b] of [["C7(b9)", "C7b9"], ["C7-9", "C7b9"], ["C7(b5)", "C7b5"], ["C7-5", "C7b5"],
    ["C7(#5)", "C7#5"], ["C7+5", "C7#5"], ["C7+", "C7#5"], ["Caug7", "C7#5"], ["C+7", "C7#5"]]) same(a, b);
  assert.equal(C.QUALS.filter((x) => x.id === "aug7").length, 0, "aug7 is an alias, not a quality of its own");
  assert.equal(C.QUALS.filter((x) => x.id === "7#5").length, 1);
  assert.equal(C.parse("Cm").q, "m");
  assert.equal(C.parse("CM").q, "");
  assert.equal(C.parse("Bb").root, 10);
  assert.equal(C.parse("Bbm").q, "m");
  assert.equal(C.parse("Bb5").q, "5");
  /* 1.4.9's four colours: names players write, and the canonical spelling back */
  for (const [name, q] of [["Cmaj7#11", "maj7#11"], ["Cm13", "m13"], ["C9sus4", "9sus4"], ["Cmadd9", "madd9"]]) {
    assert.equal(C.parse(name).q, q, `${name} reads as ${q}`);
    assert.equal(C.name(C.parse(name)), name, `${name} is written back the same way`);
  }
  for (const [a, b] of [["CM7#11", "Cmaj7#11"], ["CΔ7#11", "Cmaj7#11"], ["Cma7#11", "Cmaj7#11"], ["Cmaj7(#11)", "Cmaj7#11"],
    ["Cmin13", "Cm13"], ["C-13", "Cm13"], ["C9sus", "C9sus4"], ["Cminadd9", "Cmadd9"], ["C-add9", "Cmadd9"], ["Cm(add9)", "Cmadd9"]]) same(a, b);
  for (const bad of ["", "H", "Cxyz", "C/H", "CM11", "CM13", "CMadd9", "CM(add9)", "Cm6/9", "Cmaj13", "Cmaj13#11", "Cm7#11", "C13sus4", "12", null, 7]) assert.equal(C.parse(bad), null, String(bad));
  assert.equal(C.parse("CM7#11").q, "maj7#11", "the uppercase M still spells the major 7 #11");
  assert.equal(C.parse("Cm7#11"), null, "a minor 7 #11 is not this book's major 7 #11");
});

test("the picker's labels: the fixed names with the common enharmonic beside them (1.4.5)", () => {
  assert.deepEqual([...C.PICK_NAMES], ["C", "C#/Db", "D", "Eb/D#", "E", "F", "F#/Gb", "G", "Ab/G#", "A", "Bb/A#", "B"]);
  C.PICK_NAMES.forEach((n, pc) => {
    assert.ok(n.indexOf(C.NAMES[pc]) === 0, `${n} begins with the book's ${C.NAMES[pc]}`);
    assert.ok(n.length <= 5, `${n} fits a 44 px cell`);
    assert.deepEqual({ ...C.parse(n) }, { root: pc, q: "", bass: null }, `${n} reads back as pitch class ${pc}`);
  });
  /* every other name still uses the book's fixed set */
  assert.equal(C.name({ root: 1, q: "m", bass: null }), "C#m");
  assert.equal(C.name({ root: 3, q: "", bass: 1 }), "Eb/C#", "the fixed names, even for a bass written enharmonically");
});

test("the picker's six groups: the new qualities sit where the design says (1.4.7, 1.4.8, 1.4.9)", () => {
  assert.equal(C.GROUPS.length, 6);
  assert.deepEqual([...C.GROUPS.map((g) => g.zh)], ["三和弦", "七和弦", "挂留", "加音、六", "九、十一、十三", "变化属七"]);
  assert.deepEqual([...C.GROUPS.map((g) => g.en)], ["Triads", "Sevenths", "Suspended", "Added, sixths", "Ninths, elevenths, thirteenths", "Altered dominants"]);
  const group = (id) => C.qual(id).group;
  for (const id of ["6/9", "add11", "add9", "6", "m6", "madd9"]) assert.equal(group(id), 3, id);
  for (const id of ["9", "m9", "maj9", "13", "m11", "maj7#11", "m13"]) assert.equal(group(id), 4, id);
  for (const id of ["7#9", "7b9", "7b5", "7#5"]) assert.equal(group(id), 5, id);
  assert.equal(group("9sus4"), 2);
  assert.equal(C.QUALS.filter((q) => q.group === 5).length, 4, "7#9 plus the three altered dominants of 1.4.8");
  assert.equal(C.QUALS.filter((q) => q.group === 2).length, 4, "sus2, sus4, 7sus4 and 1.4.9's 9sus4");
  assert.equal(C.QUALS.filter((q) => q.group === 3).length, 6, "the added and sixth chords, with 1.4.9's madd9");
  assert.equal(C.QUALS.filter((q) => q.group === 4).length, 7, "the ninth, eleventh and thirteenth chords, with 1.4.9's two");
  assert.equal(C.QUALS.length, 32);
  C.QUALS.forEach((q) => assert.ok(q.group >= 0 && q.group < C.GROUPS.length, q.id));
});

/* ---------------- the qualities with no voicing (1.4.4, 1.4.7, 1.4.9) ---------------- */

test("exactly eighteen root / quality / bass combinations have no voicing: the old seventeen plus Cm13/B (1.4.9)", () => {
  const empty = [];
  for (let root = 0; root < 12; root++) for (const Q of C.QUALS) for (let bass = 0; bass < 12; bass++) {
    if (bass === root) continue;
    if (!C.voicings({ root, q: Q.id, bass }).length) empty.push(C.name({ root, q: Q.id, bass }));
  }
  const want = [
    "Ab9/B", "Ebm9/G", "Ebm9/Bb", "Ebm9/B", "Bbm9/D", "Bbm9/F", "Bbm9/F#", "Bbm9/B",
    "D7#9/Eb", "F7#9/C", "F7#9/C#", "F7#9/Bb", "A7#9/Bb", "Bb7#9/Eb", "Ab6/9/B", "Bbmaj9/C#",
    "C7b9/B",
    "Cm13/B"
  ];
  assert.equal(empty.length, 18);
  assert.deepEqual(empty.slice().sort(), want.slice().sort());
});

test("identify: each hand-written shape is named as itself first (an equivalent spelling counts)", () => {
  const set = (c) => {
    const Q = C.qual(c.q);
    const s = new Set(Q.iv.map((i) => mod(c.root + i)));
    if (c.bass !== null) s.add(c.bass);
    return [...s].sort((a, b) => a - b).join(",") + "/" + (c.bass === null ? c.root : c.bass);
  };
  for (const [name, frets] of C.OPENS) {
    const want = C.parse(name), got = C.identify(C.fr(frets));
    assert.ok(got.length, `${name} ${frets} is named`);
    assert.ok(C.name(got[0]) === name || set(got[0]) === set(want), `${name} ${frets}: ${got.map(C.name)}`);
  }
  assert.equal(C.name(C.identify(C.fr("x32010"))[0]), "C");
  assert.equal(C.name(C.identify(C.fr("x02010"))[0]), "Am7");
  assert.equal(C.name(C.identify(C.fr("2x0232"))[0]), "D/F#");
  /* the six shapes of 1.4.7, the three of 1.4.8 and the four of 1.4.9 name themselves first */
  for (const [name, frets] of [["Cmaj9", "x3243x"], ["C13", "x30355"], ["E7#9", "076780"], ["C6/9", "x32233"], ["Cm11", "x31311"], ["Cadd11", "x32011"],
    ["E7b9", "07676x"], ["C7b5", "x34310"], ["C7#5", "x36350"], ["Cmaj7#11", "x34000"], ["Cm13", "x30345"], ["C9sus4", "x3333x"], ["Cmadd9", "x3103x"]])
    assert.equal(C.name(C.identify(C.fr(frets))[0]), name, `${name} ${frets}`);
  assert.equal(C.identify(C.fr("xxxxx0")).length, 0, "one note is no chord");
  assert.equal(C.identify(C.fr("x01230")).length, 0, "a cluster is no chord of the 32");
  assert.equal(C.identify(C.fr("xxxxxx")).length, 0);
});

test("speed: every chord's voicings in well under a second", () => {
  const fresh = vm.createContext({ console });
  vm.runInContext(read("registry/apps/chord-book/src/chords.js"), fresh);
  const t0 = performance.now();
  for (let root = 0; root < 12; root++) for (const q of fresh.Chords.QUALS) fresh.Chords.voicings({ root, q: q.id, bass: null });
  const ms = performance.now() - t0;
  assert.ok(ms < 1000, `${Math.round(ms)} ms`);
});

test("pictures: the box and the neck use only the four tones; the nut, the fret number and a root square land where they should", () => {
  const c = C.parse("C"), v = C.voicings(c)[0];
  const b = D.box(v, c.root);
  assert.equal(b.w, D.BOX_W);
  assert.ok(b.px.every((t) => t >= 0 && t <= 3));
  const ink = (buf) => buf.px.filter((t) => t === 0).length;
  const bm = C.parse("Bm"), high = C.voicings(bm).find((x) => x.pos >= 6);
  assert.equal(D.baseFret(v.frets), 1);
  assert.equal(D.baseFret(high.frets), high.pos);
  assert.notEqual(ink(D.box(high, bm.root)), ink(b));
  const n = D.neck(v, C.tones(c), c.root);
  assert.equal(n.w, D.NECK_W);
  assert.ok(n.px.every((t) => t >= 0 && t <= 3));
  assert.ok(n.px.some((t) => t === 2) && n.px.some((t) => t === 1), "chord tones in mid and dark across the neck");
});

test("tones: each chord tone carries its interval above the root, in stacking order; a slash chord's extra bass carries none", () => {
  assert.deepEqual([...C.tones(C.parse("C9"))].map((x) => x.iv), [0, 4, 7, 10, 14], "the 9 is a ninth and comes last");
  assert.deepEqual([...C.tones(C.parse("Cadd9"))].map((x) => x.lab), ["R", "3", "5", "9"]);
  assert.deepEqual([...C.tones(C.parse("Csus2"))].map((x) => x.iv), [0, 2, 7], "a sus2's 2 stays a second");
  assert.deepEqual([...C.tones(C.parse("Am/G"))].map((x) => x.iv), [null, 0, 3, 7]);
  assert.deepEqual([...C.tones(C.parse("C/E"))].map((x) => x.iv), [0, 4, 7], "a bass that is a chord tone is not listed twice");
  /* 1.4.7: a 9, 11 or 13 is stacked an octave up, whichever quality it belongs to */
  const iv = (name) => [...C.tones(C.parse(name))].map((x) => x.iv);
  assert.deepEqual(iv("Cmaj9"), [0, 4, 7, 11, 14]);
  assert.deepEqual(iv("C13"), [0, 4, 7, 10, 14, 21], "the 13 is a thirteenth, above the 9");
  assert.deepEqual(iv("C7#9"), [0, 4, 7, 10, 15]);
  assert.deepEqual(iv("C6/9"), [0, 4, 7, 9, 14], "the 6 stays a sixth");
  assert.deepEqual(iv("Cm11"), [0, 3, 7, 10, 14, 17]);
  assert.deepEqual(iv("Cadd11"), [0, 4, 7, 17], "an add11 is an eleventh, not a fourth");
  /* 1.4.8: the altered b9 is a ninth, the altered fifth stays at 6 or 8 */
  assert.deepEqual(iv("C7b9"), [0, 4, 7, 10, 13], "the b9 of a dominant is a flat ninth at 13, above the b7");
  assert.deepEqual([...C.tones(C.parse("C7b9")).map((x) => x.pc)], [0, 4, 7, 10, 1]);
  assert.equal(C.tones(C.parse("C7b9")).find((x) => x.lab === "b9").iv, 13);
  assert.deepEqual(iv("C7b5"), [0, 4, 6, 10]);
  assert.deepEqual(iv("C7#5"), [0, 4, 8, 10]);
  /* 1.4.9: the #11 stacks to 18, the 13 to 21, and both new ninths are 14 */
  assert.deepEqual(iv("Cmaj7#11"), [0, 4, 7, 11, 18]);
  assert.deepEqual(iv("Cm13"), [0, 3, 7, 10, 14, 21], "the 13 is a thirteenth, above the 9");
  assert.deepEqual(iv("C9sus4"), [0, 5, 7, 10, 14]);
  assert.deepEqual(iv("Cmadd9"), [0, 3, 7, 14]);
  assert.equal(C.tones(C.parse("Cmaj7#11")).find((x) => x.lab === "#11").iv, 18);
  assert.equal(C.tones(C.parse("Cm13")).find((x) => x.lab === "13").iv, 21);
  assert.equal(C.tones(C.parse("C9sus4")).find((x) => x.lab === "9").iv, 14);
  assert.equal(C.tones(C.parse("Cmadd9")).find((x) => x.lab === "9").iv, 14);
});

test("strings: each string of a voicing names its pitch and its degree, low E first, a muted string null", () => {
  const show = (name, frets) => [...C.strings(C.fr(frets), C.parse(name))].map((x) => (x ? `${C.NAMES[x.pc]}${x.lab}@${x.midi}` : "x")).join(" ");
  assert.equal(show("C", "x32010"), "x CR@48 E3@52 G5@55 CR@60 E3@64", "an open C is five notes: R 3 5 R 3");
  assert.equal(show("G", "320003"), "GR@43 B3@47 D5@50 GR@55 B3@59 GR@67");
  assert.equal(show("Am/G", "3x2210"), "G/@43 x E5@52 AR@57 Cb3@60 E5@64", "the extra bass of a slash chord is marked as the bass");
  assert.equal(show("C/E", "032010"), "E3@40 CR@48 E3@52 G5@55 CR@60 E3@64", "a bass that is a chord tone keeps its degree");
});

test("degree map: every place in the box's frets is named by its degree, the chord's own tones as the chord writes them", () => {
  const deg = (name, note) => { const c = C.parse(name), d = C.degree(c, C.NAMES.indexOf(note)); return d.lab + (d.tone ? "" : "?"); };
  assert.equal(deg("C", "F"), "11?", "a note to add is named as an extension: 11, not 4");
  assert.equal(deg("Csus4", "F"), "4", "but a sus4's own fourth is a 4");
  assert.equal(deg("C6", "A"), "6");
  assert.equal(deg("C", "A"), "13?");
  assert.equal(deg("C7", "Bb"), "b7");
  assert.equal(deg("Cm", "Eb"), "b3");
  assert.equal(deg("C", "C#"), "b9?");
  /* the picture: four tones only; the open C's played notes sit in ink tiles, the hit test finds string and fret */
  const c = C.parse("C"), v = C.voicings(c)[0];
  assert.deepEqual([...v.frets], [-1, 3, 2, 0, 1, 0]);
  const m = D.map(v, c);
  assert.equal(m.w, D.BOX_W);
  assert.ok(m.px.every((t) => t >= 0 && t <= 3));
  assert.deepEqual({ ...D.boxAt(v, 34, 58) }, { s: 1, f: 3 }, "the A string at the third fret");
  assert.deepEqual({ ...D.boxAt(v, 90, 6) }, { s: 5, f: 0 }, "the open high E, above the nut");
  assert.equal(D.boxAt(v, 2, 50), null, "beside the strings is nothing");
  /* the neck: low E at the bottom (y 56), frets 9 px wide from x 12, the open strings left of the nut */
  assert.deepEqual({ ...D.neckAt(12 + 4 * 9 + 4, 56) }, { s: 0, f: 5 });
  assert.deepEqual({ ...D.neckAt(12 + 14 * 9 + 4, 6) }, { s: 5, f: 15 });
  assert.deepEqual({ ...D.neckAt(5, 36) }, { s: 2, f: 0 });
  assert.equal(D.neckAt(140 + 9, 30), null, "past the fifteenth fret");
  assert.equal(m.px[58 * m.w + 34 - 6], 0, "a played note's tile is ink");
  assert.equal(m.px[24 * m.w + 34 - 6], 3, "a note not played has a paper patch");
});

test("the x above a muted string is neither a note to play nor an open-row degree (1.4.3)", () => {
  const c = C.parse("C"), v = C.voicings(c)[0];
  assert.deepEqual([...v.frets], [-1, 3, 2, 0, 1, 0]);
  /* the box starts at the nut, so the open row is there: the x above the muted low E plays nothing, the o's still play */
  assert.equal(D.boxAt(v, 20, 6), null, "the x above the muted low E is not an open note");
  assert.deepEqual({ ...D.boxAt(v, 20 + 3 * 14, 6) }, { s: 3, f: 0 }, "the open G is");
  assert.deepEqual({ ...D.boxAt(v, 20 + 5 * 14, 6) }, { s: 5, f: 0 }, "the open high E is");
  assert.deepEqual({ ...D.boxAt(v, 34, 58) }, { s: 1, f: 3 }, "a fretted string is unaffected");
  /* the degree map: the muted low E's open row is an ink cross, with no degree tile or digit over it */
  const m = D.map(v, c);
  assert.equal(m.px[6 * m.w + 20], 0, "an ink cross at the open row");
  assert.equal(m.px[4 * m.w + 20 - 1], 3, "no digit: the tile and its label are not drawn");
  /* a fretted string keeps its open-row degree: the open high E (a possible position) still reads as 3 */
  assert.ok(m.px[6 * m.w + 20 + 5 * 14] !== 0, "the open high E's degree is not a cross");
});

/* ---------------- the progressions (和弦连接, 1.2.0) ---------------- */

test("progressions: every entry is whole, in both languages, and every chord in it is one the app knows", () => {
  const ids = new Set();
  for (const p of P.LIST) {
    assert.ok(!ids.has(p.id), `${p.id} once`); ids.add(p.id);
    assert.ok(p.key === "maj" || p.key === "min", `${p.id} key`);
    assert.ok(p.zh && p.en && p.why.zh && p.why.en, `${p.id} has both languages`);
    assert.equal(p.rn.length, p.ch.length, `${p.id}: one numeral per chord`);
    if (p.bassStep) assert.equal(p.bassStep.length, p.ch.length, `${p.id}: a bassStep per chord`);
    p.ch.forEach((slot, i) => {
      if (slot[2] !== undefined) assert.ok(p.bassStep && p.bassStep[i] != null, `${p.id}: the slash chord at ${i} has its bassStep`);
    });
    for (const [deg, q] of p.ch) {
      assert.ok(deg >= 0 && deg < 12, `${p.id} degree`);
      assert.ok(C.qual(q), `${p.id}: ${q} is a quality`);
    }
  }
});

test("progressions: every quality at every root belongs to at least one, and every chord in it has a shape", () => {
  for (const c of every()) {
    const r = P.forChord(c);
    assert.ok(r.length > 0, `${C.name(c)} has a progression`);
    for (const x of r) {
      assert.equal(x.names.length, x.chords.length);
      for (const ch of x.chords) assert.ok(C.voicings(ch).length > 0, `${x.p.id} in ${x.keyName}: ${C.name(ch)} has a shape`);
    }
  }
});

test("progressions: spelled by the key, the chord you came from where the key allows it", () => {
  const first = (n, id) => P.forChord(C.parse(n)).find((x) => x.p.id === id);
  assert.equal(first("C", "pop").names.join(" "), "C G Am F");
  assert.equal(first("Am", "andalusian").names.join(" "), "Am G F E");
  /* Eb minor, not D# minor: the flat key keeps the user's own spelling, and its sixth is Cb, not B */
  assert.equal(first("Ebm", "andalusian").keyName, "Eb");
  assert.equal(first("Ebm", "andalusian").names.join(" "), "Ebm Db Cb Bb");
  /* the passing diminished chord between I and ii is a raised I, so it is G#dim7 in G, not Abdim7 */
  assert.equal(first("G", "dim-passing").names.join(" "), "G G#dim7 Am D");
  /* a slash chord matches by its bass where a progression has one: C/E is the canon's I6 */
  const canon = first("C/E", "canon");
  assert.equal(canon.exact, true);
  assert.equal(canon.names[canon.at], "C/E");
  assert.equal(canon.names.join(" "), "C G/B Am Em/G F C/E F G");
  /* where none has its bass, the chord counts without it, after the exact ones */
  const am = P.forChord(C.parse("Am/G"));
  assert.ok(am.length > 0 && am.every((x) => !x.exact));
  /* the chord you came from is listed first among the exact ones as the key's own chord */
  const c = P.forChord(C.parse("C"));
  assert.equal(c[0].at, 0);
  assert.equal(C.name(c[0].chords[c[0].at]), "C");
});

test("progressions: the numerals name the inversions, and the blues counts its bars", () => {
  const byId = (id) => P.LIST.find((p) => p.id === id);
  const canon = byId("canon");
  assert.deepEqual([...canon.rn], ["I", "V6", "vi", "iii6", "IV", "I6", "IV", "V"]);
  assert.deepEqual([...canon.bassStep], [null, 6, null, 4, null, 2, null, null], "B, G and E are the 7th, 5th and 3rd degrees");
  assert.deepEqual([...byId("cliche").rn], ["I", "I+", "I(add6)", "I7", "IV"], "a sixth chord, not a first inversion");
  assert.deepEqual([...byId("minor-cliche").rn], ["i", "i(maj7)", "i7", "i(add6)"]);
  const blues = byId("blues").bars;
  assert.equal(blues.reduce((a, b) => a + b, 0), 12, "twelve bars");
  assert.ok(blues.every((b) => b >= 1 && b <= 4), `${blues} bars a chord`);
});

test("progressions: the 1.4.7 six, the 1.4.8 three and the 1.4.9 four have their cards, the last nine of the 32", () => {
  assert.equal(P.LIST.length, 32);
  assert.deepEqual([...P.LIST.slice(-9).map((p) => p.id)],
    ["colours", "add11", "altered9", "altered-b9", "altered-fifth", "sharp11", "m13", "sus9", "minor-add9"]);
  const colours = P.LIST.find((p) => p.id === "colours");
  assert.deepEqual([...colours.ch].map((s) => [...s]), [[0, "maj9"], [9, "m11"], [5, "6/9"], [7, "13"]]);
  assert.deepEqual([...colours.rn], ["Imaj9", "vim11", "IV6/9", "V13"]);
  assert.deepEqual([...P.LIST.find((p) => p.id === "add11").rn], ["Iadd11", "IVadd11"]);
  assert.deepEqual([...P.LIST.find((p) => p.id === "altered9").rn], ["I7#9", "IV7#9"]);
  /* the two cards of 1.4.8 */
  assert.deepEqual([...P.LIST.find((p) => p.id === "altered-b9").ch].map((s) => [...s]), [[0, "7b9"], [5, "7b9"]]);
  assert.deepEqual([...P.LIST.find((p) => p.id === "altered-b9").rn], ["I7b9", "IV7b9"]);
  assert.deepEqual([...P.LIST.find((p) => p.id === "altered-fifth").ch].map((s) => [...s]), [[0, "7b5"], [5, "7#5"]]);
  assert.deepEqual([...P.LIST.find((p) => p.id === "altered-fifth").rn], ["I7b5", "IV7#5"]);
  /* the four cards of 1.4.9 */
  for (const [id, key, ch, rn] of [
    ["sharp11", "maj", [[0, "maj7#11"], [5, "maj7#11"]], ["Imaj7#11", "IVmaj7#11"]],
    ["m13", "min", [[0, "m13"], [5, "m13"]], ["im13", "ivm13"]],
    ["sus9", "maj", [[0, "9sus4"], [5, "9sus4"]], ["I9sus4", "IV9sus4"]],
    ["minor-add9", "min", [[0, "madd9"], [5, "madd9"]], ["imadd9", "ivmadd9"]]
  ]) {
    const p = P.LIST.find((x) => x.id === id);
    assert.ok(p, id);
    assert.equal(p.key, key, id);
    assert.deepEqual([...p.ch].map((s) => [...s]), ch, id);
    assert.deepEqual([...p.rn], rn, id);
  }
  /* the colours in C: the V13's 13 is the I's 3rd */
  const c = P.forChord(C.parse("Cmaj9")).find((x) => x.p.id === "colours");
  assert.ok(c, "Cmaj9 is in the colours");
  assert.equal(c.keyName, "C");
  assert.equal(c.at, 0);
  assert.deepEqual([...c.names], ["Cmaj9", "Am11", "F6/9", "G13"]);
  /* the four new cards in C and F: every chord is spelled by its key */
  assert.deepEqual([...P.forChord(C.parse("Cmaj7#11")).find((x) => x.p.id === "sharp11").names], ["Cmaj7#11", "Fmaj7#11"]);
  assert.deepEqual([...P.forChord(C.parse("Fmaj7#11")).find((x) => x.p.id === "sharp11").names], ["Fmaj7#11", "Bbmaj7#11"]);
  assert.deepEqual([...P.forChord(C.parse("Cm13")).find((x) => x.p.id === "m13").names], ["Cm13", "Fm13"]);
  assert.deepEqual([...P.forChord(C.parse("C9sus4")).find((x) => x.p.id === "sus9").names], ["C9sus4", "F9sus4"]);
  assert.deepEqual([...P.forChord(C.parse("Cmadd9")).find((x) => x.p.id === "minor-add9").names], ["Cmadd9", "Fmadd9"]);
  /* every new quality at every root is in a card, and every chord of each card has a shape (the general test above
     runs every quality; this one names the thirteen so a gap reads clearly) */
  for (const q of ["maj9", "13", "7#9", "6/9", "m11", "add11", "7b9", "7b5", "7#5", "maj7#11", "m13", "9sus4", "madd9"]) for (let root = 0; root < 12; root++) {
    const r = P.forChord({ root, q, bass: null });
    assert.ok(r.length > 0, `${C.name({ root, q, bass: null })} has a progression`);
    for (const x of r) for (const ch of x.chords) assert.ok(C.voicings(ch).length > 0, `${x.p.id}: ${C.name(ch)}`);
  }
});

test("progressions: the other chords are played near the hand's fret, the commonest shape on a tie", () => {
  const g = C.voicings(C.parse("G"));
  assert.equal(P.nearVoicing(g, 0), g[0]);
  const near7 = P.nearVoicing(g, 7);
  assert.ok(Math.abs(near7.pos - 7) <= Math.abs(g[0].pos - 7));
});

test("the tonic filter's data: C has 15 cards and 12 with C as the tonic; Bdim has none (1.4.5)", () => {
  /* 1.4.7's three cards and 1.4.9's four belong to the new qualities, so C major (quality "") is not in them and
     its own counts do not move */
  const split = (n) => {
    const r = P.forChord(C.parse(n));
    return { all: r.length, tonic: r.filter((x) => x.p.ch[x.at][0] === 0).length };
  };
  assert.deepEqual(split("C"), { all: 15, tonic: 12 });
  assert.deepEqual(split("Bdim"), { all: 1, tonic: 0 }, "vii° of the circle, never the tonic");
  assert.deepEqual(split("G#dim7"), { all: 1, tonic: 0 }, "#I°7 of the passing diminished");
  assert.deepEqual(split("Cmaj7"), { all: 2, tonic: 2 }, "every card makes Cmaj7 the tonic: nothing to filter");
  assert.deepEqual(split("C6"), { all: 1, tonic: 1 });
  const others = [...P.forChord(C.parse("C")).filter((x) => x.p.ch[x.at][0] !== 0).map((x) => x.p.id)];
  assert.deepEqual(others, ["minor-cadence", "andalusian", "add9-pop"], "the three cards where C is not the tonic");
});

/* ---------------- the improv view's scales (1.4.0) ---------------- */
test("every quality has scales; every scale holds its chord's tones by the chord's names and marks kinds", () => {
  for (const Q of C.QUALS) {
    const sc = S.forChord({ root: 0, q: Q.id, bass: null }, null);
    assert.ok(sc.list.length >= 1, Q.id);
    assert.equal(sc.def, 0);
    for (const o of sc.list) {
      const labs = [...o.notes.map((n) => n.lab)], ivs = [...o.notes.map((n) => n.iv)];
      assert.deepEqual(ivs, [...ivs].sort((a, b) => a - b), `${Q.id} ${o.id} is low to high`);
      assert.equal(new Set(ivs).size, ivs.length, `${Q.id} ${o.id} has no note twice`);
      Q.iv.forEach((v, i) => {
        const n = o.notes.find((x) => x.iv === v);
        assert.ok(n, `${Q.id} ${o.id} shows the chord tone ${Q.lab[i]}`);
        assert.equal(n.lab, Q.lab[i]);
        assert.equal(n.kind, v === 0 ? "r" : "c");
      });
      for (const n of o.notes) {
        assert.ok(["r", "c", "t", "a"].includes(n.kind));
        assert.equal(n.pc, mod(n.iv));
        if (n.kind === "a") assert.ok(Q.iv.some((v) => mod(n.iv - v) === 1) || (Q.iv.includes(5) && n.iv === 4),
          `${Q.id} ${o.id}: avoid ${n.lab} sits a half step over a chord tone, or is the 3 of a sus4`);
      }
      assert.ok(labs.every((l) => /^(R|b{0,2}#?\d+)$/.test(l)), `${Q.id} ${o.id} ${labs}`);
      assert.ok(o.why.zh && o.why.en && o.zh && o.en);
    }
  }
});

test("the common defaults: maj7 Ionian with 11 to avoid, m7 Dorian, 7 Mixolydian, m7b5 Locrian", () => {
  const first = (q) => S.forChord({ root: 0, q, bass: null }, null);
  const C7 = first("maj7").list[0];
  assert.equal(C7.id, "ionian");
  assert.deepEqual([...C7.notes.map((n) => n.lab + n.kind)], ["Rr", "9t", "3c", "11a", "5c", "13t", "7c"]);
  assert.equal(first("m7").list[0].id, "dorian");
  assert.equal(first("7").list[0].id, "mixolydian");
  assert.equal(first("m7b5").list[0].id, "locrian");
  assert.equal(first("dim7").list.length, 1);
  /* 1.4.7's six */
  assert.deepEqual([first("maj9").list[0].id, first("maj9").list[0].zh], ["ionian", "Ionian（大调）"]);
  assert.deepEqual([first("13").list[0].id, first("13").list[0].zh], ["mixolydian", "Mixolydian"]);
  assert.deepEqual([first("7#9").list[0].id, first("7#9").list[0].zh], ["altered", "Altered（变化音阶）"]);
  assert.deepEqual([first("6/9").list[0].id, first("6/9").list[0].zh], ["ionian", "Ionian（大调）"]);
  assert.deepEqual([first("m11").list[0].id, first("m11").list[0].zh], ["dorian", "Dorian"]);
  assert.deepEqual([first("add11").list[0].id, first("add11").list[0].zh], ["ionian", "Ionian（大调）"]);
  assert.deepEqual([...first("7#9").list.map((o) => o.id)], ["altered", "hwdim", "mixolydian"]);
  assert.deepEqual([...first("13").list.map((o) => o.id)], ["mixolydian", "lyddom", "blues"]);
  assert.deepEqual([...first("m11").list.map((o) => o.id)], ["dorian", "aeolian", "minpent"]);
  assert.deepEqual([...first("add11").list.map((o) => o.id)], ["ionian", "mixolydian"]);
  /* 1.4.8's three altered dominants */
  assert.deepEqual([first("7b9").list[0].id, first("7b9").list[0].zh], ["altered", "Altered（变化音阶）"]);
  assert.deepEqual([first("7b5").list[0].id, first("7b5").list[0].zh], ["lyddom", "Lydian dominant"]);
  assert.deepEqual([first("7#5").list[0].id, first("7#5").list[0].zh], ["wholetone", "全音音阶"]);
  assert.deepEqual([...first("7b9").list.map((o) => o.id)], ["altered", "hwdim", "phrygdom"]);
  assert.deepEqual([...first("7b5").list.map((o) => o.id)], ["lyddom", "wholetone", "altered"]);
  assert.deepEqual([...first("7#5").list.map((o) => o.id)], ["wholetone", "altered"]);
  /* 1.4.9's four colours */
  assert.deepEqual([first("maj7#11").list[0].id, first("maj7#11").list[0].zh], ["lydian", "Lydian"]);
  assert.deepEqual([first("m13").list[0].id, first("m13").list[0].zh], ["dorian", "Dorian"]);
  assert.deepEqual([first("9sus4").list[0].id, first("9sus4").list[0].zh], ["mixolydian", "Mixolydian"]);
  assert.deepEqual([first("madd9").list[0].id, first("madd9").list[0].zh], ["dorian", "Dorian"]);
  assert.deepEqual([...first("maj7#11").list.map((o) => o.id)], ["lydian", "majpent"]);
  assert.deepEqual([...first("m13").list.map((o) => o.id)], ["dorian", "aeolian", "minpent"]);
  assert.deepEqual([...first("9sus4").list.map((o) => o.id)], ["mixolydian", "ionian", "minpent"]);
  assert.deepEqual([...first("madd9").list.map((o) => o.id)], ["dorian", "aeolian", "minpent"]);
  /* the 3 over a 9sus4 is the avoid note: it would undo the suspension */
  const susIonian = first("9sus4").list.find((o) => o.id === "ionian");
  assert.equal(susIonian.notes.find((n) => n.lab === "3").kind, "a");
  assert.match(susIonian.why.en, /3 would undo the sus/);
  assert.equal(first("9sus4").list[0].notes.find((n) => n.lab === "3").kind, "a");
  assert.equal(first("maj7#11").list[0].notes.find((n) => n.lab === "#11").kind, "c", "the #11 is the chord's own tone");
  assert.match(first("7b9").list.find((o) => o.id === "phrygdom").why.zh, /11 比 3 高半音/);
  assert.match(first("7b5").list[0].why.en, /5 is a half step over b5/);
  assert.equal(C7.why.zh, "大调本身，最稳的选择。11 比 3 高半音，经过就好，别停在上面。");
  assert.match(first("sus4").list[0].why.en, /3 would undo the sus/);
  assert.equal(first("maj7").list.find((o) => o.id === "lydian").why.zh, "大调把 11 升成 #11，听着更亮、更飘。");
  /* a 6 chord's 13 is its own 6; a pentatonic over maj7 still shows the 7 */
  assert.ok(first("6").list[0].notes.some((n) => n.lab === "6" && n.kind === "c"));
  assert.ok(first("maj7").list.find((o) => o.id === "majpent").notes.some((n) => n.lab === "7" && n.kind === "c"));
  /* E is the root of an E chord: the pcs follow the root */
  assert.equal(S.forChord({ root: 4, q: "m7", bass: null }, null).list[0].notes[0].pc, 4);
});

test("the degree line keeps the 9 last, and reads a 13 chord's 13 after it; the notes stay in pitch order", () => {
  const line = (q) => S.forChord({ root: 0, q, bass: null }, null).list[0];
  const labs = (q) => [...line(q).line.map((n) => n.lab)];
  /* a chord with no 13 of its own keeps 1.4.2's line: the 9 is read last and a scale 13 stays in pitch order */
  assert.deepEqual(labs("9"), ["R", "3", "11", "5", "13", "b7", "9"]);
  assert.deepEqual(labs("maj9"), ["R", "3", "11", "5", "13", "7", "9"]);
  assert.deepEqual(labs("m11"), ["R", "b3", "11", "5", "13", "b7", "9"]);
  assert.deepEqual(labs("6/9"), ["R", "3", "11", "5", "6", "7", "9"]);
  assert.deepEqual(labs("add11"), ["R", "3", "11", "5", "13", "7", "9"]);
  /* a 13 chord carries its own 13: it is read after the 9 */
  assert.deepEqual(labs("13"), ["R", "3", "11", "5", "b7", "9", "13"]);
  assert.deepEqual(labs("7#9"), ["R", "3", "#11", "5", "b7", "b9", "#9", "b13"]);
  /* 1.4.8: 7b9 owns the b9, so its altered group reads after the run; the altered fifth stays at its pitch */
  assert.deepEqual(labs("7b9"), ["R", "3", "#11", "5", "b7", "b9", "#9", "b13"]);
  assert.deepEqual(labs("7b5"), ["R", "3", "b5", "5", "13", "b7", "9"]);
  assert.deepEqual(labs("7#5"), ["R", "3", "#11", "#5", "b7", "9"]);
  /* 1.4.9: m13 owns its 13, so the 13 reads after the run; 9sus4 keeps the 4 where it sounds; #11 stays in pitch order */
  assert.deepEqual(labs("maj7#11"), ["R", "3", "#11", "5", "13", "7", "9"]);
  assert.deepEqual(labs("m13"), ["R", "b3", "11", "5", "b7", "9", "13"]);
  assert.deepEqual([...line("m13").line.filter((n) => n.lab === "13")].length, 1, "the chord's 13 appears once");
  assert.deepEqual(labs("madd9"), ["R", "b3", "11", "5", "13", "b7", "9"]);
  assert.deepEqual(labs("9sus4"), ["R", "3", "4", "5", "13", "b7", "9"]);
  assert.deepEqual([...line("9sus4").notes.map((n) => n.iv)], [0, 2, 4, 5, 7, 9, 10], "the notes stay low to high");
  assert.deepEqual([...line("m13").notes.map((n) => n.iv)], [0, 2, 3, 5, 7, 9, 10], "the notes stay low to high");
  /* the existing 19 keep exactly their old lines, including the altered 7 and Aeolian minor */
  assert.deepEqual(labs("m"), ["R", "b3", "11", "5", "b13", "b7", "9"]);
  assert.deepEqual(labs("add9"), ["R", "3", "11", "5", "13", "7", "9"]);
  assert.deepEqual(labs("m9"), ["R", "b3", "11", "5", "13", "b7", "9"]);
  assert.deepEqual(labs("maj7"), ["R", "3", "11", "5", "13", "7", "9"]);
  const alt7 = S.forChord({ root: 0, q: "7", bass: null }, null).list.find((o) => o.id === "altered");
  assert.deepEqual([...alt7.line.map((n) => n.lab)], ["R", "b9", "#9", "3", "#11", "5", "b13", "b7"]);
  /* the old general invariant: only the 9 moves; every other note keeps its pitch order */
  for (const q of ["9", "add9", "m9", "maj7"]) {
    const o = line(q);
    assert.equal(o.line[o.line.length - 1].lab, "9", `${q}: the 9 is read last`);
    assert.deepEqual([...o.line.map((n) => n.iv)], [...o.notes.filter((n) => n.lab !== "9").map((n) => n.iv),
      ...o.notes.filter((n) => n.lab === "9").map((n) => n.iv)], `${q}: everything else keeps its order`);
  }
  /* an 11 stays where it sounds, between the 3rd and the 5th, as the scale runs */
  assert.equal(labs("13")[2], "11");
  /* the notes themselves are still low to high for the picture */
  const c13 = line("13");
  assert.deepEqual([...c13.notes.map((n) => n.iv)], [0, 2, 4, 5, 7, 9, 10], "notes stay low to high");
  for (const q of ["9", "maj9", "m11", "6/9", "add11"]) assert.equal(labs(q)[labs(q).length - 1], "9", `${q}: the 9 still reads last`);
  assert.deepEqual(labs("13").slice(-2), ["9", "13"], "a 13 chord ends 9, 13");
});

test("from a progression the key picks the mode: ii Dorian, iii Phrygian, IV Lydian, V Mixolydian, minor V7 Phrygian dominant", () => {
  const inC = (root, q) => S.forChord({ root, q, bass: null }, { key: 0, minor: false });
  assert.equal(inC(2, "m7").list[inC(2, "m7").def].id, "dorian");
  assert.equal(inC(4, "m7").list[inC(4, "m7").def].id, "phrygian");
  assert.equal(inC(4, "m").list[inC(4, "m").def].id, "phrygian");
  assert.equal(inC(9, "m").list[inC(9, "m").def].id, "aeolian");
  assert.equal(inC(5, "maj7").list[inC(5, "maj7").def].id, "lydian");
  assert.equal(inC(7, "").list[inC(7, "").def].id, "mixolydian");
  assert.equal(inC(11, "m7b5").list[inC(11, "m7b5").def].id, "locrian");
  assert.equal(inC(2, "7").list[inC(2, "7").def].id, "mixolydian");   /* D7, V of V: its F# is a chord tone */
  assert.equal(inC(9, "7").list[inC(9, "7").def].id, "mixob13");      /* A7 to Dm */
  assert.equal(inC(4, "7").list[inC(4, "7").def].id, "phrygdom");     /* E7 to Am */
  assert.ok(inC(4, "7").inKey);
  const g7 = S.forChord({ root: 7, q: "7", bass: null }, { key: 0, minor: true });
  assert.equal(g7.list[g7.def].id, "phrygdom");
  /* nothing fits: the chord's own default, not marked as picked by the key */
  assert.equal(inC(10, "7").list[inC(10, "7").def].id, "lyddom");    /* Bb7, the backdoor dominant */
  const fs = S.forChord({ root: 3, q: "m7", bass: null }, { key: 0, minor: false });   /* Ebm7 */
  assert.equal(fs.def, 0);
  assert.equal(fs.inKey, false);
});

test("the improv picture marks every place of the scale by kind and leaves other places empty", () => {
  const o = S.forChord({ root: 0, q: "maj7", bass: null }, null).list[0];
  const b = D.scale(o.notes);
  assert.equal(b.w, D.NECK_W); assert.equal(b.h, D.NECK_H);
  /* string 5 (high E) is the top row at y 6; fret 1 there is F, the avoid 11: a cross, dark at its centre */
  const at = (x, y) => b.px[y * b.w + x];
  assert.equal(at(12 + 5, 6), 1);
  /* fret 3 of the high E is G, a chord tone: a full ink dot */
  assert.equal(at(12 + 2 * 9 + 5, 6), 0);
  assert.equal(at(12 + 2 * 9 + 5 + 2, 6 + 2), 0);
  /* fret 5 of the high E is A, the 13: a ring, paper in its middle */
  assert.equal(at(12 + 4 * 9 + 5, 6), 3);
  assert.equal(at(12 + 4 * 9 + 5 + 3, 6), 0);
  /* fret 8 of the high E is C, the root: a square, ink in its corner */
  assert.equal(at(12 + 7 * 9 + 5 - 3, 6 - 3), 0);
  /* fret 2 of the high E is F#, not in C Ionian: the string runs through */
  assert.equal(at(12 + 9 + 5, 6), 1);
});

/* ---------------- the capo (1.4.10, docs/design/chord-book.md 15) ---------------- */

test("capo: transpose moves the root and the bass, keeps the quality, and comes back", () => {
  assert.deepEqual({ ...C.transpose(C.parse("C"), 2) }, { ...C.parse("D") }, "C up two semitones is D");
  assert.deepEqual({ ...C.transpose(C.parse("D/F#"), 2) }, { ...C.parse("E/Ab") }, "the bass moves too, in the book's fixed names");
  assert.deepEqual({ ...C.transpose(C.transpose(C.parse("D/F#"), 2), -2) }, { ...C.parse("D/F#") }, "and back again");
  assert.equal(C.transpose(C.parse("C"), 0).bass, null, "a chord with no bass keeps none");
  assert.equal(C.transpose(C.parse("C"), 12).root, 0, "an octave is the same chord");
  assert.equal(C.transpose(C.parse("Am7"), 3).q, "m7", "the quality does not change");
  assert.deepEqual({ ...C.transpose(C.parse("Ebmaj7"), 11) }, { ...C.parse("Dmaj7") }, "up eleven, mod twelve");
});

test("capo: 0 is a no-op for transpose, strings, midiOf, identify and Draw.scale", () => {
  const same = (a, b, what) => assert.equal(JSON.stringify(a), JSON.stringify(b), what);
  const cases = [["C", "x32010"], ["Am/G", "3x2210"], ["E7b9", "07676x"], ["Cmaj7#11", "x34000"], ["Ab9/B", "x1200x"]];
  for (const [name, f] of cases) {
    const c = C.parse(name), frets = C.fr(f);
    same(C.transpose(c, 0), c, `${name}: transpose 0`);
    same(C.strings(frets, c), C.strings(frets, c, 0), `${name}: strings 0`);
    same(C.midiOf(frets), C.midiOf(frets, 0), `${name}: midiOf 0`);
    same(C.identify(frets), C.identify(frets, 0), `${name}: identify 0`);
  }
  /* the improv picture of a chord and its first scale: the same buffer with and without the 0 */
  const notes = S.forChord(C.parse("C"), null).list[0].notes;
  const a = D.scale(notes), b = D.scale(notes, 0);
  assert.equal([...a.px].join(","), [...b.px].join(","), "Draw.scale 0 is the same buffer");
});

test("capo: a C shape at capo 2 sounds D, and its degrees are still the shape's", () => {
  const c = C.parse("C"), frets = C.fr("x32010"), s = [...C.strings(frets, c, 2)];
  assert.deepEqual(s.map((x) => (x ? C.NAMES[x.pc] : null)), [null, "D", "F#", "A", "D", "F#"], "D F# A D F#");
  assert.deepEqual(s.map((x) => (x ? x.lab : null)), [null, "R", "3", "5", "R", "3"], "the degrees do not move");
  assert.deepEqual([...C.midiOf(frets, 2)], [50, 54, 57, 62, 66], "a tone above the shape's own [48, 52, 55, 60, 64]");
  /* capo 12 is an octave: the same notes as capo 0, every pitch twelve higher */
  const twelve = [...C.strings(frets, c, 12)];
  assert.deepEqual(twelve.map((x) => (x ? C.NAMES[x.pc] : null)), [...C.strings(frets, c)].map((x) => (x ? C.NAMES[x.pc] : null)), "the same notes");
  assert.deepEqual([...C.midiOf(frets, 12)], [...C.midiOf(frets)].map((m) => m + 12), "an octave up");
});

test("capo: the finder names the chord the strings sound, and the name comes back to the shape", () => {
  const d = [...C.identify(C.fr("x32010"), 2)];
  assert.equal(C.name(d[0]), "D", "x32010 under capo 2 is D");
  assert.deepEqual({ ...C.transpose(d[0], -2) }, { ...C.parse("C") }, "and -2 takes it back to the shape");
  assert.equal(C.name([...C.identify(C.fr("2x0232"), 2)][0]), "E/Ab", "D/F# under capo 2 is E/Ab, in the fixed names");
  assert.equal(C.name([...C.identify(C.fr("x32010"))][0]), "C", "capo 0 still names the shape");
});

test("capo: the improv picture is the shape's picture at every capo, 0 through 12", () => {
  for (const shape of ["C", "Am7", "Abdim7", "C13"]) {
    const base = [...D.scale(S.forChord(C.parse(shape), null).list[0].notes).px].join(",");
    for (let capo = 0; capo <= 12; capo++) {
      const sounding = C.transpose(C.parse(shape), capo);
      const b = D.scale(S.forChord(sounding, null).list[0].notes, capo);
      assert.equal([...b.px].join(","), base, `${shape} at capo ${capo}`);
    }
  }
});
