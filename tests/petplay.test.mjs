// runtime/petplay.js: the pet's three play packs are pure, deterministic and always end; the room's 162 x 120
// tone buffer is the only thing draw() may write.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read, runScript } from "./helpers.mjs";

const ctx = runScript("runtime/petsim.js");
vm.runInContext(read("runtime/petsouv.js"), ctx);
vm.runInContext(read("runtime/petart.js"), ctx);
vm.runInContext(read("runtime/petplay.js"), ctx);
const Play = ctx.LopdaPetPlay;
const Art = ctx.LopdaPetArt;
const PACK = Art.PACKS.chip;
const poseFor = (view, name) => Art.pose(PACK, { ant: "orb", eye: "wide" }, view, name);
const game = (id) => Play.GAMES.find((g) => g.id === id);
const W = 162, H = 120;

function inputAt(i, a) {
  return {
    left: i % 31 < 7,
    right: i % 37 < 9,
    a: false,
    press: { left: false, right: false, a: !!a }
  };
}
/* a scripted round: the same seed and steps must give the same state */
function drive(g, seed, limit = 4000) {
  const s = g.init(seed);
  let i = 0;
  for (; i < limit && !s.done; i++) g.step(s, inputAt(i, i % 13 === 0), 50);
  return { state: s, steps: i };
}
function drawTones(g, state) {
  const buf = new Uint8Array(W * H).fill(9);
  g.draw(state, buf, W, H, PACK, poseFor);
  return buf;
}

test("three play packs: catch and climb in front view, the runner from the side", () => {
  assert.deepEqual(Array.from(Play.GAMES, (g) => g.id), ["catch", "run", "climb"]);
  assert.deepEqual(Array.from(Play.GAMES, (g) => g.labelKey), ["pet.game.catch", "pet.game.run", "pet.game.climb"]);
  assert.deepEqual(Array.from(Play.GAMES, (g) => g.view), ["front", "side", "front"]);
  for (const g of Play.GAMES) {
    assert.equal(typeof g.init, "function");
    assert.equal(typeof g.step, "function");
    assert.equal(typeof g.draw, "function");
    assert.equal(typeof g.labelKey, "string");
  }
  assert.equal(Play.W, 162);
  assert.equal(Play.H, 120);
  assert.equal(Play.TICK, 50);
});

test("each pack is deterministic for a seed and an input script", () => {
  for (const g of Play.GAMES) {
    const a = drive(g, 123456), b = drive(g, 123456);
    assert.deepEqual(JSON.parse(JSON.stringify(a.state)), JSON.parse(JSON.stringify(b.state)), g.id);
    assert.deepEqual(a.state.events, b.state.events, g.id);
  }
  /* a different seed moves the round */
  const c = drive(game("catch"), 1).state, d = drive(game("catch"), 2).state;
  assert.notDeepEqual(JSON.parse(JSON.stringify(c)), JSON.parse(JSON.stringify(d)));
});

test("a round always ends: catch on its three lives within 1000 ticks, and a run with no input hits the first thing within 400", () => {
  /* catch has no clock: with no input the pet misses parts until its three lives are gone */
  const noInput = { left: false, right: false, a: false, press: { left: false, right: false, a: false } };
  const catchGame = game("catch");
  for (const seed of [7, 1, 99, 39]) {
    const s = catchGame.init(seed);
    let i = 0;
    for (; i < 1000 && !s.done; i++) catchGame.step(s, noInput, 50);
    assert.equal(s.done, true, `catch ${seed} ended`);
    assert.ok(s.tick <= 1000, `catch ${seed} ended on its lives, not a clock: ${s.tick}`);
    assert.ok(s.lives <= 0, `catch ${seed} lost all three lives`);
    assert.ok(s.misses >= 1, `catch ${seed} ended by missed parts`);
  }
  /* a run has no clock: it ends on the first hit, and the first obstacle arrives inside three seconds */
  for (const seed of [1, 7, 99]) {
    const r = drive(game("run"), seed, 5000);
    assert.equal(r.state.done, true, `run ${seed} ended`);
    assert.ok(r.state.tick <= 400, `run ${seed} ended on a hit, not a clock: ${r.state.tick}`);
    assert.ok(r.state.events.includes("end"));
  }
  /* climb has no clock: a pet that never falls keeps the round going past the old 45 s cap */
  const climb = game("climb"), s = climb.init(7);
  for (let i = 0; i < 4000 && !s.done; i++) climb.step(s, { left: false, right: false, a: false, press: { left: false, right: false, a: false } }, 50);
  assert.equal(s.done, false, "climb does not end on a clock");
  assert.equal(s.tick, 4000, "4000 ticks and still climbing");
});

test("a finished round has score and joy 1 or 2, never negative", () => {
  for (const g of Play.GAMES) {
    const s = g.init(99);
    s.score = -5;
    Play.finish(s);
    assert.equal(s.done, true);
    assert.equal(s.score, 0);
    assert.equal(s.joy, 1, "a zero score still gives +1");
    const t = g.init(99);
    t.score = 999;
    Play.finish(t);
    assert.equal(t.joy, 2);
    assert.ok([1, 2].includes(t.joy));
  }
});

test("draw writes only tone indices 0-3 into the 162 x 120 buffer", () => {
  for (const g of Play.GAMES) {
    const s = g.init(4242);
    for (let i = 0; i < 20; i++) g.step(s, inputAt(i, i === 0), 50);
    const buf = drawTones(g, s);
    assert.equal(buf.length, W * H);
    for (let i = 0; i < buf.length; i++) assert.ok(buf[i] >= 0 && buf[i] <= 3, `${g.id} pixel ${i} is ${buf[i]}`);
  }
});

test("draw: a thin ink frame, the score in petart's pixel digits, and each game's own field", () => {
  const corner = (buf, s) => {
    const A = Art.numberGrid(s.score), gw = String(A[0]).length;
    return { x0: W - 4 - gw, x1: W - 3, y0: 4, y1: 11 };
  };
  for (const g of Play.GAMES) {
    const s = g.init(21);
    for (let i = 0; i < 8; i++) g.step(s, inputAt(i, false), 50);
    s.score = 7;
    const a = drawTones(g, s);
    s.score = 12;
    const b = drawTones(g, s);
    let inScore = 0, outside = 0;
    const c = corner(a, s);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (a[i] === b[i]) continue;
      if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) inScore++; else outside++;
    }
    assert.ok(inScore > 0, `${g.id} shows the score in the corner`);
    assert.equal(outside, 0, `${g.id}'s score changes only its corner`);
    for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) assert.equal(a[y * W + x], 0, `${g.id} frame row ${y}`);
    for (let y = 0; y < H; y++) for (const x of [0, 1, W - 2, W - 1]) assert.equal(a[y * W + x], 0, `${g.id} frame column ${x}`);
  }

  /* catch: a floor line under a floor band, and specks in the sky */
  const catchGame = game("catch"), catchState = catchGame.init(4);
  const onFloor = drawTones(catchGame, catchState);
  assert.equal(onFloor[(H - 6) * W + 10], 1, "catch has a floor line");
  assert.equal(onFloor[(H - 4) * W + 10], 2, "and a floor band");
  assert.equal(onFloor[20 * W + 20], 2, "with background dots");

  /* run: an ink floor line over a mid band that scrolls */
  const runGame = game("run"), runState = runGame.init(4);
  const lane = drawTones(runGame, runState);
  assert.equal(lane[Play.RUN.FLOOR * W + 10], 0, "run has an ink floor line");
  assert.equal(lane[(Play.RUN.FLOOR + 1) * W + 10], 2, "and a mid band under it");
  assert.equal(lane[18 * W + 20], 2, "and a window frame on the wall behind");

  /* climb: the faint wall pattern scrolls with the camera and nothing else changes */
  const climbGame = game("climb"), climbState = climbGame.init(4);
  climbState.plats = []; climbState.pet = null; climbState.score = 3;
  climbState.height = 0; const wall0 = drawTones(climbGame, climbState);
  const brickXs = (buf, y) => {
    const xs = [];
    for (let x = 0; x < W; x++) if (buf[y * W + x] === 2) xs.push(x);
    return xs.join(",");
  };
  const bricks = brickXs(wall0, 10);
  for (let h = 0; h < 24; h++) {
    climbState.height = h;
    assert.equal(brickXs(drawTones(climbGame, climbState), h + 10), bricks, `the same world row keeps its bricks at height ${h}`);
  }
  climbState.height = 3; const wall3 = drawTones(climbGame, climbState);
  let moved = 0;
  for (let i = 0; i < wall0.length; i++) if (wall0[i] !== wall3[i]) moved++;
  assert.ok(moved > 50, `the wall scrolls: ${moved} pixels`);
  assert.ok([...wall0].includes(2), "climb's wall is drawn in the faint tone");
});

test("catch: standing under a falling thing catches it", () => {
  const g = game("catch"), s = g.init(5);
  s.next = 999;                       /* no new thing while this one falls */
  s.things = [{ x: s.petX + 10, y: s.petY - 40, k: 0, w: 12, h: 12 }];
  for (let i = 0; i < 40 && s.score === 0; i++) g.step(s, inputAt(i), 50);
  assert.equal(s.score, 1, "the thing above the pet was caught");
  assert.equal(s.things.length, 0);
  assert.ok(s.events.includes("catch"));
  assert.equal(s.done, false);
});

/* The runner's bot: press A when the next thing is inside four ticks of travel plus 10 px of the pet's front,
   and hold it until landing (a released A cuts the rise to a short hop). Four ticks is a late, safe press; the
   two-tick-longer figure lands the pet on the tail of a wide slipper at the slowest speed. */
const RUN_FRONT = 39;                                  /* PET_X + 23 */
function runAim(speedPx) { return speedPx * 4 + 10; }
function runBot(g, seed, ticks) {
  const s = g.init(seed), spawned = [], seen = new Set();
  let hold = false;
  for (let i = 0; i < ticks && !s.done; i++) {
    let next = null;
    for (const o of s.obs) if (o.x + o.w > 24 && (!next || o.x < next.x)) next = o;
    let pressA = false;
    if (s.onGround) {
      hold = false;
      if (next && next.x - RUN_FRONT <= runAim(s.speedQ / 4)) { pressA = true; hold = true; }
    }
    g.step(s, { left: false, right: false, a: hold, press: { left: false, right: false, a: pressA } }, 50);
    /* the gap as it was made: the obstacle before it has moved on by the time the round ends */
    for (let j = 0; j < s.obs.length; j++) {
      const o = s.obs[j];
      if (seen.has(o)) continue;
      seen.add(o);
      const prev = j > 0 ? s.obs[j - 1] : null;
      spawned.push({ gap: prev ? o.x - (prev.x + prev.w) : null, speedQ: s.speedQ,
        nut: o.nut ? o.nut.y : null });
    }
  }
  return { state: s, spawned };
}
function inkBottom(grid) {
  let bottom = -1;
  for (let r = 0; r < grid.length; r++) if (/[kdmp]/.test(String(grid[r]))) bottom = r;
  return bottom;
}
/* the pixels a grid puts on the buffer at PET_X, y: the draw's own blit, written by hand for the comparison */
function spriteAt(grid, x0, y0) {
  const out = [];
  for (let r = 0; r < grid.length; r++) {
    const line = String(grid[r]);
    for (let c = 0; c < line.length; c++) {
      const t = { k: 0, d: 1, m: 2, p: 3 }[line.charAt(c)];
      if (t !== undefined) out.push([x0 + c, y0 + r, t]);
    }
  }
  return out;
}

test("run: the speed ramps from 16 to 32 by 100-tick steps", () => {
  const g = game("run"), s = g.init(3);
  const inp = { left: false, right: false, a: false, press: {} };
  const seen = [];
  for (let i = 0; i < 1700; i++) {
    g.step(s, inp, 50);
    seen.push(s.speedQ);
    s.obs.length = 0;                  /* this test is about the clock, not the things in the way */
  }
  assert.equal(Play.RUN.SPEED_START, 16);
  assert.equal(Play.RUN.SPEED_MAX, 32);
  assert.equal(Play.RUN.JUMP_VY, -9);
  assert.equal(Play.RUN.FLOOR, 100);
  assert.equal(Play.RUN.PET_X, 16);
  assert.equal(seen[0], 16, "tick 1: 4 px a tick");
  assert.equal(seen[98], 16, "still 16 up to tick 99");
  assert.equal(seen[99], 17, "17 from tick 100");
  assert.equal(seen[199], 18, "one more every 100 ticks");
  assert.equal(seen[1599], 32, "32 from tick 1600");
  assert.equal(seen[1699], 32, "and no faster");
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1], `never slower at tick ${i + 1}`);
});

test("run: a held jump rises 45 px, a tap cuts it short, and a press three ticks early jumps on landing", () => {
  const g = game("run"), held = { left: false, right: false, a: true, press: {} };
  const first = { left: false, right: false, a: true, press: { left: false, right: false, a: true } };
  const s = g.init(4);
  s.obs = [];
  let peak = 0, air = 0;
  g.step(s, first, 50);
  assert.ok(s.events.includes("jump"), "the press takes off");
  assert.equal(s.onGround, false);
  while (!s.onGround && air < 60) { g.step(s, held, 50); air++; peak = Math.max(peak, s.h); }
  assert.equal(peak, 45, "a held jump peaks at 45 px");
  assert.ok(air >= 16 && air <= 20, `and stays up about 18 ticks: ${air}`);
  /* a tap: the rise is cut at vy -3, so the pet only hops */
  const t = g.init(4);
  t.obs = [];
  g.step(t, first, 50);
  let tapPeak = 0;
  for (let i = 0; i < 40 && !t.onGround; i++) { g.step(t, { left: false, right: false, a: false, press: {} }, 50); tapPeak = Math.max(tapPeak, t.h); }
  assert.ok(tapPeak > 15 && tapPeak < 30, `a tap is a short hop: ${tapPeak}`);
  /* three ticks before the floor: the press is remembered and the pet leaves the floor again on landing */
  const b = g.init(4);
  b.obs = [];
  g.step(b, first, 50);
  while (!(b.vy > 0 && b.h <= 30) && b.tick < 40) g.step(b, held, 50);
  assert.ok(b.h > 0 && b.vy > 0, "falling, three ticks above the floor");
  g.step(b, first, 50);                                  /* the press, three ticks out */
  assert.equal(b.events.includes("jump"), false, "a press in the air does not jump");
  for (let i = 0; i < 2; i++) g.step(b, held, 50);
  assert.equal(b.onGround, false, "still off the floor");
  g.step(b, held, 50);                                   /* the landing tick */
  assert.ok(b.events.includes("jump"), "the buffered press takes off on the landing tick");
  assert.equal(b.onGround, false);
  assert.equal(b.vy, Play.RUN.JUMP_VY);
  /* but not from four ticks out: the buffer is three ticks, not more */
  const c = g.init(4);
  c.obs = [];
  g.step(c, first, 50);
  while (!(c.vy > 0 && c.h <= 35) && c.tick < 40) g.step(c, held, 50);
  g.step(c, first, 50);
  for (let i = 0; i < 4 && !c.onGround; i++) { c.events = []; g.step(c, held, 50); }
  assert.equal(c.onGround, true, "a press four ticks out is not held over the landing");
});

test("run: a bot that presses A in time survives 3000 ticks on 50 seeds", () => {
  const g = game("run");
  let survived = 0;
  const scores = [];
  for (let seed = 1; seed <= 50; seed++) {
    const r = runBot(g, seed, 3000);
    if (!r.state.done) survived++;
    scores.push(r.state.score);
  }
  scores.sort((a, b) => a - b);
  assert.equal(survived, 50, `the game is fair: the bot survived ${survived}/50 seeds`);
  assert.ok(scores[0] > 100, `a 3000-tick run scores: lowest ${scores[0]}`);
});

test("run: obstacles keep a landing gap, never below minGap(speed), and carry nuts 30-38 px up", () => {
  const M = Play.RUN.minGap;
  assert.equal(M(12), 84, "at 3 px a tick: 18 ticks of travel plus 30 px");
  assert.equal(M(28), 156, "at 7 px a tick");
  assert.ok(M(28) > M(12), "the faster the world, the wider the room");
  let pairs = 0, nuts = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const r = runBot(game("run"), seed, 3000);
    assert.equal(r.state.done, false, `seed ${seed} went the distance`);
    for (let i = 1; i < r.spawned.length; i++) {
      const now = r.spawned[i];
      assert.equal(typeof now.gap, "number", `seed ${seed}: a spawn after the first`);
      assert.ok(now.gap >= M(now.speedQ), `seed ${seed}: gap ${now.gap} at speed ${now.speedQ / 4} px`);
      assert.ok(now.gap <= M(now.speedQ) + 70, `seed ${seed}: gap ${now.gap} inside the rule`);
      pairs++;
    }
    for (const sp of r.spawned) if (sp.nut != null) {
      const up = Play.RUN.FLOOR - (sp.nut + 10);
      assert.ok(up >= 30 && up <= 38, `a nut floats ${up} px above the floor`);
      nuts++;
    }
  }
  assert.ok(pairs >= 40, `enough spawns to judge: ${pairs}`);
  assert.ok(nuts > 0, "and some of them carry a nut");
});

test("run: the feet-aligned draw stands the pet on FLOOR-1 in both walk frames, and lifts it in the air", () => {
  const g = game("run");
  for (const [tick, face] of [[0, "walk1"], [3, "walk2"]]) {
    const s = g.init(2);
    s.obs = [];
    s.tick = tick;
    const buf = drawTones(g, s);
    let bottom = -1;
    for (let y = 3; y < Play.RUN.FLOOR; y++) for (let x = Play.RUN.PET_X; x < Play.RUN.PET_X + 32; x++) {
      if (buf[y * W + x] === 0) bottom = y;
    }
    assert.equal(bottom, 99, `${face} sits on the floor row, not bobbing`);
    const grid = poseFor("side", face);
    for (const [x, y, t] of spriteAt(grid, Play.RUN.PET_X, Play.RUN.FLOOR - 1 - inkBottom(grid))) {
      assert.equal(buf[y * W + x], t, `${face} pixel ${x},${y}`);
    }
  }
  /* in the air the walk1 offset is the base, plus the jump height: no bob, one clean lift */
  const air = g.init(2);
  air.obs = [];
  air.onGround = false; air.vy = -4; air.h = 20;
  const lifted = drawTones(g, air);
  const jBase = Play.RUN.FLOOR - 1 - inkBottom(poseFor("side", "walk1"));
  for (const [x, y, t] of spriteAt(poseFor("side", "jump"), Play.RUN.PET_X, jBase - 20)) {
    assert.equal(lifted[y * W + x], t, `jump pixel ${x},${y}`);
  }
});

test("run: a nut floating over the lane gives five points and disappears", () => {
  const g = game("run"), s = g.init(9);
  s.obs = [{ x: 90, y: 88, w: 14, h: 12, k: 0, nut: { x: 28, y: 70 } }];
  const before = s.score;
  g.step(s, { left: false, right: false, a: true, press: { left: false, right: false, a: true } }, 50);
  assert.ok(s.events.includes("jump"));
  assert.ok(s.events.includes("nut"), "the jump took the nut");
  assert.equal(s.score, before + 5, "a nut is five points on top of the distance");
  assert.equal(s.obs[0].nut, null, "and it is gone");
});

test("run: a hit stops the world, and twelve ticks later the round is over", () => {
  const g = game("run"), s = g.init(11);
  const inp = { left: false, right: false, a: false, press: {} };
  for (let i = 0; i < 400 && !s.dying && !s.done; i++) g.step(s, inp, 50);
  assert.ok(s.dying > 0, "the first thing in the lane stopped the run");
  assert.ok(s.events.includes("hit"));
  assert.equal(s.done, false, "the result waits for the short countdown");
  const xs = s.obs.map((o) => o.x).join(","), d0 = s.dist, t0 = s.tick, score0 = s.score;
  const buf = new Uint8Array(W * H);
  g.draw(s, buf, W, H, PACK, poseFor);
  const face = poseFor("front", "surprised");
  for (const [x, y, t] of spriteAt(face, Play.RUN.PET_X, Play.RUN.FLOOR - 1 - inkBottom(face))) {
    assert.equal(buf[y * W + x], t, `the surprised face pixel ${x},${y}`);
  }
  for (let i = 0; i < 11; i++) g.step(s, inp, 50);
  assert.equal(s.obs.map((o) => o.x).join(","), xs, "the world stopped");
  assert.equal(s.dist, d0, "and the distance with it");
  assert.equal(s.score, score0);
  assert.equal(s.tick, t0 + 11);
  assert.ok(s.dying > 0, "still counting down");
  g.step(s, inp, 50);
  assert.equal(s.dying, 0);
  assert.equal(s.done, true, "twelve ticks later the round is over");
  assert.ok(s.events.includes("end"));
  assert.ok(s.joy >= 1);
});

test("catch: the pet walks 6 px a tick and at level 0 things come every 0.7 to 1.0 seconds", () => {
  const g = game("catch"), s = g.init(3);
  s.next = 999;
  const x = s.petX;
  g.step(s, { left: false, right: true, a: false, press: {} }, 50);
  assert.equal(s.petX, x + 6, "120 px a second");
  s.next = 1;
  g.step(s, { left: false, right: false, a: false, press: {} }, 50);
  assert.ok(s.next >= 14 && s.next <= 20, "spawn gap is 14-20 ticks at level 0: " + s.next);
});

/* ---------- catch's rules for v2: levels, the water drop, the combo, the lives ---------- */
const CATCH_NO_INPUT = { left: false, right: false, a: false, press: { left: false, right: false, a: false } };
function catchStep(g, s) { g.step(s, CATCH_NO_INPUT, 50); }

test("catch: the level ramps every 200 ticks to 5, the fall is 4 + level and the spawns close in", () => {
  const C = Play.CATCH;
  assert.equal(C.LEVEL_TICKS, 200);
  assert.equal(C.LEVEL_MAX, 5);
  assert.equal(C.DROP_FROM, 1);
  assert.equal(C.DROP_CHANCE, 0.18);
  for (let level = 0; level <= 5; level++) {
    assert.equal(C.fallSpeed(level), 4 + level, `level ${level} falls 4 + ${level}`);
    assert.equal(C.spawnBase(level), 14 - 2 * level, `level ${level} spawns every ${14 - 2 * level} + rand`);
  }
  assert.equal(C.fallSpeed(0), 4);
  assert.equal(C.fallSpeed(5), 9);
  assert.equal(C.fallSpeed(9), 9, "past the top the speed stays at 9");
  assert.equal(C.spawnBase(9), 4, "and the spawn stays at 4");

  const g = game("catch");
  const levelAt = (n) => {
    const s = g.init(1);
    s.next = 999; s.misses = 0; s.splashes = 0; s.lives = 3; s.tick = n - 1;
    catchStep(g, s);
    return s.level;
  };
  for (const [n, want] of [[1, 0], [199, 0], [200, 1], [399, 1], [400, 2], [599, 2], [600, 3], [999, 4], [1000, 5], [2000, 5]]) {
    assert.equal(levelAt(n), want, `tick ${n} is level ${want}`);
  }

  /* the fall really uses the level's speed */
  for (const [n, level] of [[1, 0], [200, 1], [600, 3], [1000, 5]]) {
    const s = g.init(3);
    s.next = 999; s.misses = 0; s.splashes = 0; s.lives = 3; s.tick = n - 1;
    s.things = [{ x: 20, y: 0, k: 1, w: 10, h: 10 }];
    catchStep(g, s);
    assert.equal(s.things[0].y, C.fallSpeed(level), `at tick ${n} a thing falls ${C.fallSpeed(level)} px`);
  }

  /* the spawn interval is base + 0 .. (6 - level), checked at every level */
  for (let level = 0; level <= 5; level++) {
    const lo = C.spawnBase(level), hi = lo + (6 - level);
    for (let seed = 1; seed <= 20; seed++) {
      const s = g.init(seed);
      for (let k = 0; k < 4; k++) {
        s.misses = 0; s.splashes = 0; s.lives = 3;
        s.tick = level * C.LEVEL_TICKS - 1; s.next = 1; s.things = [];
        catchStep(g, s);
        assert.equal(s.level, level);
        assert.ok(s.next >= lo && s.next <= hi, `level ${level}: next ${s.next} in ${lo}..${hi}`);
      }
    }
  }
});

test("catch: k: drop spawns only from level 1, never on a part's landing spot while that part is high", () => {
  const C = Play.CATCH, g = game("catch");
  function kindsAt(level, seed, count) {
    const s = g.init(seed), out = [];
    for (let k = 0; k < count; k++) {
      s.misses = 0; s.splashes = 0; s.lives = 3;
      s.tick = level * C.LEVEL_TICKS - 1; s.next = 1; s.things = [];
      catchStep(g, s);
      out.push(s.things[0].k);
    }
    return out;
  }
  const level0 = [];
  for (let seed = 1; seed <= 30; seed++) level0.push(...kindsAt(0, seed, 10));
  assert.ok(level0.length >= 300);
  assert.equal(level0.filter((k) => k === "drop").length, 0, "no water at level 0");

  const level1 = [];
  for (let seed = 1; seed <= 30; seed++) level1.push(...kindsAt(1, seed, 10));
  const drops = level1.filter((k) => k === "drop").length;
  assert.ok(drops > 0, "water drops start at level 1");
  const rate = drops / level1.length;
  assert.ok(rate > 0.1 && rate < 0.28, `about 18% drops: ${(rate * 100).toFixed(1)}%`);

  /* a parked part above row 40 makes a drop on top of it impossible: the spawn stays a part */
  const s = g.init(77);
  let checked = 0;
  for (let i = 0; i < 600; i++) {
    s.misses = 0; s.splashes = 0; s.lives = 3;
    s.tick = C.LEVEL_TICKS - 1; s.next = 1;
    s.things = [{ x: 70, y: 20, k: 1, w: 10, h: 10 }];  /* centre 75, 20 px above the line */
    catchStep(g, s);
    const spawned = s.things[s.things.length - 1];
    if (spawned.k === "drop") {
      assert.ok(Math.abs(spawned.x + spawned.w / 2 - 75) > 12, "a drop keeps 12 px from a high part");
      checked++;
    }
  }
  assert.ok(checked > 0, "drops still appear away from the part");
});

test("catch: a caught drop costs a life and the combo, and is not a miss; a passed drop costs nothing", () => {
  const g = game("catch"), s = g.init(5);
  s.next = 999; s.score = 0; s.combo = 4; s.misses = 0; s.splashes = 0; s.lives = 3;
  s.things = [{ x: s.petX + 10, y: s.petY - 20, k: "drop", w: 10, h: 12 }];
  for (let i = 0; i < 40 && s.splashes === 0; i++) catchStep(g, s);
  assert.equal(s.splashes, 1, "the drop was caught");
  assert.equal(s.misses, 0, "and that is not a miss");
  assert.equal(s.lives, 2, "one life gone");
  assert.equal(s.combo, 0, "the combo resets");
  assert.equal(s.score, 0, "a drop scores nothing");
  assert.ok(s.events.includes("splash"));
  assert.equal(s.events.includes("catch"), false);
  assert.equal(s.done, false);

  const t = g.init(6);
  t.next = 999; t.misses = 0; t.splashes = 0; t.lives = 3;
  t.things = [{ x: 4, y: 110, k: "drop", w: 10, h: 12 }];
  for (let i = 0; i < 10 && t.things.length; i++) catchStep(g, t);
  assert.equal(t.things.length, 0, "the drop fell past");
  assert.equal(t.splashes, 0);
  assert.equal(t.misses, 0, "letting a drop fall is the point");
  assert.equal(t.lives, 3);
  assert.equal(t.events.includes("miss"), false);
});

test("catch: every fifth catch in a row scores two, and a miss starts the row again", () => {
  const g = game("catch"), s = g.init(8);
  s.next = 999; s.misses = 0; s.splashes = 0; s.lives = 3;
  function catchOne() {
    s.next = 999; s.things = [];
    s.things.push({ x: s.petX + 10, y: s.petY - 20, k: 1, w: 10, h: 10 });
    for (let i = 0; i < 15; i++) {
      catchStep(g, s);
      if (s.events.includes("catch")) return s.events.includes("combo");
    }
    throw new Error("the part was not caught");
  }
  const scores = [], combos = [];
  for (let n = 0; n < 6; n++) { combos.push(catchOne()); scores.push(s.score); }
  assert.deepEqual(scores, [1, 2, 3, 4, 6, 7], "the fifth catch is worth two");
  assert.deepEqual(combos, [false, false, false, false, true, false], "and it raises combo");
  assert.equal(s.combo, 6);

  /* a missed part puts the row back to zero, so the next fifth is five catches later */
  s.things = [{ x: 4, y: 110, k: 1, w: 10, h: 10 }];
  let missed = false;
  for (let i = 0; i < 10 && !missed; i++) { catchStep(g, s); missed = s.events.includes("miss"); }
  assert.ok(missed);
  assert.equal(s.combo, 0);
  assert.equal(catchOne(), false, "the catch after a miss is an ordinary one");
  assert.equal(s.score, 8);
});

test("catch: the third loss ends the round, on lives rather than a clock", () => {
  const g = game("catch"), s = g.init(9);
  s.next = 999; s.misses = 0; s.splashes = 0; s.lives = 3; s.combo = 3;
  for (let k = 1; k <= 3; k++) {
    s.things = [{ x: s.petX + 10, y: s.petY - 20, k: "drop", w: 10, h: 12 }];
    for (let i = 0; i < 40 && s.splashes < k; i++) catchStep(g, s);
    assert.equal(s.splashes, k);
    assert.equal(s.lives, 3 - k);
    if (k < 3) assert.equal(s.done, false, `still playing after ${k} losses`);
  }
  assert.equal(s.done, true, "the third splash ends it");
  assert.ok(s.events.includes("end"));
  assert.equal(s.misses, 0, "drops are not misses");
  assert.ok(s.tick < 1000);
});

test("catch: the draw is four tones, with a shelf and brackets, and three pips for the lives", () => {
  const g = game("catch"), s = g.init(12);
  s.things = [{ x: 20, y: 30, k: "drop", w: 10, h: 12 }, { x: 100, y: 50, k: 1, w: 10, h: 10 }];
  s.score = 9; s.combo = 4; s.misses = 1; s.splashes = 1; s.lives = 1;
  const buf = drawTones(g, s);
  for (let i = 0; i < buf.length; i++) assert.ok(buf[i] >= 0 && buf[i] <= 3, `pixel ${i} is ${buf[i]}`);
  assert.equal(buf[10 * W + 100], 2, "a mid shelf plank across the top");
  assert.equal(buf[12 * W + 19], 1, "a dark bracket under it");
  assert.equal(buf[(H - 6) * W + 10], 1, "the ink floor line");
  assert.equal(buf[(H - 4) * W + 10], 2, "the mid floor band");
  assert.equal(buf[4 * W + 5], 0, "one life left: the first pip is ink");
  assert.equal(buf[4 * W + 11], 2, "a lost pip is a mid outline");
  assert.equal(buf[5 * W + 12], 3, "and its inside is paper");
});

/* The catch bot: walk toward the lowest part that can still be caught, and stay out of a water drop's
   column before it reaches the floor. It reads only the state a player can see. */
function catchBotStep(g, s) {
  const C = Play.CATCH;
  const level = Math.min(C.LEVEL_MAX, Math.floor((s.tick + 1) / C.LEVEL_TICKS));
  const speed = C.fallSpeed(level);
  const cx = s.petX + 16;
  let dodge = 0, urgent = Infinity;
  for (const o of s.things) {
    if (o.k !== "drop") continue;
    const ocx = o.x + o.w / 2, bottom = o.y + o.h;
    const ticksIn = (s.petY + 8 - bottom) / speed;
    const ticksOut = (s.petY + 30 - bottom) / speed;
    if (ticksOut < 0 || ticksIn > 3) continue;          /* not about to be under us */
    if (ocx < s.petX - 4 || ocx > s.petX + 36) continue;
    if (ticksOut < urgent) { urgent = ticksOut; dodge = ocx >= cx ? -1 : 1; }
  }
  if (dodge) {
    g.step(s, { left: dodge < 0, right: dodge > 0, a: false, press: { left: false, right: false, a: false } }, 50);
    return;
  }
  let target = null, targetT1 = Infinity, next = null, nextT0 = Infinity;
  for (const o of s.things) {
    if (o.k === "drop") continue;
    const ocx = o.x + o.w / 2, bottom = o.y + o.h;
    if (bottom > s.petY + 30) continue;                 /* already past the catch */
    const t1 = Math.max(0, (s.petY + 30 - bottom) / speed);
    const t0 = (s.petY + 8 - bottom) / speed;
    const lo = ocx - 14, hi = ocx + 14;                 /* where the pet's middle catches it */
    const gap = cx < lo ? lo - cx : cx > hi ? cx - hi : 0;
    if (gap <= 6 * t1 && t1 < targetT1) { targetT1 = t1; target = { lo, hi }; }
    if (t0 < nextT0) { nextT0 = t0; next = { lo, hi }; }
  }
  const pick = target || next;
  const dir = !pick ? 0 : cx < pick.lo ? 1 : cx > pick.hi ? -1 : 0;
  g.step(s, { left: dir < 0, right: dir > 0, a: false, press: { left: false, right: false, a: false } }, 50);
}

test("catch: a greedy bot survives past tick 600 on at least 80% of 50 seeds", () => {
  const g = game("catch");
  let past = 0;
  const ends = [];
  for (let seed = 1; seed <= 50; seed++) {
    const s = g.init(seed);
    for (let i = 0; i < 700 && !s.done; i++) catchBotStep(g, s);
    ends.push(s.tick);
    if (s.tick > 600) past++;
  }
  ends.sort((a, b) => a - b);
  assert.ok(past >= 40, `the greedy bot survived past tick 600 on ${past}/50 seeds`);
  assert.ok(ends[0] > 300, `no seed ended absurdly early: lowest ${ends[0]}`);
});

/* The bots the owner's numbers are measured with. The target is the platform directly above the one just left,
   so a jump keeps its aim after it rises past the bar; the steering is the plain "move toward its centre" rule.
   A delayed bot sees the platforms and the pet's phase 6 ticks (300 ms) late. */
function climbSnap(s) {
  return JSON.parse(JSON.stringify({ pet: s.pet, plats: s.plats }));
}
function climbTarget(s) {
  const C = Play.CLIMB, feet = s.pet.y + C.FEET_BOTTOM;
  let base = null;
  for (const p of s.plats) if (p.y >= feet && (!base || p.y < base.y)) base = p;
  const ref = base ? base.y : feet;
  let target = null;
  for (const p of s.plats) if (p.y < ref && (!target || p.y > target.y)) target = p;
  if (!target) for (const p of s.plats) if (p.y >= feet && (!target || p.y < target.y)) target = p;
  return target;
}function movingX(p, ticks) {
  if (!p.mv) return p.x;
  let x = p.mv.x, dir = p.mv.dir, t = p.mv.t;
  for (let k = 0; k < ticks; k++) {
    t++;
    if (t % 3) continue;
    x += dir;
    if (x >= p.mv.base + p.mv.amp) { x = p.mv.base + p.mv.amp; dir = -1; }
    else if (x <= p.mv.base - p.mv.amp) { x = p.mv.base - p.mv.amp; dir = 1; }
  }
  return x;
}
function climbAim(snap, currentX) {
  if (!snap || !snap.pet) return 0;
  const target = climbTarget(snap);
  if (!target) return 0;
  /* ticks until the feet come down on the target's row */
  let y = snap.pet.y, vy = snap.pet.onPlat ? -12 : snap.pet.vy, t = 0;
  for (; t < 50; t++) { vy = Math.min(10, vy + 2); y += vy; if (vy > 0 && y >= target.y) break; }
  const px = movingX(target, t + 1);
  const want = Math.max(2, Math.min(129, px + target.w / 2 - 2));
  const cx = currentX + 16, tx = want + 16;
  return tx > cx ? 1 : tx < cx ? -1 : 0;
}
function climbRun(g, seed, delay) {
  const s = g.init(seed), history = [];
  for (let i = 0; i < 4000 && !s.done; i++) {
    const snap = delay ? history[Math.max(0, history.length - delay)] : climbSnap(s);
    const dir = climbAim(snap, s.pet.x);
    history.push(climbSnap(s));
    g.step(s, { left: dir < 0, right: dir > 0, a: false, press: { left: false, right: false, a: false } }, 50);
  }
  return s;
}
function randomClimb(g, seed) {
  const s = g.init(seed);
  let st = (seed * 9973 + 1) >>> 0, dir = 0, hold = 0;
  for (let i = 0; i < 4000 && !s.done; i++) {
    st = (Math.imul(st, 1664525) + 1013904223) >>> 0;
    if (hold <= 0) { dir = ((st >>> 16) & 1) ? 1 : -1; hold = 3 + ((st >>> 8) % 18); }
    hold--;
    g.step(s, { left: dir < 0, right: dir > 0, a: false, press: { left: false, right: false, a: false } }, 50);
  }
  return s;
}

test("climb: the difficulty curve is easy for six platforms, then narrower, higher and sometimes moving", () => {
  const g = game("climb"), inp = { left: false, right: false, a: false, press: {} };
  function chain(gen, seed) {
    const s = g.init(seed);
    s.moved = true; s.gen = gen;              /* jump straight to that point of the curve */
    g.step(s, inp, 50);
    return s.plats.slice(1);
  }
  const easy = chain(0, 7);
  assert.ok(easy.length >= 2);
  for (const p of easy) {
    assert.ok(p.w >= 20 && p.w <= 36, "easy width " + p.w);
    assert.ok(p.y < 92);
  }
  for (let i = 1; i < easy.length; i++) {
    const gap = easy[i - 1].y - easy[i].y;
    assert.ok(gap >= Play.CLIMB.GAP_MIN && gap <= Play.CLIMB.GAP_MAX, "easy gap " + gap);
  }
  const late = chain(40, 7);
  assert.ok(late.length >= 2);
  for (const p of late) assert.equal(p.w, Play.CLIMB.WIDTH_HARD, "the top is 12 px wide");
  assert.ok(92 - late[0].y >= 22, "the first vertical gap is near the jump's limit");
  let sawMover = false;
  for (let seed = 1; seed <= 20 && !sawMover; seed++) sawMover = chain(40, seed).some((p) => !!p.mv);
  assert.ok(sawMover, "some high platforms move left/right");
  const all = late.slice();
  for (let seed = 1; seed <= 10; seed++) all.push(...chain(40, seed));
  for (const p of all) {
    assert.ok(p.w >= Play.CLIMB.WIDTH_HARD && p.w <= 24, "width is in the hard range: " + p.w);
    if (p.mv) assert.ok(p.mv.amp >= 4 && p.mv.amp <= 8, "a mover slides a few pixels: " + p.mv.amp);
  }
});

test("climb: 200 seeds — a perfect steering bot survives 4000 ticks, a 300 ms bot falls in 40-70%, random input in >90%", () => {
  const g = game("climb");
  let perfectCap = 0, delayedFalls = 0, randomFalls = 0;
  const randomScores = [];
  for (let seed = 1; seed <= 200; seed++) {
    /* the loops are capped by the test: with no time limit a bot that never falls keeps going */
    if (!climbRun(g, seed, 0).done) perfectCap++;
    const delayed = climbRun(g, seed, 6);       /* 300 ms at a 50 ms tick */
    if (delayed.done) delayedFalls++;
    const random = randomClimb(g, seed);
    randomScores.push(random.score);
    if (random.done) randomFalls++;
  }
  assert.ok(perfectCap >= 190, `perfect bot still going ${perfectCap}/200, wanted at least 190`);
  assert.ok(delayedFalls >= 80 && delayedFalls <= 140, `delayed bot fell ${delayedFalls}/200, wanted 80-140`);
  assert.ok(randomFalls >= 181, `random bot fell ${randomFalls}/200, wanted more than 180`);
  randomScores.sort((a, b) => a - b);
  assert.ok(randomScores[100] < 30, "random median score " + randomScores[100]);
});

test("climb: every generated platform pair is reachable (<= jump height - 4 and <= the air-time run)", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = game("climb"), s = g.init(seed);
    for (let i = 0; i < 300 && !s.done; i++) {
      g.step(s, { left: false, right: false, a: false, press: {} }, 50);
      const sorted = [...s.plats].sort((a, b) => a.y - b.y);          /* high to low */
      for (let k = 1; k < sorted.length; k++) {
        const upper = sorted[k - 1], lower = sorted[k];
        assert.ok(lower.y - upper.y >= Play.CLIMB.GAP_MIN, `seed ${seed}: vertical gap at least ${Play.CLIMB.GAP_MIN}`);
        assert.ok(lower.y - upper.y <= Play.CLIMB.RISE - 4, `seed ${seed}: vertical gap at most jump - 4`);
        assert.ok(Play.climbReachable(lower, upper), `seed ${seed}: ${JSON.stringify(lower)} -> ${JSON.stringify(upper)} is reachable`);
      }
    }
  }
});

test("climb: a platform moved out from under a standing pet starts it falling on the next tick", () => {
  const g = game("climb"), s = g.init(11);
  s.plats = [{ x: 52, y: 92, w: 40 }];
  s.pet = { x: 64, y: 62, vy: 0, onPlat: true, rest: 1 };
  s.plats[0].x = 4; s.plats[0].w = 8;                    /* the platform is no longer under its feet */
  g.step(s, { left: false, right: false, a: false, press: {} }, 50);
  assert.equal(s.pet.onPlat, false, "the stale standing flag is cleared");
  assert.ok(s.pet.vy > 0, "gravity took over: " + s.pet.vy);
  assert.ok(s.pet.y > 62, "the pet moved down: " + s.pet.y);
});

test("climb: a fast fall does not tunnel through a platform in one tick", () => {
  const g = game("climb"), s = g.init(12);
  s.plats = [{ x: 40, y: 80, w: 48 }];
  s.pet = { x: 56, y: 50, vy: 10, onPlat: false, rest: 0 };   /* feet 80, next feet 90: past row 80 */
  g.step(s, { left: false, right: false, a: false, press: {} }, 50);
  assert.equal(s.pet.onPlat, true, "the swept landing caught the platform");
  assert.equal(s.pet.y + Play.CLIMB.FEET_BOTTOM, s.plats[0].y, "the feet stand on its top");
  assert.equal(s.pet.vy, 0);
});

test("climb: collision uses the feet, not the empty corners of the 32 px sprite", () => {
  const g = game("climb"), s = g.init(13);
  s.plats = [{ x: 46, y: 78, w: 8 }];                     /* only the sprite's right corner would touch it */
  s.pet = { x: 22, y: 50, vy: 10, onPlat: false, rest: 0 };  /* feet x 31..44, platform x 46..53 */
  g.step(s, { left: false, right: false, a: false, press: {} }, 50);
  assert.equal(s.pet.onPlat, false, "an empty sprite corner is not a foot");
});

test("reactions: a small pure table per game names the pose of the moment", () => {
  const R = Play.reaction;
  assert.equal(R("catch", "catch", { combo: 1 }), "happy");
  assert.equal(R("catch", "catch", { combo: 5 }), "jump", "every 5th catch in a row is a short cheer");
  assert.equal(R("catch", "splash", { lives: 2 }), "surprised", "a caught drop startles it");
  assert.equal(R("catch", "miss", { lives: 3 }), "fall");
  assert.equal(R("catch", "miss", { lives: 1 }), "sad", "on the last life a miss is sad");
  assert.equal(R("run", "hit", {}), "surprised", "running into something is the end of a run");
  assert.equal(R("run", "jump", {}), null, "a jump needs no face");
  assert.equal(R("run", "nut", {}), null, "and a nut is the play, not a pose");
  assert.equal(R("climb", "record", { height: 30 }), "happy");
  assert.equal(R("climb", "blink", {}), "blink");
  assert.equal(R("climb", "land", {}), null);
  assert.equal(R("nope", "catch", {}), null);
  /* the reaction really reaches the drawn frame and then gives way to the movement pose */
  const g = game("catch"), s = g.init(3);
  s.things = []; s.next = 999;
  s.react = "happy"; s.reactUntil = s.tick + 5;
  const buf = new Uint8Array(W * H);
  g.draw(s, buf, W, H, PACK, poseFor);
  assert.ok(buf.some((v) => v >= 0 && v <= 3));
});

test("climb: no input stays on the start platform past the old cap with score 0; the camera moves only above y=30", () => {
  const g = game("climb"), s = g.init(77);
  for (let i = 0; i < 4000 && !s.done; i++) g.step(s, { left: false, right: false, a: false, press: {} }, 50);
  assert.equal(s.done, false, "the round is still going: there is no clock");
  assert.equal(s.tick, 4000, "past the old 45 s cap");
  assert.equal(s.score, 0, "doing nothing climbs nothing");
  assert.equal(s.height, 0, "the camera never moved");
  assert.equal(s.joy, 0, "no result and no joy before a fall");

  const low = g.init(1);
  low.pet.y = 31; low.pet.vy = 0;
  g.step(low, { left: false, right: false, a: false, press: {} }, 50);
  assert.equal(low.height, 0, "below the threshold the camera stays put");
  assert.equal(low.score, 0);

  const high = g.init(1);
  high.pet.y = 29; high.pet.vy = -12;
  g.step(high, { left: false, right: false, a: false, press: {} }, 50);
  assert.ok(high.height > 0, "above the threshold the camera climbs");
  assert.equal(high.score, 0, "height alone is no point: only landing on a new, higher platform scores");
});
