/*
 * Lo-PDA runtime: the four-track tape machine's edit operations (docs/design/studio.md section 12.16). A small,
 * validated language shared by the AI assistant, the local quick commands and (later) the piano roll: an operation
 * names one musical change, never a whole new song. apply() is pure and atomic: either every operation lands on a valid
 * v1 song, or the input is returned unchanged with an error.
 *
 *   LopdaStudioEdit.apply(song, [{op:"setBpm", value:96}, ...]) -> {song, ops} | {song, error, at}
 *
 * Steps are 0-based 16th steps, patterns 0-15 (A-P), degrees are the grid's scale degrees, velocities and volumes are
 * 0..1. The operations are deliberately the ones the screens already understand; a track's notes are re-tied by the
 * song helpers, so an edit cannot leave a broken length. setChain replaces the whole song chain (1-96 slots naming
 * patterns 0-15) and fills in any pattern it names that does not exist yet. No DOM, no LP: Node tests run it.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var S=window.LopdaSong;

function plain(x){ return !!x && typeof x==="object" && Object.prototype.toString.call(x)==="[object Object]"; }
function int(n){ return typeof n==="number" && isFinite(n) && Math.floor(n)===n; }
function num(n){ return typeof n==="number" && isFinite(n); }
function copy(x){ return JSON.parse(JSON.stringify(x)); }
function fail(code,at,detail){ return {error:code, at:at, detail:detail||""}; }
function clamp(n,lo,hi){ return Math.max(lo,Math.min(hi,n)); }

var NOTE_TRACKS=["bass","chords","melody"], ALL_TRACKS=["drums","bass","chords","melody"];
var CHORD_KEYS=["drums"].concat(NOTE_TRACKS);  /* the editable tracks; the voice track is not here yet */

function apply(song, ops){
  var out=copy(song), applied=0, i, op, r, at;
  if(!Array.isArray(ops)) return fail("ops",0);
  if(ops.length>64) return fail("many",0);
  for(i=0;i<ops.length;i++){
    op=ops[i]; at=i;
    if(!plain(op) || typeof op.op!=="string") return fail("op",at);
    r=one(out,op,at);
    if(r && r.error) return r;
    out=r.song;
    applied++;
  }
  r=S.validate(out);
  if(!r.song) return fail("validate",applied,r.error);
  return {song:r.song, ops:applied};
}

function one(song,op,at){
  var v, p, tr, step, list, next, id;
  switch(op.op){
    case "setBpm":
      if(!num(op.value)) return fail("value",at);
      song.bpm=S.clampBpm(op.value); return {song:song};
    case "bpm":
      if(!num(op.delta)) return fail("value",at);
      song.bpm=S.clampBpm(song.bpm+op.delta); return {song:song};
    case "setSwing":
      if(!num(op.value)) return fail("value",at);
      song.swing=Math.round(clamp(op.value,S.SWING_MIN,S.SWING_MAX)*100)/100; return {song:song};
    case "swing":
      if(!num(op.delta)) return fail("value",at);
      return one(song,{op:"setSwing",value:song.swing+op.delta},at);
    case "setKey":
      if(!int(op.value) || op.value<0 || op.value>11) return fail("value",at);
      song.key=op.value; return {song:song};
    case "setScale":
      if(typeof op.value!=="string" || !S.SCALES[op.value]) return fail("value",at);
      song.scale=op.value; return {song:song};
    case "setTape":
      if(!num(op.value)) return fail("value",at);
      song.tape=clamp(Math.round(op.value),0,S.TAPE_MAX); return {song:song};
    case "tape":
      if(!num(op.delta)) return fail("value",at);
      return one(song,{op:"setTape",value:song.tape+op.delta},at);
    case "setName":
      if(typeof op.value!=="string" || op.value.length>40*2 || Array.from(op.value).length>40) return fail("value",at);
      song.name=op.value; return {song:song};
    case "setKit":
      if(S.KITS.indexOf(op.value)<0) return fail("value",at);
      song.kit=op.value; return {song:song};
    case "setTrackVolume":
      if(ALL_TRACKS.indexOf(op.track)<0 || !num(op.value) || !trackOf(song,op.track)) return fail("track",at);
      return mix(song,op.track,{vol:op.value},at);
    case "trackVol":
      if(ALL_TRACKS.indexOf(op.track)<0 || !num(op.delta)) return fail("track",at);
      tr=trackOf(song,op.track);
      if(!tr) return fail("track",at);
      return mix(song,op.track,{vol:clamp((typeof tr.vol==="number"?tr.vol:1)+op.delta,0,1)},at);
    case "setTrackMute":
      if(ALL_TRACKS.indexOf(op.track)<0 || typeof op.mute!=="boolean" || !trackOf(song,op.track)) return fail("track",at);
      return mix(song,op.track,{mute:op.mute},at);
    case "setDrum":
      if(!int(op.pattern) || op.pattern<0 || op.pattern>=S.PATTERNS_MAX || S.DRUMS.indexOf(op.drum)<0 ||
         !int(op.step) || op.step<0 || op.step>=S.STEPS) return fail("value",at);
      if(typeof op.on!=="undefined" && typeof op.on!=="boolean") return fail("value",at);
      next=S.setDrum(song,op.pattern,op.drum,op.step,op.on!==false,op.vel);
      return {song:next};
    case "setNote":
      if(NOTE_TRACKS.indexOf(op.track)<0 || !int(op.pattern) || op.pattern<0 || op.pattern>=S.PATTERNS_MAX ||
         !int(op.step) || op.step<0 || op.step>=S.STEPS || !int(op.deg)) return fail("value",at);
      if(op.track==="chords" && (op.deg<0 || op.deg>5)) return fail("value",at);
      if(typeof op.vel!=="undefined" && (!num(op.vel) || op.vel<0 || op.vel>1)) return fail("value",at);
      if(op.vel===0){ next=S.setRest(song,op.pattern,op.track,op.step*S.STEP); return {song:next}; }
      next=S.setNote(song,op.pattern,op.track,op.step*S.STEP,op.deg,op.vel);
      return {song:next};
    case "setRest":
      if(NOTE_TRACKS.indexOf(op.track)<0 || !int(op.pattern) || op.pattern<0 || op.pattern>=S.PATTERNS_MAX ||
         !int(op.step) || op.step<0 || op.step>=S.STEPS) return fail("value",at);
      next=S.setRest(song,op.pattern,op.track,op.step*S.STEP);
      return {song:next};
    case "removeNote":
      if(NOTE_TRACKS.indexOf(op.track)<0 || !int(op.pattern) || op.pattern<0 || op.pattern>=S.PATTERNS_MAX ||
         !int(op.step) || op.step<0 || op.step>=S.STEPS) return fail("value",at);
      next=S.removeNote(song,op.pattern,op.track,op.step*S.STEP);
      return {song:next};
    case "clearTrack":
      if(ALL_TRACKS.indexOf(op.track)<0 || !int(op.pattern) || op.pattern<0 || op.pattern>=S.PATTERNS_MAX) return fail("value",at);
      next=S.clearTrack(song,op.pattern,op.track);
      return {song:next};
    case "clearPattern":
      if(!int(op.pattern) || op.pattern<0 || op.pattern>=S.PATTERNS_MAX) return fail("value",at);
      song=S.clearTrack(song,op.pattern,"drums");
      song=S.clearTrack(song,op.pattern,"bass");
      song=S.clearTrack(song,op.pattern,"chords");
      song=S.clearTrack(song,op.pattern,"melody");
      return {song:song};
    case "copyPattern":
      if(!int(op.from) || !int(op.to) || op.from<0 || op.from>=S.PATTERNS_MAX || op.to<0 || op.to>=S.PATTERNS_MAX) return fail("value",at);
      if(!song.patterns || !song.patterns[op.from]) return fail("value",at);
      next=S.copyPattern(song,op.from,op.to);
      return {song:next};
    case "setSlot":
      if(!int(op.slot) || !int(op.pattern) || !Array.isArray(song.song) || op.slot<0 || op.slot>=song.song.length || op.pattern<0 || op.pattern>=S.PATTERNS_MAX) return fail("value",at);
      next=S.setSlot(song,op.slot,op.pattern);
      return {song:next};
    case "addSlot":
      if(!int(op.pattern) || op.pattern<0 || op.pattern>=S.PATTERNS_MAX) return fail("value",at);
      if(!Array.isArray(song.song) || song.song.length>=S.SONG_MAX) return fail("full",at);
      next=S.addSlot(song,op.pattern);
      return {song:next};
    case "insertSlot":
      if(!int(op.at) || !int(op.pattern) || !Array.isArray(song.song) || op.at<0 || op.at>song.song.length || op.pattern<0 || op.pattern>=S.PATTERNS_MAX) return fail("value",at);
      if(song.song.length>=S.SONG_MAX) return fail("full",at);
      next=S.insertSlot(song,op.at,op.pattern);
      return {song:next};
    case "removeSlot":
      if(!int(op.at) || !Array.isArray(song.song) || op.at<0 || op.at>=song.song.length) return fail("value",at);
      if(song.song.length<=1) return fail("value",at);
      next=S.removeSlot(song,op.at);
      return {song:next};
    case "setChain":
      if(!Array.isArray(op.song) || op.song.length<1 || op.song.length>S.SONG_MAX) return fail("value",at);
      for(v=0;v<op.song.length;v++) if(!int(op.song[v]) || op.song[v]<0 || op.song[v]>=S.PATTERNS_MAX) return fail("value",at);
      next=op.song.slice();
      /* an empty bar is better than a chain slot that points nowhere: the screens and the player both expect every
         named pattern to exist */
      for(v=0;v<next.length;v++) if(!Array.isArray(song.patterns) || !song.patterns[next[v]]) song=S.ensurePattern(song,next[v]);
      song.song=next;
      return {song:song};
    case "replaceSong":
      if(!plain(op.song)) return fail("value",at);
      next=S.validate(op.song);
      if(!next.song) return fail("song",at,next.error);
      return {song:copy(next.song)};
    default:
      return fail("unknown",at,op.op);
  }
}

function trackOf(song,id){
  var i;
  for(i=0;i<song.tracks.length;i++) if(song.tracks[i] && song.tracks[i].id===id) return song.tracks[i];
  return null;
}

function mix(song,track,patch,at){
  var next=S.setTrackMix(song,track,patch);
  /* setTrackMix refuses an unchanged unknown track by returning a copy; we already checked the id, so only a broken
     value can leave it unchanged. Either way the value is validated here once more. */
  if(typeof patch.vol!=="undefined" && (!num(patch.vol) || patch.vol<0 || patch.vol>1)) return fail("value",at);
  return {song:next};
}

window.LopdaStudioEdit={apply:apply, NOTE_TRACKS:NOTE_TRACKS, ALL_TRACKS:ALL_TRACKS};
})();
