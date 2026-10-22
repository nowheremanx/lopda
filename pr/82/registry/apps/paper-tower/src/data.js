/* Paper Tower: twelve hand-built pages. Pure data and lookups, no drawing and no PAD calls,
   so tests can load this file in Node (tests/paper-tower.test.mjs).
   All pages, names, lines, numbers, art and music are ours. MIT License. */
var PT = PT || {};
PT.DATA = (function () {
  "use strict";

  function L(zh, en) { return { zh: zh, en: en }; }

  var ZONES = [
    { name: L("纸页", "Paper Leaves") },
    { name: L("朱印", "Red Seals") },
    { name: L("灯芯", "The Wick") }
  ];

  var FLOOR_NAMES = [
    L("折页", "The Fold"), L("墨铺", "Ink Shop"), L("守页人的灯", "Keeper's Lamp"), L("墨守", "Ink Warden"),
    L("朱印", "Red Seal"), L("铜墨铺", "Copper Shop"), L("夹层", "The Interleaf"), L("朱印兽", "Seal Beast"),
    L("墨海", "Ink Sea"), L("金墨铺", "Gold Shop"), L("残灯", "Dying Lamp"), L("蠹王", "Bookworm King")
  ];

  /* Three zones. A monster's ability is part of the arithmetic: the forecast and the
     bestiary both show it, so a fight is a decision, not a surprise.
       armor  hero damage is cut by a quarter
       first  one extra hit before the hero swings
       pierce hero DEF counts for half
       drain  monster HP counts as 25% more
       poison after a win, lose 8% of max HP as well */
  var MONSTERS = {
    i: { art: "ink", ability: null, names: [L("墨滴", "Ink Drop"), L("墨精", "Ink Sprite"), L("墨魇", "Ink Nightmare")],
      stats: [[45, 22, 0, 7], [380, 85, 18, 45], [1500, 260, 60, 180]] },
    p: { art: "mite", ability: null, names: [L("纸虫", "Paper Mite"), L("纸蠹", "Paper Worm"), L("页蠹", "Page Worm")],
      stats: [[70, 26, 3, 9], [520, 100, 30, 60], [2000, 320, 100, 240]] },
    t: { art: "ant", ability: null, names: [L("字蚁", "Letter Ant"), L("字蚁兵", "Ant Soldier"), L("字蚁将", "Ant Captain")],
      stats: [[95, 32, 5, 12], [650, 120, 42, 75], [2600, 380, 140, 320]] },
    w: { art: "moth", ability: "first", names: [L("折翅蛾", "Folded Moth"), L("灰蛾", "Ash Moth"), L("铁翅蛾", "Ironwing")],
      stats: [[60, 45, 1, 14], [450, 170, 20, 90], [1700, 500, 70, 380]] },
    k: { art: "staple", ability: "armor", names: [L("钉书虫", "Staple Bug"), L("钉书甲", "Stapled Shell"), L("钉书兽", "Staple Beast")],
      stats: [[170, 30, 10, 22], [900, 110, 60, 120], [3200, 300, 200, 450]] },
    o: { art: "pool", ability: "poison", names: [L("墨池", "Ink Pool"), L("墨沼", "Ink Marsh"), L("墨渊", "Ink Abyss")],
      stats: [[260, 38, 6, 30], [1200, 140, 40, 150], [4200, 420, 120, 550]] },
    u: { art: "turtle", ability: null, names: [L("朱印龟", "Seal Turtle"), L("龟印", "Seal Shell"), L("石印龟", "Stone Seal")],
      stats: [[0, 0, 0, 0], [1000, 90, 90, 160], [3000, 260, 260, 500]] },
    e: { art: "wraith", ability: "pierce", names: [L("残页魂", "Page Wraith"), L("烬页魂", "Ember Wraith"), L("烧页魂", "Burning Wraith")],
      stats: [[0, 0, 0, 0], [700, 150, 30, 110], [2400, 450, 110, 420]] },
    c: { art: "copyist", ability: "drain", names: [L("影抄手", "Shadow Copyist"), L("墨抄手", "Ink Copyist"), L("暗抄手", "Dark Copyist")],
      stats: [[0, 0, 0, 0], [800, 130, 50, 130], [2800, 410, 150, 440]] },
    v: { art: "shade", ability: "first", names: [L("蠹影", "Bookworm Shade"), L("蠹将影", "Shade Captain"), L("蠹王影", "King's Shade")],
      stats: [[0, 0, 0, 0], [1100, 125, 55, 150], [3600, 390, 170, 500]] }
  };

  var BOSSES = {
    4: { art: "warden", ability: "armor", name: L("墨守", "Ink Warden"), hp: 450, atk: 45, def: 10, gold: 120,
      say: [L("这一页归我守。", "This page is mine to keep."), L("你连自己的名字都写不完整。", "You cannot even write your own name whole.")] },
    8: { art: "seal", ability: "pierce", name: L("朱印兽", "Seal Beast"), hp: 900, atk: 140, def: 40, gold: 400,
      say: [L("红印落下，纸就不能回头。", "Once the red seal falls, paper cannot turn back."), L("回头吧，小折角。", "Turn back, little crease.")] },
    12: { art: "king", ability: "first", name: L("蠹王", "Bookworm King"), hp: 5000, atk: 280, def: 95, gold: 2000,
      say: [L("灯灭了，纸就不必再装作有字。", "With the lamp out, paper need not pretend to have words."), L("你爬到顶，也只是想被读一遍。", "You climbed here only to be read once.")] }
  };

  var ITEMS = {
    h: { kind: "hp", art: "redPotion", names: [L("红墨", "Red Ink")], value: [200, 700, 2000] },
    H: { kind: "hp", art: "bluePotion", names: [L("蓝墨", "Blue Ink")], value: [800, 2500, 6000] },
    a: { kind: "atk", art: "redGem", names: [L("攻石", "Attack Stone")], value: [3, 6, 12] },
    d: { kind: "def", art: "blueGem", names: [L("守石", "Guard Stone")], value: [3, 6, 12] },
    s: { kind: "atk", art: "sword", names: [L("纸刃", "Paper Blade"), L("铁笔", "Iron Brush"), L("金笔", "Gold Brush")],
      value: [10, 25, 50] },
    S: { kind: "def", art: "shield", names: [L("纸甲", "Paper Coat"), L("铜页", "Copper Leaf"), L("灯甲", "Lamp Coat")],
      value: [10, 25, 50] },
    g: { kind: "gold", art: "gold", names: [L("金屑", "Gold Dust")], value: [15, 50, 150] },
    "*": { kind: "wick", art: "wick", names: [L("灯芯", "Wick")], value: [1, 1, 1] },
    q: { kind: "bomb", art: "bomb", names: [L("炸弹", "Bomb")], value: [1, 1, 1] },
    W: { kind: "holy", art: "holyWater", names: [L("圣水", "Holy Water")], value: [1, 1, 1] }
  };

  var ABILITY_NAMES = {
    armor: L("甲", "armor"), first: L("先", "first"), pierce: L("穿", "pierce"),
    drain: L("吸", "drain"), poison: L("毒", "poison")
  };

  var KEY_NAMES = {
    y: L("黄钥匙", "Yellow key"), b: L("蓝钥匙", "Blue key"), r: L("红钥匙", "Red key"),
    Y: L("黄门", "Yellow door"), B: L("蓝门", "Blue door"), R: L("红门", "Red door")
  };

  /* Short run, tight purse: the three shops cannot all be emptied. */
  var SHOPS = {
    2: { name: L("墨铺", "Ink Shop"), stock: [
      { id: "atk", amount: 3, times: 3, price: 15 }, { id: "def", amount: 3, times: 3, price: 15 },
      { id: "hp", amount: 400, times: 2, price: 15 }, { id: "y", amount: 1, times: 1, price: 15 }
    ] },
    6: { name: L("铜墨铺", "Copper Shop"), stock: [
      { id: "atk", amount: 10, times: 3, price: 80 }, { id: "def", amount: 10, times: 3, price: 80 },
      { id: "hp", amount: 1200, times: 2, price: 60 }, { id: "b", amount: 1, times: 1, price: 40 }
    ] },
    10: { name: L("金墨铺", "Gold Shop"), stock: [
      { id: "atk", amount: 20, times: 3, price: 200 }, { id: "def", amount: 20, times: 3, price: 200 },
      { id: "hp", amount: 3000, times: 2, price: 150 }, { id: "y", amount: 1, times: 2, price: 80 },
      { id: "b", amount: 1, times: 1, price: 120 }
    ] }
  };

  var NPCS = {
    2: { art: "keeper", name: L("守页人", "Page Keeper"), lines: [
      L("十二页，三道门。别把钥匙花在错的地方。", "Twelve pages, three gates. Do not spend a key on the wrong one."),
      L("打不过就回墨铺。钱只够买几样。", "Stuck? Go back to the shop. Your purse only covers a few things."),
      L("可疑的墙撞一撞。折缝不会自己开。", "Bump the suspicious walls. The folds do not open themselves.")
    ] },
    5: { art: "folder", name: L("折纸匠", "The Folder"), gift: 6, lines: [
      L("我只折一次。伸出手。", "I fold once only. Hold out your hand."),
      L("要更利的边，还是更韧的面？", "A sharper edge, or a tougher face?")
    ], choice: [L("更利的边　攻 +6", "Sharper: ATK +6"), L("更韧的面　守 +6", "Tougher: DEF +6")] },
    9: { art: "ferryman", name: L("渡墨人", "Ink Ferryman"), lines: [
      L("墨海下面没有底，只有沉下去的页。", "Under the Ink Sea there is no bottom, only sunken pages."),
      L("三根灯芯在三、七、十一页的折缝里。", "Three wicks wait in the folds of pages three, seven and eleven."),
      L("第十页是最后一家铺子。钱要留一点。", "Page ten is the last shop. Keep some coin.")
    ] }
  };

  /* Twelve pages. Characters:
     # wall . floor < down > up | Y B R doors y b r keys | h H potions a d stones s S gear g gold
     i p t w k o u e c v monsters | z boss Z king | m shop n person f spring * wick
     q bomb W holy water ~ poison page % false wall L lamp */
  var FLOORS = [
    { n: 1, map: [
      "###########", "#....>....#", "#..s...h..#", "#.........#", "#####Y#####",
      "#.........#", "#..i...d..#", "#......####", "#..a...#g##", "#.<..y.%.##", "###########"
    ] },
    { n: 2, map: [
      "###########", "#....>....#", "#..S...a..#", "#.........#", "#####Y#####",
      "#.........#", "#..m...n..#", "#.........#", "#..g...i..#", "#.<.......#", "###########"
    ] },
    { n: 3, map: [
      "###########", "#....>....#", "#..f...k..#", "#.........#", "#.###%###.#",
      "#.#...o.#.#", "#.#.*.a.#.#", "#.#...d.#.#", "#.#######.#", "#.<..n....#", "###########"
    ] },
    { n: 4, map: [
      "###########", "#....>....#", "#..H...a..#", "#.........#", "#..d...S..#",
      "#####z#####", "#.........#", "#..h...g..#", "#.........#", "#.<.......#", "###########"
    ] },
    { n: 5, map: [
      "###########", "#....>....#", "#..s.#.S..#", "#....#....#", "#..k.#..w.#",
      "#....#....#", "#..n.#....#", "#....#....#", "#..q.#....#", "#.<.......#", "###########"
    ] },
    { n: 6, map: [
      "###########", "#....>....#", "#..S...b..#", "#.........#", "#####Y#####",
      "#.........#", "#..m...w..#", "#.........#", "#..g.y.i..#", "#.<.......#", "###########"
    ] },
    { n: 7, map: [
      "###########", "#....>....#", "#..f...u..#", "#.........#", "#.###%###.#",
      "#~#...c.#k#", "#~#.*.a.#.#", "#~#...d.#.#", "#.#######.#", "#.<..n....#", "###########"
    ] },
    { n: 8, map: [
      "###########", "#....>....#", "#..H...a..#", "#.........#", "#..d...S..#",
      "#####z#####", "#.........#", "#..h...g..#", "#.........#", "#.<.......#", "###########"
    ] },
    { n: 9, map: [
      "###########", "#....>....#", "#..W...a..#", "#.........#", "#####Y#####",
      "#.........#", "#..v...c..#", "#.........#", "#..g.y.b..#", "#.<..n....#", "###########"
    ] },
    { n: 10, map: [
      "###########", "#....>....#", "#..a.#.d..#", "#....#....#", "###B###Y###",
      "#.........#", "#..m...v..#", "#.........#", "#..g...a..#", "#.<.......#", "###########"
    ] },
    { n: 11, map: [
      "###########", "#....>....#", "#..f...u..#", "#.........#", "#.###%###.#",
      "#.#..*..#.#", "#.#..c..#.#", "#.#...d.#.#", "#.#######.#", "#.<..e...k#", "###########"
    ] },
    { n: 12, map: [
      "###########", "#....L....#", "#..H.#.H..#", "#....#....#", "#..a...d..#",
      "#####Z#####", "#.........#", "#..h...g..#", "#.........#", "#.<.......#", "###########"
    ] }
  ];

  var WICKS = 3;

  function zoneOf(n) { return Math.min(2, Math.floor((n - 1) / 4)); }
  function floor(n) { return FLOORS[n - 1] || null; }
  function at(n, x, y) { var f = floor(n); return f && f.map[y] ? f.map[y][x] : null; }
  function monsterKind(ch) { return MONSTERS[ch] || null; }
  function monsterAt(ch, zone) {
    var m = MONSTERS[ch];
    if (!m || !m.stats[zone] || !m.stats[zone][0]) return null;
    var s = m.stats[zone];
    return { ch: ch, art: m.art, name: m.names[zone], hp: s[0], atk: s[1], def: s[2], gold: s[3], zone: zone, ability: m.ability };
  }
  function bossAt(n) {
    var b = BOSSES[n];
    return b ? { ch: n === 12 ? "Z" : "z", art: b.art, name: b.name, hp: b.hp, atk: b.atk, def: b.def, gold: b.gold, boss: true, floor: n, say: b.say, ability: b.ability } : null;
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
    KEY_NAMES: KEY_NAMES, ABILITY_NAMES: ABILITY_NAMES, SHOPS: SHOPS, NPCS: NPCS, FLOORS: FLOORS, WICKS: WICKS,
    zoneOf: zoneOf, floor: floor, at: at, monsterKind: monsterKind, monsterAt: monsterAt,
    bossAt: bossAt, itemAt: itemAt, isMonster: isMonster, isDoor: isDoor, doorKey: doorKey,
    isItem: isItem, isBlocking: isBlocking, isStair: isStair
  };
})();
