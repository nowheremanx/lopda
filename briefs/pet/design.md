# Built-in pet 小拾 / 芯仔: design (decided 2026-10-24)

Source: the owner's design thread and the Claude Doc "内置电子宠物设计（草案）"
(https://claude.ai/artifact/HrbqL2xAwUKvUewokx6g38). This file is the self-contained copy for implementers.
Art: `art/` (see art/README in brief.md). Where a number below was a proposal, the owner has said "build it from the
existing design", so the proposals are the defaults; they are marked (default) where the owner never chose explicitly.

## 1. What it is
- A built-in program (like the dictionary or the calendar), one home-screen icon. Program label (default): zh 小拾, en Chip. The species is 芯仔 (a microchip that came alive inside the machine).
- Like the original 1990s virtual pets, but it NEVER dies, never gets sick, never runs away.
- It knows a little about the device (an upcoming date, the word book, an unfinished book, undeveloped film, today's
  diary) and at most once a day SHOWS one of these with a prop. It never talks, never nags, never pops up anything.
- Only active while its screen is open: no notifications, no sounds elsewhere, nothing in other programs.
- Outside its screen the only trace is the home icon's tag (the small text under the icon), and only on a day it has
  brought something back that you have not looked at yet; otherwise the tag is empty.
- No numbers that pressure: no "affection 73%", no streaks. State shows as pictures.
- It reads no content: no note text, no book text, no photos, no calendar names.

## 2. Look: style B "小屋" (the room)
- The LCD shows the pet's room (see art/rooms-all.png, art/B-room.png): 4 css px per pixel, an 81 x 60 grid under the
  status bar; window (follows real time: day sky / night sky with moon; season/solar term may change small details),
  a wall calendar showing today's day of month, a bookshelf, a bed, a bowl, a rug, a wooden floor.
- Night with the light off: every tone inside the room one step darker (paper->mid->dark->ink), Zz in paper tone.
- Under the room: one row of 8 icons (food, play, wash, light, look, box, mail, call). The selected icon has a frame;
  unselected icons are mid tone; "call" turns ink only when the pet wants something (the only "reminder").
- Soft keys as every built-in: SELECT (none), START 信 (mail shortcut), B 返回, A 用.
- Four tones only. Low frame rate: each action 2 frames at 2 frames per second. A beep + the icon flashing 3 times when a
  state changes. No smooth animation.

## 3. The pet 芯仔
- Sprites: art/chipart.js (`chip(o)` builds every frame from one base grid; `adult(id)`; CHIP_EGG, CHIP_BABY, CHIP_CHILD).
  Props, icons, souvenirs: art/art.js (P, ICON, SOUV). Tones: k ink, d dark, m mid, p paper, . transparent.
- Actions (art/chip-actions.png): idle 1/2, blink, eat 1/2, happy, walk 1/2, sleep, waiting for food, surprised, holding a prop.
- Growth: egg (a capsule with a chip inside) -> baby -> child -> adult.
- Random markings rolled at hatch (art/chip-marks.png): antenna 4 (ball, stick, fork, bent), pattern 4 (plain, dot,
  stripe, trace), eyes 3 (dot, bar, big) = 48 looks. Stored, never change.
- Personality: one of 3 traits rolled at hatch (default: 好动 lively, 贪睡 sleepy, 好奇 curious). Only numbers: how
  often it goes out, sleep hours, idle animation speed. No extra art.
- Adult form (6, art/chip-actions.png bottom): decided once, when it becomes adult, by which programs the owner used most:
  book 书虫 (reader), walk 走路家 (camera + darkroom), scholar 学者 (dictionary), diary 日记家 (notes), monster 小怪兽
  (cartridge + community apps), plain 普通 (no category above 30% of uses). Never changes after.

## 4. Time model
- No background: on every open, catch up from `last` to now in 1-hour steps. Randomness seeded by (born + date), so
  reopening on the same day shows the same story.
- Four values, all with floors:
  | value | change | low means | floor |
  | hunger 0-5 | -1 every 4 awake hours | sits by the empty bowl, "call" lights | 0: just waiting, no harm |
  | joy 0-5 | -1 every 6 awake hours; + play, snack, pat, looking at its souvenir, the owner doing things in other programs | turns its back, looks down | one pat fixes it, no grudges |
  | mess 0-3 | a poop 2-3 h after a meal | small piles on the floor | max 3, never sick |
  | close (hidden) | only rises: each care action, each day opened | (nothing) | decides small habits, e.g. waving when you open |
- Sleep 22:00-7:00 local time (trait sleepy: 21:30-7:30); no hunger loss while asleep. Light off after 20:00 makes it
  go to bed early. Opened at night: it rubs its eyes, looks at you, sleeps again.
- Away < 1 day: plain catch-up. 1-3 days: hungry and a bit dirty but jumps with joy. >= 3 days: the room is empty with a
  sign "去远行了"; A brings it walking back in with a postcard souvenir; hunger 3, joy 3, mess 0.
- Clock set backwards: treat as no time passed. Forwards: treat as away. No anti-cheat (nothing to gain).
- Growth counts DAYS OPENED, not calendar days: baby after hatching (first open, about 60 s, cannot be skipped), child on
  the 3rd day opened, adult on the 10th.

## 5. Outings and souvenirs
- At most once a day, in the daytime, it goes out (seeded per day). If you open while it is out, the room is empty for a
  short while and it walks back in with a souvenir. Never more than one a day; after travelling only the postcard.
- Without AI: a souvenir from the built-in table (aim ~60 over time; start with what art/art.js has plus new ones),
  avoiding recent repeats.
- With AI (LP.ai.on()): one call per day (see 7). Same screen flow; the user cannot tell, except more variety.
- Souvenirs go into the box (icon 箱): one per page, name + one line + picture + date; A on a page can paste it into a
  note through `LP.notes.append` (title "小拾的纪念品", text = name and line).

## 6. What it reads from the system (read-only summaries, no content)
| source | summary function | prop it shows | A on it |
| calendar's own dates (birthdays etc., lunar too) | `LP.calendar.upcoming(days)` -> [{in}] NO NAMES | holds a little flag with the number of days | open the calendar on that day |
| solar terms / holidays | lunar.js, holiday data already in the calendar | small outfit or prop (scarf at 立冬, mooncake at 中秋) | none |
| dictionary word book | `LP.dict.bookSummary()` -> {n, newest} and `LP.dict.pickWord(seed)` -> one word | hugs a word card | card shows the word; A again shows its meaning via `LP.dict.lookup`, one word only, no review mode |
| reader | `LP.reader.current()` -> {id, pct, opened} | sits on a stack of books | open that book (only when not opened for 7 days) |
| notes diary | `LP.notes.diaryDays()` (exists) | after 20:00 with no diary today: chews a pen at a desk | open today's diary (`LP.notes.openDiary`) |
| darkroom | `LP.darkroom.summary()` (exists) | holds a film roll when rolls wait | open the darkroom |
| usage counts | new: core.js counts each built-in open | none; decides the adult form | - |
- Pick of the day: on the first open of a day, list the candidates that hold today, order by urgency
  (date in 0-1 days > diary > word > book > film), drop the kind shown yesterday, and with the day's seed pick one of the
  first two. On about half the days show nothing at all. Ignored props are put away; never repeated the next day.
- Reward the other way: doing things elsewhere (reviewing words, finishing a chapter, writing a diary, developing a roll)
  makes it a bit happier next time, sometimes with a matching small item. It never says "well done".
- Never reads community apps' data, scripts or game saves.

## 7. AI layer (optional, LP.ai from settings.js; decisions.md section 34 stays: no PAD.ai for apps)
- When: the day's outing, program open, LP.ai.on(), online. At most one call a day.
- Sends: form, age in days, mood word, time of day, season, today's solar term or holiday name, categories of things done
  this week ("read", "took photos", "studied words"), the names of the last few souvenirs, and ONE word from the word book
  (default; never the book title).
- Never sends: any note or diary text, calendar date names, photos or negatives, book content, highlights or quotes,
  scripts, app saves, settings, any identifier.
- Asks for JSON {name <= 8 chars, line <= 40 chars, px: 16 strings of 16 chars "0"-"3"}. Strict check: JSON parses,
  lengths, no emoji, plain text only (never HTML), 16x16 digits 0-3. Anything wrong, timeout 30 s, no signal, no
  credit: silently use a built-in souvenir. No retry, no error message.
- Settings' AI page gets one line saying what the pet sends each day (zh + en).
- Picture method A (text grid). If the drawings turn out bad, fall back: AI gives name + line, picture from the built-in set.

## 8. Data and backup
- `data/users/local/pet` {v:1, species:"chip", room:"chip", born, last, hunger, joy, mess, close, opened (days opened),
  lastDay, stage, form, marks:{ant,pat,eye}, trait, light, today:{day, shown, out, back}, travel}.
- `data/users/local/pet/souvenirs/<id>` {name, line, px (256 tone indices as a string), at, ai:boolean} (< 1 KB each).
- `data/users/local/usage` {counts:{<builtin id>: n}}.
- All three are in the whole-device backup automatically (platform dumpAll). The AI key stays out (unchanged).
- Restoring an old backup = a long absence = travelling. No special code.
- Storage failure: it still lives on screen, the status bar shows 未存档 as today; never re-creates an egg over a pet it
  could not read.
- Start over: long-press A in 看 (look), the runtime's own two-step confirm; the souvenir box is kept.

## 9. Species packs ("DLC" later; build the shape now, ship one pack)
- Nothing in the program is hard-wired to 芯仔: a species pack = {id, names, sprites (frames builder or grids), markings,
  adult forms, trait ranges, room}. First version ships only "chip".
- Packs are art and numbers only, no code, built-in only (never community: the pet reads system data).
- The save stores species and room ids, so adding a pack later needs no migration.
- More pets later VISIT each other's rooms (one pet per room, switch rooms; generic interaction animations drawn once per
  species). They never live together. Not in this version.
