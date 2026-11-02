#!/usr/bin/env node
// 矿工老张 difficulty lab. Usage: node tools/lao-zhang-sim.mjs [--seeds 6] [--json]
// Loads the app's plain game logic in a vm, plays the mine with a deterministic
// auto-player, and prints how much each level can pay against its target.
// No dependencies. The tests import playLevel/simulateRun from here.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dirname, "..");

export function loadGame(root = ROOT) {
  const ctx = vm.createContext({ console, window: {} });
  ctx.window = ctx;
  for (const f of ["00-data.js", "10-game.js", "20-art.js"]) {
    vm.runInContext(readFileSync(join(root, "registry/apps/lao-zhang/src", f), "utf8"), ctx, { filename: f });
  }
  return ctx.GM;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (GM, it) => Math.atan2(it.x - GM.ANCHOR.x, it.y - GM.ANCHOR.y);
const valuable = (it) => it.kind === "gem" || it.kind === "gold" || it.kind === "bag";

function valueOf(it) {
  if (it.type === "tnt") return -1;
  if (it.kind === "bag") return 260;
  if (it.kind === "mole") return it.carry === "diamond" ? 900 : 0;
  if (it.kind === "junk" || it.kind === "rock") return 0;
  return it.value;
}

/* the first static item a rope fired at this item's angle would touch */
function firstHit(GM, state, item) {
  const ax = GM.ANCHOR.x, ay = GM.ANCHOR.y;
  const dx = item.x - ax, dy = item.y - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1) return item;
  const ux = dx / len, uy = dy / len;
  let best = item, bestT = len;
  for (const other of state.items) {
    if (other === item || other.type === "mole") continue;
    const ox = other.x - ax, oy = other.y - ay;
    const proj = ox * ux + oy * uy;
    if (proj <= 0 || proj > len) continue;
    const perp = Math.abs(-ox * uy + oy * ux);
    if (perp <= other.r + 4 && proj < bestT) { best = other; bestT = proj; }
  }
  return best;
}

/* the best piece of loot hiding behind a rock: clearing the rock is worth something */
function behindValue(GM, state, blocker) {
  const ax = GM.ANCHOR.x, ay = GM.ANCHOR.y;
  const dx = blocker.x - ax, dy = blocker.y - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  let best = 0;
  for (const other of state.items) {
    if (other === blocker || other.type === "mole" || other.type === "tnt" || !valuable(other)) continue;
    const ox = other.x - ax, oy = other.y - ay;
    const proj = ox * ux + oy * uy;
    if (proj <= len) continue;
    const perp = Math.abs(-ox * uy + oy * ux);
    if (perp <= blocker.r + other.r + 2) best = Math.max(best, valueOf(other));
  }
  return best;
}

function pickTarget(GM, state, smart) {
  let best = null, bestScore = 0;
  for (const it of state.items) {
    if (it.type === "mole" || it.type === "tnt") continue;
    if (firstHit(GM, state, it) !== it) continue;
    let v = valueOf(it);
    if (v <= 0 && smart) v = behindValue(GM, state, it) * 0.55;
    if (v <= 0) continue;
    const d = dist(it, GM.ANCHOR);
    const t = 0.55 + Math.max(0, d - GM.IDLE_ROPE) / GM.OUT_SPEED + (d - 2) / GM.retractSpeed(it, state.strength);
    const score = v / Math.max(0.25, t);
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return best;
}

function shouldBlow(GM, state) {
  const it = state.hook.item;
  if (!it || state.dynamite <= 0) return false;
  if (it.kind !== "rock" && it.kind !== "junk") return false;
  const p = GM.heldPos(state.hook);
  for (const v of state.items) if (valuable(v) && dist(p, v) < 33) return false;
  return true;
}

/* Play one level with the hook. The bank is not reset; startLevel keeps it. */
export function playLevel(GM, state, n, opts = {}) {
  const smart = opts.smart !== false;
  const aim = smart ? 0.025 : 0.07;
  GM.startLevel(state, n);
  state.screen = "play";
  state.time = GM.LEVEL_TIME;
  state.introT = 0;
  let chosen = null, t = 0;
  const step = 1 / 60;
  while (state.screen === "play" && t < GM.LEVEL_TIME + 2) {
    if (!state.bomb && state.hook.state === "swing") {
      if (!chosen || !state.items.includes(chosen) || firstHit(GM, state, chosen) !== chosen) {
        chosen = pickTarget(GM, state, smart);
      }
      if (chosen && Math.abs(state.hook.angle - angleTo(GM, chosen)) < aim) {
        GM.fire(state);
        chosen = null;
      }
    }
    if (smart && state.hook.state === "back" && shouldBlow(GM, state)) GM.useDynamite(state);
    GM.update(state, step);
    if (state.screen !== "play") break;
    t += step;
  }
  return { bank: state.bank, left: state.items.length, time: Math.round(t) };
}

function shop(GM, state, next, base, opts) {
  if (opts.shop === false) return [];
  state.screen = "shop";
  state.shopOffers = GM.shopOffers(state, next);
  const nextTarget = GM.targetFor(next);
  const expected = base[next] || 0;
  let spendable = state.bank + expected * 0.82 - nextTarget - 120;
  const bought = [];
  for (const key of ["clover", "strength", "dynamite"]) {
    const idx = state.shopOffers.findIndex((o) => o.key === key);
    if (idx < 0) continue;
    const offer = state.shopOffers[idx];
    if (!offer.available) continue;
    let copies = key === "dynamite" ? 2 : 1;
    while (copies-- > 0 && spendable >= offer.price && state.bank >= offer.price) {
      if (!GM.buy(state, idx)) break;
      spendable -= offer.price;
      bought.push(key);
      if (key !== "dynamite") break;
    }
  }
  return bought;
}

/* The levels' loot potential with no purchases, used to judge the target curve. */
export function soloPotential(GM, seed = 424242) {
  const out = [];
  for (let n = 1; n <= GM.PLAY_LEVELS; n++) {
    const state = GM.newState();
    state.bank = 0;
    state.runSeed = seed;
    playLevel(GM, state, n);
    out[n] = state.bank;
  }
  return out;
}

/* Play a whole ten-level run. Returns the trace and whether the run cleared. */
export function simulateRun(GM, opts = {}) {
  const targets = opts.targets || GM.TARGETS;
  const oldTargets = GM.TARGETS;
  GM.TARGETS = targets.slice();
  const base = opts.base || soloPotential(GM, opts.seed || 424242);
  const state = GM.newState();
  state.bank = 0;
  state.runSeed = opts.seed || 424242;
  const trace = [];
  let ok = true;
  for (let n = 1; n <= GM.PLAY_LEVELS; n++) {
    const start = state.bank;
    playLevel(GM, state, n, opts);
    const target = GM.targetFor(n);
    const row = { n, start, got: state.bank, target, margin: state.bank - target, left: state.items.length };
    trace.push(row);
    if (state.bank < target) { ok = false; row.failed = true; break; }
    if (n < GM.PLAY_LEVELS) row.bought = shop(GM, state, n + 1, base, opts);
  }
  GM.TARGETS = oldTargets;
  return { ok, bank: state.bank, trace, base };
}

function main() {
  const args = process.argv.slice(2);
  const seedsAt = args.indexOf("--seeds");
  const seeds = seedsAt >= 0 ? Math.max(1, +args[seedsAt + 1] || 6) : 6;
  const json = args.includes("--json");
  const GM = loadGame();
  const base = soloPotential(GM);
  const rows = [];
  for (let n = 1; n <= GM.PLAY_LEVELS; n++) {
    const prev = n === 1 ? 0 : GM.targetFor(n - 1);
    const inc = GM.targetFor(n) - prev;
    rows.push({ n, inc, base: base[n], ratio: base[n] / inc, target: GM.targetFor(n) });
  }
  const runs = [];
  for (let i = 0; i < seeds; i++) {
    const seed = 424242 + i * 7919;
    const run = simulateRun(GM, { seed, base });
    runs.push({ seed, ok: run.ok, bank: run.bank, failed: run.trace.find((r) => r.failed)?.n || 0 });
  }
  const basic = simulateRun(GM, { seed: 424242, base, smart: false, shop: false });
  const out = { levels: rows, runs, basic: { ok: basic.ok, bank: basic.bank, failed: basic.trace.find((r) => r.failed)?.n || 0 } };
  if (json) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log("lv  target-increment  solo-haul  headroom  cumulative");
  for (const r of rows) {
    console.log(
      String(r.n).padStart(2), String(r.inc).padStart(17), String(r.base).padStart(10),
      (r.ratio.toFixed(2) + "x").padStart(9), String(r.target).padStart(11)
    );
  }
  console.log("smart runs:", runs.map((r) => (r.ok ? "WIN" : "FAIL@" + r.failed) + " $" + r.bank).join(" · "));
  console.log("basic/no-shop run:", (out.basic.ok ? "WIN" : "FAIL@" + out.basic.failed) + " $" + out.basic.bank);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
