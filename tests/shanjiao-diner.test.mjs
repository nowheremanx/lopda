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

test("the app boots to the title and a new game reaches the first morning", async () => {
  const { boot } = await import("./app-vm.mjs");
  const store = {}, listeners = {};
  const pad = {
    lang: "zh",
    save(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
    load(k) { return Promise.resolve(store[k] == null ? null : JSON.parse(JSON.stringify(store[k]))); },
    remove(k) { delete store[k]; },
    sfx() {}, ambience() {},
    on(t, fn) { (listeners[t] ||= []).push(fn); },
    off() {}, isDown() { return false; }
  };
  const app = boot("registry/apps/shanjiao-diner/index.html", { pad, seed: 3 });
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
