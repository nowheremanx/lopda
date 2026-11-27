// registry/apps/rain-station: a save from another version of the story is never written over (#392), the choice and
// title rows (#394, #395, #396) and the end song (#398).
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";
import { boot } from "./app-vm.mjs";

const APP = join(ROOT, "registry/apps/rain-station/index.html");

function bootWith(initial) {
  const on = { press: [], release: [] }, data = JSON.parse(JSON.stringify(initial)), writes = [];
  const pad = {
    lang: "zh", spec: "lopda/1",
    on: (type, f) => { if (on[type]) on[type].push(f); }, off() {}, isDown: () => false,
    load: (k) => Promise.resolve(k in data ? JSON.parse(JSON.stringify(data[k])) : null),
    save: (k, v) => { writes.push(k); data[k] = JSON.parse(JSON.stringify(v)); },
    remove: (k) => { writes.push("-" + k); delete data[k]; },
    exit() {}, sfx() {}, music: { play() {}, stop() {} }, ambience() {}
  };
  const app = boot(APP, { pad, seed: 3 });
  const run = async (n) => { for (let i = 0; i < n; i++) { app.frame(); await app.ctx.get("__yield")(); } };
  const tap = async (b) => { on.press.forEach((f) => f(b)); await run(2); on.release.forEach((f) => f(b)); await run(4); };
  return { app, data, writes, run, tap };
}

test("an older version's position is set aside under story.old before the story starts again", async () => {
  const old = { v: 0, at: 40, flags: { phones: true }, scene: "waiting", stage: { dad: "crouch" } };
  const t = bootWith({ story: old });
  await t.run(10);
  assert.deepEqual(t.data["story.old"], old);
  await t.tap("a");
  await t.run(30);
  assert.equal(t.data.story.v, 1, "the new story saves under its own key");
  assert.deepEqual(t.data["story.old"], old, "the old position is still on disk");
});

test("a newer version's save is left alone: nothing is written while reading", async () => {
  const newer = { v: 2, at: 40, flags: {}, scene: "waiting", stage: {} };
  const t = bootWith({ story: newer });
  await t.run(10);
  assert.equal(t.app.ctx.get("canSave"), false);
  await t.tap("a");
  await t.run(30);
  assert.deepEqual(t.writes, []);
  assert.deepEqual(t.data.story, newer);
});

test("choice and title rows are 44 css px tall at the smallest scale, 8 apart, and inside their boxes (#394)", async () => {
  const t = bootWith({});
  await t.run(10);
  const choiceRow = t.app.ctx.get("choiceRow"), titleRow = t.app.ctx.get("titleRow");
  const PIC_H = t.app.ctx.get("PIC_H"), BOX_Y = t.app.ctx.get("BOX_Y");
  for (const [rows, top, bottom] of [[[choiceRow(0, 2), choiceRow(1, 2)], 0, PIC_H], [[titleRow(0), titleRow(1)], BOX_Y + 1, 143]]) {
    rows.forEach((r) => {
      assert.ok(r.h * 2 >= 44, `row ${JSON.stringify(r)}`);
      assert.ok(r.y >= top && r.y + r.h <= bottom, `row ${JSON.stringify(r)} inside ${top}..${bottom}`);
    });
    assert.ok(rows[1].y - (rows[0].y + rows[0].h) >= 4, "a gap between the rows");
  }
});

test("the title teaches no B: it has none (#395)", async () => {
  for (const initial of [{}, { story: { v: 1, at: 3, flags: {}, scene: null, stage: {} } }]) {
    const t = bootWith(initial);
    await t.run(10);
    const g = t.app.ctx.get("game").g, text = g.text, said = [];
    g.text = function (s) { said.push(String(s)); return text.apply(g, arguments); };
    await t.run(2);
    g.text = text;
    assert.ok(said.length > 0);
    assert.ok(!said.some((s) => /B/.test(s) && !/^[A-Z][a-z]/.test(s)), `title texts: ${said.join(" | ")}`);
  }
});

test("a tap beside a choice's rows picks nothing but answers; the box says to tap a line, and fits (#396)", async () => {
  const t = bootWith({});
  await t.run(10);
  const STORY = t.app.ctx.get("STORY"), at = STORY.findIndex((s) => s.choice);
  const t2 = bootWith({ story: { v: t.app.ctx.get("SAVE_VERSION"), at, flags: {}, scene: null, stage: {} } });
  await t2.run(10);
  await t2.tap("a");                                  /* 继续 */
  await t2.run(40);
  assert.equal(t2.app.ctx.get("cur").kind, "choice");
  const game = t2.app.ctx.get("game"), g = game.g, BOX_Y = t2.app.ctx.get("BOX_Y"), sfx = [];
  const play = game.sfx; game.sfx = (s) => { sfx.push(s); return play.call(game, s); };
  t2.app.pointer("pointerdown", 80, BOX_Y + 14); await t2.run(2); t2.app.pointer("pointerup", 80, BOX_Y + 14); await t2.run(4);
  assert.equal(t2.app.ctx.get("cur").kind, "choice", "still choosing");
  assert.equal(t2.app.ctx.get("S").at, at);
  assert.deepEqual(sfx, ["tick"]);
  for (const lang of ["zh", "en"]) {
    game.lang = lang;
    const text = g.text, said = [];
    g.text = function (s) { said.push(String(s)); return text.apply(g, arguments); };
    await t2.run(1);
    g.text = text;
    const hint = said.filter((s) => /点上面|Tap a line|回看|log/.test(s));
    assert.equal(hint.length, 2, `${lang}: ${said.join(" | ")}`);
    hint.forEach((s) => assert.ok(g.measure(s) <= 156, `${lang} "${s}" is ${g.measure(s)} px`));
  }
});

test("the end song plays on over the title; a new reading stops it (#398)", async () => {
  const t = bootWith({});
  await t.run(10);
  const STORY = t.app.ctx.get("STORY"), end = STORY.findIndex((s) => s.end);
  const t2 = bootWith({ story: { v: t.app.ctx.get("SAVE_VERSION"), at: end, flags: {}, scene: null, stage: {} } });
  const stops2 = [];
  t2.app.ctx.get("PAD").music = { play() {}, stop: () => stops2.push(1) };
  await t2.run(10);
  await t2.tap("a");
  await t2.run(40);
  assert.equal(t2.app.ctx.get("cur").kind, "end");
  const before = stops2.length;
  await t2.run(120);                                 /* past the card's 1.5 s hold */
  await t2.tap("a");
  await t2.run(40);
  assert.equal(stops2.length, before, "going back to the title does not stop the song");
  await t2.tap("a");                                 /* 开始 */
  await t2.run(40);
  assert.ok(stops2.length > before, "a new reading stops it");
});
