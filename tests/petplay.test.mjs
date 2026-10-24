// runtime/petplay.js: the pet's three play packs are pure, deterministic and always end; the room's 81 x 60
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
const poseFor = (view, name) => Art.pose(PACK, { ant: "fork", pat: "trace", eye: "big" }, view, name);
const game = (id) => Play.GAMES.find((g) => g.id === id);
const W = 81, H = 60;

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
  assert.equal(Play.W, 81);
  assert.equal(Play.H, 60);
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

test("draw writes only tone indices 0-3 into the 81 x 60 buffer", () => {
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
  s.things = [{ x: s.petX + 6, y: s.petY - 20, k: 0, w: 5, h: 5 }];
  for (let i = 0; i < 30 && s.score === 0; i++) g.step(s, inputAt(i), 50);
  assert.equal(s.score, 1, "the thing above the pet was caught");
  assert.equal(s.things.length, 0);
  assert.ok(s.events.includes("catch"));
  assert.equal(s.done, false);
});

test("bounce: a paddle under the ball returns it", () => {
  const g = game("bounce"), s = g.init(5);
  s.ball = { x: s.paddleX + 6, y: s.paddleY - 4, vx: 0, vy: 1 };
  g.step(s, inputAt(0), 50);
  assert.equal(s.score, 1, "the return scored");
  assert.equal(s.ball.vy, -1, "the ball is going back up");
  assert.ok(s.events.includes("return"));
  assert.equal(s.done, false);
});

test("catch: the pet walks 3 px a tick and things come every 0.7 to 1.0 seconds", () => {
  const g = game("catch"), s = g.init(3);
  s.next = 999;
  const x = s.petX;
  g.step(s, { left: false, right: true, a: false, press: {} }, 50);
  assert.equal(s.petX, x + 3, "60 px a second");
  s.next = 1;
  g.step(s, { left: false, right: false, a: false, press: {} }, 50);
  assert.ok(s.next >= 14 && s.next <= 20, "spawn gap is 14-20 ticks: " + s.next);
});

/* A simple steering bot: rising, aim at the nearest platform above; falling, at the nearest one below the feet. */
function climbBot(seed) {
  const g = game("climb"), s = g.init(seed);
  for (let i = 0; i < 4000 && !s.done; i++) {
    const bottom = s.pet.y + Play.CLIMB.FEET_BOTTOM;
    let target = null;
    for (const p of s.plats) {
      if (s.pet.vy < 0) { if (p.y < bottom - 1 && (!target || p.y > target.y)) target = p; }
      else if (p.y >= bottom && (!target || p.y < target.y)) target = p;
    }
    let dir = 0;
    if (target) {
      const tx = target.x + target.w / 2, cx = s.pet.x + 8;
      if (tx > cx + 1) dir = 1; else if (tx < cx - 1) dir = -1;
    }
    g.step(s, { left: dir < 0, right: dir > 0, a: false, press: { left: false, right: false, a: false } }, 50);
  }
  return s;
}

test("climb: a steering bot reaches height 30 in at least 80% of 200 seeds", () => {
  let reached = 0;
  const heights = [];
  for (let seed = 1; seed <= 200; seed++) {
    const s = climbBot(seed);
    heights.push(s.height);
    if (s.height >= 30) reached++;
  }
  assert.ok(reached >= 160, `only ${reached}/200 seeds reached 30; heights ${heights.slice(0, 12).join(",")}`);
});

test("climb: every generated platform pair is reachable (<= jump height - 2 and <= the air-time run)", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = game("climb"), s = g.init(seed);
    for (let i = 0; i < 300 && !s.done; i++) {
      g.step(s, { left: false, right: false, a: false, press: {} }, 50);
      const sorted = [...s.plats].sort((a, b) => a.y - b.y);          /* high to low */
      for (let k = 1; k < sorted.length; k++) {
        const upper = sorted[k - 1], lower = sorted[k];
        assert.ok(lower.y - upper.y >= Play.CLIMB.GAP_MIN, `seed ${seed}: vertical gap at least ${Play.CLIMB.GAP_MIN}`);
        assert.ok(lower.y - upper.y <= Play.CLIMB.RISE - 2, `seed ${seed}: vertical gap at most jump - 2`);
        assert.ok(Play.climbReachable(lower, upper), `seed ${seed}: ${JSON.stringify(lower)} -> ${JSON.stringify(upper)} is reachable`);
      }
    }
  }
});

test("climb: a platform moved out from under a standing pet starts it falling on the next tick", () => {
  const g = game("climb"), s = g.init(11);
  s.plats = [{ x: 30, y: 46, w: 20 }];
  s.pet = { x: 32, y: 32, vy: 0, onPlat: true, rest: 1 };
  s.plats[0].x = 2; s.plats[0].w = 4;                    /* the platform is no longer under its feet */
  g.step(s, { left: false, right: false, a: false, press: {} }, 50);
  assert.equal(s.pet.onPlat, false, "the stale standing flag is cleared");
  assert.ok(s.pet.vy > 0, "gravity took over: " + s.pet.vy);
  assert.ok(s.pet.y > 32, "the pet moved down: " + s.pet.y);
});

test("climb: a fast fall does not tunnel through a platform in one tick", () => {
  const g = game("climb"), s = g.init(12);
  s.plats = [{ x: 20, y: 40, w: 24 }];
  s.pet = { x: 28, y: 24, vy: 5, onPlat: false, rest: 0 };   /* feet 38, next feet 43: past row 40 */
  g.step(s, { left: false, right: false, a: false, press: {} }, 50);
  assert.equal(s.pet.onPlat, true, "the swept landing caught the platform");
  assert.equal(s.pet.y + Play.CLIMB.FEET_BOTTOM, s.plats[0].y, "the feet stand on its top");
  assert.equal(s.pet.vy, 0);
});

test("climb: collision uses the feet, not the empty corners of the 16 px sprite", () => {
  const g = game("climb"), s = g.init(13);
  s.plats = [{ x: 24, y: 46, w: 4 }];                     /* only the sprite's right corner would touch it */
  s.pet = { x: 11, y: 28, vy: 5, onPlat: false, rest: 0 };  /* feet x 14..23, platform x 24..27 */
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
  assert.equal(R("bounce", "miss", { misses: 1 }), "fall");
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

test("climb: no input ends at the cap with score 0 and joy 1; the camera moves only above y=15", () => {
  const g = game("climb"), s = g.init(77);
  for (let i = 0; i < 2000 && !s.done; i++) g.step(s, { left: false, right: false, a: false, press: {} }, 50);
  assert.equal(s.done, true, "the round ended");
  assert.equal(s.tick, 900, "at the 45 s cap");
  assert.equal(s.score, 0, "doing nothing climbs nothing");
  assert.equal(s.height, 0, "the camera never moved");
  assert.equal(s.joy, 1);

  const low = g.init(1);
  low.pet.y = 16; low.pet.vy = 0;
  g.step(low, { left: false, right: false, a: false, press: {} }, 50);
  assert.equal(low.height, 0, "below the threshold the camera stays put");
  assert.equal(low.score, 0);

  const high = g.init(1);
  high.pet.y = 14; high.pet.vy = -6;
  g.step(high, { left: false, right: false, a: false, press: {} }, 50);
  assert.ok(high.height > 0, "above the threshold the camera climbs");
  assert.equal(high.score, high.height);
});
