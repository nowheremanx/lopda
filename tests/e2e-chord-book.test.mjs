// Chords (和弦大全) 1.2.0: the main screen, the picker and the finder at the smallest and largest LCD, a search that
// lands on C#m7b5, turning through voicings, the two orders (in the picker) and the two views, each string played on its
// own, naming a chord from the frets, the progressions it belongs to (连接), and the save.
// The app is plain HTML with no runtime around it here: a fake PAD is injected before the app's own script.
// Needs Playwright, which the repo does not depend on, so the test skips without it:
//   npm i --no-save playwright && npx playwright install chromium && node --test tests/e2e-chord-book.test.mjs
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

/* the app's only outside contact: PAD with a save store and a log of the sounds it asked for */
const fakePad = ([lang, saved]) => {
  const handlers = {};
  window.__log = [];
  window.__saves = saved ? { set: saved } : {};
  window.__press = (k) => (handlers.press || []).forEach((fn) => fn(k));
  window.PAD = {
    lang,
    sfx(s) { window.__log.push(typeof s === "string" ? s : "custom"); },
    save(k, v) { window.__saves[k] = JSON.parse(JSON.stringify(v)); },
    load(k) { return Promise.resolve(window.__saves[k] == null ? null : window.__saves[k]); },
    on(kind, fn) { (handlers[kind] = handlers[kind] || []).push(fn); },
    off() {},
    isDown() { return false; }
  };
};

async function open(t, { size = SMALL, lang = "zh", saved = null } = {}) {
  const context = await browser.newContext({ viewport: size, hasTouch: true });
  const p = await context.newPage();
  t.after(() => context.close());
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.addInitScript(fakePad, [lang, saved]);
  await p.goto(`${base}/registry/apps/chord-book/index.html`);
  await p.waitForFunction(() => document.getElementById("line").textContent.length > 0);
  await p.waitForTimeout(100);
  return { p, errors };
}
async function tap(p, sel) { await (typeof sel === "string" ? p.locator(sel) : sel).tap(); await p.waitForTimeout(80); }
const text = (p, sel) => p.locator(sel).textContent();
/* every visible button sits inside the screen, is 44 px tall or more, and nothing scrolls sideways */
async function fits(p, scope, size, what) {
  const r = await p.evaluate((scope) => {
    const root = document.querySelector(scope);
    const out = { wide: document.documentElement.scrollWidth > innerWidth, bad: [] };
    root.querySelectorAll("button").forEach((b) => {
      const box = b.getBoundingClientRect();
      if (!box.width) return;
      if (box.height < 44) out.bad.push(`${b.id || b.textContent} is ${box.height}px tall`);
      if (box.left < 0 || box.right > innerWidth + 0.5) out.bad.push(`${b.id || b.textContent} is cut at the side`);
    });
    return out;
  }, scope);
  assert.equal(r.wide, false, `${what} at ${size.width}x${size.height}: no sideways scroll`);
  assert.deepEqual(r.bad, [], `${what} at ${size.width}x${size.height}`);
}
async function inside(p, sel, size, what) {
  const b = await p.locator(sel).boundingBox();
  assert.ok(b && b.y >= 0 && b.y + b.height <= size.height + 0.5, `${what}: ${sel} is on screen at ${size.width}x${size.height}`);
}

test("chord-book: opens on C x32010; the box, the notes and the footer fit the smallest and largest screen", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    assert.equal(await text(p, "#cname"), "C");
    assert.match(await text(p, "#line"), /^x32010 · 1 \/ \d+ · 开放$/);
    assert.equal(await text(p, "#tones"), "xCRE3G5CRE3", "one cell per string: x, R, 3, 5, R, 3");
    await fits(p, "body > header", size, "header");
    await fits(p, "body > footer", size, "footer");
    await fits(p, "#tones", size, "the strings");
    for (const sel of ["#pic", "#line", "#tones", "#strum"]) await inside(p, sel, size, "main screen");
    const w = await p.locator("#pic").evaluate((c) => parseInt(c.style.width, 10));
    assert.ok(w >= 208 && w % 104 === 0, `the box is drawn at a whole scale: ${w}px`);
    await tap(p, "#view");
    assert.equal(await p.locator("#pic").evaluate((c) => c.width), 150, "the neck view");
    await inside(p, "#pic", size, "neck view");
    assert.deepEqual(errors, []);
  }
});

test("chord-book: a search lands on C#m7b5; voicings turn, sort and view switch, and all of it is saved", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  assert.ok(await p.locator("#picker").evaluate((e) => e.classList.contains("open")));
  await p.locator("#q").fill("c#m7-5");
  await tap(p, "#qgo");
  assert.equal(await text(p, "#cname"), "C#m7b5");
  assert.equal(await text(p, "#qname"), "半减七");
  assert.match(await text(p, "#line"), /^x4545x · 1 \//);
  await tap(p, "#next");
  assert.match(await text(p, "#line"), /^9x998x · 2 \//);
  await tap(p, "#prev");
  await tap(p, "#prev");
  assert.match(await text(p, "#line"), / · (\d+) \/ \1 · /, "Prev from the first wraps to the last");
  await tap(p, "#next");
  /* the order is a setting in the picker, not a header button */
  assert.equal(await p.locator("#sort").count(), 0);
  await tap(p, "#chord");
  assert.equal(await text(p, "#sortH"), "按法顺序");
  await tap(p, p.locator("#sorts button", { hasText: "按把位" }));
  assert.ok(await p.locator("#sorts button", { hasText: "按把位" }).evaluate((b) => b.classList.contains("sel")));
  await tap(p, "#pback");
  assert.equal(await text(p, "#cname"), "C#m7b5", "Back keeps the chord");
  assert.match(await text(p, "#line"), /^x4545x · /, "the same voicing stays in view when the order changes");
  await tap(p, "#view");
  await p.waitForTimeout(400);
  const s = await p.evaluate(() => window.__saves.set);
  assert.equal(s.v, 1);
  assert.deepEqual(s.cur.root, 1);
  assert.equal(s.cur.q, "m7b5");
  assert.equal(s.sort, "pos");
  assert.equal(s.view, "neck");
  assert.equal(s.recent[0], "C#m7b5");
  /* an unknown name stays in the picker and says so */
  await tap(p, "#chord");
  await p.locator("#q").fill("Cxyz");
  await tap(p, "#qgo");
  assert.equal(await text(p, "#msg"), "认不出这个和弦");
  assert.ok(await p.locator("#picker").evaluate((e) => e.classList.contains("open")));
  await tap(p, "#pback");
  assert.deepEqual(errors, []);

  /* a second start comes back to the same place */
  const again = await open(t, { saved: s });
  assert.equal(await text(again.p, "#cname"), "C#m7b5");
  await tap(again.p, "#chord");
  assert.ok(await again.p.locator("#sorts button", { hasText: "按把位" }).evaluate((b) => b.classList.contains("sel")));
  await tap(again.p, "#pback");
  assert.equal(await again.p.locator("#pic").evaluate((c) => c.width), 150);
});

test("chord-book: the picker chooses root, quality and bass in one visit; the keys work too", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    await tap(p, "#chord");
    await fits(p, "#picker", size, "picker");
    await tap(p, p.locator("#roots button", { hasText: /^D$/ }));
    await tap(p, p.locator("#quals button", { hasText: "maj7" }).first());
    await tap(p, p.locator("#basses button", { hasText: /^F#$/ }));
    assert.equal(await text(p, "#ptitle"), "Dmaj7/F#");
    await tap(p, "#pok");
    assert.equal(await text(p, "#cname"), "Dmaj7/F#");
    assert.match(await text(p, "#line"), /^\S+ · 1 \//);
    await p.evaluate(() => window.__press("down"));
    assert.equal(await text(p, "#cname"), "Dm7/F#", "Down steps to the next quality, the bass kept");
    await p.evaluate(() => window.__press("start"));
    await p.evaluate(() => window.__press("right"));
    await p.evaluate(() => window.__press("a"));
    assert.equal(await text(p, "#cname"), "Ebm7/F#");
    assert.deepEqual(errors, []);
  }
});

test("chord-book: the finder names the frets, starts from the voicing in view and shows the chord it found", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    await tap(p, "#chord");
    await tap(p, "#tofind");
    assert.ok(await p.locator("#finder").evaluate((e) => e.classList.contains("open")));
    assert.equal(await text(p, "#fname"), "C");
    assert.equal(await text(p, "#xo"), "x32o1o", "x for a muted string, o for an open one, the fret for a held one");
    await fits(p, "#finder", size, "finder");
    for (const sel of ["#fname", "#fsee", "#xo"]) await inside(p, sel, size, "finder");
    /* the G string at fret 2: x32210 */
    await tap(p, p.locator("#frets button").nth(6 + 3));
    assert.equal(await text(p, "#fname"), "C6");
    assert.match(await text(p, "#falt"), /Am\/C/);
    await tap(p, "#fsee");
    assert.equal(await text(p, "#cname"), "C6");
    assert.match(await text(p, "#line"), /^x32210 · /);
    /* a cluster is no chord, and Show is off */
    await tap(p, "#chord");
    await tap(p, "#tofind");
    await tap(p, p.locator("#frets button").nth(2));
    await tap(p, p.locator("#frets button").nth(4));
    assert.equal(await text(p, "#fname"), "不是常见和弦");
    assert.ok(await p.locator("#fsee").isDisabled());
    await tap(p, "#fback");
    assert.equal(await text(p, "#cname"), "C6");
    assert.deepEqual(errors, []);
  }
});

test("chord-book: English words, the strum plays without an error, the degree map is named", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t, { lang: "en", size: LARGE });
  assert.equal(await text(p, "#strum"), "Strum");

  assert.equal(await text(p, "#qname"), "major");
  assert.match(await text(p, "#line"), /^x32010 · 1 \/ \d+ · open$/);
  await tap(p, "#strum");
  await tap(p, "#pic");
  assert.equal(await text(p, "#view"), "Degrees");
  await tap(p, "#chord");
  assert.equal(await text(p, "#tofind"), "Find by frets");
  assert.equal(await text(p, "#sortH"), "Shape order");
  assert.equal(await text(p, "#sorts"), "Common firstBy fret");
  assert.deepEqual(errors, []);
});

test("chord-book: each sounding string is a button with its note and degree that plays that string alone", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  /* Guitar is the app's own global; record what it is asked to play */
  await p.evaluate(() => {
    window.__notes = [];
    const play = window.Guitar.play;
    window.Guitar.play = (notes, gap, ring) => { window.__notes.push({ notes, ring: !!ring }); return play(notes, gap, ring); };
  });
  /* C x32010: the low E is muted, then C3 R, E3 3, G3 5, C4 R, E4 3; tapped one after another they ring together */
  assert.equal(await p.locator("#tones .tone").count(), 6);
  const strings = p.locator("#tones button");
  assert.equal(await strings.count(), 5);
  for (let i = 0; i < 5; i++) await tap(p, strings.nth(i));
  assert.deepEqual(await p.evaluate(() => window.__notes), [48, 52, 55, 60, 64].map((m) => ({ notes: [m], ring: true })));
  /* a slash chord's extra bass is marked as the bass: Am/G 3x2210 is G2 bass, A muted, E3 5, A3 R, C4 b3, E4 5 */
  await tap(p, "#chord");
  await p.locator("#q").fill("Am/G");
  await tap(p, "#qgo");
  assert.match(await text(p, "#line"), /^3x2210 · /);
  assert.equal(await text(p, "#tones"), "G低音xE5ARCb3E5");
  await p.evaluate(() => { window.__notes = []; });
  for (let i = 0; i < 5; i++) await tap(p, p.locator("#tones button").nth(i));
  assert.deepEqual(await p.evaluate(() => window.__notes.map((x) => x.notes[0])), [43, 52, 57, 60, 64]);
  assert.deepEqual(errors, []);
});

test("chord-book: a tap on the picture opens the degree map; a place on it plays its note, the view button closes it", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await p.evaluate(() => {
    window.__notes = [];
    const play = window.Guitar.play;
    window.Guitar.play = (notes, gap, ring) => { window.__notes.push({ notes, ring: !!ring }); return play(notes, gap, ring); };
  });
  await tap(p, "#pic");
  assert.equal(await text(p, "#view"), "度数");
  assert.deepEqual(await p.evaluate(() => window.__notes), [], "the tap opened the map and played nothing");
  /* a place on the map, in buffer pixels of the 104 x 104 box: the A string at fret 3 (C3), the high E at fret 1 (F4) */
  const at = async (bx, by) => {
    const b = await p.locator("#pic").boundingBox();
    await p.touchscreen.tap(b.x + (bx + 0.5) * b.width / 104, b.y + (by + 0.5) * b.height / 104);
    await p.waitForTimeout(80);
  };
  await at(34, 58);
  await at(90, 24);
  assert.deepEqual(await p.evaluate(() => window.__notes), [{ notes: [48], ring: true }, { notes: [65], ring: true }]);
  /* a swipe still turns the voicing, and the map stays open */
  await p.evaluate(() => window.__press("right"));
  await p.waitForTimeout(80);
  assert.match(await text(p, "#line"), /· 2 \/ /);
  assert.equal(await text(p, "#view"), "度数");
  /* the view button closes it back to the box; SELECT opens and closes it too, and it is saved */
  await tap(p, "#view");
  assert.equal(await text(p, "#view"), "框图");
  await p.evaluate(() => window.__press("select"));
  await p.waitForTimeout(400);
  assert.equal(await text(p, "#view"), "度数");
  assert.equal(await p.evaluate(() => window.__saves.set.map), true);
  await p.evaluate(() => window.__press("select"));
  await p.waitForTimeout(80);
  assert.equal(await text(p, "#view"), "框图");
  assert.deepEqual(errors, []);
});

test("chord-book: 连接 lists C's progressions, plays one a chord a second, and a chord in it opens on the main screen", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    await tap(p, "#prog");
    assert.ok(await p.locator("#progs").isVisible());
    assert.equal(await text(p, "#gtitle"), "C 的和弦连接");
    await fits(p, "#progs", size, "the progressions");
    const card = p.locator("#glist .card").first();
    assert.equal(await card.locator(".chips").textContent(), "CGAmF");
    assert.equal(await card.locator(".chips .me").textContent(), "C");
    assert.equal(await card.locator(".grole").textContent(), "C 在这里是 I");
    assert.ok((await card.locator(".why").textContent()).length > 20, "the why is there");
    assert.deepEqual(errors, []);
  }

  const { p, errors } = await open(t);
  await p.evaluate(() => {
    window.__notes = [];
    const play = window.Guitar.play;
    window.Guitar.play = (notes, gap, ring) => { window.__notes.push(notes); return play(notes, gap, ring); };
  });
  await tap(p, "#prog");
  const card = () => p.locator("#glist .card").first();
  await tap(p, card().locator(".gplay"));
  assert.equal(await card().locator(".gplay").textContent(), "停");
  assert.equal(await card().locator(".chips .sel").textContent(), "C");
  await p.waitForTimeout(1250);
  assert.equal(await card().locator(".chips .sel").textContent(), "G");
  /* the first chord is the voicing in view, C x32010 */
  assert.deepEqual(await p.evaluate(() => window.__notes[0]), [48, 52, 55, 60, 64]);
  await tap(p, card().locator(".gplay"));
  assert.equal(await card().locator(".gplay").textContent(), "听");
  const n = await p.evaluate(() => window.__notes.length);
  await p.waitForTimeout(1200);
  assert.equal(await p.evaluate(() => window.__notes.length), n, "a second tap stops it");

  /* a chord in it opens on the main screen, on the shape it was played with */
  await tap(p, card().locator(".chips button").nth(2));
  assert.ok(!(await p.locator("#progs").isVisible()));
  assert.equal(await text(p, "#cname"), "Am");

  /* the keys: the first arrow shows which card has the focus, A plays it, B closes */
  await tap(p, "#prog");
  assert.equal(await text(p, "#gtitle"), "Am 的和弦连接");
  await p.evaluate(() => { window.__press("down"); window.__press("a"); });
  await p.waitForTimeout(80);
  assert.equal(await p.locator("#glist .card.focus .gplay").textContent(), "停");
  await p.evaluate(() => window.__press("b"));
  await p.waitForTimeout(80);
  assert.ok(!(await p.locator("#progs").isVisible()));
  assert.deepEqual(errors, []);
});

test("chord-book: the progressions in English, and a slash chord's place in the canon", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t, { lang: "en" });
  assert.equal(await text(p, "#prog"), "Progs");
  await tap(p, "#prog");
  assert.equal(await text(p, "#gtitle"), "Progressions with C");
  assert.equal(await p.locator("#glist .card .grole").first().textContent(), "C is I here");
  await tap(p, "#gback");
  await tap(p, "#chord");
  await p.locator("#q").fill("C/E");
  await tap(p, "#qgo");
  await tap(p, "#prog");
  const first = p.locator("#glist .card").first();
  assert.equal(await first.locator(".chips").textContent(), "CG/BAmEm/GFC/EFG");
  assert.equal(await first.locator(".grole").textContent(), "C/E is I/3 here");
  assert.deepEqual(errors, []);
});
