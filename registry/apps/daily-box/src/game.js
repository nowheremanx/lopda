/* 每日推箱 / DailyBox: one crate-pushing puzzle a day. Board rules live in board.js, the level table in
   levels.js, the tiles and postman in art.js, and the owner-approved input clock in input.js.
   This file is the handheld: the day, the drawing, the menus, the result card and the saves.

   Design for 160x144: the 10x8 board is 160x128, the status bar is the last 16 pixels. */
var game = LoGame.create({ width: 160, height: 144, lang: "zh" });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";

var W = 10, H = 8, CELLS = W * H, TB = 128, TILE = 16;
var DIRS = { up: -W, right: 1, down: W, left: -1 };
var DIR_CODE = ["up", "right", "down", "left"];
var BUTTON_DIRS = ["up", "down", "left", "right"];
var VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
var MS = BoxInput.MS;
var WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];
var WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

var today, dayK, level, goalMap = new Uint8Array(CELLS);
var state, inp = BoxInput.create();
var facing = "down", ui = "loading";
var solvedFlag = false, solvedRecord = null, peeked = false;
var saved = { v: 1, days: {} }, seenHelp = false;
var playMs = 0;
var cardPending = false, cardAt = 0;
var replay = null, dust = [], swipe = null;
var menuSel = 0, menuBack = "play", confirmBack = "play", helpBack = "play";

/* lo-game's pointer keeps only the latest position in a tick, so a down + move + up inside one tick
   would lose where the finger started. These listeners keep both ends of the gesture. */
var touchStart = null, touchLast = null;
(function trackTouch() {
  if (typeof document === "undefined" || !document.querySelector) return;
  var canvas = document.querySelector("canvas");
  if (!canvas || !canvas.addEventListener) return;
  function point(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - r.left) * 160 / (r.width || 1)),
      y: Math.floor((e.clientY - r.top) * 144 / (r.height || 1))
    };
  }
  canvas.addEventListener("pointerdown", function (e) { touchStart = touchLast = point(e); });
  canvas.addEventListener("pointermove", function (e) { touchLast = point(e); });
  canvas.addEventListener("pointerup", function (e) { touchLast = point(e); });
  canvas.addEventListener("pointercancel", function (e) { touchLast = point(e); });
})();

/* ---------------- dates and the save files ---------------- */

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function dayKey(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }

function dateLabel(d) {
  if (game.lang === "en") return WEEK_EN[d.getDay()] + " " + (d.getMonth() + 1) + "/" + d.getDate();
  return (d.getMonth() + 1) + "/" + d.getDate() + " 周" + WEEK_ZH[d.getDay()];
}

function fmtTime(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + pad2(s % 60);
}

function normalizeBox(v) {
  if (!v || v.v !== 1 || !v.days || typeof v.days !== "object" || Array.isArray(v.days)) {
    return { v: 1, days: {} };
  }
  return { v: 1, days: v.days };
}

function trimDays() {
  var keys = Object.keys(saved.days).sort();
  while (keys.length > 400) delete saved.days[keys.shift()];
}

/* The first result of the day is the one kept: replaying a solved day never overwrites it. */
function recordDay(pushes, moves, ms, wasPeeked) {
  if (saved.days[dayK]) return saved.days[dayK];
  saved.days[dayK] = {
    pushes: pushes,
    moves: moves,
    ms: Math.max(0, Math.round(ms)),
    peeked: !!wasPeeked
  };
  trimDays();
  game.save("box", saved);
  game.remove("box-now");
  return saved.days[dayK];
}

function streakCount() {
  if (!today) return 0;
  var d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!saved.days[dayKey(d)]) d.setDate(d.getDate() - 1);
  var n = 0;
  while (saved.days[dayKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/* `history` is the undo stack with the current position appended as its last entry: board.js's
   history holds the position before each move, so the board needs one more snapshot to come back.
   The save is capped at 400 snapshots so 400 moves can never reach the 256 KB budget; undo inside
   a session stays unlimited (state.history is not trimmed). `ms` keeps the elapsed time across a
   visit to HOME. */
function saveNow() {
  if (!state || solvedFlag) return;
  var cur = { player: state.player, boxes: state.boxes.slice(), moves: state.moves, pushes: state.pushes };
  var hist = state.history.concat([cur]);
  if (hist.length > 400) hist = hist.slice(hist.length - 400);
  game.save("box-now", { date: dayK, history: hist, ms: Math.round(playMs) });
}

function validCell(v) {
  return typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= 0 && v < CELLS && level.floor[v] === 1;
}

function validCount(v) {
  return typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= 0;
}

/* Every snapshot is used by B (undo), so a single junk entry must not get in. */
function validSnapshot(s) {
  if (!s || typeof s !== "object") return false;
  if (!validCell(s.player)) return false;
  if (!Array.isArray(s.boxes) || s.boxes.length !== level.boxes.length) return false;
  if (!validCount(s.moves) || !validCount(s.pushes)) return false;
  var seen = {};
  for (var i = 0; i < s.boxes.length; i++) {
    var b = s.boxes[i];
    if (!validCell(b) || b === s.player || seen[b]) return false;
    seen[b] = 1;
  }
  return true;
}

function restoreNow(now) {
  if (!now || !Array.isArray(now.history) || !now.history.length) return false;
  var hist = now.history.slice();
  for (var i = 0; i < hist.length; i++) {
    if (!validSnapshot(hist[i])) return false;
  }
  var cur = hist.pop();
  state.player = cur.player;
  state.boxes = cur.boxes.slice();
  state.moves = cur.moves;
  state.pushes = cur.pushes;
  state.history = hist;
  if (typeof now.ms === "number" && isFinite(now.ms) && now.ms >= 0) playMs = now.ms;
  return true;
}

/* ---------------- the board and its day ---------------- */

function setLevel(lv) {
  level = lv;
  goalMap = new Uint8Array(CELLS);
  for (var i = 0; i < level.goals.length; i++) goalMap[level.goals[i]] = 1;
}

function resetBoard(clearNow) {
  state = Board.create(level);
  inp = BoxInput.create();
  facing = "down";
  solvedFlag = false;
  solvedRecord = null;
  cardPending = false;
  replay = null;
  dust = [];
  swipe = null;
  touchStart = touchLast = null;
  playMs = 0;
  if (clearNow) game.remove("box-now");
}

/* No held key may survive an overlay: otherwise the postman walks off on his own when it closes. */
function clearInput() {
  inp.held = null;
  inp.queued = null;
  swipe = null;
  touchStart = touchLast = null;
}

/* Releases are processed in every screen, overlay or not. */
function pumpReleases() {
  for (var i = 0; i < BUTTON_DIRS.length; i++) {
    var dir = BUTTON_DIRS[i];
    if (game.released(dir)) BoxInput.release(inp, dir);
  }
  if (ui !== "play" && game.pointer.released && swipe) {
    if (swipe.dir) BoxInput.release(inp, swipe.dir);
    swipe = null;
  }
}

/* The day starts fresh: this is also the fallback when a save cannot be read. */
function freshToday() {
  today = new Date();
  dayK = dayKey(today);
  setLevel(Board.levelFor(today));
  peeked = false;
  resetBoard(false);
}

function loadAll() {
  Promise.all([game.load("box"), game.load("box-now"), game.load("box-help")]).then(function (r) {
    saved = normalizeBox(r[0]);
    trimDays();
    seenHelp = !!r[2];
    freshToday();
    var now = r[1];
    var rec = saved.days[dayK];
    if (rec) {
      /* A solved day opens on its finished board: replay the stored moves with no animation. */
      for (var i = 0; i < level.solution.length; i++) Board.step(state, level.solution[i]);
      solvedFlag = true;
      inp.won = true;
      solvedRecord = rec;
      if (now) game.remove("box-now");
      ui = "card";
    } else if (now && now.date === dayK && restoreNow(now)) {
      ui = "play";
      /* The winning move itself can be in box-now: finish the day instead of showing an unsolved board. */
      if (Board.solved(state)) onSolved();
    } else {
      if (now) game.remove("box-now");
      ui = "play";
    }
    clearInput();
    if (!seenHelp) {
      helpBack = ui;
      ui = "help";
    }
  }).catch(function () {
    saved = { v: 1, days: {} };
    freshToday();
    clearInput();
    ui = "play";
  });
}

/* ---------------- sound: all original, and quiet ---------------- */

function sndStep() {
  game.sfx({ wave: "square", from: 880, to: 880, ms: 18, attack: 1, decay: 17, vol: 0.02 });
}

function sndPush() {
  game.after(0.05, function () {
    game.sfx({ wave: "noise", from: 700, to: 500, ms: 180, attack: 5, decay: 170, vol: 0.18 });
  });
}

function sndBump() {
  game.sfx({ wave: "square", from: 110, to: 80, ms: 60, attack: 2, decay: 58, vol: 0.06 });
}

function sndGoal() {
  game.sfx({ wave: "square", from: 660, to: 660, ms: 60, vol: 0.05 });
  game.after(0.07, function () {
    game.sfx({ wave: "square", from: 990, to: 990, ms: 90, vol: 0.05 });
  });
}

function sndDead() {
  game.sfx({ wave: "triangle", from: 150, to: 90, ms: 140, vol: 0.08 });
}

/* A short rising four-note fanfare of our own, after the box settles. */
function sndWin() {
  var notes = [523, 659, 784, 1047];
  game.after(0.3, function () {
    for (var i = 0; i < notes.length; i++) {
      (function (f, delay) {
        game.after(delay, function () {
          game.sfx({ wave: "square", from: f, to: f, ms: 120, vol: 0.05 });
        });
      })(notes[i], i * 0.11);
    }
  });
}

/* ---------------- moving ---------------- */

function doMove(dir) {
  if (ui !== "play" || solvedFlag) return;
  var delta = DIRS[dir], to = state.player + delta, bi = -1;
  if (level.floor[to]) {
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i] === to) { bi = i; break; }
    }
  }
  var res = Board.step(state, dir);
  facing = dir;
  var kind = res.kind === "walk" ? "walk" : res.kind === "push" ? "push" : "bump";
  var a = BoxInput.begin(inp, kind, game.time * 1000);
  a.dir = dir;
  a.fromBox = to;
  a.box = res.kind === "bumpBox";
  a.result = res;
  a.bi = bi;
  if (kind === "walk") sndStep();
  else if (kind === "push") sndPush();
  else sndBump();
  if (!replay) saveNow();
}

function finishAnim(a) {
  var now = game.time * 1000;
  if (a.kind === "push") {
    dust.push({ cell: a.fromBox, t: 0 });
    var res = a.result || {};
    BoxInput.finish(inp, now, "push", !!(res.onGoal || res.dead));
    if (res.onGoal) sndGoal();
    else if (res.dead) sndDead();
    if (Board.solved(state)) onSolved();
  } else if (a.kind === "walk") {
    BoxInput.finish(inp, now, "walk", false);
  } else {
    BoxInput.finish(inp, now, "bump", true);
  }
}

function onSolved() {
  if (solvedFlag) return;
  solvedFlag = true;
  inp.won = true;
  clearInput();
  /* The result comes before the removal: a full box-now must never cost the day's result. */
  solvedRecord = saved.days[dayK] || recordDay(state.pushes, state.moves, playMs, peeked);
  game.remove("box-now");
  cardPending = true;
  cardAt = game.time + 0.35;
  sndWin();
}

function doUndo() {
  if (inp.anim || solvedFlag || replay) return;
  if (!Board.undo(state)) { game.sfx("miss"); return; }
  inp.queued = null;
  sndStep();
  saveNow();
}

function doRestart() {
  resetBoard(true);
  ui = "play";
  game.sfx("tap");
}

function startReplay() {
  peeked = true;
  /* If the day was already solved, the first result's numbers stay, but it is now a peeked day. */
  if (saved.days[dayK]) {
    saved.days[dayK].peeked = true;
    game.save("box", saved);
  }
  resetBoard(true);
  clearInput();
  ui = "play";
  replay = { i: 0 };
}

function stopReplay() {
  replay = null;
  clearInput();
  game.sfx("miss");
}

function updateReplay() {
  if (inp.anim || !replay) return;
  if (replay.i < level.solution.length) {
    doMove(DIR_CODE[level.solution[replay.i++]]);
  } else {
    replay = null;
    if (!solvedFlag && Board.solved(state)) onSolved();
  }
}

/* ---------------- the overlays ---------------- */

function menuItems() {
  return [
    T({ zh: "继续", en: "Resume" }),
    T({ zh: "重来", en: "Restart" }),
    T({ zh: "看答案", en: "Show answer" }),
    T({ zh: "玩法", en: "How to play" })
  ];
}

function openMenu() {
  if (ui !== "play" && ui !== "done") return;
  menuBack = ui;
  menuSel = 0;
  clearInput();
  ui = "menu";
  game.sfx("tap");
}

function openConfirm(back) {
  confirmBack = back;
  clearInput();
  ui = "confirm";
  game.sfx("tap");
}

function chooseMenu(i) {
  game.sfx("tap");
  if (i === 0) ui = menuBack;
  else if (i === 1) { confirmBack = "menu"; clearInput(); ui = "confirm"; }
  else if (i === 2) startReplay();
  else if (i === 3) { helpBack = "menu"; clearInput(); ui = "help"; }
}

function menuHit() {
  var p = game.pointer;
  if (p.x < 24 || p.x > 136 || p.y < 32 || p.y >= 32 + 4 * 16) return -1;
  return Math.min(3, Math.floor((p.y - 32) / 16));
}

/* Only the A label confirms a tap; the rest of the dialog is inert. */
function confirmARect() {
  var full = T({ zh: "A 重来   B 取消", en: "A restart   B cancel" });
  var label = T({ zh: "A 重来", en: "A restart" });
  var left = 80 - game.g.measure(full) / 2;
  return { x: Math.round(left - 2), y: 64, w: Math.round(game.g.measure(label) + 4), h: 20 };
}

function confirmAHit(x, y) {
  var r = confirmARect();
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function updateMenu() {
  var items = menuItems();
  if (game.repeat("up", 0.32, 0.09)) {
    menuSel = (menuSel + items.length - 1) % items.length;
    game.sfx("move");
  } else if (game.repeat("down", 0.32, 0.09)) {
    menuSel = (menuSel + 1) % items.length;
    game.sfx("move");
  }
  var pick = -1;
  if (game.pressed("a") || game.pressed("start")) pick = menuSel;
  else if (game.pointer.pressed) pick = menuHit();
  if (pick >= 0) chooseMenu(pick);
  else if (game.pressed("b")) {
    ui = menuBack;
    game.sfx("miss");
  }
}

function updateConfirm() {
  if (game.pressed("a")) doRestart();
  else if (game.pointer.pressed && confirmAHit(game.pointer.x, game.pointer.y)) doRestart();
  else if (game.pressed("b")) {
    ui = confirmBack;
    game.sfx("miss");
  }
}

function updateHelp() {
  if (game.pressed("a") || game.pressed("b") || game.pointer.pressed) {
    if (!seenHelp) {
      seenHelp = true;
      game.save("box-help", 1);
    }
    ui = helpBack || "play";
    game.sfx("tap");
  }
}

function updateCard() {
  if (game.pressed("a") || game.pointer.pressed) {
    clearInput();
    ui = "done";
    game.sfx("tap");
  }
}

function updateDone() {
  if (game.pressed("start")) openMenu();
  else if (game.pressed("select")) openConfirm("done");
}

/* ---------------- play input ---------------- */

function pressDir(dir, now) {
  var move = BoxInput.press(inp, dir, now);
  if (move) doMove(move);
}

function swipeDirection(x0, y0, x1, y1) {
  var dx = x1 - x0, dy = y1 - y0;
  if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
}

function pointerSwipe(now) {
  var p = game.pointer;
  if (p.pressed) {
    var start = touchStart || p;
    swipe = start.y < TB ? { x: start.x, y: start.y, dir: null } : null;
  }
  if (!swipe) return;
  /* Resolve on the release position too: a down + move + up inside one tick is still one swipe. */
  if (!swipe.dir) {
    var end = touchLast || p;
    swipe.dir = swipeDirection(swipe.x, swipe.y, end.x, end.y);
    if (swipe.dir) pressDir(swipe.dir, now);
  }
  if (p.released) {
    if (swipe.dir) BoxInput.release(inp, swipe.dir);
    swipe = null;
    touchStart = touchLast = null;
  }
}

function handlePlayInput(now) {
  if (game.pressed("start")) { openMenu(); return; }
  if (game.pressed("select")) { openConfirm("play"); return; }
  if (game.pressed("b")) { doUndo(); return; }

  pointerSwipe(now);

  for (var i = 0; i < BUTTON_DIRS.length; i++) {
    var dir = BUTTON_DIRS[i];
    if (game.pressed(dir)) pressDir(dir, now);
  }

  if (inp.anim) return;
  var move = BoxInput.next(inp, now);
  if (move) doMove(move.dir);
}

/* ---------------- the scene ---------------- */

game.scene("play", {
  enter: function () {
    loadAll();
  },
  update: function (dt) {
    var now = game.time * 1000;
    if (ui === "loading") return;
    pumpReleases();
    if (ui === "help") { updateHelp(); return; }
    if (ui === "menu") { updateMenu(); return; }
    if (ui === "confirm") { updateConfirm(); return; }
    if (ui === "card") { updateCard(); return; }
    if (ui === "done") { updateDone(); return; }

    if (!solvedFlag) playMs += dt * 1000;

    var ended = BoxInput.advance(inp, dt * 1000);
    if (ended) finishAnim(ended);

    for (var i = 0; i < dust.length; i++) dust[i].t += dt * 1000;
    dust = dust.filter(function (p) { return p.t < MS.dust; });

    if (cardPending && !inp.anim && game.time >= cardAt) {
      cardPending = false;
      clearInput();
      ui = "card";
      return;
    }
    if (solvedFlag) {
      if (game.pressed("start")) openMenu();
      else if (game.pressed("select")) openConfirm("play");
      return;
    }
    if (replay) {
      if (game.pressed("start")) { openMenu(); return; }
      if (game.pressed("select")) { openConfirm("play"); return; }
      if (game.pressed("b")) { stopReplay(); return; }
      updateReplay();
      return;
    }
    handlePlayInput(now);
  },
  draw: draw
});

/* ---------------- drawing ---------------- */

function cellXY(i) { return [(i % W) * TILE, ((i / W) | 0) * TILE]; }
function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

/* Only the wall cells that touch a floor cell are drawn; the rest of the outside is paper. */
function wallVisible(i) {
  var x = i % W, y = (i / W) | 0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      var nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (level.floor[ny * W + nx]) return true;
    }
  }
  return false;
}

function animOffsets() {
  var out = { pdx: 0, pdy: 0, bdx: 0, bdy: 0 };
  var a = inp.anim;
  if (!a) return out;
  var v = VEC[a.dir];
  if (a.kind === "walk") {
    var p = a.t / a.dur;
    out.pdx = -v[0] * TILE * (1 - p);
    out.pdy = -v[1] * TILE * (1 - p);
  } else if (a.kind === "bump") {
    var nudge = Math.sin(Math.PI * a.t / a.dur) * (a.box ? 1 : 2);
    out.pdx = v[0] * nudge;
    out.pdy = v[1] * nudge;
  } else if (a.kind === "push") {
    if (a.t < MS.brace) {
      var lean = 2 * (a.t / Math.max(1, MS.brace));
      out.pdx = -v[0] * (TILE - lean);
      out.pdy = -v[1] * (TILE - lean);
      out.bdx = -v[0] * TILE;
      out.bdy = -v[1] * TILE;
    } else {
      var q = ease(Math.min(1, (a.t - MS.brace) / MS.move));
      out.bdx = -v[0] * TILE * (1 - q);
      out.bdy = -v[1] * TILE * (1 - q);
      out.pdx = -v[0] * 14 * (1 - q);
      out.pdy = -v[1] * 14 * (1 - q);
    }
  }
  return out;
}

function drawBoard(g) {
  var i, c;
  for (i = 0; i < CELLS; i++) {
    c = cellXY(i);
    if (level.floor[i]) {
      g.sprite(ART.floor, c[0], c[1]);
      if (goalMap[i]) g.sprite(ART.goal, c[0], c[1]);
    } else if (wallVisible(i)) {
      g.sprite(ART.wall, c[0], c[1]);
    }
  }

  var off = animOffsets();
  var a = inp.anim;
  var pushing = a && a.kind === "push";
  for (var bi = 0; bi < state.boxes.length; bi++) {
    var b = state.boxes[bi];
    c = cellXY(b);
    var moving = pushing && a.bi === bi;
    var ox = moving ? off.bdx : 0, oy = moving ? off.bdy : 0;
    var on = goalMap[b] && !moving;
    var dead = !on && state.dead[b] && !moving;
    g.sprite(on ? ART.done : dead ? ART.dead : ART.box,
      c[0] + Math.round(ox), c[1] + Math.round(oy));
  }

  drawDust(g);
  drawPlayer(g, off);
}

function drawDust(g) {
  var v = VEC[facing];
  for (var i = 0; i < dust.length; i++) {
    var p = dust[i], c = cellXY(p.cell), k = p.t / MS.dust;
    var cx = c[0] + 8, cy = c[1] + 8;
    for (var s = -1; s <= 1; s += 2) {
      var x = cx + (v[1] ? s * (4 + 3 * k) : 0) - v[0] * (2 + 5 * k);
      var y = cy + (v[0] ? s * (4 + 3 * k) : 0) - v[1] * (2 + 5 * k);
      g.pixel(Math.floor(x), Math.floor(y), g.MID);
    }
  }
}

function drawPlayer(g, off) {
  var a = inp.anim;
  var base = facing === "left" ? "right" : facing;
  var flip = facing === "left";
  var fr, bob = 0;
  if (a && a.kind === "push") fr = "push" + base + (a.t > a.dur * 0.55 ? "1" : "0");
  else if (a && a.kind === "walk") {
    fr = base + (a.t > a.dur / 2 ? "1" : "0");
    bob = a.t > a.dur * 0.25 && a.t < a.dur * 0.75 ? -1 : 0;
  } else if (a && a.kind === "bump" && a.box) fr = "push" + base + "0";
  else fr = base + "0";
  var c = cellXY(state.player);
  g.sprite(ART[fr], c[0] + Math.round(off.pdx), c[1] + Math.round(off.pdy) + bob, { flip: flip });
}

/* A solved day shows the result that was kept, not the cell values of a reconstruction. */
function statusPushes() {
  if (solvedFlag && solvedRecord) return solvedRecord.pushes;
  return state ? state.pushes : 0;
}

function drawStatus(g) {
  if (!state || !level || !today) return;
  g.rect(0, TB, 160, 16, g.INK);
  g.text(dateLabel(today), 4, 131, { color: g.PAPER });
  var right = T({ zh: "推 {n}  最少 {p}", en: "{n} / par {p}" }, { n: statusPushes(), p: level.par });
  g.text(right, 156, 131, { color: g.PAPER, align: "right" });
}

function helpLines() {
  return [
    T({ zh: "把箱子推到记号上。", en: "Push crates to marks." }),
    T({ zh: "只能推，不能拉。", en: "Push, never pull." }),
    T({ zh: "方向键或滑动，B 撤销。", en: "Keys/swipe. B undo." }),
    T({ zh: "SELECT 重来，START 菜单。", en: "SELECT restart. START menu." }),
    T({ zh: "一天一关，明天再来。", en: "One puzzle a day." })
  ];
}

function drawHelp(g) {
  var x = 2, y = 1, w = 156, h = 142;
  g.window(x, y, w, h);
  var ty = y + 6;
  g.text(T({ zh: "玩法", en: "How to play" }), x + w / 2, ty, { align: "center" });
  ty += 18;
  g.rect(x + 10, ty - 4, w - 20, 1, g.MID);
  ty += 2;
  var lines = helpLines();
  for (var i = 0; i < lines.length; i++) {
    ty += g.text(lines[i], x + 9, ty, { width: w - 18 });
    ty += 1;
  }
  g.text(T({ zh: "A 好", en: "A OK" }), x + w / 2, y + h - 16, { align: "center" });
}

function drawMenu(g) {
  var items = menuItems();
  var x = 24, y = 8, w = 112, h = 112;
  g.window(x, y, w, h);
  g.text(T({ zh: "暂停", en: "Paused" }), x + w / 2, y + 5, { align: "center" });
  g.rect(x + 8, y + 20, w - 16, 1, g.MID);
  for (var i = 0; i < items.length; i++) {
    var ry = y + 24 + i * 16;
    if (i === menuSel) {
      g.rect(x + 6, ry - 1, w - 12, 15, g.INK);
      g.text(items[i], x + 14, ry, { color: g.PAPER });
    } else {
      g.text(items[i], x + 14, ry);
    }
  }
  g.text(T({ zh: "A 好  B 返回", en: "A select  B back" }), x + w / 2, y + h - 14, { align: "center", color: g.DARK });
}

function drawConfirm(g) {
  var w = 136, x = 12, y = 38, h = 56;
  g.window(x, y, w, h);
  g.text(T({ zh: "重来这一局？", en: "Restart this puzzle?" }), 80, y + 8, { align: "center" });
  g.text(T({ zh: "A 重来   B 取消", en: "A restart   B cancel" }), 80, y + 30, { align: "center", color: g.DARK });
}

/* A peeked day never gets the perfect badge, even when the answer replay used par pushes. */
function cardBadge(rec) {
  if (rec.peeked) return "answer";
  return rec.pushes === level.par ? "perfect" : null;
}

function drawCard(g) {
  var rec = solvedRecord || saved.days[dayK] || { pushes: state.pushes, moves: state.moves, ms: playMs, peeked: peeked };
  var badge = cardBadge(rec);
  var w = 124, h = 106, x = 18, y = Math.round((TB - h) / 2);
  g.window(x, y, w, h);
  var ty = y + 6;
  g.text(T({ zh: "今日完成", en: "All done" }), x + w / 2, ty, { align: "center" });
  ty += 16;
  if (badge === "answer") {
    g.text(T({ zh: "看过答案", en: "Answer shown" }), x + w / 2, ty, { align: "center", color: g.DARK });
    ty += 14;
  } else if (badge === "perfect") {
    g.text(T({ zh: "完美", en: "Perfect" }), x + w / 2, ty, { align: "center", color: g.DARK });
    ty += 14;
  }
  g.rect(x + 8, ty - 1, w - 16, 1, g.MID);
  ty += 5;
  g.text(T({ zh: "推 {n}  最少 {p}", en: "{n} / par {p}" }, { n: rec.pushes, p: level.par }),
    x + w / 2, ty, { align: "center" });
  ty += 14;
  g.text(T({ zh: "用时 {t}", en: "Time {t}" }, { t: fmtTime(rec.ms) }), x + w / 2, ty, { align: "center" });
  ty += 14;
  g.text(T({ zh: "连续 {k} 天", en: "Streak {k}" }, { k: streakCount() }), x + w / 2, ty, { align: "center" });
  g.text(T({ zh: "A 好", en: "A OK" }), x + w / 2, y + h - 18, { align: "center" });
}

function drawTomorrow(g) {
  var text = T({ zh: "明天再来", en: "Come back tomorrow" });
  var w = g.measure(text) + 16;
  g.window(Math.round((160 - w) / 2), 100, w, 20);
  g.text(text, 80, 103, { align: "center" });
}

function draw(g) {
  g.clear(g.PAPER);
  if (ui === "loading" || !level || !state) return;
  drawBoard(g);
  if (ui === "help") {
    drawHelp(g);            /* the help is the whole screen, so no status bar behind it */
    return;
  }
  if (ui === "card") {
    g.dither(0, 0, 160, TB, g.MID, 2);
    drawCard(g);
  } else if (ui === "done") {
    drawTomorrow(g);
  } else if (ui === "menu") {
    drawMenu(g);
  } else if (ui === "confirm") {
    drawConfirm(g);
  }
  drawStatus(g);
}

/* ---------------- the tests' window into the game ---------------- */

function levelFromRows(rows) {
  var floor = new Uint8Array(CELLS), boxes = [], goals = [], player = -1;
  for (var y = 0; y < H; y++) {
    if (!rows[y] || rows[y].length !== W) throw new Error("a test level row must be 10 cells");
    for (var x = 0; x < W; x++) {
      var ch = rows[y].charAt(x), i = y * W + x;
      if (ch !== "#") floor[i] = 1;
      if (ch === "$" || ch === "*") boxes.push(i);
      if (ch === "." || ch === "*" || ch === "+") goals.push(i);
      if (ch === "@" || ch === "+") player = i;
    }
  }
  return { w: W, h: H, floor: floor, boxes: boxes, goals: goals, player: player, par: 1, solution: [] };
}

var BOX = {
  state: function () {
    return {
      date: dayK,
      player: state ? state.player : -1,
      boxes: state ? state.boxes.slice() : [],
      moves: state ? state.moves : 0,
      pushes: state ? state.pushes : 0,
      history: state ? state.history.length : 0,
      ms: Math.round(playMs),
      solved: !!solvedFlag,
      peeked: !!peeked,
      statusPushes: statusPushes(),
      ui: ui,
      par: level ? level.par : 0
    };
  },
  days: function () { return JSON.parse(JSON.stringify(saved)); },
  help: function () { return helpLines(); },
  streak: function () { return streakCount(); },
  badge: function () {
    var rec = solvedRecord || saved.days[dayK];
    return rec ? cardBadge(rec) : null;
  },
  confirmA: function () { return confirmARect(); },
  confirmHit: function (x, y) { return confirmAHit(x, y); },
  swipe: function (x0, y0, x1, y1) { return swipeDirection(x0, y0, x1, y1); },
  load: function (rows) {
    if (!today) today = new Date();
    dayK = dayKey(today);
    setLevel(levelFromRows(rows));
    peeked = false;
    seenHelp = true;
    resetBoard(true);
    ui = "play";
  }
};
window.BOX = BOX;

game.start("play");
