// registry/apps/paper-tower: twelve hand-built pages, the arithmetic, and two walks to the lamp.
// The walker is a careful player: take what is free, fight what blocks the way, buy what the
// purse allows, and leave the optional monsters alone. It must finish; a no-fold walk must too.
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

const TILES = /^[#. <>YBRybrhHadsSgiptwkouecvzZmnf*L%qW~]+$/;

function reach(n, opts) {
  opts = opts || {};
  const rows = D.FLOORS[n - 1].map, seen = new Set();
  let start = null;
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (rows[y][x] === "<") start = { x, y };
  seen.add(start.x + "," + start.y);
  const q = [start];
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

test("the tower is twelve rectangular pages of known tiles, with one way in and one way up", () => {
  assert.equal(D.FLOORS.length, 12);
  for (let n = 1; n <= 12; n++) {
    const f = D.FLOORS[n - 1], map = f.map;
    assert.equal(f.n, n);
    assert.equal(map.length, 11, `page ${n}`);
    for (const [y, row] of map.entries()) {
      assert.equal(row.length, 11, `page ${n} row ${y}`);
      assert.match(row, TILES, `page ${n} row ${y}`);
      assert.equal(row[0], "#"); assert.equal(row[10], "#");
    }
    assert.equal(map[0], "###########", `page ${n} top wall`);
    assert.equal(map[10], "###########", `page ${n} bottom wall`);
    assert.equal(map.join("").split("<").length - 1, 1, `page ${n} down stairs`);
    if (n < 12) assert.equal(map.join("").split(">").length - 1, 1, `page ${n} up stairs`);
    else assert.equal(map.join("").split("L").length - 1, 1, "the lamp");
  }
});

test("three zones of four pages, and only the three keepers block the way up", () => {
  for (const [n, ch] of [[4, "z"], [8, "z"], [12, "Z"]]) {
    assert.equal(D.FLOORS[n - 1].map.join("").split(ch).length - 1, 1, `page ${n}`);
    assert.ok(D.BOSSES[n], `boss ${n}`);
  }
  assert.equal(D.zoneOf(1), 0); assert.equal(D.zoneOf(4), 0);
  assert.equal(D.zoneOf(5), 1); assert.equal(D.zoneOf(8), 1);
  assert.equal(D.zoneOf(9), 2); assert.equal(D.zoneOf(12), 2);
  for (let n = 1; n <= 12; n++) {
    const z = D.zoneOf(n);
    for (const row of D.FLOORS[n - 1].map) for (const ch of row) {
      if (ch === "z" || ch === "Z") continue;
      if (D.isMonster(ch)) assert.ok(D.monsterAt(ch, z), `page ${n}: ${ch} has no zone-${z + 1} stats`);
    }
  }
});


function reachBlocked(n, blocked) {
  const rows = D.FLOORS[n - 1].map, seen = new Set();
  let start = null;
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (rows[y][x] === "<") start = { x, y };
  seen.add(start.x + "," + start.y);
  const q = [start];
  while (q.length) {
    const { x, y } = q.shift();
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx, ny = y + dy, k = nx + "," + ny;
      if (nx < 0 || ny < 0 || nx > 10 || ny > 10 || seen.has(k) || blocked.has(k)) continue;
      const ch = rows[ny][nx];
      if (ch === "#" || ch === "%") continue;
      seen.add(k); q.push({ x: nx, y: ny });
    }
  }
  return seen;
}
function upOf(n) {
  const rows = D.FLOORS[n - 1].map;
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (rows[y][x] === (n === 12 ? "L" : ">")) return x + "," + y;
}

test("the named gatekeepers sit on the only way up", () => {
  for (const [n, gate, ch] of [[1, "5,5", "i"], [2, "5,5", "p"], [6, "5,5", "w"]]) {
    const rows = D.FLOORS[n - 1].map;
    assert.equal(rows[5][5], ch, `page ${n} gate`);
    assert.ok(!reachBlocked(n, new Set([gate])).has(upOf(n)), `page ${n} gate is bypassable`);
  }
  // page 5: either lane can be opened, but not both without a bomb
  const over = new Set(["3,4", "7,4"]);
  assert.ok(reachBlocked(5, over).has(upOf(5)) === false);
  assert.ok(reachBlocked(5, new Set(["3,4"])).has(upOf(5)));
  assert.ok(reachBlocked(5, new Set(["7,4"])).has(upOf(5)));
  // page 7: the armored right lane can be avoided through the poison left lane
  assert.ok(reachBlocked(7, new Set(["9,5"])).has(upOf(7)));
});

test("every page's stairs are reachable without opening a fold", () => {
  for (let n = 1; n <= 12; n++) {
    const rows = D.FLOORS[n - 1].map;
    let goal = null;
    for (let y = 0; y < 11 && !goal; y++) for (let x = 0; x < 11 && !goal; x++) if (rows[y][x] === (n === 12 ? "L" : ">")) goal = x + "," + y;
    assert.ok(reach(n).has(goal), `page ${n}: the way up is cut off`);
  }
});

test("shops, people, springs and the three hidden wicks stand where the data says", () => {
  const shops = [2, 6, 10], npcs = [2, 5, 9], springs = [3, 7, 11];
  for (const n of shops) assert.equal(D.FLOORS[n - 1].map.join("").split("m").length - 1, 1, `shop ${n}`);
  for (const n of npcs) assert.equal(D.FLOORS[n - 1].map.join("").split("n").length - 1, 1, `person ${n}`);
  for (const n of springs) assert.equal(D.FLOORS[n - 1].map.join("").split("f").length - 1, 1, `spring ${n}`);
  for (const n of shops) assert.ok(D.SHOPS[n], `shop data ${n}`);
  for (const n of npcs) assert.ok(D.NPCS[n], `person data ${n}`);
  const wicks = [];
  for (let n = 1; n <= 12; n++) for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (D.FLOORS[n - 1].map[y][x] === "*") wicks.push({ n, x, y });
  assert.deepEqual(wicks.map((w) => w.n), [3, 7, 11]);
  for (const w of wicks) {
    assert.ok(!reach(w.n).has(w.x + "," + w.y), `wick on page ${w.n} is not hidden`);
    assert.ok(reach(w.n, { seams: true }).has(w.x + "," + w.y), `wick on page ${w.n} is sealed away`);
  }
  assert.equal(D.FLOORS[4].map.join("").split("q").length - 1, 1, "bomb");
  assert.equal(D.FLOORS[8].map.join("").split("W").length - 1, 1, "holy water");
  assert.ok(D.FLOORS[6].map.join("").includes("~"), "poison page");
});

test("every sprite the data names exists, and every shop line is sane", () => {
  const art = runScript("registry/apps/paper-tower/src/art.js", { LoGame: { sprites: (table) => table } }).PT.ART;
  for (const m of Object.values(D.MONSTERS)) assert.ok(art[m.art], m.art);
  for (const b of Object.values(D.BOSSES)) assert.ok(art[b.art], b.art);
  for (const i of Object.values(D.ITEMS)) assert.ok(art[i.art], i.art);
  for (const p of Object.values(D.NPCS)) assert.ok(art[p.art], p.art);
  for (const key of ["heroDown", "heroUp", "heroSide", "floor0", "floor2", "wall0", "wall2", "doorY", "lamp", "poison"]) assert.ok(art[key], key);
  for (const [n, shop] of Object.entries(D.SHOPS)) {
    assert.ok(shop.stock.length > 0, n);
    for (const it of shop.stock) {
      assert.ok(["atk", "def", "hp", "y", "b"].includes(it.id), `${n}: ${it.id}`);
      assert.ok(it.times > 0 && it.price > 0 && it.amount > 0, `${n}: ${it.id}`);
    }
  }
});

test("a battle is the arithmetic the forecast promises, including abilities", () => {
  const S = R.newGame();
  S.atk = 20; S.def = 10; S.hp = 100; S.hpMax = 100;
  const f = R.forecast(S, { hp: 55, atk: 30, def: 5 });
  assert.equal(f.damage, 15); assert.equal(f.hits, 4); assert.equal(f.loss, 80); assert.equal(f.win, true);
  S.hp = 80;
  assert.equal(R.forecast(S, { hp: 55, atk: 30, def: 5 }).win, false, "equal to the cost is a fall");
  assert.equal(R.forecast(S, { hp: 10, atk: 1, def: 20 }).can, false, "no damage, no fight");

  const armored = R.forecast(S, { hp: 40, atk: 20, def: 4, ability: "armor" });
  assert.equal(armored.damage, 12);
  const first = R.forecast(S, { hp: 20, atk: 30, def: 0, ability: "first" });
  assert.equal(first.loss, (30 - 10) * (Math.ceil(20 / 20) + 1));
  const pierced = R.forecast(S, { hp: 20, atk: 30, def: 0, ability: "pierce" });
  assert.equal(pierced.loss, (30 - 5) * 1);
  const drain = R.forecast(S, { hp: 40, atk: 20, def: 0, ability: "drain" });
  assert.equal(drain.hits, Math.ceil(50 / 20));
  const poison = R.forecast(S, { hp: 20, atk: 1, def: 0, ability: "poison" });
  assert.equal(poison.loss, Math.ceil(100 * 0.08));
});

test("fighting, keys, doors, stones, springs, poison and the fold change the state", () => {
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
  assert.equal(R.fight(S, "i", 7, 9).ok, false, "the tile is empty now");

  S.floor = 1; S.keys.y = 1;
  assert.equal(R.openDoor(S, 5, 4).ok, true);
  assert.equal(S.keys.y, 0); assert.equal(R.tile(S, 5, 4), ".");
  assert.equal(R.openDoor(S, 5, 4).ok, false);

  S.floor = 1; S.x = 5; S.y = 9; R.setTile(S, 5, 9, "y");
  const keys = S.keys.y;
  assert.equal(R.take(S, "y").kind, "key");
  assert.equal(S.keys.y, keys + 1); assert.equal(R.tile(S, 5, 9), ".");
  S.x = 3; S.y = 7; R.setTile(S, 3, 7, "a");
  const atk = S.atk;
  assert.equal(R.take(S, "a").amount, 3); assert.equal(S.atk, atk + 3);

  S.floor = 3;
  assert.ok(R.secrets(S).length > 0);
  const seam = R.secrets(S)[0];
  assert.equal(R.reveal(S, seam.x, seam.y), true);
  assert.equal(R.tile(S, seam.x, seam.y), ".");

  S.floor = 3; S.hp = 1;
  assert.equal(R.drink(S), true); assert.equal(S.hp, S.hpMax);
  assert.equal(R.drink(S), false);

  S.floor = 7; S.hp = 600; S.hpMax = 600;
  assert.equal(R.poison(S), 36);
  assert.equal(S.hp, 564);
});

test("bombs and holy water are carried, then spent", () => {
  const S = R.newGame();
  S.floor = 5; S.x = 2; S.y = 5; S.hp = 10; S.hpMax = 600;
  R.setTile(S, 3, 5, "i");
  S.items.bomb = 1;
  const b = R.useBomb(S, "i", 3, 5);
  assert.equal(b.ok, true); assert.equal(S.items.bomb, 0); assert.equal(R.tile(S, 3, 5), ".");
  assert.equal(R.useBomb(S, "i", 3, 5).ok, false, "no bomb left");
  S.floor = 4; S.items.bomb = 1;
  assert.equal(R.useBomb(S, "z", 5, 5).ok, false, "bosses ignore bombs");

  S.floor = 7; S.items.holy = 1; S.hp = 10;
  const before = R.secrets(S).length;
  const h = R.useHoly(S);
  assert.equal(h.ok, true); assert.equal(S.items.holy, 0); assert.equal(S.hp, S.hpMax);
  assert.equal(R.secrets(S).length, 0); assert.ok(before > 0);
});

test("shops keep their stock and raise the price with every purchase", () => {
  const S = R.newGame();
  S.floor = 2; S.gold = 1000;
  const atk = S.atk;
  assert.equal(R.price(S, 0), 15);
  const r = R.buy(S, 0);
  assert.equal(r.ok, true); assert.equal(S.atk, atk + 3); assert.equal(S.gold, 985);
  assert.equal(R.price(S, 0), 23);
  assert.equal(R.stockLeft(S, 0), 2);
  R.buy(S, 0); R.buy(S, 0);
  assert.equal(R.stockLeft(S, 0), 0);
  assert.equal(R.buy(S, 0).reason, "sold");
  assert.equal(R.buy(S, 2).ok, true);
  assert.ok(S.hpMax > 600 && S.hp > 600);
});

test("floors, stairs and saves keep their promises", () => {
  const S = R.newGame();
  assert.equal(R.nextFloor(S), true); assert.equal(S.floor, 2);
  assert.equal(S.x, R.findChar(2, "<").x); assert.equal(S.y, R.findChar(2, "<").y);
  assert.equal(R.prevFloor(S), true); assert.equal(S.floor, 1);
  assert.equal(S.x, R.findChar(1, ">").x); assert.equal(S.y, R.findChar(1, ">").y);
  const copy = R.hydrate(plain(S));
  assert.deepEqual(plain(copy), plain(S));
  assert.equal(R.hydrate({ v: 2 }), null);
});

test("three wicks make the last keeper weaker, and only there", () => {
  const S = R.newGame();
  S.floor = 12;
  const strong = R.monsterFor(S, "Z");
  S.wicks = 3;
  const soft = R.monsterFor(S, "Z");
  assert.ok(soft.weakened);
  assert.ok(soft.atk < strong.atk && soft.def < strong.def);
  S.floor = 8;
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
  const at = (x, y) => T(x, y);

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
      while (R.stockLeft(S, i) && S.gold >= R.price(S, i)) { R.buy(S, i); did = true; purchases++; }
    }
    return did;
  }
  function gain() {
    let did = false;
    const home = { x: S.x, y: S.y };
    if (useSeams) for (const p of R.secrets(S)) { R.reveal(S, p.x, p.y); did = true; }
    const reach = seen(), edge = near(reach);
    for (const k of reach) {
      const [x, y] = k.split(",").map(Number), ch = at(x, y);
      if (D.isItem(ch)) { S.x = x; S.y = y; R.take(S, ch); did = true; }
    }
    for (const k of edge) {
      const [x, y] = k.split(",").map(Number), ch = at(x, y);
      if (ch === "m") { S.x = x; S.y = y; if (buyAll()) did = true; }
    }
    for (const k of reach) {
      const [x, y] = k.split(",").map(Number);
      if (at(x, y) === "f") { S.x = x; S.y = y; if (R.drink(S)) did = true; }
    }
    for (const k of edge) {
      const [x, y] = k.split(",").map(Number), ch = at(x, y);
      if (D.isMonster(ch) || ch === "z" || ch === "Z") {
        const m = R.monsterFor(S, ch), f = R.forecast(S, m);
        if (f.can && f.win) { if (R.fight(S, ch, x, y).ok) did = true; }
        else if (S.items.bomb > 0 && m && !m.boss) { if (R.useBomb(S, ch, x, y).ok) did = true; }
      }
    }
    for (const k of edge) {
      const [x, y] = k.split(",").map(Number), ch = at(x, y);
      if (D.isDoor(ch) && R.openDoor(S, x, y).ok) did = true;
    }
    S.x = home.x; S.y = home.y;
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
  for (let step = 0; step < 200; step++) {
    let progress = false;
    for (let i = 0; i < 80; i++) { if (gain()) progress = true; else break; }
    if (S.floor === 12) {
      const open = seen();
      const lamp = [...open].some((k) => { const [x, y] = k.split(",").map(Number); return T(x, y) === "L"; });
      if (lamp) return { won: true, S, visits, log, purchases };
    }
    const open = seen();
    const up = [...open].find((k) => { const [x, y] = k.split(",").map(Number); return T(x, y) === ">"; });
    if (up && S.floor < 12) {
      S.x = +up.split(",")[0]; S.y = +up.split(",")[1];
      R.nextFloor(S); visits.push(S.floor); continue;
    }
    if (shopTrip()) continue;
    if (!progress) return { won: false, S, visits, log, purchases };
  }
  return { won: false, S, visits, log, purchases };
}

test("a careful walker climbs all twelve pages, takes the three wicks and lights the lamp", () => {
  const r = walk();
  assert.equal(r.won, true, `stopped on page ${r.S.floor} with ${r.S.hp} HP, ${r.S.atk} ATK, ${r.S.def} DEF`);
  assert.deepEqual(r.visits, Array.from({ length: 12 }, (_, i) => i + 1));
  assert.ok(r.S.wicks >= 3, `wicks ${r.S.wicks}`);
  assert.ok(r.S.kills > 5, `kills ${r.S.kills}`);
  assert.ok(r.S.hp > 0);
  assert.ok(r.purchases >= 3, `purchases ${r.purchases}`);
});

test("a player who never opens a fold can still finish", () => {
  const r = walk({ seams: false });
  assert.equal(r.won, true, `stopped on page ${r.S.floor} with ${r.S.hp} HP, ${r.S.atk} ATK, ${r.S.def} DEF`);
  assert.equal(r.S.wicks, 0);
  assert.ok(r.S.hp > 0);
});
