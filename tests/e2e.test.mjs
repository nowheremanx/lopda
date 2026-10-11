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

async function page(t) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
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
