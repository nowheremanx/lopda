// registry/apps/zhenyao-tower: battle rules and balance (see tests/zhenyao-sim.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { join } from "node:path";
import { read, ROOT } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";
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

/* ---------- the foe's HP bar in a fight ----------
   The target panel is paper, so the part of the bar still there must be ink and the part lost paper; a paper
   fill made a full bar look empty and an emptying one fuller (src/battle.js bar(), drawn at 6, 133, 148). */
const APP = join(ROOT, "registry", "apps", "zhenyao-tower", "index.html");
const INK = "31,42,20";      // #1f2a14
const PAPER = "163,173,126"; // #a3ad7e

test("the foe bar is ink for the HP left and paper for the HP lost", async () => {
  let last = null;
  const app = boot(APP, { seed: 7, onPut: (img) => { last = img; } });
  const yieldNow = app.ctx.get("__yield");
  const run = async (n) => { for (let i = 0; i < n; i++) { app.frame(); await yieldNow(); } };
  const send = app.ctx.get("dispatchEvent"), KE = app.ctx.get("KeyboardEvent");
  /* one press, then a frame with the button up: the menus only read it on the frame it goes down */
  const press = async (key) => {
    send(new KE("keydown", { key: key })); await run(1);
    send(new KE("keyup", { key: key })); await run(1);
  };
  const menuKind = () => { const s = app.ctx.get("Battle.S()"); return s && s.menu ? s.menu.kind : null; };
  const px = (x, y) => {
    const o = (y * 160 + x) * 4;
    return last.data[o] + "," + last.data[o + 1] + "," + last.data[o + 2];
  };
  /* the bar's inside line: x 7..152 of y 134, the two pixels of paper or ink inside the 4 px frame */
  const line = () => { const out = []; for (let x = 7; x <= 152; x++) out.push(px(x, 134)); return out; };

  await run(5);
  app.ctx.get("ZT.fight(0, 0)");              // 狐火 on the road, one foe, at full HP
  let n = 0;
  for (; n < 2000 && menuKind() !== "cmd"; n++) await run(1);
  assert.equal(menuKind(), "cmd", "the fight reached its command menu");
  await press("x");                           // 攻击: the target panel comes up
  for (n = 0; n < 200 && menuKind() !== "target"; n++) await run(1);
  assert.equal(menuKind(), "target", "the target panel is up");
  await run(1);                               // one frame with it drawn, nothing pressed
  assert.ok(last, "a frame reached the screen");
  const S = app.ctx.get("Battle.S()"), i = S.menu.i;
  const shown = line();
  assert.deepEqual(shown.filter((c) => c !== INK), [], "at full HP the whole inside line is ink");
  /* half the HP: the left half of the line is ink, the right half paper */
  S.foes[i].shown = Math.floor(S.b.foes[i].maxHp / 2);
  await run(1);
  const fw = Math.round(146 * S.foes[i].shown / S.b.foes[i].maxHp), half = line();
  assert.ok(fw > 0 && fw < 146, `half HP leaves part of the bar: ${fw} of 146`);
  assert.deepEqual(half.slice(0, fw).filter((c) => c !== INK), [], `the ${fw} pixels of HP left are ink`);
  assert.deepEqual(half.slice(fw).filter((c) => c !== PAPER), [], `the ${146 - fw} pixels lost are paper`);
});

/* ---- touch on the menus and the skip question, and disabled rows (DeepSeek review #459 #460) ---- */

const MID = "125,138,88";    // #7d8a58

async function tapGame() {
  let last = null;
  const app = boot(APP, { seed: 7, onPut: (img) => { last = img; } });
  const yieldNow = app.ctx.get("__yield");
  const run = async (n) => { for (let i = 0; i < n; i++) { app.frame(); await yieldNow(); } };
  const send = app.ctx.get("dispatchEvent"), KE = app.ctx.get("KeyboardEvent");
  const press = async (key) => { send(new KE("keydown", { key: key })); await run(1); send(new KE("keyup", { key: key })); await run(1); };
  const tap = async (x, y) => { app.pointer("pointerdown", x, y); await run(1); app.pointer("pointerup", x, y); await run(1); };
  const menu = () => { const s = app.ctx.get("Battle.S()"); return s && s.menu ? s.menu : null; };
  const px = (x, y) => { const o = (y * 160 + x) * 4; return last.data[o] + "," + last.data[o + 1] + "," + last.data[o + 2]; };
  await run(5);
  return { app, run, press, tap, menu, px, get: app.ctx.get };
}

test("a tap on a battle command runs that command, not the one under the arrow (#459)", async () => {
  const z = await tapGame();
  z.get("ZT.fight(0, 0)");
  let n = 0;
  for (; n < 2000 && !(z.menu() && z.menu().kind === "cmd"); n++) await z.run(1);
  assert.equal(z.menu().kind, "cmd");
  assert.equal(z.menu().i, 0, "the arrow is on 攻击");
  await z.tap(70, 108);                       // 法术
  for (n = 0; n < 50 && z.menu().kind === "cmd"; n++) await z.run(1);
  assert.equal(z.menu().kind, "list", "the tap on 法术 opens the spell list");
  await z.tap(80, 50);                        // above the list window: back
  for (n = 0; n < 50 && z.menu().kind !== "cmd"; n++) await z.run(1);
  assert.equal(z.menu().kind, "cmd", "a tap above the list is B");
  await z.tap(130, 120);                      // the Lv / 五行 panel: nothing
  await z.run(5);
  assert.equal(z.menu().kind, "cmd", "a tap outside the commands does nothing");
  await z.tap(20, 108);                       // 攻击
  for (n = 0; n < 50 && z.menu().kind === "cmd"; n++) await z.run(1);
  assert.equal(z.menu().kind, "target", "the tap on 攻击 picks a target next");
});

test("spells the hero can't pay for are dark and struck through, never mid on paper (#460)", async () => {
  const z = await tapGame();
  z.get("ZT.fight(1, 0)");
  let n = 0;
  for (; n < 2000 && !(z.menu() && z.menu().kind === "cmd"); n++) await z.run(1);
  z.get("Battle.S()").b.hero.mp = 0;
  await z.press("ArrowRight");                // 法术
  await z.press("x");
  for (n = 0; n < 50 && z.menu().kind !== "list"; n++) await z.run(1);
  assert.equal(z.menu().kind, "list");
  assert.ok(z.menu().items.every((it) => it.off), "with no 法力 every spell is off");
  await z.run(2);
  const mids = [];
  for (let y = 104; y < 142; y++) for (let x = 13; x < 156; x++) if (z.px(x, y) === MID) mids.push(x + "," + y);
  assert.deepEqual(mids, [], "no mid pixels in the rows");
  await z.tap(40, 108);                       // a row that is off: err, the list stays
  await z.run(3);
  assert.equal(z.menu().kind, "list", "a tap on an off row does not cast it");
});

test("the field menu and the skip question take taps (#459)", async () => {
  const z = await tapGame();
  z.get("ZT.goto('road', { entered: true })");
  await z.run(60);
  assert.equal(z.get("ZT").state().map, "road");
  await z.press("Enter");
  assert.equal(z.get("fm").kind, "main", "START opens the field menu");
  await z.tap(120, 31);                       // 状态
  assert.equal(z.get("fm").kind, "status", "a tap on 状态 opens it");
  await z.tap(80, 60);
  assert.equal(z.get("fm").kind, "main", "a tap on the status page goes back");
  await z.tap(120, 18);                       // 物品
  assert.equal(z.get("fm").kind, "items");
  await z.tap(80, 70);                        // between the windows: back
  assert.equal(z.get("fm").kind, "main");
  await z.tap(30, 100);                       // outside the menu window: closed
  assert.equal(z.get("fm"), null, "a tap outside the field menu closes it");

  const Cut = z.get("Cut");
  let done = false;
  Cut.play("test-skip", async (T) => { await T.wait(30); }).then(() => { done = true; });
  await z.run(3);
  await z.press("Enter");
  assert.equal(Cut.state().asking, true, "START asks 跳过这段剧情？");
  await z.tap(110, 50);                       // 「B 否」
  assert.equal(Cut.state().asking, false, "a tap on 否 answers no");
  assert.equal(done, false, "the cutscene goes on");
  await z.press("Enter");
  await z.tap(40, 50);                        // 「A 是」
  for (let i = 0; i < 10 && !done; i++) await z.run(1);
  assert.equal(done, true, "a tap on 是 skips the cutscene");
});

test("Down from 防御 lands on 逃跑, the short last row (#465)", async () => {
  const z = await tapGame();
  z.get("ZT.fight(0, 0)");
  let n = 0;
  for (; n < 2000 && !(z.menu() && z.menu().kind === "cmd"); n++) await z.run(1);
  z.menu().i = 3;                              // 防御
  await z.press("ArrowDown");
  assert.equal(z.menu().i, 4, "逃跑");
  await z.press("ArrowDown");
  assert.equal(z.menu().i, 4, "nothing below the last row");
  await z.press("ArrowUp");
  assert.equal(z.menu().i, 2, "Up from 逃跑 is 物品, the cell above it");
});

test("a pill for a full bar is refused in battle as on the map, and kept (#464)", async () => {
  const z = await tapGame();
  z.get("ZT.fight(0, 0)");
  let n = 0;
  for (; n < 2000 && !(z.menu() && z.menu().kind === "cmd"); n++) await z.run(1);
  const S = z.get("Battle.S()"), h = S.b.hero, s = z.get("Rules").stats(h.level);
  h.hp = s.maxHp; h.items.pill = 2;
  z.menu().i = 2;                              // 物品
  await z.press("x");
  for (n = 0; n < 50 && z.menu().kind !== "list"; n++) await z.run(1);
  assert.equal(z.menu().kind, "list");
  assert.match(z.menu().items[0].info, /已满/, "the list says the bar is full");
  await z.press("x");                          // 回春丹
  for (n = 0; n < 200 && !(z.menu() && z.menu().kind === "cmd"); n++) await z.run(1);
  assert.equal(h.items.pill, 2, "the pill is kept");
  assert.equal(z.menu().kind, "cmd", "back to the commands, the turn not spent");
});

test("a spell for all shows what the living foes fear, and the list marks 克制 (#462)", async () => {
  const z = await tapGame();
  z.get("ZT.fight(0, 0)");
  let n = 0;
  for (; n < 2000 && !(z.menu() && z.menu().kind === "cmd"); n++) await z.run(1);
  const S = z.get("Battle.S()"), Rules = z.get("Rules"), B = z.get("BATTLE");
  S.b.hero.level = 10; S.b.hero.mp = 999;
  const ids = Rules.spellsAt(10), weak = S.b.foes.map((f) => f.weak);
  z.menu().i = 1;                              // 法术
  await z.press("x");
  for (n = 0; n < 50 && z.menu().kind !== "list"; n++) await z.run(1);
  const items = z.menu().items;
  ids.forEach((id, k) => {
    const el = B.SPELLS[id].element;
    assert.equal(/克制/.test(items[k].info), !!el && weak.includes(el), id + ": " + items[k].info);
  });
  const all = ids.findIndex((id) => B.SPELLS[id].target === "all");
  const drawn = [];
  const g = z.get("game").g, text = g.text;
  g.text = function (t) { drawn.push(String(t)); return text.apply(g, arguments); };
  for (let k = 0; k < all; k++) await z.press("ArrowDown");
  await z.press("x");
  for (n = 0; n < 50 && z.menu().kind !== "target"; n++) await z.run(1);
  await z.run(2);
  g.text = text;
  const fear = drawn.find((t) => t.startsWith("怕"));
  assert.ok(fear, "the panel for all names a weakness");
  for (const w of weak) assert.ok(fear.includes(B.ELEMENTS[w].name), fear);
});

test("演武 names its way out: 逃跑 reads 离开 and the opening says how it works (#463)", async () => {
  const z = await tapGame();
  const said = [];
  z.get("game").go("battle", { ids: ["golem", "wraith", "bronze"], area: "top", hero: z.get("galleryHero")(), demo: true, back: "title", from: new Uint8Array(z.get("R").image.px) }, { fade: false });
  let n = 0;
  for (; n < 3000 && !(z.menu() && z.menu().kind === "cmd"); n++) {
    await z.run(1);
    const m = z.get("Battle.S()") && z.get("Battle.S()").msg;
    if (m && !said.includes(m)) said.push(m);
  }
  assert.ok(said.some((m) => m.includes("离开")), said.join(" | "));
  const drawn = [];
  const g = z.get("game").g, text = g.text;
  g.text = function (t) { drawn.push(String(t)); return text.apply(g, arguments); };
  await z.run(2);
  g.text = text;
  assert.ok(drawn.includes("离开") && !drawn.includes("逃跑"), "the command reads 离开");
});

test("克制 and 飞剑诀 stay soft: triangle, under 1.2 kHz, attack 3 ms or more (#461)", () => {
  const ctx = vm.createContext({ console, Object, PAD: { music: {} } });
  vm.runInContext(read("registry/apps/zhenyao-tower/src/sound.js") + "\nthis.Snd = Snd;", ctx);
  for (const name of ["weak", "swordCast"]) {
    for (const s of ctx.Snd.FX[name].s) {
      assert.notEqual(s.wave, "square", name);
      assert.ok(Math.max(s.from, s.to) <= 1200, name + " top note");
      assert.ok(s.attack >= 3, name + " attack");
    }
  }
});
