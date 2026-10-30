/*
 * Lo-PDA runtime: the tape machine's AI co-editor (docs/design/studio.md section 12.16). buildMessages() puts the one
 * system prompt, a compact project state and the user's sentence on the AI line; parse() takes the one JSON object back
 * and turns it into the edit language of studio-edit.js. A skeleton comes back as a compact draft and goes through
 * studio-song.js's fromDraft, so a whole song is validated exactly like a stored tape.
 *
 *   LopdaStudioAI.messages(song, focus, text) -> [{role:"system",...},{role:"user",...}]
 *   LopdaStudioAI.summary(song, focus)          -> the state sent to the model
 *   LopdaStudioAI.parse(text, now)              -> {reply, ops} | {error, detail}
 *
 * No DOM, no LP; Node tests and the DeepSeek prompt trials run it. Only the project state is sent: never a recording,
 * never the key.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var S=window.LopdaSong;

var SYSTEM=[
"You are the co-editor inside Tape4, a fictional 1986 four-track handheld music machine. You change the user's song.",
"Reply in the language of the user's request (Chinese or English).",
"",
"OUTPUT: return exactly ONE JSON object and nothing else. No markdown, no code fences, no prose around it.",
'For an edit: {"reply":"one short sentence","ops":[...]}',
'For a new song from scratch: {"reply":"one short sentence","draft":{...}}',
"Never both ops and draft. If the request is unclear, or asks for something this machine cannot do, return ops: [] and say why in reply.",
"",
"THE SONG",
"- bpm 60-140; key 0-11 (C=0, C#=1, D=2, Eb=3, E=4, F=5, F#=6, G=7, Ab=8, A=9, Bb=10, B=11); scale one of minor-penta, major-penta, minor, major, dorian; swing 0.5-0.75; tape 0-4; kit soft or chip.",
"- Tracks: drums, bass, chords, melody, voice. The voice track is reserved for a later recording step: never edit it.",
"- One pattern is one 4/4 bar of 16 steps, step 0 is the first square (the screen shows 1-16). Patterns are 0-15 (A-P). The song chain has up to 64 slots naming patterns.",
"- Drums keys: kick, snare, hat, perc. Velocity 0..1: 0.2 is a ghost note, 0.85-1 an accent.",
"- Bass and melody notes are scale degrees: 0 is the tonic, 1 the next scale note, and so on; -1 is the scale note below the tonic. The editor shows eight keys, 0-7, but a stored note may use a higher or lower degree to reach another octave: add the scale length (5 for a five-note scale, 7 for a seven-note scale) for one octave up.",
"- Chords are roots 0-5 of the parent seven-note scale (I-vi); the machine voices them as sevenths or ninths. A chord rings until the next chord or the bar end.",
"- Any note rings until the next note on that track or the bar end. A note with velocity 0 is a rest (silence).",
"- Swing is GLOBAL for the whole song. There is no per-pattern swing, no automation, no 3/4 or 6/8, no tempo or key change in the middle, no audio effects besides the tape colour, and no new instruments.",
"- If the user asks for only one section to swing more, explain that swing is global and either move the global swing or leave ops empty.",
"",
"EDIT OPS (use as few as possible; at most 64)",
'{"op":"setBpm","value":96}            absolute tempo',
'{"op":"bpm","delta":4}                 + or - tempo',
'{"op":"setSwing","value":0.6}          absolute swing',
'{"op":"swing","delta":0.02}',
'{"op":"setKey","value":9}              A minor',
'{"op":"setScale","value":"major"}',
'{"op":"setTape","value":2}             0 clean .. 4 worn',
'{"op":"tape","delta":1}',
'{"op":"setKit","value":"soft"}',
'{"op":"setName","value":"Rainy night"}',
'{"op":"setTrackVolume","track":"drums","value":0.8}',
'{"op":"trackVol","track":"bass","delta":-0.1}',
'{"op":"setTrackMute","track":"melody","mute":true}',
'{"op":"setDrum","pattern":0,"drum":"snare","step":4,"on":true,"vel":0.2}',
'{"op":"setNote","pattern":0,"track":"bass","step":0,"deg":0,"vel":0.8}',
'{"op":"setNote","pattern":0,"track":"chords","step":0,"deg":0,"vel":0.65}',
'{"op":"setRest","pattern":0,"track":"melody","step":8}',
'{"op":"removeNote","pattern":0,"track":"bass","step":8}',
'{"op":"clearTrack","pattern":1,"track":"melody"}      arrangement: drop a track from this bar',
'{"op":"clearPattern","pattern":1}',
'{"op":"copyPattern","from":0,"to":1}',
'{"op":"setSlot","slot":4,"pattern":2}',
'{"op":"addSlot","pattern":0}',
'{"op":"insertSlot","at":4,"pattern":2}',
'{"op":"removeSlot","at":4}',
"",
"A DRAFT FOR A NEW SONG",
'{"name":"...","bpm":96,"key":0,"scale":"major","swing":0.5,"tape":1,"kit":"soft",',
' "tracks":{"drums":{"vol":1,"mute":false},"bass":{"vol":1,"mute":false},"chords":{"vol":1,"mute":false},"melody":{"vol":1,"mute":false}},',
' "patterns":[{"drums":[[0,"kick",1],[2,"kick",0.85],[4,"snare",0.9]],"bass":[[0,0,0.8],[8,0,0.8]],"chords":[[0,0,0.65]],"melody":[]}],',
' "song":[0]}',
"All steps in a draft are 0-based. Drum entries are [step, key, velocity]; note entries are [step, degree, velocity].",
"Write 4, 8 or 16-bar phrases and repeat patterns in song for a 2-3 minute piece (up to 64 slots). Keep the drum velocities human: ghost notes and accents, not every hit at 1.",
"For a skeleton, prefer a clear, singable pop/lofi idea over a dense showcase. Use only scale degrees that fit the chosen scale.",
"",
"RULES OF TASTE",
"- Make the smallest change that answers the request; never rewrite the whole song for a small edit.",
"- Preserve what already works. Do not touch other patterns unless the request is about them.",
"- For 'more like X' or 'make a skeleton', be concrete: pick a progression, a groove, a bass line and a short melody; leave space.",
"- The current state is the source of truth. Do not repeat unchanged notes in ops."
].join("\n");

function plain(x){ return !!x && typeof x==="object" && Object.prototype.toString.call(x)==="[object Object]"; }
function notes(list,withKey){
  var out=[], i, n;
  if(!Array.isArray(list)) return out;
  for(i=0;i<list.length;i++){
    n=list[i];
    if(!n) continue;
    if(withKey) out.push([Math.round(n.t/S.STEP),n.key,n.vel]);
    else out.push([Math.round(n.t/S.STEP),n.deg,n.vel]);
  }
  return out;
}
/* Only the patterns the song uses, plus the one being edited: a 16-pattern project still fits in a prompt, and the
   model sees the whole arrangement without a wall of empty bars. */
function summary(song,focus){
  if(!song) return null;
  var used={}, i, p, chain=song.song||[], pats=song.patterns||[], tracks=song.tracks||[];
  for(i=0;i<chain.length;i++) used[chain[i]]=true;
  if(focus && typeof focus.pattern==="number") used[focus.pattern]=true;
  var patterns=[];
  for(i=0;i<S.PATTERNS_MAX;i++){
    if(!pats[i] || !pats[i].notes) continue;
    var has=pats[i].notes, nonEmpty=(has.drums&&has.drums.length)||(has.bass&&has.bass.length)||(has.chords&&has.chords.length)||(has.melody&&has.melody.length);
    if(!used[i] && !nonEmpty) continue;
    p={p:i};
    var d=notes(pats[i].notes.drums,true);
    var b=notes(pats[i].notes.bass,false), c=notes(pats[i].notes.chords,false), m=notes(pats[i].notes.melody,false);
    if(d.length) p.drums=d;
    if(b.length) p.bass=b;
    if(c.length) p.chords=c;
    if(m.length) p.melody=m;
    patterns.push(p);
  }
  var mix=[];
  for(i=0;i<tracks.length;i++) mix.push({id:tracks[i].id,vol:tracks[i].vol,mute:!!tracks[i].mute});
  return {
    name:song.name||"", bpm:song.bpm, key:S.NAMES[song.key], keyNumber:song.key, scale:song.scale,
    swing:song.swing, tape:song.tape, kit:song.kit,
    tracks:mix, song:chain.slice(), patterns:patterns,
    focus:focus ? {screen:focus.screen||"", pattern:focus.pattern, slot:focus.slot} : null
  };
}

function messages(song,focus,text){
  var state=summary(song,focus);
  return [
    {role:"system",content:SYSTEM},
    {role:"user",content:"CURRENT PROJECT\n"+JSON.stringify(state)+"\n\nREQUEST\n"+String(text==null?"":text)}
  ];
}

/* one JSON object, even when the model wrapped it in a code fence or added a sentence before it */
function parse(text,now){
  var s=String(text==null?"":text).trim(), a=s.indexOf("{"), b=s.lastIndexOf("}"), obj;
  if(a<0 || b<=a) return {error:"shape",detail:"no json"};
  try{ obj=JSON.parse(s.slice(a,b+1)); }catch(e){ return {error:"json",detail:String(e&&e.message||e)}; }
  if(!plain(obj)) return {error:"shape",detail:"not an object"};
  var reply=typeof obj.reply==="string" ? obj.reply.trim() : "";
  if(Array.isArray(obj.ops) && obj.draft!=null) return {error:"shape",detail:"ops and draft"};
  if(obj.draft!=null){
    var built=S.fromDraft(obj.draft,now||Date.now());
    if(!built.song) return {error:"draft",detail:built.error||"draft"};
    return {reply:reply,draft:true,ops:[{op:"replaceSong",song:built.song}]};
  }
  if(!Array.isArray(obj.ops)) return {error:"shape",detail:"no ops"};
  if(obj.ops.length>64) return {error:"shape",detail:"too many ops"};
  return {reply:reply,ops:obj.ops};
}

window.LopdaStudioAI={SYSTEM:SYSTEM, summary:summary, messages:messages, parse:parse};
})();
