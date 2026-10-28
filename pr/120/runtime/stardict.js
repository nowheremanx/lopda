// Lo-PDA: StarDict dictionary reader (.ifo, .idx, .syn, .dict / dictzip). Search keys, prefix lookup, entry text.
// Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
//
// Pure functions over bytes, so the store, the dictionary view and the tests share one engine. The index object
// returned by buildIndex holds only arrays, typed arrays, plain objects and strings, so IndexedDB can keep it;
// prepare() adds the `keys` array afterwards (cheap to rebuild, not worth storing).
(function () {
  "use strict";

  var HEADER = "StarDict's dict ifo file";

  function parseIfo(text) {
    var lines = String(text).replace(/^﻿/, "").split(/\r?\n/);
    if (lines[0].trim() !== HEADER) throw new Error("not a StarDict .ifo");
    var info = {}, i, p;
    for (i = 1; i < lines.length; i++) {
      p = lines[i].indexOf("=");
      if (p > 0) info[lines[i].slice(0, p).trim()] = lines[i].slice(p + 1).trim();
    }
    info.wordcount = parseInt(info.wordcount, 10) || 0;
    info.synwordcount = parseInt(info.synwordcount, 10) || 0;
    info.idxfilesize = parseInt(info.idxfilesize, 10) || 0;
    // 64-bit offsets exist only from 3.0.0 on; older files never carry the key
    info.idxoffsetbits = info.version === "3.0.0" && parseInt(info.idxoffsetbits, 10) === 64 ? 64 : 32;
    return info;
  }

  /* one decoder for all: an .idx can hold hundreds of thousands of words */
  var decoder = null;
  function utf8(u8, a, b) {
    if (!decoder) decoder = new TextDecoder("utf-8", { fatal: false });
    return decoder.decode(u8.subarray(a, b));
  }

  function nul(u8, from) {
    var i = from;
    while (i < u8.length && u8[i] !== 0) i++;
    return i;
  }

  function parseIdx(u8, bits) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var step = bits === 64 ? 8 : 4;
    var words = [], off = [], len = [], p = 0, z;
    while (p < u8.length) {
      z = nul(u8, p);
      if (z + 1 + step + 4 > u8.length) throw new Error("truncated .idx");
      words.push(utf8(u8, p, z));
      if (bits === 64) {
        // offsets are kept in 32 bits (dictionaries here are well under 4 GB); refuse rather than wrap
        if (dv.getUint32(z + 1) !== 0) throw new Error("offset beyond 4 GB");
        off.push(dv.getUint32(z + 5));
      } else {
        off.push(dv.getUint32(z + 1));
      }
      len.push(dv.getUint32(z + 1 + step));
      p = z + 1 + step + 4;
    }
    return { words: words, off: new Uint32Array(off), len: new Uint32Array(len) };
  }

  function parseSyn(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var words = [], target = [], p = 0, z;
    while (p < u8.length) {
      z = nul(u8, p);
      if (z + 5 > u8.length) throw new Error("truncated .syn");
      words.push(utf8(u8, p, z));
      target.push(dv.getUint32(z + 1));
      p = z + 5;
    }
    return { words: words, target: new Uint32Array(target) };
  }

  // dictzip is a gzip member with an extra field, so the browser's gzip decoder reads it whole
  function gunzip(u8) {
    var s = new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(s).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  function fold(word) { return String(word).toLowerCase().trim(); }

  function buildIndex(idx, syn) {
    var items = [], i, t;
    for (i = 0; i < idx.words.length; i++) items.push({ w: idx.words[i], o: idx.off[i], l: idx.len[i], h: null });
    if (syn) {
      for (i = 0; i < syn.words.length; i++) {
        t = syn.target[i];
        if (t >= idx.words.length) continue;
        items.push({ w: syn.words[i], o: idx.off[t], l: idx.len[t], h: idx.words[t] });
      }
    }
    for (i = 0; i < items.length; i++) { items[i].k = fold(items[i].w); items[i].n = i; }
    // explicit tiebreak on the original position: Array.sort is stable now, but old Safari is not guaranteed
    items.sort(function (a, b) {
      if (a.k !== b.k) return a.k < b.k ? -1 : 1;
      if (a.w !== b.w) return a.w < b.w ? -1 : 1;
      return a.n - b.n;
    });
    var out = { words: [], off: new Uint32Array(items.length), len: new Uint32Array(items.length), head: {} };
    for (i = 0; i < items.length; i++) {
      out.words.push(items[i].w);
      out.off[i] = items[i].o;
      out.len[i] = items[i].l;
      if (items[i].h !== null) out.head[i] = items[i].h;
    }
    return out;
  }

  function prepare(index) {
    if (!index.keys) {
      var keys = [], i;
      for (i = 0; i < index.words.length; i++) keys.push(fold(index.words[i]));
      index.keys = keys;
    }
    return index;
  }

  function lower(keys, k) {
    var lo = 0, hi = keys.length, mid;
    while (lo < hi) {
      mid = (lo + hi) >> 1;
      if (keys[mid] < k) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  function find(index, word) {
    var k = fold(word), keys = prepare(index).keys, out = [], i = lower(keys, k);
    while (i < keys.length && keys[i] === k) out.push(i++);
    return out;
  }

  function prefix(index, p, n) {
    var k = fold(p), keys = prepare(index).keys, out = [], i;
    if (!k) return out;
    for (i = lower(keys, k); i < keys.length && out.length < n && keys[i].indexOf(k) === 0; i++) out.push(i);
    return out;
  }

  var ENT = { lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

  function markup(s) {
    s = s.replace(/<br\s*\/?>|<\/(p|div|li)>/gi, "\n").replace(/<[^>]*>/g, "");
    s = s.replace(/&#(x?)([0-9a-f]+);/gi, function (m, hex, n) {
      var c = parseInt(n, hex ? 16 : 10);
      return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : "";
    });
    s = s.replace(/&(lt|gt|quot|apos|nbsp);/g, function (m, e) { return ENT[e]; });
    return s.replace(/&amp;/g, "&");
  }

  function entryText(bytes, sts) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var parts = [], p = 0, i = 0, type, last, end, a, text;
    while (p < bytes.length) {
      if (sts) {
        if (i >= sts.length) break;
        type = sts.charAt(i);
        last = i === sts.length - 1;
      } else {
        type = String.fromCharCode(bytes[p++]);
        last = false;
        if (p > bytes.length) break;
      }
      i++;
      a = p;
      if (type >= "A" && type <= "Z") {
        if (last) { end = bytes.length; }
        else {
          if (p + 4 > bytes.length) break;
          a = p + 4;
          end = Math.min(bytes.length, a + dv.getUint32(p));
        }
      } else {
        end = last ? bytes.length : nul(bytes, p);
      }
      text = utf8(bytes, a, end);
      p = end + (type >= "a" && type <= "z" && !last ? 1 : 0);
      if (type === "m" || type === "l") parts.push(text);
      else if (type === "t" || type === "y") parts.push("[" + text + "]");
      else if ("ghxkw".indexOf(type) >= 0) parts.push(markup(text));
      // r, n and the uppercase types are resources, not text
    }
    return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function open(files) {
    var info = parseIfo(files.ifo);
    function plain(u8, flag) {
      return flag || (u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b) ? gunzip(u8) : Promise.resolve(u8);
    }
    return Promise.all([plain(files.idx, files.idxGz), plain(files.dict, files.dictDz)]).then(function (r) {
      var idx = parseIdx(r[0], info.idxoffsetbits);
      if (idx.words.length !== info.wordcount) throw new Error("wordcount mismatch");
      var syn = files.syn ? parseSyn(files.syn) : null;
      return { info: info, name: info.bookname, index: prepare(buildIndex(idx, syn)), data: r[1] };
    });
  }

  function read(book, pos) {
    var ix = book.index, off = ix.off[pos], len = ix.len[pos], d = book.data;
    var bytes = typeof d.arrayBuffer === "function" && !d.subarray
      ? d.slice(off, off + len).arrayBuffer().then(function (b) { return new Uint8Array(b); })
      : Promise.resolve(d.subarray(off, off + len));
    return bytes.then(function (u8) {
      var head = Object.prototype.hasOwnProperty.call(ix.head, pos) ? ix.head[pos] : ix.words[pos];
      return { word: ix.words[pos], head: head, text: entryText(u8, book.info.sametypesequence) };
    });
  }

  // lemma tables: "form<TAB>lemma" per line, so "running" can fall back to "run"
  function parseLemma(text) {
    var table = {}, lines = String(text).split(/\r?\n/), i, c, f;
    for (i = 0; i < lines.length; i++) {
      c = lines[i].split("\t");
      f = fold(c[0] || "");
      if (c.length >= 2 && f && c[1].trim()) table[f] = c[1].trim();
    }
    return table;
  }

  function lemmas(table, word) {
    var v = Object.prototype.hasOwnProperty.call(table, fold(word)) ? table[fold(word)] : "";
    var parts = v.split("/"), out = [], i;
    for (i = 0; i < parts.length; i++) if (parts[i] && out.indexOf(parts[i]) < 0) out.push(parts[i]);
    return out;
  }

  var root = typeof window !== "undefined" ? window : this;
  root.LopdaStarDict = {
    parseIfo: parseIfo, parseIdx: parseIdx, parseSyn: parseSyn, gunzip: gunzip, fold: fold,
    buildIndex: buildIndex, prepare: prepare, find: find, prefix: prefix, entryText: entryText,
    open: open, read: read, parseLemma: parseLemma, lemmas: lemmas
  };
})();
