// End-to-end: the real runtime and every registry app in headless Chromium.
// Needs Playwright, which the repo does not depend on, so these tests skip without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e.test.mjs
// Serves the repo root on a random port, as `python3 -m http.server` would.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

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

async function page(t, opts = {}) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, ...opts });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  t.after(() => p.close());
  return { p, errors };
}

test("the runtime boots without errors and shows the home screen", { skip }, async (t) => {
  const { p, errors } = await page(t);
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LopdaPlatform && window.LopdaStrings);
  await p.waitForTimeout(500);
  assert.ok(await p.evaluate(() => document.body.innerText.length > 0));
  assert.deepEqual(errors, []);
});

test("the runtime asks nothing of other sites: fonts and everything else come from its own origin", { skip }, async (t) => {
  const { p, errors } = await page(t);
  const away = [];
  p.on("request", (r) => { if (!r.url().startsWith(base) && !/^(data|blob):/.test(r.url())) away.push(r.url()); });
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  /* fonts.css splits the fonts by unicode-range: load the slices some screen text needs */
  const faces = await p.evaluate(async () => [(await document.fonts.load('16px "DotGothic16"', "本机存档「存档」。")).length, (await document.fonts.load('16px "VT323"', "09:41 LP-86")).length]);
  assert.ok(faces[0] >= 2 && faces[1] >= 1, "both LCD fonts load: " + faces);
  assert.deepEqual(away, []);
  assert.deepEqual(errors, []);
});

/* the sandboxed app frame cannot reach a service worker; Chromium logs that once per app start */
const SW_NOISE = /Service worker is disabled because the context is sandboxed/;
const tiles = (p) => p.$$eval("#home .app .label", (l) => l.map((x) => x.textContent));

test("preinstalled apps: installed on first start after the built-ins, and a removed one stays removed", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.waitForFunction(() => document.querySelectorAll("#home .app:not(.builtin)").length === 2, null, { timeout: 10000 });
  const home = await tiles(p);
  assert.deepEqual(home.slice(-2), ["计算器", "点阵画板"]);
  assert.ok(!home.slice(0, -2).includes("点阵画板"), "paint is no longer a built-in");
  /* remove paint, start again: it does not come back */
  /* the tiles show before the store records which ids it handled, and removal deletes without waiting:
     reloading before those writes land would install paint again, so wait for IndexedDB itself */
  const doc = (path) => p.evaluate((path) => new Promise((resolve, reject) => {
    const req = indexedDB.open("lopda");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const get = req.result.transaction("docs").objectStore("docs").get(path);
      get.onsuccess = () => { req.result.close(); resolve(get.result ? get.result.data : null); }; get.onerror = () => reject(get.error); };
  }), path);
  const until = async (fn, what) => { for (let i = 0; i < 100; i++) { if (await fn()) return; await p.waitForTimeout(100); } assert.fail("timed out waiting for " + what); };
  await until(async () => ((await doc("data/users/local/preinstall"))?.ids || []).length === 2, "the preinstall record");
  await p.locator("#home .app", { hasText: "点阵画板" }).click();
  await p.click("#run-del"); await p.click("#run-del-wrap .btn:not(.ghost)");
  await until(async () => !(await doc("data/users/local/apps/items/paint")), "paint's removal");
  await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(500);
  assert.deepEqual((await tiles(p)).slice(-1), ["计算器"]);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("files: the runtime's dialog guards PAD.exportFile and PAD.importFile (paint)", { skip, timeout: 30000 }, async (t) => {
  /* a mouse, not touch: on a coarse pointer the runtime saves through the share sheet, which headless Chromium lacks */
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: "zh-CN" });
  t.after(() => p.close());
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: "点阵画板" }).click();
  const app = p.frameLocator("#run-frame");
  await app.locator("#cv").waitFor();
  /* cancel: nothing leaves, the app hears "cancelled" and stays quiet */
  await app.locator("#exp").click();
  assert.match(await p.textContent("#file-ask p"), /^导出「lopda-\d{8}-\d{4}\.png」？$/);
  await p.click("#file-no");
  await p.waitForSelector("#file-ask .box", { state: "detached" });
  /* OK: on a desktop the file downloads */
  await app.locator("#exp").click();
  const [d] = await Promise.all([p.waitForEvent("download"), p.click("#file-ok")]);
  assert.match(d.suggestedFilename(), /^lopda-\d{8}-\d{4}\.png$/);
  const png = await (await import("node:fs/promises")).readFile(await d.path());
  assert.equal(png.readUInt32BE(16), 768, "8x upscale");
  /* import: OK opens the system file picker; the picture comes back as four tones */
  await app.locator("#imp").click();
  assert.equal(await p.textContent("#file-ok"), "选文件");
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), p.click("#file-ok")]);
  await chooser.setFiles({ name: "x.png", mimeType: "image/png", buffer: png });
  await app.locator("#msg", { hasText: "已转成" }).waitFor();
  /* an app without the permission is refused before any dialog */
  await p.evaluate(() => { window.LP.S.running.permissions = []; });
  const frame = p.frames().find((f) => f !== p.mainFrame());
  const refused = await frame.evaluate(() => PAD.importFile({ accept: [] }).then(() => "resolved", (e) => e.message));
  assert.match(refused, /permission/);
  assert.equal(await p.locator("#file-ask .box").count(), 0);
  assert.deepEqual(errors, []);
});

for (const id of readdirSync(join(ROOT, "registry", "apps"))) {
  test(`app ${id} loads in the dev harness and reports no errors`, { skip }, async (t) => {
    const { p, errors } = await page(t);
    await p.goto(`${base}/sdk/dev.html?app=registry/apps/${id}`, { waitUntil: "load" });
    await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
    /* press a few buttons, as a player would */
    for (const key of ["x", "ArrowDown", "x", "Enter", "z"]) { await p.keyboard.press(key); await p.waitForTimeout(120); }
    await p.waitForTimeout(500);
    const log = await p.textContent("#log");
    assert.doesNotMatch(log, /ERROR|load failed/, log);
    assert.deepEqual(errors, []);
  });
}

/* zhenyao-tower: helpers to drive the battle in the app frame */
async function zhenyao(t) {
  const { p, errors } = await page(t);
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/zhenyao-tower`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  const app = p.frames().find((f) => f !== p.mainFrame());
  /* the harness logs "loaded" as it sets the frame's srcdoc; wait for the game itself, or the first
     evaluate can run in the document being replaced */
  await app.waitForFunction(() => typeof game !== "undefined" && typeof Battle !== "undefined", null, { timeout: 5000 });
  const press = async (...keys) => { for (const k of keys) { await p.keyboard.press(k); await p.waitForTimeout(150); } };
  const menu = () => app.evaluate(() => { const S = typeof Battle !== "undefined" && Battle.S(); return S && S.menu ? S.menu.kind : null; });
  const until = async (kind, ms = 15000) => { const t0 = Date.now(); while ((await menu()) !== kind) { assert.ok(Date.now() - t0 < ms, "waiting for the " + kind + " menu"); await p.waitForTimeout(50); } };
  const dealt = () => app.evaluate(() => Battle.S().b.foes.reduce((s, f) => s + f.maxHp - f.hp, 0));
  /* title -> 演武, the only battle on the menu */
  const gallery = async () => { await press("x", "ArrowDown", "x"); await until("cmd"); };
  /* from the command menu: cast spell k at the first target */
  const cast = async (k) => {
    await app.evaluate(() => { Battle.S().menu.i = 1; });
    await press("x"); await until("list");
    await app.evaluate((k) => { const m = Battle.S().menu; m.i = k; m.top = Math.max(0, k - 2); }, k);
    await press("x", "x");
  };
  return { p, errors, app, press, until, dealt, gallery, cast };
}

test("zhenyao-tower: all six spells play in 演武, the battle on the title menu", { skip, timeout: 90000 }, async (t) => {
  const z = await zhenyao(t);
  await z.gallery();
  for (let k = 0; k < 6; k++) {
    const before = await z.dealt();
    await z.cast(k);
    await z.until("cmd");
    assert.ok((await z.dealt()) > before, `spell ${k} did damage`);
  }
  assert.deepEqual(z.errors, []);
  assert.doesNotMatch(await z.p.textContent("#log"), /ERROR/);
});

test("zhenyao-tower: a spell seen before skips with A, with the same damage", { skip, timeout: 60000 }, async (t) => {
  const z = await zhenyao(t);
  /* a fixed random number: every cast of a spell does the same damage */
  await z.app.evaluate(() => { Math.random = () => 0.5; });
  await z.gallery();
  const timed = async (skip) => {
    const before = await z.dealt(), t0 = Date.now();
    await z.cast(3);   /* 离火符: about 3 s in full */
    if (skip) { await z.p.waitForTimeout(400); await z.press("x"); }
    await z.until("cmd");
    return { dmg: (await z.dealt()) - before, ms: Date.now() - t0 };
  };
  const full = await timed(false);
  /* a second showing without A plays in full, with the same damage */
  const again = await timed(false);
  const cut = await timed(true);
  assert.equal(cut.dmg, full.dmg, "same damage when skipped");
  assert.equal(again.dmg, full.dmg);
  assert.ok(cut.ms < full.ms - 1200, `skipped ${cut.ms} ms vs full ${full.ms} ms`);
  /* the cut leaves the scene at rest */
  const rest = await z.app.evaluate(() => { const S = Battle.S(); return [S.cam.yaw === Battle.HOME.yaw, S.light, S.sky, S.bars, S.hud]; });
  assert.deepEqual(rest, [true, 1, 1, 0, true]);
  assert.deepEqual(z.errors, []);
});

test("zhenyao-tower: ZT.fight (tests only, not on any menu) starts a route fight", { skip, timeout: 30000 }, async (t) => {
  const z = await zhenyao(t);
  await z.app.evaluate(() => ZT.fight(3, 0));
  await z.until("cmd");
  assert.equal(await z.app.evaluate(() => Battle.S().b.foes[0].id), "mirage");
  assert.deepEqual(z.errors, []);
});

/* The whole game, played by tests/zhenyao-play.js ("full": breadth-first walking, A through every dialogue, the smart
   battle player) from 进入小镇 on the title to 序章 完. Real time would be more than 20 minutes, so the app frame's clock is
   ours: requestAnimationFrame is replaced (after the game has started; lo-game asks for the next frame every tick) by a queue
   that the script's own loop pumps, one 1/60 s step per call and a yield through a MessageChannel in between, which has none of
   setTimeout's 4 ms floor. Math.random is seeded, so the run is the same every time. */
test("zhenyao-tower: a scripted player goes from a new game to 序章 完", { skip, timeout: 1500000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/zhenyao-tower`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  const app = p.frames().find((f) => f !== p.mainFrame());
  await app.waitForFunction(() => typeof game !== "undefined" && typeof ZT !== "undefined", null, { timeout: 5000 });
  await app.evaluate(async () => {
    const queue = [];
    let ts = performance.now(), a = 1;
    window.requestAnimationFrame = (f) => { queue.push(f); return queue.length; };
    window.__frame = () => { const q = queue.splice(0); ts += 1000 / 60 + 1e-4; q.forEach((f) => f(ts)); };
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const ch = new MessageChannel(), waiting = [];
    ch.port1.onmessage = () => waiting.shift()();
    window.__yield = () => new Promise((r) => { waiting.push(r); ch.port2.postMessage(0); });
    /* the frame that was already asked for from the real clock runs once more and asks again, into the queue */
    while (!queue.length) await new Promise((r) => setTimeout(r, 5));
  });
  await app.addScriptTag({ path: join(ROOT, "tests", "zhenyao-play.js") });
  const t0 = Date.now();
  const frames = await app.evaluate(() => PLAY.run("full"));
  const secs = (Date.now() - t0) / 1000;
  console.log(`  zhenyao-tower full playthrough: ${frames} frames (${(frames / 60 / 60).toFixed(1)} game minutes) in ${secs.toFixed(0)} s`);
  const st = await app.evaluate(() => { const s = ZT.state(); return { scene: s.scene, ended: s.ended, cleared: s.cleared, level: s.hero.level, boss: !!s.flags.beat["top:B"] }; });
  assert.ok(st.ended, "reached 序章 完: " + JSON.stringify(st));
  assert.ok(st.cleared && st.boss && st.level >= 7, JSON.stringify(st));
  assert.deepEqual(errors, []);
  assert.doesNotMatch(await p.textContent("#log"), /ERROR/);
});

/* ---------- the calendar (万年历) ---------- */
import vm from "node:vm";
import { readFileSync } from "node:fs";
const LUNAR = (() => {
  const ctx = vm.createContext({ console }); ctx.window = ctx;
  vm.runInContext(readFileSync(join(ROOT, "runtime", "lunar.js"), "utf8"), ctx);
  return ctx.LopdaLunar;
})();
const JSD = "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/";
const FIXED = new Date(2026, 9, 11, 10, 0, 0);   /* 2026-10-11, lunar 九月初二 */

/* a page with a fixed clock; service workers blocked so page.route sees every request */
async function calPage(t, { locale = "zh-CN", time = FIXED, route } = {}) {
  const { p, errors } = await page(t, { locale, serviceWorkers: "block" });
  const seen = [];
  await p.route("https://cdn.jsdelivr.net/**", async (r) => {
    seen.push({ url: r.request().url(), headers: await r.request().allHeaders() });
    if (route) return route(r);
    return r.fulfill({ status: 404, body: "not found" });
  });
  await p.clock.install({ time });
  const away = [];
  p.on("request", (r) => { if (!r.url().startsWith(base) && !/^(data|blob):/.test(r.url())) away.push(r.url()); });
  const open = async () => {
    await p.locator("#home .app", { hasText: locale === "en-US" ? "Calendar" : "万年历" }).click();
    await p.locator("#v-cal:not([hidden])").waitFor();
    await p.waitForTimeout(400);
  };
  const boot = async (reload) => {
    if (reload) await p.reload({ waitUntil: "networkidle" }); else await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
    await p.waitForTimeout(400);
  };
  return { p, errors, seen, away, open, boot };
}
const notBlocked = (errors) => errors.filter((e) => !/Failed to load resource/.test(e) && !SW_NOISE.test(e));

test("the runtime asks nothing of other sites, except the calendar's holiday file on jsDelivr", { skip, timeout: 30000 }, async (t) => {
  const c = await calPage(t);
  await c.boot();
  assert.deepEqual(c.away, [], "the home screen asks nobody");
  await c.open();
  /* 2026 is bundled, so only next year's file is missing */
  assert.deepEqual(c.away, [JSD + "2027.json"]);
  assert.equal(c.seen.length, 1);
  const h = c.seen[0].headers;
  assert.ok(!("cookie" in h), "no cookies");
  assert.ok(!("referer" in h), "no referrer: " + h.referer);
  assert.deepEqual(notBlocked(c.errors), []);
  /* the 7-day rule: not again from home, not after a reload */
  await p_home(c.p); await c.open();
  await c.boot(true); await c.open();
  assert.equal(c.seen.length, 1, "no second request");
  assert.deepEqual(notBlocked(c.errors), []);
});
const p_home = (p) => p.click("#home-key");

test("calendar: a downloaded year is kept, shown with the 休 badge, and survives offline", { skip, timeout: 30000 }, async (t) => {
  const file = { year: 2027, papers: [], days: [{ name: "元旦", date: "2027-01-01", isOffDay: true }] };
  const c = await calPage(t, { route: (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(file) }) });
  await c.boot();
  await c.open();
  assert.equal(c.seen.length, 1);
  /* October 2026 -> January 2027: three pages */
  for (let i = 0; i < 3; i++) await c.p.click("#cal-next");
  assert.equal(await c.p.textContent("#cal-ym"), "2027年1月");
  const jan1 = c.p.locator("#cal-grid .cal-cell:not(.out)").first();
  assert.equal(await jan1.locator("i.off").textContent(), "休");
  /* offline: the route now fails; the file comes from IndexedDB and nothing is asked */
  await c.p.unroute("https://cdn.jsdelivr.net/**");
  const again = [];
  await c.p.route("https://cdn.jsdelivr.net/**", (r) => { again.push(r.request().url()); return r.abort(); });
  await c.boot(true); await c.open();
  for (let i = 0; i < 3; i++) await c.p.click("#cal-next");
  assert.equal(await c.p.locator("#cal-grid .cal-cell:not(.out)").first().locator("i.off").count(), 1);
  assert.deepEqual(again, []);
  assert.deepEqual(notBlocked(c.errors), []);
});

test("calendar: month view, today, a day off, the day sheet, and a lunar yearly date on the home tile", { skip, timeout: 60000 }, async (t) => {
  assert.equal(LUNAR.fromSolar(2026, 10, 11).month, 9);
  assert.equal(LUNAR.fromSolar(2026, 10, 11).day, 2, "2026-10-11 is lunar 九月初二");
  assert.equal(LUNAR.fromSolar(2026, 10, 14).day, 5);
  const c = await calPage(t);
  const { p } = c;
  await c.boot(); await c.open();
  assert.equal(await p.textContent("#cal-ym"), "2026年10月");
  const today = p.locator("#cal-grid .cal-cell.today");
  assert.equal(await today.count(), 1);
  assert.equal(await today.locator("span").textContent(), "初二");
  const oct1 = p.locator("#cal-grid .cal-cell:not(.out)").first();
  assert.equal(await oct1.locator("i.off").textContent(), "休");
  assert.equal(await oct1.locator("span").textContent(), "国庆节");
  /* arrows move the day */
  await p.keyboard.press("ArrowRight");
  assert.ok(!(await today.getAttribute("class")).includes("sel"));
  await p.keyboard.press("ArrowLeft");
  assert.ok((await today.getAttribute("class")).includes("sel"));
  /* B, the month view's "back", also comes back to today, across a month; on today it changes nothing */
  for (let i = 0; i < 4; i++) await p.keyboard.press("ArrowDown");
  assert.equal(await p.textContent("#cal-ym"), "2026年11月");
  await p.keyboard.press("z");
  assert.equal(await p.textContent("#cal-ym"), "2026年10月");
  assert.ok((await today.getAttribute("class")).includes("sel"));
  await p.keyboard.press("z");
  assert.ok((await today.getAttribute("class")).includes("sel"));
  assert.ok(await p.isHidden("#cal-sheet"), "B on today opens nothing");
  assert.ok(await p.isVisible("#v-cal"), "and does not leave the calendar");
  /* A opens the day */
  await p.keyboard.press("x");
  assert.match(await p.textContent("#cal-sheet"), /农历九月初二/);
  /* A again: the add form. A lunar date three days from today (九月初五) */
  await p.keyboard.press("x");
  await p.fill("#cal-name", "妈妈生日");
  await p.click(".cal-kind button:has-text('按农历')");
  const plus = p.locator(".cal-step").nth(1).locator("button", { hasText: "+" });
  for (let i = 0; i < 3; i++) await plus.click();
  assert.equal(await p.locator(".cal-step").nth(1).locator("b").textContent(), "初五");
  await p.click(".cal-keys .ck-a");
  await p.waitForFunction(() => /妈妈生日/.test(document.getElementById("cal-sheet").textContent));
  await p.click("#home-key");
  assert.equal(await p.locator("#home .app", { hasText: "万年历" }).locator(".tag").textContent(), "3天后 妈妈生日");
  /* a reload: the date is stored; the boot hint shows once per day */
  await c.boot(true);
  assert.equal(await p.locator("#home .app", { hasText: "万年历" }).locator(".tag").textContent(), "3天后 妈妈生日");
  await p.waitForFunction(() => /3天后：妈妈生日/.test(document.getElementById("toast").textContent) && !document.getElementById("toast").hidden, null, { timeout: 5000 });
  await c.boot(true);
  await p.waitForTimeout(800);
  assert.ok(!/妈妈生日/.test(await p.evaluate(() => document.getElementById("toast").hidden ? "" : document.getElementById("toast").textContent)), "no second hint today");
  assert.deepEqual(notBlocked(c.errors), []);
});

test("calendar: a leap-month birthday falls in the regular month in a year without that leap month", { skip, timeout: 60000 }, async (t) => {
  assert.equal(LUNAR.leapMonth(2026), 0);
  const on = LUNAR.toSolar(2026, 6, 15, false);
  const days = Math.round((Date.UTC(on.y, on.m - 1, on.d) - Date.UTC(2026, 0, 10)) / 86400000);
  const c = await calPage(t, { time: new Date(2026, 0, 10, 10, 0, 0) });
  const { p } = c;
  await c.boot(); await c.open();
  await p.keyboard.press("x"); await p.keyboard.press("x");
  await p.fill("#cal-name", "闰月生日");
  await p.click(".cal-kind button:has-text('按农历')");
  await p.click(".cal-step button:has-text('闰月')");
  /* from the lunar date of the selected day (十一月廿二) back to month 6, day 15 */
  const minus = (n) => p.locator(".cal-step").nth(n).locator("button", { hasText: "−" });
  const cur = LUNAR.fromSolar(2026, 1, 10);
  for (let i = 0; i < cur.month - 6; i++) await minus(0).click();
  for (let i = 0; i < cur.day - 15; i++) await minus(1).click();
  await p.click(".cal-keys .ck-a");
  await p.keyboard.press("z");   /* B closes the day sheet */
  await p.click("#cal-list-btn");
  const row = await p.textContent("#cal-sheet .cal-list li");
  assert.ok(row.includes("闰月生日"), row);
  assert.ok(row.includes(`${days}天后 · ${on.m}/${on.d}`), `${row} (expected ${days}天后 · ${on.m}/${on.d})`);
  assert.deepEqual(notBlocked(c.errors), []);
});

test("calendar: English names", { skip, timeout: 30000 }, async (t) => {
  const c = await calPage(t, { locale: "en-US" });
  await c.boot(); await c.open();
  assert.equal(await c.p.textContent("#cal-ym"), "Oct 2026");
  assert.deepEqual(notBlocked(c.errors), []);
});

test("calendar: START goes to a date, Gregorian or lunar, by keys, keyboard digits or the on-screen pad", { skip, timeout: 60000 }, async (t) => {
  const c = await calPage(t);
  await c.boot(); await c.open();
  const { p } = c;
  const sel = async () => [await p.textContent("#cal-ym"), await p.textContent("#cal-grid .cal-cell.sel b")];
  const digits = () => p.$$eval("#cal-sheet .cal-digits button", (b) => b.map((x) => x.textContent).join(""));
  /* START opens the panel on the selected day; keyboard digits type from the first and the preview follows */
  await p.keyboard.press("Enter");
  assert.equal(await digits(), "20261011");
  for (const k of "19491001") await p.keyboard.press(k);
  assert.match(await p.textContent("#cal-sheet .cal-preview"), /1949年10月1日 星期六/);
  await p.keyboard.press("x");
  assert.ok(await p.isHidden("#cal-sheet"));
  assert.deepEqual(await sel(), ["1949年10月", "1"]);
  /* lunar: SELECT turns the same day into lunar digits (1949-10-01 is 八月初十); the chin pad edits the year and day */
  await p.keyboard.press("Enter");
  await p.keyboard.press("Shift");
  assert.equal(await digits(), "19490810");
  await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight");   /* the tens of the year */
  for (let i = 0; i < 5; i++) await p.keyboard.press("ArrowUp");               /* 1949 -> 1999 */
  for (let i = 0; i < 5; i++) await p.keyboard.press("ArrowRight");
  for (let i = 0; i < 5; i++) await p.keyboard.press("ArrowUp");               /* day 10 -> 15 */
  assert.equal(await digits(), "19990815");
  await p.keyboard.press("Enter");                                              /* START also jumps */
  const mid = LUNAR.toSolar(1999, 8, 15, false);
  assert.deepEqual(await sel(), [`${mid.y}年${mid.m}月`, String(mid.d)]);
  assert.match(await p.textContent("#cal-grid .cal-cell.sel span"), /中秋/);
  /* a leap month, on the on-screen pad: 2020 闰四月十五 */
  await p.click("#cal-ym");
  await p.locator("#cal-sheet .cal-kind .btn", { hasText: "按农历" }).click();
  for (const k of "20200415") await p.locator("#cal-sheet .cal-numpad .btn", { hasText: new RegExp("^" + k + "$") }).click();
  await p.locator("#cal-sheet .cal-kind .cal-leap").click();
  await p.locator("#cal-sheet .cal-keys .ck-a").click();
  const lp = LUNAR.toSolar(2020, 4, 15, true);
  assert.deepEqual(await sel(), [`${lp.y}年${lp.m}月`, String(lp.d)]);
  /* a day past the month's end falls on its last day; a year out of range stays put with a message; B cancels */
  await p.keyboard.press("Enter");                                              /* the panel always opens in Gregorian */
  for (const k of "20230231") await p.keyboard.press(k);
  assert.match(await p.textContent("#cal-sheet .cal-preview"), /2023年2月28日/);
  await p.keyboard.press("Backspace"); await p.keyboard.press("Backspace"); await p.keyboard.press("Backspace"); await p.keyboard.press("Backspace");
  await p.keyboard.press("Backspace"); await p.keyboard.press("Backspace"); await p.keyboard.press("Backspace"); await p.keyboard.press("Backspace");
  for (const k of "18991231") await p.keyboard.press(k);
  assert.match(await p.textContent("#cal-sheet .cal-preview"), /1900 到 2100/);
  await p.keyboard.press("x");
  assert.ok(await p.isVisible("#cal-sheet"), "an out-of-range year does not jump");
  await p.keyboard.press("z");
  assert.ok(await p.isHidden("#cal-sheet"));
  assert.deepEqual(await sel(), [`${lp.y}年${lp.m}月`, String(lp.d)]);
  /* B in the month view still comes home to today */
  await p.keyboard.press("z");
  assert.deepEqual(await sel(), ["2026年10月", "11"]);
  assert.deepEqual(notBlocked(c.errors), []);
});

/* ---------------- dictionary ---------------- */
const dictPage = async (t, opts = {}) => {
  const { p, errors } = await page(t, { locale: "zh-CN", ...opts });
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: opts.locale === "en-US" ? "Dict" : "词典" }).click();
  await p.waitForSelector("#v-dict:not([hidden])");
  return { p, errors };
};
const typeWord = async (p, w, want = w) => { await p.fill("#dict-q", w); await p.waitForFunction((want) => {
  const li = document.querySelector("#dict-list li.on"); return li && li.textContent.indexOf(want) >= 0; }, want, { timeout: 10000 }); };
const entryText = (p) => p.textContent("#dict-sheet .dict-page");

test("dictionary: the built-in ECDICT, a word form, history and the word book", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await dictPage(t);
  await typeWord(p, "appl");
  assert.ok((await p.textContent("#dict-list")).includes("apple"));
  await typeWord(p, "apple");
  await p.press("#dict-q", "Enter");
  await p.waitForFunction(() => /苹果/.test(document.querySelector("#dict-sheet .dict-page")?.textContent || ""));
  assert.match(await entryText(p), /ECDICT/);
  /* START adds to the word book (the chin pad), B goes back, as everywhere on the handheld */
  await p.click('.gamepad [data-b="start"]');
  await p.waitForFunction(() => /已加入生词本/.test(document.getElementById("toast").textContent));
  await p.click('.gamepad [data-b="b"]');
  /* ran is a form of run (and not a headword of the abridged ECDICT): the box offers run first, Enter opens it */
  await typeWord(p, "ran", "ran → run");
  await p.press("#dict-q", "Enter");
  await p.waitForFunction(() => /跑/.test(document.querySelector("#dict-sheet .dict-page")?.textContent || ""));
  assert.equal(await p.textContent("#dict-sheet .sheet-title span"), "run");
  const lemma = await p.evaluate(() => LP.dict.lookup("ran").then((r) => r.map((x) => [x.word, x.how])));
  assert.deepEqual(lemma, [["run", "lemma"]]);
  await p.click('.gamepad [data-b="a"]');
  await p.fill("#dict-q", "");
  await p.waitForFunction(() => /最近查过/.test(document.getElementById("dict-list").textContent));
  assert.match(await p.textContent("#dict-list"), /run[\s\S]*apple/);
  /* review: the word first, A shows the entry */
  await p.click("#dict-words-btn");
  await p.click("#dict-sheet .ck-a");
  assert.equal((await p.textContent("#dict-sheet .dict-page .big")).trim(), "apple");
  await p.click('.gamepad [data-b="a"]');
  await p.waitForFunction(() => /苹果/.test(document.querySelector("#dict-sheet .dict-page")?.textContent || ""));
  /* LP.dict.lookup for other programs */
  const r = await p.evaluate(() => LP.dict.lookup("Apple").then((r) => r.map((x) => [x.book, x.word, x.how])));
  assert.deepEqual(r[0], ["ecdict", "apple", "exact"]);
  assert.deepEqual(errors, []);
});

test("dictionary: import a StarDict book (.dict.dz, .syn), order it, delete it; ECDICT stays", { skip, timeout: 60000 }, async (t) => {
  const { writeStarDict } = await import("../tools/stardict-write.mjs");
  const sd = writeStarDict({ bookname: "Tiny", entries: [{ word: "zyzzyva", text: "a weevil (test)", syns: ["zyzz"] }, { word: "apple", text: "TINY-APPLE" }] });
  const files = [{ name: "tiny.ifo", mimeType: "text/plain", buffer: Buffer.from(sd.ifo) }, { name: "tiny.idx", mimeType: "application/octet-stream", buffer: sd.idx },
    { name: "tiny.dict.dz", mimeType: "application/octet-stream", buffer: sd.dictdz }, { name: "tiny.syn", mimeType: "application/octet-stream", buffer: sd.syn }];
  const { p, errors } = await dictPage(t);
  await p.click("#dict-books-btn");
  await p.setInputFiles("#dict-file", files);
  await p.waitForFunction(() => /Tiny/.test(document.getElementById("dict-sheet").textContent), null, { timeout: 10000 });
  /* the built-in cannot be deleted */
  await p.click("#dict-sheet .lcd-menu li:nth-child(1)");
  assert.ok(await p.isDisabled("#dict-sheet .dict-keys .btn.ghost:has-text('删除')"));
  const books = () => p.$$eval("#dict-sheet .lcd-menu li span", (l) => l.map((x) => x.textContent));
  assert.deepEqual(await books(), ["ECDICT", "Tiny"]);
  /* reload: the book survives; a synonym finds its headword */
  await p.reload({ waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: "词典" }).click();
  const syn = await p.evaluate(() => LP.dict.lookup("zyzz").then((r) => r.map((x) => [x.name, x.word, x.head, x.text])));
  assert.deepEqual(syn, [["Tiny", "zyzz", "zyzzyva", "a weevil (test)"]]);
  let apple = await p.evaluate(() => LP.dict.lookup("apple").then((r) => r.map((x) => x.name)));
  assert.deepEqual(apple, ["ECDICT", "Tiny"]);
  /* move Tiny up: its answer comes first */
  await p.click("#dict-books-btn");
  await p.click("#dict-sheet .lcd-menu li:nth-child(2)");
  await p.click("#dict-sheet .dict-keys .btn:has-text('上移')");
  apple = await p.evaluate(() => LP.dict.lookup("apple").then((r) => r.map((x) => x.name)));
  assert.deepEqual(apple, ["Tiny", "ECDICT"]);
  /* delete takes two taps */
  await p.click("#dict-sheet .dict-keys .btn:has-text('删除')");
  assert.deepEqual(await books(), ["Tiny", "ECDICT"]);
  await p.click("#dict-sheet .dict-keys .btn:has-text('确认删除')");
  assert.deepEqual(await books(), ["ECDICT"]);
  apple = await p.evaluate(() => LP.dict.lookup("apple").then((r) => r.map((x) => x.name)));
  assert.deepEqual(apple, ["ECDICT"]);
  assert.deepEqual(errors, []);
});

test("dictionary: English screen", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await dictPage(t, { locale: "en-US" });
  assert.equal(await p.getAttribute("#dict-q", "placeholder"), "Type an English word");
  assert.equal(await p.textContent("#dict-words-btn"), "Words");
  assert.deepEqual(errors, []);
});

/* ---------------- reader ---------------- */
const readerPage = async (t, opts = {}) => {
  const { p, errors } = await page(t, { locale: "zh-CN", ...opts });
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: "阅读器" }).click();
  await p.waitForSelector("#v-reader:not([hidden])");
  /* the two sample books go on the shelf the first time */
  await p.waitForFunction(() => document.querySelectorAll("#rd-list li:not(.label)").length === 2, null, { timeout: 10000 });
  return { p, errors };
};
const shelf = (p) => p.$$eval("#rd-list li:not(.label) span", (l) => l.map((x) => x.textContent));
const pos = (p) => p.getAttribute("#v-reader", "data-pos");
const foot = (p) => p.textContent("#rd-foot b");
/* is the character the position names on the visible page? */
/* (after the page-turn slide has finished) */
const posShown = async (p) => { await p.waitForTimeout(300); return p.evaluate(() => {
  const [ch, i, c] = document.getElementById("v-reader").getAttribute("data-pos").split(":").map(Number);
  const e = document.querySelectorAll("#rd-flow > p")[i], w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
  let n, at = 0; while ((n = w.nextNode()) && c >= at + n.data.length) at += n.data.length;
  const r = document.createRange(); r.setStart(n, c - at); r.setEnd(n, c - at + 1);
  const a = r.getClientRects()[0], v = document.getElementById("rd-page").getBoundingClientRect();
  return a.left >= v.left - 1 && a.right <= v.right + 1 && a.top >= v.top - 1 && a.bottom <= v.bottom + 1;
}); };
/* open the nth book on the shelf; the key card shows over the first book ever opened: put it away */
const openRow = async (p, n) => {
  await p.click(`#rd-list li:nth-child(${n})`);
  await p.waitForFunction(() => document.getElementById("rd-flow").children.length > 0, null, { timeout: 10000 });
  if (await p.isVisible("#rd-help")) { await p.click("#rd-help"); await p.waitForSelector("#rd-help", { state: "hidden" }); }
};
const importBook = async (p, file) => {
  const n = (await shelf(p)).length;
  await p.setInputFiles("#rd-file", file);
  await p.waitForFunction((n) => document.querySelectorAll("#rd-list li:not(.label)").length === n + 1, n, { timeout: 10000 });
};

test("reader: imports TXT in GBK and UTF-8 and an EPUB, splits chapters, keeps the newest on top, deletes with a second tap", { skip, timeout: 60000 }, async (t) => {
  const { gbkEncode, makeEpub } = await import("./book-fixtures.mjs");
  const { p, errors } = await readerPage(t);
  assert.deepEqual(await shelf(p), ["論語", "Alice’s Adventures in Wonderland"]);
  const zh = "第一章 山\n" + "山上有一座庙，庙里有个老和尚。\n".repeat(40) + "第二章 水\n" + "水边有一只白鹭。\n".repeat(40);
  await importBook(p, { name: "旧书.txt", mimeType: "text/plain", buffer: Buffer.from(gbkEncode(zh)) });
  await importBook(p, { name: "new.txt", mimeType: "text/plain", buffer: Buffer.from("Chapter 1\n\nThe first line of a story.\n\nChapter 2\n\nThe second chapter.\n") });
  const epub = makeEpub({ title: "Tiny Epub", author: "Me", lang: "en", chapters: [
    { title: "Opening", html: "<h1>Opening</h1><p>It was a <em>dark</em> night.</p><p>Rain fell.</p>" },
    { title: "Ending", html: "<h1>Ending</h1><p>The sun came out.<br/>Everyone smiled.</p>" }] });
  await importBook(p, { name: "tiny.epub", mimeType: "application/epub+zip", buffer: Buffer.from(epub) });
  assert.deepEqual((await shelf(p)).slice(0, 3), ["Tiny Epub", "new", "旧书"]);

  /* the GBK book reads as Chinese, with its two chapters in the contents */
  await openRow(p, 3);
  await p.waitForFunction(() => /老和尚/.test(document.getElementById("rd-flow").textContent));
  assert.match(await p.textContent("#rd-foot span"), /第一章 山/);
  await p.keyboard.press("Enter");                              /* START: the menu */
  await p.click("#rd-sheet .lcd-menu li:nth-child(1)");         /* 目录 */
  assert.deepEqual(await p.$$eval("#rd-sheet .lcd-menu li span", (l) => l.map((x) => x.textContent)), ["第一章 山", "第二章 水"]);
  await p.click("#rd-sheet .lcd-menu li:nth-child(2)");
  await p.waitForFunction(() => /白鹭/.test(document.getElementById("rd-flow").textContent));
  assert.equal((await pos(p)).split(":")[0], "1");
  await p.keyboard.press("z");                                  /* B: back to the shelf, this book on top */
  assert.equal((await shelf(p))[0], "旧书");

  /* the EPUB: emphasis and the line break survive, the chapters come from its contents */
  await openRow(p, 2);
  await p.waitForFunction(() => /dark/.test(document.getElementById("rd-flow").textContent));
  assert.equal(await p.textContent("#rd-flow em"), "dark");
  await p.keyboard.press("ArrowRight");
  await p.waitForFunction(() => /Everyone smiled/.test(document.getElementById("rd-flow").textContent));
  assert.match(await p.evaluate(() => document.getElementById("rd-flow").textContent), /came out\.\nEveryone/);
  assert.equal(await p.textContent("#rd-foot span"), "Ending");
  await p.keyboard.press("z");

  /* delete: the first tap only arms it */
  assert.equal((await shelf(p))[0], "Tiny Epub");
  await p.click("#rd-del");
  assert.equal((await shelf(p)).length, 5);
  assert.match(await p.textContent("#rd-note"), /Tiny Epub/);
  await p.click("#rd-del");
  await p.waitForFunction(() => document.querySelectorAll("#rd-list li:not(.label)").length === 4);
  assert.ok(!(await shelf(p)).includes("Tiny Epub"));
  await p.waitForFunction(() => /已删除《Tiny Epub》/.test(document.getElementById("toast").textContent));
  /* a reload finds the rest, and the samples do not come back twice */
  await p.reload({ waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: "阅读器" }).click();
  await p.waitForFunction(() => document.querySelectorAll("#rd-list li:not(.label)").length === 4, null, { timeout: 10000 });
  await p.waitForTimeout(500);
  assert.equal((await shelf(p)).length, 4);
  assert.deepEqual(errors, []);
});

test("reader: whole pages turn by keys, taps and swipes; a new text size keeps the place; progress is kept", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await readerPage(t);
  await openRow(p, 2);                   /* Alice */
  await p.waitForFunction(() => /Lewis Carroll/.test(document.getElementById("rd-flow").textContent));
  assert.equal(await p.evaluate(() => document.getElementById("rd-page").scrollHeight <= document.getElementById("rd-page").clientHeight + 1), true, "no scrolling");
  await p.keyboard.press("ArrowRight");                         /* the title page, then chapter I */
  await p.waitForFunction(() => /Rabbit-Hole/.test(document.getElementById("rd-foot").textContent));
  assert.equal(await foot(p), "1/" + (await foot(p)).split("/")[1]);
  await p.keyboard.press("ArrowDown"); await p.keyboard.press("x");     /* A turns the page too */
  assert.equal((await foot(p)).split("/")[0], "3");
  assert.ok(await p.isHidden("#rd-sheet"), "A is not the menu while reading");
  const box = await p.locator("#rd-page").boundingBox();
  await p.touchscreen.tap(box.x + box.width * 0.9, box.y + box.height / 2);   /* right side: on */
  assert.equal((await foot(p)).split("/")[0], "4");
  await p.touchscreen.tap(box.x + box.width * 0.1, box.y + box.height / 2);   /* left side: back */
  assert.equal((await foot(p)).split("/")[0], "3");
  const swipe = async (from, to) => p.evaluate(([y, a, b]) => {
    const pg = document.getElementById("rd-page"), ev = (type, x) => pg.dispatchEvent(new PointerEvent(type, { pointerId: 7, clientX: x, clientY: y, bubbles: true, pointerType: "touch" }));
    ev("pointerdown", a); ev("pointerup", b);
  }, [box.y + box.height / 2, from, to]);
  await swipe(box.x + 300, box.x + 100);                        /* swipe left: on */
  assert.equal((await foot(p)).split("/")[0], "4");
  const here = await pos(p);
  assert.ok(await posShown(p));
  /* text size: from the menu; the same sentence stays on screen */
  const before = await foot(p);
  await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);     /* middle: the menu */
  await p.waitForSelector("#rd-sheet:not([hidden])");
  await p.click("#rd-sheet .lcd-menu li:nth-child(3)");         /* 字号: 中 -> 大 */
  assert.match(await p.textContent("#rd-sheet .lcd-menu li:nth-child(3) small"), /大/);
  await p.keyboard.press("z"); await p.waitForSelector("#rd-sheet", { state: "hidden" });
  assert.equal(await pos(p), here);
  assert.ok(await posShown(p), "the place is still on the page");
  assert.notEqual(await foot(p), before, "pages were laid out again");
  await p.keyboard.press("Enter"); await p.keyboard.press("ArrowDown"); await p.keyboard.press("ArrowDown"); await p.keyboard.press("x");   /* 中 -> 大 -> 小 */
  await p.keyboard.press("z");
  assert.equal(await pos(p), here);
  assert.ok(await posShown(p));
  /* e-ink: no transition on the page */
  await p.keyboard.press("Enter");
  for (let i = 0; i < 5; i++) await p.keyboard.press("ArrowDown");
  await p.keyboard.press("x"); await p.keyboard.press("z");
  assert.ok(await p.evaluate(() => document.getElementById("v-reader").classList.contains("eink") && document.getElementById("screen").classList.contains("rd-eink")));
  await p.keyboard.press("ArrowRight");
  assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById("rd-flow")).transitionDuration), "0s");
  /* progress shows on the shelf and survives a reload */
  const at = await pos(p);
  await p.keyboard.press("z");
  assert.match(await p.textContent("#rd-list li:nth-child(1)"), /Alice[\s\S]*\d+%/);
  await p.waitForTimeout(700);
  await p.reload({ waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: "阅读器" }).click();
  await p.waitForFunction(() => document.querySelectorAll("#rd-list li:not(.label)").length === 2, null, { timeout: 10000 });
  await openRow(p, 1);
  await p.waitForFunction(() => document.getElementById("v-reader").hasAttribute("data-pos") && /Rabbit/.test(document.getElementById("rd-foot").textContent));
  assert.equal(await pos(p), at);
  assert.ok(await p.evaluate(() => document.getElementById("v-reader").classList.contains("eink")), "e-ink stays on");
  assert.deepEqual(errors, []);
});

test("reader: long-press and drag selects, SELECT widens to the sentence, A looks up, START adds to the word book, copy", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await readerPage(t);
  await p.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await openRow(p, 2);                                         /* Alice */
  await p.keyboard.press("ArrowRight");
  await p.waitForFunction(() => /Rabbit-Hole/.test(document.getElementById("rd-foot").textContent));
  assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById("rd-flow")).userSelect), "none");
  /* the keys: SELECT shows the cursor, the D-pad moves it */
  await p.keyboard.press("Shift");
  assert.equal(await p.textContent("#rd-flow mark"), "CHAPTER");
  await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight");
  assert.equal(await p.textContent("#rd-flow mark"), "Down");
  await p.keyboard.press("z");                                  /* B: done */
  assert.equal(await p.locator("#rd-flow mark").count(), 0);
  /* long-press "sister" and drag to "bank": three words, no lookup yet */
  const wordAt = (w) => p.evaluate((w) => {
    const e = document.querySelectorAll("#rd-flow > p")[1], n = e.firstChild, i = n.data.indexOf(w);
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); const b = r.getBoundingClientRect();
    return [b.left + b.width / 2, b.top + b.height / 2];
  }, w);
  const press = (x, y, id = 3) => p.evaluate(([x, y, id]) => document.getElementById("rd-page").dispatchEvent(new PointerEvent("pointerdown", { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch" })), [x, y, id]);
  const move = (x, y, id = 3) => p.evaluate(([x, y, id]) => document.getElementById("rd-page").dispatchEvent(new PointerEvent("pointermove", { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch" })), [x, y, id]);
  const lift = (x, y, id = 3) => p.evaluate(([x, y, id]) => document.getElementById("rd-page").dispatchEvent(new PointerEvent("pointerup", { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch" })), [x, y, id]);
  const [sx, sy] = await wordAt("sister"), [bx, by] = await wordAt("bank");
  await press(sx, sy); await p.waitForTimeout(600);
  assert.equal(await p.textContent("#rd-flow mark"), "sister");
  await move(bx, by); await lift(bx, by);
  assert.equal(await p.$$eval("#rd-flow mark", (l) => l.map((x) => x.textContent).join("")), "sister on the bank");
  assert.ok(await p.isHidden("#rd-def"));
  assert.match(await p.textContent("#rd-foot"), /查词[\s\S]*摘抄[\s\S]*词[\s\S]*复制/);
  /* with a selection, a tap only cancels it: no page turn, no menu */
  const here = await pos(p);
  await press(bx, by, 4); await lift(bx, by, 4);
  assert.equal(await p.locator("#rd-flow mark").count(), 0);
  assert.equal(await pos(p), here);
  assert.equal((await foot(p)).split("/")[0], "1");
  assert.ok(await p.isHidden("#rd-sheet"));
  /* a swipe cancels it and turns the page */
  await press(sx, sy, 5); await p.waitForTimeout(600); await lift(sx, sy, 5);
  assert.equal(await p.textContent("#rd-flow mark"), "sister");
  await press(sx + 100, sy, 6); await lift(sx - 100, sy, 6);
  assert.equal(await p.locator("#rd-flow mark").count(), 0);
  assert.equal((await foot(p)).split("/")[0], "2");
  await p.keyboard.press("ArrowLeft");
  /* long-press "sister" again and let go: one word, for the lookup */
  await press(sx, sy, 7); await p.waitForTimeout(600); await lift(sx, sy, 7);
  assert.equal(await p.textContent("#rd-flow mark"), "sister");
  /* A: the entry in the lower half */
  await p.keyboard.press("x");
  await p.waitForFunction(() => /姐|妹/.test(document.getElementById("rd-def").textContent), null, { timeout: 10000 });
  assert.equal(await p.textContent("#rd-def .sheet-title span"), "sister");
  const h = await p.evaluate(() => [document.getElementById("rd-def").getBoundingClientRect().top, document.getElementById("screen").getBoundingClientRect()]);
  assert.ok(h[0] > h[1].top + h[1].height * 0.4, "the entry takes the lower half");
  await p.keyboard.press("Enter");                              /* START: word book, shared with the dictionary */
  await p.waitForFunction(() => /已加入生词本/.test(document.getElementById("toast").textContent));
  assert.ok(await p.evaluate(() => LP.dict.inBook("sister")));
  await p.keyboard.press("z");
  await p.waitForSelector("#rd-def", { state: "hidden" });
  /* SELECT: the sentence around the cursor, then the paragraph; A still looks up the word under the cursor */
  await p.keyboard.press("Shift");
  const sentence = (await p.$$eval("#rd-flow mark", (l) => l.map((x) => x.textContent).join("")));
  assert.match(sentence, /^Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do:/);
  assert.match(sentence, /conversations\?”$/);
  assert.match(await p.textContent("#rd-foot"), /句/);
  await p.keyboard.press("Shift");
  const para = await p.evaluate(() => document.querySelectorAll("#rd-flow > p")[1].textContent);
  assert.equal(await p.$$eval("#rd-flow mark", (l) => l.map((x) => x.textContent).join("")), para);
  await p.keyboard.press("Shift");                              /* back to a word */
  assert.equal(await p.textContent("#rd-flow mark"), "sister");
  /* copy */
  await p.click("#rd-foot button:last-child");
  await p.waitForFunction(() => /已复制/.test(document.getElementById("toast").textContent));
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), "sister");
  assert.deepEqual(errors, []);
});

test("reader: START quotes into Notes and underlines it; thoughts; the notes list jumps back; a tap on the line shows it; remove", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await readerPage(t);
  await openRow(p, 2);                                         /* Alice */
  await p.keyboard.press("ArrowRight");
  await p.waitForFunction(() => /Rabbit-Hole/.test(document.getElementById("rd-foot").textContent));
  /* the sentence with "sister" in it */
  await p.keyboard.press("Shift");
  for (let i = 0; i < 4; i++) await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Shift");                              /* sentence */
  const sentence = await p.$$eval("#rd-flow mark", (l) => l.map((x) => x.textContent).join(""));
  assert.ok(sentence.length > 40, sentence);
  await p.keyboard.press("Enter");                              /* START: quote */
  await p.waitForSelector("#rd-thought");
  assert.equal(await p.locator("#rd-flow mark").count(), 0, "the selection ends");
  assert.equal(await p.$$eval("#rd-flow u.hl", (l) => l.map((x) => x.textContent).join("")), sentence);
  await p.fill("#rd-thought", "第一句心得。");
  await p.click("#rd-def .ck-a");
  await p.waitForFunction(() => /心得已存进记事本/.test(document.getElementById("toast").textContent));
  /* the notes list: one quote with its thought; turn away, then jump back from the list */
  await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight");
  await p.keyboard.press("Enter");
  await p.click("#rd-sheet .lcd-menu li:nth-child(2)");         /* 笔记 */
  assert.match(await p.textContent("#rd-sheet .rd-notes"), /第一句心得/);
  await p.click("#rd-sheet .rd-notes li");
  await p.waitForSelector("#rd-sheet", { state: "hidden" });
  /* Where to tap the underline. Not the middle of its bounding box: a quote that wraps onto two lines has a box
     whose middle falls in the gap between the lines, and its left edge is in the "previous page" tap zone, so the
     tap turned the page instead (it depended on the fonts and where the line broke: it failed in one environment
     and passed in CI). The middle of the widest line the underline actually covers is always on it. */
  const spot = await p.evaluate(() => {
    const rs = [...document.querySelector("#rd-flow u.hl").getClientRects()].filter((r) => r.width > 0);
    const r = rs.reduce((a, b) => (b.width > a.width ? b : a));
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const page = await p.locator("#rd-page").boundingBox();
  assert.ok(spot.x >= page.x && spot.x < page.x + page.width, "the quote is on the page");
  assert.ok(await p.evaluate(({ x, y }) => !!document.elementFromPoint(x, y).closest("u.hl"), spot), "the spot is on the underline");
  /* a tap on the line: the quote and the thought; a second thought, then remove the line (twice) */
  await p.touchscreen.tap(spot.x, spot.y);
  await p.waitForSelector("#rd-def:not([hidden])");
  assert.match(await p.textContent("#rd-def"), /第一句心得/);
  await p.keyboard.press("x");                                  /* A: another thought */
  await p.waitForSelector("#rd-thought");
  await p.fill("#rd-thought", "再读一遍。");
  await p.click("#rd-def .ck-a");                               /* (X would type into the box) */
  await p.waitForSelector("#rd-def", { state: "hidden" });
  await p.touchscreen.tap(spot.x, spot.y);
  await p.waitForSelector("#rd-def:not([hidden])");
  assert.match(await p.textContent("#rd-def"), /第一句心得。\s*再读一遍/);
  await p.keyboard.press("Enter");
  assert.match(await p.textContent("#rd-def"), /确认删除/);
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => /已删除划线/.test(document.getElementById("toast").textContent));
  assert.equal(await p.locator("#rd-flow u.hl").count(), 0);
  /* Notes: the quote, its thought on the next line, and the later thought with the quote repeated */
  await p.click("#home-key");
  await p.locator("#home .app", { hasText: "记事本" }).click();
  await p.waitForFunction(() => /Alice/.test(document.getElementById("notes-list").textContent));
  await p.click("#notes-list li button");
  const head = "《Alice’s Adventures in Wonderland》 CHAPTER I. Down the Rabbit-Hole\n「" + sentence + "」";
  assert.equal(await p.inputValue("#note-body"), "《Alice’s Adventures in Wonderland》\n\n" + head + "\n第一句心得。\n\n" + head + "\n再读一遍。");
  assert.deepEqual(errors, []);
});

test("reader: the key card shows over the first book only, and from the menu; the progress bar jumps", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await readerPage(t);
  await p.click("#rd-list li:nth-child(2)");
  await p.waitForSelector("#rd-help:not([hidden])");
  assert.match(await p.textContent("#rd-help"), /上一页[\s\S]*菜单[\s\S]*下一页[\s\S]*长按/);
  await p.keyboard.press("ArrowRight");                         /* any key puts it away, and does nothing else */
  await p.waitForSelector("#rd-help", { state: "hidden" });
  assert.equal((await pos(p)).split(":")[0], "0");
  await p.keyboard.press("z");
  await p.click("#rd-list li:nth-child(2)");                   /* 論語: no card the second time */
  await p.waitForFunction(() => document.getElementById("rd-flow").children.length > 0);
  await p.waitForTimeout(300);
  assert.ok(await p.isHidden("#rd-help"));
  await p.keyboard.press("Enter");
  await p.click("#rd-sheet .lcd-menu li:nth-child(7)");         /* 按键说明 */
  await p.waitForSelector("#rd-help:not([hidden])");
  await p.click("#rd-help");
  await p.waitForSelector("#rd-help", { state: "hidden" });
  /* the bar under the menu: drag to about the middle and let go */
  await p.keyboard.press("Enter");
  const bar = await p.locator("#rd-sheet .rd-bar").boundingBox();
  await p.mouse.move(bar.x + 2, bar.y + bar.height / 2); await p.mouse.down();
  await p.mouse.move(bar.x + bar.width * 0.3, bar.y + bar.height / 2, { steps: 4 });
  await p.mouse.move(bar.x + bar.width * 0.5, bar.y + bar.height / 2, { steps: 4 });
  assert.match(await p.textContent("#rd-sheet .rd-track"), /^(49|50|51)% · /);
  await p.mouse.up();
  await p.waitForSelector("#rd-sheet", { state: "hidden" });
  const pct = await p.evaluate(() => LP.S && document.getElementById("v-reader").getAttribute("data-pos"));
  assert.ok(pct && +pct.split(":")[0] >= 8 && +pct.split(":")[0] <= 12, "the middle of the twenty chapters: " + pct);
  assert.deepEqual(errors, []);
});

test("reader: a Chinese book moves the cursor one character at a time; reduced motion turns e-ink on", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await readerPage(t, { reducedMotion: "reduce" });
  await openRow(p, 1);                   /* 論語 */
  await p.waitForFunction(() => /論語/.test(document.getElementById("rd-flow").textContent));   /* the title page */
  assert.ok(await p.evaluate(() => document.getElementById("v-reader").classList.contains("eink")));
  await p.keyboard.press("ArrowRight");
  await p.waitForFunction(() => /學而第一/.test(document.getElementById("rd-foot").textContent));
  await p.keyboard.press("Shift");
  assert.equal(await p.textContent("#rd-flow mark"), "學");
  await p.keyboard.press("ArrowRight");
  assert.equal(await p.textContent("#rd-flow mark"), "而");
  await p.keyboard.press("ArrowDown");                          /* the next line: one character */
  assert.equal([...(await p.textContent("#rd-flow mark"))].length, 1);
  await p.keyboard.press("x");                                  /* no Chinese dictionary: says so, nothing breaks */
  await p.waitForSelector("#rd-def:not([hidden])");
  await p.waitForFunction(() => /查不到|ECDICT/.test(document.getElementById("rd-def").textContent));
  await p.keyboard.press("z"); await p.keyboard.press("z");
  assert.equal(await p.locator("#rd-flow mark").count(), 0);
  assert.deepEqual(errors, []);
});

test("reader: EPUB pictures in the four tones, a cover kept, a link that jumps and comes back with B, a footnote in the lower half", { skip, timeout: 60000 }, async (t) => {
  const { makeEpub, makePng } = await import("./book-fixtures.mjs");
  const { p, errors } = await readerPage(t);
  /* a colour gradient with a transparent corner: every pixel on screen must still be one of the four tones */
  const png = makePng(64, 48, (x, y) => (x < 8 && y < 8) ? [0, 0, 0, 0] : [x * 4, y * 5, 255 - x * 4, 255]);
  const filler = Array.from({ length: 30 }, (_, i) => `<p>Filler line ${i} to make the chapter run over several pages.</p>`).join("");
  const epub = makeEpub({ title: "Picture Book", lang: "en",
    images: [{ name: "OEBPS/images/a.png", type: "image/png", data: png }],
    chapters: [
      { title: "Cover", html: '<div><img src="../images/a.png" alt="cover"/></div>' },
      { title: "One", html: '<h1>One</h1><p>See <a href="ch3.xhtml#far">the far place</a> and a note<a href="#n1">1</a>.</p>' + filler +
        '<aside epub:type="footnote" id="n1"><p>The note text, short and clear.</p></aside>' },
      { title: "Three", html: '<h1>Three</h1>' + filler + '<p id="far">The far place is here.</p>' }] });
  await importBook(p, { name: "pictures.epub", mimeType: "application/epub+zip", buffer: Buffer.from(epub) });
  await openRow(p, 1);
  await p.waitForFunction(() => { const i = document.querySelector("#rd-flow p.img img"); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 });
  const pix = await p.evaluate(() => {
    const img = document.querySelector("#rd-flow p.img img"), c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, tones = new Set();
    for (let i = 0; i < d.length; i += 4) tones.add(d[i] + "," + d[i + 1] + "," + d[i + 2] + "," + d[i + 3]);
    return { w: c.width, h: c.height, shown: img.getBoundingClientRect().width, tones: [...tones] };
  });
  const TONES = ["31,42,20,255", "74,90,50,255", "125,138,88,255", "163,173,126,255"];
  assert.deepEqual(pix.tones.filter((x) => !TONES.includes(x)), [], "only the four tones");
  assert.ok(pix.tones.length >= 3, "dithered, not flat: " + pix.tones);
  assert.equal(pix.w, 64); assert.equal(pix.h, 48);
  assert.equal(pix.shown % 64, 0, "shown at a whole multiple of its pixels");
  /* the link jumps to chapter three, B comes back to where it was */
  await p.keyboard.press("ArrowRight");
  await p.waitForFunction(() => /the far place/.test(document.getElementById("rd-flow").textContent));
  const before = await pos(p);
  await p.locator("#rd-flow a.ln", { hasText: "the far place" }).click();
  await p.waitForFunction(() => /Three/.test(document.getElementById("rd-flow").textContent));
  assert.ok(await posShown(p));
  assert.match(await p.evaluate(() => { const [ch, i] = document.getElementById("v-reader").getAttribute("data-pos").split(":").map(Number); return document.querySelectorAll("#rd-flow > p")[i].textContent; }), /far place is here/);
  assert.match(await p.textContent("#rd-foot"), /按 B 回到原处/);
  await p.keyboard.press("z");
  await p.waitForFunction(() => /the far place/.test(document.getElementById("rd-flow").textContent));
  assert.equal(await pos(p), before);
  /* the footnote opens in the lower half; B closes it */
  await p.locator("#rd-flow a.ln", { hasText: "1" }).click();
  await p.waitForSelector("#rd-def:not([hidden])");
  assert.match(await p.textContent("#rd-def"), /注释[\s\S]*The note text, short and clear/);
  await p.keyboard.press("z");
  await p.waitForSelector("#rd-def", { state: "hidden" });
  assert.equal(await pos(p), before);
  /* deleting the book takes its pictures too */
  await p.keyboard.press("z");
  await p.click("#rd-del"); await p.click("#rd-del");
  await p.waitForFunction(() => /已删除/.test(document.getElementById("toast").textContent));
  const left = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open("lopda-files"); r.onsuccess = () => { const q = r.result.transaction("files").objectStore("files").getAllKeys(); q.onsuccess = () => res(q.result.filter((k) => /\/img\//.test(k))); }; }));
  assert.deepEqual(left, []);
  assert.deepEqual(errors, []);
});

test("reader: in a short screen the menu scrolls to keep the highlighted row in view as the D-pad moves it", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await readerPage(t, { viewport: { width: 390, height: 600 } });
  await openRow(p, 2);
  await p.keyboard.press("Enter");                              /* START: the menu */
  await p.waitForSelector("#rd-sheet:not([hidden])");
  const inView = () => p.evaluate(() => {
    const ul = document.querySelector("#rd-sheet .lcd-menu"), li = ul.querySelector("li.on"), a = ul.getBoundingClientRect(), b = li.getBoundingClientRect();
    return { fits: b.top >= a.top - 1 && b.bottom <= a.bottom + 1, scrolls: ul.scrollHeight > ul.clientHeight, text: li.textContent };
  });
  assert.ok((await inView()).scrolls, "the menu is taller than its box at this height");
  for (let i = 0; i < 7; i++) {
    await p.keyboard.press("ArrowDown");
    const v = await inView();
    assert.ok(v.fits, "row " + (i + 2) + " (" + v.text + ") is in view");
  }
  assert.match((await inView()).text, /回书架/);
  for (let i = 0; i < 7; i++) await p.keyboard.press("ArrowUp");
  assert.ok((await inView()).fits);
  assert.deepEqual(errors, []);
});
