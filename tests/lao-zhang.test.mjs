// registry/apps/lao-zhang: level budgets, placement, the hook, the shop and the save.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read, readJSON, runScript } from "./helpers.mjs";

const ctx = runScript("registry/apps/lao-zhang/src/00-data.js");
vm.runInContext(read("registry/apps/lao-zhang/src/10-game.js"), ctx, { filename: "registry/apps/lao-zhang/src/10-game.js" });
vm.runInContext(read("registry/apps/lao-zhang/src/20-art.js"), ctx, { filename: "registry/apps/lao-zhang/src/20-art.js" });
const GM = ctx.GM;

test("ten written levels have rising cumulative targets, and endless keeps rising", () => {
  assert.equal(GM.PLAY_LEVELS, 10);
  let previous = 0;
  for (let n = 1; n <= GM.PLAY_LEVELS; n++) {
    const target = GM.targetFor(n);
    assert.ok(target > previous, `level ${n} target ${target} must beat ${previous}`);
    previous = target;
  }
  for (let n = 11; n <= 20; n++) assert.ok(GM.targetFor(n) > GM.targetFor(n - 1), `endless ${n}`);
});

test("every level can pay its target increment from the loot it puts in the mine", () => {
  for (let n = 1; n <= GM.PLAY_LEVELS; n++) {
    const increment = GM.targetFor(n) - GM.targetFor(n - 1);
    const loot = GM.recipeValue(n, 0, 0);
    assert.ok(loot.min >= increment * 1.5, `level ${n}: min loot ${loot.min} vs increment ${increment}`);
    assert.ok(loot.max >= loot.min, `level ${n}: max < min`);
    assert.ok(GM.recipeCount(GM.recipeFor(n)) >= 14, `level ${n}: too few items`);
  }
});

test("generated loot stays in the mine, keeps high-value pieces, and does not overlap", () => {
  for (let n = 1; n <= GM.PLAY_LEVELS; n++) {
    const state = { level: n, clover: 0, book: 0, rng: GM.rng(7000 + n), levelSeed: 7000 + n };
    const recipe = GM.recipeFor(n);
    const items = GM.generate(state, n);
    const expected = GM.recipeCount(recipe);
    assert.ok(items.length >= expected - 2, `level ${n}: placed ${items.length}/${expected}`);
    assert.equal(GM.countItems(items, "diamond"), recipe.diamond || 0, `level ${n}: diamonds`);
    assert.equal(GM.countItems(items, "goldL"), recipe.goldL || 0, `level ${n}: large gold`);
    assert.equal(GM.countItems(items, "mole"), recipe.mole || 0, `level ${n}: moles`);

    for (const it of items) {
      assert.ok(it.x >= it.r, `level ${n}: ${it.type} x ${it.x} < ${it.r}`);
      assert.ok(it.x <= GM.W - it.r, `level ${n}: ${it.type} x ${it.x} too far right`);
      assert.ok(it.y >= 35, `level ${n}: ${it.type} y ${it.y} too high`);
      assert.ok(it.y <= GM.H - it.r, `level ${n}: ${it.type} y ${it.y} too low`);
      if (it.type === "mole") {
        assert.ok(it.y >= 82 && it.y <= 120, `level ${n}: mole lane`);
        assert.ok(it.dir === -1 || it.dir === 1);
        assert.equal(it.carry, n >= 6 ? "diamond" : "goldM");
      }
    }
    const solid = items.filter((it) => it.type !== "mole");
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i], b = solid[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        assert.ok(d >= a.r + b.r - 0.01, `level ${n}: ${a.type}/${b.type} overlap (${d.toFixed(1)})`);
      }
    }
  }
});

test("a fired hook catches an item, reels it in and banks its value", () => {
  const state = GM.newState();
  state.screen = "play";
  state.time = 60;
  state.items = [GM.makeItem(state, "goldM", 80, 80, GM.rng(2))];
  state.hook = { state: "swing", len: GM.IDLE_ROPE, angle: 0, item: null };
  assert.equal(GM.fire(state), true);
  assert.equal(state.hook.state, "out");
  assert.equal(GM.fire(state), false, "cannot fire while the hook is out");

  for (let i = 0; i < 120 && state.hook.state !== "back"; i++) GM.update(state, 0.01);
  assert.equal(state.hook.state, "back");
  assert.equal(state.hook.item && state.hook.item.type, "goldM");
  assert.equal(state.items.length, 0);

  for (let i = 0; i < 400 && state.bank === 0; i++) GM.update(state, 0.01);
  assert.equal(state.bank, 300);
  assert.equal(state.hook.item, null);
  assert.equal(state.hook.state, "swing");
  assert.ok(state.events.includes("fire") && state.events.includes("grab") && state.events.includes("coin"));
});

test("an empty mine ends the level at once instead of waiting for the clock", () => {
  const state = GM.newState();
  state.screen = "play";
  state.level = 4;
  state.bank = state.target;
  state.time = 42;
  state.items = [];
  state.hook = { state: "swing", len: GM.IDLE_ROPE, angle: 0, item: null };
  GM.update(state, 0.016);
  assert.equal(state.screen, "clear");
});

test("dynamite cuts a heavy item; a lit TNT clears only what is near it", () => {
  const state = GM.newState();
  state.screen = "play";
  state.time = 60;
  state.dynamite = 2;
  state.hook = { state: "back", len: 50, angle: 0, item: { type: "rockL", kind: "rock", value: 40, weight: 4.2, r: 13, fuse: 0 } };
  assert.equal(GM.useDynamite(state), true);
  assert.equal(state.dynamite, 1);
  assert.ok(state.bomb, "the bomb is in the air");
  assert.equal(state.hook.item.type, "rockL");
  for (let i = 0; i < 60 && state.bomb; i++) GM.update(state, 0.01);
  assert.equal(state.bomb, null);
  assert.equal(state.hook.item, null);
  assert.equal(state.hook.state, "back");
  assert.ok(state.events.includes("throw") && state.events.includes("boom"));
  assert.equal(GM.useDynamite(state), false, "nothing is on the hook now");

  state.blasts = [];
  state.hook = { state: "back", len: 50, angle: 0, item: { type: "tnt", kind: "tnt", value: 0, weight: 1.4, r: 8, fuse: 0.02 } };
  state.items = [
    { type: "goldM", kind: "gold", value: 150, x: 80, y: 68, r: 10, weight: 1.55, sprite: "goldM" },
    { type: "goldS", kind: "gold", value: 50, x: 20, y: 130, r: 7, weight: 1, sprite: "goldS" }
  ];
  GM.stepHook(state, 0.03);
  assert.equal(state.hook.item, null);
  assert.equal(state.items.length, 1, "the far nugget survives");
  assert.equal(state.items[0].type, "goldS");
  assert.equal(state.blasts.length, 1);
});

test("the shop enforces prices and caps", () => {
  const state = GM.newState();
  state.bank = 2000;
  for (let i = 0; i < 5; i++) assert.equal(GM.buy(state, 0), true);
  assert.equal(state.dynamite, 5);
  assert.equal(state.bank, 1400);
  assert.equal(GM.buy(state, 0), false, "dynamite is capped");
  for (let i = 0; i < 3; i++) assert.equal(GM.buy(state, 1), true);
  assert.equal(state.strength, 3);
  assert.equal(GM.buy(state, 1), false, "strength is capped");
  for (let i = 0; i < 2; i++) assert.equal(GM.buy(state, 2), true);
  assert.equal(GM.buy(state, 2), false, "clover is capped");
  assert.equal(GM.buy(state, 3), true);
  assert.equal(GM.buy(state, 3), false, "the rock book is a one-off");
  assert.equal(state.bank, 190);
  state.bank = 0;
  assert.equal(GM.buy(state, 0), false, "cannot buy without cash");
  assert.equal(state.dynamite, 5);
});

test("a run in progress is saved at the level start, updated in the shop, and cleared on failure", () => {
  const state = GM.newState();
  state.runSeed = 12345;
  state.bank = 900;
  state.dynamite = 2;
  state.strength = 1;
  GM.startLevel(state, 3);
  assert.equal(state.run.level, 3);
  assert.equal(state.run.bank, 900);
  assert.equal(state.run.dynamite, 2);
  assert.equal(state.run.strength, 1);
  assert.equal(state.run.runSeed, 12345);
  assert.equal(state.runDirty, true);

  const payload = GM.runPayload(state);
  const saved = GM.readRun(payload);
  assert.equal(saved.ok, true);
  assert.equal(saved.run.level, 3);
  assert.equal(saved.run.bank, 900);
  assert.equal(GM.readRun({ v: 2, level: 3 }).newer, true);
  assert.equal(GM.readRun({ v: 1, level: 0, bank: 0 }).corrupt, true);
  assert.equal(GM.readRun({ v: 1, level: 3, bank: 0, dynamite: 9, strength: 0, clover: 0, book: 0, runSeed: 1 }).corrupt, true);

  state.screen = "shop";
  state.bank = 1000;
  GM.buy(state, 1);
  assert.equal(state.run.level, 4);
  assert.equal(state.run.bank, 800);
  assert.equal(state.run.strength, 2);

  state.level = 4;
  state.target = 4000;
  state.bank = 4500;
  GM.finishLevel(state);
  assert.equal(state.screen, "clear");
  assert.equal(state.run.level, 5);
  assert.equal(state.run.bank, 4500);

  state.level = 5;
  state.target = 99999;
  state.bank = 100;
  GM.finishLevel(state);
  assert.equal(state.screen, "over");
  assert.equal(state.run, null);

  const resume = GM.newState();
  resume.run = { level: 4, bank: 800, dynamite: 2, strength: 2, clover: 1, book: 0, runSeed: 99 };
  assert.equal(GM.continueRun(resume), true);
  assert.equal(resume.level, 4);
  assert.equal(resume.bank, 800);
  assert.equal(resume.dynamite, 2);
  assert.equal(resume.strength, 2);
  assert.equal(resume.clover, 1);
  assert.equal(resume.run.level, 4);
});

test("best-run saves are v1, validated, and never downgrade the record", () => {
  let saved = GM.readBest(null);
  assert.equal(saved.ok, true);
  assert.equal(saved.best.level, 0);
  assert.equal(saved.best.bank, 0);
  saved = GM.readBest({ v: 1, level: 4, bank: 2500 });
  assert.equal(saved.ok, true);
  assert.equal(saved.best.level, 4);
  assert.equal(saved.best.bank, 2500);
  assert.equal(GM.readBest({ v: 2, level: 4, bank: 2500 }).newer, true);
  assert.equal(GM.readBest({ v: 1, level: "4", bank: 2500 }).corrupt, true);
  assert.equal(GM.readBest({ v: 1, level: 4, bank: -1 }).corrupt, true);
  assert.equal(GM.readBest({ level: 4, bank: 2500 }).corrupt, true);
  assert.equal(GM.readBest([]).corrupt, true);

  assert.equal(GM.better({ level: 4, bank: 100 }, { level: 3, bank: 9999 }), true);
  assert.equal(GM.better({ level: 4, bank: 100 }, { level: 4, bank: 200 }), false);
  const state = GM.newState();
  assert.equal(GM.recordBest(state, 3, 1200), true);
  assert.equal(state.best.level, 3);
  assert.equal(state.best.bank, 1200);
  assert.equal(state.bestDirty, true);
  assert.equal(GM.recordBest(state, 2, 9999), false);
  const payload = GM.bestPayload(state);
  assert.equal(payload.v, 1);
  assert.equal(payload.level, 3);
  assert.equal(payload.bank, 1200);
});

test("the manifest and both languages are store-ready", () => {
  const m = readJSON("registry/apps/lao-zhang/manifest.json");
  assert.equal(m.id, "lao-zhang");
  assert.equal(m.spec, "lopda/1");
  assert.equal(m.name, "矿工老张");
  assert.equal(m.glyph, "张");
  assert.equal(m.category, "game");
  assert.equal(m.buttons, true);
  assert.deepEqual(m.permissions, []);
  assert.equal(m.license, "MIT");
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.equal(m.icon.length, 16);
  for (const row of m.icon) assert.equal(row.length, 16);
  assert.equal(m.icon.join("\n"), GM.ICON.join("\n"), "manifest icon and title icon must match");
  assert.ok(Array.from(m.i18n.en.name).length <= 8);
  assert.ok(Array.from(m.description).length <= 80);
  assert.ok(Array.from(m.i18n.en.description).length <= 80);

  for (const lang of ["zh", "en"]) {
    const T = GM.text(lang);
    for (const key of Object.keys(GM.text("zh"))) {
      assert.ok(T[key] !== undefined && T[key] !== "", `${lang}.${key} missing`);
    }
    assert.equal(T.shopNames.length, GM.SHOP.length);
    assert.equal(T.shopDescs.length, GM.SHOP.length);
    assert.equal(T.codexNames.length, GM.ITEM_ORDER.length);
  }
  for (const name of Object.keys(GM.ITEMS)) {
    if (name !== "mole") assert.ok(GM.SPR[name], `missing sprite ${name}`);
  }
  assert.equal(GM.SPR.diamond.w, 28);
});
