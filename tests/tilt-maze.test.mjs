// registry/apps/tilt-maze 2.0: twelve levels in three areas, every one solvable with the D-pad through all three gems
// (a gate counts as open only once its button can be reached), the 1.x `best` save opens the new levels without being
// rewritten, a damaged `prog` never throws, and a beetle's bite sends the ball back to the last lit checkpoint.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot } from "./app-vm.mjs";

function bootApp(store = {}, opt = {}) {
  const listeners = {}, sfx = [];
  let releaseLoad = null;
  const held = opt.holdLoad ? new Promise((r) => { releaseLoad = r; }) : null;
  const pad = {
    lang: "zh",
    save(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    load(k) {
      const value = store[k] == null ? null : JSON.parse(JSON.stringify(store[k]));
      return held && k === "prog" ? held.then(() => value) : Promise.resolve(value);
    },
    remove(k) { delete store[k]; },
    sfx(n) { sfx.push(n); },
    on(t, fn) { (listeners[t] ||= []).push(fn); },
    off() {}, isDown() { return false; }
  };
  const app = boot("registry/apps/tilt-maze/index.html", { pad, seed: 7 });
  const tick = async (n = 1) => {
    for (let i = 0; i < n; i++) { app.frame(); await new Promise((r) => setImmediate(r)); }
  };
  const press = async (b) => {
    (listeners.press || []).forEach((f) => f(b)); await tick(2);
    (listeners.release || []).forEach((f) => f(b)); await tick(1);
  };
  return { app, store, tick, press, sfx, release: () => releaseLoad && releaseLoad() };
}

const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function reach(map, sx, sy, gatesOpen) {
  const seen = new Set([`${sx},${sy}`]), queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of D4) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || ny >= map.length || nx >= map[0].length || seen.has(k)) continue;
      const ch = map[ny][nx];
      if (ch === "#" || ch === "O" || (ch === "D" && !gatesOpen)) continue;
      seen.add(k); queue.push([nx, ny]);
    }
  }
  return seen;
}

test("twelve levels in three areas: rectangular, three gems each, solvable by keys with the gate rule", async () => {
  const { app, tick } = bootApp();
  await tick(2);
  const LEVELS = app.ctx.get("LEVELS");
  assert.equal(LEVELS.length, 12);
  assert.equal(app.ctx.get("AREAS").length, 3);
  LEVELS.forEach((level, i) => {
    const tag = `level ${i + 1} (${level.name.en})`;
    assert.ok(level.name.zh && level.name.en, `${tag} has a name in both languages`);
    const map = level.map, H = map.length, W = map[0].length, at = {};
    assert.ok(W >= 20 && W <= 40 && H >= 18 && H <= 36, `${tag} is 20x18 to 40x36, not ${W}x${H}`);
    if (i % 4 === 0) assert.deepEqual([W, H], [20, 18], `${tag} opens its area on one screen`);
    map.forEach((row, y) => {
      assert.equal(row.length, W, `${tag} row ${y} has ${W} columns`);
      [...row].forEach((ch, x) => {
        assert.ok("#.OSG*CBKD".includes(ch), `${tag} row ${y}: unexpected tile "${ch}"`);
        if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && ch !== "#") assert.fail(`${tag}: open edge at ${x},${y}`);
        (at[ch] ||= []).push([x, y]);
      });
    });
    const n = (ch) => (at[ch] || []).length;
    assert.equal(n("S"), 1, `${tag} has one start`);
    assert.equal(n("G"), 1, `${tag} has one goal`);
    assert.equal(n("*"), 3, `${tag} has three gems`);
    assert.ok(n("B") <= 3, `${tag} has at most three beetles`);
    if (i < 3) assert.equal(n("B"), 0, `${tag}: no beetle before level 4`);
    if (i === 3) assert.equal(n("B"), 1, "level 4 brings the first beetle");
    if (n("D") || n("K")) assert.equal(Math.floor(i / 4), 2, `${tag}: buttons and gates belong to the clock tower`);
    const [sx, sy] = at.S[0], closed = reach(map, sx, sy, false);
    if (n("D")) assert.ok((at.K || []).some(([x, y]) => closed.has(`${x},${y}`)), `${tag}: a button is reachable with the gates shut`);
    const open = n("D") ? reach(map, sx, sy, true) : closed;
    for (const ch of ["*", "G", "C", "K"]) for (const [x, y] of at[ch] || [])
      assert.ok(open.has(`${x},${y}`), `${tag}: "${ch}" at ${x},${y} can be reached`);
    /* a beetle never sleeps on top of a place the ball comes back to */
    for (const [bx, by] of at.B || []) for (const [x, y] of [...(at.S || []), ...(at.C || [])])
      assert.ok(Math.hypot(bx - x, by - y) * 8 >= 48, `${tag}: beetle at ${bx},${by} is far enough from ${x},${y}`);
  });
});

test("the app boots to the title, starts level 1 on the garden's card and rolls", async () => {
  const { app, tick, press } = bootApp();
  await tick(6);
  assert.ok(app.hashes.length > 0, "the title draws");
  await press("a");
  await tick(30);
  assert.equal(app.ctx.get("level"), 0);
  assert.equal(app.ctx.get("state"), "intro", "the area's card first");
  await tick(100);
  assert.equal(app.ctx.get("state"), "roll", "the card goes on by itself");
  assert.ok(app.hashes.length > 100, "the play scene draws");
});

test("the title waits for the save, so a key on the way cannot start a returning player at level 1", async () => {
  const { app, tick, press, release } = bootApp(
    { prog: { v: 1, unlocked: 5, gems: new Array(12).fill(0), times: new Array(12).fill(null) } }, { holdLoad: true });
  await tick(6);
  assert.equal(app.ctx.get("loaded"), false, "the save is still on its way");
  await press("right");
  assert.equal(app.ctx.get("sel"), 0, "a key before the save lands does not move the picker");
  release();
  await tick(4);
  assert.equal(app.ctx.get("loaded"), true);
  assert.equal(app.ctx.get("sel"), 5, "the picker sits on the furthest open level");
});

test("a locked row says why on the footer and plays err, from a key or a tap", async () => {
  const r = bootApp();
  await r.tick(8);
  await r.press("down");                                 /* the title's DOWN opens the level list */
  await r.tick(40);
  assert.equal(r.app.ctx.get("sel"), 0);
  r.sfx.length = 0;
  await r.press("down");                                 /* level 2 is still locked */
  assert.equal(r.app.ctx.get("sel"), 0, "a locked row takes no selection");
  assert.equal(r.app.ctx.get("note"), "通关前一关后开放");
  assert.ok(r.app.ctx.get("noteUntil") > r.app.ctx.get("game").time, "the footer keeps the line a moment");
  assert.deepEqual(r.sfx, ["err"]);
  /* a finger on the locked row says the same where a key would */
  await r.tick(120);                                      /* let the note run out */
  r.sfx.length = 0;
  r.app.pointer("pointerdown", 80, 65, 160, 176);         /* row 3: the garden's level 2 */
  await r.tick(1);
  r.app.pointer("pointerup", 80, 65, 160, 176);
  await r.tick(1);
  assert.equal(r.app.ctx.get("sel"), 0);
  assert.equal(r.app.ctx.get("note"), "通关前一关后开放");
  assert.deepEqual(r.sfx, ["err"]);
});

test("a 1.x save with best 7 opens level 12, without rewriting best", async () => {
  const { app, store, tick, press } = bootApp({ best: 7 });
  await tick(8);
  assert.equal(app.ctx.get("prog").unlocked, 11);
  assert.equal(app.ctx.get("sel"), 11, "the picker sits on the furthest level");
  assert.equal(store.best, 7, "loading does not rewrite the old save");
  assert.equal(store.prog, undefined, "nor writes the new one before anything changes");
  await press("a");
  await tick(40);
  assert.equal(app.ctx.get("level"), 11, "A starts level 12");
});

test("best 0 opens level 1 only; a damaged prog falls back to best and never throws", async () => {
  let r = bootApp({ best: 0 });
  await r.tick(8);
  assert.equal(r.app.ctx.get("prog").unlocked, 0);
  for (const bad of ["x", 3, [1, 2], { v: 1, unlocked: 99, gems: [], times: [] }, { v: 1, unlocked: 2, gems: new Array(12).fill(5), times: new Array(12).fill(null) }]) {
    r = bootApp({ best: 3, prog: bad });
    await r.tick(8);
    assert.equal(r.app.ctx.get("prog").unlocked, 3 + 1 + 1, `damaged ${JSON.stringify(bad)} migrates best 3`);
    assert.deepEqual(r.store.prog, bad, "the damaged save is left as it was");
  }
  /* a good prog wins over best */
  const good = { v: 1, unlocked: 5, gems: [3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], times: [12.5, null, null, null, null, null, null, null, null, null, null, null] };
  r = bootApp({ best: 7, prog: good });
  await r.tick(8);
  assert.equal(r.app.ctx.get("prog").unlocked, 5);
  assert.equal(r.app.ctx.get("prog").gems[0], 3);
});

test("clearing a level saves prog: gems, best time and the next level open", async () => {
  const { app, store, tick, press } = bootApp();
  await tick(6);
  await press("a");
  await tick(180);
  const ctx = app.ctx;
  ctx.get("gems")[0].got = true; ctx.get("gems")[2].got = true;
  const ball = ctx.get("ball"), G0 = ctx.get("G0");
  ball.x = G0.x; ball.y = G0.y;
  await tick(3);
  assert.equal(ctx.get("state"), "clear");
  assert.equal(store.prog.unlocked, 1);
  assert.equal(store.prog.gems[0], 2);
  assert.ok(store.prog.times[0] > 0);
  assert.equal(store.best, undefined, "best is never written");
});

test("a beetle's bite sends the ball back to the last lit checkpoint and the beetles back to sleep", async () => {
  const { app, tick, press } = bootApp({ prog: { v: 1, unlocked: 3, gems: new Array(12).fill(0), times: new Array(12).fill(null) } });
  await tick(8);
  for (let i = 0; i < 3; i++) await press("right");
  assert.equal(app.ctx.get("sel"), 3);
  await press("a");
  await tick(40);
  const ctx = app.ctx;
  assert.equal(ctx.get("level"), 3);
  assert.equal(ctx.get("state"), "roll");
  const beetles = ctx.get("beetles"), checks = ctx.get("checks");
  assert.equal(beetles.length, 1);
  /* light the first checkpoint by rolling over it */
  const c = checks[0], ball = ctx.get("ball");
  ball.x = c.x; ball.y = c.y; ball.vx = ball.vy = 0;
  await tick(2);
  assert.equal(ctx.get("home"), c, "the checkpoint is lit");
  assert.ok(c.lit);
  /* now put the ball next to the beetle: it wakes and bites */
  const b = beetles[0], spawn = { x: b.x, y: b.y };
  ctx.get("ball").x = b.x + 3; ctx.get("ball").y = b.y;
  await tick(2);
  assert.equal(ctx.get("state"), "bite");
  await tick(40);
  assert.equal(ctx.get("state"), "roll");
  assert.equal(ctx.get("ball").x, c.x);
  assert.equal(ctx.get("ball").y, c.y);
  assert.equal(b.awake, false);
  assert.deepEqual({ x: b.x, y: b.y }, spawn);
});

test("a woken beetle crawls toward the ball, slower than the ball can roll", async () => {
  const { app, tick, press } = bootApp({ prog: { v: 1, unlocked: 3, gems: new Array(12).fill(0), times: new Array(12).fill(null) } });
  await tick(8);
  for (let i = 0; i < 3; i++) await press("right");
  await press("a");
  await tick(40);
  const ctx = app.ctx, b = ctx.get("beetles")[0], ball = ctx.get("ball");
  /* the ball rests 4 tiles below the beetle's box opening, inside its wake circle */
  ball.x = b.x; ball.y = b.y + 40; ball.vx = ball.vy = 0;
  const d0 = Math.hypot(ball.x - b.x, ball.y - b.y);
  await tick(60);
  assert.ok(b.awake, "it woke");
  const d1 = Math.hypot(ball.x - b.x, ball.y - b.y);
  assert.ok(d1 < d0 - 10 && d1 > d0 - 20, `it crept about 16 px in a second (${d0} -> ${d1})`);
});

test("pressing the clock tower's button opens every gate for good", async () => {
  const { app, tick, press } = bootApp({ prog: { v: 1, unlocked: 8, gems: new Array(12).fill(0), times: new Array(12).fill(null) } });
  await tick(8);
  await press("a");
  await tick(130);
  const ctx = app.ctx;
  assert.equal(ctx.get("level"), 8);
  assert.equal(ctx.get("solid")(9, 5), true, "a gate is shut");
  const k = ctx.get("button"), ball = ctx.get("ball");
  ball.x = k.x; ball.y = k.y;
  await tick(2);
  assert.equal(ctx.get("gatesOpen"), true);
  assert.equal(ctx.get("solid")(9, 5), false);
  /* a fall back to the start keeps them open */
  ctx.get("placeBall")();
  assert.equal(ctx.get("gatesOpen"), true);
});
