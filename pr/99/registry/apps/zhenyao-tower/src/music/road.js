/* 雨夜山道 (the road up the mountain, in the rain). Original, written for this game (MIT, like the rest of it).
   Mode: E 羽 (the G 宫 scale G A B D E, resting on E), 76 bpm, 4/4, 16 bars (51 seconds), loops.
   Low and slow, a climb at night. The tune comes in two-bar phrases with two bars of rain between them;
   a high voice answers in the gaps, far away. Written to sit under the rain ambience.
     bars 1-4    phrase 1 (E G A, B A G E), the answer in bars 3-4
     bars 5-8    phrase 2 rises to the high E, the answer in bars 7-8
     bars 9-12   phrase 3 falls to the low B, the answer in bars 11-12
     bars 13-16  phrase 4 comes back to E and holds it; a short answer leads round
   p1     the tune, 50% pulse (hollow), low in the range
   p2     the answers, 12.5% pulse, high and soft
   tri    a walking bass: two steps, a pause, a step (E, G or A)
   noise  nothing but a soft far thud at the end of bars 8 and 16 (thunder behind the hills) */
var MUSIC = MUSIC || {};
(function () {
  /* one bar of the bass on E, G or A: root, rest, root, fifth */
  var E = "| o3 e r e b ", G = "| o3 g r g >d ", A = "| o3 a r a >e ";
  var bass = [E, E, E, E, G, G, E, E, A, A, E, E, G, A, E, E];
  MUSIC.road = {
    name: "雨夜山道", loop: true,
    song: {
      bpm: 76,
      p1: "@2 v8 o4 l8" +
        "| e4. g a2 | b4 a g e2 | r1 | r1" +
        "| g4. a b4 >d4 | e2 d4 <b4 | r1 | r1" +
        "| a4. b a4 g4 | e4 d e <b2 | r1 | r1" +
        "| >e4. g a4 b4 | a4 g e d4 e4 | e2. r4 | r1",
      p2: "@0 v5 o5 l8" +
        "| r1 | r1 | r2 b a g4 | e2 r2" +
        "| r1 | r1 | r2 d e g4 | a2 r2" +
        "| r1 | r1 | r2 g e d4 | e2. r4" +
        "| r1 | r1 | r1 | r2 r g e4",
      tri: "v9 l4 " + bass.join(""),
      noise: "[r1 r1 r1 r1 r1 r1 r1 | r2 v2 X2]2"
    }
  };
})();
