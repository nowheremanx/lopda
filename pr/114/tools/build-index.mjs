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

/* the first and the last commit that touched an app's index.html: released / updated. With no git (a test copy,
   a source tarball, a publish that only serves the committed files) fall back to the dates already in index.json. */
let previous = {};
try {
  const prev = JSON.parse(readFileSync(join(root, "registry", "index.json"), "utf8"));
  for (const a of prev.apps || []) previous[a.id] = a;
} catch {}
function gitDate(args) {
  try {
    const out = execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return out.split("\n").filter(Boolean).pop() || "";
  } catch { return ""; }
}
function datesFor(id) {
  const path = `registry/apps/${id}/index.html`;
  const released = gitDate(["log", "--follow", "--diff-filter=A", "--format=%cs", "--", path]);
  const updated = gitDate(["log", "--follow", "-1", "--format=%cs", "--", path]);
  const old = previous[id] || {};
  const r = released || old.released || "";
  const u = updated || old.updated || r;
  return { released: r, updated: u };
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
  const dates = datesFor(id);
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
