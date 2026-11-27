/* 和弦大全 / Chords: a plucked guitar for strumming a voicing. The same Karplus-Strong string as the four-track's
   guitar (runtime/studio-synth.js guitarFor): a short burst of soft noise fed round a delay line that loses a little
   each pass, rendered once per note and kept. The app's own AudioContext, made on the first tap; PAD.music has three
   tonal voices and a chord needs six. It does not follow the runtime's volume, so it stays quiet and has its own
   switch (off, small, middle).
   MIT License. Copyright (c) 2026 Haowei Wu. */
var Guitar = (function () {
  "use strict";
  var ctx = null, master = null, cache = {}, playing = [], level = 2;
  var LEVELS = [0, 0.3, 0.6];   /* six strings at 0.09 each stay under about 0.3 at the middle level */

  function rng(seed) {
    var x = seed >>> 0 || 1;
    return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  }
  function freq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function ensure() {
    if (ctx) return ctx;
    var AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain();
    master.gain.value = LEVELS[level];
    master.connect(ctx.destination);
    return ctx;
  }

  /* one string's sound, 2.5 s, normalised; the delay line is a whole number of samples and the playback rate tunes it */
  function bufferFor(midi) {
    if (cache[midi]) return cache[midi];
    var sr = ctx.sampleRate, f = freq(midi), N = Math.max(2, Math.floor(sr / f));
    var len = Math.floor(sr * 2.5), out = new Float32Array(len), r = rng(0x7a3f19c5 ^ (midi * 2654435761));
    var a = 1 - Math.exp(-2 * Math.PI * 3000 / sr), lp = 0, i;
    for (i = 0; i < N && i < len; i++) {
      var n = r() * 2 - 1;
      lp += a * (n - lp);
      out[i] = 0.7 * lp + 0.3 * n;
    }
    for (i = N; i < len; i++) out[i] = 0.996 * 0.5 * (out[i - N] + (i - N - 1 >= 0 ? out[i - N - 1] : 0));
    var peak = 0;
    for (i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
    if (peak > 0) for (i = 0; i < len; i++) out[i] /= peak;
    var buf = ctx.createBuffer(1, len, sr);
    buf.getChannelData(0).set(out);
    cache[midi] = { buf: buf, rate: (N + 0.5) * f / sr };
    return cache[midi];
  }

  function hush(list) {
    var t = ctx.currentTime;
    list.forEach(function (p) {
      try { p.g.gain.cancelScheduledValues(t); p.g.gain.setTargetAtTime(0, t, 0.02); p.src.stop(t + 0.1); } catch (e) {}
    });
  }
  function stop() {
    if (!ctx) return;
    hush(playing);
    playing = [];
  }

  /* notes: midi numbers, low string first; gap: seconds between strings (0.012 for a strum, 0.18 for an arpeggio).
     ring: leave what is sounding alone (single tones tapped one after another ring together, so an interval is heard
     both ways); at most 8 notes ring, the oldest go first */
  function play(notes, gap, ring) {
    if (!level || !notes.length || !ensure()) return false;
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();
    if (!ring) stop();
    else if (playing.length + notes.length > 8) hush(playing.splice(0, playing.length + notes.length - 8));
    var t0 = ctx.currentTime + 0.02;
    notes.forEach(function (m, k) {
      var b = bufferFor(m), src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = b.buf;
      src.playbackRate.value = b.rate;
      g.gain.value = 0.09;
      src.connect(g);
      g.connect(master);
      src.start(t0 + k * gap);
      playing.push({ src: src, g: g });
    });
    return true;
  }

  function setLevel(n) {
    level = Math.max(0, Math.min(2, n | 0));
    if (master) master.gain.value = LEVELS[level];
    if (!level) stop();
  }
  /* a hidden page goes quiet and lets the phone's audio go */
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", function () {
    if (!ctx) return;
    if (document.hidden) { stop(); if (ctx.suspend) ctx.suspend(); }
  });

  return { play: play, stop: stop, setLevel: setLevel, level: function () { return level; } };
})();
