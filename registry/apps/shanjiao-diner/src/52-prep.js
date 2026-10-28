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
    if (PREP_SEL > PREP_SCROLL + 4) PREP_SCROLL = PREP_SEL - 4;
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
    // pantry: seven tiny icons were unreadable at 1x, so the counts are text
    g.window(6, 32, 204, 30, { thin: true });
    for (var i = 0; i < DATA.ING_ORDER.length; i++) {
      var k = DATA.ING_ORDER[i];
      var row = i < 4 ? 0 : 1;
      var px0 = 12 + (i < 4 ? i : i - 4) * 48, py0 = 35 + row * 14;
      var nm = DATA.ING[k].name;
      UI.text(g, nm, px0, py0, { color: g.DARK });
      UI.text(g, String(ing(k)), px0 + g.measure(nm) + 5, py0, { color: ing(k) > 0 ? g.INK : g.DARK });
    }
    // dish list: the kit owns the window, cursor, scroll and arrows
    var list = prepList();
    g.window(6, 66, 204, 100);
    UI.text(g, "今日菜单", 12, 68, { color: g.DARK });
    var kinds = 0;
    for (var kk in PREP_PLAN) if (Object.prototype.hasOwnProperty.call(PREP_PLAN, kk) && PREP_PLAN[kk] > 0) kinds++;
    UI.text(g, "菜" + kinds + "/4", 126, 68, { color: g.DARK });
    UI.right(g, "共" + prepTotal() + "份", 204, 68, { color: g.DARK });
    PREP_SCROLL = UI.list(g, {
      x: 8, y: 82, w: 200, h: 75, rowH: 15, count: list.length, sel: PREP_SEL, scroll: PREP_SCROLL,
      onScroll: function (v) { PREP_SCROLL = v; },
      draw: function (gg, idx, y, selected) {
        var id = list[idx], col = selected ? gg.PAPER : gg.INK;
        ART.dish(gg, id, 12, y, game.time);
        UI.columns(gg, y, [
          { x: 36, w: 60, text: DATA.DISHES[id].name, color: col },
          { x: 100, w: 32, text: DATA.DISHES[id].price + "文", color: selected ? gg.PAPER : gg.DARK },
          { x: 136, w: 30, text: "定 " + (PREP_PLAN[id] || 0), color: col },
          { x: 174, w: 28, text: "可 " + prepRoom(id), color: selected ? gg.PAPER : gg.DARK }
        ]);
      }
    });
    // detail
    var id2 = list[PREP_SEL];
    if (id2) {
      g.window(6, 170, 204, 46);
      g.text(DATA.DISHES[id2].name, 10, 172);
      UI.text(g, DATA.DISHES[id2].desc, 10, 186, { fit: 196 });
      var need = DATA.DISHES[id2].need, parts = [];
      for (var nk in need) if (Object.prototype.hasOwnProperty.call(need, nk)) parts.push(DATA.ING[nk].name + "×" + need[nk]);
      UI.text(g, parts.join(" ") + "　定" + (PREP_PLAN[id2] || 0) + "　可" + prepRoom(id2), 10, 202, { color: g.DARK, fit: 196 });
    }
    UI.footer(g, "↑↓ 选　←→ 份数　A 备好　B 返回");
    UI.toast(g);
  }
});
