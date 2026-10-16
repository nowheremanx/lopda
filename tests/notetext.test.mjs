// runtime/notetext.js: tags, search and snippets, the diary title, front matter, export file names (docs/design/notes.md section 9).
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
