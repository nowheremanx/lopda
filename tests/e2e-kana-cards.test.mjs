// Kana (registry/apps/kana-cards) at the smallest handheld screen, 331x359: the app opens on its
// home screen, the mode label and the key guide are separate in English and Chinese, a quiz counts
// its own questions instead of the kana's table position, the kana grid says whether it goes on
// beyond its top and bottom edges, and the daily review ends on a tally that fits.
// It also holds the large screen, 386x738: the cover at 2x, the table as wide as the column, and the
// quiz's Left and Right crossing between the two choices of a row.
// Needs Playwright, which the repo does not depend on, so this test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-kana-cards.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "registry/apps/kana-cards";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json" };
let server, base, browser;

before(async () => {
  if (skip) return;
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    const file = join(ROOT, path.endsWith("/") ? path + "index.html" : path);
    try { res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }); res.end(await readFile(file)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  /* without this flag, sandboxed iframes render blank in headless Chromium */
  browser = await pw.chromium.launch({ args: ["--disable-site-isolation-trials"] });
});
after(async () => { await browser?.close(); server?.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* the app frame after a load or a reload: at the smallest size, in the right language, on home */
async function appFrame(p, lang) {
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  let frame = null;
  for (let i = 0; i < 80 && !frame; i++) {
    const f = p.frames().find((x) => x !== p.mainFrame());
    if (f) { try { await f.waitForFunction(() => !!window.PAD, null, { timeout: 300 }); frame = f; } catch {} }
    if (!frame) await sleep(50);
  }
  assert.ok(frame, "the app frame loads");
  await p.locator("#app").evaluate((el) => { el.style.width = "331px"; el.style.height = "359px"; el.style.flex = "none"; });
  await frame.waitForFunction((want) => document.documentElement.lang === want, lang === "zh" ? "zh-CN" : "en", { timeout: 5000 });
  await frame.waitForFunction(() => document.body.classList.contains("home"), null, { timeout: 5000 });
  return frame;
}

/* one dev-harness page with the app frame at the smallest size; a fresh browser context, so no saved state */
async function open(t, lang) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  t.after(() => p.close());
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await p.goto(`${base}/sdk/dev.html?app=${APP}${lang === "zh" ? "&lang=zh" : ""}`, { waitUntil: "load" });
  const frame = await appFrame(p, lang);
  return { p, frame, errors };
}

/* write a save through the harness (the app's frame is sandboxed and cannot touch localStorage) */
async function seed(p, lang, doc) {
  await p.evaluate((state) => {
    localStorage.setItem("lopda-dev:kana-cards", JSON.stringify({ "kana-cards-state": state }));
  }, doc);
  await p.reload({ waitUntil: "load" });
  return appFrame(p, lang);
}

/* the home screen is the top level now, so reaching the table is its own step */
async function toTable(frame) {
  if (await frame.evaluate(() => document.body.classList.contains("list"))) return;
  await frame.click("#row-table");
  await frame.waitForFunction(() => document.body.classList.contains("list"), null, { timeout: 5000 });
}

/* the dev harness's screen is the app's stage: give the app another phone and wait for its fit */
async function setStage(p, frame, w, h) {
  await p.locator("#app").evaluate((el, size) => {
    el.style.width = size[0] + "px"; el.style.height = size[1] + "px"; el.style.flex = "none";
  }, [w, h]);
  await frame.waitForFunction((size) => document.documentElement.clientWidth === size[0] &&
    document.documentElement.clientHeight === size[1], [w, h], { timeout: 5000 });
  /* the fit runs from the observer and from render; one frame is enough */
  await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function guideBoxes(frame) {
  return frame.evaluate(() => {
    const box = (id) => {
      const el = document.querySelector(id), r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    };
    const root = document.documentElement;
    return { size: [root.clientWidth, root.clientHeight], mode: box("#mode"), guide: box("#guide"), meta: box("#meta") };
  });
}

async function assertGuideRow(frame, where) {
  const lay = await guideBoxes(frame);
  assert.deepEqual(lay.size, [331, 359], `${where}: the app frame is the smallest screen`);
  const { mode, guide, meta } = lay;
  const overlap = !(mode.right <= guide.left || guide.right <= mode.left || mode.bottom <= guide.top || guide.bottom <= mode.top);
  assert.equal(overlap, false, `${where}: the mode label and the key guide do not overlap`);
  assert.ok(guide.left - mode.right >= 7, `${where}: a real gap (${(guide.left - mode.right).toFixed(1)}px) between the label and the help`);
  assert.ok(mode.scrollWidth <= mode.clientWidth, `${where}: the mode label is not cut (${mode.scrollWidth} <= ${mode.clientWidth})`);
  assert.ok(guide.scrollWidth <= guide.clientWidth, `${where}: the key guide is not cut (${guide.scrollWidth} <= ${guide.clientWidth})`);
  assert.ok(mode.left >= meta.left - 0.5 && guide.right <= meta.right + 0.5, `${where}: both stay inside the guide row`);
  assert.ok(mode.top >= 0 && guide.bottom <= 359, `${where}: the guide row is inside the screen`);
}

test("kana-cards: the mode label and the key guide are separate on home, in the table and in the quiz", { skip, timeout: 90000 }, async (t) => {
  for (const lang of ["en", "zh"]) {
    const { p, frame, errors } = await open(t, lang);
    assert.equal(await frame.textContent("#mode"), lang === "en" ? "Home" : "首页");
    await assertGuideRow(frame, `${lang} home`);
    await toTable(frame);
    assert.equal(await frame.textContent("#mode"), lang === "en" ? "List" : "字表");
    await assertGuideRow(frame, `${lang} list`);
    await p.locator('#pad [data-b="start"]').click();
    await frame.waitForFunction(() => document.body.classList.contains("quiz"));
    assert.equal(await frame.textContent("#mode"), lang === "en" ? "Quiz" : "小测", "the free quiz is labelled as a quiz");
    await assertGuideRow(frame, `${lang} quiz`);
    assert.deepEqual(errors, [], `${lang}: no page errors`);
  }
});

/* answer the selected choice; a miss shows the right answer and waits for A, then moves on */
async function answerOne(p, frame) {
  const before = await frame.textContent("#qnum");
  await p.locator('#pad [data-b="a"]').click();
  await frame.waitForFunction((prev) => document.querySelector("#qnum").textContent !== prev ||
    /Review|再看看/.test(document.getElementById("status").textContent), before, { timeout: 5000 });
  if ((await frame.textContent("#qnum")) === before) {
    await p.locator('#pad [data-b="a"]').click();
    await frame.waitForFunction((prev) => document.querySelector("#qnum").textContent !== prev, before, { timeout: 5000 });
  }
}

test("kana-cards: the free quiz counts this session's questions, not the kana's table position", { skip, timeout: 90000 }, async (t) => {
  for (const lang of ["en", "zh"]) {
    const { p, frame, errors } = await open(t, lang);
    const want = (n) => lang === "en" ? `Q ${n}` : `第${n}题`;
    await frame.click("#row-quiz");
    await frame.waitForFunction(() => document.body.classList.contains("quiz"));
    assert.equal(await frame.textContent("#qnum"), want(1), `${lang}: the first question is question 1`);
    for (let i = 0; i < 3; i++) await answerOne(p, frame);
    assert.equal(await frame.textContent("#qnum"), want(4), `${lang}: three answers later it is question 4`);

    const shown = await frame.evaluate(() => ({
      table: getComputedStyle(document.querySelector("#count")).display !== "none",
      header: document.querySelector("header").innerText,
      tally: document.querySelector("#qnum").innerText.trim()
    }));
    assert.equal(shown.tally, want(4), `${lang}: the header shows the session count`);
    assert.equal(shown.table, false, `${lang}: the table position is hidden during a quiz`);
    assert.ok(!shown.header.includes("/71"), `${lang}: no table position is left in the quiz header (${shown.header.replace(/\n/g, " | ")})`);

    /* the free quiz teaches but never schedules: no box moves and the streak stays where it was */
    const saved = await p.waitForFunction(() => {
      const doc = JSON.parse(localStorage.getItem("lopda-dev:kana-cards") || "{}")["kana-cards-state"];
      return doc && doc.v === 3 && Object.keys(doc.stats.hira || {}).length > 0 ? doc : null;
    }).then((handle) => handle.jsonValue());
    assert.deepEqual(saved.srs, { hira: {}, kata: {} }, `${lang}: a quiz answer moves no box`);
    assert.deepEqual(saved.days, { last: "", streak: 0 }, `${lang}: a quiz answer does not touch the streak`);
    assert.ok(Object.keys(saved.stats.hira).length > 0, `${lang}: a quiz answer still counts towards the score`);
    assert.deepEqual(errors, [], `${lang}: no page errors`);
  }
});

test("kana-cards: the list's edges say there is more above and below", { skip, timeout: 60000 }, async (t) => {
  const { frame, errors } = await open(t, "en");
  await toTable(frame);
  const cues = () => frame.evaluate(() => {
    const visible = (id) => {
      const el = document.querySelector(id), r = el.getBoundingClientRect();
      return getComputedStyle(el).display !== "none" && r.width > 0 && r.height > 0;
    };
    const ref = document.querySelector("#reference");
    return { top: visible("#cue-top"), bottom: visible("#cue-bottom"), scrollTop: ref.scrollTop, max: ref.scrollHeight - ref.clientHeight };
  });

  let cue = await cues();
  assert.equal(cue.scrollTop, 0, "the list starts at the top");
  assert.ok(cue.max > 0, "the kana grid is taller than the screen");
  assert.equal(cue.top, false, "at the top there is no cue above");
  assert.equal(cue.bottom, true, "the bottom cue says more kana are below");

  await frame.evaluate(() => {
    const ref = document.querySelector("#reference");
    ref.scrollTop = Math.round((ref.scrollHeight - ref.clientHeight) / 2);
  });
  await frame.waitForFunction(() => document.querySelector("#reference").scrollTop > 0);
  await sleep(100);
  cue = await cues();
  assert.equal(cue.top, true, "in the middle the top edge says there is more above");
  assert.equal(cue.bottom, true, "in the middle the bottom edge says there is more below");

  await frame.evaluate(() => {
    const ref = document.querySelector("#reference");
    ref.scrollTop = ref.scrollHeight;
  });
  await frame.waitForFunction(() => {
    const ref = document.querySelector("#reference");
    return ref.scrollTop >= ref.scrollHeight - ref.clientHeight - 1;
  });
  await sleep(100);
  cue = await cues();
  assert.equal(cue.top, true, "at the bottom the top cue stays");
  assert.equal(cue.bottom, false, "at the bottom there is no cue below");
  assert.deepEqual(errors, [], "no page errors");
});

/* home, the review tally and the table must all fit the smallest screen without scrolling */
async function fitCheck(frame) {
  return frame.evaluate(() => {
    const root = document.documentElement, main = document.querySelector("main");
    const shown = ["header", "main", "#meta", "#home", "#tally", "#card", "#prompt", "#options", "#refwrap", "#controls", "#status"]
      .map((s) => document.querySelector(s))
      .filter((el) => getComputedStyle(el).display !== "none");
    return {
      size: [root.clientWidth, root.clientHeight],
      page: [root.scrollHeight, document.body.scrollHeight, Math.max(root.scrollHeight, document.body.scrollHeight)],
      main: [main.scrollHeight, main.clientHeight],
      inside: shown.every((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= -0.5 && r.bottom <= root.clientHeight + 0.5 && r.left >= -0.5 && r.right <= root.clientWidth + 0.5;
      })
    };
  });
}

function assertFits(lay, where) {
  assert.deepEqual(lay.size, [331, 359], `${where}: the smallest screen`);
  assert.ok(lay.page[2] <= 359, `${where}: the page does not scroll (${lay.page.join(" / ")})`);
  assert.ok(lay.main[0] <= lay.main[1] + 1, `${where}: nothing overflows main (${lay.main.join(" / ")})`);
  assert.equal(lay.inside, true, `${where}: every visible block is inside the screen`);
}

test("kana-cards: home, a finished review's tally and the table fit the smallest screen", { skip, timeout: 90000 }, async (t) => {
  const { p, frame, errors } = await open(t, "en");
  assertFits(await fitCheck(frame), "home");
  assert.equal(await frame.textContent("#review-label"), "Review 8 today", "a fresh save offers eight new kana a day");
  assert.equal(await frame.textContent("#streak"), "0-day streak");
  assert.equal(await frame.evaluate(() => getComputedStyle(document.querySelector("#stamp")).display), "none",
    "no stamp while there is something to review");

  await toTable(frame);
  assertFits(await fitCheck(frame), "table");
  await p.locator('#pad [data-b="b"]').click();
  await frame.waitForFunction(() => document.body.classList.contains("home"));

  /* a review is eight questions today; skip the 850 ms pause between right answers */
  await frame.evaluate(() => {
    var later = window.setTimeout;
    window.setTimeout = function (fn, ms) { return later(fn, Math.min(ms, 5)); };
  });
  await frame.click("#row-review");
  await frame.waitForFunction(() => document.body.classList.contains("quiz"));
  assert.equal(await frame.textContent("#mode"), "Review", "a review is labelled as a review");
  for (let i = 0; i < 8; i++) {
    const target = Number((await frame.textContent("#count")).split("/")[0]) - 1;
    const before = await frame.textContent("#qnum");
    assert.equal(before, `Q ${i + 1}/8`, `the review shows its own progress at question ${i + 1}`);
    await frame.locator(`#options button[data-index="${target}"]`).click();
    await frame.waitForFunction((prev) => document.querySelector("#qnum").textContent !== prev ||
      document.body.classList.contains("tally"), before, { timeout: 5000 });
  }
  await frame.waitForFunction(() => document.body.classList.contains("tally"), null, { timeout: 5000 });
  assert.equal(await frame.textContent("#mode"), "Review");
  const lines = await frame.locator("#tally .tally-line").evaluateAll((els) => els.map((el) => el.textContent));
  assert.deepEqual(lines, ["Right 8 · Wrong 0", "Moved up 8", "Tomorrow 16"],
    "the tally counts the answers, the boxes moved on and tomorrow's work");
  assertFits(await fitCheck(frame), "tally");

  await p.locator('#pad [data-b="a"]').click();
  await frame.waitForFunction(() => document.body.classList.contains("home"));
  assert.equal(await frame.textContent("#review-label"), "All done today", "the day's review is finished");
  assert.notEqual(await frame.evaluate(() => getComputedStyle(document.querySelector("#stamp")).display), "none",
    "the finished day carries a stamp");
  assert.equal(await frame.textContent("#streak"), "1-day streak", "finishing today starts the streak");
  assertFits(await fitCheck(frame), "home after review");

  const saved = await p.waitForFunction(() => {
    const doc = JSON.parse(localStorage.getItem("lopda-dev:kana-cards") || "{}")["kana-cards-state"];
    return doc && doc.days && doc.days.streak === 1 ? doc : null;
  }).then((handle) => handle.jsonValue());
  assert.equal(saved.v, 3, "the save is the current format");
  assert.equal(Object.keys(saved.srs.hira).length, 8, "eight kana got a box today");
  assert.deepEqual(Object.keys(saved.srs.kata), [], "the other script is untouched");
  assert.equal(saved.newDay.hira, 8, "the eight new kana are recorded for the day");
  assert.deepEqual(errors, [], "no page errors");
});

/* the streak the home claims must be the live one: a run last kept up three days ago is over */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p2 = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

test("kana-cards: the review counter fits the header at 331 px in both languages", { skip, timeout: 90000 }, async (t) => {
  for (const lang of ["en", "zh"]) {
    const { p, errors } = await open(t, lang);
    /* every kana due today: the longest counter this screen can show is 71/71 */
    const srs = {};
    for (let i = 0; i < 71; i++) srs[String(i)] = [2, "2026-01-01"];
    const frame = await seed(p, lang, { v: 3, script: "hira", index: 0, stats: { hira: {}, kata: {} },
      srs: { hira: srs, kata: {} }, days: { last: daysAgo(3), streak: 5 },
      newDay: { day: "2026-01-01", hira: 8, kata: 0 } });
    assert.equal(await frame.textContent("#review-label"), lang === "en" ? "Review 71 today" : "今天复习 71 个");
    assert.equal(await frame.textContent("#streak"), lang === "en" ? "0-day streak" : "连续 0 天",
      "a streak that lapsed long ago is not shown as current");
    await frame.click("#row-review");
    await frame.waitForFunction(() => document.body.classList.contains("quiz"), null, { timeout: 5000 });
    assert.equal(await frame.textContent("#qnum"), lang === "en" ? "Q 1/71" : "第 1/71 题");
    const q = await frame.evaluate(() => {
      const el = document.querySelector("#qnum"), root = document.documentElement, r = el.getBoundingClientRect();
      return { scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight,
        right: r.right, width: r.width, frameW: root.clientWidth };
    });
    assert.ok(q.scrollW <= q.clientW, `${lang}: the counter is not clipped (${q.scrollW} <= ${q.clientW})`);
    assert.ok(q.scrollH <= q.clientH, `${lang}: the counter stays on one line (${q.scrollH} <= ${q.clientH})`);
    assert.ok(q.right <= q.frameW + 0.5, `${lang}: the counter's right edge is inside the frame (${q.right} <= ${q.frameW})`);
    assert.ok(q.right > q.frameW - 120, `${lang}: the counter really sits at the right (${q.right})`);
    assert.deepEqual(errors, [], `${lang}: no page errors`);
  }
});

test("kana-cards: changing script keeps the free quiz's table return and leaves a tally for home", { skip, timeout: 90000 }, async (t) => {
  /* the free quiz goes back to the table on the kana it was asking about, as it did before the home */
  const { p, frame, errors } = await open(t, "en");
  await toTable(frame);
  await p.locator('#pad [data-b="start"]').click();
  await frame.waitForFunction(() => document.body.classList.contains("quiz"));
  await frame.evaluate(() => {
    var later = window.setTimeout;
    window.setTimeout = function (fn, ms) { return later(fn, Math.min(ms, 5)); };
  });
  const first = Number((await frame.textContent("#count")).split("/")[0]) - 1;
  await frame.locator(`#options button[data-index="${first}"]`).click();
  await frame.waitForFunction((prev) => document.querySelector("#count").textContent !== prev, `${first + 1}/71`);
  const target = Number((await frame.textContent("#count")).split("/")[0]) - 1;
  await frame.click("#script");
  await frame.waitForFunction(() => document.body.classList.contains("list"), null, { timeout: 5000 });
  assert.equal(await frame.textContent("#script"), "Katakana");
  const selected = await frame.evaluate(() => [...document.querySelectorAll("#reference button")]
    .findIndex((b) => b.getAttribute("aria-selected") === "true"));
  assert.equal(selected, target, "the table opens on the kana the free quiz was asking about");
  assert.deepEqual(errors, []);

  /* a tally's numbers belong to the script it was done in, so changing script leaves for home */
  const zh = await open(t, "zh");
  const boxes = {};
  for (let i = 0; i < 71; i++) boxes[String(i)] = [2, "2999-12-31"];
  boxes[4] = [2, "2026-01-01"];
  const zhFrame = await seed(zh.p, "zh", { v: 3, script: "hira", index: 0, stats: { hira: {}, kata: {} },
    srs: { hira: boxes, kata: {} }, days: { last: "", streak: 0 }, newDay: { day: "2026-01-01", hira: 8, kata: 0 } });
  assert.equal(await zhFrame.textContent("#review-label"), "今天复习 1 个");
  await zhFrame.click("#row-review");
  await zhFrame.waitForFunction(() => document.body.classList.contains("quiz"));
  assert.equal(await zhFrame.textContent("#qnum"), "第 1/1 题");
  await zhFrame.locator("#options button[data-index='4']").click();
  await zhFrame.waitForFunction(() => document.body.classList.contains("tally"), null, { timeout: 5000 });
  await zhFrame.click("#script");
  await zhFrame.waitForFunction(() => document.body.classList.contains("home"), null, { timeout: 5000 });
  assert.equal(await zhFrame.textContent("#script"), "片假名");
  assert.equal(await zhFrame.textContent("#mode"), "首页");
  assert.deepEqual(zh.errors, []);
});

test("kana-cards: the home follows the day while the app stays open", { skip, timeout: 60000 }, async (t) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  t.after(() => p.close());
  if (!p.clock || typeof p.clock.install !== "function") { t.skip("this Playwright has no page.clock"); return; }
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  /* a minute before midnight on the 20th */
  await p.clock.install({ time: new Date(2026, 4, 20, 23, 58) });
  await p.clock.resume();
  await p.goto(`${base}/sdk/dev.html?app=${APP}`, { waitUntil: "load" });
  /* today's eight new kana are already introduced: the stamp is up until midnight */
  await p.evaluate(() => localStorage.setItem("lopda-dev:kana-cards", JSON.stringify({ "kana-cards-state": {
    v: 3, script: "hira", index: 0, stats: { hira: {}, kata: {} }, srs: { hira: {}, kata: {} },
    days: { last: "", streak: 0 }, newDay: { day: "2026-05-20", hira: 8, kata: 0 } } })));
  await p.reload({ waitUntil: "load" });
  const frame = await appFrame(p, "en");
  assert.equal(await frame.textContent("#review-label"), "All done today");
  assert.notEqual(await frame.evaluate(() => getComputedStyle(document.querySelector("#stamp")).display), "none");
  await p.clock.fastForward(5 * 60 * 1000);
  await p.waitForTimeout(300);
  assert.equal(await frame.evaluate(() => new Date().getDate()), 21, "the clock really crossed midnight");
  assert.equal(await frame.textContent("#review-label"), "Review 8 today", "the new day offers its eight kana again");
  assert.equal(await frame.evaluate(() => getComputedStyle(document.querySelector("#stamp")).display), "none",
    "the stamp comes down with the old day");
  assert.deepEqual(errors, []);
});

test("kana-cards: a review leaves the new kana it did not answer for later", { skip, timeout: 90000 }, async (t) => {
  const { p, frame, errors } = await open(t, "en");
  await frame.evaluate(() => {
    var later = window.setTimeout;
    window.setTimeout = function (fn, ms) { return later(fn, Math.min(ms, 5)); };
  });
  await frame.click("#row-review");
  await frame.waitForFunction(() => document.body.classList.contains("quiz"));
  assert.equal(await frame.textContent("#mode"), "Review", "a review is labelled as a review");
  for (let i = 0; i < 4; i++) {
    const target = Number((await frame.textContent("#count")).split("/")[0]) - 1;
    const before = await frame.textContent("#qnum");
    await frame.locator(`#options button[data-index="${target}"]`).click();
    await frame.waitForFunction((prev) => document.querySelector("#qnum").textContent !== prev, before, { timeout: 5000 });
  }
  await p.locator('#pad [data-b="b"]').click();
  await frame.waitForFunction(() => document.body.classList.contains("home"));
  assert.equal(await frame.textContent("#review-label"), "Review 4 today", "the four unanswered new kana are still today's");
  assert.equal(await frame.evaluate(() => getComputedStyle(document.querySelector("#stamp")).display), "none",
    "half a review does not stamp the day");
  const saved = await p.waitForFunction(() => {
    const doc = JSON.parse(localStorage.getItem("lopda-dev:kana-cards") || "{}")["kana-cards-state"];
    return doc && doc.newDay && doc.newDay.hira === 4 ? doc : null;
  }).then((handle) => handle.jsonValue());
  assert.equal(saved.newDay.kata, 0);
  assert.equal(Object.keys(saved.srs.hira).length, 4, "only the answered kana got a box");
  const reopened = await seed(p, "en", saved);
  assert.equal(await reopened.textContent("#review-label"), "Review 4 today", "reopening the same day keeps the remaining four");
  assert.equal(await reopened.textContent("#streak"), "0-day streak", "half a review is not a finished day");
  assert.deepEqual(errors, []);
});

/* the large screen: the art doubles and the column widens, without stretching the picture */
test("kana-cards: 386 x 738 gives the cover 2x and the table the width", { skip, timeout: 90000 }, async (t) => {
  const { p, frame, errors } = await open(t, "en");
  await setStage(p, frame, 386, 738);

  const home = await frame.evaluate(() => {
    const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { w: r.width, h: r.height }; };
    const root = getComputedStyle(document.documentElement);
    return {
      cover: box("#cover"), column: box("#home"),
      rows: [...document.querySelectorAll("#rows .row")].map((b) => b.getBoundingClientRect().height),
      content: root.getPropertyValue("--content").trim(), coverVar: root.getPropertyValue("--cover").trim(),
      picture: document.querySelector("#cover-art").width
    };
  });
  assert.equal(home.content, "362px");
  assert.equal(home.coverVar, "320px");
  assert.deepEqual([home.cover.w, home.cover.h], [320, 320], "the cover is 2 x 160, whole picture pixels");
  assert.equal(home.picture, 160, "the picture itself is still 160 pixels");
  assert.equal(home.column.w, 362);
  assert.ok(home.rows.every((height) => height >= 44), `home rows are touchable (${home.rows})`);

  const fits = await frame.evaluate(() => {
    const root = document.documentElement, main = document.querySelector("main");
    return { page: Math.max(root.scrollHeight, document.body.scrollHeight), h: root.clientHeight,
      main: [main.scrollHeight, main.clientHeight] };
  });
  assert.ok(fits.page <= 738, `the page does not scroll (${fits.page} of ${fits.h})`);
  assert.ok(fits.main[0] <= fits.main[1] + 1, `the home stays inside main (${fits.main.join(" / ")})`);

  await toTable(frame);
  const table = await frame.evaluate(() => {
    const wrap = document.querySelector("#refwrap").getBoundingClientRect();
    const cell = document.querySelector("#reference button").getBoundingClientRect();
    const ref = document.querySelector("#reference");
    return { wrap: wrap.width, cell: cell.height, cellW: cell.width, grid: [ref.scrollWidth, ref.clientWidth],
      row: getComputedStyle(document.documentElement).getPropertyValue("--row").trim() };
  });
  assert.equal(table.wrap, 362, "the table uses the wide column");
  assert.ok(table.cell >= 56 && table.cellW > 56, `the cells grew with it (${table.cellW} x ${table.cell})`);
  assert.equal(table.grid[0], table.grid[1], "no horizontal scrolling");
  assert.equal(table.row, "48px");

  await p.locator('#pad [data-b="b"]').click();
  await frame.waitForFunction(() => document.body.classList.contains("home"));
  /* at 386 px the frame runs under the harness's pad on this 390 px page: press the row itself */
  await frame.evaluate(() => document.getElementById("row-quiz").click());
  await frame.waitForFunction(() => document.body.classList.contains("quiz"));
  const quiz = await frame.evaluate(() => {
    const opts = [...document.querySelectorAll("#options button")].map((b) => b.getBoundingClientRect());
    return { width: document.querySelector("#options").getBoundingClientRect().width,
      card: document.querySelector("#card").getBoundingClientRect().height,
      heights: opts.map((r) => r.height), cols: new Set(opts.map((r) => Math.round(r.left))).size };
  });
  assert.equal(quiz.width, 362);
  assert.equal(quiz.cols, 2, "two choices a row");
  assert.ok(quiz.heights.every((height) => height >= 48), `quiz choices grew with the screen (${quiz.heights})`);
  assert.ok(quiz.card >= 100, `the quiz card has room (${quiz.card})`);

  await p.locator('#pad [data-b="b"]').click();
  await frame.waitForFunction(() => document.body.classList.contains("home"));
  await setStage(p, frame, 331, 359);
  const small = await frame.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return { content: root.getPropertyValue("--content").trim(), cover: root.getPropertyValue("--cover").trim(),
      coverW: document.querySelector("#cover").getBoundingClientRect().width };
  });
  assert.equal(small.cover, "160px", "the smallest screen keeps the picture at 1x");
  assert.equal(small.coverW, 160);
  assert.equal(small.content, "307px");
  assert.deepEqual(errors, []);
});

test("kana-cards: Left and Right cross to the other choice in a quiz row", { skip, timeout: 90000 }, async (t) => {
  const { p, frame, errors } = await open(t, "en");
  await frame.click("#row-quiz");
  await frame.waitForFunction(() => document.body.classList.contains("quiz"));
  const selected = () => frame.evaluate(() =>
    [...document.querySelectorAll("#options button")].findIndex((b) => b.classList.contains("selected")));
  const press = async (button) => {
    await p.locator(`#pad [data-b="${button}"]`).click();
    await frame.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  };

  assert.equal(await selected(), 0);
  await press("right");
  assert.equal(await selected(), 1, "Right crosses to the second choice");
  await press("right");
  assert.equal(await selected(), 0, "Right wraps inside the row");
  await press("left");
  assert.equal(await selected(), 1, "Left crosses too; the old ternary always stepped right");
  await press("left");
  assert.equal(await selected(), 0, "Left wraps inside the row");
  await press("down");
  assert.equal(await selected(), 2, "Down goes to the row below");
  await press("up");
  assert.equal(await selected(), 0, "Up comes back");
  assert.deepEqual(errors, []);
});
