/* 五十音图 / Kana: the daily review's rules, with no DOM, no PAD and no clock of its own.
   The caller passes today as "YYYY-MM-DD", so the app and the tests run this same copy.
   A kana sits in a Leitner box: 0 is new, and boxes 1-5 come back after 1, 2, 4, 8 or 16 days.
   ES5 on purpose: the app is inlined into an iframe with no module loader. */
var KanaSRS = (function () {
  var DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  var CAP = 8;
  var WAIT = [1, 2, 4, 8, 16];

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
  function isDay(s) { return typeof s === "string" && DAY_RE.test(s); }
  function isInt(n) { return typeof n === "number" && isFinite(n) && Math.floor(n) === n; }
  function isCount(n) { return isInt(n) && n >= 0; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function sizeOf(n) { return isInt(n) && n > 0 ? n : 0; }

  /* the phone's own calendar day, never the UTC one: at 07:00 in Tokyo the review is due today */
  function dayKey(dateObj) {
    if (!dateObj || typeof dateObj.getFullYear !== "function") return "";
    var y = dateObj.getFullYear(), m = dateObj.getMonth() + 1, d = dateObj.getDate();
    if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return "";
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  /* local Y/M/D arithmetic: adding 86,400,000 ms lands on the wrong day when the clocks change */
  function addDays(day, n) {
    if (!isDay(day)) return "";
    var y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7)), d = Number(day.slice(8, 10));
    return dayKey(new Date(y, m - 1, d + (isInt(n) ? n : 0)));
  }

  /* stats are per kana as [tries, right]; anything else is junk from a damaged save */
  function readStats(src, into) {
    if (!src || typeof src !== "object" || Array.isArray(src)) return into;
    for (var k in src) {
      if (!has(src, k) || !/^[0-9]+$/.test(k)) continue;
      var v = src[k];
      if (Array.isArray(v) && v.length === 2 && isCount(v[0]) && isCount(v[1]) && v[1] <= v[0]) into[k] = [v[0], v[1]];
    }
    return into;
  }

  /* before boxes existed the score was all there was: a kana answered well enough gets a head start
     and is due today, so the first review is not empty and the first cards are not all from zero */
  function seed(scores, today) {
    var out = {};
    for (var k in scores) {
      if (!has(scores, k)) continue;
      var s = scores[k], right = s[1], wrong = s[0] - s[1], lead = right - wrong;
      if (lead >= 3) out[k] = [2, today];
      else if (lead >= 1) out[k] = [1, today];
    }
    return out;
  }

  function readBoxes(src, size, today) {
    var out = {};
    if (!src || typeof src !== "object" || Array.isArray(src)) return out;
    for (var k in src) {
      if (!has(src, k) || !/^[0-9]+$/.test(k)) continue;
      var index = parseInt(k, 10), v = src[k];
      if (index >= size) continue;
      if (!Array.isArray(v) || !v.length || typeof v[0] !== "number" || !isFinite(v[0])) continue;
      var box = Math.floor(v[0]);
      out[String(index)] = [box < 0 ? 0 : box > 5 ? 5 : box, isDay(v[1]) ? v[1] : today];
    }
    return out;
  }

  function readDays(src) {
    if (!src || typeof src !== "object" || Array.isArray(src)) return { last: "", streak: 0 };
    var last = isDay(src.last) ? src.last : "";
    /* a streak without a day it stands on cannot be continued, so it resets */
    return { last: last, streak: last && isCount(src.streak) ? src.streak : 0 };
  }

  function readNewDay(src, today) {
    if (!src || typeof src !== "object" || Array.isArray(src)) return { day: today, hira: 0, kata: 0 };
    return { day: isDay(src.day) ? src.day : today,
      hira: isCount(src.hira) ? src.hira : 0,
      kata: isCount(src.kata) ? src.kata : 0 };
  }

  /* every save this app ever wrote, and every damaged one, becomes the current shape.
     v3 and newer are read as v3 (the fields this build knows); v2 and the shared-stats save
     keep their stats exactly and seed the boxes from them. */
  function migrate(saved, today, sizes) {
    var t = isDay(today) ? today : "";
    var size = { hira: sizeOf(sizes && sizes.hira), kata: sizeOf(sizes && sizes.kata) };
    var out = {
      v: 3, script: "hira", index: 0,
      stats: { hira: {}, kata: {} },
      srs: { hira: {}, kata: {} },
      days: { last: "", streak: 0 },
      newDay: { day: t, hira: 0, kata: 0 }
    };
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return out;

    out.script = saved.script === "kata" ? "kata" : "hira";
    if (isInt(saved.index) && saved.index >= 0 && saved.index < size[out.script]) out.index = saved.index;

    var v = saved.v, current = typeof v === "number" && v >= 3;
    /* a damaged version number must not decide this: the stats' own shape says whether they are
       per script (hira / kata) or the oldest save's one shared object */
    var stats = saved.stats, perScript = isObj(stats) &&
      (isObj(stats.hira) || isObj(stats.kata));
    if (perScript) {
      readStats(stats.hira, out.stats.hira);
      readStats(stats.kata, out.stats.kata);
    } else {
      /* the oldest save kept one shared stats object; it belongs to hiragana now */
      readStats(stats, out.stats.hira);
    }

    if (current) {
      out.srs.hira = readBoxes(saved.srs && saved.srs.hira, size.hira, t);
      out.srs.kata = readBoxes(saved.srs && saved.srs.kata, size.kata, t);
      out.days = readDays(saved.days);
      out.newDay = readNewDay(saved.newDay, t);
    } else {
      out.srs.hira = seed(out.stats.hira, t);
      out.srs.kata = seed(out.stats.kata, t);
    }
    return out;
  }

  /* what the day's review asks: every started kana whose day has come, oldest first, then the
     never-answered ones in table order, at most cap new ones a day counting the ones already met today */
  function dueList(srsScript, today, tableSize, newUsedToday, cap) {
    var src = srsScript && typeof srsScript === "object" ? srsScript : {};
    var size = sizeOf(tableSize), t = isDay(today) ? today : "";
    var limit = isCount(cap) ? cap : CAP;
    var due = [], fresh = [], started = [], i, e;
    for (i = 0; i < size; i++) {
      e = src[String(i)];
      if (Array.isArray(e) && isCount(e[0]) && e[0] > 0) {
        if (t && isDay(e[1]) && e[1] <= t) started.push([i, e[1]]);
      } else fresh.push(i);
    }
    started.sort(function (a, b) { return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] - b[0]; });
    for (i = 0; i < started.length; i++) due.push(started[i][0]);
    var room = limit - (isCount(newUsedToday) ? newUsedToday : 0);
    return { due: due, fresh: room > 0 ? fresh.slice(0, room) : [] };
  }

  /* a right answer moves one box on and waits its box's days; a miss goes back to the first box */
  function applyAnswer(entry, right, today) {
    var t = isDay(today) ? today : "";
    if (!right) return [1, addDays(t, 1)];
    var box = Array.isArray(entry) && isCount(entry[0]) ? entry[0] : 0;
    box = box < 1 ? 1 : box + 1;
    if (box > 5) box = 5;
    return [box, addDays(t, WAIT[box - 1])];
  }

  /* how many new kana this script has already been shown today; a new day starts at zero */
  function countToday(newDay, today, script) {
    if (!newDay || typeof newDay !== "object" || newDay.day !== today) return 0;
    var n = newDay[script === "kata" ? "kata" : "hira"];
    return isCount(n) ? n : 0;
  }

  /* finishing a review today continues yesterday's streak, leaves today's alone, or starts at 1 */
  function streakAfter(days, today) {
    var t = isDay(today) ? today : "";
    var last = days && isDay(days.last) ? days.last : "";
    var streak = days && isCount(days.streak) ? days.streak : 0;
    if (!t) return { last: last, streak: streak };
    if (last === t) return { last: t, streak: streak };
    if (last && last === addDays(t, -1)) return { last: t, streak: streak + 1 };
    return { last: t, streak: 1 };
  }

  /* the streak still alive today: a run that was not kept up yesterday is over, even before the
     next review is finished (the stored number is not rewritten, only what the home claims) */
  function liveStreak(days, today) {
    var t = isDay(today) ? today : "";
    if (!t || !days || !isDay(days.last) || !isCount(days.streak)) return 0;
    if (days.last === t || days.last === addDays(t, -1)) return days.streak;
    return 0;
  }

  return { dayKey: dayKey, addDays: addDays, migrate: migrate, dueList: dueList,
    applyAnswer: applyAnswer, countToday: countToday, streakAfter: streakAfter, liveStreak: liveStreak };
})();
