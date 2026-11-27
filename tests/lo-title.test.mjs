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

/* ---------- the wheel, on a fake canvas ---------- */
function fake() {
  const listeners = {}, frames = [];
  const canvas = {
    width: 0, height: 0, style: {}, isConnected: true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 331, height: 359 }),
    getContext: () => ({ createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }),
    addEventListener: (type, f) => { listeners[type] = f; }, setPointerCapture() {}
  };
  const ctx = runScript("sdk/lo-title.js", {
    devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, atob: (s) => Buffer.from(s, "base64").toString("binary"),
    requestAnimationFrame: (f) => { frames.push(f); return frames.length; }, cancelAnimationFrame() {}
  });
  const font = JSON.parse(readFileSync(join(import.meta.dirname, "..", "sdk", "fonts", "lopix12.json"), "utf8"));
  ctx.LoTitle.font(font);
  const settle = () => { let t = 0; while (frames.length) { t += 50; frames.shift()(t); } };
  return { canvas, listeners, LoTitle: ctx.LoTitle, settle };
}

test("the wheel: up and down roll and stop at the ends, A picks, a tap on a small item rolls to it, a tap on the band picks", () => {
  const { canvas, listeners, LoTitle, settle } = fake();
  const moves = [], picks = [];
  const art = { w: 4, h: 4, px: new Uint8Array(16).fill(3) };
  const m = LoTitle.mount(canvas, { art, items: [{ label: "A" }, { label: "B", sub: "b" }, { label: "C", locked: true }], index: 1,
    hint: "keys", onMove: (i) => moves.push(i), onPick: (i) => picks.push(i) });
  assert.equal(canvas.width, 331);
  assert.equal(m.index(), 1);
  m.press("down"); settle();
  m.press("down"); settle();                        /* already at the end: nothing */
  assert.deepEqual(moves, [2]);
  m.press("a");
  assert.deepEqual(picks, [2], "a locked item is still picked: the app says why");
  m.press("up"); m.press("up"); settle();
  assert.equal(m.index(), 0);
  /* taps from the top down: the first that moves the wheel lands on the small item under the band */
  const ev = (y) => ({ clientY: y, pointerId: 1 });
  for (let y = 200; y < 359 && m.index() === 0; y += 2) { listeners.pointerdown(ev(y)); listeners.pointerup(ev(y)); settle(); }
  assert.equal(m.index(), 1, "a tap under the band rolls one item down");
  const before = picks.length;
  for (let y = 100; y < 359; y += 2) { listeners.pointerdown(ev(y)); listeners.pointerup(ev(y)); settle(); if (picks.length > before) break; }
  assert.equal(picks[picks.length - 1], m.index(), "a tap on the band picks the item in it");
});
