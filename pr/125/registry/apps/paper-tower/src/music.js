/* Paper Tower: original music and sounds, written for this game (MIT, like the rest of it).
   The tower is paper and ink, so the tunes use small modal cells and let the triangle do the
   folding underneath. One song per place; battle and boss are their own. MML is described in
   SPEC.md section 6.3. Nothing here comes from another game.
     title  D minor pentatonic, 64 bpm, 8 bars: the tower breathing.
     zone 0 A minor, 88 bpm: paper leaves turning.
     zone 1 G minor, 100 bpm: seal paste and red doors.
     zone 2 E minor, 112 bpm: creases underfoot.
     zone 3 C minor, 76 bpm: the wick burning low.
     zone 4 D minor, 72 bpm: the Ink Sea, slow and deep.
     battle A minor, 150 bpm: the keeper pages 4 and 8; short, pushing, no introduction.
     boss   D minor with a flat second, 132 bpm: page 12, the King on the lamp stand.
     ending F major, 70 bpm: the lamp is lit. */
var PT = PT || {};
PT.MUSIC = {
  title: {
    bpm: 64,
    p1: "@1 v10 o5 l8" +
      "| d4. c8 a4 g4 | f4 e4 d4. r | d4 f4 g4 a4 | c4. a8 g4 f4" +
      "| d4 f4 a4 >c4 | <a4 g4 f4. r | e4 g4 f4 e4 | d2. r4",
    p2: "@0 v6 o3 l8" +
      "| r d f a r f a f | r d f a r f a f | r d g b- r g b- g | r e g >c< r g >c< g" +
      "| r d f a r f a f | r d f a r f a f | r c e g r e g e | r d f a r d f d",
    tri: "v11 o2 l4" +
      "| d a d a | d a d a | <b- >f b- f | c g >c< g" +
      "| d a d a | d a d a | c g >c< g | d a d a",
    noise: "l8 [v4 x r v2 x v3 x r]7 | v4 X4 r2"
  },
  zone: [
    {
      bpm: 88,
      p1: "@1 v10 o4 l8" +
        "| a4 >c4< a4 g4 | e4 g4 a4. r | a4 >c4 d4 c4 | <a4 g4 e4. r" +
        "| a4 >c4< b4 a4 | e4 g4 a4. r | >d4 c4< a4 g4 | a2. r4",
      p2: "@0 v6 o3 l8" +
        "| r a >c< r a >c< a | r e g r e g e | r a >c< r a >c< a | r e g r e g e" +
        "| r a >c< r a >c< a | r e g r e g e | r d f r d f d | r a >c< r a >c< a",
      tri: "v11 o2 l4 | a >c a c< | e g e g | a >c a c< | e g e g | a >c a c< | e g e g | d f d f | a >c a c<",
      noise: "l8 [v4 x r v2 x x v3 X4 v2 x r]7 | v4 x r x r v3 X4 r"
    },
    {
      bpm: 100,
      p1: "@1 v10 o5 l8" +
        "| g4 f4 d4 b-4 | g4 a4 b-4. r | >c4 b-4 g4 f4 | d4 f4 g4. r" +
        "| g4 b-4 >c4 <b-4 | g4 f4 d4. r | e4 g4 f4 e4 | d2. r4",
      p2: "@0 v6 o3 l8" +
        "| r g b- >d< r b- >d< b- | r g b- >d< r b- >d< b- | r e g >c< r g >c< g | r d f a r f a f" +
        "| r g b- >d< r b- >d< b- | r g b- >d< r b- >d< b- | r c e g r e g e | r d f a r d f d",
      tri: "v11 o2 l4 | g >d g d< | g >d g d< | <c g >c< g | d a >d< a | g >d g d< | g >d g d< | c g >c< g | d a >d< a",
      noise: "l8 [v4 x r v3 x x v5 X4 v3 x r]7 | v4 x x v5 X4 r2"
    },
    {
      bpm: 112,
      p1: "@1 v10 o4 l8" +
        "| e4 g4 b4 a4 | g4 e4 d4. r | e4 g4 a4 b4 | >c4 b4 a4. r" +
        "| e4 g4 b4 a4 | g4 f+4 e4. r | d4 e4 g4 f+4 | e2. r4",
      p2: "@0 v6 o3 l8" +
        "| r e g b r g b g | r e g b r g b g | r e a >c< r a >c< a | r d f+ a r f+ a f+" +
        "| r e g b r g b g | r e g b r g b g | r d f+ a r d f+ d | r e g b r e g e",
      tri: "v12 o2 l4 | e b e b | e b e b | a >e a e< | d a >d< a | e b e b | e b e b | d a >d< a | e b e b",
      noise: "l8 [v4 x r v3 x x v5 X4 v3 x r]7 | v4 x x v5 X4 v3 x x"
    },
    {
      bpm: 76,
      p1: "@1 v9 o4 l8" +
        "| c4 e-4 g4 f4 | e-4 d4 c4. r | c4 e-4 f4 g4 | b-4 g4 f4. r" +
        "| c4 e-4 g4 >c4 | <b-4 g4 e-4. r | f4 e-4 d4 c4 | c2. r4",
      p2: "@0 v5 o3 l8" +
        "| r c e- g r e- g e- | r c e- g r e- g e- | r f a- >c< r a- >c< a- | r e- g b- r g b- g" +
        "| r c e- g r e- g e- | r c e- g r e- g e- | r d f a- r d f d | r c e- g r c e- c",
      tri: "v11 o2 l4 | c g c g | c g c g | f >c f c< | e- b- e- b- | c g c g | c g c g | d a- >d< a- | c g c g",
      noise: "l8 [v3 x r r v2 x r]7 | v3 X4 r2"
    },
    {
      bpm: 72,
      p1: "@1 v9 o4 l8" +
        "| d4 f4 a4 g4 | f4 e4 d4. r | d4 f4 g4 a4 | >c4 <a4 g4. r" +
        "| d4 f4 a4 >d4 | <c4 a4 f4. r | g4 f4 e4 d4 | d2. r4",
      p2: "@0 v5 o3 l8" +
        "| r d f a r f a f | r d f a r f a f | r d g b- r g b- g | r e g >c< r g >c< g" +
        "| r d f a r f a f | r d f a r f a f | r c e g r c e c | r d f a r d f d",
      tri: "v11 o2 l4 | d a d a | d a d a | <b- >f b- f< | c g >c< g | d a d a | d a d a | c g >c< g | d a d a",
      noise: "l8 [v3 X4 r r v2 x r]7 | v3 X4 r2"
    }
  ],
  battle: {
    bpm: 150,
    p1: "@1 v11 o4 l8" +
      "| a4 >c4< a4 e4 | a4 >c4 d4 c4 | <a4 >c4< a4 e4 | g4 a4 b4. r" +
      "| a4 >c4< a4 e4 | a4 >c4 d4 c4 | <g4 b4 >d4< b4 | a2. r4",
    p2: "@0 v7 o3 l8" +
      "| r a >c< r a >c< a | r a >c< r a >c< a | r a >c< r a >c< a | r g b r g b g" +
      "| r a >c< r a >c< a | r a >c< r a >c< a | r g b r g b g | r a >c< r a >c< a",
    tri: "v13 o2 l4 | a >e a e< | a >e a e< | a >e a e< | g >d g d< | a >e a e< | a >e a e< | g >d g d< | a >e a e<",
    noise: "l8 [v6 x r v4 x x v7 X4 v4 x r]7 | v6 x x v7 X4 v4 x x"
  },
  boss: {
    bpm: 132,
    p1: "@1 v11 o4 l8" +
      "| d4 e-4 d4 a4 | f4 e-4 d4. r | d4 e-4 f4 g4 | a4 b-4 a4. r" +
      "| d4 e-4 d4 a4 | f4 e-4 d4. r | g4 f4 e-4 d4 | d2. r4",
    p2: "@0 v7 o3 l8" +
      "| r d f a r f a f | r d f a r f a f | r d g b- r g b- g | r e- a >c< r a >c< a" +
      "| r d f a r f a f | r d f a r f a f | r d g b- r d g d | r d f a r d f d",
    tri: "v13 o2 l4 | d a d a | d a d a | <b- >f b- f< | e- b- e- b- | d a d a | d a d a | g >d g d< | d a d a",
    noise: "l8 [v6 X4 v4 x x v7 X4 v5 x x]7 | v6 X4 v5 x x v7 X8"
  },
  ending: {
    bpm: 70,
    p1: "@1 v10 o5 l8" +
      "| f4 e4 d4 c4 | d4 f4 a4. r | g4 f4 e4 d4 | c4 d4 f4. r" +
      "| a4 g4 f4 e4 | d4 c4 d4. r | f4 e4 d4 c4 | f2. r4",
    p2: "@0 v6 o3 l8" +
      "| r f a >c< r a >c< a | r f a >c< r a >c< a | r e g b- r g b- g | r d f a r f a f" +
      "| r f a >c< r a >c< a | r d f a r f a f | r e g b- r d g d | r f a >c< r f a f",
    tri: "v11 o2 l4 | f >c f c< | f >c f c< | e- b- e- b- | d a >d< a | f >c f c< | d a >d< a | e- b- e- b- | f >c f c<",
    noise: "l8 [v2 x r r v1 x r]7 | v3 X4 r2"
  }
};
/* a few sounds of our own; the named ones (tap, move, hit, ...) are in the runtime */
PT.SFX = {
  step: { wave: "noise", from: 500, to: 220, ms: 45, attack: 1, decay: 40, vol: 0.22 },
  bump: { wave: "square", duty: 0, from: 180, to: 120, ms: 55, vol: 0.4 },
  door: { wave: "square", duty: 2, from: 220, to: 520, ms: 180, attack: 4, decay: 150, vol: 0.5 },
  secret: { wave: "square", duty: 1, from: 700, to: 1500, ms: 220, attack: 2, decay: 200, vol: 0.45, vibrato: { depth: 0.4, rate: 9 } },
  gem: { wave: "square", duty: 3, from: 900, to: 1800, ms: 130, attack: 2, decay: 110, vol: 0.5 },
  potion: { wave: "triangle", from: 300, to: 800, ms: 240, attack: 10, decay: 200, vol: 0.55 },
  key: { wave: "square", duty: 1, from: 1200, to: 1700, ms: 110, attack: 1, decay: 90, vol: 0.5 },
  gold: { wave: "square", duty: 3, from: 1500, to: 2100, ms: 90, attack: 1, decay: 75, vol: 0.4 },
  hit: { wave: "noise", from: 1200, to: 220, ms: 130, attack: 1, decay: 110, vol: 0.55 },
  hurt: { wave: "noise", from: 300, to: 90, ms: 260, attack: 2, decay: 240, vol: 0.65 },
  bossHurt: { wave: "noise", from: 420, to: 60, ms: 500, attack: 10, decay: 450, vol: 0.8 },
  win: { wave: "square", duty: 2, from: 520, to: 1040, ms: 300, attack: 5, decay: 270, vol: 0.55 },
  lose: { wave: "triangle", from: 320, to: 80, ms: 700, attack: 10, decay: 650, vol: 0.6 },
  heal: { wave: "triangle", from: 500, to: 1200, ms: 380, attack: 30, decay: 330, vol: 0.5, vibrato: { depth: 0.3, rate: 5 } },
  save: { wave: "square", duty: 1, from: 660, to: 990, ms: 200, attack: 5, decay: 170, vol: 0.4 },
  buy: { wave: "square", duty: 3, from: 1000, to: 1500, ms: 120, attack: 2, decay: 100, vol: 0.45 },
  denied: { wave: "square", duty: 0, from: 220, to: 160, ms: 160, attack: 2, decay: 140, vol: 0.45 },
  flame: { wave: "noise", from: 900, to: 200, ms: 800, attack: 80, decay: 700, vol: 0.5 },
  page: { wave: "noise", from: 1800, to: 700, ms: 120, attack: 2, decay: 100, vol: 0.3 },
  encounter: { wave: "square", duty: 2, from: 260, to: 880, ms: 220, attack: 3, decay: 190, vol: 0.48 }
};
