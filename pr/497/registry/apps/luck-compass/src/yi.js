/* The trigrams and Zhouyi texts are public-domain traditional material.
   English counsel is original and deliberately brief. */
var YI = (function () {
  "use strict";
  var TRIGRAMS = [
    { name: "乾", lines: [1, 1, 1], image: "天", imageEn: "Heaven", family: "父", familyEn: "father", direction: 315 },
    { name: "兑", lines: [1, 1, 0], image: "泽", imageEn: "Lake", family: "少女", familyEn: "youngest daughter", direction: 270 },
    { name: "离", lines: [1, 0, 1], image: "火", imageEn: "Fire", family: "中女", familyEn: "middle daughter", direction: 180 },
    { name: "震", lines: [1, 0, 0], image: "雷", imageEn: "Thunder", family: "长男", familyEn: "eldest son", direction: 90 },
    { name: "巽", lines: [0, 1, 1], image: "风", imageEn: "Wind", family: "长女", familyEn: "eldest daughter", direction: 135 },
    { name: "坎", lines: [0, 1, 0], image: "水", imageEn: "Water", family: "中男", familyEn: "middle son", direction: 0 },
    { name: "艮", lines: [0, 0, 1], image: "山", imageEn: "Mountain", family: "少男", familyEn: "youngest son", direction: 45 },
    { name: "坤", lines: [0, 0, 0], image: "地", imageEn: "Earth", family: "母", familyEn: "mother", direction: 225 }
  ];
  /* King Wen order: short name, lower trigram, upper trigram, judgment, great image, original gloss. */
  var rows = [
    ["乾",0,0,"元亨利贞。","天行健，君子以自强不息。","Heaven moves with strength; keep improving yourself."],
    ["坤",7,7,"元亨，利牝马之贞。君子有攸往，先迷后得主，利。西南得朋，东北丧朋。安贞，吉。","地势坤，君子以厚德载物。","Earth receives all; be patient, generous, and steady."],
    ["屯",3,5,"元亨利贞。勿用有攸往，利建侯。","云雷，屯；君子以经纶。","Clouds and thunder gather; begin carefully and organize."],
    ["蒙",5,6,"亨。匪我求童蒙，童蒙求我。初筮告，再三渎，渎则不告。利贞。","山下出泉，蒙；君子以果行育德。","A spring emerges below the mountain; learn with care."],
    ["需",0,5,"有孚，光亨，贞吉。利涉大川。","云上于天，需；君子以饮食宴乐。","Clouds wait above; nourish yourself before acting."],
    ["讼",5,0,"有孚窒惕，中吉，终凶。利见大人，不利涉大川。","天与水违行，讼；君子以作事谋始。","Heaven and water diverge; settle differences early."],
    ["师",5,7,"贞，丈人吉，无咎。","地中有水，师；君子以容民畜众。","Water rests in earth; lead people with discipline."],
    ["比",7,5,"吉。原筮，元永贞，无咎。不宁方来，后夫凶。","地上有水，比；先王以建万国，亲诸侯。","Water gathers on earth; build trust and stand together."],
    ["小畜",0,4,"亨。密云不雨，自我西郊。","风行天上，小畜；君子以懿文德。","Wind crosses heaven; gather strength through gentle restraint."],
    ["履",1,0,"履虎尾，不咥人，亨。","上天下泽，履；君子以辨上下，定民志。","Step carefully, even near danger; courtesy opens a path."],
    ["泰",0,7,"小往大来，吉亨。","天地交，泰；后以财成天地之道，辅相天地之宜，以左右民。","Heaven and earth meet: peace; share what you have."],
    ["否",7,0,"否之匪人，不利君子贞，大往小来。","天地不交，否；君子以俭德辟难，不可荣以禄。","Heaven and earth do not meet; conserve strength and wait."],
    ["同人",2,0,"同人于野，亨。利涉大川，利君子贞。","天与火，同人；君子以类族辨物。","Fire joins heaven; seek common purpose in the open."],
    ["大有",0,2,"元亨。","火在天上，大有；君子以遏恶扬善，顺天休命。","Fire shines in heaven; use abundance for what is good."],
    ["谦",6,7,"亨，君子有终。","地中有山，谦；君子以裒多益寡，称物平施。","A mountain lies within earth; make room for others."],
    ["豫",7,3,"利建侯行师。","雷出地奋，豫；先王以作乐崇德，殷荐之上帝。","Thunder rises from earth; prepare together with joyful purpose."],
    ["随",3,1,"元亨利贞，无咎。","泽中有雷，随；君子以向晦入宴息。","Thunder rests in the lake; know when to follow and rest."],
    ["蛊",4,6,"元亨，利涉大川。先甲三日，后甲三日。","山下有风，蛊；君子以振民育德。","Wind below the mountain stirs decay; repair what was neglected."],
    ["临",1,7,"元亨利贞。至于八月有凶。","泽上有地，临；君子以教思无穷，容保民无疆。","Earth overlooks the lake; guide with care, not force."],
    ["观",7,4,"盥而不荐，有孚颙若。","风行地上，观；先王以省方，观民设教。","Wind moves over earth; observe before offering guidance."],
    ["噬嗑",3,2,"亨。利用狱。","雷电，噬嗑；先王以明罚敕法。","Thunder and lightning bite through; make fair, clear decisions."],
    ["贲",2,6,"亨。小利有攸往。","山下有火，贲；君子以明庶政，无敢折狱。","Fire below a mountain lends beauty; let substance lead."],
    ["剥",7,6,"不利有攸往。","山附于地，剥；上以厚下安宅。","The mountain rests on earth; protect the foundations."],
    ["复",3,7,"亨。出入无疾，朋来无咎。反复其道，七日来复，利有攸往。","雷在地中，复；先王以至日闭关，商旅不行。","Thunder returns beneath earth; a fresh beginning comes in time."],
    ["无妄",3,0,"元亨利贞。其匪正有眚，不利有攸往。","天下雷行，物与无妄；先王以茂对时，育万物。","Thunder travels under heaven; act sincerely, without pretense."],
    ["大畜",0,6,"利贞。不家食吉，利涉大川。","天在山中，大畜；君子以多识前言往行，以畜其德。","Heaven is held within the mountain; cultivate what endures."],
    ["颐",3,6,"贞吉。观颐，自求口实。","山下有雷，颐；君子以慎言语，节饮食。","Thunder below a mountain; be mindful of words and nourishment."],
    ["大过",4,1,"栋桡，利有攸往，亨。","泽灭木，大过；君子以独立不惧，遁世无闷。","The lake overwhelms trees; stand firm through an unusual strain."],
    ["坎",5,5,"习坎，有孚，维心亨，行有尚。","水洊至，习坎；君子以常德行，习教事。","Water flows through danger; keep faith and move steadily."],
    ["离",2,2,"利贞，亨。畜牝牛，吉。","明两作，离；大人以继明照于四方。","Brightness follows brightness; sustain clarity and care."],
    ["咸",6,1,"亨，利贞，取女吉。","山上有泽，咸；君子以虚受人。","Lake rests on mountain; openness allows mutual influence."],
    ["恒",4,3,"亨，无咎，利贞，利有攸往。","雷风，恒；君子以立不易方。","Thunder and wind endure; keep a steady course."],
    ["遁",6,0,"亨。小利贞。","天下有山，遁；君子以远小人，不恶而严。","A mountain stands beneath heaven; withdraw without rancor."],
    ["大壮",0,3,"利贞。","雷在天上，大壮；君子以非礼弗履。","Thunder sounds in heaven; strength needs restraint."],
    ["晋",7,2,"康侯用锡马蕃庶，昼日三接。","明出地上，晋；君子以自昭明德。","The sun rises over earth; make your good work visible."],
    ["明夷",2,7,"利艰贞。","明入地中，明夷；君子以莅众，用晦而明。","Light enters earth; protect your inner clarity in hard times."],
    ["家人",2,4,"利女贞。","风自火出，家人；君子以言有物，而行有恒。","Wind rises from fire; let words be honest and actions steady."],
    ["睽",1,2,"小事吉。","上火下泽，睽；君子以同而异。","Fire and lake differ; respect difference and find small accord."],
    ["蹇",6,5,"利西南，不利东北。利见大人，贞吉。","山上有水，蹇；君子以反身修德。","Water on a mountain blocks the way; reflect and seek help."],
    ["解",5,3,"利西南。无所往，其来复吉。有攸往，夙吉。","雷雨作，解；君子以赦过宥罪。","Thunder and rain release tension; forgive and move on."],
    ["损",1,6,"有孚，元吉，无咎，可贞，利有攸往。曷之用？二簋可用享。","山下有泽，损；君子以惩忿窒欲。","Lake below mountain; set aside excess and simplify."],
    ["益",3,4,"利有攸往，利涉大川。","风雷，益；君子以见善则迁，有过则改。","Wind and thunder increase; learn from good and correct mistakes."],
    ["夬",0,1,"扬于王庭，孚号，有厉，告自邑，不利即戎，利有攸往。","泽上于天，夬；君子以施禄及下，居德则忌。","The lake rises to heaven; speak plainly and act fairly."],
    ["姤",4,0,"女壮，勿用取女。","天下有风，姤；后以施命诰四方。","Wind meets heaven; notice a meeting's force before committing."],
    ["萃",7,1,"亨。王假有庙。利见大人，亨，利贞。用大牲吉，利有攸往。","泽上于地，萃；君子以除戎器，戒不虞。","The lake gathers on earth; come together and prepare well."],
    ["升",4,7,"元亨。用见大人，勿恤，南征吉。","地中生木，升；君子以顺德，积小以高大。","A tree grows within earth; rise through small steady steps."],
    ["困",5,1,"亨，贞，大人吉，无咎。有言不信。","泽无水，困；君子以致命遂志。","The lake is dry; preserve purpose when resources are scarce."],
    ["井",4,5,"改邑不改井，无丧无得，往来井井。汔至亦未繘井，羸其瓶，凶。","木上有水，井；君子以劳民劝相。","Water in a well is shared; tend the source for everyone."],
    ["革",2,1,"巳日乃孚。元亨利贞。悔亡。","泽中有火，革；君子以治历明时。","Fire in the lake marks change; make reforms at the right time."],
    ["鼎",4,2,"元吉，亨。","木上有火，鼎；君子以正位凝命。","Fire cooks in a vessel; give good things a sound place."],
    ["震",3,3,"亨。震来虩虩，笑言哑哑。震惊百里，不丧匕鬯。","洊雷，震；君子以恐惧修省。","Thunder follows thunder; meet surprise with alert composure."],
    ["艮",6,6,"艮其背，不获其身；行其庭，不见其人，无咎。","兼山，艮；君子以思不出其位。","Mountains stand together; know where to pause."],
    ["渐",6,4,"女归吉，利贞。","山上有木，渐；君子以居贤德善俗。","A tree grows on a mountain; let progress be gradual."],
    ["归妹",1,3,"征凶，无攸利。","泽上有雷，归妹；君子以永终知敝。","Thunder over the lake; consider the long course before joining."],
    ["丰",2,3,"亨，王假之。勿忧，宜日中。","雷电皆至，丰；君子以折狱致刑。","Thunder and lightning are full; use bright moments wisely."],
    ["旅",6,2,"小亨，旅贞吉。","山上有火，旅；君子以明慎用刑，而不留狱。","Fire on a mountain travels; be modest and careful away from home."],
    ["巽",4,4,"小亨，利有攸往，利见大人。","随风，巽；君子以申命行事。","Wind follows wind; gentle persistence carries a clear message."],
    ["兑",1,1,"亨，利贞。","丽泽，兑；君子以朋友讲习。","Lakes join; share learning and delight with friends."],
    ["涣",5,4,"亨。王假有庙。利涉大川，利贞。","风行水上，涣；先王以享于帝立庙。","Wind moves over water; let scattered things find a center."],
    ["节",1,5,"亨。苦节不可贞。","泽上有水，节；君子以制数度，议德行。","Water fills the lake; choose measures that are not severe."],
    ["中孚",1,4,"豚鱼吉，利涉大川，利贞。","泽上有风，中孚；君子以议狱缓死。","Wind moves over the lake; trust grows through sincerity."],
    ["小过",6,3,"亨，利贞。可小事，不可大事。飞鸟遗之音，不宜上，宜下，大吉。","山上有雷，小过；君子以行过乎恭，丧过乎哀，用过乎俭。","Thunder on a mountain; attend to small matters, stay humble."],
    ["既济",2,5,"亨小，利贞。初吉终乱。","水在火上，既济；君子以思患而预防之。","Water and fire are balanced; tend to details after success."],
    ["未济",5,2,"亨。小狐汔济，濡其尾，无攸利。","火在水上，未济；君子以慎辨物居方。","Fire remains above water; finish carefully what is still underway."]
  ];
  var HEXAGRAMS = [], byNameMap = {}, byPattern = {}, i, row, low, high, bits;
  for (i = 0; i < rows.length; i++) {
    row = rows[i]; low = TRIGRAMS[row[1]]; high = TRIGRAMS[row[2]];
    bits = low.lines.concat(high.lines);
    var h = { number: i + 1, name: low.name === high.name ? low.name + "为" + high.image : high.image + low.image + row[0],
      short: row[0], lower: low, upper: high, lines: bits, judgment: row[3], image: row[4], english: row[5] };
    if (i === 2) h.name = "水雷屯";
    if (i === 3) h.name = "山水蒙";
    if (i === 10) h.name = "地天泰";
    if (i === 11) h.name = "天地否";
    if (i === 62) h.name = "水火既济";
    if (i === 63) h.name = "火水未济";
    HEXAGRAMS.push(h);
    byNameMap[h.short] = h;
    byPattern[bits.join("")] = h;
  }
  function byLines(bits) { return bits && bits.length === 6 ? byPattern[bits.join("")] || null : null; }
  function byName(short) { return byNameMap[short] || null; }
  function castLine(rng) {
    var heads = 0, i;
    for (i = 0; i < 3; i++) if (rng() < 0.5) heads++;
    return heads === 3 ? 9 : heads === 0 ? 6 : heads === 1 ? 7 : 8;
  }
  function primary(lines) {
    return byLines(lines.map(function (n) { return n === 6 || n === 8 ? 0 : 1; }));
  }
  function changed(lines) {
    var hasChange = false, out = lines.map(function (n) {
      if (n === 6) { hasChange = true; return 1; }
      if (n === 9) { hasChange = true; return 0; }
      return n === 8 ? 0 : 1;
    });
    return hasChange ? byLines(out) : null;
  }
  function changingLines(lines) {
    var out = [], i;
    for (i = 0; i < lines.length; i++) if (lines[i] === 6 || lines[i] === 9) out.push(i + 1);
    return out;
  }
  return { TRIGRAMS: TRIGRAMS, HEXAGRAMS: HEXAGRAMS, byLines: byLines, byName: byName,
    castLine: castLine, primary: primary, changed: changed, changingLines: changingLines };
}());
