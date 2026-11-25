#!/usr/bin/env node
// Stamps a PR preview with its commit: RUNTIME_VERSION in runtime/core.js and VERSION in runtime/sw.js become
// "<x>+<sha7>", so every push to a PR gives the service worker a new version and a phone drops its cached files.
// Only the pages workflow runs it, on the checked-out copy it publishes; the stamped files are never committed.
// Usage: node tools/stamp-preview.mjs <repo root> <commit sha>   (prints the stamped version)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CORE = /var RUNTIME_VERSION="([^"]+)"/;
const SW = /var VERSION = "lopda-v([^"]+)"/;
/* the pattern latestVersion() in core.js reads sw.js with (Settings -> 检查更新) */
const UPDATE = /VERSION\s*=\s*"lopda-v([^"]+)"/;

function fail(msg) {
  console.error(`stamp-preview: ${msg}`);
  process.exit(1);
}

const [root, sha] = process.argv.slice(2);
if (!root || !sha) fail("usage: node tools/stamp-preview.mjs <repo root> <commit sha>");
if (!/^[0-9a-f]{7,40}$/i.test(sha)) fail(`not a commit sha: ${sha}`);
const sha7 = sha.slice(0, 7).toLowerCase();

const corePath = join(root, "runtime", "core.js");
const swPath = join(root, "runtime", "sw.js");
let core = readFileSync(corePath, "utf8");
let sw = readFileSync(swPath, "utf8");

/* a silent miss would publish an unstamped preview, and phones would keep the old code */
const c = core.match(CORE);
if (!c) fail(`${corePath}: no var RUNTIME_VERSION="..." to stamp`);
const s = sw.match(SW);
if (!s) fail(`${swPath}: no var VERSION = "lopda-v..." to stamp`);
if (c[1] !== s[1]) fail(`RUNTIME_VERSION ${c[1]} and sw.js VERSION ${s[1]} differ`);
if (c[1].includes("+")) fail(`already stamped: ${c[1]}`);

const version = `${c[1]}+${sha7}`;
core = core.replace(CORE, `var RUNTIME_VERSION="${version}"`);
sw = sw.replace(SW, `var VERSION = "lopda-v${version}"`);

/* read back the way the runtime does, so Settings sees the two as one version */
if (core.match(CORE)[1] !== version) fail("core.js did not take the stamp");
const u = sw.match(UPDATE);
if (!u || u[1] !== version) fail("the update check would not read the stamped sw.js VERSION");

writeFileSync(corePath, core);
writeFileSync(swPath, sw);
console.log(version);
