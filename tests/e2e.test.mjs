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
  /* arrows move the day, START comes back to today */
  await p.keyboard.press("ArrowRight");
  assert.ok(!(await today.getAttribute("class")).includes("sel"));
  await p.keyboard.press("Enter");
  assert.ok((await today.getAttribute("class")).includes("sel"));
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
