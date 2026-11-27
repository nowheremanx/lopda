// Tests for 每日推箱 / DailyBox: the generated level table, an independent re-solve of every level, the
// pure board rules, the owner-approved input clock, and the bundled app driven on a manual clock. The
// pure files are loaded the way an iframe would see them: plain scripts in a vm, one global each.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { read, ROOT } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const LEVELS_REL = "registry/apps/daily-box/src/levels.js";
const BOARD_REL = "registry/apps/daily-box/src/board.js";
const INPUT_REL = "registry/apps/daily-box/src/input.js";
const APP_REL = "registry/apps/daily-box/index.html";
const W = 10, H = 8, CELLS = W * H;
const DIRS = [-W, 1, W, -1];
const DAYS = 1099;

const context = vm.createContext({});
vm.runInContext(read(LEVELS_REL), context, { filename: LEVELS_REL });
vm.runInContext(read(BOARD_REL), context, { filename: BOARD_REL });
vm.runInContext(read(INPUT_REL), context, { filename: INPUT_REL });
const LEVELS = context.LEVELS;
const Board = context.Board;
const BoxInput = context.BoxInput;

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

test("daily-box board: dayIndex counts local y/m/d and wraps in both directions", () => {
  assert.equal(Board.dayIndex(new Date(2026, 9, 26)), 0, "EPOCH is day 0");
  assert.equal(Board.dayIndex(new Date(2026, 9, 27)), 1);
  assert.equal(Board.dayIndex(new Date(2026, 9, 25)), 1098, "the day before the epoch is the last table day");
  assert.equal(Board.dayIndex(new Date(2026, 9, 24)), 1097, "two days before the epoch is the day before that");
  assert.equal(Board.dayIndex(new Date(1999, 0, 1)), 830, "a far past date wraps instead of clamping");
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
  assert.equal(Board.levelFor(new Date(2026, 9, 25)).par, decoded[1098].par);
  assert.equal(Board.levelFor(new Date(2026, 9, 24)).par, decoded[1097].par);
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

/* --- Part C: the input clock, and the bundled app driven on a manual 60 Hz clock ------------------ */

test("daily-box input: the owner's timing numbers are unchanged", () => {
  assert.deepEqual(plain(BoxInput.MS), { walk: 120, brace: 50, move: 180, bump: 90, hold: 220, gap: 150, dust: 140 });
});

/* A millisecond clock, not a frame clock: this is the cadence the brief describes. */
function walkStarts() {
  const state = BoxInput.create();
  const starts = [];
  BoxInput.press(state, "right", 0);
  starts.push(0);
  BoxInput.begin(state, "walk", 0);
  for (let now = 1; now <= 1000; now++) {
    const ended = BoxInput.advance(state, 1);
    if (ended) BoxInput.finish(state, now, ended.kind, false);
    if (BoxInput.next(state, now)) {
      starts.push(now);
      BoxInput.begin(state, "walk", now);
    }
  }
  return starts;
}

test("daily-box input: a held direction moves at once, then from 220 ms every 120 ms", () => {
  assert.deepEqual(walkStarts(), [0, 220, 340, 460, 580, 700, 820, 940]);
});

test("daily-box input: a push followed by holding waits brace + move + 150 ms", () => {
  const state = BoxInput.create();
  const starts = [];
  BoxInput.press(state, "right", 0);
  starts.push(0);
  BoxInput.begin(state, "push", 0);
  for (let now = 1; now <= 1000; now++) {
    const ended = BoxInput.advance(state, 1);
    if (ended) BoxInput.finish(state, now, ended.kind, false);
    if (BoxInput.next(state, now)) {
      starts.push(now);
      BoxInput.begin(state, "push", now);
    }
  }
  assert.deepEqual(starts, [0, 380, 760], "230 ms of push plus the 150 ms gap");
});

test("daily-box input: a press during an animation is kept, and a goal, dead square or bump stops the repeat", () => {
  const queued = BoxInput.create();
  assert.equal(BoxInput.press(queued, "right", 0), "right");
  BoxInput.begin(queued, "walk", 0);
  assert.equal(BoxInput.press(queued, "left", 50), null, "the animation is still running");
  const ended = BoxInput.advance(queued, 120);
  assert.equal(ended.kind, "walk");
  BoxInput.finish(queued, 120, "walk", false);
  assert.deepEqual(plain(BoxInput.next(queued, 120)), { dir: "left", repeat: false }, "the remembered press runs at the end");
  assert.equal(BoxInput.next(queued, 121), null);

  const stopped = BoxInput.create();
  assert.equal(BoxInput.press(stopped, "right", 0), "right");
  BoxInput.begin(stopped, "push", 0);
  const push = BoxInput.advance(stopped, 230);
  assert.equal(push.kind, "push");
  BoxInput.finish(stopped, 230, "push", true);       /* the box landed on a goal or a dead square */
  assert.equal(BoxInput.next(stopped, 1000), null, "the held key must be released first");
  BoxInput.release(stopped, "right");
  assert.equal(BoxInput.next(stopped, 1100), null);
  assert.equal(BoxInput.press(stopped, "right", 1200), "right", "a fresh press moves again");
});

function fakePad(initial, fail, failKeys) {
  const data = JSON.parse(JSON.stringify(initial || {}));
  const listeners = {};
  const writes = [];
  const pad = {
    lang: "zh",
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    off() {},
    isDown() { return false; },
    sfx() {},
    save(key, value) {
      const copy = JSON.parse(JSON.stringify(value));
      data[key] = copy;
      writes.push({ key, value: copy });
    },
    load(key) {
      if (fail || (failKeys && failKeys.includes(key))) return Promise.reject(new Error("storage is unavailable"));
      return Promise.resolve(key in data ? JSON.parse(JSON.stringify(data[key])) : null);
    },
    remove(key) { delete data[key]; writes.push({ key, removed: true }); }
  };
  return {
    pad, data, writes,
    press(button) { (listeners.press || []).forEach((fn) => fn(button)); },
    release(button) { (listeners.release || []).forEach((fn) => fn(button)); }
  };
}

async function settleApp() {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
}

function run(app, frames) {
  for (let i = 0; i < frames; i++) app.frame();
}

function bootBox(initial, fail, failKeys) {
  const pad = fakePad(initial, fail, failKeys);
  const app = boot(join(ROOT, APP_REL), { pad: pad.pad, seed: 1 });
  return { app, pad };
}

/* One deliberate key press: the overlay or the play tick sees it, then it is released. */
function tapButton(app, pad, button) {
  pad.press(button);
  run(app, 2);
  pad.release(button);
  run(app, 1);
}

/* Open START > 看答案 on a fresh app (the help must already be suppressed). */
function startAnswerReplay(app, pad) {
  tapButton(app, pad, "start");
  tapButton(app, pad, "down");
  tapButton(app, pad, "down");
  tapButton(app, pad, "a");
}

function dayWith(offsets) {
  const days = {};
  const base = new Date();
  for (const offset of offsets) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - offset);
    days[localKey(d)] = { pushes: 1, moves: 1, ms: 1, peeked: false };
  }
  return days;
}

function localKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/* The title is the first screen now; tests that play open today's puzzle explicitly. */
function openTodayOn(app) {
  const BOX = app.ctx.get("BOX");
  const ok = BOX.openDay(localKey(new Date()));
  assert.equal(ok, true, "today opens from the title");
  return BOX;
}

function pastKey(offset) {
  const d = new Date();
  return localKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset));
}

function epochKey() {
  return "2026-10-26";
}

const CORRIDOR = [
  "##########",
  "@        .",
  "#        #",
  "#    $   #",
  "#        #",
  "#        #",
  "#        #",
  "##########",
];

const PUSH_LANE = [
  "##########",
  "#@$     .#",
  "#        #",
  "#        #",
  "#        #",
  "#        #",
  "#        #",
  "##########",
];

test("daily-box app: holding right walks at once, then repeats from 220 ms (app-vm)", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  BOX.load(CORRIDOR);

  pad.press("right");
  app.frame();                 /* app-vm's first refresh only primes the clock */
  app.frame();                 /* t = 0: the press moves at once */
  assert.equal(BOX.state().moves, 1);
  run(app, 13);                /* t = 216.7 ms: still no repeat */
  assert.equal(BOX.state().moves, 1);
  app.frame();                 /* t = 233.3 ms: the first repeat */
  assert.equal(BOX.state().moves, 2);
  run(app, 46);                /* t = 1000 ms */
  assert.equal(BOX.state().moves, 7, "0, 233, 367, 500, 633, 767 and 900 ms at 60 Hz");
  assert.equal(BOX.state().player, 17, "seven cells to the right of the start");
  pad.release("right");
});

test("daily-box app: a push then a held key waits brace + move + 150 ms (app-vm)", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  BOX.load(PUSH_LANE);

  pad.press("right");
  app.frame();
  app.frame();                 /* t = 0: the first push */
  assert.equal(BOX.state().pushes, 1);
  run(app, 22);                /* t = 366.7 ms: less than the 380 ms wait */
  assert.equal(BOX.state().pushes, 1);
  app.frame();                 /* t = 383.3 ms: 230 + 150 ms after the push began */
  assert.equal(BOX.state().pushes, 2);
  assert.equal(BOX.state().moves, 2);
  pad.release("right");
});

test("daily-box app: a solved day writes {v:1, days:{date:{pushes, moves, ms, peeked}}}", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  BOX.load([
    "##########",
    "#@$.     #",
    "#        #",
    "#        #",
    "#        #",
    "#        #",
    "#        #",
    "##########",
  ]);

  pad.press("right");
  app.frame();
  app.frame();                 /* one push puts the only box on the only goal */
  run(app, 20);
  pad.release("right");
  assert.ok(BOX.state().solved, "the push solved the level");

  const box = pad.data.box;
  assert.ok(box, "a solved day writes the box save");
  assert.deepEqual(Object.keys(box), ["v", "days"]);
  assert.equal(box.v, 1);
  const day = box.days[BOX.state().date];
  assert.ok(day, "the day is keyed by local YYYY-MM-DD");
  assert.deepEqual(Object.keys(day), ["pushes", "moves", "ms", "peeked"]);
  assert.equal(day.pushes, 1);
  assert.equal(day.moves, 1);
  assert.equal(typeof day.ms, "number");
  assert.ok(day.ms >= 0);
  assert.equal(day.peeked, false);
  assert.equal(pad.data["box-now"], undefined, "the unfinished board is dropped when the day is solved");
  const boxWrite = pad.writes.findIndex((w) => w.key === "box");
  const removalAfter = pad.writes.findIndex((w, i) => i > boxWrite && w.key === "box-now" && w.removed);
  assert.ok(boxWrite >= 0 && removalAfter > boxWrite, "the result is saved before box-now is removed");
});

test("daily-box app: box-now restores the board, and an old day's box-now is dropped", async () => {
  const level = Board.levelFor(new Date());
  const state = Board.create(level);
  let dir = null;
  for (const candidate of ["up", "down", "left", "right"]) {
    const probe = Board.create(level);
    const result = Board.step(probe, candidate);
    /* a walk or a push: some days' boards start with the player boxed in by crates, so only a push moves */
    if (result.kind === "walk" || result.kind === "push") {
      Board.step(state, candidate);
      dir = candidate;
      break;
    }
  }
  assert.ok(dir, "today's level has a direction to move");
  const key = localKey(new Date());
  /* box-now.history is the undo stack with the current position as its last entry */
  const history = state.history.concat([{
    player: state.player,
    boxes: state.boxes.slice(),
    moves: state.moves,
    pushes: state.pushes,
  }]);

  const restored = bootBox({ "box-help": 1, "box-now": { date: key, history, ms: 4321 } });
  await settleApp();
  const restoredBox = openTodayOn(restored.app);
  const s = restoredBox.state();
  assert.equal(s.ui, "play");
  assert.equal(s.player, state.player);
  assert.deepEqual(Array.from(s.boxes), Array.from(state.boxes));
  assert.equal(s.moves, state.moves);
  assert.equal(s.pushes, state.pushes);
  assert.equal(s.history, state.history.length);
  assert.equal(s.ms, 4321, "box-now keeps the elapsed time");

  const stale = bootBox({ "box-help": 1, "box-now": { date: "2000-01-01", history } });
  await settleApp();
  const staleBox = openTodayOn(stale.app);
  const fresh = staleBox.state();
  assert.equal(fresh.player, Board.create(level).player, "an old day starts the new day fresh");
  assert.equal(fresh.moves, 0);
  assert.ok(stale.pad.writes.some((w) => w.key === "box-now" && w.removed), "the stale board is removed");
});

/* --- reviewer round: overlays, undo, replay controls, saves and card ------------------------------ */

const BUMP_MAP = [
  "##########",
  "#@ #     #",
  "#        #",
  "#   $   .#",
  "#        #",
  "#        #",
  "#        #",
  "##########",
];

const ONE_PUSH = [
  "##########",
  "#@$.     #",
  "#        #",
  "#        #",
  "#        #",
  "#        #",
  "#        #",
  "##########",
];

const CAP_MAP = [
  "##########",
  "#   @    .",
  "#        #",
  "#   $    #",
  "#        #",
  "#        #",
  "#        #",
  "##########",
];

function solvedToday() {
  const level = Board.levelFor(new Date());
  const state = Board.create(level);
  for (const dir of level.solution) Board.step(state, dir);
  return {
    level,
    history: state.history.concat([{
      player: state.player,
      boxes: state.boxes.slice(),
      moves: state.moves,
      pushes: state.pushes,
    }]),
  };
}

test("daily-box app: releasing a direction while an overlay is open leaves nothing held (app-vm)", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  BOX.load(CORRIDOR);
  run(app, 1);
  pad.press("right");
  run(app, 2);
  assert.equal(BOX.state().moves, 1);

  pad.press("start");
  run(app, 2);
  pad.release("start");
  run(app, 2);
  assert.equal(BOX.state().ui, "menu");

  pad.release("right");          /* the release happens while the menu is open */
  run(app, 5);
  tapButton(app, pad, "a");      /* 继续 */
  assert.equal(BOX.state().ui, "play");
  const moves = BOX.state().moves;
  run(app, 60);
  assert.equal(BOX.state().moves, moves, "the postman must not walk on after the menu closes");
});

test("daily-box app: B while still holding a stopped direction does not re-push it (app-vm)", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  BOX.load(BUMP_MAP);
  run(app, 1);

  pad.press("right");
  run(app, 25);                  /* walk to x=2, then the repeat bumps the wall and stops */
  assert.equal(BOX.state().moves, 1);
  assert.equal(BOX.state().player, 12);

  tapButton(app, pad, "b");      /* undo the walk while right is still held */
  assert.equal(BOX.state().moves, 0);
  assert.equal(BOX.state().player, 11);
  run(app, 40);
  assert.equal(BOX.state().moves, 0, "the stopped repeat must stay stopped");
  pad.release("right");
});

test("daily-box app: START pauses, SELECT confirms and B stops 看答案 (app-vm)", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = openTodayOn(app);
  run(app, 1);
  startAnswerReplay(app, pad);
  assert.equal(BOX.state().peeked, true);
  run(app, 20);
  assert.ok(BOX.state().moves > 0, "the replay is running");

  tapButton(app, pad, "start");
  assert.equal(BOX.state().ui, "menu");
  const paused = BOX.state().moves;
  run(app, 30);
  assert.equal(BOX.state().moves, paused, "the menu pauses the replay");

  tapButton(app, pad, "a");      /* 继续 resumes the replay */
  assert.equal(BOX.state().ui, "play");
  run(app, 20);
  assert.ok(BOX.state().moves > paused, "the replay resumes");

  tapButton(app, pad, "select");
  assert.equal(BOX.state().ui, "confirm");
  tapButton(app, pad, "b");      /* cancel keeps the replay going */
  assert.equal(BOX.state().ui, "play");
  const afterCancel = BOX.state().moves;
  run(app, 20);
  assert.ok(BOX.state().moves > afterCancel, "the replay continues after a cancelled restart");

  tapButton(app, pad, "b");      /* stop the replay */
  assert.equal(BOX.state().ui, "play");
  assert.equal(BOX.state().peeked, true);
  const stopped = BOX.state().moves;
  run(app, 40);
  assert.equal(BOX.state().moves, stopped, "B leaves the board where it is");
});

test("daily-box app: a winning box-now restores as a solved day with its card (app-vm)", async () => {
  const solved = solvedToday();
  const { app, pad } = bootBox({
    "box-help": 1,
    "box-now": { date: localKey(new Date()), history: solved.history, ms: 4321 },
  });
  await settleApp();
  const BOX = openTodayOn(app);
  const s = BOX.state();
  assert.equal(s.solved, true);
  assert.equal(s.ui, "play", "the result card is pending");
  assert.equal(s.ms, 4321);
  assert.equal(s.statusPushes, solved.level.par);
  const day = pad.data.box && pad.data.box.days[s.date];
  assert.ok(day, "the restored winning move records the day");
  assert.equal(day.pushes, solved.level.par);
  assert.equal(day.ms, 4321);
  assert.equal(day.peeked, false);
  assert.equal(BOX.badge(), "perfect");
  assert.equal(pad.data["box-now"], undefined);
  run(app, 30);
  assert.equal(BOX.state().ui, "card");
});

test("daily-box app: a corrupt box-now is dropped and the day starts fresh (app-vm)", async () => {
  const level = Board.levelFor(new Date());
  const fresh = Board.create(level).player;
  const boxes = level.boxes.slice();
  const base = { player: fresh, boxes, moves: 0, pushes: 0 };
  const histories = [
    [{ ...base, player: null }, base],
    [{ ...base, boxes: [null, ...boxes.slice(1)] }, base],
    [{ ...base, moves: "three" }, base],
    [{ ...base, player: 999 }, base],
  ];
  for (const history of histories) {
    const { app, pad } = bootBox({
      "box-help": 1,
      "box-now": { date: localKey(new Date()), history, ms: 5 },
    });
    await settleApp();
    const BOX = openTodayOn(app);
    const s = BOX.state();
    assert.equal(s.player, fresh, "a corrupt board is not restored");
    assert.equal(s.moves, 0);
    assert.ok(pad.writes.some((w) => w.key === "box-now" && w.removed), "the corrupt box-now is removed");
  }
});

test("daily-box app: a solved day's status bar shows the recorded pushes, not par (app-vm)", async () => {
  const key = localKey(new Date());
  const days = {};
  days[key] = { pushes: 1, moves: 1, ms: 1000, peeked: false };
  const { app } = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  const s = openTodayOn(app).state();
  assert.equal(s.solved, true);
  assert.equal(s.ui, "card");
  assert.equal(s.statusPushes, 1);
  assert.ok(s.par >= 13, "par is not 1, so this really is the recorded result");
});

test("daily-box app: a second solve never overwrites the first result (app-vm)", async () => {
  const key = localKey(new Date());
  const days = {};
  days[key] = { pushes: 99, moves: 99, ms: 99999, peeked: false };
  const { app, pad } = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  BOX.load(ONE_PUSH);
  pad.press("right");
  run(app, 22);
  pad.release("right");
  assert.equal(BOX.state().solved, true);

  const day = pad.data.box.days[key];
  assert.equal(day.pushes, 99);
  assert.equal(day.moves, 99);
  assert.equal(day.ms, 99999);
  assert.equal(day.peeked, false);
});

test("daily-box app: 看答案 on a solved day keeps the numbers, marks peeked and never shows 完美", async () => {
  const key = localKey(new Date());
  const days = {};
  days[key] = { pushes: 99, moves: 99, ms: 99999, peeked: false };
  const { app, pad } = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  const BOX = openTodayOn(app);
  assert.equal(BOX.state().ui, "card");
  tapButton(app, pad, "b");      /* 再看看: the solved board, then START can still replay */
  assert.equal(BOX.state().ui, "play");
  startAnswerReplay(app, pad);
  assert.equal(BOX.state().peeked, true);

  let frames = 0;
  while (!BOX.state().solved && frames < 3000) {
    run(app, 1);
    frames++;
  }
  assert.ok(BOX.state().solved, "the answer replay finishes the day");
  const day = pad.data.box.days[key];
  assert.equal(BOX.badge(), "answer", "a peeked day never gets 完美");
  assert.equal(day.pushes, 99, "the first result's pushes stay");
  assert.equal(day.moves, 99, "the first result's moves stay");
  assert.equal(day.ms, 99999, "the first result's time stays");
  assert.equal(day.peeked, true, "the day is marked peeked");
});

test("daily-box app: 看答案 on a fresh day saves the result with peeked true (app-vm)", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = openTodayOn(app);
  run(app, 1);
  startAnswerReplay(app, pad);
  let frames = 0;
  while (!BOX.state().solved && frames < 3000) {
    run(app, 1);
    frames++;
  }
  assert.ok(BOX.state().solved, "the answer replay finishes the day");
  const day = pad.data.box.days[BOX.state().date];
  assert.ok(day);
  assert.equal(day.peeked, true);
});

test("daily-box app: the saved days are trimmed to the last 400 (app-vm)", async () => {
  const today = new Date();
  const days = {};
  const keys = [];
  for (let i = 400; i >= 1; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const k = localKey(d);
    days[k] = { pushes: 1, moves: 1, ms: 1, peeked: false };
    keys.push(k);
  }
  const oldest = keys[0];
  const { app, pad } = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  BOX.load(ONE_PUSH);
  pad.press("right");
  run(app, 22);
  pad.release("right");
  assert.equal(BOX.state().solved, true);

  const kept = pad.data.box.days;
  assert.equal(Object.keys(kept).length, 400);
  assert.ok(kept[localKey(new Date())], "today is kept");
  assert.ok(!kept[oldest], "the oldest day of the 401 is dropped");
});

async function streakFor(offsets) {
  const { app } = bootBox({ "box-help": 1, "box": { v: 1, days: dayWith(offsets) } });
  await settleApp();
  return app.ctx.get("BOX").streak();
}

test("daily-box app: streak counts today or yesterday and stops at a gap (app-vm)", async () => {
  assert.equal(await streakFor([0, 1]), 2);
  assert.equal(await streakFor([0]), 1);
  assert.equal(await streakFor([1]), 1, "a streak ending yesterday still counts");
  assert.equal(await streakFor([0, 2]), 1, "a missing yesterday breaks the streak");
});

test("daily-box app: the saved box-now keeps only 400 snapshots, undo in the session stays unlimited", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  BOX.load(CAP_MAP);
  run(app, 1);
  let dir = "right";
  for (let i = 0; i < 420; i++) {
    pad.press(dir);
    run(app, 1);
    run(app, 8);
    pad.release(dir);
    run(app, 1);
    dir = dir === "right" ? "left" : "right";
  }
  assert.equal(BOX.state().moves, 420);
  assert.equal(BOX.state().history, 420, "undo in the session is not capped");
  assert.equal(pad.data["box-now"].history.length, 400, "the save is capped");
  assert.equal(typeof pad.data["box-now"].ms, "number");
  assert.ok(pad.data["box-now"].ms > 0, "box-now keeps the elapsed time");
});

test("daily-box app: a failed save read still starts today's level fresh (app-vm)", async () => {
  const { app, pad } = bootBox({}, true);
  await settleApp();
  const BOX = openTodayOn(app);
  const level = Board.levelFor(new Date());
  const s = BOX.state();
  assert.equal(s.ui, "play");
  assert.equal(s.par, level.par);
  assert.equal(s.player, Board.create(level).player);
  assert.equal(s.moves, 0);
});

test("daily-box app: only the A label of the restart confirm takes a tap", async () => {
  const { app } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  const rect = BOX.confirmA();
  assert.equal(BOX.confirmHit(rect.x + rect.w / 2, rect.y + rect.h / 2), true);
  assert.equal(BOX.confirmHit(80, 50), false, "the middle of the dialog is inert");
});

test("daily-box app: a fast flick resolves to one swipe direction", async () => {
  const { app } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  assert.equal(BOX.swipe(20, 20, 20, 8), "up");
  assert.equal(BOX.swipe(20, 20, 32, 24), "right");
  assert.equal(BOX.swipe(20, 20, 22, 21), null, "a tap is not a swipe");
});

test("daily-box app: the first-start 玩法 names SELECT restart and START menu", async () => {
  const { app } = bootBox({});
  await settleApp();
  const text = app.ctx.get("BOX").help().join(" ");
  assert.match(text, /SELECT/);
  assert.match(text, /START/);
  assert.match(text, /重来/);
  assert.match(text, /菜单/);
});

/* --- round 3: peek persistence, same-frame taps, proto bump order, pointer cancel ----------------- */

const BUMP_LEFT = [
  "##########",
  "#  @#    #",
  "#        #",
  "#   $   .#",
  "#        #",
  "#        #",
  "#        #",
  "##########",
];

test("daily-box app: 看答案 survives leaving before the solve and a later solve records peeked (app-vm)", async () => {
  const first = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = openTodayOn(first.app);
  run(first.app, 1);

  tapButton(first.app, first.pad, "start");
  tapButton(first.app, first.pad, "down");
  tapButton(first.app, first.pad, "down");
  first.pad.press("a");
  run(first.app, 1);                  /* 看答案: startReplay, no replay move yet */
  first.pad.release("a");
  first.pad.press("b");
  run(first.app, 1);                  /* stopReplay before the first replay move */
  first.pad.release("b");
  run(first.app, 1);

  assert.equal(BOX.state().peeked, true);
  const savedNow = first.pad.data["box-now"];
  assert.ok(savedNow, "stopping the answer replay saves the board");
  assert.equal(savedNow.peeked, true, "box-now carries the peek");
  assert.equal(savedNow.date, BOX.state().date);

  /* Reload the stopped board, then solve it by hand. */
  const second = bootBox({ "box-help": 1, "box-now": savedNow });
  await settleApp();
  const BOX2 = openTodayOn(second.app);
  assert.equal(BOX2.state().peeked, true, "box-now restores the peek");
  assert.equal(BOX2.state().ui, "play");

  const level = Board.levelFor(new Date());
  const sim = Board.create(level);
  const names = ["up", "right", "down", "left"];
  const steps = level.solution.map((code) => {
    const dir = names[code];
    const result = Board.step(sim, dir);
    return { dir, push: result.kind === "push" };
  });
  for (const step of steps) {
    second.pad.press(step.dir);
    run(second.app, 1);
    run(second.app, step.push ? 16 : 10);   /* finish the move, but before the 220 ms repeat */
    second.pad.release(step.dir);
    run(second.app, 1);
  }
  let frames = 0;
  while (!BOX2.state().solved && frames < 100) {
    run(second.app, 1);
    frames++;
  }
  assert.ok(BOX2.state().solved, "the manual solve finishes");
  const day = second.pad.data.box.days[BOX2.state().date];
  assert.ok(day);
  assert.equal(day.peeked, true, "the later solve records peeked");
  assert.equal(BOX2.badge(), "answer", "the card shows 看过答案, never 完美");
});

test("daily-box app: press + release in one frame is one move, not a held key (app-vm)", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  BOX.load(CAP_MAP);
  run(app, 1);

  pad.press("right");
  pad.release("right");
  run(app, 2);
  assert.equal(BOX.state().moves, 1);
  assert.equal(BOX.state().player, 15);
  run(app, 60);
  assert.equal(BOX.state().moves, 1, "a quick tap must not auto-walk");

  BOX.load(CAP_MAP);
  pad.press("right");
  run(app, 2);
  assert.equal(BOX.state().moves, 1);
  pad.press("left");
  pad.release("left");             /* queued and released inside the walk animation */
  run(app, 2);
  run(app, 25);
  assert.equal(BOX.state().moves, 2);
  assert.equal(BOX.state().player, 14);
  run(app, 60);
  assert.equal(BOX.state().moves, 2, "a queued press runs once, then no repeat");
});

test("daily-box app: a new direction during a bump clears the stop and repeats (proto order, app-vm)", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  BOX.load(BUMP_LEFT);
  run(app, 1);

  pad.press("right");
  run(app, 2);                     /* the bump starts */
  assert.equal(BOX.state().moves, 0);
  run(app, 2);                     /* still inside the 90 ms bump */
  pad.press("left");               /* a new press clears blocked, as in the proto */
  run(app, 2);
  pad.release("right");
  run(app, 30);
  assert.ok(BOX.state().moves >= 2, "the held direction repeats after the bump");
  pad.release("left");
});

test("daily-box app: pointercancel discards a gesture (app-vm)", async () => {
  const { app } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  assert.equal(BOX.gesture(20, 20, 20, 8, false), "up");
  assert.equal(BOX.gesture(20, 20, 20, 8, true), null, "a cancelled gesture never moves");
  assert.equal(BOX.gesture(20, 20, 22, 21, false), null);
});

test("daily-box app: a failed box-now read keeps a loaded box (app-vm)", async () => {
  const key = localKey(new Date());
  const days = {};
  days[key] = { pushes: 3, moves: 4, ms: 5000, peeked: false };
  const { app } = bootBox({ "box-help": 1, "box": { v: 1, days } }, false, ["box-now"]);
  await settleApp();
  const BOX = openTodayOn(app);
  assert.equal(BOX.state().solved, true);
  assert.equal(BOX.state().ui, "card");
  assert.equal(BOX.days().days[key].pushes, 3);
});

test("daily-box app: a failed box read keeps the solve in memory but writes no box (app-vm)", async () => {
  const { app, pad } = bootBox({ "box-help": 1 }, false, ["box"]);
  await settleApp();
  const BOX = app.ctx.get("BOX");
  BOX.load(ONE_PUSH);
  pad.press("right");
  run(app, 22);
  pad.release("right");
  assert.equal(BOX.state().solved, true);
  assert.ok(BOX.days().days[BOX.state().date], "the solve stays in memory");
  assert.equal(pad.data.box, undefined, "box is not written after a failed read");
  assert.ok(!pad.writes.some((w) => w.key === "box"), "no box write this session");
});

test("daily-box app: normalizeBox drops junk day entries (app-vm)", async () => {
  const days = {
    "2020-01-01": { pushes: 1, moves: 2, ms: 3, peeked: true },
    "2020-01-02": null,
    "2020-01-03": { pushes: "x", moves: 2, ms: 3 },
    "2020-01-04": { pushes: 1, moves: 2 },
    "2020-01-05": { pushes: 1, moves: 2, ms: 3, peeked: false, junk: 1 },
  };
  const { app } = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  const kept = JSON.parse(JSON.stringify(app.ctx.get("BOX").days().days));
  assert.deepEqual(Object.keys(kept).sort(), ["2020-01-01", "2020-01-05"]);
  assert.deepEqual(kept["2020-01-01"], { pushes: 1, moves: 2, ms: 3, peeked: true });
  assert.deepEqual(kept["2020-01-05"], { pushes: 1, moves: 2, ms: 3, peeked: false });
});

/* --- the owner's ruling: a peeked day keeps its streak, and the card says so --------------------- */

const CARD_W = 144;

test("daily-box app: a peeked day's card says the streak still counts, inside the card (app-vm)", async () => {
  const key = localKey(new Date());
  const days = {};
  days[key] = { pushes: 99, moves: 99, ms: 99999, peeked: true };
  const { app } = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  const BOX = openTodayOn(app);
  assert.equal(BOX.state().ui, "card");
  assert.equal(BOX.badge(), "answer");

  const game = app.ctx.get("game");
  const calls = [];
  const text = game.g.text;
  game.g.text = function (str, x, y, o) {
    calls.push({ str: String(str), x, y, o: o || {} });
    return text.call(game.g, str, x, y, o);
  };
  run(app, 2);
  game.g.text = text;

  const line = calls.find((c) => c.str === "看了答案也算连续");
  assert.ok(line, "the peeked card draws the line that says it still counts");
  assert.equal(line.x, 80, "the line is centred in the card");
  const width = game.g.measure(line.str);
  assert.ok(width <= CARD_W - 8, `the line is ${width} px wide, the card allows ${CARD_W - 8}`);
  const ok = calls.find((c) => c.str === "A 日历   B 再看看");
  assert.ok(ok && line.y + 13 <= ok.y, "the new line leaves the A/B prompt its place");
});

async function peekedStreakFor(offsets) {
  const days = dayWith(offsets);
  for (const key of Object.keys(days)) days[key].peeked = true;
  const { app } = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  return app.ctx.get("BOX").streak();
}

test("daily-box app: a peeked day counts in the streak exactly like a solved one (app-vm)", async () => {
  for (const offsets of [[0], [0, 1], [1], [0, 2]]) {
    assert.equal(await peekedStreakFor(offsets), await streakFor(offsets), `offsets ${offsets.join(",")}`);
  }
  assert.equal(await peekedStreakFor([0, 1]), 2, "two peeked days in a row are a streak of two");
  assert.equal(await peekedStreakFor([0, 2]), 1, "a gap still breaks the streak");
});

/* --- 1.1.0: the title, back-play (late days), the calendar and the tally ------------------------- */

test("daily-box app: the title is the first screen; A opens today's puzzle (app-vm)", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  assert.equal(BOX.state().ui, "title");
  assert.equal(BOX.title().today, localKey(new Date()));

  tapButton(app, pad, "a");       /* 今天 */
  assert.equal(BOX.state().ui, "play");
  assert.equal(BOX.state().date, localKey(new Date()));
});

test("daily-box app: normalizeBox keeps late:true and never invents it (app-vm)", async () => {
  const days = {
    "2020-01-01": { pushes: 1, moves: 2, ms: 3, peeked: false, late: true },
    "2020-01-02": { pushes: 1, moves: 2, ms: 3, peeked: false, late: false },
    "2020-01-03": { pushes: 1, moves: 2, ms: 3, peeked: false },
  };
  const { app } = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  const kept = app.ctx.get("BOX").days().days;
  assert.equal(kept["2020-01-01"].late, true, "late is copied through");
  assert.ok(!("late" in kept["2020-01-02"]), "late:false is not written");
  assert.ok(!("late" in kept["2020-01-03"]), "an old entry has no late key");
});

async function lateStreakFor(days) {
  const { app } = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  return app.ctx.get("BOX").streak();
}

test("daily-box app: late entries break the streak while old entries still count (app-vm)", async () => {
  const plain = dayWith([0, 1, 2]);
  assert.equal(await lateStreakFor(plain), 3, "three old entries with no late are a streak of three");

  const yesterdayLate = dayWith([0, 1, 2]);
  yesterdayLate[localKey(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 1))].late = true;
  assert.equal(await lateStreakFor(yesterdayLate), 1, "today counts, yesterday's late entry stops it");

  const endingLate = dayWith([1, 2]);
  endingLate[localKey(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 1))].late = true;
  assert.equal(await lateStreakFor(endingLate), 0, "a late entry is not a streak day");

  const oldStreak = dayWith([1, 2]);
  assert.equal(await lateStreakFor(oldStreak), 2, "a streak ending yesterday still counts without today");
});

test("daily-box app: a past day's solve is recorded under that day with late:true (app-vm)", async () => {
  const todayK = localKey(new Date());
  const pastK = pastKey(1);
  const days = {};
  days[todayK] = { pushes: 7, moves: 9, ms: 1234, peeked: false };
  const todayBefore = JSON.parse(JSON.stringify(days[todayK]));

  const { app, pad } = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  assert.equal(BOX.openDay(pastK), true);
  assert.equal(BOX.state().date, pastK, "the past day is the puzzle now");

  BOX.load(ONE_PUSH);
  pad.press("right");
  run(app, 22);
  pad.release("right");
  assert.equal(BOX.state().solved, true);

  const kept = pad.data.box.days;
  assert.equal(kept[pastK].late, true, "a solve on a later date is late");
  assert.equal(kept[pastK].pushes, 1);
  assert.deepEqual(kept[todayK], todayBefore, "today's entry is untouched");
});

test("daily-box app: a box-now dated in the past resumes that day's puzzle (app-vm)", async () => {
  const key = pastKey(1);
  const when = new Date();
  const day = new Date(when.getFullYear(), when.getMonth(), when.getDate() - 1);
  const level = Board.levelFor(day);
  const state = Board.create(level);
  let dir = null;
  for (const candidate of ["up", "down", "left", "right"]) {
    const probe = Board.create(level);
    const result = Board.step(probe, candidate);
    if (result.kind === "walk" || result.kind === "push") {
      Board.step(state, candidate);
      dir = candidate;
      break;
    }
  }
  assert.ok(dir, "the past level has a direction to move");
  const history = state.history.concat([{
    player: state.player,
    boxes: state.boxes.slice(),
    moves: state.moves,
    pushes: state.pushes,
  }]);

  const { app } = bootBox({ "box-help": 1, "box-now": { date: key, history, ms: 4321 } });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  assert.equal(BOX.state().ui, "title", "the title is still the first screen");
  assert.equal(BOX.openDay(key), true);

  const s = BOX.state();
  assert.equal(s.date, key, "the past day's puzzle, not today's");
  assert.notEqual(s.date, localKey(new Date()));
  assert.equal(s.ui, "play");
  assert.equal(s.player, state.player);
  assert.deepEqual(Array.from(s.boxes), Array.from(state.boxes));
  assert.equal(s.moves, state.moves);
  assert.equal(s.ms, 4321);
});

test("daily-box app: the calendar never selects a future day or a day before the epoch (app-vm)", async () => {
  const { app } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  const today = new Date();

  BOX.openCalendar(localKey(today));
  for (let i = 0; i < 80; i++) BOX.calMove(1, 0);
  let cal = BOX.calendar();
  assert.equal(cal.selected, localKey(today), "right stops at today");
  assert.equal(cal.month, today.getMonth(), "and it never leaves the current month");
  for (let i = 0; i < 24; i++) BOX.calShiftMonth(1);
  cal = BOX.calendar();
  assert.equal(cal.month, today.getMonth(), "the month arrow stops at the current month");

  BOX.openCalendar(epochKey());
  for (let i = 0; i < 80; i++) BOX.calMove(-1, 0);
  cal = BOX.calendar();
  assert.equal(cal.selected, epochKey(), "left stops at the epoch");
  assert.equal(cal.year, 2026);
  assert.equal(cal.month, 9, "October 2026 is the first month");
  for (let i = 0; i < 24; i++) BOX.calShiftMonth(-1);
  cal = BOX.calendar();
  assert.equal(cal.month, 9, "the month arrow stops at the epoch month");

  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  assert.equal(BOX.calSelectable(localKey(tomorrow)), false, "tomorrow is not selectable");
  assert.equal(BOX.calSelectable("2026-10-25"), false, "the day before the epoch is not selectable");
  assert.equal(BOX.calSelectable(epochKey()), true);
});

test("daily-box app: a solve shows the tally card and A opens the calendar on that day (app-vm)", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = openTodayOn(app);
  BOX.load(ONE_PUSH);
  pad.press("right");
  run(app, 22);
  pad.release("right");
  assert.equal(BOX.state().solved, true);
  run(app, 30);
  assert.equal(BOX.state().ui, "card", "the tally card follows the solve");

  tapButton(app, pad, "a");
  assert.equal(BOX.state().ui, "calendar");
  assert.equal(BOX.calendar().selected, localKey(new Date()));
});

/* --- round 2: trim order, back-play timing, box-now isolation, calendar hit boxes and B ---------- */

function weekdayOfKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/* Mirrors the calendar layout constants in game.js (CAL_LEFT 2, col 22, CAL_TOP 28, row 17). */
function cellCenterFor(BOX, key) {
  const cal = BOX.calendar();
  const [, , day] = key.split("-").map(Number);
  const offset = (new Date(cal.year, cal.month, 1).getDay() + 6) % 7;
  const index = offset + day - 1;
  return { x: 2 + (index % 7) * 22 + 10, y: 28 + Math.floor(index / 7) * 17 + 8 };
}

test("daily-box app: the 400-day trim never deletes the day just recorded (app-vm)", async () => {
  const base = new Date();
  const days = {};
  const tomorrowKey = localKey(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1));
  for (let i = 1; i <= 400; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    days[localKey(d)] = { pushes: 1, moves: 1, ms: 1, peeked: false };
  }
  const key = pastKey(1);
  const { app, pad } = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  assert.equal(BOX.openDay(key), true);
  BOX.load(ONE_PUSH);
  pad.press("right");
  run(app, 22);
  pad.release("right");
  assert.equal(BOX.state().solved, true);

  const kept = pad.data.box.days;
  assert.ok(kept[key], "the back-played day survives the trim");
  assert.equal(kept[key].late, true);
  assert.equal(Object.keys(kept).length, 400);
  assert.ok(!kept[tomorrowKey], "the oldest day other than the new one is trimmed");
});

test("daily-box app: solving today after back-playing yesterday is not late (app-vm)", async () => {
  const { app, pad } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  assert.equal(BOX.openDay(pastKey(1)), true);
  assert.equal(BOX.openDay(localKey(new Date())), true);
  BOX.load(ONE_PUSH);
  pad.press("right");
  run(app, 22);
  pad.release("right");

  const day = pad.data.box.days[localKey(new Date())];
  assert.ok(day);
  assert.ok(!("late" in day), "today's solve happened on the day itself");
});

test("daily-box app: solving a past puzzle keeps another day's box-now (app-vm)", async () => {
  const todayK = localKey(new Date());
  const pastK = pastKey(1);
  const now = new Date();
  const pastDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const level = Board.levelFor(pastDay);
  const solvedState = Board.create(level);
  for (const dir of level.solution) Board.step(solvedState, dir);
  const history = solvedState.history.concat([{
    player: solvedState.player,
    boxes: solvedState.boxes.slice(),
    moves: solvedState.moves,
    pushes: solvedState.pushes,
  }]);

  const { app, pad } = bootBox({ "box-help": 1, "box-now": { date: pastK, history, ms: 4321 } });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  openTodayOn(app);
  BOX.load(CORRIDOR);
  run(app, 1);
  pad.press("right");
  run(app, 2);
  pad.release("right");
  run(app, 1);
  assert.equal(pad.data["box-now"].date, todayK, "today's board is now the stored one");

  assert.equal(BOX.openDay(pastK), true);
  assert.ok(pad.data["box-now"], "the other day's box-now is still there");
  assert.equal(pad.data["box-now"].date, todayK, "solving the past day did not delete today's board");
  assert.equal(pad.data.box.days[pastK].late, true);
});

test("daily-box app: calendar cells and arrow zones never accept future or pre-epoch days (app-vm)", async () => {
  const { app } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");

  BOX.openCalendar(epochKey());
  const pre = cellCenterFor(BOX, "2026-10-25");
  assert.equal(BOX.calHit(pre.x, pre.y), null, "the day before the epoch is not a cell target");
  const first = cellCenterFor(BOX, epochKey());
  assert.equal(BOX.calHit(first.x, first.y), epochKey());
  assert.equal(BOX.calArrow(10, 5), 0, "there is no month before the epoch");
  const epochIsCurrent = BOX.calendar().today.slice(0, 7) === epochKey().slice(0, 7);
  assert.equal(BOX.calArrow(150, 5), epochIsCurrent ? 0 : 1);

  BOX.openCalendar(localKey(new Date()));
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (tomorrow.getMonth() === today.getMonth()) {
    const future = cellCenterFor(BOX, localKey(tomorrow));
    assert.equal(BOX.calHit(future.x, future.y), null, "a future cell is not a target");
  }
  assert.equal(BOX.calArrow(150, 5), 0, "there is no month after the current month");
  const cur = BOX.calendar();
  assert.equal(BOX.calArrow(10, 5), cur.year === 2026 && cur.month === 9 ? 0 : -1);
  assert.equal(BOX.calArrow(10, 20), 0, "the streak line is not an arrow zone");
  assert.equal(BOX.calHit(10, 20), null, "and it is not a day cell either");
});

test("daily-box app: Up/Down on the calendar keep the same weekday column (app-vm)", async () => {
  const { app } = bootBox({ "box-help": 1 });
  await settleApp();
  const BOX = app.ctx.get("BOX");
  BOX.openCalendar(localKey(new Date()));
  const start = BOX.calendar().selected;
  const month = BOX.calendar().month;

  for (let i = 0; i < 8; i++) BOX.calMove(0, -1);
  let cal = BOX.calendar();
  assert.equal(weekdayOfKey(cal.selected), weekdayOfKey(start), "up keeps the weekday");
  assert.equal(cal.month, month, "up never jumps to another month");

  for (let i = 0; i < 16; i++) BOX.calMove(0, 1);
  cal = BOX.calendar();
  assert.equal(weekdayOfKey(cal.selected), weekdayOfKey(start), "down keeps the weekday");
  assert.equal(cal.month, month, "down never jumps to another month");
});

test("daily-box app: the calendar footer fits 160 px at its longest (app-vm)", async () => {
  const key = localKey(new Date());
  const days = {};
  days[key] = { pushes: 999, moves: 999, ms: 6000000, peeked: true };

  const zh = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  const zhBox = zh.app.ctx.get("BOX");
  zhBox.openCalendar(key);
  assert.ok(zh.app.ctx.get("game").g.measure(zhBox.calFooter()) <= 160);

  const en = fakePad({ "box-help": 1, "box": { v: 1, days } });
  en.pad.lang = "en";
  const enApp = boot(join(ROOT, APP_REL), { pad: en.pad, seed: 1 });
  await settleApp();
  const enBox = enApp.ctx.get("BOX");
  enBox.openCalendar(key);
  const text = enBox.calFooter();
  assert.ok(!text.includes("peek"), "the stamp already shows a peeked day");
  assert.ok(enApp.ctx.get("game").g.measure(text) <= 160, `${text} is too wide`);
});

test("daily-box app: B on the calendar returns to title, pause menu or card (app-vm)", async () => {
  const fromTitle = bootBox({ "box-help": 1 });
  await settleApp();
  let BOX = fromTitle.app.ctx.get("BOX");
  tapButton(fromTitle.app, fromTitle.pad, "down");
  tapButton(fromTitle.app, fromTitle.pad, "a");
  assert.equal(BOX.state().ui, "calendar");
  tapButton(fromTitle.app, fromTitle.pad, "b");
  assert.equal(BOX.state().ui, "title");

  const fromMenu = bootBox({ "box-help": 1 });
  await settleApp();
  BOX = openTodayOn(fromMenu.app);
  tapButton(fromMenu.app, fromMenu.pad, "start");
  for (let i = 0; i < 4; i++) tapButton(fromMenu.app, fromMenu.pad, "down");
  tapButton(fromMenu.app, fromMenu.pad, "a");
  assert.equal(BOX.state().ui, "calendar");
  tapButton(fromMenu.app, fromMenu.pad, "b");
  assert.equal(BOX.state().ui, "play");

  const key = localKey(new Date());
  const days = {};
  days[key] = { pushes: 99, moves: 99, ms: 99999, peeked: false };
  const fromCard = bootBox({ "box-help": 1, "box": { v: 1, days } });
  await settleApp();
  BOX = openTodayOn(fromCard.app);
  assert.equal(BOX.state().ui, "card");
  tapButton(fromCard.app, fromCard.pad, "a");
  assert.equal(BOX.state().ui, "calendar");
  tapButton(fromCard.app, fromCard.pad, "b");
  assert.equal(BOX.state().ui, "card");
});
