# Brief: pet souvenir catalogue (code part)

Design: `docs/design/pet-souvenirs-100.md` (Chinese; this brief is the binding version for the code).
Branch: `claude/project-thread-0wnedz`. Base: main at runtime 0.56.2.
The 77 new pictures are NOT part of this brief; Claude draws them later. This brief makes the library, the picking,
the origin line and the AI `where` work with the 23 souvenirs that exist today.

Run only the tests named in each part while you work. Never run the full `node --test` (it takes ~20 min); the reviewer decides.
Commit and push after each part.

## Must NOT change

- Any pixel of the 23 existing souvenirs or their state frames (seed, vane, snowglobe, moondial). Move them, do not redraw.
- Existing string keys `pet.souv.<id>` / `pet.souv.<id>.line` and their text.
- Outing chance and hours, traits, `outingToday`, travel, the postcard brought back by `bringBack()` (still id `post`).
- The AI call: one a day, 30 s cap, what is sent (`aiPrompt` fields other than the new `where` line in the JSON example).
- `petstate.js`, the shelf, the box grid, the room painter, any other built-in.
- Existing souvenir documents are never rewritten to add `ref` (only new documents get it).

## Part A: the catalogue file

1. New `runtime/petsouv.js`: ES5, one IIFE, `window.LopdaPetSouv = {CATALOG, SETS, SEASONS, WHERE, byId(id)}`.
   Move `SOUV` and the grids it uses (SEED_GRID and the other state frames) out of `runtime/petart.js` unchanged.
   `petart.js` keeps `souvenirs: <the catalogue>` in CHIP_PACK so every caller still works (load petsouv.js before petart.js).
2. Each entry: `{id, set, season, where, grid, state?}`.
   - `SETS = ["shore","yard","street","desk","sky","fest"]`, `SEASONS = ["any","spring","summer","autumn","winter"]`.
   - `WHERE` = the list of place keys used. Text in strings.js `pet.where.<key>` (zh and en).
   - Order: by set (in SETS order), then by the order items were added. Add a comment at the top saying: ids are never
     changed or reused; new items are appended at the end of their set.
3. Values for the 23 existing items (set / season / where):
   shell shore/any/riverbank; pebble shore/any/riverbank; boat shore/any/riverbank;
   leaf yard/autumn/windowsill; feather yard/any/yard; cone yard/autumn/park; acorn yard/autumn/park; seed yard/spring/yard;
   post street/any/mailbox; button street/any/doorstep; key street/any/street; ticket street/any/busstop;
   cap street/any/street; marble street/any/park; screw street/any/street; coin street/any/street;
   stamp desk/any/drawer; ribbon desk/any/drawer; gear desk/any/drawer; clip desk/any/drawer; snowglobe desk/any/windowsill;
   vane sky/any/roof; moondial sky/any/roof.
   Strings `pet.where.*`: riverbank 河滩 / the riverbank; windowsill 窗台 / the windowsill; yard 后院 / the backyard;
   park 公园 / the park; mailbox 信箱旁 / the mailbox; doorstep 门口 / the doorstep; street 路边 / the roadside;
   busstop 车站 / the bus stop; drawer 抽屉里 / a drawer; roof 屋顶 / the roof.
4. Add `petsouv.js` to `runtime/index.html` and the SHELL in `runtime/sw.js`.
5. New `tests/petsouv.test.mjs` (load in node:vm like petart.test.mjs): ids unique and `/^[a-z][a-z0-9-]*$/`; set, season
   and where in their lists; every grid 16 rows of 16 chars from `.kdmp`; every id has zh and en name and line and every
   where key has zh and en text in strings.js; `MIN_TOTAL = 23` and `MIN_PER_SEASON = 0` as named constants at the top
   (Claude raises them to 100 and 20 when the art lands).
6. Run: `node --test tests/petsouv.test.mjs tests/petart.test.mjs tests/petstate.test.mjs tests/strings.test.mjs`
   plus the repo-rules test that checks SHELL / index.html (find it with grep "SHELL" tests/).

## Part B: picking (pure, petsim.js)

New `pickSouvenir(rnd, table, opts)` in `runtime/petsim.js`, exported; `builtinSouvenir` stays for old callers/tests.
`opts = {season, seen, recent, newChance}`: `seen` and `recent` are arrays of catalogue ids.
1. Pool = entries whose `season` is `"any"` or equals `opts.season`. Never pick out-of-season.
2. Unseen = pool entries not in `seen`. If unseen is not empty and `r() < newChance`, pick uniformly from unseen.
3. Otherwise pick from the seen part of the pool, avoiding `recent` (last 5) when possible; if the seen part is empty,
   pick from unseen (a first find is never refused).
4. Deterministic: the same rnd seed and inputs give the same entry. Draw `r()` the same number of times on every path
   so adding an item does not shift unrelated picks more than needed (document what you do).
`newChance = Math.min(1, NEW_RATE / trait.outing)`, `NEW_RATE = 0.28` in the species pack (`souvenirNewRate`) with a fallback.
Tests in `tests/petsim.test.mjs`: out-of-season never picked; unseen first when chance hits; seen-only path avoids recent;
determinism; and a fixed-seed one-year simulation with a fake 100-item table (20 per season + 20 any) for each trait:
average new finds per year between 80 and 100 (simulate outings with `outingToday`'s chance, not a real calendar).
Run: `node --test tests/petsim.test.mjs`.

## Part C: wiring, `ref`, origin line, AI `where` (pet.js, petsim.js, strings.js)

1. `outingSouvenir()` in `runtime/apps/pet.js` uses `pickSouvenir` with: season from the existing `seasonOf(now())`,
   `seen` = refs of all box items, `recent` = refs of the last 5, `newChance` from the pet's trait. Keep the same seed.
2. New souvenir documents from the catalogue store `ref: <id>`. AI documents store no `ref`, and store `where: {zh,en}`
   when the AI gave a valid one. `makeSouvenir` / `addSouvenir` / the reader at the souvenirs load (~line 283) carry them.
3. Old documents without `ref`: when loading, match `name.zh` or `name.en` (or a one-string name) to the catalogue's
   names in either language and set `ref` in memory only. AI documents (`ai: true`) are never matched.
4. Card origin line, under the date (`pet-souvdate`), class `pet-souvfrom`, strings:
   - `ref` with a `where` (not post): `pet.from.found` 在{where}捡到的 / Found at {where}
   - `ref === "post"`: `pet.from.trip` 旅行回来带的 / Brought back from a trip
   - `ai` with `where`: `pet.from.out` 出门在{where}找到的 / Found while out at {where}
   - `ai` without `where`: `pet.from.outAny` 出门时找到的 / Found while out
   - anything else: no line.
   It must fit the 331 x 359 card without scrolling; style like `pet-souvdate`.
5. AI: `aiPrompt` JSON example gains `"where":{"zh":"不超过 6 个汉字","en":"20 characters at most"}` and one sentence: a made-up,
   ordinary place (an old book stall, under a bridge), never a real place name or address. `validateSouvenir` keeps
   `where` when `bilingualText(o.where, 6, 20)` passes and drops only `where` otherwise (the souvenir still validates).
6. Tests: petsim (where optional / kept / dropped), e2e in `tests/e2e.test.mjs` next to the existing pet tests: the four
   origin lines and an old document without `ref` showing its place. Run: `node --test tests/petsim.test.mjs` and only the
   pet e2e tests (`--test-name-pattern pet`).

## Part D: records

- `RUNTIME_VERSION` in core.js and `VERSION` in sw.js: next minor after main (0.57.0 if main is still 0.56.x).
- `docs/decisions.md`: the next free section, "纪念品库与来源（0.57.0）", short, Chinese, like section 44.
- CLAUDE.md: add petsouv.js to the layout list (one line) and the design doc to the drafts list.

## Report back

Per run: wall time and tokens (input / output / cache) from opencode. List any place you deviated from this brief and why.
