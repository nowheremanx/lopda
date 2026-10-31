/*
 * Lo-PDA runtime: the tape machine's AI harness helpers (docs/design/studio.md section 12.19.1). The model answers one
 * small JSON object per step; extract() finds it, overview() gives the model the whole song without sending every note,
 * and patternView() is the answer to a `read` call. The words it answers live in studio-prompts.js; the pipeline that
 * asks, checks and retries lives in studio-harness.js.
 *
 *   LopdaStudioAI.extract(text)            -> object | {error:"reason in English"}
 *   LopdaStudioAI.overview(song)           -> a compact multi-line text for the model
 *   LopdaStudioAI.patternView(song, p)     -> every note of one pattern, compact
 *
 * No DOM, no LP; Node tests and the prompt trials run it. Only the project state is sent: never a recording, never the key.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var S=window.LopdaSong;

function plain(x){ return !!x && typeof x==="object" && Object.prototype.toString.call(x)==="[object Object]"; }
function int(n){ return typeof n==="number" && isFinite(n) && Math.floor(n)===n; }
function letter(i){ return "ABCDEFGHIJKLMNOP".charAt(i); }
function stepOf(note){ return Math.round(note.t/S.STEP); }
function velOf(v){ return String(Math.round(v*100)/100); }

/* A short answer can still be unreadable, and a long one can carry a sentence first: walk every brace and keep the first
   balanced span that parses as an object. A code fence and prose need no special case. */
function balanced(s,start){
  var depth=0, inStr=false, esc=false, i, ch;
  for(i=start;i<s.length;i++){
    ch=s.charAt(i);
    if(inStr){
      if(esc) esc=false;
      else if(ch==="\\") esc=true;
      else if(ch==="\"") inStr=false;
      continue;
    }
    if(ch==="\""){ inStr=true; continue; }
    if(ch==="{") depth++;
    else if(ch==="}"){
      depth--;
      if(depth===0) return s.slice(start,i+1);
    }
  }
  return null;
}

/* One trailing comma is the commonest slip from a fast model; repair it once, never rewrite more than that. */
function tryParse(raw){
  var fixed, obj;
  try{
    obj=JSON.parse(raw);
    if(plain(obj)) return obj;
  }catch(e){}
  fixed=raw.replace(/,\s*([}\]])/,"$1");
  if(fixed!==raw){
    try{
      obj=JSON.parse(fixed);
      if(plain(obj)) return obj;
    }catch(e2){}
  }
  return null;
}

function extract(text){
  var s=String(text==null?"":text), i=0, raw, obj;
  if(!s.trim()) return {error:"empty answer"};
  /* Only outermost objects are candidates: a malformed answer must not hand back one of its nested objects. */
  while(i<s.length){
    if(s.charAt(i)!=="{"){ i++; continue; }
    raw=balanced(s,i);
    if(!raw){ i++; continue; }
    obj=tryParse(raw);
    if(obj) return obj;
    i+=raw.length;
  }
  return {error:"no JSON object in the answer"};
}

/* Runs of the chain, then repeated blocks of runs: "A A B B C D C D" reads "A x2, B x2, (C D) x2". */
function chainText(chain){
  var runs=[], tokens=[], i, j, k, reps, same, block, again=true;
  for(i=0;i<chain.length;){
    j=i+1;
    while(j<chain.length && chain[j]===chain[i]) j++;
    runs.push({p:chain[i], n:j-i});
    i=j;
  }
  for(i=0;i<runs.length;i++) tokens.push(letter(runs[i].p)+(runs[i].n>1?" x"+runs[i].n:""));
  while(again){
    again=false;
    for(i=0;i<tokens.length && !again;i++){
      for(k=2;k<=6 && i+k<=tokens.length && !again;k++){
        reps=1;
        while(i+(reps+1)*k<=tokens.length){
          same=true;
          for(j=0;j<k;j++) if(tokens[i+reps*k+j]!==tokens[i+j]){ same=false; break; }
          if(!same) break;
          reps++;
        }
        if(reps>1){
          block="("+tokens.slice(i,i+k).join(" ")+") x"+reps;
          tokens.splice(i,k*reps,block);
          again=true;
        }
      }
    }
  }
  return tokens.join(", ");
}

function sorted(list){
  var out=[];
  if(!Array.isArray(list)) return out;
  out=list.slice(0);
  out.sort(function(a,b){ return a.t-b.t; });
  return out;
}

function sounding(list){
  var all=sorted(list), out=[], i, n;
  for(i=0;i<all.length;i++){
    n=all[i];
    if(n && n.vel!==0) out.push(n);
  }
  return out;
}

function degreeRange(list){
  var min=null, max=null, i, n, v;
  for(i=0;i<list.length;i++){
    n=list[i];
    if(!n || !int(n.deg)) continue;
    v=n.deg;
    if(min===null || v<min) min=v;
    if(max===null || v>max) max=v;
  }
  if(min===null) return "";
  return min===max ? String(min) : min+".."+max;
}

function patternLine(song,p){
  var pat=song.patterns && song.patterns[p];
  var notes=(pat && pat.notes) || {}, d=notes.drums||[], b=sounding(notes.bass), c=sounding(notes.chords), m=sounding(notes.melody);
  var hits=0, ghosts=0, i, n, names=[], steps=[], seen={}, st;
  for(i=0;i<d.length;i++){
    n=d[i];
    if(!n || n.vel===0) continue;
    hits++;
    if(n.vel<=0.25) ghosts++;
  }
  for(i=0;i<c.length;i++){
    n=c[i];
    var cn=S.chordName(song,n.deg,n.q,n.acc);
    names.push(cn ? cn.name : "deg"+n.deg);
    st=stepOf(n);
    if(!seen["$"+st]){ seen["$"+st]=true; steps.push(st); }
  }
  var drums="drums "+hits+" hit"+(hits===1?"":"s")+(ghosts?" ("+ghosts+" ghost)":"");
  var bass="bass "+b.length+" note"+(b.length===1?"":"s");
  var chords=names.length ? "chords "+names.join(" ")+" (steps "+steps.join(", ")+")" : "chords -";
  var range=degreeRange(m);
  var melody=m.length ? "melody "+m.length+" note"+(m.length===1?"":"s")+(range?" degrees "+range:"") : "melody -";
  return letter(p)+": "+drums+", "+bass+", "+chords+", "+melody;
}

function overview(song){
  if(!song) return "";
  var lines=[], used={}, i, tr, tracks=song.tracks||[], chain=song.song||[], pats=song.patterns||[], mix=[];
  for(i=0;i<chain.length;i++) used["$"+chain[i]]=true;
  lines.push(String(song.name||"").trim() || "(untitled)");
  lines.push(song.bpm+" BPM | "+S.NAMES[song.key]+" "+song.scale+" | swing "+song.swing+" | tape "+song.tape+" | kit "+song.kit);
  for(i=0;i<tracks.length;i++){
    tr=tracks[i];
    if(!tr || typeof tr.id!=="string") continue;
    if(tr.mute) mix.push(tr.id+" muted");
    else if(typeof tr.vol==="number" && tr.vol!==1) mix.push(tr.id+" vol "+tr.vol);
  }
  if(mix.length) lines.push("Mix: "+mix.join(", "));
  /* the sounds (12.20): every track's voice, so the model can name what it hears */
  if(S.voiceOf) lines.push("Voices: bass "+S.voiceOf(song,"bass")+", chords "+S.voiceOf(song,"chords")+", melody "+S.voiceOf(song,"melody"));
  lines.push("Chain ("+chain.length+"): "+chainText(chain));
  for(i=0;i<S.PATTERNS_MAX;i++){
    if(!used["$"+i] && !S.hasNotes(song,i,"drums") && !S.hasNotes(song,i,"bass") &&
       !S.hasNotes(song,i,"chords") && !S.hasNotes(song,i,"melody")) continue;
    lines.push(patternLine(song,i));
  }
  return lines.join("\n");
}

function noteText(list){
  var out=[], i, n;
  for(i=0;i<list.length;i++){
    n=list[i];
    out.push(n.vel===0 ? stepOf(n)+":rest" : stepOf(n)+":deg"+n.deg+(n.acc===1?"#":n.acc===-1?"b":"")+"@"+velOf(n.vel)+
      (n.orn ? " "+n.orn : "")+(n.gate && n.gate<1 ? " gate"+n.gate : ""));
  }
  return out.length ? out.join(" ") : "-";
}

function chordText(song,list){
  var out=[], i, n, cn;
  for(i=0;i<list.length;i++){
    n=list[i];
    if(n.vel===0){ out.push(stepOf(n)+":rest"); continue; }
    cn=S.chordName(song,n.deg,n.q,n.acc);
    out.push(stepOf(n)+":"+(cn ? cn.roman+"("+cn.name+")" : "deg"+n.deg));
  }
  return out.length ? out.join(" ") : "-";
}

function patternView(song,p){
  var pat=song.patterns && song.patterns[p];
  var notes=(pat && pat.notes) || {}, keys=["kick","snare","hat","perc"], groups={}, d=notes.drums||[];
  var i, n, parts=[], groupText=[];
  for(i=0;i<keys.length;i++) groups[keys[i]]=[];
  for(i=0;i<d.length;i++){
    n=d[i];
    if(!n || n.vel===0 || !groups[n.key]) continue;
    groups[n.key].push(stepOf(n)+"@"+velOf(n.vel));
  }
  for(i=0;i<keys.length;i++) if(groups[keys[i]].length) groupText.push(keys[i]+" "+groups[keys[i]].join(" "));
  parts.push("drums: "+(groupText.length?groupText.join(" | "):"-"));
  parts.push("bass: "+noteText(sorted(notes.bass)));
  parts.push("chords: "+chordText(song,sorted(notes.chords)));
  parts.push("melody: "+noteText(sorted(notes.melody)));
  return letter(p)+" "+parts.join("; ");
}

window.LopdaStudioAI={extract:extract, overview:overview, patternView:patternView};
})();
