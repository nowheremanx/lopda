// Tests for 失联站 / Lost Deck: every deck's map is well formed and can be finished without secrets, the
// auto-player (tools/lost-deck-bot.mjs) clears the early decks through the game's own rules, the raycaster
// hits what it should, and the bundled app keeps the save rules of SPEC.md section 8.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";
import { load, playDeck } from "../tools/lost-deck-bot.mjs";

const LD = load();
const WALLS = "#PCWMKTXES", DOORS = "D123=";

test("lost-deck: every deck map is closed, its doors sit between walls, and every thing is on it", () => {
  for (const D of LD.DECKS) {
    const m = D.map, h = m.length, w = m[0].length, at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w) ? "#" : m[y][x];
    m.forEach((r, y) => assert.equal(r.length, w, `deck ${D.id} row ${y}`));
    for (let x = 0; x < w; x++) assert.ok(WALLS.includes(at(x, 0)) && WALLS.includes(at(x, h - 1)), `deck ${D.id}: border at x ${x}`);
    for (let y = 0; y < h; y++) assert.ok(WALLS.includes(at(0, y)) && WALLS.includes(at(w - 1, y)), `deck ${D.id}: border at y ${y}`);
    assert.equal(m.join("").split("@").length - 1, 1, `deck ${D.id}: one start`);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = at(x, y);
      assert.ok("#PCWMKTXDE123=S.~@cfsgnBzaAhHuovGxiklb".includes(c), `deck ${D.id}: unknown "${c}" at ${x},${y}`);
      if (!DOORS.includes(c)) continue;
      const wall = (q) => WALLS.includes(q), lr = wall(at(x - 1, y)) && wall(at(x + 1, y)), ud = wall(at(x, y - 1)) && wall(at(x, y + 1));
      assert.ok(lr !== ud, `deck ${D.id}: door at ${x},${y} must have walls on exactly one axis`);
    }
    assert.equal(D.logs.length, m.join("").split("T").length - 1, `deck ${D.id}: one log per terminal`);
    assert.ok(D.name.zh && D.name.en && D.brief.zh && D.brief.en && D.goal.zh && D.goal.en, `deck ${D.id}: text in both languages`);
  }
});

test("lost-deck: every deck can be finished without a secret, and every card, pickup and robot can be reached", () => {
  for (const D of LD.DECKS) {
    const m = D.map, at = (x, y) => (m[y] && m[y][x]) || "#";
    const start = []; m.forEach((r, y) => { const x = r.indexOf("@"); if (x >= 0) start.push(x, y); });
    const flood = (cards, secrets) => {
      const seen = new Set([start.join()]), q = [start], got = new Set(); let exit = false;
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, c = at(nx, ny), k = nx + "," + ny;
          if (seen.has(k)) continue;
          if (c === "E") { exit = true; continue; }
          if (c === "X") { got.add("="); continue; }   /* a switch, thrown from the cell beside it */
          if ("123=".includes(c) && !cards.has(c)) continue;
          if ("#PCWMKT".includes(c) || (c === "S" && !secrets)) continue;
          seen.add(k);
          if ("ikxl".includes(c)) continue;   /* columns, crates, canisters and lamps block the way */
          q.push([nx, ny]);
          if (c === "u") got.add("1"); if (c === "o") got.add("2"); if (c === "v") got.add("3");
        }
      }
      return { seen, got, exit };
    };
    let cards = new Set(), r;
    for (let i = 0; i < 4; i++) { r = flood(cards, false); cards = new Set([...cards, ...r.got]); }
    if (!D.boss) assert.ok(r.exit, `deck ${D.id}: the lift cannot be reached`);
    for (let i = 0; i < 4; i++) { r = flood(cards, true); cards = new Set([...cards, ...r.got]); }
    m.forEach((row, y) => [...row].forEach((c, x) => {
      if ("cfsgnaAhHuovGB".includes(c)) assert.ok(r.seen.has(x + "," + y), `deck ${D.id}: "${c}" at ${x},${y} cannot be reached`);
    }));
  }
});

test("lost-deck: the auto-player clears the early decks inside par", () => {
  for (const d of [0, 1, 3]) {
    const r = playDeck(d, 7919);
    assert.equal(r.end, "exit", `deck ${d + 1}: ${JSON.stringify(r)}`);
    assert.ok(r.hp > 0 && r.time < LD.DECKS[d].par, `deck ${d + 1}: ${JSON.stringify(r)}`);
  }
});

test("lost-deck: a rivet hits the first thing on its line, never through a wall or a shut door", () => {
  const D = { id: 0, face: 0, map: ["#########", "#@..c.D.c#", "#########"].map((r) => r.padEnd(10, "#")), logs: [] };
  const w = new LD.World(D, {});
  const [near, far] = w.things.filter((o) => o.kind === "foe");
  w.hitscan(0, 2);
  assert.equal(near.hp, 0);
  assert.ok(near.dead);
  w.hitscan(0, 2);
  assert.equal(far.hp, 2, "the door is shut, so the far crawler is untouched");
  w.M.open[1 * w.M.w + 6] = 1;
  w.hitscan(0, 2);
  assert.ok(far.dead, "with the door open the shot goes through");
});

test("lost-deck: a locked door needs its card; the lift ends the deck", () => {
  let locked = 0, exits = 0;
  const D = { id: 0, face: 0, map: ["#####", "#@.1E", "#####"], logs: [] };
  const w = new LD.World(D, { locked: () => locked++, exit: () => exits++ });
  assert.ok(w.tryDoor(3, 1, true));
  assert.equal(locked, 1);
  assert.equal(w.M.timer[1 * w.M.w + 3], 0, "a locked door stays shut");
  w.cards[1] = true;
  w.tryDoor(3, 1, true);
  assert.ok(w.M.timer[1 * w.M.w + 3] > 0, "with the card it opens");
  w.tryDoor(4, 1, true);
  assert.equal(exits, 1);
});

/* --- the app ---------------------------------------------------------------------------------------- */
const APP = join(ROOT, "registry/apps/lost-deck/index.html");
function fakePad(initial, failLoad) {
  const data = JSON.parse(JSON.stringify(initial || {})), listeners = {}, writes = [];
  return {
    data, writes,
    pad: {
      lang: "zh", on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }, off() {}, isDown() { return false; }, sfx() {},
      save(k, v) { writes.push(k); data[k] = JSON.parse(JSON.stringify(v)); return Promise.resolve(); },
      load(k) { return failLoad ? Promise.reject(new Error("damaged")) : Promise.resolve(k in data ? JSON.parse(JSON.stringify(data[k])) : null); },
      remove(k) { delete data[k]; }, setSchema() {}
    }
  };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
const frames = (app, n) => { for (let i = 0; i < n; i++) app.frame(); };
async function clearDeck(initial, failLoad) {
  const p = fakePad(initial, failLoad);
  const app = boot(APP, { pad: p.pad, seed: 3 });
  await settle(); frames(app, 5);
  const L = app.ctx.get("LD");
  L.dbgStart(0); frames(app, 5);
  L.dbg().hooks.exit(); frames(app, 120);
  await settle();
  return p;
}

test("lost-deck app: clearing deck 1 opens deck 2 and keeps the best time", async () => {
  const p = await clearDeck({});
  assert.equal(p.data.save.v, 1);
  assert.equal(p.data.save.unlocked, 2);
  assert.ok(p.data.save.best["1"].time > 0);
  assert.equal(p.data.save.best["1"].marks.length, 3);
});

test("lost-deck app: a save from a newer version, or one that cannot be read, is never written over", async () => {
  const newer = { save: { v: 2, unlocked: 6, best: {}, tips: {}, future: true } };
  const p = await clearDeck(newer);
  assert.deepEqual(p.data, newer);
  assert.equal(p.writes.length, 0);
  const q = await clearDeck({ save: { v: 1, unlocked: 3 } }, true);
  assert.equal(q.writes.length, 0);
});

test("lost-deck app: an older save keeps its progress when a deck is cleared", async () => {
  const p = await clearDeck({ save: { v: 1, unlocked: 4, best: { 3: { time: 99, kills: 1, foes: 2, secrets: 0, total: 1, marks: [true, false, false] } }, tips: { move: 1 } } });
  assert.equal(p.data.save.unlocked, 4);
  assert.equal(p.data.save.best["3"].time, 99);
  assert.equal(p.data.save.tips.move, 1);
});

test("lost-deck app: once the lift or the core is reached, nothing can kill you before the deck is scored", async () => {
  const p = fakePad({});
  const app = boot(APP, { pad: p.pad, seed: 5 });
  await settle(); frames(app, 5);
  const L = app.ctx.get("LD");
  L.dbgStart(0); frames(app, 5);
  const w = L.dbg();
  w.hooks.exit();
  w.hurtPlayer(500, w.P.x + 1, w.P.y);
  assert.equal(w.P.dead, false);
  frames(app, 120); await settle();
  assert.equal(p.data.save.unlocked, 2);
});
