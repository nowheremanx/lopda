/* The optimal solver behind 提示 / 演示 and the par in the level table. Every move is one cell of one piece.
   Pieces with the same shape are interchangeable, so a state is the sorted set of cells per shape; the one
   piece the goal is about (Cao Cao, or the lesson's marked soldier) is kept apart so it cannot lose its name.
   A breadth-first search then returns the shortest move list. A state key is one character per cell (cell
   index 0..19), so a 4x5 board stays small and fast. ES5, no DOM. */
var KSolver = (function () {
  "use strict";

  function solve(level, pieces, goal, limit) {
    var w = level.w, h = level.h, i, g, d, x, y, c;
    var goalIndex = goal && goal.piece ? KRules.pieceIndex(level, goal.piece) : level.cao;
    if (goalIndex < 0) return { par: -1, moves: null, states: 0 };
    var gx = goal && goal.piece ? goal.x : level.exit.x;
    var gy = goal && goal.piece ? goal.y : level.exit.y;
    var goalW = level.pieces[goalIndex].w, goalH = level.pieces[goalIndex].h;

    /* group 0 is the goal piece; the rest are grouped by shape */
    var groups = [{ w: goalW, h: goalH, size: 1, ids: [goalIndex] }], groupOf = [];
    var byShape = {};
    groupOf[goalIndex] = 0;
    for (i = 0; i < pieces.length; i++) {
      if (i === goalIndex) continue;
      var shape = level.pieces[i].w + "x" + level.pieces[i].h;
      if (byShape[shape] === undefined) {
        byShape[shape] = groups.length;
        groups.push({ w: level.pieces[i].w, h: level.pieces[i].h, size: 0, ids: [] });
      }
      g = byShape[shape];
      groupOf[i] = g;
      groups[g].ids.push(i);
      groups[g].size++;
    }

    var byGroup = [], k;
    for (g = 0; g < groups.length; g++) byGroup.push([]);
    for (i = 0; i < pieces.length; i++) byGroup[groupOf[i]].push([pieces[i].x, pieces[i].y]);
    for (g = 0; g < byGroup.length; g++) byGroup[g].sort(cmpCell);

    function isGoal(by) {
      var cells = by[0];
      for (k = 0; k < cells.length; k++) if (cells[k][0] === gx && cells[k][1] === gy) return true;
      return false;
    }
    if (isGoal(byGroup)) return { par: 0, moves: [], states: 1 };

    var startKey = keyOf(byGroup, w);
    var seen = {}, parent = {}, queue = [startKey], qi = 0;
    seen[startKey] = 1;
    var seenCount = 1;
    var cap = limit || 500000;

    while (qi < queue.length) {
      var key = queue[qi++];
      var state = parseKey(key, groups, w);
      if (seenCount > cap) return { par: -1, moves: null, states: seenCount, tooBig: true };

      /* occupancy: piece indices in canonical order, -1 free, -2 wall */
      var occ = new Int16Array(w * h);
      for (c = 0; c < w * h; c++) occ[c] = level.walls[c] ? -2 : -1;
      var idx = 0;
      for (g = 0; g < state.length; g++) {
        var gw = groups[g].w, gh = groups[g].h;
        for (c = 0; c < state[g].length; c++) {
          x = state[g][c][0]; y = state[g][c][1];
          for (var yy = y; yy < y + gh; yy++) {
            for (var xx = x; xx < x + gw; xx++) occ[yy * w + xx] = idx;
          }
          idx++;
        }
      }

      idx = 0;
      for (g = 0; g < state.length; g++) {
        var gwg = groups[g].w, ghg = groups[g].h;
        for (c = 0; c < state[g].length; c++) {
          var self = idx++;
          x = state[g][c][0]; y = state[g][c][1];
          for (d = 0; d < 4; d++) {
            var dx = KRules.DIRS[d][0], dy = KRules.DIRS[d][1];
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx + gwg > w || ny + ghg > h) continue;
            var blocked = false;
            for (var ty = ny; ty < ny + ghg && !blocked; ty++) {
              for (var tx = nx; tx < nx + gwg; tx++) {
                var o = occ[ty * w + tx];
                if (o >= 0 && o !== self) { blocked = true; break; }
              }
            }
            if (blocked) continue;
            var cols = [], cc;
            for (cc = 0; cc < state[g].length; cc++) {
              var cell = state[g][cc];
              cols.push(cell[0] === x && cell[1] === y ? [nx, ny] : [cell[0], cell[1]]);
            }
            cols.sort(cmpCell);
            var next = state.slice();
            next[g] = cols;
            var nextKey = keyOf(next, w);
            if (seen[nextKey]) continue;
            seen[nextKey] = 1;
            seenCount++;
            parent[nextKey] = { prev: key, m: { g: g, fx: x, fy: y, dx: dx, dy: dy, w: gwg, h: ghg } };
            if (isGoal(next)) {
              var raw = [], jump = nextKey;
              while (parent[jump]) { raw.push(parent[jump].m); jump = parent[jump].prev; }
              raw.reverse();
              return { par: raw.length, moves: replay(level, pieces, goalIndex, raw), states: seenCount };
            }
            queue.push(nextKey);
          }
        }
      }
    }
    return { par: -1, moves: null, states: seenCount };
  }

  function cmpCell(a, b) {
    var ka = a[1] * 16 + a[0], kb = b[1] * 16 + b[0];
    return ka - kb;
  }

  function keyOf(byGroup, w) {
    var out = "", g, c, codes;
    for (g = 0; g < byGroup.length; g++) {
      codes = [];
      for (c = 0; c < byGroup[g].length; c++) codes.push(byGroup[g][c][1] * w + byGroup[g][c][0]);
      codes.sort(function (a, b) { return a - b; });
      for (c = 0; c < codes.length; c++) out += String.fromCharCode(codes[c]);
    }
    return out;
  }

  function parseKey(key, groups, w) {
    var out = [], at = 0, g, c;
    for (g = 0; g < groups.length; g++) {
      var cells = [];
      for (c = 0; c < groups[g].size; c++) {
        var pos = key.charCodeAt(at++);
        cells.push([pos % w, (pos / w) | 0]);
      }
      out.push(cells);
    }
    return out;
  }

  /* Turn group moves into concrete piece indices. Identical pieces may swap names; that is safe because
     the search never depended on which general was which. The goal piece is group 0 and never mistaken. */
  function replay(level, pieces, goalIndex, raw) {
    var pos = [], i, m;
    for (i = 0; i < pieces.length; i++) pos.push({ x: pieces[i].x, y: pieces[i].y });
    var out = [];
    for (m = 0; m < raw.length; m++) {
      var mv = raw[m], found = -1;
      for (i = 0; i < pieces.length; i++) {
        if (pos[i].x !== mv.fx || pos[i].y !== mv.fy) continue;
        if (level.pieces[i].w !== mv.w || level.pieces[i].h !== mv.h) continue;
        if (mv.g === 0) { if (i !== goalIndex) continue; }
        else if (i === goalIndex) continue;
        found = i;
        break;
      }
      if (found < 0) throw new Error("solver: cannot replay a move");
      pos[found].x += mv.dx; pos[found].y += mv.dy;
      out.push({ i: found, dx: mv.dx, dy: mv.dy });
    }
    return out;
  }

  return { solve: solve };
})();
