# Implementation brief: the built-in pet (小拾 / 芯仔)

For the foreman thread on the Mac and the DeepSeek implementers/reviewers. Read in this order:
1. `briefs/pet/design.md` (what to build; every rule there is decided),
2. the repo's CLAUDE.md (conventions; they all apply),
3. `briefs/pet/art/` (the drawings: `chipart.js` + `art.js` hold the sprite grids; `*.png` show the intended result;
   `render.js` / `chiprender.js` are the mock-up renderer, a reference for the room layout only, not runtime code).

Base: current `main` (runtime 0.36.0). This work is runtime 0.37.0 and decisions.md section 37 (next free numbers;
if another PR merges first, take the next ones). Work on its own branch; one draft PR after the first push.
`briefs/` is a hand-off folder: do NOT copy it into the PR.

## Files

| file | new/changed | what |
| --- | --- | --- |
| `runtime/petsim.js` | new | pure functions, no DOM, no storage: `window.LopdaPet` = catch-up, seeded random, growth, adult form, travel, outing, pick of the day, souvenir validation, built-in souvenir choice. Like notetext.js / develop.js. |
| `runtime/petart.js` | new | the species pack "chip": sprite grids and the frame builder ported from `art/chipart.js` and the props/icons/souvenirs from `art/art.js`, plus a `drawRoom` that paints the room into ImageData (pure, takes a pixel buffer). |
| `runtime/apps/pet.js` | new | the built-in: view `v-pet`, input, storage, timers, sounds, AI call, opening other programs. Registers with `LP.builtin({id:"pet", ...})`, with `tag()` for the home icon. |
| `runtime/index.html` | changed | `<section class="view" id="v-pet" hidden>`; script tags: petsim.js and petart.js before core.js (with the other pure helpers), apps/pet.js after apps/cart.js and before apps/snap.js (home order: the pet after the cartridge). |
| `runtime/sw.js` | changed | add the 3 files to SHELL; bump VERSION to 0.37.0 |
| `runtime/core.js` | changed | RUNTIME_VERSION 0.37.0; usage counter in `show()` (see Part C); the pet's home icon may go in ICONS or be an `icon` function |
| `runtime/strings.js` | changed | every pet string, zh and en; one line on the AI page about what the pet sends |
| `runtime/lopda.css` | changed | only the pet's own classes (`.pet-...`) |
| `runtime/apps/calendar.js` | changed | add `LP.calendar = {upcoming(days), open(dayNumber)}` only |
| `runtime/apps/dict.js` | changed | add `bookSummary()` and `pickWord(seed)` to the existing `LP.dict` only |
| `runtime/apps/reader.js` | changed | add `LP.reader = {current(), open(id)}` only |
| `runtime/apps/settings.js` | changed | only the one AI-page line (via strings.js) if it needs markup |
| `docs/decisions.md` | changed | section 37: the pet (copy the decisions from design.md, short) |
| `CLAUDE.md` | changed | the layout list and the built-ins list get the pet, like the other built-ins |
| `tests/petsim.test.mjs`, `tests/petart.test.mjs`, `tests/pet-summaries.test.mjs` | new | see each part |
| `tests/e2e.test.mjs` | changed | one pet test (Part C) |

## What must NOT change
- SPEC.md, `sdk/`, `registry/`, pad-shim: no PAD.pet, no PAD.ai, nothing new for community apps.
- Every other built-in's screens and behaviour. The only edits allowed in calendar.js, dict.js, reader.js, notes.js,
  darkroom.js are the read-only summary/open functions listed above. Do not rename or move existing code there.
- The backup format (backup.js, platform.js), the AI key handling (`data/users/local/ai` stays out of backups),
  ai.js itself (use `LP.ai.ask` as it is).
- The four tones (`#1f2a14 #4a5a32 #7d8a58 #a3ad7e`): every pixel of the pet screen is one of them. No emoji.
- No network except through `LP.ai.ask`. No new third-party code or fonts.
- Runtime JS stays ES5 style (var, function, one IIFE per file, no modules); talk to other files only through `window.LP`
  (and `window.LopdaPet` / `window.LopdaPetArt` for the two pure files).
- Pixels: write with putImageData into ImageData. Never drawImage a canvas onto another canvas after putImageData (Safari
  swaps red and blue). Scale with CSS `image-rendering: pixelated` on a canvas sized in room pixels.
- Never `rm` or rewrite files outside the list above. Never push to main. Never run the full `node --test`.

## Parts (one commit or more each; push after each part)

### Part A: `runtime/petsim.js` + `tests/petsim.test.mjs`
Pure functions only (`now` and `tz` passed in; no Date.now() inside). Suggested API:
- `rng(seed)` small deterministic PRNG; `daySeed(born, dayKey)`.
- `fresh(now, rng)` -> a new save (egg, marks and trait rolled).
- `catchUp(save, now, ctx)` -> {save, events}: hourly steps from `last`; sleep window by trait and the `light` flag;
  hunger/joy/mess rules and floors (design.md 4); travel when away >= 3 days; clock backwards = no time.
- `openDay(save, dayKey)` counts days opened; `stage(save)` egg/baby/child/adult; `adultForm(usageCounts)`.
- `outingToday(save, dayKey, hour)`; `pickOfDay(candidates, yesterdayKind, seed)` (half the days null).
- `validateSouvenir(json)` -> clean {name, line, px} or null (lengths, emoji, 16 x 16 "0"-"3", plain text).
- `builtinSouvenir(seed, recentNames)`.
Tests (focused): catch-up after 1 h, 5 h, 30 h, 2 days, 4 days (travel); no hunger loss at night; floors never break;
clock backwards; same seed same day = same result; adult form thresholds incl. plain < 30 %; pickOfDay drops yesterday's
kind and returns null on about half of 1000 seeds (40-60 %); validateSouvenir rejects each bad input kind.
Run: `node --test tests/petsim.test.mjs`.

### Part B: `runtime/petart.js` + `tests/petart.test.mjs`
- Port `art/chipart.js` (chip(o), adult(id), egg/baby/child, markings) and the props/icons/souvenirs of `art/art.js`
  into a species pack object `PACKS.chip = {id, frames(o), adult(id), egg, baby, child, marks, props, icons, souvenirs}`.
  Keep the grids as text so they stay editable. Add more built-in souvenirs (16 x 16, original, four tones) toward ~20
  for now.
- `drawRoom(buf, w, h, scene)` paints the 81 x 60 room (layout as in art/rooms-all.png: window by time of day, calendar
  with today's day number, bookshelf, bed, rug, bowl full/empty, poops, the pet frame at a position, a prop, Zz, light-off
  darkening) into a Uint8Array of tone indices 0-3; pet.js turns that into ImageData.
Tests: every grid is rectangular and uses only `.kdmp`; every frame of `frames()` for all marks x faces is 16 x 16;
adult() is 20 x 20; drawRoom output contains only 0-3 and its size is 81 x 60; light-off maps each tone one step darker.
Run: `node --test tests/petart.test.mjs`.

### Part C: the program `runtime/apps/pet.js` (+ index.html, sw.js, core.js, strings, css, e2e)
- Screen (331 x 359 must fit, no scrolling; it is a "hardware" view): status bar as usual; the room canvas 81 x 60 room
  pixels shown at 4 css px; the 8-icon row (44 px targets); soft keys SELECT -, START 信, B 返回, A 用.
- Keys: left/right pick an icon, A use, B back (closes a sub-screen; on the main screen B does nothing, HOME leaves),
  START = mail, long-press A on the room = pat (joy +1, counts 3 times a day). Touch: tap an icon = select + use.
- Icons: food (meal: hunger +2; snack: joy +1, more than 3 snacks a day = a burp, nothing else), play (5 rounds: guess
  left/right which way it will look; >= 3 right joy +2 else +1; no losing state), wash (clears mess, a wave sweeps), light
  (toggle; off after 20:00 sends it to bed), look (age in days, weight, hunger and joy as 5 boxes; long-press A here =
  start over with the runtime's own two-step confirm), box (souvenirs, one per page, A = paste into notes via
  `LP.notes.append`), mail (today's pick, Part D; dark when none), call (ink only when it wants food or a wash).
- First open: the egg, hatches after about 60 s on screen (not skippable), a short original jingle via chip.js.
- Animation: 2 frames per action at 2 fps; a beep + icon flash x3 on state changes; sounds only while the view is open,
  through the existing SND/chip.js named sounds or tiny original MML.
- Storage through `S.db` like other built-ins; save on every change (debounced) and in `pause`/`leave`; read on `ready`.
  Docs and fields exactly as design.md 8.
- `tag()`: a short word (zh 带回了 / en new) only while an unseen souvenir waits; else "".
- core.js `show(name)`: when a built-in view opens, increment `data/users/local/usage` counts[builtin id] (one write,
  debounced; ignore failures). Count community app runs under "apps".
- `?debug`: `LOPDA_DEBUG.pet = {advance(hours), setDay(n), forceOuting(), forcePick(kind)}` so tests and the owner can
  see every state without waiting days. The egg's 60 s can be skipped only through debug.
- e2e (`tests/e2e.test.mjs`, one new test): boot with a fixed clock, open the pet, debug-hatch, feed, wash, look, light
  off -> darkened room pixels (sample the canvas), advance 80 h -> travel sign, A -> postcard in the box; every canvas
  pixel is one of the four tones.
Run: `node --test tests/petsim.test.mjs tests/petart.test.mjs` and the new e2e test only
(`node --test --test-name-pattern="pet" tests/e2e.test.mjs`), plus `node --test tests/repo.test.mjs tests/strings.test.mjs`
(SHELL, versions, zh/en keys).

### Part D: system summaries + 信 and the props
- calendar.js: `LP.calendar.upcoming(days)` -> [{in}] sorted, from the user's own dates (uses the existing nextOf),
  never names; `LP.calendar.open(dayNumber)` opens the calendar on that day.
- dict.js: `LP.dict.bookSummary()` -> {n, newest (ms)}; `LP.dict.pickWord(seed)` -> one word from the word book or null.
- reader.js: `LP.reader.current()` -> {id, pct, opened} of the most recently opened unfinished book or null;
  `LP.reader.open(id)`.
- pet.js: build the candidates (design.md 6), `pickOfDay`, show the prop in the room and on the mail icon; A on mail does
  the action in the table. The diary prop only after 20:00 with no diary today. Doing things elsewhere since the last
  open (counts from usage + summaries) gives a little joy.
- `tests/pet-summaries.test.mjs`: run calendar.js / dict.js / reader.js in node:vm with the fakes already used by other
  tests (see tests/helpers.mjs, platform.test.mjs) if practical; otherwise test the pure helpers you extract. Must show:
  upcoming() has no name field; pickWord is deterministic per seed.
Run: `node --test tests/pet-summaries.test.mjs tests/petsim.test.mjs`.

### Part E: AI souvenirs
- In pet.js, on the day's outing with `LP.ai.on()`: one `LP.ai.ask({messages, max})` call, 30 s cap, payload exactly as
  design.md 7 (write the prompt in petsim.js as a pure `aiPrompt(ctx)` so a test can assert what is and is not sent).
  Result through `validateSouvenir`; null -> built-in souvenir. No retries, no error text. `ai: true` on the souvenir.
- strings.js: the AI page line (zh: 「小拾每天出门时会发出：它的样子、季节、你这周做过的事的类别和单词本里的一个词；不发笔记、日子名字、照片。」 plus en).
- Tests in petsim.test.mjs: aiPrompt never contains note/calendar-name/book-title fields given a ctx that has them;
  contains at most one word.
Run: `node --test tests/petsim.test.mjs` and `node --test tests/ai.test.mjs`.

## Acceptance (the reviewer runs; Claude does the final check)
- Reviewer decides full suite vs partial and says why; at least everything named above plus `tests/backup.test.mjs`.
- Playtest at 331 x 359 in Chromium with `?debug`: every icon, egg -> adult via debug, travel, night, a pick of each kind,
  box -> notes. Screenshots of each state. Compare the room with `art/rooms-all.png`.
- PR body ends with a short Chinese checklist for the owner's iPhone: first open and hatching, feeding/wash/play by touch
  and keys, light off at night, leaving 3+ days (or debug advance), the mail prop opening the right program, the box
  pasting into notes, sounds following the volume, backup + restore keeps the pet.
- Report wall time and tokens (input/output/cache) per DeepSeek run.
