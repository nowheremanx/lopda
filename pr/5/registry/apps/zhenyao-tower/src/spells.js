/* What every battle move looks like. Each animation is an async script: it moves the camera, adds
   FX layers and particles, and calls Battle.show(events) at the moment of impact, so numbers appear
   when the hit lands. The rules have already decided the outcome; nothing here changes it. */
var ANIM = (function () {
  var B = Battle, T = Battle.T, wait = T.wait;
  var PI = Math.PI;
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  /* a point along a curve from a over c to b */
  function bez(a, c, b, t) { return mix(mix(a, c, t), mix(c, b, t), t); }
  function targets(ev) {
    var out = [];
    ev.forEach(function (e) { if (e.kind === "damage" && e.side === "enemy" && out.indexOf(e.target) < 0) out.push(e.target); });
    return out;
  }
  /* the middle of the enemy line, on the ground */
  function centre(S) {
    var x = 0, z = 0, n = 0;
    S.foes.forEach(function (f) { if (!f.gone) { x += f.x; z += f.z; n++; } });
    return n ? [x / n, 0, z / n] : [0, 0, 2.5];
  }
  function cast(S, on) { S.hero.pose = on ? B_ART.heroCast : null; }
  function title(S, text, sec) { S.title = text; T.after(sec || 1.2, function () { if (S.title === text) S.title = ""; }); }

  /* ---------- into the fight ---------- */
  async function intro(S, from) {
    var H = B.HOME, pic = from ? new Uint8Array(from) : null;
    Object.assign(S.cam, { yaw: H.yaw + 2.6, pitch: -0.8, dist: 19, y: 2.5 });
    S.hud = false;
    T.sfx("hit");
    T.after(0.3, function () { T.sfx("tick"); });
    T.after(0.55, function () { T.sfx("tick"); });
    /* the last picture twists, breaks into blocks, flashes twice and goes dark; then the arena fades in */
    FX.layer({ life: 1.6, always: true, post: function (px, t) {
      if (t < 0.85) {
        if (pic) px.set(pic);
        FX.wave(px, t * 16, 0.16, t * 28);
        FX.mosaic(px, 1 + t * 10);
        if ((t > 0.28 && t < 0.36) || (t > 0.55 && t < 0.63)) FX.invert(px);
        FX.cover(px, 0, (t - 0.55) / 0.3);
      } else FX.cover(px, 0, 1 - (t - 0.85) / 0.6);
    } });
    await wait(0.85);
    await B.camTo(H, 1.5, "out");
    S.hud = true;
  }

  async function bossIntro(S) {
    var p = B.foeTop(0, 0.6), H = B.HOME;
    S.hud = false;
    await T.tween(S, { bars: 1 }, 0.3);
    B.look(p, H.yaw + 0.5, 0.1, 6, 1.6, "inOut");
    /* mist rising around the shell */
    for (var k = 0; k < 4; k++) T.after(k * 0.3, function () {
      FX.emit(14, function () { var a = Math.random() * PI * 2; return { x: Math.cos(a) * 2.6, y: 0.2, z: 3.6 + Math.sin(a) * 1.4, vy: 0.6 + Math.random(), vx: Math.cos(a) * 0.3, life: 1.6, tone: 2, size: 0.12 }; });
    });
    await wait(1.7);
    T.sfx("lose");
    T.shake(3, 0.6);
    FX.layer({ life: 0.6, post: function (px, t) { FX.wave(px, 3 * (1 - t / 0.6), 0.3, t * 30); } });
    await wait(0.8);
    await B.home(0.8);
    await T.tween(S, { bars: 0 }, 0.3);
    S.hud = true;
  }

  /* ---------- hits ---------- */
  /* a hit on the weakness: the picture stops, flashes negative, and lines burst from the target */
  async function weak(S, i) {
    S.frozen = 0.3;
    T.sfx("coin");
    T.shake(3, 0.35);
    FX.layer({ life: 0.32, always: true, post: function (px, t) {
      var q = R.project(B.foeTop(i));
      if (t < 0.15) FX.invert(px);
      if (q) FX.rays(px, q[0], q[1], 12 + t * 50, 40 + t * 140, 18, t < 0.15 ? 3 : 0, i + t);
    } });
    await wait(0.32);
  }
  function down(S, i) {
    var f = S.foes[i];
    f.dying = true;
    T.after(0.45, function () {
      f.gone = true; f.dying = false;
      var p = B.foeTop(i, 0.5);
      FX.burst(p[0], p[1], p[2], f.boss ? 90 : 26, f.boss ? 4 : 2.4, { tone: 3, life: 0.8, drag: 2 });
      FX.burst(p[0], p[1], p[2], f.boss ? 40 : 12, 1.4, { tone: 1, life: 0.9, drag: 1 });
      T.sfx("tick");
    });
  }

  /* ---------- the hero ---------- */
  async function attack(S, i, ev) {
    var h = S.hero, f = S.foes[i], x0 = h.x, z0 = h.z, H = B.HOME;
    B.camTo({ x: f.x * 0.5, z: 0.4, dist: 6.6, yaw: H.yaw + 0.2 }, 0.35);
    h.art = ART.heroUp1;
    T.sfx("move");
    await T.tween(h, { x: f.x - 0.25, z: f.z - 1.2 }, 0.28, "in");
    var c = B.foeTop(i, 0.5);
    FX.layer({ life: 0.22, dots: function (R, t) {
      var k = clamp01(t / 0.08);
      for (var s = -1; s <= 1; s++) R.streak([c[0] - 0.6 + s * 0.2, c[1] + 0.6, c[2] - 0.3], mix([c[0] - 0.6 + s * 0.2, c[1] + 0.6, c[2] - 0.3], [c[0] + 0.6 + s * 0.2, c[1] - 0.6, c[2] - 0.3], k), 3);
    } });
    FX.burst(c[0], c[1], c[2] - 0.2, 14, 3, { tone: 3, life: 0.3, trail: 0.05 });
    T.shake(2, 0.15);
    await B.show(ev);
    await T.tween(h, { x: x0, z: z0 }, 0.3, "out");
    h.art = ART.heroUp0;
    await B.home(0.35);
  }

  async function item(S, ev, id) {
    var h = S.hero, mana = id === "ether";
    title(S, BATTLE.ITEMS[id].name, 1.4);
    B.camTo({ x: h.x, y: 0.9, z: h.z + 0.5, yaw: B.HOME.yaw + PI * 0.85, dist: 4.6, pitch: -0.12 }, 0.5);
    await wait(0.4);
    T.sfx("coin");
    /* pills: light rises out of the ground; mana: motes are drawn in from all around */
    FX.emit(36, function (k, r) {
      var a = k / 36 * PI * 2, rad = mana ? 1.8 : 0.5;
      var p = { x: h.x + Math.cos(a) * rad, y: mana ? 0.3 + r * 1.4 : 0.05, z: h.z + Math.sin(a) * rad, life: 0.9 + r * 0.3, tone: 3, size: 0 };
      if (mana) { p.vx = -Math.cos(a) * 2; p.vz = -Math.sin(a) * 2; p.vy = 0.3; p.tone = 2; } else { p.vy = 1 + r * 1.5; p.vx = -Math.sin(a) * 0.4; p.vz = Math.cos(a) * 0.4; }
      return p;
    });
    FX.layer({ life: 1.0, lights: function (t) { return [{ x: h.x, y: 0.8, z: h.z - 0.4, radius: 3, power: 1.2 * Math.sin(t / 1.0 * PI) }]; } });
    await wait(0.6);
    await B.show(ev);
    await wait(0.4);
    await B.home(0.5);
  }

  async function defend(S, ev) {
    var h = S.hero;
    title(S, "防御", 1.0);
    T.sfx("tap");
    FX.emit(24, function (k) { var a = k / 24 * PI * 2; return { x: h.x, y: 0.5, z: h.z, vx: Math.cos(a) * 2.2, vz: Math.sin(a) * 1.4, life: 0.4, tone: 3, drag: 4 }; });
    await wait(0.3);
    await B.show(ev);
    await wait(0.3);
  }

  async function flee(S, ok) {
    var h = S.hero, z0 = h.z;
    h.art = ART.heroDown0;
    T.sfx("move");
    await T.tween(h, { z: ok ? -7 : -3.6 }, ok ? 0.6 : 0.35, "in");
    if (ok) { await B.say("逃走了。", 0.8); return; }
    T.sfx("err");
    T.shake(1, 0.2);
    h.art = ART.heroUp0;
    await T.tween(h, { z: z0 }, 0.25, "out");
    await B.say("没能逃掉！", 0.8);
  }

  /* ---------- spells ---------- */
  var SPELL = {};

  /* 飞剑诀: a halo of swords fans out behind the hero, facing the camera, then they fly at the target one by one */
  SPELL.sword = async function (S, ev) {
    var i = targets(ev)[0], h = S.hero, H = B.HOME, n = 8, swords = [];
    var yaw = H.yaw - 0.55, right = [Math.cos(yaw), 0, -Math.sin(yaw)], fwd = [Math.sin(yaw), 0, Math.cos(yaw)];
    var hub = [h.x + fwd[0] * 0.35, 1.25, h.z + fwd[2] * 0.35];
    cast(S, true);
    B.look([h.x, 1.15, h.z], yaw, -0.06, 4.0, 0.5);
    for (var k = 0; k < n; k++) swords.push({ a: k / n * PI * 2, fly: -1 });
    /* the scene dims so the blades stand out in paper white */
    T.tween(S, { light: 0.45, sky: 0.6 }, 0.4);
    var L = FX.layer({
      draw: function (R, t) {
        var open = smooth(t / 0.45), turn = t * 1.2;
        swords.forEach(function (s, k) {
          if (s.done) return;
          var pos, dir;
          if (s.fly < 0) {
            var a = s.a + turn, c = Math.cos(a), sn = Math.sin(a), rad = 0.25 + open * 0.75;
            dir = [right[0] * c, sn, right[2] * c];
            pos = [hub[0] + dir[0] * rad, hub[1] + dir[1] * rad, hub[2] + dir[2] * rad];
            if (k === Math.floor(t * 20) % n) FX.spawn({ x: pos[0], y: pos[1], z: pos[2], vy: -0.6, life: 0.35, tone: 3 });
          } else {
            var u = clamp01((t - s.fly) / 0.32), tc = B.foeTop(i, 0.55), top = mix(s.from, tc, 0.5);
            top[1] += 1.6;
            pos = bez(s.from, top, tc, u);
            dir = Lo3D.norm(Lo3D.sub(bez(s.from, top, tc, Math.min(1, u + 0.05)), pos));
            if (u >= 1) { s.done = true; FX.burst(tc[0], tc[1], tc[2] - 0.3, 8, 2.5, { tone: 3, life: 0.3, trail: 0.04 }); T.shake(1, 0.08); return; }
            if (k % 2 === 0) FX.spawn({ x: pos[0], y: pos[1], z: pos[2], life: 0.18, tone: 3 });
          }
          s.pos = pos;
          R.draw(FX.BLADE, FX.aim(pos, dir, 1.5), { bias: 0.9, two: true });
        });
      },
      lights: function () { return [{ x: hub[0], y: hub[1], z: hub[2] - 0.3, radius: 3.2, power: 0.9 }]; }
    });
    T.sfx("ok");
    await wait(1.0);
    B.look(B.foeTop(i, 0.4), H.yaw + 0.75, -0.16, 5.6, 0.55);
    for (k = 0; k < n; k++) {
      swords[k].from = swords[k].pos;
      swords[k].fly = L.layer.t;   /* launch now, on the layer's clock */
      if (k % 3 === 0) T.sfx("tick");
      await wait(0.07);
    }
    await wait(0.3);
    T.flash(0.05);
    await B.show(ev);
    cast(S, false);
    T.tween(S, { light: 1, sky: 1 }, 0.5);
    await wait(0.25);
    L();
    await B.home(0.5);
  };

  /* 寒潮: a wave sweeps from behind the hero across the enemies, then everything frosts over */
  SPELL.tide = async function (S, ev) {
    var H = B.HOME, front = -6, crest = 0;
    cast(S, true);
    B.camTo({ x: 0, y: 1.0, z: 0.8, yaw: H.yaw + 1.0, pitch: -0.26, dist: 9 }, 0.6);
    T.tween(S, { sky: 0.7, light: 0.6 }, 0.5);
    var GRID = (function () {
      var v = [], t = [], c = [], X = 14, U = 5;
      for (var u = 0; u <= U; u++) for (var x = 0; x <= X; x++) v.push([-7 + x, u / U, 0]);
      for (u = 0; u < U; u++) for (x = 0; x < X; x++) {
        var a = u * (X + 1) + x, b = a + 1, d = a + X + 1, e = d + 1;
        t.push([a, b, e], [a, e, d]); c.push(u === 0 ? 1.6 : 0.4, u === 0 ? 1.6 : 0.4);   /* white crest, dark water */
      }
      return { v: v, t: t, c: c, two: true };
    })();
    var L = FX.layer({
      draw: function (R, t) {
        if (crest <= 0.01) return;
        R.draw(GRID, function (p) {
          /* u = 0 is the crest, u = 1 the back of the wave; the crest leans forward */
          var u = p[1], hgt = crest * Math.pow(Math.sin(PI * (0.15 + u * 0.85)), 0.8) * (1 + 0.15 * Math.sin(p[0] * 1.3 + t * 9));
          return [p[0], hgt, front - u * 2.4 + (1 - u) * 0.5 * crest];
        }, { bias: 0.08 });
      },
      post: function (px, t) { if (S.ripple) FX.wave(px, S.ripple, 0.22, t * 14); }
    });
    T.sfx("ok");
    await wait(0.4);
    S.ripple = 0;
    /* the wave rises and runs forward */
    var hitDone = false, spray = T.every(0.05, function () {
      if (crest < 0.3) return;
      FX.emit(6, function () { return { x: -6 + Math.random() * 12, y: crest * 0.95, z: front + 0.3, vx: (Math.random() - 0.5), vy: 1.5 + Math.random() * 2, vz: 1.5, grav: 6, life: 0.6, tone: 3 }; });
    });
    var run = { f: front, c: 0 };
    var go = T.tween(run, { f: 7.5 }, 1.5, "linear");
    T.tween(run, { c: 3.0 }, 0.5, "out");
    var tick = T.every(1 / 60, function () {
      front = run.f; crest = run.c;
      if (!hitDone && front > 2.2) { hitDone = true; S.ripple = 3; T.shake(2, 0.4); B.show(ev); T.tween(S, { ripple: 0 }, 1.2, "linear"); }
    });
    await go;
    tick(); spray();
    crest = 0;
    /* frost: ice shards on every target, the picture whitens for a moment */
    T.sfx("tick");
    targets(ev).forEach(function (i) {
      var c = B.foeTop(i, 0.3);
      FX.burst(c[0], c[1], c[2], 18, 1.8, { tone: 3, life: 0.7, drag: 2.5 });
    });
    var ice = FX.layer({ life: 0.8, draw: function (R, t) {
      targets(ev).forEach(function (i, n) {
        var f = S.foes[i], s = smooth(t / 0.15) * (1 - smooth((t - 0.6) / 0.2));
        for (var k = 0; k < 4; k++) {
          var a = k / 4 * PI * 2 + n;
          R.draw(FX.CUBE, (function (p) {
            var q = Lo3D.rotY(Lo3D.rotZ([p[0] * 0.18 * s, p[1] * 1.0 * s, p[2] * 0.18 * s], 0.35), a);
            return [q[0] + f.x + Math.cos(a) * 0.45, q[1] + 0.35 * s, q[2] + f.z + Math.sin(a) * 0.3];
          }), { bias: 0.3 });
        }
      });
    }, post: function (px, t) { FX.cover(px, 3, 0.35 * Math.sin(clamp01(t / 0.8) * PI)); } });
    await wait(0.8);
    L();
    cast(S, false);
    T.tween(S, { sky: 1, light: 1 }, 0.5);
    await B.home(0.5);
  };

  /* 青藤缚: vines spiral up around every enemy, squeeze, and pull back into the ground */
  SPELL.vine = async function (S, ev) {
    var H = B.HOME, tg = targets(ev), grow = { h: 0, r: 0.9, out: 0 };
    cast(S, true);
    /* a low camera drifting across from the right, so the hero does not stand in the way */
    T.tween(S, { light: 0.5, sky: 0.7 }, 0.4);
    B.camTo({ x: 0.3, y: 1.0, z: 1.8, pitch: -0.08, dist: 7.6 }, 0.5);
    T.tween(S.cam, { yaw: H.yaw + 0.75 }, 2.8, "inOut");
    T.sfx("ok");
    /* the ground cracks first */
    tg.forEach(function (i) {
      var f = S.foes[i];
      FX.emit(16, function (k) { var a = k / 16 * PI * 2; return { x: f.x + Math.cos(a) * 0.3, y: 0.02, z: f.z + Math.sin(a) * 0.3, vx: Math.cos(a) * 1.4, vz: Math.sin(a) * 1.4, drag: 3, life: 0.7, tone: 0, size: 0.06 }; });
    });
    T.shake(1, 0.3);
    var L = FX.layer({ draw: function (R, t) {
      tg.forEach(function (i, n) {
        var f = S.foes[i], top = f.art.h * f.scale * 1.05;
        for (var v = 0; v < 3; v++) {
          var segs = Math.floor(18 * grow.h);
          for (var k = 0; k < segs; k++) {
            var u = k / 18, a = v / 3 * PI * 2 + u * 7 + n, rad = grow.r * (1 - u * 0.35) + grow.out;
            var p = [f.x + Math.cos(a) * rad, u * top, f.z + Math.sin(a) * rad * 0.8];
            R.draw(FX.CUBE, FX.at(p, 0.3 - u * 0.14, a), { bias: k % 3 === 0 ? 0.55 : 0.3 });
          }
        }
      });
    } });
    await wait(0.3);
    await T.tween(grow, { h: 1 }, 0.7, "out");
    /* leaves fall while the vines tighten */
    T.sfx("hit");
    tg.forEach(function (i) {
      var c = B.foeTop(i, 0.8);
      FX.burst(c[0], c[1], c[2], 12, 1.5, { tone: 2, life: 1.0, grav: 1.5, drag: 1.5, size: 0.06 });
    });
    var squeeze = T.tween(grow, { r: 0.42 }, 0.35, "in");
    var shakeFoes = T.every(1 / 30, function () { tg.forEach(function (i) { S.foes[i].ox = (Math.random() - 0.5) * 0.12; }); });
    await squeeze;
    T.shake(2, 0.3);
    await B.show(ev);
    await wait(0.35);
    shakeFoes();
    tg.forEach(function (i) { S.foes[i].ox = 0; });
    await T.tween(grow, { h: 0, out: 0.4 }, 0.4, "in");
    L();
    cast(S, false);
    T.tween(S, { light: 1, sky: 1 }, 0.5);
    await B.home(0.6);
  };

  /* 离火符: the camera follows a paper charm to the target, where it bursts into a fireball */
  SPELL.talisman = async function (S, ev) {
    var i = targets(ev)[0], H = B.HOME, h = S.hero;
    var start = B.heroAt(1.0), end = B.foeTop(i, 0.55);
    end = [end[0], end[1], end[2] - 0.7];
    var charm = { u: 0, pos: start.slice(), boom: 0, fire: 0 };
    cast(S, true);
    title(S, "离火符", 1.5);
    var L = FX.layer({
      draw: function (R, t) {
        if (charm.fire > 0.01) R.draw(FX.BALL, FX.at(end, charm.fire, t * 2), { bias: 0.9 - charm.boom * 0.6 });
      },
      lights: function () {
        var out = [{ x: charm.pos[0], y: charm.pos[1], z: charm.pos[2], radius: 2.2, power: 0.6 }];
        if (charm.fire > 0) out.push({ x: end[0], y: end[1], z: end[2], radius: 8, power: 2.6 * (1 - charm.boom) });
        return out;
      },
      post: function (px, t) {
        /* heat haze above the fire */
        if (charm.fire > 0 && charm.boom < 1) { var q = R.project(end); if (q) FX.wave(px, 1.5 * (1 - charm.boom), 0.6, t * 25, 0, Math.round(q[1])); }
      }
    });
    /* the charm itself is drawn as a sprite in the scene by a second layer, so it is depth-tested */
    var C = FX.layer({ draw: function (R, t) {
      if (charm.boom > 0) return;
      R.sprite(B_ART.talisman, charm.pos[0], charm.pos[1], charm.pos[2], { scale: 1 / 26, anchor: "center", flip: Math.floor(t * 12) % 2 === 0 });
    } });
    B.look(start, H.yaw - 0.5, -0.1, 3.4, 0.4);
    await wait(0.4);
    T.sfx("ok");
    var top = mix(start, end, 0.5); top[1] += 1.4;
    var fly = T.tween(charm, { u: 1 }, 0.85, "inOut");
    var follow = T.every(1 / 60, function () {
      charm.pos = bez(start, top, end, charm.u);
      S.cam.x += (charm.pos[0] - S.cam.x) * 0.25; S.cam.y += (charm.pos[1] - S.cam.y) * 0.25; S.cam.z += (charm.pos[2] - S.cam.z) * 0.25;
      if (Math.random() < 0.5) FX.spawn({ x: charm.pos[0], y: charm.pos[1], z: charm.pos[2], vy: -0.3, life: 0.4, tone: 3 });
    });
    T.tween(S.cam, { yaw: H.yaw + 0.35, dist: 4.4 }, 0.85, "inOut");
    await fly;
    follow();
    await wait(0.25);
    /* ignition */
    T.sfx("hit");
    T.flash(0.07);
    T.shake(3, 0.4);
    B.camTo({ dist: 6, pitch: -0.12 }, 0.5, "out");
    charm.boom = 0; charm.fire = 0.2;
    C();
    T.tween(charm, { fire: 1.5 }, 0.3, "out");
    FX.burst(end[0], end[1], end[2], 40, 3.5, { tone: 3, life: 0.9, drag: 2, up: 1.2 });
    FX.emit(20, function () { return { x: end[0] + (Math.random() - 0.5), y: end[1], z: end[2] + (Math.random() - 0.5), vy: 0.8 + Math.random(), life: 1.4, tone: 1, size: 0.12, drag: 0.5 }; });
    await wait(0.12);
    await B.show(ev);
    await T.tween(charm, { boom: 1, fire: 0.01 }, 0.6, "in");
    L();
    cast(S, false);
    await B.home(0.5);
  };

  /* 山岳印: the sky darkens, a stone seal comes down out of it and slams onto the enemies */
  SPELL.seal = async function (S, ev) {
    var H = B.HOME, c = centre(S), seal = { y: 11, spin: 0, s: 1, punch: 1 };
    var SEAL = (function () {
      var m = Lo3D.builder();
      m.box(-1.5, -0.5, -1.5, 1.5, 0.5, 1.5, 0.95);
      /* the carved face underneath: a square spiral in relief */
      [[-1.2, -1.2, 1.2, -0.9], [0.9, -1.2, 1.2, 1.2], [-1.2, 0.9, 1.2, 1.2], [-1.2, -0.6, -0.9, 1.2], [-0.6, -0.6, 0.6, -0.3], [0.3, -0.6, 0.6, 0.6], [-0.6, 0.3, 0.6, 0.6]].forEach(function (r) {
        m.box(r[0], -0.62, r[1], r[2], -0.5, r[3], 0.35, 0.35);
      });
      return m;
    })();
    cast(S, true);
    T.tween(S, { sky: 0.45, light: 0.6 }, 0.5);
    B.camTo({ x: c[0], y: 3.2, z: c[2] - 1, pitch: 0.32, dist: 9.5, yaw: H.yaw + 0.25 }, 0.6);
    T.sfx("ok");
    var L = FX.layer({
      draw: function (R) {
        var w = 1.6 * smooth((11 - seal.y) / 9);
        R.draw(FX.BALL, function (p) { return [p[0] * w + c[0], 0.02, p[2] * w + c[2]]; }, { albedo: 0.02 });
        R.draw(SEAL, function (p) { var q = Lo3D.rotY(p, seal.spin); return [q[0] * seal.s + c[0], q[1] * seal.s + seal.y, q[2] * seal.s + c[2]]; }, { bias: 0.3 });
      },
      /* the carved face glows on the ground beneath it */
      lights: function () { return [{ x: c[0], y: seal.y - 1.2, z: c[2] - 0.5, radius: 4 + Math.max(0, 6 - seal.y) * 0.4, power: 1.4 }]; },
      post: function (px) { if (seal.punch > 1.001) FX.zoom(px, seal.punch, 80, 80); }
    });
    T.tween(seal, { spin: 0.8 }, 1.6, "out");
    await T.tween(seal, { y: 5.5 }, 1.2, "out");
    /* a quick cut back, then the slam */
    B.camTo({ x: c[0], y: 1.2, z: 0.2, pitch: -0.3, dist: 9.5, yaw: H.yaw - 0.15 }, 0.25, "out");
    await wait(0.15);
    await T.tween(seal, { y: 0.55 }, 0.18, "in");
    T.sfx("hit");
    T.flash(0.05);
    T.shake(5, 0.5);
    seal.punch = 1.14;
    T.tween(seal, { punch: 1 }, 0.35, "out");
    FX.emit(30, function () {
      var a = Math.random() * PI * 2, s = 2 + Math.random() * 3;
      return { x: c[0] + Math.cos(a) * 1.4, y: 0.3, z: c[2] + Math.sin(a) * 1.4, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, grav: 9, floor: 0.05, life: 1.2, tone: Math.random() < 0.5 ? 0 : 1, size: 0.14 };
    });
    FX.emit(56, function (k) {
      var a = k / 56 * PI * 2;
      return { x: c[0] + Math.cos(a) * 1.6, y: 0.06, z: c[2] + Math.sin(a) * 1.6, vx: Math.cos(a) * 6, vz: Math.sin(a) * 6, drag: 2.2, life: 0.9, tone: 2, size: 0.08 };
    });
    await B.show(ev);
    await wait(0.4);
    await T.tween(seal, { y: -1.5 }, 0.5, "in");
    L();
    cast(S, false);
    T.tween(S, { sky: 1, light: 1 }, 0.5);
    await B.home(0.6);
  };

  /* 七级浮屠: the five elements gather above the arena and bring down a phantom of the tower */
  SPELL.pagoda = async function (S, ev) {
    var H = B.HOME, h = S.hero, c = centre(S), hp = B.heroAt(0.7), orbs = [], tw = { y: 16, spin: 0, show: 0, rise: 0 };
    var PAG = (function () { var m = Lo3D.builder(); World.pagoda(m, 0, 0, 0, 0.62, [1.1, 0.25]); return m; })();
    var storeys = [0.5, 1.4, 2.25, 3.05, 3.8, 4.5, 5.15];
    S.hud = false;
    T.tween(S, { bars: 1 }, 0.3);
    T.tween(S, { sky: 0.15, light: 0.25 }, 0.6);
    cast(S, true);
    /* close behind the hero's shoulder; the rise below starts from the same side, so the camera never
       crosses the enemy line on its way up */
    B.look([h.x, 0.9, h.z], H.yaw - 0.9, -0.05, 3.4, 0.7);
    var L = FX.layer({
      draw: function (R, t) {
        orbs.forEach(function (o) { R.draw(FX.BALL, FX.at(o.p, 0.13, t), { bias: 0.85 }); });
        if (tw.show && (tw.rise === 0 || Math.floor(t * 20) % 3)) R.draw(PAG, function (p) {
          var q = Lo3D.rotY(p, tw.spin);
          return [q[0] + c[0], q[1] + tw.y, q[2] + c[2]];
        }, { bias: 0.5 + tw.rise * 0.4 });
      },
      lights: function () {
        var out = orbs.map(function (o) { return { x: o.p[0], y: o.p[1], z: o.p[2], radius: 2.4, power: 0.7 }; });
        if (tw.show) storeys.forEach(function (y, k) { if (k % 2 === 0) out.push({ x: c[0], y: tw.y + y + 0.4, z: c[2] - 1.4, radius: 4.5, power: 1.1 }); });
        return out;
      },
      post: function (px, t) {
        if (S.rays) { var q = R.project(S.rays); if (q) FX.rays(px, q[0], q[1], 6, 40, 16, 3, t * 0.8); }
        if (S.ripple) FX.wave(px, S.ripple, 0.2, t * 20);
        if (S.punch > 1.001) FX.zoom(px, S.punch, 80, 72);
      }
    });
    /* five orbs, one per element */
    for (var k = 0; k < 5; k++) {
      (function (k) { orbs.push({ k: k, p: hp.slice() }); })(k);
      T.sfx("tick");
      await wait(0.2);
    }
    var orbit = T.every(1 / 60, function () {
      var t = game.time;
      orbs.forEach(function (o) {
        var a = o.k / 5 * PI * 2 + t * 4;
        var target = o.rise ? [c[0] + Math.cos(a) * 0.5 * (1 - o.rise), 1 + o.rise * 9, c[2] + Math.sin(a) * 0.5 * (1 - o.rise)] : [hp[0] + Math.cos(a) * 0.9, hp[1] + Math.sin(t * 3 + o.k) * 0.15, hp[2] + Math.sin(a) * 0.9];
        o.p = mix(o.p, target, 0.15);
      });
    });
    T.flash(0.05);
    await wait(0.3);
    /* they rise and merge high above the enemies */
    B.look([c[0], 5, c[2]], H.yaw - 0.5, 0.28, 9.5, 1.1);
    T.tween(S, { sky: 0.45 }, 1.0);
    orbs.forEach(function (o) { o.rise = 0; T.tween(o, { rise: 1 }, 1.0, "in"); });
    await wait(1.1);
    orbit();
    orbs.length = 0;
    S.rays = [c[0], 10, c[2]];
    T.sfx("ok");
    T.flash(0.06);
    T.tween(S, { sky: 0.6 }, 0.6);
    /* the phantom tower comes down slowly while the camera circles it */
    tw.show = 1;
    T.after(0.7, function () { S.rays = null; });
    S.cam.yaw = H.yaw + 0.9;
    B.look([c[0], 4.5, c[2]], H.yaw + 0.9, 0.05, 15, 0.6);
    T.tween(S.cam, { yaw: H.yaw + 0.9 + 2.3 }, 2.6, "inOut");
    T.tween(tw, { spin: 1.2 }, 2.6, "out");
    var motes = T.every(0.04, function () {
      FX.spawn({ x: c[0] + (Math.random() - 0.5) * 4, y: tw.y + Math.random() * 5, z: c[2] + (Math.random() - 0.5) * 4, vy: -1.5, life: 1.2, tone: 3 });
    });
    await T.tween(tw, { y: 3.2 }, 2.4, "out");
    S.rays = null;
    B.camTo({ y: 1.6, pitch: -0.2, dist: 12 }, 0.3);
    await wait(0.2);
    /* the slam */
    await T.tween(tw, { y: 0 }, 0.2, "in");
    motes();
    T.sfx("hit");
    T.flash(0.12);
    T.shake(6, 0.7);
    S.ripple = 4; S.punch = 1.25;
    T.tween(S, { ripple: 0 }, 1.2, "out");
    T.tween(S, { punch: 1 }, 0.5, "out");
    [[3, 9], [0, 6]].forEach(function (ring) {
      FX.emit(64, function (k) {
        var a = k / 64 * PI * 2;
        return { x: c[0] + Math.cos(a) * 2, y: 0.1, z: c[2] + Math.sin(a) * 2, vx: Math.cos(a) * ring[1], vz: Math.sin(a) * ring[1], drag: 1.5, life: 1.1, tone: ring[0], size: 0.1 };
      });
    });
    await B.show(ev);
    /* it dissolves into light and rises away */
    tw.rise = 1;
    T.tween(tw, { y: 9 }, 1.3, "in");
    var up = T.every(0.03, function () {
      FX.spawn({ x: c[0] + (Math.random() - 0.5) * 3, y: tw.y + Math.random() * 5, z: c[2] + (Math.random() - 0.5) * 3, vy: 2.5, life: 0.8, tone: 3 });
    });
    await wait(1.3);
    up();
    L();
    S.punch = 1; S.ripple = 0;
    cast(S, false);
    T.tween(S, { sky: 1, light: 1, bars: 0 }, 0.5);
    await B.home(0.8);
    S.hud = true;
  };

  async function hero(S, act, ev) {
    if (act.type === "attack") return attack(S, act.target, ev);
    if (act.type === "item") return item(S, ev, act.id);
    if (act.type === "defend") return defend(S, ev);
    if (act.type === "flee") return flee(S, ev[0].ok);
    var sp = BATTLE.SPELLS[act.id];
    S.view.mp = S.b.hero.mp;
    title(S, sp.name, sp.ultimate ? 1.2 : 1.4);
    await SPELL[act.id](S, ev);
  }

  /* ---------- the enemies ---------- */
  var FOE = {};
  /* lunge at the hero and back */
  async function lunge(S, i, hit) {
    var f = S.foes[i], h = S.hero;
    var dz = (h.z + 1.3) - f.z, dx = (h.x - f.x) * 0.7;
    await T.tween(f, { oz: dz, ox: dx }, 0.22, "in");
    await hit();
    await T.tween(f, { oz: 0, ox: 0 }, 0.3, "out");
  }
  FOE.lash = async function (S, i, r) {
    var p = B.heroAt(0.6);
    await lunge(S, i, async function () {
      FX.layer({ life: 0.2, dots: function (R, t) {
        var k = clamp01(t / 0.08);
        for (var s = 0; s < 3; s++) R.streak([p[0] + 0.5, p[1] + 0.5 - s * 0.2, p[2] - 0.2], mix([p[0] + 0.5, p[1] + 0.5 - s * 0.2, p[2] - 0.2], [p[0] - 0.5, p[1] - 0.3 - s * 0.2, p[2] - 0.2], k), 0);
      } });
      T.shake(2, 0.2);
      await B.show(r.events);
    });
  };
  /* fox fire: a small burning ball that lights the ground as it flies */
  FOE.ember = async function (S, i, r) {
    var a = B.foeTop(i, 0.6), b = B.heroAt(0.6), top = mix(a, b, 0.5), ball = { u: 0, p: a };
    top[1] += 1.2;
    var L = FX.layer({
      draw: function (R, t) { R.draw(FX.BALL, FX.at(ball.p, 0.18 + Math.sin(t * 30) * 0.03, t * 5), { bias: 0.9 }); },
      lights: function () { return [{ x: ball.p[0], y: ball.p[1], z: ball.p[2], radius: 3.5, power: 1.3 }]; }
    });
    var trail = T.every(1 / 60, function () {
      ball.p = bez(a, top, b, ball.u);
      FX.spawn({ x: ball.p[0], y: ball.p[1], z: ball.p[2], vy: 0.5, life: 0.35, tone: 3 });
    });
    await T.tween(ball, { u: 1 }, 0.55, "in");
    trail(); L();
    FX.burst(b[0], b[1], b[2], 20, 2.5, { tone: 3, life: 0.5, drag: 2, up: 0.8 });
    T.shake(2, 0.2);
    await B.show(r.events);
  };
  /* a boulder thrown high, landing on the hero */
  FOE.rock = async function (S, i, r) {
    var f = S.foes[i], a = B.foeTop(i, 1.0), b = B.heroAt(0.4), top = mix(a, b, 0.5), rk = { u: 0, p: a };
    top[1] += 3.5;
    await T.tween(f, { oy: 0.3 }, 0.2, "out");
    var L = FX.layer({ draw: function (R, t) { R.draw(FX.BALL, FX.at(rk.p, 0.32, t * 6), { albedo: 0.7 }); } });
    var fly = T.every(1 / 60, function () { rk.p = bez(a, top, b, rk.u); });
    T.tween(f, { oy: 0 }, 0.2);
    await T.tween(rk, { u: 1 }, 0.6, "in");
    fly(); L();
    FX.emit(18, function () { var q = Math.random() * PI * 2; return { x: b[0], y: 0.2, z: b[2], vx: Math.cos(q) * 2.5, vz: Math.sin(q) * 2.5, vy: 2, grav: 8, floor: 0.05, life: 0.8, tone: 1, size: 0.1 }; });
    T.shake(3, 0.3);
    await B.show(r.events);
  };
  /* a spray of cold water, and the picture wobbles */
  FOE.splash = async function (S, i, r) {
    var a = B.foeTop(i, 0.6), b = B.heroAt(0.6);
    for (var k = 0; k < 3; k++) {
      FX.emit(10, function () {
        var t = 0.5, v = [(b[0] - a[0]) / t, (b[1] - a[1]) / t + 2, (b[2] - a[2]) / t];
        return { x: a[0], y: a[1], z: a[2], vx: v[0] + (Math.random() - 0.5), vy: v[1] + Math.random(), vz: v[2], grav: 5, life: 0.55, tone: 3, trail: 0.03 };
      });
      await wait(0.08);
    }
    await wait(0.35);
    FX.layer({ life: 0.6, post: function (px, t) { FX.wave(px, 2 * (1 - t / 0.6), 0.3, t * 20); } });
    T.shake(2, 0.2);
    await B.show(r.events);
  };
  /* the boss draws in mist and light, the screen darkens: defend now */
  async function gather(S, i, r) {
    var p = B.foeTop(i, 0.75), H = B.HOME;
    B.look(p, H.yaw + 0.3, -0.05, 6.5, 0.6);
    T.tween(S, { sky: 0.5, light: 0.6 }, 0.6);
    var k = T.every(0.05, function () {
      FX.emit(3, function () {
        var a = Math.random() * PI * 2, d = 3 + Math.random() * 2;
        return { x: p[0] + Math.cos(a) * d, y: p[1] + (Math.random() - 0.5) * 3, z: p[2] + Math.sin(a) * d * 0.5, vx: -Math.cos(a) * d * 1.6, vy: 0, vz: -Math.sin(a) * d * 0.8, life: 0.6, tone: 3, trail: 0.05 };
      });
    });
    S.foes[i].glow = FX.layer({ lights: function (t) { return [{ x: p[0], y: p[1], z: p[2] - 1, radius: 5, power: 0.6 + 0.3 * Math.sin(t * 8) }]; } });
    S.msg = r.move;
    await wait(1.6);
    k();
    S.msg = "";
    T.tween(S, { sky: 1, light: 1 }, 0.5);
    await B.home(0.6);
  }
  /* the boss's big attack: a tidal blast across the whole arena */
  FOE.tidal = async function (S, i, r) {
    var f = S.foes[i], a = B.foeTop(i, 0.75), b = B.heroAt(0.5), H = B.HOME;
    if (f.glow) { f.glow(); f.glow = null; }
    S.hud = false;
    T.tween(S, { bars: 1 }, 0.25);
    B.look(mix(a, b, 0.5), H.yaw - 1.4, -0.1, 7, 0.5);
    await wait(0.5);
    T.sfx("lose");
    S.ripple = 5;
    var L = FX.layer({ post: function (px, t) { FX.wave(px, S.ripple, 0.25, t * 30); } });
    var beam = T.every(1 / 60, function () {
      FX.emit(5, function () {
        var v = Lo3D.scale(Lo3D.norm(Lo3D.sub(b, a)), 14);
        return { x: a[0], y: a[1], z: a[2], vx: v[0] + (Math.random() - 0.5) * 2, vy: v[1] + (Math.random() - 0.5) * 2, vz: v[2], life: 0.45, tone: Math.random() < 0.7 ? 3 : 2, trail: 0.03 };
      });
    });
    await wait(0.6);
    T.flash(0.1);
    T.shake(6, 0.6);
    await B.show(r.events);
    await wait(0.4);
    beam();
    await T.tween(S, { ripple: 0 }, 0.5);
    L();
    T.tween(S, { bars: 0 }, 0.3);
    await B.home(0.6);
    S.hud = true;
  };

  async function enemy(S, i, r) {
    if (r.gather) return gather(S, i, r);
    title(S, r.move, 1.0);
    await wait(0.25);
    await (FOE[r.fx] || FOE.lash)(S, i, r);
    await wait(0.15);
  }

  /* ---------- the end ---------- */
  async function victory(S, rw) {
    var h = S.hero, H = B.HOME;
    T.sfx("win");
    cast(S, true);
    S.cam.yaw = H.yaw;
    B.look([h.x, 0.8, h.z], H.yaw + PI * 0.92, -0.12, 4.4, 1.4, "inOut");
    await wait(1.2);
    var pages = ["胜利！", "得到修为 " + rw.xp + "。"];
    rw.ups.forEach(function (u) {
      pages.push("升到 " + u.level + " 级！");
      u.learned.forEach(function (id) { pages.push("学会了" + BATTLE.SPELLS[id].name + "！"); });
    });
    S.hud = false;
    await game.say(pages);
  }
  async function defeat(S) {
    T.sfx("lose");
    S.hud = false;
    T.tween(S, { sky: 0.3, light: 0.3 }, 1.2);
    FX.layer({ always: true, post: function (px, t) { FX.cover(px, 0, Math.min(0.6, t / 2)); } });
    await wait(1.0);
    S.hero.hide = true;
    await game.say("力竭了……");
  }

  return { intro: intro, bossIntro: bossIntro, weak: weak, down: down, hero: hero, enemy: enemy, victory: victory, defeat: defeat, SPELL: SPELL };
})();
