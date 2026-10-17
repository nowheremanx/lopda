// runtime/speech.js: the voice for zh and en, the volume, PAD.say's limits (200 characters, once a second), a new call
// stopping the old one, and stop() for HOME and a hidden page. A fake speechSynthesis stands in for the phone's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const SP = runScript("runtime/speech.js", {}).LopdaSpeech;

const VOICES = [
  { name: "Mei-Jia", lang: "zh-TW" }, { name: "Sin-ji", lang: "zh-HK" }, { name: "Tingting", lang: "zh-CN" },
  { name: "Daniel", lang: "en-GB" }, { name: "Karen", lang: "en_AU" }, { name: "Thomas", lang: "fr-FR" },
];
/* a phone: speak() starts at once and ends when the test says; cancel() interrupts what is speaking */
function phone({ voices = VOICES, volume = 0.42, starts = true } = {}) {
  let t = 1000, id = 0;
  const timers = new Map(), spoken = [], events = [];
  let speaking = null;
  const synth = {
    getVoices: () => voices,
    speak(u) {
      spoken.push(u);
      speaking = u;
      if (starts && u.onstart) u.onstart();
    },
    cancel() {
      events.push("cancel");
      const u = speaking; speaking = null;
      if (u && u.onerror) u.onerror({ error: "interrupted" });
    },
  };
  function Utterance(text) { this.text = text; }
  const env = {
    window: { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance },
    volume: () => env.vol,
    vol: volume,
    now: () => t,
    setTimeout: (f, ms) => { timers.set(++id, { f, at: t + ms }); return id; },
    clearTimeout: (i) => timers.delete(i),
  };
  const host = SP.host(env);
  return {
    host, env, spoken, events,
    end() { const u = speaking; speaking = null; if (u) u.onend(); },
    advance(ms) {
      t += ms;
      for (const [i, x] of [...timers]) if (x.at <= t) { timers.delete(i); x.f(); }
    },
  };
}

test("speech: the voice for zh is zh-CN before zh-TW and zh-HK; for en en-US or en-GB first; none for other languages", () => {
  assert.equal(SP.pick(VOICES, "zh").name, "Tingting");
  assert.equal(SP.pick(VOICES, "en").name, "Daniel");
  assert.equal(SP.pick([{ lang: "en_AU" }, { lang: "zh-TW" }], "en").lang, "en_AU", "any en voice when there is no US or GB one");
  assert.equal(SP.pick([{ lang: "zh-HK" }], "zh").lang, "zh-HK");
  assert.equal(SP.pick(VOICES.filter((v) => !/^zh/.test(v.lang)), "zh"), null);
  assert.equal(SP.pick([], "en"), null);
  assert.equal(SP.cut("x".repeat(300)).length, 200);
});

test("speech: say speaks with the voice, the language and the volume, and resolves done when it ends", async () => {
  const p = phone();
  const r = p.host.say("maze", "你好", "zh");
  const u = p.spoken[0];
  assert.equal(u.text, "你好");
  assert.equal(u.voice.name, "Tingting");
  assert.equal(u.lang, "zh-CN");
  assert.equal(u.volume, 0.42);
  assert.equal(p.host.speaking(), true);
  p.end();
  assert.equal(await r, "done");
  assert.equal(p.host.speaking(), false);
  p.advance(1000);
  const r2 = p.host.say("maze", "hello", "en");
  assert.equal(p.spoken[1].voice.name, "Daniel");
  p.end();
  assert.equal(await r2, "done");
});

test("speech: volume 0, no voice for the language, or no speechSynthesis is unavailable, silently", async () => {
  const p = phone({ volume: 0 });
  assert.equal(await p.host.say("a", "hi", "en"), "unavailable");
  assert.equal(p.spoken.length, 0);
  const q = phone({ voices: [{ lang: "en-US" }] });
  assert.equal(await q.host.say("a", "你好", "zh"), "unavailable");
  assert.equal(q.spoken.length, 0);
  const none = SP.host({ window: {}, volume: () => 1 });
  assert.equal(await none.say("a", "hi", "en"), "unavailable");
  assert.equal(none.voice("en"), null);
});

test("speech: once a second per app; the extra calls are unavailable and speak nothing; another app has its own second", async () => {
  const p = phone();
  const first = p.host.say("a", "one", "en");
  assert.equal(await p.host.say("a", "two", "en"), "unavailable");
  p.advance(999);
  assert.equal(await p.host.say("a", "three", "en"), "unavailable");
  assert.equal(p.spoken.length, 1);
  p.advance(1);
  const fourth = p.host.say("a", "four", "en");
  assert.equal(await first, "stopped", "the new call stops the old one");
  assert.deepEqual(p.spoken.map((u) => u.text), ["one", "four"]);
  const other = p.host.say("b", "five", "en");
  assert.equal(await fourth, "stopped");
  p.end();
  assert.equal(await other, "done");
});

test("speech: at most 200 characters; empty text is done at once", async () => {
  const p = phone();
  p.host.say("a", "字".repeat(250), "zh");
  assert.equal(p.spoken[0].text, "字".repeat(200));
  p.advance(1000);
  assert.equal(await p.host.say("a", "  ", "zh"), "done");
});

test("speech: stop() (HOME, another app, the page hidden) settles it stopped and cancels; nothing to stop is fine", async () => {
  const p = phone();
  const r = p.host.say("a", "a long sentence", "en");
  p.host.stop();
  assert.equal(await r, "stopped");
  assert.ok(p.events.includes("cancel"));
  assert.equal(p.host.speaking(), false);
  p.host.stop();
});

test("speech: a phone that never starts (no tap on iOS) gives up after 3 seconds: unavailable, not a promise that hangs", async () => {
  const p = phone({ starts: false });
  const r = p.host.say("a", "hi", "en");
  p.advance(SP.START_WAIT);
  assert.equal(await r, "unavailable");
  assert.equal(p.host.speaking(), false);
  /* one that starts is not timed out, however long it speaks */
  const q = phone();
  const r2 = q.host.say("a", "hi", "en");
  q.advance(10000);
  assert.equal(q.host.speaking(), true);
  q.end();
  assert.equal(await r2, "done");
});

test("speech: an error from the phone that is not an interruption is unavailable", async () => {
  const p = phone();
  const r = p.host.say("a", "hi", "en");
  p.spoken[0].onerror({ error: "synthesis-failed" });
  assert.equal(await r, "unavailable");
});
