// registry/apps/sisyphus: the sixteen lines, the first-summit rule, and the font coverage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { read, readJSON, runScript } from "./helpers.mjs";

const QS = runScript("registry/apps/sisyphus/src/quotes.js").QS;
const FONT = readJSON("sdk/fonts/lopix12.json");

test("sixteen lines, each with a Chinese and an English text, and unique ids", () => {
  assert.equal(QS.QUOTES.length, 16);
  const ids = new Set();
  for (const q of QS.QUOTES) {
    assert.match(q.id, /^\d+$/);
    assert.ok(!ids.has(q.id), `duplicate id ${q.id}`);
    ids.add(q.id);
    assert.ok(q.zh.length > 0 && q.en.length > 0);
    assert.ok(q.zh.length <= 45, `zh too long for the card: ${q.id}`);
    assert.ok(q.en.length <= 110, `en too long for the card: ${q.id}`);
  }
});

test("the first summit is always the last line; later draws never repeat the previous line", () => {
  const first = { summits: 0, seen: [], deck: [], lastQuote: null };
  const q = QS.next(first);
  assert.equal(q.id, "16");
  assert.equal(first.lastQuote, "16");

  const state = { summits: 1, seen: [], deck: [], lastQuote: "16" };
  let previous = "16";
  for (let i = 0; i < 200; i++) {
    const next = QS.next(state);
    assert.notEqual(next.id, previous, `repeat at draw ${i}`);
    previous = next.id;
  }
});

test("the note carries both languages, the source and the summit number", () => {
  const q = QS.byId["7"];
  const text = QS.noteText(q, 3);
  assert.ok(text.includes(q.zh));
  assert.ok(text.includes(q.en));
  assert.ok(text.includes("第 3 次登顶"));
  assert.ok(text.includes("加缪《西西弗斯神话》"));
  assert.ok(text.length < 4096);
});

test("every character of every line has a lopix12 glyph", () => {
  const missing = [];
  for (const q of QS.QUOTES) {
    for (const ch of q.zh + q.en) if (!FONT.glyphs[ch]) missing.push(ch);
  }
  assert.deepEqual([...new Set(missing)], []);
});

test("a saved seen list keeps its order and ignores unknown ids", () => {
  const list = QS.seenList({ seen: ["16", "nope", "3", "16"] });
  assert.equal(list.map((q) => q.id).join(","), "16,3,16");
});

test("the source file is the bundled one and the manifest is a store app", () => {
  const html = read("registry/apps/sisyphus/index.html");
  const src = read("registry/apps/sisyphus/src/quotes.js");
  assert.ok(html.includes(src.trim().slice(0, 80)));
  const m = readJSON("registry/apps/sisyphus/manifest.json");
  assert.equal(m.id, "sisyphus");
  assert.equal(m.spec, "lopda/1");
  assert.equal(m.buttons, true);
  assert.deepEqual(m.permissions, ["notes"]);
  assert.ok(m.icon.length === 16 && m.icon.every((r) => r.length === 16));
});
