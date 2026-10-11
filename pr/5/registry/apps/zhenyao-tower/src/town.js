/* The town of 青石镇: map, people, and what they say. Data only; src/world.js builds the 3D scene.
   Map characters: "." grass  "," path  "T" tree  "L" lantern  "W" well  "#" house  "D" house door (south wall)
   One character is one world unit. Row 0 is north, toward the tower. */
var TOWN = {
  name: "青石镇",
  map: [
    "TTTTTTTTTTT,,TTTTTTTTTTT",
    "T..T.......,,.......T..T",
    "T.#####...L,,L...####..T",
    "T.#####....,,....####..T",
    "T.##D##....,,....#D##..T",
    "T...,......,,.....,....T",
    "T...,,,,,,,,,,,,,,,....T",
    "T.L.....,,,,,,,,....L..T",
    "T.......,,....,,.......T",
    "T..T....,,.WW.,,....T..T",
    "T.......,,.WW.,,.......T",
    "T.......,,....,,.......T",
    "T.......,,,,,,,,.......T",
    "T.####.....,,.....####.T",
    "T.####..L..,,..L..####.T",
    "T.#D##.....,,.....##D#.T",
    "T..,,,,,,,,,,,,,,,,,,..T",
    "T..........,,..........T",
    "T..T.......,,.......T..T",
    "TTTTTTTTTTT,,TTTTTTTTTTT"
  ],
  start: { x: 11, y: 16, face: "up" },
  tower: { x: 12, y: -13 },
  people: [
    { x: 6, y: 11, art: "granny", name: "婆婆", say: ["夜里塔上有光。", "你师父说过，\n别一个人上去。"] },
    { x: 17, y: 10, art: "child", name: "阿青", say: ["井里有星星！", "……骗你的。"] },
    { x: 13, y: 1, art: "elder", name: "守门人", say: ["封印松了。", "山道还没开。\n明日再来。"] }
  ],
  things: [
    { x: 11, y: 9, say: ["井水很凉。"] },
    { x: 11, y: 0, say: ["北边是上山的路。\n现在还不能走。"] },
    { x: 11, y: 19, say: ["南边是回家的路。"] }
  ]
};
