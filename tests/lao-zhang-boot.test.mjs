// registry/apps/lao-zhang in a loose fake DOM (tests/dom-vm.mjs): a press on the title before the saves
// are read must not start a run over the one on disk (#343).
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync } from "node:fs";
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

function newRun() {
  const on = {}, saves = [];
  const pad = {
    lang: "zh", spec: "lopda/1", on: (t, f) => { (on[t] = on[t] || []).push(f); }, off() {}, isDown: () => false,
    load: () => Promise.resolve(null), save: (k, v) => saves.push([k, v]), setSchema() {}, remove() {}, exit() {}, sfx() {},
    music: { play() {}, stop() {} }
  };
  const t = bootDom(APP, { pad, seed: 2 });
  const press = (b) => { (on.press || []).forEach((f) => f(b)); t.advance(20); };
  return { t, press, saves };
}

test("lao-zhang: START on the pause page resumes, wherever the cursor is (#344)", async () => {
  const { t, press } = newRun();
  t.advance(20);
  await settle();
  t.advance(20);
  press("a");                                       /* a new game: level 1 */
  t.advance(500);
  assert.equal(t.els.ov.hidden, true, "the game is playing");
  press("start");                                   /* pause */
  assert.equal(t.els.ov.hidden, false, "the pause page is open");
  press("down");                                    /* the cursor on 回到主菜单 */
  press("start");
  assert.equal(t.els.ov.hidden, true, "START left the game instead of resuming it");
  assert.doesNotMatch(String(t.els.ov.innerHTML), /class="sbody title/, "the title is showing");
});

test("lao-zhang: no canvas is drawn onto another canvas (Safari swaps red and blue on that path, #346)", () => {
  const code = readFileSync(APP, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /\.drawImage\(/, "use putImageData into the target canvas instead");
});
