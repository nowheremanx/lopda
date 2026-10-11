// registry/apps/zhenyao-tower: where a loss goes back to. A new game (进入小镇) must not be caught by the save of an older
// run: before this run's first save stone it goes to the title. 继续 resumes from the save on disk, and a stone of this run counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const APP = join(ROOT, "registry", "apps", "zhenyao-tower", "index.html");
const KEYS = { up: "ArrowUp", down: "ArrowDown", a: "x", b: "z", start: "Enter" };

/* a game on the title with a save on disk (the one 继续 loads), and a way to press buttons */
async function start() {
  const app = boot(APP);
  const get = app.ctx.get, KE = get("KeyboardEvent"), send = get("dispatchEvent");
  const run = async (n, pad) => {
    for (let i = 0; i < n; i++) {
      if (pad) pad(i);
      app.frame();
      await new Promise((r) => setImmediate(r));
    }
  };
  const tap = async (b) => { send(new KE("keydown", { key: KEYS[b] })); await run(3); send(new KE("keyup", { key: KEYS[b] })); await run(3); };
  await run(5);
  const save = { v: 1, map: "floor1", x: 6, y: 11, face: "up", hero: get("ZT").heroAt(1, 0), flags: { master: 1, entered: {}, opened: {}, beat: {} } };
  get("(lastSave = " + JSON.stringify(save) + ")");
  return { app, get, run, tap };
}
/* the title: A opens the menu, then pick item i */
async function pick(z, i) {
  await z.tap("a");
  for (let k = 0; k < i; k++) await z.tap("down");
  await z.tap("a");
}
/* a lost fight, with the hero where he is; A through "眼前一黑" until the scene changes */
async function lose(z) {
  z.get("afterFight({ result: 'lose', key: 'x' })");
  for (let i = 0; i < 40 && z.get("ZT").state().scene === "map"; i++) { await z.tap("a"); await z.run(20); }
  await z.run(120);
}

test("a new game that loses before its first save stone goes to the title, not to an older save", async () => {
  const z = await start();
  await pick(z, 1);                       // the menu lists 继续, 进入小镇, 演武
  await z.run(200);
  assert.equal(z.get("ZT").state().map, "town");
  await lose(z);
  assert.equal(z.get("ZT").state().scene, "title");
});

test("继续 resumes the save on disk, and a loss goes back to it", async () => {
  const z = await start();
  await pick(z, 0);
  await z.run(300);
  assert.equal(z.get("ZT").state().map, "floor1");
  /* the hero moves; a loss puts him back at the stone */
  await lose(z);
  const st = z.get("ZT").state();
  assert.equal(st.scene, "map");
  assert.equal(st.map, "floor1");
});

test("a save stone of this run is where a loss goes back to", async () => {
  const z = await start();
  await pick(z, 1);
  await z.run(200);
  /* what a stone does: doSave() writes this run's progress */
  z.get("ZT").goto("road", { entered: true });
  await z.run(120);
  z.get("doSave()");
  assert.equal(z.get("runSave.map"), "road");
  await lose(z);
  const st = z.get("ZT").state();
  assert.equal(st.scene, "map");
  assert.equal(st.map, "road");
});

/* ---------- the field menu (START on a map) ---------- */
async function onRoad() {
  const z = await start();
  await pick(z, 1);
  await z.run(200);
  z.get("ZT").goto("road", { entered: true });
  await z.run(120);
  return z;
}

test("START on a map opens the menu; a pill heals, the count falls, B closes", async () => {
  const z = await onRoad();
  assert.equal(z.get("ZT").state().scene, "map");
  z.get("me.hp = 10");
  const pills = z.get("me.items.pill");
  assert.ok(pills > 0);
  await z.tap("start");
  assert.equal(z.get("fm.kind"), "main");
  await z.tap("a");                       // 物品
  assert.equal(z.get("fm.kind"), "items");
  await z.tap("a");                       // the first item is 回春丹
  assert.equal(z.get("me.hp"), Math.min(z.get("Rules.stats(me.level).maxHp"), 10 + z.get("BATTLE.ITEMS.pill.hp")));
  assert.ok(z.get("me.hp") > 10);
  assert.equal(z.get("me.items.pill"), pills - 1);
  /* full HP: the pill is refused and kept */
  z.get("me.hp = Rules.stats(me.level).maxHp");
  await z.tap("a");
  assert.equal(z.get("me.items.pill"), pills - 1);
  await z.tap("b");
  assert.equal(z.get("fm.kind"), "main");
  await z.tap("b");
  assert.equal(z.get("fm"), null);
});

test("the menu shows the status and the hero does not walk while it is open", async () => {
  const z = await onRoad();
  const at = z.get("ZT").state();
  await z.tap("start");
  await z.tap("down");
  await z.tap("a");
  assert.equal(z.get("fm.kind"), "status");
  await z.tap("up");
  const now = z.get("ZT").state();
  assert.deepEqual([now.x, now.y], [at.x, at.y]);
  await z.tap("b");
  await z.tap("b");
  assert.equal(z.get("fm"), null);
});

test("START does nothing during a dialogue", async () => {
  const z = await onRoad();
  z.get("talk([{ say: 'hello' }])");
  await z.run(10);
  const send = z.get("dispatchEvent"), KE = z.get("KeyboardEvent");
  send(new KE("keydown", { key: "Enter" }));    // START is also OK in a dialogue: it turns the page
  await z.run(2);
  send(new KE("keyup", { key: "Enter" }));
  await z.run(30);
  assert.equal(z.get("fm"), null);
  assert.equal(z.get("busy"), false);
});

/* a cutscene seen before: A fast-forwards the motion, but every line of its dialogue is still shown (A also turns the page,
   and a skip that swallowed the dialogue lost the boss's entrance to the first press) */
test("a seen cutscene skips its motion with A but still shows every line: the boss's entrance", async () => {
  const z = await start();
  z.get("ZT").goto("top", { entered: true });
  await z.run(60);
  z.get("Cut").seen["top:boss"] = true;
  const game = z.get("game"), said = [], say = game.say;
  game.say = function (pages, o) { said.push(...pages); return say.call(this, pages, o); };
  z.get("startBoss()");
  const Battle = z.get("Battle");
  let f = 0;
  for (; f < 3000 && game.top() && game.top().enter !== Battle.scene.enter; f++) await z.run(1, () => {
    const KE = z.get("KeyboardEvent"), send = z.get("dispatchEvent");
    send(new KE(f % 6 < 3 ? "keydown" : "keyup", { key: "x" }));
  });
  assert.equal(game.top().enter, Battle.scene.enter, "the fight started");
  const want = z.get("STORY").top.boss.flatMap((p) => p.say);
  assert.deepEqual(said, want, "every line of the entrance was shown, in order");
  assert.ok(said.includes("您没有影子。"));
});
