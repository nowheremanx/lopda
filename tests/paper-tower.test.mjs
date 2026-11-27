// registry/apps/paper-tower: twelve hand-built pages, the arithmetic, and two walks to the lamp.
// The walker is a careful player: take what is free, fight what blocks the way, buy what the
// purse allows, and leave the optional monsters alone. It must finish; a no-fold walk must too.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { join } from "node:path";
import { read, runScript, ROOT } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

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


test("the guarded treasure rooms cannot be entered without beating the guard", () => {
  for (const [n, guard, loot] of [[2, "7,9", "8,8"], [4, "7,9", "8,8"], [6, "7,9", "8,8"], [9, "7,9", "8,8"]]) {
    const rows = D.FLOORS[n - 1].map;
    const gch = rows[9][7];
    assert.ok(D.isMonster(gch), `page ${n}: no guard at 7,9`);
    const lch = rows[8][8];
    assert.ok(D.isItem(lch) || D.isMonster(lch), `page ${n}: no treasure at 8,8`);
    assert.ok(!reachBlocked(n, new Set([guard])).has(loot), `page ${n}: treasure room is open without the guard`);
  }
});

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

test("every person and shop drawn on a page has data behind it", () => {
  for (let n = 1; n <= 12; n++) {
    const flat = D.FLOORS[n - 1].map.join("");
    if (flat.includes("n")) assert.ok(D.NPCS[n], `page ${n}: a person nobody can see`);
    if (flat.includes("m")) assert.ok(D.SHOPS[n], `page ${n}: a shop with no stock`);
  }
});

test("people stop pointing at things that are already gone", () => {
  const S = R.newGame();

  S.floor = 2;
  assert.ok(R.npcLines(S).some((l) => l.zh.includes("宝屋")), "the shield hint is there at first");
  S.x = 8; S.y = 8;
  assert.equal(R.take(S, "S").kind, "def");
  assert.ok(!R.npcLines(S).some((l) => l.zh.includes("宝屋")), "the shield hint goes with the shield");

  S.floor = 9;
  assert.ok(R.npcLines(S).some((l) => l.zh.includes("圣水")), "the holy water hint is there at first");
  S.x = 8; S.y = 8;
  assert.equal(R.take(S, "W").kind, "holy");
  assert.ok(!R.npcLines(S).some((l) => l.zh.includes("圣水")), "the holy water hint goes with the bottle");
  assert.ok(R.npcLines(S).some((l) => l.zh.includes("灯芯")), "the wick hint is there while wicks are missing");
  S.wicks = 3;
  assert.ok(!R.npcLines(S).some((l) => l.zh.includes("灯芯")), "the wick hint goes when all three are carried");

  S.floor = 5;
  assert.ok(R.npcLines(S).some((l) => l.zh.includes("炸弹")), "the lane advice is there while both lanes are blocked");
  R.setTile(S, 3, 4, ".");
  assert.ok(!R.npcLines(S).some((l) => l.zh.includes("炸弹")), "the lane advice goes once a lane is open");
});

test("the Folder speaks differently after the fold", () => {
  const S = R.newGame();
  S.floor = 5;
  const before = R.npcLines(S);
  assert.ok(before.some((l) => l.zh.includes("伸出手")));
  S.flags["gift:5"] = true;
  const after = R.npcLines(S);
  assert.ok(after.length > 0);
  assert.ok(!after.some((l) => l.zh.includes("伸出手")), "he no longer asks for a hand");
  assert.ok(!after.some((l) => l.zh.includes("更利的边")), "he no longer asks the question");
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

/* ---------------- the first minute and the sheets ---------------- */

/* The app in Node: a fake PAD that starts a new game, and a clock the test steps by hand. */
function bootTower(lang) {
  const on = { press: [], release: [] };
  const pad = {
    lang, spec: "lopda/1",
    on: (type, f) => { if (on[type]) on[type].push(f); },
    off() {}, isDown: () => false,
    load: () => Promise.resolve(null), save() {}, remove() {}, exit() {}, sfx() {}
  };
  const app = boot(join(ROOT, "registry/apps/paper-tower/index.html"), { pad });
  const game = app.ctx.get("game");
  const run = async (n) => { for (let i = 0; i < n; i++) { app.frame(); await app.ctx.get("__yield")(); } };
  const tap = async (b, after = 2) => {
    on.press.forEach((f) => f(b));
    await run(2);
    on.release.forEach((f) => f(b));
    await run(after);
  };
  return { app, game, run, tap };
}
/* the title, its menu, 新的一页, and the half second it fades into the play scene */
async function startPlay(t) {
  await t.run(10);
  await t.tap("a");
  await t.run(6);
  await t.tap("a");
  await t.run(90);
  return t;
}
/* a g that only records: the sheet's pages and the map's footer need no framebuffer */
function recorder(game) {
  const drawn = { dither: [], rects: [], windows: [], texts: [] };
  const g = {
    INK: 0, DARK: 1, MID: 2, PAPER: 3,
    origin() {}, clip() {}, clear() {}, frame() {}, line() {},
    rect(x, y, w, h, c) { drawn.rects.push({ x, y, w, h, c }); },
    dither(x, y, w, h) { drawn.dither.push({ x, y, w, h }); },
    window(x, y, w, h) { drawn.windows.push({ x, y, w, h }); },
    text(s, x, y) { drawn.texts.push({ s, x, y }); },
    measure: (s) => game.g.measure(s)
  };
  return { g, drawn };
}

for (const lang of ["zh", "en"]) {
  test(`the first-time intro is three short pages (${lang})`, async () => {
    const t = bootTower(lang);
    const said = [];
    const say = t.game.say;
    t.game.say = (text, o) => { said.push(text); return say.call(t.game, text, o); };
    await startPlay(t);
    assert.equal(said.length, 1, "the play scene says the intro once");
    assert.equal(t.app.ctx.get("S").flags.intro, true);
    const pages = said[0];
    assert.equal(pages.length, 3, `the intro is ${pages.length} pages`);
    for (const page of pages) {
      assert.ok(t.game.g.wrap(page, t.game.width - 16).length <= 3, `this page does not fit the dialog box: ${page}`);
    }
    assert.ok(pages.some((p) => p.includes("START") && p.includes("SELECT")), "the keys are still named");
    assert.match(pages[2], lang === "zh" ? /说明/ : /How to play/);
  });
}

test("the help sheet covers the page below the HUD and keeps its keys clear of the HUD", async () => {
  const t = await startPlay(bootTower("zh"));
  const HUD = t.app.ctx.get("HUD");
  const rec = recorder(t.game);
  const tips = ["方向键走，A 开门、说话、打怪。START 菜单，SELECT 摸身边的折缝。"];
  t.app.ctx.get("helpScene")(tips).draw(rec.g);
  assert.ok(rec.drawn.rects.some((r) => r.x === 0 && r.y === HUD && r.w === t.game.width && r.y + r.h === t.game.height && r.c === rec.g.PAPER),
    "the page below the HUD is covered with plain paper, so the floor and its banner do not show through");
  for (const r of rec.drawn.windows) assert.ok(r.y >= HUD, `a sheet window at y=${r.y} sits on the HUD`);
  const hint = rec.drawn.texts.find((d) => d.s.includes("START"));
  assert.ok(hint, "the keys are drawn");
  assert.ok(hint.y >= HUD, `the keys at y=${hint.y} sit on the HUD`);
});

for (const lang of ["zh", "en"]) {
  test(`the map page wears the same footer as the other pages (${lang})`, async () => {
    const t = await startPlay(bootTower(lang));
    const rec = recorder(t.game);
    t.app.ctx.get("mapScene")().draw(rec.g);
    const footer = lang === "zh" ? "A / B 关" : "A / B close";
    assert.ok(rec.drawn.texts.some((d) => d.s === footer), `the map's texts: ${rec.drawn.texts.map((d) => d.s).join(" | ")}`);
  });
}

/* ---------------- an unreadable save (#362) ---------------- */

test("an unreadable save: the title says so, the save sheet still answers B, and nothing is written", async () => {
  const on = { press: [], release: [] };
  let saves = 0, rejected = 0;
  const pad = {
    lang: "zh", spec: "lopda/1",
    on: (type, f) => { if (on[type]) on[type].push(f); },
    off() {}, isDown: () => false,
    load: () => { rejected++; const e = new Error("PAD.load: corrupt"); e.code = "corrupt"; return Promise.reject(e); },
    save() { saves++; }, remove() {}, exit() {}, sfx() {}
  };
  const app = boot(join(ROOT, "registry/apps/paper-tower/index.html"), { pad });
  const game = app.ctx.get("game");
  const run = async (n) => { for (let i = 0; i < n; i++) { app.frame(); await app.ctx.get("__yield")(); } };
  const tap = async (b) => { on.press.forEach((f) => f(b)); await run(2); on.release.forEach((f) => f(b)); await run(2); };
  await run(10);
  assert.ok(rejected >= 1);
  assert.equal(app.ctx.get("canSave"), false);
  const shown = [], draw = game.g.text;
  game.g.text = function (str, x, y, o) { shown.push(str); return draw.call(game.g, str, x, y, o); };
  await run(1);
  game.g.text = draw;
  assert.ok(shown.includes("存档读不出，这次不存"), "the title says the save cannot be read");

  let popped = false;
  game.push(app.ctx.get("slotsScene")("save")).then(() => { popped = true; });
  await run(4);
  await tap("a");                     /* a save over an unreadable slot is refused */
  await tap("b");
  await run(2);
  assert.ok(popped, "B leaves the save sheet");
  assert.equal(saves, 0, "nothing is written over the unreadable save");
});

/* ---------------- loading a slot over a run in progress (#363) ---------------- */

for (const lang of ["zh", "en"]) {
  test(`loading a slot asks before it replaces the run in progress, and 再想想 writes nothing (${lang})`, async () => {
    const run0 = R.newGame(), slot = R.newGame();
    run0.floor = 5; slot.floor = 2;
    const stored = { auto: plain(run0), slot1: plain(slot) };
    const on = { press: [], release: [] }, writes = [];
    const pad = {
      lang, spec: "lopda/1",
      on: (type, f) => { if (on[type]) on[type].push(f); },
      off() {}, isDown: () => false,
      load: (k) => Promise.resolve(stored[k] ? plain(stored[k]) : null),
      save(k, v) { writes.push([k, v.floor]); }, remove() {}, exit() {}, sfx() {}
    };
    const app = boot(join(ROOT, "registry/apps/paper-tower/index.html"), { pad });
    const game = app.ctx.get("game");
    const run = async (n) => { for (let i = 0; i < n; i++) { app.frame(); await app.ctx.get("__yield")(); } };
    await run(10);
    assert.ok(app.ctx.get("titleAuto"), "the title found the auto save");
    const titles = [], answers = [];
    game.choose = (items, o) => { titles.push(o && o.title); return Promise.resolve(answers.shift()); };
    game.push = () => Promise.resolve({ key: "slot1", v: R.hydrate(plain(slot)) });
    const menu = app.ctx.get("titleMenu");
    const LOAD = 2, ASK = lang === "zh" ? "当前进度会被替换" : "This replaces your run";

    answers.push(LOAD, 1);              /* 读取存档, slot 1, then 再想想 */
    await menu();
    assert.equal(titles[1], ASK);
    assert.deepEqual(writes, [], "再想想 leaves the auto save alone");

    titles.length = 0;
    answers.push(LOAD, 0);              /* the same, then 读这个存档 */
    await menu();
    assert.equal(titles[1], ASK);
    assert.deepEqual(writes, [["auto", 2]], "the slot now is the run in progress");
  });
}

test("loading a slot with no run in progress asks nothing", async () => {
  const slot = R.newGame(); slot.floor = 3;
  const on = { press: [], release: [] }, writes = [];
  const pad = {
    lang: "zh", spec: "lopda/1",
    on: (type, f) => { if (on[type]) on[type].push(f); },
    off() {}, isDown: () => false,
    load: (k) => Promise.resolve(k === "slot1" ? plain(slot) : null),
    save(k, v) { writes.push([k, v.floor]); }, remove() {}, exit() {}, sfx() {}
  };
  const app = boot(join(ROOT, "registry/apps/paper-tower/index.html"), { pad });
  const game = app.ctx.get("game");
  const run = async (n) => { for (let i = 0; i < n; i++) { app.frame(); await app.ctx.get("__yield")(); } };
  await run(10);
  const titles = [];
  game.choose = (items, o) => { titles.push(o && o.title); return Promise.resolve(1); };   /* no auto: 读取存档 is item 1 */
  game.push = () => Promise.resolve({ key: "slot1", v: R.hydrate(plain(slot)) });
  await app.ctx.get("titleMenu")();
  assert.equal(titles.length, 1, "only the title menu was shown");
  assert.deepEqual(writes, [["auto", 3]]);
});

/* ---------------- falling never heals (#366), the forecast box fits (#365), the fight's HP is readable (#364) ---------------- */
test("a fall takes a fifth of the gold and a death, and leaves the life where it was", () => {
  const S = R.newGame();
  S.floor = 4; S.hp = 5; S.gold = 100;
  const rv = R.revive(S);
  assert.equal(rv.lost, 20);
  assert.equal(S.gold, 80);
  assert.equal(S.deaths, 1);
  assert.equal(S.hp, 5, "falling is not a way to heal");
  S.gold = 0;
  R.revive(S);
  assert.equal(S.hp, 5, "not with an empty purse either");
  assert.equal(S.deaths, 2);
});

for (const lang of ["zh", "en"]) {
  test(`the forecast box grows with its text and stays on screen (${lang})`, async () => {
    const t = await startPlay(bootTower(lang));
    const S = t.app.ctx.get("S"), p = t.app.ctx.get("p"), draw = t.app.ctx.get("drawForecast");
    const g = t.game.g, VIEW_W = t.app.ctx.get("VIEW_W");
    p.dir = "down";
    for (const [ch, atk, hp] of [["k", 1, 600], ["w", 999, 1], ["e", 999, 1], ["c", 999, 1], ["o", 999, 9999], ["i", 999, 9999]]) {
      R.setTile(S, S.x, S.y + 1, ch);
      S.atk = atk; S.hp = hp; S.hpMax = Math.max(600, hp);
      const rec = recorder(t.game), texts = [];
      rec.g.text = (s, x, y) => texts.push({ s, x, y });
      draw(rec.g);
      assert.equal(rec.drawn.windows.length, 1, `${ch}: one box`);
      const box = rec.drawn.windows[0], txt = texts[0];
      assert.ok(box.x >= 0 && box.x + box.w <= VIEW_W, `${ch}: box ${box.x}..${box.x + box.w}`);
      assert.ok(txt.x > box.x && txt.x + g.measure(txt.s) <= box.x + box.w - 2, `${ch}: "${txt.s}" leaves its box`);
    }
  });
}

test("the fight's own HP number is paper on a flat ink band, not mid on the dither", async () => {
  const t = await startPlay(bootTower("en"));
  const S = t.app.ctx.get("S"), g = t.game.g;
  R.setTile(S, S.x, S.y + 1, "i");
  S.atk = 999;
  /* record the real g while the fight is on screen (pushed straight, past the first-time intro) */
  const texts = [], rects = [], text = g.text, rect = g.rect;
  g.text = function (s, x, y, o) { texts.push({ s: String(s), x, y, o: o || {} }); return text.apply(g, arguments); };
  g.rect = function (x, y, w, h, c) { rects.push({ x, y, w, h, c }); return rect.apply(g, arguments); };
  t.game.push("battle", { ch: "i", x: S.x, y: S.y + 1 });
  await t.run(20);
  g.text = text; g.rect = rect;
  const hp = texts.find((d) => /^\d+\/\d+$/.test(d.s) && d.y === 121);
  assert.ok(hp, `the fight's HP number is drawn: ${texts.map((d) => d.s).join(" | ")}`);
  assert.equal(hp.o.color, g.PAPER);
  const half = Math.ceil(g.measure(hp.s) / 2);
  assert.ok(rects.some((r) => r.c === g.INK && r.y <= hp.y && r.y + r.h >= hp.y + 14 && r.x <= hp.x - half && r.x + r.w >= hp.x + half),
    "on an ink band as wide as the number");
});

test("the walker spends its purse at page 10 and still cannot empty the gold shop; what is left is earned above it (#370)", () => {
  const spent = [];
  const nf = R.nextFloor;
  R.nextFloor = function (S) { if (S.floor === 10) spent.push(S.gold); return nf.apply(this, arguments); };
  try {
    for (const o of [{}, { seams: false }]) {
      const r = walk(o), S = r.S;
      S.floor = 10;
      const left = D.SHOPS[10].stock.reduce((a, _, i) => a + R.stockLeft(S, i), 0);
      assert.ok(left > 0, `${JSON.stringify(o)}: the gold shop was emptied`);
    }
    assert.ok(spent.every((g) => g < 200), `gold on leaving page 10: ${spent}`);
  } finally { R.nextFloor = nf; }
});

for (const [wicks, line] of [[3, /三根灯芯一起点着了/], [1, /你带来的灯芯点着了/], [0, /火柴/]]) {
  test(`the lamp's second line matches the ${wicks} wick(s) carried (#367)`, async () => {
    const t = bootTower("zh");
    const said = [], say = t.game.say;
    t.game.say = (text, o) => { said.push(text); return say.call(t.game, text, o); };
    await startPlay(t);
    t.app.ctx.get("S").wicks = wicks;
    said.length = 0;
    t.game.go("ending", null, { fade: false });
    await t.run(5);
    assert.match(said[0][1], line);
    if (wicks < 3) assert.doesNotMatch(said[0][1], /三根/);
  });
}
