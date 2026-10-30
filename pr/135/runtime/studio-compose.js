/*
 * Lo-PDA runtime: the tape machine's local melody writer (docs/design/studio.md section 12.20.10). A small model that
 * writes a melody note by note climbs the scale in even eighths and repeats it bar for bar (owner, 2026-10-30: "很难听").
 * So the model only decides what a songwriter decides first, the motif: the rhythm of a bar, the shape of the line and
 * where it sits; this file turns that into phrases over the chords, with the habits that make a line singable. Strong
 * beats land on chord tones, the line moves by step between them, the second bar answers the first, the third bar
 * turns the shape over, and the phrase ends on a long note: open (the third or fifth) the first time, home (the tonic)
 * at the end. A section heard again gets the other ending, and a last chorus is lifted.
 *
 *   LopdaStudioCompose.phrase(song, motif, bars, o) -> [[[step, deg, vel, acc?], ...], ...] one list per bar
 *     motif: {rhythm:[steps], answer:[steps]?, contour:[moves], register:"low"|"mid"|"high", ending:"home"|"open"}
 *     bars:  [{root, q?, acc?}, ...] the chord of each bar;  o: {variant:0|1, lift:boolean, start:degree}
 *   LopdaStudioCompose.checkMotif(motif) -> "" | why it cannot make a good line (one sentence for the model)
 *
 * Pure and deterministic (no Math.random): the same motif and chords give the same melody. No DOM, no LP.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var S=window.LopdaSong, T=window.LopdaStudioTools;

var REGISTER={low:[-2,5], mid:[1,8], high:[4,11]};

function int(n){ return typeof n==="number" && isFinite(n) && Math.floor(n)===n; }
function pc(n){ return ((n%12)+12)%12; }
function scaleLen(song){ return (S.SCALES[song.scale]||S.SCALES.major).length; }

/* A motif a line can be built from: enough notes to be a tune, not so many that it is a scale exercise, and with
   long and short notes (an all-eighths bar is what the model wrote before, and what made it sound mechanical). */
function checkRhythm(r,name){
  var i, gaps={}, kinds=0;
  if(!Array.isArray(r) || r.length<2 || r.length>7) return name+" must list 2-7 onset steps in one bar (0-15)";
  for(i=0;i<r.length;i++){
    if(!int(r[i]) || r[i]<0 || r[i]>15) return name+" steps must be integers 0-15";
    if(i && r[i]<=r[i-1]) return name+" steps must rise";
  }
  /* the gaps between onsets, not counting the last note's ring to the bar end: even steps all the way is a scale run */
  for(i=0;i+1<r.length;i++){
    var g=r[i+1]-r[i];
    if(!gaps[g]){ gaps[g]=true; kinds++; }
  }
  if(r.length>=3 && kinds<2) return name+" has notes of one length only; mix long and short notes (e.g. [0,3,4,8] or [0,6,8,12])";
  return "";
}

function checkMotif(m){
  var why, i;
  if(!m || typeof m!=="object") return "a motif is {rhythm, contour, register, ending}";
  why=checkRhythm(m.rhythm,"rhythm");
  if(why) return why;
  if(m.answer!=null){ why=checkRhythm(m.answer,"answer"); if(why) return why; }
  if(!Array.isArray(m.contour) || m.contour.length<2 || m.contour.length>8) return "contour must list 2-8 moves in scale steps (-3..3)";
  for(i=0;i<m.contour.length;i++) if(!int(m.contour[i]) || m.contour[i]<-3 || m.contour[i]>3) return "contour moves must be integers -3..3";
  var flat=true;
  for(i=0;i<m.contour.length;i++) if(m.contour[i]!==0) flat=false;
  if(flat) return "contour must move: use some steps up and down";
  if(m.register!=null && !REGISTER[m.register]) return "register must be low, mid or high";
  if(m.ending!=null && m.ending!=="home" && m.ending!=="open") return "ending must be home or open";
  return "";
}

/* The chord's tones on the melody grid, as {deg, acc}, in every octave of the register: the targets of strong beats. */
function chordTargets(song,spec,lo,hi){
  var notes=S.chordNotes(song,spec.root,spec.q,spec.acc)||[], out=[], n=scaleLen(song), i, g, k;
  for(i=0;i<notes.length;i++){
    g=T.pcToGrid(song,notes[i],"melody");
    for(k=-1;k<=2;k++){
      var d=g.deg+k*n;
      if(d>=lo && d<=hi) out.push({deg:d, acc:g.acc, root:i===0, third:i===1});
    }
  }
  return out;
}

function nearest(list,from,prefer){
  var best=null, i, c, d, bd=99;
  for(i=0;i<list.length;i++){
    c=list[i];
    if(prefer && !prefer(c)) continue;
    d=Math.abs(c.deg-from);
    if(d<bd || (d===bd && c.deg<from)){ bd=d; best=c; }
  }
  return best || (prefer ? nearest(list,from,null) : null);
}

function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }

/* one bar: the rhythm's onsets, a strong-beat anchor on a chord tone, then the contour by scale steps */
function bar(song,spec,rhythm,contour,cur,range,o){
  var out=[], targets=chordTargets(song,spec,range[0],range[1]), i, step, deg, acc, strong, a, k=o.k;
  for(i=0;i<rhythm.length;i++){
    step=rhythm[i];
    strong=step===0 || step===8 || i===0;
    if(strong){
      a=nearest(targets,i===0 ? cur : cur+contour[k%contour.length]);
      deg=a ? a.deg : cur; acc=a ? a.acc : 0;
      if(i>0) k++;
    } else {
      deg=clamp(cur+contour[k%contour.length],range[0],range[1]); acc=0;
      k++;
    }
    /* a run of the same pitch is a drum part, not a tune: move a step instead of a third repeat */
    if(out.length>=2 && out[out.length-1][1]===deg && out[out.length-2][1]===deg) deg=clamp(deg+(deg<range[1]?1:-1),range[0],range[1]);
    var vel=step===0 ? 0.9 : strong ? 0.8 : 0.65;
    out.push(acc ? [step,deg,vel,acc] : [step,deg,vel]);
    cur=deg;
  }
  o.k=k;
  return {notes:out, cur:cur};
}

/* The phrase's last note: a long one on step 8 (or 0 when the rhythm is already past it), home on the tonic or
   open on the chord's third or fifth. */
function cadence(song,spec,notes,cur,range,home){
  var targets=chordTargets(song,spec,range[0],range[1]), n=scaleLen(song), keep=[], i, a, step;
  for(i=0;i<notes.length;i++) if(notes[i][0]<8) keep.push(notes[i]);
  step=keep.length ? 8 : 0;
  if(home){
    var tonics=[];
    for(i=-1;i<=2;i++) if(i*n>=range[0]-1 && i*n<=range[1]+1) tonics.push({deg:i*n, acc:0});
    a=nearest(tonics,cur);
  } else a=nearest(targets,cur,function(c){ return !c.root; });
  var last=a ? a : {deg:cur, acc:0};
  keep.push(last.acc ? [step,last.deg,0.85,last.acc] : [step,last.deg,0.85]);
  return keep;
}

function phrase(song,motif,bars,o){
  o=o||{};
  var range=(REGISTER[motif.register]||REGISTER.mid).slice(), out=[], i, r, contour, b, cur, home;
  if(o.lift){ range[0]+=2; range[1]+=2; }
  cur=int(o.start) ? o.start : Math.round((range[0]+range[1])/2);
  var st={k:0};
  /* the ending flips on the second hearing, so a repeated section answers itself instead of copying itself */
  home=(motif.ending||"home")==="home";
  if(o.variant) home=!home;
  for(i=0;i<bars.length;i++){
    /* bar 1 states, bar 2 answers, bar 3 turns the shape over, bar 4 closes */
    r=i%2===1 && motif.answer ? motif.answer : motif.rhythm;
    contour=motif.contour;
    if(i===2) contour=motif.contour.map(function(m){ return -m; });
    b=bar(song,bars[i],r,contour,cur,range,st);
    cur=b.cur;
    if(i===bars.length-1) b.notes=cadence(song,bars[i],b.notes,cur,range,home);
    else if(i%2===1 && bars.length>2){
      /* a breath at the end of the half phrase: its last note is half as long */
      var l=b.notes[b.notes.length-1];
      if(l && l[0]<14) b.notes.push([Math.min(15,l[0]+2),l[1],0]);
    }
    out.push(b.notes);
  }
  return out;
}

window.LopdaStudioCompose={phrase:phrase, checkMotif:checkMotif, REGISTER:REGISTER};
})();
