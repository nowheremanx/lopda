/* A short, turn-based fight. The restaurant is the main course; this is how you get meat. */
var B = null;

function battleAtk() { return 6 + (hasUpgrade("whetstone") ? 2 : 0); }
function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function battleFx(text, x, y, color) {
  B.fx.push({ text: text, x: x, y: y, color: color == null ? 3 : color, until: game.time + 0.9 });
}

function battleMsg(text) { B.msg = text; }

async function enemyTurn() {
  if (B.stun > 0) {
    B.stun--;
    battleMsg("它被粉末迷了眼，扑了个空。");
    game.sfx("miss");
    await game.wait(0.5);
    B.mode = "menu";
    return;
  }
  var dmg;
  if (B.boss && B.turn % 3 === 0) {
    battleMsg("山魈捶地，整座山都在响！");
    dmg = rnd(9, 13);
  } else {
    battleMsg(B.def.name + "扑了上来。");
    dmg = rnd(Math.max(2, B.def.atk - 1), B.def.atk + 2);
  }
  B.enemyOff = -6;
  await game.wait(0.12);
  B.enemyOff = 0;
  game.sfx("hit");
  game.shake(2, 0.18);
  B.heroHp = Math.max(0, B.heroHp - dmg);
  battleFx("-" + dmg, 36, 100, 0);
  await game.wait(0.45);
  B.turn++;
  if (B.heroHp <= 0) {
    B.result = "lose";
    B.mode = "end";
    battleMsg("眼前一黑……");
    game.sfx("lose");
    return;
  }
  B.mode = "menu";
}

async function playerAction(i) {
  if (B.mode !== "menu") return;
  if (i === 4) { // flee
    if (B.boss) { game.sfx("err"); battleMsg("山魈挡在路前，跑不掉。"); return; }
    B.mode = "busy";
    battleMsg("你转身就跑……");
    await game.wait(0.4);
    if (Math.random() < 0.55) {
      B.result = "flee";
      B.mode = "end";
      battleMsg("你退回了林子。");
    } else {
      battleMsg("没跑掉！");
      await game.wait(0.2);
      await enemyTurn();
    }
    return;
  }
  var cost = i === 1 ? 2 : (i === 2 || i === 3) ? 1 : 0;
  if (B.qi < cost) { game.sfx("err"); battleMsg("气不够了。"); return; }
  B.mode = "busy";
  B.qi -= cost;
  if (i === 0) {
    battleMsg("你挥刀砍去。");
    await game.wait(0.15);
    var dmg0 = Math.max(1, battleAtk() + rnd(0, 3) - B.def.def);
    B.hp = Math.max(0, B.hp - dmg0);
    B.hurtUntil = game.time + 0.12;
    game.sfx("hit"); game.flash(0.04); game.shake(1, 0.12);
    battleFx("-" + dmg0, 142, 64, 0);
  } else if (i === 1) {
    battleMsg("快刀！");
    await game.wait(0.12);
    var dmg1 = Math.max(1, battleAtk() * 2 + rnd(0, 4) - B.def.def);
    B.hp = Math.max(0, B.hp - dmg1);
    B.hurtUntil = game.time + 0.16;
    game.sfx("hit"); game.flash(0.07); game.shake(3, 0.18);
    battleFx("-" + dmg1, 138, 54, 0);
  } else if (i === 2) {
    battleMsg("你撒出一把药粉。");
    B.stun = 1;
    game.sfx("miss");
    await game.wait(0.35);
  } else {
    if (B.heroHp >= B.heroMax) { game.sfx("err"); battleMsg("伤已经好了。"); B.mode = "menu"; B.qi += cost; return; }
    var heal = Math.min(10, B.heroMax - B.heroHp);
    B.heroHp += heal;
    battleMsg("你给自己包扎了一下。");
    battleFx("+" + heal, 36, 96, 3);
    game.sfx("ok");
    await game.wait(0.45);
  }
  await game.wait(0.25);
  if (B.hp <= 0) {
    victory();
    return;
  }
  await enemyTurn();
}

function victory() {
  B.result = "win";
  B.mode = "end";
  var lines = [];
  var drops = [];
  for (var i = 0; i < B.def.drops.length; i++) {
    var d = B.def.drops[i], n = rnd(d[1], d[2]);
    if (n > 0) { addIng(d[0], n); drops.push([d[0], n]); lines.push(DATA.ING[d[0]].name + "×" + n); }
  }
  var money = rnd(B.def.money - 2, B.def.money + 2);
  addMoney(money);
  B.drops = drops;
  B.money = money;
  if (B.boss) {
    S.flags.boss = 1;
    unlockDish("god_soup");
    addRep(2);
  }
  save();
  battleMsg("赢了！" + (lines.length ? lines.join("　") + "　" : "") + money + " 文");
  game.sfx("win");
}

game.scene("battle", {
  enter: function (args) {
    var def = DATA.ENEMIES[args.enemy];
    B = {
      id: args.enemy, def: def, boss: !!args.boss, from: args.from || "forest",
      hp: def.hp, maxHp: def.hp, heroHp: 30, heroMax: 30, qi: 3, qiMax: 3,
      turn: 1, stun: 0, mode: "menu", sel: 0, msg: def.intro,
      fx: [], hurtUntil: 0, enemyOff: 0, result: null, drops: [], money: 0
    };
    busy = false;
    game.ambience(args.from === "deep" ? "wind" : "stream", 0.3);
    if (typeof playMusic === "function") playMusic("battle");
  },
  exit: function () {
    if (typeof playMusic === "function") playMusic("forest");
  },
  update: function (dt) {
    if (!B) return;
    if (B.mode === "menu") {
      if (game.repeat("left")) { B.sel = (B.sel + 3) % 4; game.sfx("move"); }
      if (game.repeat("right")) { B.sel = (B.sel + 1) % 4; game.sfx("move"); }
      if (game.repeat("up")) { B.sel = (B.sel + 2) % 4; game.sfx("move"); }
      if (game.repeat("down")) { B.sel = (B.sel + 2) % 4; game.sfx("move"); }
      if (game.pressed("a")) playerAction(B.sel);
      if (game.pressed("b")) playerAction(4);
    } else if (B.mode === "end") {
      if (game.pressed("a") || game.pressed("b")) {
        game.sfx("tap");
        game.pop({ result: B.result, drops: B.drops, money: B.money });
      }
    }
  },
  draw: function (g) {
    if (!B) return;
    ART.battleBg(g, B.from === "deep" ? "deep" : "forest", game.time);
    // enemy
    var ex = B.from === "deep" ? 122 : B.id === "boar" ? 116 : 122;
    var ey = B.id === "boss" ? 54 : B.id === "bamboo" ? 54 : 72;
    ART.enemyBig(g, B.id, ex + B.enemyOff, ey, game.time, game.time < B.hurtUntil);
    // hero
    g.dither(34, 106, 24, 3, g.DARK, 1);
    var hx = 32 + (B.heroHp > 0 ? Math.sin(game.time * 2) * 0.5 : 0);
    g.sprite(ART.big.heroSide, hx, 72, { flip: false });
    // top bars
    g.window(6, 6, 96, 26, { thin: true });
    g.text("小满", 10, 8);
    g.text(B.heroHp + "/" + B.heroMax, 96, 8, { align: "right", color: g.DARK });
    g.rect(10, 20, 84, 3, g.MID); g.rect(10, 20, Math.round(84 * B.heroHp / B.heroMax), 3, g.INK);
    g.text("气", 10, 26, { color: g.DARK });
    for (var q = 0; q < B.qiMax; q++) g.rect(24 + q * 8, 27, 5, 4, q < B.qi ? g.INK : g.MID);
    g.window(114, 6, 96, 26, { thin: true });
    g.text(B.def.name, 118, 8);
    g.text(B.hp + "/" + B.maxHp, 204, 8, { align: "right", color: g.DARK });
    g.rect(118, 20, 84, 3, g.MID); g.rect(118, 20, Math.round(84 * B.hp / B.maxHp), 3, g.INK);
    // message
    g.window(4, 144, 208, 30);
    g.text(B.msg, 10, 148, { width: 196 });
    // commands
    g.window(4, 176, 208, 46);
    var cmds = [
      ["攻击", ""], ["快刀", "2气"], ["撒粉", "1气"], ["包扎", "1气"]
    ];
    for (var i = 0; i < 4; i++) {
      var cx = i % 2 === 0 ? 10 : 110, cy = i < 2 ? 179 : 192;
      if (i === B.sel) {
        g.rect(cx - 4, cy - 1, 94, 14, g.INK);
        g.text(cmds[i][0], cx, cy, { color: g.PAPER });
        g.text(cmds[i][1], cx + 86, cy, { align: "right", color: g.PAPER });
      } else {
        var need = i === 1 ? 2 : (i === 2 || i === 3) ? 1 : 0;
        g.text(cmds[i][0], cx, cy, { color: B.qi < need ? g.DARK : g.INK });
        g.text(cmds[i][1], cx + 86, cy, { align: "right", color: g.DARK });
      }
    }
    // fx
    for (var f = 0; f < B.fx.length; f++) {
      var fx = B.fx[f];
      if (game.time < fx.until) {
        var dy = (fx.until - game.time) * 12;
        g.text(fx.text, fx.x, fx.y - dy, { color: fx.color });
      }
    }
    B.fx = B.fx.filter(function (v) { return game.time < v.until; });
    g.text("A 选　B 收手", 108, 226, { align: "center", color: g.DARK });
    if (B.mode === "end") {
      g.window(44, 100, 128, 22, { thin: true });
      g.text("A 继续", 108, 105, { align: "center" });
    }
  }
});
