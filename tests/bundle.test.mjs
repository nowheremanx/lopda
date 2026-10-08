// tools/bundle-app.mjs and the checker's src/ rules. Apps are built in temp dirs, never in the working tree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tool, copyApp } from "./helpers.mjs";
import { build } from "../tools/lo-game-lib.mjs";

/* the counter template with one data-src block and a source file */
function srcApp(t, js = "var FROM_SRC = 1;\n", path = "src/a.js") {
  const dir = copyApp(t, "sdk/template", "my-app");
  const file = join(dir, "index.html");
  writeFileSync(file, readFileSync(file, "utf8").replace("<script>", `<script data-src="${path}"></script>\n<script>`));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "a.js"), js);
  return { dir, file };
}

test("bundle fills a data-src block from src/ and is idempotent", (t) => {
  const { dir, file } = srcApp(t, "var FROM_SRC = 1;");   /* no trailing newline: the tool adds one */
  const r = tool("bundle-app.mjs", dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ok .*1 src file/);
  const once = readFileSync(file, "utf8");
  assert.ok(once.includes('<script data-src="src/a.js">\nvar FROM_SRC = 1;\n</script>'));
  assert.equal(tool("bundle-app.mjs", dir).code, 0);
  assert.equal(readFileSync(file, "utf8"), once);
  /* a changed source file replaces the old content instead of adding to it */
  writeFileSync(join(dir, "src", "a.js"), "var FROM_SRC = 2;\n");
  tool("bundle-app.mjs", dir);
  const twice = readFileSync(file, "utf8");
  assert.ok(twice.includes("FROM_SRC = 2") && !twice.includes("FROM_SRC = 1"));
  assert.equal(twice.split('data-src="src/a.js"').length, 2);
  const c = tool("check-app.mjs", dir);
  assert.equal(c.code, 0, c.out);
  assert.doesNotMatch(c.out, /warn:/);
});

test("bundle rejects </script in a source file and bad paths", (t) => {
  const { dir } = srcApp(t, 'var s = "</SCRIPT>";\n');
  const r = tool("bundle-app.mjs", dir);
  assert.equal(r.code, 1);
  assert.match(r.out, /must not contain <\/script/);
  const html = readFileSync(join(dir, "index.html"), "utf8");
  for (const [p, re] of [["../x.js", /must not contain \.\./], ["lib/x.js", /must start with src\//], ["src/x.json", /must end in \.js/], ["/src/x.js", /relative/], ["src/none.js", /does not exist/]]) {
    const bad = copyApp(t, "sdk/template", "my-app");
    writeFileSync(join(bad, "index.html"), html.replace(/data-src="[^"]*"/, `data-src="${p}"`));
    const rb = tool("bundle-app.mjs", bad);
    assert.equal(rb.code, 1, p);
    assert.match(rb.out, re, p);
    assert.match(tool("check-app.mjs", bad).out, re, "checker: " + p);
  }
});

test("bundle: nothing to build exits 1, no arguments exits 2", (t) => {
  assert.equal(tool("bundle-app.mjs", copyApp(t, "sdk/template", "my-app")).code, 1);
  assert.equal(tool("bundle-app.mjs").code, 2);
  assert.equal(build("<p>nothing</p>", "."), null);
});

test("the checker wants index.html to match src/ exactly", (t) => {
  const { dir, file } = srcApp(t);
  assert.match(tool("check-app.mjs", dir).out, /index\.html is out of date with src\/: run node tools\/bundle-app\.mjs/);
  tool("bundle-app.mjs", dir);
  assert.equal(tool("check-app.mjs", dir).code, 0);
  writeFileSync(join(dir, "src", "a.js"), "var FROM_SRC = 3;\n");
  assert.match(tool("check-app.mjs", dir).out, /out of date with src\//);
  tool("bundle-app.mjs", dir);
  writeFileSync(file, readFileSync(file, "utf8").replace("FROM_SRC = 3", "FROM_SRC = 4"));
  assert.match(tool("check-app.mjs", dir).out, /out of date with src\//, "editing the bundled copy is caught");
});

test("the checker warns about a src file no block uses, and does not call src extra", (t) => {
  const { dir } = srcApp(t);
  tool("bundle-app.mjs", dir);
  writeFileSync(join(dir, "src", "unused.js"), "var U = 1;\n");
  const c = tool("check-app.mjs", dir);
  assert.equal(c.code, 0, c.out);
  assert.match(c.out, /warn:\s+src\/unused\.js is not referenced/);
  assert.doesNotMatch(c.out, /extra files/);
});

test("forbidden APIs and off-palette colours inside a src file are still caught", (t) => {
  const { dir } = srcApp(t, 'fetch("x"); var c = "#ff0000"; localStorage.x = 1;\n');
  tool("bundle-app.mjs", dir);
  const c = tool("check-app.mjs", dir);
  assert.equal(c.code, 1);
  assert.match(c.out, /forbidden: network: fetch/);
  assert.match(c.out, /forbidden: storage/);
  assert.match(c.out, /colors outside the palette/);
});
