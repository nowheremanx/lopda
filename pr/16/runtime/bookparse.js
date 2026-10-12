// Lo-PDA: e-book parsing (plain text with GBK detection, EPUB). Bytes in, a plain-data book out.
// Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
//
// Pure functions, so the reader, the store and the tests share one engine. A book holds only plain
// objects, arrays, strings and numbers, so IndexedDB keeps it as is:
//   { title, author, lang: "zh"|"en", chapters: [{ title, paras: [{ h, s, em? }] }], toc: [{ title, ch, p, d }] }
//   h = 0 for body text, 1..6 for a heading level; s may hold "\n" (a <br>); em = flat [a0,b0,a1,b1..]
//   character ranges [a,b) of s that are emphasised. toc: ch chapter index, p paragraph index, d depth.
// No DOMParser (not in Node, and a hostile file should not meet a real HTML parser): a small tolerant
// tokenizer below reads XHTML, OPF, NCX and the EPUB 3 nav document.
(function () {
  "use strict";

  /* ---------- text decoding ---------- */

  function isCjk(c) {
    return (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) || (c >= 0xF900 && c <= 0xFAFF);
  }
  // for joining hard-wrapped lines: ideographs and CJK / full-width punctuation never need a space between them
  function isWide(c) {
    return isCjk(c) || (c >= 0x3000 && c <= 0x303F) || (c >= 0xFF00 && c <= 0xFFEF);
  }

  function dec(label, u8) {
    return new TextDecoder(label).decode(u8);
  }

  function countBad(s) {
    var m = s.match(/\uFFFD/g);
    return m ? m.length : 0;
  }

  function decodeText(u8) {
    var n = u8.length, text, enc, bad, alt;
    if (n >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) {
      text = dec("utf-8", u8.subarray(3)); enc = "utf-8";
    } else if (n >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) {
      text = dec("utf-16le", u8.subarray(2)); enc = "utf-16le";
    } else if (n >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) {
      text = dec("utf-16be", u8.subarray(2)); enc = "utf-16be";
    } else {
      text = dec("utf-8", u8); enc = "utf-8";
      bad = countBad(text);
      // GBK text read as UTF-8 breaks on roughly every other character, a good UTF-8 file with a few
      // stray bytes breaks on almost none: 1 in 200 characters sits safely between the two. Counted over the
      // whole text, a Chinese book can start with an ASCII preface. GBK wins only if it breaks less.
      if (bad * 200 > text.length) {
        try {
          alt = dec("gbk", u8);
          if (countBad(alt) < bad) { text = alt; enc = "gbk"; }
        } catch (e) { /* no GBK decoder in this browser: keep UTF-8 */ }
      }
    }
    return { text: text.replace(/^\uFEFF/, ""), enc: enc };
  }

  function guessLang(text) {
    var s = String(text).slice(0, 40000), i, c, total = 0, cjk = 0;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c <= 32 || c === 0x3000 || c === 0xA0) continue;
      total++;
      if (isCjk(c)) cjk++;
    }
    return total > 0 && cjk * 10 > total ? "zh" : "en";
  }

  /* ---------- plain text ---------- */

  var ZH_NUM = "[0-9\uFF10-\uFF19\u96F6\u3007\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341\u767E\u5343\u4E07\u4E24]+";
  var ZH_NUM_ONLY = "[\u96F6\u3007\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341\u767E\u5343\u4E07\u4E24]+";
  // 第 + number + 章回节卷集部篇, then an optional title (with or without a separator)
  var RE_ZH_CH = new RegExp("^\u7B2C\\s*" + ZH_NUM + "\\s*[\u7AE0\u56DE\u8282\u7BC0\u5377\u96C6\u90E8\u7BC7](?:[\\s:\uFF1A\u3001.\uFF0E\\-\u2014]*(\\S.*))?$");
  // old classics: 学而第一, 為政第二
  var RE_ZH_OLD = new RegExp("^[\u4E00-\u9FFF]{1,4}\u7B2C" + ZH_NUM_ONLY + "$");
  var RE_ZH_SPECIAL = /^(?:\u5E8F\u7AE0|\u5E8F\u8A00|\u6954\u5B50|\u5F15\u5B50|\u5C3E\u58F0|\u540E\u8BB0|\u5F8C\u8A18|\u756A\u5916|\u524D\u8A00)(?:[\s:\uFF1A\-\u2014]+(\S.*))?$/;
  var EN_WORDS = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)";
  var RE_EN_HEAD = /^(?:Chapter|CHAPTER|Book|BOOK|Part|PART)\s+(.+)$/;
  var RE_EN_NUM = /^(?:\d+|[IVXLCDM]+)(?![A-Za-z0-9])\.?(?:[\s:\-\u2014]+(\S.*))?$/;
  var RE_EN_WORD = new RegExp("^" + EN_WORDS + "(?:[- ]" + EN_WORDS + ")*(?![A-Za-z])\\.?(?:[\\s:\\-\u2014]+(\\S.*))?$", "i");
  var RE_END_PUNCT = /[\u3002.!?\uFF01\uFF1F"\u201D\u2019'\u300D\u300F\u2026,\uFF0C;\uFF1B:\uFF1A\u3001)\uFF09]$/;

  // null when the line is not a chapter heading; else { bare } (bare: nothing but the number, a subtitle may follow)
  function headType(line) {
    var m, r;
    if (!line || line.length > 40) return null;
    m = RE_ZH_CH.exec(line);
    if (m) return { bare: !m[1] };
    if (RE_ZH_OLD.test(line)) return { bare: false };
    m = RE_ZH_SPECIAL.exec(line);
    if (m) return { bare: !m[1] };
    m = RE_EN_HEAD.exec(line);
    if (m) {
      r = RE_EN_NUM.exec(m[1]) || RE_EN_WORD.exec(m[1]);
      if (r) return { bare: !r[1] };
    }
    return null;
  }

  function isSubLine(s) {
    return !!s && s.length <= 40 && !RE_END_PUNCT.test(s) && !headType(s);
  }

  function joinLines(parts) {
    var out = parts[0], k, a, b;
    for (k = 1; k < parts.length; k++) {
      a = out.charCodeAt(out.length - 1);
      b = parts[k].charCodeAt(0);
      out += (isWide(a) && isWide(b) ? "" : " ") + parts[k];
    }
    return out;
  }

  function nameToTitle(name) {
    var s = String(name || "").replace(/^.*[\\\/]/, "");
    return s.replace(/\.[^.]*$/, "") || s;
  }

  var CHUNK = 6000;

  function parseTxt(text, name) {
    var lines = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
    var i, t, blank = 0, nonblank = 0, trimmed = [], first = -1, last = -1;
    for (i = 0; i < lines.length; i++) {
      t = lines[i].replace(/^\s+|\s+$/g, "");
      trimmed.push(t);
      if (t) { nonblank++; last = i; if (first < 0) first = i; }
    }
    // only blank lines between the first and last text line count, not the file's own padding
    for (i = first; i < last; i++) if (!trimmed[i]) blank++;
    // Blank lines between blocks mean hard-wrapped text (Gutenberg); otherwise one line is one paragraph.
    var blocky = nonblank > 0 && blank * 5 >= nonblank;
    var items = [], cur = null;
    for (i = 0; i < trimmed.length; i++) {
      if (blocky) {
        if (trimmed[i]) {
          if (!cur) { cur = []; items.push(cur); }
          cur.push(trimmed[i]);
        } else cur = null;
      } else if (trimmed[i]) items.push([trimmed[i]]);
    }
    // seq: headings and paragraphs in order
    var seq = [], k, it, h, title;
    for (k = 0; k < items.length; k++) {
      it = items[k];
      if (it.length === 1 && (h = headType(it[0]))) {
        title = it[0];
        if (h.bare && k + 1 < items.length && items[k + 1].length === 1 && isSubLine(items[k + 1][0])) {
          title += " " + items[k + 1][0];
          k++;
        }
        seq.push({ head: true, s: title });
      } else if (it.length === 2 && (h = headType(it[0])) && h.bare && isSubLine(it[1])) {
        // "CHAPTER I." and its title on the next line, no blank line between
        seq.push({ head: true, s: it[0] + " " + it[1] });
      } else {
        seq.push({ head: false, s: joinLines(it) });
      }
    }
    var chapters = [], ch = null, anyHead = false;
    for (k = 0; k < seq.length; k++) {
      if (seq[k].head) {
        anyHead = true;
        ch = { title: seq[k].s, paras: [{ h: 2, s: seq[k].s }] };
        chapters.push(ch);
      } else {
        if (!ch) { ch = { title: "", paras: [] }; chapters.push(ch); }
        ch.paras.push({ h: 0, s: seq[k].s });
      }
    }
    // a heading with nothing under it is a table of contents line
    var kept = [];
    for (k = 0; k < chapters.length; k++) {
      if (!(chapters[k].paras.length === 1 && chapters[k].paras[0].h === 2)) kept.push(chapters[k]);
    }
    if (!anyHead || !kept.length) {
      kept = [];
      ch = null;
      var size = 0;
      for (k = 0; k < seq.length; k++) {
        if (!ch) { ch = { title: "", paras: [] }; kept.push(ch); size = 0; }
        ch.paras.push({ h: 0, s: seq[k].s });
        size += seq[k].s.length;
        if (size >= CHUNK) ch = null;
      }
    }
    var toc = [];
    for (k = 0; k < kept.length; k++) {
      if (kept[k].title) toc.push({ title: kept[k].title, ch: k, p: 0, d: 0 });
    }
    return { title: nameToTitle(name), author: "", lang: guessLang(text), chapters: kept, toc: toc };
  }

  /* ---------- zip ---------- */

  function openZip(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var n = u8.length, p, eocd = -1, floor = Math.max(0, n - 22 - 65535);
    for (p = n - 22; p >= floor; p--) {
      if (dv.getUint32(p, true) === 0x06054B50) { eocd = p; break; }
    }
    if (eocd < 0) throw new Error("not a zip file");
    var count = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
    if (count === 0xFFFF || cdOff === 0xFFFFFFFF ||
        (eocd >= 20 && dv.getUint32(eocd - 20, true) === 0x07064B50)) throw new Error("zip64 is not supported");
    var utf8 = new TextDecoder("utf-8");
    var entries = {}, names = [], k, nameLen, extraLen, commentLen, name;
    p = cdOff;
    for (k = 0; k < count; k++) {
      if (p + 46 > n || dv.getUint32(p, true) !== 0x02014B50) throw new Error("bad zip directory");
      nameLen = dv.getUint16(p + 28, true);
      extraLen = dv.getUint16(p + 30, true);
      commentLen = dv.getUint16(p + 32, true);
      name = utf8.decode(u8.subarray(p + 46, p + 46 + nameLen));
      if (!Object.prototype.hasOwnProperty.call(entries, name)) names.push(name);
      entries[name] = {
        flags: dv.getUint16(p + 8, true), method: dv.getUint16(p + 10, true),
        csize: dv.getUint32(p + 20, true), usize: dv.getUint32(p + 24, true), local: dv.getUint32(p + 42, true),
      };
      p += 46 + nameLen + extraLen + commentLen;
    }
    function has(nm) { return Object.prototype.hasOwnProperty.call(entries, nm); }
    function read(nm) {
      if (!has(nm)) return Promise.reject(new Error("not in zip: " + nm));
      var e = entries[nm], start, data;
      if (e.flags & 1) return Promise.reject(new Error("encrypted zip entry: " + nm));
      if (e.method !== 0 && e.method !== 8) return Promise.reject(new Error("unsupported zip compression (" + e.method + "): " + nm));
      if (e.local + 30 > n || dv.getUint32(e.local, true) !== 0x04034B50) return Promise.reject(new Error("bad zip entry: " + nm));
      // sizes come from the central directory: the local header may defer them to a data descriptor
      start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
      if (start + e.csize > n) return Promise.reject(new Error("truncated zip entry: " + nm));
      data = u8.subarray(start, start + e.csize);
      if (e.method === 0) return Promise.resolve(data);
      var s = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Response(s).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }
    function text(nm) {
      return read(nm).then(function (b) { return utf8.decode(b).replace(/^\uFEFF/, ""); });
    }
    return { names: names, has: has, read: read, text: text };
  }

  /* ---------- markup tokenizer ---------- */

  var NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

  function fromCode(cp) {
    if (cp > 0xFFFF) {
      cp -= 0x10000;
      return String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
    }
    return String.fromCharCode(cp);
  }

  function entities(s) {
    if (s.indexOf("&") < 0) return s;
    return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, function (m, e) {
      var cp;
      if (e.charAt(0) === "#") {
        cp = e.charAt(1) === "x" || e.charAt(1) === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return cp > 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF) ? fromCode(cp) : m;
      }
      return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : m;
    });
  }

  function tagName(s) {
    // lower case, namespace prefix dropped: dc:title -> title
    return s.toLowerCase().replace(/^.*:/, "");
  }

  var RAW = { script: 1, style: 1 };

  // h.open(name, attrs, selfClosing), h.close(name) (also sent right after a self-closing open), h.text(decoded)
  function scan(src, h) {
    var i = 0, n = src.length, lt, end, c, j, depth, name, attrs, self, q, an, av, re, m;
    while (i < n) {
      lt = src.indexOf("<", i);
      if (lt < 0) { h.text(entities(src.slice(i))); break; }
      if (lt > i) h.text(entities(src.slice(i, lt)));
      i = lt;
      if (src.substr(i, 4) === "<!--") {
        end = src.indexOf("-->", i + 4);
        i = end < 0 ? n : end + 3;
        continue;
      }
      if (src.substr(i, 9) === "<![CDATA[") {
        end = src.indexOf("]]>", i + 9);
        h.text(src.slice(i + 9, end < 0 ? n : end));
        i = end < 0 ? n : end + 3;
        continue;
      }
      c = src.charAt(i + 1);
      if (c === "?") {
        end = src.indexOf("?>", i + 2);
        i = end < 0 ? n : end + 2;
        continue;
      }
      if (c === "!") {
        // doctype, possibly with an [internal subset]
        j = i + 2; depth = 0;
        while (j < n) {
          c = src.charAt(j);
          if (c === "[") depth++;
          else if (c === "]") depth--;
          else if (c === ">" && depth <= 0) break;
          j++;
        }
        i = j + 1;
        continue;
      }
      if (c === "/") {
        end = src.indexOf(">", i);
        if (end < 0) end = n;
        name = src.slice(i + 2, end).replace(/^\s+/, "").split(/[\s\/]/)[0];
        if (name) h.close(tagName(name));
        i = end + 1;
        continue;
      }
      if (!/[A-Za-z_:]/.test(c)) { h.text("<"); i++; continue; }
      j = i + 1;
      while (j < n && !/[\s\/>]/.test(src.charAt(j))) j++;
      name = tagName(src.slice(i + 1, j));
      attrs = {}; self = false;
      while (j < n) {
        c = src.charAt(j);
        if (/\s/.test(c)) { j++; continue; }
        if (c === ">") { j++; break; }
        if (c === "/") {
          if (src.charAt(j + 1) === ">") { self = true; j += 2; break; }
          j++; continue;
        }
        an = j;
        while (j < n && !/[\s>=\/]/.test(src.charAt(j))) j++;
        if (j === an) { j++; continue; }   // stray = or quote: step over it
        an = src.slice(an, j).toLowerCase();
        while (j < n && /\s/.test(src.charAt(j))) j++;
        av = "";
        if (src.charAt(j) === "=") {
          j++;
          while (j < n && /\s/.test(src.charAt(j))) j++;
          q = src.charAt(j);
          if (q === '"' || q === "'") {
            end = src.indexOf(q, j + 1);
            if (end < 0) end = n;
            av = src.slice(j + 1, end);
            j = end + 1;
          } else {
            end = j;
            while (end < n && !/[\s>]/.test(src.charAt(end))) end++;
            av = src.slice(j, end);
            j = end;
          }
        }
        if (!Object.prototype.hasOwnProperty.call(attrs, an)) attrs[an] = entities(av);
      }
      h.open(name, attrs, self);
      if (self) { h.close(name); i = j; continue; }
      if (RAW[name]) {
        // script and style hold no markup: jump to the matching end tag, drop the contents
        re = new RegExp("</" + name + "\\s*>", "ig");
        re.lastIndex = j;
        m = re.exec(src);
        h.close(name);
        i = m ? m.index + m[0].length : n;
        continue;
      }
      i = j;
    }
  }

  /* ---------- small element tree (OPF, NCX, nav) ---------- */

  var VOID = { br: 1, img: 1, hr: 1, input: 1, col: 1, area: 1, base: 1, wbr: 1 };

  function parseTree(src) {
    var root = { name: "#root", attrs: {}, kids: [] }, stack = [root];
    scan(String(src), {
      open: function (name, attrs, self) {
        var node = { name: name, attrs: attrs, kids: [] };
        stack[stack.length - 1].kids.push(node);
        if (!self && !VOID[name]) stack.push(node);
      },
      close: function (name) {
        var k;
        for (k = stack.length - 1; k > 0; k--) {
          if (stack[k].name === name) { stack.length = k; return; }
        }
      },
      text: function (s) { stack[stack.length - 1].kids.push(s); },
    });
    return root;
  }

  function elems(node) {
    var out = [], k;
    for (k = 0; k < node.kids.length; k++) if (typeof node.kids[k] !== "string") out.push(node.kids[k]);
    return out;
  }
  function child(node, name) {
    var k;
    for (k = 0; k < node.kids.length; k++) {
      if (typeof node.kids[k] !== "string" && node.kids[k].name === name) return node.kids[k];
    }
    return null;
  }
  function descendants(node, name, out) {
    var k, c;
    out = out || [];
    for (k = 0; k < node.kids.length; k++) {
      c = node.kids[k];
      if (typeof c === "string") continue;
      if (c.name === name) out.push(c);
      descendants(c, name, out);
    }
    return out;
  }
  function textOf(node) {
    var out = "", k;
    for (k = 0; k < node.kids.length; k++) {
      out += typeof node.kids[k] === "string" ? node.kids[k] : textOf(node.kids[k]);
    }
    return out.replace(/\s+/g, " ").replace(/^ | $/g, "");
  }
  function hasToken(value, tok) {
    return (" " + String(value || "").replace(/\s+/g, " ") + " ").indexOf(" " + tok + " ") >= 0;
  }

  /* ---------- XHTML -> paragraphs ---------- */

  var BLOCK = {};
  ("p div h1 h2 h3 h4 h5 h6 li blockquote pre section article aside header footer figure figcaption table tr td th dt dd " +
   "ul ol hr nav dl tbody thead tfoot caption main address").split(" ").forEach(function (t) { BLOCK[t] = 1; });
  var SKIP = { head: 1, script: 1, style: 1, svg: 1, math: 1, title: 1 };
  var EMPH = { em: 1, i: 1, b: 1, strong: 1, cite: 1, dfn: 1 };
  var HEADING = /^h([1-6])$/;

  function parseXhtml(src) {
    src = String(src);
    var hasBody = /<body[\s>\/]/i.test(src);
    var inBody = !hasBody, skip = "", skipDepth = 0, pre = 0, emDepth = 0, emStart = 0, curH = 0;
    var cur = "", ems = [], paras = [], ids = {};

    function flush() {
      var lead = 0, s, k, a, b, para, merged = [];
      if (emDepth > 0) ems.push(emStart, cur.length);
      if (pre) lead = /^(?:[ \t]*\n)*/.exec(cur)[0].length;   // the newline right after <pre>, not the indent
      s = cur.slice(lead).replace(/\s+$/, "");
      for (k = 0; k < ems.length; k += 2) {
        a = Math.max(ems[k] - lead, 0);
        b = Math.min(ems[k + 1] - lead, s.length);
        while (a < b && /\s/.test(s.charAt(a))) a++;
        while (b > a && /\s/.test(s.charAt(b - 1))) b--;
        if (b <= a) continue;
        if (merged.length && a <= merged[merged.length - 1]) {
          if (b > merged[merged.length - 1]) merged[merged.length - 1] = b;
        } else merged.push(a, b);
      }
      if (s) {
        para = { h: curH, s: s };
        if (merged.length) para.em = merged;
        paras.push(para);
      }
      cur = ""; ems = [];
      if (emDepth > 0) emStart = 0;
    }

    function addText(t) {
      if (!inBody || skip) return;
      if (pre) { cur += t.replace(/\r\n?/g, "\n"); return; }
      t = t.replace(/\s+/g, " ");
      if (cur === "" || /[ \n]$/.test(cur)) t = t.replace(/^ /, "");
      cur += t;
    }

    scan(src, {
      open: function (name, attrs) {
        var id, hm;
        if (skip) { if (name === skip) skipDepth++; return; }
        if (name === "body") { inBody = true; return; }
        if (SKIP[name]) { skip = name; skipDepth = 1; return; }
        if (!inBody) return;
        if (BLOCK[name]) flush();
        id = attrs.id || (name === "a" ? attrs.name : "");
        if (id && !Object.prototype.hasOwnProperty.call(ids, id)) ids[id] = paras.length;
        hm = HEADING.exec(name);
        if (hm) curH = parseInt(hm[1], 10);
        if (name === "br") {
          cur = cur.replace(/ +$/, "");
          if (emStart > cur.length) emStart = cur.length;
          if (cur !== "") cur += "\n";
        }
        if (name === "pre") pre++;
        if (EMPH[name]) { if (emDepth === 0) emStart = cur.length; emDepth++; }
      },
      close: function (name) {
        if (skip) { if (name === skip && --skipDepth === 0) skip = ""; return; }
        if (name === "body") { if (hasBody) { flush(); inBody = false; } return; }
        if (!inBody) return;
        if (BLOCK[name]) flush();
        if (HEADING.test(name)) curH = 0;
        if (name === "pre" && pre > 0) pre--;
        if (EMPH[name] && emDepth > 0) {
          emDepth--;
          if (emDepth === 0) ems.push(emStart, cur.length);
        }
      },
      text: addText,
    });
    flush();
    var key;
    for (key in ids) {
      if (Object.prototype.hasOwnProperty.call(ids, key) && ids[key] >= paras.length) ids[key] = Math.max(paras.length - 1, 0);
    }
    return { paras: paras, ids: ids };
  }

  /* ---------- EPUB ---------- */

  function normPath(path) {
    var parts = path.split("/"), out = [], k;
    for (k = 0; k < parts.length; k++) {
      if (parts[k] === "" || parts[k] === ".") continue;
      if (parts[k] === "..") out.pop(); else out.push(parts[k]);
    }
    return out.join("/");
  }
  function dirOf(path) {
    var p = path.lastIndexOf("/");
    return p < 0 ? "" : path.slice(0, p + 1);
  }
  function unpct(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }
  // href relative to the file `base` -> { path, frag }, or null for an external link
  function resolve(base, href) {
    var h = String(href || "").replace(/^\s+|\s+$/g, ""), hash = h.indexOf("#"), frag = "", path = h;
    if (hash >= 0) { frag = unpct(h.slice(hash + 1)); path = h.slice(0, hash); }
    if (/^[A-Za-z][A-Za-z0-9+.\-]*:/.test(path)) return null;
    path = unpct(path);
    if (path === "") return { path: base, frag: frag };
    return { path: normPath(path.charAt(0) === "/" ? path : dirOf(base) + path), frag: frag };
  }

  function eachSeq(list, fn) {
    var out = [];
    return list.reduce(function (p, item, k) {
      return p.then(function () { return fn(item, k); }).then(function (r) { out.push(r); });
    }, Promise.resolve()).then(function () { return out; });
  }

  function walkNavList(ol, d, out) {
    var lis = elems(ol), k, li, a, added, j, kid;
    for (k = 0; k < lis.length; k++) {
      li = lis[k];
      if (li.name !== "li") continue;
      a = child(li, "a");
      added = false;
      if (a && a.attrs.href !== undefined) {
        out.push({ title: textOf(a), href: a.attrs.href, d: d });
        added = true;
      }
      for (j = 0; j < li.kids.length; j++) {
        kid = li.kids[j];
        if (typeof kid !== "string" && (kid.name === "ol" || kid.name === "ul")) walkNavList(kid, added ? d + 1 : d, out);
      }
    }
  }

  function navEntries(tree) {
    var navs = descendants(tree, "nav"), pick = null, k, ol, out = [];
    for (k = 0; k < navs.length; k++) {
      if (hasToken(navs[k].attrs["epub:type"], "toc")) { pick = navs[k]; break; }
    }
    if (!pick) pick = navs[0];
    if (!pick) return out;
    ol = descendants(pick, "ol")[0] || descendants(pick, "ul")[0];
    if (ol) walkNavList(ol, 0, out);
    return out;
  }

  function walkNcx(node, d, out) {
    var pts = elems(node), k, pt, label, content;
    for (k = 0; k < pts.length; k++) {
      pt = pts[k];
      if (pt.name !== "navpoint") continue;
      label = child(pt, "navlabel");
      content = child(pt, "content");
      if (content && content.attrs.src !== undefined) {
        out.push({ title: label ? textOf(label) : "", href: content.attrs.src, d: d });
      }
      walkNcx(pt, d + 1, out);
    }
  }

  function ncxEntries(tree) {
    var map = descendants(tree, "navmap")[0], out = [];
    if (map) walkNcx(map, 0, out);
    return out;
  }

  function parseEpub(u8) {
    var zip, opfPath, info = { title: "", author: "", language: "" };
    var manifest = {}, spineIds = [], spineTocId = "", items = [], docs = [];

    return Promise.resolve().then(function () {
      zip = openZip(u8);
      return zip.text("META-INF/container.xml");
    }).then(function (xml) {
      var rf = descendants(parseTree(xml), "rootfile")[0], full = rf && rf.attrs["full-path"];
      if (!full) throw new Error("not an EPUB: no rootfile");
      opfPath = normPath(full);
      if (!zip.has(opfPath) && zip.has(normPath(unpct(full)))) opfPath = normPath(unpct(full));
      return zip.text(opfPath);
    }).then(function (opf) {
      var tree = parseTree(opf), meta = descendants(tree, "metadata")[0], k, el, r, spine, refs;
      if (meta) {
        el = child(meta, "title"); if (el) info.title = textOf(el);
        el = child(meta, "creator"); if (el) info.author = textOf(el);
        el = child(meta, "language"); if (el) info.language = textOf(el);
      }
      el = descendants(tree, "manifest")[0];
      if (el) {
        refs = elems(el);
        for (k = 0; k < refs.length; k++) {
          if (refs[k].name !== "item" || !refs[k].attrs.id) continue;
          r = resolve(opfPath, refs[k].attrs.href);
          if (!r) continue;
          manifest[refs[k].attrs.id] = {
            path: r.path, type: refs[k].attrs["media-type"] || "", props: refs[k].attrs.properties || "",
          };
        }
      }
      spine = descendants(tree, "spine")[0];
      if (spine) {
        spineTocId = spine.attrs.toc || "";
        refs = elems(spine);
        for (k = 0; k < refs.length; k++) {
          if (refs[k].name === "itemref" && refs[k].attrs.idref) spineIds.push(refs[k].attrs.idref);
        }
      }
      for (k = 0; k < spineIds.length; k++) {
        if (Object.prototype.hasOwnProperty.call(manifest, spineIds[k]) && zip.has(manifest[spineIds[k]].path)) {
          items.push(manifest[spineIds[k]].path);
        }
      }
      return eachSeq(items, function (path) {
        return zip.text(path).then(function (x) { return parseXhtml(x); });
      });
    }).then(function (parsed) {
      docs = parsed;
      // the table of contents: EPUB 3 nav document first, then NCX
      var id, navItem = null, ncxItem = null, tocPath = "", entries = [];
      for (id in manifest) {
        if (!Object.prototype.hasOwnProperty.call(manifest, id)) continue;
        if (!navItem && hasToken(manifest[id].props, "nav") && zip.has(manifest[id].path)) navItem = manifest[id];
        if (!ncxItem && manifest[id].type === "application/x-dtbncx+xml" && zip.has(manifest[id].path)) ncxItem = manifest[id];
      }
      if (spineTocId && Object.prototype.hasOwnProperty.call(manifest, spineTocId) && zip.has(manifest[spineTocId].path)) {
        ncxItem = manifest[spineTocId];
      }
      function fromNcx() {
        if (!ncxItem) return Promise.resolve({ path: "", entries: [] });
        return zip.text(ncxItem.path).then(function (x) { return { path: ncxItem.path, entries: ncxEntries(parseTree(x)) }; });
      }
      if (navItem) {
        return zip.text(navItem.path).then(function (x) {
          var e = navEntries(parseTree(x));
          return e.length ? { path: navItem.path, entries: e } : fromNcx();
        });
      }
      return fromNcx();
    }).then(function (toc) {
      var k, e, r, idx, oldToNew = [], chapters = [], tocOut = [], docIdx = {}, ch, para, sample = "", pTitle;
      for (k = 0; k < items.length; k++) {
        if (!Object.prototype.hasOwnProperty.call(docIdx, items[k])) docIdx[items[k]] = k;
      }
      // chapters without a paragraph (a cover that is only an image) go away
      for (k = 0; k < docs.length; k++) {
        if (docs[k].paras.length) {
          oldToNew[k] = chapters.length;
          chapters.push({ title: "", paras: docs[k].paras });
        }
      }
      for (k = 0; k < toc.entries.length; k++) {
        e = toc.entries[k];
        if (!e.title) continue;
        r = resolve(toc.path, e.href);
        if (!r || !Object.prototype.hasOwnProperty.call(docIdx, r.path)) continue;
        idx = docIdx[r.path];
        if (oldToNew[idx] === undefined) continue;
        pTitle = r.frag && Object.prototype.hasOwnProperty.call(docs[idx].ids, r.frag) ? docs[idx].ids[r.frag] : 0;
        tocOut.push({ title: e.title, ch: oldToNew[idx], p: pTitle, d: e.d });
      }
      for (k = 0; k < chapters.length; k++) {
        ch = chapters[k];
        for (idx = 0; idx < tocOut.length; idx++) {
          if (tocOut[idx].ch === k) { ch.title = tocOut[idx].title; break; }
        }
        if (!ch.title) {
          for (idx = 0; idx < ch.paras.length; idx++) {
            para = ch.paras[idx];
            if (para.h > 0) { ch.title = para.s; break; }
          }
        }
        if (sample.length < 20000) {
          for (idx = 0; idx < ch.paras.length && sample.length < 20000; idx++) sample += ch.paras[idx].s + " ";
        }
      }
      return {
        title: info.title, author: info.author,
        lang: /^zh/i.test(info.language) ? "zh" : guessLang(sample),
        chapters: chapters, toc: tocOut,
      };
    });
  }

  window.LopdaBook = {
    decodeText: decodeText, guessLang: guessLang, parseTxt: parseTxt,
    openZip: openZip, parseEpub: parseEpub, parseXhtml: parseXhtml,
  };
})();
