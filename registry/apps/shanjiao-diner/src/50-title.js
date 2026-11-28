/* Title and the help screen. */
var TITLE_SEL = 0;

function titleOptions() {
  var opts = [];
  /* a save that cannot be read (or is newer) is kept as it is: no new game over it */
  if (!bootFailed) {
    /* a finished week keeps its record; 结局 shows it again */
    if (bootSave) opts.push({ id: "continue", label: bootSave.phase === "ending" ? "结局" : "继续" });
    opts.push({ id: "new", label: bootSave ? "新局" : "开始" });
  }
  opts.push({ id: "help", label: "说明" });
  return opts;
}

function newGame() {
  S = fresh();
  startDay(1);
  game.go("morning");
}

/* The label x of each title item: the draw and the tap test share these, so a
 * tap on 说明 really opens 说明.  The labels are ~26 px wide, so the centre is
 * x + 13. */
function titleXs(n) {
  return n === 3 ? [38, 78, 118] : n === 2 ? [62, 118] : [96];
}
function titleTap(n) {
  if (!tapInside(28, 190, 160, 32)) return -1;
  var xs = titleXs(n), best = 0, dist = 1e9;
  for (var i = 0; i < n; i++) {
    var d = Math.abs(tapX() - (xs[i] + 13));
    if (d < dist) { dist = d; best = i; }
  }
  return best;
}

/* A, START and a tap all come here: the tapped item is in TITLE_SEL first. */
function titleChoose() {
  var opts = titleOptions();
  var id = opts[TITLE_SEL].id;
  game.sfx("tap");
  if (id === "continue") {
    S = bootSave;
    if (S.phase === "night") game.go("night");
    else if (S.phase === "ending") game.go("ending");
    else if (S.phase === "service") game.go("service");
    else game.go("morning");
  } else if (id === "new" && bootSave) {
    /* the only save slot: ask before a new week replaces it */
    busy = true;
    game.choose(["开新局"], { title: "旧存档会被覆盖。开新局？", cancel: true }).then(function (c) {
      busy = false;
      if (c === 0) newGame();
    });
  } else if (id === "new") {
    newGame();
  } else {
    game.go("help", { from: "title" });
  }
}

game.scene("title", {
  enter: function () {
    TITLE_SEL = 0;
    busy = false;
    game.ambience(null);
    if (typeof stopMusic === "function") stopMusic(); else game.musicStop();
  },
  update: function () {
    if (!booted || busy) return;
    var opts = titleOptions();
    if (TITLE_SEL >= opts.length) TITLE_SEL = 0;
    if (game.repeat("left")) { TITLE_SEL = (TITLE_SEL + opts.length - 1) % opts.length; game.sfx("move"); }
    if (game.repeat("right")) { TITLE_SEL = (TITLE_SEL + 1) % opts.length; game.sfx("move"); }
    if (game.pressed("a") || game.pressed("start")) { titleChoose(); return; }
    /* the whole menu window is the target: 32 game px is 49 css px on the
       smallest phone; the nearest label centre wins */
    var hit = titleTap(opts.length);
    if (hit >= 0) { TITLE_SEL = hit; titleChoose(); }
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
    var xs = titleXs(opts.length);
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
    else if (bootNewer) {
      g.text("存档来自更新的版本", 108, 162, { align: "center", color: g.DARK });
      g.text("请先更新这个程序", 108, 176, { align: "center", color: g.DARK });
    } else if (bootFailed) {
      g.text("存档读不出来，旧档还在", 108, 162, { align: "center", color: g.DARK });
      g.text("在 设置 → 程序存档 清掉再开局", 108, 176, { align: "center", color: g.DARK });
    }
  }
});

game.scene("help", {
  enter: function (args) { this.from = (args && args.from) || "title"; },
  update: function () {
    if (game.pressed("a") || game.pressed("b") || game.pressed("start") || tapWorld()) {
      game.sfx("tap");
      game.go(this.from);
    }
  },
  draw: function (g) { UI.help(g, S || { day: 1, weather: "sunny", rep: 1, money: 0 }); }
});
