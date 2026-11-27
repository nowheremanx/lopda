// registry/apps/photo-puzzle in a loose fake DOM (tests/dom-vm.mjs): the pause menu's size row says that it
// restarts, and at which size (#377), a hidden page pauses the arcade fuse like the menu (decisions.md section 30) and a
// burnt-out fuse ends the game instead of starting a free one (#380). The rest of the app is covered by tests/e2e-photo-puzzle.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";
import { bootDom } from "./dom-vm.mjs";

const APP = join(ROOT, "registry/apps/photo-puzzle/index.html");
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

for (const [lang, three, four] of [["zh", "重开 3×3", "重开 4×4"], ["en", "Restart 3×3", "Restart 4×4"]]) {
  test(`photo-puzzle: the pause menu names the restart and the other size (${lang})`, async () => {
    const on = {}, data = { game: { v: 1, n: 3, moves: 7, tiles: [0, 1, 2, 3, 8, 5, 6, 4, 7], src: "builtin", picKey: "lake" } };
    const pad = {
      lang, spec: "lopda/1", on: (t, f) => { (on[t] = on[t] || []).push(f); }, off() {}, isDown: () => false,
      load: (k) => Promise.resolve(k in data ? JSON.parse(JSON.stringify(data[k])) : null),
      save: (k, v) => { data[k] = v; }, remove: (k) => { delete data[k]; }, exit() {}, sfx() {}
    };
    const t = bootDom(APP, { pad, seed: 4 });
    const press = (b) => { (on.press || []).forEach((f) => f(b)); (on.release || []).forEach((f) => f(b)); t.advance(50); };
    await settle();
    const P = () => t.get("window").PUZZLE.state();
    assert.equal(P().screen, "title");
    press("a");                                     /* 继续 */
    t.advance(2000);
    assert.equal(P().screen, "play");
    press("start");
    assert.equal(P().screen, "menu");
    assert.ok(P().items.includes(four), `menu: ${JSON.stringify(P().items)}`);
    assert.ok(!P().items.includes(three));
  });
}

function arcade(left) {
  const on = {}, data = { game: { v: 1, n: 3, moves: 7, tiles: [0, 1, 2, 3, 8, 5, 6, 4, 7], src: "builtin", picKey: "lake", arcade: true, left } };
  const pad = {
    lang: "en", spec: "lopda/1", on: (t, f) => { (on[t] = on[t] || []).push(f); }, off() {}, isDown: () => false,
    load: (k) => Promise.resolve(k in data ? JSON.parse(JSON.stringify(data[k])) : null),
    save: (k, v) => { data[k] = JSON.parse(JSON.stringify(v)); }, remove: (k) => { delete data[k]; }, exit() {}, sfx() {}
  };
  const t = bootDom(APP, { pad, seed: 4 });
  const press = (b) => { (on.press || []).forEach((f) => f(b)); (on.release || []).forEach((f) => f(b)); t.advance(50); };
  return { t, data, press, P: () => t.get("window").PUZZLE.state() };
}

test("photo-puzzle: hiding the page pauses the arcade fuse like the menu, and saves what is left (decisions.md 30)", async () => {
  const a = arcade(30);
  await settle();
  a.t.advance(1000);                              /* the fake clock starts at 0, which the app reads as "no clock" */
  a.press("a");                                   /* Continue */
  a.t.advance(2000);
  assert.equal(a.P().screen, "play");
  a.t.advance(1000);
  a.t.hide(true);
  const left = a.P().left;
  assert.ok(left < 30 && left > 25, `left ${left}`);
  assert.equal(a.data.game.left, left, "saved as it was when the page went away");
  a.t.advance(5000);
  a.t.hide(false);
  assert.equal(a.P().left, left, "the time away is not counted");
});

test("photo-puzzle: an arcade game whose fuse burnt down is time up when continued, never a fresh fuse", async () => {
  const a = arcade(0);
  await settle();
  assert.equal(a.P().screen, "title", "the save is still offered");
  assert.equal(a.P().left, 0, "not filled back to the full time");
  a.press("a");
  a.t.advance(2000);
  assert.equal(a.P().screen, "lost");
  assert.equal(a.data.game, undefined, "the lost game is dropped");
});
