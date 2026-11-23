# Brief: Sensor Desk (传感器台), a reference app for PAD.motion and PAD.mic (issue #188)

Foreman: Claude. Dev: opencode-go/deepseek-v4.1-flash. Remove this file before the PR (or keep it out of the PR branch).

## Goal

A small, plain **instrument app** that shows every reading SPEC.md 6.4 gives, live, with the line of code that produced it,
and every state an app has to handle: allowed, denied, no sensor, an old runtime. It is the one canonical example app
makers (and their agents) copy for tilt, shake, heading, loudness and pitch. Tilt Maze and Blow Candles stay the game examples.

Read first: `SPEC.md` 6.4, `sdk/UI.md` (all, especially sections 2, 3, 6, 9), `registry/apps/tilt-maze/index.html` and
`registry/apps/blow-candles/index.html` (how they start/stop and fall back), `CLAUDE.md` (app rules, four tones, no emoji).

## The app

- Folder `registry/apps/sensor-desk/` with `manifest.json` and `index.html` (single file, no lo-game, no src/ needed).
- Manifest: `"spec": "lopda/1"`, `"id": "sensor-desk"`, name `传感器台`, i18n en `Sensor Desk`, `"category": "education"`,
  `"permissions": ["motion", "mic"]`, no `"buttons"` (touch only, it is a meter, not a game), version `1.0.0`,
  author `Haowei Wu`, licence `MIT`, an original 16x16 four-tone icon (a small gauge or spirit level), glyph `感`.
  Descriptions zh/en, one sentence: what it shows and that it is the example for app makers.
- Text in zh and en following `PAD.lang` (zh default). Four tones only. Design for 331x359; one scrolling main area;
  every button ≥ 44 px tall, ≥ 8 px apart; ink text on paper.

### Screen (top to bottom, one scrolling column)

1. **Tilt section** (`倾斜` / `Tilt`)
   - State line: one of 没开 / 开着 / 未允许 / 这台手机没有 / 系统太旧（要 0.24.0+）, mapped from `PAD.motion` being undefined,
     and `start()` resolving `"on" | "denied" | "none"`.
   - Buttons: `开` / `关` (one toggle button: start() or stop()), `归零` (`PAD.motion.zero()`, disabled while off).
   - A square bubble level drawn with putImageData (see CLAUDE.md: never drawImage a canvas onto a canvas after putImageData):
     a cross-hair, a filled dot at (x, y) and a hollow ring at (flat.x, flat.y) when `flat` exists.
   - Value rows, each `label  value  code`: `x`, `y`, `flat.x`, `flat.y` (show `-` when flat is undefined, runtime < 0.35.0),
     `heading` (degrees plus the 8-point name 北/东北/... N/NE/...; `无罗盘` / `no compass` when null).
     The code column is a short dim (`#4a5a32`) text like `t.x`, `t.flat.y`, `t.heading`.
   - Shake: a counter `摇了 N 次` and the row flashes (inverts) for 300 ms on each `shake` event.
2. **Sound section** (`声音` / `Sound`)
   - Same state line and a `开` / `关` toggle for `PAD.mic.start()` / `stop()`.
   - A horizontal level bar (0-1, 32 steps) with the number, and a small peak mark that falls back slowly.
   - Pitch: Hz and the nearest note name with octave (A4 = 440 Hz, e.g. `440 Hz  A4`), `-` when `pitch` is null.
   - One hint line: the mic stays on only while this is 开; the phone's silent switch does nothing while it is on (SPEC 6.4).
3. **Code card** at the bottom: a short block (pre, wraps) with the minimal correct pattern from SPEC 6.4 (check `PAD.motion`
   exists, `PAD.on("tilt")`, `start().then(r => ...)`, `stop()`), in English, as a copy-reading aid. Not a button, no clipboard.

### Behaviour

- Hold the last value between events (SPEC: events come only when a value changes). Redraw at most once per animation frame.
- Nothing starts by itself: the player taps 开. Stopping the mic when not needed is the point of the example: say so in a comment.
- When the runtime stops the sensors (HOME, hidden page) and comes back, it restarts them itself; the app's state line must stay
  true: keep it from the last `start()` result and the user's toggle, do not guess.
- No saves at all (`PAD.save` is not used). Sounds: `PAD.sfx("tap")` on the toggles is enough, within the 20/s limit.
- The code is the product: comment *why* at each PAD call (what the result values mean, why stop matters, why flat may be
  undefined). Keep it plain ES5-ish readable JS, no build step, under ~40 KB.

## Must NOT change

- Anything in `runtime/`, `sdk/`, `SPEC.md`, `tools/`, `docs/` (except nothing), and every other app under `registry/apps/`.
- No save formats, no new PAD calls, no new permissions beyond the two above.
- `registry/index.json` changes only through `node tools/build-index.mjs`.
- In `tests/e2e.test.mjs`: only append new tests at the end of the sensor section; do not edit existing tests or helpers.

## Tests (run only these; never the full `node --test`)

- `node tools/check-app.mjs registry/apps/sensor-desk` must pass; then `node tools/build-index.mjs`.
- `node --test tests/repo*.test.mjs` (index in sync).
- Add e2e tests next to the tilt-maze ones (reuse `sensePage`, `runDemo`, `press`, `until`):
  1. motion: tap 开, A on the runtime dialog allows, a fake tilt reaches the app and the `x` row shows it; 关 stops (state 没开).
  2. mic: B on the dialog -> state 未允许, the toggle stays 开-able; a second tap asks again.
  3. the page fits 331x359 with no horizontal scroll and every button ≥ 44 px tall.
  Run them with `node --test --test-name-pattern="sensor-desk" tests/e2e.test.mjs` (Playwright: link it into node_modules if needed).
- Also open it in `sdk/dev.html?app=registry/apps/sensor-desk` and check the tilt pad / mic sliders drive it (manual, one screenshot).

## Done = one PR

Branch `sensor-desk` from main, one PR, body ends with a Chinese iPhone checklist (开倾斜、归零、摇一摇、开声音唱一个音看音名、
按 HOME 再回来、设置里撤销权限后再开). Say in the PR that DeepSeek wrote the code and Claude briefed and reviewed.
