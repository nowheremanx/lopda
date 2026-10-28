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
    if (game.pressed("a") || game.pressed("start")) {
      game.sfx("tap");
      bootSave = null;
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
    g.window(10, 8, 150, 44);
    g.text(K[0], 85, 12, { align: "center" });
    g.text(K[1], 10, 28, { align: "center", width: 150, color: g.DARK });
    g.window(6, 168, 204, 68);
    g.text(K[2], 6, 172, { align: "center", width: 204 });
    g.text(K[3], 6, 188, { align: "center", width: 204, color: g.DARK });
    g.text("客 " + S.stats.served + " · 入 " + S.stats.earned + " 文 · 名 " + S.rep + (S.debt ? " · 欠 " + S.debt : ""), 6, 204, { align: "center", width: 204, color: g.DARK });
    g.text("A 回到标题", 108, 220, { align: "center" });
    UI.toast(g);
  }
});
