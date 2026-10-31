/*
 * Lo-PDA runtime: the AI's melody, its development tools and a critic (docs/design/studio.md section 12.20.13).
 * The model writes the melody; this file never invents a note (owner, 2026-10-31: "if the melody is all local, of
 * course it sounds the same every time"). It gives the model the moves a songwriter develops material with, so a
 * small model does not have to spell every bar, and it reads the result the way a teacher would, naming what to fix:
 * a scale run, a bar that only arpeggiates the chord, a bar of even notes, a phrase with no breath, a line that never
 * moves, a section that copies another. Wrong notes (off the key) are hard errors; taste is advice, asked at most twice.
 *
 *   LopdaStudioCritic.expand(bars)                     -> {bars:[[[step,deg,vel,acc?,orn?],...],...]} | {error}
 *     a bar is a list of notes, or {"repeat":k, "end":[notes]?}, {"sequence":k, "by":n}, {"invert":k}, {"rest":true}
 *     (k counts bars of this section from 1)
 *   LopdaStudioCritic.review(song, bars, specs, others) -> [advice, ...]   specs: the chord of each bar; others: the
 *     notes of the sections already written
 *   LopdaStudioCritic.fitToChord(song, notes, spec, lo, hi) -> the notes, the bar's weighty ones moved to the chord
 *   LopdaStudioCritic.endOtherWay(song, notes, spec)   -> the bar with its last note ending the other way
 *
 * Pure, no DOM, no LP; Node tests run it.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var S=window.LopdaSong, T=window.LopdaStudioTools;

function int(n){ return typeof n==="number" && isFinite(n) && Math.floor(n)===n; }
function num(n){ return typeof n==="number" && isFinite(n); }
function plain(x){ return !!x && typeof x==="object" && !Array.isArray(x); }
function pc(n){ return ((n%12)+12)%12; }
function copyBar(b){ return b.map(function(n){ return n.slice(); }); }

/* one written bar: rising steps 0-15, degrees -3..12, velocity 0 (a rest) or 0.3-1, then optional acc and ornament */
function checkNotes(bar,where){
  var prev=-1, i, n, vel;
  if(!Array.isArray(bar) || bar.length>12) return where+" must be a list of at most 12 notes";
  for(i=0;i<bar.length;i++){
    n=bar[i];
    if(!Array.isArray(n) || n.length<2) return where+" note "+(i+1)+" must be [step, degree, velocity]";
    if(!int(n[0]) || n[0]<0 || n[0]>15 || n[0]<=prev) return where+": steps must be 0-15, rising, none twice";
    if(!int(n[1]) || n[1]<-3 || n[1]>12) return where+": degrees must be integers -3..12";
    vel=n.length>2 && n[2]!=null ? n[2] : 0.8;
    if(!num(vel) || (vel!==0 && (vel<0.3 || vel>1))) return where+": velocity 0.3-1, or 0 for a rest";
    if(n.length>3 && n[3]!=null && n[3]!==0 && n[3]!==1 && n[3]!==-1) return where+": the 4th value (acc) is -1, 0 or 1";
    if(n.length>4 && n[4]!=null && n[4]!=="" && n[4]!=="slide" && n[4]!=="vib") return where+": the 5th value is slide or vib";
    prev=n[0];
  }
  return "";
}

function norm(n){
  var out=[n[0],n[1],n.length>2 && n[2]!=null ? Math.round(n[2]*100)/100 : 0.8];
  if(n.length>3 && n[3]) out.push(n[3]);
  if(n.length>4 && n[4]){ if(out.length<4) out.push(0); out.push(n[4]); }
  return out;
}

function expand(bars){
  var out=[], i, b, k, src, why, j, first, cut;
  if(!Array.isArray(bars) || !bars.length) return {error:"bars must be a list, one entry per bar"};
  for(i=0;i<bars.length;i++){
    b=bars[i];
    if(Array.isArray(b)){
      why=checkNotes(b,"bar "+(i+1));
      if(why) return {error:why};
      out.push(b.map(norm));
      continue;
    }
    if(!plain(b)) return {error:"bar "+(i+1)+" must be notes or a move such as {\"repeat\":1}"};
    if(b.rest===true){ out.push([]); continue; }
    k=b.repeat!=null ? b.repeat : b.sequence!=null ? b.sequence : b.invert;
    if(!int(k) || k<1 || k>i) return {error:"bar "+(i+1)+": a move names an earlier bar of this section, 1-"+i};
    src=copyBar(out[k-1]);
    if(b.repeat!=null){
      if(b.end!=null){
        why=checkNotes(b.end,"bar "+(i+1)+" end");
        if(why) return {error:why};
        if(!b.end.length) return {error:"bar "+(i+1)+": end needs at least one note"};
        first=b.end[0][0];
        cut=src.filter(function(n){ return n[0]<first; });
        src=cut.concat(b.end.map(norm));
      }
    } else if(b.sequence!=null){
      if(!int(b.by) || b.by<-4 || b.by>4 || !b.by) return {error:"bar "+(i+1)+": sequence needs by: -4..4 scale steps, not 0"};
      for(j=0;j<src.length;j++) if(src[j][2]>0) src[j][1]=Math.max(-3,Math.min(12,src[j][1]+b.by));
    } else {
      var axis=src.length ? src[0][1] : 0;
      for(j=0;j<src.length;j++) if(src[j][2]>0) src[j][1]=Math.max(-3,Math.min(12,2*axis-src[j][1]));
    }
    out.push(src);
  }
  return {bars:out};
}

/* ---------- the critic ---------- */
function midiOf(song,n){ return S.noteMidi(song,"melody",n[1],n.length>3 ? n[3] : 0); }
function chordSet(song,spec){
  var notes=S.chordNotes(song,spec.root,spec.q,spec.acc)||[], set={}, i;
  for(i=0;i<notes.length;i++) set[pc(notes[i])]=true;
  return set;
}
function sounding(bar){ return bar.filter(function(n){ return n[2]>0; }); }

function review(song,bars,specs,others){
  var advice=[], all=[], i, j, b, s, n, run, dir, longest=0, rests=0, lo=99, hi=-99, rhythms={}, distinct=0;
  for(i=0;i<bars.length;i++){
    b=bars[i]; s=sounding(b);
    for(j=0;j<b.length;j++){
      var len=(j+1<b.length ? b[j+1][0] : 16)-b[j][0];
      if(b[j][2]===0) rests++;
      else if(len>longest) longest=len;
    }
    var key=b.map(function(x){ return x[0]; }).join(",");
    if(!rhythms[key]){ rhythms[key]=true; distinct++; }
    /* a bar of only chord tones with leaps between them is a broken chord, not a tune */
    if(s.length>=4){
      var set=chordSet(song,specs[i]||specs[0]), allChord=true, leaps=0;
      for(j=0;j<s.length;j++){
        if(!set[pc(midiOf(song,s[j]))]) allChord=false;
        if(j && Math.abs(s[j][1]-s[j-1][1])>=2) leaps++;
      }
      if(allChord && leaps>=s.length-2) advice.push("bar "+(i+1)+" only arpeggiates the chord; let the line step through a passing note or two");
    }
    /* five or more notes the same distance apart is a metronome */
    if(s.length>=5){
      var gap=-1, even=true;
      for(j=1;j<b.length;j++){ var g=b[j][0]-b[j-1][0]; if(gap<0) gap=g; else if(g!==gap) even=false; }
      if(even) advice.push("bar "+(i+1)+" is all even notes; mix long and short (a dotted note, a held note, a syncopation)");
    }
    for(j=0;j<s.length;j++){ all.push(s[j]); if(s[j][1]<lo) lo=s[j][1]; if(s[j][1]>hi) hi=s[j][1]; }
  }
  /* six or more notes in one direction by step is a scale exercise */
  run=1; dir=0;
  for(i=1;i<all.length;i++){
    var d=all[i][1]-all[i-1][1];
    if(Math.abs(d)===1 && (dir===0 || d===dir)){ run++; dir=d; }
    else { run=Math.abs(d)===1 ? 2 : 1; dir=Math.abs(d)===1 ? d : 0; }
    if(run>=6){ advice.push("the line climbs or falls by step for six notes or more; turn it around sooner or leap once"); break; }
  }
  if(bars.length>=2 && !rests && longest<6)
    advice.push("the phrase never breathes; hold one note for at least a beat and a half, or leave a rest, near the middle or the end");
  if(all.length>=6 && hi-lo<4) advice.push("the line stays within "+(hi-lo+1)+" notes; give it a high point (a leap up, then step back down)");
  if(bars.length>=3 && distinct===1) advice.push("every bar has the same rhythm; let at least one bar answer with another rhythm");
  /* a chorus that copies the verse note for note is no chorus */
  for(i=0;i<(others||[]).length;i++){
    if(JSON.stringify(others[i].bars)===JSON.stringify(bars))
      advice.push("this section repeats the "+others[i].id+" exactly; make it its own (another register or rhythm)");
  }
  return advice;
}

/* ---------- changing the AI's melody where the song needs it ---------- */
/* The weighty notes (the bar's first, beat 3, a long last one) moved to the nearest tone of another chord: the bass's
   imitation of a melody bar over the chord a bar later stays in the harmony. */
function fitToChord(song,notes,spec,lo,hi){
  var set=chordSet(song,spec), out=[], i, n, len, cand, best, bd, d, g;
  for(i=0;i<notes.length;i++){
    n=notes[i].slice();
    len=(i+1<notes.length ? notes[i+1][0] : 16)-n[0];
    if(n[2]>0 && (i===0 || n[0]===8 || len>=6) && !set[pc(midiOf(song,n))]){
      best=null; bd=99;
      for(d=-3;d<=3;d++){
        for(g=0;g<=1;g++){
          cand=[n[0],n[1]+d,n[2],g];
          if(cand[1]<lo || cand[1]>hi) continue;
          if(set[pc(midiOf(song,cand))] && Math.abs(d)<bd){ bd=Math.abs(d); best=cand; }
        }
      }
      if(best){ n=[best[0],best[1],best[2]]; if(best[3]) n.push(best[3]); }
    }
    n[1]=Math.max(lo,Math.min(hi,n[1]));
    out.push(n);
  }
  return out;
}

/* The second ending: the last note goes home if it was open, and to the chord's third if it was home. */
function endOtherWay(song,notes,spec){
  var out=copyBar(notes), i, last=-1, n, len=S.SCALES[song.scale].length, tonic;
  for(i=out.length-1;i>=0;i--) if(out[i][2]>0){ last=i; break; }
  if(last<0) return out;
  n=out[last];
  tonic=pc(midiOf(song,n))===pc(song.key);
  if(!tonic){
    var t=Math.round(n[1]/len)*len;
    out[last]=[n[0],t,n[2]];
  } else {
    var notes=S.chordNotes(song,spec.root,spec.q,spec.acc)||[], g=notes.length>1 ? T.pcToGrid(song,notes[1],"melody") : {deg:n[1]+2,acc:0};
    var d=g.deg; while(d<n[1]-3) d+=len; while(d>n[1]+3) d-=len;
    out[last]=g.acc ? [n[0],d,n[2],g.acc] : [n[0],d,n[2]];
  }
  return out;
}

window.LopdaStudioCritic={expand:expand, review:review, fitToChord:fitToChord, endOtherWay:endOtherWay};
})();
