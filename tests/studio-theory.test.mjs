// runtime/studio-theory.js: which chords and melody notes stay in the key (docs/design/studio.md 12.20.9).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { runScript, read } from "./helpers.mjs";

const ctx = runScript("runtime/studio-song.js");
for (const f of ["studio-edit.js", "studio-theory.js"]) vm.runInContext(read("runtime/" + f), ctx, { filename: "runtime/" + f });
const S = ctx.LopdaSong, E = ctx.LopdaStudioEdit, TH = ctx.LopdaStudioTheory;
const song = (key, scale) => Object.assign(JSON.parse(JSON.stringify(S.newSong(0))), { key, scale });

test("chordIssue: the scale's chords and common borrowed ones pass; G sharp major in D minor does not", () => {
  const dm = song(2, "minor");
  assert.equal(TH.chordIssue(dm, 0, "m"), "");
  assert.equal(TH.chordIssue(dm, 4, "maj"), "", "A major, the V of D minor, is borrowed from harmonic minor");
  assert.equal(TH.chordIssue(dm, 5, "maj7"), "");
  assert.match(TH.chordIssue(dm, 3, "maj", 1), /Ab.*outside D minor/, "the owner's Pink Floyd tape");
  const am = song(9, "minor");
  assert.match(TH.chordIssue(am, 2, "m"), /Cm.*outside/, "C minor in A minor (the owner's first tape)");
  const c = song(0, "major");
  assert.equal(TH.chordIssue(c, 5, "maj", 1), "", "bVII (B flat) in C major");
  assert.equal(TH.chordIssue(c, 3, "m"), "", "iv (F minor) in C major");
  assert.equal(TH.chordIssue(c, 4, "5"), "", "a power chord on V");
  assert.equal(TH.chordIssue(c, 1, "maj", 1), "", "bIII (E flat) in C major");
  assert.match(TH.chordIssue(c, 0, "maj", 1), /outside/, "C sharp major in C major is not a common borrowing");
  assert.match(TH.borrowedText(c), /Bb/);
});

test("patternIssues: an off-scale melody note must be a chord tone or a step between neighbours", () => {
  let s = song(2, "minor");
  s = E.apply(s, [{ op: "clearPattern", pattern: 0 }, { op: "setNote", pattern: 0, track: "chords", step: 0, deg: 4, q: "maj" }]).song;
  /* C sharp over A major is a chord tone */
  s = E.apply(s, [{ op: "setNote", pattern: 0, track: "melody", step: 0, deg: 6, acc: 1 }]).song;
  assert.deepEqual([...TH.patternIssues(s, 0)], []);
  /* D sharp jumping in from far away is refused */
  let t = E.apply(s, [{ op: "setNote", pattern: 0, track: "melody", step: 4, deg: 7 }, { op: "setNote", pattern: 0, track: "melody", step: 8, deg: 3 },
    { op: "setNote", pattern: 0, track: "melody", step: 12, deg: 0, acc: 1 }]).song;
  assert.equal(TH.patternIssues(t, 0).length, 1);
  /* the same D sharp between D and E passes */
  t = E.apply(s, [{ op: "setNote", pattern: 0, track: "melody", step: 4, deg: 0 }, { op: "setNote", pattern: 0, track: "melody", step: 8, deg: 0, acc: 1 },
    { op: "setNote", pattern: 0, track: "melody", step: 12, deg: 1 }]).song;
  assert.deepEqual([...TH.patternIssues(t, 0)], []);
});
