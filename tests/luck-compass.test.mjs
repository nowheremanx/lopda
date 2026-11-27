// registry/apps/luck-compass: the day pillar and the almanac table, with no DOM and no PAD.
// The dates come from printed almanacs; 喜/财/福 match 6tail's lunar library and lunisolar,
// 阳贵/阴贵 match 6tail's POSITION_YANG_GUI / POSITION_YIN_GUI. The last tests boot the
// bundled app in tests/app-vm.mjs to read the header and the key line it draws.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { join } from "node:path";
import { read, ROOT } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const ctx = vm.createContext({ console });
vm.runInContext(read("registry/apps/luck-compass/src/luck.js"), ctx, { filename: "luck.js" });
const L = ctx.LUCK;

test("the 60-day cycle starts at 甲子 and matches known printed days", () => {
  assert.equal(L.dayIndex(2000, 1, 1), 54);
  assert.equal(L.pillar(2000, 1, 1).name, "戊午");
  assert.equal(L.dayIndex(2026, 10, 24), 7);
  assert.equal(L.pillar(2026, 10, 24).name, "辛未");
  assert.equal(L.pillar(2022, 11, 25).name, "壬午");
});

test("2026-10-24 辛未: 阳贵 东北, 阴贵 南", () => {
  const p = L.pillar(2026, 10, 24);
  assert.equal(L.STEMS[p.stem], "辛");
  const g = L.gods(p.stem);
  assert.equal(g.yang, 45);
  assert.equal(g.yin, 180);
});

test("2022-11-25 壬: 喜神 南, 财神 南, 福神 东南, 阳贵 东, 阴贵 东南", () => {
  const p = L.pillar(2022, 11, 25);
  assert.equal(L.STEMS[p.stem], "壬");
  assert.deepEqual({ ...L.gods(p.stem) }, { xi: 180, cai: 180, fu: 135, yang: 90, yin: 135 });
});

test("every stem gives five of the eight directions", () => {
  const eight = [0, 45, 90, 135, 180, 225, 270, 315];
  for (let stem = 0; stem < 10; stem++) {
    const g = L.gods(stem);
    for (const k of ["xi", "cai", "fu", "yang", "yin"]) assert.ok(eight.includes(g[k]), `${stem} ${k}`);
  }
});

test("no direction holds more than three gods", () => {
  for (let stem = 0; stem < 10; stem++) {
    const g = L.gods(stem), count = {};
    for (const k of ["xi", "cai", "fu", "yang", "yin"]) count[g[k]] = (count[g[k]] || 0) + 1;
    for (const deg of Object.keys(count)) assert.ok(count[deg] <= 3, `stem ${stem}, ${deg}: ${count[deg]}`);
  }
});

test("sector: 22.5 degrees each way, and null for no compass", () => {
  assert.equal(L.sector(0), 0);
  assert.equal(L.sector(22.4), 0);
  assert.equal(L.sector(22.5), 45);
  assert.equal(L.sector(337.5), 0);
  assert.equal(L.sector(348.75), 0);
  assert.equal(L.sector(null), null);
  assert.equal(L.sector(359), 0);
  assert.equal(L.sector(-10), 0);
});

/* ---- the running app: a fake PAD, a manual clock, and the strings it draws ---- */
const APP = join(ROOT, "registry/apps/luck-compass/index.html");
const SCREEN_W = 216;   /* the app's logical width; 331 px on the smallest phone scales it */

function bootApp(lang, withMotion) {
  const listeners = {};
  const pad = {
    lang,
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    off() {},
    isDown() { return false; },
    sfx() {}
  };
  if (withMotion) pad.motion = { start: () => Promise.resolve("on"), stop() {}, zero() {} };
  const app = boot(APP, { pad, seed: 1 });
  app.ctx.get("openSection")("compass");
  return { app, tilt(t) { (listeners.tilt || []).forEach((fn) => fn(t)); } };
}

async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
}

/* one drawn frame's text, in order; app-vm's first refresh only primes the clock */
function drawnLines(app) {
  const g = app.ctx.get("game").g, real = g.text, lines = [];
  g.text = function (line, x, y, o) { lines.push(String(line)); return real.call(g, line, x, y, o); };
  app.frame();
  app.frame();
  g.text = real;
  return lines;
}

test("the English header: a fixed day ends with the ganzhi and 日, with no ' day '", () => {
  const { app } = bootApp("en", false);
  const dt = { y: 2026, m: 11, d: 23 }, p = app.ctx.get("LUCK").pillar(dt.y, dt.m, dt.d);
  assert.equal(p.name, "辛丑");
  assert.equal(app.ctx.get("offset"), 0, "today, so no prev/next suffix");
  const line = app.ctx.get("headerText")(dt, p);
  assert.equal(line, "Nov 23 · 辛丑日");
  assert.ok(line.endsWith(p.name + "日"));
  assert.ok(!/ day /.test(line));
  assert.ok(app.ctx.get("game").g.measure(line) <= SCREEN_W, `${line} is too wide`);
});

test("without a compass the key line says how to turn the dial, in both languages", () => {
  for (const lang of ["zh", "en"]) {
    const { app } = bootApp(lang, false);
    const g = app.ctx.get("game").g, lines = drawnLines(app);
    const key = lines.find((s) => s.includes("←→"));
    assert.ok(key, `${lang}: the drawn key line has no ←→ turning keys`);
    assert.ok(key.includes("START"), `${lang}: the key line lost START today`);
    assert.ok(g.measure(key) <= SCREEN_W, `${lang}: ${key} is too wide`);
  }
});

test("with a working compass the key line does not claim the turning keys", async () => {
  for (const lang of ["zh", "en"]) {
    const env = bootApp(lang, true);
    await settle();
    env.tilt({ heading: 90, flat: { x: 0, y: 0 } });
    const g = env.app.ctx.get("game").g, lines = drawnLines(env.app);
    assert.ok(!lines.some((s) => s.includes("←→")), `${lang}: ←→ drawn with a compass`);
    const key = lines.find((s) => s.includes("START"));
    assert.ok(key, `${lang}: no key line drawn`);
    assert.ok(!key.includes("←→"));
    assert.ok(g.measure(key) <= SCREEN_W, `${lang}: ${key} is too wide`);
  }
});

function dailySlipData() {
  const html = read("registry/apps/daily-slip/index.html");
  const at = html.indexOf("var DATA =") + "var DATA =".length;
  const start = html.indexOf("[", at);
  let depth = 0, quote = "", escaped = false, end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) { end = i + 1; break; }
  }
  assert.ok(end > start, "found daily-slip DATA array");
  return JSON.parse(JSON.stringify(vm.runInNewContext("(" + html.slice(start, end) + ")")));
}

function bootStored(lang, loadValue, rejectLoad) {
  const listeners = {};
  const saves = new Map(), appends = [];
  const pad = {
    lang,
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    off() {},
    isDown() { return false; },
    sfx() {},
    load(key) { return rejectLoad ? Promise.reject(new Error("broken")) : Promise.resolve(loadValue || saves.get(key) || null); },
    save(key, value) { saves.set(key, { ...value }); },
    notes: { append(title, text) { appends.push({ title, text }); return Promise.resolve("saved"); } }
  };
  const app = boot(APP, { pad, seed: 1 });
  function press(button) {
    (listeners.press || []).forEach((fn) => fn(button));
    app.frame();
    (listeners.release || []).forEach((fn) => fn(button));
    app.frame();
  }
  return { app, saves, appends, press };
}

test("the moved slips and daily slot formula exactly match daily-slip", () => {
  const source = vm.createContext({ console });
  vm.runInContext(read("registry/apps/luck-compass/src/slips.js"), source);
  const slips = source.SLIPS;
  const original = dailySlipData();
  assert.equal(slips.DATA.length, 108);
  assert.deepEqual(JSON.parse(JSON.stringify(slips.DATA)), original);
  assert.equal(slips.count, 108);
  function dailySlot(dateKey) {
    let sum = 0;
    for (let i = 0; i < dateKey.length; i++) sum += dateKey.charCodeAt(i) * (i + 1);
    return sum % original.length;
  }
  for (let i = 0; i < 400; i++) {
    const d = new Date(Date.UTC(2025, 0, 1 + i));
    const key = [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, "0"),
      String(d.getUTCDate()).padStart(2, "0")].join("-");
    assert.equal(slips.slotFor(key), dailySlot(key), key);
  }
});

test("counter opens fortune; a daily draw is saved once and START writes its exact note", async () => {
  const env = bootStored("zh");
  await settle();
  const initial = drawnLines(env.app);
  assert.ok(initial.includes("每日一签"));
  assert.ok(initial.includes("罗盘"));
  env.app.ctx.get("openSection")("fortune");
  env.press("a");
  for (let i = 0; i < 60; i++) env.app.frame();
  await settle();
  const key = env.app.ctx.get("todayKey")();
  const index = env.app.ctx.get("SLIPS").slotFor(key);
  assert.deepEqual(env.saves.get("slip"), { dateKey: key, slip: index, written: false });
  env.press("a");
  assert.deepEqual(env.saves.get("slip"), { dateKey: key, slip: index, written: false });
  env.press("start");
  await settle();
  const item = env.app.ctx.get("SLIPS").DATA[index];
  assert.equal(env.appends.length, 1);
  assert.equal(env.appends[0].title, "每日一签");
  assert.equal(env.appends[0].text, key + "  第" + item.num + "签  " + item.grade.zh + "\n" +
    item.verse.zh.join("\n") + "\n" + item.meaning.zh);
  assert.deepEqual(env.saves.get("slip"), { dateKey: key, slip: index, written: true });
});

test("a rejected slip load is never overwritten, and B returns from both sections", async () => {
  const env = bootStored("zh", null, true);
  await settle();
  env.app.ctx.get("openSection")("fortune");
  env.press("a");
  for (let i = 0; i < 60; i++) env.app.frame();
  await settle();
  assert.equal(env.app.ctx.get("loadFailed"), true);
  assert.equal(env.saves.has("slip"), false);
  env.press("b");
  assert.equal(env.app.ctx.get("section"), "counter");
  env.app.ctx.get("openSection")("compass");
  env.press("b");
  assert.equal(env.app.ctx.get("section"), "counter");
});
