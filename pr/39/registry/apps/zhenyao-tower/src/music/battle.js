/* 斗法 (an ordinary fight). Original, written for this game (MIT, like the rest of it).
   Mode: A 羽 (the C 宫 scale C D E G A, resting on A), 152 bpm, 4/4, 16 bars (25 seconds), loops.
   Something to push the turns along without getting in the way of the menus.
     bars 1-8    A  | Am | G | Am | D | Am | C | G | C |   a running tune that climbs to the high E
     bars 9-16   B  | C | D | Am | C | D | C | G | Am |   higher, in shorter breaths, then down to A
   p1     the tune, 25% pulse
   p2     the chord, broken in eighths (root, fifth, octave, fifth), 50% pulse, soft
   tri    the bass in eighths, jumping the octave
   noise  drums: a long hit on 1 and 3 (and the "and" of 3), ticks between; a fill in bars 8 and 16 */
var MUSIC = MUSIC || {};
(function () {
  /* one bar of the broken chord, and one bar of bass, for each chord */
  var arp = { A: "| o3 a o4 e a e o3 a o4 e a e ", G: "| o3 g o4 d g d o3 g o4 d g d ", C: "| o4 c g o5 c o4 g c g o5 c o4 g ",
    D: "| o3 d a o4 d o3 a d a o4 d o3 a " };
  var low = { A: "| o2 a>a<a>a<a>a<a>a ", G: "| o2 g>g<g>g<g>g<g>g ", C: "| o2 c>c<c>c<c>c<c>c ", D: "| o2 d>d<d>d<d>d<d>d " };
  var chords = "A G A D A C G C C D A C D C G A".split(" ");
  var beat = "| v6 X v3 x v4 x v3 x v6 X v3 x v5 X v3 x ", fill = "| v6 X v4 x x x v6 X X v7 X X ";
  MUSIC.battle = {
    name: "斗法", loop: true,
    song: {
      bpm: 152,
      p1: "@1 v11 o4 l8" +
        "| a4 >c d e4 d c | d4 c <a g4 a4 | a4 >c d e4 g e | d2 r e d c" +
        "| <a4 g a >c4 <a g | e4 g a e4 d4 | e g a >c d4 c d | e2 r4 r e" +
        "| g4 e g a4 g e | d4 e d c4 <a4 | >c4 d c <a4 g a | e2. r4" +
        "| a4 a >c d4 d e | g4 e d e4 d c | d c <a g a4 >c d | <a2 r2",
      p2: "@2 v5 l8 " + chords.map(function (c) { return arp[c]; }).join(""),
      tri: "v10 l8 " + chords.map(function (c) { return low[c]; }).join(""),
      noise: "l8 [" + beat + beat + beat + beat + beat + beat + beat + fill + "]2"
    }
  };
})();
