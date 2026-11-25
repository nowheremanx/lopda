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
