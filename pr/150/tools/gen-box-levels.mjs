// Generates registry/apps/daily-box/src/levels.js: one proved-solvable puzzle a day for 157 whole weeks.
//
// Why offline: every level's minimum push count (par) has to be exact, and the phone must not generate or
// search anything on the day. The generator does the expensive part here and the table is the proof.
//
// The method is the prototype in tmp-briefs/briefs/daily-box/proto/gen.mjs:
//   1. carve a random room (10x8 including the outer wall, 45-60% floor),
//   2. put one box and one goal per box on the floor, solved,
//   3. search backwards with pulls. A state's pull depth is exactly its minimum number of pushes, and every
//      state reached this way is solvable by construction,
//   4. solve the chosen start forwards with dead-square pruning. The two searches must agree on par,
//   5. trim floor cells the chosen solution never touches (if the room stays connected and par is unchanged).
// Deterministic: one fixed seed and our own PRNG. No Math.random, no clock in the output.
//
// Usage: node tools/gen-box-levels.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "registry/apps/daily-box/src/levels.js");

const W = 10, H = 8;                 // the whole board, outer wall included
const IW = 8, IH = 6;                // the interior the encoding stores
const CELLS = W * H;
const EPOCH = [2026, 10, 26];        // a Monday; day numbers are local midnights from here
const DAYS = 1099;                   // 157 whole weeks: after the wrap, day % length is still the same weekday
const SEED = 0x1a2b3c4d;
const DIRS = [-W, 1, W, -1];         // up, right, down, left
const MAX_ATTEMPTS = 2000;           // a Sunday can honestly need ~100 rooms; this is a failure guard

// mulberry32: small, fast, and its stream is part of this tool's contract, not a library.
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

// Turn (day, attempt) into an independent seed, so one failed candidate does not shift the next.
function mix(a, b) {
  let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// The prototype's room: a random walk that carves 45-60% of the interior, then drops most 3-walled dead
// ends (they are boring), then keeps only connected rooms. `g` is 1 for wall, 0 for floor.
function makeRoom(r) {
  for (let attempt = 0; attempt < 10000; attempt++) {
    const g = new Uint8Array(CELLS).fill(1);
    let x = 1 + Math.floor(r() * (W - 2));
    let y = 1 + Math.floor(r() * (H - 2));
    let n = 0;
    const target = Math.floor((W - 2) * (H - 2) * (0.45 + r() * 0.15));
    let guard = 0;
    while (n < target && guard++ < 5000) {
      if (g[y * W + x]) { g[y * W + x] = 0; n++; }
      const d = Math.floor(r() * 4);
      const nx = x + [0, 1, 0, -1][d];
      const ny = y + [-1, 0, 1, 0][d];
      if (nx >= 1 && nx < W - 1 && ny >= 1 && ny < H - 1) { x = nx; y = ny; }
    }
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < CELLS; i++) if (!g[i]) {
      let walls = 0;
      for (const d of DIRS) walls += g[i + d];
      if (walls >= 3 && r() < 0.7) g[i] = 1;
    }
    let floor = 0;
    for (let i = 0; i < CELLS; i++) if (!g[i]) floor++;
    if (floor < 14) continue;
    const start = g.indexOf(0);
    const seen = new Uint8Array(CELLS);
    const stack = [start];
    seen[start] = 1;
    let count = 1;
    while (stack.length) {
      const i = stack.pop();
      for (const d of DIRS) {
        const j = i + d;
        if (!g[j] && !seen[j]) { seen[j] = 1; count++; stack.push(j); }
      }
    }
    if (count === floor) return g;
  }
  throw new Error("could not carve a room");
}

// Player region with boxes as obstacles; the smallest cell makes two equal regions share a key.
function reach(g, boxes, p) {
  const mask = new Uint8Array(CELLS);
  const stack = [p];
  mask[p] = 1;
  let min = p;
  while (stack.length) {
    const i = stack.pop();
    for (const d of DIRS) {
      const j = i + d;
      if (!g[j] && !boxes[j] && !mask[j]) {
        mask[j] = 1;
        if (j < min) min = j;
        stack.push(j);
      }
    }
  }
  return [mask, min];
}

// Static dead squares: start at the goals and walk pulls backwards. A box on a cell that never appears has
// no route to a goal, whatever the other boxes do.
function liveSquares(g, goals) {
  const live = new Uint8Array(CELLS);
  const stack = [];
  for (const t of goals) { live[t] = 1; stack.push(t); }
  while (stack.length) {
    const i = stack.pop();
    for (const d of DIRS) {
      const j = i - d;          // box came from j ...
      const player = j - d;     // ... pushed by a player standing one further back
      if (!g[j] && !g[player] && !live[j]) { live[j] = 1; stack.push(j); }
    }
  }
  return live;
}

// Backwards BFS from the solved configuration. It stops at maxDepth (or when the room runs out); the last
// frontier holds states whose exact minimum is `depth`. Callers only need states at their target difficulty.
function reverse(g, goals, maxDepth, maxStates = 500000) {
  const solvedBoxes = new Uint8Array(CELLS);
  for (const t of goals) solvedBoxes[t] = 1;
  const seen = new Map();
  let frontier = [];
  const covered = new Uint8Array(CELLS);
  for (let i = 0; i < CELLS; i++) if (!g[i] && !solvedBoxes[i] && !covered[i]) {
    const [mask, min] = reach(g, solvedBoxes, i);
    for (let j = 0; j < CELLS; j++) if (mask[j]) covered[j] = 1;
    const key = goals.join(",") + "|" + min;
    if (!seen.has(key)) { seen.set(key, 0); frontier.push([goals.slice(), min]); }
  }
  let depth = 0;
  let last = frontier;
  while (frontier.length && depth < maxDepth && seen.size < maxStates) {
    const next = [];
    for (const [boxes, player] of frontier) {
      const maskBoxes = new Uint8Array(CELLS);
      for (const x of boxes) maskBoxes[x] = 1;
      const [mask] = reach(g, maskBoxes, player);
      for (const x of boxes) for (const d of DIRS) {
        const pc = x + d;          // player now, pulling
        const pd = x + 2 * d;      // player after the pull, box after the pull
        if (!mask[pc] || g[pd] || maskBoxes[pd]) continue;
        const nextBoxes = boxes.map((y) => (y === x ? pc : y)).sort((a, b) => a - b);
        maskBoxes[x] = 0; maskBoxes[pc] = 1;
        const [, min] = reach(g, maskBoxes, pd);
        maskBoxes[pc] = 0; maskBoxes[x] = 1;
        const key = nextBoxes.join(",") + "|" + min;
        if (seen.has(key)) continue;
        seen.set(key, depth + 1);
        next.push([nextBoxes, min]);
      }
    }
    if (!next.length) break;
    frontier = next;
    depth++;
    last = frontier;
  }
  return { depth, frontier: last, states: seen.size };
}

// Forwards BFS over pushes with dead-square pruning. Returns the exact par, the push trace and the score
// inputs. This is also the guard against a bug in the reverse search: its answer must match.
function solve(g, goals, startBoxes, startPlayer, cap = 2000000) {
  const live = liveSquares(g, goals);
  const goalSet = new Set(goals);
  const isGoal = (boxes) => boxes.every((x) => goalSet.has(x));
  const boxMask = new Uint8Array(CELLS);
  for (const x of startBoxes) boxMask[x] = 1;
  const [, min0] = reach(g, boxMask, startPlayer);
  const startKey = startBoxes.join(",") + "|" + min0;
  const seen = new Map([[startKey, null]]);
  let frontier = [[startBoxes, startPlayer, startKey]];
  let depth = 0;
  let nodes = 0;
  if (isGoal(startBoxes)) return { pushes: 0, lines: 0, explored: seen.size, path: [] };
  while (frontier.length) {
    const next = [];
    for (const [boxes, player, key0] of frontier) {
      nodes++;
      if (nodes > cap) return { pushes: -1, lines: 0, explored: seen.size, path: null };
      const maskBoxes = new Uint8Array(CELLS);
      for (const x of boxes) maskBoxes[x] = 1;
      const [mask] = reach(g, maskBoxes, player);
      for (const x of boxes) for (const d of DIRS) {
        const behind = x - d;
        const to = x + d;
        if (!mask[behind] || g[to] || maskBoxes[to] || !live[to]) continue;
        const nextBoxes = boxes.map((y) => (y === x ? to : y)).sort((a, b) => a - b);
        maskBoxes[x] = 0; maskBoxes[to] = 1;
        const [, min] = reach(g, maskBoxes, x);
        maskBoxes[to] = 0; maskBoxes[x] = 1;
        const key = nextBoxes.join(",") + "|" + min;
        if (seen.has(key)) continue;
        seen.set(key, [key0, x, d]);
        if (isGoal(nextBoxes)) {
          const path = [];
          let k = key;
          while (seen.get(k)) {
            const [parent, box, dir] = seen.get(k);
            path.push([box, dir]);
            k = parent;
          }
          path.reverse();
          let lines = 0;
          let prev = null;
          for (const [box, dir] of path) {
            // The same box going the same way is one line; anything else starts a new decision.
            if (!prev || prev[0] + prev[1] !== box || prev[1] !== dir) lines++;
            prev = [box, dir];
          }
          return { pushes: depth + 1, lines, explored: seen.size, path };
        }
        next.push([nextBoxes, x, key]);
      }
    }
    frontier = next;
    depth++;
  }
  return { pushes: -1, lines: 0, explored: seen.size, path: null };
}

function dirOf(offset) {
  return offset === -W ? 0 : offset === 1 ? 1 : offset === W ? 2 : 3;
}

// Shortest walk from one cell to another, around the boxes. The stored solution must be playable move by
// move, not just as a list of pushes.
function walk(g, boxMask, from, to) {
  if (from === to) return [];
  const parent = new Int32Array(CELLS).fill(-1);
  const queue = [from];
  parent[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    for (const d of DIRS) {
      const j = i + d;
      if (parent[j] !== -1 || g[j] || boxMask[j]) continue;
      parent[j] = i;
      if (j === to) {
        const out = [];
        let cur = to;
        while (cur !== from) {
          const p = parent[cur];
          out.push(dirOf(cur - p));
          cur = p;
        }
        return out.reverse();
      }
      queue.push(j);
    }
  }
  return null;
}

function solutionMoves(g, goals, startBoxes, startPlayer, path) {
  const boxMask = new Uint8Array(CELLS);
  for (const x of startBoxes) boxMask[x] = 1;
  const moves = [];
  let player = startPlayer;
  for (const [box, offset] of path) {
    if (!boxMask[box]) throw new Error("solution moved a missing box");
    const to = box + offset;
    if (g[to] || boxMask[to]) throw new Error("solution pushed into a wall or box");
    const steps = walk(g, boxMask, player, box - offset);
    if (!steps) throw new Error("solution has no walk to the push");
    for (const step of steps) moves.push(step);
    boxMask[box] = 0;
    boxMask[to] = 1;
    moves.push(dirOf(offset));   // the table stores direction codes, not cell offsets
    player = box;
  }
  const goalSet = new Set(goals);
  for (let i = 0; i < CELLS; i++) if (boxMask[i] && !goalSet.has(i)) {
    throw new Error("solution did not finish on the goals");
  }
  return moves;
}

function connectedFloor(g) {
  let first = -1;
  let floor = 0;
  for (let i = 0; i < CELLS; i++) if (!g[i]) { floor++; if (first < 0) first = i; }
  if (first < 0) return false;
  const seen = new Uint8Array(CELLS);
  const stack = [first];
  seen[first] = 1;
  let count = 1;
  while (stack.length) {
    const i = stack.pop();
    for (const d of DIRS) {
      const j = i + d;
      if (!g[j] && !seen[j]) { seen[j] = 1; count++; stack.push(j); }
    }
  }
  return count === floor;
}

// Every cell the solution's player or boxes stand on, including the start.
function usedCells(boxes, player, moves) {
  const used = new Uint8Array(CELLS);
  const boxMask = new Uint8Array(CELLS);
  for (const x of boxes) { boxMask[x] = 1; used[x] = 1; }
  used[player] = 1;
  for (const d of moves) {
    const to = player + DIRS[d];
    if (boxMask[to]) {
      const beyond = to + DIRS[d];
      boxMask[to] = 0;
      boxMask[beyond] = 1;
      used[beyond] = 1;
    }
    player = to;
    used[player] = 1;
  }
  return used;
}

// Remove side pockets the solution never uses. Only cells that keep the room connected are tried; the
// forwards solve afterwards re-proves that par did not move.
function trimFloor(g, goals, boxes, player, par, moves) {
  const used = usedCells(boxes, player, moves);
  const original = g.slice();
  for (let i = 0; i < CELLS; i++) {
    if (g[i] || used[i]) continue;
    g[i] = 1;
    if (!connectedFloor(g)) g[i] = 0;
  }
  let changed = false;
  for (let i = 0; i < CELLS; i++) if (g[i] !== original[i]) { changed = true; break; }
  if (!changed) return { g, solve: null, trimmed: 0 };
  const checked = solve(g, goals, boxes, player);
  if (checked.pushes !== par) return { g: original, solve: null, trimmed: 0 };
  let trimmed = 0;
  for (let i = 0; i < CELLS; i++) if (!original[i] && g[i]) trimmed++;
  return { g, solve: checked, trimmed };
}

// Weekday -> difficulty. Mon/Tue keep a band (13-16) and stop the reverse search at a target inside it.
// The other days are open above their floor: the reverse search runs to the room's full depth, and K
// candidates are compared so the picked level is the room's hardest start, not just the first one found.
const TIERS = [
  { name: "Mon", boxes: 3, min: 13, max: 16, k: 10 },
  { name: "Tue", boxes: 3, min: 13, max: 16, k: 10 },
  { name: "Wed", boxes: 3, min: 18, max: null, k: 32 },
  { name: "Thu", boxes: 3, min: 18, max: null, k: 32 },
  { name: "Fri", boxes: 4, min: 20, max: null, k: 40 },
  { name: "Sat", boxes: 4, min: 20, max: null, k: 40 },
  { name: "Sun", boxes: 4, min: 24, max: null, k: 64 },
];

// One room and one start state. Returns null when the room cannot reach the target depth with a start
// that has no box already on a goal (the brief's candidate filter).
function makeCandidate(day, attempt, tier, target) {
  const r = mulberry32(mix(SEED, day * 1000 + attempt));
  const g = makeRoom(r);
  const floorCells = [];
  for (let i = 0; i < CELLS; i++) if (!g[i]) floorCells.push(i);
  const goals = [];
  while (goals.length < tier.boxes) {
    const c = floorCells[Math.floor(r() * floorCells.length)];
    if (!goals.includes(c)) goals.push(c);
  }
  goals.sort((a, b) => a - b);
  // A null target means "no target stop": the last frontier is the room's hardest start states.
  const rev = reverse(g, goals, target === null ? Infinity : target);
  if (!rev.frontier.length || rev.depth < tier.min) return null;
  const goalSet = new Set(goals);
  const usable = rev.frontier.filter(([boxes]) => boxes.every((x) => !goalSet.has(x)));
  if (!usable.length) return null;
  const [boxes, player] = usable[Math.floor(r() * usable.length)];
  const forward = solve(g, goals, boxes, player);
  if (forward.pushes !== rev.depth) {
    throw new Error(`search mismatch on day ${day} attempt ${attempt}: ${forward.pushes} vs ${rev.depth}`);
  }
  return {
    g, goals, boxes, player,
    par: forward.pushes,
    lines: forward.lines,
    explored: forward.explored,
    path: forward.path,
  };
}

function pickLevel(day, tier) {
  let target = null;
  if (tier.max !== null) {
    const span = tier.max - tier.min + 1;
    target = tier.min + (mix(SEED ^ 0x5f3759df, day) % span);
  }
  const started = performance.now();
  let best = null;
  let attempts = 0;
  let found = 0;
  // K candidates per tier; if none meets the floor, keep going (the floor is the hard requirement).
  while ((attempts < tier.k || !best) && attempts < MAX_ATTEMPTS) {
    const candidate = makeCandidate(day, attempts, tier, target);
    attempts++;
    if (!candidate) continue;
    found++;
    const score = candidate.par + 2 * candidate.lines + Math.log2(candidate.explored + 1);
    if (!best || score > best.score) best = { ...candidate, score };
  }
  if (!best) throw new Error(`no level for day ${day} after ${MAX_ATTEMPTS} rooms`);
  const moves = solutionMoves(best.g, best.goals, best.boxes, best.player, best.path);
  const trimmed = trimFloor(best.g, best.goals, best.boxes, best.player, best.par, moves);
  const solution = trimmed.solve
    ? solutionMoves(trimmed.g, best.goals, best.boxes, best.player, trimmed.solve.path)
    : moves;
  return {
    g: trimmed.g,
    goals: best.goals,
    boxes: best.boxes,
    player: best.player,
    par: best.par,
    solution,
    attempts,
    found,
    trimmed: trimmed.trimmed,
    ms: performance.now() - started,
  };
}

// --- encoding ---------------------------------------------------------------------------------------
// See the comment at the top of levels.js. Keeping the payload in one base64 string makes the table a
// single ES5 script with no objects to parse and no module system in the iframe.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[c & 63] : "=";
  }
  return out;
}

function interiorIndex(cell) {
  const x = (cell % W) - 1;
  const y = Math.floor(cell / W) - 1;
  return y * IW + x;
}

function encodeLevel(level) {
  const masks = new Uint8Array(18);
  const boxSet = new Set(level.boxes);
  const goalSet = new Set(level.goals);
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
    const cell = (y + 1) * W + (x + 1);
    const i = y * IW + x;
    if (!level.g[cell]) masks[i >> 3] |= 1 << (i & 7);
    if (boxSet.has(cell)) masks[6 + (i >> 3)] |= 1 << (i & 7);
    if (goalSet.has(cell)) masks[12 + (i >> 3)] |= 1 << (i & 7);
  }
  const player = interiorIndex(level.player);
  const bytes = [level.par];
  for (const byte of masks) bytes.push(byte);
  bytes.push(player);
  bytes.push(level.solution.length & 255, (level.solution.length >> 8) & 255);
  // two bits per move, low bits first
  let packed = 0;
  let bits = 0;
  for (const move of level.solution) {
    packed |= (move & 3) << bits;
    bits += 2;
    if (bits === 8) { bytes.push(packed); packed = 0; bits = 0; }
  }
  if (bits) bytes.push(packed);
  return base64(bytes);
}

// --- main -------------------------------------------------------------------------------------------

function median(sorted) {
  return sorted[sorted.length >> 1];
}

function main() {
  const started = performance.now();
  const levels = [];
  const stats = TIERS.map(() => ({ n: 0, pars: [], ms: 0, attempts: 0, found: 0, trimmed: 0 }));
  for (let day = 0; day < DAYS; day++) {
    const weekday = new Date(Date.UTC(EPOCH[0], EPOCH[1] - 1, EPOCH[2] + day)).getUTCDay(); // 0 Sun
    const tierIndex = (weekday + 6) % 7; // 0 Mon ... 6 Sun
    const tier = TIERS[tierIndex];
    const level = pickLevel(day, tier);
    const stat = stats[tierIndex];
    stat.n++;
    stat.pars.push(level.par);
    stat.ms += level.ms;
    stat.attempts += level.attempts;
    stat.found += level.found;
    stat.trimmed += level.trimmed;
    levels.push(level);
  }

  // A repeated room on consecutive days would look like the game forgot to advance.
  for (let i = 1; i < levels.length; i++) {
    if (encodeLevel(levels[i]) === encodeLevel(levels[i - 1])) {
      throw new Error(`day ${i} repeats day ${i - 1}`);
    }
  }
  if (encodeLevel(levels[0]) === encodeLevel(levels[levels.length - 1])) {
    throw new Error("the table's last day repeats its first day");
  }

  let out = "/* 每日推箱 / DailyBox level table. GENERATED by tools/gen-box-levels.mjs -- do not edit by hand.\n";
  out += "   One entry per day, 1099 entries (157 whole weeks), day 0 = 2026-10-26 (a Monday);\n";
  out += "   after the last entry the table wraps, and 1099 % 7 = 0 keeps the weekday (and tier) aligned.\n";
  out += "   Board: 10 wide x 8 tall including the outer wall; only the 8x6 interior is stored.\n";
  out += "   Each entry is standard base64 of these bytes, bits little-endian within a byte:\n";
  out += "     0      par pushes (the exact minimum)\n";
  out += "     1-6    floor mask of the 8x6 interior (cell i = y*8+x, i 0..47)\n";
  out += "     7-12   box mask, same bit order\n";
  out += "     13-18  goal mask, same bit order\n";
  out += "     19     player cell (0..47, same order)\n";
  out += "     20-21  solution length in player moves (uint16, little endian)\n";
  out += "     22-    solution moves, 2 bits each (0 up, 1 right, 2 down, 3 left), low bits first\n";
  out += "   Interior cell i is board cell (x+1, y+1); the outer wall and any border are implicit. */\n";
  out += "var LEVELS = {\n";
  out += "  v: 1,\n";
  out += `  epoch: [${EPOCH[0]}, ${EPOCH[1]}, ${EPOCH[2]}],\n`;
  out += `  w: ${W},\n`;
  out += `  h: ${H},\n`;
  out += "  levels: [\n";
  for (let i = 0; i < levels.length; i++) {
    out += `    "${encodeLevel(levels[i])}"${i + 1 < levels.length ? "," : ""}\n`;
  }
  out += "  ]\n";
  out += "};\n";

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, out);

  const totalMs = performance.now() - started;
  console.log("day  tier  levels  par min/median/max   generation");
  for (let i = 0; i < TIERS.length; i++) {
    const s = stats[i];
    const pars = s.pars.slice().sort((a, b) => a - b);
    console.log(
      `${TIERS[i].name}   ${String(s.n).padStart(4)}   ${String(pars[0]).padStart(6)} / ${String(median(pars)).padStart(2)} / ${String(pars[pars.length - 1]).padStart(5)}   ` +
      `${(s.ms / 1000).toFixed(1)} s  (${s.attempts} rooms, ${s.found} usable, ${s.trimmed} cells trimmed)`
    );
  }
  const pars = levels.map((l) => l.par).sort((a, b) => a - b);
  console.log(`all   ${String(levels.length).padStart(4)}   ${String(pars[0]).padStart(6)} / ${String(median(pars)).padStart(2)} / ${String(pars[pars.length - 1]).padStart(5)}   ${(totalMs / 1000).toFixed(1)} s`);
  console.log(`wrote ${OUT} (${Buffer.byteLength(out)} bytes)`);
}

main();
