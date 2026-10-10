// Battle simulator for registry/apps/zhenyao-tower: plays the fixed route with scripted players
// to check the balance. Usage: node tests/zhenyao-sim.mjs [seeds]   (prints Markdown)
import vm from "node:vm";
import { read } from "./helpers.mjs";

// battle-data.js and rules.js share one context: rules.js reads the global BATTLE
const ctx = vm.createContext({ console });
for (const f of ["battle-data.js", "rules.js"]) {
  const rel = "registry/apps/zhenyao-tower/src/" + f;
  vm.runInContext(read(rel), ctx, { filename: rel });
}
const Rules = ctx.Rules, BATTLE = ctx.BATTLE;

const SECONDS_PER_ROUND = 12; // a round with spell animations
const MAX_ROUNDS = 200;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const livingIdx = (b) => b.foes.map((f, i) => (f.hp > 0 ? i : -1)).filter((i) => i >= 0);

/* smart player; ignoreWeakness makes it the "noWeak" player */
function makeSmart(ignoreWeakness) {
  return function (b, R, B) {
    const h = b.hero, s = R.stats(h.level), idx = livingIdx(b);
    if (h.hp < s.maxHp * 0.35 && h.items.pill > 0) return { type: "item", id: "pill" };
    if (b.foes.some((f) => f.gathering === true && f.hp > 0)) return { type: "defend" };

    // candidate actions with their expected damage
    const cands = [];
    const contrib = (f, dmg) => Math.min(f.hp, dmg);
    for (const i of idx) {
      const f = b.foes[i];
      const dmg = contrib(f, s.atk - f.def.def * 0.5);
      cands.push({ action: { type: "attack", target: i }, score: dmg + (dmg >= f.hp ? 2 : 0), mp: 0 });
    }
    let castable = 0;
    for (const id of B.SPELL_ORDER) {
      if (R.spellsAt(h.level).indexOf(id) < 0) continue;
      const sp = B.SPELLS[id];
      if (!R.canCast(h, id)) continue;
      const bad = (f) => ignoreWeakness && sp.element && f.weak === sp.element;
      if (sp.target === "all") {
        if (idx.some((i) => bad(b.foes[i]))) continue;
        castable++;
        let total = 0, kills = 0;
        for (const i of idx) { const f = b.foes[i], d = R.spellDamage(h, id, f); total += contrib(f, d); if (d >= f.hp) kills++; }
        cands.push({ action: { type: "spell", id, target: 0 }, score: total + kills * 2, mp: sp.mp });
      } else {
        for (const i of idx) {
          const f = b.foes[i];
          if (bad(f)) continue;
          castable++;
          const d = R.spellDamage(h, id, f);
          cands.push({ action: { type: "spell", id, target: i }, score: contrib(f, d) + (d >= f.hp ? 2 : 0), mp: sp.mp });
        }
      }
    }
    if (!castable && h.items.ether > 0 && h.mp < s.maxMp * 0.25) return { type: "item", id: "ether" };
    cands.sort((x, y) => y.score - x.score || x.mp - y.mp);
    return cands[0].action;
  };
}

function attackOnly(b, R, B) {
  const h = b.hero, s = R.stats(h.level);
  if (h.hp < s.maxHp * 0.35 && h.items.pill > 0) return { type: "item", id: "pill" };
  const idx = livingIdx(b);
  idx.sort((x, y) => b.foes[x].hp - b.foes[y].hp);
  return { type: "attack", target: idx[0] };
}

export const policies = { smart: makeSmart(false), noWeak: makeSmart(true), attackOnly };

const copyHero = (h) => ({ level: h.level, xp: h.xp, hp: h.hp, mp: h.mp, items: Object.assign({}, h.items) });

/* one fight; mutates the hero and returns a record */
function fight(hero, ids, policy, rng, area) {
  const rec = { area, ids, levelBefore: hero.level, mpSpent: 0, spells: {}, items: {} };
  const b = Rules.start(hero, ids);
  let result = null;
  while (b.round < MAX_ROUNDS) {
    const act = policy(b, Rules, BATTLE);
    if (act.type === "spell") {
      rec.mpSpent += BATTLE.SPELLS[act.id].mp;
      rec.spells[act.id] = (rec.spells[act.id] || 0) + 1;
    } else if (act.type === "item") rec.items[act.id] = (rec.items[act.id] || 0) + 1;
    Rules.heroAct(b, act, rng);
    result = Rules.result(b);
    for (let i = 0; i < b.foes.length && !result; i++) {
      if (b.foes[i].hp <= 0) continue;
      Rules.enemyAct(b, i, rng);
      result = Rules.result(b);
    }
    if (result) break;
  }
  rec.result = result === "win" ? "win" : "lose"; // hitting the round cap counts as a loss
  rec.rounds = b.round;
  if (rec.result === "win") Rules.reward(b);
  rec.levelAfter = hero.level;
  rec.hpLeft = hero.hp;
  rec.maxHp = Rules.stats(hero.level).maxHp;
  rec.mpLeft = hero.mp;
  rec.itemsLeft = Object.assign({}, hero.items);
  return rec;
}

export function runRoute(policy, seed) {
  const rng = mulberry32(seed), hero = Rules.newHero(1);
  const fights = [], areaStart = {};
  let arrival = null, won = true;
  for (const part of BATTLE.ROUTE) {
    if (part.save) Rules.rest(hero);
    for (const k of Object.keys(part.found || {})) hero.items[k] = (hero.items[k] || 0) + part.found[k];
    areaStart[part.area] = hero.level;
    if (part.fights.some((f) => f.indexOf("mirage") >= 0)) arrival = copyHero(hero);
    for (const ids of part.fights) {
      const rec = fight(hero, ids, policy, rng, part.area);
      fights.push(rec);
      if (rec.result !== "win") { won = false; break; }
    }
    if (!won) break;
  }
  return { won, fights, areaStart, arrival };
}

/* the last fight alone, from a given hero state (already rested, items included) */
export function runBoss(policy, seed, heroState) {
  const hero = copyHero(heroState), rng = mulberry32(seed ^ 0x9e3779b9);
  const last = BATTLE.ROUTE[BATTLE.ROUTE.length - 1];
  const ids = last.fights.filter((f) => f.indexOf("mirage") >= 0)[0];
  return fight(hero, ids, policy, rng, last.area);
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r2 = (n) => Math.round(n * 100) / 100;

export function report({ seeds = 500 } = {}) {
  const out = { seeds, policies: {} };
  const smartRuns = [];
  for (const name of Object.keys(policies)) {
    const runs = [];
    for (let s = 1; s <= seeds; s++) runs.push(runRoute(policies[name], s));
    if (name === "smart") smartRuns.push(...runs);
    out.policies[name] = { routeWinRate: runs.filter((r) => r.won).length / seeds };
  }
  const areas = BATTLE.ROUTE.map((p) => p.area);
  const won = smartRuns.filter((r) => r.won);
  const sm = out.policies.smart;
  sm.levelAtAreaStart = {};
  sm.roundsPerFight = {};
  sm.hpPctLeft = {};
  for (const a of areas) {
    sm.levelAtAreaStart[a] = r2(avg(smartRuns.filter((r) => a in r.areaStart).map((r) => r.areaStart[a])));
    const fs = smartRuns.flatMap((r) => r.fights.filter((f) => f.area === a));
    sm.roundsPerFight[a] = r2(avg(fs.map((f) => f.rounds)));
    sm.hpPctLeft[a] = r2(avg(fs.filter((f) => f.result === "win").map((f) => (f.hpLeft / f.maxHp) * 100)));
  }
  const arrivals = smartRuns.filter((r) => r.arrival).map((r) => r.arrival);
  sm.levelAtBoss = r2(avg(arrivals.map((h) => h.level)));
  sm.pillsAtBoss = r2(avg(arrivals.map((h) => h.items.pill || 0)));
  sm.ethersAtBoss = r2(avg(arrivals.map((h) => h.items.ether || 0)));
  sm.minLevelAtBoss = arrivals.length ? Math.min(...arrivals.map((h) => h.level)) : 0;
  sm.playMinutes = r2(avg(won.map((r) => r.fights.reduce((t, f) => t + f.rounds, 0))) * SECONDS_PER_ROUND / 60);
  sm.roundsPerRoute = r2(avg(won.map((r) => r.fights.reduce((t, f) => t + f.rounds, 0))));

  // boss only, from the exact state a smart player arrives with
  out.bossOnly = {};
  out.bossRounds = {};
  for (const name of Object.keys(policies)) {
    const res = [];
    smartRuns.forEach((r, i) => { if (r.arrival) res.push(runBoss(policies[name], i + 1, r.arrival)); });
    out.bossOnly[name] = res.length ? res.filter((x) => x.result === "win").length / res.length : 0;
    out.bossRounds[name] = r2(avg(res.map((x) => x.rounds)));
  }
  return out;
}

const pct = (x) => (x * 100).toFixed(1) + "%";

function markdown(r) {
  const L = [];
  const areas = BATTLE.ROUTE.map((p) => p.area);
  const sm = r.policies.smart;
  L.push(`## Zhenyao Tower battle simulation (${r.seeds} seeds)`, "");
  L.push("### Whole route, no grinding", "", "| policy | route win rate |", "|---|---|");
  for (const k of Object.keys(r.policies)) L.push(`| ${k} | ${pct(r.policies[k].routeWinRate)} |`);
  L.push("", "### Smart player, by area", "", "| area | avg level at start | rounds per fight | HP left after a fight |", "|---|---|---|---|");
  for (const a of areas) L.push(`| ${a} | ${sm.levelAtAreaStart[a]} | ${sm.roundsPerFight[a]} | ${sm.hpPctLeft[a]}% |`);
  L.push("", "### Smart player at the boss", "", "| level (avg / min) | pills | ethers |", "|---|---|---|");
  L.push(`| ${sm.levelAtBoss} / ${sm.minLevelAtBoss} | ${sm.pillsAtBoss} | ${sm.ethersAtBoss} |`);
  L.push("", "### Boss only, smart arrival state", "", "| policy | boss win rate | avg rounds |", "|---|---|---|");
  for (const k of Object.keys(r.bossOnly)) L.push(`| ${k} | ${pct(r.bossOnly[k])} | ${r.bossRounds[k]} |`);
  L.push("", "### Fight playtime (smart, winning routes)", "",
    `${sm.roundsPerRoute} rounds x ${SECONDS_PER_ROUND} s = about ${sm.playMinutes} minutes of fighting.`, "");
  return L.join("\n");
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const n = parseInt(process.argv[2], 10) || 500;
  console.log(markdown(report({ seeds: n })));
}
