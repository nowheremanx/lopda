# Brief: Part E, the souvenir art and text (after Parts A-D)

Owner, 2026-11-01: players care less about how a souvenir looks than about having many and seldom seeing repeats;
the name and line explain the picture. DeepSeek draws the bulk. Target **300 items** in the catalogue:
**60 per season (spring, summer, autumn, winter) and 60 `any`**. The 23 existing items count toward these.

## Changes to Parts A-D values

- `MIN_TOTAL = 300`, `MIN_PER_SEASON = 60` (and `any` >= 60) in `tests/petsouv.test.mjs`, raised at the end of Part E.
- `NEW_RATE` (pack `souvenirNewRate`) = **0.45** instead of 0.28. Simulated with 60/season + 60 any:
  curious ~164 new finds in year one, ~296 by year two; sleepy gets a new one on every outing (~109 a year).
  The petsim one-year test uses this table shape and expects curious between 140 and 190.
- Update `docs/design/pet-souvenirs-100.md` sections 2 and 6 with these numbers (keep its file name).

## E1. Import batch 1

`briefs/pet-souvenirs/batch1-claude.js` holds 20 items Claude drew and the owner approved (19 spring, 1 any). Move them
into the catalogue as they are (grid, set, season, where; text into strings.js as `pet.souv.<id>` / `.line`, zh = `zh` /
`lzh`, en = `en` / `len`). New `where` keys they use go into WHERE and strings (`pet.where.*`, zh / en, same style as the
existing ten).

## E2. Draw the rest, one run per group of about 40

Order: spring (to 60), summer, autumn, winter, any. One implementer run per ~40 items; the reviewer checks each group.

Art rules (look at the 23 existing grids and batch 1 first; match them):
- 16 x 16, characters `.` (paper) `k` ink `d` dark `m` mid `p` paper-highlight. One clear object, centered, with a 1 px `k`
  outline, about 8-14 px across, at least 30 non-`.` pixels, light from the upper left (`p` highlights, `d` shadows).
- Everyday small things a small creature could find near home or on a short walk: nature, street, desk, kitchen, toys,
  weather, festival things of the season (Chinese and general). The season must be obvious from the object or its line.
- Never: brands, logos, readable text or digits, other people's characters or games, weapons, food packaging with names,
  animals that are alive or dead (shells, feathers, cast skins are fine), anything sad or scary.
- No two items the same object (two kinds of leaf are fine if the names and lines differ clearly).

Text rules (match the existing tone: quiet, a little warm, from the pet's side, no exclamation marks):
- `pet.souv.<id>`: zh 2-6 Chinese characters, en 2-16 Latin characters. Unique per language across the whole catalogue.
- `.line`: zh at most 24 characters, en at most 48 characters. One sentence, a small story of finding or keeping it.
- `where`: reuse existing keys; add a new key only for a really new place (at most 30 keys in total).
- ids: lowercase English, `[a-z][a-z0-9-]*`, never reused.

## E3. Checks the tests must enforce (add to `tests/petsouv.test.mjs`)

- Grid shape and characters; at least 30 non-`.` pixels; contains `k`; uses at least 3 of `k d m p`.
- No two grids identical, and no two grids differing in fewer than 12 pixels.
- Names unique per language; length limits above; zh name has no Latin letters; en text matches `^[A-Za-z][A-Za-z .,'-]*$`
  for names; lines have no emoji and no `<` `>`.
- Counts: total >= 300, each season >= 60, any >= 60; every `where` key has zh and en text.

## E4. The contact sheet

`tools/souvenir-sheet.mjs` (Node, Playwright like readme-shots.mjs; adapt `briefs/pet-souvenirs/render-sheet.mjs`): load
runtime/petsouv.js and runtime/strings.js in node:vm, write one PNG per season into `out/souvenir-sheet/` (gitignored or
outside the repo), each item at 6x with id, zh / en name, line and where. Usage: `node tools/souvenir-sheet.mjs <outDir> [season]`.
The dispatcher looks at every sheet (DeepSeek reads images) and sends back items that do not read as their name.
Copy the final five sheets to the PR description? No: report their paths; Claude collects them.

## Must NOT change

Everything in brief.md's list, plus: the 23 existing grids and texts, batch 1's grids and texts, Parts A-D behaviour
other than the two numbers above.
