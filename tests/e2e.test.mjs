// End-to-end: the real runtime and every registry app in headless Chromium.
// Needs Playwright, which the repo does not depend on, so these tests skip without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e.test.mjs
// Serves the repo root on a random port, as `python3 -m http.server` would.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { ROOT, tempDir, runScript } from "./helpers.mjs";

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

test("the add-to-home card is iOS Safari only, remembers dismissal, and boot asks for no permissions", { skip, timeout: 30000 }, async (t) => {
  const ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const { p, errors } = await page(t, { locale: "en-US", userAgent: ios });
  await p.addInitScript((standalone) => {
    Object.defineProperty(navigator, "standalone", { configurable: true, value: standalone });
    window.__permissionCalls = { camera: 0, motion: 0, notification: 0 };
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {} });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: () => {
      window.__permissionCalls.camera++; return Promise.reject(new Error("unexpected camera prompt"));
    } });
    ["DeviceOrientationEvent", "DeviceMotionEvent"].forEach((name) => {
      Object.defineProperty(window, name, { configurable: true, value: {
        requestPermission: () => { window.__permissionCalls.motion++; return Promise.resolve("granted"); }
      } });
    });
    Object.defineProperty(window, "Notification", { configurable: true, value: {
      requestPermission: () => { window.__permissionCalls.notification++; return Promise.resolve("granted"); }
    } });
  }, false);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.waitForSelector("#home-add-tip");
  assert.match(await p.locator("#home-add-tip").innerText(), /Add to Home Screen\. Play like a real handheld\./);
  assert.deepEqual(await p.evaluate(() => window.__permissionCalls), { camera: 0, motion: 0, notification: 0 });

  await p.keyboard.press("x");
  await p.waitForSelector("#home-add-tip", { state: "detached" });
  const dismissed = await p.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open("lopda");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, get = db.transaction("docs").objectStore("docs").get("data/users/local/settings");
      get.onsuccess = () => { db.close(); resolve(!!(get.result && get.result.data.homeTipDismissed)); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  }));
  assert.equal(dismissed, true);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForFunction(() => window.LopdaPlatform && window.LP && LP.builtins.filter((b) => b.icon).length > 0 && document.querySelectorAll("#home .app.builtin").length === LP.builtins.filter((b) => b.icon).length);
  assert.equal(await p.locator("#home-add-tip").count(), 0);
  assert.deepEqual(await p.evaluate(() => window.__permissionCalls), { camera: 0, motion: 0, notification: 0 });
  await p.locator("#home .app.builtin").last().click();
  await p.locator("#set-vol-up").click();
  await p.waitForFunction(() => new Promise((resolve, reject) => {
    const req = indexedDB.open("lopda");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, get = db.transaction("docs").objectStore("docs").get("data/users/local/settings");
      get.onsuccess = () => {
        const data = get.result && get.result.data;
        db.close(); resolve(!!(data && data.homeTipDismissed && data.volume === 3));
      };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  }));
  await p.click("#home-key");
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForFunction(() => window.LopdaPlatform && window.LP && LP.builtins.filter((b) => b.icon).length > 0 && document.querySelectorAll("#home .app.builtin").length === LP.builtins.filter((b) => b.icon).length);
  assert.equal(await p.locator("#home-add-tip").count(), 0, "saving Settings keeps the dismissal");
  assert.deepEqual(await p.evaluate(() => window.__permissionCalls), { camera: 0, motion: 0, notification: 0 });
  assert.deepEqual(errors, []);

  const { p: buttonPage } = await page(t, { locale: "en-US", userAgent: ios });
  await buttonPage.addInitScript(() => Object.defineProperty(navigator, "standalone", { configurable: true, value: false }));
  await buttonPage.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await buttonPage.waitForSelector("#home-add-tip");
  await buttonPage.click("#home-tip-dismiss");
  await buttonPage.waitForSelector("#home-add-tip", { state: "detached" });
});

test("the add-to-home card stays hidden in standalone mode and on desktop", { skip, timeout: 30000 }, async (t) => {
  const ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const ipad = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const desktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
  const cases = [[ios, true, false, false], [ios, false, true, false], [desktop, false, false, false],
    [ipad, false, false, true], [android, false, false, false]];
  for (const [userAgent, standalone, displayMode, expected] of cases) {
    const { p } = await page(t, { userAgent });
    await p.addInitScript((state) => {
      Object.defineProperty(navigator, "standalone", { configurable: true, value: state.standalone });
      if (state.displayMode) {
        const native = window.matchMedia.bind(window);
        window.matchMedia = (query) => query === "(display-mode: standalone)"
          ? { matches: true, media: query }
          : native(query);
      }
    }, { standalone, displayMode });
    await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
    await p.waitForFunction(() => window.LopdaPlatform && window.LP && LP.builtins.filter((b) => b.icon).length > 0 && document.querySelectorAll("#home .app.builtin").length === LP.builtins.filter((b) => b.icon).length);
    assert.equal(await p.locator("#home-add-tip").count(), expected ? 1 : 0, userAgent);
  }
});

test("each built-in's fresh-profile first screen has visible content", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "en-US" });
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.LP && LP.builtins.filter((b) => b.icon).length > 0 && document.querySelectorAll("#home .app.builtin").length === LP.builtins.filter((b) => b.icon).length);
  const ids = await p.evaluate(() => LP.builtins.filter((b) => b.icon).map((b) => b.view));
  const firstScreens = [];
  for (let i = 0; i < ids.length; i++) {
    await p.locator("#home .app.builtin").nth(i).click();
    await p.waitForFunction((id) => {
      const view = document.getElementById("v-" + id);
      return view && !view.hidden;
    }, ids[i]);
    const text = (await p.locator("#v-" + ids[i]).innerText()).trim();
    assert.ok(text, `${ids[i]} first screen is blank`);
    firstScreens.push(`${ids[i]}: ${text.replace(/\s+/g, " ").slice(0, 100)}`);
    if (ids[i] === "cam" && await p.locator("#cam-boot").isVisible()) await p.locator("#cam-boot").click();
    await p.click("#home-key");
  }
  assert.deepEqual(errors, []);
  assert.equal(firstScreens.length, ids.length);
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

test("store: category filters split the catalogue, and one button updates every app", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.waitForFunction(() => document.querySelectorAll("#home .app:not(.builtin)").length === 2);
  /* make the two preinstalled apps look like older builds */
  const age = (id) => p.evaluate((id) => new Promise((resolve, reject) => {
    const req = indexedDB.open("lopda");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction("docs", "readwrite"), store = tx.objectStore("docs");
      const get = store.get("data/users/local/apps/items/" + id);
      get.onerror = () => reject(get.error);
      get.onsuccess = () => { const v = get.result; v.data.sha256 = "old-" + id; store.put(v); };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), id);
  for (const id of ["calculator", "paint"]) await age(id);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForFunction(() => document.querySelectorAll("#home .app:not(.builtin)").length === 2);
  await p.locator("#home .app.builtin", { hasText: "应用商店" }).click();
  await p.waitForSelector("#store-list .store-item");

  assert.equal(await p.locator(".store-filter").count(), 7, "all + six categories");
  assert.equal(await p.locator("#store-list .store-cat").count(), 6, "one section per category");
  assert.match(await p.locator("#store-updates").innerText(), /2 个程序有新版本/);
  await p.locator(".store-filter", { hasText: "游戏" }).click();
  assert.equal(await p.locator("#store-list .store-item").count(), 8);
  assert.equal(await p.locator("#store-list .store-cat").count(), 0, "a filter shows one flat list");
  await p.locator(".store-filter", { hasText: "全部" }).click();

  await p.locator("#store-updates .btn").click();
  await p.waitForFunction(() => document.getElementById("store-updates").hidden, null, { timeout: 30000 });
  assert.match(await p.locator("#toast").innerText(), /全部更新好了（2 个）/);
  const labels = await p.locator("#store-list .store-item .btn").allInnerTexts();
  assert.equal(labels.filter((x) => x === "打开").length, 2, "both apps are current now");
  /* installing further down the list must not throw the page back to the top */
  await p.evaluate(() => { document.getElementById("v-store").scrollTop = 500; });
  await p.waitForTimeout(100);
  const scrolled = await p.evaluate(() => document.getElementById("v-store").scrollTop);
  await p.evaluate(() => {
    const li = [...document.querySelectorAll("#store-list .store-item")].find((x) => x.textContent.includes("纸塔"));
    li.querySelector("button").click();
  });
  await p.waitForFunction(() => [...document.querySelectorAll("#store-list .store-item")]
    .some((x) => x.textContent.includes("纸塔") && x.querySelector("button").textContent === "打开"), null, { timeout: 15000 });
  assert.equal(await p.evaluate(() => document.getElementById("v-store").scrollTop), scrolled, "the list stays where it was");
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

test("paint: toolbar stays two rows and canvas keeps its size at 331x473", { skip, timeout: 30000 }, async (t) => {
  const p = await browser.newPage({ viewport: { width: 375, height: 844 }, locale: "zh-CN" });
  t.after(() => p.close());
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: "点阵画板" }).click();
  const frame = p.locator("#run-frame");
  await frame.waitFor();
  await frame.evaluate((el) => { el.style.width = "331px"; el.style.height = "473px"; el.style.flex = "none"; });
  const app = p.frameLocator("#run-frame");
  await app.locator("#cv").waitFor();
  const layout = await app.locator("#app").evaluate((root) => {
    const row = (id) => {
      const boxes = [...root.querySelector("#" + id).children]
        .filter((child) => getComputedStyle(child).display !== "none")
        .map((child) => child.getBoundingClientRect());
      return { tops: boxes.map((box) => box.top), height: Math.max(...boxes.map((box) => box.bottom)) - Math.min(...boxes.map((box) => box.top)) };
    };
    return {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      first: row("t1"),
      second: row("t2"),
      canvas: root.querySelector("#cv").getBoundingClientRect().width
    };
  });
  assert.deepEqual([layout.width, layout.height], [331, 473]);
  assert.equal(new Set(layout.first.tops.map((top) => Math.round(top))).size, 1, "row 1 controls stay on one line");
  assert.equal(new Set(layout.second.tops.map((top) => Math.round(top))).size, 1, "row 2 controls stay on one line");
  assert.equal(layout.first.height, 44);
  assert.equal(layout.second.height, 44);
  assert.ok(layout.canvas >= 269, `canvas is at least 20px below the pre-#42 baseline (got ${layout.canvas}px)`);
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
  await p.click("#cal-sheet .sk-a");
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
  await p.click("#cal-sheet .sk-a");
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

test("calendar: HOME closes a date sheet and reopening returns to the month", { skip, timeout: 30000 }, async (t) => {
  const c = await calPage(t);
  await c.boot(); await c.open();
  await c.p.click("#cal-info");
  await c.p.waitForSelector("#cal-sheet:not([hidden])");
  await c.p.click("#home-key");
  await c.open();
  assert.ok(await c.p.isVisible("#v-cal"));
  assert.ok(await c.p.isHidden("#cal-sheet"));
  const month = await c.p.textContent("#cal-ym");
  await c.p.keyboard.press("z");
  assert.equal(await c.p.textContent("#cal-ym"), month);
  assert.ok(await c.p.isHidden("#cal-sheet"), "B on the first calendar screen leaves the screen unchanged");
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
  await p.locator("#cal-sheet .sk-a").click();
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

test("calendar: at 331x359 every lunar line in the month fits inside its cell, nothing cut", { skip, timeout: 30000 }, async (t) => {
  const c = await calPage(t);
  const { p } = c;
  await c.boot(); await c.open();
  await p.setViewportSize({ width: 375, height: 844 });
  await p.evaluate(() => {
    const screen = document.getElementById("screen"), status = screen.querySelector(".status");
    screen.style.flex = "none";
    screen.style.height = (359 + 12 + status.getBoundingClientRect().height) + "px";
  });
  assert.deepEqual(await p.locator("#v-cal").evaluate((view) => { const r = view.getBoundingClientRect(); return [r.width, r.height]; }), [331, 359]);
  const cut = await p.locator("#cal-grid .cal-cell:not(.out)").evaluateAll((cells) => cells.flatMap((cell) => {
    const text = cell.querySelector("span"), box = cell.getBoundingClientRect();
    const inner = box.bottom - parseFloat(getComputedStyle(cell).borderBottomWidth), bottom = text.getBoundingClientRect().bottom;
    return text.scrollHeight <= text.clientHeight && bottom <= inner + 0.1 ? []
      : [{ day: cell.querySelector("b").textContent, text: text.textContent, scroll: text.scrollHeight, client: text.clientHeight, bottom, inner }];
  }));
  assert.equal(await p.locator("#cal-grid .cal-cell:not(.out)").count(), 31);
  assert.deepEqual(cut, [], "every in-month lunar line fits");
});

test("calendar: month grid lunar lines fit at small screen sizes", { skip, timeout: 30000 }, async (t) => {
  const c = await calPage(t);
  const { p } = c;
  await c.boot(); await c.open();
  assert.equal(await p.locator("#cal-keys").count(), 0);
  assert.equal(await p.textContent("#cal-list-btn"), "纪念日");
  assert.equal(await p.textContent("#cal-today"), "今天");
  for (const height of [359, 473]) {
    await p.setViewportSize({ width: 375, height: 844 });
    await p.evaluate((height) => {
      const screen = document.getElementById("screen"), status = screen.querySelector(".status");
      screen.style.flex = "none";
      screen.style.height = (height + 12 + status.getBoundingClientRect().height) + "px";
    }, height);
    assert.equal(await p.locator("#v-cal").evaluate((view) => view.getBoundingClientRect().height), height);
    const clipped = await p.locator("#cal-grid .cal-cell").evaluateAll((cells) => cells.flatMap((cell) => {
      const text = cell.querySelector("span"), cellBottom = cell.getBoundingClientRect().bottom;
      return text.getBoundingClientRect().bottom <= cellBottom + 0.1 ? [] : [{ day: cell.querySelector("b").textContent, text: text.textContent, bottom: text.getBoundingClientRect().bottom, cellBottom }];
    }));
    assert.deepEqual(clipped, [], `lunar lines fit at 331x${height}`);
  }
  const sheetBar = "#cal-sheet .softkeys";
  await p.click("#cal-info");
  assert.equal(await p.locator(sheetBar).count(), 1);
  await p.click("#cal-sheet .sk-a");
  assert.equal(await p.locator(sheetBar).count(), 1);
  await p.click("#cal-sheet .sk-b");
  await p.click("#cal-sheet .sk-b");
  await p.click("#cal-list-btn");
  assert.equal(await p.locator(sheetBar).count(), 1);
  await p.click("#cal-sheet .sk-b");
  await p.click("#cal-ym");
  assert.equal(await p.locator(sheetBar).count(), 1);
  assert.deepEqual(notBlocked(c.errors), []);
});

/* ---------------- dictionary ---------------- */
/* init: a function run in the page before its scripts, with arg */
const dictPage = async (t, { init, arg, ...opts } = {}) => {
  const { p, errors } = await page(t, { locale: "zh-CN", ...opts });
  if (init) await p.addInitScript(init, arg);
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: opts.locale === "en-US" ? "Dict" : "词典" }).click();
  await p.waitForSelector("#v-dict:not([hidden])");
  return { p, errors };
};
const typeWord = async (p, w, want = w) => { await p.fill("#dict-q", w); await p.waitForFunction((want) => {
  const li = document.querySelector("#dict-list li.on"); return li && li.textContent.indexOf(want) >= 0; }, want, { timeout: 10000 }); };
const entryText = (p) => p.textContent("#dict-sheet .dict-page");

test("dictionary: HOME closes an entry and reopening resets to the word box", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await dictPage(t);
  await typeWord(p, "apple");
  await p.press("#dict-q", "Enter");
  await p.waitForFunction(() => /苹果/.test(document.querySelector("#dict-sheet .dict-page")?.textContent || ""));
  await p.click("#home-key");
  await p.locator("#home .app", { hasText: "词典" }).click();
  assert.ok(await p.isVisible("#v-dict"));
  assert.ok(await p.isHidden("#dict-sheet"));
  assert.equal(await p.inputValue("#dict-q"), "");
  await p.keyboard.press("z");
  assert.ok(await p.isVisible("#dict-list"), "B on the first dictionary screen keeps the app usable");
  assert.ok(await p.isHidden("#dict-sheet"));
  assert.equal(await p.inputValue("#dict-q"), "");
  assert.deepEqual(errors, []);
});

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
  await p.click('.gamepad [data-b="b"]');                      /* back (A says the word since 0.23.0) */
  await p.fill("#dict-q", "");
  await p.waitForFunction(() => /最近查过/.test(document.getElementById("dict-history").textContent));
  assert.match(await p.textContent("#dict-list"), /run[\s\S]*apple/);
  /* review: the word first, A shows the entry */
  await p.click("#dict-keys .sk-select");
  await p.click("#dict-sheet .sk-a");
  assert.equal((await p.textContent("#dict-sheet .dict-page .big")).trim(), "apple");
  await p.click('.gamepad [data-b="a"]');
  await p.waitForFunction(() => /苹果/.test(document.querySelector("#dict-sheet .dict-page")?.textContent || ""));
  /* LP.dict.lookup for other programs */
  const r = await p.evaluate(() => LP.dict.lookup("Apple").then((r) => r.map((x) => [x.book, x.word, x.how])));
  assert.deepEqual(r[0], ["ecdict", "apple", "exact"]);
  assert.deepEqual(errors, []);
});

test("dictionary: browse matches, restore the selected row, and page entries", { skip, timeout: 60000 }, async (t) => {
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
  const swipeEntry = () => p.evaluate(() => {
    const page = document.querySelector("#dict-sheet .dict-page"), box = page.getBoundingClientRect();
    page.dispatchEvent(new PointerEvent("pointerdown", { clientX: box.right - 30, clientY: box.top + 30, bubbles: true, pointerType: "touch" }));
    page.dispatchEvent(new PointerEvent("pointerup", { clientX: box.left + 30, clientY: box.top + 30, bubbles: true, pointerType: "touch" }));
  });
  await swipeEntry();
  await p.waitForFunction((before) => document.querySelector("#dict-sheet .sheet-title span")?.textContent !== before, picked);
  const next = await p.textContent("#dict-sheet .sheet-title span");
  await p.keyboard.press("z");
  assert.equal(await p.textContent("#dict-list li.on"), next);
  assert.equal(await p.evaluate(() => document.getElementById("dict-list").scrollTop), savedScroll);

  await p.click("#dict-list li.on");
  await p.waitForFunction(() => document.querySelector("#dict-sheet .dict-page")?.textContent.length > 0);
  assert.equal(await p.locator("#dict-sheet .dict-copy, #dict-sheet .dict-note").count(), 0);
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector("#dict-sheet .dict-page")).userSelect), "none");
  await p.keyboard.press("z");
  await p.fill("#dict-q", "run");
  await p.press("#dict-q", "Enter");
  await p.waitForFunction(() => document.querySelector("#dict-sheet .sheet-title span")?.textContent === "run");
  await p.waitForFunction(() => /跑/.test(document.querySelector("#dict-sheet .dict-page")?.textContent || ""));
  await p.evaluate(() => {
    const page = document.querySelector("#dict-sheet .dict-page");
    page.style.flex = "0 0 240px";
    page.dispatchEvent(new Event("scroll"));
  });
  const entryHeight = await p.evaluate(() => {
    const page = document.querySelector("#dict-sheet .dict-page");
    return { height: page.scrollHeight, visible: page.clientHeight, top: page.scrollTop };
  });
  assert.ok(entryHeight.height > entryHeight.visible, `the long entry has content to scroll: ${JSON.stringify(entryHeight)}`);
  const paging = {
    step: Math.max(1, Math.floor(entryHeight.visible / 24) - 1) * 24,
    maxTop: Math.max(0, entryHeight.height - entryHeight.visible)   /* the true end, not a whole line (0.20.1) */
  };
  const pages = Math.max(1, Math.ceil(paging.maxTop / paging.step) + 1);
  const target = Math.min(paging.maxTop, Math.round(entryHeight.top / 24) * 24 + paging.step);
  await p.keyboard.press("ArrowDown");
  await p.waitForFunction((top) => document.querySelector("#dict-sheet .dict-page")?.scrollTop === top, target);
  assert.equal(await p.evaluate(() => document.querySelector("#dict-sheet .dict-page").scrollTop % 24), 0);
  /* the counter follows the scroll event, which can come a frame after scrollTop has arrived */
  await p.waitForFunction((want) => document.querySelector("#dict-sheet .sheet-title small")?.textContent === want, `2/${pages}`, { timeout: 2000 }).catch(() => {});
  assert.equal(await p.textContent("#dict-sheet .sheet-title small"), `2/${pages}`);

  await p.click('.gamepad [data-b="start"]');
  await p.keyboard.press("z");
  await p.fill("#dict-q", "apple");
  await p.press("#dict-q", "Enter");
  await p.waitForFunction(() => document.querySelector("#dict-sheet .sheet-title span")?.textContent === "apple");
  await p.click('.gamepad [data-b="start"]');
  await p.keyboard.press("z");
  await p.click("#dict-keys .sk-select");
  await p.click("#dict-sheet .lcd-menu li:nth-child(2)");
  await p.waitForFunction(() => document.querySelector("#dict-sheet .dict-page .big")?.textContent === "run");
  await p.keyboard.press("x");
  await p.waitForFunction(() => /跑/.test(document.querySelector("#dict-sheet .dict-page")?.textContent || ""));
  await p.evaluate(() => {
    const page = document.querySelector("#dict-sheet .dict-page");
    page.style.flex = "0 0 240px";
    page.dispatchEvent(new Event("scroll"));
  });
  const reviewPages = await p.evaluate(() => {
    const page = document.querySelector("#dict-sheet .dict-page");
    const step = Math.max(1, Math.floor(page.clientHeight / 24) - 1) * 24;
    const maxTop = Math.max(0, page.scrollHeight - page.clientHeight);
    return Math.max(1, Math.ceil(maxTop / step) + 1);
  });
  assert.equal(await p.textContent("#dict-sheet .sheet-title small"), `2/2 1/${reviewPages}`);
  await p.keyboard.press("ArrowDown");
  await p.waitForFunction((count) => document.querySelector("#dict-sheet .sheet-title small")?.textContent === `2/2 2/${count}`, reviewPages);
  const reviewed = await p.textContent("#dict-sheet .sheet-title span");
  await swipeEntry();
  await p.waitForFunction((before) => document.querySelector("#dict-sheet .sheet-title span")?.textContent !== before, reviewed);
  assert.deepEqual(errors, []);
});

test("dictionary: disable books, persist settings, and explain when all are off", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await dictPage(t);
  await p.click("#dict-keys .sk-start");
  assert.equal(await p.textContent("#dict-sheet .lcd-menu li .dict-book-state"), "启用");
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .sk-b");
  assert.equal(await p.textContent("#dict-sheet .lcd-menu li .dict-book-state"), "停用");
  assert.deepEqual(await p.evaluate(() => LP.dict.lookup("apple")), []);
  assert.deepEqual(await p.evaluate(() => LP.dict.suggest("app")), []);
  await p.click("#dict-sheet .sk-b");
  await p.waitForFunction(() => document.querySelector("#dict-sheet").hidden);
  await p.fill("#dict-q", "apple");
  await p.waitForFunction(() => document.querySelector("#dict-list .dict-alloff")?.textContent.includes("没有启用的词典"));
  assert.equal(await p.locator("#dict-list .dict-alloff").count(), 1);

  await p.reload({ waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: "词典" }).click();
  await p.waitForFunction(() => document.querySelector("#dict-keys .sk-start") && window.LP.dict);
  await p.click("#dict-keys .sk-start");
  await p.waitForFunction(() => document.querySelector("#dict-sheet .dict-book-state")?.textContent === "停用");
  assert.deepEqual(await p.evaluate(() => LP.dict.lookup("apple")), []);
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .sk-b");
  await p.waitForFunction(() => LP.dict.lookup("apple").then((r) => r.length === 1));
  assert.equal(await p.textContent("#dict-sheet .lcd-menu li .dict-book-state"), "启用");
  assert.deepEqual(errors, []);
});

test("dictionary: an import the storage refuses (full, private mode) says so plainly and leaves no half book", { skip, timeout: 60000 }, async (t) => {
  const { writeStarDict } = await import("../tools/stardict-write.mjs");
  const sd = writeStarDict({ bookname: "Tiny", entries: [{ word: "zyzzyva", text: "a weevil (test)" }] });
  const files = [{ name: "tiny.ifo", mimeType: "text/plain", buffer: Buffer.from(sd.ifo) }, { name: "tiny.idx", mimeType: "application/octet-stream", buffer: sd.idx },
    { name: "tiny.dict.dz", mimeType: "application/octet-stream", buffer: sd.dictdz }];
  const { p, errors } = await dictPage(t);
  /* the index goes in, the text does not: storage full */
  await p.evaluate(() => {
    const files = window.LopdaPlatform.files, real = files.put;
    window.__puts = [];
    files.put = (key, value) => {
      window.__puts.push(key);
      if (/\/data$/.test(key)) return Promise.reject(new DOMException("The quota has been exceeded.", "QuotaExceededError"));
      return real.call(files, key, value);
    };
  });
  await p.click("#dict-keys .sk-start");
  await p.setInputFiles("#dict-file", files);
  await p.waitForFunction(() => !document.getElementById("toast").hidden && /空间不够/.test(document.getElementById("toast").textContent), null, { timeout: 10000 });
  assert.equal(await p.textContent("#toast"), "空间不够，或浏览器不让存（无痕模式）。");
  const puts = await p.evaluate(() => window.__puts);
  assert.equal(puts.length, 2, "the index was written, the text refused");
  assert.deepEqual(await p.evaluate((keys) => Promise.all(keys.map((k) => window.LopdaPlatform.files.get(k))), puts), [undefined, undefined], "nothing of it stays in files");
  const books = () => p.$$eval("#dict-sheet .lcd-menu li span", (l) => l.map((x) => x.textContent));
  assert.deepEqual(await books(), ["ECDICT"]);
  await p.reload({ waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: "词典" }).click();
  await p.click("#dict-keys .sk-start");
  assert.deepEqual(await books(), ["ECDICT"], "no book doc stays either");
  assert.deepEqual(errors, []);
});

test("dictionary: import a StarDict book (.dict.dz, .syn), order it, delete it; ECDICT stays", { skip, timeout: 60000 }, async (t) => {
  const { writeStarDict } = await import("../tools/stardict-write.mjs");
  const sd = writeStarDict({ bookname: "Tiny", entries: [{ word: "zyzzyva", text: "a weevil (test)", syns: ["zyzz"] }, { word: "apple", text: "TINY-APPLE" }] });
  const files = [{ name: "tiny.ifo", mimeType: "text/plain", buffer: Buffer.from(sd.ifo) }, { name: "tiny.idx", mimeType: "application/octet-stream", buffer: sd.idx },
    { name: "tiny.dict.dz", mimeType: "application/octet-stream", buffer: sd.dictdz }, { name: "tiny.syn", mimeType: "application/octet-stream", buffer: sd.syn }];
  const { p, errors } = await dictPage(t);
  await p.click("#dict-keys .sk-start");
  await p.setInputFiles("#dict-file", files);
  await p.waitForFunction(() => /Tiny/.test(document.getElementById("dict-sheet").textContent), null, { timeout: 10000 });
  /* the built-in cannot be deleted */
  await p.click("#dict-sheet .lcd-menu li:nth-child(1)");
  await p.click("#dict-sheet .sk-a");
  assert.equal(await p.$$eval("#dict-sheet .lcd-menu li", (l) => l.length), 3);
  await p.click("#dict-sheet .sk-b");
  const books = () => p.$$eval("#dict-sheet .lcd-menu li span", (l) => l.map((x) => x.textContent));
  assert.deepEqual(await books(), ["ECDICT", "Tiny"]);
  /* reload: the book survives; a synonym finds its headword */
  await p.reload({ waitUntil: "networkidle" });
  await p.locator("#home .app", { hasText: "词典" }).click();
  const syn = await p.evaluate(() => LP.dict.lookup("zyzz").then((r) => r.map((x) => [x.name, x.word, x.head, x.text])));
  assert.deepEqual(syn, [["Tiny", "zyzz", "zyzzyva", "a weevil (test)"]]);
  let apple = await p.evaluate(() => LP.dict.lookup("apple").then((r) => r.map((x) => x.name)));
  assert.deepEqual(apple, ["ECDICT", "Tiny"]);
  await p.click("#dict-keys .sk-start");
  await p.click("#dict-sheet .lcd-menu li:nth-child(2)");
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .sk-b");
  assert.equal(await p.textContent("#dict-sheet .lcd-menu li:nth-child(2) .dict-book-state"), "停用");
  assert.deepEqual(await p.evaluate(() => LP.dict.lookup("zyzz")), []);
  apple = await p.evaluate(() => LP.dict.lookup("apple").then((r) => r.map((x) => x.name)));
  assert.deepEqual(apple, ["ECDICT"]);
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .sk-b");
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .sk-b");
  assert.equal(await p.textContent("#dict-sheet .lcd-menu li:nth-child(2) .dict-book-state"), "启用");
  apple = await p.evaluate(() => LP.dict.lookup("apple").then((r) => r.map((x) => x.name)));
  assert.deepEqual(apple, ["ECDICT", "Tiny"]);
  /* move Tiny up: its answer comes first */
  await p.click("#dict-sheet .lcd-menu li:nth-child(2)");
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .lcd-menu li:nth-child(2)");
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .sk-b");
  apple = await p.evaluate(() => LP.dict.lookup("apple").then((r) => r.map((x) => x.name)));
  assert.deepEqual(apple, ["Tiny", "ECDICT"]);
  /* delete takes two taps */
  await p.click("#dict-sheet .lcd-menu li:first-child");
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .lcd-menu li:last-child");
  await p.click("#dict-sheet .sk-a");
  assert.match(await p.textContent("#dict-sheet .lcd-menu li:last-child"), /确认删除/);
  await p.click("#dict-sheet .sk-a");
  assert.deepEqual(await books(), ["ECDICT"]);
  apple = await p.evaluate(() => LP.dict.lookup("apple").then((r) => r.map((x) => x.name)));
  assert.deepEqual(apple, ["ECDICT"]);
  assert.deepEqual(errors, []);
});

test("dictionary: English screen", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await dictPage(t, { locale: "en-US" });
  assert.equal(await p.getAttribute("#dict-q", "placeholder"), "Type an English word");
  assert.equal(await p.textContent("#dict-keys .sk-select span"), "Words");
  assert.deepEqual(errors, []);
});

test("dictionary: book soft keys stay in one row at the smallest screen size", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await dictPage(t);
  await p.setViewportSize({ width: 331, height: 359 });
  await p.click("#dict-keys .sk-start");
  const measure = async () => p.evaluate(() => {
    const bar = document.querySelector("#dict-sheet .softkeys"), slots = [...bar.children];
    const boxes = slots.map((slot) => slot.getBoundingClientRect());
    return { height: bar.getBoundingClientRect().height, widths: boxes.map((box) => box.width), tops: boxes.map((box) => box.top) };
  });
  const assertOneRow = async () => {
    const value = await measure();
    assert.equal(value.height, 44);
    assert.deepEqual(new Set(value.tops).size, 1);
    assert.ok(value.widths.every((width) => width === value.widths[0]));
    return value;
  };
  const listBefore = await assertOneRow();
  await p.click("#dict-sheet .sk-a");
  const menuBefore = await assertOneRow();
  await p.click("#dict-sheet .sk-a");
  const menuDisabled = await assertOneRow();
  await p.click("#dict-sheet .sk-b");
  await assertOneRow();
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .sk-a");
  const menuEnabled = await assertOneRow();
  await p.click("#dict-sheet .sk-b");
  const listAfter = await assertOneRow();
  assert.deepEqual(menuDisabled.widths, menuBefore.widths);
  assert.deepEqual(menuEnabled.widths, menuBefore.widths);
  assert.deepEqual(listAfter.widths, listBefore.widths);
  assert.deepEqual(errors, []);
});

/* softkeys.md 3.2: the entry page selects as the reader does; A on a word opens its entry, B comes back level by level */
const entryWordAt = (p, w) => p.evaluate((w) => {
  for (const d of document.querySelectorAll("#dict-sheet .dict-page .dl")) {
    const n = d.firstChild, i = n ? n.data.indexOf(w) : -1; if (i < 0) continue;
    const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length);
    const b = r.getClientRects()[0]; return [b.left + b.width / 2, b.top + b.height / 2];
  }
  return null;
}, w);
const entryPointer = (p, type, x, y, id) => p.evaluate(([type, x, y, id]) => document.querySelector("#dict-sheet .dict-page")
  .dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, bubbles: true, pointerType: "touch" })), [type, x, y, id]);
const marked = (p) => p.$$eval("#dict-sheet .dict-page mark", (l) => l.map((x) => x.textContent).join(""));
const entryTitle = (p) => p.textContent("#dict-sheet .sheet-title span");
const longPress = async (p, w, id) => {
  const [x, y] = await entryWordAt(p, w);
  await entryPointer(p, "pointerdown", x, y, id); await p.waitForTimeout(600); await entryPointer(p, "pointerup", x, y, id);
};
/* START's menu over a selection: its rows, the highlighted one marked with "*" */
const selMenu = (p, where) => p.$$eval(where + " .sel-menu li", (l) => l.map((x) => (x.classList.contains("on") ? "*" : "") + x.textContent));
const openWord = async (p, w, want) => {
  await typeWord(p, w); await p.press("#dict-q", "Enter");
  await p.waitForFunction((want) => want.test(document.querySelector("#dict-sheet .dict-page")?.textContent || ""), want);
};

test("dictionary: select on an entry, look up a word in it, B back level by level, START's menu quotes or copies", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await dictPage(t, { viewport: { width: 390, height: 600 } });
  await p.addStyleTag({ content: "#dict-sheet .dict-page{flex:0 0 144px}" });
  await p.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWord(p, "apple", /苹果/);
  assert.match(await p.textContent("#dict-sheet .sk-select"), /选字/);
  /* long-press "fruit", drag to "yellow" */
  const [fx, fy] = await entryWordAt(p, "fruit"), [yx, yy] = await entryWordAt(p, "yellow");
  await entryPointer(p, "pointerdown", fx, fy, 3); await p.waitForTimeout(600);
  assert.equal(await marked(p), "fruit");
  await entryPointer(p, "pointermove", yx, yy, 3); await entryPointer(p, "pointerup", yx, yy, 3);
  assert.equal(await marked(p), "fruit with red or yellow");
  assert.deepEqual(await p.$$eval("#dict-sheet .sk", (l) => l.map((x) => x.textContent)), ["SELECT词", "START摘抄…", "B取消", "A查词"]);
  /* a tap ends it and stays on the entry */
  await entryPointer(p, "pointerdown", yx, yy, 4); await entryPointer(p, "pointerup", yx, yy, 4);
  assert.equal(await marked(p), "");
  assert.equal(await entryTitle(p), "apple");
  /* SELECT widens: the sentence ("n." ends one), the line, back to the word */
  await longPress(p, "fruit", 5);
  await p.keyboard.press("Shift");
  assert.equal(await marked(p), "fruit with red or yellow or green skin and sweet to tart crisp whitish flesh");
  assert.match(await p.textContent("#dict-sheet .sk-select"), /句/);
  await p.keyboard.press("Shift");
  assert.equal(await marked(p), "n. fruit with red or yellow or green skin and sweet to tart crisp whitish flesh");
  await p.keyboard.press("Shift");
  assert.equal(await marked(p), "fruit");
  /* B cancels the selection, not the entry */
  await p.keyboard.press("z");
  assert.equal(await marked(p), "");
  assert.equal(await entryTitle(p), "apple");
  /* A on "green": its entry, one level down; there the page scrolls, and B comes back to it where it was */
  await longPress(p, "green", 6);
  await p.keyboard.press("x");
  await p.waitForFunction(() => document.querySelector("#dict-sheet .sheet-title span")?.textContent === "green"
    && /绿色/.test(document.querySelector("#dict-sheet .dict-page").textContent));
  await p.evaluate(() => { const g = document.querySelector("#dict-sheet .dict-page"); g.scrollTop = 48; g.dispatchEvent(new Event("scroll")); });
  assert.equal(await p.evaluate(() => document.querySelector("#dict-sheet .dict-page").scrollTop), 48);
  /* SELECT starts on the first word on screen; the cursor reaching the bottom scrolls a line */
  await p.keyboard.press("Shift");
  const first = await p.evaluate(() => {
    const g = document.querySelector("#dict-sheet .dict-page"), m = g.querySelector("mark");
    return m.getBoundingClientRect().top - g.getBoundingClientRect().top;
  });
  assert.ok(first >= 0 && first < 24, `the cursor starts on the first line on screen (${first})`);
  const seen = await p.evaluate(() => document.querySelector("#dict-sheet .dict-page").clientHeight);
  for (let i = 0; i < Math.ceil(seen / 24) + 1; i++) await p.keyboard.press("ArrowDown");
  const scrolled = await p.evaluate(() => document.querySelector("#dict-sheet .dict-page").scrollTop);
  assert.ok(scrolled > 48 && scrolled % 24 === 0, `scrolled by whole lines (${scrolled})`);
  await p.keyboard.press("z");
  await p.evaluate(() => { const g = document.querySelector("#dict-sheet .dict-page"); g.scrollTop = 48; g.dispatchEvent(new Event("scroll")); });
  await longPress(p, "green", 7);
  await p.keyboard.press("x");
  await p.waitForFunction(() => /绿色/.test(document.querySelector("#dict-sheet .dict-page")?.textContent || "") && !document.querySelector("#dict-sheet mark"));
  await p.keyboard.press("z");
  assert.equal(await entryTitle(p), "green");
  assert.equal(await p.evaluate(() => document.querySelector("#dict-sheet .dict-page").scrollTop), 48, "B restores the scroll");
  await p.keyboard.press("z");
  assert.equal(await entryTitle(p), "apple");
  /* ten levels at most: from apple, "green" ten times over makes eleven, and the oldest (apple) is dropped */
  for (let i = 0; i < 10; i++) {
    await longPress(p, "green", 10 + i);
    await p.keyboard.press("x");
    await p.waitForFunction(() => /绿色/.test(document.querySelector("#dict-sheet .dict-page")?.textContent || "") && !document.querySelector("#dict-sheet mark"));
  }
  for (let i = 0; i < 9; i++) await p.keyboard.press("z");
  assert.equal(await entryTitle(p), "green");
  await p.keyboard.press("z");
  assert.ok(await p.isHidden("#dict-sheet"));
  /* START: a menu, 摘抄 then 复制; B goes back to the same selection */
  await openWord(p, "green", /绿色/);
  await p.evaluate(() => navigator.clipboard.writeText("before"));
  await longPress(p, "pigment", 30);
  await p.keyboard.press("Enter");
  assert.deepEqual(await selMenu(p, "#dict-sheet"), ["*摘抄", "复制"]);
  await p.keyboard.press("z");
  assert.ok(await p.isHidden("#dict-sheet .sel-menu"));
  assert.equal(await marked(p), "pigment");
  assert.match(await p.textContent("#dict-sheet .sk-start"), /摘抄…/);
  /* 摘抄 writes the note 《词典》 under the entry's word and leaves the clipboard alone */
  await p.keyboard.press("Enter"); await p.keyboard.press("x");
  await p.waitForFunction(() => /已摘抄/.test(document.getElementById("toast").textContent));
  assert.equal(await marked(p), "");
  assert.ok(await p.isHidden("#dict-sheet .sel-menu"));
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), "before");
  const notes = () => p.evaluate(() => LP.S.refs.notes.get().then((q) => q.docs.map((d) => d.data().body)));
  assert.deepEqual(await notes(), ["《词典》\n\n《词典》 green\n「pigment」"]);
  /* 复制 copies and writes no note */
  await longPress(p, "pigment", 31);
  await p.keyboard.press("Enter"); await p.keyboard.press("ArrowDown");
  assert.deepEqual(await selMenu(p, "#dict-sheet"), ["摘抄", "*复制"]);
  await p.keyboard.press("x");
  await p.waitForFunction(() => /已复制/.test(document.getElementById("toast").textContent));
  assert.equal(await marked(p), "");
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), "pigment");
  assert.deepEqual(await notes(), ["《词典》\n\n《词典》 green\n「pigment」"]);
  assert.deepEqual(errors, []);
});

/* a touch drag held below the entry scrolls it a line at a time and the selection follows; it stops at the end, and on release */
test("dictionary: a drag held at the bottom edge of an entry scrolls it and grows the selection; letting go stops it", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await dictPage(t, { viewport: { width: 390, height: 600 } });
  await p.addStyleTag({ content: "#dict-sheet .dict-page{flex:0 0 144px}" });
  await openWord(p, "green", /绿色/);
  const top = () => p.evaluate(() => document.querySelector("#dict-sheet .dict-page").scrollTop);
  const frame = await p.evaluate(() => { const r = document.querySelector("#dict-sheet .dict-page").getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  const [x, y] = await entryWordAt(p, "pigment");
  await entryPointer(p, "pointerdown", x, y, 3); await p.waitForTimeout(600);
  assert.equal(await marked(p), "pigment");
  /* above the top while at the top: nothing to scroll */
  await entryPointer(p, "pointermove", x, frame.top - 30, 3); await p.waitForTimeout(400);
  assert.equal(await top(), 0);
  /* inside the frame: no scrolling */
  await entryPointer(p, "pointermove", x, frame.top + 60, 3); await p.waitForTimeout(400);
  assert.equal(await top(), 0);
  /* held below the bottom: the page scrolls by whole lines and the selection grows with it */
  await entryPointer(p, "pointermove", x, frame.bottom + 30, 3);
  await p.waitForTimeout(400);
  const t1 = await top(), m1 = await marked(p);
  assert.ok(t1 > 0 && t1 % 24 === 0, `scrolled by whole lines (${t1})`);
  assert.ok(m1.startsWith("pigment") && m1.length > "pigment".length, m1);
  await p.waitForTimeout(400);
  const t2 = await top(), m2 = await marked(p);
  assert.ok(t2 > t1, `it keeps scrolling while held (${t1} -> ${t2})`);
  assert.ok(m2.length > m1.length, "and the selection keeps growing");
  /* the selection's far end is under the finger, kept inside the frame: a word on the last line in view */
  const end = await p.evaluate(() => { const l = [...document.querySelectorAll("#dict-sheet .dict-page mark")].pop().getClientRects(); const r = l[l.length - 1]; return { top: r.top, bottom: r.bottom }; });
  assert.ok(end.top < frame.bottom - 10 && end.bottom > frame.bottom - 24 - 10, `the far end is on the last line in view (${end.top}..${end.bottom}, frame ends at ${frame.bottom})`);
  /* let go: it stops */
  await entryPointer(p, "pointerup", x, frame.bottom + 30, 3);
  const t3 = await top(), m3 = await marked(p);
  await p.waitForTimeout(400);
  assert.equal(await top(), t3);
  assert.equal(await marked(p), m3);
  /* held long enough, it stops at the end of the entry */
  await entryPointer(p, "pointerdown", x, frame.top + 60, 4); await entryPointer(p, "pointerup", x, frame.top + 60, 4);
  assert.equal(await marked(p), "", "a tap ends it");
  await entryPointer(p, "pointerdown", x, frame.top + 40, 5); await p.waitForTimeout(600);
  assert.notEqual(await marked(p), "");
  await entryPointer(p, "pointermove", x, frame.bottom + 30, 5);
  await p.waitForFunction(() => { const g = document.querySelector("#dict-sheet .dict-page"); return g.scrollTop >= g.scrollHeight - g.clientHeight - 1; }, null, { timeout: 20000 });
  await entryPointer(p, "pointerup", x, frame.bottom + 30, 5);
  assert.deepEqual(errors, []);
});

/* an entry shows whole lines, as an LCD would, and ▼ reaches its true end even when that is not a whole line down
   (PR #43 stopped at the last whole line, so an entry a few pixels too tall hid half its last line) */
test("dictionary: the entry page is whole lines high; ▼ reaches the very end, ▲ comes back to the top", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await dictPage(t, { viewport: { width: 390, height: 640 } });
  const geom = () => p.evaluate(() => { const g = document.querySelector("#dict-sheet .dict-page");
    return { top: g.scrollTop, max: g.scrollHeight - g.clientHeight, h: g.clientHeight, css: getComputedStyle(g).height }; });
  const settle = async () => { let a = -1, b = (await geom()).top;
    while (a !== b) { await p.waitForTimeout(250); a = b; b = (await geom()).top; } };
  await openWord(p, "fang", /fang|尖牙|牙/);
  /* whole lines at three window sizes, and the soft keys stay inside the sheet */
  const keysIn = () => p.evaluate(() => document.querySelector("#dict-sheet .softkeys").getBoundingClientRect().bottom
    <= document.getElementById("dict-sheet").getBoundingClientRect().bottom + 0.5);
  for (const [w, h] of [[331, 359], [346, 518], [386, 606]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(300);
    const g = await geom();
    assert.equal(g.h % 24, 0, `whole lines in a ${w}x${h} window (${g.h} px)`);
    assert.ok(await keysIn(), `the keys stay on screen in a ${w}x${h} window`);
  }
  /* and on the smallest screen itself, 331x359 (as the calendar's test sizes it) */
  await p.setViewportSize({ width: 375, height: 844 });
  await p.evaluate(() => {
    const screen = document.getElementById("screen"), status = screen.querySelector(".status");
    screen.style.flex = "none";
    screen.style.height = (359 + 12 + status.getBoundingClientRect().height) + "px";
    window.dispatchEvent(new Event("resize"));
  });
  await p.waitForTimeout(300);
  assert.deepEqual(await p.evaluate(() => { const r = document.getElementById("v-dict").getBoundingClientRect(); return [r.width, r.height]; }), [331, 359]);
  const small = await geom();
  assert.ok(small.h > 0 && small.h % 24 === 0, `whole lines on a 331x359 screen (${small.h} px)`);
  assert.ok(await keysIn(), "the keys stay on screen at 331x359");
  await p.evaluate(() => { document.getElementById("screen").style.flex = ""; document.getElementById("screen").style.height = ""; });
  /* a height where the page as it was before (filling all its space) overflows by 1-23 px: measured, not assumed */
  let found = 0;
  for (let h = 420; h <= 900 && !found; h++) {
    await p.setViewportSize({ width: 390, height: h });
    const over = await p.evaluate(() => {
      const g = document.querySelector("#dict-sheet .dict-page"), keep = [g.style.flex, g.style.height, g.style.marginBottom];
      g.style.flex = ""; g.style.height = ""; g.style.marginBottom = "";
      const o = g.scrollHeight - g.clientHeight;
      [g.style.flex, g.style.height, g.style.marginBottom] = keep;
      return o;
    });
    if (over >= 1 && over <= 23) found = h;
  }
  assert.ok(found, "a height where the old page overflowed by under a line");
  await p.waitForTimeout(300);
  const g0 = await geom();
  assert.equal(g0.h % 24, 0, `whole lines (${g0.h} px)`);
  assert.ok(g0.max > 0, "the entry runs past the page");
  /* ▼ to the end: exactly scrollHeight - clientHeight, and the last line shows whole */
  for (let i = 0; i < 40 && (await geom()).top < g0.max - 0.5; i++) { await p.keyboard.press("ArrowDown"); await settle(); }
  const end = await geom();
  assert.ok(Math.abs(end.top - end.max) <= 1, `▼ reaches the end (${end.top} of ${end.max})`);
  const last = await p.evaluate(() => { const g = document.querySelector("#dict-sheet .dict-page"), l = [...g.querySelectorAll(".dl")].pop();
    return [l.getBoundingClientRect().bottom, g.getBoundingClientRect().bottom]; });
  assert.ok(last[0] <= last[1] + 0.5, `the last line is whole (${last[0]} <= ${last[1]})`);
  const pages = await p.textContent("#dict-sheet .sheet-title small");
  const m = pages.match(/(\d+)\/(\d+)/);
  assert.ok(m && m[1] === m[2], `the counter is on its last page (${pages})`);
  /* ▲ back to the top */
  for (let i = 0; i < 40 && (await geom()).top > 0; i++) { await p.keyboard.press("ArrowUp"); await settle(); }
  assert.equal((await geom()).top, 0);
  assert.deepEqual(errors, []);
});

test("dictionary: no selection while reviewing the word book", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await dictPage(t);
  await openWord(p, "apple", /苹果/);
  await p.keyboard.press("Enter");                              /* START: into the word book */
  await p.keyboard.press("z");
  await p.click("#dict-keys .sk-select");
  await p.click("#dict-sheet .sk-a");
  await p.keyboard.press("x");                                  /* A: show the entry */
  await p.waitForFunction(() => /苹果/.test(document.querySelector("#dict-sheet .dict-page")?.textContent || ""));
  assert.equal((await p.textContent("#dict-sheet .sk-select")).trim(), "SELECT");
  const [x, y] = await entryWordAt(p, "fruit");
  await entryPointer(p, "pointerdown", x, y, 3); await p.waitForTimeout(600); await entryPointer(p, "pointerup", x, y, 3);
  assert.equal(await marked(p), "");
  await p.keyboard.press("Shift");                              /* SELECT leaves the review, as before */
  assert.equal(await marked(p), "");
  assert.ok(await p.isVisible("#dict-sheet .lcd-menu"));
  assert.deepEqual(errors, []);
});

/* stands in for the phone's speech: getVoices is empty until voiceschanged, as on iOS; speak and cancel are recorded */
function fakeSpeech(voices) {
  const heard = [], said = (window.__said = []);
  let list = [];
  window.__cancels = 0;
  const synth = {
    speaking: false, pending: false, paused: false,
    getVoices: () => list.slice(),
    speak: (u) => said.push({ text: u.text, voice: u.voice && u.voice.name, lang: u.lang, volume: u.volume }),
    cancel: () => { window.__cancels++; },
    pause() {}, resume() {},
    addEventListener: (type, fn) => { if (type === "voiceschanged") heard.push(fn); },
    removeEventListener() {}
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.voice = null; this.lang = ""; this.volume = 1; };
  setTimeout(() => { list = voices; heard.forEach((fn) => fn({ type: "voiceschanged" })); }, 200);
}
const VOICES = [{ name: "Amélie", lang: "fr-FR" }, { name: "Karen", lang: "en-AU" }, { name: "Samantha", lang: "en_US" }, { name: "Daniel", lang: "en-GB" }];
const said = (p) => p.evaluate(() => window.__said.slice());
const cancels = (p) => p.evaluate(() => window.__cancels);
const sayKey = (p) => p.evaluate(() => { const b = document.querySelector("#dict-sheet .sk-a"); return [b.textContent.replace(/^A/, ""), b.disabled]; });
/* the voices arrive after the entry is open: the slot lights up once they do */
const sayReady = (p) => p.waitForFunction(() => { const b = document.querySelector("#dict-sheet .sk-a"); return b && !b.disabled; });

test("dictionary: A on an entry says the headword with an English voice; a tap on the headword too; leaving stops it", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await dictPage(t, { init: fakeSpeech, arg: VOICES });
  await openWord(p, "apple", /苹果/);
  await sayReady(p);
  assert.deepEqual(await sayKey(p), ["发音", false]);
  assert.match(await p.textContent("#dict-sheet .sk-b"), /返回/);
  await p.keyboard.press("x");
  /* en-US (or en-GB) before any other English voice; the default volume step is 2 of 4: 0.25 of the top gain 0.6 */
  const first = (await said(p))[0];
  assert.deepEqual([first.text, first.voice, first.lang], ["apple", "Samantha", "en_US"]);
  assert.ok(Math.abs(first.volume - 0.25 / 0.6) < 1e-9, "volume " + first.volume);
  assert.ok(await p.isVisible("#dict-sheet"), "A no longer goes back");
  /* the soft key and the headword in the title say it too */
  await p.click("#dict-sheet .sk-a");
  await p.click("#dict-sheet .sheet-title span");
  assert.deepEqual((await said(p)).map((x) => x.text), ["apple", "apple", "apple"]);
  /* a word form: the entry is for the lemma, and so is the voice */
  await p.keyboard.press("z");
  await openWord(p, "ran", /跑/);
  await p.keyboard.press("x");
  assert.equal((await said(p)).at(-1).text, "run");
  /* B back, HOME: anything being said stops */
  let c = await cancels(p);
  await p.keyboard.press("z");
  assert.ok(await cancels(p) > c, "back cancels");
  await openWord(p, "apple", /苹果/);
  c = await cancels(p);
  await p.click("#home-key");
  assert.ok(await cancels(p) > c, "HOME cancels");
  assert.deepEqual(errors, []);
});

test("dictionary: the say slot is dimmed at volume 0 and without an English voice; review keeps A", { skip, timeout: 60000 }, async (t) => {
  {
    const { p, errors } = await dictPage(t, { init: fakeSpeech, arg: [{ name: "Amélie", lang: "fr-FR" }, { name: "Tingting", lang: "zh-CN" }] });
    await openWord(p, "apple", /苹果/);
    await p.waitForTimeout(400);
    assert.deepEqual(await sayKey(p), ["发音", true]);
    await p.keyboard.press("x");
    await p.click("#dict-sheet .sheet-title span");
    assert.deepEqual(await said(p), []);
    assert.ok(await p.isVisible("#dict-sheet"));
    assert.deepEqual(errors, []);
  }
  const { p, errors } = await dictPage(t, { init: fakeSpeech, arg: VOICES });
  /* volume 0 in Settings */
  await p.click("#home-key");
  await p.locator("#home .app", { hasText: "设置" }).click();
  await p.click("#set-vol-down"); await p.click("#set-vol-down");
  assert.equal(await p.evaluate(() => LP.SND.vol), 0);
  await p.click("#home-key");
  await p.locator("#home .app", { hasText: "词典" }).click();
  await openWord(p, "apple", /苹果/);
  await p.waitForTimeout(400);
  assert.deepEqual(await sayKey(p), ["发音", true]);
  await p.keyboard.press("x");
  assert.deepEqual(await said(p), []);
  /* back to step 1: the slot works, quietly */
  await p.click("#home-key");
  await p.locator("#home .app", { hasText: "设置" }).click();
  await p.click("#set-vol-up");
  await p.click("#home-key");
  await p.locator("#home .app", { hasText: "词典" }).click();
  await openWord(p, "apple", /苹果/);
  await sayReady(p);
  await p.keyboard.press("x");
  assert.ok(Math.abs((await said(p))[0].volume - 0.12 / 0.6) < 1e-9);
  /* review: A shows the entry, then the next word, and says nothing */
  await p.keyboard.press("Enter");                              /* START: into the word book */
  await p.keyboard.press("z");
  await p.click("#dict-keys .sk-select");
  await p.click("#dict-sheet .sk-a");
  assert.equal((await p.textContent("#dict-sheet .dict-page .big")).trim(), "apple");
  assert.match(await p.textContent("#dict-sheet .sk-a"), /看释义/);
  await p.keyboard.press("x");
  await p.waitForFunction(() => /苹果/.test(document.querySelector("#dict-sheet .dict-page")?.textContent || ""));
  assert.match(await p.textContent("#dict-sheet .sk-a"), /下一词/);
  await p.click("#dict-sheet .sheet-title span");
  assert.equal((await said(p)).length, 1);
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
  await p.waitForFunction(() => document.getElementById("rd-page").getBoundingClientRect().height > 0);
  const pageWithoutSelection = await p.locator("#rd-page").evaluate((page) => page.getBoundingClientRect().height);
  const baselineParts = await p.evaluate(() => ({
    book: document.getElementById("rd-book").getBoundingClientRect().height,
    foot: document.getElementById("rd-foot").getBoundingClientRect().height,
    keysHidden: document.getElementById("rd-keyrow").hidden,
    statusHidden: document.getElementById("rd-foot").hidden
  }));
  assert.equal(baselineParts.keysHidden, true);
  assert.equal(baselineParts.statusHidden, false);
  assert.equal(pageWithoutSelection + baselineParts.foot, baselineParts.book, "no-selection page keeps the pre-PR status-footer layout");
  await p.keyboard.press("Shift");
  await p.waitForFunction(() => !document.getElementById("rd-keyrow").hidden);
  const selectionParts = await p.evaluate(() => ({
    page: document.getElementById("rd-page").getBoundingClientRect().height,
    book: document.getElementById("rd-book").getBoundingClientRect().height,
    bar: document.getElementById("rd-keys").getBoundingClientRect().height,
    statusHidden: document.getElementById("rd-foot").hidden
  }));
  assert.equal(selectionParts.statusHidden, true);
  assert.equal(selectionParts.page + selectionParts.bar, selectionParts.book, "selection page gives the bar its space");
  assert.equal(pageWithoutSelection - selectionParts.page, selectionParts.bar - baselineParts.foot);
  await p.keyboard.press("z");
  assert.equal(await p.locator("#rd-flow mark").count(), 0);
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

test("reader: long-press and drag selects, SELECT widens to the sentence, A looks up, START adds to the word book, START's menu quotes or copies", { skip, timeout: 60000 }, async (t) => {
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
  assert.deepEqual(await p.$$eval("#rd-keys .sk", (l) => l.map((x) => x.textContent)), ["SELECT词", "START摘抄…", "B取消", "A查词"]);
  assert.equal(await p.locator("#rd-copy").count(), 0, "no copy button: START's menu copies");
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
  assert.match(await p.textContent("#rd-keys .sk-select"), /句/);
  await p.keyboard.press("Shift");
  const para = await p.evaluate(() => document.querySelectorAll("#rd-flow > p")[1].textContent);
  assert.equal(await p.$$eval("#rd-flow mark", (l) => l.map((x) => x.textContent).join("")), para);
  await p.keyboard.press("Shift");                              /* back to a word */
  assert.equal(await p.textContent("#rd-flow mark"), "sister");
  /* START: a menu, 摘抄 then 复制; B goes back to the same selection */
  await p.evaluate(() => navigator.clipboard.writeText("before"));
  await p.keyboard.press("Enter");
  assert.deepEqual(await selMenu(p, "#v-reader"), ["*摘抄", "复制"]);
  await p.keyboard.press("z");
  assert.ok(await p.isHidden("#rd-selmenu"));
  assert.equal(await p.textContent("#rd-flow mark"), "sister");
  /* 复制, tapped: copies, writes no note, ends the selection */
  await p.keyboard.press("Enter");
  await p.click("#rd-selmenu li:nth-child(2)");
  await p.waitForFunction(() => /已复制/.test(document.getElementById("toast").textContent));
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), "sister");
  assert.equal(await p.locator("#rd-flow mark").count(), 0);
  assert.ok(await p.isHidden("#rd-selmenu"));
  assert.ok(await p.isHidden("#rd-def"));
  assert.equal(await p.locator("#rd-flow u.hl").count(), 0);
  const notes = () => p.evaluate(() => LP.S.refs.notes.get().then((q) => q.docs.map((d) => d.data().body)));
  assert.deepEqual(await notes(), []);
  /* 摘抄 (A): the note and the underline, and the clipboard stays as it was */
  await p.evaluate(() => navigator.clipboard.writeText("before"));
  await press(sx, sy, 8); await p.waitForTimeout(600); await lift(sx, sy, 8);
  await p.keyboard.press("Enter"); await p.keyboard.press("x");
  await p.waitForSelector("#rd-thought");
  await p.waitForFunction(() => /已摘抄/.test(document.getElementById("toast").textContent));
  assert.equal(await p.$$eval("#rd-flow u.hl", (l) => l.map((x) => x.textContent).join("")), "sister");
  assert.equal(await p.evaluate(() => navigator.clipboard.readText()), "before");
  assert.equal((await notes()).length, 1);
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
  await p.keyboard.press("Enter"); await p.keyboard.press("x");  /* START, A: 摘抄 */
  await p.waitForSelector("#rd-thought");
  assert.equal(await p.locator("#rd-flow mark").count(), 0, "the selection ends");
  assert.equal(await p.$$eval("#rd-flow u.hl", (l) => l.map((x) => x.textContent).join("")), sentence);
  await p.fill("#rd-thought", "第一句心得。");
  await p.click("#rd-def .sk-a");
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
  await p.click("#rd-def .sk-a");                               /* (X would type into the box) */
  await p.waitForSelector("#rd-def", { state: "hidden" });
  await p.touchscreen.tap(spot.x, spot.y);
  await p.waitForSelector("#rd-def:not([hidden])");
  assert.match(await p.textContent("#rd-def"), /第一句心得。\s*再读一遍/);
  await p.keyboard.press("Enter");
  assert.match(await p.textContent("#rd-def"), /START确认/);
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
  await p.keyboard.press("Enter"); await p.keyboard.press("x");
  await p.waitForSelector("#rd-thought");
  await p.fill("#rd-thought", "心得。");
  await p.click("#rd-def .sk-a");
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
  await p.addScriptTag({ content: await readFile(join(ROOT, "registry/apps/paper-tower/src/music.js"), "utf8") });
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
    const tune = await render(30, song(PT.MUSIC.title));
    const fx = await render(1, (c) => c.sfx(LopdaChip.sfxParams({ ms: 400 })));
    const mute = await render(30, song(PT.MUSIC.title), 0);
    const muteFx = await render(1, (c) => c.sfx(LopdaChip.sfxParams({ ms: 400 })), 0);
    return { loop: [loop.at(0, 0.5), loop.at(0.6, 1.9), loop.at(2, 2.5), loop.at(4, 4.5)], tuneEnd: tune.last,
      ratio: tune.rms / fx.rms, mute: mute.peak, muteFx: muteFx.peak };
  });
  assert.ok(r.loop[0] > 0.02 && r.loop[1] === 0 && r.loop[2] > 0.02 && r.loop[3] > 0.02, "c at 0 s, 2 s and 4 s: " + r.loop);
  assert.ok(Math.abs(r.tuneEnd - 30) < 0.05, "the paper tower's title tune is 30 s: " + r.tuneEnd);
  assert.ok(r.ratio > 0.3 && r.ratio < 0.65, "the whole title tune against one default effect, by rms: " + r.ratio);
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
  const tower = await readFile(join(ROOT, "registry/apps/paper-tower/index.html"), "utf8");
  await runInRuntime(p, "paper-tower", tower);
  /* the title asks for the tune at once; nobody has touched anything yet, so it waits */
  await until((s) => s.waiting, "the tune to be held");
  assert.equal((await state()).playing, false);
  await p.keyboard.press("x");
  await until((s) => s.playing && !s.waiting, "the tune to start on the first key");
  assert.equal(await p.evaluate(() => LP.SND.ctx.state), "running");
  await p.click("#home-key");
  assert.deepEqual(await state(), QUIET);
  /* again, then switch straight to another app */
  await runInRuntime(p, "paper-tower", tower);
  await until((s) => s.playing, "the tune to start again (audio is unlocked now)");
  await runInRuntime(p, "quiet", "<!doctype html><html><body>quiet</body></html>");
  assert.deepEqual(await state(), QUIET);
  /* at volume 0 (off) the song keeps going, silently */
  await p.evaluate(() => { LP.SND.vol = 0; });
  await runInRuntime(p, "paper-tower", tower);
  await until((s) => s.playing, "the tune under the sound switch");
  assert.equal(await p.evaluate(() => LP.SND.gain.gain.value), 0);
  await p.click("#home-key");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("sound: a context the phone stopped is woken or replaced on the next touch, and the song goes on from where it was", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  const tower = await readFile(join(ROOT, "registry/apps/paper-tower/index.html"), "utf8");
  await runInRuntime(p, "paper-tower", tower);
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

test("music in the dev harness: the paper tower's tune waits for a key, then plays; a reload stops it and the new run starts it again", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.addInitScript(() => Object.defineProperty(navigator, "userActivation", { value: { hasBeenActive: false, isActive: false } }));
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/paper-tower`, { waitUntil: "load" });
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
    /* the paper tower's title tune through the same output, start to end */
    const tune = await render(30, song(PT.MUSIC.title));
    out.tune = tune.rms;
    return out;
  });
  const names = ["rain", "waves", "waterfall", "wind", "fire", "stream"];
  t.diagnostic(JSON.stringify(r));
  for (const n of names) {
    assert.ok(r[n].rms > 0.01, n + " is audible: " + r[n].rms);
    assert.equal(r[n].mute, 0, n + " at level 0");
    /* §5: under the music, with room to spare */
    assert.ok(r[n].rms < 0.7 * r.tune, `${n} (${r[n].rms}) is under the paper tower's title tune (${r.tune})`);
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
async function camPage(t, init, arg, query = "") {
  const cam = await pw.chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  t.after(() => cam.close());
  const ctx = await cam.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN", reducedMotion: "reduce", serviceWorkers: "block", permissions: ["camera"] });
  if (init) await ctx.addInitScript(init, arg);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const open = async () => {
    await p.goto(base + "/runtime/" + query, { waitUntil: "networkidle" });
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

/* the finder's three states (docs/decisions.md section 4): live, starting, none. Only "none" may open the system camera.
   cameraHooks counts the clicks on #cam-file (and swallows them: no file chooser), can hold getUserMedia until
   __releaseCamera(), and can keep the video from ever giving a picture (videoWidth 0) */
function cameraHooks({ hold, noFrames, noMedia }) {
  window.__fileClicks = 0;
  const click = HTMLElement.prototype.click;
  HTMLElement.prototype.click = function () { if (this.id === "cam-file") { window.__fileClicks++; return; } return click.call(this); };
  if (noMedia) { Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined }); return; }
  const md = navigator.mediaDevices;
  if (hold) {
    const gum = md.getUserMedia.bind(md);
    let open; const gate = new Promise((r) => { open = r; });
    window.__releaseCamera = open; window.__gum = 0;
    md.getUserMedia = (c) => { window.__gum++; return gate.then(() => gum(c)); };
    /* the page can be "hidden" by a test: document.hidden follows __hidden */
    Object.defineProperty(document, "hidden", { configurable: true, get: () => !!window.__hidden });
  }
  if (noFrames) {
    const w = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, "videoWidth");
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get() { return this.id === "cam-video" ? 0 : w.get.call(this); } });
  }
}
const camLog = (p) => p.evaluate(() => (window.LOPDA_DEBUG.cam || []).slice());
const pressA = async (p) => { await p.keyboard.down("x"); await p.waitForTimeout(60); await p.keyboard.up("x"); };
/* a photo from the system camera: a small grey PNG */
const photo = async (p) => ({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from(await p.evaluate(() => {
  const c = document.createElement("canvas"); c.width = 64; c.height = 48; const x = c.getContext("2d");
  x.fillStyle = "#888"; x.fillRect(0, 0, 64, 48); x.fillStyle = "#222"; x.fillRect(8, 8, 24, 24);
  return c.toDataURL("image/png").split(",")[1];
}), "base64") });

test("camera: a shutter press while the camera is still opening never opens the system camera", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, open, tag } = await camPage(t, cameraHooks, { hold: true }, "?debug");
  await open();
  await p.waitForSelector("#cam-load:not([hidden])"); await p.click("#roll-go");
  await p.waitForFunction(() => (window.LOPDA_DEBUG.cam || []).includes("starting"));
  /* the phone's prompt is up: A (press and release) and the 拍 key, quickly, a few times */
  for (let i = 0; i < 3; i++) { await pressA(p); await p.click("#cam-shutter"); }
  assert.equal(await p.evaluate(() => window.__fileClicks), 0, "no system camera while the finder starts");
  assert.ok((await camLog(p)).filter((s) => s === "shutter: starting").length >= 6);
  assert.match(await p.textContent("#cam-count"), /^01\//);
  /* the prompt is answered: the finder comes, and A shoots on the press */
  await p.evaluate(() => window.__releaseCamera());
  await tag("LIVE 后置");
  await p.waitForFunction(() => (window.LOPDA_DEBUG.cam || []).includes("live"));
  await p.keyboard.down("x");
  await p.waitForFunction(() => (window.LOPDA_DEBUG.cam || []).includes("shutter: live"));
  await p.keyboard.up("x");
  await p.waitForFunction(() => /^02\//.test(document.getElementById("cam-count").textContent));
  assert.equal(await p.evaluate(() => window.__fileClicks), 0);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera: the page hidden and shown while the phone's prompt is up asks only once, and the finder comes", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, open, tag } = await camPage(t, cameraHooks, { hold: true }, "?debug");
  const flip = (h) => p.evaluate((h) => { window.__hidden = h; document.dispatchEvent(new Event("visibilitychange")); }, h);
  await open();
  await p.waitForSelector("#cam-load:not([hidden])"); await p.click("#roll-go");
  await p.waitForFunction(() => window.__gum === 1);
  await flip(true); await p.waitForTimeout(100); await flip(false); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => window.__gum), 1, "one request, not a second prompt");
  assert.ok((await camLog(p)).includes("hidden while opening"));
  await p.evaluate(() => window.__releaseCamera());
  await tag("LIVE 后置");
  await p.waitForFunction(() => (window.LOPDA_DEBUG.cam || []).includes("live"));
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera: a stream that never gives a picture is played again, restarted once, then the system camera takes over", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, open } = await camPage(t, cameraHooks, { noFrames: true }, "?debug");
  await open();
  await p.waitForSelector("#cam-load:not([hidden])"); await p.click("#roll-go");
  await p.waitForFunction(() => (window.LOPDA_DEBUG.cam || []).includes("stream on"));
  /* LIVE but no picture: A does nothing yet */
  await pressA(p);
  assert.equal(await p.evaluate(() => window.__fileClicks), 0);
  await p.waitForFunction(() => (window.LOPDA_DEBUG.cam || []).includes("none: no frame"), null, { timeout: 12000 });
  const log = await camLog(p);
  assert.ok(log.some((s) => s.startsWith("play ok: watchdog") || s.startsWith("play refused: watchdog")), "play() asked again");
  assert.ok(log.includes("restart: no frame"), "restarted once");
  assert.equal(log.filter((s) => s === "stream on").length, 2, "one restart, not more");
  assert.equal(await p.isHidden("#cam-live-tag"), true);
  assert.match(await p.textContent("#cam-mode"), /系统相机/);
  /* now A opens the system camera, on the release */
  await p.keyboard.down("x"); await p.waitForTimeout(60);
  assert.equal(await p.evaluate(() => window.__fileClicks), 0, "not on the press");
  await p.keyboard.up("x");
  assert.equal(await p.evaluate(() => window.__fileClicks), 1, "on the release");
  await p.setInputFiles("#cam-file", await photo(p));
  await p.waitForFunction(() => /^02\//.test(document.getElementById("cam-count").textContent));
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera: a track that ends restarts the finder, and it shoots again", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, open, tag } = await camPage(t, cameraHooks, {}, "?debug");
  await open();
  await p.waitForSelector("#cam-load:not([hidden])"); await p.click("#roll-go");
  await tag("LIVE 后置");
  await p.waitForFunction(() => (window.LOPDA_DEBUG.cam || []).includes("live"));
  await p.evaluate(() => { const k = document.getElementById("cam-video").srcObject.getVideoTracks()[0]; k.stop(); k.dispatchEvent(new Event("ended")); });
  await p.waitForFunction(() => { const l = window.LOPDA_DEBUG.cam || []; const i = l.indexOf("restart: ended"); return i >= 0 && l.indexOf("live", i) > i; }, null, { timeout: 10000 });
  await p.click("#cam-shutter");
  await p.waitForFunction(() => /^02\//.test(document.getElementById("cam-count").textContent));
  assert.equal(await p.evaluate(() => window.__fileClicks), 0);
  assert.ok(!(await camLog(p)).some((s) => s.startsWith("none")));
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera: with no live finder at all (no mediaDevices) A still opens the system camera on the release", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, open } = await camPage(t, cameraHooks, { noMedia: true }, "?debug");
  await open();
  await p.waitForSelector("#cam-load:not([hidden])"); await p.click("#roll-go");
  await p.waitForFunction(() => /HTTPS/.test(document.getElementById("cam-mode").textContent));
  await p.keyboard.down("x"); await p.waitForTimeout(60);
  assert.equal(await p.evaluate(() => window.__fileClicks), 0, "not on the press");
  await p.keyboard.up("x");
  assert.equal(await p.evaluate(() => window.__fileClicks), 1);
  await p.click("#cam-shutter");
  assert.equal(await p.evaluate(() => window.__fileClicks), 2, "the 拍 key too");
  await p.setInputFiles("#cam-file", await photo(p));
  await p.waitForFunction(() => /^02\//.test(document.getElementById("cam-count").textContent));
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
  setDoc: (p, path, data) => p.evaluate(({ path, data }) => new Promise((res, rej) => { const r = indexedDB.open("lopda"); r.onerror = () => rej(r.error);
    r.onsuccess = () => { const tx = r.result.transaction("docs", "readwrite"); tx.objectStore("docs").put({ path, parent: path.slice(0, path.lastIndexOf("/")), data });
      tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = () => rej(tx.error); }; }), { path, data }),
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

test("darkroom: HOME closes a roll menu and reopening returns to the film box", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN", serviceWorkers: "block" });
  await p.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 404, body: "not found" }));
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await idb.setDoc(p, "data/users/local/rolls/items/reopen-roll", {
    id: "reopen-roll", stock: "sunny", size: 1, frames: [], bytes: 0, name: "Reopen test",
    loaded: Date.now(), out: Date.now()
  });
  await p.setViewportSize({ width: 331, height: 359 });
  const assertOneRow = async (selector) => {
    const value = await p.locator(selector).evaluate((bar) => {
      const boxes = [...bar.children].map((slot) => slot.getBoundingClientRect());
      return { height: bar.getBoundingClientRect().height, widths: boxes.map((box) => box.width), tops: boxes.map((box) => box.top) };
    });
    assert.equal(value.height, 44, selector);
    assert.deepEqual(new Set(value.tops).size, 1, selector);
    assert.ok(value.widths.every((width) => width === value.widths[0]), selector);
  };
  await p.locator("#home .app", { hasText: "冲洗店" }).click();
  await p.waitForFunction(() => /Reopen test/.test(document.getElementById("dk-list").textContent));
  await assertOneRow("#dk-keys");
  assert.equal(await p.textContent("#dk-keys .sk-a span"), "打开");
  assert.equal(await p.textContent("#dk-keys .sk-start span"), "打开");
  assert.equal(await p.textContent("#dk-keys .sk-select span"), "导入");
  assert.equal(await p.locator("#dk-import").count(), 0);
  await p.click("#dk-keys .sk-a");
  await p.waitForSelector("#dk-sheet:not([hidden])");
  await assertOneRow("#dk-keys");
  await p.keyboard.press("ArrowDown");                              /* past 冲洗 (step 2) to 起名 */
  await p.click("#dk-keys .sk-a");
  await assertOneRow("#dk-keys");
  await p.click("#dk-keys .sk-b");
  await p.keyboard.press("ArrowDown");
  await p.click("#dk-keys .sk-a");
  await assertOneRow("#dk-keys");
  await p.click("#dk-keys .sk-b");
  await p.keyboard.press("ArrowDown");
  await p.click("#dk-keys .sk-a");
  await assertOneRow("#dk-keys");
  await p.click("#dk-keys .sk-b");
  await p.click("#dk-keys .sk-b");
  await p.click("#home-key");
  await p.locator("#home .app", { hasText: "冲洗店" }).click();
  await p.waitForFunction(() => /Reopen test/.test(document.getElementById("dk-list").textContent));
  assert.ok(await p.isVisible("#v-dark"));
  assert.ok(await p.isHidden("#dk-sheet"));
  await p.keyboard.press("z");
  assert.ok(await p.isHidden("#dk-sheet"), "B on the first darkroom screen does not act on the old menu");
  assert.match(await p.textContent("#dk-list"), /Reopen test/);
  assert.deepEqual(notBlocked(errors), []);
});

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
  /* the last frame's latent is the picture, not black: it is drawn before the full roll's menu stops the stream */
  const brightness = await p.evaluate(async (key) => {
    const bmp = await createImageBitmap(await window.LopdaPlatform.files.get(key)), c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext("2d");
    x.drawImage(bmp, 0, 0); const d = x.getImageData(0, 0, bmp.width, bmp.height).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += Math.max(d[i], d[i + 1], d[i + 2]);
    return s / (d.length / 4);
  }, `roll/${id}/16.jpg`);
  assert.ok(brightness > 40, "the last latent is not black: mean " + brightness.toFixed(1));
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
  assert.equal(await p.textContent("#dk-keys .sk-a span"), "打开");
  assert.equal(await p.textContent("#dk-keys .sk-start span"), "打开");
  assert.equal(await p.textContent("#dk-keys .sk-select span"), "导入");
  const rowH = await p.$eval("#dk-list li.on", (e) => e.getBoundingClientRect().height);
  assert.ok(rowH >= 44, "row height " + rowH);

  /* name it: A opens the roll's menu */
  await press("x");
  assert.deepEqual(await p.$$eval("#dk-sheet li", (ls) => ls.map((l) => l.textContent)), ["冲洗", "起名", "导出底片", "扔掉"]);
  await press("ArrowDown"); await press("x");
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
  assert.equal(await p.textContent("#dk-keys .sk-start span"), "打开");
  assert.equal(await p.textContent("#dk-keys .sk-select span"), "导入");
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

/* ---------- darkroom step 2 (docs/design/darkroom.md section 9): developing, the viewer, the three prints ---------- */
/* width and height from a PNG's IHDR */
const pngSize = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

test("darkroom: develop a roll with blank frames, walk it in colour, print single, contact sheet and strip; a re-imported negative reprints byte for byte", { skip, timeout: 240000 }, async (t) => {
  const { p, errors, open } = await camPage(t);
  const fs = await import("node:fs/promises");
  const toast = (re) => p.waitForFunction((s) => { const el = document.getElementById("toast"); return !el.hidden && new RegExp(s).test(el.textContent); }, re.source, { timeout: 20000 });
  const press = async (key) => { await p.keyboard.down(key); await p.waitForTimeout(30); await p.keyboard.up(key); await p.waitForTimeout(60); };
  const save = async (action) => { const [d] = await Promise.all([p.waitForEvent("download", { timeout: 60000 }), action()]); return { name: d.suggestedFilename(), buf: await fs.readFile(await d.path()) }; };
  const items = () => p.$$eval("#dk-sheet li", (ls) => ls.map((l) => l.querySelector("span").textContent));
  const head = () => p.textContent("#dk-vno");
  const keyRect = () => p.evaluate(() => { const r = document.getElementById("dk-keys").getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });

  /* an 8-frame PORTRAIT roll: 6 shots, then rewound, so frames 7 and 8 are blank */
  await open();
  await p.waitForSelector("#cam-load:not([hidden])");
  await press("ArrowDown");                                          /* 12 -> 8 */
  assert.match(await p.textContent("#roll-count"), /8 张/);
  await press("x");
  await p.waitForSelector("#cam-live-tag:not([hidden])", { timeout: 10000 });
  for (let i = 0; i < 6; i++) {
    await p.click("#cam-shutter");
    await p.waitForFunction(() => document.getElementById("cam-shut").hidden, null, { timeout: 3000 });
    await p.waitForTimeout(120);
  }
  await press("Enter");                                              /* the body menu: rewind now */
  await p.locator("#menu-list li", { hasText: "提前倒片" }).click();
  await p.locator("#menu-list li").first().click();
  await p.waitForSelector("#cam-menu:not([hidden])");
  const id = (await idb.doc(p, "data/users/local/film")).roll;
  await p.locator("#menu-list li", { hasText: "取出胶卷" }).click();
  await toast(/胶卷放进冲洗店的胶卷盒了/);

  /* the darkroom: 冲洗 comes first on an undeveloped roll */
  await p.click("#home-key");
  await p.locator("#home .app", { has: p.locator(".label", { hasText: /^冲洗店$/ }) }).click();
  await p.waitForFunction(() => /人像 400/.test(document.getElementById("dk-list").textContent));
  const boxKeys = await keyRect();
  await press("x");
  assert.deepEqual(await items(), ["冲洗", "起名", "导出底片", "扔掉"], "no debug item without ?debug");
  const t0 = Date.now();
  await press("x");
  await p.waitForSelector("#dk-dev:not([hidden])");
  assert.match(await p.textContent("#dk-dev-step"), /^显影 \d\d\/08$/);
  await press("z"); await press("Enter");                            /* ignored while it develops */
  assert.ok(await p.isVisible("#dk-dev"));
  assert.ok(await p.isHidden("#dk-sheet"));
  await p.waitForSelector("#dk-view:not([hidden])", { timeout: 60000 });
  const took = Date.now() - t0;
  assert.ok(took >= 3500, "the animation runs at least its length: " + took);
  const roll = await idb.doc(p, `data/users/local/rolls/items/${id}`);
  assert.equal(roll.dev.v, 1); assert.equal(roll.dev.seed >>> 0, roll.dev.seed); assert.ok(Math.abs(roll.dev.at - Date.now()) < 120000);
  assert.deepEqual(Object.keys(roll.dev).sort(), ["at", "seed", "v"]);

  /* the viewer: colour, the header names frame, lens and date; ◀▶ walk, the blank frames too */
  await p.waitForFunction(() => document.getElementById("dk-vwait").hidden, null, { timeout: 20000 });
  assert.deepEqual(await keyRect(), boxKeys, "the key row keeps its box from the film box to the viewer");
  assert.equal(await p.textContent("#dk-keys .sk-start span"), "出片");
  assert.equal(await p.textContent("#dk-keys .sk-b span"), "返回");
  const colours = await p.evaluate(() => { const c = document.getElementById("dk-vcv"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, s = new Set();
    for (let i = 0; i < d.length; i += 4 * 7) s.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]); return s.size; });
  assert.ok(colours > 500, "colour on the LCD: " + colours + " colours");
  assert.equal(await head(), "01/08");
  assert.match(await p.textContent("#dk-vinfo"), /\d\d\.\d\d\.\d\d/);
  for (let k = 2; k <= 8; k++) { await press("ArrowRight"); assert.equal(await head(), String(k).padStart(2, "0") + "/08"); }
  await p.waitForFunction(() => document.getElementById("dk-vwait").hidden, null, { timeout: 20000 });
  assert.match(await p.textContent("#dk-vinfo"), /全曝光/);
  await press("ArrowRight"); assert.equal(await head(), "08/08", "stops at the end");
  for (let k = 0; k < 7; k++) await press("ArrowLeft");
  assert.equal(await head(), "01/08");

  /* pushing the print: the drag follows the finger, a quarter of the width or a flick turns the page, taps slide too */
  const photoBox = () => p.evaluate(() => { const r = document.getElementById("dk-photo").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const photoPixels = () => p.evaluate(() => { const c = document.getElementById("dk-vcv"), x = c.getContext("2d");
    return [[40, 40], [400, 350], [760, 660]].map(([px, py]) => Array.from(x.getImageData(px, py, 1, 1).data).join(",")); });
  const drag = async (from, to, steps = 8, delay = 0) => {
    const b = await photoBox(), y = b.y + b.h / 2, x0 = b.x + b.w * from, x1 = b.x + b.w * to;
    await p.mouse.move(x0, y); await p.mouse.down();
    for (let i = 1; i <= steps; i++) { await p.mouse.move(x0 + (x1 - x0) * i / steps, y); if (delay) await p.waitForTimeout(delay); }
    await p.mouse.up(); await p.waitForTimeout(280);
  };
  const tapAt = async (at) => { const b = await photoBox(), x = b.x + b.w * at, y = b.y + b.h / 2;
    await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(280); };
  await p.waitForTimeout(300);                       /* the last ◀ has landed */
  await p.waitForFunction(() => document.getElementById("dk-vwait").hidden, null, { timeout: 20000 });
  const px01 = await photoPixels();
  await press("ArrowRight"); await p.waitForTimeout(300);
  await p.waitForFunction(() => document.getElementById("dk-vwait").hidden, null, { timeout: 20000 });
  assert.equal(await head(), "02/08");
  const px02 = await photoPixels();
  await press("ArrowLeft"); await p.waitForTimeout(300);

  await drag(0.8, 0.3);                              /* left, half the width */
  assert.equal(await head(), "02/08");
  assert.deepEqual(await photoPixels(), px02, "a drag shows the frame the keys show");
  await drag(0.2, 0.7);                              /* right, half the width */
  assert.equal(await head(), "01/08");
  assert.deepEqual(await photoPixels(), px01, "a right drag goes back");
  /* regression: it used to step by where the finger lifted; now it pushes the print */
  await drag(0.75, 0.2);
  assert.equal(await head(), "02/08", "starting right and lifting left still goes on");
  await drag(0.5, 0.4, 10, 40);                      /* 10% of the width, slowly: no quarter, no flick */
  assert.equal(await head(), "02/08", "a short slow drag springs back");
  await drag(0.2, 0.7);
  assert.equal(await head(), "01/08");
  await drag(0.3, 0.8);                              /* past the first print */
  assert.equal(await head(), "01/08", "the first print does not go back");
  for (let k = 0; k < 7; k++) await press("ArrowRight");
  await p.waitForTimeout(300);
  await p.waitForFunction(() => document.getElementById("dk-vwait").hidden, null, { timeout: 20000 });
  assert.equal(await head(), "08/08");
  const px08 = await photoPixels();
  await drag(0.8, 0.2);                              /* past the last print */
  assert.equal(await head(), "08/08", "the last print does not go on");
  assert.deepEqual(await photoPixels(), px08);
  await press("ArrowLeft"); await p.waitForTimeout(300);
  assert.equal(await head(), "07/08");
  await tapAt(0.5);
  assert.equal(await head(), "07/08", "a tap in the middle does nothing");
  await tapAt(0.85);
  await p.waitForFunction(() => document.getElementById("dk-vwait").hidden, null, { timeout: 20000 });
  assert.equal(await head(), "08/08", "a tap on the right third steps on");
  assert.deepEqual(await photoPixels(), px08, "the tapped frame is the frame the keys show");
  for (let k = 0; k < 7; k++) await press("ArrowLeft");
  await p.waitForTimeout(300);
  assert.equal(await head(), "01/08");

  await press("x"); assert.ok(await p.isHidden("#dk-sheet"), "A does nothing here");

  /* prints: START opens the menu, B cancels it */
  await press("Enter");
  assert.deepEqual(await items(), ["单张", "印样", "胶片条"]);
  assert.equal(await p.textContent("#dk-keys .sk-b span"), "取消");
  await press("z"); assert.ok(await p.isHidden("#dk-sheet")); assert.ok(await p.isVisible("#dk-view"));
  assert.equal(await p.textContent("#dk-keys .sk-b span"), "返回", "cancelling the print menu puts the viewer's keys back");
  assert.equal(await p.textContent("#dk-keys .sk-start span"), "出片");
  await press("Enter");
  const single = await save(() => press("x"));
  assert.match(single.name, /^lopda-print-\d{8}-portrait-400-001-01\.png$/);
  assert.deepEqual(pngSize(single.buf), [1600, 1400]);
  await toast(/照片存好了/);
  await press("Enter"); await press("ArrowDown");
  const card = await save(() => press("x"));
  assert.match(card.name, /^lopda-contact-\d{8}-portrait-400-001\.png$/);
  assert.deepEqual(pngSize(card.buf), [1080, 1440]);
  await press("Enter"); await press("ArrowDown"); await press("ArrowDown");
  const strip = await save(() => press("x"));
  assert.match(strip.name, /^lopda-strip-\d{8}-portrait-400-001\.png$/);
  assert.deepEqual(pngSize(strip.buf), [200 + 8 * 272 - 16 + 64, 320]);
  assert.ok((await pngColours(strip.buf)).colours.length > 1000, "the strip is in colour");

  /* back to the box: developed, and the menu opens the pictures */
  await press("z");
  await p.waitForSelector("#dk-view", { state: "hidden" });
  assert.match(await p.textContent("#dk-list li.on"), /已冲洗/);
  await press("x");
  assert.deepEqual(await items(), ["看照片", "起名", "导出底片", "扔掉"]);

  /* the negative carries dev: export, throw the roll away, import it, reprint frame 1 */
  await press("ArrowDown"); await press("ArrowDown"); await press("x");
  await p.waitForFunction(() => /彩色原片/.test(document.getElementById("dk-sheet").textContent));
  await press("ArrowUp");
  const neg = await save(() => press("x"));
  await toast(/底片导出了/);
  await press("ArrowDown"); await press("x"); await press("ArrowUp"); await press("x");
  await toast(/扔掉了/);
  assert.equal(await idb.doc(p, `data/users/local/rolls/items/${id}`), null);
  await p.setInputFiles("#dk-file", { name: neg.name, mimeType: "image/png", buffer: neg.buf });
  await toast(/底片放进胶卷盒了/);
  assert.deepEqual((await idb.doc(p, `data/users/local/rolls/items/${id}`)).dev, roll.dev);
  await p.waitForFunction(() => /已冲洗/.test(document.getElementById("dk-list").textContent));
  await press("x"); await press("x");
  await p.waitForSelector("#dk-view:not([hidden])");
  assert.ok(await p.isHidden("#dk-dev"), "a developed roll opens straight to its pictures");
  await press("Enter");
  const again = await save(() => press("x"));
  assert.equal(again.name, single.name);
  assert.ok(again.buf.equals(single.buf), "a reprint is the first print, byte for byte");

  /* ?debug: one more item, a comparison of all seven stocks, and the roll is left as it was */
  const before = await idb.doc(p, `data/users/local/rolls/items/${id}`);
  await p.goto(base + "/runtime/?debug", { waitUntil: "networkidle" });
  await p.waitForFunction(() => document.getElementById("savestate").textContent !== "启动中…", null, { timeout: 8000 });
  await p.locator("#home .app", { has: p.locator(".label", { hasText: /^冲洗店$/ }) }).click();
  await p.waitForFunction(() => /已冲洗/.test(document.getElementById("dk-list").textContent));
  await press("x");
  assert.deepEqual(await items(), ["看照片", "起名", "导出底片", "扔掉", "七种片对比"]);
  for (let i = 0; i < 4; i++) await press("ArrowDown");
  const cmp = await save(() => press("x"));
  assert.match(cmp.name, /^lopda-compare-\d{8}-portrait-400-001\.png$/);
  assert.deepEqual(pngSize(cmp.buf), [250 + 4 * 410 + 10, 70 + 7 * 360 + 10]);
  assert.deepEqual(await idb.doc(p, `data/users/local/rolls/items/${id}`), before, "comparing changes nothing");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

/* ---------- notes 2.0 (docs/design/notes.md): today and 那年今日, tags, search, pins, the trash, zip out and in, send ---------- */
const NOTES_DAY = new Date(2026, 9, 15, 9, 41);    /* Thursday 2026-10-15, lunar 九月初六 */
const notesPage = async (t, { time = NOTES_DAY, init, ...opts } = {}) => {
  /* an iPhone SE: with the chin pad the LCD is 331 x 359, the smallest screen */
  const { p, errors } = await page(t, { locale: "zh-CN", serviceWorkers: "block", viewport: { width: 375, height: 667 }, ...opts });
  if (init) await p.addInitScript(init);
  await p.clock.install({ time });
  await p.goto(base + "/runtime/?debug", { waitUntil: "networkidle" });
  await p.waitForFunction(() => document.getElementById("savestate").textContent !== "启动中…");
  const open = async () => {
    await p.click("#home-key");
    await p.locator("#home .app", { hasText: "记事本" }).click();
    await p.locator("#v-notes:not([hidden])").waitFor();
    await p.waitForTimeout(200);
  };
  /* the chin pad, as the pad's own buttons press it */
  const key = async (...bs) => { for (const b of bs) { await p.evaluate((b) => { LOPDA_DEBUG.setButton(b, true); LOPDA_DEBUG.setButton(b, false); }, b); await p.waitForTimeout(80); } };
  const rows = () => p.$$eval("#notes-main li", (l) => l.map((x) => (x.classList.contains("on") ? "*" : "") + x.querySelector(".t").textContent));
  const sheet = () => p.$$eval("#notes-sheet li", (l) => l.map((x) => (x.classList.contains("on") ? "*" : "") + x.textContent));
  const docs = () => p.evaluate(() => LP.S.refs.notes.get().then((q) => q.docs.map((d) => Object.assign({ id: d.id }, d.data()))));
  const saved = () => p.waitForFunction(() => document.getElementById("note-state").textContent === "已保存", null, { timeout: 5000 });
  const write = async (text) => { await key("a"); await p.keyboard.type(text); await saved(); };
  return { p, errors, open, key, rows, sheet, docs, saved, write };
};
/* no horizontal scroll and every tap target at least 44 px tall on the screen now showing */
const fits = (p) => p.evaluate(() => {
  const bad = [], view = [...document.querySelectorAll("#screen > .view")].find((v) => !v.hidden);
  for (const e of [view, ...view.querySelectorAll("*")]) {
    if (e.closest("[hidden]") || !e.getClientRects().length) continue;
    if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "hidden" && e.clientWidth > 0 && !/^(SPAN|SMALL|MARK|P|B|I)$/.test(e.nodeName)) bad.push("scrolls sideways: " + e.className + " " + e.id);
    const tap = e.matches("button, li[onclick], .lcd-menu li:not(.label), input, textarea");
    if (tap && e.getBoundingClientRect().height < 43.5) bad.push("under 44 px: " + (e.id || e.className || e.nodeName) + " " + e.textContent.slice(0, 20));
  }
  /* soft keys are never cut off by the edge of the view (they were 8 px short on the list: padding inside a fixed 44 px row) */
  const vr = view.getBoundingClientRect();
  for (const k of view.querySelectorAll(".softkeys .sk")) {
    if (k.closest("[hidden]") || !k.getClientRects().length) continue;
    const r = k.getBoundingClientRect(), box = k.closest(".softkeys").getBoundingClientRect();
    if (r.bottom > vr.bottom + 0.5 || r.right > vr.right + 0.5 || r.bottom > box.bottom + 0.5) bad.push("cut off: " + k.className + " " + k.textContent);
  }
  const s = document.getElementById("screen").getBoundingClientRect();
  return { bad, w: Math.round(view.getBoundingClientRect().width), h: Math.round(view.getBoundingClientRect().height), screen: [s.width, s.height] };
});

test("notes: the cursor starts on 今天; A writes today's diary, titled with the date; nothing is left behind by only looking", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  await n.open();
  assert.deepEqual(await n.rows(), ["*今天 · 写点什么", "新建"]);
  /* open today and go back without typing: no diary */
  await n.key("a");
  await n.p.locator("#v-note:not([hidden])").waitFor();
  assert.equal(await n.p.inputValue("#note-body"), "10月15日 周四 · 九月初六\n");
  assert.equal(await n.p.evaluate(() => document.activeElement.id), "note-body");
  assert.ok(await n.p.isHidden("#note-years"));
  await n.key("b");
  assert.deepEqual(await n.docs(), []);
  assert.deepEqual(await n.rows(), ["*今天 · 写点什么", "新建"]);
  /* now write: the doc comes with the first keystroke, Enter is a newline (not START) */
  await n.key("a");
  await n.p.keyboard.type("去公园。");
  await n.p.keyboard.press("Enter");
  await n.p.keyboard.type("看了银杏。");
  await n.saved();
  assert.ok(await n.p.isHidden("#note-sheet"));
  await n.key("b");
  const d = await n.docs();
  assert.equal(d.length, 1);
  assert.equal(d[0].body, "10月15日 周四 · 九月初六\n去公园。\n看了银杏。");
  assert.equal(d[0].day, "2026-10-15");
  assert.equal(d[0].created, d[0].updated);
  assert.deepEqual(await n.rows(), ["*今天 · 10月15日 周四", "新建", "10月15日 周四 · 九月初六"]);
  /* 今天 opens the same diary again */
  await n.key("a");
  assert.equal(await n.p.inputValue("#note-body"), d[0].body);
  await n.key("b");
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: a year later the diary page shows 那年今日, and A opens that year's diary", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t, { time: new Date(2025, 9, 15, 21, 0) });
  await n.open();
  await n.write("去 Brooklyn 看了展。");
  await n.key("b");
  await n.p.clock.setSystemTime(new Date(2026, 9, 15, 8, 0));
  await n.open();
  assert.deepEqual(await n.rows(), ["*今天 · 写点什么", "新建", "10月15日 周三 · 八月廿四"]);
  await n.key("a");
  assert.deepEqual(await n.p.$$eval("#note-years li", (l) => l.map((x) => x.textContent)), ["那年今日", "2025 · 去 Brooklyn 看了展。"]);
  /* the keyboard goes away: the page is read, and ▲ from the top of the text goes onto the row */
  await n.p.evaluate(() => document.activeElement.blur());
  assert.ok(await n.p.isVisible("#note-read"));
  await n.key("up");
  assert.deepEqual(await n.p.$$eval("#note-years li.on", (l) => l.map((x) => x.textContent)), ["2025 · 去 Brooklyn 看了展。"]);
  await n.key("a");
  assert.equal(await n.p.inputValue("#note-body"), "10月15日 周三 · 八月廿四\n去 Brooklyn 看了展。");
  /* still nothing written for 2026 */
  assert.equal((await n.docs()).length, 1);
  /* a tap on the row does the same */
  await n.key("b", "a");
  await n.p.click("#note-years li:nth-child(2)");
  assert.equal(await n.p.inputValue("#note-body"), "10月15日 周三 · 八月廿四\n去 Brooklyn 看了展。");
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: a note from the list opens to read, with no keyboard; a tap on a word writes there; the keyboard going away reads again; A writes at the end", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  const body = "读书笔记\n第一章讲的是公园里的银杏和秋天的风。\nThe quick brown fox jumps over the lazy dog.";
  await n.p.evaluate(async (body) => {
    await LP.S.refs.notes.doc().set({ body, created: new Date(2025, 9, 14, 9, 0).getTime(), updated: new Date(2025, 9, 15, 21, 4).getTime() });
    await LP.S.refs.notes.doc().set({ body: "旧笔记\n0.21.0 以前写的", updated: new Date(2026, 2, 5, 8, 0).getTime() });
    await LP.S.refs.notes.doc().set({ body: "很长\n" + Array.from({ length: 80 }, (_, i) => "第 " + i + " 行").join("\n"), updated: new Date(2024, 0, 1).getTime() });
  }, body);
  await n.open();
  await n.p.click("#notes-list li:has-text('读书笔记') button");
  await n.p.locator("#v-note:not([hidden])").waitFor();
  const state = () => n.p.evaluate(() => ({ focus: document.activeElement.id, ro: document.getElementById("note-body").readOnly,
    reading: !document.getElementById("note-read").hidden, writing: !document.getElementById("note-body").hidden,
    time: document.getElementById("note-time").hidden ? null : document.getElementById("note-time").textContent,
    at: document.getElementById("note-body").selectionStart }));
  let s = await state();
  assert.deepEqual([s.focus === "note-body", s.ro, s.reading, s.writing], [false, true, true, false]);
  assert.equal(s.time, "2025年10月15日 周三 21:04");
  assert.equal(await n.p.textContent("#note-read"), body);
  /* a tap on "brown": the middle of one of the word's client rects, never of its bounding box (CLAUDE.md) */
  const word = body.indexOf("brown");
  const spot = await n.p.evaluate((word) => {
    const r = document.createRange(), node = document.getElementById("note-read").firstChild;
    r.setStart(node, word); r.setEnd(node, word + 5);
    const b = r.getClientRects()[0];
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, word);
  await n.p.mouse.click(spot.x, spot.y);
  s = await state();
  assert.deepEqual([s.focus, s.ro, s.reading, s.writing, s.time], ["note-body", false, false, true, null]);
  assert.ok(s.at >= word && s.at <= word + 5, "caret " + s.at + " in brown at " + word);
  assert.ok(await n.p.isVisible("#note-state"));
  await n.p.keyboard.type("X");
  await n.saved();
  assert.match(await n.p.inputValue("#note-body"), /The quick (X?brown|bX?rown|brX?own|broX?wn|browX?n|brownX?) fox/);
  /* the keyboard goes away: reading again, the line under the bar says when, with the year */
  await n.p.evaluate(() => document.activeElement.blur());
  s = await state();
  assert.deepEqual([s.focus === "note-body", s.ro, s.reading, s.writing], [false, true, true, false]);
  assert.equal(s.time, "2026年10月15日 周四 09:41");
  /* A: writing with the caret at the end */
  await n.key("a");
  s = await state();
  const now = await n.p.inputValue("#note-body");
  assert.deepEqual([s.focus, s.writing, s.at], ["note-body", true, now.length]);
  /* START: options, with created, modified and the count of characters */
  await n.key("start");
  assert.ok(await n.p.isVisible("#note-read"));
  const count = Array.from(now.replace(/\s+/g, "")).length;
  assert.equal(await n.p.textContent("#note-sheet .notes-status"), "创建 2025.10.14 09:00 · 修改 2026.10.15 09:41 · " + count + " 字");
  await n.key("b", "b");
  /* a note from before 0.21.0 has no created: only 修改 */
  await n.p.click("#notes-list li:has-text('旧笔记') button");
  assert.equal(await n.p.textContent("#note-time"), "2026年3月5日 周四 08:00");
  await n.key("start");
  assert.equal(await n.p.textContent("#note-sheet .notes-status"), "修改 2026.03.05 08:00 · 13 字");
  await n.key("b", "b");
  /* ▲▼ scroll a page while reading */
  await n.p.click("#notes-list li:has-text('很长') button");
  const top = () => n.p.evaluate(() => document.getElementById("note-read").scrollTop);
  assert.equal(await top(), 0);
  await n.key("down");
  const page1 = await top();
  assert.ok(page1 > 150, "scrolled " + page1);
  await n.key("down");
  assert.ok(await top() > page1);
  await n.key("up", "up");
  assert.equal(await top(), 0);
  assert.equal(await n.p.evaluate(() => document.activeElement.id), "");
  await n.key("b");
  /* 今天 and 新建 still open to write */
  await n.p.click("#notes-top li:nth-child(1) button");
  assert.equal(await n.p.evaluate(() => document.activeElement.id), "note-body");
  await n.key("b");
  await n.p.click("#notes-top li:nth-child(2) button");
  assert.equal(await n.p.evaluate(() => document.activeElement.id), "note-body");
  assert.equal(await n.p.inputValue("#note-body"), "");
  await n.key("b");
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: list rows date a note by the time today, the day this year, the full date before", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  await n.p.evaluate(async () => {
    await LP.S.refs.notes.doc().set({ body: "今早\n一", updated: new Date(2026, 9, 15, 8, 5).getTime() });
    await LP.S.refs.notes.doc().set({ body: "春天\n二", updated: new Date(2026, 2, 5, 21, 4).getTime() });
    await LP.S.refs.notes.doc().set({ body: "去年\n三", updated: new Date(2025, 9, 15, 21, 4).getTime() });
  });
  await n.open();
  assert.deepEqual(await n.p.$$eval("#notes-list li .d", (l) => l.map((x) => x.textContent)), ["08:05 · 一", "3月5日 · 二", "2025.10.15 · 三"]);
  /* in English */
  await n.p.evaluate(() => LP.setLang("en"));
  await n.p.waitForTimeout(150);
  assert.deepEqual(await n.p.$$eval("#notes-list li .d", (l) => l.map((x) => x.textContent)), ["08:05 · 一", "5 Mar · 二", "15 Oct 2025 · 三"]);
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: tags from #words, the 日记 and 摘抄 groups, filtering and B back to all", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  await n.open();
  await n.write("今天 #读书 #散步");
  await n.key("b");
  await n.key("down", "a");                                   /* 新建 */
  await n.p.keyboard.type("书单\n#读书 #Idea 和 ＃idea");
  await n.saved(); await n.key("b");
  await n.p.click("#notes-top li:nth-child(2) button");
  await n.p.keyboard.type("买胶卷 # 不是标签");
  await n.saved(); await n.key("b");
  await n.p.evaluate(() => LP.notes.append("《词典》", "《词典》 green\n「pigment」"));
  await n.key("start");
  assert.deepEqual(await n.sheet(), ["*标签…", "回收站", "全部导出", "导入", "按键说明"]);
  await n.key("a");
  assert.deepEqual(await n.sheet(), ["*日记1", "摘抄1", "#读书2", "#Idea1", "#散步1"]);
  await n.key("down", "down", "a");
  assert.equal(await n.p.textContent("#notes-filter"), "#读书 · 2 篇");
  assert.deepEqual(await n.rows(), ["*书单", "10月15日 周四 · 九月初六"]);
  assert.match(await n.p.textContent("#notes-keys .sk-b"), /返回/);
  await n.key("b");
  assert.ok(await n.p.isHidden("#notes-filter"));
  assert.equal((await n.rows()).length, 6);
  assert.match(await n.p.textContent("#notes-keys .sk-b"), /^B$/);
  /* 摘抄: the note LP.notes.append made */
  await n.key("start", "a", "down", "a");
  assert.deepEqual(await n.rows(), ["*《词典》"]);
  assert.equal(await n.p.textContent("#notes-filter"), "摘抄 · 1 篇");
  assert.equal((await n.docs()).find((d) => d.body.startsWith("《词典》")).src, "dict");
  /* 日记 by a tap */
  await n.key("b", "start", "a");
  await n.p.click("#notes-sheet li:nth-child(1)");
  assert.deepEqual(await n.rows(), ["*10月15日 周四 · 九月初六"]);
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: 摘抄 also holds quotes without src: one written before 0.21.0, and one that came back from an export", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  await n.p.evaluate(async () => {
    await LP.S.refs.notes.doc().set({ body: "《词典》\n\n《词典》 green\n「pigment」", updated: Date.now() - 5000 });
    await LP.S.refs.notes.doc().set({ body: "读《红楼梦》\n第一回", updated: Date.now() - 6000 });
  });
  await n.open();
  const dir = tempDir(t);
  await writeFile(join(dir, "quote.md"), "---\ncreated: 2026-10-01T10:00:00+08:00\ntags: []\n---\n《Alice’s Adventures in Wonderland》\n\n《Alice’s Adventures in Wonderland》 I. Down the Rabbit-Hole\n「Alice」\n");
  await n.p.setInputFiles("#notes-file", join(dir, "quote.md"));
  await n.p.waitForFunction(() => /导入 1 篇/.test(document.getElementById("toast").textContent));
  const d = await n.docs();
  assert.ok(d.every((x) => !("src" in x)), JSON.stringify(d));
  await n.key("start", "a");
  assert.deepEqual(await n.sheet(), ["*日记0", "摘抄2"]);
  await n.key("down", "a");
  assert.equal(await n.p.textContent("#notes-filter"), "摘抄 · 2 篇");
  assert.deepEqual(await n.rows(), ["*《词典》", "《Alice’s Adventures in Wonderland》"]);
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: Chinese search as you type, the hit inverted in a snippet; ▼ to the results; B clears", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  await n.p.evaluate(async () => {
    for (const body of ["买胶卷\n周六去裁片。Film: 8 frames.", "读书笔记\n第一章讲的是公园里的银杏和秋天的风。", "Ｆｉｌｍ 清单"]) {
      await LP.S.refs.notes.doc().set({ body, updated: Date.now() });
    }
  });
  await n.open();
  await n.key("select");
  assert.equal(await n.p.evaluate(() => document.activeElement.id), "notes-q");
  await n.p.keyboard.type("银杏");
  await n.p.waitForFunction(() => /找到 1 篇/.test(document.getElementById("notes-filter").textContent));
  assert.deepEqual(await n.rows(), ["*读书笔记"]);
  assert.equal(await n.p.textContent("#notes-list .d"), "…记 第一章讲的是公园里的银杏和秋天的风。");
  assert.equal(await n.p.textContent("#notes-list .d mark"), "银杏");
  const inverted = await n.p.$eval("#notes-list li.on .d mark", (m) => [getComputedStyle(m).backgroundColor, getComputedStyle(m).color]);
  assert.deepEqual(inverted, ["rgb(163, 173, 126)", "rgb(31, 42, 20)"], "the hit is inverted inside the inverted row");
  /* width and case do not matter */
  await n.p.fill("#notes-q", "film");
  await n.p.waitForFunction(() => /找到 2 篇/.test(document.getElementById("notes-filter").textContent));
  await n.p.keyboard.press("ArrowDown");
  assert.notEqual(await n.p.evaluate(() => document.activeElement.id), "notes-q");
  assert.equal((await n.rows())[0][0], "*");
  await n.key("down");
  assert.equal((await n.rows())[1][0], "*");
  await n.key("b");
  assert.equal(await n.p.inputValue("#notes-q"), "");
  assert.equal((await n.rows()).length, 5);
  await n.p.fill("#notes-q", "没有的词");
  await n.p.waitForFunction(() => /没有找到/.test(document.getElementById("notes-empty").textContent));
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: pinned notes come first; 置顶 and 取消置顶 from the editor's options", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  await n.p.evaluate(async () => {
    let t = Date.now() - 10000;
    for (const body of ["旧的", "中间", "新的"]) await LP.S.refs.notes.doc().set({ body, updated: t += 1000 });
  });
  await n.open();
  assert.deepEqual((await n.rows()).slice(2).map((x) => x.replace(/^\*/, "")), ["新的", "中间", "旧的"]);
  await n.key("down", "down", "down", "down", "a");             /* 旧的 */
  await n.key("start");
  assert.deepEqual(await n.p.$$eval("#note-sheet li", (l) => l.map((x) => x.textContent)), ["置顶", "发送到…", "删除"]);
  await n.key("a");
  await n.p.waitForFunction(() => /已置顶/.test(document.getElementById("toast").textContent));
  await n.key("b");
  assert.deepEqual((await n.rows()).slice(2).map((x) => x.replace(/^\*/, "")), ["◆ 旧的", "新的", "中间"]);
  /* the options button does the same as START */
  await n.p.click("#notes-list li:nth-child(1) button");
  await n.p.click("#note-opts");
  assert.equal(await n.p.textContent("#note-sheet li:nth-child(1)"), "取消置顶");
  await n.p.click("#note-sheet li:nth-child(1)");
  await n.key("b");
  assert.deepEqual((await n.rows()).slice(2).map((x) => x.replace(/^\*/, "")), ["新的", "中间", "旧的"]);
  assert.ok(!(await n.docs()).some((d) => "pinned" in d));
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: delete goes to the trash in one press; restore; purge twice; the trash empties itself after 30 days", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  await n.p.evaluate(async () => {
    for (const body of ["一", "二", "三"]) await LP.S.refs.notes.doc().set({ body, updated: Date.now() });
  });
  await n.open();
  const del = async (title) => {
    await n.p.click(`#notes-list li:has-text("${title}") button`);
    await n.key("start", "down", "down", "a");
    await n.p.waitForFunction(() => /已移到回收站/.test(document.getElementById("toast").textContent));
  };
  await del("一"); await del("二"); await del("三");
  assert.deepEqual((await n.rows()).map((x) => x.replace(/^\*/, "")), ["今天 · 写点什么", "新建"]);
  await n.key("start", "down", "a");
  assert.deepEqual((await n.sheet()).map((x) => x.replace(/\d+ 天后清除/, "")), ["*三", "二", "一"]);
  assert.match((await n.sheet())[0], /30 天后清除/);
  /* restore 三 */
  await n.key("a", "a");
  await n.p.waitForFunction(() => /已恢复/.test(document.getElementById("toast").textContent));
  assert.equal((await n.sheet()).length, 2);
  /* purge 二: the first A only arms it */
  await n.key("a", "down", "a");
  assert.match((await n.sheet())[1], /确认永久删除/);
  assert.equal((await n.docs()).length, 3);
  await n.key("a");
  assert.equal((await n.docs()).length, 2);
  assert.equal((await n.sheet()).length, 1);
  await n.key("b", "b");
  assert.deepEqual((await n.rows()).slice(2).map((x) => x.replace(/^\*/, "")), ["三"]);
  /* 31 days on, the handheld starts again: 一 is gone for good, 三 stays */
  await n.p.clock.setSystemTime(new Date(NOTES_DAY.getTime() + 31 * 86400000));
  await n.p.reload({ waitUntil: "networkidle" });
  await n.p.waitForFunction(() => document.getElementById("savestate").textContent !== "启动中…");
  await n.p.waitForFunction(() => LP.S.refs.notes.get().then((q) => q.size === 1));
  assert.deepEqual((await n.docs()).map((d) => d.body), ["三"]);
  /* START empties the trash, twice */
  await n.open();
  await del("三");
  await n.key("start", "down", "a", "start");
  assert.match(await n.p.textContent("#notes-sheet .sk-start"), /确认/);
  assert.equal((await n.docs()).length, 1);
  await n.key("start");
  await n.p.waitForFunction(() => /回收站已清空/.test(document.getElementById("toast").textContent));
  assert.deepEqual(await n.docs(), []);
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: 今天 and 新建 read as actions; the 笔记 · n 篇 heading counts notes outside the trash, is never the cursor, and gives way to 找到 while searching", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  await n.p.evaluate(async () => {
    /* distinct times, so 三 is surely the newest and the first note under the heading */
    let i = 0;
    for (const body of ["一", "二", "三"]) await LP.S.refs.notes.doc().set({ body, updated: Date.now() + 1000 * i++ });
  });
  await n.open();
  const head = () => n.p.evaluate(() => { const h = document.getElementById("notes-count"); return h.hidden ? null : h.textContent; });
  assert.equal(await head(), "笔记 · 3 篇");
  assert.deepEqual(await n.p.$$eval("#notes-top .mk", (l) => l.map((x) => x.textContent)), ["▶", "＋"]);
  assert.equal(await n.p.$$eval("#notes-top .d", (l) => l.length), 0, "no second line on the action rows");
  const looks = await n.p.$$eval("#notes-top button", (l) => l.map((b) => [Math.round(b.getBoundingClientRect().height), getComputedStyle(b).borderBottomStyle]));
  assert.deepEqual(looks, [[44, "none"], [44, "none"]]);
  assert.equal(await n.p.$eval("#notes-count", (h) => h.tabIndex), -1);
  /* ▼ from 新建 lands on the first note, ▲ comes back */
  await n.key("down");
  assert.equal((await n.rows())[1], "*新建");
  await n.key("down");
  assert.equal((await n.rows())[2], "*三");
  await n.key("up");
  assert.equal((await n.rows())[1], "*新建");
  /* a delete takes one off, a restore puts it back */
  await n.p.click('#notes-list li:has-text("二") button');
  await n.key("start", "down", "down", "a");
  await n.p.waitForFunction(() => /已移到回收站/.test(document.getElementById("toast").textContent));
  assert.equal(await head(), "笔记 · 2 篇");
  await n.key("start", "down", "a", "a", "a");
  await n.p.waitForFunction(() => /已恢复/.test(document.getElementById("toast").textContent));
  await n.key("b", "b");
  assert.equal(await head(), "笔记 · 3 篇");
  /* searching, one line: 找到 instead of the heading */
  await n.key("select");
  await n.p.keyboard.type("三");
  await n.p.waitForFunction(() => /找到 1 篇/.test(document.getElementById("notes-filter").textContent));
  assert.equal(await head(), null);
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: 全部导出 writes a zip of .md files, 导入 brings it back after everything was deleted, duplicates skipped", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  await n.open();
  await n.write("今天 #读书");
  await n.key("b");
  await n.p.evaluate(async () => {
    await LP.S.refs.notes.doc().set({ body: "书单\n#读书 三本", updated: Date.now() - 5000, created: Date.now() - 86400000, pinned: true });
    await LP.S.refs.notes.doc().set({ body: "a/b: c?", updated: Date.now() - 6000 });
    await LP.S.refs.notes.doc().set({ body: "书单\n另一份", updated: Date.now() - 7000 });
  });
  await n.open();
  const before = (await n.docs()).map(({ id, ...d }) => d).sort((a, b) => (a.body < b.body ? -1 : 1));
  await n.key("start");
  assert.equal(await n.p.textContent("#notes-sheet .notes-status"), "还没导出过");
  const [dl] = await Promise.all([n.p.waitForEvent("download"), n.key("down", "down", "a")]);
  assert.equal(dl.suggestedFilename(), "lopda-notes-20261015.zip");
  const file = join(tempDir(t), "notes.zip");
  await dl.saveAs(file);
  await n.p.waitForFunction(() => /已导出 4 篇/.test(document.getElementById("toast").textContent));
  assert.equal(await n.p.textContent("#notes-sheet .notes-status"), "上次导出：今天");
  await n.key("b");
  /* the zip: names, the diary folder, front matter, bodies untouched */
  const zip = await readFile(file), names = [];
  const eocd = zip.lastIndexOf(Buffer.from("PK\x05\x06"));
  for (let p = zip.readUInt32LE(eocd + 16), k = 0; k < zip.readUInt16LE(eocd + 10); k++) {
    const nl = zip.readUInt16LE(p + 28);
    names.push({ name: zip.subarray(p + 46, p + 46 + nl).toString() });
    p += 46 + nl;
  }
  assert.deepEqual(names.map((x) => x.name), ["书单.md", "日记/10月15日 周四 · 九月初六.md", "ab c.md", "书单 (2).md"]);
  const text = zip.toString("utf8");
  assert.match(text, /---\ncreated: 2026-10-14T09:41:\d\d[+-]\d\d:\d\d\nupdated: [^\n]+\ntags: \[读书\]\npinned: true\n---\n书单\n#读书 三本/);
  assert.match(text, /tags: \[读书\]\ndate: 2026-10-15\n---\n10月15日 周四 · 九月初六\n今天 #读书/);
  /* delete everything (to the trash), import the zip: the same notes come back */
  for (let i = 0; i < 4; i++) {
    await n.p.click("#notes-list li:nth-child(1) button");
    await n.key("start", "down", "down", "a");
    await n.p.waitForTimeout(150);
  }
  assert.equal((await n.rows()).length, 2);
  await n.p.setInputFiles("#notes-file", file);
  await n.p.waitForFunction(() => /导入 4 篇/.test(document.getElementById("toast").textContent));
  const live = (await n.docs()).filter((d) => !d.deleted).map(({ id, ...d }) => d).sort((a, b) => (a.body < b.body ? -1 : 1));
  assert.deepEqual(live.map((d) => d.body), before.map((d) => d.body));
  assert.deepEqual(live.map((d) => [d.day, !!d.pinned]), before.map((d) => [d.day, !!d.pinned]));
  assert.deepEqual(live.map((d) => d.created), before.map((d) => Math.floor((d.created || d.updated) / 1000) * 1000));
  /* again: all four are there already */
  await n.p.setInputFiles("#notes-file", file);
  await n.p.waitForFunction(() => /导入 0 篇，跳过 4 篇重复/.test(document.getElementById("toast").textContent));
  /* loose files (ASCII names: Playwright here drops files whose local path is not ASCII): .txt from Apple Notes with its title on the first line, a .md with an empty first line, other files ignored */
  const dir = tempDir(t);
  await writeFile(join(dir, "apple-note.txt"), "\uFEFF从备忘录来的\n第二行");
  await writeFile(join(dir, "untitled.md"), "\n只有正文");
  await writeFile(join(dir, "photo.png"), "not text");
  await n.p.setInputFiles("#notes-file", [join(dir, "apple-note.txt"), join(dir, "untitled.md"), join(dir, "photo.png")]);
  await n.p.waitForFunction(() => /导入 2 篇/.test(document.getElementById("toast").textContent), null, { timeout: 5000 });
  const bodies = (await n.docs()).filter((d) => !d.deleted).map((d) => d.body);
  assert.ok(bodies.includes("从备忘录来的\n第二行"));
  assert.ok(bodies.includes("untitled\n\n只有正文"));
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: a deflated zip from another program imports; a broken one says so", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  await n.open();
  const { deflateRawSync, crc32 } = await import("node:zlib");
  const entry = (name, text, off) => {
    const nm = Buffer.from(name), raw = Buffer.from(text), data = deflateRawSync(raw), h = Buffer.alloc(30), c = Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc32(raw), 14);
    h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc32(raw), 16);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    return { local: Buffer.concat([h, nm, data]), central: Buffer.concat([c, nm]) };
  };
  const parts = [], cds = []; let off = 0;
  for (const [name, text] of [["Notes/Obsidian 笔记.md", "---\ntags: [x]\n---\nObsidian 笔记\n#x 内容"], ["__MACOSX/Notes/._Obsidian 笔记.md", "junk"], ["Notes/.hidden.md", "hidden"], ["Notes/", ""]]) {
    const e = entry(name, text, off); parts.push(e.local); cds.push(e.central); off += e.local.length;
  }
  const cd = Buffer.concat(cds), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(cds.length, 8); end.writeUInt16LE(cds.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  const dir = tempDir(t);
  await writeFile(join(dir, "export.zip"), Buffer.concat([...parts, cd, end]));
  await writeFile(join(dir, "broken.zip"), Buffer.from("PK\x03\x04 this is not really a zip"));
  await n.p.setInputFiles("#notes-file", join(dir, "export.zip"));
  await n.p.waitForFunction(() => /导入 1 篇/.test(document.getElementById("toast").textContent));
  assert.deepEqual((await n.docs()).map((d) => d.body), ["Obsidian 笔记\n#x 内容"]);
  await n.p.setInputFiles("#notes-file", join(dir, "broken.zip"));
  await n.p.waitForFunction(() => /导入失败：zip: no end of central directory/.test(document.getElementById("toast").textContent));
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: a quote from the reader lands in 摘抄; appending to a note in the trash brings it back", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await readerPage(t, { query: "?debug" });
  await openRow(p, 2);
  await p.keyboard.press("ArrowRight");
  await p.waitForFunction(() => /Rabbit-Hole/.test(document.getElementById("rd-foot").textContent));
  await p.keyboard.press("Shift");
  await p.keyboard.press("Enter"); await p.keyboard.press("x");   /* START, A: 摘抄 */
  await p.waitForFunction(() => /已摘抄/.test(document.getElementById("toast").textContent));
  await p.click("#home-key");
  await p.locator("#home .app", { hasText: "记事本" }).click();
  await p.waitForFunction(() => /Alice/.test(document.getElementById("notes-list").textContent));
  const key = async (...bs) => { for (const b of bs) { await p.evaluate((b) => { LOPDA_DEBUG.setButton(b, true); LOPDA_DEBUG.setButton(b, false); }, b); await p.waitForTimeout(80); } };
  await key("start", "a", "down", "a");
  assert.equal(await p.textContent("#notes-filter"), "摘抄 · 1 篇");
  assert.match(await p.textContent("#notes-list"), /《Alice’s Adventures in Wonderland》/);
  const docs = () => p.evaluate(() => LP.S.refs.notes.get().then((q) => q.docs.map((d) => d.data())));
  assert.equal((await docs())[0].src, "reader");
  /* to the trash, then quote again: the same note comes back with both quotes */
  await p.click("#notes-list li:nth-child(1) button");
  await key("start", "down", "down", "a");
  assert.ok((await docs())[0].deleted);
  await p.click("#home-key");
  await p.locator("#home .app", { hasText: "阅读器" }).click();
  await p.click("#rd-list li:has-text('Alice')");
  await p.waitForFunction(() => /Alice/.test(document.getElementById("rd-flow").textContent));
  await p.keyboard.press("Shift");
  await p.keyboard.press("Enter"); await p.keyboard.press("x");
  await p.waitForFunction(() => /已摘抄/.test(document.getElementById("toast").textContent));
  const d = await docs();
  assert.equal(d.length, 1, JSON.stringify(d));
  assert.ok(!("deleted" in d[0]));
  assert.equal(d[0].body.split("「").length, 3);
  assert.deepEqual(notBlocked(errors), []);
});

test("notes: 发送到… opens the share sheet with the text, or copies when there is none", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t, { init: () => {
    window.__shared = [];
    if (!/noshare/.test(location.search)) Object.defineProperty(navigator, "share", { configurable: true, value: (d) => { window.__shared.push(d); return Promise.resolve(); } });
  } });
  await n.open();
  await n.write("寄给备忘录");
  await n.key("start", "down");
  /* the press alone does nothing (no gesture on a phone); the release shares */
  await n.p.evaluate(() => LOPDA_DEBUG.setButton("a", true));
  assert.deepEqual(await n.p.evaluate(() => window.__shared), []);
  await n.p.evaluate(() => LOPDA_DEBUG.setButton("a", false));
  assert.deepEqual(await n.p.evaluate(() => window.__shared), [{ text: "10月15日 周四 · 九月初六\n寄给备忘录" }]);
  assert.ok(await n.p.isHidden("#note-sheet"));
  /* a tap on the row shares too */
  await n.p.click("#note-opts");
  await n.p.click("#note-sheet li:nth-child(2)");
  assert.equal(await n.p.evaluate(() => window.__shared.length), 2);
  /* no share sheet: the clipboard */
  await n.p.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await n.p.evaluate(() => { Object.defineProperty(navigator, "share", { configurable: true, value: undefined }); });
  await n.p.click("#note-opts");
  await n.p.click("#note-sheet li:nth-child(2)");
  await n.p.waitForFunction(() => /已复制/.test(document.getElementById("toast").textContent));
  assert.equal(await n.p.evaluate(() => navigator.clipboard.readText()), "10月15日 周四 · 九月初六\n寄给备忘录");
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: with the phone's keyboard up, the LCD takes the visible height and the case cannot be dragged", { skip, timeout: 60000 }, async (t) => {
  /* iOS does not shrink the page for its keyboard; only the visual viewport loses its height. A stand-in visualViewport
     plays the keyboard: 380 px of the 667 go under it */
  const n = await notesPage(t, { hasTouch: true, init: () => {
    const vv = new EventTarget();
    vv.height = innerHeight; vv.width = innerWidth; vv.offsetTop = 0;
    Object.defineProperty(window, "visualViewport", { value: vv });
    window.__keyboard = (up) => { vv.height = up ? innerHeight - 380 : innerHeight; vv.dispatchEvent(new Event("resize")); };
  } });
  await n.open();
  await n.key("a");
  assert.equal(await n.p.evaluate(() => document.activeElement.id), "note-body");
  await n.p.evaluate(() => window.__keyboard(true));
  await n.p.waitForFunction(() => document.documentElement.classList.contains("kb"));
  const m = await n.p.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return { device: r(".device").height, screen: r(".screen").bottom, body: r("#note-body").bottom,
      pad: getComputedStyle(document.getElementById("gamepad")).display, home: getComputedStyle(document.querySelector(".keys")).display };
  });
  assert.equal(m.device, 667 - 380);
  assert.ok(m.screen <= 287 && m.body <= 287, JSON.stringify(m));
  assert.deepEqual([m.pad, m.home], ["none", "none"]);
  /* a drag on the bar does nothing; a drag in the text is the text's */
  const drag = (sel) => n.p.evaluate((sel) => {
    const e = document.querySelector(sel), r = e.getBoundingClientRect(), x = r.left + 10, y = r.top + 10;
    const touch = new Touch({ identifier: 1, target: e, clientX: x, clientY: y });
    const ev = new TouchEvent("touchmove", { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true });
    e.dispatchEvent(ev);
    return ev.defaultPrevented;
  }, sel);
  assert.equal(await drag("#note-back"), true);
  await n.p.fill("#note-body", Array.from({ length: 40 }, (_, i) => "line " + i).join("\n"));
  assert.equal(await drag("#note-body"), false);
  /* the keyboard goes away: the case comes back */
  await n.p.evaluate(() => { window.__keyboard(false); document.activeElement.blur(); });
  await n.p.waitForFunction(() => !document.documentElement.classList.contains("kb"));
  assert.notEqual(await n.p.evaluate(() => getComputedStyle(document.getElementById("gamepad")).display), "none");
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: every screen fits 331 x 359 with no sideways scroll and 44 px targets", { skip, timeout: 60000 }, async (t) => {
  /* an iPhone SE gives the notes view 331 x 409 with the chin pad; 50 px less is the 331 x 359 an app gets (sdk/UI.md) */
  const n = await notesPage(t, { viewport: { width: 375, height: 617 } });
  await n.p.evaluate(async () => {
    await LP.S.refs.notes.doc().set({ body: "一个非常非常长的标题，长到一行放不下，看它会不会把列表撑宽 #很长很长很长很长的标签名字超过二十个字了吧", updated: Date.now() });
    await LP.S.refs.notes.doc().set({ body: "x".repeat(300), updated: Date.now(), deleted: Date.now() });
  });
  await n.open();
  const check = async (what) => { const f = await fits(n.p); assert.deepEqual(f.bad, [], what); return f; };
  const f = await check("list");
  assert.deepEqual([f.w, f.h], [331, 359]);
  await n.key("start"); await check("options");
  await n.key("a"); await check("tags");
  await n.key("b", "down", "a"); await check("trash");
  await n.key("a"); await check("one note in the trash");
  await n.key("b", "b", "down", "down", "a"); await check("key card");
  await n.key("b", "b");
  await n.key("a"); await n.p.keyboard.type("x"); await n.saved(); await check("editor");
  await n.key("start"); await check("editor options");
  await n.key("b"); await check("editor, reading");
  await n.key("b");
  await n.p.click("#notes-list li:has-text('一个非常') button");
  assert.ok(await n.p.isVisible("#note-read"));
  await check("reading a note with a long title");
  await n.key("start"); await check("its options, with the status line");
  assert.deepEqual(notBlocked(n.errors), []);
});

/* ---------------- calendar × diary (decisions.md section 21) ---------------- */
const diaryCal = async (t, opts) => {
  const n = await notesPage(t, opts);
  const { p } = n;
  const cal = async () => {
    await p.click("#home-key");
    await p.locator("#home .app", { hasText: "万年历" }).click();
    await p.locator("#v-cal:not([hidden])").waitFor();
    await p.waitForTimeout(200);
  };
  const cell = (d) => p.locator("#cal-grid .cal-cell:not(.out)").nth(d - 1);
  const marked = () => p.$$eval("#cal-grid .cal-cell.dy:not(.out) b", (l) => l.map((x) => +x.textContent));
  /* a tap selects the day, a second tap opens its sheet */
  const day = async (d) => { await cell(d).click(); await cell(d).click(); await p.locator("#cal-sheet:not([hidden])").waitFor(); };
  const diaryRows = () => p.$$eval("#cal-sheet .cal-diary li", (l) => l.map((x) => x.textContent));
  const diary = (body, d, extra = {}) => p.evaluate(([body, d, extra]) => LP.S.refs.notes.doc().set(Object.assign({ body, day: d, created: Date.now(), updated: Date.now() }, extra)), [body, d, extra]);
  const reload = async () => { await p.evaluate(() => LP.refresh("notes")); await p.waitForTimeout(200); };
  const backOn = async (d) => {
    await p.locator("#v-cal:not([hidden])").waitFor();
    assert.ok(await p.isVisible("#cal-sheet"), "the day sheet is open again");
    assert.equal(await p.textContent("#cal-grid .cal-cell.sel b"), String(d));
    assert.match(await p.textContent("#cal-sheet .sheet-title"), new RegExp(`10月${d}日`));
  };
  return { ...n, cal, cell, marked, day, diaryRows, diary, reload, backOn };
};

test("calendar: a diary marks its day; the day sheet lists it and earlier years; a tap reads it and B comes back to that day", { skip, timeout: 60000 }, async (t) => {
  const c = await diaryCal(t, { viewport: { width: 375, height: 617 } });
  const { p } = c;
  await c.cal();
  assert.deepEqual(await c.marked(), []);
  /* the notes arrive while the calendar is open: the marks are drawn */
  await c.diary("10月1日 周四 · 八月廿一\n国庆，去爬山。", "2026-10-01");
  await c.diary("10月1日 周三 · 八月初十\n去年国庆在家。", "2025-10-01");
  await c.diary("读书笔记\n不是日记", undefined);
  await c.reload();
  assert.deepEqual(await c.marked(), [1]);
  /* today is inverted and the selected day framed: the mark is there too */
  await c.diary("10月15日 周四 · 九月初六\n今天", "2026-10-15");
  await c.reload();
  assert.deepEqual(await c.marked(), [1, 15]);
  assert.match(await c.cell(15).getAttribute("class"), /today.*sel.*dy/);
  await c.day(1);
  assert.deepEqual(await c.diaryRows(), ["日记", "国庆，去爬山。", "2025 · 去年国庆在家。"]);
  /* the month underneath has its own (older) sizes; the sheet over it fits, its diary rows 44 px tall */
  const f = await fits(p);
  assert.deepEqual(f.bad.filter((b) => !/cal-(prev|next|list-btn|today|cell|info)/.test(b)), [], "the day sheet fits 331 x 359");
  assert.ok((await p.$$eval("#cal-sheet .cal-diary li:not(.label)", (l) => l.map((x) => x.getBoundingClientRect().height))).every((h) => h >= 44));
  /* a tap opens it to read; B comes back to Oct 1 with the sheet open */
  await p.click("#cal-sheet .cal-diary li:nth-child(2)");
  await p.locator("#v-note:not([hidden])").waitFor();
  assert.ok(await p.isVisible("#note-read"), "an earlier day opens to read");
  assert.equal(await p.textContent("#note-read"), "10月1日 周四 · 八月廿一\n国庆，去爬山。");
  await c.key("b");
  await c.backOn(1);
  /* a 那年今日 row inside that visit, then B: still back to the calendar */
  await p.click("#cal-sheet .cal-diary li:nth-child(2)");
  await p.click("#note-years li:nth-child(2)");
  assert.equal(await p.textContent("#note-read"), "10月1日 周三 · 八月初十\n去年国庆在家。");
  await p.click("#note-back");
  await c.backOn(1);
  /* the 2025 row opens 2025's diary */
  await p.click("#cal-sheet .cal-diary li:nth-child(3)");
  assert.equal(await p.textContent("#note-read"), "10月1日 周三 · 八月初十\n去年国庆在家。");
  await c.key("b");
  await c.backOn(1);
  /* HOME still goes home; the notes program's own B still goes to its list */
  await p.click("#cal-sheet .cal-diary li:nth-child(2)");
  await p.click("#home-key");
  assert.ok(await p.isVisible("#v-home"));
  await c.open();
  await p.click("#notes-list li:has-text('10月1日 周四') button");
  await c.key("b");
  assert.ok(await p.isVisible("#v-notes"), "a diary opened from the notes list goes back to the list");
  assert.equal((await c.docs()).length, 4, "only looking writes nothing");
  assert.deepEqual(notBlocked(c.errors), []);
});

test("calendar: the diary mark is drawn inside the cell in all five states; the cell is never clipped, the selection frame stays whole", { skip, timeout: 60000 }, async (t) => {
  const c = await diaryCal(t);
  const { p } = c;
  for (const d of ["2026-10-01", "2026-10-03", "2026-10-15", "2026-11-01"]) await c.diary("t\nx", d);
  await c.reload();
  await c.cal();
  const INK = [31, 42, 20], PAPER = [163, 173, 126];
  /* pixels of a cell's screenshot, read back through a canvas in the page: [r, g, b] at (x, y) from its bottom right.
     The cell sits at fractional pixels, so the outermost row and column of the shot can be the gap: sample 1 px in */
  const pixels = async (loc, at) => {
    const png = (await loc.screenshot()).toString("base64");
    return p.evaluate(async ([png, at]) => {
      const img = await createImageBitmap(await (await fetch("data:image/png;base64," + png)).blob());
      const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
      const g = cv.getContext("2d"); g.drawImage(img, 0, 0);
      return at.map(([dx, dy]) => Array.from(g.getImageData(img.width - 1 - dx, img.height - 1 - dy, 1, 1).data.slice(0, 3)));
    }, [png, at]);
  };
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 3);
  const state = (loc) => loc.evaluate((e) => { const s = getComputedStyle(e);
    return { cls: e.className, clip: s.clipPath, widths: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth],
      colors: [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor] }; });
  const out = p.locator("#cal-grid .cal-cell.out.dy");
  await c.cell(1).click();
  const cells = { normal: c.cell(3), selected: c.cell(1), today: c.cell(15), out };
  for (const [name, loc] of Object.entries(cells)) {
    const s = await state(loc);
    assert.match(s.cls, /\bdy\b/, name);
    assert.equal(s.clip, "none", name + ": the cell is not clipped");
    assert.deepEqual(s.widths, ["2px", "2px", "2px", "2px"], name + ": the border box is whole");
  }
  /* the selected cell: the frame is ink on all four sides, its bottom-right corner pixel too, and the staircase sits inside it */
  const sel = await state(cells.selected);
  assert.equal(new Set(sel.colors).size, 1, "one colour all round");
  let [corner, edge, inside, above] = await pixels(cells.selected, [[1, 1], [1, 6], [3, 3], [3, 9]]);
  assert.ok(near(corner, INK) && near(edge, INK), "the frame's bottom-right corner is ink: " + corner + " " + edge);
  assert.ok(near(inside, INK), "the staircase is inside the frame: " + inside);
  assert.ok(!near(above, INK), "the staircase is 6 px high: " + above);
  /* normal: ink at the very corner; today: paper on the ink, the ink block whole around it */
  assert.ok(near((await pixels(cells.normal, [[1, 1]]))[0], INK));
  [corner, edge] = await pixels(cells.today, [[1, 1], [9, 1]]);
  assert.ok(near(corner, PAPER) && near(edge, INK), "today: a paper staircase on the ink: " + corner + " " + edge);
  /* today and selected: paper staircase 2 px inside the ink frame */
  await c.cell(15).click();
  const ts = await state(c.cell(15));
  assert.match(ts.cls, /today.*sel.*dy/);
  assert.equal(ts.clip, "none");
  [corner, inside] = await pixels(c.cell(15), [[1, 1], [3, 3]]);
  assert.ok(near(corner, INK) && near(inside, PAPER), "today and selected: " + corner + " " + inside);
  assert.equal(await p.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => /clip-path/.test(r.cssText) && /cal-cell/.test(r.cssText)); } catch { return false; } })), false, "no clip-path rule for the cells");
  assert.deepEqual(notBlocked(c.errors), []);
});

test("calendar: START on an earlier day starts that day's diary; nothing is kept without typing; a future day has no START", { skip, timeout: 60000 }, async (t) => {
  const c = await diaryCal(t);
  const { p } = c;
  await c.cal();
  await c.day(3);
  assert.deepEqual(await c.diaryRows(), ["日记", "写这天的日记"]);
  assert.equal(await p.textContent("#cal-sheet .sk-start span"), "日记");
  const title = await p.evaluate(() => LopdaNoteText.diaryTitle("2026-10-03", "zh", LP.tr, LopdaLunar));
  assert.equal(title, "10月3日 周六 · 八月廿三");
  /* open and back without typing: no diary */
  await c.key("start");
  await p.locator("#v-note:not([hidden])").waitFor();
  assert.equal(await p.inputValue("#note-body"), title + "\n");
  assert.equal(await p.evaluate(() => document.activeElement.id), "note-body", "it opens to be written");
  await c.key("b");
  await c.backOn(3);
  assert.deepEqual(await c.docs(), []);
  assert.deepEqual(await c.marked(), []);
  /* type: the diary is that day's, created now */
  await c.key("start");
  await p.keyboard.type("补记：去看展。");
  await c.saved();
  await c.key("b");
  await c.backOn(3);
  const d = await c.docs();
  assert.equal(d.length, 1);
  assert.equal(d[0].body, title + "\n补记：去看展。");
  assert.equal(d[0].day, "2026-10-03");
  assert.ok(d[0].created >= NOTES_DAY.getTime() && d[0].created < NOTES_DAY.getTime() + 60000, "created is when it was written, not the day");
  assert.deepEqual(await c.marked(), [3]);
  assert.deepEqual(await c.diaryRows(), ["日记", "补记：去看展。"]);
  /* the row (or START again) opens it to read */
  await c.key("start");
  assert.ok(await p.isVisible("#note-read"));
  await c.key("b");
  /* a future day: no 日记 block, an empty START, and START does nothing */
  await c.key("b");
  await c.day(20);
  assert.deepEqual(await c.diaryRows(), []);
  assert.equal(await p.textContent("#cal-sheet .sk-start span"), "");
  assert.ok(await p.isDisabled("#cal-sheet .sk-start"));
  await c.key("start");
  assert.ok(await p.isVisible("#v-cal"));
  assert.ok(await p.isVisible("#cal-sheet"));
  assert.equal(await p.evaluate(() => LP.notes.openDiary("2026-10-20", () => {})), false, "openDiary refuses a future day");
  assert.ok(await p.isVisible("#v-cal"));
  /* today: START writes today's diary, as 今天 does */
  await c.key("b");
  await c.day(15);
  await c.key("start");
  assert.equal(await p.inputValue("#note-body"), "10月15日 周四 · 九月初六\n");
  assert.equal(await p.evaluate(() => document.activeElement.id), "note-body");
  await c.key("b");
  await c.backOn(15);
  /* the other keys on the sheet are as they were: A adds a date, B closes */
  await c.key("a");
  assert.ok(await p.isVisible("#cal-name"));
  assert.deepEqual(notBlocked(c.errors), []);
});

test("calendar: a diary moved to the trash loses its mark", { skip, timeout: 60000 }, async (t) => {
  const c = await diaryCal(t);
  const { p } = c;
  await c.diary("10月1日 周四 · 八月廿一\n国庆。", "2026-10-01");
  await c.diary("10月2日 周五 · 八月廿二\n第二天。", "2026-10-02");
  await c.reload();
  await c.cal();
  assert.deepEqual(await c.marked(), [1, 2]);
  /* deleted from the editor the calendar opened: back to the calendar, the mark gone */
  await c.day(1);
  await p.click("#cal-sheet .cal-diary li:nth-child(2)");
  await c.key("start", "down", "down", "a");
  await c.backOn(1);
  assert.deepEqual(await c.marked(), [2]);
  assert.deepEqual(await c.diaryRows(), ["日记", "写这天的日记"]);
  /* deleted in the notes program */
  await c.open();
  await p.click("#notes-list li:has-text('10月2日') button");
  await c.key("start", "down", "down", "a");
  assert.ok(await p.isVisible("#v-notes"), "the notes program's delete goes back to its list");
  await c.cal();
  assert.deepEqual(await c.marked(), []);
  /* restored from the trash: the mark comes back */
  await c.open();
  await c.key("start", "down", "a");
  await c.key("a", "a");
  await c.cal();
  assert.equal((await c.docs()).filter((d) => !d.deleted).length, 1);
  assert.equal((await c.marked()).length, 1);
  assert.deepEqual(notBlocked(c.errors), []);
});

/* ---------------- keeping the screen on ---------------- */
/* stands in for the Screen Wake Lock API: each request and release is logged; document.hidden can be set from the test */
function fakeWakeLock() {
  const log = (window.__wl = []);
  window.__hidden = false;
  Object.defineProperty(document, "hidden", { get: () => window.__hidden, configurable: true });
  Object.defineProperty(document, "visibilityState", { get: () => (window.__hidden ? "hidden" : "visible"), configurable: true });
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async (type) => {
    log.push("request:" + type);
    const lock = new EventTarget();
    lock.type = type; lock.released = false;
    lock.release = async () => { if (lock.released) return; lock.released = true; log.push("release"); lock.dispatchEvent(new Event("release")); };
    window.__lock = lock;
    return lock;
  } } });
}
const wl = (p) => p.evaluate(() => window.__wl.slice());
const wlClear = (p) => p.evaluate(() => { window.__wl.length = 0; });
const held = (p) => p.evaluate(() => !!window.__lock && !window.__lock.released);
const tile = (p, label) => p.locator("#home .app", { has: p.locator(".label", { hasText: new RegExp("^" + label + "$") }) }).click();
/* a 32 KB cartridge that only loops (JR -2 at the entry point), with a good header checksum: no game */
function loopRom() {
  const rom = new Uint8Array(0x8000);
  rom.set([0x00, 0x18, 0xfe], 0x100);
  rom.set(Buffer.from("LOOP"), 0x134);
  let x = 0; for (let i = 0x134; i <= 0x14c; i++) x = (x - rom[i] - 1) & 0xff;
  rom[0x14d] = x;
  return Buffer.from(rom);
}

test("wake lock: held on a book page, a game, a running app; let go on HOME; asked again when the page is shown; never in notes, calendar or settings", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  await p.addInitScript(fakeWakeLock);
  await p.route(/jsdelivr/, (r) => r.abort());
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  for (const label of ["记事本", "万年历", "设置"]) {
    await tile(p, label);
    await p.waitForTimeout(300);
    await p.click("#home-key");
  }
  assert.deepEqual(await wl(p), [], "notes, calendar and settings leave the screen alone");
  /* the reader: the shelf no, a book page yes */
  await tile(p, "阅读器");
  await p.waitForFunction(() => document.querySelectorAll("#rd-list li:not(.label)").length === 2, null, { timeout: 10000 });
  assert.deepEqual(await wl(p), []);
  await openRow(p, 1);
  assert.deepEqual(await wl(p), ["request:screen"]);
  assert.ok(await held(p));
  /* hidden: the browser lets go (here the runtime does); shown again: asked for again */
  await p.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event("visibilitychange")); });
  await p.waitForFunction(() => window.__lock.released);
  await p.evaluate(() => { window.__hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
  await p.waitForFunction(() => !window.__lock.released);
  assert.deepEqual(await wl(p), ["request:screen", "release", "request:screen"]);
  /* B back to the shelf lets go */
  await p.keyboard.press("z");
  await p.waitForSelector("#rd-shelf:not([hidden])");
  assert.equal(await held(p), false);
  await openRow(p, 1);
  assert.ok(await held(p));
  await p.click("#home-key");
  assert.equal(await held(p), false, "HOME lets go of the book page");
  /* not asked for again while the page comes back to the home screen */
  await wlClear(p);
  await p.evaluate(() => { window.__hidden = true; document.dispatchEvent(new Event("visibilitychange")); window.__hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
  await p.waitForTimeout(100);
  assert.deepEqual(await wl(p), []);
  /* the cartridge: the library no, a game yes */
  await tile(p, "卡带机");
  await p.setInputFiles("#cart-file", { name: "loop.gb", mimeType: "application/octet-stream", buffer: loopRom() });
  await p.waitForSelector("#cart-list .btn:not(.ghost)");
  assert.deepEqual(await wl(p), []);
  await p.click("#cart-list .btn:not(.ghost)");
  await p.waitForSelector("#cart-play:not([hidden])", { timeout: 10000 });
  await p.waitForFunction(() => window.__lock && !window.__lock.released);
  await p.click("#cart-eject");
  assert.equal(await held(p), false, "ejecting lets go");
  await p.click("#cart-list .btn:not(.ghost)");
  await p.waitForFunction(() => !window.__lock.released);
  await p.click("#home-key");
  assert.equal(await held(p), false, "HOME lets go of the game");
  /* a store app */
  await wlClear(p);
  await runInRuntime(p, "quiet", "<!doctype html><html><body>quiet</body></html>");
  await p.waitForFunction(() => !window.__lock.released);
  assert.deepEqual(await wl(p), ["request:screen"]);
  await p.click("#home-key");
  assert.equal(await held(p), false, "HOME lets go of the app");
  assert.deepEqual(notBlocked(errors), []);
});

test("wake lock: held in the camera's viewfinder, let go on HOME; a refused request is silent", { skip, timeout: 60000 }, async (t) => {
  const { p, errors, open } = await camPage(t, fakeWakeLock);
  await open();
  await p.waitForSelector("#v-cam:not([hidden])");
  await p.waitForFunction(() => window.__lock && !window.__lock.released);
  await p.click("#home-key");
  assert.equal(await held(p), false);
  /* refused (older iOS, a home-screen app): no toast, no error, the camera works as before */
  await p.evaluate(() => { navigator.wakeLock.request = () => Promise.reject(new DOMException("refused", "NotAllowedError")); });
  await p.locator("#home .app", { has: p.locator(".label", { hasText: /^点阵相机$/ }) }).click();
  await p.waitForSelector("#v-cam:not([hidden])");
  await p.waitForTimeout(300);
  assert.ok(await p.isHidden("#toast"));
  /* and without the API at all */
  await p.click("#home-key");
  await p.evaluate(() => { delete navigator.wakeLock; Object.defineProperty(navigator, "wakeLock", { value: undefined, configurable: true }); });
  await p.locator("#home .app", { has: p.locator(".label", { hasText: /^点阵相机$/ }) }).click();
  await p.waitForTimeout(300);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

/* ---------- tilt and the microphone (runtime/sensors.js, SPEC.md 6.4) ----------
   The phone's prompts are stubs: requestPermission counts and grants, getUserMedia hands back an OscillatorNode's 440 Hz
   stream, navigator.audioSession is a plain object, and the page sends deviceorientation events itself. A small test app
   with "motion" and "mic" records what reaches it. */
const SENSE_APP = readFileSync(join(ROOT, "tests/fixtures/sensor-app/index.html"), "utf8");
const senseInit = () => {
  window.__asked = 0; window.__gum = 0;
  const grant = () => { window.__asked++; return Promise.resolve("granted"); };
  DeviceOrientationEvent.requestPermission = grant;
  DeviceMotionEvent.requestPermission = grant;
  Object.defineProperty(navigator, "audioSession", { value: { type: "auto" }, configurable: true });
  navigator.mediaDevices.getUserMedia = () => {
    window.__gum++;
    const ac = new AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination();
    o.frequency.value = 440; o.connect(d); o.start();
    window.__stream = d.stream;
    return Promise.resolve(d.stream);
  };
  setInterval(() => window.dispatchEvent(new DeviceOrientationEvent("deviceorientation", { beta: 40, gamma: 22.5 })), 50);
};
async function sensePage(t) {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  await p.addInitScript(senseInit);
  await p.goto(base + "/runtime/?debug", { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  return { p, errors };
}
const runSenseApp = async (p, perms = ["motion", "mic"]) => {
  await p.evaluate(([html, perms]) => {
    const a = { id: "sense-test", name: "传感测试", glyph: "感", version: "1.0.0", spec: "lopda/1", buttons: true, permissions: perms, html };
    window.LP.upsert("apps", a); window.LP.runApp(a);
  }, [SENSE_APP, perms]);
  for (let i = 0; i < 50; i++) { const f = p.frames().find((x) => x !== p.mainFrame()); if (f && await f.evaluate(() => !!window.go).catch(() => false)) return f; await p.waitForTimeout(100); }
  assert.fail("the test app did not start");
};
const R = (f) => f.evaluate(() => JSON.parse(JSON.stringify(window.R)));
const press = async (p, b) => { await p.evaluate((b) => { window.LOPDA_DEBUG.setButton(b, true); window.LOPDA_DEBUG.setButton(b, false); }, b); };
const until = async (p, fn, what) => { for (let i = 0; i < 100; i++) { if (await fn()) return; await p.waitForTimeout(100); } assert.fail("timed out waiting for " + what); };

test("sensor motion: the confirm dialog, A allows and readings reach the app; a second start skips the dialog", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await sensePage(t);
  const f = await runSenseApp(p);
  f.evaluate(() => { go("motion"); });
  await p.waitForSelector("#file-ask .box");
  assert.equal(await p.textContent("#file-ask p"), "「传感测试」要用倾斜感应。");
  assert.equal(await p.locator("#file-ask p.note").count(), 0, "no silent-switch line for tilt");
  await press(p, "a");
  await until(p, async () => (await R(f)).results.includes("motion:on"), "motion on");
  assert.equal(await p.evaluate(() => window.__asked), 2, "orientation and motion asked in the same tap");
  await until(p, async () => (await R(f)).tilt.length > 0, "a tilt reading");
  /* flat is counted from lying face up, so the fake phone held at its start pose still reads its real tilt (0.35.0) */
  assert.deepEqual((await R(f)).tilt[0], { x: 0.5, y: 0, heading: null, flat: { x: 0.5, y: -0.875 } });
  /* stop, start again: remembered, no dialog, no second system prompt */
  await f.evaluate(() => PAD.motion.stop());
  await f.evaluate(() => go("motion"));
  assert.equal(await p.locator("#file-ask .box, #sense-tap").count(), 0);
  assert.deepEqual((await R(f)).results, ["motion:on", "motion:on"]);
  assert.equal(await p.evaluate(() => window.__asked), 2);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("sensor mic: B says denied; allowed, the sound reaches the app, the session and the status mark follow; HOME ends the stream", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await sensePage(t);
  const f = await runSenseApp(p);
  f.evaluate(() => { go("mic"); });
  await p.waitForSelector("#file-ask .box");
  assert.match(await p.textContent("#file-ask p.note"), /静音键不起作用/);
  await press(p, "b");
  await until(p, async () => (await R(f)).results.includes("mic:denied"), "mic denied");
  assert.equal(await p.evaluate(() => window.__gum), 0, "no system prompt after B");
  assert.notEqual(await p.evaluate(() => navigator.audioSession.type), "play-and-record", "untouched");
  /* asked again, and allowed with a tap on the dialog */
  f.evaluate(() => { go("mic"); });
  await p.waitForSelector("#file-ask .box");
  await p.click("#file-ok");
  await until(p, async () => (await R(f)).results.includes("mic:on"), "mic on");
  assert.equal(await p.evaluate(() => navigator.audioSession.type), "play-and-record");
  assert.equal(await p.isVisible("#mic-mark"), true);
  await until(p, async () => (await R(f)).sound.some((s) => s.pitch && Math.abs(s.pitch - 440) < 9 && s.level > 0), "a 440 Hz reading");
  /* HOME: the stream's tracks end, the session is ambient again, the mark goes */
  await p.click("#home-key");
  assert.equal(await p.evaluate(() => window.__stream.getTracks().every((x) => x.readyState === "ended")), true);
  assert.equal(await p.evaluate(() => navigator.audioSession.type), "ambient");
  assert.equal(await p.isVisible("#mic-mark"), false);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("sensor: HOME stops the tilt feed; removing a mic app ends its stream too", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await sensePage(t);
  let f = await runSenseApp(p);
  f.evaluate(() => { go("motion"); });
  await p.waitForSelector("#file-ask .box"); await p.click("#file-ok");
  await until(p, async () => (await R(f)).tilt.length > 0, "tilt");
  await p.click("#home-key");
  assert.equal(await p.evaluate(() => window.LP.S.running), null);
  /* the feed is gone: nothing left listening on the page */
  f = await runSenseApp(p);
  await p.waitForTimeout(300);
  assert.deepEqual((await R(f)).tilt, [], "a new run gets nothing before it asks");
  f.evaluate(() => { go("mic"); });
  await p.waitForSelector("#file-ask .box"); await p.click("#file-ok");
  await until(p, async () => (await R(f)).results.includes("mic:on"), "mic on");
  await p.click("#run-del"); await p.click("#run-del-wrap .btn:not(.ghost)");
  assert.equal(await p.evaluate(() => window.__stream.getTracks().every((x) => x.readyState === "ended")), true);
  assert.equal(await p.evaluate(() => navigator.audioSession.type), "ambient");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("sensor: an app without the permission gets denied and no dialog", { skip, timeout: 60000 }, async (t) => {
  const { p } = await sensePage(t);
  const f = await runSenseApp(p, []);
  assert.equal(await f.evaluate(() => go("motion")), "denied");
  assert.equal(await f.evaluate(() => go("mic")), "denied");
  assert.equal(await p.locator("#file-ask .box, #sense-tap").count(), 0);
  assert.equal(await p.evaluate(() => window.__asked + window.__gum), 0);
});

test("sensor: after a relaunch an allowed app gets the tap bar; settings revoke brings the dialog back", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await sensePage(t);
  let f = await runSenseApp(p);
  f.evaluate(() => { go("motion"); });
  await p.waitForSelector("#file-ask .box"); await p.click("#file-ok");
  await until(p, async () => (await R(f)).results.includes("motion:on"), "motion on");
  /* the grant is in IndexedDB: reload, as a relaunch from the home screen would */
  await until(p, () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open("lopda"); r.onsuccess = () => { const g = r.result.transaction("docs").objectStore("docs").get("data/users/local/sensors"); g.onsuccess = () => { r.result.close(); res(!!(g.result && g.result.data.apps["sense-test"])); }; }; })), "the grant stored");
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  await p.waitForTimeout(300);
  f = await runSenseApp(p);
  f.evaluate(() => { go("motion"); });
  await p.waitForSelector("#sense-tap");
  assert.equal(await p.textContent("#sense-tap"), "点一下开启倾斜感应");
  assert.equal(await p.locator("#file-ask .box").count(), 0, "no dialog: the app was allowed before");
  await p.click("#sense-tap");
  await until(p, async () => (await R(f)).results.includes("motion:on"), "motion on after the tap");
  assert.equal(await p.evaluate(() => window.__asked), 2, "the system prompt ran in the bar's tap");
  /* settings lists it; revoke, and the next start asks on the dialog again */
  await p.click("#home-key");
  await p.locator("#home .app", { has: p.locator(".label", { hasText: /^设置$/ }) }).click();
  /* the test app is never stored, so the list names it by id once the home screen has re-read the installed apps */
  assert.match(await p.textContent("#set-sense-list"), /(传感测试|sense-test) · 倾斜/);
  await p.click('#set-sense-list [data-app="sense-test"]');
  assert.match(await p.textContent("#set-sense-list"), /还没有程序用过/);
  f = await runSenseApp(p);
  f.evaluate(() => { go("motion"); });
  await p.waitForSelector("#file-ask .box");
  assert.equal(await p.textContent("#file-ask p"), "「传感测试」要用倾斜感应。");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("sensor: dev.html stands in for the phone: start() follows the manifest, the tilt pad, Shake and the mic sliders", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.goto(`${base}/sdk/dev.html?app=tests/fixtures/sensor-app`, { waitUntil: "load" });
  let f;
  await until(p, async () => { f = p.frames().find((x) => x !== p.mainFrame()); return f && await f.evaluate(() => !!window.go).catch(() => false); }, "the app");
  /* "motion" is declared, "mic" is not */
  assert.equal(await f.evaluate(() => go("motion")), "on");
  assert.equal(await f.evaluate(() => go("mic")), "denied");
  assert.match(await p.textContent("#log"), /ERROR PAD\.mic\.start\(\) needs "permissions": \["mic"\]/);
  /* drag the square to the right edge: x = 1; let go: back to 0 */
  await p.locator("#tiltpad").scrollIntoViewIfNeeded();
  const box = await p.locator("#tiltpad").boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down();
  await p.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 4 });
  await until(p, async () => (await R(f)).tilt.some((v) => v.x >= 0.95), "x near 1");
  await p.mouse.up();
  await until(p, async () => (await R(f)).tilt.at(-1).x === 0, "recentred");
  await p.click("#shake");
  await until(p, async () => (await R(f)).shake === 1, "a shake");
  assert.deepEqual(errors, []);
});

/* ---------- the camera for apps: PAD.camera.snap (runtime/apps/snap.js, SPEC.md 6.6, decisions.md section 28) ----------
   Chromium's fake camera behind --use-fake-device-for-media-stream; getUserMedia is wrapped to keep every stream it gave,
   so a test can see that each track ended. A small test app with "camera" records what each snap returned. */
const SNAP_APP = readFileSync(join(ROOT, "tests/fixtures/snap-app/index.html"), "utf8");
const snapInit = () => {
  const md = navigator.mediaDevices, real = md.getUserMedia.bind(md);
  window.__streams = [];
  md.getUserMedia = async (c) => { const s = await real(c); window.__streams.push(s); return s; };
};
async function snapPage(t) {
  const { p, errors } = await camPage(t, snapInit);
  await p.goto(base + "/runtime/?debug", { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  return { p, errors };
}
const runSnapApp = async (p, perms = ["camera"]) => {
  await p.evaluate(([html, perms]) => {
    const a = { id: "snap-test", name: "拍照测试", glyph: "拍", version: "1.0.0", spec: "lopda/1", permissions: perms, html };
    window.LP.upsert("apps", a); window.LP.runApp(a);
  }, [SNAP_APP, perms]);
  for (let i = 0; i < 50; i++) { const f = p.frames().find((x) => x !== p.mainFrame()); if (f && await f.evaluate(() => !!window.snap).catch(() => false)) return f; await p.waitForTimeout(100); }
  assert.fail("the test app did not start");
};
const allEnded = (p) => p.evaluate(() => window.__streams.length > 0 && window.__streams.every((s) => s.getTracks().every((x) => x.readyState === "ended")));
/* the viewfinder is up and showing the camera: the lens tag appears with the first stream */
const finderLive = (p) => p.waitForFunction(() => !document.getElementById("snap").hidden && !document.getElementById("snap-lens").hidden, null, { timeout: 10000 });

test("camera snap: the dialog first; A opens the viewfinder; the shutter hands the app a 128x112 four-tone picture and ends the stream", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  const f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await p.waitForSelector("#file-ask .box");
  assert.equal(await p.textContent("#file-ask p"), "「拍照测试」想用相机拍一张照片。");
  assert.equal(await p.textContent("#file-ask p.note"), "照片只以四色小图交给它。");
  assert.equal(await p.evaluate(() => window.__streams.length), 0, "no camera before the player says yes");
  await press(p, "a");
  await finderLive(p);
  assert.equal(await p.textContent("#snap-who"), "「拍照测试」要一张照片");
  assert.equal(await p.isVisible("#gamepad"), true, "the camera's keys show while the finder is open");
  /* one screen, nothing scrolls, the two buttons are 44 px */
  for (const id of ["#snap-ok", "#snap-no"]) { const b = await p.locator(id).boundingBox(); assert.ok(b.height >= 44 && b.width >= 44, id); }
  assert.equal(await p.evaluate(() => { const s = document.getElementById("snap"); return s.scrollHeight <= s.clientHeight; }), true);
  /* exposure and contrast keys work in the finder and never reach the app */
  await press(p, "up"); await press(p, "left");
  assert.equal(await p.textContent("#snap-exp"), "亮+1 对−1");
  await p.waitForTimeout(300);   /* a few frames */
  await press(p, "a");
  await until(p, async () => (await R(f)).results.length === 1, "the picture");
  const [r] = (await R(f)).results;
  assert.deepEqual([r.w, r.h, r.n, r.typed], [128, 112, 128 * 112, true]);
  assert.ok(r.tones.filter(Boolean).length >= 2, "a real picture, not one flat tone");
  assert.equal(await allEnded(p), true, "the stream stops with the shutter");
  await p.waitForFunction(() => document.getElementById("snap").hidden);
  assert.equal(await p.isVisible("#gamepad"), false, "the pad goes back to how the app had it");
  assert.ok(await p.evaluate(() => window.LOPDA_DEBUG.sfxLog.includes("shutter")), "the camera's shutter sound");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera snap: B on the dialog and B in the viewfinder give null; large is 256x224; a second snap skips the dialog", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  const f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await p.waitForSelector("#file-ask .box");
  await press(p, "b");
  await until(p, async () => (await R(f)).results.length === 1, "null from the dialog");
  assert.equal(await p.evaluate(() => window.__streams.length), 0);
  /* allowed with a tap on the dialog; B in the finder */
  f.evaluate(() => { snap("large"); });
  await p.waitForSelector("#file-ask .box"); await p.click("#file-ok");
  await finderLive(p);
  assert.deepEqual(await p.evaluate(() => [document.getElementById("snap-cv").width, document.getElementById("snap-cv").height]), [256, 224]);
  await press(p, "b");
  await until(p, async () => (await R(f)).results.length === 2, "null from the finder");
  assert.equal(await allEnded(p), true);
  /* remembered: straight to the finder, no dialog, no bar; the touch shutter */
  f.evaluate(() => { snap("large"); });
  await finderLive(p);
  assert.equal(await p.locator("#file-ask .box, #sense-tap").count(), 0);
  /* a second snap while one is open gets null at once */
  assert.equal(await f.evaluate(() => snap()), null);
  await p.waitForTimeout(300);
  await p.click("#snap-ok");
  await until(p, async () => (await R(f)).results.length === 4, "the large picture");
  const res = (await R(f)).results;
  assert.deepEqual([res[0], res[1], res[2]], [null, null, null]);
  assert.deepEqual([res[3].w, res[3].h, res[3].n], [256, 224, 256 * 224]);
  assert.equal(await allEnded(p), true);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera snap: HOME, removing the app, a hidden page and a vanished frame each give null and end every track", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  let f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await p.waitForSelector("#file-ask .box"); await p.click("#file-ok");
  await finderLive(p);
  const results = [];
  /* HOME: the frame is blanked, so the app cannot report; the runtime's own state shows it */
  await p.click("#home-key");
  assert.equal(await allEnded(p), true, "HOME ends the stream");
  assert.equal(await p.evaluate(() => [document.getElementById("snap").hidden, window.LP.snap.isOpen()].join()), "true,false");
  assert.equal(await p.isVisible("#gamepad"), false);
  /* removing the app while its finder is open (the finder covers the 卸载 button, so it is pressed from the page) */
  f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await finderLive(p);
  await p.evaluate(() => { document.getElementById("run-del").click(); document.querySelector("#run-del-wrap .btn:not(.ghost)").click(); });
  assert.equal(await allEnded(p), true, "removing the app ends the stream");
  assert.equal(await p.evaluate(() => window.LP.snap.isOpen()), false);
  /* the page hidden (locked, another app): null, and nothing comes back. Removing the app dropped its grant: asked again */
  f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await p.waitForSelector("#file-ask .box"); await p.click("#file-ok");
  await finderLive(p);
  await p.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await until(p, async () => (await R(f)).results.length === 1, "null on hide");
  results.push((await R(f)).results[0]);
  assert.equal(await allEnded(p), true);
  await p.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
  await p.waitForTimeout(400);
  assert.equal(await p.evaluate(() => window.LP.snap.isOpen()), false, "not reopened");
  /* the app's frame replaced behind the runtime's back: the quarter-second look lets go */
  f.evaluate(() => { snap(); });
  await finderLive(p);
  await p.evaluate(() => { const old = document.getElementById("run-frame"), n = document.createElement("iframe"); n.id = "run-frame"; old.replaceWith(n); });
  await p.waitForFunction(() => !window.LP.snap.isOpen(), null, { timeout: 3000 });
  assert.equal(await allEnded(p), true, "the owner check ends the stream");
  assert.deepEqual(results, [null]);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera snap: without the permission null and no dialog; Settings lists the grant, revoke brings the dialog back", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  let f = await runSnapApp(p, []);
  assert.equal(await f.evaluate(() => snap()), null);
  assert.equal(await p.locator("#file-ask").count(), 0);
  assert.equal(await p.evaluate(() => window.__streams.length), 0);
  f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await p.waitForSelector("#file-ask .box"); await p.click("#file-ok");
  await finderLive(p); await press(p, "b");
  await until(p, async () => (await R(f)).results.length === 1, "null");
  await p.click("#home-key");
  await p.locator("#home .app", { has: p.locator(".label", { hasText: /^设置$/ }) }).click();
  assert.equal(await p.textContent("#set-sense > span"), "传感器与相机");
  assert.match(await p.textContent("#set-sense-list"), /(拍照测试|snap-test) · 相机/);
  await p.click('#set-sense-list [data-app="snap-test"]');
  assert.match(await p.textContent("#set-sense-list"), /还没有程序用过倾斜感应、麦克风或相机/);
  f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await p.waitForSelector("#file-ask .box");
  assert.equal(await p.textContent("#file-ask p"), "「拍照测试」想用相机拍一张照片。");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera snap: after a relaunch an allowed app gets the tap bar, and the finder opens in its tap", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  let f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await p.waitForSelector("#file-ask .box"); await p.click("#file-ok");
  await finderLive(p); await press(p, "b");
  await until(p, () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open("lopda"); r.onsuccess = () => { const g = r.result.transaction("docs").objectStore("docs").get("data/users/local/sensors"); g.onsuccess = () => { r.result.close(); res(!!(g.result && g.result.data.apps["snap-test"] && g.result.data.apps["snap-test"].camera)); }; }; })), "the grant stored");
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  await p.waitForTimeout(300);
  f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await p.waitForSelector("#sense-tap");
  assert.equal(await p.textContent("#sense-tap"), "点一下开启相机");
  assert.equal(await p.locator("#file-ask .box").count(), 0);
  assert.equal(await p.evaluate(() => window.__streams.length), 0, "no camera before the tap");
  await p.click("#sense-tap");
  await finderLive(p);
  await p.waitForTimeout(300);
  await press(p, "a");
  await until(p, async () => (await R(f)).results.length === 1 && (await R(f)).results[0], "the picture");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera snap: no camera on this page says 相机用不了 and gives null", { skip, timeout: 60000 }, async (t) => {
  const { p } = await snapPage(t);
  await p.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("no camera", "NotFoundError")); });
  const f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await p.waitForSelector("#file-ask .box"); await p.click("#file-ok");
  await until(p, async () => (await R(f)).results.length === 1, "null");
  assert.equal((await R(f)).results[0], null);
  assert.equal(await p.textContent("#toast"), "相机用不了");
  assert.equal(await p.evaluate(() => document.getElementById("snap").hidden), true);
});

/* the camera program's watchdog in the snap viewfinder too (decisions.md section 4) */
test("camera snap: a stream that never gives a picture is restarted once, then the app gets null and every track ends", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  await p.evaluate(() => {
    const w = Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, "videoWidth");
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get() { return this.id === "snap-video" ? 0 : w.get.call(this); } });
  });
  const f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await p.waitForSelector("#file-ask .box"); await p.click("#file-ok");
  await finderLive(p);
  await press(p, "a");   /* no picture yet: the shutter does nothing */
  assert.equal((await R(f)).results.length, 0);
  await until(p, async () => (await R(f)).results.length === 1, "null after the watchdog");
  assert.equal((await R(f)).results[0], null);
  const log = await p.evaluate(() => window.LOPDA_DEBUG.snap);
  assert.ok(log.includes("restart: no frame") && log.includes("none: no frame"), log.join(" | "));
  assert.equal(await p.evaluate(() => window.__streams.length), 2, "one restart, not more");
  assert.equal(await allEnded(p), true);
  assert.equal(await p.textContent("#toast"), "相机用不了");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera snap: a track that ends restarts the stream, and the shutter still works", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  const f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await p.waitForSelector("#file-ask .box"); await p.click("#file-ok");
  await finderLive(p);
  await p.waitForFunction(() => (window.LOPDA_DEBUG.snap || []).includes("live"));
  await p.evaluate(() => { const k = document.getElementById("snap-video").srcObject.getVideoTracks()[0]; k.stop(); k.dispatchEvent(new Event("ended")); });
  await p.waitForFunction(() => { const l = window.LOPDA_DEBUG.snap || []; const i = l.indexOf("restart: ended"); return i >= 0 && l.indexOf("live", i) > i; }, null, { timeout: 10000 });
  await press(p, "a");
  await until(p, async () => (await R(f)).results.length === 1, "the picture");
  assert.equal((await R(f)).results[0].w, 128);
  assert.equal(await allEnded(p), true);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera snap: the camera program's loaded roll, frames, film box and latent images are exactly as before", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  /* load a roll and take a frame in the camera program */
  await p.locator("#home .app", { has: p.locator(".label", { hasText: /^点阵相机$/ }) }).click();
  await p.waitForSelector("#cam-load:not([hidden])"); await p.click("#roll-go");
  await p.waitForFunction(() => !document.getElementById("cam-live-tag").hidden, null, { timeout: 10000 });
  await p.waitForTimeout(400);
  await p.click("#cam-shutter");
  await p.waitForTimeout(1500);   /* the frame and its latent image are written */
  await p.click("#home-key");
  const camState = () => p.evaluate(async () => {
    const all = await window.LopdaPlatform.dumpAll();
    const docs = all.docs.filter((d) => !/\/(sensors|settings|apps|code|kv|preinstall)(\/|$)/.test(d.path)).map((d) => d.path + " " + JSON.stringify(d.data));
    return { docs: docs.sort(), files: all.files.map((f) => f.key).sort() };
  });
  const before = await camState();
  assert.ok(before.docs.some((d) => d.startsWith("data/users/local/film ")), "a roll is loaded");
  assert.equal(before.files.length, 1, "one latent image");
  const f = await runSnapApp(p);
  f.evaluate(() => { snap(); });
  await p.waitForSelector("#file-ask .box"); await p.click("#file-ok");
  await finderLive(p); await p.waitForTimeout(300); await press(p, "select");
  await finderLive(p); await p.waitForTimeout(300); await press(p, "a");
  await until(p, async () => (await R(f)).results.length === 1, "the picture");
  f.evaluate(() => { snap(); });
  await finderLive(p); await press(p, "b");
  await until(p, async () => (await R(f)).results.length === 2, "null");
  await p.click("#home-key");
  await p.waitForTimeout(1000);
  assert.deepEqual(await camState(), before);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("camera snap: dev.html shows a test pattern and returns a real picture; without the permission null and an error in the log", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.goto(`${base}/sdk/dev.html?app=tests/fixtures/snap-app`, { waitUntil: "load" });
  let f;
  await until(p, async () => { f = p.frames().find((x) => x !== p.mainFrame()); return f && await f.evaluate(() => !!window.snap).catch(() => false); }, "the app");
  f.evaluate(() => { snap("large"); });
  await p.waitForFunction(() => !document.getElementById("snapshoot").disabled);
  await p.waitForTimeout(200);
  await p.click("#snapshoot");
  await until(p, async () => (await R(f)).results.length === 1, "the picture");
  const [r] = (await R(f)).results;
  assert.deepEqual([r.w, r.h, r.n, r.typed], [256, 224, 256 * 224, true]);
  assert.ok(r.tones.filter(Boolean).length >= 3, "the test pattern uses the tones");
  f.evaluate(() => { snap(); });
  await p.waitForFunction(() => !document.getElementById("snapcancel").disabled);
  await p.click("#snapcancel");
  await until(p, async () => (await R(f)).results.length === 2, "null");
  assert.equal((await R(f)).results[1], null);
  /* without "camera" in the manifest */
  await p.evaluate(() => { manifest.permissions = []; });
  assert.equal(await f.evaluate(() => snap()), null);
  assert.match(await p.textContent("#log"), /ERROR PAD\.camera\.snap needs "permissions": \["camera"\]/);
  assert.deepEqual(errors, []);
});

/* ---------- the camera demo app: 拍照拼图 (registry/apps/photo-puzzle), on the fake camera above ---------- */
const PP_DIR = join(ROOT, "registry/apps/photo-puzzle");
const PP = { ...JSON.parse(readFileSync(join(PP_DIR, "manifest.json"), "utf8")), html: readFileSync(join(PP_DIR, "index.html"), "utf8") };
/* as the store runs it; `html` may be swapped to stand in for an older runtime */
const runPuzzle = async (p, html = PP.html) => {
  await p.evaluate((a) => { window.LP.upsert("apps", a); window.LP.runApp(a); }, { ...PP, html });
  let f;
  await until(p, async () => { f = p.frames().find((x) => x !== p.mainFrame()); return f && await f.evaluate(() => !!window.PUZZLE).catch(() => false); }, "the puzzle");
  return f;
};
const ppState = (f) => f.evaluate(() => window.PUZZLE.state());
const ppLabels = (f) => f.$$eval("#menu button", (bs) => bs.map((b) => b.textContent + (b.classList.contains("off") ? " off" : "")));
const ppClick = async (f, text) => { await f.locator("#menu button", { hasText: text }).click(); };
/* an unfinished game is kept: opening the app shows 继续 / 主菜单, so a test that wants the main menu presses 主菜单 */
const ppToMain = async (p, f) => {
  await p.waitForTimeout(400);
  if ((await ppState(f)).screen === "title") { await press(p, "down"); await press(p, "a"); }
};
/* a game from the built-in pictures, skipping the opening cut so the test spends its time on the puzzle */
const ppStartBuiltin = async (p, f) => {
  await ppClick(f, "内置图片");
  await until(p, async () => (await ppState(f)).screen === "gallery", "the gallery");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "cut", "the opening cut");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "play", "a game");
};
const ppShot = (f) => f.evaluate(() => document.getElementById("cv").toDataURL());
/* the hole is ink except its last row/column (the lit lip); sample 2 px in from the top-left so the hint arrow
   in the middle of the hole does not colour this pixel */
const ppGapPixel = (f) => f.evaluate(() => {
  const s = window.PUZZLE.state(), c = document.getElementById("cv"), x = c.getContext("2d");
  const col = s.gap % s.n, row = Math.floor(s.gap / s.n);
  return Array.from(x.getImageData(Math.floor(col * 128 / s.n) + 2, Math.floor(row * 112 / s.n) + 2, 1, 1).data);
});
/* the middle of the hole: ink, or paper when the hint arrow is drawn into it */
const ppGapCenter = (f) => f.evaluate(() => {
  const s = window.PUZZLE.state(), c = document.getElementById("cv"), x = c.getContext("2d");
  const col = s.gap % s.n, row = Math.floor(s.gap / s.n);
  return Array.from(x.getImageData(Math.floor((col + 0.5) * 128 / s.n), Math.floor((row + 0.5) * 112 / s.n), 1, 1).data);
});
/* the shortest way home for a 3x3, breadth first over the gap's moves; returns the keys to press */
function solve3(tiles) {
  const goal = "012345678", start = tiles.join(""), prev = new Map([[start, null]]), queue = [start];
  for (let i = 0; i < queue.length && !prev.has(goal); i++) {
    const s = queue[i], g = s.indexOf("8"), r = Math.floor(g / 3), c = g % 3;
    for (const [key, q, ok] of [["up", g + 3, r < 2], ["down", g - 3, r > 0], ["left", g + 1, c < 2], ["right", g - 1, c > 0]]) {
      if (!ok) continue;
      const a = s.split(""); a[g] = a[q]; a[q] = "8"; const n = a.join("");
      if (!prev.has(n)) { prev.set(n, [s, key]); queue.push(n); }
    }
  }
  const keys = []; for (let s = goal; prev.get(s); s = prev.get(s)[0]) keys.unshift(prev.get(s)[1]);
  return keys;
}
const ppPress = async (p, f, b) => { const before = (await ppState(f)).moves; await press(p, b); await until(p, async () => (await ppState(f)).moves === before + 1, "the slide " + b); };
/* a Solver plan lists the cells to slide; the pad takes directions. Walk the board to translate. */
function ppDirs(tiles, plan, n = 3) {
  const t = tiles.slice(), gapPiece = n * n - 1, out = [];
  for (const st of plan) {
    const g = t.indexOf(gapPiece), p = st.p;
    out.push(p === g + n ? "up" : p === g - n ? "down" : p === g + 1 ? "left" : "right");
    t[g] = t[p]; t[p] = gapPiece;
  }
  return out;
}
const ppDir = (s) => { const n = s.n, r = Math.floor(s.gap / n), c = s.gap % n;
  return r < n - 1 ? "up" : c < n - 1 ? "left" : "right"; };

const PP_SAVE = (left) => ({ v: 1, n: 3, tiles: [0, 1, 2, 3, 8, 5, 6, 4, 7], moves: 0, src: "builtin", picKey: "lake",
  helped: false, arcade: true, left: left });

test("photo puzzle: a 2×2 main menu, a four-item game menu that fits 331×359, and a gallery that picks picture and size", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  await p.setViewportSize({ width: 375, height: 667 });   /* the smallest LCD with the chin pad is 331×359 */
  const f = await runPuzzle(p);
  await p.waitForTimeout(600);
  assert.equal((await ppState(f)).screen, "main");
  assert.deepEqual(await ppLabels(f), ["拍一张", "内置图片", "模式 普通", "怎么玩"]);
  assert.equal(await f.textContent("#msg"), "拍一张，或挑一张。");
  assert.equal((await ppState(f)).sel, 0);
  /* a grid, not a list: Down goes to the button below, not to the next one in reading order */
  await press(p, "down"); assert.equal((await ppState(f)).sel, 2);
  await press(p, "right"); assert.equal((await ppState(f)).sel, 3);
  await press(p, "up"); assert.equal((await ppState(f)).sel, 1);
  await press(p, "left"); assert.equal((await ppState(f)).sel, 0);
  /* the mode button toggles in place */
  await press(p, "down"); await press(p, "a");
  let s = await ppState(f);
  assert.deepEqual([s.screen, s.arcade, s.items[2]], ["main", true, "模式 街机"]);
  await press(p, "a");
  assert.deepEqual([(await ppState(f)).arcade, (await ppState(f)).items[2]], [false, "模式 普通"]);
  /* the gallery: left/right browse, up/down changes the size, A starts the picture on screen */
  await ppClick(f, "内置图片");
  await until(p, async () => (await ppState(f)).screen === "gallery", "the gallery");
  assert.deepEqual(await ppLabels(f), ["上一张", "开始", "下一张"]);
  assert.equal(await f.textContent("#info"), "3×3  图 1/6  山湖");
  /* the pad reaches the app through a postMessage: read the state only once the press has landed */
  await press(p, "right");
  await until(p, async () => (await ppState(f)).gallery === 1, "the next picture");
  assert.deepEqual([(await ppState(f)).gallery, await f.textContent("#info")], [1, "3×3  图 2/6  灯塔"]);
  await press(p, "up");
  await until(p, async () => (await ppState(f)).nextN === 4, "the 4×4 size");
  await press(p, "down");
  await until(p, async () => (await ppState(f)).nextN === 3, "the 3×3 size");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "cut", "the opening cut");
  s = await ppState(f);
  assert.deepEqual([s.n, s.gap, s.picKey], [3, 8, "lighthouse"], "the cut starts with the bottom-right cell missing");
  assert.equal((await ppLabels(f)).length, 0, "no buttons during the cut");
  assert.equal(await f.textContent("#ft"), "A 跳过");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "play", "a game");
  s = await ppState(f);
  assert.deepEqual([s.n, s.picKey, s.hasSave], [3, "lighthouse", true]);
  /* four buttons in two rows, all inside the fixed screen, all 44 px tall */
  await press(p, "start");
  await until(p, async () => (await ppState(f)).screen === "menu", "the game menu");
  assert.deepEqual(await ppLabels(f), ["继续", "难度 3×3", "看它解", "主菜单"]);
  const layout = await f.evaluate(() => {
    const m = document.querySelector("main"), menu = document.getElementById("menu"), mb = m.getBoundingClientRect(), nb = menu.getBoundingClientRect();
    return { w: innerWidth, h: innerHeight, scrollH: m.scrollHeight, clientH: m.clientHeight, menuBottom: nb.bottom, mainBottom: mb.bottom,
      buttons: [...menu.querySelectorAll("button")].map((b) => b.getBoundingClientRect().height) };
  });
  assert.deepEqual([layout.w, layout.h >= 350 && layout.h <= 359], [331, true]);
  assert.ok(layout.scrollH <= layout.clientH + 1, `the game screen does not scroll (${layout.scrollH} > ${layout.clientH})`);
  assert.ok(layout.menuBottom <= layout.mainBottom + 1, "the last row of buttons is above the footer");
  assert.ok(layout.buttons.every((h) => h >= 44), JSON.stringify(layout.buttons));
  /* the game menu follows the same grid: down goes to the lower-left, not the next item */
  assert.equal((await ppState(f)).sel, 0);
  await press(p, "down"); assert.equal((await ppState(f)).sel, 2);
  await press(p, "right"); assert.equal((await ppState(f)).sel, 3);
  await press(p, "up"); assert.equal((await ppState(f)).sel, 1);
  await press(p, "left"); assert.equal((await ppState(f)).sel, 0);
  await press(p, "b");
  await until(p, async () => (await ppState(f)).screen === "play", "back to the game");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("photo puzzle: a photo from the fake camera, shown first, then a 3x3 solved by keys; the best is kept and 4x4 is next", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  let f = await runPuzzle(p); await ppToMain(p, f);
  await press(p, "a");   /* 拍一张 is the default */
  await p.waitForSelector("#file-ask .box");
  assert.equal(await p.textContent("#file-ask p"), "「拍照拼图」想用相机拍一张照片。");
  await press(p, "a");
  await finderLive(p); await p.waitForTimeout(300);
  await press(p, "a");   /* the shutter */
  await until(p, async () => (await ppState(f)).screen === "preview", "the photo shown first");
  assert.equal(await allEnded(p), true, "the camera is off once the photo is taken");
  assert.equal(await f.textContent("#msg"), "就用这张吗？");
  /* B takes it again, then A uses the second one */
  await press(p, "b");
  await finderLive(p); await p.waitForTimeout(300);
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "preview", "the retake shown");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "cut", "the opening cut");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "play", "a game");
  let s = await ppState(f);
  assert.deepEqual([s.n, s.fromCamera, s.moves], [3, true, 0]);
  assert.notDeepEqual(s.tiles, [0, 1, 2, 3, 4, 5, 6, 7, 8], "shuffled");
  const keys = solve3(s.tiles);
  assert.ok(keys.length > 0 && keys.length <= 31);
  /* A held shows the whole picture; letting go shows the pieces again */
  const pieces = await ppShot(f);
  await p.evaluate(() => window.LOPDA_DEBUG.setButton("a", true));
  await until(p, async () => (await ppShot(f)) !== pieces, "the peek");
  await p.evaluate(() => window.LOPDA_DEBUG.setButton("a", false));
  await until(p, async () => (await ppShot(f)) === pieces, "the pieces again");
  /* a tap on the piece next to the gap slides it, and a tap back puts it where it was */
  const g = s.gap, q = g % 3 < 2 ? g + 1 : g - 1, box = await f.locator("#cv").boundingBox();
  const tap = (cell) => f.locator("#cv").click({ position: { x: ((cell % 3) + 0.5) * box.width / 3, y: (Math.floor(cell / 3) + 0.5) * box.height / 3 } });
  await tap(q); await until(p, async () => (await ppState(f)).gap === q, "the tap");
  await tap(g); await until(p, async () => (await ppState(f)).gap === g, "the tap back");
  /* a swipe moves the piece it starts on, only towards the gap; any other way is refused with the error sound */
  const fb = await f.locator("#cv").boundingBox(), cx = (cell) => fb.x + ((cell % 3) + 0.5) * fb.width / 3, cy = (cell) => fb.y + (Math.floor(cell / 3) + 0.5) * fb.height / 3;
  const swipe = async (cell, dx, dy) => { await p.mouse.move(cx(cell), cy(cell)); await p.mouse.down(); await p.mouse.move(cx(cell) + dx / 2, cy(cell) + dy / 2); await p.mouse.move(cx(cell) + dx, cy(cell) + dy); await p.mouse.up(); };
  const toward = (from, to) => [Math.sign((to % 3) - (from % 3)) * 40, Math.sign(Math.floor(to / 3) - Math.floor(from / 3)) * 40];
  const errs = () => p.evaluate(() => window.LOPDA_DEBUG.sfxLog.filter((x) => x === "err").length);
  const e0 = await errs();
  await swipe(q, ...toward(q, g).map((v) => -v));
  await until(p, async () => (await errs()) === e0 + 1, "the error sound");
  assert.equal((await ppState(f)).gap, g, "nothing moved");
  await swipe(q, ...toward(q, g)); await until(p, async () => (await ppState(f)).gap === q, "the swipe");
  await swipe(g, ...toward(g, q)); await until(p, async () => (await ppState(f)).gap === g, "the swipe back");
  for (const k of keys.slice(0, -1)) await ppPress(p, f, k);
  await p.waitForTimeout(1100);   /* the runtime drops app sounds over 20 a second */
  await ppPress(p, f, keys.at(-1));
  s = await ppState(f);
  assert.deepEqual([s.screen, s.moves, s.animDone], ["solved", keys.length + 4, false]);
  const during = await ppShot(f);
  await until(p, async () => (await ppState(f)).animDone, "the end of the animation");
  const whole = await ppShot(f);
  assert.notEqual(whole, during, "the picture changes as it comes together");
  assert.equal(await f.textContent("#msg"), "拼好了！");
  assert.deepEqual(await ppLabels(f), ["继续"]);
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "won", "the result");
  assert.equal(await ppShot(f), whole, "the animation ends on exactly the whole photo");
  assert.match(await f.textContent("#msg"), new RegExp(`^拼好了！${keys.length + 4} 步。 新纪录！ 下一局是 4×4。$`));
  assert.deepEqual(await ppLabels(f), ["下一局", "主菜单"]);
  await p.waitForTimeout(400);
  const sfxLog = await p.evaluate(() => window.LOPDA_DEBUG.sfxLog.slice());
  assert.ok(sfxLog.includes("win"), JSON.stringify(sfxLog));
  await p.waitForTimeout(600);
  assert.equal(await f.evaluate(() => PAD.load("game")), null, "a finished game removes the saved one");
  /* the best and the 4×4 choice survive a new start; the gallery now says 4×4 */
  await p.click("#home-key");
  f = await runPuzzle(p); await p.waitForTimeout(600);
  s = await ppState(f);
  assert.deepEqual([s.screen, s.hasSave, s.best, s.nextN], ["main", false, keys.length + 4, 4]);
  await ppClick(f, "内置图片");
  await until(p, async () => (await ppState(f)).screen === "gallery", "the gallery");
  assert.match(await f.textContent("#info"), /^4×4  图 1\/6  山湖$/);
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "cut", "the next cut");
  assert.equal((await ppState(f)).gap, 15, "a 4×4 cut starts with the bottom-right cell missing");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "play", "a 4×4 game");
  assert.equal((await ppState(f)).n, 4);
  await press(p, "start");
  await until(p, async () => (await ppState(f)).screen === "menu", "the 4×4 menu");
  assert.deepEqual(await ppLabels(f), ["继续", "难度 4×4", "看它解", "主菜单"]);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("photo puzzle: without a photo it plays a built-in picture and says why; no camera leaves a disabled snap button", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  /* B on the runtime's dialog: snap gives null */
  let f = await runPuzzle(p); await ppToMain(p, f);
  await press(p, "a");
  await p.waitForSelector("#file-ask .box"); await press(p, "b");
  await until(p, async () => (await ppState(f)).screen === "cut", "the cut after a cancelled snap");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "play", "a game without a photo");
  let s = await ppState(f);
  assert.deepEqual([s.n, s.fromCamera], [3, false]);
  assert.equal(await f.textContent("#msg"), "没拿到照片，用内置图片玩。");
  assert.equal((await ppState(f)).picKey, "lake");
  /* B in the viewfinder */
  await p.click("#home-key");
  f = await runPuzzle(p); await ppToMain(p, f);
  await press(p, "a");
  await p.waitForSelector("#file-ask .box"); await press(p, "a");
  await finderLive(p); await press(p, "b");
  await until(p, async () => (await ppState(f)).screen === "play", "a game after the viewfinder closed");
  assert.equal(await f.textContent("#msg"), "没拿到照片，用内置图片玩。");
  /* the phone has no working camera: the snap still opens, then falls back with the runtime's toast */
  await p.click("#home-key");
  await p.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("no camera", "NotFoundError")); });
  f = await runPuzzle(p); await ppToMain(p, f);
  await press(p, "a");   /* allowed already: no dialog this time */
  await until(p, async () => (await ppState(f)).screen === "play", "the fallback game");
  assert.equal(await p.textContent("#toast"), "相机用不了");
  assert.equal(await f.textContent("#msg"), "没拿到照片，用内置图片玩。");
  /* a runtime before 0.28.0 has no PAD.camera: the snap button is disabled, the gallery still plays */
  await p.click("#home-key");
  const old = PP.html.replace("<script>", "<script>window.PAD = Object.assign({}, PAD, { camera: undefined });</script>\n<script>");
  f = await runPuzzle(p, old); await ppToMain(p, f);
  assert.deepEqual(await ppLabels(f), ["拍一张 off", "内置图片", "模式 普通", "怎么玩"]);
  await press(p, "a");
  assert.equal(await f.textContent("#msg"), "这台掌机不能拍照。");
  await ppClick(f, "内置图片");
  await until(p, async () => (await ppState(f)).screen === "gallery", "the gallery without a camera");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "cut", "the cut without a camera");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "play", "a built-in game without a camera");
  s = await ppState(f);
  assert.deepEqual([s.n, s.fromCamera, s.src], [3, false, "builtin"]);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("photo puzzle: an unfinished game waits on the title after a restart; 主菜单 keeps it; an old file save still opens", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  let f = await runPuzzle(p); await ppToMain(p, f);
  await ppStartBuiltin(p, f);
  /* two real slides */
  for (let i = 0; i < 2; i++) await ppPress(p, f, ppDir(await ppState(f)));
  const before = await ppState(f);
  assert.equal(before.moves, 2);
  await p.waitForTimeout(700);   /* the store writes 0.5 s after the last PAD.save */
  await p.click("#home-key");
  f = await runPuzzle(p); await p.waitForTimeout(400);
  let s = await ppState(f);
  assert.deepEqual([s.screen, s.hasSave], ["title", true]);
  assert.equal(await f.textContent("#msg"), "上次那盘还在这里。");
  assert.deepEqual(await ppLabels(f), ["继续", "主菜单"]);
  assert.equal(await f.textContent("#info"), "3×3  2 步");
  await press(p, "a");   /* 继续 is the default */
  await until(p, async () => (await ppState(f)).screen === "play", "the game carried on");
  s = await ppState(f);
  assert.deepEqual([s.tiles, s.moves, s.hasSave], [before.tiles, 2, true]);
  /* 主菜单 does not drop the game: B goes back to the title and 继续 is still there */
  await press(p, "start");
  await until(p, async () => (await ppState(f)).screen === "menu", "the game menu");
  await ppClick(f, "主菜单");
  await until(p, async () => (await ppState(f)).screen === "main", "the main menu");
  assert.equal((await ppState(f)).hasSave, true);
  await press(p, "b");
  await until(p, async () => (await ppState(f)).screen === "title", "the title");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "play", "the same game again");
  s = await ppState(f);
  assert.deepEqual([s.tiles, s.moves], [before.tiles, 2]);
  /* a 1.1 save with an imported picture still opens; only the import button is gone */
  const pic = Buffer.alloc(128 * 112 / 4).toString("base64");   /* 3584 bytes = 14336 two-bit pixels */
  await f.evaluate((g) => PAD.save("game", g), { v: 1, n: 3, tiles: [0, 1, 2, 3, 8, 5, 6, 4, 7], moves: 3,
    src: "file", pic: pic, helped: false, arcade: false, left: 0 });
  await p.waitForTimeout(900);
  await p.click("#home-key");
  f = await runPuzzle(p); await p.waitForTimeout(500);
  assert.equal((await ppState(f)).screen, "title");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "play", "the old file game");
  s = await ppState(f);
  assert.deepEqual([s.src, s.moves, s.tiles], ["file", 3, [0, 1, 2, 3, 8, 5, 6, 4, 7]]);
  assert.doesNotMatch(await f.textContent("#ft"), /导入/);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("photo puzzle: 看它解 plays by itself and any key stops it; SELECT marks one piece; help keeps no best", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  let f = await runPuzzle(p); await ppToMain(p, f);
  await ppStartBuiltin(p, f);
  /* 看它解 is the third of four buttons: down once from 继续, then A */
  await press(p, "start");
  await until(p, async () => (await ppState(f)).screen === "menu", "the menu");
  await press(p, "down"); await press(p, "a");
  let s = await ppState(f);
  assert.deepEqual([s.screen, s.demo, s.helped], ["play", true, true]);
  await until(p, async () => (await ppState(f)).moves >= 3, "the demo's moves");
  assert.match(await f.textContent("#msg"), /^第 1 行/);
  /* any key stops it, and that key does not also push a piece */
  await press(p, "up");
  const stopped = (await ppState(f)).moves;
  assert.equal((await ppState(f)).demo, false);
  assert.equal(await f.textContent("#msg"), "", "the caption is gone");
  await p.waitForTimeout(700);
  assert.equal((await ppState(f)).moves, stopped, "no more moves after the stop");
  await ppPress(p, f, ppDir(await ppState(f)));
  assert.equal((await ppState(f)).moves, stopped + 1, "the player carries on");
  assert.match(await f.textContent("#info"), /助$/);
  /* a helped game is still solved with animation, music and the unlock, but records no best */
  const keys = solve3((await ppState(f)).tiles);
  for (const k of keys.slice(0, -1)) await ppPress(p, f, k);
  await p.waitForTimeout(1100);
  await ppPress(p, f, keys[keys.length - 1]);
  await until(p, async () => (await ppState(f)).screen === "solved", "solved");
  await press(p, "a"); await until(p, async () => (await ppState(f)).animDone, "the animation");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "won", "the result");
  assert.doesNotMatch(await f.textContent("#msg"), /新纪录/);
  await p.waitForTimeout(400);
  const sfxLog = await p.evaluate(() => window.LOPDA_DEBUG.sfxLog.slice());
  assert.ok(sfxLog.includes("win"), JSON.stringify(sfxLog));
  await p.waitForTimeout(700);
  const saved = await f.evaluate(() => new Promise((r) => PAD.load("puzzle").then(r)));
  assert.equal(saved && saved.best && saved.best["3"], undefined, "no best for a helped game");
  /* SELECT: the next piece is ringed, every piece gets its number, and an arrow points into the hole.
     The picture stays marked until the next slide; SELECT again puts it back. The piece itself does not move. */
  await p.click("#home-key");
  f = await runPuzzle(p); await ppToMain(p, f);
  await ppStartBuiltin(p, f);
  const plain = await ppShot(f), gap0 = (await ppState(f)).gap, moves0 = (await ppState(f)).moves;
  assert.equal((await ppGapCenter(f)).join(), "31,42,20,255", "the empty hole is ink");
  await press(p, "select");
  await until(p, async () => (await ppShot(f)) !== plain, "the marked piece");
  const hinted = await ppState(f);
  assert.equal(hinted.hint, true);
  assert.equal(hinted.numbers, true);
  assert.equal((await ppGapCenter(f)).join(), "163,173,126,255", "the arrow reaches into the hole");
  const marked = await ppShot(f);
  await p.waitForTimeout(900);
  assert.equal(await ppShot(f), marked, "the mark is steady, not a blink");
  assert.equal((await ppState(f)).hint, true, "still marked after a while");
  await press(p, "select");
  await until(p, async () => (await ppShot(f)) === plain, "SELECT again clears the mark");
  const after = await ppState(f);
  assert.deepEqual([after.gap, after.moves, after.hint, after.numbers, after.helped], [gap0, moves0, false, false, true]);
  assert.match(await f.textContent("#info"), /助$/);
  /* a slide is animated: the board is marked as moving, then settles on the new cell */
  await press(p, ppDir(after));
  const sliding = await ppState(f);
  assert.deepEqual([sliding.moves, sliding.moving], [moves0 + 1, true], "the slide starts a short animation");
  await until(p, async () => !(await ppState(f)).moving, "the slide animation to finish");
  assert.notEqual(await ppShot(f), plain, "the piece ended on its new cell");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("photo puzzle: 怎么玩 teaches four lessons; the board shows its gap; a lesson never wins or saves; 主菜单 keeps the game", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  let f = await runPuzzle(p); await ppToMain(p, f);
  const labels = () => ppLabels(f);
  assert.deepEqual(await labels(), ["拍一张", "内置图片", "模式 普通", "怎么玩"]);
  await ppClick(f, "怎么玩");
  await until(p, async () => (await ppState(f)).screen === "lesson", "lesson 1");
  let s = await ppState(f);
  assert.deepEqual([s.mode, s.lesson, s.n, s.moves], ["tutorial", 0, 3, 0]);
  assert.equal(await f.textContent("#info"), "第 1 课  0 步");
  assert.match(await f.textContent("#msg"), /方向键/);
  /* the bug this test exists for: the lesson used to draw the whole picture, with no hole */
  assert.equal((await ppGapPixel(f)).join(), "31,42,20,255", "2 px into the hole is still its ink floor");
  /* a lesson opens with its first move marked: all pieces numbered, the piece ringed, an arrow into the hole */
  assert.equal(s.numbers, true, "every piece shows its number in a lesson");
  assert.deepEqual(s.hintAt, { p: 7, gap: 4 }, "the first lesson's first move: piece 4 (tile 5) up into the hole");
  assert.equal((await ppGapCenter(f)).join(), "163,173,126,255", "the arrow reaches into the hole");
  /* lesson 1 is the two moves from solved: finishing it is not a win, a save, a best or an unlock */
  for (const k of solve3(s.tiles)) await ppPress(p, f, k);
  s = await ppState(f);
  assert.deepEqual([s.screen, s.lessonDone, s.moves], ["lesson", true, 2]);
  assert.equal(s.hint, false, "the opening mark is gone after the first slide");
  assert.equal(s.numbers, true, "the numbers stay, so the lesson's words keep their meaning");
  assert.equal(await f.textContent("#msg"), "做到了！");
  const log = await p.evaluate(() => window.LOPDA_DEBUG.sfxLog.slice());
  assert.ok(!log.includes("win"), "no win sound in a lesson: " + JSON.stringify(log));
  assert.equal(await f.evaluate(() => PAD.load("game")), null, "a lesson never writes the saved game");
  assert.equal((await f.evaluate(() => PAD.load("puzzle")))?.best?.["3"], undefined, "and never a best");
  /* 下一课: lesson 2, one piece to the corner */
  assert.deepEqual(await labels(), ["下一课"]);
  assert.match(await f.textContent("#ft"), /^A 下一课/);
  await press(p, "a");
  await until(p, async () => (await ppState(f)).lesson === 1, "lesson 2");
  s = await ppState(f);
  assert.deepEqual([s.n, s.tiles], [3, [2, 1, 4, 3, 8, 0, 7, 5, 6]]);
  let plan = await f.evaluate(() => Solver.goalPlan(3, window.PUZZLE.state().tiles, [{ p: 0, at: 0 }], []));
  assert.equal(s.hint, true, "lesson 2 also opens with its first move marked");
  assert.equal(s.numbers, true, "tile 1 now has a visible 1 on it");
  assert.equal(s.hintAt.p, plan[0].p, "the arrow starts from the first piece of the lesson's plan");
  for (const d of ppDirs(s.tiles, plan)) await ppPress(p, f, d);
  s = await ppState(f);
  assert.deepEqual([s.tiles[0], s.lessonDone], [0, true]);
  /* lesson 3: the last two of a row, and piece 0 must stay put */
  await press(p, "a");
  await until(p, async () => (await ppState(f)).lesson === 2, "lesson 3");
  s = await ppState(f);
  assert.deepEqual([s.n, s.tiles], [3, [0, 4, 7, 1, 8, 6, 3, 2, 5]]);
  plan = await f.evaluate(() => Solver.goalPlan(3, window.PUZZLE.state().tiles, [{ p: 1, at: 1 }, { p: 2, at: 2 }], [0]));
  for (const d of ppDirs(s.tiles, plan)) await ppPress(p, f, d);
  s = await ppState(f);
  assert.deepEqual([s.tiles[0], s.tiles[1], s.tiles[2], s.lessonDone], [0, 1, 2, true]);
  /* lesson 4: a 4×4 demo; any key stops it and the lesson is over */
  await press(p, "a");
  await until(p, async () => (await ppState(f)).lesson === 3, "lesson 4");
  assert.equal((await ppState(f)).n, 4);
  await until(p, async () => (await ppState(f)).demo, "the 4×4 demo");
  await press(p, "up");
  await until(p, async () => (await ppState(f)).lessonDone, "the demo lesson done");
  assert.equal(await f.textContent("#msg"), "看完了：拼好一行，再拼下一行。");
  assert.deepEqual(await labels(), ["回主菜单"]);
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "main", "back on the main menu");
  assert.equal((await ppState(f)).mode, "normal");
  assert.deepEqual(await labels(), ["拍一张", "内置图片", "模式 普通", "怎么玩"]);
  /* entered with an unfinished game, leaving the lessons puts that game back untouched */
  await ppStartBuiltin(p, f);
  await ppPress(p, f, ppDir(await ppState(f)));
  const before = await ppState(f);
  await press(p, "start");
  await until(p, async () => (await ppState(f)).screen === "menu", "the game menu");
  await ppClick(f, "主菜单");
  await until(p, async () => (await ppState(f)).screen === "main", "the main menu");
  await ppClick(f, "怎么玩");
  await until(p, async () => (await ppState(f)).screen === "lesson", "a lesson from the main menu");
  await press(p, "start");
  await until(p, async () => (await ppState(f)).screen === "menu", "the lesson's menu");
  assert.deepEqual(await labels(), ["继续", "退出教程"]);
  await press(p, "down"); await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "main", "back on the main menu");
  await press(p, "b");
  await until(p, async () => (await ppState(f)).screen === "title", "the title");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "play", "the game before the lessons");
  s = await ppState(f);
  assert.deepEqual([s.mode, s.n, s.tiles, s.moves], ["normal", before.n, before.tiles, before.moves]);
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("photo puzzle: the main menu solves the built-in pictures by itself; the opening cut starts from the bottom-right hole", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  let f = await runPuzzle(p); await ppToMain(p, f);
  let a = (await ppState(f)).attract;
  assert.ok(a && a.n === 3 && a.plan > 0, JSON.stringify(a));
  const first = a.moves;
  await until(p, async () => (await ppState(f)).attract.moves > first, "the attract mode's first moves");
  /* each attract step is a 140 ms slide, not a jump: sample across the next step or two */
  let sliding = false;
  for (let i = 0; i < 8 && !sliding; i++) {
    await p.waitForTimeout(25);
    const at = (await ppState(f)).attract;
    sliding = !!at && at.phase === "solve" && at.moving;
  }
  assert.ok(sliding, "the attract mode slides its pieces");
  let done = false;
  for (let i = 0; i < 40 && !done; i++) { await p.waitForTimeout(300); done = (await ppState(f)).attract?.phase === "done"; }
  assert.ok(done, "the attract game finishes");
  const index = (await ppState(f)).attract.index;
  await p.waitForTimeout(3200);
  a = (await ppState(f)).attract;
  assert.ok(a && a.index !== index && a.phase === "solve", JSON.stringify(a));
  /* the opening cut: original picture, cut lines, then the bottom-right cell drops out */
  await ppClick(f, "内置图片");
  await until(p, async () => (await ppState(f)).screen === "gallery", "the gallery");
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "cut", "the cut");
  let s = await ppState(f);
  assert.deepEqual([s.gap, s.n], [8, 3]);
  assert.match(s.intro.phase, /^(cut|drop)$/);
  assert.equal(await f.textContent("#ft"), "A 跳过");
  await until(p, async () => (await ppState(f)).intro?.phase === "drop", "the bottom-right tile dropping");
  await until(p, async () => (await ppState(f)).intro?.phase === "mix", "the shuffle dissolving in");
  await press(p, "a");   /* skip the rest */
  await until(p, async () => (await ppState(f)).screen === "play", "the game after the cut");
  s = await ppState(f);
  assert.equal(s.hasSave, true);
  assert.notDeepEqual(s.tiles, [0, 1, 2, 3, 4, 5, 6, 7, 8], "the board is shuffled");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("photo puzzle: arcade counts down on the screen-edge fuse, pauses in the menu, and loses at zero", { skip, timeout: 120000 }, async (t) => {
  const { p, errors } = await snapPage(t);
  let f = await runPuzzle(p); await ppToMain(p, f);
  await ppClick(f, "模式 普通");
  await until(p, async () => (await ppState(f)).arcade, "arcade mode");
  await ppStartBuiltin(p, f);
  let s = await ppState(f);
  assert.deepEqual([s.gameArcade, s.arcadeTotal, s.fuse], [true, 120, "on"]);
  assert.ok(s.left > 118 && s.left <= 120, String(s.left));
  await p.waitForTimeout(1400);
  s = await ppState(f);
  assert.ok(s.left < 119, "the fuse burns " + s.left);
  /* START is the pause: the clock stops while the menu is open */
  await press(p, "start");
  await until(p, async () => (await ppState(f)).screen === "menu", "the pause menu");
  const paused = (await ppState(f)).left;
  await p.waitForTimeout(1300);
  assert.ok(Math.abs((await ppState(f)).left - paused) < 0.2, "the clock is paused in the menu");
  await press(p, "b");
  await until(p, async () => (await ppState(f)).screen === "play", "back to play");
  await p.waitForTimeout(800);
  assert.ok((await ppState(f)).left < paused - 0.4, "the clock runs again");
  /* a save with 60 s left shows the fuse half burnt; one with 2 s runs out */
  await press(p, "start");
  await until(p, async () => (await ppState(f)).screen === "menu", "the menu");
  await ppClick(f, "主菜单");
  await until(p, async () => (await ppState(f)).screen === "main", "the main menu");
  await f.evaluate((g) => PAD.save("game", g), PP_SAVE(60));
  await p.waitForTimeout(900);
  await p.click("#home-key");
  f = await runPuzzle(p); await p.waitForTimeout(500);
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "play", "the half-burnt game");
  const widths = await f.evaluate(() => {
    const w = (s) => document.querySelector("#fuse i" + s).getBoundingClientRect().width;
    const h = (s) => document.querySelector("#fuse i" + s).getBoundingClientRect().height;
    return { t: w(".t"), r: h(".r"), b: w(".b"), l: h(".l"), w: innerWidth, h: innerHeight };
  });
  assert.ok(widths.t < 2 && widths.b > widths.w - 2, JSON.stringify(widths));
  await press(p, "start");
  await until(p, async () => (await ppState(f)).screen === "menu", "the menu");
  await ppClick(f, "主菜单");
  await until(p, async () => (await ppState(f)).screen === "main", "the main menu");
  await f.evaluate((g) => PAD.save("game", g), PP_SAVE(2));
  await p.waitForTimeout(900);
  await p.click("#home-key");
  f = await runPuzzle(p); await p.waitForTimeout(500);
  await press(p, "a");
  await until(p, async () => (await ppState(f)).screen === "play", "the last two seconds");
  assert.match((await ppState(f)).fuse, /low/);
  await until(p, async () => (await ppState(f)).screen === "lost", "the end of the fuse");
  s = await ppState(f);
  assert.deepEqual([s.left, s.hasSave, s.fuse], [0, false, ""]);
  assert.deepEqual(await ppLabels(f), ["再来一局", "主菜单"]);
  assert.equal(await f.textContent("#msg"), "时间到。");
  await p.waitForTimeout(600);
  assert.equal(await f.evaluate(() => PAD.load("game")), null, "a lost game is not kept");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});


/* ---------- the two demo apps: 滚珠迷宫 (tilt) and 吹蜡烛 (microphone), with the stubbed phone above ----------
   Each starts its sensor only when play starts and stops it when play pauses or ends; "denied" falls back to keys. */
const runDemo = async (p, id) => {
  const man = JSON.parse(readFileSync(join(ROOT, "registry/apps", id, "manifest.json"), "utf8"));
  const html = readFileSync(join(ROOT, "registry/apps", id, "index.html"), "utf8");
  await p.evaluate(([man, html]) => { const a = Object.assign({}, man, { html }); window.LP.upsert("apps", a); window.LP.runApp(a); }, [man, html]);
  let f;
  await until(p, async () => { f = p.frames().find((x) => x !== p.mainFrame()); return f && await f.evaluate(() => !!window.game).catch(() => false); }, id);
  await p.waitForTimeout(300);
  return f;
};
const micOn = (p) => p.evaluate(() => !document.getElementById("mic-mark").hidden && navigator.audioSession.type === "play-and-record");

test("tilt-maze: A starts a level and asks for tilt; the tilt rolls the ball; START pauses and stops it", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await sensePage(t);
  const f = await runDemo(p, "tilt-maze");
  assert.equal(await f.evaluate(() => mode), "tilt");
  assert.equal(await p.locator("#file-ask .box").count(), 0, "nothing is asked on the title screen");
  await press(p, "a");
  await p.waitForSelector("#file-ask .box");
  assert.equal(await p.textContent("#file-ask p"), "「滚珠迷宫」要用倾斜感应。");
  await press(p, "a");
  await until(p, () => f.evaluate(() => live), "tilt live");
  const x0 = await f.evaluate(() => S0.x);
  /* gamma 22.5 is x = 0.5: the ball rolls right, to the wall of the first level */
  await until(p, () => f.evaluate((x0) => ball.x > x0 + 20 && Math.abs(ball.y - S0.y) < 1, x0), "the ball to roll right");
  await press(p, "start");
  await until(p, () => f.evaluate(() => !live && tilt.x === 0), "tilt off while paused");
  const xp = await f.evaluate(() => ball.x);
  await p.waitForTimeout(400);
  assert.equal(await f.evaluate(() => ball.x), xp, "the ball rests while paused");
  /* 继续: on again, with no dialog (the app is remembered) */
  await press(p, "a");
  await until(p, () => f.evaluate(() => live), "tilt live again");
  assert.equal(await p.locator("#file-ask .box").count(), 0);
  /* clearing a level stops the tilt too */
  await f.evaluate(() => { ball.x = G0.x; ball.y = G0.y; });
  await until(p, () => f.evaluate(() => state === "clear" && !live), "cleared, tilt off");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("tilt-maze: B on the dialog falls back to keys, says so, and the D-pad pushes the ball", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await sensePage(t);
  const f = await runDemo(p, "tilt-maze");
  await press(p, "a");
  await p.waitForSelector("#file-ask .box");
  await press(p, "b");
  await until(p, () => f.evaluate(() => mode === "keys" && !live), "keys");
  assert.equal(await f.evaluate(() => note), "倾斜未允许：用方向键");
  const x0 = await f.evaluate(() => ball.x);
  await p.evaluate(() => window.LOPDA_DEBUG.setButton("right", true));
  await until(p, () => f.evaluate((x0) => ball.x > x0 + 10, x0), "the D-pad to move the ball");
  await p.evaluate(() => window.LOPDA_DEBUG.setButton("right", false));
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("blow-candles: a round opens the mic, a loud sound puts candles out, the mic closes between rounds and on pause", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await sensePage(t);
  const f = await runDemo(p, "blow-candles");
  assert.equal(await micOn(p), false, "no mic on the title screen");
  await press(p, "a");
  await p.waitForSelector("#file-ask .box");
  assert.match(await p.textContent("#file-ask p.note"), /静音键不起作用/);
  await until(p, () => p.evaluate(() => LP.chip.state().ambience === "fire"), "the fire ambience");
  await p.evaluate(() => { window.__ctx0 = LP.SND.ctx; });
  await press(p, "a");
  await until(p, () => f.evaluate(() => live), "listening");
  assert.equal(await micOn(p), true);
  /* the context that was playing is kept, and a stopped one runs again without a touch (0.24.2) */
  await p.waitForTimeout(800);
  assert.ok(await p.evaluate(() => LP.SND.ctx === window.__ctx0 && LP.SND.ctx.state === "running" && LP.chip.state().ambience === "fire"));
  /* the mic off: the context that played beside it is replaced, so iOS leaves the phone-call session (0.24.3) */
  await press(p, "start");
  await until(p, async () => !(await micOn(p)), "the mic off while paused");
  await until(p, () => p.evaluate(() => LP.SND.ctx !== window.__ctx0 && window.__ctx0.state === "closed"), "a new context");
  await until(p, () => p.evaluate(() => LP.SND.ctx.state === "running" && LP.chip.state().ambience === "fire"), "the fire running again");
  await press(p, "a");
  await until(p, () => f.evaluate(() => live), "listening again");
  /* the stub's full-scale tone is far above the threshold: the candles go out and the round ends */
  await until(p, () => f.evaluate(() => R.c.some((c) => !c.lit)), "a candle out");
  await until(p, () => f.evaluate(() => R.phase === "done"), "the round over");
  assert.equal(await micOn(p), false, "the mic is off between rounds");
  assert.equal(await p.evaluate(() => navigator.audioSession.type), "ambient");
  assert.ok(await f.evaluate(() => score > 0));
  /* the next round opens it again, without the dialog; START closes it */
  await p.waitForTimeout(700);
  await press(p, "a");
  await until(p, () => f.evaluate(() => R.i === 1 && live), "round 2 listening");
  assert.equal(await p.locator("#file-ask .box").count(), 0);
  await press(p, "start");
  await until(p, async () => !(await micOn(p)) && !(await f.evaluate(() => live)), "the mic off while paused");
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

test("blow-candles: B on the dialog falls back to holding A, says so, and A puts a candle out", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await sensePage(t);
  const f = await runDemo(p, "blow-candles");
  await press(p, "a");
  await p.waitForSelector("#file-ask .box");
  await press(p, "b");
  await until(p, () => f.evaluate(() => mode === "keys" && !live), "keys");
  assert.equal(await f.evaluate(() => note), "话筒未允许：按住 A 吹");
  assert.equal(await micOn(p), false);
  await until(p, () => f.evaluate(() => R.phase === "play"), "the clock running");
  await p.evaluate(() => window.LOPDA_DEBUG.setButton("a", true));
  await until(p, () => f.evaluate(() => R.c.some((c) => !c.lit)), "a candle out with A held");
  await p.evaluate(() => window.LOPDA_DEBUG.setButton("a", false));
  assert.deepEqual(errors.filter((e) => !SW_NOISE.test(e)), []);
});

/* a 32 KB MBC3 cartridge with a clock, 8 KB of RAM and a battery (type 0x10): it switches the RAM on, writes 0x5A at the
   first RAM byte and 0xC3 at the last, then loops. Built here, no game. */
function savRom() {
  const rom = new Uint8Array(0x8000);
  rom.set([0x00, 0xc3, 0x50, 0x01], 0x100);
  rom.set([0x3e, 0x0a, 0xea, 0x00, 0x00, 0x3e, 0x00, 0xea, 0x00, 0x40, 0x3e, 0x5a, 0xea, 0x00, 0xa0, 0x3e, 0xc3, 0xea, 0xff, 0xbf, 0x18, 0xfe], 0x150);
  rom.set(Buffer.from("SAV TEST"), 0x134);
  rom[0x147] = 0x10; rom[0x148] = 0x00; rom[0x149] = 0x02;
  let x = 0; for (let i = 0x134; i <= 0x14c; i++) x = (x - rom[i] - 1) & 0xff;
  rom[0x14d] = x;
  return Buffer.from(rom);
}

test("cart: the battery save goes out as a .sav and comes back in; a wrong size changes nothing; tossing a cart keeps its saves", { skip, timeout: 90000 }, async (t) => {
  const { createHash } = await import("node:crypto");
  const { p, errors } = await page(t, { locale: "zh-CN", viewport: { width: 331, height: 359 } });
  await p.route(/jsdelivr/, (r) => r.abort());
  await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  const rom = savRom(), id = createHash("sha256").update(rom).digest("hex").slice(0, 24);
  const doc = () => p.evaluate((id) => window.LP.S.refs.cartsave.doc(id).get().then((sn) => {
    if (!sn.exists) return null;
    const d = sn.data(), bin = d.sram ? atob(d.sram) : "";
    return { sram: Array.from(bin, (c) => c.charCodeAt(0)), state: !!d.state, stateAt: d.stateAt };
  }), id);
  const toastIs = (re) => p.waitForFunction((src) => { const el = document.getElementById("toast"); return !el.hidden && new RegExp(src).test(el.textContent); }, re.source, { timeout: 10000 });
  let chooserOpened = 0; p.on("filechooser", () => chooserOpened++);
  let downloaded = 0; p.on("download", () => downloaded++);
  const press = (sel) => p.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.left + 5, clientY: r.top + 5, bubbles: true, pointerType: "touch" }));
  });
  const exp = "#cart-list li.cart-item .cart-acts .btn:nth-child(1)", imp = "#cart-list li.cart-item .cart-imp",
    toss = "#cart-list li.cart-item .cart-acts .btn:nth-child(3)", note = "#cart-list li.cart-item .cart-note";
  const pick = async (buffer) => {
    const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.click(imp)]);
    await fc.setFiles({ name: "SAVE.sav", mimeType: "application/octet-stream", buffer });
  };

  await tile(p, "卡带机");
  await p.setInputFiles("#cart-file", { name: "savtest.gb", mimeType: "application/octet-stream", buffer: rom });
  await p.waitForSelector("#cart-list li.cart-item");
  assert.ok(await p.$eval(exp, (b) => b.disabled), "no battery save yet: export is off");
  /* the three actions sit in one row under the cartridge, inside the smallest screen */
  const boxes = await p.$$eval("#cart-list li.cart-item .cart-acts .btn", (bs) => bs.map((b) => b.getBoundingClientRect().toJSON()));
  assert.equal(new Set(boxes.map((b) => Math.round(b.top))).size, 1);
  assert.ok(boxes.every((b) => b.right <= 331 && b.height >= 44));

  /* play: the game writes its RAM, eject keeps it; a quick save too */
  await p.click("#cart-list .acts .btn");
  await p.waitForSelector("#cart-play:not([hidden])", { timeout: 10000 });
  await p.waitForTimeout(500);
  await p.click("#cart-save");
  await p.click("#cart-eject");
  await p.waitForFunction(() => !document.querySelector("#cart-list li.cart-item .cart-acts .btn").disabled);
  let d = await doc();
  assert.equal(d.sram.length, 8192, "the core's battery file is the 8 KB RAM, no clock after it");
  assert.equal(d.sram[0], 0x5a); assert.equal(d.sram[8191], 0xc3);
  assert.ok(d.state);

  /* export: nothing on the press, the file on the click (release) */
  await press(exp); await p.waitForTimeout(300);
  assert.equal(downloaded, 0);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click(exp)]);
  assert.equal(dl.suggestedFilename(), "SAV_TEST.sav");
  const { readFile: rf } = await import("node:fs/promises");
  assert.deepEqual(Array.from(await rf(await dl.path())), d.sram);

  /* import: the picker opens on the click, not the press */
  await press(imp); await p.waitForTimeout(300);
  assert.equal(chooserOpened, 0);
  /* a wrong size is refused and changes nothing */
  await pick(Buffer.alloc(100, 1));
  await toastIs(/这个存档和卡带对不上/);
  assert.equal(await p.textContent(imp), "导入存档");
  assert.deepEqual(await doc(), d);
  /* size + 48 (a clock footer): asks first, then takes the first 8 KB and empties the quick save */
  const withClock = Buffer.alloc(8192 + 48, 0xee); withClock.fill(0x11, 0, 8192); withClock[0] = 0x22;
  await pick(withClock);
  await p.waitForFunction((sel) => document.querySelector(sel).textContent === "确认导入", imp);
  assert.match(await p.textContent(note), /即时存档也会清空/);
  assert.deepEqual(await doc(), d, "nothing changes before the second tap");
  await p.click(imp);
  await toastIs(/存档换好了/);
  d = await doc();
  assert.equal(d.sram.length, 8192); assert.equal(d.sram[0], 0x22); assert.equal(d.sram[8191], 0x11);
  assert.equal(d.state, false); assert.equal(d.stateAt, undefined);
  /* the exact size */
  const plain = Buffer.alloc(8192, 0x33);
  await pick(plain);
  await p.waitForFunction((sel) => document.querySelector(sel).textContent === "确认导入", imp);
  await p.click(imp);
  await toastIs(/存档换好了/);
  await p.waitForFunction((id) => window.LP.S.refs.cartsave.doc(id).get().then((sn) => atob(sn.data().sram).charCodeAt(0) === 0x33), id);
  assert.ok(chooserOpened >= 3);

  /* toss: the confirmation says the saves stay; they do, and the same ROM finds them again */
  await p.click(toss);
  assert.equal(await p.textContent(toss), "确认扔掉");
  assert.equal(await p.textContent(note), "存档会留着，重新导入这张卡带就能接着玩。");
  await p.click(toss);
  await p.waitForSelector("#cart-list li.empty");
  assert.equal((await doc()).sram[0], 0x33, "cartsave stays");
  await p.setInputFiles("#cart-file", { name: "savtest.gb", mimeType: "application/octet-stream", buffer: rom });
  await p.waitForSelector("#cart-list li.cart-item");
  assert.equal(await p.$eval(exp, (b) => b.disabled), false, "the save is found by the ROM's hash");
  const [dl2] = await Promise.all([p.waitForEvent("download"), p.click(exp)]);
  assert.deepEqual(Array.from(await rf(await dl2.path())), Array.from(plain));
  assert.deepEqual(notBlocked(errors), []);
});

/* emulator_delete frees the ROM copy itself; the player freed it a second time, and the next start could find another buffer
   (the save being loaded) written over its ROM: a blank screen with the sound on, until a reload */
test("cart: the ROM in the emulator stays whole across eject, play again and a .sav import", { skip, timeout: 90000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  await p.route(/jsdelivr/, (r) => r.abort());
  await p.goto(base + "/runtime/?debug", { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.LP && window.LP.S.db);
  /* 1 MB, MBC5 + 32 KB RAM + battery: switches the RAM on, adds one to its first byte, loops; the rest is a known pattern */
  const SZ = 0x100000, rom = new Uint8Array(SZ);
  for (let i = 0x200; i < SZ; i++) rom[i] = (i * 7) & 0xff;
  rom.set([0x00, 0xc3, 0x50, 0x01], 0x100);
  rom.set([0x3e, 0x0a, 0xea, 0x00, 0x00, 0x3e, 0x00, 0xea, 0x00, 0x40, 0xfa, 0x00, 0xa0, 0x3c, 0xea, 0x00, 0xa0, 0x18, 0xfe], 0x150);
  rom.set(Buffer.from("PATTERN"), 0x134); rom[0x147] = 0x1b; rom[0x148] = 0x05; rom[0x149] = 0x03;
  let x = 0; for (let i = 0x134; i <= 0x14c; i++) x = (x - rom[i] - 1) & 0xff;
  rom[0x14d] = x;
  await tile(p, "卡带机");
  await p.setInputFiles("#cart-file", { name: "pattern.gb", mimeType: "application/octet-stream", buffer: Buffer.from(rom) });
  await p.waitForSelector("#cart-list li.cart-item");
  const playAndCheck = async (when) => {
    await p.click("#cart-list .acts .btn");
    await p.waitForSelector("#cart-play:not([hidden])", { timeout: 10000 });
    await p.waitForTimeout(300);
    const bad = await p.evaluate((n) => {
      const G = window.LOPDA_DEBUG.GB, h = new Uint8Array(G.mod.HEAP8.buffer, G.rom, n);
      let bad = 0; for (let i = 0x200; i < n; i++) if (h[i] !== ((i * 7) & 0xff)) bad++;
      return bad;
    }, SZ);
    assert.equal(bad, 0, "ROM bytes changed " + when);
    await p.click("#cart-eject");
    await p.waitForSelector("#cart-lib:not([hidden])");
  };
  await playAndCheck("on the first start");
  await playAndCheck("after an eject");
  const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.click("#cart-list .cart-imp")]);
  await fc.setFiles({ name: "PATTERN.sav", mimeType: "application/octet-stream", buffer: Buffer.alloc(32768, 7) });
  await p.waitForFunction(() => document.querySelector("#cart-list .cart-imp").textContent === "确认导入");
  await p.click("#cart-list .cart-imp");
  await playAndCheck("after a .sav import");
  await playAndCheck("after another eject");
  assert.deepEqual(notBlocked(errors), []);
});

/* ---------------- whole-device backup and restore (Settings) ---------------- */

/* both databases read straight from IndexedDB, Blobs and typed arrays as their bytes in hex: what "byte for byte" compares */
const dumpRaw = (p) => p.evaluate(async () => {
  const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
  const all = (name, store) => new Promise((res, rej) => {
    const r = indexedDB.open(name); r.onerror = () => rej(r.error);
    r.onsuccess = () => { const s = r.result.transaction(store).objectStore(store), k = s.getAllKeys(), v = s.getAll();
      v.onsuccess = () => { r.result.close(); res(k.result.map((key, i) => [key, v.result[i]])); }; v.onerror = () => rej(v.error); };
  });
  const canon = async (v) => {
    const t = Object.prototype.toString.call(v);
    if (t === "[object Blob]" || t === "[object File]") return { blob: v.type, name: v.name, hex: hex(new Uint8Array(await v.arrayBuffer())) };
    if (ArrayBuffer.isView(v)) return { view: t, hex: hex(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
    if (Array.isArray(v)) return Promise.all(v.map(canon));
    if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = await canon(v[k]); return o; }
    return v;
  };
  const docs = await all("lopda", "docs"), files = await all("lopda-files", "files");
  return { docs: Object.fromEntries(docs.map(([k, v]) => [k, v.data])), files: Object.fromEntries(await Promise.all(files.map(async ([k, v]) => [k, await canon(v)]))) };
});
/* zip.js on Node's side, to look inside a backup */
const zipReader = () => {
  const neg = runScript("runtime/negative.js", { TextEncoder, TextDecoder }).LopdaNegative;
  return runScript("runtime/zip.js", { TextEncoder, TextDecoder, LopdaNegative: neg }).LopdaZip;
};
const wipeRaw = (p) => p.evaluate(() => Promise.all([["lopda", "docs"], ["lopda-files", "files"]].map(([name, store]) => new Promise((res, rej) => {
  const r = indexedDB.open(name); r.onerror = () => rej(r.error);
  r.onsuccess = () => { const tx = r.result.transaction(store, "readwrite"); tx.objectStore(store).clear(); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
}))));

/* a page with a mouse (on a desktop the backup downloads) and the downloads kept */
async function backupPage(t) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: "zh-CN" });
  t.after(() => p.close());
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await p.route(/jsdelivr/, (r) => r.abort());
  const boot = async (how = "goto") => {
    if (how === "goto") await p.goto(base + "/runtime/", { waitUntil: "networkidle" });
    await p.waitForFunction(() => window.LP && window.LP.S.db && document.querySelectorAll("#home .app:not(.builtin)").length >= 2, null, { timeout: 15000 });
    await p.waitForTimeout(600);   /* let the programs' first reads and writes settle */
  };
  const settings = async () => { await p.click("#home-key"); await tile(p, "设置"); await p.waitForSelector("#v-settings:not([hidden])"); };
  const msg = () => p.textContent("#set-backup-msg");
  const backup = async () => {
    await p.click("#set-backup-go");
    await p.waitForFunction(() => /^备份全部数据，约 .+。$/.test(document.getElementById("set-backup-msg").textContent), null, { timeout: 20000 });
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#set-backup-btns .btn:not(.ghost)")]);
    await p.waitForSelector("#set-backup-box", { state: "hidden" });
    return { name: dl.suggestedFilename(), bytes: await readFile(await dl.path()) };
  };
  const pick = async (buffer) => {
    const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.click("#set-restore-go")]);
    await fc.setFiles({ name: "lopda-backup.zip", mimeType: "application/zip", buffer });
  };
  return { p, errors, boot, settings, msg, backup, pick };
}

/* data made by several programs: a note, an anniversary, a roll with a latent, a word in the word book, an app's PAD.save,
   a cartridge with a save; and things the programs only read (a sensor grant, the volume) */
async function makeData(p, tag) {
  const { createHash } = await import("node:crypto");
  const rom = savRom(), id = createHash("sha256").update(rom).digest("hex").slice(0, 24);
  await p.evaluate((tag) => LP.notes.append("备份 " + tag, "这一篇要回来。"), tag);
  await p.evaluate(async ({ tag, id }) => {
    const db = LP.S.db, now = new Date();
    LP.dict.toggleWord("serendipity");
    await db.doc("data/users/local/calendar/days/bk" + tag).set({ name: "纪念 " + tag, month: now.getMonth() + 1, day: now.getDate(), lunar: false, leap: false });
    const c = new OffscreenCanvas(80, 70), x = c.getContext("2d"); x.fillStyle = "#c84"; x.fillRect(0, 0, 80, 70);
    await window.LopdaPlatform.files.put("roll/rbk" + tag + "/01.jpg", await c.convertToBlob({ type: "image/jpeg" }));
    await LP.put(LP.S.refs.rolls.doc("rbk" + tag), { id: "rbk" + tag, no: 1, stock: "sunny", seed: 7, size: 1, res: 1, loaded: 1, out: 2, name: "卷 " + tag, bytes: 100,
      frames: [{ n: 1, px: "2".repeat(128 * 112), taken: 3, dated: false, exposure: 0, contrast: 0 }] });
    await LP.put(LP.S.refs.cartsave.doc(id), { sram: btoa("\x5a".repeat(64)) });
    /* anything else in the files database: a structured value with a typed array, as an imported dictionary's index */
    await window.LopdaPlatform.files.put("probe/" + tag, { words: ["a", "b"], off: new Uint32Array([1, 2]), at: new Date(5) });
    await db.doc("data/users/local/sensors").set({ apps: { probe: { motion: true } } });
  }, { tag, id });
  /* the cartridge, through the cartridge player; then an app that keeps a value with PAD.save */
  await p.click("#home-key"); await tile(p, "卡带机");
  await p.setInputFiles("#cart-file", { name: "savtest.gb", mimeType: "application/octet-stream", buffer: rom });
  await p.waitForSelector("#cart-list li.cart-item");
  await p.click("#home-key");
  await runInRuntime(p, "probe", `<!doctype html><html><body><script>PAD.save("k", ${JSON.stringify("值 " + tag)});</script></body></html>`);
  await p.waitForFunction(() => window.LP.S.refs.kv.doc("probe").get().then((s) => s.exists), null, { timeout: 5000 });
  await p.click("#home-key");
  return { id };
}

test("backup: Settings saves every document and file; after a wipe, restore brings each back byte for byte and the programs show it", { skip, timeout: 120000 }, async (t) => {
  const { p, errors, boot, settings, msg, backup, pick } = await backupPage(t);
  await boot();
  await makeData(p, "1");
  /* start once with the data, so what a start writes once (the calendar's daily hint) is in the backup already */
  await p.waitForTimeout(800);
  await p.reload({ waitUntil: "networkidle" }); await boot("reload");
  await settings();
  assert.match(await p.textContent("#set-backup-last"), /还没有备份过/);
  const file = await backup();
  assert.match(file.name, /^lopda-backup-\d{8}\.zip$/);
  assert.match(await p.textContent("#set-backup-last"), /^上次备份：今天$/);
  const before = await dumpRaw(p);
  assert.equal(before.docs["data/users/local/backup-meta"].last > 0, true);
  assert.ok(Object.keys(before.files).some((k) => k.startsWith("roll/rbk1/")));
  /* the zip: stored entries, the manifest, the documents */
  const { inflateRawSync } = await import("node:zlib");
  const Z = zipReader();
  const list = Z.list(new Uint8Array(file.bytes));
  assert.deepEqual([...list.slice(0, 2).map((e) => e.name)], ["manifest.json", "docs.json"]);
  const manifest = JSON.parse(new TextDecoder().decode(await Z.read(new Uint8Array(file.bytes), list[0], (u) => new Uint8Array(inflateRawSync(u)))));
  assert.equal(manifest.format, 1);
  assert.equal(manifest.runtime, await p.evaluate(() => LP.RUNTIME_VERSION));
  assert.equal(manifest.docs, Object.keys(before.docs).length);
  assert.deepEqual(manifest.files.map((f) => f.key).sort(), Object.keys(before.files).sort());

  /* wipe both databases, start again: the handheld is new */
  await wipeRaw(p);
  await p.reload({ waitUntil: "networkidle" }); await boot("reload");
  await settings();
  assert.match(await p.textContent("#set-backup-last"), /还没有备份过/);
  await pick(file.bytes);
  await p.waitForFunction(() => /^这个备份做于 /.test(document.getElementById("set-backup-msg").textContent), null, { timeout: 20000 });
  assert.match(await msg(), new RegExp(`${manifest.docs} 份文档、${manifest.files.length} 个文件`));
  assert.deepEqual(await p.$$eval("#set-backup-btns .btn", (bs) => bs.map((b) => b.textContent)), ["恢复", "先备份现在的数据", "取消"]);
  await p.click("#set-backup-btns .btn:not(.ghost)");
  assert.match(await msg(), /现在的数据会全部被替换/);
  await Promise.all([p.waitForEvent("load", { timeout: 20000 }), p.click("#set-backup-btns .btn:not(.ghost)")]);
  await boot("reload");
  const after = await dumpRaw(p);
  assert.deepEqual(after.files, before.files);
  assert.deepEqual(after.docs, before.docs);
  /* the programs start from the restored data */
  assert.equal(await p.evaluate(() => LP.dict.inBook("serendipity")), true);
  await tile(p, "记事本");
  await p.waitForFunction(() => /备份 1/.test(document.getElementById("v-notes").textContent), null, { timeout: 5000 });
  await p.click("#home-key"); await tile(p, "万年历"); await p.click("#cal-list-btn");
  await p.waitForFunction(() => /纪念 1/.test(document.getElementById("v-cal").textContent), null, { timeout: 5000 });
  await p.click("#home-key"); await tile(p, "冲洗店");
  await p.waitForFunction(() => /卷 1/.test(document.getElementById("dk-list").textContent), null, { timeout: 5000 });
  await p.click("#home-key"); await tile(p, "卡带机");
  await p.waitForSelector("#cart-list li.cart-item");
  assert.equal(await p.$eval("#cart-list li.cart-item .cart-acts .btn:nth-child(1)", (b) => b.disabled), false, "the cartridge's save is there");
  await p.click("#home-key");
  assert.deepEqual(await p.evaluate(() => LP.S.refs.kv.doc("probe").get().then((s) => s.data().kv)), { k: "值 1" }, "the app's PAD.save data");
  assert.equal(await p.evaluate(() => LP.sensorGrants.list().map((g) => g.id).join()), "probe");
  await settings();
  assert.match(await p.textContent("#set-backup-last"), /^上次备份：今天$/, "the restored handheld knows when its data was saved");
  assert.deepEqual(notBlocked(errors), []);
});

test("backup: a damaged, foreign or newer backup is refused and nothing changes; a write failing halfway puts the old data back", { skip, timeout: 120000 }, async (t) => {
  const { p, errors, boot, settings, msg, backup, pick } = await backupPage(t);
  await boot();
  await makeData(p, "1");
  await p.waitForTimeout(800);
  await settings();
  const file = await backup();
  /* the handheld moves on after the backup: what is on it now must survive every failed restore */
  await makeData(p, "2");
  await p.evaluate(() => LP.notes.append("只在现在", "备份里没有这一篇。"));
  await p.waitForTimeout(800);
  await settings();
  const now = await dumpRaw(p);
  assert.ok(Object.keys(now.files).some((k) => k.startsWith("roll/rbk2/")));
  const refused = async (buffer, re) => {
    await pick(buffer);
    await p.waitForFunction((src) => new RegExp(src).test(document.getElementById("set-backup-msg").textContent), re.source, { timeout: 20000 });
    assert.deepEqual(await p.$$eval("#set-backup-btns .btn", (bs) => bs.map((b) => b.textContent)), ["好"]);
    await p.click("#set-backup-btns .btn");
    await p.waitForSelector("#set-backup-box", { state: "hidden" });
    assert.deepEqual(await dumpRaw(p), now);
  };
  const Z = zipReader(), u8 = new Uint8Array(file.bytes), list = Z.list(u8);
  /* one byte of a stored file changed */
  const bad = Buffer.from(file.bytes), f0 = list.find((e) => e.name === "files/0");
  bad[f0.offset + 30 + "files/0".length] ^= 0xff;
  await refused(bad, /^这个备份文件不完整或已损坏$/);
  /* cut short, and not a zip at all */
  await refused(Buffer.from(file.bytes).subarray(0, file.bytes.length >> 1), /^这个备份文件不完整或已损坏$/);
  await refused(Buffer.from("hello, this is not a backup"), /^这个备份文件不完整或已损坏$/);
  /* a listed file missing; a newer format (the zip itself is sound in both) */
  const entries = await Promise.all(list.map(async (e) => ({ name: e.name, data: new Uint8Array(await Z.read(u8, e)) })));
  await refused(Buffer.from(Z.write(entries.filter((e) => e.name !== "files/0"))), /^这个备份文件不完整或已损坏$/);
  const m = JSON.parse(new TextDecoder().decode(entries[0].data)); m.format = 2;
  await refused(Buffer.from(Z.write([{ name: "manifest.json", data: JSON.stringify(m) }].concat(entries.slice(1)))), /^这个备份来自更新的版本/);

  /* 先备份现在的数据: saves the current data, then comes back to the same question */
  await pick(file.bytes);
  await p.waitForFunction(() => /^这个备份做于 /.test(document.getElementById("set-backup-msg").textContent), null, { timeout: 20000 });
  await p.click("#set-backup-btns .btn:nth-child(2)");
  await p.waitForFunction(() => /^备份全部数据，约 /.test(document.getElementById("set-backup-msg").textContent), null, { timeout: 20000 });
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#set-backup-btns .btn:not(.ghost)")]);
  assert.match(dl.suggestedFilename(), /^lopda-backup-\d{8}\.zip$/);
  await p.waitForFunction(() => /^这个备份做于 /.test(document.getElementById("set-backup-msg").textContent), null, { timeout: 20000 });
  const current = await dumpRaw(p);   /* backup-meta now says today */

  /* the files database refuses a write: the documents were already replaced, so all of it is written back */
  await p.evaluate(() => {
    const put = IDBObjectStore.prototype.put; let n = 0; window.__arm = true;
    IDBObjectStore.prototype.put = function (...a) {
      if (window.__arm && this.name === "files" && ++n === 1) { window.__arm = false; throw new DOMException("stubbed failure", "UnknownError"); }
      return put.apply(this, a);
    };
  });
  await p.click("#set-backup-btns .btn:not(.ghost)");
  await p.click("#set-backup-btns .btn:not(.ghost)");
  await p.waitForFunction(() => /^恢复失败，什么都没有改。$/.test(document.getElementById("set-backup-msg").textContent), null, { timeout: 20000 });
  assert.equal(await p.evaluate(() => window.__arm), false, "the stub did fire");
  assert.deepEqual(await dumpRaw(p), current);
  assert.deepEqual(notBlocked(errors).filter((e) => !/restore failed|stubbed failure/.test(e)), []);
});

/* ---------- PAD.notes.append and PAD.say (decisions.md section 25) ----------
   A small test app with "notes" records every answer. speechSynthesis is a stub: speak() records the utterance and starts it,
   __end() finishes it, cancel() interrupts it. The voices are an iPhone's: Cantonese before Mandarin. */
const NOTES_APP = readFileSync(join(ROOT, "tests/fixtures/notes-app/index.html"), "utf8");
const speechInit = () => {
  window.__said = [];
  let cur = null;
  const voices = [{ name: "Sin-ji", lang: "zh-HK" }, { name: "Tingting", lang: "zh-CN" }, { name: "Samantha", lang: "en-US" }, { name: "Kyoko", lang: "ja-JP" }];
  const synth = {
    getVoices: () => voices, addEventListener() {},
    speak(u) { window.__said.push({ text: u.text, voice: u.voice.name, lang: u.lang, volume: u.volume }); cur = u; setTimeout(() => u.onstart && u.onstart(), 0); },
    cancel() { const u = cur; cur = null; window.__said.push("cancel"); if (u && u.onerror) u.onerror({ error: "interrupted" }); },
  };
  window.__end = () => { const u = cur; cur = null; if (u) u.onend(); };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
};
const runNotesApp = async (p, perms = ["notes"]) => {
  await p.evaluate(([html, perms]) => {
    const a = { id: "notes-app", name: "记事测试", glyph: "记", version: "1.0.0", spec: "lopda/1", buttons: true, permissions: perms, html };
    /* stored like an installed app, so the notes list finds its name after HOME reads the apps again */
    const { html: _, ...meta } = a;
    window.LP.S.refs.apps.doc(a.id).set(meta);
    window.LP.upsert("apps", a); window.LP.runApp(a);
  }, [NOTES_APP, perms]);
  let f;
  await until(p, async () => { f = p.frames().find((x) => x !== p.mainFrame()); return f && await f.evaluate(() => !!window.note).catch(() => false); }, "the test app");
  return f;
};
const appNotes = (n) => n.docs().then((d) => d.filter((x) => x.src === "app:notes-app"));

test("notes: an app's append shows the runtime's dialog; A writes its own note, a second append adds to it, B refuses; the player's note with that title is never touched", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t, { init: speechInit });
  const p = n.p;
  await p.evaluate(() => LP.S.refs.notes.doc("mine").set({ body: "战绩\n\n我自己的", updated: Date.now() - 9000 }));
  const f = await runNotesApp(p);
  f.evaluate(() => { note("战绩", "第一局 120\n2\n3\n4\n5\n6\n7\n8"); });
  await p.waitForSelector("#file-ask .box");
  assert.equal(await p.textContent("#file-ask p"), "「记事测试」要写进记事本「战绩」：");
  assert.equal(await p.textContent("#file-quote"), "第一局 120\n2\n3\n4\n5\n6…", "the first 6 lines");
  assert.equal(await p.textContent("#file-ok"), "写入");
  assert.equal(await p.textContent("#file-no"), "不写");
  await n.key("a");
  await until(p, async () => (await R(f)).notes.length === 1, "the answer");
  assert.deepEqual((await R(f)).notes, ["saved"]);
  let mine = await appNotes(n);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].body, "战绩\n\n第一局 120\n2\n3\n4\n5\n6\n7\n8");
  /* the second goes into the same note, here by a tap */
  f.evaluate(() => { note("战绩", "第二局 130"); });
  await p.waitForSelector("#file-ask .box");
  await p.click("#file-ok");
  await until(p, async () => (await R(f)).notes.length === 2, "the second answer");
  mine = await appNotes(n);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].body, "战绩\n\n第一局 120\n2\n3\n4\n5\n6\n7\n8\n\n第二局 130");
  /* B refuses and writes nothing */
  f.evaluate(() => { note("战绩", "第三局"); });
  await p.waitForSelector("#file-ask .box");
  await n.key("b");
  await until(p, async () => (await R(f)).notes.length === 3, "the third answer");
  assert.deepEqual((await R(f)).notes, ["saved", "saved", "denied"]);
  assert.doesNotMatch((await appNotes(n))[0].body, /第三局/);
  const user = (await n.docs()).find((d) => d.id === "mine");
  assert.equal(user.body, "战绩\n\n我自己的");
  assert.equal(user.src, undefined);
  /* in notes: the row names the app; 来自 app is a group; it is not a quote */
  await n.open();
  const line = await p.$$eval("#notes-main li", (l) => l.map((x) => x.textContent));
  assert.ok(line.some((x) => /^战绩记事测试 · /.test(x)), line.join(" | "));
  assert.ok(line.some((x) => /^战绩\d\d:\d\d · 我自己的/.test(x)), "the player's note has no app name");
  await n.key("start", "a");
  assert.deepEqual(await n.sheet(), ["*日记0", "摘抄0", "来自 app1"]);
  await n.key("down", "down", "a");
  assert.equal(await p.textContent("#notes-filter"), "来自 app · 1 篇");
  assert.deepEqual(await n.rows(), ["*战绩"]);
  assert.deepEqual(notBlocked(n.errors), []);
});

test("daily-slip: B does not write; START opens notes and a saved slip stays in the app", { skip, timeout: 30000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/daily-slip`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  const app = p.frameLocator("#app");
  await app.locator("#drawBtn").click();
  await app.locator("#slip.show").waitFor();
  assert.equal(await app.locator("#writeBtn").textContent(), "START Notes");
  await p.locator('#pad [data-b="b"]').click();
  await p.waitForTimeout(100);
  assert.equal(await p.locator("#log").evaluate((el) => (el.textContent.match(/notes\.append dialog:/g) || []).length), 0);
  await p.locator('#pad [data-b="start"]').click();
  await p.waitForFunction(() => /notes\.append dialog:/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  await p.waitForFunction(() => /-> saved/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  assert.equal(await app.locator("#writeBtn").isDisabled(), true);
  assert.equal(await app.locator("#slip.show").count(), 1, "saving does not leave the app");
  assert.doesNotMatch(await p.textContent("#log"), /ERROR|load failed/);
  assert.deepEqual(errors, []);
});

test("notes: an app's note round-trips through export and import with source: app:<id>; 来自 app holds it again", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  await n.p.evaluate(async () => {
    await LP.S.refs.notes.doc().set({ body: "战绩\n\n120", updated: Date.now() - 1000, created: Date.now() - 2000, src: "app:notes-app" });
    await LP.S.refs.notes.doc().set({ body: "日常\n\n买菜", updated: Date.now() - 1000 });
    await LP.S.refs.notes.doc().set({ body: "《词典》\n\ngreen", updated: Date.now() - 1000, src: "dict" });
  });
  await n.open();
  await n.key("start");
  const [dl] = await Promise.all([n.p.waitForEvent("download"), n.key("down", "down", "a")]);
  const file = join(tempDir(t), "notes.zip");
  await dl.saveAs(file);
  await n.key("b");
  const text = (await readFile(file)).toString("utf8");
  assert.match(text, /\nsource: app:notes-app\n---\n战绩\n\n120/);
  assert.equal(text.match(/source:/g).length, 1, "only the app's note has a source");
  /* delete everything, import: the app's note is the app's again, the quote a quote by its title */
  for (let i = 0; i < 3; i++) {
    await n.p.click("#notes-list li:nth-child(1) button");
    await n.key("start", "down", "down", "a");
    await n.p.waitForTimeout(150);
  }
  await n.p.setInputFiles("#notes-file", file);
  await n.p.waitForFunction(() => /导入 3 篇/.test(document.getElementById("toast").textContent));
  const live = (await n.docs()).filter((d) => !d.deleted);
  assert.equal(live.find((d) => d.body.startsWith("战绩")).src, "app:notes-app");
  assert.equal(live.find((d) => d.body.startsWith("日常")).src, undefined);
  assert.equal(live.find((d) => d.body.startsWith("《词典》")).src, undefined);
  await n.key("start", "a");
  assert.deepEqual(await n.sheet(), ["*日记0", "摘抄1", "来自 app1"]);
  assert.deepEqual(notBlocked(n.errors), []);
});

test("notes: an app is denied without the permission, past the limits, and while its dialog is open; no dialog for those", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  const p = n.p;
  let f = await runNotesApp(p, []);
  assert.equal(await f.evaluate(() => note("t", "x")), "denied");
  assert.equal(await p.locator("#file-ask .box").count(), 0);
  f = await runNotesApp(p);
  assert.equal(await f.evaluate(() => note("字".repeat(65), "x")), "denied");
  assert.equal(await f.evaluate(() => note("t", "a".repeat(4097))), "denied");
  assert.equal(await f.evaluate(() => note("a\nb", "x")), "denied");
  assert.equal(await f.evaluate(() => note("t", "")), "denied");
  assert.equal(await p.locator("#file-ask .box").count(), 0);
  /* 64 characters and 4 KB exactly are fine: the dialog opens */
  f.evaluate(() => { note("字".repeat(64), "a".repeat(4096)); });
  await p.waitForSelector("#file-ask .box");
  /* one dialog per app: a second call while it is open is denied at once, and the first still waits */
  assert.equal(await f.evaluate(() => note("t", "again")), "denied");
  assert.equal(await p.locator("#file-ask .box").count(), 1);
  await n.key("b");
  await until(p, async () => (await R(f)).notes.length === 6, "every answer");
  assert.deepEqual((await R(f)).notes, ["denied", "denied", "denied", "denied", "denied", "denied"]);
  assert.deepEqual(await appNotes(n), []);
  /* HOME with the dialog open: closed, nothing written */
  f = await runNotesApp(p);
  f.evaluate(() => { note("t", "x"); });
  await p.waitForSelector("#file-ask .box");
  await p.click("#home-key");
  await p.waitForTimeout(500);
  assert.equal(await p.locator("#file-ask .box").count(), 0);
  assert.deepEqual(await appNotes(n), []);
});

test("notes: the dialog fits 331 x 359 with a long title and text", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t);
  const p = n.p;
  const f = await runNotesApp(p);
  f.evaluate(() => { note("一个很长很长的标题".repeat(7).slice(0, 64), Array.from({ length: 12 }, (_, i) => "第" + i + "行 " + "很长的文字".repeat(12)).join("\n")); });
  await p.waitForSelector("#file-ask .box");
  /* the smallest screen, sized as the calendar's test sizes it */
  await p.setViewportSize({ width: 375, height: 844 });
  const r = await p.evaluate(() => {
    const screen = document.getElementById("screen"), status = screen.querySelector(".status");
    screen.style.flex = "none";
    screen.style.height = (359 + 12 + status.getBoundingClientRect().height) + "px";
    const v = document.getElementById("v-run").getBoundingClientRect(), s = screen.getBoundingClientRect();
    const b = document.querySelector("#file-ask .box").getBoundingClientRect(), ok = document.getElementById("file-ok").getBoundingClientRect();
    return { view: [Math.round(v.width), Math.round(v.height)], inside: b.top >= s.top - 0.5 && b.bottom <= s.bottom + 0.5 && b.left >= s.left - 0.5 && b.right <= s.right + 0.5, ok: ok.height, box: [b.top - s.top, s.bottom - b.bottom] };
  });
  assert.deepEqual(r.view, [331, 359]);
  assert.ok(r.inside, "the dialog is inside the screen: " + r.box);
  assert.ok(r.ok >= 43.5);
});

test("say: the zh voice is Mandarin, en is en; the volume follows the handheld step (2 of 4: 0.25 / 0.6), 0 is unavailable; once a second; a new call stops the old; HOME stops it", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t, { init: speechInit });
  const p = n.p;
  const f = await runNotesApp(p);
  const said = () => p.evaluate(() => window.__said);
  const r1 = f.evaluate(() => say("你好"));
  await until(p, async () => (await said()).length > 0, "speech");
  await p.evaluate(() => window.__end());
  assert.equal(await r1, "done");
  assert.deepEqual((await said()).filter((x) => x !== "cancel"), [{ text: "你好", voice: "Tingting", lang: "zh-CN", volume: 0.25 / 0.6 }]);
  /* within the same second: unavailable, nothing said */
  assert.equal(await f.evaluate(() => say("again")), "unavailable");
  await p.clock.fastForward(1000);
  const r2 = f.evaluate(() => say("hello", { lang: "en" }));
  await until(p, async () => (await said()).some((x) => x.voice === "Samantha"), "the English voice");
  await p.clock.fastForward(1000);
  const r3 = f.evaluate(() => say("next", { lang: "en" }));
  r3.catch(() => {});   /* HOME below takes its frame away before it settles */
  assert.equal(await r2, "stopped", "the new call stopped the old one");
  await until(p, async () => (await said()).some((x) => x.text === "next"), "the next one");
  /* volume 0: silent and unavailable; the one speaking goes on */
  await p.evaluate(() => { LP.SND.vol = 0; });
  await p.clock.fastForward(1000);
  const before = (await said()).length;
  assert.equal(await f.evaluate(() => say("quiet")), "unavailable");
  assert.equal((await said()).length, before);
  assert.equal(await p.evaluate(() => LP.speech.speaking()), true);
  /* HOME stops it */
  await p.evaluate(() => { LP.SND.vol = 2; });
  await p.click("#home-key");
  assert.equal(await p.evaluate(() => LP.speech.speaking()), false);
  assert.equal((await said()).at(-1), "cancel");
  assert.deepEqual(notBlocked(n.errors), []);
});

test("say: the page going hidden stops it; dev.html logs notes and says, and answers as its select says", { skip, timeout: 60000 }, async (t) => {
  const n = await notesPage(t, { init: speechInit });
  const f = await runNotesApp(n.p);
  const r = f.evaluate(() => say("hidden"));
  await until(n.p, async () => (await n.p.evaluate(() => window.__said.length)) > 0, "speech");
  await n.p.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  assert.equal(await r, "stopped");
  /* dev.html */
  const { p, errors } = await page(t);
  await p.addInitScript(speechInit);
  await p.goto(`${base}/sdk/dev.html?app=tests/fixtures/notes-app`, { waitUntil: "load" });
  let d;
  await until(p, async () => { d = p.frames().find((x) => x !== p.mainFrame()); return d && await d.evaluate(() => !!window.note).catch(() => false); }, "the app");
  assert.equal(await d.evaluate(() => note("战绩", "第一局 120")), "saved");
  assert.match(await p.textContent("#log"), /notes\.append dialog: 「记事测试」要写进记事本「战绩」：\n第一局 120\n  -> saved/);
  await p.selectOption("#notesans", "denied");
  assert.equal(await d.evaluate(() => note("战绩", "x")), "denied");
  assert.equal(await d.evaluate(() => note("战绩", "a".repeat(5000))), "denied");
  assert.match(await p.textContent("#log"), /ERROR PAD\.notes\.append: the text is at most 4 KB/);
  const s = d.evaluate(() => say("hello", { lang: "en" }));
  await until(p, async () => (await p.evaluate(() => window.__said.length)) > 0, "speech in dev.html");
  await p.evaluate(() => window.__end());
  assert.equal(await s, "done");
  assert.match(await p.textContent("#log"), /say \(en\): hello/);
  assert.deepEqual(errors, []);
});

test("kana-cards: browse both kana scripts, read Japanese aloud when supported, and answer a quiz", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.addInitScript(speechInit);
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/kana-cards`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  let f;
  await until(p, async () => { f = p.frames().find((x) => x !== p.mainFrame()); return f && await f.evaluate(() => !!window.PAD && !!PAD.say).catch(() => false); }, "kana app");
  await f.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 5000 });
  await p.locator("#app").evaluate((el) => { el.style.width = "331px"; el.style.height = "359px"; el.style.flex = "none"; });
  assert.deepEqual(await f.evaluate(() => [...PAD.say.languages]), ["zh", "en", "ja"]);
  const insideScreen = async () => f.evaluate(() => {
    const root = document.documentElement;
    const visible = ["header", "main", "#meta", "#card", "#prompt", "#options", "#controls", "#status"]
      .map((s) => document.querySelector(s)).filter((el) => getComputedStyle(el).display !== "none");
    return { size: [root.clientWidth, root.clientHeight], inside: visible.every((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= root.clientHeight && r.left >= 0 && r.right <= root.clientWidth;
    }) };
  });
  assert.deepEqual(await insideScreen(), { size: [331, 359], inside: true });
  assert.equal(await f.evaluate(() => document.body.classList.contains("list")), true, "the app opens on the kana list");
  assert.equal(await f.locator("#reference button").count(), 71);
  await p.locator('#pad [data-b="b"]').click();
  assert.equal(await f.evaluate(() => document.body.classList.contains("list")), true, "B on the list does not start a quiz");
  await p.locator('#pad [data-b="start"]').click();
  await f.waitForFunction(() => document.body.classList.contains("quiz"));
  assert.equal(await f.textContent("#count"), "1/71", "START begins a quiz for the selected kana");
  await p.locator('#pad [data-b="b"]').click();
  await f.waitForFunction(() => document.body.classList.contains("list"));
  assert.equal(await f.locator("#view").textContent(), "START Quiz");

  await f.locator("#reference button[aria-label='あ a']").click();
  await f.waitForFunction(() => document.body.classList.contains("card"));
  assert.equal(await f.textContent("#kana"), "あ");
  assert.equal(await f.locator("#view").textContent(), "B List");
  await p.locator('#pad [data-b="start"]').click();
  assert.equal(await f.evaluate(() => document.body.classList.contains("card")), true, "START in card mode does not unexpectedly launch a quiz");
  await f.click("#hear");
  await until(p, async () => /say \(ja\): あ/.test(await p.textContent("#log")), "Japanese say request");
  await until(p, async () => (await p.evaluate(() => window.__said.some((x) => x && x.text === "あ"))), "Japanese speech");
  assert.deepEqual((await p.evaluate(() => window.__said.filter((x) => x !== "cancel")))[0], { text: "あ", voice: "Kyoko", lang: "ja-JP", volume: 0.42 });
  await f.click("#prev");
  assert.equal(await f.textContent("#kana"), "ぽ", "previous wraps from the first kana to the last");
  await f.click("#next");
  assert.equal(await f.textContent("#kana"), "あ", "next returns to the first kana");
  await f.click("#next");
  assert.equal(await f.textContent("#kana"), "い", "next advances exactly one kana");
  await p.locator('#pad [data-b="b"]').click();
  await f.waitForFunction(() => document.body.classList.contains("list"));
  const selectedKana = () => f.locator("#reference button[aria-selected='true']");
  assert.equal(await selectedKana().getAttribute("aria-label"), "い i");
  assert.equal(await selectedKana().evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(31, 42, 20)");
  assert.equal(await f.locator("#reference button[aria-selected='false']").first().evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(163, 173, 126)");
  await p.locator('#pad [data-b="down"]').click();
  await f.waitForFunction(() => document.querySelector("#reference button[aria-selected='true']").getAttribute("aria-label") === "き ki");
  await p.locator('#pad [data-b="up"]').click();
  await f.waitForFunction(() => document.querySelector("#reference button[aria-selected='true']").getAttribute("aria-label") === "い i");
  await p.locator('#pad [data-b="right"]').click();
  await f.waitForFunction(() => document.querySelector("#reference button[aria-selected='true']").getAttribute("aria-label") === "う u");
  await p.locator('#pad [data-b="a"]').click();
  await f.waitForFunction(() => document.body.classList.contains("card"));
  assert.equal(await f.textContent("#kana"), "う", "A opens the selected kana");
  await p.locator('#pad [data-b="b"]').click();
  await f.waitForFunction(() => document.body.classList.contains("list"));
  assert.equal(await f.locator("#reference button").count(), 71);
  assert.deepEqual(await f.locator("#reference button").evaluateAll((buttons) => buttons.slice(0, 5).map((b) => b.getAttribute("aria-label"))),
    ["あ a", "い i", "う u", "え e", "お o"]);
  const ya = await f.locator("#reference button[aria-label='や ya']").boundingBox();
  const yu = await f.locator("#reference button[aria-label='ゆ yu']").boundingBox();
  const yo = await f.locator("#reference button[aria-label='よ yo']").boundingBox();
  const ra = await f.locator("#reference button[aria-label='ら ra']").boundingBox();
  assert.ok(ya.y === yu.y && yu.y === yo.y && ya.x < yu.x && yu.x < yo.x, "ya-row kana follow gojuon column order");
  assert.ok(ra.y > ya.y, "the ra row follows the ya row");
  await f.locator("#reference button[aria-label='ん n']").click();
  assert.equal(await f.textContent("#kana"), "ん", "tapping a kana opens its card");
  await p.locator('#pad [data-b="b"]').click();
  await f.waitForFunction(() => document.body.classList.contains("list"));
  await f.locator("#reference button[aria-label='よ yo']").click();
  assert.equal(await f.textContent("#kana"), "よ");
  await p.locator('#pad [data-b="b"]').click();
  await f.waitForFunction(() => document.body.classList.contains("list"));
  await f.click("#script");
  assert.equal(await f.textContent("#kana"), "ヨ");
  assert.equal(await f.evaluate(() => document.body.classList.contains("list")), true);
  assert.equal(await f.locator("#reference button").count(), 71);
  assert.deepEqual(await f.locator("#reference button").evaluateAll((buttons) => buttons.slice(0, 5).map((b) => b.getAttribute("aria-label"))),
    ["ア a", "イ i", "ウ u", "エ e", "オ o"]);
  await f.click("#script");
  await p.locator('#pad [data-b="start"]').click();
  await f.waitForFunction(() => document.body.classList.contains("quiz"));
  assert.equal(await f.locator("#options button").count(), 4);
  assert.equal(await f.textContent("#guide"), "Arrows choose · A answer · B list");
  assert.equal(await f.textContent("#prompt"), "Choose this kana's romaji");
  assert.equal(await f.textContent("#count"), "38/71", "START quiz tests the list cursor kana");
  assert.deepEqual(await insideScreen(), { size: [331, 359], inside: true });
  const noQuizOverlap = await f.evaluate(() => {
    const items = ["#meta", "#card", "#prompt", "#options", "#controls", "#status"]
      .map((s) => document.querySelector(s)).filter((el) => getComputedStyle(el).display !== "none");
    const rects = items.map((el) => el.getBoundingClientRect());
    return rects.every((a, i) => rects.slice(i + 1).every((b) => a.bottom <= b.top || b.bottom <= a.top));
  });
  assert.equal(noQuizOverlap, true, "quiz sections do not overlap");
  const selectedChoice = async () => Number(await f.locator("#options button.selected").getAttribute("data-index"));
  const choiceBefore = await selectedChoice();
  await p.locator('#pad [data-b="down"]').click();
  await f.waitForFunction((index) => Number(document.querySelector("#options button.selected").getAttribute("data-index")) !== index, choiceBefore);
  assert.notEqual(await selectedChoice(), choiceBefore, "down moves the quiz option");
  await p.locator('#pad [data-b="up"]').click();
  await f.waitForFunction((index) => Number(document.querySelector("#options button.selected").getAttribute("data-index")) === index, choiceBefore);
  assert.equal(await selectedChoice(), choiceBefore, "up returns to the original quiz row");
  await p.locator('#pad [data-b="right"]').click();
  await f.waitForFunction((index) => Number(document.querySelector("#options button.selected").getAttribute("data-index")) !== index, choiceBefore);
  assert.notEqual(await selectedChoice(), choiceBefore, "right moves between quiz columns");
  const target = Number((await f.textContent("#count")).split("/")[0]) - 1;
  await f.locator(`#options button[data-index="${target}"]`).click();
  await f.waitForFunction(() => /Correct|正确/.test(document.getElementById("status").textContent), null, { timeout: 3000 });
  await p.locator('#pad [data-b="b"]').click();
  await f.waitForFunction(() => document.body.classList.contains("list"));
  assert.equal(await f.locator("#reference button[aria-selected='true']").getAttribute("aria-label"), "よ yo", "B exits quiz to the list cursor");
  assert.deepEqual(errors, []);

  const zh = await page(t, { locale: "zh-CN" });
  await zh.p.goto(`${base}/sdk/dev.html?app=registry/apps/kana-cards&lang=zh`, { waitUntil: "load" });
  await zh.p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  let zhFrame;
  await until(zh.p, async () => { zhFrame = zh.p.frames().find((x) => x !== zh.p.mainFrame()); return zhFrame && await zhFrame.evaluate(() => !!window.PAD).catch(() => false); }, "Chinese kana app");
  await zh.p.locator("#app").evaluate((el) => { el.style.width = "331px"; el.style.height = "359px"; el.style.flex = "none"; });
  await zh.p.locator('#pad [data-b="start"]').click();
  await zhFrame.waitForFunction(() => document.body.classList.contains("quiz"));
  assert.equal(await zhFrame.textContent("#guide"), "↑↓←→ 选项 · A 确认 · B 字表");
  assert.equal(await zhFrame.textContent("#prompt"), "选出这个假名的罗马字");
  const zhNoOverlap = await zhFrame.evaluate(() => {
    const items = ["#meta", "#card", "#prompt", "#options", "#controls", "#status"]
      .map((s) => document.querySelector(s)).filter((el) => getComputedStyle(el).display !== "none");
    const rects = items.map((el) => el.getBoundingClientRect());
    return rects.every((a, i) => rects.slice(i + 1).every((b) => a.bottom <= b.top || b.bottom <= a.top));
  });
  assert.equal(zhNoOverlap, true, "Chinese quiz sections do not overlap at the smallest screen");
  assert.deepEqual(zh.errors, []);
});

test("kana-cards: the guide row stays put while only the kana grid scrolls", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/kana-cards`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  let f;
  await until(p, async () => { f = p.frames().find((x) => x !== p.mainFrame()); return f && await f.evaluate(() => !!window.PAD).catch(() => false); }, "kana app");
  await p.locator("#app").evaluate((el) => { el.style.width = "331px"; el.style.height = "359px"; el.style.flex = "none"; });
  await f.waitForFunction(() => document.body.classList.contains("list"));
  const geo = () => f.evaluate(() => {
    const meta = document.querySelector("#meta").getBoundingClientRect();
    const reference = document.querySelector("#reference");
    return { guideTop: Math.round(meta.top), scroll: reference.scrollTop, scrollable: reference.scrollHeight > reference.clientHeight };
  });
  const before = await geo();
  assert.equal(before.scrollable, true, "the kana grid is taller than the screen");
  assert.equal(before.scroll, 0, "the grid starts at the top");
  await f.evaluate(() => { document.querySelector("#reference").scrollTop = 500; });
  await f.waitForFunction(() => document.querySelector("#reference").scrollTop > 0);
  const after = await geo();
  assert.ok(after.scroll > 0, "only the grid scrolled");
  assert.equal(after.guideTop, before.guideTop, "the guide row did not move");
  assert.deepEqual(errors, []);
});

test("kana-cards: opening the app scrolls the saved kana into view", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/kana-cards`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  let f;
  await until(p, async () => { f = p.frames().find((x) => x !== p.mainFrame()); return f && await f.evaluate(() => !!window.PAD).catch(() => false); }, "kana app");
  await f.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 5000 });
  await p.locator("#app").evaluate((el) => { el.style.width = "331px"; el.style.height = "359px"; el.style.flex = "none"; });
  await f.waitForFunction(() => document.body.classList.contains("list"));

  /* put the cursor on the very last kana, then reopen the app */
  await f.locator("#reference button[aria-label='ぽ po']").click();
  await f.waitForFunction(() => document.body.classList.contains("card"));
  await p.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem("lopda-dev:kana-cards") || "{}")["kana-cards-state"];
    return saved && saved.index === 70;
  }, null, { timeout: 5000 });
  await p.reload({ waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  await until(p, async () => { f = p.frames().find((x) => x !== p.mainFrame()); return f && await f.evaluate(() => !!window.PAD && document.body.classList.contains("list")).catch(() => false); }, "reopened kana app");
  const opened = await f.evaluate(() => {
    const ref = document.querySelector("#reference");
    const selected = document.querySelector("#reference button[aria-selected='true']");
    const r = selected.getBoundingClientRect(), v = ref.getBoundingClientRect();
    return {
      label: selected.getAttribute("aria-label"), scroll: ref.scrollTop,
      visible: r.top >= v.top - 1 && r.bottom <= v.bottom + 1
    };
  });
  assert.equal(opened.label, "ぽ po", "the saved cursor is still selected");
  assert.ok(opened.scroll > 0, "the grid scrolled down to the saved kana");
  assert.equal(opened.visible, true, "the selected kana is visible when the app opens");
  assert.deepEqual(errors, []);
});

test("kana-cards: a miss waits for confirmation, and the score shows on the card", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/kana-cards`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  let f;
  await until(p, async () => { f = p.frames().find((x) => x !== p.mainFrame()); return f && await f.evaluate(() => !!window.PAD).catch(() => false); }, "kana app");
  await f.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 5000 });
  await p.locator("#app").evaluate((el) => { el.style.width = "331px"; el.style.height = "359px"; el.style.flex = "none"; });
  await f.waitForFunction(() => document.body.classList.contains("list"));

  await p.locator('#pad [data-b="a"]').click();
  await f.waitForFunction(() => document.body.classList.contains("card"));
  assert.equal(await f.textContent("#rate"), "Accuracy —", "a fresh card has no score yet");
  await p.locator('#pad [data-b="b"]').click();
  await f.waitForFunction(() => document.body.classList.contains("list"));

  await p.locator('#pad [data-b="start"]').click();
  await f.waitForFunction(() => document.body.classList.contains("quiz"));
  const target = Number((await f.textContent("#count")).split("/")[0]) - 1;
  await f.evaluate((tgt) => {
    const b = [...document.querySelectorAll("#options button")].find((x) => Number(x.getAttribute("data-index")) !== tgt);
    b.click();
  }, target);
  await f.waitForFunction(() => /Review|再看看/.test(document.getElementById("status").textContent));
  assert.match(await f.textContent("#status"), /Review: a/, "the miss shows the right answer");
  assert.equal(Number((await f.textContent("#count")).split("/")[0]) - 1, target, "the miss stays until the user confirms");
  await p.locator('#pad [data-b="a"]').click();
  await f.waitForFunction((want) => document.querySelector("#count").textContent !== want, `${target + 1}/71`);
  assert.notEqual(Number((await f.textContent("#count")).split("/")[0]) - 1, target, "confirming moves to a different kana");

  await p.locator('#pad [data-b="b"]').click();
  await f.waitForFunction(() => document.body.classList.contains("list"));
  await f.locator("#reference button[aria-label='あ a']").click();
  await f.waitForFunction(() => document.body.classList.contains("card"));
  assert.equal(await f.textContent("#rate"), "Accuracy 0% (0/1)", "the single miss is recorded on that kana's card");
  await p.locator('#pad [data-b="b"]').click();
  await f.waitForFunction(() => document.body.classList.contains("list"));
  await f.locator("#reference button[aria-label='い i']").click();
  await f.waitForFunction(() => document.body.classList.contains("card"));
  assert.equal(await f.textContent("#rate"), "Accuracy —", "another kana does not inherit the first kana's score");
  assert.deepEqual(errors, []);
});

test("kana-cards: a quiz round asks each kana at most twice", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/kana-cards`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  let f;
  await until(p, async () => { f = p.frames().find((x) => x !== p.mainFrame()); return f && await f.evaluate(() => !!window.PAD).catch(() => false); }, "kana app");
  await f.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 5000 });
  await f.waitForFunction(() => document.body.classList.contains("list"));
  /* make the round deterministic (the lowest eligible kana each time) and skip the answer pause */
  await f.evaluate(() => {
    Math.random = function () { return 0; };
    var later = window.setTimeout;
    window.setTimeout = function (fn, ms) { return later(fn, Math.min(ms, 5)); };
  });
  await p.locator('#pad [data-b="start"]').click();
  await f.waitForFunction(() => document.body.classList.contains("quiz"));
  const seen = {};
  for (let q = 0; q < 150; q++) {
    const status = await f.textContent("#status");
    if (/twice/.test(status)) break;
    const target = Number((await f.textContent("#count")).split("/")[0]) - 1;
    seen[target] = (seen[target] || 0) + 1;
    assert.ok(seen[target] <= 2, `kana ${target} is asked at most twice in a round`);
    const before = await f.textContent("#count");
    await f.evaluate((wanted) => {
      [...document.querySelectorAll("#options button")].find((b) => Number(b.getAttribute("data-index")) === wanted).click();
    }, target);
    await f.waitForFunction((prev) => document.querySelector("#count").textContent !== prev ||
      /twice/.test(document.getElementById("status").textContent), before, { timeout: 3000 });
  }
  assert.equal(Object.keys(seen).length, 71, "the round covers every kana");
  assert.equal(await f.textContent("#status"), "Every kana has been asked twice this round (B list)");
  assert.deepEqual(errors, []);
});

test("kana-cards: the header buttons hold their place as the count grows", { skip, timeout: 60000 }, async (t) => {
  /* 9/71 -> 10/71 is one character wider; the script and START quiz buttons must not shift with it. */
  const { p, errors } = await page(t);
  await p.goto(`${base}/sdk/dev.html?app=registry/apps/kana-cards`, { waitUntil: "load" });
  await p.waitForFunction(() => /loaded |load failed/.test(document.getElementById("log").textContent), null, { timeout: 5000 });
  let f;
  await until(p, async () => { f = p.frames().find((x) => x !== p.mainFrame()); return f && await f.evaluate(() => !!window.PAD && !!PAD.say).catch(() => false); }, "kana app");
  await f.waitForFunction(() => document.querySelector("#count").textContent === "1/71");
  const boxes = () => f.evaluate(() => ["#script", "#view", "#count"].map((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return [Math.round(r.left * 100), Math.round(r.width * 100)];
  }));
  const atCount = async (text) => {
    await f.waitForFunction((want) => document.querySelector("#count").textContent === want, text);
    return boxes();
  };
  const one = await atCount("1/71");
  for (let i = 0; i < 4; i++) await p.locator('#pad [data-b="right"]').click();
  await p.locator('#pad [data-b="down"]').click();
  await p.locator('#pad [data-b="left"]').click();
  const nine = await atCount("9/71");
  await p.locator('#pad [data-b="right"]').click();
  const ten = await atCount("10/71");
  assert.deepEqual(nine, ten, "the buttons do not move from 9/71 to 10/71");
  assert.deepEqual(one, ten, "the buttons stay put from the first kana to the tenth");
  assert.deepEqual(errors, []);
});

test("scripts: copy the AI prompt, paste an HTML file, run it, and keep data per script", { skip, timeout: 45000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LP && LP.show);
  await p.evaluate(() => LP.show("scripts"));
  await p.waitForFunction(() => !document.getElementById("v-scripts").hidden);

  await p.click("#scripts-write");
  await p.waitForFunction(() => !document.getElementById("v-script-idea").hidden);
  /* the page gives a long prompt a real textarea, not a 200-character single line */
  const longIdea = "一个切水果游戏，滑动切开水果，切到炸弹结束。".repeat(40);
  await p.fill("#scripts-idea", longIdea);
  assert.equal((await p.inputValue("#scripts-idea")).length, longIdea.length);
  const ideaBox = await p.evaluate(() => {
    const ta = document.getElementById("scripts-idea").getBoundingClientRect();
    const view = document.getElementById("v-script-idea").getBoundingClientRect();
    const copy = document.getElementById("idea-copy").getBoundingClientRect();
    return { height: ta.height, viewBottom: view.bottom, copyBottom: copy.bottom };
  });
  assert.ok(ideaBox.height >= 140, "the idea textarea fills the page: " + JSON.stringify(ideaBox));
  assert.ok(ideaBox.copyBottom <= ideaBox.viewBottom + 1, "the actions stay inside the page");
  await p.fill("#scripts-idea", "a pomodoro");
  await p.click("#idea-copy");
  const prompt = await p.evaluate(() => navigator.clipboard.readText());
  assert.match(prompt, /a pomodoro/);
  assert.match(prompt, /PAD\.save/);
  assert.match(prompt, /331.473/);
  assert.match(prompt, /PAD\.isDown/);
  assert.match(prompt, /pointerdown/);
  assert.match(prompt, /hitSegment/);
  assert.match(prompt, /Math\.PI \* 2/);

  /* the draft survives leaving the page, and clear asks once before it empties the field */
  await p.click("#idea-back");
  await p.waitForFunction(() => !document.getElementById("v-scripts").hidden);
  await p.click("#scripts-write");
  await p.waitForFunction(() => !document.getElementById("v-script-idea").hidden);
  assert.equal(await p.inputValue("#scripts-idea"), "a pomodoro");

  /* the draft is saved, so a reload keeps a prompt the player spent time on */
  await p.reload({ waitUntil: "load" });
  await p.waitForFunction(() => window.LP && LP.show);
  await p.evaluate(() => LP.show("scripts"));
  await p.waitForFunction(() => !document.getElementById("v-scripts").hidden);
  await p.click("#scripts-write");
  await p.waitForFunction(() => !document.getElementById("v-script-idea").hidden);
  assert.equal(await p.inputValue("#scripts-idea"), "a pomodoro");

  await p.click("#idea-clear");
  await p.waitForFunction(() => !document.getElementById("idea-ask").hidden);
  await p.click("#idea-ask-yes");
  assert.equal(await p.inputValue("#scripts-idea"), "");

  await p.evaluate(() => navigator.clipboard.writeText(
    "<!doctype html><title>Local Test</title><body><script>PAD.save('x',42);PAD.load('x').then(function(v){document.body.textContent='X='+v;});<" + "/script></body>"
  ));
  await p.click("#idea-paste");
  await p.waitForFunction(() => !document.getElementById("v-script-edit").hidden);
  assert.equal(await p.inputValue("#script-name"), "Local Test");
  assert.match(await p.inputValue("#script-code"), /PAD\.save/);

  await p.click("#script-run");
  await p.waitForFunction(() => !document.getElementById("v-run").hidden);
  await p.waitForTimeout(900);
  assert.equal(await p.frameLocator("#run-frame").locator("body").textContent(), "X=42");
  assert.equal(await p.evaluate(() => document.getElementById("gamepad").hidden), true, "a touch-only script hides the chin pad");

  await p.click("#run-back");
  await p.waitForFunction(() => !document.getElementById("v-script-edit").hidden);
  await p.waitForFunction(() => /Data|存档/.test(document.getElementById("script-hint").textContent));

  /* the data overview shows the size and clears it without touching the source */
  await p.click("#script-back");
  await p.waitForFunction(() => !document.getElementById("v-scripts").hidden);
  await p.click("#scripts-data");
  await p.waitForFunction(() => !document.getElementById("v-script-data").hidden);
  await p.waitForFunction(() => /data|存档/i.test(document.getElementById("data-summary").textContent));
  assert.equal(await p.locator("#data-list .t").textContent(), "Local Test");
  await p.click("#data-list button");
  await p.click("#data-ask-yes");
  /* nothing left: one line says so, with no "0 scripts, 0 B" and no 清空 */
  await p.waitForFunction(() => !document.getElementById("data-empty").hidden && document.getElementById("data-summary").hidden && document.getElementById("data-clear-all").hidden);
  await p.click("#data-back");
  await p.waitForFunction(() => !document.getElementById("v-scripts").hidden);
  await p.click("#scripts-list button");
  await p.waitForFunction(() => !document.getElementById("v-script-edit").hidden);
  await p.waitForFunction(() => /No data|没有存档/.test(document.getElementById("script-hint").textContent));

  await p.click("#script-menu");
  await p.click("#script-delete");
  await p.click("#script-ask-yes");
  await p.waitForFunction(() => !document.getElementById("v-scripts").hidden);
  /* the first-open Pomodoro example stays; only the test script is deleted */
  assert.equal(await p.locator("#scripts-list button").count(), 1);
  assert.notEqual(await p.locator("#scripts-list .t").textContent(), "Local Test");
  assert.deepEqual(errors, []);
});

test("scripts: a script that reads the buttons gets the chin pad", { skip, timeout: 45000 }, async (t) => {
  const { p, errors } = await page(t);
  await p.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LP && LP.show);
  await p.evaluate(() => LP.show("scripts"));
  await p.waitForFunction(() => !document.getElementById("v-scripts").hidden);
  await p.evaluate(() => navigator.clipboard.writeText(
    "<!doctype html><title>Pad Script</title><body><script>PAD.on('press',function(b){document.body.textContent=b;});<" + "/script></body>"
  ));
  await p.click("#scripts-paste");
  await p.waitForFunction(() => !document.getElementById("v-script-edit").hidden);
  await p.click("#script-run");
  await p.waitForFunction(() => !document.getElementById("v-run").hidden);
  assert.equal(await p.evaluate(() => document.getElementById("gamepad").hidden), false, "the chin pad is shown");
  assert.deepEqual(errors, []);
});

test("AI line: a key in Settings turns 复制 into 生成, the code streams into a new script, and the key stays out of the backup", { skip, timeout: 45000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  const asked = [];
  const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "POST" };
  await p.route("https://openrouter.ai/**", async (r) => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
    const body = JSON.parse(r.request().postData());
    asked.push({ auth: r.request().headers().authorization, body });
    const ev = (o) => "data: " + JSON.stringify(o) + "\n\n";
    const text = body.max_tokens ? ["OK"] : ["Sure:\n```html\n<!doctype html><title>番茄", "钟</title><body>tick</body></html>\n```"];
    await r.fulfill({ status: 200, headers: { ...CORS, "content-type": "text/event-stream" },
      body: ": OPENROUTER PROCESSING\n\n" + text.map((c) => ev({ model: "test/model", choices: [{ delta: { content: c } }] })).join("") + "data: [DONE]\n\n" });
  });
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LP && LP.show && LP.ai);

  /* no key: the idea page still copies the prompt */
  await p.evaluate(() => LP.show("scripts"));
  await p.click("#scripts-write");
  assert.equal(await p.locator("#idea-copy").innerText(), "复制 AI 提示词");

  /* Settings: paste a key, test the line; only the last four characters are shown */
  await p.evaluate(() => LP.builtins.filter((b) => b.id === "settings")[0].open());
  await p.waitForFunction(() => !document.getElementById("v-settings").hidden);
  assert.equal(await p.locator("#set-ai-open").innerText(), "未接上 ›");
  await p.click("#set-ai-open");
  await p.waitForFunction(() => !document.getElementById("v-set-ai").hidden);
  assert.match(await p.locator("#set-ai-state").innerText(), /还没接上/);
  /* each field has its label */
  assert.deepEqual(await p.locator(".set-ai-field > span").allInnerTexts(), ["OpenRouter 的 key", "模型"]);
  await p.fill("#set-ai-key", "sk-or-secret-1234");
  await p.click("#set-ai-save");
  assert.match(await p.locator("#set-ai-state").innerText(), /key …1234 · 模型 openrouter\/auto/);
  assert.ok(!(await p.locator("#v-set-ai").innerText()).includes("secret"));
  /* the saved key shows as dots: a stand-in in the password field, never the key */
  assert.equal(await p.getAttribute("#set-ai-key", "type"), "password");
  const shown = await p.inputValue("#set-ai-key");
  assert.ok(shown.length > 0 && !shown.includes("1234"), shown);
  await p.focus("#set-ai-key");
  assert.equal(await p.inputValue("#set-ai-key"), "", "a tap empties it for a new key");
  assert.equal(await p.getAttribute("#set-ai-key", "placeholder"), "已保存 …1234；粘贴新的就替换");
  await p.focus("#set-ai-model");
  assert.equal(await p.inputValue("#set-ai-key"), shown, "left empty, the dots come back");
  /* saving the model alone keeps the key */
  await p.fill("#set-ai-model", "a/b"); await p.click("#set-ai-save");
  assert.match(await p.locator("#set-ai-state").innerText(), /key …1234 · 模型 a\/b/);
  await p.fill("#set-ai-model", ""); await p.click("#set-ai-save");
  await p.click("#set-ai-test");
  await p.waitForFunction(() => /线路正常/.test(document.getElementById("set-ai-state").textContent));
  assert.match(await p.locator("#set-ai-state").innerText(), /「OK」（test\/model）/);
  assert.equal(asked[0].auth, "Bearer sk-or-secret-1234");

  await p.click("#set-ai-back");
  await p.waitForFunction(() => !document.getElementById("v-settings").hidden);
  assert.equal(await p.locator("#set-ai-open").innerText(), "已接上 ›");

  /* the backup leaves the key out */
  const docs = await p.evaluate(async () => {
    const pack = LopdaBackup.pack; let seen = null;
    LopdaBackup.pack = (d, o) => { seen = d.docs.map((x) => x.path); return pack(d, o); };
    document.getElementById("set-backup-go").click();
    while (!seen) await new Promise((r) => setTimeout(r, 50));
    LopdaBackup.pack = pack;
    return seen;
  });
  assert.ok(docs.length > 0);
  assert.ok(!docs.includes("data/users/local/ai"), docs.join(" "));
  assert.ok(await p.evaluate(() => LopdaPlatform.dumpAll().then((d) => d.docs.some((x) => x.path === "data/users/local/ai" && x.data.key === "sk-or-secret-1234"))));

  /* Scripts: 生成 sends the prompt with the idea and fills a new script with the cleaned code */
  await p.evaluate(() => LP.show("scripts"));
  assert.match(await p.locator("#scripts-startnote").innerText(), /按「生成」/);
  await p.click("#scripts-write");
  assert.equal(await p.locator("#idea-copy").innerText(), "生成");
  await p.fill("#scripts-idea", "一个番茄钟");
  await p.click("#idea-copy");
  await p.waitForFunction(() => !document.getElementById("v-script-edit").hidden);
  await p.waitForFunction(() => /写好了（用时 0:0\d）/.test(document.getElementById("script-hint").textContent));
  assert.equal(await p.inputValue("#script-code"), "<!doctype html><title>番茄钟</title><body>tick</body></html>");
  assert.equal(await p.inputValue("#script-name"), "番茄钟");
  assert.equal(await p.locator("#script-paste").innerText(), "粘贴代码");
  assert.ok(await p.locator("#script-run").isEnabled());
  const sent = asked[1].body;
  assert.equal(sent.stream, true);
  assert.equal(sent.model, "openrouter/auto");
  assert.match(sent.messages[0].content, /我想做的是：一个番茄钟/);
  await p.click("#script-back");
  await p.waitForFunction(() => [...document.querySelectorAll("#scripts-list .t")].some((e) => e.textContent === "番茄钟"));
  assert.deepEqual(errors, []);
});

test("AI line: while the AI is slow the hint counts time, says what the line is doing and flips on every signal; leaving the screen is named", { skip, timeout: 45000 }, async (t) => {
  const { p, errors } = await page(t, { locale: "zh-CN" });
  /* a hand-driven OpenRouter: the test opens the line and pushes each piece */
  await p.addInitScript(() => {
    const real = window.fetch;
    window.fetch = (u, o) => {
      if (!String(u).startsWith("https://openrouter.ai/")) return real(u, o);
      return new Promise((resolve, reject) => {
        let ctl;
        const body = new ReadableStream({ start(c) { ctl = c; } });
        o.signal.addEventListener("abort", () => { reject(new DOMException("aborted", "AbortError")); try { ctl.error(new DOMException("aborted", "AbortError")); } catch {} });
        window.__line = {
          open: () => resolve(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })),
          push: (s) => ctl.enqueue(new TextEncoder().encode(s)),
          drop: () => { reject(new TypeError("Load failed")); try { ctl.error(new TypeError("Load failed")); } catch {} },
        };
      });
    };
  });
  await p.goto(base + "/runtime/", { waitUntil: "load" });
  await p.waitForFunction(() => window.LP && LP.ai);
  await p.evaluate(() => LopdaPlatform.db.doc("data/users/local/ai").set({ v: 1, key: "sk-or-x", model: "" }));
  await p.reload({ waitUntil: "load" });
  await p.waitForFunction(() => window.LP && LP.ai && LP.ai.on());
  await p.evaluate(() => LP.show("scripts"));
  await p.click("#scripts-write");
  await p.fill("#scripts-idea", "一个番茄钟");
  await p.click("#idea-copy");
  const hint = () => p.locator("#script-hint").innerText();
  await p.waitForFunction(() => /正在连线… 0:0\d/.test(document.getElementById("script-hint").textContent));
  assert.match(await hint(), /^▯ 正在连线… 0:0\d\n写一个程序常要几分钟。请留在这个画面，别锁屏、别切走。$/);
  /* the clock moves on its own */
  await p.waitForFunction(() => /0:0[1-9]/.test(document.getElementById("script-hint").textContent));

  await p.evaluate(() => { __line.open(); });
  await p.waitForFunction(() => /^▮ 已接通，AI 在想…/.test(document.getElementById("script-hint").textContent));
  await p.evaluate(() => __line.push(": OPENROUTER PROCESSING\n\n"));
  await p.waitForFunction(() => /^▯ 已接通/.test(document.getElementById("script-hint").textContent));
  await p.evaluate(() => __line.push('data: {"choices":[{"delta":{"reasoning":"hmm, "}}]}\n\n'));
  await p.waitForFunction(() => /^▮ AI 在想… 已想 5 字 · 0:\d\d/.test(document.getElementById("script-hint").textContent));
  await p.evaluate(() => __line.push('data: {"choices":[{"delta":{"content":"<html>"}}]}\n\n'));
  await p.waitForFunction(() => /^▯ AI 在写… 6 字 · 0:\d\d/.test(document.getElementById("script-hint").textContent));
  assert.equal(await p.inputValue("#script-code"), "<html>");
  assert.equal(await p.locator("#script-paste").innerText(), "停止");
  await p.click("#script-paste");
  await p.waitForFunction(() => /没写完：已停止。/.test(document.getElementById("script-hint").textContent));
  assert.equal(await p.inputValue("#script-code"), "<html>", "what came in stays");

  /* the page hidden during a generation (iOS drops the request): the failure says why */
  await p.click("#script-back");
  await p.click("#scripts-write");
  await p.click("#idea-copy");
  await p.waitForFunction(() => window.__line && /正在连线/.test(document.getElementById("script-hint").textContent));
  await p.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    __line.drop();
  });
  await p.waitForFunction(() => /没写完：离开了画面，线路断了，请重新生成。/.test(document.getElementById("script-hint").textContent));
  assert.deepEqual(errors, []);
});
