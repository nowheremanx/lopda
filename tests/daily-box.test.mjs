// Tests for 每日推箱 / DailyBox Parts A and B: the generated level table, an independent re-solve of every
// level, and the pure board rules. The app itself is loaded the way an iframe would see it: two plain
// scripts in a vm, one global each.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { read, ROOT } from "./helpers.mjs";

const LEVELS_REL = "registry/apps/daily-box/src/levels.js";
const BOARD_REL = "registry/apps/daily-box/src/board.js";
const W = 10, H = 8, CELLS = W * H;
const DIRS = [-W, 1, W, -1];
const DAYS = 1099;

const context = vm.createContext({});
vm.runInContext(read(LEVELS_REL), context, { filename: LEVELS_REL });
vm.runInContext(read(BOARD_REL), context, { filename: BOARD_REL });
const LEVELS = context.LEVELS;
const Board = context.Board;

const decoded = LEVELS.levels.map((text) => Board.decode(text));
const plain = (value) => JSON.parse(JSON.stringify(value));

/* --- an independent forward push-BFS ---------------------------------------------------------------
   Deliberately not Board or the generator's solver: this is the second opinion the brief asks for. It
   canonicalises the player to the smallest cell of his reachable region, prunes static dead squares, and
   counts pushes only. */

function liveMask(level) {
  const live = new Uint8Array(CELLS);
  const stack = [];
  for (const goal of level.goals) { live[goal] = 1; stack.push(goal); }
  while (stack.length) {
    const cell = stack.pop();
    for (const d of DIRS) {
      const box = cell - d;
      const player = box - d;
      if (level.floor[box] && level.floor[player] && !live[box]) {
        live[box] = 1;
        stack.push(box);
      }
    }
  }
  return live;
}

function region(level, boxMask, player) {
  const mask = new Uint8Array(CELLS);
  const stack = [player];
  mask[player] = 1;
  let min = player;
  while (stack.length) {
    const cell = stack.pop();
    for (const d of DIRS) {
      const next = cell + d;
      if (level.floor[next] && !boxMask[next] && !mask[next]) {
        mask[next] = 1;
        if (next < min) min = next;
        stack.push(next);
      }
    }
  }
  return [mask, min];
}

function solveForTest(level) {
  const live = liveMask(level);
  const goals = new Set(level.goals);
  const isSolved = (boxes) => boxes.every((box) => goals.has(box));
  const sorted = (boxes) => boxes.slice().sort((a, b) => a - b);
  const start = sorted(level.boxes);
  if (isSolved(start)) return 0;

  const startMask = new Uint8Array(CELLS);
  for (const box of start) startMask[box] = 1;
  const [, min0] = region(level, startMask, level.player);
  const seen = new Set([start.join(",") + "|" + min0]);
  let frontier = [{ boxes: start, player: level.player }];
  let depth = 0;
  while (frontier.length) {
    const next = [];
    for (const state of frontier) {
      const boxMask = new Uint8Array(CELLS);
      for (const box of state.boxes) boxMask[box] = 1;
      const [reachable] = region(level, boxMask, state.player);
      for (const box of state.boxes) {
        for (const d of DIRS) {
          const behind = box - d;
          const to = box + d;
          if (!reachable[behind] || !level.floor[to] || boxMask[to] || !live[to]) continue;
          const boxes = sorted(state.boxes.map((at) => (at === box ? to : at)));
          boxMask[box] = 0;
          boxMask[to] = 1;
          const [, min] = region(level, boxMask, box);
          boxMask[to] = 0;
          boxMask[box] = 1;
          const key = boxes.join(",") + "|" + min;
          if (seen.has(key)) continue;
          if (isSolved(boxes)) return depth + 1;
          seen.add(key);
          next.push({ boxes, player: box });
        }
      }
    }
    frontier = next;
    depth++;
  }
  return -1;
}

/* --- hand-written boards for the rules ------------------------------------------------------------ */

const MAP = [
  "##########",
  "#   #    #",
  "# $ # .  #",
  "#   #    #",
  "## ### ###",
  "#        #",
  "#@       #",
  "##########",
];

function levelFromMap(rows) {
  assert.equal(rows.length, H);
  const floor = new Uint8Array(CELLS);
  const boxes = [], goals = [];
  let player = -1;
  for (let y = 0; y < H; y++) {
    assert.equal(rows[y].length, W, `row ${y} is not 10 cells`);
    for (let x = 0; x < W; x++) {
      const cell = y * W + x;
      const ch = rows[y][x];
      if (ch !== "#") floor[cell] = 1;
      if (ch === "$" || ch === "*") boxes.push(cell);
      if (ch === "." || ch === "*" || ch === "+") goals.push(cell);
      if (ch === "@" || ch === "+") player = cell;
    }
  }
  return { w: W, h: H, floor, boxes, goals, player, par: 1, solution: [] };
}

function stateOn(level, boxes, player) {
  return Board.create({ ...level, boxes: boxes.slice(), player });
}

/* --- Part A --------------------------------------------------------------------------------------- */

test("daily-box levels: 1099 entries, every one decodes into one connected room", () => {
  assert.equal(LEVELS.levels.length, DAYS);
  assert.equal(LEVELS.levels.length % 7, 0, "the table must hold whole weeks so the weekday tiers stay aligned after the wrap");
  assert.deepEqual(Array.from(LEVELS.epoch), [2026, 10, 26]);
  assert.equal(LEVELS.w, W);
  assert.equal(LEVELS.h, H);
  for (let day = 0; day < DAYS; day++) {
    const level = decoded[day];
    const where = `day ${day}: ${LEVELS.levels[day]}`;
    assert.ok(level.par >= 1, where);
    assert.ok(level.boxes.length === 3 || level.boxes.length === 4, where);
    assert.equal(level.goals.length, level.boxes.length, where);
    assert.ok(level.solution.length > 0, where);
    assert.ok(level.solution.every((d) => d >= 0 && d < 4), where);
    assert.ok(level.floor[level.player], where);
    for (const box of level.boxes) {
      assert.ok(level.floor[box], where);
      assert.ok(!level.goals.includes(box), `${where}: a box starts on a goal`);
    }
    for (const goal of level.goals) assert.ok(level.floor[goal], where);

    /* One room: every floor cell is reachable from the player without boxes. */
    const seen = new Uint8Array(CELLS);
    const stack = [level.player];
    seen[level.player] = 1;
    let count = 1;
    let floor = 0;
    for (let i = 0; i < CELLS; i++) if (level.floor[i]) floor++;
    while (stack.length) {
      const cell = stack.pop();
      for (const d of DIRS) {
        const next = cell + d;
        if (level.floor[next] && !seen[next]) { seen[next] = 1; count++; stack.push(next); }
      }
    }
    assert.equal(count, floor, `${where}: the room is not connected`);
  }
});

test("daily-box levels: an independent forward solver finds exactly par on every level", () => {
  for (let day = 0; day < DAYS; day++) {
    const got = solveForTest(decoded[day]);
    assert.equal(got, decoded[day].par, `day ${day} (${LEVELS.levels[day]}): solver says ${got}, table says ${decoded[day].par}`);
  }
});

test("daily-box levels: every stored solution replays to solved with exactly par pushes", () => {
  for (let day = 0; day < DAYS; day++) {
    const level = decoded[day];
    const state = Board.create(level);
    let pushes = 0;
    for (const dir of level.solution) {
      const result = Board.step(state, dir);
      assert.notEqual(result.kind, "bump", `day ${day}: solution walks into a wall`);
      assert.notEqual(result.kind, "bumpBox", `day ${day}: solution pushes a box into another`);
      if (result.kind === "push") pushes++;
    }
    assert.ok(Board.solved(state), `day ${day}: replay did not solve the level`);
    assert.equal(pushes, level.par, `day ${day}: replay pushed ${pushes}, par is ${level.par}`);
    assert.equal(state.pushes, level.par, `day ${day}: the counter disagrees with par`);
    assert.equal(state.moves, level.solution.length, `day ${day}: move count disagrees with the replay`);
  }
});

test("daily-box levels: each weekday keeps its box count and par floor", () => {
  /* Indexed by Date#getDay(): 0 Sunday ... 6 Saturday. */
  const tiers = [
    { boxes: 4, min: 24, max: null }, // Sun
    { boxes: 3, min: 13, max: 16 }, // Mon
    { boxes: 3, min: 13, max: 16 }, // Tue
    { boxes: 3, min: 18, max: null }, // Wed
    { boxes: 3, min: 18, max: null }, // Thu
    { boxes: 4, min: 20, max: null }, // Fri
    { boxes: 4, min: 20, max: null }, // Sat
  ];
  for (let day = 0; day < DAYS; day++) {
    const date = new Date(2026, 9, 26 + day);
    assert.equal(Board.dayIndex(date), day, `day ${day} does not map back to itself`);
    const level = Board.levelFor(date);
    const tier = tiers[date.getDay()];
    assert.equal(level.boxes.length, tier.boxes, `day ${day} (${date.toDateString()}) has the wrong box count`);
    assert.ok(level.par >= tier.min, `day ${day} (${date.toDateString()}) par ${level.par} is below ${tier.min}`);
    if (tier.max !== null) assert.ok(level.par <= tier.max, `day ${day} par ${level.par} is above ${tier.max}`);
  }
});

test("daily-box levels: no two consecutive days (or the wrap) share a level", () => {
  for (let day = 1; day < DAYS; day++) {
    assert.notEqual(LEVELS.levels[day], LEVELS.levels[day - 1], `day ${day} repeats day ${day - 1}`);
  }
  assert.notEqual(LEVELS.levels[0], LEVELS.levels[DAYS - 1], "the table wraps onto the same level");
});

/* --- Part B --------------------------------------------------------------------------------------- */

test("daily-box board: walking, pushing, bumping a wall and bumping a box", () => {
  const level = levelFromMap(MAP);

  const walk = Board.create(level);
  assert.deepEqual(plain(Board.step(walk, "right")), { kind: "walk" });
  assert.equal(walk.player, 62);
  assert.equal(walk.moves, 1);
  assert.equal(walk.pushes, 0);

  const wall = Board.create(level);
  const wallBefore = JSON.stringify({ player: wall.player, boxes: wall.boxes, moves: wall.moves, pushes: wall.pushes });
  assert.deepEqual(plain(Board.step(wall, "left")), { kind: "bump" });
  assert.equal(JSON.stringify({ player: wall.player, boxes: wall.boxes, moves: wall.moves, pushes: wall.pushes }), wallBefore);
  assert.equal(wall.history.length, 0, "a bump must not leave an undo step");

  const push = stateOn(level, [27], 28); // box below the goal at (2,6), player to its right
  const pushed = Board.step(push, "left");
  assert.deepEqual(plain(pushed), { kind: "push", box: 26, onGoal: true, dead: false });
  assert.equal(push.pushes, 1);
  assert.equal(push.moves, 1);
  assert.ok(Board.solved(push));

  const intoWall = stateOn(level, [21], 22); // box at the left wall, player on its right
  assert.deepEqual(plain(Board.step(intoWall, "left")), { kind: "bumpBox", box: 21 });
  assert.equal(intoWall.pushes, 0);
  assert.equal(intoWall.history.length, 0);

  const intoBox = stateOn(level, [27, 26], 28); // the goal cell is occupied by the second box
  assert.deepEqual(plain(Board.step(intoBox, "left")), { kind: "bumpBox", box: 27 });
  assert.equal(intoBox.pushes, 0);

  const dead = stateOn(level, [32], 31); // (3,2) pushed right into (3,3), a dead cell
  const deadPush = Board.step(dead, "right");
  assert.equal(deadPush.kind, "push");
  assert.equal(deadPush.box, 33);
  assert.equal(deadPush.onGoal, false);
  assert.equal(deadPush.dead, true);
});

test("daily-box board: undo restores exactly and an empty history is a no-op", () => {
  const level = levelFromMap(MAP);
  const state = stateOn(level, [27], 28);
  const before = {
    player: state.player,
    boxes: Array.from(state.boxes),
    moves: state.moves,
    pushes: state.pushes,
    history: state.history.length,
  };
  assert.equal(Board.undo(state), false, "nothing to undo on a fresh board");

  Board.step(state, "left"); // push the box onto the goal
  Board.step(state, "right"); // walk away from it
  assert.equal(state.pushes, 1);
  assert.equal(state.moves, 2);
  assert.equal(state.history.length, 2);

  assert.equal(Board.undo(state), true);
  assert.equal(state.player, 27);
  assert.deepEqual(Array.from(state.boxes), [26]);
  assert.equal(state.moves, 1);
  assert.equal(state.pushes, 1);

  assert.equal(Board.undo(state), true);
  assert.equal(state.player, before.player);
  assert.deepEqual(Array.from(state.boxes), before.boxes);
  assert.equal(state.moves, before.moves);
  assert.equal(state.pushes, before.pushes);
  assert.equal(state.history.length, before.history);
  assert.equal(Board.undo(state), false);
});

test("daily-box board: deadSquares is the exact static dead set on a hand-written room", () => {
  const level = levelFromMap(MAP);
  assert.deepEqual(
    Array.from(Board.deadSquares(level)),
    [11, 12, 13, 15, 16, 17, 18, 21, 23, 25, 28, 31, 33, 35, 38, 51, 58, 61, 62, 63, 64, 65, 66, 67, 68],
  );
  assert.ok(!Board.deadSquares(level).includes(26), "a goal is always live");
});

test("daily-box board: dayIndex counts local y/m/d, clamps before the epoch and wraps after 1099", () => {
  assert.equal(Board.dayIndex(new Date(2026, 9, 26)), 0, "EPOCH is day 0");
  assert.equal(Board.dayIndex(new Date(2026, 9, 27)), 1);
  assert.equal(Board.dayIndex(new Date(2026, 9, 25)), 0, "the day before launch shows day 0");
  assert.equal(Board.dayIndex(new Date(1999, 0, 1)), 0, "a far past date also clamps");
  assert.equal(Board.dayIndex(new Date(2029, 9, 28)), 1098, "the last table day");
  assert.equal(Board.dayIndex(new Date(2029, 9, 29)), 0, "day 1099 wraps to 0");
  assert.equal(new Date(2029, 9, 29).getDay(), new Date(2026, 9, 26).getDay(), "the wrap lands on the same weekday");
  assert.equal(Board.dayIndex(new Date(2030, 0, 1)), 64, "64 days after the wrap");

  /* Local constructors around both 2027 DST changes: the index must step by one, not by 23/25 hours. */
  for (const [y, m, d] of [[2027, 2, 13], [2027, 2, 14], [2027, 10, 6], [2027, 10, 7]]) {
    const a = Board.dayIndex(new Date(y, m, d));
    const b = Board.dayIndex(new Date(y, m, d + 1));
    assert.equal(b - a, 1, `${y}-${m + 1}-${d} did not advance one day`);
  }

  assert.equal(Board.levelFor(new Date(2026, 9, 26)).par, decoded[0].par);
  assert.equal(Board.levelFor(new Date(2029, 9, 29)).par, decoded[0].par);
  assert.equal(Board.levelFor(new Date(2029, 9, 28)).par, decoded[1098].par);
});

test("daily-box board: dayIndex is stable through a New York DST change (child process, TZ set)", () => {
  const script = `
    const vm = require("node:vm"), fs = require("node:fs");
    const ctx = vm.createContext({});
    vm.runInContext(fs.readFileSync(${JSON.stringify(join(ROOT, LEVELS_REL))}, "utf8"), ctx);
    vm.runInContext(fs.readFileSync(${JSON.stringify(join(ROOT, BOARD_REL))}, "utf8"), ctx);
    const Board = ctx.Board;
    const index = (y, m, d) => Board.dayIndex(new Date(y, m - 1, d));
    const spring = [index(2027, 3, 13), index(2027, 3, 14), index(2027, 3, 15)];
    const fall = [index(2027, 11, 6), index(2027, 11, 7), index(2027, 11, 8)];
    if (spring[1] - spring[0] !== 1 || spring[2] - spring[1] !== 1) throw new Error("spring " + spring);
    if (fall[1] - fall[0] !== 1 || fall[2] - fall[1] !== 1) throw new Error("fall " + fall);
    process.stdout.write("ok");
  `;
  const out = execFileSync(process.execPath, ["-e", script], {
    env: { ...process.env, TZ: "America/New_York" },
    encoding: "utf8",
  });
  assert.equal(out, "ok");
});
