/* 青石镇 (the town). Original, written for this game (MIT, like the rest of it).
   Mode: G 宫 (G A B D E, resting on G), 104 bpm, 4/4, 16 bars (37 seconds), loops.
   An ordinary evening: a folk tune with a light step, nothing in it knows about the tower yet.
     bars 1-8    A  | G | Em | G | D | G | Em | D | G |    the tune; bar 4 stops on A (open), bar 8 comes home
     bars 9-16   B  | G | Em | G | D | G | Em | D | G |    higher, answering itself, then home again
   p1     the tune, 25% pulse
   p2     the chord plucked on the off-beats, 12.5% pulse, soft (a plucked lute)
   tri    the bass: root and fifth on the beat
   noise  a woodblock on beats 2 and 4, with a lighter tap after it */
var MUSIC = MUSIC || {};
(function () {
  /* p2: one bar of off-beat plucks over each chord */
  var G = "| r b r >d< r b r >d< ", Em = "| r g r b r g r b ", D = "| r a r >d< r a r >d< ";
  /* tri: one bar of root and fifth */
  var bG = "| g >d< g >d< ", bEm = "| e b e b ", bD = "| d a d a ";
  var chords = [G, Em, G, D, G, Em, D, G, G, Em, G, D, G, Em, D, G];
  var bass = [bG, bEm, bG, bD, bG, bEm, bD, bG, bG, bEm, bG, bD, bG, bEm, bD];
  MUSIC.town = {
    name: "青石镇", loop: true,
    song: {
      bpm: 104,
      p1: "@1 v10 o4 l8" +
        "| g a b4 >d4< b a | g4 e g a2 | b >d e4 d <b a4 | g4 a b a2" +
        "| g a b4 >d4 e d | <b4 a g e4 g4 | a b a g e4 d4 | g2. r4" +
        "| >d4 e d <b4 >d4 | e4 g e d2 | <b >d <b a g4 e4 | a2. r4" +
        "| b4 a b >d4 <b a | g4 e d e4 g4 | a b >d <b a4. b | g2. r4",
      p2: "@0 v5 o3 l8 " + chords.join(""),
      /* the last bar rests on beat 4, a breath before the loop */
      tri: "v10 o2 l4 " + bass.join("") + "| g >d< g r",
      noise: "l8 [r4 v3 x v1 x r4 v3 x v1 x]16"
    }
  };
})();
