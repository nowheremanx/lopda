// The row-by-row solver of registry/apps/photo-puzzle: a thousand shuffled boards each, every step legal, every board
// finished, and no plan longer than the limit the design promises. Seeded, so a failure can be replayed exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read } from "./helpers.mjs";

const rel = "registry/apps/photo-puzzle/src/solver.js";
const ctx = vm.createContext({});
vm.runInContext(read(rel), ctx, { filename: rel });
const Solver = ctx.Solver;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* the app's own shuffle: legal moves only, never straight back, at least 80/200 of them */
function shuffle(n, rand) {
  const N = n * n, tiles = [], gap = { at: N - 1 };
  for (let i = 0; i < N; i++) tiles.push(i);
  const neigh = (g) => {
    const r = Math.floor(g / n), c = g % n, out = [];
    if (r > 0) out.push(g - n);
    if (r < n - 1) out.push(g + n);
    if (c > 0) out.push(g - 1);
    if (c < n - 1) out.push(g + 1);
    return out;
  };
  const solved = () => tiles.every((t, i) => t === i);
  let back = -1;
  const steps = n === 3 ? 80 : 200;
  for (let k = 0; k < steps || solved(); k++) {
    const opts = neigh(gap.at).filter((p) => p !== back);
    const p = opts[Math.floor(rand() * opts.length)];
    back = gap.at;
    tiles[gap.at] = tiles[p];
    tiles[p] = N - 1;
    gap.at = p;
  }
  return tiles;
}

/* play a plan on a board; throws on a step that is not a slide into the gap */
function play(n, tiles, plan) {
  const t = tiles.slice(), N = n * n;
  for (const step of plan) {
    const gap = t.indexOf(N - 1);
    const r = Math.floor(gap / n), c = gap % n;
    const near = [gap - n, gap + n, gap - 1, gap + 1];
    const rr = Math.floor(step.p / n), cc = step.p % n;
    assert.ok(Math.abs(rr - r) + Math.abs(cc - c) === 1 && near.includes(step.p), `step ${step.p} is not next to the gap ${gap}`);
    t[gap] = t[step.p];
    t[step.p] = N - 1;
  }
  return t;
}

for (const [n, limit] of [[3, 60], [4, 140]]) {
  test(`photo puzzle solver: 1000 ${n}×${n} boards, every one solved, no plan over ${limit} steps`, () => {
    const rand = mulberry32(20261018 + n);
    let total = 0, most = 0;
    for (let i = 0; i < 1000; i++) {
      const tiles = shuffle(n, rand);
      const plan = Solver.solve(n, tiles);
      assert.ok(plan, `board ${i} had no plan: ${tiles.join("")}`);
      const last = play(n, tiles, plan);
      assert.deepEqual(last, Array.from({ length: n * n }, (_, k) => k), `board ${i} did not finish`);
      total += plan.length;
      most = Math.max(most, plan.length);
      assert.ok(plan.length <= limit, `board ${i} took ${plan.length} steps (limit ${limit}): ${tiles.join("")}`);
      for (let k = 1; k < plan.length; k++) assert.ok(plan[k].stage >= plan[k - 1].stage, "stages go backwards");
    }
    assert.ok(total / 1000 >= 20, "plans are suspiciously short");
    assert.ok(most >= 40, "plans are suspiciously short");
  });
}

test("photo puzzle solver: the tutorial's fixed boards can be finished, and their goals planned", () => {
  const boards = {
    3: [[0, 1, 2, 3, 8, 5, 6, 4, 7], [2, 1, 4, 3, 8, 0, 7, 5, 6], [0, 4, 7, 1, 8, 6, 3, 2, 5]],
    4: [[14, 2, 5, 7, 4, 15, 10, 11, 1, 9, 0, 12, 13, 6, 3, 8]],
  };
  for (const tiles of boards[3]) {
    const plan = Solver.solve(3, tiles);
    assert.ok(plan);
    assert.deepEqual(play(3, tiles, plan), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  }
  for (const tiles of boards[4]) {
    const plan = Solver.solve(4, tiles);
    assert.ok(plan);
    assert.deepEqual(play(4, tiles, plan), Array.from({ length: 16 }, (_, k) => k));
  }
  /* lesson 2: piece 0 (the player's tile 1) from the middle to the top-left */
  const solo = Solver.goalPlan(3, [2, 1, 4, 3, 8, 0, 7, 5, 6], [{ p: 0, at: 0 }], []);
  assert.ok(solo && solo.length >= 4);
  assert.deepEqual(play(3, [2, 1, 4, 3, 8, 0, 7, 5, 6], solo).slice(0, 1), [0]);
  /* lesson 3: the last two of a row -- pieces 1 and 2 into the top row, piece 0 stays put */
  const pair = Solver.goalPlan(3, [0, 4, 7, 1, 8, 6, 3, 2, 5], [{ p: 1, at: 1 }, { p: 2, at: 2 }], [0]);
  assert.ok(pair && pair.length);
  const after = play(3, [0, 4, 7, 1, 8, 6, 3, 2, 5], pair);
  assert.deepEqual([after[0], after[1], after[2]], [0, 1, 2]);
});
