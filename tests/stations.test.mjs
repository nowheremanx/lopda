// runtime/stations.js: the Tuner's station list logic (pure functions).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runScript } from "./helpers.mjs";

const raw = runScript("runtime/stations.js").LopdaStations;
// objects made inside the vm have another realm's prototypes; a JSON round trip lets deepEqual compare them
const plain = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const S = Object.assign({}, raw, {
  make: (...a) => plain(raw.make(...a)),
  merge: (...a) => plain(raw.merge(...a)),
  parse: (...a) => plain(raw.parse(...a)),
  fromDirectory: (...a) => plain(raw.fromDirectory(...a)),
  move: (...a) => plain(raw.move(...a)),
});
const names = (r) => r.stations.map((s) => s.name);
const urls = (r) => r.stations.map((s) => s.url);

test("constants", () => {
  assert.equal(S.MAX, 200);
  assert.equal(S.NAME_MAX, 60);
});

test("cleanUrl: http(s) only, trimmed, otherwise untouched", () => {
  assert.equal(S.cleanUrl("  https://a.com/x?y=1#z \n"), "https://a.com/x?y=1#z");
  assert.equal(S.cleanUrl("HTTP://A.com/Stream"), "HTTP://A.com/Stream");
  for (const bad of ["javascript:alert(1)", "data:audio/mp3;base64,AAAA", "ftp://a.com/x", "//a.com/x", "a.com/x",
    "https://", "https://a .com", "https://a.com/\u0001", "", null, undefined, 5, "http:///x"]) {
    assert.equal(S.cleanUrl(bad), null, String(bad));
  }
  assert.equal(S.cleanUrl("https://a.com/" + "x".repeat(2048)), null);
  assert.equal(S.cleanUrl("https://a.com/" + "x".repeat(2048 - 14)).length, 2048);
});

test("cleanName: tidy, cut by characters, host fallback", () => {
  assert.equal(S.cleanName("  Radio \t\n  Paradise\u0000 ", "https://x.com/"), "Radio Paradise");
  const long = "电台".repeat(50);
  const cut = S.cleanName(long, "https://x.com/");
  assert.equal(Array.from(cut).length, 60);
  assert.equal(cut, long.slice(0, 60));
  // astral characters count as one and are never split
  const astral = "\u{20BB7}".repeat(70);
  const c2 = S.cleanName(astral, "https://x.com/");
  assert.equal(Array.from(c2).length, 60);
  assert.ok(!/[\ud800-\udbff]$/.test(c2));
  assert.equal(S.cleanName("", "https://www.stream.radioparadise.com:8000/x"), "stream.radioparadise.com");
  assert.equal(S.cleanName("   ", "https://www.a.com/"), "a.com");
  assert.equal(S.cleanName("", "nonsense"), "?");
  assert.equal(S.cleanName(undefined), "?");
});

test("make: loose input to a station", () => {
  const s = S.make({ name: " Jazz ", url: "http://a.com/s", url_resolved: "https://b.com/s", homepage: "https://a.com",
    countrycode: "us", codec: "mp3", bitrate: 128.7 }, "id1");
  assert.deepEqual(s, { id: "id1", name: "Jazz", url: "https://b.com/s", home: "https://a.com", cc: "US", codec: "MP3", kbps: 128 });
  // https url stays when it is already https; http url_resolved does not beat it
  assert.equal(S.make({ url: "https://a.com/s", url_resolved: "https://b.com/s" }, "").url, "https://a.com/s");
  assert.equal(S.make({ url: "http://a.com/s", url_resolved: "http://b.com/s" }, "").url, "http://a.com/s");
  assert.equal(S.make({ url: "javascript:1", url_resolved: "http://b.com/s" }, "").url, "http://b.com/s");
  assert.equal(S.make({ url: "ftp://a.com" }, "x"), null);
  assert.equal(S.make(null, "x"), null);
  assert.equal(S.make("http://a.com", "x"), null);
  // optional fields are left out, not undefined
  const bare = S.make({ url: "http://a.com/s", cc: "USA", codec: "UNKNOWN", bitrate: 0, home: "nope" }, "z");
  assert.deepEqual(Object.keys(bare), ["id", "name", "url"]);
  assert.equal(bare.name, "a.com");
  assert.equal(S.make({ url: "http://a.com", codec: "aac+" }, "").codec, "AAC+");
  assert.equal("codec" in S.make({ url: "http://a.com", codec: "waytoolongcodecname" }, ""), false);
  assert.equal("codec" in S.make({ url: "http://a.com", codec: "a b" }, ""), false);
  assert.equal("kbps" in S.make({ url: "http://a.com", kbps: 5000 }, ""), false);
  assert.equal(S.make({ url: "http://a.com", kbps: 64 }, "").kbps, 64);
  assert.equal(S.make({ url: "http://a.com", cc: "de" }, "").cc, "DE");
});

test("sameUrl: scheme, trailing slash, host case", () => {
  assert.ok(S.sameUrl("http://a.com/s", "https://a.com/s"));
  assert.ok(S.sameUrl("http://a.com/s/", "http://a.com/s"));
  assert.ok(S.sameUrl("HTTP://A.COM", "https://a.com/"));
  assert.ok(!S.sameUrl("http://a.com/S", "http://a.com/s"), "path is case sensitive");
  assert.ok(!S.sameUrl("http://a.com/s?x=1", "http://a.com/s"));
  assert.ok(!S.sameUrl("http://a.com:8000/s", "http://a.com/s"));
  assert.ok(!S.sameUrl("http://a.com/s", "http://b.com/s"));
  assert.ok(!S.sameUrl("junk", "junk"));
});

test("merge: copy, dedupe, ids, MAX cap", () => {
  const list = [{ id: "a", name: "A", url: "http://a.com/s" }];
  const inc = [
    S.make({ url: "https://a.com/s/", name: "dup of list" }, ""),
    S.make({ url: "http://b.com/s", name: "B" }, ""),
    S.make({ url: "https://b.com/s", name: "dup in incoming" }, ""),
  ];
  const snapshot = JSON.stringify([list, inc]);
  let n = 0;
  const r = S.merge(list, inc, () => "n" + ++n);
  assert.equal(JSON.stringify([list, inc]), snapshot, "inputs untouched");
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 2);
  assert.equal(r.full, 0);
  assert.deepEqual(r.list.map((s) => s.id), ["a", "n1"]);
  assert.notEqual(r.list, list);

  const big = [];
  for (let i = 0; i < 198; i++) big.push({ id: "i" + i, name: "n", url: "http://h" + i + ".com/" });
  const many = [];
  for (let i = 0; i < 5; i++) many.push(S.make({ url: "http://new" + i + ".com/" }, ""));
  many.push(S.make({ url: "http://h0.com" }, ""));
  const r2 = S.merge(big, many, () => "x");
  assert.equal(r2.list.length, 200);
  assert.equal(r2.added, 2);
  assert.equal(r2.full, 3);
  assert.equal(r2.skipped, 1);
  assert.deepEqual(S.merge([], [], () => "q"), { list: [], added: 0, skipped: 0, full: 0 });
});

test("parse m3u: BOM, CRLF, CR, EXTINF titles", () => {
  const text = "﻿#EXTM3U\r\n#EXTINF:-1,First, One\r\nhttp://a.com/1\r\n#comment\r\nhttp://b.com/2\r#EXTINF:123,Third\rhttps://c.com/3\n\nftp://bad.com/x\njavascript:alert(1)\n";
  const r = S.parse(text);
  assert.equal(r.kind, "m3u");
  assert.deepEqual(names(r), ["First, One", "b.com", "Third"]);
  assert.deepEqual(urls(r), ["http://a.com/1", "http://b.com/2", "https://c.com/3"]);
  assert.equal(r.stations[0].id, "");
});

test("parse m3u: EXTINF attributes, comma inside quotes", () => {
  const text = '#EXTM3U\n#EXTINF:-1 tvg-name="x, y" group-title="z",Real Name\nhttp://a.com/1\n#EXTINF:-1 tvg-id="q",\nhttp://b.com/2\n';
  const r = S.parse(text);
  assert.deepEqual(names(r), ["Real Name", "b.com"]);
  const r2 = S.parse('#EXTINF:-1 tvg-name="x" group-title="y",Name\nhttp://a.com/1');
  assert.deepEqual(names(r2), ["Name"]);
});

test("parse pls: mixed order, NumberOfEntries", () => {
  const text = "[playlist]\r\nNumberOfEntries=3\r\nTitle2=Second\r\nFile2=http://b.com/2\r\nFile1=http://a.com/1\r\nTitle1=First\r\nFile3=ftp://bad.com\r\nLength1=-1\r\nVersion=2\r\n";
  const r = S.parse(text);
  assert.equal(r.kind, "pls");
  assert.deepEqual(names(r), ["First", "Second"]);
  assert.deepEqual(urls(r), ["http://a.com/1", "http://b.com/2"]);
  assert.equal(S.parse("File1=http://a.com/1\nTitle1=T").kind, "pls");
});

test("parse xspf: entities, CDATA, missing title", () => {
  const text = `<?xml version="1.0"?><playlist version="1" xmlns="http://xspf.org/ns/0/"><title>list</title><trackList>
<track><location>http://a.com/s?a=1&amp;b=2</location><title>Tom &amp; Jerry &lt;live&gt; &quot;q&quot; &apos;a&apos; &#20013;&#x6587; &#128512;</title></track>
<track><location><![CDATA[https://b.com/x]]></location></track>
<track><title>no location</title></track>
<track><location>ftp://c.com/x</location></track>
</trackList></playlist>`;
  const r = S.parse(text);
  assert.equal(r.kind, "xspf");
  assert.deepEqual(urls(r), ["http://a.com/s?a=1&b=2", "https://b.com/x"]);
  assert.equal(r.stations[0].name, 'Tom & Jerry <live> "q" \'a\' 中文 \u{1F600}');
  assert.equal(r.stations[1].name, "b.com");
  // the double-encoded ampersand is decoded once
  assert.equal(S.parse("<playlist><track><location>http://a.com/</location><title>x &amp;lt; y</title></track></playlist>").stations[0].name, "x &lt; y");
});

test("parse json: radio-browser array and our own shape", () => {
  const rb = JSON.stringify([
    { name: "RB One", url: "http://a.com/s", url_resolved: "https://a2.com/s", homepage: "https://a.com", countrycode: "DE", codec: "AAC", bitrate: 96 },
    "junk", 5, null, { name: "no url" }, { name: "Two", url: "http://b.com/s", url_resolved: "" },
  ]);
  const r = S.parse(rb);
  assert.equal(r.kind, "json");
  assert.equal(r.stations.length, 2);
  assert.deepEqual(r.stations[0], { id: "", name: "RB One", url: "https://a2.com/s", home: "https://a.com", cc: "DE", codec: "AAC", kbps: 96 });
  assert.equal(r.stations[1].url, "http://b.com/s");

  const own = JSON.stringify({ stations: [{ id: "q", name: "Mine", url: "https://m.com/s", home: "https://m.com", cc: "cn", codec: "MP3", kbps: 64 }] });
  const r2 = S.parse("  " + own + "\n");
  assert.equal(r2.kind, "json");
  assert.deepEqual(r2.stations, [{ id: "", name: "Mine", url: "https://m.com/s", home: "https://m.com", cc: "CN", codec: "MP3", kbps: 64 }]);

  assert.equal(S.parse('{"other":1}').kind, "none");
});

test("parse hls: a stream, not a list", () => {
  const r = S.parse("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg1.ts\nhttp://a.com/seg2.ts\n");
  assert.equal(r.kind, "hls");
  assert.equal(r.hls, true);
  assert.deepEqual(r.stations, []);
});

test("parse: garbage, empty, caps, hint", () => {
  for (const g of ["", "   \n", "hello world", "<html><body>404</body></html>", "{broken json", "#EXTM3U\n#EXTINF:-1,x\n", null, undefined]) {
    const r = S.parse(g);
    assert.equal(r.kind, "none", String(g));
    assert.deepEqual(r.stations, []);
  }
  let big = "";
  for (let i = 0; i < 1200; i++) big += "http://h" + i + ".com/s\n";
  const r = S.parse(big);
  assert.equal(r.kind, "m3u");
  assert.equal(r.stations.length, 1000);
  assert.equal(r.stations[999].url, "http://h999.com/s");
  // a track list without the playlist element needs the hint
  const bare = "<track><location>http://a.com/s</location></track>";
  assert.equal(S.parse(bare).kind, "none");
  assert.equal(S.parse(bare, "list.xspf?x=1").kind, "xspf");
});

test("toM3U: header, export, round trip", () => {
  assert.equal(S.toM3U([]), "#EXTM3U\n");
  const list = [
    { id: "1", name: "中文电台, 第一套", url: "https://a.com/s?x=1&y=2" },
    { id: "2", name: "Line\nbreak\r\nname", url: "http://b.com/s" },
    { id: "3", name: "Plain", url: "http://c.com/s" },
  ];
  const text = S.toM3U(list);
  assert.equal(text, "#EXTM3U\n#EXTINF:-1,中文电台, 第一套\nhttps://a.com/s?x=1&y=2\n#EXTINF:-1,Line break name\nhttp://b.com/s\n#EXTINF:-1,Plain\nhttp://c.com/s\n");
  const r = S.parse(text);
  assert.equal(r.kind, "m3u");
  assert.deepEqual(names(r), ["中文电台, 第一套", "Line break name", "Plain"]);
  assert.deepEqual(urls(r), list.map((s) => s.url));
});

test("fromDirectory: made stations plus uuid and hls", () => {
  const r = S.fromDirectory([
    { stationuuid: "960e57c5-0601-11e8-ae97-52543be04c81", name: "A", url: "http://a.com/s", url_resolved: "https://a.com/s", hls: 1, codec: "MP3", bitrate: 128, countrycode: "GB" },
    { stationuuid: "not hex!", name: "B", url: "http://b.com/s", hls: "1" },
    { stationuuid: "abc", name: "C", url: "http://c.com/s", hls: 0 },
    { name: "bad", url: "javascript:1" },
    null,
  ]);
  assert.equal(r.length, 3);
  assert.equal(r[0].uuid, "960e57c5-0601-11e8-ae97-52543be04c81");
  assert.equal(r[0].hls, true);
  assert.equal(r[0].url, "https://a.com/s");
  assert.equal(r[1].uuid, undefined);
  assert.equal("uuid" in r[1], false);
  assert.equal(r[1].hls, true);
  assert.equal("hls" in r[2], false);
  assert.equal(r[2].uuid, "abc");
  assert.deepEqual(S.fromDirectory("nope"), []);
  // make() alone never adds them
  assert.equal("uuid" in S.make({ stationuuid: "abc", url: "http://a.com", hls: 1 }, ""), false);
  assert.equal("hls" in S.make({ url: "http://a.com", hls: 1 }, ""), false);
});

test("kind: playlist, hls or stream, query strings ignored", () => {
  assert.equal(S.kind("http://a.com/list.m3u"), "playlist");
  assert.equal(S.kind("http://a.com/LIST.PLS"), "playlist");
  assert.equal(S.kind("http://a.com/l.xspf?x=1#y"), "playlist");
  assert.equal(S.kind("http://a.com/live.m3u8"), "hls");
  assert.equal(S.kind("http://a.com/live.M3U8?token=a.m3u"), "hls");
  assert.equal(S.kind("http://a.com/stream?file=x.m3u"), "stream");
  assert.equal(S.kind("http://a.com/stream.mp3"), "stream");
  assert.equal(S.kind("http://a.com/;"), "stream");
  assert.equal(S.kind(undefined), "stream");
});

test("move: copy, clamp, out of range", () => {
  const a = [1, 2, 3, 4];
  assert.deepEqual(S.move(a, 0, 2), [2, 3, 1, 4]);
  assert.deepEqual(S.move(a, 3, 0), [4, 1, 2, 3]);
  assert.deepEqual(S.move(a, 1, 99), [1, 3, 4, 2]);
  assert.deepEqual(S.move(a, 2, -5), [3, 1, 2, 4]);
  assert.deepEqual(S.move(a, 9, 0), a);
  assert.deepEqual(S.move(a, -1, 0), a);
  assert.deepEqual(a, [1, 2, 3, 4], "input untouched");
  assert.notEqual(S.move(a, 9, 0), a);
  assert.deepEqual(S.move([], 0, 0), []);
});
