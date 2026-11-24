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
    UI.list(g, {
      x: 8, y: 112, w: 200, h: 80, rowH: 16, count: DATA.UPGRADE_ORDER.length, sel: SHOP_SEL, scroll: 0,
      draw: function (gg, i, y, selected) {
        var id = DATA.UPGRADE_ORDER[i], u = DATA.UPGRADES[id];
        var col = selected ? gg.PAPER : gg.INK;
        gg.rect(11, y, 14, 12, selected ? gg.PAPER : gg.INK);
        gg.text(u.short, 18, y, { align: "center", color: selected ? gg.INK : gg.PAPER });
        UI.columns(gg, y, [
          { x: 30, w: 64, text: u.name, color: col },
          { x: 96, w: 34, text: u.cost + "文", color: selected ? gg.PAPER : gg.DARK },
          { x: 134, w: 70, text: shopStatus(id), align: "right", color: selected ? gg.PAPER : (hasUpgrade(id) ? gg.DARK : gg.INK) }
        ]);
      }
    });
    UI.text(g, DATA.UPGRADES[DATA.UPGRADE_ORDER[SHOP_SEL]].desc, 10, 198, { fit: 196, color: g.DARK });
    if (game.time < SHOP_MSG_UNTIL) g.text(SHOP_MSG, 10, 210, { color: g.DARK });
    UI.footer(g, "↑↓ 选　A 买　B 返回");
    UI.toast(g);
  }
});
