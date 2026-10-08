# Lo-PDA

A four-tone handheld that lives on your phone. Hi-PDA's low-fidelity cousin.

Lo-PDA is a Progressive Web App styled as a fictional 1986 PDA with a green LCD.
It comes with a few built-in programs and installs small community apps from a
reviewed registry. Everything runs on the device; nothing needs an account.

一台住在手机里的四色掌机，Hi-PDA 的低保真表亲。

Source: https://github.com/nowheremanx/lopda

## What's inside

| Built-in | 内置 | What it does |
|---|---|---|
| 记事本 | Notes | Plain notes, saved on the device. |
| 点阵画板 | Pixel paint | 96×96, four tones, import a photo as a dithered picture, export PNG. |
| 点阵相机 | Film camera | Load a roll (8, 12 or 16 frames, standard or fine grain). Frames can't be deleted or edited. Date back on or off before each shot. Develop a full roll into one film strip. |
| 裁片机 | Strip cutter | Slide a developed strip under a fixed window and cut frames, halves or crossings, with optional paper edges. |
| 卡带机 | Cartridge player | Plays black-and-white Game Boy files you supply, with the chin buttons. No games are included. |
| 应用商店 | App store | Install, update and run community apps from `registry/`. |
| 设置 | Settings | Sound, volume, storage, and updating to the newest version. |

Community apps are single HTML files that run in a sandboxed iframe with no
network access. See `SPEC.md`.

## Run it locally

Any static file server at the repository root works, because the runtime loads
`../sdk/` and `../registry/`:

```sh
cd lopda
python3 -m http.server 8086
# open http://localhost:8086/runtime/
```

On a phone, open the runtime over **HTTPS** and use "Add to Home Screen".
Plain `http://<your-mac-ip>:8086` works for a quick look, but browsers disable
the live camera, offline mode and the share sheet on insecure origins. Two easy
ways to get HTTPS while developing:

```sh
# a temporary public https URL, no account needed
brew install cloudflared
cloudflared tunnel --url http://localhost:8086
# then open https://<random>.trycloudflare.com/runtime/ on the phone
```

or publish the repository with GitHub Pages.

## Write an app

```sh
cp -r sdk/template registry/apps/my-app       # then edit manifest.json: "id": "my-app"
# open http://localhost:8086/sdk/dev.html?app=registry/apps/my-app
node tools/check-app.mjs registry/apps/my-app
node tools/build-index.mjs
```

`sdk/PROMPT.md` is a ready-made prompt for writing an app with an AI assistant.
For games, use `sdk/lo-game.js` (see `sdk/LO-GAME.md`, which doubles as the AI
prompt) and start from `sdk/template-game/`.

## Layout

```
runtime/     the PWA (index.html, lopda.js, lopda.css, platform.js, sw.js, icons)
sdk/         MIT: PAD bridge, lo-game.js, templates, dev harness, AI prompts
registry/    index.json + apps/<id>/{manifest.json,index.html}
tools/       check-app.mjs, build-index.mjs, lo-game.mjs (Node 20+, no dependencies)
SPEC.md      app specification lopda/1
```

## Design rule

Every change should take a decision away from the user, or at least not add
one. Fixed palette, fixed frame counts, frames you can't edit, one strip per
roll. The limits are the point.

## License

Source-available, not open source. The runtime is under the
[PolyForm Noncommercial License 1.0.0](LICENSE): free for personal, hobby,
educational and other noncommercial use, with attribution (keep `NOTICE`).
The SDK and spec are MIT, and every registry app uses a permissive license of
its author's choice. Read `LICENSING.md` for the reasoning.

Required Notice: Copyright (c) 2026 Haowei Wu
