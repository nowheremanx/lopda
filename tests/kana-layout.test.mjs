// Kana (registry/apps/kana-cards) layout: the pure numbers in src/layout.js.
// The app and this test run the same file. The quick screenshots in sdk/UI.md 12 are the other half:
// this holds the arithmetic (cover at whole picture pixels, a table row never under 44, the home
// stack inside the stage), the e2e test holds the rendered boxes at both phone sizes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJSON, runScript } from "./helpers.mjs";

const Layout = runScript("registry/apps/kana-cards/src/layout.js").KanaLayout;
const SIZES = [[331, 359], [346, 518], [386, 606], [386, 738]];
const ART = Layout.ART;

/* header, main padding, the guide row, the rows with their gaps, the streak, the gaps, and the
   cover: beside the rows on a short screen (the 459 px breakpoint), above them on a tall one */
function homeStack(m) {
  const chrome = 56 + 12 + 18 + 18;
  if (m.h <= 459) return chrome + m.gap + Math.max(m.cover, m.row * 3 + m.gap * 2) + m.gap;
  return chrome + m.gap * 4 + m.row * 3 + m.cover;
}

test("layout: the smallest screen keeps the 160 cover, the four-tone art at 1x, and fits", () => {
  const m = Layout.metrics(331, 359);
  assert.equal(m.content, 307, "the column uses the width the 10 px padding leaves");
  assert.equal(m.cover, 160, "2x would not leave room for the three rows on this screen");
  assert.equal(m.scale, 1);
  assert.equal(m.row, 44, "the minimum touch target");
  assert.equal(m.gap, 5);
  assert.equal(m.cell, 58, "a table cell a little taller than the old 56");
  assert.ok(m.cell >= 56 && m.kana >= 25, "the table keeps its kana readable");
  assert.equal(m.card, 124, "the short screen keeps its short card");
  assert.ok(homeStack(m) <= 359, `the home fits 359 px (${homeStack(m)})`);
  assert.ok(m.content <= 331 - 20, "the column fits inside main's padding");
});

test("layout: the largest screen gives the art 2x and the table the width", () => {
  const m = Layout.metrics(386, 738);
  assert.equal(m.content, 362, "the column grows past 300, short of the 520 cap");
  assert.equal(m.cover, 320, "whole picture pixels: 2 x 160");
  assert.equal(m.scale, 2);
  assert.ok(m.cover <= m.content, "the cover never overflows the column");
  assert.ok(m.cover / m.content > 0.85, "the cover is the home's main art, not a stamp");
  assert.equal(m.row, 48);
  assert.ok(m.row >= 44, "rows stay above the touch minimum");
  assert.equal(m.cell, 69, "the table cells follow the wider column");
  assert.ok(m.cell >= 56);
  assert.equal(m.card, 192);
  assert.ok(m.kanaCard > 76 && m.quizKana > 48, "the large screen gets larger kana");
  assert.equal(m.quizRow, 64, "the quiz choices can grow past the touch minimum");
  assert.ok(homeStack(m) <= 738, `the home fits 738 px (${homeStack(m)})`);
});

test("layout: a stage between the two phones still fits its own rows", () => {
  assert.equal(Layout.metrics(346, 518).cover, 160, "518 px cannot hold 160 px of rows under a 2x cover");
  /* 606 px is the largest stage with the pad: a 2x cover would need 608 px, so it keeps 1x */
  assert.equal(Layout.metrics(386, 606).cover, 160, "606 px is 2 px short of a 2x cover");
  assert.equal(Layout.metrics(386, 650).cover, 320, "650 px has the room");
  for (const [w, h] of SIZES) {
    const m = Layout.metrics(w, h);
    assert.equal(m.cover % ART, 0, `${w}x${h}: the art is stretched to ${m.cover}`);
    assert.ok(m.cover <= m.content, `${w}x${h}: the cover overflows the column`);
    assert.ok(m.content <= w - 20, `${w}x${h}: the column overflows main's padding`);
    assert.ok(m.row >= 44 && m.cell >= 44, `${w}x${h}: a target under 44 px`);
    assert.ok(m.gap >= 5 && m.gap <= 12, `${w}x${h}: rows crowd or drift apart (${m.gap})`);
    assert.ok(homeStack(m) <= h, `${w}x${h}: the home needs ${homeStack(m)} px`);
    assert.equal(m.cardW, Math.min(m.content, 420), `${w}x${h}: the card's width`);
  }
});

test("layout: junk sizes fall back to the smallest phone instead of throwing", () => {
  for (const v of [null, undefined, 0, -10, NaN, "331"]) {
    const m = Layout.metrics(v, v);
    assert.equal(m.w, 331);
    assert.equal(m.h, 359);
    assert.ok(m.cover >= ART);
  }
});

test("layout: apply writes every size the stylesheet reads", () => {
  const set = {};
  const doc = { documentElement: { style: { setProperty(k, v) { set[k] = v; } } } };
  Layout.apply(doc, Layout.metrics(386, 738));
  assert.deepEqual(Object.keys(set).sort(), ["--card", "--cardw", "--cell", "--content", "--cover", "--gap",
    "--kana-card", "--kana-cell", "--qcard", "--qkana", "--qrow", "--roma-cell", "--row"]);
  assert.equal(set["--content"], "362px");
  assert.equal(set["--cover"], "320px");
  assert.equal(set["--row"], "48px");
  assert.equal(set["--cell"], "69px");
  /* a document without a style object is ignored, not a crash */
  Layout.apply(null, Layout.metrics(331, 359));
  Layout.apply({}, Layout.metrics(331, 359));
});

test("layout: the app ships 1.7.0 and its bundled page carries this same file", () => {
  assert.equal(readJSON("registry/apps/kana-cards/manifest.json").version, "1.7.0");
  const html = readFileSync(join(ROOT, "registry/apps/kana-cards/index.html"), "utf8");
  const src = readFileSync(join(ROOT, "registry/apps/kana-cards/src/layout.js"), "utf8");
  assert.ok(html.includes(src.trim()), "the src block is filled into index.html");
  /* the 331 x 359 sizes are the stylesheet's defaults, for the first frame before fitLayout runs */
  assert.match(html, /:root \{ --content: 300px; --cardw: 300px; --gap: 6px; --row: 44px; --cover: 160px;/);
  assert.match(html, /#reference \{ grid-template-rows: repeat\(16, var\(--cell\)\); \}/);
});
