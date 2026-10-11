// runtime/lunar.js: lunar calendar and solar terms against independent facts (tests/fixtures/lunar-facts.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript, readJSON } from "./helpers.mjs";

const L = runScript("runtime/lunar.js").LopdaLunar;
const F = readJSON("tests/fixtures/lunar-facts.json");
const iso = (s) => s.split("-").map(Number);
const fmt = (o) => o.y + "-" + String(o.m).padStart(2, "0") + "-" + String(o.d).padStart(2, "0");

test("every Spring Festival in the fixture", () => {
  for (const [y, date] of Object.entries(F.springFestival)) {
    const [gy, gm, gd] = iso(date);
    const l = L.fromSolar(gy, gm, gd);
    assert.equal([l.year, l.month, l.day, l.leap].join(), [+y, 1, 1, false].join(), date);
    assert.equal(fmt(L.toSolar(+y, 1, 1, false)), date);
  }
});

test("leap months match the fixture, 1900-2100", () => {
  for (let y = 1900; y <= 2100; y++) assert.equal(L.leapMonth(y), F.leapMonth[y] || 0, String(y));
  const cases = [[2017, 6], [2020, 4], [2023, 2], [2025, 6], [2033, 11]];
  for (const [y, m] of cases) assert.equal(L.leapMonth(y), m);
  assert.equal(fmt(L.toSolar(2033, 11, 1, true)), "2033-12-22");
  assert.equal(fmt(L.toSolar(2025, 6, 1, true)), "2025-07-25");
  assert.equal(JSON.stringify(L.fromSolar(2025, 7, 25)), JSON.stringify({ year: 2025, month: 6, day: 1, leap: true, size: L.monthSize(2025, 6, true) }));
});

test("solar terms in the fixture", () => {
  for (const [name, j] of [["lichun", 2], ["qingming", 6], ["dongzhi", 23]]) {
    for (const [y, date] of Object.entries(F.terms[name])) {
      const [gy, gm, gd] = iso(date);
      assert.equal(L.term(gy, gm, gd), j, name + " " + date);
      assert.equal(L.termDay(gy, j), gd, name + " " + date);
    }
  }
});

test("round trip, continuity and 24 terms a year, 1900-2100", () => {
  const first = L.dayNumber(1900, 1, 1), last = L.dayNumber(2100, 12, 31);
  let prev = null, terms = 0, year = 1900;
  for (let n = first; n <= last; n++) {
    const g = L.fromDayNumber(n);
    const l = L.fromSolar(g.y, g.m, g.d);
    const back = L.toSolar(l.year, l.month, l.day, l.leap);
    assert.ok(back && back.y === g.y && back.m === g.m && back.d === g.d, fmt(g));
    if (prev) {
      if (l.day === 1) assert.ok(prev.day === prev.size, fmt(g));
      else assert.equal([l.year, l.month, l.leap, l.day].join(), [prev.year, prev.month, prev.leap, prev.day + 1].join(), fmt(g));
    }
    if (g.y !== year) { assert.equal(terms, 24, "terms in " + year); terms = 0; year = g.y; }
    if (L.term(g.y, g.m, g.d) !== -1) terms++;
    prev = l;
  }
  assert.equal(terms, 24);
});

test("out of range", () => {
  assert.equal(L.fromSolar(1899, 12, 31), null);
  assert.equal(L.fromSolar(2101, 1, 1), null);
  assert.equal(L.toSolar(2024, 2, 1, true), null);
  assert.equal(L.leapMonth(2024), 0);
  const short = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((m) => L.monthSize(2024, m, false) === 29);
  assert.ok(short);
  assert.equal(L.toSolar(2024, short, 30, false), null);
  assert.equal(L.monthSize(2024, 2, true), 0);
  assert.equal(L.term(1899, 1, 1), -1);
  assert.equal(L.termDay(2101, 0), 0);
});

test("day arithmetic", () => {
  assert.equal(L.weekday(2026, 10, 11), 0);
  assert.equal(L.dayNumber(1970, 1, 1), 0);
  assert.equal(L.daysInMonth(2000, 2), 29);
  assert.equal(L.daysInMonth(1900, 2), 28);
  for (let n = -800000; n < 800000; n += 997) {
    const g = L.fromDayNumber(n);
    assert.equal(L.dayNumber(g.y, g.m, g.d), n);
  }
  assert.equal(L.stem(1984), 0);
  assert.equal(L.branch(1984), 0);
  assert.equal(L.branch(2026), 6);
});
