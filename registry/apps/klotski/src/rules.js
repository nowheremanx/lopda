/* 华容道 / Klotski: the board rules, with no DOM and no lo-game so the tests and the app share one copy.
   A level is text rows: a repeated letter is one rectangular piece, "." or "@" is empty, "#" is a wall.
   A move is one cell of one piece; the step count is the number of those. The exit is the 2x2 block at
   the bottom centre. ES5 on purpose: the app is inlined into an iframe and has no module loader. */
var KRules = (function () {
  "use strict";

  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  function kindOf(w, h) {
    if (w === 2 && h === 2) return "cao";
    if (w === 2 && h === 1) return "h";
    if (w === 1 && h === 2) return "v";
    if (w === 1 && h === 1) return "s";
    return "block";
  }

  function parse(rows) {
    if (!rows || !rows.length) throw new Error("a level needs rows");
    var h = rows.length, w = rows[0].length, x, y, ch, i;
    if (!w) throw new Error("a level needs a width");
    for (y = 0; y < h; y++) {
      if (rows[y].length !== w) throw new Error("every row must be the same width");
    }
    var cells = {}, order = [], walls = new Uint8Array(w * h);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        ch = rows[y].charAt(x);
        if (ch === "." || ch === "@") continue;
        if (ch === "#") { walls[y * w + x] = 1; continue; }
        if (!cells[ch]) { cells[ch] = []; order.push(ch); }
        cells[ch].push([x, y]);
      }
    }
    var pieces = [];
    for (i = 0; i < order.length; i++) {
      ch = order[i];
      var list = cells[ch], xs = [], ys = [], c;
      for (c = 0; c < list.length; c++) { xs.push(list[c][0]); ys.push(list[c][1]); }
      var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
      var x1 = Math.max.apply(null, xs), y1 = Math.max.apply(null, ys);
      var pw = x1 - x0 + 1, ph = y1 - y0 + 1;
      if (pw * ph !== list.length) throw new Error("piece " + ch + " is not a filled rectangle");
      for (y = y0; y < y0 + ph; y++) {
        for (x = x0; x < x0 + pw; x++) {
          var found = false;
          for (c = 0; c < list.length; c++) if (list[c][0] === x && list[c][1] === y) { found = true; break; }
          if (!found) throw new Error("piece " + ch + " has a hole");
        }
      }
      pieces.push({ ch: ch, x: x0, y: y0, w: pw, h: ph, kind: kindOf(pw, ph) });
    }
    pieces.sort(function (a, b) {
      var ka = a.y * w + a.x, kb = b.y * w + b.x;
      return ka - kb;
    });
    var cao = -1;
    for (i = 0; i < pieces.length; i++) if (pieces[i].kind === "cao") { cao = i; break; }
    var exit = { x: (w - 2) >> 1, y: h - 2 };
    if (exit.x < 0 || exit.y < 0 || exit.x + 2 > w || exit.y + 2 > h) throw new Error("the board is too small for a 2x2 exit");
    return { w: w, h: h, rows: rows.slice(), pieces: pieces, walls: walls, cao: cao, exit: exit };
  }

  function clonePieces(pieces) {
    var out = [], i;
    for (i = 0; i < pieces.length; i++) out.push({ x: pieces[i].x, y: pieces[i].y });
    return out;
  }

  function reset(level) { return clonePieces(level.pieces); }

  /* is the rectangle (x,y,w,h) free for piece `skip`? Walls and every other piece block it. */
  function fits(level, pieces, skip, x, y, w, h) {
    var xx, yy, i, p;
    if (x < 0 || y < 0 || x + w > level.w || y + h > level.h) return false;
    for (yy = y; yy < y + h; yy++) {
      for (xx = x; xx < x + w; xx++) {
        if (level.walls[yy * level.w + xx]) return false;
        for (i = 0; i < pieces.length; i++) {
          if (i === skip) continue;
          p = pieces[i];
          if (xx >= p.x && xx < p.x + p.w && yy >= p.y && yy < p.y + p.h) return false;
        }
      }
    }
    return true;
  }

  function canStep(level, pieces, i, dx, dy) {
    var p = pieces[i];
    return !!p && fits(level, pieces, i, p.x + dx, p.y + dy, level.pieces[i].w, level.pieces[i].h);
  }

  /* how many cells can piece i slide in (dx,dy) before something blocks it? */
  function maxSteps(level, pieces, i, dx, dy) {
    var p = pieces[i], n = 0, pw = level.pieces[i].w, ph = level.pieces[i].h;
    if (!p) return 0;
    while (n < level.w + level.h) {
      if (!fits(level, pieces, i, p.x + dx * (n + 1), p.y + dy * (n + 1), pw, ph)) break;
      n++;
    }
    return n;
  }

  /* move one cell; returns the old top-left, or null when the move is not legal */
  function step(level, pieces, i, dx, dy) {
    if (!canStep(level, pieces, i, dx, dy)) return null;
    var old = { x: pieces[i].x, y: pieces[i].y };
    pieces[i].x += dx; pieces[i].y += dy;
    return old;
  }

  function pieceAt(level, pieces, x, y) {
    var i, p;
    for (i = 0; i < pieces.length; i++) {
      p = pieces[i];
      if (x >= p.x && x < p.x + level.pieces[i].w && y >= p.y && y < p.y + level.pieces[i].h) return i;
    }
    return -1;
  }

  function pieceIndex(level, ch) {
    var i;
    for (i = 0; i < level.pieces.length; i++) if (level.pieces[i].ch === ch) return i;
    return -1;
  }

  /* goal: {exit:true} or {piece:"A", x, y}. */
  function goalMet(level, pieces, goal) {
    if (goal && goal.piece) {
      var i = pieceIndex(level, goal.piece);
      return i >= 0 && pieces[i].x === goal.x && pieces[i].y === goal.y;
    }
    if (level.cao < 0) return false;
    return pieces[level.cao].x === level.exit.x && pieces[level.cao].y === level.exit.y;
  }

  function goalText(level, goal) {
    if (goal && goal.piece) return { piece: goal.piece, x: goal.x, y: goal.y };
    return { exit: true, x: level.exit.x, y: level.exit.y };
  }

  /* accept a save only when every piece is in a real, non-overlapping place on the same board */
  function validPieces(level, list) {
    if (!list || list.length !== level.pieces.length) return false;
    var seen = {}, i, j, p, xx, yy;
    for (i = 0; i < list.length; i++) {
      p = level.pieces[i];
      var at = list[i];
      if (!at || typeof at.x !== "number" || typeof at.y !== "number") return false;
      if (at.x % 1 || at.y % 1) return false;
      if (at.x < 0 || at.y < 0 || at.x + p.w > level.w || at.y + p.h > level.h) return false;
      for (yy = at.y; yy < at.y + p.h; yy++) {
        for (xx = at.x; xx < at.x + p.w; xx++) {
          if (level.walls[yy * level.w + xx]) return false;
          if (seen[yy * level.w + xx]) return false;
          seen[yy * level.w + xx] = 1;
        }
      }
    }
    return true;
  }

  function serialize(pieces) {
    var out = [], i;
    for (i = 0; i < pieces.length; i++) out.push([pieces[i].x, pieces[i].y]);
    return out;
  }

  function deserialize(level, list) {
    var out = [], i;
    for (i = 0; i < level.pieces.length; i++) out.push({ x: list[i][0], y: list[i][1] });
    return out;
  }

  return {
    DIRS: DIRS,
    parse: parse,
    reset: reset,
    clonePieces: clonePieces,
    fits: fits,
    canStep: canStep,
    maxSteps: maxSteps,
    step: step,
    pieceAt: pieceAt,
    pieceIndex: pieceIndex,
    goalMet: goalMet,
    goalText: goalText,
    validPieces: validPieces,
    serialize: serialize,
    deserialize: deserialize
  };
})();
