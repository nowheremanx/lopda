#!/usr/bin/env node
/*
 * Balance simulator for registry/apps/shanjiao-diner.
 *
 * It reads the game's own data table (src/10-data.js) so the dishes, enemies,
 * weather and rent are never copied by hand, then models a whole seven-day run:
 * gather, fight, cook, serve, pay rent.  It is deliberately a *model*, not the
 * game: perfect service, no walking, no story scenes.  That is what makes it
 * useful for spotting a broken curve before playing seven days by hand.
 *
 * Usage:
 *   node tools/sim-shanjiao.mjs                 # every policy, 2000 runs each
 *   node tools/sim-shanjiao.mjs --runs=500
 *   node tools/sim-shanjiao.mjs --policy=rentfirst --trace
 *   node tools/sim-shanjiao.mjs --before         # the numbers before the 2026-10 patch
 *   node tools/sim-shanjiao.mjs --boss           # the mountain spirit alone
 *
 * No dependencies.  MIT, like the rest of the repo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const ROOT = join(import.meta.dirname, "..");
const APP = join(ROOT, "registry/apps/shanjiao-diner");

/* ---- the game's data, loaded from the shipped source ---- */
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(APP, "src/10-data.js"), "utf8"), ctx, { filename: "10-data.js" });
const DATA = ctx.DATA;
const INGS = DATA.ING_ORDER;
const MAX_DAY = DATA.MAX_DAY;

/* The 2026-10 patch: supply and the boss.  Before-mode restores the old values
 * so the design note's "before" table stays reproducible. */
const TUNED = {
  // minimal patch: only the supply and the boss, no price/rent changes
  enemies: {
    boss: { hp: 44, atk: 6, def: 1, money: 45 }
  },
  starting: { mushroom: 4, rice: 2, greens: 2 },
  basket: 10,
  stamina: 4
};

/* ---- small helpers ---- */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randint = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = (o) => JSON.parse(JSON.stringify(o));

function makeRules(tuned, before) {
  const dishes = clone(DATA.DISHES);
  const enemies = clone(DATA.ENEMIES);
  const rent = Object.assign({}, DATA.RENT);
  dishes.god_soup.vipOnly = !before;
  if (before) {
    enemies.boss.hp = 72;
    enemies.boss.atk = 6;
  }
  if (tuned) {
    for (const [id, p] of Object.entries(TUNED.dishes || {})) Object.assign(dishes[id], p);
    for (const [id, p] of Object.entries(TUNED.enemies || {})) Object.assign(enemies[id], p);
    Object.assign(rent, TUNED.rent || {});
  }
  return { dishes, enemies, rent, weather: DATA.WEATHER, weatherByDay: DATA.WEATHER_BY_DAY };
}

/* ---- state ---- */
function fresh(rules, tuned) {
  const ing = {};
  for (const k of INGS) ing[k] = 0;
  ing.mushroom = tuned ? TUNED.starting.mushroom : 4;
  ing.rice = 2; ing.greens = 2;
  const unlocked = {};
  for (const id of DATA.DISH_ORDER) if (rules.dishes[id].unlock === "base") unlocked[id] = true;
  const npc = {};
  for (const id of DATA.NPC_ORDER) npc[id] = 0;
  return {
    day: 1, money: 80, rep: 1, ap: 2, weather: rules.weatherByDay[0],
    ing, unlocked, menu: [], stock: {}, upgrades: {}, npc,
    staff: null, flags: {}, stats: { served: 0, lost: 0, earned: 0, tips: 0, stockout: 0 },
    debt: 0, lastRent: null
  };
}

const S = (s) => s; // readability
function ing(s, id) { return s.ing[id] || 0; }
function addIng(s, id, n) { s.ing[id] = Math.max(0, (s.ing[id] || 0) + n); }
function takeIng(s, id, n) { if ((s.ing[id] || 0) < n) return false; s.ing[id] -= n; return true; }
function unlocked(s, rules) { return DATA.DISH_ORDER.filter((id) => s.unlocked[id]); }
function hasUp(s, id) { return !!s.upgrades[id]; }
function serveCount(s, rules) {
  const base = 4 + rules.weather[s.weather].customers + (hasUp(s, "sign") ? 1 : 0) + Math.floor(s.rep / 3);
  return clamp(base, 3, 9);
}
function maxPortionsFor(s, id, rules) {
  const need = rules.dishes[id].need;
  let n = 5;
  for (const k in need) n = Math.min(n, Math.floor(ing(s, k) / need[k]));
  return Math.max(0, n);
}
function canCook(s, plan, rules) {
  const used = {};
  for (const id in plan) {
    const need = rules.dishes[id].need;
    for (const k in need) used[k] = (used[k] || 0) + need[k] * plan[id];
  }
  for (const k in used) if (used[k] > ing(s, k)) return false;
  return true;
}
function cook(s, plan, rules) {
  for (const id in plan) {
    const need = rules.dishes[id].need;
    for (const k in need) takeIng(s, k, need[k] * plan[id]);
  }
  s.menu = Object.keys(plan).filter((id) => plan[id] > 0)
    .sort((a, b) => DATA.DISH_ORDER.indexOf(a) - DATA.DISH_ORDER.indexOf(b));
  s.stock = {};
  for (const id of s.menu) s.stock[id] = plan[id];
}

/* ---- a cooking plan: maximize the expected money from `want` customers ----
 * Customers pick a dish with weight = appeal.  A dish that runs out loses the
 * customer (there is no substitution in the game), so spreading portions is
 * not free.  We score by expected portions sold, not by portions cooked. */
function bestPlan(s, rules, want, focus) {
  const ids = unlocked(s, rules).filter((id) => {
    if (focus && focus.length && !focus.includes(id)) return false;
    return DATA.DISH_ORDER.indexOf(id) < 8;
  });
  // keep the search small: the best few dishes by price, plus anything with
  // a unique ingredient the others cannot use
  ids.sort((a, b) => rules.dishes[b].price - rules.dishes[a].price);
  const keep = ids.slice(0, 6);
  let best = { score: -1, plan: {} };
  const plan = {};
  const used = {};
  function scorePlan() {
    let stock = 0, appeal = 0, revenue = 0;
    for (const id in plan) { if (plan[id] > 0) { stock += plan[id]; appeal += rules.dishes[id].appeal; } }
    if (!stock) return -1;
    for (const id in plan) {
      if (!plan[id]) continue;
      const demand = want * rules.dishes[id].appeal / appeal;
      revenue += Math.min(plan[id], demand) * rules.dishes[id].price;
    }
    // a small bonus for actually using the kitchen and for few kinds
    return revenue + Math.min(stock, want) * 0.01;
  }
  function rec(i, left) {
    if (i === keep.length) {
      const sc = scorePlan();
      if (sc > best.score) best = { score: sc, plan: Object.assign({}, plan) };
      return;
    }
    const id = keep[i];
    const need = rules.dishes[id].need;
    const cap = Math.min(5, left, maxPortionsFor({ ing: Object.fromEntries(INGS.map((k) => [k, ing(s, k) - (used[k] || 0)])) }, id, rules));
    // try the useful counts, high first, then zero
    for (let n = cap; n >= 0; n--) {
      plan[id] = n;
      if (n) for (const k in need) used[k] = (used[k] || 0) + need[k] * n;
      rec(i + 1, left - n);
      if (n) for (const k in need) used[k] -= need[k] * n;
    }
    delete plan[id];
  }
  rec(0, want);
  return best;
}

/* The last night is not a normal service: three regulars each want one named
 * dish.  A good player cooks those three first, then fills the rest of the
 * house with whatever pays best. */
function feastPlan(s, rules, want) {
  const must = ["god_soup", "grilled_fish", "mushroom_soup"].filter((id) => s.unlocked[id]);
  const plan = {};
  for (const id of must) {
    if (maxPortionsFor(s, id, rules) > 0) plan[id] = 1;
  }
  const target = want + 3;
  let total = Object.values(plan).reduce((a, b) => a + b, 0);
  // fill the house with the cheapest portions first: the three regulars must
  // still find their dish, and a lost customer costs a heart.
  let guard = 0;
  while (total < target && guard++ < 24) {
    const ids = unlocked(s, rules).filter((id) => {
      const have = plan[id] || 0;
      return have < 5 && (plan[id] || Object.keys(plan).length < 4);
    });
    ids.sort((a, b) => {
      const ra = maxPortionsFor({ ...s, ing: remainder(s, plan, rules) }, a, rules);
      const rb = maxPortionsFor({ ...s, ing: remainder(s, plan, rules) }, b, rules);
      const ca = Object.values(rules.dishes[a].need).reduce((x, y) => x + y, 0);
      const cb = Object.values(rules.dishes[b].need).reduce((x, y) => x + y, 0);
      return rb - ra || ca - cb || rules.dishes[b].price - rules.dishes[a].price;
    });
    let added = false;
    for (const id of ids) {
      const have = plan[id] || 0;
      const room = maxPortionsFor({ ...s, ing: remainder(s, plan, rules) }, id, rules);
      const add = Math.min(5 - have, target - total, room);
      if (add > 0) {
        plan[id] = have + add;
        total += add;
        added = true;
        break;
      }
    }
    if (!added) break;
  }
  return plan;
}
function remainder(s, plan, rules) {
  const out = Object.assign({}, s.ing);
  for (const id in plan) {
    const need = rules.dishes[id].need;
    for (const k in need) out[k] = (out[k] || 0) - need[k] * plan[id];
  }
  return out;
}

/* ---- battles: a legal, greedy player, not a perfect one ---- */
function battle(s, enemy, rules, r, policy) {
  const atk = 6 + (hasUp(s, "whetstone") ? (policy.tunedWhetstone ? 3 : 2) : 0);
  let hp = enemy.hp, hero = policy.tunedHeroHp || 30, qi = policy.tunedQi || 3;
  const maxHero = hero, maxQi = qi;
  let stun = 0, turn = 1, guard = 0;
  while (hp > 0 && hero > 0 && guard++ < 80) {
    // pick: quick when it is affordable; bandage when low; powder before a smash
    let act = "attack";
    const smashNext = enemy.boss && (turn % 3 === 0);
    if (qi >= 2 && hp > atk * 2 + 4) act = "quick";
    else if (hero <= 10 && qi >= 1 && hp > atk + 2) act = "bandage";
    else if (smashNext && qi >= 1 && hero <= 16) act = "powder";
    if (act === "quick") {
      qi -= 2;
      hp -= Math.max(1, atk * 2 + randint(r, 0, 4) - enemy.def);
    } else if (act === "bandage") {
      qi -= 1;
      hero = Math.min(maxHero, hero + Math.min(10, maxHero - hero));
    } else if (act === "powder") {
      qi -= 1;
      stun = 1;
    } else {
      hp -= Math.max(1, atk + randint(r, 0, 3) - enemy.def);
    }
    if (hp <= 0) return { win: true, hero, turns: turn };
    if (stun > 0) { stun--; }
    else {
      const dmg = enemy.boss && turn % 3 === 0 ? randint(r, 9, 13) : randint(r, Math.max(2, enemy.atk - 1), enemy.atk + 2);
      hero = Math.max(0, hero - dmg);
    }
    turn++;
  }
  return { win: false, hero, turns: turn };
}

/* ---- a trip to the mountain ---- */
const FOREST_NODES = { mushroom: 3, greens: 2, rice: 2, fish: 1, bamboo: 1 };
const DEEP_NODES = { rare: 2, mushroom: 2 };
const FOREST_MONSTERS = ["boar", "monkey", "bamboo"];

function yieldOf(kind, s, r) {
  if (kind === "mushroom") return 2 + (s.weather === "rain" ? 1 : 0) + (r() < 0.3 ? 1 : 0);
  if (kind === "fish") return 1 + (r() < 0.5 ? 1 : 0);
  if (kind === "rare") return 1;
  return 2;
}

function expectedYield(kind, s) {
  if (kind === "mushroom") return 2 + (s.weather === "rain" ? 1 : 0) + 0.3;
  if (kind === "fish") return 1.5;
  if (kind === "rare") return 1;
  return 2;
}

/* estimate what one more of an ingredient is worth: the best plan's revenue
 * with and without it, for the customers we expect tonight */
function marginal(s, rules, want, focus) {
  const base = bestPlan(s, rules, want, focus).score;
  const out = {};
  for (const k of INGS) {
    const before = ing(s, k);
    s.ing[k] = before + 1;
    out[k] = Math.max(0, bestPlan(s, rules, want, focus).score - base);
    s.ing[k] = before;
  }
  return out;
}

function gatherTrip(s, rules, r, policy, deep) {
  const want = serveCount(s, rules);
  const focus = policy.feast ? (deep ? ["god_soup", "mushroom_soup"] : ["grilled_fish", "mushroom_soup"]) : null;
  const staminaMax = policy.tunedStamina || 4;
  let stamina = policy.tunedStamina || 3;
  const basketMax = policy.tunedBasket || 8;
  let basket = 0;
  const gained = {};
  const nodes = Object.assign({}, deep ? DEEP_NODES : FOREST_NODES);
  let monsters = deep
    ? (s.flags.boss ? [] : ["boss"])
    : FOREST_MONSTERS.slice().sort(() => r() - 0.5).slice(0, 2);
  const log = [];
  let shrine = !deep;

  // the shrine is worth the walk once, when it buys two actions
  if (shrine && stamina < staminaMax && policy.useShrine !== false) stamina = Math.min(staminaMax, stamina + 2);

  const add = (kind, n) => {
    const take = Math.min(n, basketMax - basket);
    if (take <= 0) return 0;
    basket += take;
    addIng(s, kind, take);
    gained[kind] = (gained[kind] || 0) + take;
    return take;
  };

  let guard = 0;
  while (stamina > 0 && basket < basketMax && guard++ < 12) {
    // the boss is a one-time goal with its own risk; it is not a farming action
    if (deep && monsters.length && policy.boss) {
      const res = battle(s, rules.enemies.boss, rules, r, policy);
      stamina--;
      monsters = [];
      if (res.win) {
        s.flags.boss = 1;
        s.unlocked.god_soup = true;
        s.money += rules.enemies.boss.money;
        s.rep += 2;
        add("rare", 1);
        log.push(`boss win (${res.turns}t)`);
      } else {
        s.money = Math.max(0, s.money - 5);
        log.push(`boss loss (${res.turns}t)`);
        return { gained, log, basket, fled: true };
      }
      continue;
    }
    // a normal monster: fight it when the drop is needed and we can spare the turn
    if (!deep && monsters.length && policy.fight) {
      const id = monsters[0];
      const def = rules.enemies[id];
      const wantMeat = policy.fight === "meat" ? (ing(s, "meat") < 2) : true;
      const value = def.money + (def.drops ? def.drops.reduce((a, d) => a + expectedYield(d[0], s) * (marginal(s, rules, want)[d[0]] || 1), 0) : 0);
      const gatherValue = Math.max(...Object.keys(nodes).filter((k) => nodes[k] > 0).map((k) => expectedYield(k, s) * (marginal(s, rules, want, focus)[k] || 0)), 0);
      if (wantMeat && (value >= gatherValue * 0.8 || stamina > 2) && stamina > 1) {
        const res = battle(s, def, rules, r, policy);
        stamina--;
        nodes[id] = 0;
        monsters.shift();
        if (res.win) {
          s.money += randint(r, Math.max(0, def.money - 2), def.money + 2);
          for (const d of def.drops) add(d[0], randint(r, d[1], d[2]));
          log.push(`${id} win`);
        } else {
          s.money = Math.max(0, s.money - 5);
          log.push(`${id} loss`);
          if (policy.fleeOnLoss) return { gained, log, basket, fled: true };
          continue;
        }
        // monster drops count toward the basket
        continue;
      }
      monsters.shift();
    }
    // gather the node that buys the most expected revenue
    const marg = marginal(s, rules, want, focus);
    let bestKind = null, bestVal = -1;
    for (const k of Object.keys(nodes)) {
      if (nodes[k] <= 0) continue;
      const v = expectedYield(k, s) * (marg[k] || 0);
      if (v > bestVal) { bestVal = v; bestKind = k; }
    }
    if (!bestKind) {
      // no useful node: take the scarcest ingredient anyway
      const left = Object.keys(nodes).filter((k) => nodes[k] > 0);
      if (!left.length) break;
      bestKind = left[0];
    }
    nodes[bestKind]--;
    const n = yieldOf(bestKind, s, r);
    const got = add(bestKind, n);
    stamina--;
    log.push(`+${got} ${bestKind}`);
    if (got <= 0) break;
  }
  return { gained, log, basket, fled: false };
}

/* ---- service ---- */
function randomDish(s, rules, r) {
  // the feast dish is not what a passing customer orders; it is cooked for the
  // mountain god's table.  Without this the highest-appeal dish is eaten by the
  // first walk-in and the feast can never happen.
  const pool = s.menu.filter((id) => !rules.dishes[id].vipOnly);
  if (!pool.length) return null;
  let total = 0;
  for (const id of pool) total += rules.dishes[id].appeal;
  let x = r() * total;
  for (const id of pool) {
    x -= rules.dishes[id].appeal;
    if (x <= 0) return id;
  }
  return pool[pool.length - 1];
}

function service(s, rules, r, policy) {
  const n = serveCount(s, rules);
  let served = 0, lost = 0, earned = 0, tips = 0, stockout = 0;
  for (let i = 0; i < n; i++) {
    const dish = randomDish(s, rules, r);
    if (dish && (s.stock[dish] || 0) > 0) {
      s.stock[dish]--;
      if (s.stock[dish] <= 0) delete s.stock[dish];
      const tip = 2 + (r() < 0.5 ? 1 : 0); // patience and a regular
      served++; earned += rules.dishes[dish].price; tips += tip;
      s.money += rules.dishes[dish].price + tip;
    } else {
      lost++;
      if (dish) stockout++;
    }
  }
  s.stats.served += served; s.stats.lost += lost; s.stats.stockout += stockout;
  s.stats.earned += earned; s.stats.tips += tips;
  const repDelta = Math.round(served / 3) - lost;
  return { n, served, lost, earned, tips, repDelta, stockout };
}

/* ---- upgrades ---- */
const upgradeOrder = ["stove", "whetstone", "cellar", "sign", "table"];
function buyUpgrades(s, rules, policy) {
  if (!policy.upgrades) return;
  const reserve = policy.reserve || 0;
  for (const id of policy.upgrades) {
    if (hasUp(s, id)) continue;
    const u = DATA.UPGRADES[id];
    if (!u) continue;
    if (s.rep < u.rep) continue;
    if (s.money - u.cost < reserve) continue;
    s.money -= u.cost;
    s.upgrades[id] = true;
    if (id === "stove") { s.unlocked.grilled_fish = true; s.unlocked.pork = true; }
    if (id === "sign") { /* +1 customer, handled by serveCount */ }
  }
}

/* ---- the week ---- */
function runOne(seed, policy, tuned, before) {
  const rules = makeRules(tuned, before);
  const r = rng(seed);
  const s = fresh(rules, tuned);
  const days = [];

  for (let day = 1; day <= MAX_DAY; day++) {
    s.day = day;
    s.weather = rules.weatherByDay[day - 1];
    s.ap = day === 7 ? 3 : 2;
    s.menu = []; s.stock = {};

    // morning story beats (the game's scripted days)
    if (day === 2) {
      addIng(s, "fish", 2);
      if (s.money >= 10) { s.money -= 10; s.npc.zhou += 2; addIng(s, "fish", 1); }
      else s.npc.zhou += 1;
    } else if (day === 3) {
      s.unlocked.bamboo_pork = true;
      addIng(s, "meat", 2); s.npc.yan += 2;
    } else if (day === 4) {
      if (s.money >= rules.rent[4]) s.npc.po += 1;
    } else if (day === 5) {
      s.unlocked.mushroom_pot = true;
    } else if (day === 6) {
      s.flags.deep = 1;
      s.npc.yan += 1; addIng(s, "meat", 1);
    }

    // shopping before cooking, so a new stove unlocks today's fish
    buyUpgrades(s, rules, policy);

    // one trip (two on the last day), then prep
    const trips = day === 7 ? 2 : 1;
    for (let t = 0; t < trips; t++) {
      if (policy.gather === "none") break;
      const deep = day >= 6 && policy.deep && t === 0;
      gatherTrip(s, rules, r, policy, deep);
    }

    // cook for tonight
    const want = serveCount(s, rules);
    let plan = bestPlan(s, rules, want).plan;
    if (day === 7 && policy.feast) {
      const fp = feastPlan(s, rules, want);
      if (Object.keys(fp).length) plan = fp;
    }
    if (Object.keys(plan).length) cook(s, plan, rules);
    const stock = Object.values(s.stock).reduce((a, b) => a + b, 0);

    // service
    const svc = service(s, rules, r, policy);

    // the critic
    if (day === 5 && s.menu.includes("mushroom_pot") && (svc.served > 0) && !s.flags.criticGood) {
      // the critic is one of the customers; assume the pot was on the menu and served
      s.money += 30; s.rep += 2; s.flags.criticGood = 1;
    }
    // the feast: three regulars walk in on top of the normal rush
    let vip = 0;
    if (day === 7) {
      const best = s.menu.slice().sort((a, b) => rules.dishes[b].price - rules.dishes[a].price)[0];
      const door = [
        ["po", "god_soup"], ["zhou", "grilled_fish"], ["ahe", "mushroom_soup"]
      ];
      for (const [, dish] of door) {
        // the guest orders the named dish when it is on the menu; otherwise
        // they order the best dish like anyone else (they are fed, but not a VIP)
        const ordered = s.menu.includes(dish) ? dish : best;
        if (ordered && (s.stock[ordered] || 0) > 0) {
          s.stock[ordered]--;
          const tip = 3;
          if (ordered === dish) vip++;
          svc.served++; svc.earned += rules.dishes[ordered].price; svc.tips += tip;
          s.money += rules.dishes[ordered].price + tip;
          s.stats.served++; s.stats.earned += rules.dishes[ordered].price; s.stats.tips += tip;
        } else {
          svc.lost++; s.stats.lost++;
        }
      }
      s.flags.vip = vip;
    }

    // the house's reputation is settled after the feast guests are counted
    s.rep = Math.max(0, s.rep + Math.round(svc.served / 3) - svc.lost);

    // night: rent, refund, affinity
    let rentInfo = null;
    const rent = rules.rent[day] || 0;
    if (rent) {
      const due = rent + s.debt;
      const paid = Math.min(s.money, due);
      s.money -= paid;
      s.debt = due - paid;
      s.rep = Math.max(0, s.rep + (s.debt > 0 ? -1 : 1));
      rentInfo = { rent: due, paid, missed: s.debt, day };
    }
    let refund = 0;
    if (hasUp(s, "cellar")) {
      for (const id in s.stock) if (s.stock[id] > 0) {
        const need = rules.dishes[id].need;
        const main = Object.keys(need)[0];
        if (main) { addIng(s, main, Math.min(s.stock[id], 2)); refund++; }
      }
    }
    // regulars: one "first time" scene each, not every night
    if (day === 1 && s.menu.includes("mushroom_soup")) s.npc.ahe += 1;
    if (day === 2 && s.menu.includes("grilled_fish")) s.npc.zhou += 1;
    if (day === 3 && (s.menu.includes("bamboo_pork") || s.menu.includes("pork"))) s.npc.yan += 1;
    if (day === 6 && s.flags.boss) s.npc.ahe = Math.max(4, s.npc.ahe);

    days.push({
      day, weather: s.weather, want, stock, cooked: plan, svc, rent: rentInfo,
      money: s.money, debt: s.debt, rep: s.rep, upgrades: Object.keys(s.upgrades).join(","),
      boss: !!s.flags.boss, vip: s.flags.vip || 0
    });

    s.menu = []; s.stock = {};
    if (s.debt > 0 && day === 7) break;
  }

  const paid = s.debt <= 0;
  const vip = s.flags.vip || 0;
  let ending = "normal";
  if (!paid) ending = "bad";
  else if (vip >= 3 && s.rep >= 8 && s.npc.ahe >= 4) ending = "best";
  else if (s.rep >= 5 || vip >= 1) ending = "good";
  return { ending, money: s.money, debt: s.debt, rep: s.rep, npc: s.npc, stats: s.stats, flags: s.flags, days };
}

/* ---- policies ---- */
const POLICIES = [
  { name: "casual", label: "采菜、做饭、不升级", gather: "smart", fight: false, upgrades: null, reserve: 0 },
  { name: "shopkeeper", label: "先保租，再买灶和刀", gather: "smart", fight: true, upgrades: ["stove", "whetstone", "cellar"], reserve: 60 },
  { name: "expand", label: "先买招牌，多来客人", gather: "smart", fight: true, upgrades: ["sign", "stove", "whetstone", "cellar", "table"], reserve: 30 },
  { name: "rentfirst", label: "房租优先，之后升级", gather: "smart", fight: "meat", upgrades: ["stove", "whetstone"], reserve: 100 },
  { name: "bossrun", label: "第六天进山打山魈", gather: "smart", fight: "meat", upgrades: ["whetstone", "stove", "cellar"], reserve: 60, deep: true, boss: true },
  { name: "tuned", label: "调参后：房租优先 + 打山魈", gather: "smart", fight: "meat", upgrades: ["stove", "whetstone", "cellar"], reserve: 70, deep: true, boss: true, feast: true, tuned: true, tunedStamina: 4, tunedBasket: 10 }
];

function pct(n, d) { return d ? (100 * n / d).toFixed(1) + "%" : "0%"; }
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function f1(n) { return (Math.round(n * 10) / 10).toFixed(1); }

function summarize(runs, policy) {
  const endings = { best: 0, good: 0, normal: 0, bad: 0 };
  for (const x of runs) endings[x.ending]++;
  const d4 = runs.map((x) => (x.days.find((d) => d.day === 4) || {}).money || 0);
  const d7 = runs.map((x) => x.money);
  const days = runs.map((x) => x.days.length);
  const served = runs.map((x, i) => x.stats.served / days[i]);
  const lost = runs.map((x, i) => x.stats.lost / days[i]);
  const stockout = runs.map((x, i) => x.stats.stockout / days[i]);
  const rep = runs.map((x) => x.rep);
  const boss = runs.filter((x) => x.flags.boss).length;
  const missed4 = runs.filter((x) => { const d = x.days.find((y) => y.day === 4); return d && d.rent && d.rent.missed > 0; }).length;
  const missed7 = runs.filter((x) => { const d = x.days.find((y) => y.day === 7); return d && d.rent && d.rent.missed > 0; }).length;
  return {
    policy: policy.name, label: policy.label,
    best: pct(endings.best, runs.length), good: pct(endings.good, runs.length),
    normal: pct(endings.normal, runs.length), bad: pct(endings.bad, runs.length),
    d4money: f1(avg(d4)), d7money: f1(avg(d7)),
    served: f1(avg(served)), lost: f1(avg(lost)), stockout: f1(avg(stockout)),
    rep: f1(avg(rep)), boss: pct(boss, runs.length),
    missed4: pct(missed4, runs.length), missed7: pct(missed7, runs.length)
  };
}

function bossTest(runs) {
  const rows = [];
  for (const hp of [42, 44, 46, 48]) {
    for (const atk of [5, 6]) {
      for (const whet of [false, true]) {
        const rules = makeRules(false);
        rules.enemies.boss.hp = hp;
        rules.enemies.boss.atk = atk;
        let wins = 0, turns = 0;
        for (let i = 0; i < runs; i++) {
          const s = { upgrades: whet ? { whetstone: true } : {} };
          const res = battle(s, rules.enemies.boss, rules, rng(5000 + i), {});
          if (res.win) wins++;
          turns += res.turns;
        }
        rows.push([hp, atk, whet ? "有刀" : "无刀", pct(wins, runs), f1(turns / runs)]);
      }
    }
  }
  const head = ["HP", "atk", "磨刀石", "胜率", "回合"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (row) => row.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  console.log(`山魈单挑模拟，${runs} 局/格（主角 30 HP / 3 气，普通攻击 6 或 8）`);
  console.log(line(head));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(line(row));
}

function main() {
  const args = process.argv.slice(2);
  const get = (k, d) => {
    const a = args.find((x) => x.startsWith("--" + k + "="));
    return a ? a.split("=")[1] : d;
  };
  const runs = Number(get("runs", 2000));
  const only = get("policy", null);
  const trace = args.includes("--trace");
  const before = args.includes("--before");
  const list = (only ? POLICIES.filter((p) => p.name === only) : POLICIES)
    .filter((p) => !(before && p.tuned));
  if (!list.length) { console.error("no such policy:", only); process.exit(2); }
  if (args.includes("--boss")) { bossTest(Number(get("bossruns", 2000))); return; }

  if (trace) {
    const p = list[0];
    const one = runOne(12345, p, p.tuned);
    console.log(`# ${p.name}: ${p.label}`);
    for (const d of one.days) {
      const cooked = Object.entries(d.cooked).filter(([, n]) => n > 0).map(([id, n]) => `${rulesName(id)}x${n}`).join(" ");
      console.log(`day ${d.day} ${d.weather.padEnd(5)} want ${d.want} stock ${d.stock} rep ${d.rep} money ${d.money} debt ${d.debt} | ${cooked} | served ${d.svc.served} lost ${d.svc.lost} stockout ${d.svc.stockout} | rent ${d.rent ? d.rent.paid + "/" + d.rent.rent : "-"}`);
    }
    console.log("ending", one.ending, "money", one.money, "debt", one.debt, "rep", one.rep, "npc", JSON.stringify(one.npc), "flags", JSON.stringify(one.flags));
    return;
  }

  const results = [];
  for (const p of list) {
    const all = [];
    const pp = before ? Object.assign({}, p, { tunedStamina: 0, tunedBasket: 0, feast: false }) : p;
    for (let i = 0; i < runs; i++) all.push(runOne(1000 + i, pp, pp.tuned, before));
    results.push(summarize(all, pp));
  }

  const head = ["policy", "best", "good", "normal", "bad", "day4钱", "day7钱", "客/天", "走/天", "缺菜/天", "名声", "山魈胜", "4日欠", "7日欠"];
  const rows = results.map((r) => [r.policy, r.best, r.good, r.normal, r.bad, r.d4money, r.d7money, r.served, r.lost, r.stockout, r.rep, r.boss, r.missed4, r.missed7]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => String(row[i]).length)));
  const line = (row) => row.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  console.log(`\n${runs} runs per policy${before ? " · pre-patch numbers (boss 72, 3 stamina, basket 8, feast dish orderable)" : ""}`);
  console.log(line(head));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(line(row));
  console.log("\nlegend: 客/天 served per day · 走/天 lost per day · 缺菜/天 customers lost to a sold-out dish");
  console.log("        4日欠 / 7日欠 = share of runs that missed that rent\n");

  // one concrete day-by-day trace of the tuned policy, to read like a playtest
  const tuned = POLICIES.find((p) => p.name === "tuned");
  const one = runOne(20261027, tuned, true);
  console.log(`# trace: ${tuned.name} (tuned numbers), seed 20261027`);
  for (const d of one.days) {
    const cooked = Object.entries(d.cooked).filter(([, n]) => n > 0).map(([id, n]) => `${DATA.DISHES[id].name}x${n}`).join(" ");
    console.log(`day ${d.day} ${d.weather} · want ${d.want} stock ${d.stock} · ${cooked || "no food"} · served ${d.svc.served} lost ${d.svc.lost} · money ${d.money} debt ${d.debt} rep ${d.rep}`);
  }
  console.log(`ending ${one.ending} · money ${one.money} · debt ${one.debt} · rep ${one.rep} · ahe ${one.npc.ahe} · vip ${one.flags.vip || 0} · boss ${!!one.flags.boss}`);
}

function rulesName(id) { return DATA.DISHES[id] ? DATA.DISHES[id].name : id; }

main();
