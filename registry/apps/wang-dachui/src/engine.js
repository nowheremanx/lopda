/* wang-dachui / engine.js — the visual-novel engine.
 *
 * The story is data (src/story.js); the art is procedural (src/art.js).
 * This file plays the script, draws the box and the menus, saves the run,
 * the chapter snapshots and the ending gallery.
 *
 * MIT License. Copyright (c) 2026 Haowei Wu.
 */

var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";

var SCRIPT = STORY.script;
var CAST = STORY.cast;
var ENDINGS = STORY.endings;
var ENDING_ORDER = STORY.endingOrder;
var VERSION = STORY.version;

var LABELS = {}, CHAPTERS = [];
SCRIPT.forEach(function (s, i) {
  if (typeof s.label === "string") LABELS[s.label] = i;
  if (s.chapter) CHAPTERS.push({ id: s.chapter, pc: i, no: s.no, title: s.title, sub: s.sub, art: s.art });
});

var BOX_Y = 88, LINES = 3, SPEED = 34;
var S = null;              /* the run: { v, pc, flags, bg, bgOpts, left, right, musicKey, chapter, chapterNo } */
var cur = null;            /* what waits for the player */
var log = [];              /* backlog */
var view = "play", logTop = 0;

var progress = { v: VERSION, done: {} }, progressLoaded = false;
var endingsDone = {}, endingsLoaded = false;

var heard = "";
var stampKey = null, stampLabel = null, stampUntil = 0;
var fxWave = 0, fxShadow = 0, fxFlicker = 0;
var toastText = null, toastUntil = 0;
var titleT = 0, titleMenu = 0, titleSave = null;
var chIdx = 0, chTop = 0, chFrom = "title", chBack = null, CH_VISIBLE = 3, CH_ROW = 34;
var endIdx = 0;

function fresh() {
  return { v: VERSION, pc: 0, flags: {}, bg: null, bgOpts: null, left: null, right: null,
    musicKey: null, chapter: null, chapterNo: null };
}
function copyFlags(f) {
  var out = {};
  for (var k in f) if (Object.prototype.hasOwnProperty.call(f, k)) out[k] = f[k];
  return out;
}
function who(id) { return id && CAST[id] ? T(CAST[id].name) : ""; }
function hasChapters() { return chapterList().length > 0; }
function hasEndings() { return Object.keys(endingsDone).length > 0; }
function chapterList() {
  return CHAPTERS.filter(function (c) { return !!progress.done[c.id]; });
}
function endingCount() { return Object.keys(endingsDone).length; }

function loadProgress() {
  if (progressLoaded) return;
  game.load("chapters").then(function (p) {
    progressLoaded = true;
    if (!p || p.v !== VERSION || !p.done) return;
    for (var id in p.done) {
      if (Object.prototype.hasOwnProperty.call(p.done, id) && !progress.done[id]) progress.done[id] = p.done[id];
    }
  });
}
function loadEndings() {
  if (endingsLoaded) return;
  game.load("endings").then(function (e) {
    endingsLoaded = true;
    if (!e || e.v !== VERSION || !e.done) return;
    for (var k in e.done) {
      if (Object.prototype.hasOwnProperty.call(e.done, k)) endingsDone[k] = true;
    }
  });
}
function unlockEnding(key) {
  if (!ENDINGS[key]) return;
  endingsDone[key] = true;
  game.save("endings", { v: VERSION, done: endingsDone });
}

/* A chapter snapshot is the state at its card, not at its end: replaying a chapter
   must not inherit choices made inside it. */
function finishChapter(c) {
  if (!c || !c.id || progress.done[c.id]) return;
  progress.done[c.id] = {
    pc: c.pc, flags: copyFlags(c.flags || {}), bg: c.bg || null, bgOpts: c.bgOpts || null,
    left: c.left || null, right: c.right || null, musicKey: c.musicKey || null, chapterNo: c.chapterNo || null
  };
  game.save("chapters", progress);
}
function playChapter(c) {
  var r = progress.done[c.id];
  if (!r) return;
  var st = fresh();
  st.pc = r.pc;
  st.flags = copyFlags(r.flags || {});
  st.bg = r.bg || null;
  st.bgOpts = r.bgOpts || null;
  st.left = r.left || null;
  st.right = r.right || null;
  st.musicKey = r.musicKey || null;
  st.chapterNo = r.chapterNo || null;
  game.go("play", st);
}

function listen(key) {
  var a = STORY.ambience[key] || null, now = a ? a.join(" ") : "";
  if (now === heard) return;
  heard = now;
  game.ambience(a ? a[0] : null, a ? a[1] : 0);
}
function setMusic(key) {
  if (!key || S.musicKey === key) return;
  S.musicKey = key;
  if (MUSIC[key]) game.music(MUSIC[key], { loop: true });
}
function playSfx(key) {
  if (!key) return;
  if (typeof SFX !== "undefined" && SFX[key]) game.sfx(SFX[key]);
  else game.sfx(key);
}
function jump(label) {
  if (!(label in LABELS)) throw new Error("no label " + label);
  S.pc = LABELS[label];
}
function saveRun() { game.save("vn", S); }

function doFx(kind) {
  if (kind === "shake") { game.shake(2, 0.32); playSfx("punch"); }
  else if (kind === "flash") game.flash(0.12);
  else if (kind === "wave") { fxWave = 1.8; playSfx("wave"); }
  else if (kind === "shadow") { fxShadow = 2.0; playSfx("low"); }
  else if (kind === "flicker") fxFlicker = 0.8;
}
function showStamp(key, label) {
  stampKey = key;
  stampLabel = label || null;
  stampUntil = game.time + 4.0;
  if (key === "basin") playSfx("basin");
  else if (key === "fist") playSfx("hit");
}

/* run steps until one needs the player */
function run() {
  for (var guard = 0; guard < 10000; guard++) {
    var s = SCRIPT[S.pc];
    if (!s) { finishChapter(S.chapter); cur = { kind: "end", key: "done", isNew: false }; return; }
    if (s.chapter) {
      finishChapter(S.chapter);
      S.chapter = {
        id: s.chapter, pc: S.pc, flags: copyFlags(S.flags), bg: S.bg, bgOpts: S.bgOpts,
        left: S.left, right: S.right, musicKey: S.musicKey, chapterNo: S.chapterNo
      };
      S.chapterNo = s.no;
      S.chapter.chapterNo = s.no;
      S.pc++;
      saveRun();
      cur = { kind: "chapter", no: T(s.no), title: T(s.title), sub: T(s.sub), art: s.art, t0: game.time };
      return;
    }
    if (s.bg !== undefined) { S.bg = s.bg; S.bgOpts = s.opts || null; S.pc++; listen(s.bg); }
    else if (s.show) {
      S[s.show] = { who: s.who, mood: s.mood || (CAST[s.who] ? CAST[s.who].mood : "tired"), basin: !!s.basin };
      S.pc++;
    } else if (s.hide) { S[s.hide] = null; S.pc++; }
    else if (s.pose) {
      if (S[s.pose]) S[s.pose].mood = s.mood;
      S.pc++;
    } else if (s.stamp) { showStamp(s.stamp, s.label); S.pc++; }
    else if (typeof s.label === "string") S.pc++;
    else if (s.set) { S.flags[s.set] = true; S.pc++; }
    else if (s.unset) { S.flags[s.unset] = false; S.pc++; }
    else if (s.if !== undefined) { if (S.flags[s.if]) jump(s.goto); else S.pc++; }
    else if (s.unless !== undefined) { if (!S.flags[s.unless]) jump(s.goto); else S.pc++; }
    else if (s.goto) jump(s.goto);
    else if (s.sfx) { playSfx(s.sfx); S.pc++; }
    else if (s.music) { setMusic(s.music); S.pc++; }
    else if (s.ambience !== undefined) {
      if (s.ambience) game.ambience(s.ambience[0], s.ambience[1]);
      else game.ambience(null);
      S.pc++;
    }
    else if (s.fx) { doFx(s.fx); S.pc++; }
    else if (s.wait) { S.pc++; cur = { kind: "wait", until: game.time + s.wait }; return; }
    else if (s.say !== undefined) {
      if (s.mood) {
        if (S.left && S.left.who === s.say) S.left.mood = s.mood;
        if (S.right && S.right.who === s.say) S.right.mood = s.mood;
      }
      saveRun();
      var text = T(s.text);
      cur = { kind: "say", who: s.say, text: text, pages: null, page: 0, n: 0 };
      log.push({ who: s.say, text: text });
      if (log.length > 300) log.shift();
      return;
    } else if (s.choice) {
      var items = s.choice.filter(function (c) {
        if (c.if && !S.flags[c.if]) return false;
        if (c.unless && S.flags[c.unless]) return false;
        return true;
      });
      saveRun();
      cur = { kind: "choice", items: items, idx: 0 };
      return;
    } else if (s.end) {
      finishChapter(S.chapter);
      var isNew = !endingsDone[s.end];
      unlockEnding(s.end);
      game.remove("vn");
      cur = { kind: "end", key: s.end, isNew: isNew, t0: game.time };
      if (s.end === "done" || s.end === "leave") {
        game.music(MUSIC.alley, { loop: true });
        game.ambience(s.end === "done" ? "rain" : "wind", 0.25);
      } else {
        game.music(MUSIC.end, { loop: true });
        game.ambience(null);
      }
      playSfx("win");
      return;
    }
    else S.pc++;
  }
}

function ensurePages() {
  if (!cur || cur.kind !== "say" || cur.pages) return;
  var lines = game.g.wrap(cur.text, 150), pages = [];
  for (var i = 0; i < lines.length; i += LINES) pages.push(lines.slice(i, i + LINES));
  cur.pages = pages.length ? pages : [[""]];
}
function pageText() {
  ensurePages();
  return cur.pages[cur.page].join("");
}
function typingDone() {
  return cur && cur.kind === "say" && cur.n >= pageText().length;
}

function advance() {
  if (!cur) return;
  if (cur.kind === "chapter") { playSfx("tap"); cur = null; run(); return; }
  if (cur.kind === "wait") { playSfx("tap"); cur = null; run(); return; }
  if (cur.kind === "say") {
    ensurePages();
    var page = pageText();
    if (cur.n < page.length) { cur.n = page.length; return; }
    if (cur.page < cur.pages.length - 1) { cur.page++; cur.n = 0; playSfx("tick"); return; }
    S.pc++;
    playSfx("tap");
    cur = null;
    run();
    return;
  }
  if (cur.kind === "choice") {
    var c = cur.items[cur.idx];
    if (!c) return;
    log.push({ who: null, text: "> " + T(c.text) });
    if (c.set) S.flags[c.set] = true;
    if (c.unset) S.flags[c.unset] = false;
    playSfx("ok");
    if (c.goto) jump(c.goto); else S.pc++;
    cur = null;
    run();
    return;
  }
  if (cur.kind === "end") { game.go("title"); return; }
}

/* ---------------- layout ---------------- */

function contains(r, x, y) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }

function choiceBox() {
  var n = cur.items.length, rowH = 18, h = n * rowH + 20, y = BOX_Y - h - 4;
  if (y < 2) y = 2;
  return { x: 10, y: y, w: 140, h: h, rowH: rowH, top: y + 6 };
}
function choiceRow(k) {
  var b = choiceBox();
  return { x: b.x + 4, y: b.top + k * b.rowH, w: b.w - 8, h: b.rowH };
}
function titleRow(k) { return { x: 12, y: 65 + k * 16, w: 88, h: 14 }; }
function chapterRow(k) { return { x: 6, y: 18 + k * CH_ROW, w: 148, h: 32 }; }
function endingRow(k) { return { x: 6, y: 18 + k * 18, w: 148, h: 16 }; }

/* ---------------- drawing ---------------- */

function drawPortraits(g) {
  var speaker = cur && cur.kind === "say" ? cur.who : null;
  var talking = cur && cur.kind === "say" && !typingDone();
  var sides = ["left", "right"];
  for (var i = 0; i < 2; i++) {
    var side = sides[i], p = S[side];
    if (!p) continue;
    var x = side === "left" ? 6 : 106, y = 30;
    var isSpeaker = speaker === p.who;
    var speakerShown = speaker && ((S.left && S.left.who === speaker) || (S.right && S.right.who === speaker));
    var bob = isSpeaker ? Math.round(Math.sin(game.time * 1.8 + i) * 1) : 0;
    var blink = ((game.time + i * 0.9) % 4.3) < 0.13;
    ART.portrait(g, p.who, p.mood, x, y, {
      halo: isSpeaker, bob: bob, blink: blink, dim: speakerShown && !isSpeaker,
      basin: p.basin, talk: talking && isSpeaker && p.who === "son", t: game.time
    });
  }
}

function drawStamp(g) {
  if (!stampKey || game.time >= stampUntil) return;
  var age = 4.0 - (stampUntil - game.time);
  var off = age < 0.22 ? Math.round((1 - age / 0.22) * 6) : 0;
  var x = 126, y = 4 + off;
  ART.stamp(g, stampKey, x, y, stampLabel);
}

function drawChapterMark(g) {
  if (!S.chapterNo) return;
  g.rect(4, 4, 17, 15, g.PAPER);
  g.frame(4, 4, 17, 15, g.INK);
  g.rect(5, 18, 15, 1, g.DARK);
  g.text(T(S.chapterNo), 12, 5, { align: "center", color: g.INK });
}

function drawDialogue(g) {
  g.rect(1, 89, 158, 54, g.PAPER);
  g.frame(0, 88, 160, 56, g.INK);
  g.rect(2, 90, 156, 1, g.MID);
  g.rect(2, 141, 156, 1, g.DARK);
  /* a small paper notch at the top-right */
  g.rect(148, 88, 8, 1, g.PAPER);
  g.rect(154, 89, 4, 4, g.DARK);
  if (!cur || cur.kind !== "say") return;
  ensurePages();
  var name = who(cur.who);
  if (name) {
    var w = game.g.measure(name) + 10;
    g.rect(4, 80, w, 13, g.PAPER);
    g.frame(4, 80, w, 13, g.INK);
    g.rect(5, 92, w - 2, 1, g.DARK);
    g.text(name, 9, 81, { color: g.INK });
  }
  var left = Math.floor(cur.n), pg = cur.pages[cur.page];
  for (var j = 0; j < pg.length && left > 0; j++) {
    g.text(pg[j].slice(0, left), 5, 93 + j * g.lineHeight, { color: g.INK });
    left -= pg[j].length;
  }
  if (typingDone() && Math.floor(game.time * 3) % 2) g.arrow(150, 134, "down", g.INK);
}

function drawChoice(g) {
  var b = choiceBox();
  g.rect(b.x + 2, b.y + 2, b.w, b.h, g.DARK);
  g.rect(b.x, b.y, b.w, b.h, g.PAPER);
  g.frame(b.x, b.y, b.w, b.h, g.INK);
  g.rect(b.x + 2, b.y + 2, b.w - 4, 1, g.MID);
  cur.items.forEach(function (c, k) {
    var row = choiceRow(k), sel = k === cur.idx;
    if (sel) g.rect(row.x, row.y, row.w, row.h, g.INK);
    else g.rect(row.x, row.y, row.w, row.h, g.PAPER);
    g.text(T(c.text), row.x + 8, row.y + 2, { width: 120, color: sel ? g.PAPER : g.INK });
    if (sel) g.rect(row.x + 3, row.y + 5, 2, 6, g.PAPER);
  });
  g.text(T({ zh: "↑↓ 选　A 确定", en: "Up/Dn  A: choose" }), b.x + 10, b.y + b.h - 12, { color: g.INK });
}

function drawChapter(g) {
  ART.card(g, cur.art, game.time);
  var k = Math.min(1, (game.time - cur.t0) / 0.35);
  var off = Math.round((1 - k) * 18);
  g.origin(0, off);
  g.rect(10, 80, 140, 58, g.PAPER);
  g.rect(12, 82, 136, 58, g.DARK);
  g.rect(10, 80, 140, 58, g.PAPER);
  g.frame(10, 80, 140, 58, g.INK);
  g.rect(12, 82, 136, 1, g.MID);
  /* number block */
  g.rect(14, 84, 24, 24, g.INK);
  g.text(cur.no, 26, 89, { align: "center", color: g.PAPER });
  g.text(cur.title, 44, 85, { color: g.INK });
  g.text(cur.title, 45, 85, { color: g.INK });
  g.text(cur.sub, 44, 101, { width: 100, color: g.INK });
  g.rect(44, 119, 30, 1, g.DARK);
  g.text(T({ zh: "A 继续", en: "A: continue" }), 44, 122, { color: g.INK });
  g.origin(0, 0);
}

function drawEnding(g) {
  var e = ENDINGS[cur.key] || ENDINGS.done;
  ART.ending(g, e.art, game.time);
  var k = Math.min(1, (game.time - (cur.t0 || game.time)) / 0.5);
  var off = Math.round((1 - k) * 24);
  g.origin(0, off);
  g.rect(8, 74, 144, 64, g.PAPER);
  g.frame(8, 74, 144, 64, g.INK);
  g.rect(10, 76, 140, 1, g.MID);
  g.rect(124, 78, 26, 26, g.INK);
  g.text(T({ zh: "终", en: "END" }), 137, 83, { align: "center", color: g.PAPER });
  g.text(T({ zh: "结局 " + e.no + "/5", en: "Ending " + e.no + "/5" }), 12, 78, { color: g.INK });
  if (cur.isNew) g.text(T({ zh: "新", en: "NEW" }), 82, 78, { color: g.INK });
  g.text(T(e.title), 12, 92, { color: g.INK });
  g.text(T(e.title), 13, 92, { color: g.INK });
  g.text(T(e.sub), 12, 106, { width: 132, color: g.INK });
  g.rect(12, 122, 32, 1, g.DARK);
  g.text(T({ zh: "A 回到标题", en: "A: title" }), 12, 124, { color: g.INK });
  g.origin(0, 0);
}

function drawLog(g) {
  g.rect(0, 0, 160, 144, g.PAPER);
  g.rect(0, 0, 160, 16, g.INK);
  g.text(T({ zh: "回看  ↑↓ 翻  B 返回", en: "Log  Up/Dn  B: back" }), 4, 1, { color: g.PAPER });
  var y = 20;
  for (var i = logTop; i < log.length && y < 138; i++) {
    var e = log[i], name = who(e.who);
    var line = name ? name + "：" + e.text : e.text;
    var lines = g.wrap(line, 152);
    for (var k = 0; k < lines.length && y < 138; k++) {
      g.text(lines[k], 4, y, { color: g.INK });
      y += g.lineHeight;
    }
    y += 2;
  }
  if (logTop >= log.length) g.text(T({ zh: "（没有更多）", en: "(end)" }), 80, 130, { align: "center", color: g.DARK });
}

function drawFx(g) {
  if (fxWave > 0) {
    var rise = (1 - fxWave / 1.8) * 86;
    for (var x = 0; x < 160; x += 2) {
      var top = 128 - rise + Math.round(Math.sin(x * 0.09 + game.time * 3) * 6);
      if (top < 88) {
        g.dither(x, top, 2, 88 - top, g.MID, 1);
        g.rect(x, top, 2, 1, g.PAPER);
      }
    }
  }
  if (fxShadow > 0) {
    var k = 1 - fxShadow / 2.0;
    var h = 30 + Math.round(k * 34);
    g.circle(120, 30, 9, g.INK, true);
    g.rect(108, 40, 24, h, g.INK);
    g.line(108, 46, 96, 34, g.INK);
    g.line(132, 46, 144, 34, g.INK);
    g.rect(112, 40 + h, 6, 20, g.INK);
    g.rect(124, 40 + h, 6, 20, g.INK);
  }
  if (fxFlicker > 0 && Math.floor(game.time * 24) % 7 === 0) {
    g.dither(0, 0, 160, 88, g.INK, 1);
  }
}

/* ---------------- scenes ---------------- */

game.scene("play", {
  enter: function (saved) {
    S = saved && saved.v === VERSION ? saved : fresh();
    if (!S.flags) S.flags = {};
    if (!S.chapterNo) S.chapterNo = null;
    log = []; view = "play"; logTop = 0;
    stampKey = null; stampUntil = 0;
    fxWave = 0; fxShadow = 0; fxFlicker = 0;
    cur = null;
    if (S.bg) listen(S.bg);
    var mk = S.musicKey;
    S.musicKey = null;
    setMusic(mk || "title");
    run();
  },
  update: function (dt) {
    if (fxWave > 0) fxWave = Math.max(0, fxWave - dt);
    if (fxShadow > 0) fxShadow = Math.max(0, fxShadow - dt);
    if (fxFlicker > 0) fxFlicker = Math.max(0, fxFlicker - dt);
    if (toastUntil && game.time > toastUntil) toastText = null;

    if (view === "log") {
      if (game.repeat("up")) logTop = Math.max(0, logTop - 1);
      if (game.repeat("down")) logTop = Math.min(Math.max(0, log.length - 1), logTop + 1);
      if (game.pressed("b") || game.pressed("a") || game.pressed("start") || game.pointer.pressed) {
        view = "play"; playSfx("tap");
      }
      return;
    }
    if (game.pressed("select")) {
      if (hasChapters()) { playSfx("tap"); game.go("chapters", "play"); }
      else { toastText = T({ zh: "还没有读完的章节", en: "No chapters finished yet" }); toastUntil = game.time + 2; playSfx("err"); }
      return;
    }
    if (game.pressed("b") && cur.kind !== "end" && cur.kind !== "chapter") {
      view = "log"; logTop = Math.max(0, log.length - 4); playSfx("tap"); return;
    }
    if (cur.kind === "say") cur.n += dt * SPEED;
    if (cur.kind === "choice") {
      if (game.repeat("up")) { cur.idx = (cur.idx + cur.items.length - 1) % cur.items.length; playSfx("move"); }
      if (game.repeat("down")) { cur.idx = (cur.idx + 1) % cur.items.length; playSfx("move"); }
    }
    if (game.pointer.pressed && cur.kind === "choice") {
      for (var k = 0; k < cur.items.length; k++) {
        if (contains(choiceRow(k), game.pointer.x, game.pointer.y)) {
          cur.idx = k; advance(); return;
        }
      }
      return;
    }
    if (game.pressed("a") || game.pressed("start") || (game.pointer.pressed && cur.kind !== "choice")) {
      advance();
      return;
    }
    if (cur.kind === "wait" && game.time >= cur.until) { cur = null; run(); }
  },
  draw: function (g) {
    if (cur && cur.kind === "end") { drawEnding(g); return; }
    if (cur && cur.kind === "chapter") { drawChapter(g); return; }
    if (S.bg) ART.bg(g, S.bg, game.time, S.bgOpts || {});
    else { g.clear(g.PAPER); g.dither(0, 0, 160, 144, g.MID, 1); }
    drawFx(g);
    drawPortraits(g);
    drawStamp(g);
    if (view === "log") { drawLog(g); return; }
    drawChapterMark(g);
    if (cur && cur.kind === "say") drawDialogue(g);
    else if (cur && cur.kind === "choice") drawChoice(g);
    else if (cur && cur.kind === "wait") {
      g.rect(0, 88, 160, 56, g.PAPER);
      g.frame(0, 88, 160, 56, g.INK);
    }
    if (toastText) {
      var w = Math.min(150, game.g.measure(toastText) + 12);
      g.rect(80 - Math.round(w / 2), 70, w, 16, g.PAPER);
      g.frame(80 - Math.round(w / 2), 70, w, 16, g.INK);
      g.text(toastText, 80, 72, { align: "center", color: g.INK });
    }
  }
});

game.scene("title", {
  enter: function () {
    titleT = game.time;
    titleMenu = 0;
    titleSave = null;
    game.load("vn").then(function (v) {
      if (v && v.v === VERSION) titleSave = v;
    });
    loadProgress();
    loadEndings();
    game.ambience("rain", 0.45);
    game.music(MUSIC.title, { loop: true });
  },
  update: function () {
    if (game.pressed("select")) {
      if (hasChapters()) { playSfx("tap"); game.go("chapters", "title"); }
      else { toastText = T({ zh: "还没有读完的章节", en: "No chapters finished yet" }); toastUntil = game.time + 2; playSfx("err"); }
      return;
    }
    var items = titleItems();
    if (titleMenu >= items.length) titleMenu = 0;
    if (game.repeat("up")) { titleMenu = (titleMenu + items.length - 1) % items.length; playSfx("move"); }
    if (game.repeat("down")) { titleMenu = (titleMenu + 1) % items.length; playSfx("move"); }
    if (game.pointer.pressed) {
      var hit = -1;
      for (var k = 0; k < items.length; k++) if (contains(titleRow(k), game.pointer.x, game.pointer.y)) { hit = k; break; }
      if (hit < 0) return;
      titleMenu = hit;
    } else if (!game.pressed("a") && !game.pressed("start")) return;
    var it = items[titleMenu];
    playSfx("ok");
    if (it.act === "continue") game.go("play", titleSave);
    else if (it.act === "new") { game.remove("vn"); game.go("play", null); }
    else if (it.act === "endings") game.go("endings");
  },
  draw: function (g) {
    ART.bg(g, "title_alley", game.time, {});
    var k = Math.min(1, (game.time - titleT) / 0.6);
    var off = Math.round((1 - k) * -18);
    g.origin(0, off);
    g.rect(4, 6, 92, 50, g.PAPER);
    g.frame(4, 6, 92, 50, g.INK);
    g.rect(6, 8, 88, 1, g.MID);
    g.text(T(STORY.title), 7, 10, { width: 86, color: g.INK });
    g.text(T(STORY.title), 8, 10, { width: 86, color: g.INK });
    g.text(T(STORY.sub), 7, 29, { width: 86, color: g.INK });
    g.origin(0, 0);
    g.rect(100, 6, 22, 22, g.PAPER);
    g.frame(100, 6, 22, 22, g.INK);
    g.rect(102, 8, 18, 18, g.INK);
    g.text("锤", 111, 10, { align: "center", color: g.PAPER });
    /* the boy, close up, with the basin */
    g.dither(98, 30, 58, 66, g.PAPER, 1);
    ART.portrait(g, "son", "deadpan", 104, 32, { basin: true, halo: false, bob: 0, blink: ((game.time % 4.3) < 0.13), talk: false, t: game.time });
    var items = titleItems();
    var ph = items.length * 16 + 10;
    g.rect(8, 60, 96, ph, g.PAPER);
    g.frame(8, 60, 96, ph, g.INK);
    g.rect(10, 62, 92, 1, g.MID);
    items.forEach(function (it, i2) {
      var row = titleRow(i2), sel = i2 === titleMenu;
      if (sel) g.rect(11, row.y, 90, 14, g.INK);
      g.text(T(it.label), 18, row.y + 1, { color: sel ? g.PAPER : g.INK });
      if (sel) g.rect(14, row.y + 4, 2, 6, g.PAPER);
    });
    /* footer */
    g.rect(0, 118, 160, 26, g.PAPER);
    g.line(0, 118, 160, 118, g.INK);
    g.text(T({ zh: "↑↓ 选　A 确定", en: "Up/Dn  A: OK" }), 80, 119, { align: "center", color: g.INK });
    g.text(T({ zh: "B 回看　SELECT 选章", en: "B log　SELECT chapters" }), 80, 131, { align: "center", color: g.INK });
    if (toastText && game.time < toastUntil) {
      var tw = Math.min(150, game.g.measure(toastText) + 12);
      g.rect(80 - Math.round(tw / 2), 70, tw, 16, g.PAPER);
      g.frame(80 - Math.round(tw / 2), 70, tw, 16, g.INK);
      g.text(toastText, 80, 72, { align: "center", color: g.INK });
    }
  }
});

function titleItems() {
  var items = [];
  if (titleSave && titleSave.v === VERSION) items.push({ label: { zh: "继续", en: "Continue" }, act: "continue" });
  items.push({ label: titleSave && titleSave.v === VERSION ? { zh: "从头开始", en: "New story" } : { zh: "开始", en: "Start" }, act: "new" });
  if (hasEndings()) items.push({ label: { zh: "结局", en: "Endings" }, act: "endings" });
  return items;
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
        playSfx("tap"); leaveChapters();
      }
      return;
    }
    if (game.repeat("up")) { chIdx = (chIdx + list.length - 1) % list.length; playSfx("move"); }
    if (game.repeat("down")) { chIdx = (chIdx + 1) % list.length; playSfx("move"); }
    if (chIdx < chTop) chTop = chIdx;
    if (chIdx >= chTop + CH_VISIBLE) chTop = chIdx - CH_VISIBLE + 1;
    if (game.pressed("a") || game.pressed("start")) { playSfx("ok"); playChapter(list[chIdx]); return; }
    if (game.pressed("b") || game.pressed("select")) { playSfx("tap"); leaveChapters(); }
  },
  draw: function (g) {
    g.clear(g.PAPER);
    g.dither(0, 0, 160, 144, g.MID, 1);
    g.rect(0, 0, 160, 16, g.INK);
    g.text(T({ zh: "选择章节", en: "Chapters" }), 4, 1, { color: g.PAPER });
    var list = chapterList();
    if (!list.length) {
      g.text(T({ zh: "还没有读完的章节", en: "No chapters finished yet" }), 80, 60, { align: "center", color: g.INK });
      g.text(T({ zh: "B 返回", en: "B: back" }), 80, 130, { align: "center", color: g.INK });
      return;
    }
    for (var k = 0; k < CH_VISIBLE && chTop + k < list.length; k++) {
      var c = list[chTop + k], row = chapterRow(k), sel = chTop + k === chIdx;
      if (sel) g.rect(row.x, row.y, row.w, row.h, g.INK);
      else { g.rect(row.x, row.y, row.w, row.h, g.PAPER); g.frame(row.x, row.y, row.w, row.h, g.INK); }
      var col = sel ? g.PAPER : g.INK;
      g.text(T(c.no) + "  " + T(c.title), row.x + 6, row.y + 2, { color: col });
      if (c.sub) g.text(T(c.sub), row.x + 6, row.y + 17, { color: sel ? g.PAPER : g.DARK });
      if (sel) g.rect(row.x + 2, row.y + 5, 2, 12, g.PAPER);
    }
    g.text(T({ zh: "↑↓ 选　A 进入　B 返回", en: "Up/Dn  A: go  B: back" }), 80, 132, { align: "center", color: g.INK });
  }
});

function leaveChapters() {
  if (chFrom === "play" && chBack) game.go("play", chBack);
  else game.go("title");
}

game.scene("endings", {
  enter: function () {
    endIdx = 0;
    loadEndings();
    game.ambience(null);
    game.music(MUSIC.end, { loop: true });
  },
  update: function () {
    if (game.repeat("up")) { endIdx = (endIdx + ENDING_ORDER.length - 1) % ENDING_ORDER.length; playSfx("move"); }
    if (game.repeat("down")) { endIdx = (endIdx + 1) % ENDING_ORDER.length; playSfx("move"); }
    if (game.pressed("b") || game.pressed("a") || game.pressed("start") || game.pressed("select") || game.pointer.pressed) {
      playSfx("tap"); game.go("title");
    }
  },
  draw: function (g) {
    g.clear(g.PAPER);
    g.dither(0, 0, 160, 144, g.MID, 1);
    g.rect(0, 0, 160, 16, g.INK);
    g.text(T({ zh: "结局  " + endingCount() + "/5", en: "Endings  " + endingCount() + "/5" }), 4, 1, { color: g.PAPER });
    g.text(T({ zh: "A/B 返回", en: "A/B back" }), 156, 1, { align: "right", color: g.PAPER });
    for (var k = 0; k < ENDING_ORDER.length; k++) {
      var key = ENDING_ORDER[k], e = ENDINGS[key], row = endingRow(k), got = !!endingsDone[key], sel = k === endIdx;
      if (sel) g.rect(row.x, row.y, row.w, row.h, g.INK);
      else { g.rect(row.x, row.y, row.w, row.h, g.PAPER); g.frame(row.x, row.y, row.w, row.h, g.INK); }
      var col = sel ? g.PAPER : g.INK;
      var label = got ? (e.no + "  " + T(e.title)) : T({ zh: "？  未解锁", en: "?  locked" });
      g.text(label, row.x + 6, row.y + 2, { color: col });
      if (sel) g.rect(row.x + 2, row.y + 4, 2, 8, g.PAPER);
    }
    var selKey = ENDING_ORDER[endIdx], selE = ENDINGS[selKey], selGot = !!endingsDone[selKey];
    g.rect(6, 110, 148, 30, g.PAPER);
    g.frame(6, 110, 148, 30, g.INK);
    g.rect(8, 112, 144, 1, g.MID);
    var detail = selGot ? T(selE.sub) : T({ zh: "读到最后就知道了。", en: "Read to the end." });
    g.text(detail, 10, 114, { width: 140, color: g.INK });
    g.text(T({ zh: "↑↓ 选　A/B 返回", en: "Up/Dn  A/B: back" }), 80, 128, { align: "center", color: g.INK });

  }
});

game.start("title");
