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
