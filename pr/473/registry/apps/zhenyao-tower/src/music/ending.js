/* The ending, in two pieces. Original, written for this game (MIT, like the rest of it).

   天明 (dawn at the tower's gate, the rain over). Played from the dawn until the hand closes on the pendant;
   the music stops there and the scene goes on in silence (and the stream).
   Mode: D 徵 (the G 宫 scale G A B D E, resting on D), 70 bpm, 4/4, 16 bars (55 seconds), loops.
   Light and open, the first piece in the game in a bright mode, and the quietest.
     bars 1-4    the tune alone over the bass, down to D
     bars 5-8    a soft held note joins it; the phrase stops on A (open)
     bars 9-12   up to the high E, back to D
     bars 13-16  once more, plainly, to D
   p1     the tune, 12.5% pulse, soft
   p2     from bar 5, one held note a bar under the tune, 50% pulse, very soft
   tri    root and fifth in halves
   noise  a drop from the eaves now and then, almost nothing

   未完 (unfinished). Played once, from the master going in through the gate, over the last shot and 序章 完.
   64 bpm, 16 beats (15 seconds). The first phrase of the title (塔影) comes back with one note changed, and
   stops on E over a C in the bass: in this mode it does not come home. Under the last note, very faintly,
   the boss's half-step shimmer (蜃楼).
   p1     the title's phrase, 12.5% pulse
   p2     the shimmer E-F, in the last half bar, as soft as the chip goes
   tri    D, A, G, then the C that leaves it open
   noise  one drop */
var MUSIC = MUSIC || {};
(function () {
  var G = "| o2 g2 o3 d2 ", D = "| o3 d2 a2 ", E = "| o2 e2 b2 ", A = "| o2 a2 o3 e2 ";
  var bass = [G, D, E, G, E, G, A, D, E, G, A, D, E, A, G, D];
  MUSIC.dawn = {
    name: "天明", loop: true,
    song: {
      bpm: 70,
      p1: "@0 v8 o4 l8" +
        "| d2 e4 g4 | a2. g4 | b4. a g4 e4 | d1" +
        "| g2 a4 b4 | >d2. <b4 | a4. g e4 g4 | a1" +
        "| b2 >d4 e4 | d2. <b4 | a4 b a g4 e4 | d2. r4" +
        "| e4. g a4 b4 | a2 g4 e4 | d4 e g a4 g4 | d1",
      p2: "@2 v3 o4 l1 | r | r | r | r | g | b | e | e | g | g | e | d | e | e | b | a",
      tri: "v8 " + bass.join(""),
      noise: "[r2 v1 x4 r4 | r1]8"
    }
  };
  MUSIC.coda = {
    name: "未完", loop: false,
    song: {
      bpm: 64,
      p1: "@0 v8 o4 l8 | a4. g a2 | >c4 <a g e2 | d4. e g4 a4 | e1",
      p2: "@3 v2 o5 l16 | r1 | r1 | r1 | r2 [e f]4",
      tri: "v8 l1 | o3 d | o2 a | o2 g | o3 c",
      noise: "| r1 | r1 | r1 | v1 x4 r2."
    }
  };
})();
