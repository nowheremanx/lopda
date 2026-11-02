/* 矿工老张 / Lao Zhang: data, levels, shop and both languages.
   The game is a four-tone hook-and-haul mine; the picture is 160x144 logical pixels. */
var GM = (typeof GM !== "undefined" && GM) || {};

GM.W = 160;                     /* the mine's world, in game units */
GM.H = 144;
GM.SCALE = 2;                   /* draw at 2x: the world stays readable, the items get real detail */
GM.BW = GM.W * GM.SCALE;        /* the indexed framebuffer */
GM.BH = GM.H * GM.SCALE;
GM.GROUND = 23;                 /* the miner stands on this line; the mine is below it */
GM.ANCHOR = { x: 80, y: 18 };   /* the rope leaves old Zhang's hands here */
GM.IDLE_ROPE = 18;              /* the hook swings at this length (two-thirds of the old rope) */
GM.MAX_ROPE = 172;
GM.SWING = 1.32;                /* radians either side of straight down */
GM.PERIOD = 3.6;                /* seconds for a full left-right-left swing */
GM.LEVEL_TIME = 60;
GM.OUT_SPEED = 135;
GM.EMPTY_SPEED = 240;
GM.BASE_SPEED = 28.6;           /* the old large-rock reel speed, now the base */
GM.PLAY_LEVELS = 10;
GM.STRENGTH_STEP = 0.15;
GM.DYNAMITE_HARD_CAP = 9999;   /* only the save file needs a sane ceiling; the shop has no cap */
GM.ENDLESS_FIRST_STEP = 2900;
GM.ENDLESS_GROW = 240;

/* Cumulative cash targets for the ten written levels, retuned with tools/lao-zhang-sim.mjs.
   Early levels leave a real surplus; levels 4, 8 and 10 are the spikes that spend it. */
GM.TARGETS = [1200, 3600, 5850, 9000, 12550, 17100, 23100, 30000, 36400, 44800];

/* value is the base price; bag uses min/max and a roll; rocks are worth triple with the book.
   A bag now rolls cash, dynamite or a burst of strength when it is hauled in. */
GM.ITEMS = {
  goldS:   { kind: "gold",  value: 100, weight: 0.9,  r: 7,  sprite: "goldS",   pref: [40, 122] },
  goldM:   { kind: "gold",  value: 300, weight: 1.1,  r: 10, sprite: "goldM",   pref: [55, 130] },
  goldL:   { kind: "gold",  value: 700, weight: 1.4,  r: 13, sprite: "goldL",   pref: [70, 129] },
  diamond: { kind: "gem",   value: 1500, weight: 0.6, r: 6,  sprite: "diamond", pref: [92, 134] },
  bag:     { kind: "bag",   value: 0,   weight: 0.9,  r: 8,  sprite: "bag",     pref: [50, 126], min: 120, max: 420 },
  rockS:   { kind: "rock",  value: 2,   weight: 1.8,  r: 8,  sprite: "rockS",   pref: [45, 134] },
  rockL:   { kind: "rock",  value: 10,  weight: 4.2,  r: 13, sprite: "rockL",   pref: [60, 129] },
  bone:    { kind: "junk",  value: 2,   weight: 1.2,  r: 7,  sprite: "bone",    pref: [50, 128] },
  skull:   { kind: "junk",  value: 10,  weight: 1.6,  r: 8,  sprite: "skull",   pref: [55, 132] },
  tnt:     { kind: "tnt",   value: 0,   weight: 1.4,  r: 8,  sprite: "tnt",     pref: [65, 126] },
  mole:    { kind: "mole",  value: 0,   weight: 0.9,  r: 8,  sprite: "mole",    pref: [82, 120] }
};

GM.ITEM_ORDER = ["goldS", "goldM", "goldL", "diamond", "bag", "rockS", "rockL", "bone", "skull", "tnt", "mole"];

GM.LEVELS = [
  { goldS: 9, goldM: 3, goldL: 1, bag: 1, rockS: 1, bone: 1 },
  { goldS: 8, goldM: 4, goldL: 2, bag: 2, rockS: 2, bone: 1, diamond: 1 },
  { goldS: 7, goldM: 4, goldL: 2, bag: 2, rockS: 3, rockL: 1, bone: 1, skull: 1, diamond: 1, tnt: 1 },
  { goldS: 6, goldM: 5, goldL: 3, bag: 2, rockS: 3, rockL: 1, bone: 1, skull: 1, diamond: 1, tnt: 1, mole: 1 },
  { goldS: 6, goldM: 5, goldL: 3, bag: 3, rockS: 3, rockL: 2, bone: 2, skull: 1, diamond: 2, tnt: 1, mole: 1 },
  { goldS: 5, goldM: 5, goldL: 3, bag: 3, rockS: 4, rockL: 2, bone: 2, skull: 1, diamond: 2, tnt: 2, mole: 1 },
  { goldS: 4, goldM: 5, goldL: 4, bag: 3, rockS: 4, rockL: 2, bone: 2, skull: 1, diamond: 2, tnt: 1, mole: 2 },
  { goldS: 3, goldM: 5, goldL: 4, bag: 3, rockS: 4, rockL: 2, bone: 2, skull: 2, diamond: 2, tnt: 2, mole: 2 },
  { goldS: 2, goldM: 5, goldL: 4, bag: 3, rockS: 3, rockL: 2, bone: 1, skull: 2, diamond: 3, tnt: 3, mole: 2 },
  { goldS: 2, goldM: 6, goldL: 5, bag: 3, rockS: 4, rockL: 2, bone: 1, skull: 2, diamond: 3, tnt: 3, mole: 3 }
];

/* Shop definitions. Dynamite has no cap; the other three are one-level buffs, so they
   disappear when the level they were bought for ends. */
GM.SHOP = [
  { id: "dynamite", key: "dynamite", price: 110, max: null, buff: false },
  { id: "strength", key: "strength", price: 210, max: 1,    buff: true },
  { id: "clover",   key: "clover",   price: 190, max: 1,    buff: true },
  { id: "book",     key: "book",     price: 150, max: 1,    buff: true }
];

/* Each level's shop has its own stock and prices, seeded by the run so Continue sees the
   same shelves. Dynamite is always there; the buffs are often missing on purpose. */
GM.shopOffers = function (state, n) {
  var seed = ((state.runSeed || 1) ^ Math.imul(n || 1, 0x9e3779b1)) >>> 0;
  var rng = GM.rng(seed || 1);
  var offers = [], i, def, available, mult, price;
  for (i = 0; i < GM.SHOP.length; i++) {
    def = GM.SHOP[i];
    if (def.key === "dynamite") {
      available = true;
      mult = 1 + (n - 1) * 0.035 + rng() * 0.22;
      if (rng() < 0.18) mult += 0.45;          /* a short fuse shortage */
    } else {
      /* early shops are generous; late shops sometimes have nothing but dynamite */
      available = rng() < (n <= 3 ? 0.82 : n <= 6 ? 0.66 : 0.5);
      mult = 1 + (n - 1) * 0.06 + rng() * 0.25;
      if (rng() < 0.12) mult += 0.5;
    }
    price = Math.max(30, Math.round(def.price * mult / 10) * 10);
    offers.push({
      id: def.id,
      key: def.key,
      price: price,
      base: def.price,
      max: def.max,
      buff: def.buff,
      available: available,
      priceUp: available && price >= Math.round(def.price * 1.35)
    });
  }
  return offers;
};

/* An original four-note level-start jingle; there is no background loop. */
GM.JINGLE = {
  bpm: 144,
  p1: "o5 l8 c e g >c",
  p2: "o4 l8 c e g c",
  tri: "o3 l4 c g",
  noise: "l8 v3 x r x r"
};

GM.SFX = {
  boom:  { wave: "noise", from: 900, to: 55, ms: 380, vol: 0.9 },
  chime: { wave: "triangle", from: 880, to: 1560, ms: 160, vol: 0.55, decay: 150 },
  throw: { wave: "noise", from: 300, to: 900, ms: 110, vol: 0.32 }
};

GM.TEXT = {
  zh: {
    title: "矿工老张",
    sub: "六十秒一关。钩金子，躲石头。",
    tip: "钩子摆动时按 A 下钩。",
    start: "开始",
    best: "最高 第 {l} 关 · ${b}",
    noBest: "还没有纪录",
    footTitle: "A / START 开始",
    level: "第 {n} 关",
    time: "{n}秒",
    dyn: "药 {n}",
    intro: "第 {n} 关　目标 ${t}",
    tip1: "石头又重又不值钱；先钩金块。",
    tip2: "钱袋随机开出：现金、炸药或大力。",
    tip4: "炸药桶会跟着钩子往回走，半路才炸。",
    tip6: "有些关商店不进货，或者故意抬价。",
    tip7: "普通地鼠不值钱；带钻石的那只才值钱。",
    tipDefault: "A 下钩　START 暂停",
    buffIntro: "本关：{b}",
    buffNames: ["大力", "幸运草", "岩石图鉴"],
    soldOut: "本关无货",
    priceUp: "涨价",
    ownedMany: "×{n}",
    footPlay: "A/点 下钩　START 暂停",
    footPlayDyn: "A/点 下钩　B 炸药　START 暂停",
    pause: "暂停",
    resume: "继续",
    footPause: "START 继续",
    clear: "过关",
    clearLine: "现金 ${b} / 目标 ${t}",
    extra: "多挖 ${d}",
    record: "新纪录",
    shopBtn: "去商店",
    footClear: "A 去商店",
    shopTitle: "第 {n} 关 · 商店",
    shopCash: "现金 ${b}",
    nextTarget: "下关目标 ${t}",
    next: "下一关",
    max: "已满",
    shortPrice: "差 ${d}",
    owned: "{n}/{m}",
    footShop: "↑↓ 选　A 买　B 下一关",
    shopNames: ["炸药", "力量药水", "幸运草", "岩石图鉴"],
    shopDescs: ["炸掉钩住的东西，可无限买", "本关收绳更快，过关失效", "本关钱袋更鼓、多一颗钻石", "本关石头值三倍，过关失效"],
    over: "时间到",
    overShort: "差 ${d}",
    retry: "再来一次",
    toTitle: "回标题",
    footOver: "A 再来　B 标题",
    victory: "矿场传说",
    victoryLine: "第 10 关通过",
    keep: "继续挖",
    footVictory: "A 继续挖　B 标题",
    saveFail: "最高纪录读不出，本次不写入。",
    saveNewer: "存档来自新版本，本次不写入。",
    saveWrite: "最高纪录暂时写不进去。",
    runFail: "进行中的进度读不出，本次不续关。",
    runNewer: "进行中的进度来自新版本，本次不续关。",
    runWrite: "进度暂时写不进去。",
    menuContinue: "继续",
    menuContinueAt: "第 {n} 关 · 现金 ${b}",
    menuNoRun: "没有进行中的矿",
    menuNew: "重新开始",
    menuNewSub: "从第 1 关开始",
    menuCodex: "物品图鉴",
    menuCodexSub: "看看每样东西值多少",
    menuFoot: "↑↓ 选　A 确定",
    confirmTitle: "重新开始？",
    confirmText: "会丢掉第 {n} 关的进度。",
    confirmCancel: "取消",
    confirmRestart: "重新开始",
    confirmFoot: "A 确定　B 返回",
    pauseMenu: "回到主菜单",
    pauseFoot: "↑↓ 选　A 确定　START 继续",
    codexTitle: "物品图鉴",
    codexHint: "越轻越值钱；炸药桶会炸掉身边的宝贝。",
    codexBack: "返回",
    codexFoot: "B 返回",
    codexBoom: "爆炸",
    codexLight: "轻",
    codexMid: "中",
    codexHeavy: "重",
    codexRandom: "随机",
    codexMole: "0 / $1,500",
    codexNames: ["小金块", "中金块", "大金块", "钻石", "钱袋", "小石头", "大石头", "骨头", "头骨", "炸药桶", "地鼠"]
  },
  en: {
    title: "GOLD DIG",
    sub: "Sixty seconds a level. Hook gold, dodge rocks.",
    tip: "Press A as the hook swings.",
    start: "START",
    best: "BEST LV {l} · ${b}",
    noBest: "NO RECORD YET",
    footTitle: "A / START TO PLAY",
    level: "LV {n}",
    time: "{n}s",
    dyn: "B {n}",
    intro: "LV {n}　TARGET ${t}",
    tip1: "Rocks are heavy and cheap. Hook gold first.",
    tip2: "Bags roll cash, dynamite or a burst of strength.",
    tip4: "A hooked TNT rides the rope back before it blows.",
    tip6: "Some shops have no stock, or raise the price.",
    tip7: "Plain moles are worthless; the one with a diamond is not.",
    tipDefault: "A HOOK　START PAUSE",
    buffIntro: "THIS LEVEL: {b}",
    buffNames: ["STRENGTH", "CLOVER", "ROCK BOOK"],
    soldOut: "NO STOCK",
    priceUp: "PRICE UP",
    ownedMany: "x{n}",
    footPlay: "A/TAP HOOK　START PAUSE",
    footPlayDyn: "A/TAP HOOK　B BOOM　START PAUSE",
    pause: "PAUSED",
    resume: "RESUME",
    footPause: "START RESUME",
    clear: "LEVEL CLEAR",
    clearLine: "TAKE ${b} / GOAL ${t}",
    extra: "${d} EXTRA",
    record: "NEW BEST",
    shopBtn: "SHOP",
    footClear: "A SHOP",
    shopTitle: "LV {n} · SHOP",
    shopCash: "CASH ${b}",
    nextTarget: "NEXT TARGET ${t}",
    next: "NEXT",
    max: "MAX",
    shortPrice: "${d} SHORT",
    owned: "{n}/{m}",
    footShop: "UP/DOWN PICK　A BUY　B NEXT",
    shopNames: ["DYNAMITE", "STRENGTH", "CLOVER", "ROCK BOOK"],
    shopDescs: ["Blow up what you hooked, no limit", "Faster reel, this level only", "Fatter bags, one extra diamond", "Rocks worth triple, this level only"],
    over: "TIME UP",
    overShort: "${d} SHORT",
    retry: "TRY AGAIN",
    toTitle: "TITLE",
    footOver: "A AGAIN　B TITLE",
    victory: "MINE LEGEND",
    victoryLine: "LEVEL 10 CLEARED",
    keep: "KEEP DIGGING",
    footVictory: "A KEEP DIGGING　B TITLE",
    saveFail: "Best save unreadable; not writing this time.",
    saveNewer: "Save is from a newer version; not writing.",
    saveWrite: "Best save cannot be written now.",
    runFail: "Run save unreadable; Continue is off.",
    runNewer: "Run save is from a newer version; Continue is off.",
    runWrite: "Run progress cannot be saved now.",
    menuContinue: "CONTINUE",
    menuContinueAt: "LV {n} · ${b}",
    menuNoRun: "NO RUN IN PROGRESS",
    menuNew: "NEW GAME",
    menuNewSub: "Start again at level 1",
    menuCodex: "ITEM CODEX",
    menuCodexSub: "What each thing is worth",
    menuFoot: "UP/DOWN PICK　A CHOOSE",
    confirmTitle: "START OVER?",
    confirmText: "The run at LV {n} will be lost.",
    confirmCancel: "CANCEL",
    confirmRestart: "START OVER",
    confirmFoot: "A CHOOSE　B BACK",
    pauseMenu: "MAIN MENU",
    pauseFoot: "UP/DOWN PICK　A CHOOSE　START RESUME",
    codexTitle: "ITEM CODEX",
    codexHint: "Lighter is better; TNT blows up the loot beside it.",
    codexBack: "BACK",
    codexFoot: "B BACK",
    codexBoom: "BOOM",
    codexLight: "LIGHT",
    codexMid: "MID",
    codexHeavy: "HEAVY",
    codexRandom: "RANDOM",
    codexMole: "0 / $1,500",
    codexNames: ["GOLD S", "GOLD M", "GOLD L", "DIAMOND", "BAG", "ROCK S", "ROCK L", "BONE", "SKULL", "TNT", "MOLE"]
  }
};

GM.fmt = function (s, vars) {
  return String(s).replace(/\{(\w+)\}/g, function (_, k) {
    return vars && vars[k] != null ? vars[k] : "";
  });
};

GM.money = function (n) {
  n = Math.max(0, Math.round(Number(n) || 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

GM.text = function (lang) {
  return GM.TEXT[lang === "en" ? "en" : "zh"];
};
