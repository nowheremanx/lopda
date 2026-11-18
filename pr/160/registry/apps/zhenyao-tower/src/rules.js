/* Battle rules: pure arithmetic over BATTLE (src/battle-data.js). No drawing, no input, no timers,
   so the same code runs in the game and in the Node simulator (tests/zhenyao-sim.mjs).
   rng is a function returning 0..1. Every action changes the state and returns a list of events
   for the battle scene to animate:
     {kind: "damage", side: "enemy"|"hero", target, amount, weak, crit}
     {kind: "heal", hp}  {kind: "mana", mp}  {kind: "defend"}  {kind: "flee", ok}
     {kind: "gather"}  (the boss is charging)  {kind: "down", target}  (an enemy falls) */
var Rules = (function () {
  var B = BATTLE;

  function stats(level) {
    var b = B.HERO.base, g = B.HERO.grow, n = level - 1;
    return {
      maxHp: Math.round(b.hp + g.hp * n), maxMp: Math.round(b.mp + g.mp * n),
      atk: Math.round(b.atk + g.atk * n), def: Math.round(b.def + g.def * n), mag: Math.round(b.mag + g.mag * n)
    };
  }
  function spellsAt(level) { return B.SPELL_ORDER.filter(function (id) { return B.SPELLS[id].level <= level; }); }
  function levelFor(xp) { var l = 1; while (l + 1 < B.XP.length && xp >= B.XP[l + 1]) l++; return l; }

  function newHero(level) {
    level = level || 1;
    var s = stats(level), items = {};
    Object.keys(B.START_ITEMS).forEach(function (k) { items[k] = B.START_ITEMS[k]; });
    return { level: level, xp: B.XP[level], hp: s.maxHp, mp: s.maxMp, items: items };
  }
  /* a save point: back to full */
  function rest(hero) { var s = stats(hero.level); hero.hp = s.maxHp; hero.mp = s.maxMp; }

  function enemy(id) {
    var d = B.ENEMIES[id];
    return { id: id, def: d, name: d.name, hp: d.hp, maxHp: d.hp, weak: weakTo(d.element), turns: 0, gathering: false };
  }
  /* the element that overcomes e */
  function weakTo(e) {
    var k = Object.keys(B.ELEMENTS).filter(function (x) { return B.ELEMENTS[x].beats === e; });
    return k[0] || null;
  }
  /* two enemies of the same kind get 甲/乙 after their names */
  function start(hero, ids) {
    var foes = ids.map(enemy), seen = {};
    foes.forEach(function (f) { seen[f.id] = (seen[f.id] || 0) + 1; });
    var n = {};
    foes.forEach(function (f) { if (seen[f.id] > 1) { n[f.id] = (n[f.id] || 0) + 1; f.name += "甲乙丙"[n[f.id] - 1]; } });
    return { hero: hero, foes: foes, defending: false, round: 0, boss: foes.some(function (f) { return f.def.boss; }) };
  }
  function alive(b) { return b.foes.filter(function (f) { return f.hp > 0; }); }
  /* "win", "lose", or null while the fight goes on (fleeing is reported by the flee event) */
  function result(b) { return b.hero.hp <= 0 ? "lose" : alive(b).length ? null : "win"; }

  function vary(rng) { return 0.9 + rng() * 0.2; }
  function hurt(b, f, amount, ev) {
    f.hp = Math.max(0, f.hp - amount);
    ev.target = b.foes.indexOf(f);
    var out = [ev];
    if (f.hp === 0) out.push({ kind: "down", target: ev.target });
    return out;
  }

  /* what a spell would do to one enemy, before the random spread: for menus and the simulator */
  function spellDamage(hero, spellId, f) {
    var sp = B.SPELLS[spellId], s = stats(hero.level);
    return sp.power * s.mag / 10 * (sp.element && sp.element === f.weak ? 2 : 1);
  }
  function canCast(hero, spellId) { return spellsAt(hero.level).indexOf(spellId) >= 0 && hero.mp >= B.SPELLS[spellId].mp; }

  /* an item taken from the bag, in a fight or on the map: heals up to the maximum. Returns {hp, mp} gained,
     or null (and changes nothing) when there is none left, or when it would do nothing because that bar is full
     (a battle passes anyway: the menu there has always let you waste one) */
  function useItem(hero, id, anyway) {
    var it = B.ITEMS[id], s = stats(hero.level);
    if (!it || !(hero.items[id] > 0)) return null;
    var hp = it.hp ? Math.min(it.hp, s.maxHp - hero.hp) : 0, mp = it.mp ? Math.min(it.mp, s.maxMp - hero.mp) : 0;
    if (hp + mp <= 0 && !anyway) return null;
    hero.items[id]--;
    hero.hp += hp; hero.mp += mp;
    return { hp: hp, mp: mp };
  }

  /* action: {type: "attack", target} | {type: "spell", id, target} | {type: "item", id} | {type: "defend"} | {type: "flee"}
     target is an index into b.foes; "all" spells ignore it */
  function heroAct(b, action, rng) {
    var h = b.hero, s = stats(h.level), ev = [];
    b.defending = false;
    b.round++;
    if (action.type === "attack") {
      var f = b.foes[action.target];
      var crit = rng() < B.CRIT_CHANCE;
      var dmg = Math.max(1, Math.round(s.atk * vary(rng) * (crit ? 1.5 : 1) - f.def.def * 0.5));
      ev = hurt(b, f, dmg, { kind: "damage", side: "enemy", amount: dmg, weak: false, crit: crit });
    } else if (action.type === "spell") {
      var sp = B.SPELLS[action.id];
      if (!canCast(h, action.id)) throw new Error("cannot cast " + action.id);
      h.mp -= sp.mp;
      var targets = sp.target === "all" ? alive(b) : [b.foes[action.target]];
      targets.forEach(function (t) {
        var weak = !!sp.element && sp.element === t.weak;
        var d = Math.max(1, Math.round(sp.power * s.mag / 10 * vary(rng) * (weak ? 2 : 1)));
        ev = ev.concat(hurt(b, t, d, { kind: "damage", side: "enemy", amount: d, weak: weak, crit: false }));
      });
    } else if (action.type === "item") {
      var used = useItem(h, action.id, true);
      if (!used) throw new Error("cannot use " + action.id);
      if (B.ITEMS[action.id].hp) ev.push({ kind: "heal", hp: used.hp });
      if (B.ITEMS[action.id].mp) ev.push({ kind: "mana", mp: used.mp });
    } else if (action.type === "defend") {
      b.defending = true;
      var g = Math.min(B.DEFEND_MP, s.maxMp - h.mp);
      h.mp += g;
      ev.push({ kind: "defend" }, { kind: "mana", mp: g });
    } else if (action.type === "flee") {
      var ok = !b.boss && rng() < B.FLEE_CHANCE;
      ev.push({ kind: "flee", ok: ok });
      if (ok) b.fled = true;
    }
    return ev;
  }

  /* enemy i takes its turn. Returns {move: name of what it did, fx, events} */
  function enemyAct(b, i, rng) {
    var f = b.foes[i], d = f.def, h = b.hero, s = stats(h.level);
    f.turns++;
    if (d.charge && !f.gathering && f.turns % d.charge.every === 0) {
      f.gathering = true;
      return { move: d.charge.gather, fx: "gather", gather: true, events: [{ kind: "gather", target: i }] };
    }
    var mult = 1, move = d.move, big = false;
    if (f.gathering) { f.gathering = false; mult = d.charge.mult; move = d.charge.move; big = true; }
    var dmg = Math.max(1, Math.round((d.atk * vary(rng) * mult - s.def * 0.5) * (b.defending ? 0.5 : 1)));
    h.hp = Math.max(0, h.hp - dmg);
    return { move: move, fx: big ? "tidal" : d.fx, big: big, events: [{ kind: "damage", side: "hero", target: i, amount: dmg, weak: false, crit: big }] };
  }

  /* after a win: experience from every enemy. Returns [{level, learned: [spell ids]}] for each level gained */
  function reward(b) {
    var h = b.hero, xp = 0;
    b.foes.forEach(function (f) { xp += f.def.xp; });
    var before = h.level;
    h.xp += xp;
    var ups = [];
    for (var l = before + 1; l <= levelFor(h.xp); l++) {
      var old = stats(l - 1), now = stats(l);
      h.hp += now.maxHp - old.maxHp; h.mp += now.maxMp - old.maxMp;
      ups.push({ level: l, learned: B.SPELL_ORDER.filter(function (id) { return B.SPELLS[id].level === l; }) });
    }
    h.level = levelFor(h.xp);
    return { xp: xp, ups: ups };
  }

  return {
    stats: stats, spellsAt: spellsAt, levelFor: levelFor, newHero: newHero, rest: rest, weakTo: weakTo,
    start: start, alive: alive, result: result, heroAct: heroAct, enemyAct: enemyAct, reward: reward,
    spellDamage: spellDamage, canCast: canCast, useItem: useItem
  };
})();
