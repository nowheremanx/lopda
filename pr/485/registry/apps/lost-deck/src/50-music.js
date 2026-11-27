/* Lost Deck: music. All four scores are original (written for this game). MIT License. */
(function () {
  "use strict";
  var LD = window.LD;
  LD.MUSIC = {
    /* the title: a slow tune in E minor over a soft arpeggio */
    title: { bpm: 72,
      p1: "@2 v7 o4 l4 e2. d | c2 <b2 | a1 | r2 >e g | f+2. e | d+2 e2 | <b1 | r1",
      p2: "@1 v4 o4 l8 [e g b g]2 [c e g e]2 [<a >c e c]2 [e g b g]2 [<b >d+ f+ d+]2 [<b >d+ f+ d+]2 [<b >d+ f+ d+]2 [e g b g]2",
      tri: "v11 o2 l1 e c <a >e <b b b >e" },
    /* on a deck: a low ostinato, ticking noise and a few far-off notes */
    deck: { bpm: 100,
      p1: "@0 v4 o4 l1 r r b- a r r g f+",
      tri: "v12 o2 l8 [e r e r e g r e | e r e r b- a g r]4",
      noise: "l8 [v3 x r v2 x r v5 X r v2 x r]8" },
    /* the core */
    boss: { bpm: 132,
      p1: "@1 v7 o4 l4 [e g a b- | a g e d]2 [e g b >c< | b- a g e]2",
      p2: "@2 v4 o3 l2 [e d c d]4",
      tri: "v13 o2 l8 [e e >e< e d d >d< d | c c >c< c d d >d< d]4",
      noise: "l8 [v6 X v3 x v5 x v3 x v6 X v3 x v6 X v3 x]8" },
    /* a deck cleared */
    clear: { bpm: 140,
      p1: "@2 v9 o4 l8 e g b >e4 d+ e2",
      tri: "v10 o2 l4 e b >e2" }
  };
  LD.ENDING = {
    zh: ["核心停了。", "曙光七号的灯一盏一盏亮回来。", "机器人停在原地，像在发呆。", "通讯台响了一声：", "“这里是曙光七号，我们还在。”", "谢谢游玩"],
    en: ["The core is down.", "Dawn-7's lights come back one by one.", "The robots stand still, as if lost in thought.", "The radio crackles:", "\"Dawn-7 here. We are still here.\"", "Thanks for playing"]
  };
})();
