// registry/apps/zhenyao-tower: where a loss goes back to. A new game (进入小镇) must not be caught by the save of an older
// run: before this run's first save stone it goes to the title. 继续 resumes from the save on disk, and a stone of this run counts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const APP = join(ROOT, "registry", "apps", "zhenyao-tower", "index.html");
const KEYS = { up: "ArrowUp", down: "ArrowDown", a: "x" };

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
