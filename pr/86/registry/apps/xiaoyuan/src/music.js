/* The Yard's tune and its two sounds of its own. Original, written for this app (MIT, like the rest of it).
   F major, 96 bpm, 4/4, 16 bars (40 seconds), loops back to bar 1. The melody keeps to the pentatonic
   F G A C D, with an E only over the A minor and C chords.
     bars 1-8   A  | F | Dm | Bb | C | F | Am | Bb C | F |   the tune, in the middle of the range
     bars 9-16  B  | Bb | F | Gm | C | Bb | F/A | Gm C | F |  the answer, a little higher, then home
   p1     melody, 25% pulse (a reedy lead)
   p2     the chord, broken into soft off-beat eighths, 12.5% pulse an octave below the tune
   tri    bass: root and fifth on the beat, the octave on beat 3
   noise  a light brush: short ticks, a long soft hit on beat 3, a small fill before the loop
   One bar per line; "|" and spaces are only for reading. MML is described in SPEC.md section 6. */
var YARD_SONG = {
  bpm: 96,
  p1: "@1 v11 o4 l8" +
    "| a4 >c d c4< a4 | g a g f d4. r | f4 g a >c4< a g | g2 r4 a g" +
    "| f4 a >c d4 c d< | >c4.< a g4 e4 | d f g a g4 >c4< | f2. r4" +
    "| v12 >d4. c< a4 >d4< | >c2< a4 f4 | g a >c d c4< a4 | g2. r4" +
    "| v11 f4 d f g4 a >c< | a4. g f4 a4 | g f d f g4. a | f2 r2",
  p2: "@0 v7 o3 l8" +
    "| r f a >c< r a >c< a | r d f a r f a f | r d f b- r f b- f | r e g >c< r g >c< g" +
    "| r f a >c< r a >c< a | r e a >c< r a >c< a | r d f b- r e g >c< | r f a >c< r a >c< a" +
    "| r d f b- r f b- f | r f a >c< r a >c< a | r d g b- r g b- g | r e g >c< r g >c< g" +
    "| r d f b- r f b- f | r f a >c< r a >c< a | r d g b- r e g >c< | r f a >c< r a >c< a",
  tri: "v12 o2 l4" +
    "| f >c f c< | d a >d< a | <b- >f b- f | c g >c< g" +
    "| f >c f c< | <a >e a e | <b- >f c g | f >c f c<" +
    "| <b- >f b- f | f >c f c< | <g >d g d | c g >c< g" +
    "| <b- >f b- f | <a >c f c | <g >d c g | f >c f c<",
  noise: "l8 [v5 x r v3 x x v6 X4 v3 x r]15 | v5 x r x r v6 X4 v4 x x"
};
/* stroking the cat: a low grainy rumble */
var SFX_PURR = { wave: "noise", from: 220, to: 140, ms: 420, attack: 60, decay: 300, vol: 0.5 };
/* the key in the grass: a bright chirp upward */
var SFX_KEY = { wave: "square", duty: 1, from: 1320, to: 1980, ms: 160, attack: 2, decay: 150, vol: 0.6 };
