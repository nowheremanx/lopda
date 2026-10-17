var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";

/* ==== STORY: edit from here to END STORY ==== */
var TITLE = { zh: "雨站", en: "Rain Station" };
var CAST = {
  mei: { name: { zh: "小梅", en: "Mei" }, art: [
    "...0000.....", "..011110....", ".01111110...", ".01333310...", ".03033030...", ".03333330...",
    "..033330....", ".1.0330.1...", ".1022220....", ".02222220...", ".02222220...", ".02222220...",
    ".02222220...", "..022220....", "..02..20....", "..00..00...."] },
  old: { name: { zh: "站长", en: "Stationmaster" }, art: [
    "............", "..0000000...", ".000000000..", "..0333330...", "..3033303...", "..0333330...",
    "..0300030...", "...03330....", "..011110....", ".01111110...", ".01131110...", ".01111110...",
    ".01111110...", "..011110....", "..01..10....", "..00..00...."] }
};
var BACKDROPS = {
  station: function (g) {
    g.rect(0, 0, 160, 88, g.MID); g.dither(0, 0, 160, 50, g.DARK, 1);
    for (var i = 0; i < 30; i++) { var x = (i * 37 + Math.floor(game.time * 90)) % 160, y = (i * 23 + Math.floor(game.time * 140)) % 70; g.line(x, y, x - 2, y + 5, g.PAPER); }
    g.rect(0, 0, 160, 10, g.INK); g.rect(0, 72, 160, 16, g.DARK); g.line(0, 72, 160, 72, g.INK);
    g.rect(70, 14, 20, 10, g.PAPER); g.frame(70, 14, 20, 10, g.INK); g.line(80, 24, 80, 72, g.INK);
  },
  train: function (g) {
    g.rect(0, 0, 160, 88, g.PAPER); g.dither(0, 50, 160, 38, g.MID, 2);
    g.rect(0, 30, 160, 34, g.DARK); g.line(0, 30, 160, 30, g.INK); g.line(0, 64, 160, 64, g.INK);
    for (var x = 6; x < 160; x += 30) g.rect(x, 36, 20, 14, g.PAPER);
  },
  dawn: function (g) {
    g.rect(0, 0, 160, 88, g.PAPER); g.circle(80, 70, 18, g.MID, true);
    g.rect(0, 70, 160, 18, g.DARK); g.line(0, 70, 160, 70, g.INK);
  }
};
/* what you hear behind each backdrop: [ambience, level 0-1]; "title" is the title screen, anything not listed is quiet */
var AMBIENCE = { title: ["rain", 0.4], station: ["rain", 0.7], train: ["rain", 0.3] };
var SCRIPT = [
  { bg: "station" },
  { say: null, text: { zh: "末班车之后的小站。雨下得很大。", en: "A small station after the last train. Heavy rain." } },
  { say: null, text: { zh: "长椅上坐着一个拿着旧车票的女孩。", en: "A girl on the bench holds an old ticket." } },
  { show: "left", who: "mei" },
  { say: "mei", text: { zh: "你也错过车了吗？", en: "Did you miss the train too?" } },
  { choice: [
    { text: { zh: "是啊，跑慢了", en: "Yes, ran too slow" }, goto: "missed" },
    { text: { zh: "我是来等人的", en: "I'm meeting someone" }, goto: "waiting", set: "honest" }
  ] },
  { label: "missed" },
  { say: "mei", text: { zh: "那我们一样。", en: "Then we're the same." } },
  { goto: "ticket" },
  { label: "waiting" },
  { say: "mei", text: { zh: "等人？这么晚，谁还会来呢。", en: "Meeting someone? Who'd come this late?" } },
  { label: "ticket" },
  { say: "mei", text: { zh: "这张票是十年前的。我一直没用。", en: "This ticket is ten years old. I never used it." } },
  { show: "right", who: "old" },
  { say: "old", text: { zh: "两位，雨停之前还有一班夜车。", en: "Folks, one night train before the rain stops." } },
  { say: "old", text: { zh: "它只收旧车票。", en: "It only takes old tickets." } },
  { say: "mei", text: { zh: "……你说，我该上车吗？", en: "...Should I get on, do you think?" } },
  { choice: [
    { text: { zh: "上车吧", en: "Get on" }, goto: "board" },
    { text: { zh: "留下来等雨停", en: "Stay till it stops" }, goto: "stay", set: "stay" }
  ] },
  { label: "board" },
  { hide: "right" },
  { bg: "train" },
  { say: null, text: { zh: "夜车没有声音地开进了雨里。", en: "The night train slid silently into the rain." } },
  { if: "honest", goto: "goodbye" },
  { say: "mei", text: { zh: "谢谢你陪我等。下一站，我自己走。", en: "Thanks for waiting with me. I'll go on alone." } },
  { end: true, title: { zh: "结局：夜车", en: "Ending: Night Train" } },
  { label: "goodbye" },
  { say: "mei", text: { zh: "你等的人，其实就是我吧？", en: "The one you were meeting... it was me, right?" } },
  { say: "mei", text: { zh: "十年了。这次换我来等你。", en: "Ten years. This time I'll wait for you." } },
  { end: true, title: { zh: "结局：约定", en: "Ending: The Promise" } },
  { label: "stay" },
  { hide: "right" },
  { say: "mei", text: { zh: "好。那就再坐一会儿。", en: "All right. Let's sit a while longer." } },
  { bg: "dawn" },
  { say: null, text: { zh: "雨停了。天亮了。旧车票被风吹走了。", en: "The rain stopped. Dawn. The old ticket blew away." } },
  { say: "mei", text: { zh: "早班车来了。这次，我买新票。", en: "The early train. This time I'll buy a new ticket." } },
  { end: true, title: { zh: "结局：天亮", en: "Ending: Daybreak" } }
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
    if (!s) { cur = { kind: "end", title: "" }; return; }
    if (s.bg !== undefined) { S.bg = s.bg; S.pc++; listen(s.bg); }
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
  enter: function (saved) { S = saved || fresh(); log = []; view = "play"; if (S.bg) listen(S.bg); run(); },
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
  enter: function () { saved = null; menuIdx = 0; listen("title"); game.load("vn").then(function (v) { saved = v; }); },
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
