# Prompt: write a Lo-PDA app with an AI

Making a game? Use `sdk/LO-GAME.md` instead: paste that file into the assistant.
It covers the game framework and all the rules below.

Copy everything in the box below into Claude, ChatGPT or any coding assistant,
then replace the last line with your idea. Save the two files it gives you in
`registry/apps/<id>/` and run `node tools/check-app.mjs registry/apps/<id>`.

---

```
You are writing an app for Lo-PDA, a fictional 1986 handheld with a four-tone
green LCD. Output exactly two files: manifest.json and index.html.

Hard rules for index.html:
- One self-contained HTML file, at most 200 KB. No external scripts, styles,
  fonts, images or network requests of any kind. No eval or new Function.
- html,body{margin:0;height:100%;overflow:hidden}. Portrait screen, 300-420 px
  wide, height varies. Use flexbox so it fits any height.
- Only these four colors, written as hex: #1f2a14 (ink), #4a5a32 (dark),
  #7d8a58 (mid), #a3ad7e (paper, the background). No other colors, no opacity
  tricks that create new colors, no gradients between other colors.
- Font: monospace only. No emoji anywhere.
- Touch input with pointer events. Keyboard optional. Never use alert, confirm
  or prompt; build any confirmation into the page.
- Opens with one short line of instructions and a start button.
- Text in Chinese, short.
- To remember things (high scores, settings), use the global PAD object that the
  runtime provides. Do not use localStorage, cookies or IndexedDB.
    await PAD.load(key)   -> saved value or null
    PAD.save(key, value)  -> any JSON-serializable value
    PAD.remove(key)
    PAD.exit()            -> close the app
  Save on meaningful events (game over, setting changed), not every frame.
- Sound: call PAD.sfx(name) with one of "tap", "tick", "move", "ok", "err",
  "hit", "miss", "coin", "win", "lose". Do not create your own AudioContext.
- Games may use the handheld's hardware buttons (D-pad, A, B, START, SELECT):
    PAD.on("press", function (b) { ... })   b is "up","down","left","right","a","b","start" or "select"
    PAD.on("release", function (b) { ... })
    PAD.isDown("left")                      -> true while held
  The keyboard is mapped for you (arrows, X=A, Z=B, Enter=START); do not add
  your own key handlers for those keys. Say on the start screen which button does what.
- Pixel art: draw on a small canvas and scale it up with
  image-rendering: pixelated.

manifest.json must be:
{
  "spec": "lopda/1",
  "id": "<3-32 chars, a-z 0-9 and hyphens>",
  "name": "<1-8 characters, no emoji>",
  "glyph": "<exactly one character, no emoji>",
  "icon": [<16 strings of 16 characters each, a pixel icon: 0 ink, 1 dark,
           2 mid, 3 paper, . transparent. Draw something recognizable.>],
  "version": "0.1.0",
  "description": "<one sentence, at most 80 characters>",
  "author": "<my name>",
  "license": "MIT",
  "permissions": [],
  "buttons": <true if the app uses PAD.on, otherwise leave this line out>
}

Keep the code under 400 lines and make sure it has no syntax errors.

My idea: <describe your app here>
```
