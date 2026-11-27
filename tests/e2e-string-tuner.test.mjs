// String Tuner (调音器) 1.0.0: the tuner screen at the smallest and largest LCD, the needle and lamp from fake mic
// readings, the tuning list (mic off while it is open, the choice saved), and a refused mic. The app is plain HTML with
// no runtime around it here: a fake PAD, as SPEC.md 6.4 describes it, is injected before the app's own script.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-string-tuner.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { ROOT } from "./helpers.mjs";

let pw = null;
try { pw = await import("playwright"); } catch {}
const skip = pw ? false : "playwright is not installed";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const SMALL = { width: 331, height: 473 };   // the smallest LCD without the chin pad, sdk/UI.md section 1
const LARGE = { width: 386, height: 738 };
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

/* the app's only outside contact: PAD with the microphone, a save store and a log of what it asked for */
const fakePad = ([lang, micAnswer, saved]) => {
  const handlers = {};
  window.__log = [];
  window.__saves = saved ? { set: saved } : {};
  window.__fire = (kind, data) => (handlers[kind] || []).forEach((fn) => fn(data));
  window.PAD = {
    lang,
    sfx(s) { window.__log.push(typeof s === "string" ? "sfx:" + s : "sfx:" + s.wave + ":" + Math.round(s.from)); },
    save(k, v) { window.__saves[k] = JSON.parse(JSON.stringify(v)); },
    load(k) { return Promise.resolve(window.__saves[k] == null ? null : window.__saves[k]); },
    on(kind, fn) { (handlers[kind] = handlers[kind] || []).push(fn); },
    off() {},
    isDown() { return false; },
    mic: { start() { window.__log.push("mic:start"); return Promise.resolve(micAnswer); }, stop() { window.__log.push("mic:stop"); } }
  };
};

async function open(t, { size = SMALL, lang = "zh", mic = "on", saved = null } = {}) {
  const context = await browser.newContext({ viewport: size, hasTouch: true });
  const p = await context.newPage();
  t.after(() => context.close());
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(fakePad, [lang, mic, saved]);
  await p.goto(`${base}/registry/apps/string-tuner/index.html`);
  await p.waitForFunction(() => document.getElementById("tname").textContent.length > 0);
  return { p, errors };
}
/* a tap, then a frame for the screen to follow */
async function tap(p, sel) { await (typeof sel === "string" ? p.locator(sel) : sel).tap(); await p.waitForTimeout(80); }
/* readings as the runtime sends them: at most 20 a second */
async function hear(p, hz, n = 8) {
  for (let i = 0; i < n; i++) {
    await p.evaluate((hz) => window.__fire("sound", { level: 0.5, pitch: Math.round(hz), hz }), hz);
    await p.waitForTimeout(50);
  }
}

test("string-tuner: everything fits at 331x473 and 386x738, every control is 44 px or more, and nothing scrolls", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    const r = await p.evaluate(() => {
      const els = [...document.querySelectorAll("header button, main button, footer button, #meter")];
      return {
        scroll: document.documentElement.scrollHeight - innerHeight,
        cut: els.filter((e) => { const b = e.getBoundingClientRect(); return b.bottom > innerHeight + 0.5 || b.right > innerWidth + 0.5 || b.left < -0.5; }).length,
        small: [...document.querySelectorAll("button")].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).length,
        strings: document.querySelectorAll("#strings button").length
      };
    });
    assert.deepEqual(r, { scroll: 0, cut: 0, small: 0, strings: 6 }, `${size.width}x${size.height}`);
    assert.deepEqual(errors, []);
  }
});

test("string-tuner: the mic opens at once; a sharp A shows A2 and its cents, an in-tune low E an octave up lights the lamp", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  assert.deepEqual(await p.evaluate(() => window.__log), ["mic:start"]);
  assert.equal(await p.textContent("#msg"), "拨一根弦");
  await hear(p, 110 * Math.pow(2, 14 / 1200));
  assert.equal(await p.textContent("#note"), "A2");
  assert.equal(await p.textContent("#cents"), "+14");
  assert.equal(await p.getAttribute("#strings button:nth-child(2)", "class"), "cur");
  assert.equal(await p.getAttribute("#lamp", "class"), "", "not in tune");
  /* E3, the second harmonic a low E string often reads as: it is the low E, in tune */
  await hear(p, 164.81, 16);
  assert.equal(await p.textContent("#note"), "E2");
  assert.equal(await p.textContent("#cents"), "0");
  assert.equal(await p.getAttribute("#lamp", "class"), "on");
  assert.match(await p.getAttribute("#strings button:nth-child(1)", "class"), /ok/, "the string is marked tuned");
  /* the sound dies: the reading stays, greyed, and the lamp goes out */
  await p.waitForTimeout(800);
  assert.equal(await p.getAttribute("#note", "class"), "stale");
  assert.equal(await p.getAttribute("#lamp", "class"), "");
  assert.deepEqual(errors, []);
});

test("string-tuner: a tapped string is locked, Play note sounds it and ignores the mic meanwhile, a second tap is auto again", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#strings button:nth-child(4)");
  assert.match(await p.getAttribute("#strings button:nth-child(4)", "class"), /cur.*lock/);
  assert.equal(await p.textContent("#auto"), "已锁定");
  await hear(p, 110, 4);                                   /* an A while G is locked reads against G */
  assert.equal(await p.textContent("#note"), "G3");
  await tap(p, "#tone");
  assert.ok((await p.evaluate(() => window.__log)).includes("sfx:square:196"), "the G3 reference tone");
  await hear(p, 300, 4);
  assert.notEqual(await p.textContent("#cents"), "+735", "readings during the tone are ignored");
  await tap(p, "#strings button:nth-child(4)");
  assert.equal(await p.textContent("#auto"), "自动认弦");
  assert.deepEqual(errors, []);
});

test("string-tuner: the list closes the mic, a choice is saved and changes the strings, A4 steps within 432-446", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#tuning");
  assert.equal(await p.isVisible("#list"), true);
  assert.equal((await p.evaluate(() => window.__log)).at(-1), "mic:stop");
  await tap(p, p.locator("#rows .row", { hasText: "DADGAD" }));
  assert.equal(await p.isVisible("#list"), false);
  assert.equal((await p.evaluate(() => window.__log)).at(-1), "mic:start");
  assert.equal(await p.textContent("#tname"), "吉他 · DADGAD");
  assert.deepEqual(await p.locator("#strings button").allTextContents(), ["D2", "A2", "D3", "G3", "A3", "D4"]);
  assert.deepEqual(await p.evaluate(() => window.__saves.set), { v: 1, tuning: "gtr-dadgad", a4: 440 });

  await tap(p, "#tuning");
  const plus = p.locator("#a4 button").nth(1);
  for (let i = 0; i < 8; i++) await tap(p, plus);
  assert.equal(await p.textContent("#a4 span"), "标准音 A4 = 446 Hz", "stops at 446");
  assert.equal((await p.evaluate(() => window.__log)).at(-1), "sfx:err");
  await tap(p, "#back");
  assert.equal((await p.evaluate(() => window.__saves.set)).a4, 446);
  /* the ukulele: four strings, the high G first */
  await tap(p, "#tuning");
  await tap(p, p.locator("#rows .row", { hasText: "标准（高 G）" }));
  assert.deepEqual(await p.locator("#strings button").allTextContents(), ["G4", "C4", "E4", "A4"]);
  assert.deepEqual(errors, []);
});

test("string-tuner: a saved tuning opens; English; chromatic hides the strings; a refused mic says so and a tap asks again", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t, { lang: "en", mic: "denied", saved: { v: 1, tuning: "chromatic", a4: 442 } });
  assert.equal(await p.textContent("#tname"), "Chromatic");
  assert.equal(await p.isVisible("#strings"), false);
  await p.waitForFunction(() => /No mic/.test(document.getElementById("msg").textContent));
  await tap(p, "#msg");
  assert.deepEqual((await p.evaluate(() => window.__log)).filter((x) => x === "mic:start").length, 2);
  await tap(p, "#tone");
  assert.ok((await p.evaluate(() => window.__log)).includes("sfx:square:442"), "A4 at the saved 442 Hz");
  assert.deepEqual(errors, []);
});
