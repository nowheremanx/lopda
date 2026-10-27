/* Morning: two actions before opening. */
var MORNING_SEL = 0;

function morningActions() {
  return [
    { label: "出门", id: "forest", disabled: S.ap <= 0 },
    { label: "菜单", id: "prep", disabled: S.ap <= 0 || !!S.flags.prepared },
    { label: "店铺", id: "shop", disabled: false },
    { label: "帮手", id: "helper", disabled: !hasHelper() || !!S.staff },
    { label: "开门", id: "open", disabled: false }
  ];
}

function helperEffect(id) {
  return id === "ahe" ? "帮上菜" : id === "zhou" ? "送两条鱼" : id === "yan" ? "送一块肉" : "";
}

function chooseHelper() {
  var ids = availableHelpers();
  if (!ids.length) { game.sfx("err"); return; }
  busy = true;
  var labels = ids.map(function (id) { return DATA.NPCS[id].name + "（" + helperEffect(id) + "）"; });
  game.choose(labels, { title: "今天请谁帮忙？", cancel: true }).then(function (i) {
    if (i >= 0) {
      S.staff = ids[i];
      if (S.staff === "zhou") addIng("fish", 2);
      if (S.staff === "yan") addIng("meat", 1);
      save();
      game.sfx("ok");
      sayToast(DATA.NPCS[S.staff].name + "来帮忙了");
    }
    busy = false;
  });
}

function morningAct(i) {
  if (busy) return;
  var acts = morningActions();
  if (!acts[i] || acts[i].disabled) { game.sfx("err"); return; }
  if (acts[i].id === "prep") { game.sfx("tap"); game.go("prep"); return; }
  if (acts[i].id === "forest") {
    if (S.ap === 1 && !S.flags.prepared) {
      busy = true;
      game.choose(["先备菜", "还是出门"], { title: "还没备菜，要空着灶开门吗？", cancel: true }).then(function (c) {
        busy = false;
        if (c === 0) game.go("prep");
        else if (c === 1) { S.ap--; save(); game.sfx("move"); game.go("forest"); }
      });
      return;
    }
    S.ap--;
    save();
    game.sfx("move");
    game.go("forest");
    return;
  }
  if (acts[i].id === "shop") { game.sfx("tap"); game.go("shop"); return; }
  if (acts[i].id === "helper") { chooseHelper(); return; }
  if (acts[i].id === "open") {
    if (stockTotal() <= 0) {
      busy = true;
      game.say("灶上还是空的。先去备菜吧。").then(function () { busy = false; });
      return;
    }
    S.flags.opened = 1;
    save();
    game.sfx("ok");
    game.go("service");
  }
}

game.scene("morning", {
  enter: function () {
    MORNING_SEL = 0;
    game.ambience(S.weather === "rain" ? "rain" : null, 0.35);
    if (typeof playMusic === "function") playMusic("shop");
    if (typeof MorningStory === "function") {
      busy = true;
      MorningStory().then(function () { busy = false; });
    }
  },
  update: function () {
    if (busy) return;
    var acts = morningActions();
    if (game.repeat("left")) { MORNING_SEL = (MORNING_SEL + acts.length - 1) % acts.length; game.sfx("move"); }
    if (game.repeat("right")) { MORNING_SEL = (MORNING_SEL + 1) % acts.length; game.sfx("move"); }
    // up/down still move the same row on a one-row bar
    if (game.pressed("a")) morningAct(MORNING_SEL);
    if (game.pressed("b")) game.go("help", { from: "morning" });
    if (game.pressed("start")) {
      game.sfx("tap");
      game.say("小馆的一天。菜要备，人要待，租要交。").then(function () {});
    }
  },
  draw: function (g) {
    ART.room(g, S, "morning", game.time, -1);
    // Xiao Man behind the counter
    g.sprite(ART.heroDown, 30, 82 + (Math.sin(game.time * 2) > 0 ? 0 : 1));
    UI.header(g, S);
    // summary
    g.window(6, 146, 204, 44);
    var names = S.menu.map(function (id) { return DATA.DISHES[id].name; });
    var menuText = names.length ? names.slice(0, 2).join("、") + (names.length > 2 ? "等" + names.length + "道" : "") : "还没定";
    g.text("菜单：" + menuText, 10, 149);
    g.text("库存 " + stockTotal() + " 份　　行动 " + S.ap + "/2" + (S.staff ? "　　帮手 " + helperName() : ""), 10, 163, { color: g.DARK });
    var regCount = DATA.NPC_ORDER.filter(function (id) { return (S.npc[id] || 0) >= 3; }).length;
    g.text("预计客 " + serveCount() + " 位　常客 " + regCount + " 人", 10, 177, { color: g.DARK });
    UI.actionBar(g, morningActions(), MORNING_SEL, 194);
    UI.footer(g, "←→ 选　A 好　B 说明");
    UI.toast(g);
  }
});
