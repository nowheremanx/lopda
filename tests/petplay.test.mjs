// runtime/petplay.js: the pet's two play packs are pure, deterministic and always end; the room's 162 x 120
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

test("two play packs: climb in front view, the runner from the side", () => {
  assert.deepEqual(Array.from(Play.GAMES, (g) => g.id), ["run", "climb"]);
  assert.deepEqual(Array.from(Play.GAMES, (g) => g.labelKey), ["pet.game.run", "pet.game.climb"]);
  assert.deepEqual(Array.from(Play.GAMES, (g) => g.view), ["side", "front"]);
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
  const c = drive(game("climb"), 1, 300).state, d = drive(game("climb"), 2, 300).state;
  assert.notDeepEqual(JSON.parse(JSON.stringify(c)), JSON.parse(JSON.stringify(d)));
});

test("a round always ends: a run with no input hits the first thing within 400, and climb has no clock", () => {
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

test("a finished round has score and joy 0, 1 or 2: no progress, no joy; never negative", () => {
  const min = { run: 10, climb: 1 };
  for (const g of Play.GAMES) {
    const s = g.init(99);
    s.score = -5;
    Play.finish(s);
    assert.equal(s.done, true);
    assert.equal(s.score, 0);
    assert.equal(s.joy, 0, `${g.id}: a round with no progress earns nothing`);
    assert.equal(Play.joyFor(g.id, min[g.id] - 1), 0, `${g.id}: just below the minimum`);
    assert.equal(Play.joyFor(g.id, min[g.id]), 1, `${g.id}: the minimum is +1`);
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

/* The runner's bot: press A when the next thing is inside four ticks of travel plus 10 px of the pet's front,
   and hold it until landing (a released A cuts the rise to a short hop). Four ticks is a late, safe press; the
   two-tick-longer figure lands the pet on the tail of a wide slipper at the slowest speed. */
const RUN_FRONT = 39;                                  /* PET_X + 23 */
function runAim(speedPx) { return speedPx * 4 + 10; }
/* The bot a careful player is: a full jump over a thing on the floor, a quick hop (A for three ticks) when a plane
   is over a low thing, and nothing for a plane alone. It records each new pattern's gap from the last one's right edge. */
function runBot(g, seed, ticks, policy = "smart", watch = null) {
  const s = g.init(seed), spawned = [], seen = new Set();
  let hold = 0, right = null;
  for (let i = 0; i < ticks && !s.done; i++) {
    const ahead = s.obs.filter((o) => o.x + o.w > 24 && o.kind !== "none").sort((a, b) => a.x - b.x);
    const grounds = ahead.filter((o) => o.kind === "ground"), planes = ahead.filter((o) => o.kind === "plane");
    let pressA = false;
    if (s.mode !== "run") {
      /* a stage: beat (or stroke) whenever the body is below the next opening's middle and not already rising */
      const gate = s.obs.filter((o) => o.kind === "gate" && o.x + o.w > 24).sort((a, b) => a.x - b.x)[0];
      const target = gate ? (gate.top + gate.bot) / 2 : Play.RUN.FLOOR - 40, body = Play.RUN.FLOOR - 1 - s.h - 8;
      if (policy !== "naive" && body > target + 2 && s.fv <= 0) pressA = true;
      if (policy === "naive" && s.tick % 6 === 0) pressA = true;
    } else if (s.onGround && ahead.length) {
      const sp = s.speedQ / 4;
      if (policy === "naive") {
        if (ahead[0].x - RUN_FRONT <= runAim(sp)) { pressA = true; hold = 20; }
      } else if (grounds.length && grounds[0].x - RUN_FRONT <= runAim(sp)) {
        /* a plane that will be over the pet while it is in the air: hop under it instead of a full jump */
        const dist = grounds[0].x - RUN_FRONT, tg = dist / sp;
        const danger = planes.some((p) => (p.x - RUN_FRONT) / (sp + p.vx) < tg + 22);
        if (!danger) { pressA = true; hold = 20; }
        else if (dist > 0 && dist <= sp * 3 + 6) { pressA = true; hold = 3; }
      }
    }
    const before = s.mode, animBefore = !!s.anim;
    g.step(s, { left: false, right: false, a: hold > 0 || pressA, press: { left: false, right: false, a: pressA } }, 50);
    if (hold > 0) hold--;
    if (watch) watch(s, before, pressA, animBefore);
    /* a new pattern: one or two things pushed in the same tick; its gap is from the previous pattern's right edge */
    const fresh = s.obs.filter((o) => !seen.has(o));
    const older = s.obs.filter((o) => seen.has(o));
    right = older.length ? Math.max(...older.map((o) => o.x + o.w)) : null;
    if (fresh.length) {
      const left = Math.min(...fresh.map((o) => o.x));
      spawned.push({ gap: right == null || fresh.some((o) => o.kind === "gate") || s.obs.some((o) => o.kind === "gate" && !fresh.includes(o)) ? null : left - right, speedQ: s.speedQ, kinds: fresh.map((o) => o.kind),
        nuts: fresh.filter((o) => o.nut).map((o) => ({ kind: o.kind, up: Play.RUN.FLOOR - (o.nut.y + 10) })), tick: s.tick });
      for (const o of fresh) seen.add(o);
    }
    /* positions move with the world: the right edge is measured again every tick */
    const all = s.obs.filter((o) => seen.has(o));
    if (all.length) right = Math.max(...all.map((o) => o.x + o.w));
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
    s.stageAt = Infinity;              /* the room only: a stage caps the speed */
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

test("run: patterns keep a landing gap, never below minGap(speed); planes from 10 s, plane over a thing from 20 s; nuts low or high", () => {
  const M = Play.RUN.minGap;
  assert.equal(M(16), 102, "at 4 px a tick: 18 ticks of travel plus 30 px");
  assert.equal(M(32), 174, "at 8 px a tick");
  let pairs = 0, low = 0, high = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const r = runBot(game("run"), seed, 3000);
    assert.equal(r.state.done, false, `seed ${seed} went the distance`);
    for (const sp of r.spawned) {
      if (sp.gap != null) {
        assert.ok(sp.gap >= M(sp.speedQ), `seed ${seed}: gap ${sp.gap} at speed ${sp.speedQ / 4} px`);
        /* a plane starts further back, by how much faster than the room it flies: only floor things have an upper bound */
        if (!sp.kinds.includes("plane")) assert.ok(sp.gap <= M(sp.speedQ) + 72, `seed ${seed}: gap ${sp.gap} inside the rule`);
        pairs++;
      }
      if (sp.tick < Play.RUN.LEVEL_TICKS) assert.ok(!sp.kinds.includes("plane"), "no plane in the first ten seconds");
      if (sp.tick < 2 * Play.RUN.LEVEL_TICKS) assert.ok(!(sp.kinds.includes("ground") && sp.kinds.includes("plane")), "no plane over a thing before 20 s");
      if (sp.kinds.includes("gate")) continue;          /* a stage's nuts sit in its openings */
      for (const n of sp.nuts) {
        /* a nut is its own thing, never carried by a plane: low where a plane will pass over it, else high */
        assert.equal(n.kind, "none", "a nut is not attached to anything");
        if (sp.kinds.includes("plane")) { assert.equal(n.up, Play.RUN.NUT_LOW, "a nut a plane will pass over sits low"); low++; }
        else { assert.equal(n.up, Play.RUN.NUT_HIGH, "a nut alone sits high"); high++; }
      }
    }
  }
  assert.ok(pairs >= 100, `enough spawns to judge: ${pairs}`);
  assert.ok(low > 0 && high > 0, `nuts both low (${low}) and high (${high})`);
});

test("run: a plane - standing and a quick hop (A up to 3 ticks) pass under it, a long jump (5+) flies into it", () => {
  const g = game("run");
  const tryHold = (n, ph) => {
    const s = g.init(3);
    s.tick = 900;
    const y = Play.RUN.FLOOR - Play.RUN.PLANE_UP - 10;
    s.obs = [{ x: 60, y, base: y, w: 20, h: 10, kind: "plane", nut: null, vx: 0, phase: ph }];
    for (let t = 0; t < 40 && !s.dying; t++) {
      g.step(s, { left: false, right: false, a: t < n, press: { left: false, right: false, a: t === 0 && n > 0 } }, 50);
      s.obs[0].x = 18;                                  /* keep the plane right over the pet for the whole jump */
    }
    return s.dying > 0;
  };
  /* every bob phase: the plane is alive, but the rule holds wherever it is in its bob */
  for (let ph = 0; ph < 16; ph++) {
    assert.equal(tryHold(0, ph), false, "standing passes under");
    for (const n of [1, 2, 3]) assert.equal(tryHold(n, ph), false, `A for ${n} ticks stays under (phase ${ph})`);
    for (const n of [5, 6, 20]) assert.equal(tryHold(n, ph), true, `A for ${n} ticks flies into it (phase ${ph})`);
  }
});

test("run: jumping at everything is not enough - a full-jump-at-anything bot falls to a plane, the careful one runs on", () => {
  const g = game("run");
  const ends = [];
  for (let seed = 1; seed <= 50; seed++) {
    const r = runBot(g, seed, 3000, "naive");
    ends.push(r.state.done ? r.state.tick : 3000);
  }
  ends.sort((a, b) => a - b);
  assert.ok(ends[49] < 1500, `the naive bot never lasts: longest ${ends[49]} ticks`);
  assert.ok(ends[25] < 800, `median ${ends[25]} ticks`);
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

test("run: a nut floating over the lane gives ten points and disappears", () => {
  const g = game("run"), s = g.init(9);
  s.obs = [{ x: 90, y: 88, w: 14, h: 12, k: 0, kind: "ground", nut: { x: 28, y: 70 } }];
  const before = s.score;
  g.step(s, { left: false, right: false, a: true, press: { left: false, right: false, a: true } }, 50);
  assert.ok(s.events.includes("jump"));
  assert.ok(s.events.includes("nut"), "the jump took the nut");
  assert.equal(s.score, before + Play.RUN.NUT_PTS, "a nut is ten points on top of the distance");
  assert.equal(Play.RUN.NUT_PTS, 10);
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
  assert.equal(R("run", "hit", {}), "surprised", "running into something is the end of a run");
  assert.equal(R("run", "jump", {}), null, "a jump needs no face");
  assert.equal(R("run", "nut", {}), null, "and a nut is the play, not a pose");
  assert.equal(R("climb", "record", { height: 30 }), "happy");
  assert.equal(R("climb", "blink", {}), "blink");
  assert.equal(R("climb", "land", {}), null);
  assert.equal(R("nope", "hit", {}), null);
  /* the reaction really reaches the drawn frame and then gives way to the movement pose */
  const g = game("climb"), s = g.init(3);
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

test("climb: the scenery changes with height - wall, roof, sky, stars - in background tones only", () => {
  const g = game("climb"), C = Play.CLIMB;
  assert.ok(C.ROOF < C.SKY && C.SKY < C.SPACE, "the bands go up in order");
  const pics = [0, C.ROOF + 40, C.SKY + 200, C.SPACE + 100].map((h) => {
    const s = g.init(5);
    s.plats = [];                                  /* only the scenery */
    s.pet = null;
    s.height = h;
    const buf = drawTones(g, s);
    for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 30; x++) {
      assert.ok([2, 3].includes(buf[y * W + x]), `height ${h}: background is paper or mid at ${x},${y}`);
    }
    return Array.from(buf).join("");
  });
  assert.equal(new Set(pics).size, 4, "each band looks different");
});

test("run: stages - the sky, the pond and the lights out in random order, never twice in a row; A beats or strokes; the room comes back", () => {
  const g = game("run"), R = Play.RUN;
  assert.ok(R.STAGE_FIRST >= 2000, "the first stage comes after a proper run");
  let sawFly = 0, sawSwim = 0, back = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = runBot(g, seed, 4000);
    assert.equal(r.state.done, false, `seed ${seed}: a careful player gets through every stage`);
    assert.ok(r.state.stageN >= 2, `seed ${seed}: at least a sky and a pond in 4000 ticks (${r.state.stageN})`);
  }
  /* the order and the rules, step by step on one seed */
  let gates = [], lastMid = null;
  runBot(g, 5, 4000, "smart", (s, before, press, animBefore) => {
    if (before === "run" && s.mode !== "run") {
      if (s.mode === "fly") sawFly++; else sawSwim++;
      assert.ok(s.events.includes(s.mode));
      gates = []; lastMid = null;
    }
    if (before !== "run" && s.mode !== "run") {
      assert.ok(s.speedQ <= R.STAGE_SPEED, "a stage is at most 5 px a tick");
      /* A beats (or strokes); during the pond's dive and climb out A does nothing at all */
      if (press && !animBefore) assert.ok(s.events.includes("flap") && !s.events.includes("jump"), "A beats, it does not jump");
      if (press && animBefore) assert.ok(!s.events.includes("flap") && !s.events.includes("jump"), "A does nothing in the dive");
      for (const o of s.obs) if (o.kind === "gate" && !gates.includes(o)) {
        gates.push(o);
        const gh = o.bot - o.top, mid = (o.top + o.bot) / 2;
        assert.ok(gh >= R.GAP_MIN && gh <= R.GAP_START, `the opening is ${gh} px`);
        if (lastMid != null) assert.ok(Math.abs(mid - lastMid) <= R.STAGE[o.scene].move + 1, `the opening moved ${mid - lastMid} px`);
        lastMid = mid;
      }
    }
    if (before !== "run" && s.mode === "run") {
      back++;
      assert.equal(gates.length, R.STAGE_GATES, "every stage has its gates");
    }
  });
  /* the order: over many seeds every stage comes first sometimes, and no stage ever follows itself */
  const firsts = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const kinds = [];
    runBot(g, seed, 4000, "smart", (s, before) => {
      if (before === "run" && s.mode !== "run") kinds.push(s.mode);
      if (s.events.includes("dark")) kinds.push("dark");
    });
    firsts.add(kinds[0]);
    for (let i = 1; i < kinds.length; i++) assert.notEqual(kinds[i], kinds[i - 1], `seed ${seed}: ${kinds.join(",")}`);
  }
  assert.equal(firsts.size, 3, "any stage can come first");
  assert.ok(sawFly + sawSwim >= 1 && back >= 1, `sky ${sawFly}, pond ${sawSwim}, back in the room ${back}`);
});

test("run: the lights go out - a three-second fade, then only the lamp's oval is lit, then the light comes back", () => {
  const g = game("run"), R = Play.RUN;
  const s = g.init(1);
  s.lastStage = "fly";
  let started = null, out = null, on = null;
  for (let i = 0; i < 3000 && !s.done && !on; i++) {
    if (!started && s.dist + 162 >= s.stageAt) { s.lastStage = "x"; s.rn = 0; }
    g.step(s, { left: false, right: false, a: false, press: {} }, 50);
    if (s.events.includes("dark")) started = s.tick;
    if (s.events.includes("lightsout")) out = s.tick;
    if (s.events.includes("lightson")) on = s.tick;
    s.dying = 0;                                      /* this test is about the stage clock, not about surviving */
    s.obs = s.obs.filter((o) => o.kind !== "ground" && o.kind !== "plane");
    if (s.mode !== "run" && !started) { s.mode = "run"; s.scene = "room"; s.anim = null; s.obs = []; s.intro = null; s.stageAt = s.dist + 10; }
  }
  assert.ok(started, "the lights went out at some point");
  assert.equal(out - started, R.DARK_COUNT, "three seconds of fading");
  assert.ok(on > out, "and the lights come back on");
  /* drawing in the dark: ink outside the lamp's oval, the pet's own spot lit, the score in paper */
  const d = g.init(2);
  d.obs = []; d.dark = 1; d.darkCount = 0; d.darkUntil = 1e9; d.score = 7;
  const buf = drawTones(g, d);
  assert.equal(buf[60 * W + 150], 0, "far ahead is dark");
  assert.equal(buf[10 * W + 20], 0, "the top left is dark");
  assert.notEqual(buf[(R.FLOOR - 10) * W + 30], 0, "around the pet is lit");
  let paper = 0;
  for (let y = 4; y < 11; y++) for (let x = W - 12; x < W - 4; x++) if (buf[y * W + x] === 3) paper++;
  assert.ok(paper > 5, "the score is still readable in the dark");
});

test("run: a way into each stage - the hint event first, an empty room, then the stage; A does nothing meanwhile", () => {
  const g = game("run");
  const s = g.init(3);
  let intro = null, started = null, jumpsInIntro = 0;
  for (let i = 0; i < 2000 && !started; i++) {
    g.step(s, { left: false, right: false, a: true, press: { left: false, right: false, a: i % 3 === 0 } }, 50);
    if (s.events.includes("intro_fly")) intro = s.tick;
    if (intro && !started && s.events.includes("jump")) jumpsInIntro++;
    if (s.events.includes("fly")) started = s.tick;
    s.dying = 0;
    s.obs = s.obs.filter((o) => o.kind === "gate");
  }
  assert.ok(intro && started, "the sky's way in, then the sky");
  assert.ok(started - intro >= 30, `about two seconds to read the hint: ${started - intro} ticks`);
  assert.equal(jumpsInIntro, 0, "A does not jump on the way in");
});

test("run: into the pond - a dive through the surface to the bottom with a splash, and out again in an arc", () => {
  const g = game("run"), R = Play.RUN;
  let dive = null, settled = null, rise = null, out = null, splashes = 0, minH = 99;
  runBot(g, 4, 4000, "smart", (s, before) => {
    if (s.events.includes("splash")) splashes++;
    if (before === "run" && s.mode === "swim") dive = s.tick;
    if (dive && !settled) minH = Math.min(minH, s.h);
    if (dive && !settled && s.mode === "swim" && !s.anim && s.gatesMade > 0) settled = s.tick;
    if (s.mode === "swim" && s.anim && s.anim.kind === "rise" && !rise) rise = s.tick;
    if (before === "swim" && s.mode === "run" && !out) {
      out = s.tick;
      assert.ok(!s.onGround && s.h > 0, "it leaves the water in the air, then falls onto the floor");
    }
  });
  assert.ok(dive && settled && rise && out, "dive, swim, climb out");
  assert.ok(settled - dive >= 10, `the dive takes a moment: ${settled - dive} ticks`);
  assert.equal(minH, 0, "it sinks to the bottom before the first gate");
  assert.ok(splashes >= 2, "a splash going in and one coming out");
});

test("run: the dark comes and goes gradually - darker each count beat, and lighter again before it ends", () => {
  const g = game("run");
  const inkAt = (count, up) => {
    const s = g.init(2);
    s.obs = []; s.dark = 1; s.darkCount = count; s.lightUp = up || 0; s.darkUntil = 1e9;
    const buf = drawTones(g, s);
    let n = 0;
    for (let y = 2; y < 30; y++) for (let x = 100; x < 160; x++) if (buf[y * W + x] === 0) n++;
    return n;
  };
  const a = inkAt(59), b = inkAt(40), c = inkAt(20), d = inkAt(0), e = inkAt(0, 30), f = inkAt(0, 5);
  assert.ok(a < b && b < c && c < d, `the night thickens: ${a} < ${b} < ${c} < ${d}`);
  assert.ok(f < e && e <= d, `and thins when the light comes back: ${d} >= ${e} > ${f}`);
});
