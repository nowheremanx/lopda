#!/usr/bin/env node
// THE build command for an app. Fills, in this order:
//   <script data-src="src/x.js"></script>   the app's own source files (src/ folder), verbatim
//   <script data-lo-3d="1.0.0"></script>    sdk/lo-3d.js
//   <script data-lo-game="1.2.0"></script>  sdk/lo-game.js, then a pixel-font block with only the glyphs used
// Run it again whenever src/ or the app's text changes. Re-running is safe (filled blocks are replaced).
// Usage: node tools/bundle-app.mjs registry/apps/<id> [more dirs...]
//        node tools/bundle-app.mjs --hash     (print the version and hash of sdk/lo-3d.js and sdk/lo-game.js)
// tools/lo-game.mjs is the same tool under its old name.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LIB, LIB_VERSION, LIB3D, LIB3D_VERSION, LIB_BLOCK, LIB3D_BLOCK, SRC_BLOCK, build, sha } from "./lo-game-lib.mjs";

const name = process.argv[1].replace(/^.*[\\/]/, "");
if (!LIB_VERSION) { console.error("sdk/lo-game.js has no VERSION"); process.exit(2); }
if (!LIB3D_VERSION) { console.error("sdk/lo-3d.js has no VERSION"); process.exit(2); }
if (/<\/script/i.test(LIB)) { console.error("sdk/lo-game.js must not contain </script"); process.exit(2); }
if (/<\/script/i.test(LIB3D)) { console.error("sdk/lo-3d.js must not contain </script"); process.exit(2); }
const args = process.argv.slice(2);
if (args[0] === "--hash") {
  console.log("lo-game", LIB_VERSION, sha(LIB));
  console.log("lo-3d", LIB3D_VERSION, sha(LIB3D));
  process.exit(0);
}
if (!args.length) { console.error(`usage: node tools/${name} registry/apps/<id> [...]`); process.exit(2); }
let failed = 0;
for (const dir of args) {
  const file = join(dir, "index.html");
  const html = readFileSync(file, "utf8");
  let out;
  try { out = build(html, dir); } catch (e) { console.log(`error ${dir}: ${e.message}`); failed++; continue; }
  if (out === null) { console.log(`skip  ${dir}: no data-src, data-lo-3d or data-lo-game block`); failed++; continue; }
  writeFileSync(file, out);
  const did = [];
  const nSrc = (html.match(new RegExp(SRC_BLOCK.source, "g")) || []).length;
  if (nSrc) did.push(`${nSrc} src file${nSrc > 1 ? "s" : ""}`);
  if (LIB3D_BLOCK.test(html)) did.push(`lo-3d ${LIB3D_VERSION}`);
  if (LIB_BLOCK.test(html)) {
    const n = (out.match(/LoGame\.font\((.*)\);/) || [])[1];
    did.push(`lo-game ${LIB_VERSION}`, `${n ? Object.keys(JSON.parse(n).glyphs).length : 0} glyphs`);
  }
  console.log(`ok    ${dir}: ${did.join(", ")}`);
}
process.exit(failed ? 1 : 0);
