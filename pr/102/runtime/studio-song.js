/*
 * Lo-PDA runtime: the song data of the four-track tape machine (docs/design/studio.md sections 3 and 11). Pure functions,
 * no DOM, so Node tests run them: the format constants and the demo beat, a fresh song, validate (what a song from storage
 * or a file must look like), drum steps on and off, the events the player schedules (with swing), and scale degrees.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

/* ---------- the format ----------
   Ticks, not seconds or step numbers: 96 per beat and 24 per 16th step, so a piano roll, a free note length or a slower
   tempo later needs no migration. A pattern is measured in 16th steps for the grid. */
var V=1, TPB=96, STEP=24, STEPS=16;

var BPM_MIN=60, BPM_MAX=140, BPM_DEFAULT=82, BPM_STEP=2;

var DRUMS=["kick","snare","hat","perc"], KITS=["chip","soft"], KINDS=["drum","note","chord","voice"];

/* Track ids are the keys of a pattern's notes and of the editor's state, so they are a plain slug: lower-case letters,
   digits and "-", starting with a letter. That keeps "__proto__" and friends out of plain objects used as maps. */
var TRACK_ID=/^[a-z][a-z0-9-]{0,15}$/;

/* a pattern is 16 steps in 1a; four bars of off-grid notes are far below this, and a broken file cannot make validate
   walk millions of notes */
var NOTES_MAX=1024;

/* "4 instruments + 1 voice" is this constant, not a rule of the format: the stored song keeps its own track list, so a
   file from another writer (or a later version) may carry other tracks. */
var TRACKS=[
  {id:"drums", kind:"drum"},
  {id:"bass", kind:"note"},
  {id:"chords", kind:"chord"},
  {id:"melody", kind:"note"},
  {id:"voice", kind:"voice"}
];

var SCALES={
  "minor-penta":[0,3,5,7,10],
  "major-penta":[0,2,4,7,9],
  "minor":[0,2,3,5,7,8,10],
  "major":[0,2,4,5,7,9,11],
  "dorian":[0,2,3,5,7,9,10]
};

/* The demo beat as it reads on the 16-step grid (1-based), with the velocity of each drum row. Original, so no licence. */
var DEMO={
  kick:[1,8,11],
  snare:[5,13],
  hat:[1,3,5,7,9,11,13],
  perc:[16],
  vel:{kick:1, snare:0.9, hat:0.55, perc:0.7}
};

var SWING_MIN=0.5, SWING_MAX=0.75, SWING_DEFAULT=0.55, TAPE_MAX=4, PATTERNS_MAX=8, SONG_MAX=64, NAME_MAX=40;

/* ---------- small checks and a copy ---------- */
/* a plain object, not an array, a Date or a boxed primitive: the song is JSON-shaped data */
function plain(x){ return !!x && typeof x==="object" && Object.prototype.toString.call(x)==="[object Object]"; }
function int(n){ return typeof n==="number" && isFinite(n) && Math.floor(n)===n; }
function num(n){ return typeof n==="number" && isFinite(n); }

/* validate hands back a copy, and toggle copies the song before touching it: the editor must never edit the document
   it loaded by accident, and unknown fields from a newer minor writer have to survive a load and a save. */
function clone(x){
  var i, k, out;
  if(Array.isArray(x)){
    out=[];
    for(i=0;i<x.length;i++) out.push(clone(x[i]));
    return out;
  }
  if(x && typeof x==="object"){
    out={};
    for(k in x) if(Object.prototype.hasOwnProperty.call(x,k)) out[k]=clone(x[k]);
    return out;
  }
  return x;
}

/* the drum list is stable: by time, then by the row of the drum, so the grid reads straight down and a removed and
   re-added hit comes back where it was */
function order(a,b){
  var d=a.t-b.t;
  return d || DRUMS.indexOf(a.key)-DRUMS.indexOf(b.key);
}

/* the DEMO steps as notes, sorted once at load */
function demoNames(){
  var out=[];
  for(var i=0;i<DRUMS.length;i++){
    var drum=DRUMS[i], steps=DEMO[drum];
    for(var j=0;j<steps.length;j++) out.push({t:(steps[j]-1)*STEP, len:STEP, key:drum, vel:DEMO.vel[drum]});
  }
  out.sort(order);
  return out;
}

/* ---------- a fresh song ---------- */
function newSong(now){
  var tracks=[];
  for(var i=0;i<TRACKS.length;i++) tracks.push({id:TRACKS[i].id, kind:TRACKS[i].kind});
  return {
    v:V, name:"", bpm:BPM_DEFAULT, key:9, scale:"minor-penta", swing:SWING_DEFAULT, tape:2, kit:"soft",
    tracks:tracks,
    patterns:[{len:STEPS, notes:{drums:demoNames(), bass:[], chords:[], melody:[]}}],
    song:[0], clips:[], updated:now||0
  };
}

/* ---------- validate: the one gate between storage / a file and the editor ----------
   A too-new file is refused as too new before its fields are judged: the fields we do not know may be the ones that
   changed, and reporting "broken" would invite a silent overwrite. Same rule as the backup.
   A document that blows the stack (a 20 000-deep unknown field) or throws from a getter is refused rather than allowed
   to take the editor down: to us it is a document we cannot read, which is "type". */
function validate(x){
  try { return check(x); }
  catch(e){ return {error:"type"}; }
}

function check(x){
  if(!plain(x)) return {error:"type"};
  if(int(x.v) && x.v>V) return {error:"newer"};
  if(!int(x.v) || x.v<1) return {error:"version"};

  if(!num(x.bpm) || x.bpm<BPM_MIN || x.bpm>BPM_MAX) return {error:"bpm"};
  if(!int(x.key) || x.key<0 || x.key>11) return {error:"key"};
  if(!Object.prototype.hasOwnProperty.call(SCALES,x.scale)) return {error:"scale"};
  if(!num(x.swing) || x.swing<SWING_MIN || x.swing>SWING_MAX) return {error:"swing"};
  if(!int(x.tape) || x.tape<0 || x.tape>TAPE_MAX) return {error:"tape"};
  if(KITS.indexOf(x.kit)<0) return {error:"kit"};

  var i, j, tr, note, list, keys, owner, max, k;
  if(!Array.isArray(x.tracks) || x.tracks.length<1 || x.tracks.length>8) return {error:"tracks"};
  /* ids are the keys of a pattern's notes; "$" keeps even an allowed "constructor" a harmless map key */
  var byId={};
  for(i=0;i<x.tracks.length;i++){
    tr=x.tracks[i];
    if(!plain(tr) || typeof tr.id!=="string" || !TRACK_ID.test(tr.id)) return {error:"tracks"};
    if(KINDS.indexOf(tr.kind)<0) return {error:"tracks"};
    if(Object.prototype.hasOwnProperty.call(byId,"$"+tr.id)) return {error:"tracks"};
    byId["$"+tr.id]=tr;
  }

  if(!Array.isArray(x.patterns) || x.patterns.length<1 || x.patterns.length>PATTERNS_MAX) return {error:"patterns"};
  for(i=0;i<x.patterns.length;i++){
    var p=x.patterns[i];
    if(!plain(p) || !int(p.len) || p.len<1 || p.len>64 || !plain(p.notes)) return {error:"patterns"};
    max=p.len*STEP;
    keys=Object.keys(p.notes);
    for(j=0;j<keys.length;j++){
      k=keys[j];
      owner=byId["$"+k];
      /* a voice track holds clips, not notes; a notes key with no track is a song this build cannot play */
      if(!owner || owner.kind==="voice") return {error:"notes"};
      list=p.notes[k];
      if(!Array.isArray(list) || list.length>NOTES_MAX) return {error:"notes"};
      for(var n=0;n<list.length;n++){
        note=list[n];
        if(!plain(note) || !int(note.t) || note.t<0 || note.t>=max ||
           !int(note.len) || note.len<1 || note.len>max ||
           !num(note.vel) || note.vel<0 || note.vel>1) return {error:"notes"};
        if(owner.kind==="drum"){
          if(DRUMS.indexOf(note.key)<0) return {error:"notes"};
        } else if(!int(note.deg) || note.deg<-32 || note.deg>32) return {error:"notes"};
      }
    }
  }

  if(!Array.isArray(x.song) || x.song.length<1 || x.song.length>SONG_MAX) return {error:"song"};
  for(i=0;i<x.song.length;i++) if(!int(x.song[i]) || x.song[i]<0 || x.song[i]>=x.patterns.length) return {error:"song"};
  if(!Array.isArray(x.clips)) return {error:"clips"};
  /* code points, not UTF-16 units; the length check first keeps a huge string from being copied into an array */
  if(typeof x.name!=="string" || x.name.length>NAME_MAX*2 || Array.from(x.name).length>NAME_MAX) return {error:"name"};
  if(!num(x.updated) || x.updated<0) return {error:"updated"};

  return {song:clone(x)};
}

/* ---------- the drum grid ---------- */
function has(song,p,track,key,step){
  var pat=song && song.patterns && song.patterns[p];
  var list=pat && pat.notes && pat.notes[track];
  if(!Array.isArray(list)) return false;
  var at=step*STEP;
  for(var i=0;i<list.length;i++) if(list[i] && list[i].key===key && list[i].t===at) return true;
  return false;
}

function toggle(song,p,track,key,step,vel){
  var out=clone(song);
  var pat=out && out.patterns && out.patterns[p];
  if(!pat) return out;
  if(!plain(pat.notes)) pat.notes={};
  var list=pat.notes[track];
  if(!Array.isArray(list)) list=pat.notes[track]=[];
  var at=step*STEP, i;
  for(i=0;i<list.length;i++) if(list[i] && list[i].key===key && list[i].t===at) break;
  if(i<list.length) list.splice(i,1);
  else {
    list.push({t:at, len:STEP, key:key, vel:vel==null?1:vel});
    list.sort(order);
  }
  return out;
}

/* ---------- scheduling ---------- */
/* Swing: the second 16th of each pair (step index odd) is pushed later by (swing - 0.5) * 2 * STEP ticks; the first keeps
   its place. That is the whole formula; the default 0.55 delays an odd step by 2.4 of its 24 ticks. */
function swingTicks(swing){
  return (swing-0.5)*2*STEP;
}

/* Events are in loop time, not pattern time: loop n places a pattern tick t at n * patternTicks + t + swing, with
   patternTicks = len * STEP. The player keeps one clock across loops, so a range can start mid-loop, span any number of
   loops, or be empty. Voice tracks (and tracks a later version muted) make no notes. */
function events(song,p,fromTick,toTick){
  var out=[];
  if(!(toTick>fromTick)) return out;
  var pat=song && song.patterns && song.patterns[p];
  if(!pat || !int(pat.len) || pat.len<1 || !plain(pat.notes)) return out;
  var P=pat.len*STEP, off=swingTicks(song.swing);
  var tracks=song.tracks || [], place={}, i;
  for(i=0;i<tracks.length;i++) place["$"+tracks[i].id]=i;

  var first=Math.floor(fromTick/P), last=Math.floor(toTick/P);
  /* one loop back too: an off-grid odd step (t up to P-1) swung by 0.75 can land in the next loop, so a range that
     starts there must still see it. Its earlier events are below fromTick and are dropped by the test below. */
  for(var loop=first-1;loop<=last;loop++){
    var base=loop*P;
    for(i=0;i<tracks.length;i++){
      var tr=tracks[i];
      if(tr.kind==="voice" || tr.mute) continue;
      var list=pat.notes[tr.id];
      if(!Array.isArray(list)) continue;
      for(var n=0;n<list.length;n++){
        var note=list[n];
        var tick=base+note.t+(Math.floor(note.t/STEP)%2 ? off : 0);
        if(tick<fromTick || tick>=toTick) continue;
        var e={tick:tick, track:tr.id};
        if(tr.kind==="drum") e.key=note.key;
        else e.deg=note.deg;
        e.vel=note.vel;
        e.len=note.len;
        out.push(e);
      }
    }
  }

  /* tick, then the song's track order, then the drum row; within one chord track the degrees rise, so a chord reads up */
  out.sort(function(a,b){
    if(a.tick!==b.tick) return a.tick-b.tick;
    var d=place["$"+a.track]-place["$"+b.track];
    if(d) return d;
    var da=DRUMS.indexOf(a.key), db=DRUMS.indexOf(b.key);
    if(da>=0 || db>=0) return da-db;
    return (a.deg||0)-(b.deg||0);
  });
  return out;
}

function ticksToSec(ticks,bpm){
  return ticks*60/(bpm*TPB);
}

/* ---------- pitch ---------- */
/* MIDI 60 is C4, so octave oct starts at 12*(oct+1). A degree outside the scale's length wraps a whole octave at a time,
   both ways: degree -1 of A minor penta is the G below A4 (67), not the G of two octaves down. */
function degreeToMidi(key,scale,deg,oct){
  var steps=SCALES[scale];
  if(!steps || !int(deg) || !int(key) || !int(oct)) return null;
  var n=steps.length, q=Math.floor(deg/n), r=deg-q*n;
  return 12*(oct+1)+key+12*q+steps[r];
}

function clampBpm(bpm){
  var n=Math.round(bpm);
  if(!isFinite(n)) return BPM_DEFAULT;
  return Math.max(BPM_MIN, Math.min(BPM_MAX, n));
}

window.LopdaSong={
  V:V, TPB:TPB, STEP:STEP, STEPS:STEPS,
  BPM_MIN:BPM_MIN, BPM_MAX:BPM_MAX, BPM_DEFAULT:BPM_DEFAULT, BPM_STEP:BPM_STEP,
  DRUMS:DRUMS, KITS:KITS, KINDS:KINDS, TRACKS:TRACKS, SCALES:SCALES, DEMO:DEMO,
  SWING_MIN:SWING_MIN, SWING_MAX:SWING_MAX, SWING_DEFAULT:SWING_DEFAULT,
  TAPE_MAX:TAPE_MAX, PATTERNS_MAX:PATTERNS_MAX, SONG_MAX:SONG_MAX, NAME_MAX:NAME_MAX,
  newSong:newSong, validate:validate, has:has, toggle:toggle,
  swingTicks:swingTicks, events:events, ticksToSec:ticksToSec,
  degreeToMidi:degreeToMidi, clampBpm:clampBpm
};
})();
