// runtime/petsim.js: the built-in pet's pure rules (briefs/pet/design.md sections 3-8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const P = runScript("runtime/petsim.js").LopdaPet;

/* all times in these tests are local UTC+8, built from UTC so the machine's own zone never shows up */
const TZ = 480;
const at = (y, mo, d, h = 0, mi = 0, tz = TZ) => Date.UTC(y, mo - 1, d, h, mi) - tz * 60000;
const plain = (v) => JSON.parse(JSON.stringify(v));
const rows = (r = "0123012301230123") => Array.from({ length: 16 }, () => r);
const base = (now = at(2026, 10, 20, 8, 0)) => P.fresh(now, P.rng(1234));

/* ---------- seeds and local time ---------- */
test("rng: deterministic, in [0,1), different seeds move", () => {
  const a = P.rng(42), b = P.rng(42), c = P.rng(43);
  const first = Array.from({ length: 8 }, () => a());
  assert.deepEqual(Array.from({ length: 8 }, () => b()), first);
  assert.notDeepEqual(Array.from({ length: 8 }, () => c()), first);
  for (const v of first) assert.ok(v >= 0 && v < 1, String(v));
  assert.equal(P.daySeed(1000, "2026-10-20"), P.daySeed(1000, "2026-10-20"));
  assert.notEqual(P.daySeed(1000, "2026-10-20"), P.daySeed(1000, "2026-10-21"));
});

test("dayKey and hourOf: local time from the passed offset, not the machine's zone", () => {
  const now = Date.UTC(2026, 9, 20, 20, 30);
  assert.equal(P.dayKey(now, 480), "2026-10-21");
  assert.equal(P.hourOf(now, 480), 4);
  assert.equal(P.dayKey(now, -300), "2026-10-20");
  assert.equal(P.hourOf(now, -300), 15);
  assert.equal(P.dayKey(now, 0), "2026-10-20");
  assert.equal(P.hourOf(now, 0), 20);
});

/* ---------- a new egg ---------- */
test("fresh: the save of design.md 8, plus lastMeal, today's counters and the carried awake minutes", () => {
  const now = at(2026, 10, 20, 8, 0), s = P.fresh(now, P.rng(7));
  assert.deepEqual(Object.keys(s).sort(), ["aiUse", "awakeHunger", "awakeJoy", "born", "close", "form", "hunger", "joy", "last", "lastDay", "lastMeal",
    "light", "marks", "mess", "name", "opened", "room", "seenUse", "shelf", "species", "stage", "today", "trait", "travel", "v"].sort());
  assert.deepEqual(Object.keys(s.today).sort(), ["ai", "back", "burp", "day", "out", "pats", "pick", "picked", "played", "rewarded", "shelf", "shown", "shownYesterday", "snacks", "used"]);
  assert.deepEqual([s.v, s.species, s.room, s.born, s.last, s.hunger, s.joy, s.mess, s.close, s.opened, s.lastDay, s.awakeHunger, s.awakeJoy],
    [1, "chip", "chip", now, now, 5, 5, 0, 0, 0, null, 0, 0]);
  assert.deepEqual([s.stage, s.form, s.light, s.travel, s.lastMeal, s.name, s.shelf], ["egg", null, true, false, null, null, null]);
  assert.ok(s.marks.ant >= 0 && s.marks.ant <= 5);
  assert.ok(s.marks.eye >= 0 && s.marks.eye <= 2);
  assert.ok(s.marks.pat === undefined, "the body pattern is gone from fresh saves");
  assert.ok(["lively", "sleepy", "curious"].includes(s.trait));
  /* marks and traits do vary with the seed, and always stay in their ranges */
  const traits = new Set(), ant = new Set();
  for (let i = 0; i < 60; i++) {
    const f = P.fresh(now, P.rng(i));
    traits.add(f.trait); ant.add(f.marks.ant);
    assert.ok(f.marks.ant < 6 && f.marks.eye < 3 && f.marks.pat === undefined);
  }
  assert.equal(traits.size, 3);
  assert.ok(ant.size >= 3);
});

/* ---------- sleep ---------- */
test("asleep: 22:00-7:00, sleepy 21:30-7:30, and a light left off after 20:00", () => {
  const normal = { species: "chip", trait: "curious", light: true };
  assert.equal(P.asleep(normal, 21, 59), false);
  assert.equal(P.asleep(normal, 22, 0), true);
  assert.equal(P.asleep(normal, 6, 59), true);
  assert.equal(P.asleep(normal, 7, 0), false);
  const sleepy = { species: "chip", trait: "sleepy", light: true };
  assert.equal(P.asleep(sleepy, 21, 29), false);
  assert.equal(P.asleep(sleepy, 21, 30), true);
  assert.equal(P.asleep(sleepy, 7, 29), true);
  assert.equal(P.asleep(sleepy, 7, 30), false);
  const dark = { species: "chip", trait: "curious", light: false };
  assert.equal(P.asleep(dark, 20, 30), true);
  assert.equal(P.asleep(dark, 20, 0), true);
  assert.equal(P.asleep(dark, 19, 59), false, "a dark afternoon is not bedtime");
  assert.equal(P.asleep({ ...dark, trait: "sleepy" }, 20, 30), true);
});

test("actionReady: in bed only food and the light; travel only the call; an outing and an egg none", () => {
  const adult = { stage: "adult" };
  const ACTIONS = [...P.ACTIONS];
  const ready = (s, ctx) => ACTIONS.filter((a) => P.actionReady(s, a, ctx));
  assert.deepEqual(ready(adult, {}), ["food", "play", "wash", "light", "call"], "awake: all five");
  assert.deepEqual(ready(adult, { asleep: true }), ["food", "light"], "in bed: a meal or the light");
  assert.deepEqual(ready(adult, { outing: true }), [], "on an outing it answers nothing");
  assert.deepEqual(ready({ ...adult, travel: true }, {}), ["call"], "away: the call brings it home");
  assert.deepEqual(ready({ ...adult, travel: true }, { asleep: true }), ["call"], "travel wins over sleep");
  assert.deepEqual(ready({ stage: "egg" }, {}), [], "an egg has no icons");
  assert.equal(P.actionReady(null, "food", {}), false);
  assert.equal(P.actionReady({ stage: "baby" }, "play", {}), true, "a baby can play too");
});

/* ---------- the bed <-> floor walk ---------- */
test("pathPoint: the bed walk goes down first, then across; the way back comes along the floor and up last", () => {
  const bed = { x: 10, y: 52 }, rug = { x: 83, y: 69 };
  assert.deepEqual(plain(P.pathPoint(bed, rug, 0)), bed, "starts at the bed");
  assert.deepEqual(plain(P.pathPoint(bed, rug, 1)), rug, "ends on the rug");
  const quarter = P.pathPoint(bed, rug, 0.1);
  assert.equal(quarter.x, 10, "leaves the bed straight down, not through its head");
  assert.ok(quarter.y > 52 && quarter.y < 69, "and is on its way down: " + quarter.y);
  const half = P.pathPoint(bed, rug, 0.5);
  assert.equal(half.y, 69, "then walks along the floor");
  assert.ok(half.x > 10 && half.x < 83, "across the room: " + half.x);
  /* coming back: the floor first, the climb at the bed's own column */
  const back = P.pathPoint(rug, bed, 0.1);
  assert.equal(back.y, 69, "stays on the floor at first");
  assert.ok(back.x < 83, "walking left");
  const last = P.pathPoint(rug, bed, 0.9);
  assert.equal(last.x, 10, "then climbs up at the bed");
  assert.ok(last.y > 52, "still below the pillow: " + last.y);
  /* a floor-to-floor move is a plain horizontal walk */
  assert.deepEqual(plain(P.pathPoint({ x: 32, y: 69 }, { x: 83, y: 69 }, 0.5)), { x: 58, y: 69 });
  assert.deepEqual(plain(P.pathPoint(rug, rug, 0.4)), rug, "no distance, no movement");
});

/* ---------- catch-up ---------- */
test("catch-up after 1 and 5 hours: hunger every 4 awake hours, joy every 6", () => {
  const s = base();
  const one = P.catchUp(s, at(2026, 10, 20, 9, 0), { tz: TZ });
  assert.deepEqual([one.save.hunger, one.save.joy, one.save.mess], [5, 5, 0]);
  assert.deepEqual(plain(one.events), []);
  assert.equal(one.save.last, at(2026, 10, 20, 9, 0));
  const five = P.catchUp(s, at(2026, 10, 20, 13, 0), { tz: TZ });
  assert.deepEqual([five.save.hunger, five.save.joy, five.save.mess], [4, 5, 0]);
});

test("catch-up after 30 hours and 2 days: nights do not starve it, floors hold, hungry is reported", () => {
  const s = base();
  const thirty = P.catchUp(s, at(2026, 10, 21, 14, 0), { tz: TZ });
  /* 14 awake hours on day one and 7 on day two: 21 awake hours */
  assert.deepEqual([thirty.save.hunger, thirty.save.joy], [0, 2]);
  assert.ok(thirty.events.includes("hungry"));
  const two = P.catchUp(s, at(2026, 10, 22, 8, 0), { tz: TZ });
  /* 48 h minus two 9-hour nights = 30 awake hours */
  assert.deepEqual([two.save.hunger, two.save.joy, two.save.mess], [0, 0, 0]);
  assert.equal(two.save.travel, false);
  assert.equal(two.save.last, at(2026, 10, 22, 8, 0));
});

test("awake-minute residue: seven 2-hour opens equal one 08:00 -> 22:00 catch-up", () => {
  const s = base(at(2026, 10, 20, 8, 0));
  let stepped = s;
  for (let i = 1; i <= 7; i++) stepped = P.catchUp(stepped, at(2026, 10, 20, 8 + 2 * i, 0), { tz: TZ }).save;
  const once = P.catchUp(s, at(2026, 10, 20, 22, 0), { tz: TZ }).save;
  assert.deepEqual([stepped.hunger, stepped.joy], [once.hunger, once.joy]);
  assert.deepEqual([stepped.hunger, stepped.joy], [2, 3]);
  assert.deepEqual([stepped.awakeHunger, stepped.awakeJoy], [120, 120], "the residue is carried, not rounded away");
});

test("awake-minute residue: six days of four opens a day still makes it hungry and less joyful", () => {
  let s = base(at(2026, 10, 20, 8, 0));
  for (let d = 0; d < 6; d++) {
    for (const h of [8, 10, 12, 14]) {
      if (d === 0 && h === 8) continue;                     /* the fresh save itself is the first open */
      s = P.catchUp(s, at(2026, 10, 20 + d, h, 0), { tz: TZ }).save;
    }
  }
  assert.equal(s.hunger, 0);
  assert.equal(s.joy, 0);
});

test("travel zeroes the carried awake minutes", () => {
  const s = { ...base(), awakeHunger: 200, awakeJoy: 300 };
  const r = P.catchUp(s, at(2026, 10, 24, 8, 0), { tz: TZ });
  assert.deepEqual([r.save.awakeHunger, r.save.awakeJoy], [0, 0]);
});

test("no hunger loss across a night, and the wake is reported", () => {
  const s = base(at(2026, 10, 20, 21, 0));
  const night = P.catchUp(s, at(2026, 10, 21, 7, 0), { tz: TZ });
  assert.equal(night.save.hunger, 5);
  assert.equal(night.save.joy, 5);
  const asleepAll = P.catchUp(base(at(2026, 10, 20, 22, 0)), at(2026, 10, 21, 7, 0), { tz: TZ });
  assert.equal(asleepAll.save.hunger, 5);
  const morning = P.catchUp(base(at(2026, 10, 21, 6, 0)), at(2026, 10, 21, 9, 0), { tz: TZ });
  assert.ok(morning.events.includes("woke"));
});

test("hungry is reported once when hunger first reaches 1, not again while it sits at 0", () => {
  const s = base(at(2026, 10, 20, 8, 0));
  s.hunger = 2; s.awakeHunger = 239;                 /* one awake minute away from the next step */
  const first = P.catchUp(s, at(2026, 10, 20, 9, 0), { tz: TZ });
  assert.equal(first.save.hunger, 1);
  assert.ok(first.events.includes("hungry"), "the first arrival at 1 is the real change");
  const more = P.catchUp(first.save, at(2026, 10, 20, 13, 0), { tz: TZ });
  assert.equal(more.save.hunger, 0);
  assert.ok(!more.events.includes("hungry"), "1 -> 0 is the same need, no second call");
});

test("a meal leaves a pile 2-3 hours later, once; mess stops at 3", () => {
  const s = base();
  s.lastMeal = at(2026, 10, 20, 6, 0);
  const r = P.catchUp(s, at(2026, 10, 20, 10, 0), { tz: TZ });
  assert.equal(r.save.mess, 1);
  assert.ok(r.events.includes("poop"));
  assert.equal(r.save.lastMeal, null, "the meal is spent");
  const later = P.catchUp(r.save, at(2026, 10, 20, 16, 0), { tz: TZ });
  assert.equal(later.save.mess, 1, "one meal, one pile");
  assert.ok(!later.events.includes("poop"));

  const full = base();
  full.mess = 3;
  full.lastMeal = at(2026, 10, 20, 6, 0);
  const capped = P.catchUp(full, at(2026, 10, 20, 10, 0), { tz: TZ });
  assert.equal(capped.save.mess, 3);
  assert.equal(capped.save.lastMeal, null, "it is not saved up for later");
});

test("away >= 3 days: travel and the return values; 2 days is only a long catch-up", () => {
  const s = base();
  const away = P.catchUp(s, at(2026, 10, 24, 8, 0), { tz: TZ });
  assert.equal(away.save.travel, true);
  assert.deepEqual([away.save.hunger, away.save.joy, away.save.mess], [3, 3, 0]);
  assert.deepEqual(plain(away.events), ["travel"]);
  assert.equal(away.save.last, at(2026, 10, 24, 8, 0));
  assert.equal(away.save.today.back, true);
  assert.equal(away.save.today.day, "2026-10-24");
  const exact = P.catchUp(base(), at(2026, 10, 23, 8, 0), { tz: TZ });
  assert.equal(exact.save.travel, true, "exactly three days counts");
});

test("clock set back: no time passes and last stays", () => {
  const s = base(at(2026, 10, 20, 12, 0));
  const back = P.catchUp(s, at(2026, 10, 20, 9, 0), { tz: TZ });
  assert.deepEqual(plain(back.save), plain(s));
  assert.deepEqual(plain(back.events), []);
  assert.equal(back.save.last, s.last);
});

test("catch-up never mutates its input and returns a new object", () => {
  const s = base();
  const before = plain(s);
  const r = P.catchUp(s, at(2026, 10, 22, 3, 0), { tz: TZ });
  assert.notEqual(r.save, s);
  assert.deepEqual(plain(s), before);
});

test("fuzz: a few hundred gaps keep every value in range and never mutate the save", () => {
  const rnd = P.rng(20261024), start = at(2026, 10, 1, 0, 0);
  for (let i = 0; i < 200; i++) {
    const s = P.fresh(start + Math.floor(rnd() * 20) * 86400000, P.rng(i + 1));
    s.hunger = Math.floor(rnd() * 6);
    s.joy = Math.floor(rnd() * 6);
    s.mess = Math.floor(rnd() * 4);
    s.last = start + Math.floor(rnd() * 20) * 86400000 + Math.floor(rnd() * 24) * 3600000;
    s.trait = ["lively", "sleepy", "curious"][Math.floor(rnd() * 3)];
    s.light = rnd() < 0.5;
    if (rnd() < 0.5) s.lastMeal = s.last - Math.floor(rnd() * 10) * 3600000;
    const before = plain(s);
    const gap = Math.floor(rnd() * 72) * 3600000 + Math.floor(rnd() * 60) * 60000;
    const now = s.last + gap;
    const r = P.catchUp(s, now, { tz: TZ });
    assert.ok(r.save.hunger >= 0 && r.save.hunger <= 5, "hunger " + r.save.hunger);
    assert.ok(r.save.joy >= 0 && r.save.joy <= 5, "joy " + r.save.joy);
    assert.ok(r.save.mess >= 0 && r.save.mess <= 3, "mess " + r.save.mess);
    assert.equal(r.save.last, now);
    assert.equal(r.save.travel, false);
    assert.deepEqual(plain(s), before, "input mutated at case " + i);
    assert.ok(Array.isArray(r.events));
  }
});

/* ---------- growth ---------- */
test("stage: egg until hatch, child on the 3rd day opened, adult on the 10th; one count a day", () => {
  let s = base();
  assert.equal(s.stage, "egg");
  s = P.openDay(s, "2026-10-20");
  assert.deepEqual([s.opened, s.lastDay, s.stage], [0, "2026-10-20", "egg"], "egg days are not growth days");
  const again = P.openDay(s, "2026-10-20");
  assert.equal(again.opened, 0, "the same day counts once");
  s = P.hatch(s);
  assert.deepEqual([s.stage, s.opened, s.lastDay], ["baby", 0, null]);
  s = P.openDay(s, "2026-10-21");
  assert.deepEqual([s.opened, s.stage], [1, "baby"]);
  s = P.openDay(s, "2026-10-22");
  assert.deepEqual([s.opened, s.stage], [2, "baby"]);
  s = P.openDay(s, "2026-10-23");
  assert.deepEqual([s.opened, s.stage], [3, "child"]);
  for (const d of [24, 25, 26, 27, 28, 29]) s = P.openDay(s, "2026-10-" + d);
  assert.equal(s.stage, "child");
  s = P.openDay(s, "2026-10-30", { reader: 10, notes: 2 });
  assert.deepEqual([s.opened, s.stage, s.form], [10, "adult", "book"]);
  const after = P.openDay(s, "2026-10-31", { notes: 100 });
  assert.equal(after.form, "book", "the adult form never changes");
  assert.equal(after.close, 12, "a day opened raises close, egg days included");
});

test("ten days opened as an egg do not count toward growth; the day after hatching is day one", () => {
  let s = base();
  for (let d = 1; d <= 10; d++) s = P.openDay(s, "2026-10-" + String(d).padStart(2, "0"));
  assert.deepEqual([s.opened, s.stage], [0, "egg"]);
  s = P.hatch(s);
  assert.deepEqual([s.opened, s.lastDay, s.stage], [0, null, "baby"]);
  s = P.openDay(s, "2026-10-11");
  assert.deepEqual([s.opened, s.stage], [1, "baby"], "a new day after hatching, not an adult");
});

test("hatch does nothing to a pet that is already out of the egg", () => {
  const s = P.hatch(P.hatch(base()));
  assert.equal(s.stage, "baby");
});

test("hatch: a freshly hatched pet starts hungry and a little bored, so the first meal shows", () => {
  const egg = base();
  assert.deepEqual([egg.hunger, egg.joy], [5, 5]);
  const s = P.hatch(egg);
  assert.deepEqual([s.hunger, s.joy, s.awakeHunger, s.awakeJoy], [2, 3, 0, 0]);
  const fed = P.feed(s, "meal", at(2026, 10, 20, 8, 5));
  assert.equal(fed.hunger, 4, "the first meal visibly raises hunger");
  assert.equal(egg.hunger, 5, "the egg save is untouched");
});

test("adultForm: the five program groups, 30 %, plain, ties and no uses", () => {
  assert.equal(P.adultForm(null), "plain");
  assert.equal(P.adultForm({}), "plain");
  assert.equal(P.adultForm({ settings: 50, pet: 20 }), "plain");
  assert.equal(P.adultForm({ reader: 10 }), "book");
  assert.equal(P.adultForm({ camera: 5, darkroom: 5 }), "walk");
  assert.equal(P.adultForm({ dict: 9, reader: 1 }), "scholar");
  assert.equal(P.adultForm({ notes: 6, reader: 4 }), "diary");
  assert.equal(P.adultForm({ cart: 3, apps: 3, reader: 4 }), "monster");
  /* exactly 30 % wins; 25 % does not */
  assert.equal(P.adultForm({ reader: 3, dict: 3, camera: 2, notes: 2 }), "book");
  assert.equal(P.adultForm({ reader: 2, dict: 2, camera: 2, notes: 2 }), "plain");
  /* a tie goes to the earlier form: book, walk, scholar, diary, monster */
  assert.equal(P.adultForm({ reader: 5, dict: 5 }), "book");
  assert.equal(P.adultForm({ dict: 5, notes: 5 }), "scholar");
  /* unmapped programs do not water down the counted use */
  assert.equal(P.adultForm({ reader: 10, settings: 90 }), "book");
});

/* ---------- the day's outing ---------- */
test("outing: same pet and day gives the same hour; days differ; the hour is daytime", () => {
  const s = base();
  const a = P.outingToday(s, "2026-10-20");
  const b = P.outingToday(s, "2026-10-20");
  assert.deepEqual(a, b);
  const seen = new Set();
  let out = 0;
  for (let d = 1; d <= 30; d++) {
    const key = "2026-10-" + String(d).padStart(2, "0");
    const o = P.outingToday(s, key);
    seen.add(JSON.stringify(o));
    if (o) {
      out++;
      assert.ok(o.hour >= 10 && o.hour <= 17, String(o.hour));
      assert.equal(o.hour, Math.floor(o.hour));
    }
  }
  assert.ok(seen.size > 1, "different days differ sometimes");
  assert.ok(out > 0, "it does go out sometimes");
});

test("outing: lively goes out more days than sleepy; travel and the return day stop it", () => {
  const born = base().born;
  const count = (trait) => {
    const s = { ...base(), trait };
    let n = 0;
    for (let d = 1; d <= 100; d++) if (P.outingToday(s, "2026-10-" + String(d).padStart(2, "0"))) n++;
    return n;
  };
  assert.ok(count("lively") > count("sleepy"));
  assert.ok(count("curious") > count("sleepy"));
  const s = base();
  assert.equal(P.outingToday({ ...s, travel: true }, "2026-10-20"), null);
  assert.equal(P.outingToday({ ...s, today: { day: "2026-10-20", back: true } }, "2026-10-20"), null);
});

test("outing: once it left at an hour, the same day returns that hour", () => {
  const s = base();
  const days = [];
  for (let d = 1; d <= 31; d++) days.push("2026-10-" + String(d).padStart(2, "0"));
  for (let d = 1; d <= 30; d++) days.push("2026-11-" + String(d).padStart(2, "0"));
  let key = null, first = null;
  for (const day of days) {
    const o = P.outingToday(s, day);
    if (o) { key = day; first = o; break; }
  }
  assert.ok(first, "found a day with an outing");
  const stored = { ...s, today: { ...s.today, day: key, out: first.hour } };
  assert.deepEqual(P.outingToday(stored, key), first);
});

/* ---------- the day's weather ---------- */
test("weatherOf: one of the five, deterministic per pet and day, snow only in winter", () => {
  const born = base().born, keys = Array.from({ length: 240 }, (_, i) => "2026-10-" + String(i % 28 + 1).padStart(2, "0") + "-" + i);
  const all = ["sun", "cloud", "rain", "snow", "wind"];
  for (const season of ["spring", "summer", "autumn", "winter"]) {
    const seen = new Set();
    for (const key of keys) {
      const w = P.weatherOf(born, key, season);
      assert.ok(all.includes(w), season + " " + key + " -> " + w);
      assert.equal(P.weatherOf(born, key, season), w, "same pet, day and season give the same weather");
      seen.add(w);
      if (season !== "winter") assert.notEqual(w, "snow", "snow only in winter");
    }
    assert.ok(seen.size >= (season === "winter" ? 5 : 4), `${season} has its own mix: ${[...seen]}`);
  }
  assert.ok(all.every((w) => [...keys].some((key) => P.weatherOf(born, key, "winter") === w)), "winter has all five");
  const other = base().born + 1;
  assert.ok(keys.some((key) => P.weatherOf(born, key, "spring") !== P.weatherOf(other, key, "spring")), "another pet gets other days");
  assert.equal(P.weatherOf(born, keys[0], "spring"), P.weatherOf(born, keys[0], "春"), "Chinese season names work too");
});

/* ---------- the pick of the day ---------- */
test("pickOfDay: yesterday's kind is dropped, only the first two kinds can win", () => {
  const cands = [{ kind: "film" }, { kind: "word" }, { kind: "book" }];
  let won = 0;
  for (let seed = 0; seed < 300; seed++) {
    const pick = P.pickOfDay(cands, "word", seed);
    if (!pick) continue;
    won++;
    assert.notEqual(pick.kind, "word");
    assert.ok(["book", "film"].includes(pick.kind), "word is gone, book/film are the first two: " + pick.kind);
  }
  assert.ok(won > 0);
  assert.equal(P.pickOfDay([{ kind: "word" }], "word", 1), null, "nothing else to show");
});

test("pickOfDay: all five kinds, no yesterday drop, only the first two in design order", () => {
  const cands = [{ kind: "film" }, { kind: "book" }, { kind: "word" }, { kind: "diary" }, { kind: "date" }];
  let shown = 0;
  for (let seed = 0; seed < 400; seed++) {
    const pick = P.pickOfDay(cands, null, seed);
    if (!pick) continue;
    shown++;
    assert.ok(pick.kind === "date" || pick.kind === "diary", "only date and diary can win: " + pick.kind);
  }
  assert.ok(shown > 0);
});

test("pickOfDay: null on about half of 1000 seeds, deterministic, never outside the candidates", () => {
  const cands = [{ kind: "word" }, { kind: "book" }, { kind: "film" }];
  const kinds = new Set(cands.map((c) => c.kind));
  let none = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const pick = P.pickOfDay(cands, null, seed);
    if (pick === null) none++;
    else assert.ok(kinds.has(pick.kind), String(pick.kind));
    assert.deepEqual(P.pickOfDay(cands, null, seed), pick, "same seed, same pick");
  }
  assert.ok(none >= 400 && none <= 600, "nulls: " + none);
});

/* ---------- care ---------- */
test("snacks: the 4th in a day burps and gives no joy; a new day resets the counter", () => {
  const now = at(2026, 10, 20, 15, 0);
  let s = { ...base(), joy: 0 };
  for (let i = 0; i < 3; i++) s = P.feed(s, "snack", now);
  assert.deepEqual([s.joy, s.today.snacks, s.today.burp, s.close], [3, 3, false, 3]);
  const burp = P.feed(s, "snack", now);
  assert.deepEqual([burp.joy, burp.today.snacks, burp.today.burp], [3, 4, true]);
  assert.equal(burp.close, 4, "a snack is still a care action");
  const next = P.feed(P.openDay(burp, "2026-10-21"), "snack", now);
  assert.deepEqual([next.joy, next.today.snacks, next.today.burp], [4, 1, false], "a new day clears the counters and the flag");
});

test("meal: hunger +2 at most 5 and lastMeal set; pats count 3 a day and reset", () => {
  let s = { ...base(), hunger: 1 };
  s = P.feed(s, "meal", at(2026, 10, 20, 12, 0));
  assert.deepEqual([s.hunger, s.lastMeal], [3, at(2026, 10, 20, 12, 0)]);
  assert.equal(P.feed(s, "meal", at(2026, 10, 20, 13, 0)).hunger, 5);

  let p = { ...base(), joy: 0 };
  for (let i = 0; i < 4; i++) p = P.pat(p, "2026-10-20");
  assert.deepEqual([p.joy, p.today.pats, p.close], [3, 3, 3]);
  const next = P.pat(p, "2026-10-21");
  assert.deepEqual([next.joy, next.today.pats], [4, 1]);
});

test("play, wash, light: joy in range, mess cleared, close raised, input untouched", () => {
  const s = { ...base(), joy: 4, mess: 2 };
  const before = plain(s);
  assert.equal(P.play(s, 2).joy, 5);
  assert.equal(P.play(s, 1).joy, 5);
  assert.equal(P.play({ ...s, joy: 0 }, 2).joy, 2);
  assert.equal(P.play({ ...s, joy: 0 }, 1).joy, 1);
  assert.equal(P.play({ ...s, joy: 0 }, 9).joy, 2, "the amount is clamped to +2");
  assert.equal(P.play({ ...s, joy: 0 }, 0).joy, 1, "the amount is clamped to +1");
  assert.equal(P.wash(s).mess, 0);
  assert.equal(P.setLight(s, false).light, false);
  assert.equal(P.setLight(s, false).close, s.close + 1);
  assert.deepEqual(plain(s), before);
});

test("wants: food at hunger 1 or less, otherwise wash at mess 2 or more", () => {
  assert.equal(P.wants({ ...base(), hunger: 1 }), "food");
  assert.equal(P.wants({ ...base(), hunger: 0, mess: 3 }), "food");
  assert.equal(P.wants({ ...base(), hunger: 5, mess: 2 }), "wash");
  assert.equal(P.wants({ ...base(), hunger: 5, mess: 1 }), null);
  assert.equal(P.wants(null), null);
});

/* ---------- souvenirs ---------- */
test("validateSouvenir: a good bilingual object or JSON string, trimmed, px joined to 256 characters", () => {
  const good = {
    name: { zh: " 红叶 ", en: " Red leaf " },
    line: { zh: " 在山顶捡到的一片叶子 ", en: " A leaf from the ridge. " },
    px: rows()
  };
  const v = P.validateSouvenir(good);
  assert.deepEqual(JSON.parse(JSON.stringify(v.name)), { zh: "红叶", en: "Red leaf" });
  assert.deepEqual(JSON.parse(JSON.stringify(v.line)), { zh: "在山顶捡到的一片叶子", en: "A leaf from the ridge." });
  assert.equal(v.px.length, 256);
  assert.match(v.px, /^[0-3]{256}$/);
  assert.deepEqual(P.validateSouvenir(JSON.stringify(good)), v);
  const longest = P.validateSouvenir({
    name: { zh: "一二三四五六七八", en: "Sixteen letters!" },
    line: { zh: "字".repeat(40), en: "word ".repeat(16).trim() },
    px: rows()
  });
  assert.equal([...longest.name.zh].length, 8);
  assert.equal([...longest.name.en].length, 16);
  assert.equal([...longest.line.zh].length, 40);
  assert.ok([...longest.line.en].length <= 80);
});

test("validateSouvenir: one language, the wrong script, or a bad length is refused", () => {
  const good = {
    name: { zh: "红叶", en: "Red leaf" },
    line: { zh: "一片叶子", en: "One leaf" },
    px: rows()
  };
  const bad = [
    "{",                                                                // bad JSON
    { ...good, name: "红叶" },                                          // one-language name (old shape)
    { ...good, line: "一片叶子" },                                       // one-language line
    { ...good, name: { zh: "红叶" } },                                  // no English name
    { ...good, name: { en: "Red leaf" } },                              // no Chinese name
    { ...good, name: { zh: "一二三四五六七八九", en: "Red leaf" } },     // 9 Chinese code points
    { ...good, name: { zh: "红叶", en: "Seventeen letters" } },          // 17 English characters
    { ...good, line: { zh: "字".repeat(41), en: "One leaf" } },           // 41 Chinese code points
    { ...good, line: { zh: "叶子", en: "x".repeat(81) } },               // 81 English characters
    { ...good, name: { zh: "red 红叶", en: "Red leaf" } },               // Latin in the Chinese name
    { ...good, name: { zh: "红叶", en: "红叶" } },                       // no Latin in the English name
    { ...good, name: { zh: "红叶", en: "Über leaf" } },                  // not a Latin letter
    { ...good, name: { zh: "红叶", en: "Red leaf 2" } },                 // digits are not basic punctuation
    { ...good, name: { zh: "叶😀", en: "Red leaf" } },                   // emoji
    { ...good, line: { zh: "叶子❤️", en: "One leaf" } },                // U+FE0F
    { ...good, line: { zh: "<b>叶子</b>", en: "One leaf" } },             // markup
    { ...good, name: { zh: "a\u0001b", en: "Red leaf" } },               // control
    { ...good, px: rows().slice(0, 15) },                                // 15 rows
    { ...good, px: [...rows().slice(0, 15), "01230123012301230"] },      // 17 columns
    { ...good, px: [...rows().slice(0, 15), "0123012301230124"] },       // a 4
    { name: good.name, line: good.line },                                // no px
    { name: good.name, px: rows() },                                     // no line
    { ...good, name: 7 },
    { ...good, px: "0123" },
    { ...good, px: [...rows().slice(0, 15), 123] },
    [],
    null
  ];
  for (const b of bad) assert.equal(P.validateSouvenir(b), null, JSON.stringify(b));
});

test("validateSouvenir: pictographs, symbols, invisibles and lone surrogates are refused", () => {
  const good = {
    name: { zh: "红叶", en: "Red leaf" },
    line: { zh: "一片叶子", en: "One leaf" },
    px: rows()
  };
  const bad = [
    ["watch", "\u231A"], ["alarm", "\u23F0"], ["hourglass", "\u231B"], ["wavy dash", "\u3030"],
    ["left-right arrow", "\u2194"], ["return arrow", "\u21A9"], ["small square", "\u25AA"],
    ["double exclamation", "\u203C"], ["interrobang", "\u2049"], ["trade mark", "\u2122"],
    ["information", "\u2139"], ["copyright", "\u00A9"], ["registered", "\u00AE"],
    ["dot", "\u303D"], ["circled ideograph", "\u3297"], ["circled secret", "\u3299"],
    ["keycap", "\u20E3"], ["zero width", "\u200B"], ["bidi override", "\u202E"],
    ["word joiner", "\u2060"], ["bidi isolate", "\u2066"], ["BOM", "\uFEFF"],
    ["lone high surrogate", "\uD800"], ["lone low surrogate", "\uDC00"]
  ];
  for (const [kind, ch] of bad) {
    assert.equal(P.validateSouvenir({ ...good, name: { ...good.name, zh: "叶" + ch } }), null, kind + " in the Chinese name");
    assert.equal(P.validateSouvenir({ ...good, line: { ...good.line, zh: "叶" + ch + "子" } }), null, kind + " in the Chinese line");
    assert.equal(P.validateSouvenir({ ...good, name: { ...good.name, en: "Leaf" + ch } }), null, kind + " in the English name");
  }
});

test("builtinSouvenir: deterministic, avoids recent names, repeats only when it must", () => {
  const table = [{ name: "A" }, { name: "B" }, { name: "C" }];
  assert.equal(P.builtinSouvenir(P.rng(5), ["A", "B"], table).name, "C");
  assert.deepEqual(P.builtinSouvenir(P.rng(5), [], table), P.builtinSouvenir(P.rng(5), [], table));
  assert.ok(table.includes(P.builtinSouvenir(P.rng(5), ["A", "B", "C"], table)));
  assert.equal(P.builtinSouvenir(P.rng(5), [], []), null);
  assert.equal(P.builtinSouvenir(P.rng(5), [], null), null);
  /* a numeric seed is accepted too */
  assert.deepEqual(P.builtinSouvenir(5, [], table), P.builtinSouvenir(P.rng(5), [], table));
  /* a bilingual table is avoided by either language the box showed */
  const pair = [
    { name: { zh: "红叶", en: "Red leaf" } },
    { name: { zh: "贝壳", en: "Shell" } },
    { name: { zh: "纽扣", en: "Button" } }
  ];
  const picked = P.builtinSouvenir(P.rng(5), ["红叶", "Button"], pair);
  assert.equal(picked.name.en, "Shell", "both languages count as recent");
});

/* ---------- the AI prompt ---------- */
test("aiPrompt: uses only the allowed facts; no notes, diary, calendar names, book title or word list", () => {
  const forbidden = ["PRIVATE-NOTE", "PRIVATE-DIARY", "PRIVATE-CAL", "PRIVATE-BOOK", "alpha", "beta", "gamma", "user-42", "SECRET-CAT"];
  const ctx = {
    form: "book", age: 12, mood: "curious", time: "evening", season: "autumn", term: "寒露",
    categories: ["read", "wrote a diary", "SECRET-CAT"], recent: ["红叶", "月票"],
    word: "serendipity", words: ["alpha", "beta", "gamma"],
    notes: "PRIVATE-NOTE", diary: "PRIVATE-DIARY", calendarNames: ["PRIVATE-CAL"],
    bookTitle: "PRIVATE-BOOK", id: "user-42", species: "chip", lang: "zh"
  };
  const r = P.aiPrompt(ctx);
  assert.equal(r.messages.length, 2);
  assert.ok(r.max > 0 && Number.isInteger(r.max));
  const s = JSON.stringify(r.messages);
  for (const f of forbidden) assert.ok(!s.includes(f), "leaked " + f);
  assert.equal(s.split("serendipity").length - 1, 1, "the one word appears once");
  assert.ok(s.includes("read") && s.includes("wrote a diary"));
  assert.ok(s.includes("JSON"));
  assert.ok(s.includes("寒露"));
  const raw = r.messages.map((m) => m.content).join("\n");
  assert.ok(raw.includes('"name":{"zh"') && raw.includes('"line":{"zh"'), "the schema asks for both languages");
  assert.ok(raw.includes("16 characters at most") && raw.includes("80 characters at most"));
  assert.ok(raw.includes("中文只用汉字") && raw.includes("不要其他语言"));
  /* the English prompt is English and still carries the same facts */
  const en = P.aiPrompt({ ...ctx, lang: "en" });
  const es = JSON.stringify(en.messages);
  for (const f of forbidden) assert.ok(!es.includes(f), "leaked " + f);
  assert.equal(es.split("serendipity").length - 1, 1);
  assert.ok(es.includes("Reply with JSON only"));
  assert.ok(!es.includes("请只输出"));
  const eraw = en.messages.map((m) => m.content).join("\n");
  assert.ok(eraw.includes('"name":{"zh"') && eraw.includes('"line":{"zh"'));
  assert.ok(eraw.includes("both") || eraw.includes("Both"));
});

test("aiPrompt: a word with whitespace or a newline is dropped; other fields collapse whitespace", () => {
  for (const word of ["My Book Title", "one\ntwo", "a\tb"]) {
    const s = JSON.stringify(P.aiPrompt({ lang: "en", word }).messages);
    assert.ok(!s.includes("My Book"), word);
    assert.ok(!s.includes("one two"), word);
    assert.ok(!s.includes("a b"), word);
    assert.ok(!s.includes("One word"), "the label goes with the dropped value: " + word);
  }
  const s = JSON.stringify(P.aiPrompt({ lang: "en", mood: "  very\n  calm  ", word: "serendipity" }).messages);
  assert.ok(s.includes("very calm"));
  assert.equal(s.split("serendipity").length - 1, 1);
});

test("undefined and null inputs come back unchanged instead of throwing", () => {
  for (const v of [undefined, null]) {
    assert.equal(P.hatch(v), v);
    assert.equal(P.feed(v, "meal", 0), v);
    assert.equal(P.play(v, 3), v);
    assert.equal(P.wash(v), v);
    assert.equal(P.pat(v, "2026-10-20"), v);
    assert.equal(P.setLight(v, false), v);
    assert.equal(P.openDay(v, "2026-10-20"), v);
    const c = P.catchUp(v, at(2026, 10, 21, 8, 0), { tz: TZ });
    assert.equal(c.save, v);
    assert.deepEqual(plain(c.events), []);
  }
});

test("aiPrompt: ctx.words is never a word source when ctx.word is absent", () => {
  const s = JSON.stringify(P.aiPrompt({ lang: "en", words: ["alpha", "beta", "gamma"], recent: ["Ticket"] }).messages);
  for (const w of ["alpha", "beta", "gamma"]) assert.ok(!s.includes(w), w);
  assert.ok(s.includes("Ticket"));
});

test("aiPrompt: the last five souvenir names fit, the sixth is left behind", () => {
  const s = JSON.stringify(P.aiPrompt({ lang: "en", recent: ["N1", "N2", "N3", "N4", "N5", "N6"] }).messages);
  for (const n of ["N2", "N3", "N4", "N5", "N6"]) assert.ok(s.includes(n), n);
  assert.ok(!s.includes("N1"), "only the last five");
});

/* ---------- the AI's small vocabulary ---------- */
test("moodWord: one word from hunger and joy, in both languages", () => {
  assert.equal(P.moodWord(0, 5, false), "hungry");
  assert.equal(P.moodWord(5, 0, false), "low");
  assert.equal(P.moodWord(4, 5, false), "happy");
  assert.equal(P.moodWord(5, 3, false), "calm");
  assert.equal(P.moodWord(3, 3, false), "content");
  assert.equal(P.moodWord(0, 5, true), "有点饿");
  for (const [h, j] of [[0, 0], [5, 5], [-3, 9], [2.6, 2.4]]) assert.ok(typeof P.moodWord(h, j, false) === "string");
});

test("aiCategories: only the fixed words whose usage counts grew", () => {
  const before = { reader: 3, cam: 0, dict: 2, notes: 1, darkroom: 0, apps: 4 };
  const after = { reader: 3, cam: 2, dict: 4, notes: 1, darkroom: 1, apps: 4 };
  assert.deepEqual([...P.aiCategories(before, after)], ["took photos", "studied words", "developed film"]);
  assert.deepEqual([...P.aiCategories({}, {})], []);
  assert.deepEqual([...P.aiCategories(null, { reader: 1 })], ["read"]);
  /* nothing outside the fixed vocabulary can come out, whatever the counts are called */
  assert.deepEqual([...P.aiCategories({}, { secret: 9, reader: 1 })], ["read"]);
});

test("a new day keeps yesterday's kind and clears the pick and its counters", () => {
  const now = at(2026, 10, 20, 21, 30), s = P.fresh(now, P.rng(9));
  s.today = { ...s.today, day: "2026-10-20", shown: "word", picked: true, pick: { kind: "word", word: "光" }, used: true, ai: true, snacks: 2 };
  const next = P.openDay(s, "2026-10-21", null);
  assert.equal(next.today.day, "2026-10-21");
  assert.equal(next.today.shownYesterday, "word");
  assert.equal(next.today.shown, null);
  assert.equal(next.today.picked, false);
  assert.equal(next.today.pick, null);
  assert.equal(next.today.used, false);
  assert.equal(next.today.ai, false);
  assert.equal(next.today.snacks, 0);
  /* the previous save is untouched */
  assert.equal(s.today.day, "2026-10-20");
  assert.equal(s.today.used, true);
});
