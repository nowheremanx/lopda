/* Prep: choose today's dishes and how many portions to cook. */
var PREP_PLAN = {}, PREP_SEL = 0, PREP_SCROLL = 0;

function prepList() { return unlockedDishes(); }
function prepNeedUsed() {
  var used = {};
  for (var id in PREP_PLAN) if (Object.prototype.hasOwnProperty.call(PREP_PLAN, id)) {
    var need = DATA.DISHES[id].need;
    for (var k in need) if (Object.prototype.hasOwnProperty.call(need, k)) used[k] = (used[k] || 0) + need[k] * PREP_PLAN[id];
  }
  return used;
}
function prepRoom(id) {
  var need = DATA.DISHES[id].need, used = prepNeedUsed(), n = 5;
  for (var k in need) if (Object.prototype.hasOwnProperty.call(need, k)) {
    var mine = (PREP_PLAN[id] || 0) * need[k];
    var avail = (S.ingredients[k] || 0) - ((used[k] || 0) - mine);
    n = Math.min(n, Math.floor(avail / need[k]));
  }
  return Math.max(0, n);
}
function prepTotal() {
  var n = 0;
  for (var id in PREP_PLAN) if (Object.prototype.hasOwnProperty.call(PREP_PLAN, id)) n += PREP_PLAN[id];
  return n;
}
function prepConfirm() {
  var kinds = 0;
  for (var id in PREP_PLAN) if (Object.prototype.hasOwnProperty.call(PREP_PLAN, id) && PREP_PLAN[id] > 0) kinds++;
  if (kinds > 4) { game.sfx("err"); sayToast("菜单最多四道菜"); return; }
  if (prepTotal() <= 0) { game.sfx("err"); return; }
  if (!canCookPlan(PREP_PLAN)) { game.sfx("err"); return; }
  if (!cookPlan(PREP_PLAN)) { game.sfx("err"); return; }
  S.ap--;
  S.flags.prepared = 1;
  save();
  game.sfx("ok");
  sayToast("备好了 " + stockTotal() + " 份");
  game.go("morning");
}

game.scene("prep", {
  enter: function () {
    if (S.flags.prepared) { game.go("morning"); return; }
    PREP_PLAN = {};
    PREP_SEL = 0;
    PREP_SCROLL = 0;
  },
  update: function () {
    if (busy) return;
    var list = prepList();
    if (!list.length) return;
    if (game.repeat("up")) { PREP_SEL = (PREP_SEL + list.length - 1) % list.length; game.sfx("move"); }
    if (game.repeat("down")) { PREP_SEL = (PREP_SEL + 1) % list.length; game.sfx("move"); }
    if (PREP_SEL < PREP_SCROLL) PREP_SCROLL = PREP_SEL;
    if (PREP_SEL > PREP_SCROLL + 5) PREP_SCROLL = PREP_SEL - 5;
    var id = list[PREP_SEL];
    if (game.repeat("left")) {
      PREP_PLAN[id] = Math.max(0, (PREP_PLAN[id] || 0) - 1);
      game.sfx("tick");
    }
    if (game.repeat("right")) {
      var room = prepRoom(id);
      if ((PREP_PLAN[id] || 0) < room) { PREP_PLAN[id] = (PREP_PLAN[id] || 0) + 1; game.sfx("tick"); }
      else game.sfx("err");
    }
    if (game.pressed("a")) prepConfirm();
    if (game.pressed("b")) { game.sfx("tap"); game.go("morning"); }
    if (game.pressed("start")) { game.sfx("tap"); game.go("morning"); }
  },
  draw: function (g) {
    g.clear(g.PAPER);
    UI.header(g, S, "备菜");
    // pantry
    g.window(6, 32, 204, 22, { thin: true });
    for (var i = 0; i < DATA.ING_ORDER.length; i++) {
      var k = DATA.ING_ORDER[i];
      ART.ing(g, k, 11 + i * 27, 35);
      g.text(String(ing(k)), 25 + i * 27, 37, { color: ing(k) > 0 ? g.INK : g.DARK });
    }
    // dish list
    var list = prepList();
    g.window(6, 58, 204, 108);
    g.text("今日菜单", 12, 60, { color: g.DARK });
    var kinds = 0;
    for (var kk in PREP_PLAN) if (Object.prototype.hasOwnProperty.call(PREP_PLAN, kk) && PREP_PLAN[kk] > 0) kinds++;
    g.text("菜" + kinds + "/4", 126, 60, { color: g.DARK });
    g.text("共" + prepTotal() + "份", 204, 60, { align: "right", color: g.DARK });
    for (var row = 0; row < 6 && PREP_SCROLL + row < list.length; row++) {
      var idx = PREP_SCROLL + row, id = list[idx], y = 76 + row * 15;
      var selected = idx === PREP_SEL;
      if (selected) g.rect(8, y - 1, 200, 15, g.INK);
      var col = selected ? g.PAPER : g.INK;
      ART.dish(g, id, 12, y, game.time);
      g.text(DATA.DISHES[id].name, 36, y, { color: col });
      g.text(DATA.DISHES[id].price + "文", 100, y, { color: selected ? g.PAPER : g.DARK });
      g.text("定 " + (PREP_PLAN[id] || 0), 136, y, { color: col });
      g.text("可 " + prepRoom(id), 174, y, { color: selected ? g.PAPER : g.DARK });
    }
    if (PREP_SCROLL > 0) g.text("▲", 198, 66, { color: g.DARK });
    if (PREP_SCROLL + 6 < list.length) g.text("▼", 198, 154, { color: g.DARK });
    // detail
    var id2 = list[PREP_SEL];
    if (id2) {
      g.window(6, 170, 204, 46);
      g.text(DATA.DISHES[id2].name, 10, 172);
      g.text(DATA.DISHES[id2].desc, 10, 186, { width: 196 });
      var need = DATA.DISHES[id2].need, parts = [];
      for (var nk in need) if (Object.prototype.hasOwnProperty.call(need, nk)) parts.push(DATA.ING[nk].name + "×" + need[nk]);
      g.text("需 " + parts.join("　") + "　已定 " + (PREP_PLAN[id2] || 0) + "　可 " + prepRoom(id2), 10, 200, { color: g.DARK });
    }
    UI.footer(g, "↑↓ 选　←→ 份数　A 备好　B 返回");
    UI.toast(g);
  }
});
