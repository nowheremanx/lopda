/*
 * Lo-PDA built-in: e-book reader. A shelf, whole pages (CSS columns, never scrolled), contents, three text sizes,
 * an e-ink mode, and a 文曲星-style word cursor: A looks the word up in the dictionary, START quotes the selection
 * into a note named after the book. Design: docs/design/reader-dictionary.md sections 1, 3, 4; decisions.md section 16.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * Books are parsed once, on import (runtime/bookparse.js), and kept in LopdaPlatform.files as "book/<id>".
 * The shelf entry {title, author, lang, chars, lens, added, opened, pos, pct} is data/users/local/reader/books/<id>;
 * settings {size, eink, seeded} are data/users/local/reader. A position is {ch, p, c}: chapter, paragraph and
 * character, never a page number, so another text size or screen finds the same sentence.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, BK=window.LopdaBook, P=window.LopdaPlatform;
var own=LP.own, toast=LP.toast, put=LP.put, sfx=LP.sfx, show=LP.show, showPad=LP.showPad, uid=LP.uid;

var SIZES=[16,19,23], LINE=1.7, GAP=32;
/* public-domain samples (runtime/books/, see LICENSING.md), put on the shelf once */
var SAMPLES=[{file:"books/alice.txt", title:"Alice’s Adventures in Wonderland", author:"Lewis Carroll"},
  {file:"books/lunyu.txt", title:"論語", author:""}];
/* a word for the cursor: one CJK character, or a run of letters and digits with inner apostrophes and hyphens */
var TOK=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])[\p{L}\p{N}])+(?:['’\-](?:(?![\p{Script=Han}])[\p{L}\p{N}])+)*/gu;

var R={
  set:{size:1, eink:null, seeded:false},
  meta:{}, refs:null, loaded:false, seeding:null,
  pick:0, armed:null, busy:null,
  id:null, book:null, cum:{},       // the open book; per chapter, where each paragraph starts
  ch:0, page:0, pages:1, stride:1, pos:null,
  sheet:"", mpick:0, tpick:0, jump:0,   // "" | "menu" | "toc" | "jump" | "def" | "thought"
  sel:null,                          // the word cursor: {toks, cur, anc, held, moved}
  def:null,                          // the entry under the page: {word, results, page, pages}
  thought:null                       // the note a quote went into: {name}
};

function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function btn(cls,text,fn){ var b=el("button",cls,text); b.type="button"; b.onclick=fn; return b; }
function keyBtn(cls,key,label,fn){ var b=btn(cls,null,fn); b.appendChild(el("i","",key)); b.appendChild(document.createTextNode(label)); return b; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function visible(){ return !$("v-reader").hidden; }

/* ---------- storage ---------- */
function saveSet(){ if(R.refs) put(R.refs.set,R.set); }
var metaTimer=null, writing={};   /* id -> the last progress write, so a delete lands after it */
function saveMeta(id,now){
  clearTimeout(metaTimer);
  var go=function(){ metaTimer=null; if(R.refs && R.meta[id]) writing[id]=put(R.refs.books.doc(id),R.meta[id]); };
  if(now) go(); else metaTimer=setTimeout(go,500);
}
function flushMeta(){ if(metaTimer && R.id){ saveMeta(R.id,true); } }
function chars(ch){ return ch.paras.reduce(function(n,p){ return n+p.s.length; },0); }
function addBook(book,added){
  var lens=book.chapters.map(chars), total=lens.reduce(function(a,b){ return a+b; },0);
  if(!total) return Promise.reject(new Error(tr("reader.notext")));
  var title=LP.noEmoji(book.title)||tr("reader.untitled");
  for(var k in R.meta) if(R.meta[k].title===title && R.meta[k].chars===total) return Promise.reject(new Error(tr("reader.dup",{name:title})));
  var id=uid(), meta={title:title, author:LP.noEmoji(book.author), lang:book.lang==="zh"?"zh":"en", chars:total, lens:lens,
    added:added||Date.now(), opened:0, pos:{ch:0, p:0, c:0}, pct:0};
  return P.files.put("book/"+id,book).then(function(){ return put(R.refs.books.doc(id),meta); }).then(function(ok){
    if(!ok){ P.files.del("book/"+id).catch(function(){}); throw new Error(tr("common.savefail",{code:"?"})); }
    R.meta[id]=meta; return id;
  });
}
/* not text: a NUL in the first few KB (UTF-16 carries a BOM, which decodeText reads), or a PDF */
function binary(u8){
  if((u8[0]===0xFF && u8[1]===0xFE) || (u8[0]===0xFE && u8[1]===0xFF)) return false;
  if(u8[0]===0x25 && u8[1]===0x50 && u8[2]===0x44 && u8[3]===0x46) return true;
  for(var i=0;i<Math.min(u8.length,4096);i++) if(u8[i]===0) return true;
  return false;
}
function parseFile(name,u8){
  if(u8[0]===0x50 && u8[1]===0x4B) return BK.parseEpub(u8);
  if(binary(u8)) return Promise.reject(new Error(tr("reader.badfile")));
  return Promise.resolve(BK.parseTxt(BK.decodeText(u8).text,name));
}
function importFile(f){
  R.busy=tr("reader.importing",{name:f.name}); renderShelf();
  return f.arrayBuffer().then(function(buf){ return parseFile(f.name,new Uint8Array(buf)); }).then(function(book){
    if(!book.title) book.title=f.name.replace(/^.*[\\/]/,"").replace(/\.[^.]*$/,"");
    return addBook(book);
  }).then(function(id){ R.pick=0; toast(tr("reader.imported",{name:R.meta[id].title})); sfx("ok"); });
}
$("rd-file").addEventListener("change",function(){
  var files=Array.prototype.slice.call(this.files||[]); if(!files.length) return;
  files.reduce(function(p,f){ return p.then(function(){ return importFile(f); }); },Promise.resolve())
    .catch(function(e){ toast(tr("reader.importfail",{msg:String((e&&e.message)||(e&&e.code)||e).slice(0,100)})); sfx("err"); })
    .then(function(){ R.busy=null; renderShelf(); });
});
function seed(){
  if(R.seeding || R.set.seeded || !R.refs) return;
  var t=Date.now();
  R.seeding=SAMPLES.reduce(function(p,s,i){
    return p.then(function(){
      return fetch(s.file).then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.arrayBuffer(); }).then(function(buf){
        var book=BK.parseTxt(BK.decodeText(new Uint8Array(buf)).text,s.file);
        book.title=s.title; book.author=s.author;
        return addBook(book,t+i).catch(function(){});   /* already there (a second tab): fine */
      });
    });
  },Promise.resolve()).then(function(){ R.set.seeded=true; saveSet(); },function(){ /* offline before the cache filled: try next time */ })
    .then(function(){ R.seeding=null; if(visible() && !R.id) renderShelf(); });
}

/* ---------- shelf: one column, the book read last on top ---------- */
function shelfIds(){
  var at=function(m){ return m.opened||m.added||0; };
  return Object.keys(R.meta).sort(function(a,b){ return at(R.meta[b])-at(R.meta[a]); });
}
function standalone(){ return navigator.standalone===true || !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches); }
function renderShelf(){
  var ids=shelfIds(), ul=$("rd-list"); ul.textContent="";
  R.pick=clamp(R.pick,0,Math.max(0,ids.length-1));
  if(!ids.length) ul.appendChild(el("li","label",tr(!R.loaded || R.seeding ? "reader.loading" : "reader.empty")));
  ids.forEach(function(id,i){
    var m=R.meta[id], li=el("li",i===R.pick?"on":"");
    li.appendChild(el("span","",m.title));
    li.appendChild(el("small","",Math.floor(m.pct||0)+"%"));
    li.onclick=function(){ R.pick=i; R.armed=null; openBook(id); };
    ul.appendChild(li);
  });
  var cur=ids[R.pick], del=$("rd-del"), armed=cur && R.armed===cur;
  del.textContent=armed ? tr("common.confirm",{what:tr("common.delete")}) : tr("common.delete");
  del.className=armed ? "btn" : "btn ghost";
  del.disabled=!cur || !!R.busy;
  $("rd-import").disabled=!!R.busy;
  $("rd-note").textContent=R.busy || (armed ? tr("reader.armed",{name:R.meta[cur].title}) : standalone() ? "" : tr("common.pwa"));
  var on=ul.querySelector("li.on"); if(on && on.scrollIntoView) on.scrollIntoView({block:"nearest"});
}
$("rd-import").onclick=function(){
  if(!S.db || !R.refs){ toast(tr("reader.nodb")); sfx("err"); return; }
  R.armed=null; $("rd-file").value=""; $("rd-file").click();
};
$("rd-del").onclick=function(){
  var id=shelfIds()[R.pick]; if(!id) return;
  if(R.armed!==id){ R.armed=id; renderShelf(); return; }
  R.armed=null;
  var title=R.meta[id].title;
  delete R.meta[id]; renderShelf();
  Promise.resolve(writing[id]).then(function(){ delete writing[id]; return Promise.all([R.refs.books.doc(id).delete(), P.files.del("book/"+id)]); })
    .then(function(){ toast(tr("reader.deleted",{name:title})); },function(){ toast(tr("reader.delfail")); });
};
function shelfButton(b){
  var n=shelfIds().length;
  if(b==="up"||b==="down"){ if(n){ R.pick=clamp(R.pick+(b==="up"?-1:1),0,n-1); R.armed=null; sfx("move"); renderShelf(); } }
  else if(b==="a"){ var id=shelfIds()[R.pick]; if(id){ R.armed=null; openBook(id); } }
  else if(b==="b" && R.armed){ R.armed=null; renderShelf(); }
}

/* ---------- a book: one chapter in the DOM, cut into pages by CSS columns ---------- */
function mode(read){ $("rd-shelf").hidden=read; $("rd-book").hidden=!read; }
function openBook(id){
  var m=R.meta[id];
  R.id=id; R.book=null; R.cum={}; R.sheet=""; R.sel=null; R.def=null;
  mode(true); renderSheet(); $("rd-flow").textContent=""; foot(tr("reader.loading"),"");
  P.files.get("book/"+id).then(function(book){
    if(R.id!==id) return;
    if(!book || !book.chapters || !book.chapters.length) throw new Error("missing");
    R.book=book;
    m.opened=Date.now(); saveMeta(id,true);
    var pos=m.pos||{ch:0, p:0, c:0};
    goTo(clamp(pos.ch|0,0,book.chapters.length-1),pos);
  }).catch(function(e){
    if(R.id!==id) return;
    toast(tr("reader.loadfail",{msg:String((e&&e.message)||e).slice(0,80)})); sfx("err"); closeBook();
  });
}
function closeBook(){
  flushMeta(); unmark();
  R.id=null; R.book=null; R.sheet=""; R.sel=null; R.def=null; R.pick=0;
  mode(false); renderSheet(); renderDef(); renderShelf();
}
function chapterTitle(ch){
  var t=R.book.chapters[ch].title;
  return t ? t : R.book.chapters.length>1 ? tr("reader.part",{n:ch+1}) : R.meta[R.id].title;
}
function fill(e,pa){
  var s=pa.s, em=pa.em||[], at=0, k, x;
  for(k=0;k+1<em.length;k+=2){
    if(em[k]>at) e.appendChild(document.createTextNode(s.slice(at,em[k])));
    x=document.createElement("em"); x.textContent=s.slice(em[k],em[k+1]); e.appendChild(x); at=em[k+1];
  }
  if(at<s.length) e.appendChild(document.createTextNode(s.slice(at)));
}
function renderChapter(ch){
  var flow=$("rd-flow"), c=R.book.chapters[ch];
  flow.textContent=""; flow.setAttribute("lang",R.book.lang==="zh"?"zh":"en");
  c.paras.forEach(function(pa,i){
    var e=document.createElement("p"); if(pa.h) e.className="h";
    e.setAttribute("data-i",i); fill(e,pa); flow.appendChild(e);
  });
  R.ch=ch;
  measure();
}
/* the column box is cut to whole lines; every page is one column, one stride further left */
function measure(){
  var pg=$("rd-page"), flow=$("rd-flow"), cs=getComputedStyle(pg);
  var w=pg.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  var h=pg.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
  var fs=SIZES[R.set.size]||SIZES[1], lh=Math.round(fs*LINE);
  w=Math.max(40,Math.floor(w)); h=Math.max(lh,Math.floor(h/lh)*lh);
  flow.style.fontSize=fs+"px"; flow.style.lineHeight=lh+"px";
  flow.style.width=w+"px"; flow.style.height=h+"px";
  flow.style.columnWidth=w+"px"; flow.style.columnGap=GAP+"px";
  flow.style.transition="none"; flow.style.transform="none";
  R.stride=w+GAP;
  var last=flow.lastElementChild, rs=last ? last.getClientRects() : [];
  R.pages=rs.length ? pageOf(rs[rs.length-1])+1 : 1;
}
function origin(){ return $("rd-flow").getBoundingClientRect(); }
/* which page a rectangle sits on; measured against the flow itself, so a page turn in progress does not matter */
function pageOf(rect,o){ o=o||origin(); return Math.max(0,Math.floor((rect.left-o.left+1)/R.stride)); }
function nodeAt(e,c){
  var w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT), n, at=0, last=null;
  while((n=w.nextNode())){ if(c<at+n.data.length) return {n:n, o:c-at}; at+=n.data.length; last=n; }
  return last ? {n:last, o:last.data.length} : null;
}
function rangeRects(e,a,b){
  var s=nodeAt(e,a), t=nodeAt(e,b); if(!s || !t) return [];
  var r=document.createRange(); r.setStart(s.n,s.o); r.setEnd(t.n,t.o);
  return r.getClientRects();
}
function charPage(e,c,o){
  var len=R.book.chapters[R.ch].paras[+e.getAttribute("data-i")].s.length;
  if(c>=len) c=len-1;
  var rs=c>=0 ? rangeRects(e,c,c+1) : [];
  return rs.length ? pageOf(rs[0],o) : pageOf(e.getBoundingClientRect(),o);
}
function pageOfPos(pos){
  var e=$("rd-flow").children[pos.p|0]; if(!e) return pos.p>0 ? R.pages-1 : 0;
  return clamp(charPage(e,pos.c|0),0,R.pages-1);
}
/* the first character on a page: the first paragraph that reaches it, then a binary search inside that paragraph */
function posOfPage(page){
  var kids=$("rd-flow").children, o=origin(), lo=0, hi=kids.length-1, i=kids.length-1;
  var lastPage=function(e){ var rs=e.getClientRects(); return rs.length ? pageOf(rs[rs.length-1],o) : 0; };
  while(lo<=hi){ var mid=(lo+hi)>>1; if(lastPage(kids[mid])>=page){ i=mid; hi=mid-1; } else lo=mid+1; }
  var e=kids[i]; if(!e) return {ch:R.ch, p:0, c:0};
  var len=R.book.chapters[R.ch].paras[i].s.length, a=0, b=len-1, c=0;
  if(charPage(e,0,o)<page){
    c=len-1;
    while(a<=b){ var m=(a+b)>>1; if(charPage(e,m,o)>=page){ c=m; b=m-1; } else a=m+1; }
  }
  return {ch:R.ch, p:i, c:c};
}
function place(animate){
  var flow=$("rd-flow");
  flow.style.transition=animate && !eink() ? "transform .16s ease-out" : "none";
  flow.style.transform="translateX("+(-R.page*R.stride)+"px)";
  footer();
}
function goTo(ch,pos,end){
  renderChapter(ch);
  R.page=end ? R.pages-1 : pos ? pageOfPos(pos) : 0;
  place(false);
  remember(pos && !end ? {ch:ch, p:pos.p|0, c:pos.c|0} : null);
}
/* keep the reading position; a new text size or screen goes back to this exact spot, not to the page's new top */
function remember(pos){
  if(!R.book) return;
  R.pos=pos || posOfPage(R.page);
  var m=R.meta[R.id]; if(!m) return;
  m.pos=R.pos; m.pct=pctOf(R.pos);
  $("v-reader").setAttribute("data-pos",R.pos.ch+":"+R.pos.p+":"+R.pos.c);
  saveMeta(R.id);
}
function cumOf(ch){
  if(R.cum[ch]) return R.cum[ch];
  var at=0; R.cum[ch]=R.book.chapters[ch].paras.map(function(p){ var x=at; at+=p.s.length; return x; });
  return R.cum[ch];
}
function pctOf(pos){
  var m=R.meta[R.id], before=0;
  for(var i=0;i<pos.ch;i++) before+=m.lens[i]||0;
  var last=pos.ch===R.book.chapters.length-1 && R.ch===pos.ch && R.page>=R.pages-1;
  if(last) return 100;
  return Math.min(100,Math.round(1000*(before+(cumOf(pos.ch)[pos.p]||0)+(pos.c||0))/Math.max(1,m.chars))/10);
}
function posAtPct(pct){
  var m=R.meta[R.id], want=Math.floor(m.chars*pct/100), ch=0;
  while(ch<m.lens.length-1 && want>=m.lens[ch]){ want-=m.lens[ch]; ch++; }
  var cum=cumOf(ch), p=0;
  while(p<cum.length-1 && cum[p+1]<=want) p++;
  return {ch:ch, p:p, c:Math.max(0,want-cum[p])};
}
function relayout(){
  if(!R.book || !visible()) return;
  unmark();
  var pos=R.pos;
  renderChapter(R.ch);
  R.page=pos ? pageOfPos(pos) : 0;
  place(false);
  if(R.sel) startSel();
}
function turn(k){
  if(!R.book) return false;
  var p=R.page+k;
  if(p<0){ if(R.ch===0) return false; goTo(R.ch-1,null,true); }
  else if(p>=R.pages){ if(R.ch>=R.book.chapters.length-1) return false; goTo(R.ch+1,{p:0, c:0}); }
  else { R.page=p; place(true); remember(null); }
  sfx("tick");
  return true;
}
function foot(left,right){
  var f=$("rd-foot"); f.textContent="";
  f.appendChild(el("span","",left)); if(right) f.appendChild(el("b","",right));
}
function footer(){
  if(!R.book) return;
  if(R.sel){
    var f=$("rd-foot"); f.textContent="";
    f.appendChild(keyBtn("","A",tr("reader.look"),function(){ lookupSel(); }));
    f.appendChild(keyBtn("","START",tr("reader.quote"),function(){ quote(); }));
    f.appendChild(keyBtn("","B",tr("reader.back"),function(){ endSel(); }));
    return;
  }
  foot(chapterTitle(R.ch),(R.page+1)+"/"+R.pages);
}

/* ---------- touch: the sides turn, a swipe turns, the middle opens the menu; in select mode a tap moves the cursor ---------- */
(function(){
  var pg=$("rd-page"), t=null;
  pg.addEventListener("pointerdown",function(e){ menuTap=false; if(R.book) t={x:e.clientX, y:e.clientY, id:e.pointerId}; });
  pg.addEventListener("pointercancel",function(){ t=null; });
  pg.addEventListener("pointerup",function(e){
    if(!t || e.pointerId!==t.id || !R.book) return;
    var dx=e.clientX-t.x, dy=e.clientY-t.y; t=null;
    if(R.sheet==="def"||R.sheet==="thought"){ if(R.sheet==="def") closeDef(); return; }
    if(Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)*1.2){ turnPage(dx<0?1:-1); return; }
    if(Math.abs(dx)>12 || Math.abs(dy)>12) return;
    if(R.sel){ tapWord(e.clientX,e.clientY); return; }
    var r=pg.getBoundingClientRect(), fx=(e.clientX-r.left)/r.width;
    if(fx<0.3) turnPage(-1); else if(fx>0.7) turnPage(1); else menuTap=true;
  });
  /* the menu opens on the click that follows, not on pointerup: opened earlier, that click would land on a menu row */
  var menuTap=false;
  pg.addEventListener("click",function(){ if(menuTap){ menuTap=false; openMenu(); } });
})();
function turnPage(k){
  if(R.sel){ unmark(); if(turn(k)) startSel(k<0); else paintSel(); return; }
  turn(k);
}

/* ---------- the word cursor (SELECT): English moves by word, Chinese by character; A held extends ---------- */
function pageTokens(){
  var kids=$("rd-flow").children, o=origin(), left=o.left+R.page*R.stride, right=left+R.stride-GAP, out=[];
  var paras=R.book.chapters[R.ch].paras;
  for(var i=0;i<kids.length;i++){
    var rs=kids[i].getClientRects(); if(!rs.length) continue;
    if(pageOf(rs[rs.length-1],o)<R.page) continue;
    if(pageOf(rs[0],o)>R.page) break;
    var s=paras[i].s, m; TOK.lastIndex=0;
    while((m=TOK.exec(s))){
      var r=rangeRects(kids[i],m.index,m.index+m[0].length)[0];
      if(!r || r.left+r.width/2<left || r.left+r.width/2>right) continue;
      out.push({p:i, a:m.index, b:m.index+m[0].length, x:r.left-left, y:r.top-o.top, w:r.width, h:r.height});
    }
  }
  return out;
}
function startSel(fromEnd){
  var toks=pageTokens();
  R.sel={toks:toks, cur:fromEnd ? toks.length-1 : 0, anc:null, held:R.sel && R.sel.held, moved:false};
  paintSel(); footer();
}
function enterSel(){
  if(!R.book) return;
  R.sheet=""; renderSheet();
  startSel(false);
  if(!R.sel.toks.length) toast(tr("reader.nowords"));
  sfx("tap");
}
function endSel(){ unmark(); R.sel=null; closeDef(true); footer(); }
function selRange(){
  var s=R.sel; if(!s || !s.toks.length) return null;
  var a=s.anc==null ? s.cur : Math.min(s.anc,s.cur), b=s.anc==null ? s.cur : Math.max(s.anc,s.cur);
  return s.toks.slice(a,b+1);
}
/* the selected tokens, per paragraph from the first token's start to the last one's end (punctuation between included) */
function selParts(){
  var t=selRange(), parts=[]; if(!t) return parts;
  t.forEach(function(x){ var l=parts[parts.length-1]; if(l && l.p===x.p) l.b=x.b; else parts.push({p:x.p, a:x.a, b:x.b}); });
  return parts;
}
function selText(){
  var paras=R.book.chapters[R.ch].paras;
  return selParts().map(function(x){ return paras[x.p].s.slice(x.a,x.b); }).join("\n");
}
/* reverse video by wrapping the selected text in <mark>: inline, no padding, so no line moves */
function mark(e,a,b){
  var w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT), list=[], n, at=0;
  while((n=w.nextNode())){ list.push({n:n, at:at}); at+=n.data.length; }
  list.forEach(function(x){
    var s=Math.max(a,x.at), t=Math.min(b,x.at+x.n.data.length); if(s>=t) return;
    var node=x.n;
    if(t-x.at<node.data.length) node.splitText(t-x.at);
    if(s>x.at) node=node.splitText(s-x.at);
    var mk=document.createElement("mark"); node.parentNode.insertBefore(mk,node); mk.appendChild(node);
  });
}
function unmark(){
  Array.prototype.slice.call($("rd-flow").querySelectorAll("mark")).forEach(function(mk){
    var p=mk.parentNode; while(mk.firstChild) p.insertBefore(mk.firstChild,mk); p.removeChild(mk); p.normalize();
  });
}
function paintSel(){
  unmark(); if(!R.sel) return;
  var kids=$("rd-flow").children;
  selParts().forEach(function(x){ mark(kids[x.p],x.a,x.b); });
}
/* the line above or below (k = -1 or 1), then the token there nearest the middle of the current one; -1 when there is none */
function vertical(k){
  var t=R.sel.toks, c=t[R.sel.cur], cx=c.x+c.w/2, lineY=null, best=-1, bd=Infinity;
  t.forEach(function(x){ if((x.y-c.y)*k>c.h/2 && (lineY===null || (x.y-lineY)*k<0)) lineY=x.y; });
  if(lineY===null) return -1;
  t.forEach(function(x,i){ var d=Math.abs(x.x+x.w/2-cx); if(Math.abs(x.y-lineY)<c.h/2 && d<bd){ bd=d; best=i; } });
  return best;
}
function moveCur(dir){
  var s=R.sel, t=s.toks, back=dir==="left"||dir==="up";
  if(!t.length){ turnPage(back?-1:1); return; }
  var next=dir==="left" ? s.cur-1 : dir==="right" ? s.cur+1 : vertical(back?-1:1);
  if(next<0 || next>=t.length){
    /* off the page: turn to the next one, unless A is held (a selection stays on one page) */
    if(s.held) sfx("err"); else turnPage(back?-1:1);
    return;
  }
  if(s.held){ if(s.anc==null) s.anc=s.cur; s.moved=true; } else s.anc=null;
  s.cur=next; sfx("move"); paintSel();
}
function tapWord(x,y){
  var s=R.sel, o=origin(), left=o.left+R.page*R.stride, px=x-left, py=y-o.top, best=-1, bd=Infinity;
  s.toks.forEach(function(t,i){
    var dx=px<t.x ? t.x-px : px>t.x+t.w ? px-t.x-t.w : 0, dy=py<t.y ? t.y-py : py>t.y+t.h ? py-t.y-t.h : 0;
    var d=dy*4+dx; if(d<bd){ bd=d; best=i; }
  });
  if(best<0) return;
  if(s.held){ if(s.anc==null) s.anc=s.cur; s.moved=true; } else s.anc=null;
  s.cur=best; sfx("move"); paintSel();
}

/* ---------- A: the dictionary entry in the lower half of the screen ---------- */
function lookupSel(){
  if(!R.sel) return;
  var w=selText().replace(/’/g,"'").replace(/\s+/g," ").trim();
  if(!w) return;
  if(!LP.dict){ toast(tr("reader.nodict")); return; }
  R.def={word:w, results:null, page:0, pages:1};
  R.sheet="def"; renderDef(); sfx("tap");
  var mine=R.def;
  LP.dict.lookup(w).then(function(r){ if(R.def===mine){ mine.results=r; renderDef(); } },
    function(e){ if(R.def===mine){ mine.results=[]; mine.error=String((e&&e.message)||e); renderDef(); } });
}
function headOf(d){ var r=d.results; return r && r.length && r[0].how!=="exact" ? r[0].word : d.word; }
function closeDef(quiet){
  if(R.sheet!=="def" && R.sheet!=="thought") return;
  if(R.sheet==="thought") saveThought(false);
  R.sheet=""; R.def=null; R.thought=null; renderDef();
  if(!quiet) sfx("tap");
}
function renderDef(){
  var sh=$("rd-def"); sh.textContent="";
  sh.hidden=!(R.sheet==="def" || R.sheet==="thought");
  if(R.sheet==="thought") return thoughtSheet(sh);
  if(R.sheet!=="def") return;
  var d=R.def, word=headOf(d), title=el("p","sheet-title"), count=el("small","");
  title.appendChild(el("span","",word)); title.appendChild(count); sh.appendChild(title);
  var page=el("div","dict-page");
  if(!d.results) page.appendChild(document.createTextNode(tr("dict.loading")));
  else if(!d.results.length) page.appendChild(document.createTextNode(d.error ? tr("dict.loadfail",{msg:d.error}) : tr("dict.notfound",{w:d.word})));
  else {
    if(d.results[0].how==="lemma") page.appendChild(document.createTextNode(tr("dict.lemma",{w:d.word, base:d.results[0].word})+"\n"));
    if(d.results[0].how==="prefix") page.appendChild(document.createTextNode(tr("dict.notfound",{w:d.word})+" · "+tr("dict.near")+"\n"));
    var last=null;
    d.results.forEach(function(r){
      var label=r.name+(r.word!==word ? " · "+r.word : "")+(r.head && r.head!==r.word ? " → "+r.head : "");
      if(label!==last){ page.appendChild(el("b","",label)); page.appendChild(document.createTextNode("\n")); last=label; }
      page.appendChild(document.createTextNode(r.text+"\n"));
    });
  }
  page.onclick=function(ev){ var r=page.getBoundingClientRect(); defTurn(ev.clientX<r.left+r.width/3?-1:1); };
  sh.appendChild(page);
  var keys=el("div","dict-keys"), has=d.results && d.results.length;
  keys.appendChild(keyBtn("ck","◀▶",tr("dict.page"),function(){ defTurn(1); }));
  keys.appendChild(keyBtn("ck","B",tr("dict.back"),function(){ closeDef(); }));
  if(has) keys.appendChild(keyBtn("ck","START",LP.dict.inBook(word) ? tr("dict.inbook") : tr("dict.add"),function(){ LP.dict.toggleWord(word); renderDef(); }));
  sh.appendChild(keys);
  /* whole lines per page, as in the dictionary */
  var lh=24, h=Math.max(lh,Math.floor(page.clientHeight/lh)*lh);
  page.style.height=h+"px"; page.style.flex="none";
  d.pages=Math.max(1,Math.ceil((page.scrollHeight-2)/h));
  d.page=Math.min(d.page,d.pages-1);
  page.scrollTop=d.page*h;
  count.textContent=d.pages>1 ? tr("dict.of",{i:d.page+1, n:d.pages}) : "";
}
function defTurn(k){ var d=R.def; if(!d) return; var p=d.page+k; if(p<0 || p>=d.pages) return; d.page=p; sfx("move"); renderDef(); }

/* ---------- START: quote the selection into the note 《书名》, then a thought under it ---------- */
function quote(){
  if(!R.sel || !R.book) return;
  var text=selText().trim(); if(!text) return;
  if(!LP.notes){ toast(tr("reader.quotefail",{msg:"notes"})); return; }
  var m=R.meta[R.id], name="《"+m.title+"》", ch=R.book.chapters[R.ch].title;
  LP.notes.append(name,name+(ch ? " "+ch : "")+"\n「"+text+"」").then(function(){
    sfx("ok");
    if(!R.sel) return;
    R.sel.anc=null; paintSel();
    R.sheet="thought"; R.thought={name:name}; renderDef();
  },function(e){ toast(tr("reader.quotefail",{msg:String((e&&e.message)||e).slice(0,80)})); sfx("err"); });
}
function thoughtSheet(sh){
  sh.appendChild(el("p","hint",tr("reader.quoted",{name:R.thought.name})));
  var ta=el("textarea"); ta.id="rd-thought"; ta.placeholder=tr("reader.thought"); ta.maxLength=4000;
  if(R.thought.draft) ta.value=R.thought.draft;
  ta.oninput=function(){ if(R.thought) R.thought.draft=ta.value; };
  sh.appendChild(ta);
  var keys=el("div","dict-keys");
  keys.appendChild(keyBtn("ck","B",tr("reader.skip"),function(){ R.thought.draft=""; closeDef(); }));
  keys.appendChild(keyBtn("ck ck-a","A",tr("reader.done"),function(){ closeDef(); }));
  sh.appendChild(keys);
  /* a real tap brings up the keyboard on a phone; with a keyboard this is where typing goes anyway */
  if(!(window.matchMedia && matchMedia("(pointer: coarse)").matches)) try{ ta.focus({preventScroll:true}); }catch(e){}
}
/* the thought goes right under its quote; leaving the screen keeps what was typed */
function saveThought(){
  var t=R.thought; if(!t) return;
  var text=String(t.draft||"").trim(); t.draft="";
  var ta=$("rd-thought"); if(ta) ta.blur();
  if(!text) return;
  LP.notes.append(t.name,text,"\n").then(function(){ toast(tr("reader.saved")); },function(e){ toast(tr("reader.quotefail",{msg:String((e&&e.message)||e).slice(0,80)})); });
}

/* ---------- menu, contents, jump ---------- */
function eink(){
  if(R.set.eink!=null) return !!R.set.eink;
  return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
}
function applyEink(){
  var on=eink();
  $("v-reader").classList.toggle("eink",on);
  $("screen").classList.toggle("rd-eink",on && visible());
}
function menuItems(){
  return [
    {k:"toc", label:tr("reader.toc")},
    {k:"size", label:tr("reader.size"), val:tr("reader.sizes").split("|")[R.set.size]},
    {k:"jump", label:tr("reader.jump")},
    {k:"select", label:tr("reader.select"), val:"SELECT"},
    {k:"eink", label:tr("reader.eink"), val:tr(eink()?"set.on":"set.off")},
    {k:"shelf", label:tr("reader.shelfback"), val:"B"}
  ];
}
function openMenu(){ if(!R.book) return; R.sheet="menu"; R.mpick=0; renderSheet(); sfx("tap"); }
function closeSheet(){ R.sheet=""; renderSheet(); }
function renderSheet(){
  var sh=$("rd-sheet"), on=R.sheet==="menu"||R.sheet==="toc"||R.sheet==="jump";
  sh.hidden=!on; sh.textContent=""; if(!on) return;
  var m=R.meta[R.id], title=el("p","sheet-title");
  title.appendChild(el("span","",R.sheet==="toc" ? tr("reader.toc") : R.sheet==="jump" ? tr("reader.jump") : m.title));
  title.appendChild(el("small","",Math.floor(m.pct||0)+"%"));
  sh.appendChild(title);
  var keys=el("div","dict-keys");
  if(R.sheet==="menu"){
    var ul=el("ul","lcd-menu");
    menuItems().forEach(function(it,i){
      var li=el("li",i===R.mpick?"on":""); li.appendChild(el("span","",it.label)); if(it.val) li.appendChild(el("small","",it.val));
      li.onclick=function(){ R.mpick=i; menuPick(it.k); };
      ul.appendChild(li);
    });
    sh.appendChild(ul);
  } else if(R.sheet==="toc"){
    var list=tocList(), tu=el("ul","lcd-menu rd-toc");
    list.forEach(function(it,i){
      var li=el("li",i===R.tpick?"on":""); li.style.paddingLeft=(10+12*(it.d||0))+"px";
      li.appendChild(el("span","",it.title));
      li.onclick=function(){ R.tpick=i; tocGo(it); };
      tu.appendChild(li);
    });
    sh.appendChild(tu);
    var cur=tu.querySelector("li.on"); if(cur && cur.scrollIntoView) cur.scrollIntoView({block:"center"});
  } else {
    var box=el("div","rd-jump");
    box.appendChild(el("b","",R.jump+"%"));
    var at=posAtPct(R.jump);
    box.appendChild(el("span","",chapterTitle(at.ch)));
    box.appendChild(el("p","hint",tr("reader.jumpkeys")));
    sh.appendChild(box);
    keys.appendChild(keyBtn("ck","◀",  "",function(){ jumpBy(-1); }));
    keys.appendChild(keyBtn("ck","▶",  "",function(){ jumpBy(1); }));
  }
  keys.appendChild(keyBtn("ck","B",tr("reader.back"),function(){ sheetBack(); }));
  if(R.sheet!=="toc") keys.appendChild(keyBtn("ck ck-a","A",tr("reader.go"),function(){ sheetA(); }));
  sh.appendChild(keys);
}
function menuPick(k){
  if(k==="toc"){ var l=tocList(); R.tpick=0; l.forEach(function(it,i){ if(it.ch<R.pos.ch || (it.ch===R.pos.ch && it.p<=R.pos.p)) R.tpick=i; }); R.sheet="toc"; renderSheet(); sfx("tap"); }
  else if(k==="size"){ R.set.size=(R.set.size+1)%SIZES.length; saveSet(); relayout(); renderSheet(); sfx("tap"); }
  else if(k==="jump"){ R.jump=Math.floor(R.meta[R.id].pct||0); R.sheet="jump"; renderSheet(); sfx("tap"); }
  else if(k==="select"){ enterSel(); }
  else if(k==="eink"){ R.set.eink=!eink(); saveSet(); applyEink(); renderSheet(); sfx("tap"); }
  else if(k==="shelf"){ closeBook(); sfx("tap"); }
}
/* the book's own contents, or one row per chapter when it has none */
function tocList(){
  var t=R.book.toc;
  if(t && t.length) return t.map(function(x){ return {title:x.title||chapterTitle(x.ch), ch:x.ch|0, p:x.p|0, d:x.d|0}; });
  return R.book.chapters.map(function(c,i){ return {title:chapterTitle(i), ch:i, p:0, d:0}; });
}
function tocGo(it){ closeSheet(); goTo(clamp(it.ch,0,R.book.chapters.length-1),{p:it.p, c:0}); sfx("ok"); }
function jumpBy(k){ R.jump=clamp(R.jump+k,0,100); sfx("move"); renderSheet(); }
function sheetA(){
  if(R.sheet==="menu") menuPick(menuItems()[R.mpick].k);
  else if(R.sheet==="toc"){ var l=tocList(); if(l[R.tpick]) tocGo(l[R.tpick]); }
  else if(R.sheet==="jump"){
    var pos=posAtPct(R.jump); closeSheet();
    if(R.jump>=100) goTo(R.book.chapters.length-1,null,true); else goTo(pos.ch,pos);
    sfx("ok");
  }
}
function sheetBack(){ if(R.sheet==="menu") closeSheet(); else { R.sheet="menu"; renderSheet(); } sfx("tap"); }
function sheetButton(b){
  if(b==="b"||b==="select"){ sheetBack(); return; }
  if(b==="a"||b==="start"){ sheetA(); return; }
  if(R.sheet==="jump"){
    if(b==="left"||b==="right") jumpBy(b==="left"?-1:1);
    else if(b==="up"||b==="down") jumpBy(b==="up"?10:-10);
    return;
  }
  var n=R.sheet==="menu" ? menuItems().length : tocList().length, k=b==="up"||b==="left" ? -1 : 1;
  if(R.sheet==="menu") R.mpick=clamp(R.mpick+k,0,n-1); else R.tpick=clamp(R.tpick+(b==="left"||b==="right" ? k*8 : k),0,n-1);
  sfx("move"); renderSheet();
}

/* ---------- chin pad ----------
   shelf: ▲▼ pick, A open
   page: ◀▲ back a page, ▶▼ on, A or START menu, SELECT the word cursor, B shelf
   cursor: ◀▶▲▼ move (holding A extends), A (pressed and let go) look up, START quote, B or SELECT leave
   entry: ◀▶▲▼ page, B or A close, START word book (as in the dictionary)
   B is "back" on every screen of the handheld, so the quote sits on START, the screen's extra action, and the word book,
   which START also holds in the dictionary, moves with the entry */
function readerButton(b,down){
  if(!R.id){ if(down) shelfButton(b); return; }
  if(!R.book) return;
  if(R.sheet==="thought"){ if(down && b==="a") closeDef(); else if(down && b==="b"){ R.thought.draft=""; closeDef(); } return; }
  if(R.sheet==="def"){
    if(!down) return;
    if(b==="up"||b==="left") defTurn(-1);
    else if(b==="down"||b==="right") defTurn(1);
    else if(b==="a"||b==="b"||b==="select") closeDef();
    else if(b==="start" && R.def.results && R.def.results.length){ LP.dict.toggleWord(headOf(R.def)); renderDef(); }
    return;
  }
  if(R.sheet){ if(down) sheetButton(b); return; }
  if(R.sel){
    var s=R.sel;
    if(b==="a"){ if(down){ s.held=true; s.moved=false; } else if(s.held){ s.held=false; if(!s.moved) lookupSel(); } return; }
    if(!down) return;
    if(b==="left"||b==="right"||b==="up"||b==="down") moveCur(b);
    else if(b==="b"||b==="select"){ endSel(); sfx("tap"); }
    else if(b==="start") quote();
    return;
  }
  if(!down) return;
  if(b==="left"||b==="up") turn(-1);
  else if(b==="right"||b==="down") turn(1);
  else if(b==="a"||b==="start") openMenu();
  else if(b==="select") enterSel();
  else if(b==="b"){ closeBook(); sfx("tap"); }
}
LP.padRoute("reader",function(b,down){ if(!visible()) return false; readerButton(b,down); return true; });
window.addEventListener("resize",function(){ clearTimeout(R.rz); R.rz=setTimeout(relayout,150); });

/* ---------- home icon: an open book ---------- */
var ICON=["................","................",".00000000000000.","0333333003333330","0311113003111130","0333333003333330","0311133003111130","0333333003333330","0311113003111130","0333333003333330","0311333003113330","0333333003333330","0000000000000000",".02222222222220.","..000000000000..","................"];

function openReader(){
  R.sheet=""; R.sel=null; R.def=null; R.armed=null;
  if(R.id) closeBook(); else { mode(false); renderSheet(); renderDef(); }
  show("reader"); showPad(true); applyEink(); renderShelf();
  /* the browser may clear a site's data after a while unless it is persistent (a Home Screen app always is) */
  P.persist().catch(function(){});
  if(R.loaded) seed();
}

LP.builtin({id:"reader", label:"app.reader", icon:function(){ return ICON; }, view:"reader", keepPad:true,
  open:function(){ openReader(); },
  leave:function(){
    if(R.sheet==="thought") saveThought();
    flushMeta(); unmark();
    R.sheet=""; R.sel=null; R.def=null; R.thought=null; R.armed=null;
    $("rd-sheet").hidden=true; $("rd-def").hidden=true;
    $("screen").classList.remove("rd-eink");
  },
  padLayout:function(){ if(visible() && R.book) setTimeout(relayout,0); },
  lang:function(){ if(!visible()) return; if(R.book){ footer(); renderSheet(); renderDef(); } else renderShelf(); },
  ready:function(){
    var base=S.db.doc("data/users/local/reader");
    R.refs={set:base, books:base.collection("books")};
    Promise.all([
      base.get().then(function(sn){
        var s=(sn.exists && own(sn.data()))||{};
        R.set={size:s.size>=0 && s.size<SIZES.length ? s.size|0 : 1, eink:typeof s.eink==="boolean" ? s.eink : null, seeded:!!s.seeded};
      }),
      R.refs.books.get().then(function(q){ q.docs.forEach(function(d){ var m=own(d.data()); if(m && m.title && m.lens) R.meta[d.id]=m; }); })
    ]).catch(function(){}).then(function(){
      R.loaded=true;
      if(visible()){ applyEink(); if(!R.id) renderShelf(); seed(); }
    });
  },
  nostore:function(){ R.loaded=true; if(visible()) renderShelf(); }});
})();
