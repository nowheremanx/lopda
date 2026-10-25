/*
 * Lo-PDA built-in: the four-track tape machine (四轨机 / Tape4), step 1b-1: eight patterns, the drums, bass, chords,
 * melody and song screens, and one player for a looped pattern or a whole song. docs/design/studio.md sections 11
 * and 12. One project at a time: its song is a LopdaSong document in data/users/local/studio/items/<id>, the current
 * id and the little state around it in data/users/local/studio {current, toured, hushTip}. The format stays v 1:
 * the editing pattern, screen and selections live in memory only. A bad or too-new tape is never written over.
 *
 * The screen: a top bar (play/stop, BPM, − and +, ?, ≡), the navigation row (the pattern letter and five screen tabs),
 * then that screen. Drums keeps 1a's four drum tabs and 4x4 grid. Bass and melody share the same 16 cells with the
 * pitch name in the cell and eight pitch keys below. Chords are two cells (the two halves of the bar) and six keys.
 * Song is the chain in sixes with A-H letter keys and add / remove. A dot on a tab or a letter means that track or
 * pattern has notes. On = ink; the step being heard is mid (empty) or dark (lit).
 *
 * The player: one scheduler over LopdaSong.chainEvents(), 0.1 s ahead every 25 ms into LP.SND.app through
 * LopdaStudioSynth. On a drum/note/chord screen it loops the edit pattern; on the song screen it plays the live chain.
 * A pattern picked while a pattern is playing waits for the next bar boundary (the letter blinks for two beats); the
 * grid shows no playhead until the ears get there. A BPM change is re-anchored at the tick being heard, a rebuilt
 * AudioContext carries on, HOME or a hidden page stops. Changes save a second later, and at once on leave or pause.
 *
 * No UI click sounds anywhere here: the only sounds are the instruments. The play glyph is drawn in CSS. Keys (the
 * chin pad is hidden): arrows move the focus box, X = A taps that cell, Enter = START plays and stops, Shift = SELECT
 * picks the next drum (drums only), Z = B closes the tour, a sheet or a question. Every screen and sheet has an
 * on-screen way back. The tour framework is 1a's and stays that way (12.10's per-screen tours are a later step).
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, SONGS=window.LopdaSong, SYNTH=window.LopdaStudioSynth;
var own=LP.own, toast=LP.toast, show=LP.show, showPad=LP.showPad;

var BASE="data/users/local/studio", LOOKAHEAD=0.1, LOOP_MS=25, SAVE_MS=1000;
var LETTERS="ABCDEFGH";

var T={
  song:null, id:"", meta:null,
  refs:null, loading:null, loaded:false, metaOk:false,
  dirty:false, saveTimer:0,
  /* the editor: which screen, which pattern, the focus box and the per-track selections (memory only) */
  drum:"kick", focus:0, kb:false, screen:"drums", pat:0, slot:0,
  noteSel:{bass:-1,melody:-1}, noteDeg:{bass:0,melody:0}, chordSel:-1, chordDeg:0,
  sheet:"", copyTo:-1, built:false,
  /* the player: one chain clock, chainPat is what is scheduled, playPat is what the ears hear */
  playing:false, mode:"", playPat:0, chainPat:0, pendingPat:-1, queued:-1, boundaryGlobal:0,
  loop:0, ctx:null, synth:null,
  startAt:0, lastTick:0, heard:0, painted:null, navKey:"",
  repeats:[], tour:null
};

function visible(){ return !$("v-studio").hidden; }
function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function letter(i){ return LETTERS.charAt(i); }
function noteTrack(){ return T.screen==="bass"||T.screen==="melody" ? T.screen : ""; }
function screenName(s){ return tr("studio.screen."+s); }

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
function patternTicks(p){
  var pat=T.song && T.song.patterns && T.song.patterns[p];
  return (pat && pat.len>0 ? pat.len : SONGS.STEPS)*SONGS.STEP;
}
/* the chain the ears hear: a loop of the heard pattern, or the live song (12.7) */
function heardChain(){
  if(T.mode==="song" && T.song) return T.song.song || [0];
  return [T.playPat];
}
function heardAt(){
  if(!T.playing || !T.song) return null;
  return SONGS.chainAt(T.song,heardChain(),T.heard);
}
function playedPat(){
  var c=heardAt();
  return c ? c.p : -1;
}
function playedSlot(){
  if(T.mode!=="song") return -1;
  var c=heardAt();
  return c ? c.slot : -1;
}
/* the tick the ears are at, on the one timeline that starts at T.startAt (global chain ticks) */
function heardTick(){
  var ac=T.ctx||LP.SND.ctx;
  if(!ac || !T.song) return T.heard||0;
  var sec=ac.currentTime-T.startAt;
  if(sec<0) sec=0;
  return Math.floor(sec*T.song.bpm*SONGS.TPB/60);
}
/* a swap keeps the ears' tick: startAt is rebuilt from it with the new tempo, and the scheduler never
   replays ticks it already passed or schedules from the old timeline */
function reanchor(bpm){
  if(!T.playing || !T.ctx || !T.song) return;
  var tick=heardTick();
  T.startAt=T.ctx.currentTime-SONGS.ticksToSec(tick,bpm);
  T.heard=tick;
  if(T.lastTick<tick+1) T.lastTick=tick+1;
  T.painted=null;
}
function setSong(song){
  if(!song) return;
  if(T.playing && T.ctx) reanchor(song.bpm);
  T.song=song;
  if(!T.song.patterns || !T.song.patterns[T.pat]) T.pat=0;
}
/* one note or hit: the drum kit, the voice of each track, the chord expanded (12.6, 12.7) */
function playEvent(e,at,bpm){
  var i, notes, midi;
  if(!T.synth || !T.song) return;
  if(e.track==="drums"){
    if(e.key) T.synth.hit(T.song.kit,e.key,at,e.vel);
  } else if(e.track==="chords"){
    notes=SONGS.chordNotes(T.song,e.deg);
    if(!notes) return;
    for(i=0;i<notes.length;i++) T.synth.note(SONGS.SOUND.chords,notes[i],at,SONGS.ticksToSec(e.len,bpm),e.vel);
  } else if(e.track==="bass" || e.track==="melody"){
    midi=SONGS.noteMidi(T.song,e.track,e.deg);
    if(midi==null) return;
    T.synth.note(SONGS.SOUND[e.track],midi,at,Math.max(0.05,SONGS.ticksToSec(e.len,bpm)),e.vel);
  }
}
function scheduleRange(from,to){
  if(!T.song || to<=from) return;
  var bpm=T.song.bpm;
  var chain=T.mode==="song" ? (T.song.song||[0]) : [T.chainPat];
  var ev=SONGS.chainEvents(T.song,chain,from,to), i;
  for(i=0;i<ev.length;i++) playEvent(ev[i],T.startAt+SONGS.ticksToSec(ev[i].tick,bpm),bpm);
}
/* Schedules forward across a queued pattern's bar boundary without cutting the bar: the old chain is scheduled
   up to the boundary, then the new one from it. The ears switch in loop() when they reach that tick, so the
   letter keeps blinking and data-play-pat keeps the old pattern meanwhile. */
function scheduleTo(to){
  var guard=0, b, p;
  while(T.lastTick<to && guard++<512){
    if(T.mode==="pattern" && T.pendingPat>=0 && T.chainPat!==T.pendingPat){
      b=T.boundaryGlobal;
      if(b<=T.lastTick){ T.chainPat=T.pendingPat; continue; }
      if(to<=b){ scheduleRange(T.lastTick,to); T.lastTick=to; return; }
      scheduleRange(T.lastTick,b);
      T.lastTick=b;
      T.chainPat=T.pendingPat;
      continue;
    }
    p=to;                        /* the song chain may change length between ticks; chainEvents wraps live */
    scheduleRange(T.lastTick,p);
    T.lastTick=p;
  }
}
function loop(){
  if(!T.playing) return;
  var ac=LP.SND.ctx;
  if(!ac || !T.song) return;
  if(ac!==T.ctx){ onAudio(); return; }
  var bpm=T.song.bpm, now=ac.currentTime;
  var heard=Math.floor(Math.max(0,now-T.startAt)*bpm*SONGS.TPB/60);
  var to=Math.floor(Math.max(0,now+LOOKAHEAD-T.startAt)*bpm*SONGS.TPB/60)+1;
  T.heard=heard;
  /* schedule first: if a timer stall made the ears jump past the boundary, scheduleTo still has to place the
     queued pattern at that boundary before the ears are said to be on it */
  scheduleTo(to);
  if(T.mode==="pattern" && T.pendingPat>=0 && heard>=T.boundaryGlobal && T.chainPat===T.pendingPat){
    T.playPat=T.pendingPat;
    T.pendingPat=-1;
    T.queued=-1;
    T.boundaryGlobal=0;
    T.painted=null;
  }
  var key=stateKey();
  if(key!==T.navKey) renderNav();
  paintPlaying(false);
}
/* the player's two modes (12.7): pattern loops the edit pattern, song plays the live chain from the top */
function startPlay(){
  if(T.playing || !T.song) return;
  var ac=LP.audio();
  if(!ac) return;
  ensureSynth();
  T.mode=T.screen==="song" ? "song" : "pattern";
  T.playPat=T.pat;
  T.chainPat=T.pat;
  T.pendingPat=-1;
  T.queued=-1;
  T.boundaryGlobal=0;
  T.playing=true;
  T.startAt=ac.currentTime+0.02;
  T.lastTick=0; T.heard=0; T.painted=null; T.navKey="";
  T.loop=setInterval(loop,LOOP_MS);
  LP.keepAwake(true);
  renderPlay(); renderNav();
  paintPlaying(true);
  hushTip();
  loop();
  tourEvent("play");
}
function stopPlay(){
  var was=T.playing;
  T.playing=false;
  T.mode="";
  T.pendingPat=-1;
  T.queued=-1;
  T.boundaryGlobal=0;
  if(T.loop){ clearInterval(T.loop); T.loop=0; }
  dropSynth();                       /* silence the hits already scheduled in the look-ahead */
  T.painted=null;
  if(was) LP.keepAwake(false);
  if(T.built){
    clearPlaying();
    renderPlay(); renderNav();
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
  renderNav();
}
function hushTip(){
  if(!T.meta) T.meta={toured:{},hushTip:false};
  if(T.meta.hushTip) return;
  T.meta.hushTip=true;
  saveMeta();
  toast(tr("studio.hush"));
}
function auditionDrum(){
  var synth=ensureSynth();
  if(!synth || !T.song) return;
  synth.hit(T.song.kit,T.drum,LP.SND.ctx.currentTime+0.001,1);
}
function auditionNote(track,deg){
  var synth=ensureSynth(), midi;
  if(!synth || !T.song) return;
  midi=SONGS.noteMidi(T.song,track,deg);
  if(midi==null) return;
  synth.note(SONGS.SOUND[track],midi,LP.SND.ctx.currentTime+0.001,0.4,SONGS.NOTE_VEL);
}
function auditionChord(deg){
  var synth=ensureSynth(), notes=SONGS.chordNotes(T.song,deg), i, now;
  if(!synth || !notes) return;
  now=LP.SND.ctx.currentTime+0.001;
  for(i=0;i<notes.length;i++) synth.note(SONGS.SOUND.chords,notes[i],now,0.8,SONGS.NOTE_VEL);
}
/* the context was replaced (a call, Siri): the tape carries on from the same tick on the new one */
function onAudio(){
  var was=T.playing, tick=T.heard>0 ? T.heard : 0;
  if(was && T.mode==="pattern" && T.pendingPat>=0 && tick>=T.boundaryGlobal){
    T.playPat=T.pendingPat;
    T.pendingPat=-1;
    T.queued=-1;
    T.boundaryGlobal=0;
  }
  dropSynth();
  T.ctx=LP.SND.ctx;
  if(!T.ctx) return;
  if(!was && !visible()) return;
  T.synth=SYNTH.create(T.ctx,LP.SND.app);
  if(!was) return;
  /* a switch that was scheduled ahead of the ears has to be taken back and scheduled again from here */
  T.chainPat=T.playPat;
  T.startAt=T.ctx.currentTime-SONGS.ticksToSec(tick,T.song.bpm);
  T.lastTick=tick+1;
  T.heard=tick;
  T.painted=null;
  paintPlaying(true);
  renderNav();
  if(!T.loop) T.loop=setInterval(loop,LOOP_MS);
}
/* ---------- the playhead ---------- */
function clearPlaying(){
  var boxes=["studio-grid","studio-chord-cells","studio-chain"], sels=[".st-cell",".st-chord-cell",".st-chain-cell"];
  var i, j, box, nodes;
  for(i=0;i<boxes.length;i++){
    box=$(boxes[i]);
    if(!box) continue;
    nodes=box.querySelectorAll(sels[i]);
    for(j=0;j<nodes.length;j++) nodes[j].classList.remove("playing");
  }
}
/* the step / half / slot being heard, and only when the heard pattern is the one on screen (12.7) */
function paintPlaying(force){
  if(force) T.painted=null;
  var key="", c, node, nodes, step;
  if(T.playing && T.song){
    c=heardAt();
    if(c){
      if(T.screen==="song" && T.mode==="song"){
        key="song:"+c.slot;
      } else if(T.screen==="chords" && c.p===T.pat){
        key="chord:"+Math.floor(c.t/(SONGS.CHORD_STEPS[1]*SONGS.STEP));
      } else if((T.screen==="drums"||T.screen==="bass"||T.screen==="melody") && c.p===T.pat){
        step=Math.floor(c.t/SONGS.STEP);
        key="grid:"+(step%SONGS.STEPS);
      }
    }
  }
  if(key===T.painted) return;
  T.painted=key;
  clearPlaying();
  if(!key) return;
  var parts=key.split(":");
  var n=parseInt(parts[1],10);
  if(parts[0]==="grid"){
    node=$("studio-grid").children[n];
  } else if(parts[0]==="chord"){
    nodes=$("studio-chord-cells").children;
    node=nodes[n%2];
  } else {
    nodes=$("studio-chain").children;
    node=nodes[n];
  }
  if(node) node.classList.add("playing");
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
  var defs=["drums","bass","chords","melody","song"], screens=$("studio-screens");
  for(i=0;i<defs.length;i++){
    (function(id){
      var b=el("button","st-scr");
      b.type="button";
      b.setAttribute("data-screen",id);
      b.appendChild(el("span","st-scr-name"));
      b.appendChild(el("i","st-dot"));
      b.onclick=function(){ setScreen(id); };
      screens.appendChild(b);
    })(defs[i]);
  }
  var keys=$("studio-keys");
  for(i=0;i<8;i++){
    (function(deg){
      var b=el("button","st-key");
      b.type="button";
      b.setAttribute("data-deg",String(deg));
      b.appendChild(el("span","st-key-name"));
      b.appendChild(el("i","st-key-line"));
      b.onclick=function(){ keyTap(deg); };
      keys.appendChild(b);
    })(i);
  }
  var cells=$("studio-chord-cells");
  for(i=0;i<2;i++){
    (function(half){
      var b=el("button","st-chord-cell");
      b.type="button";
      b.setAttribute("data-half",String(half));
      b.appendChild(el("b","st-roman"));
      b.appendChild(el("small","st-name"));
      b.onclick=function(){ chordTap(half); };
      cells.appendChild(b);
    })(i);
  }
  var ck=$("studio-chord-keys");
  for(i=0;i<6;i++){
    (function(deg){
      var b=el("button","st-chord-key");
      b.type="button";
      b.setAttribute("data-deg",String(deg));
      b.appendChild(el("b"));
      b.appendChild(el("small"));
      b.onclick=function(){ chordKeyTap(deg); };
      ck.appendChild(b);
    })(i);
  }
  var letters=$("studio-letters");
  for(i=0;i<SONGS.PATTERNS_MAX;i++){
    (function(p){
      var b=el("button","st-letter");
      b.type="button";
      b.setAttribute("data-pat",String(p));
      b.appendChild(el("span","st-letter-name"));
      b.appendChild(el("i","st-dot"));
      b.onclick=function(){ songLetter(p); };
      letters.appendChild(b);
    })(i);
  }
  $("studio-pat").onclick=function(){ openSheet("pattern"); };
  $("studio-add").onclick=function(){ addSongSlot(); };
  $("studio-drop").onclick=function(){ dropSongSlot(); };
  bindRepeat($("studio-minus"),-SONGS.BPM_STEP);
  bindRepeat($("studio-plus"),SONGS.BPM_STEP);
  $("studio-play").onclick=function(){ togglePlay(); };
  $("studio-tour").onclick=function(){ startTour(); };
  $("studio-menu").onclick=function(){ openSheet("menu"); };
  if(window.ResizeObserver) new ResizeObserver(function(){ layout(); }).observe($("studio-board"));
  window.addEventListener("resize",layout);
}
function layout(){
  if(!visible()) return;
  var board=$("studio-board"), grid=$("studio-grid"), view=$("v-studio");
  if(!board || !grid || board.hidden) return;
  var w=board.clientWidth-16, h=board.clientHeight-12;
  if(w<=0 || h<=0) return;
  var gap=4, cell=Math.floor((Math.min(w,h)-gap*3)/4);
  if(cell<56) cell=56;
  var total=cell*4+gap*3;
  /* a grid step's bubble sits above the grid: shrink the grid just enough to keep the bubble
     clear of the bar, never below the 56 px cell floor (docs/design/studio.md 11.6) */
  var step=T.tour && T.tour.steps[T.tour.i], box=T.tour && T.tour.box;
  if(step && step.room && box && box.offsetHeight>0){
    var bar=view.querySelector(".st-bar");
    if(bar){
      var vr=view.getBoundingClientRect(), br=bar.getBoundingClientRect(), bd=board.getBoundingClientRect();
      var need=box.offsetHeight+14;      /* the 10 px gap above the grid and 4 px below the bar */
      var maxTotal=Math.floor(board.clientHeight-2*(br.bottom+need-bd.top));
      var floor=56*4+gap*3;
      if(maxTotal<total){
        cell=Math.floor((Math.max(floor,maxTotal)-gap*3)/4);
        if(cell<56) cell=56;
        total=cell*4+gap*3;
      }
    }
  }
  grid.style.width=total+"px";
  grid.style.height=total+"px";
  grid.style.gridTemplateColumns="repeat(4,"+cell+"px)";
  grid.style.gridTemplateRows="repeat(4,"+cell+"px)";
  /* the smallest phone (331x359) cannot hold four 56 px cells plus the bars and the keys; shrink the drawing
     to fit rather than let it spill, while normal screens keep the 56 px rule above */
  var scale=Math.min(1,w/total,h/total);
  grid.style.transform=scale<0.999 ? "scale("+scale.toFixed(3)+")" : "";
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
function stateKey(){
  return T.screen+"|"+T.pat+"|"+(T.playing?T.mode:"")+"|"+(T.playing?playedPat():"")+
    "|"+(T.playing?playedSlot():"")+"|"+(T.queued>=0?"q":"")+"|"+(T.song?T.song.bpm:"");
}
function renderNav(){
  if(!T.built) return;
  var v=$("v-studio"), patBtn=$("studio-pat");
  if(v){
    v.setAttribute("data-screen",T.screen);
    v.setAttribute("data-pat",String(T.pat));
    v.setAttribute("data-mode",T.playing?T.mode:"");
    v.setAttribute("data-play-pat",T.playing?String(playedPat()):"");
    v.setAttribute("data-play-slot",T.playing&&T.mode==="song"?String(playedSlot()):"");
  }
  if(patBtn){
    patBtn.textContent=letter(T.pat);
    patBtn.setAttribute("aria-label",tr("studio.pat.label",{p:letter(T.pat)}));
    patBtn.classList.toggle("queued",T.queued>=0);
    patBtn.style.animationDuration=(120/(T.song?T.song.bpm:SONGS.BPM_DEFAULT))+"s";
  }
  var tabs=$("studio-screens").children, i, b, id, on;
  for(i=0;i<tabs.length;i++){
    b=tabs[i]; id=b.getAttribute("data-screen");
    b.classList.toggle("on",id===T.screen);
    b.setAttribute("aria-pressed",id===T.screen?"true":"false");
    b.querySelector(".st-scr-name").textContent=screenName(id);
    on=id!=="song" && !!(T.song && SONGS.hasNotes(T.song,T.pat,id));
    b.querySelector(".st-dot").classList.toggle("on",on);
  }
  T.navKey=stateKey();
}
function renderScreens(){
  var drums=T.screen==="drums", notes=T.screen==="bass"||T.screen==="melody";
  $("studio-tabs").hidden=!drums;
  $("studio-board").hidden=!(drums||notes);
  $("studio-keys-wrap").hidden=!notes;
  $("studio-chord-board").hidden=T.screen!=="chords";
  $("studio-song").hidden=T.screen!=="song";
}
function renderTabs(){
  var tabs=$("studio-tabs").children, i, d, b, any, s;
  for(i=0;i<tabs.length;i++){
    b=tabs[i]; d=b.getAttribute("data-drum");
    b.classList.toggle("on",d===T.drum);
    b.setAttribute("aria-pressed",d===T.drum?"true":"false");
    var name=b.querySelector(".st-tab-name");
    if(name) name.textContent=tr("studio.drum."+d);
    any=false;
    if(T.song){
      for(s=0;s<SONGS.STEPS;s++) if(SONGS.has(T.song,T.pat,"drums",d,s)){ any=true; break; }
    }
    b.querySelector(".st-dot").classList.toggle("on",any);
  }
}
function renderGrid(){
  var cells=$("studio-grid").children, i, b, on, note, nm, track=noteTrack();
  for(i=0;i<cells.length;i++){
    b=cells[i];
    b.classList.toggle("focus",T.kb && i===T.focus);
    if(track){
      note=T.song && SONGS.noteAt(T.song,T.pat,track,i*SONGS.STEP);
      nm=note ? SONGS.noteName(SONGS.noteMidi(T.song,track,note.deg)) : "";
      b.textContent=nm||"";
      b.classList.toggle("on",!!note);
      b.classList.toggle("has-note",!!note);
      b.classList.toggle("sel",T.noteSel[track]===i);
      b.setAttribute("aria-pressed",note?"true":"false");
      b.setAttribute("aria-label",tr(note?"studio.note.cell":"studio.note.empty",
        {track:screenName(track),n:i+1,note:nm||""}));
    } else {
      b.textContent="";
      b.classList.remove("has-note","sel");
      on=!!(T.song && SONGS.has(T.song,T.pat,"drums",T.drum,i));
      b.classList.toggle("on",on);
      b.setAttribute("aria-pressed",on?"true":"false");
      b.setAttribute("aria-label",tr("studio.cell",{drum:tr("studio.drum."+T.drum),n:i+1}));
    }
  }
}
function renderKeys(){
  var track=noteTrack();
  if(!track || !T.song) return;
  var keys=$("studio-keys").children, i, b, midi, name, note, sel=T.noteSel[track];
  note=sel>=0 ? SONGS.noteAt(T.song,T.pat,track,sel*SONGS.STEP) : null;
  var base=SONGS.tonic(track,T.song.key);
  for(i=0;i<keys.length;i++){
    b=keys[i];
    midi=SONGS.noteMidi(T.song,track,i);
    name=SONGS.noteName(midi)||"";
    b.querySelector(".st-key-name").textContent=name;
    b.classList.toggle("on",!!(note && note.deg===i));
    b.classList.toggle("oct",midi!=null && base!=null && midi>=base+12);
    b.setAttribute("aria-label",tr("studio.key",{note:name}));
    b.setAttribute("aria-pressed",note && note.deg===i?"true":"false");
  }
}
function renderChords(){
  var cells=$("studio-chord-cells").children, i, b, tick, note, ch, roman, name;
  for(i=0;i<2;i++){
    b=cells[i];
    tick=SONGS.CHORD_STEPS[i]*SONGS.STEP;
    note=T.song && SONGS.noteAt(T.song,T.pat,"chords",tick);
    ch=note ? SONGS.chordName(T.song,note.deg) : null;
    roman=b.querySelector(".st-roman");
    name=b.querySelector(".st-name");
    roman.textContent=ch?ch.roman:"";
    name.textContent=ch?ch.name:"";
    b.classList.toggle("has-chord",!!ch);
    b.classList.toggle("sel",T.chordSel===i);
    b.classList.toggle("focus",T.kb && T.focus===i);
    b.setAttribute("aria-pressed",note?"true":"false");
    b.setAttribute("aria-label",tr(i===0?"studio.chord.half1":"studio.chord.half2")+(ch?" · "+ch.name:""));
  }
  var keys=$("studio-chord-keys").children, k, kb, degNote;
  degNote=T.chordSel>=0 && T.song ? SONGS.noteAt(T.song,T.pat,"chords",SONGS.CHORD_STEPS[T.chordSel]*SONGS.STEP) : null;
  for(i=0;i<keys.length;i++){
    k=keys[i];
    ch=T.song ? SONGS.chordName(T.song,i) : null;
    k.querySelector("b").textContent=ch?ch.roman:"";
    k.querySelector("small").textContent=ch?ch.name:"";
    k.classList.toggle("on",!!(degNote && degNote.deg===i));
    k.setAttribute("aria-pressed",degNote && degNote.deg===i?"true":"false");
    k.setAttribute("aria-label",tr("studio.chord.key",{name:ch?ch.name:""}));
  }
}
function renderSong(){
  var chain=$("studio-chain"), s=T.song&&T.song.song?T.song.song:[0], i, b;
  chain.textContent="";
  for(i=0;i<s.length;i++){
    (function(idx){
      var cell=el("button","st-chain-cell"+(idx===T.slot?" sel":"")+(T.kb&&idx===T.focus?" focus":""));
      cell.type="button";
      cell.setAttribute("data-slot",String(idx));
      cell.textContent=letter(s[idx]);
      cell.setAttribute("aria-label",tr("studio.song.slot",{n:idx+1,p:letter(s[idx])}));
      cell.onclick=function(){ selectSlot(idx); };
      chain.appendChild(cell);
    })(i);
  }
  var letters=$("studio-letters").children, p, dot;
  for(i=0;i<letters.length;i++){
    b=letters[i]; p=i;
    b.querySelector(".st-letter-name").textContent=letter(p);
    b.setAttribute("aria-label",tr("studio.pat.label",{p:letter(p)}));
    b.setAttribute("aria-pressed",String(s[T.slot]===p));
    dot=b.querySelector(".st-dot");
    var has=false, j;
    if(T.song) for(j=0;j<4;j++) if(SONGS.hasNotes(T.song,p,["drums","bass","chords","melody"][j])){ has=true; break; }
    dot.classList.toggle("on",has);
  }
  $("studio-add").textContent=tr("studio.song.add");
  $("studio-drop").textContent=tr("studio.song.drop");
  $("studio-drop").disabled=!T.song || s.length<=1;
  /* the chain cells are new nodes: put the playing slot back on them when the chain changes mid-song */
  if(T.playing) paintPlaying(true);
}
function renderAll(){
  build();
  var v=$("v-studio"); if(v) v.setAttribute("data-loaded",T.loaded?"true":"false");
  renderBar(); renderNav(); renderScreens(); renderTabs(); renderGrid(); renderKeys(); renderChords(); renderSong();
  renderPlay(); renderSheet();
  paintPlaying(true);
  layout();
}
/* ---------- the tour ----------
   Not an LP interface: only this program uses tour(); docs/design/studio.md 11.6. One step is
   {el:function(){ return element }, text:"studio.tour.x", done:"play"|"toggle"|"drum"|null, room?:true}. The screen
   reports the named event with tourEvent(); a null done shows a Next button (Done on the last step). Every step skips.
   room marks a step whose bubble needs space above the grid. Nothing is covered: the target gets an ink outline and
   a speech bubble beside it, and the rest of the screen keeps working. A tap elsewhere never ends the tour. */
function rhythmTour(){
  return [
    {el:function(){ return $("studio-play"); }, text:"studio.tour.play", done:"play"},
    {el:function(){ return $("studio-grid"); }, text:"studio.tour.grid", done:null, room:true},
    {el:function(){ return $("studio-grid"); }, text:"studio.tour.cell", done:"toggle", room:true},
    {el:function(){ return $("studio-tabs"); }, text:"studio.tour.drums", done:"drum"},
    {el:function(){ return $("studio-tempo"); }, text:"studio.tour.tempo", done:null}
  ];
}
function startTour(){
  /* 12.10's per-screen tours are a later step: ? still replays the rhythm tour, so bring its screen back first */
  if(T.built && T.screen!=="drums"){
    T.screen="drums"; T.focus=0; T.painted=null;
    renderAll();
  }
  if(T.built) tour("rhythm",rhythmTour());
}
function maybeTour(){
  if(!visible() || T.tour || !T.built || !T.loaded || !T.meta) return;
  if(T.meta.toured && T.meta.toured.rhythm) return;
  startTour();
}
function tour(screen,steps){
  tourEnd(false);
  if(!steps || !steps.length) return;
  var view=$("v-studio");
  var root=el("div","st-tour"), box=el("div","st-tour-box");
  var text=el("p","st-tour-text");
  var row=el("div","st-tour-btns");
  var skip=el("button","st-tour-skip"), next=el("button","st-tour-next");
  skip.type="button"; next.type="button";
  row.appendChild(skip); row.appendChild(next);
  box.appendChild(text); box.appendChild(row);
  root.appendChild(box);
  view.appendChild(root);
  document.body.classList.add("st-tour-on");
  T.tour={screen:screen, steps:steps, i:0, root:root, box:box, text:text, skip:skip, next:next, hi:null};
  skip.onclick=function(){ tourEnd(true); };
  next.onclick=function(){ tourNext(); };
  tourShow(0);
}
function tourShow(i){
  var t=T.tour;
  if(!t || !t.steps[i]) return;
  t.i=i;
  if(t.hi) t.hi.classList.remove("st-tour-hi");
  /* the kick grid is what steps 2 and 3 are about, so the kick tab is the one picked */
  if(i===2 && T.drum!=="kick") pickDrum("kick",false,false);
  var step=t.steps[i];
  var node=step.el ? step.el() : null;
  t.hi=node || null;
  if(node) node.classList.add("st-tour-hi");
  t.text.textContent=tr(step.text);
  t.skip.textContent=tr("studio.tour.skip");
  t.next.textContent=tr(i===t.steps.length-1 ? "studio.tour.done" : "studio.tour.next");
  /* an action already done when the step starts (playing when step 1 shows) offers Next instead */
  var met=step.done==="play" && T.playing;
  t.next.hidden=!!step.done && !met;
  layout();                     /* grid steps make room for the bubble; others take the normal size back */
}
/* bubble above or below the target, against the side with more room inside the view; the triangle points
   at the target's centre and the bubble never sits over the target */
function tourPlace(){
  var t=T.tour;
  if(!t || !t.hi) return;
  var view=$("v-studio"), v=view.getBoundingClientRect(), r=t.hi.getBoundingClientRect();
  if(!v.width || !v.height || !r.width) return;
  var box=t.box, w=box.offsetWidth, h=box.offsetHeight, margin=4;
  if(!w || !h) return;
  var cx=r.left-v.left+r.width/2;
  var left=Math.round(cx-w/2);
  if(left<margin) left=margin;
  if(left>v.width-margin-w) left=Math.round(v.width-margin-w);
  var top=r.top-v.top, bottom=r.bottom-v.top;
  var above=top > v.height-bottom;
  var y=above ? top-10-h : bottom+10;
  if(y<margin) y=margin;
  if(y+h>v.height-margin) y=v.height-margin-h;
  /* if the clamp pushed it over the target, take the other side */
  if(y<bottom && y+h>top){
    var alt=above ? bottom+10 : top-10-h;
    if(alt>=margin && alt+h<=v.height-margin) y=alt;
  }
  y=Math.round(y);
  box.classList.toggle("st-tour-above",y+h<=top);
  box.classList.toggle("st-tour-below",y>=bottom);
  box.style.left=left+"px";
  box.style.top=y+"px";
  /* the triangle sits on the padding box, hence the 3 px border; 14 px keeps it off the rounded corners */
  var tri=Math.round(cx-left-3), max=w-6-14;
  if(tri<14) tri=14;
  if(tri>max) tri=max;
  box.style.setProperty("--st-tour-tip",tri+"px");
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
  document.body.classList.remove("st-tour-on");
  if(t.root.parentNode) t.root.parentNode.removeChild(t.root);
  if(seen && T.meta && t.screen){
    T.meta.toured=T.meta.toured || {};
    T.meta.toured[t.screen]=true;
    saveMeta();
  }
  if(visible()) layout();        /* the grid takes its normal size back */
}
/* ---------- sheets: the menu, the new-tape question and the pattern sheet ---------- */
function openSheet(name){ T.sheet=name; renderSheet(); }
function closeSheet(){
  if(T.sheet==="new"){ T.sheet="menu"; renderSheet(); return; }
  if(T.sheet==="copyask"){ T.sheet="copy"; renderSheet(); return; }
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
function sheetHead(text){
  var head=el("p","sheet-title");
  head.appendChild(el("span","",text));
  $("studio-sheet").appendChild(head);
  return head;
}
function patternButtons(click){
  var grid=el("div","st-pat-grid"), i, b;
  for(i=0;i<SONGS.PATTERNS_MAX;i++){
    (function(p){
      b=el("button","st-pat-btn"+(p===T.pat?" on":""));
      b.type="button";
      b.setAttribute("data-pat",String(p));
      b.appendChild(el("span","",letter(p)));
      if(T.song && !SONGS.patternEmpty(T.song,p)) b.appendChild(el("i","st-dot on"));
      b.onclick=function(){ click(p); };
      grid.appendChild(b);
    })(i);
  }
  return grid;
}
function renderSheet(){
  if(!T.built) return;
  var sh=$("studio-sheet"), i;
  sh.hidden=!T.sheet;
  /* a sheet owns the screen while it is open: the bubble and the frame step aside, then come back */
  var view=$("v-studio");
  if(view) view.classList.toggle("st-sheet-open",!!T.sheet);
  if(T.tour) layout();
  sh.textContent="";
  if(!T.sheet) return;
  if(T.sheet==="menu"){
    sheetHead(tr("studio.title"));
    var ul=el("ul","lcd-menu");
    if(T.loaded) sheetRow(ul,tr("studio.new"),"",function(){ openSheet("new"); });
    if(T.song && T.loaded) sheetRow(ul,tr("studio.kit",{kit:tr("studio.kit."+T.song.kit)}),"",function(){
      T.song.kit=T.song.kit==="soft" ? "chip" : "soft";
      touch(); renderSheet();
    });
    /* no chin pad here, so the way out of the menu has to be on screen */
    sheetRow(ul,tr("studio.back"),"",function(){ closeSheet(); });
    sh.appendChild(ul);
    return;
  }
  if(T.sheet==="new"){
    sheetHead(tr("studio.title"));
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
    no.onclick=function(){ closeSheet(); };
    row.appendChild(yes); row.appendChild(no);
    ask.appendChild(row);
    sh.appendChild(ask);
    return;
  }
  if(T.sheet==="pattern"){
    sheetHead(tr("studio.pat.label",{p:letter(T.pat)}));
    sh.appendChild(patternButtons(function(p){
      T.sheet=""; setPat(p);
    }));
    var copy=el("button","st-sheet-btn","");
    copy.type="button";
    copy.textContent=tr("studio.pat.copy",{p:letter(T.pat)});
    copy.onclick=function(){ openSheet("copy"); };
    var brow=el("div","st-sheet-row");
    brow.appendChild(copy);
    sh.appendChild(brow);
    var back=el("button","st-sheet-btn","");
    back.type="button";
    back.textContent=tr("studio.back");
    back.onclick=function(){ closeSheet(); };
    var brow2=el("div","st-sheet-row");
    brow2.appendChild(back);
    sh.appendChild(brow2);
    return;
  }
  if(T.sheet==="copy"){
    sheetHead(tr("studio.pat.copyask",{p:letter(T.pat)}));
    sh.appendChild(patternButtons(function(p){
      if(p===T.pat) return;
      if(T.song && SONGS.patternEmpty(T.song,p)) copyTo(p);
      else { T.copyTo=p; openSheet("copyask"); }
    }));
    var cback=el("button","st-sheet-btn","");
    cback.type="button";
    cback.textContent=tr("studio.back");
    cback.onclick=function(){ openSheet("pattern"); };
    var crow=el("div","st-sheet-row");
    crow.appendChild(cback);
    sh.appendChild(crow);
    return;
  }
  /* copyask: the target already has notes, so the overwrite needs an answer (A / 确认, B / 取消) */
  var ask2=el("div","st-copy-ask");
  ask2.appendChild(el("p","",tr("studio.pat.over",{p:letter(T.copyTo)})));
  var row2=el("div","row");
  var yes2=el("button","btn","");
  yes2.type="button";
  yes2.textContent=tr("studio.confirm");
  yes2.onclick=function(){ copyTo(T.copyTo); };
  var no2=el("button","btn ghost","");
  no2.type="button";
  no2.textContent=tr("common.cancel");
  no2.onclick=function(){ openSheet("copy"); };
  row2.appendChild(yes2); row2.appendChild(no2);
  ask2.appendChild(row2);
  sh.appendChild(ask2);
}
/* copies all four tracks and switches the edit view to the target; while a pattern plays this queues the switch */
function copyTo(target){
  if(!T.song || target<0 || target>=SONGS.PATTERNS_MAX || target===T.pat) return;
  T.song=SONGS.copyPattern(T.song,T.pat,target);
  T.sheet="";
  touch();                 /* the target may be a pattern this song did not have yet */
  setPat(target);
  toast(tr("studio.pat.copied",{p:letter(target)}));
}
function newTape(){
  if(!T.loaded) return;
  stopRepeatAll();
  T.pat=0; T.screen="drums"; T.focus=0; T.slot=0; T.kb=false;
  T.noteSel={bass:-1,melody:-1}; T.noteDeg={bass:0,melody:0}; T.chordSel=-1; T.chordDeg=0;
  T.queued=-1; T.pendingPat=-1; T.boundaryGlobal=0; T.chainPat=0; T.playPat=0;
  setSong(SONGS.newSong(Date.now()));
  if(T.playing){ T.lastTick=Math.max(T.lastTick,T.heard+1); T.painted=null; }
  T.dirty=true;
  T.sheet="";
  flush();
  renderAll();
}
/* ---------- taps and keys ---------- */
function setScreen(s){
  if(["drums","bass","chords","melody","song"].indexOf(s)<0) return;
  T.screen=s;
  T.focus=0;
  T.kb=false;
  T.painted=null;
  renderAll();
}
function setPat(i){
  if(!T.song || i<0 || i>=SONGS.PATTERNS_MAX) return;
  if(!T.song.patterns[i]){ T.song=SONGS.ensurePattern(T.song,i); touch(); }
  if(T.pat!==i){
    T.pat=i;
    T.focus=0;
    T.noteSel={bass:-1,melody:-1};
    T.chordSel=-1;
  }
  if(T.playing && T.mode==="pattern") queuePat(i);
  T.painted=null;
  renderAll();
}
/* a pattern picked while a pattern plays waits for the next bar of what was already scheduled (12.3) */
function queuePat(i){
  if(!T.playing || T.mode!=="pattern") return;
  if(i===T.playPat && T.chainPat===T.playPat){
    T.pendingPat=-1; T.queued=-1; T.boundaryGlobal=0;
    renderNav();
    return;
  }
  var p=patternTicks(T.chainPat);
  var b=Math.ceil(T.lastTick/p)*p;
  T.pendingPat=i;
  T.queued=i;
  T.boundaryGlobal=b;
  renderNav();
}
function cellTap(step){
  if(T.screen==="bass"||T.screen==="melody"){ noteTap(T.screen,step); return; }
  if(T.screen!=="drums") return;
  if(!T.loaded || !T.song) return;
  T.focus=step;
  T.song=SONGS.toggle(T.song,T.pat,"drums",T.drum,step);
  touch();
  renderTabs(); renderGrid(); renderNav();
  auditionDrum();
  tourEvent("toggle");
}
function noteTap(track,step){
  if(!T.loaded || !T.song) return;
  var tick=step*SONGS.STEP, note=SONGS.noteAt(T.song,T.pat,track,tick), deg;
  T.focus=step;
  if(note){
    if(T.noteSel[track]===step){
      T.song=SONGS.removeNote(T.song,T.pat,track,tick);
      T.noteSel[track]=-1;
      touch();
      renderGrid(); renderKeys(); renderNav();
      return;
    }
    T.noteSel[track]=step;
    renderGrid(); renderKeys();
    auditionNote(track,note.deg);
    return;
  }
  deg=T.noteDeg[track]||0;
  T.song=SONGS.setNote(T.song,T.pat,track,tick,deg,SONGS.NOTE_VEL);
  T.noteSel[track]=step;
  touch();
  renderGrid(); renderKeys(); renderNav();
  auditionNote(track,deg);
}
function keyTap(deg){
  var track=noteTrack(), sel, note;
  if(!track || !T.song) return;
  T.noteDeg[track]=deg;
  sel=T.noteSel[track];
  if(sel>=0){
    note=SONGS.noteAt(T.song,T.pat,track,sel*SONGS.STEP);
    if(note){
      T.song=SONGS.setNote(T.song,T.pat,track,sel*SONGS.STEP,deg,SONGS.NOTE_VEL);
      touch();
      renderGrid(); renderNav();
    }
  }
  renderKeys();
  auditionNote(track,deg);
}
function chordTap(half){
  if(!T.loaded || !T.song) return;
  var tick=SONGS.CHORD_STEPS[half]*SONGS.STEP, note=SONGS.noteAt(T.song,T.pat,"chords",tick), deg;
  T.focus=half;
  if(note){
    if(T.chordSel===half){
      T.song=SONGS.removeNote(T.song,T.pat,"chords",tick);
      T.chordSel=-1;
      touch();
      renderChords(); renderNav();
      return;
    }
    T.chordSel=half;
    renderChords();
    auditionChord(note.deg);
    return;
  }
  deg=T.chordDeg||0;
  T.song=SONGS.setNote(T.song,T.pat,"chords",tick,deg,SONGS.NOTE_VEL);
  T.chordSel=half;
  touch();
  renderChords(); renderNav();
  auditionChord(deg);
}
function chordKeyTap(deg){
  if(!T.song) return;
  T.chordDeg=deg;
  if(T.chordSel>=0){
    T.song=SONGS.setNote(T.song,T.pat,"chords",SONGS.CHORD_STEPS[T.chordSel]*SONGS.STEP,deg,SONGS.NOTE_VEL);
    touch();
    renderChords(); renderNav();
  }
  auditionChord(deg);
}
function selectSlot(i){
  if(!T.song) return;
  T.slot=Math.max(0,Math.min((T.song.song||[0]).length-1,i));
  T.focus=T.slot;
  renderSong(); renderNav();
}
function songLetter(p){
  if(!T.song || !T.loaded) return;
  T.song=SONGS.setSlot(T.song,T.slot,p);
  touch();
  renderSong(); renderNav(); renderTabs();
}
function addSongSlot(){
  if(!T.song) return;
  var s=T.song.song||[0];
  if(s.length>=SONGS.SONG_MAX){ toast(tr("studio.song.full")); return; }
  T.song=SONGS.addSlot(T.song,T.pat);
  T.slot=T.song.song.length-1;
  T.focus=T.slot;
  touch();
  renderSong(); renderNav(); renderTabs();
}
function dropSongSlot(){
  if(!T.song) return;
  var s=T.song.song||[0];
  if(s.length<=1) return;
  T.song=SONGS.dropSlot(T.song);
  if(T.slot>T.song.song.length-1) T.slot=T.song.song.length-1;
  if(T.focus>T.song.song.length-1) T.focus=T.song.song.length-1;
  touch();
  renderSong(); renderNav(); renderTabs();
}
function pickDrum(drum,play,byUser){
  if(SONGS.DRUMS.indexOf(drum)<0) return;
  T.drum=drum;
  renderTabs(); renderGrid();
  if(play) auditionDrum();
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
  var i=T.focus, s;
  if(T.screen==="chords"){
    i=i===0 ? 1 : 0;
    if(i!==0 && i!==1) i=0;
  } else if(T.screen==="song"){
    s=(T.song&&T.song.song)||[0];
    if(key==="ArrowLeft") i=Math.max(0,i-1);
    else if(key==="ArrowRight") i=Math.min(s.length-1,i+1);
    else if(key==="ArrowUp") i=Math.max(0,i-6);
    else i=Math.min(s.length-1,i+6);
    if(i>=s.length) i=s.length-1;
  } else {
    if(key==="ArrowLeft") i=i%4===0 ? i+3 : i-1;
    else if(key==="ArrowRight") i=i%4===3 ? i-3 : i+1;
    else if(key==="ArrowUp") i=i<4 ? i+12 : i-4;
    else i=i>=12 ? i-4 : i+4;
  }
  T.focus=i;
  T.kb=true;
  if(T.screen==="chords") renderChords();
  else if(T.screen==="song") renderSong();
  else renderGrid();
}
function tapFocus(){
  if(T.screen==="drums") cellTap(T.focus);
  else if(noteTrack()) noteTap(noteTrack(),T.focus);
  else if(T.screen==="chords") chordTap(T.focus===1?1:0);
  else if(T.screen==="song") selectSlot(T.focus);
}
function confirmCopy(){
  if(T.copyTo>=0 && T.copyTo<SONGS.PATTERNS_MAX) copyTo(T.copyTo);
}
document.addEventListener("keydown",function(e){
  if(!visible()) return;
  if(/INPUT|TEXTAREA|SELECT/.test(e.target.nodeName)) return;
  var key=e.key, done=true;
  if(key==="ArrowUp"||key==="ArrowDown"||key==="ArrowLeft"||key==="ArrowRight"){ if(!T.sheet) moveFocus(key); }
  else if(key==="x"||key==="X"){
    if(e.repeat) return;
    if(T.sheet==="new") newTape();
    else if(T.sheet==="copyask") confirmCopy();
    else if(!T.sheet) tapFocus();
  }
  else if(key==="Enter"){ if(e.repeat) return; togglePlay(); }
  else if(key==="Shift"){ if(e.repeat) return; if(!T.sheet && T.screen==="drums") nextDrum(); }
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
  /* opening always lands on the drums screen, pattern A (12.2) */
  T.screen="drums";
  T.pat=0;
  T.focus=0;
  T.slot=0;
  T.noteSel={bass:-1,melody:-1}; T.noteDeg={bass:0,melody:0};
  T.chordSel=-1; T.chordDeg=0;
  T.painted=null;
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
  lang:function(){ if(visible()){ renderAll(); if(T.tour) tourShow(T.tour.i); } },
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
