/* One of four mornings after the seventh night. */
game.scene("ending", {
  enter: function () {
    var paid = S.debt <= 0;
    var vip = S.flags.vip || 0;
    var choice = S.flags.finalChoice;
    if (!paid) this.kind = "bad";
    else if (choice === "ahe" && vip >= 3 && S.rep >= 10 && (S.npc.ahe || 0) >= 4) this.kind = "best";
    else if (choice === "shrine" && vip >= 2) this.kind = "good";
    else if (choice === "ahe" && vip >= 2) this.kind = "good";
    else if (vip >= 2) this.kind = "good";
    else this.kind = "normal";
    S.phase = "ending";
    save();
    game.ambience("stream", 0.25);
    if (typeof playMusic === "function") playMusic("ending");
  },
  update: function () {
    if (game.pressed("a") || game.pressed("start") || game.pointer.pressed) {
      game.sfx("tap");
      /* the finished week stays saved: the title offers 结局 and asks before 新局 */
      bootSave = S;
      S = null;
      game.go("title");
    }
  },
  draw: function (g) {
    if (!S) { g.clear(g.PAPER); return; }
    ART.ending(g, game.time, this.kind);
    var K = {
      best: ["山脚小馆", "山神宴散了，小馆的灯还亮着。", "阿禾留了下来。招牌换了新的。", "山脚的汤，有了名字。"],
      good: ["山脚小馆", "山神宴过了，小馆还在。", "钱不多，客人不少。", "明天还得早起。"],
      normal: ["山脚小馆", "七天，撑过来了。", "账上没剩几个钱，灶还是热的。", "明天还得早起。"],
      bad: ["山脚小馆", "灯灭了。", "山脚的小馆，没能等到第八天。", "但灶台还在，火种也还在。"]
    }[this.kind];
    if (this.kind === "good" && S.flags.finalChoice === "shrine") {
      K = ["山脚小馆", "山神宴散了，山神庙的灯也亮了。", "小馆还在，只是灶边少了一个人。", "明天还得早起。"];
    } else if (this.kind === "good" && S.flags.finalChoice === "ahe") {
      K = ["山脚小馆", "山神宴过了，小馆还在。", "阿禾坐在灶边，等你盛下一碗。", "明天还得早起。"];
    }
    // the window is as wide as the screen's lower one, so the longest K[1]
    // (180 px) stays on one line inside it (#426)
    g.window(6, 8, 204, 44);
    g.text(K[0], 108, 12, { align: "center" });
    UI.text(g, K[1], 6, 30, { align: "center", width: 204, color: g.DARK, fit: 196 });
    // one line per row: the ledger and the unpaid rent get rows of their own,
    // so nothing wraps onto 「A 回到标题」
    g.window(6, 160, 204, 76);
    UI.text(g, K[2], 6, 164, { align: "center", width: 204, fit: 196 });
    UI.text(g, K[3], 6, 178, { align: "center", width: 204, color: g.DARK, fit: 196 });
    UI.text(g, "客 " + S.stats.served + " · 入 " + S.stats.earned + " 文 · 名 " + S.rep, 6, 192, { align: "center", width: 204, color: g.DARK, fit: 196 });
    if (S.debt) UI.text(g, "还欠 " + S.debt + " 文租", 6, 206, { align: "center", width: 204, color: g.DARK, fit: 196 });
    g.text("A 回到标题", 108, 220, { align: "center" });
    UI.toast(g);
  }
});
