/*
 * Lo-PDA runtime: the 文曲星-style text selection, shared by the reader and the dictionary's entry page
 * (docs/design/softkeys.md section 3, decisions.md section 18). English moves by word, Chinese by character; holding A
 * (or a drag) extends; SELECT widens to the sentence or the paragraph; the selection is drawn as <mark> (ink, paper text).
 * The system's own text selection stays off (body{user-select:none}).
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * window.LopdaTextSel:
 *   pure text (no DOM, tests/textsel.test.mjs): units(s), sentStart(s,a), sentEnd(s,b), widen(text,lo,hi,unit), join(text,parts)
 *     text is an array of strings or a function i -> string; a unit or a part is {p, a, b}: block p, characters a..b
 *   DOM: nodeAt(e,c), rangeRects(e,a,b), wrap(e,a,b,make), unwrap(root,selector), copy(text) -> Promise<bool>
 *   create(host) -> a selection over blocks of text; the host says which blocks, where they are and what is on screen:
 *     root()   the element the <mark>s live in       el(i), text(i)   block i: its element and its plain text
 *     blocks() the block numbers to scan, in order   frame()          {left, top}: where token coordinates start
 *     keep(rect, frame) a token counts (optional)     edge(back)       the cursor ran off the tokens (A not held)
 *     moved(tok) after the cursor moves (optional)   changed()        after start, unit or hold changes: redraw the keys
 *     lookup() A was pressed and let go without moving
 */
(function(){
"use strict";
var UNITS=["word","sent","para"], LONG_MS=450;
/* a word for the cursor: one CJK character, or a run of letters and digits with inner apostrophes and hyphens */
var TOK=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])[\p{L}\p{N}])+(?:['’\-](?:(?![\p{Script=Han}])[\p{L}\p{N}])+)*/gu;
/* where a sentence ends: CJK and Latin stops, then any closing quotes or brackets after them. An abbreviation
   ("Mr. Smith") ends a sentence too: nothing here knows abbreviations */
var STOP=/[。！？!?…]/, CLOSE=/[」』”’"')）\]】》]/;

/* ---------- text ---------- */
function units(s){
  var out=[], m; TOK.lastIndex=0;
  while((m=TOK.exec(s))) out.push({a:m.index, b:m.index+m[0].length});
  return out;
}
function sentStart(s,a){
  var i=a-1;
  while(i>=0 && !(STOP.test(s.charAt(i)) || (s.charAt(i)==="." && /\s/.test(s.charAt(i+1)||" ")))) i--;
  i++;
  while(i<a && (CLOSE.test(s.charAt(i)) || /\s/.test(s.charAt(i)))) i++;
  return i;
}
function sentEnd(s,b){
  var i=b;
  while(i<s.length && !(STOP.test(s.charAt(i)) || (s.charAt(i)==="." && (i+1>=s.length || /[\s"'”’」』)）]/.test(s.charAt(i+1)))))) i++;
  if(i>=s.length) return s.length;
  while(i<s.length && (STOP.test(s.charAt(i)) || s.charAt(i)===".")) i++;
  while(i<s.length && CLOSE.test(s.charAt(i))) i++;
  return i;
}
function getter(text){ return typeof text==="function" ? text : function(i){ return text[i]; }; }
/* the selection as character ranges, one per block: from the unit around lo to the unit around hi (lo before hi) */
function widen(text,lo,hi,unit){
  var at=getter(text), a=lo.a, b=hi.b;
  if(unit==="sent"){ a=sentStart(at(lo.p),lo.a); b=sentEnd(at(hi.p),hi.b); }
  else if(unit==="para"){ a=0; b=at(hi.p).length; }
  var parts=[];
  for(var p=lo.p;p<=hi.p;p++){
    var len=at(p).length; if(!len) continue;
    parts.push({p:p, a:p===lo.p ? a : 0, b:p===hi.p ? b : len});
  }
  return parts;
}
function join(text,parts){
  var at=getter(text);
  return parts.map(function(x){ return at(x.p).slice(x.a,x.b); }).join("\n");
}

/* ---------- DOM ---------- */
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
/* wrap characters a..b of an element in inline elements (no padding, so no line moves) */
function wrap(e,a,b,make){
  var w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT), list=[], n, at=0;
  while((n=w.nextNode())){ list.push({n:n, at:at}); at+=n.data.length; }
  list.forEach(function(x){
    var s=Math.max(a,x.at), t=Math.min(b,x.at+x.n.data.length); if(s>=t) return;
    var node=x.n;
    if(t-x.at<node.data.length) node.splitText(t-x.at);
    if(s>x.at) node=node.splitText(s-x.at);
    var mk=make(); node.parentNode.insertBefore(mk,node); mk.appendChild(node);
  });
}
function unwrap(root,sel){
  if(!root) return;
  Array.prototype.slice.call(root.querySelectorAll(sel)).forEach(function(mk){
    var p=mk.parentNode; while(mk.firstChild) p.insertBefore(mk.firstChild,mk); p.removeChild(mk); p.normalize();
  });
}
function copyOld(text){
  var ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta); ta.select();
  var ok=false; try{ ok=document.execCommand("copy"); }catch(e){}
  ta.remove(); return ok;
}
/* copying text is otherwise impossible here: the handheld turns off the system's text selection. Call it straight
   from a key's release or a tap, before any promise: Safari refuses a copy that is not part of a user gesture */
function copy(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    var job;
    try{ job=navigator.clipboard.writeText(text); }catch(e){ return Promise.resolve(copyOld(text)); }
    return job.then(function(){ return true; },function(){ return copyOld(text); });
  }
  return Promise.resolve(copyOld(text));
}

/* ---------- the selection ---------- */
function create(h){
  var c={s:null};   // s: {toks, cur, anc, unit, held, moved}; a token is {p, a, b, x, y, w, h} in the host's frame
  function sfx(n){ if(window.LP && window.LP.sfx) window.LP.sfx(n); }
  function changed(){ if(h.changed) h.changed(); }
  function tokens(){
    var f=h.frame(), out=[];
    h.blocks().forEach(function(i){
      var e=h.el(i);
      units(h.text(i)).forEach(function(u){
        var r=rangeRects(e,u.a,u.b)[0];
        if(!r || (h.keep && !h.keep(r,f))) return;
        out.push({p:i, a:u.a, b:u.b, x:r.left-f.left, y:r.top-f.top, w:r.width, h:r.height});
      });
    });
    return out;
  }
  c.start=function(fromEnd,unit){
    var t=tokens();
    c.s={toks:t, cur:fromEnd ? t.length-1 : 0, anc:null, unit:unit||"word", held:c.s && c.s.held, moved:false};
    c.paint(); changed();
  };
  c.end=function(){ c.unpaint(); c.s=null; };
  c.parts=function(){
    var s=c.s; if(!s || !s.toks.length) return [];
    var lo=s.toks[s.anc==null ? s.cur : Math.min(s.anc,s.cur)], hi=s.toks[s.anc==null ? s.cur : Math.max(s.anc,s.cur)];
    return widen(h.text,lo,hi,s.unit);
  };
  c.text=function(){ return join(h.text,c.parts()); };
  /* what A looks up: a sentence or a paragraph is no headword, so then the word under the cursor */
  c.word=function(){
    var s=c.s; if(!s) return "";
    var t=s.toks[s.cur];
    return (s.unit==="word" ? c.text() : t ? h.text(t.p).slice(t.a,t.b) : "").replace(/’/g,"'").replace(/\s+/g," ").trim();
  };
  c.unpaint=function(){ unwrap(h.root(),"mark"); };
  c.paint=function(){
    c.unpaint(); if(!c.s) return;
    c.parts().forEach(function(x){ wrap(h.el(x.p),x.a,x.b,function(){ return document.createElement("mark"); }); });
  };
  c.cycle=function(){
    if(!c.s) return;
    c.s.unit=UNITS[(UNITS.indexOf(c.s.unit)+1)%UNITS.length];
    sfx("move"); c.paint(); changed();
  };
  /* the line above or below (k = -1 or 1), then the token there nearest the middle of the current one; -1 when there is none */
  function vertical(k){
    var t=c.s.toks, cu=t[c.s.cur], cx=cu.x+cu.w/2, lineY=null, best=-1, bd=Infinity;
    t.forEach(function(x){ if((x.y-cu.y)*k>cu.h/2 && (lineY===null || (x.y-lineY)*k<0)) lineY=x.y; });
    if(lineY===null) return -1;
    t.forEach(function(x,i){ var d=Math.abs(x.x+x.w/2-cx); if(Math.abs(x.y-lineY)<cu.h/2 && d<bd){ bd=d; best=i; } });
    return best;
  }
  c.move=function(dir){
    var s=c.s, t=s.toks, back=dir==="left"||dir==="up";
    if(!t.length){ h.edge(back); return; }
    var next=dir==="left" ? s.cur-1 : dir==="right" ? s.cur+1 : vertical(back?-1:1);
    if(next<0 || next>=t.length){
      /* an extended selection stays where it is */
      if(s.held) sfx("err"); else h.edge(back);
      return;
    }
    if(s.held){ if(s.anc==null) s.anc=s.cur; s.moved=true; } else s.anc=null;
    s.cur=next; sfx("move"); c.paint();
    if(h.moved) h.moved(t[next]);
  };
  /* the token nearest a point on the screen; -1 when there is none */
  c.at=function(x,y){
    var f=h.frame(), px=x-f.left, py=y-f.top, best=-1, bd=Infinity;
    c.s.toks.forEach(function(t,i){
      var dx=px<t.x ? t.x-px : px>t.x+t.w ? px-t.x-t.w : 0, dy=py<t.y ? t.y-py : py>t.y+t.h ? py-t.y-t.h : 0;
      var d=dy*4+dx; if(d<bd){ bd=d; best=i; }
    });
    return best;
  };
  /* long press: a new selection from the word under the finger (false when there is none); dragging moves its far end */
  c.select=function(x,y){
    c.start(false,c.s ? c.s.unit : "word");
    var i=c.at(x,y); if(i<0) return false;
    c.s.cur=i; c.s.anc=i; c.s.held=true;
    if(navigator.vibrate) try{ navigator.vibrate(8); }catch(e){}
    sfx("tap"); c.paint(); changed();
    return true;
  };
  c.drag=function(x,y){
    if(!c.s) return;
    var i=c.at(x,y); if(i<0 || i===c.s.cur) return;
    c.s.cur=i; c.paint();
  };
  /* the keys the selection owns: the D-pad, A (held to extend, let go to look up) and SELECT; true when handled */
  c.key=function(b,down){
    var s=c.s; if(!s) return false;
    if(b==="a"){ if(down){ s.held=true; s.moved=false; } else if(s.held){ s.held=false; if(!s.moved && h.lookup) h.lookup(); } return true; }
    if(b==="left"||b==="right"||b==="up"||b==="down"){ if(down) c.move(b); return true; }
    if(b==="select"){ if(down) c.cycle(); return true; }
    return false;
  };
  /* touch on an element: a long press selects (opts.hold(x, y), when opts.canHold() allows it) and dragging extends;
     every other gesture goes to opts.up(e, {dx, dy, target}). opts.down(e) may refuse a gesture by returning false */
  c.touch=function(area,opts){
    var t=null;
    function cancelLong(){ if(t && t.timer){ clearTimeout(t.timer); t.timer=null; } }
    area.addEventListener("pointerdown",function(e){
      if(opts.down && opts.down(e)===false) return;
      t={x:e.clientX, y:e.clientY, id:e.pointerId, target:e.target, long:false, timer:null};
      if(!opts.canHold || opts.canHold()) t.timer=setTimeout(function(){
        if(!t) return;
        t.timer=null; t.long=true;
        opts.hold(t.x,t.y);
      },LONG_MS);
    });
    area.addEventListener("pointermove",function(e){
      if(!t || e.pointerId!==t.id) return;
      if(t.long){ c.drag(e.clientX,e.clientY); return; }
      if(Math.abs(e.clientX-t.x)>10 || Math.abs(e.clientY-t.y)>10) cancelLong();
    });
    /* once a long press has started, the finger drags the selection, not the page */
    area.addEventListener("touchmove",function(e){ if(t && t.long && e.cancelable) e.preventDefault(); },{passive:false});
    area.addEventListener("pointercancel",function(){ cancelLong(); t=null; });
    area.addEventListener("pointerup",function(e){
      if(!t || e.pointerId!==t.id) return;
      cancelLong();
      var g={dx:e.clientX-t.x, dy:e.clientY-t.y, target:t.target}, long=t.long; t=null;
      if(long){ if(c.s){ c.s.held=false; changed(); } return; }
      opts.up(e,g);
    });
    area.addEventListener("contextmenu",function(e){ e.preventDefault(); });
  };
  return c;
}

window.LopdaTextSel={UNITS:UNITS, LONG_MS:LONG_MS, units:units, sentStart:sentStart, sentEnd:sentEnd, widen:widen, join:join,
  nodeAt:nodeAt, rangeRects:rangeRects, wrap:wrap, unwrap:unwrap, copy:copy, create:create};
})();
