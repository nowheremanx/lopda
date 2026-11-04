/* The solver behind 看它解 / SELECT / the tutorial: rows first, then columns, then the last 2×2 -- the way a person
   solves it, not the shortest way. Every stage is a small breadth-first search over the cells that still matter:
   the pieces this stage is placing and the gap. Pieces already home are walls, and every other piece is
   interchangeable, which keeps the search at a few thousand states (a few milliseconds on a phone) and makes the
   plan easy to explain in one line. No DOM, no PAD: tests/solver.test.mjs plays a thousand boards with it.

   Board layout: tiles[position] = piece, pieces 0 … n*n-2 are the picture, n*n-1 is the gap. */
var Solver = (function () {
  "use strict";

  /* Each stage places one or two pieces; after it they are locked and never move again. */
  function stages(n) {
    if (n === 3) return [
      [{ p: 0, at: 0 }],                                            /* row 1: 1 */
      [{ p: 1, at: 1 }, { p: 2, at: 2 }],                           /* row 1: 2 and 3 together */
      [{ p: 3, at: 3 }, { p: 6, at: 6 }],                           /* column 1: 4 and 7 together */
      [{ p: 4, at: 4 }, { p: 5, at: 5 }, { p: 7, at: 7 }],          /* the last 2×2 */
    ];
    return [
      [{ p: 0, at: 0 }], [{ p: 1, at: 1 }], [{ p: 2, at: 2 }, { p: 3, at: 3 }],
      [{ p: 4, at: 4 }], [{ p: 5, at: 5 }], [{ p: 6, at: 6 }, { p: 7, at: 7 }],
      [{ p: 8, at: 8 }, { p: 12, at: 12 }],                         /* the last two rows, column by column */
      [{ p: 9, at: 9 }, { p: 13, at: 13 }],
      [{ p: 10, at: 10 }, { p: 11, at: 11 }, { p: 14, at: 14 }],
    ];
  }

  function neighbours(n, g) {
    var r = (g / n) | 0, c = g % n, out = [];
    if (r > 0) out.push(g - n);
    if (r < n - 1) out.push(g + n);
    if (c > 0) out.push(g - 1);
    if (c < n - 1) out.push(g + 1);
    return out;
  }

  /* One stage: BFS over (positions of the pieces being placed, gap). Returns the cells to slide, in order, or null.
     `locked` holds the pieces finished in earlier stages: they are walls, which is what makes the search small.
     Merely being at home does not lock a piece -- a wall can pinch the free cells into a path where the goal is
     out of reach, so only finished stages may block (found by the thousand-board test). */
  function find(n, tiles, targets, locked) {
    var N = n * n, gapPiece = N - 1, gap = tiles.indexOf(gapPiece);
    var start = [], want = [], i, k;
    for (i = 0; i < targets.length; i++) { start.push(tiles.indexOf(targets[i].p)); want.push(targets[i].at); }

    if (start.join() === want.join()) return [];

    var wall = {};
    for (i = 0; i < (locked || []).length; i++) wall[tiles.indexOf(locked[i])] = true;

    function done(pos) {
      for (k = 0; k < want.length; k++) if (pos[k] !== want[k]) return false;
      return true;
    }

    var key0 = start.join(",") + "|" + gap;
    var prev = new Map(); prev.set(key0, null);
    var queue = [{ pos: start, gap: gap, key: key0 }];
    for (var qi = 0; qi < queue.length; qi++) {
      var cur = queue[qi], g = cur.gap, nb = neighbours(n, g);
      for (var j = 0; j < nb.length; j++) {
        var q = nb[j];
        if (wall[q]) continue;
        var pos = cur.pos.slice(), hit = -1;
        for (k = 0; k < pos.length; k++) if (pos[k] === q) { hit = k; break; }
        if (hit >= 0) pos[hit] = g;
        var key = pos.join(",") + "|" + q;
        if (prev.has(key)) continue;
        prev.set(key, [cur.key, q]);
        if (done(pos)) {
          var out = [];
          for (var s = key; prev.get(s); s = prev.get(s)[0]) out.push(prev.get(s)[1]);
          out.reverse();
          return out;
        }
        queue.push({ pos: pos, gap: q, key: key });
      }
    }
    return null;
  }

  /* the piece at q slides into the gap */
  function step(tiles, n, q) {
    var gap = tiles.indexOf(n * n - 1);
    tiles[gap] = tiles[q];
    tiles[q] = n * n - 1;
  }

  /* the whole board, as [{p, stage}] where p is the cell to slide; null if a stage cannot be planned */
  function solve(n, tiles) {
    var work = tiles.slice(), out = [], plan = stages(n), locked = [];
    for (var s = 0; s < plan.length; s++) {
      var moves = find(n, work, plan[s], locked);
      if (!moves) return null;
      for (var i = 0; i < moves.length; i++) { out.push({ p: moves[i], stage: s }); step(work, n, moves[i]); }
      for (var j = 0; j < plan[s].length; j++) locked.push(plan[s][j].p);
    }
    return out;
  }

  /* one custom goal, for a tutorial lesson: [{p: piece, at: position}], with `keep` pieces left where they are */
  function goalPlan(n, tiles, targets, keep) {
    var moves = find(n, tiles, targets, keep);
    if (!moves) return null;
    return moves.map(function (p) { return { p: p, stage: 0 }; });
  }

  return { stages: stages, solve: solve, goalPlan: goalPlan };
})();
