# Brief: the acoustic link as a system API (LP.link / PAD.link), Radio rework, gomoku over the link

Design (source of truth): `docs/design/radio.md` sections 7 and 8. Read them, plus CLAUDE.md, before each part.
Branch: `claude/project-thread-gjztuo` (this brief lives in `briefs/`; delete `briefs/` in the last part).
Runtime target: 0.57.0 (bump RUNTIME_VERSION in core.js and VERSION in sw.js together, once, in part C).
decisions.md: new section 45 in part G (Chinese, same style as section 44).

## Rules for every part

- Runtime JS is ES5 style: `var`, `function`, one IIFE per file, no modules, talks through `window.LP` (pure files also export
  via `module.exports` like `runtime/acoustic-link.js`). Pure files: no DOM, no Web Audio, no timers, no Date.now (time is passed in).
- Every UI string in `runtime/strings.js`, zh and en. Four tones only. A confirms, B backs out, on every screen and dialog.
- Run ONLY the tests named in the part. Never the full `node --test`.
- Commit at the end of each part with a clear message, push. Draft PR after part A.
- Report: what changed, tests run and their output, anything you could not do.

## Must NOT change (any part)

- `runtime/acoustic.js` tones, preamble, thresholds, `decode`/`synth` behaviour (part A may add exports only).
- Any other built-in (notes, calendar, dict, reader, camera, snap, darkroom, studio, cart, pet, settings beyond the permission list), any
  registry app other than `gomoku`, lo-game / lo-3d and their versions files, the backup format, existing PAD APIs and their messages.
- `PAD.mic` behaviour, except: while a link is open `PAD.mic.start()` returns "none".
- gomoku's single-player game, its AI and its save key `gomoku_wins`.

## Part A: incremental receiver + frame v2 (pure)

- New `runtime/acoustic-rx.js` (`LopdaAcousticRx`): `create({sampleRate, rates:[10,20,40]})` -> `{push(float32Array, t0Sample), mute(fromSample, toSample), frames()}`.
  Keeps a bounded ring (≤ 4 s), computes `toneWindow` (reuse acoustic.js) only for new grid points per rate (1/8 symbol), correlates the
  preamble incrementally, then reads the 9-byte v2 header, then the rest of the frame by its length, and returns decoded byte arrays with
  `{rate, startSample, bytes}`. Muted spans count as silence. After a frame is returned, search resumes after its end.
- `runtime/acoustic-link.js` v2 per radio.md 8.2: header `version type session seq ack length(1)`, payload ≤ 60, MORE flag 0x80,
  types HELLO 1, HELLO_ACK 2, DATA 3, ACK 4, BYE 5, PING 6. `hello({port, nonce, proto})` / `parseHello(payload)`; `port(appId)` = FNV-1a 32.
  Version-1 frames are rejected.
- Tests: update `tests/acoustic-link.test.mjs`; new `tests/acoustic-rx.test.mjs`: frames synthesised with acoustic.js at 10/20/40 ms,
  48 k and 44.1 k, pushed in 4096-sample blocks, two frames back to back, noise, a muted span hiding a frame, a frame split over blocks,
  and a CPU guard (push 60 s of noise; must finish well under 60 s of wall time — print the time).
- Run: `node --test tests/acoustic.test.mjs tests/acoustic-link.test.mjs tests/acoustic-rx.test.mjs`.

## Part B: session layer (pure)

- New `runtime/acoustic-session.js` (`LopdaAcousticSession`), radio.md 8.3. `create({port, proto, random})` returns an object driven by
  `tick(nowMs)`, `heard(bytes, nowMs)`, `sent(nowMs)` (the burst finished playing), `send(data)`, `close()`; it emits actions through
  `poll()`: `{do:"tx", bytes, rate}`, `{do:"open", initiator}`, `{do:"message", data}`, `{do:"result", id, v:"sent"|"lost"|"closed"}`,
  `{do:"close", reason}`, and a `busy(nowMs)` input for carrier sense. Symmetric pairing with random backoff, rate stepping 10/20/40,
  piggybacked ack, stop-and-wait with random backoff (5 tries), PING every 25 s idle from the initiator, 3 missed = lost, BYE,
  fragmentation of ≤ 200-byte messages into ≤ 60-byte DATA, duplicates re-acked and dropped, other port/proto -> close "other-app".
  Strings travel as UTF-8 with a 1-byte kind tag (0 text, 1 bytes) on the first fragment.
- Tests `tests/acoustic-session.test.mjs`: two sessions over a fake half-duplex channel with a manual clock (air time from frame length
  and rate, both talking at once = both lost): pairing (incl. simultaneous start), initiator is exactly one side, message both ways,
  200-byte message, 20 % frame loss still delivers in order, lost peer, BYE, wrong port, wrong proto, queue full.
- Run: `node --test tests/acoustic-session.test.mjs tests/acoustic-link.test.mjs`.

## Part C: LP.link host + pairing overlay

- New `runtime/link.js` (loaded after core.js, before apps; add to index.html and sw.js SHELL), radio.md 8.4: `LP.link.open({port, proto,
  label})` -> Promise "open"|"cancelled"|"none"|"busy", `send`, `close`, `state`, `initiator`, `on(fn)`. One mic stream for the whole link
  (play-and-record; ambient after, same as sensors.js), mute own playback (50 ms before, 250 ms after, AudioContext time), fixed tx level,
  `visibilitychange` hidden -> BYE + close. Transport object: acoustic by default, BroadcastChannel with `?linkfake` (simulated air time,
  optional `?linkloss=0.2`).
- Pairing overlay over the current view (like apps/snap.js): text, progress, chosen rate, B cancels. Status-bar antenna mark while open.
- Bump runtime to 0.57.0.
- Run: `node --test tests/strings.test.mjs tests/repo.test.mjs` and a short Playwright smoke:
  two pages with `?linkfake` open Radio's link (after part E) — for now, a debug call `LP.link.open` from both pages reaching "open".

## Part D: PAD.link

- `sdk/pad-shim.js`: `PAD.link` per radio.md 8.5 (undefined unless the runtime passes `link:true`), messages `op:"link"` both ways
  documented in its header. `runtime/apps/store.js`: permission `"link"`, first-open dialog like the sensors, grant listed in Settings
  (传感器与权限), HOME/app exit closes the link, mic conflict rule. `tools/check-app.mjs`: `PAD.link` needs `"link"`.
  `sdk/dev.html`: BroadcastChannel peer between two tabs plus an "echo peer" button. `SPEC.md` 6.8. Store permission icon + strings.
- Tests: `tests/pad-shim.test.mjs` (link messages), `tests/check-app.test.mjs` (checker), strings.
- Run those named files only.

## Part E: Radio rework

- radio.md 8.6: main menu 连线 / 说明 / 仪表; guide pages; link page with log, 写字 (≤ 60 chars), 画图 (16×16 four-tone editor:
  d-pad, A paint, SELECT tone, START send, B back, touch), 断开; log of 30 in `data/users/local/radio`; 仪表 = live four-tone dB bars
  and noise floor + the M2 known-sequence test. Remove the old M3 one-shot flows. Fits 331×359, no scrolling on hardware-like screens
  except the log.
- Messages: text = string; picture = Uint8Array(64) with tag byte handled by the session. Validate everything received.
- Run: an e2e in `tests/e2e.test.mjs` (or a new `tests/e2e-link.test.mjs`): two pages `?linkfake`, connect, send text both ways and a
  picture, check both logs. Screenshots of each Radio screen at 331×359 into a folder outside the repo; list their paths.

## Part F: gomoku 1.6.0 over the link

- radio.md 8.7. Manifest version 1.6.0, `"permissions": ["link"]`, description mentions 对战 in both languages. Comment the link code
  so others can copy it. Then `node tools/check-app.mjs registry/apps/gomoku` and `node tools/build-index.mjs`.
- e2e: two pages `?linkfake` play five moves each way, a duplicate move is ignored, a disconnect + reconnect resyncs.

## Part G: finish

- decisions.md section 45 (Chinese): what was decided and why (message-level API, symmetric pairing, quiet idle, copy-not-move,
  encryption in apps, mic always on during a link). CLAUDE.md: new files in Layout, PAD.link in the app spec summary, Radio line.
  README/README.zh: one line for Radio's link and PAD.link. Delete `briefs/`.
- The reviewer (not the dev) runs the full suite once.
