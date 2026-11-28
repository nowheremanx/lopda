// sdk/lo-title.js: the release bookkeeping, the framework block and its font, and the wheel's keys and taps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJSON, tool, copyApp, runScript } from "./helpers.mjs";
import { LIBT, LIBT_VERSION, LIBT_BLOCK, build, sha } from "../tools/lo-game-lib.mjs";

test("the current lo-title.js is a released version", () => {
  const versions = readJSON("sdk/lo-title.versions.json");
  assert.match(LIBT_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(versions[LIBT_VERSION], sha(LIBT), "bump VERSION and add the new hash to sdk/lo-title.versions.json");
  assert.match(LIBT, new RegExp("lo-title\\.js " + LIBT_VERSION.replace(/\./g, "\\.")), "header comment names the version");
  assert.doesNotMatch(LIBT, /<\/script/i);
  assert.doesNotMatch(LIBT.replace(/\/\*[\s\S]*?\*\//g, ""), /\.drawImage\(/, "putImageData only (Safari swaps red and blue)");
});

/* a template app with an empty lo-title block in front of its script, and the game template with both */
function withBlock(t, from, tag, name = "my-app") {
  const dir = copyApp(t, from, name);
  const file = join(dir, "index.html");
  writeFileSync(file, readFileSync(file, "utf8").replace(tag, '<script data-lo-title="0.1.0"></script>\n' + tag));
  return { dir, file };
}

test("an empty lo-title block fails the checker; the tool fills it and its font block, and the app passes", (t) => {
  const { dir, file } = withBlock(t, "sdk/template", "<script>");
  assert.match(tool("check-app.mjs", dir).out, /the lo-title block is empty/);
  const r = tool("bundle-app.mjs", dir);
  assert.equal(r.code, 0, r.out);
  const html = readFileSync(file, "utf8");
  assert.ok(html.includes(`<script data-lo-title="${LIBT_VERSION}">\n${LIBT}</script>\n<script data-lo-font="lopix12">`), "the font follows the block");
  assert.match(html, /\nLoTitle\.font\(\{/);
  assert.equal(build(html, dir), html, "idempotent");
  const c = tool("check-app.mjs", dir);
  assert.equal(c.code, 0, c.out);
  assert.match(c.out, /lo-title \d+\.\d+\.\d+ verified/);
  assert.match(c.out, /lo-font verified \(\d+ glyphs\)/);
});

test("with lo-game too, one font block feeds both, and an edited lo-title copy is rejected", (t) => {
  const { dir, file } = withBlock(t, "sdk/template-game", "<script data-lo-game", "my-game");
  const r = tool("bundle-app.mjs", dir);
  assert.equal(r.code, 0, r.out);
  const html = readFileSync(file, "utf8");
  assert.equal((html.match(/data-lo-font=/g) || []).length, 1);
  assert.match(html, /LoGame\.font\(LO_FONT\);\nLoTitle\.font\(LO_FONT\);/);
  const c = tool("check-app.mjs", dir);
  assert.equal(c.code, 0, c.out);
  writeFileSync(file, html.replace(LIBT_BLOCK, (m) => m.replace("</script>", "/* mine */\n</script>")));
  assert.match(tool("check-app.mjs", dir).out, /the lo-title copy differs from every released version/);
});

/* ---------- the menu, on a fake canvas ---------- */
function fake({ width = 331, height = 359, dpr = 1 } = {}) {
  const listeners = {}, frames = [], timers = [];
  let image = null;
  const canvas = {
    width: 0, height: 0, style: {}, isConnected: true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    getContext: () => ({
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData(img) { image = img; }
    }),
    addEventListener: (type, f) => { listeners[type] = f; }, setPointerCapture() {}
  };
  const ctx = runScript("sdk/lo-title.js", {
    devicePixelRatio: dpr, addEventListener() {}, removeEventListener() {}, atob: (s) => Buffer.from(s, "base64").toString("binary"),
    requestAnimationFrame: (f) => { frames.push(f); return frames.length; }, cancelAnimationFrame() {},
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {}
  });
  const font = JSON.parse(readFileSync(join(import.meta.dirname, "..", "sdk", "fonts", "lopix12.json"), "utf8"));
  ctx.LoTitle.font(font);
  let t = 0;
  const settle = () => { let n = 0; while (frames.length && n++ < 1000) { t += 50; frames.shift()(t); } assert.ok(n < 1000, "the frames stop once nothing moves"); };
  const runTimers = () => { while (timers.length) timers.shift()(); settle(); };
  /* the rows that hold a pixel of a tone (0 paper .. 3 ink) */
  const TONES = [[0xa3, 0xad, 0x7e], [0x7d, 0x8a, 0x58], [0x4a, 0x5a, 0x32], [0x1f, 0x2a, 0x14]];
  const rowsOf = (tone) => {
    const rows = [], [r, g, b] = TONES[tone], d = image.data;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const q = (y * image.width + x) * 4;
      if (d[q] === r && d[q + 1] === g && d[q + 2] === b) { rows.push(y); break; }
    }
    return rows;
  };
  const palette = () => {
    const d = image.data, seen = new Set();
    for (let q = 0; q < d.length; q += 4) seen.add(d[q] + "," + d[q + 1] + "," + d[q + 2]);
    return [...seen].sort();
  };
  return { canvas, listeners, LoTitle: ctx.LoTitle, settle, runTimers, rowsOf, palette };
}
/* a dark picture: nothing in it is paper, so every paper pixel on the screen is the chosen word's fill */
const ART = { w: 156, h: 156, px: new Uint8Array(156 * 156).fill(3) };

test("the menu: up and down roll and stop at the ends, A picks, a locked item shakes and says why instead", () => {
  const { LoTitle, settle, runTimers } = fake();
  const moves = [], picks = [], locked = [];
  const m = LoTitle.mount(fake().canvas, {
    art: ART, items: [{ label: "A" }, { label: "B", status: "b" }, { label: "C", locked: true, reason: "why" }], index: 1,
    note: "note", hint: "keys", onMove: (i) => moves.push(i), onPick: (i) => picks.push(i), onLocked: (i) => locked.push(i)
  });
  assert.equal(m.index(), 1);
  m.press("down"); settle();
  m.press("down"); settle();                        /* already at the end: nothing */
  assert.deepEqual(moves, [2]);
  m.press("a"); settle(); runTimers();
  assert.deepEqual(picks, [], "a locked item is never picked");
  assert.deepEqual(locked, [2]);
  m.press("up"); m.press("up"); settle();
  m.press("up"); settle();                          /* the top end */
  assert.equal(m.index(), 0);
  assert.deepEqual(moves, [2, 1, 0]);
  m.press("start");
  assert.deepEqual(picks, [0]);
  assert.equal(m.press("b"), false, "B is the app's");
  m.set({ index: 2 });
  assert.equal(m.index(), 2);
  m.set({ items: [{ label: "A" }] });
  assert.equal(m.index(), 0, "fewer items keep the index inside the list");
});

test("the menu by touch: a tap on a small word rolls to it, a tap on the big word picks, a drag turns it", () => {
  const { canvas, listeners, LoTitle, settle } = fake();
  const picks = [];
  const m = LoTitle.mount(canvas, { art: ART, items: [{ label: "A" }, { label: "B" }, { label: "C" }], index: 0, hint: "keys",
    onPick: (i) => picks.push(i) });
  settle();
  assert.equal(canvas.width, 331);
  const ev = (y) => ({ clientX: 165, clientY: y, pointerId: 1 });
  const tap = (y) => { listeners.pointerdown(ev(y)); listeners.pointerup(ev(y)); settle(); };
  /* from the bottom up: the first tap that does anything lands on the small word under the big one */
  for (let y = 358; y > 0 && m.index() === 0 && !picks.length; y -= 2) tap(y);
  assert.deepEqual(picks, [], "the small word rolls, it does not pick");
  assert.equal(m.index(), 1, "a tap on the word under the big one rolls one item down");
  for (let y = 358; y > 0 && m.index() === 1 && !picks.length; y -= 2) tap(y);
  assert.equal(m.index(), 2, "and again: the last item has nothing under it");
  for (let y = 358; y > 0 && !picks.length && m.index() === 2; y -= 2) tap(y);
  assert.deepEqual(picks, [2], "a tap on the big word picks it");
  /* a finger dragged down turns the menu back; let go and it settles on a whole item */
  listeners.pointerdown(ev(60));
  for (let y = 60; y <= 340; y += 10) { listeners.pointermove(ev(y)); settle(); }
  listeners.pointerup(ev(340)); settle();
  assert.equal(m.index(), 0);
  assert.deepEqual(picks, [2], "a drag never picks");
});

test("the menu draws in the four tones only, and maxScale caps the big word", () => {
  const items = [{ label: "AB" }, { label: "CD" }];
  const heights = {};
  for (const [dpr, maxScale] of [[1, undefined], [1, 3], [2, undefined], [2, 3]]) {
    const f = fake({ dpr });
    f.LoTitle.mount(f.canvas, { art: ART, items, title: { text: "NAME", sub: "sub" }, maxScale });
    f.settle();
    assert.ok(f.palette().every((c) => ["163,173,126", "125,138,88", "74,90,50", "31,42,20"].includes(c)), f.palette().join(" "));
    const paper = f.rowsOf(0).filter((y) => y > 359 * dpr * 0.4);    /* below the name */
    heights[dpr + ":" + (maxScale || "auto")] = paper.length / dpr;
  }
  /* lopix12 capitals are about 9 font pixels tall above the seam: the paper part is under that many scaled pixels */
  assert.ok(heights["1:3"] < heights["1:auto"], JSON.stringify(heights));
  assert.ok(heights["2:3"] < heights["2:auto"], JSON.stringify(heights));
  assert.ok(heights["1:3"] <= 9 * 3 && heights["2:3"] <= 9 * 3, "at most 3 LCD pixels a font pixel: " + JSON.stringify(heights));
});
