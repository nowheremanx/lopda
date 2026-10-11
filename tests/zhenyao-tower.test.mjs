// registry/apps/zhenyao-tower: the town data the game and the 3D builder both rely on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript, read } from "./helpers.mjs";

const { TOWN } = runScript("registry/apps/zhenyao-tower/src/town.js");
/* plain copies: values made inside a vm context have another Object.prototype, which deepEqual notices */
const plain = (x) => JSON.parse(JSON.stringify(x));
const STORY = plain(runScript("registry/apps/zhenyao-tower/src/story.js").STORY);
const BATTLE = plain(runScript("registry/apps/zhenyao-tower/src/battle-data.js").BATTLE);
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

test("the title menu is 继续 (only with a save), 进入小镇 and 演武; the route fights stay off screen", () => {
  const main = read("registry/apps/zhenyao-tower/src/main.js");
  const menus = [...main.matchAll(/\[(?:"[^"]*",? ?)+\]/g)].map((m) => JSON.parse(m[0])).filter((a) => a.includes("演武"));
  assert.deepEqual(menus, [["继续", "进入小镇", "演武"], ["进入小镇", "演武"]]);
  assert.doesNotMatch(main, /game\.scene\("trial"/);
});

/* ---------- the story and its maps (src/story.js) ---------- */
const MAPS = ["road", "floor1", "floor2", "top"];
const GLYPHS = /^[.,TRXLFPG$CM^v1-5BN]+$/;
const FREE = ".,";

test("every line of the story is at most 13 characters", () => {
  const lines = [];
  const walk = (v, key) => {
    if (key === "map") return;
    if (typeof v === "string") lines.push(...v.split("\n"));
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(STORY);
  assert.ok(lines.length > 100);
  for (const l of lines) assert.ok(Array.from(l).length <= 13, l);
});

test("every story map is a rectangle of known tiles, with its start on a free tile", () => {
  for (const id of MAPS) {
    const m = STORY[id], w = m.map[0].length;
    for (const [i, row] of m.map.entries()) {
      assert.equal(row.length, w, `${id} row ${i}`);
      assert.match(row, GLYPHS, `${id} row ${i}`);
    }
    assert.ok(FREE.includes(m.map[m.start.y][m.start.x]), `${id} start`);
    assert.ok(["road", "tower", "roof"].includes(m.kind), id);
    assert.equal(m.map.join("").split("N").length - 1, (m.people || []).length, `${id}: one entry in people per N`);
  }
});

const tiles = (m, ch) => m.map.flatMap((row, r) => [...row].map((c, x) => (ch(c) ? { x, y: r, c } : null)).filter(Boolean));

test("chests: one entry per C, and each part's chests hold what BATTLE.ROUTE says is found there", () => {
  for (const id of MAPS) {
    const m = STORY[id];
    assert.equal(tiles(m, (c) => c === "C").length, m.chests.length, id);
    const got = {};
    for (const it of m.chests) { assert.ok(BATTLE.ITEMS[it], `${id}: ${it}`); got[it] = (got[it] || 0) + 1; }
    assert.deepEqual(got, BATTLE.ROUTE[m.part].found, id);
  }
});

test("enemies: the digits are exactly 1..n of the part's fights (the boss is its only fight)", () => {
  for (const id of MAPS) {
    const m = STORY[id], fights = BATTLE.ROUTE[m.part].fights.length;
    const digits = tiles(m, (c) => c >= "1" && c <= "5").map((t) => +t.c).sort();
    const boss = tiles(m, (c) => c === "B").length;
    if (boss) { assert.equal(id, "top"); assert.equal(boss, 1); assert.deepEqual(digits, []); assert.equal(fights, 1); }
    else assert.deepEqual(digits, Array.from({ length: fights }, (_, i) => i + 1), id);
  }
});

/* walking within one tile of an enemy (diagonals too) starts its fight. With fights 1..k-1 won: what the hero can reach
   without starting a fight, which fights he can start from there, and whether the exit is in reach */
function reach(m, won) {
  const rows = m.map, H = rows.length, W = rows[0].length;
  const foes = tiles(m, (c) => c >= "1" && c <= "5").filter((t) => !won.has(+t.c));
  const near = (f, x, y) => Math.max(Math.abs(f.x - x), Math.abs(f.y - y)) <= 1;
  const solid = (x, y) => !(x >= 0 && y >= 0 && x < W && y < H) || !(FREE.includes(rows[y][x]) || (rows[y][x] >= "1" && rows[y][x] <= "5" && won.has(+rows[y][x])));
  const seen = new Set([m.start.x + "," + m.start.y]), q = [[m.start.x, m.start.y]], starts = new Set();
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy, k = nx + "," + ny;
      if (solid(nx, ny)) continue;
      const hit = foes.filter((f) => near(f, nx, ny));
      if (hit.length) { hit.forEach((f) => starts.add(+f.c)); continue; }
      if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); }
    }
  }
  const next = (t) => [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => seen.has(t.x + dx + "," + (t.y + dy)));
  const exit = m.bossRow != null ? [...seen].some((k) => +k.split(",")[1] <= m.bossRow) : tiles(m, (c) => c === "G" || c === "^").some(next);
  return { seen, starts: [...starts].sort(), exit, next };
}

test("enemies come in order, and the stone and the chests are in reach before the first fight", () => {
  for (const id of MAPS) {
    const m = STORY[id], n = BATTLE.ROUTE[m.part].fights.length;
    if (id === "top") {
      const r = reach(m, new Set());
      assert.ok(r.exit, "the boss row is in reach");
    } else {
      for (let k = 1; k <= n; k++) {
        const r = reach(m, new Set(Array.from({ length: k - 1 }, (_, i) => i + 1)));
        assert.deepEqual(r.starts, [k], `${id}: with fights 1..${k - 1} won, only fight ${k} can be started`);
        assert.equal(r.exit, false, `${id}: the exit is shut until fight ${k} is won`);
      }
      assert.equal(reach(m, new Set(Array.from({ length: n }, (_, i) => i + 1))).exit, true, `${id}: the exit opens when all are won`);
    }
    const first = reach(m, new Set());
    for (const t of tiles(m, (c) => c === "$" || c === "C")) assert.ok(first.next(t), `${id}: ${t.c} at ${t.x},${t.y} is reachable before the first fight`);
  }
});

test("the first-time words and the places of every map exist", () => {
  for (const id of MAPS) assert.ok(STORY.places[id], id);
  for (const id of ["road", "floor1", "floor2", "top"]) assert.ok(STORY[id].enter.length, `${id} enter`);
  assert.ok(STORY.road.gate && STORY.road.south && STORY.floor2.mural && STORY.top.boss);
  assert.ok(STORY.town.master.length && STORY.town.intro.length);
});
