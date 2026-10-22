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

var M={
  base:null, items:null, data:null,
  list:[], sizes:{}, cache:{},
  current:null, seq:0, saveTimer:0, dirty:false, askYes:null, dataAskYes:null, seedPromise:null
};

var ICON=["................","..000000000000..","..033333333330..","..030000000030..","..030333330030..","..030300030030..","..030300330030..","..030333000030..","..030000000030..","..030333300030..","..030000000030..","..033333333330..","..000000000000..","................","................","................"];

function refs(){
  if(!M.base && S.db){
    M.base=S.db.doc("data/users/local/scripts");
    M.items=M.base.collection("items");
    M.data=M.base.collection("data");
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
function setStatus(s){ var el=$("scripts-status"); if(el) el.textContent=s||""; }
function setHint(s){ var el=$("script-hint"); if(el) el.textContent=s||""; }

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
  /* data first: if that fails, the script (and its way back) stays */
  return M.data.doc(id).delete().then(function(){
    return M.items.doc(id).delete();
  }).then(function(){
    M.list=M.list.filter(function(x){ return x.id!==id; });
    delete M.sizes[id]; delete M.cache[id];
    delete S.kv[PREFIX+id];
  });
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
    if(d && d.bytes!=null) M.sizes[id]=d.bytes;
    return M.cache[id];
  });
}
function saveData(id,kv){
  if(!id) return Promise.resolve(false);
  var clean;
  try { clean=own(kv||{}); } catch(e){ return Promise.resolve(false); }
  var json;
  try { json=JSON.stringify(clean); } catch(e){ return Promise.resolve(false); }
  if(json.length>DATA_MAX){ toast(tr("run.toobig")); return Promise.resolve(false); }
  M.cache[id]=clean;
  M.sizes[id]=json.length;
  if(!refs()) return Promise.resolve(false);
  return put(M.data.doc(id),{v:1, kv:clean, updated:Date.now(), bytes:json.length});
}
function deleteData(id){
  delete M.cache[id]; delete M.sizes[id]; delete S.kv[PREFIX+id];
  if(!refs()) return Promise.resolve();
  return M.data.doc(id).delete();
}

LP.scripts={
  loadData:loadData,
  saveData:saveData,
  flush:saveData,
  deleteData:deleteData,
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
    if(!r.list.length) empty.textContent=tr("scripts.empty");
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
  loadScript(id).then(function(s){
    if(!s){ toast(tr("common.readfail",{msg:tr("common.unknown")})); return; }
    M.current=s; M.dirty=false;
    show("script-edit");
  });
}

function renderEditor(){
  if(!M.current){ show("scripts"); return; }
  $("script-name").value=M.current.name||"";
  $("script-code").value=M.current.body||"";
  $("script-menu-panel").hidden=true;
  $("script-ask").hidden=true;
  var id=M.current.id;
  loadData(id).then(function(){
    if(M.current && M.current.id===id) setHint(dataLabel(M.sizes[id]||0));
  },function(){ setHint(tr("scripts.newer")); });
}

function flushSource(){
  if(!M.current || !M.dirty) return Promise.resolve(true);
  clearTimeout(M.saveTimer);
  return saveCurrent(true);
}
function saveCurrent(quiet){
  if(!M.current) return Promise.resolve(false);
  var s=M.current;
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
  var v=$("scripts-idea");
  var idea=v && v.value ? v.value.trim() : "";
  return idea || tr("scripts.idea.default");
}
function copyPrompt(){
  var text=tr("scripts.prompt",{idea:promptIdea()});
  copyText(text).then(function(){
    var box=$("scripts-prompt-box"); if(box) box.hidden=true;
    setStatus(tr("scripts.copied")); sfx("ok");
  },function(){
    var box=$("scripts-prompt-box");
    if(box){ box.value=text; box.hidden=false; box.focus(); box.select(); }
    setStatus(tr("scripts.copyfail")); sfx("err");
  });
}
function cleanCode(raw){
  var s=String(raw||"").replace(/\r\n/g,"\n").replace(/\r/g,"\n").trim();
  var fence=/```(?:html|htm|javascript|js)?\s*\n?([\s\S]*?)```/i.exec(s);
  if(fence) s=fence[1].trim();
  s=s.replace(/^```[a-z]*\s*/i,"").replace(/```\s*$/i,"").trim();
  var start=/<(?:!doctype\s+html|html|head|body|div|main|section|canvas|style|script|svg)\b/i.exec(s);
  if(start && start.index>0) s=s.slice(start.index);
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
function pasteEditor(){
  if(!M.current) newScript(true);
  readClipboard().then(function(text){
    var code=cleanCode(text);
    if(!code) throw new Error("empty");
    $("script-code").value=code;
    M.current.body=code;
    if(!$("script-name").value || /^程序 |^Script /.test($("script-name").value)){
      M.current.name=deriveName(code,M.current.name);
      $("script-name").value=M.current.name;
    }
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

/* ---------- run ---------- */
function runCurrent(){
  if(!M.current) return;
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
        buttons:true,
        permissions:["files","motion","mic","notes","camera"],
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
    $("data-summary").textContent=tr("scripts.data.summary",{n:n,size:sizeBytes(total)});
    $("data-empty").hidden=n>0;
    if(!n) $("data-empty").textContent=tr("scripts.data.none");
    $("data-clear-all").disabled=!n;
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
  $("scripts-copy").onclick=copyPrompt;
  $("scripts-paste").onclick=function(){ pasteNew(); };
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
  $("scripts-idea").addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); copyPrompt(); } });

  $("script-back").onclick=function(){
    saveCurrent(true).then(function(){ show("scripts"); renderLibrary(); });
  };
  $("script-menu").onclick=function(){
    $("script-menu-panel").hidden=!$("script-menu-panel").hidden;
    $("script-ask").hidden=true;
  };
  $("script-copy").onclick=copyPrompt;
  $("script-export").onclick=exportCurrent;
  $("script-paste").onclick=pasteEditor;
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

  $("script-name").addEventListener("input",function(){ if(M.current){ M.current.name=LP.noEmoji(this.value).slice(0,40); scheduleSave(); } });
  $("script-code").addEventListener("input",function(){ if(M.current){ M.current.body=this.value; scheduleSave(); } });
}

/* ---------- built-in registration ---------- */
LP.builtin({id:"scripts", label:"app.scripts", icon:function(){ return ICON; }, view:"scripts",
  open:function(){ show("scripts"); },
  ready:function(){ refs(); ensureSeed().then(function(){ if(!$("v-scripts").hidden) renderLibrary(); }); },
  enter:function(){ ensureSeed().then(function(){ if(!$("v-scripts").hidden) renderLibrary(); }); renderLibrary(); },
  leave:function(){ setStatus(""); },
  lang:function(){ if(!$("v-scripts").hidden) renderLibrary(); }
});
LP.builtin({id:"script-edit", view:"script-edit", keepPad:false,
  enter:function(){ renderEditor(); },
  leave:function(){ flushSource(); },
  lang:function(){ if(!$("v-script-edit").hidden && M.current) setHint(dataLabel(M.sizes[M.current.id]||0)); }
});
LP.builtin({id:"script-data", view:"script-data", keepPad:false,
  enter:function(){ closeDataAsk(); renderData(); },
  lang:function(){ if(!$("v-script-data").hidden) renderData(); }
});

init();
})();
