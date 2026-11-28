/* Original MML loops, written for this game. D minor / A minor / F major. */
var MUSIC = {
  shop: {
    bpm: 76,
    p1: "@1 v9 o4 l8 | d4 f4 a4 g4 | f4 e4 d4 r | d4 f4 g4 a4 | c4 a4 g4 f4" +
        " | d4 f4 a4 >d4 | <c4 a4 f4 r | g4 f4 e4 d4 | d2. r4",
    p2: "@0 v5 o3 l8 | r d f a r f a f | r d f a r f a f | r d g b- r g b- g | r e g >c< r g >c< g" +
        " | r d f a r f a f | r d f a r f a f | r c e g r e g e | r d f a r d f d",
    tri: "v10 o2 l4 | d a d a | d a d a | b- >f b- f | c g >c< g | d a d a | d a d a | c g >c< g | d a d a",
    noise: "l8 [v3 x r r v2 x r]7 | v3 X4 r2"
  },
  forest: {
    bpm: 70,
    p1: "@1 v8 o4 l8 | g4 b-4 d4 c4 | b-4 a4 g4 r | g4 b-4 c4 d4 | f4 d4 c4 b-4" +
        " | g4 b-4 d4 c4 | b-4 a4 g4 r | d4 f4 g4 a4 | g2. r4",
    p2: "@0 v4 o3 l8 | r g b- >d< r b- >d< b- | r g b- >d< r b- >d< b- | r a >c< e r a >c< a | r f a >c< r a >c< a" +
        " | r g b- >d< r b- >d< b- | r g b- >d< r b- >d< b- | r d f a r f a f | r g b- >d< r g b- g",
    tri: "v9 o2 l4 | g >d g d< | g >d g d< | a >e a e< | f >c f c< | g >d g d< | g >d g d< | d a >d< a | g >d g d<",
    noise: "l8 [v2 x r r v2 x r]7 | v2 X4 r2"
  },
  service: {
    bpm: 96,
    p1: "@1 v10 o4 l8 | a4 >c4< a4 g4 | e4 g4 a4 r | a4 >c4 d4 c4 | <a4 g4 e4 r" +
        " | a4 >c4< a4 g4 | e4 g4 a4 r | d4 e4 g4 e4 | a2. r4",
    p2: "@0 v5 o3 l8 | r a >c< r a >c< a | r e g r e g e | r a >c< r a >c< a | r e g r e g e" +
        " | r a >c< r a >c< a | r e g r e g e | r d f a r d f d | r a >c< r a >c< a",
    tri: "v10 o2 l4 | a >c a c< | e g e g | a >c a c< | e g e g | a >c a c< | e g e g | d f d f | a >c a c<",
    noise: "l8 [v2 x r r v2 x r]7 | v2 X4 r2"
  },
  battle: {
    bpm: 144,
    p1: "@1 v10 o4 l8 | a4 >c4 d4 c4 | <a4 e4 a4 r | g4 a4 >c4 d4 | e4 d4 c4 r" +
        " | a4 >c4 d4 c4 | <a4 e4 a4 r | d4 e4 g4 e4 | a4 r r4",
    p2: "@0 v6 o3 l8 | r a >c< r a >c< a | r e g r e g e | r g >c< r g >c< g | r e g r e g e" +
        " | r a >c< r a >c< a | r e g r e g e | r d f r d f d | r a >c< r a >c< a",
    tri: "v11 o2 l4 | a >c a c< | e g e g | g >c g c< | e g e g | a >c a c< | e g e g | d f d f | a >c a c<",
    noise: "l8 [v4 x r v3 x x]7 | v5 X4 r2"
  },
  night: {
    bpm: 66,
    p1: "@1 v7 o4 l8 | f4 a4 c4 r | d4 c4 a4 r | b-4 a4 g4 f4 | g2. r4" +
        " | f4 a4 c4 r | d4 c4 a4 r | g4 f4 e4 d4 | f2. r4",
    p2: "@0 v4 o3 l8 | r f a >c< r a >c< a | r d f a r f a f | r b- >d< f r d f d | r c e g r e g e" +
        " | r f a >c< r a >c< a | r d f a r f a f | r g b- >d< r b- >d< b- | r f a >c< r f a f",
    tri: "v9 o2 l4 | f >c f c< | d a >d< a | b- >f b- f | c g >c< g | f >c f c< | d a >d< a | g >d g d< | f >c f c<",
    noise: "l8 [v2 x r r v2 x r]7 | v2 X4 r2"
  },
  ending: {
    bpm: 60,
    p1: "@1 v8 o4 l8 | f4 a4 c4 r | d4 c4 a4 r | b-4 a4 g4 f4 | g2. r4" +
        " | f4 a4 c4 r | d4 c4 a4 r | g4 f4 e4 d4 | f2. r4",
    p2: "@0 v4 o3 l8 | r f a >c< r a >c< a | r d f a r f a f | r b- >d< f r d f d | r c e g r e g e" +
        " | r f a >c< r a >c< a | r d f a r f a f | r g b- >d< r b- >d< b- | r f a >c< r f a f",
    tri: "v9 o2 l4 | f >c f c< | d a >d< a | b- >f b- f | c g >c< g | f >c f c< | d a >d< a | g >d g d< | f >c f c<",
    noise: "l8 [v2 x r r v2 x r]7 | v2 X4 r2"
  }
};

var MUSIC_NOW = null;
function playMusic(id) {
  if (MUSIC_NOW === id) return;
  MUSIC_NOW = id;
  if (typeof MUSIC !== "undefined" && MUSIC[id]) game.music(MUSIC[id]);
}
function stopMusic() {
  MUSIC_NOW = null;
  game.musicStop();
}
