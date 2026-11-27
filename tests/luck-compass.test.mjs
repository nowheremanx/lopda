// registry/apps/luck-compass: the day pillar and the almanac table, with no DOM and no PAD.
// The dates come from printed almanacs; 喜/财/福 match 6tail's lunar library and lunisolar,
// 阳贵/阴贵 match 6tail's POSITION_YANG_GUI / POSITION_YIN_GUI. The last tests boot the
// bundled app in tests/app-vm.mjs to read the header and the key line it draws.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { join } from "node:path";
import { read, ROOT, EMOJI } from "./helpers.mjs";
import { boot, mulberry32 } from "./app-vm.mjs";

const ctx = vm.createContext({ console });
vm.runInContext(read("registry/apps/luck-compass/src/luck.js"), ctx, { filename: "luck.js" });
vm.runInContext(read("registry/apps/luck-compass/src/almanac.js"), ctx, { filename: "almanac.js" });
vm.runInContext(read("registry/apps/luck-compass/src/bazi.js"), ctx, { filename: "bazi.js" });
const L = ctx.LUCK;
const A = ctx.ALMANAC;
const B = ctx.BAZI;

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

test("the moved slips match their frozen catalogue and daily slot formula", () => {
  const source = vm.createContext({ console });
  vm.runInContext(read("registry/apps/luck-compass/src/slips.js"), source);
  const slips = source.SLIPS, data = JSON.parse(JSON.stringify(source.SLIPS.DATA));
  assert.equal(data.length, 108);
  assert.equal(slips.count, 108);
  assert.equal(createHash("sha256").update(JSON.stringify(data)).digest("hex"),
    "f8a880318d7b808d456df17d80faa5537d009d91374256500e2784e44cba97b6");
  for (const [num, zh, en] of [
    [1, "朝露落在木门边", "Dew on the wooden gate"],
    [2, "小雨拂过旧墙", "Rain brushes the old wall"],
    [54, "池塘的荷叶托着一颗水珠", "A leaf holds one water drop"],
    [108, "黄昏时摊子一个一个收", "At dusk the stalls fold up"]
  ]) {
    assert.equal(data[num - 1].verse.zh[0], zh, `slip ${num} Chinese first line`);
    assert.equal(data[num - 1].verse.en[0], en, `slip ${num} English first line`);
  }
  const grades = { "上上": "Excellent", "上": "Good", "中": "Fair" };
  const firsts = { zh: new Set(), en: new Set() };
  for (const [i, item] of data.entries()) {
    assert.equal(item.num, i + 1, `slip ${i + 1} number`);
    assert.equal(grades[item.grade.zh], item.grade.en, `slip ${item.num} grade in both languages`);
    assert.equal(item.verse.zh.length, 3, `slip ${item.num} Chinese verse`);
    assert.equal(item.verse.en.length, 3, `slip ${item.num} English verse`);
    for (const lang of ["zh", "en"]) {
      for (const line of item.verse[lang]) {
        assert.equal(typeof line, "string", `slip ${item.num} ${lang} verse line`);
        assert.ok(line.trim().length > 1, `slip ${item.num} ${lang} verse is not empty`);
        assert.doesNotMatch(line, EMOJI, `slip ${item.num} ${lang} verse has no emoji`);
      }
      const first = item.verse[lang][0];
      assert.ok(!firsts[lang].has(first), `${lang} first line is unique: ${first}`);
      firsts[lang].add(first);
      assert.equal(typeof item.meaning[lang], "string", `slip ${item.num} ${lang} meaning`);
      assert.ok(item.meaning[lang].trim().length > 5, `slip ${item.num} ${lang} meaning is present`);
      assert.doesNotMatch(item.meaning[lang], EMOJI, `slip ${item.num} ${lang} meaning has no emoji`);
    }
  }
  function dailySlot(dateKey) {
    let sum = 0;
    for (let i = 0; i < dateKey.length; i++) sum += dateKey.charCodeAt(i) * (i + 1);
    return sum % 108;
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

test("YI defines the 64 King Wen hexagrams as distinct lower-first line patterns", () => {
  const yiCtx = vm.createContext({ console });
  vm.runInContext(read("registry/apps/luck-compass/src/yi.js"), yiCtx, { filename: "yi.js" });
  const Y = yiCtx.YI, hexagrams = Y.HEXAGRAMS;
  assert.equal(hexagrams.length, 64);
  assert.deepEqual([...hexagrams.map((h) => h.number)], Array.from({ length: 64 }, (_, i) => i + 1));
  assert.equal(new Set(hexagrams.map((h) => h.lines.join(""))).size, 64);
  for (const h of hexagrams) {
    assert.deepEqual([...h.lines], [...h.lower.lines, ...h.upper.lines], h.name);
    assert.ok(h.judgment && /[\u3400-\u9fff]/.test(h.judgment), `${h.number} judgment`);
    assert.ok(h.image && /[\u3400-\u9fff]/.test(h.image), `${h.number} image`);
    assert.ok(h.english && h.english.length < 90, `${h.number} English gloss`);
  }
  for (const [name, pattern, number] of [
    ["乾", "111111", 1], ["坤", "000000", 2], ["泰", "111000", 11],
    ["否", "000111", 12], ["既济", "101010", 63], ["未济", "010101", 64]
  ]) {
    assert.equal(Y.byName(name).number, number);
    assert.equal(Y.byName(name).lines.join(""), pattern);
  }
  assert.equal(Y.byName("屯").number, 3);
  assert.equal(Y.byName("屯").lower.name, "震");
  assert.equal(Y.byName("屯").upper.name, "坎");
  assert.equal(Y.byName("蒙").number, 4);
  assert.equal(Y.byLines([1, 1, 1, 0, 0, 0]).short, "泰");
  assert.equal(Y.primary([9, 7, 8, 6, 7, 8]).number,
    Y.byLines([1, 1, 0, 0, 1, 0]).number);
  assert.deepEqual([...Y.TRIGRAMS[0].lines], [1, 1, 1]);
  assert.equal(Y.TRIGRAMS[5].direction, 0);
});

test("YI changing lines and three-coin casting are reproducible and balanced", () => {
  const yiCtx = vm.createContext({ console });
  vm.runInContext(read("registry/apps/luck-compass/src/yi.js"), yiCtx);
  const Y = yiCtx.YI, lines = [9, 7, 8, 6, 7, 8], changed = Y.changed(lines);
  assert.equal(changed.lines[0], 0);
  assert.equal(changed.lines[3], 1);
  assert.deepEqual([...Y.changingLines(lines)], [1, 4]);
  assert.equal(Y.changed([7, 8, 7, 8, 7, 8]), null);
  const first = mulberry32(123), one = Array.from({ length: 6 }, () => Y.castLine(first));
  const next = mulberry32(123), two = Array.from({ length: 6 }, () => Y.castLine(next));
  assert.deepEqual(one, two);
  const rng = mulberry32(827), counts = { 6: 0, 7: 0, 8: 0, 9: 0 };
  for (let i = 0; i < 40000; i++) counts[Y.castLine(rng)]++;
  for (const [line, expected] of [[6, 5000], [7, 15000], [8, 15000], [9, 5000]]) {
    assert.ok(Math.abs(counts[line] - expected) <= 600, `${line}: ${counts[line]}`);
  }
});

test("a hexagram cast saves each line, resumes today, and never overwrites a rejected save", async () => {
  const env = bootStored("zh");
  await settle();
  env.app.ctx.get("openSection")("hexagram");
  for (let i = 0; i < 6; i++) {
    env.press("a");
    for (let frame = 0; frame < 32; frame++) env.app.frame();
    await settle();
    assert.equal(env.saves.get("gua").lines.length, i + 1);
  }
  const save = env.saves.get("gua"), day = env.app.ctx.get("todayKey")();
  assert.deepEqual(save, { v: 1, day, lines: save.lines });
  assert.equal(env.app.ctx.get("sectionSummary")("hexagram").includes(env.app.ctx.get("YI").primary(save.lines).name), true);
  const resumed = bootStored("zh", save);
  await settle();
  resumed.app.ctx.get("openSection")("hexagram");
  assert.deepEqual([...resumed.app.ctx.get("guaState").lines], save.lines);
  resumed.press("a");
  for (let frame = 0; frame < 40; frame++) resumed.app.frame();
  assert.equal(resumed.app.ctx.get("guaState").lines.length, 6);
  const rejected = bootStored("zh", null, true);
  await settle();
  rejected.app.ctx.get("openSection")("hexagram");
  rejected.press("a");
  for (let frame = 0; frame < 32; frame++) rejected.app.frame();
  await settle();
  assert.equal(rejected.app.ctx.get("guaState").failed, true);
  assert.equal(rejected.saves.has("gua"), false);
});

test("every visible hexagram and trigram-chart string fits the canvas in both languages", async () => {
  for (const lang of ["zh", "en"]) {
    const env = bootStored(lang);
    await settle();
    env.app.ctx.get("openSection")("hexagram");
    env.app.ctx.get("guaState").lines = [9, 7, 8, 6, 7, 8];
    const g = env.app.ctx.get("game").g, castLines = drawnLines(env.app);
    for (const line of castLines) assert.ok(g.measure(line) <= SCREEN_W, `${lang} cast: ${line}`);
    env.press("select");
    env.press("right");
    env.press("a");
    const chartLines = drawnLines(env.app);
    for (const line of chartLines) assert.ok(g.measure(line) <= SCREEN_W, `${lang} chart: ${line}`);
    assert.ok(chartLines.includes(lang === "en" ? "Image Earth" : "卦象 地"));
    assert.ok(chartLines.includes(lang === "en" ? "Family mother" : "家人 母"));
    assert.ok(chartLines.includes(lang === "en" ? "Direction SW" : "方位 西南"));
  }
});

test("BAZI pillars, 子初换日, 纳音 and visible-element counts match reference charts", () => {
  function names(chart) {
    return ["year", "month", "day", "hour"].map((key) =>
      chart[key] === null ? null : A.name(chart[key]));
  }
  const beforeSpring = B.chart(1990, 1, 15, 10);
  assert.deepEqual(names(beforeSpring), ["己巳", "丁丑", "庚辰", "辛巳"]);
  assert.deepEqual({ ...beforeSpring.nayin },
    { year: "大林木", month: "涧下水", day: "白蜡金", hour: "白蜡金" });
  assert.equal(beforeSpring.dayMaster, "庚金");
  const late = B.chart(1992, 8, 8, 23);
  assert.deepEqual(names(late), ["壬申", "戊申", "丁巳", "庚子"]);
  assert.deepEqual({ ...late.nayin },
    { year: "剑锋金", month: "大驿土", day: "沙中土", hour: "壁上土" });
  assert.deepEqual(names(B.chart(1992, 8, 8, 22)), ["壬申", "戊申", "丙辰", "己亥"]);
  const noon = B.chart(1985, 6, 1, 12);
  assert.deepEqual(names(noon), ["乙丑", "辛巳", "辛未", "甲午"]);
  assert.deepEqual({ ...noon.nayin },
    { year: "海中金", month: "白蜡金", day: "路旁土", hour: "沙中金" });
  assert.equal(noon.dayMaster, "辛金");
  assert.deepEqual({ ...noon.counts }, { 木: 2, 火: 2, 土: 2, 金: 2, 水: 0 });
  const unknown = B.chart(1985, 6, 1, null);
  assert.deepEqual(names(unknown), ["乙丑", "辛巳", "辛未", null]);
  assert.deepEqual({ ...unknown.counts }, { 木: 1, 火: 1, 土: 2, 金: 2, 水: 0 });
  assert.equal(B.nayin(0), "海中金");
  assert.equal(B.nayin(59), "大海水");
  assert.equal(B.valid(1900, 1, 1), true);
  assert.equal(B.valid(2100, 12, 31), true);
  assert.equal(B.valid(1900, 2, 29), false);
  assert.equal(B.valid(2101, 1, 1), false);
});

test("八字 picker saves a birth chart and shows its counter summary", async () => {
  const env = bootStored("zh");
  await settle();
  env.app.ctx.get("openSection")("bazi");
  assert.equal(env.app.ctx.get("baziState").picker, true);
  assert.ok(drawnLines(env.app).includes("八字 · 填写"));
  for (let i = 0; i < 5; i++) env.press("down");
  env.press("right");
  for (let i = 0; i < 5; i++) env.press("up");
  env.press("right");
  env.press("right");
  for (let i = 0; i < 7; i++) env.press("up");
  env.press("a");
  assert.deepEqual(env.saves.get("bazi"), { v: 1, y: 1985, m: 6, d: 1, hour: 11 });
  assert.equal(env.app.ctx.get("baziState").chart.dayMaster, "辛金");
  env.press("b");
  const counter = drawnLines(env.app);
  assert.ok(counter.includes("日主 辛金"));
});

test("八字 rejected reads are not saved; invalid schemas wait for A before overwrite", async () => {
  const rejected = bootStored("zh", null, true);
  await settle();
  rejected.app.ctx.get("openSection")("bazi");
  assert.ok(drawnLines(rejected.app).some((line) => line.includes("存档读不出，这次不会保存")));
  rejected.press("a");
  assert.equal(rejected.saves.has("bazi"), false);

  const invalid = bootStored("zh", { v: 2, y: 1985, m: 6, d: 1, hour: 11 });
  await settle();
  invalid.app.ctx.get("openSection")("bazi");
  assert.equal(invalid.app.ctx.get("baziState").picker, true);
  assert.equal(invalid.saves.has("bazi"), false);
  invalid.press("a");
  assert.deepEqual(invalid.saves.get("bazi"), { v: 1, y: 1990, m: 1, d: 1, hour: null });
});

test("八字 picker and chart strings fit 216px in both languages", async () => {
  for (const lang of ["zh", "en"]) {
    const env = bootStored(lang);
    await settle();
    env.app.ctx.get("openSection")("bazi");
    let g = env.app.ctx.get("game").g;
    for (const line of drawnLines(env.app)) assert.ok(g.measure(line) <= SCREEN_W, `${lang} picker: ${line}`);
    const state = env.app.ctx.get("baziState");
    state.y = 1985; state.m = 6; state.d = 1; state.hour = 11;
    state.saved = { v: 1, y: 1985, m: 6, d: 1, hour: 11 };
    state.chart = B.chart(1985, 6, 1, 11);
    state.picker = true;
    for (const line of drawnLines(env.app)) assert.ok(g.measure(line) <= SCREEN_W, `${lang} sample picker: ${line}`);
    state.picker = false;
    const chartLines = drawnLines(env.app);
    for (const line of chartLines) assert.ok(g.measure(line) <= SCREEN_W, `${lang} chart: ${line}`);
    assert.ok(chartLines.includes(lang === "en" ? "Na Yin" : "纳音"));
    if (lang === "en") assert.equal(env.app.ctx.get("sectionSummary")("bazi"), "Day master 辛 Metal");
  }
});

test("八字 chart text never overlaps vertically in either language or hour mode", async () => {
  for (const lang of ["zh", "en"]) for (const hour of [11, null]) {
    const env = bootStored(lang);
    await settle();
    const state = env.app.ctx.get("baziState"), bazi = env.app.ctx.get("BAZI");
    state.saved = { v: 1, y: 1992, m: 2, d: 1, hour };
    state.chart = bazi.chart(1992, 2, 1, hour);
    state.loaded = true;
    const g = env.app.ctx.get("game").g, real = g.text, calls = [];
    g.text = function (text, x, y, options) {
      const opts = options || {}, width = g.measure(String(text));
      let left = x;
      if (opts.align === "center") left -= width / 2;
      else if (opts.align === "right") left -= width;
      calls.push({ text: String(text), x: left, right: left + width, y });
      return real.call(g, text, x, y, options);
    };
    try {
      env.app.ctx.get("drawBaziChart")(g);
    } finally {
      g.text = real;
    }
    for (const line of calls) assert.ok(line.y + 12 <= 240, `${lang}/${hour}: ${line.text} at ${line.y}`);
    for (let i = 0; i < calls.length; i++) for (let j = i + 1; j < calls.length; j++) {
      const a = calls[i], b = calls[j];
      if (a.x < b.right && b.x < a.right) {
        assert.ok(Math.abs(a.y - b.y) >= 12,
          `${lang}/${hour}: "${a.text}" at ${a.y} overlaps "${b.text}" at ${b.y}`);
      }
    }
  }
});
