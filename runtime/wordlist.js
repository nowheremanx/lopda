// Lo-PDA: the dictionary apps read through PAD.dict (SPEC.md 6.7): the word list and the entries of the built-in ECDICT.
// Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
//
// Pure functions plus one small source object, shared by the runtime (apps/dict.js lends it the book it already
// loads), sdk/dev.html and the tests. The word list is vendor/ecdict/ecdict.words.gz, made by tools/gen-ecdict.mjs:
// plain a-z words, most common first, without names, abbreviations and the blocked words. Only the built-in book:
// imported dictionaries differ from phone to phone and their licences are unknown (docs/decisions.md section 35).
(function () {
  "use strict";

  var root = typeof window !== "undefined" ? window : this;
  var VERSION = "ecdict-1";             // changes only if the word list does; frozen with lopda/1
  var LEVELS = [2000, 5000, 10000, 15000, Infinity];   // level n: the most common LEVELS[n-1] words
  var SHORTEST = 2, LONGEST = 15, MAX = 500, DEFAULT_MAX = 100, LETTERS = 15, WORD = 32, ZH_LINES = 8;
  var RATE = 10;                        // calls a second per app, words and lookup together

  function parseWords(text) {
    return String(text).split("\n").filter(function (w) { return /^[a-z]+$/.test(w); });
  }

  function int(v, lo, hi) { return typeof v === "number" && v % 1 === 0 && v >= lo && v <= hi; }

  /* a words() query, checked: the normalised query, or a string that says what is wrong */
  function check(q) {
    if (q == null) q = {};
    if (typeof q !== "object" || Array.isArray(q)) return "the query is an object such as {len: 5}";
    var o = { min: SHORTEST, max: LONGEST, pattern: null, letters: null, level: 5, count: DEFAULT_MAX, offset: 0 };
    if (q.len != null) {
      if (int(q.len, SHORTEST, LONGEST)) o.min = o.max = q.len;
      else if (Array.isArray(q.len) && q.len.length === 2 && int(q.len[0], SHORTEST, LONGEST) && int(q.len[1], q.len[0], LONGEST)) {
        o.min = q.len[0]; o.max = q.len[1];
      } else return "len is a whole number from " + SHORTEST + " to " + LONGEST + ", or [min, max]";
    }
    if (q.pattern != null) {
      if (typeof q.pattern !== "string" || !/^[a-z?]+$/.test(q.pattern) || q.pattern.length < SHORTEST || q.pattern.length > LONGEST)
        return "pattern is " + SHORTEST + " to " + LONGEST + " of a-z and ?, such as \"?a???\"";
      if (q.pattern.length < o.min || q.pattern.length > o.max) return "pattern and len disagree";
      o.pattern = q.pattern; o.min = o.max = q.pattern.length;
    }
    if (q.letters != null) {
      if (typeof q.letters !== "string" || !/^[a-z]+$/.test(q.letters) || q.letters.length > LETTERS)
        return "letters is 1 to " + LETTERS + " of a-z";
      o.letters = tally(q.letters);
    }
    if (q.level != null) { if (!int(q.level, 1, 5)) return "level is 1 to 5"; o.level = q.level; }
    if (q.max != null) { if (!int(q.max, 1, MAX)) return "max is 1 to " + MAX; o.count = q.max; }
    if (q.offset != null) { if (!int(q.offset, 0, 1e6)) return "offset is a whole number, 0 or more"; o.offset = q.offset; }
    return o;
  }

  function tally(s) {
    var t = {}, i;
    for (i = 0; i < s.length; i++) t[s[i]] = (t[s[i]] || 0) + 1;
    return t;
  }

  function fits(w, o) {
    var i, c, used;
    if (w.length < o.min || w.length > o.max) return false;
    if (o.pattern) for (i = 0; i < w.length; i++) { c = o.pattern[i]; if (c !== "?" && c !== w[i]) return false; }
    if (o.letters) {
      used = {};
      for (i = 0; i < w.length; i++) { c = w[i]; used[c] = (used[c] || 0) + 1; if (used[c] > (o.letters[c] || 0)) return false; }
    }
    return true;
  }

  /* list: parseWords' array; o: check()'s object. In list order (most common first); more: a later page has words */
  function query(list, o) {
    var end = Math.min(list.length, LEVELS[o.level - 1]), out = [], seen = 0, i;
    for (i = 0; i < end; i++) {
      if (!fits(list[i], o)) continue;
      if (seen++ < o.offset) continue;
      if (out.length === o.count) return { words: out, more: true };
      out.push(list[i]);
    }
    return { words: out, more: false };
  }

  /* an ECDICT entry's text ("n. 河, 江\n[法] 河流\n\nn. a large natural stream ...") as the lines an app shows:
     zh keeps the lines with a part of speech (ECDICT puts abbreviations and subject labels such as [计] on lines of their
     own: cat's CAD and CAT lines go), or the first lines without their label when there is nothing else; en as it is */
  function entry(text) {
    var parts = String(text).split("\n\n"), zh = lines(parts[0]), en = lines(parts.slice(1).join("\n"));
    var pos = zh.filter(function (l) { return /^(?!abbr\.)[a-z]+\.\s/.test(l); });
    if (!pos.length) pos = zh.map(function (l) { return l.replace(/^\[[^\]]*\]\s*/, ""); }).filter(Boolean).slice(0, 2);
    return { zh: pos.slice(0, ZH_LINES), en: en };
  }
  function lines(s) { return String(s || "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean); }

  /* one word as an app may ask it: 1 to 32 letters a-z, any case */
  function wordOf(w) {
    return typeof w === "string" && w.length <= WORD && /^[A-Za-z]+$/.test(w) ? w.toLowerCase() : null;
  }

  /* load.words() -> Promise<text of the word list>; load.book() -> Promise<{book, lemma}> (stardict.js book and lemma
     table). Each is called once, when first needed, so an app that only asks for words never unpacks the entries. */
  function source(load) {
    var SD = root.LopdaStarDict;
    var list = null, book = null;
    function getList() {
      if (!list) list = load.words().then(parseWords, function (e) { list = null; throw e; });
      return list;
    }
    function getBook() {
      if (!book) book = load.book().then(null, function (e) { book = null; throw e; });
      return book;
    }
    return {
      version: VERSION,
      /* -> Promise<{words, more} | {error}>; rejects when the list cannot be read */
      words: function (q) {
        var o = check(q);
        if (typeof o === "string") return Promise.resolve({ error: o });
        return getList().then(function (l) { return query(l, o); });
      },
      /* -> Promise<{word, form?, zh, en} | null | {error}>: the exact word, else its base form (running -> run) */
      lookup: function (word) {
        var w = wordOf(word);
        if (!w) return Promise.resolve({ error: "the word is 1 to " + WORD + " letters a-z" });
        return getBook().then(function (b) {
          var ix = b.book.index, pos = SD.find(ix, w), form = null, i, ls;
          if (!pos.length) {
            ls = b.lemma ? SD.lemmas(b.lemma, w) : [];
            for (i = 0; i < ls.length && !pos.length; i++) pos = SD.find(ix, ls[i]);
            if (pos.length) form = w;
          }
          if (!pos.length) return null;
          // "may" before "May": the spelling asked for (all lowercase) first
          var at = pos.filter(function (p) { return ix.words[p] === ix.words[p].toLowerCase(); })[0];
          return SD.read(b.book, at != null ? at : pos[0]).then(function (r) {
            var e = entry(r.text), out = { word: r.head || r.word, zh: e.zh, en: e.en };
            if (form) out.form = form;
            return out;
          });
        });
      }
    };
  }

  /* at most RATE calls in any second: limiter() -> function(now ms) -> true when the call may go */
  function limiter() {
    var times = [];
    return function (now) {
      while (times.length && now - times[0] >= 1000) times.shift();
      if (times.length >= RATE) return false;
      times.push(now);
      return true;
    };
  }

  root.LopdaWordList = {
    VERSION: VERSION, LEVELS: LEVELS, RATE: RATE,
    parseWords: parseWords, check: check, query: query, entry: entry, wordOf: wordOf, source: source, limiter: limiter
  };
})();
