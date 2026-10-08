# Lo-PDA App Specification v1

Status: draft · Spec id: `lopda/1` (apps written for `lopda/0` keep working) · License: MIT (see `sdk/LICENSE`)

What v1 adds over v0: the chin buttons (`"buttons": true`, `PAD.on`, `PAD.isDown`) and
system sounds (`PAD.sfx`). Added later within v1, both optional: the player's language
(`PAD.lang`) and localized store text (manifest `i18n`). See section 6.1.

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
| `permissions` | Array. Empty for now. Reserved for future capabilities such as `film.read`. |
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

## 4. Input

- Touch first: use pointer events (`pointerdown`, `pointermove`, `pointerup`).
- Chin buttons (`lopda/1`): a D-pad, A, B, START and SELECT appear under the screen
  when the manifest says `"buttons": true`. Read them with `PAD.on` (section 6).
  The same events come from a keyboard: arrow keys, X = A, Z = B, Enter = START,
  Shift = SELECT. Do not also handle those keys yourself, or they will fire twice.
- An app that sets `buttons` should still be playable by touch where it makes sense,
  and must say on its first screen which button does what.
- `alert`, `confirm` and `prompt` are unavailable. Build confirmations into the UI.
- Prefer `PAD.sfx` for sound effects: it follows the user's volume and mute settings and
  the phone's silent switch. Your own Web Audio is allowed but ignores those settings,
  so keep it quiet and start it only after a user gesture.

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
```

Sounds, roughly: `tap` key click, `tick` short tick (timers), `move` cursor step,
`ok` success, `err` error, `hit` a thump, `miss` a whiff, `coin` bonus, `win` fanfare,
`lose` falling tune. Unknown names are ignored. The runtime plays at most 20 sounds a
second per app.

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

The checker enforces sections 2, 3 (colors), 5 (forbidden APIs and external
resources) and 7 (size), and checks `PAD.sfx` names. Passing it is required before review.

To try an app with the chin buttons, serve the repo root and open
`sdk/dev.html?app=registry/apps/<id>`.

## 10. Games: lo-game.js (optional)

`sdk/lo-game.js` (MIT) is a small framework for games: a four-tone pixel screen,
crisp Chinese and English text, buttons, scenes, dialogue, menus, tile maps and saving. An app
that uses it carries its own copy in a `<script data-lo-game="VERSION">` block,
filled in by `node tools/bundle-app.mjs registry/apps/<id>`. The checker accepts only
unmodified released copies and skips them when scanning, so review covers the
game's own code. Since 1.2.0, `game.t({zh: "…", en: "…"})` picks text by `PAD.lang`.
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
