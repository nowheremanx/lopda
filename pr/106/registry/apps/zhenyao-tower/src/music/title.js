/* 塔影 (the title). Original, written for this game (MIT, like the rest of it). Also the end credits.
   Mode: D 羽 (the F 宫 scale F G A C D, resting on D), 66 bpm, 4/4, 16 bars (58 seconds), loops.
   Quiet and far away: a thin flute line over a held bass, and its echo off the mountain a beat later.
     bars 1-2    the bass alone (the echo of the last phrase dies away here when it loops)
     bars 3-10   A  the tune, low: A G A, down to D
     bars 11-16  B  the same shape an octave up, then back down to D
   p1     the tune, 12.5% pulse (thin, like a bamboo flute)
   p2     the same tune one beat later and much softer: the echo
   tri    the bass, one whole note a bar, on the notes of the mode
   noise  a soft woodblock at the end of every second bar, like a temple far off
   Bars are separated by "|"; MML is in SPEC.md section 6.3. */
var MUSIC = MUSIC || {};
(function () {
  var tune =
    "| a4. g a2 | >c4 <a g f2 | g4. f d4 f4 | g1 | a4. >c d4 c <a | g4 a g f4 d4 | f4. g d4 <a4 | >d1" +
    "| >d4. c d4 f4 | g2 f4 d4 | c4. <a >c4 d4 | <a2. g4 | a4 g f d4 f g";
  MUSIC.title = {
    name: "塔影", loop: true,
    song: {
      bpm: 66,
      p1: "@0 v9 o4 l8 | r1 | r1 " + tune + " | d1",
      /* the echo: one beat late, so its last note is a beat shorter */
      p2: "@0 v4 o4 l8 | r1 | r1 | r4 " + tune + " | d2.",
      tri: "v9 o2 l1 | d | d | d | f | g | c | d | g | a | d | f | g | a | f | g | d",
      noise: "[r1 | r2. v2 x4]8"
    }
  };
})();
