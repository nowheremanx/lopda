/*
 * Lo-PDA runtime: speech through the phone's own voices (speechSynthesis, offline), for the dictionary's 发音
 * (decisions.md section 15) and PAD.say (section 25). No DOM: host(env) is given the window, the volume and a clock,
 * so Node tests can run it with a fake speechSynthesis. Shared with sdk/dev.html.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var MAX=200,        // PAD.say speaks at most this many characters; the rest is cut
  GAP=1000,         // and an app may call it once a second
  START_WAIT=3000;  // a phone that refuses to speak (no tap, iOS) may say nothing at all: give up when nothing started by then

function langOf(v){ return String(v && v.lang || "").replace(/_/g,"-").toLowerCase(); }
/* the voice for "en" or "zh": the first whose lang starts with it, a common one first (en-US or en-GB; zh-CN, the
   Mandarin of Simplified Chinese, over Cantonese zh-HK) */
var PREFER={en:/^en-(us|gb)\b/, zh:/^zh-(cn|hans)\b/};
function pick(list,lang){
  var all=(list||[]).filter(function(v){ return langOf(v).indexOf(lang)===0; });
  return all.filter(function(v){ return PREFER[lang] && PREFER[lang].test(langOf(v)); })[0] || all[0] || null;
}
/* at most MAX characters (code points, so a character outside the BMP is never split) */
function cut(text){ return Array.from(String(text==null?"":text)).slice(0,MAX).join(""); }

/* env: {window, volume() -> 0..1 (0: off), now(), setTimeout, clearTimeout} */
function host(env){
  var w=env.window, now=env.now||Date.now;
  var later=function(f,ms){ return (env.setTimeout||setTimeout)(f,ms); }, unlater=function(t){ (env.clearTimeout||clearTimeout)(t); };
  var found={}, cur=null, last={};
  function synth(){ return w.speechSynthesis && w.SpeechSynthesisUtterance ? w.speechSynthesis : null; }
  /* iOS lists its voices late: until one is found every call looks again */
  function voice(lang){
    if(found[lang]) return found[lang];
    var s=synth(), list=[]; if(!s) return null;
    try{ list=s.getVoices()||[]; }catch(e){}
    return (found[lang]=pick(list,lang));
  }
  /* stop what an app is saying: its promise settles "stopped" */
  function stop(){
    var c=cur; if(!c) return;
    cur=null; c.finish("stopped");
    try{ synth().cancel(); }catch(e){}
  }
  /* PAD.say for the app `who`: -> Promise<"done" | "stopped" | "unavailable">. A new call stops the one speaking */
  function say(who,text,lang){
    return new Promise(function(resolve){
      var t=now();
      if(last[who]!=null && t-last[who]<GAP){ resolve("unavailable"); return; }
      last[who]=t;
      var s=synth(), v=s && voice(lang==="en"?"en":"zh"), vol=env.volume(), words=cut(text);
      if(!s || !v || !(vol>0)){ resolve("unavailable"); return; }
      if(!words.trim()){ resolve("done"); return; }
      stop();
      var u=new w.SpeechSynthesisUtterance(words), timer=null;
      var job={u:u, done:false, finish:function(r){
        if(job.done) return;
        job.done=true; unlater(timer);
        if(cur===job) cur=null;
        resolve(r);
      }};
      u.voice=v; u.lang=v.lang; u.volume=Math.min(1,vol);
      u.onstart=function(){ unlater(timer); };
      u.onend=function(){ job.finish("done"); };
      u.onerror=function(e){ job.finish(e && (e.error==="interrupted" || e.error==="canceled") ? "stopped" : "unavailable"); };
      cur=job;
      timer=later(function(){ if(cur===job){ cur=null; job.finish("unavailable"); try{ s.cancel(); }catch(e){} } },START_WAIT);
      try{ s.cancel(); s.speak(u); }catch(e){ job.finish("unavailable"); }
    });
  }
  return {synth:synth, voice:voice, volume:env.volume, say:say, stop:stop, speaking:function(){ return !!cur; }};
}

window.LopdaSpeech={pick:pick, cut:cut, host:host, MAX:MAX, GAP:GAP, START_WAIT:START_WAIT};
})();
