/* Scripted play-throughs of registry/apps/zhenyao-tower, for frame hashes, the per-frame budget test and
   speed measurements. Runs inside the game's own global scope: in node:vm (tests/app-vm.mjs) or in a
   browser page (tests/zhenyao-perf.mjs). The host provides __frame() (one screen refresh) and __yield()
   (lets pending promises run). Input goes through keyboard events, like a player's.
   PLAY.run(name, onFrame) plays one scene from the title; onFrame(info) is called after every refresh
   that the scene records, with {f, tris, lights}. */
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

  var SCENES = {
    /* the title: the camera circles the tower for five seconds */
    title: { frames: 300, policy: function () { return []; } },
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
    road: mapScene("road"), floor1: mapScene("floor1"), floor2: mapScene("floor2"), top: mapScene("top")
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
