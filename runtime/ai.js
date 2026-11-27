/*
 * Lo-PDA runtime: the AI line (decisions.md sections 34 and 61). Five OpenAI-compatible chat completions providers from
 * a fixed table; the request goes to the chosen provider's own address, called straight from the page with the user's own
 * key, and the key is only ever sent there (never to another provider, never to a URL a caller passes). Each provider
 * answers the browser's CORS check, so no server sits in between. Streams the answer as server-sent events and hands it
 * over piece by piece. A model can think for minutes before it writes; a reasoning model streams its thinking.
 * Every byte that arrives is reported (onSignal), so a screen can show the line is alive and not stuck.
 * No DOM and no LP: fetch and the timers come from env, so Node tests can run it with a fake fetch.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var URL_CHAT="https://openrouter.ai/api/v1/chat/completions",
  MODEL="openrouter/auto",  // OpenRouter picks a model when the user has not named one
  IDLE=60000,               // give up when nothing arrived for this long (a slow model thinks before it writes)
  LIST_MS=20000;            // a provider's model list that has not arrived by then is given up

/* The providers: five OpenAI-compatible chat completions endpoints, in the order the screens list them
   (decisions.md section 61). The address is the only place the key is sent; providers are never tried in turn.
   models: the provider's own model list, the same OpenAI-compatible shape (the line page's 从列表选 fetches it);
   only OpenRouter's is public, the rest need that line's key. idle: optional, an override of IDLE in milliseconds. */
var PROVIDERS=[
  /* https://openrouter.ai/docs */
  {id:"openrouter", name:{zh:"OpenRouter", en:"OpenRouter"}, url:URL_CHAT, models:"https://openrouter.ai/api/v1/models",
    model:MODEL, vision:true, visionModel:"", site:"openrouter.ai", keyHint:"sk-or-"},
  /* https://api-docs.deepseek.com/zh-cn/quick_start/pricing (2026-11-21: deepseek-flash is DeepSeek-V4.1-Flash and reads images) */
  {id:"deepseek", name:{zh:"DeepSeek", en:"DeepSeek"}, url:"https://api.deepseek.com/chat/completions",
    models:"https://api.deepseek.com/models",
    model:"deepseek-flash", vision:true, visionModel:"deepseek-flash", site:"platform.deepseek.com", keyHint:"sk-"},
  /* https://platform.kimi.com/docs/api/chat */
  /* kimi-k3.1-pro: cheaper than kimi-k3 and sees natively (https://platform.kimi.com/docs/pricing/chat, 2026-11-21) */
  {id:"kimi", name:{zh:"Kimi", en:"Kimi"}, url:"https://api.moonshot.cn/v1/chat/completions",
    models:"https://api.moonshot.cn/v1/models",
    model:"kimi-k3.1-pro", vision:true, visionModel:"kimi-k3.1-pro", site:"platform.kimi.com", keyHint:"sk-"},
  /* https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope */
  /* qwen3.7-plus: Bailian's balanced model, sees, streams reasoning_content (its model page, 2026-11-21). The docs' newer
     host carries a workspace id; this older shared host still answers. */
  {id:"qwen", name:{zh:"通义千问", en:"Qwen"}, url:"https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    models:"https://dashscope.aliyuncs.com/compatible-mode/v1/models",
    model:"qwen3.7-plus", vision:true, visionModel:"qwen3.7-plus", site:"bailian.console.aliyun.com", keyHint:"sk-"},
  /* https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions */
  /* vision model from https://docs.siliconflow.cn/cn/userguide/capabilities/vision (2026-11-21) */
  {id:"siliconflow", name:{zh:"硅基流动", en:"SiliconFlow"}, url:"https://api.siliconflow.cn/v1/chat/completions",
    models:"https://api.siliconflow.cn/v1/models?type=text",
    model:"deepseek-ai/DeepSeek-V4-Flash", vision:true, visionModel:"Pro/moonshotai/Kimi-K2.6",
    site:"cloud.siliconflow.cn", keyHint:"sk-"}
];

/* one entry by id, or null: the screens look a provider up before showing it, ask() refuses an unknown one */
function provider(id){
  var found=null;
  PROVIDERS.forEach(function(p){ if(p.id===id) found=p; });
  return found;
}

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
/* a provider's documented "out of credit" answer that its HTTP status alone does not name; null when it is not one */
function bodyCode(id,status,json){
  var e=json && json.error;
  if(id==="kimi" && status===429 && e && e.type==="exceeded_current_quota_error") return "credit";
  if(id==="qwen"){
    if((status===403 || status===429) && ((json && json.code==="Arrearage") || (e && e.code==="Arrearage"))) return "credit";
    if(status===429 && e && e.code==="insufficient_quota") return "credit";
  }
  return null;
}
function fail(code,detail){ var e=new Error(detail||code); e.code=code; return e; }

/* a failed response as a rejection: the body can name a cause the status does not (an old fake has no text()) */
function failed(res,pid){
  var status=res.status, got="";
  try{ got=res.text ? res.text() : ""; }catch(e){ got=""; }
  return Promise.resolve(got).then(function(text){
    var j; try{ j=JSON.parse(text); }catch(e){ j=null; }
    throw fail(bodyCode(pid,status,j) || httpCode(status), "HTTP "+status);
  },function(){
    throw fail(httpCode(status), "HTTP "+status);
  });
}

/* env: {fetch, setTimeout, clearTimeout}
   ask({provider, key, model, fallbackModel, messages, max, onText(piece, all), onModel(name), onSignal(s)}) -> Promise of
   the whole answer; .stop() ends it ("stopped"). provider is an id from PROVIDERS, missing means "openrouter"; model wins
   over fallbackModel, which wins over the provider's own default. s = {phase: "open" (the line is up, nothing written yet)
   | "think" | "write", think, text}: called once the response arrives and again for every piece, keep-alive comments
   included; think and text count characters.
   models({provider, key}) -> Promise of the provider's parsed model list (see models() below). */
function host(env){
  var later=env.setTimeout||setTimeout, unlater=env.clearTimeout||clearTimeout;
  function ask(o){
    var ctl=typeof AbortController==="function" ? new AbortController() : null, why=null, timer=0, all="", model="", think=0, sse=lines();
    var prov=provider(o.provider || "openrouter");
    var body={model:o.model || o.fallbackModel || (prov ? prov.model : MODEL), messages:o.messages, stream:true};
    if(o.max) body.max_tokens=o.max;
    function idle(){ unlater(timer); timer=later(function(){ why="timeout"; if(ctl) ctl.abort(); }, prov ? prov.idle || IDLE : IDLE); }
    function signal(){ if(o.onSignal) o.onSignal({phase:all ? "write" : think ? "think" : "open", think:think, text:all.length}); }
    var p=Promise.resolve().then(function(){
      if(!prov) throw fail("http","unknown provider");
      if(!o.key) throw fail("nokey");
      idle();
      return env.fetch(prov.url,{method:"POST", signal:ctl ? ctl.signal : undefined, credentials:"omit", referrerPolicy:"no-referrer", cache:"no-store",
        headers:{"Content-Type":"application/json", "Authorization":"Bearer "+o.key}, body:JSON.stringify(body)});
    }).then(function(res){
      if(!res.ok) return failed(res, prov.id);
      signal();
      if(!res.body || !res.body.getReader) return res.text().then(function(t){ take(t+"\n"); return all; });
      var rd=res.body.getReader(), dec=new TextDecoder();
      function pump(){
        return rd.read().then(function(r){
          if(r.done){ take(dec.decode()+"\n"); return all; }
          idle();
          var done=take(dec.decode(r.value,{stream:true}));
          signal();
          if(done){ try{ rd.cancel(); }catch(e){} return all; }
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
      /* ours carry a word; a DOMException's code is a number (an abort is 20) */
      if(e && typeof e.code==="string") throw e;
      throw fail(why || "offline", e && e.message);
    });
    /* one decoded piece: true once the stream said [DONE] */
    function take(text){
      var done=false;
      sse.push(text).forEach(function(d){
        if(d==="[DONE]"){ done=true; return; }
        var j; try{ j=JSON.parse(d); }catch(e){ return; }
        /* a provider reports a failure after the headers as an event with an error in it */
        if(j && j.error) throw fail(bodyCode(prov.id,+j.error.code||0,j) || httpCode(+j.error.code||0),j.error.message);
        if(j && j.model && !model){ model=j.model; if(o.onModel) o.onModel(model); }
        var c=j && j.choices && j.choices[0], delta=c && c.delta, piece=delta && delta.content,
          r1=delta && delta.reasoning, r2=delta && delta.reasoning_content;
        /* both names for the same thinking are counted, and neither is ever shown */
        if(typeof r1==="string") think+=r1.length;
        if(typeof r2==="string") think+=r2.length;
        if(typeof piece==="string" && piece){ all+=piece; if(o.onText) o.onText(piece,all); }
      });
      return done;
    }
    p.stop=function(){ why="stopped"; if(ctl) ctl.abort(); };
    return p;
  }
  /* models({provider, key}) -> Promise of the provider's model list, parsed from its own address. The key rides along
     only to the provider it belongs to; OpenRouter's list is public, so no key is sent there at all. */
  /* A list that has not arrived after LIST_MS is given up as "listtimeout" (issue #416): the picker then falls back to the
     list it keeps, and says why, instead of waiting on a request that may never answer. o.wait overrides it (tests). */
  function models(o){
    var prov=provider(o && o.provider), key=(o && o.key) || "", wait=(o && o.wait) || LIST_MS;
    var ctl=typeof AbortController==="function" ? new AbortController() : null, timer=0, gaveUp=false;
    var work=Promise.resolve().then(function(){
      if(!prov) throw fail("http","unknown provider");
      if(prov.id!=="openrouter" && !key) throw fail("nokey");
      var headers={};
      if(prov.id!=="openrouter") headers.Authorization="Bearer "+key;
      return env.fetch(prov.models,{method:"GET", signal:ctl ? ctl.signal : undefined, credentials:"omit", referrerPolicy:"no-referrer", cache:"no-store",
        headers:headers});
    }).then(function(res){
      if(!res.ok) throw fail(httpCode(res.status), "HTTP "+res.status);
      return res.json();
    },function(e){
      if(e && typeof e.code==="string") throw e;
      throw fail(gaveUp ? "listtimeout" : "offline", e && e.message);
    });
    var limit=new Promise(function(resolve,reject){
      timer=later(function(){ gaveUp=true; if(ctl) try{ ctl.abort(); }catch(e){} reject(fail("listtimeout")); },wait);
    });
    return Promise.race([work,limit]).then(function(v){ unlater(timer); return v; },function(e){ unlater(timer); throw e; });
  }
  return {ask:ask, models:models};
}

window.LopdaAI={host:host, lines:lines, httpCode:httpCode, bodyCode:bodyCode, URL:URL_CHAT, MODEL:MODEL, IDLE:IDLE, LIST_MS:LIST_MS,
  PROVIDERS:PROVIDERS, provider:provider};
})();
