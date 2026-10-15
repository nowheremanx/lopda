/*
 * Lo-PDA built-in: dictionary (文曲星-style). A word box with candidates, entries paged on one screen,
 * history, a word book with review, and StarDict dictionaries the user imports. Design: docs/design/reader-dictionary.md.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * Engine: runtime/stardict.js. The built-in ECDICT (vendor/ecdict/, made by tools/gen-ecdict.mjs) is read from the
 * offline cache each start and never stored twice; imported books keep their index and their text in
 * LopdaPlatform.files ("dict/<id>/index", "dict/<id>/data" as a Blob, read entry by entry).
 * Other programs look words up with LP.dict.lookup(word) -> Promise<[{book, name, word, head, how, text}]>
 * (and use the word book through LP.dict.inBook(word), LP.dict.toggleWord(word)),
 * how = "exact" | "lemma" | "prefix" (a .syn entry reports its headword in head).
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, SD=window.LopdaStarDict, P=window.LopdaPlatform;
var own=LP.own, toast=LP.toast, put=LP.put, sfx=LP.sfx, show=LP.show, showPad=LP.showPad, uid=LP.uid;

var BUILTIN="ecdict", VENDOR="vendor/ecdict/ecdict";
var MAX_HISTORY=50, MAX_WORDS=2000, MAX_CAND=40;

var D={
  set:{order:[BUILTIN], history:[], words:[]},   // data/users/local/dict: book order, history, word book [{w, t}]
  meta:{},                  // imported book id -> {name, words, syns, added}
  books:{},                 // id -> loaded book (stardict.js), or a promise while loading
  lemma:null,               // ECDICT word forms: form -> lemma
  refs:null, loading:null,
  q:"", cand:[], pick:0,    // the word box, its candidate rows and the highlighted one
  sheet:"", entry:null,     // "entry" | "words" | "books"; the entry on screen {word, results, back}
  bpick:0, wpick:0, listScroll:0, selectedText:"",
  review:null               // {i, shown}: reviewing the word book from word i
};

/* ---------- books ---------- */
function fetchBytes(url){ return fetch(url).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.arrayBuffer(); }).then(function(b){ return new Uint8Array(b); }); }
function loadBuiltin(){
  return Promise.all([
    fetch(VENDOR+".ifo").then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.text(); }),
    fetchBytes(VENDOR+".idx"), fetchBytes(VENDOR+".dict.dz"),
    fetchBytes(VENDOR+".lemma.gz").then(SD.gunzip)
  ]).then(function(a){
    D.lemma=SD.parseLemma(new TextDecoder().decode(a[3]));
    return SD.open({ifo:a[0], idx:a[1], dict:a[2]});
  });
}
function loadImported(id){
  return Promise.all([P.files.get("dict/"+id+"/index"), P.files.get("dict/"+id+"/data")]).then(function(a){
    if(!a[0] || !a[1]) throw new Error("missing");
    return {info:a[0].info, name:a[0].info.bookname, index:SD.prepare(a[0].index), data:a[1]};
  });
}
function book(id){
  var b=D.books[id];
  if(b) return b.then ? b : Promise.resolve(b);
  var p=(id===BUILTIN ? loadBuiltin() : loadImported(id)).then(function(bk){ D.books[id]=bk; return bk; },function(e){ delete D.books[id]; throw e; });
  D.books[id]=p;
  return p;
}
function order(){ return D.set.order.filter(function(id){ return id===BUILTIN || D.meta[id]; }); }
/* every book in the user's order; one that cannot be read is skipped (and said once), the rest still answer */
function loaded(){
  return Promise.all(order().map(function(id){
    return book(id).then(function(b){ return {id:id, b:b}; },function(e){
      if(!D.warned){ D.warned=true; toast(tr("dict.loadfail",{msg:String((e&&e.message)||e).slice(0,80)})); }
      return null;
    });
  })).then(function(list){ return list.filter(Boolean); });
}

/* ---------- lookup ---------- */
function readAll(list,word,how){
  var jobs=[];
  list.forEach(function(x){
    var seen={};
    SD.find(x.b.index,word).forEach(function(pos){
      var key=x.b.index.off[pos]+":"+x.b.index.len[pos]; if(seen[key]) return; seen[key]=true;
      jobs.push(SD.read(x.b,pos).then(function(r){ return {book:x.id, name:x.b.name, word:r.word, head:r.head, how:how, text:r.text}; }));
    });
  });
  return Promise.all(jobs);
}
function lemmasOf(word){ return D.lemma ? SD.lemmas(D.lemma,word) : []; }
/* exact match, then the word's base forms (running -> run), then the nearest headwords */
function lookup(word){
  var w=String(word==null?"":word).trim();
  if(!w) return Promise.resolve([]);
  return loaded().then(function(list){
    return readAll(list,w,"exact").then(function(r){
      if(r.length) return r;
      return Promise.all(lemmasOf(w).map(function(l){ return readAll(list,l,"lemma"); })).then(function(rs){ return [].concat.apply([],rs); });
    }).then(function(r){
      if(r.length) return r;
      return Promise.all(candidates(list,w,3).map(function(c){ return readAll(list,c,"prefix"); })).then(function(rs){ return [].concat.apply([],rs); });
    });
  });
}
/* headwords starting with p across the books, in key order, one row per spelling */
function candidates(list,p,n){
  var seen={}, out=[];
  list.forEach(function(x){
    SD.prefix(x.b.index,p,n).forEach(function(pos){ var w=x.b.index.words[pos]; if(!seen[w]){ seen[w]=true; out.push(w); } });
  });
  out.sort(function(a,b){ var ka=SD.fold(a), kb=SD.fold(b); return ka<kb?-1:ka>kb?1:(a<b?-1:a>b?1:0); });
  return out.slice(0,n);
}
function suggest(p,n){ return loaded().then(function(list){ return candidates(list,p,n||MAX_CAND); }); }

/* ---------- storage ---------- */
function saveSet(){ if(D.refs) put(D.refs.set,D.set); }
function remember(word){
  D.set.history=[word].concat(D.set.history.filter(function(w){ return w!==word; })).slice(0,MAX_HISTORY);
  saveSet();
}
function inBook(word){ return D.set.words.some(function(x){ return x.w===word; }); }
function toggleWord(word){
  if(inBook(word)){ D.set.words=D.set.words.filter(function(x){ return x.w!==word; }); toast(tr("dict.removed")); sfx("tap"); }
  else { D.set.words=[{w:word, t:Date.now()}].concat(D.set.words).slice(0,MAX_WORDS); toast(tr("dict.added")); sfx("ok"); }
  saveSet();
}

/* ---------- main screen: the word box and its candidates ---------- */
function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function btn(cls,text,fn){ var b=el("button",cls,text); b.type="button"; b.onclick=fn; return b; }
function keyBtn(cls,key,label,fn){ var b=btn(cls,null,fn); b.appendChild(el("i","",key)); b.appendChild(document.createTextNode(label)); return b; }
var seq=0;
function update(){
  var q=D.q.trim(), mine=++seq;
  if(!q){ D.cand=D.set.history.map(function(w){ return {w:w}; }); D.pick=0; renderList(); return; }
  loaded().then(function(list){
    if(mine!==seq) return;
    var rows=candidates(list,q,MAX_CAND).map(function(w){ return {w:w}; });
    /* not a headword anywhere: its base forms come first (ran -> run), so A and Enter look up what was meant */
    var exact=list.some(function(x){ return SD.find(x.b.index,q).length>0; });
    if(!exact) rows=lemmasOf(q).map(function(l){ return {w:l, from:q}; }).concat(rows);
    D.cand=rows; D.pick=0; renderList();
  });
}
function renderList(ensureVisible){
  var ul=$("dict-list"); ul.textContent="";
  var q=D.q.trim();
  $("dict-history").textContent=!q && D.cand.length ? tr("dict.history") : "";
  $("dict-history").hidden=!(!q && D.cand.length);
  ul.scrollTop=D.listScroll;
  if(!D.cand.length){ ul.appendChild(el("li","label",q ? tr("dict.notfound",{w:q}) : tr("dict.nohistory"))); return; }
  D.pick=Math.max(0,Math.min(D.pick,D.cand.length-1));
  D.cand.forEach(function(c,i){
    var li=el("li",i===D.pick?"on":"");
    li.appendChild(el("span","",c.from ? tr("dict.lemma",{w:c.from, base:c.w}) : c.w));
    li.onclick=function(){ D.pick=i; openEntry(c.w,"",false,i); };
    ul.appendChild(li);
  });
  ul.scrollTop=D.listScroll;
  var on=ensureVisible && ul.querySelector("li.on");
  if(on && on.scrollIntoView) on.scrollIntoView({block:"nearest"});
}
 $("dict-list").addEventListener("scroll",function(){ D.listScroll=this.scrollTop; });
function note(){
  var standalone=navigator.standalone===true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  $("dict-note").textContent=standalone ? "" : tr("common.pwa");
}
function go(){
  var c=D.cand[D.pick], q=D.q.trim();
  if(c) openEntry(c.w,"",false,D.pick); else if(q) openEntry(q);
}
$("dict-q").addEventListener("input",function(){ D.q=$("dict-q").value; D.pick=0; D.listScroll=0; update(); });
$("dict-q").addEventListener("keydown",function(e){
  if(D.sheet) return;
  if(e.key==="Enter"){ e.preventDefault(); go(); }
  else if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); move(e.key==="ArrowUp"?-1:1); }
});
function move(k){ if(!D.cand.length) return; D.pick=Math.max(0,Math.min(D.cand.length-1,D.pick+k)); sfx("move"); renderList(true); }
$("dict-words-btn").onclick=function(){ openSheet("words"); };
$("dict-books-btn").onclick=function(){ openSheet("books"); };

/* ---------- sheets ---------- */
function openSheet(name){ D.sheet=name; if(name==="books") D.bpick=0; renderSheet(); }
function closeSheet(){
  var back=D.entry && D.entry.back;
  D.entry=null; D.review=null;
  if(back){ D.sheet=back; renderSheet(); return; }
  D.sheet=""; D.selectedText=""; renderSheet(); renderList();
}
function renderSheet(){
  var sh=$("dict-sheet"); sh.hidden=!D.sheet; sh.textContent="";
  if(D.sheet==="entry") entrySheet(sh);
  else if(D.sheet==="words") wordsSheet(sh);
  else if(D.sheet==="books") booksSheet(sh);
}

/* an entry: every book's answer, in one scrollable text area */
function openEntry(word,back,review,pick){
  $("dict-q").blur();
  D.entry={word:word, results:null, back:back||"", shown:!review, pick:pick==null ? -1 : pick, scrollTop:0};
  D.selectedText="";
  D.sheet="entry"; renderSheet();
  var mine=D.entry;
  lookup(word).then(function(r){
    if(D.entry!==mine) return;
    mine.results=r;
    if(r.length && r[0].how!=="prefix" && !review) remember(r[0].how==="lemma" ? r[0].word : word);
    renderSheet();
  },function(e){ if(D.entry===mine){ mine.results=[]; mine.error=String((e&&e.message)||e); renderSheet(); } });
}
function headOf(e){ var r=e.results; return r && r.length && r[0].how!=="exact" ? r[0].word : e.word; }
function entrySheet(sh){
  var e=D.entry, word=headOf(e), title=el("p","sheet-title");
  title.appendChild(el("span","",word));
  sh.appendChild(title);
  var page=el("div","dict-page"); page.id="dict-page";
  if(!e.shown){ page.appendChild(el("span","big",e.word)); }
  else if(!e.results) page.appendChild(document.createTextNode(tr("dict.loading")));
  else if(!e.results.length) page.appendChild(document.createTextNode(e.error ? tr("dict.loadfail",{msg:e.error}) : tr("dict.notfound",{w:e.word})));
  else {
    if(e.results[0].how==="lemma") page.appendChild(document.createTextNode(tr("dict.lemma",{w:e.word, base:e.results[0].word})+"\n"));
    if(e.results[0].how==="prefix") page.appendChild(document.createTextNode(tr("dict.notfound",{w:e.word})+" · "+tr("dict.near")+"\n"));
    var last=null;
    e.results.forEach(function(r){
      var label=r.name+(r.word!==word ? " · "+r.word : "")+(r.head && r.head!==r.word ? " → "+r.head : "");
      if(label!==last){ page.appendChild(el("b","",label)); page.appendChild(document.createTextNode("\n")); last=label; }
      page.appendChild(document.createTextNode(r.text+"\n"));
    });
  }
  page.scrollTop=e.scrollTop||0;
  page.addEventListener("scroll",function(){ e.scrollTop=page.scrollTop; });
  sh.appendChild(page);
  var keys=el("div","dict-keys");
  var mark=inBook(word) ? tr("dict.inbook") : tr("dict.add");
  if(D.review){
    keys.appendChild(keyBtn("ck","◀",tr("dict.prev"),function(){ step(-1); }));
    keys.appendChild(keyBtn("ck ck-a","A",tr(e.shown?"dict.next":"dict.reveal"),function(){ reviewA(); }));
    keys.appendChild(keyBtn("ck","START",mark,function(){ toggleWord(word); renderSheet(); }));
    keys.appendChild(keyBtn("ck","▶",tr("dict.next"),function(){ step(1); }));
  } else {
    var prev=keyBtn("ck dict-prev-match","◀",tr("dict.prev"),function(){ stepMatch(-1); });
    var next=keyBtn("ck dict-next-match","▶",tr("dict.next"),function(){ stepMatch(1); });
    prev.disabled=e.pick<=0; next.disabled=e.pick<0 || e.pick>=D.cand.length-1;
    keys.appendChild(prev);
    keys.appendChild(keyBtn("ck","B",tr("dict.back"),function(){ closeSheet(); }));
    if(e.results && e.results.length) keys.appendChild(keyBtn("ck","START",mark,function(){ toggleWord(word); renderSheet(); }));
    keys.appendChild(next);
  }
  var copy=keyBtn("ck dict-action dict-copy","",tr("dict.copy"),copySelected), noteBtn=keyBtn("ck dict-action dict-note","",tr("dict.note"),noteSelected);
  copy.disabled=true; noteBtn.disabled=true;
  keys.appendChild(copy); keys.appendChild(noteBtn);
  sh.appendChild(keys);
  updateEntryActions();
  if(D.review) title.appendChild(el("small","",tr("dict.of",{i:D.review.i+1, n:D.set.words.length})));
}
function stepMatch(k){
  if(!D.entry || D.entry.pick<0) return;
  var i=D.entry.pick+k;
  if(i<0 || i>=D.cand.length) return;
  var c=D.cand[i];
  D.pick=i; D.listScroll=$("dict-list").scrollTop;
  sfx("move"); openEntry(c.w,"",false,i);
}
function scrollEntry(k){
  var page=$("dict-page");
  if(!page) return;
  page.scrollTop+=k*Math.max(48,Math.floor(page.clientHeight*.8));
}
function selectedEntryText(){
  var page=$("dict-page"), sel=window.getSelection();
  if(!page || !sel || sel.isCollapsed || !sel.rangeCount) return "";
  var r=sel.getRangeAt(0);
  if(!page.contains(r.startContainer) || !page.contains(r.endContainer)) return "";
  return sel.toString().trim();
}
function updateEntryActions(){
  D.selectedText=selectedEntryText();
  var sh=$("dict-sheet"), active=!!D.selectedText;
  var copy=sh.querySelector(".dict-copy"), noteBtn=sh.querySelector(".dict-note");
  if(copy) copy.disabled=!active;
  if(noteBtn) noteBtn.disabled=!active;
}
function selectionChanged(){
  if(D.sheet==="entry") updateEntryActions();
}
document.addEventListener("selectionchange",selectionChanged);
function copyOld(text){
  var ta=el("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta); ta.select();
  var ok=false; try{ ok=document.execCommand("copy"); }catch(e){}
  ta.remove(); return ok;
}
function copySelected(){
  var text=D.selectedText||selectedEntryText();
  if(!text) return;
  var done=function(){ toast(tr("dict.copied")); sfx("ok"); };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done,function(){ if(copyOld(text)) done(); else { toast(tr("dict.copyfail")); sfx("err"); } });
    return;
  }
  if(copyOld(text)) done(); else { toast(tr("dict.copyfail")); sfx("err"); }
}
function noteSelected(){
  var text=D.selectedText||selectedEntryText();
  if(!text) return;
  if(!LP.notes){ toast(tr("dict.notefail")); sfx("err"); return; }
  LP.notes.append(tr("dict.notename"),tr("dict.notetext",{word:headOf(D.entry), text:text})).then(function(){
    toast(tr("dict.noted")); sfx("ok");
  },function(){ toast(tr("dict.notefail")); sfx("err"); });
}

/* the word book: newest first; A reviews from the highlighted word, one word at a time */
function wordsSheet(sh){
  var title=el("p","sheet-title"); title.appendChild(el("span","",tr("dict.words")));
  title.appendChild(el("small","",tr("dict.count",{n:D.set.words.length}))); sh.appendChild(title);
  var ul=el("ul","lcd-menu");
  if(!D.set.words.length) sh.appendChild(el("p","hint",tr("dict.nowords")));
  D.wpick=Math.max(0,Math.min(D.wpick,D.set.words.length-1));
  D.set.words.forEach(function(x,i){
    var li=el("li",i===D.wpick?"on":""); li.appendChild(el("span","",x.w)); li.appendChild(el("small","",LP.fmt(x.t)));
    li.onclick=function(){ D.wpick=i; startReview(i); };
    ul.appendChild(li);
  });
  sh.appendChild(ul);
  var keys=el("div","dict-keys");
  keys.appendChild(keyBtn("ck","B",tr("dict.back"),function(){ closeSheet(); }));
  if(D.set.words.length) keys.appendChild(keyBtn("ck ck-a","A",tr("dict.review"),function(){ startReview(D.wpick); }));
  sh.appendChild(keys);
  var on=ul.querySelector("li.on"); if(on && on.scrollIntoView) on.scrollIntoView({block:"nearest"});
}
function startReview(i){
  if(!D.set.words.length) return;
  D.review={i:i};
  openEntry(D.set.words[i].w,"words",true);
}
function step(k){
  var n=D.set.words.length; if(!n){ closeSheet(); return; }
  var i=(D.review.i+k+n)%n; D.review.i=i; D.wpick=i; sfx("move");
  var r=D.review; openEntry(D.set.words[i].w,"words",true); D.review=r;
}
function reviewA(){
  if(!D.entry.shown){ D.entry.shown=true; sfx("tap"); renderSheet(); return; }
  step(1);
}

/* the books: order, delete (two taps), import */
function booksSheet(sh){
  var ids=order();
  var title=el("p","sheet-title"); title.appendChild(el("span","",tr("dict.books"))); sh.appendChild(title);
  var ul=el("ul","lcd-menu");
  D.bpick=Math.max(0,Math.min(D.bpick,ids.length-1));
  ids.forEach(function(id,i){
    var li=el("li",i===D.bpick?"on":""), m=id===BUILTIN ? null : D.meta[id];
    li.appendChild(el("span","",m ? LP.noEmoji(m.name) : "ECDICT"));
    li.appendChild(el("small","",m ? tr("dict.entries",{n:m.words}) : tr("dict.builtin")));
    li.onclick=function(){ D.bpick=i; D.armed=null; renderSheet(); };
    ul.appendChild(li);
  });
  sh.appendChild(ul);
  sh.appendChild(el("p","hint",D.busy ? D.busy : tr("dict.importnote")));
  var keys=el("div","dict-keys"), cur=ids[D.bpick];
  keys.appendChild(keyBtn("ck","B",tr("dict.back"),function(){ D.armed=null; closeSheet(); }));
  keys.appendChild(btn("btn ghost",tr("dict.up"),function(){ shift(-1); }));
  keys.appendChild(btn("btn ghost",tr("dict.down"),function(){ shift(1); }));
  var del=btn(D.armed===cur?"btn":"btn ghost",D.armed===cur ? tr("common.confirm",{what:tr("common.delete")}) : tr("common.delete"),function(){
    if(D.armed===cur){ D.armed=null; removeBook(cur); } else { D.armed=cur; renderSheet(); }
  });
  del.disabled=cur===BUILTIN || !!D.busy;
  keys.appendChild(del);
  var imp=btn("btn",tr("dict.import"),function(){
    if(!S.db){ toast(tr("dict.nodb")); sfx("err"); return; }
    $("dict-file").value=""; $("dict-file").click();
  });
  imp.disabled=!!D.busy;
  keys.appendChild(imp);
  sh.appendChild(keys);
}
function shift(k){
  var ids=order(), i=D.bpick, j=i+k; if(j<0 || j>=ids.length) return;
  var t=ids[i]; ids[i]=ids[j]; ids[j]=t;
  D.set.order=ids; D.bpick=j; D.armed=null; sfx("move"); saveSet(); renderSheet();
}
function removeBook(id){
  if(id===BUILTIN) return;
  D.set.order=D.set.order.filter(function(x){ return x!==id; });
  delete D.meta[id]; delete D.books[id];
  saveSet(); renderSheet();
  Promise.all([D.refs.books.doc(id).delete(), P.files.del("dict/"+id+"/index"), P.files.del("dict/"+id+"/data")])
    .catch(function(){ toast(tr("dict.delfail")); });
}

/* ---------- import: all the files of one or more books at once ---------- */
function stem(name,exts){
  var low=name.toLowerCase();
  for(var i=0;i<exts.length;i++) if(low.slice(-exts[i].length)===exts[i]) return name.slice(0,-exts[i].length);
  return null;
}
function group(files){
  var byStem={}, ifos=[];
  files.forEach(function(f){
    var s;
    if((s=stem(f.name,[".ifo"]))!==null){ ifos.push(s); (byStem[s]=byStem[s]||{}).ifo=f; }
    else if((s=stem(f.name,[".idx.gz",".idx"]))!==null) (byStem[s]=byStem[s]||{}).idx=f;
    else if((s=stem(f.name,[".dict.dz",".dict"]))!==null) (byStem[s]=byStem[s]||{}).dict=f;
    else if((s=stem(f.name,[".syn"]))!==null) (byStem[s]=byStem[s]||{}).syn=f;
  });
  if(!ifos.length) throw new Error(tr("dict.noifo"));
  return ifos.map(function(s){
    var g=byStem[s];
    if(!g.idx) throw new Error(tr("dict.missing",{name:s, ext:".idx"}));
    if(!g.dict) throw new Error(tr("dict.missing",{name:s, ext:".dict"}));
    g.stem=s; return g;
  });
}
function bytesOf(f){ return f.arrayBuffer().then(function(b){ return new Uint8Array(b); }); }
function importOne(g){
  D.busy=tr("dict.importing",{name:g.stem}); renderSheet();
  return Promise.all([g.ifo.text(), bytesOf(g.idx), bytesOf(g.dict), g.syn ? bytesOf(g.syn) : null]).then(function(a){
    return SD.open({ifo:a[0], idx:a[1], dict:a[2], syn:a[3]||undefined});
  }).then(function(bk){
    var name=LP.noEmoji(bk.name)||g.stem;
    for(var k in D.meta) if(D.meta[k].name===name && D.meta[k].words===bk.info.wordcount) throw new Error(tr("dict.dup",{name:name}));
    var id=uid(), ix=bk.index, blob=new Blob([bk.data]);
    /* the search keys are rebuilt on load; storing them would double the index */
    var stored={info:bk.info, index:{words:ix.words, off:ix.off, len:ix.len, head:ix.head}};
    var meta={name:name, words:bk.info.wordcount, syns:bk.info.synwordcount||0, added:Date.now()};
    return P.files.put("dict/"+id+"/index",stored).then(function(){ return P.files.put("dict/"+id+"/data",blob); })
      .then(function(){ return put(D.refs.books.doc(id),meta); }).then(function(ok){
        if(!ok) throw new Error(tr("common.savefail",{code:"?"}));
        D.meta[id]=meta; D.books[id]={info:bk.info, name:bk.name, index:bk.index, data:blob};
        D.set.order=order().concat([id]); saveSet();
        toast(tr("dict.imported",{name:name, n:meta.words})); sfx("ok");
      });
  });
}
$("dict-file").addEventListener("change",function(){
  var files=Array.prototype.slice.call(this.files||[]); if(!files.length) return;
  var groups;
  try{ groups=group(files); }catch(e){ toast(tr("dict.importfail",{msg:e.message})); sfx("err"); return; }
  groups.reduce(function(p,g){ return p.then(function(){ return importOne(g); }); },Promise.resolve())
    .catch(function(e){ toast(tr("dict.importfail",{msg:String((e&&e.message)||(e&&e.code)||e).slice(0,100)})); sfx("err"); })
    .then(function(){ D.busy=null; D.bpick=order().length-1; if(D.sheet==="books") renderSheet(); });
});

/* ---------- chin pad ----------
   main: ▲▼ pick, A look up, B clear, SELECT word book, START books
   entry: ◀▶ nearby matches, ▲▼ scroll, B (or A) back, START word book; review: A show / next, ◀▶ words, ▲▼ scroll, START word book, B back
   (B is "back" everywhere on the handheld, so the word book sits on START)
   word book and books: ▲▼ pick, A open (review), B back */
function dictButton(b){
  if(b==="select" && D.sheet){ closeSheet(); return; }
  if(D.sheet==="entry"){
    var w=headOf(D.entry), has=D.entry.results && D.entry.results.length;
    if(D.review){
      if(b==="a") reviewA();
      else if(b==="left"||b==="right") step(b==="left"?-1:1);
      else if(b==="up"||b==="down") scrollEntry(b==="up"?-1:1);
      else if(b==="start"){ toggleWord(w); renderSheet(); }
      else if(b==="b") closeSheet();
      return;
    }
    if(b==="left"||b==="right") stepMatch(b==="left"?-1:1);
    else if(b==="up"||b==="down") scrollEntry(b==="up"?-1:1);
    else if(b==="a"||b==="b") closeSheet();
    else if(b==="start" && has){ toggleWord(w); renderSheet(); }
    return;
  }
  if(D.sheet==="words"){
    var n=D.set.words.length;
    if(b==="up"||b==="down"){ if(n){ D.wpick=Math.max(0,Math.min(n-1,D.wpick+(b==="up"?-1:1))); sfx("move"); renderSheet(); } }
    else if(b==="a") startReview(D.wpick);
    else if(b==="b"||b==="start") closeSheet();
    return;
  }
  if(D.sheet==="books"){
    var m=order().length;
    if(b==="up"||b==="down"){ D.bpick=Math.max(0,Math.min(m-1,D.bpick+(b==="up"?-1:1))); D.armed=null; sfx("move"); renderSheet(); }
    else if(b==="b"||b==="start"){ D.armed=null; closeSheet(); }
    return;
  }
  if(b==="up"||b==="down") move(b==="up"?-1:1);
  else if(b==="a") go();
  else if(b==="b"){ D.q=""; $("dict-q").value=""; update(); }
  else if(b==="select") openSheet("words");
  else if(b==="start") openSheet("books");
}
LP.padRoute("dict",function(b,down){ if($("v-dict").hidden) return false; if(down) dictButton(b); return true; });

/* ---------- home icon: a closed book with an A on the cover ---------- */
var ICON=["................","...00000000000..","..0111111111110.","..0133333333100.","..0133300333100.","..0133033033100.","..0130333303100.","..0130000003100.","..0130333303100.","..0130333303100.","..0133333333100.","..0111111111100.","..0222222222220.","..0233333333330.","...00000000000..","................"];

function openDict(){
  D.sheet=""; D.entry=null; D.review=null; D.q=""; D.listScroll=0; $("dict-q").value="";
  show("dict"); showPad(true); note(); update();
  /* the browser may clear a site's data after a while unless it is persistent (a Home Screen app always is) */
  P.persist().catch(function(){});
  if(!D.loading) D.loading=loaded();
}

/* the reader shares the word book: START on an entry there adds or removes it, as here */
LP.dict={lookup:lookup, suggest:suggest, inBook:inBook, toggleWord:toggleWord};
LP.builtin({id:"dict", label:"app.dict", icon:function(){ return ICON; }, view:"dict", keepPad:true,
  open:function(){ openDict(); },
  leave:function(){ D.sheet=""; D.entry=null; D.review=null; D.armed=null; var i=$("dict-q"); if(i) i.blur(); },
  lang:function(){ if(!$("v-dict").hidden){ note(); renderSheet(); update(); } },
  ready:function(){
    var base=S.db.doc("data/users/local/dict");
    D.refs={set:base, books:base.collection("books")};
    Promise.all([
      base.get().then(function(sn){
        var s=(sn.exists && own(sn.data()))||{};
        D.set={order:Array.isArray(s.order)&&s.order.length ? s.order : [BUILTIN], history:Array.isArray(s.history)?s.history:[], words:Array.isArray(s.words)?s.words:[]};
        if(D.set.order.indexOf(BUILTIN)<0) D.set.order.unshift(BUILTIN);
      }),
      D.refs.books.get().then(function(q){
        q.docs.forEach(function(doc){ var m=own(doc.data()); if(m && m.name) D.meta[doc.id]=m; });
      })
    ]).then(function(){
      order().forEach(function(id){ if(D.set.order.indexOf(id)<0) D.set.order.push(id); });
      for(var id in D.meta) if(D.set.order.indexOf(id)<0) D.set.order.push(id);
      if(!$("v-dict").hidden){ renderSheet(); update(); }
    }).catch(function(){});
  }});
})();
