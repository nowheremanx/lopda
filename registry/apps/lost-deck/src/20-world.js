/* Lost Deck: the world. A deck is a grid of cells (walls, doors, floor) and a list of things on it:
   the player, robots, spores, pickups, crates, bolts in flight. This file moves them, lets them see and
   chase the player, fires the player's weapons and keeps the deck's score. No drawing here.
   MIT License. */
(function () {
  "use strict";
  var LD = window.LD;

  /* map characters -> cell codes. 1-6 walls, 10 door, 11-13 doors that need a card, 14 lift (the exit),
     15 a wall that slides away when you press B on it (a secret) */
  var CELL = { "#": 1, "P": 2, "C": 3, "W": 4, "M": 5, "T": 6, "D": 10, "1": 11, "2": 12, "3": 13, "E": 14, "S": 15 };
  var SOLID_WALL = function (c) { return (c >= 1 && c <= 6) || c === 14 || c === 15; };

  var FOES = {
    crawler: { hp: 2, spd: 2.1, r: 0.28, h: 0.5, sight: 10, melee: { dmg: 7, range: 0.78, cd: 0.8 } },
    spore: { hp: 1, spd: 0.85, r: 0.3, h: 0.5, z: 0.22, sight: 8, burst: { near: 0.85, dmg: 22, radius: 1.6 } },
    sentry: { hp: 6, spd: 0, r: 0.36, h: 0.8, sight: 12, shoot: { cd: 2.0, n: 1, spd: 4.0, dmg: 9 } },
    guard: { hp: 10, spd: 1.25, r: 0.32, h: 0.95, sight: 12, keep: 2.6, shoot: { cd: 2.8, n: 3, gap: 0.22, spd: 4.5, dmg: 6 } },
    node: { hp: 8, spd: 0, r: 0.32, h: 0.75, sight: 0 },
    core: { hp: 44, spd: 0, r: 0.62, h: 1.4, sight: 30 }
  };
  var ITEMS = {
    a: { kind: "ammo", n: 8, s: "ammo", h: 0.26 }, A: { kind: "ammo", n: 20, s: "ammoBig", h: 0.32 },
    h: { kind: "med", n: 15, s: "med", h: 0.26 }, H: { kind: "med", n: 40, s: "medBig", h: 0.34 },
    u: { kind: "card", n: 1, h: 0.3 }, o: { kind: "card", n: 2, h: 0.3 }, v: { kind: "card", n: 3, h: 0.3 },
    G: { kind: "gun", n: 12, s: "scatter", h: 0.22 }
  };
  var DECOR = {
    i: { s: "column", h: 1.0, r: 0.3, solid: true }, k: { s: "crate", h: 0.55, r: 0.36, solid: true },
    l: { s: "lamp", h: 0.9, r: 0.15, solid: true, glow: true }, b: { s: "bones", h: 0.2, r: 0 }
  };
  var WEAPONS = {
    wrench: { rate: 0.42, dmg: 3, range: 1.15, ammo: 0 },
    rivet: { rate: 0.27, dmg: 2, ammo: 1 },
    scatter: { rate: 0.78, dmg: 2, ammo: 3, pellets: 7, cone: 0.13 }
  };

  function World(deck, hooks) {
    this.deck = deck; this.hooks = hooks || {};
    var rows = deck.map, h = rows.length, w = 0;
    rows.forEach(function (r) { w = Math.max(w, r.length); });
    var M = this.M = { w: w, h: h, cells: new Uint8Array(w * h), open: new Float32Array(w * h), axis: new Uint8Array(w * h),
      timer: new Float32Array(w * h), seen: new Uint8Array(w * h), slime: null, dist: new Int16Array(w * h) };
    this.things = []; this.time = 0; this.kills = 0; this.foes = 0; this.secrets = 0; this.secretsFound = 0;
    this.cards = [false, false, false, false]; this.logs = []; this.fx = [];
    var P = this.P = { x: 1.5, y: 1.5, a: (deck.face || 0) * Math.PI / 180, hp: 100, ammo: deck.ammo != null ? deck.ammo : 30,
      guns: { wrench: true, rivet: true, scatter: !!deck.scatter }, gun: "rivet", cd: 0, kick: 0, hurt: 0, hurtDir: 0,
      bob: 0, moving: 0, gas: 0, pick: 0, dead: false, turnV: 0 };
    if (deck.slime) M.slime = new Uint8Array(w * h);
    var termN = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var ch = rows[y].charAt(x) || "#", i = y * w + x;
      if (CELL[ch] != null) {
        M.cells[i] = CELL[ch];
        if (ch === "S") this.secrets++;
        if (ch === "T") this.logs[i] = termN++;
        continue;
      }
      var cx = x + 0.5, cy = y + 0.5;
      if (ch === "~") { if (M.slime) M.slime[i] = 1; continue; }
      if (ch === "@") { P.x = cx; P.y = cy; continue; }
      if (ch === "c") this.addFoe("crawler", cx, cy);
      else if (ch === "f") this.addFoe("spore", cx, cy);
      else if (ch === "s") this.addFoe("sentry", cx, cy);
      else if (ch === "g") this.addFoe("guard", cx, cy);
      else if (ch === "n") this.addFoe("node", cx, cy);
      else if (ch === "B") this.addFoe("core", cx, cy);
      else if (ch === "z") this.things.push({ kind: "vent", x: cx, y: cy });
      else if (ch === "x") this.things.push({ kind: "barrel", x: cx, y: cy, hp: 2, r: 0.33, solid: true });
      else if (ITEMS[ch]) this.things.push({ kind: "item", it: ITEMS[ch], ch: ch, x: cx, y: cy });
      else if (DECOR[ch]) { var d = DECOR[ch]; this.things.push({ kind: "decor", d: d, x: cx, y: cy, r: d.r, solid: d.solid }); }
    }
    /* door orientation: a door between two walls on the left and right blocks travel north-south */
    for (var j = 0; j < w * h; j++) {
      var c = M.cells[j]; if (c < 10 || c > 14) continue;
      var jx = j % w, jy = (j / w) | 0;
      M.axis[j] = this.wallAt(jx - 1, jy) && this.wallAt(jx + 1, jy) ? 1 : 0;
    }
    if (M.slime) for (var k = 0; k < rows.length; k++) for (var q = 0; q < rows[k].length; q++) {
      var cc = rows[k].charAt(q);
      if (cc === "~" || (deck.slimeUnder && deck.slimeUnder.indexOf(cc) >= 0)) M.slime[k * w + q] = 1;
    }
    this.pcell = -1;
    this.flow();
  }
  var W = World.prototype;

  W.addFoe = function (type, x, y, spawned) {
    var F = FOES[type];
    var e = { kind: "foe", type: type, F: F, x: x, y: y, hp: F.hp, r: F.r, awake: !!spawned, cd: 0.6 + Math.random(), t: Math.random() * 10,
      see: false, seeT: 0, flash: 0, stagger: 0, act: 0, dead: false, deadT: 0, spawned: !!spawned, burst: 0, burstT: 0, solid: type === "sentry" || type === "node" || type === "core" };
    if (!spawned) this.foes++;
    this.things.push(e);
    return e;
  };

  W.cell = function (x, y) { var M = this.M; return x < 0 || y < 0 || x >= M.w || y >= M.h ? 1 : M.cells[y * M.w + x]; };
  W.wallAt = function (x, y) { return SOLID_WALL(this.cell(x, y)); };
  /* can something stand in this cell? doors only when they are nearly open */
  W.blockedCell = function (x, y) {
    var c = this.cell(x, y);
    if (c === 0) return false;
    if (c >= 10 && c <= 13) return this.M.open[y * this.M.w + x] < 0.85;
    return true;
  };
  W.blocked = function (x, y, r) {
    return this.blockedCell((x - r) | 0, (y - r) | 0) || this.blockedCell((x + r) | 0, (y - r) | 0) ||
      this.blockedCell((x - r) | 0, (y + r) | 0) || this.blockedCell((x + r) | 0, (y + r) | 0);
  };
  /* can a bolt or a look pass through this cell right now? */
  W.opaque = function (x, y) {
    var c = this.cell(x, y);
    if (c === 0) return false;
    if (c >= 10 && c <= 13) return this.M.open[y * this.M.w + x] < 0.6;
    return true;
  };
  W.sightLine = function (x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy), n = Math.ceil(d / 0.2);
    for (var i = 1; i < n; i++) { var t = i / n; if (this.opaque((x0 + dx * t) | 0, (y0 + dy * t) | 0)) return false; }
    return true;
  };

  /* distance (in cells) from every reachable cell to the player, for robots that lost sight of you */
  W.flow = function () {
    var M = this.M, w = M.w, dist = M.dist, P = this.P;
    var pc = (P.y | 0) * w + (P.x | 0);
    if (pc === this.pcell) return;
    this.pcell = pc;
    dist.fill(-1);
    var q = new Int32Array(w * M.h), qh = 0, qt = 0;
    dist[pc] = 0; q[qt++] = pc;
    while (qh < qt) {
      var i = q[qh++], x = i % w, y = (i / w) | 0, nd = dist[i] + 1;
      for (var k = 0; k < 4; k++) {
        var nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= M.h) continue;
        var j = ny * w + nx, c = M.cells[j];
        if (dist[j] >= 0) continue;
        if (c !== 0 && c !== 10 && !(c >= 11 && c <= 13 && M.open[j] > 0.5)) continue;
        dist[j] = nd; q[qt++] = j;
      }
    }
  };

  /* ---------------- doors ---------------- */
  W.tryDoor = function (x, y, byPlayer) {
    var M = this.M, i = y * M.w + x, c = this.cell(x, y);
    if (c === 14) { if (byPlayer && !this.done) this.hooks.exit && this.hooks.exit(); return true; }
    if (c === 15 && byPlayer) {
      M.cells[i] = 0; this.secretsFound++; this.pcell = -1;
      this.hooks.secret && this.hooks.secret(this.secretsFound, this.secrets);
      return true;
    }
    if (c === 6 && byPlayer) { this.hooks.terminal && this.hooks.terminal(this.logs[i]); return true; }
    if (c < 10 || c > 13) return false;
    if (c > 10 && !this.cards[c - 10]) {
      if (byPlayer) this.hooks.locked && this.hooks.locked(c - 10);
      return true;
    }
    if (M.open[i] < 1 && M.timer[i] <= 0) { M.timer[i] = 0.01; this.hooks.door && this.hooks.door(x + 0.5, y + 0.5); }
    else if (M.open[i] >= 1) M.timer[i] = 0.01;
    return true;
  };
  W.updateDoors = function (dt) {
    var M = this.M, n = M.w * M.h, P = this.P;
    for (var i = 0; i < n; i++) {
      var c = M.cells[i]; if (c < 10 || c > 13) continue;
      if (M.timer[i] > 0) {
        if (M.open[i] < 1) { M.open[i] = Math.min(1, M.open[i] + dt * 2.2); if (M.open[i] >= 1) M.timer[i] = 0.01; }
        else {
          M.timer[i] += dt;
          if (M.timer[i] > 3.5) {
            var x = i % M.w, y = (i / M.w) | 0, busy = ((P.x | 0) === x && (P.y | 0) === y);
            for (var k = 0; k < this.things.length && !busy; k++) { var o = this.things[k]; if ((o.kind === "foe" && !o.dead) || o.kind === "item") busy = (o.x | 0) === x && (o.y | 0) === y; }
            if (!busy) { M.timer[i] = -1; this.hooks.door && this.hooks.door(x + 0.5, y + 0.5); } else M.timer[i] = 2.5;
          }
        }
      } else if (M.timer[i] < 0) {
        M.open[i] = Math.max(0, M.open[i] - dt * 2.2);
        if (M.open[i] <= 0) M.timer[i] = 0;
        var cx = i % M.w, cy = (i / M.w) | 0;
        if ((P.x | 0) === cx && (P.y | 0) === cy) M.timer[i] = 0.01;
      }
    }
  };

  /* ---------------- moving round things against the grid ---------------- */
  W.slide = function (o, dx, dy, r) {
    var moved = false;
    if (dx && !this.blocked(o.x + dx, o.y, r) && !this.bumpThing(o, o.x + dx, o.y, r)) { o.x += dx; moved = true; }
    if (dy && !this.blocked(o.x, o.y + dy, r) && !this.bumpThing(o, o.x, o.y + dy, r)) { o.y += dy; moved = true; }
    return moved;
  };
  W.bumpThing = function (self, x, y, r) {
    for (var i = 0; i < this.things.length; i++) {
      var o = this.things[i];
      if (o === self || !o.solid || o.dead) continue;
      var dx = o.x - x, dy = o.y - y, rr = o.r + r;
      if (dx * dx + dy * dy < rr * rr) {
        var odx = o.x - self.x, ody = o.y - self.y;
        if (dx * dx + dy * dy < odx * odx + ody * ody) return true;   /* only block moving closer */
      }
    }
    return false;
  };

  /* ---------------- the player ---------------- */
  W.update = function (dt, input) {
    if (this.done) return;
    var P = this.P;
    this.time += dt;
    if (!P.dead) this.movePlayer(dt, input);
    this.updateDoors(dt);
    this.flow();
    for (var i = 0; i < this.things.length; i++) {
      var o = this.things[i];
      if (o.kind === "foe") this.updateFoe(o, dt);
      else if (o.kind === "bolt") this.updateBolt(o, dt);
      else if (o.kind === "item" && !P.dead) this.touchItem(o);
    }
    for (var f = 0; f < this.fx.length; f++) this.fx[f].t += dt;
    this.fx = this.fx.filter(function (e) { return e.t < e.life; });
    this.things = this.things.filter(function (o) { return !o.gone; });
    P.cd = Math.max(0, P.cd - dt); P.kick = Math.max(0, P.kick - dt); P.hurt = Math.max(0, P.hurt - dt);
    P.gas = Math.max(0, P.gas - dt); P.pick = Math.max(0, P.pick - dt);
  };

  W.movePlayer = function (dt, input) {
    var P = this.P;
    /* turning eases in, so a tap nudges the aim and a hold swings round */
    var turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (input.strafe) turn = 0;
    if (turn) P.turnV = Math.min(1, P.turnV + dt * 6); else P.turnV = 0;
    P.a += turn * dt * (0.9 + 1.9 * P.turnV);
    var fwd = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    var str = input.strafe ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
    var ca = Math.cos(P.a), sa = Math.sin(P.a);
    var spd = fwd > 0 ? 3.0 : 2.3;
    var mx = (ca * fwd * spd - sa * str * 2.6) * dt, my = (sa * fwd * spd + ca * str * 2.6) * dt;
    var r = 0.24;
    if (mx || my) {
      var bx = P.x, by = P.y;
      this.slide(P, mx, my, r);
      var got = Math.hypot(P.x - bx, P.y - by);
      P.moving = Math.min(1, P.moving + dt * 5);
      P.bob += got * 3.4;
      /* walking into a door opens it */
      if (fwd > 0 && got < Math.hypot(mx, my) * 0.5) {
        /* ahead, or straight along x or y when you come at it slanted */
        var tries = [[P.x + ca * 0.6, P.y + sa * 0.6], [P.x + ca * 0.6, P.y], [P.x, P.y + sa * 0.6]];
        for (var q = 0; q < 3; q++) {
          var fx = tries[q][0] | 0, fy = tries[q][1] | 0, c = this.cell(fx, fy);
          if (c >= 10 && c <= 14) { this.tryDoor(fx, fy, true); break; }
        }
      }
    } else P.moving = Math.max(0, P.moving - dt * 4);
    if (input.use) this.use();
    if (input.swap) this.swap();
    if (input.fire) this.fire();
  };

  /* B: press whatever is in front: a door, a terminal, a loose panel, the lift */
  W.use = function () {
    var P = this.P, ca = Math.cos(P.a), sa = Math.sin(P.a);
    for (var d = 0.3; d <= 1.25; d += 0.15) {
      var x = (P.x + ca * d) | 0, y = (P.y + sa * d) | 0, c = this.cell(x, y);
      if (c === 0) continue;
      if (this.tryDoor(x, y, true)) return;
      break;
    }
    this.hooks.nothing && this.hooks.nothing();
  };
  W.swap = function () {
    var P = this.P, order = ["rivet", "scatter", "wrench"], i = order.indexOf(P.gun);
    for (var k = 1; k <= 3; k++) {
      var g = order[(i + k) % 3];
      if (P.guns[g] && (g === "wrench" || P.ammo >= WEAPONS[g].ammo)) { P.gun = g; this.hooks.swap && this.hooks.swap(g); return; }
    }
  };

  /* ---------------- shooting ---------------- */
  W.fire = function () {
    var P = this.P;
    if (P.cd > 0 || P.dead) return;
    var Wp = WEAPONS[P.gun];
    if (Wp.ammo && P.ammo < Wp.ammo) {
      P.gun = P.guns.rivet && P.ammo >= 1 ? "rivet" : "wrench";
      this.hooks.empty && this.hooks.empty(P.gun);
      P.cd = 0.3;
      return;
    }
    P.cd = Wp.rate; P.kick = 0.16;
    P.ammo -= Wp.ammo;
    this.hooks.shot && this.hooks.shot(P.gun);
    if (P.gun === "wrench") {
      var best = null, bd = Wp.range;
      for (var i = 0; i < this.things.length; i++) {
        var o = this.things[i];
        if (!(o.kind === "foe" && !o.dead) && o.kind !== "barrel") continue;
        var dx = o.x - P.x, dy = o.y - P.y, dd = Math.sqrt(dx * dx + dy * dy) - (o.r || 0);
        var ang = Math.abs(angDiff(Math.atan2(dy, dx), P.a));
        if (dd < bd && ang < 0.55) { bd = dd; best = o; }
      }
      if (best) { this.hurtThing(best, Wp.dmg); this.hooks.clang && this.hooks.clang(); }
      return;
    }
    this.noise(P.x, P.y, 8);
    var n = Wp.pellets || 1;
    for (var k = 0; k < n; k++) {
      var a = P.a + (n > 1 ? (k / (n - 1) - 0.5) * 2 * Wp.cone + (Math.random() - 0.5) * 0.03 : (Math.random() - 0.5) * 0.012);
      this.hitscan(a, Wp.dmg);
    }
  };
  W.hitscan = function (a, dmg) {
    var P = this.P, dx = Math.cos(a), dy = Math.sin(a);
    var wall = LD.R.cast(this.M, P.x, P.y, dx, dy, null).d;
    var best = null, bd = wall;
    for (var i = 0; i < this.things.length; i++) {
      var o = this.things[i];
      if (!((o.kind === "foe" && !o.dead) || o.kind === "barrel")) continue;
      var vx = o.x - P.x, vy = o.y - P.y, along = vx * dx + vy * dy;
      if (along <= 0 || along > bd) continue;
      var perp = Math.abs(vx * dy - vy * dx);
      if (perp < o.r * 1.3 + 0.05) { bd = along; best = o; }   /* a little forgiving: the d-pad aims coarsely */
    }
    var hx = P.x + dx * (bd - 0.08), hy = P.y + dy * (bd - 0.08);
    this.fx.push({ s: "spark", x: hx, y: hy, z: 0.3 + Math.random() * 0.15, h: 0.16, t: 0, life: 0.12, glow: true });
    if (best) this.hurtThing(best, dmg);
  };
  function angDiff(a, b) { var d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
  W.angDiff = angDiff;

  W.noise = function (x, y, r) {
    for (var i = 0; i < this.things.length; i++) {
      var o = this.things[i];
      if (o.kind === "foe" && !o.awake && Math.hypot(o.x - x, o.y - y) < r) o.awake = true;
    }
  };

  W.hurtThing = function (o, dmg) {
    if (o.kind === "barrel") { o.hp -= dmg; if (o.hp <= 0 && !o.gone) { o.gone = true; this.explode(o.x, o.y, 1.8, 30); } return; }
    if (o.dead) return;
    if (o.type === "core" && this.shielded()) { o.flash = 0.06; this.hooks.ping && this.hooks.ping(); return; }
    o.hp -= dmg; o.flash = 0.12; o.awake = true;
    if (o.type === "crawler" || o.type === "guard") o.stagger = 0.14;
    if (o.hp <= 0) this.kill(o); else this.hooks.hit && this.hooks.hit(o);
  };
  W.shielded = function () {
    for (var i = 0; i < this.things.length; i++) { var o = this.things[i]; if (o.type === "node" && !o.dead) return true; }
    return false;
  };
  W.kill = function (o) {
    o.dead = true; o.deadT = 0; o.solid = false;
    if (!o.spawned) this.kills++;
    this.hooks.kill && this.hooks.kill(o);
    if (o.type === "spore") { o.gone = true; this.explode(o.x, o.y, o.F.burst.radius, o.F.burst.dmg, true); }
    if (o.type === "guard") this.things.push({ kind: "item", it: ITEMS.a, ch: "a", x: o.x, y: o.y });
    if (o.type === "core") this.hooks.coreDown && this.hooks.coreDown(o);
  };
  W.explode = function (x, y, rad, dmg, gas) {
    this.fx.push({ s: gas ? "puff" : "boom", x: x, y: y, z: 0.05, h: gas ? 0.9 : 1.0, t: 0, life: gas ? 0.6 : 0.45, glow: !gas, grow: true });
    this.hooks.boom && this.hooks.boom(x, y, gas);
    var P = this.P, pd = Math.hypot(P.x - x, P.y - y);
    if (pd < rad && this.sightLine(x, y, P.x, P.y)) {
      this.hurtPlayer(Math.round(dmg * (1 - pd / rad * 0.6)), x, y);
      if (gas) P.gas = 2.2;
    }
    for (var i = 0; i < this.things.length; i++) {
      var o = this.things[i];
      if (o.gone || o.dead || (o.kind !== "foe" && o.kind !== "barrel")) continue;
      if (o.type === "core") continue;
      var d = Math.hypot(o.x - x, o.y - y);
      if (d < rad) this.hurtThing(o, Math.max(1, Math.round(dmg / 6 * (1 - d / rad * 0.5))));
    }
  };
  W.hurtPlayer = function (dmg, fx, fy) {
    var P = this.P;
    if (P.dead || dmg <= 0) return;
    if (this.deck.easy) dmg = Math.ceil(dmg * 0.6);
    P.hp -= dmg; P.hurt = 0.35;
    P.hurtDir = angDiff(Math.atan2(fy - P.y, fx - P.x), P.a);
    this.hooks.hurt && this.hooks.hurt(dmg);
    if (P.hp <= 0) { P.hp = 0; P.dead = true; this.hooks.dead && this.hooks.dead(); }
  };

  W.touchItem = function (o) {
    var P = this.P;
    if (Math.hypot(o.x - P.x, o.y - P.y) > 0.55) return;
    var it = o.it, took = false;
    if (it.kind === "ammo") { if (P.ammo < 99) { P.ammo = Math.min(99, P.ammo + it.n); took = true; } }
    else if (it.kind === "med") { if (P.hp < 100) { P.hp = Math.min(100, P.hp + it.n); took = true; } }
    else if (it.kind === "card") { this.cards[it.n] = true; took = true; }
    else if (it.kind === "gun") { P.guns.scatter = true; P.gun = "scatter"; P.ammo = Math.min(99, P.ammo + it.n); took = true; }
    if (took) { o.gone = true; P.pick = 0.25; this.hooks.pickup && this.hooks.pickup(it); }
    else if (!o.told) { o.told = true; this.hooks.full && this.hooks.full(it); }
  };

  /* ---------------- robots, spores and the core ---------------- */
  W.updateFoe = function (e, dt) {
    var P = this.P, F = e.F;
    e.t += dt; e.flash = Math.max(0, e.flash - dt); e.act = Math.max(0, e.act - dt);
    if (e.dead) { e.deadT += dt; return; }
    var dx = P.x - e.x, dy = P.y - e.y, dist = Math.sqrt(dx * dx + dy * dy);
    e.seeT -= dt;
    if (e.seeT <= 0) {
      e.seeT = 0.2 + Math.random() * 0.1;
      e.see = !P.dead && dist < (e.awake ? 30 : F.sight) && this.sightLine(e.x, e.y, P.x, P.y);
      if (e.see && !e.awake) { e.awake = true; e.cd = Math.max(e.cd, 0.5); this.hooks.wake && this.hooks.wake(e); }
    }
    if (e.type === "core") return this.updateCore(e, dt, dist);
    if (!e.awake || P.dead) return;
    e.cd -= dt;
    if (e.stagger > 0) { e.stagger -= dt; return; }
    /* attacks */
    if (F.melee && dist < F.melee.range + e.r && e.cd <= 0) {
      e.cd = F.melee.cd; e.act = 0.25; this.hurtPlayer(F.melee.dmg, e.x, e.y);
    }
    if (F.burst && dist < F.burst.near) { this.kill(e); return; }
    if (F.shoot) {
      if (e.burst > 0) {
        e.burstT -= dt;
        if (e.burstT <= 0) { e.burst--; e.burstT = F.shoot.gap; this.shoot(e, F.shoot); }
      } else if (e.see && e.cd <= 0 && dist < 14) {
        e.cd = F.shoot.cd * (0.8 + Math.random() * 0.4);
        e.burst = F.shoot.n; e.burstT = 0.25; e.act = 0.25 + F.shoot.n * (F.shoot.gap || 0.1);
      }
    }
    /* moving */
    if (!F.spd) return;
    var tx, ty;
    if (e.see) { tx = P.x; ty = P.y; }
    else {
      var M = this.M, cx = e.x | 0, cy = e.y | 0, bestD = M.dist[cy * M.w + cx], bx = -1, by = -1;
      if (bestD < 0) bestD = 9999;
      for (var k = 0; k < 4; k++) {
        var nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= M.w || ny >= M.h) continue;
        var nd = M.dist[ny * M.w + nx];
        if (nd >= 0 && nd < bestD) { bestD = nd; bx = nx; by = ny; }
      }
      if (bx < 0) return;
      tx = bx + 0.5; ty = by + 0.5;
      var c = this.cell(bx, by);
      if (c === 10) this.tryDoor(bx, by, false);
    }
    var mx = tx - e.x, my = ty - e.y, md = Math.sqrt(mx * mx + my * my) || 1;
    var spd = F.spd;
    if (F.keep && e.see) {
      if (dist < F.keep - 0.4) spd = -F.spd * 0.7;
      else if (dist < F.keep + 0.4) {
        /* step sideways while holding the distance */
        var side = Math.sin(e.t * 0.9 + e.x) > 0 ? 1 : -1;
        mx = -dy * side; my = dx * side; md = dist || 1; spd = F.spd * 0.35;
      }
    }
    if (e.act > 0 && F.shoot) spd = 0;
    if (F.melee && dist < F.melee.range * 0.8) spd = 0;
    var stepX = mx / md * spd * dt, stepY = my / md * spd * dt;
    /* keep a little room between robots */
    for (var j = 0; j < this.things.length; j++) {
      var o = this.things[j];
      if (o === e || o.kind !== "foe" || o.dead) continue;
      var ox = e.x - o.x, oy = e.y - o.y, od = ox * ox + oy * oy, rr = (e.r + o.r);
      if (od < rr * rr && od > 0.0001) { od = Math.sqrt(od); stepX += ox / od * dt * 0.8; stepY += oy / od * dt * 0.8; }
    }
    if (e.type === "spore") { stepX += Math.sin(e.t * 2.1) * dt * 0.3; stepY += Math.cos(e.t * 1.7) * dt * 0.3; }
    if (!this.slide(e, stepX, stepY, e.r * 0.9)) {
      /* stuck on a corner: try sliding along it */
      this.slide(e, stepX * 0.5 + (Math.random() - 0.5) * dt, stepY * 0.5 + (Math.random() - 0.5) * dt, e.r * 0.9);
    }
  };
  W.shoot = function (e, S) {
    var P = this.P, a = Math.atan2(P.y - e.y, P.x - e.x) + (Math.random() - 0.5) * 0.08;
    this.bolt(e.x, e.y, a, S.spd, S.dmg, e.r + 0.1);
    this.hooks.zap && this.hooks.zap(e);
  };
  W.bolt = function (x, y, a, spd, dmg, off) {
    var dx = Math.cos(a), dy = Math.sin(a);
    this.things.push({ kind: "bolt", x: x + dx * off, y: y + dy * off, vx: dx * spd, vy: dy * spd, dmg: dmg, t: 0 });
  };
  W.updateBolt = function (b, dt) {
    var P = this.P;
    b.t += dt;
    var steps = 3;
    for (var s = 0; s < steps; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      if (this.opaque(b.x | 0, b.y | 0) || b.t > 6) { b.gone = true; this.fx.push({ s: "spark", x: b.x - b.vx * 0.02, y: b.y - b.vy * 0.02, z: 0.3, h: 0.2, t: 0, life: 0.15, glow: true }); return; }
      if (!P.dead && Math.hypot(P.x - b.x, P.y - b.y) < 0.32) { b.gone = true; this.hurtPlayer(b.dmg, b.x - b.vx, b.y - b.vy); return; }
      for (var i = 0; i < this.things.length; i++) {
        var o = this.things[i];
        if (o.kind === "barrel" && !o.gone && Math.hypot(o.x - b.x, o.y - b.y) < o.r) { b.gone = true; this.hurtThing(o, 2); return; }
      }
    }
  };
  /* the core: shielded while its nodes stand; rings of bolts, aimed shots once it is hurt, crawlers from the vents */
  W.updateCore = function (e, dt, dist) {
    if (!e.awake) return;
    e.ring = (e.ring == null ? 2 : e.ring) - dt;
    e.aim = (e.aim == null ? 1.5 : e.aim) - dt;
    e.spawn = (e.spawn == null ? 5 : e.spawn) - dt;
    var hurt = e.hp < e.F.hp / 2, shielded = this.shielded();
    if (e.ring <= 0) {
      e.ring = hurt ? 2.2 : 3.0; e.act = 0.3;
      var n = hurt ? 12 : 9, off = e.t * 0.7;
      for (var k = 0; k < n; k++) this.bolt(e.x, e.y, off + k * 2 * Math.PI / n, 2.6, 8, e.r + 0.1);
      this.hooks.zap && this.hooks.zap(e);
    }
    if ((hurt || !shielded) && e.aim <= 0 && e.see) { e.aim = hurt ? 1.1 : 1.8; this.shoot(e, { spd: 4.6, dmg: 9 }); }
    if (e.spawn <= 0) {
      e.spawn = shielded ? 7 : 5;
      var alive = 0, vents = [];
      for (var i = 0; i < this.things.length; i++) {
        var o = this.things[i];
        if (o.kind === "foe" && o.spawned && !o.dead) alive++;
        if (o.kind === "vent") vents.push(o);
      }
      if (alive < 3 && vents.length) {
        var v = vents[(Math.random() * vents.length) | 0], P = this.P;
        if (Math.hypot(v.x - P.x, v.y - P.y) > 2.5) {
          var f = this.addFoe(Math.random() < 0.3 ? "spore" : "crawler", v.x, v.y, true);
          this.fx.push({ s: "puff", x: v.x, y: v.y, z: 0, h: 0.6, t: 0, life: 0.5, grow: true });
          this.hooks.spawn && this.hooks.spawn(f);
        }
      }
    }
  };

  /* ---------------- what the renderer should draw ---------------- */
  W.sprites = function () {
    var S = LD.SPR, out = [], t = this.time, P = this.P;
    for (var i = 0; i < this.things.length; i++) {
      var o = this.things[i];
      if (o.kind === "foe") {
        var e = o, s, h = e.F.h, z = e.F.z || 0;
        if (e.dead) {
          if (e.type === "core") continue;
          var k = Math.min(1, e.deadT / 0.35);
          if (k >= 1) { out.push({ x: e.x, y: e.y, s: S.debris, h: 0.2 }); continue; }
          h = h * (1 - k * 0.8); z = z * (1 - k);
        }
        var fr = Math.floor(e.t * (e.type === "crawler" ? 8 : 4)) & 1;
        if (e.type === "crawler") s = e.act > 0 ? S.crawlerBite : S.crawler[e.awake ? fr : 0];
        else if (e.type === "spore") { s = S.spore[fr]; z += Math.sin(e.t * 3) * 0.05; }
        else if (e.type === "sentry") s = e.act > 0 ? S.sentryFire : S.sentry;
        else if (e.type === "guard") s = e.act > 0 ? S.guardFire : S.guard[e.awake && e.stagger <= 0 ? fr : 0];
        else if (e.type === "node") s = S.node[fr];
        else if (e.type === "core") {
          s = e.flash > 0 || e.act > 0 ? S.coreHurt : S.core;
          out.push({ x: e.x, y: e.y, s: s, h: h, z: z, flash: e.flash > 0 && !this.shielded() });
          if (this.shielded() && (Math.floor(t * 10) & 1)) out.push({ x: e.x + (P.x - e.x) * 0.02, y: e.y + (P.y - e.y) * 0.02, s: S.shield, h: h * 1.1, z: -0.03, glow: true });
          continue;
        }
        out.push({ x: e.x, y: e.y, s: s, h: h, z: z, flash: e.flash > 0 && !e.dead, flip: e.type === "crawler" && (Math.floor(e.t * 2) & 1) && !e.awake });
      } else if (o.kind === "bolt") out.push({ x: o.x, y: o.y, s: S.bolt[Math.floor(o.t * 12) & 1], h: 0.2, z: 0.32, glow: true });
      else if (o.kind === "item") {
        var it = o.it, sp = it.kind === "card" ? S.card[it.n] : S[it.s];
        out.push({ x: o.x, y: o.y, s: sp, h: it.h, z: it.kind === "card" ? 0.08 + Math.sin(t * 3) * 0.04 : 0 });
      } else if (o.kind === "barrel") out.push({ x: o.x, y: o.y, s: S.barrel, h: 0.62 });
      else if (o.kind === "decor") out.push({ x: o.x, y: o.y, s: S[o.d.s], h: o.d.h, glow: o.d.glow });
    }
    for (var f = 0; f < this.fx.length; f++) {
      var x = this.fx[f], spr = S[x.s];
      if (Array.isArray(spr)) spr = spr[Math.min(spr.length - 1, Math.floor(x.t / x.life * spr.length))];
      var g = x.grow ? 0.6 + x.t / x.life * 0.8 : 1;
      out.push({ x: x.x, y: x.y, s: spr, h: x.h * g, z: x.z, glow: x.glow });
    }
    return out;
  };

  LD.World = World; LD.WEAPONS = WEAPONS; LD.FOES = FOES;
})();
