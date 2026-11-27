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
vm.runInContext(read("registry/apps/luck-compass/src/almanac.js"), ctx, { filename: "almanac.js" });
const L = ctx.LUCK;
const A = ctx.ALMANAC;

test("almanac lunar dates and solar terms match the runtime tables", () => {
  const runtime = vm.createContext({ console });
  runtime.window = runtime;
  vm.runInContext(read("runtime/lunar.js"), runtime, { filename: "runtime/lunar.js" });
  const calendar = runtime.LopdaLunar;
  function check(y, m, d) {
    const got = A.lunar(y, m, d), expected = calendar.fromSolar(y, m, d);
    assert.deepEqual(got && { year: got.year, month: got.month, day: got.day, leap: got.leap },
      expected && { year: expected.year, month: expected.month, day: expected.day, leap: expected.leap },
      `${y}-${m}-${d} lunar`);
    assert.equal(A.term(y, m, d), calendar.term(y, m, d), `${y}-${m}-${d} term`);
  }
  for (let y = 2020; y <= 2030; y++) {
    const end = new Date(Date.UTC(y, 11, 31));
    for (let d = new Date(Date.UTC(y, 0, 1)); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      check(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }
  for (const y of [1901, 1950, 2099]) {
    for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) {
      check(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }
});

test("almanac pillars follow 立春 and 节 boundaries", () => {
  assert.equal(A.name(A.pillars(2000, 1, 1).day), "戊午");
  assert.equal(A.name(A.pillars(2026, 2, 3).year), "乙巳");
  assert.equal(A.name(A.pillars(2026, 2, 3).month), "己丑");
  assert.equal(A.name(A.pillars(2026, 2, 4).year), "丙午");
  assert.equal(A.name(A.pillars(2026, 2, 4).month), "庚寅");
  assert.equal(A.name(A.pillars(2026, 3, 5).month), "辛卯");
  assert.equal(A.name(A.pillars(2026, 3, 4).month), "庚寅");
  const p = A.pillars(2026, 11, 27);
  assert.deepEqual({ year: A.name(p.year), month: A.name(p.month), day: A.name(p.day) },
    { year: "丙午", month: "己亥", day: "乙巳" });
});

test("Chinese almanac lunar dates use printed month and day names", () => {
  const { app } = bootApp("zh", false), format = app.ctx.get("almanacLunarText");
  const current = A.lunar(2026, 11, 27);
  assert.deepEqual({ month: current.month, day: current.day, leap: current.leap },
    { month: 10, day: 19, leap: false });
  assert.equal(format(current), "农历十月十九");
  assert.equal(format(A.lunar(2026, 2, 17)), "农历正月初一");
  const leap = A.lunar(2025, 8, 1);
  assert.equal(leap.leap, true);
  assert.equal(leap.month, 6);
  assert.equal(format(leap), "农历闰六月初八");
});

test("almanac day rules and lunar-javascript 宜忌 match reference dates", () => {
  const cases = [
    [2026, 11, 27, "破", "勾陈", false, "己亥", "猪", "东",
      ["乙不栽植千株不长", "巳不远行财物伏藏"],
      ["祭祀", "解除", "破屋", "坏垣", "求医", "治病", "馀事勿取"], ["嫁娶", "安葬"]],
    [2026, 2, 3, "危", "司命", true, "壬寅", "虎", "南", null,
      ["沐浴", "开仓", "出货财", "开市", "交易", "立券", "纳财", "栽种", "纳畜", "牧养", "畋猎", "入殓", "破土", "安葬"],
      ["祈福", "嫁娶", "安床", "入宅", "造船"]],
    [2026, 2, 4, "危", "玄武", false, "癸卯", "兔", "东", null,
      ["祭祀", "祈福", "求嗣", "开光", "出火", "出行", "拆卸", "修造", "动土", "入宅", "移徙", "上梁", "挂匾", "开池", "入殓", "安葬", "破土", "启钻"],
      ["嫁娶", "作灶", "安床"]],
    [2000, 1, 1, "破", "司命", true, "壬子", "鼠", "北", null,
      ["破屋", "坏垣", "祭祀", "沐浴", "馀事勿取"], ["诸事不宜"]],
    [2024, 6, 15, "定", "天刑", false, "甲辰", "龙", "北", null,
      ["嫁娶", "祭祀", "开光", "祈福", "求嗣", "出行", "出火", "拆卸", "动土", "修造", "进人口", "入宅", "移徙", "安床", "挂匾", "交易", "立券", "栽种", "纳畜", "入殓", "破土", "启钻", "安葬"],
      ["无"]],
    [2030, 12, 31, "建", "金匮", true, "甲午", "马", "南", null,
      ["教牛马", "馀事勿取"], ["入宅", "动土", "破土"]]
  ];
  for (const [y, m, d, jianchu, god, huangdao, chong, zodiac, sha, pengzu, yi, ji] of cases) {
    const actual = A.day(y, m, d);
    assert.equal(actual.jianchu, jianchu);
    assert.equal(actual.god, god);
    assert.equal(actual.huangdao, huangdao);
    assert.deepEqual({ ...actual.chong }, { pillar: chong, zodiac });
    assert.equal(actual.sha, sha);
    if (pengzu) assert.deepEqual([...actual.pengzu], pengzu);
    assert.deepEqual([...actual.yi], yi);
    assert.deepEqual([...actual.ji], ji);
  }
  const boundary = A.day(2026, 3, 5);
  assert.equal(boundary.jianchu, "闭");
  assert.equal(boundary.god, "青龙");
  assert.equal(boundary.huangdao, true);
  assert.deepEqual([...boundary.ji], ["祭祀", "开光", "嫁娶", "入宅"]);
});

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

test("the counter starts with the almanac, and its day links to the same compass day", async () => {
  const env = bootStored("zh");
  await settle();
  const first = drawnLines(env.app);
  assert.ok(first.includes("老黄历"));
  assert.ok(first.some((line) => line.startsWith("宜 ")), "today's almanac summary starts with 宜");
  assert.ok(first.includes("每日一签"));
  assert.ok(first.includes("罗盘"));
  env.press("a");
  assert.equal(env.app.ctx.get("section"), "almanac");
  env.press("right");
  assert.equal(env.app.ctx.get("almanacOffset"), 1);
  env.press("start");
  assert.equal(env.app.ctx.get("almanacOffset"), 0);
  for (let i = 0; i < 20; i++) env.press("down");
  env.press("a");
  assert.equal(env.app.ctx.get("section"), "compass");
  assert.equal(env.app.ctx.get("offset"), env.app.ctx.get("almanacOffset"));
  env.press("b");
  env.press("a");
  for (let i = 0; i < 20; i++) env.press("down");
  const godsY = 56 + (env.app.ctx.get("almanacGodsLine") - env.app.ctx.get("almanacScroll")) * 14 + 4;
  env.app.pointer("pointerdown", 100, godsY, 216, 240);
  env.app.frame();
  assert.equal(env.app.ctx.get("section"), "compass", "tapping the visible gods row opens its matching compass");
});

test("all drawn almanac strings for 2026-11-27 fit the 216px canvas in both languages", () => {
  for (const lang of ["zh", "en"]) {
    const { app } = bootApp(lang, false);
    app.ctx.get("openSection")("almanac");
    const today = new Date();
    const target = new Date(2026, 10, 27, 12);
    const delta = Math.round((target - new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)) / 86400000);
    for (let i = 0; i < delta; i++) app.ctx.get("moveAlmanac")(1);
    for (let i = 0; i > delta; i--) app.ctx.get("moveAlmanac")(-1);
    const g = app.ctx.get("game").g, lines = drawnLines(app);
    for (const line of lines) assert.ok(g.measure(line) <= SCREEN_W, `${lang}: ${line} is too wide`);
    const allRows = app.ctx.get("pageLines")(g, { y: 2026, m: 11, d: 27, week: 5 },
      app.ctx.get("ALMANAC").day(2026, 11, 27));
    for (const line of allRows) assert.ok(g.measure(line) <= SCREEN_W, `${lang}: ${line} is too wide`);
    if (lang === "en") assert.ok(allRows.some((line) => line.includes("Horse")));
    else assert.ok(allRows.includes("农历十月十九"));
    const godsAt = app.ctx.get("almanacGodsLine"), godsCount = app.ctx.get("almanacGodsLineCount");
    assert.equal(godsCount, 2);
    assert.ok(!allRows[godsAt].includes("…") && !allRows[godsAt + 1].includes("…"));
    assert.ok(allRows[godsAt].includes("喜神") && allRows[godsAt].includes("财神"));
    assert.ok(allRows[godsAt + 1].includes("福神"));
    assert.ok(allRows.some((line) => line.includes("治病")), "the activity remains an unbroken term");
    assert.ok(!allRows.some((line) => /治$/.test(line) || /^病/.test(line)), "activity terms do not split");
    const continuation = app.ctx.get("almanacRowIndents");
    assert.ok(continuation.some((indent) => indent > 0), "continued activity rows indent beneath their terms");
  }
});

test("almanac counter summary keeps 忌/Avoid visible with one term of each kind", () => {
  for (const lang of ["zh", "en"]) {
    const { app } = bootApp(lang, false), summary = app.ctx.get("sectionSummary")("almanac");
    assert.ok(summary.includes(lang === "zh" ? "忌" : "Avoid"));
    assert.ok(summary.includes("祭祀"));
    assert.ok(summary.includes("嫁娶"));
    assert.ok(app.ctx.get("game").g.measure(summary) <= 134, `${lang}: ${summary} is too wide`);
  }
});

test("the counter's 32px rows leave room for all five sections", () => {
  const { app } = bootApp("zh", false), sections = app.ctx.get("SECTIONS");
  const g = app.ctx.get("game").g, real = g.text, placed = [];
  sections.push({ id: "dummy-4", name: "测试四" }, { id: "dummy-5", name: "测试五" });
  g.text = function (text, x, y, options) { placed.push({ text: String(text), y }); return real.call(g, text, x, y, options); };
  try {
    app.ctx.get("drawCounter")(g);
    const last = placed.find((item) => item.text === "测试五");
    assert.ok(last);
    assert.equal(last.y, 43 + 4 * 34 + 7);
    assert.ok(last.y + 12 < 210, "fifth row and divider fit above the footer");
  } finally {
    g.text = real;
    sections.pop();
    sections.pop();
  }
});
