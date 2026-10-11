// registry/apps/zhenyao-tower: the per-frame budget of docs/decisions.md 12.2. The heaviest scenes are played
// by script (tests/zhenyao-play.js) and every frame's triangles and point lights must stay within it.
// Counts only: they are the same on every machine. Frame times are measured by tests/zhenyao-perf.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

/* decisions.md 12.2: triangles drawn (R.stats.tris, faces turned to the camera) and point lights given (R.lights) */
const BUDGET = { tris: 4500, lights: 14 };
const APP = join(ROOT, "registry", "apps", "zhenyao-tower", "index.html");

async function play(name) {
  const app = boot(APP, { extra: [join(ROOT, "tests", "zhenyao-play.js")] });
  const frames = [];
  await app.ctx.get("PLAY").run(name, (f) => frames.push(f));
  return { frames, get: app.ctx.get };
}
function within(frames) {
  const worst = (k) => frames.reduce((a, f) => (f[k] > a[k] ? f : a));
  const t = worst("tris"), l = worst("lights");
  assert.ok(t.tris <= BUDGET.tris, `frame ${t.f}: ${t.tris} triangles, budget ${BUDGET.tris}`);
  assert.ok(l.lights <= BUDGET.lights, `frame ${l.f}: ${l.lights} point lights, budget ${BUDGET.lights}`);
  return { tris: t.tris, lights: l.lights };
}

test("budget: the town, from the title menu through the intro to the north edge", async () => {
  const { frames, get } = await play("town");
  assert.ok(frames.length > 600);
  assert.ok(get("hero").r <= 1, "the walk reached the road north of the square");
  within(frames);
});

test("budget: the title, one whole turn of the camera round the tower", async () => {
  const { frames } = await play("titleTurn");
  assert.equal(frames.length, 3200);
  within(frames);
});

test("budget: 七级浮屠 from the cast to the next menu", async () => {
  const { frames, get } = await play("pagoda");
  assert.ok(frames.length > 300, "the whole animation was played");
  assert.ok(get("Battle").S().b.foes[0].hp < 420, "it hit the boss");
  within(frames);
});

test("budget: the boss fight", async () => {
  const { frames } = await play("boss");
  assert.ok(frames.length >= 3000);
  within(frames);
});

test("budget: a fight in the rain on the mountain road", async () => {
  const { frames, get } = await play("rain");
  assert.ok(frames.length >= 600);
  assert.equal(get("Battle").S().area, "road");
  within(frames);
});

/* the maps after the town, walked from their start to the gate, the stairs or the boss row, every fight on the way played
   (ZT.goto starts as a player arriving: earlier maps' enemies beaten, chests opened) */
for (const [id, to] of [["road", "floor1"], ["floor1", "floor2"], ["floor2", "top"], ["top", "top"]]) {
  test(`budget: the ${id} map, walked to its ${id === "top" ? "boss row" : "exit"} with its fights`, async () => {
    const { frames, get } = await play(id);
    assert.ok(frames.length > (id === "top" ? 600 : 1500));
    const st = get("ZT").state();
    assert.equal(st.map, to, "reached " + (id === "top" ? "the boss fight on the top" : "the next map"));
    if (id === "top") assert.ok(get("Battle").S().b.boss, "the boss fight began");
    within(frames);
  });
}

/* phase 2: the cutscenes, each from where the game starts it (src/main.js startBoss, afterBoss, ending), with A through every dialogue.
   The title, which the ending ends on, is its own scene: from the title on, frames are not counted here */
test("budget: the boss's entrance on the roof, from the boss row to the fight's first menu", async () => {
  const { frames, get } = await play("bossEntrance");
  assert.ok(frames.length > 600, "the whole entrance was played");
  assert.ok(get("Battle").S().b.boss, "the boss fight began");
  within(frames);
});

test("budget: the pendant scene, from the won fight to the dawn at the tower's gate", async () => {
  const { frames, get } = await play("pendant");
  assert.ok(frames.length > 400);
  assert.equal(get("ZT").state().map, "ending");
  assert.ok(get("ZT").state().hero.hp === get("Rules").stats(get("ZT").state().hero.level).maxHp, "the pendant healed the hero");
  within(frames);
});

test("budget: the ending, with the hand close-up, 序章 完, the credits and 待续", async () => {
  const { frames, get } = await play("ending");
  assert.ok(frames.length > 1200);
  const st = get("ZT").state();
  assert.ok(st.ended && st.cleared, "the end card was shown and the game is marked as cleared");
  assert.equal(st.scene, "title", "A after 待续 goes back to the title");
  within(frames);
});

/* the whole game by key events only, from 进入小镇 to 序章 完: about 45 s in Node */
test("budget: a scripted player plays the whole game, from a new game to 序章 完", { timeout: 240000 }, async () => {
  const { frames, get } = await play("full");
  const st = get("ZT").state();
  assert.ok(st.ended, "reached 序章 完");
  assert.ok(st.cleared);
  assert.ok(frames.length > 8000, "the whole game was played: " + frames.length + " frames");
  assert.ok(st.hero.level >= 7, "the boss's pendant, the master and every enemy on the way");
  for (const id of ["road", "floor1", "floor2", "top"]) assert.ok(st.flags.entered[id], id);
  assert.ok(st.flags.beat["top:B"], "the boss was beaten");
  within(frames);
});
