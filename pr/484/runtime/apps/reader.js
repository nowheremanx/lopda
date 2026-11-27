/*
 * Lo-PDA built-in: e-book reader. A shelf, whole pages (CSS columns, never scrolled), contents, three text sizes,
 * an e-ink mode, pictures dithered to the four tones, links and footnotes, and a 文曲星-style selection: long-press
 * and drag (or SELECT and the D-pad), A looks up, START quotes into a note named after the book and underlines it.
 * An imported font for the text, three layouts, and an e-ink full refresh every ten pages.
 * Design: docs/design/reader-dictionary.md sections 1, 3, 4; decisions.md sections 16 and 17.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * Books are parsed once, on import (runtime/bookparse.js), and kept in LopdaPlatform.files as "book/<id>"; an EPUB's
 * pictures are dithered then and kept as "book/<id>/img/<n>" (PNG). The shelf entry {title, author, lang, chars, lens,
 * imgs, added, opened, pos, pct, marks} is data/users/local/reader/books/<id>; settings {size, eink, seeded, helped, font,
 * layout, flash} are data/users/local/reader. An imported font is "font/<id>" in LopdaPlatform.files (as the user gave it)
 * and {name, bytes, added} in data/users/local/reader/fonts/<id>. A position is {ch, p, c}: chapter, paragraph and character, never a page number, so another
 * text size or screen finds the same sentence. A mark (an underlined quote) is {id, ch, p, a, p2, b, text, thought, t}.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, BK=window.LopdaBook, P=window.LopdaPlatform, TS=window.LopdaTextSel;
var own=LP.own, toast=LP.toast, put=LP.put, sfx=LP.sfx, show=LP.show, showPad=LP.showPad, uid=LP.uid;

var SIZES=[16,19,23], GAP=32;
/* the three layouts: line height (times the text size) and the page's padding; "" keeps the stylesheet's (the default) */
var LAYOUTS=[{line:1.5, pad:"8px 10px 0"},{line:1.7, pad:""},{line:1.9, pad:"18px 26px 0"}];
/* e-ink full refresh: ink, then paper, then the page; on a real e-ink screen this clears the ghost of earlier pages */
var FLASH_EVERY=10, FLASH_INK=120, FLASH_PAPER=80;
/* a font the user imports: the file's first four bytes say what it is (TrueType 1.0 or "true", OpenType, WOFF, WOFF2) */
var FONT_MAX=30*1024*1024, FONT_TAGS=["\0\x01\0\0","true","OTTO","wOFF","wOF2"];
/* pictures are dithered at most this wide, then shown at a whole multiple when it fits: pixels, like the camera's */
var IMG_W=240, IMG_H=320;
/* public-domain samples (runtime/books/, see LICENSING.md), put on the shelf once */
var SAMPLES=[{file:"books/alice.txt", title:"Alice’s Adventures in Wonderland", author:"Lewis Carroll"},
  {file:"books/lunyu.txt", title:"論語", author:""}];

var R={
  set:{size:1, eink:null, seeded:false, helped:false, font:null, layout:1, flash:false},
  fonts:{}, fpick:0, farmed:null, fbusy:null,   // imported fonts {id: {name, bytes, added}}; the font list's row; a font armed for deletion
  drawn:0, flashing:false,          // pages drawn since the last full refresh; a full refresh is on screen
  meta:{}, refs:null, loaded:false, seeding:null,
  pick:0, armed:null, busy:null,
  id:null, book:null, cum:{}, urls:{},   // the open book; per chapter, where each paragraph starts; picture URLs
  ch:0, page:0, pages:1, stride:1, colW:1, colH:1, pos:null, back:null,
  sheet:"",          // over the page: "menu" | "toc" | "notes" | "jump" | "help"; lower half: "def" | "mark" | "note" | "thought"
  mpick:0, tpick:0, npick:0, jump:0, drag:null,
  low:null           // the lower-half sheet: {page, pages, ...}
};

function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function btn(cls,text,fn){ var b=el("button",cls,text); b.type="button"; b.onclick=fn; return b; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function visible(){ return !$("v-reader").hidden; }
function errMsg(e){ return String((e&&e.message)||(e&&e.code)||e).slice(0,100); }
function softkey(key,label,disabled){
  return {label:tr(label), fn:function(){ readerButton(key,true); readerButton(key,false); }};
}
function paras(ch){ return R.book.chapters[ch==null?R.ch:ch].paras; }
function lowerSheet(){ return R.sheet==="def"||R.sheet==="mark"||R.sheet==="note"||R.sheet==="thought"; }

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

/* a picture: decoded by the browser, drawn on paper (transparent parts become paper), dithered like a photo */
function ditherImage(im){
  return new Promise(function(resolve,reject){
    var url=URL.createObjectURL(new Blob([im.data],{type:im.type||""})), img=new Image();
    img.onload=function(){
      URL.revokeObjectURL(url);
      var nw=img.naturalWidth||IMG_W, nh=img.naturalHeight||IMG_W;
      var w=Math.min(IMG_W,nw), h=Math.round(w*nh/nw);
      if(h>IMG_H){ h=IMG_H; w=Math.max(1,Math.round(h*nw/nh)); }
      w=Math.max(1,w); h=Math.max(1,h);
      var c=document.createElement("canvas"); c.width=w; c.height=h;
      var x=c.getContext("2d"); x.fillStyle="#fff"; x.fillRect(0,0,w,h);
      x.imageSmoothingEnabled=true; x.imageSmoothingQuality="high"; x.drawImage(img,0,0,w,h);
      var d=x.getImageData(0,0,w,h).data, lum=new Float32Array(w*h);
      for(var i=0;i<lum.length;i++) lum[i]=(0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2])/255;
      var px=LP.film.ditherLuma(lum,w,h,0,0), out=x.createImageData(w,h), o=out.data;
      for(i=0;i<px.length;i++){ var t=LP.TONES[px[i]]; o[i*4]=t[0]; o[i*4+1]=t[1]; o[i*4+2]=t[2]; o[i*4+3]=255; }
      x.putImageData(out,0,0);
      c.toBlob(function(b){ if(b) resolve({blob:b, w:w, h:h}); else reject(new Error("png")); },"image/png");
    };
    img.onerror=function(){ URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src=url;
  });
}
/* every picture becomes a four-tone PNG of its own; the book keeps only its size (a broken one keeps its alt text) */
function storeImages(id,book){
  var list=book.images||[];
  return list.reduce(function(p,im,n){
    return p.then(function(){
      return ditherImage(im).then(function(r){
        return P.files.put("book/"+id+"/img/"+n,r.blob).then(function(){ list[n]={w:r.w, h:r.h}; });
      },function(){ list[n]={bad:true}; });
    });
  },Promise.resolve()).then(function(){ return list.length; });
}
function dropFiles(id,imgs){
  var jobs=[P.files.del("book/"+id)];
  for(var n=0;n<(imgs||0);n++) jobs.push(P.files.del("book/"+id+"/img/"+n));
  return Promise.all(jobs);
}
function addBook(book,added){
  var lens=book.chapters.map(chars), total=lens.reduce(function(a,b){ return a+b; },0);
  if(!total && !(book.images && book.images.length)) return Promise.reject(new Error(tr("reader.notext")));
  var title=LP.noEmoji(book.title)||tr("reader.untitled");
  for(var k in R.meta) if(R.meta[k].title===title && R.meta[k].chars===total) return Promise.reject(new Error(tr("reader.dup",{name:title})));
  var id=uid(), meta={title:title, author:LP.noEmoji(book.author), lang:book.lang==="zh"?"zh":"en", chars:Math.max(1,total), lens:lens,
    imgs:0, added:added||Date.now(), opened:0, pos:{ch:0, p:0, c:0}, pct:0, marks:[]};
  return storeImages(id,book).then(function(n){
    meta.imgs=n;
    return P.files.put("book/"+id,book);
  }).then(function(){ return put(R.refs.books.doc(id),meta); }).then(function(ok){
    if(!ok) throw new Error(tr("common.savefail",{code:"?"}));
    R.meta[id]=meta; return id;
  }).catch(function(e){ dropFiles(id,meta.imgs||(book.images||[]).length).catch(function(){}); throw e; });
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
    .catch(function(e){ toast(tr("reader.importfail",{msg:errMsg(e)})); sfx("err"); })
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
  var title=R.meta[id].title, imgs=R.meta[id].imgs;
  delete R.meta[id]; renderShelf();
  Promise.resolve(writing[id]).then(function(){ delete writing[id]; return Promise.all([R.refs.books.doc(id).delete(), dropFiles(id,imgs)]); })
    .then(function(){ toast(tr("reader.deleted",{name:title})); },function(){ toast(tr("reader.delfail")); });
};
function shelfButton(b){
  var n=shelfIds().length;
  if(b==="up"||b==="down"){ if(n){ R.pick=clamp(R.pick+(b==="up"?-1:1),0,n-1); R.armed=null; sfx("move"); renderShelf(); } }
  else if(b==="a"){ var id=shelfIds()[R.pick]; if(id){ R.armed=null; openBook(id); } }
  else if(b==="b" && R.armed){ R.armed=null; renderShelf(); }
}

/* ---------- a book: one chapter in the DOM, cut into pages by CSS columns ---------- */
function mode(read){ $("rd-shelf").hidden=read; $("rd-book").hidden=!read; LP.keepAwake(read); }   /* a book page keeps the screen on */
function openBook(id){
  var m=R.meta[id];
  R.id=id; R.book=null; R.cum={}; R.sheet=""; SEL.s=null; R.low=null; R.back=null;
  if(!Array.isArray(m.marks)) m.marks=[];
  mode(true); renderSheet(); renderLow(); $("rd-flow").textContent=""; foot(tr("reader.loading"),"");
  P.files.get("book/"+id).then(function(book){
    if(R.id!==id) return;
    if(!book || !book.chapters || !book.chapters.length) throw new Error("missing");
    R.book=book;
    m.opened=Date.now(); saveMeta(id,true);
    footer();
    return fontReady().then(function(){
      if(R.id!==id) return;
      var pos=m.pos||{ch:0, p:0, c:0};
      goTo(clamp(pos.ch|0,0,book.chapters.length-1),pos);
      R.drawn=1;   /* opening a book is a page drawn whole: it counts towards the next full refresh */
      if(!R.set.helped){ R.set.helped=true; saveSet(); openHelp(); }
    });
  }).catch(function(e){
    if(R.id!==id) return;
    toast(tr("reader.loadfail",{msg:errMsg(e)})); sfx("err"); closeBook();
  });
}
function freeUrls(){ for(var k in R.urls) URL.revokeObjectURL(R.urls[k]); R.urls={}; }
function closeBook(){
  flushMeta(); unmark(); freeUrls();
  R.id=null; R.book=null; R.sheet=""; SEL.s=null; R.low=null; R.back=null; R.pick=0;
  mode(false); renderSheet(); renderLow(); $("rd-help").hidden=true; renderShelf();
}
function chapterTitle(ch){
  var t=R.book.chapters[ch].title;
  return t ? t : R.book.chapters.length>1 ? tr("reader.part",{n:ch+1}) : R.meta[R.id].title;
}
/* text with its emphasis and links: cut at every range edge, each piece wrapped in <em> and/or <a> */
function fill(e,pa){
  var s=pa.s, em=pa.em||[], ln=pa.ln||[], cuts=[0,s.length], k;
  for(k=0;k+1<em.length;k+=2) cuts.push(em[k],em[k+1]);
  for(k=0;k+4<ln.length;k+=5) cuts.push(ln[k],ln[k+1]);
  cuts=cuts.filter(function(v,i,a){ return v>=0 && v<=s.length && a.indexOf(v)===i; }).sort(function(a,b){ return a-b; });
  for(var i=0;i+1<cuts.length;i++){
    var a=cuts[i], b=cuts[i+1], node=document.createTextNode(s.slice(a,b)), j;
    for(j=0;j+1<em.length;j+=2) if(em[j]<=a && b<=em[j+1]){ var x=document.createElement("em"); x.appendChild(node); node=x; break; }
    for(j=0;j+4<ln.length;j+=5) if(ln[j]<=a && b<=ln[j+1]){ var l=document.createElement("a"); l.className="ln"; l.setAttribute("data-l",j/5); l.appendChild(node); node=l; break; }
    e.appendChild(node);
  }
}
function picture(e,pa){
  var im=(R.book.images||[])[pa.img];
  e.className="img";
  if(!im || im.bad){ e.textContent=pa.alt ? "["+pa.alt+"]" : tr("reader.image"); e.className="img bad"; return; }
  var img=document.createElement("img"); img.alt=pa.alt||""; img.width=im.w; img.height=im.h;
  img.setAttribute("data-w",im.w); img.setAttribute("data-h",im.h);
  var key=pa.img, id=R.id;
  if(R.urls[key]) img.src=R.urls[key];
  else P.files.get("book/"+id+"/img/"+key).then(function(b){
    if(!b || R.id!==id) return;
    if(!R.urls[key]) R.urls[key]=URL.createObjectURL(b);
    img.src=R.urls[key];
  }).catch(function(){});
  e.appendChild(img);
}
function renderChapter(ch){
  var flow=$("rd-flow"), c=R.book.chapters[ch];
  flow.textContent=""; flow.setAttribute("lang",R.book.lang==="zh"?"zh":"en");
  c.paras.forEach(function(pa,i){
    var e=document.createElement("p"); if(pa.h) e.className="h";
    e.setAttribute("data-i",i);
    if(pa.img!=null) picture(e,pa); else fill(e,pa);
    flow.appendChild(e);
  });
  R.ch=ch;
  underline();
  measure();
}
/* the column box is cut to whole lines; every page is one column, one stride further left */
function measure(){
  var pg=$("rd-page"), flow=$("rd-flow"), lay=LAYOUTS[R.set.layout]||LAYOUTS[1];
  pg.style.padding=lay.pad;
  var cs=getComputedStyle(pg);
  var w=pg.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  var h=pg.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
  var fs=SIZES[R.set.size]||SIZES[1], lh=Math.round(fs*lay.line);
  w=Math.max(40,Math.floor(w)); h=Math.max(lh,Math.floor(h/lh)*lh);
  flow.style.fontSize=fs+"px"; flow.style.lineHeight=lh+"px";
  flow.style.width=w+"px"; flow.style.height=h+"px";
  flow.style.columnWidth=w+"px"; flow.style.columnGap=GAP+"px";
  flow.style.transition="none"; flow.style.transform="none";
  R.stride=w+GAP; R.colW=w; R.colH=h;
  /* a picture fills the column at a whole multiple of its pixels when it can, and never more than a page */
  Array.prototype.forEach.call(flow.querySelectorAll("p.img img"),function(img){
    var iw=+img.getAttribute("data-w"), ih=+img.getAttribute("data-h"), s=Math.min(w/iw,(h-lh)/ih);
    if(s>=1) s=Math.floor(s);
    img.style.width=Math.max(1,Math.floor(iw*s))+"px"; img.style.height=Math.max(1,Math.floor(ih*s))+"px";
  });
  var last=flow.lastElementChild, rs=last ? last.getClientRects() : [];
  R.pages=rs.length ? pageOf(rs[rs.length-1])+1 : 1;
}
function origin(){ return $("rd-flow").getBoundingClientRect(); }
/* which page a rectangle sits on; measured against the flow itself, so a page turn in progress does not matter */
function pageOf(rect,o){ o=o||origin(); return Math.max(0,Math.floor((rect.left-o.left+1)/R.stride)); }
function charPage(e,c,o){
  var len=paras()[+e.getAttribute("data-i")].s.length;
  if(c>=len) c=len-1;
  var rs=c>=0 ? TS.rangeRects(e,c,c+1) : [];
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
  var len=paras()[i].s.length, a=0, b=len-1, c=0;
  if(len && charPage(e,0,o)<page){
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
function goPct(pct){
  if(pct>=100) goTo(R.book.chapters.length-1,null,true);
  else { var pos=posAtPct(pct); goTo(pos.ch,pos); }
}
function reflow(){ whole(relayout); }
function relayout(){
  if(!R.book || !visible()) return;
  unmark();
  var pos=R.pos;
  renderChapter(R.ch);
  R.page=pos ? pageOfPos(pos) : 0;
  place(false);
  if(SEL.s) startSel(false,SEL.s.unit);
}
function turn(k){
  if(!R.book) return false;
  if(R.flashing){ flashLog("ignored"); return false; }
  var p=R.page+k;
  if(p<0 ? R.ch===0 : p>=R.pages && R.ch>=R.book.chapters.length-1) return false;
  var draw=function(){
    if(p<0) goTo(R.ch-1,null,true);
    else if(p>=R.pages) goTo(R.ch+1,{p:0, c:0});
    else { R.page=p; place(true); remember(null); }
  };
  /* every tenth page drawn since the last full refresh is drawn with one */
  if(++R.drawn>=FLASH_EVERY && flashOn()) whole(draw); else draw();
  sfx("tick");
  return true;
}
/* ---------- e-ink full refresh: the old page in negative, then paper, then the new page; page turns wait for it ---------- */
function flashOn(){ return eink() && !!R.set.flash; }
/* One rule: a page turn (to the next or the previous page) is drawn as it is, every tenth one since the last full
   refresh with one; any other change of the page is drawn whole: contents, go to, the progress bar, text size, font,
   layout, the notes list, a link and B back from it. Either way the count starts again. */
function whole(draw){
  R.drawn=0;
  if(!flashOn() || !R.book || !visible()){ draw(); return; }
  var f=$("rd-flash"), scr=$("screen");
  if(!f){ f=el("div","rd-flash"); f.id="rd-flash"; scr.appendChild(f); }
  /* the page on screen goes negative; the new one is laid out under the blank paper that follows */
  R.flashing=true; f.className="rd-flash ink"; f.hidden=false; scr.classList.add("rd-neg"); flashLog("invert");
  flashNext(function(){
    scr.classList.remove("rd-neg"); f.className="rd-flash paper";
    if(R.book && visible()) draw();
    flashLog("paper");
    flashNext(function(){ f.hidden=true; f.className="rd-flash"; R.flashing=false; flashLog("page"); },FLASH_PAPER);
  },FLASH_INK);
}
/* debug mode (?debug): LOPDA_DEBUG.flash is the list of phases ("invert", "paper", "page", and "ignored" for a turn
   during a refresh), and with LOPDA_DEBUG.flashHold set each phase waits for LOPDA_DEBUG.flashStep(), so a test checks
   the order without timing anything */
function flashLog(s){ var d=window.LOPDA_DEBUG; if(d) (d.flash=d.flash||[]).push(s); }
function flashNext(fn,ms){
  var d=window.LOPDA_DEBUG;
  if(d && d.flashHold) d.flashStep=function(){ d.flashStep=null; fn(); };
  else setTimeout(fn,ms);
}
function foot(left,right){
  var f=$("rd-foot"); f.textContent="";
  f.appendChild(el("span","",left)); if(right) f.appendChild(el("b","",right));
}
function footer(){
  if(!R.book) return;
  var selected=!!SEL.s, info=$("rd-foot"), row=$("rd-keyrow"), keys=$("rd-keys");
  info.hidden=selected; row.hidden=!selected;
  if(selected){
    LP.softkeys(keys,{
      select:softkey("select","sk.unit."+({word:"word",sent:"sent",para:"para"}[SEL.s.unit]||"word")),
      start:softkey("start","sk.quote"),
      b:softkey("b","sk.cancel"),
      a:softkey("a","sk.lookup")
    });
  } else {
    foot(R.back ? tr("reader.linkback") : chapterTitle(R.ch),(R.page+1)+"/"+R.pages);
  }
}

/* the selection (runtime/textsel.js) over the paragraphs of the chapter; only the words on this page count */
var SEL=TS.create({
  root:function(){ return $("rd-flow"); },
  el:function(i){ return $("rd-flow").children[i]; },
  text:function(i){ return paras()[i].s; },
  blocks:function(){
    var kids=$("rd-flow").children, o=origin(), out=[];
    for(var i=0;i<kids.length;i++){
      var rs=kids[i].getClientRects(); if(!rs.length) continue;
      if(pageOf(rs[rs.length-1],o)<R.page) continue;
      if(pageOf(rs[0],o)>R.page) break;
      out.push(i);
    }
    return out;
  },
  frame:function(){ var o=origin(); return {left:o.left+R.page*R.stride, top:o.top}; },
  keep:function(r,f){ var m=r.left+r.width/2; return m>=f.left && m<=f.left+R.stride-GAP; },
  edge:function(back){ turnPage(back?-1:1); },
  changed:function(){ footer(); },
  lookup:function(){ lookupSel(); },
  menuBox:function(){ return $("rd-selmenu"); },
  quote:function(){ quote(); },
  done:function(){ endSel(); }
});

/* ---------- touch ----------
   a tap on the sides turns, a swipe turns, a tap in the middle opens the menu; a tap on a link follows it, on an
   underline shows the quote; a long press starts a selection at that word and dragging extends it; while there is a
   selection, a tap ends it and a swipe ends it and turns */
(function(){
  var pg=$("rd-page"), menuTap=false;
  SEL.touch(pg,{
    down:function(){ menuTap=false; if(!R.book || R.sheet==="help") return false; },
    canHold:function(){ return !lowerSheet(); },
    hold:function(x,y){ selectAt(x,y); },
    up:function(e,g){
      if(!R.book) return;
      var dx=g.dx, dy=g.dy, target=g.target;
      if(lowerSheet()){ closeLow(); return; }
      /* with a selection on the page, a touch first puts it away: a tap does only that, a swipe then turns as usual */
      if(Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)*1.2){ if(SEL.s) endSel(); turn(dx<0?1:-1); return; }
      if(Math.abs(dx)>12 || Math.abs(dy)>12) return;
      if(SEL.s){ endSel(); sfx("tap"); return; }
      var link=target && target.closest && target.closest("a.ln"), hl=target && target.closest && target.closest("u.hl");
      if(link){ followLink(link); return; }
      if(hl){ openMark(hl.getAttribute("data-m")); return; }
      var r=pg.getBoundingClientRect(), fx=(e.clientX-r.left)/r.width;
      if(fx<0.3) turnPage(-1); else if(fx>0.7) turnPage(1); else menuTap=true;
    }
  });
  /* the menu opens on the click that follows, not on pointerup: opened earlier, that click would land on a menu row */
  pg.addEventListener("click",function(){ if(menuTap){ menuTap=false; openMenu(); } });
})();
function turnPage(k){
  if(SEL.s){ var u=SEL.s.unit; SEL.unpaint(); if(turn(k)) SEL.start(k<0,u); else SEL.paint(); return; }
  turn(k);
}

/* ---------- selection (runtime/textsel.js): only the words on this page count, and the cursor running off the page
   turns it (unless A is held: an extended selection stays on one page); a sentence or a paragraph may run over the
   page (the whole chapter is in the DOM) ---------- */
function startSel(fromEnd,unit){ SEL.start(fromEnd,unit); }
function enterSel(){
  if(!R.book) return;
  R.sheet=""; renderSheet();
  startSel(false);
  if(!SEL.s.toks.length) toast(tr("reader.nowords"));
  sfx("tap");
}
function endSel(){ SEL.end(); closeLow(true); footer(); }
function unmark(){ TS.unwrap($("rd-flow"),"mark"); }
function unwrap(sel){ TS.unwrap($("rd-flow"),sel); }
/* long press: a new selection from the word under the finger; dragging moves its far end */
function selectAt(x,y){
  if(R.sheet) { R.sheet=""; renderSheet(); }
  if(!SEL.select(x,y)) toast(tr("reader.nowords"));
}

/* ---------- the lower half: a dictionary entry, an underlined quote, a footnote, or a thought being typed ---------- */
function lookupSel(){
  if(!SEL.s) return;
  var w=SEL.word();
  if(!w) return;
  if(!LP.dict){ toast(tr("reader.nodict")); return; }
  R.low={word:w, results:null, page:0, pages:1};
  R.sheet="def"; renderLow(); sfx("tap");
  var mine=R.low;
  LP.dict.lookup(w).then(function(r){ if(R.low===mine){ mine.results=r; renderLow(); } },
    function(e){ if(R.low===mine){ mine.results=[]; mine.error=errMsg(e); renderLow(); } });
}
function headOf(d){ var r=d.results; return r && r.length && r[0].how!=="exact" ? r[0].word : d.word; }
function closeLow(quiet){
  if(!lowerSheet()) return;
  if(R.sheet==="thought") saveThought();
  R.sheet=""; R.low=null; renderLow();
  if(!quiet) sfx("tap");
}
function lowTurn(k){ var d=R.low; if(!d) return; var p=d.page+k; if(p<0 || p>=d.pages) return; d.page=p; sfx("move"); renderLow(); }
/* a paged text box cut to whole lines, as in the dictionary */
function pageBox(sh,page,count){
  var x0=null,y0=0,swiped=false;
  page.addEventListener("pointerdown",function(e){ x0=e.clientX; y0=e.clientY; swiped=false; });
  page.addEventListener("pointerup",function(e){
    if(x0===null) return;
    var dx=e.clientX-x0,dy=e.clientY-y0; x0=null;
    if(Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)*1.2){
      swiped=true; e.preventDefault(); lowTurn(dx<0?1:-1);
      setTimeout(function(){ swiped=false; },400);
    }
  });
  page.addEventListener("pointercancel",function(){ x0=null; });
  page.onclick=function(ev){ if(swiped){ swiped=false; return; } var r=page.getBoundingClientRect(); lowTurn(ev.clientX<r.left+r.width/3?-1:1); };
  var lh=24, h=Math.max(lh,Math.floor(page.clientHeight/lh)*lh), d=R.low;
  page.style.height=h+"px"; page.style.flex="none";
  d.pages=Math.max(1,Math.ceil((page.scrollHeight-2)/h));
  d.page=Math.min(d.page,d.pages-1);
  page.scrollTop=d.page*h;
  count.textContent=d.pages>1 ? tr("dict.of",{i:d.page+1, n:d.pages}) : "";
}
function renderLow(){
  var sh=$("rd-def"); sh.textContent="";
  sh.hidden=!lowerSheet(); if(sh.hidden) return;
  if(R.sheet==="thought") return thoughtSheet(sh);
  var d=R.low, title=el("p","sheet-title"), count=el("small",""), page=el("div","dict-page"), keys=el("div");
  sh.appendChild(title); sh.appendChild(page); sh.appendChild(keys);
  if(R.sheet==="def"){
    var word=headOf(d);
    title.appendChild(el("span","",word));
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
    LP.softkeys(keys,{
      select:null,
      start:d.results && d.results.length ? {label:tr(LP.dict.inBook(word)?"sk.saved":"sk.addword"),fn:function(){ LP.dict.toggleWord(word); renderLow(); }} : null,
      b:softkey("b","sk.back"),
      a:softkey("a","sk.back")
    });
  } else if(R.sheet==="mark"){
    var mk=markById(d.id);
    title.appendChild(el("span","",tr("reader.mark")));
    page.appendChild(document.createTextNode("「"+(mk ? mk.text : "")+"」\n"));
    page.appendChild(el("b","",tr("reader.thoughts"))); page.appendChild(document.createTextNode("\n"));
    page.appendChild(document.createTextNode(mk && mk.thought ? mk.thought : tr("reader.nothought")));
    LP.softkeys(keys,{
      select:null,
      start:{label:tr(d.armed?"sk.confirm":"sk.delete"),fn:function(){ markDelete(); }},
      b:softkey("b","sk.back"),
      a:{label:tr("sk.note"),fn:function(){ markThought(); }}
    });
  } else if(R.sheet==="note"){
    title.appendChild(el("span","",tr("reader.note")));
    page.appendChild(document.createTextNode(d.text));
    LP.softkeys(keys,{
      select:null,
      start:null,
      b:softkey("b","sk.back"),
      a:{label:tr("sk.open"),fn:function(){ jumpLink(d.ch,d.p); }}
    });
  }
  title.appendChild(count);
  pageBox(sh,page,count);
}

/* ---------- 摘抄 (START's menu): underline it in the book + add it to the note 《书名》; then a thought under it.
   The clipboard is 复制's job (decisions.md section 18) ---------- */
function markById(id){ var m=R.meta[R.id]; return m ? m.marks.filter(function(x){ return x.id===id; })[0] : null; }
function noteName(){ return "《"+R.meta[R.id].title+"》"; }
function quoteHead(ch){ var t=R.book.chapters[ch].title; return noteName()+(t ? " "+t : ""); }
function quote(){
  if(!SEL.s || !R.book) return;
  var parts=SEL.parts(), text=SEL.text().trim(); if(!text || !parts.length) return;
  if(!LP.notes){ toast(tr("reader.quotefail",{msg:"notes"})); return; }
  var m=R.meta[R.id], first=parts[0], last=parts[parts.length-1];
  var mk={id:uid(), ch:R.ch, p:first.p, a:first.a, p2:last.p, b:last.b, text:text, thought:"", t:Date.now()};
  LP.notes.append(noteName(),quoteHead(R.ch)+"\n「"+text+"」").then(function(){
    m.marks.push(mk); saveMeta(R.id,true);
    sfx("ok"); toast(tr("sel.quoted"));
    if(!R.book || R.id==null) return;
    endSel(); unwrap("u.hl"); underline();
    R.sheet="thought"; R.low={mark:mk.id, fresh:true}; renderLow();
  },function(e){ toast(tr("reader.quotefail",{msg:errMsg(e)})); sfx("err"); });
}
/* underline every mark in this chapter (a dotted line under ink; inline, so nothing moves) */
function underline(){
  var kids=$("rd-flow").children;
  (R.meta[R.id].marks||[]).forEach(function(mk){
    if(mk.ch!==R.ch) return;
    for(var p=mk.p;p<=mk.p2;p++){
      var e=kids[p]; if(!e) continue;
      var len=paras()[p].s.length;
      TS.wrap(e,p===mk.p ? mk.a : 0,p===mk.p2 ? mk.b : len,function(){ var u=document.createElement("u"); u.className="hl"; u.setAttribute("data-m",mk.id); return u; });
    }
  });
}
function openMark(id){ if(!markById(id)) return; R.sheet="mark"; R.low={id:id, page:0, pages:1}; renderLow(); sfx("tap"); }
function markThought(){
  var mk=markById(R.low.id); if(!mk) return;
  R.sheet="thought"; R.low={mark:mk.id, fresh:false}; renderLow();
}
function markDelete(){
  var d=R.low, m=R.meta[R.id];
  if(!d.armed){ d.armed=true; sfx("tap"); renderLow(); return; }
  m.marks=m.marks.filter(function(x){ return x.id!==d.id; }); saveMeta(R.id,true);
  R.sheet=""; R.low=null; renderLow();
  unwrap("u.hl"); underline();
  toast(tr("reader.unmarked")); sfx("ok");
}
function thoughtSheet(sh){
  var mk=markById(R.low.mark);
  sh.appendChild(el("p","hint",R.low.fresh ? tr("reader.quoted",{name:noteName()}) : "「"+(mk ? mk.text : "")+"」"));
  var ta=el("textarea"); ta.id="rd-thought"; ta.placeholder=tr("reader.thought"); ta.maxLength=4000;
  if(R.low.draft) ta.value=R.low.draft;
  ta.oninput=function(){ if(R.low) R.low.draft=ta.value; };
  sh.appendChild(ta);
  var keys=el("div");
  LP.softkeys(keys,{
    select:null,start:null,
    b:{label:tr("sk.skip"),fn:function(){ R.low.draft=""; closeLow(); }},
    a:{label:tr("sk.done"),fn:function(){ closeLow(); }}
  });
  sh.appendChild(keys);
  /* a real tap brings up the keyboard on a phone; with a keyboard this is where typing goes anyway */
  if(!(window.matchMedia && matchMedia("(pointer: coarse)").matches)) try{ ta.focus({preventScroll:true}); }catch(e){}
}
/* right after a quote the thought goes on the line under it; a later thought repeats the quote, since the note is a
   running log and other quotes may have come in between. Leaving the screen keeps what was typed. */
function saveThought(){
  var d=R.low; if(!d) return;
  var text=String(d.draft||"").trim(); d.draft="";
  var ta=$("rd-thought"); if(ta) ta.blur();
  var mk=markById(d.mark);
  if(!text || !mk) return;
  mk.thought=mk.thought ? mk.thought+"\n"+text : text; saveMeta(R.id,true);
  var job=d.fresh ? LP.notes.append(noteName(),text,"\n") : LP.notes.append(noteName(),quoteHead(mk.ch)+"\n「"+mk.text+"」\n"+text);
  job.then(function(){ toast(tr("reader.saved")); },function(e){ toast(tr("reader.quotefail",{msg:errMsg(e)})); });
}

/* ---------- links: a footnote opens in the lower half; any other link jumps, and B comes back ---------- */
function followLink(a){
  var e=a.closest("p"), pa=paras()[+e.getAttribute("data-i")], k=+a.getAttribute("data-l")*5, ln=pa.ln||[];
  var ch=ln[k+2], p=ln[k+3], note=ln[k+4];
  if(ch==null || !R.book.chapters[ch]) return;
  if(note){
    var ps=paras(ch), text=(ps[p]||{s:""}).s;
    /* a note that is only its number ("1") carries its words in the next paragraph */
    if(text.trim().length<=4 && ps[p+1]) text+=" "+ps[p+1].s;
    R.sheet="note"; R.low={text:text, ch:ch, p:p, page:0, pages:1}; renderLow(); sfx("tap");
    return;
  }
  jumpLink(ch,p);
}
function jumpLink(ch,p){
  if(lowerSheet()){ R.sheet=""; R.low=null; renderLow(); }
  R.back=R.back || {ch:R.pos.ch, p:R.pos.p, c:R.pos.c};
  whole(function(){ goTo(ch,{p:p, c:0}); }); sfx("ok");
}
function goBack(){ var b=R.back; R.back=null; whole(function(){ goTo(b.ch,b); }); sfx("tap"); }

/* ---------- menu, contents, notes, jump, help ---------- */
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
    {k:"notes", label:tr("reader.notes"), val:String(R.meta[R.id].marks.length)},
    {k:"size", label:tr("reader.size"), val:tr("reader.sizes").split("|")[R.set.size]},
    {k:"font", label:tr("reader.font"), val:R.set.font && R.fonts[R.set.font] ? R.fonts[R.set.font].name : ""},
    {k:"layout", label:tr("reader.layout"), val:tr("reader.layouts").split("|")[R.set.layout]},
    {k:"jump", label:tr("reader.jump")},
    {k:"select", label:tr("reader.select"), val:"SELECT"},
    {k:"eink", label:tr("reader.eink"), val:tr(eink()?"set.on":"set.off")},
    /* only with e-ink on: on a screen that does not ghost it would only blink */
    eink() ? {k:"flash", label:tr("reader.flash"), val:tr("reader.flashes").split("|")[R.set.flash?1:0]} : null,
    {k:"help", label:tr("reader.help")},
    {k:"shelf", label:tr("reader.shelfback"), val:"B"}
  ].filter(Boolean);
}
function openMenu(){ if(!R.book) return; R.sheet="menu"; R.mpick=0; R.drag=null; renderSheet(); sfx("tap"); }
function closeSheet(){ R.sheet=""; renderSheet(); }
function marksSorted(){
  return R.meta[R.id].marks.slice().sort(function(x,y){ return (x.ch-y.ch)||(x.p-y.p)||(x.a-y.a); });
}
function renderSheet(){
  var sh=$("rd-sheet"), on=R.sheet==="menu"||R.sheet==="toc"||R.sheet==="jump"||R.sheet==="notes"||R.sheet==="font";
  sh.hidden=!on; sh.textContent=""; if(!on) return;
  var m=R.meta[R.id], title=el("p","sheet-title");
  title.appendChild(el("span","",R.sheet==="toc" ? tr("reader.toc") : R.sheet==="jump" ? tr("reader.jump") : R.sheet==="notes" ? tr("reader.notes") : R.sheet==="font" ? tr("reader.font") : m.title));
  title.appendChild(el("small","",Math.floor(m.pct||0)+"%"));
  sh.appendChild(title);
  var keys=el("div"), keyset=null;
  if(R.sheet==="menu"){
    var ul=el("ul","lcd-menu");
    menuItems().forEach(function(it,i){
      var li=el("li",i===R.mpick?"on":""); li.appendChild(el("span","",it.label)); if(it.val) li.appendChild(el("small","",it.val));
      li.onclick=function(){ R.mpick=i; menuPick(it.k); };
      ul.appendChild(li);
    });
    sh.appendChild(ul);
    sh.appendChild(track());
  } else if(R.sheet==="toc"){
    var tu=el("ul","lcd-menu rd-toc");
    tocList().forEach(function(it,i){
      var li=el("li",i===R.tpick?"on":""); li.style.paddingLeft=(10+12*(it.d||0))+"px";
      li.appendChild(el("span","",it.title));
      li.onclick=function(){ R.tpick=i; tocGo(it); };
      tu.appendChild(li);
    });
    sh.appendChild(tu);
  } else if(R.sheet==="notes"){
    var list=marksSorted(), nu=el("ul","lcd-menu rd-notes");
    if(!list.length) sh.appendChild(el("p","hint",tr("reader.nonotes")));
    R.npick=clamp(R.npick,0,Math.max(0,list.length-1));
    list.forEach(function(mk,i){
      var li=el("li",i===R.npick?"on":""), body=el("span","");
      body.appendChild(el("small","",chapterTitle(mk.ch)));
      body.appendChild(el("span","","「"+mk.text+"」"));
      if(mk.thought) body.appendChild(el("small","",mk.thought));
      li.appendChild(body);
      li.onclick=function(){ R.npick=i; noteGo(mk); };
      nu.appendChild(li);
    });
    sh.appendChild(nu);
  } else if(R.sheet==="font"){
    var rows=fontRows(), fu=el("ul","lcd-menu rd-fonts");
    R.fpick=clamp(R.fpick,0,rows.length-1);
    rows.forEach(function(r,i){
      var li=el("li",i===R.fpick?"on":""); li.appendChild(el("span","",r.label));
      if(r.k===(R.set.font||"") ) li.appendChild(el("small","",tr("reader.inuse")));
      li.onclick=function(){ if(R.fpick!==i) R.farmed=null; R.fpick=i; fontA(); };
      fu.appendChild(li);
    });
    sh.appendChild(fu);
    var cur=rows[R.fpick];
    sh.appendChild(el("p","hint",R.fbusy || (R.farmed && cur.k===R.farmed ? tr("reader.fontarmed",{name:cur.label}) : tr("reader.fonthint"))));
    keyset={
      select:null,
      start:cur.k && cur.k!=="+" ? {label:tr(R.farmed===cur.k ? "sk.confirm" : "sk.delete"),fn:function(){ fontDelete(); }} : null,
      b:softkey("b","sk.back"),
      a:{label:tr(cur.k==="+"?"sk.import":"sk.use"),fn:function(){ readerButton("a",true); readerButton("a",false); }}
    };
  } else {
    var box=el("div","rd-jump");
    box.appendChild(el("b","",R.jump+"%"));
    box.appendChild(el("span","",chapterTitle(posAtPct(R.jump).ch)));
    box.addEventListener("pointerdown",function(e){ box._sx=e.clientX; box._sy=e.clientY; });
    box.addEventListener("pointerup",function(e){
      if(box._sx==null) return;
      var dx=e.clientX-box._sx,dy=e.clientY-box._sy; box._sx=null;
      if(Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)*1.2){ e.preventDefault(); jumpBy(dx<0?1:-1); }
    });
    sh.appendChild(box);
    keyset={
      select:null,
      start:null,
      b:softkey("b","sk.cancel"),
      a:{label:tr("sk.jump"),fn:function(){ readerButton("a",true); readerButton("a",false); }}
    };
  }
  if(!keyset){
    var openLabel=R.sheet==="menu"?"sk.confirm":"sk.open";
    keyset={select:null,start:null,
      b:softkey("b","sk.back"),a:{label:tr(openLabel),fn:function(){ readerButton("a",true); readerButton("a",false); }}};
  }
  LP.softkeys(keys,keyset);
  sh.appendChild(keys);
  /* only now, with the keys below it, does the list have its final height: keep the highlighted row in view */
  var on=sh.querySelector(".lcd-menu li.on"); if(on && on.scrollIntoView) on.scrollIntoView({block:R.sheet==="toc" ? "center" : "nearest"});
}
/* the progress bar under the menu: drag (or tap) anywhere on it to go there */
function track(){
  var box=el("div","rd-track"), bar=el("div","rd-bar"), fill=el("i"), label=el("p","hint");
  var pct=R.drag!=null ? R.drag : Math.floor(R.meta[R.id].pct||0);
  var draw=function(v){ fill.style.width=v+"%"; label.textContent=tr("reader.at",{pct:v, ch:chapterTitle(posAtPct(v).ch)}); };
  bar.appendChild(fill); box.appendChild(bar); box.appendChild(label); draw(pct);
  var at=function(e){ var r=bar.getBoundingClientRect(); return clamp(Math.round((e.clientX-r.left)/r.width*100),0,100); };
  var id=null;
  bar.addEventListener("pointerdown",function(e){ id=e.pointerId; try{ bar.setPointerCapture(id); }catch(x){} R.drag=at(e); draw(R.drag); });
  bar.addEventListener("pointermove",function(e){ if(e.pointerId!==id) return; var v=at(e); if(v!==R.drag){ R.drag=v; draw(v); sfx("tick"); } });
  bar.addEventListener("pointerup",function(e){ if(e.pointerId!==id) return; id=null; var v=at(e); R.drag=null; closeSheet(); whole(function(){ goPct(v); }); sfx("ok"); });
  bar.addEventListener("pointercancel",function(){ id=null; R.drag=null; draw(Math.floor(R.meta[R.id].pct||0)); });
  return box;
}
function menuPick(k){
  if(k==="toc"){ var l=tocList(); R.tpick=0; l.forEach(function(it,i){ if(it.ch<R.pos.ch || (it.ch===R.pos.ch && it.p<=R.pos.p)) R.tpick=i; }); R.sheet="toc"; renderSheet(); sfx("tap"); }
  else if(k==="notes"){ R.npick=0; R.sheet="notes"; renderSheet(); sfx("tap"); }
  else if(k==="size"){ R.set.size=(R.set.size+1)%SIZES.length; saveSet(); reflow(); renderSheet(); sfx("tap"); }
  else if(k==="font"){ R.fpick=0; R.farmed=null; fontRows().forEach(function(r,i){ if(r.k===(R.set.font||"")) R.fpick=i; }); R.sheet="font"; renderSheet(); sfx("tap"); }
  else if(k==="layout"){ R.set.layout=(R.set.layout+1)%LAYOUTS.length; saveSet(); reflow(); renderSheet(); sfx("tap"); }
  else if(k==="flash"){ R.set.flash=!R.set.flash; R.drawn=1; saveSet(); renderSheet(); sfx("tap"); }
  else if(k==="jump"){ R.jump=Math.floor(R.meta[R.id].pct||0); R.sheet="jump"; renderSheet(); sfx("tap"); }
  else if(k==="select"){ enterSel(); }
  else if(k==="eink"){ R.set.eink=!eink(); R.drawn=1; saveSet(); applyEink(); renderSheet(); sfx("tap"); }
  else if(k==="help"){ closeSheet(); openHelp(); }
  else if(k==="shelf"){ closeBook(); sfx("tap"); }
}
/* the book's own contents, or one row per chapter when it has none */
function tocList(){
  var t=R.book.toc;
  if(t && t.length) return t.map(function(x){ return {title:x.title||chapterTitle(x.ch), ch:x.ch|0, p:x.p|0, d:x.d|0}; });
  return R.book.chapters.map(function(c,i){ return {title:chapterTitle(i), ch:i, p:0, d:0}; });
}
function tocGo(it){ closeSheet(); whole(function(){ goTo(clamp(it.ch,0,R.book.chapters.length-1),{p:it.p, c:0}); }); sfx("ok"); }
function noteGo(mk){ closeSheet(); whole(function(){ goTo(clamp(mk.ch,0,R.book.chapters.length-1),{p:mk.p, c:mk.a}); }); sfx("ok"); }
function jumpBy(k){ R.jump=clamp(R.jump+k,0,100); sfx("move"); renderSheet(); }
function sheetA(){
  if(R.sheet==="menu") menuPick(menuItems()[R.mpick].k);
  else if(R.sheet==="toc"){ var l=tocList(); if(l[R.tpick]) tocGo(l[R.tpick]); }
  else if(R.sheet==="notes"){ var n=marksSorted(); if(n[R.npick]) noteGo(n[R.npick]); }
  else if(R.sheet==="jump"){ var v=R.jump; closeSheet(); whole(function(){ goPct(v); }); sfx("ok"); }
  else if(R.sheet==="font") fontA();
}
function sheetBack(){ if(R.sheet==="menu") closeSheet(); else { R.sheet="menu"; renderSheet(); } sfx("tap"); }
function sheetButton(b){
  if(b==="b"||b==="select"){ sheetBack(); return; }
  if(R.sheet==="font" && b==="start"){ fontDelete(); return; }
  if(b==="a"||b==="start"){ sheetA(); return; }
  if(R.sheet==="jump"){
    if(b==="left"||b==="right") jumpBy(b==="left"?-1:1);
    else if(b==="up"||b==="down") jumpBy(b==="up"?10:-10);
    return;
  }
  var k=b==="up"||b==="left" ? -1 : 1, big=b==="left"||b==="right";
  if(R.sheet==="menu") R.mpick=clamp(R.mpick+k,0,menuItems().length-1);
  else if(R.sheet==="font"){ R.fpick=clamp(R.fpick+k,0,fontRows().length-1); R.farmed=null; }
  else if(R.sheet==="toc") R.tpick=clamp(R.tpick+(big ? k*8 : k),0,tocList().length-1);
  else R.npick=clamp(R.npick+(big ? k*8 : k),0,Math.max(0,R.meta[R.id].marks.length-1));
  sfx("move"); renderSheet();
}
/* the key card: once over the first book, and from the menu after that; a tap or any key puts it away */
function openHelp(){
  var h=$("rd-help"); h.textContent="";
  var zones=el("div","rd-zones");
  zones.appendChild(el("span","",tr("reader.h.prev")));
  zones.appendChild(el("span","",tr("reader.h.menu")));
  zones.appendChild(el("span","",tr("reader.h.next")));
  h.appendChild(zones);
  var card=el("div","rd-card");
  ["reader.h.hold","reader.h.keys","reader.h.sel","reader.h.marks"].forEach(function(k){ card.appendChild(el("p","",tr(k))); });
  card.appendChild(el("p","hint",tr("reader.h.close")));
  h.appendChild(card);
  h.hidden=false; R.sheet="help";
  h.onclick=closeHelp;
}
function closeHelp(){ $("rd-help").hidden=true; if(R.sheet==="help") R.sheet=""; sfx("tap"); }

/* ---------- fonts: imported by the user, used for the text of the book only ----------
   The list: the system font, each imported font, then a row that imports one. A uses (or imports), START deletes (twice).
   A font is loaded from its stored bytes with FontFace, under a name of its own, and only .rd-flow asks for it, ahead of
   the system fonts: a font without Chinese still shows Chinese. Pages are cut once it has loaded. */
var faces={}, sysFamily=null;
function fontRows(){
  var ids=Object.keys(R.fonts).sort(function(a,b){ return (R.fonts[a].added||0)-(R.fonts[b].added||0); });
  return [{k:"", label:tr("reader.fontsys")}].concat(ids.map(function(id){ return {k:id, label:R.fonts[id].name}; }),[{k:"+", label:tr("reader.fontadd")}]);
}
function bufOf(b){ return b instanceof ArrayBuffer ? Promise.resolve(b) : b.arrayBuffer ? b.arrayBuffer() : new Response(b).arrayBuffer(); }
function loadFace(id){
  if(!faces[id]) faces[id]=P.files.get("font/"+id).then(function(b){
    if(!b) throw new Error("missing");
    return bufOf(b);
  }).then(function(buf){ return new FontFace("lprd-"+id,buf).load(); }).then(function(face){ document.fonts.add(face); return face; });
  faces[id].catch(function(){ delete faces[id]; });
  return faces[id];
}
/* the system stack, as the stylesheet has it, so the imported font only goes in front of it */
function sysFonts(){
  if(sysFamily==null){ var f=$("rd-flow"), old=f.style.fontFamily; f.style.fontFamily=""; sysFamily=getComputedStyle(f).fontFamily; f.style.fontFamily=old; }
  return sysFamily;
}
function styleFont(){
  var id=R.set.font;
  $("rd-flow").style.fontFamily=id && R.fonts[id] ? "\"lprd-"+id+"\", "+sysFonts() : "";
}
/* the chosen font loaded and applied; one that cannot load is dropped for the system font */
function fontReady(){
  var id=R.set.font;
  if(id && !R.fonts[id]){ R.set.font=null; id=null; }
  if(!id){ styleFont(); return Promise.resolve(); }
  return loadFace(id).then(styleFont,function(){
    if(R.set.font===id){ R.set.font=null; saveSet(); toast(tr("reader.fontfail")); sfx("err"); }
    styleFont();
  });
}
function useFont(id){
  R.set.font=id||null; R.farmed=null; saveSet();
  fontReady().then(function(){ if(R.book) reflow(); if(R.sheet==="font") renderSheet(); });
  sfx("tap");
}
function fontA(){
  var r=fontRows()[R.fpick]; if(!r) return;
  if(r.k==="+"){
    if(R.fbusy) return;   /* one import at a time */
    if(!S.db || !R.refs){ toast(tr("reader.nodb")); sfx("err"); return; }
    R.farmed=null; $("rd-fontfile").value=""; $("rd-fontfile").click(); return;
  }
  if(r.k!==(R.set.font||"")) useFont(r.k);
  else { R.farmed=null; renderSheet(); }
}
function fontDelete(){
  var r=fontRows()[R.fpick]; if(!r || !r.k || r.k==="+") return;
  if(R.farmed!==r.k){ R.farmed=r.k; sfx("tap"); renderSheet(); return; }
  var id=r.k, name=R.fonts[id].name;
  R.farmed=null; delete R.fonts[id];
  Promise.all([R.refs.fonts.doc(id).delete(), P.files.del("font/"+id)]).then(function(){ toast(tr("reader.fontdel",{name:name})); },function(){ toast(tr("reader.delfail")); });
  var face=faces[id]; delete faces[id];
  if(face) face.then(function(f){ document.fonts.delete(f); },function(){});
  if(R.set.font===id) useFont(null); else { sfx("ok"); renderSheet(); }
}
function fontName(f){ return LP.noEmoji(f.name.replace(/^.*[\\/]/,"").replace(/\.[^.]*$/,"")).slice(0,40)||tr("reader.untitled"); }
function importFont(f){
  var name=fontName(f);
  if(f.size>FONT_MAX) return Promise.reject(new Error(tr("reader.fontbig",{name:name})));
  for(var k in R.fonts) if(R.fonts[k].name===name && R.fonts[k].bytes===f.size) return Promise.reject(new Error(tr("reader.fontdup")));
  var id=uid(), meta={name:name, bytes:f.size, added:Date.now()};
  return bufOf(f).then(function(buf){
    var head=String.fromCharCode.apply(null,new Uint8Array(buf,0,Math.min(4,buf.byteLength)));
    if(FONT_TAGS.indexOf(head)<0) throw new Error(tr("reader.fontbad",{name:name}));
    /* the browser must be able to use it before it is kept */
    return new FontFace("lprd-test",buf).load().then(function(){ return buf; },function(){ throw new Error(tr("reader.fontbad",{name:name})); });
  }).then(function(buf){
    return P.files.put("font/"+id,new Blob([buf],{type:f.type||"application/octet-stream"}));
  }).then(function(){ return put(R.refs.fonts.doc(id),meta); }).then(function(ok){
    if(!ok) throw new Error(tr("common.savefail",{code:"?"}));
    R.fonts[id]=meta; return id;
  }).catch(function(e){ P.files.del("font/"+id).catch(function(){}); throw e; });
}
$("rd-fontfile").addEventListener("change",function(){
  var f=(this.files||[])[0]; if(!f || R.fbusy) return;
  /* reading the file and parsing it can take a while for a big CJK font */
  R.fbusy=tr("reader.importing",{name:fontName(f)}); if(R.sheet==="font") renderSheet();
  var done=function(){ R.fbusy=null; };
  importFont(f).then(function(id){
    done();
    toast(tr("reader.fontadded",{name:R.fonts[id].name})); sfx("ok");
    /* imported to be used: it becomes the font at once */
    fontRows().forEach(function(r,i){ if(r.k===id) R.fpick=i; });
    useFont(id);
    /* the busy hint goes with the toast, not when the font has loaded for the text */
    if(R.sheet==="font") renderSheet();
  },function(e){ done(); toast(errMsg(e)); sfx("err"); if(R.sheet==="font") renderSheet(); });
});

/* ---------- chin pad ----------
   shelf: ▲▼ pick, A open
   page: ◀▲ back a page, ▶▼ or A on, START menu, SELECT selection, B back from a link, else shelf
   (A turns the page: nothing on a page needs confirming, and a right thumb on A reads one-handed; owner 2026-10-11)
   selection: ◀▶▲▼ move (holding A extends), A (pressed and let go) look up, START a menu of 摘抄 (quote) and 复制 (copy;
     on A's release), SELECT word / sentence / paragraph, B leave
   entry: ◀▶▲▼ page, B or A close, START word book (as in the dictionary); quote: A thought, START remove (twice), B close;
   footnote: A go there, B close; help: any key
   B is "back" on every screen of the handheld, so the quote sits on START, the screen's extra action */
function readerButton(b,down){
  if(!R.id){ if(down) shelfButton(b); return; }
  if(!R.book) return;
  if(R.sheet==="help"){ if(down) closeHelp(); return; }
  /* the file picker needs a user gesture, and on a touch screen the chin pad's press is not one: open it on release */
  if(R.sheet==="font" && b==="a" && fontRows()[R.fpick].k==="+"){ if(!down) fontA(); return; }
  if(R.sheet==="thought"){ if(down && b==="a") closeLow(); else if(down && b==="b"){ R.low.draft=""; closeLow(); } return; }
  if(lowerSheet()){
    if(!down) return;
    if(b==="up"||b==="left") lowTurn(-1);
    else if(b==="down"||b==="right") lowTurn(1);
    else if(b==="b"||b==="select") closeLow();
    else if(R.sheet==="def"){
      if(b==="a") closeLow();
      else if(b==="start" && R.low.results && R.low.results.length){ LP.dict.toggleWord(headOf(R.low)); renderLow(); }
    }
    else if(R.sheet==="mark"){ if(b==="a") markThought(); else if(b==="start") markDelete(); }
    else if(R.sheet==="note" && b==="a") jumpLink(R.low.ch,R.low.p);
    return;
  }
  if(R.sheet){ if(down) sheetButton(b); return; }
  if(SEL.s){
    if(SEL.key(b,down)) return;
    if(!down) return;
    if(b==="b"){ endSel(); sfx("tap"); }
    return;
  }
  if(!down) return;
  if(b==="left"||b==="up") turn(-1);
  else if(b==="right"||b==="down") turn(1);
  else if(b==="a") turn(1);
  else if(b==="start") openMenu();
  else if(b==="select") enterSel();
  else if(b==="b"){ if(R.back) goBack(); else { closeBook(); sfx("tap"); } }
}
LP.padRoute("reader",function(b,down){ if(!visible()) return false; readerButton(b,down); return true; });
window.addEventListener("resize",function(){ clearTimeout(R.rz); R.rz=setTimeout(relayout,150); });

/* ---------- home icon: an open book ---------- */
var ICON=["................","................",".00000000000000.","0333333003333330","0311113003111130","0333333003333330","0311133003111130","0333333003333330","0311113003111130","0333333003333330","0311333003113330","0333333003333330","0000000000000000",".02222222222220.","..000000000000..","................"];

function openReader(){
  R.sheet=""; SEL.s=null; R.low=null; R.armed=null;
  if(R.id) closeBook(); else { mode(false); renderSheet(); renderLow(); }
  show("reader"); showPad(true); applyEink(); renderShelf();
  /* the browser may clear a site's data after a while unless it is persistent (a Home Screen app always is) */
  P.persist().catch(function(){});
  if(R.loaded) seed();
}

/* ---------- the pet (docs/decisions.md section 37): a read-only summary of the reading position, never title or text ---------- */
/* the pet (docs/decisions.md section 37) uses this: the most recently opened unfinished book as {id, pct, opened}, with no
   title, author or text, or null; R.meta is kept in memory, so it is synchronous */
function petCurrent(){
  var best=null;
  Object.keys(R.meta).forEach(function(id){
    var m=R.meta[id]; if(!m || !(m.opened>0)) return;
    if((m.pct||0)>=100) return;   // finished, whatever rounding would show
    var pct=Math.max(0,Math.min(100,Math.round(m.pct||0)));
    if(!best || m.opened>best.opened) best={id:id, pct:pct, opened:m.opened};
  });
  return best;
}
/* the pet (docs/decisions.md section 37) uses this: opens that book as a tap on the shelf does; no title or text, and false
   for an id that is not on the shelf */
function petOpenBook(id){
  if(!id || !R.meta[id]) return false;
  openReader();
  openBook(id);
  return true;
}
LP.reader={current:petCurrent, open:petOpenBook};

LP.builtin({id:"reader", label:"app.reader", icon:function(){ return ICON; }, view:"reader", keepPad:true,
  open:function(){ openReader(); },
  leave:function(){
    if(R.sheet==="thought") saveThought();
    flushMeta(); unmark(); LP.keepAwake(false);
    R.sheet=""; SEL.s=null; R.low=null; R.armed=null;
    $("rd-sheet").hidden=true; $("rd-def").hidden=true; $("rd-help").hidden=true; $("rd-selmenu").hidden=true;
    $("screen").classList.remove("rd-eink");
    var f=$("rd-flash"); if(f) f.hidden=true; $("screen").classList.remove("rd-neg"); R.flashing=false;
  },
  padLayout:function(){ if(visible() && R.book) setTimeout(relayout,0); },
  lang:function(){ if(!visible()) return; if(R.book){ footer(); renderSheet(); renderLow(); SEL.drawMenu(); if(R.sheet==="help") openHelp(); } else renderShelf(); },
  ready:function(){
    var base=S.db.doc("data/users/local/reader");
    R.refs={set:base, books:base.collection("books"), fonts:base.collection("fonts")};
    Promise.all([
      base.get().then(function(sn){
        var s=(sn.exists && own(sn.data()))||{};
        R.set={size:s.size>=0 && s.size<SIZES.length ? s.size|0 : 1, eink:typeof s.eink==="boolean" ? s.eink : null, seeded:!!s.seeded, helped:!!s.helped,
          font:typeof s.font==="string" ? s.font : null, layout:s.layout>=0 && s.layout<LAYOUTS.length ? s.layout|0 : 1, flash:!!s.flash};
      }),
      R.refs.fonts.get().then(function(q){ q.docs.forEach(function(d){ var f=own(d.data()); if(f && f.name) R.fonts[d.id]=f; }); }),
      R.refs.books.get().then(function(q){ q.docs.forEach(function(d){ var m=own(d.data()); if(m && m.title && m.lens){ if(!Array.isArray(m.marks)) m.marks=[]; R.meta[d.id]=m; } }); })
    ]).catch(function(){}).then(function(){
      R.loaded=true;
      if(visible()){ applyEink(); if(!R.id) renderShelf(); seed(); }
    });
  },
  nostore:function(){ R.loaded=true; if(visible()) renderShelf(); }});
})();
