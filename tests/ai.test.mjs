// runtime/ai.js: the server-sent events split across pieces, the request it sends, the answer streamed in order, the
// failures it names (key, credit, busy, server, offline, timeout, empty, stopped). A fake fetch stands in for OpenRouter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const AI = runScript("runtime/ai.js", { TextDecoder, AbortController }).LopdaAI;
const enc = new TextEncoder();

/* a response whose body arrives in the given pieces; a piece that is null waits until the request is aborted */
function stream(pieces, signal) {
  let i = 0;
  return {
    ok: true, status: 200,
    body: { getReader: () => ({
      read() {
        if (i >= pieces.length) return Promise.resolve({ done: true });
        const p = pieces[i++];
        if (p === null) return new Promise((_, no) => signal.addEventListener("abort", () => no(new Error("aborted"))));
        return Promise.resolve({ done: false, value: enc.encode(p) });
      },
      cancel() {},
    }) },
  };
}
function event(o) { return "data: " + JSON.stringify(o) + "\n\n"; }
function piece(text, model) { return event({ model, choices: [{ delta: { content: text } }] }); }
/* a host whose fetch answers with `answer(url, opts)`; timers are manual unless real is asked for */
function host(answer) {
  const calls = [], timers = [];
  const h = AI.host({
    fetch: (url, opts) => { calls.push({ url, opts }); return answer(url, opts); },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].f = null; },
  });
  return { h, calls, timers };
}

test("lines() joins events split across pieces and skips comments", () => {
  const l = AI.lines();
  assert.deepEqual([...l.push(": OPENROUTER PROCESSING\n\nda")], []);
  assert.deepEqual([...l.push('ta: {"a":1}\r\n\ndata: [DO')], ['{"a":1}']);
  assert.deepEqual([...l.push("NE]\n")], ["[DONE]"]);
});

test("ask() sends one streaming request to OpenRouter with the key, and streams the answer in order", async () => {
  const { h, calls } = host((u, o) => stream([": PROCESSING\n\n", piece("<!doctype ", "x/model-1"), piece("html>").slice(0, 9), piece("html>").slice(9), "data: [DONE]\n\n", piece("never")], o.signal));
  const got = [], models = [];
  const all = await h.ask({ key: "sk-or-test", messages: [{ role: "user", content: "hi" }], onText: (p, a) => got.push([p, a]), onModel: (m) => models.push(m) });
  assert.equal(all, "<!doctype html>");
  assert.deepEqual(got, [["<!doctype ", "<!doctype "], ["html>", "<!doctype html>"]]);
  assert.deepEqual(models, ["x/model-1"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://openrouter.ai/api/v1/chat/completions");
  const o = calls[0].opts;
  assert.equal(o.method, "POST");
  assert.equal(o.credentials, "omit");
  assert.equal(o.headers.Authorization, "Bearer sk-or-test");
  assert.deepEqual(JSON.parse(o.body), { model: "openrouter/auto", messages: [{ role: "user", content: "hi" }], stream: true });
});

test("ask() uses the model and the token limit it is given", async () => {
  const { h, calls } = host((u, o) => stream([piece("OK")], o.signal));
  assert.equal(await h.ask({ key: "k", model: "a/b", max: 16, messages: [] }), "OK");
  assert.deepEqual(JSON.parse(calls[0].opts.body), { model: "a/b", messages: [], stream: true, max_tokens: 16 });
});

test("ask() without a key fails at once and sends nothing", async () => {
  const { h, calls } = host(() => assert.fail("no request"));
  await assert.rejects(h.ask({ key: "", messages: [] }), { code: "nokey" });
  assert.equal(calls.length, 0);
});

test("HTTP failures are named", async () => {
  for (const [status, code] of [[401, "key"], [403, "key"], [402, "credit"], [429, "busy"], [502, "server"], [400, "http"]]) {
    const { h } = host(() => Promise.resolve({ ok: false, status }));
    await assert.rejects(h.ask({ key: "k", messages: [] }), { code }, "HTTP " + status);
  }
});

test("an error event after the headers is named too", async () => {
  const { h } = host((u, o) => stream([piece("<html"), event({ error: { code: 402, message: "no credit" } })], o.signal));
  const got = [];
  await assert.rejects(h.ask({ key: "k", messages: [], onText: (p) => got.push(p) }), { code: "credit" });
  assert.deepEqual(got, ["<html"]);
});

test("no network is offline; an answer with no text is empty", async () => {
  const a = host(() => Promise.reject(new TypeError("Failed to fetch")));
  await assert.rejects(a.h.ask({ key: "k", messages: [] }), { code: "offline" });
  const b = host((u, o) => stream([": PROCESSING\n\n", "data: [DONE]\n\n"], o.signal));
  await assert.rejects(b.h.ask({ key: "k", messages: [] }), { code: "empty" });
});

test("stop() ends the answer as stopped, keeping what came in", async () => {
  const { h } = host((u, o) => stream([piece("<html>"), null], o.signal));
  const got = [];
  const p = h.ask({ key: "k", messages: [], onText: (x, all) => got.push(all) });
  await new Promise((r) => setTimeout(r, 10));
  p.stop();
  await assert.rejects(p, { code: "stopped" });
  assert.deepEqual(got, ["<html>"]);
});

test("a minute with nothing new hangs up as timeout", async () => {
  const { h, timers } = host((u, o) => stream([piece("<html>"), null], o.signal));
  const p = h.ask({ key: "k", messages: [] });
  await new Promise((r) => setTimeout(r, 10));
  const live = timers.filter((t) => t.f);
  assert.equal(live.length, 1);
  assert.equal(live[0].ms, AI.IDLE);
  live[0].f();
  await assert.rejects(p, { code: "timeout" });
});

test("every piece is a signal: the line opening, keep-alive comments, thinking, then writing", async () => {
  const think = (t) => event({ choices: [{ delta: { reasoning: t } }] });
  const { h } = host((u, o) => stream([": OPENROUTER PROCESSING\n\n", think("hmm, "), think("ok"), ": OPENROUTER PROCESSING\n\n", piece("<html>"), "data: [DONE]\n\n"], o.signal));
  const seen = [];
  assert.equal(await h.ask({ key: "k", messages: [], onSignal: (s) => seen.push(s.phase + " " + s.think + " " + s.text) }), "<html>");
  assert.deepEqual(seen, ["open 0 0", "open 0 0", "think 5 0", "think 7 0", "think 7 0", "write 7 6", "write 7 6"]);
});

test("an abort the browser reports as a DOMException (code 20) is still stopped", async () => {
  const { h } = host((u, o) => new Promise((_, no) => o.signal.addEventListener("abort", () => no(Object.assign(new Error("aborted"), { name: "AbortError", code: 20 })))));
  const p = h.ask({ key: "k", messages: [] });
  await new Promise((r) => setTimeout(r, 10));
  p.stop();
  await assert.rejects(p, { code: "stopped" });
});

/* the provider table: five addresses, each one its own key's only destination */

test("PROVIDERS lists the five providers, each with a chat completions address", () => {
  assert.deepEqual(Array.from(AI.PROVIDERS, (p) => p.id), ["openrouter", "deepseek", "kimi", "qwen", "siliconflow"]);
  for (const p of AI.PROVIDERS) {
    assert.match(p.url, /^https:\/\/.+\/chat\/completions$/, p.id);
    assert.equal(typeof p.keyHint, "string", p.id);
    assert.equal(typeof p.name.zh, "string", p.id);
    assert.equal(typeof p.name.en, "string", p.id);
    assert.equal(AI.provider(p.id), p);
  }
  assert.ok(AI.PROVIDERS.every((p) => p.vision), "all five read images (2026-11-21)");
  assert.equal(AI.provider("nope"), null);
});

test("ask() talks to each provider's own address with that provider's default model", async () => {
  for (const p of AI.PROVIDERS) {
    const think = (t) => event({ choices: [{ delta: { reasoning_content: t } }] });
    const { h, calls } = host((u, o) => stream([think("hmm"), piece("OK"), "data: [DONE]\n\n"], o.signal));
    const seen = [];
    assert.equal(await h.ask({ provider: p.id, key: "k", messages: [], onSignal: (s) => seen.push(s.phase + " " + s.think + " " + s.text) }), "OK", p.id);
    assert.equal(calls.length, 1, p.id);
    assert.equal(calls[0].url, p.url, p.id);
    assert.equal(calls[0].opts.headers.Authorization, "Bearer k", p.id);
    assert.equal(JSON.parse(calls[0].opts.body).model, p.model, p.id);
    assert.deepEqual(seen.slice(0, 3), ["open 0 0", "think 3 0", "write 3 2"], p.id);
  }
});

test("the model given wins over fallbackModel, which wins over the provider's default", async () => {
  const pick = async (o) => {
    const { h, calls } = host((u, opts) => stream([piece("OK")], opts.signal));
    assert.equal(await h.ask({ provider: "deepseek", key: "k", messages: [], ...o }), "OK");
    return JSON.parse(calls[0].opts.body).model;
  };
  assert.equal(await pick({ model: "a/b", fallbackModel: "c/d" }), "a/b");
  assert.equal(await pick({ fallbackModel: "c/d" }), "c/d");
  assert.equal(await pick({}), "deepseek-flash");
});

test("an unknown provider fails as http and sends nothing", async () => {
  const { h, calls } = host(() => assert.fail("no request"));
  await assert.rejects(h.ask({ provider: "nope", key: "k", messages: [] }), { code: "http" });
  assert.equal(calls.length, 0);
});

test("a url passed by the caller is ignored: the request goes to the provider's own address", async () => {
  const { h, calls } = host((u, o) => stream([piece("OK")], o.signal));
  assert.equal(await h.ask({ provider: "qwen", key: "k", messages: [], url: "https://evil.example/x" }), "OK");
  assert.equal(calls[0].url, AI.provider("qwen").url);
});

test("a documented balance answer is named credit, other failures keep their word", async () => {
  const failWith = (status, body) => host(() => Promise.resolve({ ok: false, status, text: () => Promise.resolve(JSON.stringify(body)) }));
  const cases = [
    ["kimi", 429, { error: { type: "exceeded_current_quota_error" } }, "credit"],
    ["kimi", 429, {}, "busy"],
    ["qwen", 403, { code: "Arrearage" }, "credit"],
    ["qwen", 403, {}, "key"],
  ];
  for (const [provider, status, body, code] of cases) {
    const { h } = failWith(status, body);
    await assert.rejects(h.ask({ provider, key: "k", messages: [] }), { code }, provider + " " + status);
  }
});
