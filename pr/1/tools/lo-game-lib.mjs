// Shared by tools/bundle-app.mjs (and its alias lo-game.mjs) and tools/check-app.mjs: builds the framework
// blocks of an app.
//   <script data-src="src/x.js"> a source file of the app, verbatim </script>
//   <script data-lo-3d="VERSION"> sdk/lo-3d.js, verbatim </script>
//   <script data-lo-game="VERSION"> sdk/lo-game.js, verbatim </script>
//   <script data-lo-font="lopix12"> license notice + only the glyphs the app uses </script>
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
export const sha = (s) => createHash("sha256").update(s).digest("hex");
const VERSION_RE = /var VERSION = "([^"]+)"/;
export const LIB = readFileSync(join(ROOT, "sdk", "lo-game.js"), "utf8");
export const LIB_VERSION = (LIB.match(VERSION_RE) || [])[1];
export const LIB_BLOCK = /<script data-lo-game="([^"]*)">\n?([\s\S]*?)<\/script>/;
export const LIB3D = readFileSync(join(ROOT, "sdk", "lo-3d.js"), "utf8");
export const LIB3D_VERSION = (LIB3D.match(VERSION_RE) || [])[1];
export const LIB3D_BLOCK = /<script data-lo-3d="([^"]*)">\n?([\s\S]*?)<\/script>/;
export const SRC_BLOCK = /<script data-src="([^"]*)">\n?([\s\S]*?)<\/script>/g;
export const FONT_BLOCK = /\n?<script data-lo-font="[^"]*">[\s\S]*?<\/script>/;
const FONT = JSON.parse(readFileSync(join(ROOT, "sdk", "fonts", "lopix12.json"), "utf8"));
const FONT_NOTICE = readFileSync(join(ROOT, "sdk", "fonts", "LICENSE-lopix12.txt"), "utf8");

/* known releases of a library: sdk/<name>.versions.json plus the current sdk copy, as {version: hash} */
export function released(name) {
  const known = {};
  try { Object.assign(known, JSON.parse(readFileSync(join(ROOT, "sdk", name + ".versions.json"), "utf8"))); } catch {}
  try {
    const cur = readFileSync(join(ROOT, "sdk", name + ".js"), "utf8");
    known[(cur.match(VERSION_RE) || [])[1] + " (sdk)"] = sha(cur);
  } catch {}
  return known;
}

/* the app with the framework blocks emptied: what the font subset is computed from */
export function appText(html) { return html.replace(FONT_BLOCK, "").replace(LIB_BLOCK, "").replace(LIB3D_BLOCK, ""); }

export function fontBlock(html) {
  const want = new Set(Array.from(appText(html)));
  for (let c = 32; c < 127; c++) want.add(String.fromCharCode(c));   /* numbers and letters for any score or name */
  const glyphs = {};
  [...want].sort().forEach((ch) => { if (FONT.glyphs[ch]) glyphs[ch] = FONT.glyphs[ch]; });
  const data = { name: FONT.name, cell: FONT.cell, line: FONT.line, glyphs };
  return `<script data-lo-font="${FONT.name}">\n/*\n${FONT_NOTICE}*/\nLoGame.font(${JSON.stringify(data)});\n</script>`;
}

/* why a data-src path is not allowed, or null */
export function srcPathError(p) {
  if (!p) return "data-src is empty";
  if (p.startsWith("/") || /^[a-z]+:/i.test(p) || p.includes("\\")) return `data-src "${p}" must be a relative path`;
  if (p.split("/").includes("..")) return `data-src "${p}" must not contain ..`;
  if (!p.startsWith("src/")) return `data-src "${p}" must start with src/`;
  if (!p.endsWith(".js")) return `data-src "${p}" must end in .js`;
  return null;
}

/* fill every data-src block from dir; returns {html, errors, paths}. Rule violations leave the block as it is. */
export function fillSrc(html, dir) {
  const errors = [], paths = [];
  const out = html.replace(SRC_BLOCK, (m, p) => {
    paths.push(p);
    const bad = srcPathError(p);
    if (bad) { errors.push(bad); return m; }
    const file = join(dir, p);
    if (!existsSync(file) || !statSync(file).isFile()) { errors.push(`${p} does not exist`); return m; }
    let body = readFileSync(file, "utf8");
    if (/<\/script/i.test(body)) { errors.push(`${p} must not contain </script`); return m; }
    if (!body.endsWith("\n")) body += "\n";
    return `<script data-src="${p}">\n${body}</script>`;
  });
  return { html: out, errors, paths };
}

/* does the app ask for anything the tool builds? */
export function wantsBuild(html) {
  return new RegExp(SRC_BLOCK.source).test(html) || LIB3D_BLOCK.test(html) || LIB_BLOCK.test(html);
}

/* fill data-src blocks (needs dir), then the lo-3d block, then the lo-game block, and (re)build the font block
   after the lo-game block. Returns null when the app asks for none of them; throws when a data-src rule fails. */
export function build(html, dir) {
  if (!wantsBuild(html)) return null;
  let out = html;
  if (dir !== undefined) {
    const r = fillSrc(out, dir);
    if (r.errors.length) throw new Error(r.errors.join("; "));
    out = r.html;
  }
  if (LIB3D_BLOCK.test(out)) out = out.replace(LIB3D_BLOCK, () => `<script data-lo-3d="${LIB3D_VERSION}">\n${LIB3D}</script>`);
  if (LIB_BLOCK.test(out)) {
    out = out.replace(FONT_BLOCK, "");
    out = out.replace(LIB_BLOCK, () => `<script data-lo-game="${LIB_VERSION}">\n${LIB}</script>`);
    const font = fontBlock(out);
    out = out.replace(LIB_BLOCK, (m) => m + "\n" + font);
  }
  return out;
}
