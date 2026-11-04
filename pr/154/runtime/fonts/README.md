# LCD fonts

| Font | Files | Licence |
|---|---|---|
| DotGothic16 1.100, Fontworks Inc. / The DotGothic16 Project Authors | `dotgothic16-000.woff2` … `dotgothic16-122.woff2` | SIL OFL 1.1, `OFL-DotGothic16.txt` |
| VT323 2.000, Peter Hull / The VT323 Project Authors | `vt323-000.woff2` … `vt323-002.woff2` | SIL OFL 1.1, `OFL-VT323.txt` |

Up to runtime 0.4.1 the handheld loaded both from Google Fonts
(`https://fonts.googleapis.com/css2?family=DotGothic16&family=VT323&display=swap`). Since 0.5.0 they ship here,
so they work offline and no request goes to Google.

The `.woff2` files are exactly what Google Fonts served on 2026-10-11 to Chrome (`fonts.gstatic.com/s/dotgothic16/v22/`
and `fonts.gstatic.com/s/vt323/v18/`), numbered in the order of Google's CSS, and `fonts.css` is Google's CSS with
local file names (same `unicode-range`, same order, `font-display: swap`). `sw.js` pre-caches every `url()` in it.
The licence files come from `ofl/dotgothic16/OFL.txt` and `ofl/vt323/OFL.txt` in https://github.com/google/fonts.

Why Google's files rather than the original TTFs: Google cuts DotGothic16 into slices and removes its OpenType
layout features. Chromium spaces CJK punctuation (「」、。：) using the glyphs and features in the same file, so one
full-font file, or slices cut with fontTools, gave slightly different line layout from what the handheld showed
before (`tests/runtime-shots.mjs`). Shipping the served files keeps every pixel the same.

Neither licence names a Reserved Font Name.
