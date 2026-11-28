# Sisyphus — TODO

## Sound: replace the synthesized heave when `PAD.sample` exists

The first version uses only `PAD.sfx` (synthesized). This is intentional: it follows the
handheld's volume, silent switch, lock screen and app lifecycle.

When `PAD.sample` (the low-fidelity sample layer from `docs/design/pad-audio.md`) ships:

1. Record the owner's own voice, one short heave and one breath. No third-party samples.
2. Convert to 8 kHz, mono, 4-bit PCM, at most 1 s per sample (about 4 KB raw / 5 KB base64).
   Add `tools/pcm4.mjs` if the platform does not ship it.
3. `PAD.sample.define("heave", base64)` once at start, `PAD.sample.define("breath", base64)`.
4. In `src/sfx.js`, `heave()` and `breath()`:
   - if `PAD.sample` exists, `PAD.sample.play("heave", { pitch: 0.94 + Math.random() * 0.12 })`;
   - otherwise keep the current `PAD.sfx` recipe.
5. Keep the old synthesized sounds as the fallback for older runtimes and for the
   `PAD.sample` failure path. Never let the app go silent.
6. Test volume 0, the iPhone silent switch, lock screen, HOME, and leaving the app.
7. Check the total sample budget (the design proposes 64 KB per app).

Do not ship app-local Web Audio samples as the long-term solution: they bypass the
handheld's volume and silent switch. They are only acceptable for a private experiment.

## Art: replace the placeholder art with the artist pass

The current `src/art.js` is a playable placeholder. The artist brief is
`docs/design/sisyphus-art-prompt.md`. When the assets arrive:

- Add the key frames as title / summit / descent plates (or as the style target).
- Replace the procedural Sisyphus with the 8-frame sheet (16×24 each).
- Replace the procedural boulder with the 8-rotation sheet (24×24 each).
- Replace the icon in `manifest.json` with the 16×16 artist icon.
- Keep the path/procedural terrain; use the artist's rock/cloud texture tiles for its dither.
- Re-run `node tools/bundle-app.mjs registry/apps/sisyphus` after any asset or text change.

## Polish

- Test on an iPhone SE at 331×359 and on a 386×606 screen; decide whether the paper matte
  around the 160×178 plate is enough or whether the internal height should follow the screen.
- Measure frame time on the oldest target phone; if needed, cache the static terrain runs or
  render at 30 fps. The game is already 6–12 fps in its animation.
- Listen to the summit in silence: the 1.5 s gap before the gong is part of the piece.
- Check the notes dialog in the real runtime (not only the dev harness): saved, denied,
  app closed while the dialog is open, and the note title 「幸福手册」.
- Add a screenshot to `docs/images/` only after the art pass.
