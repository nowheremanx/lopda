// 失联站 / Lost Deck's auto-player: walks to the cards and the lift by breadth-first search over the map and
// shoots what it can hit, through the game's own World (registry/apps/lost-deck/src/20-world.js) on a fixed
// clock with seeded randomness. It aims perfectly and never takes cover, so it is a smoke test (every deck can
// be finished with the ammo and health on it) and a rough gauge of par times, not a model of a player.
// Usage: node tools/lost-deck-bot.mjs [decks, e.g. 1,2,3] [seeds per deck] [v]
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "registry", "apps", "lost-deck", "src");

/* the game's rules in a fresh context, with Math.random replaced */
export function load(random) {
  const ctx = { console, Math: Object.create(Math) };
  if (random) ctx.Math.random = random;
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["00-art.js", "10-render.js", "20-world.js", "40-decks.js"]) vm.runInContext(readFileSync(join(SRC, f), "utf8"), ctx, { filename: f });
  return ctx.LD;
}

export function playDeck(deckIdx, seed, verbose) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const LD = load(rnd), D = LD.DECKS[deckIdx];
  let done = null; const log = [];
  const w = new LD.World(D, { exit: () => { done = 'exit'; }, dead: () => { done = 'dead'; }, coreDown: () => { done = 'core'; },
    pickup: it => log.push(`${w.time.toFixed(1)} pick ${it.kind}${it.n}`), locked: k => {}, hurt: d => log.push(`${w.time.toFixed(1)} hurt ${d} hp ${w.P.hp}`), kill: e => log.push(`${w.time.toFixed(1)} kill ${e.type}`), shot: g => { shots++; }, boom: (x,y,gas)=>log.push(`${w.time.toFixed(1)} boom ${gas?'gas':'fire'}`) });
  let shots = 0;
  const P = w.P, dt = 1 / 60, M = w.M;
  function passable(x, y, cards) {
    const c = w.cell(x, y);
    if (c === 0 || c === 10) return true;
    if (c >= 11 && c <= 13) return w.cards[c - 10];
    return false;
  }
  function solidThing(x, y) { return w.things.some(o => o.solid && !o.dead && !o.gone && (o.x | 0) === x && (o.y | 0) === y); }
  function path(tx, ty, toWall) {
    const sx = P.x | 0, sy = P.y | 0, prev = new Map(), q = [[sx, sy]]; prev.set(sx + ',' + sy, null);
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (prev.has(k)) continue;
        const goal = nx === tx && ny === ty;
        if (!(goal && toWall) && (!passable(nx, ny) || solidThing(nx, ny))) continue;
        prev.set(k, [x, y]); q.push([nx, ny]);
      }
    }
    if (!prev.has(tx + ',' + ty)) return null;
    const out = []; let cur = [tx, ty];
    while (cur) { out.unshift(cur); cur = prev.get(cur[0] + ',' + cur[1]); }
    return out;
  }
  function goal() {
    /* nearest wanted thing: cards first, then the exit; take meds/ammo when low and near */
    const cands = [];
    for (const o of w.things) {
      if (o.kind === 'item' && !o.gone) {
        const it = o.it;
        if (it.kind === 'card' || it.kind === 'gun') cands.push({ x: o.x | 0, y: o.y | 0, pri: 0 });
        if (it.kind === 'med' && P.hp < 70) cands.push({ x: o.x | 0, y: o.y | 0, pri: 0.5 });
        if (it.kind === 'ammo' && P.ammo < 30) cands.push({ x: o.x | 0, y: o.y | 0, pri: 0.5 });
      }
      if (o.kind === 'foe' && !o.dead && (o.type === 'node' || o.type === 'core')) cands.push({ x: o.x | 0, y: o.y | 0, pri: o.type === 'core' ? 1.5 : 1, near: true });
    }
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) if (w.cell(x, y) === 14) cands.push({ x, y, pri: 2, wall: true });
    let best = null, bp = null;
    for (const c of cands) {
      const p = path(c.x, c.y, c.wall || c.near);
      if (!p) continue;
      const score = c.pri * 1000 + p.length;
      if (!best || score < best.score) { best = { score, c }; bp = p; }
    }
    return bp;
  }
  let stuck = 0, lastX = P.x, lastY = P.y, t = 0, replan = 0, route = null;
  while (!done && w.time < 600) {
    const input = {};
    /* enemies in sight */
    let tgt = null, td = 1e9;
    for (const o of w.things) {
      if (o.kind !== 'foe' || o.dead || (o._ban || 0) > w.time) continue;
      if (o.type === 'core' && w.shielded()) continue;
      const d = Math.hypot(o.x - P.x, o.y - P.y);
      if (d < (P.ammo > 0 ? 8 : 1.5) && w.sightLine(P.x, P.y, o.x, o.y) && d < td) { td = d; tgt = o; }
    }
    if (tgt) {
      const a = Math.atan2(tgt.y - P.y, tgt.x - P.x), da = w.angDiff(a, P.a);
      if (da > 0.02) input.right = true; else if (da < -0.02) input.left = true;
      const dx = Math.cos(P.a), dy = Math.sin(P.a), wall = LD.R.cast(M, P.x, P.y, dx, dy, null).d;
      let first = null, fd = wall;
      for (const o of w.things) { if (!((o.kind === 'foe' && !o.dead) || o.kind === 'barrel')) continue; const vx = o.x - P.x, vy = o.y - P.y, al = vx * dx + vy * dy; if (al <= 0 || al > fd) continue; if (Math.abs(vx * dy - vy * dx) < o.r * 1.3 + 0.05) { fd = al; first = o; } }
      if (first !== tgt) { tgt._wait = (tgt._wait || 0) + dt; if (tgt._wait > 1.5) { tgt._ban = w.time + 3; tgt._wait = 0; } } else tgt._wait = 0;
      if (first === tgt || (first && first.kind === 'barrel' && Math.hypot(first.x - P.x, first.y - P.y) > 2.5)) input.fire = true;
      if ((tgt.type === 'crawler' && td < 1.2) || (tgt.type === 'spore' && td < 2.2)) input.down = true;
      if (P.guns.scatter && td < 3 && P.ammo > 10 && P.gun !== 'scatter') input.swap = true;
      if (P.gun === 'scatter' && (td > 4 || P.ammo < 6)) input.swap = true;
    } else {
      if (--replan <= 0) { route = goal(); replan = 20; }
      if (route && route.length > 1) {
        let i = 1; while (i < route.length - 1 && (P.x | 0) === route[i - 1][0] && false) i++;
        const cx = P.x | 0, cy = P.y | 0;
        let idx = route.findIndex(r => r[0] === cx && r[1] === cy);
        const nx = route[Math.min(route.length - 1, idx + 1)];
        const a = Math.atan2(nx[1] + 0.5 - P.y, nx[0] + 0.5 - P.x), da = w.angDiff(a, P.a);
        if (da > 0.08) input.right = true; else if (da < -0.08) input.left = true;
        if (Math.abs(da) < 0.6) input.up = true;
      }
    }
    if (input.swap && w._swapT > w.time) input.swap = false; else if (input.swap) w._swapT = w.time + 1;
    w.update(dt, input);
    if (++t % 120 === 0) {
      if (Math.hypot(P.x - lastX, P.y - lastY) < 0.1 && !tgt) { stuck++; P.a += 1.2; replan = 0; } else stuck = 0;
      lastX = P.x; lastY = P.y;
      if (stuck > 10) { done = 'stuck'; }
    }
  }
  const r = { deck: deckIdx + 1, seed, end: done || 'timeout', time: +w.time.toFixed(1), hp: P.hp, ammo: P.ammo, shots, kills: w.kills + '/' + w.foes, pos: [P.x.toFixed(1), P.y.toFixed(1)] };
  if (verbose) console.log(log.join('\n'));
  return r;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const decks = process.argv[2] ? process.argv[2].split(",").map((n) => +n - 1) : [0, 1, 2, 3, 4, 5];
  for (const d of decks) for (let s = 1; s <= (+process.argv[3] || 3); s++) console.log(JSON.stringify(playDeck(d, s * 7919, process.argv[4])));
}
