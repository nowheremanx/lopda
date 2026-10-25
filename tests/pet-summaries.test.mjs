// Part D1 of the built-in pet: the read-only summaries the pet reads from the calendar, the dictionary and the reader
// (docs/decisions.md section 37). calendar.js, dict.js and reader.js run in a vm on a DOM just large enough to load them;
// every element is a stub and hidden, so no ready() callback draws anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read, runScript } from "./helpers.mjs";

const plain = (v) => JSON.parse(JSON.stringify(v));

/* the text selection the reader and the dictionary build at load (runtime/textsel.js) */
function selStub() {
  return { s: null, touch() {}, start() {}, end() {}, paint() {}, unpaint() {}, key() {}, drawMenu() {},
    select() {}, word() { return ""; }, text() { return ""; }, parts() { return []; }, rangeRects() { return []; } };
}

/* one stub element: remembers its children, does nothing else */
function elem() {
  const e = {
    childNodes: [], style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    textContent: "", className: "", id: "", hidden: true, value: "", disabled: false, parentNode: null, scrollTop: 0,
    appendChild(c) { e.childNodes.push(c); c.parentNode = e; return c; },
    removeChild(c) { const i = e.childNodes.indexOf(c); if (i >= 0) e.childNodes.splice(i, 1); c.parentNode = null; return c; },
    insertBefore(c) { return e.appendChild(c); },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    focus() {}, blur() {}, click() {}, scrollIntoView() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 240, right: 320, bottom: 240 }; },
    get firstChild() { return e.childNodes[0] || null; },
    get lastChild() { return e.childNodes[e.childNodes.length - 1] || null; },
    get lastElementChild() { return e.lastChild; },
    get children() { return e.childNodes; },
    get clientWidth() { return 320; }, get clientHeight() { return 240; }, get scrollHeight() { return 240; }
  };
  return e;
}

/* a fixed clock: `new Date()` and Date.now() are this instant, local time */
function fixedDate(iso) {
  const Real = Date;
  return class extends Real {
    constructor(...a) { if (!a.length) super(iso); else super(...a); }
    static now() { return new Real(iso).getTime(); }
  };
}

/* the document store the ready() hooks expect: one root document and its collections */
function snap(value) { return Promise.resolve({ exists: value !== undefined, data: () => value }); }
function docRef(value, collections = {}) {
  return {
    get: () => snap(value), set: () => Promise.resolve(true), update: () => Promise.resolve(true), delete: () => Promise.resolve(true),
    doc: () => docRef(undefined), collection: (name) => collections[name] || colRef([])
  };
}
function colRef(list) {
  return { get: () => Promise.resolve({ docs: list.map(([id, v]) => ({ id, data: () => v })) }), doc: () => docRef(undefined) };
}

/* run lunar.js, then one built-in, with a fake window.LP */
function boot(file, opt = {}) {
  const ids = new Map();
  const $ = (id) => { if (!ids.has(id)) ids.set(id, elem()); return ids.get(id); };
  const document = {
    hidden: false, body: elem(), documentElement: elem(),
    createElement() { return elem(); },
    createTextNode(t) { return { textContent: t, nodeType: 3 }; },
    getElementById: $,
    querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {}
  };
  const shown = [];
  const LP = {
    $, S: { db: opt.db || null }, shown,
    tr: (k, p) => (k === "cal.ym" && p ? p.y + "-" + p.m : k),
    own: (x) => x, toast() {}, put: () => Promise.resolve(true), sfx() {},
    show(name) { shown.push(name); }, showPad() {}, uid: () => "id",
    pad2: (n) => String(n).padStart(2, "0"), noEmoji: (s) => s,
    onData() {}, padRoute() {}, builtin(b) { LP.builtins.push(b); return b; }, builtins: [],
    softkeys() {}, renderHome() {}, keepAwake() {}, fmt: () => "",
    speech: { synth: () => null, voice: () => null, volume: () => 1 }, SND: { vol: 1 }, notes: null
  };
  const globals = Object.assign({
    console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    document, navigator: { standalone: false }, addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    fetch: () => Promise.reject(new Error("offline")),
    getComputedStyle: () => ({ paddingLeft: "0", paddingRight: "0", paddingTop: "0", paddingBottom: "0", fontFamily: "sans-serif" }),
    LP, Date: fixedDate("2026-10-24T12:00:00")
  }, opt.globals || {});
  const ctx = runScript("runtime/lunar.js", globals);
  vm.runInContext(read(file), ctx, { filename: file });
  const builtin = ctx.LP.builtins[0];
  return { ctx, LP: ctx.LP, $, builtin, document };
}

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

test("calendar.upcoming: only {in}, sorted, and no date name ever leaves", async () => {
  const dates = [
    ["d1", { name: "妈妈生日", month: 10, day: 26, lunar: false }],   // two days after the fixed today (2026-10-24)
    ["d2", { name: "结婚纪念", month: 11, day: 30, lunar: false }],   // 37 days
    ["d3", { name: "今天", month: 10, day: 24, lunar: false }],       // today
    ["d4", { name: "爷爷生日", month: 9, day: 15, lunar: true }]      // a lunar date, one year ahead at most
  ];
  const { ctx, LP, builtin } = boot("runtime/apps/calendar.js", {
    db: { doc: () => docRef({}, { days: colRef(dates) }) }
  });

  // before the data has loaded: an empty list, and no throw
  assert.deepEqual(plain(LP.calendar.upcoming(7)), []);

  builtin.ready();
  await settle();

  const week = plain(LP.calendar.upcoming(7));
  assert.ok(Array.isArray(week));
  assert.ok(week.some((x) => x.in === 0), "the date falling today is in");
  assert.ok(week.some((x) => x.in === 2), "a solar date two days out is in");
  assert.ok(week.every((x) => Number.isInteger(x.in) && x.in >= 0 && x.in <= 7), "every day is inside 0..days");
  assert.deepEqual(week.map((x) => x.in), week.map((x) => x.in).slice().sort((a, b) => a - b), "sorted ascending");
  for (const x of week) assert.deepEqual(Object.keys(x), ["in"], "no name, id, note or other field");

  const today = plain(LP.calendar.upcoming(0));
  assert.ok(today.length >= 1 && today.every((x) => x.in === 0), "days = 0 is today only");

  // a year covers every date once: the lunar one included, the 37-day one included
  const year = plain(LP.calendar.upcoming(400));
  assert.equal(year.length, 4);
  assert.ok(year.some((x) => x.in === 37));
  assert.ok(!JSON.stringify(year).includes("妈妈生日"));
  assert.ok(!JSON.stringify(year).includes("结婚纪念"));
  assert.ok(!JSON.stringify(year).includes("今天"));

  const n = ctx.LopdaLunar.dayNumber(2026, 8, 15);
  assert.equal(LP.calendar.open(n), true);
  assert.deepEqual(LP.shown, ["cal"], "the calendar view is shown");
  assert.equal(ctx.document.getElementById("cal-ym").textContent, "2026-8", "on the requested day's month");
});

test("dict.summaries: the word count and newest time, and one word picked by seed", async () => {
  const words = Array.from({ length: 10 }, (_, i) => ({ w: "word" + i, t: 1000 + i }));
  const { LP, builtin } = boot("runtime/apps/dict.js", {
    db: { doc: () => docRef({ order: ["ecdict"], disabled: [], history: [], words }, {}) },
    globals: {
      LopdaStarDict: {},
      LopdaPlatform: { files: { get() {}, put() {}, del() {} }, persist: () => Promise.resolve() },
      LopdaTextSel: { create: () => selStub() },
      LopdaWordList: { source: () => ({}) }
    }
  });

  builtin.ready();
  await settle();

  assert.deepEqual(plain(LP.dict.bookSummary()), { n: 10, newest: 1009 });
  assert.deepEqual(Object.keys(LP.dict.bookSummary()), ["n", "newest"]);
  assert.equal(typeof LP.dict.lookup, "function", "the existing LP.dict object is added to, not replaced");
  assert.equal(typeof LP.dict.inBook, "function");

  for (let seed = 0; seed < 10; seed++) assert.equal(LP.dict.pickWord(seed), "word" + seed);
  assert.equal(LP.dict.pickWord(4), LP.dict.pickWord(4), "the same seed always gives the same word");
  assert.equal(new Set(Array.from({ length: 10 }, (_, i) => LP.dict.pickWord(i))).size, 10, "different seeds, different words");
  assert.equal(LP.dict.pickWord(-1), "word9");
});

test("dict.pickWord is null and bookSummary is zero on an empty word book", async () => {
  const { LP, builtin } = boot("runtime/apps/dict.js", {
    db: { doc: () => docRef({ order: ["ecdict"], disabled: [], history: [], words: [] }, {}) },
    globals: {
      LopdaStarDict: {},
      LopdaPlatform: { files: { get() {}, put() {}, del() {} }, persist: () => Promise.resolve() },
      LopdaTextSel: { create: () => selStub() },
      LopdaWordList: { source: () => ({}) }
    }
  });
  builtin.ready();
  await settle();

  assert.deepEqual(plain(LP.dict.bookSummary()), { n: 0, newest: 0 });
  assert.equal(LP.dict.pickWord(3), null);
});

test("reader.current: only id, pct, opened, and finished or unopened books are skipped", async () => {
  const mk = (title, opened, pct, added) => ({ title, author: "someone", chars: 10, lens: [10], added, opened, pct, pos: { ch: 0, p: 0, c: 0 }, marks: [] });
  const books = [
    ["b1", mk("书一", 1000, 40, 900)],
    ["b2", mk("书二", 5000, 100, 800)],   // newest, but finished
    ["b3", mk("书三", 0, 0, 6000)],       // never opened
    ["b4", mk("书四", 2000, 72.6, 700)]   // the most recent unfinished one
  ];
  const { LP, builtin } = boot("runtime/apps/reader.js", {
    db: { doc: () => docRef({ seeded: true }, { books: colRef(books), fonts: colRef([]) }) },
    globals: {
      LopdaBook: {},
      LopdaPlatform: { files: { get: () => Promise.resolve(null), put() {}, del() {} }, persist: () => Promise.resolve() },
      LopdaTextSel: { create: () => selStub(), unwrap() {} }
    }
  });

  assert.equal(LP.reader.current(), null, "nothing before the shelf has loaded");
  builtin.ready();
  await settle();

  const cur = plain(LP.reader.current());
  assert.deepEqual(cur, { id: "b4", pct: 73, opened: 2000 });
  assert.deepEqual(Object.keys(cur), ["id", "pct", "opened"]);
  const json = JSON.stringify(cur);
  for (const s of ["书一", "书二", "书三", "书四", "someone"]) assert.ok(!json.includes(s), `${s} is not in the summary`);

  assert.equal(LP.reader.open("nope"), false, "an id not on the shelf opens nothing");
  assert.equal(LP.reader.open("b4"), true);
  assert.deepEqual(LP.shown, ["reader"]);
  await settle();
});
