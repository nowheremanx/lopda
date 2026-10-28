/* 华容道 / Klotski: the level table and the master-class lessons.
   Rows are the board: a repeated letter is one rectangular piece, "." / "@" is empty, "#" is a wall.
   The exit is the 2x2 block at the bottom centre. Every par below is the optimal number of one-cell moves,
   re-solved by tests/klotski.test.mjs. Difficulty: 1 入门 / 2 简单 / 3 进阶 / 4 困难 / 5 大师.

   The classic layouts are public puzzle arrangements collected in the Huarong Dao literature. The easy
   ten-piece arrangements are in the same family. No level is locked; the record is the reward. */
var KLOTSKI_DATA = {
  levels: [
    /* ---- 1 star: first steps ---- */
    { id: "k01", diff: 1, par: 8, name: { zh: "初入华容", en: "First Pass" },
      rows: ["BBCC", "DD@@", "EEFF", "NOAA", "PQAA"] },
    { id: "k02", diff: 1, par: 10, name: { zh: "一步之遥", en: "One Step" },
      rows: ["BBCC", "DDEE", "@NO@", "HIAA", "HIAA"] },
    { id: "k03", diff: 1, par: 10, name: { zh: "开门", en: "Gate" },
      rows: ["HNO@", "HPQ@", "BBCC", "IJAA", "IJAA"] },
    { id: "k04", diff: 1, par: 11, name: { zh: "转角", en: "Corner" },
      rows: ["HI@J", "HI@J", "KLAA", "KLAA", "NOPQ"] },
    { id: "k05", diff: 1, par: 13, name: { zh: "窄门", en: "Narrow" },
      rows: ["NBBO", "HAAI", "HAAI", "JPQK", "J@@K"] },
    { id: "k06", diff: 1, par: 19, name: { zh: "小径", en: "Path" },
      rows: ["BBCC", "HNAA", "HOAA", "IPQR", "I@@S"] },

    /* ---- 2 stars: two holes and a corridor ---- */
    { id: "k07", diff: 2, par: 24, name: { zh: "左右", en: "Sides" },
      rows: ["NAAO", "HAAI", "H@@I", "JPQK", "JRSK"] },
    { id: "k08", diff: 2, par: 24, name: { zh: "似远实近", en: "Far Near" },
      rows: ["AABB", "AACC", "@@NO", "HIPJ", "HIQJ"] },
    { id: "k09", diff: 2, par: 26, name: { zh: "单兵", en: "Lone" },
      rows: ["HINO", "HIJK", "AAJK", "AALP", "@QL@"] },
    { id: "k10", diff: 2, par: 29, name: { zh: "小路", en: "Trail" },
      rows: ["NOPQ", "RAAS", "TAAU", "VWXY", "@BB@"] },
    { id: "k11", diff: 2, par: 31, name: { zh: "前呼后拥", en: "Front" },
      rows: ["NOAA", "BBAA", "CCDD", "EEFF", "@@PQ"] },
    { id: "k12", diff: 2, par: 33, name: { zh: "双桥", en: "Twin" },
      rows: ["NAA@", "OAA@", "BBCC", "DDEE", "FFPQ"] },

    /* ---- 3 stars: the real thing ---- */
    { id: "k13", diff: 3, par: 33, name: { zh: "伏羲", en: "Fuxi" },
      rows: ["HAA@", "HAA@", "NOPQ", "RSTU", "VWXY"] },
    { id: "k14", diff: 3, par: 38, name: { zh: "双将", en: "Guards" },
      rows: ["@H@I", "NHJI", "OPJK", "AAQK", "AABB"] },
    { id: "k15", diff: 3, par: 39, name: { zh: "比翼横空", en: "Wings" },
      rows: ["BBAA", "CCAA", "DDEE", "N@OH", "P@QH"] },
    { id: "k16", diff: 3, par: 43, name: { zh: "四将", en: "Four" },
      rows: ["NHIO", "PHIJ", "AAKJ", "AAKQ", "@@BB"] },
    { id: "k17", diff: 3, par: 45, name: { zh: "一横易解", en: "One Bar" },
      rows: ["NAAO", "HAAI", "HPQI", "JBBK", "J@@K"] },
    { id: "k18", diff: 3, par: 46, name: { zh: "勇闯五关", en: "Five" },
      rows: ["NAAO", "PAAQ", "BBCC", "DDEE", "@FF@"] },

    /* ---- 4 stars: long corridors ---- */
    { id: "k19", diff: 4, par: 60, name: { zh: "雨声", en: "Rain" },
      rows: ["HAAN", "HAAO", "IBBJ", "IK@J", "PK@Q"] },
    { id: "k20", diff: 4, par: 60, name: { zh: "双门", en: "Double" },
      rows: ["NOPQ", "AAHI", "AAHI", "BBJK", "@@JK"] },
    { id: "k21", diff: 4, par: 68, name: { zh: "四面八方", en: "Ways" },
      rows: ["@BB@", "NCCO", "HAAI", "HAAI", "PDDQ"] },
    { id: "k22", diff: 4, par: 73, name: { zh: "四面楚歌", en: "Siege" },
      rows: ["HNOI", "HAAI", "PAAJ", "KBBJ", "K@@Q"] },
    { id: "k23", diff: 4, par: 77, name: { zh: "插翅难飞", en: "Flight" },
      rows: ["HAAN", "HAAO", "BBPQ", "ICCJ", "I@@J"] },
    { id: "k24", diff: 4, par: 85, name: { zh: "齐头并进", en: "Head On" },
      rows: ["HAAI", "HAAI", "NOPQ", "JBBK", "J@@K"] },

    /* ---- 5 stars: the masters ---- */
    { id: "k25", diff: 5, par: 92, name: { zh: "兵分三路", en: "Three" },
      rows: ["NAAO", "HAAI", "HBBI", "JPQK", "J@@K"] },
    { id: "k26", diff: 5, par: 100, name: { zh: "指挥若定", en: "Command" },
      rows: ["HAAI", "HAAI", "NBBO", "JPQK", "J@@K"] },
    { id: "k27", diff: 5, par: 116, name: { zh: "横刀立马", en: "Hengdao" },
      rows: ["HAAI", "HAAI", "JBBK", "JNOK", "P@@Q"] },
    { id: "k28", diff: 5, par: 138, name: { zh: "层层设防", en: "Layers" },
      rows: ["HAAI", "HAAI", "NBBO", "PCCQ", "@DD@"] },
    { id: "k29", diff: 5, par: 158, name: { zh: "层层设防2", en: "Layers II" },
      rows: ["NAAO", "HAAI", "HBBI", "PCCQ", "@DD@"] },
    { id: "k30", diff: 5, par: 179, name: { zh: "峰回路转", en: "Long Road" },
      rows: ["NOPH", "AAIH", "AAIJ", "@BBJ", "@QCC"] }
  ],

  lessons: [
    {
      id: "m01", diff: 1, par: 2,
      title: { zh: "一步一格", en: "One Cell" },
      idea: { zh: "移动与计步", en: "Moving and counting" },
      rows: ["....", ".CC.", ".CC.", ".A..", "...."],
      goal: { piece: "A", x: 3, y: 3 },
      intro: [
        { zh: "这是一块 4×5 的华容道。木牌只能横着或竖着滑进空格，不能拿起来。", en: "This is a 4x5 Klotski board. Pieces only slide into empty cells; nothing can be lifted." },
        { zh: "点一块选中，再拖动它。方向键也能移动选中的块。每移动一格算一步。", en: "Tap a piece to select it, then drag. The arrow keys move the selected piece too. One cell is one step." },
        { zh: "先把小兵 A 移到虚线圈里。不要想太远，看清眼前这一步。", en: "Move soldier A into the dashed target. Do not plan too far ahead yet; see this one step clearly." }
      ],
      tip: { zh: "把小兵 A 拖到虚线格。", en: "Drag soldier A to the dashed cell." }
    },
    {
      id: "m02", diff: 1, par: 3,
      title: { zh: "并排空位", en: "Two Holes" },
      idea: { zh: "横将需要两格", en: "A bar needs two cells" },
      rows: [".CC.", ".CC.", ".GG.", ".AB.", "...."],
      goal: { piece: "G", x: 1, y: 3 },
      intro: [
        { zh: "1×2 的横将要往下走，身子底下必须有两格并排的空位；只有一格是下不去的。", en: "A 1x2 bar can only move down when both cells under it are empty. One cell is not enough." },
        { zh: "现在横将下面被两个兵挡住。先把左边的兵挪开，再把右边的兵挪开。", en: "Two soldiers block the bar. Move the left one away, then the right one." },
        { zh: "两个空位连在一起，横将就能落下去。", en: "Make the two empty cells meet, and the bar can drop." }
      ],
      tip: { zh: "把横将 G 移到虚线圈里。", en: "Move the bar G into the dashed target." }
    },
    {
      id: "m03", diff: 1, par: 3,
      title: { zh: "竖将平移", en: "Tall" },
      idea: { zh: "竖将平移也要两格", en: "Two cells to slide" },
      rows: [".CC.", ".CC.", ".AGT", "B.GU", "...."],
      goal: { piece: "G", x: 3, y: 2 },
      intro: [
        { zh: "1×2 的竖将往左右平移，需要两格同时空出来；往上下走，只需要一格。", en: "A 1x2 vertical piece needs two empty cells to step sideways, but only one to move up or down." },
        { zh: "把它右边的两个兵一上一下调开：上面的兵向上，下面的兵向下。", en: "Move the two soldiers on its right apart: the top one up, the bottom one down." },
        { zh: "两格空出，竖将就能平移到虚线处。", en: "With both cells free, the tall general can slide across." }
      ],
      tip: { zh: "把竖将 G 移到虚线圈里。", en: "Move the tall G into the dashed target." }
    },
    {
      id: "m04", diff: 1, par: 6,
      title: { zh: "曹操的门", en: "Cao's Door" },
      idea: { zh: "2×2 的空地", en: "A 2x2 clearing" },
      rows: [".CC.", ".CC.", ".AB.", ".DE.", "...."],
      goal: { piece: "C", x: 1, y: 2 },
      intro: [
        { zh: "2×2 的曹操要往下走，脚下必须是一整块 2×2 的空地。四个角缺一个都不行。", en: "The 2x2 Cao Cao needs a full 2x2 clearing before it can move down. Three cells is not enough." },
        { zh: "四个兵把门口占满了。把他们分别送到左右两边，不要把中间堵住。", en: "Four soldiers fill the doorway. Send them to the left and right edges; keep the middle clear." },
        { zh: "门铺好了，曹操才能下楼。", en: "Prepare the door, and Cao can step down." }
      ],
      tip: { zh: "把曹操往下移一格。", en: "Move Cao down one row." }
    },
    {
      id: "m05", diff: 2, par: 5,
      title: { zh: "绕空格转", en: "Ring" },
      idea: { zh: "轮换与循环", en: "Rotation and cycles" },
      rows: ["ABC", "D.E", "FGH"],
      goal: { piece: "A", x: 1, y: 1 },
      intro: [
        { zh: "只有一个空格时，木牌不能随便走，只能绕着空格转。转一圈，所有块都换一个位置。", en: "With only one empty cell, pieces cannot roam. They turn around the hole; one full turn moves every piece." },
        { zh: "把兵 A 转到中间。先想清楚是顺时针还是逆时针。", en: "Bring soldier A to the middle. Decide first whether the ring turns clockwise or the other way." },
        { zh: "很多华容道定式，都是这种绕圈换位的重复。", en: "Many Huarong Dao patterns are this same rotation, repeated." }
      ],
      tip: { zh: "把 A 转到中央的空格。", en: "Turn A into the centre." }
    },
    {
      id: "m06", diff: 2, par: 8,
      title: { zh: "让开中路", en: "Middle" },
      idea: { zh: "先让路，再送曹操", en: "Clear, then move" },
      rows: [".CC.", ".CC.", ".GG.", "A..B", "...."],
      goal: { exit: true },
      intro: [
        { zh: "曹操的正下方就是出口方向。横将挡在二楼，曹操一步也下不去。", en: "The exit is directly below Cao. A bar on the second floor stops every step." },
        { zh: "把横将让到旁边或下面，再把曹操送到出口。", en: "Move the bar aside or down, then walk Cao to the exit." },
        { zh: "每次移动前先问：这一步让中路更通，还是更堵？", en: "Before each move ask: does this open the middle, or close it?" }
      ],
      tip: { zh: "让曹操从下面的出口离开。", en: "Take Cao out through the bottom exit." }
    },
    {
      id: "m07", diff: 2, par: 4,
      title: { zh: "横刀下楼", en: "Hengdao 1" },
      idea: { zh: "经典布局的第一步", en: "The classic opening" },
      rows: ["HAAI", "HAAI", "JBBK", "JNOK", "P@@Q"],
      goal: { piece: "A", x: 1, y: 1 },
      intro: [
        { zh: "这是最著名的布局：横刀立马。四员竖将守两边，关羽横在曹操楼下，四个兵守住底边。", en: "This is the famous Hengdao layout: four tall generals on the flanks, a bar under Cao, four soldiers on the bottom." },
        { zh: "先只做一件事：让曹操向下走一格。看清楚是哪两个兵要先让开。", en: "Do one thing only: move Cao down one row. Find the two soldiers that must step aside first." },
        { zh: "完整的一局在关卡列表里，最少 116 格。这一课只拆开第一步。", en: "The full puzzle is in the level list, 116 cells at best. This lesson only opens the first step." }
      ],
      tip: { zh: "只把曹操向下挪一格。", en: "Move Cao down exactly one row." }
    },
    {
      id: "m08", diff: 3, par: 17,
      title: { zh: "横刀让位", en: "Hengdao 2" },
      idea: { zh: "先给关羽让位", en: "Room for the bar" },
      rows: ["HAAI", "HAAI", "JBBK", "JNOK", "P@@Q"],
      goal: { piece: "B", x: 0, y: 3 },
      intro: [
        { zh: "中路一时打不开，就先动关羽。要把它送到左下角，需要先给两边的兵让位。", en: "When the middle will not open, move the bar first. To send it to the lower-left corner, the soldiers on its path must move first." },
        { zh: "不要急着推曹操。先看关羽的落点，再决定哪个兵先走。", en: "Do not rush Cao. Look at the bar's destination, then choose which soldier moves first." },
        { zh: "完成后，去挑战完整的横刀立马。", en: "When this is done, try the full Hengdao." }
      ],
      tip: { zh: "把横将 B 移到左下角的虚线圈。", en: "Move bar B to the dashed target at lower left." }
    }
  ],

  notes: [
    {
      title: { zh: "空位成双", en: "Two Holes" },
      lines: [
        { zh: "每一次移动都从一个空格开始。1×1 只要一格；1×2 要两格并排；2×2 要一整块 2×2 的空地。", en: "Every move starts from an empty cell. A 1x1 needs one; a 1x2 needs two in a row; a 2x2 needs a whole 2x2 clearing." },
        { zh: "先数空位，再看块。两个空格分开时，先想办法把它们并到一起。", en: "Count the holes before the pieces. If the two holes are apart, bring them together first." },
        { zh: "空格的位置比空格的数量更重要。", en: "Where the holes are matters more than how many there are." }
      ]
    },
    {
      title: { zh: "曹操的门", en: "Cao's Door" },
      lines: [
        { zh: "曹操是 2×2。它每下一层，脚下都要有一整块 2×2 的空地。", en: "Cao is 2x2. Every row it descends needs a full 2x2 clearing underneath." },
        { zh: "先把门铺好，再动曹操。顺序反了，只会把它顶回去。", en: "Prepare the door before moving Cao. The other order only pushes it back." },
        { zh: "门的两列就是出口的两列，尽量不要在那里停放大块。", en: "The door is the exit's two columns. Do not park big pieces there." }
      ]
    },
    {
      title: { zh: "绕圈换位", en: "Turn the Ring" },
      lines: [
        { zh: "空间很窄时，块只能绕着空格转。一个 2×2 的空洞，能让四块小牌循环换位。", en: "In tight space, pieces turn around a hole. A 2x2 hole lets four small pieces cycle." },
        { zh: "先决定转几圈、往哪边转，再动手。转到一半改主意，常常要重来。", en: "Decide how far and which way before you start. Changing your mind halfway usually costs the work." },
        { zh: "横刀立马和峰回路转里，都有大段这样的轮换。", en: "Hengdao and Long Road both contain long passages of this rotation." }
      ]
    },
    {
      title: { zh: "小兵开路", en: "Soldiers Open" },
      lines: [
        { zh: "兵只有 1×1，最灵活。它们最适合去填角、让路、把两个空格并起来。", en: "A soldier is 1x1 and the most mobile. Use it to fill a corner, step aside, or join two holes." },
        { zh: "但兵也会变成墙。把它塞进死角，可能再也换不出来。", en: "But a soldier can become a wall. Push it into a dead corner and it may never come back." },
        { zh: "先问：这个兵现在有用，还是等会儿更有用？", en: "Ask: is this soldier more useful now, or later?" }
      ]
    },
    {
      title: { zh: "边角停车", en: "Park at the Edges" },
      lines: [
        { zh: "中间的路要留给曹操。大块尽量停在左右两边或角落。", en: "Keep the middle for Cao. Park big pieces on the flanks or in corners." },
        { zh: "边上的块虽然暂时不动，却把中路让了出来。", en: "A piece at the edge is not doing nothing; it is keeping the middle open." },
        { zh: "如果一块大牌在中间反复挪，先想想能不能把它送到边上。", en: "If a big piece keeps shuffling in the middle, see whether it can be sent to an edge." }
      ]
    },
    {
      title: { zh: "逆向思维", en: "Think Backwards" },
      lines: [
        { zh: "想往右，有时要先往左；想让曹操下楼，有时要先把它抬上去一格。", en: "To go right, sometimes move left first. To bring Cao down, sometimes lift it one row." },
        { zh: "空间不够时，先退一步，换来更大的回旋余地。", en: "When space is tight, step back to gain room to turn." },
        { zh: "在提示里看一步，不如问自己：为什么现在走不了？", en: "A hint shows one move. Better: ask why the move you want is impossible now." }
      ]
    },
    {
      title: { zh: "别堵门口", en: "Keep the Door" },
      lines: [
        { zh: "曹操下方的两列是生命线。横将、竖将都不要在那里久留。", en: "The two columns under Cao are the lifeline. Do not let bars or tall generals linger there." },
        { zh: "经过可以，停留不行。每次让块穿过门口，都要想好下一步把它送走。", en: "Passing through is fine; parking is not. Whenever a piece crosses the door, plan its way out." },
        { zh: "很多死局不是走错一步，而是把门口堵死了。", en: "Many dead ends are not one wrong move, but a door sealed shut." }
      ]
    },
    {
      title: { zh: "数步与棋谱", en: "Counting Moves" },
      lines: [
        { zh: "本作每移动一格算一步。方向键一次一格；拖动可以连续走几格，每一格都计数。", en: "Here every cell is one step. An arrow key moves one cell; a drag may move several, and each cell counts." },
        { zh: "传统棋谱常把一次长滑算一步。所以横刀立马在书上是 81 步，在本作里是 116 步。", en: "Traditional scores count one long slide as one move. So Hengdao is 81 in books, and 116 here." },
        { zh: "步数不必和别人比，和昨天的自己比就好。", en: "You do not have to beat anyone's count; beat yesterday's." }
      ]
    },
    {
      title: { zh: "看整块", en: "See Blocks" },
      lines: [
        { zh: "不要一格一格看棋盘。把 2×2、1×2、1×1 当成三种棋子，空地当成第四种。", en: "Do not read the board cell by cell. See three pieces — 2x2, 1x2, 1x1 — and the hole as the fourth." },
        { zh: "一次移动改变的是整块和空洞的关系。", en: "One move changes the relation between a block and the hole." },
        { zh: "能一眼看出“这块进不去”，就少走很多冤枉路。", en: "Seeing at a glance that a block cannot fit saves many wasted steps." }
      ]
    },
    {
      title: { zh: "下一步", en: "What Next" },
      lines: [
        { zh: "八课学完，去关卡列表从一星开始。每一关都可以随时打开，没有锁。", en: "After the eight lessons, start the level list at one star. Every level is open; nothing is locked." },
        { zh: "卡住时按 A 看一步提示，或从菜单看演示。演示不会改变你的步数。", en: "Stuck? Press A for one hint, or watch the demo from the menu. The demo does not change your step count." },
        { zh: "目标不是 81 步，是看懂这盘棋。", en: "The goal is not 81 moves; it is seeing the board." }
      ]
    }
  ],

  help: [
    {
      title: { zh: "目标", en: "Goal" },
      lines: [
        { zh: "把 2×2 的曹操移到棋盘底部的出口。出口在底部正中，两格宽。", en: "Move the 2x2 Cao Cao to the exit at the bottom centre, two cells wide." },
        { zh: "木牌只能横着或竖着滑进空格，不能拿起来，也不能斜着走。", en: "Pieces only slide horizontally or vertically into empty cells. Nothing can be lifted or moved diagonally." },
        { zh: "每移动一格算一步。所有关卡都已开放，想玩哪关就玩哪关。", en: "One cell is one step. Every level is open; play any of them." }
      ]
    },
    {
      title: { zh: "操作", en: "Controls" },
      lines: [
        { zh: "点一块选中，拖动它。点相邻的空格，也能把选中的块推过去。", en: "Tap a piece to select, then drag it. Tap an adjacent empty cell to push the selected piece there." },
        { zh: "方向键移动选中的块；SELECT 换一块；A 提示；B 撤销；START 菜单。", en: "Arrows move the selected piece; SELECT picks another; A hints; B undoes; START opens the menu." },
        { zh: "在选关列表里，上下选择，A 打开，SELECT 筛选难度。", en: "In the level list, up/down selects, A opens, SELECT filters by difficulty." }
      ]
    },
    {
      title: { zh: "记录", en: "Records" },
      lines: [
        { zh: "通过的关卡会打勾，并记下你最少用了多少步。", en: "A cleared level gets a tick and keeps your fewest steps." },
        { zh: "每关都标了难度：1 星入门，2 星简单，3 星进阶，4 星困难，5 星大师。", en: "Each level shows its difficulty: 1 star easy, 2 simple, 3 advanced, 4 hard, 5 master." },
        { zh: "用过提示、撤销或演示的一局仍会记录，但卡片会标出“参考过提示”。", en: "A run with hints, undo or the demo still counts, but the card marks it as helped." }
      ]
    },
    {
      title: { zh: "大师课", en: "Master Class" },
      lines: [
        { zh: "主菜单的“大师课”有八节小课，从拖动、空位、曹操的门，到横刀立马的开局。", en: "The Master Class has eight short lessons: moving, holes, Cao's door, and the Hengdao opening." },
        { zh: "“大师笔记”总结了十种常用技巧。卡住时先读一页，再回棋盘。", en: "Master Notes collects ten useful techniques. Read a page when stuck, then return to the board." },
        { zh: "每一关都能看一步提示或整段演示。演示结束会回到你原来的棋局。", en: "Every level offers a one-step hint or a full demo. The demo returns you to your own board." }
      ]
    }
  ]
};
