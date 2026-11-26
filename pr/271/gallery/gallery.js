/* Lo-PDA gallery: the data behind gallery/index.html and tools/gallery-shots.mjs.
 *
 * Only the best store apps, chosen by hand, in the order the gallery shows them. An app's name, icon, version and
 * category come from registry/index.json; this file adds what the store does not say: a longer note on why it is
 * worth playing, what the platform does for it ("uses"), and the scene the capture tool films.
 *
 * To add an app: add an entry here, run `node tools/gallery-shots.mjs --only=<id>` (both languages), commit the files
 * it writes into gallery/media/<id>/. Nothing else changes, and no promo film needs re-recording.
 *
 * Every text field is {en, zh}. "uses" are keys of LOPDA_GALLERY_USES below.
 *
 * scene: what the capture tool does in the runtime after starting the app (tools/gallery-shots.mjs runs it):
 *   setup  steps before filming (past a title card, into play)
 *   clip   steps while the short loop is filmed (about four seconds; keep it moving)
 *   after  steps after filming (optional: more stills for the detail page)
 *   steps: ["wait", ms]  ["key", name, holdMs] (x = A, z = B, Enter = START, Shift = SELECT, Arrow*)
 *          ["tap", fx, fy] (a point of the app's screen, 0-1)   ["tapIn", selector, fx, fy] (a point of an element in the app)
 *          ["eval", code] (run in the app's frame, for an app's own debug hooks)   ["still"] (save a picture for the detail page)
 *   The stills taken during the clip come first, and the first of them is the card's cover (a clip with no "still" step
 *   gives its last frame); stills from setup and after follow, for the detail page.
 */
window.LOPDA_GALLERY_USES = {
  "lo-game": { en: "lo-game (2D game kit)", zh: "lo-game（2D 游戏框架）" },
  "lo-3d": { en: "lo-3d (3D renderer)", zh: "lo-3d（3D 渲染）" },
  "raycast": { en: "Its own raycaster", zh: "自己写的光线投射" },
  "music": { en: "Chip music", zh: "芯片音乐" },
  "ambience": { en: "Ambience", zh: "环境声" },
  "save": { en: "Saves", zh: "存档" },
  "link": { en: "Sound link between two phones", zh: "两台手机用声音连线" },
  "camera": { en: "Camera", zh: "相机" },
  "wordbook": { en: "Dictionary and word book", zh: "词典和生词本" },
  "files": { en: "Files in and out", zh: "导入导出文件" },
  "notes": { en: "Notes", zh: "记事本" },
  "touch": { en: "Touch", zh: "触摸" },
  "buttons": { en: "The handheld's buttons", zh: "掌机按键" }
};

window.LOPDA_GALLERY = [
  {
    id: "lost-deck",
    title: { en: "A first-person shooter on a four-tone screen", zh: "四色屏幕上的第一人称射击" },
    note: {
      en: "A space station has gone quiet. Fourteen decks down to the core: find key cards, sidestep bolts, turn the power back on in the dark decks. Every wall and robot is drawn by a raycaster the app carries itself, in four tones. A bot that plays every deck tuned how hard each one is.",
      zh: "空间站失联了。一层层往下，十四层到核心：找门卡、躲光弹，在停电的楼层摸黑找电闸。墙和机器人都由应用自带的光线投射画出来，只用四种颜色。每一层的难度，都让一个会自己玩的机器人试过。"
    },
    uses: ["raycast", "lo-game", "music", "save", "buttons"],
    scene: {
      /* the title card as a still, then the core (deck 14): the shielded core straight ahead; after, a dark deck by torchlight */
      setup: [["wait", 1500], ["still"], ["eval", "LD.dbgStart(13)"], ["wait", 2800]],
      clip: [["key", "x", 80], ["wait", 250], ["key", "x", 80], ["wait", 250], ["key", "ArrowUp", 700], ["key", "x", 80], ["wait", 300], ["still"], ["key", "ArrowRight", 350], ["key", "x", 80], ["wait", 300], ["key", "ArrowLeft", 600], ["key", "x", 80], ["wait", 500]],
      after: [["eval", "LD.dbgStart(10)"], ["wait", 3200], ["key", "ArrowUp", 900], ["wait", 300], ["still"]]
    }
  },
  {
    id: "lao-zhang",
    title: { en: "Sixty seconds a level, one hook", zh: "六十秒一关，一只钩子" },
    note: {
      en: "The hook swings, A drops it. Gold pays, rocks only slow you down, and each level asks for a little more. Between levels a shop sells dynamite and luck. Its difficulty was set by an auto-player that runs thousands of games.",
      zh: "钩子来回摆，按 A 放下去。金子值钱，石头只会拖慢你，每一关的目标都更高一点。关与关之间有个小店，卖炸药和运气。难度是一个自动玩家跑了几千局定下来的。"
    },
    uses: ["lo-game", "music", "save", "buttons"],
    scene: {
      setup: [["wait", 1200], ["still"], ["key", "x", 80], ["wait", 1000], ["key", "x", 80], ["wait", 1200]],
      clip: [["wait", 900], ["key", "x", 80], ["wait", 1500], ["still"], ["key", "x", 80], ["wait", 1600]]
    }
  },
  {
    id: "gomoku",
    title: { en: "Five in a row, against the phone or a friend's phone", zh: "五子棋，和手机下，或者和朋友的手机下" },
    note: {
      en: "Play the computer, or put two phones side by side: they pair with sound, like an old modem, and every move crosses the table as a little chirp. No network, no account.",
      zh: "可以和电脑下，也可以把两台手机放在一起：它们用声音配对，像老式调制解调器，每一步棋都是桌上的一声啾啾。不联网，不用账号。"
    },
    uses: ["link", "touch", "save"],
    scene: {
      setup: [["wait", 800], ["still"], ["tapIn", "#st", 0.5, 0.5], ["wait", 800]],
      clip: [["tapIn", "#c", 7.5 / 15, 7.5 / 15], ["wait", 1200], ["tapIn", "#c", 8.5 / 15, 6.5 / 15], ["wait", 1200], ["tapIn", "#c", 6.5 / 15, 8.5 / 15], ["wait", 1200], ["still"]]
    }
  }
];
