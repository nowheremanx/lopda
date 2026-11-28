// 打地鼠 / whack-a-mole: the fixed 120 x 150 field grows into a whole stage (UI.md 13) and the overlay is the
// stage, not a box inside the canvas. The layout is pure, so the coverage numbers run without a browser; the
// pad's cursor and A/B run the app's own handlers (tests/dom-vm.mjs). The browser checks are
// tests/e2e-whack-a-mole.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { read, ROOT } from "./helpers.mjs";
import { bootDom } from "./dom-vm.mjs";

const APP = join(ROOT, "registry/apps/whack-a-mole/index.html");
const SIZES = [[331, 359], [346, 518], [386, 650], [386, 606], [348, 323], [386, 738], [1200, 800]];

function bootApp() {
  const listeners = {};
  const pad = {
    lang: "zh",
    on(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    off() {}, isDown() { return false; }, sfx() {}, exit() {},
    load() { return Promise.resolve(null); }, save() {}, remove() {}
  };
  const t = bootDom(APP, { pad, seed: 7 });
  const state = () => t.get("window").__mole();
  const press = (b) => (listeners.press || []).forEach((f) => f(b));
  return { t, state, press, advance: t.advance };
}

test("whack-a-mole: the canvas covers every stage, with the field still 120 x 150", () => {
  const { t } = bootApp();
  const layout = t.get("window").__moleLayout;
  assert.equal(typeof layout, "function");
  for (const [w, h] of SIZES) {
    const L = layout(w, h), tag = `${w}x${h}`;
    assert.equal(L.fw, 120, `${tag}: the field keeps its width`);
    assert.equal(L.fh, 150, `${tag}: the field keeps its height`);
    assert.ok(L.W * L.k >= w - 1e-9, `${tag}: ${L.W * L.k} does not reach ${w} across`);
    assert.ok(L.H * L.k >= h - 1e-9, `${tag}: ${L.H * L.k} does not reach ${h} down`);
    assert.ok(L.W * L.k - w < L.k + 1e-9, `${tag}: more than one canvas pixel of paper to the right`);
    assert.ok(L.H * L.k - h < L.k + 1e-9, `${tag}: more than one canvas pixel of paper below`);
    assert.ok(L.hud >= 22, `${tag}: no sky band for the scoreboard`);
    assert.ok(L.dirt === 0 || L.dirt >= 24, `${tag}: a soil band too thin to hold roots`);
    assert.ok(Math.abs(L.W - 120 - L.x0 - L.x0) <= 1, `${tag}: the field is not centred`);
    assert.equal(L.slim, L.hud < 44, `${tag}: slim means under 44 rows`);
  }
});

test("whack-a-mole: the overlay is the stage, and the HTML HUD and canvas frame are gone", () => {
  const html = read("registry/apps/whack-a-mole/index.html");
  assert.ok(!/id="hud"/.test(html), "no HTML HUD row");
  assert.ok(/id="ovbody"/.test(html) && /id="ovhint"/.test(html), "the overlay has a scrolling body and a key hint");
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  const rule = (sel) => {
    const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}").exec(css);
    return m ? m[1] : "";
  };
  assert.match(rule("#stage"), /position:\s*absolute/, "the stage is the app box");
  assert.match(rule("#stage"), /inset:\s*0/);
  assert.match(rule("#ov"), /position:\s*absolute/);
  assert.match(rule("#ov"), /inset:\s*0/, "the overlay covers the stage, not the canvas box");
  assert.ok(!/canvas\s*\{[^}]*border/.test(css), "no 3 px frame around the canvas");
});

test("whack-a-mole: arrows move an inverted cursor by row, A confirms, B goes back", () => {
  const { state, press, advance } = bootApp();
  assert.deepEqual([state().screen, state().sel], ["title", 0]);

  press("right");
  assert.equal(state().sel, 1, "Right moves along the mode row");
  press("down");
  assert.equal(state().sel, 2, "Down lands on the full-width 无尽");
  press("left");
  assert.equal(state().sel, 2, "a one-cell row stops Left");
  press("up");
  assert.equal(state().sel, 0);
  press("start");
  assert.equal(state().screen, "title", "START has no extra job here");
  press("b");
  assert.equal(state().screen, "title", "B on the title has nowhere to go");

  press("a");
  assert.equal(state().screen, "levels", "A on 闯关 opens the grid");
  advance(400);
  press("down");
  assert.equal(state().sel, 5, "Down moves a row in the 5-column grid, same column");
  press("right");
  assert.equal(state().sel, 6);
  press("b");
  assert.equal(state().screen, "title", "B returns from the grid");
  advance(400);

  press("right");
  press("a");
  assert.equal(state().screen, "play", "A on 60 秒 starts a game");
  assert.equal(state().mode, "60");
  assert.equal(state().playing, true);
  press("b");
  assert.equal(state().playing, true, "B does not end a game in progress");
});
