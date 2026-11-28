// 山脚小馆 on lo-game 1.5.0's fill layout: the diner's wall, shelf and floor cover a tall phone
// edge to edge at the five sizes of sdk/UI.md 13, a press in that scenery does nothing, and fill
// off still contains the 216 x 240 world.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readJSON, runScript } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const LoGame = runScript("sdk/lo-game.js").LoGame;
const APP = join(ROOT, "registry/apps/shanjiao-diner/index.html");
const SRC = join(ROOT, "registry/apps/shanjiao-diner/src");
const SIZES = [[331, 359], [346, 518], [386, 606], [348, 323], [386, 738]];
const W = 216, H = 240;
const TONES = [[0x1f, 0x2a, 0x14], [0x4a, 0x5a, 0x32], [0x7d, 0x8a, 0x58], [0xa3, 0xad, 0x7e]];
function toneAt(img, x, y) {
  const o = (y * img.width + x) * 4, d = img.data;
  for (let i = 0; i < 4; i++) if (d[o] === TONES[i][0] && d[o + 1] === TONES[i][1] && d[o + 2] === TONES[i][2]) return i;
  throw new Error(`pixel ${x},${y} is not one of the four tones`);
}

test("shanjiao fill: the canvas covers the stage edge to edge at every size", () => {
  for (const [sw, sh] of SIZES) {
    const L = LoGame.fillLayout(sw, sh, W, H);
    assert.ok(L.w * L.k >= sw - 1e-9, `${sw}x${sh}: ${L.w}x${L.k} is narrower than the stage`);
    assert.ok(L.h * L.k >= sh - 1e-9, `${sw}x${sh}: ${L.h}x${L.k} is shorter than the stage`);
    assert.ok(L.w * L.k - sw < L.k, `${sw}x${sh}: ${L.w * L.k - sw} css px of stage uncovered`);
    assert.ok(L.h * L.k - sh < L.k, `${sw}x${sh}: ${L.h * L.k - sh} css px of stage uncovered`);
    assert.ok(L.x >= 0 && L.y >= 0 && L.x + W <= L.w && L.y + H <= L.h, `${sw}x${sh}: the world is cut`);
    assert.equal(L.x, Math.floor((L.w - W) / 2), `${sw}x${sh}: the world is not centred across`);
    assert.equal(L.y, Math.floor((L.h - H) / 2), `${sw}x${sh}: the world is not centred down`);
  }
});

test("shanjiao fill: fill off still contains the world, at dpr 1 and 3", () => {
  for (const dpr of [1, 3]) for (const [sw, sh] of SIZES) {
    const c = LoGame.containLayout(sw, sh, W, H, dpr);
    assert.ok(c.k <= Math.min(sw / W, sh / H) + 1e-9, `${sw}x${sh} dpr ${dpr}: contain grew past the stage`);
    assert.ok(c.w <= sw + 1e-9 && c.h <= sh + 1e-9, `${sw}x${sh} dpr ${dpr}: contain overflows`);
    assert.ok(c.w >= W * c.k - 1 && c.h >= H * c.k - 1, `${sw}x${sh} dpr ${dpr}: the world is squeezed`);
  }
});

test("shanjiao fill: the app asks lo-game for the fill screen and keeps its 216 x 240 world", () => {
  assert.equal(readJSON("registry/apps/shanjiao-diner/manifest.json").version, "0.1.7");
  const main = readFileSync(join(SRC, "00-main.js"), "utf8");
  assert.match(main, /LoGame\.create\(\{[\s\S]*fill: true[\s\S]*bands:/);
  assert.match(main, /width: 216, height: 240/);
  assert.ok(readFileSync(join(SRC, "26-bands.js"), "utf8").includes("function paintBands"));
  const html = readFileSync(APP, "utf8");
  assert.match(html, /data-lo-game="1\.5\.0"/);
});

/* one run of the app with a fake PAD and a manual clock */
function harness(sw, sh, lang) {
  const on = { press: [], release: [] }, down = new Set();
  let image = null;
  const pad = {
    lang: lang || "zh", spec: "lopda/1",
    on: (type, fn) => { if (on[type]) on[type].push(fn); }, off() {},
    isDown: (b) => down.has(b),
    load: () => Promise.resolve(null), save() {}, remove() {}, exit() {}, sfx() {},
    music: { play() {}, stop() {} }, ambience() {}
  };
  const app = boot(APP, { pad, seed: 5, stage: { w: sw, h: sh }, onPut: (img) => { image = img; } });
  const frame = async (n) => { for (let i = 0; i < n; i++) { app.frame(); await app.ctx.get("__yield")(); } };
  return { app, game: app.ctx.get("game"), frame, image: () => image };
}
/* a fresh morning without the story overlay, so the scene itself is drawn */
async function at(h, scene) {
  const c = (n) => h.app.ctx.get(n);
  c('(S = fresh(), startDay(1), S.seen.intro = 1, S)');
  await h.frame(2);
  const game = h.game, S = c("S");
  if (scene === "morning") await game.go("morning", null, { fade: false });
  else if (scene === "prep") {
    S.ingredients = { mushroom: 9, herb: 9, fish: 9, meat: 9, rice: 9, bamboo: 9, chili: 9 };
    await game.go("prep", null, { fade: false });
  } else if (scene === "shop") { S.money = 500; S.rep = 6; await game.go("shop", null, { fade: false }); }
  else if (scene === "service") {
    S.menu = ["mushroom_soup", "pork"]; S.stock = { mushroom_soup: 5, pork: 5 }; S.flags.prepared = 1;
    await game.go("service", null, { fade: false });
    await h.frame(6);
    const SERV = c("SERV");
    for (let i = 0; i < 2; i++) {
      const guest = c("makeCustomer")(S.menu[i], null, null, true);
      SERV.customers.push(guest); c("seatCustomer")(guest, i);
    }
  } else if (scene === "codex") { await game.go("morning", null, { fade: false }); game.push("codex", { from: "morning" }); }
  else if (scene === "battle") game.push("battle", { enemy: "boar", from: "forest" });
  else if (scene === "night") {
    S.phase = "night";
    S.lastLedger = { served: 3, lost: 0, earned: 60, tips: 5, repDelta: 1, satisfied: 2, leftover: 1, rentDone: 1 };
    await game.go("night", null, { fade: false });
  } else if (scene === "ending") { S.day = 7; S.stats = { served: 60, earned: 900 }; await game.go("ending", null, { fade: false }); }
  else if (scene === "forest") await game.go("forest", null, { fade: false });
  await h.frame(10);
}
/* every pixel outside the world's rect, and the rows that sit clear of it */
function bandPixels(img, st) {
  const tones = new Set();
  let paper = 0, total = 0;
  for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
    if (x >= st.x && x < st.x + W && y >= st.y && y < st.y + H) continue;
    const t = toneAt(img, x, y);
    tones.add(t); total++;
    if (t === 3) paper++;
  }
  return { tones, paper, total };
}
/* the band rows above and below the world (none when the stage is shorter than the world's shape) */
function outsideRows(img, st) {
  const rows = [];
  for (let y = 0; y < st.h; y++) {
    if (y >= st.y && y < st.y + H) continue;
    let paper = 0, total = 0;
    for (let x = 0; x < st.w; x++) {
      total++;
      if (toneAt(img, x, y) === 3) paper++;
    }
    rows.push({ y, paper, total });
  }
  return rows;
}
function sideTones(img, st) {
  const tones = new Set();
  for (let y = st.y; y < st.y + H; y++) for (let x = 0; x < st.w; x++) {
    if (x >= st.x && x < st.x + W) continue;          /* the world's own columns */
    tones.add(toneAt(img, x, y));
  }
  return tones;
}
/* a tap at stage-canvas pixel (sx, sy), in CSS pixels of the fake stage */
function tapAt(h, type, sx, sy) {
  const k = h.game.stage.k;
  h.app.pointer(type, sx, sy, W, H, { k });
}

test("shanjiao fill: every screen fills the phone at the five sizes with the diner around it", async () => {
  const screens = ["title", "morning", "prep", "shop", "battle", "service", "codex", "night", "ending", "forest"];
  for (const [sw, sh] of SIZES) {
    for (const scene of screens) {
      const h = harness(sw, sh);
      await h.frame(10);                                  /* boot to the title */
      if (scene !== "title") await at(h, scene);
      const st = h.game.stage, want = LoGame.fillLayout(sw, sh, W, H);
      assert.equal(h.game.width, W);
      assert.equal(h.game.height, H);
      for (const key of ["w", "h", "k", "x", "y"]) assert.equal(st[key], want[key], `${sw}x${sh} ${scene}: another ${key}`);
      assert.ok(st.w * st.k >= sw - 1e-9 && st.h * st.k >= sh - 1e-9, `${sw}x${sh} ${scene}: stage uncovered`);

      const img = h.image(), pix = bandPixels(img, st);
      assert.ok(pix.total >= W * 2, `${sw}x${sh} ${scene}: no bands at all`);
      /* the scenery is painted, not the canvas's bare clear tone */
      if (pix.total >= 12) assert.ok(pix.tones.size >= 2, `${sw}x${sh} ${scene}: the bands are one flat tone`);
      assert.ok(pix.paper < pix.total, `${sw}x${sh} ${scene}: the bands are untouched paper`);
      /* the room's bands are a wooden frame: a band row over or under the world
         always has wood in it, never a row left as bare paper */
      if (["morning", "prep", "shop", "service", "codex", "night"].includes(scene)) {
        const bare = outsideRows(img, st).find((r) => r.paper === r.total);
        assert.equal(bare, undefined, `${sw}x${sh} ${scene}: a bare paper band row at y=${bare ? bare.y : "?"}`);
      }
      if (st.x > 0) {
        const sides = sideTones(img, st);
        assert.ok(sides.size >= 2, `${sw}x${sh} ${scene}: the side bands are one flat tone`);
        if (["morning", "prep", "shop", "service", "codex", "night"].includes(scene)) {
          assert.ok(sides.has(0), `${sw}x${sh} ${scene}: the side bands have no timber frame`);
        }
      }
    }
  }
});

test("shanjiao fill: a press in the scenery is inert on the title, in prep and in battle", async () => {
  /* the title at the short stage: a side-band press at the menu's own height
     (y 200) must not move or leave the title, and the same height inside the
     world still does (131 is 说明's centre) */
  const t = harness(348, 323);
  await t.frame(12);
  assert.equal(t.app.ctx.get("TITLE_SEL"), 0);
  const title = t.game.top();
  assert.ok(t.game.stage.x >= 6, "the short stage should grow side bands");
  tapAt(t, "pointerdown", 6, 200);
  await t.frame(1);
  tapAt(t, "pointerup", 6, 200);
  await t.frame(20);
  assert.equal(t.app.ctx.get("TITLE_SEL"), 0, "a side-band tap moved the title's selection");
  assert.equal(t.game.top(), title, "a side-band tap left the title");
  assert.equal(t.app.ctx.get("S"), null, "a side-band tap started a game");
  tapAt(t, "pointerdown", 131, 205);
  await t.frame(1);
  tapAt(t, "pointerup", 131, 205);
  await t.frame(40);
  assert.equal(t.app.ctx.get("TITLE_SEL"), 1, "a world tap at the menu's height no longer selects");
  assert.notEqual(t.game.top(), title, "a world tap at the menu's height no longer acts");

  /* prep: the footer's A hint runs to the world's bottom edge, so a tap in the
     bottom band lands on the last world row: it must not cook the menu */
  const p = harness(346, 518);
  await p.frame(10);
  await at(p, "prep");
  const S = p.app.ctx.get("S");
  p.app.ctx.get("(PREP_PLAN = { mushroom_soup: 1 }, PREP_SEL = 0)");
  await p.frame(2);
  const ap = S.ap;
  tapAt(p, "pointerdown", 108, p.game.stage.y + H + 4);
  await p.frame(1);
  tapAt(p, "pointerup", 108, p.game.stage.y + H + 4);
  await p.frame(10);
  assert.equal(S.ap, ap, "a band tap spent an action");
  assert.ok(!S.flags.prepared, "a band tap cooked the menu");

  /* battle: a press on the scenery over an ended fight must not close it */
  const b = harness(346, 518);
  await b.frame(10);
  await at(b, "battle");
  const B = b.app.ctx.get("B"), fight = b.game.top();
  B.mode = "end"; B.result = "win"; B.msg = "赢了！";
  await b.frame(2);
  tapAt(b, "pointerdown", 100, b.game.stage.y + H + 4);
  await b.frame(1);
  tapAt(b, "pointerup", 100, b.game.stage.y + H + 4);
  await b.frame(6);
  assert.equal(b.game.top(), fight, "a band tap left the battle");
  /* the same tap inside the world is still a press */
  tapAt(b, "pointerdown", 100, b.game.stage.y + 120);
  await b.frame(1);
  tapAt(b, "pointerup", 100, b.game.stage.y + 120);
  await b.frame(6);
  assert.notEqual(b.game.top(), fight, "a world tap no longer closes the ended fight");
});

test("shanjiao fill: a pushed event paints its own background's bands, not the diner behind it", async () => {
  const h = harness(386, 738);
  await h.frame(10);
  const c = (n) => h.app.ctx.get(n);
  /* src/58-event.js: ART.eventBg's forest and deep ARE ART.battleBg, and its
     shop/dawn is the diner after dark */
  const kind = (bg) => c(`(bandScreen = "event", EVENT_ARGS = { bg: "${bg}" }, bandKind())`);
  assert.equal(kind("forest"), "battle");
  assert.equal(kind("deep"), "battle");
  assert.equal(c('(bandScreen = "event", EVENT_ARGS = { bg: "deep" }, bandsDeep())'), true);
  assert.equal(c('(bandScreen = "event", EVENT_ARGS = { bg: "forest" }, bandsDeep())'), false);
  assert.equal(kind("shop"), "night");
  assert.equal(kind("dawn"), "night");

  /* draw the day-3 forest story and look: the bands are the fight's sky and
     stage (mid, paper, dark), with none of the room's beam or posts (ink) */
  c('(S = fresh(), startDay(3), S.seen.intro = 1, S.ph' + "ase = 'morning')");
  await h.frame(2);
  h.game.go("event", { who: "yan", bg: "forest", pages: ["后山那头山猪，最近总来拱我的陷阱。"] }, { fade: false });
  await h.frame(8);
  const st = h.game.stage, pix = bandPixels(h.image(), st);
  assert.ok(c("bandScreen") === "event", "the event overlay should be on screen");
  assert.ok(pix.tones.has(2) && !pix.tones.has(0), "the forest event's bands should be the fight's mountain");
});

test("shanjiao fill: the touch helpers ask the world before the scenery", () => {
  const ui = readFileSync(join(SRC, "30-ui.js"), "utf8");
  assert.match(ui, /function tapWorld\(\)/);
  assert.match(ui, /p\.stageX >= s\.x/);
  assert.match(ui, /function tapX\(\) \{ return game\.pointer\.x; \}/);
  /* one place reads the pointer: every other screen goes through tapInside,
     tapRow, tapWorld or tapX/tapY, so a press in a band cannot be acted on */
  for (const file of ["00-main.js", "50-title.js", "52-prep.js", "54-battle.js", "55-service.js",
    "56-night.js", "57-shop.js", "59-ending.js", "59b-codex.js"]) {
    const src = readFileSync(join(SRC, file), "utf8");
    assert.ok(!/game\.pointer/.test(src), `${file} reads game.pointer directly`);
  }
});
