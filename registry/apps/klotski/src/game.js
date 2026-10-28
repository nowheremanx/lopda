/* 华容道 / Klotski for Lo-PDA. The rules and solver are separate pure files; this is the handheld:
   the title, the open level list, the board, the master-class lessons, the records and the pages.
   Screen 160x200: 20 px header, the 4x5 board (120x150) at y=22, 28 px of hints. */
var game = LoGame.create({ width: 160, height: 200, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";

var SAVE_KEY = "klotski";
var HEAD = 20, BOARD_TOP = 22, BOARD_ROOM = 150, FOOT = 174;
var EXIT_SLIDE = 0.55, EXIT_WIPE = 0.35, EXIT_END = 3.1;
var ROW_H = 27, LIST_ROWS = 5;

/* ---------------- pointer: lo-game keeps only the latest point in a tick, so a quick down+up can
   lose where the finger started. These listeners keep both ends, for taps and for drags. ---------------- */
var PT = (function () {
  var st = { down: false, x0: 0, y0: 0, x: 0, y: 0, up: false, cancel: false, at: 0 };
  var canvas = typeof document !== "undefined" && document.querySelector ? document.querySelector("canvas") : null;
  function point(e) {
    var r = canvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left) * 160 / (r.width || 1));
    var y = Math.floor((e.clientY - r.top) * 200 / (r.height || 1));
    return { x: Math.max(0, Math.min(159, x)), y: Math.max(0, Math.min(199, y)) };
  }
  if (canvas && canvas.addEventListener) {
    canvas.addEventListener("pointerdown", function (e) {
      if (e.isPrimary === false) return;
      var p = point(e);
      st.down = true; st.up = false; st.cancel = false;
      st.x0 = st.x = p.x; st.y0 = st.y = p.y;
      if (e.preventDefault) e.preventDefault();
      if (canvas.setPointerCapture && e.pointerId !== undefined) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (e.isPrimary === false || !st.down) return;
      var p = point(e); st.x = p.x; st.y = p.y;
    });
    canvas.addEventListener("pointerup", function (e) {
      if (e.isPrimary === false) return;
      var p = point(e);
      st.x = p.x; st.y = p.y; st.down = false; st.up = true; st.at = Date.now();
      if (canvas.releasePointerCapture && e.pointerId !== undefined) { try { canvas.releasePointerCapture(e.pointerId); } catch (err) {} }
    });
    canvas.addEventListener("pointercancel", function () {
      st.down = false; st.cancel = true; st.at = Date.now();
    });
  }
  function take() {
    if (!st.up && !st.cancel) return null;
    var fresh = Date.now() - st.at < 400;
    var cancelled = st.cancel;
    var ev = {
      x0: st.x0, y0: st.y0, x: st.x, y: st.y,
      dx: st.x - st.x0, dy: st.y - st.y0,
      dist: Math.sqrt((st.x - st.x0) * (st.x - st.x0) + (st.y - st.y0) * (st.y - st.y0))
    };
    st.up = false; st.cancel = false;
    if (!fresh || cancelled) return null;
    return ev;
  }
  function clear() { st.down = false; st.up = false; st.cancel = false; }
  return { take: take, clear: clear };
})();

/* ---------------- save ---------------- */
function blankSave() { return { v: 1, levels: {}, lessons: {}, current: {}, seenHelp: 0 }; }
var saved = blankSave();
var loaded = false, loading = false;
function num(v) { return typeof v === "number" && isFinite(v) && v >= 0 ? v : 0; }
function normalize(v) {
  var out = blankSave(), k, r, l;
  if (!v || v.v !== 1) return out;
  if (v.levels && typeof v.levels === "object") {
    for (k in v.levels) {
      if (!Object.prototype.hasOwnProperty.call(v.levels, k)) continue;
      r = v.levels[k];
      if (!r || typeof r !== "object") continue;
      if (!num(r.best)) continue;
      out.levels[k] = { best: num(r.best), clean: num(r.clean), plays: num(r.plays), last: num(r.last), at: num(r.at) };
    }
  }
  if (v.lessons && typeof v.lessons === "object") {
    for (k in v.lessons) {
      if (!Object.prototype.hasOwnProperty.call(v.lessons, k)) continue;
      r = v.lessons[k];
      if (!r || typeof r !== "object" || !r.done) continue;
      out.lessons[k] = { done: 1, best: num(r.best), hints: num(r.hints), at: num(r.at) };
    }
  }
  if (v.current && typeof v.current === "object") {
    for (k in v.current) {
      if (!Object.prototype.hasOwnProperty.call(v.current, k)) continue;
      l = v.current[k];
      if (!l || typeof l !== "object" || !l.pos || !l.pos.length) continue;
      out.current[k] = { pos: l.pos, moves: num(l.moves), hints: num(l.hints), undos: num(l.undos), assisted: l.assisted ? 1 : 0 };
    }
  }
  out.seenHelp = v.seenHelp ? 1 : 0;
  return out;
}
function save() { game.save(SAVE_KEY, saved); }
function ensureLoaded() {
  if (loaded || loading) return;
  loading = true;
  game.load(SAVE_KEY).then(function (v) {
    saved = normalize(v); loaded = true; loading = false;
  }, function () {
    saved = blankSave(); loaded = true; loading = false;
  });
}

/* ---------------- the tables ---------------- */
var LEVELS = [], LESSONS = [], BY_ID = {};
function prepare() {
  var i, d, l;
  for (i = 0; i < KLOTSKI_DATA.levels.length; i++) {
    d = KLOTSKI_DATA.levels[i];
    l = KRules.parse(d.rows);
    l.id = d.id; l.kind = "level"; l.num = i + 1; l.diff = d.diff; l.par = d.par;
    l.name = d.name; l.goal = { exit: true };
    LEVELS.push(l); BY_ID[d.id] = l;
  }
  for (i = 0; i < KLOTSKI_DATA.lessons.length; i++) {
    d = KLOTSKI_DATA.lessons[i];
    l = KRules.parse(d.rows);
    l.id = d.id; l.kind = "lesson"; l.num = i + 1; l.diff = d.diff; l.par = d.par;
    l.title = d.title; l.idea = d.idea; l.intro = d.intro; l.tip = d.tip; l.goal = d.goal;
    LESSONS.push(l); BY_ID[d.id] = l;
  }
}
prepare();

function clearedCount() {
  var n = 0, i;
  for (i = 0; i < LEVELS.length; i++) if (saved.levels[LEVELS[i].id]) n++;
  return n;
}
function lessonsDone() {
  var n = 0, i;
  for (i = 0; i < LESSONS.length; i++) if (saved.lessons[LESSONS[i].id] && saved.lessons[LESSONS[i].id].done) n++;
  return n;
}
function pad2(n) { return n < 10 ? "0" + n : "" + n; }

/* ---------------- small drawing helpers ---------------- */
function text(g, v, x, y, o) { return g.text(T(v), x, y, o); }
function drawStars(g, x, y, diff, on, off) {
  var i;
  for (i = 0; i < 5; i++) {
    if (i < diff) g.rect(x + i * 6, y, 4, 4, on);
    else g.frame(x + i * 6, y, 4, 4, off);
  }
}
function drawCheck(g, x, y, tone) {
  g.line(x, y + 4, x + 3, y + 7, tone);
  g.line(x + 1, y + 4, x + 4, y + 7, tone);
  g.line(x + 3, y + 7, x + 8, y, tone);
  g.line(x + 4, y + 7, x + 9, y, tone);
}
/* The selected piece gets a thick inset ring and corner ticks. It is drawn inside the piece so it
   is never clipped by the board edge and never covers a neighbour; the tone flips on dark Cao. */
function selectionMark(g, x, y, w, h, onInk) {
  var tone = onInk ? g.PAPER : g.INK, s = 6;
  g.frame(x + 3, y + 3, w - 6, h - 6, tone);
  g.frame(x + 4, y + 4, w - 8, h - 8, tone);
  g.rect(x + 3, y + 3, s, 2, tone);
  g.rect(x + 3, y + 3, 2, s, tone);
  g.rect(x + w - 3 - s, y + 3, s, 2, tone);
  g.rect(x + w - 5, y + 3, 2, s, tone);
  g.rect(x + 3, y + h - 5, s, 2, tone);
  g.rect(x + 3, y + h - 3 - s, 2, s, tone);
  g.rect(x + w - 3 - s, y + h - 5, s, 2, tone);
  g.rect(x + w - 5, y + h - 3 - s, 2, s, tone);
}


/* The lesson's target must stay visible when another piece sits on it. A 2 px dashed border
   alternates ink and paper, so at least half of it reads on either tone; the corners and the centre
   have a paper underlay so they do not vanish on a dark piece. */
function targetMark(g, x, y, w, h) {
  var i, len, tone, c, sx, sy, dx, dy;
  x += 2; y += 2; w -= 4; h -= 4;
  for (i = 0; i < w; i += 4) {
    len = Math.min(4, w - i);
    tone = (Math.floor(i / 4) & 1) ? g.PAPER : g.INK;
    g.rect(x + i, y, len, 2, tone);
    g.rect(x + i, y + h - 2, len, 2, tone);
  }
  for (i = 0; i < h; i += 4) {
    len = Math.min(4, h - i);
    tone = (Math.floor(i / 4) & 1) ? g.PAPER : g.INK;
    g.rect(x, y + i, 2, len, tone);
    g.rect(x + w - 2, y + i, 2, len, tone);
  }
  var corners = [[x - 1, y - 1, 1, 1], [x + w + 1, y - 1, -1, 1], [x - 1, y + h + 1, 1, -1], [x + w + 1, y + h + 1, -1, -1]];
  for (i = 0; i < 4; i++) {
    c = corners[i]; sx = c[0]; sy = c[1]; dx = c[2]; dy = c[3];
    g.rect(Math.min(sx, sx + dx * 7), sy - 1, 8, 3, g.PAPER);
    g.rect(sx - 1, Math.min(sy, sy + dy * 7), 3, 8, g.PAPER);
    g.rect(Math.min(sx, sx + dx * 7), sy, 8, 1, g.INK);
    g.rect(sx, Math.min(sy, sy + dy * 7), 1, 8, g.INK);
  }
  g.circle(x + w / 2, y + h / 2, 3, g.PAPER, true);
  g.circle(x + w / 2, y + h / 2, 2, g.INK, true);
}
function arrow(g, x0, y0, x1, y1, tone) {
  g.line(x0, y0, x1, y1, tone);
  var dx = x1 - x0, dy = y1 - y0, len = Math.sqrt(dx * dx + dy * dy) || 1;
  var ux = dx / len, uy = dy / len;
  g.line(x1, y1, x1 - ux * 6 - uy * 4, y1 - uy * 6 + ux * 4, tone);
  g.line(x1, y1, x1 - ux * 6 + uy * 4, y1 - uy * 6 - ux * 4, tone);
}

/* ---------------- board geometry and art ---------------- */
function cellOf(level) {
  return Math.min(30, Math.floor(120 / level.w), Math.floor(BOARD_ROOM / level.h));
}
function geomOf(level) {
  var cell = cellOf(level);
  return {
    cell: cell,
    x: Math.floor((160 - level.w * cell) / 2),
    y: BOARD_TOP + Math.floor((BOARD_ROOM - level.h * cell) / 2),
    w: level.w * cell,
    h: level.h * cell
  };
}
/* start on a piece the player can actually move: Cao if possible, else the lesson target, else any */
function initialSelection(level, pieces) {
  var preferred = level.cao >= 0 ? level.cao : 0, i;
  if (level.goal && level.goal.piece) {
    var gi = KRules.pieceIndex(level, level.goal.piece);
    if (gi >= 0) preferred = gi;
  }
  if (KRules.canMoveAny(level, pieces, preferred)) return preferred;
  for (i = 0; i < pieces.length; i++) if (KRules.canMoveAny(level, pieces, i)) return i;
  return preferred;
}

function pieceLabel(p) {
  if (p.kind === "cao") return T({ zh: "曹操", en: "CAO" });
  if (p.kind === "h") return T({ zh: "横将", en: "GEN" });
  if (p.kind === "v") return T({ zh: "竖将", en: "GEN" });
  if (p.kind === "s") return T({ zh: "兵", en: "SOL" });
  return T({ zh: "块", en: "BLK" });
}
function drawPiece(g, level, geom, i, at, ox, oy) {
  var p = level.pieces[i], cell = geom.cell;
  var x = geom.x + at.x * cell + (ox || 0), y = geom.y + at.y * cell + (oy || 0);
  var w = p.w * cell, h = p.h * cell;
  var fill = p.kind === "cao" ? g.INK : g.PAPER;
  var edge = g.INK;
  g.rect(x + 1, y + 1, w - 2, h - 2, fill);
  g.frame(x + 1, y + 1, w - 2, h - 2, edge);
  if (p.kind === "cao") {
    g.frame(x + 4, y + 4, w - 8, h - 8, g.DARK);
  } else if (p.kind === "h") {
    g.rect(x + 4, y + 3, w - 8, 2, g.MID);
    g.rect(x + 4, y + h - 5, w - 8, 2, g.MID);
  } else if (p.kind === "v") {
    g.rect(x + 3, y + 4, 2, h - 8, g.MID);
    g.rect(x + w - 5, y + 4, 2, h - 8, g.MID);
  } else {
    g.rect(x + 4, y + 4, 2, 2, g.MID);
    g.rect(x + w - 6, y + h - 6, 2, 2, g.MID);
  }
  var isGoal = !!(level.goal && level.goal.piece && level.goal.piece === p.ch);
  var label = isGoal && p.kind !== "cao" ? p.ch : pieceLabel(p);
  g.text(label, x + w / 2, y + h / 2 - 7, { align: "center", color: p.kind === "cao" ? g.PAPER : g.INK });
}

function drawBoard(g, level, pieces, anim, bump, selected, hint, hideCao, caoExtraY) {
  var geom = geomOf(level), cell = geom.cell, x, y, i, p;
  var boardW = geom.w, boardH = geom.h;
  g.rect(geom.x - 3, geom.y - 3, boardW + 6, boardH + 6, g.DARK);
  g.frame(geom.x - 2, geom.y - 2, boardW + 4, boardH + 4, g.INK);
  g.rect(geom.x, geom.y, boardW, boardH, g.PAPER);

  for (x = 1; x < level.w; x++) g.rect(geom.x + x * cell, geom.y, 1, boardH, g.MID);
  for (y = 1; y < level.h; y++) g.rect(geom.x, geom.y + y * cell, boardW, 1, g.MID);

  for (y = 0; y < level.h; y++) {
    for (x = 0; x < level.w; x++) {
      if (level.walls[y * level.w + x]) {
        g.rect(geom.x + x * cell + 1, geom.y + y * cell + 1, cell - 2, cell - 2, g.DARK);
        g.dither(geom.x + x * cell + 1, geom.y + y * cell + 1, cell - 2, cell - 2, g.INK, 3);
      } else if (KRules.pieceAt(level, pieces, x, y) < 0) {
        g.dither(geom.x + x * cell + 1, geom.y + y * cell + 1, cell - 2, cell - 2, g.MID, 1);
      }
    }
  }

  /* the exit: a gap in the bottom frame and a faint mark in the two bottom-middle cells */
  var ex = geom.x + level.exit.x * cell, ey = geom.y + boardH - 1;
  g.rect(ex, ey, cell * 2, 3, g.PAPER);
  g.rect(ex, ey, 2, 1, g.DARK); g.rect(ex + cell * 2 - 2, ey, 2, 1, g.DARK);
  g.line(ex, ey + 2, ex + 5, ey + 2, g.DARK); g.line(ex + cell * 2 - 6, ey + 2, ex + cell * 2, ey + 2, g.DARK);
  var exitFree = KRules.pieceAt(level, pieces, level.exit.x, level.exit.y) < 0 &&
    KRules.pieceAt(level, pieces, level.exit.x + 1, level.exit.y) < 0 &&
    KRules.pieceAt(level, pieces, level.exit.x, level.exit.y + 1) < 0 &&
    KRules.pieceAt(level, pieces, level.exit.x + 1, level.exit.y + 1) < 0;
  if (exitFree) {
    g.text(T({ zh: "出", en: "OUT" }), ex + cell, geom.y + boardH - 16, { align: "center", color: g.INK });
  }

  for (i = 0; i < pieces.length; i++) {
    if (hideCao === i) continue;
    var ox = 0, oy = 0;
    if (anim && anim.i === i) {
      var t = Math.min(1, anim.t / anim.dur);
      var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      ox = (anim.fx - pieces[i].x) * cell * (1 - e);
      oy = (anim.fy - pieces[i].y) * cell * (1 - e);
    }
    if (bump && bump.i === i) {
      var bt = bump.t / 0.18;
      var nudge = Math.sin(Math.PI * Math.min(1, bt)) * 4;
      ox += bump.dx * nudge; oy += bump.dy * nudge;
    }
    drawPiece(g, level, geom, i, pieces[i], ox, oy);
  }
  if (hideCao >= 0) {
    drawPiece(g, level, geom, hideCao, pieces[hideCao], 0, caoExtraY || 0);
  }
  if (level.goal && level.goal.piece) {
    var ti = KRules.pieceIndex(level, level.goal.piece);
    if (ti >= 0) {
      p = level.pieces[ti];
      var tx = geom.x + level.goal.x * cell, ty = geom.y + level.goal.y * cell;
      targetMark(g, tx, ty, p.w * cell, p.h * cell);
    }
  }
  /* the selection ring is drawn last so a neighbouring piece can never cover it */
  if (selected >= 0 && selected < pieces.length) {
    var sox = 0, soy = 0;
    if (anim && anim.i === selected) {
      var st = Math.min(1, anim.t / anim.dur);
      var se = st < 0.5 ? 2 * st * st : 1 - Math.pow(-2 * st + 2, 2) / 2;
      sox = (anim.fx - pieces[selected].x) * cell * (1 - se);
      soy = (anim.fy - pieces[selected].y) * cell * (1 - se);
    }
    if (bump && bump.i === selected) {
      var sbt = Math.min(1, bump.t / 0.18);
      var sn = Math.sin(Math.PI * sbt) * 4;
      sox += bump.dx * sn; soy += bump.dy * sn;
    }
    selectionMark(g,
      geom.x + pieces[selected].x * cell + sox,
      geom.y + pieces[selected].y * cell + soy,
      level.pieces[selected].w * cell,
      level.pieces[selected].h * cell,
      level.pieces[selected].kind === "cao");
  }
  if (hint) {
    p = pieces[hint.i];
    var cx = geom.x + (p.x + level.pieces[hint.i].w / 2) * cell;
    var cy = geom.y + (p.y + level.pieces[hint.i].h / 2) * cell;
    var nx = cx + hint.dx * cell, ny = cy + hint.dy * cell;
    arrow(g, cx, cy, nx, ny, g.INK);
    g.circle(nx, ny, 2, g.INK, true);
  }
}

/* ---------------- the table scene (one level or one lesson) ---------------- */
var table = {
  level: null, kind: "level", pieces: null, moves: 0, history: [], selected: 0,
  hints: 0, undos: 0, assisted: false, ui: "play", queue: [], anim: null, bump: null,
  hint: null, hintLeft: 0, solving: false, demo: null, win: null, card: null, menu: null,
  confirm: null, busy: false, toast: null, session: 0, resumed: false
};

function tableReset(fresh) {
  var level = table.level;
  table.pieces = KRules.reset(level);
  table.moves = 0; table.history = []; table.selected = initialSelection(level, table.pieces);
  table.hints = 0; table.undos = 0; table.assisted = false;
  table.ui = "play"; table.queue = []; table.anim = null; table.bump = null;
  table.hint = null; table.hintLeft = 0; table.solving = false; table.demo = null;
  table.win = null; table.card = null; table.menu = null; table.confirm = null;
  table.busy = false; table.toast = null;
  if (table.kind === "level") { delete saved.current[level.id]; if (fresh) save(); }
}

function loadCurrent(level) {
  var c = saved.current[level.id], pieces;
  if (!c || !c.pos || c.pos.length !== level.pieces.length) return null;
  try {
    pieces = KRules.deserialize(level, c.pos);
  } catch (e) { return null; }
  if (!KRules.validPieces(level, pieces)) return null;
  if (KRules.goalMet(level, pieces, level.goal)) { delete saved.current[level.id]; save(); return null; }
  if (!c.moves) {
    /* a board with no steps must be the starting board; a stale save from an older build is dropped */
    var start = KRules.reset(level), same = true, i;
    for (i = 0; i < start.length; i++) {
      if (pieces[i].x !== start[i].x || pieces[i].y !== start[i].y) { same = false; break; }
    }
    if (!same) return null;
  }
  return { pieces: pieces, moves: c.moves, hints: c.hints, undos: c.undos, assisted: !!c.assisted };
}

function saveCurrent() {
  if (table.kind !== "level") return;
  var level = table.level;
  if (table.moves <= 0 || table.win || table.card) { delete saved.current[level.id]; save(); return; }
  saved.current[level.id] = {
    pos: KRules.serialize(table.pieces), moves: table.moves,
    hints: table.hints, undos: table.undos, assisted: table.assisted ? 1 : 0
  };
  save();
}

function tableEnter(args) {
  var level = BY_ID[args.id], my = ++table.session, cur, rec;
  PT.clear();
  table.level = level; table.kind = args.kind; table.resumed = false;
  table.ui = "play"; table.card = null; table.win = null; table.demo = null;
  table.menu = null; table.confirm = null; table.hint = null; table.solving = false;
  table.busy = false; table.toast = null; table.queue = []; table.anim = null; table.bump = null;
  if (!level) { game.go("levels", null, { fade: false }); return; }
  if (args.kind === "lesson") {
    tableReset(false);
    table.busy = true;
    game.say(level.intro.map(function (p) { return T(p); }), { name: T({ zh: "大师", en: "Master" }), speed: 45 }).then(function () {
      if (table.session === my) table.busy = false;
    });
  } else {
    cur = loadCurrent(level);
    if (cur) {
      table.pieces = cur.pieces; table.moves = cur.moves; table.history = [];
      table.selected = initialSelection(level, table.pieces);
      table.hints = cur.hints; table.undos = cur.undos; table.assisted = cur.assisted;
      table.resumed = true;
      setToast(T({ zh: "继续上次", en: "Resumed" }));
    } else {
      tableReset(false);
      rec = saved.levels[level.id] || {};
      rec.plays = num(rec.plays) + 1;
      saved.levels[level.id] = rec;
      save();
    }
  }
}

function tableExit() {
  if (table.kind === "level" && table.level && !table.win) saveCurrent();
}

function tableMenuItems() {
  var items = [
    { key: "resume", label: T({ zh: "继续", en: "Resume" }) },
    { key: "restart", label: T({ zh: "重来", en: "Restart" }) },
    { key: "hint", label: T({ zh: "提示", en: "Hint" }) },
    { key: "demo", label: T({ zh: "演示", en: "Demo" }) },
    { key: "notes", label: T({ zh: "大师笔记", en: "Notes" }) }
  ];
  if (table.kind === "level") items.push({ key: "list", label: T({ zh: "选关", en: "Levels" }) });
  else items.push({ key: "list", label: T({ zh: "课程", en: "Lessons" }) });
  items.push({ key: "title", label: T({ zh: "主菜单", en: "Title" }) });
  return items;
}
function openMenu() {
  table.menu = { items: tableMenuItems(), sel: 0 };
  table.ui = "menu";
  game.sfx("tap");
}
function openConfirm() {
  table.confirm = { sel: 0 };
  table.ui = "confirm";
  game.sfx("tap");
}
function restartTable() {
  tableReset(true);
  table.ui = "play";
  game.sfx("ok");
}

function setToast(text) { table.toast = { text: text, t: 1.6 }; }

function requestHint() {
  if (table.solving || table.demo || table.win || table.card) return;
  if (table.hint) { table.hint = null; table.hintLeft = 0; game.sfx("tap"); return; }
  var my = table.session, level = table.level, snapshot = KRules.clonePieces(table.pieces);
  table.solving = true;
  game.sfx("tick");
  setTimeout(function () {
    if (table.session !== my || table.ui !== "play") { table.solving = false; return; }
    var r;
    try { r = KSolver.solve(level, snapshot, level.goal, 500000); }
    catch (e) { r = null; }
    table.solving = false;
    if (!r || r.par < 0 || !r.moves || !r.moves.length) {
      game.sfx("err");
      setToast(T({ zh: "这局暂时算不出来", en: "No hint found" }));
      return;
    }
    table.hint = { i: r.moves[0].i, dx: r.moves[0].dx, dy: r.moves[0].dy };
    table.hintLeft = 5;
    table.hints++;
    table.assisted = true;
    if (table.kind === "level") saveCurrent();
    game.sfx("ok");
  }, 40);
}

function startDemo() {
  if (table.solving || table.demo) return;
  var my = table.session, level = table.level, snapshot = KRules.clonePieces(table.pieces);
  table.hint = null; table.hintLeft = 0;
  table.assisted = true;
  table.demo = {
    moves: null, idx: 0, pieces: KRules.clonePieces(table.pieces), anim: null,
    ready: false, endT: 0, speed: 0.26, timer: 0
  };
  table.ui = "demo";
  game.sfx("tap");
  setTimeout(function () {
    if (table.session !== my || table.ui !== "demo" || !table.demo) return;
    var r;
    try { r = KSolver.solve(level, snapshot, level.goal, 500000); }
    catch (e) { r = null; }
    if (!table.demo || table.session !== my) return;
    if (!r || r.par < 0 || !r.moves || !r.moves.length) {
      table.demo = null; table.ui = "play";
      game.sfx("err");
      setToast(T({ zh: "这局暂时算不出来", en: "No demo found" }));
      return;
    }
    table.demo.moves = r.moves;
    table.demo.ready = true;
    table.demo.speed = 0.26;
    if (table.kind === "level") saveCurrent();
  }, 40);
}

function stopDemo() {
  if (!table.demo) return;
  table.demo = null;
  table.ui = "play";
  table.anim = null; table.queue = [];
  table.hint = null; table.hintLeft = 0;
  game.sfx("tap");
}

function selectPiece(i) {
  if (i < 0 || i >= table.pieces.length) return;
  table.selected = i;
  game.sfx("ok");
}
/* the next piece that can actually move, going round from `start` (never `start` itself unless it is
   the only movable one and we go all the way round) */
function nextMovable(start) {
  var n = table.pieces.length, i, idx;
  for (i = 1; i <= n; i++) {
    idx = (start + i) % n;
    if (KRules.canMoveAny(table.level, table.pieces, idx)) return idx;
  }
  return -1;
}
function cyclePiece() {
  var n = table.pieces.length, idx;
  if (!n) return;
  idx = nextMovable(table.selected);
  if (idx < 0) { table.selected = (table.selected + 1) % n; game.sfx("err"); return; }
  table.selected = idx;
  game.sfx("ok");
}
function enqueue(i, dx, dy, n) {
  var k;
  if (!n || n < 1) return;
  table.hint = null; table.hintLeft = 0; table.toast = null;
  for (k = 0; k < n; k++) table.queue.push({ i: i, dx: dx, dy: dy });
}
function bumpAt(i, dx, dy) {
  table.bump = { i: i, dx: dx, dy: dy, t: 0 };
  game.sfx("err");
}
function tryMoveSelected(dx, dy) {
  var i = table.selected, n = KRules.maxSteps(table.level, table.pieces, i, dx, dy);
  if (n > 0) enqueue(i, dx, dy, 1);
  else bumpAt(i, dx, dy);
}
function undo() {
  if (!table.history.length) { game.sfx("err"); return; }
  var h = table.history.pop();
  table.pieces[h.i].x = h.ox; table.pieces[h.i].y = h.oy;
  table.moves = Math.max(0, table.moves - 1);
  table.undos++; table.assisted = true;
  table.hint = null; table.hintLeft = 0;
  table.anim = null; table.queue = [];
  game.sfx("move");
  if (table.kind === "level") saveCurrent();
}

function pump() {
  if (table.anim || table.ui !== "play" || !table.queue.length) return;
  var m = table.queue.shift();
  var old = KRules.step(table.level, table.pieces, m.i, m.dx, m.dy);
  if (!old) return;
  table.history.push({ i: m.i, ox: old.x, oy: old.y });
  table.moves++;
  table.anim = { i: m.i, fx: old.x, fy: old.y, t: 0, dur: 0.075 };
  game.sfx("move");
  var reached = KRules.goalMet(table.level, table.pieces, table.level.goal);
  if (reached) table.queue.length = 0;
  if (table.kind === "level" && !reached) saveCurrent();
}

function startWin() {
  if (table.win || table.card) return;
  var isExit = !(table.level.goal && table.level.goal.piece);
  table.ui = "win";
  table.win = { t: 0, mode: isExit ? "exit" : "target", sounded: false };
  table.hint = null;
  game.sfx(isExit ? "move" : "win");
  markWin();
}
function markWin() {
  var level = table.level, now = Date.now(), rec, prevBest, prevClean, result;
  var assisted = !!table.assisted;
  if (table.kind === "level") {
    rec = saved.levels[level.id] || {};
    prevBest = num(rec.best);
    prevClean = num(rec.clean);
    result = { newBest: !prevBest || table.moves < prevBest, newClean: !assisted && (!prevClean || table.moves < prevClean) };
    result.moves = table.moves;
    rec.cleared = 1;
    rec.best = prevBest ? Math.min(prevBest, table.moves) : table.moves;
    if (!assisted) rec.clean = prevClean ? Math.min(prevClean, table.moves) : table.moves;
    rec.last = table.moves; rec.at = now;
    rec.plays = num(rec.plays);
    saved.levels[level.id] = rec;
    delete saved.current[level.id];
    save();
    result.best = rec.best;
    result.clean = rec.clean;
    result.assisted = assisted;
    result.par = level.par;
    result.kind = "level";
    result.next = nextLevelId(level.id);
    table.card = result;
  } else {
    rec = saved.lessons[level.id] || {};
    var prevLessonBest = num(rec.best);
    rec.done = 1;
    rec.best = prevLessonBest ? Math.min(prevLessonBest, table.moves) : table.moves;
    rec.hints = table.hints;
    rec.at = now;
    saved.lessons[level.id] = rec;
    save();
    table.card = {
      kind: "lesson", best: rec.best, moves: table.moves, par: level.par,
      newBest: !prevLessonBest || table.moves < prevLessonBest,
      assisted: assisted, next: nextLessonId(level.id)
    };
  }
}
function nextLevelId(id) {
  var i;
  for (i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return i + 1 < LEVELS.length ? LEVELS[i + 1].id : null;
  return null;
}
function nextLessonId(id) {
  var i;
  for (i = 0; i < LESSONS.length; i++) if (LESSONS[i].id === id) return i + 1 < LESSONS.length ? LESSONS[i + 1].id : null;
  return null;
}

function updateAnim(dt) {
  if (table.bump) {
    table.bump.t += dt;
    if (table.bump.t >= 0.18) table.bump = null;
  }
  if (table.anim) {
    table.anim.t += dt;
    if (table.anim.t >= table.anim.dur) {
      table.anim = null;
      if (KRules.goalMet(table.level, table.pieces, table.level.goal)) { startWin(); return; }
    }
  }
  if (!table.anim && !table.queue.length && !table.win && !KRules.canMoveAny(table.level, table.pieces, table.selected)) {
    var nm = nextMovable(table.selected);
    if (nm >= 0) table.selected = nm;
  }
  if (!table.anim && table.queue.length) pump();
  else if (!table.anim && !table.queue.length && !table.win && KRules.goalMet(table.level, table.pieces, table.level.goal)) startWin();
}

function boardCellAt(level, ev) {
  var geom = geomOf(level);
  if (ev.x0 < geom.x || ev.y0 < geom.y || ev.x0 >= geom.x + geom.w || ev.y0 >= geom.y + geom.h) return null;
  return { x: Math.floor((ev.x0 - geom.x) / geom.cell), y: Math.floor((ev.y0 - geom.y) / geom.cell), cx: geom.x + geom.cell / 2, cy: geom.y + geom.cell / 2 };
}

function tapBoard(level, ev) {
  var at = boardCellAt(level, ev), i, p, dx = 0, dy = 0, n, want;
  if (!at) return;
  i = KRules.pieceAt(level, table.pieces, at.x, at.y);
  if (i >= 0) { selectPiece(i); return; }
  p = table.pieces[table.selected];
  if (!p) return;
  want = 0;
  if (at.x < p.x && at.y >= p.y && at.y < p.y + level.pieces[table.selected].h) { dx = -1; want = p.x - at.x; }
  else if (at.x >= p.x + level.pieces[table.selected].w && at.y >= p.y && at.y < p.y + level.pieces[table.selected].h) { dx = 1; want = at.x - (p.x + level.pieces[table.selected].w) + 1; }
  else if (at.y < p.y && at.x >= p.x && at.x < p.x + level.pieces[table.selected].w) { dy = -1; want = p.y - at.y; }
  else if (at.y >= p.y + level.pieces[table.selected].h && at.x >= p.x && at.x < p.x + level.pieces[table.selected].w) { dy = 1; want = at.y - (p.y + level.pieces[table.selected].h) + 1; }
  if (!dx && !dy) return;
  n = KRules.maxSteps(level, table.pieces, table.selected, dx, dy);
  if (n > 0) enqueue(table.selected, dx, dy, Math.max(1, Math.min(n, want)));
}

function dragBoard(level, ev) {
  var at = boardCellAt(level, ev), i, major, dx = 0, dy = 0, n, max;
  if (!at) return;
  i = KRules.pieceAt(level, table.pieces, at.x, at.y);
  if (i < 0) return;
  selectPiece(i);
  major = Math.abs(ev.dx) >= Math.abs(ev.dy) ? ev.dx : ev.dy;
  if (Math.abs(major) < 6) return;
  if (Math.abs(ev.dx) >= Math.abs(ev.dy)) dx = ev.dx > 0 ? 1 : -1;
  else dy = ev.dy > 0 ? 1 : -1;
  n = Math.max(1, Math.round(Math.abs(major) / geomOf(level).cell));
  max = KRules.maxSteps(level, table.pieces, i, dx, dy);
  if (max > 0) enqueue(i, dx, dy, Math.min(n, max));
  else bumpAt(i, dx, dy);
}

function updateMenu(ev) {
  var m = table.menu, i;
  if (!m) { table.ui = "play"; return; }
  if (game.repeat("up")) { m.sel = (m.sel + m.items.length - 1) % m.items.length; game.sfx("tick"); }
  if (game.repeat("down")) { m.sel = (m.sel + 1) % m.items.length; game.sfx("tick"); }
  if (ev && ev.dist < 8) {
    var y = Math.floor((ev.y0 - 28) / 22);
    if (ev.x0 >= 8 && ev.x0 <= 152 && y >= 0 && y < m.items.length && ev.y0 >= 28 && ev.y0 < 28 + m.items.length * 22) {
      m.sel = y;
      menuAct(m);
      return;
    }
  }
  if (game.pressed("a")) { menuAct(m); return; }
  if (game.pressed("b")) { table.ui = "play"; table.menu = null; game.sfx("tap"); return; }
}
function menuAct(m) {
  var it = m.items[m.sel], level = table.level;
  table.menu = null;
  if (!it) { table.ui = "play"; return; }
  if (it.key === "resume") { table.ui = "play"; game.sfx("tap"); }
  else if (it.key === "restart") { openConfirm(); }
  else if (it.key === "hint") { table.ui = "play"; requestHint(); }
  else if (it.key === "demo") { table.ui = "play"; startDemo(); }
  else if (it.key === "notes") {
    table.ui = "play";
    game.push("pages", { section: T({ zh: "大师笔记", en: "Master Notes" }), blocks: KLOTSKI_DATA.notes });
  } else if (it.key === "list") { game.go(table.kind === "level" ? "levels" : "lessons", null, { fade: false }); }
  else if (it.key === "title") { game.go("title", null, { fade: false }); }
}
function updateConfirm(ev) {
  var c = table.confirm;
  if (!c) { table.ui = "play"; return; }
  if (game.repeat("up")) { c.sel = (c.sel + 1) % 2; game.sfx("tick"); }
  if (game.repeat("down")) { c.sel = (c.sel + 1) % 2; game.sfx("tick"); }
  if (ev && ev.dist < 8) {
    var row = ev.y0 >= 84 && ev.y0 < 128 ? Math.floor((ev.y0 - 84) / 22) : -1;
    if (row >= 0 && row < 2) { c.sel = row; confirmAct(c); return; }
  }
  if (game.pressed("a")) { confirmAct(c); return; }
  if (game.pressed("b")) { table.ui = "play"; table.confirm = null; game.sfx("tap"); }
}
function confirmAct(c) {
  table.confirm = null;
  if (c.sel === 1) restartTable();
  else { table.ui = "play"; game.sfx("tap"); }
}

function updateDemo(dt, ev) {
  var d = table.demo;
  if (!d) { table.ui = "play"; return; }
  if (game.pressed("b") || (ev && ev.dist < 8 && ev.y0 > 174)) { stopDemo(); return; }
  if (!d.ready) return;
  d.timer += dt;
  if (d.anim) {
    d.anim.t += dt;
    if (d.anim.t >= d.anim.dur) d.anim = null;
    return;
  }
  if (d.timer < d.speed) return;
  d.timer = 0;
  if (d.idx < d.moves.length) {
    var m = d.moves[d.idx++];
    var old = KRules.step(table.level, d.pieces, m.i, m.dx, m.dy);
    if (old) d.anim = { i: m.i, fx: old.x, fy: old.y, t: 0, dur: 0.11 };
    game.sfx("move");
  } else {
    d.endT += d.speed;
    if (d.endT > 0.7) stopDemo();
  }
}

function updateCard(ev) {
  var c = table.card;
  if (!c) { table.ui = "play"; return; }
  if (ev && ev.dist < 8 && ev.y0 > 142) {
    if (ev.x0 < 80) { cardBack(); return; }
    if (ev.x0 >= 80) { cardNext(); return; }
  }
  if (game.pressed("a") || game.pressed("start")) { cardNext(); return; }
  if (game.pressed("b")) { cardBack(); return; }
}
function cardNext() {
  var c = table.card;
  if (!c) return;
  if (c.kind === "lesson") {
    if (c.next) { game.go("table", { kind: "lesson", id: c.next }, { fade: false }); return; }
    game.go("lessons", null, { fade: false }); return;
  }
  if (c.next) { game.go("table", { kind: "level", id: c.next }, { fade: false }); return; }
  game.go("levels", null, { fade: false });
}
function cardBack() {
  game.go(table.kind === "level" ? "levels" : "lessons", null, { fade: false });
}

function playGesture(ev) {
  if (!ev) return;
  if (ev.dist < 8) tapBoard(table.level, ev);
  else dragBoard(table.level, ev);
}

var tableScene = {
  enter: function (args) { tableEnter(args); },
  exit: function () { tableExit(); },
  update: function (dt) {
    var ev = PT.take();
    if (!loaded) return;
    if (table.toast) { table.toast.t -= dt; if (table.toast.t <= 0) table.toast = null; }
    if (table.hintLeft > 0) { table.hintLeft -= dt; if (table.hintLeft <= 0) table.hint = null; }
    if (table.ui === "menu") { updateMenu(ev); return; }
    if (table.ui === "confirm") { updateConfirm(ev); return; }
    if (table.ui === "demo") { updateDemo(dt, ev); return; }
    if (table.ui === "card") { updateCard(ev); return; }
    if (table.ui === "win") {
      table.win.t += dt;
      if (table.win.mode === "exit") {
        if (table.win.t > 0.6 && (game.pressed("a") || game.pressed("b") || game.pressed("start") || (ev && ev.dist < 8))) {
          table.ui = "card"; table.win = null; return;
        }
        if (table.win.t > 1.7 && !table.win.sounded) { game.sfx("win"); table.win.sounded = true; }
        if (table.win.t > EXIT_END) { table.ui = "card"; table.win = null; }
      } else if (table.win.t > 0.62) {
        table.ui = "card"; table.win = null;
      }
      return;
    }
    if (table.busy || table.solving) return;
    updateAnim(dt);
    if (table.ui !== "play" || table.anim || table.queue.length) return;
    if (game.pressed("start")) { openMenu(); return; }
    if (game.pressed("select")) { cyclePiece(); return; }
    if (game.pressed("a")) { requestHint(); return; }
    if (game.pressed("b")) { undo(); return; }
    if (game.repeat("up")) { tryMoveSelected(0, -1); return; }
    if (game.repeat("down")) { tryMoveSelected(0, 1); return; }
    if (game.repeat("left")) { tryMoveSelected(-1, 0); return; }
    if (game.repeat("right")) { tryMoveSelected(1, 0); return; }
    playGesture(ev);
  },
  draw: function (g) {
    g.clear(g.PAPER);
    if (!table.level) return;
    var level = table.level, pieces = table.demo ? table.demo.pieces : table.pieces;
    var anim = table.demo ? table.demo.anim : table.anim;
    var hideCao = -1, caoY = 0;
    if (table.ui === "win" && table.win && (!level.goal || !level.goal.piece)) {
      hideCao = level.cao;
      caoY = table.win.t * 90;
    }
    if (table.ui === "win" && table.win && table.win.mode === "exit") {
      drawExitCinematic(g, table.win.t);
      return;
    }
    drawBoard(g, level, pieces, anim, table.ui === "play" ? table.bump : null,
      table.ui === "play" ? table.selected : -1,
      table.hint, hideCao, caoY);
    drawHUD(g);
    if (table.ui === "play" && table.toast) drawToast(g);
    if (table.ui === "menu") drawMenu(g);
    if (table.ui === "confirm") drawConfirm(g);
    if (table.ui === "card") drawCard(g);
  }
};

/* ---------------- the exit: a short 演义 interlude from the board to the pass ---------------- */
function drawExitCinematic(g, t) {
  var level = table.level, i, nt, h, p, e;
  if (t < EXIT_SLIDE) {
    p = t / EXIT_SLIDE; e = p * p;
    drawBoard(g, level, table.pieces, null, null, -1, null, level.cao, Math.round(100 * e));
    for (i = 0; i < 5; i++) {
      g.rect(56 + i * 12, Math.min(198, 176 + Math.round((t * 60 + i * 5) % 18)), 2, 2, g.MID);
    }
    return;
  }
  nt = t - EXIT_SLIDE;
  if (t < EXIT_SLIDE + EXIT_WIPE) {
    drawBoard(g, level, table.pieces, null, null, -1, null, level.cao, 200);
    h = Math.round(Math.min(1, (t - EXIT_SLIDE) / EXIT_WIPE) * 200);
    g.clip(0, 200 - h, 160, h);
    drawNight(g, nt);
    g.clip();
    return;
  }
  drawNight(g, nt);
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function horseLeg(g, x1, y1, x2, y2, x3, y3, tone) {
  g.line(x1, y1, x2, y2, tone);
  g.line(x1 + 1, y1, x2 + 1, y2, tone);
  g.line(x2, y2, x3, y3, tone);
  g.line(x2 + 1, y2, x3 + 1, y3, tone);
  g.rect(x3 - 1, y3 - 1, 3, 2, tone);
}

/* Cao Cao on a white horse, a side-view paper silhouette for the night pass */
function drawHorse(g, x, y, phase) {
  var s = Math.sin(phase), i;
  /* tail */
  g.line(x + 14, y + 14, x + 5, y + 10, g.PAPER);
  g.line(x + 14, y + 16, x + 3, y + 14, g.MID);
  g.line(x + 14, y + 18, x + 6, y + 20, g.PAPER);
  /* far legs */
  horseLeg(g, x + 20, y + 22, x + 20 - Math.round(2 * s), y + 27, x + 22 - Math.round(3 * s), y + 31, g.MID);
  horseLeg(g, x + 38, y + 21, x + 42 + Math.round(2 * s), y + 26, x + 45 + Math.round(3 * s), y + 31, g.MID);
  /* body */
  g.rect(x + 14, y + 14, 24, 8, g.PAPER);
  g.circle(x + 16, y + 18, 4, g.PAPER, true);
  g.circle(x + 36, y + 18, 4, g.PAPER, true);
  g.rect(x + 17, y + 21, 19, 1, g.MID);
  /* neck and head */
  for (i = 0; i < 8; i++) g.rect(x + 35 + i, y + 16 - i, 4, 3, g.PAPER);
  g.rect(x + 41, y + 5, 6, 7, g.PAPER);
  g.rect(x + 46, y + 8, 3, 4, g.PAPER);
  g.line(x + 42, y + 5, x + 41, y + 3, g.PAPER);
  g.line(x + 45, y + 5, x + 45, y + 3, g.PAPER);
  g.rect(x + 45, y + 7, 1, 1, g.INK);
  g.rect(x + 38, y + 7, 2, 7, g.MID);
  g.rect(x + 36, y + 10, 2, 5, g.MID);
  /* saddle and girth */
  g.rect(x + 22, y + 12, 8, 3, g.INK);
  g.rect(x + 22, y + 12, 8, 1, g.MID);
  /* cloak streaming behind the rider */
  g.rect(x + 14, y + 7, 10, 2, g.MID);
  g.rect(x + 10, y + 9, 11, 2, g.PAPER);
  g.rect(x + 6, y + 11, 11, 2, g.MID);
  g.rect(x + 9, y + 13, 7, 2, g.PAPER);
  g.rect(x + 3, y + 15, 7, 2, g.MID);
  /* rider */
  g.rect(x + 23, y + 6, 6, 7, g.PAPER);
  g.rect(x + 24, y + 10, 4, 1, g.INK);
  g.rect(x + 24, y + 1, 5, 5, g.PAPER);
  g.rect(x + 23, y + 0, 7, 2, g.PAPER);
  g.rect(x + 26, y - 2, 2, 2, g.PAPER);
  g.rect(x + 24, y + 2, 1, 2, g.MID);
  g.line(x + 29, y + 8, x + 35, y + 9, g.PAPER);
  g.line(x + 35, y + 9, x + 45, y + 9, g.PAPER);
  g.rect(x + 25, y + 13, 4, 3, g.PAPER);
  /* the flag at his back */
  g.rect(x + 23, y - 8, 1, 9, g.PAPER);
  g.rect(x + 24, y - 8, 9, 5, g.PAPER);
  g.rect(x + 24, y - 8, 9, 1, g.MID);
  g.rect(x + 24, y - 4, 9, 1, g.MID);
  /* near legs */
  horseLeg(g, x + 16, y + 22, x + 12 + Math.round(2 * s), y + 27, x + 9 + Math.round(3 * s), y + 31, g.PAPER);
  horseLeg(g, x + 36, y + 21, x + 39 - Math.round(2 * s), y + 26, x + 42 - Math.round(3 * s), y + 31, g.PAPER);
  /* dust behind the hooves */
  for (i = 0; i < 4; i++) g.rect(x - 6 - i * 4, y + 23 + (i % 2) * 3, 2, 2, g.MID);
}

function drawNight(g, nt) {
  var i, x, top, p, e, hx, hy, tilt, bx, bt, by;
  g.rect(0, 0, 160, 200, g.INK);

  g.text(T({ zh: "华容道", en: "HUARONG" }), 80, 6, { align: "center", color: g.PAPER });
  g.rect(18, 20, 124, 1, g.DARK);
  g.text(T({ zh: "A 跳过", en: "A skip" }), 155, 6, { align: "right", color: g.PAPER });

  for (i = 0; i < 15; i++) {
    x = (i * 37 + 13) % 150 + 5;
    top = (i * 31 + 11) % 62 + 14;
    if (Math.sin(nt * 2.2 + i * 1.7) > -0.55) g.rect(x, top, 1, 1, g.PAPER);
  }

  g.circle(124, 40, 16, g.PAPER, true);
  g.dither(118, 34, 7, 7, g.MID, 2);
  g.circle(124, 40, 19, g.DARK, false);

  /* far and near ridges */
  for (x = 0; x < 160; x += 2) {
    top = 92 - Math.round(10 * Math.sin(x * 0.07 + 1) + 6 * Math.sin(x * 0.19));
    top = clamp(top, 58, 128);
    g.rect(x, top, 2, 200 - top, g.MID);
  }
  for (x = 0; x < 160; x += 2) {
    top = 118 - Math.round(8 * Math.sin(x * 0.09 + 2) + 5 * Math.sin(x * 0.23));
    top = clamp(top, 76, 138);
    g.rect(x, top, 2, 200 - top, g.DARK);
  }

  /* the road, side view */
  for (x = 0; x < 160; x++) {
    top = 139 - Math.round(2 * Math.sin(x * 0.05));
    g.rect(x, top, 1, 160 - top, g.MID);
    if (x % 7 === 0) g.rect(x, top, 4, 1, g.PAPER);
  }
  for (x = 10; x < 150; x += 24) g.rect(x, 146, 2, 1, g.PAPER);

  /* the gate on the left */
  g.rect(0, 102, 6, 58, g.DARK); g.rect(0, 102, 1, 58, g.PAPER); g.rect(5, 102, 1, 58, g.PAPER);
  g.rect(19, 102, 6, 58, g.DARK); g.rect(19, 102, 1, 58, g.PAPER); g.rect(24, 102, 1, 58, g.PAPER);
  g.rect(0, 97, 25, 6, g.DARK); g.rect(0, 97, 25, 1, g.PAPER);

  /* Guan Yu in the gate, lowering the halberd */
  g.rect(4, 106, 14, 34, g.DARK);
  g.frame(4, 106, 14, 34, g.PAPER);
  g.text(T({ zh: "关", en: "G" }), 11, 110, { align: "center", color: g.PAPER });
  tilt = nt < 0.9 ? 0 : Math.min(1, (nt - 0.9) / 0.6);
  hy = 104 - Math.round(2 * tilt);
  hx = 18 + Math.round(8 * tilt);
  g.line(18, 154, hx, hy, g.PAPER);
  g.line(hx, hy, hx + 4, hy - 4, g.PAPER);

  /* foreground grass, and the shadow that grounds the horse */
  for (i = 0; i < 9; i++) {
    g.rect(12 + i * 18, 160, 2, 3, g.MID);
    g.rect(16 + i * 18, 162, 1, 2, g.DARK);
  }
  /* Cao rides out and away */
  p = clamp(nt / 1.75, 0, 1); e = 1 - (1 - p) * (1 - p);
  bx = 18 + Math.round(94 * e);
  g.rect(bx + 7, 151, 32, 2, g.DARK);
  drawHorse(g, bx, 119, nt * 12);

  /* the scroll: the story beat */
  bt = clamp((nt - 1.15) / 0.35, 0, 1);
  by = 204 - Math.round(bt * 52);
  g.window(10, by, 140, 44, { thin: true });
  g.rect(8, by - 2, 144, 3, g.DARK);
  g.rect(8, by + 43, 144, 3, g.DARK);
  g.text(T({ zh: "关羽义释曹操", en: "Guan Yu lets Cao go" }), 80, by + 4, { align: "center", color: g.INK });
  g.text(T({ zh: "曹操已过华容道", en: "Cao passes Huarong" }), 80, by + 17, { align: "center", color: g.INK });
  g.text(T({ zh: "建安十三年", en: "A.D. 208" }), 80, by + 30, { align: "center", color: g.INK });
}

function drawHUD(g) {
  var level = table.level;
  g.rect(0, 0, 160, HEAD, g.PAPER);
  g.rect(0, HEAD - 1, 160, 1, g.DARK);
  var left = table.kind === "level"
    ? pad2(level.num) + " " + T(level.name)
    : T({ zh: "第{n}课 ", en: "L{n} " }, { n: level.num }) + T(level.title);
  g.text(left, 5, 4, { color: g.INK });
  var right;
  if (table.solving) right = T({ zh: "算…", en: "..." });
  else if (table.ui === "demo") right = T({ zh: "演示", en: "DEMO" });
  else right = T({ zh: "步{n}/{p}", en: "{n}/{p}" }, { n: table.moves, p: level.par });
  g.text(right, 155, 4, { align: "right", color: g.INK });
  if (table.ui === "card") return;

  g.rect(0, FOOT, 160, 1, g.DARK);
  var l1, l2;
  if (table.ui === "demo") {
    l1 = T({ zh: "演示中", en: "Demo" });
    l2 = T({ zh: "B 停止", en: "B stop" });
  } else if (table.ui === "card") {
    l1 = T({ zh: "A 继续　B 返回", en: "A continue  B back" });
    l2 = "";
  } else if (table.ui === "menu") {
    l1 = T({ zh: "↑↓ 选　A 好", en: "Up/down  A OK" });
    l2 = T({ zh: "B 关闭", en: "B close" });
  } else if (table.ui === "confirm") {
    l1 = T({ zh: "A 好　B 取消", en: "A OK  B cancel" });
    l2 = "";
  } else if (table.solving) {
    l1 = T({ zh: "正在计算…", en: "Thinking..." });
    l2 = "";
  } else {
    l1 = T({ zh: "拖/方向　A 提示　B 撤销", en: "Drag/keys  A hint  B undo" });
    l2 = T({ zh: "SELECT 可动　START 菜单", en: "SEL movable  START menu" });
  }
  if (l1) g.text(l1, 5, FOOT + 1, { color: g.INK });
  if (l2) g.text(l2, 5, FOOT + 13, { color: g.INK });
}

function drawToast(g) {
  var tw = g.measure(T(table.toast.text)) + 10;
  g.window(80 - tw / 2, 150, tw, 16, { thin: true });
  g.text(T(table.toast.text), 80, 154, { align: "center", color: g.INK });
}

function drawMenu(g) {
  var m = table.menu;
  if (!m) return;
  g.rect(0, 0, 160, 200, g.PAPER);
  g.text(T({ zh: "暂停", en: "Paused" }), 80, 5, { align: "center", color: g.INK });
  g.rect(0, 21, 160, 1, g.DARK);
  var i;
  for (i = 0; i < m.items.length; i++) {
    var ry = 28 + i * 22;
    if (i === m.sel) {
      g.rect(8, ry, 144, 21, g.INK);
      g.text(m.items[i].label, 80, ry + 5, { align: "center", color: g.PAPER });
    } else {
      g.text(m.items[i].label, 80, ry + 5, { align: "center", color: g.INK });
    }
  }
  g.rect(0, 184, 160, 1, g.DARK);
  g.text(T({ zh: "A 选　B 关闭", en: "A select  B close" }), 80, 187, { align: "center", color: g.INK });
}

function drawConfirm(g) {
  var c = table.confirm;
  if (!c) return;
  g.rect(0, 0, 160, 200, g.PAPER);
  var x = 18, y = 60, w = 124, h = 80;
  g.window(x, y, w, h, { thin: true });
  g.text(T({ zh: "重来这一局？", en: "Restart this run?" }), 80, y + 10, { align: "center", color: g.INK });
  var items = [T({ zh: "取消", en: "Cancel" }), T({ zh: "重来", en: "Restart" })];
  for (var i = 0; i < 2; i++) {
    var ry = y + 30 + i * 22;
    if (i === c.sel) {
      g.rect(x + 6, ry, w - 12, 21, g.INK);
      g.text(items[i], 80, ry + 5, { align: "center", color: g.PAPER });
    } else g.text(items[i], 80, ry + 5, { align: "center", color: g.INK });
  }
  g.text(T({ zh: "A 好　B 取消", en: "A OK  B cancel" }), 80, 162, { align: "center", color: g.INK });
}

function drawCard(g) {
  var c = table.card, level = table.level;
  if (!c) return;
  var x = 10, y = 38, w = 140, h = 132;
  g.window(x, y, w, h, { thin: true });
  var title = c.kind === "lesson" ? T({ zh: "完成本课", en: "Lesson Done" }) : T({ zh: "过关", en: "Cleared" });
  g.text(title, 80, y + 8, { align: "center", color: g.INK });
  var name = c.kind === "lesson" ? T(level.title) : T(level.name);
  g.text(name, 80, y + 24, { align: "center", color: g.INK });
  g.text(T({ zh: "步数 {n}　最少 {p}", en: "Steps {n}  best {p}" }, { n: c.moves, p: c.par }), 80, y + 42, { align: "center", color: g.INK });
  var rank;
  if (c.assisted) rank = T({ zh: "参考过提示", en: "Helped" });
  else if (c.moves <= c.par) rank = T({ zh: "完美", en: "Perfect" });
  else if (c.moves <= c.par + Math.ceil(c.par * 0.1)) rank = T({ zh: "优秀", en: "Great" });
  else rank = T({ zh: "过关", en: "Cleared" });
  g.text(rank, 80, y + 58, { align: "center", color: g.INK });
  var line;
  if (c.kind === "level") {
    line = c.newBest ? T({ zh: "新纪录 {n}", en: "New best {n}" }, { n: c.best }) : T({ zh: "最佳 {n}", en: "Best {n}" }, { n: c.best });
  } else {
    line = c.newBest ? T({ zh: "新纪录 {n}", en: "New best {n}" }, { n: c.best }) : T({ zh: "最佳 {n}", en: "Best {n}" }, { n: c.best });
  }
  g.text(line, 80, y + 76, { align: "center", color: g.INK });
  if (c.kind === "lesson" && level.idea) {
    g.text(T(level.idea), 80, y + 90, { align: "center", color: g.INK });
  }
  g.rect(x + 6, y + h - 26, w - 12, 1, g.DARK);
  var nextLabel = c.kind === "lesson"
    ? (c.next ? T({ zh: "下一课", en: "Next" }) : T({ zh: "课程", en: "Lessons" }))
    : (c.next ? T({ zh: "下一关", en: "Next" }) : T({ zh: "选关", en: "Levels" }));
  var backLabel = c.kind === "lesson" ? T({ zh: "课程", en: "Lessons" }) : T({ zh: "选关", en: "Levels" });
  g.text("B " + backLabel, x + 10, y + h - 20, { color: g.INK });
  g.text("A " + nextLabel, x + w - 10, y + h - 20, { align: "right", color: g.INK });
}

/* ---------------- title ---------------- */
var title = { sel: 0, items: [], loading: false };
function titleItems() {
  return [
    { label: T({ zh: "开始游戏", en: "Play" }), act: function () { game.go("levels", null, { fade: false }); } },
    { label: T({ zh: "大师课", en: "Lessons" }), act: function () { game.go("lessons", null, { fade: false }); } },
    { label: T({ zh: "大师笔记", en: "Notes" }), act: function () { game.push("pages", { section: T({ zh: "大师笔记", en: "Master Notes" }), blocks: KLOTSKI_DATA.notes }); } },
    { label: T({ zh: "玩法", en: "How To" }), act: function () { game.push("pages", { section: T({ zh: "玩法", en: "How to Play" }), blocks: KLOTSKI_DATA.help }); } }
  ];
}
function drawMini(g, x, y, cell) {
  var rows = ["HAAI", "HAAI", "JBBK", "JNOK", "P@@Q"], map = {}, i, yy, xx, ch, p;
  var pieces = [];
  for (yy = 0; yy < 5; yy++) {
    for (xx = 0; xx < 4; xx++) {
      ch = rows[yy].charAt(xx);
      if (ch === "@" || ch === ".") continue;
      if (!map[ch]) { map[ch] = []; pieces.push(ch); }
      map[ch].push([xx, yy]);
    }
  }
  g.rect(x - 2, y - 2, 4 * cell + 4, 5 * cell + 4, g.DARK);
  g.rect(x, y, 4 * cell, 5 * cell, g.PAPER);
  for (i = 0; i < pieces.length; i++) {
    ch = pieces[i];
    var list = map[ch], xs = [], ys = [], c;
    for (c = 0; c < list.length; c++) { xs.push(list[c][0]); ys.push(list[c][1]); }
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    var x1 = Math.max.apply(null, xs), y1 = Math.max.apply(null, ys);
    var w = x1 - x0 + 1, h = y1 - y0 + 1;
    var isCao = w === 2 && h === 2;
    g.rect(x + x0 * cell + 1, y + y0 * cell + 1, w * cell - 2, h * cell - 2, isCao ? g.INK : g.PAPER);
    g.frame(x + x0 * cell + 1, y + y0 * cell + 1, w * cell - 2, h * cell - 2, g.INK);
    if (!isCao && w === 1 && h === 1) g.rect(x + x0 * cell + 4, y + y0 * cell + 4, 2, 2, g.MID);
  }
}

var titleScene = {
  enter: function () {
    PT.clear();
    title.sel = 0;
    title.items = titleItems();
    ensureLoaded();
  },
  update: function () {
    if (!loaded) return;
    if (game.repeat("left") && title.sel % 2 === 1) { title.sel--; game.sfx("tick"); }
    if (game.repeat("right") && title.sel % 2 === 0) { title.sel++; game.sfx("tick"); }
    if (game.repeat("up") && title.sel >= 2) { title.sel -= 2; game.sfx("tick"); }
    if (game.repeat("down") && title.sel < 2) { title.sel += 2; game.sfx("tick"); }
    if (game.pressed("a") || game.pressed("start")) { title.items[title.sel].act(); game.sfx("ok"); return; }
    var ev = PT.take();
    if (ev && ev.dist < 8) {
      var col = ev.x0 >= 80 ? 1 : 0, row = ev.y0 >= 136 ? 1 : 0;
      if (ev.x0 >= 18 && ev.x0 < 142 && ev.y0 >= 104 && ev.y0 < 164) {
        title.sel = row * 2 + col; game.sfx("ok"); title.items[title.sel].act(); return;
      }
    }
  },
  draw: function (g) {
    g.clear(g.PAPER);
    drawMini(g, 58, 42, 11);
    g.window(45, 2, 70, 18, { thin: true });
    g.text(T({ zh: "华容道", en: "KLOTSKI" }), 80, 5, { align: "center", color: g.INK });
    g.text(T({ zh: "曹操脱险", en: "A Huarong tale" }), 80, 22, { align: "center", color: g.INK });
    var i, bx, by;
    for (i = 0; i < title.items.length; i++) {
      bx = 18 + (i % 2) * 62; by = 104 + Math.floor(i / 2) * 30;
      if (!loaded) break;
      if (i === title.sel) {
        g.rect(bx, by, 60, 27, g.INK);
        g.text(title.items[i].label, bx + 30, by + 8, { align: "center", color: g.PAPER });
      } else {
        g.frame(bx, by, 60, 27, g.INK);
        g.text(title.items[i].label, bx + 30, by + 8, { align: "center", color: g.INK });
      }
    }
    if (!loaded) {
      g.text(T({ zh: "读取中…", en: "Loading..." }), 80, 120, { align: "center", color: g.INK });
    }
    g.rect(0, 169, 160, 1, g.DARK);
    g.text(T({ zh: "已通 {a}/{b}　课 {c}/{d}", en: "Cleared {a}/{b}  Lessons {c}/{d}" },
      { a: clearedCount(), b: LEVELS.length, c: lessonsDone(), d: LESSONS.length }), 80, 172, { align: "center", color: g.INK });
    g.text(T({ zh: "方向 选　A 好", en: "Arrows  A OK" }), 5, 186, { color: g.INK });
  }
};

/* ---------------- the level list ---------------- */
var levelList = { list: [], sel: 0, top: 0, filter: 0 };
function filterName(f) {
  if (!f) return T({ zh: "全部", en: "ALL" });
  return T({ zh: "{n} 星", en: "Lv{n}" }, { n: f });
}
function buildLevelList() {
  var i, out = [];
  for (i = 0; i < LEVELS.length; i++) if (!levelList.filter || LEVELS[i].diff === levelList.filter) out.push(LEVELS[i]);
  levelList.list = out;
  if (levelList.sel >= out.length) levelList.sel = Math.max(0, out.length - 1);
  levelList.top = Math.max(0, Math.min(levelList.top, Math.max(0, out.length - LIST_ROWS)));
}
function keepLevelInView() {
  if (levelList.sel < levelList.top) levelList.top = levelList.sel;
  if (levelList.sel >= levelList.top + LIST_ROWS) levelList.top = levelList.sel - LIST_ROWS + 1;
  levelList.top = Math.max(0, Math.min(levelList.top, Math.max(0, levelList.list.length - LIST_ROWS)));
}

var levelsScene = {
  enter: function () { PT.clear(); ensureLoaded(); buildLevelList(); },
  update: function () {
    if (!loaded) return;
    if (game.repeat("up")) { if (levelList.list.length) { levelList.sel = (levelList.sel + levelList.list.length - 1) % levelList.list.length; keepLevelInView(); game.sfx("tick"); } }
    if (game.repeat("down")) { if (levelList.list.length) { levelList.sel = (levelList.sel + 1) % levelList.list.length; keepLevelInView(); game.sfx("tick"); } }
    if (game.pressed("a")) { openLevelAt(levelList.sel); return; }
    if (game.pressed("b")) { game.go("title", null, { fade: false }); return; }
    if (game.pressed("select")) { nextFilter(); return; }
    var ev = PT.take();
    if (!ev) return;
    if (ev.dist > 8) {
      levelList.top = Math.max(0, Math.min(Math.max(0, levelList.list.length - LIST_ROWS), levelList.top + Math.round(-ev.dy / ROW_H)));
      levelList.sel = Math.max(levelList.top, Math.min(levelList.top + LIST_ROWS - 1, levelList.sel));
      return;
    }
    if (ev.y0 < HEAD) { nextFilter(); return; }
    var i = Math.floor((ev.y0 - 22) / ROW_H);
    if (i >= 0 && i < LIST_ROWS && levelList.top + i < levelList.list.length) {
      levelList.sel = levelList.top + i;
      openLevelAt(levelList.sel);
    }
  },
  draw: function (g) {
    g.clear(g.PAPER);
    g.rect(0, 0, 160, HEAD, g.PAPER);
    g.rect(0, HEAD - 1, 160, 1, g.DARK);
    g.text(T({ zh: "选关", en: "Levels" }), 5, 4, { color: g.INK });
    g.text(filterName(levelList.filter) + " ▼", 48, 4, { color: g.INK });
    g.text(T({ zh: "通 {a}/{b}", en: "Done {a}/{b}" }, { a: clearedCount(), b: LEVELS.length }), 155, 4, { align: "right", color: g.INK });
    var i, y, lv, rec;
    for (i = 0; i < LIST_ROWS && levelList.top + i < levelList.list.length; i++) {
      lv = levelList.list[levelList.top + i];
      y = 22 + i * ROW_H;
      var sel = levelList.top + i === levelList.sel;
      if (sel) g.rect(0, y, 160, ROW_H, g.INK);
      var fg = sel ? g.PAPER : g.INK, sub = sel ? g.PAPER : g.INK;
      g.text(pad2(lv.num), 4, y + 1, { color: fg });
      g.text(T(lv.name), 23, y + 1, { color: fg });
      rec = saved.levels[lv.id];
      if (rec) drawCheck(g, 147, y + 2, fg);
      drawStars(g, 23, y + 18, lv.diff, sel ? g.PAPER : g.INK, sel ? g.PAPER : g.MID);
      var line = rec ? T({ zh: "最佳 {n}", en: "BEST {n}" }, { n: rec.best }) : T({ zh: "最少 {n}", en: "PAR {n}" }, { n: lv.par });
      g.text(line, 60, y + 15, { color: sub });
    }
    if (!levelList.list.length) g.text(T({ zh: "没有这一档", en: "None" }), 80, 80, { align: "center", color: g.INK });
    g.rect(0, FOOT, 160, 1, g.DARK);
    g.text(T({ zh: "↑↓ 选　A 开始", en: "Up/down  A play" }), 5, FOOT + 1, { color: g.INK });
    g.text(T({ zh: "SELECT 筛选　B 返回", en: "SELECT filter  B back" }), 5, FOOT + 13, { color: g.INK });
  }
};
function openLevelAt(i) {
  var lv = levelList.list[i];
  if (!lv) return;
  game.sfx("ok");
  game.go("table", { kind: "level", id: lv.id }, { fade: false });
}
function nextFilter() {
  levelList.filter = (levelList.filter + 1) % 6;
  levelList.sel = 0; levelList.top = 0;
  buildLevelList(); keepLevelInView();
  game.sfx("tick");
}

/* ---------------- the master-class list ---------------- */
var lessonList = { sel: 0, top: 0 };
var lessonsScene = {
  enter: function () { PT.clear(); ensureLoaded(); },
  update: function () {
    if (!loaded) return;
    if (game.repeat("up")) { lessonList.sel = (lessonList.sel + LESSONS.length - 1) % LESSONS.length; keepLessonInView(); game.sfx("tick"); }
    if (game.repeat("down")) { lessonList.sel = (lessonList.sel + 1) % LESSONS.length; keepLessonInView(); game.sfx("tick"); }
    if (game.pressed("a")) { openLessonAt(lessonList.sel); return; }
    if (game.pressed("b")) { game.go("title", null, { fade: false }); return; }
    if (game.pressed("select")) {
      game.push("pages", { section: T({ zh: "大师笔记", en: "Master Notes" }), blocks: KLOTSKI_DATA.notes });
      game.sfx("tap"); return;
    }
    var ev = PT.take();
    if (!ev) return;
    if (ev.dist > 8) {
      lessonList.top = Math.max(0, Math.min(Math.max(0, LESSONS.length - LIST_ROWS), lessonList.top + Math.round(-ev.dy / 27)));
      lessonList.sel = Math.max(lessonList.top, Math.min(lessonList.top + LIST_ROWS - 1, lessonList.sel));
      return;
    }
    var i = Math.floor((ev.y0 - 22) / 27);
    if (i >= 0 && i < LIST_ROWS && lessonList.top + i < LESSONS.length) {
      lessonList.sel = lessonList.top + i;
      openLessonAt(lessonList.sel);
    }
  },
  draw: function (g) {
    g.clear(g.PAPER);
    g.rect(0, 0, 160, HEAD, g.PAPER);
    g.rect(0, HEAD - 1, 160, 1, g.DARK);
    g.text(T({ zh: "大师课", en: "Master Class" }), 5, 4, { color: g.INK });
    g.text(T({ zh: "{a}/{b}", en: "Done {a}/{b}" }, { a: lessonsDone(), b: LESSONS.length }), 155, 4, { align: "right", color: g.INK });
    var i, y, lv, done, sel, fg, sub;
    for (i = 0; i < LIST_ROWS && lessonList.top + i < LESSONS.length; i++) {
      lv = LESSONS[lessonList.top + i];
      y = 22 + i * 27;
      sel = lessonList.top + i === lessonList.sel;
      if (sel) g.rect(0, y, 160, 27, g.INK);
      fg = sel ? g.PAPER : g.INK; sub = sel ? g.PAPER : g.INK;
      g.text(pad2(lv.num), 4, y + 1, { color: fg });
      g.text(T(lv.title), 23, y + 1, { color: fg });
      done = saved.lessons[lv.id] && saved.lessons[lv.id].done;
      if (done) drawCheck(g, 147, y + 2, fg);
      g.text(T(lv.idea), 23, y + 15, { color: sub });
    }
    g.rect(0, FOOT, 160, 1, g.DARK);
    g.text(T({ zh: "↑↓ 选　A 上课", en: "Up/down  A start" }), 5, FOOT + 1, { color: g.INK });
    g.text(T({ zh: "SELECT 笔记　B 返回", en: "SELECT notes  B back" }), 5, FOOT + 13, { color: g.INK });
  }
};
function keepLessonInView() {
  if (lessonList.sel < lessonList.top) lessonList.top = lessonList.sel;
  if (lessonList.sel >= lessonList.top + LIST_ROWS) lessonList.top = lessonList.sel - LIST_ROWS + 1;
  lessonList.top = Math.max(0, Math.min(lessonList.top, Math.max(0, LESSONS.length - LIST_ROWS)));
}
function openLessonAt(i) {
  var lv = LESSONS[i];
  if (!lv) return;
  game.sfx("ok");
  game.go("table", { kind: "lesson", id: lv.id }, { fade: false });
}

/* ---------------- the page reader: notes and help ---------------- */
var pg = { section: null, blocks: null, list: [], page: 0, ready: false };
function buildPages(g, blocks) {
  var out = [], i, j, lines, wanted, k;
  var LIMIT = 8;
  for (i = 0; i < blocks.length; i++) {
    lines = [];
    for (j = 0; j < blocks[i].lines.length; j++) {
      wanted = g.wrap(T(blocks[i].lines[j]), 144);
      for (k = 0; k < wanted.length; k++) lines.push(wanted[k]);
    }
    for (j = 0; j < lines.length; j += LIMIT) {
      out.push({ title: blocks[i].title, cont: j > 0, lines: lines.slice(j, j + LIMIT) });
    }
  }
  return out;
}
var pagesScene = {
  enter: function (args) {
    PT.clear();
    pg.section = args.section || "";
    pg.blocks = args.blocks || [];
    pg.list = []; pg.page = 0; pg.ready = false;
  },
  update: function () {
    if (!pg.ready) return;
    var last = pg.list.length - 1;
    if (game.pressed("a") || game.pressed("right")) { pageNext(); return; }
    if (game.pressed("b") || game.pressed("left")) { pageBack(); return; }
    var ev = PT.take();
    if (ev && ev.dist < 8 && ev.y0 > 172) {
      if (ev.x0 < 80) pageBack(); else pageNext();
    }
  },
  draw: function (g) {
    if (!pg.ready) { pg.list = buildPages(g, pg.blocks); pg.ready = true; }
    g.clear(g.PAPER);
    g.rect(0, 0, 160, HEAD, g.PAPER);
    g.rect(0, HEAD - 1, 160, 1, g.DARK);
    g.text(T(pg.section), 5, 4, { color: g.INK });
    g.text((pg.page + 1) + "/" + Math.max(1, pg.list.length), 155, 4, { align: "right", color: g.INK });
    var item = pg.list[pg.page], i;
    if (!item) return;
    g.text(T(item.title) + (item.cont ? T({ zh: "（续）", en: " (cont.)" }) : ""), 8, 26, { color: g.INK });
    for (i = 0; i < item.lines.length; i++) g.text(item.lines[i], 8, 44 + i * 14, { color: g.INK });
    g.rect(0, FOOT, 160, 1, g.DARK);
    if (pg.page > 0) g.text(T({ zh: "‹ 上一页", en: "< Prev" }), 5, FOOT + 5, { color: g.INK });
    else g.text(T({ zh: "‹ 返回", en: "< Back" }), 5, FOOT + 5, { color: g.INK });
    if (pg.page < pg.list.length - 1) g.text(T({ zh: "下一页 ›", en: "Next >" }), 155, FOOT + 5, { align: "right", color: g.INK });
    else g.text(T({ zh: "结束 ›", en: "Done >" }), 155, FOOT + 5, { align: "right", color: g.INK });
  }
};
function pageNext() {
  if (pg.page < pg.list.length - 1) { pg.page++; game.sfx("move"); }
  else { game.pop(); }
}
function pageBack() {
  if (pg.page > 0) { pg.page--; game.sfx("move"); }
  else { game.pop(); }
}

/* ---------------- go ---------------- */
game.scene("table", tableScene);
game.scene("title", titleScene);
game.scene("levels", levelsScene);
game.scene("lessons", lessonsScene);
game.scene("pages", pagesScene);
game.start("title");

/* a small read-only window for tests and for anyone debugging in the console */
window.KLOTSKI = {
  levels: function () { return LEVELS.length; },
  lessons: function () { return LESSONS.length; },
  cleared: function () { return clearedCount(); },
  state: function () {
    return table.level ? {
      id: table.level.id, moves: table.moves, ui: table.ui,
      pieces: KRules.serialize(table.pieces),
      goal: table.level.goal, selected: table.selected
    } : null;
  },
  open: function (id) {
    var lv = BY_ID[id];
    if (!lv) return false;
    game.go("table", { kind: lv.kind, id: id }, { fade: false });
    return true;
  },
  step: function (i, dx, dy) {
    if (!table.level || table.ui !== "play" || table.anim || table.queue.length) return false;
    if (KRules.maxSteps(table.level, table.pieces, i, dx, dy) < 1) return false;
    enqueue(i, dx, dy, 1);
    return true;
  }
};
