/* All content lives here: ingredients, dishes, enemies, upgrades, people, weather. */
var DATA = (function () {
  var ING = {
    mushroom: { name: "山菇", one: "菇", desc: "雨后松针底下冒出来的小伞。" },
    fish:     { name: "河鱼", one: "鱼", desc: "溪水里的银鳞，烤着最香。" },
    rice:     { name: "稻米", one: "米", desc: "山脚田里收的，粒粒都小。" },
    bamboo:   { name: "竹笋", one: "笋", desc: "春雷之后，一夜长一截。" },
    greens:   { name: "野菜", one: "菜", desc: "苦里带一点甜。" },
    meat:     { name: "山猪肉", one: "肉", desc: "猎户分给你的，肥瘦正好。" },
    rare:     { name: "山珍", one: "珍", desc: "雾里才找得到，山神的口粮。" }
  };
  var ING_ORDER = ["mushroom", "fish", "rice", "bamboo", "greens", "meat", "rare"];

  var DISHES = {
    mushroom_soup: { name: "山菇汤", price: 8, need: { mushroom: 2 }, appeal: 1, unlock: "base", kind: "soup",
      desc: "清水煮山菇，起锅前撒一点盐。" },
    greens_cake:   { name: "野菜饼", price: 6, need: { greens: 1, rice: 1 }, appeal: 1, unlock: "base", kind: "cake",
      desc: "菜叶切碎和米浆，贴在锅边烙。" },
    bamboo_rice:   { name: "竹筒饭", price: 9, need: { rice: 1, bamboo: 1 }, appeal: 2, unlock: "base", kind: "rice",
      desc: "米装进青竹筒，火上慢慢焖。" },
    grilled_fish:  { name: "烤河鱼", price: 13, need: { fish: 1 }, appeal: 2, unlock: "stove", kind: "grill",
      desc: "鱼身划三刀，炭火烤到皮脆。" },
    pork:          { name: "山猪肉", price: 16, need: { meat: 1, mushroom: 1 }, appeal: 3, unlock: "stove", kind: "grill",
      desc: "厚切猪肉，和山菇一起焖。" },
    bamboo_pork:   { name: "笋炒肉", price: 19, need: { bamboo: 1, meat: 1 }, appeal: 3, unlock: "yan", kind: "stir",
      desc: "阿岩教的：笋斜切，肉大火。" },
    mushroom_pot:  { name: "菌菇煲", price: 24, need: { mushroom: 3 }, appeal: 4, unlock: "critic", kind: "pot",
      desc: "三种菇，一锅汤，火候要稳。" },
    god_soup:      { name: "山神羹", price: 45, need: { rare: 1, mushroom: 2 }, appeal: 5, unlock: "boss", kind: "pot",
      desc: "山神宴的羹，雾里的山珍。" }
  };
  var DISH_ORDER = ["mushroom_soup", "greens_cake", "bamboo_rice", "grilled_fish", "pork", "bamboo_pork", "mushroom_pot", "god_soup"];

  var ENEMIES = {
    boar:   { name: "山猪", hp: 22, atk: 5, def: 0, money: 6, drops: [["meat", 1, 2]],
      intro: "山猪哼了一声，挡在路中间。", art: "boar" },
    monkey: { name: "野猴", hp: 16, atk: 4, def: 0, money: 4, drops: [["greens", 1, 2], ["mushroom", 0, 1]],
      intro: "野猴从树上跳下来，冲你龇牙。", art: "monkey" },
    bamboo: { name: "竹精", hp: 28, atk: 5, def: 1, money: 8, drops: [["bamboo", 2, 2]],
      intro: "竹影里站起一个细长的东西。", art: "bamboo" },
    boss:   { name: "山魈", hp: 72, atk: 6, def: 1, money: 45, drops: [["rare", 1, 1]], boss: true,
      intro: "雾散开。山魈坐在石阶上，像一座会呼吸的山。", art: "boss" }
  };

  var UPGRADES = {
    stove:     { name: "新灶台", cost: 80, rep: 1, desc: "解锁「烤河鱼」「山猪肉」。", short: "灶" },
    sign:      { name: "新招牌", cost: 60, rep: 1, desc: "每晚多来一位客人。", short: "牌" },
    table:     { name: "加一条长凳", cost: 120, rep: 2, desc: "客人愿意多等一会儿，门口多站一位。", short: "凳" },
    whetstone: { name: "磨刀石", cost: 70, rep: 1, desc: "下厨的刀快一点，攻击 +2。", short: "刀" },
    cellar:    { name: "腌菜坛", cost: 50, rep: 1, desc: "打烊后每道菜留一份，不浪费。", short: "坛" }
  };
  var UPGRADE_ORDER = ["stove", "sign", "table", "whetstone", "cellar"];

  var NPCS = {
    ahe:  { name: "阿禾", title: "邻家的姑娘", fav: "mushroom_soup", art: "ahe",
      hint: "她总在打烊前过来，坐在最里面那张桌。" },
    zhou: { name: "老周", title: "渡口的渔夫", fav: "grilled_fish", art: "zhou",
      hint: "他带来的鱼，鳞片还亮着。" },
    yan:  { name: "阿岩", title: "后山的猎户", fav: "bamboo_pork", art: "yan",
      hint: "他不太说话，但会教你切肉。" },
    po:   { name: "婆婆", title: "房东", fav: "bamboo_rice", art: "po",
      hint: "每月初四收租，一分不能少。" },
    critic: { name: "陆先生", title: "过路的美食客", fav: "mushroom_pot", art: "critic",
      hint: "他吃过很多地方，嘴很刁。" }
  };
  var NPC_ORDER = ["ahe", "zhou", "yan", "po"];

  var WEATHER = {
    sunny: { name: "晴", customers: 1, forest: "阳光从叶缝里漏下来。", ambience: null },
    rain:  { name: "雨", customers: -1, forest: "雨点打在山菇上，长得正肥。", ambience: "rain" },
    fog:   { name: "雾", customers: -2, forest: "雾很重，深处的东西会出来。", ambience: "wind" }
  };
  var WEATHER_BY_DAY = ["sunny", "rain", "sunny", "rain", "sunny", "fog", "sunny"];

  var RENT = { 4: 100, 7: 150 };
  var MAX_DAY = 7;

  return {
    ING: ING, ING_ORDER: ING_ORDER,
    DISHES: DISHES, DISH_ORDER: DISH_ORDER,
    ENEMIES: ENEMIES,
    UPGRADES: UPGRADES, UPGRADE_ORDER: UPGRADE_ORDER,
    NPCS: NPCS, NPC_ORDER: NPC_ORDER,
    WEATHER: WEATHER, WEATHER_BY_DAY: WEATHER_BY_DAY,
    RENT: RENT, MAX_DAY: MAX_DAY
  };
})();
