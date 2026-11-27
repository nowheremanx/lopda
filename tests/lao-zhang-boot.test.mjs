// registry/apps/lao-zhang in a loose fake DOM (tests/dom-vm.mjs): a press on the title before the saves
// are read must not start a run over the one on disk (#343).
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";
import { bootDom } from "./dom-vm.mjs";

const APP = join(ROOT, "registry/apps/lao-zhang/index.html");
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

test("lao-zhang: A on the title waits for the saves, then continues the run on disk", async () => {
  const on = {}, saves = [], pending = {};
  const pad = {
    lang: "zh", spec: "lopda/1", on: (t, f) => { (on[t] = on[t] || []).push(f); }, off() {}, isDown: () => false,
    load: (k) => new Promise((resolve) => { pending[k] = resolve; }),
    save: (k, v) => saves.push([k, JSON.parse(JSON.stringify(v))]), setSchema() {}, remove() {}, exit() {}, sfx() {},
    music: { play() {}, stop() {} }
  };
  const t = bootDom(APP, { pad, seed: 2 });
  const press = (b) => { (on.press || []).forEach((f) => f(b)); t.advance(20); };
  t.advance(20);
  press("a");                                       /* before either save is back */
  t.advance(500);
  assert.deepEqual(saves.filter((s) => s[0] === "run"), [], "no run is written before the saves are read");

  pending.best({ v: 1, level: 3, bank: 900 });
  pending.run({ v: 1, level: 4, bank: 1200, dynamite: 1, strength: 0, clover: 0, book: 0, runSeed: 77 });
  await settle();
  t.advance(20);
  press("a");                                       /* the cursor is on 继续 now */
  t.advance(500);
  const runs = saves.filter((s) => s[0] === "run");
  assert.ok(runs.length >= 1, "continuing writes the run");
  assert.ok(runs.every((s) => s[1].level === 4), `a run other than the saved one was written: ${JSON.stringify(runs)}`);
});
