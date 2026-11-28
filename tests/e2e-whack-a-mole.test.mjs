// Whack-a-mole 4.2.0 in the dev harness: bests, levels, thief runs, the dirt tell
// before a mole rises (window.__mole, tests only), and a 60 s game that still ends at 60 s.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-whack-a-mole.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const APP = "registry/apps/whack-a-mole";
/* the dev harness keeps PAD.save in localStorage, one key per manifest id */
const SAVE = "lopda-dev:whack-a-mole";
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
  browser = await pw.chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* one dev harness tab on the app in its own context, so one test's save never reaches the next */
async function tab(t, { lang, clock, viewport, dpr } = {}) {
  const context = await browser.newContext({ viewport: viewport || { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: dpr || 1 });
  t.after(() => context.close());
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  if (clock) await p.clock.install({ time: clock });
  await p.goto(`${base}/sdk/dev.html?app=${APP}${lang ? "&lang=" + lang : ""}`, { waitUntil: "load" });
  return { p, frame: await appFrame(p), errors };
}

/* the app frame inside the harness (srcdoc, sandboxed: the harness is the only parent) */
async function appFrame(p) {
  await p.waitForFunction(() => /loaded registry\/apps\/whack-a-mole|load failed/.test(document.getElementById("log").textContent), null, { timeout: 10000 });
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) {
    const f = p.frames().find((x) => x !== p.mainFrame());
    if (f) { try { await f.waitForSelector("#c", { timeout: 500 }); frame = f; } catch {} }
    if (!frame) await sleep(100);
  }
  assert.ok(frame, "the app frame loads");
  return frame;
}

const bests = (frame) => frame.evaluate(() => document.getElementById("bests").textContent.trim());
const settled = (frame) => frame.waitForFunction(() => !document.getElementById("wipe").classList.contains("go"), null, { timeout: 5000 });

test("whack-a-mole: 「还没有记录」 with no record yet, the numbers once a save has them", { skip, timeout: 60000 }, async (t) => {
  const zh = await tab(t, { lang: "zh" });
  await zh.frame.waitForFunction(() => document.getElementById("bests").textContent.trim() === "还没有记录", null, { timeout: 5000 });
  assert.equal(await bests(zh.frame), "还没有记录", "two dashes would read as a broken screen");
  assert.equal(await zh.frame.evaluate(() => document.getElementById("bests").classList.contains("hide")), false, "the line is on the menu");
  assert.deepEqual(zh.errors, []);

  const en = await tab(t, { lang: "en" });
  await en.frame.waitForFunction(() => document.getElementById("bests").textContent.trim() === "No records yet", null, { timeout: 5000 });
  assert.deepEqual(en.errors, []);

  /* a save written by the old 4.0.0 (same keys and shapes): the menu reads it back as numbers */
  const saved = await tab(t, { lang: "zh" });
  await saved.p.evaluate(([key, v]) => localStorage.setItem(key, JSON.stringify(v)), [SAVE, { best60: 42, bestEndless: 9, bestEndlessTime: 95 }]);
  await saved.p.reload({ waitUntil: "load" });
  const frame = await appFrame(saved.p);
  await frame.waitForFunction(() => /\d/.test(document.getElementById("bests").textContent), null, { timeout: 5000 });
  assert.equal(await bests(frame), "60 秒 42 · 无尽 1:35", "both records, the endless one as time");
  assert.equal(await frame.evaluate(() => window.__mole().hud.best), "42", "the painted HUD's best follows the mode");

  /* only one record: a dash for the missing one is enough */
  await saved.p.evaluate(([key, v]) => localStorage.setItem(key, JSON.stringify(v)), [SAVE, { best60: 7 }]);
  await saved.p.reload({ waitUntil: "load" });
  const one = await appFrame(saved.p);
  await one.waitForFunction(() => /\d/.test(document.getElementById("bests").textContent), null, { timeout: 5000 });
  assert.equal(await bests(one), "60 秒 7 · 无尽 --");
  assert.deepEqual(saved.errors, []);
});

test("whack-a-mole: level stars use the three score thresholds", { skip }, async (t) => {
  const { frame } = await tab(t);
  const values = await frame.evaluate(() => {
    const f = window.__mole().starsFor;
    return [f(0, 10), f(9, 10), f(10, 10), f(11, 10), f(12, 10), f(13, 10), f(14, 10)];
  });
  assert.deepEqual(values, [0, 0, 1, 1, 2, 2, 3]);
});

test("whack-a-mole: every overlay fits or scrolls safely at 331 x 359", { skip, timeout: 60000 }, async (t) => {
  const { p } = await tab(t, { lang: "zh", clock: new Date(2026, 10, 24, 12, 0), viewport: { width: 331, height: 359 } });
  const frame = await appFrame(p);
  await p.evaluate(() => {
    const app = document.getElementById("app");
    app.style.width = "331px"; app.style.height = "359px";
  });
  await frame.waitForFunction(() => innerWidth === 331 && innerHeight === 359);
  const measure = () => frame.evaluate(() => {
    const body = document.getElementById("ovbody");
    const ov = document.getElementById("ov").getBoundingClientRect();
    const st = document.getElementById("stage").getBoundingClientRect();
    return { screen: window.__mole().screen, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight,
      covers: ov.left === st.left && ov.top === st.top && ov.width === st.width && ov.height === st.height,
      hint: document.getElementById("ovhint").textContent.trim() };
  });
  const measurements = [await measure()];
  await frame.locator("#btns button").first().click();
  await frame.waitForFunction(() => window.__mole().screen === "levels");
  await settled(frame);
  measurements.push(await measure());
  await frame.locator("#btns button").first().click();
  await frame.waitForFunction(() => window.__mole().screen === "card");
  await settled(frame);
  measurements.push(await measure());
  await frame.locator("#btns button").first().click();
  await frame.waitForFunction(() => window.__mole().playing);
  await p.clock.runFor(31000);
  measurements.push(await measure());
  assert.deepEqual(measurements.map((m) => m.screen), ["title", "levels", "card", "tally"]);
  assert.ok(measurements.every((m) => m.covers), "the overlay is the whole stage on every screen: " + JSON.stringify(measurements));
  assert.ok(measurements.every((m) => m.scrollHeight <= m.clientHeight), JSON.stringify(measurements));
  assert.equal(measurements[0].hint, "↑↓←→ 选 · A 好", "the title lists only the keys that work there");
  assert.equal(measurements[1].hint, "↑↓←→ 选 · A 好 · B 返回");
  assert.equal(measurements[3].hint, "↑↓←→ 选 · A 好 · B 返回");
  console.log("overlay 331x359 scrollHeight/clientHeight:", JSON.stringify(measurements));
});

test("whack-a-mole: one star unlocks the next level, but not the one after", { skip, timeout: 30000 }, async (t) => {
  const { p } = await tab(t);
  await p.evaluate(([key, v]) => localStorage.setItem(key, JSON.stringify(v)), [SAVE, { levels: { v: 1, stars: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] } }]);
  await p.reload({ waitUntil: "load" });
  const frame = await appFrame(p);
  await frame.locator("#btns button").first().click();
  await frame.waitForFunction(() => window.__mole().screen === "levels");
  await settled(frame);
  const state = await frame.evaluate(() => ({
    secondLocked: document.querySelectorAll("#btns button")[1].classList.contains("locked"),
    thirdLocked: document.querySelectorAll("#btns button")[2].classList.contains("locked")
  }));
  assert.deepEqual(state, { secondLocked: false, thirdLocked: true });
  await frame.locator("#btns button").nth(2).click();
  assert.equal(await frame.evaluate(() => window.__mole().screen), "levels", "a locked level stays in the list");
  await frame.locator("#btns button").nth(1).click();
  await frame.waitForFunction(() => window.__mole().screen === "card");
  assert.equal(await frame.evaluate(() => window.__mole().level), 2);
});

test("whack-a-mole: legacy records survive the title and a level run", { skip, timeout: 60000 }, async (t) => {
  const { p } = await tab(t, { lang: "zh", clock: new Date(2026, 10, 24, 12, 0) });
  await p.evaluate(([key, v]) => localStorage.setItem(key, JSON.stringify(v)),
    [SAVE, { best60: 77, bestEndless: 12, bestEndlessTime: 95 }]);
  await p.reload({ waitUntil: "load" });
  const frame = await appFrame(p);
  await frame.waitForFunction(() => document.getElementById("bests").textContent.includes("77"), null, { timeout: 5000 });
  assert.equal(await bests(frame), "60 秒 77 · 无尽 1:35");
  await frame.locator("#btns button").first().click();
  await frame.waitForFunction(() => window.__mole().screen === "levels");
  await settled(frame);
  await frame.locator("#btns button").first().click();
  await frame.waitForFunction(() => window.__mole().screen === "card");
  await settled(frame);
  await frame.locator("#btns button").first().click();
  await frame.waitForFunction(() => window.__mole().playing);
  await p.clock.runFor(31000);
  assert.equal(await frame.evaluate(() => window.__mole().screen), "tally");
  const saved = await p.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE);
  assert.equal(saved.best60, 77);
  assert.equal(saved.bestEndless, 12);
  assert.equal(saved.bestEndlessTime, 95);
  assert.equal(await bests(frame), "60 秒 77 · 无尽 1:35", "the title still shows the old bests");
});

test("whack-a-mole: malformed level progress defaults safely", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await tab(t);
  await p.evaluate(([key, v]) => localStorage.setItem(key, JSON.stringify(v)), [SAVE, { levels: { v: 1, stars: [3] } }]);
  await p.reload({ waitUntil: "load" });
  const frame = await appFrame(p);
  await frame.locator("#btns button").first().click();
  await frame.waitForFunction(() => window.__mole().screen === "levels");
  const snapshot = await frame.evaluate(() => ({
    stars: window.__mole().stars,
    locked: Array.from(document.querySelectorAll("#btns button")).slice(0, 10).map((b) => b.classList.contains("locked"))
  }));
  assert.deepEqual(snapshot.stars, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(snapshot.locked, [false, true, true, true, true, true, true, true, true, true]);
  assert.deepEqual(errors, []);
});

test("whack-a-mole: an escaped thief runs to one other hole only once", { skip, timeout: 60000 }, async (t) => {
  const { p } = await tab(t, { clock: new Date(2026, 10, 24, 12, 0) });
  await p.evaluate(([key, v]) => localStorage.setItem(key, JSON.stringify(v)),
    [SAVE, { levels: { v: 1, stars: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0] } }]);
  await p.reload({ waitUntil: "load" });
  const frame = await appFrame(p);
  await frame.locator("#btns button").first().click();
  await frame.waitForFunction(() => window.__mole().screen === "levels");
  await settled(frame);
  await frame.locator("#btns button").nth(6).click();
  await frame.waitForFunction(() => window.__mole().screen === "card");
  await settled(frame);
  await frame.evaluate(() => {
    let draws = 0;
    Math.random = () => (++draws <= 4 ? 0 : 0.5);
  });
  await frame.locator("#btns button").first().click();
  await frame.waitForFunction(() => window.__mole().playing);
  let state;
  for (let i = 0; i < 70; i++) {
    await p.clock.runFor(50);
    state = await frame.evaluate(() => window.__mole());
    if (state.thiefRuns) break;
  }
  assert.equal(state.thiefRuns, 1, "the thief began one visible run");
  assert.ok(state.holes.some((h) => h.s === "run"), "the thief is visibly between holes");
  await p.clock.runFor(300);
  state = await frame.evaluate(() => window.__mole());
  assert.equal(state.thiefRuns, 1);
  assert.equal(state.holes.filter((h) => h.thief && h.escaped).length, 1, "it reached the second hole");
  await p.clock.runFor(1800);
  state = await frame.evaluate(() => window.__mole());
  assert.equal(state.thiefRuns, 1, "an escaped thief never runs again");
});

test("whack-a-mole: a hole's dirt twitches for at least 0.2 s before its mole is up", { skip, timeout: 60000 }, async (t) => {
  const { frame, errors } = await tab(t);

  /* tests only: log each hole's state changes from the read-only hook, once a frame */
  await frame.evaluate(() => {
    window.__moleLog = { log: [], until: performance.now() + 25000 };
    const seen = [];
    const tick = () => {
      const now = performance.now(), st = window.__mole();
      st.holes.forEach((h, i) => {
        if (seen[i] === h.s) return;
        if (h.s !== "down") window.__moleLog.log.push({ i, s: h.s, kind: h.kind, t: now });
        seen[i] = h.s;
      });
      if (now < window.__moleLog.until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await frame.locator("#btns button").nth(1).click();   /* 60 秒 */
  assert.equal(await frame.evaluate(() => window.__mole().playing), true, "the 60 s game started");
  /* wait for two tell -> rise -> up cycles to be complete, not just two tells */
  await frame.waitForFunction(() => {
    const l = window.__moleLog.log;
    let n = 0;
    l.forEach((e, k) => {
      if (e.s !== "tell") return;
      const after = l.slice(k + 1).filter((x) => x.i === e.i);
      if (after.some((x) => x.s === "rise") && after.some((x) => x.s === "up")) n++;
    });
    return n >= 2;
  }, null, { timeout: 25000 });

  const runs = await frame.evaluate(() => {
    const l = window.__moleLog.log, out = [];
    l.forEach((e, k) => {
      if (e.s !== "tell") return;
      const after = l.slice(k + 1).filter((x) => x.i === e.i);
      const rise = after.find((x) => x.s === "rise");
      const up = after.find((x) => x.s === "up");
      if (rise && up) out.push({ i: e.i, kind: e.kind, tell: e.t, rise: rise.t, up: up.t });
    });
    return out;
  });
  assert.ok(runs.length >= 2, "two holes were told and then rose: " + JSON.stringify(runs));
  for (const r of runs) {
    assert.ok(r.rise - r.tell >= 200, `hole ${r.i}: rose only ${Math.round(r.rise - r.tell)} ms after its tell`);
    assert.ok(r.up - r.tell >= 200, `hole ${r.i}: up only ${Math.round(r.up - r.tell)} ms after its tell`);
  }
  /* the mole's own rise is still the quick one: the tell, not a slow pop, is the warning */
  const quickest = Math.min(...runs.map((r) => r.up - r.rise));
  assert.ok(quickest < 300, "the rise stays quick: " + Math.round(quickest) + " ms");
  assert.deepEqual(errors, []);
});

test("whack-a-mole: a 60 s game still ends at 60 s", { skip, timeout: 90000 }, async (t) => {
  const { p, frame, errors } = await tab(t, { lang: "zh", clock: new Date(2026, 10, 24, 12, 0) });
  await frame.locator("#btns button").nth(1).click();
  assert.equal(await frame.evaluate(() => window.__mole().playing), true);

  /* freeze the wall clock, then move only by hand: a second of runFor is a second of play */
  await p.clock.pauseAt(new Date(await p.evaluate(() => Date.now()) + 1000));
  await p.clock.runFor(57000);
  assert.equal(await frame.evaluate(() => window.__mole().playing), true, "still playing after 57 s");
  await p.clock.runFor(4000);

  const end = await frame.evaluate(() => ({
    playing: window.__mole().playing,
    title: document.getElementById("ot").textContent.trim(),
    clock: window.__mole().hud.clock,
    result: document.getElementById("op").textContent.trim(),
    overlay: !document.getElementById("ov").classList.contains("hide")
  }));
  assert.equal(end.playing, false, "over by 61 s");
  assert.equal(end.overlay, true, "the result screen is up");
  assert.equal(end.title, "时间到");
  assert.equal(end.clock, 0);
  assert.match(end.result, /命中 \d+\/\d+/);
  assert.deepEqual(errors, []);
});

/* the sizes UI.md 13 names: the smallest, Safari-short, and the tall phones */
const STAGES = [[331, 359], [346, 518], [386, 650], [348, 323], [386, 738]];

test("whack-a-mole: the field fills the stage, edge to edge, and the overlay covers the whole stage", { skip, timeout: 90000 }, async (t) => {
  const { p, frame, errors } = await tab(t, { lang: "zh", clock: new Date(2026, 10, 24, 12, 0) });
  for (const [w, h] of STAGES) {
    await p.evaluate(([w, h]) => { const a = document.getElementById("app"); a.style.width = w + "px"; a.style.height = h + "px"; }, [w, h]);
    await frame.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h]);
    await sleep(100);
    const m = await frame.evaluate(() => {
      const st = document.getElementById("stage").getBoundingClientRect();
      const c = document.getElementById("c").getBoundingClientRect();
      const ov = document.getElementById("ov").getBoundingClientRect();
      const L = window.__moleLayout(innerWidth, innerHeight);
      return { stage: { l: st.left, t: st.top, r: st.right, b: st.bottom }, canvas: { l: c.left, t: c.top, r: c.right, b: c.bottom },
        ov: { l: ov.left, t: ov.top, w: ov.width, h: ov.height }, L: L, hud: !!document.getElementById("hud") };
    });
    const tag = `${w}x${h}`;
    assert.equal(m.hud, false, `${tag}: the HTML HUD row is gone`);
    assert.ok(m.canvas.l <= m.stage.l + 0.01 && m.canvas.t <= m.stage.t + 0.01, `${tag}: the canvas starts inside the stage corner`);
    assert.ok(m.canvas.r >= m.stage.r - 0.01 && m.canvas.b >= m.stage.b - 0.01, `${tag}: the canvas covers the stage, no paper bars`);
    assert.ok(m.canvas.r - m.stage.r < m.L.k && m.canvas.b - m.stage.b < m.L.k, `${tag}: less than one canvas pixel of overhang`);
    assert.ok(Math.abs(m.ov.l - m.stage.l) < 0.01 && Math.abs(m.ov.t - m.stage.t) < 0.01, `${tag}: the overlay starts at the stage corner`);
    assert.ok(Math.abs(m.ov.w - m.stage.r + m.stage.l) < 0.01 && Math.abs(m.ov.h - m.stage.b + m.stage.t) < 0.01, `${tag}: the overlay is the whole stage`);
  }
  /* the play screen has no HTML bars either: the canvas alone fills the stage while playing */
  await p.evaluate(() => { const a = document.getElementById("app"); a.style.width = "386px"; a.style.height = "738px"; });
  await frame.waitForFunction(() => innerWidth === 386 && innerHeight === 738);
  await frame.locator("#btns button").nth(1).click();
  await frame.waitForFunction(() => window.__mole().playing);
  const playing = await frame.evaluate(() => {
    const st = document.getElementById("stage").getBoundingClientRect();
    const c = document.getElementById("c").getBoundingClientRect();
    return { overlay: !document.getElementById("ov").classList.contains("hide"), left: c.left - st.left, top: c.top - st.top, right: st.right - c.right, bottom: st.bottom - c.bottom };
  });
  assert.equal(playing.overlay, false, "the overlay is out of the way while playing");
  assert.ok(playing.left <= 0 && playing.top <= 0 && playing.right <= 0 && playing.bottom <= 0, "the canvas is the play screen: " + JSON.stringify(playing));
  assert.deepEqual(errors, []);

  /* a dpr 3 phone lays the same box out; the canvas backing store stays the field's pixels */
  const hi = await tab(t, { clock: new Date(2026, 10, 24, 12, 0), dpr: 3 });
  await hi.p.evaluate(() => { const a = document.getElementById("app"); a.style.width = "386px"; a.style.height = "738px"; });
  await hi.frame.waitForFunction(() => innerWidth === 386 && innerHeight === 738);
  await sleep(100);
  const hidpi = await hi.frame.evaluate(() => {
    const st = document.getElementById("stage").getBoundingClientRect(), c = document.getElementById("c");
    const r = c.getBoundingClientRect();
    return { dpr: devicePixelRatio, rows: c.height, cols: c.width, covers: r.left <= st.left + 0.01 && r.top <= st.top + 0.01 && r.right >= st.right - 0.01 && r.bottom >= st.bottom - 0.01 };
  });
  assert.equal(hidpi.dpr, 3);
  assert.ok(hidpi.covers, "dpr 3 still covers the stage");
  assert.equal(hidpi.cols, 120, "the field keeps its 120 columns");
  assert.deepEqual(hi.errors, []);
});

test("whack-a-mole: a tap in the scenery never whacks, a tap on the field does", { skip, timeout: 60000 }, async (t) => {
  const { p, frame, errors } = await tab(t, { lang: "zh", clock: new Date(2026, 10, 24, 12, 0) });
  await p.evaluate(() => { const a = document.getElementById("app"); a.style.width = "331px"; a.style.height = "359px"; });
  await frame.waitForFunction(() => innerWidth === 331 && innerHeight === 359);
  await frame.locator("#btns button").nth(1).click();
  await frame.waitForFunction(() => window.__mole().playing);
  const before = await frame.evaluate(() => window.__mole().taps);
  const dispatch = (px, py) => frame.evaluate(([px, py]) => {
    const cv = document.getElementById("c"), r = cv.getBoundingClientRect();
    const L = window.__moleLayout(innerWidth, innerHeight);
    const x = r.left + (L.x0 + px) * r.width / L.W, y = r.top + (L.hud + py) * r.height / L.H;
    cv.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }));
  }, [px, py]);
  const L = await frame.evaluate(() => window.__moleLayout(innerWidth, innerHeight));
  assert.ok(L.hud > 0, "there is a sky band to tap");
  await dispatch(60, -Math.floor(L.hud / 2));           /* the scoreboard band */
  await dispatch(-Math.max(2, Math.floor(L.x0 / 2)), 60); /* the side column, when the stage is short */
  await dispatch(60, 159);                               /* the soil band, when there is one */
  assert.equal(await frame.evaluate(() => window.__mole().taps), before, "scenery taps do not count as whacks");
  await dispatch(60, 100);
  assert.equal(await frame.evaluate(() => window.__mole().taps), before + 1, "a field tap still whacks");
  assert.deepEqual(errors, []);
});

test("whack-a-mole: the pad moves an inverted cursor and A/B work the overlay", { skip, timeout: 60000 }, async (t) => {
  const { frame, errors } = await tab(t, { lang: "zh", clock: new Date(2026, 10, 24, 12, 0) });
  const key = async (k) => {
    await frame.evaluate((k) => {
      dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
      dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true }));
    }, k);
    await sleep(20);
  };
  const state = () => frame.evaluate(() => ({ screen: window.__mole().screen, sel: window.__mole().sel, playing: window.__mole().playing,
    selected: (document.querySelector("#btns button.sel") || {}).textContent || null }));

  let s = await state();
  assert.deepEqual([s.screen, s.sel, s.selected], ["title", 0, "闯关"], "one thing is selected from the start");

  await key("ArrowRight");
  assert.equal((await state()).sel, 1);
  await key("ArrowDown");
  assert.equal((await state()).sel, 2, "Down reaches the full-width row");
  await key("ArrowLeft");
  assert.equal((await state()).sel, 2, "Left stops at the wide row's only cell");
  await key("ArrowUp");
  assert.equal((await state()).sel, 0);
  s = await state();
  assert.ok(await frame.evaluate(() => document.querySelector("#btns button.sel").classList.contains("sel")), "the cursor is visibly inverted");

  await key("z");                 /* B on the title: nowhere to go */
  await sleep(350);
  assert.equal((await state()).screen, "title");
  await key("Enter");             /* START does nothing extra */
  await sleep(350);
  assert.equal((await state()).screen, "title");

  await key("x");                 /* A: 闯关 */
  await settled(frame);
  assert.equal((await state()).screen, "levels");
  await key("ArrowDown");
  assert.equal((await state()).sel, 5, "Down moves a row in the level grid, same column");
  await key("ArrowRight");
  assert.equal((await state()).sel, 6);
  await key("z");                 /* B: back to the title */
  await settled(frame);
  assert.equal((await state()).screen, "title");

  await key("ArrowRight");
  await key("x");                 /* A: 60 秒 */
  await settled(frame);
  s = await state();
  assert.equal(s.playing, true);
  assert.equal(s.screen, "play");
  await key("z");                 /* B during play is not a pause or an exit */
  assert.equal((await state()).playing, true);
  assert.deepEqual(errors, []);
});
