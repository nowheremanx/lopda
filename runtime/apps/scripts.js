/*
 * Lo-PDA built-in: local scripts. One HTML file (or a JS snippet) edited on the device,
 * pasted from an AI, imported from the phone, and run in the same sandbox as a store app.
 * Each script has its own storage document; editing the code keeps the data.
 * Design: docs/design/scripting.md.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, own=LP.own, toast=LP.toast, put=LP.put, sfx=LP.sfx, show=LP.show, uid=LP.uid;
var PREFIX="local:";
var CODE_MAX=512*1024;
var DATA_MAX=256*1024;
/* a script sent for 改一改: past this, editing on a phone is the wrong tool (docs/design/scripts-revise.md) */
var REVISE_MAX=64*1024;
/* a script keeps its last 10 versions, and 1,000,000 characters of code in all */
var VERSIONS_MAX=10;
var VERSIONS_CHARS=1000000;

var M={
  base:null, items:null, data:null, versions:null, asks:null, ideaDoc:null,
  list:[], sizes:{}, cache:{}, schema:{},
  current:null, seq:0, saveTimer:0, dirty:false, askYes:null, dataAskYes:null, seedPromise:null,
  idea:"", ideaLoaded:false, ideaTouched:false, ideaTimer:0, askTimer:0,
  askFor:null, askTouched:false, verPick:null, verSeq:0, reviseBusy:false
};

var ICON=["................","..000000000000..","..033333333330..","..030000000030..","..030333330030..","..030300030030..","..030300330030..","..030333000030..","..030000000030..","..030333300030..","..030000000030..","..033333333330..","..000000000000..","................","................","................"];

function refs(){
  if(!M.base && S.db){
    M.base=S.db.doc("data/users/local/scripts");
    M.items=M.base.collection("items");
    M.data=M.base.collection("data");
    /* a script's earlier code, and the ask draft of its 改一改 page */
    M.versions=M.base.collection("versions");
    M.asks=M.base.collection("asks");
    M.ideaDoc=S.db.doc("data/users/local/script-idea");
  }
  return M.base;
}
function sizeBytes(n){
  n=+n||0;
  if(n<1024) return n+" B";
  return (Math.round(n/102.4)/10)+" KB";
}
function dataLabel(n){ return n ? tr("scripts.data",{size:sizeBytes(n)}) : tr("scripts.nodata"); }
function scriptId(){ return "s"+uid(); }
function setStatus(s){
  var a=$("scripts-status"); if(a) a.textContent=s||"";
  var b=$("idea-status"); if(b) b.textContent=s||"";
}
function setHint(s){ var el=$("script-hint"); if(el) el.textContent=s||""; }

/* ---------- the idea draft: a document of its own, so a long prompt survives HOME and a reload ---------- */
function loadIdea(){
  if(M.ideaLoaded) return Promise.resolve(M.idea);
  if(!refs()) return Promise.resolve(M.idea);
  return M.ideaDoc.get().then(function(sn){
    var d=sn.exists ? own(sn.data()) : null;
    if(d && typeof d.text==="string" && !M.ideaTouched) M.idea=d.text;
    M.ideaLoaded=true;
    return M.idea;
  },function(){ M.ideaLoaded=true; return M.idea; });
}
function saveIdeaNow(){
  clearTimeout(M.ideaTimer);
  if(!refs()) return Promise.resolve(false);
  return put(M.ideaDoc,{v:1, text:M.idea||"", updated:Date.now()});
}
function saveIdeaSoon(){
  clearTimeout(M.ideaTimer);
  M.ideaTimer=setTimeout(saveIdeaNow,600);
}
function updateIdeaButtons(){
  var b=$("idea-clear"); if(b) b.disabled=!M.idea.trim();
  /* with the AI line connected the main button writes the code here; the prompt can still be copied from the editor's 选项 */
  var c=$("idea-copy"); if(c){ c.disabled=false; c.textContent=tr(aiOn() ? "scripts.gen" : "scripts.copy"); }
  var n=$("scripts-startnote"); if(n) n.textContent=tr(aiOn() ? "scripts.startnote.ai" : "scripts.startnote");
}
function renderIdea(){
  closeIdeaAsk();
  var ta=$("scripts-idea");
  if(ta) ta.value=M.idea;
  updateIdeaButtons();
  var box=$("scripts-prompt-box"); if(box) box.hidden=true;
  setStatus("");
  loadIdea().then(function(){
    if(ta && !M.ideaTouched) ta.value=M.idea;
    updateIdeaButtons();
  });
}
function clearIdea(){
  M.idea=""; M.ideaTouched=true;
  var ta=$("scripts-idea"); if(ta){ ta.value=""; ta.focus(); }
  updateIdeaButtons();
  saveIdeaNow();
  setStatus(tr("scripts.idea.cleared"));
  sfx("ok");
}

/* ---------- script source documents ---------- */
function listScripts(){
  if(!refs()) return Promise.resolve([]);
  return M.items.get().then(function(q){
    M.list=q.docs.map(function(d){ var o=own(d.data())||{}; o.id=d.id; return o; });
    M.list.sort(function(a,b){ return (b.updated||0)-(a.updated||0); });
    return M.list;
  });
}
function loadSizes(){
  if(!refs()) return Promise.resolve({});
  return M.data.get().then(function(q){
    var map={};
    q.docs.forEach(function(d){
      var o=own(d.data())||{};
      map[d.id]=o.bytes!=null ? o.bytes : JSON.stringify(o.kv||{}).length;
    });
    M.sizes=map;
    return map;
  },function(){ return {}; });
}
function loadScript(id){
  if(!refs()) return Promise.resolve(null);
  return M.items.doc(id).get().then(function(sn){
    if(!sn.exists) return null;
    var o=own(sn.data())||{};
    o.id=id;
    return o;
  });
}
function saveScript(s){
  if(!s || !s.id) return Promise.resolve(false);
  var now=Date.now();
  if(!s.created) s.created=now;
  s.updated=now;
  if(!s.name) s.name=tr("scripts.untitled",{n:M.list.length+1});
  var rec={v:1, id:s.id, name:s.name, body:s.body||"", created:s.created, updated:s.updated};
  if(!refs()) return Promise.resolve(false);
  return put(M.items.doc(s.id), rec).then(function(ok){
    if(ok){
      var i=-1;
      for(var k=0;k<M.list.length;k++) if(M.list[k].id===s.id){ i=k; break; }
      var copy={v:1,id:s.id,name:s.name,body:s.body||"",created:s.created,updated:s.updated};
      if(i>=0) M.list[i]=copy; else M.list.push(copy);
    }
    return ok;
  });
}
function deleteScript(id){
  if(!refs()) return Promise.resolve();
  /* the order is the way back: data, versions, ask draft, script last, so a failure leaves the script */
  return M.data.doc(id).delete().then(function(){
    return deleteVersions(id);
  }).then(function(){
    return clearAsk(id);
  }).then(function(){
    return M.items.doc(id).delete();
  }).then(function(){
    M.list=M.list.filter(function(x){ return x.id!==id; });
    delete M.sizes[id]; delete M.cache[id]; delete M.schema[id];
    delete S.kv[PREFIX+id];
  });
}

/* ---------- versions and ask drafts: what a revision must never lose ----------
   A revision first writes the old code as a version, and only a version that landed lets the new code in.
   Doc per script: {v:1, list:[{at, name, body, why}]}, newest first, 10 at most, 1,000,000 body characters
   in all; the newest one is always kept, so an oversized script still has one way back. */
function readVersions(id){
  return M.versions.doc(id).get().then(function(sn){
    var d=sn.exists ? own(sn.data()) : null;
    if(!d) return null;
    if(d.v>1) throw {code:"newer"};
    return d;
  });
}
function trimVersions(list, keep){
  var all=[], out=[], total=0, count=0, i, e, body;
  /* a damaged doc (list not an array) is nothing to show, never a crash */
  if(!Array.isArray(list) || !list.length) return out;
  keep=keep||[];
  for(i=0;i<list.length;i++){
    e=list[i]||{};
    body=String(e.body==null?"":e.body);
    /* the newest, and the bodies in keep (the code on screen and the code it replaces), are never dropped */
    all.push({e:{at:+e.at||0, name:String(e.name==null?"":e.name), body:body, why:String(e.why==null?"":e.why)},
      must:i===0 || keep.indexOf(body)>=0, take:false});
  }
  for(i=0;i<all.length;i++) if(all[i].must){ all[i].take=true; total+=all[i].e.body.length; count++; }
  /* the rest, newest first, while they fit: 10 versions and 1,000,000 characters in all */
  for(i=0;i<all.length;i++){
    if(all[i].take) continue;
    if(count>=VERSIONS_MAX || total+all[i].e.body.length>VERSIONS_CHARS) continue;
    all[i].take=true; total+=all[i].e.body.length; count++;
  }
  for(i=0;i<all.length;i++) if(all[i].take) out.push(all[i].e);
  return out;
}
function loadVersions(id){
  if(!id || !refs()) return Promise.resolve([]);
  return readVersions(id).then(function(d){
    return d && d.list ? trimVersions(d.list) : [];
  },function(e){
    if(e && e.code==="newer") throw e;
    return [];
  });
}
/* Each version is one state of the code, labelled with what made it: "orig" (the code before the first change),
   "edit" (typed by hand), "paste", or the ask of a 改一改. The code in use is the version whose body is the script's
   body, so switching back and forth adds nothing: a body already in the list is never added again (owner,
   2026-11-21). Before a replacement both the code going away and the code coming in are in the list.
   Resolves true when both are safe (added, or already there); only then may the script be written. */
function keepVersions(id, oldBody, oldName, newBody, newName, why){
  if(!id) return Promise.resolve(false);
  oldBody=String(oldBody==null?"":oldBody); newBody=String(newBody==null?"":newBody);
  if(!refs()) return Promise.resolve(false);
  return readVersions(id).then(function(d){
    var list=(d && Array.isArray(d.list)) ? trimVersions(d.list) : [], now=Date.now(), changed=false;
    function has(b){ for(var i=0;i<list.length;i++) if(list[i].body===b) return true; return false; }
    function entry(at, name, body, w){ return {at:at, name:String(name==null?"":name).slice(0,40), body:body, why:String(w==null?"":w).slice(0,60)}; }
    if(oldBody.trim() && !has(oldBody)){ list.unshift(entry(now-1, oldName, oldBody, list.length ? "edit" : "orig")); changed=true; }
    if(newBody.trim() && !has(newBody)){ list.unshift(entry(now, newName, newBody, why)); changed=true; }
    if(!changed) return true;
    return put(M.versions.doc(id),{v:1, list:trimVersions(list,[oldBody,newBody])}).then(function(ok){ return !!ok; });
  });
}
function deleteVersions(id){
  if(!id || !refs()) return Promise.resolve(false);
  return M.versions.doc(id).delete().then(function(){ return true; });
}
/* The ask of a script's 改一改 page, kept like the idea draft: typed text survives HOME and a reload. */
function loadAsk(id){
  if(!id || !refs()) return Promise.resolve("");
  return M.asks.doc(id).get().then(function(sn){
    var d=sn.exists ? own(sn.data()) : null;
    if(!d || d.v>1 || typeof d.text!=="string") return "";
    return d.text;
  },function(){ return ""; });
}
function saveAskNow(id, text){
  clearTimeout(M.askTimer); M.askTimer=0;
  if(!id || !refs()) return Promise.resolve(false);
  text=String(text==null?"":text);
  if(!text) return clearAsk(id);
  return put(M.asks.doc(id),{v:1, text:text, updated:Date.now()});
}
function saveAskSoon(id, text){
  clearTimeout(M.askTimer);
  M.askTimer=setTimeout(function(){ saveAskNow(id, text); },600);
}
function clearAsk(id){
  clearTimeout(M.askTimer); M.askTimer=0;
  if(!id || !refs()) return Promise.resolve(false);
  return M.asks.doc(id).delete().then(function(){ return true; });
}
/* The only way code is replaced: the old body becomes a version first. If that version does not land
   (a refused write, an unreadable or newer versions doc), the script is not touched at all. newName is
   the name of the revised file; it is applied only after the version has landed, in the same write. */
function replaceBody(s, code, why, newName, before){
  if(!s || !s.id) return Promise.resolve(false);
  code=String(code==null?"":code);
  /* before: the body and name a revise started from, so the version never comes from in-memory state */
  var oldBody=String(before ? before.body : s.body==null ? "" : s.body), oldName=(before ? before.name : s.name)||"";
  return keepVersions(s.id, oldBody, oldName, code, newName||oldName, why).then(function(ok){
    if(!ok) return false;
    s.body=code;
    if(newName) s.name=String(newName).slice(0,40);
    return saveScript(s).then(function(saved){
      if(!saved){ s.body=oldBody; s.name=oldName; return false; }
      if(M.current===s){ var c=$("script-code"); if(c) c.value=code; M.dirty=false; }
      return true;
    },function(){ s.body=oldBody; s.name=oldName; return false; });
  },function(){ return false; });
}

/* First open: put a working Pomodoro in the library. The flag lives in the scripts settings doc,
   so deleting the example is final; it never comes back on its own. */
function ensureSeed(){
  if(M.seedPromise) return M.seedPromise;
  if(!refs()) return Promise.resolve(false);
  M.seedPromise=M.base.get().then(function(sn){
    var d=sn.exists ? own(sn.data()) : null;
    if(d && d.seeded) return false;
    return listScripts().then(function(list){
      if(list.length) return put(M.base,{v:1,seeded:true});
      var tpl=window.LopdaScriptTemplates && window.LopdaScriptTemplates.pomodoro;
      if(!tpl) return false;
      var now=Date.now();
      return saveScript({v:1,id:scriptId(),name:tr("scripts.pomodoro"),body:tpl,created:now,updated:now}).then(function(ok){
        return ok ? put(M.base,{v:1,seeded:true}) : false;
      });
    });
  }).then(function(){ return true; },function(){ M.seedPromise=null; return false; });
  return M.seedPromise;
}

/* ---------- script data (PAD.save/load), one document per script ---------- */
function loadData(id){
  if(!id) return Promise.resolve({});
  if(M.cache[id]) return Promise.resolve(M.cache[id]);
  if(!refs()) return Promise.resolve({});
  return M.data.doc(id).get().then(function(sn){
    var d=sn.exists ? own(sn.data()) : null;
    if(d && d.v>1) throw {code:"newer"};
    M.cache[id]=(d && d.kv)||{};
    /* a setSchema before the first load is kept until the document has one of its own */
    if(d && typeof d.schema==="number") M.schema[id]=d.schema;
    else if(M.schema[id]==null) M.schema[id]=null;
    if(d && d.bytes!=null) M.sizes[id]=d.bytes;
    return M.cache[id];
  });
}
/* The third argument is the app's data schema (PAD.setSchema). Omitted, the schema already known for
   this script is kept, so the store's debounced saves do not erase it. */
function saveData(id,kv,schema){
  if(!id) return Promise.resolve(false);
  var clean;
  try { clean=own(kv||{}); } catch(e){ return Promise.resolve(false); }
  var json;
  try { json=JSON.stringify(clean); } catch(e){ return Promise.resolve(false); }
  if(json.length>DATA_MAX){ toast(tr("run.toobig")); return Promise.resolve(false); }
  M.cache[id]=clean;
  M.sizes[id]=json.length;
  if(schema!==undefined && typeof schema==="number" && isFinite(schema) && schema>=0) M.schema[id]=Math.floor(schema);
  if(!refs()) return Promise.resolve(false);
  var rec={v:1, kv:clean, updated:Date.now(), bytes:json.length};
  if(M.schema[id]!=null) rec.schema=M.schema[id];
  return put(M.data.doc(id),rec);
}
function deleteData(id){
  delete M.cache[id]; delete M.sizes[id]; delete M.schema[id]; delete S.kv[PREFIX+id];
  if(!refs()) return Promise.resolve();
  return M.data.doc(id).delete();
}
function dataInfo(id){
  if(!id || !refs()) return Promise.resolve(null);
  return M.data.doc(id).get().then(function(sn){
    if(!sn.exists) return M.schema[id]!=null ? {schema:M.schema[id], version:null, updated:0, bytes:0} : null;
    var d=own(sn.data())||{};
    if(d.v>1) throw {code:"newer"};
    return {schema:typeof d.schema==="number"?d.schema:null, version:null, updated:d.updated||0, bytes:d.bytes!=null?d.bytes:0};
  });
}
function setDataSchema(id,n){
  if(!id || typeof n!=="number" || !isFinite(n) || n<0) return Promise.resolve(false);
  M.schema[id]=Math.floor(n);
  if(M.cache[id]) return saveData(id,M.cache[id],M.schema[id]);
  if(!refs()) return Promise.resolve(false);
  return M.data.doc(id).get().then(function(sn){
    if(!sn.exists) return true;
    var d=own(sn.data())||{};
    if(d.v>1) throw {code:"newer"};
    d.schema=M.schema[id]; d.updated=Date.now();
    return put(M.data.doc(id),d);
  });
}

LP.scripts={
  loadData:loadData,
  saveData:saveData,
  flush:saveData,
  deleteData:deleteData,
  info:dataInfo,
  setSchema:setDataSchema,
  size:function(id){ return M.sizes[id]||0; }
};

/* ---------- library ---------- */
function renderLibrary(){
  var seq=++M.seq;
  var ul=$("scripts-list"); if(!ul) return;
  ul.textContent="";
  var empty=$("scripts-empty");
  if(!refs()){
    empty.hidden=false; empty.textContent=tr("scripts.nodb");
    return;
  }
  listScripts().then(function(list){
    return loadSizes().then(function(sizes){ return {list:list, sizes:sizes}; });
  }).then(function(r){
    if(seq!==M.seq) return;
    r.list.forEach(function(s){
      var li=document.createElement("li");
      var b=document.createElement("button"); b.type="button";
      var t=document.createElement("span"); t.className="t"; t.textContent=s.name||tr("app.unnamed");
      var d=document.createElement("span"); d.className="d";
      d.textContent=(s.updated ? LP.fmt(s.updated)+" · " : "")+dataLabel(r.sizes[s.id]||0);
      b.appendChild(t); b.appendChild(d);
      b.onclick=function(){ openScript(s.id); };
      li.appendChild(b); ul.appendChild(li);
    });
    empty.hidden=r.list.length>0;
    if(!r.list.length) empty.textContent=tr(aiOn() ? "scripts.empty.ai" : "scripts.empty");
    var count=$("scripts-count"); count.hidden=!r.list.length; count.textContent=tr("scripts.count",{n:r.list.length});
  }).catch(function(){ if(seq===M.seq) toast(tr("common.readfail",{msg:tr("common.unknown")})); });
}

function newScript(focus){
  var now=Date.now();
  var s={v:1,id:scriptId(),name:tr("scripts.untitled",{n:M.list.length+1}),body:"",created:now,updated:now};
  M.current=s; M.dirty=false;
  show("script-edit");
  if(focus) setTimeout(function(){ var c=$("script-code"); if(c){ c.focus(); c.setSelectionRange(c.value.length,c.value.length); } },80);
  return s;
}
function openScript(id){
  /* a script being revised is opened as the job's own object, so the save guard (revising) still holds and
     the editor shows the answer arriving, never a second copy that could be edited and then overwritten */
  if(G.job && G.mode==="revise" && G.s && G.s.id===id){ M.current=G.s; M.dirty=false; show("script-edit"); return; }
  loadScript(id).then(function(s){
    if(!s){ toast(tr("common.readfail",{msg:tr("common.unknown")})); return; }
    M.current=s; M.dirty=false;
    show("script-edit");
  });
}

function renderEditor(){
  if(!M.current){ show("scripts"); return; }
  /* during a revise the textarea shows the incoming answer, never the stored code */
  $("script-name").value=M.current.name||"";
  $("script-code").value=revising(M.current) ? (G.text||"") : (M.current.body||"");
  $("script-menu-panel").hidden=true;
  $("script-ask").hidden=true;
  renderGen();
  if(generating()){ genHint(); return; }
  var id=M.current.id;
  loadData(id).then(function(){
    if(M.current && M.current.id===id && !generating()) setHint(dataLabel(M.sizes[id]||0));
  },function(){ setHint(tr("scripts.newer")); });
}

function flushSource(){
  if(!M.current || !M.dirty) return Promise.resolve(true);
  /* the ◂ back button and leaving the editor go through here: a revise must not move the stored code */
  if(revising(M.current)) return Promise.resolve(true);
  clearTimeout(M.saveTimer);
  return saveCurrent(true);
}
function saveCurrent(quiet){
  if(!M.current) return Promise.resolve(false);
  var s=M.current;
  /* While a revise of this script streams, the textarea holds the incoming answer: skip every write,
     so the timer, ◂ back, leaving the editor and 保存并运行 all leave the document alone. */
  if(revising(s)) return Promise.resolve(true);
  var name=$("script-name").value;
  if(name!=null) s.name=LP.noEmoji(name).slice(0,40).trim();
  s.body=$("script-code").value;
  if(s.body.length>CODE_MAX){ toast(tr("scripts.toobig")); return Promise.resolve(false); }
  if(!s.name || /^(程序|Script) \d+$/.test(s.name)){
    var derived=deriveName(s.body,"");
    if(derived) s.name=derived;
  }
  if(!s.name) s.name=tr("scripts.untitled",{n:M.list.length+1});
  var nameEl=$("script-name"); if(nameEl) nameEl.value=s.name;
  return saveScript(s).then(function(ok){
    if(ok){ M.dirty=false; if(!quiet) toast(tr("scripts.saved")); }
    return ok;
  });
}
function scheduleSave(){
  if(revising(M.current)) return;
  M.dirty=true;
  clearTimeout(M.saveTimer);
  M.saveTimer=setTimeout(function(){ if(M.current) saveCurrent(true); },700);
}

/* ---------- paste, clipboard, prompt ---------- */
function execCopy(text){
  return new Promise(function(resolve,reject){
    var ta=document.createElement("textarea");
    ta.value=text; ta.setAttribute("readonly","readonly");
    ta.style.position="fixed"; ta.style.left="-999px"; ta.style.top="0";
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0,ta.value.length);
    var ok=false;
    try{ ok=document.execCommand("copy"); }catch(e){}
    document.body.removeChild(ta);
    if(ok) resolve(); else reject(new Error("copy"));
  });
}
function copyText(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text).catch(function(){ return execCopy(text); });
  }
  return execCopy(text);
}
function readClipboard(){
  if(navigator.clipboard && navigator.clipboard.readText) return navigator.clipboard.readText();
  return Promise.reject(new Error("clipboard"));
}
function promptIdea(){
  return (M.idea||"").trim() || tr("scripts.idea.default");
}
/* The chin pad is opt-in for local scripts: showing it costs about 120 px of height, and a
   touch-only game (fruit ninja) does not need it. It appears only when the code reads the pad.
   PAD.on("tilt"/"shake"/"sound") is not a button, so it leaves the pad hidden. */
var PAD_USE=/\bPAD\s*\.\s*(?:isDown|BUTTONS)\b|\bPAD\s*\.\s*on\s*\(\s*['"`](?:press|release)['"`]/;
function usesPad(code){ return PAD_USE.test(String(code||"")); }
function copyPrompt(){
  if(M.ideaTouched || M.idea) saveIdeaSoon();
  var text=tr("scripts.prompt",{idea:promptIdea()});
  copyText(text).then(function(){
    var box=$("scripts-prompt-box"); if(box) box.hidden=true;
    setStatus(tr("scripts.copied")); sfx("ok");
    if($("v-script-idea").hidden) toast(tr("scripts.copied"));
  },function(){
    var box=$("scripts-prompt-box");
    if(box){
      if($("v-script-idea").hidden) show("script-idea");
      box.value=text; box.hidden=false; box.focus(); box.select();
    }
    setStatus(tr("scripts.copyfail")); sfx("err");
  });
}
function cleanCode(raw){
  var s=String(raw||"").replace(/\r\n/g,"\n").replace(/\r/g,"\n").trim();
  /* an AI reply often has prose and more than one fence: take the block that
     starts a document, otherwise the longest one */
  var re=/```(?:html|htm|javascript|js)?\s*\n?([\s\S]*?)```/gi, m, best="";
  while((m=re.exec(s))){
    var b=m[1].trim();
    if(/<!doctype\s+html|<html[\s>]/i.test(b)){ best=b; break; }
    if(b.length>best.length) best=b;
  }
  if(best) s=best;
  s=s.replace(/^```[a-z]*\s*/i,"").replace(/```\s*$/i,"").trim();
  var doc=/<!doctype\s+html|<html[\s>]/i.exec(s);
  if(doc && doc.index>0) s=s.slice(doc.index);
  else {
    var start=/<(?:head|body|div|main|section|canvas|style|script|svg)\b/i.exec(s);
    if(start && start.index>0 && !/^\s*[<!(]/.test(s)) s=s.slice(start.index);
  }
  var end=s.toLowerCase().lastIndexOf("</html>");
  if(end>=0) s=s.slice(0,end+7);
  return s.trim();
}
function isHtml(s){
  return /<(?:!doctype|html|head|body|div|main|section|canvas|style|script|svg|button|input|p|h1|h2|ul|li|table)\b/i.test(s);
}
function jsShell(s){
  var safe=s.replace(/<\/script/gi,"<\\/script");
  return '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:#a3ad7e}canvas{display:block;width:100%;height:100%;object-fit:contain;image-rendering:pixelated}</style></head><body><canvas id="lp" width="160" height="144"></canvas><script>'+safe+'<\/script></body></html>';
}
function toHtml(code){
  code=cleanCode(code);
  if(!code) return "";
  return isHtml(code) ? code : jsShell(code);
}
function deriveName(code,fallback){
  var m=/<title[^>]*>([^<]{1,40})<\/title>/i.exec(code);
  if(m) return LP.noEmoji(m[1]).trim().slice(0,40);
  m=/^\s*<!--\s*name:\s*(.{1,40}?)\s*-->/i.exec(code);
  if(m) return LP.noEmoji(m[1]).trim().slice(0,40);
  m=/^\s*\/\/\s*name:\s*(.{1,40})$/im.exec(code);
  if(m) return LP.noEmoji(m[1]).trim().slice(0,40);
  return fallback;
}
/* ---------- 改一改: the prompt and the checks (pure) ----------
   The rules are the 生成 prompt's own words, cut before its 「我想做的是」 line, so 生成 and 改一改
   never drift apart and scripts.prompt stays exactly as it is. The code goes in by concatenation: tr()
   fills every {word} it finds, and a program is full of braces. */
var IDEA_MARK="\u0001IDEA\u0001", CODE_MARK="\u0001CODE\u0001";
function revisePrompt(code, ask){
  var full=tr("scripts.prompt",{idea:IDEA_MARK});
  var at=full.indexOf(IDEA_MARK);
  var rules=at<0 ? full : full.slice(0,full.lastIndexOf("\n",at)+1);
  rules=rules.replace(/\s+$/,"");
  var text=tr("scripts.revise",{ask:ask==null?"":String(ask), code:CODE_MARK});
  text=text.replace(CODE_MARK,function(){ return code==null?"":String(code); });
  return rules+"\n\n"+text;
}
/* cleanCode (above) first; then the four ways an answer is not the whole revised file */
function checkRevision(oldBody, raw){
  var old=String(oldBody==null?"":oldBody).trim();
  var code=cleanCode(raw);
  if(!code) return {ok:false, why:"empty"};
  if(/<\/html\s*>/i.test(old) && !/<\/html\s*>/i.test(code)) return {ok:false, why:"cut"};
  if(code.length<old.length*0.4) return {ok:false, why:"partial"};
  if(/其余(部分)?(代码)?(不变|同上|省略)|此处省略|rest (of the code )?(is )?unchanged|\.\.\.\s*existing code|\/\/\s*\.\.\.\s*$/im.test(code)) return {ok:false, why:"partial"};
  if(code===old) return {ok:false, why:"same"};
  return {ok:true, code:code};
}

function pasteNew(){
  readClipboard().then(function(text){
    var code=cleanCode(text);
    if(!code) throw new Error("empty");
    var s=newScript(false);
    s.body=code;
    s.name=deriveName(code,s.name);
    M.current=s; M.dirty=true;
    renderEditor();
    saveCurrent(true);
    show("script-edit");
    setStatus("");
    toast(tr("scripts.pasted"));
  },function(){
    newScript(true);
    toast(tr("scripts.pastefail"));
  }).catch(function(){
    newScript(true);
    toast(tr("scripts.pastefail"));
  });
}
/* paste into the editor: an empty editor takes the code as it always did (the old body is empty, nothing to
   keep); over existing code the old body becomes a version first, through replaceBody */
function pasteEditor(){
  if(!M.current) newScript(true);
  var s=M.current;
  readClipboard().then(function(text){
    var code=cleanCode(text);
    if(!code) throw new Error("empty");
    /* while this script is being revised the editor may be blank (the model is still thinking): never paste into it */
    if(revising(s)){ toast(tr("scripts.gen.one")); return; }
    if(String($("script-code").value||"").trim()){ editPaste(s, code); return; }
    $("script-code").value=code;
    s.body=code;
    if(!$("script-name").value || /^程序 |^Script /.test($("script-name").value)){
      s.name=deriveName(code,s.name);
      $("script-name").value=s.name;
    }
    renderGen();
    scheduleSave();
    toast(tr("scripts.pasted"));
  },function(){
    $("script-code").focus();
    toast(tr("scripts.pastefail"));
  }).catch(function(){
    $("script-code").focus();
    toast(tr("scripts.pastefail"));
  });
}
function editPaste(s, code){
  if(G.job){ toast(tr("scripts.gen.one")); return; }
  saveCurrent(true).then(function(ok){
    if(!ok) return;
    var name=$("script-name").value;
    var newName=(!name || /^程序 |^Script /.test(name)) ? deriveName(code,s.name) : "";
    return replaceBody(s, code, "paste", newName).then(function(done){
      if(!done){ toast(tr("scripts.revise.nover")); sfx("err"); return; }
      if(M.current===s){ $("script-code").value=code; $("script-name").value=s.name; M.dirty=false; }
      toast(tr("scripts.pasted")); sfx("ok");
    });
  });
}
/* the editor row's left key: 停止 while the AI writes, 改一改 with code, 粘贴代码 when the editor is empty */
function editorAction(){
  if(!M.current || revising(M.current)) return;
  if(hasCode()) show("script-revise"); else pasteEditor();
}

/* ---------- generate: the idea sent down the AI line, the code streamed into a new script (decisions.md section 34) ----------
   One at a time. The answer goes into the editor as it arrives, read-only, with 粘贴 turned into 停止; the script is saved
   once the whole answer is in, even if the user has left the editor meanwhile. A stop or a failure keeps what came in.
   A program often takes minutes, most of it the model thinking, so the hint line never sits still: a clock that counts
   every second, what the line is doing (dialling, connected, thinking, writing), a mark that flips on every signal
   that really arrives, and how long it has been quiet. The clock shows the screen is alive; the mark and the quiet
   count show whether the line is (ai.js hangs up after a minute of nothing). Leaving the page drops the line on iPhone,
   so the hint asks the user to stay, and a failure after leaving says so. */
var G={job:null, s:null, t0:0, last:0, sig:null, mark:false, tick:0, left:false, mode:"gen", text:"", old:null, ask:""};
function aiOn(){ return !!(LP.ai && LP.ai.on()); }
function generating(){ return !!G.job && !!M.current && M.current===G.s; }
/* A revise of s is streaming: the editor shows the answer, and nothing may read it into s or write it out. */
function revising(s){ return !!(G.job && G.mode==="revise" && s && G.s===s); }
function hasCode(){ var c=$("script-code"); return !!(c && String(c.value||"").trim()); }
function renderGen(){
  var on=generating();
  $("script-code").readOnly=on;
  $("script-run").disabled=on;
  /* the row's left key: stop while the AI writes, 改一改 with code in the editor, 粘贴代码 when it is empty */
  $("script-paste").textContent=tr(on ? "scripts.gen.stop" : hasCode() ? "scripts.revise.button" : "scripts.paste");
  $("script-code").placeholder=tr(on ? "scripts.gen.ph" : "scripts.code");
}
function clock(ms){ var t=Math.floor(Math.max(0,ms)/1000); return Math.floor(t/60)+":"+LP.pad2(t%60); }
function genHint(){
  if(!generating() || $("v-script-edit").hidden) return;
  var now=Date.now(), q=G.sig, t=clock(now-G.t0), quiet=Math.floor((now-G.last)/1000);
  var line=!q ? tr("scripts.gen.dial",{t:t})
    : q.phase==="write" ? tr("scripts.gen.busy",{n:q.text, t:t})
    : q.phase==="think" ? tr("scripts.gen.think",{n:q.think, t:t})
    : tr("scripts.gen.wait",{t:t});
  if(q && quiet>=10) line+=" · "+tr("scripts.gen.quiet",{s:quiet});
  setHint((G.mark ? "▮ " : "▯ ")+line+"\n"+tr("scripts.gen.stay"));
}
function generate(){
  if(G.job){ toast(tr("scripts.gen.one")); M.current=G.s; show("script-edit"); return; }
  if(M.ideaTouched || M.idea) saveIdeaNow();
  var s=newScript(false);
  G.s=s; G.t0=G.last=Date.now(); G.sig=null; G.left=false;
  G.job=LP.ai.ask({messages:[{role:"user", content:tr("scripts.prompt",{idea:promptIdea()})}],
    onSignal:function(q){ G.sig=q; G.last=Date.now(); G.mark=!G.mark; genHint(); },
    onText:function(piece,all){
      s.body=all;
      if(M.current!==s || $("v-script-edit").hidden) return;
      var c=$("script-code"); c.value=all; c.scrollTop=c.scrollHeight;
    }});
  renderGen(); genHint(); sfx("tap");
  G.tick=setInterval(genHint,1000);
  LP.keepAwake(true);   /* a phone that sleeps drops the line */
  function end(){
    clearInterval(G.tick);
    G.job=null; G.s=null;
    if(!$("v-script-edit").hidden){ renderGen(); LP.keepAwake(false); }
  }
  G.job.then(function(all){
    var code=cleanCode(all);
    if(!code) throw {code:"empty"};
    s.body=code; s.name=deriveName(code,s.name);
    return saveScript(s).then(function(){
      var here=M.current===s && !$("v-script-edit").hidden;
      end();
      if(here){ $("script-code").value=code; $("script-name").value=s.name; M.dirty=false; setHint(tr("scripts.gen.done",{t:clock(Date.now()-G.t0)})); }
      else toast(tr("scripts.gen.done",{t:clock(Date.now()-G.t0)}));
      sfx("ok");
    });
  }).catch(function(e){
    var code=e && e.code, why=tr("scripts.gen.fail",{why:G.left && code!=="stopped" ? tr("scripts.gen.left") : LP.ai.err(e)}),
      here=M.current===s && !$("v-script-edit").hidden;
    end();
    if(here) setHint(why); else toast(why);
    sfx("err");
  });
}
/* iOS suspends a hidden page, and the request with it */
document.addEventListener("visibilitychange",function(){ if(document.hidden && G.job) G.left=true; });

/* ---------- 改一改: the ask page and the revise job (decisions.md section 60) ----------
   Same machinery as 生成 (one job, the clock, keepAwake, stop), but the answer is only a candidate:
   it never touches s.body, and it replaces the script only after checkRevision passes and the old body
   is safe as a version. The editor shows the answer as it arrives; the ask draft outlives the page. */
function askText(){ var ta=$("revise-ask"); return ta ? ta.value : ""; }
function setReviseStatus(s){ var el=$("revise-status"); if(el) el.textContent=s||""; }
function renderReviseButtons(){
  var go=$("revise-go"), pa=$("revise-paste"), note=$("revise-note");
  var on=aiOn(), over=!!M.current && String(M.current.body||"").length>REVISE_MAX;
  if(go){ go.textContent=tr(on ? "scripts.revise.run" : "scripts.copy"); go.disabled=over; }
  if(pa){ pa.hidden=on; pa.disabled=over; }
  if(note) note.textContent=over ? tr("scripts.revise.toolong",{size:sizeBytes(String(M.current.body||"").length)})
    : tr(on ? "scripts.revise.note" : "scripts.revise.note.copy");
}
function renderRevise(){
  var s=M.current;
  if(!s){ show("scripts"); return; }
  M.askFor=s.id; M.askTouched=false;
  var ta=$("revise-ask"); if(ta) ta.value="";
  var box=$("revise-prompt-box"); if(box) box.hidden=true;
  setReviseStatus("");
  renderReviseButtons();
  loadAsk(s.id).then(function(text){
    if(M.askFor!==s.id || M.askTouched) return;
    if(ta) ta.value=text;
    renderReviseButtons();
  });
}
function askEmpty(){
  setReviseStatus(tr("scripts.revise.ask"));
  var ta=$("revise-ask"); if(ta) ta.focus();
}
function reviseCopy(){
  var s=M.current; if(!s) return;
  if(G.job){ toast(tr("scripts.gen.one")); return; }
  var ask=askText().trim();
  if(!ask){ askEmpty(); return; }
  var code=String(s.body||"");
  if(code.length>REVISE_MAX){ setReviseStatus(tr("scripts.revise.toolong",{size:sizeBytes(code.length)})); return; }
  saveAskNow(s.id, ask);
  var text=revisePrompt(code, ask);
  copyText(text).then(function(){
    var box=$("revise-prompt-box"); if(box) box.hidden=true;
    setReviseStatus(tr("scripts.revise.copied")); sfx("ok");
    if($("v-script-revise").hidden) toast(tr("scripts.revise.copied"));
  },function(){
    var box=$("revise-prompt-box");
    if(box){ box.value=text; box.hidden=false; box.focus(); box.select(); }
    setReviseStatus(tr("scripts.copyfail")); sfx("err");
  });
}
function reviseJob(){
  if(G.job || M.reviseBusy){ toast(tr("scripts.gen.one")); return; }
  var s=M.current; if(!s) return;
  var ask=askText().trim();
  if(!ask){ askEmpty(); return; }
  saveAskNow(s.id, ask);
  /* the latest typing becomes the old version, so save it before anything else; the flag keeps a
     second tap from starting a second job in the gap before G.job exists */
  M.reviseBusy=true;
  saveCurrent(true).then(function(ok){
    M.reviseBusy=false;
    if(!ok) return;
    if(G.job){ toast(tr("scripts.gen.one")); return; }
    var old={body:String(s.body||""), name:s.name||""};
    if(old.body.length>REVISE_MAX){ setReviseStatus(tr("scripts.revise.toolong",{size:sizeBytes(old.body.length)})); return; }
    startRevise(s, old, ask);
  },function(){ M.reviseBusy=false; });
}
/* the name of the revised file: a default name or one derived from the old <title> may follow the new <title> */
function revisedName(old, code){
  var derived=deriveName(code,"");
  if(!old.name || /^(程序|Script) \d+$/.test(old.name) || old.name===deriveName(old.body,"")) return derived||old.name;
  return old.name;
}
function startRevise(s, old, ask){
  G.mode="revise"; G.s=s; G.text=""; G.old=old; G.ask=ask;
  G.t0=G.last=Date.now(); G.sig=null; G.left=false;
  G.job=LP.ai.ask({messages:[{role:"user", content:revisePrompt(old.body, ask)}],
    onSignal:function(q){ G.sig=q; G.last=Date.now(); G.mark=!G.mark; genHint(); },
    onText:function(piece,all){
      /* the answer is a candidate, never s.body; it lives in G.text so a re-entered editor shows it */
      G.text=all;
      if(M.current!==s || $("v-script-edit").hidden) return;
      var c=$("script-code"); c.value=all; c.scrollTop=c.scrollHeight;
    }});
  M.current=s;
  show("script-edit");
  renderGen(); genHint(); sfx("tap");
  G.tick=setInterval(genHint,1000);
  LP.keepAwake(true);
  function here(){ return M.current===s && !$("v-script-edit").hidden; }
  /* every way out (ok, refused, stop, left) puts the stored code and name back on screen */
  function end(){
    clearInterval(G.tick);
    G.job=null; G.s=null; G.mode="gen";
    if(here()){ $("script-code").value=s.body||""; $("script-name").value=s.name||""; renderGen(); }
    if(!$("v-script-edit").hidden) LP.keepAwake(false);
  }
  G.job.then(function(all){
    var res=checkRevision(old.body, all);
    if(!res.ok) throw {code:"revise", why:res.why};
    return replaceBody(s, res.code, ask.slice(0,60), revisedName(old, res.code), old).then(function(done){
      if(done){
        clearAsk(s.id); M.askTouched=false;
        var ta=$("revise-ask"); if(ta) ta.value="";
      }
      var msg=tr(done ? "scripts.revise.done" : "scripts.revise.nover",{t:clock(Date.now()-G.t0)});
      end();
      if(here()) setHint(msg); else toast(msg);
      sfx(done ? "ok" : "err");
    });
  }).catch(function(e){
    var code=e && e.code, why;
    if(code==="revise") why=tr("scripts.revise.fail",{why:tr("scripts.revise.why."+e.why)});
    else why=tr("scripts.gen.fail",{why:G.left && code!=="stopped" ? tr("scripts.gen.left") : LP.ai.err(e)});
    end();
    if(here()) setHint(why); else toast(why);
    sfx("err");
  });
}
/* 粘贴新版本: the whole file came back from a chat window, not down the line */
function revisePaste(){
  var s=M.current; if(!s) return;
  if(G.job || M.reviseBusy){ toast(tr("scripts.gen.one")); return; }
  M.reviseBusy=true;
  function finish(){ M.reviseBusy=false; }
  readClipboard().then(function(text){
    var code=cleanCode(text);
    if(!code) throw new Error("empty");
    var res=checkRevision(String(s.body||""), code);
    if(!res.ok){ setReviseStatus(tr("scripts.revise.fail",{why:tr("scripts.revise.why."+res.why)})); sfx("err"); finish(); return; }
    var ask=askText().trim();
    return saveCurrent(true).then(function(ok){
      if(!ok){ finish(); return; }
      return replaceBody(s, res.code, (ask||"paste").slice(0,60)).then(function(done){
        finish();
        if(!done){ setReviseStatus(tr("scripts.revise.nover")); sfx("err"); return; }
        clearAsk(s.id); M.askTouched=false;
        var ta=$("revise-ask"); if(ta) ta.value="";
        show("script-edit");
        toast(tr("scripts.revise.pasted")); sfx("ok");
      });
    });
  },function(){
    finish(); setReviseStatus(tr("scripts.pastefail")); sfx("err");
  }).catch(function(){
    finish(); setReviseStatus(tr("scripts.pastefail")); sfx("err");
  });
}

/* ---------- 以前的版本: each earlier body, read-only, with 换回这个 ---------- */
function whyLabel(why){
  if(why==="orig") return tr("scripts.versions.orig");
  if(why==="edit") return tr("scripts.versions.edit");
  if(why==="paste") return tr("scripts.versions.paste");
  if(why==="restore") return tr("scripts.versions.restore");
  return tr("scripts.versions.revise",{ask:why||""});
}
function showVersionList(){
  M.verPick=null;
  $("versions-list-wrap").hidden=false;
  $("versions-code-wrap").hidden=true;
  $("versions-actions").hidden=true;
}
function renderVersions(keepPick){
  var seq=++M.verSeq, s=M.current, keep=keepPick ? M.verPick : null;
  var ul=$("versions-list"), empty=$("versions-empty");
  if(!ul || !empty) return;
  ul.textContent="";
  showVersionList();
  if(!s || !refs()){ empty.hidden=false; empty.textContent=tr("scripts.nodb"); return; }
  loadVersions(s.id).then(function(list){
    if(seq!==M.verSeq) return;
    list.forEach(function(v){
      var li=document.createElement("li"), now=v.body===String(s.body||"");
      /* the code in use is highlighted; picking another one moves the highlight, it adds no row */
      if(now){ li.className="on"; li.setAttribute("aria-current","true"); }
      var b=document.createElement("button"); b.type="button";
      var t=document.createElement("span"); t.className="t"; t.textContent=LP.fmt(v.at);
      var d=document.createElement("span"); d.className="d"; d.textContent=(now ? tr("scripts.versions.now")+" · " : "")+whyLabel(v.why)+" · "+sizeBytes(v.body.length);
      b.appendChild(t); b.appendChild(d);
      b.onclick=function(){ pickVersion(v); };
      li.appendChild(b); ul.appendChild(li);
    });
    empty.hidden=list.length>0;
    if(!list.length) empty.textContent=tr("scripts.versions.empty");
    /* a language switch redraws the list only; the version being read stays on screen */
    if(keep) for(var i=0;i<list.length;i++) if(list[i].at===keep.at && list[i].body===keep.body){ pickVersion(list[i]); break; }
  },function(e){
    if(seq!==M.verSeq) return;
    empty.hidden=false;
    empty.textContent=tr(e && e.code==="newer" ? "scripts.newer" : "scripts.versions.fail");
  });
}
function pickVersion(v){
  if(!v) return;
  M.verPick=v;
  var box=$("versions-code");
  if(box){ box.value=v.body||""; box.scrollTop=0; }
  $("versions-list-wrap").hidden=true;
  $("versions-code-wrap").hidden=false;
  $("versions-actions").hidden=false;
  /* the code in use has nothing to switch to */
  $("versions-use").hidden=!!M.current && v.body===String(M.current.body||"");
  sfx("tap");
}
function versionsBack(){
  if(M.verPick){ showVersionList(); return; }
  show("script-edit");
}
function restoreVersion(){
  var s=M.current, v=M.verPick;
  if(!s || !v || !v.body) return;
  if(G.job){ toast(tr("scripts.gen.one")); return; }
  saveCurrent(true).then(function(ok){
    if(!ok) return;
    return replaceBody(s, v.body, "", v.name||s.name||"").then(function(done){
      if(!done){ toast(tr("scripts.revise.nover")); sfx("err"); return; }
      show("script-edit");
      toast(tr("scripts.versions.restored")); sfx("ok");
    });
  });
}
function openVersions(){
  if(!M.current) return;
  if(G.job){ toast(tr("scripts.gen.one")); return; }
  M.verPick=null;
  show("script-versions");
}

/* ---------- run ---------- */
function runCurrent(){
  if(!M.current) return;
  if(revising(M.current)) return;   /* the textarea holds the answer, not the code to run */
  saveCurrent(true).then(function(ok){
    if(!ok) return;
    return loadData(M.current.id).then(function(){
      var html=toHtml(M.current.body);
      if(!html){ toast(tr("scripts.emptycode")); return; }
      LP.runApp({
        id:PREFIX+M.current.id,
        local:true,
        scriptId:M.current.id,
        name:M.current.name,
        html:html,
        buttons:usesPad(M.current.body),
        permissions:["files","motion","mic","notes","camera","wordbook"],
        back:"script-edit"
      });
    },function(){ toast(tr("scripts.newer")); });
  });
}

/* ---------- data overview ---------- */
function clearAllData(){
  if(!refs()) return Promise.resolve();
  return M.data.get().then(function(q){
    return Promise.all(q.docs.map(function(d){
      delete M.cache[d.id]; delete M.sizes[d.id]; delete S.kv[PREFIX+d.id];
      return M.data.doc(d.id).delete();
    }));
  });
}
function renderData(){
  var seq=++M.seq;
  var ul=$("data-list"); if(!ul) return;
  ul.textContent="";
  if(!refs()){ $("data-summary").textContent=tr("scripts.nodb"); return; }
  listScripts().then(function(list){
    return loadSizes().then(function(sizes){ return {list:list,sizes:sizes}; });
  }).then(function(r){
    if(seq!==M.seq) return;
    var total=0, n=0;
    r.list.forEach(function(s){
      var size=r.sizes[s.id]||0;
      if(!size) return;
      total+=size; n++;
      var li=document.createElement("li");
      var b=document.createElement("button"); b.type="button";
      var t=document.createElement("span"); t.className="t"; t.textContent=s.name||tr("app.unnamed");
      var d=document.createElement("span"); d.className="d"; d.textContent=sizeBytes(size)+" · "+tr("scripts.data.clear");
      b.appendChild(t); b.appendChild(d);
      b.onclick=function(){
        askData(tr("scripts.data.confirm",{name:s.name||tr("app.unnamed"),size:sizeBytes(size)}),function(){
          deleteData(s.id).then(function(){ toast(tr("scripts.data.cleared")); renderData(); },function(){ toast(tr("scripts.data.fail")); });
        });
      };
      li.appendChild(b); ul.appendChild(li);
    });
    /* nothing stored: one line says so, without a "0 scripts, 0 B" above it or a 清空 with nothing to clear */
    $("data-summary").textContent=n ? tr("scripts.data.summary",{n:n,size:sizeBytes(total)}) : "";
    $("data-summary").hidden=!n;
    $("data-empty").hidden=n>0;
    if(!n) $("data-empty").textContent=tr("scripts.data.none");
    $("data-clear-all").disabled=!n; $("data-clear-all").hidden=!n;
    M.dataRows={n:n,total:total};
  },function(){ $("data-summary").textContent=tr("scripts.data.fail"); });
}
function askData(msg,yes){
  M.dataAskYes=yes;
  $("data-ask-msg").textContent=msg;
  $("data-ask").hidden=false;
}
function closeDataAsk(){ M.dataAskYes=null; $("data-ask").hidden=true; }

/* ---------- confirm ---------- */
function ask(msg,yes){
  M.askYes=yes;
  $("script-menu-panel").hidden=true;
  $("script-ask-msg").textContent=msg;
  $("script-ask").hidden=false;
}
function closeAsk(){ M.askYes=null; $("script-ask").hidden=true; }
function openIdeaAsk(){
  if(!M.idea.trim()) return;
  $("idea-ask").hidden=false;
  sfx("tap");
}
function closeIdeaAsk(){ var el=$("idea-ask"); if(el) el.hidden=true; }

/* ---------- import / export ---------- */
function baseName(name){
  return String(name||"").replace(/\.[^.]+$/,"").replace(/[\/\\:*?"<>|]/g,"").trim().slice(0,40);
}
function importFile(f){
  if(!f) return;
  if(f.size>CODE_MAX){ toast(tr("scripts.toobig")); return; }
  var r=new FileReader();
  r.onload=function(){
    var code=cleanCode(r.result);
    if(!code){ toast(tr("scripts.readfail")); return; }
    var s=newScript(false);
    s.body=code;
    s.name=deriveName(code,baseName(f.name)||s.name);
    M.current=s; M.dirty=true;
    renderEditor();
    saveCurrent(true);
    show("script-edit");
  };
  r.onerror=function(){ toast(tr("scripts.readfail")); };
  r.readAsText(f,"utf-8");
}
function exportCurrent(){
  if(!M.current) return;
  if(revising(M.current)){ toast(tr("scripts.gen.one")); return; }
  var body=$("script-code").value;
  if(!body){ toast(tr("scripts.emptycode")); return; }
  if(!LP.S.downloads){ toast(tr("scripts.exportfail")); return; }
  var name=(LP.noEmoji(M.current.name)||"script").replace(/[\/\\:*?"<>|]/g,"").slice(0,40);
  if(!/\.html?$/i.test(name)) name+=".html";
  LP.S.downloads.save({filename:name,data:new Blob([body],{type:"text/html"})}).then(function(r){
    toast(r && r.status==="saved" ? tr("scripts.exported") : tr("scripts.exportfail"));
  },function(e){ toast(LP.saveErr(e)); });
}

/* ---------- wiring ---------- */
function init(){
  refs();
  $("scripts-new").onclick=function(){ newScript(true); };
  $("scripts-write").onclick=function(){ show("script-idea"); };
  $("scripts-paste").onclick=function(){ pasteNew(); };
  $("idea-back").onclick=function(){ saveIdeaNow(); show("scripts"); };
  $("idea-copy").onclick=function(){ if(aiOn()) generate(); else copyPrompt(); };
  $("idea-paste").onclick=function(){ pasteNew(); };
  $("idea-clear").onclick=openIdeaAsk;
  $("idea-ask-yes").onclick=function(){ closeIdeaAsk(); clearIdea(); };
  $("idea-ask-no").onclick=closeIdeaAsk;
  $("scripts-idea").addEventListener("input",function(){
    M.idea=this.value; M.ideaTouched=true;
    updateIdeaButtons();
    saveIdeaSoon();
  });
  $("scripts-idea").addEventListener("blur",function(){ saveIdeaNow(); });
  $("scripts-data").onclick=function(){ show("script-data"); };
  $("data-back").onclick=function(){ show("scripts"); };
  $("data-clear-all").onclick=function(){
    var rows=M.dataRows||{n:0,total:0};
    if(!rows.n) return;
    askData(tr("scripts.data.confirmall",{n:rows.n,size:sizeBytes(rows.total)}),function(){
      clearAllData().then(function(){
        toast(tr("scripts.data.clearedall")); renderData();
      },function(){ toast(tr("scripts.data.fail")); });
    });
  };
  $("data-ask-yes").onclick=function(){ var f=M.dataAskYes; closeDataAsk(); if(f) f(); };
  $("data-ask-no").onclick=closeDataAsk;
  $("scripts-import").onclick=function(){ var f=$("scripts-file"); if(f){ f.value=""; f.click(); } };
  $("scripts-file").addEventListener("change",function(){ var f=this.files && this.files[0]; this.value=""; if(f) importFile(f); });

  $("script-back").onclick=function(){
    saveCurrent(true).then(function(){ show("scripts"); renderLibrary(); });
  };
  $("script-menu").onclick=function(){
    $("script-menu-panel").hidden=!$("script-menu-panel").hidden;
    $("script-ask").hidden=true;
  };
  $("script-copy").onclick=copyPrompt;
  $("script-menu-close").onclick=function(){ $("script-menu-panel").hidden=true; };
  $("script-export").onclick=exportCurrent;
  $("script-menu-paste").onclick=function(){ $("script-menu-panel").hidden=true; pasteEditor(); };
  $("script-versions-open").onclick=function(){ $("script-menu-panel").hidden=true; openVersions(); };
  $("script-paste").onclick=function(){ if(generating()) G.job.stop(); else editorAction(); };
  $("script-run").onclick=runCurrent;
  $("script-clear").onclick=function(){
    if(!M.current) return;
    closeAsk();
    var n=M.sizes[M.current.id]||0;
    ask(tr("scripts.confirm.clear",{name:M.current.name,size:sizeBytes(n)}),function(){
      var id=M.current.id;
      deleteData(id).then(function(){
        setHint(dataLabel(0)); toast(tr("scripts.cleared")); sfx("ok");
      },function(){ toast(tr("scripts.clearfail")); });
    });
  };
  $("script-delete").onclick=function(){
    if(!M.current) return;
    closeAsk();
    if(revising(M.current)){ toast(tr("scripts.gen.one")); return; }
    var id=M.current.id, n=M.sizes[id]||0;
    ask(tr("scripts.confirm.delete",{name:M.current.name,size:sizeBytes(n)}),function(){
      deleteScript(id).then(function(){
        M.current=null; M.dirty=false;
        show("scripts"); renderLibrary(); toast(tr("scripts.deleted")); sfx("ok");
      },function(){ toast(tr("common.savefail",{code:tr("common.unknown")})); });
    });
  };
  $("script-ask-yes").onclick=function(){ var f=M.askYes; closeAsk(); if(f) f(); };
  $("script-ask-no").onclick=closeAsk;

  $("script-name").addEventListener("input",function(){
    if(!M.current || revising(M.current)) return;
    M.current.name=LP.noEmoji(this.value).slice(0,40); scheduleSave();
  });
  $("script-code").addEventListener("input",function(){
    if(!M.current || revising(M.current)) return;
    M.current.body=this.value; scheduleSave(); renderGen();
  });

  /* 改一改 page */
  $("revise-back").onclick=function(){ show("script-edit"); };
  $("revise-go").onclick=function(){ if(aiOn()) reviseJob(); else reviseCopy(); };
  $("revise-paste").onclick=revisePaste;
  $("revise-ask").addEventListener("input",function(){
    M.askTouched=true;
    if(M.current) saveAskSoon(M.current.id,this.value);
  });
  $("revise-ask").addEventListener("blur",function(){ if(M.current) saveAskNow(M.current.id,this.value); });

  /* 以前的版本 page */
  $("versions-back").onclick=versionsBack;
  $("versions-return").onclick=versionsBack;
  $("versions-use").onclick=restoreVersion;
}

/* ---------- built-in registration ---------- */
LP.builtin({id:"scripts", label:"app.scripts", icon:function(){ return ICON; }, view:"scripts",
  open:function(){ show("scripts"); },
  ready:function(){ if(LP.ai) LP.ai.watch(updateIdeaButtons); refs(); loadIdea(); ensureSeed().then(function(){ if(!$("v-scripts").hidden) renderLibrary(); }); },
  enter:function(){ refs(); loadIdea(); ensureSeed().then(function(){ if(!$("v-scripts").hidden) renderLibrary(); }); renderLibrary(); updateIdeaButtons(); },
  leave:function(){ setStatus(""); },
  lang:function(){ updateIdeaButtons(); if(!$("v-scripts").hidden) renderLibrary(); }
});
LP.builtin({id:"script-idea", view:"script-idea", keepPad:false,
  enter:function(){ renderIdea(); },
  leave:function(){ closeIdeaAsk(); if(M.ideaTouched || M.idea) saveIdeaNow(); },
  lang:function(){ if(!$("v-script-idea").hidden) renderIdea(); }
});
LP.builtin({id:"script-edit", view:"script-edit", keepPad:false,
  enter:function(){ renderEditor(); },
  leave:function(){ flushSource(); if(G.job) LP.keepAwake(false); },
  lang:function(){ if($("v-script-edit").hidden || !M.current) return; renderGen(); if(generating()) genHint(); else setHint(dataLabel(M.sizes[M.current.id]||0)); }
});
LP.builtin({id:"script-data", view:"script-data", keepPad:false,
  enter:function(){ closeDataAsk(); renderData(); },
  lang:function(){ if(!$("v-script-data").hidden) renderData(); }
});
LP.builtin({id:"script-revise", view:"script-revise", keepPad:false,
  enter:function(){ renderRevise(); },
  /* the ask draft outlives the page; an empty ask removes it */
  leave:function(){ if(M.askFor) saveAskNow(M.askFor, askText()); },
  lang:function(){ if(!$("v-script-revise").hidden) renderReviseButtons(); }
});
LP.builtin({id:"script-versions", view:"script-versions", keepPad:false,
  enter:function(){ renderVersions(false); },
  /* a language switch redraws the list in place; the version being read stays on screen */
  lang:function(){ if(!$("v-script-versions").hidden) renderVersions(true); }
});
/* pure helpers and the store's write path, for tests/scripts-revise.test.mjs; after every declaration,
   so state and stream point at the real objects */
LP.scripts._test={
  revisePrompt:revisePrompt, checkRevision:checkRevision, trimVersions:trimVersions,
  keepVersions:keepVersions, loadVersions:loadVersions, deleteVersions:deleteVersions,
  loadAsk:loadAsk, saveAskNow:saveAskNow, clearAsk:clearAsk,
  replaceBody:replaceBody, deleteScript:deleteScript,
  revising:revising, saveCurrent:saveCurrent, state:M, stream:G
};

init();
})();
