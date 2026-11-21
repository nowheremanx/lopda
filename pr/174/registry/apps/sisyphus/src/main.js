/* Sisyphus: the game. Lo-PDA / lopda/1, lo-game.js 1.4.0.
   Sound is synthesized (PAD.sfx / PAD.music / PAD.ambience) so it follows the handheld's
   volume and silent switch. A recorded sample can replace the heave later, when PAD.sample
   exists: see drafts/sisyphus/RESEARCH.md and drafts/sisyphus/ART-PROMPT.md. */
var game = LoGame.create({ width: 160, height: 178, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";

/* START is the handheld's menu key. The runtime sends it as a press; handling it here
   keeps it working from every scene that has a menu, and never from the title or a quote. */
if (PAD && PAD.on) {
  PAD.on("press", function (b) {
    if (b !== "start" || !S.loaded || S.menuOpen) return;
    if (S.mode === "climb" || S.mode === "descent") openMenu();
  });
}

var S = {
  loaded: false,
  mode: "title",
  p: 0,
  idle: 0,
  summits: 0,
  seen: [],
  deck: [],
  lastQuote: null,
  weather: "clear",
  cam: WORLD.makeCamera(),
  playerX: 0, playerY: WORLD.BASE_Y,
  boulderX: 18, boulderY: WORLD.BASE_Y - 10, boulderR: 11, boulderAngle: 0,
  pose: "stand", walkPhase: 0, dust: [], time: 0,
  quote: null, quoteN: 1, quoteStatus: null, quoteReveal: 0, quoteT: 0,
  quoteOpened: false, quoteSaving: false, doneT: 0,
  summitT: 0, gong: false,
  fallT: 0, fallX: WORLD.SUMMIT_X,
  rollT: 0, rollFrom: 0,
  lock: 0, phase: 1,
  heaveT: 0, breathT: 0, stepT: 0, slipT: 0, wasPush: false,
  descentT: 0, epi: 0, endT: 0, descendPhase: "far", farX: WORLD.SUMMIT_X, wipe: 0, baseT: 0,
  menuIndex: 0, menuOpen: false,
  galleryList: [], galleryIndex: 0, galleryStatus: null, gallerySaving: false, galleryDone: 0,
  loadingNote: null
};

/* ---------------- storage ---------------- */
function saveState() {
  game.save("sisyphus", {
    summits: S.summits,
    seen: S.seen,
    deck: S.deck,
    lastQuote: S.lastQuote
  });
}

game.load("sisyphus").then(function (v) {
  if (v && typeof v === "object") {
    S.summits = Math.max(0, v.summits | 0);
    S.seen = Array.isArray(v.seen) ? v.seen.filter(function (id) { return !!QS.byId[id]; }) : [];
    S.deck = Array.isArray(v.deck) ? v.deck.filter(function (id) { return !!QS.byId[id]; }) : [];
    S.lastQuote = QS.byId[v.lastQuote] ? v.lastQuote : null;
  }
  S.loaded = true;
}).catch(function () { S.loaded = true; });

/* ---------------- positions and camera ---------------- */
function updatePositions() {
  S.playerX = WORLD.pathX(S.p);
  S.playerY = WORLD.pathY(S.playerX);
  var bp = Math.min(1, S.p + 0.022);
  S.boulderX = WORLD.pathX(bp);
  S.boulderY = WORLD.pathY(S.boulderX) - S.boulderR + 1;
}

function updateDescentPositions() {
  S.playerX = WORLD.pathX(S.p);
  S.playerY = WORLD.pathY(S.playerX);
  S.boulderX = WORLD.pathX(0.02);
  S.boulderY = WORLD.pathY(S.boulderX) - S.boulderR + 1;
}

function resetRun(newLoop) {
  S.p = 0; S.idle = 0; S.rollT = 0; S.rollFrom = 0;
  S.quote = null; S.quoteStatus = null; S.quoteReveal = 0; S.quoteT = 0;
  S.quoteOpened = false; S.quoteSaving = false; S.doneT = 0;
  S.summitT = 0; S.gong = false; S.fallT = 0;
  S.descentT = 0; S.epi = 0; S.endT = 0; S.descendPhase = "far"; S.farX = WORLD.SUMMIT_X; S.wipe = 0; S.baseT = 0;
  S.heaveT = 0; S.breathT = 0; S.stepT = 0; S.slipT = 0;
  S.wasPush = false; S.lock = 0.28; S.phase = 1;
  S.dust = [];
  S.walkPhase = 0;
  S.boulderAngle = 0;
  if (newLoop || !S.weather) S.weather = WORLD.pickWeather();
  updatePositions();
  S.pose = "stand";
  S.cam = WORLD.makeCamera();
  WORLD.follow(S.cam, S.playerX, S.playerY, 1, true);
}

/* ---------------- ambience ---------------- */
function setAmbience(level) {
  var name = S.weather === "rain" ? "rain" : "wind";
  game.ambience(name, level == null ? 0.28 : level);
}

/* ---------------- notes ---------------- */
function appendNote(q, n, done) {
  if (!PAD.notes || !PAD.notes.append) { done("denied"); return; }
  try {
    var p = PAD.notes.append("幸福手册", QS.noteText(q, n));
    if (p && p.then) {
      p.then(function (r) { done(r === "saved" ? "saved" : "denied"); })
        .catch(function () { done("denied"); });
    } else done("denied");
  } catch (e) { done("denied"); }
}

/* ---------------- title ---------------- */
game.scene("title", {
  enter: function () {
    S.mode = "title";
    resetRun(false);
    S.pose = "look";
    setAmbience(0.18);
  },
  update: function () {
    S.time = game.time;
    if (game.pressed("start")) { game.say(aboutPages(), { name: T({ zh: "关于", en: "About" }) }); return; }
    if (!S.loaded) return;
    if (game.pressed("a") || game.pointer.pressed) {
      SFX.click(game);
      game.go("climb", { reset: true, newLoop: false });
    }
  },
  draw: function (g) {
    S.time = game.time;
    ART.drawWorld(g, S);
    g.text("西西弗斯", 80, 22, { align: "center", color: 0 });
    g.text("SISYPHUS", 80, 38, { align: "center", color: 1 });
    g.line(58, 54, 102, 54, 1);
    g.rect(8, 118, 144, 52, 3);
    g.frame(8, 118, 144, 52, 0);
    g.text(T({ zh: "按住 A / B 或屏幕", en: "HOLD A / B OR SCREEN" }), 80, 125, { align: "center", color: 0 });
    g.text(T({ zh: "把石头推上去", en: "PUSH THE STONE UP" }), 80, 139, { align: "center", color: 1 });
    g.text(S.loaded ? T({ zh: "A / 触摸 开始", en: "A / TAP TO BEGIN" }) : "…", 80, 157, { align: "center", color: 0 });
  }
});

/* ---------------- climb ---------------- */
game.scene("climb", {
  enter: function (args) {
    if (args && args.reset) resetRun(!!args.newLoop);
    S.mode = "climb";
    S.phase = 1;
    S.pose = "stand";
    S.quoteOpened = false;
    S.wasPush = false;
    game.music(MUSIC.ascent1);
    setAmbience(0.22);
  },
  update: function (dt) {
    S.time = game.time;
    if (S.lock > 0) S.lock -= dt;

    var pushing = (game.btn("a") || game.btn("b") || game.pointer.down) && S.lock <= 0;
    if (!S.wasPush && pushing) {
      S.heaveT = 0.06; S.stepT = 0.25; S.idle = 0;
    }
    S.wasPush = pushing;

    if (pushing) {
      S.idle = 0;
      var speed = 0.0175 * (1 - 0.30 * S.p);
      S.p += speed * dt;
      S.boulderAngle += speed * dt * 31;
      S.walkPhase += dt * 6.2;
      S.pose = Math.sin(S.time * 3.2) > 0.72 ? "strain" : "push";

      S.heaveT -= dt;
      if (S.heaveT <= 0) {
        SFX.heave(game, S.p < 0.08);
        ART.spawnDust(S, S.boulderX - S.boulderR + 2, S.boulderY + S.boulderR - 2, 3, 8);
        game.shake(1, 0.07);
        S.heaveT = 2.7 + Math.random() * 2.2;
      }
      S.breathT -= dt;
      if (S.breathT <= 0) { SFX.breath(game); S.breathT = 1.5 + Math.random() * 1.1; }
      S.stepT -= dt;
      if (S.stepT <= 0) {
        SFX.step(game);
        ART.spawnDust(S, S.playerX, S.playerY - 1, 1, 3);
        S.stepT = 0.62 + Math.random() * 0.18;
      }
    } else {
      S.idle += dt;
      if (S.idle > 0.95 && S.p > 0) {
        var slide = 0.0024 + Math.max(0, S.idle - 0.95) * 0.0022;
        S.p -= slide * dt;
        S.boulderAngle -= slide * dt * 31;
        S.pose = S.idle > 1.55 ? "slip" : "strain";
        if (S.idle > 1.9) {
          S.slipT -= dt;
          if (S.slipT <= 0) {
            SFX.slip(game);
            ART.spawnDust(S, S.boulderX - S.boulderR + 2, S.boulderY + S.boulderR - 2, 2, 5);
            S.slipT = 0.54;
          }
        }
      } else {
        S.pose = "stand";
      }
      if (S.p <= 0) { S.p = 0; S.pose = "stand"; }
      else if (S.idle > 8.5) { startRollback(); return; }
    }

    if (S.p >= 0.972) { startSummit(); return; }
    if (S.p < 0) S.p = 0;
    if (S.p > 0.98) S.p = 0.98;
    updatePositions();
    WORLD.follow(S.cam, S.playerX, S.playerY, dt);
    ART.updateDust(S, dt);

    if (S.phase === 1 && S.p > 0.55) {
      S.phase = 2;
      game.music(MUSIC.ascent2);
      setAmbience(0.40);
    }
  },
  draw: function (g) {
    S.time = game.time;
    ART.drawWorld(g, S);
  }
});

/* ---------------- rollback ---------------- */
function startRollback() {
  if (S.mode !== "climb") return;
  S.mode = "rollback";
  S.rollT = 0;
  S.rollFrom = S.p;
  S.pose = "slip";
  S.wasPush = false;
  SFX.rumble(game);
  game.musicStop();
  setAmbience(0.45);
  game.shake(2, 0.55);
  game.go("rollback", {}, { fade: false });
}

game.scene("rollback", {
  update: function (dt) {
    S.time = game.time;
    S.rollT += dt;
    S.p = Math.max(0, S.rollFrom - S.rollT * 0.55);
    updatePositions();
    WORLD.follow(S.cam, S.playerX, S.playerY, dt * 3);
    if (S.rollT < 0.8) ART.spawnDust(S, S.boulderX - S.boulderR + 2, S.boulderY + S.boulderR - 2, 1, 6);
    ART.updateDust(S, dt);
    S.pose = "slip";
    if (S.p <= 0 && S.rollT > 1.0) {
      S.mode = "climb";
      S.p = 0;
      S.idle = 0;
      S.phase = 1;
      S.lock = 0.9;
      S.pose = "stand";
      S.wasPush = false;
      updatePositions();
      game.music(MUSIC.ascent1);
      setAmbience(0.22);
      SFX.scrape(game);
      game.go("climb", { reset: false }, { fade: false });
    }
  },
  draw: function (g) {
    S.time = game.time;
    ART.drawWorld(g, S);
  }
});

/* ---------------- summit ---------------- */
function startSummit() {
  S.mode = "summit";
  S.p = 0.98;
  S.summitT = 0;
  S.gong = false;
  S.quoteOpened = false;
  S.pose = "look";
  S.wasPush = false;
  updatePositions();
  S.boulderX = WORLD.SUMMIT_X;
  S.boulderY = WORLD.pathY(S.boulderX) - S.boulderR + 1;
  game.musicStop();
  setAmbience(0.50);
  SFX.scrape(game);
  game.go("summit", {}, { fade: false });
}

game.scene("summit", {
  enter: function () { S.mode = "summit"; },
  update: function (dt) {
    S.time = game.time;
    S.summitT += dt;
    S.boulderAngle = Math.sin(S.summitT * 1.7) * 0.05;
    S.pose = S.summitT < 0.7 ? "look" : "stand";
    WORLD.follow(S.cam, S.boulderX - 6, S.boulderY, dt);
    if (!S.gong && S.summitT > 0.9) { S.gong = true; SFX.gong(game); }
    if (!S.quoteOpened && S.summitT > 1.65) {
      S.quoteOpened = true;
      openQuote();
    }
  },
  draw: function (g) {
    S.time = game.time;
    ART.drawWorld(g, S);
  }
});

function openQuote() {
  var n = S.summits + 1;
  var q = QS.next(S);
  S.summits = n;
  if (S.seen.indexOf(q.id) < 0) S.seen.push(q.id);
  S.quote = q;
  S.quoteN = n;
  saveState();
  game.push("quote", { q: q, n: n }).then(function () { startFall(); });
}

/* ---------------- quote card ---------------- */
game.scene("quote", {
  enter: function (args) {
    S.quote = args.q;
    S.quoteN = args.n;
    S.quoteT = 0;
    S.quoteReveal = 0;
    S.quoteStatus = null;
    S.quoteSaving = false;
    S.doneT = 0;
  },
  update: function (dt) {
    S.time = game.time;
    S.quoteT += dt;
    S.quoteReveal = Math.min(1, S.quoteReveal + dt / 0.5);
    if (S.quoteSaving) return;
    if (S.quoteStatus === "saved" || S.quoteStatus === "denied") {
      S.doneT += dt;
      if (S.doneT > 0.95 || game.pressed("a") || game.pressed("b")) game.pop(S.quoteStatus);
      return;
    }
    if (S.quoteT < 0.72) return;
    if (game.pressed("a")) {
      S.quoteSaving = true;
      S.quoteStatus = "saving";
      appendNote(S.quote, S.quoteN, function (r) {
        S.quoteStatus = r;
        S.quoteSaving = false;
        S.doneT = 0;
        if (r === "saved") SFX.chime(game); else SFX.denied(game);
      });
    } else if (game.pressed("b")) {
      game.pop("skip");
    }
  },
  draw: function (g) {
    S.time = game.time;
    ART.card(g, S.quote, "山顶", "第 " + S.quoteN + " 次", S.quoteReveal, S.quoteStatus, "A 记下    B 让它过去");
  }
});

/* ---------------- the fall and the walk down ---------------- */
function startFall() {
  S.mode = "fall";
  S.fallT = 0;
  S.fallX = WORLD.SUMMIT_X;
  S.pose = "look";
  S.quoteStatus = null;
  SFX.rumble(game);
  game.music(MUSIC.descent);
  setAmbience(0.40);
  game.go("fall", {}, { fade: false });
}

game.scene("fall", {
  update: function (dt) {
    S.time = game.time;
    S.fallT += dt;
    var t = Math.min(1, S.fallT / 1.9);
    var e = 1 - (1 - t) * (1 - t);
    var x = WORLD.SUMMIT_X + 104 * e;
    S.boulderX = x;
    S.boulderY = WORLD.farPathY(x) - S.boulderR + 1;
    S.boulderAngle += dt * 6;
    WORLD.follow(S.cam, WORLD.SUMMIT_X - 18, WORLD.SUMMIT_Y + 22, dt);
    if (S.fallT > 2.2) game.go("descent", {}, { time: 0.35, to: 0 });
  },
  draw: function (g) {
    S.time = game.time;
    ART.drawWorld(g, S);
  }
});

game.scene("descent", {
  enter: function () {
    S.mode = "descent";
    S.descendPhase = "far";
    S.farX = WORLD.SUMMIT_X;
    S.wipe = 0; S.baseT = 0;
    S.p = 1;
    S.descentT = 0; S.epi = 0; S.endT = 0;
    S.pose = "walk"; S.walkPhase = 0; S.wasPush = false;
    S.dust = [];
    S.playerX = S.farX;
    S.playerY = WORLD.farPathY(S.farX);
    S.boulderX = 1040;
    S.boulderY = WORLD.farPathY(S.boulderX) - S.boulderR + 1;
    S.cam = WORLD.makeCamera();
    WORLD.follow(S.cam, S.playerX, S.playerY + 56, 1, true);
    game.music(MUSIC.descent);
    setAmbience(0.35);
  },
  update: function (dt) {
    S.time = game.time;
    S.descentT += dt;

    if (S.descendPhase === "far") {
      /* he follows the stone over the ridge and down the far side */
      S.farX = Math.min(1000, S.farX + dt * 40);
      S.playerX = S.farX;
      S.playerY = WORLD.farPathY(S.farX);
      S.walkPhase += dt * 7;
      S.pose = "walk";
      S.boulderX = 1040;
      S.boulderY = WORLD.farPathY(S.boulderX) - S.boulderR + 1;
      WORLD.follow(S.cam, S.playerX, S.playerY + 56, dt);
      ART.updateDust(S, dt);
      if (S.descentT > 1.3) S.epi = Math.min(1, S.epi + dt / 1.1);
      if (S.farX >= 999.5) {
        S.descendPhase = "cover";
        S.wipe = 0;
        S.epi = 0;
      }
    } else if (S.descendPhase === "cover") {
      /* the camera goes around the mountain: a dither curtain from the far side to ours */
      S.wipe = Math.min(1, S.wipe + dt / 0.55);
      if (S.wipe >= 1) {
        snapToBase();
        S.descendPhase = "reveal";
        S.wipe = 1;
      }
    } else if (S.descendPhase === "reveal") {
      S.wipe = Math.max(0, S.wipe - dt / 0.55);
      if (S.wipe <= 0) { S.descendPhase = "base"; S.baseT = 0; }
    } else {
      S.baseT += dt;
      S.pose = S.baseT > 0.6 ? "look" : "stand";
      if (S.baseT > 2.2) game.go("climb", { reset: true, newLoop: true }, { time: 0.5, to: 3 });
    }
  },
  draw: function (g) {
    S.time = game.time;
    ART.drawWorld(g, S);
    if (S.wipe > 0) ART.wipe(g, S.wipe, 0);
    if (S.descendPhase === "base" && S.baseT > 0.45) {
      g.text("Le rocher l'attend.", 80, 146, { align: "center", color: 3, shadow: 0 });
      g.text("石头在山脚等他。", 80, 160, { align: "center", color: 3, shadow: 0 });
    }
  }
});

function snapToBase() {
  S.p = 0;
  S.playerX = WORLD.pathX(0);
  S.playerY = WORLD.pathY(S.playerX);
  S.boulderX = WORLD.pathX(0.02);
  S.boulderY = WORLD.pathY(S.boulderX) - S.boulderR + 1;
  S.cam = WORLD.makeCamera();
  WORLD.follow(S.cam, S.playerX, S.playerY, 1, true);
  S.pose = "stand";
  S.walkPhase = 0;
  S.epi = 0;
  S.dust = [];
}

/* ---------------- menu and gallery ---------------- */
function openMenu() {
  if (S.mode === "fall" || S.mode === "quote") return;
  SFX.click(game);
  game.push("menu");
}

function menuItems() {
  return [T({ zh: "继续", en: "Resume" }), T({ zh: "语录", en: "Lines" }), T({ zh: "关于", en: "About" })];
}

game.scene("menu", {
  enter: function () { S.menuIndex = 0; S.menuOpen = true; },
  exit: function () { S.menuOpen = false; },
  update: function () {
    S.time = game.time;
    var items = menuItems();
    if (game.pressed("up")) { S.menuIndex = (S.menuIndex + items.length - 1) % items.length; SFX.move(game); }
    if (game.pressed("down")) { S.menuIndex = (S.menuIndex + 1) % items.length; SFX.move(game); }
    if (game.pressed("b")) { SFX.click(game); game.pop(); return; }
    if (game.pressed("a")) {
      SFX.click(game);
      if (S.menuIndex === 0) game.pop();
      else if (S.menuIndex === 1) game.push("gallery");
      else game.say(aboutPages(), { name: T({ zh: "关于", en: "About" }) });
    }
  },
  draw: function (g) {
    S.time = game.time;
    var items = menuItems();
    g.window(10, 46, 140, 88);
    g.text(T({ zh: "暂停", en: "PAUSED" }), 80, 52, { align: "center", color: 1 });
    for (var i = 0; i < items.length; i++) {
      var y = 70 + i * 16;
      if (i === S.menuIndex) {
        g.rect(18, y - 1, 124, 14, 0);
        g.text(items[i], 80, y, { align: "center", color: 3 });
      } else g.text(items[i], 80, y, { align: "center", color: 0 });
    }
    g.text(T({ zh: "↑↓选 A确认 B返回", en: "UP/DN A OK B BACK" }), 80, 120, { align: "center", color: 1 });
  }
});

game.scene("gallery", {
  enter: function () {
    S.galleryList = QS.seenList(S);
    S.galleryIndex = 0;
    S.galleryStatus = null;
    S.gallerySaving = false;
    S.galleryDone = 0;
  },
  update: function (dt) {
    S.time = game.time;
    if (S.gallerySaving) return;
    if (S.galleryStatus === "saved" || S.galleryStatus === "denied") {
      S.galleryDone += dt;
      if (S.galleryDone > 0.8 || game.pressed("a") || game.pressed("b")) {
        S.galleryStatus = null; S.galleryDone = 0;
      }
      return;
    }
    if (!S.galleryList.length) {
      if (game.pressed("b") || game.pressed("start")) { SFX.click(game); game.pop(); }
      return;
    }
    if (game.pressed("up")) { S.galleryIndex = (S.galleryIndex + S.galleryList.length - 1) % S.galleryList.length; SFX.move(game); }
    if (game.pressed("down")) { S.galleryIndex = (S.galleryIndex + 1) % S.galleryList.length; SFX.move(game); }
    if (game.pressed("b")) { SFX.click(game); game.pop(); return; }
    if (game.pressed("a")) {
      SFX.click(game);
      S.gallerySaving = true;
      S.galleryStatus = "saving";
      appendNote(S.galleryList[S.galleryIndex], Math.max(1, S.summits), function (r) {
        S.galleryStatus = r;
        S.gallerySaving = false;
        S.galleryDone = 0;
        if (r === "saved") SFX.chime(game); else SFX.denied(game);
      });
    }
  },
  draw: function (g) {
    S.time = game.time;
    if (!S.galleryList.length) {
      g.clear(3);
      g.frame(3, 3, 154, 172, 0);
      g.text("幸福手册", 12, 10, { color: 1 });
      g.line(12, 27, 147, 27, 1);
      g.text(T({ zh: "还没有语录。", en: "No lines yet." }), 13, 44, { color: 0 });
      g.text(T({ zh: "去山顶。", en: "Go to the summit." }), 13, 60, { color: 1 });
      g.text(T({ zh: "B 返回", en: "B BACK" }), 13, 160, { color: 0 });
      return;
    }
    var q = S.galleryList[S.galleryIndex];
    ART.card(g, q, "幸福手册", (S.galleryIndex + 1) + " / " + S.galleryList.length, 1, S.galleryStatus, "A 写入    B 返回");
  }
});

/* ---------------- about ---------------- */
function aboutPages() {
  return [
    T({ zh: "西西弗斯 / Sisyphus", en: "Sisyphus / 西西弗斯" }),
    T({ zh: "推石上山。它滚下去。再推。", en: "Push the stone. It falls. Push again." }),
    T({ zh: "灵感来自加缪《西西弗斯神话》。中英译文为本作自译。",
      en: "After Albert Camus, Le Mythe de Sisyphe. Translations for this work." }),
    T({ zh: "按住 A / B 或屏幕推石。停太久，石头会滚回去。",
      en: "Hold A / B or the screen. Rest too long and the stone rolls back." }),
    T({ zh: "山顶的语录可以写入记事本「幸福手册」。",
      en: "At the summit, a line can be written into Notes, in 'A Manual of Happiness'." }),
    T({ zh: "没有终点。", en: "There is no end." })
  ];
}

/* The first scene. */
game.start("title");
