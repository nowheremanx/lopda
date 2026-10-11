/* The battle scene: a 3D arena, the HUD and menus, and the turn loop. The rules are in src/rules.js;
   what every move looks like is in src/spells.js.
   game.go("battle", {ids, area, hero, back, from}) starts a fight. hero is a Rules hero (it is changed in place);
   from is a copy of the last frame, for the transition. When the fight ends it goes to args.back with
   {result: "win" | "lose" | "fled", hero}. */
var Battle = (function () {
  var S = null, ARENAS = {};
  var SKY = { road: [0.1, 0.42], tower: [0.04, 0.16], upper: [0.04, 0.16], top: [0.16, 0.5] };
  var HOME = { x: 0, y: 0, z: 1.0, yaw: -0.4, pitch: -0.17, dist: 6.6, focal: 124 };

  /* ---------- the animation clock ----------
     Battle animations wait and tween on this clock instead of lo-game's, so an animation the player has
     seen before can be cut short: cut() finishes every pending tween and timer at once, and while
     S.skip is set new ones finish as soon as they start. The rules have settled the result already. */
  var EASE = {
    linear: function (t) { return t; },
    out: function (t) { return 1 - (1 - t) * (1 - t); },
    "in": function (t) { return t * t; },
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t); }
  };
  var tweens = [], timers = [], none = function () {};
  var skipping = function () { return !!(S && S.skip); };
  function settle(w) { for (var p in w.to) w.obj[p] = w.to[p]; w.done(); }
  var T = {
    tween: function (obj, to, sec, ease) {
      return new Promise(function (res) {
        var w = { obj: obj, from: {}, to: to, dur: Math.max(1 / 60, sec), t: 0, ease: EASE[ease || "out"] || EASE.out, done: res };
        for (var p in to) w.from[p] = obj[p];
        if (skipping()) settle(w); else tweens.push(w);
      });
    },
    after: function (sec, fn) {
      if (skipping()) { fn(); return none; }
      var t = { left: sec, fn: fn };
      timers.push(t);
      return function () { t.dead = true; };
    },
    /* repeating timers drive motion only; a cut drops them */
    every: function (sec, fn) {
      if (skipping()) return none;
      var t = { left: sec, every: sec, fn: fn };
      timers.push(t);
      return function () { t.dead = true; };
    },
    wait: function (sec) { return new Promise(function (res) { T.after(sec, res); }); },
    flash: function (sec) { if (!skipping()) game.flash(sec); },
    shake: function (a, sec) { if (!skipping()) game.shake(a, sec); },
    sfx: function (name) { if (!skipping()) game.sfx(name); }
  };
  function stepClock(dt) {
    tweens = tweens.filter(function (w) {
      w.t = Math.min(1, w.t + dt / w.dur);
      var k = w.ease(w.t);
      for (var p in w.to) w.obj[p] = w.from[p] + (w.to[p] - w.from[p]) * k;
      if (w.t >= 1) { w.done(); return false; }
      return true;
    });
    var due = [];
    timers = timers.filter(function (t) {
      if (t.dead) return false;
      t.left -= dt;
      if (t.left > 0) return true;
      due.push(t);
      if (t.every) { t.left += t.every; return true; }
      return false;
    });
    due.forEach(function (t) { if (!t.dead) t.fn(); });
  }
  function cut() {
    S.skip = true; S.frozen = 0;
    var tw = tweens, tm = timers;
    tweens = []; timers = [];
    tw.forEach(settle);
    tm.forEach(function (t) { if (!t.dead && !t.every) t.fn(); });
  }

  /* animations seen in this session, by key ("spell:sword", "foe:狐火"); main.js saves them with the game */
  var SEEN = {};
  /* play an animation: the first time in full, after that A cuts to the result */
  async function play(key, fn) {
    S.canSkip = !!SEEN[key];
    SEEN[key] = true;
    S.skip = false;
    await fn();
    if (S.skip) tidy();
    S.canSkip = false; S.skip = false;
  }
  /* after a cut: everything an animation borrows goes back to rest */
  function tidy() {
    FX.reset();
    Object.assign(S.cam, HOME);
    S.light = 1; S.sky = 1; S.bars = 0; S.hud = true; S.ripple = 0; S.punch = 1; S.rays = null; S.title = ""; S.msg = "";
    var h = S.hero;
    h.pose = null; h.art = ART.heroUp0; h.x = S.heroHome[0]; h.z = S.heroHome[1];
    S.frozen = 0;
    /* a foe that fell during the cut is already gone (its timer fired); just stop the flicker */
    S.foes.forEach(function (f) { f.ox = f.oy = f.oz = 0; f.dying = false; f.fade = f.gone ? 1 : 0; });
  }

  /* ---------- the arena, built once per area ---------- */
  function torch(m, glow, lights, x, z, h) {
    m.box(x - 0.08, 0, z - 0.08, x + 0.08, h, z + 0.08, 0.25);
    glow.box(x - 0.2, h, z - 0.2, x + 0.2, h + 0.35, z + 0.2, 0.95);
    lights.push({ x: x, y: h + 0.25, z: z, radius: 5.5, power: 0.9, base: 0.9, seed: x * 3 + z });
  }
  function buildArena(area) {
    var m = Lo3D.builder(), glow = Lo3D.builder(), lights = [], hash = World.hash, x, z, i, a;
    var inside = area === "tower" || area === "upper";
    /* the platform: stone tiles in a circle, a dark rim, then the ground around it */
    for (x = -12; x < 12; x++) for (z = -12; z < 12; z++) {
      var d = Math.sqrt((x + 0.5) * (x + 0.5) + (z + 0.5) * (z + 0.5)), h = hash(x + 40, z + 40);
      var alb = d < 4.3 ? ((x + z) & 1 ? 0.66 : 0.6) + h * 0.05 : d < 4.9 ? 0.32 : inside ? 0.42 + h * 0.06 : area === "top" ? 0.5 + h * 0.05 : 0.4 + h * 0.07;
      if (area === "top" && d > 7.5) continue;
      m.quad([x, 0, z], [x + 1, 0, z], [x + 1, 0, z + 1], [x, 0, z + 1], [0, 1, 0], alb);
    }
    if (area === "road") {
      /* pines all around, and mountains far off */
      for (i = 0; i < 46; i++) {
        a = i / 46 * Math.PI * 2 + hash(i, 1) * 0.1;
        var r = 7 + hash(i, 2) * 5;
        if (Math.abs(Math.sin(a)) < 0.35 && Math.cos(a) < 0) continue;   /* the road behind the hero */
        World.tree(m, Math.cos(a) * r, Math.sin(a) * r, 1.2 + hash(i, 3) * 0.8, r > 9);
      }
      for (i = 0; i < 9; i++) { a = i / 9 * Math.PI * 2 + 0.3; m.cone(Math.cos(a) * 26, 0, Math.sin(a) * 26, 8, 7 + hash(i, 5) * 4, 5, 0.35, 0.1); }
      torch(m, glow, lights, -4.6, -0.6, 1.6); torch(m, glow, lights, 4.6, -0.6, 1.6);
    } else if (inside) {
      /* inside the tower: a ring of pillars, the wall far behind, braziers */
      for (i = 0; i < 8; i++) {
        a = (i + 0.5) / 8 * Math.PI * 2;
        x = Math.cos(a) * 7; z = Math.sin(a) * 7;
        m.box(x - 0.45, 0, z - 0.45, x + 0.45, 7, z + 0.45, area === "upper" ? 0.7 : 0.85);
      }
      for (i = 0; i < 24; i++) {
        var a0 = i / 24 * Math.PI * 2, a1 = (i + 1) / 24 * Math.PI * 2, R0 = 11;
        m.quad([Math.cos(a0) * R0, 0, Math.sin(a0) * R0], [Math.cos(a1) * R0, 0, Math.sin(a1) * R0], [Math.cos(a1) * R0, 8, Math.sin(a1) * R0], [Math.cos(a0) * R0, 8, Math.sin(a0) * R0],
          [-Math.cos((a0 + a1) / 2), 0, -Math.sin((a0 + a1) / 2)], i & 1 ? 0.55 : 0.5);
      }
      torch(m, glow, lights, -4.8, 0.4, 1.1); torch(m, glow, lights, 4.8, 0.4, 1.1);
      torch(m, glow, lights, -3.2, 4.6, 1.1); torch(m, glow, lights, 3.2, 4.6, 1.1);
    } else {
      /* the top of the tower: a railing around the roof, open sky */
      for (i = 0; i < 20; i++) {
        a = i / 20 * Math.PI * 2;
        x = Math.cos(a) * 7.3; z = Math.sin(a) * 7.3;
        m.box(x - 0.12, 0, z - 0.12, x + 0.12, 0.9, z + 0.12, 0.8);
      }
      torch(m, glow, lights, -5, 3, 1.3); torch(m, glow, lights, 5, 3, 1.3);
    }
    return { mesh: m, glow: glow, lights: lights, area: area };
  }
  var SHADOW = Lo3D.shadow(1, 10);

  /* where the foes stand: one in the middle, or spread across the far side */
  var SPOTS = { 1: [[0, 2.6]], 2: [[-1.6, 2.4], [1.6, 2.4]], 3: [[-2.8, 2.2], [0, 3.0], [2.8, 2.2]] };

  function setup(args) {
    var area = args.area || "road";
    var A = ARENAS[area] || (ARENAS[area] = buildArena(area));
    var b = Rules.start(args.hero, args.ids);
    /* 演武 (the spell gallery): practice dummies that take every hit and never strike back */
    if (args.demo) b.foes.forEach(function (f) { f.hp = f.maxHp = 999; });
    var spots = SPOTS[b.foes.length];
    S = {
      args: args, b: b, A: A, area: area,
      cam: Object.assign({}, HOME), home: HOME,
      heroHome: [-1.2, -1.5], hero: { x: -1.2, y: 0, z: -1.5, art: ART.heroUp0, pose: null, flash: 0, hide: false, flip: false },
      foes: b.foes.map(function (f, i) {
        var boss = f.def.boss, art = B_ART[f.def.art];
        return { x: boss ? 0 : spots[i][0], y: 0, z: boss ? 4.4 : spots[i][1], art: art, scale: boss ? 0.15 : 0.115,
          ox: 0, oy: 0, oz: 0, fade: 0, flash: 0, hide: false, gone: false, shown: f.hp, boss: boss };
      }),
      view: { hp: args.hero.hp, mp: args.hero.mp },
      nums: [], msg: "", title: "", hud: true, bars: 0, sky: 1, light: 1, stars: area === "road" || area === "top",
      menu: null, poll: null, lastCmd: 0, guard: 0, frozen: 0
    };
    FX.reset();
    tweens = []; timers = [];
    return S;
  }

  /* ---------- helpers for src/spells.js ---------- */
  function foeTop(i, k) { var f = S.foes[i]; return [f.x + f.ox, f.y + f.oy + f.art.h * f.scale * (k == null ? 0.55 : k), f.z + f.oz]; }
  function heroAt(k) { var h = S.hero; return [h.x, h.y + 1.1 * (k == null ? 0.55 : k), h.z]; }
  function camTo(o, sec, ease) { return T.tween(S.cam, o, sec, ease || "inOut"); }
  function home(sec) { return camTo(HOME, sec == null ? 0.5 : sec); }
  /* a camera aimed at point p from angle yaw */
  function look(p, yaw, pitch, dist, sec, ease) { return camTo({ x: p[0], y: p[1], z: p[2], yaw: yaw, pitch: pitch, dist: dist }, sec, ease); }
  function popup(text, p, o) { S.nums.push(Object.assign({ text: String(text), p: p, t: 0, life: 1.0 }, o || {})); }

  /* show what the rules already decided: numbers, flashes, falls. Damage events for one foe, or all of them */
  async function show(events, only) {
    var weakHit = null;
    events.forEach(function (e) {
      if (e.kind === "damage" && e.side === "enemy" && (only == null || only === e.target)) {
        var f = S.foes[e.target];
        f.shown = Math.max(0, f.shown - e.amount);
        f.flash = 0.25;
        popup(e.amount, foeTop(e.target, 0.8), { big: e.weak || e.crit });
        if (e.weak) { popup("克制", foeTop(e.target, 1.15), { word: true }); weakHit = e.target; }
        else if (e.crit) popup("会心", foeTop(e.target, 1.15), { word: true });
      }
      if (e.kind === "damage" && e.side === "hero") {
        S.view.hp = Math.max(0, S.view.hp - e.amount);
        S.hero.flash = 0.3;
        popup(e.amount, heroAt(1.0), { big: e.crit });
      }
      if (e.kind === "heal") { S.view.hp += e.hp; popup("+" + e.hp, heroAt(1.0)); }
      if (e.kind === "mana" && e.mp) { S.view.mp += e.mp; popup("+" + e.mp, heroAt(0.6), { mp: true }); }
    });
    T.sfx("hit");
    if (weakHit != null) await ANIM.weak(S, weakHit);
    var downs = events.filter(function (e) { return e.kind === "down" && (only == null || only === e.target); });
    for (var i = 0; i < downs.length; i++) ANIM.down(S, downs[i].target);
    if (downs.length) await T.wait(0.5);
  }

  /* ---------- drawing ---------- */
  /* A foe takes point light (sprite `lit`) only while a spell's light reaches it: a lit sprite goes through the
     dither, which blurs its drawn tones, so it stays exact the rest of the time. */
  function lit(f, lights) {
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i], dx = L.x - f.x - f.ox, dy = L.y - f.art.h * f.scale * 0.5, dz = L.z - f.z - f.oz;
      if (dx * dx + dy * dy + dz * dz < L.radius * L.radius) return true;
    }
    return false;
  }
  function render(g) {
    var A = S.A, c = S.cam, cam = R.camera, t = game.time;
    cam.x = c.x; cam.y = c.y; cam.z = c.z; cam.yaw = c.yaw; cam.pitch = c.pitch; cam.dist = c.dist; cam.focal = c.focal;
    var inside = S.area === "tower" || S.area === "upper";
    R.sun = { dir: Lo3D.norm([-0.45, 0.75, -0.5]), ambient: (inside ? 0.22 : 0.28) * S.light, diffuse: (inside ? 0.32 : 0.48) * S.light };
    R.fog = { near: c.dist + 4, far: c.dist + 26, lum: (inside ? 0.12 : 0.4) * S.sky };
    R.focus = { near: c.dist - 5, far: c.dist + 7 };
    R.near = 0.3;
    var sky = SKY[S.area];
    R.clear(function (y) { return (sky[0] + (sky[1] - sky[0]) * Math.min(1, y / 70)) * S.sky; });
    var ls = A.lights.map(function (L) {
      L.power = L.base * S.light * (0.82 + 0.18 * Math.sin(t * 11 + L.seed * 7) * Math.sin(t * 4.3 + L.seed));
      return L;
    });
    var fxLights = FX.lights();
    R.lights = ls.concat(fxLights);
    R.draw(A.mesh);
    R.draw(A.glow, null, { bias: 0.5 * S.light });
    FX.each("draw", R);
    var h = S.hero;
    S.foes.forEach(function (f) {
      if (f.gone) return;
      var w = f.art.w * f.scale * 0.42;
      R.draw(SHADOW, function (p) { return [p[0] * w + f.x + f.ox, p[1], p[2] * w * 0.6 + f.z + f.oz]; }, { alpha: 1 - f.fade });
    });
    if (!h.hide) R.draw(SHADOW, function (p) { return [p[0] * 0.38 + h.x, p[1], p[2] * 0.3 + h.z]; });
    S.foes.forEach(function (f, i) {
      if (f.gone || f.hide) return;
      /* floating foes bob; flashes turn the sprite white */
      var bob = f.boss ? Math.sin(t * 1.6) * 0.12 : f.art === B_ART.fox || f.art === B_ART.wraith ? 0.15 + Math.sin(t * 3 + i) * 0.08 : 0;
      R.sprite(f.art, f.x + f.ox, f.y + f.oy + bob, f.z + f.oz, { scale: f.scale, alpha: 1 - f.fade, snap: f.boss, lit: lit(f, fxLights), map: f.flash > 0 && (Math.floor(t * 30) & 1) ? [3, 3, 3, 3] : null });
    });
    if (!h.hide && !(h.flash > 0 && (Math.floor(t * 30) & 1))) R.sprite(h.pose || h.art, h.x, h.y, h.z, { scale: 1 / 14, flip: h.flip });
    R.present();
    if (S.area === "road") Weather.rain(R, c, t);
    if (S.stars) for (var s = 0; s < 30; s++) {
      var a = World.hash(s, 11) * Math.PI * 2, e = 0.25 + World.hash(s, 12) * 0.5;
      if ((s * 5 + Math.floor(t * 2)) % 19) R.dot([Math.cos(a) * 60, Math.sin(e) * 60, Math.sin(a) * 60], 3, 0);
    }
    if (S.guard > 0) {
      /* a ring of light around the hero while defending */
      for (var k = 0; k < 14; k++) { var aa = k / 14 * Math.PI * 2 + t * 2; R.dot([h.x + Math.cos(aa) * 0.55, 0.15 + (k & 1) * 0.5 + Math.sin(t * 4 + k) * 0.1, h.z + Math.sin(aa) * 0.35], 3, 0); }
    }
    FX.drawParts(R);
    FX.each("dots", R);
    FX.each("post", R.image.px);
    g.sprite(R.image, 0, 0);
    ui(g);
  }

  /* ---------- the HUD, numbers and menus ---------- */
  function bar(g, x, y, w, v, max) {
    g.rect(x, y, w, 4, g.INK);
    g.rect(x + 1, y + 1, Math.round((w - 2) * Math.max(0, Math.min(1, v / max))), 2, g.PAPER);
  }
  function outlined(g, text, x, y, color) {
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (d) { g.text(text, x + d[0], y + d[1], { align: "center", color: g.INK }); });
    g.text(text, x, y, { align: "center", color: color == null ? g.PAPER : color });
  }
  function ui(g) {
    var s = Rules.stats(S.b.hero.level);
    /* numbers float up from where they were hit */
    S.nums.forEach(function (n) {
      var p = R.project(n.p);
      if (!p) return;
      var y = p[1] - 8 - Math.min(1, n.t * 4) * 8 - (n.word ? 4 : 0);
      if (n.t > n.life * 0.75 && (Math.floor(n.t * 20) & 1)) return;
      outlined(g, n.text, p[0], y, n.mp ? g.MID : g.PAPER);
    });
    if (S.bars > 0) { var bh = Math.round(S.bars * 16); g.rect(0, 0, 160, bh, g.INK); g.rect(0, 144 - bh, 160, bh, g.INK); }
    if (S.title) { var tw = g.measure(S.title) + 16; g.window(80 - tw / 2, S.hud ? 18 : 20, tw, 20); g.text(S.title, 80, S.hud ? 21 : 23, { align: "center" }); }
    if (!S.hud) return;
    g.rect(0, 0, 160, 15, g.INK);
    g.text("体", 3, 1, { color: g.MID });
    g.text(String(Math.round(S.view.hp)), 16, 1, { color: g.PAPER });
    bar(g, 40, 6, 34, S.view.hp, s.maxHp);
    g.text("法", 82, 1, { color: g.MID });
    g.text(String(Math.round(S.view.mp)), 95, 1, { color: g.PAPER });
    bar(g, 116, 6, 40, S.view.mp, s.maxMp);
    var m = S.menu;
    if (m) menuDraw(g, m, s);
    else if (S.msg) { g.window(0, 114, 160, 30); g.text(S.msg, 80, 122, { align: "center" }); }
  }

  var CMDS = [["attack", "攻击"], ["spell", "法术"], ["item", "物品"], ["defend", "防御"], ["flee", "逃跑"]];
  function menuDraw(g, m, s) {
    var t = game.time;
    if (m.kind === "cmd") {
      g.window(0, 100, 160, 44);
      CMDS.forEach(function (c, i) {
        var x = 16 + (i % 2) * 48, y = 105 + Math.floor(i / 2) * 13;
        if (i === m.i) g.arrow(x - 8, y + 3, "right");
        g.text(c[1], x, y, { color: c[0] === "flee" && S.b.boss ? g.MID : g.INK });
      });
      g.rect(110, 104, 1, 36, g.MID);
      g.text("Lv" + S.b.hero.level, 135, 105, { align: "center" });
      g.text("五行", 135, 118, { align: "center", color: g.DARK });
      g.text("相克", 135, 130, { align: "center", color: g.DARK });
    } else if (m.kind === "list") {
      g.window(0, 100, 160, 44);
      for (var r = 0; r < 3; r++) {
        var k = m.top + r, it = m.items[k];
        if (!it) break;
        var y = 104 + r * 13;
        if (k === m.i) g.arrow(5, y + 3, "right");
        g.text(it.text, 13, y, { color: it.off ? g.MID : g.INK });
        if (it.right) g.text(it.right, 154, y, { align: "right", color: it.off ? g.MID : g.DARK });
      }
      if (m.top > 0) for (var u = 0; u < 4; u++) g.rect(153 - u, 102 + u, 1 + 2 * u, 1, g.INK);
      if (m.top + 3 < m.items.length && Math.floor(t * 3) % 2) g.arrow(150, 139, "down");
      var cur = m.items[m.i];
      if (cur && cur.info) { g.window(0, 15, 160, 22); g.text(cur.info, 80, 19, { align: "center" }); }
    } else if (m.kind === "target") {
      var ids = m.all ? Rules.alive(S.b).map(function (f) { return S.b.foes.indexOf(f); }) : [m.i];
      ids.forEach(function (i) {
        var p = R.project(foeTop(i, 1.05));
        if (p) g.arrow(p[0] - 3, p[1] - 9 + (Math.floor(t * 4) % 2), "down");
      });
      g.window(0, 112, 160, 32);
      if (m.all) g.text("全体", 80, 120, { align: "center" });
      else {
        var f = S.b.foes[m.i], weak = BATTLE.ELEMENTS[f.weak].name;
        g.text(f.name, 6, 116);
        g.text("怕" + weak, 154, 116, { align: "right", color: g.DARK });
        bar(g, 6, 133, 148, S.foes[m.i].shown, f.maxHp);
      }
    }
  }

  /* resolve a promise when fn() returns something, checked once per update */
  function poll(fn) { return new Promise(function (res) { S.poll = function () { var v = fn(); if (v !== undefined) { S.poll = null; res(v); } }; }); }

  function chooseCommand() {
    S.menu = { kind: "cmd", i: S.lastCmd };
    return poll(function () {
      var m = S.menu, d = game.dir(), i = m.i;
      if (d.x) i = (i % 2 === 0 ? i + 1 : i - 1);
      if (d.y) i = i + d.y * 2;
      if (i !== m.i && i >= 0 && i < CMDS.length) { m.i = i; game.sfx("move"); }
      if (game.ok()) { S.lastCmd = m.i; return CMDS[m.i][0]; }
    });
  }
  /* items: [{text, right, info, off}]; resolves with an index, or -1 for B */
  function chooseList(items, start) {
    S.menu = { kind: "list", items: items, i: start || 0, top: 0 };
    S.menu.top = Math.max(0, Math.min(S.menu.i - 1, items.length - 3));
    return poll(function () {
      var m = S.menu, d = game.dir();
      if (d.y) {
        var i = Math.max(0, Math.min(items.length - 1, m.i + d.y));
        if (i !== m.i) { m.i = i; game.sfx("move"); }
        if (m.i < m.top) m.top = m.i;
        if (m.i > m.top + 2) m.top = m.i - 2;
      }
      if (game.pressed("b")) { game.sfx("tap"); return -1; }
      if (game.ok()) {
        if (items[m.i].off) { game.sfx("err"); return; }
        game.sfx("ok");
        return m.i;
      }
    });
  }
  /* pick a living foe; resolves with its index, or -1 for B. all: just confirm every foe */
  function chooseTarget(all) {
    var live = function () { return S.b.foes.map(function (f, i) { return f.hp > 0 ? i : -1; }).filter(function (i) { return i >= 0; }); };
    var L = live(), start = S.lastTarget != null && L.indexOf(S.lastTarget) >= 0 ? S.lastTarget : L[0];
    S.menu = { kind: "target", i: start, all: all };
    var aim = function () { if (!all) camTo({ x: S.foes[S.menu.i].x * 0.4, yaw: HOME.yaw + S.foes[S.menu.i].x * 0.05 }, 0.25, "out"); };
    aim();
    return poll(function () {
      var m = S.menu, d = game.dir();
      if (d.x && !all) {
        var L2 = live(), k = (L2.indexOf(m.i) + d.x + L2.length) % L2.length;
        if (L2[k] !== m.i) { m.i = L2[k]; game.sfx("move"); aim(); }
      }
      if (game.pressed("b")) { game.sfx("tap"); camTo({ x: HOME.x, yaw: HOME.yaw }, 0.25); return -1; }
      if (game.ok()) { game.sfx("ok"); S.lastTarget = m.i; return m.i; }
    });
  }

  /* the hero's turn: menus until there is an action */
  async function heroTurn() {
    var hero = S.b.hero;
    for (;;) {
      S.view.hp = hero.hp; S.view.mp = hero.mp;
      var cmd = await chooseCommand();
      if (cmd === "attack") {
        var t = await chooseTarget(false);
        if (t >= 0) return { type: "attack", target: t };
      } else if (cmd === "spell") {
        var ids = Rules.spellsAt(hero.level);
        var items = ids.map(function (id) {
          var sp = BATTLE.SPELLS[id];
          return { text: sp.name, right: String(sp.mp),
            info: (sp.element ? BATTLE.ELEMENTS[sp.element].name + " · " : "五行 · ") + (sp.target === "all" ? "全体" : "单体"),
            off: hero.mp < sp.mp };
        });
        for (;;) {
          var k = await chooseList(items, S.lastSpell || 0);
          if (k < 0) break;
          S.lastSpell = k;
          var sp = BATTLE.SPELLS[ids[k]];
          var tg = await chooseTarget(sp.target === "all");
          if (tg >= 0) return { type: "spell", id: ids[k], target: tg };
        }
      } else if (cmd === "item") {
        var its = BATTLE.ITEM_ORDER.map(function (id) {
          var it = BATTLE.ITEMS[id];
          return { text: it.name, right: "x" + (hero.items[id] || 0), info: it.hp ? "回复体力 " + it.hp : "回复法力 " + it.mp, off: !(hero.items[id] > 0) };
        });
        var j = await chooseList(its, 0);
        if (j >= 0) return { type: "item", id: BATTLE.ITEM_ORDER[j] };
      } else if (cmd === "defend") return { type: "defend" };
      else if (cmd === "flee") {
        if (S.b.boss) { game.sfx("err"); await say("逃不掉！", 0.8); continue; }
        return { type: "flee" };
      }
    }
  }
  async function say(text, sec) { S.menu = null; S.msg = text; await T.wait(sec == null ? 0.9 : sec); S.msg = ""; }

  async function run() {
    var args = S.args, b = S.b;
    await ANIM.intro(S, args.from);
    if (b.boss) await ANIM.bossIntro(S);
    await say(b.boss ? b.foes[0].name + "现身了！" : b.foes.length === 1 ? b.foes[0].name + "出现了！" : "出现了" + "一两三"[b.foes.length - 1] + "只妖怪！", 1.1);
    var result = null;
    while (!result) {
      var act = await heroTurn();
      S.menu = null;
      S.guard = 0;
      /* leaving 演武 always works */
      var ev = Rules.heroAct(b, act, args.demo && act.type === "flee" ? function () { return 0; } : Math.random);
      if (act.type === "spell") await play("spell:" + act.id, function () { return ANIM.hero(S, act, ev); });
      else await ANIM.hero(S, act, ev);
      if (b.fled) { result = "fled"; break; }
      result = Rules.result(b);
      if (b.defending) S.guard = 1;
      for (var i = 0; i < b.foes.length && !result && !args.demo; i++) {
        if (b.foes[i].hp <= 0) continue;
        var r = Rules.enemyAct(b, i, Math.random);
        await play("foe:" + r.move, function () { return ANIM.enemy(S, i, r); });
        result = Rules.result(b);
      }
    }
    S.menu = null; S.guard = 0;
    if (result === "win") await ANIM.victory(S, Rules.reward(b));
    else if (result === "lose") await ANIM.defeat(S);
    game.go(args.back || "title", Object.assign({ result: result, hero: b.hero }, args.backArgs || {}), { to: LoGame.INK });
  }

  /* main.js registers this as the "battle" scene once the game exists */
  var scene = {
    enter: function (args) { setup(args); run(); },
    update: function (dt) {
      if (S.canSkip && !S.skip && game.ok()) cut();
      stepClock(dt);
      if (S.frozen > 0) S.frozen -= dt;
      FX.step(dt, S.frozen > 0);
      S.nums = S.nums.filter(function (n) { n.t += dt; return n.t < n.life; });
      S.foes.forEach(function (f) { if (f.flash > 0) f.flash -= dt; });
      if (S.hero.flash > 0) S.hero.flash -= dt;
      if (S.poll) S.poll();
    },
    draw: function (g) { render(g); }
  };

  return {
    scene: scene, T: T, S: function () { return S; }, foeTop: foeTop, heroAt: heroAt, camTo: camTo, home: home, look: look,
    popup: popup, show: show, say: say, HOME: HOME,
    /* the animations seen; main.js saves them and merges the saved ones back in at boot */
    seen: function () { return SEEN; }
  };
})();
