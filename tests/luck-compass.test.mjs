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

function bootStored(lang, loadValue, rejectLoad) {
  const listeners = {};
  const saves = new Map(), saveCalls = [], removeCalls = [], loadCalls = [], appends = [];
  const pad = {
    lang,
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    off() {},
    isDown() { return false; },
    sfx() {},
    load(key) { loadCalls.push(key); return rejectLoad ? Promise.reject(new Error("broken")) : Promise.resolve(loadValue instanceof Map ? loadValue.get(key) || null : loadValue || saves.get(key) || null); },
    save(key, value) { saves.set(key, { ...value }); saveCalls.push({ key, value: { ...value } }); },
    remove(key) { removeCalls.push(key); },
    notes: { append(title, text) { appends.push({ title, text }); return Promise.resolve("saved"); } }
  };
  const app = boot(APP, { pad, seed: 1 });
  function press(button) {
    (listeners.press || []).forEach((fn) => fn(button));
    app.frame();
    (listeners.release || []).forEach((fn) => fn(button));
    app.frame();
  }
  return { app, saves, saveCalls, removeCalls, loadCalls, appends, press };
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
  for (let i = 0; i < 150; i++) env.app.frame();
  await settle();
  const key = env.app.ctx.get("todayKey")();
  const index = env.app.ctx.get("SLIPS").slotFor(key);
  assert.deepEqual(env.saves.get("slip"), { dateKey: key, slip: index, written: false });
  assert.equal(env.saveCalls.filter((call) => call.key === "slip").length, 1, "drawing persists once");
  const buttons = drawnLines(env.app);
  assert.ok(buttons.includes("写入记事本"));
  assert.ok(buttons.includes("不写"));
  env.press("start");
  await settle();
  const item = env.app.ctx.get("SLIPS").DATA[index];
  assert.equal(env.appends.length, 1);
  assert.equal(env.appends[0].title, "每日一签");
  assert.equal(env.appends[0].text, key + "  第" + item.num + "签  " + item.grade.zh + "\n" +
    item.verse.zh.join("\n") + "\n" + item.meaning.zh);
  assert.deepEqual(env.saves.get("slip"), { dateKey: key, slip: index, written: true });
});

test("Right then A skips without writing or changing the saved draw; Left then A writes once", async () => {
  const skipped = bootStored("zh");
  await settle();
  skipped.app.ctx.get("openSection")("fortune");
  skipped.press("a");
  for (let i = 0; i < 150; i++) skipped.app.frame();
  await settle();
  const original = { ...skipped.saves.get("slip") };
  skipped.press("right");
  skipped.press("a");
  await settle();
  assert.equal(skipped.app.ctx.get("slipSkipped"), true);
  assert.deepEqual(skipped.appends, []);
  assert.deepEqual(skipped.saves.get("slip"), original, "skip does not save a new choice");
  assert.ok(drawnLines(skipped.app).includes("今天已抽 · 明天再来"));
  skipped.press("a");
  assert.deepEqual(skipped.appends, [], "the hidden choice cannot be confirmed again");

  const written = bootStored("zh");
  await settle();
  written.app.ctx.get("openSection")("fortune");
  written.press("a");
  for (let i = 0; i < 150; i++) written.app.frame();
  await settle();
  written.press("right");
  written.press("left");
  written.press("a");
  await settle();
  assert.equal(written.appends.length, 1);
  assert.equal(written.saves.get("slip").written, true);
});

test("slip text and both choices fit, and a tap on Skip marks only this visit", async () => {
  for (const lang of ["zh", "en"]) {
    const env = bootStored(lang);
    await settle();
    env.app.ctx.get("openSection")("fortune");
    env.app.ctx.get("slipState").slip = 0;
    const lines = drawnLines(env.app), g = env.app.ctx.get("game").g;
    for (const line of lines) assert.ok(g.measure(line) <= SCREEN_W, `${lang}: ${line} is too wide`);
    assert.ok(lines.includes(lang === "zh" ? "写入记事本" : "To notes"));
    assert.ok(lines.includes(lang === "zh" ? "不写" : "Skip"));
    if (lang === "zh") {
      env.app.pointer("pointerdown", 160, 190, 216, 240);
      env.app.frame();
      assert.equal(env.app.ctx.get("slipSkipped"), true);
      assert.equal(env.appends.length, 0);
    }
  }
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

test("almanac A and taps do nothing; page navigation stays on the almanac", async () => {
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
  env.press("a");
  assert.equal(env.app.ctx.get("section"), "almanac");
  env.app.pointer("pointerdown", 100, 140, 216, 240);
  env.app.frame();
  assert.equal(env.app.ctx.get("section"), "almanac", "tapping the page does not open the compass");
  assert.equal(env.app.ctx.get("offset"), 0);
});

test("almanac SELECT opens the glossary and B returns to the same day", async () => {
  const env = bootStored("zh");
  await settle();
  env.app.ctx.get("openSection")("almanac");
  env.press("right");
  const day = env.app.ctx.get("almanacOffset");
  const keyLines = drawnLines(env.app).filter((line) => line.includes("SELECT") || line.includes("START"));
  assert.ok(keyLines.some((line) => line.includes("SELECT")));
  assert.ok(!keyLines.some((line) => line.includes("神位") || line.includes("gods")));
  for (const line of keyLines) assert.ok(env.app.ctx.get("game").g.measure(line) <= SCREEN_W);
  env.press("select");
  assert.equal(env.app.ctx.get("almanacGlossary"), true);
  const lines = drawnLines(env.app);
  assert.ok(lines.includes("建除十二值"));
  env.press("b");
  assert.equal(env.app.ctx.get("almanacGlossary"), false);
  assert.equal(env.app.ctx.get("almanacOffset"), day);
});

test("the almanac touch scroller tracks pixels and clamps at both ends", async () => {
  const env = bootStored("zh");
  await settle();
  env.app.ctx.get("openSection")("almanac");
  env.app.frame();
  env.app.pointer("pointerdown", 100, 135, 216, 240);
  env.app.frame();
  env.app.pointer("pointermove", 100, 75, 216, 240);
  env.app.frame();
  env.app.pointer("pointerup", 100, 75, 216, 240);
  env.app.frame();
  const scroller = env.app.ctx.get("almanacScroller");
  assert.ok(scroller.offset >= 55 && scroller.offset <= 65, `-60px drag -> ${scroller.offset}px`);
  env.app.pointer("pointerdown", 100, 135, 216, 240);
  env.app.frame();
  env.app.pointer("pointermove", 100, -465, 216, 240);
  env.app.frame();
  env.app.pointer("pointerup", 100, -465, 216, 240);
  env.app.frame();
  assert.equal(scroller.offset, scroller.max, "a long drag clamps to the final pixel");
});

test("the almanac page peels from the bottom-right: page beneath at the corner, flap past the fold, old page beyond", async () => {
  const env = bootStored("zh");
  await settle();
  env.app.ctx.get("openSection")("almanac");
  env.app.frame();
  const g = env.app.ctx.get("game").g;
  /* stand-in pages of one flat tone each: tomorrow dark, today paper; the flap is mid */
  env.app.ctx.get("(drawAlmanacPage = function (g, offset) { g.rect(8, 36, 200, 171, offset === 1 ? g.DARK : g.PAPER); })");
  env.app.ctx.get("drawPeel")(g, 1, 0, 0, 0.25);
  const len = Math.hypot(199, 170), ux = -199 / len, uy = -170 / len, d = 0.25 * (len + 8);
  const at = (dist) => g.get(Math.round(207 + ux * dist), Math.round(206 + uy * dist));
  assert.equal(at(d * 0.4), g.DARK, "beside the corner the page beneath shows");
  assert.equal(at(d * 1.5), g.MID, "past the fold lies the folded-back flap");
  assert.equal(at(d * 2.6), g.PAPER, "beyond the flap the old page is still there");
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
    const layout = app.ctx.get("pageLayout")(g, { y: 2026, m: 11, d: 27, week: 5 },
      app.ctx.get("ALMANAC").day(2026, 11, 27));
    const allRows = [layout.dateLine, layout.lunar, layout.pillars]
      .concat(layout.boxes.flatMap((box) => [box.title, ...box.lines]))
      .concat(layout.rows.flatMap((row) => [row.label, row.text]));
    for (const line of allRows) if (line) assert.ok(g.measure(line) <= SCREEN_W, `${lang}: ${line} is too wide`);
    assert.deepEqual(layout.boxes.map((box) => box.title), ["宜", "忌"]);
    if (lang === "en") assert.ok(layout.pillars.includes("Horse"));
    else assert.equal(layout.lunar, "农历十月十九");
    assert.ok(layout.boxes[0].lines.some((line) => line.includes("治病")), "activity terms stay whole");
  }
});

test("almanac counter summary keeps 忌/Avoid visible with one term of each kind", () => {
  for (const lang of ["zh", "en"]) {
    const { app } = bootApp(lang, false), summary = app.ctx.get("sectionSummary")("almanac");
    assert.ok(summary.includes(lang === "zh" ? "忌" : "Avoid"));
    /* today's terms change every day; the summary always opens with 宜 / Do and keeps 忌 / Avoid */
    assert.ok(summary.startsWith(lang === "zh" ? "宜 " : "Do "));
    assert.ok(app.ctx.get("game").g.measure(summary) <= 128, `${lang}: ${summary} is too wide`);
  }
});

test("the counter's four 32px rows sit under the banner and above the key line", () => {
  const { app } = bootApp("zh", false), sections = app.ctx.get("SECTIONS");
  const g = app.ctx.get("game").g, real = g.text, placed = [];
  assert.equal(sections.length, 4);
  assert.deepEqual([...sections.map((row) => row.name)], ["老黄历", "每日一签", "罗盘", "八卦"]);
  assert.ok(!sections.some((row) => row.name.includes("八字")));
  g.text = function (text, x, y, options) { placed.push({ text: String(text), y }); return real.call(g, text, x, y, options); };
  try {
    app.ctx.get("drawCounter")(g);
    const last = placed.find((item) => item.text === sections[3].name);
    assert.ok(last);
    assert.equal(last.y, 50 + 3 * 32 + 9);
    assert.ok(last.y + 12 < 214, "fourth row fits above the key line");
  } finally {
    g.text = real;
  }
});

test("the art: a 216 x 48 banner and 16 x 16 icons in the four tones; the app icon is the manifest's", () => {
  const ctx2 = vm.createContext({});
  vm.runInContext(read("registry/apps/luck-compass/src/art.js"), ctx2);
  const ART = vm.runInContext("ART", ctx2);
  assert.equal(ART.BANNER.length, 48);
  for (const row of ART.BANNER) assert.match(row, /^[0-3]{216}$/);
  for (const id of ["almanac", "fortune", "compass", "hexagram", "bazi", "app"]) {
    assert.equal(ART.ICONS[id].length, 16, id);
    for (const row of ART.ICONS[id]) assert.match(row, /^[0-3.]{16}$/, id);
  }
  const manifest = JSON.parse(read("registry/apps/luck-compass/manifest.json"));
  assert.deepEqual(manifest.icon, [...ART.ICONS.app]);
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

test("ZHOUYI holds the received line texts and matching small images", () => {
  const source = vm.createContext({});
  vm.runInContext(read("registry/apps/luck-compass/src/zhouyi.js"), source);
  const table = source.ZHOUYI;
  assert.equal(table.length, 64);
  for (let i = 0; i < table.length; i++) {
    const count = i < 2 ? 7 : 6;
    assert.equal(table[i].yao.length, count, `hexagram ${i + 1} yao count`);
    assert.equal(table[i].small.length, count, `hexagram ${i + 1} small count`);
    for (const [label, text] of table[i].yao) {
      assert.ok(label && text.trim(), `hexagram ${i + 1} has a non-empty line`);
    }
    for (const text of table[i].small) assert.ok(text.trim(), `hexagram ${i + 1} has a non-empty small`);
  }
  assert.equal(table[0].yao[0][1], "潜龙勿用。");
  assert.ok(table[10].yao[2][1].startsWith("无平不陂"));
  assert.ok(table[63].yao[5][1].startsWith("有孚于饮酒"));
});

test("guaReading follows the seven changing-line rules and cites the matching line images", async () => {
  const { app } = bootApp("zh", false);
  await settle();
  const readGua = app.ctx.get("guaReading"), Y = app.ctx.get("YI"), source = app.ctx.get("ZHOUYI");
  function reading(lines) { return Array.from(readGua(lines), (row) => ({ kind: row.kind, text: row.text })); }
  function quoted(lines) { return reading(lines).filter((row) => row.kind === "text").map((row) => row.text); }
  const fixed = [7, 8, 7, 8, 7, 8], primary = Y.primary(fixed);
  let result = reading(fixed);
  assert.equal(result[0].kind, "rule");
  assert.equal(result[0].text.zh, app.ctx.get("EXPLAIN").RULES[0].zh);
  assert.deepEqual(quoted(fixed), ["卦辞：" + primary.judgment]);
  assert.equal(result.at(-1).kind, "source");

  const one = [9, 8, 7, 8, 7, 8], h1 = Y.primary(one), q1 = source[h1.number - 1];
  assert.deepEqual(quoted(one), [q1.yao[0][0] + "：" + q1.yao[0][1], "象曰：" + q1.small[0]]);
  const two = [9, 6, 7, 8, 7, 8], q2 = source[Y.primary(two).number - 1];
  assert.deepEqual(quoted(two), [q2.yao[1][0] + "：" + q2.yao[1][1], "象曰：" + q2.small[1],
    q2.yao[0][0] + "：" + q2.yao[0][1], "象曰：" + q2.small[0]]);

  const three = [9, 6, 9, 8, 7, 8], p3 = Y.primary(three), c3 = Y.changed(three);
  assert.deepEqual(quoted(three), ["本卦卦辞：" + p3.judgment, "变卦卦辞：" + c3.judgment]);
  const four = [9, 6, 9, 6, 7, 8], c4 = Y.changed(four), q4 = source[c4.number - 1];
  assert.deepEqual(quoted(four), [q4.yao[4][0] + "：" + q4.yao[4][1], "象曰：" + q4.small[4],
    q4.yao[5][0] + "：" + q4.yao[5][1], "象曰：" + q4.small[5]]);
  const five = [9, 6, 9, 6, 9, 8], c5 = Y.changed(five), q5 = source[c5.number - 1];
  assert.deepEqual(quoted(five), [q5.yao[5][0] + "：" + q5.yao[5][1], "象曰：" + q5.small[5]]);
  assert.ok(quoted([9, 9, 9, 9, 9, 9]).some((line) => line.includes("见群龙无首，吉。")));
  assert.ok(quoted([6, 6, 6, 6, 6, 6]).some((line) => line.includes("利永贞。")));
  const other = [9, 9, 9, 9, 9, 6], otherChanged = Y.changed(other);
  assert.deepEqual(quoted(other), ["卦辞：" + otherChanged.judgment]);
});

test("a hexagram cast saves each line, resumes today, and never overwrites a rejected save", async () => {
  const env = bootStored("zh");
  await settle();
  env.app.ctx.get("openSection")("hexagram");
  for (let i = 0; i < 6; i++) {
    env.press("a");
    for (let frame = 0; frame < 100; frame++) env.app.frame();
    await settle();
    assert.equal(env.saves.get("gua").lines.length, i + 1);
  }
  const save = env.saves.get("gua"), day = env.app.ctx.get("todayKey")();
  assert.deepEqual(save, { v: 1, day, lines: save.lines });
  const castLines = drawnLines(env.app), primary = env.app.ctx.get("YI").primary(save.lines);
  assert.ok(castLines.includes(primary.judgment));
  assert.ok(castLines.some((line) => line.includes(env.app.ctx.get("GUAREAD")[primary.number - 1].slice(0, 6))));
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
  for (let frame = 0; frame < 100; frame++) rejected.app.frame();
  await settle();
  assert.equal(rejected.app.ctx.get("guaState").failed, true);
  assert.equal(rejected.saves.has("gua"), false);
});

test("八卦 START appends one note, persists written, and accepts old gua saves without written", async () => {
  const env = bootStored("zh");
  await settle();
  const state = env.app.ctx.get("guaState");
  state.lines = [9, 8, 7, 8, 7, 8];
  env.app.ctx.get("saveGua")();
  assert.equal(Object.hasOwn(env.saves.get("gua"), "written"), false);
  env.app.ctx.get("openSection")("hexagram");
  env.press("start");
  await settle();
  const primary = env.app.ctx.get("YI").primary(state.lines), changed = env.app.ctx.get("YI").changed(state.lines);
  const names = env.app.ctx.get("YI").changingLines(state.lines).map((n) => env.app.ctx.get("EXPLAIN").LINE_NAMES[n - 1]);
  const first = env.appends[0].text.split("\n")[0];
  assert.equal(env.appends.length, 1);
  assert.equal(env.appends[0].title, "八卦");
  assert.equal(first, state.day + "  第" + primary.number + "卦 " + primary.name +
    " → 第" + changed.number + "卦 " + changed.name + "  动爻：" + names.join("、"));
  assert.equal(env.appends[0].text.split("\n")[1], primary.judgment);
  assert.equal(env.saves.get("gua").written, true);
  env.press("start");
  await settle();
  assert.equal(env.appends.length, 1, "a written result cannot be appended twice");

  const legacy = { v: 1, day: state.day, lines: [7, 8, 7, 8, 7, 8] };
  const resumed = bootStored("zh", legacy);
  await settle();
  assert.deepEqual([...resumed.app.ctx.get("guaState").lines], legacy.lines);
  assert.equal(resumed.app.ctx.get("guaState").written, false);
});

test("a stored 八字 save is never read, written or removed", async () => {
  const env = bootStored("zh", new Map([["bazi", { v: 1, y: 1985, m: 6, d: 1, hour: 11 }]]));
  await settle();
  assert.deepEqual(env.loadCalls.slice().sort(), ["gua", "slip"]);
  assert.ok(!env.saveCalls.some((call) => call.key === "bazi"));
  assert.ok(!env.removeCalls.includes("bazi"));
  assert.deepEqual(env.saves.get("bazi"), undefined);
});

test("explanation data, gua results and details fit in both languages", async () => {
  for (const lang of ["zh", "en"]) {
    const env = bootStored(lang);
    await settle();
    const g = env.app.ctx.get("game").g, explain = env.app.ctx.get("EXPLAIN");
    const fits = (text, label) => {
      for (const line of g.wrap(text, 192)) assert.ok(g.measure(line) <= SCREEN_W, `${lang} ${label}: ${line}`);
    };
    for (const entry of explain.ALMANAC) {
      fits(entry.term[lang], "almanac heading");
      fits(entry.text[lang], "almanac text");
    }
    fits(explain.HOW[lang], "how");
    for (const rule of explain.RULES) fits(rule[lang], "rule");
    fits(explain.RULE_SOURCE[lang], "source");
    const state = env.app.ctx.get("guaState");
    state.lines = [9, 7, 8, 6, 7, 8];
    const primary = env.app.ctx.get("YI").primary(state.lines);
    assert.equal(env.app.ctx.get("GUAREAD").length, 64);
    for (const reading of env.app.ctx.get("GUAREAD")) assert.ok(reading.trim());
    env.app.ctx.get("openSection")("hexagram");
    const result = drawnLines(env.app);
    assert.ok(result.includes(primary.judgment), `${lang}: primary judgment shown`);
    assert.ok(result.some((line) => line.includes(env.app.ctx.get("GUAREAD")[primary.number - 1].slice(0, 6)), `${lang}: plain reading shown`));
    const yao = env.app.ctx.get("ZHOUYI")[primary.number - 1].yao;
    assert.ok(!result.some((line) => yao.some((entry) => line.includes(entry[1]))), `${lang}: no line text on result`);
    const changed = env.app.ctx.get("YI").changed(state.lines);
    if (changed) assert.ok(result.some((line) => line.includes("变卦") || line.includes("Changed:")));
    for (const line of result) assert.ok(g.measure(line) <= SCREEN_W, `${lang} result: ${line}`);
    const expectedKey = lang === "zh" ? "START记事本 · SELECT详解" : "START notes · SELECT more";
    assert.ok(result.join(" ").includes(expectedKey));
    env.press("select");
    const details = drawnLines(env.app);
    assert.ok(details.some((line) => line.includes(lang === "zh" ? "读法" : "Reading rule")));
    assert.ok(details.some((line) => line.includes(env.app.ctx.get("ZHOUYI")[primary.number - 1].tuan.slice(0, 6))));
    for (const line of details) assert.ok(g.measure(line) <= SCREEN_W, `${lang} details: ${line}`);
    env.press("b");
    assert.equal(env.app.ctx.get("guaExplain"), false);
    assert.equal(env.app.ctx.get("section"), "hexagram");
    env.app.ctx.get("openSection")("almanac");
    env.press("select");
    for (const line of drawnLines(env.app)) assert.ok(g.measure(line) <= SCREEN_W, `${lang} almanac glossary: ${line}`);
  }
});

test("SELECT does nothing while a hexagram is casting", async () => {
  const env = bootStored("zh");
  await settle();
  env.app.ctx.get("openSection")("hexagram");
  env.app.ctx.get("guaState").lines = [9, 7, 8];
  env.press("select");
  assert.equal(env.app.ctx.get("guaExplain"), false);
  assert.equal(env.app.ctx.get("guaState").lines.length, 3);
  assert.equal(env.app.ctx.get("section"), "hexagram");
});

test("the coins on screen are the ones that made the line: backs 0-3 give 6, 7, 8, 9 (火珠林)", async () => {
  for (let run = 0; run < 12; run++) {
    const env = bootStored("zh");
    await settle();
    env.app.ctx.get("openSection")("hexagram");
    env.press("a");
    const toss = env.app.ctx.get("guaToss");
    assert.ok(toss && toss.backs.length === 3, "three coins in the air");
    const backs = toss.backs.filter(Boolean).length;
    assert.equal(toss.line, [6, 7, 8, 9][backs]);
    for (let frame = 0; frame < 100; frame++) env.app.frame();
    assert.equal(env.app.ctx.get("guaState").lines[0], toss.line);
    assert.equal(env.app.ctx.get("guaToss"), null);
  }
});
