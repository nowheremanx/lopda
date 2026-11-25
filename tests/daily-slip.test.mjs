// daily-slip: the slip catalogue in registry/apps/daily-slip/index.html. Slips are only ever appended,
// because a saved draw stores the index of its slip (state.slip) and must show the same slip after an
// update, so entries 1-32 keep their Chinese text and their order forever. The e2e file
// (tests/e2e-daily-slip.test.mjs) checks the screen; this one checks the text itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read, EMOJI } from "./helpers.mjs";

const PAGE = "registry/apps/daily-slip/index.html";

/* DATA sits inside the app's IIFE; read it the way the app does, then copy it out of the vm realm so
   deepEqual compares plain objects and arrays */
function readData() {
  const src = read(PAGE);
  const start = src.indexOf("var DATA = [");
  const end = src.indexOf("\n  ];", start);
  assert.ok(start > 0 && end > start, "the page still holds its DATA list");
  const raw = vm.runInNewContext("(" + src.slice(start + "var DATA = ".length, end + 4).trim() + ")", {});
  return JSON.parse(JSON.stringify(raw));
}
const DATA = readData();

/* entries 1-32 exactly as they shipped in 1.1.2 (git HEAD before 1.2.0), Chinese only: the English was
   rewritten for 1.2.0, the Chinese is the part a saved index must keep pointing at */
const OLD = [
  { num: 1, grade: "上上", verse: ["朝露落在木门边", "门内有人正熬一锅热茶", "先把心安住，日子就长了"], meaning: "一日里最稳的，总是先安过心。" },
  { num: 2, grade: "上上", verse: ["小雨拂过旧墙", "青苔都在笑着亮一亮", "路边的风景也会替你答应"], meaning: "别急着挑谁，机缘会先把门敲响。" },
  { num: 3, grade: "上", verse: ["纸伞撑开在巷口", "风不急，步子也不急", "随便走走，晚餐就会更香"], meaning: "脚下多走一步，心里也会松一口气。" },
  { num: 4, grade: "上", verse: ["天边有雁回头", "顺着它的路，写一封清淡的信", "心事会落在最熟悉的地方"], meaning: "合适的话可以从最简单的句子开始。" },
  { num: 5, grade: "中", verse: ["街口的灯亮了一点", "有些事不是必须立刻想明白", "先去买一串香葱，一切会顺过来"], meaning: "缓一缓，不是拖延，是让路径显出来。" },
  { num: 6, grade: "上", verse: ["窗外一只乌鸦站了站", "你也别急着给结论", "明早的朝阳，先给你个好心情"], meaning: "今天不必全盘定论，明天是另一个答案。" },
  { num: 7, grade: "上上", verse: ["白墙上一片天色", "一阵轻风从左边吹过", "把烦恼都吹成了树叶的声响"], meaning: "让烦心事先变小一点，风会替你带走。" },
  { num: 8, grade: "中", verse: ["饭店门口有人晒衣服", "口袋里还剩一枚硬币", "先去喝口水，明白的事会慢慢浮上来"], meaning: "先照顾最现实的一点，想法会更稳。" },
  { num: 9, grade: "上", verse: ["田埂上的路明明没什么新鲜", "却像有人给它打了个招呼", "走过去时，心也活络开了"], meaning: "不必追求惊喜，熟路也能酿出温柔。" },
  { num: 10, grade: "上上", verse: ["旧书页夹着一撮芬芳", "有一处看起来像你要的答案", "别急着合上，先把字读透"], meaning: "答案常在你已看到的地方，只差一步认真。" },
  { num: 11, grade: "中", verse: ["水缸里的水静静翻动", "一次小小的换位", "就能把视线从一头甩到另一头"], meaning: "换个方向看，也许你已经接近了答案。" },
  { num: 12, grade: "上上", verse: ["青石板被人踩得很平", "你今天的事也差不多", "只要顺着脚步走，不怕它太长"], meaning: "继续向前，比追赶一时的焦躁更有力。" },
  { num: 13, grade: "上", verse: ["山里的云一层一层放轻", "一口气慢一点，你就会听到鸟鸣", "哪怕是小事也通了"], meaning: "慢下来，事情会先从声音里说明白。" },
  { num: 14, grade: "中", verse: ["隔壁有人在修水龙头", "你也不必急着吵", "等它按时滴水，屋里就都会亮"], meaning: "把小麻烦先处理掉，日子会自然通畅。" },
  { num: 15, grade: "上", verse: ["晚风吹过小院门口", "窗纸有一点点微亮", "你要做的事，原来只差一口气"], meaning: "别把今天的事想得太重，动作先来。" },
  { num: 16, grade: "上上", verse: ["雨停时，瓦片上有一片亮光", "就像有人给你留了个记号", "你会在那一瞬找到出口"], meaning: "你不是走丢了，你只是看见出口了。" },
  { num: 17, grade: "中", verse: ["橘子皮飘下来，落在案头", "看着像一道分界", "你要么往前，要么先把自己照照"], meaning: "先看清自己的节奏，再决定迈哪一步。" },
  { num: 18, grade: "上", verse: ["一只小船在河边一歇", "岸边的人也放慢了脚步", "原来好事就是一不追一不赶"], meaning: "顺其自然，反而更像你想要的生活。" },
  { num: 19, grade: "上上", verse: ["旧窗玻璃里有一点暮色", "你拿起书，把字慢慢放平", "有些东西从来不是撞出来的"], meaning: "一步步来，比一次猛冲更可靠。" },
  { num: 20, grade: "中", verse: ["路上有人停下来看树", "你也学着停一停", "几分钟之后，旧念头就不那么尖了"], meaning: "让自己停一下，情绪会先回到身体里。" },
  { num: 21, grade: "上", verse: ["红色的花落在石阶上", "花期不长，但有人记得拍一张照片", "把今天也保存成温柔的样子"], meaning: "今天不必太大，能保存的温暖就够了。" },
  { num: 22, grade: "上上", verse: ["一声远处的叫卖", "像是把街道喊醒了", "你也会顺着这声音，重新落地"], meaning: "把外界的噪音当作提醒，回到真实的脚步。" },
  { num: 23, grade: "中", verse: ["一片白云压在屋檐下", "你把热水壶的蒸汽看得太认真", "其实只是在提醒你慢一点"], meaning: "别把一道小事看得太重，今天还长着呢。" },
  { num: 24, grade: "上", verse: ["篮子里放了几颗葡萄", "一颗一颗都像是提醒你", "做事也可以有一点轻松的节奏"], meaning: "适度放松，反而让结果更稳。" },
  { num: 25, grade: "上上", verse: ["你在门口收了一片落叶", "它还留着一点点余温", "算是今天给你的好消息"], meaning: "一个小小的好消息，足够支撑你过一整天。" },
  { num: 26, grade: "中", verse: ["枯树上的鸟把铃铛挂住", "叮当声不大，却顺着风进了院子", "提醒你，别把心事吵大"], meaning: "小事先放一放，心会更清楚。" },
  { num: 27, grade: "上", verse: ["你想起一个很早的约定", "那天的地面还没晒热", "今天就按它的样子走一遍"], meaning: "老约定里藏着你想保留的那份安稳。" },
  { num: 28, grade: "上上", verse: ["收音机里播着远处的歌", "声音不大，却把屋子一点点填满", "在这柔和的地方，想法都能落下"], meaning: "让环境安静一点，心里就会有地方落脚。" },
  { num: 29, grade: "中", verse: ["一页日历翻过一页", "你忽然想起要把某件事放下来", "那是今天最好的安排"], meaning: "不是放弃，而是让优先级先理顺。" },
  { num: 30, grade: "上", verse: ["院里有人种了几竿青竹", "它们在风里轻轻摇", "一直盯着你，就像在提醒：别太紧"], meaning: "放松一点，事情总会换一种更顺的方式。" },
  { num: 31, grade: "上上", verse: ["一只小狗牵着旧绳子跑过", "它看起来没想太多", "你也跟着轻一点，今天就过了"], meaning: "别给今天提前背上太重的担子。" },
  { num: 32, grade: "上", verse: ["门口晒着一块旧布", "它还保留着昨天的太阳", "你拿起来，就像拿到了一个好理由"], meaning: "把小小的顺手当作出发，日子会跟着顺。" }
];

/* the slip's text column at 331 x 359 is 268 px of 15 px monospace: 29 latin characters, 17 Han
   characters. Keep a character of margin so a different monospace metric cannot wrap a line. */
const EN_MAX = 28, ZH_MAX = 17;

test("daily-slip: 100 or more slips, and entries 1-32 keep HEAD's Chinese in place", () => {
  assert.ok(DATA.length >= 100, `only ${DATA.length} slips`);
  OLD.forEach((old, i) => {
    const now = DATA[i];
    assert.equal(now.num, old.num, `entry ${i + 1} keeps its number`);
    assert.equal(now.grade.zh, old.grade, `entry ${i + 1} keeps its grade`);
    assert.deepEqual(now.verse.zh, old.verse, `entry ${i + 1} keeps its Chinese verse: ${now.verse.zh[0]}`);
    assert.equal(now.meaning.zh, old.meaning, `entry ${i + 1} keeps its Chinese note`);
  });
  DATA.forEach((e, i) => assert.equal(e.num, i + 1, `slip ${i + 1} is numbered ${i + 1}`));
});

test("daily-slip: every slip has both languages in the slip's shape", () => {
  const grades = { "上上": "Excellent", "上": "Good", "中": "Fair" };
  const seen = new Set();
  for (const e of DATA) {
    assert.equal(grades[e.grade.zh], e.grade.en, `slip ${e.num}: grade in both languages`);
    assert.equal(e.verse.zh.length, 3, `slip ${e.num}: three Chinese lines`);
    assert.equal(e.verse.en.length, 3, `slip ${e.num}: three English lines`);
    for (const line of [...e.verse.zh, ...e.verse.en]) {
      assert.equal(typeof line, "string", `slip ${e.num}: a line is text`);
      assert.ok(line.trim().length > 1, `slip ${e.num}: a line is not empty`);
      assert.doesNotMatch(line, EMOJI, `slip ${e.num}: no emoji`);
      assert.ok(!/\s{2,}/.test(line), `slip ${e.num}: no double space: ${line}`);
    }
    for (const text of [e.meaning.zh, e.meaning.en]) {
      assert.equal(typeof text, "string", `slip ${e.num}: a note in both languages`);
      assert.ok(text.trim().length > 5, `slip ${e.num}: the note says something`);
      assert.doesNotMatch(text, EMOJI, `slip ${e.num}: no emoji in the note`);
    }
    for (const line of e.verse.zh) {
      assert.ok(line.length <= ZH_MAX, `slip ${e.num}: Chinese line fits one slip line (${line.length}): ${line}`);
      assert.ok(!seen.has("zh:" + line), `slip ${e.num}: Chinese line repeated: ${line}`);
      seen.add("zh:" + line);
    }
    for (const line of e.verse.en) {
      assert.ok(line.length <= EN_MAX, `slip ${e.num}: English line fits one slip line (${line.length}): ${line}`);
      assert.ok(line.trim().split(/\s+/).length >= 2, `slip ${e.num}: no English line is one word: ${line}`);
    }
  }
});

test("daily-slip: no two slips open with the same line, in either language", () => {
  for (const lang of ["zh", "en"]) {
    const firsts = new Map();
    for (const e of DATA) {
      const line = e.verse[lang][0];
      assert.equal(firsts.get(line), undefined, `${lang} first line shared by slips ${firsts.get(line)} and ${e.num}: ${line}`);
      firsts.set(line, e.num);
    }
    assert.equal(firsts.size, DATA.length);
  }
});

test("daily-slip: the grades keep the mix of the first 32 slips", () => {
  const count = { "上上": 0, "上": 0, "中": 0 };
  for (const e of DATA) count[e.grade.zh]++;
  assert.deepEqual(Object.keys(count).sort(), ["上", "上上", "中"].sort());
  for (const [grade, n] of Object.entries(count)) {
    const share = n / DATA.length;
    assert.ok(share >= 0.2 && share <= 0.42, `${grade} is ${(share * 100).toFixed(1)}% of the slips`);
  }
  /* the first 32 were 11 / 12 / 9: 34% / 38% / 28% */
  assert.ok(count["上上"] > count["中"], "the hopeful slips stay more common than the fair ones");
});
