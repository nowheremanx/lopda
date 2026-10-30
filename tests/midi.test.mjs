// runtime/midi.js: one tape as a Standard MIDI File (format 1, 96 ticks a beat, one track per instrument).
// The writer parses nothing, so the test reads its own output back with the tiny reader below.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read, runScript } from "./helpers.mjs";

const ctx = runScript("runtime/studio-song.js");
vm.runInContext(read("runtime/midi.js"), ctx);
const S = ctx.LopdaSong, M = ctx.LopdaMidi;

function readVlq(bytes, at) {
  let value = 0, b;
  do { b = bytes[at++]; value = (value << 7) | (b & 0x7f); } while (b & 0x80);
  return [value, at];
}

/* A deliberately small SMF reader: full status bytes only, which is what the writer emits. It returns the header and
   each MTrk with absolute-tick events, including the raw chunk bytes. */
function parse(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = String.fromCharCode(...bytes.slice(0, 4));
  const headerLen = dv.getUint32(4);
  const format = dv.getUint16(8), ntracks = dv.getUint16(10), division = dv.getUint16(12);
  const tracks = [];
  let at = 8 + headerLen;
  while (at < bytes.length) {
    const id = String.fromCharCode(...bytes.slice(at, at + 4));
    const len = dv.getUint32(at + 4);
    const start = at + 8, end = start + len;
    const events = [];
    let p = start, tick = 0, running = 0;
    while (p < end) {
      const v = readVlq(bytes, p);
      tick += v[0];
      p = v[1];
      let status = bytes[p];
      if (status < 0x80) {
        status = running;
      } else {
        p++;
        running = status;
      }
      if (status === 0xFF) {
        const type = bytes[p++];
        const lr = readVlq(bytes, p);
        const length = lr[0];
        p = lr[1];
        events.push({ tick, meta: type, data: [...bytes.slice(p, p + length)] });
        p += length;
      } else if (status === 0xF0 || status === 0xF7) {
        const lr = readVlq(bytes, p);
        p = lr[1] + lr[0];
      } else {
        const type = status >> 4, channel = status & 15;
        if (type === 0xC || type === 0xD) {
          events.push({ tick, type, channel, program: bytes[p] });
          p += 1;
        } else {
          const a = bytes[p], b = bytes[p + 1];
          p += 2;
          if (type === 0x8 || type === 0x9) events.push({ tick, type, channel, pitch: a, velocity: b });
          else if (type === 0xA) events.push({ tick, type, channel, pressure: a, value: b });
          else if (type === 0xB) events.push({ tick, type, channel, controller: a, value: b });
          else if (type === 0xE) events.push({ tick, type, channel, value: (a | (b << 7)) - 8192 });
        }
      }
    }
    tracks.push({ id, len, events, data: bytes.slice(start, end) });
    at = end;
  }
  return { header, format, ntracks, division, tracks };
}

function onNotes(track, channel) {
  return track.events.filter((e) => e.channel === channel && e.type === 0x9 && e.velocity > 0);
}

/* Pair note-offs with the note-ons before them, so a test can read a duration. The writer sorts an off before an on at
   the same tick, so a repeated pitch nests correctly here too. */
function spans(track, channel) {
  const open = {}, out = [];
  for (const e of track.events) {
    if (e.channel !== channel) continue;
    if (e.type === 0x8 || (e.type === 0x9 && e.velocity === 0)) {
      const list = open[e.pitch];
      if (list && list.length) {
        const s = list.shift();
        out.push({ ...s, off: e.tick, len: e.tick - s.tick });
      }
    } else if (e.type === 0x9 && e.velocity > 0) {
      (open[e.pitch] || (open[e.pitch] = [])).push({ pitch: e.pitch, tick: e.tick, velocity: e.velocity });
    }
  }
  return out;
}

/* A silent one-bar song at no swing: each test puts only the notes it wants on pattern 0. */
function blank() {
  const song = S.newSong(0);
  song.name = "";
  song.song = [0];
  song.swing = 0.5;
  song.patterns[0].notes = { drums: [], bass: [], chords: [], melody: [] };
  return song;
}

test("write: a format 1 header with one conductor and four instrument tracks at 96 ticks a beat", () => {
  const midi = parse(M.write(S.demoSong(0)));
  assert.equal(midi.header, "MThd");
  assert.equal(midi.format, 1);
  assert.equal(midi.ntracks, 5);
  assert.equal(midi.tracks.length, 5);
  assert.equal(midi.division, 96);
});

test("write: the tape's first kick is note 36 on channel 10 at tick 0", () => {
  const song = S.demoSong(0);
  const midi = parse(M.write(song));
  const kicks = onNotes(midi.tracks[1], 9);
  assert.ok(kicks.length > 0, "the demo has drum notes");
  assert.equal(kicks[0].pitch, 36);
  assert.equal(kicks[0].tick, 0);
});

test("write: the conductor track carries the tempo from bpm, 4/4 and the song name", () => {
  const song = S.demoSong(0);
  song.name = "夜色";
  const conductor = parse(M.write(song)).tracks[0];
  const tempo = conductor.events.find((e) => e.meta === 0x51);
  const theta = (tempo.data[0] << 16) | (tempo.data[1] << 8) | tempo.data[2];
  assert.equal(theta, Math.round(60000000 / song.bpm));
  assert.equal(tempo.tick, 0);
  assert.deepEqual(conductor.events.find((e) => e.meta === 0x58).data, [4, 2, 24, 8], "4/4");
  const name = conductor.events.find((e) => e.meta === 0x03);
  assert.equal(new TextDecoder().decode(new Uint8Array(name.data)), "夜色");
});

test("write: a chord with q m7 writes its four pitches on channel 2", () => {
  const song = blank();
  song.patterns[0].notes.chords = [{ t: 0, len: 96, deg: 0, vel: 0.8, q: "m7" }];
  const expected = Array.from(S.chordNotes(song, 0, "m7", 0)).sort((a, b) => a - b);
  const notes = onNotes(parse(M.write(song)).tracks[3], 1);
  assert.equal(notes.length, 4);
  assert.deepEqual(notes.map((n) => n.pitch).sort((a, b) => a - b), expected);
});

test("write: an accidental raises a melody note one semitone", () => {
  const plain = blank();
  plain.patterns[0].notes.melody = [{ t: 0, len: 48, deg: 0, vel: 0.8 }];
  const sharp = blank();
  sharp.patterns[0].notes.melody = [{ t: 0, len: 48, deg: 0, vel: 0.8, acc: 1 }];
  const a = onNotes(parse(M.write(plain)).tracks[4], 2)[0];
  const b = onNotes(parse(M.write(sharp)).tracks[4], 2)[0];
  assert.equal(b.pitch, a.pitch + 1);
  assert.equal(b.pitch, S.noteMidi(sharp, "melody", 0, 1));
});

test("write: a gate of 0.5 halves the note", () => {
  const song = blank();
  song.patterns[0].notes.melody = [{ t: 0, len: 48, deg: 0, vel: 0.8, gate: 0.5 }];
  const s = spans(parse(M.write(song)).tracks[4], 2);
  assert.equal(s.length, 1);
  assert.equal(s[0].tick, 0);
  assert.equal(s[0].len, 24, "48 ticks times 0.5");
});

test("write: a muted track writes no notes", () => {
  const song = blank();
  song.patterns[0].notes.melody = [{ t: 0, len: 48, deg: 0, vel: 0.8 }];
  song.tracks = song.tracks.map((tr) => (tr.id === "melody" ? { ...tr, mute: true } : tr));
  const midi = parse(M.write(song));
  assert.equal(onNotes(midi.tracks[4], 2).length, 0);
});

test("write: programs, CC7 and an end-of-track on every track", () => {
  const song = S.demoSong(0);
  const midi = parse(M.write(song));
  assert.equal(midi.tracks[1].events.filter((e) => e.type === 0xC).length, 0, "no program on drums");
  assert.equal(midi.tracks[2].events.find((e) => e.type === 0xC).program, 38, "synth bass");
  assert.equal(midi.tracks[3].events.find((e) => e.type === 0xC).program, 4, "e-piano");
  assert.equal(midi.tracks[4].events.find((e) => e.type === 0xC).program, 73, "flute");
  const cc = midi.tracks[2].events.find((e) => e.type === 0xB && e.controller === 7);
  assert.equal(cc.value, 127, "a full track level");
  assert.equal(cc.tick, 0);
  for (const tr of midi.tracks) {
    assert.equal(tr.id, "MTrk");
    assert.deepEqual([...tr.data.slice(-3)], [0xFF, 0x2F, 0x00], "end of track");
  }
});
