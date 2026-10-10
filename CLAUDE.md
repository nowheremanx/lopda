# CLAUDE.md

Lo-PDA: a fictional 1986 four-tone handheld, built as a PWA that runs on a phone.
Built-in programs plus a community app store of small sandboxed HTML apps.
Owner: Haowei Wu. Repo: https://github.com/nowheremanx/lopda.
Design history and open questions: `docs/decisions.md`. Read it before changing behaviour.

## Layout

```
runtime/        the PWA: index.html, lopda.js (all built-ins), strings.js (zh/en text), lopda.css, platform.js (IndexedDB store,
                file export), sw.js (offline cache), vendor/binjgb/ (Game Boy core, MIT)
sdk/            MIT. pad-shim.js (PAD bridge), lo-game.js (game framework), LO-GAME.md, lo-3d.js (3D), LO-3D.md, PROMPT.md,
                dev.html (app harness), template/, template-game/, template-vn/ (visual novel), fonts/ (lopix12, OFL)
registry/       index.json (generated) + apps/<id>/{manifest.json,index.html,src/ (optional sources)}
tools/          check-app.mjs, build-index.mjs, bundle-app.mjs (+ lo-game.mjs alias), lo-game-lib.mjs (Node 20+, no deps)
tests/          node:test suite (no deps): tools, strings, PAD shim, platform store, lo-game, repo rules
SPEC.md         app spec lopda/1 (MIT)
LICENSE NOTICE LICENSING.md CONTRIBUTING.md
```

## Stack

- Plain HTML/CSS/JS. No build step, no bundler, no npm dependencies, no framework.
- Runtime JS is ES5-style (`var`, `function`, one IIFE in lopda.js). Tools are Node ESM.
- Storage: IndexedDB through `platform.js`, a small document store (`doc(path)`, `collection(path)`;
  doc paths have an even number of segments, base `data/users/local`).
- Built-ins in lopda.js: notes, pixel paint, pixel camera, strip cutter, cartridge player (GB),
  app store + sandboxed runner, settings.

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
  zh/en keys complete, lo-game hash released, SHELL files exist.
- `tests/e2e.test.mjs` boots the runtime and every registry app in headless Chromium; it skips unless
  Playwright is installed (`npm i --no-save playwright && npx playwright install chromium`).
- Deeper UI checks (camera, cartridge) have been Playwright scripts against
  Chromium (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` for the camera;
  `--disable-site-isolation-trials` or screenshots of sandboxed iframes come out blank), plus
  manual checks on an iPhone. iPhone Safari is the target that matters.
- Live camera, offline cache and the share sheet need HTTPS (or localhost).

## App spec (summary; SPEC.md is the source of truth)

- An app is one self-contained `index.html` (≤ 512 KB) plus `manifest.json`. Spec `lopda/1`
  (`lopda/0` still accepted). Optional `"buttons": true` shows the chin pad.
- Runs in `<iframe sandbox="allow-scripts">` with CSP `default-src 'none'; script-src 'unsafe-inline';
  style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'`.
  No network, no eval, no storage APIs, no alert/confirm/prompt, no emoji.
- Four tones only: ink `#1f2a14`, dark `#4a5a32`, mid `#7d8a58`, paper `#a3ad7e`.
- PAD API: `PAD.load/save/remove` (256 KB per app), `PAD.exit`, `PAD.TONES`, `PAD.spec`,
  `PAD.on("press"|"release", fn)`, `PAD.off`, `PAD.isDown`, `PAD.sfx(name)`,
  `PAD.lang` ("zh" | "en", undefined on runtimes before 0.4.0). Manifest may add `i18n.{zh,en}.{name,description}`.
- Buttons: `up down left right a b start select`. Keyboard: arrows, X=A, Z=B, Enter=START, Shift=SELECT.
- Sounds: `tap tick move ok err hit miss coin win lose`. Max 20 per second per app.
- Games may use `sdk/lo-game.js`: the app keeps an empty `<script data-lo-game="1.2.0">` block and
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

## Code style and conventions

- Keep files dependency-free and readable; comment why, not what. UI text is short Chinese and English:
  every runtime string lives in `runtime/strings.js` (`tr(key, vars)` in lopda.js); add both languages.
  Only zh and en (see docs/decisions.md section 11).
- Every pixel the user sees on the LCD is one of the four tones. Output images (film, cards)
  may use a roll's tint palette. No emoji anywhere (the runtime strips them in apps).
- Write pixels with `putImageData` into ImageData. Do not `drawImage` a canvas onto another canvas
  after `putImageData`: Safari swaps red and blue on that path.
- On touch, `pointerdown` does not grant user activation. Anything that opens the share sheet
  or the system camera must run on release (`pointerup`) or from a real click.
- Views must fit one screen without scrolling when they are "hardware" (camera, cartridge).
- Bump `RUNTIME_VERSION` in lopda.js and `VERSION` in sw.js together on every runtime change;
  Settings → 检查更新 compares them.
- Design rule: a change should remove a decision from the user, or at least not add one.
  Prefer realism (how the real device or film behaves) over convenience.
- Commits: end messages with the Co-Authored-By line the session asks for. The owner pushes.
