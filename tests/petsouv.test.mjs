// runtime/petsouv.js: the souvenir catalogue and the place strings it points at.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

/* Claude raises these to 100 and 20 when the 77 new pictures land. */
const MIN_TOTAL = 23;
const MIN_PER_SEASON = 0;

const S = runScript("runtime/petsouv.js").LopdaPetSouv;
const loadStrings = (lang) => runScript("runtime/strings.js", { navigator: { languages: [lang], language: lang } }).LopdaStrings;
const ZH = loadStrings("zh-CN"), EN = loadStrings("en-US");
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function assertGrid(name, g) {
  assert.ok(Array.isArray(g), `${name} is an array`);
  assert.equal(g.length, 16, `${name} has 16 rows`);
  for (let r = 0; r < g.length; r++) {
    assert.equal(typeof g[r], "string", `${name} row ${r} is a string`);
    assert.equal(g[r].length, 16, `${name} row ${r} is 16 wide`);
    assert.match(g[r], /^[.kdmp]{16}$/, `${name} row ${r} uses only .kdmp`);
  }
}

test("shapes: SETS, SEASONS and WHERE", () => {
  assert.deepEqual([...S.SETS], ["shore", "yard", "street", "desk", "sky", "fest"]);
  assert.deepEqual([...S.SEASONS], ["any", "spring", "summer", "autumn", "winter"]);
  assert.ok(Array.isArray(S.WHERE) && S.WHERE.length > 0, "WHERE lists the place keys");
  assert.equal(new Set(S.WHERE).size, S.WHERE.length, "place keys are unique");
});

test("catalogue: ids unique, legal, and in set order", () => {
  const { CATALOG } = S;
  assert.ok(CATALOG.length >= MIN_TOTAL, `${CATALOG.length} entries, at least ${MIN_TOTAL}`);
  const seen = new Set();
  let lastSet = -1;
  for (const e of CATALOG) {
    assert.equal(typeof e.id, "string", "id is a string");
    assert.match(e.id, /^[a-z][a-z0-9-]*$/, `${e.id} is a legal id`);
    assert.ok(!seen.has(e.id), `${e.id} is unique`);
    seen.add(e.id);
    const setAt = S.SETS.indexOf(e.set);
    assert.ok(setAt >= 0, `${e.id} set ${e.set}`);
    assert.ok(setAt >= lastSet, `${e.id} keeps the SETS order`);
    lastSet = setAt;
  }
  assert.ok(seen.has("post"), "the postcard is still in the catalogue");
});

test("catalogue: set, season and where are from their lists, and each season has enough", () => {
  const counts = Object.fromEntries(S.SEASONS.map((s) => [s, 0]));
  for (const e of S.CATALOG) {
    assert.ok(S.SETS.includes(e.set), `${e.id} set ${e.set} is in SETS`);
    assert.ok(S.SEASONS.includes(e.season), `${e.id} season ${e.season} is in SEASONS`);
    assert.ok(S.WHERE.includes(e.where), `${e.id} where ${e.where} is in WHERE`);
    counts[e.season]++;
  }
  for (const season of S.SEASONS) {
    assert.ok(counts[season] >= MIN_PER_SEASON, `${season} has ${counts[season]} items, at least ${MIN_PER_SEASON}`);
  }
});

test("catalogue: every top-level grid is 16 x 16 of .kdmp", () => {
  for (const e of S.CATALOG) assertGrid("souvenir " + e.id, e.grid);
});

test("catalogue: every state frame the entry uses is a 16 x 16 grid", () => {
  for (const e of S.CATALOG) {
    if (!e.state) continue;
    for (const layer of e.state.layers) {
      if (layer.kind === "grow") {
        for (const st of layer.stages) assertGrid(`souvenir ${e.id} grow ${st.id}`, st.grid);
      } else if (layer.kind === "match") {
        layer.rules.forEach((r, i) => assertGrid(`souvenir ${e.id} match ${r.id || i}`, r.grid));
      }
    }
  }
});

test("strings: every id has a name and a line in zh and en, and every place has both", () => {
  for (const e of S.CATALOG) {
    const nameKey = "pet.souv." + e.id, lineKey = nameKey + ".line";
    for (const [lang, table] of [["zh", ZH.STR.zh], ["en", EN.STR.en]]) {
      assert.ok(own(table, nameKey), `${lang} ${nameKey} exists`);
      assert.ok(own(table, lineKey), `${lang} ${lineKey} exists`);
      assert.ok(table[nameKey].length > 0, `${lang} ${nameKey} is not empty`);
      assert.ok(table[lineKey].length > 0, `${lang} ${lineKey} is not empty`);
    }
  }
  for (const key of S.WHERE) {
    const whereKey = "pet.where." + key;
    for (const [lang, table] of [["zh", ZH.STR.zh], ["en", EN.STR.en]]) {
      assert.ok(own(table, whereKey), `${lang} ${whereKey} exists`);
      assert.ok(table[whereKey].length > 0, `${lang} ${whereKey} is not empty`);
    }
  }
});

test("byId: finds an entry by id and returns null for an unknown one", () => {
  assert.equal(S.byId("shell").id, "shell");
  assert.equal(S.byId("moondial").id, "moondial");
  assert.equal(S.byId("not-a-souvenir"), null);
});
