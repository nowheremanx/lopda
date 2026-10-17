import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./helpers.mjs";

function repo(t) {
  const dir = mkdtempSync(join(tmpdir(), "lopda-changed-apps-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  git("init", "-b", "main");
  git("config", "user.name", "Lo-PDA tests");
  git("config", "user.email", "tests@example.invalid");
  writeFileSync(join(dir, "README"), "base\n");
  git("add", "README");
  git("commit", "-m", "base");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  return { dir, git };
}

function addValidApp(dir, id = "test-app") {
  const app = join(dir, "registry", "apps", id);
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, "manifest.json"), JSON.stringify({
    spec: "lopda/1", id, name: "Test", glyph: "T", version: "1.0.0", description: "A test app.",
    author: "Tests", license: "MIT", permissions: []
  }));
  writeFileSync(join(app, "index.html"), "<!doctype html><html><head><style>html,body{height:100%;margin:0}</style></head><body>Test</body></html>");
}

function run(dir, summary) {
  const env = { ...process.env };
  if (summary) env.GITHUB_STEP_SUMMARY = summary;
  else delete env.GITHUB_STEP_SUMMARY;
  return spawnSync(process.execPath, [join(ROOT, "tools/check-changed-apps.mjs")], { cwd: dir, encoding: "utf8", env });
}

test("changed registry apps are checked and reported", (t) => {
  const { dir, git } = repo(t);
  addValidApp(dir);
  git("add", "registry/apps/test-app");
  git("commit", "-m", "add app");
  const pass = run(dir);
  assert.equal(pass.status, 0, pass.stdout + pass.stderr);
  assert.match(pass.stdout, /PASS\s+test-app/);

  writeFileSync(join(dir, "registry/apps/test-app/index.html"), "<!doctype html><html><body><script>fetch('/')</script></body></html>");
  git("add", "registry/apps/test-app/index.html");
  git("commit", "-m", "break app");
  const summary = join(dir, "summary.md");
  const fail = run(dir, summary);
  assert.equal(fail.status, 1, fail.stdout + fail.stderr);
  assert.match(fail.stdout, /FAIL\s+test-app/);
  assert.match(fail.stdout, /::error file=registry\/apps\/test-app::/);
  assert.match(readFileSync(summary, "utf8"), /forbidden: network: fetch\(\)/);
});

test("non-app changes report no app changes", (t) => {
  const { dir, git } = repo(t);
  writeFileSync(join(dir, "README"), "docs only\n");
  git("add", "README");
  git("commit", "-m", "docs");
  const result = run(dir);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /no app changes/i);
});
