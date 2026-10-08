// Shared by tools/lo-game.mjs and tools/check-app.mjs: builds the two framework blocks of an app.
//   <script data-lo-game="VERSION"> sdk/lo-game.js, verbatim </script>
//   <script data-lo-font="lopix12"> license notice + only the glyphs the app uses </script>
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
export const sha = (s) => createHash("sha256").update(s).digest("hex");
export const LIB = readFileSync(join(ROOT, "sdk", "lo-game.js"), "utf8");
export const LIB_VERSION = (LIB.match(/var VERSION = "([^"]+)"/) || [])[1];
export const LIB_BLOCK = /<script data-lo-game="([^"]*)">\n?([\s\S]*?)<\/script>/;
export const FONT_BLOCK = /\n?<script data-lo-font="[^"]*">[\s\S]*?<\/script>/;
const FONT = JSON.parse(readFileSync(join(ROOT, "sdk", "fonts", "lopix12.json"), "utf8"));
const FONT_NOTICE = readFileSync(join(ROOT, "sdk", "fonts", "LICENSE-lopix12.txt"), "utf8");

/* the app with both framework blocks emptied: what the font subset is computed from */
export function appText(html) { return html.replace(FONT_BLOCK, "").replace(LIB_BLOCK, ""); }

export function fontBlock(html) {
  const want = new Set(Array.from(appText(html)));
  for (let c = 32; c < 127; c++) want.add(String.fromCharCode(c));   /* numbers and letters for any score or name */
  const glyphs = {};
  [...want].sort().forEach((ch) => { if (FONT.glyphs[ch]) glyphs[ch] = FONT.glyphs[ch]; });
  const data = { name: FONT.name, cell: FONT.cell, line: FONT.line, glyphs };
  return `<script data-lo-font="${FONT.name}">\n/*\n${FONT_NOTICE}*/\nLoGame.font(${JSON.stringify(data)});\n</script>`;
}

/* fill the framework block with the current library and (re)build the font block after it */
export function build(html) {
  if (!LIB_BLOCK.test(html)) return null;
  let out = html.replace(FONT_BLOCK, "");
  out = out.replace(LIB_BLOCK, () => `<script data-lo-game="${LIB_VERSION}">\n${LIB}</script>`);
  const font = fontBlock(out);
  return out.replace(LIB_BLOCK, (m) => m + "\n" + font);
}
