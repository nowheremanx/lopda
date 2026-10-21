// registry/apps/paper-tower: the tower data, the arithmetic and a full walk up the tower.
// The walker is deliberately simple: take what is reachable, fight what it can survive, buy
// from any shop it can still afford, reveal the folds, then take the next stairs. If that path
// wins, a player who explores has a way up; the numbers are checked here, not in the browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read, runScript } from "./helpers.mjs";

const ctx = vm.createContext({ console });
vm.runInContext(read("registry/apps/paper-tower/src/data.js"), ctx);
vm.runInContext(read("registry/apps/paper-tower/src/rules.js"), ctx);
const { PT } = ctx;
const D = PT.DATA, R = PT.RULES;
const plain = (x) => JSON.parse(JSON.stringify(x));

const CHARS = new Set("#. <>YBRybrhHadsSgiptwkouecvzZmnf*L%".split(""));
const TILES = /^[#. <>YBRybrhHadsSgiptwkouecvzZmnf*L%]+$/;

function reach(n, opts) {
  opts = opts || {};
  const rows = D.FLOORS[n - 1].map, W = 11, H = 11;
  let start = null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rows[y][x] === "<") start = { x, y };
  const seen = new Set([start.x + "," + start.y]), q = [start];
  while (q.length) {
    const { x, y } = q.shift();
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx, ny = y + dy, k = nx + "," + ny;
      if (nx < 0 || ny < 0 || nx > 10 || ny > 10 || seen.has(k)) continue;
      const ch = rows[ny][nx];
      if (ch === "#" || (ch === "%" && !opts.seams)) continue;
      seen.add(k); q.push({ x: nx, y: ny });
    }
  }
  return seen;
}

test("the tower is 50 rectangular pages of known tiles, with one way in and one way up", () => {
  assert.equal(D.FLOORS.length, 50);
  for (let n = 1; n <= 50; n++) {
    const f = D.FLOORS[n - 1], map = f.map;
    assert.equal(f.n, n);
    assert.equal(map.length, 11, `page ${n}`);
    for (const [y, row] of map.entries()) {
      assert.equal(row.length, 11, `page ${n} row ${y}`);
      assert.match(row, TILES, `page ${n} row ${y}`);
      assert.equal(row[0], "#"); assert.equal(row[10], "#");
      for (const ch of row) assert.ok(CHARS.has(ch), `page ${n}: ${ch}`);
    }
    assert.equal(map[0], "###########", `page ${n} top wall`);
    assert.equal(map[10], "###########", `page ${n} bottom wall`);
    assert.equal(map.join("").split("<").length - 1, 1, `page ${n} down stairs`);
    if (n < 50) assert.equal(map.join("").split(">").length - 1, 1, `page ${n} up stairs`);
    else assert.equal(map.join("").split("L").length - 1, 1, "the lamp");
  }
});

test("the boss stands on the only way to the next zone's page", () => {
  for (const [n, ch] of [[10, "z"], [20, "z"], [30, "z"], [40, "z"], [50, "Z"]]) {
    assert.equal(D.FLOORS[n - 1].map.join("").split(ch).length - 1, 1, `page ${n}`);
    assert.ok(D.BOSSES[n], `boss ${n}`);
  }
  for (let n = 1; n <= 50; n++) {
    const z = D.zoneOf(n);
    for (const row of D.FLOORS[n - 1].map) for (const ch of row) {
      if (ch === "z" || ch === "Z") continue;
      if (D.isMonster(ch)) assert.ok(D.monsterAt(ch, z), `page ${n}: ${ch} has no zone-${z + 1} stats`);
    }
  }
  assert.equal(D.zoneOf(1), 0); assert.equal(D.zoneOf(10), 0);
  assert.equal(D.zoneOf(11), 1); assert.equal(D.zoneOf(20), 1);
  assert.equal(D.zoneOf(21), 2); assert.equal(D.zoneOf(40), 3); assert.equal(D.zoneOf(41), 4); assert.equal(D.zoneOf(50), 4);
});

test("every page's stairs are reachable without opening a fold", () => {
  for (let n = 1; n <= 50; n++) {
    const s = reach(n), rows = D.FLOORS[n - 1].map;
    let goal = null;
    for (let y = 0; y < 11 && !goal; y++) for (let x = 0; x < 11 && !goal; x++) if (rows[y][x] === (n === 50 ? "L" : ">")) goal = x + "," + y;
    assert.ok(s.has(goal), `page ${n}: the way up is cut off`);
  }
});

test("shops, people and fountains stand where the data says, and the five wicks are behind folds", () => {
  const shops = [5, 15, 25, 35, 45], npcs = [3, 13, 23, 33, 43], fountains = [2, 8, 12, 18, 22, 28, 32, 38, 42, 48];
  for (const n of shops) assert.equal(D.FLOORS[n - 1].map.join("").split("m").length - 1, 1, `shop ${n}`);
  for (const n of npcs) assert.equal(D.FLOORS[n - 1].map.join("").split("n").length - 1, 1, `person ${n}`);
  for (const n of fountains) assert.equal(D.FLOORS[n - 1].map.join("").split("f").length - 1, 1, `spring ${n}`);
  for (const n of shops) assert.ok(D.SHOPS[n], `shop data ${n}`);
  for (const n of npcs) assert.ok(D.NPCS[n], `person data ${n}`);
  const wicks = [];
  for (let n = 1; n <= 50; n++) for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (D.FLOORS[n - 1].map[y][x] === "*") wicks.push({ n, x, y });
  assert.deepEqual(wicks.map((w) => w.n), [7, 17, 27, 37, 47]);
  for (const w of wicks) {
    const closed = reach(w.n), open = reach(w.n, { seams: true });
    assert.ok(!closed.has(w.x + "," + w.y), `wick on page ${w.n} is not hidden`);
    assert.ok(open.has(w.x + "," + w.y), `wick on page ${w.n} cannot be reached through the fold`);
  }
});

test("every sprite the data names exists, and every shop line is sane", () => {
  const art = runScript("registry/apps/paper-tower/src/art.js", { LoGame: { sprites: (table) => table } }).PT.ART;
  for (const m of Object.values(D.MONSTERS)) assert.ok(art[m.art], m.art);
  for (const b of Object.values(D.BOSSES)) assert.ok(art[b.art], b.art);
  for (const i of Object.values(D.ITEMS)) assert.ok(art[i.art], i.art);
  for (const p of Object.values(D.NPCS)) assert.ok(art[p.art], p.art);
  for (const key of ["heroDown", "heroUp", "heroSide", "floor0", "floor4", "wall0", "wall4", "doorY", "lamp", "lord", "ferryman"]) assert.ok(art[key], key);
  for (const [n, shop] of Object.entries(D.SHOPS)) {
    assert.ok(shop.stock.length > 0, n);
    for (const it of shop.stock) {
      assert.ok(["atk", "def", "hp", "y", "b", "r"].includes(it.id), `${n}: ${it.id}`);
      assert.ok(it.times > 0 && it.price > 0 && it.amount > 0, `${n}: ${it.id}`);
    }
  }
});

test("a battle is the arithmetic the forecast promises", () => {
  const S = R.newGame();
  S.atk = 20; S.def = 10; S.hp = 100;
  const m = { hp: 55, atk: 30, def: 5 };
  const f = R.forecast(S, m);
  assert.equal(f.damage, 15);
  assert.equal(f.hits, 4);
  assert.equal(f.loss, 80);
  assert.equal(f.win, true);
  S.hp = 80;
  assert.equal(R.forecast(S, m).win, false, "equal to the cost is a fall, not a win");
  S.hp = 100;
  assert.equal(R.forecast(S, { hp: 10, atk: 1, def: 20 }).can, false, "no damage, no fight");
});

test("fighting, keys, doors, stones, springs and the fold change the state", () => {
  const S = R.newGame();
  assert.equal(S.floor, 1);
  S.atk = 20; S.def = 10; S.hp = 100;
  R.setTile(S, 7, 9, "i");
  const hp0 = S.hp, gold0 = S.gold, kills0 = S.kills;
  const win = R.fight(S, "i", 7, 9);
  assert.equal(win.ok, true);
  assert.equal(S.hp, hp0 - 36);
  assert.equal(S.gold, gold0 + 7);
  assert.equal(S.kills, kills0 + 1);
  assert.equal(R.tile(S, 7, 9), ".");
  const before = S.hp;
  assert.equal(R.fight(S, "i", 7, 9).ok, false, "the tile is empty now");
  assert.equal(S.hp, before);

  S.floor = 1; S.keys.y = 1;
  assert.equal(R.openDoor(S, 5, 5).ok, true);
  assert.equal(S.keys.y, 0);
  assert.equal(R.tile(S, 5, 5), ".");
  assert.equal(R.openDoor(S, 5, 5).ok, false);

  S.floor = 1; S.x = 8; S.y = 8; R.setTile(S, 8, 8, "y");
  const keys = S.keys.y;
  const got = R.take(S, "y");
  assert.equal(got.kind, "key"); assert.equal(S.keys.y, keys + 1); assert.equal(R.tile(S, 8, 8), ".");
  S.x = 5; S.y = 2; R.setTile(S, 5, 2, "a");
  const atk = S.atk;
  assert.equal(R.take(S, "a").amount, 3); assert.equal(S.atk, atk + 3);

  S.floor = 7;
  assert.ok(R.secrets(S).length > 0);
  const seam = R.secrets(S)[0];
  assert.equal(R.reveal(S, seam.x, seam.y), true);
  assert.equal(R.tile(S, seam.x, seam.y), ".");

  S.floor = 2; S.hp = 1;
  assert.equal(R.drink(S), true);
  assert.equal(S.hp, S.hpMax);
  assert.equal(R.drink(S), false);

  S.floor = 10; S.hp = 1; S.gold = 100;
  const rv = R.revive(S), down = R.findChar(10, "<");
  assert.equal(rv.x, down.x); assert.equal(rv.y, down.y);
  assert.equal(S.gold, 80); assert.equal(S.hp, S.hpMax); assert.equal(S.deaths, 1);
});

test("shops keep their stock per page, and the last purchase cannot repeat", () => {
  const S = R.newGame();
  S.floor = 5; S.gold = 1000;
  const atk = S.atk;
  const r = R.buy(S, 0);
  assert.equal(r.ok, true);
  assert.equal(S.atk, atk + 3);
  assert.equal(S.gold, 985);
  assert.equal(R.stockLeft(S, 0), 5);
  for (let i = 0; i < 10; i++) R.buy(S, 0);
  assert.equal(R.stockLeft(S, 0), 0);
  assert.equal(R.buy(S, 0).reason, "sold");
  const gold = S.gold;
  assert.equal(R.buy(S, 2).ok, true);
  assert.ok(S.gold < gold);
  assert.ok(S.hpMax > 1000 && S.hp > 1000);
});

test("floors, the five folds, the lamp and saves keep their promises", () => {
  const S = R.newGame();
  assert.equal(R.nextFloor(S), true);
  assert.equal(S.floor, 2);
  assert.equal(S.x, R.findChar(2, "<").x); assert.equal(S.y, R.findChar(2, "<").y);
  assert.equal(R.prevFloor(S), true);
  assert.equal(S.x, R.findChar(1, ">").x); assert.equal(S.y, R.findChar(1, ">").y);
  assert.ok(S.visited["1"] && S.visited["2"]);
  assert.equal(R.travelTargets(S).length, 0);
  S.visited["11"] = true; S.floor = 12;
  assert.deepEqual(plain(R.travelTargets(S)), [1, 11]);
  assert.equal(R.travel(S, 11), true);
  assert.equal(S.floor, 11);
  assert.equal(R.travel(S, 21), false);
  const copy = R.hydrate(plain(S));
  assert.deepEqual(plain(copy), plain(S));
  assert.equal(R.hydrate({ v: 999 }), null);
});

test("five wicks make the last keeper weaker, and only there", () => {
  const S = R.newGame();
  S.floor = 50;
  const strong = R.monsterFor(S, "Z");
  S.wicks = 5;
  const soft = R.monsterFor(S, "Z");
  assert.ok(soft.weakened);
  assert.ok(soft.atk < strong.atk && soft.def < strong.def);
  S.floor = 40;
  assert.equal(R.monsterFor(S, "Z"), null);
  assert.ok(R.monsterFor(S, "z"));
});

test("all music is original, parses and fits the chip's limit", () => {
  const chip = runScript("runtime/chip.js", {}).LopdaChip;
  const music = runScript("registry/apps/paper-tower/src/music.js").PT.MUSIC;
  const songs = [music.title, music.battle, music.boss, music.ending].concat(music.zone);
  for (const [i, song] of songs.entries()) {
    const r = chip.parse(song);
    assert.equal(r.error, undefined, `song ${i}: ${r.error}`);
    assert.ok(r.song.seconds > 5, `song ${i} is too short`);
    const chars = (song.p1 || "").length + (song.p2 || "").length + (song.tri || "").length + (song.noise || "").length;
    assert.ok(chars <= 8192, `song ${i}: ${chars}`);
  }
});

/* ---------------- the walker ---------------- */
function walk(opt) {
  opt = opt || {};
  const useSeams = opt.seams !== false;
  const S = R.newGame();
  const visits = [1], log = [];
  let purchases = 0;
  const T = (x, y) => R.tile(S, x, y);
  const at2 = (x, y) => T(x, y);

  function seen() {
    const out = new Set([S.x + "," + S.y]), q = [[S.x, S.y]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, k = nx + "," + ny;
        if (nx < 0 || ny < 0 || nx > 10 || ny > 10 || out.has(k)) continue;
        if (R.walkable(S, nx, ny)) { out.add(k); q.push([nx, ny]); }
      }
    }
    return out;
  }
  function near(set) {
    const out = new Set();
    for (const k of set) {
      const [x, y] = k.split(",").map(Number);
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < 11 && ny < 11) out.add(nx + "," + ny);
      }
    }
    return out;
  }
  function buyAll() {
    const shop = D.SHOPS[S.floor];
    if (!shop) return false;
    let did = false;
    for (const i of [0, 1, 2, 3, 4, 5]) {
      if (!shop.stock[i]) continue;
      while (R.stockLeft(S, i) && S.gold >= shop.stock[i].price) { R.buy(S, i); did = true; purchases++; }
    }
    return did;
  }
  function gain() {
    let did = false;
    if (useSeams) for (const p of R.secrets(S)) { R.reveal(S, p.x, p.y); did = true; }
    const here = { x: S.x, y: S.y };
    const reach = seen(), edge = near(reach);
    for (const k of reach) {
      const [x, y] = k.split(",").map(Number), ch = at2(x, y);
      if (D.isItem(ch)) { S.x = x; S.y = y; R.take(S, ch); did = true; }
    }
    for (const k of edge) {
      const [x, y] = k.split(",").map(Number), ch = at2(x, y);
      if (ch === "m") { S.x = x; S.y = y; if (buyAll()) did = true; }
    }
    for (const k of reach) {
      const [x, y] = k.split(",").map(Number);
      if (at2(x, y) === "f") { S.x = x; S.y = y; if (R.drink(S)) did = true; }
    }
    for (const k of edge) {
      const [x, y] = k.split(",").map(Number), ch = at2(x, y);
      if (D.isMonster(ch) || ch === "z" || ch === "Z") {
        const m = R.monsterFor(S, ch), f = R.forecast(S, m);
        if (f.can && f.win) { if (R.fight(S, ch, x, y).ok) did = true; }
      }
    }
    for (const k of edge) {
      const [x, y] = k.split(",").map(Number), ch = at2(x, y);
      if (D.isDoor(ch) && R.openDoor(S, x, y).ok) did = true;
    }
    S.x = here.x; S.y = here.y;
    return did;
  }
  function shopTrip() {
    for (let f = S.floor; f >= 1; f--) {
      if (!D.SHOPS[f]) continue;
      const save = { floor: S.floor, x: S.x, y: S.y };
      S.floor = f; const p = R.findChar(f, "<"); S.x = p.x; S.y = p.y;
      const did = buyAll();
      S.floor = save.floor; S.x = save.x; S.y = save.y;
      if (did) { log.push({ at: save.floor, shop: f, gold: S.gold }); return true; }
    }
    return false;
  }
  for (let step = 0; step < 400; step++) {
    let progress = false;
    for (let i = 0; i < 80; i++) { if (gain()) progress = true; else break; }
    if (S.floor === 50) {
      const open = seen();
      const lamp = [...open].some((k) => { const [x, y] = k.split(",").map(Number); return T(x, y) === "L"; });
      if (lamp) return { won: true, S, visits, log, purchases };
    }
    const open = seen();
    const up = [...open].find((k) => { const [x, y] = k.split(",").map(Number); return T(x, y) === ">"; });
    if (up && S.floor < 50) {
      S.x = +up.split(",")[0]; S.y = +up.split(",")[1];
      R.nextFloor(S); visits.push(S.floor); continue;
    }
    if (shopTrip()) continue;
    if (!progress) return { won: false, S, visits, log, purchases };
  }
  return { won: false, S, visits, log, purchases };
}

test("a greedy walker climbs all 50 pages, takes the five wicks and lights the lamp", () => {
  const r = walk();
  assert.equal(r.won, true, `stopped on page ${r.S.floor} with ${r.S.hp} HP, ${r.S.atk} ATK, ${r.S.def} DEF`);
  assert.deepEqual(r.visits, Array.from({ length: 50 }, (_, i) => i + 1));
  assert.ok(r.S.wicks >= 5, `wicks ${r.S.wicks}`);
  assert.ok(r.S.kills > 150, `kills ${r.S.kills}`);
  assert.ok(r.S.hp > 0);
  assert.ok(r.purchases >= 30, `the walker made ${r.purchases} purchases`);
});

test("a player who never opens a fold can still finish, without the five wicks", () => {
  const r = walk({ seams: false });
  assert.equal(r.won, true, `stopped on page ${r.S.floor} with ${r.S.hp} HP, ${r.S.atk} ATK, ${r.S.def} DEF`);
  assert.equal(r.S.wicks, 0);
  assert.ok(r.S.hp > 0);
});
