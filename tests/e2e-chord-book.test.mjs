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

test("chord-book: the picture keeps one size through every voicing, the map included; the rows around it do not move", { skip, timeout: 120000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    for (const name of ["C", "Ebmaj7"]) {
      await tap(p, "#chord");
      await p.locator("#q").fill(name);
      await tap(p, "#qgo");
      const n = Number((await text(p, "#line")).match(/ \/ (\d+)/)[1]);
      const seen = new Set();
      for (let i = 0; i < n; i++) {
        for (const map of [false, true]) {
          /* SELECT cycles box -> neck -> map -> improv -> box */
          if (map) await p.evaluate(() => { window.__press("select"); window.__press("select"); });
          const r = await p.evaluate(() => ({
            pic: document.getElementById("pic").style.width,
            line: document.getElementById("line").getBoundingClientRect().height,
            tones: document.getElementById("tones").getBoundingClientRect().height,
            cells: [...document.querySelectorAll("#tones .tone")].map((c) => Math.round(c.getBoundingClientRect().height)).join(",")
          }));
          seen.add(`${r.pic} ${r.line} ${r.tones} ${r.cells.split(",").every((h) => h === "44")}`);
          if (map) await p.evaluate(() => { window.__press("select"); window.__press("select"); });
        }
        await p.evaluate(() => window.__press("right"));
      }
      assert.equal(seen.size, 1, `${name} at ${size.width}x${size.height}: one picture size, row heights and 44 px cells: ${[...seen].join(" | ")}`);
      assert.match([...seen][0], / true$/, "every string cell is 44 px");
    }
    assert.deepEqual(errors, []);
  }
});

test("chord-book: a search lands on C#m7b5; voicings turn, sort and view switch, and all of it is saved", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  assert.ok(await p.locator("#picker").evaluate((e) => e.classList.contains("open")));
  await tap(p, "#qgo");
  assert.equal(await text(p, "#msg"), "先输入一个和弦名", "an empty search asks for a name");
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
  assert.equal(await text(p, "#msg"), "这个版本只收 32 种和弦（认不出 Cxyz）");
  assert.ok(await p.locator("#picker").evaluate((e) => e.classList.contains("open")));
  await p.locator("#q").fill("C$&");
  await tap(p, "#qgo");
  assert.equal(await text(p, "#msg"), "这个版本只收 32 种和弦（认不出 C$&）", "a query is text, not a replacement pattern");
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
    await tap(p, p.locator("#basses button", { hasText: /^F#\/Gb$/ }));
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

test("chord-book 1.4.7: the picker's six groups list the new qualities, and Cmaj9 opens on its own shape", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  assert.deepEqual(await p.locator("#quals h3").allTextContents(),
    ["三和弦", "七和弦", "挂留", "加音、六", "九、十一、十三", "变化属七"]);
  await tap(p, p.locator("#quals button", { hasText: "maj9" }).first());
  assert.equal(await text(p, "#ptitle"), "Cmaj9");
  await tap(p, "#pok");
  assert.equal(await text(p, "#cname"), "Cmaj9");
  assert.equal(await text(p, "#qname"), "大九");
  assert.match(await text(p, "#line"), /^x3243x · 1 \/ /);
  assert.equal(await text(p, "#tones"), "xCRE3B7D9x", "the G is left out: the 9, 7 and 3 are what make the colour");
  /* the improv view knows it: Ionian first, and the 9 still reads last */
  await tap(p, "#view"); await tap(p, "#view"); await tap(p, "#view");
  assert.equal(await text(p, "#view"), "即兴");
  assert.match(await text(p, "#qname"), /^C Ionian（大调） · 1 \/ 3$/);
  assert.equal(await text(p, "#line"), "R 3 11 5 13 7 9");
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.7: the finder names a six-nine and an add11 too", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  await p.locator("#q").fill("C6/9");
  await tap(p, "#qgo");
  assert.equal(await text(p, "#cname"), "C6/9");
  assert.match(await text(p, "#line"), /^x32233 · /);
  await tap(p, "#chord");
  await p.locator("#q").fill("Cadd11");
  await tap(p, "#qgo");
  assert.equal(await text(p, "#cname"), "Cadd11");
  assert.match(await text(p, "#line"), /^x32011 · /);
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.8: group 5 has four rows; C7b9 and Caug7 open on the right chord and shape", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    await tap(p, "#chord");
    await fits(p, "#picker", size, "the picker with four altered dominants");
    const group5 = await p.evaluate(() => {
      const h = [...document.querySelectorAll("#quals h3")].find((e) => e.textContent === "变化属七");
      return [...h.nextElementSibling.querySelectorAll("button")].map((b) => b.querySelector("b").textContent);
    });
    assert.deepEqual(group5, ["7#9", "7b9", "7b5", "7#5"], "one row each: aug7 is not a second quality");
    await p.locator("#q").fill("C7b9");
    await tap(p, "#qgo");
    assert.equal(await text(p, "#cname"), "C7b9");
    assert.equal(await text(p, "#qname"), "属七降九");
    assert.match(await text(p, "#line"), /^x32320 · 1 \//);
    /* the same chord under another name: Caug7 is C7#5, and its hand-written shape comes first */
    await tap(p, "#chord");
    await p.locator("#q").fill("Caug7");
    await tap(p, "#qgo");
    assert.equal(await text(p, "#cname"), "C7#5");
    assert.equal(await text(p, "#qname"), "属七升五");
    assert.match(await text(p, "#line"), /^x36350 · 1 \//);
    assert.deepEqual(errors, []);
  }
});

test("chord-book 1.4.9: groups 2, 3 and 4 take the four colours; Cmaj7#11 and C9sus4 open on their shapes", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    await tap(p, "#chord");
    await fits(p, "#picker", size, "the picker with the four new qualities");
    const groups = await p.evaluate(() => {
      const out = {};
      document.querySelectorAll("#quals h3").forEach((h) => {
        out[h.textContent] = [...h.nextElementSibling.querySelectorAll("button")].map((b) => b.querySelector("b").textContent);
      });
      return out;
    });
    assert.deepEqual(groups["挂留"], ["sus2", "sus4", "7sus4", "9sus4"], "group 2 gains 9sus4");
    assert.deepEqual(groups["加音、六"], ["add9", "6", "m6", "6/9", "add11", "madd9"], "group 3 gains madd9");
    assert.deepEqual(groups["九、十一、十三"], ["9", "m9", "maj9", "13", "m11", "maj7#11", "m13"], "group 4 gains maj7#11 and m13");
    /* the Lydian major 7: x34000 has the #11 on the D string, and the improv view opens on Lydian */
    await p.locator("#q").fill("Cmaj7#11");
    await tap(p, "#qgo");
    assert.equal(await text(p, "#cname"), "Cmaj7#11");
    assert.equal(await text(p, "#qname"), "大七升十一");
    assert.match(await text(p, "#line"), /^x34000 · 1 \//);
    assert.equal(await text(p, "#tones"), "xCRF##11G5B7E3", "C, F# #11, G 5, B 7, E 3");
    await tap(p, "#view"); await tap(p, "#view"); await tap(p, "#view");
    assert.equal(await text(p, "#view"), "即兴");
    assert.equal(await text(p, "#qname"), "C Lydian · 1 / 2");
    assert.equal(await text(p, "#line"), "R 3 #11 5 13 7 9");
    /* back to the box for a search, which keeps the saved view */
    await tap(p, "#view");
    assert.equal(await text(p, "#view"), "框图");
    /* 9sus4, under its shorter name too: x3333x omits the 5th */
    await tap(p, "#chord");
    await p.locator("#q").fill("C9sus");
    await tap(p, "#qgo");
    assert.equal(await text(p, "#cname"), "C9sus4", "9sus reads as the canonical 9sus4");
    assert.equal(await text(p, "#qname"), "属九挂四");
    assert.match(await text(p, "#line"), /^x3333x · 1 \//);
    assert.deepEqual(errors, []);
  }
});

test("chord-book: the finder names the frets, starts from the picked chord and shows the chord it found", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    await tap(p, "#chord");
    await tap(p, "#tofind");
    assert.ok(await p.locator("#finder").evaluate((e) => e.classList.contains("open")));
    assert.equal(await text(p, "#fname"), "C");
    assert.equal(await text(p, "#xo"), "x··o·o", "x for a muted string, o for an open one, · for a fretted one");
    await fits(p, "#finder", size, "finder");
    for (const sel of ["#fname", "#fsee", "#xo"]) await inside(p, sel, size, "finder");
    /* the G string at fret 2: x32210 */
    await tap(p, p.locator("#frets button").nth(6 + 3));
    assert.equal(await text(p, "#fname"), "C6");
    assert.match(await text(p, "#falt"), /Am\/C/);
    await tap(p, "#fsee");
    assert.equal(await text(p, "#cname"), "C6");
    assert.match(await text(p, "#line"), /^x32210 · /);
    /* a cluster is no chord, and Show is off; 1.4.7's 13 is named before the third note spoils it */
    await tap(p, "#chord");
    await tap(p, "#tofind");
    await tap(p, p.locator("#frets button").nth(0));
    await tap(p, p.locator("#frets button").nth(1));
    assert.equal(await text(p, "#fname"), "C13/F", "the new thirteenth is named");
    await tap(p, p.locator("#frets button").nth(3));
    assert.equal(await text(p, "#fname"), "不是这一版的 32 种和弦");
    assert.ok(await p.locator("#fsee").isDisabled());
    await tap(p, "#fback");
    assert.equal(await text(p, "#cname"), "C6");
    assert.deepEqual(errors, []);
  }
});

test("chord-book 1.4.1: the finder's position moves the shape, and the x/o row names only x and o", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  /* F 133211: every string fretted, so the whole shape can move and stay a chord */
  await tap(p, "#chord");
  await p.locator("#q").fill("F");
  await tap(p, "#qgo");
  await tap(p, "#chord");
  await tap(p, "#tofind");
  assert.equal(await text(p, "#fname"), "F");
  assert.equal(await text(p, "#xo"), "······", "a fretted string is neither x nor o");
  const held = () => p.evaluate(() => {
    const out = {};
    document.querySelectorAll("#frets button").forEach((b, i) => { if (b.classList.contains("sel")) out[i % 6] = b.textContent; });
    return out;
  });
  assert.deepEqual(await held(), { 0: "1", 1: "3", 2: "3", 3: "2", 4: "1", 5: "1" });
  /* + moves the shape up a fret, the five-fret grid with it: F becomes F# 244322, and Listen plays the shifted notes */
  await p.evaluate(() => {
    window.__notes = [];
    const play = window.Guitar.play;
    window.Guitar.play = (notes, gap, ring) => { window.__notes.push(notes.slice()); return play(notes, gap, ring); };
  });
  await tap(p, "#fup");
  assert.equal(await text(p, "#fname"), "F#");
  assert.equal(await text(p, "#fpos"), "2 品起");
  assert.deepEqual(await held(), { 0: "2", 1: "4", 2: "4", 3: "3", 4: "2", 5: "2" });
  await tap(p, "#fplay");
  assert.deepEqual(await p.evaluate(() => window.__notes[0]), [42, 49, 54, 58, 61, 66]);
  /* down goes back; down again from fret 1 is refused, because a fretted note would leave the neck */
  await tap(p, "#fdown");
  assert.equal(await text(p, "#fname"), "F");
  await tap(p, "#fdown");
  assert.equal(await text(p, "#fname"), "F", "still F: no note below fret 1");
  assert.equal(await text(p, "#fpos"), "1 品起");
  /* the x/o row: a fretted string mutes, a muted string opens, an open string mutes */
  await tap(p, p.locator("#xo button").nth(0));
  assert.equal(await text(p, "#xo"), "x·····");
  await tap(p, p.locator("#xo button").nth(0));
  assert.equal(await text(p, "#xo"), "o·····");
  await tap(p, p.locator("#xo button").nth(0));
  assert.equal(await text(p, "#xo"), "x·····");
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.1: moving an open shape leaves its open and muted strings where they are", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  await tap(p, "#tofind");
  assert.equal(await text(p, "#xo"), "x··o·o");
  /* C x32010 one fret up: the three fretted notes move, the muted low E and the two open strings do not */
  await tap(p, "#fup");
  assert.equal(await text(p, "#fpos"), "2 品起");
  assert.equal(await text(p, "#fname"), "不是这一版的 32 种和弦");
  assert.equal(await text(p, "#xo"), "x··o·o", "still two open strings and a muted one");
  const held = await p.evaluate(() => {
    const out = {};
    document.querySelectorAll("#frets button").forEach((b, i) => { if (b.classList.contains("sel")) out[i % 6] = b.textContent; });
    return out;
  });
  assert.deepEqual(held, { 1: "4", 2: "3", 4: "2" }, "x43020: only the fretted notes moved");
  assert.ok(await p.locator("#fsee").isDisabled(), "an unknown chord cannot be shown");
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.1: a found voicing outside the chord's list is shown first as a temporary one", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  await tap(p, "#tofind");
  /* C x32010 with the low E added at fret 5: 532010 is an Am7 the generator does not list */
  await tap(p, p.locator("#frets button").nth(4 * 6 + 0));
  assert.equal(await text(p, "#fname"), "Am7");
  assert.ok(!(await p.locator("#fsee").isDisabled()));
  const found = await p.evaluate(() => Chords.voicings(Chords.parse("Am7")).length);
  await tap(p, "#fsee");
  assert.equal(await text(p, "#cname"), "Am7");
  assert.match(await text(p, "#line"), /^532010 · 1 \/ \d+ · /);
  const n = Number((await text(p, "#line")).match(/ \/ (\d+)/)[1]);
  assert.equal(n, found + 1, "the temporary voicing is added before the chord's own list");
  assert.equal(await text(p, "#tones"), "ARCb3E5Gb7Cb3E5");
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.1: with the sound off, a play is silent rather than an error", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  await tap(p, p.locator("#vol button").nth(0));
  assert.equal(await p.evaluate(() => window.Guitar.level()), 0, "the switch is at Off");
  await tap(p, "#pback");
  await p.evaluate(() => { window.__log = []; });
  await tap(p, "#strum");
  await tap(p, p.locator("#tones button").first());
  assert.deepEqual(await p.evaluate(() => window.__log), [], "no err, and nothing else either");
  await tap(p, "#chord");
  await tap(p, "#tofind");
  await p.evaluate(() => { window.__log = []; });
  await tap(p, "#fplay");
  assert.deepEqual(await p.evaluate(() => window.__log), [], "Listen is silent too");
  /* the fourth play path: a progression's Play must return silently, not beep err (playProg) */
  await tap(p, "#fback");
  await tap(p, "#pback");
  await tap(p, "#prog");
  await p.evaluate(() => { window.__log = []; });
  await tap(p, p.locator("#glist .card .gplay").first());
  await p.waitForTimeout(1250);
  assert.deepEqual(await p.evaluate(() => window.__log), [], "a progression with the switch off is silent too");
  assert.deepEqual(errors, []);
});

test("chord-book: English words, the strum plays without an error, the degree map is named", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t, { lang: "en", size: LARGE });
  assert.equal(await text(p, "#strum"), "Strum");

  assert.equal(await text(p, "#qname"), "major");
  assert.match(await text(p, "#line"), /^x32010 · 1 \/ \d+ · open$/);
  await tap(p, "#strum");
  await tap(p, "#pic");
  assert.equal(await text(p, "#view"), "Box", "a tap on the picture plays a note and leaves the view alone");
  await tap(p, "#view");
  assert.equal(await text(p, "#view"), "Neck");
  await tap(p, "#view");
  assert.equal(await text(p, "#view"), "Degrees");
  await tap(p, "#view");
  assert.equal(await text(p, "#view"), "Improv");
  assert.equal(await text(p, "#qname"), "C Ionian (major) · 1 / 4");
  assert.match(await text(p, "#tones"), /11 is a half step over 3: pass through/);
  assert.match(await text(p, "#tones"), /■ root ● chord ○ tension × avoid/);
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

test("chord-book: the view button cycles box, neck, degree map and improv; in each a tap plays the note under the finger", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await p.evaluate(() => {
    window.__notes = [];
    const play = window.Guitar.play;
    window.Guitar.play = (notes, gap, ring) => { window.__notes.push({ notes, ring: !!ring }); return play(notes, gap, ring); };
  });
  /* a place on the picture, in its buffer pixels */
  const at = async (bx, by) => {
    const b = await p.locator("#pic").boundingBox(), w = await p.locator("#pic").evaluate((c) => [c.width, c.height]);
    await p.touchscreen.tap(b.x + (bx + 0.5) * b.width / w[0], b.y + (by + 0.5) * b.height / w[1]);
    await p.waitForTimeout(80);
  };
  const played = async () => { const n = await p.evaluate(() => window.__notes.map((x) => x.notes[0])); await p.evaluate(() => { window.__notes = []; }); return n; };
  /* the box (104 x 104): the A string at fret 3 (C3) where the voicing plays, the high E at fret 1 (F4) where it does not,
     and the open G above the nut */
  assert.equal(await text(p, "#view"), "框图");
  await at(34, 58); await at(90, 24); await at(62, 6);
  assert.deepEqual(await played(), [48, 65, 55]);
  assert.ok((await p.evaluate(() => window.__notes)).every((x) => x.ring !== false));
  /* the neck (150 x 72, low E at the bottom): the low E string at fret 5 (A2), the high E at fret 12 (E5), the open D */
  await tap(p, "#view");
  assert.equal(await text(p, "#view"), "指板");
  await at(12 + 4 * 9 + 4, 56); await at(12 + 11 * 9 + 4, 6); await at(5, 36);
  assert.deepEqual(await played(), [45, 76, 50]);
  /* the degree map: same places as the box */
  await tap(p, "#view");
  assert.equal(await text(p, "#view"), "度数");
  await at(34, 58); await at(90, 24);
  assert.deepEqual(await played(), [48, 65]);
  /* a swipe still turns the voicing and keeps the view, which is saved; the button and SELECT go round to the box */
  await p.evaluate(() => window.__press("right"));
  await p.waitForTimeout(400);
  assert.match(await text(p, "#line"), /· 2 \/ /);
  assert.equal(await text(p, "#view"), "度数");
  assert.equal(await p.evaluate(() => window.__saves.set.view), "map");
  await tap(p, "#view");
  assert.equal(await text(p, "#view"), "即兴");
  /* the improv view is the neck: same places */
  await at(12 + 4 * 9 + 4, 56); await at(5, 36);
  assert.deepEqual(await played(), [45, 50]);
  await tap(p, "#view");
  assert.equal(await text(p, "#view"), "框图");
  await p.evaluate(() => window.__press("select"));
  await p.waitForTimeout(80);
  assert.equal(await text(p, "#view"), "指板");
  assert.deepEqual(errors, []);
});

test("chord-book: a 1.2.0 save with the degree map switched on opens on the degree map", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t, { saved: { v: 1, cur: { root: 0, q: "", bass: null, i: 0 }, sort: "common", view: "neck", map: true, vol: 2, recent: [] } });
  assert.equal(await text(p, "#view"), "度数");
  assert.equal(await p.locator("#pic").evaluate((c) => c.width), 104);
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.2: an old save's Ammaj7 reads as Am(maj7) in Recent, and only once", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t, { saved: { v: 1, cur: { root: 9, q: "mmaj7", bass: null, i: 0 }, sort: "common", view: "box", vol: 2, recent: ["Ammaj7", "Am(maj7)", "C"] } });
  assert.equal(await text(p, "#cname"), "Am(maj7)");
  await tap(p, "#chord");
  assert.equal(await text(p, "#recent"), "Am(maj7)C", "the two spellings of one chord are one chip");
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

test("chord-book 1.4.2: the twelve-bar blues holds each chord its bars", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  await p.locator("#q").fill("C7");
  await tap(p, "#qgo");
  await tap(p, "#prog");
  const card = p.locator("#glist .card").filter({ hasText: "十二小节布鲁斯" }).first();
  assert.equal(await card.locator(".grn").last().textContent(), "小节：4 2 2 1 1 2");
  await p.evaluate(() => {
    window.__strums = 0;
    const play = window.Guitar.play;
    window.Guitar.play = (notes, gap, ring) => { window.__strums++; return play(notes, gap, ring); };
  });
  const gplay = card.locator(".gplay");
  await tap(p, gplay);
  /* four bars of I7, a strum a bar: four by 3.5 s, still on I7 */
  await p.waitForTimeout(3500);
  assert.ok(await p.evaluate(() => window.__strums) >= 4, "four bars of I7, one strum a bar");
  assert.equal(await card.locator(".chips .sel").textContent(), "C7");
  /* the fifth bar starts IV7 */
  await p.waitForTimeout(1100);
  assert.ok(await p.evaluate(() => window.__strums) >= 5, "the fifth bar strums");
  assert.equal(await card.locator(".chips .sel").textContent(), "F7");
  await tap(p, gplay);
  const n = await p.evaluate(() => window.__strums);
  await p.waitForTimeout(1200);
  assert.equal(await p.evaluate(() => window.__strums), n, "Stop stops the bars too");
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
  assert.equal(await first.locator(".grole").textContent(), "C/E is I6 here");
  assert.deepEqual(errors, []);
});

test("chord-book: the improv view shows the chord's scale by kind; left and right change the scale, a new chord goes back to its default", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    await tap(p, "#view");
    const neck = await p.locator("#pic").evaluate((c) => c.style.width);
    const rows = async () => p.evaluate(() => ["qname", "line", "tones"].map((id) => document.getElementById(id).getBoundingClientRect().height).join(","));
    const before = await rows();
    await tap(p, "#view"); await tap(p, "#view");
    assert.equal(await text(p, "#view"), "即兴");
    assert.equal(await p.locator("#pic").evaluate((c) => c.width), 150);
    assert.equal(await p.locator("#pic").evaluate((c) => c.style.width), neck, "the same size as the neck view");
    assert.equal(await rows(), before, "the rows around the picture keep their heights");
    await fits(p, "body", size, "the improv view");
    assert.equal(await text(p, "#qname"), "C Ionian（大调） · 1 / 4");
    assert.equal(await text(p, "#line"), "R 3 11 5 13 7 9");
    assert.deepEqual(await p.locator("#line b").allTextContents(), ["R", "3", "5"]);
    assert.deepEqual(await p.locator("#line s").allTextContents(), ["11"]);
    assert.equal(await p.locator("#tones .why2 p").first().textContent(), "大调本身，最稳的选择。11 比 3 高半音，经过就好，别停在上面。");
    assert.equal(await p.locator("#tones .legend").textContent(), "■ 根音 ● 和弦音 ○ 延伸音 × 避免音");
    /* right: the next scale, and the picture slides */
    await p.evaluate(() => window.__press("right"));
    assert.equal(await p.locator("#pwrap .ghost").count(), 1, "the old picture slides out");
    await p.waitForTimeout(400);
    assert.equal(await p.locator("#pwrap .ghost").count(), 0);
    assert.equal(await p.locator("#pic").evaluate((c) => c.style.transform), "");
    assert.equal(await text(p, "#qname"), "C Lydian · 2 / 4");
    assert.equal(await text(p, "#line"), "R 3 #11 5 13 7 9");
    assert.equal(await p.locator("#line s").count(), 0);
    assert.equal(await p.evaluate(() => window.__saves.set.cur.i), 0, "the voicing stays");
    /* the next button and a swipe do the same; left wraps */
    await tap(p, "#next");
    assert.match(await text(p, "#qname"), /大调五声 · 3 \/ 4$/);
    await p.evaluate(() => { window.__press("left"); window.__press("left"); window.__press("left"); });
    await p.waitForTimeout(400);
    assert.match(await text(p, "#qname"), /Mixolydian · 4 \/ 4$/);
    /* another chord starts on its own default */
    await p.evaluate(() => window.__press("down"));
    await p.waitForTimeout(80);
    assert.equal(await text(p, "#cname"), "Cm");
    assert.equal(await text(p, "#qname"), "C Aeolian（自然小调） · 1 / 4");
    assert.deepEqual(await p.locator("#line s").allTextContents(), ["b13"]);
    assert.equal(await p.evaluate(() => window.__saves.set.view), "scale");
    assert.deepEqual(errors, []);
  }
});

test("chord-book: a chord opened from a progression takes its mode from the key; the view is kept on a new start", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t, { saved: { v: 1, cur: { root: 0, q: "", bass: null, i: 0 }, sort: "common", view: "scale", vol: 2, recent: [] } });
  assert.equal(await text(p, "#view"), "即兴");
  await tap(p, "#prog");
  /* the pop four in C: C G Am F; F is IV, so Lydian, the second of a major chord's scales */
  await tap(p, p.locator("#glist .card").first().locator(".chips button").nth(3));
  assert.equal(await text(p, "#cname"), "F");
  assert.equal(await text(p, "#qname"), "F Lydian · 2 / 4");
  assert.match(await p.locator("#tones .why2 p").first().textContent(), /^按 C 大调和这个和弦的音选的。/);
  await p.evaluate(() => window.__press("right"));
  assert.doesNotMatch(await p.locator("#tones .why2 p").first().textContent(), /^按/);
  await p.evaluate(() => window.__press("left"));
  assert.match(await p.locator("#tones .why2 p").first().textContent(), /^按 C 大调和这个和弦的音选的。/);
  /* F's own progressions are in F (and keys where F is not the tonic); C is V in F major: Mixolydian, the fourth */
  await tap(p, "#prog");
  const card = p.locator("#glist .card").filter({ hasText: "F 大调" }).filter({ has: p.locator(".chips button", { hasText: /^C$/ }) }).first();
  await tap(p, card.locator(".chips button", { hasText: /^C$/ }).first());
  assert.equal(await text(p, "#cname"), "C");
  assert.match(await text(p, "#qname"), /^C Mixolydian · 4 \/ 4$/);
  assert.match(await p.locator("#tones .why2 p").first().textContent(), /^按 F 大调和这个和弦的音选的。/);
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.3: the x above a muted string plays nothing, an o still plays its open note", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await p.evaluate(() => {
    window.__notes = [];
    const play = window.Guitar.play;
    window.Guitar.play = (notes, gap, ring) => { window.__notes.push(notes.slice()); return play(notes, gap, ring); };
  });
  const at = async (bx, by) => {
    const b = await p.locator("#pic").boundingBox(), w = await p.locator("#pic").evaluate((c) => [c.width, c.height]);
    await p.touchscreen.tap(b.x + (bx + 0.5) * b.width / w[0], b.y + (by + 0.5) * b.height / w[1]);
    await p.waitForTimeout(80);
  };
  /* C x32010: the x above the muted low E (x 20, y 6), then the open G and high E */
  await at(20, 6);
  assert.deepEqual(await p.evaluate(() => window.__notes), [], "the x is not an open note");
  await at(20 + 3 * 14, 6);
  assert.deepEqual(await p.evaluate(() => window.__notes.map((x) => x[0])), [55], "the open G plays");
  await at(20 + 5 * 14, 6);
  assert.deepEqual(await p.evaluate(() => window.__notes.map((x) => x[0])), [55, 64], "the open high E plays");
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.3: the finder starts from the picker's pending chord, and Back goes there again", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  await tap(p, p.locator("#roots button", { hasText: /^C#\/Db$/ }).first());
  await tap(p, p.locator("#quals button", { hasText: "m7b5" }).first());
  assert.equal(await text(p, "#ptitle"), "C#m7b5");
  await tap(p, "#tofind");
  assert.ok(await p.locator("#finder").evaluate((e) => e.classList.contains("open")));
  assert.equal(await text(p, "#fname"), "C#m7b5", "the finder starts from the picked chord, not the old one");
  assert.equal(await text(p, "#xo"), "x····x");
  const held = await p.evaluate(() => {
    const out = {};
    document.querySelectorAll("#frets button").forEach((b, i) => { if (b.classList.contains("sel")) out[i % 6] = b.textContent; });
    return out;
  });
  assert.deepEqual(held, { 1: "4", 2: "5", 3: "4", 4: "5" }, "the grid is the chord's first voicing x4545x");
  /* B goes back to the picker, on the same chord; its own Back then reaches the main screen */
  await p.evaluate(() => window.__press("b"));
  assert.ok(await p.locator("#picker").evaluate((e) => e.classList.contains("open")));
  assert.equal(await text(p, "#ptitle"), "C#m7b5");
  await p.evaluate(() => window.__press("b"));
  assert.ok(!(await p.locator("#picker").evaluate((e) => e.classList.contains("open"))));
  assert.equal(await text(p, "#cname"), "C#m7b5");
  assert.match(await text(p, "#line"), /^x4545x · 1 \//);
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.3: one scale leaves the improv view's Prev and Next off, and they come back in the box", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  await p.locator("#q").fill("Edim7");
  await tap(p, "#qgo");
  await tap(p, "#view"); await tap(p, "#view"); await tap(p, "#view");
  assert.equal(await text(p, "#view"), "即兴");
  assert.equal(await text(p, "#prev"), "上一种音阶");
  assert.equal(await text(p, "#next"), "下一种音阶");
  assert.ok(await p.locator("#prev").isDisabled());
  assert.ok(await p.locator("#next").isDisabled());
  await p.evaluate(() => { window.__log = []; });
  await p.evaluate(() => window.__press("right"));
  assert.deepEqual(await p.evaluate(() => window.__log), [], "a single scale is not an error");
  /* the next view is the box: the old labels and both buttons are back */
  await tap(p, "#view");
  assert.equal(await text(p, "#view"), "框图");
  assert.equal(await text(p, "#prev"), "上一个");
  assert.equal(await text(p, "#next"), "下一个");
  assert.equal(await p.locator("#prev").isDisabled(), false);
  assert.equal(await p.locator("#next").isDisabled(), false);
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.3: the improv view's clipped why line opens in full, and B closes it", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    await tap(p, "#chord");
    await p.locator("#q").fill("C7");
    await tap(p, "#qgo");
    await tap(p, "#view"); await tap(p, "#view"); await tap(p, "#view");
    assert.equal(await text(p, "#view"), "即兴");
    const full = await p.locator("#tones .why2 p").first().textContent();
    assert.match(full, /别停在上面/, "the sentence the two lines cut");
    assert.equal(await p.locator("#tones .why2").evaluate((e) => e.getBoundingClientRect().height), 44, "a 44 px tap target");
    await tap(p, p.locator("#tones .why2"));
    assert.ok(await p.locator("#whyfull").evaluate((e) => e.classList.contains("open")));
    assert.equal(await text(p, "#wtext"), full, "the whole sentence");
    assert.equal(await text(p, "#wlegend"), "■ 根音 ● 和弦音 ○ 延伸音 × 避免音");
    await fits(p, "#whyfull", size, "the why screen");
    /* B closes it; a second tap opens it again and the panel's own Back closes that */
    await p.evaluate(() => window.__press("b"));
    await p.waitForTimeout(80);
    assert.ok(!(await p.locator("#whyfull").evaluate((e) => e.classList.contains("open"))));
    await tap(p, p.locator("#tones .why2"));
    assert.ok(await p.locator("#whyfull").evaluate((e) => e.classList.contains("open")));
    await tap(p, "#wback");
    assert.ok(!(await p.locator("#whyfull").evaluate((e) => e.classList.contains("open"))));
    /* the main screen still works after the overlay: the view button turns */
    await tap(p, "#view");
    assert.equal(await text(p, "#view"), "框图");
    assert.match(await text(p, "#line"), /^x32310 · /);
    assert.deepEqual(errors, []);
  }
});

test("chord-book 1.4.3: the footer's mute button turns the guitar off and back to the last level", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    assert.equal(await text(p, "#mute"), "静音");
    await fits(p, "body > footer", size, "the footer with four buttons");
    await tap(p, "#mute");
    assert.equal(await p.evaluate(() => window.Guitar.level()), 0);
    assert.equal(await text(p, "#mute"), "开声");
    await tap(p, "#mute");
    assert.equal(await p.evaluate(() => window.Guitar.level()), 2, "back to the middle level");
    assert.equal(await text(p, "#mute"), "静音");
    /* the picker's 声音 row is the same state, and a non-zero level becomes the one Mute returns to */
    await tap(p, "#chord");
    assert.ok(!(await p.locator("#vol button").nth(0).evaluate((b) => b.classList.contains("sel"))));
    assert.ok(await p.locator("#vol button").nth(2).evaluate((b) => b.classList.contains("sel")));
    await tap(p, p.locator("#vol button").nth(0));
    assert.equal(await p.evaluate(() => window.Guitar.level()), 0);
    assert.equal(await text(p, "#mute"), "开声");
    await tap(p, p.locator("#vol button").nth(1));
    assert.equal(await p.evaluate(() => window.Guitar.level()), 1);
    assert.equal(await text(p, "#mute"), "静音");
    await tap(p, "#pback");
    await tap(p, "#mute");
    assert.equal(await p.evaluate(() => window.Guitar.level()), 0);
    await tap(p, "#mute");
    assert.equal(await p.evaluate(() => window.Guitar.level()), 1, "the last level that made a sound");
    await fits(p, "body > footer", size, "the footer");
    /* the last level is saved: off with 小 remembered, a reload's 开声 returns to 小, not Mid */
    await p.waitForTimeout(400);
    await tap(p, "#mute");
    await p.waitForTimeout(400);
    const s = await p.evaluate(() => window.__saves.set);
    assert.equal(s.vol, 0);
    assert.equal(s.lastVol, 1);
    const again = await open(t, { size, saved: { ...s, vol: 0, lastVol: 1 } });
    assert.equal(await text(again.p, "#mute"), "开声");
    assert.equal(await again.p.evaluate(() => window.Guitar.level()), 0);
    await tap(again.p, "#mute");
    assert.equal(await again.p.evaluate(() => window.Guitar.level()), 1, "开声 goes back to the saved 小");
    assert.equal(await text(again.p, "#mute"), "静音");
    assert.deepEqual(again.errors, []);
    assert.deepEqual(errors, []);
  }
});

test("chord-book 1.4.4: a combination with no voicing is refused, and an old save that held one starts on C", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  await tap(p, p.locator("#roots button", { hasText: /^Ab\/G#$/ }));
  await tap(p, p.locator("#quals button", { hasText: /^9属九$/ }));
  await tap(p, p.locator("#basses button", { hasText: /^B$/ }));
  assert.equal(await text(p, "#ptitle"), "Ab9/B", "the picker reads the combination");
  await tap(p, "#pok");
  assert.ok(await p.locator("#picker").evaluate((e) => e.classList.contains("open")), "the picker stays open");
  assert.equal(await text(p, "#msg"), "这个和弦没有按法");
  assert.equal(await text(p, "#cname"), "C", "the main screen keeps the chord it had");
  /* the finder is not opened either: the picker is still there, with the same words */
  await tap(p, "#tofind");
  assert.ok(!(await p.locator("#finder").evaluate((e) => e.classList.contains("open"))), "no finder for a chord with no voicing");
  assert.ok(await p.locator("#picker").evaluate((e) => e.classList.contains("open")));
  assert.equal(await text(p, "#msg"), "这个和弦没有按法");
  /* tapping another root clears the sentence and reads the new combination */
  await tap(p, p.locator("#roots button", { hasText: /^C$/ }));
  assert.equal(await text(p, "#msg"), "", "the old refusal does not linger");
  assert.equal(await text(p, "#ptitle"), "C9/B");
  await tap(p, "#pback");
  assert.equal(await text(p, "#cname"), "C");
  /* a typed name takes the same road */
  await tap(p, "#chord");
  await p.locator("#q").fill("Ebm9/G");
  await tap(p, "#qgo");
  assert.ok(await p.locator("#picker").evaluate((e) => e.classList.contains("open")));
  assert.equal(await text(p, "#msg"), "这个和弦没有按法");
  assert.equal(await text(p, "#cname"), "C");
  await tap(p, "#pback");

  /* a save from before the guard: Ab9/B was the chord in view; the rest of the save is kept */
  const old = await open(t, { saved: { v: 1, cur: { root: 8, q: "9", bass: 11, i: 0 }, sort: "pos", view: "neck", vol: 1, lastVol: 1, recent: ["Ab9/B", "C"] } });
  assert.equal(await text(old.p, "#cname"), "C", "an old save with no-voicing chord falls back to C");
  assert.match(await text(old.p, "#line"), /^x32010 · /);
  assert.equal(await text(old.p, "#view"), "指板", "the saved view survives");
  assert.equal(await old.p.evaluate(() => window.Guitar.level()), 1, "the saved volume survives");
  await tap(old.p, "#chord");
  assert.ok(await old.p.locator("#sorts button", { hasText: "按把位" }).evaluate((b) => b.classList.contains("sel")), "the saved order survives");
  assert.equal(await text(old.p, "#recent"), "Ab9/BC", "the saved recent chords survive");
  await tap(old.p, "#pback");
  assert.deepEqual(old.errors, []);
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.4: a recent chip with no voicing is refused, and ↑ down on the main screen is too", { skip, timeout: 60000 }, async (t) => {
  /* a saved Recent may hold a combination the book cannot voice */
  const rec = await open(t, { saved: { v: 1, cur: { root: 0, q: "", bass: null, i: 0 }, sort: "common", view: "box", vol: 2, recent: ["Ab9/B", "C"] } });
  await tap(rec.p, "#chord");
  await tap(rec.p, rec.p.locator("#recent button", { hasText: /^Ab9\/B$/ }));
  assert.ok(await rec.p.locator("#picker").evaluate((e) => e.classList.contains("open")), "the picker stays open");
  assert.equal(await text(rec.p, "#msg"), "这个和弦没有按法");
  assert.equal(await text(rec.p, "#cname"), "C", "the main screen keeps C");
  assert.deepEqual(rec.errors, []);

  /* the main screen's quality step: Eb9/G down is Ebm9/G, which has no voicing; the chord stays, only err sounds */
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  await tap(p, p.locator("#roots button", { hasText: /^Eb\/D#$/ }));
  await tap(p, p.locator("#quals button", { hasText: /^9属九$/ }));
  await tap(p, p.locator("#basses button", { hasText: /^G$/ }));
  assert.equal(await text(p, "#ptitle"), "Eb9/G");
  await tap(p, "#pok");
  assert.equal(await text(p, "#cname"), "Eb9/G");
  const before = await text(p, "#line");
  await p.evaluate(() => { window.__log = []; window.__press("down"); });
  await p.waitForTimeout(80);
  assert.equal(await text(p, "#cname"), "Eb9/G", "the chord does not change");
  assert.equal(await text(p, "#line"), before, "the voicing line does not change");
  assert.deepEqual(await p.evaluate(() => window.__log), ["err"], "refused with the error sound, no message row on the main screen");
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.4: a guessed finder voicing draws no ring-finger barre", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  await tap(p, "#tofind");
  /* C x32010 -> x12222: A 1, D 2, G 2, B 2, high E 2 */
  await tap(p, p.locator("#frets button").nth(1));
  await tap(p, p.locator("#frets button").nth(9));
  await tap(p, p.locator("#frets button").nth(10));
  await tap(p, p.locator("#frets button").nth(11));
  assert.equal(await text(p, "#fname"), "F#m7/Bb");
  await tap(p, "#fsee");
  assert.equal(await text(p, "#cname"), "F#m7/Bb");
  /* a temporary shape is fingered by fingerCount: no bar at fret 2 between the B and high E strings */
  const px = await p.locator("#pic").evaluate((c) => Array.from(c.getContext("2d").getImageData(83, 41, 1, 1).data));
  assert.deepEqual(px, [163, 173, 126, 255], "paper, not ink: the guessed shape has no barre");
  assert.deepEqual(errors, []);
});

test("chord-book 1.4.5: the picker writes the common enharmonic beside each root and bass; the name stays the book's", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    await tap(p, "#chord");
    const roots = ["C", "C#/Db", "D", "Eb/D#", "E", "F", "F#/Gb", "G", "Ab/G#", "A", "Bb/A#", "B"];
    assert.deepEqual(await p.locator("#roots button").allTextContents(), roots, "every root with its common enharmonic");
    await fits(p, "#picker", size, "the picker with enharmonic labels");
    const clipped = await p.evaluate(() => [...document.querySelectorAll("#roots button, #basses button")]
      .filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent));
    assert.deepEqual(clipped, [], "no label is cut off in its cell");
    /* a tap still selects the pitch class; the title and every name keep the fixed spelling */
    await tap(p, p.locator("#roots button", { hasText: /^C#\/Db$/ }));
    assert.ok(await p.locator("#roots button", { hasText: /^C#\/Db$/ }).evaluate((b) => b.classList.contains("sel")));
    assert.equal(await text(p, "#ptitle"), "C#", "C# major, written the book's way");
    const basses = ["无", "C", "D", "Eb/D#", "E", "F", "F#/Gb", "G", "Ab/G#", "A", "Bb/A#", "B"];
    assert.deepEqual(await p.locator("#basses button").allTextContents(), basses, "the same labels, the root left out");
    await tap(p, p.locator("#basses button", { hasText: /^F#\/Gb$/ }));
    assert.equal(await text(p, "#ptitle"), "C#/F#");
    await tap(p, "#pok");
    assert.equal(await text(p, "#cname"), "C#/F#");
    assert.equal(await text(p, "#qname"), "大三");
    assert.deepEqual(errors, []);
  }
});

test("chord-book 1.4.5: 连接 can keep only the cards where the chord is the tonic; the keys walk that list", { skip, timeout: 60000 }, async (t) => {
  for (const size of [SMALL, LARGE]) {
    const { p, errors } = await open(t, { size });
    await tap(p, "#prog");
    await fits(p, "#progs", size, "the progressions with the filter row");
    assert.equal(await p.locator("#glist .card").count(), 15, "C is in 15 progressions");
    assert.equal(await text(p, "#gfilter"), "只看主和弦");
    assert.ok(!(await p.locator("#gfilter").evaluate((b) => b.classList.contains("on"))));
    assert.ok(await p.locator("#glist .card", { hasText: "小调终止" }).count() > 0, "the C-as-V card is there");
    /* the list is scrolled, then the filter is turned on: 12 cards, top of the list, the action reads 全部 */
    await p.evaluate(() => { document.getElementById("glist").scrollTop = 400; });
    await tap(p, "#gfilter");
    assert.equal(await p.locator("#glist .card").count(), 12, "12 of them make C the tonic");
    assert.equal(await text(p, "#gfilter"), "全部");
    assert.ok(await p.locator("#gfilter").evaluate((b) => b.classList.contains("on")));
    assert.equal(await p.locator("#glist .card", { hasText: "小调终止" }).count(), 0, "the C-as-V card is gone");
    assert.equal(await p.locator("#glist").evaluate((e) => e.scrollTop), 0, "the filtered list starts at the top");
    await tap(p, "#gfilter");
    assert.equal(await p.locator("#glist .card").count(), 15);
    assert.equal(await text(p, "#gfilter"), "只看主和弦");
    /* every visit starts with all cards, not the last filter */
    await tap(p, "#gfilter");
    await tap(p, "#gback");
    await tap(p, "#prog");
    assert.equal(await p.locator("#glist .card").count(), 15);
    assert.equal(await text(p, "#gfilter"), "只看主和弦");
    assert.ok(await p.locator("#gbar").isVisible(), "the row is back for a chord with a mix");
    assert.equal(await p.locator("#gfilter").isDisabled(), false);
    assert.deepEqual(errors, []);
  }

  /* the keyboard focuses and plays the filtered list: up from the first card wraps to the 12th tonic card, not the 15th */
  const { p, errors } = await open(t);
  await tap(p, "#prog");
  await p.evaluate(() => { window.__press("up"); window.__press("up"); });
  await p.waitForTimeout(80);
  assert.equal(await p.locator("#glist .card.focus .ghead b").textContent(), "加了颜色的流行四和弦", "unfiltered, the 15th card has C on V");
  await tap(p, "#gfilter");
  assert.equal(await p.locator("#glist .card.focus").count(), 0, "a toggle clears the focus");
  await p.evaluate(() => { window.__press("up"); window.__press("up"); });
  await p.waitForTimeout(80);
  assert.equal(await p.locator("#glist .card.focus .ghead b").textContent(), "减七经过", "the filtered 12th card, 减七经过");
  await p.evaluate(() => window.__press("a"));
  await p.waitForTimeout(100);
  assert.equal(await p.locator("#glist .card.focus .gplay").textContent(), "停", "A plays the focused card of the filtered list");
  /* a toggle while it plays stops the sequence and clears the focus */
  await tap(p, "#gfilter");
  assert.equal(await p.locator("#glist .gplay", { hasText: /^停$/ }).count(), 0);
  assert.equal(await p.locator("#glist .card.focus").count(), 0);
  assert.deepEqual(errors, []);

  /* English words */
  const en = await open(t, { lang: "en" });
  await tap(en.p, "#prog");
  assert.equal(await text(en.p, "#gfilter"), "Tonic only");
  await tap(en.p, "#gfilter");
  assert.equal(await text(en.p, "#gfilter"), "All");
  assert.deepEqual(en.errors, []);

  /* a chord with no tonic card hides the row, so the filter can never leave an empty screen */
  const b = await open(t);
  await tap(b.p, "#chord");
  await b.p.locator("#q").fill("Bdim");
  await tap(b.p, "#qgo");
  await tap(b.p, "#prog");
  assert.equal(await b.p.locator("#glist .card").count(), 1, "Bdim is vii° of the circle, its one progression");
  assert.ok(!(await b.p.locator("#gbar").isVisible()), "no filter row");
  assert.ok(await b.p.locator("#gfilter").isDisabled());
  assert.deepEqual(b.errors, []);

  /* every card already tonic (Cmaj7's 2 of 2) is nothing to filter: the row hides, like the zero-tonic case */
  const m = await open(t);
  await tap(m.p, "#chord");
  await m.p.locator("#q").fill("Cmaj7");
  await tap(m.p, "#qgo");
  await tap(m.p, "#prog");
  assert.equal(await m.p.locator("#glist .card").count(), 2, "Cmaj7's two progressions both make it the tonic");
  assert.ok(!(await m.p.locator("#gbar").isVisible()), "no filter row when every card is tonic");
  assert.ok(await m.p.locator("#gfilter").isDisabled());
  assert.deepEqual(m.errors, []);
});

test("chord-book 1.4.4: a chord opened from a progression keeps the key's spelling, with the book's name beside it", { skip, timeout: 60000 }, async (t) => {
  const { p, errors } = await open(t);
  await tap(p, "#chord");
  await p.locator("#q").fill("Abdim7");
  await tap(p, "#qgo");
  assert.equal(await text(p, "#cname"), "Abdim7");
  await tap(p, "#prog");
  await tap(p, p.locator("#glist .chips button", { hasText: /^G#dim7$/ }));
  assert.equal(await text(p, "#cname"), "G#dim7", "the key's spelling in the header");
  assert.equal(await text(p, "#qname"), "减七 · Abdim7", "the book's own name in the quality line");
  /* the improv view names the scale's root the key's way too */
  await tap(p, "#view"); await tap(p, "#view"); await tap(p, "#view");
  assert.equal(await text(p, "#view"), "即兴");
  assert.equal(await text(p, "#cname"), "G#dim7");
  assert.equal(await text(p, "#qname"), "G# 全半减音阶");
  await tap(p, "#view");
  assert.equal(await text(p, "#view"), "框图");
  /* a normal pick clears it */
  await tap(p, "#chord");
  await tap(p, p.locator("#roots button", { hasText: /^C$/ }));
  await tap(p, p.locator("#quals button", { hasText: "大三" }));
  await tap(p, "#pok");
  assert.equal(await text(p, "#cname"), "C");
  assert.equal(await text(p, "#qname"), "大三", "the alias note is gone");
  assert.deepEqual(errors, []);
});

