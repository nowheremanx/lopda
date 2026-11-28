# 玄机阁 / Oracle: the almanac shop (luck-compass 2.0.0)

Status: approved by the owner 2026-11-27, being built on branch `claude/project-thread-58ngz6`, one PR.
This file is the brief for the coding agent, part by part. Read CLAUDE.md, SPEC.md (sections 6.4 motion and
6.5 notes), sdk/UI.md and sdk/LO-GAME.md first.

## Goal

The registry app `luck-compass` (神位罗盘 / LuckyWay 1.0.1) grows into 玄机阁 / Oracle 2.0.0: an old almanac and
fortune shop with five sections. The compass stays exactly as it is. The app `daily-slip` (每日一签 1.2.0) moves in
whole and leaves the store. Nothing goes online; all data ships in the app.

## Must NOT change (every part)

- Nothing under `runtime/`, `sdk/`, `SPEC.md`, `tools/` (except the two lines of `tools/launch-video.mjs` in part 5).
  Do not touch RUNTIME_VERSION or `runtime/sw.js`. No other registry app.
- The app id stays `luck-compass`. Never reuse `daily-slip` for anything.
- The compass: `src/luck.js` tables and functions (GODS, jdn, dayIndex, pillar, gods, sector), the day change at
  0:00, the dial drawing, the sensor handling, its keys. Every existing case in `tests/luck-compass.test.mjs` stays
  as it is; only add cases.
- 每日一签: the 108 slips (text, grades, order), `slotFor(dateKey)` exactly as in daily-slip, the note title
  (每日一签 / Daily fortune) and the one line per day it appends. The app writes to notes only when the player asks.
- Permissions: exactly `["motion", "notes"]`. Four tones only, no emoji, no network, no `drawImage` after
  `putImageData`, `lo-game` 1.4.0 unmodified (bundle-app fills it).
- Content: only the old books' own words and gentle plain lines. No fate verdicts about illness, death, money or
  disaster. 八字 only lays out the chart. Keep the line 旧历书上的说法，图个吉利 / Old almanac lore, just for luck.

## Tests while working

Run only: `node --test tests/luck-compass.test.mjs` (plus any new test file you add), `node tools/check-app.mjs
registry/apps/luck-compass`, and after any `src/` change `node tools/bundle-app.mjs registry/apps/luck-compass`.
Never the full `node --test`. Commit and push after each part.

## Structure

- `src/luck.js`: unchanged (compass maths).
- New pure files, each one global object, no DOM, no PAD, loaded in node:vm by the tests:
  `src/almanac.js` (ALMANAC: lunar date, solar terms, pillars, 建除, 黄道/黑道, 冲煞, 宜忌, 彭祖),
  `src/slips.js` (SLIPS: the 108 slips and `slotFor`), `src/yi.js` (YI: the 64 hexagrams, casting, changing lines),
  `src/bazi.js` (BAZI: four pillars, 纳音, five-element counts).
- `src/app.js`: the screens. One `LoGame.create({ width: 216, height: 240 })`, one scene per section plus the
  counter. The compass scene is today's scene moved as is.
- Saves (`PAD.save` keys; wrap every `PAD.load` in catch and say so on screen, never overwrite what you could not
  read, per SPEC section 8):
  `slip` {dateKey, slip, written} (same shape as daily-slip's), `gua` {v:1, day, lines:[6 numbers 6|7|8|9]},
  `bazi` {v:1, y, m, d, hour} (hour 0-23 or null for unknown).

## Screens (216 x 240 canvas; design for the 331 x 359 frame, check at 386 x 738)

Counter (opening screen, not remembered): the title art band on top (part 5; until then a plain title), then five
rows of at least 44 css px, each a section name and today's one-line summary:

| Section | Summary line | Inside | Keys |
|---|---|---|---|
| 老黄历 Almanac | 宜 嫁娶 出行 · 忌 动土 (first two of each) | one tear-off page: Gregorian date and weekday, lunar date (闰 marked), 干支 year/month/day, 生肖, the solar term if one falls today (else "距 X 还有 N 天"), 建除 value and 黄道/黑道 with its 十二神 name, 冲 X 煞 方, 彭祖百忌 (two lines), 宜 and 忌 lists, a row "喜神 东北 · 财神 ..." that opens the compass on the same day | Left/Right a day (a short page-tear animation), START today, A on the gods row opens the compass |
| 每日一签 Fortune | 未抽 / 第 37 签 上上 | the cup; A, a tap or a shake (`PAD.on("shake")` while motion is granted) draws; once a day; shows grade and verse | A draw, START writes to notes (same title and line as daily-slip) |
| 罗盘 Compass | 喜神 东北 | today's compass scene unchanged | as now |
| 八卦 Hexagram | 今日未占 / 地天泰 | think of one question, cast six lines (A, a tap or a shake each; three coins: 3 heads 9 old yang, 3 tails 6 old yin, else 7/8), then the primary and changed hexagram: figure, name, 卦辞, 大象; once a day (re-entering shows the day's cast). SELECT flips to the 八卦 chart: the eight trigrams in the 后天 ring, tap one for its image (天地雷风水火山泽), family and direction | A cast, SELECT chart, Up/Down scroll text |
| 八字 Chart | 未填 / 日主 辛金 | first time: a date picker (year/month/day and 时辰 or 不知道); then the four pillars in a grid, 纳音 under each, the five-element counts as bars, 生肖, 日主. One person only. START edits | arrows edit, A confirm |

B goes back to the counter from every section (and closes panels first). START and SELECT as listed. Text pages
wrap with `g.wrap` and scroll with Up/Down. Section icons: part 5 (until then none).

## Data rules

- Lunar dates and solar terms 1900-2100: copy the INFO / TERMS tables and lookup from `runtime/lunar.js` into
  `src/almanac.js` (same author, MIT; say so in a comment). A test checks that both give the same lunar date and
  term for every day of 2020-2030 and on spot dates 1901, 1950, 2099.
- Day pillar: `LUCK.pillar` (0:00 change). Year pillar changes at 立春 (the day of the term), month pillar at each
  节 (立春, 惊蛰, 清明 ...) by 五虎遁, hour pillar by 五鼠遁.
- 八字 only: 23:00 or later counts as the next day (子初换日) for the day and hour pillars. Unknown hour = three
  pillars. No true solar time.
- 建除十二值: 建 falls on the day whose branch equals the month branch (month by 节), then 除 满 平 定 执 破 危 成 收 开 闭.
  黄道/黑道 by the standard 青龙 明堂 天刑 朱雀 金匮 天德 白虎 玉堂 天牢 玄武 司命 勾陈 sequence starting from the
  month's 青龙 day. 冲: the opposite branch's 生肖; 煞: 申子辰 煞南, 寅午戌 煞北, 亥卯未 煞西, 巳酉丑 煞东 (by day branch).
- 宜忌: from 6tail lunar (github.com/6tail/lunar-javascript, `LunarUtil.DAY_YI_JI` and its lookup, which follows
  协纪辨方书). First open its LICENSE file: it must be MIT. If it is not, stop and report. Keep the licence text in
  `registry/apps/luck-compass/src/LICENSE-lunar-javascript`, a comment at the top of the data naming the source and
  version, and add one entry each to LICENSING.md and NOTICE. Store only what the lookup needs; test 6 dates against
  values you computed with the library itself (write them into the test as constants).
- 彭祖百忌: the 10 stem lines and 12 branch lines (甲不开仓财物耗散 ...), public domain.
- 周易: 64 names, 卦辞 and 大象 in Chinese (public domain). English: a short plain line per hexagram written by
  you, or a short excerpt of Legge's 1882 translation (public domain); not any modern translation.
- 108 slips: move them from `registry/apps/daily-slip/index.html` as they are into `src/slips.js`, in order;
  `tests/luck-compass.test.mjs` checks that the count is 108, the order and text equal daily-slip's (read from its
  page while it still exists; in part 5 freeze the first lines and a hash into the test), and that `slotFor` gives
  the same index as daily-slip's for 400 dates.

## Parts (commit and push after each; the first push opens a draft PR)

1. Counter + compass + 每日一签: `src/app.js` gets the counter and section switching, the compass scene moves in
   unchanged, the slip section (SLIPS, save `slip`, shake, notes). Manifest: version 2.0.0, permissions motion +
   notes, keep name and icon for now. Tests: slips and slotFor.
2. 老黄历: `src/almanac.js` and its scene. Tests: lunar/term parity with runtime/lunar.js, pillars (2000-01-01 戊午
   day; 2026-02-03 still 乙巳 year, 2026-02-04 丙午 year; a 节 boundary for the month), 建除 / 黄道 on 3 known days,
   宜忌 on 6 dates.
3. 八卦: `src/yi.js` and its scene. Tests: all 64 hexagrams unique by lines, name lookups for a few (乾 坤 泰 否
   既济 未济), changed hexagram for given lines, a seeded cast is reproducible.
4. 八字: `src/bazi.js` and its scene. Tests: 4 known charts including one before 立春, one at 23:30, one with unknown
   hour; 纳音 of 甲子 is 海中金.
5. Finish: title art and icons (Claude provides the PNGs), manifest name 玄机阁 / en `Oracle`, new description
   (zh: 老黄历、每日一签、罗盘、八卦、八字，一间小小的旧历书铺。旧书上的说法，图个吉利。 en: An old almanac shop:
   the day's almanac, a fortune slip, a compass, the I Ching and your birth chart.), glyph 玄. Remove
   `registry/apps/daily-slip`, `tests/daily-slip.test.mjs`, `tests/e2e-daily-slip.test.mjs` and the daily-slip test in
   `tests/e2e.test.mjs`; replace it with a luck-compass e2e (counter opens, each section opens and B returns, a slip
   draws once a day, START writes the note through the dialog). `registry/order.json`: drop daily-slip.
   `docs/design/v1.md`: the notes demo is now luck-compass. `tools/launch-video.mjs`: the two daily-slip entries
   point to luck-compass. `node tools/build-index.mjs` (after `git fetch --unshallow` if the clone is shallow).

## iPhone checklist for the owner (goes in the PR, Chinese)

- 柜台五行都能点进去，B 回来；老黄历左右翻页，和手机日历的农历、节气对一下。
- 罗盘和以前一模一样；从老黄历的神位行跳过去是同一天。
- 摇一摇抽签，一天一支；写进记事本时会弹确认，笔记在「来自 app」下面。
- 八卦摇六次出卦，退出再进还是今天那一卦。
- 八字填自己的生日，四柱和你知道的对一下。
- 商店更新时会提示新增「记事本」权限；每日一签不在商店了，手机上已装的还能打开。
