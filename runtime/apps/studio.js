/*
 * Lo-PDA built-in: the four-track tape machine (四轨机 / Tape4), step 1a: the rhythm screen.
 * docs/design/studio.md sections 11.3-11.5. One project at a time: its song is a LopdaSong document in
 * data/users/local/studio/items/<id>, the current id and the little state around it in data/users/local/studio
 * {current, toured, hushTip}. A bad or too-new tape is never written over: a fresh one is made beside it.
 *
 * The screen: a top bar (play/stop, BPM, − and +, ?, ≡), four drum tabs with a dot under each drum that has a hit,
 * and the selected drum's 16 steps as a 4x4 grid, one row per beat, the first cell of a row heavier. On = ink.
 * The step being heard turns mid (empty) or dark (lit) while it sounds. The menu holds "new tape" (A / 确认 confirms, B / 取消 cancels)
 * and the kit (soft / chip). The "?" replays the tour; the first open runs it by itself (docs/design/studio.md 11.6).
 *
 * Keys (the chin pad is hidden): arrows move a dashed focus box, X = A toggles that cell, Enter = START plays and
 * stops, Shift = SELECT picks the next drum, Z = B closes the menu or its confirmation. HOME is the runtime's.
 * Taps: a cell toggles and auditions that drum at once; a tab selects and auditions. − and + repeat while held.
 *
 * Playback schedules LopdaSong.events() 0.1 s ahead every 25 ms into LP.SND.app through LopdaStudioSynth, so it
 * follows the handheld's one volume. A changed BPM is re-anchored at the tick being heard, a rebuilt AudioContext
 * carries on from there, HOME or a hidden page stops. Changes save a second later, and at once on leave or pause.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, SONGS=window.LopdaSong, SYNTH=window.LopdaStudioSynth;
var own=LP.own, toast=LP.toast, sfx=LP.sfx, show=LP.show, showPad=LP.showPad;

var BASE="data/users/local/studio", LOOKAHEAD=0.1, LOOP_MS=25, SAVE_MS=1000;

var T={
  song:null, id:"", meta:null,
  refs:null, loading:null, loaded:false, metaOk:false,
  dirty:false, saveTimer:0,
  drum:"kick", focus:0, kb:false,
  sheet:"", built:false,
  playing:false, loop:0, ctx:null, synth:null,
  startAt:0, lastTick:0, heard:0, painted:-1,
  repeats:[], tour:null
};

function visible(){ return !$("v-studio").hidden; }
function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }

/* ---------- storage ---------- */
function refs(){
  if(!S.db) return null;
  if(!T.refs){
    var base=S.db.doc(BASE);
    T.refs={set:base, items:base.collection("items")};
  }
  return T.refs;
}
function saveMeta(){
  var r=refs();
  /* nothing has been read, or the read failed: writing here could erase the real meta */
  if(!r || !T.meta || !T.metaOk) return;
  /* started here and now: a HOME straight after a change still lands it (a deferred write can lose the race with the page) */
  r.set.set(T.meta).then(null,function(e){ toast(tr("common.savefail",{code:(e&&e.code)||tr("common.unknown")})); });
}
function writeItem(data){
  var r=refs();
  if(!r || !T.id || !T.metaOk) return;
  r.items.doc(T.id).set(data).then(null,function(e){
    T.dirty=true;
    toast(tr("common.savefail",{code:(e&&e.code)||tr("common.unknown")}));
  });
}
function flush(){
  if(T.saveTimer){ clearTimeout(T.saveTimer); T.saveTimer=0; }
  if(!T.dirty || !T.song) return;
  var r=refs();
  if(!r || !T.metaOk) return;
  T.dirty=false;
  var data=JSON.parse(JSON.stringify(T.song));
  data.updated=Date.now();
  T.song.updated=data.updated;
  writeItem(data);
}
function touch(){
  T.dirty=true;
  if(T.saveTimer) clearTimeout(T.saveTimer);
  T.saveTimer=setTimeout(flush,SAVE_MS);
}
/* a tape for the handheld to play, saved under a new id (and pointed at) unless storage is off */
function freshSong(tell){
  T.id=LP.uid();
  setSong(SONGS.newSong(Date.now()));
  T.dirty=false;
  if(!T.meta) T.meta={toured:{},hushTip:false};
  T.meta.current=T.id;
  saveMeta();
  if(refs()){
    var data=JSON.parse(JSON.stringify(T.song));
    data.updated=Date.now();
    T.song.updated=data.updated;
    writeItem(data);
  }
  if(tell) toast(tr("studio.bad"));
}
function ensureLocal(){
  if(T.song) return;
  T.id=LP.uid();
  setSong(SONGS.newSong(Date.now()));
  if(!T.meta) T.meta={toured:{},hushTip:false};
  T.meta.current=T.id;
}
/* reads the one current tape through validate; a broken or too-new one is left alone.
   Once per session: open() must never replace a song that is already loaded. */
function loadStore(){
  if(T.loaded) return Promise.resolve();
  var r=refs();
  if(!r){ ensureLocal(); return Promise.resolve(); }
  if(T.loading) return T.loading;
  T.loading=r.set.get().then(function(sn){
    var m=sn.exists ? own(sn.data()) : null;
    T.meta=(m && typeof m==="object" && !Array.isArray(m)) ? m : {};
    T.metaOk=true;                 /* read OK (or showed none): meta can be written from here */
    if(!T.meta.toured || typeof T.meta.toured!=="object" || Array.isArray(T.meta.toured)) T.meta.toured={};
    T.meta.hushTip=T.meta.hushTip===true;
    var cur=typeof T.meta.current==="string" ? T.meta.current : "";
    if(!cur){
      /* a song made before storage was ready is the one to keep */
      if(T.song && T.id){ T.meta.current=T.id; saveMeta(); T.dirty=true; flush(); }
      else freshSong(false);
      return;
    }
    return r.items.doc(cur).get().then(function(doc){
      var got=doc.exists ? SONGS.validate(own(doc.data())) : null;
      if(got && got.song){
        setSong(got.song); T.id=cur; T.dirty=false;
      } else freshSong(true);
    });
  }).then(function(){
    T.loading=null;
    T.loaded=true;
    if(visible()) renderAll();
  },function(e){
    T.loading=null;
    T.loaded=true;
    T.metaOk=false;                /* a failed read: keep a local tape, but never write over anything */
    ensureLocal();
    toast(tr("common.readfail",{msg:String((e&&e.code)||(e&&e.message)||e).slice(0,120)}));
    if(visible()) renderAll();
  });
  return T.loading;
}

/* ---------- sound and the loop ---------- */
function makeSynth(){
  var ac=LP.SND.ctx;
  if(!ac) return null;
  if(T.synth && T.ctx===ac) return T.synth;
  dropSynth();
  T.ctx=ac;
  T.synth=SYNTH.create(ac,LP.SND.app);
  return T.synth;
}
function ensureSynth(){
  var ac=LP.SND.ctx || LP.audio();
  if(!ac) return null;
  LP.wake();
  if(T.synth && T.ctx===LP.SND.ctx) return T.synth;
  return makeSynth();
}
function dropSynth(){
  if(T.synth){ try{ T.synth.dispose(); }catch(e){} }
  T.synth=null;
}
/* the tick the ears are at, not the one being scheduled */
function heardTick(ac,bpm){
  if(!ac) return 0;
  var sec=ac.currentTime-T.startAt;
  if(sec<0) sec=0;
  return Math.floor(sec*bpm*SONGS.TPB/60);
}
/* a swap keeps the ears' tick: startAt is rebuilt from it with the new tempo, and the scheduler never
   replays ticks it already passed or schedules from the old timeline */
function reanchor(bpm){
  if(!T.playing || !T.ctx || !T.song) return;
  var tick=heardTick(T.ctx,T.song.bpm);
  T.startAt=T.ctx.currentTime-SONGS.ticksToSec(tick,bpm);
  T.heard=tick;
  if(T.lastTick<tick+1) T.lastTick=tick+1;
  T.painted=-1;
}
function setSong(song){
  if(!song) return;
  if(T.playing && T.ctx) reanchor(song.bpm);
  T.song=song;
}
function paintPlaying(step){
  if(step===T.painted && T.playing) return;
  T.painted=step;
  var cells=$("studio-grid").children, i;
  for(i=0;i<cells.length;i++) cells[i].classList.toggle("playing",T.playing && i===step);
}
function loop(){
  if(!T.playing) return;
  var ac=LP.SND.ctx;
  if(!ac || !T.song) return;
  if(ac!==T.ctx){ onAudio(); return; }
  var bpm=T.song.bpm;
  var to=Math.max(0,Math.floor((ac.currentTime+LOOKAHEAD-T.startAt)*bpm*SONGS.TPB/60)+1);
  if(to>T.lastTick){
    var ev=SONGS.events(T.song,0,T.lastTick,to), i, e;
    for(i=0;i<ev.length;i++){
      e=ev[i];
      if(!e.key || !T.synth) continue;   /* this screen plays the drum track only */
      T.synth.hit(T.song.kit,e.key,T.startAt+SONGS.ticksToSec(e.tick,bpm),e.vel);
    }
    T.lastTick=to;
  }
  var tick=heardTick(ac,bpm);
  T.heard=tick;
  paintPlaying(Math.floor(tick/SONGS.STEP)%SONGS.STEPS);
}
function startPlay(){
  if(T.playing || !T.song) return;
  var ac=LP.audio();
  if(!ac) return;
  ensureSynth();
  T.playing=true;
  T.startAt=ac.currentTime+0.02;
  T.lastTick=0; T.heard=0; T.painted=-1;
  T.loop=setInterval(loop,LOOP_MS);
  LP.keepAwake(true);
  renderPlay();
  paintPlaying(0);
  hushTip();
  loop();
  tourEvent("play");
}
function stopPlay(){
  var was=T.playing;
  T.playing=false;
  if(T.loop){ clearInterval(T.loop); T.loop=0; }
  dropSynth();                       /* silence the hits already scheduled in the look-ahead */
  T.painted=-1;
  if(was) LP.keepAwake(false);
  if(T.built){
    var cells=$("studio-grid").children, i;
    for(i=0;i<cells.length;i++) cells[i].classList.remove("playing");
    renderPlay();
  }
}
function togglePlay(){ if(T.playing) stopPlay(); else startPlay(); }
/* a new tempo keeps the place: the tick being heard stays on its scheduled sound */
function setBpm(bpm){
  if(!T.loaded || !T.song) return;
  var next=SONGS.clampBpm(bpm);
  if(next===T.song.bpm) return;
  reanchor(next);
  T.song.bpm=next;
  touch();
  renderBar();
}
function hushTip(){
  if(!T.meta) T.meta={toured:{},hushTip:false};
  if(T.meta.hushTip) return;
  T.meta.hushTip=true;
  saveMeta();
  toast(tr("studio.hush"));
}
function audition(){
  var synth=ensureSynth();
  if(!synth || !T.song) return;
  synth.hit(T.song.kit,T.drum,LP.SND.ctx.currentTime+0.001,1);
}
/* the context was replaced (a call, Siri): the tape carries on from the same tick on the new one */
function onAudio(){
  var was=T.playing, tick=T.heard>0 ? T.heard : 0;
  dropSynth();
  T.ctx=LP.SND.ctx;
  if(!T.ctx) return;
  if(!was && !visible()) return;
  T.synth=SYNTH.create(T.ctx,LP.SND.app);
  if(!was) return;
  T.startAt=T.ctx.currentTime-SONGS.ticksToSec(tick,T.song.bpm);
  T.lastTick=tick+1;
  T.heard=tick;
  paintPlaying(Math.floor(tick/SONGS.STEP)%SONGS.STEPS);
  if(!T.loop) T.loop=setInterval(loop,LOOP_MS);
}

/* ---------- the screen ---------- */
function build(){
  if(T.built) return;
  T.built=true;
  var grid=$("studio-grid"), i;
  for(i=0;i<16;i++){
    (function(step){
      var b=el("button","st-cell"+(step%4===0?" beat":""));
      b.type="button";
      b.setAttribute("data-step",String(step));
      b.onclick=function(){ cellTap(step); };
      grid.appendChild(b);
    })(i);
  }
  var tabs=$("studio-tabs");
  for(i=0;i<SONGS.DRUMS.length;i++){
    (function(drum){
      var b=el("button","st-tab");
      b.type="button";
      b.setAttribute("data-drum",drum);
      b.appendChild(el("span","st-tab-name"));
      b.appendChild(el("i","st-dot"));
      b.onclick=function(){ pickDrum(drum,true,true); };
      tabs.appendChild(b);
    })(SONGS.DRUMS[i]);
  }
  bindRepeat($("studio-minus"),-SONGS.BPM_STEP);
  bindRepeat($("studio-plus"),SONGS.BPM_STEP);
  $("studio-play").onclick=function(){ togglePlay(); };
  $("studio-tour").onclick=function(){ startTour(); };
  $("studio-menu").onclick=function(){ openSheet("menu"); };
  if(window.ResizeObserver) new ResizeObserver(function(){ layout(); }).observe($("studio-board"));
  else window.addEventListener("resize",layout);
}
function layout(){
  if(!visible()) return;
  var board=$("studio-board"), grid=$("studio-grid");
  if(!board || !grid) return;
  var w=board.clientWidth-16, h=board.clientHeight-12;
  if(w<=0 || h<=0) return;
  var gap=4, cell=Math.floor((Math.min(w,h)-gap*3)/4);
  if(cell<56) cell=56;
  var total=cell*4+gap*3;
  grid.style.width=total+"px";
  grid.style.height=total+"px";
  grid.style.gridTemplateColumns="repeat(4,"+cell+"px)";
  grid.style.gridTemplateRows="repeat(4,"+cell+"px)";
  if(T.tour) tourPlace();
}
function renderBar(){
  var bpm=T.song ? T.song.bpm : SONGS.BPM_DEFAULT;
  $("studio-bpm").textContent=tr("studio.bpm",{n:bpm});
  renderPlay();
}
function renderPlay(){
  var v=$("v-studio"), b=$("studio-play");
  if(v) v.setAttribute("data-playing",T.playing?"true":"false");
  if(!b) return;
  b.setAttribute("data-playing",T.playing?"true":"false");
  b.setAttribute("aria-label",tr(T.playing?"studio.stop":"studio.play"));
}
function renderTabs(){
  var tabs=$("studio-tabs").children, i, d, b, any;
  for(i=0;i<tabs.length;i++){
    b=tabs[i]; d=b.getAttribute("data-drum");
    b.classList.toggle("on",d===T.drum);
    b.setAttribute("aria-pressed",d===T.drum?"true":"false");
    var name=b.querySelector(".st-tab-name");
    if(name) name.textContent=tr("studio.drum."+d);
    any=false;
    if(T.song){
      for(var s=0;s<SONGS.STEPS;s++) if(SONGS.has(T.song,0,"drums",d,s)){ any=true; break; }
    }
    b.querySelector(".st-dot").classList.toggle("on",any);
  }
}
function renderGrid(){
  var cells=$("studio-grid").children, i, d, on;
  for(i=0;i<cells.length;i++){
    d=cells[i];
    on=!!(T.song && SONGS.has(T.song,0,"drums",T.drum,i));
    d.classList.toggle("on",on);
    d.classList.toggle("focus",T.kb && i===T.focus);
    d.setAttribute("aria-pressed",on?"true":"false");
    d.setAttribute("aria-label",tr("studio.cell",{drum:tr("studio.drum."+T.drum),n:i+1}));
  }
}
function renderAll(){
  build();
  var v=$("v-studio"); if(v) v.setAttribute("data-loaded",T.loaded?"true":"false");
  renderBar(); renderTabs(); renderGrid(); renderSheet();
}
/* ---------- the tour ----------
   Not an LP interface: only this program uses tour(); docs/design/studio.md 11.6. One step is
   {el:function(){ return element }, text:"studio.tour.x", done:"play"|"toggle"|"drum"|null}. The screen reports
   the named event with tourEvent(); a null done shows a Next button (Done on the last step). Every step skips.
   The cover is four dither panels around the highlighted element, so only that element and the box take taps. */
function rhythmTour(){
  return [
    {el:function(){ return $("studio-play"); }, text:"studio.tour.play", done:"play"},
    {el:function(){ return $("studio-grid"); }, text:"studio.tour.grid", done:"toggle"},
    {el:function(){ return $("studio-tabs"); }, text:"studio.tour.drums", done:"drum"},
    /* the readout between − and + stands for the BPM controls */
    {el:function(){ return $("studio-bpm"); }, text:"studio.tour.bpm", done:null}
  ];
}
function startTour(){ if(T.built) tour("rhythm",rhythmTour()); }
function maybeTour(){
  if(!visible() || T.tour || !T.built || !T.loaded || !T.meta) return;
  if(T.meta.toured && T.meta.toured.rhythm) return;
  startTour();
}
function tour(screen,steps){
  tourEnd(false);
  if(!steps || !steps.length) return;
  var view=$("v-studio"), i;
  var root=el("div","st-tour"), box=el("div","st-tour-box"), covers=[];
  for(i=0;i<4;i++){ var c=el("i","st-tour-cover"); root.appendChild(c); covers.push(c); }
  var text=el("p","st-tour-text");
  var row=el("div","st-tour-btns");
  var skip=el("button","st-tour-skip"), next=el("button","st-tour-next");
  skip.type="button"; next.type="button";
  row.appendChild(skip); row.appendChild(next);
  box.appendChild(text); box.appendChild(row);
  view.appendChild(root); view.appendChild(box);
  view.classList.add("st-touring");
  document.body.classList.add("st-tour-on");
  T.tour={screen:screen, steps:steps, i:0, root:root, box:box, text:text, skip:skip, next:next, covers:covers, hi:null};
  skip.onclick=function(){ sfx("miss"); tourEnd(true); };
  next.onclick=function(){ sfx("tap"); tourNext(); };
  tourShow(0);
}
function tourShow(i){
  var t=T.tour;
  if(!t || !t.steps[i]) return;
  t.i=i;
  if(t.hi) t.hi.classList.remove("st-tour-hi");
  var node=t.steps[i].el ? t.steps[i].el() : null;
  t.hi=node || null;
  if(node) node.classList.add("st-tour-hi");
  /* step 2 is the kick grid, so the kick tab has to be the one picked when it starts */
  if(i===1 && T.drum!=="kick") pickDrum("kick",false,false);
  t.text.textContent=tr(t.steps[i].text);
  t.skip.textContent=tr("studio.tour.skip");
  t.next.textContent=tr(i===t.steps.length-1 ? "studio.tour.done" : "studio.tour.next");
  t.next.hidden=!!t.steps[i].done;
  tourPlace();
}
/* four cover panels leave the hole; the box sits in the other half of the screen */
function tourPlace(){
  var t=T.tour;
  if(!t || !t.hi) return;
  var view=$("v-studio"), v=view.getBoundingClientRect(), r=t.hi.getBoundingClientRect();
  if(!v.width || !v.height) return;
  var pad=4;
  var x0=Math.max(0,r.left-v.left-pad), y0=Math.max(0,r.top-v.top-pad);
  var x1=Math.min(v.width,r.right-v.left+pad), y1=Math.min(v.height,r.bottom-v.top+pad);
  var ch=Math.max(0,y1-y0), c=t.covers;
  c[0].style.cssText="left:0;top:0;right:0;height:"+y0+"px";
  c[1].style.cssText="left:0;top:"+y1+"px;right:0;bottom:0";
  c[2].style.cssText="left:0;top:"+y0+"px;width:"+x0+"px;height:"+ch+"px";
  c[3].style.cssText="left:"+x1+"px;right:0;top:"+y0+"px;height:"+ch+"px";
  var upper=(r.top-v.top)+r.height/2 < v.height/2;
  t.box.style.top=upper ? "auto" : "4px";
  t.box.style.bottom=upper ? "4px" : "auto";
}
function tourNext(){
  var t=T.tour;
  if(!t) return;
  if(t.i>=t.steps.length-1){ tourEnd(true); return; }
  tourShow(t.i+1);
}
function tourEvent(name){
  var t=T.tour;
  if(!t) return;
  var step=t.steps[t.i];
  if(step && step.done===name) tourNext();
}
function tourEnd(seen){
  var t=T.tour;
  if(!t) return;
  T.tour=null;
  if(t.hi) t.hi.classList.remove("st-tour-hi");
  $("v-studio").classList.remove("st-touring");
  document.body.classList.remove("st-tour-on");
  if(t.root.parentNode) t.root.parentNode.removeChild(t.root);
  if(t.box.parentNode) t.box.parentNode.removeChild(t.box);
  if(seen && T.meta && t.screen){
    T.meta.toured=T.meta.toured || {};
    T.meta.toured[t.screen]=true;
    saveMeta();
  }
}
/* ---------- sheets: the menu and the new-tape question ---------- */
function openSheet(name){ T.sheet=name; renderSheet(); }
function closeSheet(){
  if(T.sheet==="new"){ T.sheet="menu"; renderSheet(); return; }
  if(T.sheet){ T.sheet=""; renderSheet(); }
}
function sheetRow(ul,label,small,onclick){
  var li=el("li");
  li.appendChild(el("span","",label));
  if(small) li.appendChild(el("small","",small));
  li.onclick=onclick;
  ul.appendChild(li);
  return li;
}
function renderSheet(){
  if(!T.built) return;
  var sh=$("studio-sheet");
  sh.hidden=!T.sheet;
  sh.textContent="";
  if(!T.sheet) return;
  var head=el("p","sheet-title");
  head.appendChild(el("span","",tr("studio.title")));
  sh.appendChild(head);
  if(T.sheet==="menu"){
    var ul=el("ul","lcd-menu");
    if(T.loaded) sheetRow(ul,tr("studio.new"),"",function(){ sfx("tap"); openSheet("new"); });
    if(T.song && T.loaded) sheetRow(ul,tr("studio.kit",{kit:tr("studio.kit."+T.song.kit)}),"",function(){
      T.song.kit=T.song.kit==="soft" ? "chip" : "soft";
      touch(); sfx("tap"); renderSheet();
    });
    sh.appendChild(ul);
    return;
  }
  var ask=el("div","st-ask");
  ask.appendChild(el("p","",tr("studio.new.ask")));
  var row=el("div","row");
  var yes=el("button","btn","");
  yes.type="button";
  yes.textContent=tr("studio.confirm");
  yes.onclick=function(){ newTape(); };
  var no=el("button","btn ghost","");
  no.type="button";
  no.textContent=tr("common.cancel");
  no.onclick=function(){ sfx("miss"); closeSheet(); };
  row.appendChild(yes); row.appendChild(no);
  ask.appendChild(row);
  sh.appendChild(ask);
}
function newTape(){
  if(!T.loaded) return;
  stopRepeatAll();
  setSong(SONGS.newSong(Date.now()));
  T.dirty=true;
  T.sheet="";
  flush();
  sfx("ok");
  renderAll();
}
/* ---------- taps and keys ---------- */
function cellTap(step){
  if(!T.loaded || !T.song) return;
  T.focus=step;
  T.song=SONGS.toggle(T.song,0,"drums",T.drum,step);
  touch();
  renderTabs(); renderGrid();
  audition();
  tourEvent("toggle");
}
function pickDrum(drum,play,byUser){
  if(SONGS.DRUMS.indexOf(drum)<0) return;
  T.drum=drum;
  renderTabs(); renderGrid();
  if(play) audition();
  if(byUser) tourEvent("drum");
}
function nextDrum(){
  var i=SONGS.DRUMS.indexOf(T.drum);
  pickDrum(SONGS.DRUMS[(i+1)%SONGS.DRUMS.length],true,true);
}
function stopRepeatAll(){
  for(var i=0;i<T.repeats.length;i++) T.repeats[i]();
}
function bindRepeat(btn,delta){
  var wait=0, every=0;
  function end(){ if(wait){ clearTimeout(wait); wait=0; } if(every){ clearInterval(every); every=0; } }
  function step(){ if(!T.song) return; setBpm(T.song.bpm+delta); }
  btn.addEventListener("pointerdown",function(e){
    e.preventDefault();
    try{ btn.setPointerCapture(e.pointerId); }catch(x){}
    end();
    step();
    wait=setTimeout(function(){ every=setInterval(step,80); },400);
  });
  ["pointerup","pointercancel","lostpointercapture"].forEach(function(t){ btn.addEventListener(t,end); });
  T.repeats.push(end);
}
function moveFocus(key){
  var i=T.focus;
  if(key==="ArrowLeft") i=i%4===0 ? i+3 : i-1;
  else if(key==="ArrowRight") i=i%4===3 ? i-3 : i+1;
  else if(key==="ArrowUp") i=i<4 ? i+12 : i-4;
  else i=i>=12 ? i-4 : i+4;
  T.focus=i;
  T.kb=true;
  renderGrid();
}
document.addEventListener("keydown",function(e){
  if(!visible()) return;
  if(/INPUT|TEXTAREA|SELECT/.test(e.target.nodeName)) return;
  var key=e.key, done=true;
  if(key==="ArrowUp"||key==="ArrowDown"||key==="ArrowLeft"||key==="ArrowRight") moveFocus(key);
  else if(key==="x"||key==="X"){ if(e.repeat) return; if(T.sheet==="new") newTape(); else if(!T.sheet) cellTap(T.focus); }
  else if(key==="Enter"){ if(e.repeat) return; togglePlay(); }
  else if(key==="Shift"){ if(e.repeat) return; nextDrum(); }
  else if(key==="z"||key==="Z"){ if(e.repeat) return; if(T.tour) tourEnd(true); else closeSheet(); }
  else done=false;
  if(done) e.preventDefault();
});
/* boot.js only watches visibility once storage opened, so watch it here too: a hidden page never keeps sounding */
document.addEventListener("visibilitychange",function(){
  if(!document.hidden || !visible()) return;
  stopRepeatAll();
  stopPlay();
  flush();
});

/* ---------- home icon: a cassette, open window, two reels ---------- */
var ICON=["................","................",".00000000000000.",".03333333333330.",".03111111111130.",
  ".03100000000130.",".03103300330130.",".03103300330130.",".03103300330130.",".03100000000130.",
  ".03111111111130.",".03000000000030.",".03333333333330.",".00000000000000.","................","................"];

function open(){
  stopRepeatAll();
  T.sheet="";
  T.kb=false;
  build();
  show("studio");
  showPad(false);
  ensureLocal();               /* the demo is visible while the one read is in flight; edits wait for T.loaded */
  renderAll();
  layout();
  setTimeout(layout,0);
  if(T.loaded) maybeTour();
  else if(S.db) loadStore().then(function(){ if(visible()) maybeTour(); });
}
function leave(){
  stopRepeatAll();
  stopPlay();
  tourEnd(false);
  flush();
  T.sheet="";
  if(T.built) renderSheet();
  var a=document.activeElement;
  if(a && a.blur && $("v-studio").contains(a)) a.blur();
}

LP.builtin({id:"studio", label:"app.studio", icon:function(){ return ICON; }, view:"studio",
  open:open,
  leave:leave,
  lang:function(){ if(visible()){ renderAll(); layout(); if(T.tour) tourShow(T.tour.i); } },
  pause:function(){ stopRepeatAll(); stopPlay(); flush(); },
  resume:function(){},
  audio:function(){ onAudio(); },
  ready:function(){
    if(!S.db) return;
    refs();
    if(visible()) loadStore().then(function(){ if(visible()) maybeTour(); });
  },
  nostore:function(){
    ensureLocal();
    T.loaded=true;
    T.metaOk=false;            /* no store: a local tape, playable but never saved */
    if(visible()){ renderAll(); maybeTour(); }
  }});
})();
