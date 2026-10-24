/* LuckyWay: the almanac's arithmetic, with no DOM and no PAD calls, so Node can test it.
   The day changes at 0:00 local time, as printed almanacs do; the old 23:00 子初 rule is
   deliberately not used. MIT License. Copyright (c) 2026 Haowei Wu. */
var LUCK = (function () {
  "use strict";

  var STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  var BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

  /* Gregorian date -> Julian day number, all in integers (Fliegel-Van Flandern).
     2000-01-01 is 2451545. */
  function jdn(y, m, d) {
    var a = Math.floor((14 - m) / 12);
    var yy = y + 4800 - a;
    var mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy +
      Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }

  /* the 60-day cycle: 0 is 甲子, so 2000-01-01 (JDN 2451545) is index 54, 戊午 */
  function dayIndex(y, m, d) {
    var n = (jdn(y, m, d) + 49) % 60;
    return n < 0 ? n + 60 : n;
  }

  function pillar(y, m, d) {
    var i = dayIndex(y, m, d), s = i % 10, b = i % 12;
    return { index: i, stem: s, branch: b, name: STEMS[s] + BRANCHES[b] };
  }

  /* The one table used by 6tail's lunar library (default) and lunisolar, in degrees:
     0 北, 45 东北, 90 东, 135 东南, 180 南, 225 西南, 270 西, 315 西北.
     Rows are stems 甲..癸; columns are 喜神, 财神, 福神. The other 福神 school in
     circulation (not used here) puts 福神 at 甲乙东南, 丙丁正东, 戊正北, 己正南,
     庚辛西南, 壬西北, 癸正西. */
  var GODS = [
    [45, 45, 0],
    [315, 45, 225],
    [225, 225, 315],
    [180, 225, 135],
    [135, 0, 45],
    [45, 0, 0],
    [315, 90, 225],
    [225, 90, 315],
    [180, 180, 135],
    [135, 180, 45]
  ];

  function gods(stem) {
    var row = GODS[((stem % 10) + 10) % 10];
    return { xi: row[0], cai: row[1], fu: row[2] };
  }

  /* the 45-degree sector a heading falls in; each sector reaches 22.5 degrees each way,
     so 337.5..360 and 0..22.5 are all north. null in, null out (no compass). */
  function sector(heading) {
    if (typeof heading !== "number" || !isFinite(heading)) return null;
    var h = ((heading % 360) + 360) % 360;
    return (Math.round(h / 45) % 8) * 45;
  }

  return {
    jdn: jdn,
    dayIndex: dayIndex,
    pillar: pillar,
    gods: gods,
    sector: sector,
    STEMS: STEMS.slice(),
    BRANCHES: BRANCHES.slice()
  };
})();
