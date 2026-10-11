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
    }
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
      if (sc.start && f > 60 && game.top() && game.top().enter && game.top().enter !== Battle.scene.enter) break;
    }
    hold([]);
    return f;
  }
  return { run: run, SCENES: Object.keys(SCENES) };
})();
