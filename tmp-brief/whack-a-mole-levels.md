# Dev brief: whack-a-mole 4.2.0 (打地鼠 / Mole Bop) — 闯关 Levels

Delete this tmp-brief/ folder in your last commit.

App: registry/apps/whack-a-mole/index.html (plain HTML canvas, ~25 KB, NOT lo-game). Read it fully first,
plus sdk/UI.md, SPEC.md section 4 (buttons) and tests/e2e-whack-a-mole.test.mjs.
You may split the code into src/*.js with `<script data-src="src/x.js"></script>` and run
`node tools/bundle-app.mjs registry/apps/whack-a-mole` (optional; only if it helps readability).

## What to build
1. Title screen (replaces today's text menu). Three buttons, each >= 44 px tall: 闯关 / LEVELS, 60 秒 / 60s,
   无尽 / ENDLESS; today's bests line below, exactly as now. Leave a 160 x 160 slot above the buttons for a
   title picture that comes later (for now show the app name in big text there; NO new pixel art).
2. Level list: 10 levels in a grid of >= 44 px cells, each shows its number and 0-3 stars (no emoji: draw
   small filled/hollow squares or diamonds with fillRect, or plain "*" text). Level 1 open; level n+1 opens
   when level n has >= 1 star. Locked cells look dark and only play PAD.sfx("err"). A back button to the title.
3. Level card before each level: "第 n 关 / LEVEL n", the target score, and a one-line hint when the level
   brings something new (table below). Tap or A starts; B goes back to the list.
4. A level = 30 s in the same garden with today's hole/sprite code. Score rules as the 60 s mode (combo bonus
   every 5th, gold +3, mine -2 and play goes on). Stars: score >= target 1, >= ceil(target*1.2) 2,
   >= ceil(target*1.4) 3. Tally: score, stars earned, a "new best" line if more stars than before; buttons
   下一关 / NEXT (only with >= 1 star and n < 10), 再来 / AGAIN, 关卡 / LEVELS.
5. Thief mole (new; levels 7-10): rises like a mole but stays ~70 % as long; if not hit before it sinks, it runs
   once to another free hole (a short visible dash between the holes, ~250 ms), rises there and stays the normal
   time. Hit in the first hole = normal +1; hit in the second hole = +3. It never runs twice. Mark it on the
   existing mole sprite with one tiny addition (a dark mask band across the eyes, a few fillRect pixels); real
   art comes later.
6. Transitions: a 0.3 s wipe (an ink band sweeping across) between title, list, card, play and tally. Simple;
   input works as soon as it ends.

## Level table
| L | new (hint)            | cap | helmet | gold | thief | mines | speed p range |
|---|-----------------------|-----|--------|------|-------|-------|---------------|
| 1 | 普通地鼠，砸就对了      | 2   | no     | no   | no    | no    | 0.00-0.10 |
| 2 | -                     | 3   | no     | no   | no    | no    | 0.10-0.25 |
| 3 | 戴头盔的要砸两下        | 3   | yes    | no   | no    | no    | 0.15-0.30 |
| 4 | -                     | 3   | yes    | no   | no    | no    | 0.30-0.45 |
| 5 | 金地鼠：快，+3          | 3   | yes    | yes  | no    | no    | 0.35-0.50 |
| 6 | -                     | 4   | yes    | yes  | no    | no    | 0.45-0.60 |
| 7 | 小偷没砸到会换洞跑      | 3   | yes    | yes  | yes   | no    | 0.50-0.65 |
| 8 | 冒火花的雷别碰          | 4   | yes    | yes  | yes   | yes   | 0.55-0.75 |
| 9 | -                     | 4   | yes    | yes  | yes   | yes   | 0.70-0.90 |
|10 | 全部来了，更快          | 4   | yes    | yes  | yes   | yes   | 0.85-1.00 |
In the 60 s mode stay time and spawn gap follow p (0..1 over the run). In a level, p goes linearly from p0 to p1
over its 30 s, so the same spawn()/step() code serves all modes. Gold and helmet chances in levels: the same
formulas as today but without the "after 8 s / after 15 s" delays. Put the table in ONE data array
LEVELS = [{target, cap, helmet, gold, thief, mines, p0, p1, hint: {zh, en} | null}]. Hints short: zh <= 14
characters, en <= 28 (write English ones too).
Targets: a decent player gets 1 star easily on L1-3 and needs care on L8-10; 3 stars should be hard. Estimate by
counting spawns per 30 s at each p range (write a tiny node script if helpful, not committed), then aim 1 star at
about 55 % of the possible points and 3 stars at about 77 %.

## Saves
New key `levels` = {v:1, stars:[10 numbers 0-3]}. Malformed -> all zeros, never throw. A value with v > 1 -> show
all zeros and never write over it. Stars only ever go up.

## Must NOT change
- `best60`, `bestEndless`, `bestEndlessTime`: same keys, same meaning, read and shown as today.
- The 60 s and endless rules, timing and scoring (with MODE "60"/"endless" the spawn maths must give exactly the
  same numbers). Existing tests in tests/e2e-whack-a-mole.test.mjs must still pass unchanged.
- Sound rate limits (max 20/s), existing sounds. No chin pad (`"buttons"` stays off; touch only).
- Four tones only. No new canvas-to-canvas drawImage after putImageData. No emoji. Hit boxes as today.
- `window.__mole` keeps its fields (add `level`, `screen`, `starsFor` if useful).
- SPEC.md, runtime/, sdk/, other apps. Do NOT draw new pixel-art moles (the owner is making a sprite sheet).

## Version and files
manifest.json version 4.2.0; descriptions mention 10 levels (zh + en). Then
`node tools/check-app.mjs registry/apps/whack-a-mole` and `node tools/build-index.mjs` (index.json must be in sync;
run `git fetch --unshallow` first if the clone is shallow).

## Tests (run only these, never the full node --test)
- `node --test tests/e2e-whack-a-mole.test.mjs` (Playwright).
- Add to that file: (a) starsFor(score, target): 0/1/2/3 at the thresholds; (b) unlock: saved stars [1,0,...] ->
  level 2 open, level 3 locked; (c) old bests survive: best60=77, bestEndlessTime=95 saved -> the title shows them,
  and finishing a level leaves those keys alone; (d) a malformed `levels` save does not break the title;
  (e) a thief not hit runs to another hole exactly once.
- `node tools/check-app.mjs registry/apps/whack-a-mole`; `node --test tests/repo-rules.test.mjs` (or whichever test
  file checks index.json sync).

## Commit
Small commits on this branch, messages ending with
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
