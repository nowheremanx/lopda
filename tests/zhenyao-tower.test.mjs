// registry/apps/zhenyao-tower: the town data the game and the 3D builder both rely on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript, read } from "./helpers.mjs";

const { TOWN } = runScript("registry/apps/zhenyao-tower/src/town.js");
const at = (x, y) => TOWN.map[y] && TOWN.map[y][x];
const WALK = ".,";

test("the town map is a rectangle of known tiles", () => {
  const w = TOWN.map[0].length;
  for (const [i, row] of TOWN.map.entries()) {
    assert.equal(row.length, w, `row ${i}`);
    assert.match(row, /^[.,TLW#D]+$/, `row ${i}`);
  }
});

test("the hero, the people and the signs stand on walkable tiles", () => {
  assert.ok(WALK.includes(at(TOWN.start.x, TOWN.start.y)), "start");
  for (const p of TOWN.people) assert.ok(WALK.includes(at(p.x, p.y)), p.name);
  for (const s of TOWN.things) assert.ok(at(s.x, s.y), `${s.x},${s.y}`);
  assert.ok(TOWN.tower.y < 0, "the tower stands north of the map");
});

test("every line fits the screen: about 13 characters", () => {
  const lines = [...TOWN.people, ...TOWN.things].flatMap((p) => p.say).flatMap((s) => s.split("\n"));
  for (const l of lines) assert.ok(Array.from(l).length <= 13, l);
});

test("the title menu offers only the town and 演武; the route fights stay off screen", () => {
  const main = read("registry/apps/zhenyao-tower/src/main.js");
  const menus = [...main.matchAll(/game\.choose\((\[[^\]]*\])/g)].map((m) => JSON.parse(m[1]));
  assert.deepEqual(menus, [["进入小镇", "演武"]]);
  assert.doesNotMatch(main, /game\.scene\("trial"/);
});
