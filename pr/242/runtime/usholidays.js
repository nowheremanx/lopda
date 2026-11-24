// Lo-PDA: US holidays by rule, computed offline for any year (the calendar asks 1900-2101).
// Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
//
// Dates in and out are plain numbers, and days are counted from 1970-01-01 with integer arithmetic
// only, so the device time zone can never move a date. Names (cal.us.<id>, cal.uss.<id>) live in
// strings.js; this file returns ids only. Rules: the federal holidays and their observed days off,
// 5 U.S.C. 6103, plus the common non-federal ones the calendar shows.
(function () {
  "use strict";

  // days since 1970-01-01 of a proleptic Gregorian date (civil-from-days family, integer only)
  function dayNumber(y, m, d) {
    y -= m <= 2 ? 1 : 0;
    var era = Math.floor(y / 400);
    var yoe = y - era * 400;
    var doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  }
  function fromDayNumber(n) {
    n += 719468;
    var era = Math.floor(n / 146097);
    var doe = n - era * 146097;
    var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    var doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    var mp = Math.floor((5 * doy + 2) / 153);
    var d = doy - Math.floor((153 * mp + 2) / 5) + 1;
    var m = mp < 10 ? mp + 3 : mp - 9;
    return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m: m, d: d };
  }
  function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function daysInMonth(y, m) {
    return m === 2 ? (isLeapYear(y) ? 29 : 28) : (m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31);
  }
  // 0 = Sunday
  function weekday(y, m, d) {
    var w = (dayNumber(y, m, d) + 4) % 7; // 1970-01-01 was a Thursday
    return w < 0 ? w + 7 : w;
  }

  // the nth weekday of a month, and the month's last one (0 = Sunday, 1 = Monday, ...)
  function nthWeekday(y, m, n, wd) {
    return 1 + ((wd - weekday(y, m, 1) + 7) % 7) + (n - 1) * 7;
  }
  function lastWeekday(y, m, wd) {
    var last = daysInMonth(y, m);
    return last - ((weekday(y, m, last) - wd + 7) % 7);
  }

  // Gregorian Easter Sunday, the anonymous Gregorian algorithm (Meeus-Jones-Butcher)
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100,
      d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451),
      month = Math.floor((h + l - 7 * m + 114) / 31),
      day = ((h + l - 7 * m + 114) % 31) + 1;
    return { y: y, m: month, d: day };
  }

  // Armistice Day (1919-1953) and Veterans Day share one rule; federal from 1938
  function veteranFed(y) { return y >= 1938; }
  function veteranDate(y) {
    if (y >= 1971 && y <= 1977) return { m: 10, d: nthWeekday(y, 10, 4, 1) };
    return { m: 11, d: 11 };
  }
  function thanksgiving(y) {
    if (y <= 1938) return { m: 11, d: lastWeekday(y, 11, 4) };
    if (y === 1939) return { m: 11, d: 23 };
    if (y === 1940) return { m: 11, d: 21 };
    if (y === 1941) return { m: 11, d: 20 };
    return { m: 11, d: nthWeekday(y, 11, 4, 4) };
  }

  /* at(y) -> {m, d} of that year's actual date, or null. fed is the federal flag (a year test for
     Armistice Day and Veterans Day). shift: observed-eligible, a fixed-date federal holiday. */
  var TABLE = [
    { id: "newyear", fed: true, shift: true, at: function () { return { m: 1, d: 1 }; } },
    { id: "mlk", fed: true, shift: false, at: function (y) { return y >= 1986 ? { m: 1, d: nthWeekday(y, 1, 3, 1) } : null; } },
    { id: "valentine", fed: false, shift: false, at: function () { return { m: 2, d: 14 }; } },
    { id: "presidents", fed: true, shift: true, at: function (y) { return y <= 1970 ? { m: 2, d: 22 } : { m: 2, d: nthWeekday(y, 2, 3, 1) }; } },
    { id: "stpatrick", fed: false, shift: false, at: function () { return { m: 3, d: 17 }; } },
    { id: "easter", fed: false, shift: false, at: function (y) { return easter(y); } },
    { id: "mother", fed: false, shift: false, at: function (y) { return y >= 1914 ? { m: 5, d: nthWeekday(y, 5, 2, 0) } : null; } },
    { id: "memorial", fed: true, shift: true, at: function (y) { return y <= 1970 ? { m: 5, d: 30 } : { m: 5, d: lastWeekday(y, 5, 1) }; } },
    { id: "father", fed: false, shift: false, at: function (y) { return y >= 1972 ? { m: 6, d: nthWeekday(y, 6, 3, 0) } : null; } },
    { id: "juneteenth", fed: true, shift: true, at: function (y) { return y >= 2021 ? { m: 6, d: 19 } : null; } },
    { id: "independence", fed: true, shift: true, at: function () { return { m: 7, d: 4 }; } },
    { id: "labor", fed: true, shift: false, at: function (y) { return { m: 9, d: nthWeekday(y, 9, 1, 1) }; } },
    { id: "columbus", fed: true, shift: true, at: function (y) {
      if (y < 1937) return null;
      return y <= 1970 ? { m: 10, d: 12 } : { m: 10, d: nthWeekday(y, 10, 2, 1) };
    } },
    { id: "halloween", fed: false, shift: false, at: function () { return { m: 10, d: 31 }; } },
    { id: "veterans", fed: veteranFed, shift: true, at: function (y) { return y >= 1954 ? veteranDate(y) : null; } },
    { id: "armistice", fed: veteranFed, shift: true, at: function (y) { return y >= 1919 && y <= 1953 ? veteranDate(y) : null; } },
    { id: "thanksgiving", fed: true, shift: false, at: thanksgiving },
    { id: "xmaseve", fed: false, shift: false, at: function () { return { m: 12, d: 24 }; } },
    { id: "christmas", fed: true, shift: true, at: function () { return { m: 12, d: 25 }; } },
    { id: "nyeve", fed: false, shift: false, at: function () { return { m: 12, d: 31 }; } }
  ];

  var byId = {};
  (function () {
    for (var i = 0; i < TABLE.length; i++) byId[TABLE[i].id] = TABLE[i];
  })();

  function dateOf(id, y) {
    var h = byId[id];
    if (!h) return null;
    var md = h.at(y);
    return md ? { y: y, m: md.m, d: md.d } : null;
  }
  function federalAt(h, y) {
    return typeof h.fed === "function" ? !!h.fed(y) : h.fed;
  }
  /* the federal day off for the year's occurrence: Saturday -> Friday and Sunday -> Monday from 1971,
     Sunday -> Monday only before that; null when the holiday is not federal or needs no shift */
  function observedOf(id, y) {
    var h = byId[id];
    if (!h || !h.shift) return null;
    var a = h.at(y);
    if (!a || !federalAt(h, y)) return null;
    var w = weekday(y, a.m, a.d), to;
    if (w === 0) to = fromDayNumber(dayNumber(y, a.m, a.d) + 1);
    else if (w === 6 && y >= 1971) to = fromDayNumber(dayNumber(y, a.m, a.d) - 1);
    else return null;
    if (to.y === y && to.m === a.m && to.d === a.d) return null;
    return to;
  }
  /* the holidays of the day: actual ones in table order, then observed days off. A New Year's Day
     can be observed on Dec 31 of the year before, so the neighbouring years' observed days are checked. */
  function on(y, m, d) {
    var out = [], i, h, md, o, yy;
    for (i = 0; i < TABLE.length; i++) {
      h = TABLE[i]; md = h.at(y);
      if (md && md.m === m && md.d === d) out.push({ id: h.id, federal: federalAt(h, y), observed: false });
    }
    for (yy = y - 1; yy <= y + 1; yy++) {
      for (i = 0; i < TABLE.length; i++) {
        h = TABLE[i]; o = observedOf(h.id, yy);
        if (o && o.y === y && o.m === m && o.d === d) out.push({ id: h.id, federal: true, observed: true });
      }
    }
    return out;
  }

  var IDS = [];
  (function () {
    for (var i = 0; i < TABLE.length; i++) IDS.push(TABLE[i].id);
  })();

  var root = typeof window !== "undefined" ? window : this;
  root.LopdaUSHolidays = {
    IDS: IDS,
    on: on,
    dateOf: dateOf,
    observedOf: observedOf,
    easter: easter,
    dayNumber: dayNumber,
    fromDayNumber: fromDayNumber,
    weekday: weekday
  };
})();
