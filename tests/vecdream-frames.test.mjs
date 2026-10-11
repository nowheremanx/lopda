// registry/apps/vector-dream is finished: its picture must never change. This boots the bundled app, plays the
// 145-frame script of tests/frame-hashes.mjs (three scenes, solid and wireframe, zoom and turning) and compares
// the hash of every frame with tests/fixtures/vecdream-frames.json.
// If a change to lo-3d or the app is meant to alter the picture, regenerate the fixture and say why in the PR:
//   node tests/frame-hashes.mjs registry/apps/vector-dream/index.html
// and write its "vecdream" array into the fixture, one hash per line. Otherwise a failure here is a regression.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers.mjs";
import { vecdream } from "./frame-hashes.mjs";

test("VecDream draws the same 145 frames as when it was finished", () => {
  const want = JSON.parse(readFileSync(join(ROOT, "tests", "fixtures", "vecdream-frames.json"), "utf8"));
  const got = vecdream(join(ROOT, "registry", "apps", "vector-dream", "index.html")).vecdream;
  assert.equal(want.length, 145);
  const bad = want.findIndex((h, i) => h !== got[i]);
  assert.ok(bad < 0, `VecDream frame ${bad} differs (fixture ${want[bad]}, now ${got[bad]}); its picture must not change`);
  assert.equal(got.length, want.length, `VecDream drew ${got.length} frames, the fixture has ${want.length}`);
});
