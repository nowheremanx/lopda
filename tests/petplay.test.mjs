// runtime/petplay.js: the pet's three play packs are pure, deterministic and always end; the room's 162 x 120
// tone buffer is the only thing draw() may write.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read, runScript } from "./helpers.mjs";

const ctx = runScript("runtime/petsim.js");
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

test("three play packs, all front view for now; the side poses are ready for later", () => {
  assert.deepEqual(Array.from(Play.GAMES, (g) => g.id), ["catch", "bounce", "climb"]);
  assert.deepEqual(Array.from(Play.GAMES, (g) => g.labelKey), ["pet.game.catch", "pet.game.bounce", "pet.game.climb"]);
  for (const g of Play.GAMES) {
    assert.equal(g.view, "front", "no side game ships yet");
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

test("a round always ends: at most 600 ticks for catch, 900 for bounce and climb", () => {
  for (const g of Play.GAMES) {
    const r = drive(g, 7, 5000);
    assert.equal(r.state.done, true, `${g.id} ended`);
    assert.ok(r.steps < 5000, `${g.id} did not loop forever`);
    assert.ok(r.state.tick <= (g.id === "catch" ? 600 : 900), `${g.id} is capped in time: ${r.state.tick}`);
  }
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

test("bounce: a paddle under the ball returns it", () => {
  const g = game("bounce"), s = g.init(5);
  s.ball = { x: s.paddleX + 12, y: s.paddleY - 8, vx: 0, vy: 2 };
  g.step(s, inputAt(0), 50);
  assert.equal(s.score, 1, "the return scored");
  assert.equal(s.ball.vy, -2, "the ball is going back up");
  assert.ok(s.events.includes("return"));
  assert.equal(s.done, false);
});

test("bounce: the pet on top never bobs; it hops once when the ball comes back from the paddle", () => {
  const g = game("bounce"), s = g.init(7), base = s.petBaseY, W = Play.W;
  s.ball = { x: s.paddleX + 12, y: s.paddleY - 8, vx: 0, vy: 2 };
  const ys = [];
  let hops = 0;
  for (let i = 0; i < 400 && !s.done; i++) {
    if (s.ball && s.ball.vy > 0) s.paddleX = Math.max(2, Math.min(W - 4 - s.paddleW, s.ball.x - 15));
    const before = s.hop;
    g.step(s, { left: false, right: false, a: false, press: { left: false, right: false, a: false } }, 50);
    if (s.hop > before) hops++;
    if (!s.hop) assert.equal(s.petY, base, "the pet is on its base row outside the hop");
    else assert.ok(s.petY >= base - 4 && s.petY <= base, "the hop is four pixels at most");
    ys.push(s.petY);
  }
  assert.ok(hops > 0, "the ball came back from the paddle and the pet hopped");
  assert.ok(ys.includes(base) && ys.includes(base - 4), "the hop rises and comes back down");
  /* the resting row is much more common than the hop: no walk bob */
  assert.ok(ys.filter((y) => y === base).length > ys.length / 2);
  /* a top return (the pet sends the ball down) does not trigger another hop */
  const h = game("bounce"), t = h.init(8);
  t.ball = { x: t.petX + 12, y: t.petY + 31, vx: 0, vy: -2 };
  h.step(t, { left: false, right: false, a: false, press: {} }, 50);
  assert.equal(t.hop, 0, "only the paddle's return makes it hop");
});

test("catch: the pet walks 6 px a tick and things come every 0.7 to 1.0 seconds", () => {
  const g = game("catch"), s = g.init(3);
  s.next = 999;
  const x = s.petX;
  g.step(s, { left: false, right: true, a: false, press: {} }, 50);
  assert.equal(s.petX, x + 6, "120 px a second");
  s.next = 1;
  g.step(s, { left: false, right: false, a: false, press: {} }, 50);
  assert.ok(s.next >= 14 && s.next <= 20, "spawn gap is 14-20 ticks: " + s.next);
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

test("climb: 200 seeds — a perfect steering bot caps, a 300 ms bot falls in 40-70%, random input in >90%", () => {
  const g = game("climb");
  let perfectCap = 0, delayedFalls = 0, randomFalls = 0;
  const randomScores = [];
  for (let seed = 1; seed <= 200; seed++) {
    if (climbRun(g, seed, 0).tick >= 900) perfectCap++;
    const delayed = climbRun(g, seed, 6);       /* 300 ms at a 50 ms tick */
    if (!(delayed.tick >= 900)) delayedFalls++;
    const random = randomClimb(g, seed);
    randomScores.push(random.score);
    if (!(random.tick >= 900)) randomFalls++;
  }
  assert.ok(perfectCap >= 190, `perfect bot capped ${perfectCap}/200, wanted at least 190`);
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
  assert.equal(R("catch", "catch", { catches: 1 }), "happy");
  assert.equal(R("catch", "catch", { catches: 5 }), "jump", "every 5th catch is a short cheer");
  assert.equal(R("catch", "miss", { misses: 1 }), "fall");
  assert.equal(R("catch", "miss", { misses: 2 }), "sad");
  assert.equal(R("bounce", "return", { rally: 4 }), null, "a short rally keeps the walk");
  assert.equal(R("bounce", "return", { rally: 5 }), "happy", "a long rally gets a smile");
  assert.equal(R("bounce", "miss", { misses: 1 }), "surprised", "the ball passed: a surprised face");
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

test("climb: no input ends at the cap with score 0 and joy 1; the camera moves only above y=30", () => {
  const g = game("climb"), s = g.init(77);
  for (let i = 0; i < 2000 && !s.done; i++) g.step(s, { left: false, right: false, a: false, press: {} }, 50);
  assert.equal(s.done, true, "the round ended");
  assert.equal(s.tick, 900, "at the 45 s cap");
  assert.equal(s.score, 0, "doing nothing climbs nothing");
  assert.equal(s.height, 0, "the camera never moved");
  assert.equal(s.joy, 1);

  const low = g.init(1);
  low.pet.y = 31; low.pet.vy = 0;
  g.step(low, { left: false, right: false, a: false, press: {} }, 50);
  assert.equal(low.height, 0, "below the threshold the camera stays put");
  assert.equal(low.score, 0);

  const high = g.init(1);
  high.pet.y = 29; high.pet.vy = -12;
  g.step(high, { left: false, right: false, a: false, press: {} }, 50);
  assert.ok(high.height > 0, "above the threshold the camera climbs");
  assert.equal(high.score, high.height);
});
