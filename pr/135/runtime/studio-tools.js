/*
 * Lo-PDA runtime: the local tools the AI calls (docs/design/studio.md section 12.19.3). A tool turns one small intent
 * (a groove, four chords, a bass rhythm) into the edit language of studio-edit.js; the model never writes a whole song
 * at once. run() only builds operations: apply() still validates the finished list atomically.
 *
 *   LopdaStudioTools.run(song, {tool:"groove", pattern:0, style:"lofi-a"}) -> {ops:[...]} | {error:"one sentence"}
 *   LopdaStudioTools.rootDegree(song, chordRoot) -> a degree of the song's own grid scale
 *   LopdaStudioTools.chordTones(song, chordRoot) -> the root, third, fifth and seventh as grid degrees
 *
 * Errors name the argument and, when the list is short, the values it accepts: the message goes straight back to the
 * model. No DOM, no LP; Node tests run it.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var S=window.LopdaSong, ST=window.LopdaStudioStyles;

/* studio-song.js exports PARENT; the copy keeps this file runnable on its own in a test or a console. */
var PARENT=S.PARENT || {"minor-penta":"minor","major-penta":"major","minor":"minor","major":"major","dorian":"dorian"};
var ALL_TRACKS=["drums","bass","chords","melody"];
var CHANGES=["same","sparse","no-melody","lift"];
var CHORD_RHYTHMS=["hold","stabs","pulse"];
var TOOLS=["ops","groove","chords","bass","ghost","fill","melody","copy","chain","set","mix"];

function plain(x){ return !!x && typeof x==="object" && Object.prototype.toString.call(x)==="[object Object]"; }
function int(n){ return typeof n==="number" && isFinite(n) && Math.floor(n)===n; }
function num(n){ return typeof n==="number" && isFinite(n); }
function err(s){ return {error:s}; }
function ids(obj){ return Object.keys(obj).join(", "); }
function failArg(name,detail){ return err(name+": "+detail); }
function clamp(n,lo,hi){ return Math.max(lo,Math.min(hi,n)); }

function patternArg(call){
  if(!int(call.pattern) || call.pattern<0 || call.pattern>=S.PATTERNS_MAX) return null;
  return call.pattern;
}
function patternError(){ return failArg("pattern","use a pattern number 0-15"); }

function notesOf(song,p,track){
  var pat=song && song.patterns && song.patterns[p];
  var list=pat && pat.notes && pat.notes[track];
  return Array.isArray(list) ? list : [];
}

/* A drum hit is [step, velocity] on the 0-based grid. Deep enough for the tools to add to it without touching the
   style data (which every later call also reads). */
function copyHits(list){
  var out=[], i, h;
  for(i=0;i<list.length;i++){
    h=list[i];
    out.push([h[0],h[1]]);
  }
  return out;
}

function energyHits(groove,energy){
  var src=groove.steps, out={kick:[],snare:[],hat:[],perc:[]}, i, h;
  if(energy===0){
    for(i=0;i<src.kick.length;i++){
      h=src.kick[i];
      if(h[0]%4===0) out.kick.push([h[0],h[1]]);
    }
    out.snare=copyHits(src.snare);
    for(i=0;i<src.hat.length;i++) if(i%2===0) out.hat.push([src.hat[i][0],src.hat[i][1]]);
    /* no perc at energy 0: the bar leaves room for the vocal and the keys */
    return out;
  }
  if(energy===1){
    out.kick=copyHits(src.kick);
    out.snare=copyHits(src.snare);
    out.hat=copyHits(src.hat);
    out.perc=copyHits(src.perc);
    return out;
  }
  out.kick=copyHits(src.kick);
  out.snare=copyHits(src.snare);
  out.perc=copyHits(src.perc);
  for(i=0;i<S.STEPS;i++) out.hat.push([i,i%2===0?0.55:0.3]);
  var hasPerc15=false;
  for(i=0;i<out.perc.length;i++) if(out.perc[i][0]===15) hasPerc15=true;
  if(!hasPerc15) out.perc.push([15,0.3]);
  return out;
}

/* The last four steps become a rising snare roll: the same fill on the groove tool's request and on the fill tool. */
function addFill(hits){
  var out={kick:[],snare:[],hat:[],perc:[]}, keys=["kick","snare","hat","perc"], i, j, list;
  for(i=0;i<keys.length;i++){
    list=hits[keys[i]];
    for(j=0;j<list.length;j++) if(list[j][0]<12) out[keys[i]].push([list[j][0],list[j][1]]);
  }
  out.snare.push([12,0.45],[13,0.55],[14,0.7],[15,0.85]);
  return out;
}

function drumOps(p,hits){
  var ops=[{op:"clearTrack",pattern:p,track:"drums"}], keys=["kick","snare","hat","perc"], i, j, list;
  for(i=0;i<keys.length;i++){
    list=hits[keys[i]];
    for(j=0;j<list.length;j++){
      ops.push({op:"setDrum",pattern:p,drum:keys[i],step:list[j][0],on:true,vel:list[j][1]});
    }
  }
  return ops;
}

function chordList(song,p){
  var list=notesOf(song,p,"chords"), out=[], i, n;
  for(i=0;i<list.length;i++){
    n=list[i];
    if(!n || !int(n.t) || !int(n.deg) || n.vel===0) continue;
    out.push(n);
  }
  out.sort(function(a,b){ return a.t-b.t; });
  return out;
}

/* Which chord sounds at a step: the last one at or before it. Before the first chord the bar is the tonic. */
function chordAt(chords,step){
  var found=-1, i;
  for(i=0;i<chords.length;i++){
    if(Math.floor(chords[i].t/S.STEP)<=step) found=i;
    else break;
  }
  return found;
}

/* ---------- the tools ---------- */
function toolOps(song,call){
  var ops=call.ops;
  if(!Array.isArray(ops)) return failArg("ops","give an array of edit operations");
  if(ops.length>64) return failArg("ops","at most 64 operations");
  return {ops:ops.slice()};
}

/* A groove the model writes itself, for a style no stored groove covers: one bar of [step, velocity] per drum. */
function customGroove(steps){
  var keys=["kick","snare","hat","perc"], out={kick:[],snare:[],hat:[],perc:[]}, n=0, i, j, list, h;
  if(!plain(steps)) return "drums: give {\"kick\":[[step,vel],...],\"snare\":[...],\"hat\":[...],\"perc\":[...]}";
  for(i=0;i<keys.length;i++){
    list=steps[keys[i]];
    if(list==null) continue;
    if(!Array.isArray(list)) return "drums: "+keys[i]+" must be a list of [step, velocity]";
    for(j=0;j<list.length;j++){
      h=list[j];
      if(int(h)) h=[h,0.8];
      if(!Array.isArray(h) || !int(h[0]) || h[0]<0 || h[0]>=S.STEPS) return "drums: "+keys[i]+" steps must be 0-15";
      if(h.length>1 && (!num(h[1]) || h[1]<0 || h[1]>1)) return "drums: "+keys[i]+" velocities must be 0..1";
      out[keys[i]].push([h[0],h.length>1?h[1]:0.8]);
      n++;
    }
  }
  if(!n) return "drums: the bar has no hits";
  if(n>48) return "drums: at most 48 hits in a bar";
  return {steps:out};
}

function toolGroove(song,call){
  var p=patternArg(call);
  if(p===null) return patternError();
  var g=ST.GROOVES[call.style];
  if(call.steps!=null && call.style==null){
    g=customGroove(call.steps);
    if(typeof g==="string") return err(g);
  }
  if(!g) return failArg("groove","unknown style '"+String(call.style==null?"":call.style)+"'; use one of "+ids(ST.GROOVES)+", or give steps");
  var energy=typeof call.energy==="undefined" ? 1 : call.energy;
  if(!int(energy) || energy<0 || energy>2) return failArg("energy","use 0, 1 or 2");
  var hits=energyHits(g,energy);
  if(call.fill===true) hits=addFill(hits);
  return {ops:drumOps(p,hits)};
}

function toolChords(song,call){
  var p=patternArg(call);
  if(p===null) return patternError();
  var roots=call.roots, i, pos, specs=[], spec;
  if(!Array.isArray(roots) || roots.length<1 || roots.length>4)
    return failArg("roots","give 1-4 chord roots, each 0-5 or {root, q, acc}");
  for(i=0;i<roots.length;i++){
    spec=chordRoot(roots[i]);
    if(spec===null) return failArg("roots","each chord root must be 0-5, or {root:0-5, q:'maj', acc:-1}");
    if(spec.error==="q") return failArg("roots","q '"+String(roots[i].q)+"' must be one of "+(S.QUALITY_ORDER||[]).join(", "));
    if(spec.error==="acc") return failArg("roots","acc must be -1 or 1");
    specs.push(spec);
  }
  var rhythm=call.rhythm==null ? "hold" : call.rhythm;
  if(CHORD_RHYTHMS.indexOf(rhythm)<0) return failArg("rhythm","use one of "+CHORD_RHYTHMS.join(", "));
  var ops=[{op:"clearTrack",pattern:p,track:"chords"}];
  /* A chord rings until the next one, so a short strum is the chord followed by a rest: "stabs" is the guitar's
     chick on beats 2 and 4 (the bass's boom fills 1 and 3), "pulse" strikes every beat. One root per bar. */
  if(rhythm!=="hold"){
    if(specs.length!==1) return failArg("rhythm",rhythm+" takes one chord root for the bar");
    pos=rhythm==="stabs" ? [4,12] : [0,4,8,12];
    for(i=0;i<pos.length;i++){
      ops.push(chordOp(p,pos[i],specs[0],i%2 ? 0.6 : 0.68));
      ops.push({op:"setRest",pattern:p,track:"chords",step:pos[i]+2});
    }
    return {ops:ops};
  }
  pos=specs.length===1 ? [0] : specs.length===2 ? [0,8] : specs.length===3 ? [0,8,12] : [0,4,8,12];
  for(i=0;i<specs.length;i++) ops.push(chordOp(p,pos[i],specs[i],0.65));
  return {ops:ops};
}

/* A chord root as the tool writes it: a bare degree 0-5 keeps the old behaviour, or {root, q, acc} adds a quality and
   a semitone shift (12.20.5). The caller turns the error marker into a sentence that lists the qualities. */
function chordRoot(entry){
  var out={root:0};
  if(int(entry)){
    if(entry<0 || entry>5) return null;
    out.root=entry;
    return out;
  }
  if(!plain(entry) || !int(entry.root) || entry.root<0 || entry.root>5) return null;
  out.root=entry.root;
  if(entry.q!=null){
    if(typeof entry.q!=="string" || (S.QUALITY_ORDER||[]).indexOf(entry.q)<0) return {error:"q"};
    out.q=entry.q;
  }
  if(entry.acc!=null){
    if(entry.acc!==-1 && entry.acc!==1) return {error:"acc"};
    out.acc=entry.acc;
  }
  return out;
}

function chordOp(p,step,spec,vel){
  var op={op:"setNote",pattern:p,track:"chords",step:step,deg:spec.root,vel:vel};
  if(spec.q!=null) op.q=spec.q;
  if(spec.acc!=null) op.acc=spec.acc;
  return op;
}

function toolBass(song,call){
  var p=patternArg(call);
  if(p===null) return patternError();
  var rhythm=ST.BASS[call.rhythm];
  if(call.steps!=null && call.rhythm==null){
    rhythm=customBass(call.steps);
    if(typeof rhythm==="string") return err(rhythm);
  }
  if(!rhythm) return failArg("bass","unknown rhythm '"+String(call.rhythm==null?"":call.rhythm)+"'; use one of "+ids(ST.BASS)+", or give steps");
  var chords=chordList(song,p), steps=S.SCALES[song.scale] ? S.SCALES[song.scale].length : 7;
  var ops=[{op:"clearTrack",pattern:p,track:"bass"}], i, entry, step, at, idx, root, deg, nextRoot;
  for(i=0;i<rhythm.length;i++){
    entry=rhythm[i]; step=entry[0]; at=step*S.STEP; idx=chordAt(chords,step);
    /* before the bar's first chord (a strum on beat 2) the bass already plays that chord's root */
    root=idx>=0 ? chords[idx].deg : chords.length ? chords[0].deg : 0;
    /* a chord with a type or a shifted root (12.20.5) is followed by pitch, so a bVII gets its own root and a m7b5 its
       flat fifth; a plain chord keeps the scale-degree path it always had */
    var ch=idx>=0 ? chords[idx] : chords.length ? chords[0] : null;
    if(ch && (ch.q!=null || ch.acc!=null) || entry[2]==="third"){
      var spec=chordPitches(song,ch||{deg:0}), pick=entry[2]==="fifth" ? spec.fifth : entry[2]==="third" ? spec.third : spec.root;
      var g=pcToGrid(song,pick,"bass");
      if(entry[2]==="octave") g.deg+=steps;
      if(entry[2]==="approach"){
        var nx=idx>=0 && idx+1<chords.length ? chords[idx+1] : null;
        if(nx){ g=pcToGrid(song,chordPitches(song,nx).root,"bass"); g.deg-=1; g.acc=0; }
      }
      var bop={op:"setNote",pattern:p,track:"bass",step:step,deg:clamp(g.deg,-3,9),vel:entry[1]};
      if(g.acc) bop.acc=g.acc;
      ops.push(bop);
      continue;
    }
    deg=rootDegree(song,root);
    /* the chord's own fifth, found by pitch like the root: "+4 degrees" is a sixth on a five-note grid */
    if(entry[2]==="fifth") deg=fifthDegree(song,root,deg);
    else if(entry[2]==="octave") deg=deg+steps;
    else if(entry[2]==="approach"){
      if(idx>=0 && idx+1<chords.length) nextRoot=chords[idx+1].deg;
      else nextRoot=idx>=0 ? root : (chords.length ? chords[0].deg : 0);
      if(idx>=0 && idx+1>=chords.length) deg=rootDegree(song,root);
      else deg=rootDegree(song,nextRoot)-1;
    }
    deg=clamp(deg,-3,9);
    ops.push({op:"setNote",pattern:p,track:"bass",step:step,deg:deg,vel:entry[1]});
  }
  return {ops:ops};
}

/* A bass rhythm the model writes itself: one bar of [step, velocity, move], moves as in studio-styles.js plus "third". */
var MOVES=["root","fifth","octave","approach","third"];
function customBass(list){
  var out=[], i, e, seen={};
  if(!Array.isArray(list) || !list.length || list.length>16) return "bass: give 1-16 [step, velocity, move] entries";
  for(i=0;i<list.length;i++){
    e=list[i];
    if(!Array.isArray(e) || !int(e[0]) || e[0]<0 || e[0]>=S.STEPS) return "bass: steps must be 0-15";
    if(seen["$"+e[0]]) return "bass: step "+e[0]+" is used twice";
    seen["$"+e[0]]=true;
    if(e.length>1 && (!num(e[1]) || e[1]<0.1 || e[1]>1)) return "bass: velocities must be 0.1..1";
    if(e.length>2 && MOVES.indexOf(e[2])<0) return "bass: move must be one of "+MOVES.join(", ");
    out.push([e[0], e.length>1 ? e[1] : 0.8, e.length>2 ? e[2] : "root"]);
  }
  out.sort(function(a,b){ return a[0]-b[0]; });
  return out;
}

/* The pitch classes of a stored chord's root, third and fifth, whatever its type: the automatic voicing takes them
   from the parent scale, a typed chord from its intervals. */
function chordPitches(song,ch){
  var notes=S.chordNotes(song,ch.deg,ch.q,ch.acc)||[0,4,7], root=notes[0], third=notes[1], fifth=root+7, i, d;
  for(i=1;i<notes.length;i++){
    d=notes[i]-root;
    if(d===6 || d===7 || d===8){ fifth=notes[i]; break; }
  }
  if(S.QUALITIES && ch.q && S.QUALITIES[ch.q] && S.QUALITIES[ch.q].length<3) third=root+4;
  return {root:pc(root), third:pc(third), fifth:pc(fifth)};
}
function pc(m){ return ((m%12)+12)%12; }

/* A pitch class as the grid writes it: the scale degree with that pitch, or the one just below it with acc +1.
   The degree sits in the track's own octave (bass and melody both count from the tonic). */
function pcToGrid(song,target,track){
  var steps=S.SCALES[song.scale]||S.SCALES.major, key=song.key||0, i, best=0, rel=pc(target-key);
  for(i=0;i<steps.length;i++){
    if(steps[i]===rel) return {deg:i, acc:0};
    if(steps[i]<rel) best=i;
  }
  return {deg:best, acc:rel-steps[best]===1 ? 1 : 0};
}

function toolGhost(song,call){
  var p=patternArg(call);
  if(p===null) return patternError();
  var amount=call.amount;
  if(!int(amount) || amount<1 || amount>4) return failArg("amount","use 1-4 ghost notes");
  var list=notesOf(song,p,"drums"), steps={}, fixed=[3,11,7,14], ops=[], i, s;
  for(i=0;i<list.length;i++) if(list[i] && list[i].key==="snare" && list[i].vel!==0) steps[Math.floor(list[i].t/S.STEP)]=true;
  for(i=0;i<fixed.length && ops.length<amount;i++){
    s=fixed[i];
    if(!steps[s]){
      steps[s]=true;
      ops.push({op:"setDrum",pattern:p,drum:"snare",step:s,on:true,vel:0.2});
    }
  }
  return {ops:ops};
}

function fillOps(song,p){
  var list=notesOf(song,p,"drums"), ops=[], i, step;
  for(i=0;i<list.length;i++){
    if(!list[i] || list[i].vel===0) continue;
    step=Math.floor(list[i].t/S.STEP);
    if(step>=12 && step<=15) ops.push({op:"setDrum",pattern:p,drum:list[i].key,step:step,on:false});
  }
  ops.push({op:"setDrum",pattern:p,drum:"snare",step:12,on:true,vel:0.45});
  ops.push({op:"setDrum",pattern:p,drum:"snare",step:13,on:true,vel:0.55});
  ops.push({op:"setDrum",pattern:p,drum:"snare",step:14,on:true,vel:0.7});
  ops.push({op:"setDrum",pattern:p,drum:"snare",step:15,on:true,vel:0.85});
  return ops;
}

function toolFill(song,call){
  var p=patternArg(call);
  if(p===null) return patternError();
  return {ops:fillOps(song,p)};
}

function toolMelody(song,call){
  var p=patternArg(call);
  if(p===null) return patternError();
  var notes=call.notes, ops=[{op:"clearTrack",pattern:p,track:"melody"}], used={}, i, n, step, deg, vel;
  if(!Array.isArray(notes) || notes.length>16)
    return failArg("notes","give up to 16 [step, deg, vel, acc, orn] notes");
  for(i=0;i<notes.length;i++){
    n=notes[i];
    if(!Array.isArray(n) || n.length<2) return failArg("notes","note "+i+" must be [step, deg, vel]");
    step=n[0]; deg=n[1]; vel=n.length>2 ? n[2] : S.NOTE_VEL;
    if(!int(step) || step<0 || step>=S.STEPS) return failArg("step","note "+i+" must be 0-15");
    if(used["$"+step]) return failArg("step","step "+step+" is used twice");
    if(!int(deg) || deg<-5 || deg>12) return failArg("deg","note "+i+" must be -5..12");
    if(!num(vel) || vel<0 || vel>1) return failArg("vel","note "+i+" must be 0..1");
    used["$"+step]=true;
    var mop={op:"setNote",pattern:p,track:"melody",step:step,deg:deg,vel:vel};
    /* [step, deg, vel, acc, orn]: a semitone off the scale and an ornament, both optional (12.20.5) */
    if(n.length>3 && n[3]!=null && n[3]!==0){
      if(n[3]!==1 && n[3]!==-1) return failArg("acc","note "+i+": acc must be -1, 0 or 1");
      if(vel>0) mop.acc=n[3];
    }
    if(n.length>4 && n[4]!=null && n[4]!==""){
      if(n[4]!=="slide" && n[4]!=="vib") return failArg("orn","note "+i+": orn must be slide or vib");
      if(vel>0) mop.orn=n[4];
    }
    ops.push(mop);
  }
  return {ops:ops};
}

/* The copy change keeps the target's pattern shape honest: the copy is written first, then only the few notes that the
   change removes or lifts are touched, so a dense source cannot overflow the op limit. */
function sparseOps(src,to,ops){
  var drums=src.notes && src.notes.drums, mel=src.notes && src.notes.melody, i, step, hat=0;
  if(Array.isArray(drums)) for(i=0;i<drums.length;i++){
    if(!drums[i] || drums[i].key!=="hat") continue;
    if(hat%2===1){
      step=Math.floor(drums[i].t/S.STEP);
      ops.push({op:"setDrum",pattern:to,drum:"hat",step:step,on:false});
    }
    hat++;
  }
  if(Array.isArray(mel)) for(i=0;i<mel.length;i++){
    if(!mel[i]) continue;
    step=Math.floor(mel[i].t/S.STEP);
    if(step%4!==0) ops.push({op:"removeNote",pattern:to,track:"melody",step:step});
  }
}

function liftOps(src,to,song,ops){
  var i, step, deg, mel=src.notes && src.notes.melody, steps=S.SCALES[song.scale] ? S.SCALES[song.scale].length : 7;
  for(i=0;i<S.STEPS;i++) ops.push({op:"setDrum",pattern:to,drum:"hat",step:i,on:true,vel:i%2===0?0.55:0.3});
  ops.push({op:"setDrum",pattern:to,drum:"perc",step:15,on:true,vel:0.3});
  if(Array.isArray(mel)) for(i=0;i<mel.length;i++){
    if(!mel[i] || mel[i].vel===0 || !int(mel[i].deg)) continue;
    step=Math.floor(mel[i].t/S.STEP);
    deg=mel[i].deg+steps;
    if(deg>32) deg=mel[i].deg;
    ops.push({op:"setNote",pattern:to,track:"melody",step:step,deg:deg,vel:mel[i].vel});
  }
}

function toolCopy(song,call){
  var from=call.from, to=call.to, change=call.change==null ? "same" : call.change;
  if(!int(from) || from<0 || from>=S.PATTERNS_MAX) return failArg("from","use a pattern number 0-15");
  if(!int(to) || to<0 || to>=S.PATTERNS_MAX) return failArg("to","use a pattern number 0-15");
  if(from===to) return failArg("to","the target must be a different pattern");
  if(CHANGES.indexOf(change)<0)
    return failArg("change","unknown change '"+String(change)+"'; use one of "+CHANGES.join(", "));
  var src=song.patterns && song.patterns[from];
  if(!src) return failArg("from","pattern "+from+" does not exist");
  var ops=[{op:"copyPattern",from:from,to:to}];
  if(change==="no-melody") ops.push({op:"clearTrack",pattern:to,track:"melody"});
  else if(change==="sparse") sparseOps(src,to,ops);
  else if(change==="lift") liftOps(src,to,song,ops);
  return {ops:ops};
}

function toolChain(song,call){
  var chain=call.song, i;
  if(!Array.isArray(chain) || chain.length<1 || chain.length>S.SONG_MAX)
    return failArg("song","give 1-96 chain slots");
  for(i=0;i<chain.length;i++) if(!int(chain[i]) || chain[i]<0 || chain[i]>=S.PATTERNS_MAX)
    return failArg("song","each slot must be a pattern number 0-15");
  return {ops:[{op:"setChain",song:chain.slice()}]};
}

function toolSet(song,call){
  var ops=[], any=false;
  if(typeof call.bpm!=="undefined"){
    if(!num(call.bpm) || call.bpm<S.BPM_MIN || call.bpm>S.BPM_MAX) return failArg("bpm","use "+S.BPM_MIN+"-"+S.BPM_MAX);
    ops.push({op:"setBpm",value:call.bpm}); any=true;
  }
  if(typeof call.key!=="undefined"){
    if(!int(call.key) || call.key<0 || call.key>11) return failArg("key","use 0-11 (C=0)");
    ops.push({op:"setKey",value:call.key}); any=true;
  }
  if(typeof call.scale!=="undefined"){
    if(typeof call.scale!=="string" || !S.SCALES[call.scale])
      return failArg("scale","unknown scale '"+String(call.scale)+"'; use one of "+ids(S.SCALES));
    ops.push({op:"setScale",value:call.scale}); any=true;
  }
  if(typeof call.swing!=="undefined"){
    if(!num(call.swing) || call.swing<S.SWING_MIN || call.swing>S.SWING_MAX)
      return failArg("swing","use "+S.SWING_MIN+"-"+S.SWING_MAX);
    ops.push({op:"setSwing",value:call.swing}); any=true;
  }
  if(typeof call.tape!=="undefined"){
    if(!int(call.tape) || call.tape<0 || call.tape>S.TAPE_MAX) return failArg("tape","use 0-"+S.TAPE_MAX);
    ops.push({op:"setTape",value:call.tape}); any=true;
  }
  if(typeof call.kit!=="undefined"){
    if(S.KIT_CHOICES.indexOf(call.kit)<0) return failArg("kit","use one of "+S.KIT_CHOICES.join(", "));
    ops.push({op:"setKit",value:call.kit}); any=true;
  }
  if(typeof call.name!=="undefined"){
    if(typeof call.name!=="string" || Array.from(call.name).length>S.NAME_MAX)
      return failArg("name","use a name of at most "+S.NAME_MAX+" characters");
    ops.push({op:"setName",value:call.name}); any=true;
  }
  if(typeof call.voices!=="undefined"){
    if(!plain(call.voices)) return failArg("voices","give {track: voice}");
    for(var vt in call.voices){
      if(!Object.prototype.hasOwnProperty.call(call.voices,vt)) continue;
      if(!S.VOICE_CHOICES[vt] || S.VOICE_CHOICES[vt].indexOf(call.voices[vt])<0)
        return failArg("voices",vt+": use one of "+(S.VOICE_CHOICES[vt]||[]).join(", ")+" (tracks bass, chords, melody)");
      ops.push({op:"setVoice",track:vt,value:call.voices[vt]}); any=true;
    }
  }
  if(!any) return failArg("set","give at least one of bpm, key, scale, swing, tape, kit, name, voices");
  return {ops:ops};
}

function toolMix(song,call){
  var track=call.track, ops=[], any=false, i, found=false;
  if(ALL_TRACKS.indexOf(track)<0) return failArg("track","use one of "+ALL_TRACKS.join(", "));
  for(i=0;i<song.tracks.length;i++) if(song.tracks[i] && song.tracks[i].id===track) found=true;
  if(!found) return failArg("track","the song has no track '"+String(track)+"'");
  if(typeof call.vol!=="undefined"){
    if(!num(call.vol) || call.vol<0 || call.vol>1) return failArg("vol","use 0..1");
    ops.push({op:"setTrackVolume",track:track,value:call.vol}); any=true;
  }
  if(typeof call.mute!=="undefined"){
    if(typeof call.mute!=="boolean") return failArg("mute","use true or false");
    ops.push({op:"setTrackMute",track:track,mute:call.mute}); any=true;
  }
  if(!any) return failArg("mix","give vol, mute or both");
  return {ops:ops};
}

function run(song,call){
  if(!plain(call) || typeof call.tool!=="string")
    return failArg("tool","give a tool name; use one of "+TOOLS.join(", "));
  if(TOOLS.indexOf(call.tool)<0)
    return failArg("tool","unknown tool '"+call.tool+"'; use one of "+TOOLS.join(", "));
  switch(call.tool){
    case "ops": return toolOps(song,call);
    case "groove": return toolGroove(song,call);
    case "chords": return toolChords(song,call);
    case "bass": return toolBass(song,call);
    case "ghost": return toolGhost(song,call);
    case "fill": return toolFill(song,call);
    case "melody": return toolMelody(song,call);
    case "copy": return toolCopy(song,call);
    case "chain": return toolChain(song,call);
    case "set": return toolSet(song,call);
    case "mix": return toolMix(song,call);
  }
  return failArg("tool","unknown tool");
}

/* ---------- pitch ---------- */
/* A chord root is a degree of the seven-note parent scale (PARENT). The grid may be a five-note scale, so the same
   pitch class may not exist; then the nearest scale note below it is the honest answer. */
function rootDegree(song,root){
  var steps=song && S.SCALES[song.scale], parent=song && PARENT[song.scale], psteps=parent && S.SCALES[parent];
  if(!steps || !psteps || !int(root)) return 0;
  var target=psteps[((root%7)+7)%7], best=0, i;
  for(i=0;i<steps.length;i++){
    if(steps[i]===target) return i;
    if(steps[i]<target) best=i;
  }
  return best;
}

function fifthDegree(song,root,rootDeg){
  var d=rootDegree(song,root+4), n=S.SCALES[song.scale].length;
  while(d<=rootDeg) d+=n;
  return d;
}

/* The chord's root, third, fifth and seventh as degrees of the melody grid (0..9). A five-note grid has no note for
   some of them, so the same lower-neighbour rule applies; an octave shift keeps the tone near the chord root. */
function chordTones(song,root){
  var steps=song && S.SCALES[song.scale], parent=song && PARENT[song.scale], psteps=parent && S.SCALES[parent];
  if(!steps || !psteps || !int(root)) return [];
  var n=steps.length, r=rootDegree(song,root), out=[], i, j, pd, target, d, up;
  for(i=0;i<4;i++){
    pd=((root%7)+7)%7+i*2;
    target=psteps[pd%7];
    d=null;
    for(j=0;j<n;j++) if(steps[j]===target){ d=j; break; }
    if(d===null){
      d=0;
      for(j=0;j<n;j++) if(steps[j]<=target) d=j;
    }
    up=d+n;
    if(d<r && up<=9) d=up;
    if(d>9) d=d%n;
    out.push(d);
  }
  return out;
}

/* The tones of any chord (with its type and shifted root) on the melody grid, as text the model reads: "4" is degree
   4, "6#" is degree 6 raised a semitone. Near the chord's root, inside 0..9. */
function chordToneText(song,spec){
  var notes=S.chordNotes(song,spec.root,spec.q,spec.acc)||[], out=[], seen={}, i, g, n=(S.SCALES[song.scale]||[]).length||7, t;
  for(i=0;i<notes.length;i++){
    g=pcToGrid(song,notes[i],"melody");
    if(g.deg<2 && i>0) g.deg+=n;
    t=g.deg+(g.acc ? "#" : "");
    if(seen[t]) continue;
    seen[t]=true;
    out.push(t);
  }
  return out;
}

window.LopdaStudioTools={CHORD_RHYTHMS:CHORD_RHYTHMS, MOVES:MOVES, run:run, rootDegree:rootDegree, chordTones:chordTones,
  chordToneText:chordToneText, pcToGrid:pcToGrid, TOOLS:TOOLS};
})();
