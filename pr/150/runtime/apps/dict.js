/*
 * Lo-PDA built-in: dictionary (文曲星-style). A word box with candidates, entries paged on one screen,
 * history, a word book with review, and StarDict dictionaries the user imports. Design: docs/design/reader-dictionary.md.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * Engine: runtime/stardict.js. The built-in ECDICT (vendor/ecdict/, made by tools/gen-ecdict.mjs) is read from the
 * offline cache each start and never stored twice; imported books keep their index and their text in
 * LopdaPlatform.files ("dict/<id>/index", "dict/<id>/data" as a Blob, read entry by entry).
 * Other programs look words up with LP.dict.lookup(word) -> Promise<[{book, name, word, head, how, text}]>
 * (and use the word book through LP.dict.inBook(word), LP.dict.inBookMany(words), LP.dict.toggleWord(word),
 * LP.dict.setWord(word, on)),
 * how = "exact" | "lemma" | "prefix" (a .syn entry reports its headword in head).
 * Community apps ask through PAD.dict (SPEC.md 6.7): runtime/wordlist.js over the built-in ECDICT only, with the word list
 * as one small file and the book shared with this program, both lent out as LP.dict.apps (runtime/apps/store.js relays).
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, SD=window.LopdaStarDict, P=window.LopdaPlatform, TS=window.LopdaTextSel;
var own=LP.own, toast=LP.toast, put=LP.put, sfx=LP.sfx, show=LP.show, showPad=LP.showPad, uid=LP.uid;

var BUILTIN="ecdict", VENDOR="vendor/ecdict/ecdict";
var MAX_HISTORY=50, MAX_WORDS=2000, MAX_CAND=40, MAX_LEVELS=10, LINE=24;   // LINE: an entry's line height (lopda.css .dict-page)

var D={
  set:{order:[BUILTIN], disabled:[], history:[], words:[]},   // data/users/local/dict: book order, disabled ids, history, word book [{w, t}]
  meta:{},                  // imported book id -> {name, words, syns, added}
  books:{},                 // id -> loaded book (stardict.js), or a promise while loading
  lemma:null,               // ECDICT word forms: form -> lemma
  refs:null, loading:null, loaded:false,
  q:"", cand:[], pick:0,    // the word box, its candidate rows and the highlighted one
  sheet:"", entry:null,     // "entry" | "words" | "books"; the entry on screen {word, results, back}
  stack:[], lines:[],       // entries opened from a selection lead back through the ones before (at most MAX_LEVELS); the entry's text lines
  bpick:0, wpick:0, bmenu:0, listScroll:0,
  armed:null, wordClearArmed:false, startImportArmed:false,
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
function disabled(id){ return D.set.disabled.indexOf(id)>=0; }
function enabledOrder(){ return order().filter(function(id){ return !disabled(id); }); }
/* every book in the user's order; one that cannot be read is skipped (and said once), the rest still answer */
function loaded(){
  return Promise.all(enabledOrder().map(function(id){
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
function lemmasOf(word){ return !disabled(BUILTIN) && D.lemma ? SD.lemmas(D.lemma,word) : []; }
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
/* other programs (the reader, and apps through PAD.dict): the same book and the same save path, but no toast and no sound.
   -> "saved" | "full" | null (no word). Removing a word that is not there is still "saved". These compare ignoring case:
   the dictionary program stores headwords as ECDICT spells them (London), while apps wordOf() their input lower-case */
function sameWord(a,b){ return String(a).toLowerCase()===String(b).toLowerCase(); }
function setWord(word,on){
  if(!D.refs || !D.loaded) return null;   // the stored book is not in memory yet: never write the defaults over it
  var w=String(word==null?"":word).trim();
  if(!w) return null;
  var has=D.set.words.some(function(x){ return sameWord(x.w,w); });
  if(on){
    if(!has){
      if(D.set.words.length>=MAX_WORDS) return "full";
      D.set.words=[{w:w, t:Date.now()}].concat(D.set.words).slice(0,MAX_WORDS);
      saveSet();
    }
  } else if(has){
    D.set.words=D.set.words.filter(function(x){ return !sameWord(x.w,w); });
    saveSet();
  }
  return "saved";
}
function inBookMany(words){
  if(!D.refs || !D.loaded || !Array.isArray(words)) return null;
  return words.map(function(w){ return D.set.words.some(function(x){ return sameWord(x.w,w); }); });
}

/* ---------- main screen: the word box and its candidates ---------- */
function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function btn(cls,text,fn){ var b=el("button",cls,text); b.type="button"; b.onclick=fn; return b; }
function key(key,label,disabled){
  return {label:tr(label),disabled:!!disabled,fn:function(){ dictButton(key,true); dictButton(key,false); }};
}
function renderMainKeys(){
  LP.softkeys($("dict-keys"),{
    select:key("select","sk.words"),
    start:key("start","sk.books"),
    b:key("b","sk.clear"),
    a:key("a","sk.lookup")
  });
}
var seq=0;
function update(){
  var q=D.q.trim(), mine=++seq;
  if(!enabledOrder().length){ D.cand=[]; D.pick=0; renderList(); return; }
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
  if(!enabledOrder().length){ ul.appendChild(el("li","label dict-alloff",tr("dict.alloff"))); return; }
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

/* ---------- sheets ---------- */
function openSheet(name){ D.sheet=name; if(name==="books") D.bpick=0; renderSheet(); }
function closeSheet(){
  var back=D.entry && D.entry.back;
  hush();
  D.entry=null; D.review=null; D.stack=[];
  if(back){ D.sheet=back; renderSheet(); return; }
  D.sheet=""; renderSheet(); renderList();
}
function renderSheet(){
  if(SEL.s) SEL.end();
  var sh=$("dict-sheet"); sh.hidden=!D.sheet; sh.textContent="";
  if(D.sheet==="entry") entrySheet(sh);
  else if(D.sheet==="words") wordsSheet(sh);
  else if(D.sheet==="books") booksSheet(sh);
  else if(D.sheet==="bookmenu") bookMenuSheet(sh);
  else if(D.sheet==="wordopts") wordOptionsSheet(sh);
}

/* an entry: every book's answer, in one scrollable text area */
function openEntry(word,back,review,pick){
  $("dict-q").blur(); hush();
  D.entry={word:word, results:null, back:back||"", shown:!review, pick:pick==null ? -1 : pick, scrollTop:0};
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
  var e=D.entry, word=headOf(e), title=el("p","sheet-title"), head=el("span","",word);
  /* a tap on the headword says it, as A does: on click, where iOS lets speech start */
  head.onclick=function(){ if(canSay()) say(); };
  title.appendChild(head);
  var count=el("small","");
  title.appendChild(count);
  sh.appendChild(title);
  var page=el("div","dict-page"); page.id="dict-page";
  D.lines=[];
  /* one block per line, so a paragraph of the selection is one line of the entry */
  var line=function(t,cls){ var d=el("div",cls||"",t); page.appendChild(d); return d; };
  if(!e.shown){ page.appendChild(el("span","big",e.word)); }
  else if(!e.results) page.appendChild(document.createTextNode(tr("dict.loading")));
  else if(!e.results.length) page.appendChild(document.createTextNode(e.error ? tr("dict.loadfail",{msg:e.error}) : tr("dict.notfound",{w:e.word})));
  else {
    if(e.results[0].how==="lemma") line(tr("dict.lemma",{w:e.word, base:e.results[0].word}));
    if(e.results[0].how==="prefix") line(tr("dict.notfound",{w:e.word})+" · "+tr("dict.near"));
    var last=null;
    e.results.forEach(function(r){
      var label=r.name+(r.word!==word ? " · "+r.word : "")+(r.head && r.head!==r.word ? " → "+r.head : "");
      if(label!==last){ line().appendChild(el("b","",label)); last=label; }
      r.text.split("\n").forEach(function(t){ D.lines.push({e:line(t,"dl"), s:t}); });
    });
  }
  page.addEventListener("scroll",function(){ e.scrollTop=page.scrollTop; updateEntryPosition(e,page,count); });
  SEL.touch(page,{
    canHold:canSelect,
    hold:function(x,y){ SEL.select(x,y); },
    up:function(ev,g){
      if(Math.abs(g.dx)>40 && Math.abs(g.dx)>Math.abs(g.dy)*1.2){
        ev.preventDefault(); if(SEL.s) endSel();
        var k=g.dx<0?1:-1; if(D.review) step(k); else stepMatch(k);
        return;
      }
      if(SEL.s && Math.abs(g.dx)<=12 && Math.abs(g.dy)<=12){ endSel(); sfx("tap"); }
    }
  });
  sh.appendChild(page);
  D.menuBox=el("div","sel-menu"); D.menuBox.hidden=true; sh.appendChild(D.menuBox);
  D.keys=el("div");
  entryKeys();
  sh.appendChild(D.keys);
  fitEntry();
  /* only once it is in the page and sized: a detached element keeps no scroll position */
  page.scrollTop=e.scrollTop||0;
  updateEntryPosition(e,page,count);
}
/* the entry shows whole lines only, as an LCD would: the page's height is a multiple of LINE, and what is left of the
   space it gets stays blank below it. Measured again on resize and when the chin pad comes or goes */
function fitEntry(){
  var page=$("dict-page"); if(!page || D.sheet!=="entry") return;
  page.style.flex=""; page.style.height=""; page.style.marginBottom="";
  var avail=page.getBoundingClientRect().height, h=Math.floor(avail/LINE)*LINE;
  page.style.flex="none"; page.style.height=h+"px"; page.style.marginBottom=Math.max(0,avail-h)+"px";
}
function refitEntry(){
  var page=$("dict-page"); if(!page || D.sheet!=="entry") return;
  var top=page.scrollTop; fitEntry(); page.scrollTop=top;
  var count=document.querySelector("#dict-sheet .sheet-title small");
  if(count && D.entry) updateEntryPosition(D.entry,page,count);
}
window.addEventListener("resize",function(){ clearTimeout(D.fitTimer); D.fitTimer=setTimeout(refitEntry,100); });
function entryKeys(){
  var e=D.entry, word=headOf(e), keyset;
  if(SEL.s){
    keyset={
      select:key("select","sk.unit."+SEL.s.unit),
      start:key("start","sk.quote"),
      b:key("b","sk.cancel"),
      a:key("a","sk.lookup")
    };
  } else if(D.review){
    keyset={
      select:null,
      start:{label:tr(inBook(word)?"sk.saved":"sk.addword"),fn:function(){ dictButton("start",true); dictButton("start",false); }},
      b:key("b","sk.back"),
      a:{label:tr(e.shown?"sk.nextword":"sk.reveal"),fn:function(){ dictButton("a",true); dictButton("a",false); }}
    };
  } else {
    keyset={
      select:canSelect() ? key("select","sk.select") : null,
      start:e.results && e.results.length ? {label:tr(inBook(word)?"sk.saved":"sk.addword"),fn:function(){ dictButton("start",true); dictButton("start",false); }} : null,
      b:key("b","sk.back"),
      a:key("a","sk.say",!canSay())
    };
  }
  LP.softkeys(D.keys,keyset);
}

/* ---------- selection on an entry (runtime/textsel.js, as in the reader): the whole entry is one scrolling block, so
   the selection may run past what is on screen; the cursor reaching the edge scrolls a line, and so does a drag held
   at the top or bottom edge. Not while reviewing ---------- */
var SEL=TS.create({
  root:function(){ return $("dict-page"); },
  el:function(i){ return D.lines[i].e; },
  text:function(i){ return D.lines[i].s; },
  blocks:function(){ return D.lines.map(function(x,i){ return i; }); },
  frame:function(){ var p=$("dict-page"), r=p.getBoundingClientRect(); return {left:r.left+p.clientLeft, top:r.top+p.clientTop-p.scrollTop}; },
  edge:function(){ sfx("err"); },
  moved:function(t){ reveal(t); },
  changed:function(){ if(D.sheet==="entry") entryKeys(); },
  lookup:function(){ nested(SEL.word()); },
  menuBox:function(){ return D.sheet==="entry" ? D.menuBox : null; },
  quote:function(){ quoteSel(); },
  done:function(){ endSel(); },
  scroll:function(back){ var p=$("dict-page"), top=p.scrollTop; p.scrollTop=top+(back?-LINE:LINE); return p.scrollTop!==top; }
});
function canSelect(){ return D.sheet==="entry" && !D.review && !!D.entry && !!D.entry.results && D.entry.results.length>0; }
/* SELECT: the cursor on the first word on screen */
function enterSel(){
  if(!canSelect()) return;
  SEL.start(false);
  var top=$("dict-page").scrollTop, t=SEL.s.toks;
  for(var i=0;i<t.length;i++) if(t[i].y>=top-1){ SEL.s.cur=i; break; }
  SEL.paint(); sfx("tap");
}
function endSel(){ SEL.end(); if(D.sheet==="entry") entryKeys(); }
function reveal(t){
  var p=$("dict-page"), top=p.scrollTop, h=p.clientHeight;
  if(t.y<top) p.scrollTop=Math.max(0,top-LINE*Math.ceil((top-t.y)/LINE));
  else if(t.y+t.h>top+h) p.scrollTop=top+LINE*Math.ceil((t.y+t.h-top-h)/LINE);
}
/* A on a selection: that word's entry, one level deeper; B comes back to this one where it was */
function nested(word){
  if(!word) return;
  var cur=D.entry; SEL.end();
  cur.scrollTop=$("dict-page").scrollTop;
  D.stack.push(cur);
  if(D.stack.length>MAX_LEVELS-1) D.stack.shift();
  sfx("tap"); openEntry(word,cur.back,false,-1);
}
function backEntry(){
  if(!D.stack.length){ closeSheet(); return; }
  hush(); D.entry=D.stack.pop(); D.sheet="entry"; renderSheet(); sfx("tap");
}
/* 摘抄 (START's menu) on a selection: quote it into the note 《词典》 under the entry's word; the clipboard is 复制's job */
function quoteSel(){
  var text=SEL.text().trim(); if(!text) return;
  var name=tr("dict.notename");
  if(!LP.notes){ toast(tr("sel.quotefail",{msg:"notes"})); return; }
  LP.notes.append(name,name+" "+headOf(D.entry)+"\n「"+text+"」").then(function(){
    endSel();
    toast(tr("sel.quoted")); sfx("ok");
  },function(e){ toast(tr("sel.quotefail",{msg:String((e&&e.message)||e).slice(0,100)})); sfx("err"); });
}
function entryPageInfo(page){
  var step=Math.max(1,Math.floor(page.clientHeight/24)-1)*24;
  /* the true end, which need not be a whole line down: the last step goes exactly there */
  var maxTop=Math.max(0,page.scrollHeight-page.clientHeight);
  var pages=Math.max(1,Math.ceil(maxTop/step)+1);
  var current=maxTop && page.scrollTop>=maxTop-1 ? pages : Math.min(pages,Math.floor(page.scrollTop/step)+1);
  return {step:step, maxTop:maxTop, current:current, pages:pages};
}
function updateEntryPosition(e,page,count){
  var info=entryPageInfo(page), labels=[];
  if(D.review) labels.push(tr("dict.of",{i:D.review.i+1, n:D.set.words.length}));
  if(info.pages>1) labels.push(info.current+"/"+info.pages);
  count.textContent=labels.join(" ");
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
  var info=entryPageInfo(page), aligned=Math.round(page.scrollTop/24)*24;
  page.scrollTo({top:Math.max(0,Math.min(info.maxTop,aligned+k*info.step)), behavior:"smooth"});
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
  var keys=el("div");
  LP.softkeys(keys,{
    select:null,
    start:{label:tr("sk.options"),fn:function(){ dictButton("start",true); dictButton("start",false); }},
    b:key("b","sk.back"),
    a:{label:tr("sk.review"),disabled:!D.set.words.length,fn:function(){ dictButton("a",true); dictButton("a",false); }}
  });
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
    li.appendChild(el("small","dict-book-state",disabled(id) ? tr("dict.off") : tr("dict.on")));
    li.onclick=function(){ D.bpick=i; D.armed=null; renderSheet(); };
    ul.appendChild(li);
  });
  sh.appendChild(ul);
  if(D.busy) sh.appendChild(el("p","hint",D.busy));
  if(ids.length<=1) sh.appendChild(el("p","hint",tr("dict.importnote")));
  var keys=el("div");
  LP.softkeys(keys,{
    select:null,
    start:{label:tr("sk.import"),disabled:!!D.busy,fn:function(){ dictButton("start",true); dictButton("start",false); }},
    b:{label:tr("sk.back"),fn:function(){ dictButton("b",true); dictButton("b",false); }},
    a:{label:tr("sk.item"),disabled:!!D.busy,fn:function(){ dictButton("a",true); dictButton("a",false); }}
  });
  sh.appendChild(keys);
}
function bookActions(){
  var ids=order(), id=ids[D.bpick];
  return [
    {k:"toggle",label:disabled(id)?"dict.enable":"dict.disable"},
    {k:"up",label:"dict.up",disabled:D.bpick<=0},
    {k:"down",label:"dict.down",disabled:D.bpick>=ids.length-1},
    id!==BUILTIN ? {k:"delete",label:D.armed===id ? "common.confirm" : "common.delete",disabled:!!D.busy} : null
  ].filter(Boolean);
}
function bookMenuSheet(sh){
  var ids=order(), id=ids[D.bpick], title=el("p","sheet-title");
  var meta=id===BUILTIN ? null : D.meta[id];
  title.appendChild(el("span","",meta ? LP.noEmoji(meta.name) : "ECDICT"));
  title.appendChild(el("small","",tr(disabled(id)?"dict.off":"dict.on")));
  sh.appendChild(title);
  var rows=bookActions(), ul=el("ul","lcd-menu");
  D.bmenu=Math.max(0,Math.min(D.bmenu,rows.length-1));
  rows.forEach(function(row,i){
    var li=el("li",(i===D.bmenu?"on ":"")+(row.disabled||D.busy?"disabled":""));
    li.appendChild(el("span","",row.k==="delete" && D.armed===id ? tr("common.confirm",{what:tr("common.delete")}) : tr(row.label)));
    li.onclick=function(){ if(row.disabled||D.busy){ sfx("err"); return; } D.bmenu=i; renderSheet(); };
    ul.appendChild(li);
  });
  sh.appendChild(ul);
  var action=rows[D.bmenu], keys=el("div");
  LP.softkeys(keys,{
    select:null,start:null,
    b:{label:tr("sk.back"),fn:function(){ dictButton("b",true); dictButton("b",false); }},
    a:{label:tr("sk.confirm"),disabled:!action || !!action.disabled || !!D.busy,fn:function(){ dictButton("a",true); dictButton("a",false); }}
  });
  sh.appendChild(keys);
}
function wordOptionsSheet(sh){
  var title=el("p","sheet-title"); title.appendChild(el("span","",tr("sk.options"))); sh.appendChild(title);
  var ul=el("ul","lcd-menu"), row=el("li","on");
  row.appendChild(el("span","",tr(D.wordClearArmed?"dict.cleararmed":"dict.clearwords")));
  row.onclick=function(){ D.wordClearArmed=!D.wordClearArmed; renderSheet(); };
  ul.appendChild(row); sh.appendChild(ul);
  var keys=el("div");
  LP.softkeys(keys,{
    select:null,start:null,
    b:{label:tr("sk.back"),fn:function(){ dictButton("b",true); dictButton("b",false); }},
    a:{label:tr(D.wordClearArmed?"sk.confirm":"sk.clear"),disabled:!D.set.words.length,fn:function(){ dictButton("a",true); dictButton("a",false); }}
  });
  sh.appendChild(keys);
}
function startImport(){
  if(D.busy) return;
  if(!S.db){ toast(tr("dict.nodb")); sfx("err"); return; }
  $("dict-file").value=""; $("dict-file").click();
}
function bookMenuBack(){ D.sheet="books"; D.armed=null; renderSheet(); }
function bookAction(){
  var action=bookActions()[D.bmenu], id=order()[D.bpick];
  if(!action || action.disabled || D.busy){ sfx("err"); return; }
  if(action.k==="toggle") toggleBook(id);
  else if(action.k==="up") shift(-1);
  else if(action.k==="down") shift(1);
  else if(action.k==="delete"){
    if(D.armed===id){ D.armed=null; D.sheet="books"; removeBook(id); }
    else { D.armed=id; sfx("tap"); renderSheet(); }
  }
}
function clearWords(){
  if(!D.set.words.length) return;
  D.set.words=[]; D.wordClearArmed=false; saveSet();
  D.sheet="words"; renderSheet(); toast(tr("dict.cleared")); sfx("ok");
}
function toggleBook(id){
  if(!id || D.busy) return;
  var name=id===BUILTIN ? "ECDICT" : D.meta[id].name, off=disabled(id);
  D.set.disabled=off ? D.set.disabled.filter(function(x){ return x!==id; }) : D.set.disabled.concat([id]);
  D.armed=null; saveSet(); sfx("tap");
  toast(tr(off ? "dict.enabled" : "dict.disabled",{name:name}));
  renderSheet(); update();
}
function shift(k){
  var ids=order(), i=D.bpick, j=i+k; if(j<0 || j>=ids.length) return;
  var t=ids[i]; ids[i]=ids[j]; ids[j]=t;
  D.set.order=ids; D.bpick=j; D.armed=null; sfx("move"); saveSet(); renderSheet();
}
function removeBook(id){
  if(id===BUILTIN) return;
  D.set.order=D.set.order.filter(function(x){ return x!==id; });
  D.set.disabled=D.set.disabled.filter(function(x){ return x!==id; });
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
    /* any failed write here is storage refusing (full, or Safari's private mode): the parts already written are taken
       back, so no half book remains, and the user gets one plain line instead of the browser's error */
    return P.files.put("dict/"+id+"/index",stored).then(function(){ return P.files.put("dict/"+id+"/data",blob); })
      .then(function(){ return put(D.refs.books.doc(id),meta); }).then(function(ok){
        if(!ok) throw new Error("not saved");
      }).catch(function(){
        var undo=function(q){ return q.then(null,function(){}); };
        return Promise.all([undo(D.refs.books.doc(id).delete()), undo(P.files.del("dict/"+id+"/index")), undo(P.files.del("dict/"+id+"/data"))])
          .then(function(){ var err=new Error(tr("dict.nospace")); err.nospace=true; throw err; });
      }).then(function(){
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
    .catch(function(e){ toast(e&&e.nospace ? e.message : tr("dict.importfail",{msg:String((e&&e.message)||(e&&e.code)||e).slice(0,100)})); sfx("err"); })
    .then(function(){ D.busy=null; D.bpick=order().length-1; if(D.sheet==="books") renderSheet(); });
});

/* ---------- 发音: the headword read aloud by the phone's own English voice (speechSynthesis, offline) ----------
   The voice is chosen once: the first whose lang starts with "en", an en-US or en-GB one first. iOS lists its voices
   late, so until one is found every voiceschanged looks again. The loudness follows the handheld's volume step; step 0,
   no voice, or a headword that is not Latin letters leave the slot dimmed (decisions.md section 15) */
var SAY={voice:null};
/* the voice and the volume come from core.js (runtime/speech.js, shared with PAD.say) */
function synth(){ return LP.speech.synth(); }
function chooseVoice(){
  if(!synth() || SAY.voice) return;
  SAY.voice=LP.speech.voice("en");
  if(SAY.voice && D.sheet==="entry" && !$("v-dict").hidden) entryKeys();
}
if(synth()){
  try{ synth().addEventListener("voiceschanged",chooseVoice); }catch(e){}
  chooseVoice();
}
var LATIN=/^[A-Za-z\u00C0-\u024F]+(?:[ '\u2019.-]+[A-Za-z\u00C0-\u024F]+)*\.?$/;
function canSay(){
  var e=D.entry;
  return !!synth() && !!SAY.voice && LP.SND.vol>0 && D.sheet==="entry" && !D.review && !!e && !!e.results && e.results.length>0 && LATIN.test(headOf(e));
}
function say(){
  if(!canSay()) return false;
  var s=synth(), u=new SpeechSynthesisUtterance(headOf(D.entry));
  u.voice=SAY.voice; u.lang=SAY.voice.lang;
  u.volume=LP.speech.volume();
  try{ s.cancel(); s.speak(u); }catch(e){ return false; }
  return true;
}
/* stop whatever is being said: a new entry, back, leaving the dictionary */
function hush(){ var s=synth(); if(s) try{ s.cancel(); }catch(e){} }

/* ---------- chin pad ----------
   main: ▲▼ pick, A look up, B clear, SELECT word book, START books
   entry: ◀▶ nearby matches, ▲▼ scroll, A says the headword (on release: iOS lets speech start only there), B back a level, START word book, SELECT select text (as in the reader:
     ◀▶▲▼ move, A held extends, A let go opens that word, START a menu of 摘抄 and 复制, SELECT word / sentence / line, B ends); review: A show / next, ◀▶ words, ▲▼ scroll, START word book, B back
   word book: ▲▼ pick, A review, START options, B back; books: ▲▼ pick, A this book, START import, B back */
function dictButton(b,down){
  if(D.sheet==="entry" && SEL.s){
    if(SEL.key(b,down)) return;
    if(down && b==="b"){ endSel(); sfx("tap"); }
    return;
  }
  if(b==="a" && D.sheet==="entry" && !D.review){
    if(down){ D.sayArmed=canSay(); if(!D.sayArmed) sfx("err"); }
    else if(D.sayArmed){ D.sayArmed=false; say(); }
    return;
  }
  if(b==="start"){
    if(down){
      D.startImportArmed=D.sheet==="books";
      if(D.startImportArmed) return;
    } else {
      var importNow=D.startImportArmed; D.startImportArmed=false;
      if(importNow) startImport();
      return;
    }
  }
  if(!down) return;
  if(D.sheet==="bookmenu"){
    if(b==="up"||b==="down"){ D.bmenu=Math.max(0,Math.min(bookActions().length-1,D.bmenu+(b==="up"?-1:1))); sfx("move"); renderSheet(); }
    else if(b==="a") bookAction();
    else if(b==="b") bookMenuBack();
    return;
  }
  if(D.sheet==="wordopts"){
    if(b==="a"){ if(D.wordClearArmed) clearWords(); else { D.wordClearArmed=true; renderSheet(); } }
    else if(b==="b"){ D.wordClearArmed=false; D.sheet="words"; renderSheet(); }
    return;
  }
  if(b==="select" && canSelect()){ enterSel(); return; }
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
    else if(b==="b") backEntry();
    else if(b==="start" && has){ toggleWord(w); renderSheet(); }
    return;
  }
  if(D.sheet==="words"){
    var n=D.set.words.length;
    if(b==="up"||b==="down"){ if(n){ D.wpick=Math.max(0,Math.min(n-1,D.wpick+(b==="up"?-1:1))); sfx("move"); renderSheet(); } }
    else if(b==="a") startReview(D.wpick);
    else if(b==="b") closeSheet();
    else if(b==="start"){ D.wordClearArmed=false; D.sheet="wordopts"; renderSheet(); }
    return;
  }
  if(D.sheet==="books"){
    var m=order().length;
    if(b==="up"||b==="down"){ D.bpick=Math.max(0,Math.min(m-1,D.bpick+(b==="up"?-1:1))); D.armed=null; sfx("move"); renderSheet(); }
    else if(b==="a"){ D.bmenu=0; D.armed=null; D.sheet="bookmenu"; renderSheet(); }
    else if(b==="b"){ D.armed=null; closeSheet(); }
    return;
  }
  if(b==="up"||b==="down") move(b==="up"?-1:1);
  else if(b==="a") go();
  else if(b==="b"){ D.q=""; $("dict-q").value=""; update(); }
  else if(b==="select") openSheet("words");
  else if(b==="start") openSheet("books");
}
LP.padRoute("dict",function(b,down){ if($("v-dict").hidden) return false; dictButton(b,down); return true; });

/* ---------- home icon: a closed book with an A on the cover ---------- */
var ICON=["................","...00000000000..","..0111111111110.","..0133333333100.","..0133300333100.","..0133033033100.","..0130333303100.","..0130000003100.","..0130333303100.","..0130333303100.","..0133333333100.","..0111111111100.","..0222222222220.","..0233333333330.","...00000000000..","................"];

function openDict(){
  chooseVoice();
  D.sheet=""; D.entry=null; D.review=null; D.stack=[]; D.q=""; D.listScroll=0; $("dict-q").value="";
  show("dict"); showPad(true); note(); renderMainKeys(); renderSheet(); update();
  /* the browser may clear a site's data after a while unless it is persistent (a Home Screen app always is) */
  P.persist().catch(function(){});
  if(!D.loading) D.loading=loaded();
}

/* ---------- PAD.dict: the built-in book for community apps (runtime/wordlist.js, SPEC.md 6.7) ----------
   One source for every app: words() reads only the 87 KB word list, and the book is the copy this program loads, so an app's
   lookup never unpacks ECDICT twice. book(BUILTIN) ignores the disabled switch on purpose: that switch is for this program and
   the reader (docs/decisions.md section 35) */
var APPS=window.LopdaWordList.source({
  words:function(){
    return fetch(VENDOR+".words.gz").then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.arrayBuffer(); })
      .then(SD.gunzip).then(function(b){ return new TextDecoder().decode(b); });
  },
  book:function(){ return book(BUILTIN).then(function(b){ return {book:b, lemma:D.lemma}; }); }
});

/* ---------- the pet (docs/decisions.md section 37): read-only summaries of the word book, never an entry's text ---------- */
/* the pet (docs/decisions.md section 37) uses this: the number of words and the newest t (ms), never a word or its text;
   D.set.words is kept in memory, so it is synchronous */
function bookSummary(){
  var newest=0;
  D.set.words.forEach(function(x){ var t=x && typeof x.t==="number" ? x.t : 0; if(t>newest) newest=t; });
  return {n:D.set.words.length, newest:newest};
}
/* the pet (docs/decisions.md section 37) uses this: one word for an integer seed, the same word every time, or null on an
   empty book; the word only, never its definition */
function pickWord(seed){
  var n=D.set.words.length; if(!n) return null;
  var s=typeof seed==="number" && isFinite(seed) ? Math.floor(seed) : 0;
  var i=((s%n)+n)%n;
  return D.set.words[i].w;
}

/* the reader shares the word book: START on an entry there adds or removes it, as here */
LP.dict={lookup:lookup, suggest:suggest, inBook:inBook, inBookMany:inBookMany, toggleWord:toggleWord, setWord:setWord, apps:APPS};
LP.dict.bookSummary=bookSummary;
LP.dict.pickWord=pickWord;
LP.builtin({id:"dict", label:"app.dict", icon:function(){ return ICON; }, view:"dict", keepPad:true,
  open:function(){ openDict(); },
  leave:function(){ hush(); D.sheet=""; D.entry=null; D.review=null; D.stack=[]; D.armed=null; D.q=""; var i=$("dict-q"); if(i){ i.value=""; i.blur(); } renderSheet(); },
  lang:function(){ if(!$("v-dict").hidden){ note(); renderMainKeys(); renderSheet(); update(); } },
  padLayout:function(){ if(!$("v-dict").hidden) setTimeout(refitEntry,0); },
  pause:function(){ hush(); },
  ready:function(){
    var base=S.db.doc("data/users/local/dict");
    D.refs={set:base, books:base.collection("books")};
    Promise.all([
      base.get().then(function(sn){
        var s=(sn.exists && own(sn.data()))||{};
        D.set={order:Array.isArray(s.order)&&s.order.length ? s.order : [BUILTIN], disabled:Array.isArray(s.disabled)?s.disabled:[], history:Array.isArray(s.history)?s.history:[], words:Array.isArray(s.words)?s.words:[]};
        if(D.set.order.indexOf(BUILTIN)<0) D.set.order.unshift(BUILTIN);
      }),
      D.refs.books.get().then(function(q){
        q.docs.forEach(function(doc){ var m=own(doc.data()); if(m && m.name) D.meta[doc.id]=m; });
      })
    ]).then(function(){
      order().forEach(function(id){ if(D.set.order.indexOf(id)<0) D.set.order.push(id); });
      for(var id in D.meta) if(D.set.order.indexOf(id)<0) D.set.order.push(id);
      D.set.disabled=D.set.disabled.filter(function(id){ return order().indexOf(id)>=0; });
      D.loaded=true;
      if(!$("v-dict").hidden){ renderSheet(); update(); }
    }).catch(function(){});
  }});
})();
