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
  const html = readFileSync(join(dir, "index.html"));
  apps.push({
    spec: m.spec, id: m.id, name: m.name, glyph: m.glyph, ...(m.buttons ? { buttons: true } : {}), ...(m.icon ? { icon: m.icon } : {}), version: m.version,
    description: m.description, author: m.author, license: m.license,
    path: `apps/${id}/index.html`,
    sha256: createHash("sha256").update(html).digest("hex"),
    bytes: html.length,
  });
}

const index = { spec: "lopda/1", generated: new Date().toISOString().slice(0, 10), apps };
writeFileSync(join(root, "registry", "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`indexed ${apps.length} app(s): ${apps.map((a) => a.id).join(", ")}`);
