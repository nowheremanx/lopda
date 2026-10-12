// runtime/bookparse.js: text decoding, plain-text chapters, zip and EPUB reading, on small made-up books.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";
import { gbkEncode, makeZip, makeEpub } from "./book-fixtures.mjs";

const B = runScript("runtime/bookparse.js", {
  TextDecoder, Blob, Response, DecompressionStream, Uint8Array, Promise,
}).LopdaBook;
// results come from another vm realm: compare through JSON (which also proves they are plain data)
const J = (x) => JSON.parse(JSON.stringify(x));
const utf8 = (s) => new TextEncoder().encode(s);
const cat = (...a) => { const o = []; for (const x of a) o.push(...x); return Uint8Array.from(o); };

test("decodeText: UTF-8, BOMs, UTF-16, GBK", () => {
  const zh = "第一章 风起\n夜里下了一场雨，天亮时街上全是水。他撑着伞走过桥头，看见河面漂着落叶。\n".repeat(5);
  assert.deepEqual(J(B.decodeText(utf8("héllo 你好"))), { text: "héllo 你好", enc: "utf-8" });
  assert.deepEqual(J(B.decodeText(cat([0xef, 0xbb, 0xbf], utf8("abc你")))), { text: "abc你", enc: "utf-8" });
  const le = new Uint8Array(6), be = new Uint8Array(6);
  le.set([0xff, 0xfe, 0x41, 0, 0x60, 0x4f]); be.set([0xfe, 0xff, 0, 0x41, 0x4f, 0x60]);
  assert.deepEqual(J(B.decodeText(le)), { text: "A你", enc: "utf-16le" });
  assert.deepEqual(J(B.decodeText(be)), { text: "A你", enc: "utf-16be" });
  const g = B.decodeText(gbkEncode(zh));
  assert.equal(g.enc, "gbk");
  assert.equal(g.text, zh);
  // a few stray bytes in a long UTF-8 text stay UTF-8
  const long = utf8("plain english text ".repeat(100));
  const stray = cat(long, [0xff], long);
  assert.equal(B.decodeText(stray).enc, "utf-8");
});

test("guessLang", () => {
  assert.equal(B.guessLang("这是一本中文小说。"), "zh");
  assert.equal(B.guessLang("It was a bright cold day in April. 他"), "en");
  assert.equal(B.guessLang(""), "en");
  assert.equal(B.guessLang("Hello 你好 world and the rest of the English text goes on here for a while"), "en");
});

test("parseTxt: Chinese headings, subtitle rule, lines are paragraphs", () => {
  const txt = "﻿　　序章\n　　很久以前。\n第一章 风起\n　　风从北方来。\n　　他抬起头。\n第十二章\n风雨欲来\n　　天暗了。\n第3回\n　　三回。\n";
  const b = J(B.parseTxt(txt, "/books/我的书.txt"));
  assert.equal(b.title, "我的书");
  assert.equal(b.author, "");
  assert.equal(b.lang, "zh");
  assert.deepEqual(b.chapters.map((c) => c.title), ["序章", "第一章 风起", "第十二章 风雨欲来", "第3回"]);
  assert.deepEqual(b.chapters[1].paras, [{ h: 2, s: "第一章 风起" }, { h: 0, s: "风从北方来。" }, { h: 0, s: "他抬起头。" }]);
  assert.deepEqual(b.toc, [
    { title: "序章", ch: 0, p: 0, d: 0 }, { title: "第一章 风起", ch: 1, p: 0, d: 0 },
    { title: "第十二章 风雨欲来", ch: 2, p: 0, d: 0 }, { title: "第3回", ch: 3, p: 0, d: 0 },
  ]);
});

test("parseTxt: a heading with a title does not eat the next line; old-classic headings", () => {
  const b = J(B.parseTxt("第一章 风起\n他走了\n第二章\n他回来了。\n", "a.txt"));
  assert.deepEqual(b.chapters.map((c) => c.title), ["第一章 风起", "第二章"]);
  assert.equal(b.chapters[0].paras[1].s, "他走了");
  const l = J(B.parseTxt("学而第一\n子曰：学而时习之，不亦说乎。\n為政第二\n子曰：为政以德。\n", "lunyu.txt"));
  assert.deepEqual(l.chapters.map((c) => c.title), ["学而第一", "為政第二"]);
});

test("parseTxt: English CHAPTER with subtitle, hard-wrapped lines joined, text before the first heading kept", () => {
  const txt = [
    "The Project Gutenberg eBook", "", "Contents", "", "CHAPTER I.", "Down the Rabbit-Hole", "", "CHAPTER II.", "", "The Pool of Tears", "",
    "CHAPTER I.", "Down the Rabbit-Hole", "", "Alice was beginning to get very tired of sitting by her",
    "sister on the bank, and of having nothing to do.", "", "Suddenly a White Rabbit with pink eyes ran close by her.", "",
    "CHAPTER II.", "", "The Pool of Tears", "", "Curiouser and curiouser! cried Alice.", "",
  ].join("\r\n");
  const b = J(B.parseTxt(txt, "alice.TXT"));
  assert.equal(b.title, "alice");
  assert.equal(b.lang, "en");
  assert.deepEqual(b.chapters.map((c) => c.title), ["", "CHAPTER I. Down the Rabbit-Hole", "CHAPTER II. The Pool of Tears"]);
  // the contents block at the top (two headings, one right after the other) is dropped; "Contents" stays as front matter
  assert.deepEqual(b.chapters[0].paras.map((p) => p.s), ["The Project Gutenberg eBook", "Contents"]);
  assert.deepEqual(b.chapters[1].paras, [
    { h: 2, s: "CHAPTER I. Down the Rabbit-Hole" },
    { h: 0, s: "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do." },
    { h: 0, s: "Suddenly a White Rabbit with pink eyes ran close by her." },
  ]);
  assert.deepEqual(b.toc.map((t) => [t.title, t.ch]), [["CHAPTER I. Down the Rabbit-Hole", 1], ["CHAPTER II. The Pool of Tears", 2]]);
});

test("parseTxt: heading forms in English, and things that are not headings", () => {
  const h = (s) => J(B.parseTxt(s + "\nsome text here.\n", "x")).chapters[0].title;
  assert.equal(h("Chapter 12"), "Chapter 12");
  assert.equal(h("BOOK TWO"), "BOOK TWO");
  assert.equal(h("Part Twenty-One: Endings"), "Part Twenty-One: Endings");
  assert.equal(h("CHAPTER XIV. The Storm"), "CHAPTER XIV. The Storm");
  assert.equal(h("序言"), "序言");
  assert.equal(h("楔子 一"), "楔子 一");
  assert.equal(h("Part of the problem is this"), "");
  assert.equal(h("Chapter mix of things"), "");
  assert.equal(h("第一章".repeat(20)), "");
});

test("parseTxt: a TOC of headings at the top is dropped", () => {
  const txt = "目录\n第一章 起\n第二章 承\n第三章 合\n第一章 起\n甲乙丙丁。\n第二章 承\n戊己庚辛。\n第三章 合\n壬癸子丑。\n";
  const b = J(B.parseTxt(txt, "t.txt"));
  assert.deepEqual(b.chapters.map((c) => c.title), ["", "第一章 起", "第二章 承", "第三章 合"]);
  assert.deepEqual(b.chapters[0].paras, [{ h: 0, s: "目录" }]);
  assert.equal(b.chapters.length, 4);
});

test("parseTxt: no headings -> chunks of about 6000 characters at paragraph boundaries", () => {
  const para = "这是一个没有章节标题的段落，用来测试按长度切分。".repeat(10);   // 240 chars
  const txt = Array.from({ length: 80 }, () => para).join("\n");
  const b = J(B.parseTxt(txt, "plain.txt"));
  assert.ok(b.chapters.length >= 3 && b.chapters.length <= 4);
  assert.ok(b.chapters.every((c) => c.title === ""));
  const sizes = b.chapters.map((c) => c.paras.reduce((n, p) => n + p.s.length, 0));
  assert.ok(sizes.slice(0, -1).every((n) => n >= 6000 && n < 6000 + 240));
  assert.equal(b.chapters.reduce((n, c) => n + c.paras.length, 0), 80);
  assert.deepEqual(b.toc, []);
  assert.deepEqual(J(B.parseTxt("", "e.txt")).chapters, []);
});

test("parseTxt: CJK lines joined without a space, Latin with one", () => {
  const b = J(B.parseTxt("第一章\n\n他走进房间，\n看见桌上有一封信。\n\nHe read it\ntwice.\n", "j.txt"));
  const s = b.chapters[0].paras.map((p) => p.s);
  assert.ok(s.includes("他走进房间，看见桌上有一封信。"));
  assert.ok(s.includes("He read it twice."));
});

test("openZip: stored, deflated, missing, errors", async () => {
  const zip = B.openZip(makeZip([
    { name: "a.txt", data: "stored 你好", store: true },
    { name: "dir/b.txt", data: "deflated ".repeat(50) },
    { name: "empty.txt", data: "" },
  ]));
  assert.deepEqual(Array.from(zip.names), ["a.txt", "dir/b.txt", "empty.txt"]);
  assert.ok(zip.has("a.txt") && !zip.has("zzz"));
  assert.equal(await zip.text("a.txt"), "stored 你好");
  assert.equal(await zip.text("dir/b.txt"), "deflated ".repeat(50));
  assert.equal((await zip.read("empty.txt")).length, 0);
  await assert.rejects(zip.read("nope"), /not in zip/);
  assert.throws(() => B.openZip(utf8("this is not a zip file at all, not even close")), /not a zip/);
  // a trailing comment after the end record is allowed
  const z = makeZip([{ name: "x", data: "y", store: true }]);
  const commented = new Uint8Array(z.length + 7);
  commented.set(z);
  commented[z.length - 2] = 7;   // comment length
  commented.set(utf8("comment"), z.length);
  assert.equal(await B.openZip(commented).text("x"), "y");
  // an unsupported method fails clearly
  const bad = makeZip([{ name: "x", data: "y", store: true }]);
  const dv = new DataView(bad.buffer);
  dv.setUint16(8, 12, true);   // local header method
  const cdAt = bad.length - 22 - (46 + 1);
  dv.setUint16(cdAt + 10, 12, true);
  await assert.rejects(B.openZip(bad).read("x"), /unsupported zip compression/);
});

test("parseXhtml: paragraphs, headings, br, entities, emphasis, ignored parts, ids", () => {
  const r = B.parseXhtml(`<?xml version="1.0"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "x.dtd">
<html xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Ignore</title><style>p{}</style><script>if(a<b){}</script></head>
<!-- a comment <p>no</p> -->
<body>
<h2 id="top">Title &amp; <i>more</i></h2>
<p id=a>Hello   <em>big
 world</em>, it&apos;s &lt;fine&gt;&nbsp;now &#233;&#x4F60; &bogus; <![CDATA[<raw>]]></p>
<p>line one<br/>line two<br>line three</p>
<div><span id="in">inline</span> text <img src="x.png" alt="dropped"/> after <svg><text>no</text></svg>end</div>
<p><b>a</b><strong>b</strong> c <i>d</i><i>e</i></p>
<pre>
  keep
    this
</pre>
<p>   </p>
<ul><li>one</li><li>two <a href="#x">link</a></li></ul>
<p epub:type="x">last</p>
</body></html>`);
  const p = J(r.paras);
  assert.deepEqual(p[0], { h: 2, s: "Title & more", em: [8, 12] });
  assert.deepEqual(p[1], { h: 0, s: "Hello big world, it's <fine> now é你 &bogus; <raw>", em: [6, 15] });
  assert.deepEqual(p[2], { h: 0, s: "line one\nline two\nline three" });
  assert.deepEqual(p[3], { h: 0, s: "inline text after end" });
  assert.deepEqual(p[4], { h: 0, s: "ab c de", em: [0, 2, 5, 7] });
  assert.deepEqual(p[5], { h: 0, s: "  keep\n    this" });
  assert.deepEqual(p.slice(6).map((x) => x.s), ["one", "two link", "last"]);
  assert.equal(p.length, 9);
  assert.deepEqual(J(r.ids), { top: 0, a: 1, in: 3 });
});

test("parseXhtml: no body tag, unclosed tags, junk", () => {
  const r = B.parseXhtml("<p>one<p>two <b>bold<p>three");
  assert.deepEqual(J(r.paras), [{ h: 0, s: "one" }, { h: 0, s: "two bold", em: [4, 8] }, { h: 0, s: "three", em: [0, 5] }]);
  assert.deepEqual(J(B.parseXhtml("a < b and <3 <").paras), [{ h: 0, s: "a < b and <3 <" }]);
  assert.deepEqual(J(B.parseXhtml("").paras), []);
});

const CH1 = '<h1 id="t">One</h1><p>First <em>para</em>.</p><p id="mid">Middle<br/>break &amp; more</p><p>Last.</p>';
const CH2 = '<h1>Two</h1><p>Second chapter text.</p><p><span id="deep">Deep</span> anchor.</p>';

for (const nav of ["nav", "ncx"]) {
  test("parseEpub (" + nav + "): metadata, chapters, toc with fragments, cover dropped", async () => {
    const book = J(await B.parseEpub(makeEpub({
      title: "My Book & Co", author: "Some One", lang: "en-GB", nav,
      chapters: [
        { title: "Cover", html: '<div><img src="cover.jpg" alt="cover"/></div>' },
        { title: "Chapter One", html: CH1 },
        { title: "Chapter Two", html: CH2 },
      ],
      toc: [
        { title: "Cover", href: "text/ch1.xhtml", d: 0 },
        { title: "Chapter One", href: "text/ch2.xhtml", d: 0 },
        { title: "Middle part", href: "text/ch2.xhtml#mid", d: 1 },
        { title: "Chapter Two", href: "text/ch3.xhtml", d: 0 },
        { title: "Deep", href: "text/ch3.xhtml#deep", d: 1 },
        { title: "Deeper", href: "text/ch3.xhtml#nope", d: 2 },
        { title: "Not in spine", href: "other.xhtml", d: 0 },
      ],
    })));
    assert.equal(book.title, "My Book & Co");
    assert.equal(book.author, "Some One");
    assert.equal(book.lang, "en");
    assert.equal(book.chapters.length, 2);
    assert.deepEqual(book.chapters.map((c) => c.title), ["Chapter One", "Chapter Two"]);
    assert.deepEqual(book.chapters[0].paras, [
      { h: 1, s: "One" },
      { h: 0, s: "First para.", em: [6, 10] },
      { h: 0, s: "Middle\nbreak & more" },
      { h: 0, s: "Last." },
    ]);
    assert.deepEqual(book.toc, [
      { title: "Chapter One", ch: 0, p: 0, d: 0 },
      { title: "Middle part", ch: 0, p: 2, d: 1 },
      { title: "Chapter Two", ch: 1, p: 0, d: 0 },
      { title: "Deep", ch: 1, p: 2, d: 1 },
      { title: "Deeper", ch: 1, p: 0, d: 2 },
    ]);
  });
}

test("parseEpub: Chinese language, heading fallback for chapter titles, errors", async () => {
  const book = J(await B.parseEpub(makeEpub({
    title: "", author: "", lang: "zh-CN",
    chapters: [{ title: "x", html: "<h2>第一章</h2><p>你好，世界。</p>" }, { title: "y", html: "<p>no heading</p>" }],
    toc: [],
  })));
  assert.equal(book.lang, "zh");
  assert.deepEqual(book.chapters.map((c) => c.title), ["第一章", ""]);
  assert.deepEqual(book.toc, []);
  const guess = J(await B.parseEpub(makeEpub({ lang: "en", chapters: [{ title: "x", html: "<p>这是一本用中文写成的书，没有语言标记。</p>" }] })));
  assert.equal(guess.lang, "zh");
  await assert.rejects(B.parseEpub(makeZip([{ name: "a", data: "b" }])), /rootfile|not in zip/);
});
