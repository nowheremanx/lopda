/* The story: 晚点 / Fifty Minutes Late.

   It is one list, read from top to bottom. There are no jumps: a choice sets a flag, and a step
   marked with `when` is read only when that flag is set. Both paths walk the same list, so the
   two readings differ only in the lines that carry a `when`. This keeps a short story easy to
   follow, and the save is just a position in the list plus the flags.

   Steps:
     ch(zh, en, subZh, subEn)   a chapter card
     at(scene, stage)           change the picture (scenes.js); stage sets what is in it
     stage(obj)                 change only what is in the picture (the father moves, the train comes)
     n(zh, en)                  narration
     say(who, zh, en)           a line spoken by someone in CAST
     sms(who, zh, en)           a text message on the phone
     pick([{zh, en, set}])      a choice; the picked option sets its flag
     sfx(name)                  a sound from SOUNDS (scenes.js)
     end(zh, en, subZh, subEn)  the end card
     when(flag, [steps])        those steps only on that path
*/

var STORY_TITLE = { zh: "雨站", en: "Rain Station" };
var STORY_SUB = { zh: "晚点五十分钟", en: "Fifty Minutes Late" };

var CAST = {
  dad: { zh: "爸", en: "Dad" },
  me: { zh: "你", en: "You" },
  zhou: { zh: "老周", en: "Old Zhou" },
  guard: { zh: "列车员", en: "Attendant" },
  smsMum: { zh: "短信 · 妈", en: "Text: Mum" },
  smsDad: { zh: "短信 · 爸", en: "Text: Dad" }
};

function ch(zh, en, subZh, subEn) { return { chapter: { zh: zh, en: en }, sub: { zh: subZh, en: subEn } }; }
function at(scene, st) { return { scene: scene, stage: st || {} }; }
function stage(st) { return { stage: st }; }
function n(zh, en) { return { who: null, text: { zh: zh, en: en } }; }
function say(who, zh, en) { return { who: who, text: { zh: zh, en: en } }; }
function sms(who, zh, en) { return { who: who, sms: true, text: { zh: zh, en: en } }; }
function pick(items) { return { choice: items }; }
function sfx(name) { return { sfx: name }; }
function end(zh, en, subZh, subEn) { return { end: { zh: zh, en: en }, sub: { zh: subZh, en: subEn } }; }
function when(flag, steps) { return steps.map(function (s) { s.when = flag; return s; }); }

var STORY = [].concat(
  ch("序章", "Prologue", "晚点", "Running Late"),
  at("outside", { rain: 2 }),
  n("八月底，雨下了一整天。", "The end of August. It has rained all day."),
  n("爸骑摩托送你来车站。一件雨衣，罩着你们两个人。", "Dad brought you on the motorbike. One raincoat over the two of you."),
  n("还有那只箱子，捆了三道塑料布。", "And the suitcase, wrapped three times in plastic."),
  n("青石站很小。一天停两趟车，早上一趟，晚上一趟。",
    "Qingshi is a small station. Two trains stop a day, one in the morning, one at night."),
  n("你要坐晚上那趟，去省城上大学。", "You are taking the night one, to university in the city."),

  at("waiting", { dad: "bench", board: true }),
  n("窗口边的小黑板上，有人用粉笔写着：K728，晚点约五十分钟。",
    "On the little board by the ticket window, in chalk: K728, about fifty minutes late."),
  say("dad", "不急。", "No hurry."),
  n("他在长椅上坐下，把箱子拉到两腿中间夹住。好像候车室里有人要抢。",
    "He sits and grips the suitcase between his knees, as if someone might take it."),
  n("候车室里只有你们两个，和售票窗口后面的老周。老周在听收音机。",
    "No one else is here but Old Zhou behind the ticket window, listening to the radio."),
  say("dad", "票呢？", "Ticket?"),
  say("me", "在我兜里。", "In my pocket."),
  n("过了一会儿。", "A while passes."),
  say("dad", "身份证呢？", "ID card?"),
  say("me", "也在兜里。", "Also in my pocket."),
  n("他点点头。又过了一会儿，他伸手按了按你外套的口袋，按到硬的，才把手收回去。",
    "He nods. Later he reaches over and presses your coat pocket until he feels the card."),
  say("me", "爸。", "Dad."),
  say("dad", "嗯。在就行。", "Mm. As long as it's there."),
  n("妈没来。她说来了要哭，在站台上哭，丢人。",
    "Mum didn't come. She said she would cry, on the platform, in front of people."),
  n("所以只有爸。爸不哭，爸也不怎么说话。", "So it's only Dad. Dad doesn't cry. Dad doesn't say much either."),
  n("你看了一眼墙上的钟。五十分钟，会很长。", "You look at the clock on the wall. Fifty minutes will be long."),
  pick([
    { zh: "戴上耳机", en: "Put on headphones", set: "phones" },
    { zh: "陪他坐着", en: "Sit with him", set: "sat" }
  ]),

  when("phones", [].concat(
    stage({ muffle: true }),
    n("你戴上耳机。歌是早就存好的，留着在车上听。",
      "You put on your headphones. The songs were saved weeks ago, for the train."),
    n("雨声没了。候车室变成一部没有声音的电影。", "The rain is gone. The waiting room becomes a film with no sound."),
    stage({ dad: "window" }),
    n("爸坐了一会儿，起身走到售票窗口，跟老周说话。",
      "Dad sits a while, then gets up and goes to the ticket window to talk to Old Zhou."),
    n("他说一句，就回头看你一眼。老周笑了，也朝你这边看。",
      "After every sentence he looks back at you. Old Zhou laughs and looks over too."),
    n("你把脸转开，假装看窗外。", "You turn away and pretend to watch the window."),
    stage({ dad: "crouch" }),
    n("再转回来，他正蹲在你的背包旁边，往侧袋里塞了个什么，又把拉链拉好。",
      "When you look back he is crouched by your backpack, slipping something into the side pocket."),
    n("他看见你在看他，像被抓住了，站起来拍了拍裤子。",
      "He sees you watching, as if caught, and stands up brushing off his trousers."),
    stage({ muffle: false, dad: "stand" }),
    n("你摘下一边耳机。", "You take out one earphone.")
  )),
  when("sat", [].concat(
    n("你没动。他也没动。", "You don't move. Neither does he."),
    n("雨打在铁皮雨棚上，一阵密，一阵疏。", "Rain on the tin roof, heavy, then light, then heavy."),
    say("dad", "学校食堂……贵不贵？", "The canteen at school... is it expensive?"),
    say("me", "我还没去呢。", "I haven't been there yet."),
    say("dad", "哦。", "Oh."),
    n("他从尼龙袋里摸出一个鸡蛋，在椅子扶手上磕了磕，开始剥。",
      "He takes an egg from his nylon bag, cracks it on the armrest and starts to peel it."),
    n("他手大，剥得很慢，一点一点，剥得干干净净。", "His hands are big. He peels slowly, bit by bit, until it is perfectly clean."),
    say("dad", "吃。", "Eat."),
    say("me", "不饿。刚吃过饭。", "I'm not hungry. We just ate."),
    say("dad", "车上饿。", "You'll be hungry on the train."),
    n("你没接。他就那么举着那个鸡蛋，举了一会儿。", "You don't take it. He holds the egg out a while longer."),
    n("后来他用纸巾包好，塞进你背包的侧袋，拉上拉链。",
      "Then he wraps it in a tissue, pushes it into the side pocket of your backpack and zips it shut.")
  )),
  say("dad", "我出去看看车。", "I'll go and look for the train."),
  stage({ dad: "out" }),
  n("他推门出去了。雨衣搭在长椅上，没穿。", "He goes out. His raincoat stays on the bench."),

  ch("第一章", "Chapter One", "老周", "Old Zhou"),
  at("waiting", { dad: "out", board: true, zhou: "near" }),
  n("老周从窗口后面出来，端着一个搪瓷缸，放在你手边。",
    "Old Zhou comes out from behind the window with an enamel mug and sets it down by your hand."),
  say("zhou", "喝口热的。", "Have something hot."),
  say("zhou", "你爸昨天就来过了。", "Your dad was here yesterday, you know."),
  say("me", "昨天？", "Yesterday?"),
  say("zhou", "下午，也下着雨。骑了四十分钟，就为问一句车几点到。",
    "In the afternoon, in the rain. Forty minutes on that bike, just to ask when the train comes."),
  say("zhou", "我说你打个电话不就行了。他说电话里说不清楚。",
    "I said he could have phoned. He said you can't get it right on the phone."),
  say("zhou", "然后他问我，七号车厢停在哪儿。", "Then he asked me where carriage seven stops."),
  n("你的票是七号车厢。你自己都没记住。", "Your ticket is for carriage seven. You hadn't even remembered that."),
  say("zhou", "我说大概在雨棚中间。车不一定停得准，看司机。",
    "I said mid-shelter, roughly. They never stop in quite the same spot. Depends on the driver."),
  say("zhou", "他就在站台上来回走了好几趟。数步子。", "So he walked up and down the platform a few times. Counting his steps."),
  say("zhou", "走完了又问我，站台票多少钱。", "Then he asked what a platform ticket costs."),
  say("zhou", "站台票早不卖了，十几年了。我说你直接进去就行。",
    "We stopped selling those years ago. I told him to just walk in."),
  say("zhou", "他不肯，非塞给我两块钱。", "He wouldn't. He pushed two yuan at me."),
  say("zhou", "我收了。不收，他不踏实。", "I took it. He wouldn't have rested otherwise."),
  when("phones", [
    say("zhou", "刚才他又过来跟我说了一遍。", "Just now he came over and told me again."),
    say("me", "说什么？", "Told you what?"),
    say("zhou", "说他家孩子考上大学了。", "That his kid got into university."),
    say("zhou", "昨天说了三遍。今天是第四遍。", "Three times yesterday. That was the fourth.")
  ]),
  when("sat", [
    say("zhou", "他还跟我说，他家孩子考上大学了。", "He also told me his kid got into university."),
    say("zhou", "说了三遍。", "Three times.")
  ]),
  n("老周笑起来。", "Old Zhou laughs."),
  say("zhou", "我说我知道，我都知道了。", "I said I know. I know."),
  n("你低头看那缸茶。茶叶一片一片，慢慢沉下去。", "You look down into the mug. The tea leaves sink, one by one."),
  stage({ dad: "wet" }),
  n("门开了。爸进来，肩膀湿透了。", "The door opens. Dad comes in, soaked through at the shoulders."),
  say("dad", "快了。广播说过前一站了。", "Nearly here. They said it's left the last station."),
  stage({ zhou: "window" }),
  n("老周端起搪瓷缸，回窗口后面去了。爸什么也没问。",
    "Old Zhou picks up his mug and goes back behind the window. Dad doesn't ask."),

  ch("第二章", "Chapter Two", "七号车厢", "Carriage Seven"),
  at("platform", { rain: 2, dad: 2, train: "none" }),
  n("车来之前，爸把箱子拎了起来。", "Before the train comes, Dad picks up the suitcase."),
  say("me", "我自己来。", "I can carry it."),
  say("dad", "你拿包。", "You take the bag."),
  n("他走在前面，直直走到雨棚中间，停下。", "He walks ahead, straight to the middle of the shelter, and stops."),
  stage({ dad: 1.9 }),
  n("他低头看了看脚下，又往左挪了半步。", "He looks down at his feet, then moves half a step to the left."),
  say("dad", "就这儿。", "Here."),
  stage({ train: "light" }),
  sfx("horn"),
  n("山那边亮了。先是光，然后是声音。", "Beyond the hill, a light. First the light, then the sound."),
  stage({ train: "pass" }),
  n("绿皮车很长，一节一节从你们面前滑过去，越来越慢。",
    "The green train is long. It slides past you carriage by carriage, slower and slower."),
  n("五号。六号。", "Five. Six."),
  stage({ train: "stop" }),
  n("七号没有停。", "Seven doesn't stop."),
  sfx("brake"),
  n("它又往前滑了二十多米，才停住。", "It slides on another twenty metres before it stops."),
  say("dad", "……停偏了。", "...It's off."),
  stage({ dad: 3, run: true }),
  n("他拎起箱子就跑。", "He grabs the suitcase and runs."),
  n("你在后面追。雨从雨棚外面斜着打进来，打在他背上。",
    "You run after him. The rain slants in under the shelter and hits his back."),
  n("他跑得不快，箱子一下一下磕着腿。他跑得很认真。",
    "He isn't fast. The suitcase knocks against his leg with every step. He runs as if it matters."),
  stage({ guard: true, run: false }),
  say("guard", "慢点慢点，还有四分钟！", "Easy, easy, there's four minutes yet!"),
  stage({ dad: "in" }),
  n("爸把箱子扛上车，一直扛到你的铺位，举起来，塞上行李架。",
    "Dad hauls the suitcase aboard, all the way to your berth, and heaves it onto the rack."),
  n("他喘着气，用袖子把箱子上的水擦掉。", "Out of breath, he wipes the water off it with his sleeve."),
  say("dad", "箱子，看着点。", "Keep an eye on it."),
  say("guard", "送人的下车了，要开了！", "Visitors off, we're leaving!"),

  at("window", { rain: 2, dad: true, open: false, go: false }),
  n("他下去了，站在车窗外面，离你一臂远。", "He gets off and stands outside your window, an arm's length away."),
  n("他头顶的柱子上，刷着一个白色的“3”。", "On the pillar above him, a white number, painted: 3."),
  pick([
    { zh: "拉开车窗", en: "Open the window", set: "open" },
    { zh: "隔着玻璃", en: "Stay behind the glass", set: "glass" }
  ]),
  when("open", [].concat(
    stage({ open: true }),
    n("你把车窗往上推。推不动，再推，推开了一半。", "You push the window up. It sticks. You push again and it opens halfway."),
    n("雨一下子灌进来，凉的。", "The rain rushes in, cold."),
    n("你想说点什么。很多话一起挤到嘴边，排着队，一句也出不来。",
      "You want to say something. It all crowds up at once, and nothing comes out."),
    say("me", "爸，回去吧。雨大。", "Dad, go home. It's pouring."),
    say("dad", "嗯。", "Mm."),
    n("他没动。", "He doesn't move."),
    say("dad", "到了打电话。", "Call when you get there."),
    say("me", "嗯。", "Mm.")
  )),
  when("glass", [
    n("你隔着玻璃看他。玻璃上全是雨，把他划成一道一道的。",
      "You look at him through the glass. The rain runs down it and cuts him into strips."),
    n("他抬手比了比耳朵，又指了指你。到了打电话。你点头。",
      "He holds a hand to his ear, then points at you. Call when you get there. You nod."),
    n("他又说了一句什么，很长，嘴动了好一会儿。", "Then he says something else, something long. His mouth keeps moving for a while."),
    n("你没看懂。你还是点头。", "You can't make it out. You nod anyway.")
  ]),
  stage({ go: true }),
  sfx("horn"),
  n("车动了。", "The train moves."),
  n("他没有追。他就站在那根柱子底下，一点一点变小。",
    "He doesn't run after it. He stands under that pillar and gets smaller, little by little."),

  ch("终章", "Last Chapter", "三号柱子", "Pillar Three"),
  at("berth", { rain: 1, phone: false }),
  n("车厢的灯暗了。下铺的人在打鼾。", "The carriage lights are low. Someone in the bottom berth is snoring."),
  n("半夜，你饿醒了。", "In the middle of the night, hunger wakes you."),
  n("你摸到背包侧袋，里面有一个软软的纸包。", "In the side pocket of your backpack your hand finds a soft paper bundle."),
  n("是那个鸡蛋。剥好的，凉透了。", "The egg. Peeled, and cold right through."),
  n("你坐在黑里，把它吃完。很干，有点噎。", "You sit in the dark and eat it. It's dry. It sticks in your throat."),
  stage({ phone: true }),
  sfx("buzz"),
  n("手机亮了。山里信号断断续续，几条短信一起涌进来。",
    "Your phone lights up. The mountain signal comes and goes; the texts arrive all at once."),
  n("第一条是妈。", "The first is from Mum."),
  sms("smsMum", "你爸回来了，衣服全湿透。", "Your dad is home, soaked to the skin."),
  sms("smsMum", "他说七号车厢停偏了，他扛着箱子跑了二十米。",
    "He says carriage seven stopped in the wrong place and he ran twenty metres with the suitcase."),
  when("open", [sms("smsMum", "还说你开窗，脸都淋湿了。傻。", "And that you opened the window and got your face all wet. Silly.")]),
  when("glass", [sms("smsMum", "还说他在窗外跟你说了一大堆，你光点头。",
    "And that he told you a whole lot through the window and you just kept nodding.")]),
  sms("smsMum", "他让我问你，鸡蛋吃了没。", "He wants me to ask if you ate the egg."),
  n("你回：吃了。", "You reply: I ate it."),
  stage({ phone: false }),
  n("过了很久，手机又亮了一下。", "A long time later, the phone lights up again."),
  stage({ phone: true }),
  sfx("buzz"),
  n("是爸。他很少发短信，字是一个一个按出来的。", "It's Dad. He hardly ever texts. Every letter has been pressed out one by one."),
  sms("smsDad", "七号车厢停3号柱子", "carriage 7 stops at pillar 3"),
  sms("smsDad", "下回我站那", "next time ill stand there"),
  stage({ phone: false, rain: 0 }),
  n("你把手机扣在胸口。", "You hold the phone face down against your chest."),
  n("窗外很黑，车一直往前走。雨不知道什么时候停了。",
    "Outside it is dark, and the train keeps going. At some point, the rain has stopped."),
  end("三号柱子", "Pillar Three", "下回我站那。", "Next time I'll stand there.")
);
