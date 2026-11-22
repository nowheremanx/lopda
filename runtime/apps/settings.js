/*
 * Lo-PDA built-in: settings. A short menu of volume, system sounds, language, system, permissions, the AI line, backup and restore,
 * sharing and about; the long parts have pages of their own.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, I18N=LP.I18N, tr=LP.tr;
var SND=LP.SND, RUNTIME_VERSION=LP.RUNTIME_VERSION, put=LP.put, sfx=LP.sfx, toast=LP.toast, show=LP.show, setLang=LP.setLang, renderUpdate=LP.renderUpdate;
var SCORE_PAGES=window.LopdaScorePages, SCORE_MODELS_URL="https://openrouter.ai/api/v1/models", SCORE_MODELS_PATH="data/users/local/ai-models", SCORE_MODELS_DAY=86400000;
/* the public site, not location.host: a PR preview or localhost must still share the real address */
var SHARE_URL="https://nowheremanx.github.io/lopda/";
var SHARE_TEXT=SHARE_URL.replace(/^https:\/\//,"").replace(/\/$/,"");

/* 12x12 pixel icons for the menu rows, the same string format as ICONS in core.js: 0-3 are the four tones, "." is clear */
var ROW_ICONS={
  volume:["............",".....0......","....00..0...","...000...0..","000000..0.0.","000000..0.0.","000000..0.0.","...000...0..","....00..0...",".....0......","............","............"],
  language:["............","...00000....","..0.....0...",".0.00000.0..",".0.0...0.0..",".0.00000.0..",".0.......0..","..0.....0...","...00000....",".....0......","....0.......","............"],
  system:["..0..0..0...",".000000000..",".0.......0..","00000000000.","0.0000000.0.","0.0.....0.0.","0.0.....0.0.","0.0000000.0.","00000000000.",".0.......0..",".000000000..","..0..0..0..."],
  permissions:["............","....0000....","...0....0...","...0....0...","..00000000..","..0......0..","..0..00..0..","..0..00..0..","..0......0..","..00000000..","............","............"],
  ai:["............","000000000000","0..........0","0..00..000.0","0.0..0..0..0","0.0000..0..0","0.0..0..0..0","0.0..0.000.0","0..........0","000000000000",".00.........",".0.........."],
  backup:["............","......0.....",".....000....","....00000...","......0.....","......0.....",".0000000000.",".0........0.",".0........0.",".0........0.",".0000000000.","............"],
  saves:["............","..00000000..","..0......0..","..0.0..0.0..","..0......0..","..0.0000.0..","..0......0..","..0......0..","..00000000..","...0....0...","..00000000..","............"],
  key:["............","..000.......",".0...0......",".0...0......","..000.......","....0000000.",".........0..",".........0..",".........00.","............","............","............"],
  sounds:["............","....0000....","...0....0...","...0....0...","..0......0..","..0......0..","..0......0..",".0........0.",".0........0.","000000000000","....0000....",".....00....."],
  share:["............","........000.","........000.",".......0....","......0.....",".000.0......",".0000.......",".000.0......","......0.....",".......0....","........000.","........000."],
  about:["....0000....","..00....00..",".0...00...0.",".0...00...0.","0..........0","0...000....0","0....00....0","0....00....0",".0...00...0.",".0..0000..0.","..00....00..","....0000...."]
};
function drawRowIcons(){
  [["set-vol-ico","volume"],["set-ui-ico","sounds"],["set-lang-ico","language"],["set-sys-ico","system"],["set-sense-ico","permissions"],
   ["set-ai-ico","ai"],["set-backup-ico","backup"],["set-saves-ico","saves"],["set-key-ico","key"],["set-share-ico","share"],["set-about-ico","about"]].forEach(function(p){
    var host=$(p[0]), rows=ROW_ICONS[p[1]];
    if(host && rows){ host.textContent=""; host.appendChild(LP.iconCanvas(rows)); }
  });
}
drawRowIcons();
$("set-share-url").textContent=SHARE_TEXT;

function renderSettings(){
  /* one control: five steps, the lowest is off */
  var max=LP.VOL_MAX;
  $("set-vol").textContent=SND.vol ? "▮".repeat(SND.vol)+"▯".repeat(max-SND.vol) : tr("set.off");
  $("set-vol-down").disabled=SND.vol<=0; $("set-vol-up").disabled=SND.vol>=max;
  /* the runtime's and the built-ins' clicks and prompts: off on its own, apps and games unchanged */
  $("set-ui").textContent=tr(SND.uiOn?"set.on":"set.off");
  $("set-ui").setAttribute("aria-pressed",SND.uiOn?"true":"false");
  $("set-version").textContent=tr("set.version",{v:RUNTIME_VERSION});
  Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"),function(b){
    var on=b.getAttribute("data-lang")===I18N.lang; b.className=on?"btn":"btn ghost"; b.setAttribute("aria-checked",on?"true":"false");
  });
}
/* the apps allowed tilt, the microphone, the camera or the word book (apps/store.js): one row each, revoked with a tap; the next start() asks again */
function renderSense(){
  var ul=$("set-sense-list"); ul.textContent="";
  var list=LP.sensorGrants ? LP.sensorGrants.list() : [];
  $("set-sense-state").textContent=list.length ? tr("set.sense.some",{n:list.length}) : tr("set.sense.zero");
  $("set-sense-note").hidden=!list.length;
  if(!list.length){ var e=document.createElement("li"); e.className="none"; e.textContent=tr("set.sense.none"); ul.appendChild(e); return; }
  list.forEach(function(g){
    var li=document.createElement("li"), t=document.createElement("span"), b=document.createElement("button");
    t.textContent=g.name+" · "+g.kinds.map(function(k){ return tr("set.sense."+k); }).join(tr("set.sense.and"));
    b.className="btn ghost"; b.type="button"; b.textContent=tr("set.sense.revoke"); b.setAttribute("data-app",g.id);
    b.onclick=function(){ LP.sensorGrants.revoke(g.id); renderSense(); sfx("ok"); };
    li.appendChild(t); li.appendChild(b); ul.appendChild(li);
  });
}
/* ---------- app saves (runtime/appsaves.js, apps/store.js; decisions.md section 43) ----------
   Removing an app keeps its save. This page is the one place that clears saves, installed or not;
   the script saves have their own page in the Scripts app. */
function sizeBytes(n){
  n=+n||0;
  if(n<1024) return n+" B";
  return (Math.round(n/102.4)/10)+" KB";
}
var savesSeq=0;
function renderSavesRow(){
  var el=$("set-saves-state"); if(!el) return;
  if(!LP.appSaves){ el.textContent=""; return; }
  el.textContent="…";
  LP.appSaves.list().then(function(list){
    var total=0;
    list.forEach(function(x){ total+=x.size||0; });
    el.textContent=list.length?tr("set.saves.state",{n:list.length,size:sizeBytes(total)}):tr("set.saves.none");
  },function(){ el.textContent=""; });
}
function renderSaves(){
  var seq=++savesSeq, ul=$("set-saves-list"), sum=$("set-saves-summary"), wrap=$("set-saves-all-wrap");
  if(!ul) return;
  ul.textContent=""; wrap.textContent=""; sum.textContent=tr("run.loading");
  if(!LP.appSaves){ sum.textContent=tr("saves.readfail"); return; }
  LP.appSaves.list().then(function(list){
    if(seq!==savesSeq) return;
    var total=0, orphans=0;
    list.forEach(function(x){ total+=x.size||0; if(!x.installed) orphans++; });
    sum.textContent=list.length?tr(orphans?"saves.summary":"saves.summaryall",{n:list.length,size:sizeBytes(total),m:orphans}):tr("saves.summarynone");
    if(!list.length){ var none=document.createElement("li"); none.className="none"; none.textContent=tr("saves.summarynone"); ul.appendChild(none); return; }
    list.forEach(function(x,i){
      var li=document.createElement("li"), t=document.createElement("span"), name=document.createElement("b"), tag=document.createElement("span"), meta=document.createElement("small");
      t.className="t"; name.textContent=x.name;
      tag.className="tag";
      tag.textContent=tr(x.bad==="corrupt"||x.bad==="readfail"?"saves.bad":x.bad==="newer"?"saves.newer":x.installed?"saves.installed":"saves.orphan");
      meta.textContent=tr("saves.size",{size:sizeBytes(x.size),when:x.updated?LP.fmt(x.updated):tr("saves.unknown")});
      t.appendChild(name); t.appendChild(tag); t.appendChild(meta); li.appendChild(t);
      var w=document.createElement("span"); w.id="set-saves-del-"+i; li.appendChild(w);
      ul.appendChild(li);
      LP.resetConfirm(w.id,"set-saves-del-btn-"+i,tr("saves.clear"),function(){
        LP.appSaves.clear(x.id).then(function(ok){
          if(ok){ toast(tr("saves.cleared")); sfx("ok"); renderSaves(); renderSavesRow(); }
          else { toast(tr("saves.clearfail")); sfx("err"); }
        },function(e){ toast(tr(e && e.code==="running"?"saves.running":"saves.clearfail")); sfx("err"); });
      });
    });
    LP.resetConfirm("set-saves-all-wrap","set-saves-all",tr("saves.clearall"),function(){
      LP.appSaves.clearAll().then(function(ok){
        toast(tr(ok?"saves.clearedall":"saves.clearallfail")); sfx(ok?"ok":"err"); renderSaves(); renderSavesRow();
      },function(e){ toast(tr(e && e.code==="running"?"saves.running":"saves.clearallfail")); sfx("err"); });
    });
  },function(){
    if(seq!==savesSeq) return;
    sum.textContent=tr("saves.readfail"); ul.textContent=""; wrap.textContent="";
  });
}

/* ---------- the AI lines (runtime/ai.js, runtime/ailines.js, decisions.md sections 34 and 61) ----------
   The user's keys, one line per key, like a phone's SIM cards, in one document of their own. A key never leaves this
   phone except in a request to its own provider: the document is kept out of the backup, and a restore leaves the one
   already here. Settings shows the last four characters only. LP.ai is what other programs use: on(use), ask(o),
   line(use), err(e, use), watch(fn); `use` is "scripts", "studio", "score" or "pet".
   Data safety: nothing is written to the document before it has been read. A read that fails (readFailed) or a document
   from a newer Lo-PDA (newer) blocks every write until a later read succeeds, so one new line can never erase the others. */
var AIP="data/users/local/ai", AL=window.LopdaAiLines, PROV=window.LopdaAI.PROVIDERS;
var AI={st:AL.load(null), loaded:false, readFailed:false, seen:[], lastTimer:0};
/* the screens' own state, never the document: which page is open, the line being edited, the use being chosen,
   the line page's last message, and the keyboard ring */
var AIPAGE="main", AILINE="", AIPROV="", AIUSE="", AILINEMSG="", AIDELARMED=false, AISCOREFROM="main";
var AIFOCUS=0, AIFOCUSABLES=[];
/* the line page's vision model as typed (or picked from the list for a model) before 保存, and the line it belongs to:
   a render must not throw an unsaved choice away, but opening another line must not keep it either */
var AIVM="", AIVMIN=null;
var SCORE_MODELS_CACHE=null, scoreModelPageOpen=false, scoreModelRows=[], scoreModelFocus=0, scoreModelSeq=0;
/* A saved key shows as dots in its field (a password field shows any value as dots): this stand-in, never the key itself.
   Tapping the field empties it for a new key; leaving it empty puts the dots back. */
var KEPT="lopda-key-kept!!";
var AIH=window.LopdaAI.host({fetch:function(u,o){ return fetch(u,o); }});
function aiChanged(){ renderAi(); AI.seen.forEach(function(f){ try{ f(); }catch(e){} }); }
function aiLang(){ return I18N.lang==="en" ? "en" : "zh"; }
function lineName(l){ return AL.name(l,PROV,aiLang()); }
/* a failure's words for one line: the name of the line that failed leads, the site is its own, never a whole key */
function aiErrLine(e,l){
  var p=l && window.LopdaAI.provider(l.provider);
  return tr("ai.err."+(e && e.code || "http"),{line:l ? lineName(l) : "AI", site:p ? p.site : ""});
}
function aiErr(e,use){ return aiErrLine(e,AL.pick(AI.st,use||"",PROV)); }
/* may the document be written now? Only after a good read of a document this runtime understands. */
function aiWritable(){ return !!(S.db && AI.loaded && !AI.readFailed && !AI.st.newer); }
function saveAiDoc(){ if(!aiWritable()) return false; put(S.db.doc(AIP),AL.toDoc(AI.st)); return true; }
/* (re)read the document; on success the state is replaced by what is stored, on failure every write stays blocked */
function readAi(){
  if(!S.db) return Promise.resolve();
  return S.db.doc(AIP).get().then(function(sn){
    AI.st=AL.load(sn.exists ? LP.own(sn.data()) : null);
    AI.loaded=true; AI.readFailed=false;
    aiChanged();
  },function(e){
    if(window.console) console.error("Lo-PDA: the AI lines could not be read", e);
    AI.readFailed=true; aiChanged();
  });
}
/* the result of the last real request on a line, for the line's status row: one write, a second after the last answer */
function noteLast(id,last){
  if(!aiWritable() || !AL.setLast(AI.st,id,last)) return;
  clearTimeout(AI.lastTimer);
  AI.lastTimer=setTimeout(function(){ saveAiDoc(); renderAi(); },1000);
}
/* the model the line page's field holds (an empty field means the default): the score list marks this row, and 保存
   writes whatever the field says. Nothing reads use.score any more: an old score model moved onto its OpenRouter line. */
function scoreModelId(){ var el=$("set-ai-vmodel"); return (el && el.value.trim()) || SCORE_PAGES.DEFAULT_MODEL; }
function scoreModelLabel(){ var id=scoreModelId(); return id===SCORE_PAGES.DEFAULT_MODEL ? tr("ai.score.default") : id; }
function cleanScoreModels(list){ return SCORE_PAGES.cleanModels(list); }
function savedScoreModels(data){
  if(!data || typeof data.at!=="number" || !Array.isArray(data.list)) return null;
  return {at:data.at, list:cleanScoreModels(data.list)};
}
function readScoreModelsCache(){
  if(SCORE_MODELS_CACHE) return Promise.resolve(SCORE_MODELS_CACHE);
  if(!S.db) return Promise.resolve(null);
  return S.db.doc(SCORE_MODELS_PATH).get().then(function(sn){
    var cache=sn.exists ? savedScoreModels(LP.own(sn.data())) : null;
    if(cache) SCORE_MODELS_CACHE=cache;
    return cache;
  },function(){ return null; });
}
function fetchScoreModels(){
  return fetch(SCORE_MODELS_URL,{method:"GET", credentials:"omit", referrerPolicy:"no-referrer", cache:"no-store"}).then(function(res){
    if(!res.ok) throw new Error("HTTP "+res.status);
    return res.json();
  }).then(function(payload){
    var list=SCORE_PAGES.models(payload), cache={at:Date.now(), list:cleanScoreModels(list)};
    SCORE_MODELS_CACHE=cache;
    if(S.db) S.db.doc(SCORE_MODELS_PATH).set(cache).catch(function(){});
    return list;
  });
}
function loadScoreModels(){
  return readScoreModelsCache().then(function(cache){
    if(cache && cache.at<=Date.now() && Date.now()-cache.at<SCORE_MODELS_DAY) return {list:cache.list, failed:false};
    return fetchScoreModels().then(function(list){ return {list:list, failed:false}; },function(){ return {list:cache ? cache.list : [], failed:true}; });
  });
}
function scoreModelChoiceRows(list){
  var models=cleanScoreModels(list), defaultModel=null, rows, current=scoreModelId(), found=current===SCORE_PAGES.DEFAULT_MODEL;
  models.forEach(function(m){ if(m.id===SCORE_PAGES.DEFAULT_MODEL) defaultModel=m; });
  rows=[{id:SCORE_PAGES.DEFAULT_MODEL, name:tr("ai.score.default"), in:defaultModel?defaultModel.in:null, out:defaultModel?defaultModel.out:null}];
  models.forEach(function(m){
    if(m.id===SCORE_PAGES.DEFAULT_MODEL) return;
    if(m.id===current) found=true;
    rows.push(m);
  });
  if(!found) rows.push({id:current, name:current, in:null, out:null});
  return rows;
}
function renderScoreModelList(list,status){
  var ul=$("set-ai-model-list"), current=scoreModelId();
  scoreModelRows=scoreModelChoiceRows(list); ul.textContent="";
  scoreModelRows.forEach(function(m,i){
    var li=document.createElement("li"), label=document.createElement("span"), price=document.createElement("small");
    li.setAttribute("role","button"); li.setAttribute("tabindex","0"); li.className=i===scoreModelFocus?"on":"";
    li.style.minHeight="44px"; li.style.boxSizing="border-box";
    label.textContent=m.name; price.textContent=SCORE_PAGES.formatModelPrice(m);
    li.appendChild(label); li.appendChild(price);
    li.onclick=function(){ scoreModelFocus=i; chooseScoreModel(m.id); };
    li.onfocus=function(){ scoreModelFocus=i; scoreModelFocusPaint(); };
    ul.appendChild(li);
    if(m.id===current) scoreModelFocus=i;
  });
  scoreModelFocusPaint();
  $("set-ai-model-status").textContent=status ? tr(status) : "";
}
function scoreModelFocusPaint(){
  var items=$("set-ai-model-list").children;
  Array.prototype.forEach.call(items,function(li,i){ li.classList.toggle("on",i===scoreModelFocus); });
}
function openScoreModelPage(){
  var seq=++scoreModelSeq; scoreModelPageOpen=true;
  AISCOREFROM=AIPAGE==="model" ? AISCOREFROM : AIPAGE;
  aiPage("model");
  renderScoreModelList([],"ai.score.loading");
  sfx("tap");
  loadScoreModels().then(function(result){
    if(!scoreModelPageOpen || seq!==scoreModelSeq) return;
    renderScoreModelList(result.list,result.failed?"ai.score.loadfail":"");
  });
}
/* the score model page's ◂ goes back where it was opened from (the OpenRouter line's page) */
function closeScoreModelPage(){
  if(!scoreModelPageOpen) return;
  var back=AISCOREFROM||"main";
  scoreModelPageOpen=false; scoreModelSeq++;
  aiPage(back); AISCOREFROM="main";
  renderAi(); sfx("tap");
}
/* leaving the whole AI page puts everything back to the lines list */
function resetScoreModelPage(){
  if(!scoreModelPageOpen) return;
  scoreModelPageOpen=false; scoreModelSeq++;
  aiPage("main"); AISCOREFROM="main";
}
/* choosing a model only fills the line page's 看图模型 field: nothing is written until 保存, so looking around can never
   change the document. The default row empties the field, which means "the provider's default". */
function chooseScoreModel(id){
  var el=$("set-ai-vmodel"), value=id===SCORE_PAGES.DEFAULT_MODEL ? "" : id;
  if(el) el.value=value;
  AIVM=value; AIVMIN=AILINE;
  var back=AISCOREFROM||"main";
  scoreModelPageOpen=false; scoreModelSeq++;
  aiPage(back); AISCOREFROM="main";
  renderAi(); sfx("ok");
}
$("set-ai-score-model").onclick=openScoreModelPage;
$("set-ai-model-back").onclick=closeScoreModelPage;
/* The model chooser is a normal settings list: arrows move its focus, A chooses, and B returns. */
document.addEventListener("keydown",function(e){
  if(!scoreModelPageOpen || $("v-set-ai").hidden || (e.target && /INPUT|TEXTAREA/.test(e.target.nodeName)) || e.defaultPrevented) return;
  var items=$("set-ai-model-list").children, key=e.key;
  if(key==="ArrowUp" || key==="ArrowLeft") scoreModelFocus=(scoreModelFocus+items.length-1)%items.length;
  else if(key==="ArrowDown" || key==="ArrowRight") scoreModelFocus=(scoreModelFocus+1)%items.length;
  else if(key==="x" || key==="X" || key==="Enter"){
    if(items[scoreModelFocus]) items[scoreModelFocus].click();
    e.preventDefault(); return;
  } else if(key==="z" || key==="Z" || key==="Escape"){
    closeScoreModelPage(); e.preventDefault(); return;
  } else return;
  if(items.length){ e.preventDefault(); scoreModelFocusPaint(); }
});
/* ---------- the lines' pages: the list, a provider, one line, one use (the score models have their page above) ---------- */
var AI_PAGE_IDS={main:"set-ai-main", add:"set-ai-add", line:"set-ai-line", use:"set-ai-use", model:"set-ai-model-page"};
/* exactly one sub-page of v-set-ai is visible at a time */
function aiPage(name){
  if(name!=="line") AIDELARMED=false;
  var k;
  for(k in AI_PAGE_IDS) if(Object.prototype.hasOwnProperty.call(AI_PAGE_IDS,k)){
    var el=$(AI_PAGE_IDS[k]); if(el) el.hidden=k!==name;
  }
  AIPAGE=name; AIFOCUS=0;
  /* each page starts at its top: the click that opened it may have scrolled the previous one */
  var view=$("v-set-ai"); if(view) view.scrollTop=0;
  if(name!=="line" && document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.nodeName)) document.activeElement.blur();
}
function curLine(){ return AILINE ? AL.find(AI.st,AILINE) : null; }
function lineProvider(l){ return l ? window.LopdaAI.provider(l.provider) : null; }
function aiFocusPaint(){
  for(var i=0;i<AIFOCUSABLES.length;i++) AIFOCUSABLES[i].classList.toggle("focus",i===AIFOCUS);
}
function aiSetFocus(list){
  AIFOCUSABLES=list;
  if(AIFOCUS>=list.length) AIFOCUS=0;
  aiFocusPaint();
}
function aiBackToMain(){
  AILINE=""; AIPROV=""; AILINEMSG="";
  aiPage("main"); renderAi(); sfx("tap");
}
function aiBack(){
  if(AIPAGE==="model"){ closeScoreModelPage(); return; }
  if(AIPAGE!=="main"){ aiBackToMain(); return; }
  sfx("tap"); openSettings();
}
/* the last real request's result, for a line's second row */
function aiLineStatus(l){
  if(!lineProvider(l)) return tr("ai.st.unknown");
  if(!l.on) return tr("ai.st.off");
  var last=l.last;
  if(last && last.ok) return tr("ai.st.ok",{at:LP.fmt(last.at)});
  if(last && last.code){
    var known={key:1,credit:1,busy:1,server:1,http:1,offline:1,timeout:1,empty:1};
    return tr("ai.st."+(known[last.code]?last.code:"http"));
  }
  return tr("ai.st.new");
}
/* the row in Settings: unreadable, a newer document, nothing on, the one line's name, or the count */
function aiRowText(){
  if(AI.readFailed) return tr("ai.row.readfail");
  if(AI.st.newer) return tr("ai.row.newer");
  var on=AL.onLines(AI.st);
  if(!on.length) return tr("ai.row.off");
  if(on.length===1) return lineName(on[0])+" ›";
  return tr("ai.row.n",{n:on.length});
}
/* the switch changes the line only: tapping it never opens the line's page */
function toggleAiLine(id,on){
  if(!aiWritable()){ renderAi(); sfx("err"); return; }
  AL.setOn(AI.st,id,on); saveAiDoc(); aiChanged(); sfx("ok");
}
function openAiLine(id){
  if(document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.nodeName)) document.activeElement.blur();
  AILINE=id; AIPROV=""; AILINEMSG=""; AIDELARMED=false; AIVMIN=null;
  aiPage("line"); renderAi(); sfx("tap");
}
/* a new line: nothing is added until 保存 */
function openAiProvider(id){
  var p=window.LopdaAI.provider(id); if(!p) return;
  if(document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.nodeName)) document.activeElement.blur();
  AILINE=""; AIPROV=id; AILINEMSG=""; AIDELARMED=false; AIVMIN=null;
  aiPage("line"); renderAi(); sfx("tap");
}
function openAiUse(use){ AIUSE=use; aiPage("use"); renderAi(); sfx("tap"); }

function renderAiMain(){
  var bad=AI.readFailed ? "ai.readfail" : AI.st.newer ? "ai.newer" : "";
  $("set-ai-state").textContent=bad ? tr(bad) : AI.st.lines.length ? "" : tr("ai.off");
  var ul=$("set-ai-lines"), focus=[];
  ul.textContent="";
  AI.st.lines.forEach(function(l){
    var li=document.createElement("li");
    li.setAttribute("role","button"); li.setAttribute("tabindex","0");
    var top=document.createElement("div"); top.className="set-ai-top";
    var mark=document.createElement("span"); mark.className="set-ai-mark"; mark.setAttribute("aria-hidden","true");
    mark.textContent=l.on ? "▣" : "□";
    var name=document.createElement("span"); name.className="set-ai-name"; name.textContent=lineName(l);
    var key=document.createElement("span"); key.className="set-ai-key"; key.textContent=l.key ? "…"+l.key.slice(-4) : "";
    var sw=document.createElement("button"); sw.type="button"; sw.className="set-ai-sw"; sw.setAttribute("role","switch");
    sw.setAttribute("aria-checked",l.on ? "true" : "false"); sw.textContent=tr(l.on ? "ai.sw.on" : "ai.sw.off");
    sw.disabled=!lineProvider(l);
    sw.onclick=function(ev){ if(ev && ev.stopPropagation) ev.stopPropagation(); toggleAiLine(l.id,!l.on); };
    top.appendChild(mark); top.appendChild(name); top.appendChild(key); top.appendChild(sw);
    var st=document.createElement("small"); st.className="set-ai-status"; st.textContent=aiLineStatus(l);
    li.appendChild(top); li.appendChild(st);
    li.onclick=function(){ openAiLine(l.id); };
    ul.appendChild(li); focus.push(li);
  });
  focus.push($("set-ai-add-open"));
  var on=AL.onLines(AI.st), uses=$("set-ai-uses");
  uses.hidden=on.length<2;
  if(on.length>=2){
    var def=AL.find(AI.st,AI.st.def);
    $("set-ai-def-value").textContent=(def ? lineName(def) : "")+" ›";
    focus.push($("set-ai-def"));
    var ulu=$("set-ai-use-links"); ulu.textContent="";
    AL.USES.forEach(function(u){
      var li=document.createElement("li"); li.className="set-ai-use";
      li.setAttribute("role","button"); li.setAttribute("tabindex","0"); li.setAttribute("data-use",u);
      var label=document.createElement("span"); label.className="set-ai-name"; label.textContent=tr("ai.use."+u);
      var chosen=AI.st.use[u] && AL.find(AI.st,AI.st.use[u].line);
      var value=document.createElement("span"); value.className="set-ai-value";
      value.textContent=(chosen && chosen.on ? lineName(chosen) : tr("ai.use.default"))+" ›";
      li.appendChild(label); li.appendChild(value);
      li.onclick=function(){ openAiUse(u); };
      ulu.appendChild(li); focus.push(li);
    });
  } else $("set-ai-use-links").textContent="";
  return focus;
}

function renderAiAdd(){
  var ul=$("set-ai-providers"), focus=[];
  ul.textContent="";
  PROV.forEach(function(p){
    var li=document.createElement("li");
    li.setAttribute("role","button"); li.setAttribute("tabindex","0"); li.setAttribute("data-provider",p.id);
    var name=document.createElement("span"); name.className="set-ai-name"; name.textContent=p.name[aiLang()] || p.name.en;
    var d=document.createElement("small"); d.className="set-ai-status"; d.textContent=tr("ai.prov."+p.id);
    li.appendChild(name); li.appendChild(d);
    li.onclick=function(){ openAiProvider(p.id); };
    ul.appendChild(li); focus.push(li);
  });
  return focus;
}

function renderAiLine(){
  var l=curLine(), prov=l ? lineProvider(l) : (AIPROV ? window.LopdaAI.provider(AIPROV) : null);
  $("set-ai-line-title").textContent=l ? lineName(l) : (prov ? (prov.name[aiLang()] || prov.name.en) : "");
  $("set-ai-key").placeholder=(l && l.key) ? tr("ai.key.saved",{key:l.key.slice(-4)}) : tr("ai.key.ph");
  if(document.activeElement!==$("set-ai-key")) $("set-ai-key").value=(l && l.key) ? KEPT : "";
  if(document.activeElement!==$("set-ai-model")) $("set-ai-model").value=l ? l.model : "";
  $("set-ai-model").placeholder=prov ? prov.model : "";
  $("set-ai-model-hint").textContent=!prov ? "" : (prov.id==="openrouter" ? tr("ai.model.hint") : tr("ai.model.def",{model:prov.model}));
  /* a line that cannot see has no pictures to read: no field, no OpenRouter list. Only OpenRouter picks from its list. */
  var seeing=!!(prov && prov.vision);
  $("set-ai-vmodel-row").hidden=!seeing;
  $("set-ai-vmodel-hint").hidden=!seeing;
  if(AIVMIN!==AILINE){ AIVMIN=AILINE; AIVM=l ? l.visionModel : ""; }
  if(document.activeElement!==$("set-ai-vmodel")) $("set-ai-vmodel").value=AIVM;
  $("set-ai-vmodel").placeholder=prov ? (prov.id==="openrouter" ? SCORE_PAGES.DEFAULT_MODEL : prov.visionModel) : "";
  $("set-ai-score-model").hidden=!(seeing && prov.id==="openrouter");
  $("set-ai-line-state").textContent=AILINEMSG;
  $("set-ai-test").hidden=!l; $("set-ai-del").hidden=!l;
  $("set-ai-del").textContent=tr(AIDELARMED ? "ai.del.sure" : "ai.del");
  var focus=[$("set-ai-save")];
  if(l){ focus.push($("set-ai-test")); focus.push($("set-ai-del")); }
  if(seeing) focus.push($("set-ai-vmodel"));
  if(!$("set-ai-score-model").hidden) focus.push($("set-ai-score-model"));
  return focus;
}

function aiUseRow(labelText,secondText,disabled,current,go,extra){
  var li=document.createElement("li");
  li.setAttribute("role","radio"); li.setAttribute("tabindex","0");
  li.setAttribute("aria-checked",current ? "true" : "false");
  if(disabled){ li.setAttribute("aria-disabled","true"); li.className="off"; }
  else if(current) li.className="on";
  if(extra) li.className+=(li.className ? " " : "")+extra;
  var top=document.createElement("div"); top.className="set-ai-top";
  var name=document.createElement("span"); name.className="set-ai-name"; name.textContent=labelText;
  top.appendChild(name); li.appendChild(top);
  if(secondText){ var st=document.createElement("small"); st.className="set-ai-status"; st.textContent=secondText; li.appendChild(st); }
  li.onclick=function(){ if(disabled){ sfx("err"); return; } go(); };
  return li;
}
function renderAiUse(){
  var use=AIUSE;
  $("set-ai-use-title").textContent=use==="def" ? tr("ai.def") : tr("ai.use."+use);
  var ul=$("set-ai-use-list"), focus=[], on=AL.onLines(AI.st);
  ul.textContent="";
  var chosen=use==="def" ? AI.st.def : (AI.st.use[use] && AI.st.use[use].line || "");
  var chosenLine=chosen ? AL.find(AI.st,chosen) : null;
  var chosenProv=chosenLine ? lineProvider(chosenLine) : null;
  var valid=!!(chosenLine && chosenLine.on && (use!=="score" || (chosenProv && chosenProv.vision)));
  if(use!=="def"){
    var d=aiUseRow(tr("ai.use.followdef"),"",false,!valid,function(){ chooseUseLine(""); },"set-ai-follow");
    ul.appendChild(d); focus.push(d);
  }
  on.forEach(function(l){
    var p=lineProvider(l), dis=use==="score" && !(p && p.vision);
    var li=aiUseRow(lineName(l), dis ? tr("ai.novision") : "", dis, valid && !dis && l.id===chosen,
      function(){ chooseUseLine(l.id); });
    ul.appendChild(li); focus.push(li);
  });
  /* the ring starts on the choice, as in the score model list, not on the first row */
  if(AIPAGE==="use" && focus.length){
    var at=0;
    for(var i=0;i<focus.length;i++) if(focus[i].classList.contains("on")){ at=i; break; }
    AIFOCUS=at;
  }
  return focus;
}
function chooseUseLine(id){
  if(!aiWritable()){ renderAi(); sfx("err"); return; }
  if(AIUSE==="def") AL.setDef(AI.st,id);
  else AL.choose(AI.st,AIUSE,id);
  saveAiDoc();
  aiPage("main"); aiChanged(); sfx("ok");
}

/* redraws every sub-page from AI.st, so whichever one is open is current after any change; msg is the line page's status */
function renderAi(msg){
  if(typeof msg==="string") AILINEMSG=msg;
  var focus={main:renderAiMain(), add:renderAiAdd(), line:renderAiLine(), use:renderAiUse()};
  $("set-ai-open").textContent=aiRowText();
  $("set-ai-score-model-value").textContent=scoreModelLabel()+" ›";
  if(AIPAGE!=="model") aiSetFocus(focus[AIPAGE] || []);
}
/* a read that failed is tried again whenever the page opens; it always opens on the list */
$("set-ai-row").onclick=function(){
  sfx("tap"); AILINE=""; AIPROV=""; AIUSE=""; AILINEMSG=""; AIDELARMED=false;
  aiPage("main"); show("set-ai"); if(AI.readFailed) readAi(); renderAi();
};
$("set-ai-back").onclick=function(){ resetScoreModelPage(); sfx("tap"); openSettings(); };
$("set-ai-add-open").onclick=function(){ aiPage("add"); renderAi(); sfx("tap"); };
$("set-ai-add-back").onclick=aiBackToMain;
$("set-ai-line-back").onclick=aiBackToMain;
$("set-ai-use-back").onclick=aiBackToMain;
$("set-ai-def").onclick=function(){ openAiUse("def"); };

function saveAi(){
  if(!aiWritable()){ renderAi(); sfx("err"); return; }
  var v=$("set-ai-key").value.trim(), key=v===KEPT ? "" : v, model=$("set-ai-model").value.trim(), l=curLine();
  var prov=l ? lineProvider(l) : (AIPROV ? window.LopdaAI.provider(AIPROV) : null);
  /* a blind provider has no field to read: leave whatever an older line carries alone */
  var vmodel=prov && prov.vision ? $("set-ai-vmodel").value.trim() : undefined;
  if(l){
    AL.edit(AI.st,l.id,key,model,vmodel); saveAiDoc(); AILINEMSG="";
    AIVM=l.visionModel || ""; AIVMIN=l.id;
    $("set-ai-key").blur(); aiChanged(); sfx("ok"); return;
  }
  if(!prov){ renderAi(); sfx("err"); return; }
  if(!key){ renderAi(tr("ai.nokey")); sfx("err"); return; }
  l=AL.add(AI.st,prov.id,key,model,Date.now(),vmodel || "");
  AILINE=l.id; AIPROV=""; AILINEMSG=""; AIVM=l.visionModel || ""; AIVMIN=l.id;
  $("set-ai-key").blur();
  saveAiDoc();
  aiChanged(); sfx("ok");
  /* a new line is tried on the spot: a failure still keeps it, with the reason in its status line */
  runAiTest();
}
$("set-ai-save").onclick=saveAi;
$("set-ai-key").addEventListener("focus",function(){ if(this.value===KEPT) this.value=""; });
$("set-ai-key").addEventListener("blur",function(){ var l=curLine(); if(!this.value && l && l.key) this.value=KEPT; });
/* what is typed stays a draft until 保存, even when the line's status redraws the page; the pick row follows it */
$("set-ai-vmodel").addEventListener("input",function(){
  AIVM=this.value; AIVMIN=AILINE;
  $("set-ai-score-model-value").textContent=scoreModelLabel()+" ›";
});
function runAiTest(){
  var b=$("set-ai-test"), l=curLine();
  if(!l || b.disabled) return;
  b.disabled=true; renderAi(tr("ai.testing")); sfx("tap");
  var used="", prov=lineProvider(l), id=l.id;
  askLine(l,{messages:[{role:"user", content:"Reply with the single word OK."}], max:16, onModel:function(m){ used=m; }},l.model).then(function(t){
    if(AILINE===id){ AILINEMSG=tr("ai.tested",{text:t.trim().slice(0,40), model:used || l.model || (prov ? prov.model : window.LopdaAI.MODEL)}); renderAi(); }
    sfx("ok");
  },function(e){
    if(AILINE===id){ AILINEMSG=aiErrLine(e,l); renderAi(); }
    sfx("err");
  }).then(function(){ b.disabled=false; });
}
$("set-ai-test").onclick=runAiTest;
/* deleting a line removes its key (the score-model choice stays); two presses, and leaving the page forgets the first */
function deleteAiLine(){
  if(!aiWritable()){ renderAi(); sfx("err"); return; }
  var l=curLine(); if(!l) return;
  if(!AIDELARMED){ AIDELARMED=true; renderAi(); sfx("tap"); return; }
  AL.remove(AI.st,l.id); saveAiDoc();
  AIDELARMED=false; AILINE=""; AIPROV=""; AILINEMSG="";
  aiPage("main"); aiChanged(); sfx("ok");
}
$("set-ai-del").onclick=deleteAiLine;
/* the pages' keys, like the score model list: arrows move the ring, A/Enter chooses, B/Escape goes back */
document.addEventListener("keydown",function(e){
  if($("v-set-ai").hidden || AIPAGE==="model") return;
  var t=e.target || {};
  if(/^(INPUT|TEXTAREA)$/.test(t.nodeName)){
    if(e.key==="Escape"){ t.blur(); e.preventDefault(); }
    return;
  }
  if(e.defaultPrevented) return;
  var items=AIFOCUSABLES, key=e.key, n=items.length;
  if(key==="ArrowUp" || key==="ArrowLeft"){
    if(!n) return;
    AIFOCUS=(AIFOCUS+n-1)%n; aiFocusPaint(); e.preventDefault();
  } else if(key==="ArrowDown" || key==="ArrowRight"){
    if(!n) return;
    AIFOCUS=(AIFOCUS+1)%n; aiFocusPaint(); e.preventDefault();
  } else if(key==="x" || key==="X" || key==="Enter"){
    if(items[AIFOCUS]) items[AIFOCUS].click();
    e.preventDefault();
  } else if(key==="z" || key==="Z" || key==="Escape"){
    aiBack(); e.preventDefault();
  }
});
/* one request down one line: the key goes only to that line's own provider (ai.js looks the address up in its table) */
function askLine(l,o,model){
  var q={}, k;
  for(k in o) if(k!=="use" && k!=="key" && k!=="provider" && k!=="url") q[k]=o[k];
  q.provider=l.provider; q.key=l.key; q.model=o.model || model;
  var p=AIH.ask(q), id=l.id;
  p.then(function(){ noteLast(id,{ok:true, at:Date.now()}); },function(e){
    var c=e && e.code;
    if(c && c!=="stopped" && c!=="nokey") noteLast(id,{ok:false, code:c, at:Date.now()});
  });
  return p;
}
LP.ai={
  PATH:AIP,
  /* is there a line this program can use? ("score" needs one that can see) */
  on:function(use){ return !!AL.pick(AI.st,use||"",PROV); },
  /* o: {use, messages, max, onText, onModel, onSignal, model}; the line, its key, provider and model are added here */
  ask:function(o){
    var use=o && o.use || "", l=AL.pick(AI.st,use,PROV);
    if(!l) return AIH.ask({key:"", messages:[]});
    return askLine(l,o,AL.modelFor(AI.st,use,l,PROV,SCORE_PAGES.DEFAULT_MODEL));
  },
  /* the line a program would use, for its status line and messages: never the key */
  line:function(use){
    var l=AL.pick(AI.st,use||"",PROV), p=l && window.LopdaAI.provider(l.provider);
    return l ? {id:l.id, name:lineName(l), provider:l.provider, vision:!!(p && p.vision)} : null;
  },
  /* the model Tape4's score reading would use: the picked line's vision model, else the default */
  scoreModel:function(){ var l=AL.pick(AI.st,"score",PROV); return l ? AL.modelFor(AI.st,"score",l,PROV,SCORE_PAGES.DEFAULT_MODEL) : SCORE_PAGES.DEFAULT_MODEL; },
  err:aiErr,
  watch:function(f){ AI.seen.push(f); },
  /* the whole document as it should be stored, or null when there is nothing in it */
  saved:function(){ return AI.loaded && (AI.st.lines.length || Object.keys(AI.st.use).length) ? AL.toDoc(AI.st) : null; },
  /* for the tests */
  _test:{state:function(){ return {st:AI.st, loaded:AI.loaded, readFailed:AI.readFailed}; }, reread:readAi}
};

/* ---------- the darkroom key (runtime/geotag.js, decisions.md section 40) ----------
   The random 128-bit key that seals each negative's place. Only this handheld's darkroom prints can open what it
   sealed, and whoever holds the key reads every negative's place: so the key stays inside the runtime, never through
   PAD, pad-shim, the sandboxed app iframe or any postMessage. The ring is one document of the user's own; the camera's
   place switch makes the first key (ensure), and a restore only ever adds keys to it. */
var DKP="data/users/local/darkroom-key", DK={text:"", count:0, shown:false};
var DKPENDING=null, G=window.LopdaGeotag;
/* read the document fresh every time: a restore may have replaced it since the page opened */
function keyDoc(){
  if(!S.db) return Promise.reject({code:"unavailable"});
  return S.db.doc(DKP).get().then(function(sn){
    return sn.exists ? G.cleanRing(LP.own(sn.data())) : null;
  });
}
function docKey(doc){
  if(!doc) return null;
  for(var i=0;i<doc.keys.length;i++) if(doc.keys[i].id===doc.current) return G.fromHex(doc.keys[i].key);
  return null;
}
/* current first, then the rest in the order stored (the one old negatives still need may be any of them) */
function ringList(doc){
  var out=[], i, k, e;
  if(!doc) return out;
  for(i=0;i<doc.keys.length;i++){
    k=doc.keys[i];
    e={id:k.id, bytes:G.fromHex(k.key)};
    if(k.id===doc.current) out.unshift(e); else out.push(e);
  }
  return out;
}
function ensureKey(){
  if(DKPENDING) return DKPENDING;
  DKPENDING=keyDoc().then(function(doc){
    var have=docKey(doc);
    if(have) return have;
    var bytes=new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return G.keyId(crypto.subtle,bytes).then(function(id){
      var d={keys:[{id:id, key:G.toHex(bytes), added:Date.now()}], current:id};
      return S.db.doc(DKP).set(d).then(function(){ return bytes; });
    });
  });
  DKPENDING.then(function(){ DKPENDING=null; },function(){ DKPENDING=null; });
  return DKPENDING;
}
LP.darkroomKey={
  current:function(){ return keyDoc().then(docKey); },
  ensure:ensureKey,
  ring:function(){ return keyDoc().then(ringList); },
  add:function(text){
    var bytes=G.parseKey(text);
    if(!bytes) return Promise.resolve("bad");
    return G.keyId(crypto.subtle,bytes).then(function(id){
      var hex=G.toHex(bytes);
      return keyDoc().then(function(doc){
        var keys=doc ? doc.keys.slice() : [], i, found=false;
        for(i=0;i<keys.length;i++){
          if(keys[i].id!==id) continue;
          found=true; keys[i]={id:id, key:hex, added:keys[i].added || Date.now()};
        }
        if(!found) keys.push({id:id, key:hex, added:Date.now()});
        return S.db.doc(DKP).set({keys:keys, current:id}).then(function(){ return found ? "same" : "added"; });
      });
    });
  },
  info:function(){
    return keyDoc().then(function(doc){
      var bytes=docKey(doc);
      return bytes ? {text:G.keyText(bytes), count:doc.keys.length} : null;
    });
  }
};
function keyMask(text){ return "••••-••••-…-"+text.slice(-4); }
function paintKey(){
  var on=!!DK.text;
  $("set-key-state").textContent=on ? (DK.shown ? DK.text : keyMask(DK.text)) : tr("key.none");
  $("set-key-show").textContent=tr(DK.shown ? "key.hide" : "key.show");
  $("set-key-show-row").hidden=!on;
  $("set-key-old").hidden=!(on && DK.count>1);
  if(on && DK.count>1) $("set-key-old").textContent=tr("key.old",{n:DK.count-1});
}
function loadKey(){
  return LP.darkroomKey.info().then(function(i){
    DK.text=i ? i.text : ""; DK.count=i ? i.count : 0; DK.shown=false; paintKey();
  },function(){ DK.text=""; DK.count=0; DK.shown=false; paintKey(); });
}
function selectKeyText(){
  var el=$("set-key-state"), sel=window.getSelection && window.getSelection();
  if(!el || !sel) return;
  var r=document.createRange(); r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
}
$("set-key-open").onclick=function(){ sfx("tap"); show("set-key"); };
$("set-key-back").onclick=function(){ sfx("tap"); openSettings(); };
$("set-key-show").onclick=function(){ DK.shown=!DK.shown; paintKey(); sfx("tap"); };
/* the clipboard needs a real click, never pointerdown (CLAUDE.md); the fallback shows the key so it can be selected */
$("set-key-copy").onclick=function(){
  if(!DK.text) return;
  var p=null;
  try{ if(navigator.clipboard && navigator.clipboard.writeText) p=navigator.clipboard.writeText(DK.text); }catch(e){ p=null; }
  if(!p){ DK.shown=true; paintKey(); selectKeyText(); toast(tr("key.copy.manual")); sfx("err"); return; }
  p.then(function(){ toast(tr("set.share.copied")); sfx("ok"); },function(){
    DK.shown=true; paintKey(); selectKeyText(); toast(tr("key.copy.manual")); sfx("err");
  });
};
function useKey(){
  var b=$("set-key-use"), input=$("set-key-input");
  if(b.disabled) return;
  b.disabled=true;
  LP.darkroomKey.add(input.value).then(function(r){
    if(r!=="added" && r!=="same"){ $("set-key-result").textContent=tr("key.bad"); sfx("err"); return; }
    input.value="";
    $("set-key-result").textContent=tr(r==="added" ? "key.added" : "key.same");
    sfx("ok");
    return loadKey();
  },function(){ $("set-key-result").textContent=tr("key.bad"); sfx("err"); }).then(function(){ b.disabled=false; });
}
$("set-key-use").onclick=useKey;
$("set-key-input").addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); useKey(); } });
LP.builtin({id:"set-key", view:"set-key",
  enter:function(){ loadKey(); },
  lang:function(){ loadKey(); },
  /* the key text is shown only while the page is open */
  leave:function(){ DK.shown=false; if(DK.text) paintKey(); $("set-key-input").value=""; $("set-key-result").textContent=""; }
});

/* `sound` is still written for runtimes before 0.12.0, which had a separate switch */
function saveSettings(){
  renderSettings();
  if(S.db){
    var data={sound:SND.vol>0, volume:SND.vol, ui:SND.uiOn, lang:I18N.lang};
    if(S.homeTipDismissed) data.homeTipDismissed=true;
    put(S.refs.settings,data);
  }
}
Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"),function(b){
  b.onclick=function(){ setLang(b.getAttribute("data-lang")); saveSettings(); sfx("ok"); };
});
function setVol(v){ SND.vol=v; LP.applyLevel(); saveSettings(); sfx("tap"); }
$("set-vol-down").onclick=function(){ if(SND.vol>0) setVol(SND.vol-1); };
$("set-vol-up").onclick=function(){ if(SND.vol<LP.VOL_MAX) setVol(SND.vol+1); };
/* turning the clicks off is itself silent, like a real volume control; turning them back on gives the click */
$("set-ui").onclick=function(){ SND.uiOn=!SND.uiOn; LP.applyLevel(); saveSettings(); sfx("tap"); };

/* ---------- the whole-device backup and restore (decisions.md section 24) ----------
   Backup: dump both databases, pack them (backup.js), show the size, save the zip from the tap on 保存.
   Restore: read and check the whole file first; only a backup that passes every check is offered, twice; then the current
   data is kept in memory, the backup written over it, and written back if any write fails. Success restarts the runtime. */
var P=window.LopdaPlatform, BK=window.LopdaBackup, ZIP=window.LopdaZip, DAY=86400000, BIG=200*1024*1024;
var BMETA="data/users/local/backup-meta";
var BS={last:0, busy:false, backup:null, file:null};
function sizeText(bytes){
  var kb=Math.max(1,Math.round((bytes||0)/1024));
  return kb<1024 ? kb+" KB" : kb<10240 ? (kb/1024).toFixed(1)+" MB" : Math.round(kb/1024)+" MB";
}
function renderLast(){
  var t=BS.last, n=Math.floor((Date.now()-t)/DAY);
  $("set-backup-last").textContent=!t ? tr("bk.never") : n<1 ? tr("bk.today") : tr("bk.days",{n:n});
  $("set-backup-state").textContent=!t ? tr("bk.row.never") : n<1 ? tr("bk.row.today") : tr("bk.row.days",{n:n});
}
/* the dialog under the 全部数据 row: a message, a warning line, buttons [{label, go, main}] (a click: the release of a tap) */
function box(msg,buttons,warn){
  $("set-backup-box").hidden=false;
  $("set-backup-msg").textContent=msg;
  $("set-backup-warn").hidden=!warn; $("set-backup-warn").textContent=warn||"";
  var row=$("set-backup-btns"); row.textContent="";
  (buttons||[]).forEach(function(bt){
    var b=document.createElement("button"); b.type="button"; b.className=bt.main?"btn":"btn ghost"; b.textContent=bt.label;
    b.onclick=bt.go; row.appendChild(b);
  });
  $("set-backup-go").disabled=$("set-restore-go").disabled=BS.busy;
  var el=$("set-backup-box"); if(el.scrollIntoView) el.scrollIntoView({block:"nearest"});
}
function closeBox(){ BS.busy=false; BS.backup=null; BS.file=null; $("set-backup-box").hidden=true; $("set-backup-go").disabled=$("set-restore-go").disabled=false; }
function okBox(msg,then){ BS.busy=false; box(msg,[{label:tr("bk.ok"), main:true, go:function(){ sfx("tap"); (then||closeBox)(); }}]); }

/* a backup of `dump` (the current data unless given); `after` runs once it is saved or cancelled */
function startBackup(after,dump){
  var done=after||closeBox, now=Date.now();
  BS.busy=true; box(tr("bk.reading"));
  (dump ? Promise.resolve(dump) : P.dumpAll()).then(function(d){
    /* the backup carries its own time, so a restored handheld says when its data was saved */
    var docs=d.docs.filter(function(x){ return x.path!==BMETA && x.path!==AIP && x.path!==SCORE_MODELS_PATH; }).concat([{path:BMETA, data:{last:now}}]);
    return BK.pack({docs:docs, files:d.files},{runtime:RUNTIME_VERSION, now:now});
  }).then(function(pk){
    box(tr("bk.ready",{size:sizeText(pk.size)}),[
      {label:tr("bk.save"), main:true, go:function(){
        var blob=new Blob(ZIP.writeParts(pk.entries),{type:"application/zip"});
        S.downloads.save({filename:BK.fileName(now), data:blob}).then(function(){
          BS.last=now; if(S.db && !dump) put(S.db.doc(BMETA),{last:now});
          renderLast(); toast(tr("bk.saved")); sfx("ok"); done();
        },function(e){ toast(LP.saveErr(e)); sfx("err"); done(); });
      }},
      {label:tr("common.cancel"), go:function(){ sfx("tap"); done(); }}
    ],pk.size>BIG ? tr("bk.big") : "");
  }).catch(function(e){
    if(window.console) console.error("Lo-PDA backup failed", e);
    sfx("err"); okBox(tr(e && e.code==="toolarge" ? "bk.toolarge" : "bk.failed"),after);
  });
}
$("set-backup-go").onclick=function(){ if(!BS.busy && S.db){ sfx("tap"); startBackup(); } };

$("set-restore-go").onclick=function(){ if(!BS.busy && S.db){ sfx("tap"); $("set-restore-file").click(); } };
$("set-restore-file").onchange=function(){
  var f=this.files && this.files[0]; this.value="";
  if(!f || BS.busy) return;
  BS.busy=true; box(tr("rs.checking"));
  f.arrayBuffer().then(function(ab){
    return BK.unpack(new Uint8Array(ab)).then(function(bk){ BS.backup=bk; BS.file=f; askRestore(); },function(e){
      sfx("err"); okBox(tr(e && e.code==="newer" ? "rs.newer" : "rs.bad"));
    });
  },function(){ sfx("err"); okBox(tr("rs.unreadable")); });
};
function askRestore(){
  var bk=BS.backup, when=new Date(bk.manifest.created);
  BS.busy=true;
  box(tr("rs.ask",{when:isNaN(when) ? "?" : when.getFullYear()+"/"+LP.fmt(when.getTime()), docs:bk.docs.length, files:bk.files.length, size:sizeText(BS.file.size)}),[
    {label:tr("rs.go"), main:true, go:function(){ sfx("tap"); sureRestore(); }},
    {label:tr("rs.first"), go:function(){ sfx("tap"); startBackup(askRestore); }},
    {label:tr("common.cancel"), go:function(){ sfx("tap"); closeBox(); }}
  ]);
}
function sureRestore(){
  box(tr("rs.sure"),[
    {label:tr("rs.yes"), main:true, go:function(){ sfx("tap"); doRestore(BS.backup); }},
    {label:tr("common.cancel"), go:function(){ sfx("tap"); askRestore(); }}
  ]);
}
/* Blobs read from IndexedDB may be backed by the database's own files; copied into memory they outlive the clear */
function detach(dump){
  return Promise.all(dump.files.map(function(f){
    var v=f.value, t=Object.prototype.toString.call(v);
    if(t!=="[object Blob]" && t!=="[object File]") return f;
    return v.arrayBuffer().then(function(ab){ return {key:f.key, value:t==="[object File]" ? new File([ab],v.name,{type:v.type}) : new Blob([ab],{type:v.type})}; });
  })).then(function(files){ return {docs:dump.docs, files:files}; });
}
function doRestore(bk){
  box(tr("rs.working"));
  /* the AI key is never in a backup: the one on this phone stays, whatever the file holds. The darkroom key does go
     in (without it a restored phone could not read its own photos' places), and a restore only ever adds keys. */
  /* the AI document is read again here and written back exactly as stored, whatever its version: a restore must never
     lose a key, not even after an earlier read failed or when a newer Lo-PDA wrote it. If it cannot be read, no restore. */
  Promise.all([S.db.doc(DKP).get(),S.db.doc(AIP).get()]).then(function(r){
    var sn=r[0], mineDark=sn.exists ? LP.own(sn.data()) : null, theirsDark=null, i;
    for(i=0;i<bk.docs.length;i++) if(bk.docs[i].path===DKP) theirsDark=bk.docs[i].data;
    var dark=G.mergeRing(mineDark,theirsDark);
    var mine=r[1].exists ? LP.own(r[1].data()) : null, docs=bk.docs.filter(function(x){ return x.path!==AIP && x.path!==DKP; });
    if(mine) docs.push({path:AIP, data:mine});
    if(dark) docs.push({path:DKP, data:dark});
    /* programs stop their own writes before anything is replaced; the page reloads straight after a successful restore */
    LP.each("restore");
    P.dumpAll().then(detach).then(function(old){
      return P.replaceAll({docs:docs, files:bk.files}).then(function(){
        box(tr("rs.done")); sfx("ok");
        location.reload();
      },function(e){
        if(window.console) console.error("Lo-PDA restore failed, writing the old data back", e);
        return P.replaceAll(old).then(function(){ sfx("err"); okBox(tr("rs.failed")); },function(e2){
          if(window.console) console.error("Lo-PDA rollback failed", e2);
          sfx("err"); BS.busy=false; renderLostRetry(old);
        });
      });
    },function(){ sfx("err"); okBox(tr("rs.failed")); });
  },function(){ sfx("err"); okBox(tr("rs.failed")); });
}
/* after the old data was saved (or not), keep offering to save it again until the user leaves */
function renderLostRetry(old){
  box(tr("rs.lost"),[{label:tr("bk.save"), main:true, go:function(){ sfx("tap"); startBackup(function(){ renderLostRetry(old); },old); }},
    {label:tr("bk.ok"), go:function(){ sfx("tap"); closeBox(); }}]);
}
/* the notes reminder counts a full backup as an export (apps/notes.js) */
LP.backup={last:function(){ return BS.last; }};

/* the storage line, on the backup page: the phone's usage plus the darkroom's film box (apps/darkroom.js) */
function renderStorage(){
  var el=$("set-storage"); el.textContent=tr("set.counting");
  var film=LP.darkroom ? LP.darkroom.summary().then(function(b){ return tr("set.box",{n:b.n, size:LP.darkroom.size(b.bytes)}); },function(){ return ""; }) : Promise.resolve("");
  if(navigator.storage && navigator.storage.estimate){
    Promise.all([navigator.storage.estimate(), navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false), film]).then(function(r){
      var kb=Math.max(1,Math.round((r[0].usage||0)/1024));
      el.textContent=tr("set.storage",{size:kb>1024?(kb/1024).toFixed(1)+" MB":kb+" KB"})+r[2]+tr(r[1]?"set.locked":"set.unlocked");
    }).catch(function(){ el.textContent=tr("set.nousage"); });
  } else film.then(function(t){ el.textContent=tr("set.nousage")+t; });
}
function openSettings(){
  show("settings"); renderSettings(); renderSense(); renderAi(); renderUpdate(); renderLast(); renderSavesRow();
}
function selectShareText(){
  var el=$("set-share-url"), sel=window.getSelection && window.getSelection();
  if(!el || !sel) return;
  var r=document.createRange(); r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
}
var SHARE={drawn:false};
function openShare(){
  $("set-share-send").hidden=!navigator.share;
  /* the address never changes: draw once, the first time the page opens */
  if(SHARE.drawn) return;
  try{ window.LopdaQR.draw($("set-share-qr"),SHARE_URL,4); SHARE.drawn=true; }
  catch(e){ if(window.console) console.error("Lo-PDA QR failed",e); }
}
$("set-sense-open").onclick=function(){ sfx("tap"); show("set-sense"); };
$("set-sense-back").onclick=function(){ sfx("tap"); openSettings(); };
$("set-backup-open").onclick=function(){ sfx("tap"); show("set-backup"); };
$("set-backup-back").onclick=function(){ sfx("tap"); openSettings(); };
$("set-saves-open").onclick=function(){ sfx("tap"); show("set-saves"); };
$("set-saves-back").onclick=function(){ sfx("tap"); openSettings(); };
$("set-share-open").onclick=function(){ sfx("tap"); show("set-share"); };
$("set-share-back").onclick=function(){ sfx("tap"); openSettings(); };
$("set-about-open").onclick=function(){ sfx("tap"); show("set-about"); };
$("set-about-back").onclick=function(){ sfx("tap"); openSettings(); };
/* the share sheet and the clipboard need a real click, never pointerdown (CLAUDE.md) */
$("set-share-send").onclick=function(){
  sfx("tap");
  if(!navigator.share) return;
  try{
    var p=navigator.share({title:"Lo-PDA",url:SHARE_URL});
    if(p && p.catch) p.catch(function(e){ if(!(e && e.name==="AbortError") && window.console) console.error("Lo-PDA share failed",e); });
  }catch(e){}
};
$("set-share-copy").onclick=function(){
  var p=null;
  try{ if(navigator.clipboard && navigator.clipboard.writeText) p=navigator.clipboard.writeText(SHARE_URL); }catch(e){ p=null; }
  if(!p){ selectShareText(); toast(tr("set.share.manual")); sfx("err"); return; }
  p.then(function(){ toast(tr("set.share.copied")); sfx("ok"); },function(){ selectShareText(); toast(tr("set.share.manual")); sfx("err"); });
};

LP.builtin({id:"set-ai", view:"set-ai",
  enter:function(){ renderAi(); },
  leave:function(){ resetScoreModelPage(); },
  lang:function(){ renderAi(); }
});
LP.builtin({id:"set-sense", view:"set-sense",
  enter:function(){ renderSense(); },
  lang:function(){ renderSense(); }
});
LP.builtin({id:"set-backup", view:"set-backup",
  enter:function(){ renderLast(); renderStorage(); if(!BS.busy) $("set-backup-box").hidden=true; },
  lang:function(){ renderLast(); renderStorage(); }
});
LP.builtin({id:"set-saves", view:"set-saves",
  enter:function(){ renderSaves(); },
  lang:function(){ renderSaves(); }
});
LP.builtin({id:"set-share", view:"set-share",
  enter:function(){ openShare(); }
});
LP.builtin({id:"set-about", view:"set-about",
  enter:function(){ $("set-version").textContent=tr("set.version",{v:RUNTIME_VERSION}); },
  lang:function(){ $("set-version").textContent=tr("set.version",{v:RUNTIME_VERSION}); }
});
LP.builtin({id:"settings", label:"app.settings", icon:"settings", view:"settings",
  open:function(){ openSettings(); },
  lang:function(){ renderSettings(); renderSense(); renderAi(); renderLast(); renderSavesRow(); },
  ready:function(){
    readAi();
    S.db.doc(BMETA).get().then(function(sn){ var d=sn.exists ? LP.own(sn.data()) : null; BS.last=d && +d.last || 0; renderLast(); }).catch(function(){});
  }});
})();
