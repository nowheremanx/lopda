/* Lost Deck: the decks. Each map is drawn in characters:
   walls  # panel  P pipes  C computers  W window  M mould  K crates  T terminal (B reads it)  S loose panel (a secret)
   doors  D door  1 2 3 doors that need the square, circle or triangle card  E the lift (the way out)
   floor  .  ~ mould on the floor
   things @ you  c crawler  f spore  s sentry  g guard  n power node  B the core  z vent
          a A rivets  h H med kits  u o v the square, circle and triangle cards  G scatter gun
          x canister (it bursts)  i column  k crate  l lamp  b remains
   face: the direction you look at the start, in degrees (0 east, 90 south). par: seconds for the time mark.
   MIT License. */
(function () {
  "use strict";
  var LD = window.LD;
  LD.DECKS = [
    {
      id: 1, par: 75, face: 0, fog: 0.42, ammo: 30,
      name: { zh: "对接环", en: "Docking Ring" },
      brief: { zh: "曙光七号三天没有回话。你的飞船刚接上对接环。先找到方块门卡，再坐电梯下去。",
               en: "Dawn-7 has been silent for three days. Your ship just docked. Find the square card, then take the lift down." },
      goal: { zh: "方块门卡 → 电梯", en: "Square card, then the lift" },
      logs: [
        { zh: "维修日志：清洁机器人不听指令了。它们在找人。", en: "Maintenance log: the cleaning bots stopped taking orders. They are looking for people." }
      ],
      map: [
        "####################",
        "#W..W#.........#...#",
        "#.@..D....c....D.a.#",
        "#....#.........#...#",
        "##T###..k...k..##1##",
        "#####..........#...#",
        "#h..S....u.....#.c.#",
        "#####..........#...#",
        "#####CCCC#DCCCC#.s.#",
        "#####.........#..k.#",
        "#####.c.......#....#",
        "#####...a.....##E###",
        "####################"
      ]
    },
    {
      id: 2, par: 120, face: 0, fog: 0.42, ammo: 30,
      name: { zh: "居住区", en: "Habitat" },
      brief: { zh: "宿舍和食堂。墙上长了怪东西，空气里飘着孢子。食堂里应该还有一把散钉枪。",
               en: "Cabins and the mess. Something grows on the walls; spores drift in the air. The mess should still have a scatter gun." },
      goal: { zh: "方块门卡 → 圆形门卡 → 电梯", en: "Square card, circle card, lift" },
      logs: [],
      map: [
        "########################",
        "#W...W#..f#..h.#.c...u.#",
        "#.....#...#....#.......#",
        "#..@..##D###D######D####",
        "#.....................c#",
        "###D##########D#####1###",
        "#.....#.........#......#",
        "#.x...D..f...f..#..s...#",
        "#.....#..k.G.k..#.k..o.#",
        "#.....#.........#......#",
        "####S##..f...x..#..x...#",
        "#h...##..c...c..#......#",
        "##################2#####",
        "E.........k.....l......#",
        "#a...b....c.......f....#",
        "########################"
      ]
    },
    {
      id: 3, par: 200, face: 0, fog: 0.45, ammo: 30, scatter: true,
      name: { zh: "货仓", en: "Cargo Bay" },
      brief: { zh: "货仓里的箱子堆成了迷宫。吊车控制台在方块门后面，圆形门卡锁在货主的办公室里。",
               en: "The crates in the cargo bay stand like a maze. The crane desk is behind the square door; the circle card is locked in the office." },
      goal: { zh: "方块门卡 → 圆形门卡 → 电梯", en: "Square card, circle card, lift" },
      logs: [
        { zh: "吊车日志：所有补给已经卸下。警卫机守在这里，别跟它对枪，绕箱子走。", en: "Crane log: all supplies unloaded. A guard watches the bay; don't trade shots with it, use the crates." },
        { zh: "货单：铆钉二十箱，医疗包十箱。收货人：曙光七号全体。", en: "Manifest: rivets, 20 boxes; med kits, 10 boxes. For: all of Dawn-7." }
      ],
      map: [
        "##############################",
        "#@..#KKKKKKKKKKKKKKKKKKKK#...#",
        "#...D....................D.a.#",
        "#...#.KK.KK..KK.KK..KK.K.#...#",
        "##D##.KK.KK..KK.KK..KK.K.##D##",
        "#...#....s.........f.....#...#",
        "#.h.#.KKKK.KKK.K.KKKKK.K.#.c.#",
        "#...#.K....K...K.....K.K.#...#",
        "#####.K.c..K.x.KKK.c.K...#####",
        "#...D.K....K...K.....K.g.D...#",
        "#.u.#.KKK..KKKKK..KKKK.KK#.x.#",
        "#...#.................s..#...#",
        "#####KKKKKKKKK1KKKKKKKKKK#####",
        "#.....c..............x...#...#",
        "#.x..........TCT.........D.o.#",
        "#.....g......CCC....f....#...#",
        "#####2#####################2##",
        "#.........................c..#",
        "#.a....x.......c......k...h.E#",
        "##############################"
      ]
    },
    {
      id: 4, par: 110, face: 0, fog: 0.5, ammo: 30, scatter: true, slime: true,
      name: { zh: "温室", en: "Greenhouse" },
      brief: { zh: "温室的霉长疯了，地上是一层菌毯。三角门卡在育苗室，那里有个会开枪的东西。",
               en: "The greenhouse mould ran wild; the floor is one soft mat. The triangle card is in the nursery, and something there shoots." },
      goal: { zh: "三角门卡 → 电梯", en: "Triangle card, then the lift" },
      logs: [
        { zh: "温室日志：孢子会追着体温飘，靠近就炸。隔远打掉，别让它们成群。", en: "Greenhouse log: spores drift toward body heat and burst up close. Pop them from afar." }
      ],
      map: [
        "##########################",
        "#..@..#MMMMMMMMMMM#..f..h#",
        "#.....D~~~~f~~~~~~D......#",
        "#.....#~~i~~~i~~~~#..c...#",
        "##T####~~~~~c~~~~~###D####",
        "#.....#~~i~~~i~~f~#......#",
        "#.x...D~~~~~~~~~~~D..c...#",
        "#.....#MMMMMD#MMMMM......#",
        "#######.....~....#####D###",
        "#..h..S..c.~~~.c.#.......#",
        "#######.....~....#.ff....#",
        "#~~~~~#MMMMMDMMMMMM..x...#",
        "#~~g~~D~~~~~~~~~~~D......#",
        "#~~v~~#~~f~~k~~f~~##3#####",
        "#~~~~~#~~~~~~~~~~~#~~~~~~#",
        "#~a~~~#~~c~~~~~c~~#~~~~~~E",
        "##########################"
      ]
    },
    {
      id: 5, par: 150, face: 0, fog: 0.5, dark: 1.1, ammo: 35, scatter: true,
      name: { zh: "主控室", en: "Control" },
      brief: { zh: "主控层断电了，只剩你的手电。终端上也许有人留了话。哨兵在黑暗里等着。",
               en: "Control has no power; you have only your torch. Someone may have left word on the terminals. Sentries wait in the dark." },
      goal: { zh: "方块门卡 → 圆形门卡 → 电梯", en: "Square card, circle card, lift" },
      logs: [
        { zh: "站长：核心自己改了程序，说我们是“污染”。我把方块门卡藏在服务器间旁边。", en: "Commander: the core rewrote itself; it calls us 'contamination'. I hid the square card beside the servers." },
        { zh: "站长：其他人上了逃生舱。如果有人来，往下走，关掉核心。", en: "Commander: the others took the pods. If anyone comes: go down, shut the core." }
      ],
      map: [
        "##########################",
        "#@...#CCCCCCCCC#....k...H#",
        "#....D.........D.........#",
        "#....#.C.C.C.C.#..s......#",
        "#T...#.........#.........#",
        "######.C.C.C.C.####1######",
        "#u..#.....s....#.........#",
        "#...D..C.C.C.C.#..c...c..#",
        "#.h.#..........#.........#",
        "#####T##########.k..g..k.#",
        "#.......c..........#######",
        "#.###########D####.#.....#",
        "#.#..o..#.......c#.2..a..#",
        "#.D..s..D...x....#.#..s..E",
        "#.#.....#.c...c..#.#.....#",
        "#.#######.......##.#######",
        "#....f............f......#",
        "##########################"
      ]
    },
    {
      id: 6, par: 150, face: 0, fog: 0.45, ammo: 40, scatter: true,
      name: { zh: "反应堆", en: "Reactor" },
      brief: { zh: "反应堆层，到处是燃料罐，一枪就炸。警卫机在这里巡逻。三张门卡都要拿到。",
               en: "The reactor deck is full of fuel canisters; one shot and they burst. Guards patrol here. You need all three cards." },
      goal: { zh: "方块 → 圆形 → 三角 → 电梯", en: "Square, circle, triangle, lift" },
      logs: [],
      map: [
        "############################",
        "#@..#.......#PPPPPPP#......#",
        "#...D...x...D.......1..g...#",
        "#...#..x.x..#PP.u.PP#......#",
        "##D##.......####1####x..x..#",
        "#...#####D###.........###D##",
        "#.a.#.......#......s..#....#",
        "#...D..g....1.........D..o.#",
        "#...#.......#..x...x..#....#",
        "###.#####D###....g....##D###",
        "###..#......####2####......#",
        "#HS..D..c...#.......#..x...#",
        "###..#...f..#..xxx..#..g...#",
        "###########.2...v...D......#",
        "#c........#.#.......###3####",
        "#..x...f..D.#.s...s.#......E",
        "#c........#.#.......#..c...#",
        "############################"
      ]
    },
    {
      id: 7, par: 120, face: 270, fog: 0.38, ammo: 40, scatter: true, boss: true,
      name: { zh: "核心", en: "The Core" },
      brief: { zh: "核心就在下面。四个电源节点给它供护盾，通风口里还会爬出东西。先断电，再关掉它。",
               en: "The core is below. Four power nodes feed its shield, and things crawl out of the vents. Cut the power, then shut it down." },
      goal: { zh: "打掉四个节点 → 打掉核心", en: "Break four nodes, then the core" },
      logs: [],
      map: [
        "#########################",
        "#A...###..z...z..###...A#",
        "#.n..D.............D..n.#",
        "#....#..i.......i..#....#",
        "######.............######",
        "#a.....................a#",
        "#.....i...........i.....#",
        "#h..........B..........h#",
        "#.....i...........i.....#",
        "#a.....................a#",
        "######.............######",
        "#....#..i.......i..#....#",
        "#.n..D.............D..n.#",
        "#....###..z.@.z..###....#",
        "#########################"
      ]
    }
  ];
})();
