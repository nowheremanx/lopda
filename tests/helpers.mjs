// Shared by the tests: repo paths, running the browser scripts in a vm, running the tools.
import { readFileSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

export const ROOT = join(import.meta.dirname, "..");
export const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
export const readJSON = (rel) => JSON.parse(read(rel));

/* run a runtime/sdk script (ES5, browser globals) in a fresh context; returns the context */
export function runScript(rel, globals) {
  const ctx = vm.createContext(Object.assign({ console }, globals));
  if (!("window" in ctx)) ctx.window = ctx;
  vm.runInContext(read(rel), ctx, { filename: rel });
  return ctx;
}

/* run a tool and capture its output; never throws on a non-zero exit */
export function tool(name, ...args) {
  const r = spawnSync(process.execPath, [join(ROOT, "tools", name), ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

/* a throwaway folder; removed when the test ends */
export function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "lopda-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/* copy a folder (an app) into a fresh temp dir under a chosen folder name */
export function copyApp(t, from, name) {
  const dir = join(tempDir(t), name);
  cpSync(join(ROOT, from), dir, { recursive: true });
  return dir;
}

export const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;
