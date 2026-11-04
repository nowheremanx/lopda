/* 蜃楼 (the mirage, the boss). Original, written for this game (MIT, like the rest of it).
   Mode: E 角 (the C 宫 scale C D E G A, resting on E) with its two outside notes F and B leaned on hard,
   and a B-flat in the bass: half-steps and a tritone where the other pieces have none. 132 bpm, 4/4,
   16 bars (29 seconds), loops.
   Wrong and heavy. The bass grinds E against F; a faint shimmer of two notes a half-step apart
   (the mirage's air) sits on the first half of every bar; the tune is long notes that slip down.
     bars 1-2    the bass and the shimmer alone
     bars 3-8    the tune on E, sliding to C and the low B
     bars 9-12   over A: A against B-flat, F against E
     bars 13-16  from the high E down the scale, back to E
   p1     the tune, 12.5% pulse (thin and cold)
   p2     the shimmer: two notes a half-step apart in sixteenths, half a bar, 75% pulse, very soft;
          E-F, then G-A flat, A-B flat, back to E-F
   tri    the grinding bass in eighths: E E F E E E B-flat E, over A: A A B-flat A A A E-flat A
   noise  a heavy hit on 1, ticks after it; every fourth bar a roll */
var MUSIC = MUSIC || {};
(function () {
  var shim = function (a, b) { return "[" + a + " " + b + "]4 r2 "; };
  var bE = "| o2 e e f e e e b- e ", bA = "| o2 a a b- a a a e- a ";
  var hit = "| v7 X4 r v3 x v5 X v3 x r4 ", roll = "| v7 X4 r v3 x v5 X X v6 X X ";
  MUSIC.boss = {
    name: "蜃楼", loop: true,
    song: {
      bpm: 132,
      p1: "@0 v10 o4 l8" +
        "| r1 | r1 | e2. f4 | e1 | g4. a g4 e4 | d4 e d c2 | <b2 >c4 <b4 | >e1" +
        "| a2 b-4 a4 | g4. e f2 | e4 g a >c4 <b4 | a2. g4" +
        "| >e2 d4 c4 | <b4. a g4 f4 | e4 f4 e4 d4 | e1",
      p2: "@3 v3 o4 l16 [" + shim("e", "f") + "]4 [" + shim("g", "a-") + "]4 [" + shim("a", "b-") + "]4 [" + shim("e", "f") + "]4",
      tri: "v11 l8 [" + bE + "]8 [" + bA + "]4 [" + bE + "]4",
      noise: "l8 [" + hit + hit + hit + roll + "]4"
    }
  };
})();
