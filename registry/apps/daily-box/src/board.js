/* 每日推箱 / DailyBox: the board rules, with no DOM and no lo-game so the tests and the app share one copy.
   The table in levels.js is generated; this file only decodes it, moves the postman, and answers the two
   date questions. ES5 on purpose: the app is inlined into an iframe and has no module loader.

   A level is the shape Board.decode returns: floor is a 0/1 array of the whole 10x8 board (outer wall
   included, 1 = floor), boxes and goals are cell indices, player is one cell index, par is the exact
   minimum push count and solution is an array of direction codes (0 up, 1 right, 2 down, 3 left).
   A state is what Board.create returns: {player, boxes, moves, pushes, history}; moves counts walks and
   pushes, bumps change nothing and are not counted. The state also keeps the level and its dead-square map
   (state.level, state.dead): they belong to the board and the app never saves them. */
var Board = (function () {
  "use strict";

  var W = 10, H = 8, CELLS = W * H, IW = 8, IH = 6;
  var UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;
  var DIRS = [-W, 1, W, -1];
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function bad(what) {
    throw new Error("levels.js: " + what);
  }

  function fromBase64(text) {
    var out = [], bits = 0, carry = 0, i, c, v;
    for (i = 0; i < text.length; i++) {
      c = text.charAt(i);
      if (c === "=") break;
      v = B64.indexOf(c);
      if (v < 0) bad("bad base64 character");
      carry = (carry << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((carry >> bits) & 255);
        carry &= (1 << bits) - 1;
      }
    }
    return out;
  }

  function interiorCell(index) {
    return ((index / IW) | 0) * W + (index % IW) + W + 1;
  }

  function decode(text) {
    if (typeof text !== "string" || !text.length) bad("a level is not a string");
    var bytes = fromBase64(text);
    if (bytes.length < 22) bad("a level is too short");

    var par = bytes[0];
    var floor = new Uint8Array(CELLS);
    var boxes = [], goals = [], i, y, x, bit, cell;
    for (y = 0; y < IH; y++) {
      for (x = 0; x < IW; x++) {
        i = y * IW + x;
        cell = (y + 1) * W + (x + 1);
        bit = 1 << (i & 7);
        if (bytes[1 + (i >> 3)] & bit) floor[cell] = 1;
        if (bytes[7 + (i >> 3)] & bit) boxes.push(cell);
        if (bytes[13 + (i >> 3)] & bit) goals.push(cell);
      }
    }

    var playerIndex = bytes[19];
    if (playerIndex >= IW * IH) bad("player outside the interior");
    var player = interiorCell(playerIndex);
    var moves = bytes[20] | (bytes[21] << 8);
    if (bytes.length < 22 + ((moves + 3) >> 2)) bad("solution is truncated");
    var solution = [], m;
    for (m = 0; m < moves; m++) solution.push((bytes[22 + (m >> 2)] >> ((m & 3) * 2)) & 3);

    if (!floor[player]) bad("player is not on floor");
    if (!boxes.length || boxes.length !== goals.length) bad("boxes and goals do not match");
    if (par < 1) bad("par is missing");
    for (i = 0; i < boxes.length; i++) {
      if (!floor[boxes[i]]) bad("box is not on floor");
      if (!floor[goals[i]]) bad("goal is not on floor");
    }

    return {
      w: W, h: H, floor: floor, boxes: boxes, goals: goals, player: player,
      par: par, solution: solution
    };
  }

  /* The static dead-square map: a box on one of these cells can never be pushed to any goal, no matter
     where the other boxes are. The app uses it for the crack on a box; the solver uses the same idea to
     prune. Walk pulls backwards from the goals with an empty board. */
  function deadMap(level) {
    var live = new Uint8Array(CELLS);
    var stack = [], i, d, j, player;
    for (i = 0; i < level.goals.length; i++) {
      live[level.goals[i]] = 1;
      stack.push(level.goals[i]);
    }
    while (stack.length) {
      i = stack.pop();
      for (d = 0; d < 4; d++) {
        j = i - DIRS[d];
        player = j - DIRS[d];
        if (level.floor[j] && level.floor[player] && !live[j]) {
          live[j] = 1;
          stack.push(j);
        }
      }
    }
    var dead = new Uint8Array(CELLS);
    for (i = 0; i < CELLS; i++) if (level.floor[i] && !live[i]) dead[i] = 1;
    return dead;
  }

  function deadSquares(level) {
    var dead = deadMap(level), out = [], i;
    for (i = 0; i < CELLS; i++) if (dead[i]) out.push(i);
    return out;
  }

  function create(level) {
    var state = {
      player: level.player,
      boxes: level.boxes.slice(),
      moves: 0,
      pushes: 0,
      history: []
    };
    state.level = level;
    state.dead = deadMap(level);
    return state;
  }

  function boxAt(state, cell) {
    for (var i = 0; i < state.boxes.length; i++) if (state.boxes[i] === cell) return i;
    return -1;
  }

  function onGoal(level, cell) {
    for (var i = 0; i < level.goals.length; i++) if (level.goals[i] === cell) return true;
    return false;
  }

  function snapshot(state) {
    return { player: state.player, boxes: state.boxes.slice(), moves: state.moves, pushes: state.pushes };
  }

  function deltaOf(dir) {
    if (dir === "up" || dir === 0) return -W;
    if (dir === "right" || dir === 1) return 1;
    if (dir === "down" || dir === 2) return W;
    if (dir === "left" || dir === 3) return -1;
    throw new Error("Board.step: unknown direction " + dir);
  }

  /* One key press. A bump leaves the state and the undo history alone: the player did not move, so there is
     nothing to take back. On a push, `box` is the box's new cell; on bumpBox it is the box that blocked. */
  function step(state, dir) {
    var d = deltaOf(dir);
    var to = state.player + d;
    if (!state.level.floor[to]) return { kind: "bump" };
    var index = boxAt(state, to);
    if (index < 0) {
      state.history.push(snapshot(state));
      state.player = to;
      state.moves++;
      return { kind: "walk" };
    }
    var beyond = to + d;
    if (!state.level.floor[beyond] || boxAt(state, beyond) >= 0) {
      return { kind: "bumpBox", box: to };
    }
    state.history.push(snapshot(state));
    state.boxes[index] = beyond;
    state.player = to;
    state.moves++;
    state.pushes++;
    return {
      kind: "push",
      box: beyond,
      onGoal: onGoal(state.level, beyond),
      dead: state.dead[beyond] === 1
    };
  }

  function undo(state) {
    if (!state.history.length) return false;
    var last = state.history.pop();
    state.player = last.player;
    state.boxes = last.boxes;
    state.moves = last.moves;
    state.pushes = last.pushes;
    return true;
  }

  function solved(state) {
    for (var i = 0; i < state.boxes.length; i++) {
      if (!onGoal(state.level, state.boxes[i])) return false;
    }
    return true;
  }

  /* Local calendar days, not milliseconds: on a DST change a day is 23 or 25 hours long, and dividing
     milliseconds would lose or repeat a puzzle. Date.UTC of the local y/m/d components is always exact. */
  function dayIndex(date) {
    var when = date || new Date();
    var y = when.getFullYear(), m = when.getMonth(), d = when.getDate();
    var epoch = (typeof LEVELS !== "undefined" && LEVELS.epoch) || [2026, 10, 26];
    var length = (typeof LEVELS !== "undefined" && LEVELS.levels) ? LEVELS.levels.length : 0;
    if (!length) throw new Error("levels.js is not loaded");
    var days = Math.round((Date.UTC(y, m, d) - Date.UTC(epoch[0], epoch[1] - 1, epoch[2])) / 86400000);
    if (days < 0) days = 0;      // before launch, show day 0 rather than a negative index
    return days % length;
  }

  function levelFor(date) {
    if (typeof LEVELS === "undefined" || !LEVELS.levels) throw new Error("levels.js is not loaded");
    return decode(LEVELS.levels[dayIndex(date)]);
  }

  return {
    decode: decode,
    create: create,
    step: step,
    undo: undo,
    solved: solved,
    deadSquares: deadSquares,
    dayIndex: dayIndex,
    levelFor: levelFor
  };
})();
