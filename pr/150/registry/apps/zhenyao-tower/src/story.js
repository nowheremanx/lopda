/* The script of 镇妖塔·序章: every line of dialogue, and the maps after the town (src/town.js keeps the town).
   Data only. docs/zhenyao-story.md is the story bible behind it (world, people, foreshadowing).
   A page is {name, say: [lines]}: each string is one dialogue box, "\n" splits it into two lines,
   and a line holds at most 13 characters. No name: narration.

   Map characters (one character is one world unit, row 0 is north):
     "." ground   "," path   "T" tree   "R" rock   "X" wall (cliff, tower wall, or the roof's railing)
     "L" stone lantern (a light)   "F" brazier (a light)   "P" pillar   "G" the tower gate
     "$" save stone   "C" chest   "M" carved mural   "^" stairs up   "v" stairs down (scenery)
     "1"-"5" an enemy you can see: fight k-1 of BATTLE.ROUTE[part]   "B" the boss   "N" a person (people[])
   Everything but ".", "," and the enemies' own tiles is solid. Walking within one tile of an enemy
   (diagonals too) starts its fight, so every enemy stands where the way through is no wider than that.
   chests: what each "C" holds, in reading order (left to right, top to bottom). */
var STORY = {
  /* ---------- 青石镇 (src/town.js has the map) ---------- */
  town: {
    /* the camera comes down from the glowing tower to the hero */
    intro: [
      { say: ["夜里，塔顶又亮了。"] },
      { name: "阿砚", say: ["封印……又松了？", "师父在北门等我。"] }
    ],
    granny: [
      { name: "婆婆", say: ["阿砚，要上塔啦？", "你那把小银锁，\n还戴着吧？", "你被抱回来时，\n就戴着它。", "那是哪一年来着……", "对，塔顶亮的那年。\n也是封印松的那年。", "哎，老了，\n记混了也说不定。"] }
    ],
    child: [
      { name: "阿青", say: ["井里有星星！", "……骗你的。", "那塔顶的光，\n也是骗人的吗？"] }
    ],
    /* the first talk with the master opens the road north; the hero asks where he comes from */
    master: [
      { name: "师父", say: ["来了。", "塔顶的光，\n你也看见了。", "封印松了一角。\n你上去看看。", "能除就除，\n除不了就回来。"] },
      { name: "阿砚", say: ["师父，弟子一直想问……", "我是从哪里来的？"] },
      { name: "师父", say: ["……", "要下雨了。\n先上山吧。"] }
    ],
    masterAgain: [{ name: "师父", say: ["早去早回。"] }],
    northClosed: [{ say: ["北边是上山的路。", "先去北门见师父。"] }],
    south: [{ say: ["南边是回家的路。", "……现在不回去。"] }],
    well: [{ say: ["井水很凉。"] }]
  },

  /* ---------- 塔外山道: rain all the way up ---------- */
  road: {
    part: 0,
    kind: "road",
    weather: "rain",
    map: [
      "XXXXXXGGXXXXXX",
      "XTL...,,...LTX",
      "XT....,,....TX",
      "XTTR..,,..RTTX",
      "XTTTT.5,.TTTTX",
      "XTTTTR,,TTTTTX",
      "XTTTT,,RTTTTTX",
      "XTTT,,TTTTTTTX",
      "XTT,4TTTTTTTTX",
      "XTT,,,TTTTTTTX",
      "XTTTR,,,,TTTTX",
      "XTTTTTT,3,TTTX",
      "XTTTTTTT,,TTTX",
      "XTTTTTT,,,TTTX",
      "XTTTTR,,,TTTTX",
      "XTTTT2,,TTTTTX",
      "XTTT,,,RTTTTTX",
      "XTTT,,TTTTTTTX",
      "XTT.,1,TTTTTTX",
      "XTT..,,,,TTTTX",
      "XTTTT..,,,TTTX",
      "XTTTTT.,,.TTTX",
      "XTTTTN.,,..TTX",
      "XTTTT$.,,.C.TX",
      "XTTTT..,,...TX",
      "XTTTT..,,..TTX",
      "XXXXXXX,,XXXXX"
    ],
    start: { x: 7, y: 25, face: "up" },
    chests: ["pill"],
    people: [
      { art: "woodcutter", name: "樵夫", say: ["这雨下得邪门。", "山上有狐火游荡，\n它们怕水。", "小哥，你真要上塔？"] }
    ],
    enter: [{ say: ["下雨了。"] }],
    south: [{ say: ["先去塔里看看。"] }],
    gate: [{ say: ["塔门虚掩着。"] }]
  },

  /* ---------- 镇妖塔 一层 ---------- */
  floor1: {
    part: 1,
    kind: "tower",
    map: [
      "XXXXXXXXXXXXX",
      "XXXXXX^XXXXXX",
      "XF...P3P...FX",
      "X...........X",
      "XXXXXXXXXX2XX",
      "XF..........X",
      "X..P.....P..X",
      "X...........X",
      "XX1XXXXXXXXXX",
      "X...........X",
      "X.C..P.P..C.X",
      "XF$...,...CFX",
      "XXXXXXvXXXXXX"
    ],
    start: { x: 6, y: 11, face: "up" },
    chests: ["pill", "ether", "pill"],
    enter: [{ say: ["塔里很静。", "静得不像有妖。"] }]
  },

  /* ---------- 镇妖塔 中层: the mural shows part of the pattern on the hero's silver lock ---------- */
  floor2: {
    part: 2,
    kind: "tower",
    map: [
      "XXXXXXXXXXXXX",
      "XXXXXX^XXXXXX",
      "XF...P3P...FX",
      "X...........X",
      "XX2XXXXXXXXXX",
      "X...........X",
      "XM..P...P..FX",
      "X...........X",
      "XXXXXXXXXX1XX",
      "X...........X",
      "X.C.P...P.C.X",
      "XF$...,....FX",
      "XXXXXXvXXXXXX"
    ],
    start: { x: 6, y: 11, face: "up" },
    chests: ["pill", "ether"],
    enter: [{ say: ["越往上，越冷。"] }],
    mural: [
      { say: ["壁上刻着一幅图。", "三道水纹，\n绕成一个圈。", "圈心剥落了。"] },
      { name: "阿砚", say: ["……好眼熟。"] }
    ]
  },

  /* ---------- 塔顶: open sky, the boss ---------- */
  top: {
    part: 3,
    kind: "roof",
    map: [
      "XXXXXXXXXXXXX",
      "X...........X",
      "X.....B.....X",
      "X...........X",
      "X...........X",
      "X.L.......L.X",
      "X...........X",
      "X....,,,....X",
      "XC.C.,,,.C.CX",
      "XL$..,,,...LX",
      "XXXXXXvXXXXXX"
    ],
    start: { x: 6, y: 9, face: "up" },
    chests: ["pill", "ether", "pill", "ether"],
    /* stepping onto row bossRow or further north starts the boss's entrance */
    bossRow: 6,
    enter: [{ say: ["风很大。", "塔顶的光，\n就在前面。"] }],
    /* the master is waiting on the roof; he casts no shadow. It is the mirage */
    boss: [
      { name: "师父", say: ["砚儿。", "塔顶没事了。\n随我下去吧。"] },
      { name: "阿砚", say: ["师父？\n您怎么会在这……", "……", "您没有影子。"] },
      { name: "师父", say: ["……呵。"] },
      { name: "蜃妖", say: ["好眼力。", "守塔的小娃娃，\n让我看看你——", "……咦？"] }
    ],
    /* after the fight: its last words, and what it leaves behind */
    pendant: [
      { name: "蜃妖", say: ["……原来如此。", "十六年前，\n被抱走的那个，", "就是你。"] },
      { name: "阿砚", say: ["你说什么？"] },
      { name: "蜃妖", say: ["你身上，\n有我们的气味。", "信不信……\n由你。"] }
    ],
    found: [
      { say: ["地上留下一枚玉佩。"] },
      { name: "阿砚", say: ["这纹样……", "三道水纹，\n绕着一只眼。", "和我的银锁\n一模一样。", "……是幻术吗？"] },
      { say: ["玉佩微微发烫。", "一股暖意涌进掌心，\n伤口不疼了。"] },
      { name: "阿砚", say: ["我到底是……"] }
    ]
  },

  /* ---------- 塔下, at dawn: the road map's gate, the rain has stopped ---------- */
  ending: {
    report: [
      { name: "师父", say: ["回来了。", "塔里如何？"] },
      { name: "阿砚", say: ["塔中一切如常。", "蜃妖已除。"] }
    ],
    /* after the close-up of the hand: the pendant hidden in the sleeve */
    answer: [
      { name: "师父", say: ["……", "……嗯。", "下去歇着吧。"] }
    ],
    end: "序章 完",
    credits: ["镇妖塔·序章", "", "作者", "Haowei Wu", "Claude", "", "内置 LX-3D 协处理器", "", "谢谢游玩"],
    next: ["镇妖塔", "第一章 待续"]
  },

  /* ---------- shared ---------- */
  save: [{ say: ["符碑亮起微光。", "体力、法力回满了。\n行程已记下。"] }],
  chest: "得到 {item}。",
  chestEmpty: "箱子是空的。",
  lose: [{ say: ["眼前一黑……"] }],
  /* walking into a map or onto stairs: the place name shown for a moment */
  places: { road: "塔外山道", floor1: "镇妖塔 一层", floor2: "镇妖塔 中层", top: "镇妖塔 塔顶", ending: "塔下" }
};
