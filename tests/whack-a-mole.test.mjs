// 打地鼠 / whack-a-mole: the fixed 120 x 150 field grows into a whole stage (UI.md 13) and the overlay is the
// stage, not a box inside the canvas. The layout is pure, so the coverage numbers run without a browser; the
// touch cursor runs the app's own click handlers (tests/dom-vm.mjs). The browser checks are
// tests/e2e-whack-a-mole.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { read, ROOT } from "./helpers.mjs";
import { bootDom } from "./dom-vm.mjs";

const APP = join(ROOT, "registry/apps/whack-a-mole/index.html");
const SIZES = [[331, 359], [331, 473], [346, 518], [346, 650], [386, 650], [386, 606], [348, 323], [386, 738], [1200, 800]];

function bootApp() {
  const pad = {
    lang: "zh",
    on() {}, off() {}, isDown() { return false; }, sfx() {}, exit() {},
    load() { return Promise.resolve(null); }, save() {}, remove() {}
  };
  const t = bootDom(APP, { pad, seed: 7 });
  return { t, state: () => t.get("window").__mole(), advance: t.advance };
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
  assert.ok(/id="ovbody"/.test(html), "the overlay scrolls its body");
  assert.ok(!/id="ovhint"/.test(html), "no key hint: the app is touch-only");
  assert.ok(!/PAD\.on\(/.test(html), "no pad keys to name");
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

test("whack-a-mole: a touch selects the row, visible inverted, and acts on it", () => {
  const { t, state } = bootApp();
  const buttons = () => t.els.btns.children;
  assert.deepEqual([state().screen, state().sel], ["title", 0]);
  assert.ok(buttons()[0].classList.contains("sel"), "the first row starts selected");
  buttons()[1].listeners.click[0]();
  assert.equal(state().sel, 1, "the touched row becomes the selected one");
  assert.equal(state().screen, "play");
  assert.equal(state().mode, "60");
  assert.equal(state().playing, true);
});
