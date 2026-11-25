// 收音机 / Tuner (runtime/apps/tuner.js, decisions.md section 69): the dial, playing on after HOME, stepping aside for
// another program, the sleep timer, the list (edit, delete, import, export), adding a link, the directory search and a
// station that will not play. Streams and the directory are faked with page.route (a WAV, a JSON array), so the test
// never reaches the network. Needs Playwright, which the repo does not depend on, so it skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-tuner.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };
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
  browser = await pw.chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
});
after(async () => { await browser?.close(); server?.close(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* a quiet mono WAV: an endless radio stream is out of reach, a minute of tone stands in for one */
function wav(sec) {
  const sr = 8000, n = sr * sec, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 9) * 800), 44 + i * 2);
  return b;
}
const WAV = wav(60);
const DIRECTORY = [
  { stationuuid: "1111-a", name: "Test Jazz", url: "https://radio.test/jazz.mp3", countrycode: "US", codec: "MP3", bitrate: 128, hls: 0 },
  { stationuuid: "2222-b", name: "测试新闻台", url: "http://radio.test/news", url_resolved: "https://radio.test/news.aac", countrycode: "CN", codec: "AAC", bitrate: 64, hls: 0 }
];

async function open(t, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 375, height: 667 }, hasTouch: true, locale: "zh-CN", acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  t.after(() => ctx.close());
  const asked = [];
  /* every seeded station and every test station plays the WAV, except the ones a test breaks on purpose */
  await p.route(/streamtheworld|radiofrance|radioparadise|nhkworld|myalicdn|akamaized|radio\.test/, (r) => {
    const u = r.request().url();
    if (/broken/.test(u)) return r.fulfill({ status: 404, body: "" });
    if (/\.pls$/.test(u)) return r.fulfill({ status: 200, contentType: "audio/x-scpls", headers: { "access-control-allow-origin": "*" },
      body: "[playlist]\nNumberOfEntries=2\nFile1=https://radio.test/one.mp3\nTitle1=One FM\nFile2=https://radio.test/two.mp3\nTitle2=Two FM\n" });
    return r.fulfill({ status: 200, contentType: "audio/wav", body: WAV });
  });
  await p.route(/api\.radio-browser\.info/, (r) => {
    asked.push(r.request().url());
    return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(opts.directory || DIRECTORY) });
  });
  await p.goto(`${base}/runtime/?debug`);
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  /* a saved document set up before the program reads it: write it, then start the handheld again */
  if (opts.before) { await opts.before(p); await p.reload(); await p.waitForFunction(() => window.LP && window.LP.S.db); }
  await p.locator(".app", { hasText: "收音机" }).first().click();
  await p.waitForFunction(() => window.LOPDA_DEBUG.tuner.T.loaded && document.querySelectorAll("#tn-scale .tn-mark").length > 0);
  const key = async (...names) => { for (const b of names) { await p.evaluate((x) => { window.LOPDA_DEBUG.setButton(x, true); window.LOPDA_DEBUG.setButton(x, false); }, b); await sleep(60); } };
  const st = () => p.evaluate(() => { const { T, E } = window.LOPDA_DEBUG.tuner; return { state: E.state, err: E.err, st: E.st && E.st.name, preview: E.preview, page: T.page, n: T.list.length, pos: T.pos, sleep: E.sleepMin }; });
  const doc = () => p.evaluate(() => window.LP.S.db.doc("data/users/local/tuner").get().then((s) => s.exists ? s.data() : null));
  return { p, errors, key, st, doc, asked };
}
const until = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 8000 });

test("tuner: six stations on first open, A plays, the dial steps, it plays on after HOME and the tile says so", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, key, st, doc } = await open(t);
  let s = await st();
  assert.equal(s.n, 6, "six seeded stations");
  assert.equal(s.state, "off");
  const d = await doc();
  assert.equal(d.seeded, true);
  assert.equal(d.stations[0].name, "UFM 100.3");

  await key("a");
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "playing");
  assert.ok(await p.evaluate(() => document.getElementById("v-tuner").classList.contains("lamp")), "the dial lamp is lit");
  assert.equal(await p.evaluate(() => navigator.mediaSession.metadata && navigator.mediaSession.metadata.title), "UFM 100.3", "the lock screen shows the station");

  await key("right");
  await until(p, () => { const { E } = window.LOPDA_DEBUG.tuner; return E.st && E.st.name === "FIP" && E.state === "playing"; });
  s = await st();
  assert.equal(Math.round(s.pos), 1);
  await sleep(300);
  assert.equal((await doc()).last, (await p.evaluate(() => window.LOPDA_DEBUG.tuner.T.list[1].id)), "the last station is remembered");

  /* left at the first station is a wall, not a wrap */
  await key("left", "left");
  await until(p, () => window.LOPDA_DEBUG.tuner.E.st.name === "UFM 100.3" && window.LOPDA_DEBUG.tuner.E.state === "playing");

  await p.click("#home-key");
  await sleep(300);
  assert.equal((await st()).state, "playing", "leaving the program does not stop the radio");
  assert.equal(await p.evaluate(() => window.LOPDA_DEBUG.tuner.E.el.paused), false);
  const tag = await p.locator(".app", { hasText: "收音机" }).first().locator(".tag").textContent();
  assert.equal(tag, "在响");
  assert.deepEqual(errors, []);
});

test("tuner: HOME mid-glide lands and tunes, lock-screen next works away from the program, a stray waiting recovers", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, key, st } = await open(t);
  await key("a");
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "playing");
  /* HOME while the needle is still gliding: it lands on FIP and tunes it, never stays muted on the old station */
  await p.evaluate(() => window.LOPDA_DEBUG.setButton("right", true));
  await p.evaluate(() => window.LOPDA_DEBUG.setButton("right", false));
  await p.click("#home-key");
  await until(p, () => { const { E } = window.LOPDA_DEBUG.tuner; return E.st.name === "FIP" && E.state === "playing"; });
  assert.equal(await p.evaluate(() => window.LOPDA_DEBUG.tuner.E.el.muted), false, "not left muted");
  /* the lock screen's next, with no animation frames to wait for (another program has the screen) */
  await p.evaluate(() => window.LOPDA_DEBUG.tuner.step(1, true, true));
  await until(p, () => { const { E } = window.LOPDA_DEBUG.tuner; return E.st.name === "Radio Paradise" && E.state === "playing"; });
  assert.equal(await p.evaluate(() => window.LOPDA_DEBUG.tuner.E.el.muted), false);
  /* and it goes round the ends */
  const n = (await st()).n;
  for (let i = 3; i <= n; i++) await p.evaluate(() => window.LOPDA_DEBUG.tuner.step(1, true, true));
  await until(p, () => { const { E } = window.LOPDA_DEBUG.tuner; return E.st.name === "UFM 100.3" && E.state === "playing"; });
  /* "waiting" while the sound goes on: back to playing on the next progress, no reconnect */
  const gen = await p.evaluate(() => window.LOPDA_DEBUG.tuner.E.gen);
  await p.evaluate(() => window.LOPDA_DEBUG.tuner.E.el.dispatchEvent(new Event("waiting")));
  assert.equal((await st()).state, "buffering");
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "playing");
  assert.equal(await p.evaluate(() => window.LOPDA_DEBUG.tuner.E.gen), gen, "no re-dial");
  assert.deepEqual(errors, []);
});

test("tuner: UP / DOWN keep the menu's chosen row in view on the smallest screen", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, key } = await open(t, { viewport: { width: 331, height: 560 } });
  await key("start");
  const seen = () => p.evaluate(() => {
    const ul = document.getElementById("tn-menu"), li = ul.querySelector("li.on");
    let box = ul.parentElement; while (box && getComputedStyle(box).overflowY === "visible") box = box.parentElement;
    const a = li.getBoundingClientRect(), b = box.getBoundingClientRect();
    return a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
  });
  for (let i = 0; i < 7; i++) { assert.ok(await seen(), "row " + i + " in view"); await key("down"); }
  assert.ok(await seen(), "wrapped to the first row, in view");
  assert.equal(await p.evaluate(() => { let b = document.getElementById("tn-menu").parentElement; while (getComputedStyle(b).overflowY === "visible") b = b.parentElement; return b.scrollTop; }), 0, "back at the very top");
  assert.equal(await p.evaluate(() => document.getElementById("v-tuner").scrollTop), 0, "the screen itself never scrolls");
  await key("up");
  assert.ok(await seen(), "last row in view");
  assert.deepEqual(errors, []);
});

test("tuner: on Find and My stations only the rows scroll; the search box and the bar stay put", { skip, timeout: 60000 }, async (t) => {
  const directory = Array.from({ length: 30 }, (_, i) => ({ stationuuid: "u" + i, name: "Test FM " + i, url: "https://radio.test/s" + i + ".mp3", countrycode: "US", codec: "MP3", bitrate: 128, hls: 0 }));
  const { p, errors, key } = await open(t, { viewport: { width: 331, height: 560 }, directory });
  await key("start", "down", "a");
  await p.waitForFunction(() => document.querySelectorAll("#tn-results li").length > 3);
  const top = () => p.evaluate(() => document.getElementById("tn-find-q").getBoundingClientRect().top);
  const before = await top();
  for (let i = 0; i < 12; i++) await key("down");
  assert.equal(await top(), before, "the search box does not move");
  assert.ok(await p.evaluate(() => document.getElementById("tn-results").scrollTop) > 0, "the results scrolled");
  assert.equal(await p.evaluate(() => document.getElementById("tn-page-find").scrollTop), 0);
  assert.deepEqual(errors, []);
});

test("tuner: an interruption the phone does not announce shows as interrupted, and coming back dials again", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, key, st } = await open(t);
  await key("a");
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "playing");
  /* another app took the audio: no pause event, time just stops */
  await p.evaluate(() => { const { E } = window.LOPDA_DEBUG.tuner; E.stopping = true; E.el.pause(); E.stopping = false; E.movedAt = Date.now() - 10000; });
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "paused");
  assert.match(await p.locator("#tn-status").textContent(), /打断/);
  assert.equal(await p.evaluate(() => window.LP.SND.hold), false, "the playback session is let go");
  /* the user comes back to the screen: it dials the station again by itself */
  await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "playing");
  assert.equal((await st()).st, "UFM 100.3");
  /* a pause the user asked for (the lock screen) is never resumed behind their back */
  await key("a");
  assert.equal((await st()).state, "off");
  await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await sleep(500);
  assert.equal((await st()).state, "off");
  assert.deepEqual(errors, []);
});

test("tuner: another program's music stops it, and so does the sleep timer", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, key, st } = await open(t);
  await key("a");
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "playing");
  assert.equal(await p.evaluate(() => window.LP.SND.hold), true, "the playback session is held while it plays");
  await p.evaluate(() => window.LP.claimAudio("studio"));
  let s = await st();
  assert.equal(s.state, "off");
  assert.equal(await p.evaluate(() => window.LP.SND.hold), false, "and let go when it stops");
  assert.match(await p.locator("#toast").textContent(), /别的程序/);

  /* a built-in's own chip sound (the pet's rain bed, its jingle) does not: only an app's music claims (store.js) */
  await key("a");
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "playing");
  await p.evaluate(() => window.LP.chip.music({ action: "play", song: { bpm: 120, p1: "c4" }, loop: false }));
  await sleep(300);
  assert.equal((await st()).state, "playing", "LP.chip from a built-in leaves the radio on");
  await p.evaluate(() => window.LP.claimAudio("app"));
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "off");

  await key("a");
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "playing");
  await key("select");
  s = await st();
  assert.equal(s.sleep, 15);
  assert.match(await p.locator("#tn-sleep").textContent(), /睡眠 15 分/);
  await key("select", "select");
  assert.equal((await st()).sleep, 60);
  /* the timer is due: the next check turns the set off */
  await p.evaluate(() => { window.LOPDA_DEBUG.tuner.E.sleepAt = Date.now() - 1; });
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "off");
  assert.equal((await st()).sleep, 0);
  assert.deepEqual(errors, []);
});

test("tuner: edit, move and delete a station; a deleted seed stays deleted after a reload", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, key, st, doc } = await open(t);
  await key("start");
  assert.equal((await st()).page, "menu");
  await key("a");
  assert.equal((await st()).page, "list");
  await key("down", "start");
  assert.equal((await st()).page, "edit");
  assert.equal(await p.inputValue("#tn-edit-name"), "FIP");
  await p.fill("#tn-edit-name", "FIP 巴黎");
  await p.click("#tn-edit-up");
  await key("a");
  await sleep(200);
  let d = await doc();
  assert.equal(d.stations[0].name, "FIP 巴黎", "renamed and moved up");
  assert.equal(d.stations[1].name, "UFM 100.3");

  /* a bad link is refused */
  await p.locator("#tn-list .tn-row-edit").nth(0).click();
  await p.fill("#tn-edit-url", "javascript:alert(1)");
  await key("a");
  assert.match(await p.locator("#tn-edit-note").textContent(), /http/);
  assert.equal((await st()).page, "edit");

  /* delete takes two presses */
  await p.click("#tn-edit-del");
  assert.equal((await st()).n, 6);
  await p.click("#tn-edit-del");
  assert.equal((await st()).n, 5);
  await sleep(200);
  d = await doc();
  assert.ok(!d.stations.some((s) => s.name.startsWith("FIP")));

  await p.reload();
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  await p.locator(".app", { hasText: "收音机" }).first().click();
  await p.waitForFunction(() => window.LOPDA_DEBUG.tuner.T.loaded);
  assert.equal((await st()).n, 5, "the seed is not put back");
  assert.deepEqual(errors, []);
});

test("tuner: import an m3u (duplicates skipped), export it back, add a .pls link and a stream link", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, key, st } = await open(t);
  const m3u = "#EXTM3U\n#EXTINF:-1,Jazz Test\nhttps://radio.test/jazz.mp3\n#EXTINF:-1,UFM again\nhttp://playerservices.streamtheworld.com/api/livestream-redirect/UFM_1003AAC.aac\n";
  await key("start");
  await p.locator("#tn-file").setInputFiles({ name: "mine.m3u", mimeType: "audio/x-mpegurl", buffer: Buffer.from(m3u) });
  await until(p, () => window.LOPDA_DEBUG.tuner.T.list.length === 7);
  assert.match(await p.locator("#toast").textContent(), /加了 1 个台，1 个已经有了/);
  assert.equal((await st()).page, "list");

  /* export: the same list as an .m3u file */
  await key("b");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.locator("#tn-menu li").nth(4).click()]);
  assert.match(dl.suggestedFilename(), /^lopda-stations-\d{8}\.m3u$/);
  const text = await readFile(await dl.path(), "utf8");
  assert.match(text, /^#EXTM3U\n#EXTINF:-1,UFM 100\.3\n/);
  assert.equal((text.match(/#EXTINF/g) || []).length, 7);

  /* a .pls link brings both of its stations */
  await p.locator("#tn-menu li").nth(2).click();
  await p.fill("#tn-add-url", "https://radio.test/list.pls");
  await key("a");
  await until(p, () => window.LOPDA_DEBUG.tuner.T.list.length === 9);
  assert.equal(await p.evaluate(() => window.LOPDA_DEBUG.tuner.T.list[8].name), "Two FM");

  /* a plain stream link is added and tuned at once */
  await key("b");
  await p.locator("#tn-menu li").nth(2).click();
  await p.fill("#tn-add-url", "https://radio.test/mine.mp3");
  await p.fill("#tn-add-name", "我的台");
  await key("a");
  await until(p, () => { const { E, T } = window.LOPDA_DEBUG.tuner; return T.page === "dial" && E.st && E.st.name === "我的台" && E.state === "playing"; });
  assert.equal((await st()).n, 10);
  assert.deepEqual(errors, []);
});

test("tuner: the directory search, a preview, keeping it from the dial", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, key, st, asked } = await open(t);
  await key("start", "down", "a");
  assert.equal((await st()).page, "find");
  await until(p, () => document.querySelectorAll("#tn-results li").length === 2);
  assert.doesNotMatch(asked[0], /language=/, "every station: no language filter");
  assert.match(asked[0], /hidebroken=true/);
  await p.fill("#tn-find-q", "jazz");
  await p.press("#tn-find-q", "Enter");
  await sleep(300);
  assert.match(asked[asked.length - 1], /name=jazz/);

  /* A previews without saving; the dial then offers 存下 */
  await key("down", "a");
  await until(p, () => { const { E } = window.LOPDA_DEBUG.tuner; return E.preview && E.state === "playing"; });
  assert.equal(await p.evaluate(() => window.LOPDA_DEBUG.tuner.E.el.src), "https://radio.test/news.aac", "the https address is preferred");
  assert.equal((await st()).n, 6);
  await key("b", "b");
  assert.equal((await st()).page, "dial");
  assert.equal(await p.locator("#tn-keep").isVisible(), true);
  assert.match(await p.locator("#tn-meta").textContent(), /试听/);
  await p.click("#tn-keep");
  const s = await st();
  assert.equal(s.n, 7);
  assert.equal(s.preview, false);
  assert.equal(s.state, "playing", "keeping it does not interrupt it");
  assert.equal(await p.locator("#tn-keep").isVisible(), false);

  /* START keeps the selected result from the list; a kept one shows a tick and cannot be kept twice */
  await key("start", "down", "a");
  await until(p, () => document.querySelectorAll("#tn-results li").length === 2);
  assert.equal(await p.locator("#tn-results .tn-row-edit").nth(1).textContent(), "✓");
  await key("start");
  assert.equal((await st()).n, 7, "the kept one is not kept again");
  await key("up", "start");
  assert.equal((await st()).n, 8);
  assert.equal(await p.locator("#tn-results .tn-row-edit").nth(0).textContent(), "✓");
  assert.deepEqual(errors, []);
});

test("tuner: a station that will not play says so after its retry; the needle moving clears it", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, key, st } = await open(t, {
    before: (p) => p.evaluate(() => window.LP.S.db.doc("data/users/local/tuner").set({ v: 1, seeded: true,
      stations: [{ id: "a", name: "Broken", url: "https://radio.test/broken.mp3" }, { id: "b", name: "Fine", url: "https://radio.test/fine.mp3" }] }))
  });
  assert.equal((await st()).n, 2, "a saved list is used, the seed is not added");
  await key("a");
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "nosignal");
  assert.equal((await st()).err, "format");
  assert.match(await p.locator("#tn-status").textContent(), /没信号/);
  assert.equal(await p.evaluate(() => window.LP.SND.hold), false);
  await key("right");
  await sleep(800);
  let s = await st();
  assert.equal(s.state, "off", "turning the dial while it is off only moves the needle");
  assert.equal(Math.round(s.pos), 1);
  assert.match(await p.locator("#tn-name").textContent(), /Fine/);
  await key("a");
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "playing" && window.LOPDA_DEBUG.tuner.E.st.name === "Fine");
  assert.deepEqual(errors, []);
});

test("tuner: every page fits 331 px without sideways scroll, and dragging the dial tunes the nearest station", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, key, st } = await open(t);
  await p.evaluate(() => { const v = document.getElementById("v-tuner"); v.style.width = "331px"; v.style.height = "359px"; v.style.flex = "none"; });
  const pages = ["dial", "menu", "list", "edit", "add", "find", "help"];
  for (const name of pages) {
    await p.evaluate((n) => {
      const { T } = window.LOPDA_DEBUG.tuner;
      if (n === "edit") T.editId = T.list[0].id;
      ["dial", "menu", "list", "edit", "add", "find", "help"].forEach((x) => { document.getElementById("tn-page-" + x).hidden = x !== n; });
    }, name);
    const over = await p.evaluate((n) => {
      const pg = document.getElementById("tn-page-" + n);
      return { sw: pg.scrollWidth, cw: pg.clientWidth };
    }, name);
    assert.ok(over.sw <= over.cw + 1, `${name}: ${over.sw} > ${over.cw}`);
  }
  await p.evaluate(() => { ["menu", "list", "edit", "add", "find", "help"].forEach((x) => { document.getElementById("tn-page-" + x).hidden = true; }); document.getElementById("tn-page-dial").hidden = false; });
  await key("a");
  await until(p, () => window.LOPDA_DEBUG.tuner.E.state === "playing");
  const box = await p.locator("#tn-dial").boundingBox();
  const y = box.y + box.height / 2, x = box.x + box.width / 2;
  await p.mouse.move(x, y);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(x - i * 17, y);
  await p.mouse.up();
  await until(p, () => { const { E, T } = window.LOPDA_DEBUG.tuner; return T.target == null && Math.abs(T.pos - 2) < 0.01 && E.st.name === "Radio Paradise"; });
  assert.equal((await st()).state === "tuning" || (await st()).state === "playing", true);
  assert.deepEqual(errors, []);
});
