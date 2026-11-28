/* 每日推箱 / DailyBox: one crate-pushing puzzle a day. Board rules live in board.js, the level table in
   levels.js, the tiles and postman in art.js, and the owner-approved input clock in input.js.
   This file is the handheld: the day, the drawing, the menus, the result card and the saves.

   Design for 160x144: the 10x8 board is 160x128, the status bar is the last 16 pixels.
   The screen around those 160x144 is the warehouse: a wall calendar above, the week's ledger and the
   floor below (lo-game 1.5 fill, sdk/UI.md 13). The world and every rule in it keep their size. */
var game = LoGame.create({ width: 160, height: 144, lang: "zh", fill: true, bands: paintBands });
var T = game.t;
document.documentElement.lang = game.lang === "zh" ? "zh-CN" : "en";

var W = 10, H = 8, CELLS = W * H, TB = 128, TILE = 16;
var DIRS = { up: -W, right: 1, down: W, left: -1 };
var DIR_CODE = ["up", "right", "down", "left"];
var BUTTON_DIRS = ["up", "down", "left", "right"];
var ALL_BUTTONS = ["up", "down", "left", "right", "a", "b", "start", "select"];
var VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
var MS = BoxInput.MS;
var WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];
var WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MONTH_EN = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

var today, dayK, level, goalMap = new Uint8Array(CELLS);
var state, inp = BoxInput.create();
var facing = "down", ui = "loading";
var solvedFlag = false, solvedRecord = null, peeked = false;
var saved = { v: 1, days: {} }, seenHelp = false;
var boxWritable = true;
var playMs = 0;
var cardPending = false, cardAt = 0;
var replay = null, dust = [], swipe = null;
var menuSel = 0, menuBack = "play", confirmBack = "play", helpBack = "play";
var titleSel = 0;
var firstHint = false, hintUntil = 0;
var calY = 0, calM = 0, calSel = null, calBack = "title";
/* True when the puzzle on screen was deliberately opened from an earlier day. Only then does the
   clock's midnight leave it alone; today's own puzzle still rolls over to the new day. */
var backPlay = false;
/* box-now keeps only one board on disk; this holds the others for the session, so looking at the
   calendar or another day never loses a board that is already in progress. */
var parked = {}, storageNowKey = null;
var tallyDrop = false, tallyAt = 0;

/* lo-game's pointer keeps only the latest position in a tick, so a down + move + up inside one tick
   would lose where the finger started. These listeners keep both ends of the gesture. */
var touchStart = null, touchLast = null, touchCancelled = false, touchIgnored = false;
(function trackTouch() {
  if (typeof document === "undefined" || !document.querySelector) return;
  var canvas = document.querySelector("canvas");
  if (!canvas || !canvas.addEventListener) return;
  function primary(e) { return e.isPrimary !== false; }
  function point(e) {
    var r = canvas.getBoundingClientRect();
    /* With the fill layout the canvas is bigger than the world: divide by the canvas pixel size,
       then subtract the world's offset. Outside the world a gesture is not ours: null, so a drag
       that begins in a band never becomes a swipe. */
    var st = game.stage, k = st.k || 1;
    var fx = (e.clientX - r.left) / k - st.x;
    var fy = (e.clientY - r.top) / k - st.y;
    if (fx < 0 || fy < 0 || fx >= 160 || fy >= 144) return null;
    return { x: Math.floor(fx), y: Math.floor(fy) };
  }
  canvas.addEventListener("pointerdown", function (e) {
    if (!primary(e)) {
      if (!touchStart) touchIgnored = true;   /* do not let a second finger start a swipe */
      return;
    }
    touchIgnored = false;
    touchCancelled = false;
    touchStart = touchLast = point(e);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (!primary(e)) return;
    touchLast = point(e);
  });
  canvas.addEventListener("pointerup", function (e) {
    if (!primary(e)) return;
    touchLast = point(e);
  });
  canvas.addEventListener("pointercancel", function (e) {
    if (!primary(e)) return;
    touchCancelled = true;
    touchStart = touchLast = null;
  });
})();

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    if ((ui === "play" && !solvedFlag) || ui === "done") maybeNewDay();
  });
}

/* ---------------- dates and the save files ---------------- */

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function dayKey(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }

function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

/* The table's own epoch, so the calendar and box-now agree with Board.levelFor. */
function epochKey() {
  var e = (typeof LEVELS !== "undefined" && LEVELS.epoch) || [2026, 10, 26];
  return e[0] + "-" + pad2(e[1]) + "-" + pad2(e[2]);
}

/* A strict YYYY-MM-DD to a local date, or null; 2026-02-31 must not become March. */
function keyToDate(key) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  var y = +m[1], mo = +m[2] - 1, d = +m[3];
  var date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
}

/* Calendar days run from the epoch to the real today; the table wraps, but the calendar does not. */
function playableKey(key) {
  return !!keyToDate(key) && key >= epochKey() && key <= dayKey(new Date());
}

function isTodayKey(key) { return key === dayKey(new Date()); }

function mondayOf(d) {
  var s = dayStart(d);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

function dateLabel(d) {
  if (game.lang === "en") return WEEK_EN[d.getDay()] + " " + (d.getMonth() + 1) + "/" + d.getDate();
  return (d.getMonth() + 1) + "/" + d.getDate() + " 周" + WEEK_ZH[d.getDay()];
}

function fmtTime(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 60) + ":" + pad2(s % 60);
}

function validDay(day) {
  return !!day && typeof day === "object" && !Array.isArray(day) &&
    typeof day.pushes === "number" && isFinite(day.pushes) && day.pushes >= 0 &&
    typeof day.moves === "number" && isFinite(day.moves) && day.moves >= 0 &&
    typeof day.ms === "number" && isFinite(day.ms) && day.ms >= 0;
}

/* Drop junk days: a bad entry must never become a card or a streak. */
function normalizeBox(v) {
  var out = { v: 1, days: {} };
  if (!v || v.v !== 1 || !v.days || typeof v.days !== "object" || Array.isArray(v.days)) return out;
  Object.keys(v.days).forEach(function (key) {
    var day = v.days[key];
    if (validDay(day)) {
      var kept = {
        pushes: day.pushes,
        moves: day.moves,
        ms: day.ms,
        peeked: !!day.peeked
      };
      /* `late` is only ever added (a past day solved later); old entries have no key and keep counting. */
      if (day.late === true) kept.late = true;
      out.days[key] = kept;
    }
  });
  return out;
}

/* Keep 400 days, but never the one just recorded: back-playing an old day puts it at the front
   of the sorted list, and deleting it would lose the result the player just earned. */
function trimDays() {
  var keys = Object.keys(saved.days).sort();
  while (keys.length > 400) {
    var victim = keys[0] === dayK ? 1 : 0;
    delete saved.days[keys.splice(victim, 1)[0]];
  }
}

/* The first result of the day is the one kept: replaying a solved day never overwrites it.
   A day solved on a later date is marked late, so the streak (days solved on the day) stays honest. */
function recordDay(pushes, moves, ms, wasPeeked) {
  if (saved.days[dayK]) return saved.days[dayK];
  var rec = {
    pushes: pushes,
    moves: moves,
    ms: Math.max(0, Math.round(ms)),
    peeked: !!wasPeeked
  };
  if (dayK !== dayKey(new Date())) rec.late = true;
  saved.days[dayK] = rec;
  trimDays();
  if (boxWritable) game.save("box", saved);   /* a failed read must not overwrite the player's store */
  return saved.days[dayK];
}

/* Back from the real today: a day with an entry continues it, a `late` entry breaks it. Entries
   written before 1.1.0 have no `late` and keep counting, as they always did. */
function streakCount() {
  var d = dayStart(new Date());
  if (!saved.days[dayKey(d)]) d = addDays(d, -1);
  var n = 0;
  while (saved.days[dayKey(d)] && !saved.days[dayKey(d)].late) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/* `history` is the undo stack with the current position appended as its last entry: board.js's
   history holds the position before each move, so the board needs one more snapshot to come back.
   The save is capped at 400 snapshots so 400 moves can never reach the 256 KB budget; undo inside
   a session stays unlimited (state.history is not trimmed). `ms` keeps the elapsed time across a
   visit to HOME. */
function nowDoc() {
  if (!state) return null;
  var cur = { player: state.player, boxes: state.boxes.slice(), moves: state.moves, pushes: state.pushes };
  var hist = state.history.concat([cur]);
  if (hist.length > 400) hist = hist.slice(hist.length - 400);
  return {
    date: dayK,
    history: hist,
    ms: Math.round(playMs),
    peeked: !!peeked
  };
}

function saveNow() {
  if (!state || solvedFlag) return;
  var doc = nowDoc();
  if (!doc) return;
  game.save("box-now", doc);
  storageNowKey = dayK;
}

/* Remove the one box-now slot only when it really holds this day's board: another day's board
   parked in the session must not be thrown away because this one was solved or restarted. */
function dropNowFor(key) {
  if (storageNowKey === null || storageNowKey === key) {
    game.remove("box-now");
    storageNowKey = null;
  }
}

/* Keep an in-progress board for this session when the player looks at another day. A blank board
   is not worth a write, and a write would only replace another day's box-now on disk. */
function parkCurrent() {
  if (!state || solvedFlag) return;
  if (state.moves <= 0 && state.pushes <= 0 && !peeked) return;
  var doc = nowDoc();
  if (!doc) return;
  parked[dayK] = doc;
  saveNow();
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
  peeked = !!now.peeked;
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
  touchCancelled = false;
  touchIgnored = false;
  playMs = 0;
  if (clearNow) {
    delete parked[dayK];
    dropNowFor(dayK);
  }
}

/* No held key may survive an overlay: otherwise the postman walks off on his own when it closes. */
function clearInput() {
  inp.held = null;
  inp.queued = null;
  swipe = null;
  touchStart = touchLast = null;
  touchCancelled = false;
  touchIgnored = false;
}

function releaseDirections() {
  for (var i = 0; i < BUTTON_DIRS.length; i++) {
    var dir = BUTTON_DIRS[i];
    if (game.released(dir)) BoxInput.release(inp, dir);
  }
}

/* Releases are processed in every screen, overlay or not. In normal play they run after the
   presses of the same frame, so a quick tap is one move and never a held direction. */
function pumpReleases() {
  if (ui !== "play" || solvedFlag || replay) releaseDirections();
  if (ui !== "play" && game.pointer.released && swipe) {
    if (swipe.dir) BoxInput.release(inp, swipe.dir);
    swipe = null;
  }
}

/* The day starts fresh: this is also the fallback when a save cannot be read. */
function freshToday() {
  today = new Date();
  dayK = dayKey(today);
  backPlay = false;
  setLevel(Board.levelFor(today));
  peeked = false;
  resetBoard(false);
}

function anyInput() {
  for (var i = 0; i < ALL_BUTTONS.length; i++) {
    if (game.pressed(ALL_BUTTONS[i])) return true;
  }
  return tapInWorld();
}

/* A tap in the scenery is not an input: lo-game clamps the pointer to the world's near edge, so
   without this a tap on the wall calendar or the floor would move, flip a month or dismiss a card. */
function tapInWorld() {
  var p = game.pointer, st = game.stage;
  return p.pressed && p.stageX >= st.x && p.stageX < st.x + 160 && p.stageY >= st.y && p.stageY < st.y + 144;
}

/* Midnight while the app is open: the next play input, or coming back from HOME, starts the new
   day. A card already on screen stays until A, as the brief says. */
function switchDay(now) {
  var oldKey = dayK;
  today = dayStart(now);
  dayK = dayKey(today);
  backPlay = false;
  setLevel(Board.levelFor(today));
  peeked = false;
  resetBoard(false);
  delete parked[oldKey];
  dropNowFor(oldKey);
  var rec = saved.days[dayK];
  if (rec) {
    for (var i = 0; i < level.solution.length; i++) Board.step(state, level.solution[i]);
    solvedFlag = true;
    inp.won = true;
    solvedRecord = rec;
    tallyDrop = false;
    ui = "card";
  } else {
    ui = "play";
  }
  clearInput();
  return true;
}

/* A past puzzle is the player's to finish: only today's board rolls over at midnight. */
function maybeNewDay() {
  var now = new Date();
  var nowKey = dayKey(now);
  if (nowKey === dayK) return false;
  if (backPlay) return false;
  if (ui === "card") return false;
  if (solvedFlag && ui !== "done") return false;
  return switchDay(now);
}

/* One key at a time: a failed box-now must not cost a box that did load. */
function readKey(key) {
  return game.load(key).then(
    function (value) { return { ok: true, value: value }; },
    function () { return { ok: false, value: null }; }
  );
}

function showFirstHint() {
  hintUntil = game.time + 6;
  seenHelp = true;
  /* Keep the old key written (never deleted) so the hint stays a first-start thing. */
  game.save("box-help", 1);
}

/* Open a day's puzzle: a finished day shows its result, a day in progress restores it, and a
   fresh day starts empty. The calendar refuses days outside the epoch..today range; the title's
   今天 row uses `force` so a phone with a wrong clock can still play. */
function openDay(d, force) {
  var key = dayKey(d);
  if (!force && !playableKey(key)) return false;
  backPlay = key < dayKey(new Date());
  var hint = firstHint;
  firstHint = false;
  var same = (dayK === key && state && level);
  if (same) {
    var recNow = saved.days[key];
    if (solvedFlag || recNow) {
      if (!solvedFlag) {
        resetBoard(false);
        for (var j = 0; j < level.solution.length; j++) Board.step(state, level.solution[j]);
      }
      solvedFlag = true;
      inp.won = true;
      solvedRecord = saved.days[key] || solvedRecord;
      tallyDrop = false;
      ui = "card";
      clearInput();
      return true;
    }
    var live = parked[key];
    if (live && state.moves === 0 && state.pushes === 0 && !peeked) {
      if (restoreNow(live)) {
        delete parked[key];
        if (Board.solved(state)) onSolved();
      } else if (storageNowKey === key) {
        game.remove("box-now");
        storageNowKey = null;
      }
    }
    ui = "play";
    if (hint && !solvedFlag) showFirstHint();
    clearInput();
    return true;
  }

  parkCurrent();
  today = dayStart(d);
  dayK = key;
  setLevel(Board.levelFor(today));
  peeked = false;
  resetBoard(false);

  var rec = saved.days[key];
  if (rec) {
    /* A solved day opens on its finished board: replay the stored moves with no animation. */
    for (var i = 0; i < level.solution.length; i++) Board.step(state, level.solution[i]);
    solvedFlag = true;
    inp.won = true;
    solvedRecord = rec;
    tallyDrop = false;
    ui = "card";
    delete parked[key];
    if (storageNowKey === key) { game.remove("box-now"); storageNowKey = null; }
  } else {
    var doc = parked[key];
    delete parked[key];
    if (doc && restoreNow(doc)) {
      ui = "play";
      /* The winning move itself can be in box-now: finish the day instead of showing an unsolved board. */
      if (Board.solved(state)) onSolved();
    } else {
      if (doc && storageNowKey === key) { game.remove("box-now"); storageNowKey = null; }
      ui = "play";
    }
    if (hint && !solvedFlag && ui === "play") showFirstHint();
  }
  clearInput();
  return true;
}

function openToday() { return openDay(new Date(), true); }

function loadAll() {
  Promise.all([readKey("box"), readKey("box-now"), readKey("box-help")]).then(function (r) {
    boxWritable = r[0].ok;
    saved = normalizeBox(r[0].value);
    trimDays();
    seenHelp = !!(r[2].ok && r[2].value);
    firstHint = !seenHelp;
    parked = {};
    storageNowKey = null;
    var old = r[1].ok ? r[1].value : null;
    if (old && keyToDate(old.date) && old.date >= epochKey() && old.date <= dayKey(new Date()) &&
        !saved.days[old.date]) {
      parked[old.date] = old;
      storageNowKey = old.date;
    } else if (old) {
      game.remove("box-now");   /* a future, malformed or finished day's board is not ours to resume */
    }
    freshToday();
    ui = "title";
    clearInput();
  }).catch(function () {
    /* Unexpected only: keep whatever was read, but never leave level/state undefined. */
    if (!level || !state) {
      try { freshToday(); } catch (e) {}
    }
    firstHint = true;
    clearInput();
    ui = "title";
  });
}

/* ---------------- the calendar ---------------- */

var parCache = {};

function calMonthInRange(y, m) {
  var e = keyToDate(epochKey()), t = dayStart(new Date());
  return (y * 12 + m) >= (e.getFullYear() * 12 + e.getMonth()) &&
    (y * 12 + m) <= (t.getFullYear() * 12 + t.getMonth());
}

function calDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

/* The first and last days of a month the calendar may select: 1..end, trimmed by the epoch and today. */
function calMonthRange(y, m) {
  if (!calMonthInRange(y, m)) return null;
  var first = 1, last = calDaysInMonth(y, m);
  var ek = epochKey(), tk = dayKey(new Date());
  var prefix = y + "-" + pad2(m + 1) + "-";
  if (ek.slice(0, 7) === prefix.slice(0, 7)) first = +ek.slice(8, 10);
  if (tk.slice(0, 7) === prefix.slice(0, 7)) last = +tk.slice(8, 10);
  if (first > last) return null;
  return { first: first, last: last };
}

function calKey(y, m, day) { return y + "-" + pad2(m + 1) + "-" + pad2(day); }

function parForKey(key) {
  if (parCache[key] == null) {
    var d = keyToDate(key);
    try { parCache[key] = d ? Board.levelFor(d).par : 0; } catch (e) { parCache[key] = 0; }
  }
  return parCache[key];
}

function stampKind(key, rec) {
  if (!rec) return null;
  if (rec.peeked) return "peek";
  return rec.pushes === parForKey(key) ? "perfect" : "over";
}

function monthParCount(y, m) {
  var b = calMonthRange(y, m);
  if (!b) return 0;
  var n = 0;
  for (var day = b.first; day <= b.last; day++) {
    var key = calKey(y, m, day), rec = saved.days[key];
    if (rec && !rec.peeked && rec.pushes === parForKey(key)) n++;
  }
  return n;
}

function calSelectable(key) { return playableKey(key); }

/* Open the calendar on a day; a day outside the epoch..today range falls back to today.
   `back` is where B returns: "title", "play" (the pause menu) or "card" (the result card). */
function openCalendar(key, back) {
  if (back) calBack = back;
  var d = key ? keyToDate(key) : null;
  if (!d || !calMonthInRange(d.getFullYear(), d.getMonth())) d = dayStart(new Date());
  var dk = dayKey(d);
  if (dk < epochKey()) d = keyToDate(epochKey());
  if (dk > dayKey(new Date())) d = dayStart(new Date());
  calY = d.getFullYear();
  calM = d.getMonth();
  calSel = dayKey(d);
  if (!calSelectable(calSel)) {
    var b = calMonthRange(calY, calM);
    if (b) calSel = calKey(calY, calM, b.first);
  }
  clearInput();
  ui = "calendar";
  game.sfx("tap");
}

/* Left/right step a day (and cross a month edge); up/down step a week in the same weekday column.
   A vertical step that leaves the month or the selectable range does nothing: it never jumps to
   another weekday. */
function calMove(dx, dy) {
  if (ui !== "calendar") openCalendar(calSel || dayKey(new Date()));
  var cur = keyToDate(calSel);
  if (!cur) return false;
  if (dx) {
    var next = addDays(cur, dx);
    var key = dayKey(next);
    if (!calSelectable(key)) return false;
    calY = next.getFullYear();
    calM = next.getMonth();
    calSel = key;
    return true;
  }
  if (dy) {
    var far = addDays(cur, dy * 7);
    if (far.getFullYear() !== calY || far.getMonth() !== calM) return false;
    var k = dayKey(far);
    if (!calSelectable(k)) return false;
    calSel = k;
    return true;
  }
  return false;
}

/* The header arrows change a whole month, never past the epoch month or the current month. */
function calCanShift(delta) {
  var y = calY, m = calM + delta;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return calMonthInRange(y, m) && !!calMonthRange(y, m);
}

function calShiftMonth(delta) {
  if (!calCanShift(delta)) return false;
  var m = calM + delta;
  var y = calY + Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  calY = y;
  calM = m;
  var b = calMonthRange(y, m);
  if (!b) return false;
  calSel = calKey(y, m, delta < 0 ? b.last : b.first);
  return true;
}

function calDayKeyAt(row, col) {
  var offset = (new Date(calY, calM, 1).getDay() + 6) % 7;
  var day = row * 7 + col - offset + 1;
  if (day < 1 || day > calDaysInMonth(calY, calM)) return null;
  return calKey(calY, calM, day);
}

function openSelectedDay() {
  if (!calSel || !calSelectable(calSel)) { game.sfx("err"); return; }
  if (openDay(keyToDate(calSel))) game.sfx("tap");
}


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
  if (kind === "bump") inp.blocked = true;   /* the proto stops repeats when the bump starts */
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
    /* A bump set blocked when it began; ending it only sets readyAt, exactly as the proto does. */
    BoxInput.finish(inp, now, "bump", false);
  }
}

function onSolved() {
  if (solvedFlag) return;
  solvedFlag = true;
  inp.won = true;
  clearInput();
  /* The result comes before the removal: a full box-now must never cost the day's result. */
  solvedRecord = saved.days[dayK] || recordDay(state.pushes, state.moves, playMs, peeked);
  delete parked[dayK];
  dropNowFor(dayK);
  cardPending = true;
  cardAt = game.time + 0.35;
  tallyDrop = true;
  sndWin();
}

function doUndo() {
  if (inp.anim || solvedFlag || replay) return;
  if (!Board.undo(state)) { game.sfx("miss"); return; }
  sndStep();
  saveNow();
}

function doRestart() {
  resetBoard(true);
  ui = "play";
  game.sfx("tap");
}

function startReplay() {
  var already = !!saved.days[dayK];
  peeked = true;
  /* If the day was already solved, the first result's numbers stay, but it is now a peeked day. */
  if (already) {
    saved.days[dayK].peeked = true;
    if (boxWritable) game.save("box", saved);
  }
  resetBoard(true);
  clearInput();
  ui = "play";
  replay = { i: 0 };
  /* Keep the peek even if the app is left before the replay is stopped or finished. */
  if (!already) saveNow();
}

function stopReplay() {
  replay = null;
  clearInput();
  saveNow();
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
    T({ zh: "玩法", en: "How to play" }),
    T({ zh: "日历", en: "Calendar" })
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
  else if (i === 4) {
    parkCurrent();
    openCalendar(dayKey(today || new Date()), "play");
  }
}

function menuHit() {
  var p = game.pointer;
  var items = menuItems();
  var top = 18, h = items.length * 22;
  if (p.x < 24 || p.x > 136 || p.y < top || p.y >= top + h) return -1;
  return Math.min(items.length - 1, Math.floor((p.y - top) / 22));
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
  else if (tapInWorld()) pick = menuHit();
  if (pick >= 0) chooseMenu(pick);
  else if (game.pressed("b")) {
    ui = menuBack;
    game.sfx("miss");
  }
}

function updateConfirm() {
  if (game.pressed("a")) doRestart();
  else if (tapInWorld() && confirmAHit(game.pointer.x, game.pointer.y)) doRestart();
  else if (game.pressed("b")) {
    ui = confirmBack;
    game.sfx("miss");
  }
}

function updateHelp() {
  if (game.pressed("a") || game.pressed("b") || tapInWorld()) {
    if (!seenHelp) {
      seenHelp = true;
      game.save("box-help", 1);
    }
    ui = helpBack || "play";
    game.sfx("tap");
  }
}

function updateCard() {
  if (game.pressed("a") || (tapInWorld() && game.pointer.x < 80)) {
    openCalendar(dayK, "card");
  } else if (game.pressed("b") || game.pressed("start") || tapInWorld()) {
    clearInput();
    ui = "play";             /* 再看看: back to the finished board */
    game.sfx("tap");
  }
}

function updateDone() {
  if (game.pressed("start")) openMenu();
  else if (game.pressed("select")) openConfirm("done");
}

/* ---------------- title and calendar input ---------------- */

/* The owner's picture fills the top 104 rows; the two choices sit side by side under it, each
   77 x 22 (44 css px tall at the smallest screen), then the footer from y 128. */
var TITLE_ROW_X = [2, 81], TITLE_ROW_Y = 105, TITLE_ROW_W = 77, TITLE_ROW_H = 22;

function chooseTitle(i) {
  game.sfx("tap");
  if (i === 0) openToday();
  else openCalendar(dayKey(new Date()), "title");
}

function titleHit(x, y) {
  if (y < TITLE_ROW_Y || y >= TITLE_ROW_Y + TITLE_ROW_H) return -1;
  for (var i = 0; i < TITLE_ROW_X.length; i++) {
    if (x >= TITLE_ROW_X[i] && x < TITLE_ROW_X[i] + TITLE_ROW_W) return i;
  }
  return -1;
}

function updateTitle() {
  /* Two choices side by side: any direction moves to the other one. */
  if (game.repeat("left", 0.32, 0.09) || game.repeat("right", 0.32, 0.09) ||
      game.repeat("up", 0.32, 0.09) || game.repeat("down", 0.32, 0.09)) { titleSel = (titleSel + 1) % 2; game.sfx("move"); }
  if (game.pressed("a") || game.pressed("start")) chooseTitle(titleSel);
  else if (tapInWorld()) {
    var hit = titleHit(game.pointer.x, game.pointer.y);
    if (hit >= 0) { titleSel = hit; chooseTitle(hit); }
  }
}

var CAL_TOP = 28, CAL_ROW_H = 17, CAL_COL_W = 22, CAL_LEFT = 2, CAL_HEADER_H = 14;

function calHitCell(x, y) {
  /* The cells stay 17 tall: a 6-row month simply cannot be taller on a 144 px screen. */
  if (y < CAL_TOP || y >= CAL_TOP + 6 * CAL_ROW_H) return null;
  var col = Math.floor((x - CAL_LEFT) / CAL_COL_W);
  var row = Math.floor((y - CAL_TOP) / CAL_ROW_H);
  if (col < 0 || col > 6) return null;
  var key = calDayKeyAt(row, col);
  return key && calSelectable(key) ? key : null;
}

/* The month-arrow zones are on the month-name line only (y < 14); the streak/par text starts at
   y = 14 and spans most of the width. An arrow that is out of range is neither drawn nor accepted,
   and its 14 px height cannot grow to 22 without covering that text. */
function calArrowAt(x, y) {
  if (y < 0 || y >= CAL_HEADER_H) return 0;
  if (x < 24) return calCanShift(-1) ? -1 : 0;
  if (x > 136) return calCanShift(1) ? 1 : 0;
  return 0;
}

function updateCalendar() {
  var moved = false;
  if (game.repeat("left", 0.32, 0.09)) moved = calMove(-1, 0);
  else if (game.repeat("right", 0.32, 0.09)) moved = calMove(1, 0);
  else if (game.repeat("up", 0.32, 0.09)) moved = calMove(0, -1);
  else if (game.repeat("down", 0.32, 0.09)) moved = calMove(0, 1);
  if (moved) game.sfx("move");

  if (game.pressed("a") || game.pressed("start")) { openSelectedDay(); return; }
  if (game.pressed("b")) {
    ui = calBack || "title";
    if (ui === "title") titleSel = 1;
    game.sfx("miss");
    return;
  }
  if (tapInWorld()) {
    var arrow = calArrowAt(game.pointer.x, game.pointer.y);
    if (arrow) {
      if (calShiftMonth(arrow)) game.sfx("move"); else game.sfx("miss");
    } else if (game.pointer.y < CAL_HEADER_H) {
      game.sfx("miss");          /* the month line, but no arrow there */
    } else {
      var key = calHitCell(game.pointer.x, game.pointer.y);
      if (!key) { game.sfx("miss"); return; }
      if (key === calSel) openSelectedDay();
      else { calSel = key; game.sfx("move"); }
    }
  }
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

/* A cancelled gesture never becomes a move, however far the finger travelled. */
function gestureDirection(start, last, cancelled) {
  if (cancelled || !start || !last) return null;
  return swipeDirection(start.x, start.y, last.x, last.y);
}

function pointerSwipe(now) {
  var p = game.pointer;
  if (p.pressed) {
    if (touchIgnored || !tapInWorld()) {
      swipe = null;
      return;
    }
    var start = touchStart || p;
    swipe = start.y < TB ? { x: start.x, y: start.y, dir: null } : null;
  }
  if (!swipe) return;
  /* Resolve on the release position too: a down + move + up inside one tick is still one swipe. */
  if (!swipe.dir) {
    var end = touchLast || p;
    swipe.dir = gestureDirection(swipe, end, touchCancelled);
    if (swipe.dir) pressDir(swipe.dir, now);
  }
  if (p.released) {
    if (swipe.dir) BoxInput.release(inp, swipe.dir);
    swipe = null;
    touchStart = touchLast = null;
    touchCancelled = false;
  }
}

function handlePlayInput(now) {
  if (game.pressed("start")) { releaseDirections(); openMenu(); return; }
  if (game.pressed("select")) { releaseDirections(); openConfirm("play"); return; }
  if (game.pressed("b")) { releaseDirections(); doUndo(); return; }

  pointerSwipe(now);

  for (var i = 0; i < BUTTON_DIRS.length; i++) {
    var dir = BUTTON_DIRS[i];
    if (game.pressed(dir)) pressDir(dir, now);
  }
  releaseDirections();          /* after the presses: press + release in one frame = one move */

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
    if (ui === "title") { updateTitle(); return; }
    if (ui === "calendar") { updateCalendar(); return; }
    if (ui === "play" && !solvedFlag && anyInput() && maybeNewDay()) return;
    if (ui === "done" && anyInput() && maybeNewDay()) return;
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
      tallyAt = game.time;
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

/* ---------------- the warehouse around the world ----------------
   lo-game 1.5 calls paintBands on every frame, before the 160 x 144 world is copied in; `s` is the
   whole stage in canvas pixels. Nothing here can touch the board: the wall calendar and the week
   ledger read yesterday's save and today's date, the same values the title and the calendar screen
   show. On tall phones the bands are a wall above and a floor below; on a short one they shrink to
   the date line, and on a wide stage the extra columns become the ends of the same room. */

/* A 4 x 6 digit: the smallest size a month grid can hold two digits in and still be read at
   arm's length on the smallest phone. Only the wall calendar uses it. */
var BAND_DIGITS = {
  "0": ["1111", "1001", "1001", "1001", "1001", "1111"],
  "1": ["0110", "0010", "0010", "0010", "0010", "0111"],
  "2": ["1111", "0001", "1111", "1000", "1000", "1111"],
  "3": ["1111", "0001", "1111", "0001", "0001", "1111"],
  "4": ["1001", "1001", "1111", "0001", "0001", "0001"],
  "5": ["1111", "1000", "1111", "0001", "0001", "1111"],
  "6": ["1111", "1000", "1111", "1001", "1001", "1111"],
  "7": ["1111", "0001", "0010", "0010", "0100", "0100"],
  "8": ["1111", "1001", "1111", "1001", "1001", "1111"],
  "9": ["1111", "1001", "1111", "0001", "0001", "1111"]
};

function bandDigits(s, text, x, y, color) {
  for (var n = 0; n < text.length; n++) {
    var rows = BAND_DIGITS[text.charAt(n)];
    if (!rows) continue;
    for (var yy = 0; yy < 6; yy++) {
      for (var xx = 0; xx < 4; xx++) {
        if (rows[yy].charAt(xx) === "1") s.pixel(x + n * 5 + xx, y + yy, color);
      }
    }
  }
}

function bandDay() { return today || new Date(); }

/* A month, Monday first, like the calendar screen: where the 1st falls and how many rows it needs. */
function bandMonthShape(d) {
  var y = d.getFullYear(), m = d.getMonth();
  return {
    y: y, m: m,
    offset: (new Date(y, m, 1).getDay() + 6) % 7,
    days: calDaysInMonth(y, m),
    rows: Math.ceil(((new Date(y, m, 1).getDay() + 6) % 7 + calDaysInMonth(y, m)) / 7)
  };
}

/* The month at cell pitch 11 x 7: a wide gap keeps neighbouring days apart, a filled cell for
   today, a dark cell for a day with a result. Returns the grid's size so the panel can centre it. */
function drawBandMonth(s, x, y, shape) {
  var gridW = 7 * 11 - 1, gridH = shape.rows * 7 - 1;
  var d = bandDay(), todayHere = shape.m === d.getMonth() && shape.y === d.getFullYear();
  for (var day = 1; day <= shape.days; day++) {
    var idx = shape.offset + day - 1;
    var cx = x + (idx % 7) * 11, cy = y + ((idx / 7) | 0) * 7;
    var key = calKey(shape.y, shape.m, day);
    var rec = saved.days[key];
    var isToday = todayHere && day === d.getDate();
    if (isToday) s.rect(cx, cy, 9, 6, s.INK);
    else if (rec) s.rect(cx, cy, 9, 6, s.DARK);
    bandDigits(s, String(day), cx + (day > 9 ? 0 : 3), cy, isToday || rec ? s.PAPER : s.INK);
  }
  return { w: gridW, h: gridH };
}

/* The wall calendar: paper card, month row when the sky is tall, the grid and the day's label. */
function drawBandCalendar(s, top, sky) {
  var d = bandDay(), shape = bandMonthShape(d), header = sky >= 62;
  var gridW = 7 * 11 - 1, gridH = shape.rows * 7 - 1;
  var label = dateLabel(d), labelW = s.measure(label);
  var colW = Math.max(44, labelW);
  var pw = gridW + 8 + colW + 8, ph = gridH + (header ? 14 : 0) + 4;
  if (pw > s.width - 4) { colW = Math.max(30, s.width - 4 - gridW - 16); pw = gridW + 8 + colW + 8; }
  var px = Math.floor((s.width - pw) / 2), py = top + Math.floor((sky - ph) / 2);
  if (py < top) py = top;
  s.rect(px + 1, py + 1, pw, ph, s.DARK);       /* a shadow, so the card sits off the wall */
  s.rect(px, py, pw, ph, s.PAPER);
  s.frame(px, py, pw, ph, s.INK);
  var gy = py + 2 + (header ? 14 : 0);
  if (header) {
    var month = game.lang === "en" ? MONTH_EN[shape.m] + " " + shape.y : shape.y + " 年 " + (shape.m + 1) + " 月";
    s.text(month, px + pw / 2, py + 1, { align: "center", color: s.INK });
    s.rect(px + 4, py + 14, pw - 8, 1, s.MID);
  }
  drawBandMonth(s, px + 5, gy, shape);
  s.text(label, px + 5 + gridW + 6, gy + Math.floor((gridH - 12) / 2), { color: s.INK });
}

/* The floor: boards below the world, with a lit seam where the screen ends. */
function drawBandFloor(s, y, foot, calm) {
  if (foot <= 0) return;
  s.rect(0, y, s.width, foot, s.DARK);
  s.rect(0, y, s.width, 1, s.MID);
  if (!calm) {
    for (var row = y + 5; row < y + foot; row += 6) s.dither(0, row, s.width, 1, s.INK, 1);
    for (var x = 12; x < s.width; x += 34) s.rect(x, y + 2, 1, Math.min(3, foot - 2), s.INK);
  }
}

/* The wall: dark boards, beams and a grain, flat on a pause screen. */
function drawBandWall(s, top, calm) {
  if (top <= 0) return;
  s.rect(0, 0, s.width, top, s.INK);
  if (calm) {
    if (top > 2) s.rect(0, top - 1, s.width, 1, s.DARK);
    return;
  }
  for (var y = 8; y < top; y += 11) s.dither(0, y, s.width, 1, s.DARK, 1);
  for (var x = 14; x < s.width; x += 43) s.rect(x, 0, 1, top, s.DARK);
  if (top > 5) s.rect(0, top - 1, s.width, 1, s.DARK);
  /* a tall title band needs one thing to look at above the picture */
  if (ui === "title" && top >= 70) drawBandLamp(s, top, Math.floor(s.width * 0.22));
}

/* A hanging work lamp: the title picture's warehouse has one over the crates, so the ceiling above it
   gets one too, with a faint cone on the wall. */
function drawBandLamp(s, top, x) {
  var y = Math.max(24, Math.floor(top * 0.55)), i, half;
  for (i = 0; i < y - 7; i += 3) s.pixel(x, i, s.DARK);
  for (i = 0; i < 6; i++) {
    half = 2 + Math.floor(i * 1.4);
    s.rect(x - half, y - 6 + i, half * 2 + 1, 1, i < 2 ? s.DARK : s.MID);
  }
  s.rect(x - 1, y, 3, 2, s.PAPER);
  for (var gy = y + 3; gy < top - 1; gy++) {
    var spread = Math.min(20, 3 + Math.floor((gy - y) / 2));
    s.dither(x - spread, gy, spread * 2, 1, s.MID, 1);
  }
}

/* The extra columns of a stage that is too short for the world's width: the room carries on. */
function drawBandSides(s, st) {
  var y = st.y;
  if (st.x > 0) {
    s.rect(0, y, st.x, st.worldH, s.INK);
    for (var lx = 3; lx < st.x; lx += 9) s.dither(lx, y, 1, st.worldH, s.DARK, 1);
    s.rect(st.x - 1, y, 1, st.worldH, s.DARK);
  }
  if (st.x + st.worldW < st.w) {
    var rx = st.x + st.worldW, rw = st.w - rx;
    s.rect(rx, y, rw, st.worldH, s.INK);
    for (var rx2 = rx + 3; rx2 < st.w; rx2 += 9) s.dither(rx2, y, 1, st.worldH, s.DARK, 1);
    s.rect(rx, y, 1, st.worldH, s.DARK);
  }
}

/* The ledger on the floor: the solved week, the same strip the result card drops a stamp onto. */
function drawBandLedger(s, ground, foot) {
  var cardH = 24, streak = foot >= 40;
  var groupH = cardH + (streak ? 14 : 0);
  var top = ground + Math.max(1, Math.floor((foot - groupH) / 2));
  var x = Math.floor((s.width - 118) / 2);
  s.rect(x + 1, top + 1, 118, cardH, s.INK);
  s.rect(x, top, 118, cardH, s.PAPER);
  s.frame(x, top, 118, cardH, s.INK);
  drawTallyStrip(s, x + 4, top + 2);
  if (streak) {
    s.text(T({ zh: "连续 {k} 天", en: "Streak {k}" }, { k: streakCount() }), s.width / 2,
      top + cardH + 1, { align: "center", color: s.PAPER });
  }
  return top + groupH;
}

/* Two crates at the ends of a tall floor, out of the ledger's way. */
function drawBandCrates(s, ground, foot) {
  if (foot < 54 || s.width < 150) return;
  var y = ground + foot - 18;
  s.sprite(ART.box, 2, y);
  s.sprite(ART.box, s.width - 18, y);
}

function paintBands(s, st) {
  var sky = st.y, ground = st.y + st.worldH, foot = st.h - ground;
  var calm = ui !== "play" && ui !== "title";
  s.clear(s.INK);
  if (ui === "loading") { s.clear(s.PAPER); return; }
  if (ui === "title") {
    /* the title picture is a warehouse at night: carry its ceiling and floor past the world */
    drawBandWall(s, sky, false);
    drawBandFloor(s, ground, foot, false);
    drawBandCrates(s, ground, foot);
  } else if (calm) {
    drawBandWall(s, sky, true);
    drawBandFloor(s, ground, foot, true);
  } else {
    drawBandWall(s, sky, false);
    drawBandFloor(s, ground, foot, false);
    if (sky >= 45) drawBandCalendar(s, 0, sky);
    else if (sky >= 14) {
      var label = dateLabel(bandDay());
      s.text(label, s.width / 2, Math.floor((sky - 12) / 2), { align: "center", color: s.PAPER });
    }
    if (foot >= 24) drawBandLedger(s, ground, foot);
    drawBandCrates(s, ground, foot);
  }
  drawBandSides(s, st);
}

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
  if (hintUntil && game.time < hintUntil) {
    /* The first puzzle teaches in one footer line instead of the old help wall. English is a
       little shorter so it still fits one line at the twelve-pixel font. */
    g.text(T({ zh: "推箱子到记号上，B 撤销", en: "Push to marks. B undo." }), 80, 131,
      { color: g.PAPER, align: "center" });
    return;
  }
  g.text(dateLabel(today), 4, 131, { color: g.PAPER });
  var right = T({ zh: "推 {n}  最少 {p}", en: "{n} / par {p}" }, { n: statusPushes(), p: level.par });
  g.text(right, 156, 131, { color: g.PAPER, align: "right" });
}

function helpLines() {
  return [
    T({ zh: "推到记号上，只能推。", en: "Push to marks; no pull." }),
    T({ zh: "方向键或滑动，B 撤销。", en: "Keys/swipe. B undo." }),
    T({ zh: "SELECT 重来", en: "SELECT restart" }),
    T({ zh: "START 菜单", en: "START menu" }),
    T({ zh: "看答案也不断连续", en: "Peeking keeps streak" }),
    T({ zh: "日历：往日补玩不算连续", en: "Past days: no streak." }),
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
  /* 142 px of text room keeps every help line (the longest about 141 px) on one line. */
  for (var i = 0; i < lines.length; i++) {
    ty += g.text(lines[i], x + 7, ty, { width: w - 14 });
  }
  g.text(T({ zh: "A 好", en: "A OK" }), x + w / 2, y + h - 16, { align: "center" });
}

function drawMenu(g) {
  var items = menuItems();
  var x = 24, y = 0, w = 112, h = 144;
  g.window(x, y, w, h);
  g.text(T({ zh: "暂停", en: "Paused" }), x + w / 2, y + 2, { align: "center" });
  g.rect(x + 8, y + 16, w - 16, 1, g.MID);
  /* Rows are 22 units (about 44 CSS px on the smallest screen); five fit above the footer. */
  for (var i = 0; i < items.length; i++) {
    var ry = y + 18 + i * 22;
    if (i === menuSel) {
      g.rect(x + 6, ry, w - 12, 22, g.INK);
      g.text(items[i], x + 14, ry + 5, { color: g.PAPER });
    } else {
      g.text(items[i], x + 14, ry + 5);
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

/* The little stamp the calendar and the tally strip use: a filled square at par, a ring above
   par, a dot when the answer was seen. Drawn from pixels, never a font character. */
function drawStamp(g, x, y, kind, color) {
  color = color == null ? g.INK : color;
  if (kind === "perfect") {
    g.rect(x, y, 5, 5, color);
  } else if (kind === "over") {
    g.frame(x, y, 5, 5, color);
  } else if (kind === "peek") {
    g.rect(x + 1, y + 1, 3, 3, color);
  }
}

/* The solved day's week, Mon-first, with the stamp dropping onto it. */
function drawTallyStrip(g, x, y) {
  var start = mondayOf(today);
  var cw = 14, gap = 2;
  for (var i = 0; i < 7; i++) {
    var d = addDays(start, i), key = dayKey(d);
    var cx = x + i * (cw + gap);
    g.frame(cx, y, cw, 20, key === dayK ? g.INK : g.MID);
    g.text(String(d.getDate()), cx + cw / 2, y + 1, { align: "center" });
    var rec = saved.days[key];
    if (!rec) continue;
    var kind = stampKind(key, rec);
    var sy = y + 14;
    if (key === dayK && tallyDrop) {
      var p = Math.max(0, Math.min(1, (game.time - tallyAt) / 0.45));
      sy = y - 8 + Math.round(22 * ease(p));
    }
    drawStamp(g, cx + 4, sy, kind);
  }
}

function drawTri(g, x, y, dir, color) {
  for (var i = 0; i < 6; i++) {
    /* A left arrow keeps its base on the right; a right arrow keeps it on the left. */
    g.rect(dir < 0 ? x + 5 - i : x + i, y + i, 1, 11 - 2 * i, color);
  }
}

/* lopix12 has no 2x size: each line of the name is drawn once at 1x where the footer goes (the
   footer covers it later in the frame), read back, and doubled into the dark of the picture, top
   left, as paper with an ink-dark shadow one pixel down and right. Two short lines keep the name
   off the lamp's light. */
function drawTitleName(g, lines) {
  for (var n = 0; n < lines.length; n++) {
    var w = g.measure(lines[n]), pts = [], x, y, i, y0 = 4 + n * 26;
    g.rect(0, 128, 160, 16, g.PAPER);
    g.text(lines[n], 0, 130, { color: g.INK });
    for (y = 0; y < 12; y++) for (x = 0; x < w; x++) if (g.get(x, 130 + y) === g.INK) pts.push([x, y]);
    for (i = 0; i < pts.length; i++) g.rect(9 + pts[i][0] * 2, y0 + 1 + pts[i][1] * 2, 2, 2, g.DARK);
    for (i = 0; i < pts.length; i++) g.rect(8 + pts[i][0] * 2, y0 + pts[i][1] * 2, 2, 2, g.PAPER);
  }
}

function drawTitle(g) {
  g.sprite(BOX_TITLE_ART.picture(), 0, 0);
  drawTitleName(g, game.lang === "en" ? ["Daily", "Box"] : ["每日", "推箱"]);

  var labels = [T({ zh: "今天", en: "Today" }), T({ zh: "日历", en: "Calendar" })];
  var todayRec = saved.days[dayKey(new Date())];
  for (var i = 0; i < 2; i++) {
    var x = TITLE_ROW_X[i], y = TITLE_ROW_Y, w = TITLE_ROW_W, h = TITLE_ROW_H, sel = i === titleSel;
    g.rect(x, y, w, h, sel ? g.INK : g.PAPER);
    if (!sel) g.frame(x, y, w, h, g.DARK);
    if (i === 0) {
      var date = new Date();
      g.text(labels[i], x + 5, y + 5, { color: sel ? g.PAPER : g.INK });
      g.text((date.getMonth() + 1) + "/" + date.getDate(), x + w - (todayRec ? 16 : 5), y + 5,
        { align: "right", color: sel ? g.PAPER : g.INK });
      /* The solved check is a stamp sprite; on the selected ink row a tone map keeps it visible. */
      if (todayRec) {
        g.sprite(ART.stamp, x + w - 14, y + 6, sel ? { map: [g.PAPER, g.PAPER, g.PAPER, g.INK] } : null);
      }
    } else {
      g.text(labels[i], x + w / 2, y + 5, { align: "center", color: sel ? g.PAPER : g.INK });
    }
  }

  g.rect(0, 128, 160, 16, g.INK);
  g.text(T({ zh: "←→ 选   A 好", en: "Left/Right  A select" }), 80, 131,
    { align: "center", color: g.PAPER });
}

function calendarFooter() {
  if (!calSel || !calSelectable(calSel)) return T({ zh: "未解", en: "Unsolved" });
  var rec = saved.days[calSel];
  if (!rec) return T({ zh: "未解", en: "Unsolved" });
  /* No peek suffix: the stamp already says it, and the longest case
     "999 pushes · 100:00" measures 118 px (the band is 160 px). */
  return T({ zh: "{n} 推 · {t}", en: "{n} pushes · {t}" }, { n: rec.pushes, t: fmtTime(rec.ms) });
}

function drawCalendar(g) {
  /* A weekday header would need another 12 px and would push the 6-row grid past y=128:
     it does not fit without shrinking the cells, so it is intentionally omitted. */
  if (calCanShift(-1)) drawTri(g, 6, 3, -1, g.INK);
  if (calCanShift(1)) drawTri(g, 148, 3, 1, g.INK);
  var title = game.lang === "en" ? MONTH_EN[calM] + " " + calY : calY + " 年 " + (calM + 1) + " 月";
  g.text(title, 80, 1, { align: "center" });
  g.text(T({ zh: "连续 {k} 天 · 本月最少 {n}", en: "Streak {k} · Par {n}" },
    { k: streakCount(), n: monthParCount(calY, calM) }), 80, 14, { align: "center", color: g.DARK });

  var offset = (new Date(calY, calM, 1).getDay() + 6) % 7;   /* Monday first, like the table */
  var days = calDaysInMonth(calY, calM);
  var todayK = dayKey(new Date());
  for (var row = 0; row < 6; row++) {
    for (var col = 0; col < 7; col++) {
      var day = row * 7 + col - offset + 1;
      if (day < 1 || day > days) continue;
      var key = calKey(calY, calM, day);
      var cx = CAL_LEFT + col * CAL_COL_W, cy = CAL_TOP + row * CAL_ROW_H;
      var selected = key === calSel;
      var selectable = calSelectable(key);
      if (selected) g.rect(cx, cy, 20, 15, g.INK);
      else if (key === todayK) g.frame(cx, cy, 20, 15, g.INK);
      else g.frame(cx, cy, 20, 15, g.MID);
      var color = selected ? g.PAPER : (selectable ? g.INK : g.MID);
      g.text(String(day), cx + 2, cy + 1, { color: color });
      var rec = saved.days[key];
      if (rec) drawStamp(g, cx + 14, cy + 9, stampKind(key, rec), color);
    }
  }

  g.rect(0, 129, 160, 15, g.INK);
  g.text(calendarFooter(), 80, 130, { align: "center", color: g.PAPER });
}

function drawCard(g) {
  var rec = solvedRecord || saved.days[dayK] || { pushes: state.pushes, moves: state.moves, ms: playMs, peeked: peeked };
  var badge = cardBadge(rec);
  var w = 144, h = 126, x = 8, y = 1;
  g.window(x, y, w, h);
  var ty = y + 5;
  var title = isTodayKey(dayK) ? T({ zh: "今日完成", en: "All done" }) : dateLabel(today);
  g.text(title, x + w / 2, ty, { align: "center" });
  ty += 15;
  if (badge === "answer") {
    g.text(T({ zh: "看过答案", en: "Answer shown" }), x + w / 2, ty, { align: "center", color: g.DARK });
    ty += 13;
    g.text(T({ zh: "看了答案也算连续", en: "Keeps your streak" }), x + w / 2, ty, { align: "center" });
    ty += 13;
  } else if (badge === "perfect") {
    g.text(T({ zh: "完美", en: "Perfect" }), x + w / 2, ty, { align: "center", color: g.DARK });
    ty += 13;
  }
  g.rect(x + 8, ty - 1, w - 16, 1, g.MID);
  ty += 4;
  g.text(T({ zh: "推 {n} · {t}", en: "{n} pushes · {t}" }, { n: rec.pushes, t: fmtTime(rec.ms) }),
    x + w / 2, ty, { align: "center" });
  ty += 14;
  g.text(T({ zh: "连续 {k} 天", en: "Streak {k}" }, { k: streakCount() }), x + w / 2, ty, { align: "center" });
  drawTallyStrip(g, x + (w - 110) / 2, y + h - 38);
  /* The prompt waits for the stamp to land, so the eye follows the drop first. */
  if (!tallyDrop || game.time - tallyAt >= 0.45) {
    g.text(T({ zh: "A 日历   B 再看看", en: "A calendar  B look" }), x + w / 2, y + h - 15,
      { align: "center", color: g.DARK });
  }
}

function drawTomorrow(g) {
  var text = T({ zh: "明天再来", en: "Come back tomorrow" });
  var w = g.measure(text) + 16;
  g.window(Math.round((160 - w) / 2), 100, w, 20);
  g.text(text, 80, 103, { align: "center" });
}

function draw(g) {
  g.clear(g.PAPER);
  if (ui === "loading") return;
  if (ui === "title") { drawTitle(g); return; }
  if (ui === "calendar") { drawCalendar(g); return; }
  if (!level || !state) return;
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
  gesture: function (x0, y0, x1, y1, cancelled) {
    return gestureDirection({ x: x0, y: y0 }, { x: x1, y: y1 }, !!cancelled);
  },
  title: function () {
    return { ui: ui, selected: titleSel, today: dayKey(new Date()), solved: !!saved.days[dayKey(new Date())] };
  },
  openToday: function () { return openToday(); },
  openDay: function (key) {
    var d = keyToDate(key);
    return d ? openDay(d) : false;
  },
  calendar: function () {
    return { year: calY, month: calM, selected: calSel, today: dayKey(new Date()), earliest: epochKey(), ui: ui };
  },
  openCalendar: function (key) { openCalendar(key); },
  calMove: function (dx, dy) { return calMove(dx, dy); },
  calShiftMonth: function (delta) { return calShiftMonth(delta); },
  calSelectable: function (key) { return calSelectable(key); },
  calHit: function (x, y) { return calHitCell(x, y); },
  calArrow: function (x, y) { return calArrowAt(x, y); },
  calFooter: function () { return calendarFooter(); },
  load: function (rows) {
    if (!today) today = new Date();
    dayK = dayKey(today);
    setLevel(levelFromRows(rows));
    peeked = false;
    seenHelp = true;
    firstHint = false;
    resetBoard(true);
    ui = "play";
  }
};
window.BOX = BOX;

game.start("play");
