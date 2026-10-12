/* Battle data: the hero's growth, spells, items, enemies and the fixed fights along the route.
   Data only; src/rules.js does the arithmetic and tests/zhenyao-sim.mjs checks the balance.
   Five elements: each one overcomes the next  金 > 木 > 土 > 水 > 火 > 金.
   An enemy of element X is weak to whatever overcomes X; a hit on the weakness does double damage. */
var BATTLE = {
  ELEMENTS: {
    metal: { name: "金", beats: "wood" },
    wood: { name: "木", beats: "earth" },
    earth: { name: "土", beats: "water" },
    water: { name: "水", beats: "fire" },
    fire: { name: "火", beats: "metal" }
  },

  /* total experience needed for each level (index = level); level 10 is the cap */
  XP: [0, 0, 12, 30, 56, 92, 140, 200, 280, 380, 500],
  /* stats grow by the same amount every level, so the curve is easy to reason about */
  HERO: {
    base: { hp: 44, mp: 18, atk: 9, def: 4, mag: 10 },
    grow: { hp: 11, mp: 4, atk: 2.5, def: 1.6, mag: 2.4 }
  },

  /* power is damage at magic 10; "all" spells hit every enemy. level: learned on reaching it */
  SPELLS: {
    sword: { name: "飞剑诀", element: "metal", target: "one", power: 15, mp: 4, level: 1 },
    tide: { name: "寒潮", element: "water", target: "all", power: 9, mp: 6, level: 1 },
    vine: { name: "青藤缚", element: "wood", target: "all", power: 9, mp: 6, level: 2 },
    talisman: { name: "离火符", element: "fire", target: "one", power: 17, mp: 5, level: 4 },
    seal: { name: "山岳印", element: "earth", target: "all", power: 12, mp: 7, level: 5 },
    pagoda: { name: "七级浮屠", element: null, target: "all", power: 18, mp: 18, level: 7, ultimate: true }
  },
  SPELL_ORDER: ["sword", "tide", "vine", "talisman", "seal", "pagoda"],

  ITEMS: {
    pill: { name: "回春丹", hp: 60 },
    ether: { name: "聚灵丹", mp: 20 }
  },
  ITEM_ORDER: ["pill", "ether"],
  START_ITEMS: { pill: 3, ether: 1 },

  /* defending halves damage until the hero's next turn and gathers a little mana */
  DEFEND_MP: 3,
  FLEE_CHANCE: 0.7,
  CRIT_CHANCE: 0.08,

  /* move: what the enemy's ordinary attack is called and which effect it plays.
     charge (boss): every `every` turns it spends a turn gathering, then hits for `mult` times its attack. */
  ENEMIES: {
    fox: { name: "狐火", element: "fire", hp: 22, atk: 10, def: 2, xp: 5, art: "fox", move: "狐火", fx: "ember" },
    imp: { name: "树魅", element: "wood", hp: 30, atk: 9, def: 4, xp: 6, art: "imp", move: "缠枝", fx: "lash" },
    golem: { name: "石傀", element: "earth", hp: 42, atk: 12, def: 8, xp: 9, art: "golem", move: "落石", fx: "rock" },
    wraith: { name: "水魍", element: "water", hp: 58, atk: 17, def: 7, xp: 15, art: "wraith", move: "寒涎", fx: "splash" },
    bronze: { name: "铜甲尸", element: "metal", hp: 74, atk: 19, def: 15, xp: 19, art: "bronze", move: "铁爪", fx: "lash" },
    mirage: {
      name: "蜃妖", element: "water", hp: 420, atk: 26, def: 12, xp: 0, art: "mirage", move: "蜃气", fx: "splash",
      boss: true, charge: { every: 3, mult: 2.4, gather: "蜃妖深吸一口气……", move: "蜃楼潮" }
    }
  },

  /* the fights on the way, in order. P3 places them on the maps as enemies you can see (no random battles).
     save: a save point before this part, which also restores HP and MP. found: items picked up in this part. */
  ROUTE: [
    { area: "road", save: true, found: { pill: 1 }, fights: [["fox"], ["imp", "fox"], ["golem"], ["imp", "golem"], ["fox", "fox", "imp"]] },
    { area: "tower", save: true, found: { pill: 2, ether: 1 }, fights: [["wraith"], ["bronze"], ["wraith", "golem"]] },
    { area: "upper", save: true, found: { pill: 1, ether: 1 }, fights: [["bronze", "imp"], ["wraith", "wraith"], ["bronze", "wraith"]] },
    { area: "top", save: true, found: { pill: 2, ether: 2 }, fights: [["mirage"]] }
  ]
};
