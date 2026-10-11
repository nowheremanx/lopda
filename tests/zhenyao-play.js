/* Scripted play-throughs of registry/apps/zhenyao-tower, for frame hashes, the per-frame budget test and
   speed measurements. Runs inside the game's own global scope: in node:vm (tests/app-vm.mjs) or in a
   browser page (tests/zhenyao-perf.mjs). The host provides __frame() (one screen refresh) and __yield()
   (lets pending promises run). Input goes through keyboard events, like a player's.
   PLAY.run(name, onFrame) plays one scene from the title; onFrame(info) is called after every refresh
   that the scene records, with {f, tris, lights}.
   Scene "full" plays the whole game with key events only: from 进入小镇 on the title to 序章 完. It walks each map
   with a breadth-first search (the master, the stone, the chests, the enemies in order, the way on), taps A through
   every dialogue and fights like the "smart" player of tests/zhenyao-sim.mjs (weak spells, a pill when low,
   defend when the boss gathers, 七级浮屠 when it pays). */
var PLAY = (function () {
  var KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", a: "x", b: "z", start: "Enter", select: "Shift" };
  var held = {};
  function hold(list) {
    var want = {};
    list.forEach(function (b) { want[b] = true; });
    Object.keys(KEYS).forEach(function (b) {
      if (want[b] && !held[b]) dispatchEvent(new KeyboardEvent("keydown", { key: KEYS[b] }));
      if (!want[b] && held[b]) dispatchEvent(new KeyboardEvent("keyup", { key: KEYS[b] }));
    });
    held = want;
  }
  /* one button tapped every 6 frames (pressed for 3) */
  function tap(f, b) { return f % 6 < 3 ? [b] : []; }
  var overlay = function () { var s = game.top(); return s && !s.enter; };

  /* the battle menus, played by a fixed policy: choose() names a command, and a spell for "spell" */
  function battlePolicy(choose) {
    return function (f) {
      var S = Battle.S(), m = S && S.menu;
      if (!m) return [];
      if (f % 6 >= 3) return [];
      if (m.kind === "cmd") {
        var CMDS = ["attack", "spell", "item", "defend", "flee"], want = CMDS.indexOf(choose(S).cmd);
        if (m.i === want) return ["a"];
        if (Math.floor(m.i / 2) !== Math.floor(want / 2)) return [want > m.i ? "down" : "up"];
        return [want > m.i ? "right" : "left"];
      }
      if (m.kind === "list") {
        var c = choose(S), k = c.spell ? Rules.spellsAt(S.b.hero.level).indexOf(c.spell) : 0;
        if (m.i === k) return ["a"];
        return [k > m.i ? "down" : "up"];
      }
      return ["a"];
    };
  }
  /* the boss fight: defend when it gathers, 七级浮屠 while there is mana, attack otherwise */
  function bossChoice(S) {
    var h = S.b.hero;
    if (S.b.foes.some(function (x) { return x.gathering === true && x.hp > 0; })) return { cmd: "defend" };
    if (h.mp >= BATTLE.SPELLS.pagoda.mp) return { cmd: "spell", spell: "pagoda" };
    return { cmd: "attack" };
  }
  /* an ordinary fight: every spell in turn while there is mana */
  function cycleChoice(S) {
    var h = S.b.hero, ids = Rules.spellsAt(h.level).filter(function (id) { return id !== "pagoda" && Rules.canCast(h, id); });
    S.cycle = (S.cycle || 0);
    if (!ids.length) return { cmd: "attack" };
    var c = S.pick || (S.pick = ids[S.cycle++ % ids.length]);
    return { cmd: "spell", spell: c };
  }

  /* any fight on a map: drink a pill when low, defend when the boss gathers, otherwise every spell in turn */
  function mapFightChoice(S) {
    var h = S.b.hero, st = Rules.stats(h.level);
    if (S.b.boss) return bossChoice(S);
    if (h.hp < st.maxHp * 0.35 && h.items.pill > 0) return { cmd: "item" };
    return cycleChoice(S);
  }
  var D4 = [["up", 0, -1], ["down", 0, 1], ["left", -1, 0], ["right", 1, 0]];
  /* breadth-first walk over the map's tiles: the first button of a way to a tile that goal(c, r) accepts,
     never through the reach of a fight (one tile round an enemy) that is not the one we want */
  function firstStep(goal, forbid) {
    var seen = {}, q = [[hero.c, hero.r, null]];
    seen[hero.c + "," + hero.r] = 1;
    while (q.length) {
      var p = q.shift();
      if (goal(p[0], p[1])) return p[2];
      for (var i = 0; i < 4; i++) {
        var c = p[0] + D4[i][1], r = p[1] + D4[i][2];
        if (seen[c + "," + r] || blocked(c, r) || forbid(c, r)) continue;
        seen[c + "," + r] = 1;
        q.push([c, r, p[2] || D4[i][0]]);
      }
    }
    return null;
  }
  /* a map scene: walk to the next fight (they come in order), then to the exit: the gate, the stairs, or the boss row.
     Done when the map changes, or ten seconds into the boss fight. */
  function mapScene(id) {
    return {
      frames: 12000, map: true, start: function () { ZT.goto(id, { entered: true }); },
      policy: function (f, sc) {
        if (overlay()) return tap(f, "a");
        if (where === "battle") {
          var S = Battle.S();
          /* the boss fight ends the walk on the top: ten seconds of it are played, then done */
          if (S && S.b.boss) { sc.boss = sc.boss == null ? f : sc.boss; if (f - sc.boss > 600) sc.done = true; }
          if (S && !S.menu) S.pick = null;
          return battlePolicy(mapFightChoice)(f);
        }
        if (busy || !hero || !cur) return [];
        if (sc.id == null) sc.id = cur.id;
        if (cur.id !== sc.id) { sc.done = true; return []; }
        var rows = cur.rows, exit = null;
        foes.sort(function (a, b) { return a.k - b.k; });
        if (foes.length) {
          var want = foes[0], near = function (e) { return function (c, r) { return Math.max(Math.abs(e.c - c), Math.abs(e.r - r)) <= 1; }; };
          var d = firstStep(near(want), function (c, r) { return foes.some(function (e) { return e !== want && near(e)(c, r); }); });
          return d ? [d] : [];
        }
        if (id === "top") {
          var north = firstStep(function (c, r) { return r <= STORY.top.bossRow; }, function () { return false; });
          return north ? [north] : [];
        }
        rows.forEach(function (row, r) { var c = row.indexOf(id === "road" ? "G" : "^"); if (c >= 0) exit = { c: c, r: r }; });
        if (hero.c === exit.c && hero.r === exit.r + 1) return ["up"];
        var step = firstStep(function (c, r) { return c === exit.c && r === exit.r + 1; }, function () { return false; });
        return step ? [step] : [];
      }
    };
  }


  /* ---------- the whole game ---------- */
  var living = function (b) { return b.foes.map(function (f, i) { return f.hp > 0 ? i : -1; }).filter(function (i) { return i >= 0; }); };
  /* the "smart" player of tests/zhenyao-sim.mjs (makeSmart(false)): what to do now, as a Rules action */
  function smartAction(b) {
    var h = b.hero, s = Rules.stats(h.level), idx = living(b), cands = [], castable = 0;
    if (h.hp < s.maxHp * 0.35 && h.items.pill > 0) return { type: "item", id: "pill" };
    if (b.foes.some(function (f) { return f.gathering === true && f.hp > 0; })) return { type: "defend" };
    var contrib = function (f, dmg) { return Math.min(f.hp, dmg); };
    idx.forEach(function (i) {
      var f = b.foes[i], dmg = contrib(f, s.atk - f.def.def * 0.5);
      cands.push({ action: { type: "attack", target: i }, score: dmg + (dmg >= f.hp ? 2 : 0), mp: 0 });
    });
    BATTLE.SPELL_ORDER.forEach(function (id) {
      if (Rules.spellsAt(h.level).indexOf(id) < 0 || !Rules.canCast(h, id)) return;
      var sp = BATTLE.SPELLS[id];
      if (sp.target === "all") {
        var total = 0, kills = 0;
        castable++;
        idx.forEach(function (i) { var f = b.foes[i], d = Rules.spellDamage(h, id, f); total += contrib(f, d); if (d >= f.hp) kills++; });
        cands.push({ action: { type: "spell", id: id, target: 0 }, score: total + kills * 2, mp: sp.mp });
      } else {
        idx.forEach(function (i) {
          var f = b.foes[i], d = Rules.spellDamage(h, id, f);
          castable++;
          cands.push({ action: { type: "spell", id: id, target: i }, score: contrib(f, d) + (d >= f.hp ? 2 : 0), mp: sp.mp });
        });
      }
    });
    if (!castable && h.items.ether > 0 && h.mp < s.maxMp * 0.25) return { type: "item", id: "ether" };
    cands.sort(function (x, y) { return y.score - x.score || x.mp - y.mp; });
    return cands[0].action;
  }
  /* the battle's menus, driven to the action smartAction chose when the command menu came up. Between menus, A cuts an
     animation the game has shown before (that is what a player does, and it saves most of the time) */
  function battleDrive(f) {
    var S = Battle.S(), m = S && S.menu;
    if (!S) return [];
    if (!m) { S.plan = null; return S.canSkip ? tap(f, "a") : []; }
    if (f % 6 >= 3) return [];
    var p = S.plan || (S.plan = smartAction(S.b));
    if (m.kind === "cmd") {
      var want = { attack: 0, spell: 1, item: 2, defend: 3, flee: 4 }[p.type];
      if (m.i === want) return ["a"];
      if (Math.floor(m.i / 2) !== Math.floor(want / 2)) return [want > m.i ? "down" : "up"];
      return [want > m.i ? "right" : "left"];
    }
    if (m.kind === "list") {
      var k = p.type === "spell" ? Rules.spellsAt(S.b.hero.level).indexOf(p.id) : BATTLE.ITEM_ORDER.indexOf(p.id);
      return m.i === k ? ["a"] : [k > m.i ? "down" : "up"];
    }
    if (m.kind === "target") {
      if (m.all) return ["a"];
      var live = living(S.b);
      return live.indexOf(m.i) === live.indexOf(p.target) ? ["a"] : ["right"];
    }
    return ["a"];
  }
  /* stand next to the tile (tx, ty), face it and press A */
  function talkTo(tx, ty, f) {
    var d = null;
    D4.forEach(function (e) { if (hero.c + e[1] === tx && hero.r + e[2] === ty) d = e[0]; });
    if (d) return hero.face !== d ? [d] : tap(f, "a");
    var step = firstStep(function (c, r) { return Math.abs(c - tx) + Math.abs(r - ty) === 1; }, function () { return false; });
    return step ? [step] : null;
  }
  /* what to do on a map when nothing is open: null when there is nothing to do (wait) */
  function mapDrive(f) {
    var id = cur.id, P = cur.P, none = function () { return false; };
    if (id === "town") {
      if (!flags.master) {
        var mp = people.filter(function (p) { return p.who === "master"; })[0];
        return talkTo(mp.x, mp.y, f) || [];
      }
      if (hero.r === 0) return tap(f, "up");
      var north = firstStep(function (c, r) { return r === 0; }, none);
      return north ? [north] : [];
    }
    var go = null;
    /* the stone first (it fills HP and MP and keeps the way back), then the chests */
    if (P.saves[0] && !(runSave && runSave.map === id)) go = talkTo(P.saves[0].c, P.saves[0].r, f);
    if (!go) P.chests.forEach(function (c, i) { if (!go && !flags.opened[id + ":" + i]) go = talkTo(c.c, c.r, f); });
    if (go) return go;
    foes.sort(function (a, b) { return a.k - b.k; });
    if (foes.length) {
      var want = foes[0], near = function (e) { return function (c, r) { return Math.max(Math.abs(e.c - c), Math.abs(e.r - r)) <= 1; }; };
      var d = firstStep(near(want), function (c, r) { return foes.some(function (e) { return e !== want && near(e)(c, r); }); });
      return d ? [d] : [];
    }
    if (id === "top") {
      var up = firstStep(function (c, r) { return r <= STORY.top.bossRow; }, none);
      return up ? [up] : [];
    }
    var exit = null;
    cur.rows.forEach(function (row, r) { var c = row.indexOf(id === "road" ? "G" : "^"); if (c >= 0) exit = { c: c, r: r }; });
    if (hero.c === exit.c && hero.r === exit.r + 1) return tap(f, "up");
    var to = firstStep(function (c, r) { return c === exit.c && r === exit.r + 1; }, none);
    return to ? [to] : [];
  }
  function fullPolicy(f, sc) {
    var s = where;
    if (s !== "title") sc.down = false;
    if (overlay()) {
      /* the title's menu lists 继续 first when a save exists: one down to 进入小镇 */
      if (s === "title" && lastSave && !sc.down) { sc.down = true; return ["down"]; }
      return tap(f, "a");
    }
    if (s === "title") return tap(f, "a");
    if (s === "credits") { if (ended) sc.done = true; return []; }
    if (s === "battle") return battleDrive(f);
    if (s !== "map" || busy || !hero || !cur) return [];
    return mapDrive(f);
  }
  /* the cutscenes of phase 2, each from where the game starts it, with A through every dialogue */
  function cutscene(start, done) {
    return {
      frames: 6000, map: true, start: start,
      /* the title (the ending's last stop, reached after 待续) is the town's scene, with its own budget */
      record: function (f, sc) { return !(sc.left && (where === "title" || (where === "credits" && cr.phase === "next"))); },
      policy: function (f, sc) {
        if (where !== "title") sc.left = true;
        if (sc.left && done(sc)) { sc.done = true; return []; }
        if (overlay() || where === "credits") return tap(f, "a");
        return where === "map" && !busy && hero && cur.id === "top" ? ["up"] : [];
      }
    };
  }

  var SCENES = {
    /* the title: the camera circles the tower for five seconds */
    title: { frames: 300, policy: function () { return []; } },
    /* the title for one whole turn of its camera (0.12 rad/s), for the budget: it sees the forest from every side */
    titleTurn: { frames: 3200, policy: function () { return []; } },
    /* the town: in through the title menu, the camera's intro, the first words, then a walk round the square
       and up the road to the sign at the north edge */
    town: {
      frames: 2400,
      route: [["up", 40], ["left", 50], ["up", 60], ["right", 110], ["down", 40], ["right", 40], ["up", 200], ["left", 30], ["up", 120]],
      policy: function (f, sc) {
        if (overlay() || typeof hero === "undefined" || !hero) return tap(f, "a");
        if (busy) return [];
        sc.walk = sc.walk == null ? f : sc.walk;
        var t = f - sc.walk;
        for (var i = 0; i < sc.route.length; i++) { if (t < sc.route[i][1]) return [sc.route[i][0]]; t -= sc.route[i][1]; }
        sc.done = true;
        return [];
      }
    },
    /* the boss fight on the top of the tower, from its intro to the end or 80 seconds */
    boss: { frames: 4800, start: function () { ZT.fight(3, 0); }, policy: battlePolicy(bossChoice) },
    /* 七级浮屠 in the boss fight: only the frames from the cast to the next menu are recorded */
    pagoda: {
      frames: 4800, start: function () { ZT.fight(3, 0); },
      policy: function (f, sc) {
        var S = Battle.S();
        if (S && S.menu && S.menu.kind === "target" && sc.cast == null && f % 6 < 3) sc.cast = f;
        if (sc.cast != null && f > sc.cast + 10 && S.menu && S.menu.kind === "cmd") sc.done = true;
        return battlePolicy(function () { return { cmd: "spell", spell: "pagoda" }; })(f);
      },
      record: function (f, sc) { return sc.cast != null; }
    },
    /* a fight inside the tower (four braziers): every spell once or more */
    tower: {
      frames: 4200, start: function () { ZT.fight(1, 2); },
      policy: function (f, sc) {
        var S = Battle.S();
        if (S && !S.menu) S.pick = null;
        return battlePolicy(cycleChoice)(f);
      }
    },
    /* a fight on the rainy road, the one with three enemies: rain streaks and splashes on top of the arena */
    rain: {
      frames: 4200, start: function () { ZT.fight(0, 4); },
      policy: function (f, sc) {
        var S = Battle.S();
        if (S && !S.menu) S.pick = null;
        return battlePolicy(cycleChoice)(f);
      }
    },
    /* the maps after the town: from ZT.goto to the gate, the stairs or the boss row, every fight on the way played */
    road: mapScene("road"), floor1: mapScene("floor1"), floor2: mapScene("floor2"), top: mapScene("top"),
    /* the boss's entrance: from the boss row, through the master, the ripple and the mirage, to its first menu */
    bossEntrance: cutscene(function () { ZT.goto("top", { entered: true, x: 5, y: 7 }); },
      function () { var S = where === "battle" && Battle.S(); return !!(S && S.menu); }),
    /* the pendant scene: as the fight is won, to the dawn map */
    pendant: cutscene(function () { ZT.goto("top", { entered: true, win: true }); },
      function () { return where === "map" && cur.id === "ending"; }),
    /* the ending: the report, the hand, the answer, the last shot, 序章 完, the roll, 待续, and back on the title */
    ending: cutscene(function () { ZT.goto("ending"); }, function () { return where === "title"; }),
    /* the whole game, from a new game to 序章 完 */
    full: { frames: 600000, policy: fullPolicy }
  };

  async function run(name, onFrame) {
    var sc = Object.assign({}, SCENES[name]);
    __frame(); await __yield();
    if (sc.start) sc.start();
    for (var f = 0; f < sc.frames && !sc.done; f++) {
      hold(sc.policy(f, sc));
      __frame();
      await __yield();
      if (onFrame && (!sc.record || sc.record(f, sc))) onFrame({ f: f, tris: R.stats.tris, lights: R.lights.length });
      /* a fight is over when the game is back on the title */
      if (sc.start && !sc.map && f > 60 && game.top() && game.top().enter && game.top().enter !== Battle.scene.enter) break;
    }
    hold([]);
    return f;
  }
  return { run: run, SCENES: Object.keys(SCENES) };
})();
