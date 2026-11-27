/* 玄机阁's explanation pages (SELECT on a result). The rule for every line here: a quotation is the old book's own
   words with its source named; our own words only say what a term is and how the page is read, never what it means
   for the reader's luck, health, money or life. Quotations checked against zh.wikisource.org on 2026-11-27 unless a
   line says it is a paraphrase. Pure data, no DOM, no PAD. MIT License. Copyright (c) 2026 Haowei Wu. */
var EXPLAIN = (function () {
  "use strict";

  /* 老黄历: one entry per term on the page */
  var ALMANAC = [
    { term: { zh: "建除十二值", en: "The twelve day officers (建除)" },
      text: {
        zh: "每天轮一个字：建、除、满、平、定、执、破、危、成、收、开、闭。月建（这个月的地支）所在的那天是「建」，往后一天一个。名目最早见于《淮南子·天文训》：「寅为建，卯为除，辰为满，巳为平，主生；午为定，未为执，主陷；申为破，主衡……丑为闭，主太阴。」后来的历书按它排宜忌，体例见清代《协纪辨方书》。",
        en: "Each day takes one of twelve names, starting with 建 on the day whose branch matches the month's. The names go back to the Huainanzi (天文训); later almanacs, as set out in the Qing 协纪辨方书, use them to list what suits a day."
      } },
    { term: { zh: "黄道 · 黑道", en: "Yellow and black path days" },
      text: {
        zh: "十二位神按日轮值：青龙、明堂、天刑、朱雀、金匮、天德、白虎、玉堂、天牢、玄武、司命、勾陈。其中青龙、明堂、金匮、天德、玉堂、司命六位当值的日子叫黄道日，其余叫黑道日。每个月从哪天起青龙，跟月建走。这是旧历书的排法（见《协纪辨方书》），这里照排，不加评说。",
        en: "Twelve spirits take turns by day; six of them (青龙 明堂 金匮 天德 玉堂 司命) make a 'yellow path' day, the other six a 'black path' day. Old almanacs list them (协纪辨方书); this page only shows which one it is."
      } },
    { term: { zh: "冲 · 煞", en: "Clash and sha" },
      text: {
        zh: "「冲」是和当天地支相对的那个地支（相隔六位，如子午、卯酉），历书写成「冲某某（生肖）」。「煞」是按当天地支的三合局定的方位：申子辰煞南，寅午戌煞北，亥卯未煞西，巳酉丑煞东。都是历书的通行写法。",
        en: "The clash is the branch opposite the day's (six apart, like 子 and 午), printed with its zodiac animal. The sha is a direction set by the day's branch group. Both are standard almanac entries."
      } },
    { term: { zh: "彭祖百忌", en: "Pengzu's taboos" },
      text: {
        zh: "两句顺口溜，一句跟当天的天干，一句跟地支，如「甲不开仓财物耗散」。出自旧时民间通书，托名彭祖，并非彭祖本人所作。这里照录，当作历书的老样子看。",
        en: "Two old rhymes, one for the day's stem and one for its branch. They come from folk almanacs and are only attributed to Pengzu; shown here as the old page printed them."
      } },
    { term: { zh: "宜 · 忌", en: "Suits and avoid" },
      text: {
        zh: "宜忌按月建和当天干支查表得出，表的体例出自《协纪辨方书》，这里用的数据取自开源历法库 lunar-javascript（6tail，MIT 许可）。「馀事勿取」「诸事不宜」也是表里原有的字。",
        en: "The suits/avoid lists come from a table keyed by the month and the day, in the scheme of the 协纪辨方书; the data is from the open-source lunar-javascript library (6tail, MIT)."
      } }
  ];

  /* 八卦: how the cast is read. The rule by number of changing lines is a paraphrase of 朱熹《易学启蒙·考变占》. */
  var HOW = {
    zh: "三枚铜钱掷六次，从下往上成一卦。三个正面是老阳（九），三个反面是老阴（六），这两种是「动爻」，会变成相反的爻，得出「变卦」（又叫之卦）。卦辞是全卦的话，爻辞是每一爻的话；彖、象是《易传》对卦辞和爻辞的解说。",
    en: "Three coins thrown six times build the figure from the bottom. Three heads (9) or three tails (6) are changing lines and turn into their opposite, giving the changed hexagram. The judgment speaks for the whole figure, each line has its own text, and the 彖 and 象 are the classic commentaries on them."
  };
  var RULE_SOURCE = { zh: "读法按朱熹《易学启蒙·考变占》（意译）", en: "Reading rule after Zhu Xi, 易学启蒙 (paraphrased)" };
  /* by the number of changing lines, 0-6: what to read */
  var RULES = [
    { zh: "没有动爻：读本卦卦辞。", en: "No changing line: read the judgment of the hexagram." },
    { zh: "一爻动：读本卦这一爻的爻辞。", en: "One changing line: read that line of the hexagram." },
    { zh: "二爻动：读本卦这两爻的爻辞，以上面那一爻为主。", en: "Two: read both lines, the upper one first." },
    { zh: "三爻动：读本卦和变卦的卦辞，本卦为主，变卦为辅。", en: "Three: read the judgments of both hexagrams, the first one leading." },
    { zh: "四爻动：读变卦里两个没动的爻，以下面那一爻为主。", en: "Four: read the two unchanged lines of the changed hexagram, the lower one first." },
    { zh: "五爻动：读变卦里那一个没动的爻。", en: "Five: read the one unchanged line of the changed hexagram." },
    { zh: "六爻全动：乾读「用九」，坤读「用六」，其余读变卦卦辞。", en: "All six: 乾 reads 用九, 坤 reads 用六, the others the changed hexagram's judgment." }
  ];
  var LINE_NAMES = ["初", "二", "三", "四", "五", "上"];

  /* 八字: the terms on the chart */
  var BAZI = [
    { term: { zh: "四柱", en: "Four pillars" },
      text: {
        zh: "出生的年、月、日、时各用一对干支记下，就是四柱，共八个字，所以叫八字。年按立春换，月按节气里的「节」换（立春、惊蛰、清明……），这里按节气当天整天算，不细到交节的时刻；晚上 23 点以后算第二天（子初换日）。",
        en: "The year, month, day and hour of birth, each as a stem and branch: eight characters. The year turns at 立春 and the month at each 节, counted by whole days here; from 23:00 the day counts as the next."
      } },
    { term: { zh: "日主", en: "Day master" },
      text: {
        zh: "日柱的天干。子平法以日干代表本人，其余七个字都拿来和它对照（见《渊海子平》）。这里只标出它和它的五行。",
        en: "The day pillar's stem. In the 子平 method it stands for the person, and the other seven characters are read against it (渊海子平). This page only names it and its element."
      } },
    { term: { zh: "纳音", en: "Na yin" },
      text: {
        zh: "六十甲子两两一组，配一个五行名目，如甲子、乙丑「海中金」。名目和取象见明代《三命通会·论纳音取象》。",
        en: "The sixty stem-branch pairs go in thirty pairs, each with an element name such as 海中金 for 甲子 and 乙丑 (三命通会)."
      } },
    { term: { zh: "五行计数", en: "Element counts" },
      text: {
        zh: "这里只数八个字表面上的五行：天干、地支各算一个，不算地支里的藏干，也不论旺衰、月令和生克。所以它只是个计数，不代表命里五行的强弱，更不是喜用神。",
        en: "A plain count of the visible characters' elements: no hidden stems, no seasonal strength, no interactions. It is a tally, not a reading of strength."
      } }
  ];

  return { ALMANAC: ALMANAC, HOW: HOW, RULE_SOURCE: RULE_SOURCE, RULES: RULES, LINE_NAMES: LINE_NAMES, BAZI: BAZI };
})();
