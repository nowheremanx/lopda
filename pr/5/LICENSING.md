# Licensing / 许可说明

## Code: MIT

Everything in this repository is under the **MIT License** (`LICENSE`), except
the third-party parts listed below. Use it, change it, ship it, sell it; keep the
copyright notice. `sdk/LICENSE` is the same MIT license, kept next to the SDK so
app authors who copy only that folder carry it along.

仓库里除下面列出的第三方部分外，全部采用 MIT 许可。可以使用、修改、分发、商用，保留版权声明即可。

Earlier versions were published under the PolyForm Noncommercial License 1.0.0.
The copyright holder also makes those versions available under the MIT License.

## Name and icons

The MIT License covers the code, not the name. "Lo-PDA" and the Lo-PDA icons
identify this project. You may say your work is "based on Lo-PDA" or "for
Lo-PDA", and an app in the registry may say it runs on Lo-PDA. A fork or a
product built from this code that is published for others must use a different
name and icon, so nobody mistakes it for this project.

MIT 许可只覆盖代码，不覆盖名字。可以说「基于 Lo-PDA」或「为 Lo-PDA 开发」；但对外发布的 fork 或产品要换
名字和图标，以免被误认为是本项目。

## Apps in the registry: permissive licenses only

Every app in `registry/apps/` must declare one of these SPDX identifiers in its
`manifest.json`:

`MIT`, `0BSD`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `Apache-2.0`, `CC0-1.0`, `Unlicense`

This keeps the whole registry redistributable together with the project, by
anyone, under terms at least as open as the project's own. `tools/check-app.mjs`
rejects any other license string. Authors keep their copyright.

## Contributions

Contributions are accepted under the MIT License, the same terms as the project.
See `CONTRIBUTING.md`.

## Third-party material

- Game Boy emulator core: binjgb by Ben Smith, MIT License, prebuilt web files
  copied unchanged into `runtime/vendor/binjgb/` with its license file.
- Pixel font: `sdk/fonts/lopix12.json` is a modified version of Fusion Pixel Font
  (which combines Ark Pixel, Cubic 11 and Galmuri), all SIL Open Font License 1.1.
  It is not called Fusion Pixel, a Reserved Font Name. Apps built with lo-game.js
  carry a subset with the full OFL notice inside the font block
  (`sdk/fonts/LICENSE-lopix12.txt`; upstream licenses in `sdk/fonts/upstream-licenses/`).
- Fonts VT323 and DotGothic16 are loaded from Google Fonts (SIL OFL 1.1). If they
  are ever bundled, their license files must ship with them.
- No GPL code: it would turn the whole project GPL.
- No game ROMs are bundled or distributed. The cartridge player only plays files
  the user supplies. Do not add ROMs to this repository or to the registry.

This document explains intent. It is not legal advice.
