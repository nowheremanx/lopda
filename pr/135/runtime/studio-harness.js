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
var AI=window.LopdaStudioAI, P=window.LopdaStudioPrompts, ST=window.LopdaStudioStyles,
    T=window.LopdaStudioTools, E=window.LopdaStudioEdit, S=window.LopdaSong;

var MAX_RETRY=2, MAX_TURNS=5;
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

function askOnce(c,messages){
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

/* ---------- the plan ---------- */
function planCheck(obj,cards){
  var bpm, sections, order, seen={}, lens={}, total=0, chain=0, seconds;
  var i, j, s, id, e, used={};
  if(!plain(obj)) return {error:"reply with one JSON object"};
  bpm=obj.bpm; sections=obj.sections; order=obj.order;
  if(!int(obj.card) || obj.card<1 || obj.card>cards) return {error:"card must be 1-"+cards};
  if(obj.scale!=null && !S.SCALES[obj.scale])
    return {error:"scale must be one of "+Object.keys(S.SCALES).join(", ")+" (or left out)"};
  if(obj.key!=null && (!int(obj.key) || obj.key<0 || obj.key>11)) return {error:"key must be 0-11 (C=0) or left out"};
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
    }
    if(s.drums!=null && s.groove==null){
      var tried=T.run(S.newSong(0),{tool:"groove",pattern:0,steps:s.drums});
      if(tried.error) return {error:"section '"+id+"': "+tried.error};
    } else if(typeof s.groove!=="string" || !ST.GROOVES[s.groove])
      return {error:"section '"+id+"': unknown groove '"+String(s.groove)+"'; use one of "+Object.keys(ST.GROOVES).join(", ")+", or write drums"};
    if(s.strum!=null && T.CHORD_RHYTHMS.indexOf(s.strum)<0)
      return {error:"section '"+id+"': strum must be one of "+T.CHORD_RHYTHMS.join(", ")};
    if(Array.isArray(s.bass)){
      var br=T.run(S.newSong(0),{tool:"bass",pattern:0,steps:s.bass});
      if(br.error) return {error:"section '"+id+"': "+br.error};
    } else if(typeof s.bass!=="string" || !ST.BASS[s.bass])
      return {error:"section '"+id+"': unknown bass rhythm '"+String(s.bass)+"'; use one of "+Object.keys(ST.BASS).join(", ")+", or write [[step, velocity, move], ...]"};
    if(!int(s.energy) || s.energy<0 || s.energy>2)
      return {error:"section '"+id+"': energy must be 0, 1 or 2"};
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
    if(!int(e[1]) || e[1]<1 || e[1]>4) return {error:"repeats in order must be 1-4"};
    used["$"+id]=true;
    chain+=lens["$"+id]*e[1];
  }
  for(i=0;i<sections.length;i++){
    if(!used["$"+sections[i].id])
      return {error:"section '"+sections[i].id+"' never plays in order"};
  }
  if(chain>S.SONG_MAX) return {error:"the chain is "+chain+" slots; at most "+S.SONG_MAX};
  seconds=chain*240/bpm;
  if(seconds<100) return {error:"the song is "+Math.round(seconds)+" s; add repeats so it is 100-200 s"};
  if(seconds>200) return {error:"the song is "+Math.round(seconds)+" s; remove repeats so it is 100-200 s"};
  /* Keep only the fields the rest of the pipeline uses: a model's extra keys must not leak into the song or a prompt. */
  var kept=[];
  for(i=0;i<sections.length;i++){
    s=sections[i];
    kept.push({id:s.id,chords:s.chords.slice(),groove:s.drums!=null && s.groove==null ? null : s.groove,
      drums:s.drums!=null && s.groove==null ? s.drums : null,strum:s.strum||"hold",
      energy:s.energy,bass:s.bass,melody:s.melody,patterns:[]});
  }
  var keptOrder=[];
  for(i=0;i<order.length;i++) keptOrder.push([order[i][0],order[i][1]]);
  return {value:{card:obj.card, scale:obj.scale||"", key:obj.key, kit:obj.kit||"", swing:obj.swing, voices:obj.voices||{},
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
  for(i=0;i+1<seq.length;i++) if(seq[i]!==seq[i+1]) follows["$"+seq[i]]=true;
  for(i=0;i<plan.sections.length;i++){
    s=plan.sections[i];
    for(j=0;j<s.patterns.length;j++){
      p=s.patterns[j];
      fill=!!follows["$"+s.id] && j===s.patterns.length-1;
      song=applyTool(song,{tool:"chords",pattern:p,roots:[s.chords[j]],rhythm:s.strum});
      song=applyTool(song,s.drums ? {tool:"groove",pattern:p,steps:s.drums,energy:s.energy,fill:fill}
        : {tool:"groove",pattern:p,style:s.groove,energy:s.energy,fill:fill});
      song=applyTool(song,Array.isArray(s.bass) ? {tool:"bass",pattern:p,steps:s.bass} : {tool:"bass",pattern:p,rhythm:s.bass});
    }
  }
  var chain=[];
  for(i=0;i<plan.order.length;i++){
    s=sectionById(plan,plan.order[i][0]);
    for(j=0;j<plan.order[i][1];j++) for(k=0;k<s.patterns.length;k++) chain.push(s.patterns[k]);
  }
  return applyTool(song,{tool:"chain",song:chain});
}

/* ---------- the melody ---------- */
function melodyCheck(obj,bars){
  var out=[], allSame=true, first=null, i, j, bar, notes, prev, n, step, deg, vel, key;
  if(!plain(obj) || !Array.isArray(obj.bars)) return {error:"reply with {\"bars\":[[[step,degree,velocity], ...], ...]}"};
  if(obj.bars.length!==bars.length)
    return {error:"write exactly "+bars.length+" bar"+(bars.length===1?"":"s")+", one per chord"};
  for(i=0;i<obj.bars.length;i++){
    bar=obj.bars[i];
    if(!Array.isArray(bar)) return {error:"bar "+(i+1)+" must be a list of notes"};
    if(bar.length<1 || bar.length>12) return {error:"bar "+(i+1)+" must have 1-12 notes"};
    notes=[]; prev=-1;
    for(j=0;j<bar.length;j++){
      n=bar[j];
      if(!Array.isArray(n) || n.length<2)
        return {error:"bar "+(i+1)+" note "+(j+1)+" must be [step, degree, velocity]"};
      step=n[0]; deg=n[1]; vel=n.length>2?n[2]:S.NOTE_VEL;
      if(!int(step) || step<0 || step>15) return {error:"bar "+(i+1)+": steps must be 0-15"};
      if(step<=prev) return {error:"bar "+(i+1)+": steps must rise, with no step twice"};
      if(!int(deg) || deg<-3 || deg>10) return {error:"bar "+(i+1)+": degrees must be integers -3..10"};
      if(!num(vel) || (vel!==0 && (vel<0.3 || vel>1)))
        return {error:"bar "+(i+1)+": velocity must be 0.3-1, or 0 for a rest"};
      var acc=n.length>3 && n[3]!=null ? n[3] : 0, orn=n.length>4 && n[4]!=null ? n[4] : "";
      if(acc!==0 && acc!==1 && acc!==-1) return {error:"bar "+(i+1)+": the 4th value (acc) must be -1, 0 or 1"};
      if(orn!=="" && orn!=="slide" && orn!=="vib") return {error:"bar "+(i+1)+": the 5th value (ornament) must be \"slide\" or \"vib\""};
      notes.push(orn ? [step,deg,Math.round(vel*100)/100,acc,orn] : acc ? [step,deg,Math.round(vel*100)/100,acc] : [step,deg,Math.round(vel*100)/100]);
      prev=step;
    }
    key=JSON.stringify(notes);
    if(first===null) first=key;
    else if(key!==first) allSame=false;
    out.push(notes);
  }
  if(out.length>1 && allSame) return {error:"every bar is the same; make the phrase move"};
  return {value:out};
}

function melodyBlurb(id,bars){
  var count=0, min=null, max=null, i, j, n;
  for(i=0;i<bars.length;i++) for(j=0;j<bars[i].length;j++){
    n=bars[i][j];
    count++;
    if(min===null || n[1]<min) min=n[1];
    if(max===null || n[1]>max) max=n[1];
  }
  return id+": "+bars.length+" bar"+(bars.length===1?"":"s")+", "+count+" note"+(count===1?"":"s")+
    ", degrees "+(min===max?String(min):min+".."+max);
}

function ordinal(n){
  var s=["th","st","nd","rd"], v=n%100;
  return n+(s[(v-20)%10]||s[v]||s[0]);
}

function melodyRun(c,song,plan,roll,text,onStage){
  var list=[], written=[], idx=0;
  for(idx=0;idx<plan.sections.length;idx++) if(plan.sections[idx].melody) list.push(plan.sections[idx]);
  idx=0;
  function next(){
    if(idx>=list.length) return Promise.resolve(song);
    var s=list[idx], at=idx, bars=[], i, nextSection=null, placeAt=0;
    idx++;
    for(i=0;i<plan.sections.length;i++) if(plan.sections[i].id===s.id){ placeAt=i; break; }
    for(i=placeAt+1;i<plan.sections.length;i++){ nextSection=plan.sections[i]; break; }
    stage(onStage,"melody",at+1,list.length,{section:s.id});
    for(i=0;i<s.patterns.length;i++){
      var spec=int(s.chords[i]) ? {root:s.chords[i]} : s.chords[i];
      var cn=S.chordName(song,spec.root,spec.q,spec.acc);
      bars.push({chord:cn?cn.name:"deg"+spec.root, tones:T.chordToneText(song,spec)});
    }
    var place="the "+ordinal(placeAt+1)+" of "+plan.sections.length+" sections, "+
      (nextSection?"before the "+nextSection.id:"the last section");
    var msgs=P.melody({
      text:text, card:P.lang(text)==="Chinese"?roll.card.zh:roll.card.en,
      keyName:S.NAMES[roll.key], scale:roll.scale, bpm:song.bpm,
      section:s.id, place:place, bars:bars, before:written.join("; ")
    });
    return step(c,msgs,function(obj){ return melodyCheck(obj,bars); },"melody").then(function(ans){
      var notes=ans.value, i;
      for(i=0;i<notes.length;i++)
        song=applyTool(song,{tool:"melody",pattern:s.patterns[i],notes:notes[i]});
      written.push(melodyBlurb(s.id,notes));
      return next();
    });
  }
  return next();
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
      return {error:"call "+(i+1)+" ("+call.tool+") did not apply: "+(a.error||"invalid edit")};
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
    return step(c,planMsgs,function(obj){ return planCheck(obj,rolls.length); },"plan").then(function(ans){
      var plan=ans.value, song;
      roll=rolls[plan.card-1];
      if(plan.scale) roll.scale=plan.scale;
      if(plan.key!=null) roll.key=plan.key;
      cardName=zh?roll.card.zh:roll.card.en;
      stage(o.onStage,"card",1,1,{card:cardName,key:S.NAMES[roll.key],scale:roll.scale,bpm:plan.bpm});
      stage(o.onStage,"lay",1,1,{});
      song=laySong(roll,plan,now);
      return melodyRun(c,song,plan,roll,text,o.onStage);
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
      lines.push(n+" error: "+call.tool+" did not apply: "+(a.error||"invalid edit"));
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
    var work=song, allOps=[], turn=1;
    var msgs=P.edit({text:text,overview:AI.overview(song),focus:focus});
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

window.LopdaStudioHarness={skeleton:skeleton, edit:edit, MAX_RETRY:MAX_RETRY, MAX_TURNS:MAX_TURNS};
})();
