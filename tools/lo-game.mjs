#!/usr/bin/env node
// Copies sdk/lo-game.js into every app that asks for it, and adds a pixel-font block holding
// only the characters the app uses (lopix12, SIL OFL 1.1, see sdk/fonts/LICENSE-lopix12.txt).
// An app asks with an empty block:  <script data-lo-game="1.1.0"></script>
// Run it again whenever the app's text changes, so new characters get their glyphs.
// Usage: node tools/lo-game.mjs registry/apps/<id> [more dirs...]
//        node tools/lo-game.mjs --hash     (print the version and hash of sdk/lo-game.js)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LIB, LIB_VERSION, build, sha } from "./lo-game-lib.mjs";

if (!LIB_VERSION) { console.error("sdk/lo-game.js has no VERSION"); process.exit(2); }
if (/<\/script/i.test(LIB)) { console.error("sdk/lo-game.js must not contain </script"); process.exit(2); }
const args = process.argv.slice(2);
if (args[0] === "--hash") { console.log(LIB_VERSION, sha(LIB)); process.exit(0); }
if (!args.length) { console.error("usage: node tools/lo-game.mjs registry/apps/<id> [...]"); process.exit(2); }
let failed = 0;
for (const dir of args) {
  const file = join(dir, "index.html");
  const out = build(readFileSync(file, "utf8"));
  if (out === null) { console.log(`skip  ${dir}: no <script data-lo-game> block`); failed++; continue; }
  writeFileSync(file, out);
  const n = (out.match(/LoGame\.font\((.*)\);/) || [])[1];
  console.log(`ok    ${dir}: lo-game ${LIB_VERSION}, ${n ? Object.keys(JSON.parse(n).glyphs).length : 0} glyphs`);
}
process.exit(failed ? 1 : 0);
