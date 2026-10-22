/* 塔中 (inside the tower), in two versions: the first floor, and the middle floor (and the roof before the boss),
   which is the same music with one more voice. Original, written for this game (MIT, like the rest of it).
   Mode: A 商 (the G 宫 scale G A B D E, resting on A), 88 bpm, 4/4, 16 bars (44 seconds), both loop.
   Still, cold air and stone; the second version keeps the tune and adds a pulse under it, so going upstairs
   feels like the same place getting closer to something.
     bars 1-8    A  the tune climbs to E and comes back to A
     bars 9-16   B  starts high on E, turns round D and B, ends on A
   p1     the tune, 25% pulse
   p2     a slow ostinato of broken fifths in eighths (A E B E, or G D A D, or E B D B), very soft;
          louder and more nasal upstairs
   tri    first floor: one long note a bar; upstairs: the same notes, the octave above on beat 3
   noise  first floor: a drip now and then; upstairs: a steady pulse on every beat */
var MUSIC = MUSIC || {};
(function () {
  var tune =
    "| a2 b4 >d4 | e4. d <b2 | a4 g e g4 a4 | e2. r4" +
    "| a2 >d4 e4 | g4. e d2 | e d <b a g4 b4 | a1" +
    "| >e2 g4 e4 | d4. e <b2 | >d e d <b a4 g4 | e2. r4" +
    "| a4. b >d4 e4 | g4 e d e2 | d <b a g e4 g4 | a1";
  /* p2: one bar of the ostinato over A, G or E */
  var oA = "| o3 a >e< b >e< a >e< b >e ", oG = "| o3 g >d< a >d< g >d< a >d ", oE = "| o3 e b >d< b e b >d< b ";
  var harm = [oA, oE, oA, oE, oA, oG, oG, oA, oE, oG, oG, oE, oA, oE, oG, oA];
  /* tri: the root of each bar, and upstairs the same root and its octave */
  var roots = ["o2 a", "o2 e", "o2 a", "o2 e", "o2 a", "o2 g", "o2 g", "o2 a", "o2 e", "o2 g", "o2 g", "o2 e", "o2 a", "o2 e", "o2 g", "o2 a"];
  var low = roots.map(function (r) { return "| " + r + "1 "; }).join("");
  var high = roots.map(function (r) { return "| " + r + "2 > " + r.slice(3) + "2 "; }).join("");
  MUSIC.tower = {
    name: "塔中", loop: true,
    song: {
      bpm: 88,
      p1: "@1 v9 o4 l8 " + tune,
      p2: "@2 v3 l8 " + harm.join(""),
      tri: "v8 " + low,
      noise: "[v2 x8 r8 r4 r2 | r2 v1 x8 r8 r4]8"
    }
  };
  MUSIC.towerUp = {
    name: "塔中·上", loop: true,
    song: {
      bpm: 88,
      p1: "@1 v9 o4 l8 " + tune,
      p2: "@1 v5 l8 " + harm.join(""),
      tri: "v9 " + high,
      noise: "l8 [v4 X4 v2 x x v3 X4 v2 x r]16"
    }
  };
})();
