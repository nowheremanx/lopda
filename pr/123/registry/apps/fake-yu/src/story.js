/* fake-yu / story.js — the court, the liar and the ten songs.
 *
 * Three acts: King Xuan's ensemble, King Min's solos, and the night Nan Guo has to play
 * something true. Every chapter gives the song a reason to exist; the last choice decides
 * which of four endings the player sees. Text is short enough for one dialog box.
 *
 * MIT License. Copyright (c) 2026 Haowei Wu.
 */

var STORY = (function () {
  "use strict";

  var CAST = {
    narr: { name: { zh: "旁白", en: "Narrator" }, color: "dark" },
    nanguo: { name: { zh: "南郭", en: "Nan Guo" }, color: "ink" },
    xuan: { name: { zh: "齐宣王", en: "King Xuan" }, color: "ink" },
    min: { name: { zh: "齐湣王", en: "King Min" }, color: "ink" },
    yuezheng: { name: { zh: "乐正", en: "Music Master" }, color: "dark" },
    aqin: { name: { zh: "阿琴", en: "Aqin" }, color: "ink" },
    guard: { name: { zh: "侍卫", en: "Guard" }, color: "dark" }
  };

  var ACTS = [
    {
      n: 1, venue: "hall",
      title: { zh: "第一幕 · 三百人", en: "Act I · Crowd" },
      sub: { zh: "宣王的合奏殿", en: "King Xuan's hall" },
      color: { zh: "人多，热闹。多一个，谁知道？", en: "A crowd is a wonderful place to hide." }
    },
    {
      n: 2, venue: "throne",
      title: { zh: "第二幕 · 一个人", en: "Act II · One Man" },
      sub: { zh: "湣王的独奏殿", en: "King Min's court" },
      color: { zh: "父王听合奏。寡人，只听独奏。", en: "My father liked the ensemble. I listen to solos." }
    },
    {
      n: 3, venue: "night",
      title: { zh: "第三幕 · 一支真曲", en: "Act III · One Tune" },
      sub: { zh: "宫墙下的夜", en: "The wall at night" },
      color: { zh: "装到最后，总得有一句是真的。", en: "Even a liar needs one true note." }
    }
  ];

  var CHAPTERS = [
    {
      song: "twinkle",
      before: [
        { who: "narr", text: { zh: "齐宣王爱听合奏。宫里养了三百名乐师，谁也不许少。", en: "King Xuan loved a full orchestra. Three hundred players, and not one may be missing." } },
        { who: "yuezheng", text: { zh: "新来的？站最后一排。会吹竽的，留下。", en: "New? Back row. If you can play the sheng, stay." } },
        { who: "nanguo", mood: "sly", text: { zh: "会。当然会。", en: "I can. Of course I can." } },
        { who: "narr", text: { zh: "他把竽拿反了。好在，三百个人一起吹。", en: "He held the sheng backwards. Luckily, three hundred people were playing at once." } }
      ],
      after: [
        { who: "narr", text: { zh: "一曲终了，宣王点头。南郭领到了第一份俸禄。", en: "The piece ended. The king nodded. Nan Guo collected his first pay." } },
        { who: "nanguo", mood: "sly", text: { zh: "三百个人一起吹，谁听得出来？", en: "With three hundred players, who can tell?" } },
        { who: "aqin", mood: "worried", text: { zh: "……你的竽，拿反了。", en: "...Your sheng is backwards." } },
        { who: "nanguo", text: { zh: "嘘。明天我换过来。", en: "Shh. I'll turn it around tomorrow." } }
      ]
    },
    {
      song: "ode",
      interlude: [
        { who: "narr", text: { zh: "排练前，最后一排的老乐师把南郭往角落里拉，教他一个诀窍。", en: "Before rehearsal, the oldest player in the back row pulled Nan Guo aside and taught him a trick." } },
        { who: "narr", text: { zh: "站得靠后，嘴型要夸张，眼睛要看着指挥。", en: "Stand far back, move your lips, and keep your eyes on the conductor." } },
        { who: "nanguo", text: { zh: "那要是王上走过来呢？", en: "And if the king walks over?" } },
        { who: "narr", text: { zh: "老乐师说：那就装作在换气。换气不需要声音。", en: "The old player said: pretend to breathe. Breathing makes no sound." } },
        { who: "nanguo", mood: "sly", text: { zh: "这宫里，连换气都有学问。", en: "In this court, even breathing is a skill." } }
      ],
      before: [
        { who: "aqin", mood: "worried", text: { zh: "你的指法在装。你根本不会吹。", en: "Your fingers are pretending. You cannot play at all." } },
        { who: "nanguo", text: { zh: "大家都这么干。你看那边，他连竽都没带。", en: "Everyone does it. Look, that one did not even bring a sheng." } },
        { who: "aqin", text: { zh: "……别让乐正看见。", en: "...Don't let the Music Master see." } }
      ],
      after: [
        { who: "yuezheng", text: { zh: "南郭，明天站中间。王上点名要听你那一排。", en: "Nan Guo, stand in the middle tomorrow. The king asked for your row." } },
        { who: "nanguo", mood: "worried", text: { zh: "中间？那不是更危险？", en: "The middle? Isn't that worse?" } },
        { who: "aqin", text: { zh: "是更响。你至少得学会换气。", en: "It is louder. At least learn to breathe." } },
        { who: "nanguo", text: { zh: "换气我会。吹不会。", en: "I can breathe. I cannot play." } }
      ]
    },
    {
      song: "greensleeves",
      before: [
        { who: "narr", text: { zh: "春天，宣王在花园设宴。乐师们换了新谱。", en: "Spring. The king held a garden feast, and the orchestra received a new score." } },
        { who: "nanguo", mood: "worried", text: { zh: "这谱上怎么这么多圈？是休止，还是虫子咬的？", en: "Why so many circles? Rests, or worms?" } },
        { who: "aqin", mood: "sly", text: { zh: "那是反复记号。你完了。", en: "Those are repeats. You're finished." } },
        { who: "nanguo", text: { zh: "你也完了。你站我旁边。", en: "So are you. You're standing next to me." } }
      ],
      after: [
        { who: "xuan", mood: "happy", text: { zh: "好！赏。南郭，你吹得最有感情。", en: "Splendid! A reward. Nan Guo, yours had the most feeling." } },
        { who: "nanguo", mood: "sly", text: { zh: "谢王上。（我吹的是空气。）", en: "Thank you, sire. (I was playing air.)" } },
        { who: "aqin", mood: "worried", text: { zh: "王上，他……", en: "Sire, he..." } },
        { who: "nanguo", text: { zh: "阿琴，别。明天我请你吃糖。", en: "Aqin, don't. Sweets tomorrow, I promise." } }
      ]
    },
    {
      song: "canon",
      interlude: [
        { who: "yuezheng", text: { zh: "南郭，你知道我为什么让你当副手吗？", en: "Nan Guo, do you know why I made you deputy?" } },
        { who: "nanguo", text: { zh: "因为我吹得好？", en: "Because I play well?" } },
        { who: "yuezheng", text: { zh: "因为你欠我一个人情。一个不会吹的副手，比一个会吹的副手好用。", en: "Because you owe me. A deputy who cannot play is more useful than one who can." } },
        { who: "nanguo", mood: "worried", text: { zh: "……乐正，您到底知道多少？", en: "...Music Master, how much do you know?" } },
        { who: "yuezheng", text: { zh: "我知道的，刚好够让你睡不着。", en: "Enough to keep you awake." } }
      ],
      before: [
        { who: "yuezheng", text: { zh: "王上要立你当乐正副手。以后你带新人。", en: "The king will make you deputy Music Master. You will train the new players." } },
        { who: "nanguo", mood: "worried", text: { zh: "带新人？我连自己都带不明白。", en: "Train them? I cannot even train myself." } },
        { who: "aqin", text: { zh: "我可以帮你。但你得答应我一件事：学一支真曲。", en: "I can help. Promise me one thing: learn one real tune." } },
        { who: "nanguo", text: { zh: "等忙完这阵子。", en: "After this busy spell." } }
      ],
      after: [
        { who: "narr", text: { zh: "南郭有了院子、仆人和一柜子不会翻的乐谱。", en: "Nan Guo gained a courtyard, a servant, and a shelf of scores he could not read." } },
        { who: "nanguo", text: { zh: "阿琴，你教我哪支？", en: "Aqin, which tune will you teach me?" } },
        { who: "aqin", mood: "happy", text: { zh: "《小星星》。从最简单的开始。", en: "Twinkle. Start with the simplest." } },
        { who: "narr", text: { zh: "他学了三个音，然后睡着了。", en: "He learned three notes, then fell asleep." } },
        { who: "nanguo", text: { zh: "阿琴，明天开始。", en: "Aqin, I start tomorrow." } },
        { who: "aqin", text: { zh: "你昨天也说明天。", en: "You said that yesterday." } },
        { who: "narr", text: { zh: "那天夜里，他把竽放在枕边，像放一把借来的伞。", en: "That night he put the sheng by his pillow, like a borrowed umbrella." } },
        { who: "narr", text: { zh: "很多年后他会想起这个晚上。可当时，他只觉得日子有点长。", en: "Years later he would remember this night. At the time, he only thought the days were long." } }
      ]
    },
    {
      song: "mountain",
      interlude: [
        { who: "narr", text: { zh: "宣王的葬礼上，三百名乐师站成一片。新王一句话，乐队就散了。", en: "At King Xuan's funeral, three hundred players stood together. One word from the new king, and the orchestra scattered." } },
        { who: "nanguo", mood: "worried", text: { zh: "昨天还在一起吹，今天连个影子都没有。", en: "Yesterday we played together. Today there is not even a shadow." } },
        { who: "aqin", text: { zh: "合奏就是这样。人一散，谁也不会记得谁吹过什么。", en: "That is an ensemble. Once it scatters, no one remembers who played what." } },
        { who: "nanguo", text: { zh: "那我呢？", en: "And me?" } },
        { who: "aqin", mood: "sad", text: { zh: "你还在。所以你得吹。", en: "You are still here. So you have to play." } }
      ],
      before: [
        { who: "narr", text: { zh: "宣王去世。齐湣王即位。他第一句话是：寡人只听独奏。", en: "King Xuan died. King Min took the throne. His first words: I listen to solos." } },
        { who: "min", mood: "angry", text: { zh: "三百人一起吹，吹错了也没人知道。寡人不想被当傻子。", en: "In a crowd of three hundred, a wrong note hides. I will not be made a fool." } },
        { who: "yuezheng", text: { zh: "从南郭开始。", en: "Begin with Nan Guo." } },
        { who: "nanguo", mood: "worried", text: { zh: "我？王上，我最近嗓子……", en: "Me? Sire, my throat has been..." } },
        { who: "min", text: { zh: "吹。", en: "Play." } }
      ],
      after: [
        { who: "narr", text: { zh: "南郭吹完了。他不知道自己怎么吹完的。", en: "Nan Guo finished. He did not know how." } },
        { who: "min", text: { zh: "还行。下一首，快一点。", en: "Passable. The next one, faster." } },
        { who: "nanguo", mood: "worried", text: { zh: "（他听出来了？没有。他一定没听出来。）", en: "(Did he hear? No. He cannot have heard.)" } },
        { who: "aqin", text: { zh: "他听出来了。他只是在等你自己露馅。", en: "He heard. He is waiting for you to slip." } }
      ]
    },
    {
      song: "turkish",
      interlude: [
        { who: "narr", text: { zh: "前一天，一个年轻乐师在独奏时忘了谱。侍卫把他叉出去，竽掉在地上，响了一声。", en: "The day before, a young player forgot the score during a solo. The guard threw him out; his sheng hit the floor and rang once." } },
        { who: "nanguo", text: { zh: "那一声，比他一整年吹的都响。", en: "That one note was louder than anything he played all year." } },
        { who: "aqin", mood: "worried", text: { zh: "你还有心思开玩笑。", en: "You can still joke." } },
        { who: "nanguo", text: { zh: "我是在记住那个声音。万一哪天轮到我。", en: "I am memorising the sound. In case it is my turn." } }
      ],
      before: [
        { who: "aqin", text: { zh: "你昨晚在院子里练到天亮？", en: "You practised in the courtyard until dawn?" } },
        { who: "nanguo", mood: "worried", text: { zh: "我在练怎么把手指放对。阿琴，你为什么不揭穿我？", en: "I was learning where to put my fingers. Aqin, why not expose me?" } },
        { who: "aqin", mood: "sad", text: { zh: "因为你走了，他们就会让我独奏。", en: "Because if you leave, they will make me play alone." } },
        { who: "nanguo", text: { zh: "……这算理由吗？", en: "...Is that a reason?" } },
        { who: "aqin", text: { zh: "算。宫里每个人都需要一个比自己更差的人。", en: "It is. Every court needs someone worse than itself." } }
      ],
      after: [
        { who: "min", mood: "angry", text: { zh: "你的手在抖。寡人看得见。", en: "Your hands are shaking. I can see them." } },
        { who: "nanguo", text: { zh: "王上，那是因为……曲子太难。", en: "Sire, because... the piece is hard." } },
        { who: "min", text: { zh: "难？寡人还没点《山魔王》呢。", en: "Hard? I have not even called for Mountain King." } },
        { who: "nanguo", mood: "worried", text: { zh: "（刚才那首就是《山魔王》。）", en: "(That was Mountain King.)" } },
        { who: "aqin", text: { zh: "他今天没赶你走。", en: "He did not throw you out today." } },
        { who: "nanguo", mood: "worried", text: { zh: "那他什么时候会？", en: "When will he?" } },
        { who: "aqin", text: { zh: "等你吹得最好的时候。", en: "When you play your best." } }
      ]
    },
    {
      song: "swan",
      interlude: [
        { who: "narr", text: { zh: "宫里人说，湣王小时候也在三百人的乐队里站过。他吹错了一个音，没人听见。", en: "They say King Min once stood in the three-hundred-player orchestra. He played a wrong note, and no one heard." } },
        { who: "min", text: { zh: "寡人那时候就知道，人多的地方，错的不算错。", en: "I learned then that in a crowd, a wrong note does not count." } },
        { who: "narr", text: { zh: "后来他做了王，第一件事就是让所有人一个一个吹。", en: "When he became king, the first thing he did was make everyone play alone." } },
        { who: "nanguo", mood: "worried", text: { zh: "（所以他不是讨厌我。他是讨厌那三百个人。）", en: "(So he does not hate me. He hates the three hundred.)" } }
      ],
      before: [
        { who: "narr", text: { zh: "夜里，宫里安静得能听见灯芯烧焦的声音。", en: "At night the palace was quiet enough to hear a wick burn." } },
        { who: "nanguo", text: { zh: "阿琴，如果我现在跑，能跑多远？", en: "Aqin, if I ran now, how far would I get?" } },
        { who: "aqin", text: { zh: "宫门有三道。你连第一道都过不去。", en: "Three gates. You would not pass the first." } },
        { who: "nanguo", text: { zh: "那我只好继续吹了。", en: "Then I had better keep playing." } },
        { who: "aqin", mood: "sad", text: { zh: "……我教你。只教一遍。", en: "...I will teach you. Once." } }
      ],
      after: [
        { who: "min", text: { zh: "南郭，你今晚吹得比昨天好。", en: "Nan Guo, you played better tonight than yesterday." } },
        { who: "nanguo", text: { zh: "谢王上。", en: "Thank you, sire." } },
        { who: "min", mood: "angry", text: { zh: "好得不像你。明晚，吹《匈牙利舞曲》。寡人要听见你的手。", en: "Too good to be you. Tomorrow: the Hungarian Dance. I want to hear your hands." } },
        { who: "aqin", text: { zh: "他起疑了。", en: "He suspects." } },
        { who: "nanguo", text: { zh: "他早就起疑了。他只是喜欢看。", en: "He has always suspected. He simply enjoys watching." } }
      ]
    },
    {
      song: "hungarian",
      before: [
        { who: "yuezheng", text: { zh: "王上在试探你。他故意点最快的曲子。", en: "The king is testing you. He chose the fastest piece on purpose." } },
        { who: "aqin", text: { zh: "记住我教你的指法。别看我，看谱。", en: "Remember the fingering. Don't look at me, look at the score." } },
        { who: "nanguo", text: { zh: "谱上的字在跳。", en: "The notes are jumping." } },
        { who: "aqin", mood: "happy", text: { zh: "那就跟着它们跳。", en: "Then dance with them." } }
      ],
      after: [
        { who: "min", text: { zh: "够了。明晚，寡人要你一个人，吹一支寡人没听过的曲子。", en: "Enough. Tomorrow you will play me a tune I have never heard. Alone." } },
        { who: "nanguo", mood: "worried", text: { zh: "……没听过的？", en: "...Never heard?" } },
        { who: "min", text: { zh: "你自己写的。写不出来，就去喂马。", en: "One of yours. If you cannot write it, feed the horses." } },
        { who: "narr", text: { zh: "南郭回到房里，对着一张白纸坐到天亮。", en: "Nan Guo sat before a blank page until dawn." } },
        { who: "aqin", text: { zh: "写吧。一个音也行。", en: "Write. One note is enough." } },
        { who: "nanguo", text: { zh: "一个音。要是我连一个音都写不出来呢？", en: "One note. What if I cannot write even one?" } },
        { who: "aqin", mood: "sad", text: { zh: "那就写你写不出来的那个晚上。", en: "Then write about the night you could not." } }
      ],
      postlude: [
        { who: "narr", text: { zh: "南郭回到房里，对着一张白纸坐到天亮。", en: "Nan Guo went back to his room and sat before a blank page until dawn." } },
        { who: "nanguo", text: { zh: "我写了一晚上，只写出一句话。", en: "I wrote all night. I got one line." } },
        { who: "aqin", text: { zh: "念给我听。", en: "Read it to me." } },
        { who: "nanguo", text: { zh: "“我不知道自己会不会吹。”", en: "\"I do not know whether I can play.\"" } },
        { who: "aqin", mood: "happy", text: { zh: "那就从这一句开始。", en: "Then start with that line." } }
      ]
    },
    {
      song: "elise",
      before: [
        { who: "narr", text: { zh: "那天夜里，南郭没有回房。他坐在宫墙下，第一次认真看一支谱。", en: "That night Nan Guo did not go to his room. He sat under the wall and read a score for the first time." } },
        { who: "aqin", text: { zh: "这是《致爱丽丝》。我小时候学的第一支曲子。", en: "Für Elise. The first piece I ever learned." } },
        { who: "nanguo", text: { zh: "我不是爱丽丝。", en: "I am not Elise." } },
        { who: "aqin", mood: "sad", text: { zh: "你也不是乐师。你是一个骗子。但骗子也可以学一支新曲子。", en: "You are not a musician either. You are a liar. But a liar can learn one new tune." } }
      ],
      after: [
        { who: "nanguo", text: { zh: "我吹完了。手是抖的，但每个音都是我自己按的。", en: "I finished. My hands shook, but every note was mine." } },
        { who: "min", text: { zh: "这不是你写的。", en: "You did not write that." } },
        { who: "nanguo", text: { zh: "不是。但我学会了。", en: "No. But I learned it." } },
        { who: "min", text: { zh: "明晚，寡人要听你自己写的。", en: "Tomorrow, I want one of yours." } },
        { who: "narr", text: { zh: "南郭低头看自己的手。那双手第一次没有发抖。", en: "Nan Guo looked at his hands. For the first time they were not shaking." } }
      ],
      choice: {
        title: { zh: "要对湣王说实话吗？", en: "Tell the king the truth?" },
        options: [
          { zh: "坦白：我不会吹竽", en: "Confess: I cannot play" },
          { zh: "继续装：我还能写", en: "Keep pretending: I can write" }
        ]
      }
    },
    {
      song: "serenade",
      interlude: [
        { who: "narr", text: { zh: "天快亮了。宫墙外的鸟开始叫，宫里一点声音也没有。", en: "Dawn was near. Birds began outside the wall; inside, there was no sound at all." } },
        { who: "nanguo", text: { zh: "阿琴，如果今天吹完，我还能回去吗？", en: "Aqin, after today, can I go back?" } },
        { who: "aqin", text: { zh: "回哪儿？", en: "Back where?" } },
        { who: "nanguo", text: { zh: "回最后一排。", en: "To the back row." } },
        { who: "aqin", mood: "sad", text: { zh: "你已经不在最后一排了。今天，你一个人。", en: "You are not in the back row anymore. Today you are alone." } }
      ],
      beforeTruth: [
        { who: "nanguo", mood: "sad", text: { zh: "王上，我不会吹竽。从来没有会过。这十年，我一直在假装。", en: "Sire, I cannot play the sheng. I never could. For ten years I have pretended." } },
        { who: "min", text: { zh: "寡人知道。从你第一次站到最后一排，寡人就知道。", en: "I know. I knew the first time you stood in the back row." } },
        { who: "nanguo", mood: "worried", text: { zh: "那您为什么……", en: "Then why..." } },
        { who: "min", text: { zh: "因为寡人想看看，一个骗子能装到什么时候。今晚，吹一支真的。", en: "Because I wanted to see how long a liar could last. Tonight, play something true." } }
      ],
      beforeLie: [
        { who: "nanguo", mood: "sly", text: { zh: "王上，这是我写的。很短。", en: "Sire, I wrote this. It is short." } },
        { who: "min", text: { zh: "短？寡人有的是时间。", en: "Short? I have all night." } },
        { who: "aqin", mood: "worried", text: { zh: "（他写的只有一句。剩下的是我补的。）", en: "(He wrote one line. I wrote the rest.)" } },
        { who: "nanguo", text: { zh: "（阿琴，别看我。）", en: "(Aqin, don't look at me.)" } }
      ],
      after: []
    }
  ];

  var ENDINGS = {
    trueSong: {
      art: "trueSong",
      title: { zh: "结局 · 一支真曲", en: "Ending · True Song" },
      pages: [
        { zh: "南郭吹完了那支短曲。殿里很安静。", en: "Nan Guo finished his short tune. The hall was silent." },
        { zh: "湣王没有赏他，也没有赶他。只说了一句：明天还来。", en: "The king did not reward him, nor banish him. He only said: come back tomorrow." },
        { zh: "后来，南郭跟着阿琴学了很多年。他吹得不好，但那是他自己的声音。", en: "For years after, Aqin taught him. He never played well, but the sound was his own." },
        { zh: "第二天，南郭又站在最后一排。这次他没有拿反竽。", en: "The next day Nan Guo stood in the back row again. This time he did not hold the sheng backwards." }
      ]
    },
    chief: {
      art: "chief",
      title: { zh: "结局 · 首席", en: "Ending · Chief" },
      pages: [
        { zh: "南郭成了宫廷首席乐师。三百个人跟着他吹。", en: "Nan Guo became First Musician of the court. Three hundred players followed him." },
        { zh: "他再也没有吹过一支真曲。每次合奏，他都站在最前面，听见的却只有别人的声音。", en: "He never played a true tune again. At every concert he stood in front, hearing only other people." },
        { zh: "很多年后，一个年轻人问他：先生，您是怎么学会吹竽的？", en: "Years later a young player asked: Master, how did you learn the sheng?" },
        { zh: "南郭笑了笑：人多的时候，别出声。", en: "Nan Guo smiled: in a crowd, keep quiet." },
        { zh: "他偶尔会梦见自己站在最后一排，没人看他。醒来时，台上只有他一个人。", en: "Sometimes he dreamed he was back in the last row, unseen. He woke to an empty stage." }
      ]
    },
    home: {
      art: "home",
      title: { zh: "结局 · 回乡", en: "Ending · Home" },
      pages: [
        { zh: "南郭被赶出了宫。他背着那支竽，走了三天三夜。", en: "Nan Guo was thrown out. He carried the sheng for three days and nights." },
        { zh: "村口的孩子问他会不会吹。他说不会。孩子们不信。", en: "Children at the village gate asked if he could play. He said no. They did not believe him." },
        { zh: "他吹了一个音。很难听。孩子们笑了。他也笑了。", en: "He played one note. It was awful. The children laughed. So did he." },
        { zh: "后来，他成了村里唯一的乐师。", en: "Later he became the only musician in the village." },
        { zh: "他给孩子们吹了一首很短的小曲。吹完，他第一次觉得，自己不是在装。", en: "He played the children a very short tune. When it ended, for the first time he did not feel like pretending." }
      ]
    },
    horses: {
      art: "horses",
      title: { zh: "结局 · 喂马", en: "Ending · Horses" },
      pages: [
        { zh: "南郭被发去喂马。马棚里没有乐谱，也没有国王。", en: "Nan Guo was sent to the stables. No scores, no king." },
        { zh: "他每天给马吹一个音。马不理他。", en: "Every day he played one note for the horses. They ignored him." },
        { zh: "有一天，他吹对了。马抬起了头。", en: "One day he played it right. A horse looked up." },
        { zh: "南郭想：这也算有人听。", en: "Nan Guo thought: someone listened." },
        { zh: "后来，马棚里多了一支旧竽。每天晚上，马都等着那一个音。", en: "Later, an old sheng hung in the stable. Every evening the horses waited for that one note." }
      ]
    }
  };

  function endingFor(truth, stats) {
    var good = stats && !stats.failed && stats.rank !== "C";
    if (truth) return good ? "trueSong" : "home";
    return good ? "chief" : "horses";
  }

  return {
    CAST: CAST, ACTS: ACTS, CHAPTERS: CHAPTERS, ENDINGS: ENDINGS,
    endingFor: endingFor
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = { STORY: STORY };
