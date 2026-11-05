/* Sisyphus: original chip music (MIT). D Dorian on the way up, D Aeolian on the way down;
   the descent is the same motif heard backwards. MML is described in SPEC.md 6.3. */
var MUSIC = {
  /* 60 bpm, about 55 s: a low drone, a slow call, a stone heartbeat. */
  ascent1: { bpm: 60,
    p1: "@1 v8 o4 l2 d2 a2 f2 e2 d2 r2 | d2 f2 a2 g2 f2 e2 d2 r2 | f2 e2 d2 c2 d2 e2 f2 r2 | d4 r2 a2 g2 f2 e2",
    p2: "@2 v4 o3 l8 [d f a >d< a f d f]2 | [g b d >g< d b g b]2 | [c e g >c< g e c e]2 | [d f a >d< a f d f]2",
    tri: "v10 o2 l2 d2 a2 g2 d2 | c2 g2 d2 a2 | b-2 f2 c2 g2 | d2 a2 d2 r2",
    noise: "l4 v2 x r v1 x r v2 x r v1 x r | v2 x r v1 x r v3 X4 r r | v2 x r v1 x r v2 x r v1 x r | v3 X4 r v2 x r v1 x r"
  },

  /* 66 bpm, about 29 s: the same mountain, closer, with a pulse. */
  ascent2: { bpm: 66,
    p1: "@1 v10 o5 l4 d4 e4 f4 a4 | g4 f4 e4 d4 | f4 g4 a4 >c4 | <b4 a4 g4 f4 | d4 e4 f4 a4 | >d4 c4 <b4 a4 | g4 f4 e4 d4 | d2 r2",
    p2: "@0 v5 o3 l8 [d f a >d< a f d f]4 | [g b d >g< d b g b]4 | [c e g >c< g e c e]4 | [d f a >d< a f d f]4",
    tri: "v11 o2 l4 d2 a2 | b-2 f2 | c2 g2 | d2 a2 | d2 a2 | b-2 f2 | c2 g2 | d2 r2",
    noise: "l8 v4 x r v2 x x v3 X4 v2 x r | v4 x r v2 x x v3 X4 v2 x r | v4 x r v2 x x v3 X4 v2 x r | v4 X4 r r v2 x r v3 X4 | v4 x r v2 x x v3 X4 v2 x r | v4 x r v2 x x v3 X4 v2 x r | v4 x r v2 x x v3 X4 v2 x r | v5 X2 r2"
  },

  /* 52 bpm, about 32 s: the ascent motif in reverse, in Aeolian. The night walk. */
  descent: { bpm: 52,
    p1: "@2 v7 o4 l2 d2 e2 f2 a2 d2 r2 | c2 b-2 a2 g2 f2 e2 d2 r2",
    p2: "@0 v4 o3 l4 a2 f2 d2 a2 | g2 e2 c2 e2",
    tri: "v10 o2 l2 d2 a2 b-2 f2 | g2 d2 a2 d2",
    noise: "l2 v1 x r | v1 x r"
  }
};
