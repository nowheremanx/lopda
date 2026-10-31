/*
 * Lo-PDA runtime: the executor behind the tape machine's AI co-editor (docs/design/studio.md section 12.19.6). Each step
 * asks for one small JSON object, checks it, and sends a rejected answer back with the reason; a new song is planned,
 * laid from local tools and given melodies step by step, and an edit is a short loop of tool calls whose results go back
 * to the model. The model never writes a whole song at once, so a fast, small model can still produce something playable.
 *
 *   LopdaStudioHarness.skeleton({text, ask, rand, now, onStage}) -> job
 *   LopdaStudioHarness.edit({song, focus, text, ask, onStage})   -> job
 *   job: a Promise of {reply, ops, draft, song}; job.stop() stops the current ask and rejects with code "stopped"
 *   ask(messages) -> a Promise of the answer text, with .stop()
 *   onStage({id, n, of, vars}) -> progress; ids: card, plan, lay, melody, listen, read, edit, check
 *
 * ask errors (network, a busy line) pass through unchanged. A step that is still unreadable after MAX_RETRY rewrites
 * rejects with code "unreadable" and the stage id. A tool or apply failure is our bug, not the model's, so it rejects
 * with code "tools".
 *
 * No DOM, no LP; Node tests run a scripted ask through the whole pipeline.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var C=window.LopdaStudioCompose, TH=window.LopdaStudioTheory, AI=window.LopdaStudioAI, P=window.LopdaStudioPrompts, ST=window.LopdaStudioStyles,
    T=window.LopdaStudioTools, E=window.LopdaStudioEdit, S=window.LopdaSong;

var MAX_RETRY=2, MAX_TURNS=5, CHORD_STYLES=["triad","seventh","rich"];
var SECTIONS=["intro","verse","pre","chorus","bridge","outro"];

function plain(x){ return !!x && typeof x==="object" && Object.prototype.toString.call(x)==="[object Object]"; }
function int(n){ return typeof n==="number" && isFinite(n) && Math.floor(n)===n; }
function num(n){ return typeof n==="number" && isFinite(n); }
function letter(i){ return "ABCDEFGHIJKLMNOP".charAt(i); }
function cut(s,n){
  var a=Array.from(String(s==null?"":s));
  return a.length>n ? a.slice(0,n).join("") : a.join("");
}
function harnessError(code,stage,message){
  var e=new Error(message||code);
  e.code=code;
  if(stage!=null) e.stage=stage;
  return e;
}
function toolsError(message){ return harnessError("tools",null,message); }
function stoppedError(){ return harnessError("stopped",null,"stopped"); }

/* A progress callback belongs to the screen, not to the job: a broken one must not cancel the music. */
function stage(onStage,id,n,of,vars){
  if(!onStage) return;
  try{ onStage({id:id,n:n,of:of,vars:vars||{}}); }catch(e){}
}

/* The job is the promise itself, with stop() beside it. stop() settles the job at once, so a late answer or a later
   step cannot resolve or ask anything. */
function job(ask,runner){
  var c={stopped:false,settled:false,current:null,ask:ask,resolve:null,reject:null};
  var p=new Promise(function(resolve,reject){ c.resolve=resolve; c.reject=reject; });
  function fail(err){
    if(c.settled) return;
    c.settled=true;
    c.reject(err);
  }
  p.stop=function(){
    if(c.settled) return;
    c.stopped=true;
    if(c.current && typeof c.current.stop==="function"){
      try{ c.current.stop(); }catch(e){}
    }
    fail(stoppedError());
  };
  Promise.resolve().then(function(){ return runner(c); }).then(function(value){
    if(c.settled) return;
    c.settled=true;
    c.resolve(value);
  }, fail);
  return p;
}

/* A dropped line is not the model's fault and costs the steps already done if it ends the job (owner, 2026-10-30):
   a timeout, no network, a busy or failing server or an empty answer is asked again after a pause, AUTO_RETRY times
   in a row; then the screen asks the user (o.onTrouble) whether to keep trying, and only a "no" ends the job. A wrong
   key or no credit cannot get better by waiting, so it ends at once. */
var AUTO_RETRY=3, RETRY_WAIT=[2000,5000,10000], RETRYABLE={timeout:1, offline:1, server:1, busy:1, empty:1, http:1};

function askOnce(c,messages){
  var tries=0;
  function attempt(){
    return askRaw(c,messages).then(null,function(err){
      var code=err && err.code;
      if(c.stopped || code==="stopped" || !RETRYABLE[code]) throw err;
      tries++;
      if(tries<=AUTO_RETRY){
        stage(c.onStage,"retry",tries,AUTO_RETRY,{why:code});
        return pause(c,RETRY_WAIT[tries-1]).then(attempt);
      }
      if(!c.onTrouble) throw err;
      stage(c.onStage,"trouble",tries-1,AUTO_RETRY,{why:code});
      return Promise.resolve(c.onTrouble(err)).then(function(again){
        if(!again || c.stopped) throw c.stopped ? stoppedError() : err;
        tries=0;
        return attempt();
      });
    });
  }
  return attempt();
}

function pause(c,ms){
  return new Promise(function(resolve,reject){
    (c.later||setTimeout)(function(){ if(c.stopped) reject(stoppedError()); else resolve(); },ms);
  });
}

function askRaw(c,messages){
  return new Promise(function(resolve,reject){
    if(c.stopped){ reject(stoppedError()); return; }
    var a;
    try{ a=c.ask(messages); }
    catch(e){ reject(e); return; }
    c.current=a;
    Promise.resolve(a).then(function(text){
      if(c.current===a) c.current=null;
      if(c.stopped){ reject(stoppedError()); return; }
      resolve(text);
    }, function(err){
      if(c.current===a) c.current=null;
      if(c.stopped){ reject(stoppedError()); return; }
      reject(err);
    });
  });
}

/* One step: ask, extract, check. A rejected answer is sent back with the model's own words and the reason, at most
   MAX_RETRY times; a network error is not a rewrite and goes straight out. Resolves {value, raw} so a caller can append
   the raw answer to the next turn. */
function step(c,messages,check,stageId){
  var rewrites=0;
  function again(msgs){
    if(c.stopped) return Promise.reject(stoppedError());
    return askOnce(c,msgs).then(function(text){
      var obj=AI.extract(text), r;
      if(obj && obj.error) r={error:obj.error};
      else{
        try{ r=check(obj); }
        catch(e){ r={error:"could not check the answer"}; }
      }
      if(r && !r.error) return {value:r.value, raw:String(text==null?"":text)};
      if(rewrites>=MAX_RETRY)
        return Promise.reject(harnessError("unreadable",stageId,"unreadable: "+(r && r.error || "not the expected object")));
      rewrites++;
      return again(msgs.concat([
        {role:"assistant",content:String(text==null?"":text)},
        {role:"user",content:P.reject(r && r.error || "not the expected object")}
      ]));
    });
  }
  return again(messages);
}

/* Run tools in order and apply each one's ops at once: a failed call leaves the working copy untouched. */
function applyTool(song,call){
  var r=T.run(song,call), a;
  if(r.error) throw toolsError(String(call.tool||"tool")+": "+r.error);
  a=E.apply(song,r.ops);
  if(!a.song) throw toolsError(String(call.tool||"tool")+": "+(a.error||"did not apply"));
  return a.song;
}

/* The edit layer's refusal in words a model can act on: which operation, and what about it. */
function applyWhy(a,ops){
  var op=ops && typeof a.at==="number" ? ops[a.at] : null;
  var what={value:"a value is out of range or the wrong type", unknown:"unknown op", track:"unknown track", full:"the chain is full",
    validate:"the result is not a valid song", op:"not an operation", many:"more than 64 operations"}[a.error]||String(a.error||"invalid edit");
  return what+(op ? " in operation "+(a.at+1)+" "+JSON.stringify(op).slice(0,120) : "")+(a.detail ? " ("+a.detail+")" : "");
}

/* The harmony check over the patterns some operations touched: "" when they stay in the key (12.20.9). A key or
   scale change re-reads every pattern, since it moves every chord. */
function keyIssues(song,ops){
  if(!TH) return "";
  var ps=[], seen={}, i, o, all=false, why;
  for(i=0;i<ops.length;i++){
    o=ops[i];
    if(o.op==="setKey" || o.op==="setScale") all=true;
    if(int(o.pattern) && !seen["$"+o.pattern]){ seen["$"+o.pattern]=true; ps.push(o.pattern); }
    if(o.op==="copyPattern" && int(o.to) && !seen["$"+o.to]){ seen["$"+o.to]=true; ps.push(o.to); }
  }
  why=TH.songIssues(song,all ? null : ps);
  return why.length ? why.slice(0,3).join("; ") : "";
}

/* ---------- the plan ---------- */
function planCheck(obj,cards,rolls){
  var bpm, sections, order, seen={}, lens={}, total=0, chain=0, seconds;
  var i, j, s, id, e, used={};
  if(!plain(obj)) return {error:"reply with one JSON object"};
  bpm=obj.bpm; sections=obj.sections; order=obj.order;
  /* card 0: the request names its own style, so no card is used and the plan chooses everything (owner, 2026-10-31:
     "classical" drew a blues card) */
  if(!int(obj.card) || obj.card<0 || obj.card>cards) return {error:"card must be 0 (your own style) or 1-"+cards};
  if(obj.card===0 && (typeof obj.style!=="string" || !obj.style.trim() || Array.from(obj.style.trim()).length>24))
    return {error:"with card 0 write style: a short name for the style in the user's language (at most 24 characters)"};
  if(obj.scale!=null && !S.SCALES[obj.scale])
    return {error:"scale must be one of "+Object.keys(S.SCALES).join(", ")+" (or left out)"};
  if(obj.key!=null && (!int(obj.key) || obj.key<0 || obj.key>11)) return {error:"key must be 0-11 (C=0) or left out"};
  if(obj.chordStyle!=null && CHORD_STYLES.indexOf(obj.chordStyle)<0) return {error:"chordStyle must be one of "+CHORD_STYLES.join(", ")};
  if(obj.kit!=null && S.KIT_CHOICES.indexOf(obj.kit)<0) return {error:"kit must be one of "+S.KIT_CHOICES.join(", ")};
  if(obj.swing!=null && (!num(obj.swing) || obj.swing<S.SWING_MIN || obj.swing>S.SWING_MAX))
    return {error:"swing must be "+S.SWING_MIN+"-"+S.SWING_MAX+" or left out"};
  if(obj.voices!=null){
    if(!plain(obj.voices)) return {error:"voices must be {\"bass\":..., \"chords\":..., \"melody\":...}"};
    for(var vt in obj.voices){
      if(!Object.prototype.hasOwnProperty.call(obj.voices,vt)) continue;
      if(!S.VOICE_CHOICES[vt]) return {error:"voices: unknown track '"+vt+"'; use bass, chords, melody"};
      if(S.VOICE_CHOICES[vt].indexOf(obj.voices[vt])<0) return {error:"voices."+vt+" must be one of "+S.VOICE_CHOICES[vt].join(", ")};
    }
  }
  if(!num(bpm) || bpm<S.BPM_MIN || bpm>S.BPM_MAX)
    return {error:"bpm must be "+S.BPM_MIN+"-"+S.BPM_MAX};
  if(!Array.isArray(sections) || !sections.length) return {error:"sections must be a non-empty list"};
  for(i=0;i<sections.length;i++){
    s=sections[i];
    if(!plain(s)) return {error:"section "+i+" must be an object"};
    id=s.id;
    if(typeof id!=="string" || SECTIONS.indexOf(id)<0)
      return {error:"unknown section id '"+String(id)+"'; use "+SECTIONS.join(", ")};
    if(seen["$"+id]) return {error:"section ids must be unique: '"+id+"' appears twice"};
    seen["$"+id]=true;
    if(!Array.isArray(s.chords) || s.chords.length<1 || s.chords.length>4)
      return {error:"section '"+id+"': chords must be 1-4 roots, one per bar"};
    for(j=0;j<s.chords.length;j++){
      var cr=T.run(S.newSong(0),{tool:"chords",pattern:0,roots:[s.chords[j]]});
      if(cr.error) return {error:"section '"+id+"' bar "+(j+1)+": "+cr.error};
      /* a chord off the key is refused with the chords this key does allow (12.20.9) */
      if(TH && rolls && plain(s.chords[j]) && int(obj.card)){
        var base=rolls[Math.max(0,obj.card-1)];
        var ks={key:obj.key!=null ? obj.key : base.key, scale:obj.scale||(obj.card===0 ? "major" : base.scale)};
        var why=TH.chordIssue(ks,s.chords[j].root,s.chords[j].q,s.chords[j].acc);
        if(why) return {error:"section '"+id+"' bar "+(j+1)+": "+why};
      }
    }
    if(s.drums!=null && s.groove==null){
      var tried=T.run(S.newSong(0),{tool:"groove",pattern:0,steps:s.drums});
      if(tried.error) return {error:"section '"+id+"': "+tried.error};
    } else if(s.groove!=="none" && (typeof s.groove!=="string" || !ST.GROOVES[s.groove]))
      return {error:"section '"+id+"': unknown groove '"+String(s.groove)+"'; use one of "+Object.keys(ST.GROOVES).join(", ")+", or write drums"};
    if(s.strum!=null && s.strum!=="none" && T.CHORD_RHYTHMS.indexOf(s.strum)<0)
      return {error:"section '"+id+"': strum must be one of "+T.CHORD_RHYTHMS.join(", ")+" or none"};
    if(s.imitate!=null && typeof s.imitate!=="boolean") return {error:"section '"+id+"': imitate must be true or false"};
    if(s.imitate && !s.melody) return {error:"section '"+id+"': imitate needs melody true (the bass imitates the melody's motif)"};
    if(Array.isArray(s.bass)){
      var br=T.run(S.newSong(0),{tool:"bass",pattern:0,steps:s.bass});
      if(br.error) return {error:"section '"+id+"': "+br.error};
    } else if(typeof s.bass!=="string" || !ST.BASS[s.bass])
      return {error:"section '"+id+"': unknown bass rhythm '"+String(s.bass)+"'; use one of "+Object.keys(ST.BASS).join(", ")+", or write [[step, velocity, move], ...]"};
    if(!int(s.energy) || s.energy<0 || s.energy>2)
      return {error:"section '"+id+"': energy must be 0, 1 or 2"};
    /* a whole note a bar under a verse or chorus is what made the songs drag: it is for intros, outros and ballads */
    if(s.melody && s.energy>=1 && s.bass==="whole")
      return {error:"section '"+id+"': a whole-note bass drags under a melody; use half, pulse, eighths, walk, boom, syncopated or alberti"};
    if(typeof s.melody!=="boolean")
      return {error:"section '"+id+"': melody must be true or false"};
    lens["$"+id]=s.chords.length;
    total+=s.chords.length;
  }
  if(total>S.PATTERNS_MAX)
    return {error:"the plan uses "+total+" patterns; at most "+S.PATTERNS_MAX};
  if(!Array.isArray(order) || !order.length) return {error:"order must list the sections"};
  for(i=0;i<order.length;i++){
    e=order[i];
    if(!Array.isArray(e) || e.length<2) return {error:"each order entry must be [section id, repeats]"};
    id=e[0];
    if(typeof id!=="string" || !seen["$"+id])
      return {error:"order names an unknown section '"+String(id)+"'"};
    /* two in a row at most: a section played four times running is what made the owner's tapes a loop (12.20.10) */
    if(!int(e[1]) || e[1]<1 || e[1]>2) return {error:"repeats in order must be 1 or 2; list a section again later in order instead"};
    used["$"+id]=true;
    chain+=lens["$"+id]*e[1];
  }
  for(i=0;i<sections.length;i++){
    if(!used["$"+sections[i].id])
      return {error:"section '"+sections[i].id+"' never plays in order"};
  }
  if(chain>S.SONG_MAX) return {error:"the chain is "+chain+" slots; at most "+S.SONG_MAX};
  seconds=chain*240/bpm;
  /* 75-150 s: the owner found two and a half minutes of a handheld's tape drag (2026-10-31) */
  if(seconds<75) return {error:"the song is "+Math.round(seconds)+" s; add sections so it is 75-150 s"};
  if(seconds>150) return {error:"the song is "+Math.round(seconds)+" s; cut repeats so it is 75-150 s"};
  /* Keep only the fields the rest of the pipeline uses: a model's extra keys must not leak into the song or a prompt. */
  var kept=[];
  for(i=0;i<sections.length;i++){
    s=sections[i];
    kept.push({id:s.id,chords:s.chords.slice(),groove:s.drums!=null && s.groove==null ? null : s.groove,
      drums:s.drums!=null && s.groove==null ? s.drums : null,strum:s.strum||"hold",imitate:s.imitate===true,
      energy:s.energy,bass:s.bass,melody:s.melody,patterns:[]});
  }
  var keptOrder=[];
  for(i=0;i<order.length;i++) keptOrder.push([order[i][0],order[i][1]]);
  return {value:{card:obj.card, style:typeof obj.style==="string" ? obj.style.trim() : "", scale:obj.scale||"", chordStyle:obj.chordStyle||"triad", key:obj.key, kit:obj.kit||"", swing:obj.swing, voices:obj.voices||{},
    name:typeof obj.name==="string" && obj.name.trim() ? obj.name.trim() : "Tape4",
    bpm:bpm, sections:kept, order:keptOrder}};
}

function sectionById(plan,id){
  var i;
  for(i=0;i<plan.sections.length;i++) if(plan.sections[i].id===id) return plan.sections[i];
  return null;
}

/* The chain expanded into one section id per bar: it says both which bars get a fill and what each melody follows. */
function chainSections(plan){
  var out=[], i, j;
  for(i=0;i<plan.order.length;i++)
    for(j=0;j<plan.order[i][1];j++) out.push(plan.order[i][0]);
  return out;
}

function laySong(roll,plan,now){
  var song=S.newSong(now), r, i, j, k, s, p, fill, follows={}, seq=chainSections(plan);
  song.key=roll.key; song.scale=roll.scale; song.swing=roll.swing; song.tape=roll.tape; song.kit=roll.kit;
  song.bpm=plan.bpm; song.name=cut(plan.name,S.NAME_MAX);
  /* the sound the plan chose (12.20): a kit and a voice per track, over the card's defaults */
  if(plan.kit) song.kit=plan.kit;
  if(num(plan.swing)) song.swing=Math.round(plan.swing*100)/100;
  for(var vt in plan.voices) if(Object.prototype.hasOwnProperty.call(plan.voices,vt)) song=S.setTrackVoice(song,vt,plan.voices[vt]);
  /* newSong carries one demo bar so the editor is never blank; a planned song starts empty. */
  r=E.apply(song,[{op:"clearPattern",pattern:0}]);
  if(!r.song) throw toolsError("clearPattern: "+(r.error||"did not apply"));
  song=r.song;
  k=0;
  for(i=0;i<plan.sections.length;i++){
    s=plan.sections[i];
    s.patterns=[];
    for(j=0;j<s.chords.length;j++){ s.patterns.push(k); k++; }
  }
  /* A section heard more than once gets a second last bar, while the 16 patterns last: the melody ends the other way
     and the drums fill, so the second hearing answers the first instead of copying it (12.20.10). */
  var heard={};
  for(i=0;i<seq.length;i++) heard["$"+seq[i]]=(heard["$"+seq[i]]||0)+1;
  for(i=0;i<plan.sections.length;i++){
    s=plan.sections[i];
    s.alt=-1;
    if(heard["$"+s.id]>=2 && s.melody && k<S.PATTERNS_MAX){ s.alt=k; k++; }
  }
  for(i=0;i+1<seq.length;i++) if(seq[i]!==seq[i+1]) follows["$"+seq[i]]=true;
  for(i=0;i<plan.sections.length;i++){
    s=plan.sections[i];
    for(j=0;j<s.patterns.length;j++){
      p=s.patterns[j];
      fill=!!follows["$"+s.id] && j===s.patterns.length-1;
      /* a bare degree gets the scale's own chord in the plan's chord style (12.20.8) */
      var cj=s.chords[j], dq=int(cj) ? T.diatonicQ(song,cj,plan.chordStyle) : null;
      if(dq) cj={root:cj, q:dq};
      song=applyTool(song,{tool:"chords",pattern:p,roots:[cj],rhythm:s.strum==="none" ? "hold" : s.strum});
      song=applyTool(song,s.drums ? {tool:"groove",pattern:p,steps:s.drums,energy:s.energy,fill:fill}
        : {tool:"groove",pattern:p,style:s.groove,energy:s.energy,fill:fill});
      song=applyTool(song,Array.isArray(s.bass) ? {tool:"bass",pattern:p,steps:s.bass} : {tool:"bass",pattern:p,rhythm:s.bass});
      /* no chord pad: the bass and the melody still follow the chord, which is why it was laid first (12.20.11) */
      if(s.strum==="none") song=applyTool(song,{tool:"ops",ops:[{op:"clearTrack",pattern:p,track:"chords"}]});
    }
    if(s.alt>=0){
      var lj=s.patterns.length-1, lc=s.chords[lj], lq=int(lc) ? T.diatonicQ(song,lc,plan.chordStyle) : null;
      if(lq) lc={root:lc, q:lq};
      song=applyTool(song,{tool:"chords",pattern:s.alt,roots:[lc],rhythm:s.strum==="none" ? "hold" : s.strum});
      song=applyTool(song,s.drums ? {tool:"groove",pattern:s.alt,steps:s.drums,energy:s.energy,fill:true}
        : {tool:"groove",pattern:s.alt,style:s.groove,energy:s.energy,fill:true});
      song=applyTool(song,Array.isArray(s.bass) ? {tool:"bass",pattern:s.alt,steps:s.bass} : {tool:"bass",pattern:s.alt,rhythm:s.bass});
      if(s.strum==="none") song=applyTool(song,{tool:"ops",ops:[{op:"clearTrack",pattern:s.alt,track:"chords"}]});
    }
  }
  var chain=[], times={};
  for(i=0;i<plan.order.length;i++){
    s=sectionById(plan,plan.order[i][0]);
    for(j=0;j<plan.order[i][1];j++){
      times["$"+s.id]=(times["$"+s.id]||0)+1;
      for(k=0;k<s.patterns.length;k++)
        chain.push(k===s.patterns.length-1 && s.alt>=0 && times["$"+s.id]%2===0 ? s.alt : s.patterns[k]);
    }
  }
  return applyTool(song,{tool:"chain",song:chain});
}

/* ---------- the melody ---------- */
/* The motifs: one ask for every section with a melody, then the local writer (studio-compose.js) builds the phrases
   over the chords. The model decides the rhythm and the shape of each line; the notes come from the chords, so they
   fit (12.20.10). */
function motifCheck(obj,list){
  var i, m, why;
  if(!plain(obj) || !plain(obj.motifs)) return {error:"reply with {\"motifs\":{\"<section id>\":{rhythm, answer, contour, register, ending}, ...}}"};
  for(i=0;i<list.length;i++){
    m=obj.motifs[list[i].id];
    if(!m) return {error:"write a motif for the "+list[i].id};
    why=C.checkMotif(m);
    if(why) return {error:list[i].id+": "+why};
  }
  return {value:obj.motifs};
}

function chordSpec(song,plan,c){
  if(!int(c)) return c;
  var q=T.diatonicQ(song,c,plan.chordStyle);
  return q ? {root:c, q:q} : {root:c};
}

function imitationMotif(m){
  return {rhythm:m.rhythm, answer:m.answer, contour:m.contour, register:"low", ending:m.ending};
}
/* a phrase bar for the bass track: replace the bar's bass with these notes (degrees count from the bass's own tonic) */
function bassOps(p,notes){
  var ops=[{op:"clearTrack",pattern:p,track:"bass"}], i, n, o;
  for(i=0;i<notes.length;i++){
    n=notes[i];
    o={op:"setNote",pattern:p,track:"bass",step:n[0],deg:Math.max(-3,Math.min(9,n[1])),vel:n[2]};
    if(n[3] && n[2]>0) o.acc=n[3];
    ops.push(o);
  }
  return ops;
}

function motifRun(c,song,plan,roll,text,onStage){
  var list=[], i, j, s, bars, sections=[];
  for(i=0;i<plan.sections.length;i++) if(plan.sections[i].melody) list.push(plan.sections[i]);
  if(!list.length) return Promise.resolve(song);
  stage(onStage,"motif",1,1,{});
  for(i=0;i<list.length;i++){
    s=list[i]; bars=[];
    for(j=0;j<s.chords.length;j++){
      var spec=chordSpec(song,plan,s.chords[j]), cn=S.chordName(song,spec.root,spec.q,spec.acc);
      bars.push(cn ? cn.name : "?");
    }
    sections.push({id:s.id, bars:bars, energy:s.energy});
  }
  var msgs=P.motif({text:text, card:P.lang(text)==="Chinese"?roll.card.zh:roll.card.en,
    keyName:S.NAMES[song.key], scale:song.scale, bpm:song.bpm, sections:sections});
  return step(c,msgs,function(obj){ return motifCheck(obj,list); },"melody").then(function(ans){
    var motifs=ans.value, start=null, k, out, alt;
    for(i=0;i<list.length;i++){
      s=list[i];
      var specs=s.chords.map(function(x){ return chordSpec(song,plan,x); });
      out=C.phrase(song,motifs[s.id],specs,{variant:0,start:start});
      for(k=0;k<out.length;k++) song=applyTool(song,{tool:"melody",pattern:s.patterns[k],notes:out[k]});
      /* imitation: the bass answers with the same motif a bar later and lower, over its own chords, so the two lines
         are a small canon that stays in the harmony (a fugue's entry, as far as two voices allow) (12.20.11) */
      if(s.imitate && specs.length>1){
        var low=C.phrase(song,imitationMotif(motifs[s.id]),specs.slice(1),{variant:0});
        for(k=0;k<low.length;k++) song=applyTool(song,{tool:"ops",ops:bassOps(s.patterns[k+1],low[k])});
      }
      if(s.alt>=0){
        alt=C.phrase(song,motifs[s.id],specs,{variant:1,start:start});
        song=applyTool(song,{tool:"melody",pattern:s.alt,notes:alt[alt.length-1]});
      }
      var last=out[out.length-1], ln=last && last[last.length-1];
      if(ln) start=ln[1];
    }
    return song;
  });
}

/* ---------- the listen-back ---------- */
function listenCheck(obj,song){
  var work=song, i, call, r, a;
  if(!plain(obj)) return {error:"reply with one JSON object"};
  if(typeof obj.reply!=="string" || !obj.reply.trim())
    return {error:"reply must be a non-empty sentence for the user"};
  if(Array.from(obj.reply.trim()).length>120) return {error:"reply must be at most 120 characters"};
  if(!Array.isArray(obj.calls)) return {error:"calls must be a list of tool calls"};
  if(obj.calls.length>8) return {error:"at most 8 calls"};
  for(i=0;i<obj.calls.length;i++){
    call=obj.calls[i];
    if(!plain(call) || typeof call.tool!=="string")
      return {error:"call "+(i+1)+": give a tool name"};
    if(call.tool==="chain" || call.tool==="set" || call.tool==="read")
      return {error:"call "+(i+1)+": the "+call.tool+" tool is not allowed here"};
    r=T.run(work,call);
    if(r.error) return {error:"call "+(i+1)+" ("+call.tool+") failed: "+r.error};
    a=E.apply(work,r.ops);
    if(!a.song)
      return {error:"call "+(i+1)+" ("+call.tool+") did not apply: "+applyWhy(a,r.ops)};
    var off=keyIssues(a.song,r.ops);
    if(off) return {error:"call "+(i+1)+" ("+call.tool+"): "+off};
    work=a.song;
  }
  return {value:{reply:obj.reply.trim(),song:work}};
}

/* ---------- a new song ---------- */
function skeleton(o){
  o=o||{};
  var text=o.text==null?"":String(o.text);
  var rand=typeof o.rand==="function"?o.rand:Math.random;
  var now=num(o.now)?o.now:Date.now();
  return job(o.ask,function(c){
    c.onStage=o.onStage; c.onTrouble=o.onTrouble; c.later=o.later;
    /* Card 1 is the dice's pick, for a vague request ("a skeleton"); every other card follows with its own key, so a
       request that names a mood or a style can take the card that fits it. */
    var rolls=[ST.roll(rand)], zh=P.lang(text)==="Chinese", roll, cardName, i;
    for(i=0;i<ST.CARDS.length;i++) if(ST.CARDS[i].id!==rolls[0].card.id) rolls.push(ST.rollCard(rand,ST.CARDS[i]));
    stage(o.onStage,"plan",1,1,{});
    var planMsgs=P.plan({
      text:text, cards:rolls.map(function(x){
        return {name:zh?x.card.zh:x.card.en, keyName:S.NAMES[x.key], scale:x.scale, bpm:x.card.bpm,
          grooves:x.grooves, bass:x.bass, form:ST.FORMS[x.form] ? ST.FORMS[x.form].order.join(" ") : ""};
      }),
      allGrooves:Object.keys(ST.GROOVES), allBass:Object.keys(ST.BASS)
    });
    return step(c,planMsgs,function(obj){ return planCheck(obj,rolls.length,rolls); },"plan").then(function(ans){
      var plan=ans.value, song;
      if(plan.card===0){
        /* the plan's own style: the dice give only the key (a fresh one each time); the rest is neutral unless the
           plan set it */
        roll={card:{id:"own", zh:plan.style, en:plan.style}, key:rolls[0].key, scale:"major", swing:0.5, tape:1, kit:"soft",
          grooves:[], bass:[], form:""};
      } else roll=rolls[plan.card-1];
      if(plan.scale) roll.scale=plan.scale;
      if(plan.key!=null) roll.key=plan.key;
      cardName=zh?roll.card.zh:roll.card.en;
      stage(o.onStage,"card",1,1,{card:cardName,own:plan.card===0,key:S.NAMES[roll.key],scale:roll.scale,bpm:plan.bpm});
      stage(o.onStage,"lay",1,1,{});
      song=laySong(roll,plan,now);
      return motifRun(c,song,plan,roll,text,o.onStage);
    }).then(function(song){
      stage(o.onStage,"listen",1,1,{});
      var msgs=P.listen({text:text,overview:AI.overview(song)});
      return step(c,msgs,function(obj){ return listenCheck(obj,song); },"listen").then(function(ans){
        var final=ans.value.song;
        return {reply:ans.value.reply,draft:true,
          ops:[{op:"replaceSong",song:final}],song:final,card:roll.card};
      });
    });
  });
}

/* ---------- an edit to the current song ---------- */
function editCheck(obj){
  if(!plain(obj)) return {error:"reply with one JSON object"};
  if(!Array.isArray(obj.calls)) return {error:"calls must be a list"};
  if(obj.calls.length>12) return {error:"at most 12 calls per turn"};
  if(typeof obj.done!=="boolean") return {error:"done must be true or false"};
  if(obj.done && typeof obj.reply!=="string") return {error:"reply must be a string when done is true"};
  return {value:{calls:obj.calls,done:obj.done,reply:typeof obj.reply==="string"?obj.reply.trim():""}};
}

function runCalls(song,calls){
  var work=song, ops=[], lines=[], failed=false, read=false, i, call, n, r, a;
  for(i=0;i<calls.length;i++){
    n=i+1; call=calls[i];
    if(!plain(call) || typeof call.tool!=="string"){
      lines.push(n+" error: give a tool name");
      failed=true;
      continue;
    }
    if(call.tool==="read"){
      if(!int(call.pattern) || call.pattern<0 || call.pattern>=S.PATTERNS_MAX){
        lines.push(n+" error: read: use a pattern number 0-15");
        failed=true;
        continue;
      }
      read=true;
      lines.push(n+" read "+letter(call.pattern)+": "+AI.patternView(work,call.pattern));
      continue;
    }
    r=T.run(work,call);
    if(r.error){
      lines.push(n+" error: "+r.error);
      failed=true;
      continue;
    }
    a=E.apply(work,r.ops);
    if(!a.song){
      lines.push(n+" error: "+call.tool+" did not apply: "+applyWhy(a,r.ops));
      failed=true;
      continue;
    }
    var off=keyIssues(a.song,r.ops);
    if(off){
      lines.push(n+" error: "+off);
      failed=true;
      continue;
    }
    work=a.song;
    ops=ops.concat(r.ops);
    lines.push(n+" ok");
  }
  return {song:work,ops:ops,lines:lines,failed:failed,read:read};
}

function edit(o){
  o=o||{};
  var text=o.text==null?"":String(o.text), song=o.song, focus=o.focus, onStage=o.onStage;
  return job(o.ask,function(c){
    c.onStage=o.onStage; c.onTrouble=o.onTrouble; c.later=o.later;
    var work=song, allOps=[], turn=1;
    var msgs=P.edit({text:text,overview:AI.overview(song),focus:focus,song:song});
    function again(){
      if(c.stopped) return Promise.reject(stoppedError());
      if(turn===1) stage(onStage,"read",1,MAX_TURNS,{});
      else stage(onStage,"edit",turn,MAX_TURNS,{turn:turn});
      return step(c,msgs,editCheck,turn===1?"read":"edit").then(function(ans){
        var res=runCalls(work,ans.value.calls), note;
        work=res.song;
        allOps=allOps.concat(res.ops);
        if(!res.failed && !res.read && ans.value.done){
          stage(onStage,"check",1,1,{});
          if(!S.validate(work).song) throw toolsError("the edited song does not validate");
          return {reply:ans.value.reply,ops:allOps,draft:false,song:work};
        }
        /* The fifth turn is the last: return what already landed, with no sentence for the user. */
        if(turn>=MAX_TURNS) return {reply:"",ops:allOps,draft:false,song:work};
        note="RESULTS\n"+(res.lines.length?res.lines.join("\n"):"(no calls)")+"\n\nContinue.";
        if(res.failed) note+=" Fix the failed calls.";
        msgs=msgs.concat([
          {role:"assistant",content:ans.raw},
          {role:"user",content:note}
        ]);
        turn++;
        return again();
      });
    }
    return again();
  });
}

/* Does this sentence ask for a new song, or a change to the open one? "写一个俄罗斯风格的曲子" went down the edit path
   and rewrote a blank tape bar by bar (owner, 2026-10-30), so the words of making something are wider than "骨架",
   and a tape that is still the single starting bar is never worth editing into a song. */
var NEW_SONG=/骨架|写一首|来一首|做一首|写一个|写个|做一个|做个|来一个|来个|一首|曲子|新歌|新的歌|skeleton|song idea|new song|write (a|me)|make (a|me)|compose|an? [\w\s-]*(song|tune|track|piece)\b/i;
var EDIT_WORDS=/改|换|调|加|去掉|删|更|再|让它|把|副歌|主歌|change|make it|more|less|add|remove|turn|swap/i;
function wantsNewSong(text,song){
  var t=String(text||"");
  if(NEW_SONG.test(t) && !/^(把|让|给)/.test(t.trim())) return true;
  var chain=song && song.song || [], used={}, i, n=0;
  for(i=0;i<chain.length;i++) if(!used["$"+chain[i]]){ used["$"+chain[i]]=true; n++; }
  /* a fresh tape (one bar in the chain): anything that is not clearly an edit makes a new song */
  return chain.length<=1 && n<=1 && !EDIT_WORDS.test(t);
}

window.LopdaStudioHarness={wantsNewSong:wantsNewSong, skeleton:skeleton, edit:edit, MAX_RETRY:MAX_RETRY, MAX_TURNS:MAX_TURNS, AUTO_RETRY:AUTO_RETRY};
})();
