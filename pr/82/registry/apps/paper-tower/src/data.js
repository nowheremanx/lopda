/* Paper Tower: the tower's data. Pure data and lookups, no drawing and no PAD calls,
   so tests can load this file in Node (tests/paper-tower.test.mjs).
   Every name, line, map and number here is original to this game. MIT License. */
var PT = PT || {};
PT.DATA = (function () {
  "use strict";

  function L(zh, en) { return { zh: zh, en: en }; }

  /* One zone per six pages. The tower gets harder in four steps. */
  var ZONES = [
    { name: L("纸页", "Paper Leaves"), sky: L("纸的呼吸", "Paper breathing") },
    { name: L("朱印", "Red Seals"), sky: L("印泥的味道", "The smell of seal paste") },
    { name: L("折角", "Creases"), sky: L("折痕在响", "The creases are creaking") },
    { name: L("灯芯", "The Wick"), sky: L("灯油快干了", "The oil is running low") }
  ];

  var FLOOR_NAMES = [
    L("折页", "The Fold"), L("纸缝", "Paper Seam"), L("守页人的灯", "Keeper's Lamp"),
    L("墨铺", "Ink Shop"), L("空白页", "Blank Page"), L("墨守", "Ink Warden"),
    L("第二折", "Second Fold"), L("折纸匠", "The Folder"), L("双门", "Twin Doors"),
    L("铜墨铺", "Copper Shop"), L("背面", "The Reverse"), L("朱印", "Red Seal"),
    L("第三折", "Third Fold"), L("蠹影", "Bookworm Shade"), L("对折", "Folded Pair"),
    L("银墨铺", "Silver Shop"), L("夹层", "The Interleaf"), L("折角", "Dog-ear"),
    L("第四折", "Fourth Fold"), L("金墨铺", "Gold Shop"), L("双锁", "Twin Locks"),
    L("墨海", "Ink Sea"), L("最后一页", "Last Leaf"), L("长明灯", "The Everlamp")
  ];

  /* Monster kinds. Stats are per zone: [zone 1, zone 2, zone 3, zone 4].
     hp, atk, def, gold. No randomness anywhere: a fight is arithmetic. */
  var MONSTERS = {
    i: { art: "ink", names: [L("墨滴", "Ink Drop"), L("墨精", "Ink Sprite"), L("墨魇", "Ink Nightmare"), L("墨渊精", "Abyss Ink")],
      stats: [[45, 22, 0, 7], [380, 85, 18, 45], [1500, 260, 60, 180], [5000, 700, 180, 700]] },
    p: { art: "mite", names: [L("纸虫", "Paper Mite"), L("纸蠹", "Paper Worm"), L("页蠹", "Page Worm"), L("书蠹", "Book Worm")],
      stats: [[70, 26, 3, 9], [520, 100, 30, 60], [2000, 320, 100, 240], [6500, 850, 280, 900]] },
    t: { art: "ant", names: [L("字蚁", "Letter Ant"), L("字蚁兵", "Ant Soldier"), L("字蚁将", "Ant Captain"), L("字蚁王", "Ant King")],
      stats: [[95, 32, 5, 12], [650, 120, 42, 75], [2600, 380, 140, 320], [8000, 1000, 360, 1200]] },
    w: { art: "moth", names: [L("折翅蛾", "Folded Moth"), L("灰蛾", "Ash Moth"), L("铁翅蛾", "Ironwing"), L("烬蛾", "Ember Moth")],
      stats: [[60, 45, 1, 14], [450, 170, 20, 90], [1700, 500, 70, 380], [5500, 1400, 220, 1400]] },
    k: { art: "staple", names: [L("钉书虫", "Staple Bug"), L("钉书甲", "Stapled Shell"), L("钉书兽", "Staple Beast"), L("铁钉兽", "Iron Staple")],
      stats: [[170, 30, 10, 22], [900, 110, 60, 120], [3200, 300, 200, 450], [9000, 800, 500, 1600]] },
    o: { art: "pool", names: [L("墨池", "Ink Pool"), L("墨沼", "Ink Marsh"), L("墨渊", "Ink Abyss"), L("墨海", "Ink Sea")],
      stats: [[260, 38, 6, 30], [1200, 140, 40, 150], [4200, 420, 120, 550], [12000, 1100, 300, 2000]] },
    u: { art: "turtle", names: [L("朱印龟", "Seal Turtle"), L("龟印", "Seal Shell"), L("石印龟", "Stone Seal"), L("印海龟", "Seal Sea Turtle")],
      stats: [[0, 0, 0, 0], [1000, 90, 90, 160], [3000, 260, 260, 500], [9000, 700, 650, 1800]] },
    e: { art: "wraith", names: [L("残页魂", "Page Wraith"), L("残页魂", "Page Wraith"), L("烬页魂", "Ember Wraith"), L("烧页魂", "Burning Wraith")],
      stats: [[0, 0, 0, 0], [700, 150, 30, 110], [2400, 450, 110, 420], [7000, 1200, 260, 1300]] },
    c: { art: "copyist", names: [L("影抄手", "Shadow Copyist"), L("影抄手", "Shadow Copyist"), L("墨抄手", "Ink Copyist"), L("暗抄手", "Dark Copyist")],
      stats: [[0, 0, 0, 0], [800, 130, 50, 130], [2800, 410, 150, 440], [8500, 1100, 340, 1500]] },
    v: { art: "shade", names: [L("蠹影", "Bookworm Shade"), L("蠹影", "Bookworm Shade"), L("蠹将影", "Shade Captain"), L("蠹王影", "King's Shade")],
      stats: [[0, 0, 0, 0], [1100, 125, 55, 150], [3600, 390, 170, 500], [10000, 1000, 400, 1700]] }
  };

  /* The three keepers and the last one. z is the zone boss, Z the king. */
  var BOSSES = {
    6: { art: "warden", name: L("墨守", "Ink Warden"), hp: 800, atk: 70, def: 16, gold: 150,
      say: [L("这一页归我守。", "This page is mine to keep."), L("你连自己的名字都写不完整。", "You cannot even write your own name whole.")] },
    12: { art: "seal", name: L("朱印兽", "Seal Beast"), hp: 3500, atk: 300, def: 70, gold: 600,
      say: [L("红印落下，纸就不能回头。", "Once the red seal falls, paper cannot turn back."), L("回头吧，小折角。", "Turn back, little crease.")] },
    18: { art: "giant", name: L("折角巨灵", "Crease Giant"), hp: 12000, atk: 700, def: 180, gold: 2000,
      say: [L("每一道折痕，都是我折的。", "Every crease here was folded by me."), L("你也是。", "You too.")] },
    24: { art: "king", name: L("蠹王", "Bookworm King"), hp: 30000, atk: 1100, def: 600, gold: 6000,
      say: [L("灯灭了，纸就不必再装作有字。", "With the lamp out, paper need not pretend to have words."), L("你爬到顶，也只是想被读一遍。", "You climbed here only to be read once.")] }
  };

  var ITEMS = {
    h: { kind: "hp", art: "redPotion", names: [L("红墨", "Red Ink")], value: [200, 700, 2000, 5000] },
    H: { kind: "hp", art: "bluePotion", names: [L("蓝墨", "Blue Ink")], value: [800, 2500, 6000, 15000] },
    a: { kind: "atk", art: "redGem", names: [L("攻石", "Attack Stone")], value: [3, 6, 12, 20] },
    d: { kind: "def", art: "blueGem", names: [L("守石", "Guard Stone")], value: [3, 6, 12, 20] },
    s: { kind: "atk", art: "sword", names: [L("纸刃", "Paper Blade"), L("铁笔", "Iron Brush"), L("裁纸刀", "Paper Knife"), L("金笔", "Gold Brush")],
      value: [10, 25, 50, 90] },
    S: { kind: "def", art: "shield", names: [L("纸甲", "Paper Coat"), L("铜页", "Copper Leaf"), L("叠甲", "Layered Coat"), L("石页", "Stone Leaf")],
      value: [10, 25, 50, 90] },
    g: { kind: "gold", art: "gold", names: [L("金屑", "Gold Dust")], value: [15, 50, 150, 400] },
    "*": { kind: "wick", art: "wick", names: [L("灯芯", "Wick")], value: [1, 1, 1, 1] }
  };

  var KEY_NAMES = {
    y: L("黄钥匙", "Yellow key"), b: L("蓝钥匙", "Blue key"), r: L("红钥匙", "Red key"),
    Y: L("黄门", "Yellow door"), B: L("蓝门", "Blue door"), R: L("红门", "Red door")
  };

  /* Shops. Stock does not refill; the four shops together are the whole economy. */
  var SHOPS = {
    4: { name: L("墨铺", "Ink Shop"), stock: [
      { id: "atk", amount: 4, times: 4, price: 15 }, { id: "def", amount: 4, times: 4, price: 15 },
      { id: "hp", amount: 400, times: 3, price: 15 }, { id: "y", amount: 1, times: 3, price: 8 },
      { id: "b", amount: 1, times: 1, price: 20 }
    ] },
    10: { name: L("铜墨铺", "Copper Shop"), stock: [
      { id: "atk", amount: 8, times: 4, price: 70 }, { id: "def", amount: 8, times: 4, price: 70 },
      { id: "hp", amount: 1200, times: 3, price: 50 }, { id: "y", amount: 1, times: 3, price: 20 },
      { id: "b", amount: 1, times: 1, price: 60 }, { id: "r", amount: 1, times: 1, price: 120 }
    ] },
    16: { name: L("银墨铺", "Silver Shop"), stock: [
      { id: "atk", amount: 15, times: 4, price: 150 }, { id: "def", amount: 15, times: 4, price: 150 },
      { id: "hp", amount: 3000, times: 3, price: 100 }, { id: "y", amount: 1, times: 3, price: 40 },
      { id: "b", amount: 1, times: 2, price: 100 }, { id: "r", amount: 1, times: 1, price: 250 }
    ] },
    20: { name: L("金墨铺", "Gold Shop"), stock: [
      { id: "atk", amount: 28, times: 4, price: 300 }, { id: "def", amount: 28, times: 4, price: 300 },
      { id: "hp", amount: 7000, times: 3, price: 200 }, { id: "y", amount: 1, times: 3, price: 80 },
      { id: "b", amount: 1, times: 3, price: 200 }, { id: "r", amount: 1, times: 2, price: 450 }
    ] }
  };

  /* People. npc is where they stand on that page; the map has n there. */
  var NPCS = {
    3: { art: "keeper", name: L("守页人", "Page Keeper"), lines: [
      L("欢迎，折角。塔又合上了。", "Welcome, crease. The tower has folded again."),
      L("黄门用黄钥匙，蓝门用蓝钥匙，红门用红钥匙。别拿错。", "Yellow doors take yellow keys. Right key, right door."),
      L("撞一撞可疑的墙。纸塔里到处是折缝。", "Bump the suspicious walls. The tower is full of seams."),
      L("商店不涨价。打不过，就回去买。", "The shops never raise prices. Stuck? Go back and buy.")
    ] },
    8: { art: "folder", name: L("折纸匠", "The Folder"), gift: 6, lines: [
      L("我只折一次。伸出手。", "I fold once only. Hold out your hand."),
      L("要更利的边，还是更韧的面？", "A sharper edge, or a tougher face?")
    ], choice: [L("更利的边　攻 +6", "Sharper: ATK +6"), L("更韧的面　守 +6", "Tougher: DEF +6")] },
    14: { art: "shade", name: L("蠹影", "Bookworm Shade"), lines: [
      L("你看见那些有裂纹的墙了吗？", "See the walls with the little cracks?"),
      L("按 SELECT，折缝会自己显出来。", "Press SELECT. The seams show themselves."),
      L("塔顶的灯要三根灯芯。七、十三、十九页。", "The lamp needs three wicks: pages seven, thirteen, nineteen."),
      L("少一根也能点，只是会烧得凶些。", "It lights with fewer. It just burns wilder.")
    ] },
    23: { art: "echo", name: L("守灯人的回声", "The Keeper's Echo"), lines: [
      L("下面就是灯。蠹王在灯座上。", "The lamp is below. The King sits on its stand."),
      L("它怕你带着三根灯芯。", "It fears three wicks in your hand."),
      L("如果你只带了一根，也别回头。灯还认得你。", "If you carry only one, do not turn back. The lamp knows you.")
    ] }
  };

  /* Pages 1-24. Characters:
     # wall . floor < down  > up | Y B R doors y b r keys | h H potions a d stones s S gear g gold
     i p t w k o u e c v monsters | z zone boss Z king | m shop n person f fountain * wick L lamp
     % false wall: looks solid, opens when bumped or revealed with SELECT. */
  var FLOORS = [
    { n: 1, map: [
      "###########",
      "#....>....#",
      "#....a....#",
      "#..p......#",
      "#.........#",
      "#####Y#####",
      "#.........#",
      "#..h......#",
      "#.......y.#",
      "#..<...i..#",
      "###########"
    ] },
    { n: 2, map: [
      "###########",
      "#..f..>..a#",
      "#.........#",
      "###Y###Y###",
      "#.....#...#",
      "#..i..#.h.#",
      "#.....#...#",
      "#####.#####",
      "#.........#",
      "#.<...y...#",
      "###########"
    ] },
    { n: 3, map: [
      "###########",
      "#....>....#",
      "#.........#",
      "#..a...n..#",
      "#.........#",
      "#....Y....#",
      "#..i..y...#",
      "#..p...####",
      "#......#g##",
      "#.<....%.##",
      "###########"
    ] },
    { n: 4, map: [
      "###########",
      "#....>....#",
      "#.........#",
      "#.###Y###.#",
      "#.#.....#.#",
      "#.#.m.s.#.#",
      "#.#.....#.#",
      "#.###.###.#",
      "#..g..k...#",
      "#.<...i...#",
      "###########"
    ] },
    { n: 5, map: [
      "###########",
      "#....>....#",
      "#..d...b..#",
      "#........p#",
      "#.#######.#",
      "#.........#",
      "#..S...a..#",
      "#.........#",
      "#..i...i..#",
      "#.<.......#",
      "###########"
    ] },
    { n: 6, map: [
      "###########",
      "#....>....#",
      "#..h...H..#",
      "#.........#",
      "#..a...d..#",
      "#####z#####",
      "#....o....#",
      "#..b...y..#",
      "#..k..h...#",
      "#.<.......#",
      "###########"
    ] },
    { n: 7, map: [
      "###########",
      "#....>....#",
      "#.........#",
      "#..a.s.d..#",
      "#.........#",
      "#####Y#####",
      "#..p...wyh#",
      "#..k...####",
      "#......#*##",
      "#.<....%.##",
      "###########"
    ] },
    { n: 8, map: [
      "###########",
      "#....>....#",
      "#..f...H..#",
      "#.........#",
      "#..n......#",
      "#####Y#####",
      "#.........#",
      "#..u.y.h..#",
      "#....e....#",
      "#.<.......#",
      "###########"
    ] },
    { n: 9, map: [
      "###########",
      "#....>....#",
      "#..a.s.d..#",
      "#.........#",
      "###Y###Y###",
      "#.........#",
      "#..k...u..#",
      "#....h....#",
      "#..b.y.r..#",
      "#.<.......#",
      "###########"
    ] },
    { n: 10, map: [
      "###########",
      "#....>....#",
      "#..H...e..#",
      "#.###Y###.#",
      "#.#.....#.#",
      "#.#.m.g.#.#",
      "#.#.....#.#",
      "#.###.###.#",
      "#..d..k...#",
      "#.<...w...#",
      "###########"
    ] },
    { n: 11, map: [
      "###########",
      "#....>....#",
      "#..g...a..#",
      "#..e..h.p.#",
      "#.###%###.#",
      "#.#..a..#.#",
      "#.#.v.o.#.#",
      "#.#..d..#.#",
      "#.#######.#",
      "#.<.......#",
      "###########"
    ] },
    { n: 12, map: [
      "###########",
      "#....>....#",
      "#..H.S.a..#",
      "#.........#",
      "#..d...b..#",
      "#####z#####",
      "#.........#",
      "#..h...y..#",
      "#..o...w..#",
      "#.<.....f.#",
      "###########"
    ] },
    { n: 13, map: [
      "###########",
      "#....>....#",
      "#..a.s.d..#",
      "#.........#",
      "#####Y#####",
      "#.........#",
      "#..o...####",
      "#..c...#*##",
      "#......%.##",
      "#.<.hyk.###",
      "###########"
    ] },
    { n: 14, map: [
      "###########",
      "#....>....#",
      "#..f...H..#",
      "#.........#",
      "#..n......#",
      "#####Y#####",
      "#.........#",
      "#..e..yc..#",
      "#....u....#",
      "#.<.......#",
      "###########"
    ] },
    { n: 15, map: [
      "###########",
      "#....>....#",
      "#..a.s.d..#",
      "#.........#",
      "###B###R###",
      "#.........#",
      "#..u...k..#",
      "#.........#",
      "#..b...r..#",
      "#.<.h.e...#",
      "###########"
    ] },
    { n: 16, map: [
      "###########",
      "#....>....#",
      "#..H...c..#",
      "#.###Y###.#",
      "#.#.....#.#",
      "#.#.m.g.#.#",
      "#.#.....#.#",
      "#.###.###.#",
      "#..d..o...#",
      "#.<...v...#",
      "###########"
    ] },
    { n: 17, map: [
      "###########",
      "#....>....#",
      "#..e.S.p..#",
      "#.........#",
      "#.###%###.#",
      "#.#..a..#.#",
      "#.#.v.o.#.#",
      "#.#..d..#.#",
      "#.#######.#",
      "#.<.......#",
      "###########"
    ] },
    { n: 18, map: [
      "###########",
      "#....>....#",
      "#..H.S.a..#",
      "#.........#",
      "#..d...b..#",
      "#####z#####",
      "#.........#",
      "#..h...r..#",
      "#..o...w..#",
      "#.<.h...f.#",
      "###########"
    ] },
    { n: 19, map: [
      "###########",
      "#....>....#",
      "#..a.s.d..#",
      "#.........#",
      "#####Y#####",
      "#.........#",
      "#..o...####",
      "#..c...#*##",
      "#......%.##",
      "#.<.hyk.###",
      "###########"
    ] },
    { n: 20, map: [
      "###########",
      "#....>....#",
      "#..f...H..#",
      "#.###Y###.#",
      "#.#.....#.#",
      "#.#.m.g.#.#",
      "#.#.....#.#",
      "#.###.###.#",
      "#..d..o...#",
      "#.<...v...#",
      "###########"
    ] },
    { n: 21, map: [
      "###########",
      "#....>....#",
      "#..a.s.d..#",
      "#.........#",
      "###B###R###",
      "#.........#",
      "#..k...u..#",
      "#.........#",
      "#..b...r..#",
      "#.<.h.e...#",
      "###########"
    ] },
    { n: 22, map: [
      "###########",
      "#....>....#",
      "#..e.S.p..#",
      "#.........#",
      "#.###%###.#",
      "#.#.H.h.#.#",
      "#.#.o.c.#.#",
      "#.#..d..#.#",
      "#.#######.#",
      "#.<.......#",
      "###########"
    ] },
    { n: 23, map: [
      "###########",
      "#....>....#",
      "#..H.S.a..#",
      "#.u.....k.#",
      "#.........#",
      "#..h.n.H..#",
      "#.........#",
      "#.v.....c.#",
      "#..d...b..#",
      "#.<.......#",
      "###########"
    ] },
    { n: 24, map: [
      "###########",
      "#....L....#",
      "#....#....#",
      "#..H.#.H..#",
      "#....#....#",
      "#....#....#",
      "#..a...d..#",
      "#####Z#####",
      "#......c..#",
      "#.<...f.H.#",
      "###########"
    ] }
  ];

  /* The first page's gate is sealed; the last page's lamp is the goal. */
  var WICKS = 3;

  function zoneOf(n) { return Math.min(3, Math.floor((n - 1) / 6)); }
  function floor(n) { return FLOORS[n - 1] || null; }
  function at(n, x, y) { var f = floor(n); return f && f.map[y] ? f.map[y][x] : null; }
  function monsterKind(ch) { return MONSTERS[ch] || null; }
  function monsterAt(ch, zone) {
    var m = MONSTERS[ch];
    if (!m || !m.stats[zone] || !m.stats[zone][0]) return null;
    var s = m.stats[zone];
    return { ch: ch, art: m.art, name: m.names[zone], hp: s[0], atk: s[1], def: s[2], gold: s[3], zone: zone };
  }
  function bossAt(n) {
    var b = BOSSES[n];
    return b ? { ch: n === 24 ? "Z" : "z", art: b.art, name: b.name, hp: b.hp, atk: b.atk, def: b.def, gold: b.gold, boss: true, floor: n, say: b.say } : null;
  }
  function itemAt(ch, zone) {
    var it = ITEMS[ch];
    if (!it) return null;
    return { ch: ch, kind: it.kind, art: it.art, name: it.names[Math.min(zone, it.names.length - 1)], amount: it.value[zone], zone: zone };
  }
  function isMonster(ch) { return !!MONSTERS[ch]; }
  function isDoor(ch) { return ch === "Y" || ch === "B" || ch === "R"; }
  function doorKey(ch) { return ch === "Y" ? "y" : ch === "B" ? "b" : "r"; }
  function isItem(ch) { return !!ITEMS[ch] || ch === "y" || ch === "b" || ch === "r"; }
  function isBlocking(ch) { return ch === "m" || ch === "n"; }
  function isStair(ch) { return ch === ">" || ch === "<"; }

  return {
    ZONES: ZONES, FLOOR_NAMES: FLOOR_NAMES, MONSTERS: MONSTERS, BOSSES: BOSSES, ITEMS: ITEMS,
    KEY_NAMES: KEY_NAMES, SHOPS: SHOPS, NPCS: NPCS, FLOORS: FLOORS, WICKS: WICKS,
    zoneOf: zoneOf, floor: floor, at: at, monsterKind: monsterKind, monsterAt: monsterAt,
    bossAt: bossAt, itemAt: itemAt, isMonster: isMonster, isDoor: isDoor, doorKey: doorKey,
    isItem: isItem, isBlocking: isBlocking, isStair: isStair
  };
})();
