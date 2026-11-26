/* Lost Deck: the game. Title, deck list, briefing, play, pause map, results, the end.
   The view is the raycaster's tone buffer copied onto lo-game's 160 x 160 screen, with the HUD below it.
   MIT License. */
(function () {
  "use strict";
  var LD = window.LD, R = LD.R;
  var game = LoGame.create({ width: 160, height: 160, lang: "zh" });
  var T = game.t, g = game.g;
  var W = 160, VH = R.VH;
  document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";
  function t(zh, en, vars) { return T({ zh: zh, en: en }, vars); }

  /* ---------------- the save ----------------
     {v: 1, unlocked: n, best: {"<deck>": {time, kills, foes, secrets, total, marks: [time, kills, secrets]}}, tips: {}}
     A save from a newer version is never written over; a save that cannot be read is left alone too. */
  var SAVE_V = 1;
  var save = { v: SAVE_V, unlocked: 1, best: {}, tips: {} }, saveOk = false, saveMsg = null;
  function loadSave() {
    return game.load("save").then(function (v) {
      if (v == null) { saveOk = true; return; }
      if (typeof v !== "object" || typeof v.v !== "number") { saveMsg = t("存档格式不对，这次不保存。", "Save not understood; not saving."); return; }
      if (v.v > SAVE_V) { saveMsg = t("存档来自新版本，请更新游戏。", "Save is from a newer version. Update the game."); return; }
      save.unlocked = Math.max(1, Math.min(LD.DECKS.length + 1, v.unlocked | 0));
      save.best = v.best && typeof v.best === "object" ? v.best : {};
      save.tips = v.tips && typeof v.tips === "object" ? v.tips : {};
      saveOk = true;
    }, function () { saveMsg = t("存档读不出来，这次不保存。", "Save could not be read; not saving."); });
  }
  function writeSave() {
    if (!saveOk) return;
    game.save("save", { v: SAVE_V, unlocked: save.unlocked, best: save.best, tips: save.tips });
    try { if (typeof PAD !== "undefined" && PAD.setSchema) PAD.setSchema(SAVE_V); } catch (e) {}
  }

  /* ---------------- sounds: soft on purpose, they repeat a lot ---------------- */
  var SFX = {
    rivet: { wave: "noise", from: 2200, to: 400, ms: 90, attack: 1, vol: 0.45 },
    scatter: { wave: "noise", from: 900, to: 90, ms: 230, attack: 1, vol: 0.7 },
    swing: { wave: "triangle", from: 320, to: 140, ms: 90, vol: 0.4 },
    clang: { wave: "square", duty: 1, from: 760, to: 700, ms: 70, vol: 0.3 },
    hit: { wave: "triangle", from: 520, to: 180, ms: 70, vol: 0.5 },
    kill: { wave: "noise", from: 700, to: 60, ms: 280, vol: 0.6 },
    door: { wave: "noise", from: 180, to: 420, ms: 380, attack: 40, vol: 0.3 },
    hurt: { wave: "square", duty: 2, from: 220, to: 80, ms: 170, vol: 0.45 },
    card: { wave: "triangle", from: 660, to: 1320, ms: 180, vol: 0.55 },
    zap: { wave: "triangle", from: 1300, to: 380, ms: 130, vol: 0.32 },
    boom: { wave: "noise", from: 420, to: 30, ms: 650, attack: 2, vol: 0.85 },
    puff: { wave: "noise", from: 260, to: 90, ms: 420, attack: 20, vol: 0.45 },
    wake: { wave: "triangle", from: 180, to: 360, ms: 220, vol: 0.28, vibrato: { depth: 1, rate: 14 } },
    ping: { wave: "triangle", from: 1600, to: 1500, ms: 70, vol: 0.28 },
    lift: { wave: "triangle", from: 200, to: 600, ms: 900, attack: 80, vol: 0.5, vibrato: { depth: 0.4, rate: 5 } },
    step: { wave: "noise", from: 120, to: 80, ms: 40, vol: 0.12 }
  };
  var lastSfx = {};
  function sfx(name) {
    var now = game.time;
    if (lastSfx[name] != null && now - lastSfx[name] < 0.06) return;
    lastSfx[name] = now;
    game.sfx(SFX[name] || name);
  }

  /* ---------------- copying the tone buffer onto the screen ---------------- */
  function blit(fb, y0, h) {
    for (var y = 0; y < h; y++) {
      var row = y * W, x = 0;
      while (x < W) {
        var c = fb[row + x], s = x;
        while (x < W && fb[row + x] === c) x++;
        g.rect(s, y0 + y, x - s, 1, c);
      }
    }
  }
  /* a grid sprite into the tone buffer at a whole-number scale */
  function stampFb(fb, s, x0, y0, k, tone) {
    for (var y = 0; y < s.h; y++) for (var x = 0; x < s.w; x++) {
      var v = s.px[y * s.w + x]; if (v === 255) continue;
      if (tone != null) v = tone;
      for (var yy = 0; yy < k; yy++) {
        var py = y0 + y * k + yy; if (py < 0 || py >= VH) continue;
        for (var xx = 0; xx < k; xx++) { var px = x0 + x * k + xx; if (px >= 0 && px < W) fb[py * W + px] = v; }
      }
    }
  }

  /* big text: draw it once with the pixel font, read the pixels back, keep them as a bitmap */
  var bigCache = {};
  function bigText(str, cx, y, k, tone) {
    var b = bigCache[str];
    if (!b) {
      var w = Math.ceil(g.measure(str)), h = 14;
      g.rect(0, 0, w + 2, h, 3);
      g.text(str, 0, 0, { color: 0 });
      var px = [];
      for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) if (g.get(xx, yy) === 0) px.push(xx, yy);
      b = bigCache[str] = { w: w, px: px };
      g.rect(0, 0, w + 2, h, 3);
    }
    var x0 = Math.round(cx - b.w * k / 2);
    for (var i = 0; i < b.px.length; i += 2) g.rect(x0 + b.px[i] * k, y + b.px[i + 1] * k, k, k, tone);
  }

  var ICON = {};
  Object.keys(LD.ICON).forEach(function (k) { ICON[k] = LoGame.sprite(LD.ICON[k]); });

  /* ---------------- stars, for the title and the lift ---------------- */
  var stars = [];
  for (var si = 0; si < 60; si++) stars.push({ x: Math.random() * 160, y: Math.random() * 160, z: 0.3 + Math.random() * 0.7 });
  function drawStars(dt, speed) {
    g.clear(0);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      s.y += dt * speed * s.z * 30; if (s.y > 160) { s.y -= 160; s.x = Math.random() * 160; }
      g.pixel(s.x, s.y, s.z > 0.75 ? 3 : s.z > 0.5 ? 2 : 1);
    }
  }
  function hint(str, y) { g.text(str, 80, y, { color: 3, align: "center" }); }
  function clock(sec) { sec = Math.max(0, Math.floor(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ":" + (s < 10 ? "0" : "") + s; }
  function dname(d) { return T(d.name); }

  /* ---------------- title ---------------- */
  var titleSel = 0;
  game.scene("title", {
    enter: function () { game.music(LD.MUSIC.title); game.ambience(null); },
    update: function () {
      var items = titleItems();
      var d = game.dir();
      if (d.y) { titleSel = (titleSel + d.y + items.length) % items.length; sfx("tick"); }
      if (game.pressed("a") || game.pressed("start")) {
        sfx("ok");
        var it = items[titleSel];
        if (it.id === "go") startDeck(Math.min(save.unlocked, LD.DECKS.length) - 1);
        else if (it.id === "decks") game.go("decks");
        else if (it.id === "help") game.go("help");
      }
    },
    draw: function (gg) {
      drawStars(1 / 60, 0.25);
      /* the station: a ring and a spine, drawn in dark */
      var cx = 80, cy = 58;
      for (var a = 0; a < 64; a++) { var ang = a / 64 * Math.PI * 2; g.pixel(cx + Math.cos(ang) * 34, cy + Math.sin(ang) * 10, 1); g.pixel(cx + Math.cos(ang) * 33, cy + Math.sin(ang) * 9.5, 1); }
      g.rect(cx - 2, cy - 24, 4, 48, 1); g.rect(cx - 8, cy - 4, 16, 8, 1); g.rect(cx - 6, cy - 2, 12, 4, 2);
      if (Math.floor(game.time * 1.5) & 1) g.pixel(cx, cy - 25, 3);
      bigText(t("失联站", "LOST DECK"), 80, 14, game.lang === "zh" ? 3 : 2, 3);
      var items = titleItems(), y0 = 92;
      for (var i = 0; i < items.length; i++) {
        var sel = i === titleSel, y = y0 + i * 16;
        if (sel) g.rect(30, y - 1, 100, 15, 3);
        g.text(items[i].label, 80, y, { color: sel ? 0 : 2, align: "center" });
      }
      g.text(saveMsg || t("A 确定  上下 选", "A select  UP/DOWN"), 80, 146, { color: saveMsg ? 3 : 1, align: "center" });
    }
  });
  function titleItems() {
    var n = Math.min(save.unlocked, LD.DECKS.length);
    var first = save.unlocked > 1 ? t("继续：第{n}层", "Go on: deck {n}", { n: n }) : t("出发", "Start");
    return [{ id: "go", label: first }, { id: "decks", label: t("选层", "Decks") }, { id: "help", label: t("操作", "Controls") }];
  }

  /* ---------------- controls ---------------- */
  game.scene("help", {
    update: function () { if (game.pressed("a") || game.pressed("b") || game.pressed("start") || game.pointer.pressed) { sfx("tap"); game.go("title"); } },
    draw: function () {
      g.clear(3);
      g.text(t("操作", "Controls"), 80, 6, { align: "center" });
      g.rect(8, 22, 144, 1, 0);
      var rows = [
        [t("上 下", "UP DOWN"), t("前进 后退", "walk")],
        [t("左 右", "LEFT RIGHT"), t("转身", "turn")],
        [t("A 按住", "A hold"), t("开火", "fire")],
        [t("B", "B"), t("按开关 读终端", "use, read")],
        [t("B+左右", "B+L/R"), t("横移", "sidestep")],
        [t("SELECT", "SELECT"), t("换武器", "weapon")],
        [t("START", "START"), t("暂停 地图", "pause, map")]
      ];
      for (var i = 0; i < rows.length; i++) {
        g.text(rows[i][0], 10, 28 + i * 15);
        g.text(rows[i][1], 150, 28 + i * 15, { align: "right", color: 1 });
      }
      g.text(t("走向门就会开。", "Doors open as you walk in."), 80, 136, { align: "center", color: 1 });
      g.text(t("A 返回", "A back"), 80, 148, { align: "center", color: 1 });
    }
  });

  /* ---------------- deck list ---------------- */
  var deckSel = 0;
  game.scene("decks", {
    enter: function () { deckSel = Math.min(save.unlocked, LD.DECKS.length) - 1; },
    update: function () {
      var d = game.dir(), n = LD.DECKS.length;
      if (d.y) { deckSel = (deckSel + d.y + n) % n; sfx("tick"); }
      if (game.pressed("b")) { sfx("tap"); game.go("title"); }
      if (game.pressed("a") || game.pressed("start")) {
        if (deckSel < save.unlocked) { sfx("ok"); startDeck(deckSel); } else sfx("err");
      }
    },
    draw: function () {
      g.clear(3);
      g.text(t("选层", "Decks"), 6, 4);
      var got = 0;
      Object.keys(save.best).forEach(function (k) { var b = save.best[k]; if (b && b.marks) b.marks.forEach(function (m) { if (m) got++; }); });
      g.text(t("标记 {a}/{b}", "Marks {a}/{b}", { a: got, b: LD.DECKS.length * 3 }), 154, 4, { align: "right", color: 1 });
      g.rect(0, 19, 160, 1, 0);
      var top = Math.max(0, Math.min(deckSel - 3, LD.DECKS.length - 7));
      for (var i = top; i < Math.min(LD.DECKS.length, top + 7); i++) {
        var D = LD.DECKS[i], y = 22 + (i - top) * 17, sel = i === deckSel, open = i < save.unlocked, b = save.best[D.id];
        if (sel) g.rect(0, y - 1, 160, 16, 0);
        var c = sel ? 3 : open ? 0 : 1;
        g.text((i + 1) + " " + (open ? dname(D) : "------"), 6, y + 1, { color: c });
        if (b) {
          for (var m = 0; m < 3; m++) {
            var mx = 122 + m * 10;
            if (b.marks[m]) g.rect(mx, y + 3, 7, 7, c); else g.frame(mx, y + 3, 7, 7, c);
          }
        } else if (open) g.text(t("新", "new"), 154, y + 1, { color: c, align: "right" });
      }
      var D2 = LD.DECKS[deckSel], b2 = save.best[D2.id];
      g.rect(0, 141, 160, 1, 0);
      var line = deckSel >= save.unlocked ? t("先通过上一层", "Clear the deck before") :
        b2 ? t("最快 {a}  标准 {b}", "Best {a}  par {b}", { a: clock(b2.time), b: clock(D2.par) }) : t("标准 {b}", "Par {b}", { b: clock(D2.par) });
      g.text(line, 80, 145, { align: "center", color: 1 });
    }
  });

  /* ---------------- briefing ---------------- */
  var deckIdx = 0;
  function startDeck(i) { deckIdx = i; game.go("brief", null, { to: 0 }); }
  game.scene("brief", {
    enter: function () { this.t = 0; game.musicStop(); game.ambience("wind", 0.25); },
    update: function (dt) {
      this.t += dt;
      if (game.pressed("b")) { sfx("tap"); game.go("decks"); return; }
      if (game.pressed("a") || game.pressed("start") || game.pointer.pressed) {
        var D = LD.DECKS[deckIdx], full = T(D.brief).length;
        if (this.t * 30 < full) { this.t = 99; return; }
        sfx("ok"); game.go("play", null, { to: 0 });
      }
    },
    draw: function () {
      var D = LD.DECKS[deckIdx];
      g.clear(0);
      g.text(t("第{n}层", "DECK {n}", { n: deckIdx + 1 }), 8, 8, { color: 2 });
      g.text(dname(D), 8, 22, { color: 3 });
      g.rect(8, 38, 144, 1, 1);
      var txt = T(D.brief), n = Math.min(txt.length, Math.floor(this.t * 30));
      g.text(txt.slice(0, n), 8, 44, { color: 3, width: 144 });
      if (n >= txt.length) {
        g.text(t("目标", "Goal"), 8, 112, { color: 2 });
        g.text(T(D.goal), 8, 126, { color: 3 });
        if (Math.floor(this.t * 2) & 1) g.text(t("A 出发", "A go"), 152, 146, { color: 3, align: "right" });
        else g.text(t("A 出发", "A go"), 152, 146, { color: 2, align: "right" });
      }
      if (Math.floor(this.t * 3) & 1 && n < txt.length) g.rect(8, 150, 5, 2, 3);
    }
  });

  /* ---------------- play ---------------- */
  var world = null, toast = null, toastT = 0, bigMsg = null, bigT = 0, bHeld = 0, bMoved = false, pending = null, endT = 0;
  function say(msg, sec) { toast = msg; toastT = sec || 2.2; }
  function tip(id, msg) { if (save.tips[id]) return; save.tips[id] = 1; say(msg, 3.2); }
  var GUN_NAME = { wrench: { zh: "扳手", en: "Wrench" }, rivet: { zh: "铆钉枪", en: "Rivet gun" }, scatter: { zh: "散钉枪", en: "Scatter" } };
  var CARD_NAME = [null, { zh: "方块", en: "square" }, { zh: "圆形", en: "circle" }, { zh: "三角", en: "triangle" }];
  var FOE_TIP = {
    crawler: { zh: "爬行机：贴身咬人，一钉就倒。", en: "Crawler: bites up close. One rivet." },
    spore: { zh: "孢子：靠近会炸，远远打掉它。", en: "Spore: bursts near you. Pop it from afar." },
    sentry: { zh: "哨兵：不动，打光弹。躲在墙后等它停火。", en: "Sentry: fixed, fires bolts. Duck behind walls." },
    guard: { zh: "警卫机：三连发，会躲。散钉枪近打。", en: "Guard: three-shot bursts. Scatter it close." },
    node: { zh: "电源节点：打掉它们，核心的护盾才会消失。", en: "Power nodes: break them to drop the shield." }
  };
  var hooks = {
    door: function () { sfx("door"); },
    locked: function (k) { sfx("err"); say(t("要{c}门卡。", "Needs the {c} card.", { c: T(CARD_NAME[k]) })); },
    exit: function () { if (!pending) { pending = "exit"; endT = 0; sfx("lift"); } },
    secret: function (n, m) { sfx("win"); say(t("暗格 {n}/{m}", "Secret {n}/{m}", { n: n, m: m }), 2.5); },
    terminal: function (i) {
      var D = LD.DECKS[deckIdx], log = D.logs && D.logs[i];
      sfx("tap");
      if (log) game.say(T(log), { name: t("终端", "TERMINAL") });
    },
    nothing: function () {},
    swap: function (gname) { sfx("tick"); say(T(GUN_NAME[gname]), 1); },
    empty: function (gname) { sfx("miss"); say(t("没钉了，换{g}", "Out of rivets: {g}", { g: T(GUN_NAME[gname]) }), 1.6); },
    shot: function (gname) { sfx(gname === "wrench" ? "swing" : gname); },
    clang: function () { sfx("clang"); },
    hit: function () { sfx("hit"); },
    kill: function (e) { sfx("kill"); },
    ping: function () { sfx("ping"); tip("shield", t("核心有护盾。先打电源节点。", "The core is shielded. Break the nodes.")); },
    boom: function (x, y, gas) { sfx(gas ? "puff" : "boom"); if (!gas) game.shake(2, 0.25); },
    hurt: function (d) { sfx("hurt"); if (d >= 12) game.shake(2, 0.2); },
    dead: function () { pending = "dead"; endT = 0; game.musicStop(); },
    pickup: function (it) {
      if (it.kind === "card") { sfx("card"); say(t("拿到{c}门卡", "Got the {c} card", { c: T(CARD_NAME[it.n]) }), 2.4); }
      else if (it.kind === "gun") { sfx("card"); say(t("散钉枪！SELECT 换枪", "Scatter gun! SELECT swaps"), 3); }
      else if (it.kind === "ammo") { sfx("coin"); say(t("铆钉 +{n}", "Rivets +{n}", { n: it.n }), 1.2); }
      else { sfx("coin"); say(t("医疗 +{n}", "Med +{n}", { n: it.n }), 1.2); }
    },
    full: function (it) { if (it.kind === "med") say(t("生命已满", "Health full"), 1.2); else if (it.kind === "ammo") say(t("铆钉已满", "Rivets full"), 1.2); },
    wake: function (e) { sfx("wake"); if (FOE_TIP[e.type]) tip("foe-" + e.type, T(FOE_TIP[e.type])); },
    zap: function () { sfx("zap"); },
    spawn: function () { sfx("puff"); },
    coreDown: function () { pending = "core"; endT = 0; game.musicStop(); }
  };

  game.scene("play", {
    enter: function () {
      var D = LD.DECKS[deckIdx];
      world = new LD.World(D, hooks);
      toast = null; toastT = 0; pending = null; endT = 0; bHeld = 0; bMoved = false;
      bigMsg = t("第{n}层 {name}", "DECK {n} {name}", { n: deckIdx + 1, name: dname(D) }); bigT = 2.2;
      game.music(D.boss ? LD.MUSIC.boss : LD.MUSIC.deck);
      game.ambience("wind", D.dark ? 0.35 : 0.18);
      if (deckIdx === 0) game.after(2.4, function () { tip("move", t("上下走，左右转。A 开火。", "UP/DOWN walk, LEFT/RIGHT turn. A fires.")); });
      if (D.dark) game.after(2.4, function () { tip("dark", t("停电了。只有手电照亮前方。", "Power is out. Only your torch lights the way.")); });
    },
    update: function (dt) {
      if (!world) return;
      toastT -= dt; bigT -= dt;
      if (pending) { endT += dt; world.update(dt * (pending === "dead" ? 0.3 : 1), {}); return this.finish(); }
      if (game.pressed("start")) { sfx("tap"); game.push("pause"); return; }
      /* B: a short press uses what is in front; held with LEFT or RIGHT it sidesteps */
      var input = { up: game.btn("up"), down: game.btn("down"), left: game.btn("left"), right: game.btn("right") };
      if (game.pressed("b")) { bHeld = 0; bMoved = false; }
      if (game.btn("b")) { bHeld += dt; if (input.left || input.right) bMoved = true; input.strafe = true; }
      if (game.released("b") && !bMoved && bHeld < 0.4) input.use = true;
      input.fire = game.btn("a") || (game.pointer.down && game.pointer.y < VH);
      input.swap = game.pressed("select");
      world.update(dt, input);
      var P = world.P;
      if (P.hp > 0 && P.hp <= 25) tip("low", t("生命低。找绿十字医疗包。", "Low health. Look for med kits."));
      if (deckIdx === 0 && world.time > 12) tip("use", t("B 读终端、推松动的墙板。", "B reads terminals and pushes loose panels."));
    },
    finish: function () {
      if (pending === "exit" && endT > 1.0) { pending = null; finishDeck(); }
      else if (pending === "dead" && endT > 1.8) { pending = null; game.go("dead", null, { to: 0 }); }
      else if (pending === "core" && endT > 3.2) { pending = null; finishDeck(); }
      else if (pending === "core" && Math.random() < 0.08) { sfx("boom"); game.shake(3, 0.3); }
    },
    draw: function () {
      if (!world) return;
      var D = LD.DECKS[deckIdx], P = world.P;
      var bob = Math.sin(P.bob) * 1.5 * P.moving;
      var view = { x: P.x, y: P.y, a: P.a, bob: bob * 0.6, fog: D.fog || 0.42, dark: D.dark || 0, time: world.time, light: 0 };
      if (P.kick > 0.08 && P.gun !== "wrench") view.light = 0.6;
      R.render(world.M, view, world.sprites());
      var fb = R.fb;
      drawGun(fb, P, bob);
      if (P.gas > 0) gasOverlay(fb, P.gas);
      if (P.hurt > 0) hurtOverlay(fb, P);
      if (pending === "dead") fadeFb(fb, Math.min(1, endT / 1.5));
      if (pending === "exit") fadeFb(fb, Math.min(1, endT / 0.9));
      if (pending === "core") flashFb(fb, endT);
      blit(fb, 0, VH);
      drawHud(P);
      if (toastT > 0 && toast) {
        var lines = g.wrap(toast, 150), w = 0;
        for (var li = 0; li < lines.length; li++) w = Math.max(w, g.measure(lines[li]));
        w = Math.min(158, w + 8);
        g.rect(80 - w / 2, 2, w, lines.length * 13 + 3, 0);
        for (var lj = 0; lj < lines.length; lj++) g.text(lines[lj], 80, 3 + lj * 13, { color: 3, align: "center" });
      }
      if (bigT > 0 && bigMsg) {
        var w2 = Math.min(156, g.measure(bigMsg) + 10);
        g.rect(80 - w2 / 2, 96, w2, 18, 0); g.frame(80 - w2 / 2, 96, w2, 18, 2);
        g.text(bigMsg, 80, 99, { color: 3, align: "center" });
      }
    }
  });

  function drawGun(fb, P, bob) {
    var s = LD.GUN[P.gun], k = 2;
    var kick = P.kick > 0 ? (P.gun === "wrench" ? -10 * Math.sin(P.kick / 0.16 * Math.PI) : 4 * P.kick / 0.16) : 0;
    var x0 = 80 - s.w * k / 2 + Math.round(Math.cos(P.bob * 0.5) * 3 * P.moving) + (P.gun === "wrench" ? 18 : 10);
    var y0 = VH - s.h * k + 4 + Math.round(Math.abs(bob) * 2) + Math.round(kick);
    if (P.kick > 0.06 && P.gun !== "wrench") {
      /* muzzle flash */
      var fx = x0 + (P.gun === "scatter" ? 21 : 25), fy = y0 - 2, r = P.gun === "scatter" ? 10 : 6;
      for (var yy = -r; yy <= r; yy++) for (var xx = -r; xx <= r; xx++) {
        var d = xx * xx + yy * yy; if (d > r * r) continue;
        var py = fy + yy, px = fx + xx; if (py < 0 || py >= VH || px < 0 || px >= W) continue;
        fb[py * W + px] = d < r * r * 0.35 ? 3 : ((xx + yy) & 1) ? 3 : fb[py * W + px];
      }
    }
    stampFb(fb, s, x0, y0, k);
    /* a small sight in the middle: shots go exactly there */
    var cy = VH >> 1;
    fb[cy * W + 80] = 3; fb[(cy - 3) * W + 80] = 0; fb[(cy + 3) * W + 80] = 0; fb[cy * W + 77] = 0; fb[cy * W + 83] = 0;
  }
  function hurtOverlay(fb, P) {
    var k = P.hurt / 0.35, edge = Math.round(4 + 14 * k), side = P.hurtDir;
    var left = side < -0.4 ? 2 : 1, right = side > 0.4 ? 2 : 1;
    for (var y = 0; y < VH; y++) for (var x = 0; x < W; x++) {
      var e = Math.min(x * right, (W - 1 - x) * left, y * 2, (VH - 1 - y) * 2);
      if (e < edge * 1.6 && ((x + y) & 1)) fb[y * W + x] = 0;
    }
  }
  function gasOverlay(fb, gas) {
    var lvl = Math.min(1, gas / 1.4);
    for (var y = 0; y < VH; y++) for (var x = 0; x < W; x++) {
      if (R.BAYER[(y & 3) * 4 + (x & 3)] < lvl * 0.55) fb[y * W + x] = Math.max(0, Math.min(1, fb[y * W + x]));
    }
  }
  function fadeFb(fb, k) {
    for (var y = 0; y < VH; y++) for (var x = 0; x < W; x++) {
      var v = fb[y * W + x] - Math.floor(k * 3 + R.BAYER[(y & 3) * 4 + (x & 3)]);
      fb[y * W + x] = v < 0 ? 0 : v;
    }
  }
  function flashFb(fb, t2) {
    if (t2 > 2.2) fadeFb(fb, Math.min(1, (t2 - 2.2) / 1));
    else if ((Math.floor(t2 * 12) & 3) === 0) for (var i = 0; i < fb.length; i++) fb[i] = 3 - fb[i];
  }

  function drawHud(P) {
    g.rect(0, VH, W, 160 - VH, 3);
    g.rect(0, VH, W, 1, 0);
    var y1 = VH + 3;
    /* health: icon, number and a bar */
    g.sprite(ICON.hp, 3, y1 + 3);
    g.text(String(P.hp), 13, y1, { color: P.hp <= 25 && (Math.floor(game.time * 4) & 1) ? 1 : 0 });
    g.frame(3, y1 + 15, 44, 5, 0); g.rect(4, y1 + 16, Math.round(42 * P.hp / 100), 3, 0);
    /* rivets */
    g.sprite(ICON.rivet, 54, y1 + 3);
    g.text(P.gun === "wrench" && P.ammo === 0 ? "--" : String(P.ammo), 64, y1);
    g.text(T(GUN_NAME[P.gun]), 54, y1 + 14, { color: 1 });
    /* cards */
    for (var k = 1; k <= 3; k++) {
      var x = 116 + (k - 1) * 14;
      if (world.cards[k]) g.sprite(ICON["card" + k], x, y1 + 2); else g.sprite(ICON.empty, x, y1 + 2);
    }
    g.text(t("敌{a}/{b}", "{a}/{b}", { a: world.kills, b: world.foes }), 157, y1 + 14, { color: 1, align: "right" });
  }

  /* ---------------- pause and the map ---------------- */
  var pauseSel = 0;
  game.scene("pause", {
    enter: function () { pauseSel = 0; },
    update: function () {
      var d = game.dir();
      if (d.y) { pauseSel = (pauseSel + d.y + 3) % 3; sfx("tick"); }
      if (game.pressed("b") || game.pressed("start")) { sfx("tap"); game.pop(); return; }
      if (game.pressed("a")) {
        sfx("ok");
        if (pauseSel === 0) game.pop();
        else if (pauseSel === 1) { game.pop(); game.go("play", null, { to: 0 }); }
        else { game.pop(); game.go("decks"); }
      }
    },
    draw: function () {
      g.rect(0, 0, 160, VH, 0);
      drawMap(world, 4, 4, 152, 80);
      var items = [t("继续", "Resume"), t("重来这一层", "Restart deck"), t("选层", "Decks")];
      for (var j = 0; j < 3; j++) {
        var yj = 87 + j * 13, s2 = j === pauseSel;
        if (s2) g.rect(0, yj, 96, 13, 3);
        g.text(items[j], 6, yj, { color: s2 ? 0 : 2 });
      }
      g.text(clock(world.time), 154, 88, { color: 2, align: "right" });
      g.text(t("暗格{a}/{b}", "Sec {a}/{b}", { a: world.secretsFound, b: world.secrets }), 154, 101, { color: 2, align: "right" });
      g.text(t("敌{a}/{b}", "Foe {a}/{b}", { a: world.kills, b: world.foes }), 154, 114, { color: 2, align: "right" });
    }
  });
  function drawMap(Wd, x0, y0, w, h) {
    var M = Wd.M, k = Math.max(2, Math.min(Math.floor(w / M.w), Math.floor(h / M.h), 7));
    var ox = x0 + Math.floor((w - M.w * k) / 2), oy = y0 + Math.floor((h - M.h * k) / 2);
    for (var y = 0; y < M.h; y++) for (var x = 0; x < M.w; x++) {
      var i = y * M.w + x; if (!M.seen[i]) continue;
      var c = M.cells[i], px = ox + x * k, py = oy + y * k;
      if (c === 0) g.rect(px, py, k, k, 1);
      else if (c >= 10 && c <= 13) { g.rect(px, py, k, k, 2); if (c > 10 && !Wd.cards[c - 10]) g.rect(px + 1, py + 1, k - 2, k - 2, 0); }
      else if (c === 14) g.rect(px, py, k, k, (Math.floor(game.time * 3) & 1) ? 3 : 2);
      else g.rect(px, py, k, k, 2);
    }
    /* floor cells next to seen walls count as seen, so rooms fill in as you look at them */
    var P = Wd.P, cx = ox + P.x * k, cy = oy + P.y * k;
    g.rect(cx - 1, cy - 1, 3, 3, 3);
    g.line(cx, cy, cx + Math.cos(P.a) * k * 1.6, cy + Math.sin(P.a) * k * 1.6, 3);
  }

  /* ---------------- the end of a deck ---------------- */
  var result = null;
  function finishDeck() {
    var D = LD.DECKS[deckIdx];
    var r = { time: world.time, kills: world.kills, foes: world.foes, secrets: world.secretsFound, total: world.secrets };
    r.marks = [r.time <= D.par, r.kills >= r.foes, r.secrets >= r.total];
    var old = save.best[D.id], newBest = !old || r.time < old.time;
    if (old) {
      r.best = { time: Math.min(old.time, r.time), kills: Math.max(old.kills, r.kills), foes: r.foes, secrets: Math.max(old.secrets, r.secrets), total: r.total,
        marks: [old.marks[0] || r.marks[0], old.marks[1] || r.marks[1], old.marks[2] || r.marks[2]] };
    } else r.best = { time: r.time, kills: r.kills, foes: r.foes, secrets: r.secrets, total: r.total, marks: r.marks.slice() };
    r.newBest = newBest && !!old;
    save.best[D.id] = r.best;
    save.unlocked = Math.max(save.unlocked, deckIdx + 2);
    writeSave();
    result = r;
    game.go(D.boss ? "ending" : "results", null, { to: 0 });
  }
  game.scene("results", {
    enter: function () { this.t = 0; game.music(LD.MUSIC.clear, { loop: false }); game.ambience(null); },
    update: function (dt) {
      this.t += dt;
      if (this.t < 0.6) return;
      if (game.pressed("a") || game.pressed("start")) { sfx("ok"); if (deckIdx + 1 < LD.DECKS.length) startDeck(deckIdx + 1); else game.go("title"); }
      else if (game.pressed("b")) { sfx("tap"); game.go("decks"); }
    },
    draw: function () {
      var D = LD.DECKS[deckIdx], r = result, k = Math.min(1, this.t / 1.2);
      drawStars(1 / 60, 3);
      g.text(t("第{n}层 通过", "DECK {n} CLEAR", { n: deckIdx + 1 }), 80, 10, { color: 3, align: "center" });
      g.text(dname(D), 80, 24, { color: 2, align: "center" });
      var rows = [
        [t("用时", "Time"), clock(r.time * k), t("标准 {p}", "par {p}", { p: clock(D.par) }), r.marks[0]],
        [t("消灭", "Kills"), Math.round(r.kills * k) + "/" + r.foes, "", r.marks[1]],
        [t("暗格", "Secrets"), Math.round(r.secrets * k) + "/" + r.total, "", r.marks[2]]
      ];
      for (var i = 0; i < 3; i++) {
        var y = 46 + i * 22;
        g.text(rows[i][0], 12, y, { color: 2 });
        g.text(rows[i][1], 108, y, { color: 3, align: "right" });
        if (rows[i][2]) g.text(rows[i][2], 108, y + 11, { color: 1, align: "right" });
        if (this.t > 1.3 + i * 0.25) { if (rows[i][3]) g.rect(132, y + 2, 9, 9, 3); else g.frame(132, y + 2, 9, 9, 2); }
      }
      if (r.newBest && this.t > 2) g.text(t("新纪录", "New best"), 80, 112, { color: 3, align: "center" });
      if (this.t > 1.6) {
        var next = deckIdx + 1 < LD.DECKS.length ? t("A 下一层", "A next deck") : t("A 返回", "A back");
        g.text(next + "   " + t("B 选层", "B decks"), 80, 144, { color: 2, align: "center" });
      }
    }
  });
  game.scene("dead", {
    enter: function () { this.t = 0; game.ambience(null); },
    update: function (dt) {
      this.t += dt;
      if (this.t < 0.8) return;
      if (game.pressed("a") || game.pressed("start")) { sfx("ok"); game.go("play", null, { to: 0 }); }
      else if (game.pressed("b")) { sfx("tap"); game.go("decks"); }
    },
    draw: function () {
      g.clear(0);
      for (var y = 0; y < 160; y += 2) if (Math.random() < 0.5) g.rect(0, y, 160, 1, 1);
      g.text(t("信号中断", "SIGNAL LOST"), 80, 60, { color: 3, align: "center" });
      g.text(t("第{n}层 {t}", "Deck {n}  {t}", { n: deckIdx + 1, t: clock(world ? world.time : 0) }), 80, 78, { color: 2, align: "center" });
      if (this.t > 0.8) g.text(t("A 再来  B 选层", "A retry  B decks"), 80, 140, { color: 2, align: "center" });
    }
  });
  game.scene("ending", {
    enter: function () { this.t = 0; game.music(LD.MUSIC.title); game.ambience(null); },
    update: function (dt) {
      this.t += dt;
      if (this.t > 2 && (game.pressed("a") || game.pressed("start") || game.pressed("b"))) { sfx("ok"); game.go("title"); }
    },
    draw: function () {
      drawStars(1 / 60, 0.6);
      var lines = LD.ENDING[game.lang] || LD.ENDING.zh, y = 20;
      var shown = Math.floor(this.t * 0.7);
      for (var i = 0; i < Math.min(lines.length, shown + 1); i++) { y += g.text(lines[i], 80, y, { color: i === shown ? 2 : 3, align: "center", width: 150 }) + 4; }
      if (this.t > 2) g.text(t("A 返回", "A back"), 80, 146, { color: 1, align: "center" });
    }
  });

  loadSave().then(function () { game.start("title"); });
  LD.game = game;
  LD.dbg = function () { return world; };   /* for the tests */
  LD.dbgStart = function (i) { deckIdx = i; game.go("play", null, { fade: false }); };
})();
