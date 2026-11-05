/* 得胜 (a fight won). Original, written for this game (MIT, like the rest of it).
   Mode: G 宫 (G A B D E), 140 bpm, 6 beats (2.6 seconds), played once.
   A quick run up the scale to the high G, held, with a short drum roll.
   p1     the run and the held G, 25% pulse
   p2     answers a third below, then holds the D under the G
   tri    G and D under it, then the low G held
   noise  eighth ticks, two hits, a last hit on the held note */
var MUSIC = MUSIC || {};
MUSIC.victory = {
  name: "得胜", loop: false,
  song: {
    bpm: 140,
    p1: "@1 v12 o4 l16 d g a b >d8 <b8 >d8 e8 | g2 r4",
    p2: "@2 v7 o4 l8 r4 g g b >c | d2 r4",
    tri: "v12 o2 l4 g >d <g >d | <g2",
    noise: "l8 v5 x x x x v6 X x X x | v7 X4 r4"
  }
};
