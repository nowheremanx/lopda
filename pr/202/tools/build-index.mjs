#!/usr/bin/env node
// Regenerates registry/index.json from registry/apps/*/manifest.json.
// Each entry records the SHA-256 of index.html so the runtime installs exactly that file.
// Usage: node tools/build-index.mjs   (runs the checker first; refuses to index failing apps)
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const appsDir = join(root, "registry", "apps");
const ids = readdirSync(appsDir).filter((d) => statSync(join(appsDir, d)).isDirectory()).sort();

/* The index's two dates are derived, not authored:
   - released: the commit that first added the app's manifest.json, i.e. the app's first appearance in the store.
   - updated: the last commit that changed the manifest's version, and only when the current version differs from
     the version at that first appearance. An app first published as 2.0.0 has no earlier store version, so it
     is NEW, not UPDATED. A version bump on the same day still counts.
   Without git (a test copy, a source tarball, a publish that only serves the committed files) reuse the dates
   already in index.json. */
let previous = {};
try {
  const prev = JSON.parse(readFileSync(join(root, "registry", "index.json"), "utf8"));
  for (const a of prev.apps || []) previous[a.id] = a;
} catch {}
function git(args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return ""; }
}
function firstManifest(id) {
  const path = `registry/apps/${id}/manifest.json`;
  const lines = git(["log", "--diff-filter=A", "--format=%H %cs", "--", path]).split("\n").filter(Boolean);
  const [hash, date] = (lines[lines.length - 1] || "").split(" ");
  let version = "";
  if (hash) {
    try { version = JSON.parse(git(["show", `${hash}:${path}`])).version || ""; } catch {}
  }
  return { date: date || "", version };
}
function datesFor(id, version) {
  const path = `registry/apps/${id}/manifest.json`;
  const first = firstManifest(id);
  const old = previous[id] || {};
  if (!first.date) return { released: old.released || "", updated: old.updated || "" };
  let updated = "";
  if (first.version && version && first.version !== version) {
    updated = git(["log", "-1", "--format=%cs", "-G", '"version":', "--", path]);
  }
  return { released: first.date, updated };
}

const apps = [];
for (const id of ids) {
  const dir = join(appsDir, id);
  try {
    execFileSync(process.execPath, [join(root, "tools", "check-app.mjs"), dir], { stdio: "pipe" });
  } catch (e) {
    console.error(`skip ${id}: checker failed\n${e.stdout}`);
    continue;
  }
  const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const dates = datesFor(id, m.version);
  const html = readFileSync(join(dir, "index.html"));
  apps.push({
    spec: m.spec, id: m.id, name: m.name, glyph: m.glyph, ...(m.category ? { category: m.category } : {}), ...(m.buttons ? { buttons: true } : {}), ...(m.icon ? { icon: m.icon } : {}), version: m.version, ...(dates.released ? { released: dates.released } : {}), ...(dates.updated ? { updated: dates.updated } : {}),
    description: m.description, ...(m.i18n ? { i18n: m.i18n } : {}), author: m.author, license: m.license,
    ...(m.permissions && m.permissions.length ? { permissions: m.permissions } : {}),
    path: `apps/${id}/index.html`,
    sha256: createHash("sha256").update(html).digest("hex"),
    bytes: html.length,
  });
}

const index = { spec: "lopda/1", generated: new Date().toISOString().slice(0, 10), apps };
writeFileSync(join(root, "registry", "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`indexed ${apps.length} app(s): ${apps.map((a) => a.id).join(", ")}`);
