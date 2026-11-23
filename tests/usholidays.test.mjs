// runtime/usholidays.js: US holidays by rule, against independent facts and the weekday of every year.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const U = runScript("runtime/usholidays.js").LopdaUSHolidays;
const pad = (n) => String(n).padStart(2, "0");
const fmt = (o) => (o ? o.y + "-" + pad(o.m) + "-" + pad(o.d) : null);
/* the weekday from UTC, never the machine's zone */
const wd = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const monthDays = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const next = (o, k) => { const t = new Date(Date.UTC(o.y, o.m - 1, o.d + k)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
/* the vm's objects have another realm's prototypes, so compare what `on()` returns as plain rows */
const rows = (list) => list.map((e) => [e.id, e.federal, e.observed].join("|"));
const ON = (...a) => JSON.stringify(rows(U.on(...a)));

const FED = {
  newyear: () => true, mlk: () => true, valentine: () => false, presidents: () => true,
  stpatrick: () => false, easter: () => false, mother: () => false, memorial: () => true,
  father: () => false, juneteenth: () => true, independence: () => true, labor: () => true,
  columbus: () => true, halloween: () => false, veterans: (y) => y >= 1938,
  armistice: (y) => y >= 1938, thanksgiving: () => true, xmaseve: () => false,
  christmas: () => true, nyeve: () => false
};
/* the federal holidays with a fixed date, the only ones that ever get an observed day off */
const SHIFT = ["newyear", "presidents", "memorial", "juneteenth", "independence", "columbus", "veterans", "armistice", "christmas"];

test("IDS is the table order, armistice right after veterans", () => {
  assert.equal(U.IDS.join(","), ["newyear", "mlk", "valentine", "presidents", "stpatrick", "easter",
    "mother", "memorial", "father", "juneteenth", "independence", "labor", "columbus", "halloween",
    "veterans", "armistice", "thanksgiving", "xmaseve", "christmas", "nyeve"].join(","));
});

/* ---------- Easter ---------- */
test("Easter: the known dates", () => {
  for (const [y, d] of [[1900, "1900-04-15"], [1913, "1913-03-23"], [1943, "1943-04-25"], [1986, "1986-03-30"],
    [2000, "2000-04-23"], [2008, "2008-03-23"], [2011, "2011-04-24"], [2019, "2019-04-21"], [2024, "2024-03-31"],
    [2025, "2025-04-20"], [2026, "2026-04-05"], [2038, "2038-04-25"], [2100, "2100-03-28"]]) {
    assert.equal(fmt(U.easter(y)), d, String(y));
  }
});

test("Easter: every year 1900-2100 is a Sunday between Mar 22 and Apr 25", () => {
  for (let y = 1900; y <= 2100; y++) {
    const e = U.easter(y), mmdd = e.m * 100 + e.d;
    assert.equal(e.y, y);
    assert.equal(wd(e.y, e.m, e.d), 0, `${y} is a Sunday`);
    assert.ok(e.m === 3 || e.m === 4, `${y} is in March or April: ${fmt(e)}`);
    assert.ok(mmdd >= 322 && mmdd <= 425, `${y} is Mar 22 - Apr 25: ${fmt(e)}`);
  }
});

/* ---------- the rules, known dates ---------- */
test("Thanksgiving: the known dates, including 1939-1941", () => {
  for (const [y, d] of [[1938, "1938-11-24"], [1939, "1939-11-23"], [1940, "1940-11-21"], [1941, "1941-11-20"],
    [1942, "1942-11-26"], [1986, "1986-11-27"], [2012, "2012-11-22"], [2018, "2018-11-22"],
    [2024, "2024-11-28"], [2025, "2025-11-27"], [2026, "2026-11-26"]]) {
    assert.equal(fmt(U.dateOf("thanksgiving", y)), d, String(y));
  }
});

test("Martin Luther King Jr. Day, Presidents' Day, Memorial Day", () => {
  assert.equal(U.dateOf("mlk", 1985), null);
  assert.equal(fmt(U.dateOf("mlk", 1986)), "1986-01-20");
  assert.equal(fmt(U.dateOf("mlk", 2026)), "2026-01-19");
  assert.equal(fmt(U.dateOf("presidents", 1970)), "1970-02-22");
  assert.equal(fmt(U.dateOf("presidents", 1971)), "1971-02-15");
  assert.equal(fmt(U.dateOf("presidents", 2026)), "2026-02-16");
  assert.equal(fmt(U.dateOf("memorial", 1970)), "1970-05-30");
  assert.equal(fmt(U.dateOf("memorial", 1971)), "1971-05-31");
  assert.equal(fmt(U.dateOf("memorial", 2026)), "2026-05-25");
});

test("Mother's Day, Father's Day, Juneteenth", () => {
  assert.equal(U.dateOf("mother", 1913), null);
  assert.equal(fmt(U.dateOf("mother", 2026)), "2026-05-10");
  assert.equal(U.dateOf("father", 1971), null);
  assert.equal(fmt(U.dateOf("father", 2026)), "2026-06-21");
  assert.equal(U.dateOf("juneteenth", 2020), null);
  assert.equal(fmt(U.dateOf("juneteenth", 2021)), "2021-06-19");
  assert.equal(U.on(2021, 6, 19)[0].federal, true);
});

test("Independence Day, Labor Day, Columbus Day", () => {
  assert.equal(fmt(U.dateOf("independence", 2026)), "2026-07-04");
  assert.equal(fmt(U.dateOf("labor", 2026)), "2026-09-07");
  assert.equal(U.dateOf("columbus", 1936), null);
  assert.equal(fmt(U.dateOf("columbus", 1937)), "1937-10-12");
  assert.equal(fmt(U.dateOf("columbus", 1971)), "1971-10-11");
  assert.equal(fmt(U.dateOf("columbus", 2026)), "2026-10-12");
});

test("Veterans Day and Armistice Day: the id split and the 1971-1977 Monday", () => {
  assert.equal(fmt(U.dateOf("veterans", 1975)), "1975-10-27");
  assert.equal(fmt(U.dateOf("veterans", 1977)), "1977-10-24");
  assert.equal(fmt(U.dateOf("veterans", 1978)), "1978-11-11");
  assert.equal(fmt(U.dateOf("armistice", 1919)), "1919-11-11");
  assert.equal(fmt(U.dateOf("armistice", 1953)), "1953-11-11");
  assert.equal(U.dateOf("armistice", 1960), null);
  assert.equal(U.dateOf("veterans", 1930), null);
  assert.equal(U.dateOf("veterans", 1953), null);
  assert.equal(U.dateOf("armistice", 1954), null);
  /* 1919-1937 is Armistice Day but not yet a federal holiday */
  assert.equal(ON(1919, 11, 11), JSON.stringify(["armistice|false|false"]));
  assert.equal(ON(1953, 11, 11), JSON.stringify(["armistice|true|false"]));
  assert.equal(ON(1954, 11, 11), JSON.stringify(["veterans|true|false"]));
  assert.equal(fmt(U.observedOf("veterans", 2023)), "2023-11-10");
});

test("Christmas and New Year's Day, actual and observed", () => {
  assert.equal(fmt(U.observedOf("christmas", 2021)), "2021-12-24");
  assert.equal(fmt(U.observedOf("christmas", 2022)), "2022-12-26");
  assert.equal(fmt(U.observedOf("newyear", 2022)), "2021-12-31");
  assert.equal(fmt(U.observedOf("newyear", 2023)), "2023-01-02");
  /* 1965: Christmas is a Saturday with no observed day, July 4 a Sunday observed on the Monday */
  assert.equal(wd(1965, 12, 25), 6);
  assert.equal(U.observedOf("christmas", 1965), null);
  assert.equal(wd(1965, 7, 4), 0);
  assert.equal(fmt(U.observedOf("independence", 1965)), "1965-07-05");
  /* 2026: July 4 is a Saturday, observed on the Friday */
  assert.equal(fmt(U.observedOf("independence", 2026)), "2026-07-03");
  /* the fixed Presidents' Day: Sunday shifted in 1970, Saturday left alone in 1969 */
  assert.equal(wd(1970, 2, 22), 0);
  assert.equal(fmt(U.observedOf("presidents", 1970)), "1970-02-23");
  assert.equal(wd(1969, 2, 22), 6);
  assert.equal(U.observedOf("presidents", 1969), null);
});

test("the far end: New Year 2101 is observed on Dec 31 2100", () => {
  assert.equal(wd(2101, 1, 1), 6);
  assert.equal(fmt(U.observedOf("newyear", 2101)), "2100-12-31");
  assert.equal(ON(2100, 12, 31), JSON.stringify(["nyeve|false|false", "newyear|true|true"]));
  assert.equal(ON(2101, 1, 1), JSON.stringify(["newyear|true|false"]));
});

/* ---------- on() ---------- */
test("on(): actual holidays first, then the observed days off", () => {
  assert.equal(ON(2021, 12, 31), JSON.stringify(["nyeve|false|false", "newyear|true|true"]));
  assert.equal(ON(2023, 1, 2), JSON.stringify(["newyear|true|true"]));
  assert.equal(ON(2021, 12, 24), JSON.stringify(["xmaseve|false|false", "christmas|true|true"]));
  assert.equal(ON(2026, 7, 4), JSON.stringify(["independence|true|false"]));
  assert.equal(ON(2026, 7, 3), JSON.stringify(["independence|true|true"]));
  assert.equal(ON(2026, 10, 12), JSON.stringify(["columbus|true|false"]));
  /* an ordinary day is empty */
  assert.equal(ON(2026, 3, 10), "[]");
  assert.equal(ON(2026, 3, 11), "[]");
});

test("a federal holiday on a Saturday is still federal on its actual day", () => {
  const e = U.on(2026, 7, 4);
  assert.equal(e.length, 1);
  assert.equal(e[0].federal, true);
  assert.equal(e[0].observed, false);
});

/* ---------- every year ---------- */
test("every holiday appears exactly once a year, on a real date, with the right federal flag", () => {
  for (let y = 1900; y <= 2101; y++) {
    const counts = {};
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= monthDays(y, m); d++) {
        for (const e of U.on(y, m, d)) {
          if (e.observed) continue;
          counts[e.id] = (counts[e.id] || 0) + 1;
          assert.equal(e.federal, FED[e.id](y), `${e.id} ${y} federal`);
        }
      }
    }
    for (const id of U.IDS) {
      const a = U.dateOf(id, y);
      if (!a) {
        assert.equal(counts[id] || 0, 0, `${id} ${y} does not exist`);
        continue;
      }
      assert.ok(a.m >= 1 && a.m <= 12 && a.d >= 1 && a.d <= monthDays(y, a.m), `${id} ${y} is a real date: ${fmt(a)}`);
      assert.equal(counts[id] || 0, 1, `${id} ${y} appears once as actual`);
    }
  }
});

test("nth-weekday holidays fall on the right weekday and in the right day range, 1900-2101", () => {
  /* id, from, to, month, weekday (0 = Sunday), first and last day of the month */
  const table = [
    ["mlk", 1986, 2101, 1, 1, 15, 21], ["presidents", 1971, 2101, 2, 1, 15, 21],
    ["memorial", 1971, 2101, 5, 1, 25, 31], ["mother", 1914, 2101, 5, 0, 8, 14],
    ["father", 1972, 2101, 6, 0, 15, 21], ["labor", 1900, 2101, 9, 1, 1, 7],
    ["columbus", 1971, 2101, 10, 1, 8, 14], ["thanksgiving", 1942, 2101, 11, 4, 22, 28],
    ["veterans", 1971, 1977, 10, 1, 22, 28]
  ];
  for (const [id, from, to, m, wday, lo, hi] of table) {
    for (let y = from; y <= to; y++) {
      const a = U.dateOf(id, y);
      assert.ok(a, `${id} ${y} exists`);
      assert.equal(a.m, m, `${id} ${y} month`);
      assert.equal(wd(a.y, a.m, a.d), wday, `${id} ${y} weekday: ${fmt(a)}`);
      assert.ok(a.d >= lo && a.d <= hi, `${id} ${y} day ${a.d} in ${lo}-${hi}`);
    }
  }
});

test("the fixed-date holidays and the old Monday rules", () => {
  const fixed = [["newyear", 1900, 2101, 1, 1], ["valentine", 1900, 2101, 2, 14], ["stpatrick", 1900, 2101, 3, 17],
    ["juneteenth", 2021, 2101, 6, 19], ["independence", 1900, 2101, 7, 4],
    ["halloween", 1900, 2101, 10, 31], ["xmaseve", 1900, 2101, 12, 24], ["christmas", 1900, 2101, 12, 25],
    ["nyeve", 1900, 2101, 12, 31], ["presidents", 1900, 1970, 2, 22], ["memorial", 1900, 1970, 5, 30],
    ["columbus", 1937, 1970, 10, 12], ["veterans", 1954, 1970, 11, 11], ["veterans", 1978, 2101, 11, 11],
    ["armistice", 1919, 1953, 11, 11]];
  for (const [id, from, to, m, d] of fixed) {
    for (let y = from; y <= to; y++) assert.equal(fmt(U.dateOf(id, y)), `${y}-${pad(m)}-${pad(d)}`, `${id} ${y}`);
  }
});

test("observed days off follow the 1971 rule, every year 1900-2101", () => {
  for (let y = 1900; y <= 2101; y++) {
    for (const id of U.IDS) {
      const a = U.dateOf(id, y), obs = U.observedOf(id, y);
      if (!a || !FED[id](y) || !SHIFT.includes(id)) {
        assert.equal(obs, null, `${id} ${y} has no observed day`);
        continue;
      }
      const w = wd(a.y, a.m, a.d), want =
        w === 0 ? next(a, 1) :
        w === 6 && y >= 1971 ? next(a, -1) : null;
      assert.equal(fmt(obs), fmt(want), `${id} ${y} observed`);
      if (obs) {
        const hits = U.on(obs.y, obs.m, obs.d).filter((e) => e.id === id && e.observed);
        assert.equal(hits.length, 1, `${id} ${y} observed day is in on()`);
        assert.equal(hits[0].federal, true, `${id} ${y} observed day is federal`);
        assert.ok(!U.on(a.y, a.m, a.d).some((e) => e.id === id && e.observed), `${id} ${y} actual day is not observed`);
      }
    }
  }
});

test("an observed day is never the actual day, and is at most one day away", () => {
  for (let y = 1900; y <= 2101; y++) {
    for (const id of U.IDS) {
      const a = U.dateOf(id, y), o = U.observedOf(id, y);
      if (!o) continue;
      const gap = (Date.UTC(o.y, o.m - 1, o.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000;
      assert.ok(gap === 1 || gap === -1, `${id} ${y}: ${gap} days`);
    }
  }
});

/* ---------- the calendar's strings ---------- */
test("both languages name every holiday, long and short", () => {
  const S = runScript("runtime/strings.js", { navigator: { languages: ["zh-CN"], language: "zh-CN" } }).LopdaStrings;
  for (const lang of ["zh", "en"]) {
    for (const id of U.IDS) {
      for (const key of ["cal.us." + id, "cal.uss." + id]) {
        assert.ok(typeof S.STR[lang][key] === "string" && S.STR[lang][key].length, `${lang} ${key}`);
      }
    }
    for (const key of ["cal.us.is", "cal.us.obs", "cal.us.off"]) {
      assert.ok(typeof S.STR[lang][key] === "string" && S.STR[lang][key].length, `${lang} ${key}`);
    }
  }
  /* the short names fill a month cell, about 37 px on the smallest screen: six characters at most in English */
  for (const id of U.IDS) assert.ok(S.STR.en["cal.uss." + id].length <= 6, "en cal.uss." + id);
  assert.equal(S.STR.en["cal.uss.newyear"], "NewYr");
  assert.equal(S.STR.en["cal.uss.independence"], "July 4");
  assert.equal(S.STR.zh["cal.uss.thanksgiving"], S.STR.zh["cal.us.thanksgiving"]);
});
