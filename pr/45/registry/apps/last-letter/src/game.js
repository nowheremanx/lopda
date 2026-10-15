
var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";

/* ==== STORY: edit from here to END STORY ==== */
var TITLE = { zh: "最后一封信", en: "The Last Letter" };
var CAST = {
  lin: { name: { zh: "林", en: "Lin" }, art: [
    "............", "...00000....", "..0111110...", "..0333330...", "..3033303...", "..0333330...",
    "...03330....", "....030.....", "..022220....", ".02222220...", ".02200220...", ".02222220...",
    ".02222220...", "..022220....", "..02..20....", "..00..00...."] },
  sora: { name: { zh: "苏拉", en: "Sora" }, art: [
    "..000000....", ".01111110...", "0111111110..", "0113333110..", "0130330310..", "0133333310..",
    "01033330.0..", "0..0330..0..", "..011110....", ".01111110...", ".01111110...", ".01111110...",
    ".01111110...", "..011110....", "..01..10....", "..00..00...."] }
};
var BACKDROPS = {
  office: function (g) {
    g.rect(0, 0, 160, 88, g.PAPER); g.dither(0, 0, 160, 56, g.MID, 1);
    g.rect(0, 56, 160, 32, g.DARK); g.line(0, 56, 160, 56, g.INK);
    for (var x = 4; x < 160; x += 12) { g.frame(x, 8, 10, 10, g.INK); g.frame(x, 20, 10, 10, g.INK); }
  },
  hill: function (g) {
    g.rect(0, 0, 160, 88, g.PAPER);
    for (var x = 0; x < 160; x++) { var y = 50 + Math.round(Math.sin(x / 20) * 8); g.line(x, y, x, 88, g.MID); }
    g.dither(0, 70, 160, 18, g.DARK, 2); g.circle(130, 20, 8, g.MID, false);
  },
  night: function (g) {
    g.rect(0, 0, 160, 88, g.INK); g.dither(0, 0, 160, 88, g.DARK, 1);
    g.rect(60, 30, 40, 30, g.MID); g.frame(60, 30, 40, 30, g.PAPER); g.line(60, 30, 80, 46, g.PAPER); g.line(100, 30, 80, 46, g.PAPER);
  }
};
var SCRIPT = [
  { bg: "office" },
  { say: null, text: { zh: "山脚的邮局。明天就要关门了。", en: "The post office at the foot of the hill. It closes tomorrow." } },
  { show: "left", who: "lin" },
  { say: "lin", text: { zh: "还剩最后一封信没送。", en: "One letter left to deliver." } },
  { say: "lin", text: { zh: "没有地址，只写着「山上的人」。", en: "No address. Just \"the one on the hill\"." } },
  { choice: [
    { text: { zh: "去山上送信", en: "Take it up the hill" }, goto: "climb", set: "went" },
    { text: { zh: "先拆开看看", en: "Open it first" }, goto: "open", set: "opened" }
  ] },
  { label: "open" },
  { say: null, text: { zh: "信里只有一句话：我还记得那首歌。", en: "One line inside: I still remember that song." } },
  { say: "lin", text: { zh: "……不该看的。还是送去吧。", en: "...Shouldn't have looked. I'll deliver it." } },
  { label: "climb" },
  { bg: "hill" },
  { say: null, text: { zh: "山路很长。风里有人在哼歌。", en: "A long path. Someone hums in the wind." } },
  { show: "right", who: "sora" },
  { say: "sora", text: { zh: "邮差？这里很多年没人来过了。", en: "A postman? No one's come up here in years." } },
  { say: "lin", text: { zh: "有你的信。", en: "There's a letter for you." } },
  { if: "opened", goto: "confess" },
  { say: "sora", text: { zh: "谢谢。你没有看过吧？", en: "Thank you. You didn't read it, did you?" } },
  { say: "lin", text: { zh: "没有。送信的人不看信。", en: "No. Postmen don't read letters." } },
  { say: "sora", text: { zh: "那我唱给你听吧。", en: "Then I'll sing it for you." } },
  { bg: "night" },
  { say: null, text: { zh: "那晚，山上传来了很久没有的歌声。", en: "That night, a song long unheard came from the hill." } },
  { end: true, title: { zh: "结局：歌", en: "Ending: The Song" } },
  { label: "confess" },
  { choice: [
    { text: { zh: "坦白看过了", en: "Admit I read it" }, goto: "admit" },
    { text: { zh: "什么也不说", en: "Say nothing" }, goto: "silent" }
  ] },
  { label: "admit" },
  { say: "sora", text: { zh: "……没关系。那首歌，你也想听吗？", en: "...It's fine. Want to hear the song too?" } },
  { say: "lin", text: { zh: "想。", en: "I do." } },
  { bg: "night" },
  { say: null, text: { zh: "两个人坐在山上，一直唱到天亮。", en: "The two sat on the hill and sang until dawn." } },
  { end: true, title: { zh: "结局：二重唱", en: "Ending: Duet" } },
  { label: "silent" },
  { say: "sora", text: { zh: "谢谢你。路上小心。", en: "Thank you. Careful on the way down." } },
  { hide: "right" },
  { bg: "office" },
  { say: "lin", text: { zh: "邮局关门了。我始终没听到那首歌。", en: "The office closed. I never heard that song." } },
  { end: true, title: { zh: "结局：沉默", en: "Ending: Silence" } }
];
/* ==== END STORY ==== */

/* ---- the engine: plays SCRIPT. You should not need to change anything below. ---- */
var ART = {}, LABELS = {};
function big(rows) { return rows.map(function (r) { return r.replace(/./g, "$&$&"); }).reduce(function (a, r) { a.push(r, r); return a; }, []); }
Object.keys(CAST).forEach(function (k) { ART[k] = LoGame.sprite(big(CAST[k].art)); });
SCRIPT.forEach(function (s, i) { if (s.label) LABELS[s.label] = i; });

var BOX_Y = 88, LINES = 3, SPEED = 30;
var S;          /* saved: { pc, flags, bg, left, right } */
var log = [];   /* backlog: [{ who, text }] */
var cur = null; /* what waits for the player: { kind: "say"|"choice"|"end", ... } */
var view = "play", logTop = 0;

function fresh() { return { pc: 0, flags: {}, bg: null, left: null, right: null }; }
function who(id) { return id && CAST[id] ? T(CAST[id].name) : ""; }
function jump(label) { if (!(label in LABELS)) throw new Error("no label " + label); S.pc = LABELS[label]; }

/* run steps until one needs the player */
function run() {
  for (var guard = 0; guard < 10000; guard++) {
    var s = SCRIPT[S.pc];
    if (!s) { cur = { kind: "end", title: "" }; return; }
    if (s.bg !== undefined) { S.bg = s.bg; S.pc++; }
    else if (s.show) { S[s.show] = s.who; S.pc++; }
    else if (s.hide) { S[s.hide] = null; S.pc++; }
    else if (s.label) S.pc++;
    else if (s.set) { S.flags[s.set] = true; S.pc++; }
    else if (s.if !== undefined) { if (S.flags[s.if]) jump(s.goto); else S.pc++; }
    else if (s.goto) jump(s.goto);
    else if (s.say !== undefined) {
      game.save("vn", S);
      cur = { kind: "say", who: s.say, text: T(s.text), pages: null, page: 0, n: 0 };
      log.push({ who: s.say, text: cur.text }); if (log.length > 100) log.shift();
      return;
    } else if (s.choice) { game.save("vn", S); cur = { kind: "choice", items: s.choice, idx: 0 }; return; }
    else if (s.end) { game.remove("vn"); game.sfx("win"); cur = { kind: "end", title: s.title ? T(s.title) : "" }; return; }
    else S.pc++;
  }
}

function advance() {
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
  return { x: 40, y: 68 + k * lineHeight, w: 80, h: lineHeight };
}

function contains(row, x, y) {
  return x >= row.x && x < row.x + row.w && y >= row.y && y < row.y + row.h;
}

game.scene("play", {
  enter: function (saved) { S = saved || fresh(); log = []; view = "play"; run(); },
  update: function (dt) {
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
    if (game.pressed("b") && cur.kind !== "end") { view = "log"; logTop = Math.max(0, log.length - 4); game.sfx("tap"); return; }
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
      g.text(cur.title || "END", 80, BOX_Y + 12, { align: "center" });
      g.text(T({ zh: "按 A 回到标题", en: "A: back to title" }), 80, BOX_Y + 30, { align: "center", color: g.INK });
    }
  }
});

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
  enter: function () { saved = null; menuIdx = 0; game.load("vn").then(function (v) { saved = v; }); },
  update: function () {
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
    g.text(T(TITLE), 80, 34, { align: "center" });
    var items = saved ? [T({ zh: "继续", en: "Continue" }), T({ zh: "从头开始", en: "New story" })] : [T({ zh: "开始", en: "Start" })];
    g.window(40, 64, 80, items.length * g.lineHeight + 8);
    items.forEach(function (s, k) {
      var row = titleRow(k), selected = k === menuIdx;
      if (selected) g.rect(row.x + 2, row.y, row.w - 4, row.h, g.INK);
      g.text(s, 54, row.y, { color: selected ? g.PAPER : g.INK });
    });
    g.rect(0, 112, 160, 32, g.PAPER);
    g.line(0, 112, 160, 112, g.INK);
    var hasSave = !!saved;
    g.text(T(hasSave ? { zh: "↑↓ 选  A 确定", en: "Up/Dn  A: OK" } : { zh: "A 开始", en: "A: start" }), 80, 115, { align: "center", color: g.INK });
    g.text(T({ zh: "剧情中 A 前进 B 回看", en: "Story: A next  B log" }), 80, 128, { align: "center", color: g.INK });
  }
});
game.start("title");
