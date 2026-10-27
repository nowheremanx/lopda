/* Shop: spend money on the things that make the days easier. */
var SHOP_SEL = 0, SHOP_MSG = "", SHOP_MSG_UNTIL = 0;

function shopStatus(id) {
  var u = DATA.UPGRADES[id];
  if (hasUpgrade(id)) return "已有";
  if (S.rep < u.rep) return "名声 " + u.rep;
  if (S.money < u.cost) return "钱不够";
  return "可买";
}

game.scene("shop", {
  enter: function () {
    SHOP_SEL = 0;
    SHOP_MSG = "";
    SHOP_MSG_UNTIL = 0;
    game.ambience(null);
  },
  update: function () {
    if (busy) return;
    if (game.repeat("up")) { SHOP_SEL = (SHOP_SEL + DATA.UPGRADE_ORDER.length - 1) % DATA.UPGRADE_ORDER.length; game.sfx("move"); }
    if (game.repeat("down")) { SHOP_SEL = (SHOP_SEL + 1) % DATA.UPGRADE_ORDER.length; game.sfx("move"); }
    if (game.pressed("a")) {
      var id = DATA.UPGRADE_ORDER[SHOP_SEL], u = DATA.UPGRADES[id];
      if (hasUpgrade(id)) { game.sfx("err"); SHOP_MSG = "这个已经有了。"; SHOP_MSG_UNTIL = game.time + 2; return; }
      if (S.rep < u.rep) { game.sfx("err"); SHOP_MSG = "名声还不够，需要 " + u.rep + "。"; SHOP_MSG_UNTIL = game.time + 2.4; return; }
      if (S.money < u.cost) { game.sfx("err"); SHOP_MSG = "钱不够，还差 " + (u.cost - S.money) + " 文。"; SHOP_MSG_UNTIL = game.time + 2.4; return; }
      if (buyUpgrade(id)) {
        game.sfx("ok");
        sayToast("买下了「" + u.name + "」");
      }
    }
    if (game.pressed("b") || game.pressed("start")) { game.sfx("tap"); game.go("morning"); }
  },
  draw: function (g) {
    g.clear(g.PAPER);
    UI.header(g, S, "店铺");
    ART.facade(g, 48, 28, S, game.time);
    g.window(6, 108, 204, 86);
    for (var i = 0; i < DATA.UPGRADE_ORDER.length; i++) {
      var id = DATA.UPGRADE_ORDER[i], u = DATA.UPGRADES[id], y = 112 + i * 16;
      if (i === SHOP_SEL) g.rect(8, y - 2, 200, 16, g.INK);
      var col = i === SHOP_SEL ? g.PAPER : g.INK;
      g.rect(11, y, 14, 12, i === SHOP_SEL ? g.PAPER : g.INK);
      g.text(u.short, 18, y, { align: "center", color: i === SHOP_SEL ? g.INK : g.PAPER });
      g.text(u.name, 30, y, { color: col });
      g.text(u.cost + "文", 100, y, { color: i === SHOP_SEL ? g.PAPER : g.DARK });
      g.text(shopStatus(id), 204, y, { align: "right", color: i === SHOP_SEL ? g.PAPER : (hasUpgrade(id) ? g.DARK : g.INK) });
    }
    g.text(DATA.UPGRADES[DATA.UPGRADE_ORDER[SHOP_SEL]].desc, 10, 198, { width: 196, color: g.DARK });
    if (game.time < SHOP_MSG_UNTIL) g.text(SHOP_MSG, 10, 210, { color: g.DARK });
    UI.footer(g, "↑↓ 选　A 买　B 返回");
    UI.toast(g);
  }
});
