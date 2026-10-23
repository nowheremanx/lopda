#!/usr/bin/env node
import { appendFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { checkApp } from "./check-app.mjs";

const base = process.argv[2] || "origin/main";
let changed;
try {
  changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" })
    .split(/\r?\n/).filter(Boolean);
} catch (e) {
  console.error(`Could not compare ${base}...HEAD: ${e.message}`);
  process.exit(1);
}

const ids = [...new Set(changed.map((path) => {
  const m = /^registry\/apps\/([^/]+)(?:\/|$)/.exec(path);
  return m && m[1];
}).filter(Boolean))].sort();
const appDirs = ids.filter((id) => existsSync(`registry/apps/${id}`));

function escapeData(value) {
  return String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeProperty(value) {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

if (!appDirs.length) {
  const report = "no app changes";
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Registry app checks\n\n${report}\n\n`); }
    catch (e) { console.error(`Could not write GITHUB_STEP_SUMMARY: ${e.message}`); process.exit(1); }
  }
  process.exit(0);
}

let failed = false;
const lines = ["## Registry app checks", ""];
for (const id of appDirs) {
  const dir = `registry/apps/${id}`;
  const result = checkApp(dir);
  const ok = result.errors.length === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}`);
  lines.push(`### ${ok ? "PASS" : "FAIL"} \`${id}\``);
  if (!ok) failed = true;
  result.errors.forEach((message) => {
    console.log(`  error: ${message}`);
    lines.push(`- **Error:** ${message}`);
    console.log(`::error file=${escapeProperty(dir)}::${escapeData(message)}`);
  });
  result.warnings.forEach((message) => {
    console.log(`  warn:  ${message}`);
    lines.push(`- Warning: ${message}`);
  });
  (result.info || []).forEach((message) => {
    console.log(`  info:  ${message}`);
    lines.push(`- ${message}`);
  });
  if (!result.errors.length && !result.warnings.length && !(result.info || []).length) lines.push("- All checks passed.");
  lines.push("");
}

if (process.env.GITHUB_STEP_SUMMARY) {
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n"); }
  catch (e) { console.error(`Could not write GITHUB_STEP_SUMMARY: ${e.message}`); process.exit(1); }
}
process.exit(failed ? 1 : 0);
