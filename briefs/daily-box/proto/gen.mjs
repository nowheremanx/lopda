// Prototype: Sokoban generator by reverse search (pulls) + forward verifier.
// Board W x H including the outer wall. Cells: 0 floor, 1 wall.
const W = +process.env.W || 10, H = +process.env.H || 9;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const DIRS = [-W, 1, W, -1];

function makeRoom(r) {
  // Carve: start full walls, random walk with 3x3-ish blobs, keep connected.
  for (;;) {
    const g = new Uint8Array(W * H).fill(1);
    let x = 1 + (r() * (W - 2) | 0), y = 1 + (r() * (H - 2) | 0), n = 0;
    const target = ((W - 2) * (H - 2) * (0.45 + r() * 0.15)) | 0;
    let guard = 0;
    while (n < target && guard++ < 5000) {
      if (g[y * W + x]) { g[y * W + x] = 0; n++; }
      const d = r() * 4 | 0;
      const nx = x + [0, 1, 0, -1][d], ny = y + [-1, 0, 1, 0][d];
      if (nx >= 1 && nx < W - 1 && ny >= 1 && ny < H - 1) { x = nx; y = ny; }
    }
    // drop dead ends (floor with 3 wall neighbours) a few passes: they are boring
    for (let p = 0; p < 2; p++) for (let i = 0; i < W * H; i++) if (!g[i]) {
      let w = 0; for (const d of DIRS) w += g[i + d]; if (w >= 3 && r() < 0.7) g[i] = 1;
    }
    let floor = 0; for (let i = 0; i < W * H; i++) if (!g[i]) floor++;
    if (floor < 14) continue;
    // connected?
    const s = g.indexOf(0), seen = new Uint8Array(W * H), st = [s]; seen[s] = 1; let c = 1;
    while (st.length) { const i = st.pop(); for (const d of DIRS) { const j = i + d; if (!g[j] && !seen[j]) { seen[j] = 1; c++; st.push(j); } } }
    if (c === floor) return g;
  }
}

function reach(g, boxes, p) { // returns Uint8Array mask and min cell
  const m = new Uint8Array(W * H), st = [p]; m[p] = 1; let mn = p;
  while (st.length) { const i = st.pop(); for (const d of DIRS) { const j = i + d; if (!g[j] && !boxes[j] && !m[j]) { m[j] = 1; if (j < mn) mn = j; st.push(j); } } }
  return [m, mn];
}
const key = (bl, mn) => bl.join(",") + "|" + mn;

// Simple dead squares: a floor cell from which no box can ever be pushed to any goal.
function liveSquares(g, goals) {
  const live = new Uint8Array(W * H), st = [...goals]; for (const t of goals) live[t] = 1;
  while (st.length) { const i = st.pop(); for (const d of DIRS) { const j = i + d, k = j + d; // box at j pulled to... box at j pushed by player at k? reverse: box at i came from j if player stood at j+d... 
      // box moved from j to i by a push from k=j-(i-j)... simpler: box at j, player at j-d', push dir d'=i-j
      const dd = i - j, pl = j - dd; if (!g[j] && !g[pl] && !live[j]) { live[j] = 1; st.push(j); } } }
  return live;
}

// Reverse BFS from solved state. Returns the farthest states with their pull depth (= min pushes).
function reverse(g, goals, maxStates = 300000) {
  const boxes = new Uint8Array(W * H); for (const t of goals) boxes[t] = 1;
  const seen = new Map(); let frontier = [];
  // start: every player region of the solved config
  const done = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (!g[i] && !boxes[i] && !done[i]) {
    const [m, mn] = reach(g, boxes, i); for (let j = 0; j < W * H; j++) if (m[j]) done[j] = 1;
    const k = key(goals, mn); if (!seen.has(k)) { seen.set(k, 0); frontier.push([goals.slice(), mn]); }
  }
  let depth = 0, last = frontier;
  while (frontier.length && seen.size < maxStates) {
    const next = [];
    for (const [bl, p] of frontier) {
      const b = new Uint8Array(W * H); for (const x of bl) b[x] = 1;
      const [m] = reach(g, b, p);
      for (const x of bl) for (const d of DIRS) {
        // pull: player at x+d, moves to x+2d, box goes x -> x+d
        const pc = x + d, pd = x + 2 * d;
        if (!m[pc] || g[pd] || b[pd]) continue;
        const nb = bl.map(y => y === x ? pc : y).sort((a, c) => a - c);
        b[x] = 0; b[pc] = 1; const [, mn] = reach(g, b, pd); b[pc] = 0; b[x] = 1;
        const k = key(nb, mn); if (seen.has(k)) continue; seen.set(k, depth + 1); next.push([nb, mn]);
      }
    }
    if (next.length) { last = next; depth++; }
    frontier = next;
  }
  return { depth, last, states: seen.size };
}

// Forward solver: BFS on pushes with dead squares, returns min pushes and nodes expanded + solution pushes.
export function solve(g, goals, bl0, p0, cap = 2e6) {
  const live = liveSquares(g, goals), goalSet = new Set(goals);
  const isGoal = bl => bl.every(x => goalSet.has(x));
  const b0 = new Uint8Array(W * H); for (const x of bl0) b0[x] = 1;
  const [, mn0] = reach(g, b0, p0);
  const seen = new Map([[key(bl0, mn0), null]]);
  let frontier = [[bl0, p0, key(bl0, mn0)]], depth = 0, nodes = 0;
  if (isGoal(bl0)) return { pushes: 0, nodes: 0 };
  while (frontier.length) {
    const next = [];
    for (const [bl, p, k0] of frontier) {
      nodes++; if (nodes > cap) return { pushes: -1, nodes };
      const b = new Uint8Array(W * H); for (const x of bl) b[x] = 1;
      const [m] = reach(g, b, p);
      for (const x of bl) for (const d of DIRS) {
        const pl = x - d, to = x + d;
        if (!m[pl] || g[to] || b[to] || !live[to]) continue;
        const nb = bl.map(y => y === x ? to : y).sort((a, c) => a - c);
        b[x] = 0; b[to] = 1; const [, mn] = reach(g, b, x); b[to] = 0; b[x] = 1;
        const k = key(nb, mn); if (seen.has(k)) continue; seen.set(k, [k0, x, d]);
        if (isGoal(nb)) {
          // walk back for box-lines
          const pushes = []; let kk = k; while (seen.get(kk)) { const [pk, bx, dd] = seen.get(kk); pushes.push([bx, dd]); kk = pk; }
          pushes.reverse(); let lines = 0, prev = null;
          for (let i = 0; i < pushes.length; i++) { const [bx, dd] = pushes[i]; if (!prev || prev[0] + prev[1] !== bx || prev[1] !== dd) lines++; prev = [bx, dd]; }
          return { pushes: depth + 1, nodes, lines, explored: seen.size };
        }
        next.push([nb, x, k]);
      }
    }
    frontier = next; depth++;
  }
  return { pushes: -1, nodes };
}

export function show(g, goals, bl, p) {
  const gs = new Set(goals), bs = new Set(bl); let s = "";
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) { const i = y * W + x;
    s += g[i] ? "#" : bs.has(i) ? (gs.has(i) ? "*" : "$") : i === p ? (gs.has(i) ? "+" : "@") : gs.has(i) ? "." : " "; } s += "\n"; }
  return s;
}

export function generate(seed, nBoxes) {
  const r = rng(seed);
  for (let tries = 1; ; tries++) {
    const g = makeRoom(r);
    const fl = []; for (let i = 0; i < W * H; i++) if (!g[i]) fl.push(i);
    // goals: avoid corners? random distinct
    const goals = []; while (goals.length < nBoxes) { const c = fl[r() * fl.length | 0]; if (!goals.includes(c)) goals.push(c); }
    goals.sort((a, b) => a - b);
    const rev = reverse(g, goals);
    // among farthest states prefer ones where no box sits on a goal
    const gs = new Set(goals);
    const cands = rev.last.filter(([bl]) => bl.every(x => !gs.has(x)));
    const pick = (cands.length ? cands : rev.last)[r() * (cands.length || rev.last.length) | 0];
    // player: any cell of the region (pick min cell)
    const [bl, p] = pick;
    return { g, goals, bl, p, pushes: rev.depth, revStates: rev.states, tries };
  }
}

if (process.argv[1].endsWith("gen.mjs")) {
  const N = +process.argv[2] || 20, nb = +process.argv[3] || 3;
  const rows = [];
  for (let s = 1; s <= N; s++) {
    const t0 = performance.now(); const L = generate(s * 7919, nb); const t1 = performance.now();
    const v = solve(L.g, L.goals, L.bl, L.p); const t2 = performance.now();
    let floor = 0; for (const c of L.g) if (!c) floor++;
    rows.push({ seed: s, pushes: L.pushes, verify: v.pushes, lines: v.lines, fwdStates: v.explored, revStates: L.revStates, floor, genMs: +(t1 - t0).toFixed(0), solveMs: +(t2 - t1).toFixed(0) });
    if (process.env.SHOW && s <= +process.env.SHOW) console.log(show(L.g, L.goals, L.bl, L.p), JSON.stringify(rows.at(-1)));
  }
  console.table(rows);
  const ps = rows.map(r => r.pushes).sort((a, b) => a - b);
  console.log("pushes min/median/max", ps[0], ps[ps.length >> 1], ps.at(-1), "mismatch", rows.filter(r => r.pushes !== r.verify).length);
}
