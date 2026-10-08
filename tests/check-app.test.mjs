// tools/check-app.mjs: every shipped app passes, and each rule catches what it is meant to catch.
// Each rule is tried on a copy of sdk/template (a known-good app) with one thing broken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ROOT, tool, copyApp } from "./helpers.mjs";

const APPS = readdirSync(join(ROOT, "registry", "apps")).map((id) => join(ROOT, "registry", "apps", id));

/* a copy of the counter template in a folder named after its id, optionally changed */
function counter(t, change = {}) {
  const dir = copyApp(t, "sdk/template", "my-app");
  const mPath = join(dir, "manifest.json"), hPath = join(dir, "index.html");
  if (change.manifest) {
    const m = JSON.parse(readFileSync(mPath, "utf8"));
    change.manifest(m);
    writeFileSync(mPath, JSON.stringify(m));
  }
  if (change.html) writeFileSync(hPath, change.html(readFileSync(hPath, "utf8")));
  return dir;
}
/* add code at the end of the app's script */
const withCode = (code) => ({ html: (h) => h.replace(/<\/script>\s*<\/body>/, code + "\n</script>\n</body>") });

test("every registry app passes", () => {
  const r = tool("check-app.mjs", ...APPS);
  assert.equal(r.code, 0, r.out);
});

test("every sdk template passes once named after its id and built", (t) => {
  const templates = readdirSync(join(ROOT, "sdk")).filter((d) => d.startsWith("template"));
  assert.ok(templates.length >= 2);
  for (const d of templates) {
    const id = JSON.parse(readFileSync(join(ROOT, "sdk", d, "manifest.json"), "utf8")).id;
    const dir = copyApp(t, "sdk/" + d, id);
    if (readFileSync(join(dir, "index.html"), "utf8").includes("data-lo-game")) assert.equal(tool("lo-game.mjs", dir).code, 0, d);
    const r = tool("check-app.mjs", dir);
    assert.equal(r.code, 0, d + "\n" + r.out);
  }
});

test("the counter template passes without warnings; the game template needs lo-game", (t) => {
  const app = counter(t);
  const r1 = tool("check-app.mjs", app);
  assert.equal(r1.code, 0, r1.out);
  assert.doesNotMatch(r1.out, /warn:/);

  const game = copyApp(t, "sdk/template-game", "my-game");
  assert.match(tool("check-app.mjs", game).out, /the lo-game block is empty/);
  assert.equal(tool("lo-game.mjs", game).code, 0);
  const r2 = tool("check-app.mjs", game);
  assert.equal(r2.code, 0, r2.out);
  assert.match(r2.out, /lo-game 1\.\d+\.\d+ verified/);
  assert.match(r2.out, /lo-font verified/);
});

test("usage error without arguments", () => {
  assert.equal(tool("check-app.mjs").code, 2);
});

test("missing files", (t) => {
  const dir = counter(t);
  rmSync(join(dir, "index.html"));
  const r = tool("check-app.mjs", dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /missing index\.html/);
});

/* [what is broken, change, the error the checker must report] */
const FAILS = [
  ["bad JSON", { manifest: null, html: null, raw: "{not json" }, /not valid JSON/],
  ["unknown spec", { manifest: (m) => (m.spec = "lopda/9") }, /spec must be one of/],
  ["bad id", { manifest: (m) => (m.id = "My App") }, /id must be 3-32 chars/],
  ["id differs from folder", { manifest: (m) => (m.id = "other-app") }, /must match the folder name/],
  ["long name", { manifest: (m) => (m.name = "九个字的名字太长了") }, /name must be 1-8 characters/],
  ["two-char glyph", { manifest: (m) => (m.glyph = "计数") }, /glyph must be exactly one character/],
  ["bad icon", { manifest: (m) => (m.icon = ["0123"]) }, /icon must be 16 strings/],
  ["emoji in name", { manifest: (m) => (m.name = "计\u{1F600}") }, /name contains emoji/],
  ["unsupported i18n language", { manifest: (m) => (m.i18n = { fr: { name: "Compteur" } }) }, /i18n\.fr: only zh, en/],
  ["unknown i18n field", { manifest: (m) => (m.i18n = { en: { title: "x" } }) }, /i18n\.en\.title: only name and description/],
  ["long i18n name", { manifest: (m) => (m.i18n.en.name = "A very long name") }, /i18n\.en\.name must be 1-8/],
  ["long i18n description", { manifest: (m) => (m.i18n.en.description = "x".repeat(81)) }, /i18n\.en\.description must be 1-80/],
  ["bad version", { manifest: (m) => (m.version = "1.0") }, /version must be MAJOR\.MINOR\.PATCH/],
  ["long description", { manifest: (m) => (m.description = "长".repeat(81)) }, /description must be 1-80/],
  ["no author", { manifest: (m) => delete m.author }, /author is required/],
  ["GPL licence", { manifest: (m) => (m.license = "GPL-3.0") }, /license must be one of/],
  ["permissions", { manifest: (m) => (m.permissions = ["camera"]) }, /permissions must be empty/],
  ["buttons on lopda/0", { manifest: (m) => (m.spec = "lopda/0") }, /buttons needs spec "lopda\/1"/],
  ["buttons not boolean", { manifest: (m) => (m.buttons = "yes") }, /buttons must be true or false/],
  ["too big", { html: (h) => h + "<!--" + "x".repeat(200 * 1024) + "-->" }, /the limit is 204800/],
  ["fetch", withCode('fetch("/x");'), /network: fetch\(\)/],
  ["XMLHttpRequest", withCode("new XMLHttpRequest();"), /network: XMLHttpRequest/],
  ["WebSocket", withCode('new WebSocket("ws://x");'), /network: WebSocket/],
  ["sendBeacon", withCode('navigator.sendBeacon("/x");'), /sendBeacon/],
  ["dynamic import", withCode('import("./x.js");'), /dynamic import/],
  ["eval", withCode('eval("1");'), /eval\(\)/],
  ["new Function", withCode('new Function("return 1");'), /new Function/],
  ["localStorage", withCode('localStorage.x = 1;'), /storage: use PAD/],
  ["cookie", withCode('document.cookie = "a=1";'), /storage: use PAD/],
  ["alert", withCode('alert("hi");'), /alert\/confirm\/prompt/],
  ["window.confirm", withCode('window.confirm("hi");'), /alert\/confirm\/prompt/],
  ["external script", { html: (h) => h.replace("</head>", '<script src="https://x.test/a.js"></script></head>') }, /external script/],
  ["external stylesheet", { html: (h) => h.replace("</head>", '<link rel="stylesheet" href="//x.test/a.css"></head>') }, /external stylesheet/],
  ["external image", { html: (h) => h.replace("<main>", '<main><img src="https://x.test/a.png">') }, /external media/],
  ["CSS @import", { html: (h) => h.replace("<style>", '<style>@import url("https://x.test/a.css");') }, /external CSS @import/],
  ["CSS url()", { html: (h) => h.replace("<style>", "<style>main{background:url(https://x.test/a.png)}") }, /external url\(\)/],
  ["window.open", withCode('window.open("https://x.test");'), /navigation outside the app/],
  ["off-palette hex", { html: (h) => h.replace("color: #1f2a14", "color: #ff0000") }, /colors outside the palette: #ff0000/],
  ["off-palette short hex", { html: (h) => h.replace("color: #1f2a14", "color: #fff") }, /colors outside the palette: #fff/],
  ["off-palette rgb()", { html: (h) => h.replace("color: #1f2a14", "color: rgb(255, 0, 0)") }, /rgb\(255, 0, 0\)/],
  ["hsl()", { html: (h) => h.replace("color: #1f2a14", "color: hsl(0, 0%, 0%)") }, /hsl\(\.\.\.\)/],
  ["named colour", { html: (h) => h.replace("color: #1f2a14", "color: red") }, /color: red/],
  ["unknown sound", withCode('PAD.sfx("boom");'), /PAD\.sfx\("boom"\) is not a known sound/],
  ["buttons on lopda/0 code", { manifest: (m) => { m.spec = "lopda/0"; delete m.buttons; } }, /PAD\.on\/isDown\/sfx need spec "lopda\/1"/],
];

for (const [name, change, want] of FAILS) {
  test("rejects: " + name, (t) => {
    const dir = counter(t, change);
    if (change.raw) writeFileSync(join(dir, "manifest.json"), change.raw);
    const r = tool("check-app.mjs", dir);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, want);
  });
}

/* things that look like violations but are fine */
const PASSES = [
  ["forbidden words inside comments", withCode('/* fetch("x"); eval("y"); localStorage */\n// alert("z")')],
  ["a method named alert or prompt", withCode("var ui = { alert: function () {} }; ui.alert(1); game.prompt;")],
  ["palette colours in any spelling", { html: (h) => h.replace("color: #1f2a14", "color: #1F2A14; border-color: rgba(163, 173, 126, 0.5)") }],
  ["a tile-map row is not a colour", withCode('var MAP = ["#bbbbbb#", "#......#"];')],
  ["no i18n is only advice", { manifest: (m) => delete m.i18n }],
  ["lopda/0 without buttons or PAD.on", {
    manifest: (m) => { m.spec = "lopda/0"; delete m.buttons; },
    html: (h) => h.replace(/PAD\.sfx\(sound\);/, "").replace(/PAD\.on\("press"[\s\S]*?\n {2}\}\);/, ""),
  }],
];

for (const [name, change] of PASSES) {
  test("accepts: " + name, (t) => {
    const r = tool("check-app.mjs", counter(t, change));
    assert.equal(r.code, 0, r.out);
  });
}

test("warns, without failing, about PAD.on with buttons off and about extra files", (t) => {
  const dir = counter(t, { manifest: (m) => delete m.buttons });
  writeFileSync(join(dir, "notes.txt"), "x");
  const r = tool("check-app.mjs", dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /"buttons" is not true/);
  assert.match(r.out, /extra files are not shipped: notes\.txt/);
});

test("info for a manifest without i18n", (t) => {
  assert.match(tool("check-app.mjs", counter(t, { manifest: (m) => delete m.i18n })).out, /no i18n in the manifest/);
});

test("one failing app fails the run, and each app is reported", (t) => {
  const r = tool("check-app.mjs", counter(t), counter(t, { manifest: (m) => (m.license = "GPL-3.0") }));
  assert.equal(r.code, 1);
  assert.match(r.out, /PASS {2}my-app[\s\S]*FAIL {2}my-app/);
});
