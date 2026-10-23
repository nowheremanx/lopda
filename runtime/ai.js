/*
 * Lo-PDA runtime: the AI line (decisions.md section 34). One address, OpenRouter's chat completions, called straight
 * from the page with the user's own key: OpenRouter answers the browser's CORS check, so no server sits in between.
 * Streams the answer as server-sent events and hands it over piece by piece. No DOM and no LP: fetch, the clock and
 * the timers come from env, so Node tests can run it with a fake fetch.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var URL_CHAT="https://openrouter.ai/api/v1/chat/completions",
  MODEL="openrouter/auto",  // OpenRouter picks a model when the user has not named one
  IDLE=60000;               // give up when nothing arrived for this long (a slow model thinks before it writes)

/* A server-sent event stream, fed in pieces: whole lines only, comments (": OPENROUTER PROCESSING") skipped.
   push(text) returns the data payloads it completed; "[DONE]" is one of them. */
function lines(){
  var rest="";
  return {push:function(text){
    var out=[], parts=(rest+text).split("\n");
    rest=parts.pop();
    parts.forEach(function(l){
      l=l.replace(/\r$/,"");
      if(l.indexOf("data:")===0) out.push(l.slice(5).replace(/^ /,""));
    });
    return out;
  }};
}
/* what went wrong, as one of a few codes the screens have words for */
function httpCode(status){
  return status===401 || status===403 ? "key" : status===402 ? "credit" : status===429 ? "busy" : status>=500 ? "server" : "http";
}
function fail(code,detail){ var e=new Error(detail||code); e.code=code; return e; }

/* env: {fetch, setTimeout, clearTimeout}
   ask({key, model, messages, max, onText(piece, all), onModel(name)}) -> Promise of the whole answer; .stop() ends it ("stopped") */
function host(env){
  var later=env.setTimeout||setTimeout, unlater=env.clearTimeout||clearTimeout;
  function ask(o){
    var ctl=typeof AbortController==="function" ? new AbortController() : null, why=null, timer=0, all="", model="", sse=lines();
    var body={model:o.model||MODEL, messages:o.messages, stream:true};
    if(o.max) body.max_tokens=o.max;
    function idle(){ unlater(timer); timer=later(function(){ why="timeout"; if(ctl) ctl.abort(); },IDLE); }
    var p=Promise.resolve().then(function(){
      if(!o.key) throw fail("nokey");
      idle();
      return env.fetch(URL_CHAT,{method:"POST", signal:ctl ? ctl.signal : undefined, credentials:"omit", referrerPolicy:"no-referrer", cache:"no-store",
        headers:{"Content-Type":"application/json", "Authorization":"Bearer "+o.key}, body:JSON.stringify(body)});
    }).then(function(res){
      if(!res.ok) throw fail(httpCode(res.status),"HTTP "+res.status);
      if(!res.body || !res.body.getReader) return res.text().then(function(t){ take(t+"\n"); return all; });
      var rd=res.body.getReader(), dec=new TextDecoder();
      function pump(){
        return rd.read().then(function(r){
          if(r.done){ take(dec.decode()+"\n"); return all; }
          idle();
          if(take(dec.decode(r.value,{stream:true}))) { try{ rd.cancel(); }catch(e){} return all; }
          return pump();
        });
      }
      return pump();
    }).then(function(text){
      unlater(timer);
      if(!text) throw fail("empty");
      return text;
    },function(e){
      unlater(timer);
      if(e && e.code) throw e;
      throw fail(why || "offline", e && e.message);
    });
    /* one decoded piece: true once the stream said [DONE] */
    function take(text){
      var done=false;
      sse.push(text).forEach(function(d){
        if(d==="[DONE]"){ done=true; return; }
        var j; try{ j=JSON.parse(d); }catch(e){ return; }
        /* OpenRouter reports a failure after the headers as an event with an error in it */
        if(j && j.error) throw fail(httpCode(+j.error.code||0),j.error.message);
        if(j && j.model && !model){ model=j.model; if(o.onModel) o.onModel(model); }
        var c=j && j.choices && j.choices[0], piece=c && c.delta && c.delta.content;
        if(typeof piece==="string" && piece){ all+=piece; if(o.onText) o.onText(piece,all); }
      });
      return done;
    }
    p.stop=function(){ why="stopped"; if(ctl) ctl.abort(); };
    return p;
  }
  return {ask:ask};
}

window.LopdaAI={host:host, lines:lines, httpCode:httpCode, URL:URL_CHAT, MODEL:MODEL, IDLE:IDLE};
})();
