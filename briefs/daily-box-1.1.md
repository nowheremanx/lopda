# Brief: daily-box 1.1.0 (每日推箱 / DailyBox), batch 3 "deepen"

Today: one puzzle a day from a 1099-day table (day 0 = 2026-10-26), first result of a day kept in `box`
{v:1, days:{"YYYY-MM-DD": {pushes, moves, ms, peeked}}}, a streak, the board in progress in `box-now`, a
first-start help screen (`box-help`), pause menu Resume / Restart / Show answer / How to play. The board
art is already decent. What is thin: the first screen is a wall of help text, a missed day is lost for good,
and there is nothing to look back on.

Read first: CLAUDE.md, sdk/UI.md section 11, registry/apps/daily-box/src/*.js, its tests
(`grep -ln daily-box tests/`).

## Goal
1. **Title screen instead of the help wall.** A title screen (the owner's 160 x 160 picture goes here later;
   until then a plain placeholder: the existing crate sprite large, the name in lopix12 2x) with two rows:
   "今天 11/26" (or "今天 ✓" stamp when solved) and "日历 / Calendar". The help text moves behind "How to
   play" only. On the very first day, the first puzzle shows one line in the footer instead:
   "推箱子到记号上，B 撤销 / Push crates onto marks. B undoes." for its first 6 seconds. Remove the
   automatic help screen; keep the `box-help` key read (no longer needed, never delete it).
2. **Calendar.** A month grid (Mon-first, like the table's weeks), D-pad / touch to move, LEFT/RIGHT at the
   edge or the month header arrows change month, from the epoch month to the current month. Each past day
   shows a stamp: solved at par (pushes == par, not peeked) = filled ink stamp; solved above par = ring;
   solved with the answer peeked = small dot; unsolved past day = blank; today = an outlined box; future
   days greyed (tone 2) and not selectable. A opens that day's puzzle. The footer shows the selected day's
   result ("18 推 · 3:12" or "未解 / Unsolved"). Above the grid: current streak and the month's par count.
3. **Back-play.** Playing a past day records it in `box.days[thatDay]` exactly like today (first result
   kept), so it gets its stamp, but **a streak only counts days solved on the day itself**: add `late: true`
   to an entry recorded on a later date, and `streakCount` skips late entries. Old entries have no `late`
   and keep counting. `box-now` gains the day it belongs to (it already has `date`); resuming must reopen the
   right day.
4. **Clear tally.** After a solve: the stamp drops onto the day in a small calendar strip (the week row),
   with the existing win sound; then "A 日历 / A calendar  B 再看看 / B look".

## Saves (data safety first)
- Only add fields (`late`). Never rewrite or drop existing day entries; `normalizeBox` must keep `late`.
- The 400-day trim stays. A failed read keeps `boxWritable` false as today.

## Must NOT change
SPEC, runtime, the level table and its generator, board.js rules, par numbers, the answer replay, the
first-result-kept rule, undo, the key map during play, any other app. lo-game copy only via bundle-app.
Four tones only, no emoji, ≤ 512 KB, sdk/UI.md 44 px targets on touch.

## Tests (only these while working)
- `node tools/bundle-app.mjs registry/apps/daily-box && node tools/check-app.mjs registry/apps/daily-box`
- the existing daily-box tests, extended: late entries don't extend a streak, old entries still do; a past
  day's solve gets recorded under that day; `box-now` resumes the right day; the calendar never selects a
  future day or a day before the epoch.
- `node tools/build-index.mjs` at the end. Version 1.1.0.

## Workflow notes (foreman)
- Work in your own worktree `../lopda-dailybox` on branch `claude/project-thread-4hrsx9` (fetch it from origin;
  this brief is its first commit). Never switch branches in the main tree; other threads use it.
- Test server port: 8093 (other threads run on other ports).
- Edit only `registry/apps/daily-box/**`, `tests/daily-box.test.mjs` and, at the end, `registry/index.json`
  (via build-index; `git fetch --unshallow` first if the clone is shallow). Rebuild the index after every app change
  before committing.
- Lay out the title screen and the calendar for 331 x 359 first (smallest screen), then check 390 x 500.
- Delete this `briefs/` file in the last commit.
- Commit after each goal (1-4). Do not push; the foreman pushes.
