# CLAUDE.md

Lo-PDA: a fictional 1986 four-tone handheld, built as a PWA that runs on a phone.
Built-in programs plus a community app store of small sandboxed HTML apps.
Owner: Haowei Wu. Repo: https://github.com/nowheremanx/lopda.
Design history and open questions: `docs/decisions.md`. Read it before changing behaviour.

## Layout

```
runtime/        the PWA: index.html, core.js (shared LP object: utils, views, sound, home, chin pad), apps/*.js (one file per
                built-in), boot.js (loaded last), strings.js (zh/en text), lopda.css, platform.js (IndexedDB store, file export),
                chip.js (sound chip: MML music, custom sound effects, ambience presets; shared with sdk/dev.html),
                lunar.js (lunar calendar + solar term tables, 1900-2100), stardict.js (StarDict reader), bookparse.js (TXT/EPUB parser),
                books/ (the reader's two public-domain sample books), sw.js (offline cache),
                fonts/ (DotGothic16, VT323, OFL), vendor/binjgb/ (Game Boy core, MIT), vendor/holiday-cn/ (China days off, MIT),
                vendor/ecdict/ (abridged ECDICT in StarDict format, MIT + WordNet licence)
sdk/            MIT. pad-shim.js (PAD bridge), lo-game.js (game framework), LO-GAME.md, lo-3d.js (3D), LO-3D.md, PROMPT.md,
                dev.html (app harness), template/, template-game/, template-vn/ (visual novel), fonts/ (lopix12, OFL)
registry/       index.json (generated) + apps/<id>/{manifest.json,index.html,src/ (optional sources)}
tools/          check-app.mjs, build-index.mjs, bundle-app.mjs (+ lo-game.mjs alias), lo-game-lib.mjs (Node 20+, no deps);
                gen-lunar.py (one-off generator of the lunar table, needs PyEphem); gen-ecdict.mjs (one-off, ECDICT csv ->
                vendor/ecdict/) with stardict-write.mjs (StarDict + dictzip writer, also used by tests)
tests/          node:test suite (no deps): tools, strings, PAD shim, platform store, lo-game, repo rules;
                runtime-shots.mjs (before/after screenshots of the runtime), hko-compare.mjs (lunar table vs the HKO tables, manual)
SPEC.md         app spec lopda/1 (MIT)
LICENSE NOTICE LICENSING.md CONTRIBUTING.md
```

## Stack

- Plain HTML/CSS/JS. No npm dependencies, no framework. The runtime has no build step; an app may
  keep its source in `src/` and use `tools/bundle-app.mjs` to fill it into its single `index.html`.
- Runtime JS is ES5-style (`var`, `function`, one IIFE per file, no ES modules, no build step). index.html loads
  core.js, then apps/*.js, then boot.js. Files talk only through `window.LP`. Tools are Node ESM.
- Storage: IndexedDB through `platform.js`, a small document store (`doc(path)`, `collection(path)`;
  doc paths have an even number of segments, base `data/users/local`), and `files` (get/put/del of Blobs and typed arrays,
  its own database `lopda-files`) for large binary data.
- Built-ins, one file each in runtime/apps/: notes, calendar (万年历; lunar.js, holiday-cn, the one built-in that may reach
  another site, decisions.md section 14), dict (词典; stardict.js, built-in ECDICT, imported StarDict books in
  `LopdaPlatform.files`, `LP.dict.lookup(word)` for other programs, decisions.md section 15), reader (阅读器; bookparse.js, books, their dithered pictures and imported fonts in
  `LopdaPlatform.files`, layouts and an e-ink full refresh, long-press or SELECT selection that looks up through `LP.dict` and quotes (underline + `LP.notes.append`),
  decisions.md sections 16-17), camera (viewfinder, film, contact card; shares its film
  helpers as `LP.film`), cutter, cart (GB), store (app store, preinstalled apps, sandboxed runner, file dialog), settings.
  Paint and the calculator are community apps (`registry/apps/paint`, `calculator`), installed on first start
  (`PREINSTALL` in store.js; their files are in sw.js SHELL). The LCD fonts ship in runtime/fonts/ (OFL). Each registers with
  `LP.builtin({id, label, icon, view, open, ...hooks})`; the home screen draws them in registration order
  (the order of the script tags). Hooks are listed at the top of core.js.

## Run and test

```sh
python3 -m http.server 8086            # from the repo root; the runtime loads ../sdk and ../registry
# http://localhost:8086/runtime/       the handheld   (add ?debug for window.LOPDA_DEBUG)
# http://localhost:8086/sdk/dev.html?app=registry/apps/<id>   one app with buttons and a log
node tools/check-app.mjs registry/apps/*     # must pass
node tools/bundle-app.mjs registry/apps/<id>  # fill src/, lo-3d, lo-game + font blocks (after any src/ or text change)
node tools/build-index.mjs                   # after changing any registry app
node --test                                  # the test suite; must pass
```

- `node --test` runs `tests/*.test.mjs` with no dependencies. Browser scripts (strings.js, platform.js,
  pad-shim.js, lo-game.js) run in `node:vm` with small fakes (platform.test.mjs has an in-memory
  IndexedDB). It also guards repo rules: index.json in sync, RUNTIME_VERSION = sw.js VERSION,
  zh/en keys complete, lo-game hash released, SHELL files exist, every runtime/*.js is loaded by index.html and listed in SHELL (add new files to both).
- `tests/app-vm.mjs` runs a bundled app in Node with a fake DOM and a manual clock. `tests/frame-hashes.mjs`
  uses it to prove a change leaves every frame identical (VecDream, and zhenyao-tower's scripted scenes in
  `tests/zhenyao-play.js`); `tests/zhenyao-budget.test.mjs` checks the per-frame triangle and light budget
  (decisions.md 12.2); `tests/zhenyao-perf.mjs` measures frame times in Chromium.
- `tests/runtime-shots.mjs` proves a runtime change leaves the screen alone: `capture <repoRoot> <outDir>` drives every built-in
  in Chromium (fixed clock, seeded random, a generated fake camera) and saves screenshots plus the film/cut downloads;
  `compare <dirA> <dirB>` checks them pixel by pixel. Capture a worktree of main and your tree, then compare.
- `tests/e2e.test.mjs` boots the runtime and every registry app in headless Chromium; it skips unless
  Playwright is installed (`npm i --no-save playwright && npx playwright install chromium`).
- Deeper UI checks (camera, cartridge) have been Playwright scripts against
  Chromium (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` for the camera;
  `--disable-site-isolation-trials` or screenshots of sandboxed iframes come out blank), plus
  manual checks on an iPhone. iPhone Safari is the target that matters.
- Live camera, offline cache and the share sheet need HTTPS (or localhost).
- In e2e tests, tap inline text (a word, an underline) at the middle of one of its `getClientRects()`, never at the middle
  of its `boundingBox()`: text that wraps has a box whose middle falls between lines, and where lines break depends on the
  fonts of the machine running the test (a reader test passed in CI and failed elsewhere for exactly this reason).

## App spec (summary; SPEC.md is the source of truth)

- An app is one self-contained `index.html` (≤ 512 KB) plus `manifest.json`. Spec `lopda/1`
  (`lopda/0` still accepted). Optional `"buttons": true` shows the chin pad.
- Runs in `<iframe sandbox="allow-scripts">` with CSP `default-src 'none'; script-src 'unsafe-inline';
  style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'`.
  No network, no eval, no storage APIs, no alert/confirm/prompt, no emoji.
- Four tones only: ink `#1f2a14`, dark `#4a5a32`, mid `#7d8a58`, paper `#a3ad7e`.
- Manifest `"permissions"`: `[]` or `["files"]` (`PAD.exportFile` / `PAD.importFile`, each call confirmed by the runtime's
  own dialog, one file ≤ 2 MB; registry/apps/paint is the example).
- PAD API: `PAD.load/save/remove` (256 KB per app), `PAD.exit`, `PAD.TONES`, `PAD.spec`,
  `PAD.on("press"|"release", fn)`, `PAD.off`, `PAD.isDown`, `PAD.sfx(name)`,
  `PAD.lang` ("zh" | "en", undefined on runtimes before 0.4.0). Manifest may add `i18n.{zh,en}.{name,description}`.
- Buttons: `up down left right a b start select`. Keyboard: arrows, X=A, Z=B, Enter=START, Shift=SELECT.
- Sounds: `tap tick move ok err hit miss coin win lose`. Max 20 per second per app (named and custom together).
- Music and custom sounds (runtime 0.11.0+, `runtime/chip.js`, SPEC.md 6.3): `PAD.music.play(song, {loop})` / `stop()`,
  song = `{bpm, p1, p2, tri, noise}` in MML (≤ 8 KB); `PAD.sfx({wave, duty, from, to, ms, attack, decay, vol})`.
  `PAD.music` is undefined on older runtimes. The named sounds live in chip.js too (since 0.13.1, unchanged), so dev.html plays them.
  `PAD.sfx({... vibrato: {depth, rate}})` and `PAD.ambience(name, level)` / `PAD.ambience(null)` (runtime 0.13.0+): presets
  `rain waves waterfall wind fire stream`, level 0-1, one at a time under the music, about 1 s fades; music and ambience
  calls are each limited to 4 a second.
- Games may use `sdk/lo-game.js`: the app keeps an empty `<script data-lo-game="1.4.0">` block and
  `tools/bundle-app.mjs` fills it, plus a `data-lo-font` block with only the glyphs the app uses.
  The checker accepts only unmodified released copies (`sdk/lo-game.versions.json`). When you change
  lo-game.js: bump its VERSION, add the new hash to versions.json, re-run the tool on apps.
- `data-lo-3d` (`sdk/lo-3d.js`, `sdk/LO-3D.md`, `sdk/lo-3d.versions.json`) follows the same rules as lo-game.
  An app may keep sources in `src/` and include them with `<script data-src="src/x.js"></script>`;
  the checker requires index.html to match src/ (run bundle-app.mjs).

## License rules (do not break)

- The whole repo is MIT (Copyright (c) 2026 Haowei Wu). Earlier versions were PolyForm
  Noncommercial; the owner relicensed them as MIT too.
- The name "Lo-PDA" and its icons are not licensed: forks published for others need their own name.
- Registry apps: only `MIT 0BSD BSD-2-Clause BSD-3-Clause ISC Apache-2.0 CC0-1.0 Unlicense`.
- Third-party code or assets: permissive/OFL only, licence file kept next to them, listed in
  LICENSING.md and NOTICE. No GPL code (it would make the project GPL). No game ROMs anywhere.
- Never use other people's IP (names, characters, sprites, story) in apps, including "ports" of
  old games: make original homages.
- Music and sound effects must be original, or public domain (classical, folk) with the source named next to
  the score. No transcriptions, including old game music, however short. The platform supports formats; what users
  bring is up to them, but nothing the platform ships or the store lists may carry music it may not share.

## Code style and conventions

- Keep files dependency-free and readable; comment why, not what. UI text is short Chinese and English:
  every runtime string lives in `runtime/strings.js` (`tr(key, vars)` in the runtime scripts); add both languages.
  Only zh and en (see docs/decisions.md section 11).
- Every pixel the user sees on the LCD is one of the four tones. Output images (film, cards)
  may use a roll's tint palette. No emoji anywhere (the runtime strips them in apps).
- Write pixels with `putImageData` into ImageData. Do not `drawImage` a canvas onto another canvas
  after `putImageData`: Safari swaps red and blue on that path.
- On touch, `pointerdown` does not grant user activation. Anything that opens the share sheet
  or the system camera must run on release (`pointerup`) or from a real click.
- Views must fit one screen without scrolling when they are "hardware" (camera, cartridge).
- Bump `RUNTIME_VERSION` in core.js and `VERSION` in sw.js together on every runtime change;
  Settings → 检查更新 compares them.
- Buttons in built-ins: A confirms, B goes back or cancels, on every screen, menu, list and dialog. START is the
  screen's extra action (dictionary: add to the word book; calendar: go to a date; reader's word cursor: quote), SELECT is free. Leaving a program is the
  HOME key's job. Games are different: during play an app maps A and B as it likes (SPEC.md section 4, decisions.md 3).
- Design rule: a change should remove a decision from the user, or at least not add one.
  Prefer realism (how the real device or film behaves) over convenience.
- Commits: end messages with the Co-Authored-By line the session asks for. Never push to `main`: work on a branch,
  the owner merges PRs. Cloud sessions push their own branch and open a PR; local sessions commit and leave pushing to the owner.
- Accounts: never create anything on the owner's accounts outside this repo's branches and PRs (no gists, repositories,
  issues or comments elsewhere) and never upload files to third-party hosts. If something can't be attached
  (screenshots, GIFs), say so in the PR description and keep the files out of the repo.
