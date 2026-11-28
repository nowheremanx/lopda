/* Sisyphus: the sixteen lines. French originals: Albert Camus, Le Mythe de Sisyphe (1942).
   Chinese and English translations for this work; not a published translation. */
var QS = (function () {
  var QUOTES = [
    { id: "1", zh: "真正严肃的哲学问题只有一个：自杀。",
      en: "There is only one truly serious philosophical problem: suicide." },
    { id: "2", zh: "人与自己的生活、演员与布景之间的离异，正是荒诞之感。",
      en: "The divorce between a man and his life, the actor and his setting: that is the absurd." },
    { id: "3", zh: "荒诞诞生于人的呼唤与世界不合理的沉默之间的对峙。",
      en: "The absurd is born between the human call and the world's unreasonable silence." },
    { id: "4", zh: "荒诞既系于人，也系于世界。",
      en: "The absurd depends as much on man as on the world." },
    { id: "5", zh: "诸神判罚西西弗斯把巨石推上山顶，石头又因自身重量滚落。",
      en: "The gods condemned Sisyphus to roll a rock uphill; it fell by its own weight." },
    { id: "6", zh: "西西弗斯是荒诞的英雄：既因他的激情，也因他的磨难。",
      en: "Sisyphus is the absurd hero: as much by his passions as by his torment." },
    { id: "7", zh: "归途与停顿中，西西弗斯令我着迷。贴近石头劳作的脸，已是石头。",
      en: "Sisyphus interests me in the return, the pause: a face so close to stone is stone." },
    { id: "8", zh: "每当他离开山顶，他便高于自己的命运。他比他的巨石更强。",
      en: "Each time he leaves the summit he is superior to his fate, stronger than his rock." },
    { id: "9", zh: "这神话之所以悲壮，是因为它的英雄有意识。",
      en: "If this myth is tragic, it is because its hero is conscious." },
    { id: "10", zh: "没有哪一种命运不能靠蔑视去战胜。",
      en: "There is no fate that cannot be surmounted by scorn." },
    { id: "11", zh: "幸福与荒诞是同一片土地上的两个儿子，不可分离。",
      en: "Happiness and the absurd are two sons of the same earth. They are inseparable." },
    { id: "12", zh: "西西弗斯全部无声的欢乐就在于此：命运属于他，巨石也属于他。",
      en: "All Sisyphus's silent joy is there: his fate belongs to him, his rock is his own." },
    { id: "13", zh: "没有不带阴影的太阳，人必须认识黑夜。",
      en: "There is no sun without shadow, and one must know the night." },
    { id: "14", zh: "荒诞的人说「是」，他的努力从此不会停歇。",
      en: "The absurd man says yes, and his effort will never cease." },
    { id: "15", zh: "向着高处挣扎本身，就足以填满一个人的心。",
      en: "The struggle itself toward the heights is enough to fill a man's heart." },
    { id: "16", zh: "我们必须想象西西弗斯是幸福的。",
      en: "One must imagine Sisyphus happy." }
  ];
  var byId = {};
  QUOTES.forEach(function (q) { byId[q.id] = q; });

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function allIds() {
    return QUOTES.map(function (q) { return q.id; });
  }

  /* The first summit is always the last line; after that a shuffled deck, no immediate repeat. */
  function next(state) {
    if (state.summits === 0) {
      state.lastQuote = "16";
      return byId["16"];
    }
    if (!state.deck || !state.deck.length) state.deck = shuffle(allIds());
    var id = state.deck.shift();
    if (id === state.lastQuote && state.deck.length) {
      var swap = state.deck[0];
      state.deck[0] = id;
      id = swap;
    }
    state.lastQuote = id;
    return byId[id];
  }

  /* the day as it is kept in a save: "2026年11月26日", whatever the language */
  function dateText(d) {
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* a kept day shown in the player's language; anything it cannot read stays as it is */
  function dayText(kept, lang) {
    if (lang !== "en") return kept;
    var m = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(kept);
    if (!m || +m[2] < 1 || +m[2] > 12) return kept;
    return MONTHS[+m[2] - 1] + " " + (+m[3]) + ", " + m[1];
  }

  /* the note's title: the player's language picks it, the zh one is the original
     name (older handbooks keep growing under it) */
  function noteTitle(lang) {
    return lang === "en" ? "A Manual of Happiness" : "幸福手册";
  }

  /* at: {n, d} for the summit and the day the line was given (a bare number is
     today's summit n). Without it, the note says only the day it was copied, so the
     handbook never claims a summit or a day it does not know. The line itself is
     written in both languages, as on the card; the frame around it follows lang. */
  function noteText(q, at, lang) {
    var en = lang === "en";
    if (typeof at === "number") at = { n: at, d: dateText(new Date()) };
    var today = dayText(dateText(new Date()), lang);
    var head = at && at.n > 0 && at.d
      ? (en ? dayText(at.d, lang) + " · Summit " + at.n : at.d + " · 第 " + at.n + " 次登顶")
      : (en ? "Copied " + today : "抄于 " + today);
    return head + "\n\n"
      + "「" + q.zh + "」\n"
      + "\"" + q.en + "\"\n\n"
      + (en ? "— Albert Camus, The Myth of Sisyphus" : "—— 加缪《西西弗斯神话》");
  }

  /* a saved got record: only lines in the seen list, each {n > 0, d a short string} */
  function cleanGot(v, seen) {
    var out = {};
    if (!v || typeof v !== "object") return out;
    (seen || []).forEach(function (id) {
      var r = v[id];
      if (r && typeof r === "object" && (r.n | 0) > 0 && typeof r.d === "string" && r.d.length <= 24) out[id] = { n: r.n | 0, d: r.d };
    });
    return out;
  }

  function seenList(state) {
    var out = [];
    (state.seen || []).forEach(function (id) { if (byId[id]) out.push(byId[id]); });
    return out;
  }

  return { QUOTES: QUOTES, byId: byId, next: next, noteText: noteText, noteTitle: noteTitle, dateText: dateText, dayText: dayText, cleanGot: cleanGot, seenList: seenList };
})();
