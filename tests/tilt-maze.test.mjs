// registry/apps/tilt-maze: every level is a rectangular, solvable maze, the game boots and draws,
// and a save from 1.1.0 (best 7) still offers the last level.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot } from "./app-vm.mjs";

function bootApp(store = {}) {
  const listeners = {};
  const pad = {
    lang: "zh",
    save(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    load(k) { return Promise.resolve(store[k] == null ? null : JSON.parse(JSON.stringify(store[k]))); },
    remove(k) { delete store[k]; },
    sfx() {},
    on(t, fn) { (listeners[t] ||= []).push(fn); },
    off() {}, isDown() { return false; }
  };
  const app = boot("registry/apps/tilt-maze/index.html", { pad, seed: 7 });
  const tick = async (n = 1) => {
    for (let i = 0; i < n; i++) { app.frame(); await new Promise((r) => setImmediate(r)); }
  };
  const press = async (b) => {
    (listeners.press || []).forEach((f) => f(b)); await tick(2);
    (listeners.release || []).forEach((f) => f(b)); await tick(1);
  };
  return { app, store, tick, press };
}

function reachable(map, sx, sy, gx, gy) {
  const seen = new Set([`${sx},${sy}`]);
  const queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.pop();
    if (x === gx && y === gy) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || ny >= map.length || nx >= map[0].length || seen.has(k)) continue;
      const ch = map[ny][nx];
      if (ch === "#" || ch === "O") continue;
      seen.add(k); queue.push([nx, ny]);
    }
  }
  return false;
}

test("the eight levels are rectangular, have one start and one goal, and the goal is reachable", async () => {
  const { app, tick } = bootApp();
  await tick(2);
  const LEVELS = app.ctx.get("LEVELS");
  const ROWS = app.ctx.get("ROWS"), COLS = app.ctx.get("COLS");
  assert.equal(LEVELS.length, 8);
  assert.equal(ROWS, 18);
  assert.equal(COLS, 20);
  LEVELS.forEach((level, i) => {
    assert.ok(level.name && level.name.zh && level.name.en, `level ${i + 1} has a name in both languages`);
    assert.equal(level.map.length, ROWS, `level ${i + 1} has ${ROWS} rows`);
    const starts = [], goals = [];
    level.map.forEach((row, y) => {
      assert.equal(row.length, COLS, `level ${i + 1} row ${y} has ${COLS} columns`);
      [...row].forEach((ch, x) => {
        assert.ok("#.OSG".includes(ch), `level ${i + 1} row ${y}: unexpected tile "${ch}"`);
        if (ch === "S") starts.push([x, y]);
        if (ch === "G") goals.push([x, y]);
      });
    });
    assert.equal(starts.length, 1, `level ${i + 1} has one start`);
    assert.equal(goals.length, 1, `level ${i + 1} has one goal`);
    assert.ok(reachable(level.map, starts[0][0], starts[0][1], goals[0][0], goals[0][1]),
      `level ${i + 1} (${level.name.en}) is solvable`);
  });
  /* the bonus room keeps its shuffled holes */
  assert.ok(LEVELS[LEVELS.length - 1].holes > 0, "the last level still shuffles its holes");
});

test("the app boots to the title, starts level 1 and draws frames", async () => {
  const { app, tick, press } = bootApp();
  await tick(6);
  assert.ok(app.hashes.length > 0, "the title draws");
  await press("a");
  await tick(70);
  assert.equal(app.ctx.get("level"), 0);
  assert.equal(app.ctx.get("state"), "roll");
  assert.ok(app.ctx.get("M"), "level 1 has a map");
  assert.ok(app.hashes.length > 60, "the play scene draws");
});

test("a 1.1.0 save with best 7 loads and the level select offers level 8", async () => {
  const { app, store, tick, press } = bootApp({ best: 7 });
  await tick(8);
  assert.equal(app.ctx.get("best"), 7);
  assert.equal(app.ctx.get("sel"), 7, "the picker sits on level 8");
  assert.equal(store.best, 7, "loading does not rewrite the save");
  await press("a");
  await tick(80);
  assert.equal(app.ctx.get("level"), 7, "A starts level 8");
  assert.equal(app.ctx.get("state"), "roll");
});
