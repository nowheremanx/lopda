// Kana (registry/apps/kana-cards) daily review: the pure rules in src/srs.js.
// The app and this test run the same file; there is no clock inside, so every case passes "today".
// Values made inside the vm have another realm's prototypes, so they are compared as plain copies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const SRS = runScript("registry/apps/kana-cards/src/srs.js").KanaSRS;
const plain = (v) => JSON.parse(JSON.stringify(v));
const SIZES = { hira: 71, kata: 71 };
const TODAY = "2026-05-20";

test("srs: a v2 save becomes v3 with its stats untouched and the boxes seeded", () => {
  const saved = { v: 2, script: "kata", index: 5, stats: {
    hira: { 0: [6, 5], 1: [2, 2], 2: [2, 1], 3: [0, 0], 9: [3, 3] },
    kata: { 10: [4, 3], 11: [4, 4] }
  } };
  const st = plain(SRS.migrate(saved, TODAY, SIZES));
  assert.equal(st.v, 3);
  assert.equal(st.script, "kata");
  assert.equal(st.index, 5);
  assert.deepEqual(st.stats, saved.stats, "the stats are carried over exactly");
  /* right - wrong: 4 -> box 2; 2 -> box 1; 0 -> not started; 3 -> box 2; 2 -> box 1 */
  assert.deepEqual(st.srs.hira, { 0: [2, TODAY], 1: [1, TODAY], 9: [2, TODAY] });
  assert.deepEqual(st.srs.kata, { 10: [1, TODAY], 11: [2, TODAY] });
  assert.deepEqual(st.days, { last: "", streak: 0 });
  assert.deepEqual(st.newDay, { day: TODAY, hira: 0, kata: 0 });
});

test("srs: the oldest shared-stats save belongs to hiragana", () => {
  const st = plain(SRS.migrate({ script: "hira", index: 3, stats: { 0: [5, 4], 7: [2, 2] } }, TODAY, SIZES));
  assert.deepEqual(st.stats, { hira: { 0: [5, 4], 7: [2, 2] }, kata: {} });
  assert.deepEqual(st.srs.hira, { 0: [2, TODAY], 7: [1, TODAY] }, "4 right and 1 wrong is box 2 due today");
  assert.deepEqual(st.srs.kata, {});
});

test("srs: junk saves and junk fields never throw and fall back only where broken", () => {
  for (const junk of [null, undefined, "text", 42, [], [1, 2], { v: "three" }, { v: 3 }]) {
    const st = plain(SRS.migrate(junk, TODAY, SIZES));
    assert.equal(st.v, 3);
    assert.equal(st.script, "hira");
    assert.equal(st.index, 0);
    assert.deepEqual(st.stats, { hira: {}, kata: {} });
    assert.deepEqual(st.srs, { hira: {}, kata: {} });
    assert.deepEqual(st.days, { last: "", streak: 0 });
  }
  const st = plain(SRS.migrate({
    v: 3, script: "KATA", index: -4,
    stats: { hira: { 0: [2, 1], 1: "junk", x: [1, 0] }, kata: null },
    srs: { hira: { 0: [9, "x"], 1: ["junk", 5], 2: [2, "20/05/2026"], 3: [2.9, "2026-01-01"], 999: [1, TODAY] }, kata: [1] },
    days: { last: 5, streak: -3 },
    newDay: "junk"
  }, TODAY, SIZES));
  assert.equal(st.script, "hira", "a script that is not hira or kata falls back");
  assert.equal(st.index, 0, "an index outside the table falls back");
  assert.deepEqual(st.stats, { hira: { 0: [2, 1] }, kata: {} }, "only the well-shaped stats survive");
  assert.deepEqual(st.srs.hira, { 0: [5, TODAY], 2: [2, TODAY], 3: [2, "2026-01-01"] },
    "boxes clamp to 0-5, a broken due date becomes today, broken entries are dropped");
  assert.deepEqual(st.srs.kata, {});
  assert.deepEqual(st.days, { last: "", streak: 0 });
  assert.deepEqual(st.newDay, { day: TODAY, hira: 0, kata: 0 });
});

test("srs: a v3 save loads as it is, and a newer one is read as far as this build knows", () => {
  const saved = { v: 3, script: "kata", index: 70,
    stats: { hira: {}, kata: { 3: [4, 4] } },
    srs: { hira: { 1: [3, "2026-05-01"] }, kata: { 70: [5, "2026-06-01"] } },
    days: { last: "2026-05-19", streak: 4 },
    newDay: { day: TODAY, hira: 2, kata: 8 } };
  const st = plain(SRS.migrate(saved, TODAY, SIZES));
  assert.deepEqual(st.stats, saved.stats);
  assert.deepEqual(st.srs, saved.srs);
  assert.deepEqual(st.days, saved.days);
  assert.deepEqual(st.newDay, saved.newDay);

  const newer = plain(SRS.migrate({ ...saved, v: 4 }, TODAY, SIZES));
  assert.equal(newer.script, "kata");
  assert.deepEqual(newer.srs.kata, saved.srs.kata, "a newer save keeps the boxes this build understands");
});

test("srs: a right answer climbs a box, a wrong one drops to box 1 tomorrow", () => {
  assert.deepEqual(plain(SRS.applyAnswer(null, true, "2026-01-31")), [1, "2026-02-01"]);
  assert.deepEqual(plain(SRS.applyAnswer([1, "2026-01-01"], true, "2026-02-28")), [2, "2026-03-02"]);
  assert.deepEqual(plain(SRS.applyAnswer([2, "2026-01-01"], true, "2026-01-01")), [3, "2026-01-05"]);
  assert.deepEqual(plain(SRS.applyAnswer([3, "2026-01-01"], true, "2026-01-01")), [4, "2026-01-09"]);
  assert.deepEqual(plain(SRS.applyAnswer([4, "2026-01-01"], true, "2026-01-01")), [5, "2026-01-17"]);
  assert.deepEqual(plain(SRS.applyAnswer([5, "2026-01-01"], true, "2026-01-01")), [5, "2026-01-17"], "box 5 waits 16 days again");
  assert.deepEqual(plain(SRS.applyAnswer([5, "2026-01-01"], false, "2026-01-01")), [1, "2026-01-02"]);
  assert.deepEqual(plain(SRS.applyAnswer(null, false, "2026-12-31")), [1, "2027-01-01"]);
  assert.deepEqual(plain(SRS.applyAnswer([0, "2026-01-01"], true, "2026-01-01")), [1, "2026-01-02"], "box 0 is a new kana");
});

test("srs: due dates cross month, year and leap-day ends by local calendar arithmetic", () => {
  assert.equal(SRS.addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(SRS.addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(SRS.addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(SRS.addDays("2028-02-29", 1), "2028-03-01");
  assert.equal(SRS.addDays("2026-12-31", 16), "2027-01-16");
  assert.equal(SRS.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(SRS.addDays("2026-01-01", 365), "2027-01-01");
  assert.equal(SRS.addDays("junk", 1), "", "a day that is not YYYY-MM-DD has no arithmetic");
});

test("srs: dayKey is the local calendar day, not the UTC one", () => {
  assert.equal(SRS.dayKey(new Date(2026, 0, 31)), "2026-01-31");
  assert.equal(SRS.dayKey(new Date(2026, 11, 1, 0, 5)), "2026-12-01");
  assert.equal(SRS.dayKey(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
  assert.equal(SRS.dayKey(null), "");
});

test("srs: due today and overdue come oldest first, then at most eight new ones", () => {
  const boxes = {
    0: [1, "2026-05-19"],   // due yesterday
    5: [4, "2026-05-01"],   // due long ago
    9: [2, "2026-05-20"],   // due today
    12: [3, "2026-05-21"],  // tomorrow, not yet
    20: [0, "2026-05-20"],  // a box of 0 is new, not due
    30: [5, "2026-06-30"]
  };
  const list = plain(SRS.dueList(boxes, TODAY, 71, 0));
  assert.deepEqual(list.due, [5, 0, 9], "oldest due first, ties by table order");
  assert.deepEqual(list.fresh, [1, 2, 3, 4, 6, 7, 8, 10], "eight new kana in table order, skipping started ones");

  const partly = plain(SRS.dueList(boxes, TODAY, 71, 3));
  assert.equal(partly.fresh.length, 5, "three already introduced today leave five");
  assert.deepEqual(partly.fresh, [1, 2, 3, 4, 6]);

  assert.deepEqual(plain(SRS.dueList(boxes, TODAY, 71, 8).fresh), [], "a full day offers no new kana");
  assert.deepEqual(plain(SRS.dueList(boxes, TODAY, 71, 20).fresh), [], "a count above the cap never goes negative");
  assert.deepEqual(plain(SRS.dueList(null, TODAY, 71, 0).due), []);
});

test("srs: the day's new count is per script and starts over tomorrow", () => {
  const newDay = { day: TODAY, hira: 3, kata: 8 };
  assert.equal(SRS.countToday(newDay, TODAY, "hira"), 3);
  assert.equal(SRS.countToday(newDay, TODAY, "kata"), 8);
  assert.equal(SRS.countToday(newDay, "2026-05-21", "hira"), 0, "a new day starts at zero");
  assert.equal(SRS.countToday(null, TODAY, "hira"), 0);
  assert.equal(SRS.countToday({ day: TODAY, hira: "x" }, TODAY, "hira"), 0);
});

test("srs: a damaged version number never drops the kata stats", () => {
  for (const v of ["3", null, {}, [], true]) {
    const st = plain(SRS.migrate({ v, script: "kata", index: 2,
      stats: { hira: { 0: [6, 5] }, kata: { 1: [2, 2] } } }, TODAY, SIZES));
    assert.equal(st.script, "kata");
    assert.equal(st.index, 2);
    assert.deepEqual(st.stats, { hira: { 0: [6, 5] }, kata: { 1: [2, 2] } },
      `${JSON.stringify(v)}: per-script stats are read by their own shape`);
    assert.deepEqual(st.srs.kata, { 1: [1, TODAY] }, "the boxes are still seeded from the score");
    assert.deepEqual(st.srs.hira, { 0: [2, TODAY] });
  }
  /* the oldest save's shared stats object still belongs to hiragana, whatever the version says */
  const shared = plain(SRS.migrate({ v: "x", script: "hira", index: 0, stats: { 0: [5, 4] } }, TODAY, SIZES));
  assert.deepEqual(shared.stats, { hira: { 0: [5, 4] }, kata: {} });
  assert.deepEqual(shared.srs.hira, { 0: [2, TODAY] });
  /* an empty stats object is not per script, and reading it either way yields nothing */
  assert.deepEqual(plain(SRS.migrate({ v: "3", stats: {} }, TODAY, SIZES)).stats, { hira: {}, kata: {} });
});

test("srs: the streak shown on the home is only alive from today or yesterday", () => {
  assert.equal(SRS.liveStreak({ last: TODAY, streak: 4 }, TODAY), 4, "finished today: the run is current");
  assert.equal(SRS.liveStreak({ last: "2026-05-19", streak: 4 }, TODAY), 4, "yesterday: still alive today");
  assert.equal(SRS.liveStreak({ last: "2026-05-18", streak: 9 }, TODAY), 0, "a missed day ends the run");
  assert.equal(SRS.liveStreak({ last: "2026-05-01", streak: 30 }, TODAY), 0);
  assert.equal(SRS.liveStreak({ last: "", streak: 0 }, TODAY), 0, "no review yet");
  assert.equal(SRS.liveStreak(null, TODAY), 0);
  assert.equal(SRS.liveStreak({ last: TODAY, streak: "x" }, TODAY), 0, "junk is not a streak");
  assert.equal(SRS.liveStreak({ last: "junk", streak: 3 }, TODAY), 0);
  assert.equal(SRS.liveStreak({ last: "2026-12-31", streak: 2 }, "2027-01-01"), 2, "the year end is a normal yesterday");
});

test("srs: the streak continues from yesterday, resets after a gap, and holds for today", () => {
  assert.deepEqual(plain(SRS.streakAfter({ last: "2026-05-19", streak: 4 }, TODAY)), { last: TODAY, streak: 5 });
  assert.deepEqual(plain(SRS.streakAfter({ last: TODAY, streak: 4 }, TODAY)), { last: TODAY, streak: 4 });
  assert.deepEqual(plain(SRS.streakAfter({ last: "2026-05-17", streak: 9 }, TODAY)), { last: TODAY, streak: 1 });
  assert.deepEqual(plain(SRS.streakAfter({ last: "", streak: 0 }, TODAY)), { last: TODAY, streak: 1 });
  assert.deepEqual(plain(SRS.streakAfter({ last: "2026-05-19", streak: 4 }, "2026-03-01")), { last: "2026-03-01", streak: 1 },
    "a streak only continues from the very day before");
  assert.deepEqual(plain(SRS.streakAfter({ last: "2026-12-31", streak: 2 }, "2027-01-01")), { last: "2027-01-01", streak: 3 },
    "the year end is a normal yesterday");
  assert.deepEqual(plain(SRS.streakAfter(null, TODAY)), { last: TODAY, streak: 1 });
});
