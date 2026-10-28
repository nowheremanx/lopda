/* Night: the ledger, the rent, and the people who stayed. */
var NIGHT_STORY = null, NIGHT_STORY_DONE = false;

function nightRent() {
  var rent = rentFor(S.day);
  if (!rent) return null;
  var old = S.debt;
  var due = rent + old;
  var paid = Math.min(S.money, due);
  S.money -= paid;
  S.rentPaid += paid;
  var missed = due - paid;
  S.debt = missed;
  var out = { rent: due, paid: paid, missed: missed, old: old };
  if (missed > 0) { addRep(-1); out.rep = -1; }
  else { addRep(1); out.rep = 1; }
  S.flags["rent" + S.day] = 1;
  save();
  return out;
}

function nightRefund() {
  var refunded = 0;
  if (hasUpgrade("cellar")) {
    for (var id in S.stock) if (Object.prototype.hasOwnProperty.call(S.stock, id) && S.stock[id] > 0) {
      var mi = mainIng(id);
      if (mi) { addIng(mi, 1); refunded++; }
    }
  }
  return refunded;
}

game.scene("night", {
  enter: function () {
    if (!S.lastLedger) S.lastLedger = { served: 0, lost: 0, earned: 0, tips: 0, repDelta: 0, leftover: 0, early: false };
    if (!S.lastLedger.rentDone) {
      S.lastLedger.refund = nightRefund();
      S.lastLedger.rentInfo = nightRent();
      S.lastLedger.rentDone = 1;
      save();
    }
    S.phase = "night";
    save();
    NIGHT_STORY = null;
    NIGHT_STORY_DONE = false;
    if (S.day === 5 && S.flags.criticGood) {
      NIGHT_STORY = { who: null, bg: "dawn", pages: ["第二天，镇上都在传陆先生的话。", "「山脚那家小馆，汤里有山气。」"] };
    } else if (S.day === 6 && S.flags.boss && !seen("ahe_stay")) {
      NIGHT_STORY = { who: "ahe", bg: "shop", pages: ["我明天来帮你。", "不要工钱，管饭就行。"], choices: ["留下", "再想想"], cancel: false, stay: true };
    } else if (S.day === 6 && !S.flags.boss) {
      NIGHT_STORY = { who: null, bg: "dawn", pages: ["雾里的山道还开着。", "山神宴前，还有一天。"] };
    } else if (S.day === 4 && S.lastLedger.rentInfo && S.lastLedger.rentInfo.missed > 0) {
      NIGHT_STORY = { who: "po", bg: "shop", pages: ["钱不够？", "初七一起算。利息，就算你多给我留一碗汤。"] };
    }
    game.ambience("fire", 0.18);
    if (typeof playMusic === "function") playMusic("night");
  },
  update: function () {
    if (busy) return;
    if (game.pressed("a") || game.pressed("start")) {
      game.sfx("tap");
      if (S.day === 7) { game.go("ending"); return; }
      if (NIGHT_STORY && !NIGHT_STORY_DONE) {
        NIGHT_STORY_DONE = true;
        busy = true;
        var args = { who: NIGHT_STORY.who, bg: NIGHT_STORY.bg, pages: NIGHT_STORY.pages, choices: NIGHT_STORY.choices, cancel: false };
        game.push("event", args).then(function (i) {
          if (NIGHT_STORY && NIGHT_STORY.stay) {
            if (i === 0) { S.npc.ahe = Math.max(4, S.npc.ahe); S.staff = null; save(); sayToast("阿禾会来帮忙了"); }
            else { S.npc.ahe = Math.max(3, S.npc.ahe); save(); }
            mark("ahe_stay");
          }
          busy = false;
        });
        return;
      }
      endDay();
      startDay(S.day + 1);
      S.phase = "morning";
      save();
      game.go("morning");
    }
  },
  draw: function (g) {
    ART.room(g, S, "night", game.time, -1);
    UI.header(g, S, "打烊");
    var L = S.lastLedger || {};
    // left: the money
    g.window(6, 32, 110, 180);
    g.text("今日", 12, 36, { color: g.DARK });
    var lines = [
      ["客人", (L.served || 0) + " 位"],
      ["走了", (L.lost || 0) + " 位"],
      ["菜钱", (L.earned || 0) + " 文"],
      ["小费", (L.tips || 0) + " 文"],
      ["名声", (L.repDelta >= 0 ? "+" : "") + (L.repDelta || 0)],
      ["剩菜", (L.leftover || 0) + " 份"]
    ];
    var y = 52;
    for (var i = 0; i < lines.length; i++) {
      UI.columns(g, y, [
        { x: 12, w: 56, text: lines[i][0], color: g.DARK },
        { x: 68, w: 40, text: lines[i][1], align: "right" }
      ]);
      y += 15;
    }
    g.rect(12, y - 2, 96, 1, g.MID);
    y += 6;
    if (L.refund) { UI.text(g, "腌菜坛退回 " + L.refund + " 份", 12, y, { color: g.DARK, fit: 96 }); y += 15; }
    var r = L.rentInfo;
    if (r) {
      UI.columns(g, y, [
        { x: 12, w: 60, text: r.old > 0 ? "房租+旧账" : "房租", color: g.DARK },
        { x: 76, w: 32, text: r.paid + "/" + r.rent, align: "right" }
      ]);
      y += 15;
      if (r.missed > 0) { UI.text(g, "还欠 " + S.debt + " 文", 12, y, { color: g.INK, fit: 96 }); y += 15; }
    }
    if (S.debt > 0) UI.text(g, "共欠 " + S.debt + " 文", 12, y, { color: g.INK, fit: 96 });
    else UI.text(g, "账清了", 12, y, { color: g.DARK, fit: 96 });
    // right: the people
    g.window(120, 32, 90, 180);
    UI.text(g, "常客", 126, 36, { color: g.DARK, fit: 78 });
    var names = DATA.NPC_ORDER;
    for (var n = 0; n < names.length; n++) {
      var id = names[n], ny = 54 + n * 20;
      UI.text(g, DATA.NPCS[id].name, 126, ny, { fit: 30 });
      UI.hearts(g, 158, ny + 1, S.npc[id] || 0, 5);
    }
    var next = S.day < 7 ? dayWeather(S.day + 1) : "sunny";
    g.text("明日", 126, 140, { color: g.DARK });
    ART.weatherIcon(g, next, 156, 138, game.time);
    g.text(DATA.WEATHER[next].name, 174, 140, { color: g.DARK });
    UI.text(g, "总客 " + S.stats.served, 126, 160, { color: g.DARK, fit: 78 });
    UI.text(g, "总入 " + S.stats.earned, 126, 174, { color: g.DARK, fit: 78 });
    UI.text(g, "第七天 山神宴", 126, 192, { color: g.DARK, fit: 78 });
    UI.footer(g, S.day === 7 ? "A 结局" : (NIGHT_STORY && !NIGHT_STORY_DONE ? "A 听她说" : "A 睡吧"));
    UI.toast(g);
  }
});
