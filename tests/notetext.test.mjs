// runtime/notetext.js: tags, search and snippets, the diary title, diaries by day, front matter, export file names (docs/design/notes.md section 9).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const NT = runScript("runtime/notetext.js").LopdaNoteText;
const L = runScript("runtime/lunar.js").LopdaLunar;
const strings = (lang) => { const s = runScript("runtime/strings.js", { navigator: { languages: [lang], language: lang } }).LopdaStrings; return s.t; };
const zh = strings("zh-CN"), en = strings("en-US");
const plain = (v) => JSON.parse(JSON.stringify(v));

test("quote: src reader or dict; or no src and a 《…》 title (old quotes, quotes after export and import)", () => {
  assert.equal(NT.quote({ body: "《Alice》\n\n「text」", src: "reader" }), true);
  assert.equal(NT.quote({ body: "《词典》", src: "dict" }), true);
  assert.equal(NT.quote({ body: "anything", src: "dict" }), true);
  /* written before 0.21.0: no src */
  assert.equal(NT.quote({ body: "《Alice’s Adventures in Wonderland》\n\n「Down the Rabbit-Hole」", updated: 1 }), true);
  /* back from an export: front matter parsed off, the body as it was, no src */
  const back = NT.parseFront("---\ncreated: 2026-10-14T09:41:00+08:00\ntags: []\n---\n《红楼梦》 第一回\n「满纸荒唐言」\n");
  assert.equal(NT.quote({ body: back.body }), false, "the reader's quote line is not the title");
  assert.equal(NT.quote({ body: NT.parseFront("---\ntags: []\n---\n《红楼梦》\n\n《红楼梦》 第一回\n「满纸荒唐言」").body }), true);
  assert.equal(NT.quote({ body: "  《词典》  \n" }), true, "the title is trimmed");
  /* one or more characters between the brackets, nothing else on the line */
  for (const body of ["《》", "《红楼梦》读后", "读《红楼梦》", "《红楼梦》《西游记》", "红楼梦", "", "\n《红楼梦》"]) assert.equal(NT.quote({ body }), false, body);
  /* a src that is not a quote's wins over the title */
  assert.equal(NT.quote({ body: "《红楼梦》", src: "other" }), false);
  assert.equal(NT.quote(null), false);
});

test("tags: # and ＃, Chinese and English, in order, once each", () => {
  assert.deepEqual(plain(NT.tags("今天 #读书 读完了 #idea_1，还有＃想法。#读书 again")), ["读书", "idea_1", "想法"]);
  assert.deepEqual(plain(NT.tags("#Idea and #ｉｄｅａ and #IDEA")), ["Idea"]);
  assert.equal(NT.key("ｉｄｅａ"), NT.key("IDEA"));
});

test("tags: a space after # is no tag, nor is a # inside a word or a link; at most 20 characters", () => {
  assert.deepEqual(plain(NT.tags("# 标题\n## 小标题\n#\n# ")), []);
  assert.deepEqual(plain(NT.tags("C# and page#anchor and &#39; and a/b#c")), []);
  assert.deepEqual(plain(NT.tags("读书#好书")), ["好书"]);
  const long = "一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑";
  assert.deepEqual(plain(NT.tags("#" + long)), [long.slice(0, 20)]);
  assert.equal(NT.TAG_MAX, 20);
  assert.deepEqual(plain(NT.tags("")), []);
  assert.deepEqual(plain(NT.tags(null)), []);
});

test("title: the first line, trimmed", () => {
  assert.equal(NT.title("  买胶卷 \n周六"), "买胶卷");
  assert.equal(NT.title(""), "");
});

test("search: case and width do not matter, Chinese by substring", () => {
  assert.ok(NT.search("Film: 8 frames", "FILM"));
  assert.ok(NT.search("Ｆｉｌｍ ８", "film 8"));
  assert.ok(NT.search("film 8", "ＦＩＬＭ"));
  assert.ok(NT.search("周六去裁片", "裁片"));
  assert.equal(NT.search("周六去裁片", "裁纸"), null);
  assert.equal(NT.search("anything", "  "), null);
  assert.equal(NT.search("", "a"), null);
});

test("search: the hit's position in the original text, and the snippet around it", () => {
  const body = "第一行标题\n" + "一二三四五六七八九十甲乙丙丁" + "公园" + "子丑寅卯辰巳午未申酉戌亥天地";
  const h = NT.search(body, "公园");
  assert.equal(body.slice(h.at, h.end), "公园");
  assert.equal(h.hit, "公园");
  assert.equal(h.before, "三四五六七八九十甲乙丙丁");
  assert.equal(Array.from(h.before).length, NT.AROUND);
  assert.equal(h.after, "子丑寅卯辰巳午未申酉戌亥");
  assert.equal(h.lead, true);
  assert.equal(h.tail, true);
  /* near the start: nothing cut before; newlines read as spaces */
  const s = NT.search("买胶卷\n周六去裁片", "周六");
  assert.deepEqual([s.before, s.hit, s.after, s.lead, s.tail], ["买胶卷 ", "周六", "去裁片", false, false]);
  /* full-width letters in the body: the hit is the original characters */
  const w = NT.search("我的 ＦＩＬＭ 卷", "film");
  assert.equal(w.hit, "ＦＩＬＭ");
  /* a character that folds into two (ﬁ -> fi) maps back onto the whole character */
  const f = NT.search("a ﬁle", "fi");
  assert.equal(f.hit, "ﬁ");
  /* astral characters stay whole in the snippet */
  const a = NT.search("𠀀𠀁𠀂 x", "x");
  assert.equal(a.before, "𠀀𠀁𠀂 ");
});

test("the diary title: the date, the weekday and the lunar day; a solar term when there is one; English is the date only", () => {
  assert.equal(NT.diaryTitle("2026-10-15", "zh", zh, L), "10月15日 周四 · 九月初六");
  assert.equal(NT.diaryTitle("2026-10-08", "zh", zh, L), "10月8日 周四 · 八月廿八 · 寒露");
  assert.equal(NT.diaryTitle("2025-07-25", "zh", zh, L), "7月25日 周五 · 闰六月初一");
  assert.equal(NT.diaryTitle("2026-10-15", "en", en, L), "Thu 15 Oct");
  assert.equal(NT.diaryTitle("2026-10-08", "en", en, L), "Thu 8 Oct");
  assert.equal(NT.diaryTitle("2026-10-15", "zh", zh, L, true), "10月15日 周四");
  assert.equal(NT.diaryTitle("2026-13-01", "zh", zh, L), "");
  /* outside the lunar table: the date alone */
  assert.equal(NT.diaryTitle("1899-12-31", "zh", zh, L), "12月31日 周日");
});

test("when: the read view's line, the options' stamp, and list rows by today, this year, before; zh and en", () => {
  const now = new Date(2026, 9, 16, 9, 0).getTime(), at = (...a) => new Date(...a).getTime();
  const ts = at(2025, 9, 15, 21, 4);
  assert.equal(NT.when(ts, "full", zh, now), "2025年10月15日 周三 21:04");
  assert.equal(NT.when(ts, "full", en, now), "Wed 15 Oct 2025, 21:04");
  assert.equal(NT.when(at(2026, 2, 5, 8, 0), "stamp", zh, now), "2026.03.05 08:00");
  assert.equal(NT.when(at(2026, 2, 5, 8, 0), "stamp", en, now), "5 Mar 2026, 08:00");
  const list = (lang) => [at(2026, 9, 16, 7, 5), at(2026, 2, 5, 8, 0), ts, at(2025, 2, 5)].map((x) => NT.when(x, "list", lang, now));
  assert.deepEqual(list(zh), ["07:05", "3月5日", "2025.10.15", "2025.03.05"]);
  assert.deepEqual(list(en), ["07:05", "5 Mar", "15 Oct 2025", "5 Mar 2025"]);
  /* yesterday is a day, not a time */
  assert.equal(NT.when(at(2026, 9, 15, 23, 59), "list", zh, now), "10月15日");
  assert.equal(NT.count("一二 three\n\t四 "), 8);
});

test("dayKey is the local date", () => {
  assert.equal(NT.dayKey(new Date(2026, 9, 5, 23, 59).getTime()), "2026-10-05");
  assert.equal(NT.dayKey(new Date(2026, 0, 1, 0, 0).getTime()), "2026-01-01");
});

test("front matter: written as the spec shows, and read back", () => {
  const created = new Date(2026, 9, 15, 23, 43, 0).getTime(), updated = new Date(2026, 9, 16, 8, 1, 12).getTime();
  const fm = NT.frontMatter({ created, updated, tags: ["读书", "想法"], pinned: true, date: "2026-10-15" });
  assert.match(fm, /^---\ncreated: 2026-10-15T23:43:00[+-]\d\d:\d\d\nupdated: 2026-10-16T08:01:12[+-]\d\d:\d\d\ntags: \[读书, 想法\]\npinned: true\ndate: 2026-10-15\n---\n$/);
  const body = "10月15日 周四\n今天 #读书\n\n---\n不是 front matter\n---\n";
  const back = NT.parseFront(fm + body);
  assert.equal(back.body, body);
  assert.deepEqual(plain(back.meta), { created, updated, pinned: true, date: "2026-10-15" });
  /* pinned and date only when there; tags that are not plain words are quoted */
  const bare = NT.frontMatter({ created, updated, tags: ["a b", "true", "x"] });
  assert.doesNotMatch(bare, /^(pinned|date):/m);
  assert.match(bare, /tags: \["a b", "true", x\]/);
  assert.deepEqual(plain(NT.parseFront(bare + "x").meta), { created, updated });
});

test("front matter: other programs' blocks, CRLF, a BOM; text without one stays as it was", () => {
  const r = NT.parseFront("\uFEFF---\r\ntitle: Hello\r\ncreated: 2024-03-01T10:00:00Z\r\ntags:\r\n  - a\r\n  - b\r\naliases: []\r\n---\r\nHello\r\nworld");
  assert.equal(r.body, "Hello\r\nworld");
  assert.deepEqual(plain(r.meta), { created: Date.parse("2024-03-01T10:00:00Z") });
  assert.deepEqual(plain(NT.parseFront("---\ndate: 2024-02-30 junk\npinned: yes\n---\nx").meta), { pinned: true });
  /* a horizontal rule and prose are not a block */
  for (const t of ["---\n这不是\n---\n正文", "--- \n\n", "正文\n---\na: b\n---\n", "---\nno closing"]) assert.equal(NT.parseFront(t).body, t, t);
  assert.deepEqual(plain(NT.parseFront("---\ncreated: never\n---\nx")), { meta: {}, body: "x" });
});

test("file names: cleaned, at most 60 characters, never empty, never hidden; duplicates get (2), (3), ignoring case", () => {
  assert.equal(NT.cleanName('a/b\\c:d*e?f"g<h>i|j\u0001k', "未命名"), "abcdefghijk");
  assert.equal(NT.cleanName("  ...  ", "未命名"), "未命名");
  assert.equal(NT.cleanName(".hidden note.", "x"), "hidden note");
  assert.equal(NT.cleanName("", "未命名"), "未命名");
  assert.equal(NT.cleanName("一行\t两\n个", "x"), "一行 两 个");
  assert.equal(Array.from(NT.cleanName("字".repeat(80) + "𠀀", "x")).length, 60);
  const used = {};
  assert.equal(NT.fileName("读书", "未命名", used), "读书.md");
  assert.equal(NT.fileName("读书", "未命名", used), "读书 (2).md");
  assert.equal(NT.fileName("读书", "未命名", used), "读书 (3).md");
  assert.equal(NT.fileName("Idea", "未命名", used), "Idea.md");
  assert.equal(NT.fileName("IDEA", "未命名", used), "IDEA (2).md");
  assert.equal(NT.fileName("", "未命名", used), "未命名.md");
  assert.equal(NT.fileName("", "未命名", used), "未命名 (2).md");
  assert.equal(NT.fileName("读书", "未命名", used, "日记/"), "日记/读书.md");
  assert.equal(NT.stem("日记/10月15日.md"), "10月15日");
  assert.equal(NT.stem("notes.v2.txt"), "notes.v2");
  assert.equal(NT.stem(".md"), ".md");
});

test("diaryIndex: the calendar's days, month days and same-day diaries across years; the trash and plain notes left out", () => {
  const notes = [
    { id: "a", day: "2026-10-01", body: "10月1日 周四\n国庆，去爬山。", updated: 5 },
    { id: "b", day: "2025-10-01", body: "10月1日 周三\n去年国庆\n在家。", updated: 3 },
    { id: "c", day: "2024-10-01", body: "10月1日 周二\n前年。", updated: 2, deleted: 9 },
    { id: "d", day: "2023-10-01", body: "10月1日 周日", updated: 1 },
    { id: "e", day: "2026-10-15", body: "10月15日\n早", updated: 7 },
    { id: "f", day: "2026-10-15", body: "10月15日\n晚，改过", updated: 8 },
    { id: "g", day: "2026-11-01", body: "11月1日\n立冬前", updated: 4 },
    { id: "h", body: "读书笔记\n没有日期", updated: 6 },
    { id: "i", day: "2026-02-30", body: "坏日期", updated: 1 },
    { id: "j", day: "2026-10-03", body: "10月3日\n在回收站", updated: 1, deleted: 2 }
  ];
  const ix = NT.diaryIndex(notes);
  assert.deepEqual(Object.keys(ix.days).sort(), ["2023-10-01", "2025-10-01", "2026-10-01", "2026-10-15", "2026-11-01"]);
  assert.equal(ix.days["2026-10-15"].id, "f", "two diaries on one day: the one changed last");
  assert.deepEqual(plain(ix.months["2026-10"]), { 1: true, 15: true });
  assert.deepEqual(plain(ix.months["2026-11"]), { 1: true });
  assert.equal(ix.months["2024-10"], undefined, "a diary in the trash marks nothing");
  assert.deepEqual(plain(ix.md["10-01"].map((n) => n.id)), ["a", "b", "d"], "every year, newest first, the trash left out");
  assert.deepEqual(plain(ix.md["10-15"].map((n) => n.id)), ["f"]);
  assert.equal(ix.md["10-03"], undefined);
  /* nothing to index */
  assert.deepEqual(plain(NT.diaryIndex([])), { days: {}, months: {}, md: {} });
  assert.deepEqual(plain(NT.diaryIndex(null)), { days: {}, months: {}, md: {} });
});

test("snippet: the text after the title line, on one line, cut at SNIPPET characters", () => {
  assert.equal(NT.snippet("10月1日 周三\n去年国庆\n  在家。"), "去年国庆 在家。");
  assert.equal(NT.snippet("只有标题"), "");
  assert.equal(NT.snippet(""), "");
  assert.equal(Array.from(NT.snippet("t\n" + "字".repeat(100) + "𠀀")).length, NT.SNIPPET);
  assert.equal(NT.snippet("t\nabcdef", 3), "abc");
});

test("app notes: src app:<id>; the checks on a title and a text; never a quote", () => {
  assert.equal(NT.appSrc("tilt-maze"), "app:tilt-maze");
  assert.equal(NT.appOf({ src: "app:tilt-maze" }), "tilt-maze");
  assert.equal(NT.appOf("app:tilt-maze"), "tilt-maze");
  for (const src of ["reader", "dict", "app:", "app:AB", "app:x", "app:../x", "app:a b", undefined]) assert.equal(NT.appOf({ src }), null, String(src));
  assert.equal(NT.quote({ body: "《战绩》\n\n120", src: "app:tilt-maze" }), false, "an app's 《…》 note is not a quote");
  assert.equal(NT.appCheck("Scores", "Mon 120"), "");
  assert.equal(NT.appCheck("字".repeat(64), "x"), "", "64 characters, not bytes");
  assert.match(NT.appCheck("字".repeat(65), "x"), /64/);
  assert.equal(NT.appCheck("t", "字".repeat(1365)), "", "4095 bytes of UTF-8");
  assert.match(NT.appCheck("t", "字".repeat(1366)), /4 KB/);
  assert.equal(NT.appCheck("t", "a".repeat(4096)), "");
  assert.match(NT.appCheck("t", "a".repeat(4097)), /4 KB/);
  for (const [t, x] of [["", "x"], ["  ", "x"], ["a\nb", "x"], ["a\rb", "x"], ["t", ""], ["t", " \n "], [1, "x"], ["t", null]]) assert.ok(NT.appCheck(t, x), JSON.stringify([t, x]));
});

test("app notes: an app adds only to its own note with that title, the one outside the trash first, then the newest", () => {
  const notes = [
    { id: "u", body: "Scores\n\nmine", updated: 9 },                             /* the player's note */
    { id: "o", body: "Scores\n\nother app", updated: 9, src: "app:other" },       /* another app's */
    { id: "q", body: "Scores\n\nquote", updated: 9, src: "reader" },
    { id: "t", body: "Scores\n\nold", updated: 8, src: "app:maze", deleted: 5 },
    { id: "a", body: "Scores\n\n120", updated: 3, src: "app:maze" },
    { id: "b", body: "Scores\n\n130", updated: 4, src: "app:maze" },
    { id: "c", body: "Other\n\n1", updated: 7, src: "app:maze" },
  ];
  assert.equal(NT.appNote(notes, "maze", "Scores").id, "b");
  assert.equal(NT.appNote(notes, "maze", " Scores ").id, "b");
  assert.equal(NT.appNote(notes.filter((n) => n.id !== "a" && n.id !== "b"), "maze", "Scores").id, "t", "one in the trash comes back");
  assert.equal(NT.appNote(notes, "new-app", "Scores"), null);
  assert.equal(NT.appNote(notes.slice(0, 3), "maze", "Scores"), null, "never the player's or another app's");
});

test("app notes: the dialog's preview is the first 6 lines and at most 240 characters, … when there is more", () => {
  assert.equal(NT.preview("one\ntwo"), "one\ntwo");
  assert.equal(NT.preview("1\n2\n3\n4\n5\n6\n7\n8"), "1\n2\n3\n4\n5\n6…");
  assert.equal(NT.preview("1\n2\n3\n4\n5\n6\n\n"), "1\n2\n3\n4\n5\n6", "trailing blank lines are nothing more");
  assert.equal(NT.preview("字".repeat(300)), "字".repeat(240) + "…");
  assert.equal(NT.preview("a\r\nb"), "a\nb");
});

test("app notes: front matter carries source: app:<id> and reads it back; nothing else counts as a source", () => {
  const fm = NT.frontMatter({ created: 0, updated: 0, tags: [], source: "app:tilt-maze" });
  assert.match(fm, /\nsource: app:tilt-maze\n---\n$/);
  assert.equal(NT.parseFront(fm + "Scores\n\n120").meta.source, "app:tilt-maze");
  assert.doesNotMatch(NT.frontMatter({ created: 0, updated: 0, tags: [] }), /source/);
  for (const v of ["reader", "dict", "app:", "app:Bad Id", "x"]) assert.equal(NT.parseFront("---\nsource: " + v + "\n---\nx").meta.source, undefined, v);
});
