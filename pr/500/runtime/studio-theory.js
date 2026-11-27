/*
 * Lo-PDA runtime: the tape machine's sense of harmony for the AI harness (docs/design/studio.md section 12.20.9).
 * Since chords may take any type and any root a semitone off the scale, and melody notes may leave the scale, a small
 * model can write a G sharp major chord in D minor and call it a change (owner's tape, 2026-10-30). These checks keep
 * what a listener hears as "in the key": the scale's own chords with any type that stays in it, a short list of the
 * borrowed chords pop, folk and film music actually use, and melody notes off the scale only where they belong (a
 * tone of the chord under them, or a step between two neighbours). A refusal is one English sentence for the model.
 *
 *   LopdaStudioTheory.chordIssue(song, deg, q, acc)  -> "" | why this chord is outside the key
 *   LopdaStudioTheory.patternIssues(song, p)          -> [why, ...] for the chords and melody of one pattern
 *   LopdaStudioTheory.songIssues(song, patterns)      -> [why, ...] over the given patterns (all used ones by default)
 *   LopdaStudioTheory.borrowedText(song)              -> the borrowed chords allowed in this key, named, for a prompt
 *
 * Pure, no DOM, no LP; Node tests run it. Old tapes are never checked: only the AI's own output is.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var S=window.LopdaSong;

var MINORISH={"minor":1, "harmonic-minor":1, "dorian":1, "minor-penta":1, "phrygian":1};

/* Borrowed chords by root (semitones above the tonic) and family. Major: bVII, bVI, bIII, iv, II (the V of V), III
   (the V of vi), I7 (the V of IV). Minor: V and V7 (the raised seventh), IV (dorian), bII (Neapolitan), I (a major
   ending), vii dim. Anything else needs a reason a two-minute song rarely has. */
var BORROWED_MAJOR=[[10,"maj"],[8,"maj"],[3,"maj"],[5,"min"],[2,"maj"],[4,"maj"],[0,"maj"],[0,"dom"],[2,"dom"],[4,"dom"]];
var BORROWED_MINOR=[[7,"maj"],[7,"dom"],[5,"maj"],[5,"dom"],[1,"maj"],[0,"maj"],[11,"dim"],[2,"min"]];

function pc(n){ return ((n%12)+12)%12; }
function int(n){ return typeof n==="number" && isFinite(n) && Math.floor(n)===n; }

/* The pitch classes a listener accepts in this key, relative to the tonic: the parent scale, and in a minor key the
   raised sixth and seventh too, which melodic minor uses all the time. */
function keySet(song){
  var parent=S.PARENT && S.PARENT[song.scale] || song.scale, st=S.SCALES[parent]||S.SCALES.major, set={}, i;
  for(i=0;i<st.length;i++) set[st[i]]=true;
  if(MINORISH[song.scale]){ set[9]=true; set[11]=true; }
  return set;
}

/* major, minor, diminished or dominant: what the ear hears first in a chord */
function family(notes){
  var root=notes[0], third=-1, fifth=-1, sev=-1, i, d;
  for(i=1;i<notes.length;i++){
    d=pc(notes[i]-root);
    if(d===3 || d===4) { if(third<0) third=d; }
    else if(d===6 || d===7 || d===8) { if(fifth<0) fifth=d; }
    else if(d===10 || d===11) { if(sev<0) sev=d; }
  }
  if(third===3) return fifth===6 ? "dim" : "min";
  if(third===4) return sev===10 ? "dom" : "maj";
  return "other";
}

function chordLabel(song,deg,q,acc){
  var n=S.chordName(song,deg,q,acc);
  return n ? n.name : "?";
}

function chordIssue(song,deg,q,acc){
  var notes=S.chordNotes(song,deg,q,acc), set, i, out=0, root, fam, list;
  if(!notes || !notes.length) return "";
  set=keySet(song);
  for(i=0;i<notes.length;i++) if(!set[pc(notes[i]-song.key)]) out++;
  if(!out) return "";
  root=pc(notes[0]-song.key);
  fam=family(notes);
  list=MINORISH[song.scale] ? BORROWED_MINOR : BORROWED_MAJOR;
  for(i=0;i<list.length;i++) if(list[i][0]===root && list[i][1]===fam) return "";
  /* a sus or power chord on a borrowed root is as clear as its plain triad */
  if(fam==="other") for(i=0;i<list.length;i++) if(list[i][0]===root) return "";
  return "the chord "+chordLabel(song,deg,q,acc)+" is outside "+S.NAMES[song.key]+" "+song.scale+
    "; use the scale's own chords or one of: "+borrowedText(song);
}

function borrowedText(song){
  var list=MINORISH[song.scale] ? BORROWED_MINOR : BORROWED_MAJOR, out=[], seen={}, i, name, r, f;
  for(i=0;i<list.length;i++){
    r=list[i][0]; f=list[i][1];
    name=S.NAMES[pc(song.key+r)]+(f==="min" ? "m" : f==="dim" ? "dim" : f==="dom" ? "7" : "");
    if(seen[name]) continue;
    seen[name]=true;
    out.push(name);
  }
  return out.join(", ");
}

/* The chord sounding at a tick of one pattern, as its pitch classes (empty before the first chord). */
function chordAtTick(song,list,t){
  var best=null, i, n;
  for(i=0;i<list.length;i++){
    n=list[i];
    if(!n || n.t>t) continue;
    if(!best || n.t>=best.t) best=n;
  }
  if(!best || best.vel===0) return null;
  var notes=S.chordNotes(song,best.deg,best.q,best.acc)||[], out={};
  for(i=0;i<notes.length;i++) out[pc(notes[i])]=true;
  return out;
}

function patternIssues(song,p){
  var pat=song.patterns && song.patterns[p], out=[], chords, mel, i, n, m, set, tones, prev, next, a, b, letter;
  if(!pat || !pat.notes) return out;
  letter=S.patName(song,p);
  chords=(pat.notes.chords||[]).slice().sort(function(x,y){ return x.t-y.t; });
  for(i=0;i<chords.length;i++){
    n=chords[i];
    if(!n || n.vel===0 || (n.q==null && n.acc==null)) continue;
    m=chordIssue(song,n.deg,n.q,n.acc);
    if(m) out.push("pattern "+letter+" step "+Math.round(n.t/S.STEP)+": "+m);
  }
  mel=(pat.notes.melody||[]).filter(function(x){ return x && x.vel!==0; }).sort(function(x,y){ return x.t-y.t; });
  set=keySet(song);
  for(i=0;i<mel.length;i++){
    n=mel[i];
    if(!n.acc) continue;
    m=S.noteMidi(song,"melody",n.deg,n.acc);
    if(m==null || set[pc(m-song.key)]) continue;
    tones=chordAtTick(song,chords,n.t);
    if(tones && tones[pc(m)]) continue;
    /* a passing or neighbour tone: a semitone or a tone from both the note before and the note after */
    prev=i>0 ? S.noteMidi(song,"melody",mel[i-1].deg,mel[i-1].acc) : null;
    next=i+1<mel.length ? S.noteMidi(song,"melody",mel[i+1].deg,mel[i+1].acc) : null;
    a=prev!=null && Math.abs(m-prev)<=2; b=next!=null && Math.abs(m-next)<=2;
    if(a && b) continue;
    out.push("pattern "+letter+" step "+Math.round(n.t/S.STEP)+": the melody note "+S.NAMES[pc(m)]+
      " is off the scale and is neither a tone of the chord under it nor a step between its neighbours");
  }
  return out;
}

function songIssues(song,patterns){
  var list=patterns, used={}, out=[], i, chain=song.song||[];
  if(!list){
    list=[];
    for(i=0;i<chain.length;i++) if(!used["$"+chain[i]]){ used["$"+chain[i]]=true; list.push(chain[i]); }
  }
  for(i=0;i<list.length;i++) out=out.concat(patternIssues(song,list[i]));
  return out;
}

window.LopdaStudioTheory={chordIssue:chordIssue, patternIssues:patternIssues, songIssues:songIssues, borrowedText:borrowedText,
  keySet:keySet};
})();
