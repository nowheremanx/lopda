// The 矿工老张 difficulty curve, measured by the app's own auto-player.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGame, soloPotential, simulateRun } from "../tools/lao-zhang-sim.mjs";

const GM = loadGame();
const base = soloPotential(GM);

function increment(n) {
  return GM.targetFor(n) - (n === 1 ? 0 : GM.targetFor(n - 1));
}

test("early levels pay generously and the spikes are tight", () => {
  for (const n of [1, 2, 3]) {
    assert.ok(base[n] / increment(n) >= 1.4, `level ${n}: ${base[n]} vs ${increment(n)}`);
  }
  for (const n of [4, 8, 10]) {
    assert.ok(base[n] / increment(n) <= 1.2, `level ${n} spike: ${base[n]} vs ${increment(n)}`);
  }
  assert.ok(base.slice(1).reduce((a, b) => a + b, 0) > GM.targetFor(GM.PLAY_LEVELS));
});

test("a smart run clears every seed, a basic run does not", () => {
  for (const seed of [424242, 432161, 440080]) {
    const run = simulateRun(GM, { seed, base });
    assert.equal(run.ok, true, `seed ${seed} failed at ${run.trace.find((r) => r.failed)?.n}`);
    assert.ok(run.bank >= GM.targetFor(GM.PLAY_LEVELS));
  }
  const basic = simulateRun(GM, { seed: 424242, base, smart: false, shop: false });
  assert.equal(basic.ok, false, "the mine should not be cleared by grabbing only the obvious loot");
  assert.ok(basic.trace.some((r) => r.failed && r.n >= 5), "the basic run should get a few levels in");
});
