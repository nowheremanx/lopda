var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";

/* ---- the engine: plays SCRIPT. You should not need to change anything below. ---- */
var ART = {}, LABELS = {}, CHAPTERS = [];
function big(rows) { return rows.map(function (r) { return r.replace(/./g, "$&$&"); }).reduce(function (a, r) { a.push(r, r); return a; }, []); }
Object.keys(CAST).forEach(function (k) { ART[k] = LoGame.sprite(big(CAST[k].art)); });
SCRIPT.forEach(function (s, i) {
  if (s.label) LABELS[s.label] = i;
  if (s.chapter) CHAPTERS.push({ id: s.id || ("ch" + i), pc: i, chapter: s.chapter, sub: s.sub });
});

var BOX_Y = 88, LINES = 3, SPEED = 30;
var S;          /* saved: { v, pc, flags, bg, left, right, chapter } */
var log = [];   /* backlog: [{ who, text }] */
var cur = null; /* what waits for the player: { kind: "say"|"choice"|"chapter"|"end", ... } */
var view = "play", logTop = 0;

/* chapter snapshots are script positions, so they expire with the story version */
var PROGRESS_VERSION = STORY_VERSION;
var progress = { v: PROGRESS_VERSION, done: {} };
var progressLoaded = false;

function fresh() { return { v: STORY_VERSION, pc: 0, flags: {}, bg: null, left: null, right: null, chapter: null }; }
function who(id) { return id && CAST[id] ? T(CAST[id].name) : ""; }
function copyFlags(f) {
  var out = {};
  for (var k in f) if (Object.prototype.hasOwnProperty.call(f, k)) out[k] = f[k];
  return out;
}

/* Chapter progress survives endings, so it has its own save. Each entry is the
   state at that chapter's card, not at its end: replaying a chapter should not
   inherit choices made inside it. */
function loadProgress() {
  if (progressLoaded) return;
  game.load("chapters").then(function (p) {
    progressLoaded = true;
    if (!p || p.v !== PROGRESS_VERSION || !p.done) return;
    for (var id in p.done) {
      if (Object.prototype.hasOwnProperty.call(p.done, id) && !progress.done[id]) progress.done[id] = p.done[id];
    }
  });
}
function chapterList() {
  return CHAPTERS.filter(function (c) { return !!progress.done[c.id]; });
}
function hasChapters() { return chapterList().length > 0; }
function finishChapter(c) {
  if (!c || !c.id || progress.done[c.id]) return;
  progress.done[c.id] = {
    flags: copyFlags(c.flags || {}), bg: c.bg || null,
    left: c.left || null, right: c.right || null
  };
  game.save("chapters", progress);
}
function playChapter(c) {
  var r = progress.done[c.id];
  if (!r) return;
  var st = fresh();
  st.pc = c.pc;
  st.flags = copyFlags(r.flags || {});
  st.bg = r.bg || null;
  st.left = r.left || null;
  st.right = r.right || null;
  game.go("play", st);
}

/* the backdrop decides the weather; "dawn" and "empty" are quiet */
var heard = "";
function listen(key) {
  var a = AMBIENCE[key] || null, now = a ? a.join(" ") : "";
  if (now === heard) return;
  heard = now;
  game.ambience(a ? a[0] : null, a ? a[1] : 0);
}

function jump(label) { if (!(label in LABELS)) throw new Error("no label " + label); S.pc = LABELS[label]; }

/* run steps until one needs the player */
function run() {
  for (var guard = 0; guard < 10000; guard++) {
    var s = SCRIPT[S.pc];
    if (!s) { finishChapter(S.chapter); cur = { kind: "end", title: "", sub: "" }; return; }
    if (s.chapter) {
      finishChapter(S.chapter);
      S.chapter = {
        id: s.id || ("ch" + S.pc), flags: copyFlags(S.flags), bg: S.bg,
        left: S.left, right: S.right
      };
      S.pc++;
      game.save("vn", S);
      cur = { kind: "chapter", title: T(s.chapter), sub: s.sub ? T(s.sub) : "" };
      return;
    }
    if (s.bg !== undefined) { S.bg = s.bg; S.pc++; listen(s.bg); }
    else if (s.show) { S[s.show] = s.who; S.pc++; }
    else if (s.hide) { S[s.hide] = null; S.pc++; }
    else if (s.label) S.pc++;
    else if (s.set) { S.flags[s.set] = true; S.pc++; }
    else if (s.sfx) { game.sfx(s.sfx); S.pc++; }
    else if (s.if !== undefined) { if (S.flags[s.if]) jump(s.goto); else S.pc++; }
    else if (s.goto) jump(s.goto);
    else if (s.say !== undefined) {
      game.save("vn", S);
      cur = { kind: "say", who: s.say, text: T(s.text), pages: null, page: 0, n: 0 };
      log.push({ who: s.say, text: cur.text }); if (log.length > 300) log.shift();
      return;
    } else if (s.choice) { game.save("vn", S); cur = { kind: "choice", items: s.choice, idx: 0 }; return; }
    else if (s.end) {
      finishChapter(S.chapter);
      game.remove("vn");
      game.sfx("win");
      cur = { kind: "end", title: s.title ? T(s.title) : "", sub: s.sub ? T(s.sub) : "" };
      return;
    }
    else S.pc++;
  }
}

function advance() {
  if (cur.kind === "chapter") { game.sfx("tap"); run(); return; }
  if (cur.kind === "say") {
    var page = cur.pages ? cur.pages[cur.page].join("") : cur.text;
    if (cur.n < page.length) { cur.n = page.length; return; }
    if (cur.pages && cur.page < cur.pages.length - 1) { cur.page++; cur.n = 0; game.sfx("tick"); return; }
    S.pc++; game.sfx("tap"); run();
  } else if (cur.kind === "choice") {
    var c = cur.items[cur.idx];
    log.push({ who: null, text: "> " + T(c.text) });
    if (c.set) S.flags[c.set] = true;
    game.sfx("ok");
    if (c.goto) jump(c.goto); else S.pc++;
    run();
  } else if (cur.kind === "end") game.go("title");
}

function choiceRow(k) {
  var lineHeight = game.g.lineHeight, h = cur.items.length * lineHeight + 8;
  var y = Math.floor((BOX_Y - h) / 2) + 20;
  return { x: 8, y: y + 4 + k * lineHeight, w: 144, h: lineHeight };
}

function titleRow(k) {
  var lineHeight = game.g.lineHeight;
  return { x: 40, y: 76 + k * lineHeight, w: 80, h: lineHeight };
}

function contains(row, x, y) {
  return x >= row.x && x < row.x + row.w && y >= row.y && y < row.y + row.h;
}

game.scene("play", {
  enter: function (saved) {
    S = saved && saved.v === STORY_VERSION ? saved : fresh();
    log = []; view = "play";
    if (S.bg) listen(S.bg);
    run();
  },
  update: function (dt) {
    if (game.pressed("select") && hasChapters()) {
      game.sfx("tap");
      game.go("chapters", "play");
      return;
    }
    if (view === "log") {
      if (game.repeat("up")) logTop = Math.max(0, logTop - 1);
      if (game.repeat("down")) logTop = Math.min(Math.max(0, log.length - 1), logTop + 1);
      if (game.pressed("b") || game.pressed("a")) { view = "play"; game.sfx("tap"); }
      return;
    }
    if (cur.kind === "say") cur.n += dt * SPEED;
    if (cur.kind === "choice") {
      if (game.repeat("up")) { cur.idx = (cur.idx + cur.items.length - 1) % cur.items.length; game.sfx("move"); }
      if (game.repeat("down")) { cur.idx = (cur.idx + 1) % cur.items.length; game.sfx("move"); }
    }
    if (game.pressed("b") && cur.kind !== "end" && cur.kind !== "chapter") {
      view = "log"; logTop = Math.max(0, log.length - 4); game.sfx("tap"); return;
    }
    if (game.pointer.pressed && cur.kind === "choice") {
      for (var k = 0; k < cur.items.length; k++) {
        if (contains(choiceRow(k), game.pointer.x, game.pointer.y)) {
          cur.idx = k;
          advance();
          return;
        }
      }
    }
    if (game.pressed("a") || game.pressed("start") ||
        (game.pointer.pressed && cur.kind !== "choice")) advance();
  },
  draw: function (g) {
    g.clear(g.PAPER);
    if (S.bg && BACKDROPS[S.bg]) BACKDROPS[S.bg](g);
    if (S.left && ART[S.left]) g.sprite(ART[S.left], 14, BOX_Y - 32);
    if (S.right && ART[S.right]) g.sprite(ART[S.right], 122, BOX_Y - 32, { flip: true });
    if (view === "log") return drawLog(g);
    if (cur.kind === "chapter") return drawChapter(g);
    if (cur.kind === "say") {
      if (!cur.pages) {
        var lines = g.wrap(cur.text, 150), pages = [];
        for (var i = 0; i < lines.length; i += LINES) pages.push(lines.slice(i, i + LINES));
        cur.pages = pages.length ? pages : [[""]];
      }
      g.window(0, BOX_Y, 160, 144 - BOX_Y);
      var name = who(cur.who);
      if (name) { var w = g.measure(name) + 8; g.window(4, BOX_Y - 14, w, 15, { thin: true }); g.text(name, 8, BOX_Y - 13); }
      var left = Math.floor(cur.n), pg = cur.pages[cur.page];
      for (var j = 0; j < pg.length && left > 0; j++) {
        g.text(pg[j].slice(0, left), 5, BOX_Y + 4 + j * g.lineHeight);
        left -= pg[j].length;
      }
      if (cur.n >= pg.join("").length && Math.floor(game.time * 3) % 2) g.arrow(150, 136, "down", g.INK);
    } else if (cur.kind === "choice") {
      var h = cur.items.length * g.lineHeight + 8, y = Math.floor((BOX_Y - h) / 2) + 20;
      g.window(8, y, 144, h);
      cur.items.forEach(function (c, k) {
        var row = choiceRow(k), selected = k === cur.idx;
        if (selected) g.rect(row.x + 2, row.y, row.w - 4, row.h, g.INK);
        g.text(T(c.text), 12, row.y, { color: selected ? g.PAPER : g.INK });
      });
    } else {
      g.window(0, BOX_Y, 160, 144 - BOX_Y);
      g.text(cur.title || "END", 80, BOX_Y + 8, { align: "center" });
      if (cur.sub) g.text(cur.sub, 80, BOX_Y + 24, { align: "center", color: g.INK });
      g.text(T({ zh: "按 A 回到标题", en: "A: back to title" }), 80, BOX_Y + 42, { align: "center", color: g.INK });
    }
  }
});

function drawChapter(g) {
  g.clear(g.PAPER);
  g.dither(0, 0, 160, 144, g.MID, 1);
  g.rect(20, 58, 120, 1, g.INK);
  /* with width, align centers inside x..x+width: start the box at 8, not at the screen centre */
  var h = g.text(cur.title, 8, 38, { align: "center", width: 144 });
  g.text(cur.sub, 8, 66, { align: "center", width: 144, color: g.INK });
  g.text(T({ zh: "按 A 继续", en: "A: continue" }), 80, 118, { align: "center", color: g.INK });
  return h;
}

function drawLog(g) {
  g.rect(0, 0, 160, 144, g.PAPER);
  g.rect(0, 0, 160, 16, g.INK);
  g.text(T({ zh: "回看  ↑↓ 翻  B 返回", en: "Log  Up/Dn  B: back" }), 4, 1, { color: g.PAPER });
  var y = 20;
  for (var i = logTop; i < log.length && y < 140; i++) {
    var e = log[i], name = who(e.who);
    var line = name ? name + ": " + e.text : e.text;
    var lines = g.wrap(line, 152);
    for (var k = 0; k < lines.length && y < 140; k++) { g.text(lines[k], 4, y, { color: g.INK }); y += g.lineHeight; }
    y += 2;
  }
}

var saved = null, menuIdx = 0;
game.scene("title", {
  enter: function () {
    saved = null; menuIdx = 0;
    loadProgress();
    game.load("vn").then(function (v) { saved = v && v.v === STORY_VERSION ? v : null; });
    listen("title");
  },
  update: function () {
    if (game.pressed("select") && hasChapters()) {
      game.sfx("tap");
      game.go("chapters", "title");
      return;
    }
    var n = saved ? 2 : 1;
    if (game.repeat("up") || game.repeat("down")) { menuIdx = (menuIdx + 1) % n; game.sfx("move"); }
    if (game.pointer.pressed) {
      var tapped = -1;
      for (var k = 0; k < n; k++) {
        if (contains(titleRow(k), game.pointer.x, game.pointer.y)) { tapped = k; break; }
      }
      if (tapped < 0) return;
      menuIdx = tapped;
    } else if (!game.pressed("a") && !game.pressed("start")) {
      return;
    }
    game.sfx("ok");
    game.go("play", saved && menuIdx === 0 ? saved : null);
  },
  draw: function (g) {
    g.clear(g.PAPER);
    g.dither(0, 0, 160, 144, g.MID, 1);
    g.text(T(TITLE), 80, 26, { align: "center" });
    g.text(T({ zh: "一张十年前的旧车票", en: "A ten-year-old ticket" }), 80, 44, { align: "center", color: g.INK });
    var items = saved ? [T({ zh: "继续", en: "Continue" }), T({ zh: "从头开始", en: "New story" })] : [T({ zh: "开始", en: "Start" })];
    g.window(40, 70, 80, items.length * g.lineHeight + 8);
    items.forEach(function (s, k) {
      var row = titleRow(k), selected = k === menuIdx;
      if (selected) g.rect(row.x + 2, row.y, row.w - 4, row.h, g.INK);
      g.text(s, 54, row.y, { color: selected ? g.PAPER : g.INK });
    });
    g.rect(0, 112, 160, 32, g.PAPER);
    g.line(0, 112, 160, 112, g.INK);
    var hasSave = !!saved;
    g.text(T(hasSave ? { zh: "↑↓ 选  A 确定", en: "Up/Dn  A: OK" } : { zh: "A 开始", en: "A: start" }), 80, 115, { align: "center", color: g.INK });
    var hint = hasChapters()
      ? { zh: "SELECT 选章  B 回看", en: "SELECT chapters  B log" }
      : { zh: "剧情中 A 前进 B 回看", en: "Story: A next  B log" };
    g.text(T(hint), 80, 128, { align: "center", color: g.INK });
  }
});

/* Chapter select: only chapters that have been finished appear here. */
var chIdx = 0, chTop = 0, chFrom = "title", chBack = null;
var CH_VISIBLE = 4, CH_ROW = 26;
function leaveChapters() {
  if (chFrom === "play" && chBack) game.go("play", chBack);
  else game.go("title");
}
game.scene("chapters", {
  enter: function (from) {
    chFrom = from || "title";
    chBack = chFrom === "play" ? S : null;
    chIdx = 0; chTop = 0;
    var list = chapterList();
    if (chFrom === "play" && S && S.chapter) {
      for (var i = 0; i < list.length; i++) if (list[i].id === S.chapter.id) { chIdx = i; break; }
      if (chIdx >= CH_VISIBLE) chTop = chIdx - CH_VISIBLE + 1;
    }
  },
  update: function () {
    var list = chapterList();
    if (!list.length) {
      if (game.pressed("a") || game.pressed("b") || game.pressed("start") || game.pressed("select")) {
        game.sfx("tap"); leaveChapters();
      }
      return;
    }
    if (game.repeat("up")) { chIdx = (chIdx + list.length - 1) % list.length; game.sfx("move"); }
    if (game.repeat("down")) { chIdx = (chIdx + 1) % list.length; game.sfx("move"); }
    if (chIdx < chTop) chTop = chIdx;
    if (chIdx >= chTop + CH_VISIBLE) chTop = chIdx - CH_VISIBLE + 1;
    if (game.pressed("a") || game.pressed("start")) {
      game.sfx("ok"); playChapter(list[chIdx]); return;
    }
    if (game.pressed("b") || game.pressed("select")) { game.sfx("tap"); leaveChapters(); }
  },
  draw: function (g) {
    g.clear(g.PAPER);
    g.dither(0, 0, 160, 144, g.MID, 1);
    g.rect(0, 0, 160, 16, g.INK);
    g.text(T({ zh: "选择章节", en: "Chapters" }), 4, 1, { color: g.PAPER });
    var list = chapterList();
    if (!list.length) {
      g.text(T({ zh: "还没有读完的章节", en: "No chapters finished yet" }), 80, 62, { align: "center", color: g.INK });
      g.text(T({ zh: "B 返回", en: "B: back" }), 80, 130, { align: "center", color: g.INK });
      return;
    }
    for (var k = 0; k < CH_VISIBLE && chTop + k < list.length; k++) {
      var c = list[chTop + k], y = 18 + k * CH_ROW, selected = chTop + k === chIdx;
      if (selected) g.rect(4, y, 152, CH_ROW, g.INK);
      else { g.rect(4, y, 152, CH_ROW, g.PAPER); g.frame(4, y, 152, CH_ROW, g.INK); }
      var col = selected ? g.PAPER : g.INK;
      g.text(T(c.chapter), 8, y + 1, { color: col });
      if (c.sub) g.text(T(c.sub), 8, y + 13, { color: col });
    }
    g.text(T({ zh: "↑↓ 选  A 进入  B 返回", en: "Up/Dn  A: go  B: back" }), 80, 130, { align: "center", color: g.INK });
  }
});
game.start("title");
