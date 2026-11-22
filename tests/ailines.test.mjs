// runtime/ailines.js: the AI lines' state (decisions.md section 61). The upgrade from the single OpenRouter key (v:1)
// must never lose the key; a newer document is not read; ids are never reused; the line a program gets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const AI = runScript("runtime/ai.js", { TextDecoder, AbortController }).LopdaAI;
const L = runScript("runtime/ailines.js", {}).LopdaAiLines;
const P = AI.PROVIDERS;
const plain = (x) => JSON.parse(JSON.stringify(x));

test("a v1 document with a key becomes line l1 on OpenRouter, the default, with the score model as its vision model", () => {
  const st = L.load({ v: 1, key: "sk-or-abcd", model: "a/b", scoreModel: "x/vision" });
  assert.equal(st.lines.length, 1);
  assert.deepEqual(plain(st.lines[0]), { id: "l1", provider: "openrouter", n: 1, key: "sk-or-abcd", model: "a/b", visionModel: "x/vision", on: true, added: 0 });
  assert.equal(st.def, "l1");
  assert.equal(st.next, 2);
  assert.deepEqual(plain(st.use), {});
  assert.equal(L.modelFor(st, "score", st.lines[0], P, "dflt"), "x/vision");
  const doc = L.toDoc(st);
  assert.equal(doc.v, 2);
  /* the mirror fields: an older runtime still finds its key */
  assert.equal(doc.key, "sk-or-abcd");
  assert.equal(doc.model, "a/b");
  assert.equal(doc.scoreModel, "x/vision");
  /* reading the written document again gives the same state: the upgrade is idempotent */
  assert.deepEqual(plain(L.load(doc)), plain(st));
  assert.deepEqual(plain(L.toDoc(L.load(doc))), plain(doc));
});

test("a v1 document with only a score model makes no line and keeps the choice", () => {
  const st = L.load({ v: 1, key: "", model: "", scoreModel: "x/vision" });
  assert.equal(st.lines.length, 0);
  assert.equal(st.def, "");
  assert.deepEqual(plain(st.use), { score: { line: "", model: "x/vision" } });
  /* adding an OpenRouter line later picks the choice up */
  const l = L.add(st, "openrouter", "sk-or-1", "", 5);
  assert.equal(L.modelFor(st, "score", L.pick(st, "score", P), P, "dflt"), "x/vision");
  assert.equal(L.toDoc(st).scoreModel, "x/vision");
  assert.equal(l.visionModel, "x/vision");
  assert.deepEqual(plain(st.use), {});
  assert.equal(st.def, l.id);
});

test("a v2 document from before the vision field moves use.score.model onto its OpenRouter line", () => {
  const doc = { v: 2, next: 3, def: "l1", use: { score: { line: "l2", model: "x/see" }, pet: { line: "l1", model: "" } },
    lines: [{ id: "l1", provider: "deepseek", n: 1, key: "kd", model: "", on: true, added: 1 },
      { id: "l2", provider: "openrouter", n: 1, key: "ko", model: "", on: true, added: 2 }] };
  const st = L.load(doc);
  assert.equal(st.lines[1].visionModel, "x/see");
  assert.deepEqual(plain(st.use), { score: { line: "l2", model: "" }, pet: { line: "l1", model: "" } });
  assert.equal(st.lines[1].key, "ko");
  /* idempotent */
  assert.deepEqual(plain(L.load(L.toDoc(st))), plain(st));
});

test("vision models: the line's own, else the provider's; edit leaves it alone unless given", () => {
  const st = L.load(null);
  const k = L.add(st, "kimi", "kk", "", 1, "kimi-other");
  assert.equal(L.modelFor(st, "score", k, P, "dflt"), "kimi-other");
  assert.equal(L.modelFor(st, "studio", k, P, "dflt"), "");
  L.edit(st, k.id, "", "text-model");
  assert.equal(k.visionModel, "kimi-other");
  assert.equal(k.key, "kk");
  L.edit(st, k.id, "", "text-model", "");
  assert.equal(L.modelFor(st, "score", k, P, "dflt"), "kimi-k3.1-pro");
  assert.equal(L.modelFor(st, "scripts", k, P, "dflt"), "text-model");
});

test("no document, null, garbage: an empty state, nothing thrown", () => {
  for (const d of [null, undefined, "x", 5, [], { v: "?" }, { v: 2, lines: "no" }, { lines: [null, 3, { id: 1 }, { id: "l9" }] }]) {
    const st = L.load(d);
    assert.equal(st.lines.length, 0, JSON.stringify(d));
    assert.equal(st.newer, false);
  }
});

test("a document from a newer Lo-PDA is not read", () => {
  const st = L.load({ v: 3, lines: [{ id: "l1", provider: "deepseek", key: "k" }] });
  assert.equal(st.newer, true);
  assert.equal(st.lines.length, 0);
});

test("a v2 document keeps every line, even one whose provider this runtime does not know, and its extra fields", () => {
  const doc = { v: 2, next: 7, def: "l3", use: { scripts: { line: "l6", model: "" } },
    lines: [{ id: "l3", provider: "deepseek", n: 1, key: "sk-d", model: "", on: true, added: 1, last: { ok: true, at: 2 } },
      { id: "l6", provider: "future-ai", n: 1, key: "sk-f", model: "m", on: true, added: 3, colour: "red" }] };
  const st = L.load(doc);
  assert.equal(st.lines.length, 2);
  assert.equal(st.lines[1].colour, "red");
  assert.equal(st.next, 7);
  /* the unknown line is not usable: scripts falls back to the default */
  assert.equal(L.pick(st, "scripts", P).id, "l3");
  const back = L.toDoc(st);
  assert.deepEqual(plain(back.lines.map((l) => l.id)), ["l3", "l6"]);
  assert.equal(back.key, "");  /* no OpenRouter line: empty mirror */
});

test("next never goes below the highest id, so an id is never reused", () => {
  const st = L.load({ v: 2, next: 1, lines: [{ id: "l4", provider: "kimi", key: "k" }] });
  assert.equal(st.next, 5);
  L.remove(st, "l4");
  assert.equal(L.add(st, "kimi", "k2").id, "l5");
});

test("names: the second key of one provider is \"DeepSeek 2\", fixed when added", () => {
  const st = L.load(null);
  const a = L.add(st, "deepseek", "k1"), b = L.add(st, "deepseek", "k2"), q = L.add(st, "qwen", "k3");
  assert.deepEqual(plain([a, b, q].map((l) => L.name(l, P, "zh"))), ["DeepSeek", "DeepSeek 2", "通义千问"]);
  assert.equal(L.name(q, P, "en"), "Qwen");
  L.remove(st, a.id);
  assert.equal(L.name(b, P, "en"), "DeepSeek 2");
  assert.equal(L.name(L.add(st, "deepseek", "k4"), P, "en"), "DeepSeek 3");
});

test("the first line is the default; turning it off or deleting it moves the default to the first line that is on", () => {
  const st = L.load(null);
  const a = L.add(st, "deepseek", "k1"), b = L.add(st, "kimi", "k2");
  assert.equal(st.def, a.id);
  L.setOn(st, a.id, false);
  assert.equal(st.def, b.id);
  assert.equal(a.key, "k1", "off keeps the key");
  L.setOn(st, b.id, false);
  assert.equal(st.def, "");
  assert.equal(L.pick(st, "scripts", P), null);
  L.setOn(st, a.id, true);
  assert.equal(st.def, a.id);
  L.remove(st, a.id);
  assert.equal(st.def, "");
  assert.equal(st.lines.length, 1);
});

/* every provider in the table reads images today (2026-11-21); the rule is tested with one that cannot */
const BLIND = P.map((p) => (p.id === "deepseek" ? { ...p, vision: false, visionModel: "" } : p));

test("pick: a program's own line, else the default; score needs a line that can see", () => {
  const P = BLIND;
  const st = L.load(null);
  const d = L.add(st, "deepseek", "kd"), o = L.add(st, "openrouter", "ko"), k = L.add(st, "kimi", "kk");
  assert.equal(L.pick(st, "scripts", P).id, d.id);
  /* DeepSeek cannot see: score skips the default to the first line that can */
  assert.equal(L.pick(st, "score", P).id, o.id);
  L.choose(st, "score", k.id);
  assert.equal(L.pick(st, "score", P).id, k.id);
  assert.equal(L.modelFor(st, "score", k, P, "dflt"), "kimi-k3.1-pro");
  L.choose(st, "pet", o.id);
  assert.equal(L.pick(st, "pet", P).id, o.id);
  /* the chosen line turned off: back to the default */
  L.setOn(st, o.id, false);
  assert.equal(L.pick(st, "pet", P).id, d.id);
  /* score chosen on a line that cannot see: not used */
  L.choose(st, "score", d.id);
  assert.equal(L.pick(st, "score", P).id, k.id);
  /* only a DeepSeek line: nothing can read a score */
  const st2 = L.load(null); L.add(st2, "deepseek", "kd");
  assert.equal(L.pick(st2, "score", P), null);
  assert.equal(L.pick(st2, "studio", P).provider, "deepseek");
});

test("DeepSeek reads a score with its own model", () => {
  const st = L.load(null);
  const d = L.add(st, "deepseek", "kd");
  assert.equal(L.pick(st, "score", P).id, d.id);
  assert.equal(L.modelFor(st, "score", d, P, "dflt"), "deepseek-flash");
});

test("deleting a line drops its key, its models and every use entry that named it", () => {
  const st = L.load({ v: 1, key: "sk-or", scoreModel: "x/v" });
  const d = L.add(st, "deepseek", "kd");
  L.choose(st, "scripts", d.id); L.choose(st, "pet", "l1");
  L.remove(st, "l1");
  assert.deepEqual(plain(st.use), { scripts: { line: d.id, model: "" } });
  assert.ok(!JSON.stringify(L.toDoc(st)).includes("sk-or"));
  assert.ok(!JSON.stringify(L.toDoc(st)).includes("x/v"));
  L.remove(st, d.id);
  assert.deepEqual(plain(st.use), {});
});

test("mirror fields follow the first OpenRouter line that is on", () => {
  const st = L.load(null);
  L.add(st, "deepseek", "kd");
  const o1 = L.add(st, "openrouter", "k1", "m1"), o2 = L.add(st, "openrouter", "k2", "m2");
  assert.equal(L.toDoc(st).key, "k1");
  L.setOn(st, o1.id, false);
  assert.deepEqual([L.toDoc(st).key, L.toDoc(st).model], ["k2", "m2"]);
  L.setOn(st, o2.id, false);
  assert.equal(L.toDoc(st).key, "");
});

test("modelFor: the line's model, or empty for the provider default; OpenRouter score uses the line's vision model or the score default", () => {
  const st = L.load(null);
  const o = L.add(st, "openrouter", "k", "a/b");
  assert.equal(L.modelFor(st, "scripts", o, P, "dflt"), "a/b");
  assert.equal(L.modelFor(st, "score", o, P, "dflt"), "dflt");
  L.edit(st, o.id, "", "a/b", "x/v");
  assert.equal(L.modelFor(st, "score", o, P, "dflt"), "x/v");
  assert.equal(L.toDoc(st).scoreModel, "x/v");
  L.edit(st, o.id, "", "a/b", "");
  assert.equal(L.modelFor(st, "score", o, P, "dflt"), "dflt");
  const q = L.add(st, "qwen", "kq", "");
  assert.equal(L.modelFor(st, "pet", q, P, "dflt"), "");
});
