/*
 * Lo-PDA runtime: a Standard MIDI File writer for one tape (docs/design/studio.md section 12.14).
 * No DOM and no LP, so Node tests run it; the only outside thing it reads is LopdaSong, which is loaded before it.
 *
 *   LopdaMidi.write(song) -> Uint8Array
 *
 * Format 1, one division of 96 ticks per beat (the song's TPB), one tempo/meta track and one track per instrument:
 * drums on channel 10, bass on 1, chords on 2, melody on 3. The notes are the song's chain played as the machine plays
 * it - LopdaSong.chainEvents applies the swing - with chord voicings, accidentals and gates carried through. A whole
 * track's mixer level goes out as CC7 on the channel at tick 0. Full status bytes, so a reader needs no running status.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var SONG=window.LopdaSong, DIV=96;

/* the drum lanes' General MIDI notes: kick, snare, closed hat, cowbell */
var DRUM={kick:36, snare:38, hat:42, perc:56};

/* General MIDI programs: a voice the song carries, or the track's default (12.20.1). Bass has 33 as a fallback for an
   id this build does not know; the song's own three voices all map. */
var BASS_PROGRAM={bass:38, sub:38, pick:34}, BASS_FALLBACK=33;
var CHORD_PROGRAM={keys:4, guitar:25, piano:0, organ:16, strings:48};
var MELODY_PROGRAM={flute:73, square:80, pluck:107, reed:22, bowed:110};

/* The tape's four instrument tracks, in the order the file lays them out. ch is the zero-based MIDI channel (10 -> 9). */
var TRACKS=[
  {id:"drums", kind:"drum", ch:9},
  {id:"bass", kind:"note", ch:0},
  {id:"chords", kind:"chord", ch:1},
  {id:"melody", kind:"note", ch:2}
];

function be16(n){ return [(n>>8)&255, n&255]; }
function be32(n){ return [(n>>>24)&255, (n>>>16)&255, (n>>>8)&255, n&255]; }

/* UTF-8 for a track name; written by hand so the module stays dependency-free (and so a surrogate pair is not two
   broken bytes). */
function utf8(text){
  var out=[], i, c, c2, cp;
  for(i=0;i<text.length;i++){
    c=text.charCodeAt(i);
    if(c<0x80) out.push(c);
    else if(c<0x800) out.push(0xC0|(c>>6), 0x80|(c&63));
    else if(c>=0xD800 && c<=0xDBFF && i+1<text.length){
      c2=text.charCodeAt(i+1);
      if(c2>=0xDC00 && c2<=0xDFFF){
        cp=0x10000+((c-0xD800)<<10)+(c2-0xDC00);
        out.push(0xF0|(cp>>18), 0x80|((cp>>12)&63), 0x80|((cp>>6)&63), 0x80|(cp&63));
        i++;
      } else out.push(0xEF,0xBF,0xBD);
    }
    else out.push(0xE0|(c>>12), 0x80|((c>>6)&63), 0x80|(c&63));
  }
  return out;
}

/* MIDI delta times are variable-length quantities: seven bits per byte, most significant first, continuation bit set. */
function vlq(n){
  var out=[n&0x7F];
  n=Math.floor(n/128);
  while(n>0){
    out.unshift((n&0x7F)|0x80);
    n=Math.floor(n/128);
  }
  return out;
}

function meta(type, data){
  var out=[0xFF,type,data.length];
  return out.concat(data);
}

function trackName(name){ return meta(0x03, utf8(name)); }
function tempoMeta(bpm){
  var tempo=Math.round(60000000/bpm), i;
  if(!(tempo>0)) tempo=500000;
  if(tempo>0xFFFFFF) tempo=0xFFFFFF;
  return meta(0x51, [(tempo>>16)&255,(tempo>>8)&255,tempo&255]);
}
function timeSignature(){ return meta(0x58, [4,2,24,8]); }   /* 4/4, 24 clocks a click, eight 32nds a quarter */

/* A track's absolute-time events become one MTrk body. Events carry their own bytes and an order (meta and setup
   first, then note-offs before note-ons), so ties at the same tick have a stable answer. */
function serialize(events){
  var out=[], last=0, i, e, d;
  events.sort(function(a,b){
    if(a.tick!==b.tick) return a.tick-b.tick;
    if(a.order!==b.order) return a.order-b.order;
    return (a.pitch||0)-(b.pitch||0);
  });
  for(i=0;i<events.length;i++){
    e=events[i];
    d=Math.max(0,Math.round(e.tick)-last);
    out=out.concat(vlq(d), e.bytes);
    last=Math.round(e.tick);
  }
  out=out.concat([0x00,0xFF,0x2F,0x00]);   /* end of track, always delta 0 after the last event */
  return out;
}

function clamp127(n){
  n=Math.round(n);
  if(!(n>0)) return 0;
  return n>127 ? 127 : n;
}

function trackOf(song,id){
  var tracks=song && song.tracks;
  if(!Array.isArray(tracks)) return null;
  for(var i=0;i<tracks.length;i++) if(tracks[i] && tracks[i].id===id) return tracks[i];
  return null;
}

/* The program for a melodic track. voiceOf falls back to the track's default when the file names a voice this build
   does not know, so only a missing or broken song needs the final fallbacks. */
function programOf(song,id){
  var voice=SONG && SONG.voiceOf ? SONG.voiceOf(song,id) : null, table;
  if(id==="bass"){
    table=BASS_PROGRAM;
    return table[voice] != null ? table[voice] : BASS_FALLBACK;
  }
  if(id==="chords"){
    table=CHORD_PROGRAM;
    return table[voice] != null ? table[voice] : CHORD_PROGRAM.keys;
  }
  table=MELODY_PROGRAM;
  return table[voice] != null ? table[voice] : MELODY_PROGRAM.flute;
}

/* One instrument track: program, CC7 and every note-on/off in the chain. */
function notesTrack(song,def,events){
  var out=[], i, e, tr=trackOf(song,def.id), vol=tr && typeof tr.vol==="number" ? tr.vol : 1, ch=def.ch;
  if(def.kind!=="drum"){
    out.push({tick:0, order:0, bytes:[0xC0|ch, programOf(song,def.id)]});
  }
  out.push({tick:0, order:1, bytes:[0xB0|ch, 0x07, clamp127(vol*127)]});

  for(i=0;i<events.length;i++){
    e=events[i];
    if(e.track!==def.id || !(e.vel>0)) continue;          /* a rest is a note that does not sound */
    var vel=Math.round(e.vel*127);
    if(vel<1) vel=1;
    if(vel>127) vel=127;
    var gate=typeof e.gate==="number" ? e.gate : 1;
    var len=Math.max(1, Math.round(e.len*gate));
    var tick=Math.round(e.tick);
    var pitches=[], j;
    if(def.kind==="drum"){
      if(DRUM[e.key]!=null) pitches=[DRUM[e.key]];
    } else if(def.kind==="chord"){
      pitches=(SONG && SONG.chordNotes ? SONG.chordNotes(song,e.deg,e.q,e.acc) : null) || [];
    } else {
      var p=SONG && SONG.noteMidi ? SONG.noteMidi(song,def.id,e.deg,e.acc) : null;
      if(p!=null) pitches=[p];
    }
    for(j=0;j<pitches.length;j++){
      var pitch=pitches[j];
      /* a degree far outside the scale can still point past the 7-bit note number: keep the byte in range */
      if(pitch<0) pitch=0;
      else if(pitch>127) pitch=127;
      /* an off before an on at the same tick keeps a repeated pitch from being cut short by its own neighbour */
      out.push({tick:tick, order:3, pitch:pitch, bytes:[0x90|ch, pitch&127, vel]});
      out.push({tick:tick+len, order:2, pitch:pitch, bytes:[0x80|ch, pitch&127, 0]});
    }
  }
  return serialize(out);
}

function write(song){
  var tracks=[], chain, ticks, events=[], i;
  if(!SONG || !song) return new Uint8Array(0);
  chain=Array.isArray(song.song) ? song.song : [0];
  ticks=SONG.chainTicks ? SONG.chainTicks(song,chain) : 0;
  events=SONG.chainEvents ? SONG.chainEvents(song,chain,0,ticks) : [];

  /* the conductor track: the tape's name, its tempo and a plain 4/4 */
  var bpm=typeof song.bpm==="number" && isFinite(song.bpm) && song.bpm>0 ? song.bpm : 120;
  var conductor=[];
  conductor.push({tick:0, order:0, bytes:trackName(typeof song.name==="string" ? song.name : "")});
  conductor.push({tick:0, order:1, bytes:tempoMeta(bpm)});
  conductor.push({tick:0, order:2, bytes:timeSignature()});
  tracks.push(serialize(conductor));

  for(i=0;i<TRACKS.length;i++) tracks.push(notesTrack(song,TRACKS[i],events));

  var out=["MThd".charCodeAt(0),"MThd".charCodeAt(1),"MThd".charCodeAt(2),"MThd".charCodeAt(3)];
  out=out.concat(be32(6), be16(1), be16(tracks.length), be16(DIV));
  for(i=0;i<tracks.length;i++){
    out=out.concat([0x4D,0x54,0x72,0x6B], be32(tracks[i].length), tracks[i]);
  }
  return new Uint8Array(out);
}

window.LopdaMidi={write:write, DIV:DIV};
})();
