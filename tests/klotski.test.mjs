// Tests for 华容道 / Klotski: the pure board rules, the optimal solver behind the pars/hints, the level and
// lesson tables, and the bundled app driven on a manual clock. The level table claims every puzzle is
// solvable and every par is exact, so this file re-solves all 38 puzzles from scratch and plays each
// solution back one cell at a time.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { join } from "node:path";
import { read, readJSON, ROOT, runScript } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const RULES_REL = "registry/apps/klotski/src/rules.js";
const SOLVER_REL = "registry/apps/klotski/src/solver.js";
const LEVELS_REL = "registry/apps/klotski/src/levels.js";
const APP_REL = "registry/apps/klotski/index.html";

const context = vm.createContext({});
vm.runInContext(read(RULES_REL), context, { filename: RULES_REL });
vm.runInContext(read(SOLVER_REL), context, { filename: SOLVER_REL });
vm.runInContext(read(LEVELS_REL), context, { filename: LEVELS_REL });
const KRules = context.KRules;
const KSolver = context.KSolver;
const DATA = context.KLOTSKI_DATA;
const PUZZLES = DATA.levels.map((d) => ({ ...d, kind: "level" })).concat(DATA.lessons.map((d) => ({ ...d, kind: "lesson" })));
const plain = (v) => JSON.parse(JSON.stringify(v));

function prepared(d) {
  const level = KRules.parse(d.rows);
  const pieces = KRules.reset(level);
  const goal = d.goal ? { ...d.goal } : { exit: true };
  return { level, pieces, goal };
}

function play(level, pieces, goal, moves) {
  const board = pieces.map((p) => ({ x: p.x, y: p.y }));
  for (const m of moves) {
    assert.ok(Math.abs(m.dx) + Math.abs(m.dy) === 1, "a step must move exactly one cell");
    const old = KRules.step(level, board, m.i, m.dx, m.dy);
    assert.ok(old, `illegal move ${JSON.stringify(m)}`);
  }
  assert.ok(KRules.goalMet(level, board, goal), "the played solution did not reach the goal");
  return board;
}

/* --- the table ------------------------------------------------------------------------------------- */

test("klotski: 30 levels from one star to five, and eight lessons, in both languages", () => {
  assert.equal(DATA.levels.length, 30);
  assert.equal(DATA.lessons.length, 8);
  const ids = new Set();
  let lastPar = -1, lastDiff = 0;
  for (const d of DATA.levels) {
    assert.ok(/^k\d\d$/.test(d.id), `bad level id ${d.id}`);
    assert.ok(!ids.has(d.id), `duplicate id ${d.id}`);
    ids.add(d.id);
    assert.ok(d.diff >= 1 && d.diff <= 5, `${d.id}: difficulty outside 1..5`);
    assert.ok(d.diff >= lastDiff, `${d.id}: the list must stay in difficulty order`);
    assert.ok(d.par >= lastPar, `${d.id}: the list must get no easier`);
    assert.ok(d.par > 0 && d.par < 300, `${d.id}: par ${d.par} is not plausible`);
    assert.equal(typeof d.name.zh, "string");
    assert.equal(typeof d.name.en, "string");
    assert.ok(d.name.zh.length <= 8 && d.name.en.length <= 14, `${d.id}: the name is too long for a row`);
    assert.ok(Array.isArray(d.rows) && d.rows.length === 5, `${d.id}: the classic board is 4x5`);
    assert.equal(d.rows[0].length, 4);
    lastPar = d.par;
    lastDiff = d.diff;
  }
  for (const d of DATA.lessons) {
    assert.ok(/^m\d\d$/.test(d.id), `bad lesson id ${d.id}`);
    assert.ok(!ids.has(d.id), `duplicate id ${d.id}`);
    ids.add(d.id);
    assert.equal(typeof d.title.zh, "string");
    assert.equal(typeof d.title.en, "string");
    assert.ok(d.title.zh.length <= 6, `${d.id}: the title is too long for the header`);
    assert.ok(Array.isArray(d.intro) && d.intro.length >= 2, `${d.id}: a lesson needs an intro`);
    for (const page of d.intro) assert.ok(page.zh && page.en, `${d.id}: an intro page is missing a language`);
    assert.ok(d.goal && (d.goal.exit || d.goal.piece), `${d.id}: a lesson needs a goal`);
  }
  assert.equal(DATA.notes.length, 10);
  assert.equal(DATA.help.length, 4);
  for (const block of DATA.notes.concat(DATA.help)) {
    assert.ok(block.title.zh && block.title.en);
    assert.ok(block.lines.length >= 2);
    for (const line of block.lines) assert.ok(line.zh && line.en);
  }
});

test("klotski: every board parses, one Cao on every exit level, a real target in every lesson", () => {
  for (const d of PUZZLES) {
    const { level } = prepared(d);
    const goal = d.goal || { exit: true };
    if (d.kind === "level") {
      assert.equal(level.w, 4, `${d.id}: the levels are 4x5`);
      assert.equal(level.h, 5, `${d.id}: the levels are 4x5`);
    } else {
      assert.ok(level.w >= 3 && level.h >= 3, `${d.id}: a lesson board is too small`);
    }
    assert.ok(KRules.validPieces(level, KRules.reset(level)), `${d.id}: the starting board overlaps or is off the board`);
    if (d.kind === "level" || goal.exit) {
      assert.ok(level.cao >= 0, `${d.id}: no 2x2 Cao`);
      assert.equal(level.pieces[level.cao].kind, "cao");
      for (let y = level.exit.y; y < level.exit.y + 2; y++) {
        for (let x = level.exit.x; x < level.exit.x + 2; x++) {
          assert.equal(level.walls[y * level.w + x], 0, `${d.id}: the exit is a wall`);
        }
      }
    }
    if (goal.piece) {
      const i = KRules.pieceIndex(level, goal.piece);
      assert.ok(i >= 0, `${d.id}: the target piece ${goal.piece} does not exist`);
      const p = level.pieces[i];
      assert.ok(goal.x >= 0 && goal.y >= 0 && goal.x + p.w <= level.w && goal.y + p.h <= level.h, `${d.id}: the target is off the board`);
      assert.ok(!KRules.goalMet(level, KRules.reset(level), goal), `${d.id}: the lesson starts already finished`);
    }
  }
});

test("klotski: pieceAt covers both cells of a bar (the bug that made taps miss)", () => {
  const level = KRules.parse(["BBCC", "DD@@", "EEFF", "NOAA", "PQAA"]);
  const pieces = KRules.reset(level);
  const i = KRules.pieceAt(level, pieces, 1, 1);
  assert.ok(i >= 0);
  assert.equal(KRules.pieceAt(level, pieces, 0, 1), i);
  assert.equal(KRules.pieceAt(level, pieces, 2, 1), -1);
  assert.equal(KRules.pieceAt(level, pieces, 2, 0), KRules.pieceAt(level, pieces, 3, 0));
  assert.equal(KRules.pieceAt(level, pieces, 1, 0), KRules.pieceAt(level, pieces, 0, 0));
});

test("klotski: a piece cannot slide onto or through another piece", () => {
  const level = KRules.parse(["AB..", "....", "....", "....", "...."]);
  const pieces = KRules.reset(level);
  assert.equal(KRules.maxSteps(level, pieces, 0, 1, 0), 0, "the soldier slid through the next soldier");
  assert.equal(KRules.step(level, pieces, 0, 1, 0), null, "the soldier stepped onto the next soldier");
  const bar = KRules.parse(["AAB.", "....", "....", "....", "...."]);
  const barPieces = KRules.reset(bar);
  assert.equal(KRules.maxSteps(bar, barPieces, 0, 1, 0), 0, "a 2x1 bar slid into a 1x1");
  assert.equal(KRules.maxSteps(bar, barPieces, 0, 0, 1), 4, "the free column below the bar was lost");
  const blocked = KRules.parse(["AA..", "B...", "....", "....", "...."]);
  const blockedPieces = KRules.reset(blocked);
  assert.equal(KRules.maxSteps(blocked, blockedPieces, 0, 0, 1), 0, "a 2x1 bar slid down onto a soldier");
});

test("klotski: canMoveAny finds the pieces a player can actually move", () => {
  const d = DATA.levels.find((x) => x.id === "k27");
  const level = KRules.parse(d.rows);
  const pieces = KRules.reset(level);
  assert.equal(KRules.canMoveAny(level, pieces, level.cao), false, "Cao should be walled in at the start");
  let moving = 0;
  for (let i = 0; i < pieces.length; i++) if (KRules.canMoveAny(level, pieces, i)) moving++;
  assert.ok(moving >= 2, "the opening has only " + moving + " movable pieces");
});

test("klotski: validPieces rejects overlaps, walls and pieces outside the board", () => {
  const level = KRules.parse(["B..C", "B..C", "....", "....", "...."]);
  const pieces = KRules.reset(level);
  assert.ok(KRules.validPieces(level, pieces));
  const overlap = pieces.map((p) => ({ x: p.x, y: p.y }));
  overlap[1] = { x: overlap[0].x, y: overlap[0].y };
  assert.equal(KRules.validPieces(level, overlap), false);
  const outside = pieces.map((p) => ({ x: p.x, y: p.y }));
  outside[0].x = -1;
  assert.equal(KRules.validPieces(level, outside), false);
  const walled = KRules.parse(["B#..", "B...", "....", "....", "...."]);
  assert.equal(KRules.validPieces(walled, [{ x: 0, y: 0 }]), true);
  assert.equal(KRules.validPieces(walled, [{ x: 1, y: 0 }]), false);
  assert.equal(KRules.validPieces(walled, [{ x: 0, y: 0 }, { x: 1, y: 0 }]), false);
});

/* --- the solver and the pars ------------------------------------------------------------------------ */

test("klotski: every level and lesson is solvable, every par is exact, and every move replays", () => {
  for (const d of PUZZLES) {
    const { level, pieces, goal } = prepared(d);
    const r = KSolver.solve(level, pieces, goal, 600000);
    assert.ok(r && r.par >= 0, `${d.id}: unsolved`);
    assert.equal(r.par, d.par, `${d.id}: stored par ${d.par}, solver says ${r.par}`);
    assert.equal(r.moves.length, r.par);
    const end = play(level, pieces, goal, r.moves);
    assert.ok(KRules.validPieces(level, end), `${d.id}: the solution overlaps pieces`);
  }
});

test("klotski: the famous opening is 116 one-cell steps and the solver replays it", () => {
  const d = DATA.levels.find((x) => x.id === "k27");
  assert.equal(d.par, 116);
  const { level, pieces, goal } = prepared(d);
  const r = KSolver.solve(level, pieces, goal);
  assert.equal(r.par, 116);
  assert.equal(r.moves.length, 116);
  const end = play(level, pieces, goal, r.moves);
  assert.equal(end[level.cao].x, level.exit.x);
  assert.equal(end[level.cao].y, level.exit.y);
});

test("klotski: a lesson's marked soldier is kept apart from the other 1x1s", () => {
  const d = DATA.lessons.find((x) => x.id === "m05");
  const { level, pieces, goal } = prepared(d);
  const target = KRules.pieceIndex(level, goal.piece);
  const r = KSolver.solve(level, pieces, goal);
  assert.ok(r.par >= 1);
  const end = play(level, pieces, goal, r.moves);
  assert.equal(end[target].x, goal.x);
  assert.equal(end[target].y, goal.y);
});

/* --- the app ---------------------------------------------------------------------------------------- */

function fakePad(initial, lang) {
  const data = JSON.parse(JSON.stringify(initial || {}));
  const listeners = {};
  const pad = {
    lang: lang || "zh",
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    off() {},
    isDown() { return false; },
    sfx() {},
    save(key, value) { data[key] = JSON.parse(JSON.stringify(value)); },
    load(key) { return Promise.resolve(key in data ? JSON.parse(JSON.stringify(data[key])) : null); },
    remove(key) { delete data[key]; }
  };
  return {
    pad, data,
    press(button) { (listeners.press || []).forEach((fn) => fn(button)); },
    release(button) { (listeners.release || []).forEach((fn) => fn(button)); }
  };
}
function run(app, frames) { for (let i = 0; i < frames; i++) app.frame(); }
async function settle() { for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve)); }
function tapButton(app, pad, button) {
  pad.press(button); run(app, 1); pad.release(button); run(app, 3);
}
async function bootApp(initial, lang, stage) {
  const pad = fakePad(initial, lang);
  const opt = { pad: pad.pad, seed: 1 };
  if (stage) opt.stage = stage;
  const app = boot(join(ROOT, APP_REL), opt);
  await settle();
  run(app, 3);
  return { app, pad };
}
/* a pointer event at stage (canvas) pixels: the fake rect starts at 0, 0 and k CSS px is one canvas pixel */
function tapStage(app, game, sx, sy) {
  const k = game.stage.k, x = sx * k, y = sy * k;
  app.pointerRaw("pointerdown", x, y);
  app.frame();
  app.pointerRaw("pointerup", x, y);
  run(app, 3);
}

test("klotski app: a level played through the solver reaches the card and writes the record", async () => {
  const { app } = await bootApp();
  const K = app.ctx.get("window").KLOTSKI;
  const d = DATA.levels.find((x) => x.id === "k01");
  const { level, pieces, goal } = prepared(d);
  const r = KSolver.solve(level, pieces, goal);
  assert.ok(K.open("k01"));
  run(app, 3);
  for (const m of r.moves) {
    assert.ok(K.step(m.i, m.dx, m.dy), `the app refused ${JSON.stringify(m)}`);
    run(app, 6);
  }
  run(app, 220);   /* the exit ride loops; it must not end by itself */
  const state = K.state();
  assert.equal(state.ui, "win");
  assert.equal(state.moves, d.par);
  assert.ok(K.skip());
  run(app, 2);
  assert.equal(K.state().ui, "card");
  const saved = app.ctx.get("saved");
  assert.equal(saved.levels.k01.best, d.par);
  assert.equal(saved.levels.k01.clean, d.par);
  assert.equal(saved.current.k01, undefined);
});

test("klotski app: leaving a level and coming back resumes the same board", async () => {
  const { app } = await bootApp();
  const K = app.ctx.get("window").KLOTSKI;
  const d = DATA.levels.find((x) => x.id === "k02");
  const { level, pieces, goal } = prepared(d);
  const r = KSolver.solve(level, pieces, goal);
  assert.ok(K.open("k02"));
  run(app, 3);
  const first = r.moves[0];
  assert.ok(K.step(first.i, first.dx, first.dy));
  run(app, 8);
  const after = K.state();
  assert.equal(after.moves, 1);
  assert.ok(K.open("k03"));
  run(app, 5);
  assert.ok(K.open("k02"));
  run(app, 5);
  const back = K.state();
  assert.equal(back.moves, 1);
  assert.deepEqual(back.pieces, after.pieces);
});

test("klotski app: a lesson's intro can be read, then the target completes the lesson", async () => {
  const { app, pad } = await bootApp();
  const K = app.ctx.get("window").KLOTSKI;
  assert.ok(K.open("m01"));
  run(app, 3);
  for (let i = 0; i < 10; i++) tapButton(app, pad, "a");
  await settle();
  run(app, 5);
  const state = K.state();
  assert.equal(state.ui, "play");
  const idx = state.pieces.findIndex((p) => p[0] === 1 && p[1] === 3);
  assert.ok(idx >= 0, "the lesson soldier is missing");
  assert.ok(K.step(idx, 1, 0)); run(app, 8);
  assert.ok(K.step(idx, 1, 0)); run(app, 50);
  const end = K.state();
  assert.equal(end.ui, "card");
  assert.equal(end.moves, 2);
  const saved = app.ctx.get("saved");
  assert.equal(saved.lessons.m01.done, 1);
  assert.equal(saved.lessons.m01.best, 2);
});

test("klotski app: SELECT starts on a movable piece and skips the blocked ones", async () => {
  const { app, pad } = await bootApp();
  const K = app.ctx.get("window").KLOTSKI;
  const d = DATA.levels.find((x) => x.id === "k27");
  const level = KRules.parse(d.rows);
  assert.ok(K.open("k27"));
  run(app, 5);
  const piecesOf = (state) => state.pieces.map((p) => ({ x: p[0], y: p[1] }));
  let state = K.state();
  assert.ok(KRules.canMoveAny(level, piecesOf(state), state.selected), "the first selection is blocked");
  const seen = new Set([state.selected]);
  for (let i = 0; i < 6; i++) {
    tapButton(app, pad, "select");
    run(app, 2);
    state = K.state();
    assert.ok(KRules.canMoveAny(level, piecesOf(state), state.selected), "SELECT landed on a blocked piece");
    seen.add(state.selected);
  }
  assert.ok(seen.size >= 2, "SELECT never changed the piece");
});

test("klotski app: the level list is open, and a key moves the selected piece", async () => {
  const { app, pad } = await bootApp();
  const K = app.ctx.get("window").KLOTSKI;
  // The title's first item is Play; the first level's first item opens k01.
  tapButton(app, pad, "a");
  run(app, 10);
  tapButton(app, pad, "a");
  run(app, 10);
  assert.equal(K.state().id, "k01");
  // SELECT walks the pieces; a soldier can move, so the step counter must change.
  let moved = false;
  for (let i = 0; i < 10 && !moved; i++) {
    tapButton(app, pad, "select");
    const before = K.state().moves;
    tapButton(app, pad, "right");
    run(app, 5);
    if (K.state().moves > before) moved = true;
  }
  assert.ok(moved, "SELECT + Right never moved a piece");
});

/* --- the page reader: 玩法 and 大师笔记 -------------------------------------------------------------- */

/* Both callers of buildPages (the start menu and the master-class list) pass KLOTSKI_DATA.help or
   .notes; drive the pages scene so the pages come from the app's own g, wrap and font. */
async function builtPages(lang) {
  const { app } = await bootApp({}, lang);
  const game = app.ctx.get("game");
  const pg = app.ctx.get("pg");
  const data = app.ctx.get("KLOTSKI_DATA");
  const sets = { notes: data.notes, help: data.help };
  const built = {};
  for (const name of Object.keys(sets)) {
    game.go("pages", { section: name, blocks: sets[name] }, { fade: false });
    run(app, 3);
    built[name] = pg.list.map((p) => ({ title: p.title, cont: p.cont, lines: p.lines.slice() }));
  }
  return { game, sets, built };
}

/* Every rule the pages promise: whole paragraphs, no lone line, nothing lost, and cont marking
   exactly the pages after a block's first. */
function checkPageSet(game, blocks, pages, where) {
  const wrapped = blocks.map((b) => b.lines.map((line) => game.g.wrap(game.t(line), 144)));
  const perBlock = blocks.map(() => []);
  let bi = -1, blockPage = 0;
  for (const page of pages) {
    if (!page.cont) { bi++; blockPage = 0; }
    blockPage++;
    assert.equal(page.cont, blockPage > 1, `${where}: cont does not mark the pages after a block's first`);
    assert.ok(bi >= 0 && bi < blocks.length, `${where}: a page starts outside its block`);
    assert.equal(page.title.zh, blocks[bi].title.zh, `${where}: a page names another block`);
    assert.equal(page.title.en, blocks[bi].title.en, `${where}: a page names another block`);
    assert.ok(page.lines.length >= 1 && page.lines.length <= 8, `${where}: a page holds ${page.lines.length} lines`);
    perBlock[bi].push(page);
  }
  blocks.forEach((_, i) => {
    const shown = perBlock[i].reduce((all, p) => all.concat(p.lines), []);
    const expected = wrapped[i].reduce((all, lines) => all.concat(lines), []);
    assert.ok(perBlock[i].length >= 1, `${where}/${i}: the block made no page`);
    assert.deepEqual(shown, expected, `${where}/${i}: the pages lost or reordered a line`);
    if (expected.length > 1) {
      for (const page of perBlock[i]) assert.notEqual(page.lines.length, 1, `${where}/${i}: a page holds one orphan line`);
    }
    /* a page break inside a paragraph's wrapped lines is only allowed past a page of 8 */
    const breaks = [];
    let at = 0;
    for (const page of perBlock[i]) { at += page.lines.length; breaks.push(at); }
    breaks.pop();
    let start = 0;
    for (const para of wrapped[i]) {
      const end = start + para.length;
      for (const b of breaks) {
        if (b > start && b < end) assert.ok(para.length > 8, `${where}/${i}: a ${para.length}-line paragraph is split across pages`);
      }
      start = end;
    }
  });
}

test("klotski: 玩法 and 大师笔记 keep paragraphs whole on every page, in both languages", async () => {
  for (const lang of ["zh", "en"]) {
    const { game, sets, built } = await builtPages(lang);
    for (const name of Object.keys(sets)) checkPageSet(game, sets[name], built[name], `${lang}/${name}`);
  }
});

test("klotski: a paragraph longer than a page is split without leaving a lone line", async () => {
  const { app } = await bootApp();
  const buildPages = app.ctx.get("buildPages");
  /* a fake g whose wrap gives a line count straight from the text, so the split rule is visible */
  const g = { wrap(text) { const n = Number(text); const lines = []; for (let i = 0; i < n; i++) lines.push(text + ":" + i); return lines; } };
  const one = (lines) => buildPages(g, [{ title: { zh: "T", en: "T" }, lines }]);
  assert.deepEqual(one(["9"]).map((p) => p.lines.length), [7, 2], "9 lines became 8 + 1");
  assert.deepEqual(one(["10"]).map((p) => p.lines.length), [8, 2]);
  assert.deepEqual(one(["16"]).map((p) => p.lines.length), [8, 8]);
  assert.deepEqual(one(["17"]).map((p) => p.lines.length), [8, 7, 2], "17 lines left a lone line at the end");
  assert.deepEqual(one(["2", "9"]).map((p) => p.lines.length), [2, 7, 2], "a long paragraph must start a page of its own");
  assert.deepEqual(one(["5", "3"]).map((p) => p.lines.length), [8], "two short paragraphs share a page");
  assert.deepEqual(one(["5", "4"]).map((p) => p.lines.length), [5, 4], "a paragraph that does not fit starts the next page");
  assert.deepEqual(one(["9"]).map((p) => p.cont), [false, true]);
});

test("klotski app: opening a level without solving it does not count it as cleared (#336)", async () => {
  const { app } = await bootApp();
  const K = app.ctx.get("window").KLOTSKI;
  for (const id of ["k01", "k05", "k11"]) { assert.ok(K.open(id)); run(app, 3); }
  const clearedCount = app.ctx.get("clearedCount"), clearedRec = app.ctx.get("clearedRec");
  assert.equal(clearedCount(), 0);
  assert.equal(clearedRec("k01"), null);
  assert.equal(app.ctx.get("saved").levels.k01.plays, 1, "the play is still counted");
});

test("klotski app: an unreadable save is left alone and the title says so (#337)", async () => {
  const pad = fakePad();
  let saves = 0;
  pad.pad.load = () => { const e = new Error("PAD.load: corrupt"); e.code = "corrupt"; return Promise.reject(e); };
  pad.pad.save = () => { saves++; };
  const app = boot(join(ROOT, APP_REL), { pad: pad.pad, seed: 1 });
  await settle();
  run(app, 3);
  assert.equal(app.ctx.get("canSave"), false);
  const game = app.ctx.get("game"), shown = [], draw = game.g.text;
  game.g.text = function (str, x, y, o) { shown.push(str); return draw.call(game.g, str, x, y, o); };
  run(app, 1);
  game.g.text = draw;
  assert.ok(shown.includes("存档读不出，这次不存"), "the title says the save cannot be read");
  const K = app.ctx.get("window").KLOTSKI;
  assert.ok(K.open("k01"));
  run(app, 3);
  assert.equal(saves, 0, "nothing is written over the unreadable save");
});

test("klotski app: the restart dialog's taps land on the rows it draws (#339)", async () => {
  const { app, pad } = await bootApp();
  const K = app.ctx.get("window").KLOTSKI;
  assert.ok(K.open("k01"));
  run(app, 5);
  /* move one piece so a restart would show */
  for (let i = 0; i < 10 && !K.state().moves; i++) { tapButton(app, pad, "select"); tapButton(app, pad, "right"); run(app, 10); }
  const moved = K.state().moves;
  assert.ok(moved > 0, "no piece moved");
  const openConfirm = app.ctx.get("openConfirm"), updateConfirm = app.ctx.get("updateConfirm");
  const y0 = app.ctx.get("CONFIRM_ROW_Y"), row = app.ctx.get("CONFIRM_ROW");
  /* the bottom pixel row of Cancel (drawn 21 px tall) keeps the board */
  openConfirm();
  updateConfirm({ dist: 0, x0: 80, y0: y0 + 20 });
  assert.equal(K.state().ui, "play");
  assert.equal(K.state().moves, moved, "a tap on Cancel restarted the run");
  /* the bottom pixel row of Restart restarts */
  openConfirm();
  updateConfirm({ dist: 0, x0: 80, y0: y0 + row + 20 });
  assert.equal(K.state().moves, 0, "a tap on Restart's lower edge did nothing");
});

test("klotski app: a key pressed while a block is still sliding is played when the slide ends (#338)", async () => {
  const { app, pad } = await bootApp();
  const K = app.ctx.get("window").KLOTSKI;
  assert.ok(K.open("k01"));
  run(app, 5);
  const table = app.ctx.get("table");
  for (let i = 0; i < 10; i++) {
    tapButton(app, pad, "select");
    const before = K.state().pieces[K.state().selected];
    pad.press("right"); run(app, 1); pad.release("right");
    if (!table.anim && !table.queue.length) { run(app, 10); continue; }   /* this piece could not move right */
    /* still sliding: the next key must not be lost */
    pad.press("left"); run(app, 1); pad.release("left");
    run(app, 30);
    assert.deepEqual(K.state().pieces[K.state().selected], before, "the second key was dropped during the slide");
    return;
  }
  assert.fail("no piece could move right");
});

test("klotski app: the level list opens on the first level not cleared yet (#342)", async () => {
  const levels = {};
  for (const id of ["k01", "k02", "k03", "k04", "k05", "k06", "k07"]) levels[id] = { best: 30, clean: 0, plays: 1, last: 30, at: 1 };
  const { app } = await bootApp({ klotski: { v: 1, levels, lessons: {}, current: {}, seenHelp: 1 } });
  const game = app.ctx.get("game");
  game.go("levels", null, { fade: false });
  run(app, 3);
  const list = app.ctx.get("levelList");
  assert.equal(list.list[list.sel].id, "k08");
  assert.ok(list.sel >= list.top && list.sel < list.top + 5, "the row is on the screen");
});

/* --- filling the phone (sdk/UI.md 13, sdk/LO-GAME.md 2.1) --------------------------------------- */

const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];
const LoGame = runScript("sdk/lo-game.js").LoGame;

test("klotski app: 1.2.0 asks lo-game for a fill screen with bands", () => {
  assert.equal(readJSON("registry/apps/klotski/manifest.json").version, "1.2.0");
  assert.match(read("registry/apps/klotski/src/game.js"), /LoGame\.create\(\{[^}]*fill: true, bands: paintBands/);
});

test("klotski fill: the canvas covers all five phone sizes with the world whole and centred", () => {
  for (const [sw, sh] of SIZES) {
    const L = LoGame.fillLayout(sw, sh, 160, 200);
    assert.ok(L.w * L.k >= sw - 1e-9, `${sw}x${sh}: narrower than the stage`);
    assert.ok(L.h * L.k >= sh - 1e-9, `${sw}x${sh}: shorter than the stage`);
    assert.ok(L.w * L.k - sw < L.k, `${sw}x${sh}: a paper line at the sides`);
    assert.ok(L.h * L.k - sh < L.k, `${sw}x${sh}: a paper line above or below`);
    assert.ok(L.x >= 0 && L.y >= 0 && L.x + 160 <= L.w && L.y + 200 <= L.h, `${sw}x${sh}: the world is cut`);
    assert.equal(L.x, Math.floor((L.w - 160) / 2), `${sw}x${sh}: the world is not centred across`);
    assert.equal(L.y, Math.floor((L.h - 200) / 2), `${sw}x${sh}: the world is not centred down`);
  }
});

test("klotski fill: fill off keeps the old contain layout, paper columns and all", () => {
  /* 331 x 359: the old 287 x 359 board with 22 px columns; fill grows wider instead (185 x 200 canvas) */
  const c = LoGame.containLayout(331, 359, 160, 200, 1);
  assert.equal(c.w, 287); assert.equal(c.h, 359); assert.equal(c.k, 1.795);
  assert.ok(c.w <= 331 && c.h <= 359, "containment never overflows the stage");
  const L = LoGame.fillLayout(331, 359, 160, 200);
  assert.ok(L.w > 160, "the fill layout grows the canvas wider than the world");
  for (const [sw, sh] of SIZES) {
    const k = LoGame.containLayout(sw, sh, 160, 200, 1);
    assert.ok(k.k <= Math.min(sw / 160, sh / 200) + 1e-9, `${sw}x${sh}: contain grew past the stage`);
    assert.ok(k.w <= Math.ceil(sw) && k.h <= Math.ceil(sh), `${sw}x${sh}: contain overflows`);
  }
});

test("klotski app: the fitted stage covers all five phone sizes", async () => {
  for (const [sw, sh] of SIZES) {
    const { app } = await bootApp({}, "zh", { w: sw, h: sh });
    const game = app.ctx.get("game"), st = game.stage;
    assert.equal(game.width, 160);
    assert.equal(game.height, 200);
    const want = LoGame.fillLayout(sw, sh, 160, 200);
    for (const key of ["w", "h", "k", "x", "y"]) assert.equal(st[key], want[key], `${sw}x${sh}: the app fitted another ${key}`);
    assert.ok(st.w * st.k >= sw - 1e-9 && st.h * st.k >= sh - 1e-9, `${sw}x${sh}: paper at an edge`);
  }
});

test("klotski app: a band tap does not choose a title row, a world tap still does", async () => {
  let { app } = await bootApp({}, "zh", { w: 346, h: 518 });
  let game = app.ctx.get("game"), st = game.stage;
  assert.ok(st.y > 0, "this stage has a top band");
  const title = app.ctx.get("titleScene");
  tapStage(app, game, 80, 3);                       /* top band, above the picture */
  run(app, 6); await settle();
  assert.equal(game.top(), title, "a top-band tap left the title");
  tapStage(app, game, st.x + 80, st.y + 135);       /* the first row of the 2x2 grid, inside the world */
  run(app, 6); await settle();
  assert.notEqual(game.top(), title, "a tap on the title row itself still works");

  /* a drag that starts in a side band is not a board gesture either */
  ({ app } = await bootApp({}, "zh", { w: 348, h: 323 }));
  game = app.ctx.get("game"); st = game.stage;
  assert.ok(st.x > 0, "this stage has a side band");
  const K = app.ctx.get("window").KLOTSKI;
  assert.ok(K.open("k01"));
  run(app, 5);
  const before = K.state().moves;
  app.pointerRaw("pointerdown", 2 * st.k, (st.y + 75) * st.k);
  app.frame();
  app.pointerRaw("pointermove", (st.x + 45) * st.k, (st.y + 75) * st.k);
  app.pointerRaw("pointerup", (st.x + 45) * st.k, (st.y + 75) * st.k);
  run(app, 10);
  assert.equal(K.state().moves, before, "a drag from the side band moved a piece");

  /* the same tap inside the world still selects the piece under the finger */
  const selected = K.state().selected;
  tapStage(app, game, st.x + 35, st.y + 67);        /* cell (0, 1), a movable horizontal bar */
  run(app, 3);
  assert.notEqual(K.state().selected, selected, "a tap on the board stopped selecting");
});

test("klotski title: the key hint sits between the grid and the progress line, in both languages", async () => {
  for (const lang of ["zh", "en"]) {
    const { app } = await bootApp({}, lang);
    const game = app.ctx.get("game"), shown = [], draw = game.g.text;
    game.g.text = function (str, x, y, o) { shown.push({ str: str, x: x, y: y }); return draw.call(game.g, str, x, y, o); };
    run(app, 1);
    game.g.text = draw;
    const hint = lang === "zh" ? "↑↓←→ 选 · A 好" : "arrows · A ok";
    const line = shown.find((v) => v.str === hint);
    assert.ok(line, `${lang}: the title has no key hint`);
    assert.ok(line.y > 170 && line.y + 13 <= 187, `${lang}: the hint is outside the footer row`);
    assert.ok(game.g.measure(hint) <= 160, `${lang}: the hint is wider than the screen`);
  }
});

test("klotski bands: the table round the board, flat lacquer on calm screens", async () => {
  const { app } = await bootApp({}, "zh", { w: 346, h: 518 });
  const game = app.ctx.get("game"), calm = app.ctx.get("bandCalm"), table = app.ctx.get("table");
  assert.equal(calm(), false, "the title is the table");
  game.go("levels", null, { fade: false }); run(app, 2);
  assert.equal(calm(), true, "the level list is calm");
  game.go("lessons", null, { fade: false }); run(app, 2);
  assert.equal(calm(), true, "the lesson list is calm");
  game.go("pages", { section: "x", blocks: [] }, { fade: false }); run(app, 2);
  assert.equal(calm(), true, "the pages are calm");
  game.go("table", { kind: "level", id: "k01" }, { fade: false }); run(app, 2);
  assert.equal(calm(), false, "the board is the table");
  for (const ui of ["menu", "confirm", "card"]) {
    table.ui = ui;
    assert.equal(calm(), true, `${ui} is calm`);
  }
});
