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
const C = ctx.Chords;
const P = ctx.Progs;
const D = ctx.Draw;
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
    "D/F#": "2x0232", "G/B": "x20003", "C/G": "332010"
  };
  for (const [name, want] of Object.entries(golden)) {
    const first = C.fretText(C.voicings(C.parse(name))[0].frets);
    assert.ok([].concat(want).includes(first), `${name}: ${first}, want ${want}`);
  }
});

test("every one of the 12 x 19 chords has at least 3 voicings, and every voicing keeps the rules", () => {
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
  assert.equal(C.parse("Cm").q, "m");
  assert.equal(C.parse("CM").q, "");
  assert.equal(C.parse("Bb").root, 10);
  assert.equal(C.parse("Bbm").q, "m");
  assert.equal(C.parse("Bb5").q, "5");
  for (const bad of ["", "H", "Cxyz", "C/H", "C13", "Cmaj13#11", "12", null, 7]) assert.equal(C.parse(bad), null, String(bad));
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
  assert.equal(C.identify(C.fr("xxxxx0")).length, 0, "one note is no chord");
  assert.equal(C.identify(C.fr("x01230")).length, 0, "a cluster is no chord of the 19");
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
});

test("strings: each string of a voicing names its pitch and its degree, low E first, a muted string null", () => {
  const show = (name, frets) => [...C.strings(C.fr(frets), C.parse(name))].map((x) => (x ? `${C.NAMES[x.pc]}${x.lab}@${x.midi}` : "x")).join(" ");
  assert.equal(show("C", "x32010"), "x CR@48 E3@52 G5@55 CR@60 E3@64", "an open C is five notes: R 3 5 R 3");
  assert.equal(show("G", "320003"), "GR@43 B3@47 D5@50 GR@55 B3@59 GR@67");
  assert.equal(show("Am/G", "3x2210"), "G/@43 x E5@52 AR@57 Cb3@60 E5@64", "the extra bass of a slash chord is marked as the bass");
  assert.equal(show("C/E", "032010"), "E3@40 CR@48 E3@52 G5@55 CR@60 E3@64", "a bass that is a chord tone keeps its degree");
});

/* ---------------- the progressions (和弦连接, 1.2.0) ---------------- */

test("progressions: every entry is whole, in both languages, and every chord in it is one the app knows", () => {
  const ids = new Set();
  for (const p of P.LIST) {
    assert.ok(!ids.has(p.id), `${p.id} once`); ids.add(p.id);
    assert.ok(p.key === "maj" || p.key === "min", `${p.id} key`);
    assert.ok(p.zh && p.en && p.why.zh && p.why.en, `${p.id} has both languages`);
    assert.equal(p.rn.length, p.ch.length, `${p.id}: one numeral per chord`);
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
  /* a slash chord matches by its bass where a progression has one: C/E is the canon's I/3 */
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

test("progressions: the other chords are played near the hand's fret, the commonest shape on a tie", () => {
  const g = C.voicings(C.parse("G"));
  assert.equal(P.nearVoicing(g, 0), g[0]);
  const near7 = P.nearVoicing(g, 7);
  assert.ok(Math.abs(near7.pos - 7) <= Math.abs(g[0].pos - 7));
});
