/* The codex: what is on the mountain, what it is called, and what it makes.
 * Opened from 早市 → 图鉴 or START in the forest; it is a pushed overlay, so
 * the screen underneath (and the cursor) is still there when it closes. */
var CODEX_TAB = 0, CODEX_SEL = 0, CODEX_SCROLL = 0, CODEX_FROM = null;

var CODEX_TABS = [
  { id: "ing", label: "食材" },
  { id: "dish", label: "菜谱" },
  { id: "foe", label: "山兽" }
];

var CODEX_WHERE = {
  mushroom: "后山松林、深处；雨天更多",
  fish: "后山溪边",
  rice: "后山田边",
  bamboo: "后山竹林",
  greens: "后山林间空地",
  meat: "山猪掉落；阿岩会送",
  rare: "后山深处；山魈守着"
};
var CODEX_SHORT = {
  mushroom: "后山", fish: "溪边", rice: "田边", bamboo: "竹林",
  greens: "林间", meat: "山猪", rare: "深处"
};
var CODEX_FOES = ["boar", "monkey", "bamboo", "boss"];
var CODEX_FOE_GLYPH = { boar: "猪", monkey: "猴", bamboo: "竹", boss: "魈" };
var CODEX_DISH_GLYPH = {
  mushroom_soup: "汤", greens_cake: "饼", bamboo_rice: "饭", grilled_fish: "鱼",
  pork: "肉", bamboo_pork: "肉", mushroom_pot: "煲", god_soup: "羹"
};

function codexIds() {
  if (CODEX_TAB === 0) return DATA.ING_ORDER.slice();
  if (CODEX_TAB === 1) return DATA.DISH_ORDER.slice();
  return CODEX_FOES.slice();
}
function codexUsedBy(id) {
  var out = [];
  for (var i = 0; i < DATA.DISH_ORDER.length; i++) {
    var d = DATA.DISHES[DATA.DISH_ORDER[i]];
    if (d.need && d.need[id]) out.push(d.name);
  }
  return out;
}
function codexDrops(def) {
  if (!def.drops) return "无";
  return def.drops.map(function (d) {
    var n = d[1] === d[2] ? "×" + d[1] : "×" + d[1] + "–" + d[2];
    return DATA.ING[d[0]].name + n;
  }).join("　");
}
function codexUnlock(id) {
  var k = DATA.DISHES[id].unlock;
  return { base: "开局", stove: "新灶台", yan: "阿岩", critic: "陆先生", boss: "山魈" }[k] || k;
}

game.scene("codex", {
  enter: function (args) {
    CODEX_FROM = args && args.from ? args.from : null;
    CODEX_TAB = 0;
    CODEX_SEL = 0;
    CODEX_SCROLL = 0;
  },
  update: function () {
    var list = codexIds();
    var dl = game.repeat("left"), dr = game.repeat("right");
    if (dl || dr) {
      CODEX_TAB = (CODEX_TAB + (dr ? 1 : CODEX_TABS.length - 1)) % CODEX_TABS.length;
      CODEX_SEL = 0;
      CODEX_SCROLL = 0;
      game.sfx("move");
    }
    if (game.repeat("up")) {
      CODEX_SEL = (CODEX_SEL + list.length - 1) % list.length;
      game.sfx("move");
    }
    if (game.repeat("down")) {
      CODEX_SEL = (CODEX_SEL + 1) % list.length;
      game.sfx("move");
    }
    if (game.pressed("b") || game.pressed("start")) {
      game.sfx("tap");
      if (CODEX_FROM) game.pop();
      else game.go("morning");
    }
  },
  draw: function (g) {
    g.clear(g.PAPER);
    UI.header(g, S || { day: 1, weather: "sunny", rep: 1, money: 0 }, "图鉴");

    // tabs
    g.window(6, 32, 204, 20, { thin: true });
    for (var t = 0; t < CODEX_TABS.length; t++) {
      var tx = 10 + t * 67;
      if (t === CODEX_TAB) {
        g.rect(tx, 34, 64, 16, g.INK);
        g.text(CODEX_TABS[t].label, tx + 32, 36, { align: "center", color: g.PAPER });
      } else {
        g.text(CODEX_TABS[t].label, tx + 32, 36, { align: "center" });
      }
    }

    var list = codexIds();
    g.window(6, 56, 204, 94);
    CODEX_SCROLL = UI.list(g, {
      x: 8, y: 58, w: 200, h: 90, rowH: 15, count: list.length, sel: CODEX_SEL, scroll: CODEX_SCROLL,
      onScroll: function (v) { CODEX_SCROLL = v; },
      draw: function (gg, idx, y, selected) {
        var id = list[idx], col = selected ? gg.PAPER : gg.INK;
        var glyph = CODEX_TAB === 0 ? DATA.ING[id].one
          : CODEX_TAB === 1 ? CODEX_DISH_GLYPH[id]
          : CODEX_FOE_GLYPH[id];
        // a character tile reads at 1x; the 12 px ingredient sprites do not
        gg.rect(10, y, 14, 12, selected ? gg.PAPER : gg.INK);
        gg.text(glyph, 17, y, { align: "center", color: selected ? gg.INK : gg.PAPER });
        if (CODEX_TAB === 0) {
          UI.columns(gg, y, [
            { x: 32, w: 90, text: DATA.ING[id].name, color: col },
            { x: 130, w: 74, text: CODEX_SHORT[id], align: "right", color: selected ? gg.PAPER : gg.DARK }
          ]);
        } else if (CODEX_TAB === 1) {
          UI.columns(gg, y, [
            { x: 32, w: 100, text: DATA.DISHES[id].name, color: col },
            { x: 140, w: 64, text: DATA.DISHES[id].price + "文", align: "right", color: selected ? gg.PAPER : gg.DARK }
          ]);
        } else {
          var foe = DATA.ENEMIES[id];
          UI.columns(gg, y, [
            { x: 32, w: 96, text: foe.name, color: col },
            { x: 140, w: 64, text: "HP " + foe.hp, align: "right", color: selected ? gg.PAPER : gg.DARK }
          ]);
        }
      }
    });

    // detail
    g.window(6, 154, 204, 62);
    var sel = list[CODEX_SEL];
    if (sel) {
      if (CODEX_TAB === 0) {
        UI.text(g, DATA.ING[sel].name, 12, 156);
        UI.text(g, DATA.ING[sel].desc, 12, 170, { fit: 196 });
        UI.text(g, "哪里找：" + CODEX_WHERE[sel], 12, 184, { color: g.DARK, fit: 196 });
        var used = codexUsedBy(sel);
        var usedText = used.length ? used.slice(0, 3).join("、") + (used.length > 3 ? "等" : "") : "还没有菜用它";
        UI.text(g, "用于：" + usedText, 12, 198, { color: g.DARK, fit: 196 });
      } else if (CODEX_TAB === 1) {
        var dish = DATA.DISHES[sel];
        UI.text(g, dish.name, 12, 156);
        UI.right(g, dish.price + "文", 204, 156);
        var need = [];
        for (var k in dish.need) if (Object.prototype.hasOwnProperty.call(dish.need, k)) need.push(DATA.ING[k].name + "×" + dish.need[k]);
        UI.text(g, "材料：" + need.join("　"), 12, 170, { color: g.DARK, fit: 196 });
        UI.text(g, "解锁：" + codexUnlock(sel), 12, 184, { color: g.DARK, fit: 196 });
        UI.text(g, dish.desc, 12, 198, { fit: 196 });
      } else {
        var f = DATA.ENEMIES[sel];
        UI.text(g, f.name, 12, 156);
        UI.right(g, "HP " + f.hp + "　攻 " + f.atk, 204, 156);
        UI.text(g, "掉落：" + codexDrops(f), 12, 170, { color: g.DARK, fit: 196 });
        UI.text(g, f.intro, 12, 184, { fit: 196 });
        if (f.boss) UI.text(g, "第七天山神宴前的最后一关。", 12, 198, { color: g.DARK, fit: 196 });
      }
    }
    UI.footer(g, "←→ 分类　↑↓ 选　B 返回");
    UI.toast(g);
  }
});
