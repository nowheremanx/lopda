// runtime/wordlist.js (PAD.dict, SPEC.md 6.7) over the real built-in ECDICT: the app word list, queries, entries, limits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import vm from "node:vm";
import { ROOT, read, runScript } from "./helpers.mjs";

const ctx = runScript("runtime/stardict.js", {
  TextDecoder, Blob, Response, DecompressionStream, Uint8Array, Uint32Array, DataView, Promise, String,
});
vm.runInContext(read("runtime/wordlist.js"), ctx, { filename: "runtime/wordlist.js" });
const SD = ctx.LopdaStarDict, WL = ctx.LopdaWordList;
const V = (f) => join(ROOT, "runtime", "vendor", "ecdict", "ecdict" + f);
const LIST_TEXT = gunzipSync(readFileSync(V(".words.gz"))).toString("utf8");
const LIST = WL.parseWords(LIST_TEXT);
const plain = (v) => JSON.parse(JSON.stringify(v));   // out of the vm's realm, for deepEqual

let calls = { words: 0, book: 0 };
const src = WL.source({
  words: () => { calls.words++; return Promise.resolve(LIST_TEXT); },
  book: () => {
    calls.book++;
    return SD.open({ ifo: readFileSync(V(".ifo"), "utf8"), idx: new Uint8Array(readFileSync(V(".idx"))), dict: new Uint8Array(readFileSync(V(".dict.dz"))) })
      .then((book) => ({ book, lemma: SD.parseLemma(gunzipSync(readFileSync(V(".lemma.gz"))).toString("utf8")) }));
  },
});
const words = async (q) => plain(await src.words(q));

test("word list: plain a-z, common words first, no names, abbreviations or blocked words", () => {
  assert.ok(LIST.length > 20000, LIST.length + " words");
  assert.deepEqual(plain(LIST.slice(0, 4)), ["the", "be", "and", "of"]);
  assert.equal(new Set(LIST).size, LIST.length);
  for (const w of LIST) assert.match(w, /^[a-z]+$/);
  for (const w of ["fuck", "nigger", "slut", "cunt", "whore", "shit", "pussy"]) assert.ok(!LIST.includes(w), w + " is blocked");
  for (const w of ["ian", "jim", "kg", "iii", "etc"]) assert.ok(!LIST.includes(w), w + " is not a word for puzzles");
  for (const w of ["cat", "river", "gay", "tom", "cocktail", "assist"]) assert.ok(LIST.includes(w), w + " stays");
});

test("words: pattern, letters, len and level; most common first", async () => {
  const p = await words({ pattern: "c?t" });
  assert.deepEqual(p.words.slice().sort(), ["cat", "cot", "cut"]);
  assert.equal(p.more, false);
  const five = await words({ len: 5, level: 1, max: 500 });
  assert.ok(five.words.length > 100 && five.words.every((w) => w.length === 5));
  assert.ok(five.words.every((w) => LIST.indexOf(w) < 2000), "level 1 is the first 2000");
  assert.equal(five.words[0], LIST.find((w) => w.length === 5), "list order");
  const l = await words({ letters: "planet", len: [3, 6], max: 500 });
  for (const w of l.words) {
    const left = "planet".split("");
    for (const c of w) { const i = left.indexOf(c); assert.ok(i >= 0, w + " uses only planet's letters"); left.splice(i, 1); }
  }
  assert.ok(l.words.includes("plane") && l.words.includes("plant") && l.words.includes("planet"));
  assert.ok(!l.words.includes("apple"), "each letter at most as often as given");
});

test("words: max, offset and more page through the same order", async () => {
  const all = await words({ len: 4, level: 2, max: 500 });
  const a = await words({ len: 4, level: 2, max: 10 }), b = await words({ len: 4, level: 2, max: 10, offset: 10 });
  assert.equal(a.more, true);
  assert.deepEqual(a.words.concat(b.words), all.words.slice(0, 20));
  const few = await words({ pattern: "c?t" });
  const end = await words({ pattern: "c?t", offset: few.words.length });
  assert.deepEqual(end, { words: [], more: false });
  assert.equal((await words()).words.length, 100, "100 by default");
});

test("words: a bad query says what is wrong", async () => {
  for (const q of [{ len: 1 }, { len: 16 }, { len: [5, 3] }, { len: "5" }, { pattern: "C?T" }, { pattern: "a" }, { pattern: "abc", len: 4 },
    { letters: "abc1" }, { letters: "abcdefghijklmnop" }, { level: 0 }, { level: 6 }, { max: 0 }, { max: 501 }, { offset: -1 }, [], "cat"]) {
    const r = await words(q);
    assert.equal(typeof r.error, "string", JSON.stringify(q) + " -> " + JSON.stringify(r));
  }
});

test("lookup: exact word, base form, Chinese with a part of speech only, English as it is", async () => {
  assert.deepEqual(plain(await src.lookup("River")), { word: "river", zh: ["n. 河, 江"], en: ["n. a large natural stream of water (larger than a creek)"] });
  const cat = plain(await src.lookup("cat"));
  assert.deepEqual(cat.zh, ["n. 猫, 恶妇", "vi. 呕吐"], "the CAD / CAT lines go");
  const run = plain(await src.lookup("running"));
  assert.equal(run.word, "running", "running is a headword of its own");
  const ran = plain(await src.lookup("ran"));
  assert.equal(ran.word, "run"); assert.equal(ran.form, "ran");
  assert.ok(ran.zh.length > 0);
  assert.equal(await src.lookup("zzxq"), null);
  assert.equal(typeof plain(await src.lookup("ice cream")).error, "string");
  assert.equal(typeof plain(await src.lookup("")).error, "string");
  assert.ok((await src.lookup("fuck")).zh.length > 0, "the dictionary still explains blocked words");
});

test("source: each file is read once, the entries only for lookup", async () => {
  calls = { words: 0, book: 0 };
  const s = WL.source({ words: () => { calls.words++; return Promise.resolve(LIST_TEXT); }, book: () => { calls.book++; return Promise.reject(new Error("no")); } });
  await s.words({ len: 3 }); await s.words({ len: 4 });
  assert.deepEqual(calls, { words: 1, book: 0 });
  await assert.rejects(s.lookup("cat")); await assert.rejects(s.lookup("cat"));
  assert.equal(calls.book, 2, "a failed load is tried again next time");
  assert.equal(s.version, "ecdict-1");
});

test("limiter: 10 calls in any second", () => {
  const ok = WL.limiter(), r = [];
  for (let i = 0; i < 12; i++) r.push(ok(1000 + i));
  assert.deepEqual(r, [...Array(10).fill(true), false, false]);
  assert.equal(ok(1999), false);
  assert.equal(ok(2000), true, "the first call is a second old");
});

test("entry: no part of speech -> the first lines without their label", () => {
  assert.deepEqual(plain(WL.entry("[计] 字符\n[医] 别的\n第三\n\nn. x")), { zh: ["字符", "别的"], en: ["n. x"] });
  assert.deepEqual(plain(WL.entry("abbr. 某某\nn. 东西")), { zh: ["n. 东西"], en: [] });
});
