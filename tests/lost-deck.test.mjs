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
    const flood = (cards, secrets, ban) => {
      const seen = new Set([start.join()]), q = [start], got = new Set(); let exit = false;
      while (q.length) {
        const [x, y] = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, c = at(nx, ny), k = nx + "," + ny;
          if (seen.has(k)) continue;
          if (c === "E") { exit = true; continue; }
          if (c === "X") { if (ban !== "=") got.add("="); continue; }   /* a switch, thrown from the cell beside it */
          if ("123=".includes(c) && !cards.has(c)) continue;
          if ("#PCWMKT".includes(c) || (c === "S" && !secrets)) continue;
          seen.add(k);
          if ("ikxl".includes(c)) continue;   /* columns, crates, canisters and lamps block the way */
          q.push([nx, ny]);
          const card = { u: "1", o: "2", v: "3" }[c]; if (card && card !== ban) got.add(card);
        }
      }
      return { seen, got, exit };
    };
    let cards = new Set(), r;
    for (let i = 0; i < 4; i++) { r = flood(cards, false); cards = new Set([...cards, ...r.got]); }
    if (!D.boss) assert.ok(r.exit, `deck ${D.id}: the lift cannot be reached`);
    /* every card and switch on a deck is needed: without it the lift stays shut, secrets or not */
    /* (a switch with no shutter, on the dark deck, only brings the lights back) */
    if (!D.boss) for (const key of r.got) {
      if (key === "=" && !m.some((row) => row.includes("="))) continue;
      let held = new Set(), f;
      for (let i = 0; i < 4; i++) { f = flood(held, true, key); held = new Set([...held, ...f.got]); }
      assert.ok(!f.exit, `deck ${D.id}: the lift can be reached without "${key}"`);
    }
    for (let i = 0; i < 4; i++) { r = flood(cards, true); cards = new Set([...cards, ...r.got]); }
    m.forEach((row, y) => [...row].forEach((c, x) => {
      if ("cfsgnaAhHuovGB".includes(c)) assert.ok(r.seen.has(x + "," + y), `deck ${D.id}: "${c}" at ${x},${y} cannot be reached`);
    }));
  }
});

test("lost-deck: the auto-player clears early, shutter and three-card decks inside par", () => {
  for (const d of [0, 1, 3, 5, 8, 9]) {
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

/* the text calls of one frame of the current scene: [{s, x, y, h, o}] */
function textsOf(app, L) {
  const g = L.game.g, orig = g.text, out = [];
  g.text = function (s, x, y, o) { const h = orig.call(g, s, x, y, o); out.push({ s: String(s), x, y, h, o: o || {} }); return h; };
  app.frame();
  g.text = orig;
  return out;
}
/* the left and right edge of a line as lo-game places it */
function edges(g, e) {
  const w = e.o.width ? Math.max(...g.wrap(e.s, e.o.width).map((l) => g.measure(l))) : g.measure(e.s);
  const box = e.o.width || 0, x0 = e.o.align === "center" ? (box ? e.x + (box - w) / 2 : e.x - w / 2) : e.x;
  return [x0, x0 + w];
}

test("lost-deck app: a long press of B, let go without sidestepping, still uses what is in front (#352)", async () => {
  const p = fakePad({}), on = {};
  p.pad.on = (type, fn) => { (on[type] = on[type] || []).push(fn); };
  const app = boot(APP, { pad: p.pad, seed: 3 });
  await settle(); frames(app, 5);
  const L = app.ctx.get("LD");
  L.dbgStart(0); frames(app, 5);
  const w = L.dbg(), orig = w.update; let used = 0;
  w.update = function (dt, input) { if (input && input.use) used++; return orig.call(this, dt, input); };
  (on.press || []).forEach((f) => f("b"));
  frames(app, 40);                                   /* two thirds of a second */
  (on.release || []).forEach((f) => f("b"));
  frames(app, 3);
  assert.equal(used, 1);
});

test("lost-deck app: the title's save warning fits the screen in both languages (#351)", async () => {
  for (const lang of ["zh", "en"]) for (const [initial, fail] of [[{ save: { v: 2, unlocked: 5, best: {}, tips: {} } }, false], [{ save: { v: "x" } }, false], [{}, true]]) {
    const p = fakePad(initial, fail);
    p.pad.lang = lang;
    const app = boot(APP, { pad: p.pad, seed: 3 });
    await settle(); frames(app, 5);
    const L = app.ctx.get("LD"), texts = textsOf(app, L);
    const warn = texts.find((e) => e.y === 146);
    assert.ok(warn && /saving|保存/.test(warn.s), `${lang}: ${warn && warn.s}`);
    const [x0, x1] = edges(L.game.g, warn);
    assert.ok(x0 >= 2 && x1 <= 158, `${lang} "${warn.s}" spans ${x0}..${x1}`);
  }
});

test("lost-deck app: the ending fits above its hint, and the first press shows it all instead of leaving (#353)", async () => {
  for (const lang of ["zh", "en"]) {
    const p = fakePad({}), on = {};
    p.pad.lang = lang;
    p.pad.on = (type, fn) => { (on[type] = on[type] || []).push(fn); };
    const tap = (b) => { (on.press || []).forEach((f) => f(b)); frames(app, 2); (on.release || []).forEach((f) => f(b)); frames(app, 2); };
    const app = boot(APP, { pad: p.pad, seed: 3 });
    await settle(); frames(app, 5);
    const L = app.ctx.get("LD"), lines = L.ENDING[lang];
    L.game.go("ending", null, { fade: false }); frames(app, 3 * 60);
    let texts = textsOf(app, L);
    assert.ok(!texts.some((e) => e.y === 146), `${lang}: no hint before the text is all there`);
    assert.ok(texts.length < lines.length, `${lang}: still coming in`);
    tap("a");                                        /* shows the rest, stays on the ending */
    frames(app, 40);
    texts = textsOf(app, L);
    const hint = texts.find((e) => e.y === 146), body = texts.filter((e) => e !== hint);
    assert.ok(hint, `${lang}: the hint shows once everything is there`);
    assert.equal(body.length, lines.length, `${lang}: every line drawn`);
    const last = body[body.length - 1];
    assert.ok(body[0].y >= 0 && last.y + last.h <= 146, `${lang}: text from ${body[0].y} to ${last.y + last.h}`);
    tap("a");                                        /* now it leaves (the fade waits on promises) */
    for (let i = 0; i < 6; i++) { frames(app, 10); await settle(); }
    const after = textsOf(app, L); assert.ok(!after.some((e) => lines.includes(e.s)), `${lang}: back on the title: ${JSON.stringify(after.map((e) => e.s))}`);
  }
});

test("lost-deck app: menus take a tap on their rows, the controls page takes A, and the end screens take a tap (#354)", async () => {
  const p = fakePad({ save: { v: 1, unlocked: 3, best: {}, tips: {} } }), on = {};
  p.pad.on = (type, fn) => { (on[type] = on[type] || []).push(fn); };
  const app = boot(APP, { pad: p.pad, seed: 3 });
  await settle(); frames(app, 5);
  /* lo-game keeps no scene names on the stack, so each scene is told by a word only its draw uses */
  const MARK = { title: "LOST DECK", help: "Doors open", decks: "Marks {a}", brief: "A go", pause: "Restart deck", play: "drawGun", dead: "SIGNAL LOST" };
  const L = app.ctx.get("LD"), top = () => { const d = String(L.game.top().draw); return Object.keys(MARK).find((k) => d.includes(MARK[k])); };
  /* a scene change fades through promises, so the event loop has to turn between the frames */
  const run = async (n) => { for (let i = 0; i < n; i++) { frames(app, 1); await settle(); } };
  const tap = async (x, y) => { app.pointer("pointerdown", x, y, 160, 160); await run(2); app.pointer("pointerup", x, y, 160, 160); await run(40); };
  const key = async (b) => { (on.press || []).forEach((f) => f(b)); await run(2); (on.release || []).forEach((f) => f(b)); await run(40); };
  await run(40);                                     /* past the opening fade */
  assert.equal(top(), "title");
  await tap(80, 94 + 2 * 16);                              /* 操作 */
  assert.equal(top(), "help");
  await key("a");
  assert.equal(top(), "title", "A leaves the controls page");
  await tap(80, 94 + 16);                                  /* 选层 */
  assert.equal(top(), "decks");
  await tap(80, 22 + 2 * 17 + 6);                          /* the third row, deck 3, is open */
  assert.equal(top(), "brief");
  L.dbgStart(0); await run(40);
  await key("start");
  assert.equal(top(), "pause");
  await tap(30, 87 + 6);                                   /* 继续 */
  assert.equal(top(), "play");
  L.game.go("dead", null, { fade: false }); await run(60);
  await tap(80, 80);
  assert.equal(top(), "play", "a tap on the dead screen tries again");
});
