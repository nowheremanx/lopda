/* fake-yu / game.js — 滥竽充数, a rhythm game about hiding in a royal orchestra.
 *
 * The joke is the mechanic: you are the extra player at the back of a 300-player court
 * orchestra. Play the notes, but when the king's eye opens, everything stops. The last
 * hold before the gaze ends exactly when the eye opens, and the first note after it
 * begins exactly when the eye closes. Ten songs, three acts, four endings. The music
 * and chart come from src/music.js; the story from src/story.js.
 *
 * MIT License. Copyright (c) 2026 Haowei Wu.
 */

var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";
var INK = 0, DARK = 1, MID = 2, PAPER = 3;
var SAVE_KEY = "save";
var PERFECT = 0.10, GOOD = 0.20, EARLY = 0.35;
var SONGS = FAKE_SONGS;
var CAST = STORY.CAST;

var profile = { best: {}, cleared: {}, story: 0, truth: false, endings: {}, finaled: false };
var loaded = false;

function tt(zh, en) { return T({ zh: zh, en: en }); }

var TX = {
  title: { zh: "滥竽充数", en: "Fake Yu" },
  subtitle: { zh: "南郭先生升职记", en: "The royal orchestra" },
  story: { zh: "故事", en: "Story" },
  storyStart: { zh: "开始故事", en: "Begin story" },
  storyContinue: { zh: "继续故事", en: "Continue" },
  songs: { zh: "选曲", en: "Songs" },
  howto: { zh: "怎么玩", en: "How to play" },
  titleKeys: { zh: "↑↓选 A好", en: "UP/DOWN A" },
  songKeys: { zh: "↑↓选　A演奏　B返回", en: "UP/DOWN  A play  B back" },
  fresh: { zh: "未演", en: "NEW" },
  howTitle: { zh: "怎么玩", en: "How to play" },
  howKeys: { zh: "A 下一页　B 返回", en: "A next  B back" },
  howDone: { zh: "A 回标题", en: "A title" },
  how1: { zh: "音符到竖线时按 A。长条要按住，到尾再松。START 暂停。", en: "Press A as a note crosses the line. Hold long bars to the end. START pauses." },
  how2: { zh: "国王的眼睛睁开时，A、B 都别按。空心音符是假的，按了就露馅；眼睛闭上再起手。", en: "King's eye? Stop A/B. Hollow notes are fake; don't press. Resume when it closes." },
  how3: { zh: "菱形音符是磬，按 B。A 是竽，B 是磬；手忙脚乱时，先看清形状。", en: "Diamond notes are chimes: press B. A is sheng, B is chime. Read the shape first." },
  how4: { zh: "长音会在眼睛睁开时结束：松手。眼睛闭上时接下一个音符。后面的曲子会假闭眼，别提前按。", en: "Holds end when the eye opens: release. Resume on the next note. Later songs fake a blink: wait." },
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
  chime: { zh: "敲磬", en: "CHIME" },
  cheer: { zh: "全场喝彩", en: "CHEERS!" },
  success: { zh: "演出成功", en: "SUCCESS!" },
  failed: { zh: "被赶出宫", en: "THROWN OUT" },
  score: { zh: "得分", en: "SCORE" },
  maxCombo: { zh: "最高连击", en: "MAX COMBO" },
  accuracy: { zh: "准确", en: "ACCURACY" },
  suspicion: { zh: "怀疑", en: "SUSPICION" },
  next: { zh: "下一曲", en: "Next" },
  retry: { zh: "重来", en: "Retry" },
  choose: { zh: "选曲", en: "Songs" },
  curtain: { zh: "谢幕", en: "End" },
  resultKeys: { zh: "←→ 选　A 好　B 选曲", en: "LEFT/RIGHT  A ok  B songs" },
  resultKeysFail: { zh: "←→ 选　A 好　B 主菜单", en: "LEFT/RIGHT  A ok  B menu" },
  failTip: { zh: "睁眼时：A/B 都别按", en: "King's eye: no A/B" },
  newBest: { zh: "新纪录", en: "BEST" },
  endingTitle: { zh: "剧终", en: "THE END" },
  endSeen: { zh: "南郭先生又回到了台上。", en: "Nan Guo is back on stage." },
  act: { zh: "第 {n} 幕", en: "Act {n}" },
  chapter: { zh: "第 {n} 章", en: "Chapter {n}" },
  actShort: { zh: "第{n}幕", en: "Act {n}" },
  chapterShort: { zh: "第{n}章", en: "Ch{n}" },
  progress: { zh: "{act} · {chapter}", en: "{act} · {chapter}" },
  endingCount: { zh: "结局 {e}/4", en: "Endings {e}/4" },
  endingsSeen: { zh: "已看结局 {e}/4", en: "Endings {e}/4" },
  storyKeys: { zh: "A / 点画面 继续", en: "A / tap: continue" },
  choiceTitle: { zh: "要对湣王说实话吗？", en: "Tell the king the truth?" },
  choice0: { zh: "坦白：我不会吹竽", en: "Confess: I cannot play" },
  choice1: { zh: "继续装：我还能写", en: "Keep pretending" },
  chimeHint: { zh: "B 键：敲磬", en: "B: chime" },
  touchB: { zh: "B 敲", en: "B chime" },
  actProgress: { zh: "第 {a}/{b} 首", en: "Song {a}/{b}" },
  pct: { zh: "{n}%", en: "{n}%" },
  bHits: { zh: "敲磬", en: "CHIMES" },
  best: { zh: "最好", en: "BEST" },
  locked: { zh: "未演", en: "NEW" },
  noSong: { zh: "没有曲目", en: "No songs" },
  rankS: { zh: "名角", en: "STAR" },
  rankA: { zh: "好手", en: "GOOD" },
  rankB: { zh: "凑合", en: "OK" },
  rankC: { zh: "露馅", en: "OOPS" },
  menu: { zh: "主菜单", en: "Main menu" },
  pauseTitle: { zh: "暂停", en: "PAUSED" },
  pause0: { zh: "继续", en: "Continue" },
  pause1: { zh: "重来", en: "Retry" },
  pause2: { zh: "回主菜单", en: "Main menu" },
  pauseKeys: { zh: "↑↓ 选　A 好　START 继续", en: "UP/DOWN A  START resume" },
  playOn: { zh: "接着吹", en: "PLAY ON" }
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
  "G": ["011", "100", "101", "101", "011"], "O": ["111", "101", "101", "101", "111"],
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
function inBox(p, b) { return p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h; }

/* ---------- save ---------- */
function loadProfile() {
  return game.load(SAVE_KEY).then(function (v) {
    if (v && typeof v === "object") {
      profile.best = v.best || {};
      profile.cleared = v.cleared || {};
      profile.endings = v.endings || {};
      profile.truth = !!v.truth;
      profile.finaled = !!v.finaled;
      profile.story = Math.max(0, Math.min(SONGS.length, v.story | 0));
    }
    loaded = true;
  }).catch(function () { loaded = true; });
}
function saveProfile() { game.save(SAVE_KEY, profile); }
function clearedCount() { var n = 0; SONGS.forEach(function (s) { if (profile.cleared[s.id]) n++; }); return n; }
function endingsCount() { var n = 0; Object.keys(profile.endings).forEach(function (k) { if (profile.endings[k]) n++; }); return n; }
function rankLetter(acc, miss, suspicion, failed) {
  if (failed) return "C";
  if (acc >= 0.95 && miss <= 2 && suspicion <= 20) return "S";
  if (acc >= 0.86) return "A";
  if (acc >= 0.70) return "B";
  return "C";
}
function rankName(r) { return T({ S: TX.rankS, A: TX.rankA, B: TX.rankB, C: TX.rankC }[r] || TX.rankC); }
function actOf(i) { return Math.min(STORY.ACTS.length, Math.max(1, SONGS[i].act)); }
function isActStart(i) { return i === 0 || SONGS[i].act !== SONGS[i - 1].act; }
function venueOf(i) { return SONGS[i].venue || "hall"; }

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
    if (canGo && game.pointer.pressed && game.pointer.y >= 86 && game.pointer.y < 144) {
      var i = Math.floor((game.pointer.y - 86) / 16);
      if (i >= 0) { titleSel = Math.min(2, i); go = true; }
    }
    if (go) {
      game.sfx("tap");
      if (titleSel === 0) startStory();
      else if (titleSel === 1) game.go("select");
      else game.go("howto");
    }
  },
  draw: function (g) {
    var beat = game.time * 0.8;
    ART.hall(g, beat, { happy: clearedCount() === SONGS.length, kingEye: 0, petals: true, spot: true });
    /* title strip */
    g.rect(0, 0, 160, 14, PAPER);
    g.rect(0, 13, 160, 1, INK);
    g.text(T(TX.titleKeys), 5, 2, { color: DARK });
    g.text(T(TX.endingCount, { e: endingsCount() }), 155, 2, { align: "right", color: DARK });
    /* the plaque */
    g.window(14, 14, 132, 42);
    g.text(T(TX.title), 80, 17, { align: "center" });
    g.text(T(TX.subtitle), 80, 30, { align: "center", color: DARK });
    var actN = Math.min(3, SONGS[Math.min(profile.story, SONGS.length - 1)].act);
    g.text(T(TX.progress, {
      act: T(TX.actShort, { n: actN }),
      chapter: T(TX.chapterShort, { n: Math.min(profile.story + 1, SONGS.length) })
    }), 80, 43, { align: "center", color: DARK });
    /* two would-be musicians */
    ART.player(g, 8, 56, { mood: "sly" });
    ART.conductor(g, 132, 57, beat);
    ART.musician(g, 48, 60, "sheng", beat, "");
    ART.musician(g, 66, 60, "qin", beat + 0.1, "");
    ART.musician(g, 84, 60, "drum", beat + 0.2, "");
    ART.musician(g, 104, 60, "flute", beat + 0.3, "");
    /* menu: 16 px rows with room above and below; the stage stops clear of it */
    g.rect(6, 86, 148, 57, PAPER);
    g.frame(6, 86, 148, 57, INK);
    var items = [profile.story > 0 ? T(TX.storyContinue) : T(TX.storyStart), T(TX.songs), T(TX.howto)];
    for (var i = 0; i < 3; i++) {
      var y = 92 + i * 16;
      if (i === titleSel) {
        g.rect(9, y - 1, 142, 15, INK);
        g.text(items[i], 80, y, { align: "center", color: PAPER });
      } else g.text(items[i], 80, y, { align: "center" });
    }
  }
});
function startStory() {
  if (profile.story >= SONGS.length) profile.story = 0;
  if (profile.story === 0) profile.truth = false;
  goStory(profile.story, "pre");
}
function goStory(i, kind, stats) {
  game.go("story", { i: i, kind: kind, stats: stats }, { fade: true, to: PAPER });
}

/* ---------- story: act cards, portraits and chapters ---------- */
var storyView = { i: 0, speaker: "narr", mood: "calm", venue: "hall", card: false, cardAct: 1, cardAt: 0, busy: false };

function lineMood(who, mood) {
  if (mood) return mood;
  if (who === "min") return "angry";
  if (who === "narr") return "calm";
  if (who === "nanguo") return "worried";
  return "calm";
}
async function tell(lines) {
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    storyView.speaker = line.who;
    storyView.mood = lineMood(line.who, line.mood);
    await game.say(T(line.text), line.who === "narr" ? { speed: 34 } : { name: T(CAST[line.who].name), speed: 34 });
  }
}
async function actCard(n) {
  storyView.card = true; storyView.cardAct = n; storyView.cardAt = game.time;
  game.sfx("win");
  await game.wait(2.1);
  storyView.card = false;
}
function chapterPre(i) {
  if (i === 8 || i === 9) {
    return profile.truth ? STORY.CHAPTERS[i].beforeTruth || STORY.CHAPTERS[i].before : STORY.CHAPTERS[i].beforeLie || STORY.CHAPTERS[i].before;
  }
  return STORY.CHAPTERS[i].before;
}
async function runStory(a) {
  var i = a.i;
  if (a.kind === "pre") {
    if (isActStart(i)) await actCard(actOf(i));
    await tell(chapterPre(i));
    game.go("play", { i: i, story: true }, { fade: false });
    return;
  }
  await tell(STORY.CHAPTERS[i].after || []);
  var ch = STORY.CHAPTERS[i];
  if (ch.choice) {
    await tell([{ who: "narr", text: { zh: "（说实话，还是继续装？最后一曲演成什么样，会把你带向不同的结局。）", en: "(Truth or lie? How the last tune goes will decide which ending you reach.)" } }]);
    var pick = await game.choose([T(TX.choice0), T(TX.choice1)], { title: T(TX.choiceTitle), cancel: false });
    profile.truth = pick === 0;
    saveProfile();
  }
  if (i + 1 < SONGS.length) {
    if (isActStart(i + 1)) await actCard(actOf(i + 1));
    await tell(chapterPre(i + 1));
    game.go("play", { i: i + 1, story: true }, { fade: false });
  } else {
    game.go("ending", { stats: a.stats || null });
  }
}
game.scene("story", {
  enter: function (a) {
    storyView.i = a.i;
    storyView.speaker = "narr";
    storyView.mood = "calm";
    storyView.venue = venueOf(a.i);
    storyView.card = false;
    game.musicStop();
    game.ambience(venueOf(a.i) === "throne" ? "wind" : venueOf(a.i) === "moon" || venueOf(a.i) === "night" ? "wind" : null, 0.18);
    runStory(a);
  },
  update: function () {
    if (storyView.card) return;
  },
  draw: function (g) {
    var t = game.time;
    ART.venue(g, storyView.venue, t * 0.45, { kingEye: 0, mood: "calm" });
    if (storyView.card) {
      drawActCard(g, storyView.cardAct);
      return;
    }
    if (storyView.speaker !== "narr") {
      g.window(50, 12, 60, 68, { thin: true });
      g.dither(51, 13, 58, 66, MID, 1);
      ART.portrait(g, storyView.speaker, storyView.mood, 56, 18);
    } else {
      /* a small ink-brush mark so the narrator still has a face */
      g.window(60, 24, 40, 28, { thin: true });
      ART.inkSplash(g, 80, 44, 8, MID);
      g.text(tt("旁白", "NARRATOR"), 80, 27, { align: "center", color: DARK });
    }
    g.rect(0, 137, 160, 7, PAPER);
    g.text(T(TX.storyKeys), 80, 132, { align: "center", color: DARK });
  }
});
function drawActCard(g, n) {
  var act = STORY.ACTS[n - 1];
  var k = Math.min(1, (game.time - storyView.cardAt) / 0.45);
  /* curtains sweep in from both sides */
  var cw = Math.round(50 * (1 - k) + 8 * k);
  g.rect(0, 0, cw, 144, INK);
  g.rect(160 - cw, 0, cw, 144, INK);
  for (var x = 0; x < cw; x += 4) {
    g.rect(x, 0, 1, 144, DARK);
    g.rect(159 - x, 0, 1, 144, DARK);
  }
  g.dither(0, 0, 160, 144, INK, 1);
  g.window(8, 22, 144, 96);
  bigText(g, String(n), 20, 32, 4, INK, "center");
  g.rect(36, 32, 1, 24, INK);
  var th = g.text(T(act.title), 40, 30, { width: 112 });
  var sy = 30 + th + 2;
  var sh = g.text(T(act.sub), 40, sy, { color: DARK, width: 112 });
  var qy = sy + sh + 6;
  var qh = g.text(T(act.color), 12, qy, { color: DARK, width: 136 });
  g.text(tt("三百人，一个人，一支曲。", "A crowd, a man, a tune."), 80, qy + qh + 4, { align: "center", color: DARK });
}

/* ---------- song select: a scrolling list of ten ---------- */
var selectSel = 0, selectTop = 0, selectLock = 0;
var ROW_H = 23, VIEW_ROWS = 4, LIST_Y = 20;
game.scene("select", {
  enter: function (a) {
    selectSel = Math.max(0, Math.min(SONGS.length - 1, a && a.i != null ? a.i : profile.story));
    if (selectSel >= SONGS.length) selectSel = 0;
    selectTop = Math.max(0, Math.min(SONGS.length - VIEW_ROWS, selectSel - 1));
    selectLock = game.time + 0.18;
    game.musicStop();
    game.ambience(null);
  },
  update: function () {
    var canGo = game.time >= selectLock;
    var d = game.dir().y;
    if (d) {
      selectSel = (selectSel + d + SONGS.length) % SONGS.length;
      game.sfx("move");
    }
    if (selectSel < selectTop) selectTop = selectSel;
    if (selectSel >= selectTop + VIEW_ROWS) selectTop = selectSel - VIEW_ROWS + 1;
    selectTop = Math.max(0, Math.min(SONGS.length - VIEW_ROWS, selectTop));
    var go = canGo && (game.pressed("a") || game.pressed("start"));
    if (canGo && game.pointer.pressed) {
      var row = Math.floor((game.pointer.y - LIST_Y) / ROW_H);
      if (row >= 0 && row < VIEW_ROWS && game.pointer.y >= LIST_Y && game.pointer.y < LIST_Y + VIEW_ROWS * ROW_H) {
        selectSel = selectTop + row; go = true;
      }
    }
    if (game.pressed("b")) { game.sfx("miss"); game.go("title"); return; }
    if (go) {
      game.sfx("tap");
      game.go("play", { i: selectSel, story: false }, { fade: true, to: PAPER });
    }
  },
  draw: function (g) {
    g.clear(PAPER);
    g.rect(0, 0, 160, 18, INK);
    g.text(tt("曲目", "Songs"), 6, 2, { color: PAPER });
    g.text((selectSel + 1) + "/" + SONGS.length, 154, 2, { align: "right", color: PAPER });
    for (var row = 0; row < VIEW_ROWS; row++) {
      var i = selectTop + row;
      if (i >= SONGS.length) break;
      var s = SONGS[i], y = LIST_Y + row * ROW_H, on = i === selectSel;
      if (on) g.rect(2, y, 156, ROW_H - 1, INK);
      else if (row % 2) g.rect(2, y, 156, ROW_H - 1, MID);
      /* act badge */
      var act = "I".repeat(Math.max(1, s.act));
      g.text(act, 6, y + 1, { color: on ? PAPER : DARK });
      g.text((i + 1) + "." + T(s.name), 20, y + 1, { color: on ? PAPER : INK });
      var b = profile.best[s.id];
      g.text(b ? b.rank : T(TX.fresh), 154, y + 1, { align: "right", color: on ? PAPER : DARK });
      for (var k = 0; k < 5; k++) g.rect(20 + k * 6, y + 15, 4, 2, k < s.difficulty ? (on ? PAPER : INK) : MID);
      if (b) g.text(String(b.score), 154, y + 12, { align: "right", color: on ? PAPER : DARK });
      if (i === profile.story) {
        var mk = on ? PAPER : INK;
        g.rect(4, y + 15, 5, 1, mk);
        g.rect(5, y + 14, 3, 1, mk);
        g.rect(6, y + 16, 2, 1, mk);
        g.rect(7, y + 17, 1, 1, mk);
      }
    }
    /* scroll rail */
    if (SONGS.length > VIEW_ROWS) {
      var railH = Math.round(VIEW_ROWS * ROW_H * VIEW_ROWS / SONGS.length);
      var railY = LIST_Y + Math.round((VIEW_ROWS * ROW_H - railH) * selectTop / (SONGS.length - VIEW_ROWS));
      g.rect(159, LIST_Y, 1, VIEW_ROWS * ROW_H, MID);
      g.rect(158, railY, 2, railH, INK);
    }
    var sel = SONGS[selectSel];
    g.text("(" + (selectSel + 1) + ") " + T(sel.credit), 80, 114, { align: "center", color: DARK });
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
      if (howPage < 3) howPage++;
      else game.go("title");
    }
  },
  draw: function (g) {
    g.clear(PAPER);
    g.rect(0, 0, 160, 18, INK);
    g.text(T(TX.howTitle), 6, 2, { color: PAPER });
    g.text((howPage + 1) + "/4", 154, 2, { align: "right", color: PAPER });
    g.window(4, 20, 152, 110);
    var txt = [T(TX.how1), T(TX.how2), T(TX.how3), T(TX.how4)][howPage];
    g.text(txt, 9, 25, { width: 142 });
    var top = 84;
    if (howPage === 0) {
      g.rect(9, 84, 142, 40, INK);
      for (var r = 0; r < 4; r++) g.rect(10, 92 + r * 7, 140, 1, MID);
      g.rect(46, 88, 2, 32, PAPER);
      for (var i = 0; i < 3; i++) {
        var x = 154 - ((game.time * 34 + i * 42) % 112);
        var y = 92 + (i % 3) * 7;
        g.circle(x, y, 2, PAPER, true);
        g.rect(x + 2, y - 5, 1, 5, PAPER);
      }
      keycap(g, "A", 14, 90, 2);
      g.text(tt("长条 = 按住", "bar = hold"), 48, 100, { color: PAPER });
    } else if (howPage === 1) {
      g.rect(9, 84, 142, 38, INK);
      var lid = 0.55 + 0.45 * Math.abs(Math.sin(game.time * 1.6));
      drawEye(g, 24, 90, 52, 24, lid);
      g.text(tt("别按", "FREEZE"), 114, 96, { align: "center", color: PAPER });
    } else if (howPage === 2) {
      g.rect(9, 84, 142, 40, INK);
      g.rect(38, 86, 2, 34, PAPER);
      for (i = 0; i < 3; i++) {
        x = 148 - ((game.time * 30 + i * 40) % 106);
        y = 90 + (i % 2) * 10;
        if (i === 1) {
          g.rect(x - 2, y, 5, 1, PAPER); g.rect(x - 1, y - 1, 3, 3, PAPER); g.rect(x, y - 2, 1, 5, PAPER);
          g.frame(x - 2, y - 2, 5, 5, MID);
        } else {
          g.circle(x, y, 2, PAPER, true);
          g.rect(x + 2, y - 5, 1, 5, PAPER);
        }
      }
      keycap(g, "A", 14, 106, 1);
      g.text(tt("竽", "sheng"), 28, 107, { color: PAPER });
      keycap(g, "B", 60, 106, 1);
      g.text(tt("磬", "chime"), 74, 107, { color: PAPER });
    } else {
      g.rect(9, 84, 142, 40, INK);
      drawEye(g, 16, 88, 48, 22, 1);
      g.text(tt("停", "STOP"), 114, 86, { align: "center", color: PAPER });
      g.text(tt("等", "WAIT"), 114, 98, { align: "center", color: PAPER });
      g.text(tt("起", "GO"), 114, 110, { align: "center", color: PAPER });
    }
    g.text(howPage < 3 ? T(TX.howKeys) : T(TX.howDone), 80, 132, { align: "center", color: DARK });
  }
});

/* ---------- performance ---------- */
var P = null;

function buildPlay(i, storyMode) {
  var s = SONGS[i];
  var lo = 127, hi = 0;
  s.chart.forEach(function (n) {
    var m = midiOfNote(n.note);
    if (m < lo) lo = m; if (m > hi) hi = m;
  });
  if (hi - lo < 8) { var c = (hi + lo) / 2; lo = c - 4; hi = c + 4; }
  lo -= 1; hi += 1;
  var firstB = null;
  s.chart.forEach(function (n) { if (n.lane === "b" && firstB === null) firstB = n.t; });
  return {
    i: i, song: s, story: !!storyMode, start: game.time, t: 0, lo: lo, hi: hi,
    combo: 0, maxCombo: 0, score: 0, perfect: 0, good: 0, miss: 0, noise: 0, caught: 0,
    suspicion: 0, total: s.chart.length, judged: {}, hold: null,
    puffs: [], bits: [], judge: null, judgeUntil: 0,
    warned: {}, inEye: {}, eye: false, banner: "", bannerUntil: 0,
    ended: false, failed: false, endAt: 0,
    lastBeat: -1, startPuff: 0, sweat: 0, clap: false,
    hasB: firstB !== null, firstB: firstB === null ? 1e9 : firstB,
    bHinted: false, bHits: 0, eyeHeld: 0, eyeCaught: false,
    touchA: false, caughtCool: 0, pause: null
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
function noteScreenY(P, note) {
  return note.lane === "b" ? 45 : noteY(P, note);
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
function setBanner(P, text, until) { P.banner = text; P.bannerUntil = until; }
function puffAt(P, y, kind) {
  P.puffs.push({ x: 40, y: y, t: 0, kind: kind || 0 });
  for (var i = 0; i < 5; i++) {
    P.bits.push({ x: 40, y: y, vx: 0.6 + Math.random() * 1.2, vy: (Math.random() - 0.5) * 1.6, life: 0.35, tone: Math.random() < 0.5 ? INK : DARK });
  }
}
function blip(P, note, perfect) {
  if (!note) return;
  if (note.lane === "b") {
    game.sfx({ wave: "triangle", duty: 3, from: Math.round(note.f * 2), to: Math.round(note.f * 2), ms: perfect ? 240 : 180, attack: 2, decay: perfect ? 220 : 160, vol: perfect ? 0.4 : 0.3 });
    return;
  }
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
  if (note && note.lane === "b") { gain += 15; P.bHits++; }
  P.score += gain;
  if (perfect) P.perfect++; else P.good++;
  P.suspicion = Math.max(0, P.suspicion - (perfect ? 1.6 : 0.8));
  setJudge(P, note && note.lane === "b" ? T(TX.chime) : perfect ? T(TX.perfect) : T(TX.good), INK, 0.45);
  puffAt(P, note ? noteScreenY(P, note) : 64, perfect ? 1 : 0);
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
  if (why === "break") P.puffs.push({ x: 40, y: noteScreenY(P, note), t: 0, kind: 2 });
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
  P.eyeCaught = true;
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
  return {
    score: P.score, maxCombo: P.maxCombo, perfect: P.perfect, good: P.good, miss: P.miss,
    noise: P.noise, caught: P.caught, suspicion: Math.round(P.suspicion), total: P.total,
    acc: acc, rank: rank, failed: P.failed, bHits: P.bHits
  };
}
function nearestNote(P, t, lane) {
  var best = null, bd = 1e9;
  for (var i = 0; i < P.song.chart.length; i++) {
    var n = P.song.chart[i];
    if (P.judged[n.t] || n.lane !== lane) continue;
    var d = n.t - t;
    if (d < -GOOD) continue;
    if (d > EARLY) break;
    var ad = Math.abs(d);
    if (ad < bd) { bd = ad; best = n; }
  }
  return best;
}
function pressLane(P, t, lane) {
  var note = nearestNote(P, t, lane);
  if (note) {
    if (t < note.t - GOOD) {
      setJudge(P, T(TX.early), DARK, 0.35);
      game.sfx("tick");
      return;
    }
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
    return;
  }
  if (t > P.song.chart[0].t - 0.35 && t < P.song.chart[P.song.chart.length - 1].end + GOOD) wrongPress(P);
}

var PAUSE_LINES = {
  continue: [
    { zh: "（南郭放下竽，活动了一下手腕。）", en: "(Nan Guo lowers the sheng and rolls his wrists.)" },
    { zh: "南郭：王上，容臣喘口气，把这一句接上。", en: "Nan Guo: Sire, let me catch my breath and pick up the phrase." }
  ],
  retry: [
    { zh: "（南郭把竽转了半圈，装作在调簧片。）", en: "(Nan Guo turns the sheng and pretends to tune a reed.)" },
    { zh: "南郭：乐正，刚才那口气没托住。容我再来一遍。", en: "Nan Guo: Music Master, that breath slipped. One more time." },
    { zh: "乐正：就一遍。", en: "Music Master: One more." }
  ],
  leave: [
    { zh: "南郭：王上，臣忽然腹痛，想请一日病假。", en: "Nan Guo: Sire, my stomach has turned. May I take a day's sick leave?" },
    { zh: "（他抱着竽，从侧门溜了。）", en: "(He hugs the sheng and slips out the side door.)" }
  ]
};
function pauseLines(kind) {
  return PAUSE_LINES[kind].map(function (l) { return T(l); });
}
function nextResumeBeat(P) {
  var beatSec = 60 / P.song.bpm;
  var cur = P.t / beatSec;
  var next = Math.ceil(cur / 4) * 4;
  for (var guard = 0; guard < 8; guard++) {
    var nextSec = next * beatSec;
    var inside = P.song.watch.some(function (w) { return nextSec >= w[0] && nextSec < w[1]; });
    if (!inside) break;
    next += 4;
  }
  var max = P.song.totalBeats - 4;
  if (next > max) next = max;
  if (next < 4) next = 4;
  return next;
}
function openPause(P) {
  P.pause = { kind: "menu", sel: 0, action: null, resumeBeat: 0, countAt: 0 };
  game.musicStop();
  game.sfx("tap");
}
function beginPauseTalk(P, action) {
  var q = P.pause;
  if (!q) return;
  q.kind = "talk";
  q.action = action;
  if (action === "continue") q.resumeBeat = nextResumeBeat(P);
  game.say(pauseLines(action), { speed: 32 }).then(function () {
    if (P.pause !== q) return;
    if (action === "leave") { P.pause = null; game.go("title", null, { fade: true, to: PAPER }); return; }
    q.kind = "count";
    q.countAt = game.time;
  });
}
function finishCountdown(P) {
  var q = P.pause;
  if (!q) return;
  if (q.action === "retry") {
    P.pause = null;
    game.go("play", { i: P.i, story: P.story }, { fade: false });
    return;
  }
  var beatSec = 60 / P.song.bpm, resumeT = q.resumeBeat * beatSec;
  for (var i = 0; i < P.song.chart.length; i++) {
    var n = P.song.chart[i];
    if (n.t < resumeT - 0.001 && !P.judged[n.t]) { P.judged[n.t] = "skip"; P.total--; }
  }
  if (P.hold) {
    if (!P.judged[P.hold.note.t]) { P.judged[P.hold.note.t] = "skip"; P.total--; }
    P.hold = null;
  }
  /* the chip starts the resumed score just after the call, as it did at the song's start */
  P.start = game.time + 0.06 - resumeT;
  P.t = resumeT - 0.06;
  P.eye = false; P.inEye = {}; P.warned = {};
  P.banner = ""; P.judge = null; P.touchA = false;
  P.pause = null;
  game.music(P.song.resumeAt(q.resumeBeat), { loop: false });
  game.sfx("tap");
}
function updatePause(P) {
  var q = P.pause;
  if (!q || q.kind === "talk") return;
  if (q.kind === "menu") {
    var d = game.dir().y;
    if (d) { q.sel = (q.sel + d + 3) % 3; game.sfx("move"); }
    if (game.pressed("start") || game.pressed("b")) {
      q.kind = "count"; q.action = "continue"; q.resumeBeat = nextResumeBeat(P); q.countAt = game.time;
      game.sfx("tap"); return;
    }
    if (game.pressed("a")) {
      game.sfx("tap");
      if (q.sel === 0) beginPauseTalk(P, "continue");
      else if (q.sel === 1) beginPauseTalk(P, "retry");
      else beginPauseTalk(P, "leave");
      return;
    }
    if (game.pointer.pressed) {
      var row = Math.floor((game.pointer.y - 56) / 16);
      if (row >= 0 && row < 3 && game.pointer.x >= 28 && game.pointer.x < 132) {
        q.sel = row; game.sfx("tap");
        if (row === 0) beginPauseTalk(P, "continue");
        else if (row === 1) beginPauseTalk(P, "retry");
        else beginPauseTalk(P, "leave");
      }
    }
  } else if (q.kind === "count" && game.time - q.countAt > 3.2) {
    finishCountdown(P);
  }
}
function drawPause(g, P) {
  var q = P.pause;
  if (!q) return;
  g.dither(0, 0, 160, 144, INK, 2);
  if (q.kind === "menu") {
    g.window(28, 36, 104, 66);
    g.text(T(TX.pauseTitle), 80, 41, { align: "center" });
    var items = [T(TX.pause0), T(TX.pause1), T(TX.pause2)];
    for (var i = 0; i < 3; i++) {
      var y = 57 + i * 16;
      if (i === q.sel) {
        g.rect(31, y - 1, 98, 15, INK);
        g.text(items[i], 80, y, { align: "center", color: PAPER });
      } else g.text(items[i], 80, y, { align: "center" });
    }
    g.text(T(TX.pauseKeys), 80, 136, { align: "center", color: PAPER });
  } else {
    g.window(30, 10, 100, 68);
    ART.portrait(g, "nanguo", "worried", 56, 15);
    if (q.kind === "count") {
      var left = 3 - Math.floor(game.time - q.countAt);
      bigText(g, left > 0 ? String(left) : "GO", 80, 84, 4, PAPER, "center");
    }
  }
}

game.scene("play", {
  enter: function (a) {
    P = buildPlay(a.i, a.story);
    P.caughtCool = 0;
    game.ambience(P.song.venue === "throne" ? "wind" : P.song.venue === "night" || P.song.venue === "moon" ? "wind" : null, 0.14);
    if (a.retry) {
      P.pause = { kind: "talk", sel: 0, action: "retry", resumeBeat: 0, countAt: 0 };
      game.say(pauseLines("retry"), { speed: 32 }).then(function () {
        if (!P || !P.pause) return;
        P.pause.kind = "count";
        P.pause.countAt = game.time;
      });
    } else {
      game.music(P.song.music, { loop: false });
    }
  },
  update: function () {
    if (!P) return;
    if (P.pause) { updatePause(P); return; }
    if (!P.ended && game.pressed("start")) { openPause(P); return; }
    var dt = 1 / 60;
    P.t = game.time - P.start;
    var t = P.t, beat = t * P.song.bpm / 60;
    var beatSec = 60 / P.song.bpm;
    if (P.caughtCool > 0) P.caughtCool -= dt;
    if (P.sweat > 0) P.sweat -= dt;

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
          setBanner(P, T(TX.watchWarn), w[0] + 0.2);
          game.sfx({ wave: "square", duty: 2, from: 880, to: 880, ms: 70, vol: 0.4 });
        }
        if (!P.inEye[i] && t >= w[0] && t < w[1]) {
          P.inEye[i] = true;
          P.eyeHeld = 0;
          P.eyeCaught = false;
          setBanner(P, T(TX.watch), w[1]);
          game.sfx({ wave: "triangle", from: 120, to: 80, ms: 280, vol: 0.5 });
          /* a hold ending at the gaze is the release cue; only longer holds break */
          if (P.hold && P.hold.note.end > w[0] + 0.06) { missNote(P, P.hold.note, "break"); P.hold = null; }
        }
        if (P.inEye[i] && t >= w[1]) {
          P.inEye[i] = false;
          P.eyeHeld = 0;
          setBanner(P, T(TX.playOn), t + 0.6);
          game.sfx("tick");
        }
      }
      var eye = inWatch(P, t);
      P.eye = eye;

      /* touch: the screen is A, except the chime button */
      var p = game.pointer;
      var tB = false;
      var touchUp = p.released && P.touchA;
      if (p.pressed) {
        if (P.hasB && inBox(p, TOUCH_B)) tB = true;
        else P.touchA = true;
      }
      if (p.released) P.touchA = false;

      var down = game.pressed("a") || (p.pressed && !inBox(p, TOUCH_B));
      var bdown = game.pressed("b") || tB;
      var up = game.released("a") || touchUp;

      if (eye) {
        if (down || bdown) caught(P);
        var holding = game.btn("a") || game.btn("b");
        if (holding) {
          P.eyeHeld += dt;
          if (!P.eyeCaught && P.eyeHeld > 0.12) { caught(P); P.eyeCaught = true; }
        } else P.eyeHeld = 0;
      } else if (!P.ended) {
        if (down) pressLane(P, t, "a");
        if (bdown) pressLane(P, t, "b");
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
          P.judged[hn.t] = "hit";
          scoreHit(P, hn, P.hold.perfect);
          P.hold = null;
        }
      }

      /* first chime hint */
      if (P.hasB && !P.bHinted && t >= P.firstB - 1.6 && t < P.firstB + 0.4) {
        P.bHinted = true;
        setBanner(P, T(TX.chimeHint), P.firstB + 0.5);
        game.sfx("tick");
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

      if (!eye) P.suspicion = Math.max(0, P.suspicion - dt * 0.55);
      if (t > P.song.seconds + 0.25) finish(P);
    } else if (game.time - P.endAt > (P.failed ? 1.05 : 1.5)) {
      var stats = resultStats(P);
      if (!P.failed) {
        var b = profile.best[P.song.id];
        stats.newBest = !b || stats.score > b.score;
        if (stats.newBest) profile.best[P.song.id] = { score: stats.score, rank: stats.rank, acc: stats.acc, combo: stats.maxCombo };
        profile.cleared[P.song.id] = true;
        if (P.story) profile.story = Math.max(profile.story, P.i + 1);
        if (clearedCount() === SONGS.length) profile.finaled = true;
      }
      saveProfile();
      game.go("result", { i: P.i, stats: stats, story: P.story }, { fade: true, to: PAPER });
    }
    var bi = Math.floor(beat);
    if (bi !== P.lastBeat) { P.lastBeat = bi; P.startPuff = 0.08; }
    if (P.startPuff > 0) P.startPuff -= dt;
  },
  draw: function (g) {
    if (!P) return;
    var t = P.t, beat = t * P.song.bpm / 60;
    var mood = P.ended && !P.failed ? "happy" : P.suspicion > 55 || P.eye ? "shock" : P.maxCombo >= 25 ? "happy" : "calm";
    ART.venue(g, P.song.venue, beat, {
      kingEye: P.suspicion > 55 || P.eye ? 2 : P.suspicion > 22 ? 1 : 0,
      look: P.suspicion > 70 ? 1 : 0, mood: mood, clap: P.ended && !P.failed,
      kingMood: P.suspicion > 55 ? "angry" : "calm", petals: P.song.venue === "garden"
    });
    ART.scroll(g, { eye: P.eye, act: P.song.act });
    /* the mouth and the staff */
    g.rect(36, 84, 6, 3, INK);
    g.rect(34, 86, 4, 3, MID);
    if (P.startPuff > 0 || (P.hold && Math.sin(game.time * 20) > 0)) { g.rect(42, 84, 3, 1, INK); g.rect(43, 86, 2, 1, INK); }
    g.rect(38, 42, 1, 42, DARK);
    g.rect(37, 42, 3, 42, P.eye ? MID : PAPER);
    g.rect(38, 42, 1, 42, P.eye ? MID : DARK);
    /* lane labels */
    g.text("A", 10, 82, { color: DARK });
    if (P.hasB) g.text("B", 10, 41, { color: DARK });
    if (P.eye) {
      var ws = watchStart(P), we = watchEnd(P);
      var u = we > ws ? (t - ws) / (we - ws) : 0;
      var lid = Math.min(1, 0.3 + Math.min(1, (t - ws) * 5));
      /* later songs fake a blink: the lid dips but the gaze is still on */
      if (P.song.act >= 2 && u > 0.42 && u < 0.62) {
        var k = (u - 0.42) / 0.20;
        lid *= 1 - Math.sin(k * Math.PI) * 0.82;
      }
      drawEye(g, 49, 38, 62, 22, lid);
      g.text(tt("别按", "FREEZE"), 80, 64, { align: "center", color: INK });
      for (var gi = 0; gi < 4; gi++) {
        var gt = ws + 0.35 + gi * 0.65;
        if (gt >= we) break;
        var gx = 40 + (gt - t) * (118 / 2.2);
        if (gx < 34 || gx > 162) continue;
        drawGhost(g, gx, gi % 2 ? 86 : 78, DARK);
      }
    }
    var lead = 2.2;
    for (var i = 0; i < P.song.chart.length; i++) {
      var n = P.song.chart[i];
      if (P.judged[n.t] && P.judged[n.t] !== "hold") continue;
      if (P.eye) continue;
      var x = 40 + (n.t - t) * (118 / lead);
      if (x < 34 || x > 162) continue;
      var y = noteScreenY(P, n);
      var near = x - 40 < 8 && x - 40 > -4;
      if (n.lane === "b") {
        drawDiamond(g, x, y, near ? 3 : 2, near ? INK : DARK);
      } else if (n.hold) {
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
    if (P.hold) {
      var hn = P.hold.note, hx = 40 + (hn.t - t) * (118 / lead);
      var hxe = 40 + (hn.end - t) * (118 / lead);
      var frac = Math.max(0, Math.min(1, (t - hn.t) / (hn.end - hn.t)));
      g.rect(hx, noteY(P, hn) - 3, Math.max(2, hxe - hx), 1, INK);
      g.rect(hx, noteY(P, hn) + 2, Math.max(2, Math.round((hxe - hx) * frac)), 1, INK);
    }
    /* puffs and particles */
    P.puffs.forEach(function (p) {
      var r = Math.round(p.t * 44);
      if (p.kind === 2) { g.line(p.x - 4, p.y - 4, p.x + 4, p.y + 4, INK); g.line(p.x + 4, p.y - 4, p.x - 4, p.y + 4, INK); }
      else { g.circle(p.x + r, p.y, Math.max(1, r), p.kind ? INK : MID, false); }
    });
    P.bits.forEach(function (b) { if (b.life > 0) g.rect(Math.round(b.x), Math.round(b.y), 1, 1, b.tone); });
    /* people */
    ART.player(g, 8, 90, { puff: P.startPuff > 0 || (P.hold && Math.sin(game.time * 24) > 0), sweat: P.sweat > 0, mood: P.suspicion > 50 ? "worried" : "calm" });
    var kinds = ["sheng", "qin", "drum", "bell", "flute"];
    for (i = 0; i < 5; i++) {
      ART.musician(g, 52 + i * 18, 100, kinds[i], beat + i * 0.08, P.eye ? "worried" : "");
    }
    ART.conductor(g, 136, 96, beat, DARK);
    /* HUD */
    g.rect(0, 0, 160, 16, PAPER);
    g.rect(0, 15, 160, 1, INK);
    g.text(T(P.song.short), 4, 1);
    if (P.combo >= 2) {
      bigText(g, String(P.combo), 72, 3, 2, INK, "center");
      g.text(tt("连", "x"), 88, 2, { color: DARK });
    } else {
      keycap(g, "A", 62, 3, 1);
      g.text(tt("吹", "play"), 74, 2, { color: DARK });
      if (P.hasB) { keycap(g, "B", 92, 3, 1); g.text(tt("敲", "hit"), 104, 2, { color: DARK }); }
    }
    drawSuspicion(g, P.suspicion);
    /* touch button */
    if (P.hasB) touchButton(g, TOUCH_B, T(TX.touchB), false);
    /* banner */
    if (P.banner && t < P.bannerUntil) {
      g.window(22, 18, 116, 16);
      g.text(P.banner, 80, 21, { align: "center" });
    }
    /* judge */
    if (P.judge && game.time < P.judgeUntil) {
      var jw = g.measure(P.judge.text) + 10;
      var jy = P.eye ? 92 : 86;
      g.window(80 - Math.round(jw / 2), jy, jw, 15);
      g.text(P.judge.text, 80, jy + 2, { align: "center", color: P.judge.tone });
    }
    /* intro */
    var first = P.song.chart[0].t;
    if (t < first && !P.ended) {
      var beatsLeft = (first - t) / (60 / P.song.bpm);
      g.window(6, 16, 148, 32);
      g.text(beatsLeft > 1 ? T(TX.ready) : T(TX.go), 12, 19);
      g.text(T(P.song.name), 148, 19, { align: "right", color: DARK });
      g.text(tt("王上睁眼：别按", "Eye open: freeze"), 80, 34, { align: "center", color: DARK });
    }
    /* fail */
    if (P.ended && P.failed) {
      g.rect(0, 24, 160, 44, PAPER); g.frame(0, 24, 160, 44, INK);
      g.text(T(TX.failed), 80, 34, { align: "center" });
      g.text(T(TX.failTip), 80, 50, { align: "center", color: DARK });
    }
    if (P.ended && !P.failed && game.time - P.endAt < 1.4) {
      g.rect(0, 30, 160, 36, PAPER); g.frame(0, 30, 160, 36, INK);
      g.text(T(TX.success), 80, 35, { align: "center" });
      g.text(T(TX.cheer), 80, 50, { align: "center", color: DARK });
    }
    drawPause(g, P);
  }
});
var TOUCH_B = { x: 120, y: 122, w: 36, h: 20 };
function touchButton(g, b, label, off) {
  g.rect(b.x, b.y, b.w, b.h, PAPER);
  g.frame(b.x, b.y, b.w, b.h, off ? MID : INK);
  g.text(label, b.x + Math.round(b.w / 2), b.y + 3, { align: "center", color: off ? MID : INK });
}
function drawDiamond(g, x, y, r, tone) {
  g.rect(x - r, y, r * 2 + 1, 1, tone);
  g.rect(x - r + 1, y - 1, r * 2 - 1, 3, tone);
  g.rect(x, y - r, 1, r * 2 + 1, tone);
  g.rect(x - 1, y - 1, 3, 3, PAPER);
  g.frame(x - r, y - 1, r * 2 + 1, 3, tone);
}
/* a tempting note that must not be played while the king looks */
function drawGhost(g, x, y, tone) {
  g.circle(x, y, 2, PAPER, true);
  g.circle(x, y, 2, tone, false);
  g.line(x - 1, y - 1, x + 1, y + 1, tone);
  g.line(x + 1, y - 1, x - 1, y + 1, tone);
}
function watchStart(P) {
  for (var i = 0; i < P.song.watch.length; i++) if (P.t >= P.song.watch[i][0] && P.t < P.song.watch[i][1]) return P.song.watch[i][0];
  return P.t;
}
function watchEnd(P) {
  for (var i = 0; i < P.song.watch.length; i++) if (P.t >= P.song.watch[i][0] && P.t < P.song.watch[i][1]) return P.song.watch[i][1];
  return P.t;
}
function drawEye(g, x, y, w, h, lid) {
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
function drawSuspicion(g, value) {
  var x = 112, y = 5;
  drawEye(g, x, y, 9, 5, 1);
  for (var i = 0; i < 5; i++) {
    var on = value > i * 20;
    g.rect(124 + i * 6, 4, 5, 7, PAPER);
    g.frame(124 + i * 6, 4, 5, 7, MID);
    if (on) g.rect(125 + i * 6, 5, 3, 5, INK);
  }
}

/* ---------- result ---------- */
var resultSel = 0, resultItems = [], resultArgs = null, resultLock = 0;
function resultOptions(stats, i, story) {
  if (stats.failed) return ["retry", "title"];
  if (story && i === SONGS.length - 1) return ["curtain", "retry", "choose"];
  return ["next", "retry", "choose"];
}
game.scene("result", {
  enter: function (a) {
    resultArgs = a;
    resultItems = resultOptions(a.stats, a.i, a.story);
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
      if (game.pointer.y >= 94 && game.pointer.y < 114) {
        for (var k = 0; k < n; k++) {
          var x = bx + k * (bw + gap);
          if (game.pointer.x >= x && game.pointer.x < x + bw) { resultSel = k; act = true; break; }
        }
      }
    }
    if (game.pressed("b")) {
      game.sfx("miss");
      if (resultArgs.stats.failed) game.go("title");
      else game.go("select", { i: resultArgs.i });
      return;
    }
    if (act) {
      game.sfx("tap");
      var what = resultItems[resultSel];
      if (what === "next") {
        if (resultArgs.story) game.go("story", { i: resultArgs.i, kind: "post", stats: resultArgs.stats }, { fade: true, to: PAPER });
        else {
          var nxt = (resultArgs.i + 1) % SONGS.length;
          game.go("play", { i: nxt, story: false }, { fade: false });
        }
      } else if (what === "retry") game.go("play", { i: resultArgs.i, story: resultArgs.story, retry: true }, { fade: false });
      else if (what === "curtain") game.go("ending", { stats: resultArgs.stats });
      else if (what === "title") game.go("title");
      else game.go("select", { i: resultArgs.i });
    }
  },
  draw: function (g) {
    var st = resultArgs.stats, s = SONGS[resultArgs.i];
    var beat = game.time * 1.6;
    ART.venue(g, s.venue, beat, { mood: st.failed ? "shock" : "happy", clap: !st.failed, kingEye: st.failed ? 2 : 0, look: 1 });
    if (!st.failed) ART.confetti(g, game.time, 20);
    g.window(6, 16, 148, 100);
    g.text(T(st.failed ? TX.failed : TX.success), 80, 20, { align: "center" });
    if (!st.failed && st.newBest) g.text(T(TX.newBest), 146, 20, { align: "right", color: DARK });
    g.text(T(TX.score) + " " + st.score, 14, 34, { color: DARK });
    g.text(T(TX.maxCombo) + " " + st.maxCombo, 14, 46, { color: DARK });
    g.text(T(TX.accuracy) + " " + Math.round(st.acc * 100) + "%", 14, 58, { color: DARK });
    g.text(T(TX.suspicion) + " " + st.suspicion, 14, 70, { color: DARK });
    g.text(T(TX.bHits) + " " + st.bHits, 14, 82, { color: DARK });
    bigText(g, st.rank, 126, 32, 4, INK, "center");
    g.text(rankName(st.rank), 126, 56, { align: "center", color: DARK });
    var names = { next: TX.next, retry: TX.retry, choose: TX.choose, curtain: TX.curtain, title: TX.menu };
    var n = resultItems.length, bw = n === 3 ? 44 : 66, gap = n === 3 ? 2 : 4;
    var bx = Math.round((160 - (n * bw + (n - 1) * gap)) / 2);
    for (var k = 0; k < n; k++) {
      var x = bx + k * (bw + gap), on = k === resultSel;
      if (on) g.rect(x, 94, bw, 18, INK);
      else g.frame(x, 94, bw, 18, DARK);
      g.text(T(names[resultItems[k]]), x + Math.round(bw / 2), 97, { align: "center", color: on ? PAPER : INK });
    }
    g.text(T(st.failed ? TX.resultKeysFail : TX.resultKeys), 80, 131, { align: "center", color: DARK });
  }
});

/* ---------- endings ---------- */
var endingKey = "trueSong";
game.scene("ending", {
  enter: function (a) {
    game.musicStop();
    endingKey = STORY.endingFor(profile.truth, a && a.stats);
    var e = STORY.ENDINGS[endingKey];
    /* record the ending before the dialogue so quitting mid-scene still counts it */
    profile.endings[endingKey] = true;
    profile.finaled = true;
    profile.story = 0;
    saveProfile();
    game.ambience(endingKey === "trueSong" || endingKey === "home" ? "stream" : null, 0.15);
    if (endingKey === "trueSong") game.music({ bpm: 72, p1: "@1 v9 o4 l4 a c e d", p2: "@0 v5 o3 l4 a c e d", tri: "v8 o2 l4 a a e e", noise: "l8 v2 x r x r" }, { loop: true });
    game.after(0.25, function () {
      game.say(e.pages.map(function (p) { return T(p); }), { speed: 30 }).then(function () {
        game.go("title", null, { fade: true, to: PAPER });
      });
    });
  },
  draw: function (g) {
    var e = STORY.ENDINGS[endingKey];
    drawEndingArt(g, endingKey, game.time);
    g.window(20, 10, 120, 44);
    g.text(T(e.title), 80, 14, { align: "center" });
    g.text(T(TX.endingTitle), 80, 28, { align: "center", color: DARK });
    g.text(T(TX.endingsSeen, { e: endingsCount() }), 80, 40, { align: "center", color: DARK });
  }
});
function drawEndingArt(g, key, t) {
  if (key === "horses") {
    g.clear(INK);
    g.rect(0, 0, 160, 76, DARK);
    for (var i = 0; i < 5; i++) {
      g.rect(i * 34, 8, 2, 76, INK);
      g.rect(i * 34 + 8, 18, 1, 58, MID);
    }
    /* horse */
    g.rect(68, 58, 36, 14, INK);
    g.rect(96, 44, 10, 16, INK);
    g.rect(101, 39, 4, 6, INK);
    g.rect(72, 48, 18, 10, INK);
    g.rect(76, 72, 4, 12, INK); g.rect(92, 72, 4, 12, INK);
    g.line(68, 62, 60, 56, INK);
    g.pixel(103, 44, PAPER);
    /* Nan Guo and a lantern */
    ART.player(g, 20, 82, { mood: "sad" });
    ART.lantern(g, 140, 50, t);
    g.rect(0, 112, 160, 4, MID);
  } else if (key === "home") {
    ART.dawn(g, t * 0.6, { petals: true });
    ART.player(g, 28, 88, { mood: "happy" });
    for (var k = 0; k < 3; k++) {
      ART.crowdHead(g, 78 + k * 18, 100, 3, DARK, "happy");
      g.rect(75 + k * 18, 103, 7, 8, DARK);
    }
    ART.musician(g, 130, 88, "sheng", t, "");
  } else if (key === "chief") {
    ART.hall(g, t * 0.8, { kingEye: 0, mood: "calm", spot: true, spotTone: PAPER });
    ART.player(g, 68, 64, { mood: "sly", roamed: true });
    for (var n = 0; n < 5; n++) ART.musician(g, 34 + n * 20, 106, "sheng", t + n * 0.1, "empty");
  } else {
    ART.dawn(g, t * 0.6, { petals: true, spot: true });
    ART.player(g, 34, 88, { mood: "happy" });
    ART.musician(g, 72, 90, "qin", t, "");
    ART.portrait(g, "min", "calm", 108, 32);
  }
}

game.start("boot");
