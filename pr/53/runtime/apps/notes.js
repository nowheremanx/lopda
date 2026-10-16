/*
 * Lo-PDA built-in: notes (记事本 2.0, docs/design/notes.md, decisions.md section 20). The list opens on today's diary;
 * a search box, tags read from the text, a trash that keeps notes 30 days, a zip of .md files out and in.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * A note is notes/<id> {body, updated} plus optional created, pinned, day ("2026-10-15": a diary), src ("reader" | "dict":
 * written by LP.notes.append) and deleted (the time it went to the trash). The title is the first line of the body and
 * tags are read from it (runtime/notetext.js), never stored. Old notes have only {body, updated}: created reads as updated.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, NT=window.LopdaNoteText, Z=window.LopdaZip;
var put=LP.put, toast=LP.toast, show=LP.show, upsert=LP.upsert, dropLocal=LP.dropLocal, pending=LP.pending, sfx=LP.sfx, own=LP.own;

var DAY=86400000, TRASH_DAYS=30, REMIND_DAYS=30, REMIND_MIN=20, YEARS=3;
var MAX_FILE=4*1024*1024, MAX_NOTE=256*1024, MAX_IMPORT=2000, SEARCH_WAIT=150;
var FIELDS=["body","updated","created","pinned","day","src","deleted"];

var N={
  q:"", filter:null,          // the search text; a filter {k:"tag", key, name} | {k:"diary"} | {k:"quote"}
  rows:[], cur:0,             // the list's rows (today, new, notes) and the cursor
  sheet:"", pick:0,           // "menu" | "tags" | "trash" | "item" | "help" over the list, and its cursor
  tpick:0, trpick:0, item:null, armed:"",
  meta:{exported:0, reminded:0}, metaRef:null, reminded:false,
  years:[], ecur:-1,          // the diary's 那年今日 rows and the cursor on them (-1: the text)
  reading:false,              // the editor shows the text to read (no keyboard) rather than to write
  opts:false, opick:0,        // the editor's options
  release:null,               // an A press on a menu waits for its release (share sheet, file picker)
  back:null,                  // a diary opened by another program (LP.notes.openDiary): B goes back there, not to the list
  busy:false
};

/* ---------- notes ---------- */
function live(){ return S.notes.filter(function(n){ return !n.deleted; }); }
function byId(id){ for(var i=0;i<S.notes.length;i++) if(S.notes[i].id===id) return S.notes[i]; return null; }
function createdOf(n){ return n.created || n.updated || 0; }
function isQuote(n){ return NT.quote(n); }
function sorted(list){
  return list.slice().sort(function(a,b){ return ((b.pinned?1:0)-(a.pinned?1:0)) || ((b.updated||0)-(a.updated||0)); });
}
function today(){ return NT.dayKey(Date.now()); }

/* ---------- diaries by day for the calendar (decisions.md section 21): an index built in one pass over S.notes when first
   asked for, dropped whenever the notes change (changed(): save, purge, the store's own reads), never stored. A new
   S.notes array (dropLocal, a read from the store) drops it too */
var IDX=null, idxOf=null;
function index(){
  if(!IDX || idxOf!==S.notes){ IDX=NT.diaryIndex(S.notes); idxOf=S.notes; }
  return IDX;
}
function changed(){ IDX=null; }
function todayNote(){
  var k=today(), hit=null;
  live().forEach(function(n){ if(n.day===k && (!hit || (n.updated||0)>(hit.updated||0))) hit=n; });
  return hit;
}
function docOf(n){ var d={}; FIELDS.forEach(function(k){ if(n[k]!=null && n[k]!==false) d[k]=n[k]; }); return d; }
/* write a note as it stands in S.notes; resolves true when it landed */
function save(n){
  var doc=docOf(n); doc.id=n.id;
  upsert("notes",doc); changed();
  if(!S.db) return Promise.resolve(false);
  pending.notes[n.id]=true;
  return put(S.refs.notes.doc(n.id),docOf(n)).then(function(ok){ if(ok) delete pending.notes[n.id]; return ok; });
}
function firstLine(body){ return NT.title(body); }
/* the line under a title in the list: the text after the first line, on one line */
function rest(body){ return String(body||"").split("\n").slice(1).join(" ").replace(/\s+/g," ").trim(); }
function label(n){ return firstLine(n.body) || tr("notes.blank"); }

/* ---------- the list ---------- */
function tagKeys(n){ return NT.tags(n.body).map(NT.key); }
function matches(n,f){
  if(!f) return true;
  if(f.k==="diary") return !!n.day;
  if(f.k==="quote") return isQuote(n);
  return tagKeys(n).indexOf(f.key)>=0;
}
function filterName(f){ return f.k==="diary" ? tr("notes.diary") : f.k==="quote" ? tr("notes.quotes") : "#"+f.name; }
function buildRows(){
  var q=N.q.trim(), list=live().filter(function(n){ return matches(n,N.filter); }), hits={};
  if(q) list=list.filter(function(n){ var h=NT.search(n.body,q); if(h) hits[n.id]=h; return !!h; });
  var rows=[];
  if(!q && !N.filter) rows.push({k:"today"},{k:"new"});
  sorted(list).forEach(function(n){ rows.push({k:"note", n:n, hit:hits[n.id]}); });
  return rows;
}
function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function rowEl(i,title,sub){
  var li=el("li",i===N.cur?"on":""), b=el("button");
  b.type="button";
  b.appendChild(el("span","t",title));
  if(sub) b.appendChild(sub);
  b.onclick=function(){ N.cur=i; activate(); };
  li.appendChild(b);
  return li;
}
function dateLine(n,row){
  var d=el("span","d");
  if(row.hit){
    var h=row.hit;
    d.appendChild(document.createTextNode((h.lead?"…":"")+h.before));
    d.appendChild(el("mark","",h.hit));
    d.appendChild(document.createTextNode(h.after+(h.tail?"…":"")));
    return d;
  }
  var r=rest(n.body);
  d.textContent=NT.when(n.updated||0,"list",tr)+(r ? " · "+r : "");
  return d;
}
function render(ensure){
  if($("v-notes").hidden) return;
  N.rows=buildRows();
  N.cur=Math.max(0,Math.min(N.cur,N.rows.length-1));
  var top=$("notes-top"), ul=$("notes-list"), empty=$("notes-empty"), f=$("notes-filter");
  top.textContent=""; ul.textContent="";
  var q=N.q.trim(), notes=0;
  N.rows.forEach(function(row,i){
    if(row.k==="today"){
      var t=todayNote(), date=NT.diaryTitle(today(),LP.I18N.lang,tr,window.LopdaLunar,true);
      top.appendChild(rowEl(i,tr(t?"notes.today":"notes.todayblank",{date:date})));
    } else if(row.k==="new") top.appendChild(rowEl(i,tr("notes.newnote")));
    else {
      notes++;
      var li=rowEl(i,(row.n.pinned?"◆ ":"")+label(row.n),dateLine(row.n,row));
      ul.appendChild(li);
    }
  });
  top.hidden=!top.childNodes.length;
  if(N.filter){
    var n=live().filter(function(x){ return matches(x,N.filter); }).length;
    f.textContent=tr("notes.filter",{name:filterName(N.filter), n:n})+(q ? " · "+tr("notes.found",{n:notes}) : "");
  } else f.textContent=q ? tr("notes.found",{n:notes}) : "";
  f.hidden=!f.textContent;
  var msg=q ? (notes ? "" : tr("notes.nofound")) : N.filter || live().length ? "" : tr(S.db?"notes.empty":"notes.emptynodb");
  empty.textContent=msg; empty.hidden=!msg;
  renderKeys();
  if(ensure){
    var on=$("notes-main").querySelector("li.on");
    if(on && on.scrollIntoView) on.scrollIntoView({block:"nearest"});
  }
}
function key(name,label,disabled){
  return {label:tr(label),disabled:!!disabled,fn:function(){ listButton(name,true); listButton(name,false); }};
}
function renderKeys(){
  LP.softkeys($("notes-keys"),{
    select:key("select","sk.search"),
    start:key("start","sk.options"),
    b:(N.q.trim() || N.filter) ? key("b","sk.back") : null,
    a:key("a","sk.open",!N.rows.length)
  });
}
function move(k){
  if(!N.rows.length) return;
  var i=Math.max(0,Math.min(N.rows.length-1,N.cur+k));
  if(i===N.cur){ sfx("err"); return; }
  N.cur=i; sfx("move"); render(true);
}
function activate(){
  var row=N.rows[N.cur]; if(!row){ sfx("err"); return; }
  $("notes-q").blur();
  if(row.k==="today") openToday();
  else if(row.k==="new") openNew();
  else openNote(row.n);
}
function back(){
  if(N.q){ N.q=""; $("notes-q").value=""; N.cur=0; sfx("tap"); render(); return; }
  if(N.filter){ N.filter=null; N.cur=0; sfx("tap"); render(); return; }
}
var searchTimer;
$("notes-q").addEventListener("input",function(){
  N.q=this.value;
  clearTimeout(searchTimer);
  searchTimer=setTimeout(function(){ N.cur=0; render(); $("notes-main").scrollTop=0; },SEARCH_WAIT);
});
$("notes-q").addEventListener("keydown",function(e){
  if(e.key==="ArrowDown" || e.key==="Enter"){ e.preventDefault(); toResults(); }
  else if(e.key==="Escape"){ e.preventDefault(); this.blur(); back(); }
});
/* ▼ (or Enter) from the search box: to the first result, keyboard away */
function toResults(){
  clearTimeout(searchTimer);
  N.q=$("notes-q").value; $("notes-q").blur(); N.cur=0; render(true);
}
function focusSearch(){
  var q=$("notes-q");
  if(document.activeElement===q){ toResults(); return; }
  $("notes-main").scrollTop=0; q.focus(); sfx("tap");
}

/* ---------- sheets over the list: options, tags, trash, one note in the trash, the key card ---------- */
function menuRows(){ return [{k:"tags",l:"notes.tagsmenu"},{k:"trash",l:"notes.trash"},{k:"export",l:"notes.exportall"},{k:"import",l:"notes.import"},{k:"help",l:"notes.help"}]; }
function tagRows(){
  var count={}, name={}, list=live();
  list.forEach(function(n){ tagKeys(n).forEach(function(k,i){ count[k]=(count[k]||0)+1; if(!name[k]) name[k]=NT.tags(n.body)[i]; }); });
  var rows=[{k:"diary", n:list.filter(function(n){ return !!n.day; }).length},{k:"quote", n:list.filter(isQuote).length}];
  Object.keys(count).sort(function(a,b){ return (count[b]-count[a]) || (a<b?-1:a>b?1:0); })
    .forEach(function(k){ rows.push({k:"tag", key:k, name:name[k], n:count[k]}); });
  return rows;
}
function trashRows(){ return S.notes.filter(function(n){ return !!n.deleted; }).sort(function(a,b){ return b.deleted-a.deleted; }); }
function openSheet(name){ N.sheet=name; N.armed=""; N.release=null; if(name==="menu") N.pick=0; renderSheet(); }
function closeSheet(){ N.sheet=""; N.armed=""; N.release=null; renderSheet(); render(true); }
function sheetKey(name,label,disabled){
  return {label:tr(label),disabled:!!disabled,fn:function(){ listButton(name,true); listButton(name,false); }};
}
function menuList(sh,rows,pick,text,onTap){
  var ul=el("ul","lcd-menu");
  rows.forEach(function(r,i){
    var li=el("li",i===pick?"on":"");
    var t=text(r,i);
    li.appendChild(el("span","",t[0]));
    if(t[1]!=null) li.appendChild(el("small","",t[1]));
    li.onclick=function(){ onTap(i); };
    ul.appendChild(li);
  });
  sh.appendChild(ul);
  return ul;
}
function title(sh,text,small){
  var t=el("p","sheet-title"); t.appendChild(el("span","",text));
  if(small!=null) t.appendChild(el("small","",small));
  sh.appendChild(t);
}
function renderSheet(){
  var sh=$("notes-sheet"); sh.hidden=!N.sheet; sh.textContent="";
  sh.onclick=null;
  if(!N.sheet) return;
  var keys=el("div"), ul;
  if(N.sheet==="menu"){
    title(sh,tr("sk.options"));
    var rows=menuRows(); N.pick=Math.max(0,Math.min(N.pick,rows.length-1));
    ul=menuList(sh,rows,N.pick,function(r){ return [tr(r.l)]; },function(i){ N.pick=i; menuAct(); });
    sh.appendChild(el("p","hint notes-status",exportStatus()));
    LP.softkeys(keys,{select:null,start:null,b:sheetKey("b","sk.back"),a:sheetKey("a","sk.confirm",N.busy)});
  } else if(N.sheet==="tags"){
    title(sh,tr("notes.tags"));
    var tags=tagRows(); N.tpick=Math.max(0,Math.min(N.tpick,tags.length-1));
    ul=menuList(sh,tags,N.tpick,function(r){ return [r.k==="tag" ? "#"+r.name : filterName(r), String(r.n)]; },function(i){ N.tpick=i; tagAct(); });
    if(tags.length<=2) sh.appendChild(el("p","hint",tr("notes.notags")));
    LP.softkeys(keys,{select:null,start:null,b:sheetKey("b","sk.back"),a:sheetKey("a","sk.filter")});
  } else if(N.sheet==="trash"){
    var trash=trashRows();
    title(sh,tr("notes.trash"),String(trash.length));
    N.trpick=Math.max(0,Math.min(N.trpick,trash.length-1));
    ul=menuList(sh,trash,N.trpick,function(n){ return [label(n), tr("notes.left",{n:daysLeft(n)})]; },function(i){ N.trpick=i; openItem(); });
    if(!trash.length) sh.appendChild(el("p","hint",tr("notes.trashempty")));
    LP.softkeys(keys,{select:null,
      start:{label:tr(N.armed==="clear"?"sk.confirm":"sk.clear"),disabled:!trash.length,fn:function(){ listButton("start",true); listButton("start",false); }},
      b:sheetKey("b","sk.back"),a:sheetKey("a","sk.thisnote",!trash.length)});
  } else if(N.sheet==="item"){
    var n=N.item;
    title(sh,label(n),tr("notes.left",{n:daysLeft(n)}));
    var acts=[tr("notes.restore"), tr(N.armed==="purge"?"notes.purgeconfirm":"notes.purge")];
    N.pick=Math.max(0,Math.min(N.pick,1));
    ul=menuList(sh,acts,N.pick,function(r){ return [r]; },function(i){ N.pick=i; itemAct(); });
    sh.appendChild(el("p","notes-peek",String(n.body||"").slice(0,400)));
    LP.softkeys(keys,{select:null,start:null,b:sheetKey("b","sk.back"),a:sheetKey("a","sk.confirm")});
  } else if(N.sheet==="help"){
    title(sh,tr("notes.help"));
    var card=el("div","notes-help");
    ["notes.h.keys","notes.h.today","notes.h.tags","notes.h.search","notes.h.trash","notes.h.export","notes.h.apple"].forEach(function(k){ card.appendChild(el("p","",tr(k))); });
    card.appendChild(el("p","hint",tr("reader.h.close")));
    sh.appendChild(card);
    sh.onclick=function(){ N.sheet="menu"; sfx("tap"); renderSheet(); };
    return;
  }
  sh.appendChild(keys);
  var on=ul && ul.querySelector("li.on"); if(on && on.scrollIntoView) on.scrollIntoView({block:"nearest"});
}
function daysLeft(n){ return Math.max(0,Math.ceil((n.deleted+TRASH_DAYS*DAY-Date.now())/DAY)); }
function exportStatus(){
  var t=N.meta.exported;
  if(!t) return tr("notes.neverexport");
  var d=Math.floor((Date.now()-t)/DAY);
  return d<1 ? tr("notes.exporttoday") : tr("notes.lastexport",{n:d});
}
/* an A press on the options menu acts on its release (or the tap's click): 全部导出 opens the share sheet and 导入 the
   file picker, and on a phone neither opens from a press (CLAUDE.md) */
function menuAct(){
  var r=menuRows()[N.pick]; if(!r) return;
  if(r.k==="tags"){ N.tpick=0; openSheet("tags"); }
  else if(r.k==="trash"){ N.trpick=0; openSheet("trash"); }
  else if(r.k==="export") exportAll();
  else if(r.k==="import") startImport();
  else if(r.k==="help"){ N.sheet="help"; sfx("tap"); renderSheet(); }
}
function tagAct(){
  var r=tagRows()[N.tpick]; if(!r) return;
  N.filter=r.k==="tag" ? {k:"tag", key:r.key, name:r.name} : {k:r.k};
  N.q=""; $("notes-q").value=""; N.cur=0; sfx("ok");
  closeSheet(); $("notes-main").scrollTop=0;
}
function openItem(){
  var n=trashRows()[N.trpick]; if(!n){ sfx("err"); return; }
  N.item=n; N.pick=0; N.armed=""; N.sheet="item"; sfx("tap"); renderSheet();
}
function itemAct(){
  var n=N.item; if(!n) return;
  if(N.pick===0){
    delete n.deleted; save(n);
    toast(tr("notes.restored")); sfx("ok");
    N.sheet="trash"; renderSheet(); return;
  }
  if(N.armed!=="purge"){ N.armed="purge"; sfx("tap"); renderSheet(); return; }
  purge([n]); toast(tr("notes.purged")); sfx("ok");
  N.armed=""; N.sheet="trash"; renderSheet();
}
function clearTrash(){
  var list=trashRows(); if(!list.length){ sfx("err"); return; }
  if(N.armed!=="clear"){ N.armed="clear"; sfx("tap"); renderSheet(); return; }
  purge(list); toast(tr("notes.emptied")); sfx("ok");
  N.armed=""; renderSheet();
}
function purge(list){
  list.forEach(function(n){
    dropLocal("notes",n.id); delete pending.notes[n.id]; changed();
    if(S.db) S.refs.notes.doc(n.id).delete().catch(function(){ toast(tr("notes.delfail")); });
  });
}

/* ---------- keys on the list ----------
   list: ▲▼ move, A open, B back to all (searching or filtered), START options, SELECT the search box
   options / tags / trash / one note: ▲▼ move, A confirm, B back; trash: START empties it (twice); key card: any key */
function listButton(b,down){
  if(N.sheet) return sheetButton(b,down);
  if(!down) return;
  var q=$("notes-q");
  if(document.activeElement===q && (b==="down" || b==="up")){ toResults(); return; }
  if(b==="up" || b==="down") move(b==="up"?-1:1);
  else if(b==="a") activate();
  else if(b==="b"){ if(N.q || N.filter) back(); else sfx("err"); }
  else if(b==="select") focusSearch();
  else if(b==="start"){ q.blur(); openSheet("menu"); sfx("tap"); }
}
function sheetButton(b,down){
  if(N.sheet==="help"){
    if(!down) return;
    var card=document.querySelector("#notes-sheet .notes-help");
    if((b==="up" || b==="down") && card && card.scrollHeight>card.clientHeight){ card.scrollTop+=(b==="up"?-1:1)*Math.round(card.clientHeight*0.8); return; }
    N.sheet="menu"; sfx("tap"); renderSheet(); return;
  }
  if(b==="a"){
    /* the press marks the row; the release acts, so the share sheet and the file picker open inside a gesture */
    if(down){ N.release=N.sheet; return; }
    var was=N.release; N.release=null;
    if(was!==N.sheet) return;
    if(N.sheet==="menu"){ if(!N.busy) menuAct(); else sfx("err"); }
    else if(N.sheet==="tags") tagAct();
    else if(N.sheet==="trash") openItem();
    else if(N.sheet==="item") itemAct();
    return;
  }
  if(!down) return;
  if(b==="up" || b==="down"){
    var k=b==="up"?-1:1, n, prop;
    if(N.sheet==="menu"){ n=menuRows().length; prop="pick"; }
    else if(N.sheet==="tags"){ n=tagRows().length; prop="tpick"; }
    else if(N.sheet==="trash"){ n=trashRows().length; prop="trpick"; }
    else { n=2; prop="pick"; }
    var i=Math.max(0,Math.min(n-1,N[prop]+k));
    if(i===N[prop]){ sfx("err"); return; }
    N[prop]=i; N.armed=""; sfx("move"); renderSheet();
  }
  else if(b==="b"){
    sfx("tap");
    if(N.sheet==="menu") closeSheet();
    else if(N.sheet==="item"){ N.armed=""; N.sheet="trash"; renderSheet(); }
    else { N.armed=""; N.sheet="menu"; renderSheet(); }
  }
  else if(b==="start" && N.sheet==="trash") clearTrash();
}

/* ---------- the editor ---------- */
function setState(k){ var st=$("note-state"); st.textContent=tr(k); st.setAttribute("data-k",k); if(N.reading) renderWhen(); }
/* a note from the list opens to be read: no keyboard until a tap on the text or A. 今天 and 新建 open to be written */
function openNote(n,write){
  S.editing={id:n.id, body:n.body||"", fresh:false, day:n.day||""};
  startEditor(write);
}
function openNew(){
  var id=S.db?S.refs.notes.doc().id:LP.uid();
  S.editing={id:id, body:"", fresh:true, day:""};
  startEditor(true);
}
/* today: the diary of this day, or a fresh one that exists only once something is typed (no empty diaries left behind) */
function openToday(){
  var t=todayNote();
  if(t){ openNote(t,true); return; }
  freshDiary(today());
}
function freshDiary(k){
  var id=S.db?S.refs.notes.doc().id:LP.uid();
  S.editing={id:id, body:NT.diaryTitle(k,LP.I18N.lang,tr,window.LopdaLunar)+"\n", fresh:true, day:k};
  startEditor(true);
}
function startEditor(write){
  var e=S.editing, ta=$("note-body");
  N.opts=false; N.ecur=-1;
  ta.value=e.body;
  setState(e.fresh?"notes.fresh":"notes.saved");
  show("note");
  renderYears(); renderOpts();
  if(write){ writeAt(e.body.length); ta.scrollTop=e.body.length ? ta.scrollHeight : 0; }
  else { readMode(); $("note-read").scrollTop=0; }
}
/* reading: the text in a plain block, so nothing can take focus and bring up the keyboard; the textarea waits, hidden
   and read-only. The line under the bar says when the note was last changed */
function readMode(){
  var ta=$("note-body"), rd=$("note-read");
  N.reading=true;
  rd.textContent=S.editing ? S.editing.body : "";
  rd.setAttribute("data-ph",tr("notes.placeholder"));
  if(!ta.hidden) rd.scrollTop=ta.scrollTop;
  ta.readOnly=true; ta.hidden=true; rd.hidden=false;
  renderWhen();
}
/* writing, with the caret at a place in the text. Runs inside the tap's or the key's handler: iOS brings up the
   keyboard only for a focus() made there */
function writeAt(at){
  var ta=$("note-body"), rd=$("note-read"), top=rd.hidden ? ta.scrollTop : rd.scrollTop;
  N.reading=false; N.ecur=-1; renderYears();
  ta.readOnly=false; ta.hidden=false; rd.hidden=true;
  ta.scrollTop=top;
  ta.focus({preventScroll:true});
  try{ ta.setSelectionRange(at,at); }catch(x){}
  renderWhen();
}
function renderWhen(){
  var e=S.editing, n=e && byId(e.id), time=$("note-time"), st=$("note-state");
  var showTime=N.reading && n && !e.dirty && !/fail|temp/.test(st.getAttribute("data-k")||"");
  time.textContent=showTime ? NT.when(n.updated||0,"full",tr) : "";
  time.hidden=!showTime; st.hidden=!!showTime;
}
/* where a tap fell in the text: the offset in the body, or the end when the browser cannot say */
function offsetAt(x,y){
  var rd=$("note-read"), node=rd.firstChild, at=null;
  try{
    if(document.caretPositionFromPoint){ var p=document.caretPositionFromPoint(x,y); if(p && p.offsetNode===node) at=p.offset; }
    else if(document.caretRangeFromPoint){ var r=document.caretRangeFromPoint(x,y); if(r && r.startContainer===node) at=r.startOffset; }
  }catch(err){}
  var len=S.editing ? S.editing.body.length : 0;
  return at==null || at>len ? len : at;
}
$("note-read").addEventListener("click",function(ev){
  if(!S.editing || !N.reading || N.opts) return;
  writeAt(offsetAt(ev.clientX,ev.clientY));
});
$("note-body").addEventListener("blur",function(){
  if(!S.editing || N.reading || $("v-note").hidden) return;
  flushNote(); readMode();
});
/* 那年今日: diaries of this month and day in earlier years, newest first, at most YEARS */
function yearsOf(day){
  var md=day.slice(4), y=day.slice(0,4);
  return live().filter(function(n){ return n.day && n.day.slice(4)===md && n.day.slice(0,4)<y; })
    .sort(function(a,b){ return a.day<b.day?1:a.day>b.day?-1:0; }).slice(0,YEARS);
}
function renderYears(){
  var ul=$("note-years"), e=S.editing; ul.textContent="";
  N.years=e && e.day ? yearsOf(e.day) : [];
  ul.hidden=!N.years.length;
  if(!N.years.length) return;
  ul.appendChild(el("li","label",tr("notes.onthisday")));
  N.years.forEach(function(n,i){
    var li=el("li",i===N.ecur?"on":"");
    li.appendChild(el("span","",tr("notes.yearrow",{y:n.day.slice(0,4), text:rest(n.body) || label(n)})));
    li.onclick=function(){ flushNote(); openNote(n,false); };
    ul.appendChild(li);
  });
}
var noteTimer;
$("note-body").addEventListener("input",function(){
  if(!S.editing) return;
  S.editing.body=$("note-body").value; S.editing.dirty=true;
  setState("notes.editing");
  clearTimeout(noteTimer); noteTimer=setTimeout(flushNote,700);
});
function flushNote(){
  clearTimeout(noteTimer);
  var e=S.editing; if(!e || !e.dirty) return;
  e.dirty=false;
  var now=Date.now(), n=byId(e.id);
  if(!n){ n={id:e.id, created:now}; if(e.day) n.day=e.day; }
  n=Object.assign({},n,{body:e.body, updated:now});
  e.fresh=false;
  if(!S.db){ upsert("notes",n); changed(); setState("notes.savedtemp"); return; }
  setState("common.saving");
  save(n).then(function(ok){
    if(S.editing===e){ setState(ok?"notes.saved":"notes.savefail"); renderOpts(); }
    if(!ok) e.dirty=true;
  });
}
function closeEditor(){ flushNote(); S.editing=null; N.opts=false; N.reading=false; leaveEditor(); }
/* back to the notes list, or to the program that opened the diary (LP.notes.openDiary) */
function leaveEditor(){
  var back=N.back; N.back=null;
  if(back) back(); else show("notes");
}
$("note-back").onclick=function(){ closeEditor(); };
$("note-opts").onclick=function(){ toggleOpts(true); };

/* the editor's options: 置顶 / 发送到… / 删除 */
function optRows(){
  var n=S.editing && byId(S.editing.id);
  return [{k:"pin",l:n && n.pinned?"notes.unpin":"notes.pin"},{k:"send",l:"notes.send"},{k:"delete",l:"common.delete"}];
}
function toggleOpts(on){
  if(!S.editing) return;
  N.opts=on; N.opick=0; N.release=null;
  if(on) $("note-body").blur();
  sfx("tap"); renderOpts();
}
function renderOpts(){
  var sh=$("note-sheet"); sh.hidden=!N.opts; sh.textContent="";
  if(!N.opts) return;
  title(sh,tr("sk.options"));
  menuList(sh,optRows(),N.opick,function(r){ return [tr(r.l)]; },function(i){ N.opick=i; optAct(); });
  sh.appendChild(el("p","hint notes-status",noteStatus()));
  var keys=el("div");
  var k=function(name,lbl){ return {label:tr(lbl),fn:function(){ editorButton(name,true); editorButton(name,false); }}; };
  LP.softkeys(keys,{select:null,start:null,b:k("b","sk.back"),a:k("a","sk.confirm")});
  sh.appendChild(keys);
}
/* 创建 … · 修改 … · n 字; a note from before 0.21.0 has no created, so only 修改. A note not saved yet: the count */
function noteStatus(){
  var e=S.editing, n=e && byId(e.id), c=NT.count(e ? e.body : "");
  if(!n) return tr("notes.statusold",{u:"-", n:c});
  var u=NT.when(e.dirty ? Date.now() : n.updated||0,"stamp",tr);
  return n.created ? tr("notes.status",{c:NT.when(n.created,"stamp",tr), u:u, n:c}) : tr("notes.statusold",{u:u, n:c});
}
function optAct(){
  var r=optRows()[N.opick], e=S.editing; if(!r || !e) return;
  if(r.k==="send"){ send(e.body); return; }
  flushNote();
  var n=byId(e.id);
  if(r.k==="pin"){
    if(!n){ n={id:e.id, created:Date.now(), updated:Date.now(), body:e.body}; if(e.day) n.day=e.day; }
    n=Object.assign({},n,{pinned:!n.pinned});
    if(!n.pinned) delete n.pinned;
    save(n); e.fresh=false; setState("notes.saved");
    toast(tr(n.pinned?"notes.pinned":"notes.unpinned")); sfx("ok");
    N.opts=false; renderOpts();
  } else if(r.k==="delete"){
    if(n){ n=Object.assign({},n,{deleted:Date.now()}); save(n); }
    S.editing=null; N.opts=false;
    toast(tr("notes.trashed")); sfx("ok");
    leaveEditor();
  }
}
/* 发送到…: the share sheet with the note's text (Notes, mail, messages are in it), else the clipboard. Called from a release
   or a click, before any promise */
function send(text){
  N.opts=false; renderOpts();
  if(navigator.share){
    var job;
    try{ job=navigator.share({text:text}); }catch(x){ job=Promise.reject(x); }
    job.then(function(){ sfx("ok"); },function(err){
      if(err && err.name==="AbortError") return;
      toast(tr("notes.sharefail")); sfx("err");
    });
    return;
  }
  window.LopdaTextSel.copy(text).then(function(ok){ toast(tr(ok?"notes.copied":"notes.copyfail")); sfx(ok?"ok":"err"); });
}
/* editor keys: B back to the list, START options. Reading: ▲▼ scroll a page (from the top, ▲ goes onto a diary's 那年今日
   rows), A writes with the caret at the end, or opens the 那年今日 row under the cursor. Writing: the other keys are the
   text's. In the options: ▲▼ move, A confirm (on release), B back */
function editorButton(b,down){
  if(N.opts){
    if(b==="a"){
      if(down){ N.release="opts"; return; }
      var was=N.release; N.release=null;
      if(was==="opts") optAct();
      return;
    }
    if(!down) return;
    if(b==="up" || b==="down"){
      var i=Math.max(0,Math.min(optRows().length-1,N.opick+(b==="up"?-1:1)));
      if(i===N.opick){ sfx("err"); return; }
      N.opick=i; sfx("move"); renderOpts();
    }
    else if(b==="b" || b==="start") toggleOpts(false);
    return;
  }
  /* reading, A: on release, so the focus that brings up the keyboard runs inside the gesture */
  if(b==="a"){
    if(!N.reading) return;
    if(down){ N.release="read"; return; }
    if(N.release!=="read") return;
    N.release=null;
    if(N.ecur>=0){ var n=N.years[N.ecur]; flushNote(); openNote(n,false); }
    else writeAt(S.editing ? S.editing.body.length : 0);
    return;
  }
  if(!down) return;
  if(b==="b") closeEditor();
  else if(b==="start") toggleOpts(true);
  /* writing: every other key belongs to the text. Reading: ▲▼ a page of text; above its top, a diary's 那年今日 rows */
  else if(N.reading && (b==="up" || b==="down")) readKey(b==="up"?-1:1);
}
function readKey(dir){
  var rd=$("note-read");
  if(N.ecur>=0 || (dir<0 && rd.scrollTop<=0 && N.years.length)){
    var j=N.ecur<0 ? N.years.length-1 : N.ecur+dir;
    if(j<0){ sfx("err"); return; }
    N.ecur=j>=N.years.length ? -1 : j; sfx("move"); renderYears();
    return;
  }
  var before=rd.scrollTop;
  rd.scrollTop=before+dir*Math.max(24,rd.clientHeight-24);
  sfx(rd.scrollTop===before ? "err" : "move");
}

/* ---------- other programs add to a note by its title (its first line), creating it when there is none: the reader's
   quotes go into a note called 《书名》, the dictionary's into 《词典》. Appends run one at a time, each reading the store
   afresh, so a quote and the thought typed under it land in order. sep goes between the old text and the new (a blank
   line by default). A note in the trash with that title comes back out (a note that is not in the trash wins).
   A new note records where it came from (src) for the 摘抄 group: the dictionary's note name in either language is
   "dict", any other title "reader" (they are the only two callers) ---------- */
var appending=Promise.resolve();
function srcOf(t){
  var STR=LP.I18N.STR, names=Object.keys(STR).map(function(l){ return STR[l]["dict.notename"]; });
  return names.indexOf(t)>=0 ? "dict" : "reader";
}
function append(t,text,sep){
  var job=appending.then(function(){
    if(!S.db) throw new Error(tr("notes.nodb"));
    flushNote();
    return S.refs.notes.get().then(function(q){
      var hit=null;
      q.docs.forEach(function(d){
        var o=own(d.data())||{};
        if(firstLine(o.body)!==t) return;
        var better=!hit || (!o.deleted && hit.o.deleted) || (!o.deleted===!hit.o.deleted && (o.updated||0)>(hit.o.updated||0));
        if(better) hit={id:d.id, o:o};
      });
      var now=Date.now(), n;
      if(hit){
        n=Object.assign({},hit.o,{id:hit.id, body:String(hit.o.body||"").replace(/\s+$/,"")+(sep==null?"\n\n":sep)+text, updated:now});
        delete n.deleted;
      } else n={id:S.refs.notes.doc().id, body:t+"\n\n"+text, updated:now, created:now, src:srcOf(t)};
      if(S.editing && S.editing.id===n.id){ S.editing.body=n.body; $("note-body").value=n.body; if(N.reading) $("note-read").textContent=n.body; }
      return save(n).then(function(ok){
        if(!ok) throw new Error(tr("notes.savefail"));
        return n.id;
      });
    });
  });
  appending=job.catch(function(){});
  return job;
}

/* ---------- 全部导出: one zip, a .md per note (diaries in their own folder), front matter on top, the body untouched ---------- */
function exportAll(){
  var list=sorted(live());
  if(!list.length){ toast(tr("notes.nothing")); sfx("err"); return; }
  var used={}, dir=NT.cleanName(tr("notes.diary"),"diary")+"/";
  var entries=list.map(function(n){
    var meta={created:createdOf(n), updated:n.updated||createdOf(n), tags:NT.tags(n.body), pinned:!!n.pinned, date:n.day||""};
    return {name:NT.fileName(firstLine(n.body),tr("notes.untitled"),used,n.day?dir:"",".md"), data:NT.frontMatter(meta)+String(n.body||""), time:n.updated};
  });
  var zip=Z.write(entries), name="lopda-notes-"+today().replace(/-/g,"")+".zip";
  if(!S.downloads){ toast(LP.saveErr({code:"unavailable"})); sfx("err"); return; }
  S.downloads.save({filename:name, data:new Blob([zip],{type:"application/zip"})}).then(function(){
    N.meta.exported=Date.now(); saveMeta();
    toast(tr("notes.exported",{n:list.length})); sfx("ok");
    if(N.sheet==="menu") renderSheet();
  },function(e){ toast(LP.saveErr(e)); sfx("err"); });
}
function saveMeta(){ if(N.metaRef) put(N.metaRef,{exported:N.meta.exported||0, reminded:N.meta.reminded||0}); }
/* the backup reminder: 20 notes or more and no export for 30 days, at most once in 30 days */
function remind(){
  if(N.reminded || !N.metaRef || !N.metaLoaded) return;
  var count=live().length, now=Date.now(), last=N.meta.exported||0;
  if(count<REMIND_MIN) return;
  N.reminded=true;
  if(last && now-last<REMIND_DAYS*DAY) return;
  if(N.meta.reminded && now-N.meta.reminded<REMIND_DAYS*DAY) return;
  N.meta.reminded=now; saveMeta();
  toast(last ? tr("notes.remind",{n:Math.floor((now-last)/DAY)}) : tr("notes.remindnever"));
}

/* ---------- 导入: .md, .markdown, .txt, or a .zip of them ---------- */
function startImport(){
  if(N.busy){ sfx("err"); return; }
  if(!S.db){ toast(tr("notes.nodb")); sfx("err"); return; }
  $("notes-file").value=""; $("notes-file").click();
}
var TEXT_EXT=/\.(md|markdown|txt)$/i;
function decode(u8){ return new TextDecoder("utf-8").decode(u8).replace(/^﻿/,""); }
function inflate(raw){
  if(typeof DecompressionStream==="undefined"){ var e=new Error(tr("notes.nodeflate")); e.code="noinflate"; throw e; }
  return new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer().then(function(b){ return new Uint8Array(b); });
}
function skipName(path){
  var parts=path.split("/");
  return /^__MACOSX\//.test(path) || parts.some(function(p){ return p.charAt(0)==="."; }) || !TEXT_EXT.test(path);
}
/* every file, read: [{name, text}] or {name, big:true}; a zip's entries one by one */
function readFiles(files,stats){
  var out=[];
  return files.reduce(function(p,f){
    return p.then(function(){
      if(f.size>MAX_FILE){ stats.file++; return; }
      if(/\.zip$/i.test(f.name)){
        return f.arrayBuffer().then(function(b){
          var u8=new Uint8Array(b), entries=Z.list(u8).filter(function(en){ return !en.dir && !skipName(en.name); });
          return entries.reduce(function(q,en){
            return q.then(function(){
              if(out.length>=MAX_IMPORT){ stats.more++; return; }
              if(en.size>MAX_NOTE){ stats.big++; return; }
              return Z.read(u8,en,inflate).then(function(d){ out.push({name:en.name, text:decode(d)}); });
            });
          },Promise.resolve());
        });
      }
      if(!TEXT_EXT.test(f.name) || f.name.charAt(0)===".") return;
      if(out.length>=MAX_IMPORT){ stats.more++; return; }
      if(f.size>MAX_NOTE){ stats.big++; return; }
      return f.arrayBuffer().then(function(b){ out.push({name:f.name, text:decode(new Uint8Array(b))}); });
    });
  },Promise.resolve()).then(function(){ return out; });
}
function importFiles(files){
  var stats={dup:0, big:0, more:0, file:0}, now=Date.now(), added=[];
  N.busy=true; toast(tr("notes.importing")); if(N.sheet) renderSheet();
  return readFiles(files,stats).then(function(items){
    var have={};
    live().forEach(function(n){ have[String(n.body||"").trim()]=true; });
    items.forEach(function(it){
      var fm=NT.parseFront(it.text), body=fm.body.replace(/\r\n?/g,"\n");
      if(!firstLine(body)) body=NT.stem(it.name)+"\n"+body;
      if(new Blob([body]).size>MAX_NOTE){ stats.big++; return; }
      var k=body.trim();
      if(have[k]){ stats.dup++; return; }
      have[k]=true;
      var created=fm.meta.created || fm.meta.updated || now;
      var n={id:S.refs.notes.doc().id, body:body, created:created, updated:fm.meta.updated || created};
      if(fm.meta.pinned) n.pinned=true;
      if(fm.meta.date) n.day=fm.meta.date;
      added.push(n);
    });
    return Promise.all(added.map(save));
  }).then(function(oks){
    var fail=oks.filter(function(ok){ return !ok; }).length;
    var msg=added.length||stats.dup ? tr("notes.imported",{n:added.length-fail}) : tr("notes.importnone");
    if(stats.dup) msg+=tr("notes.skipdup",{n:stats.dup});
    if(stats.big) msg+=tr("notes.skipbig",{n:stats.big});
    if(stats.file) msg+=tr("notes.skipfile",{n:stats.file});
    if(stats.more) msg+=tr("notes.skipmore",{n:stats.more});
    toast(msg); sfx(added.length?"ok":"err");
  },function(e){
    toast(e && e.code==="noinflate" ? tr("notes.nodeflate") : tr("notes.importfail",{msg:String((e&&e.message)||e).slice(0,100)})); sfx("err");
  }).then(function(){
    N.busy=false;
    if(N.sheet) closeSheet(); else render();
  });
}
$("notes-file").addEventListener("change",function(){
  var files=Array.prototype.slice.call(this.files||[]); this.value=""; if(!files.length) return;
  importFiles(files);
});

/* ---------- the trash empties itself: notes deleted more than 30 days ago go for good when the handheld starts ---------- */
function purgeOld(){
  return S.refs.notes.get().then(function(q){
    var now=Date.now();
    q.docs.forEach(function(d){
      var o=d.data()||{};
      if(o.deleted && now-o.deleted>TRASH_DAYS*DAY){ dropLocal("notes",d.id); changed(); S.refs.notes.doc(d.id).delete().catch(function(){}); }
    });
  }).catch(function(){});
}

function openNotes(){
  N.back=null; N.q=""; N.filter=null; N.cur=0; N.sheet=""; N.reminded=false; $("notes-q").value="";
  show("notes");
}

/* ---------- the diaries for other programs (the calendar). They see days, years, titles and snippets, never the notes
   themselves, S.notes or the body format ---------- */
/* the days of that month that have a diary (not in the trash): {1:true, 15:true} */
function diaryDays(year,month){
  var m=index().months[year+"-"+LP.pad2(month)];
  return m ? Object.assign({},m) : {};
}
/* every year's diary of that month and day, newest first: [{day:"2025-10-01", year, title, snippet}] */
function diariesOn(month,day){
  return (index().md[LP.pad2(month)+"-"+LP.pad2(day)]||[]).map(function(n){
    return {day:n.day, year:+n.day.slice(0,4), title:firstLine(n.body), snippet:NT.snippet(n.body)};
  });
}
/* opens the diary of a day ("2026-10-01", today or earlier) as 今天 does: today's to write, an earlier one to read, and a day
   without one as a fresh diary of that day, which exists only once something is typed. A future day: false. While it is
   in the editor (also after a 那年今日 row), B and ◂ 列表 call onBack instead of showing the list; HOME goes home */
function openDiary(day,onBack){
  if(!NT.parseDay(day) || day>today()) return false;
  N.opts=false;
  var n=index().days[day];
  if(n) openNote(n,day===today());
  else freshDiary(day);
  N.back=typeof onBack==="function" ? onBack : null;
  return true;
}

LP.flushNote=flushNote;
LP.notes={append:append, diaryDays:diaryDays, diariesOn:diariesOn, openDiary:openDiary};
LP.onData("notes",function(){
  changed();
  if(!$("v-notes").hidden){ render(); if(N.sheet) renderSheet(); remind(); }
  if(!$("v-note").hidden && S.editing){ renderYears(); if(N.reading) renderWhen(); }
});
LP.padRoute("notes",function(b,down){
  if(!$("v-notes").hidden){ listButton(b,down); return true; }
  if(!$("v-note").hidden){ editorButton(b,down); return true; }
  return false;
});
LP.builtin({id:"notes", label:"app.notes", icon:"notes", view:"notes", keepPad:true,
  open:openNotes,
  enter:function(){ LP.showPad(true); renderSheet(); render(true); LP.refresh("notes"); remind(); },
  leave:function(){ $("notes-q").blur(); N.sheet=""; N.release=null; renderSheet(); },
  lang:function(){ if(!$("v-notes").hidden){ render(); renderSheet(); } if(!$("v-note").hidden){ renderYears(); renderOpts(); renderWhen(); } },
  ready:function(){
    N.metaRef=S.db.doc("data/users/local/notes-meta");
    N.metaRef.get().then(function(sn){
      var d=sn.exists ? own(sn.data()) : null;
      if(d) N.meta={exported:+d.exported||0, reminded:+d.reminded||0};
      N.metaLoaded=true;
      if(!$("v-notes").hidden){ remind(); if(N.sheet==="menu") renderSheet(); }
    }).catch(function(){ N.metaLoaded=true; });
    purgeOld();
  }});
/* the editor is its own view; it keeps the chin pad for B and START */
LP.builtin({id:"note", view:"note", keepPad:true,
  enter:function(){ LP.showPad(true); },
  leave:function(){ N.opts=false; N.back=null; renderOpts(); }});
})();
