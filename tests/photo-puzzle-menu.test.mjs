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

function boot(data, lang = "en") {
  const on = {};
  const pad = {
    lang, spec: "lopda/1", on: (t, f) => { (on[t] = on[t] || []).push(f); }, off() {}, isDown: () => false,
    load: (k) => Promise.resolve(k in data ? JSON.parse(JSON.stringify(data[k])) : null),
    save: (k, v) => { data[k] = JSON.parse(JSON.stringify(v)); }, remove: (k) => { delete data[k]; }, exit() {}, sfx() {}
  };
  const t = bootDom(APP, { pad, seed: 4 });
  const press = (b) => { (on.press || []).forEach((f) => f(b)); (on.release || []).forEach((f) => f(b)); t.advance(50); };
  return { t, data, press, P: () => t.get("window").PUZZLE.state() };
}

test("photo-puzzle: the main menu says a game is kept and that B goes back to it (#378)", async () => {
  const a = boot({ game: { v: 1, n: 3, moves: 7, tiles: [0, 1, 2, 3, 8, 5, 6, 4, 7], src: "builtin", picKey: "lake" } });
  await settle();
  assert.equal(a.P().screen, "title");
  a.press("b");
  assert.equal(a.P().screen, "main");
  assert.match(a.P().msg, /last puzzle is kept/);
  assert.match(a.P().ft, /B last puzzle/);
  a.press("b");
  assert.equal(a.P().screen, "title");
});

test("photo-puzzle: time up counts pieces out of n×n − 1, shows the arcade best, and B leaves for the main menu (#381, #382)", async () => {
  const a = boot({ game: { v: 1, n: 3, moves: 7, tiles: [0, 1, 2, 3, 8, 5, 6, 4, 7], src: "builtin", picKey: "lake", arcade: true, left: 0 },
    puzzle: { best: {}, time: { 3: 90 }, arcade: true, n: 3 } });
  await settle();
  a.t.advance(1000);
  a.press("a");
  a.t.advance(2000);
  assert.equal(a.P().screen, "lost");
  assert.equal(a.P().msg, "Time up. 6/8 in place. Best: 1:30 left.");
  a.press("b");
  assert.equal(a.P().screen, "main");
  assert.match(a.t.get("document").getElementById("info").textContent, /Arcade {2}best 1:30/);
});

test("photo-puzzle: a key does not end lesson 4's demo; START leaves it and 继续 plays it again; it can be watched again (#383)", async () => {
  const a = boot({}, "zh");
  await settle();
  a.t.advance(1000);
  if (a.P().screen === "title") a.press("a");
  assert.equal(a.P().screen, "main");
  assert.equal(a.P().items.indexOf("怎么玩"), 3);
  a.press("down"); a.press("right");                /* a 2×2 grid: 怎么玩 is bottom right */
  a.press("a");
  a.t.advance(700);
  /* lessons 1-3: follow the hint's marked piece into the gap */
  for (let guard = 0; a.P().lesson < 3 && guard < 400; guard++) {
    const s = a.P();
    if (s.lessonDone) { a.press("a"); a.t.advance(700); continue; }
    if (!s.hint) { a.press("select"); continue; }
    const { p, gap } = s.hintAt, n = s.n;
    a.press(p === gap + n ? "up" : p === gap - n ? "down" : p === gap + 1 ? "left" : "right");
    a.t.advance(300);
  }
  assert.equal(a.P().lesson, 3);
  a.t.advance(700);
  assert.equal(a.P().demo, true, "the demo runs");
  assert.equal(a.P().ft, "START 退出");
  a.press("up"); a.press("a");
  a.t.advance(400);
  assert.deepEqual([a.P().demo, a.P().lessonDone], [true, false], "keys do not stop it or count it as watched");
  a.press("start");
  assert.equal(a.P().screen, "menu");
  a.press("a");                                   /* 继续 */
  assert.deepEqual([a.P().screen, a.P().moves], ["lesson", 0], "back at the start of the demo");
  a.t.advance(30000);
  assert.equal(a.P().lessonDone, true);
  assert.deepEqual(a.P().items, ["回主菜单", "再看一遍"]);
  a.press("right"); a.press("a");
  assert.deepEqual([a.P().lesson, a.P().lessonDone, a.P().moves], [3, false, 0], "再看一遍 starts lesson 4 again");
});
