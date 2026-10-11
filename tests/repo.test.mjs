// Repo-wide rules from CLAUDE.md that are easy to forget: registry index in sync, versions in step,
// offline shell complete, runtime code parses, licence rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, readdirSync, cpSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { ROOT, read, readJSON, tool, tempDir, EMOJI, RUNTIME_JS } from "./helpers.mjs";

const APP_IDS = readdirSync(join(ROOT, "registry", "apps")).sort();
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

test("registry/index.json is what build-index.mjs would write", (t) => {
  /* run the real tool on a copy, so the test never touches the working tree */
  const copy = tempDir(t);
  for (const d of ["tools", "sdk", "registry"]) cpSync(join(ROOT, d), join(copy, d), { recursive: true });
  execFileSync(process.execPath, [join(copy, "tools", "build-index.mjs")], { stdio: "pipe" });
  const fresh = JSON.parse(readFileSync(join(copy, "registry", "index.json"), "utf8"));
  const cur = readJSON("registry/index.json");
  delete fresh.generated; delete cur.generated;
  assert.deepEqual(cur, fresh, "run node tools/build-index.mjs");
});

test("every index entry points at the exact file it describes", () => {
  const index = readJSON("registry/index.json");
  assert.equal(index.spec, "lopda/1");
  assert.deepEqual(index.apps.map((a) => a.id), APP_IDS);
  for (const a of index.apps) {
    const html = readFileSync(join(ROOT, "registry", a.path));
    assert.equal(a.sha256, sha256(html), a.id);
    assert.equal(a.bytes, html.length, a.id);
  }
});

test("registry apps use an allowed licence", () => {
  const ok = ["MIT", "0BSD", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Apache-2.0", "CC0-1.0", "Unlicense"];
  for (const id of APP_IDS) assert.ok(ok.includes(readJSON(`registry/apps/${id}/manifest.json`).license), id);
});

test("RUNTIME_VERSION and the service worker VERSION move together", () => {
  const rt = read("runtime/core.js").match(/var RUNTIME_VERSION="([^"]+)"/)[1];
  const sw = read("runtime/sw.js").match(/var VERSION = "lopda-v([^"]+)"/)[1];
  assert.equal(rt, sw);
  /* the update check in core.js reads sw.js with this same pattern */
  assert.match(read("runtime/sw.js"), /VERSION\s*=\s*"lopda-v([^"]+)"/);
});

test("every file the service worker pre-caches exists", () => {
  const shell = JSON.parse(read("runtime/sw.js").match(/var SHELL = (\[[\s\S]*?\]);/)[1].replace(/\s+/g, " "));
  for (const f of shell) assert.ok(existsSync(join(ROOT, "runtime", f)), f);
});

test("every local script and stylesheet the page loads is pre-cached", () => {
  const html = read("runtime/index.html");
  const shell = read("runtime/sw.js").match(/var SHELL = (\[[\s\S]*?\]);/)[1];
  const local = [...html.matchAll(/<(?:script[^>]*\bsrc|link[^>]*\bhref)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  assert.ok(local.length >= 5);
  for (const u of local) {
    assert.ok(existsSync(join(ROOT, "runtime", u)), u + " exists");
    assert.ok(shell.includes(`"${u}"`), u + " is in SHELL in sw.js");
  }
});

test("every runtime script is loaded by the page and pre-cached", () => {
  const html = read("runtime/index.html"), shell = read("runtime/sw.js").match(/var SHELL = (\[[\s\S]*?\]);/)[1];
  assert.ok(RUNTIME_JS.length >= 10, "found the runtime scripts");
  for (const f of RUNTIME_JS) {
    const u = f.slice("runtime/".length);
    if (u === "sw.js") continue;
    assert.ok(html.includes(`<script src="${u}"></script>`), u + " is loaded by index.html");
    assert.ok(shell.includes(`"${u}"`), u + " is in SHELL in sw.js");
  }
});

test("runtime and sdk scripts parse as plain scripts", () => {
  for (const f of [...RUNTIME_JS, "sdk/pad-shim.js", "sdk/lo-game.js", "sdk/lo-3d.js"]) {
    assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f);
  }
});

test("runtime code stays ES5-style: no let, const, arrow functions or classes", () => {
  for (const f of [...RUNTIME_JS, "sdk/pad-shim.js"]) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
    assert.doesNotMatch(code, /\b(?:let|const|class)\s+[\w$]/, f);
    assert.doesNotMatch(code, /=>/, f);
  }
});

/* ◀ ▶ are text arrows on the device's buttons; Unicode counts them as pictographic, so they are let through here */
test("no emoji in the runtime or sdk", () => {
  for (const f of ["runtime/index.html", ...RUNTIME_JS, "runtime/lopda.css", "sdk/lo-game.js", "sdk/lo-3d.js", "sdk/pad-shim.js", "sdk/dev.html"]) {
    assert.ok(!EMOJI.test(read(f).replace(/[▶◀]/g, "")), f);
  }
});

test("no game ROMs in the repo", () => {
  const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n");
  assert.deepEqual(files.filter((f) => /\.(gb|gbc|sav)$/i.test(f)), []);
});

test("third-party code keeps its licence file and is listed in NOTICE and LICENSING.md", () => {
  for (const [dir, licence] of [["runtime/vendor/binjgb", "LICENSE"], ["sdk/fonts", "LICENSE-lopix12.txt"]]) {
    assert.ok(existsSync(join(ROOT, dir, licence)), `${dir}/${licence}`);
    assert.ok(read("NOTICE").includes(dir), "NOTICE lists " + dir);
    assert.ok(read("LICENSING.md").includes(dir), "LICENSING.md lists " + dir);
  }
});

test("build-index refuses an app that fails the checker", (t) => {
  const copy = tempDir(t);
  for (const d of ["tools", "sdk", "registry"]) cpSync(join(ROOT, d), join(copy, d), { recursive: true });
  const bad = join(copy, "registry", "apps", APP_IDS[0], "manifest.json");
  const m = JSON.parse(readFileSync(bad, "utf8")); m.license = "GPL-3.0";
  writeFileSync(bad, JSON.stringify(m));
  const out = execFileSync(process.execPath, [join(copy, "tools", "build-index.mjs")], { encoding: "utf8", stdio: "pipe" });
  const index = JSON.parse(readFileSync(join(copy, "registry", "index.json"), "utf8"));
  assert.ok(!index.apps.some((a) => a.id === APP_IDS[0]), out);
  assert.equal(index.apps.length, APP_IDS.length - 1);
  assert.ok(tool("check-app.mjs", join(ROOT, "registry", "apps", APP_IDS[0])).code === 0, "the real app is untouched");
});

test("the Pages workflow publishes the repo without tests, dependencies or CI files", () => {
  const y = read(".github/workflows/pages.yml");
  for (const ex of ["/tests", "/node_modules", "/_to_delete", "/.github"]) assert.ok(y.includes("--exclude=" + ex), ex);
  assert.ok(y.includes("gh-pages") && y.includes(".nojekyll") && y.includes("lopda-preview"));
  /* PRs that change no app, sdk script or runtime file (docs, tests, CI) get no preview and no comment */
  assert.ok(y.includes("id: plan") && y.includes("deploy=false"), "preview only when needed");
  const pats = [...y.matchAll(/grep -qE '([^']+)'/g)].map((m) => new RegExp(m[1]));
  const previewsAll = (p) => pats.some((re) => re.test(p));
  assert.equal(pats.length, 2, "one pattern for runtime/, one for sdk/*.js");
  for (const p of ["runtime/lopda.css", "runtime/vendor/binjgb/binjgb.wasm", "sdk/lo-game.js", "sdk/pad-shim.js"]) assert.ok(previewsAll(p), p);
  for (const p of ["sdk/LO-GAME.md", "sdk/PROMPT.md", "sdk/template/index.html", "docs/x.md", "tests/a.mjs", "registry/apps/a/index.html"]) assert.ok(!previewsAll(p), p);
  /* the comment links runtime/ when it changed, and no longer warns against opening it */
  assert.ok(y.includes("runtime=$RUNTIME") && y.includes("$SITE/pr/$PR/runtime/"), "runtime link");
  assert.ok(y.includes("lopda-pr-") && !/Do not open `?runtime/i.test(y) && !y.includes("请不要打开"), "no warning about runtime/");
  assert.deepEqual([...y.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]), ["actions/checkout@v4"], "only actions/checkout");
});
