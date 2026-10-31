// runtime/studio-ai.js: extracting one JSON object, the compact overview and a pattern's notes (docs/design/studio.md 12.19).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { runScript, read } from "./helpers.mjs";

const ctx = runScript("runtime/studio-song.js");
for (const f of ["studio-styles.js", "studio-tools.js", "studio-edit.js", "studio-ai.js"]) {
  vm.runInContext(read("runtime/" + f), ctx, { filename: "runtime/" + f });
}
const S = ctx.LopdaSong, A = ctx.LopdaStudioAI, ST = ctx.LopdaStudioStyles;
const plain = (v) => JSON.parse(JSON.stringify(v));

test("extract: the one object, inside a fence and after a sentence", () => {
  assert.deepEqual(plain(A.extract('Sure:\n```json\n{"reply":"ok","calls":[]}\n```\nDone.')), { reply: "ok", calls: [] });
  assert.deepEqual(plain(A.extract('Here it is: {"bars":[[[0,2,0.8]]]} thanks')), { bars: [[[0, 2, 0.8]]] });
  assert.deepEqual(plain(A.extract('prefix {"name":"a"} suffix {"name":"b"}')), { name: "a" }, "the first balanced object");
});

test("extract: one trailing comma before } or ] is tolerated", () => {
  assert.deepEqual(plain(A.extract('{"reply":"x","calls":[{"tool":"ghost","pattern":0}] ,}')),
    { reply: "x", calls: [{ tool: "ghost", pattern: 0 }] });
  assert.equal(A.extract('{"a":[1,2],}').error, undefined, "the repair is attempted after the first parse fails");
  assert.ok(A.extract('{"a":[1,2,],}').error, "a second trailing comma is still unreadable");
  assert.ok(A.extract('{"calls":[{"tool":"ghost","pattern":0,}],}').error, "a nested object is not returned instead");
});

test("extract: blank and objectless answers carry an English reason", () => {
  assert.equal(A.extract("").error, "empty answer");
  assert.equal(A.extract("   \n ").error, "empty answer");
  assert.match(A.extract("no json here").error, /JSON object/);
  assert.match(A.extract("[1,2,3]").error, /JSON object/);
});

test("overview: settings, the mix, a compressed chain and one line per pattern", () => {
  const song = S.demoSong(1000);
  song.name = "Rainy tram";
  song.tracks[1].vol = 0.7;
  song.tracks[3].mute = true;
  song.song = [0, 0, 1, 1, 2, 3, 2, 3];
  const text = A.overview(song);
  assert.match(text, /Rainy tram/);
  assert.match(text, /78 BPM \| A dorian \| swing 0\.62 \| tape 2 \| kit soft/);
  assert.match(text, /Mix: bass vol 0\.7, melody muted/);
  assert.match(text, /Chain \(8\): A x2, B x2, \(C D\) x2/);
  assert.match(text, /^A: drums \d+ hits \(2 ghost\), bass \d+ notes, chords Am9 \(steps 0\), melody \d+ notes degrees \d+\.\.\d+$/m);
  assert.match(text, /^C: .*chords Cmaj9 Bm7 \(steps 0, 8\)/m);
});

test("overview: a 16-pattern song stays under about 2.5 KB", () => {
  let song = S.demoSong(1000);
  for (let i = 8; i < 16; i++) song = S.ensurePattern(song, i);
  song.song = Array.from({ length: 16 }, (_, i) => i);
  const text = A.overview(song);
  assert.ok(text.length < 2500, text.length + " bytes");
  assert.equal(text.split("\n").length, 4 + 16, "name, settings, voices and chain, then one line per pattern");
});

test("patternView: every note, compact, with rests and chord names", () => {
  const song = S.demoSong(1000);
  const view = A.patternView(song, 4);
  assert.match(view, /^E drums: kick /);
  assert.match(view, /\| snare /);
  assert.match(view, /; bass: 0:deg\d+@\d/);
  assert.match(view, /; chords: 0:[IViv]+\(Cmaj9\)/);
  assert.match(view, /; melody: /);

  const edited = ctx.LopdaStudioEdit.apply(S.newSong(1), [
    { op: "setRest", pattern: 0, track: "bass", step: 8 },
    { op: "setRest", pattern: 0, track: "chords", step: 8 },
    { op: "setRest", pattern: 0, track: "melody", step: 4 },
  ]);
  const rests = A.patternView(edited.song, 0);
  assert.match(rests, /bass: .*8:rest/);
  assert.match(rests, /chords: .*8:rest/);
  assert.match(rests, /melody: .*4:rest/);
  assert.equal(A.patternView(S.newSong(1), 9).split("; ").length, 4, "an empty pattern still has the four tracks");
});

test("overview: a renamed or late pattern carries its number; plain A-P reads as before (12.22)", () => {
  let song = S.demoSong(1);
  const before = A.overview(song);
  assert.doesNotMatch(before, /[A-Z]\d? \(\d+\)/, "no numbers on a plain tape");
  song = S.renamePattern(song, 1, "V2");
  song = S.copyPattern(song, 0, 20);
  song.song = [0, 1, 20];
  const text = A.overview(song);
  assert.match(text, /Chain \(3\): A, V2 \(1\), E1 \(20\)/);
  assert.match(A.patternView(song, 1), /^V2 \(1\) /);
});
