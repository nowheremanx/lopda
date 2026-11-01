// runtime/petsouv.js: the souvenir catalogue and the place strings it points at.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

/* Part E raises these as the art lands; the final values are 300 / 60 / 60. */
const MIN_TOTAL = 83;
const MIN_PER_SEASON = 0;
const MIN_ANY = 0;

/* The first 23 finds were drawn before the three-tone rule; their pixels never change, so the rule skips them. */
const FIRST_23 = new Set(["shell", "pebble", "boat", "leaf", "feather", "cone", "acorn", "seed", "post", "button", "key",
  "ticket", "cap", "marble", "screw", "coin", "stamp", "ribbon", "gear", "clip", "snowglobe", "vane", "moondial"]);

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;
const EN_NAME = /^[A-Za-z][A-Za-z .,'-]*$/;

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
  assert.ok(S.WHERE.length <= 30, `${S.WHERE.length} place keys, at most 30`);
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
    if (season === "any") continue;
    assert.ok(counts[season] >= MIN_PER_SEASON, `${season} has ${counts[season]} items, at least ${MIN_PER_SEASON}`);
  }
  assert.ok(counts.any >= MIN_ANY, `any has ${counts.any} items, at least ${MIN_ANY}`);
});

test("catalogue: every top-level grid is 16 x 16 of .kdmp", () => {
  for (const e of S.CATALOG) assertGrid("souvenir " + e.id, e.grid);
});

test("catalogue: every grid has 30 pixels and ink; new ones use at least three tones", () => {
  for (const e of S.CATALOG) {
    const flat = e.grid.join("");
    const tones = new Set();
    let pixels = 0;
    for (const ch of flat) {
      if (ch === ".") continue;
      pixels++;
      tones.add(ch);
    }
    assert.ok(pixels >= 30, `${e.id} has ${pixels} non-paper pixels, at least 30`);
    assert.ok(flat.includes("k"), `${e.id} has ink`);
    if (!FIRST_23.has(e.id)) assert.ok(tones.size >= 3, `${e.id} uses ${[...tones].join("")}, at least three of kdmp`);
  }
});

test("catalogue: no two grids are identical or differ in fewer than 12 pixels", () => {
  for (let i = 0; i < S.CATALOG.length; i++) {
    for (let j = i + 1; j < S.CATALOG.length; j++) {
      const a = S.CATALOG[i], b = S.CATALOG[j];
      let diff = 0;
      for (let r = 0; r < 16; r++) {
        for (let c = 0; c < 16; c++) if (a.grid[r][c] !== b.grid[r][c]) diff++;
      }
      assert.ok(diff >= 12, `${a.id} and ${b.id} differ in ${diff} pixels, at least 12`);
    }
  }
});

test("strings: names and lines obey the catalogue's rules", () => {
  const zhNames = new Set(), enNames = new Set();
  for (const e of S.CATALOG) {
    const nameKey = "pet.souv." + e.id, lineKey = nameKey + ".line";
    const zhName = ZH.STR.zh[nameKey], enName = EN.STR.en[nameKey];
    const zhLine = ZH.STR.zh[lineKey], enLine = EN.STR.en[lineKey];
    assert.ok([...zhName].length >= 2 && [...zhName].length <= 6, `${e.id} zh name is 2-6 characters`);
    assert.ok(!/[A-Za-z]/.test(zhName), `${e.id} zh name has no Latin letters`);
    assert.ok(enName.length >= 2 && enName.length <= 16, `${e.id} en name is 2-16 characters`);
    assert.match(enName, EN_NAME, `${e.id} en name is legal`);
    assert.ok(!zhNames.has(zhName), `${e.id} zh name is unique`);
    assert.ok(!enNames.has(enName), `${e.id} en name is unique`);
    zhNames.add(zhName);
    enNames.add(enName);
    assert.ok([...zhLine].length <= 24, `${e.id} zh line is at most 24 characters`);
    assert.ok(enLine.length <= 48, `${e.id} en line is at most 48 characters`);
    assert.ok(!EMOJI.test(zhLine) && !EMOJI.test(enLine), `${e.id} lines have no emoji`);
    assert.ok(!/[<>]/.test(zhLine + enLine), `${e.id} lines have no < or >`);
  }
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

test("catalogue: the first 23 finds are all still there", () => {
  for (const id of FIRST_23) assert.ok(S.byId(id), `${id} is in the catalogue`);
});
