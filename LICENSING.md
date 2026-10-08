# Licensing / 许可说明

Lo-PDA uses three layers of licensing on purpose. The goal is that the runtime
stays noncommercial and credited, while apps and contributions never get stuck
if the runtime's license changes later.

Lo-PDA 有意分成三层许可。目标是：主程序保持非商用、必须署名；同时，社区的 app 和贡献
不会因为主程序以后换许可而被卡住。

| Layer 层 | What 内容 | License 许可 |
|---|---|---|
| Runtime 主程序 | `runtime/`, `tools/`, `registry/index.json`, docs | PolyForm Noncommercial 1.0.0 (`LICENSE`) + `NOTICE` |
| SDK & spec 开发包与规范 | `sdk/`, `SPEC.md` | MIT (`sdk/LICENSE`) |
| Apps 社区 app | `registry/apps/<id>/` | The author's own permissive license, declared in `manifest.json` |
| Vendored 第三方 | `runtime/vendor/binjgb/` | MIT, Ben Smith (its own `LICENSE` in that folder) |

## 1. Runtime: PolyForm Noncommercial 1.0.0

- Anyone may use, copy, modify and share the runtime for noncommercial purposes
  (personal use, hobby, study, research, education, charities, public bodies).
- Commercial use needs a separate license from the copyright holder.
- Anyone who passes on any part of the runtime must keep the license text (or its
  URL) and every line starting with `Required Notice:` from `NOTICE`. That is the
  attribution requirement.
- Note: because it forbids commercial use, this is **source-available**, not
  "open source" in the OSI sense. Please don't describe it as open source.

## 2. SDK and spec: MIT

Everything an app author touches is MIT: the `PAD` bridge, the template, the dev
harness, the AI prompt and the spec itself. Writing an app for Lo-PDA therefore
never makes the app a derivative of the noncommercial runtime. Apps run in a
sandboxed iframe and talk to the runtime only through `postMessage`.

## 3. Apps: permissive licenses only

Every app in the registry must declare one of these SPDX identifiers in its
`manifest.json`:

`MIT`, `0BSD`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `Apache-2.0`, `CC0-1.0`, `Unlicense`

The rule is "as permissive as the runtime or more". In practice only
permissive licenses qualify, because:

- If an app were noncommercial or copyleft (GPL), the curated registry could
  never be moved to a different license, bundled into a commercial edition, or
  relicensed without asking every app author individually.
- Permissive apps can be redistributed under any future runtime license.

`tools/check-app.mjs` rejects any other license string.

## 4. Contributions to the runtime: inbound MIT

Code contributed to `runtime/` or `tools/` by anyone other than the copyright
holder is accepted under the **MIT License** (inbound), and the copyright holder
distributes the combined runtime under PolyForm Noncommercial (outbound).

Why: if contributors gave their code under PolyForm Noncommercial, the copyright
holder could not later relicense the runtime (for example to a commercial
edition, or to a fully open license) without tracking down every contributor.
Inbound MIT keeps that door open with no CLA paperwork. Contributors sign off
each commit (`git commit -s`, the Developer Certificate of Origin) to confirm
they have the right to submit the code. See `CONTRIBUTING.md`.

## 5. Third-party material

- Fonts: VT323 and DotGothic16 are loaded from Google Fonts and are licensed
  under the SIL Open Font License 1.1. If they are ever bundled for offline use,
  their license files must be shipped alongside them.
- Game Boy emulator core: binjgb by Ben Smith, MIT License, prebuilt web files
  copied unchanged into `runtime/vendor/binjgb/` with its license file. MIT allows
  shipping it inside a noncommercial-licensed runtime; the copyright notice must stay.
- Pixel font: `sdk/fonts/lopix12.json` is a modified version of Fusion Pixel Font
  (which combines Ark Pixel, Cubic 11 and Galmuri), all SIL Open Font License 1.1.
  It is not called Fusion Pixel, a Reserved Font Name. Apps built with lo-game.js
  carry a subset with the full OFL notice inside the font block
  (`sdk/fonts/LICENSE-lopix12.txt`; upstream licenses in `sdk/fonts/upstream-licenses/`).
- No game ROMs are bundled or distributed. The cartridge player only plays files the
  user supplies. Do not add ROMs to this repository or to the registry.

## What this means if the license changes later

- Switching the runtime to a commercial or fully open license: the copyright
  holder can do it alone, because all outside runtime code arrived as MIT.
- Apps stay under their own permissive licenses and keep working either way.
- Copies already distributed under PolyForm Noncommercial keep those terms for
  the people who received them; a license change applies going forward.

This document explains intent. It is not legal advice.
