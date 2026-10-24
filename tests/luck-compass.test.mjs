// registry/apps/luck-compass: the day pillar and the almanac table, with no DOM and no PAD.
// The dates come from printed almanacs; 喜/财/福 match 6tail's lunar library and lunisolar,
// 阳贵/阴贵 match 6tail's POSITION_YANG_GUI / POSITION_YIN_GUI.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read } from "./helpers.mjs";

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
