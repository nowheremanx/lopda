# Lo-PDA App Specification v1

Status: draft · Spec id: `lopda/1` (apps written for `lopda/0` keep working) · License: MIT (see `sdk/LICENSE`)

What v1 adds over v0: the chin buttons (`"buttons": true`, `PAD.on`, `PAD.isDown`) and
system sounds (`PAD.sfx`). Added later within v1, all optional: the player's language
(`PAD.lang`) and localized store text (manifest `i18n`), see section 6.1; files
(`"permissions": ["files"]`, `PAD.exportFile`, `PAD.importFile`), see section 6.2; music, sound effects of the
app's own and ambience (`PAD.music`, `PAD.sfx({...})`, `PAD.ambience`), see section 6.3; tilt, shake, heading and the
microphone's loudness and pitch (`"permissions": ["motion"]` / `["mic"]`, `PAD.motion`, `PAD.mic`), see section 6.4.

A Lo-PDA app is one self-contained HTML file plus a small manifest. The runtime
installs it from the registry, pins it to an exact version, and runs it inside
a sandboxed iframe on the handheld's four-tone screen.

## 1. Files

```
registry/apps/<id>/
  manifest.json   required
  index.html      required, the whole app in one file
```

No other files are loaded. Images, sounds and fonts must be embedded in
`index.html` (data: URIs, or drawn in code).

## 2. manifest.json

```json
{
  "spec": "lopda/1",
  "id": "whack-a-mole",
  "name": "打地鼠",
  "glyph": "鼠",
  "icon": ["................", "...16 rows of 16 characters..."],
  "version": "1.0.0",
  "description": "点黑格子里的地鼠，20 秒。",
  "i18n": { "en": { "name": "Mole Bop", "description": "Bop the moles in the dark holes. 20 seconds." } },
  "author": "Haowei Wu",
  "license": "MIT",
  "permissions": [],
  "buttons": true
}
```

| Field | Rule |
|---|---|
| `spec` | `"lopda/1"`. `"lopda/0"` is still accepted for apps that use none of the v1 features. |
| `id` | 3 to 32 characters: `a-z`, `0-9`, `-`. Same as the folder name. Never changes once published. |
| `name` | Shown under the icon. 1 to 8 characters. No emoji. |
| `glyph` | Exactly one character (a CJK character, letter or digit), used when there is no `icon` and for screen readers. No emoji. |
| `icon` | Optional. A 16×16 pixel icon: an array of 16 strings, each 16 characters long. `0` ink, `1` dark, `2` mid, `3` paper, `.` transparent (the tile shows through). |
| `version` | Semantic version `MAJOR.MINOR.PATCH`. Bump it on every change. |
| `description` | One sentence, 80 characters at most. |
| `i18n` | Optional. Store text in other languages: `{"en": {"name", "description"}, "zh": {...}}`. Only `zh` and `en`, only those two fields, same rules as above. The store and home screen show the entry for the player's language and fall back to `name` / `description`. |
| `author` | Name or handle. |
| `license` | One of: `MIT`, `0BSD`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `Apache-2.0`, `CC0-1.0`, `Unlicense`. |
| `permissions` | Array. Usually empty. Three capabilities (`lopda/1`): `"files"`, the app may export and import files, each time confirmed by the player (section 6.2); `"motion"`, tilt, shake and heading; `"mic"`, the microphone's loudness and pitch (both section 6.4, confirmed by the player the first time). The store shows them on the app's entry. Anything else fails the checker. |
| `buttons` | Optional, `lopda/1` only. `true` shows the chin buttons while the app runs (section 4). Leave it out for touch-only apps. |

## 3. The screen

- The app fills an iframe that is the handheld's screen: portrait, usually
  300 to 420 CSS pixels wide, height varies. Use `html,body{margin:0;height:100%;overflow:hidden}`.
- Four colors only. These are the whole palette:

| Token | Hex | Use |
|---|---|---|
| ink | `#1f2a14` | darkest, text |
| dark | `#4a5a32` | |
| mid | `#7d8a58` | |
| paper | `#a3ad7e` | lightest, background |

  `PAD.TONES` exposes the same values. Any other color fails review.
- Font: `monospace`. External fonts cannot load.
- No emoji. The runtime strips them; the screen has no color glyphs.
- Pixel art is welcome. Use `image-rendering: pixelated` on scaled canvases.
- Layout, touch targets, which tones may carry text, and the cursor: `sdk/UI.md`. Review reads apps against it;
  the checker cannot.

## 4. Input

- Touch first: use pointer events (`pointerdown`, `pointermove`, `pointerup`).
- Chin buttons (`lopda/1`): a D-pad, A, B, START and SELECT appear under the screen
  when the manifest says `"buttons": true`. Read them with `PAD.on` (section 6).
  The same events come from a keyboard: arrow keys, X = A, Z = B, Enter = START,
  Shift = SELECT. Do not also handle those keys yourself, or they will fire twice.
- An app that sets `buttons` should still be playable by touch where it makes sense,
  and must say on its first screen which button does what.
- Button convention (recommended, checked in review rather than by the checker): in menus,
  lists, dialogs and pause screens, A confirms and B goes back or cancels, as in the
  built-in programs. During play a game maps A and B however it likes (B may be an attack
  or a jump). START usually pauses or opens a menu; SELECT is free. Do not rely on B to
  leave the app: the handheld's HOME key does that.
- Tilt and the microphone (section 6.4) are another way to play, never the only one. An app that reads them
  **must also be playable with keys** (or touch), because the phone may have no sensor, the player may say no,
  and the desktop has neither; its first screen says how to switch. A tilt app offers a way to recentre
  (`PAD.motion.zero()`) and never asks the player to lay the phone flat (`sdk/UI.md`).
- `alert`, `confirm` and `prompt` are unavailable. Build confirmations into the UI.
- Prefer `PAD.sfx` for sound effects, `PAD.music` for music and `PAD.ambience` for background sound (section 6.3): the runtime plays
  them, so they follow the user's volume (volume 0 is off) and the phone's silent switch, stop
  when the app closes and pause when the phone locks. Your own Web Audio is allowed but ignores
  all of that, so keep it quiet and start it only after a user gesture.

## 5. The sandbox

The runtime loads the app with `<iframe sandbox="allow-scripts">` and this
Content Security Policy:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'
```

So an app cannot:

- make network requests of any kind (fetch, XHR, WebSocket, beacons),
- load external scripts, styles, images or fonts,
- use `eval` or `new Function`,
- reach the runtime's storage, other apps' data, cookies or the parent page,
- open popups or navigate the top window.

## 6. The PAD API

The runtime injects a global `PAD` object before the app's own scripts run.

```js
await PAD.load(key)          // -> the saved value, or null
PAD.save(key, value)         // value: anything JSON-serializable
PAD.remove(key)
PAD.TONES                    // ["#1f2a14", "#4a5a32", "#7d8a58", "#a3ad7e"]
PAD.spec                     // "lopda/1", the newest spec this runtime implements
PAD.exit()                   // ask the runtime to close the app
PAD.lang                     // "zh" or "en"; undefined on older runtimes (section 6.1)

// lopda/1
PAD.on("press", fn)          // fn(button) when a button goes down
PAD.on("release", fn)        // fn(button) when it comes back up
PAD.off(type, fn)
PAD.isDown(button)           // -> true while held
PAD.BUTTONS                  // ["up","down","left","right","a","b","start","select"]
PAD.sfx(name)                // play a system sound
PAD.SOUNDS                   // ["tap","tick","move","ok","err","hit","miss","coin","win","lose"]

// lopda/1, runtime 0.11.0 and later (section 6.3); PAD.music is undefined on older runtimes
PAD.sfx({wave, from, to, ms, ...})   // a sound effect of the app's own
PAD.music.play(song, {loop})         // play a song (MML), replacing the one playing; loops unless loop is false
PAD.music.stop()                     // fade out over about 0.3 s

// lopda/1, runtime 0.13.0 and later (section 6.3); PAD.ambience is undefined on older runtimes
PAD.ambience(name, level)            // a background: rain waves waterfall wind fire stream, level 0-1
PAD.ambience(null)                   // fade it out over about 1 s

// lopda/1 with "permissions": ["files"] (section 6.2); undefined on runtimes before 0.5.0
await PAD.exportFile({name, type, data})   // -> "saved" | "cancelled"
await PAD.importFile({accept})             // -> {name, type, data} | null

// lopda/1 with "permissions": ["motion"] / ["mic"] (section 6.4); undefined on runtimes before 0.24.0
await PAD.motion.start()     // -> "on" | "denied" | "none"
PAD.motion.stop()
PAD.motion.zero()            // the way the phone is held now is y = 0
PAD.on("tilt", fn)           // fn({x, y, heading}), at most 30 a second
PAD.on("shake", fn)          // fn()
await PAD.mic.start()        // -> "on" | "denied" | "none"
PAD.mic.stop()
PAD.on("sound", fn)          // fn({level, pitch}), at most 20 a second
```

Sounds, roughly: `tap` key click, `tick` short tick (timers), `move` cursor step,
`ok` success, `err` error, `hit` a thump, `miss` a whiff, `coin` bonus, `win` fanfare,
`lose` falling tune. Unknown names are ignored. The runtime plays at most 20 sounds a
second per app, named and custom together.

- Storage is per app, private, and survives app updates.
- Budget: 256 KB of JSON per app. Writes past the budget are dropped.
- Saves are batched by the runtime; do not save on every frame.
- Uncaught errors and rejected promises are reported to the runtime, which shows
  them to the user.

### 6.1 Language

Lo-PDA runs in Simplified Chinese or English; the player picks one in Settings
(the default follows the phone). `PAD.lang` tells the app which: `"zh"` or `"en"`.

- It is optional and additive within `lopda/1`. Runtimes before 0.4.0 do not set it,
  so **always fall back to your own default when `PAD.lang` is undefined**.
- It does not change while the app runs: when the player switches language, the
  runtime starts the app again.
- Apps are **not required** to be bilingual. Writing both is recommended, so the app
  works for every player. Keep both short; the English need not be a literal translation.
- A small table is enough:

```js
var TXT = {
  zh: { start: "开始", score: "分 " },
  en: { start: "START", score: "PTS " }
}[PAD.lang === "en" ? "en" : "zh"];   // "zh" is this app's own default
```

Add `i18n` to the manifest too (section 2), so the store shows your app's name
and description in the player's language. Games on lo-game.js can use `game.t`
(section 10).

### 6.2 Files

An app that declares `"permissions": ["files"]` can hand a file to the player and take one
from them. Paint (`registry/apps/paint`) is the worked example.

```js
if (PAD.exportFile) {   // runtimes before 0.5.0 have neither method
  var r = await PAD.exportFile({ name: "drawing.png", type: "image/png", data: canvas.toDataURL("image/png") });
  // r: "saved", or "cancelled" when the player said no
  var f = await PAD.importFile({ accept: ["image/*"] });
  // f: {name, type, data}, or null when the player cancelled
}
```

- **The runtime asks every time.** Each call shows the handheld's own dialog over the app
  (`导出「drawing.png」？ 好 / 取消`, `从文件导入？ 选文件 / 取消`). Only the player's tap on that
  dialog opens the share sheet (phones), a download (desktop) or the file picker. The app cannot
  skip it and should not ask twice in a row; there is no prompt at install.
- `data`: a `data:` URL for binary files (images), or a plain string for text. On import, files
  whose type is `text/*` or `application/json` come back as a string, everything else as a `data:` URL.
- `accept`: MIME types (`"image/png"`, `"image/*"`) or extensions (`".txt"`). The picker offers
  only those, and the runtime refuses a picked file of another type (the call resolves `null`).
- **One file is at most 2 MB.** `exportFile` rejects larger data. On import, a larger picture
  (`image/png`, `image/jpeg`, …: phone photos often are) is scaled down by the runtime until it fits;
  any other file over 2 MB is refused and the call resolves `null`.
- Without the permission both methods reject with an error, and the checker fails an app that calls
  them without declaring it.
- Pictures from the player are full colour: reduce them to the four tones yourself before showing them.

### 6.3 Music, sound effects and ambience

The runtime has a small sound chip: four music channels (two pulse waves, a triangle, a noise
channel), two sound-effect voices and one ambience. The app writes the notes; the runtime plays them, so the
volume, the phone's silent switch, locking the phone and leaving the app are all
handled for it. Design notes: `docs/design/pad-audio.md`.

```js
var song = { bpm: 96,
  p1:    "@1 v11 o4 l8 a4 >c d c4< a4 | g a g f d4. r",   // pulse 1: the tune
  p2:    "@0 v7  o3 l8 [r f a >c< r a >c< a]2",            // pulse 2
  tri:   "v12 o2 l4 f >c f c< d a >d< a",                  // triangle: the bass
  noise: "l8 [v5 x r v3 x x v6 X4 v3 x r]2" };             // noise: the drums
if (PAD.music) {                      // undefined before runtime 0.11.0: the app stays silent there
  PAD.music.play(song);               // loops; PAD.music.play(song, {loop: false}) plays once
  PAD.sfx({ wave: "noise", from: 900, to: 120, ms: 180, attack: 5, decay: 175, vol: 0.8 });  // a thump
}
```

**Songs.** An object with `bpm` (30-300, default 120) and up to four channels, `p1`, `p2`, `tri`
and `noise`, each a string of MML. At most 8192 characters of MML in all. Only one song plays at a time.

| MML | meaning |
|---|---|
| `c d e f g a b` | a note; `+` after it is sharp, `-` flat (`f+`, `b-`) |
| `r` | a rest |
| `c8`, `c4.`, `c2..` | a length after a note or rest: 1 whole, 2 half, 4 quarter, … 64; a dot adds half, a second dot a quarter |
| `l8` | the length for notes that give none (default `l4`; `l8.` works too) |
| `o4`, `<`, `>` | the octave, 0-7 (`o4 a` is 440 Hz, `o4 c` middle C; default `o4`); `<` one down, `>` one up |
| `&` | tie: `c4&c8` is one note; before a different pitch it just joins them without a gap |
| `v0`-`v15` | volume (default `v10`) |
| `@0`-`@3` | pulse width on `p1` and `p2`: 12.5, 25, 50 (default), 75 %; ignored elsewhere |
| `[ ... ]3` | repeat 3 times (1-99; `[ ... ]` alone is twice); repeats nest |
| `x`, `X` | noise channel only: a short tick and a long hit, with lengths like notes |
| spaces, `\|` | ignored: use them to lay out bars |

Settings carry on until changed, through repeats too. The song loops at the end of its longest
channel. A song that does not parse is not played: the runtime shows the mistake in its error box,
with the channel and the column (`p1:12: unknown command 'q'`), and the dev harness logs it.

**Sound effects.** `PAD.sfx` also takes an object. Every field is optional; anything out of range
is pulled into range, never refused.

| field | meaning |
|---|---|
| `wave` | `"square"` (default), `"triangle"` or `"noise"` |
| `duty` | pulse width for `square`, 0-3 as `@` above (default 2) |
| `from`, `to` | start and end pitch in Hz, 20-12000 (default 440; `to` defaults to `from`); the pitch slides between them. On `noise` they set how fast the noise runs: low numbers rumble, high ones hiss |
| `ms` | length, 10-1500 (default 150) |
| `attack`, `decay` | milliseconds to rise at the start and to fade at the end (default 2, and the rest of the length) |
| `vol` | 0-1 (default 0.7) |
| `vibrato` | `{ depth, rate }`: the pitch wobbles `depth` semitones either way (0-2; default 0, none), `rate` times a second (1-20, default 6). Runtime 0.13.0 and later; older runtimes ignore it |

Two effects sound at once; a third cuts off the oldest. Music plays at about half the level of
an effect, so effects and the runtime's own clicks stay on top.

**Ambience** (runtime 0.13.0 and later). A background sound the runtime makes: the app picks a
preset and a level, nothing more.

```js
if (PAD.ambience) {                   // undefined before runtime 0.13.0
  PAD.ambience("rain", 0.6);          // one of the presets below, level 0-1 (default 0.5)
  PAD.ambience("rain", 0.2);          // calling again fades over about a second to the new level ...
  PAD.ambience("wind", 0.5);          // ... or the new preset
  PAD.ambience(null);                 // fade out over about a second
}
```

| preset | sounds like |
|---|---|
| `rain` | dense, fine patter |
| `waves` | the sea, a wave every 6-10 seconds |
| `waterfall` | a steady, thick roar |
| `wind` | gusts that rise and fall, with a faint whistle |
| `fire` | a low flicker and random crackles |
| `stream` | running water: bubbling and babbling over a soft rush |

One ambience plays at a time. It sits under the music: at level 1 it is quieter than a song.
A level out of range is pulled into 0-1; an unknown preset is not played and the runtime shows
it in its error box, like a score that does not parse. The checker fails a literal unknown name.

**Calls a second.** At most 4 `PAD.music` calls a second (more `play` calls are dropped; `stop`
always works), and separately at most 4 `PAD.ambience` calls a second: over that the newest call
waits its turn and plays a moment later, and the ones between are skipped, so the ambience always
ends up as the app last asked. `PAD.ambience(null)` always goes through at once. Call these when a
scene changes, not every frame.

**When the runtime stops or holds the music and the ambience.** Leaving the app (HOME, the back
button, another app, a language switch) stops both at once. While the page is hidden or the phone
is locked the song holds its place and the ambience holds too; both go on when the player comes back.
At volume 0 (off) they keep going silently, and are heard again from wherever they have got to.
A browser only lets a page make sound after the player has touched it: a song or ambience asked
for before that waits, and starts on the first tap or key.

**Only music you may share.** Songs and sound effects in an app must be your own work, or in the
public domain (classical pieces, folk songs) with the source named in a comment next to the score.
No transcriptions of other people's music, including old game soundtracks, however short. Review
checks this (section 9).

### 6.4 Tilt and the microphone

An app that declares `"permissions": ["motion"]` can read how the handheld is tilted, when it is shaken, and which way
it faces; one that declares `["mic"]` can hear how loud it is around the player and the pitch of a note sung or
whistled. The runtime asks the player and the phone, reads the sensors itself and hands the app a few coarse numbers.
The app never gets a recording, a sound sample, or a raw sensor value. Design notes: `docs/design/pad-sensors.md`.

```js
if (PAD.motion) {                       // undefined before runtime 0.24.0: play with keys only
  PAD.on("tilt", function (t) { ball.vx += t.x; ball.vy += t.y; });   // t.heading: 0-348.75 or null
  PAD.on("shake", function () { dice.roll(); });
  PAD.motion.start().then(function (r) { if (r !== "on") useKeys(); });
}
if (PAD.mic) {
  PAD.on("sound", function (s) { if (s.level > 0.6) blow(); note.textContent = s.pitch || "-"; });
  PAD.mic.start();                      // ... and PAD.mic.stop() as soon as the app stops listening
}
```

**Readings.** Held upright in portrait, screen towards the player:

| value | meaning |
|---|---|
| `x` | left / right tilt, -1 (left) to 1 (right); about 45 degrees reaches the end |
| `y` | the top edge raised (-1) or lowered (1), counted from how the phone was held at `start()` or the last `zero()` |
| `heading` | the compass, in 32 steps of 11.25 degrees (0 is north, 90 east); `null` where the phone has no compass |
| `shake` | one event per shake; at least 0.5 s between two |
| `level` | loudness 0-1 (-60 dB of full scale is 0, full scale is 1) |
| `pitch` | the main frequency in Hz, an integer from 50 to 1500, or `null` when no clear note is heard (breath, noise, silence) |

`x`, `y` and `level` come in steps of 1/32. `tilt` comes at most 30 times a second and `sound` at most 20 times, each
only when a value changed: hold the last one between events.

**Asking.** `start()` can be called at any time; the app does not need a tap of its own. The first time an app asks,
the handheld shows its own dialog over it (`「迷宫」要用倾斜感应。 允许 / 不允许`; the microphone's adds that the phone's
silent switch does nothing while it is on). A, or a tap on 允许, allows it and the phone's own prompt may follow; B or
不允许 resolves `"denied"`, and the next `start()` asks again. An allowed app is remembered (the player can revoke it
in Settings). The phone may still ask again after the handheld is reopened: then a one-line bar
(`点一下开启倾斜感应`) waits for the player's tap, because the phone takes the answer only from a tap on the handheld
itself. `start()` resolves `"on"`, `"denied"` (the player or the phone said no, or the manifest lacks the permission)
or `"none"` (no such sensor: a desktop, an old phone). Without the permission there is no dialog: `"denied"` at once,
an error in the dev harness, and the checker fails the app.

**While it runs.** Readings go only to the app on the screen. HOME, another program, the app closing or being removed,
locking the phone: the sensors stop at once and the microphone is closed (the phone's microphone indicator goes out).
When the player comes back to the same app, the runtime turns on again what was on (with the bar, if the phone wants a
tap). While the microphone is on, a small mark shows in the status bar, music and sounds keep playing, and the silent
switch does not mute them; keep it on only while the app is listening. `PAD.motion.stop()` and `PAD.mic.stop()` are
always safe to call.

**Keys too.** An app that reads tilt or sound must also be playable with keys or touch (section 4).

## 7. Size and quality

- `index.html` at most 512 KB (with src/ files and framework copies bundled in; section 11).
- Opens with one line of instructions and a start control.
- No dead links, no lorem ipsum, no "coming soon" screens.
- Text in Chinese, English or both, kept short. Both is recommended (section 6.1).

## 8. Versioning and install

- The registry index lists each app's version and the SHA-256 of `index.html`.
- The runtime installs that exact file and checks the hash. An installed app
  never changes until the user taps update.
- Data saved with `PAD.save` stays with the app id across versions. If you
  change your data format, migrate old values yourself.

## 9. Checking an app

```sh
node tools/check-app.mjs registry/apps/<id>
```

The checker enforces sections 2 (including `permissions`), 3 (colors), 5 (forbidden APIs and external
resources) and 7 (size), checks `PAD.sfx` names, and fails `PAD.exportFile` / `importFile` without the `files` permission,
and `PAD.motion` or `PAD.on("tilt" | "shake")` without `motion`, `PAD.mic` or `PAD.on("sound")` without `mic`. Passing it is required before review.

Review then reads the app. Besides what the checker cannot see (the button convention in section 4,
other people's names and characters), it listens to the music and sound effects: they must be original
or public domain with the source named (section 6.3). The principle, as with the dictionary and the reader:
**the platform supports formats; what users bring is up to them.** Lo-PDA can play and convert music
but carries, recommends and links to none that it may not share, and nothing in the store may either.

To try an app with the chin buttons, serve the repo root and open
`sdk/dev.html?app=registry/apps/<id>`. The harness skips the confirm dialog: an export downloads
straight away, and an import waits for the file input it shows next to the app. It plays music and
custom sound effects with the runtime's own chip (`runtime/chip.js`) at the default volume, logs the named
sounds without playing them, and logs a song that does not parse as an error. For tilt and the microphone it answers
`start()` at once from the manifest (no dialog) and stands in for the phone: a square to drag for the tilt (it recentres
when let go), a Shake button, a compass slider, a loudness slider and a pitch field, or this computer's microphone.

## 10. Games: lo-game.js (optional)

`sdk/lo-game.js` (MIT) is a small framework for games: a four-tone pixel screen,
crisp Chinese and English text, buttons, scenes, dialogue, menus, tile maps and saving. An app
that uses it carries its own copy in a `<script data-lo-game="VERSION">` block,
filled in by `node tools/bundle-app.mjs registry/apps/<id>`. The checker accepts only
unmodified released copies and skips them when scanning, so review covers the
game's own code. Since 1.2.0, `game.t({zh: "…", en: "…"})` picks text by `PAD.lang`; since 1.3.0,
`game.music(song)`, `game.musicStop()` and `game.sfx({...})` play music and custom sounds where the runtime has them;
since 1.4.0, `game.ambience(name, level)` plays an ambience.
Reference and AI prompt: `sdk/LO-GAME.md`.

## 11. Source files and lo-3d.js (optional)

An app may keep its code in a `src/` folder next to `index.html` and include each file with
`<script data-src="src/battle.js"></script>`. `node tools/bundle-app.mjs registry/apps/<id>` copies
the file into the block verbatim. Paths are relative, start with `src/`, have no `..`, end in `.js`
(story and data files too, e.g. `var STORY = {...};`), and the file must not contain `</script`.
Reviewers read `src/`; the checker fails when `index.html` is not exactly what the tool builds,
and the bundled code is scanned like any other app code. Only `index.html` ships; the 512 KB limit
applies to it after bundling.

`sdk/lo-3d.js` (MIT) is a small 3D renderer. A block `<script data-lo-3d="VERSION"></script>` is a
verified framework block exactly like `data-lo-game`: filled by the same tool, accepted only as an
unmodified released copy (`sdk/lo-3d.versions.json`), and skipped when scanning.
