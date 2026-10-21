/* Paper Tower: the tower's data. Pure data and lookups, no drawing and no PAD calls,
   so tests can load this file in Node (tests/paper-tower.test.mjs).
   Fifty original pages are assembled from ten original floor plans; every name, line,
   map, number and decoration is ours. MIT License. */
var PT = PT || {};
PT.DATA = (function () {
  "use strict";

  function L(zh, en) { return { zh: zh, en: en }; }

  /* Five zones of ten pages. */
  var ZONES = [
    { name: L("纸页", "Paper Leaves") },
    { name: L("朱印", "Red Seals") },
    { name: L("折角", "Creases") },
    { name: L("墨海", "Ink Sea") },
    { name: L("灯芯", "The Wick") }
  ];

  var FLOOR_NAMES = [
    L("折页", "The Fold"), L("纸缝", "Paper Seam"), L("守页人的灯", "Keeper's Lamp"), L("第二折", "Second Fold"),
    L("墨铺", "Ink Shop"), L("纸风", "Paper Wind"), L("纸上潮", "Paper Tide"), L("双页", "Twin Leaves"),
    L("空白页", "Blank Page"), L("墨守", "Ink Warden"),
    L("朱印", "Red Seal"), L("印泥", "Seal Paste"), L("折纸匠", "The Folder"), L("双门", "Twin Doors"),
    L("铜墨铺", "Copper Shop"), L("背面", "The Reverse"), L("叠印", "Stacked Seals"), L("印池", "Seal Pool"),
    L("三折", "Third Fold"), L("朱印兽", "Seal Beast"),
    L("折角", "Dog-ear"), L("蠹影", "Bookworm Shade"), L("对折", "Folded Pair"), L("薄页", "Thin Leaf"),
    L("银墨铺", "Silver Shop"), L("折痕", "Crease"), L("墨沼", "Ink Marsh"), L("风页", "Wind Leaf"),
    L("双锁", "Twin Locks"), L("折角巨灵", "Crease Giant"),
    L("墨海", "Ink Sea"), L("海抄", "Sea Copy"), L("渡墨人", "Ink Ferryman"), L("沉页", "Sunken Leaf"),
    L("金墨铺", "Gold Shop"), L("暗页", "Dark Leaf"), L("墨潮", "Ink Tide"), L("灯影", "Lamp Shadow"),
    L("铁页", "Iron Leaf"), L("墨海主", "Ink Sea Lord"),
    L("灯芯", "Wick"), L("烬页", "Ember Leaf"), L("最后一页", "Last Leaf"), L("灯座", "Lamp Stand"),
    L("灯市", "Lamp Market"), L("火页", "Fire Leaf"), L("残灯", "Dying Lamp"), L("灯油", "Lamp Oil"),
    L("灯下", "Beneath the Lamp"), L("蠹王", "Bookworm King")
  ];

  /* Monster kinds. Stats are per zone: hp, atk, def, gold. No randomness. */
  var MONSTERS = {
    i: { art: "ink", names: [L("墨滴", "Ink Drop"), L("墨精", "Ink Sprite"), L("墨魇", "Ink Nightmare"), L("墨渊精", "Abyss Ink"), L("墨海精", "Sea Ink")],
      stats: [[45, 22, 0, 7], [380, 85, 18, 45], [1500, 260, 60, 180], [5000, 700, 180, 700], [8000, 1000, 250, 1000]] },
    p: { art: "mite", names: [L("纸虫", "Paper Mite"), L("纸蠹", "Paper Worm"), L("页蠹", "Page Worm"), L("书蠹", "Book Worm"), L("沉蠹", "Sunken Worm")],
      stats: [[70, 26, 3, 9], [520, 100, 30, 60], [2000, 320, 100, 240], [6500, 850, 280, 900], [10000, 1200, 400, 1300]] },
    t: { art: "ant", names: [L("字蚁", "Letter Ant"), L("字蚁兵", "Ant Soldier"), L("字蚁将", "Ant Captain"), L("字蚁王", "Ant King"), L("海字蚁", "Sea Ant")],
      stats: [[95, 32, 5, 12], [650, 120, 42, 75], [2600, 380, 140, 320], [8000, 1000, 360, 1200], [12000, 1400, 500, 1800]] },
    w: { art: "moth", names: [L("折翅蛾", "Folded Moth"), L("灰蛾", "Ash Moth"), L("铁翅蛾", "Ironwing"), L("烬蛾", "Ember Moth"), L("灯蛾", "Lamp Moth")],
      stats: [[60, 45, 1, 14], [450, 170, 20, 90], [1700, 500, 70, 380], [5500, 1400, 220, 1400], [8500, 1900, 300, 2000]] },
    k: { art: "staple", names: [L("钉书虫", "Staple Bug"), L("钉书甲", "Stapled Shell"), L("钉书兽", "Staple Beast"), L("铁钉兽", "Iron Staple"), L("海钉兽", "Sea Staple")],
      stats: [[170, 30, 10, 22], [900, 110, 60, 120], [3200, 300, 200, 450], [9000, 800, 500, 1600], [14000, 1100, 750, 2400]] },
    o: { art: "pool", names: [L("墨池", "Ink Pool"), L("墨沼", "Ink Marsh"), L("墨渊", "Ink Abyss"), L("墨海", "Ink Sea"), L("墨潮", "Ink Tide")],
      stats: [[260, 38, 6, 30], [1200, 140, 40, 150], [4200, 420, 120, 550], [12000, 1100, 300, 2000], [18000, 1600, 450, 3000]] },
    u: { art: "turtle", names: [L("朱印龟", "Seal Turtle"), L("龟印", "Seal Shell"), L("石印龟", "Stone Seal"), L("印海龟", "Seal Sea Turtle"), L("灯甲龟", "Lamp Shell")],
      stats: [[0, 0, 0, 0], [1000, 90, 90, 160], [3000, 260, 260, 500], [9000, 700, 650, 1800], [14000, 1000, 950, 2700]] },
    e: { art: "wraith", names: [L("残页魂", "Page Wraith"), L("残页魂", "Page Wraith"), L("烬页魂", "Ember Wraith"), L("烧页魂", "Burning Wraith"), L("灯页魂", "Lamp Wraith")],
      stats: [[0, 0, 0, 0], [700, 150, 30, 110], [2400, 450, 110, 420], [7000, 1200, 260, 1300], [11000, 1700, 350, 1900]] },
    c: { art: "copyist", names: [L("影抄手", "Shadow Copyist"), L("影抄手", "Shadow Copyist"), L("墨抄手", "Ink Copyist"), L("暗抄手", "Dark Copyist"), L("海抄手", "Sea Copyist")],
      stats: [[0, 0, 0, 0], [800, 130, 50, 130], [2800, 410, 150, 440], [8500, 1100, 340, 1500], [13000, 1500, 500, 2200]] },
    v: { art: "shade", names: [L("蠹影", "Bookworm Shade"), L("蠹影", "Bookworm Shade"), L("蠹将影", "Shade Captain"), L("蠹王影", "King's Shade"), L("灯下影", "Lamp Shade")],
      stats: [[0, 0, 0, 0], [1100, 125, 55, 150], [3600, 390, 170, 500], [10000, 1000, 400, 1700], [15000, 1400, 600, 2500]] }
  };

  var BOSSES = {
    10: { art: "warden", name: L("墨守", "Ink Warden"), hp: 2000, atk: 120, def: 30, gold: 400,
      say: [L("这一页归我守。", "This page is mine to keep."), L("你连自己的名字都写不完整。", "You cannot even write your own name whole.")] },
    20: { art: "seal", name: L("朱印兽", "Seal Beast"), hp: 5000, atk: 350, def: 100, gold: 1000,
      say: [L("红印落下，纸就不能回头。", "Once the red seal falls, paper cannot turn back."), L("回头吧，小折角。", "Turn back, little crease.")] },
    30: { art: "giant", name: L("折角巨灵", "Crease Giant"), hp: 25000, atk: 900, def: 300, gold: 4000,
      say: [L("每一道折痕，都是我折的。", "Every crease here was folded by me."), L("你也是。", "You too.")] },
    40: { art: "lord", name: L("墨海主", "Ink Sea Lord"), hp: 80000, atk: 2200, def: 700, gold: 12000,
      say: [L("下面没有页，只有沉。", "Below there is no page, only sinking."), L("你带着火柴来做什么？", "What did you bring a match for?")] },
    50: { art: "king", name: L("蠹王", "Bookworm King"), hp: 90000, atk: 6000, def: 1800, gold: 30000,
      say: [L("灯灭了，纸就不必再装作有字。", "With the lamp out, paper need not pretend to have words."), L("你爬到顶，也只是想被读一遍。", "You climbed here only to be read once.")] }
  };

  var ITEMS = {
    h: { kind: "hp", art: "redPotion", names: [L("红墨", "Red Ink")], value: [200, 700, 2000, 5000, 30000] },
    H: { kind: "hp", art: "bluePotion", names: [L("蓝墨", "Blue Ink")], value: [800, 2500, 6000, 15000, 80000] },
    a: { kind: "atk", art: "redGem", names: [L("攻石", "Attack Stone")], value: [3, 6, 15, 30, 60] },
    d: { kind: "def", art: "blueGem", names: [L("守石", "Guard Stone")], value: [3, 6, 15, 30, 60] },
    s: { kind: "atk", art: "sword", names: [L("纸刃", "Paper Blade"), L("铁笔", "Iron Brush"), L("裁纸刀", "Paper Knife"), L("金笔", "Gold Brush"), L("灯笔", "Lamp Brush")],
      value: [10, 25, 60, 150, 300] },
    S: { kind: "def", art: "shield", names: [L("纸甲", "Paper Coat"), L("铜页", "Copper Leaf"), L("叠甲", "Layered Coat"), L("石页", "Stone Leaf"), L("灯甲", "Lamp Coat")],
      value: [10, 25, 60, 150, 300] },
    g: { kind: "gold", art: "gold", names: [L("金屑", "Gold Dust")], value: [15, 50, 150, 400, 1000] },
    "*": { kind: "wick", art: "wick", names: [L("灯芯", "Wick")], value: [1, 1, 1, 1, 1] }
  };

  var KEY_NAMES = {
    y: L("黄钥匙", "Yellow key"), b: L("蓝钥匙", "Blue key"), r: L("红钥匙", "Red key"),
    Y: L("黄门", "Yellow door"), B: L("蓝门", "Blue door"), R: L("红门", "Red door")
  };

  var SHOPS = {
    5: { name: L("墨铺", "Ink Shop"), stock: [
      { id: "atk", amount: 3, times: 6, price: 15 }, { id: "def", amount: 3, times: 6, price: 15 },
      { id: "hp", amount: 500, times: 4, price: 15 }, { id: "y", amount: 1, times: 4, price: 8 },
      { id: "b", amount: 1, times: 2, price: 20 }
    ] },
    15: { name: L("铜墨铺", "Copper Shop"), stock: [
      { id: "atk", amount: 10, times: 6, price: 70 }, { id: "def", amount: 10, times: 6, price: 70 },
      { id: "hp", amount: 1500, times: 4, price: 50 }, { id: "y", amount: 1, times: 4, price: 20 },
      { id: "b", amount: 1, times: 2, price: 60 }, { id: "r", amount: 1, times: 1, price: 120 }
    ] },
    25: { name: L("银墨铺", "Silver Shop"), stock: [
      { id: "atk", amount: 20, times: 6, price: 150 }, { id: "def", amount: 20, times: 6, price: 150 },
      { id: "hp", amount: 4000, times: 4, price: 100 }, { id: "y", amount: 1, times: 4, price: 40 },
      { id: "b", amount: 1, times: 3, price: 100 }, { id: "r", amount: 1, times: 2, price: 250 }
    ] },
    35: { name: L("金墨铺", "Gold Shop"), stock: [
      { id: "atk", amount: 45, times: 6, price: 350 }, { id: "def", amount: 45, times: 6, price: 350 },
      { id: "hp", amount: 12000, times: 4, price: 200 }, { id: "y", amount: 1, times: 4, price: 80 },
      { id: "b", amount: 1, times: 3, price: 200 }, { id: "r", amount: 1, times: 2, price: 450 }
    ] },
    45: { name: L("灯市", "Lamp Market"), stock: [
      { id: "atk", amount: 90, times: 6, price: 900 }, { id: "def", amount: 90, times: 6, price: 900 },
      { id: "hp", amount: 35000, times: 4, price: 500 }, { id: "y", amount: 1, times: 4, price: 160 },
      { id: "b", amount: 1, times: 4, price: 400 }, { id: "r", amount: 1, times: 3, price: 900 }
    ] }
  };

  var NPCS = {
    3: { art: "keeper", name: L("守页人", "Page Keeper"), lines: [
      L("欢迎，折角。塔有五十页，又合上了。", "Welcome, crease. Fifty pages, and the tower has folded again."),
      L("黄门用黄钥匙，蓝门用蓝钥匙，红门用红钥匙。", "Yellow doors take yellow keys. Right key, right door."),
      L("撞一撞可疑的墙。纸塔里到处是折缝。", "Bump the suspicious walls. The tower is full of seams."),
      L("商店不涨价。打不过，就回去买。", "The shops never raise prices. Stuck? Go back and buy.")
    ] },
    13: { art: "folder", name: L("折纸匠", "The Folder"), gift: 6, lines: [
      L("我只折一次。伸出手。", "I fold once only. Hold out your hand."),
      L("要更利的边，还是更韧的面？", "A sharper edge, or a tougher face?")
    ], choice: [L("更利的边　攻 +6", "Sharper: ATK +6"), L("更韧的面　守 +6", "Tougher: DEF +6")] },
    23: { art: "shadeNpc", name: L("蠹影", "Bookworm Shade"), lines: [
      L("你看见那些有裂纹的墙了吗？", "See the walls with the little cracks?"),
      L("按 SELECT，折缝会自己显出来。", "Press SELECT. The seams show themselves."),
      L("五根灯芯：七、十七、二十七、三十七、四十七页。", "Five wicks: pages seven, seventeen, twenty-seven, thirty-seven, forty-seven."),
      L("少几根也能点，只是会烧得凶些。", "It lights with fewer. It just burns wilder.")
    ] },
    33: { art: "ferryman", name: L("渡墨人", "Ink Ferryman"), lines: [
      L("墨海下面没有底，只有沉下去的页。", "Under the Ink Sea there is no bottom, only sunken pages."),
      L("三十五页的墨铺是最后一家，货最好。", "The shop on page thirty-five is the last. Its stock is the best."),
      L("灯在五十页。别把钥匙花在回头路上。", "The lamp is on page fifty. Do not spend keys on the way back.")
    ] },
    43: { art: "echo", name: L("守灯人的回声", "The Keeper's Echo"), lines: [
      L("下面就是灯。蠹王在灯座上。", "The lamp is below. The King sits on its stand."),
      L("它怕你带着五根灯芯。", "It fears five wicks in your hand."),
      L("如果你只带了一根，也别回头。灯还认得你。", "If you carry only one, do not turn back. The lamp knows you.")
    ] }
  };

  /* ---------------- ten original floor plans ----------------
     Only walls, stairs, doors and folds live here. The builder below puts things on
     the floor cells. Every plan starts at '<' and has a reachable '>' (or the lamp). */
  var PLANS = {
    hall: [
      "###########", "#....>....#", "#.........#", "#.........#", "#.........#",
      "#####Y#####", "#.........#", "#.........#", "#.........#", "#.<.......#", "###########"
    ],
    three: [
      "###########", "#....>....#", "#.........#", "###Y###Y###", "#.....#...#",
      "#.....#...#", "#.....#...#", "#####.#####", "#.........#", "#.<.......#", "###########"
    ],
    vault: [
      "###########", "#....>....#", "#.........#", "#.........#", "#.###%###.#",
      "#.#.....#.#", "#.#.....#.#", "#.#.....#.#", "#.#######.#", "#.<.......#", "###########"
    ],
    open: [
      "###########", "#....>....#", "#.........#", "#.........#", "#.#######.#",
      "#.........#", "#.........#", "#.........#", "#.........#", "#.<.......#", "###########"
    ],
    twindoor: [
      "###########", "#....>....#", "#.........#", "#.........#", "###B###R###",
      "#.........#", "#.........#", "#.........#", "#.........#", "#.<.......#", "###########"
    ],
    shop: [
      "###########", "#....>....#", "#.........#", "#.###Y###.#", "#.#.....#.#",
      "#.#.....#.#", "#.#.....#.#", "#.###.###.#", "#.........#", "#.<.......#", "###########"
    ],
    arena: [
      "###########", "#....>....#", "#..##.##..#", "#.........#", "#.#.....#.#",
      "#.........#", "#.#.....#.#", "#.........#", "#..##.##..#", "#.<.......#", "###########"
    ],
    cross: [
      "###########", "#....>....#", "#..#...#..#", "#..#...#..#", "#.........#",
      "#####.#####", "#.........#", "#..#...#..#", "#..#...#..#", "#.<.......#", "###########"
    ],
    ring: [
      "###########", "#....>....#", "#.#######.#", "#.#.....#.#", "#.#.###.#.#",
      "#.#.....#.#", "#.#######.#", "#.........#", "#.........#", "#.<.......#", "###########"
    ],
    gate: [
      "###########", "#....>....#", "#.........#", "#.........#", "#.........#",
      "#####.#####", "#.........#", "#.........#", "#.........#", "#.<.......#", "###########"
    ]
  };

  /* One boss gate per zone; the other nine plans are used once per zone in this order. */
  var ZONE_PLANS = [
    ["hall", "open", "cross", "twindoor", "shop", "arena", "vault", "three", "ring", "gate"],
    ["open", "three", "arena", "twindoor", "shop", "cross", "vault", "hall", "ring", "gate"],
    ["cross", "arena", "open", "three", "shop", "twindoor", "vault", "ring", "hall", "gate"],
    ["ring", "hall", "cross", "arena", "shop", "open", "vault", "twindoor", "three", "gate"],
    ["arena", "cross", "hall", "open", "shop", "three", "vault", "twindoor", "ring", "gate"]
  ];

  var FOUNTAINS = { 2: 1, 8: 1, 12: 1, 18: 1, 22: 1, 28: 1, 32: 1, 38: 1, 42: 1, 48: 1 };
  var WICKS = 5;
  var FOE_POOL = [
    ["i", "p", "t", "w", "k", "o"],
    ["i", "p", "t", "w", "k", "o", "u", "e", "c", "v"],
    ["i", "p", "t", "w", "k", "o", "u", "e", "c", "v"],
    ["i", "p", "t", "w", "k", "o", "u", "e", "c", "v"],
    ["i", "p", "t", "w", "k", "o", "u", "e", "c", "v"]
  ];

  function zoneOf(n) { return Math.min(4, Math.floor((n - 1) / 10)); }
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
    return b ? { ch: n === 50 ? "Z" : "z", art: b.art, name: b.name, hp: b.hp, atk: b.atk, def: b.def, gold: b.gold, boss: true, floor: n, say: b.say } : null;
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

  /* ---------------- building the fifty pages ---------------- */
  function clone(rows) { return rows.map(function (r) { return r.split(""); }); }
  function put(rows, x, y, ch) {
    if (y < 0 || y > 10 || x < 0 || x > 10) return false;
    if (rows[y][x] !== ".") return false;
    rows[y][x] = ch;
    return true;
  }
  function find(rows, ch) {
    for (var y = 0; y < 11; y++) for (var x = 0; x < 11; x++) if (rows[y][x] === ch) return { x: x, y: y };
    return null;
  }
  function walkableForSlots(ch) { return ch === "." || ch === "<" || ch === ">" || ch === "Y" || ch === "B" || ch === "R" || ch === "L"; }
  function slotsOf(rows) {
    var start = find(rows, "<");
    var seen = {}, q = [start], out = [];
    seen[start.x + "," + start.y] = true;
    while (q.length) {
      var c = q.shift();
      if (rows[c.y][c.x] === ".") out.push({ x: c.x, y: c.y });
      var dd = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (var i = 0; i < 4; i++) {
        var nx = c.x + dd[i][0], ny = c.y + dd[i][1], k = nx + "," + ny;
        if (nx < 0 || ny < 0 || nx > 10 || ny > 10 || seen[k]) continue;
        if (!walkableForSlots(rows[ny][nx])) continue;
        seen[k] = true; q.push({ x: nx, y: ny });
      }
    }
    out.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    return out;
  }
  function takeSlot(rows, slots, minY) {
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (rows[s.y][s.x] === "." && (minY == null || s.y >= minY)) return s;
    }
    for (i = 0; i < slots.length; i++) if (rows[slots[i].y][slots[i].x] === ".") return slots[i];
    return null;
  }
  function pick(rows, prefs, slots) {
    for (var i = 0; i < prefs.length; i++) {
      var p = prefs[i];
      if (rows[p[1]][p[0]] === ".") return p;
    }
    var s = takeSlot(rows, slots, null);
    return s ? [s.x, s.y] : null;
  }
  function gearFor(n) {
    var idx = (n - 1) % 10, zone = zoneOf(n);
    if (idx === 3) return "s";
    if (idx === 4) return zone % 2 ? "S" : "s";
    if (idx === 5) return "S";
    if (idx === 6) return zone % 2 ? "s" : "S";
    if (idx === 8) return "S";
    return null;
  }
  function buildFloor(n) {
    var zone = zoneOf(n), idx = (n - 1) % 10, plan = ZONE_PLANS[zone][idx];
    var rows = clone(PLANS[plan]), gear = gearFor(n), special = {};
    if (n === 50) rows[1] = "#....L....#".split("");
    var slots = slotsOf(rows);

    if (n === 50 || (n % 10 === 0 && n < 50)) {
      /* boss gate: the keeper blocks the only corridor */
      if (n === 50) put(rows, 5, 5, "Z"); else put(rows, 5, 5, "z");
      put(rows, 3, 2, "h"); put(rows, 7, 2, "H"); put(rows, 3, 4, "a"); put(rows, 7, 4, "d");
      put(rows, 7, 3, zone % 2 ? "s" : "S");
      put(rows, 3, 8, "h"); put(rows, 7, 8, "g");
      return { n: n, plan: plan, map: rows.map(function (r) { return r.join(""); }) };
    }

    if (SHOPS[n]) {
      put(rows, 4, 5, "m");
      if (gear) put(rows, 6, 5, gear);
      special.shop = true;
    }
    if (NPCS[n]) {
      var np = pick(rows, [[8, 2], [2, 2], [8, 8], [2, 8], [5, 2], [5, 8]], slots);
      if (np) put(rows, np[0], np[1], "n");
      special.npc = true;
    }
    if (FOUNTAINS[n]) {
      var fp = pick(rows, [[8, 2], [2, 2], [8, 8], [2, 8], [5, 2], [5, 8]], slots);
      if (fp) put(rows, fp[0], fp[1], "f");
      special.fountain = true;
    }
    if ((n - 1) % 10 === 6) {
      /* a fold room: wick and a little more inside */
      put(rows, 5, 6, "*");
      if (gear) put(rows, 3, 6, gear);
      put(rows, 7, 6, n % 2 ? "d" : "a");
      special.wick = true;
    }

    var keys = plan === "three" ? ["y", "y"] : plan === "hall" || plan === "shop" ? ["y"] : plan === "twindoor" ? ["b", "r"] : [];
    for (var ki = 0; ki < keys.length; ki++) {
      var ks = takeSlot(rows, slots, 8) || takeSlot(rows, slots, 7) || takeSlot(rows, slots, null);
      if (ks) put(rows, ks.x, ks.y, keys[ki]);
    }

    var items = [n % 2 ? "a" : "d", n % 2 ? "h" : "H"];
    if (n % 4 === 0) items.push(n % 2 ? "d" : "a");
    if (n % 3 === 0) items.push("g");
    if (special.wick) items.push("g");
    if (special.shop) items.push("g");
    if (gear && !special.wick && !special.shop) items.push(gear);
    for (var ii = 0; ii < items.length; ii++) {
      var is = takeSlot(rows, slots, null);
      if (is) put(rows, is.x, is.y, items[ii]);
    }

    var pool = FOE_POOL[zone], count = n === 1 ? 1 : n <= 3 ? 3 : special.wick || special.shop ? 3 : n % 3 === 0 ? 5 : 4;
    var rev = slots.slice().reverse();
    for (var fi = 0; fi < count; fi++) {
      var fs = takeSlot(rows, rev, null);
      if (fs) put(rows, fs.x, fs.y, pool[(n + fi * 3) % pool.length]);
    }
    return { n: n, plan: plan, map: rows.map(function (r) { return r.join(""); }) };
  }

  var FLOORS = [];
  for (var fn = 1; fn <= 50; fn++) FLOORS.push(buildFloor(fn));

  return {
    ZONES: ZONES, FLOOR_NAMES: FLOOR_NAMES, MONSTERS: MONSTERS, BOSSES: BOSSES, ITEMS: ITEMS,
    KEY_NAMES: KEY_NAMES, SHOPS: SHOPS, NPCS: NPCS, FLOORS: FLOORS, WICKS: WICKS,
    zoneOf: zoneOf, floor: floor, at: at, monsterKind: monsterKind, monsterAt: monsterAt,
    bossAt: bossAt, itemAt: itemAt, isMonster: isMonster, isDoor: isDoor, doorKey: doorKey,
    isItem: isItem, isBlocking: isBlocking, isStair: isStair
  };
})();
