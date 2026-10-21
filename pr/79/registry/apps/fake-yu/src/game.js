/* fake-yu / game.js — 滥竽充数, a one-key rhythm game for Lo-PDA.
 *
 * The joke is the mechanic: you are the extra player at the back of a 300-player royal
 * orchestra. Play the notes, but when the king's eye opens, freeze. The music and the chart
 * come from src/music.js; this file is the stage, the timing and the comedy.
 *
 * MIT License. Copyright (c) 2026 Haowei Wu.
 */

var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";
var INK = 0, DARK = 1, MID = 2, PAPER = 3;
var SAVE_KEY = "save";
var PERFECT = 0.10, GOOD = 0.20, EARLY = 0.35;

var profile = { best: {}, cleared: {}, ending: false, finaled: false };
var loaded = false;

function tt(zh, en) { return T({ zh: zh, en: en }); }

var TX = {
  title: { zh: "滥竽充数", en: "Fake Yu" },
  subtitle: { zh: "南郭先生升职记", en: "Royal orchestra" },
  start: { zh: "开始演奏", en: "Perform" },
  songs: { zh: "选曲", en: "Songs" },
  howto: { zh: "怎么玩", en: "How to play" },
  titleKeys: { zh: "↑↓ 选　A 好", en: "UP/DOWN pick  A ok" },
  songKeys: { zh: "↑↓ 选　A 演奏　B 返回", en: "UP/DOWN  A play  B back" },
  fresh: { zh: "未演", en: "NEW" },
  howTitle: { zh: "怎么玩", en: "How to play" },
  howKeys: { zh: "A 下一页　B 返回", en: "A next  B back" },
  howDone: { zh: "A 回标题", en: "A title" },
  how1: { zh: "音符到竖线时按 A。长条按住，到尾再松。", en: "Press A as a note crosses the line. Hold long bars to the end." },
  how2: { zh: "国王的眼睛睁开时，千万别按。按一次涨怀疑，满 100 就露馅。", en: "Eye open? Don't press. Presses raise suspicion; at 100 you're caught." },
  how3: { zh: "混在三百人里，连击越高，观众越高兴。三首演完，南郭就升职。", en: "Blend into the crowd. A long combo pleases them. Finish all three songs to get promoted." },
  ready: { zh: "准备", en: "READY" },
  go: { zh: "开始！", en: "GO!" },
  watchWarn: { zh: "王上看过来了", en: "King is watching" },
  watch: { zh: "别吹！", en: "DON'T PLAY!" },
  again: { zh: "继续", en: "AGAIN" },
  caught: { zh: "露馅！", en: "CAUGHT!" },
  perfect: { zh: "完美", en: "PERFECT" },
  good: { zh: "不错", en: "GOOD" },
  miss: { zh: "漏了", en: "MISS" },
  early: { zh: "早了", en: "EARLY" },
  noise: { zh: "杂音", en: "NOISE" },
  broken: { zh: "破了", en: "BROKEN" },
  hold: { zh: "按住", en: "HOLD" },
  cheer: { zh: "全场喝彩", en: "CHEERS!" },
  success: { zh: "演出成功", en: "PERFORMANCE!" },
  failed: { zh: "被赶出宫", en: "THROWN OUT" },
  score: { zh: "得分", en: "SCORE" },
  maxCombo: { zh: "最高连击", en: "MAX COMBO" },
  accuracy: { zh: "准确", en: "ACCURACY" },
  suspicion: { zh: "怀疑", en: "SUSPICION" },
  next: { zh: "下一曲", en: "Next" },
  retry: { zh: "重来", en: "Retry" },
  choose: { zh: "选曲", en: "Songs" },
  curtain: { zh: "谢幕", en: "End" },
  resultKeys: { zh: "←→ 选　A 好　B 选曲", en: "←→ pick  A ok  B songs" },
  failTip: { zh: "国王睁眼时，别按。", en: "King looks? Freeze." },
  newBest: { zh: "新纪录", en: "NEW BEST" },
  endingTitle: { zh: "剧终", en: "THE END" },
  end1: { zh: "齐湣王：你居然真会吹。", en: "King Min: So you can actually play." },
  end2: { zh: "南郭：……略懂。", en: "Nan Guo: ...A little." },
  end3: { zh: "从此，南郭先生成了宫廷乐师。至于他到底会不会吹，只有他自己知道。", en: "And so Nan Guo became court musician. Whether he could really play, only he knows." },
  endSeen: { zh: "南郭先生又回到了台上。", en: "Nan Guo is back on stage." }
};

/* ---------- tiny 3x5 pixel type for big numbers, ranks and key caps ---------- */
var F35 = {
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
  "A": ["010", "101", "111", "101", "101"], "B": ["110", "101", "110", "101", "110"],
  "C": ["011", "100", "100", "100", "011"], "S": ["011", "100", "010", "001", "110"],
  "X": ["101", "101", "010", "101", "101"], "!": ["010", "010", "010", "000", "010"],
  "?": ["111", "001", "011", "000", "010"], "-": ["000", "000", "111", "000", "000"]
};
function glyph(g, ch, x, y, s, tone) {
  var rows = F35[ch];
  if (!rows) return 4 * s;
  for (var r = 0; r < 5; r++) for (var c = 0; c < 3; c++) {
    if (rows[r].charAt(c) === "1") g.rect(x + c * s, y + r * s, s, s, tone);
  }
  return 4 * s;
}
function bigText(g, str, x, y, s, tone, align) {
  var w = str.length * 4 * s - s;
  var cx = x;
  if (align === "center") cx = Math.round(x - w / 2);
  else if (align === "right") cx = x - w;
  for (var i = 0; i < str.length; i++) { glyph(g, str.charAt(i), cx, y, s, tone); cx += 4 * s; }
  return w;
}
function keycap(g, label, x, y, s) {
  var w = 3 * s + 4, h = 5 * s + 4;
  g.rect(x, y, w, h, PAPER); g.frame(x, y, w, h, INK);
  glyph(g, label, x + 2, y + 2, s, INK);
  return w;
}

/* ---------- save ---------- */
function loadProfile() {
  return game.load(SAVE_KEY).then(function (v) {
    if (v && typeof v === "object") {
      profile.best = v.best || {};
      profile.cleared = v.cleared || {};
      profile.ending = !!v.ending;
      profile.finaled = !!v.finaled;
    }
    loaded = true;
  }).catch(function () { loaded = true; });
}
function saveProfile() { game.save(SAVE_KEY, profile); }
function clearedCount() { var n = 0; FAKE_SONGS.forEach(function (s) { if (profile.cleared[s.id]) n++; }); return n; }
function rankLetter(acc, miss, suspicion, failed) {
  if (failed) return "C";
  if (acc >= 0.95 && miss <= 2 && suspicion <= 20) return "S";
  if (acc >= 0.86) return "A";
  if (acc >= 0.70) return "B";
  return "C";
}
function rankName(r) { return tt({ S: "名角", A: "好手", B: "凑合", C: "露馅" }[r] || "露馅", { S: "STAR", A: "GOOD", B: "OK", C: "OOPS" }[r] || "OOPS"); }

/* ---------- shared art ---------- */
function drawDrape(g, x, w) {
  g.rect(x, 16, w, 82, INK);
  for (var i = 2; i < w; i += 4) g.rect(x + i, 16, 2, 82, DARK);
  for (i = 0; i < w; i += 6) {
    g.rect(x + i, 92, 6, 2, MID);
    g.rect(x + i + 1, 94, 4, 2, INK);
  }
}
function drawKing(g, cx, cy, open, look) {
  /* a silhouette with a crown; open: 0 closed, 1 a slit, 2 wide */
  g.rect(cx - 7, cy + 2, 14, 7, INK);
  g.rect(cx - 5, cy - 2, 10, 5, INK);
  g.rect(cx - 5, cy - 5, 2, 2, INK); g.rect(cx - 1, cy - 6, 2, 3, INK); g.rect(cx + 3, cy - 5, 2, 2, INK);
  if (open) {
    var h = open === 1 ? 1 : 3;
    g.rect(cx - 4, cy, 3, h, PAPER);
    g.rect(cx + 1, cy, 3, h, PAPER);
    if (open === 2) { g.rect(cx - 3 + (look || 0), cy, 1, h, INK); g.rect(cx + 2 + (look || 0), cy, 1, h, INK); }
  } else {
    g.rect(cx - 4, cy + 1, 3, 1, MID); g.rect(cx + 1, cy + 1, 3, 1, MID);
  }
}
function drawEye(g, x, y, w, h, lid) {
  /* an almond eye; lid 0 closed ... 1 open */
  var open = Math.max(0, Math.min(1, lid));
  var hh = Math.max(1, Math.round(h * open));
  var cy = y + Math.round(h / 2);
  for (var i = 0; i < w; i++) {
    var u = (i + 0.5) / w, half = Math.round((hh / 2) * Math.sin(Math.PI * u));
    if (half < 1) { g.pixel(x + i, cy, INK); continue; }
    g.rect(x + i, cy - half, 1, half * 2 + 1, PAPER);
    g.pixel(x + i, cy - half, INK);
    g.pixel(x + i, cy + half, INK);
  }
  if (open > 0.45) {
    var px = x + Math.round(w / 2), r = Math.max(1, Math.round(hh / 4));
    g.circle(px, cy, r, INK, true);
    g.rect(px - r, cy, Math.max(1, r - 1), 1, INK);
    g.pixel(px - 1, cy - 1, PAPER);
  }
}
function drawPlayer(g, x, y, puff, sweat, arms) {
  /* 24x28, facing right; the sheng is the little bundle at the mouth */
  g.rect(x + 4, y + 24, 4, 4, INK); g.rect(x + 12, y + 24, 4, 4, INK);
  g.rect(x + 2, y + 13, 16, 12, MID); g.frame(x + 2, y + 13, 16, 12, INK);
  g.rect(x + 4, y + 6, 12, 8, PAPER); g.frame(x + 4, y + 6, 12, 8, INK);
  g.rect(x + 6, y + 9, 2, 2, INK); g.rect(x + 11, y + 9, 2, 2, INK);
  g.rect(x + 7, y + 13, 5, 1, INK);
  g.rect(x + 1, y + 2, 18, 4, INK);
  g.rect(x + 3, y, 14, 3, INK);
  /* arms and sheng */
  var ay = puff ? y + 9 : y + 12;
  g.rect(x + 15, ay, 7, 2, INK);
  g.rect(x + 20, y + 2, 2, 10, INK);
  g.rect(x + 22, y + 1, 2, 12, MID);
  g.rect(x + 24, y + 4, 2, 7, INK);
  if (puff) {
    g.circle(x + 17, y + 9, 2, MID, true);
    g.rect(x + 26, y + 8, 3, 1, INK);
    g.rect(x + 28, y + 7, 2, 1, MID);
    g.rect(x + 28, y + 10, 2, 1, MID);
  }
  if (sweat) { g.rect(x + 15, y + 5, 1, 2, PAPER); g.rect(x + 16, y + 7, 1, 1, PAPER); }
  if (arms) { g.rect(x + 1, y + 2, 2, 7, INK); g.rect(x + 19, y + 2, 2, 7, INK); }
}
function drawConductor(g, x, y, beat, tone) {
  tone = tone == null ? INK : tone;
  var swing = Math.sin(beat * Math.PI * 2);
  g.rect(x + 5, y + 8, 12, 14, tone);
  g.rect(x + 6, y + 2, 10, 7, PAPER); g.frame(x + 6, y + 2, 10, 7, INK);
  g.rect(x + 8, y + 4, 1, 1, INK); g.rect(x + 12, y + 4, 1, 1, INK);
  g.rect(x + 4, y + 1, 14, 3, tone);
  g.rect(x + 3, y + 10, 5, 2, tone);
  g.line(x + 3, y + 11, x - 3 + Math.round(swing * 2), y + 1 + Math.round(swing * 5), MID);
  g.rect(x - 2 + Math.round(swing * 2), y + Math.round(swing * 5), 2, 2, tone);
  g.rect(x + 8, y + 22, 3, 3, tone); g.rect(x + 13, y + 22, 3, 3, tone);
}
function drawAudience(g, beat, happy, clap) {
  g.rect(0, 120, 160, 24, INK);
  g.rect(0, 120, 160, 2, DARK);
  for (var row = 0; row < 2; row++) {
    for (var i = 0; i < 8; i++) {
      var x = 2 + i * 20 + (row ? 10 : 0), y = 126 + row * 8;
      var b = Math.round(Math.sin((beat + i * 0.13 + row * 0.3) * Math.PI * 2) * 1);
      g.circle(x + 5, y + 3 + b, 4, DARK, true);
      g.rect(x + 1, y + 6 + b, 9, 5, DARK);
      if (happy) { g.rect(x - 2, y + 1 + b, 3, 1, MID); g.rect(x + 10, y + 1 + b, 3, 1, MID); }
      if (clap && Math.floor(beat * 4 + i) % 2) { g.rect(x + 2, y + 6 + b, 2, 2, MID); }
    }
  }
}
function drawHall(g, beat, opts) {
  opts = opts || {};
  g.clear(PAPER);
  g.rect(0, 16, 160, 80, DARK);
  g.rect(0, 16, 160, 1, INK);
  for (var x = 14; x < 148; x += 34) {
    g.frame(x, 20, 28, 60, MID);
    g.rect(x + 2, 22, 24, 56, DARK);
    g.rect(x + 12, 24, 4, 54, MID);
  }
  g.rect(0, 92, 160, 28, INK);
  g.rect(0, 92, 160, 2, MID);
  drawDrape(g, 0, 14); drawDrape(g, 146, 14);
  /* royal box */
  g.rect(54, 17, 52, 17, PAPER);
  g.frame(54, 17, 52, 17, INK);
  g.rect(55, 18, 2, 15, DARK); g.rect(103, 18, 2, 15, DARK);
  drawKing(g, 80, 25, opts.kingEye || 0, opts.look || 0);
  /* chandelier */
  g.line(80, 16, 80, 20, INK);
  g.rect(74, 20, 13, 2, INK);
  g.rect(76, 22, 1, 3, MID); g.rect(80, 22, 1, 4, MID); g.rect(84, 22, 1, 3, MID);
  drawAudience(g, beat, opts.happy, opts.clap);
}
function drawScroll(g) {
  g.rect(3, 34, 154, 60, PAPER);
  g.frame(3, 34, 154, 60, INK);
  g.rect(0, 36, 4, 56, MID); g.rect(156, 36, 4, 56, MID);
  g.frame(6, 37, 148, 54, MID);
  for (var i = 0; i < 5; i++) g.rect(10, 48 + i * 8, 138, 1, MID);
  /* rolled ends */
  g.rect(0, 35, 4, 2, INK); g.rect(0, 93, 4, 2, INK);
  g.rect(156, 35, 4, 2, INK); g.rect(156, 93, 4, 2, INK);
  /* a little flourish at the left end of the staff */
  g.line(8, 48, 8, 80, DARK);
  g.circle(8, 64, 2, DARK, false);
}
function drawMouth(g, puff) {
  g.rect(36, 84, 6, 3, INK);
  g.rect(34, 86, 4, 3, MID);
  if (puff) { g.rect(42, 84, 3, 1, INK); g.rect(43, 86, 2, 1, INK); }
}
function drawSuspicion(g, value) {
  /* an eye, then five pips; value 0..100 */
  var x = 112, y = 5;
  drawEye(g, x, y, 9, 5, 1);
  for (var i = 0; i < 5; i++) {
    var on = value > i * 20;
    g.rect(124 + i * 6, 4, 5, 7, PAPER);
    g.frame(124 + i * 6, 4, 5, 7, MID);
    if (on) g.rect(125 + i * 6, 5, 3, 5, INK);
  }
}

/* ---------- boot ---------- */
game.scene("boot", {
  enter: function () {
    if (loaded) { game.go("title", null, { fade: false }); return; }
    loadProfile().then(function () { game.go("title", null, { fade: false }); });
  },
  draw: function (g) {
    g.clear(PAPER);
    g.text(tt("登录中", "Loading"), 80, 66, { align: "center" });
    for (var i = 0; i < 3; i++) g.rect(70 + i * 8, 82, 4, 4, Math.floor(game.time * 4) % 3 === i ? INK : MID);
  }
});

/* ---------- title ---------- */
var titleSel = 0, titleLock = 0;
game.scene("title", {
  enter: function () {
    titleSel = 0;
    titleLock = game.time + 0.12;
    game.musicStop();
    game.ambience(null);
  },
  update: function () {
    var d = game.dir().y;
    if (d) { titleSel = (titleSel + d + 3) % 3; game.sfx("move"); }
    var canGo = game.time >= titleLock;
    var go = canGo && (game.pressed("a") || game.pressed("start"));
    if (canGo && game.pointer.pressed && game.pointer.y >= 95) {
      var i = Math.floor((game.pointer.y - 95) / 16);
      if (i >= 0 && i < 3 && game.pointer.y < 143) { titleSel = i; go = true; }
    }
    if (go) {
      game.sfx("tap");
      if (titleSel === 0) startNext();
      else if (titleSel === 1) game.go("select");
      else game.go("howto");
    }
  },
  draw: function (g) {
    var beat = game.time * 0.8;
    drawHall(g, beat, { happy: clearedCount() === 3, kingEye: 0 });
    /* top strip: keys and the three cleared lights */
    g.text(T(TX.titleKeys), 5, 2, { color: DARK });
    for (var k = 0; k < 3; k++) {
      var lit = profile.cleared[FAKE_SONGS[k].id];
      g.rect(130 + k * 8, 5, 6, 5, lit ? INK : MID);
    }
    /* title plaque */
    g.window(24, 21, 112, 33);
    g.text(T(TX.title), 80, 25, { align: "center" });
    g.text(T(TX.subtitle), 80, 38, { align: "center", color: DARK });
    /* the two would-be musicians */
    drawPlayer(g, 10, 62, false, false, false);
    drawConductor(g, 132, 64, beat);
    g.text(tt("三百人齐奏", "300 players"), 80, 66, { align: "center", color: PAPER });
    g.text(tt("多一个，谁知道？", "Who notices?"), 80, 79, { align: "center", color: PAPER });
    /* menu */
    g.rect(10, 92, 140, 52, PAPER);
    g.frame(10, 92, 140, 52, INK);
    var items = [T(TX.start), T(TX.songs), T(TX.howto)];
    for (var i = 0; i < 3; i++) {
      var y = 95 + i * 16;
      if (i === titleSel) {
        g.rect(14, y, 132, 15, INK);
        g.text(items[i], 80, y + 2, { align: "center", color: PAPER });
        g.arrow(18, y + 6, "right", PAPER);
      } else g.text(items[i], 80, y + 2, { align: "center" });
    }
  }
});
function startNext() {
  var next = null;
  for (var i = 0; i < FAKE_SONGS.length; i++) if (!profile.cleared[FAKE_SONGS[i].id]) { next = i; break; }
  if (next === null) next = 0;   /* an encore run starts from the top, story and all */
  goBrief(next);
}
function goBrief(i) {
  game.go("brief", { i: i }, { fade: true, to: PAPER });
}

/* ---------- a line of story before a song ---------- */
var briefI = 0;
var BRIEF = [
  { name: { zh: "齐宣王", en: "King Xuan" }, pages: [
    { zh: "寡人有三百个乐师。人多，热闹。", en: "I have three hundred musicians. Such a crowd." },
    { zh: "南郭先生抱着竽，悄悄站到最后一排。", en: "Nan Guo takes his sheng to the very back row." }] },
  { name: { zh: "齐湣王", en: "King Min" }, pages: [
    { zh: "父王听合奏。寡人，只听独奏。", en: "My father liked the ensemble. I listen to solos." },
    { zh: "南郭：……完了。", en: "Nan Guo: ...I am finished." }] },
  { name: { zh: "齐湣王", en: "King Min" }, pages: [
    { zh: "给寡人吹《山魔王的宫殿》。吹错一个音，去喂马。", en: "Play The Mountain King. One wrong note and you feed the horses." },
    { zh: "南郭：我连谱都不认识。", en: "Nan Guo: I cannot even read music." }] }
];
game.scene("brief", {
  enter: function (a) {
    var i = a.i;
    game.musicStop();
    briefI = i;
    var pages = BRIEF[i].pages;
    game.after(0.18, function () {
      game.say(pages.map(function (p) { return T(p); }), { name: T(BRIEF[i].name), speed: 32 }).then(function () {
        game.go("play", { i: i }, { fade: false });
      });
    });
  },
  draw: function (g) {
    var beat = game.time * 0.6;
    drawHall(g, beat, { kingEye: 1 });
    drawPlayer(g, 18, 68, false, false, true);
    drawConductor(g, 124, 70, beat);
    g.window(34, 60, 92, 20);
    g.text(T(FAKE_SONGS[briefI || 0].short), 80, 64, { align: "center", color: DARK });
  }
});

/* ---------- song select ---------- */
var selectSel = 0, selectLock = 0;
game.scene("select", {
  enter: function () {
    selectSel = 0;
    for (var i = 0; i < FAKE_SONGS.length; i++) if (!profile.cleared[FAKE_SONGS[i].id]) { selectSel = i; break; }
    selectLock = game.time + 0.2;
    game.musicStop();
  },
  update: function () {
    var canGo = game.time >= selectLock;
    var d = game.dir().y;
    if (d) { selectSel = (selectSel + d + FAKE_SONGS.length) % FAKE_SONGS.length; game.sfx("move"); }
    var go = canGo && (game.pressed("a") || game.pressed("start"));
    if (canGo && game.pointer.pressed) {
      var i = Math.floor((game.pointer.y - 24) / 28);
      if (i >= 0 && i < FAKE_SONGS.length) { selectSel = i; go = true; }
    }
    if (game.pressed("b")) { game.sfx("miss"); game.go("title"); return; }
    if (go) { game.sfx("tap"); goBrief(selectSel); }
  },
  draw: function (g) {
    g.clear(PAPER);
    g.rect(0, 0, 160, 18, INK);
    g.text(tt("曲目", "Songs"), 6, 2, { color: PAPER });
    g.text(tt("三场演出", "3 songs"), 154, 2, { align: "right", color: PAPER });
    for (var i = 0; i < FAKE_SONGS.length; i++) {
      var s = FAKE_SONGS[i], y = 24 + i * 28, on = i === selectSel;
      if (on) { g.rect(3, y, 154, 26, INK); }
      g.text((i + 1) + ". " + T(s.name), 8, y + 2, { color: on ? PAPER : INK });
      var b = profile.best[s.id];
      var rank = b ? b.rank : T(TX.fresh);
      g.text(rank, 152, y + 2, { align: "right", color: on ? PAPER : DARK });
      for (var k = 0; k < 3; k++) g.rect(8 + k * 7, y + 20, 4, 4, k < s.difficulty ? (on ? PAPER : INK) : MID);
      if (b) g.text(String(b.score), 152, y + 16, { align: "right", color: on ? PAPER : DARK });
    }
    var s = FAKE_SONGS[selectSel];
    g.rect(0, 110, 160, 1, INK);
    g.text(T(s.credit), 80, 116, { align: "center", color: DARK });
    g.text(T(TX.songKeys), 80, 132, { align: "center" });
  }
});

/* ---------- how to play ---------- */
var howPage = 0, howLock = 0;
game.scene("howto", {
  enter: function () { howPage = 0; howLock = game.time + 0.2; game.musicStop(); },
  update: function () {
    var canGo = game.time >= howLock;
    if (game.pressed("b")) { game.sfx("miss"); game.go("title"); return; }
    if (canGo && (game.pressed("a") || game.pressed("start") || game.pointer.pressed)) {
      game.sfx("tap");
      if (howPage < 2) howPage++;
      else game.go("title");
    }
  },
  draw: function (g) {
    g.clear(PAPER);
    g.rect(0, 0, 160, 18, INK);
    g.text(T(TX.howTitle), 6, 2, { color: PAPER });
    g.text((howPage + 1) + "/3", 154, 2, { align: "right", color: PAPER });
    g.window(4, 20, 152, 112);
    var txt = [T(TX.how1), T(TX.how2), T(TX.how3)][howPage];
    g.text(txt, 9, 25, { width: 142 });
    /* a live little demonstration under the words */
    if (howPage === 0) {
      for (var r = 0; r < 5; r++) g.rect(10, 92 + r * 7, 140, 1, MID);
      g.rect(46, 86, 2, 34, INK);
      for (var i = 0; i < 3; i++) {
        var x = 154 - ((game.time * 34 + i * 42) % 112);
        var y = 92 + (i % 3) * 7;
        g.circle(x, y, 2, INK, true);
        g.rect(x + 2, y - 5, 1, 5, INK);
      }
      keycap(g, "A", 14, 103, 2);
    } else if (howPage === 1) {
      g.rect(9, 84, 142, 40, INK);
      var lid = 0.55 + 0.45 * Math.abs(Math.sin(game.time * 1.6));
      drawEye(g, 24, 92, 52, 24, lid);
      g.text(T(TX.watch), 114, 97, { align: "center", color: PAPER });
    } else {
      g.rect(9, 84, 142, 40, INK);
      for (var k = 0; k < 6; k++) {
        var hx = 18 + k * 24, b = Math.round(Math.sin((game.time * 2 + k * 0.2) * Math.PI * 2) * 2);
        g.circle(hx, 104 + b, 4, PAPER, true);
        g.rect(hx - 4, 109 + b, 9, 8, PAPER);
        g.rect(hx - 3, 111 + b, 1, 1, INK); g.rect(hx + 2, 111 + b, 1, 1, INK);
      }
      for (k = 0; k < 5; k++) {
        var cy = 88 + Math.round((Math.sin(game.time * 2.2 + k) + 1) * 3);
        g.rect(12 + k * 34, cy, 2, 2, k % 2 ? MID : PAPER);
      }
      g.text(T(TX.cheer), 80, 87, { align: "center", color: PAPER });
    }
    g.text(howPage < 2 ? T(TX.howKeys) : T(TX.howDone), 80, 132, { align: "center", color: DARK });
  }
});

/* ---------- performance ---------- */
var P = null;

function buildPlay(i) {
  var s = FAKE_SONGS[i];
  var lo = 127, hi = 0;
  s.chart.forEach(function (n) {
    var m = midiOfNote(n.note);
    if (m < lo) lo = m; if (m > hi) hi = m;
  });
  if (hi - lo < 8) { var c = (hi + lo) / 2; lo = c - 4; hi = c + 4; }
  lo -= 1; hi += 1;
  return {
    i: i, song: s, start: game.time, t: 0, lo: lo, hi: hi,
    combo: 0, maxCombo: 0, score: 0, perfect: 0, good: 0, miss: 0, noise: 0, caught: 0,
    suspicion: 0, total: s.chart.length, judged: {}, hold: null,
    puffs: [], bits: [], judge: null, judgeUntil: 0,
    warned: {}, inEye: {}, eye: false, banner: "", bannerUntil: 0,
    ended: false, failed: false, endAt: 0, resultAt: 0,
    lastBeat: -1, flash: 0, shake: 0, startPuff: 0, sweat: 0, clap: false
  };
}
function midiOfNote(n) {
  var m = /^([a-g])([+-]?)(\d)$/.exec(n);
  return (parseInt(m[3], 10) + 1) * 12 + { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1]] + (m[2] === "+" ? 1 : m[2] === "-" ? -1 : 0);
}
function noteY(P, note) {
  var m = midiOfNote(note.note);
  return Math.round(80 - (m - P.lo) / (P.hi - P.lo) * 32);
}
function inWatch(P, t) {
  return P.song.watch.some(function (w) { return t >= w[0] && t < w[1]; });
}
function addSuspicion(P, n) {
  P.suspicion = Math.max(0, Math.min(100, P.suspicion + n));
  if (P.suspicion >= 100) fail(P);
}
function setJudge(P, text, tone, sec) {
  P.judge = { text: text, tone: tone == null ? INK : tone };
  P.judgeUntil = game.time + (sec || 0.55);
}
function puffAt(P, y, kind) {
  P.puffs.push({ x: 40, y: y, t: 0, kind: kind || 0 });
  for (var i = 0; i < 5; i++) {
    P.bits.push({ x: 40, y: y, vx: 0.6 + Math.random() * 1.2, vy: (Math.random() - 0.5) * 1.6, life: 0.35, tone: Math.random() < 0.5 ? INK : DARK });
  }
}
function blip(P, note, perfect) {
  if (!note) return;
  game.sfx({ wave: "square", duty: perfect ? 1 : 2, from: Math.round(note.f * 1.03), to: Math.round(note.f), ms: perfect ? 85 : 65, attack: 2, decay: perfect ? 78 : 58, vol: perfect ? 0.46 : 0.34 });
}
function hitSound(fail) {
  if (fail) game.sfx({ wave: "noise", from: 520, to: 120, ms: 140, vol: 0.42 });
  else game.sfx({ wave: "square", duty: 3, from: 180, to: 90, ms: 90, vol: 0.2 });
}
function scoreHit(P, note, perfect) {
  P.combo++;
  if (P.combo > P.maxCombo) P.maxCombo = P.combo;
  var gain = (perfect ? 100 : 55) + Math.min(50, P.combo * 2);
  P.score += gain;
  if (perfect) P.perfect++; else P.good++;
  P.suspicion = Math.max(0, P.suspicion - (perfect ? 1.6 : 0.8));
  setJudge(P, perfect ? T(TX.perfect) : T(TX.good), INK, 0.45);
  puffAt(P, note ? noteY(P, note) : 64, perfect ? 1 : 0);
  blip(P, note, perfect);
  if (P.combo > 0 && P.combo % 10 === 0) {
    game.flash(0.05); game.shake(1, 0.12); game.sfx("coin");
    setJudge(P, T(TX.cheer), INK, 0.8);
    for (var i = 0; i < 12; i++) P.bits.push({ x: Math.random() * 160, y: 30 + Math.random() * 40, vx: (Math.random() - 0.5) * 1.4, vy: 0.4 + Math.random() * 1.4, life: 1.2, tone: i % 2 ? MID : PAPER });
  }
}
function missNote(P, note, why) {
  if (!note) return;
  P.judged[note.t] = "miss";
  P.miss++;
  P.combo = 0;
  addSuspicion(P, why === "break" ? 10 : 9);
  setJudge(P, why === "break" ? T(TX.broken) : T(TX.miss), INK, 0.6);
  hitSound(true);
  game.shake(1, 0.1);
  P.sweat = 1.2;
  if (why === "break") P.puffs.push({ x: 40, y: noteY(P, note), t: 0, kind: 2 });
}
function wrongPress(P) {
  P.noise++;
  P.combo = 0;
  addSuspicion(P, 7);
  setJudge(P, T(TX.noise), INK, 0.5);
  hitSound(true);
  game.shake(1, 0.08);
}
function caught(P) {
  if (P.caughtCool > 0) return;
  P.caughtCool = 0.7;
  P.caught++;
  P.combo = 0;
  addSuspicion(P, 16);
  setJudge(P, T(TX.caught), INK, 0.8);
  game.sfx("err"); game.flash(0.09); game.shake(3, 0.25);
  P.sweat = 1.5;
}
function fail(P) {
  if (P.ended) return;
  P.ended = true; P.failed = true;
  P.endAt = game.time;
  game.musicStop();
  game.sfx("lose");
  game.shake(4, 0.6);
  game.flash(0.12);
}
function finish(P) {
  if (P.ended) return;
  P.ended = true; P.failed = false;
  P.endAt = game.time;
  game.musicStop();
  game.sfx("win");
  for (var i = 0; i < 14; i++) {
    game.after(i * 0.055, function () {
      game.sfx({ wave: "noise", from: 1800 + Math.random() * 1200, to: 900, ms: 40, attack: 2, decay: 36, vol: 0.12 });
    });
  }
  for (i = 0; i < 24; i++) P.bits.push({ x: Math.random() * 160, y: 20 + Math.random() * 30, vx: (Math.random() - 0.5) * 1.2, vy: 0.5 + Math.random() * 1.5, life: 1.8, tone: i % 2 ? MID : PAPER });
}
function resultStats(P) {
  var acc = P.total ? (P.perfect + P.good * 0.6) / P.total : 0;
  var rank = rankLetter(acc, P.miss, P.suspicion, P.failed);
  return { score: P.score, maxCombo: P.maxCombo, perfect: P.perfect, good: P.good, miss: P.miss, noise: P.noise, caught: P.caught, suspicion: Math.round(P.suspicion), total: P.total, acc: acc, rank: rank, failed: P.failed };
}

game.scene("play", {
  enter: function (a) {
    P = buildPlay(a.i);
    P.caughtCool = 0;
    game.music(P.song.music, { loop: false });
    game.ambience(null);
  },
  update: function () {
    if (!P) return;
    var dt = 1 / 60;
    P.t = game.time - P.start;
    var t = P.t, beat = t * P.song.bpm / 60;
    var beatSec = 60 / P.song.bpm;
    if (P.caughtCool > 0) P.caughtCool -= dt;
    if (P.sweat > 0) P.sweat -= dt;
    if (P.flash > 0) P.flash -= dt;

    /* note particles */
    for (var i = P.bits.length - 1; i >= 0; i--) {
      var b = P.bits[i]; b.life -= dt; b.x += b.vx; b.y += b.vy; b.vy += 0.02;
      if (b.life <= 0) P.bits.splice(i, 1);
    }
    for (i = P.puffs.length - 1; i >= 0; i--) { P.puffs[i].t += dt; if (P.puffs[i].t > 0.3) P.puffs.splice(i, 1); }

    if (!P.ended) {
      /* watch warnings and the eye */
      for (i = 0; i < P.song.watch.length; i++) {
        var w = P.song.watch[i];
        if (!P.warned[i] && t >= w[0] - 2 * beatSec && t < w[0]) {
          P.warned[i] = true;
          P.banner = T(TX.watchWarn); P.bannerUntil = w[0] + 0.2;
          game.sfx({ wave: "square", duty: 2, from: 880, to: 880, ms: 70, vol: 0.4 });
        }
        if (!P.inEye[i] && t >= w[0] && t < w[1]) {
          P.inEye[i] = true;
          P.banner = T(TX.watch); P.bannerUntil = w[1];
          game.sfx({ wave: "triangle", from: 120, to: 80, ms: 280, vol: 0.5 });
          if (P.hold) { missNote(P, P.hold.note, "break"); P.hold = null; }
        }
        if (P.inEye[i] && t >= w[1]) {
          P.inEye[i] = false;
          P.banner = T(TX.again); P.bannerUntil = t + 0.6;
          game.sfx("tick");
        }
      }
      var eye = inWatch(P, t);
      P.eye = eye;

      var down = game.pressed("a") || game.pointer.pressed;
      var up = game.released("a") || game.pointer.released;

      if (eye) {
        if (down) caught(P);
      } else if (down) {
        var note = nearestNote(P, t);
        if (note) {
          if (t < note.t - GOOD) {
            setJudge(P, T(TX.early), DARK, 0.35);
            game.sfx("tick");
          } else {
            var perfect = Math.abs(t - note.t) <= PERFECT;
            if (note.hold) {
              P.hold = { note: note, perfect: perfect, start: t };
              P.judged[note.t] = "hold";
              setJudge(P, T(TX.hold), DARK, 0.35);
              blip(P, note, perfect);
              puffAt(P, noteY(P, note), 0);
            } else {
              P.judged[note.t] = "hit";
              scoreHit(P, note, perfect);
            }
          }
        } else if (t > P.song.chart[0].t - 0.35 && t < P.song.chart[P.song.chart.length - 1].end + GOOD) {
          wrongPress(P);
        }
      }

      if (P.hold) {
        var hn = P.hold.note;
        if (up) {
          if (t >= hn.end - GOOD) {
            P.judged[hn.t] = "hit";
            scoreHit(P, hn, P.hold.perfect && Math.abs(t - hn.end) <= 0.12);
            P.hold = null;
          } else {
            P.judged[hn.t] = "miss";
            missNote(P, hn, "break");
            P.hold = null;
          }
        } else if (t >= hn.end) {
          /* held through the end: count it, and keep the button bookkeeping tidy */
          P.judged[hn.t] = "hit";
          scoreHit(P, hn, P.hold.perfect);
          P.hold = null;
        }
      }

      /* unplayed taps that have gone past the window */
      for (i = 0; i < P.song.chart.length; i++) {
        var n = P.song.chart[i];
        if (P.judged[n.t]) continue;
        if (n.t + GOOD < t) {
          missNote(P, n, "miss");
          if (P.ended) return;
        }
      }

      /* natural cool-down: a clean player becomes boring again */
      if (!eye) P.suspicion = Math.max(0, P.suspicion - dt * 0.55);

      /* let the coda finish; the uncharted last bar is part of the performance */
      if (t > P.song.seconds + 0.25) finish(P);
    } else if (game.time - P.endAt > (P.failed ? 1.05 : 1.5)) {
      var stats = resultStats(P);
      if (!P.failed) {
        var b = profile.best[P.song.id];
        stats.newBest = !b || stats.score > b.score;
        if (stats.newBest) profile.best[P.song.id] = { score: stats.score, rank: stats.rank, acc: stats.acc, combo: stats.maxCombo };
        profile.cleared[P.song.id] = true;
        if (clearedCount() === FAKE_SONGS.length) profile.ending = true;
      }
      saveProfile();
      game.go("result", { i: P.i, stats: stats }, { fade: true, to: PAPER });
    }
    /* a beat marker for the drawing code */
    var bi = Math.floor(beat);
    if (bi !== P.lastBeat) { P.lastBeat = bi; P.startPuff = 0.08; }
    if (P.startPuff > 0) P.startPuff -= dt;
  },
  draw: function (g) {
    if (!P) return;
    var t = P.t, beat = t * P.song.bpm / 60;
    drawHall(g, beat, { kingEye: P.suspicion > 55 || P.eye ? 2 : P.suspicion > 22 ? 1 : 0, look: P.suspicion > 70 ? 1 : 0, happy: P.maxCombo >= 25, clap: P.ended && !P.failed });
    drawScroll(g);
    drawMouth(g, P.startPuff > 0 || (P.hold && Math.sin(game.time * 20) > 0));
    /* staff and notes */
    g.rect(38, 42, 1, 42, DARK);
    g.rect(37, 42, 3, 42, P.eye ? MID : PAPER);
    g.rect(38, 42, 1, 42, P.eye ? MID : DARK);
    if (P.eye) drawEye(g, 49, 46, 62, 26, Math.min(1, 0.3 + Math.min(1, (t - watchStart(P)) * 5)));
    else {
      for (var i = 0; i < P.song.chart.length; i++) {
        var n = P.song.chart[i];
        if (P.judged[n.t] && P.judged[n.t] !== "hold") continue;
        var lead = 2.2, x = 40 + (n.t - t) * (118 / lead);
        if (x < 34 || x > 162) continue;
        var y = noteY(P, n);
        var near = x - 40 < 8 && x - 40 > -4;
        if (n.hold) {
          var xe = 40 + (n.end - t) * (118 / lead);
          if (xe < 36) continue;
          g.rect(x, y - 2, Math.max(3, xe - x), 5, near ? INK : DARK);
          g.frame(x, y - 2, Math.max(3, xe - x), 5, INK);
          g.circle(x, y, 2, near ? PAPER : MID, true);
          g.circle(x, y, 2, INK, false);
        } else {
          g.circle(x, y, near ? 3 : 2, near ? INK : DARK, true);
          g.circle(x, y, near ? 3 : 2, INK, false);
          g.rect(x + (near ? 2 : 1), y - 5, 1, 5, INK);
        }
      }
      /* active hold: draw a filled progress bar */
      if (P.hold) {
        var hn = P.hold.note, hx = 40 + (hn.t - t) * (118 / lead);
        var hxe = 40 + (hn.end - t) * (118 / lead);
        var frac = Math.max(0, Math.min(1, (t - hn.t) / (hn.end - hn.t)));
        g.rect(hx, noteY(P, hn) - 3, Math.max(2, hxe - hx), 1, INK);
        g.rect(hx, noteY(P, hn) + 2, Math.max(2, Math.round((hxe - hx) * frac)), 1, INK);
      }
    }
    /* puffs */
    P.puffs.forEach(function (p) {
      var r = Math.round(p.t * 44);
      if (p.kind === 2) { g.line(p.x - 4, p.y - 4, p.x + 4, p.y + 4, INK); g.line(p.x + 4, p.y - 4, p.x - 4, p.y + 4, INK); }
      else { g.circle(p.x + r, p.y, Math.max(1, r), p.kind ? INK : MID, false); }
    });
    /* particles */
    P.bits.forEach(function (b) { if (b.life > 0) g.rect(Math.round(b.x), Math.round(b.y), 1, 1, b.tone); });
    /* people */
    drawPlayer(g, 8, 90, P.startPuff > 0 || (P.hold && Math.sin(game.time * 24) > 0), P.sweat > 0, false);
    for (i = 0; i < 4; i++) {
      var mx = 58 + i * 22, mb = Math.round(Math.sin((beat + i * 0.2) * Math.PI * 2) * 1);
      g.circle(mx + 4, 102 + mb, 3, MID, true);
      g.rect(mx, 106 + mb, 9, 10, DARK);
      g.line(mx + 8, 108 + mb, mx + 14, 104 + mb, MID);
      g.rect(mx + 1, 116 + mb, 2, 4, DARK); g.rect(mx + 6, 116 + mb, 2, 4, DARK);
    }
    drawConductor(g, 136, 96, beat, DARK);
    /* HUD */
    g.rect(0, 0, 160, 16, PAPER);
    g.rect(0, 15, 160, 1, INK);
    g.text(T(P.song.short), 4, 1);
    if (P.combo >= 2) {
      bigText(g, String(P.combo), 72, 3, 2, INK, "center");
      g.text(tt("连", "x"), 88, 2, { color: DARK });
    } else {
      keycap(g, "A", 66, 3, 1);
      g.text(tt("吹", "play"), 79, 2, { color: DARK });
    }
    drawSuspicion(g, P.suspicion);
    /* banner */
    if (P.banner && t < P.bannerUntil) {
      g.window(26, 18, 108, 17);
      g.text(P.banner, 80, 21, { align: "center" });
    }
    /* judge word */
    if (P.judge && game.time < P.judgeUntil) {
      var jw = g.measure(P.judge.text) + 10;
      g.window(80 - Math.round(jw / 2), 84, jw, 15);
      g.text(P.judge.text, 80, 86, { align: "center", color: P.judge.tone });
    }
    /* intro count: a thin strip above the staff, never over the approaching notes */
    var first = P.song.chart[0].t;
    if (t < first && !P.ended) {
      var beatsLeft = (first - t) / (60 / P.song.bpm);
      g.window(8, 18, 144, 22);
      g.text(beatsLeft > 1 ? T(TX.ready) : T(TX.go), 12, 22);
      g.text(tt("跟着指挥", "follow the baton"), 148, 22, { align: "right", color: DARK });
    }
    /* fail */
    if (P.ended && P.failed) {
      g.rect(0, 24, 160, 44, PAPER); g.frame(0, 24, 160, 44, INK);
      g.text(T(TX.failed), 80, 34, { align: "center" });
      g.text(T(TX.failTip), 80, 50, { align: "center", color: DARK });
    }
    /* success flash */
    if (P.ended && !P.failed && game.time - P.endAt < 1.4) {
      g.rect(0, 30, 160, 36, PAPER); g.frame(0, 30, 160, 36, INK);
      g.text(T(TX.success), 80, 35, { align: "center" });
      g.text(T(TX.cheer), 80, 50, { align: "center", color: DARK });
    }
  }
});
function watchStart(P) {
  for (var i = 0; i < P.song.watch.length; i++) if (P.t >= P.song.watch[i][0] && P.t < P.song.watch[i][1]) return P.song.watch[i][0];
  return P.t;
}
function nearestNote(P, t) {
  var best = null, bd = 1e9;
  for (var i = 0; i < P.song.chart.length; i++) {
    var n = P.song.chart[i];
    if (P.judged[n.t]) continue;
    var d = n.t - t;
    if (d < -GOOD) continue;
    if (d > EARLY) break;
    var ad = Math.abs(d);
    if (ad < bd) { bd = ad; best = n; }
  }
  return best;
}

/* ---------- result ---------- */
var resultSel = 0, resultItems = [], resultArgs = null, resultLock = 0;
function resultOptions(stats, i) {
  var last = i === FAKE_SONGS.length - 1;
  if (stats.failed) return ["retry", "choose"];
  if (last) return ["curtain", "retry", "choose"];
  return ["next", "retry", "choose"];
}
game.scene("result", {
  enter: function (a) {
    resultArgs = a;
    resultItems = resultOptions(a.stats, a.i);
    resultSel = 0;
    resultLock = game.time + 0.2;
    game.musicStop();
  },
  update: function () {
    var canGo = game.time >= resultLock;
    var d = game.dir().x;
    if (d) { resultSel = (resultSel + d + resultItems.length) % resultItems.length; game.sfx("move"); }
    var act = canGo && (game.pressed("a") || game.pressed("start"));
    if (canGo && game.pointer.pressed) {
      var n = resultItems.length, bw = n === 3 ? 44 : 66, gap = n === 3 ? 2 : 4;
      var bx = Math.round((160 - (n * bw + (n - 1) * gap)) / 2);
      if (game.pointer.y >= 104 && game.pointer.y < 124) {
        for (var k = 0; k < n; k++) {
          var x = bx + k * (bw + gap);
          if (game.pointer.x >= x && game.pointer.x < x + bw) { resultSel = k; act = true; break; }
        }
      }
    }
    if (game.pressed("b")) { game.sfx("miss"); game.go("select"); return; }
    if (act) {
      game.sfx("tap");
      var what = resultItems[resultSel];
      if (what === "next") goBrief(resultArgs.i + 1);
      else if (what === "retry") game.go("play", { i: resultArgs.i }, { fade: false });
      else if (what === "curtain") game.go("ending");
      else game.go("select");
    }
  },
  draw: function (g) {
    var st = resultArgs.stats;
    var beat = game.time * 1.6;
    drawHall(g, beat, { happy: !st.failed, clap: !st.failed, kingEye: st.failed ? 2 : 0, look: 1 });
    if (!st.failed) {
      for (var i = 0; i < 18; i++) g.rect((i * 37 + Math.floor(game.time * 10)) % 160, 2 + (i * 5) % 12, 2, 2, i % 2 ? MID : INK);
    }
    g.window(8, 20, 144, 110);
    g.text(T(st.failed ? TX.failed : TX.success), 80, 25, { align: "center" });
    var panelY = 41;
    g.text(T(TX.score) + " " + st.score, 16, panelY, { color: DARK });
    g.text(T(TX.maxCombo) + " " + st.maxCombo, 16, panelY + 12, { color: DARK });
    g.text(T(TX.accuracy) + " " + Math.round(st.acc * 100) + "%", 16, panelY + 24, { color: DARK });
    g.text(T(TX.suspicion) + " " + st.suspicion, 16, panelY + 36, { color: DARK });
    bigText(g, st.rank, 126, 38, 4, INK, "center");
    g.text(rankName(st.rank), 126, 62, { align: "center", color: DARK });
    if (!st.failed && st.newBest) g.text(T(TX.newBest), 80, 91, { align: "center", color: DARK });
    /* one row of three wide buttons: easy to hit with a thumb */
    var names = { next: TX.next, retry: TX.retry, choose: TX.choose, curtain: TX.curtain };
    var n = resultItems.length, bw = n === 3 ? 44 : 66, gap = n === 3 ? 2 : 4;
    var bx = Math.round((160 - (n * bw + (n - 1) * gap)) / 2);
    for (var k = 0; k < n; k++) {
      var x = bx + k * (bw + gap), on = k === resultSel;
      if (on) g.rect(x, 104, bw, 18, INK);
      else g.frame(x, 104, bw, 18, DARK);
      g.text(T(names[resultItems[k]]), x + Math.round(bw / 2), 107, { align: "center", color: on ? PAPER : INK });
    }
    g.rect(0, 130, 160, 14, PAPER);
    g.text(T(TX.resultKeys), 80, 131, { align: "center", color: DARK });
  }
});

/* ---------- ending ---------- */
game.scene("ending", {
  enter: function () {
    game.musicStop();
    var first = !profile.finaled;
    var pages = first ? [T(TX.end1), T(TX.end2), T(TX.end3)] : [T(TX.endSeen)];
    game.after(0.2, function () {
      game.say(pages, { speed: 34 }).then(function () {
        if (first) { profile.finaled = true; saveProfile(); }
        game.go("title", null, { fade: true, to: PAPER });
      });
    });
  },
  draw: function (g) {
    drawHall(g, game.time * 0.8, { happy: true, clap: true, kingEye: 0 });
    g.window(36, 24, 88, 22);
    g.text(T(TX.endingTitle), 80, 29, { align: "center" });
    drawPlayer(g, 58, 82, false, false, false);
    drawConductor(g, 108, 82, game.time * 0.8);
    bigText(g, "S", 80, 110, 2, INK, "center");
  }
});

game.start("boot");
