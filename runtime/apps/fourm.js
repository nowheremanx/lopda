/*
 * Lo-PDA PoC built-in: 4d4y forum reader. It asks 4d4y for the forum page, parses the Discuz HTML
 * with DOMParser + querySelector, and shows forums, topics, and the first posts of a topic.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * The experiment: can a built-in (the one kind of app with network access) read 4d4y from the browser?
 * Every failure is shown, not hidden: URL, HTTP status when the browser exposes it, the browser's own
 * error, and a robots.txt probe that tells DNS/TLS/CORS failures apart from a blocked forum page.
 * The offline sample is a tiny synthetic Discuz page, always labelled as such; it is not live content.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, tr=LP.tr, show=LP.show, sfx=LP.sfx, noEmoji=LP.noEmoji;
var P=window.LopdaFourm;
var INDEX=P.INDEX_URL, FALLBACK=P.FALLBACK_URL, ROBOTS=P.BASE+"/robots.txt";

var ICON=[
"................",
"..000000000000..",
"..033333333330..",
"..030000000330..",
"..030333330330..",
"..030300030330..",
"..030300030330..",
"..030333330330..",
"..030000000330..",
"..033333333330..",
"..000000003300..",
"......00033000..",
".......033000...",
"........0000....",
"................",
"................"
];

var S={
  screen:"index",       // index | forum | thread
  home:null,            // the forum index data (cached for this visit)
  forum:null,           // {name, data} for one forumdisplay page
  thread:null,          // one parsed thread
  from:"index",         // where the open thread came from
  err:null,
  sample:false,
  busy:false,
  token:0
};

function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function btn(cls,text,fn){ var b=el("button",cls,text); b.type="button"; b.onclick=fn; return b; }
function txt(v){ return noEmoji(String(v==null?"":v)); }
function setTitle(t){ $("fm-title").textContent=txt(t)||"4d4y"; }
function setState(t){ $("fm-state").textContent=txt(t); }
function back(on){ $("fm-back").hidden=!on; }
function main(){ var m=$("fm-main"); m.textContent=""; return m; }
function msg(text){ return el("p","fm-msg",text); }
function label(text){ return el("p","fm-label",text); }
function found(n){ return tr("fourm.found",{n:n}); }

/* ---------- the offline sample: synthetic Discuz markup, never live content ---------- */
var SAMPLE_INDEX=[
'<div class="bm"><dl><dt><a href="forum.php?mod=forumdisplay&amp;fid=2">Discovery</a></dt>',
'<dd><a href="forum.php?mod=forumdisplay&amp;fid=6">Buy &amp; Sell</a></dd></dl></div>',
'<table id="threadlisttableid">',
'<tbody id="stickthread_90"><tr>',
'<td class="folder"><img src="images/pin.gif" alt=""></td>',
'<th class="subject"><span><a class="xst" href="forum.php?mod=viewthread&amp;tid=90">论坛置顶：发帖前请看版规</a></span></th>',
'<td class="author"><cite><a href="home.php?mod=space&amp;uid=1">admin</a></cite><em>2026-10-01</em></td>',
'<td class="nums"><strong>12</strong><em>900</em></td>',
'<td class="lastpost"><cite><a href="home.php?mod=space&amp;uid=2">bob</a></cite><em><a href="forum.php?mod=redirect&amp;goto=lastpost&amp;tid=90">2026-10-19 08:30</a></em></td>',
'</tr></tbody>',
'<tbody id="normalthread_101"><tr>',
'<th class="subject"><span><a class="xst" href="forum.php?mod=viewthread&amp;tid=101">今天收到一台老掌机，屏幕还能亮</a></span></th>',
'<td class="author"><cite><a href="home.php?mod=space&amp;uid=3">alice</a></cite><em>2026-10-19 09:00</em></td>',
'<td class="nums"><strong>5</strong><em>120</em></td>',
'<td class="lastpost"><cite><a href="home.php?mod=space&amp;uid=4">dave</a></cite><em><a href="forum.php?mod=redirect&amp;goto=lastpost&amp;tid=101">2026-10-19 10:15</a></em></td>',
'</tr></tbody></table>'
].join("");
var SAMPLE_THREAD=[
'<div id="threadtitle"><h1>今天收到一台老掌机，屏幕还能亮</h1></div>',
'<div id="postlist">',
'<div id="post_2001"><table><tbody><tr>',
'<td class="postauthor"><div class="postinfo"><a href="home.php?mod=space&amp;uid=3">alice</a></div>',
'<div class="authorinfo"><em>2026-10-19 09:00</em></div></td>',
'<td class="postcontent"><div class="postinfo"><strong><a href="forum.php?mod=viewthread&amp;tid=101&amp;pid=2001"><em>楼主</em></a></strong></div>',
'<div class="defaultpost"><div class="postmessage"><div class="t_msgfontfix"><table><tbody><tr><td class="t_msgfont">在旧货市场翻到一台 1986 年的掌机，电池仓有点锈。<br>装上两节电池，屏幕居然还能亮，四格电。<br><br>有人知道怎么清理按键吗？</td></tr></tbody></table></div></div></div>',
'</td></tr></tbody></table></div>',
'<div id="post_2002"><table><tbody><tr>',
'<td class="postauthor"><div class="postinfo"><a href="home.php?mod=space&amp;uid=4">dave</a></div>',
'<div class="authorinfo"><em>2026-10-19 10:15</em></div></td>',
'<td class="postcontent"><div class="postinfo"><strong><a href="forum.php?mod=viewthread&amp;tid=101&amp;pid=2002"><em>2#</em></a></strong></div>',
'<div class="defaultpost"><div class="postmessage"><div class="t_msgfontfix"><table><tbody><tr><td class="t_msgfont">先别用酒精，会伤印字。拆开用棉签蘸一点清水，晾干再装。</td></tr></tbody></table></div></div></div>',
'</td></tr></tbody></table></div>',
'</div>'
].join("");

/* ---------- network ---------- */
function fetchPage(url){
  var ctrl=window.AbortController?new AbortController():null;
  var opts={mode:"cors",credentials:"omit",referrerPolicy:"no-referrer",cache:"no-store",redirect:"follow"};
  if(ctrl) opts.signal=ctrl.signal;
  var timer=setTimeout(function(){ if(ctrl){ try{ ctrl.abort(); }catch(e){} } },15000);
  return fetch(url,opts)
    .then(function(r){ clearTimeout(timer); return r; },function(e){ clearTimeout(timer); throw e; })
    .then(function(r){
      var info={url:r.url||url,status:r.status,type:r.type,contentType:"",contentLength:""};
      try{ info.contentType=r.headers.get("content-type")||""; info.contentLength=r.headers.get("content-length")||""; }catch(e){}
      if(!r.ok){
        return r.text().then(function(t){
          if(P.isChallenge(t)) throw {kind:"CHALLENGE",url:info.url,status:r.status,bytes:t.length,headers:info,detail:"Cloudflare challenge page"};
          throw {kind:"HTTP",url:info.url,status:r.status,bytes:t.length,headers:info,detail:"HTTP "+r.status};
        },function(){
          throw {kind:"HTTP",url:info.url,status:r.status,headers:info,detail:"HTTP "+r.status};
        });
      }
      return r.text().then(function(text){
        if(P.isChallenge(text)) throw {kind:"CHALLENGE",url:info.url,status:r.status,bytes:text.length,headers:info,detail:"Cloudflare challenge page"};
        if(text.length>2*1024*1024) throw {kind:"PARSE",url:info.url,status:r.status,bytes:text.length,headers:info,detail:"response is larger than 2 MB"};
        return {text:text,url:info.url,status:r.status,bytes:text.length,headers:info};
      });
    }).catch(function(e){
      if(e && e.kind) throw e;
      if(e && e.name==="AbortError") throw {kind:"NETWORK",url:url,name:"Timeout",message:"request timed out after 15 s"};
      throw {kind:"NETWORK",url:url,name:(e&&e.name)||"Error",message:(e&&e.message)||String(e)};
    });
}
function fail(e,url){
  S.busy=false;
  S.err=(e && e.kind)?e:{kind:"RUNTIME",url:url,name:(e&&e.name)||"Error",message:(e&&e.message)||String(e)};
  S.err.at=Date.now();
  setState(errTitle(S.err));
  renderError(); sfx("err");
}

/* one page: connect, read, parse; the state line shows each stage */
function load(url,target,name,retried){
  if(S.busy) return;
  S.busy=true; S.err=null; S.sample=false; S.token++;
  var token=S.token;
  if(target==="forum"){ S.screen="forum"; setTitle(name||"4d4y"); back(true); }
  else { S.screen="index"; setTitle("4d4y"); back(false); }
  setState(tr("fourm.connecting")); renderLoading();
  fetchPage(url).then(function(res){
    if(token!==S.token) return;
    setState(tr("fourm.http",{status:res.status,kb:Math.max(1,Math.round(res.bytes/1024))}));
    renderLoading();
    setTimeout(function(){
      if(token!==S.token) return;
      try{
        setState(tr("fourm.parsing"));
        var doc=new DOMParser().parseFromString(res.text,"text/html");
        var data=P.parseIndex(doc,res.url);
        if(data.error && target==="index" && !retried){
          S.busy=false; load(FALLBACK,"index",null,true); return;
        }
        if(data.error) throw {kind:"PARSE",url:res.url,status:res.status,bytes:res.bytes,detail:data.error,stats:data.stats};
        S.busy=false;
        if(target==="forum"){ S.forum={name:name||"4d4y",data:data}; S.screen="forum"; setTitle(S.forum.name); back(true); }
        else { S.home=data; S.screen="index"; setTitle("4d4y"); back(false); }
        setState(found(data.topics.length));
        renderIndex(data);
      }catch(e){ fail(e,url); }
    },40);
  }).catch(function(e){ if(token!==S.token) return; fail(e,url); });
}

function renderLoading(){ var m=main(); m.appendChild(msg($("fm-state").textContent||tr("fourm.connecting"))); }

/* ---------- list ---------- */
function metaOf(t){
  var parts=[];
  if(t.author) parts.push(txt(t.author));
  if(t.timestamp) parts.push(txt(t.timestamp));
  if(t.replies) parts.push(tr("fourm.replies",{n:txt(t.replies)}));
  return parts.length?parts.join(" · "):tr("fourm.unknown");
}
function renderIndex(data){
  var m=main(), i;
  if(S.sample) m.appendChild(el("p","fm-banner",tr("fourm.sample")));
  if(data.forums && data.forums.length){
    m.appendChild(label(tr("fourm.forums")));
    for(i=0;i<data.forums.length;i++){
      (function(f){
        if(S.sample) m.appendChild(el("div","fm-forum",txt(f.name)));
        else m.appendChild(btn("fm-forum",txt(f.name),function(){ sfx("tap"); load(f.url,"forum",f.name); }));
      })(data.forums[i]);
    }
  }
  if(data.topics && data.topics.length){
    m.appendChild(label(tr("fourm.latest")));
    for(i=0;i<data.topics.length;i++){
      (function(t){
        var b=btn("fm-row","",function(){ sfx("tap"); openTopic(t); });
        b.appendChild(el("b","fm-row-t",txt(t.title)||tr("fourm.untitled")));
        b.appendChild(el("span","fm-row-m",metaOf(t)));
        if(t.sticky) b.appendChild(el("i","fm-pin",tr("fourm.sticky")));
        m.appendChild(b);
      })(data.topics[i]);
    }
  }
  if((!data.forums||!data.forums.length) && (!data.topics||!data.topics.length)) m.appendChild(msg(tr("fourm.empty")));
  if(data.stats) m.appendChild(el("p","fm-meta",tr("fourm.stats",{rows:data.stats.rows,forums:data.stats.forums,topics:data.stats.topics})));
}

/* ---------- one thread ---------- */
function openTopic(t){
  if(S.busy) return;
  if(S.sample){ openSampleThread(t); return; }
  S.busy=true; S.err=null; S.from=(S.screen==="forum")?"forum":"index"; S.screen="thread"; S.token++;
  var token=S.token;
  setTitle(t.title||tr("fourm.topic")); back(true); setState(tr("fourm.connecting")); renderLoading();
  fetchPage(t.url).then(function(res){
    if(token!==S.token) return;
    setState(tr("fourm.http",{status:res.status,kb:Math.max(1,Math.round(res.bytes/1024))}));
    renderLoading();
    setTimeout(function(){
      if(token!==S.token) return;
      try{
        setState(tr("fourm.parsing"));
        var doc=new DOMParser().parseFromString(res.text,"text/html");
        var data=P.parseThread(doc,res.url);
        if(data.error) throw {kind:"PARSE",url:res.url,status:res.status,bytes:res.bytes,detail:data.error+" · found "+data.stats.found+", kept "+data.stats.kept};
        if(!data.title) data.title=t.title;
        S.busy=false; S.thread=data; S.screen="thread";
        setTitle(data.title); back(true);
        setState(tr("fourm.posts",{n:data.posts.length}));
        renderThread(data);
      }catch(e){ fail(e,t.url); }
    },40);
  }).catch(function(e){ if(token!==S.token) return; fail(e,t.url); });
}
function renderThread(data){
  var m=main();
  if(S.sample) m.appendChild(el("p","fm-banner",tr("fourm.sample")));
  m.appendChild(el("h2","fm-thread-t",txt(data.title)||tr("fourm.topic")));
  m.appendChild(el("p","fm-thread-m",tr("fourm.posts",{n:data.posts.length})+(data.truncated?" · "+tr("fourm.firstonly"):"")));
  if(!data.posts.length){ m.appendChild(msg(tr("fourm.noposts"))); return; }
  for(var i=0;i<data.posts.length;i++){
    var p=data.posts[i], art=el("article","fm-post"), h=el("div","fm-post-h");
    h.appendChild(el("b","fm-post-a",txt(p.author)||tr("fourm.unknown")));
    h.appendChild(el("span","fm-post-t",txt(p.timestamp)||""));
    art.appendChild(h);
    art.appendChild(el("p","fm-post-c",txt(p.content)||tr("fourm.nocontent")));
    m.appendChild(art);
  }
  if(data.truncated) m.appendChild(el("p","fm-meta",tr("fourm.firstonly")));
}
function goBack(){
  sfx("tap");
  if(S.sample && S.screen==="thread" && S.home){
    S.token++; S.busy=false; S.screen="index"; setTitle("4d4y"); back(false);
    setState(found(S.home.topics.length)); renderIndex(S.home); return;
  }
  S.token++; S.busy=false; S.err=null; S.sample=false;
  if(S.screen==="thread" && S.from==="forum" && S.forum){
    S.screen="forum"; setTitle(S.forum.name); back(true); setState(found(S.forum.data.topics.length)); renderIndex(S.forum.data); return;
  }
  S.screen="index"; setTitle("4d4y"); back(false);
  if(S.home){ setState(found(S.home.topics.length)); renderIndex(S.home); }
  else load(INDEX,"index");
}

/* ---------- errors: show the real thing ---------- */
function errTitle(e){
  if(e.kind==="NETWORK") return tr("fourm.network");
  if(e.kind==="HTTP") return tr("fourm.httperr");
  if(e.kind==="CHALLENGE") return tr("fourm.challenge");
  if(e.kind==="PARSE") return tr("fourm.parseerr");
  return tr("fourm.runtimeerr");
}
function errType(e){
  if(e.kind==="NETWORK") return tr("fourm.type.network");
  if(e.kind==="HTTP") return "HTTP";
  if(e.kind==="CHALLENGE") return tr("fourm.type.challenge");
  if(e.kind==="PARSE") return tr("fourm.type.parse");
  return tr("fourm.type.runtime");
}
function errDetail(e){
  if(e.kind==="NETWORK") return (e.name||"Error")+": "+(e.message||"");
  if(e.kind==="HTTP") return e.detail||("HTTP "+e.status);
  if(e.kind==="CHALLENGE") return tr("fourm.challenge.detail");
  if(e.kind==="PARSE") return e.detail||"";
  return (e.name||"Error")+": "+(e.message||"");
}
function kv(k,v){
  var row=el("div","fm-kv");
  row.appendChild(el("span","",k));
  row.appendChild(el("b","",(v==null||v==="")?tr("fourm.na"):String(v)));
  return row;
}
function renderError(){
  var e=S.err; if(!e) return;
  var m=main(), box=el("div","fm-err");
  box.appendChild(el("h2","fm-err-t",errTitle(e)));
  box.appendChild(kv(tr("fourm.type"),errType(e)));
  box.appendChild(kv(tr("fourm.url"),e.url||""));
  box.appendChild(kv(tr("fourm.status"),e.status?String(e.status):tr("fourm.hidden")));
  if(e.bytes) box.appendChild(kv(tr("fourm.bytes"),Math.max(1,Math.round(e.bytes/1024))+" KB"));
  box.appendChild(kv(tr("fourm.detail"),errDetail(e)));
  if(e.headers && (e.headers.contentType || e.headers.contentLength))
    box.appendChild(kv(tr("fourm.headers"),(e.headers.contentType||"?")+(e.headers.contentLength?" · "+e.headers.contentLength+" B":"")));
  box.appendChild(el("p","fm-probe",e.kind==="NETWORK"?tr("fourm.probing"):tr("fourm.gotresponse")));
  box.querySelector(".fm-probe").id="fm-probe";
  if(e.kind==="NETWORK") box.appendChild(el("p","fm-meta",tr("fourm.neterr")));
  if(e.stats) box.appendChild(kv(tr("fourm.statslabel"),tr("fourm.stats",{rows:e.stats.rows||0,forums:e.stats.forums||0,topics:e.stats.topics||0})));
  box.appendChild(el("p","fm-meta",tr("fourm.context",{origin:location.origin,state:navigator.onLine?tr("fourm.online"):tr("fourm.offline")})));
  var actions=el("div","fm-actions");
  actions.appendChild(btn("btn",tr("fourm.retry"),function(){ sfx("tap"); retry(); }));
  actions.appendChild(btn("btn ghost",tr("fourm.samplebtn"),function(){ sfx("tap"); openSample(); }));
  box.appendChild(actions);
  m.appendChild(box);
  if(e.kind==="NETWORK") probeRobots();
}
/* the probe: a tiny request that is known to allow CORS. It separates "no network/DNS/TLS/CORS"
   from "the forum page itself was blocked or challenged". It never fetches forum content. */
function probeRobots(){
  var t0=Date.now();
  fetch(ROBOTS,{mode:"cors",credentials:"omit",referrerPolicy:"no-referrer",cache:"no-store"})
    .then(function(r){ var b=$("fm-probe"); if(b) b.textContent=tr("fourm.probeok",{status:r.status,ms:Date.now()-t0}); })
    .catch(function(e){ var b=$("fm-probe"); if(b) b.textContent=tr("fourm.probefail",{msg:(e&&e.message)||String(e)}); });
}
function retry(){
  S.token++; S.busy=false; S.err=null; S.sample=false; S.screen="index"; S.from="index"; S.thread=null;
  setTitle("4d4y"); back(false); load(INDEX,"index");
}

/* ---------- the labelled offline sample ---------- */
function parseSample(html){ return new DOMParser().parseFromString(html,"text/html"); }
function openSample(){
  S.token++; S.busy=false; S.err=null; S.sample=true; S.screen="index"; S.from="index"; S.thread=null; S.forum=null;
  setTitle("4d4y"); back(false);
  try{
    var data=P.parseIndex(parseSample(SAMPLE_INDEX));
    S.home=data; setState(found(data.topics.length)); renderIndex(data);
  }catch(e){ fail(e,"sample"); }
}
function openSampleThread(t){
  S.token++; S.busy=false; S.err=null; S.sample=true; S.screen="thread"; S.from="index";
  try{
    var data=P.parseThread(parseSample(SAMPLE_THREAD),t.url||"sample");
    if(!data.title) data.title=t.title;
    S.thread=data; setTitle(data.title); back(true); setState(tr("fourm.posts",{n:data.posts.length})); renderThread(data);
  }catch(e){ fail(e,"sample"); }
}

/* ---------- the built-in ---------- */
function openFourm(){
  if(S.sample){ S.home=null; S.forum=null; S.thread=null; }
  S.err=null; S.busy=false; S.sample=false; S.screen="index"; S.thread=null;
  show("4d4y");
  setTitle("4d4y"); back(false);
  if(S.home){ setState(found(S.home.topics.length)); renderIndex(S.home); }
  else load(INDEX,"index");
}
function leave(){ S.token++; S.busy=false; }
function redraw(){
  if($("v-4d4y").hidden) return;
  if(S.err){ setState(errTitle(S.err)); renderError(); }
  else if(S.screen==="thread" && S.thread) renderThread(S.thread);
  else if(S.screen==="forum" && S.forum) renderIndex(S.forum.data);
  else if(S.home) renderIndex(S.home);
}

$("fm-back").onclick=goBack;
LP.builtin({id:"4d4y", label:"app.fourm", icon:function(){ return ICON; }, view:"4d4y",
  open:openFourm, leave:leave, lang:redraw});
})();
