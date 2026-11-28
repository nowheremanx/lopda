// registry/apps/shanjiao-diner: content tables stay consistent and the maps stay rectangular.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read } from "./helpers.mjs";

const ctx = vm.createContext({ console, game: { scene() {} } });
vm.runInContext(read("registry/apps/shanjiao-diner/src/10-data.js"), ctx);
vm.runInContext(read("registry/apps/shanjiao-diner/src/53-forest.js"), ctx);
const D = ctx.DATA;

test("every dish, upgrade and person points at something that exists", () => {
  for (const id of D.DISH_ORDER) {
    const dish = D.DISHES[id];
    assert.ok(dish, id);
    assert.ok(dish.price > 0 && dish.appeal > 0, id);
    for (const [ing, n] of Object.entries(dish.need)) {
      assert.ok(D.ING[ing], `${id}: unknown ingredient ${ing}`);
      assert.ok(n > 0, `${id}: ${ing} needs a positive amount`);
    }
  }
  for (const id of D.UPGRADE_ORDER) {
    const u = D.UPGRADES[id];
    assert.ok(u && u.cost > 0 && u.rep >= 0, id);
  }
  for (const id of D.NPC_ORDER) {
    const p = D.NPCS[id];
    assert.ok(p && D.DISHES[p.fav], id);
  }
  assert.equal(D.WEATHER_BY_DAY.length, D.MAX_DAY);
  for (const w of D.WEATHER_BY_DAY) assert.ok(D.WEATHER[w], w);
});

test("the mountain maps are 18 x 16 and every spot is on walkable ground", () => {
  for (const map of [ctx.FOREST_MAP, ctx.DEEP_MAP]) {
    assert.equal(map.length, 16);
    for (const row of map) assert.equal(row.length, 18);
  }
  const solid = new Set(["T", "~", "#"]);
  const check = (spots, map) => {
    for (const [x, y] of spots) {
      assert.ok(y >= 0 && y < 16 && x >= 0 && x < 18, `${x},${y} outside`);
      assert.ok(!solid.has(map[y][x]), `${x},${y} is solid (${map[y][x]})`);
    }
  };
  for (const spots of Object.values(ctx.NODE_SPOTS)) check(spots, ctx.FOREST_MAP);
  for (const spots of Object.values(ctx.DEEP_SPOTS)) check(spots, ctx.DEEP_MAP);
  for (const m of ctx.FOREST_MONSTERS) {
    assert.ok(m.y >= 0 && m.y < 16 && m.x >= 0 && m.x < 18);
    assert.ok(!solid.has(ctx.FOREST_MAP[m.y][m.x]), `${m.id} on solid`);
  }
});

/* SJ_FILE points a one-off run at another build (the pre-0.1.2 bundle, to prove
 * the stuck-save test fails there); normal runs use the app. */
const DINER_FILE = process.env.SJ_FILE || "registry/apps/shanjiao-diner/index.html";

async function bootDiner(seed, save, opts = {}) {
  const { boot } = await import("./app-vm.mjs");
  const store = {}, listeners = {}, writes = [];
  // a save goes in under SAVE_KEY, "diner" in src/00-main.js, so 继续 is offered
  if (save) store.diner = JSON.parse(JSON.stringify(save));
  const pad = {
    lang: "zh",
    save(k, v) { writes.push(k); store[k] = JSON.parse(JSON.stringify(v)); },
    load(k) {
      // opts.loadError: the runtime's rejection for a damaged save (sdk/pad-shim.js PAD.load)
      if (opts.loadError) return Promise.reject({ code: opts.loadError });
      return Promise.resolve(store[k] == null ? null : JSON.parse(JSON.stringify(store[k])));
    },
    remove(k) { delete store[k]; },
    sfx() {}, ambience() {},
    on(t, fn) { (listeners[t] ||= []).push(fn); },
    off() {}, isDown() { return false; }
  };
  /* a stage exactly the world's size: fill adds no bands, and a tap at world
     pixel (x, y) is (x, y) on the stage, as these tests read it */
  return { app: boot(DINER_FILE, { pad, seed, stage: { w: 216, h: 240 } }), listeners, store, writes };
}

/* one chin press, then a few frames so the scene sees it */
function buttons(app, listeners) {
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) { app.frame(); await new Promise((r) => setImmediate(r)); } };
  const press = async (b) => {
    (listeners.press || []).forEach((f) => f(b)); await tick(2);
    (listeners.release || []).forEach((f) => f(b)); await tick(1);
  };
  return { tick, press };
}

test("the app boots to the title and a new game reaches the first morning", async () => {
  const { app, listeners } = await bootDiner(3);
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) { app.frame(); await new Promise((r) => setImmediate(r)); } };
  const press = async (b) => {
    (listeners.press || []).forEach((f) => f(b)); await tick(2);
    (listeners.release || []).forEach((f) => f(b)); await tick(1);
  };
  await tick(6);
  assert.equal(app.ctx.get("booted"), true);
  await press("a");
  await tick(80);
  const S = app.ctx.get("S");
  assert.ok(S, "a new game has state");
  assert.equal(S.day, 1);
  assert.equal(S.phase, "morning");
  assert.ok(app.hashes.length > 0);
});

test("a morning with no stock and no actions left closes the day instead of soft-locking", async () => {
  const { app, listeners } = await bootDiner(7);
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) { app.frame(); await new Promise((r) => setImmediate(r)); } };
  const press = async (b) => {
    (listeners.press || []).forEach((f) => f(b)); await tick(2);
    (listeners.release || []).forEach((f) => f(b)); await tick(1);
  };
  await tick(6);
  await press("a");                 // 开始
  await tick(80);                   // title fade, then the first morning
  const game = app.ctx.get("game");
  const S = app.ctx.get("S");
  assert.equal(S.phase, "morning");
  S.seen.intro = 1;
  game.pop(true);                   // dismiss the day-one introduction
  await tick(3);
  // the dead end: both actions spent, nothing cooked, so 菜单 is disabled
  S.ap = 0; S.stock = {}; S.menu = []; S.flags.prepared = false;
  app.ctx.get("morningAct")(5);     // 开门
  await tick(3);
  await press("a");                 // 今天歇业
  await tick(90);                   // the fade into the night scene
  assert.equal(S.phase, "night");
  assert.equal(S.lastLedger.closed, true);
  assert.equal(S.lastLedger.served, 0);
  assert.ok(S.lastLedger.lost >= 3, "the day's customers are booked as lost");
  assert.equal(S.lastLedger.rentDone, 1, "the night scene entered and did its rent step");
});

test("a save stuck in an empty morning closes the day and wakes on day 3", async () => {
  // start from a real save: a new game, read at its first morning
  const first = await bootDiner(3);
  const firstKeys = buttons(first.app, first.listeners);
  await firstKeys.tick(6);
  assert.equal(first.app.ctx.get("booted"), true);
  await firstKeys.press("a");           // 开始
  await firstKeys.tick(80);             // the title fade, then the first morning
  const day1 = first.app.ctx.get("S");
  assert.equal(day1.day, 1);
  const stuck = JSON.parse(JSON.stringify(day1));
  // the state players were stuck in: both actions spent, nothing cooked
  stuck.day = 2;
  stuck.phase = "morning";
  stuck.ap = 0;
  stuck.stock = {};
  stuck.menu = [];
  stuck.flags = stuck.flags || {};
  stuck.flags.prepared = false;
  stuck.flags.opened = false;

  const { app, listeners } = await bootDiner(4, stuck);
  const { tick, press } = buttons(app, listeners);
  await tick(6);
  assert.equal(app.ctx.get("booted"), true);
  // src/50-title.js: a loaded save puts 继续 first, and the cursor starts on it
  const opts = app.ctx.get("titleOptions")();
  assert.equal(opts[0].id, "continue", "继续 is the first title option");
  assert.equal(app.ctx.get("TITLE_SEL"), 0, "继续 is the selected option");
  await press("a");                     // 继续
  // the fade into the saved morning, then the day-2 story: A through it like a player
  for (let i = 0; i < 24; i++) await press("a");
  const S = app.ctx.get("S");
  assert.equal(S.day, 2, "the save loaded as it was saved");
  assert.equal(S.phase, "morning", "继续 reaches the saved morning");
  // the bar starts on 出门; five rights reach 开门 (morningActions in src/51-morning.js)
  for (let i = 0; i < 5; i++) await press("right");
  assert.equal(app.ctx.get("MORNING_SEL"), 5, "the cursor is on 开门");
  await press("a");                     // 开门: the stove is empty, the only offer is 今天歇业
  await press("a");                     // accept it
  for (let i = 0; i < 90 && S.phase !== "night"; i++) await tick(1);
  assert.equal(S.phase, "night", "开门 with an empty stove must close the day, not leave the morning stuck");
  assert.equal(S.lastLedger.closed, true);
  // A through the night's story, then its last A sleeps into the next morning
  for (let i = 0; i < 40 && !(S.day === 3 && S.phase === "morning"); i++) {
    if (S.phase === "night") await press("a");
    else await tick(5);
  }
  assert.equal(S.day, 3, "the night ends on day 3");
  assert.equal(S.phase, "morning", "day 3 opens in the morning");
  assert.equal(S.ap, 2, "day 3 has its two actions");
});

test("every help line fits 188 px and the last one ends above the footer strip", async () => {
  const { app } = await bootDiner(8);
  const game = app.ctx.get("game");
  const UI = app.ctx.get("UI");
  // UI.help's line list is a local array in src/30-ui.js and is drawn through the
  // closure's text(), so the literals come from the source; the measurements and
  // the layout come from the running app's own pixel font.
  const src = read("registry/apps/shanjiao-diner/src/30-ui.js");
  const block = src.match(/function help\(g, page\)[\s\S]*?var lines = \[([\s\S]*?)\];/);
  assert.ok(block, "src/30-ui.js still has UI.help's line list");
  const lines = [...block[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  assert.equal(lines.length, 12);
  for (const line of lines) {
    const w = game.g.measure(line);
    assert.ok(w <= 188, `"${line}" is ${w} px, wider than the 188 px fit`);
  }
  // draw the help screen and record each text baseline
  const drawn = [];
  const proxy = new Proxy(game.g, {
    get(target, prop) {
      if (prop === "text") return (str, x, y, o) => { drawn.push({ str, y }); return target.text(str, x, y, o); };
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    }
  });
  UI.help(proxy);
  // the footer is at R.footer.y; the deepest text above it is the list's last line
  const above = drawn.filter((d) => d.y < UI.R.footer.y).map((d) => d.y);
  assert.ok(above.length, "the help screen drew its text");
  const lastY = Math.max(...above);
  const strip = UI.R.footer.y - 4;
  assert.ok(lastY + game.g.lineHeight <= strip,
    `the help list's last line ends at ${lastY + game.g.lineHeight} px, on the footer strip at ${strip}`);
});

test("the prep footer keeps 返回 instead of shortening it to …", async () => {
  const { app, listeners } = await bootDiner(5);
  const { tick, press } = buttons(app, listeners);
  await tick(6);
  await press("a");                     // 开始
  for (let i = 0; i < 90 && !app.ctx.get("S"); i++) await tick(1);
  assert.ok(app.ctx.get("S"), "a new game has state");
  const game = app.ctx.get("game");
  const UI = app.ctx.get("UI");
  await tick(60);                       // the title's fade into the morning
  game.go("prep");                      // the 菜单 screen; this also drops the intro overlay
  await tick(60);                       // its fade out and in
  const footers = [];
  const origFooter = UI.footer;
  UI.footer = function (g, str, color) { footers.push(String(str)); return origFooter(g, str, color); };
  await tick(2);
  UI.footer = origFooter;
  assert.ok(footers.length, "the prep screen drew its footer");
  const footer = footers[0];
  assert.ok(footer.includes("备好"), `expected the prep footer, got "${footer}"`);
  assert.ok(!footer.includes("…"), `the prep footer is shortened: ${footer}`);
  const w = game.g.measure(footer);
  assert.ok(w <= UI.R.footer.w, `"${footer}" is ${w} px, wider than the ${UI.R.footer.w} px footer`);
});

test("老周's choice box fits its labels and the screen", async () => {
  const { app, listeners } = await bootDiner(6);
  const { tick, press } = buttons(app, listeners);
  await tick(6);
  await press("a");                     // 开始
  for (let i = 0; i < 90 && !app.ctx.get("S"); i++) await tick(1);
  const game = app.ctx.get("game");
  const S = app.ctx.get("S");
  assert.ok(S, "a new game has state");
  // run the day-2 morning story and catch the box src/58-event.js hands to choose()
  S.day = 2;
  S.seen = {};
  const origSay = game.say, origChoose = game.choose;
  game.say = () => Promise.resolve(true);
  let box = null;
  game.choose = (items, o) => {
    box = { items: items.slice(), x: o.x, width: o.width };
    return Promise.resolve(0);
  };
  app.ctx.get("MorningStory")();
  for (let i = 0; i < 30 && !box; i++) await tick(2);
  game.say = origSay;
  game.choose = origChoose;
  assert.ok(box, "the day-2 story asks 收下 or 给你十文");
  assert.deepEqual(box.items, ["收下，记你账上", "给你十文"]);
  assert.ok(box.x >= 0, `the box starts ${box.x} px from the left`);
  assert.ok(box.x + box.width <= game.width,
    `the box ends at ${box.x + box.width} px, off the ${game.width} px screen`);
  // menuScene draws a label at x + pad 6 + arrow 8, with a 1 px border at the right
  for (const label of box.items) {
    const w = game.g.measure(label);
    assert.ok(w <= box.width - 15, `"${label}" is ${w} px, wider than the ${box.width - 15} px the box holds`);
  }
});

/* a real day-1 save, read at the first morning of a new game */
async function day1Save() {
  const first = await bootDiner(3);
  const k = buttons(first.app, first.listeners);
  await k.tick(6);
  await k.press("a");                   // 开始
  await k.tick(80);
  return JSON.parse(JSON.stringify(first.app.ctx.get("S")));
}

test("#420: 新局 over a save asks first; B keeps the old save", async () => {
  const old = await day1Save();
  old.day = 5; old.money = 321;
  const { app, listeners, store } = await bootDiner(9, old);
  const { tick, press } = buttons(app, listeners);
  await tick(6);
  const ids = app.ctx.get("titleOptions")().map((o) => o.id);
  assert.deepEqual(ids, ["continue", "new", "help"]);
  await press("right");                 // 新局
  await press("a");
  await tick(3);
  assert.equal(app.ctx.get("S"), null, "no new game before the player confirms");
  assert.equal(store.diner.day, 5, "the old save is untouched while the box is open");
  await press("b");                     // cancel
  await tick(3);
  assert.equal(app.ctx.get("S"), null, "B keeps the old game");
  assert.equal(store.diner.day, 5);
  assert.equal(store.diner.money, 321);
  await press("a");                     // 新局 again
  await tick(3);
  await press("a");                     // 开新局
  for (let i = 0; i < 90 && !app.ctx.get("S"); i++) await tick(1);
  assert.equal(app.ctx.get("S").day, 1, "A on 开新局 starts the new week");
  assert.equal(store.diner.day, 1);
});

test("#421: an evening is saved once as 'service' and 继续 starts that evening again", async () => {
  const old = await day1Save();
  old.menu = ["mushroom_soup"]; old.stock = { mushroom_soup: 3 }; old.flags.opened = 1;
  const { app, listeners, store, writes } = await bootDiner(10, old);
  const { tick, press } = buttons(app, listeners);
  await tick(6);
  await press("a");                     // 继续
  await tick(60);
  const game = app.ctx.get("game");
  game.go("service");                   // what 开门营业 does after its save
  await tick(60);
  assert.equal(store.diner.phase, "service", "entering the evening saves it as service");
  assert.deepEqual(store.diner.stock, { mushroom_soup: 3 }, "with the stock it opened with");
  const before = writes.length;
  app.ctx.get("addNpc")("ahe", 1);      // a regular's favourite, mid-evening
  app.ctx.get("addMoney")(7);
  app.ctx.get("mark")("svc_ahe");
  await tick(3);
  assert.equal(writes.length, before, "nothing is written half way through the evening");
  const midEvening = JSON.parse(JSON.stringify(store.diner));

  // leaving now (HOME) and coming back: 继续 opens the same evening, not the morning
  const again = await bootDiner(11, midEvening);
  const k2 = buttons(again.app, again.listeners);
  await k2.tick(6);
  assert.equal(again.app.ctx.get("titleOptions")()[0].id, "continue");
  await k2.press("a");
  await k2.tick(60);
  const SERV = again.app.ctx.get("SERV");
  assert.ok(SERV && !SERV.done, "继续 goes back into the evening");
  assert.deepEqual(again.app.ctx.get("S").stock, { mushroom_soup: 3 });

  // the end of the evening writes the night in one go
  app.ctx.get("finishService")(false);
  await tick(3);
  assert.equal(store.diner.phase, "night");
  assert.ok(store.diner.money >= old.money + 7, "the evening's takings are in the night's save");
  assert.equal(store.diner.seen.svc_ahe, 1);
});

test("#422: after the ending the save keeps its record and the title offers 结局", async () => {
  const old = await day1Save();
  old.day = 7; old.phase = "night";
  const { app, listeners, store } = await bootDiner(12, old);
  const { tick, press } = buttons(app, listeners);
  await tick(6);
  await press("a");                     // 继续 into the night
  await tick(30);
  app.ctx.get("game").go("ending");
  await tick(60);
  assert.equal(store.diner.phase, "ending");
  await press("a");                     // A 回到标题
  await tick(60);
  const opts = app.ctx.get("titleOptions")();
  assert.deepEqual(opts.map((o) => o.id), ["continue", "new", "help"], "the same title as after a restart");
  assert.equal(opts[0].label, "结局");
  assert.equal(store.diner.phase, "ending", "the finished week is still saved");
});

test("#423: a save that cannot be read, or a newer one, offers no new game and is never written", async () => {
  for (const [save, opt, newer] of [[null, { loadError: "corrupt" }, false], [{ v: 99, phase: "morning" }, {}, true]]) {
    const { app, listeners, store, writes } = await bootDiner(13, save, opt);
    const { tick, press } = buttons(app, listeners);
    await tick(6);
    assert.equal(app.ctx.get("booted"), true);
    assert.equal(app.ctx.get("bootFailed"), true);
    assert.equal(app.ctx.get("bootNewer"), newer);
    assert.deepEqual(app.ctx.get("titleOptions")().map((o) => o.id), ["help"]);
    await press("a");                   // 说明
    await press("a");                   // back
    await tick(60);
    assert.equal(app.ctx.get("S"), null, "no game was started");
    assert.equal(writes.length, 0, "nothing was written");
    if (save) assert.deepEqual(store.diner, save, "the newer save is untouched");
  }
});

test("the title's save warnings fit the screen", async () => {
  const { app } = await bootDiner(14);
  const g = app.ctx.get("game").g;
  const src = read("registry/apps/shanjiao-diner/src/50-title.js");
  const lines = [...src.matchAll(/g\.text\("([^"]*)", 108, 1(?:62|76)/g)].map((m) => m[1]);
  assert.equal(lines.length, 4);
  for (const line of lines) assert.ok(g.measure(line) <= 204, `"${line}" is ${g.measure(line)} px`);
});

/* ---- DeepSeek review #424 #425 #426 #427 ---- */

test("the seventh morning counts its three actions and the guests who will really come (#424, #425)", async () => {
  const { app, listeners } = await bootDiner(9);
  const { tick, press } = buttons(app, listeners);
  await tick(6);
  await press("a");
  for (let i = 0; i < 90 && !app.ctx.get("S"); i++) await tick(1);
  const S = app.ctx.get("S");
  const apMax = app.ctx.get("apMax"), guestLine = app.ctx.get("guestLine"), buildSchedule = app.ctx.get("buildSchedule");
  assert.equal(apMax(), 2, "an ordinary morning has two actions");
  S.day = 7; S.ap = 3; S.flags.prepared = false; S.menu = []; S.stock = {};
  assert.equal(apMax(), 3, "the seventh morning's story adds a third");
  assert.match(guestLine(), /^宴客 3 \+ 路人 \d+ 位/, "before the menu: three feast guests and the walk-ins");
  // only the three feast dishes cooked: no walk-in has anything to order
  S.menu = ["god_soup", "grilled_fish", "mushroom_soup"];
  S.stock = { god_soup: 1, grilled_fish: 1, mushroom_soup: 1 };
  S.flags.prepared = 1;
  assert.equal(guestLine(), "宴客 3 位　路人没有可点的菜");
  const list = buildSchedule();
  assert.deepEqual(list.map((c) => c.who).sort(), ["ahe", "po", "zhou"], "the evening really has only the three");
  // a fourth dish for the walk-ins brings them back
  S.menu = ["god_soup", "grilled_fish", "mushroom_soup", "pork"];
  assert.match(guestLine(), /^宴客 3 \+ 路人/);
  assert.ok(buildSchedule().some((c) => !c.who), "walk-ins come when there is a dish for them");
  // the morning's second line says 3/3, never 3/2
  const drawn = [];
  const g = app.ctx.get("game").g, text = g.text;
  g.text = function (s) { drawn.push(String(s)); return text.apply(g, arguments); };
  app.ctx.get("game").go("morning");
  await tick(40);
  g.text = text;
  assert.ok(drawn.some((s) => s.includes("行动 3/3")), "the morning shows 行动 3/3: " + drawn.filter((s) => s.includes("行动")).join(" | "));
  assert.ok(!drawn.some((s) => s.includes("/2") && s.includes("行动 3")), "never 行动 3/2");
});

test("the help screen promises no START save (#427)", () => {
  const src = read("registry/apps/shanjiao-diner/src/30-ui.js");
  const block = src.match(/function help\(g, page\)[\s\S]*?var lines = \[([\s\S]*?)\];/)[1];
  assert.ok(!/START[^"]*存档/.test(block.replace(/自动存档/g, "")), "START is not said to save");
  assert.match(block, /自动存档/, "the help says saving is automatic");
});

test("every ending's lines stay on one line inside their windows (#426)", async () => {
  const { app } = await bootDiner(10);
  await new Promise((r) => setImmediate(r));
  for (let i = 0; i < 6; i++) { app.frame(); await new Promise((r) => setImmediate(r)); }
  const game = app.ctx.get("game");
  const g = game.g;
  const cases = [
    { kind: "best", choice: "ahe", debt: 0 },
    { kind: "good", choice: "shrine", debt: 0 },
    { kind: "good", choice: "ahe", debt: 0 },
    { kind: "normal", choice: null, debt: 0 },
    { kind: "bad", choice: null, debt: 150 }
  ];
  for (const c of cases) {
    const S = { stats: { served: 120, earned: 9999 }, rep: 12, debt: c.debt, flags: { finalChoice: c.choice } };
    const drawn = [];
    const proxy = new Proxy(g, {
      get(t, prop) {
        if (prop === "text") return (str, x, y, o) => { drawn.push({ str: String(str), y, h: t.text(str, x, y, o) }); };
        const v = t[prop];
        return typeof v === "function" ? v.bind(t) : v;
      }
    });
    // the ending scene's own draw (src/59-ending.js), run with this state and kind as enter() would leave them
    const run = new Function("S", "UI", "ART", "game", "g", "kind", "src", "var self = { kind: kind };" +
      "var draw = eval('(' + src + ')'); draw.call(self, g);");
    const src = read("registry/apps/shanjiao-diner/src/59-ending.js").match(/draw: (function \(g\) \{[\s\S]*?\n  \})/)[1];
    run(S, app.ctx.get("UI"), app.ctx.get("ART"), game, proxy, c.kind, src);
    assert.ok(drawn.length >= 5, `${c.kind}: the ending drew its text`);
    for (const d of drawn) {
      assert.ok(d.h <= g.lineHeight, `${c.kind}: "${d.str}" wraps (${d.h} px high)`);
    }
    const title = drawn.filter((d) => d.y < 52);
    for (const d of title) assert.ok(d.y + g.lineHeight <= 52, `${c.kind}: "${d.str}" leaves the title box`);
    const ys = drawn.filter((d) => d.y > 52).map((d) => d.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= g.lineHeight, `${c.kind}: rows at ${ys[i - 1]} and ${ys[i]} overlap`);
  }
});

test("自动结算 still plays the served regular's scene and its heart before the ledger (#428)", async () => {
  const { app, listeners } = await bootDiner(5);
  const { tick, press } = buttons(app, listeners);
  await tick(6);
  await press("a");
  await tick(80);
  const game = app.ctx.get("game"), S = app.ctx.get("S");
  S.seen.intro = 1;
  game.pop(true);
  await tick(3);
  S.day = 1; S.menu = ["mushroom_soup"]; S.stock = { mushroom_soup: 9 }; S.flags.prepared = 1;
  /* every heart given to 阿禾 tonight: the favourite dish's, then the one her scene's answer gives (0 or 1) */
  app.ctx.get("(window.__hearts = [], addNpc = (function (o) { return function (id, n) { if (id === 'ahe') window.__hearts.push(n); return o(id, n); }; })(addNpc))");
  assert.equal(app.ctx.get("autoService")(), true);
  for (let i = 0; i < 400 && !S.lastLedger.rentDone; i++) { await press("a"); await tick(2); }
  assert.equal(S.seen.svc_ahe, 1, "阿禾's soup scene was seen");
  assert.equal(app.ctx.get("window.__hearts").length, 2, "the favourite dish and the scene's answer: " + app.ctx.get("window.__hearts"));
  assert.equal(S.phase, "night");
  assert.equal(S.lastLedger.auto, true);
});

test("the night ledger counts down to the feast and, on the seventh night, says how many dishes landed (#429)", async () => {
  const { app, listeners } = await bootDiner(5);
  const { tick, press } = buttons(app, listeners);
  await tick(6);
  await press("a");
  await tick(80);
  const game = app.ctx.get("game"), S = app.ctx.get("S");
  S.seen.intro = 1;
  game.pop(true);
  await tick(3);
  const g = game.g, text = g.text, drawn = [];
  g.text = function (s) { drawn.push(String(s)); return text.apply(g, arguments); };
  S.lastLedger = { served: 0, lost: 0, rentDone: 1 };
  S.phase = "night";
  game.go("night");
  await tick(40);
  assert.ok(drawn.some((s) => s === "离山神宴 6 天"), drawn.filter((s) => s.includes("宴")).join(" | "));
  drawn.length = 0;
  S.day = 7; S.flags.vip = 2;
  await tick(3);
  g.text = text;
  assert.ok(drawn.some((s) => s === "宴席对上 2/3"), drawn.filter((s) => s.includes("宴")).join(" | "));
});

test("touch: a tap is the pad's A on every menu, and empty space does nothing", async () => {
  const { app, listeners } = await bootDiner(3);
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) { app.frame(); await new Promise((r) => setImmediate(r)); } };
  /* pointer() in stage pixels; the stage is the world's 216 x 240, so k is 1 */
  const tap = async (x, y) => {
    app.pointer("pointerdown", x, y, 216, 240, { k: 1 });
    await tick(2);
    app.pointer("pointerup", x, y, 216, 240, { k: 1 });
    await tick(3);
  };
  const ctx = (n) => app.ctx.get(n);
  await tick(10);
  const game = ctx("game");
  assert.equal(ctx("TITLE_SEL"), 0);
  await tap(5, 40);                                   // the sky above the title board
  await tick(3);
  assert.equal(ctx("TITLE_SEL"), 0, "empty title space moves nothing");
  await tap(140, 205);                                // 说明, the second item
  await tick(40);
  assert.equal(ctx("TITLE_SEL"), 1, "a title tap selects the tapped item");
  await tap(108, 120);                                // help: a tap goes back
  await tick(60);
  await tap(50, 205);                                 // 开始
  await tick(120);
  const S = ctx("S");
  assert.equal(S.day, 1, "a title tap starts the same game A starts");
  S.seen.intro = 1; game.pop(true); await tick(5);

  const ap = S.ap;
  await tap(5, 100);                                  // the room, between panels
  await tick(3);
  assert.equal(S.ap, ap, "empty morning space does nothing");
  await tap(57, 205);                                 // 菜单, the second action
  await tick(60);
  assert.ok(!S.flags.prepared, "the morning's tap opened prep, it did not cook");

  await tap(100, 97);                                 // second prep row: select
  await tick(3);
  assert.equal(ctx("PREP_SEL"), 1, "a prep row tap moves the cursor");
  const dish = ctx("prepList")()[ctx("PREP_SEL")];
  assert.ok(ctx("prepRoom")(dish) >= 2, "the test dish has room for two");
  await tap(100, 97);                                 // a second tap on the selected row adds one
  await tick(3);
  assert.equal(ctx("PREP_PLAN")[dish], 1, "the second row tap adds a portion, like →");
  await tap(150, 97);                                 // the 定 column adds too
  await tick(3);
  assert.equal(ctx("PREP_PLAN")[dish], 2, "the 定 column adds a portion");
  await tap(108, 226);                                // the footer's A hint: 备好
  await tick(60);
  assert.equal(S.flags.prepared, 1, "touch-only can fill the plan and cook it");
  assert.equal(S.ap, ap - 1, "cooking spends the action, as A does");

  await tick(40);
  await tap(91, 205);                                 // 店铺, the third action
  await tick(60);
  S.money = 500; S.rep = 5;
  await tap(100, 152);                                // shop row 2 (加一条长凳)
  await tick(5);
  assert.equal(ctx("SHOP_SEL"), 2, "a shop row tap selects the row");
  assert.ok(S.upgrades.table, "and buys it, as A does");

  (listeners.press || []).forEach((f) => f("b")); await tick(2);
  (listeners.release || []).forEach((f) => f("b")); await tick(40);
  await tap(23, 205);                                 // 出门 (the first action) leaves for the forest
  await tick(60);
  assert.ok(ctx("trip"), "the morning's first tap opens the forest");
  game.pop(true); await tick(5);

  game.push("codex", { from: "morning" });
  await tick(5);
  await tap(140, 40);                                 // the 山兽 tab
  await tick(3);
  assert.equal(ctx("CODEX_TAB"), 2, "a codex tab tap switches category");
  await tap(100, 80);                                 // second row
  await tick(3);
  assert.equal(ctx("CODEX_SEL"), 1, "a codex row tap moves the cursor");
  game.pop(); await tick(5);

  game.push("battle", { enemy: "boar", from: "forest" });
  await tick(5);
  const B = ctx("B");
  B.heroHp = 20;
  await tap(50, 198);                                 // the 撒粉 label's centre (lower row)
  await tick(120);
  assert.equal(B.sel, 2, "a tap at the lower row's label centre picks 撒粉, not 攻击");
  B.heroHp = 10;
  await tap(150, 205);                                // 包扎, the fourth cell
  await tick(120);
  assert.equal(B.sel, 3, "a battle tap picks the tapped cell");
  assert.ok(B.heroHp > 10, "and acts, as A does");
  const mode = B.mode;
  await tap(5, 130);                                  // above the command window
  await tick(5);
  assert.equal(B.mode, mode, "empty battle space does nothing");
  B.mode = "menu"; B.sel = 3;
  await tap(50, 215);                                 // the strip under the drawn cells
  await tick(5);
  assert.equal(B.sel, 3, "the empty strip under the commands fires nothing");
  game.pop({ result: "flee", drops: [], money: 0 });
  await tick(5);

  game.push("service");
  await tick(5);
  const SERV = ctx("SERV");
  S.stock = { mushroom_soup: 3 };
  const guest = { dish: "mushroom_soup", who: null, want: null, matched: true, state: "wait", seat: 1,
    patience: 20, maxPatience: 20, x: 152, y: 74, fx: 152, fy: 74, tx: 152, ty: 74, t: 1, eatT: 0, variant: 0 };
  SERV.tables[1] = guest;
  SERV.customers.push(guest);
  await tap(152, 74);                                 // table 2
  await tick(120);
  assert.equal(SERV.sel, 1, "a service tap selects that table");
  assert.equal(guest.state, "eat", "and serves, as A does");
  SERV.paused = true; SERV.pauseSel = 0;
  await tap(100, 116);                                // the gap between 继续 and 打烊
  await tick(3);
  assert.equal(SERV.paused, true, "the pause gap does nothing");
  assert.equal(SERV.done, false, "and never ends the evening");
  await tap(100, 80);                                 // the pause box's top
  await tick(3);
  assert.equal(SERV.paused, true, "the pause box's top does nothing");
  await tap(80, 104);                                 // 继续
  await tick(3);
  assert.equal(SERV.paused, false, "the 继续 row takes a tap");
  SERV.menuOpen = true;
  await tap(108, 120);                                // the stock list
  await tick(3);
  assert.equal(SERV.menuOpen, false, "the stock list closes on a tap");
  SERV.sel = 2;
  await tap(20, 120);                                 // the floor left of the tables
  await tick(3);
  assert.equal(SERV.sel, 2, "empty service space does nothing");
});

test("touch: the title's three items open the item that was tapped", async () => {
  /* a save makes the title show 继续 新局 说明: the three-item layout */
  const { app } = await bootDiner(21, { v: 1, phase: "morning" });
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) { app.frame(); await new Promise((r) => setImmediate(r)); } };
  const tap = async (x, y) => {
    app.pointer("pointerdown", x, y, 216, 240, { k: 1 });
    await tick(2);
    app.pointer("pointerup", x, y, 216, 240, { k: 1 });
    await tick(3);
  };
  await tick(10);
  const game = app.ctx.get("game");
  assert.deepEqual(app.ctx.get("titleOptions")().map((o) => o.id), ["continue", "new", "help"]);
  const visited = [], go = game.go;
  game.go = function (name) { visited.push(name); return go.apply(game, arguments); };
  await tap(131, 205);                                // 说明, at the third label's centre
  await tick(40);
  assert.ok(visited.includes("help"), "说明 opened help, not 新局: " + visited.join(","));
  assert.equal(app.ctx.get("S"), null, "no new game was started");
});

test("touch: the night ledger and the ending advance on a tap", async () => {
  const { app, listeners } = await bootDiner(4);
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) { app.frame(); await new Promise((r) => setImmediate(r)); } };
  const tap = async (x, y) => {
    app.pointer("pointerdown", x, y, 216, 240, { k: 1 });
    await tick(2);
    app.pointer("pointerup", x, y, 216, 240, { k: 1 });
    await tick(3);
  };
  await tick(6);
  (listeners.press || []).forEach((f) => f("a")); await tick(2);
  (listeners.release || []).forEach((f) => f("a")); await tick(80);
  const game = app.ctx.get("game"), S = app.ctx.get("S");
  S.seen.intro = 1; game.pop(true); await tick(5);
  const visited = [], go = game.go;
  game.go = function (name) { visited.push(name); return go.apply(game, arguments); };

  S.day = 1; S.phase = "night";
  S.seen.zhou1 = 1;  // the next morning has no story to interrupt this test's scene jumps
  game.go("night");
  await tick(80);
  /* the day-one story is an overlay; this test is about the ledger's own tap */
  app.ctx.get("(NIGHT_STORY = null, NIGHT_STORY_DONE = true)");
  await tap(108, 120);
  await tick(80);
  assert.ok(visited.includes("morning"), "a tap on the night ledger moves to the next morning: " + visited.join(","));
  assert.equal(S.day, 2, "the day really turned over");

  game.go("ending");
  await tick(80);
  await tap(108, 120);
  await tick(60);
  assert.equal(app.ctx.get("S"), null, "a tap on the ending puts the record back on the title");
  assert.ok(visited.includes("title"), "the ending went to the title");
});
