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
  await p.waitForFunction(() => /最近查过/.test(document.getElementById("dict-history").textContent));
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

test("dictionary: browse matches, restore the selected row, and save selected text as a note", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await dictPage(t);
  await typeWord(p, "a");
  await p.waitForFunction(() => document.querySelectorAll("#dict-list li:not(.label)").length > 12);
  await p.evaluate(() => { const list = document.getElementById("dict-list"); list.style.flex = "0 0 140px"; list.style.height = "140px"; });
  for (let i = 0; i < 10; i++) await p.keyboard.press("ArrowDown");
  const savedScroll = await p.evaluate(() => document.getElementById("dict-list").scrollTop);
  assert.ok(savedScroll > 0);
  const picked = await p.textContent("#dict-list li.on");
  await p.click("#dict-list li.on");
  await p.waitForFunction(() => document.querySelector("#dict-sheet .dict-page")?.textContent.length > 0);
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector("#dict-sheet .dict-page")).overflowY), "auto");
  await p.keyboard.press("ArrowRight");
  await p.waitForFunction((before) => document.querySelector("#dict-sheet .sheet-title span")?.textContent !== before, picked);
  const next = await p.textContent("#dict-sheet .sheet-title span");
  await p.keyboard.press("z");
  assert.equal(await p.textContent("#dict-list li.on"), next);
  assert.equal(await p.evaluate(() => document.getElementById("dict-list").scrollTop), savedScroll);

  await p.click("#dict-list li.on");
  await p.waitForFunction(() => document.querySelector("#dict-sheet .dict-page")?.textContent.length > 0);
  await p.evaluate(() => {
    const page = document.querySelector("#dict-sheet .dict-page");
    const range = document.createRange();
    range.selectNodeContents(page);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await p.waitForFunction(() => !document.querySelector("#dict-sheet .dict-note").disabled);
  await p.click("#dict-sheet .dict-copy");
  await p.waitForFunction(() => /已复制/.test(document.getElementById("toast").textContent));
  await p.evaluate(() => {
    const page = document.querySelector("#dict-sheet .dict-page");
    const range = document.createRange();
    range.selectNodeContents(page);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await p.waitForFunction(() => !document.querySelector("#dict-sheet .dict-note").disabled);
  await p.click("#dict-sheet .dict-note");
  await p.waitForFunction(() => /已存入《词典》笔记/.test(document.getElementById("toast").textContent));
  await p.keyboard.press("z");
  await p.fill("#dict-q", "run");
  await p.press("#dict-q", "Enter");
  await p.waitForFunction(() => /跑/.test(document.querySelector("#dict-sheet .dict-page")?.textContent || ""));
  const entryHeight = await p.evaluate(() => {
    const page = document.querySelector("#dict-sheet .dict-page");
    return [page.scrollHeight, page.clientHeight];
  });
  assert.ok(entryHeight[0] > entryHeight[1], "the long entry has content to scroll");
  await p.keyboard.press("ArrowDown");
  assert.ok(await p.evaluate(() => document.querySelector("#dict-sheet .dict-page").scrollTop > 0));
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
/* query: e.g. "?debug"; init: a function run in the page before its scripts */
const readerPage = async (t, { query = "", init, ...opts } = {}) => {
  const { p, errors } = await page(t, { locale: "zh-CN", ...opts });
  if (init) await p.addInitScript(init);
  await p.goto(base + "/runtime/" + query, { waitUntil: "networkidle" });
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
  for (let i = 0; i < 7; i++) await p.keyboard.press("ArrowDown");
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
  await p.click("#rd-sheet .lcd-menu li:nth-child(9)");         /* 按键说明 */
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
  for (let i = 0; i < 9; i++) {
    await p.keyboard.press("ArrowDown");
    const v = await inView();
    assert.ok(v.fits, "row " + (i + 2) + " (" + v.text + ") is in view");
  }
  assert.match((await inView()).text, /回书架/);
  for (let i = 0; i < 9; i++) await p.keyboard.press("ArrowUp");
  assert.ok((await inView()).fits);
  assert.deepEqual(errors, []);
});

/* ---------------- reader: fonts, layouts, full refresh ---------------- */
const menuRow = (p, text) => p.locator("#rd-sheet .lcd-menu li", { hasText: text });
const toastSays = (p, re) => p.waitForFunction((s) => { const t = document.getElementById("toast"); return !t.hidden && new RegExp(s).test(t.textContent); }, re.source, { timeout: 20000 });
const flowFont = (p) => p.evaluate(() => getComputedStyle(document.getElementById("rd-flow")).fontFamily);
const flowInline = (p) => p.evaluate(() => document.getElementById("rd-flow").style.fontFamily);
const fontRowTexts = (p) => p.$$eval("#rd-sheet ul.rd-fonts li > span", (l) => l.map((x) => x.textContent));
/* Alice, three pages in */
const aliceAhead = async (p, n = 3) => {
  await openRow(p, 2);
  await p.waitForFunction(() => /Lewis Carroll/.test(document.getElementById("rd-flow").textContent));
  for (let i = 0; i < n; i++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(250); }
};

test("reader: an imported font is for the text only; switching keeps the place; deleting goes back to the system font", { skip, timeout: 120000 }, async (t) => {
  const { fontFile } = await import("./font-fixture.mjs");
  const { p, errors } = await readerPage(t);
  await aliceAhead(p);
  const here = await pos(p), total = (await foot(p)).split("/")[1];
  assert.ok(await posShown(p));
  const footFamily = await p.evaluate(() => getComputedStyle(document.getElementById("rd-foot")).fontFamily);
  const sysFlow = await flowFont(p);
  assert.equal(await flowInline(p), "", "no inline font before one is imported");
  await p.keyboard.press("Enter");
  const menuFamily = await menuRow(p, "字体").evaluate((e) => getComputedStyle(e).fontFamily);
  await menuRow(p, "字体").click();
  assert.deepEqual(await fontRowTexts(p), ["默认（系统字体）", "导入字体…"]);
  await p.setInputFiles("#rd-fontfile", fontFile("Pixel Test.ttf", { advance: 900 }));
  await toastSays(p, /已导入字体 Pixel Test/);
  await p.waitForFunction(() => /lprd-/.test(document.getElementById("rd-flow").style.fontFamily));
  await p.waitForFunction((n) => document.getElementById("rd-foot").textContent.split("/")[1] !== n && /\//.test(document.getElementById("rd-foot").textContent), total, { timeout: 10000 });
  assert.deepEqual(await fontRowTexts(p), ["默认（系统字体）", "Pixel Test", "导入字体…"]);
  assert.match(await p.textContent("#rd-sheet ul.rd-fonts li:nth-child(2) small"), /使用中/);
  const fam = await flowFont(p);
  assert.match(fam, /^"?lprd-/);
  assert.ok(fam.endsWith(sysFlow), "the system stack follows: " + fam);
  assert.ok(await p.evaluate(() => [...document.fonts].some((f) => /lprd-/.test(f.family) && f.status === "loaded")), "the face is loaded");
  assert.ok(await p.evaluate((f) => document.fonts.check("16px " + f.split(",")[0]), fam));
  assert.notEqual((await foot(p)).split("/")[1], total, "wider glyphs, other pages");
  assert.equal(await menuRow(p, "").first().evaluate((e) => getComputedStyle(e).fontFamily), menuFamily, "the menu keeps its font");
  assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById("rd-foot")).fontFamily), footFamily, "the footer keeps its font");
  assert.equal(await pos(p), here);
  assert.ok(await posShown(p));
  /* back to the system font (A on row 1), then the font again (A on row 2) */
  await p.keyboard.press("ArrowUp"); await p.keyboard.press("ArrowUp"); await p.keyboard.press("x");
  await p.waitForFunction(() => document.getElementById("rd-flow").style.fontFamily === "");
  await p.waitForFunction((n) => document.getElementById("rd-foot").textContent.split("/")[1] === n, total, { timeout: 10000 });
  assert.equal(await pos(p), here);
  assert.ok(await posShown(p));
  await p.keyboard.press("ArrowDown"); await p.keyboard.press("x");
  await p.waitForFunction(() => /lprd-/.test(document.getElementById("rd-flow").style.fontFamily));
  await p.waitForFunction((n) => document.getElementById("rd-foot").textContent.split("/")[1] !== n, total, { timeout: 10000 });
  assert.equal(await pos(p), here);
  assert.ok(await posShown(p));
  /* a file that is no font, and one over 30 MB: refused, no row added */
  await p.setInputFiles("#rd-fontfile", { name: "bad.ttf", mimeType: "font/ttf", buffer: Buffer.from("this is only text, not a font") });
  await toastSays(p, /^读不出这个字体/);
  const big = Buffer.alloc(30 * 1024 * 1024 + 1); Buffer.from([0, 1, 0, 0]).copy(big);
  await p.setInputFiles("#rd-fontfile", { name: "huge.ttf", mimeType: "font/ttf", buffer: big });
  await toastSays(p, /字体太大/);
  assert.deepEqual(await fontRowTexts(p), ["默认（系统字体）", "Pixel Test", "导入字体…"]);
  /* delete the font in use: START twice */
  await p.keyboard.press("Enter");
  assert.match(await p.textContent("#rd-sheet .hint"), /再按一次 START 删除 Pixel Test/);
  await p.keyboard.press("Enter");
  await toastSays(p, /已删除字体 Pixel Test/);
  await p.waitForFunction(() => document.getElementById("rd-flow").style.fontFamily === "");
  assert.deepEqual(await fontRowTexts(p), ["默认（系统字体）", "导入字体…"]);
  await p.waitForFunction((n) => document.getElementById("rd-foot").textContent.split("/")[1] === n, total, { timeout: 10000 });
  assert.equal(await pos(p), here);
  assert.ok(await posShown(p));
  /* the choice survives a reload */
  await p.setInputFiles("#rd-fontfile", fontFile("Pixel Test.ttf", { advance: 900 }));
  await toastSays(p, /已导入字体 Pixel Test/);
  await p.waitForFunction(() => /lprd-/.test(document.getElementById("rd-flow").style.fontFamily));
  await p.waitForTimeout(900);
  await p.reload({ waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: "阅读器" }).click();
  await p.waitForFunction(() => document.querySelectorAll("#rd-list li:not(.label)").length === 2, null, { timeout: 10000 });
  await openRow(p, 1);
  await p.waitForFunction(() => /lprd-/.test(document.getElementById("rd-flow").style.fontFamily), null, { timeout: 10000 });
  assert.ok(await p.evaluate(() => [...document.fonts].some((f) => /lprd-/.test(f.family) && f.status === "loaded")));
  assert.equal(await pos(p), here);
  assert.deepEqual(errors, []);
});

test("reader: the three layouts keep the place", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await readerPage(t);
  await aliceAhead(p);
  const here = await pos(p);
  const lh = () => p.evaluate(() => parseFloat(getComputedStyle(document.getElementById("rd-flow")).lineHeight));
  const seen = [await lh()];
  await p.keyboard.press("Enter");
  assert.match(await p.textContent("#rd-sheet .lcd-menu li:nth-child(5) small"), /适中/);
  for (const want of ["宽松", "紧凑", "适中"]) {
    await menuRow(p, "版式").click();
    assert.match(await menuRow(p, "版式").locator("small").textContent(), new RegExp(want));
    await p.waitForTimeout(200);
    assert.equal(await pos(p), here, want);
    assert.ok(await posShown(p), want);
    seen.push(await lh());
  }
  assert.equal(new Set(seen.slice(0, 3)).size, 3, "three line heights: " + seen);
  assert.equal(seen[3], seen[0]);
  assert.ok(!/padding/.test((await p.getAttribute("#rd-page", "style")) || ""), "适中 has no inline padding");
  await menuRow(p, "版式").click();   /* 宽松 again: padding is set */
  assert.match((await p.getAttribute("#rd-page", "style")) || "", /padding/);
  assert.deepEqual(errors, []);
});

/* Full refresh, checked by phase order only. The runtime is loaded with ?debug: the reader logs "invert", "paper", "page"
   (and "ignored" for a turn during a refresh) on LOPDA_DEBUG.flash, and with LOPDA_DEBUG.flashHold set each phase waits
   for LOPDA_DEBUG.flashStep(). Nothing here measures a duration. */
const flashLog = (p) => p.evaluate(() => (window.LOPDA_DEBUG.flash || []).slice());
const flashClear = (p) => p.evaluate(() => { window.LOPDA_DEBUG.flash = []; });
const flashWait = (p, n) => p.waitForFunction((n) => (window.LOPDA_DEBUG.flash || []).length >= n, n);
const flashHold = (p) => p.evaluate(() => { window.LOPDA_DEBUG.flashHold = true; });
const flashStep = async (p) => {
  await p.waitForFunction(() => typeof window.LOPDA_DEBUG.flashStep === "function");
  await p.evaluate(() => window.LOPDA_DEBUG.flashStep());
};
const isNeg = (p) => p.evaluate(() => document.getElementById("screen").classList.contains("rd-neg"));
const flashHidden = (p) => p.evaluate(() => document.getElementById("rd-flash").hidden);
/* run an action that must change the page whole: exactly invert, paper, page, in that order, and nothing after */
const wholeRefresh = async (p, act, what) => {
  await flashClear(p);
  await act();
  await flashWait(p, 1);
  assert.deepEqual(await flashLog(p), ["invert"], what);
  await flashStep(p); await flashWait(p, 2);
  await flashStep(p); await flashWait(p, 3);
  await p.waitForTimeout(150);
  assert.deepEqual(await flashLog(p), ["invert", "paper", "page"], what);
  assert.ok(await flashHidden(p) && !(await isNeg(p)), what + ": the screen is back");
};
/* e-ink and 全刷 on, from the book's menu (both are settings of the reader, so a second book may have them already) */
const einkFlashOn = async (p) => {
  await p.keyboard.press("Enter");
  if (!(await menuRow(p, "全刷").count())) await menuRow(p, "e-ink").click();
  if (!/每 10 页/.test(await menuRow(p, "全刷").locator("small").textContent())) await menuRow(p, "全刷").click();
  assert.match(await menuRow(p, "全刷").locator("small").textContent(), /每 10 页/);
  await p.keyboard.press("z"); await p.waitForSelector("#rd-sheet", { state: "hidden" });
};
/* the middle of the widest line box a piece of inline text covers (never the middle of its bounding box) */
const textSpot = (p, sel, text) => p.evaluate(({ sel, text }) => {
  const e = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(text));
  const rs = [...e.getClientRects()].filter((r) => r.width > 0);
  const r = rs.reduce((a, b) => (b.width > a.width ? b : a));
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, { sel, text });

test("reader: e-ink full refresh every 10 pages; the option shows only in e-ink mode", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await readerPage(t, { query: "?debug" });
  await openRow(p, 2);
  await p.waitForFunction(() => /Lewis Carroll/.test(document.getElementById("rd-flow").textContent));
  await p.keyboard.press("Enter");
  assert.equal(await menuRow(p, "全刷").count(), 0, "not without e-ink");
  await menuRow(p, "e-ink").click();
  assert.match(await menuRow(p, "全刷").locator("small").textContent(), /关/);
  await menuRow(p, "全刷").click();
  assert.match(await menuRow(p, "全刷").locator("small").textContent(), /每 10 页/);
  await p.keyboard.press("z"); await p.waitForSelector("#rd-sheet", { state: "hidden" });
  await flashHold(p);
  await flashClear(p);
  const turn = async () => {
    const was = await pos(p);
    await p.keyboard.press("ArrowRight");
    await p.waitForFunction((was) => document.getElementById("v-reader").getAttribute("data-pos") !== was, was);
  };
  for (let i = 0; i < 8; i++) await turn();
  assert.deepEqual(await flashLog(p), [], "eight turns: no full refresh");
  /* the ninth turn is page ten: the old page in negative, then paper, then the new page; a turn in between is ignored */
  const eighth = await pos(p), eighthFoot = (await foot(p)).split("/")[0];
  await p.keyboard.press("ArrowRight");
  await flashWait(p, 1);
  assert.deepEqual(await flashLog(p), ["invert"]);
  assert.equal(await pos(p), eighth, "the old page stays, in negative");
  assert.ok(await isNeg(p));
  await p.keyboard.press("ArrowRight");
  await flashWait(p, 2);
  assert.deepEqual(await flashLog(p), ["invert", "ignored"]);
  assert.equal(await pos(p), eighth);
  await flashStep(p); await flashWait(p, 3);
  assert.deepEqual(await flashLog(p), ["invert", "ignored", "paper"]);
  await flashStep(p); await flashWait(p, 4);
  assert.deepEqual(await flashLog(p), ["invert", "ignored", "paper", "page"]);
  assert.ok(await flashHidden(p));
  assert.ok(!(await isNeg(p)));
  const ninth = await pos(p);
  assert.notEqual(ninth, eighth, "one page on");
  assert.equal(+(await foot(p)).split("/")[0], +eighthFoot + 1, "advanced exactly one page");
  /* the contents jump flashes too */
  await wholeRefresh(p, async () => {
    await p.keyboard.press("Enter");
    await menuRow(p, "目录").click();
    await p.click("#rd-sheet .lcd-menu li:nth-child(3)");
  }, "contents");
  /* e-ink off: the option goes */
  await p.keyboard.press("Enter");
  await menuRow(p, "e-ink").click();
  assert.equal(await menuRow(p, "全刷").count(), 0);
  assert.deepEqual(errors, []);
});

test("reader: a notes-list jump, a link and B back from it are full refreshes", { skip, timeout: 90000 }, async (t) => {
  const { makeEpub } = await import("./book-fixtures.mjs");
  const { p, errors } = await readerPage(t, { query: "?debug" });
  /* a quote in Alice (as in the quote test), then e-ink + 全刷, turn away, jump back from the notes list */
  await openRow(p, 2);
  await p.keyboard.press("ArrowRight");
  await p.waitForFunction(() => /Rabbit-Hole/.test(document.getElementById("rd-foot").textContent));
  await p.keyboard.press("Shift");
  for (let i = 0; i < 4; i++) await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Shift");
  await p.keyboard.press("Enter");
  await p.waitForSelector("#rd-thought");
  await p.fill("#rd-thought", "心得。");
  await p.click("#rd-def .ck-a");
  await p.waitForFunction(() => /心得已存进记事本/.test(document.getElementById("toast").textContent));
  await einkFlashOn(p);
  await flashHold(p);
  const quoted = await pos(p);
  await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight");
  await p.waitForFunction((q) => document.getElementById("v-reader").getAttribute("data-pos") !== q, quoted);
  await wholeRefresh(p, async () => {
    await p.keyboard.press("Enter");
    await menuRow(p, "笔记").click();
    await p.click("#rd-sheet .rd-notes li");
  }, "notes list");
  assert.equal((await pos(p)).split(":")[0], quoted.split(":")[0], "back in the quote's chapter");
  assert.equal(await p.locator("#rd-flow u.hl").count() > 0, true, "the quote is on the page");

  /* a link in an EPUB, and B back */
  const filler = Array.from({ length: 30 }, (_, i) => `<p>Filler line ${i} to make the chapter run over several pages.</p>`).join("");
  const epub = makeEpub({ title: "Link Book", lang: "en", chapters: [
    { title: "One", html: '<h1>One</h1><p>See <a href="ch2.xhtml#far">the far place</a>.</p>' + filler },
    { title: "Two", html: '<h1>Two</h1>' + filler + '<p id="far">The far place is here.</p>' }] });
  await p.keyboard.press("z");                                  /* B: back to the shelf */
  await importBook(p, { name: "links.epub", mimeType: "application/epub+zip", buffer: Buffer.from(epub) });
  await openRow(p, 1);
  await p.waitForFunction(() => /the far place/.test(document.getElementById("rd-flow").textContent));
  await einkFlashOn(p);
  await flashHold(p);
  const before = await pos(p);
  const spot = await textSpot(p, "#rd-flow a.ln", "the far place");
  await wholeRefresh(p, () => p.touchscreen.tap(spot.x, spot.y), "link");
  assert.match(await p.textContent("#rd-foot"), /按 B 回到原处/);
  assert.notEqual(await pos(p), before);
  await wholeRefresh(p, () => p.keyboard.press("z"), "B back from the link");
  assert.equal(await pos(p), before);
  assert.deepEqual(errors, []);
});

test("reader: importing a font shows a busy hint, ignores a second import meanwhile, and clears it on success and on failure", { skip, timeout: 90000 }, async (t) => {
  const { fontFile } = await import("./font-fixture.mjs");
  /* FontFace.load waits at a gate the test opens; clicks on the hidden file input are counted */
  const { p, errors } = await readerPage(t, { init: () => {
    let open; window.__gate = null;
    window.__closeGate = () => { window.__gate = new Promise((r) => { open = r; }); };
    window.__openGate = () => { if (open) open(); window.__gate = null; };
    const load = FontFace.prototype.load;
    FontFace.prototype.load = function () { const g = window.__gate; return g ? g.then(() => load.call(this)) : load.call(this); };
    window.__clicks = 0;
    document.addEventListener("click", (e) => { if (e.target && e.target.id === "rd-fontfile") window.__clicks++; }, true);
  } });
  await openRow(p, 2);
  await p.waitForFunction(() => /Lewis Carroll/.test(document.getElementById("rd-flow").textContent));
  await p.keyboard.press("Enter");
  await menuRow(p, "字体").click();
  const hint = () => p.textContent("#rd-sheet ul.rd-fonts ~ p.hint");
  const normal = await hint();
  assert.doesNotMatch(normal, /导入中/);
  await p.evaluate(() => window.__closeGate());
  await p.setInputFiles("#rd-fontfile", fontFile("Gate Test.ttf", { advance: 900 }));
  await p.waitForFunction(() => /导入中/.test(document.querySelector("#rd-sheet p.hint").textContent));
  assert.match(await hint(), /导入中：Gate Test/);
  /* busy: a tap on the row and A do nothing */
  await p.locator("#rd-sheet ul.rd-fonts li", { hasText: "导入字体…" }).click();
  await p.keyboard.press("x");
  await p.waitForTimeout(150);
  assert.equal(await p.evaluate(() => window.__clicks), 0, "no file dialog while busy");
  assert.match(await hint(), /导入中/, "still busy");
  await p.evaluate(() => window.__openGate());
  await toastSays(p, /已导入字体 Gate Test/);
  assert.equal(await hint(), normal, "back to the explanation");
  /* a failed import clears it too (the gate is open) */
  await p.setInputFiles("#rd-fontfile", { name: "bad.ttf", mimeType: "font/ttf", buffer: Buffer.from("this is only text, not a font") });
  await toastSays(p, /^读不出这个字体/);
  assert.doesNotMatch(await hint(), /导入中/);
  /* and the row works again: A asks for a file */
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("x");
  assert.equal(await p.evaluate(() => window.__clicks), 1, "A opens the file dialog again");
  assert.deepEqual(errors, []);
});

/* ---------- sound: runtime/chip.js rendered offline, and the music's lifecycle in the runtime ---------- */

/* render with the chip into an OfflineAudioContext inside the page; returns peak, rms and the time of the last sound */
async function chipPage(t) {
  const { p, errors } = await page(t);
  await p.setContent("<!doctype html><html><body></body></html>");
  await p.addScriptTag({ content: await readFile(join(ROOT, "runtime/chip.js"), "utf8") });
  await p.addScriptTag({ content: await readFile(join(ROOT, "registry/apps/xiaoyuan/src/music.js"), "utf8") });
  await p.evaluate(() => {
    window.render = async (seconds, fn, gain = 1) => {
      const sr = 22050, oc = new OfflineAudioContext(1, Math.ceil(sr * seconds), sr);
      const out = oc.createGain(); out.gain.value = gain; out.connect(oc.destination);
      const chip = LopdaChip.create(oc, out, { offline: true, trace: true });
      fn(chip);
      const d = (await oc.startRendering()).getChannelData(0);
      let peak = 0, sum = 0, last = -1;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; if (a > 1e-4) last = i; }
      const at = (from, to) => { let m = 0; for (let i = Math.floor(from * sr); i < Math.min(d.length, to * sr); i++) m = Math.max(m, Math.abs(d[i])); return m; };
      return { peak, rms: Math.sqrt(sum / d.length), last: last / sr, chip, at };
    };
    window.song = (s, loop = false, until = 1e9) => (chip) => { const r = LopdaChip.parse(s); chip.play(r.song, { loop, at: 0 }); chip.pump(until); };
  });
  return { p, errors };
}

test("chip: every channel sounds, and a song lasts exactly as long as its bpm says", { skip }, async (t) => {
  const { p, errors } = await chipPage(t);
  const r = await p.evaluate(async () => {
    const out = {};
    for (const ch of ["p1", "p2", "tri"]) out[ch] = (await render(3, song({ bpm: 120, [ch]: "c d e f" }))).last;
    out.noise = (await render(3, song({ bpm: 120, noise: "x x x X" }))).last;
    out.slow = (await render(5, song({ bpm: 60, p1: "c d e f" }))).last;
    out.peak = (await render(3, song({ bpm: 120, p1: "c d e f" }))).peak;
    return out;
  });
  /* four quarter notes: 2 s at 120 bpm, 4 s at 60; the last note's few-ms edge ends right on the beat */
  for (const ch of ["p1", "p2", "tri"]) assert.ok(Math.abs(r[ch] - 2) < 0.01, ch + " ends at " + r[ch]);
  assert.ok(r.noise > 1.5 && r.noise < 2, "noise: the long hit on beat 4 rings, then stops: " + r.noise);
  assert.ok(Math.abs(r.slow - 4) < 0.01, "60 bpm ends at " + r.slow);
  assert.ok(r.peak > 0.02, "audible: " + r.peak);
  assert.deepEqual(errors, []);
});

test("chip: a looping song comes round again; music sits at about half a sound effect; volume 0 is silence", { skip }, async (t) => {
  const { p, errors } = await chipPage(t);
  const r = await p.evaluate(async () => {
    const loop = await render(5, song({ bpm: 120, p1: "c r r r" }, true, 5));
    const yard = await render(40, song(YARD_SONG));
    const fx = await render(1, (c) => c.sfx(LopdaChip.sfxParams({ ms: 400 })));
    const mute = await render(40, song(YARD_SONG), 0);
    const muteFx = await render(1, (c) => c.sfx(LopdaChip.sfxParams({ ms: 400 })), 0);
    return { loop: [loop.at(0, 0.5), loop.at(0.6, 1.9), loop.at(2, 2.5), loop.at(4, 4.5)], yardEnd: yard.last,
      ratio: yard.rms / fx.rms, mute: mute.peak, muteFx: muteFx.peak };
  });
  assert.ok(r.loop[0] > 0.02 && r.loop[1] === 0 && r.loop[2] > 0.02 && r.loop[3] > 0.02, "c at 0 s, 2 s and 4 s: " + r.loop);
  assert.ok(Math.abs(r.yardEnd - 40) < 0.05, "the yard tune is 40 s: " + r.yardEnd);
  assert.ok(r.ratio > 0.3 && r.ratio < 0.65, "the whole yard tune against one default effect, by rms: " + r.ratio);
  assert.equal(r.mute, 0); assert.equal(r.muteFx, 0);
  assert.deepEqual(errors, []);
});

test("chip: four music channels at most, two effects at most (a third cuts off the oldest)", { skip }, async (t) => {
  const { p, errors } = await chipPage(t);
  const r = await p.evaluate(async () => {
    const full = await render(4, song({ bpm: 120, p1: "l16 [c d e f]8", p2: "l8 [g a]8", tri: "o2 c1 c1", noise: "l16 [x]32" }));
    const counts = []; for (let s = 0; s < 4; s += 0.01) counts.push(full.chip.voices(s).music);
    const tone = { wave: "square", from: 440, ms: 600, attack: 0, decay: 0, vol: 1 };
    const one = await render(1, (c) => c.sfx(LopdaChip.sfxParams(tone)));
    const three = await render(1, (c) => { c.sfx(LopdaChip.sfxParams(tone)); c.sfx(LopdaChip.sfxParams(tone)); c.sfx(LopdaChip.sfxParams(tone)); });
    return { max: Math.max(...counts), atStart: full.chip.voices(0.001).music, fx: three.chip.voices(0.1).sfx,
      ratio: three.at(0.1, 0.5) / one.at(0.1, 0.5) };
  });
  assert.equal(r.max, 4); assert.equal(r.atStart, 4);
  assert.equal(r.fx, 2);
  /* three identical tones in step: with two voices the wave is twice as high, not three times */
  assert.ok(Math.abs(r.ratio - 2) < 0.05, "ratio " + r.ratio);
  assert.deepEqual(errors, []);
});

/* The ten named sounds (and the runtime's own) as core.js played them before runtime 0.11.0, verbatim. At the default
   volume the runtime's own sounds must render the same, sample for sample up to float rounding (since 0.12.0 they go
   through two gains, 0.44 x 0.25, where there was one of 0.11). */
const LEGACY_SFX = `(function(ac, out){
  function tone(freq,start,dur,type,level){
    var o=ac.createOscillator(), g=ac.createGain(), t=ac.currentTime+start;
    o.type=type||"square"; o.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(level||1,t+0.004); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t+dur+0.02);
  }
  function noise(start,dur,level){
    var n=Math.floor(ac.sampleRate*dur), buf=ac.createBuffer(1,n,ac.sampleRate), ch=buf.getChannelData(0);
    for(var i=0;i<n;i++) ch[i]=(Math.random()*2-1)*(1-i/n);
    var src=ac.createBufferSource(), g=ac.createGain(), t=ac.currentTime+start; src.buffer=buf;
    g.gain.setValueAtTime(level||1,t); src.connect(g); g.connect(out); src.start(t);
  }
  return {
    tap:function(){ tone(1400,0,0.03,"square",0.5); },
    home:function(){ tone(660,0,0.06); tone(990,0.06,0.08); },
    shutter:function(){ noise(0,0.05,0.9); tone(180,0.0,0.05,"square",0.6); noise(0.09,0.04,0.6); },
    ok:function(){ tone(523,0,0.07); tone(659,0.07,0.07); tone(784,0.14,0.12); },
    err:function(){ tone(196,0,0.12); tone(147,0.12,0.18); },
    modem:function(){ for(var i=0;i<6;i++) tone(i%2?2100:1200,i*0.05,0.045,"square",0.35); },
    tick:function(){ tone(2400,0,0.012,"square",0.25); },
    move:function(){ tone(880,0,0.025,"square",0.3); },
    hit:function(){ noise(0,0.07,1); tone(98,0,0.09,"square",0.9); },
    miss:function(){ tone(330,0,0.05,"triangle",0.8); tone(220,0.05,0.08,"triangle",0.7); },
    coin:function(){ tone(988,0,0.06,"square",0.5); tone(1319,0.06,0.16,"square",0.5); },
    win:function(){ [523,659,784,1047].forEach(function(f,i){ tone(f,i*0.09,i===3?0.25:0.09,"square",0.6); }); },
    lose:function(){ [392,330,262,196].forEach(function(f,i){ tone(f,i*0.14,i===3?0.3:0.13,"triangle",0.9); }); }
  };
})`;

test("chip: the named sounds render as before runtime 0.11.0", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t);
  /* every AudioContext the runtime makes is an OfflineAudioContext we can render; Math.random is seeded per sound */
  await p.addInitScript(() => {
    window.AudioContext = function () { const oc = new OfflineAudioContext(1, 44100, 44100); oc.resume = () => Promise.resolve(); window.lastCtx = oc; return oc; };
    window.seed = (s) => { Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; };
  });
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LP && window.LP.sfx);
  const same = await p.evaluate(async (legacySrc) => {
    const legacy = eval(legacySrc), out = {};
    const same = (a, b) => { let peak = 0, diff = 0; for (let i = 0; i < a.length; i++) { peak = Math.max(peak, Math.abs(a[i])); diff = Math.max(diff, Math.abs(a[i] - b[i])); } return peak > 0 && diff < 1e-6; };
    for (const name of ["tap", "home", "shutter", "ok", "err", "modem", "tick", "move", "hit", "miss", "coin", "win", "lose"]) {
      LP.SND.ctx = null; LP.SND.vol = 2;
      seed(7); LP.sfx(name);
      const now = (await lastCtx.startRendering()).getChannelData(0);
      const oc = new OfflineAudioContext(1, 44100, 44100), g = oc.createGain(); g.gain.value = 0.11; g.connect(oc.destination);
      seed(7); legacy(oc, g)[name]();
      const before = (await oc.startRendering()).getChannelData(0);
      out[name] = same(now, before);
    }
    return out;
  }, LEGACY_SFX);
  for (const [name, ok] of Object.entries(same)) assert.ok(ok, name);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

/* what the chip's host reports when nothing sounds and nothing waits */
const QUIET = { playing: false, waiting: false, paused: false, ambience: null, level: 0, ambienceWaiting: false };

/* run an app in the runtime the way the store does, from its HTML */
async function runInRuntime(p, id, html, extra = {}) {
  await p.evaluate(({ id, html, extra }) => LP.runApp(Object.assign({ id, name: id, version: "t", spec: "lopda/1", buttons: true, permissions: [], html }, extra)), { id, html, extra });
}

test("music: starts on the first key, stops on HOME and when another app starts, waits through the sound switch", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  /* Playwright's evaluate counts as a user gesture; this page should look as if nobody has touched it yet */
  await p.addInitScript(() => Object.defineProperty(navigator, "userActivation", { value: { hasBeenActive: false, isActive: false } }));
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  const state = () => p.evaluate(() => LP.chip.state());
  const until = async (fn, what) => { for (let i = 0; i < 100; i++) { if (fn(await state())) return; await p.waitForTimeout(50); } assert.fail("timed out waiting for " + what); };
  const yard = await readFile(join(ROOT, "registry/apps/xiaoyuan/index.html"), "utf8");
  await runInRuntime(p, "xiaoyuan", yard);
  /* the title asks for the tune at once; nobody has touched anything yet, so it waits */
  await until((s) => s.waiting, "the tune to be held");
  assert.equal((await state()).playing, false);
  await p.keyboard.press("x");
  await until((s) => s.playing && !s.waiting, "the tune to start on the first key");
  assert.equal(await p.evaluate(() => LP.SND.ctx.state), "running");
  await p.click("#home-key");
  assert.deepEqual(await state(), QUIET);
  /* again, then switch straight to another app */
  await runInRuntime(p, "xiaoyuan", yard);
  await until((s) => s.playing, "the tune to start again (audio is unlocked now)");
  await runInRuntime(p, "quiet", "<!doctype html><html><body>quiet</body></html>");
  assert.deepEqual(await state(), QUIET);
  /* at volume 0 (off) the song keeps going, silently */
  await p.evaluate(() => { LP.SND.vol = 0; });
  await runInRuntime(p, "xiaoyuan", yard);
  await until((s) => s.playing, "the tune under the sound switch");
  assert.equal(await p.evaluate(() => LP.SND.gain.gain.value), 0);
  await p.click("#home-key");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("sound: a context the phone stopped is woken or replaced on the next touch, and the song goes on from where it was", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  const yard = await readFile(join(ROOT, "registry/apps/xiaoyuan/index.html"), "utf8");
  await runInRuntime(p, "xiaoyuan", yard);
  await p.keyboard.press("x");
  await p.waitForFunction(() => LP.chip.state().playing && LP.chip.beat() > 2);
  /* a check found it dead (its clock stood still): the next key replaces it, inside the key press */
  const before = await p.evaluate(() => { window.oldCtx = LP.SND.ctx; LP.SND.stale = true; return LP.chip.beat(); });
  await p.keyboard.press("ArrowUp");
  assert.equal(await p.evaluate(() => LP.SND.ctx !== window.oldCtx && window.oldCtx.state === "closed"), true, "a new context");
  assert.equal(await p.evaluate(() => LP.chip.state().playing), true);
  const after = await p.evaluate(() => LP.chip.beat());
  assert.ok(after >= before - 0.5 && after < before + 2, "the song went on from beat " + before + ", not from the start (" + after + ")");
  /* stuck: it will not resume (as after a podcast hands the audio back). The touch tries, the check marks it, the next one replaces it */
  await p.evaluate(async () => { await LP.SND.ctx.suspend(); LP.SND.ctx.resume = () => Promise.resolve(); window.oldCtx = LP.SND.ctx; });
  await p.keyboard.press("ArrowDown");
  await p.waitForFunction(() => LP.SND.stale === true, null, { timeout: 2000 });
  await p.keyboard.press("ArrowDown");
  assert.equal(await p.evaluate(() => LP.SND.ctx !== window.oldCtx && LP.chip.state().playing), true);
  await p.waitForFunction(() => LP.SND.ctx.state === "running");
  /* a merely suspended one is just woken: same context */
  await p.evaluate(async () => { await LP.SND.ctx.suspend(); window.oldCtx = LP.SND.ctx; });
  await p.keyboard.press("ArrowUp");
  await p.waitForFunction(() => LP.SND.ctx.state === "running");
  assert.equal(await p.evaluate(() => LP.SND.ctx === window.oldCtx), true);
  await p.click("#home-key");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("sound: one volume with five steps; an old 'sound off' setting becomes volume 0", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  await p.evaluate(() => LP.put(LP.S.refs.settings, { sound: false, volume: 2, lang: "zh" }));
  await p.reload({ waitUntil: "load" });
  await p.waitForFunction(() => window.LP && window.LP.S.db && LP.SND.vol === 0);
  await p.evaluate(() => LP.builtins.find((b) => b.id === "settings").open());
  assert.equal(await p.textContent("#set-vol"), "关");
  assert.equal(await p.isDisabled("#set-vol-down"), true);
  for (let i = 0; i < 4; i++) await p.click("#set-vol-up");
  assert.equal(await p.textContent("#set-vol"), "▮▮▮▮");
  assert.equal(await p.isDisabled("#set-vol-up"), true);
  assert.ok(Math.abs(await p.evaluate(() => LP.SND.gain.gain.value) - 0.6) < 1e-6, "step 4 is the loudest");
  const saved = await p.evaluate(() => LP.S.refs.settings.get().then((s) => s.data()));
  assert.equal(saved.volume, 4); assert.equal(saved.sound, true);
  assert.equal(await p.$("#set-sound"), null);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("music: a score with a mistake is shown in the error box, with its column; custom sounds and the rate limit", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  await runInRuntime(p, "bad", '<!doctype html><html><body><script>PAD.music.play({ p1: "c d q" });</script></body></html>');
  await p.waitForSelector("#run-err:not([hidden])");
  assert.equal(await p.textContent("#run-err-msg"), "乐谱有误，没有播放：p1:5: unknown command 'q'");
  assert.equal((await p.evaluate(() => LP.chip.state())).waiting, false);
  /* five plays in a row: the fifth is dropped quietly; custom sounds go through the same 20-a-second limit as named ones */
  await p.evaluate(() => { window.played = 0; const m = LP.chip.music; LP.chip.music = function (d) { const r = m.call(this, d); if (!r && d.action === "play") played++; return r; };
    window.fx = 0; const s = LP.sfxCustom; LP.sfxCustom = function (x) { fx++; return s.call(this, x); }; });
  await runInRuntime(p, "many", '<!doctype html><html><body><script>for (var i = 0; i < 5; i++) PAD.music.play({ p1: "c" }); for (i = 0; i < 25; i++) PAD.sfx({ from: 200 + i });</script></body></html>');
  await p.waitForTimeout(400);
  assert.deepEqual(await p.evaluate(() => [played, fx]), [4, 20]);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("music in the dev harness: the yard's tune waits for a key, then plays; a reload stops it and the new run starts it again", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.addInitScript(() => Object.defineProperty(navigator, "userActivation", { value: { hasBeenActive: false, isActive: false } }));
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/xiaoyuan`, { waitUntil: "load" });
  await p.waitForFunction(() => /music play/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  assert.match(await p.textContent("#log"), /music play, looping \(waits for a touch or key, as on the handheld\)/);
  await p.keyboard.press("x");
  await p.waitForFunction(() => chip.state().playing);
  await p.evaluate(() => { window.stops = 0; const s = chip.stop; chip.stop = function () { stops++; return s.apply(this, arguments); }; });
  await p.click("#reload");
  await p.waitForFunction(() => (document.getElementById("log").textContent.match(/music play/g) || []).length === 2);
  assert.equal(await p.evaluate(() => stops), 1);
  assert.equal(await p.evaluate(() => chip.state().playing), true, "audio is unlocked now: the new run plays at once");
  assert.doesNotMatch(await p.textContent("#log"), /ERROR/);
  assert.deepEqual(errors, []);
});

/* ---------- ambience (PAD.ambience) and vibrato: runtime/chip.js rendered offline, and the runtime's lifecycle ---------- */

/* in the page: amb(seconds, fn) renders with the chip at 22.05 kHz; fn(chip, oc) may schedule changes with at(t, f) */
async function ambPage(t) {
  const { p, errors } = await chipPage(t);
  await p.evaluate(() => {
    const sr = 22050;
    window.SR = sr;
    window.amb = async (seconds, fn) => {
      const oc = new OfflineAudioContext(1, Math.ceil(sr * seconds), sr);
      const chip = LopdaChip.create(oc, oc.destination, { offline: true });
      const at = (time, f) => oc.suspend(time).then(() => { f(chip); chip.pump(seconds); oc.resume(); });
      fn(chip, at);
      chip.pump(seconds);
      return (await oc.startRendering()).getChannelData(0);
    };
    /* statistics of d[from s .. to s] */
    window.stats = (d, from = 0, to = d.length / sr) => {
      const a = Math.floor(from * sr), b = Math.min(d.length, Math.floor(to * sr)), n = b - a;
      let sum = 0, peak = 0, zc = 0, step = 0, low = 0, lp = 0;
      for (let i = a; i < b; i++) {
        const x = d[i]; sum += x * x; peak = Math.max(peak, Math.abs(x));
        if (i > a) { if ((x >= 0) !== (d[i - 1] >= 0)) zc++; step = Math.max(step, Math.abs(x - d[i - 1])); }
        lp += (x - lp) * 0.08; low += lp * lp;               /* a one-pole low-pass near 300 Hz */
      }
      const rms = Math.sqrt(sum / n);
      /* how much the loudness moves: the spread of 100 ms windows; and how spiky it is: 5 ms windows over 4x the rms */
      const win = (w) => { const out = []; for (let i = a; i + w <= b; i += w) { let s = 0; for (let k = i; k < i + w; k++) s += d[k] * d[k]; out.push(Math.sqrt(s / w)); } return out; };
      const env = win(Math.round(sr * 0.1)), m = env.reduce((x, y) => x + y, 0) / env.length;
      const cv = Math.sqrt(env.reduce((x, y) => x + (y - m) ** 2, 0) / env.length) / m;
      /* crackle: 5 ms windows of the change from sample to sample (the high end) over 4x its rms, per second */
      const dd = new Float32Array(n); for (let i = a + 1; i < b; i++) dd[i - a] = d[i] - d[i - 1];
      let ds = 0; for (let i = 0; i < n; i++) ds += dd[i] * dd[i];
      const drms = Math.sqrt(ds / n), w5 = Math.round(sr * 0.005);
      let spikes = 0; for (let i = 0; i + w5 <= n; i += w5) { let s = 0; for (let k = i; k < i + w5; k++) s += dd[k] * dd[k]; if (Math.sqrt(s / w5) > 4 * drms) spikes++; }
      spikes /= n / sr;
      return { rms, peak, step, zcr: zc / (n / sr), cv, spikes, low: low / sum, env };
    };
  });
  return { p, errors };
}

test("ambience: six presets, each audible and each its own; the same every time; level 0 is silence; under the music", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await ambPage(t);
  const r = await p.evaluate(async () => {
    const out = {};
    for (const n of LopdaChip.AMBIENCES) {
      const d = await amb(24, (c) => c.ambience(n, 1));
      const s = stats(d, 2, 24);
      out[n] = { rms: s.rms, zcr: s.zcr, cv: s.cv, spikes: s.spikes, low: s.low };
      out[n].mute = stats(await amb(3, (c) => c.ambience(n, 0))).peak;
    }
    const again = await amb(3, (c) => c.ambience("rain", 1)), first = await amb(3, (c) => c.ambience("rain", 1));
    out.same = again.every((x, i) => x === first[i]);
    /* waves: count the crests of 40 seconds, from the loudness in half-second steps */
    const w = stats(await amb(42, (c) => c.ambience("waves", 1)), 2, 42).env;
    const half = []; for (let i = 0; i + 5 <= w.length; i += 5) half.push(w.slice(i, i + 5).reduce((x, y) => x + y, 0) / 5);
    const mid = (Math.max(...half) + Math.min(...half)) / 2;
    let crests = 0; for (let i = 1; i < half.length; i++) if (half[i - 1] < mid && half[i] >= mid) crests++;
    out.crests = crests;
    /* the yard's tune through the same output, start to end */
    const yard = await render(40, song(YARD_SONG));
    out.yard = yard.rms;
    return out;
  });
  const names = ["rain", "waves", "waterfall", "wind", "fire", "stream"];
  t.diagnostic(JSON.stringify(r));
  for (const n of names) {
    assert.ok(r[n].rms > 0.01, n + " is audible: " + r[n].rms);
    assert.equal(r[n].mute, 0, n + " at level 0");
    /* §5: under the music, with room to spare */
    assert.ok(r[n].rms < 0.7 * r.yard, `${n} (${r[n].rms}) is under the yard's tune (${r.yard})`);
  }
  assert.ok(r.same, "seeded, not Math.random: two renders are the same sample for sample");
  /* every two presets differ by at least a third in at least one measure: brightness (zero crossings), movement
     (loudness spread), crackle (spikes a second) or weight (share of the energy below about 300 Hz) */
  const apart = (a, b) => Math.max(a, b) / Math.max(1e-9, Math.min(a, b));
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = r[names[i]], b = r[names[j]];
    const d = Math.max(apart(a.zcr, b.zcr), apart(a.cv, b.cv), apart(a.spikes + 0.5, b.spikes + 0.5), apart(a.low, b.low));
    assert.ok(d > 1.33, `${names[i]} and ${names[j]} are too alike: ${JSON.stringify([a, b])}`);
  }
  /* the character each was made for */
  assert.ok(r.rain.zcr > r.waterfall.zcr && r.rain.cv < 0.15, "rain: bright and even");
  assert.ok(r.waves.cv > 0.35, "waves come and go: " + r.waves.cv);
  assert.ok(r.crests >= 4 && r.crests <= 7, "a wave every 6-10 s: " + r.crests + " in 40 s");
  assert.ok(r.waterfall.cv < 0.12 && r.waterfall.low > r.rain.low, "waterfall: steady and thick");
  assert.ok(r.wind.cv > 0.15, "wind: gusts");
  assert.ok(r.fire.spikes > 3 * (r.rain.spikes + 0.5) && r.fire.spikes > 2, "fire: crackles " + r.fire.spikes);
  assert.ok(r.stream.zcr > r.wind.zcr && r.stream.low < r.waterfall.low, "stream: light and high");
  assert.deepEqual(errors, []);
});

test("ambience: a new preset or level fades in about a second, with no gap and no jump; null fades out", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await ambPage(t);
  const r = await p.evaluate(async () => {
    const steady = {};
    for (const [n, l] of [["rain", 0.6], ["waves", 0.8], ["rain", 0.9], ["fire", 0.7], ["wind", 0.5]]) steady[n + l] = stats(await amb(24, (c) => c.ambience(n, l)), 1.5, 24);
    const max = (...ks) => ({ peak: Math.max(...ks.map((k) => steady[k].peak)), step: Math.max(...ks.map((k) => steady[k].step)), rms: Math.min(...ks.map((k) => steady[k].rms)) });
    const out = {};
    /* rain, then waves at 3 s */
    let d = await amb(6, (c, at) => { c.ambience("rain", 0.6); at(3, (c) => c.ambience("waves", 0.8)); });
    out.cross = { during: stats(d, 3, 4.1), ref: max("rain0.6", "waves0.8"), dips: [] };
    for (let s = 3; s < 3.8; s += 0.02) out.cross.dips.push(stats(d, s, s + 0.02).rms);
    out.cross.before = stats(d, 2, 3).rms;
    delete out.cross.during.env;
    /* the same preset, louder */
    d = await amb(6, (c, at) => { c.ambience("rain", 0.3); at(3, (c) => c.ambience("rain", 0.9)); });
    out.louder = { during: stats(d, 3, 4.5), ref: max("rain0.9"), early: stats(d, 3, 3.1).rms, late: stats(d, 4.2, 5).rms };
    delete out.louder.during.env;
    /* fire to wind, and away */
    d = await amb(7, (c, at) => { c.ambience("fire", 0.7); at(2.5, (c) => c.ambience("wind", 0.5)); at(4.5, (c) => c.ambience(null)); });
    out.fw = { during: stats(d, 2.5, 3.6), ref: max("fire0.7", "wind0.5") };
    delete out.fw.during.env;
    out.fading = stats(d, 4.6, 5.2).rms; out.after = stats(d, 5.6, 7).peak;
    return out;
  });
  t.diagnostic(JSON.stringify({ cross: [r.cross.during.peak, r.cross.ref], louder: [r.louder.during.peak, r.louder.ref], fw: [r.fw.during.peak, r.fw.ref] }));
  for (const k of ["cross", "louder", "fw"]) {
    assert.ok(r[k].during.peak <= 1.2 * r[k].ref.peak, `${k}: peak ${r[k].during.peak} against ${r[k].ref.peak} when steady`);
    assert.ok(r[k].during.step <= 1.2 * r[k].ref.step, `${k}: the biggest step between samples ${r[k].during.step} against ${r[k].ref.step}`);
  }
  /* no gap: the crossfade never drops far below what was playing */
  assert.ok(Math.min(...r.cross.dips) > 0.3 * r.cross.before, "no gap: " + Math.min(...r.cross.dips) + " of " + r.cross.before);
  assert.ok(r.louder.late > 2 * r.louder.early, `a level change ramps, it does not jump: ${r.louder.early} in the first 0.1 s, ${r.louder.late} after it`);
  assert.ok(r.fading > 0.01, "null fades, not cuts: " + r.fading);
  assert.equal(r.after, 0, "and then it is silent");
  assert.deepEqual(errors, []);
});

test("vibrato: the pitch wobbles by the depth, at the rate; depth 0 is the sound without it", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await ambPage(t);
  const r = await p.evaluate(async () => {
    const fx = (o) => amb(1.2, (c) => c.sfx(LopdaChip.sfxParams(Object.assign({ wave: "triangle", from: 440, ms: 1000, attack: 0, decay: 0, vol: 1 }, o))));
    /* the pitch between rising zero crossings, as a list of Hz */
    const pitch = (d) => { const f = [], cross = []; for (let i = 1; i < 0.95 * SR; i++) if (d[i - 1] < 0 && d[i] >= 0) cross.push(i - d[i] / (d[i] - d[i - 1])); for (let i = 1; i < cross.length; i++) f.push(SR / (cross[i] - cross[i - 1])); return f.slice(5); };
    const plain = await fx({}), zero = await fx({ vibrato: { depth: 0, rate: 9 } }), one = await fx({ vibrato: { depth: 1, rate: 5 } });
    const fp = pitch(plain), f1 = pitch(one);
    /* rate: how often the pitch passes 440 Hz going up */
    let ups = 0; for (let i = 1; i < f1.length; i++) if (f1[i - 1] < 440 && f1[i] >= 440) ups++;
    const noiseA = await amb(0.6, (c) => c.sfx(LopdaChip.sfxParams({ wave: "noise", from: 2000, ms: 500 })));
    const noiseB = await amb(0.6, (c) => c.sfx(LopdaChip.sfxParams({ wave: "noise", from: 2000, ms: 500, vibrato: { depth: 2, rate: 10 } })));
    return { same: plain.every((x, i) => x === zero[i]), plainSpread: Math.max(...fp) / Math.min(...fp), lo: Math.min(...f1), hi: Math.max(...f1), ups,
      noiseDiffers: noiseA.some((x, i) => Math.abs(x - noiseB[i]) > 1e-3) };
  });
  assert.ok(r.same, "depth 0 renders the sound without vibrato");
  assert.ok(r.plainSpread < 1.005, "a steady pitch: " + r.plainSpread);
  /* one semitone either way: 440 / 2^(1/12) .. 440 * 2^(1/12) = 415 .. 466 Hz */
  assert.ok(r.lo > 405 && r.lo < 422 && r.hi > 458 && r.hi < 476, `pitch ${r.lo} to ${r.hi}`);
  assert.ok(r.ups >= 4 && r.ups <= 6, "5 Hz for about a second: " + r.ups);
  assert.ok(r.noiseDiffers, "the noise channel takes vibrato too");
  assert.deepEqual(errors, []);
});

test("ambience: waits for the first key, stops on HOME and another app, keeps the last call over the rate, goes on in a rebuilt context", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  await p.addInitScript(() => Object.defineProperty(navigator, "userActivation", { value: { hasBeenActive: false, isActive: false } }));
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  const state = () => p.evaluate(() => LP.chip.state());
  const until = async (fn, what) => { for (let i = 0; i < 100; i++) { if (fn(await state())) return; await p.waitForTimeout(50); } assert.fail("timed out waiting for " + what + ": " + JSON.stringify(await state())); };
  const rainy = '<!doctype html><html><body><script>PAD.ambience("rain", 0.6);</script></body></html>';
  await runInRuntime(p, "rainy", rainy);
  await until((s) => s.ambienceWaiting, "the rain to be held");
  assert.equal((await state()).ambience, null);
  await p.keyboard.press("x");
  await until((s) => s.ambience === "rain" && !s.ambienceWaiting, "the rain to start on the first key");
  assert.equal((await state()).level, 0.6);
  assert.equal(await p.evaluate(() => LP.SND.ctx.state), "running");
  await p.click("#home-key");
  assert.deepEqual(await state(), QUIET);
  /* again (audio is unlocked now, it starts at once), then straight to another app */
  await runInRuntime(p, "rainy", rainy);
  await until((s) => s.ambience === "rain", "the rain again");
  await runInRuntime(p, "quiet", "<!doctype html><html><body>quiet</body></html>");
  assert.deepEqual(await state(), QUIET);
  /* six calls at once: four go through, the newest of the other two plays a moment later */
  await runInRuntime(p, "busy", '<!doctype html><html><body><script>[0.1, 0.2, 0.3, 0.4].forEach(function (l) { PAD.ambience("rain", l); }); PAD.ambience("wind", 0.5); PAD.ambience("fire", 0.7);</script></body></html>');
  await until((s) => s.ambience === "rain" && s.level === 0.4, "the fourth call");
  await until((s) => s.ambience === "fire" && s.level === 0.7, "the newest held call, a second later");
  /* an unknown preset goes to the error box; nothing changes */
  await runInRuntime(p, "bad", '<!doctype html><html><body><script>PAD.ambience("thunder", 1);</script></body></html>');
  await p.waitForSelector("#run-err:not([hidden])");
  assert.match(await p.textContent("#run-err-msg"), /^没有这种环境声：unknown ambience "thunder"/);
  /* a context found dead is replaced on the next key: same preset, same level, in the new context */
  await runInRuntime(p, "rainy", rainy);
  await until((s) => s.ambience === "rain", "the rain for the rebuild");
  await p.evaluate(() => { window.oldCtx = LP.SND.ctx; LP.SND.stale = true; });
  await p.keyboard.press("ArrowUp");
  assert.equal(await p.evaluate(() => LP.SND.ctx !== window.oldCtx && window.oldCtx.state === "closed"), true, "a new context");
  assert.deepEqual([(await state()).ambience, (await state()).level], ["rain", 0.6]);
  /* suspended and stuck (as after a podcast hands the audio back): the key tries, the check marks it, the next key rebuilds */
  await p.evaluate(async () => { await LP.SND.ctx.suspend(); LP.SND.ctx.resume = () => Promise.resolve(); window.oldCtx = LP.SND.ctx; });
  await p.keyboard.press("ArrowDown");
  await p.waitForFunction(() => LP.SND.stale === true, null, { timeout: 2000 });
  await p.keyboard.press("ArrowDown");
  assert.equal(await p.evaluate(() => LP.SND.ctx !== window.oldCtx), true);
  await p.waitForFunction(() => LP.SND.ctx.state === "running");
  assert.deepEqual([(await state()).ambience, (await state()).level], ["rain", 0.6]);
  /* the new context really makes the rain: something reaches the master */
  const heard = await p.evaluate(() => new Promise((res) => {
    const a = LP.SND.ctx.createAnalyser(); LP.SND.gain.connect(a); const buf = new Float32Array(a.fftSize);
    setTimeout(() => { a.getFloatTimeDomainData(buf); res(Math.max(...buf.map(Math.abs))); }, 1300);
  }));
  assert.ok(heard > 0.001, "rain in the rebuilt context: " + heard);
  /* hidden page: held; shown: going again */
  await p.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await until((s) => s.paused, "the page's pause");
  await p.evaluate(() => { Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await until((s) => !s.paused, "back");
  /* at volume 0 it keeps going, silently */
  await p.evaluate(() => { LP.SND.vol = 0; LP.applyLevel(); });
  assert.equal((await state()).ambience, "rain");
  await p.click("#home-key");
  assert.deepEqual(await state(), QUIET);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("ambience in the dev harness: the rain station's rain waits for a key; the row on the right tries every preset", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.addInitScript(() => Object.defineProperty(navigator, "userActivation", { value: { hasBeenActive: false, isActive: false } }));
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/rain-station`, { waitUntil: "load" });
  await p.waitForFunction(() => /ambience rain/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  assert.match(await p.textContent("#log"), /ambience rain 0\.40 \(waits for a touch or key, as on the handheld\)/);
  assert.equal(await p.inputValue("#amb"), "rain");
  await p.keyboard.press("ArrowLeft");   /* a key the title does not use */
  await p.waitForFunction(() => chip.state().ambience === "rain");
  for (const n of ["waves", "waterfall", "wind", "fire", "stream"]) {
    await p.selectOption("#amb", n);
    await p.waitForFunction((n) => chip.state().ambience === n, n);
    await p.waitForTimeout(300);   /* four calls a second */
  }
  await p.selectOption("#amb", "");
  await p.waitForFunction(() => chip.state().ambience === null);
  assert.match(await p.textContent("#log"), /\(by hand\) ambience off/);
  assert.doesNotMatch(await p.textContent("#log"), /ERROR/, await p.textContent("#log"));
  assert.deepEqual(errors, []);
});

/* camera lenses (docs/decisions.md section 4): Chromium's fake camera is one unnamed device, so the camera keeps
   the plain back/front pair; a faked device list stands in for an iPhone's four cameras */
async function camPage(t, init, arg) {
  const cam = await pw.chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  t.after(() => cam.close());
  const ctx = await cam.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", reducedMotion: "reduce", serviceWorkers: "block", permissions: ["camera"] });
  if (init) await ctx.addInitScript(init, arg);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const open = async () => {
    await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
    await p.waitForFunction(() => document.getElementById("savestate").textContent !== "启动中…", null, { timeout: 8000 });
    await p.locator("#home .app", { has: p.locator(".label", { hasText: /^点阵相机$/ }) }).click();
  };
  const tag = (text) => p.waitForFunction((text) => { const el = document.getElementById("cam-live-tag"); return !el.hidden && el.textContent === text; }, text, { timeout: 10000 });
  const select = async (text) => { await p.keyboard.press("Shift"); await tag(text); await p.waitForFunction(() => document.getElementById("cam-shut").hidden); };
  return { p, errors, open, tag, select };
}

/* stands in for Safari: enumerateDevices lists the cameras, getUserMedia records what was opened and gives the track the
   capabilities of the camera asked for (Chromium's fake device has no zoom or focus distance) */
function fakeCameras({ list, caps }) {
  const md = navigator.mediaDevices, real = md.getUserMedia.bind(md);
  window.__opened = [];
  md.enumerateDevices = async () => list.map(([deviceId, label]) => ({ deviceId, groupId: deviceId, kind: "videoinput", label }));
  md.getUserMedia = async (c) => {
    const id = (c.video.deviceId && c.video.deviceId.exact) || c.video.facingMode;
    window.__opened.push(id);
    const s = await real({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    if (caps && caps[id]) s.getVideoTracks()[0].getCapabilities = () => caps[id];
    return s;
  };
}
const IPHONE = [["front", "Front Camera"], ["dualwide", "Back Dual Wide Camera"], ["ultrawide", "Back Ultra Wide Camera"], ["wide", "Back Camera"]];

test("camera: one unnamed camera keeps the back/front pair, SELECT flips between them", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, open, tag, select } = await camPage(t);
  await open();
  await p.waitForSelector("#cam-load:not([hidden])"); await p.click("#roll-go");
  await tag("LIVE 后置");
  await select("LIVE 前置");
  await select("LIVE 后置");
  await p.keyboard.press("Enter"); await p.waitForSelector("#cam-menu:not([hidden])");
  assert.match(await p.textContent("#menu-list"), /换镜头后置/);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera: an iPhone's cameras, SELECT goes 13mm, 26mm, front; the virtual camera is never opened; the lens is remembered", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, open, tag, select } = await camPage(t, fakeCameras, { list: IPHONE });
  const last = () => p.evaluate(() => window.__opened[window.__opened.length - 1]);
  await open();
  await p.waitForSelector("#cam-load:not([hidden])"); await p.click("#roll-go");
  await tag("LIVE 26mm"); assert.equal(await last(), "wide", "the main camera by default");
  await select("LIVE 前置"); assert.equal(await last(), "front");
  await select("LIVE 13mm"); assert.equal(await last(), "ultrawide");
  await select("LIVE 26mm"); assert.equal(await last(), "wide");
  await select("LIVE 前置"); await select("LIVE 13mm");
  await p.click("#cam-shutter"); await p.waitForFunction(() => document.getElementById("cam-shut").hidden);
  assert.ok(!(await p.evaluate(() => window.__opened)).includes("dualwide"), "Back Dual Wide is never used");
  /* the frame records its lens, the film doc the lens to start with next time */
  const doc = (path) => p.evaluate((path) => new Promise((resolve, reject) => {
    const req = indexedDB.open("lopda");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const get = req.result.transaction("docs").objectStore("docs").get(path);
      get.onsuccess = () => { req.result.close(); resolve(get.result ? get.result.data : null); }; get.onerror = () => reject(get.error); };
  }), path);
  await p.waitForTimeout(1200);
  const film = await doc("data/users/local/film");
  assert.equal(film.lens, "uw");
  assert.equal((await doc("data/users/local/frames/items/" + film.roll + "-01")).lens, "uw");
  await open();
  await tag("LIVE 13mm"); assert.equal(await last(), "ultrawide", "a reopened camera starts on the last lens");
  await p.keyboard.press("Enter"); await p.waitForSelector("#cam-menu:not([hidden])");
  assert.match(await p.textContent("#menu-list"), /换镜头13mm/);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera: names in another language, capabilities only on the tracks: each camera is opened once to read them", { skip, timeout: 60000 }, async (t) => {
  const list = [["front", "Avant"], ["dualwide", "Arriere double grand angle"], ["ultrawide", "Arriere ultra grand angle"], ["wide", "Arriere"]];
  const caps = { front: { facingMode: ["user"] }, dualwide: { facingMode: ["environment"], zoom: { min: 0.5, max: 10 }, focusDistance: { min: 0.02 } },
    ultrawide: { facingMode: ["environment"], zoom: { min: 1, max: 5 }, focusDistance: { min: 0.02 } }, wide: { facingMode: ["environment"], zoom: { min: 1, max: 5 }, focusDistance: { min: 0.15 } } };
  const { p, errors, open, tag, select } = await camPage(t, fakeCameras, { list, caps });
  await open();
  await p.waitForSelector("#cam-load:not([hidden])"); await p.click("#roll-go");
  await tag("LIVE 26mm");
  assert.deepEqual(await p.evaluate(() => window.__opened), ["front", "dualwide", "ultrawide", "wide", "wide"]);
  await select("LIVE 前置"); await select("LIVE 13mm");
  assert.equal(await p.evaluate(() => window.__opened.at(-1)), "ultrawide");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

/* ---------- darkroom step 1 (docs/design/darkroom.md section 9): latent images, the film box, negatives ---------- */

/* a PNG decoder of our own (8-bit RGB/RGBA/grey, no interlace), so the colours are counted the way Pillow would, not by a browser */
async function pngColours(buf) {
  const { inflateSync } = await import("node:zlib");
  assert.equal(buf.toString("latin1", 1, 4), "PNG");
  let o = 8, w, h, type, idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), t = buf.toString("latin1", o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (t === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); assert.equal(d[8], 8, "8 bits"); type = d[9]; assert.equal(d[12], 0, "no interlace"); }
    if (t === "IDAT") idat.push(d);
    o += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[type], raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, cur = Buffer.alloc(stride);
  let prev = Buffer.alloc(stride); const seen = new Set();
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      cur[i] = (line[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
    for (let x = 0; x < w; x++) {
      const p = cur.subarray(x * bpp, x * bpp + bpp);
      seen.add(type === 0 ? `${p[0]},${p[0]},${p[0]}` : type === 4 ? `${p[0]},${p[0]},${p[0]},${p[1]}` : [...p].join(","));
    }
    prev = Buffer.from(cur);
  }
  return { w, h, colours: [...seen].sort() };
}
/* the handheld's stores, read from the page */
const idb = {
  doc: (p, path) => p.evaluate((path) => new Promise((res, rej) => { const r = indexedDB.open("lopda"); r.onerror = () => rej(r.error);
    r.onsuccess = () => { const g = r.result.transaction("docs").objectStore("docs").get(path); g.onsuccess = () => { r.result.close(); res(g.result ? g.result.data : null); }; }; }), path),
  under: (p, parent) => p.evaluate((parent) => new Promise((res) => { const r = indexedDB.open("lopda");
    r.onsuccess = () => { const g = r.result.transaction("docs").objectStore("docs").index("parent").getAll(parent); g.onsuccess = () => { r.result.close(); res(g.result.map((x) => x.data)); }; }; }), parent),
  /* latent images of a roll: {key: {size, w, h, sha}} */
  latents: (p, id) => p.evaluate((id) => new Promise((res) => { const r = indexedDB.open("lopda-files");
    r.onsuccess = () => { const s = r.result.transaction("files").objectStore("files"), out = {};
      const keys = s.getAllKeys(); keys.onsuccess = async () => {
        const mine = keys.result.filter((k) => k.startsWith("roll/" + id + "/"));
        const blobs = await Promise.all(mine.map((k) => new Promise((ok) => { const g = r.result.transaction("files").objectStore("files").get(k); g.onsuccess = () => ok(g.result); })));
        for (let i = 0; i < mine.length; i++) {
          const b = blobs[i], bmp = await createImageBitmap(b), sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await b.arrayBuffer()))].map((v) => v.toString(16).padStart(2, "0")).join("");
          out[mine[i]] = { size: b.size, type: b.type, w: bmp.width, h: bmp.height, sha };
        }
        r.result.close(); res(out);
      }; }; }), id)
};

test("darkroom: load a stock, shoot a roll with latent images, unload it to the film box, name it, export the negative, throw it away, import it back", { skip, timeout: 180000 }, async (t) => {
  const { p, errors, open } = await camPage(t);
  const toast = (re) => p.waitForFunction((s) => { const el = document.getElementById("toast"); return !el.hidden && new RegExp(s).test(el.textContent); }, re.source, { timeout: 20000 });
  const press = async (key) => { await p.keyboard.down(key); await p.waitForTimeout(30); await p.keyboard.up(key); await p.waitForTimeout(60); };
  await open();
  await p.waitForSelector("#cam-load:not([hidden])");
  /* seven stocks on the shelf, by name and speed only */
  assert.deepEqual(await p.$$eval("#rolls .roll .lab", (ls) => ls.map((l) => l.firstChild.textContent)), ["人像 400", "暖阳 200", "青绿 400", "樱 400", "夜 800T", "黑白 400", "过期"]);
  await press("ArrowRight"); await p.waitForTimeout(500);
  await press("ArrowUp");                                           /* 12 -> 16 */
  assert.match(await p.textContent("#roll-count"), /16 张/);
  await press("x");
  await toast(/装好了：暖阳 200，16 张/);
  await p.waitForSelector("#cam-live-tag:not([hidden])", { timeout: 10000 });
  assert.match(await p.textContent("#cam-film"), /暖阳 200/);
  await press("ArrowUp");                                           /* brightness +1 for the first frame */
  for (let i = 0; i < 16; i++) {
    await p.click("#cam-shutter");
    await p.waitForFunction(() => document.getElementById("cam-shut").hidden, null, { timeout: 3000 });
    await p.waitForTimeout(120);
  }
  await p.waitForSelector("#cam-menu:not([hidden])");
  assert.deepEqual(await p.$$eval("#menu-list li", (ls) => ls.map((l) => l.textContent)), ["取出胶卷"], "no developing in the camera");
  const film = await idb.doc(p, "data/users/local/film");
  assert.equal(film.stock, "sunny"); assert.equal(typeof film.seed, "number"); assert.ok(!("tint" in film));
  assert.equal(film.no, 1, "the first roll on this handheld");
  assert.deepEqual(await idb.doc(p, "data/users/local/camera"), { rolls: 1 });
  const id = film.roll;
  await p.waitForFunction((id) => new Promise((res) => { const r = indexedDB.open("lopda-files"); r.onsuccess = () => { const k = r.result.transaction("files").objectStore("files").getAllKeys(); k.onsuccess = () => { r.result.close(); res(k.result.filter((x) => x.startsWith("roll/" + id + "/")).length === 16); }; }; }), id, { timeout: 20000 });
  const lat = await idb.latents(p, id);
  assert.deepEqual(Object.keys(lat).sort(), Array.from({ length: 16 }, (_, k) => `roll/${id}/${String(k + 1).padStart(2, "0")}.jpg`));
  for (const v of Object.values(lat)) { assert.equal(v.w, 800); assert.equal(v.h, 700); assert.equal(v.type, "image/jpeg"); }
  const f1 = await idb.doc(p, `data/users/local/frames/items/${id}-01`);
  assert.equal(f1.exposure, 1); assert.equal(f1.contrast, 0); assert.equal(f1.dated, true);

  /* unload: into the box, the camera is empty again */
  await p.click("#menu-list li");
  await toast(/胶卷放进冲洗店的胶卷盒了/);
  await p.waitForSelector("#cam-load:not([hidden])");
  assert.equal(await idb.doc(p, "data/users/local/film"), null);
  for (let i = 0; i < 50 && (await idb.under(p, "data/users/local/frames/items")).length; i++) await p.waitForTimeout(100);   /* deleted one by one */
  assert.deepEqual(await idb.under(p, "data/users/local/frames/items"), []);
  const roll = await idb.doc(p, `data/users/local/rolls/items/${id}`);
  assert.equal(roll.stock, "sunny"); assert.equal(roll.size, 16); assert.equal(roll.frames.length, 16); assert.equal(roll.name, "");
  assert.equal(roll.frames[0].exposure, 1); assert.ok(roll.bytes > 16 * 128 * 112);
  assert.deepEqual(await idb.latents(p, id), lat, "the latent images stay where they were");

  /* the darkroom: the camera's old place on the home screen */
  await p.click("#home-key");
  assert.deepEqual(await p.$$eval("#home .app.builtin .label", (ls) => ls.map((l) => l.textContent)).then((l) => l.slice(l.indexOf("点阵相机"), l.indexOf("点阵相机") + 2)), ["点阵相机", "冲洗店"]);
  await p.locator("#home .app", { has: p.locator(".label", { hasText: /^冲洗店$/ }) }).click();
  await p.waitForFunction(() => /暖阳 200/.test(document.getElementById("dk-list").textContent));
  assert.match(await p.textContent("#dk-list li.on"), /暖阳 200.*16 张.*未冲洗/);
  assert.equal(await p.textContent("#dk-keys"), "▲▼ 选　A 打开　START 导入底片");
  const rowH = await p.$eval("#dk-list li.on", (e) => e.getBoundingClientRect().height);
  assert.ok(rowH >= 44, "row height " + rowH);

  /* name it: A opens the roll's menu */
  await press("x");
  assert.deepEqual(await p.$$eval("#dk-sheet li", (ls) => ls.map((l) => l.textContent)), ["起名", "导出底片", "扔掉"]);
  await press("x");
  await p.waitForSelector("#dk-name");
  assert.ok(await p.$eval("#dk-name", (e) => parseFloat(getComputedStyle(e).fontSize) >= 16), "16 px or more, or iPhone zooms");
  await p.fill("#dk-name", "海边");
  await p.press("#dk-name", "Enter");
  await p.waitForFunction(() => /海边/.test(document.getElementById("dk-list").textContent));
  assert.equal((await idb.doc(p, `data/users/local/rolls/items/${id}`)).name, "海边");

  /* export: the confirmation says what is inside, the safe choice is selected */
  await press("ArrowDown"); await press("x");
  await p.waitForFunction(() => /彩色原片/.test(document.getElementById("dk-sheet").textContent));
  assert.equal(await p.textContent("#dk-sheet li.on"), "取消");
  await press("ArrowUp");
  const [d] = await Promise.all([p.waitForEvent("download", { timeout: 30000 }), press("x")]);
  assert.match(d.suggestedFilename(), /^lopda-negative-\d{8}-sunny-200-001\.png$/);
  const neg = await (await import("node:fs/promises")).readFile(await d.path());
  const pic = await pngColours(neg);
  assert.deepEqual([pic.w, pic.h], [1080, 1440]);
  assert.deepEqual(pic.colours.map((c) => c.split(",").slice(0, 3).join(",")).sort(), ["125,138,88", "163,173,126", "31,42,20", "74,90,50"], "only the four tones");
  assert.ok(neg.includes(Buffer.from("lpDa")) && neg.includes(Buffer.from("LOPDA-NEG")));
  await toast(/底片导出了/);

  /* throw it away: the safe choice first, then the roll and its latent images go */
  await p.waitForSelector("#dk-sheet:not([hidden])");
  await press("ArrowDown"); await press("x");
  await p.waitForFunction(() => /不能撤销/.test(document.getElementById("dk-sheet").textContent));
  assert.equal(await p.textContent("#dk-sheet li.on"), "留着");
  await press("ArrowUp"); await press("x");
  await toast(/扔掉了/);
  await p.waitForFunction(() => /胶卷盒是空的/.test(document.getElementById("dk-list").textContent));
  assert.equal(await p.textContent("#dk-keys"), "START 导入底片");
  await p.waitForTimeout(500);
  assert.equal(await idb.doc(p, `data/users/local/rolls/items/${id}`), null);
  assert.deepEqual(await idb.latents(p, id), {});

  /* import the negative: the roll comes back as it was, latent images byte for byte */
  await p.setInputFiles("#dk-file", { name: d.suggestedFilename(), mimeType: "image/png", buffer: neg });
  await toast(/底片放进胶卷盒了/);
  await p.waitForFunction(() => /海边/.test(document.getElementById("dk-list").textContent));
  const back = await idb.doc(p, `data/users/local/rolls/items/${id}`);
  assert.deepEqual({ ...back, out: 0 }, { ...roll, name: "海边", out: 0, bytes: back.bytes });
  assert.equal(back.out, roll.out);
  assert.deepEqual(await idb.latents(p, id), lat);
  /* once is enough */
  await p.setInputFiles("#dk-file", { name: "again.png", mimeType: "image/png", buffer: neg });
  await toast(/已经在胶卷盒里/);
  assert.equal((await idb.under(p, "data/users/local/rolls/items")).length, 1);
  /* not a negative, a damaged one, and the same picture sent without "original" (a JPEG) */
  const plainPng = Buffer.from(neg.subarray(0, neg.indexOf(Buffer.from("lpDa")) - 4));
  const damaged = Buffer.from(neg); damaged[neg.indexOf(Buffer.from("LOPDA-NEG")) + 400] ^= 1;
  for (const [name, mimeType, buffer] of [["a.png", "image/png", Buffer.concat([plainPng, neg.subarray(neg.length - 12)])], ["b.png", "image/png", damaged], ["c.jpg", "image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1])]]) {
    await p.waitForFunction(() => document.getElementById("toast").hidden, null, { timeout: 8000 });
    await p.setInputFiles("#dk-file", { name, mimeType, buffer });
    await toast(/这张底片冲不出来/);
  }
  /* Settings counts the box */
  await p.click("#home-key");
  await p.locator("#home .app", { has: p.locator(".label", { hasText: /^设置$/ }) }).click();
  await p.waitForFunction(() => /胶卷盒 1 卷，\d/.test(document.getElementById("set-storage").textContent));
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("darkroom: a roll left in the camera by an older version is void when the camera opens", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, open } = await camPage(t);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.waitForFunction(() => document.getElementById("savestate").textContent !== "启动中…", null, { timeout: 8000 });
  await p.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("lopda");
    r.onsuccess = () => {
      const s = r.result.transaction("docs", "readwrite").objectStore("docs"), px = "1".repeat(128 * 112);
      s.put({ path: "data/users/local/film", parent: "data/users/local", data: { roll: "rold1", size: 12, res: 1, tint: "sepia", loaded: 1791700000000, exposure: 0, contrast: 0, date: true } });
      for (const n of [1, 2]) s.put({ path: "data/users/local/frames/items/rold1-0" + n, parent: "data/users/local/frames/items", data: { roll: "rold1", n, px, taken: 1791700000000 + n, dated: true } });
      s.transaction.oncomplete = () => { r.result.close(); res(); };
    };
  }));
  await open();
  await p.waitForFunction(() => { const el = document.getElementById("toast"); return !el.hidden && el.textContent === "旧胶卷已作废"; }, null, { timeout: 10000 });
  await p.waitForSelector("#cam-load:not([hidden])");
  await p.waitForTimeout(500);
  assert.equal(await idb.doc(p, "data/users/local/film"), null);
  assert.deepEqual(await idb.under(p, "data/users/local/frames/items"), []);
  /* and only once */
  await open();
  await p.waitForSelector("#cam-load:not([hidden])"); await p.waitForTimeout(600);
  assert.notEqual(await p.evaluate(() => document.getElementById("toast").hidden ? "" : document.getElementById("toast").textContent), "旧胶卷已作废");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});
