// registry/apps/rain-station: a save from another version of the story is never written over (#392).
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
