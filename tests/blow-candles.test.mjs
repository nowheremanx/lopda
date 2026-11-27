// sdk/examples/blow-candles (in the store until 1.7, decisions.md section 75): the title follows the play mode, the best score is kept from any
// round (not only the bonus), and the flames lean by the air each candle gets, the aim cue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot } from "./app-vm.mjs";

const APP = "sdk/examples/blow-candles/index.html";
const MIC_CAP = "对着话筒吹灭蜡烛";
const KEY_CAP = "按住 A 吹灭蜡烛";

/* a fake PAD: the microphone, a save store, and the button and sound listeners kept for the test */
function makePad(store = {}, hooks = {}) {
  const listeners = (hooks.listeners = {});
  return {
    lang: "zh",
    mic: {
      start() { hooks.live = true; return Promise.resolve("on"); },
      stop() { hooks.live = false; }
    },
    save(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    load(k) { return Promise.resolve(store[k] == null ? null : JSON.parse(JSON.stringify(store[k]))); },
    remove(k) { delete store[k]; },
    sfx() {}, ambience() {},
    on(t, fn) { (listeners[t] ||= []).push(fn); },
    off() {},
    isDown() { return false; }
  };
}

const flush = () => new Promise((r) => setImmediate(r));
const run = async (app, n = 1) => { for (let i = 0; i < n; i++) { app.frame(); await flush(); } };
const down = (listeners, b) => (listeners.press || []).forEach((f) => f(b));
const up = (listeners, b) => (listeners.release || []).forEach((f) => f(b));
async function press(app, listeners, b) { down(listeners, b); await run(app, 2); up(listeners, b); await run(app, 1); }

/* title -> round 1 playing (the fade, then the 1.6 s ready pause) */
async function toPlay(app, listeners) {
  await run(app, 6);                                  /* the saves load on a microtask */
  await press(app, listeners, "a");
  await run(app, 150);
  const R = app.ctx.get("R");
  assert.ok(R, "a round exists");
  assert.equal(R.phase, "play");
  return R;
}

test("the title caption follows the play mode", async () => {
  /* keys mode from the save: the keys line, centred, and no mic icon */
  const keysPad = makePad({ mode: "keys" });
  const keys = boot(APP, { pad: keysPad, seed: 1 });
  const game = keys.ctx.get("game");
  const ICON = keys.ctx.get("ICON");
  const texts = [];
  let micIcons = 0;
  const drawText = game.g.text, drawSprite = game.g.sprite;
  game.g.text = function (s, x, y, o) { texts.push(String(s)); return drawText.call(game.g, s, x, y, o); };
  game.g.sprite = function (s, x, y, o) { if (s === ICON.mic) micIcons++; return drawSprite.call(game.g, s, x, y, o); };
  await run(keys, 6);
  assert.equal(keys.ctx.get("mode"), "keys");
  assert.ok(texts.includes(KEY_CAP), "the keys caption is drawn");
  assert.ok(!texts.includes(MIC_CAP), "the mic caption is not drawn");
  assert.equal(micIcons, 0, "no mic icon beside it");

  /* mic mode: the mic line and its icon */
  const micPad = makePad({ mode: "mic" });
  const mic = boot(APP, { pad: micPad, seed: 1 });
  const game2 = mic.ctx.get("game"), ICON2 = mic.ctx.get("ICON");
  const texts2 = [];
  let micIcons2 = 0;
  const drawText2 = game2.g.text, drawSprite2 = game2.g.sprite;
  game2.g.text = function (s, x, y, o) { texts2.push(String(s)); return drawText2.call(game2.g, s, x, y, o); };
  game2.g.sprite = function (s, x, y, o) { if (s === ICON2.mic) micIcons2++; return drawSprite2.call(game2.g, s, x, y, o); };
  await run(mic, 6);
  assert.equal(mic.ctx.get("mode"), "mic");
  assert.ok(texts2.includes(MIC_CAP), "the mic caption is drawn");
  assert.ok(!texts2.includes(KEY_CAP), "the keys caption is not drawn");
  assert.ok(micIcons2 > 0, "the mic icon is beside it");
});

test("the best score is saved when round 1 ends, with no bonus round played", async () => {
  const store = {}, hooks = {};
  const app = boot(APP, { pad: makePad(store, hooks), seed: 2 });
  const R = await toPlay(app, hooks.listeners);
  assert.equal(R.i, 0);
  assert.equal(R.bonus, false);
  assert.equal(store.best, undefined, "nothing saved before a round ends");

  down(hooks.listeners, "a");                         /* keys mode: hold A until the candles are out */
  for (let i = 0; i < 400 && app.ctx.get("R").phase !== "done"; i++) await run(app, 1);
  up(hooks.listeners, "a");
  const end = app.ctx.get("R");
  assert.equal(end.phase, "done");
  assert.equal(end.bonus, false, "the bonus round was never reached");
  const score = app.ctx.get("score");
  assert.ok(score > 0, "the round scored");
  assert.equal(store.best, score, "the running score is kept as best");
});

test("the aim cue: a weak breath leans the outer flames less than the middle one", async () => {
  const store = { mode: "keys" }, hooks = {};
  const app = boot(APP, { pad: makePad(store, hooks), seed: 3 });
  await toPlay(app, hooks.listeners);

  down(hooks.listeners, "a");
  await run(app, 14);                                 /* a short puff: loud enough to be seen, not to reach the ends */
  const R = app.ctx.get("R");
  assert.equal(R.phase, "play", "the round is still running");
  assert.ok(R.wind > 0.15 && R.wind < 0.6, `a weak breath (wind ${R.wind})`);

  const mid = Math.floor((R.c.length - 1) / 2);
  const lean = (k) => Math.abs(R.c[k].lean);
  assert.ok(lean(mid) > 0, "the middle flame leans");
  assert.ok(lean(mid) > lean(0), `middle ${lean(mid)} vs left end ${lean(0)}`);
  assert.ok(lean(mid) > lean(R.c.length - 1), `middle ${lean(mid)} vs right end ${lean(R.c.length - 1)}`);
  up(hooks.listeners, "a");
});
