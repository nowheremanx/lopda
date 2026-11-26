/* Lo-PDA gallery: the data behind gallery/index.html and tools/gallery-shots.mjs.
 *
 * Only the best store apps, chosen by hand (by the owner), in the order the gallery shows them. An app's name, icon, version and
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
 *          ["stroke", selector, [[x, y], ...], size] (a finger drawing through points of a size x size grid over an element)
 *          ["swipe", selector, "word"] (a finger through the elements matching selector that read each letter in turn)
 *          ["eval", code] (run in the app's frame, for an app's own debug hooks)   ["still"] (save a picture for the detail page)
 *          ["cover"] (the card's cover, like the picture on a cartridge box: the app's title screen when it is a picture,
 *          otherwise its best moment of play)
 *   Pictures are numbered cover first, then the stills taken during the clip (a clip with no "still" step gives its
 *   last frame), then those from setup and after. With no ["cover"], the first still of the clip is the cover.
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

/* Lost Deck staging (runs in its frame through ["eval"]): stand d cells from the nearest foe of a kind, with a clear
   line between, and look at it. Uses the game's own test hook LD.dbg() (the world). */
var LD_FACE = function (type, d) {
  var w = LD.dbg(), P = w.P, e = null;
  w.things.forEach(function (t) { if (t.kind === "foe" && t.type === type && !t.dead && (!e || Math.hypot(t.x - P.x, t.y - P.y) < Math.hypot(e.x - P.x, e.y - P.y))) e = t; });
  if (!e) return;
  for (var k = 0; k < 32; k++) {
    var a = k * Math.PI / 16, x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d, ok = true;
    for (var s = 0; s <= 1; s += 0.05) { var px = e.x + (x - e.x) * s, py = e.y + (y - e.y) * s;
      if (w.wallAt(Math.floor(px), Math.floor(py)) || w.wallAt(Math.floor(px + 0.3), Math.floor(py)) || w.wallAt(Math.floor(px - 0.3), Math.floor(py)) ||
          w.wallAt(Math.floor(px), Math.floor(py + 0.3)) || w.wallAt(Math.floor(px), Math.floor(py - 0.3))) { ok = false; break; } }
    if (ok) { P.x = x; P.y = y; P.a = Math.atan2(e.y - y, e.x - x); return; }
  }
};
var ldFace = function (type, d) { return "(" + LD_FACE + ")(" + JSON.stringify(type) + "," + d + ")"; };
/* every hint already seen, every deck open: the films show play, not first-time tips */
var LD_KV = { save: { v: 1, unlocked: 1, best: {}, tips: { move: 1, dark: 1, low: 1, shield: 1, use: 1,
  "foe-crawler": 1, "foe-spore": 1, "foe-sentry": 1, "foe-guard": 1, "foe-node": 1 } } };

/* 矿工老张 staging: keep the run's state where a scene can reach it (GM.startRun is its own public rule function),
   then a steady hand that drops the hook when it points at gold or a gem. GM.fire is the same call the A key makes. */
var LZ_CATCH = "(function(){var o=GM.startRun;GM.startRun=function(s){window.__lz=s;return o.call(this,s,20261126)};})()";
var LZ_AIM = "(function(){clearInterval(window.__lzAim);window.__lzAim=setInterval(function(){var s=window.__lz;" +
  "if(!s||s.screen!=='play'||s.hook.state!=='swing')return;var A=GM.ANCHOR,a=s.hook.angle,ux=Math.sin(a),uy=Math.cos(a);" +
  /* the first thing on the hook's line is what it catches: drop only when that is gold, a gem or a bag */
  "var best=null,bd=1e9;for(var i=0;i<s.items.length;i++){var it=s.items[i],dx=it.x-A.x,dy=it.y-A.y,t=dx*ux+dy*uy,off=Math.abs(dx*uy-dy*ux);" +
  "if(t>0&&off<it.r+7&&t<bd){bd=t;best=it;}}" +
  "if(best&&(best.kind==='gold'||best.kind==='gem')&&best.value>=300)GM.fire(s);},16);})()";

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
      /* a guard in a lit corridor (deck 9) for the film and the cover; then the shielded core, a dark deck by torchlight */
      kv: LD_KV,
      setup: [["wait", 1600], ["cover"], ["eval", "LD.dbgStart(8)"], ["wait", 2600], ["eval", ldFace("guard", 3.2)], ["wait", 900]],
      clip: [["key", "x", 80], ["wait", 220], ["key", "x", 80], ["wait", 220], ["still"], ["key", "x", 80], ["key", "ArrowLeft", 260], ["key", "x", 80], ["wait", 300],
        ["key", "ArrowRight", 300], ["key", "x", 80], ["wait", 250], ["key", "x", 80], ["wait", 250], ["key", "x", 80], ["wait", 700]],
      after: [["eval", "LD.dbgStart(13)"], ["wait", 2600], ["eval", ldFace("core", 3.4)], ["wait", 600], ["key", "x", 80], ["wait", 120], ["still"],
        ["eval", "LD.dbgStart(10)"], ["wait", 2600], ["eval", ldFace("crawler", 2.6)], ["wait", 500], ["still"]]
    }
  },
  {
    id: "zhenyao-tower",
    title: { en: "A 3D xianxia prologue on a 1986 chip", zh: "1986 年芯片上的三维仙侠序章" },
    note: {
      en: "A cartridge with its own 3D coprocessor: walk a little town, climb the mountain path into the tower, and fight its demons with spells in turn-based duels. A whole prologue you can finish, with weather and a score of its own. In Chinese.",
      zh: "卡带里装了一块三维协处理器：在小镇里走走，沿山道上塔，用法术和塔里的妖怪回合制斗法。一段能打通的完整序章，有天气，有自己的配乐。"
    },
    uses: ["lo-3d", "lo-game", "music", "save", "buttons"],
    scene: {
      /* the title (the camera circling the tower) is the cover; the town by night; the film is a fight inside the tower
         (four braziers), started with the game's own hook ZT.fight as tests/zhenyao-play.js does; then the boss */
      setup: [["wait", 2200], ["cover"], ["key", "x", 80], ["wait", 1200], ["key", "x", 80], ["wait", 1200], ["key", "x", 80], ["wait", 1500],
        ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "ArrowUp", 900], ["key", "ArrowLeft", 500], ["key", "ArrowUp", 700], ["still"],
        ["eval", "ZT.fight(1, 2)"], ["wait", 2600]],
      clip: [["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500], ["key", "x", 80], ["wait", 500]],
      after: [["eval", "ZT.fight(3, 0)"], ["wait", 3500], ["still"]]
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
      /* the title screen is the cover; then level 11, where old Wang digs beside you, played by a steady hand;
         then the shop between levels */
      setup: [["eval", LZ_CATCH], ["wait", 900], ["cover"], ["key", "x", 80], ["wait", 700],
        ["eval", "GM.startLevel(__lz,11);__lz.bank=Math.round(GM.targetFor(11)*0.6/10)*10;__lz.dynamite=2;__lz.strength=3;GM.ui.enter('intro')"], ["wait", 900],
        ["key", "x", 80], ["wait", 900], ["eval", LZ_AIM], ["wait", 800]],
      clip: [["wait", 1600], ["still"], ["wait", 2600]],
      after: [["wait", 2500], ["still"], ["eval", "clearInterval(window.__lzAim);GM.openShop(__lz);GM.ui.enter('shop')"], ["wait", 900], ["still"]]
    }
  },
  {
    id: "fake-yu",
    title: { en: "Play along, and freeze when the king looks", zh: "跟着吹，国王一睁眼就停手" },
    note: {
      en: "The old tale of the man who could not play the yu and hid in the king's orchestra. A rhythm game in three acts: A blows the yu, B strikes the chime, and when the king opens his eyes you stop. Ten classical tunes, four endings.",
      zh: "滥竽充数的老故事：不会吹竽的南郭先生混在国王的乐队里。三幕的节奏游戏：A 吹竽，B 敲磬，国王一睁眼就得停手。十首古典曲子，四种结局。"
    },
    uses: ["lo-game", "music", "save", "buttons"],
    scene: {
      /* the title is the cover; then into the first act (as tools/launch-video.mjs does) and a few notes */
      setup: [["wait", 1800], ["cover"], ["key", "ArrowDown", 80], ["key", "x", 80], ["wait", 800], ["key", "x", 80], ["wait", 4000]],
      clip: [["wait", 900], ["key", "x", 80], ["wait", 600], ["key", "z", 80], ["wait", 600], ["key", "x", 80], ["wait", 700], ["key", "x", 80], ["wait", 900]]
    }
  },
  {
    id: "crossing",
    title: { en: "A crossword spelled on a letter wheel", zh: "在字母盘上拼出小字谜" },
    note: {
      en: "Draw words on the letter wheel to fill a small crossword. Each word you find shows its Chinese meaning under the grid and is read aloud. Words come from the handheld's built-in dictionary, and new ones can go into your word book.",
      zh: "在字母盘上划出单词，填满小小的字谜格。拼对一个，中文意思就显示在格子下面，再读一遍英文。单词来自掌机内置的词典，生词可以收进你的生词本。"
    },
    uses: ["wordbook", "touch", "buttons", "save"],
    scene: {
      /* the title screen is the cover; then round 1 (past the first-time demo): two words before the film, three during it */
      setup: [["wait", 1200], ["cover"], ["key", "x", 80], ["wait", 1500], ["tapIn", "#wheel", 0.5, 0.5], ["wait", 800], ["key", "x", 80], ["wait", 1200],
        ["swipe", "#wheel .key", "sea"], ["wait", 900], ["swipe", "#wheel .key", "lace"], ["wait", 1100]],
      clip: [["swipe", "#wheel .key", "case"], ["wait", 1000], ["still"], ["swipe", "#wheel .key", "sale"], ["wait", 1000], ["still"], ["swipe", "#wheel .key", "scale"], ["wait", 900]]
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
      /* the cover is its title picture; then into a game */
      setup: [["wait", 800], ["cover"], ["tapIn", "#st", 0.5, 0.5], ["wait", 800], ["tapIn", "#c", 7.5 / 15, 7.5 / 15], ["wait", 1100], ["tapIn", "#c", 7.5 / 15, 8.5 / 15], ["wait", 1100]],
      /* two moves before the film, two in it: four black stones in all, so the computer cannot have five yet */
      clip: [["tapIn", "#c", 6.5 / 15, 8.5 / 15], ["wait", 1200], ["tapIn", "#c", 8.5 / 15, 8.5 / 15], ["wait", 2200]]
    }
  }
];

/* Waiting for a later batch (owner, 2026-11-26: the first batch is five). Their text and scenes are ready: move an
   entry up into LOPDA_GALLERY and film it. The page and the tool ignore this list. */
window.LOPDA_GALLERY_NEXT = [
  {
    id: "sisyphus",
    title: { en: "Push the stone up the hill", zh: "推石上山" },
    note: {
      en: "Hold A to push. The stone rolls back. Push again. A quiet game about doing it anyway, with sixteen lines from Camus waiting at the summit, saved to your notes as you reach them.",
      zh: "按住 A 往上推。石头滚下去。再推。一个关于「还是要推」的安静小游戏，山顶有加缪的十六句话在等你，走到了就记进你的记事本。"
    },
    uses: ["lo-game", "notes", "music", "save", "buttons"],
    scene: {
      setup: [["wait", 1500], ["cover"], ["key", "x", 80], ["wait", 1200]],
      clip: [["key", "x", 1900], ["still"], ["key", "x", 1900]],
      after: []
    }
  },
  {
    id: "shanjiao-diner",
    title: { en: "Seven days of keeping a mountain diner open", zh: "七天，守住山脚的小馆" },
    note: {
      en: "Each morning you gather in the forest and fight what lives there, at noon you prepare dishes, in the evening guests walk in with orders and stories. Seven days, several endings. In Chinese.",
      zh: "早上进山采买，顺手打打山里的怪；中午备菜；晚上客人推门进来，点菜，也讲讲他们的事。七天，几种结局。"
    },
    uses: ["lo-game", "music", "save", "buttons"],
    scene: {
      /* the title is the cover; the forest on day one; the film is a fight with a boar, the game's own
         battle scene pushed as the forest pushes it (game and DATA are the game's globals) */
      setup: [["wait", 1800], ["cover"], ["key", "x", 80], ["wait", 1000], ["key", "x", 80], ["wait", 1000], ["key", "x", 80], ["wait", 1000],
        ["key", "x", 80], ["wait", 450], ["key", "x", 80], ["wait", 450], ["key", "x", 80], ["wait", 450], ["key", "x", 80], ["wait", 450], ["key", "x", 80], ["wait", 450], ["key", "x", 80], ["wait", 450], ["still"], ["eval", "void game.go('forest')"], ["wait", 1500],
        ["eval", "void game.push('battle', { enemy: 'boar', from: 'forest' })"], ["wait", 1800]],
      clip: [["key", "x", 80], ["wait", 700], ["key", "x", 80], ["wait", 900], ["still"], ["key", "x", 80], ["wait", 700], ["key", "x", 80], ["wait", 900], ["key", "x", 80], ["wait", 700]],
      after: []
    }
  },
  {
    id: "vector-dream",
    title: { en: "A 3D renderer written by hand", zh: "手写的三维渲染器" },
    note: {
      en: "No WebGL: every triangle is projected, lit and dithered into four tones by the app's own code. A knot, a flyover across hills at dusk, a crystal. Turn the view, switch to wireframe, or let it tour by itself.",
      zh: "不用 WebGL：每个三角形都由应用自己的代码投影、打光，再抖动成四种颜色。环结、黄昏时飞越山地、一颗晶体。可以转视角、切线框，也可以让它自己巡游。"
    },
    uses: ["lo-3d", "buttons"],
    scene: {
      /* the flyover across the hills (its second scene) is the film and the cover; then the crystal, the knot, the wireframe */
      setup: [["wait", 1500], ["key", "x", 80], ["wait", 1200]],
      clip: [["wait", 1500], ["still"], ["wait", 2600]],
      after: [["key", "x", 80], ["wait", 1500], ["still"], ["key", "x", 80], ["wait", 1500], ["still"], ["key", "z", 80], ["wait", 800], ["still"]]
    }
  },
  {
    id: "photo-puzzle",
    title: { en: "Take a photo, slide it back together", zh: "拍一张照片，再一块块拼回来" },
    note: {
      en: "The handheld's camera takes a four-tone photo and cuts it into tiles. Or pick one of six built-in pictures. Normal mode for a quiet puzzle, arcade mode against the clock, and a solver that shows you how.",
      zh: "用掌机的相机拍一张四色照片，切成滑块。也可以从六张内置图片里挑。普通模式慢慢拼，街机模式和时间赛跑，还有一个会演示解法的帮手。"
    },
    uses: ["camera", "buttons", "save"],
    scene: {
      /* a built-in picture (the film never uses a camera): the picker is the cover, then the tiles slide */
      setup: [["wait", 1200], ["still"], ["key", "ArrowRight", 80], ["wait", 300], ["key", "x", 80], ["wait", 1000], ["cover"], ["key", "x", 80], ["wait", 1400]],
      clip: [["key", "ArrowRight", 80], ["wait", 300], ["key", "ArrowUp", 80], ["wait", 300], ["key", "ArrowLeft", 80], ["wait", 300], ["key", "ArrowDown", 80], ["wait", 300], ["still"],
        ["key", "ArrowRight", 80], ["wait", 300], ["key", "ArrowUp", 80], ["wait", 300], ["key", "ArrowLeft", 80], ["wait", 300], ["key", "ArrowDown", 80], ["wait", 300], ["key", "ArrowRight", 80], ["wait", 400]]
    }
  },
  {
    id: "paint",
    title: { en: "A 96 x 96 pixel canvas in four tones", zh: "96×96 的四色点阵画板" },
    note: {
      en: "Draw with the pen, fill, undo and redo. Import any picture and it comes in dithered to the four tones; export your drawing as a PNG. Every file in or out goes through the handheld's own dialog.",
      zh: "画笔、填充、撤销、重做。导入任何图片，它会抖动成四种颜色；画好了可以导出 PNG。每一次进出文件，都要经过掌机自己的确认框。"
    },
    uses: ["files", "touch"],
    scene: {
      setup: [["wait", 600], ["tapIn", "#size", 0.5, 0.5], ["wait", 400]],
      clip: [["stroke", "#cv", [[30, 12], [66, 12], [66, 84], [30, 84], [30, 12]], 96], ["stroke", "#cv", [[36, 18], [60, 18], [60, 42], [36, 42], [36, 18]], 96],
        ["stroke", "#cv", [[42, 32], [45, 35], [51, 35], [54, 32]], 96], ["stroke", "#cv", [[35, 60], [47, 60]], 96], ["stroke", "#cv", [[41, 54], [41, 66]], 96], ["still"], ["wait", 600]],
      after: [["cover"]]
    }
  }
];
