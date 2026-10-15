// runtime/textsel.js: the text side of the shared selection (docs/design/softkeys.md section 3, decisions.md section 18),
// and the copy that goes with a quote. The cursor, the marks and touch are covered by the reader and dictionary e2e tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const T = runScript("runtime/textsel.js").LopdaTextSel;
const plain = (v) => JSON.parse(JSON.stringify(v));
const words = (s) => plain(T.units(s).map((u) => s.slice(u.a, u.b)));
/* the selection around one unit: block p, the first occurrence of w */
const around = (blocks, p, w, unit) => {
  const a = blocks[p].indexOf(w), u = { p, a, b: a + w.length };
  return T.join(blocks, T.widen(blocks, u, u, unit));
};

test("units: English by word (inner apostrophes and hyphens kept), CJK by character, digits, mixed", () => {
  assert.deepEqual(words("Alice’s well-known rabbit-hole, isn't it?"), ["Alice’s", "well-known", "rabbit-hole", "isn't", "it"]);
  assert.deepEqual(words("学而时习之，不亦说乎？"), ["学", "而", "时", "习", "之", "不", "亦", "说", "乎"]);
  assert.deepEqual(words("n. 苹果, 家伙"), ["n", "苹", "果", "家", "伙"]);
  assert.deepEqual(words("ECDICT 2024年"), ["ECDICT", "2024", "年"]);
  assert.deepEqual(words("かなカナ한글"), ["か", "な", "カ", "ナ", "한", "글"]);
  assert.deepEqual(plain(T.units("")), []);
  assert.deepEqual(plain(T.units("  ,.;  ")), []);
});

test("sentences: CJK and Latin stops, a period before a space, closing quotes kept", () => {
  const zh = ["子曰：「学而时习之，不亦说乎？」有朋自远方来，不亦乐乎？"];
  assert.equal(around(zh, 0, "习", "sent"), "子曰：「学而时习之，不亦说乎？」");
  assert.equal(around(zh, 0, "朋", "sent"), "有朋自远方来，不亦乐乎？");
  const en = ["It was hot. “Who cares?” said Alice. The end"];
  assert.equal(around(en, 0, "hot", "sent"), "It was hot.");
  assert.equal(around(en, 0, "Who", "sent"), "“Who cares?”");
  assert.equal(around(en, 0, "said", "sent"), "said Alice.");
  assert.equal(around(en, 0, "end", "sent"), "The end", "the block's end ends the last sentence");
  assert.equal(around(["Wait… what"], 0, "what", "sent"), "what");
  /* a period with no space after it is not a stop (3.14, e.g), and nothing knows abbreviations: "Mr." ends one */
  assert.equal(around(["Pi is 3.14 or so."], 0, "Pi", "sent"), "Pi is 3.14 or so.");
  assert.equal(around(["Ask Mr. Smith now."], 0, "Smith", "sent"), "Smith now.");
  /* a dictionary line: "n." ends a sentence, so the sentence is the definition */
  assert.equal(around(["n. fruit with red skin"], 0, "red", "sent"), "fruit with red skin");
});

test("widen: a word, a range over blocks, a paragraph; empty blocks are skipped", () => {
  const blocks = ["One two. Three four.", "", "Five six. Seven."];
  const lo = { p: 0, a: 4, b: 7 }, hi = { p: 2, a: 0, b: 4 };
  assert.deepEqual(plain(T.widen(blocks, lo, lo, "word")), [{ p: 0, a: 4, b: 7 }]);
  assert.deepEqual(plain(T.widen(blocks, lo, hi, "word")), [{ p: 0, a: 4, b: 20 }, { p: 2, a: 0, b: 4 }]);
  assert.equal(T.join(blocks, T.widen(blocks, lo, hi, "word")), "two. Three four.\nFive");
  assert.equal(T.join(blocks, T.widen(blocks, lo, hi, "sent")), "One two. Three four.\nFive six.");
  assert.equal(T.join(blocks, T.widen(blocks, hi, hi, "para")), "Five six. Seven.");
  assert.equal(T.join(blocks, T.widen(blocks, lo, lo, "para")), "One two. Three four.");
  /* the text may come from a function, as the programs pass it */
  assert.equal(T.join((i) => blocks[i], T.widen((i) => blocks[i], hi, hi, "sent")), "Five six.");
  assert.deepEqual(plain(T.widen([""], { p: 0, a: 0, b: 0 }, { p: 0, a: 0, b: 0 }, "para")), []);
  assert.equal(T.join([""], []), "");
});

test("copy: the clipboard, then the old way; a refusal is false, never an error", async () => {
  const fakeDoc = (ok) => {
    const ta = { style: {}, select() {}, remove() {} };
    return { createElement: () => ta, body: { appendChild() {} }, execCommand: () => { if (ok === "throw") throw new Error("no"); return ok; } };
  };
  const run = (navigator, document) => runScript("runtime/textsel.js", { navigator, document }).LopdaTextSel;
  let wrote = null;
  assert.equal(await run({ clipboard: { writeText: (t) => { wrote = t; return Promise.resolve(); } } }, fakeDoc(false)).copy("sister"), true);
  assert.equal(wrote, "sister");
  assert.equal(await run({ clipboard: { writeText: () => Promise.reject(new Error("denied")) } }, fakeDoc(true)).copy("x"), true);
  assert.equal(await run({ clipboard: { writeText: () => Promise.reject(new Error("denied")) } }, fakeDoc(false)).copy("x"), false);
  assert.equal(await run({}, fakeDoc("throw")).copy("x"), false);
  assert.equal(await run({ clipboard: { writeText: () => { throw new Error("sync"); } } }, fakeDoc(true)).copy("x"), true);
});
