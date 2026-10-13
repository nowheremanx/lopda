// Builds the dictionary the runtime ships: a small ECDICT (English-Chinese) in StarDict format.
// Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
//
//   node tools/gen-ecdict.mjs <ecdict.csv> [count]      writes runtime/vendor/ecdict/
//
// ecdict.csv is the full table from https://github.com/skywind3000/ECDICT (MIT). Run once; the output is committed.
// What is kept, and why (licence review in LICENSING.md):
//   word, translation (Chinese), definition (English), exchange (word forms). bnc/frq (corpus rank) only choose the words.
//   Dropped: phonetic (crawled), collins stars, oxford 3000, exam tags, pos, detail, audio; and "[网络]" lines of the
//   Chinese text, which are web translations of unknown origin.
// Output: ecdict.ifo / .idx / .dict.dz (dictzip) and ecdict.lemma.gz, a gzip of "form<TAB>lemma" lines for the
// lookup step between an exact match and prefix candidates (running -> run). Forms that are headwords are left out.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStarDict } from "./stardict-write.mjs";

const [csvPath, countArg] = process.argv.slice(2);
if (!csvPath) { console.error("usage: node tools/gen-ecdict.mjs <ecdict.csv> [count]"); process.exit(2); }
const COUNT = +countArg || 25000;
const PROPER_MAX = 8000;     // capitalised words (names, places, days) only when this common
const EN_LINES = 4;          // English senses kept per word; the Chinese text is what most lookups want
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "runtime", "vendor", "ecdict");

/* RFC 4180 CSV, quoted fields may hold commas, quotes and newlines */
function parseCSV(t) {
  const rows = []; let r = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { r.push(f); f = ""; }
    else if (c === "\n") { r.push(f); rows.push(r); r = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  return rows;
}

const rows = parseCSV(readFileSync(csvPath, "utf8"));
const H = rows.shift(), col = Object.fromEntries(H.map((h, i) => [h, i]));
for (const k of ["word", "translation", "definition", "bnc", "frq", "exchange"]) if (!(k in col)) throw new Error("missing column " + k);
const get = (r, k) => r[col[k]] || "";
/* the table writes line breaks as the two characters \n (sometimes \r\n) */
const lines = (s) => s.split(/\\r\\n|\\n|\\r/).map((x) => x.trim()).filter(Boolean);
const rank = (r) => { const a = +get(r, "bnc") || 0, b = +get(r, "frq") || 0; return a && b ? Math.min(a, b) : a || b; };
/* "run的过去式", "child的复数": rows that only name an inflection; the lemma step finds the base word instead */
const INFLECTION_ONLY = /^\S+的(过去式|过去分词|现在分词|复数|第三人称单数|比较级|最高级)(和(过去式|过去分词|现在分词))?$/;
const chinese = (r) => lines(get(r, "translation")).filter((l) => !/^\[网络\]/.test(l));
const forms = (r) => {
  const o = {};
  for (const part of get(r, "exchange").split("/")) { const m = /^([a-z0-9]):(.+)$/.exec(part); if (m) o[m[1]] = m[2]; }
  return o;
};
const usable = (w) => /^[A-Za-z][A-Za-z'\- ]*$/.test(w) && w.length <= 40;

const byWord = new Map();
for (const r of rows) byWord.set(get(r, "word"), r);

const picked = [];
const candidates = rows.filter((r) => {
  const w = get(r, "word"), k = rank(r);
  if (!k || !usable(w) || !chinese(r).length) return false;
  return w[0] === w[0].toLowerCase() || k <= PROPER_MAX;
}).sort((a, b) => rank(a) - rank(b));
const chosen = new Set();
for (const r of candidates) {
  if (picked.length >= COUNT) break;
  const tr = chinese(r);
  if (tr.length === 1 && INFLECTION_ONLY.test(tr[0])) continue;
  picked.push(r); chosen.add(get(r, "word"));
}

/* word forms: from each kept word's own exchange field (p d i 3 r t s), and from rows whose 0: names a kept word */
const lemma = new Map();
const addForm = (form, base) => {
  if (!form || form === base || chosen.has(form) || !usable(form)) return;
  const k = form.toLowerCase(), cur = lemma.get(k) || [];
  if (!cur.includes(base)) cur.push(base);
  lemma.set(k, cur);
};
for (const r of picked) { const f = forms(r), w = get(r, "word"); for (const t of "pdi3rts") addForm(f[t], w); }
for (const r of rows) { const f = forms(r); if (f["0"] && chosen.has(f["0"])) addForm(get(r, "word"), f["0"]); }

const entries = picked.map((r) => {
  const en = lines(get(r, "definition")).slice(0, EN_LINES);
  return { word: get(r, "word"), text: chinese(r).join("\n") + (en.length ? "\n\n" + en.join("\n") : "") };
});
const sd = writeStarDict({
  bookname: "ECDICT",
  author: "skywind3000 (Linwei)",
  description: "ECDICT, abridged for Lo-PDA: " + entries.length + " common words. MIT License, https://github.com/skywind3000/ECDICT",
  entries, dictzip: true
});
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "ecdict.ifo"), sd.ifo);
writeFileSync(join(OUT, "ecdict.idx"), sd.idx);
writeFileSync(join(OUT, "ecdict.dict.dz"), sd.dictdz);
const lemmaText = [...lemma].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([f, b]) => f + "\t" + b.join("/")).join("\n") + "\n";
writeFileSync(join(OUT, "ecdict.lemma.gz"), gzipSync(lemmaText, { level: 9 }));
const kb = (b) => (b.length / 1024).toFixed(0) + " KB";
console.log(entries.length + " words, last rank " + rank(picked.at(-1)) + ", " + lemma.size + " word forms");
console.log("idx " + kb(sd.idx) + ", dict.dz " + kb(sd.dictdz) + ", lemma.gz " + kb(readFileSync(join(OUT, "ecdict.lemma.gz"))));
