/* The player: reads STORY (story.js) one step at a time and draws SCENES (scenes.js) above a text box.

   The save is one small document under "story": the position in STORY, the flags the choices set,
   and the picture. Earlier versions of this app (a different story) saved under "vn" and "chapters";
   this one never reads, writes or removes those, so nothing a player had is lost. */

var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";

/* Bump SAVE_VERSION whenever STORY changes shape: a save is a position in the list, so a save from
   another version is set aside (kept under "story.old", not used) and the story starts from the top. */
var SAVE_KEY = "story", SAVE_VERSION = 1;
var BOX_Y = PIC_H, LINES = 3, SPEED = 28;

var S = null;       /* { v, at, flags, scene, stage } */
var cur = null;     /* what waits for the player: { kind: "chapter" | "say" | "choice" | "end", ... } */
var log = [];       /* the backlog: { who, text } */
var view = "play", logTop = 0;
var canSave = true; /* false when the save could not be read: then nothing is written over it */
var live = { train: -200, dad: null, moving: false, slide: 0 };
var slideSince = -1, heard;

function fresh() { return { v: SAVE_VERSION, at: 0, flags: {}, scene: null, stage: {} }; }
function copy(o) { var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }
function valid(s) {
  return !!s && s.v === SAVE_VERSION && typeof s.at === "number" && s.at >= 0 && s.at < STORY.length &&
    !!s.flags && typeof s.flags === "object" && !!s.stage && typeof s.stage === "object";
}
function store() { if (canSave) game.save(SAVE_KEY, S); }
function shows(step) { return !step.when || !!S.flags[step.when]; }
function name(who) { return who && CAST[who] ? T(CAST[who]) : ""; }

/* the rain you hear follows the scene; a call only when it changes */
function listen(scene, st) {
  var l = hearing(scene, st), key = l === null ? "none" : String(l);
  if (key === heard) return;
  heard = key;
  game.ambience(l === null ? null : "rain", l === null ? 0 : l);
}

/* snap the moving parts to where the story put them (after a load, or a new scene) */
function settle() {
  var st = S.stage;
  live.train = st.train ? TRAIN_AT[st.train] : -200;
  live.dad = typeof st.dad === "number" ? st.dad : null;
  live.moving = false;
  live.slide = 0;
  slideSince = st.go ? -1e9 : -1;
}

/* the backlog of a loaded save: every line before the one waiting, on the path the flags say */
function rebuildLog() {
  log = [];
  for (var i = 0; i < S.at; i++) {
    var s = STORY[i];
    if (!shows(s)) continue;
    if (s.text) log.push({ who: s.who, text: T(s.text) });
    else if (s.choice) s.choice.forEach(function (c) { if (S.flags[c.set]) log.push({ who: null, text: "> " + T(c) }); });
  }
  if (log.length > 300) log = log.slice(-300);
}

/* run steps until one waits for the player */
function run() {
  for (var guard = 0; guard < 1000; guard++) {
    var s = STORY[S.at];
    if (!s) { cur = { kind: "end", title: "", sub: "" }; return; }
    if (!shows(s)) { S.at++; continue; }
    if (s.scene) { S.scene = s.scene; S.stage = copy(s.stage); settle(); listen(S.scene, S.stage); S.at++; continue; }
    if (s.stage) {
      for (var k in s.stage) if (Object.prototype.hasOwnProperty.call(s.stage, k)) S.stage[k] = s.stage[k];
      if (s.stage.go && slideSince < 0) slideSince = game.time;
      listen(S.scene, S.stage);
      S.at++; continue;
    }
    if (s.sfx) { if (SOUNDS[s.sfx]) game.sfx(SOUNDS[s.sfx]); S.at++; continue; }
    if (s.chapter) { store(); cur = { kind: "chapter", title: T(s.chapter), sub: T(s.sub), since: game.time }; return; }
    if (s.text) {
      store();
      cur = { kind: "say", who: s.who, sms: !!s.sms, text: T(s.text), pages: null, page: 0, n: 0 };
      log.push({ who: s.who, text: cur.text }); if (log.length > 300) log.shift();
      return;
    }
    if (s.choice) { store(); cur = { kind: "choice", items: s.choice, idx: 0 }; return; }
    if (s.end) {
      /* the story is over: the next start is a new one */
      if (canSave) game.remove(SAVE_KEY);
      game.music(END_SONG, { loop: false });
      cur = { kind: "end", title: T(s.end), sub: T(s.sub), since: game.time };
      return;
    }
    S.at++;
  }
}

function advance() {
  if (cur.kind === "chapter") { S.at++; game.sfx("tap"); run(); return; }
  if (cur.kind === "say") {
    var page = cur.pages ? cur.pages[cur.page].join("") : cur.text;
    if (cur.n < page.length) { cur.n = page.length; return; }
    if (cur.pages && cur.page < cur.pages.length - 1) { cur.page++; cur.n = 0; game.sfx("tick"); return; }
    S.at++; game.sfx("tap"); run(); return;
  }
  if (cur.kind === "choice") {
    var c = cur.items[cur.idx];
    S.flags[c.set] = true;
    log.push({ who: null, text: "> " + T(c) });
    game.sfx("ok");
    S.at++; run(); return;
  }
  if (cur.kind === "end") { game.musicStop(); game.go("title"); }
}

/* the rows a choice puts on screen, for taps */
function choiceRow(k, n) {
  var h = n * game.g.lineHeight + 8, y = Math.floor((PIC_H - h) / 2) + 2;
  return { x: 12, y: y + 4 + k * game.g.lineHeight, w: 136, h: game.g.lineHeight };
}
function inside(r, x, y) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }

function animate(dt) {
  var st = S.stage;
  var tx = st.train ? TRAIN_AT[st.train] : -200;
  if (live.train !== tx) {
    /* a long train slowing down: fast at first, then creeping in */
    var gap = tx - live.train, step = Math.max(10, Math.abs(gap) * 1.1) * dt;
    live.train = Math.abs(gap) <= step ? tx : live.train + (gap > 0 ? step : -step);
  }
  if (typeof st.dad === "number") {
    if (live.dad === null) live.dad = st.dad;
    var d = st.dad - live.dad;
    live.moving = Math.abs(d) > 0.01;
    /* 0.55 pillars a second: about twenty metres in four seconds with a suitcase */
    live.dad = live.moving ? live.dad + Math.max(-0.55 * dt, Math.min(0.55 * dt, d)) : st.dad;
  } else live.moving = false;
  if (st.go) {
    if (slideSince < 0) slideSince = game.time;
    var t = Math.max(0, game.time - slideSince);
    live.slide = Math.min(600, 3 * t * t);
  }
}

game.scene("play", {
  enter: function (saved) {
    S = valid(saved) ? saved : fresh();
    view = "play"; heard = undefined;
    if (S.scene) { settle(); listen(S.scene, S.stage); }
    rebuildLog();
    run();
  },
  update: function (dt) {
    animate(dt);
    if (view === "log") {
      if (game.repeat("up")) logTop = Math.max(0, logTop - 1);
      if (game.repeat("down")) logTop = Math.min(Math.max(0, log.length - 1), logTop + 1);
      if (game.pressed("b") || game.pressed("a") || game.pointer.pressed) { view = "play"; game.sfx("tap"); }
      return;
    }
    if (cur.kind === "say") cur.n += dt * SPEED;
    if (cur.kind === "choice") {
      var n = cur.items.length;
      if (game.repeat("up")) { cur.idx = (cur.idx + n - 1) % n; game.sfx("move"); }
      if (game.repeat("down")) { cur.idx = (cur.idx + 1) % n; game.sfx("move"); }
      if (game.pointer.pressed) {
        for (var k = 0; k < n; k++) if (inside(choiceRow(k, n), game.pointer.x, game.pointer.y)) { cur.idx = k; advance(); return; }
        return;
      }
    }
    if (game.pressed("b") && (cur.kind === "say" || cur.kind === "choice")) {
      view = "log"; logTop = Math.max(0, log.length - 4); game.sfx("tap"); return;
    }
    /* a card holds for a moment, so a tap meant for the line before does not skip it */
    if (cur.since !== undefined && game.time - cur.since < (cur.kind === "end" ? 1.5 : 0.5)) return;
    if (game.pressed("a") || game.pressed("start") || game.pointer.pressed) advance();
  },
  draw: function (g) {
    g.clear(g.PAPER);
    if (view === "log") return drawLog(g);
    if (cur.kind === "chapter") return drawCard(g, cur.title, cur.sub, T({ zh: "A 继续", en: "A: continue" }));
    if (cur.kind === "end") {
      drawEndPicture(g);
      drawBox(g);
      g.text(cur.title || "END", 80, BOX_Y + 6, { align: "center" });
      if (cur.sub) g.text(cur.sub, 80, BOX_Y + 22, { align: "center", color: g.INK });
      g.text(T({ zh: "A 回到标题", en: "A: back to title" }), 80, BOX_Y + 40, { align: "center", color: g.INK });
      return;
    }
    if (S.scene && SCENES[S.scene]) SCENES[S.scene](g, S.stage, live);
    if (cur.kind === "say") drawSay(g);
    else if (cur.kind === "choice") drawChoice(g);
  }
});

function drawBox(g) { g.window(0, BOX_Y, 160, 144 - BOX_Y); }

function drawSay(g) {
  if (!cur.pages) {
    /* a long line is split into even pages (four lines read 2 + 2, not 3 + 1) */
    var lines = g.wrap(cur.text, 150), pages = [];
    var per = Math.ceil(lines.length / Math.max(1, Math.ceil(lines.length / LINES)));
    for (var i = 0; i < lines.length; i += per) pages.push(lines.slice(i, i + per));
    cur.pages = pages.length ? pages : [[""]];
  }
  drawBox(g);
  var tag = name(cur.who);
  if (tag) {
    var w = g.measure(tag) + 8;
    /* a text message gets an inverted tag, like a phone's screen */
    if (cur.sms) { g.rect(4, BOX_Y - 14, w, 15, g.INK); g.frame(4, BOX_Y - 14, w, 15, g.PAPER); g.text(tag, 8, BOX_Y - 13, { color: g.PAPER }); }
    else { g.window(4, BOX_Y - 14, w, 15, { thin: true }); g.text(tag, 8, BOX_Y - 13); }
  }
  var left = Math.floor(cur.n), pg = cur.pages[cur.page];
  for (var j = 0; j < pg.length && left > 0; j++) {
    g.text(pg[j].slice(0, left), 5, BOX_Y + 5 + j * g.lineHeight);
    left -= pg[j].length;
  }
  if (cur.n >= pg.join("").length && Math.floor(game.time * 3) % 2) g.arrow(150, 136, "down", g.INK);
}

function drawChoice(g) {
  var n = cur.items.length, r0 = choiceRow(0, n);
  g.window(8, r0.y - 4, 144, n * g.lineHeight + 8);
  cur.items.forEach(function (c, k) {
    var r = choiceRow(k, n), on = k === cur.idx;
    if (on) g.rect(r.x, r.y, r.w, r.h, g.INK);
    g.text(T(c), 16, r.y, { color: on ? g.PAPER : g.INK });
  });
  drawBox(g);
  g.text(T({ zh: "↑↓ 选  A 确定", en: "Up/Dn  A: choose" }), 80, BOX_Y + 12, { align: "center", color: g.INK });
  g.text(T({ zh: "B 回看", en: "B: log" }), 80, BOX_Y + 30, { align: "center", color: g.INK });
}

function drawCard(g, title, sub, hint) {
  g.clear(g.INK);
  g.dither(0, 0, 160, 144, g.DARK, 1);
  g.text(title, 8, 40, { align: "center", width: 144, color: g.PAPER });
  g.rect(40, 60, 80, 1, g.MID);
  g.text(sub, 8, 68, { align: "center", width: 144, color: g.PAPER });
  g.text(hint, 80, 120, { align: "center", color: g.PAPER });
}

function drawLog(g) {
  g.rect(0, 0, 160, 16, g.INK);
  g.text(T({ zh: "回看  ↑↓ 翻  B 返回", en: "Log  Up/Dn  B: back" }), 4, 1, { color: g.PAPER });
  var y = 20;
  for (var i = logTop; i < log.length && y < 140; i++) {
    var e = log[i], who = name(e.who), lines = g.wrap(who ? who + "：" + e.text : e.text, 152);
    if (game.lang === "en" && who) lines = g.wrap(who + ": " + e.text, 152);
    for (var k = 0; k < lines.length && y < 140; k++) { g.text(lines[k], 4, y, { color: g.INK }); y += g.lineHeight; }
    y += 2;
  }
}

/* the title: Start, or Continue and Start over when there is a save */
var saved = null, loading = false, unreadable = false, newer = false, menuIdx = 0;
function titleRow(k) { return { x: 44, y: BOX_Y + 6 + k * game.g.lineHeight, w: 72, h: game.g.lineHeight }; }
game.scene("title", {
  enter: function () {
    saved = null; loading = true; unreadable = false; newer = false; menuIdx = 0; heard = undefined;
    listen("title", { rain: 2 });
    game.load(SAVE_KEY).then(function (v) {
      saved = valid(v) ? v : null;
      if (!saved && v && typeof v === "object" && typeof v.v === "number" && v.v > SAVE_VERSION) {
        /* a newer app's save: leave it alone (SPEC.md 8) */
        newer = true; canSave = false;
      } else if (!saved && v != null) {
        /* another version's position: set it aside under its own key before the first store() writes over the key */
        game.save(SAVE_KEY + ".old", v);
      }
      loading = false;
    }, function () {
      /* leave an unreadable save alone: the story can still be read, without saving */
      unreadable = true; canSave = false; loading = false;
    });
  },
  update: function () {
    if (loading) return;
    var n = saved ? 2 : 1;
    if (game.repeat("up") || game.repeat("down")) { if (n > 1) { menuIdx = (menuIdx + 1) % n; game.sfx("move"); } }
    if (game.pointer.pressed) {
      var hit = -1;
      for (var k = 0; k < n; k++) if (inside(titleRow(k), game.pointer.x, game.pointer.y)) hit = k;
      if (hit < 0) return;
      menuIdx = hit;
    } else if (!game.pressed("a") && !game.pressed("start")) return;
    game.sfx("ok");
    game.go("play", saved && menuIdx === 0 ? saved : null);
  },
  draw: function (g) {
    g.clear(g.PAPER);
    drawTitlePicture(g);
    g.window(20, 26, 120, 36);
    g.text(T(STORY_TITLE), 80, 30, { align: "center" });
    g.text(T(STORY_SUB), 80, 45, { align: "center", color: g.INK });
    drawBox(g);
    if (loading) { g.text("…", 80, BOX_Y + 8, { align: "center" }); return; }
    var items = saved ? [T({ zh: "继续", en: "Continue" }), T({ zh: "从头开始", en: "Start over" })] : [T({ zh: "开始", en: "Start" })];
    items.forEach(function (s, k) {
      var r = titleRow(k), on = k === menuIdx;
      if (on) g.rect(r.x, r.y, r.w, r.h, g.INK);
      g.text(s, 80, r.y, { align: "center", color: on ? g.PAPER : g.INK });
    });
    var hint = unreadable ? { zh: "存档读不出，这次不存档", en: "Save unreadable: not saving" }
      : newer ? { zh: "存档来自新版，这次不存档", en: "Newer save: not saving" }
      : { zh: "A 前进  B 回看", en: "A: next   B: log" };
    g.text(T(hint), 80, 128, { align: "center", color: g.INK });
  }
});

game.start("title");
