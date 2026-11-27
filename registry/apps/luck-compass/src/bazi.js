/* Pure four-pillar chart arithmetic. */
var BAZI = (function () {
  "use strict";

  var NAYIN = [
    "海中金", "炉中火", "大林木", "路旁土", "剑锋金", "山头火", "涧下水", "城头土", "白蜡金", "杨柳木",
    "泉中水", "屋上土", "霹雳火", "松柏木", "长流水", "沙中金", "山下火", "平地木", "壁上土", "金箔金",
    "覆灯火", "天河水", "大驿土", "钗钏金", "桑柘木", "大溪水", "沙中土", "天上火", "石榴木", "大海水"
  ];
  var STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  var BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  var STEM_ELEMENTS = ["木", "木", "火", "火", "土", "土", "金", "金", "水", "水"];
  var BRANCH_ELEMENTS = ["水", "土", "木", "木", "土", "火", "火", "土", "金", "金", "土", "水"];
  var ELEMENTS = ["木", "火", "土", "金", "水"];

  function valid(y, m, d) {
    if (typeof y !== "number" || typeof m !== "number" || typeof d !== "number" ||
        Math.floor(y) !== y || Math.floor(m) !== m || Math.floor(d) !== d ||
        y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
    var date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }
  function nayin(index) { return NAYIN[Math.floor(index / 2)]; }
  function chart(y, m, d, hour) {
    if (!valid(y, m, d)) return null;
    if (hour !== null && (typeof hour !== "number" || Math.floor(hour) !== hour || hour < 0 || hour > 23)) return null;
    var pillars = ALMANAC.pillars(y, m, d), dayDate = new Date(Date.UTC(y, m - 1, d));
    if (hour !== null && hour >= 23) dayDate.setUTCDate(dayDate.getUTCDate() + 1);
    var day = LUCK.pillar(dayDate.getUTCFullYear(), dayDate.getUTCMonth() + 1, dayDate.getUTCDate()).index;
    var result = { year: pillars.year, month: pillars.month, day: day, hour: null,
      nayin: { year: nayin(pillars.year), month: nayin(pillars.month), day: nayin(day), hour: null },
      counts: { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 },
      dayMaster: STEMS[day % 10] + STEM_ELEMENTS[day % 10], zodiac: ALMANAC.zodiac(pillars.year % 12) };
    if (hour !== null) {
      var branch = Math.floor((hour + 1) / 2) % 12;
      var firstStem = [0, 2, 4, 6, 8][day % 5];
      result.hour = cycleIndex((firstStem + branch) % 10, branch);
      result.nayin.hour = nayin(result.hour);
    }
    var indices = [result.year, result.month, result.day];
    if (result.hour !== null) indices.push(result.hour);
    for (var i = 0; i < indices.length; i++) {
      var index = indices[i];
      result.counts[STEM_ELEMENTS[index % 10]]++;
      result.counts[BRANCH_ELEMENTS[index % 12]]++;
    }
    return result;
  }
  function cycleIndex(stem, branch) {
    for (var i = 0; i < 60; i++) if (i % 10 === stem && i % 12 === branch) return i;
    return -1;
  }
  return { chart: chart, valid: valid, nayin: nayin };
})();
