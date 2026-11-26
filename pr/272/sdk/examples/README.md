# Examples / 示例

Three small apps that show one part of the `PAD` API each, with nothing else in the way. They follow every store
rule (`node tools/check-app.mjs sdk/examples/*` passes) but are not in the store: players do not need them, developers
and their AI agents do. Copy one, or point your agent at it.

三个小 app，每个只示范 `PAD` 的一部分。它们守商店的全部规矩（检查能过），但不在商店里：玩家用不上，开发者和
AI 助手用得上。可以整个复制，也可以让助手照着写。

| Example | Shows | Open in the harness |
|---|---|---|
| `save-book/` 存档本 | `PAD.load` / `save` / `remove`, `PAD.saveInfo`, `PAD.setSchema` and reading a schema 0 save as schema 1 (SPEC.md 6 and 8) | [dev.html?app=sdk/examples/save-book](https://nowheremanx.github.io/lopda/sdk/dev.html?app=sdk/examples/save-book) |
| `sound-board/` 声音样本 | every named sound, chip music in MML, custom sound effects and ambience, with the code for each (SPEC.md 6.3) | [dev.html?app=sdk/examples/sound-board](https://nowheremanx.github.io/lopda/sdk/dev.html?app=sdk/examples/sound-board) |
| `sensor-desk/` 传感器台 | `PAD.motion` and `PAD.mic`: live tilt, shake, heading and sound, and what allowed, refused and missing look like (SPEC.md 6.4) | [dev.html?app=sdk/examples/sensor-desk](https://nowheremanx.github.io/lopda/sdk/dev.html?app=sdk/examples/sensor-desk) |

Locally: `python3 -m http.server 8086` from the repository root, then
`http://localhost:8086/sdk/dev.html?app=sdk/examples/<id>`.

To start an app of your own from one: `cp -r sdk/examples/save-book registry/apps/my-app`, then change `"id"` in its
`manifest.json` to `my-app`, and its name and description. For a blank start use `sdk/template/` (or
`sdk/template-game/`, `sdk/template-vn/`).

Players who installed one of these from the store before it moved here keep it: it stays on their home screen and
runs as before, with its saves; it just gets no more updates (docs/decisions.md section 72).

已经从商店装过的玩家不受影响：主屏上还在，照常运行，存档都在，只是不再更新。
