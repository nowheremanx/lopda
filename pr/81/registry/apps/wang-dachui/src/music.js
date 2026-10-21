/* wang-dachui / music.js — four original loops and a handful of sounds.
 *
 * The title theme is a slow A-minor pentatonic tune; the school is a brass-band
 * march; the alley is a low, sparse drone; the endings are a warm F-major answer.
 * All four are written for this app (MIT). The MML rules are in SPEC.md 6.3.
 */

var MUSIC = {
  /* 76 bpm, A minor, 8 bars. The rain is the ambience; this is the tune above it. */
  title: {
    bpm: 76,
    p1: "@1 v9 o4 l8 a4 c8 e8 d4 c4 | a4. g8 e4 d4 | c4 d8 e8 g4 e4 | d2. r4" +
        "| a4 c8 e8 g4 e4 | d4 c8 a4. g8 e8 | e4 g8 a8 c4 a4 | a2. r4",
    p2: "@0 v5 o3 l8 a8 c8 e8 c8 a8 c8 e8 c8 | f8 a8 c8 a8 f8 a8 c8 a8" +
        "| c8 e8 g8 e8 c8 e8 g8 e8 | d8 f8 a8 f8 d8 f8 a8 f8" +
        "| a8 c8 e8 c8 a8 c8 e8 c8 | f8 a8 c8 a8 f8 a8 c8 a8" +
        "| e8 g8 b8 g8 e8 g8 b8 g8 | a8 c8 e8 c8 a8 c8 e8 c8",
    tri: "v10 o2 l4 a2 e2 | f2 c2 | c2 g2 | d2 a2 | a2 e2 | f2 c2 | e2 b2 | a2 e2",
    noise: "l8 [v3 x r r r v2 x r r r]8"
  },

  /* 116 bpm, C major, a schoolyard march with a snare. */
  school: {
    bpm: 116,
    p1: "@2 v10 o4 l8 c4 e4 g4 e4 | c4 e4 g4 >c4 | <g4 a4 g4 e4 | d2 r4" +
        "| c4 e4 g4 e4 | a4 g4 e4 d4 | c4 d4 e4 g4 | c2 r4",
    p2: "@0 v6 o3 l8 c8 r8 e8 r8 g8 r8 e8 r8 | c8 r8 e8 r8 g8 r8 >c8 r8" +
        "| <g8 r8 b8 r8 g8 r8 e8 r8 | d8 r8 f8 r8 a8 r8 f8 r8" +
        "| c8 r8 e8 r8 g8 r8 e8 r8 | f8 r8 a8 r8 c8 r8 a8 r8" +
        "| c8 r8 e8 r8 g8 r8 e8 r8 | c8 r8 e8 r8 g8 r8 e8 r8",
    tri: "v11 o2 l4 c2 g2 | c2 g2 | g2 d2 | d2 g2 | c2 g2 | f2 c2 | c2 g2 | c2 g2",
    noise: "l8 [v4 x r v2 x x v5 X4 v2 x r]8"
  },

  /* 62 bpm, D minor, the hutong at night. */
  alley: {
    bpm: 62,
    p1: "@1 v8 o4 l4 d4. f4 | e4. d4 | a4. g4 | f2 r2 | d4. f4 | e4. c4 | d4 a4 | d2 r2",
    p2: "@0 v4 o3 l2 d2 | a2 | f2 | d2 | d2 | c2 | a2 | d2",
    tri: "v9 o2 l2 d2 | a2 | f2 | d2 | d2 | c2 | a2 | d2",
    noise: "l8 [v2 x r r r r r r r]8"
  },

  /* 72 bpm, F major, the answer. */
  end: {
    bpm: 72,
    p1: "@1 v9 o4 l8 f4 a4 c4 a4 | g4 f4 e4 c4 | d4 f4 a4 g4 | f2. r4" +
        "| f4 a4 c4 >c4 | <a4 g4 f4 e4 | e4 g4 a4 c4 | f2. r4",
    p2: "@0 v5 o3 l8 f8 a8 c8 a8 f8 a8 c8 a8 | c8 e8 g8 e8 c8 e8 g8 e8" +
        "| d8 f8 a8 f8 d8 f8 a8 f8 | f8 a8 c8 a8 f8 a8 c8 a8" +
        "| f8 a8 c8 a8 f8 a8 c8 a8 | c8 e8 g8 e8 c8 e8 g8 e8" +
        "| e8 g8 b8 g8 e8 g8 b8 g8 | f8 a8 c8 a8 f8 a8 c8 a8",
    tri: "v10 o2 l4 f2 c2 | c2 g2 | d2 a2 | f2 c2 | f2 c2 | c2 g2 | e2 b2 | f2 c2",
    noise: "l8 [v2 x r r r v1 x r r r]8"
  }
};

/* Named sounds the story asks for; the rest are the runtime's own tap/ok/move. */
var SFX = {
  punch: { wave: "noise", from: 900, to: 120, ms: 180, attack: 5, decay: 175, vol: 0.8 },
  basin: { wave: "square", duty: 0, from: 1600, to: 1050, ms: 260, attack: 1, decay: 240, vol: 0.35 },
  door: { wave: "noise", from: 320, to: 90, ms: 220, attack: 2, decay: 200, vol: 0.5 },
  wave: { wave: "noise", from: 220, to: 700, ms: 520, attack: 90, decay: 400, vol: 0.45 },
  low: { wave: "triangle", from: 130, to: 60, ms: 650, attack: 20, decay: 600, vol: 0.5 },
  train: { wave: "triangle", from: 95, to: 70, ms: 900, attack: 180, decay: 650, vol: 0.35 }
};
