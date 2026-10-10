// sdk/lo-game.js and tools/lo-game.mjs: the release bookkeeping, the build, and the pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, read, readJSON, runScript, tool, copyApp } from "./helpers.mjs";
import { LIB, LIB_VERSION, LIB_BLOCK, FONT_BLOCK, build, fontBlock, appText, sha } from "../tools/lo-game-lib.mjs";

const APPS = readdirSync(join(ROOT, "registry", "apps")).map((id) => join(ROOT, "registry", "apps", id));
const lib = (globals) => runScript("sdk/lo-game.js", globals).LoGame;
const LoGame = lib();

test("the current lo-game.js is a released version", () => {
  const versions = readJSON("sdk/lo-game.versions.json");
  assert.match(LIB_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(versions[LIB_VERSION], sha(LIB), "bump VERSION and add the new hash to sdk/lo-game.versions.json");
  assert.equal(LoGame.VERSION, LIB_VERSION);
  assert.match(LIB, new RegExp("lo-game\\.js " + LIB_VERSION.replace(/\./g, "\\.")), "header comment names the version");
});

test("lo-game.js can sit inside a script tag", () => {
  assert.doesNotMatch(LIB, /<\/script/i);
});

test("the docs and templates ask for the current version", () => {
  const want = `data-lo-game="${LIB_VERSION}"`;
  assert.ok(read("sdk/template-game/index.html").includes(want), "sdk/template-game");
  assert.ok(read("CLAUDE.md").includes(want), "CLAUDE.md");
});

test("registry games are already built: running the tool changes nothing", () => {
  let games = 0;
  for (const dir of APPS) {
    const html = readFileSync(join(dir, "index.html"), "utf8");
    if (!LIB_BLOCK.test(html)) continue;
    games++;
    assert.equal(build(html), html, `${dir}: run node tools/lo-game.mjs ${dir}`);
  }
  assert.ok(games > 0);
});

test("build fills the block, adds a font block, and is idempotent", () => {
  const app = '<body><script data-lo-game="1.0.0"></script>\n<script>game.text("你好 OK");</script></body>';
  const once = build(app);
  assert.ok(once.includes(`<script data-lo-game="${LIB_VERSION}">\n${LIB}</script>`));
  assert.ok(once.indexOf("data-lo-font") > once.indexOf("data-lo-game"));
  assert.equal(build(once), once);
  assert.equal(build("<p>no block</p>"), null);
});

test("the font block holds the app's own characters plus printable ASCII, and nothing else", () => {
  const font = JSON.parse(read("sdk/fonts/lopix12.json"));
  const html = build('<script data-lo-game=""></script><script>T({zh: "小院", en: "Yard"});</script>');
  const glyphs = Object.keys(JSON.parse(html.match(/LoGame\.font\((.*)\);/)[1]).glyphs);
  assert.ok(glyphs.includes("小") && glyphs.includes("院"));
  for (let c = 32; c < 127; c++) if (font.glyphs[String.fromCharCode(c)]) assert.ok(glyphs.includes(String.fromCharCode(c)));
  assert.ok(!glyphs.includes("龙"), "only the glyphs the app uses");
  /* the library's own text does not count toward the subset */
  assert.equal(appText(html).includes("var VERSION"), false);
  assert.equal(fontBlock(html), html.match(FONT_BLOCK)[0].replace(/^\n/, ""));
  assert.ok(html.includes("SIL Open Font License") || html.includes("OFL"), "keeps the font licence notice");
});

test("the tool rewrites an app in place and reports a folder without a block", (t) => {
  const dir = copyApp(t, "sdk/template-game", "my-game");
  const r = tool("lo-game.mjs", dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`ok .*lo-game ${LIB_VERSION.replace(/\./g, "\\.")}, \\d+ glyphs`));
  const after = readFileSync(join(dir, "index.html"), "utf8");
  assert.equal(build(after), after);

  const plain = copyApp(t, "sdk/template", "my-app");
  const r2 = tool("lo-game.mjs", plain);
  assert.equal(r2.code, 1);
  assert.match(r2.out, /no data-src, data-lo-3d or data-lo-game block/);
});

test("--hash prints the version and hash", () => {
  assert.match(tool("lo-game.mjs", "--hash").out, new RegExp(`^lo-game ${LIB_VERSION} ${sha(LIB)}$`, "m"));
});

test("an edited lo-game copy or font block is rejected by the checker", (t) => {
  const dir = copyApp(t, "sdk/template-game", "my-game");
  tool("lo-game.mjs", dir);
  const file = join(dir, "index.html"), good = readFileSync(file, "utf8");
  writeFileSync(file, good.replace("var INK = 0", "var INK = 0 /* mine */"));
  assert.match(tool("check-app.mjs", dir).out, /differs from every released version/);
  writeFileSync(file, good.replace('"cell":', '"evil":1,"cell":'));
  assert.match(tool("check-app.mjs", dir).out, /lo-font block is out of date or was edited/);
  writeFileSync(file, good.replace("</body>", "<p>新字</p></body>"));
  assert.match(tool("check-app.mjs", dir).out, /lo-font block is out of date/);
});

/* ---------------- pure helpers ---------------- */

test("t() picks PAD.lang, falls back to zh, then whatever was written", () => {
  const text = { zh: "你好 {n}", en: "Hello {n}" };
  assert.equal(LoGame.t(text, { n: 1 }), "你好 1", "no PAD: zh");
  assert.equal(lib({ PAD: { lang: "en" } }).t(text, { n: 2 }), "Hello 2");
  assert.equal(lib({ PAD: { lang: "fr" } }).t(text), "你好 {n}");
  assert.equal(lib({ PAD: { lang: "zh" } }).t({ en: "only en" }), "only en");
  assert.equal(lib({ PAD: { lang: "en" } }).t({ zh: "只有中文" }), "只有中文");
  assert.equal(LoGame.t("plain {x}", { x: "y" }), "plain y");
  assert.equal(LoGame.t(null), "");
});

test("rng is deterministic per seed and stays in range", () => {
  const a = LoGame.rng(42), b = LoGame.rng(42), c = LoGame.rng(43);
  const seq = (r) => Array.from({ length: 20 }, () => r.next());
  const sa = seq(a);
  assert.deepEqual(sa, seq(b));
  assert.notDeepEqual(sa, seq(c));
  assert.ok(sa.every((v) => v >= 0 && v < 1));
  const r = LoGame.rng(0), seen = new Set();
  for (let i = 0; i < 500; i++) { const n = r.int(1, 6); assert.ok(n >= 1 && n <= 6 && Number.isInteger(n)); seen.add(n); }
  assert.equal(seen.size, 6, "seed 0 still works and covers the range");
  assert.ok(["x", "y"].includes(r.pick(["x", "y"])));
  assert.equal(r.chance(0), false);
  assert.equal(r.chance(1), true);
});

test("clamp, lerp, approach", () => {
  assert.equal(LoGame.clamp(5, 0, 3), 3);
  assert.equal(LoGame.clamp(-1, 0, 3), 0);
  assert.equal(LoGame.lerp(10, 20, 0.25), 12.5);
  assert.equal(LoGame.approach(0, 10, 3), 3);
  assert.equal(LoGame.approach(9, 10, 3), 10);
  assert.equal(LoGame.approach(10, 0, 4), 6);
  assert.equal(LoGame.approach(1, 0, 4), 0);
});

test("sprite parses tones and transparency, and rejects ragged rows", () => {
  const s = LoGame.sprite(["0123", "..3."]);
  assert.equal(s.w, 4); assert.equal(s.h, 2);
  assert.deepEqual([...s.px], [0, 1, 2, 3, 255, 255, 3, 255]);
  assert.throws(() => LoGame.sprite(["00", "0"]), /row 1 is 1 wide, expected 2/);
  assert.throws(() => LoGame.sprite([]), /array of strings/);
  assert.deepEqual(Object.keys(LoGame.sprites({ a: ["0"], b: ["1"] })), ["a", "b"]);
});

test("tilemap lookups, solids, edits and bounds", () => {
  const m = LoGame.tilemap({ map: ["####", "#.k#", "####"], size: 8, solid: "#" });
  assert.equal(m.cols, 4); assert.equal(m.rows, 3);
  assert.equal(m.width, 32); assert.equal(m.height, 24);
  assert.equal(m.get(2, 1), "k");
  assert.equal(m.get(9, 9), null);
  assert.equal(m.solid(0, 0), true);
  assert.equal(m.solid(1, 1), false);
  assert.equal(m.solid(-1, 0), true, "outside the map is a wall");
  assert.deepEqual(Array.from(m.find("k"), (p) => [p.x, p.y]), [[2, 1]]);
  m.set(2, 1, ".");
  assert.equal(m.find("k").length, 0);
  m.set(99, 0, "k");
  assert.equal(m.find("k").length, 0);
  assert.deepEqual({ ...m.at(17, 9) }, { x: 2, y: 1 });
  assert.throws(() => LoGame.tilemap({ map: ["##", "#"] }), /row 1 is 1 wide/);
});

test("camera centres on the target inside the world, and centres a small world", () => {
  assert.deepEqual({ ...LoGame.camera(80, 72, 160, 128, 320, 256) }, { x: 0, y: 8 });
  assert.deepEqual({ ...LoGame.camera(0, 0, 160, 128, 320, 256) }, { x: 0, y: 0 });
  assert.deepEqual({ ...LoGame.camera(999, 999, 160, 128, 320, 256) }, { x: 160, y: 128 });
  assert.deepEqual({ ...LoGame.camera(10, 10, 160, 128, 100, 100) }, { x: -30, y: -14 });
});

test("lo-game's tones are the four palette tones", () => {
  assert.deepEqual([...LoGame.TONES], ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"]);
  assert.deepEqual([LoGame.INK, LoGame.DARK, LoGame.MID, LoGame.PAPER], [0, 1, 2, 3]);
});
