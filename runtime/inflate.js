// Lo-PDA: small synchronous RFC 1951/1952 decoder for browsers without DecompressionStream.
// Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
(function () {
  "use strict";

  var LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  var LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  var DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  var DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

  function fail(s) { throw new Error("inflate: " + s); }
  // Reversed canonical codes give the decoder a direct table lookup.
  function tree(lengths) {
    var count = [], next = [], max = 0, i, code = 0, bits, rev, size, sym, table, lens;
    for (i = 0; i < lengths.length; i++) {
      bits = lengths[i];
      if (bits < 0 || bits > 15) fail("bad Huffman length");
      if (bits) { count[bits] = (count[bits] || 0) + 1; if (bits > max) max = bits; }
    }
    // An empty tree is legal for distances (a block of literals only); any lookup in it fails below.
    for (bits = 1; bits <= max; bits++) { code = (code + (count[bits - 1] || 0)) << 1; next[bits] = code; }
    size = 1 << max; table = new Uint16Array(size); lens = new Uint8Array(size);
    for (sym = 0; sym < lengths.length; sym++) {
      bits = lengths[sym]; if (!bits) continue;
      code = next[bits]++; rev = 0;
      for (i = 0; i < bits; i++) { rev = (rev << 1) | (code & 1); code >>>= 1; }
      for (i = rev; i < size; i += 1 << bits) { if (lens[i]) fail("oversubscribed Huffman tree"); table[i] = sym; lens[i] = bits; }
    }
    return { max: max, sym: table, len: lens, mask: size - 1 };
  }

  function fixedLit() {
    var a = [], i;
    for (i = 0; i <= 287; i++) a[i] = i <= 143 ? 8 : i <= 255 ? 9 : i <= 279 ? 7 : 8;
    return tree(a);
  }
  function fixedDist() { var a = [], i; for (i = 0; i < 32; i++) a[i] = 5; return tree(a); }
  var FIXL = fixedLit(), FIXD = fixedDist();

  function inflatePart(input) {
    var p = 0, hold = 0, have = 0, out = new Uint8Array(32768), size = 0;
    function bits(n) {
      while (have < n) { if (p >= input.length) fail("truncated input"); hold |= input[p++] << have; have += 8; }
      var v = hold & ((1 << n) - 1); hold >>>= n; have -= n; return v;
    }
    function decode(t) {
      while (have < t.max && p < input.length) { hold |= input[p++] << have; have += 8; }
      var ix = hold & t.mask, n = t.len[ix];
      if (!n || n > have) fail(p >= input.length && n > have ? "truncated input" : "bad Huffman code");
      var v = t.sym[ix]; hold >>>= n; have -= n; return v;
    }
    function put(b) {
      if (size === out.length) { var bigger = new Uint8Array(out.length * 2); bigger.set(out); out = bigger; }
      out[size++] = b;
    }
    var last = 0, type, lit, dist, nlit, ndist, ncode, order = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
    var clen, lengths, i, sym, prev, extra, len, distance, j, align;
    do {
      last = bits(1); type = bits(2);
      if (type === 0) {
        align = have & 7; if (align) { hold >>>= align; have -= align; }
        len = bits(16); if (((len ^ 0xffff) & 0xffff) !== bits(16)) fail("bad stored block length");
        for (i = 0; i < len; i++) put(bits(8));
      } else if (type === 1 || type === 2) {
        if (type === 1) { lit = FIXL; dist = FIXD; }
        else {
          nlit = bits(5) + 257; ndist = bits(5) + 1; ncode = bits(4) + 4;
          if (nlit > 286 || ndist > 32) fail("bad dynamic tree");
          clen = []; for (i = 0; i < 19; i++) clen[i] = 0;
          for (i = 0; i < ncode; i++) clen[order[i]] = bits(3);
          var ct = tree(clen); lengths = [];
          while (lengths.length < nlit + ndist) {
            sym = decode(ct);
            if (sym < 16) lengths.push(sym);
            else if (sym === 16) {
              if (!lengths.length) fail("bad repeat code");
              prev = lengths[lengths.length - 1]; extra = bits(2) + 3;
              while (extra--) lengths.push(prev);
            } else if (sym === 17) { extra = bits(3) + 3; while (extra--) lengths.push(0); }
            else if (sym === 18) { extra = bits(7) + 11; while (extra--) lengths.push(0); }
            else fail("bad code-length symbol");
            if (lengths.length > nlit + ndist) fail("repeat exceeds tree");
          }
          if (!lengths[256]) fail("missing end code");
          lit = tree(lengths.slice(0, nlit)); dist = tree(lengths.slice(nlit));
        }
        while (true) {
          sym = decode(lit);
          if (sym < 256) put(sym);
          else if (sym === 256) break;
          else {
            sym -= 257; if (sym < 0 || sym >= LBASE.length) fail("bad length code");
            len = LBASE[sym] + bits(LEXT[sym]);
            sym = decode(dist); if (sym >= DBASE.length) fail("bad distance code");
            distance = DBASE[sym] + bits(DEXT[sym]);
            if (distance > size) fail("distance too far back");
            if (size + len > out.length) {
              var cap = out.length; while (cap < size + len) cap *= 2;
              var grown = new Uint8Array(cap); grown.set(out); out = grown;
            }
            for (j = 0; j < len; j++) { out[size] = out[size - distance]; size++; }
          }
        }
      } else fail("bad block type");
    } while (!last);
    // Report the semantic byte boundary, even if lookup prefetched trailer bits.
    return { data: out.subarray(0, size), consumed: Math.ceil((p * 8 - have) / 8) };
  }

  function inflateRaw(u8) { return inflatePart(u8).data; }
  function gunzip(u8) {
    var p = 0, parts = [], total = 0, dv, flags, start, r, size, out, at, i;
    if (!u8.length) fail("bad gzip magic");
    while (p < u8.length) {
      start = p;
      if (p + 10 > u8.length || u8[p++] !== 31 || u8[p++] !== 139) fail("bad gzip magic");
      if (u8[p++] !== 8) fail("unsupported gzip method");
      flags = u8[p++]; if (flags & 0xe0) fail("reserved gzip flags");
      p += 6;
      if (flags & 4) { if (p + 2 > u8.length) fail("truncated gzip extra"); size = u8[p] | (u8[p + 1] << 8); p += 2; if (p + size > u8.length) fail("truncated gzip extra"); p += size; }
      if (flags & 8) { while (p < u8.length && u8[p++]) {} if (p > u8.length || u8[p - 1] !== 0) fail("truncated gzip name"); }
      if (flags & 16) { while (p < u8.length && u8[p++]) {} if (p > u8.length || u8[p - 1] !== 0) fail("truncated gzip comment"); }
      if (flags & 2) { if (p + 2 > u8.length) fail("truncated gzip header CRC"); p += 2; }
      r = inflatePart(u8.subarray(p)); p += r.consumed;
      if (p + 8 > u8.length) fail("truncated gzip trailer");
      dv = new DataView(u8.buffer, u8.byteOffset + p, 8);
      if ((dv.getUint32(4, true) >>> 0) !== (r.data.length >>> 0)) fail("gzip size mismatch");
      p += 8; parts.push(r.data); total += r.data.length;
      if (p === start) fail("no gzip progress");
    }
    // Join once so concatenated members do not repeatedly copy the growing result.
    out = new Uint8Array(total); at = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], at); at += parts[i].length; }
    return out;
  }

  function stream(u8, format, fallback) {
    return Promise.resolve().then(function () {
      if (typeof DecompressionStream !== "function") return fallback(u8);
      return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer()
        .then(function (b) { return new Uint8Array(b); });
    });
  }
  var root = typeof window !== "undefined" ? window : this;
  root.LopdaInflate = {
    inflateRaw: inflateRaw, gunzip: gunzip,
    raw: function (u8) { return stream(u8, "deflate-raw", inflateRaw); },
    gzip: function (u8) { return stream(u8, "gzip", gunzip); }
  };
})();
