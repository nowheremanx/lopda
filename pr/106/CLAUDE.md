# CLAUDE.md

Lo-PDA: a fictional 1986 four-tone handheld, built as a PWA that runs on a phone.
Built-in programs plus a community app store of small sandboxed HTML apps.
Owner: Haowei Wu. Repo: https://github.com/nowheremanx/lopda.
Design history and open questions: `docs/decisions.md`. Read it before changing behaviour.

## Layout

```
runtime/        the PWA: index.html, core.js (shared LP object: utils, views, sound, home, chin pad), apps/*.js (one file per
                built-in), boot.js (loaded last), strings.js (zh/en text), lopda.css, platform.js (IndexedDB store, file export,
                dumpAll / replaceAll of both databases for the backup), backup.js (the whole-device backup zip: pack, check and unpack; pure functions),
                chip.js (sound chip: MML music, custom sound effects, ambience presets; shared with sdk/dev.html),
                speech.js (the phone's voices for the dictionary's 发音 and PAD.say; shared with sdk/dev.html),
                ai.js (the AI line: OpenRouter chat completions streamed with the user's own key, for the scripts' 生成; decisions.md section 34),
                sensors.js (tilt, shake, heading and the microphone's level and pitch for apps, the audio session; shared with sdk/dev.html),
                lenses.js (which physical camera lenses a phone has, pure functions), finder.js (the viewfinder's look: luma, the Bayer dither,
                exposure and contrast; shared by the camera, the snap viewfinder, the reader and sdk/dev.html), textsel.js (the text selection shared by the reader and the dictionary entry page), negative.js (the negative PNG and its lpDa chunk, pure functions),
                develop.js (developing a frame: the stocks' looks, grain, halation, leaks, date stamp; pure functions on RGBA),
                notetext.js (notes: tags, search and snippets, the diary title, the diaries by day, front matter, export names, the rules for app notes; pure functions),
                zip.js (stored zips written, stored and deflated zips read; pure functions, CRC from negative.js), qr.js (the runtime's QR helper: text to a module matrix, drawn with putImageData on the share page), lunar.js (lunar calendar + solar term tables, 1900-2100), stardict.js (StarDict reader), wordlist.js (the word list and the entries behind PAD.dict: check/query/entry and one source, shared by apps/dict.js, sdk/dev.html and the tests, SPEC.md 6.7), bookparse.js (TXT/EPUB parser),
                books/ (the reader's two public-domain sample books), sw.js (offline cache),
                fonts/ (DotGothic16, VT323, OFL), vendor/binjgb/ (Game Boy core, MIT), vendor/holiday-cn/ (China days off, MIT),
                vendor/ecdict/ (abridged ECDICT in StarDict format, MIT + WordNet licence),
                vendor/qrcode-generator/ (the share page's QR encoder, MIT)
sdk/            MIT. pad-shim.js (PAD bridge), lo-game.js (game framework), LO-GAME.md, lo-3d.js (3D), LO-3D.md, PROMPT.md, UI.md (app layout rules),
                dev.html (app harness), template/, template-game/, template-vn/ (visual novel), fonts/ (lopix12, OFL)
registry/       index.json (generated) + apps/<id>/{manifest.json,index.html,src/ (optional sources)}
tools/          check-app.mjs, build-index.mjs, bundle-app.mjs (+ lo-game.mjs alias), lo-game-lib.mjs, stamp-preview.mjs (Node 20+, no deps);
                readme-shots.mjs (the README pictures: docs/images/ in English, --lang=zh into docs/images/zh/ for README.zh.md; needs Playwright) with readme-scene.mjs (the lake the fake camera sees);
                gen-lunar.py (one-off generator of the lunar table, needs PyEphem); gen-ecdict.mjs (one-off, ECDICT csv ->
                vendor/ecdict/) with stardict-write.mjs (StarDict + dictzip writer, also used by tests)
tests/          node:test suite (no deps): tools, strings, PAD shim, sensors, speech, platform store, backup, lo-game, negative, develop, notetext, zip, repo rules;
                runtime-shots.mjs (before/after screenshots of the runtime), hko-compare.mjs (lunar table vs the HKO tables, manual)
SPEC.md         app spec lopda/1 (MIT)
README.md (English, the homepage) README.zh.md (Chinese) LICENSE NOTICE LICENSING.md CONTRIBUTING.md
```

## Stack

- Plain HTML/CSS/JS. No npm dependencies, no framework. The runtime has no build step; an app may
  keep its source in `src/` and use `tools/bundle-app.mjs` to fill it into its single `index.html`.
- Runtime JS is ES5-style (`var`, `function`, one IIFE per file, no ES modules, no build step). index.html loads
  core.js, then apps/*.js, then boot.js. Files talk only through `window.LP`. Tools are Node ESM.
- Storage: IndexedDB through `platform.js`, a small document store (`doc(path)`, `collection(path)`;
  doc paths have an even number of segments, base `data/users/local`), and `files` (get/put/del of Blobs and typed arrays,
  its own database `lopda-files`) for large binary data.
- Built-ins, one file each in runtime/apps/: notes (记事本 2.0: the list opens on 今天, today's diary with 那年今日; other notes open to read (no keyboard) until a tap or A; search, tags read
  from `#words` with the 日记 and 摘抄 groups (and 来自 app once an app has written, PAD.notes.append), pins, a trash kept 30 days, 发送到… and a zip of .md files out and in through notetext.js
  and zip.js; `LP.notes.append(title, text, sep)` for other programs, which records `src`; `LP.notes.diaryDays`, `diariesOn` and
  `openDiary(day, onBack)` for the calendar, over an index of diaries by day (notetext.js `diaryIndex`, dropped when the notes change,
  never stored); docs `notes/<id>` {body, updated, created?, pinned?, day?, src?, deleted?}; decisions.md section 20),
  calendar (万年历; lunar.js, holiday-cn, the one built-in that may reach another site, decisions.md section 14; a folded corner
  on days with a diary and a read-only 日记 block on the day sheet, START opens or backfills that day's diary in notes, only through
  those three functions, section 21), dict (词典; stardict.js, built-in ECDICT, imported StarDict books in
  `LopdaPlatform.files`, `LP.dict.lookup(word)` for other programs, decisions.md section 15; its entry page selects text through textsel.js and looks words up level by level, section 18; A on an entry says the headword with the phone's English voice), reader (阅读器; bookparse.js, books, their dithered pictures and imported fonts in
  `LopdaPlatform.files`, layouts and an e-ink full refresh, long-press or SELECT selection that looks up through `LP.dict` and quotes (underline + `LP.notes.append`),
  decisions.md sections 16-17), camera (viewfinder, film stocks, a colour latent image per frame in `LopdaPlatform.files`, SELECT cycles the
  physical lenses found by lenses.js; shares its film helpers as `LP.film`, its dither in finder.js), snap (apps/snap.js: the viewfinder an app opens with
  `PAD.camera.snap` over the running app, `LP.snap`; keeps nothing; decisions.md section 28), darkroom (冲洗店: the film box of unloaded rolls,
  negative export and import through negative.js, developing through develop.js (once per roll, `dev` {v, seed, at} in the roll; pictures are
  never stored, every look and print develops them again), the colour viewer, single / contact sheet / film strip prints; decisions.md section 19), cart (GB), store (app store: categories from the manifest's `category` (missing goes to Other), category filters, single and "update all" installs, preinstalled apps, sandboxed runner, file dialog), scripts (local HTML/JS programs: copy an AI prompt, paste, run in the sandbox; every script has its own storage document), settings (also 备份 / 恢复: the whole
  device as one `lopda-backup-YYYYMMDD.zip` through backup.js, every check before a restore replaces everything, the old data
  written back if a write fails; `data/users/local/backup-meta` {last}; decisions.md section 24; the main page is a short menu,
  the permissions list, backup, the share page (a QR code drawn on the device) and About have pages of their own; decisions.md section 37).
  Paint and the calculator are community apps (`registry/apps/paint`, `calculator`), installed on first start
  (`PREINSTALL` in store.js; their files are in sw.js SHELL). The LCD fonts ship in runtime/fonts/ (OFL). Each registers with
  `LP.builtin({id, label, icon, view, open, ...hooks})`; the home screen draws them in registration order
  (the order of the script tags). Hooks are listed at the top of core.js. `LP.keepAwake(on)` holds the screen wake lock
  (the reader's book page, a game, the viewfinder, a running app; decisions.md section 3).

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
- PR previews (`.github/workflows/pages.yml`, `pr/<n>/`) run `tools/stamp-preview.mjs`, which stamps RUNTIME_VERSION and the sw.js
  VERSION in the published copy as `<x>+<sha7>` of the PR head, so every push refreshes the phone's cache; the preview comment
  shows that version (compare it with Settings). Never commit stamped files; pushes to main are not stamped.
  `tests/stamp-preview.test.mjs` covers it.
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
- Manifest `"permissions"`: any of `"files"` (`PAD.exportFile` / `PAD.importFile`, each call confirmed by the runtime's
  own dialog, one file ≤ 2 MB; registry/apps/paint is the example), `"motion"` and `"mic"` (runtime 0.24.0+, SPEC.md 6.4:
  `PAD.motion` {start, stop, zero} with `PAD.on("tilt" | "shake")` (tilt `flat` is the absolute tilt from lying flat,
  runtime 0.35.0+), `PAD.mic` {start, stop} with `PAD.on("sound")`; coarse
  readings only, the runtime's dialog on an app's first start(), allowed apps listed in Settings, keys must also work;
  the mic sets `navigator.audioSession.type` to "play-and-record" and every way out sets "ambient" back; decisions.md section 23),
  `"notes"` (runtime 0.26.0+, SPEC.md 6.5: `PAD.notes.append(title, text)` -> "saved" | "denied", the runtime's dialog on every
  call, only into a note the app made itself, src `app:<id>`, title ≤ 64 characters, text ≤ 4 KB; decisions.md section 25),
  `"camera"` (runtime 0.28.0+, SPEC.md 6.6: `PAD.camera.snap({size})` -> {w, h, px} | null, px a Uint8Array of tone indices 0-3,
  "small" 128×112 or "large" 256×224; the runtime's dialog on an app's first snap (granted with the sensors, Settings → 传感器与权限),
  then its own viewfinder for every shot, the player presses the shutter; the runtime keeps nothing; decisions.md section 28),
  `"wordbook"` (runtime 0.36.0+, SPEC.md 6.7: `PAD.dict.inBook(words)` -> boolean[] | null and `PAD.dict.addWord` /
  `removeWord(word)` -> "saved" | "denied" | "full" | null, over the player's own word book, the same one the dictionary and
  the reader use; the runtime's dialog on the first add or remove, one grant per app, listed with the sensors in Settings;
  reading needs the grant too; decisions.md section 35).
- `PAD.say(text, {lang})` (runtime 0.26.0+, no permission, SPEC.md 6.5): the phone's voice through `runtime/speech.js` (shared with
  the dictionary's 发音), follows the volume, ≤ 200 characters, once a second, stops on HOME or a hidden page.
- `PAD.dict` (runtime 0.36.0+, no permission, SPEC.md 6.7): `PAD.dict.words({len, pattern, letters, level, max, offset})` ->
  `{words, more}` | null and `PAD.dict.lookup(word)` -> `{word, form?, zh, en}` | null, over the built-in ECDICT only
  (`runtime/wordlist.js`; imported books are not visible, and the ECDICT off switch does not apply),
  words in commonness order, ≤ 10 calls a second together, a bad query rejects, an unreadable dictionary is null;
  version "ecdict-1", frozen with lopda/1. With `"permissions": ["wordbook"]`, `PAD.dict.inBook(words)` -> boolean[] | null
  and `PAD.dict.addWord` / `removeWord(word)` -> "saved" | "denied" | "full" | null use the player's word book (headwords
  only, 2000 at most, shared with the dictionary and the reader; the runtime's dialog on the first add or remove, one grant
  per app, reading needs it too; Settings revokes it).
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
- App screens (registry apps, test apps too) follow `sdk/UI.md`: one scrolling main area, 44 px targets, ink text on paper,
  no chin pad unless the app needs it. Design for 331×359, the smallest screen.
- Every pixel the user sees on the LCD is one of the four tones. One exception (owner, 2026-10-15): the darkroom's photo
  viewer shows the developed picture in colour, "the print laid on the glass"; the rest of the darkroom, its menus and the
  develop animation stay four-tone (decisions.md section 19). Output images (prints, strips, contact sheets) are in colour.
  No emoji anywhere (the runtime strips them in apps).
- Write pixels with `putImageData` into ImageData. Do not `drawImage` a canvas onto another canvas
  after `putImageData`: Safari swaps red and blue on that path.
- On touch, `pointerdown` does not grant user activation. Anything that opens the share sheet
  or the system camera must run on release (`pointerup`) or from a real click.
- Views must fit one screen without scrolling when they are "hardware" (camera, cartridge).
- Bump `RUNTIME_VERSION` in core.js and `VERSION` in sw.js together on every runtime change;
  Settings → 检查更新 compares them.
- Buttons in built-ins: A confirms, B goes back or cancels, on every screen, menu, list and dialog. START is the
  screen's extra action (dictionary: add to the word book; calendar: go to a date; a text selection: the 摘抄 / 复制 menu), SELECT is free. Leaving a program is the
  HOME key's job. Games are different: during play an app maps A and B as it likes (SPEC.md section 4, decisions.md 3).
- Design rule: a change should remove a decision from the user, or at least not add one.
  Prefer realism (how the real device or film behaves) over convenience.
- Commits: end messages with the Co-Authored-By line the session asks for. Never push to `main`: work on a branch,
  the owner merges PRs. Cloud sessions push their own branch and open a PR; local sessions commit and leave pushing to the owner.
- Accounts: never create anything on the owner's accounts outside this repo's branches and PRs (no gists, repositories,
  issues or comments elsewhere) and never upload files to third-party hosts. If something can't be attached
  (screenshots, GIFs), say so in the PR description and keep the files out of the repo.
