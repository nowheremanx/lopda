/*
 * Lo-PDA runtime: the song data of the four-track tape machine (docs/design/studio.md sections 3, 11 and 12). Pure functions,
 * no DOM, so Node tests run them: the format constants and the demo beat, a fresh song, validate (what a song from storage
 * or a file must look like), drum steps on and off, notes and rests, the pattern chain, the events the player schedules
 * (with swing), scale degrees and the example tape.
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
   file from another writer (or a later version) may carry other tracks. vol is the mixer's level (0-1, in tenths on
   screen) and mute its switch; a 1b-1 file without them reads as vol 1, mute off (12.14). */
var TRACKS=[
  {id:"drums", kind:"drum", vol:1, mute:false},
  {id:"bass", kind:"note", vol:1, mute:false},
  {id:"chords", kind:"chord", vol:1, mute:false},
  {id:"melody", kind:"note", vol:1, mute:false},
  {id:"voice", kind:"voice", vol:1, mute:false}
];

var SCALES={
  "minor-penta":[0,3,5,7,10],
  "major-penta":[0,2,4,7,9],
  "minor":[0,2,3,5,7,8,10],
  "major":[0,2,4,5,7,9,11],
  "dorian":[0,2,3,5,7,9,10]
};

/* The seven-note scale behind each grid scale (12.5): chords are stacked in thirds of the seven-note scale, so a
   five-note pad borrows its parent. */
var PARENT={"minor-penta":"minor","major-penta":"major","minor":"minor","major":"major","dorian":"dorian"};

/* Pitch classes the way the note and chord labels write them: the sharps and flats this machine shows, not a key
   signature. */
var NAMES=["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];

/* The demo beat as it reads on the 16-step grid (1-based), with the velocity of each drum row. Original, so no licence. */
var DEMO={
  kick:[1,8,11],
  snare:[5,13],
  hat:[1,3,5,7,9,11,13],
  perc:[16],
  vel:{kick:1, snare:0.9, hat:0.55, perc:0.7}
};

/* The demo's bass and chords, same 1-based grid as DEMO (12.9); the drum beat is untouched, so 1a songs play the same. */
var DEMO_BASS=[[1,0],[9,2],[11,3]], DEMO_CHORDS=[[1,0],[9,3]];

/* The example tape (12.12, rewritten after the owner's second try): a neo-soul tune in A dorian, original. Eight one-bar
   patterns make two four-bar phrases, so the song moves by phrase instead of repeating each bar: a verse (A-D: Am9 |
   D9 | Cmaj9 Bm7 | Em9 D9) and a chorus (E-H: Cmaj9 | Bm7 Em9 | Am9 F#m7b5 | D9 with a fill), played verse, verse,
   chorus, chorus, verse, chorus. Dorian's major sixth (F#) gives the i9 - IV9 sound the style leans on.
   What makes it lean rather than square: the bass lands on the next chord's root a 16th early (step 8 or 16) and
   leaves holes with rests; the melody starts off the beat and breathes; ghost snares and soft 16th hats sit under a
   heavier swing (0.62). Every number is here so the tape can be read and changed. Drum rows are 1-based steps, or
   [step, velocity] for a ghost or an accent; note rows are [step, degree] or [step, degree, velocity], with degrees of
   the grid's own scale (dorian: 0 A, 1 B, 2 C, 3 D, 4 E, 5 F#, 6 G, 7 A) for bass and melody, of the scale for chords
   (0 Am9, 1 Bm7, 2 Cmaj9, 3 D9, 4 Em9, 5 F#m7b5), and a null degree is a rest. The chords play at 0.65: a soft
   pad under the flute, and the whole tape stays below the soft clip's knee most of the time. */
var R=null;
var GROOVE={                                   /* the verse: kick 1, the "and" before 3, a push on 11; ghosts on 10 and 16 */
  kick:[1,[8,0.75],[11,0.9]], snare:[5,[10,0.22],13,[16,0.28]],
  hat:[1,[3,0.35],5,[7,0.35],[8,0.2],9,[11,0.35],13,[15,0.4]], perc:[],
  vel:{kick:0.85, snare:0.9, hat:0.5, perc:0.35}
};
var GROOVE_D={                                 /* the verse's last bar: the ghosts walk up into the next phrase */
  kick:[1,[8,0.75],[11,0.9]], snare:[5,13,[14,0.3],[15,0.4],[16,0.55]],
  hat:[1,[3,0.35],5,[7,0.35],9,[11,0.35]], perc:[], vel:GROOVE.vel
};
var GROOVE_C={                                 /* the chorus: more 16ths, a wood block answering the snare */
  kick:[1,[7,0.8],[11,0.9],[12,0.5]], snare:[[3,0.2],5,[10,0.22],13,[15,0.25]],
  hat:[1,[2,0.25],3,5,[6,0.25],7,9,[10,0.25],11,13,[14,0.25],15], perc:[[4,0.35],[12,0.35]],
  vel:{kick:0.85, snare:0.9, hat:0.45, perc:0.35}
};
var GROOVE_H={                                 /* the turnaround: a snare roll that climbs back to the top */
  kick:[1,[8,0.75]], snare:[5,[9,0.3],[11,0.35],[13,0.45],[14,0.55],[15,0.7],[16,0.85]],
  hat:[1,[3,0.35],5,[7,0.35]], perc:[], vel:GROOVE.vel
};
var DEMO_SONG={
  bpm:78, scale:"dorian", swing:0.62,
  patterns:[
    /* A  Am9 */
    {drums:GROOVE, chords:[[1,0,0.65]],
     bass:[[1,0],[3,R],[4,0,0.6],[7,4],[8,R],[11,6],[13,7],[15,6]],
     melody:[[3,4],[4,6,0.6],[6,7],[9,6],[10,R],[11,4],[13,6],[15,R]]},
    /* B  D9 */
    {drums:GROOVE, chords:[[1,3,0.65]],
     bass:[[1,3],[3,R],[4,3,0.6],[7,5],[8,R],[11,7],[13,6],[16,2]],
     melody:[[2,5],[4,4],[5,3],[7,R],[9,5],[10,6,0.6],[11,5],[12,3],[14,4],[16,R]]},
    /* C  Cmaj9 Bm7 */
    {drums:GROOVE, chords:[[1,2,0.65],[9,1,0.65]],
     bass:[[1,2],[4,R],[5,2,0.6],[7,4],[8,1],[11,R],[12,3],[14,5],[16,4]],
     melody:[[3,1],[4,2,0.6],[5,4],[7,6],[8,5],[11,3],[12,R],[13,1],[15,R]]},
    /* D  Em9 D9 */
    {drums:GROOVE_D, chords:[[1,4,0.65],[9,3,0.65]],
     bass:[[1,4],[3,R],[4,4,0.6],[6,6],[8,3],[11,R],[12,5],[14,3],[16,0]],
     melody:[[1,6],[3,5],[4,4,0.6],[6,R],[9,5],[11,4],[12,3,0.6],[13,0],[15,R]]},
    /* E  Cmaj9 */
    {drums:GROOVE_C, chords:[[1,2,0.65]],
     bass:[[1,2],[2,R],[3,2,0.5],[5,4],[7,6],[8,R],[9,2],[11,R],[12,4],[14,6],[16,1]],
     melody:[[1,6],[2,7,0.6],[4,6],[5,4],[7,R],[9,1],[11,2],[12,4,0.6],[13,6],[15,R]]},
    /* F  Bm7 Em9 */
    {drums:GROOVE_C, chords:[[1,1,0.65],[9,4,0.65]],
     bass:[[1,1],[3,R],[4,1,0.6],[7,3],[8,4],[11,R],[12,4,0.6],[14,6],[16,0]],
     melody:[[1,5],[3,3],[4,1,0.6],[6,R],[8,6],[10,5],[11,4],[13,R],[14,3,0.6],[15,4],[16,R]]},
    /* G  Am9 F#m7b5 */
    {drums:GROOVE_C, chords:[[1,0,0.65],[9,5,0.65]],
     bass:[[1,0],[3,R],[4,0,0.6],[7,2],[8,5],[11,R],[12,5,0.6],[14,2],[16,3]],
     melody:[[1,7],[3,6],[5,4],[6,6,0.6],[8,R],[9,5],[11,2],[12,0,0.6],[13,2],[15,R]]},
    /* H  D9, the fill */
    {drums:GROOVE_H, chords:[[1,3,0.65]],
     bass:[[1,3],[3,R],[5,3,0.7],[7,5],[9,7],[11,6],[13,5],[14,4],[15,3],[16,2]],
     melody:[[1,5],[3,4],[5,3],[7,R]]}
  ],
  /* verse, verse, chorus, chorus, verse, chorus: 24 bars, about 74 seconds */
  song:[0,1,2,3, 0,1,2,3, 4,5,6,7, 4,5,6,7, 0,1,2,3, 4,5,6,7]
};

/* The straight pop example (12.15): C major, 96 BPM, no swing, I-V-vi-IV. A short intro, two verses, two choruses,
   a last verse and chorus, then an outro: 26 bars, about 65 seconds. It is the answer to "can this machine make an
   ordinary pop backing?" - a four-piece band sketch, not a production. */
var POP_VERSE={
  kick:[1,[3,0.82]], snare:[2,4], perc:[],
  hat:[[1,0.4],[3,0.32],[5,0.4],[7,0.32],[9,0.4],[11,0.32],[13,0.4],[15,0.32]],
  vel:{kick:0.85,snare:0.85,hat:0.4,perc:0.3}
};
var POP_CHORUS={
  kick:[1,[3,0.9],[7,0.55]], snare:[2,4,[10,0.22]],
  hat:[[1,0.45],[3,0.35],[5,0.45],[7,0.35],[9,0.45],[11,0.35],[13,0.45],[15,0.35]],
  perc:[[4,0.3],[12,0.3]], vel:{kick:0.88,snare:0.88,hat:0.42,perc:0.32}
};
var POP_FILL={
  kick:[1,[3,0.9]], snare:[2,4,[10,0.2],[13,0.3],[14,0.45],[15,0.6],[16,0.75]],
  hat:[[1,0.45],[3,0.35],[5,0.45],[7,0.35],[9,0.45],[11,0.35],[13,0.45]],
  perc:[], vel:{kick:0.88,snare:0.88,hat:0.42,perc:0.32}
};
var POP_INTRO={
  kick:[1,[3,0.8]], snare:[2,4],
  hat:[[1,0.38],[3,0.3],[5,0.38],[7,0.3],[9,0.38],[11,0.3],[13,0.38],[15,0.3]],
  perc:[], vel:{kick:0.82,snare:0.82,hat:0.38,perc:0.3}
};
var POP_EMPTY_DRUMS={kick:[],snare:[],hat:[],perc:[]};
function popBass(deg,busy){
  return busy
    ? [[1,deg],[3,deg],[5,deg],[7,deg+7],[9,deg],[11,deg],[13,deg+7],[15,deg]]
    : [[1,deg],[5,deg],[9,deg],[13,deg]];
}
var POP_SONG={
  name:"白日流行", bpm:96, key:0, scale:"major", swing:0.5, tape:1,
  patterns:[
    /* A-D: verse, C G Am F */
    {drums:POP_VERSE, chords:[[1,0,0.65]], bass:popBass(0,false), melody:[[7,2],[15,4]]},
    {drums:POP_VERSE, chords:[[1,4,0.65]], bass:popBass(4,false), melody:[[7,6],[15,1]]},
    {drums:POP_VERSE, chords:[[1,5,0.65]], bass:popBass(5,false), melody:[[7,0],[15,2]]},
    {drums:POP_VERSE, chords:[[1,3,0.65]], bass:popBass(3,false), melody:[[7,5],[15,0]]},
    /* E-H: chorus, the same four chords with an eight-note bass and a hook */
    {drums:POP_CHORUS, chords:[[1,0,0.65]], bass:popBass(0,true), melody:[[3,2],[6,4],[11,2],[14,1]]},
    {drums:POP_CHORUS, chords:[[1,4,0.65]], bass:popBass(4,true), melody:[[3,6],[6,1],[11,6],[14,5]]},
    {drums:POP_CHORUS, chords:[[1,5,0.65]], bass:popBass(5,true), melody:[[3,0],[6,2],[11,0],[14,6]]},
    {drums:POP_FILL, chords:[[1,3,0.65]], bass:popBass(3,true), melody:[[3,5],[6,0],[11,5],[14,4]]},
    /* I: intro, drums and a C bass, no chords or melody */
    {drums:POP_INTRO, chords:[], bass:popBass(0,false), melody:[]},
    /* J: outro, chords and bass only */
    {drums:POP_EMPTY_DRUMS, chords:[[1,0,0.65]], bass:[[1,0],[9,0]], melody:[]}
  ],
  /* intro, verse, verse, chorus, chorus, verse, chorus, outro: 26 bars */
  song:[8, 0,1,2,3, 0,1,2,3, 4,5,6,7, 4,5,6,7, 0,1,2,3, 4,5,6,7, 9]
};


var SWING_MIN=0.5, SWING_MAX=0.75, SWING_DEFAULT=0.55, TAPE_MAX=4, PATTERNS_MAX=16, SONG_MAX=64, NAME_MAX=40;

/* Which synth voice a track plays (12.6): a constant, not a song field, so a later version can revoice a track without
   migrating files. 12.12 moved the melody from the bright pluck to the flute. */
var SOUND={bass:"bass", chords:"keys", melody:"flute"};
var NOTE_VEL=0.8;
/* A "stop" on the note/chord screens is a rest: the format has no rest field, only a note that does not sound, so a rest
   is {t, len, deg:0, vel:0} and every player simply skips it (12.12). */
var REST_VEL=0;
/* The two chord cells of a bar start on step 1 and step 9 (12.5). */
var CHORD_STEPS=[0,8];

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

/* a drum row set (a kit's DEMO shape) as notes, sorted by the grid */
function drumNotes(spec){
  var out=[];
  for(var i=0;i<DRUMS.length;i++){
    var drum=DRUMS[i], steps=spec[drum], vel=(spec.vel&&spec.vel[drum]!=null)?spec.vel[drum]:DEMO.vel[drum];
    for(var j=0;j<steps.length;j++){
      /* a bare step plays at the row's velocity; [step, vel] is a ghost note or an accent */
      var hit=steps[j], step=Array.isArray(hit)?hit[0]:hit, v=Array.isArray(hit)?hit[1]:vel;
      out.push({t:(step-1)*STEP, len:STEP, key:drum, vel:v});
    }
  }
  out.sort(order);
  return out;
}

/* the DEMO steps as notes, sorted once at load */
function demoNames(){ return drumNotes(DEMO); }

/* ---------- a fresh song ---------- */
/* The demo's note tracks: [step, degree] pairs run through the same tie the editor uses, so a fresh song already holds
   the lengths the editor would compute. */
function demoTrack(pairs){
  var out=[];
  for(var i=0;i<pairs.length;i++){
    var rest=pairs[i][1]==null;
    out.push({t:(pairs[i][0]-1)*STEP, len:STEP, deg:rest?0:pairs[i][1],
      vel:rest?REST_VEL:(pairs[i][2]!=null?pairs[i][2]:NOTE_VEL)});
  }
  return tie(out, STEPS*STEP);
}

/* "A note sounds until the next note" (12.4): sort first, then every len is the distance to the next start, the last
   one reaching the end of the pattern. Every add, remove or pitch change on a note or chord track ends here. */
function tie(list,end){
  list.sort(function(a,b){ return a.t-b.t; });
  for(var i=0;i<list.length;i++) list[i].len=(i+1<list.length?list[i+1].t:end)-list[i].t;
  return list;
}

function newSong(now){
  var tracks=[];
  for(var i=0;i<TRACKS.length;i++) tracks.push({id:TRACKS[i].id, kind:TRACKS[i].kind, vol:TRACKS[i].vol, mute:TRACKS[i].mute});
  return {
    v:V, name:"", bpm:BPM_DEFAULT, key:9, scale:"minor-penta", swing:SWING_DEFAULT, tape:2, kit:"soft",
    tracks:tracks,
    patterns:[{len:STEPS, notes:{drums:demoNames(), bass:demoTrack(DEMO_BASS), chords:demoTrack(DEMO_CHORDS), melody:[]}}],
    song:[0], clips:[], updated:now||0
  };
}

/* The example tape in the menu (12.12): newSong's key and soft kit with DEMO_SONG's tempo, scale and swing, its eight
   patterns and its chain. A fresh song and the example are separate: "new tape" stays the single demo bar. */
function demoSong(now){
  var song=newSong(now), i, d;
  song.bpm=DEMO_SONG.bpm; song.scale=DEMO_SONG.scale; song.swing=DEMO_SONG.swing;
  song.patterns=[];
  for(i=0;i<DEMO_SONG.patterns.length;i++){
    d=DEMO_SONG.patterns[i];
    song.patterns.push({len:STEPS, notes:{drums:drumNotes(d.drums), bass:demoTrack(d.bass),
      chords:demoTrack(d.chords), melody:demoTrack(d.melody)}});
  }
  song.song=DEMO_SONG.song.slice();
  return song;
}

/* The straight pop example (12.15): popSong() and demoSong() share the builder; only the notes and the settings differ. */
function popSong(now){
  var song=newSong(now), i, d;
  song.name=POP_SONG.name; song.bpm=POP_SONG.bpm; song.key=POP_SONG.key; song.scale=POP_SONG.scale;
  song.swing=POP_SONG.swing; song.tape=POP_SONG.tape; song.kit="soft";
  song.patterns=[];
  for(i=0;i<POP_SONG.patterns.length;i++){
    d=POP_SONG.patterns[i];
    song.patterns.push({len:STEPS, notes:{drums:drumNotes(d.drums), bass:demoTrack(d.bass),
      chords:demoTrack(d.chords), melody:demoTrack(d.melody)}});
  }
  song.song=POP_SONG.song.slice();
  return song;
}

/* ---------- a compact draft, for the AI and for templates (12.16) ----------
   A full v1 song is verbose: every note needs t and len in ticks, and a model is likely to get the ties wrong. A draft
   names steps (0-15), degrees and velocities instead; this turns it into the stored format, ties every note track and
   runs the same validate() as storage. It is also the shape the built-in templates use. */
function fromDraft(draft,now){
  if(!plain(draft)) return {error:"draft"};
  var song=newSong(now), i, j, d, p, list, hit, e, tr, tracks, m;
  song.name=typeof draft.name==="string" ? draft.name : "AI 磁带";
  if(typeof draft.bpm!=="undefined") song.bpm=draft.bpm;
  if(typeof draft.key!=="undefined") song.key=draft.key;
  if(typeof draft.scale!=="undefined") song.scale=draft.scale;
  if(typeof draft.swing!=="undefined") song.swing=draft.swing;
  if(typeof draft.tape!=="undefined") song.tape=draft.tape;
  if(typeof draft.kit!=="undefined") song.kit=draft.kit;
  if(!Array.isArray(draft.patterns) || draft.patterns.length<1 || draft.patterns.length>PATTERNS_MAX) return {error:"draft"};
  song.patterns=[];
  for(i=0;i<draft.patterns.length;i++){
    d=draft.patterns[i];
    if(!plain(d)) return {error:"draft"};
    p={len:STEPS, notes:{drums:[], bass:[], chords:[], melody:[]}};
    list=[];
    if(d.drums!=null){
      if(!Array.isArray(d.drums)) return {error:"draft"};
      for(j=0;j<d.drums.length;j++){
        e=d.drums[j];
        if(!Array.isArray(e) || e.length<2 || !int(e[0]) || e[0]<0 || e[0]>=STEPS || DRUMS.indexOf(e[1])<0) return {error:"draft"};
        hit={t:e[0]*STEP, len:STEP, key:e[1], vel:e.length>2?e[2]:1};
        if(!num(hit.vel) || hit.vel<0 || hit.vel>1) return {error:"draft"};
        list.push(hit);
      }
      list.sort(order);
      p.notes.drums=list;
    }
    for(m=0;m<3;m++){
      var track=["bass","chords","melody"][m], src=d[track];
      list=[];
      if(src!=null){
        if(!Array.isArray(src)) return {error:"draft"};
        for(j=0;j<src.length;j++){
          e=src[j];
          if(!Array.isArray(e) || e.length<2 || !int(e[0]) || e[0]<0 || e[0]>=STEPS || !int(e[1])) return {error:"draft"};
          if(track==="chords" && (e[1]<0 || e[1]>5)) return {error:"draft"};
          hit={t:e[0]*STEP, len:STEP, deg:e[1], vel:e.length>2?e[2]:NOTE_VEL};
          if(!num(hit.vel) || hit.vel<0 || hit.vel>1) return {error:"draft"};
          list.push(hit);
        }
        tie(list,STEPS*STEP);
      }
      p.notes[track]=list;
    }
    song.patterns.push(p);
  }
  if(draft.song!=null){
    if(!Array.isArray(draft.song) || draft.song.length<1 || draft.song.length>SONG_MAX) return {error:"draft"};
    song.song=draft.song.slice();
  } else {
    song.song=[];
    for(i=0;i<song.patterns.length;i++) song.song.push(i);
  }
  if(draft.tracks!=null){
    if(!plain(draft.tracks)) return {error:"draft"};
    for(i=0;i<song.tracks.length;i++){
      tr=song.tracks[i];
      tracks=draft.tracks[tr.id];
      if(tracks==null) continue;
      if(!plain(tracks)) return {error:"draft"};
      if(typeof tracks.vol!=="undefined"){
        if(!num(tracks.vol) || tracks.vol<0 || tracks.vol>1) return {error:"draft"};
        tr.vol=Math.round(tracks.vol*10)/10;
      }
      if(typeof tracks.mute!=="undefined"){
        if(typeof tracks.mute!=="boolean") return {error:"draft"};
        tr.mute=tracks.mute;
      }
    }
  }
  return validate(song);
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
    if(typeof tr.vol!=="undefined" && (!num(tr.vol) || tr.vol<0 || tr.vol>1)) return {error:"tracks"};
    if(typeof tr.mute!=="undefined" && typeof tr.mute!=="boolean") return {error:"tracks"};
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

  return {song:mixDefaults(clone(x))};
}

/* A 1b-1 tape has no mixer fields. They are additive inside v 1, so an old song reads with every track at full volume
   and unmuted; validate fills them in, and every save from then on carries them (12.14). */
function mixDefaults(song){
  var tracks=song && song.tracks, i, tr;
  if(!Array.isArray(tracks)) return song;
  for(i=0;i<tracks.length;i++){
    tr=tracks[i];
    if(typeof tr.vol==="undefined") tr.vol=1;
    if(typeof tr.mute==="undefined") tr.mute=false;
  }
  return song;
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

/* An explicit drum hit on or off, for the AI's edits and the editor: toggle() is the tap, this is "set it to this".
   A hit is one 16th long, like the grid's; vel lets a ghost note be written. */
function setDrum(song,p,drum,step,on,vel){
  var out=clone(song);
  if(!plain(out) || DRUMS.indexOf(drum)<0 || !int(p) || p<0 || p>=PATTERNS_MAX || !int(step) || step<0 || step>=STEPS) return out;
  var pat=out.patterns && out.patterns[p];
  if(pat && (!plain(pat) || !int(pat.len) || pat.len<1)) return out;
  var v=vel==null ? 1 : vel;
  if(!num(v) || v<0 || v>1) return out;
  out=ensureInto(out,p);
  pat=out.patterns[p];
  if(!plain(pat.notes)) pat.notes={};
  var list=pat.notes.drums;
  if(!Array.isArray(list)) list=pat.notes.drums=[];
  var at=step*STEP, i;
  for(i=0;i<list.length;i++) if(list[i] && list[i].key===drum && list[i].t===at) break;
  if(on===false){
    if(i<list.length) list.splice(i,1);
  } else {
    if(i<list.length) list[i].vel=v;
    else { list.push({t:at, len:STEP, key:drum, vel:v}); list.sort(order); }
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

/* ---------- the grid's pitch ----------
   The bass sits in E2..D#3 (MIDI 40..51) and the melody one octave above it (12.12; it was two octaves in 1b-1's first
   draft), so the tonic places the key's pitch class in that window and noteMidi walks the scale from there. A minor
   puts the bass on A2 45 and the melody on A3 57. */
function tonic(track,key){
  if(!int(key)) return null;
  var base=40+((key-4+12)%12);
  if(track==="bass") return base;
  if(track==="melody") return base+12;
  return null;
}

function noteMidi(song,track,deg){
  var steps=song && Object.prototype.hasOwnProperty.call(SCALES,song.scale) ? SCALES[song.scale] : null;
  var base=tonic(track, song && song.key);
  if(!steps || base==null || !int(deg)) return null;
  var n=steps.length, q=Math.floor(deg/n), r=deg-q*n;
  return base+12*q+steps[r];
}

function noteName(midi){
  if(!int(midi)) return null;
  return NAMES[((midi%12)+12)%12];
}

/* ---------- chords ----------
   A chord root is a degree of the seven-note parent scale. Stacking thirds there (not on the five notes of the pad)
   gives the seventh and ninth; when the ninth is a major second above the root, the fifth is dropped (12.5). */
function scaleAt(steps,d){
  var n=steps.length, q=Math.floor(d/n), r=d-q*n;
  return steps[r]+12*q;
}

function chordOf(song,deg){
  var parent=song && Object.prototype.hasOwnProperty.call(PARENT,song.scale) ? PARENT[song.scale] : null;
  var steps=parent && SCALES[parent];
  if(!steps || !int(song.key) || !int(deg)) return null;
  var d=((deg%7)+7)%7;
  var root=48+(((song.key+steps[d])%12)+12)%12;
  var third=scaleAt(steps,deg+2)-scaleAt(steps,deg);
  var fifth=scaleAt(steps,deg+4)-scaleAt(steps,deg);
  var seventh=scaleAt(steps,deg+6)-scaleAt(steps,deg);
  var ninth=scaleAt(steps,deg+8)-scaleAt(steps,deg);
  /* a major second above the root: the ninth replaces the fifth, which would only crowd the voicing */
  var addNine=ninth-12===2;
  var notes=addNine
    ? [root, root+third, root+seventh, root+ninth]
    : [root, root+third, root+fifth, root+seventh];
  return {d:d, root:root, third:third, fifth:fifth, seventh:seventh, ninth:ninth, addNine:addNine, notes:notes};
}

function chordNotes(song,deg){
  var c=chordOf(song,deg);
  return c ? c.notes : null;
}

function chordName(song,deg){
  var c=chordOf(song,deg);
  if(!c) return null;
  var roman=["I","II","III","IV","V","VI","VII"][c.d];
  if(c.third===3) roman=roman.toLowerCase();
  if(c.fifth===6) roman+="ø";
  var suffix;
  if(c.third===4 && c.seventh===11) suffix=c.addNine?"maj9":"maj7";
  else if(c.third===3 && c.seventh===10 && c.fifth===7) suffix=c.addNine?"m9":"m7";
  else if(c.third===4 && c.seventh===10) suffix=c.addNine?"9":"7";
  else if(c.fifth===6) suffix="m7b5";
  else suffix="";
  return {roman:roman, name:NAMES[((c.root%12)+12)%12]+suffix};
}

function clampBpm(bpm){
  var n=Math.round(bpm);
  if(!isFinite(n)) return BPM_DEFAULT;
  return Math.max(BPM_MIN, Math.min(BPM_MAX, n));
}

/* ---------- patterns A-P (12.3) ---------- */
/* A pattern is created on demand up to 16, the number of letter buttons; an empty one is the shape every screen expects. */
function emptyPattern(){
  return {len:STEPS, notes:{drums:[], bass:[], chords:[], melody:[]}};
}

/* Fills on the copied song, so callers that already hold a clone do not clone twice. */
function ensureInto(out,i){
  if(!plain(out)) return out;
  if(!Array.isArray(out.patterns)) out.patterns=[];
  while(out.patterns.length<=i) out.patterns.push(emptyPattern());
  return out;
}

function ensurePattern(song,i){
  var out=clone(song);
  if(!int(i) || i<0 || i>=PATTERNS_MAX) return out;
  return ensureInto(out,i);
}

function hasNotes(song,p,track){
  var pat=song && song.patterns && song.patterns[p];
  var list=pat && pat.notes && pat.notes[track];
  return Array.isArray(list) && list.length>0;
}

function patternEmpty(song,p){
  var pat=song && song.patterns && song.patterns[p];
  if(!pat || !plain(pat.notes)) return true;
  var keys=Object.keys(pat.notes);
  for(var i=0;i<keys.length;i++) if(Array.isArray(pat.notes[keys[i]]) && pat.notes[keys[i]].length) return false;
  return true;
}

function copyPattern(song,from,to){
  var out=clone(song);
  if(!plain(out)) return out;
  if(!int(from) || !int(to) || from===to) return out;
  if(from<0 || from>=PATTERNS_MAX || to<0 || to>=PATTERNS_MAX) return out;
  var src=out.patterns && out.patterns[from];
  if(!plain(src) || !int(src.len) || src.len<1 || !plain(src.notes)) return out;
  out=ensureInto(out,to);
  var dst=out.patterns[to];
  if(!plain(dst)) dst=out.patterns[to]={len:STEPS, notes:{drums:[], bass:[], chords:[], melody:[]}};
  dst.len=src.len;
  dst.notes=clone(src.notes);
  return out;
}

/* ---------- notes on the grid (12.4, 12.5) ----------
   A note's tick is its position; its len is only a consequence ("sounds until the next note"), so every edit re-ties the
   track. Drum hits stay on the step grid and keep their own length rule, so setNote/removeNote ignore that track. */
function trackKind(song,id){
  var tracks=song && song.tracks;
  if(!Array.isArray(tracks)) return null;
  for(var i=0;i<tracks.length;i++) if(tracks[i] && tracks[i].id===id) return tracks[i].kind;
  return null;
}

function editable(song,track){
  var kind=trackKind(song,track);
  return kind==="note" || kind==="chord";
}

function noteAt(song,p,track,t){
  var pat=song && song.patterns && song.patterns[p];
  var list=pat && pat.notes && pat.notes[track];
  if(!Array.isArray(list)) return null;
  for(var i=0;i<list.length;i++) if(list[i] && list[i].t===t) return clone(list[i]);
  return null;
}

/* A rest is stored as a note that does not sound (12.12): vel 0 is what every player and the synth skip. */
function isRest(note){ return !!note && note.vel===REST_VEL; }

function setNote(song,p,track,t,deg,vel){
  var out=clone(song);
  if(!editable(out,track)) return out;
  if(!int(p) || p<0 || p>=PATTERNS_MAX || !int(t) || t<0) return out;
  var src=song.patterns && song.patterns[p];
  /* an existing pattern with a broken len cannot be tied: refuse it instead of writing NaN lengths. A missing pattern is
     different, it is created with the default length below. */
  if(src && (!plain(src) || !int(src.len) || src.len<1)) return out;
  var len=src ? src.len : STEPS;
  if(t>=len*STEP || !int(deg) || deg<-32 || deg>32) return out;
  var v=vel==null ? NOTE_VEL : vel;
  if(!num(v) || v<0 || v>1) return out;

  out=ensureInto(out,p);
  var pat=out.patterns[p];
  if(!plain(pat.notes)) pat.notes={};
  var list=pat.notes[track];
  if(!Array.isArray(list)) list=pat.notes[track]=[];
  var found=null;
  for(var i=0;i<list.length;i++) if(list[i] && list[i].t===t){ found=list[i]; break; }
  /* an existing note keeps its velocity: the pitch keys change the degree, not how hard it is played. A rest at the tick
     becomes a real note at NOTE_VEL instead: a key sets a pitch, it does not keep the rest's silence. */
  if(found){
    found.deg=deg;
    if(isRest(found)) found.vel=NOTE_VEL;
  }
  else list.push({t:t, len:1, deg:deg, vel:v});
  tie(list, pat.len*STEP);
  return out;
}

/* The "stop" key: a rest at t, replacing a note there. The tie then lets the previous note sound up to the rest and
   gives the rest itself the length the editor would give any note; deg is 0 because a rest has no pitch. */
function setRest(song,p,track,t){
  var out=clone(song);
  if(!editable(out,track)) return out;
  if(!int(p) || p<0 || p>=PATTERNS_MAX || !int(t) || t<0) return out;
  var src=song.patterns && song.patterns[p];
  if(src && (!plain(src) || !int(src.len) || src.len<1)) return out;
  var len=src ? src.len : STEPS;
  if(t>=len*STEP) return out;

  out=ensureInto(out,p);
  var pat=out.patterns[p];
  if(!plain(pat.notes)) pat.notes={};
  var list=pat.notes[track];
  if(!Array.isArray(list)) list=pat.notes[track]=[];
  var i;
  for(i=0;i<list.length;i++){
    if(list[i] && list[i].t===t){ list[i]={t:t, len:1, deg:0, vel:REST_VEL}; break; }
  }
  if(i>=list.length) list.push({t:t, len:1, deg:0, vel:REST_VEL});
  tie(list, pat.len*STEP);
  return out;
}

function removeNote(song,p,track,t){
  var out=clone(song);
  if(!editable(out,track)) return out;
  if(!int(p) || p<0 || p>=PATTERNS_MAX || !int(t) || t<0) return out;
  var pat=out.patterns && out.patterns[p];
  if(!plain(pat) || !int(pat.len) || pat.len<1 || t>=pat.len*STEP) return out;
  var list=pat.notes && pat.notes[track];
  if(!Array.isArray(list)) return out;
  for(var i=0;i<list.length;i++) if(list[i] && list[i].t===t){ list.splice(i,1); break; }
  tie(list, pat.len*STEP);
  return out;
}

/* Empty one track in one pattern. The arrangement tool: copy a pattern, then clear the tracks that should drop out,
   rather than deleting notes one at a time (12.15). A missing pattern is created empty; an unknown or voice track is
   refused, like the note editors. */
function clearTrack(song,p,track){
  var out=clone(song);
  if(!plain(out) || !int(p) || p<0 || p>=PATTERNS_MAX) return out;
  var kind=trackKind(out,track);
  if(kind==="voice" || (kind!=="drum" && kind!=="note" && kind!=="chord")) return out;
  out=ensureInto(out,p);
  if(!plain(out.patterns[p].notes)) out.patterns[p].notes={};
  out.patterns[p].notes[track]=[];
  return out;
}

/* The mixer's two stored fields (12.14), as one pure edit for the AI and the screens. */
function setTrackMix(song,id,patch){
  var out=clone(song);
  if(!plain(out) || !plain(patch)) return out;
  var i, tr=null;
  for(i=0;i<out.tracks.length;i++) if(out.tracks[i] && out.tracks[i].id===id){ tr=out.tracks[i]; break; }
  if(!tr) return out;
  if(typeof patch.vol!=="undefined"){
    if(!num(patch.vol) || patch.vol<0 || patch.vol>1) return out;
    tr.vol=Math.round(patch.vol*10)/10;
  }
  if(typeof patch.mute!=="undefined"){
    if(typeof patch.mute!=="boolean") return out;
    tr.mute=patch.mute;
  }
  return out;
}

/* ---------- the song chain (12.8) ---------- */
function setSlot(song,i,p){
  var out=clone(song);
  if(!plain(out)) return out;
  if(!Array.isArray(out.song) || !int(i) || i<0 || i>=out.song.length) return out;
  if(!int(p) || p<0 || p>=PATTERNS_MAX) return out;
  out=ensureInto(out,p);
  out.song[i]=p;
  return out;
}

function addSlot(song,p){
  var out=clone(song);
  if(!plain(out)) return out;
  if(!int(p) || p<0 || p>=PATTERNS_MAX) return out;
  if(!Array.isArray(out.song)) out.song=[];
  if(out.song.length>=SONG_MAX) return out;
  out=ensureInto(out,p);
  out.song.push(p);
  return out;
}

function dropSlot(song){
  var out=clone(song);
  if(!plain(out)) return out;
  if(!Array.isArray(out.song) || out.song.length<=1) return out;
  out.song.pop();
  return out;
}

/* Insert at i (0..length, so the end is allowed) and remove slot i (never the last remaining one). Both copy, keep
   unknown fields and ensure the inserted pattern; a refused call is an unchanged copy, like addSlot and dropSlot. */
function insertSlot(song,i,p){
  var out=clone(song);
  if(!plain(out)) return out;
  if(!Array.isArray(out.song) || !int(i) || i<0 || i>out.song.length) return out;
  if(!int(p) || p<0 || p>=PATTERNS_MAX) return out;
  if(out.song.length>=SONG_MAX) return out;
  out=ensureInto(out,p);
  out.song.splice(i,0,p);
  return out;
}

function removeSlot(song,i){
  var out=clone(song);
  if(!plain(out)) return out;
  if(!Array.isArray(out.song) || out.song.length<=1) return out;
  if(!int(i) || i<0 || i>=out.song.length) return out;
  out.song.splice(i,1);
  return out;
}

/* ---------- scheduling the chain (12.7) ----------
   A chain entry that names a missing pattern is an empty 16-step bar here too, so a song with a stale slot keeps time
   instead of stopping. The swing offset is decided inside each pattern (odd 16th), and the last odd step of a segment
   may land in the next segment's ticks; the pass loop starts one pass back for that. */
function chainSegments(song,chain){
  var out=[], start=0;
  if(!Array.isArray(chain)) return out;
  for(var i=0;i<chain.length;i++){
    var p=chain[i], pat=song && song.patterns && int(p) ? song.patterns[p] : null;
    var len=pat && int(pat.len) && pat.len>=1 ? pat.len : STEPS;
    out.push({slot:i, p:p, len:len, ticks:len*STEP, start:start});
    start+=len*STEP;
  }
  return out;
}

function chainTicks(song,chain){
  var segs=chainSegments(song,chain), total=0;
  for(var i=0;i<segs.length;i++) total+=segs[i].ticks;
  return total;
}

/* Where a tick falls: the slot, its pattern and the tick inside that pattern. Ticks beyond a pass wrap; a negative tick
   means the start, so a player that asks before the clock starts still has an answer. */
function chainAt(song,chain,tick){
  var segs=chainSegments(song,chain);
  if(!segs.length) return null;
  if(!num(tick) || tick<0) return {slot:0, p:segs[0].p, t:0};
  var total=0, i;
  for(i=0;i<segs.length;i++) total+=segs[i].ticks;
  var m=tick%total;
  for(i=0;i<segs.length;i++){
    if(m<segs[i].ticks) return {slot:i, p:segs[i].p, t:m};
    m-=segs[i].ticks;
  }
  return {slot:segs.length-1, p:segs[segs.length-1].p, t:m};
}

/* The segments are sorted by start; binary searches keep a 64-slot chain cheap to narrow to the few bars a window covers. */
function firstEndAfter(segs,tick){
  var lo=0, hi=segs.length, mid;
  while(lo<hi){
    mid=(lo+hi)>>1;
    if(segs[mid].start+segs[mid].ticks>tick) hi=mid;
    else lo=mid+1;
  }
  return lo;
}

function firstStartAtOrAfter(segs,tick){
  var lo=0, hi=segs.length, mid;
  while(lo<hi){
    mid=(lo+hi)>>1;
    if(segs[mid].start>=tick) hi=mid;
    else lo=mid+1;
  }
  return lo;
}

function chainEvents(song,chain,fromTick,toTick){
  var out=[];
  /* the scheduler window must be finite and positive; a window that starts before zero simply starts at zero */
  if(!isFinite(fromTick) || !isFinite(toTick)) return out;
  if(fromTick<0) fromTick=0;
  if(!(toTick>fromTick)) return out;
  var segs=chainSegments(song,chain);
  if(!segs.length) return out;
  var total=0, i, n;
  for(i=0;i<segs.length;i++) total+=segs[i].ticks;
  if(total<=0) return out;

  var pats=song && song.patterns;
  var tracks=(song && song.tracks) || [], place={};
  for(i=0;i<tracks.length;i++) place["$"+tracks[i].id]=i;
  var off=swingTicks(song && song.swing);
  if(!num(off)) off=0;
  /* only a forward swing makes a note leave its own bar; a negative one is outside the format's range */
  var spill=off>0?off:0;

  var first=Math.floor((fromTick-spill)/total), last=Math.floor(toTick/total);
  /* A segment can spill into the next one, so each pass starts one segment early; the pass itself starts early when the
     window is within a swing's reach of the pass boundary. Everything outside the window is dropped below. */
  for(var pass=first;pass<=last;pass++){
    var base=pass*total;
    if(base>=toTick || base+total+spill<=fromTick) continue;
    var lo=fromTick-base, hi=toTick-base;
    if(lo<0) lo=0;
    if(hi>total) hi=total;
    var a=firstEndAfter(segs,lo);
    if(a>0) a--;
    var b=firstStartAtOrAfter(segs,hi)-1;
    for(i=a;i<=b;i++){
      var seg=segs[i];
      var pat=int(seg.p) ? pats && pats[seg.p] : null;
      if(!pat || !plain(pat.notes)) continue;
      var segBase=base+seg.start;
      for(var k=0;k<tracks.length;k++){
        var tr=tracks[k];
        if(tr.kind==="voice" || tr.mute) continue;
        var list=pat.notes[tr.id];
        if(!Array.isArray(list)) continue;
        for(n=0;n<list.length;n++){
          var note=list[n];
          var tick=segBase+note.t+(Math.floor(note.t/STEP)%2 ? off : 0);
          if(tick<fromTick || tick>=toTick) continue;
          var e={tick:tick, track:tr.id};
          if(tr.kind==="drum") e.key=note.key;
          else e.deg=note.deg;
          e.vel=note.vel;
          e.len=note.len;
          e.p=seg.p;
          e.slot=seg.slot;
          out.push(e);
        }
      }
    }
  }

  /* the same order as events(): tick, the song's track order, the drum row, then the degrees of a chord */
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

window.LopdaSong={
  V:V, TPB:TPB, STEP:STEP, STEPS:STEPS,
  BPM_MIN:BPM_MIN, BPM_MAX:BPM_MAX, BPM_DEFAULT:BPM_DEFAULT, BPM_STEP:BPM_STEP,
  DRUMS:DRUMS, KITS:KITS, KINDS:KINDS, TRACKS:TRACKS, SCALES:SCALES, PARENT:PARENT, DEMO:DEMO,
  DEMO_BASS:DEMO_BASS, DEMO_CHORDS:DEMO_CHORDS, DEMO_SONG:DEMO_SONG,
  POP_SONG:POP_SONG,
  SOUND:SOUND, NOTE_VEL:NOTE_VEL, REST_VEL:REST_VEL, CHORD_STEPS:CHORD_STEPS, NAMES:NAMES,
  SWING_MIN:SWING_MIN, SWING_MAX:SWING_MAX, SWING_DEFAULT:SWING_DEFAULT,
  TAPE_MAX:TAPE_MAX, PATTERNS_MAX:PATTERNS_MAX, SONG_MAX:SONG_MAX, NAME_MAX:NAME_MAX,
  newSong:newSong, demoSong:demoSong, popSong:popSong, fromDraft:fromDraft, validate:validate, has:has, toggle:toggle,
  setDrum:setDrum, clearTrack:clearTrack, setTrackMix:setTrackMix,
  swingTicks:swingTicks, events:events, ticksToSec:ticksToSec,
  degreeToMidi:degreeToMidi, clampBpm:clampBpm,
  tonic:tonic, noteMidi:noteMidi, noteName:noteName,
  chordNotes:chordNotes, chordName:chordName,
  emptyPattern:emptyPattern, ensurePattern:ensurePattern, hasNotes:hasNotes, patternEmpty:patternEmpty,
  copyPattern:copyPattern, noteAt:noteAt, isRest:isRest, setNote:setNote, setRest:setRest, removeNote:removeNote,
  setSlot:setSlot, addSlot:addSlot, dropSlot:dropSlot, insertSlot:insertSlot, removeSlot:removeSlot,
  chainEvents:chainEvents, chainTicks:chainTicks, chainAt:chainAt
};
})();
