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

test("registry/order.json sets the store order: listed apps first, in its order, the rest by id (#186)", () => {
  const order = readJSON("registry/order.json").order;
  assert.equal(new Set(order).size, order.length, "no app listed twice");
  const listed = APP_IDS.filter((id) => order.includes(id)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const rest = APP_IDS.filter((id) => !order.includes(id));
  assert.deepEqual(readJSON("registry/index.json").apps.map((a) => a.id), [...listed, ...rest]);
});

test("registry entries carry released, and updated when the version changed", () => {
  const index = readJSON("registry/index.json");
  const real = (a, k) => {
    assert.match(a[k] || "", /^\d{4}-\d{2}-\d{2}$/, `${a.id}: ${k}`);
    const [y, mo, d] = a[k].split("-").map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    assert.equal(dt.toISOString().slice(0, 10), a[k], `${a.id}: ${k} is a real date`);
  };
  for (const a of index.apps) {
    real(a, "released");
    if (a.updated !== undefined) {
      real(a, "updated");
      assert.ok(a.released <= a.updated, `${a.id}: released ${a.released} after updated ${a.updated}`);
    }
  }
});

test("every index entry points at the exact file it describes", () => {
  const index = readJSON("registry/index.json");
  assert.equal(index.spec, "lopda/1");
  assert.deepEqual(index.apps.map((a) => a.id).sort(), APP_IDS, "every app once (the order is registry/order.json)");
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

test("every registry app sits in one of the store's categories", () => {
  const cats = ["game", "productivity", "education", "create", "story", "life"];
  const index = readJSON("registry/index.json");
  for (const id of APP_IDS) {
    const m = readJSON(`registry/apps/${id}/manifest.json`);
    assert.ok(cats.includes(m.category), `${id}: ${m.category}`);
    assert.equal(index.apps.find((a) => a.id === id).category, m.category, id);
  }
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

test("every font file fonts.css names exists, and nothing else is in runtime/fonts", () => {
  const css = read("runtime/fonts/fonts.css");
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(urls.length > 100, "DotGothic16 slices and VT323");
  for (const u of urls) assert.ok(existsSync(join(ROOT, "runtime", "fonts", u)), u);
  const files = readdirSync(join(ROOT, "runtime", "fonts")).filter((f) => f.endsWith(".woff2")).sort();
  assert.deepEqual(files, [...urls].sort());
  /* no request to another site for fonts any more */
  assert.doesNotMatch(read("runtime/index.html") + read("runtime/lopda.css"), /fonts\.(googleapis|gstatic)\.com/);
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
  for (const [dir, licence] of [["runtime/vendor/binjgb", "LICENSE"], ["sdk/fonts", "LICENSE-lopix12.txt"],
    ["runtime/fonts", "OFL-DotGothic16.txt"], ["runtime/fonts", "OFL-VT323.txt"],
    ["runtime/vendor/holiday-cn", "LICENSE"], ["runtime/vendor/qrcode-generator", "LICENSE"]]) {
    assert.ok(existsSync(join(ROOT, dir, licence)), `${dir}/${licence}`);
    assert.ok(read("NOTICE").includes(dir), "NOTICE lists " + dir);
    assert.ok(read("LICENSING.md").includes(dir), "LICENSING.md lists " + dir);
  }
});

test("the holiday-cn year files the calendar ships are valid, pre-cached, and the only ones in the folder", () => {
  const bundled = JSON.parse(read("runtime/apps/calendar.js").match(/var BUNDLED=(\{[^}]*\});/)[1].replace(/(\d{4}):/g, '"$1":'));
  const shell = read("runtime/sw.js").match(/var SHELL = (\[[\s\S]*?\]);/)[1];
  assert.ok(Object.keys(bundled).length >= 1);
  for (const [year, path] of Object.entries(bundled)) {
    assert.ok(existsSync(join(ROOT, "runtime", path)), path);
    const j = readJSON("runtime/" + path);
    assert.equal(j.year, +year, path);
    assert.ok(Array.isArray(j.days) && j.days.length > 0, path);
    for (const d of j.days) {
      assert.equal(typeof d.name, "string", path);
      assert.match(d.date, /^\d{4}-\d\d-\d\d$/, path);
      assert.ok(Math.abs(+d.date.slice(0, 4) - +year) <= 1, path + " " + d.date);  /* make-up days can sit in the next file */
      assert.equal(typeof d.isOffDay, "boolean", path);
    }
    assert.ok(shell.includes(`"${path}"`), path + " is in SHELL in sw.js");
  }
  const files = readdirSync(join(ROOT, "runtime", "vendor", "holiday-cn")).filter((f) => f.endsWith(".json")).sort();
  assert.deepEqual(files, Object.values(bundled).map((p) => p.split("/").pop()).sort());
});

/* The handheld asks no other site for anything, with one exception: the calendar's holiday file (decisions.md section 14).
   Comments are stripped, strings kept. */
/* each address is written down in decisions.md: the holidays (section 14), the AI line (section 34) and the AI providers (section 61) */
test("the only other sites a runtime script names are the calendar's holiday address and the AI providers", () => {
  const found = [];
  for (const f of RUNTIME_JS) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of code.matchAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g)) if (/https?:\/\//.test(m[0])) found.push(f + " " + m[0]);
  }
  assert.deepEqual(found.sort(), ['runtime/ai.js "https://api.deepseek.com/chat/completions"', 'runtime/ai.js "https://api.deepseek.com/models"',
    'runtime/ai.js "https://api.moonshot.cn/v1/chat/completions"', 'runtime/ai.js "https://api.moonshot.cn/v1/models"',
    'runtime/ai.js "https://api.siliconflow.cn/v1/chat/completions"', 'runtime/ai.js "https://api.siliconflow.cn/v1/models?type=text"',
    'runtime/ai.js "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"',
    'runtime/ai.js "https://dashscope.aliyuncs.com/compatible-mode/v1/models"',
    'runtime/ai.js "https://openrouter.ai/api/v1/chat/completions"', 'runtime/ai.js "https://openrouter.ai/api/v1/models"',
    'runtime/apps/calendar.js "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/"',
    'runtime/apps/settings.js "https://nowheremanx.github.io/lopda/"']);
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

test("every preview comment links the runtime, also for a PR that only changes an app", () => {
  const y = read(".github/workflows/pages.yml");
  const step = y.slice(y.indexOf("Comment preview links on the PR"));
  const links = [...step.matchAll(/echo "- runtime[^"]*: \$SITE\/pr\/\$PR\/runtime\/"/g)];
  assert.equal(links.length, 2, "one runtime line for runtime PRs, one naming the apps to install");
  assert.ok(/if \[ "\$RUNTIME" = true \] \|\| \[ -z "\$APPS" \]; then[\s\S]*else[\s\S]*fi/.test(step), "no branch without a runtime link");
});

test("the Pages workflow publishes the repo without tests, dependencies or CI files", () => {
  const y = read(".github/workflows/pages.yml");
  for (const ex of ["/tests", "/node_modules", "/_to_delete", "/.github"]) assert.ok(y.includes("--exclude=" + ex), ex);
  assert.ok(/rsync -a --checksum --delete/.test(y), "same-size generated files are compared by content");
  assert.ok(y.includes("gh-pages") && y.includes(".nojekyll") && y.includes("lopda-preview"));
  /* PRs that change no app, sdk script or runtime file (docs, tests, CI) get no preview and no comment */
  assert.ok(y.includes("id: plan") && y.includes("deploy=false"), "preview only when needed");
  const pats = [...y.matchAll(/grep -qE '([^']+)'/g)].map((m) => new RegExp(m[1]));
  assert.equal(pats.length, 3, "one pattern for runtime/, one for the sdk files every app link runs on, one for the landing page");
  const [runtimeRe, allAppsRe, landingRe] = pats;
  /* the landing page at the site root and the pictures it shows get a link to the preview's root */
  for (const p of ["index.html", "docs/images/screens.png", "docs/images/stocks/1-portrait.jpg", "docs/video/lopda-en.mp4", "events/index.html", "events/events.js"]) assert.ok(landingRe.test(p), p);
  for (const p of ["runtime/index.html", "registry/apps/a/index.html", "docs/x.md", "sdk/template/index.html"]) assert.ok(!landingRe.test(p), p);
  assert.ok(y.includes("$SITE/pr/$PR/\""), "landing link");
  /* runtime/ gets the runtime link only: the app links open sdk/dev.html, which loads nothing from runtime/ but chip.js */
  for (const p of ["runtime/lopda.css", "runtime/apps/dict.js", "runtime/vendor/binjgb/binjgb.wasm"]) {
    assert.ok(runtimeRe.test(p), p); assert.ok(!allAppsRe.test(p), "no app list for " + p);
  }
  for (const p of ["sdk/lo-game.js", "sdk/pad-shim.js", "sdk/dev.html", "runtime/chip.js"]) assert.ok(allAppsRe.test(p), p);
  assert.ok(!allAppsRe.test("runtime/chip.json") && !allAppsRe.test("runtime/apps/chip.js"), "only the chip itself");
  for (const p of ["sdk/LO-GAME.md", "sdk/PROMPT.md", "sdk/template/index.html", "docs/x.md", "tests/a.mjs", "registry/apps/a/index.html"]) {
    assert.ok(!runtimeRe.test(p) && !allAppsRe.test(p), p);
  }
  assert.ok(y.includes('[ -z "$APPS" ] && [ "$RUNTIME" = false ] && [ "$LANDING" = false ]'), "a runtime-only or landing-only PR still deploys");
  /* the comment links runtime/ when it changed, and no longer warns against opening it */
  assert.ok(y.includes("runtime=$RUNTIME") && y.includes("$SITE/pr/$PR/runtime/"), "runtime link");
  assert.ok(y.includes("lopda-pr-") && !/Do not open `?runtime/i.test(y) && !y.includes("请不要打开"), "no warning about runtime/");
  assert.deepEqual([...y.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]), ["actions/checkout@v4"], "only actions/checkout");
});

test("events/events.js: both languages everywhere, cards point at real issues, archived events have their pictures", () => {
  const box = { window: {} };
  vm.runInNewContext(read("events/events.js"), box);
  const events = box.window.LOPDA_EVENTS;
  assert.ok(Array.isArray(events) && events.length, "LOPDA_EVENTS is a non-empty list");
  /* every {en, zh} pair has both; a missing one would show English to a Chinese reader */
  const pairs = (v, at) => {
    if (!v || typeof v !== "object") return;
    const keys = Object.keys(v);
    if (keys.includes("en") || keys.includes("zh")) {
      assert.ok(typeof v.en === "string" && v.en && typeof v.zh === "string" && v.zh, at + " has en and zh");
      assert.doesNotMatch(v.en + v.zh, EMOJI, at + " has no emoji");
      return;
    }
    for (const k of keys) pairs(v[k], at + "." + k);
  };
  const ids = new Set();
  for (const ev of events) {
    assert.match(ev.id, /^[a-z0-9-]+$/, ev.id); assert.ok(!ids.has(ev.id), "unique id " + ev.id); ids.add(ev.id);
    assert.ok(["open", "archived"].includes(ev.status), ev.id + " status");
    pairs(ev, ev.id);
    /* the two ways in: the phone (a script, a taste) and the computer (an app in the store) */
    if (ev.ways) assert.equal(ev.ways.map((w) => w.id).join(), "phone,computer", ev.id + " ways");
    for (const w of ev.ways || []) assert.ok(w.steps.length && w.facts.length === 3, ev.id + "/" + w.id + " has steps and three facts");
    const cardIds = new Set();
    for (const c of ev.cards || []) {
      assert.ok(!cardIds.has(c.id), "unique card " + c.id); cardIds.add(c.id);
      assert.ok([1, 2, 3].includes(c.stars), c.id + " stars");
      assert.ok(typeof c.prompt === "string" && c.prompt.length > 40, c.id + " has a starter prompt");
      /* an open event's card has its one line for Scripts on the phone and two asks for Revise */
      if (ev.status === "open") assert.ok(c.idea && Array.isArray(c.revise) && c.revise.length === 2, c.id + " has a phone line and two revisions");
    }
    if (ev.status === "archived") assert.ok(ev.summary, ev.id + " is archived with a summary");
    for (const a of (ev.summary && ev.summary.apps) || []) {
      assert.ok(APP_IDS.includes(a.app), a.app + " is a registry app");
      assert.ok(existsSync(join(ROOT, "events", "shots", ev.id, a.app + ".png")), a.app + " has its picture (tools/event-shots.mjs)");
    }
  }
});
