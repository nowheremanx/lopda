/* Title and the help screen. */
var TITLE_SEL = 0;

function titleOptions() {
  var opts = [];
  if (bootSave) opts.push({ id: "continue", label: "继续" });
  opts.push({ id: "new", label: bootSave ? "新局" : "开始" });
  opts.push({ id: "help", label: "说明" });
  return opts;
}

game.scene("title", {
  enter: function () {
    TITLE_SEL = 0;
    game.ambience(null);
    if (typeof stopMusic === "function") stopMusic(); else game.musicStop();
  },
  update: function () {
    if (!booted) return;
    var opts = titleOptions();
    if (game.repeat("left")) { TITLE_SEL = (TITLE_SEL + opts.length - 1) % opts.length; game.sfx("move"); }
    if (game.repeat("right")) { TITLE_SEL = (TITLE_SEL + 1) % opts.length; game.sfx("move"); }
    if (game.pressed("a") || game.pressed("start")) {
      var id = opts[TITLE_SEL].id;
      game.sfx("tap");
      if (id === "continue") {
        S = bootSave;
        if (S.phase === "night") game.go("night");
        else if (S.phase === "ending") game.go("ending");
        else game.go("morning");
      } else if (id === "new") {
        S = fresh();
        startDay(1);
        game.go("morning");
      } else {
        game.go("help", { from: "title" });
      }
    }
  },
  draw: function (g) {
    ART.title(g, game.time);
    // title board
    g.text("山脚小馆", 86, 23, { align: "center" });
    g.text("七天，守住这间小店", 86, 40, { align: "center", color: g.DARK });
    g.text("采买 · 备菜 · 开门", 86, 54, { align: "center", color: g.DARK });
    // menu
    var opts = titleOptions();
    g.window(28, 190, 160, 32, { thin: true });
    var xs = opts.length === 3 ? [38, 78, 118] : [62, 118];
    for (var i = 0; i < opts.length; i++) {
      if (i === TITLE_SEL) {
        g.rect(xs[i] - 5, 196, 36, 18, g.INK);
        g.text(opts[i].label, xs[i], 198, { color: g.PAPER });
      } else {
        g.text(opts[i].label, xs[i], 198);
      }
    }
    g.text("←→ 选   A 决定", 108, 226, { align: "center", color: g.DARK });
    if (!booted) g.text("…", 108, 170, { align: "center", color: g.DARK });
  }
});

game.scene("help", {
  enter: function (args) { this.from = (args && args.from) || "title"; },
  update: function () {
    if (game.pressed("a") || game.pressed("b") || game.pressed("start")) {
      game.sfx("tap");
      game.go(this.from);
    }
  },
  draw: function (g) { UI.help(g, S || { day: 1, weather: "sunny", rep: 1, money: 0 }); }
});
