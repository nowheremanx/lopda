// registry/apps/zhenyao-tower: battle rules and balance (see tests/zhenyao-sim.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read } from "./helpers.mjs";
import { report } from "./zhenyao-sim.mjs";

// acceptance criteria from the handoff
const MIN_SMART_ROUTE_WIN = 0.95;
const MAX_NOWEAK_BOSS_WIN = 0.1;
const MAX_ATTACKONLY_BOSS_WIN = 0.05;
const MIN_LEVEL_AT_BOSS = 7;
const MAX_TEXT = 13;
const SEEDS = 300;

const ctx = vm.createContext({ console });
for (const f of ["battle-data.js", "rules.js"]) vm.runInContext(read("registry/apps/zhenyao-tower/src/" + f), ctx);
const { Rules, BATTLE } = ctx;
const half = () => 0.5;
const dmgTo = (ev, side) => ev.filter((e) => e.kind === "damage" && e.side === side)[0].amount;

test("weaknesses follow the five-element cycle", () => {
  assert.equal(Rules.weakTo("fire"), "water");
  assert.equal(Rules.weakTo("wood"), "metal");
  assert.equal(Rules.weakTo("earth"), "wood");
  assert.equal(Rules.weakTo("water"), "earth");
  assert.equal(Rules.weakTo("metal"), "fire");
});

test("a weak spell does exactly double", () => {
  const hero = Rules.newHero(5), f = Rules.start(hero, ["fox"]).foes[0];
  assert.equal(f.weak, "water");
  const plain = Rules.spellDamage(hero, "sword", f);
  const weak = Rules.spellDamage(hero, "tide", f);
  const sp = BATTLE.SPELLS.tide;
  assert.equal(weak, sp.power * Rules.stats(5).mag / 10 * 2);
  assert.equal(weak / 2, sp.power * Rules.stats(5).mag / 10);
  assert.ok(plain > 0);
  const b = Rules.start(hero, ["fox"]);
  const ev = Rules.heroAct(b, { type: "spell", id: "tide", target: 0 }, half);
  assert.equal(ev[0].weak, true);
  assert.equal(ev[0].amount, Math.round(weak));
});

test("defending halves enemy damage", () => {
  const a = Rules.start(Rules.newHero(3), ["golem"]), b = Rules.start(Rules.newHero(3), ["golem"]);
  a.defending = false; b.defending = true;
  const x = dmgTo(Rules.enemyAct(a, 0, half).events, "hero"), y = dmgTo(Rules.enemyAct(b, 0, half).events, "hero");
  assert.ok(y < x && Math.abs(y - x / 2) <= 1, `${x} vs ${y}`);
});

test("you cannot flee from the boss", () => {
  const b = Rules.start(Rules.newHero(7), ["mirage"]);
  for (let i = 0; i < 20; i++) assert.equal(Rules.heroAct(b, { type: "flee" }, () => 0)[0].ok, false);
  assert.ok(!b.fled);
});

test("items decrement and never heal above max", () => {
  const h = Rules.newHero(4), s = Rules.stats(4), b = Rules.start(h, ["fox"]);
  h.hp = s.maxHp - 5; h.mp = s.maxMp - 2;
  const pills = h.items.pill, ethers = h.items.ether;
  Rules.heroAct(b, { type: "item", id: "pill" }, half);
  Rules.heroAct(b, { type: "item", id: "ether" }, half);
  assert.equal(h.items.pill, pills - 1);
  assert.equal(h.items.ether, ethers - 1);
  assert.equal(h.hp, s.maxHp);
  assert.equal(h.mp, s.maxMp);
});

test("reward levels up and lists learned spells", () => {
  const h = Rules.newHero(1), b = Rules.start(h, ["golem", "golem", "golem"]);
  b.foes.forEach((f) => (f.hp = 0));
  const r = Rules.reward(b);
  assert.ok(h.level >= 2);
  assert.equal(r.ups.length, h.level - 1);
  assert.ok(r.ups[0].learned.indexOf("vine") >= 0, "level 2 teaches vine");
  const h2 = Rules.newHero(6), b2 = Rules.start(h2, ["bronze", "bronze", "bronze", "bronze"]);
  b2.foes.forEach((f) => (f.hp = 0));
  const learned = Rules.reward(b2).ups.flatMap((u) => u.learned);
  assert.ok(learned.indexOf("pagoda") >= 0);
});

test("data is complete: every spell and art key exists", () => {
  for (const id of BATTLE.SPELL_ORDER) assert.ok(BATTLE.SPELLS[id], id);
  assert.equal(BATTLE.SPELL_ORDER.length, Object.keys(BATTLE.SPELLS).length);
  for (const [id, e] of Object.entries(BATTLE.ENEMIES)) {
    assert.equal(typeof e.art, "string", id);
    assert.ok(e.art.length > 0, id);
  }
});

test("battle text fits the screen", () => {
  const texts = [];
  for (const e of Object.values(BATTLE.ENEMIES)) {
    texts.push(e.name, e.move);
    if (e.charge) texts.push(e.charge.gather, e.charge.move);
  }
  for (const s of Object.values(BATTLE.SPELLS)) texts.push(s.name);
  for (const i of Object.values(BATTLE.ITEMS)) texts.push(i.name);
  for (const t of texts) assert.ok(Array.from(t).length <= MAX_TEXT, t);
});

const rep = report({ seeds: SEEDS });

test("balance: a smart player wins the route without grinding", () => {
  assert.ok(rep.policies.smart.routeWinRate >= MIN_SMART_ROUTE_WIN, `win rate ${rep.policies.smart.routeWinRate}`);
});

test("balance: the boss needs the weakness", () => {
  assert.ok(rep.bossOnly.noWeak <= MAX_NOWEAK_BOSS_WIN, `noWeak ${rep.bossOnly.noWeak}`);
  assert.ok(rep.bossOnly.attackOnly <= MAX_ATTACKONLY_BOSS_WIN, `attackOnly ${rep.bossOnly.attackOnly}`);
});

test("balance: a smart hero reaches the boss at level 7 or more", () => {
  assert.ok(rep.policies.smart.minLevelAtBoss >= MIN_LEVEL_AT_BOSS,
    `avg ${rep.policies.smart.levelAtBoss}, min ${rep.policies.smart.minLevelAtBoss}`);
});
