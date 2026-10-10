#!/usr/bin/env node
// Lo-PDA app checker. Usage: node tools/check-app.mjs registry/apps/<id> [more dirs...]
// Exit code 0 when every app passes, 1 otherwise. No dependencies.
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { sha, fontBlock, fillSrc, released, FONT_BLOCK, LIB_BLOCK, LIB3D_BLOCK, SRC_BLOCK } from "./lo-game-lib.mjs";

const ROOT = join(import.meta.dirname, "..");
/* known releases of the framework libraries: sdk/<name>.versions.json plus the current sdk copy */
const LO_GAME = released("lo-game");
const LO_3D = released("lo-3d");

const SPECS = ["lopda/0", "lopda/1"];
const LANGS = ["zh", "en"];
const SOUNDS = ["tap", "tick", "move", "ok", "err", "hit", "miss", "coin", "win", "lose"];
const MAX_BYTES = 512 * 1024;
const LICENSES = ["MIT", "0BSD", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Apache-2.0", "CC0-1.0", "Unlicense"];
const PALETTE = [[0x1f, 0x2a, 0x14], [0x4a, 0x5a, 0x32], [0x7d, 0x8a, 0x58], [0xa3, 0xad, 0x7e]];
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;

// [pattern, message]. Matched against the HTML with comments removed.
const FORBIDDEN = [
  [/\bfetch\s*\(/, "network: fetch()"],
  [/\bXMLHttpRequest\b/, "network: XMLHttpRequest"],
  [/\bWebSocket\b/, "network: WebSocket"],
  [/\bEventSource\b/, "network: EventSource"],
  [/\bsendBeacon\b/, "network: navigator.sendBeacon"],
  [/\bRTCPeerConnection\b/, "network: WebRTC"],
  [/\bimport\s*\(/, "dynamic import()"],
  [/\beval\s*\(/, "eval()"],
  [/\bnew\s+Function\s*\(/, "new Function()"],
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\.cookie/, "storage: use PAD.save/PAD.load instead"],
  [/(?<![\w.$])(?:window\.)?(?:alert|confirm|prompt)\s*\(/, "alert/confirm/prompt are unavailable"],
  [/<script[^>]*\bsrc\s*=/i, "external script"],
  [/<link[^>]*\bhref\s*=\s*["']?(?:https?:)?\/\//i, "external stylesheet or resource"],
  [/<(?:img|audio|video|source|iframe|embed|object)[^>]*\bsrc\s*=\s*["']?(?:https?:)?\/\//i, "external media"],
  [/@import\s+(?:url\()?["']?(?:https?:)?\/\//i, "external CSS @import"],
  [/url\(\s*["']?(?:https?:)?\/\//i, "external url() in CSS"],
  [/\bwindow\.open\s*\(|\btop\.location\b|\bparent\.location\b/, "navigation outside the app"],
];

function stripComments(s) {
  return s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1");
}

function colorErrors(src) {
  const bad = new Set();
  const ok = (r, g, b) => PALETTE.some(([R, G, B]) => R === r && G === g && B === b);
  /* a colour is a hex code standing on its own ("#abc", #abc;) — not part of a tile-map row like "#bbb..." */
  for (const m of src.matchAll(/(?<![\w#.])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?=["'`;\s),}\]]|$)/g)) {
    let h = m[1];
    // skip things that are clearly not colors (e.g. "#123" in text is rare in code; accept the risk)
    if (h.length <= 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
    else h = h.slice(0, 6);
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    if (!ok(r, g, b)) bad.add("#" + m[1]);
  }
  for (const m of src.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
    if (!ok(+m[1], +m[2], +m[3])) bad.add(m[0] + ")");
  }
  for (const m of src.matchAll(/\b(?:hsla?)\(/g)) bad.add(m[0] + "...)");
  const named = src.match(/(?:color|background(?:-color)?|fill|stroke|border(?:-[a-z]+)?)\s*:\s*[^;"'{}]*\b(red|green|blue|white|black|gray|grey|yellow|orange|purple|pink|brown|cyan|magenta)\b/gi);
  if (named) named.forEach((n) => bad.add(n.trim()));
  return [...bad];
}

/* a framework block must be filled, and be byte-identical to a released copy. Returns the matching release or null. */
function verifyBlock(label, block, known, dir, errors) {
  const body = block[2];
  const hit = Object.entries(known).find(([, h]) => h === sha(body));
  if (!body.trim()) errors.push(`the ${label} block is empty: run node tools/bundle-app.mjs ${dir}`);
  else if (!hit) errors.push(`the ${label} copy differs from every released version: do not edit it, run node tools/bundle-app.mjs ${dir}`);
  return hit || null;
}

/* .js files under src/, as paths like "src/a/b.js" */
function srcFiles(dir) {
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
      if (e.isDirectory()) walk(rel + "/" + e.name);
      else if (e.name.endsWith(".js")) out.push(rel + "/" + e.name);
    }
  };
  if (existsSync(join(dir, "src"))) walk("src");
  return out;
}

function checkApp(dir) {
  const errors = [], warnings = [], info = [];
  const id = basename(resolve(dir));
  const mPath = join(dir, "manifest.json"), hPath = join(dir, "index.html");
  if (!existsSync(mPath)) errors.push("missing manifest.json");
  if (!existsSync(hPath)) errors.push("missing index.html");
  if (errors.length) return { id, errors, warnings };

  const extra = readdirSync(dir).filter((f) => !["manifest.json", "index.html", "README.md", "LICENSE", "src"].includes(f) && !f.startsWith("."));
  if (extra.length) warnings.push("extra files are not shipped: " + extra.join(", "));

  let m;
  try { m = JSON.parse(readFileSync(mPath, "utf8")); } catch (e) { return { id, errors: ["manifest.json is not valid JSON: " + e.message], warnings }; }
  if (!SPECS.includes(m.spec)) errors.push(`spec must be one of ${SPECS.join(", ")}`);
  if (typeof m.id !== "string" || !/^[a-z0-9-]{3,32}$/.test(m.id)) errors.push("id must be 3-32 chars of a-z, 0-9, -");
  else if (m.id !== id) errors.push(`id "${m.id}" must match the folder name "${id}"`);
  const chars = (s) => Array.from(String(s || ""));
  if (!m.name || chars(m.name).length > 8) errors.push("name must be 1-8 characters");
  if (chars(m.glyph).length !== 1) errors.push("glyph must be exactly one character");
  if (m.icon !== undefined) {
    const okIcon = Array.isArray(m.icon) && m.icon.length === 16 && m.icon.every((r) => typeof r === "string" && /^[.0-3]{16}$/.test(r));
    if (!okIcon) errors.push('icon must be 16 strings of 16 characters, each one of ".0123"');
  }
  for (const f of ["name", "glyph", "description"]) if (EMOJI.test(String(m[f] || ""))) errors.push(`${f} contains emoji`);
  /* optional localized store text: {"en": {"name", "description"}, "zh": {...}}, same rules as the defaults */
  if (m.i18n !== undefined) {
    if (!m.i18n || typeof m.i18n !== "object" || Array.isArray(m.i18n)) errors.push('i18n must be an object like {"en": {"name": "...", "description": "..."}}');
    else for (const [lang, v] of Object.entries(m.i18n)) {
      if (!LANGS.includes(lang)) { errors.push(`i18n.${lang}: only ${LANGS.join(", ")} are supported`); continue; }
      if (!v || typeof v !== "object" || Array.isArray(v)) { errors.push(`i18n.${lang} must be an object`); continue; }
      for (const k of Object.keys(v)) if (!["name", "description"].includes(k)) errors.push(`i18n.${lang}.${k}: only name and description can be localized`);
      if (v.name !== undefined && (typeof v.name !== "string" || !v.name || chars(v.name).length > 8)) errors.push(`i18n.${lang}.name must be 1-8 characters`);
      if (v.description !== undefined && (typeof v.description !== "string" || !v.description || chars(v.description).length > 80)) errors.push(`i18n.${lang}.description must be 1-80 characters`);
      for (const f of ["name", "description"]) if (EMOJI.test(String(v[f] || ""))) errors.push(`i18n.${lang}.${f} contains emoji`);
    }
  } else info.push("no i18n in the manifest: zh + en names are recommended (SPEC.md)");
  if (typeof m.version !== "string" || !/^\d+\.\d+\.\d+$/.test(m.version)) errors.push("version must be MAJOR.MINOR.PATCH");
  if (!m.description || chars(m.description).length > 80) errors.push("description must be 1-80 characters");
  if (!m.author) errors.push("author is required");
  if (!LICENSES.includes(m.license)) errors.push(`license must be one of ${LICENSES.join(", ")}`);
  if (!Array.isArray(m.permissions)) errors.push("permissions must be an array");
  else if (m.permissions.length) errors.push("permissions must be empty for now");
  if (m.buttons !== undefined) {
    if (m.spec !== "lopda/1") errors.push('buttons needs spec "lopda/1"');
    else if (typeof m.buttons !== "boolean") errors.push("buttons must be true or false");
  }

  const size = statSync(hPath).size;
  if (size > MAX_BYTES) errors.push(`index.html is ${size} bytes; the limit is ${MAX_BYTES}`);
  let html = readFileSync(hPath, "utf8");
  /* src/ files bundled into data-src blocks: index.html must hold exactly the current files */
  const filled = fillSrc(html, dir);
  filled.errors.forEach((e) => errors.push(e));
  if (!filled.errors.length && filled.html !== html) errors.push("index.html is out of date with src/: run node tools/bundle-app.mjs " + dir);
  else if (filled.paths.length) info.push(`src bundled (${filled.paths.length} file${filled.paths.length > 1 ? "s" : ""})`);
  for (const f of srcFiles(dir)) if (!filled.paths.includes(f)) warnings.push(`${f} is not referenced by any data-src block`);
  /* a verified lo-3d.js / lo-game.js copy is reviewed once, upstream; only the app's own code is scanned */
  const block3d = html.match(LIB3D_BLOCK);
  const block = html.match(LIB_BLOCK);
  const hit3d = block3d && verifyBlock("lo-3d", block3d, LO_3D, dir, errors);
  const hit = block && verifyBlock("lo-game", block, LO_GAME, dir, errors);
  /* the font block must be exactly what the tool builds from this app's text: data, no code */
  const fb = html.match(FONT_BLOCK);
  if (hit && fb) {
    if (fb[0].replace(/^\n/, "") !== fontBlock(html)) errors.push("the lo-font block is out of date or was edited: run node tools/bundle-app.mjs " + dir);
    else info.push("lo-font verified (" + (fb[0].match(/"glyphs":\{/) ? Object.keys(JSON.parse(fb[0].match(/LoGame\.font\((.*)\);/)[1]).glyphs).length : 0) + " glyphs)");
  }
  if (hit3d) info.push("lo-3d " + hit3d[0].replace(" (sdk)", "") + " verified");
  if (hit) info.push("lo-game " + hit[0].replace(" (sdk)", "") + " verified");
  if (hit3d) html = html.replace(block3d[0], "<script></script>");
  if (hit) {
    if (fb) html = html.replace(fb[0], "");
    html = html.replace(block[0], "<script></script>");
  }
  /* a data-src opener is not an external script */
  html = html.replace(new RegExp(SRC_BLOCK.source, "g"), (m, p, body) => "<script>\n" + body + "</script>");
  const code = stripComments(html);
  for (const [re, msg] of FORBIDDEN) if (re.test(code)) errors.push("forbidden: " + msg);
  const colors = colorErrors(code);
  if (colors.length) errors.push("colors outside the palette: " + colors.slice(0, 8).join(", ") + (colors.length > 8 ? ` (+${colors.length - 8})` : ""));
  const usesLoGame = info.some((m) => m.startsWith("lo-game"));
  if (!usesLoGame && !/height\s*:\s*100%/.test(code)) warnings.push("html/body should use height:100%");
  if (EMOJI.test(html)) warnings.push("contains emoji; the runtime will strip them");
  if (!usesLoGame && !/\bPAD\./.test(code)) warnings.push("does not use PAD; fine if the app saves nothing");
  for (const mm of code.matchAll(/PAD\.sfx\(\s*["']([^"']*)["']/g)) if (!SOUNDS.includes(mm[1])) errors.push(`PAD.sfx("${mm[1]}") is not a known sound: ${SOUNDS.join(", ")}`);
  const usesButtons = /PAD\.(on|isDown)\s*\(/.test(code);
  if (m.spec === "lopda/0" && /PAD\.(on|off|isDown|sfx)\s*\(/.test(code)) errors.push('PAD.on/isDown/sfx need spec "lopda/1"');
  if (usesButtons && m.buttons !== true) warnings.push('uses PAD.on but "buttons" is not true, so the chin buttons stay hidden (keyboard still works)');
  return { id, errors, warnings, info };
}

const dirs = process.argv.slice(2);
if (!dirs.length) { console.error("usage: node tools/check-app.mjs registry/apps/<id> [...]"); process.exit(2); }
let failed = 0;
for (const d of dirs) {
  const r = checkApp(d);
  const ok = r.errors.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.id}`);
  r.errors.forEach((e) => console.log(`  error: ${e}`));
  r.warnings.forEach((w) => console.log(`  warn:  ${w}`));
  (r.info || []).forEach((w) => console.log(`  info:  ${w}`));
}
process.exit(failed ? 1 : 0);
