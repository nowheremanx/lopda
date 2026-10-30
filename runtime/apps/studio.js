/*
 * Lo-PDA built-in: the four-track tape machine (四轨机 / Tape4), step 1b-2: sixteen patterns, the drums, bass,
 * chords, melody, song and mixer screens, the tape colour, and one player for a looped pattern or a whole song.
 * docs/design/studio.md sections 11, 12 and 12.14. One project at a time: its song is a LopdaSong document in
 * data/users/local/studio/items/<id>,
 * the current id and the little state around it in data/users/local/studio {current, toured, hushTip}. The format
 * stays v 1: the editing pattern, screen and selections live in memory only. A bad or too-new tape is never written
 * over.
 *
 * The screen: a top bar (play/stop, BPM, − and +, ?, ≡), the navigation row (the pattern letter and five screen tabs),
 * then that screen. Drums keeps 1a's four drum tabs and 4x4 grid. Bass and melody share the same 16 cells with the
 * pitch name in the cell and eight pitch keys below. Chords are two cells (the two halves of the bar) and six keys.
 * Song is the chain in fours (one row is a four-bar phrase) and add; a slot's letter is picked in the sheet that
 * opens on its second tap. On the song screen ▸ starts at the selected slot (the slot sheet's first row does the
 * same), so one bar can be heard without playing the whole tape from the top. A dot on a tab or a pattern letter means
 * that track or pattern has notes. On = ink; the step being heard is mid (empty) or dark (lit).
 *
 * The player: one scheduler over LopdaSong.chainEvents(), 0.1 s ahead every 25 ms into LP.SND.app through
 * LopdaStudioSynth. On a drum/note/chord screen it loops the edit pattern; on the song screen it plays the chain one
 * bar at a time. A pattern picked while a pattern is playing waits for the next bar boundary (the letter blinks for two
 * beats); the grid shows no playhead until the ears get there. A chain edit during song playback never touches the bar
 * being heard: its next-slot index is mapped like an array index, and the bar after it starts from that slot in the
 * edited chain at the boundary. A BPM change is re-anchored at the tick being heard, a rebuilt AudioContext carries on,
 * HOME or a hidden page stops. Changes save a second later, and at once on leave or pause.
 *
 * No UI click sounds anywhere here: the only sounds are the instruments. The play glyph is drawn in CSS. Keys (the
 * chin pad is hidden): arrows move the focus box, X = A taps that cell, Enter = START plays and stops, Shift = SELECT
 * picks the next drum (drums only), Z = B closes the tour, a sheet or a question. Every screen and sheet has an
 * on-screen way back. The tour framework is 1a's; 12.10 gives the note, chord and song screens their own step lists.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, SONGS=window.LopdaSong, SYNTH=window.LopdaStudioSynth;
var own=LP.own, toast=LP.toast, show=LP.show, showPad=LP.showPad;

var BASE="data/users/local/studio", LOOKAHEAD=0.1, LOOP_MS=25, SAVE_MS=1000;
var LETTERS="ABCDEFGHIJKLMNOP";
/* the mixer's four instrument rows (12.14); the voice row joins them in step 2, when it can sound */
var MIX_TRACKS=["drums","bass","chords","melody"];
var TAPE=window.LopdaStudioTape, WAV=window.LopdaWav;

var T={
  song:null, id:"", meta:null,
  refs:null, loading:null, loaded:false, metaOk:false,
  dirty:false, saveTimer:0,
  /* the editor: which screen, which pattern, the focus box and the per-track selections (memory only) */
  drum:"kick", focus:0, kb:false, screen:"drums", pat:0, slot:0,
  noteSel:{bass:-1,melody:-1}, noteDeg:{bass:0,melody:0}, chordSel:-1, chordDeg:0,
  sheet:"", copyTo:-1, built:false, exporting:false,
  /* the player: one chain clock, chainPat is what is scheduled, playPat is what the ears hear */
  playing:false, mode:"", playPat:0, chainPat:0, pendingPat:-1, queued:-1, boundaryGlobal:0,
  loop:0, ctx:null, synth:null, tape:null,
  startAt:0, lastTick:0, heard:0, painted:null, navKey:"",
  repeats:[], tour:null,
  /* song mode's bar state (12.12): the bar being heard is frozen; a chain edit only moves where it sits in the
     edited chain, and the next bar is re-anchored from nextSlot at the boundary (h* = heard, ahead = scheduled) */
  hSlot:-1, hPat:-1, hStart:0, hTicks:0, nSlot:0, ahead:null
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
  buildSynth(ac);
  return T.synth;
}
function buildSynth(ac){
  if(TAPE){
    T.tape=TAPE.create(ac,LP.SND.app);
    T.tape.set(T.song?T.song.tape:2);
    T.synth=SYNTH.create(ac,T.tape.input);
  } else T.synth=SYNTH.create(ac,LP.SND.app);
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
  if(T.tape){ try{ T.tape.dispose(); }catch(e){} }
  T.synth=null;
  T.tape=null;
}
function patternTicks(p){
  var pat=T.song && T.song.patterns && T.song.patterns[p];
  return (pat && pat.len>0 ? pat.len : SONGS.STEPS)*SONGS.STEP;
}
/* What the ears are on. A pattern loop asks the chain for the tick; song mode answers from the bar it froze when
   that bar began, so a chain edit cannot change the heard pattern or its slot's pattern mid-bar (12.12). */
function heardAt(){
  if(!T.playing || !T.song) return null;
  if(T.mode==="song"){
    if(T.hSlot<0) return null;
    var t=T.heard-T.hStart;
    if(t<0) t=0;
    if(T.hTicks>0 && t>=T.hTicks) t=T.hTicks-1;
    return {p:T.hPat, slot:T.hSlot, t:t};
  }
  return SONGS.chainAt(T.song,[T.playPat],T.heard);
}
function playedPat(){
  var c=heardAt();
  return c ? c.p : -1;
}
function playedSlot(){
  if(T.mode!=="song") return -1;
  return T.hSlot>=0 ? T.hSlot : -1;
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
  if(T.tape) T.tape.set(song.tape);
  if(!T.song.patterns || !T.song.patterns[T.pat]) T.pat=0;
  /* a different tape may be shorter: keep every in-memory cursor inside it */
  var n=T.song.song && T.song.song.length ? T.song.song.length : 1;
  if(!(T.slot>=0)) T.slot=0;
  if(T.slot>n-1) T.slot=n-1;
  var pat=T.song.patterns && T.song.patterns[T.pat];
  var last=pat && pat.len>0 ? pat.len-1 : SONGS.STEPS-1;
  if(T.noteSel){
    if(T.noteSel.bass>last) T.noteSel.bass=last;
    if(T.noteSel.melody>last) T.noteSel.melody=last;
  }
  if(T.chordSel>1) T.chordSel=1;
  if(T.screen==="song"){ if(T.focus>n-1) T.focus=n-1; }
  else if(T.focus>last) T.focus=last;
  if(T.focus<0) T.focus=0;
  /* a whole different tape mid-song starts its own chain from where the ears are */
  if(T.playing && T.mode==="song") startSongPos(0,T.heard);
}
/* ---------- tracks and the mixer (12.14) ---------- */
function trackById(id){
  var tracks=(T.song&&T.song.tracks)||[], i;
  for(i=0;i<tracks.length;i++) if(tracks[i] && tracks[i].id===id) return tracks[i];
  return null;
}
function trackVol(id){
  var tr=trackById(id);
  return tr && typeof tr.vol==="number" ? tr.vol : 1;
}
function setTrackVol(id,vol){
  var tr=trackById(id);
  if(!T.loaded || !tr) return;
  if(typeof vol!=="number" || !isFinite(vol)) return;
  vol=Math.round(Math.max(0,Math.min(1,vol))*10)/10;
  if(tr.vol===vol) return;
  tr.vol=vol;
  touch();
  renderMixer();
}
function toggleMute(id){
  var tr=trackById(id);
  if(!T.loaded || !tr) return;
  tr.mute=!tr.mute;
  touch();
  renderMixer(); renderNav();
}
function setKey(k){
  if(!T.loaded || !T.song || SONGS.NAMES[k]==null) return;
  T.song.key=k;
  touch();
  renderAll();
}
function setScale(s){
  if(!T.loaded || !T.song || !SONGS.SCALES[s]) return;
  T.song.scale=s;
  touch();
  renderAll();
}
function setTape(level){
  if(!T.loaded || !T.song) return;
  level=Math.max(0,Math.min(SONGS.TAPE_MAX,level|0));
  if(T.song.tape===level) return;
  T.song.tape=level;
  if(T.tape) T.tape.set(level);
  touch();
  renderSheet(); renderMixer();
}
function setSwing(v){
  if(!T.loaded || !T.song) return;
  v=Math.round(v*100)/100;
  v=Math.max(SONGS.SWING_MIN,Math.min(SONGS.SWING_MAX,v));
  if(T.song.swing===v) return;
  T.song.swing=v;
  touch();
  renderSoundValues(); renderMixer();
}
/* one note or hit on a synth: the drum kit, the voice of each track, the chord expanded (12.6, 12.7). Shared by the
   live player and the offline WAV render, so both hear the mixer's level. */
function soundEvent(song,e,at,bpm,synth,vol){
  var i, notes, midi;
  if(!synth || !song || !e.vel || !(vol>0)) return;
  if(e.track==="drums"){
    if(e.key) synth.hit(song.kit,e.key,at,e.vel*vol);
  } else if(e.track==="chords"){
    notes=SONGS.chordNotes(song,e.deg);
    if(!notes) return;
    for(i=0;i<notes.length;i++) synth.note(SONGS.SOUND.chords,notes[i],at,SONGS.ticksToSec(e.len,bpm),e.vel*vol);
  } else if(e.track==="bass" || e.track==="melody"){
    midi=SONGS.noteMidi(song,e.track,e.deg);
    if(midi==null) return;
    synth.note(SONGS.SOUND[e.track],midi,at,Math.max(0.05,SONGS.ticksToSec(e.len,bpm)),e.vel*vol);
  }
}
function playEvent(e,at,bpm){
  /* a rest (12.12) is a note that does not sound: it holds the tie and paints the playhead, nothing more */
  if(!T.synth || !T.song || !e.vel) return;
  soundEvent(T.song,e,at,bpm,T.synth,trackVol(e.track));
}
/* ---------- the song player's bars (12.7, 12.12) ----------
   A song bar is scheduled from the pattern it started with, so the bar being heard can never change under a chain
   edit. The bar after it is started from nextSlot (the slot after the heard one) and is only re-read at its own
   boundary: every slot edit maps nextSlot like an array index instead of rewriting the bar being heard. */
function scheduleBarPart(pat,start,from,to){
  if(!(to>from)) return;
  var ev=SONGS.chainEvents(T.song,[pat],from-start,to-start), i, bpm=T.song.bpm;
  for(i=0;i<ev.length;i++) playEvent(ev[i],T.startAt+SONGS.ticksToSec(start+ev[i].tick,bpm),bpm);
}
function startAhead(){
  var chain=(T.song&&T.song.song)||[0], n=chain.length, slot=T.nSlot;
  if(!(slot>=0) || slot>=n) slot=0;
  T.ahead={slot:slot, pat:chain[slot], start:T.hStart+T.hTicks, ticks:patternTicks(chain[slot])};
}
function advanceAhead(){
  var chain=(T.song&&T.song.song)||[0], n=chain.length, slot=(T.ahead.slot+1)%n;
  T.ahead={slot:slot, pat:chain[slot], start:T.ahead.start+T.ahead.ticks, ticks:patternTicks(chain[slot])};
}
function scheduleSongRange(from,to){
  var guard=0, heardEnd=T.hStart+T.hTicks, stop;
  while(from<to && guard++<256){
    if(!(T.hTicks>0)) return;
    if(from<heardEnd){
      stop=Math.min(to,heardEnd);
      scheduleBarPart(T.hPat,T.hStart,from,stop);
      from=stop;
      continue;
    }
    if(!T.ahead || from>=T.ahead.start+T.ahead.ticks){
      if(!T.ahead) startAhead(); else advanceAhead();
      continue;
    }
    stop=Math.min(to,T.ahead.start+T.ahead.ticks);
    scheduleBarPart(T.ahead.pat,T.ahead.start,from,stop);
    from=stop;
  }
}
function scheduleRange(from,to){
  if(!T.song || to<=from) return;
  if(T.mode==="song"){ scheduleSongRange(from,to); return; }
  var bpm=T.song.bpm;
  var ev=SONGS.chainEvents(T.song,[T.chainPat],from,to), i;
  for(i=0;i<ev.length;i++) playEvent(ev[i],T.startAt+SONGS.ticksToSec(ev[i].tick,bpm),bpm);
}
/* Schedules forward across a queued pattern's bar boundary without cutting the bar: the old chain is scheduled
   up to the boundary, then the new one from it. The ears switch in loop() when they reach that tick, so the
   letter keeps blinking and data-play-pat keeps the old pattern meanwhile. */
function scheduleTo(to){
  var guard=0, b, p;
  /* a stalled main thread can leave the frontier behind the ears; scheduling those ticks now would play the
     whole missed stretch at once (synth hit() and note() clamp past times to now) */
  if(T.lastTick<T.heard) T.lastTick=T.heard;
  /* the same stall can leave a queued boundary behind the ears: move it to the next bar worth waiting for */
  if(T.mode==="pattern" && T.pendingPat>=0 && T.chainPat!==T.pendingPat){
    b=Math.max(T.lastTick,T.heard+1);
    p=patternTicks(T.chainPat);
    if(T.boundaryGlobal<b) T.boundaryGlobal=Math.ceil(b/p)*p;
  }
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
/* the song chain position at play start (song mode): the selected slot is heard first (12.8), the slot after it is
   next, and the chain wraps back to slot 0 after the last one. atTick keeps the old timeline when a whole tape is
   swapped mid-song; a normal start begins at tick 0. */
function startSongPos(slot,atTick){
  var chain=(T.song&&T.song.song)||[0], n=chain.length;
  if(!(slot>=0) || slot>=n) slot=0;
  T.hSlot=slot;
  T.hPat=chain[slot];
  T.hStart=atTick||0;
  T.hTicks=patternTicks(chain[slot]);
  T.nSlot=n>1?(slot+1)%n:0;
  T.ahead=null;
}
/* the ears crossed a bar boundary: the bar the scheduler started ahead becomes the heard one, and the slot after
   it is next in the chain as it is now (an edit while the bar played mapped that index already) */
function advanceHeard(){
  var chain=(T.song&&T.song.song)||[0], n=chain.length, guard=0, start, bar, slot;
  while(T.hTicks>0 && T.heard>=T.hStart+T.hTicks && guard++<16){
    start=T.hStart+T.hTicks;
    bar=T.ahead && T.ahead.start===start ? T.ahead : null;
    if(bar){
      T.hSlot=bar.slot; T.hPat=bar.pat; T.hTicks=bar.ticks;
      /* the next bar was already scheduled when its slot was deleted: the following slot slid into its index, so
         the same index is next, not the one after it (nothing is skipped) */
      T.nSlot=bar.slide ? T.hSlot : (T.hSlot+1)%n;
      T.ahead=null;
    } else {
      slot=T.nSlot>=0 && T.nSlot<n ? T.nSlot : 0;
      T.hSlot=slot; T.hPat=chain[slot]; T.hTicks=patternTicks(chain[slot]);
      T.nSlot=(T.hSlot+1)%n;
    }
    T.hStart=start;
    T.painted=null;
  }
}
/* a slot edit maps an index like an array index; delete at the index itself leaves it pointing at the slot that
   slides in (12.12's next-slot rule) */
function mapIndex(idx,kind,i,n){
  if(idx<0) return idx;
  if(kind==="insert"){ if(i<=idx) idx++; }
  else if(i<idx) idx--;
  if(idx>n-1) idx=n-1;
  if(idx<0) idx=0;
  return idx;
}
function mapSongEdit(kind,i){
  if(!T.playing || T.mode!=="song" || !T.song) return;
  var chain=T.song.song||[0], n=chain.length;
  if(n<1) return;
  T.hSlot=mapIndex(T.hSlot,kind,i,n);
  T.nSlot=mapIndex(T.nSlot,kind,i,n);
  if(T.ahead){
    var a=T.ahead.slot;
    T.ahead.slot=mapIndex(a,kind,i,n);
    /* the scheduled next bar lost its own slot: its index now holds the following slot */
    if(kind==="delete" && i===a) T.ahead.slide=true;
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
  /* the ears may have reached a new song bar before the scheduler: take the bar it started, then keep filling */
  if(T.mode==="song") advanceHeard();
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
  if(T.tape) T.tape.start();
  T.mode=T.screen==="song" ? "song" : "pattern";
  T.playPat=T.pat;
  T.chainPat=T.pat;
  T.pendingPat=-1;
  T.queued=-1;
  T.boundaryGlobal=0;
  T.playing=true;
  T.startAt=ac.currentTime+0.02;
  T.lastTick=0; T.heard=0; T.painted=null; T.navKey="";
  if(T.mode==="song") startSongPos(T.slot,0);
  else { T.ahead=null; T.hSlot=-1; T.hPat=-1; T.hTicks=0; T.nSlot=0; }
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
  T.ahead=null;
  T.hSlot=-1; T.hPat=-1; T.hTicks=0; T.nSlot=0;
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
  var synth=ensureSynth(), vol=trackVol("drums");
  if(!synth || !T.song) return;
  synth.hit(T.song.kit,T.drum,LP.SND.ctx.currentTime+0.001,vol);
}
function auditionNote(track,deg){
  var synth=ensureSynth(), midi, vol=trackVol(track);
  if(!synth || !T.song) return;
  midi=SONGS.noteMidi(T.song,track,deg);
  if(midi==null) return;
  synth.note(SONGS.SOUND[track],midi,LP.SND.ctx.currentTime+0.001,0.4,SONGS.NOTE_VEL*vol);
}
function auditionChord(deg){
  var synth=ensureSynth(), notes=SONGS.chordNotes(T.song,deg), i, now, vol=trackVol("chords");
  if(!synth || !notes) return;
  now=LP.SND.ctx.currentTime+0.001;
  for(i=0;i<notes.length;i++) synth.note(SONGS.SOUND.chords,notes[i],now,0.8,SONGS.NOTE_VEL*vol);
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
  buildSynth(T.ctx);
  if(was && T.tape) T.tape.start();
  if(!was) return;
  /* a switch that was scheduled ahead of the ears has to be taken back and scheduled again from here */
  T.chainPat=T.playPat;
  T.startAt=T.ctx.currentTime-SONGS.ticksToSec(tick,T.song.bpm);
  T.lastTick=tick+1;
  T.heard=tick;
  if(T.mode==="song") advanceHeard();
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
  var defs=["drums","bass","chords","melody","song","mixer"], screens=$("studio-screens");
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
  /* the mixer: a key/tape row and four track rows; voice joins in step 2 (12.14) */
  var rows=$("studio-mix-rows"), trk, name, minus, value, plus, mute;
  for(i=0;i<MIX_TRACKS.length;i++){
    (function(id){
      trk=el("div","st-mix-row");
      trk.setAttribute("data-track",id);
      name=el("span","st-mix-name");
      minus=el("button","st-mix-btn st-mix-minus","−"); minus.type="button";
      minus.setAttribute("aria-label",tr("studio.mix.down",{track:tr("studio.screen."+id)}));
      value=el("span","st-mix-vol");
      plus=el("button","st-mix-btn st-mix-plus","+"); plus.type="button";
      plus.setAttribute("aria-label",tr("studio.mix.up",{track:tr("studio.screen."+id)}));
      mute=el("button","st-mix-btn st-mix-mute",""); mute.type="button";
      mute.setAttribute("aria-label",tr("studio.mix.mute",{track:tr("studio.screen."+id)}));
      trk.appendChild(name); trk.appendChild(minus); trk.appendChild(value); trk.appendChild(plus); trk.appendChild(mute);
      rows.appendChild(trk);
      bindRepeatAction(minus,function(){ setTrackVol(id,trackVol(id)-0.1); });
      bindRepeatAction(plus,function(){ setTrackVol(id,trackVol(id)+0.1); });
      mute.onclick=function(){ toggleMute(id); };
    })(MIX_TRACKS[i]);
  }
  $("studio-mix-key").onclick=function(){ openSheet("key"); };
  $("studio-mix-sound").onclick=function(){ openSheet("sound"); };
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
  /* the rest key (12.12) sits in the fifth column beside both rows of pitch keys */
  var restKey=el("button","st-rest-key");
  restKey.type="button";
  restKey.id="studio-note-rest";
  restKey.onclick=function(){ restTap(); };
  keys.appendChild(restKey);
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
  var chordRest=el("button","st-rest-key");
  chordRest.type="button";
  chordRest.id="studio-chord-rest";
  chordRest.onclick=function(){ restTap(); };
  ck.appendChild(chordRest);
  $("studio-pat").onclick=function(){ openSheet("pattern"); };
  $("studio-add").onclick=function(){ addSongSlot(); };
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
  if(!board || !grid || board.hidden){ if(T.tour) tourPlace(); return; }
  /* below the normal 523 px there is not room for the bars, the pitch keys and four 56 px cells: tighten the
     chrome and the grid gaps, then scale the grid only as much as it still needs (never below 40 px cells on
     drums/notes). The 44 px rule stays for every button that is not a grid cell. */
  var short=view.clientHeight<523;
  view.classList.toggle("st-short",short);
  var cs=getComputedStyle(board);
  var w=board.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
  var h=board.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
  if(w<=0 || h<=0) return;
  var gap=short?2:4, cell=Math.floor((Math.min(w,h)-gap*3)/4);
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
  grid.style.gap=gap+"px";
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
  var n=(T.slot>=0?T.slot:0)+1;
  b.setAttribute("aria-label",tr(T.playing?"studio.stop":(T.screen==="song"?"studio.song.playfrom":"studio.play"),{n:n}));
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
    on=id!=="song" && id!=="mixer" && !!(T.song && SONGS.hasNotes(T.song,T.pat,id));
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
  $("studio-mixer").hidden=T.screen!=="mixer";
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
  var cells=$("studio-grid").children, i, b, on, note, nm, rest, track=noteTrack();
  for(i=0;i<cells.length;i++){
    b=cells[i];
    b.classList.toggle("focus",T.kb && i===T.focus);
    if(track){
      note=T.song && SONGS.noteAt(T.song,T.pat,track,i*SONGS.STEP);
      rest=!!(note && SONGS.isRest(note));
      nm=note && !rest ? SONGS.noteName(SONGS.noteMidi(T.song,track,note.deg)) : "";
      b.textContent=rest?"–":(nm||"");
      b.classList.toggle("on",!!note && !rest);
      b.classList.toggle("has-note",!!note && !rest);
      b.classList.toggle("rest",rest);
      b.classList.toggle("sel",T.noteSel[track]===i);
      b.setAttribute("aria-pressed",note?"true":"false");
      b.setAttribute("aria-label",rest?tr("studio.rest.cell",{n:i+1}):tr(note?"studio.note.cell":"studio.note.empty",
        {track:screenName(track),n:i+1,note:nm||""}));
    } else {
      b.textContent="";
      b.classList.remove("has-note","sel","rest");
      on=!!(T.song && SONGS.has(T.song,T.pat,"drums",T.drum,i));
      b.classList.toggle("on",on);
      b.setAttribute("aria-pressed",on?"true":"false");
      b.setAttribute("aria-label",tr("studio.cell",{drum:tr("studio.drum."+T.drum),n:i+1}));
    }
  }
  var rk=$("studio-note-rest");
  if(rk){ rk.textContent=tr("studio.rest"); rk.setAttribute("aria-label",tr("studio.rest")); }
}
function renderKeys(){
  var track=noteTrack();
  if(!track || !T.song) return;
  var keys=$("studio-keys").querySelectorAll(".st-key"), i, b, midi, name, note, sel=T.noteSel[track];
  note=sel>=0 ? SONGS.noteAt(T.song,T.pat,track,sel*SONGS.STEP) : null;
  if(note && SONGS.isRest(note)) note=null;
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
  var cells=$("studio-chord-cells").children, i, b, tick, note, rest, ch, roman, name;
  for(i=0;i<2;i++){
    b=cells[i];
    tick=SONGS.CHORD_STEPS[i]*SONGS.STEP;
    note=T.song && SONGS.noteAt(T.song,T.pat,"chords",tick);
    rest=!!(note && SONGS.isRest(note));
    ch=note && !rest ? SONGS.chordName(T.song,note.deg) : null;
    roman=b.querySelector(".st-roman");
    name=b.querySelector(".st-name");
    roman.textContent=rest?"–":(ch?ch.roman:"");
    name.textContent=rest?"":(ch?ch.name:"");
    b.classList.toggle("has-chord",!!ch);
    b.classList.toggle("rest",rest);
    b.classList.toggle("sel",T.chordSel===i);
    b.classList.toggle("focus",T.kb && T.focus===i);
    b.setAttribute("aria-pressed",note?"true":"false");
    b.setAttribute("aria-label",rest?tr("studio.rest.cell",{n:SONGS.CHORD_STEPS[i]+1}):
      tr(i===0?"studio.chord.half1":"studio.chord.half2")+(ch?" · "+ch.name:""));
  }
  var keys=$("studio-chord-keys").querySelectorAll(".st-chord-key"), k, kb, degNote;
  degNote=T.chordSel>=0 && T.song ? SONGS.noteAt(T.song,T.pat,"chords",SONGS.CHORD_STEPS[T.chordSel]*SONGS.STEP) : null;
  if(degNote && SONGS.isRest(degNote)) degNote=null;
  for(i=0;i<keys.length;i++){
    k=keys[i];
    ch=T.song ? SONGS.chordName(T.song,i) : null;
    k.querySelector("b").textContent=ch?ch.roman:"";
    k.querySelector("small").textContent=ch?ch.name:"";
    k.classList.toggle("on",!!(degNote && degNote.deg===i));
    k.setAttribute("aria-pressed",degNote && degNote.deg===i?"true":"false");
    k.setAttribute("aria-label",tr("studio.chord.key",{name:ch?ch.name:""}));
  }
  var rk=$("studio-chord-rest");
  if(rk){ rk.textContent=tr("studio.rest"); rk.setAttribute("aria-label",tr("studio.rest")); }
}
function renderSong(){
  var chain=$("studio-chain"), s=T.song&&T.song.song?T.song.song:[0], i;
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
  $("studio-add").textContent=tr("studio.song.add");
  /* the play button names the slot it will start from (12.8) */
  renderPlay();
  /* the chain cells are new nodes: put the playing slot back on them when the chain changes mid-song */
  if(T.playing) paintPlaying(true);
}
/* the mixer screen (12.14): key and tape/sound buttons, then one row per instrument */
function renderMixer(){
  if(!T.built) return;
  var keyBtn=$("studio-mix-key"), sndBtn=$("studio-mix-sound"), rows=$("studio-mix-rows");
  if(keyBtn && T.song) keyBtn.textContent=tr("studio.mix.key",{key:SONGS.NAMES[T.song.key],scale:tr("studio.scale."+T.song.scale)});
  if(sndBtn && T.song) sndBtn.textContent=tr("studio.mix.sound",{tape:T.song.tape,swing:Math.round(T.song.swing*100)});
  if(!rows) return;
  var i, row, id, trk, vol, mute, minus, plus;
  for(i=0;i<rows.children.length;i++){
    row=rows.children[i];
    id=row.getAttribute("data-track");
    trk=trackById(id);
    vol=trk && typeof trk.vol==="number" ? trk.vol : 1;
    row.querySelector(".st-mix-name").textContent=screenName(id);
    row.querySelector(".st-mix-vol").textContent=tr("studio.mix.vol",{n:Math.round(vol*10)});
    row.querySelector(".st-mix-vol").setAttribute("aria-label",tr("studio.mix.volume",{n:Math.round(vol*10)}));
    row.classList.toggle("muted",!!(trk && trk.mute));
    row.classList.toggle("focus",T.kb && T.screen==="mixer" && i===T.focus);
    mute=row.querySelector(".st-mix-mute");
    mute.textContent=tr("studio.mix.mute.short");
    mute.setAttribute("aria-pressed",trk && trk.mute?"true":"false");
    mute.classList.toggle("on",!!(trk && trk.mute));
    minus=row.querySelector(".st-mix-minus");
    plus=row.querySelector(".st-mix-plus");
    minus.disabled=vol<=0;
    plus.disabled=vol>=1;
  }
}
/* the sound sheet's swing value and tape buttons change without rebuilding the sheet, so a held − or + keeps its timer */
function renderSoundValues(){
  if(!T.song) return;
  var v=$("studio-swing-val"), i, btns=$("studio-tape-levels") ? $("studio-tape-levels").children : [];
  if(v) v.textContent=Math.round(T.song.swing*100)+"%";
  for(i=0;i<btns.length;i++){
    btns[i].classList.toggle("on",Number(btns[i].getAttribute("data-level"))===T.song.tape);
    btns[i].setAttribute("aria-pressed",Number(btns[i].getAttribute("data-level"))===T.song.tape?"true":"false");
  }
  var sh=$("studio-sheet"), slow=sh && sh.querySelector(".st-swing-minus"), fast=sh && sh.querySelector(".st-swing-plus");
  if(slow) slow.disabled=T.song.swing<=SONGS.SWING_MIN;
  if(fast) fast.disabled=T.song.swing>=SONGS.SWING_MAX;
}
function renderAll(){
  build();
  var v=$("v-studio"); if(v) v.setAttribute("data-loaded",T.loaded?"true":"false");
  renderBar(); renderNav(); renderScreens(); renderTabs(); renderGrid(); renderKeys(); renderChords(); renderSong(); renderMixer();
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
/* 12.10: the note screens (bass and melody share one tour), the chord screen and the song screen */
function notesTour(){
  return [
    {el:function(){ return $("studio-grid"); }, text:"studio.tour.n1", done:"note", room:true, below:true},
    {el:function(){ return $("studio-keys-wrap"); }, text:"studio.tour.n2", done:"pitch"},
    {el:function(){ return $("studio-grid"); }, text:"studio.tour.n3", done:null, room:true, below:true}
  ];
}
function chordsTour(){
  return [
    {el:function(){ return $("studio-chord-cells"); }, text:"studio.tour.c1", done:"chord", chords:true, below:true},
    {el:function(){ return $("studio-chord-keys"); }, text:"studio.tour.c2", done:null}
  ];
}
function songTour(){
  return [
    {el:function(){ return $("studio-pat"); }, text:"studio.tour.s1", done:null},
    {el:function(){ return $("studio-chain"); }, text:"studio.tour.s2", done:"slot", chain:true, above:true},
    {el:function(){ return $("studio-add").parentNode; }, text:"studio.tour.s3", done:null}
  ];
}
/* 12.14: the mixer's short tour */
function mixerTour(){
  return [
    {el:function(){ return $("studio-mix-rows").children[0]; }, text:"studio.tour.m1", done:null, below:true},
    {el:function(){ return $("studio-mix-top"); }, text:"studio.tour.m2", done:null, below:true}
  ];
}
/* which tour a screen shows, and the key it is remembered under (bass and melody share "notes") */
function screenTour(s){
  if(s==="drums") return {key:"rhythm", steps:rhythmTour()};
  if(s==="bass"||s==="melody") return {key:"notes", steps:notesTour()};
  if(s==="chords") return {key:"chords", steps:chordsTour()};
  if(s==="song") return {key:"song", steps:songTour()};
  if(s==="mixer") return {key:"mixer", steps:mixerTour()};
  return null;
}
function startTour(){
  var tourDef=T.built ? screenTour(T.screen) : null;
  if(tourDef) tour(tourDef.key,tourDef.steps);
}
function maybeTour(){
  if(!visible() || T.tour || !T.built || !T.loaded || !T.meta) return;
  var tourDef=screenTour(T.screen);
  if(!tourDef) return;
  if(T.meta.toured && T.meta.toured[tourDef.key]) return;
  tour(tourDef.key,tourDef.steps);
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
  t.box.style.maxWidth="";      /* the previous step may have narrowed it to clear the play button */
  layout();                     /* grid steps make room for the bubble; others take the normal size back */
  tourPlace();                  /* chord and song screens have no grid, so layout() returns before placing */
}
/* the song tour's chain step needs air above a tall scroll box: keep the chain's rows whole and let the bubble
   sit between the bar and the frame. Any other step, or no tour, gives the chain its normal size back. */
function tourFitChain(){
  var chain=$("studio-chain");
  if(!chain) return;
  chain.style.height="";
  chain.style.marginTop="";
  chain.style.flex="";
  var t=T.tour;
  if(!t || !t.steps[t.i] || !t.steps[t.i].chain) return;
  var view=$("v-studio"), bar=view.querySelector(".st-bar"), song=$("studio-song");
  if(!bar || !song || !t.box) return;
  var cr=chain.getBoundingClientRect(), br=bar.getBoundingClientRect();
  /* the bubble goes above the chain's top edge; the navigation row between the bar and the chain may be covered */
  var need=t.box.offsetHeight+10-(cr.top-br.bottom);
  if(need<=2) return;
  if(need>cr.height-44) need=cr.height-44;      /* keep at least one row of slots */
  if(need<=0) return;
  chain.style.flex="none";
  chain.style.height=(cr.height-need)+"px";
  chain.style.marginTop=need+"px";
}
/* the chord tour frames the two cells from below. Both demo halves are full and the cells fill the board, so
   give the step room under them: keep the cells at the top and push the six keys to the bottom, leaving the
   bubble's height in between. Any other step, or no tour, gives the cells their normal size back. */
function tourFitChords(){
  var cells=$("studio-chord-cells");
  if(!cells) return;
  cells.style.flex="";
  cells.style.height="";
  cells.style.marginBottom="";
  var t=T.tour;
  if(!t || !t.steps[t.i] || !t.steps[t.i].chords) return;
  var keys=$("studio-chord-keys"), board=$("studio-chord-board");
  if(!keys || !board || !t.box) return;
  var cr=cells.getBoundingClientRect(), kr=keys.getBoundingClientRect();
  var height=Math.floor(kr.top-cr.top-10-t.box.offsetHeight);
  if(height<56) height=56;
  cells.style.flex="none";
  cells.style.height=height+"px";
  cells.style.marginBottom="auto";
}
/* bubble above or below the target, against the side with more room inside the view; the triangle points
   at the target's centre and the bubble never sits over the target. A side that would jam the bubble against
   the top bar (or out of the view) gives way to the other side, so the play button stays reachable on the
   short 331x359 screen too. */
function tourPlace(){
  var t=T.tour;
  if(!t || !t.hi) return;
  tourFitChain();
  tourFitChords();
  var view=$("v-studio"), v=view.getBoundingClientRect(), r=t.hi.getBoundingClientRect();
  if(!v.width || !v.height || !r.width) return;
  var box=t.box, w=box.offsetWidth, h=box.offsetHeight, margin=4, gap=10;
  if(!w || !h) return;
  var bar=view.querySelector(".st-bar"), play=$("studio-play");
  var barBottom=bar ? bar.getBoundingClientRect().bottom-v.top : 0;
  var cx=r.left-v.left+r.width/2;
  var left=Math.round(cx-w/2);
  if(left<margin) left=margin;
  if(left>v.width-margin-w) left=Math.round(v.width-margin-w);
  var top=r.top-v.top, bottom=r.bottom-v.top;
  var yAbove=top-gap-h, yBelow=bottom+gap;
  function fits(y){ return y>=margin && y+h<=v.height-margin; }
  var step=t.steps[t.i];
  var above=step && step.above ? true : (step && step.below ? false : top > v.height-bottom);
  var y=above ? yAbove : yBelow;
  /* a step that must keep the navigation row clear never flips sides; a target below the bar never gets
     a bubble on top of the bar if the other side has room */
  if(!(step && (step.above || step.below)) && top>=barBottom && y<barBottom+margin && fits(above ? yBelow : yAbove)){
    above=!above;
    y=above ? yAbove : yBelow;
  } else if(!(step && (step.above || step.below)) && !fits(y) && fits(above ? yBelow : yAbove)){
    above=!above;
    y=above ? yAbove : yBelow;
  }
  if(y<margin) y=margin;
  if(y+h>v.height-margin) y=v.height-margin-h;
  /* if the clamp pushed it over the target, take the other side */
  if(!(step && step.below) && y<bottom && y+h>top){
    var alt=above ? yBelow : yAbove;
    if(alt>=margin && alt+h<=v.height-margin && (alt+h<=top || alt>=bottom)){
      y=alt;
      above=!above;
    }
  }
  y=Math.round(y);
  /* last resort on the tiny screen: slide off the play button rather than sit over it */
  if(play && top>=barBottom){
    var pr=play.getBoundingClientRect();
    var bl=v.left+left, bt=v.top+y;
    if(bl<pr.right && bl+w>pr.left && bt<pr.bottom && bt+h>pr.top){
      var nl=Math.round(pr.right-v.left+6);
      var room=v.width-margin-nl;
      if(nl+w<=v.width-margin){
        left=nl;
      } else if(room>=80){
        /* a narrower bubble rewraps and grows; put it back on the side it came from */
        box.style.maxWidth=room+"px";
        left=nl;
        w=box.offsetWidth;
        h=box.offsetHeight;
        if(y+h>top && y<bottom){
          y=above ? top-gap-h : bottom+gap;
          if(y<margin) y=margin;
          if(y+h>v.height-margin) y=v.height-margin-h;
        }
      }
    }
  }
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
  tourFitChain();                 /* the song chain takes its normal height back */
  tourFitChords();                /* the chord cells take their normal height back */
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
  if(T.sheet==="demo"){ T.sheet="menu"; renderSheet(); return; }
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
function sheetClose(head){
  var b=el("button","st-sheet-close","");
  b.type="button";
  b.textContent=tr("studio.back");
  b.setAttribute("aria-label",tr("studio.back"));
  b.onclick=closeSheet;
  head.appendChild(b);
  return b;
}
function patternHasNotes(p){
  return !!(T.song && !SONGS.patternEmpty(T.song,p));
}
/* the sixteen letters in four rows of four: the one being shown (or the slot's own) inverted, a dot when the
   pattern has notes. Shared by the pattern sheet, its copy question and the slot sheet. */
function patternButtons(click,current){
  var grid=el("div","st-pat-grid"), i, b, at=current==null ? T.pat : current;
  for(i=0;i<SONGS.PATTERNS_MAX;i++){
    (function(p){
      b=el("button","st-pat-btn"+(p===at?" on":""));
      b.type="button";
      b.setAttribute("data-pat",String(p));
      b.appendChild(el("span","",letter(p)));
      if(patternHasNotes(p)) b.appendChild(el("i","st-dot on"));
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
    if(T.loaded) sheetRow(ul,tr("studio.demo"),"",function(){ openSheet("demo"); });
    if(T.song && T.loaded) sheetRow(ul,tr("studio.kit",{kit:tr("studio.kit."+T.song.kit)}),"",function(){
      T.song.kit=T.song.kit==="soft" ? "chip" : "soft";
      touch(); renderSheet();
    });
    if(T.song && T.loaded) sheetRow(ul,tr("studio.export"),"WAV",function(){ exportWav(); });
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
  if(T.sheet==="demo"){
    sheetHead(tr("studio.title"));
    var askDemo=el("div","st-ask");
    askDemo.appendChild(el("p","",tr("studio.demo.ask")));
    var drow=el("div","row");
    var dyes=el("button","btn","");
    dyes.type="button";
    dyes.textContent=tr("studio.confirm");
    dyes.onclick=function(){ demoTape(); };
    var dno=el("button","btn ghost","");
    dno.type="button";
    dno.textContent=tr("common.cancel");
    dno.onclick=function(){ closeSheet(); };
    drow.appendChild(dyes); drow.appendChild(dno);
    askDemo.appendChild(drow);
    sh.appendChild(askDemo);
    return;
  }
  if(T.sheet==="pattern"){
    sheetHead(tr("studio.pat.label",{p:letter(T.pat)}));
    sh.appendChild(patternButtons(function(p){
      T.sheet="";
      if(!setPat(p)) renderSheet();       /* before the read lands this is not an edit: just close the sheet */
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
  if(T.sheet==="slot"){
    var chain=(T.song&&T.song.song)||[0], at=T.slot, own=chain[at]==null?0:chain[at];
    var head=sheetHead(tr("studio.song.slot",{n:at+1,p:letter(own)}));
    /* 12.8: the title row's play button starts the chain at this slot */
    head.className+=" st-slot-title";
    var playBtn=el("button","st-slot-play");
    playBtn.type="button";
    playBtn.setAttribute("aria-label",tr("studio.song.play"));
    playBtn.title=tr("studio.song.play");
    playBtn.onclick=function(){ playFromSlot(at); };
    head.appendChild(playBtn);
    /* first the letters: one tap sets the slot and closes; then the edits that keep the slot where it is */
    sh.appendChild(patternButtons(function(p){ slotLetter(p); },own));
    var sul=el("ul","lcd-menu st-slot-actions");
    sheetRow(sul,tr("studio.song.insert"),"",function(){ insertSlotBefore(); });
    sheetRow(sul,tr("studio.song.copy"),"",function(){ copySlotAfter(); });
    var delRow=sheetRow(sul,tr("studio.song.del"),"",function(){ deleteSlotAt(); });
    if(chain.length<=1){ delRow.className="disabled"; delRow.setAttribute("aria-disabled","true"); delRow.onclick=null; }
    sheetRow(sul,tr("studio.back"),"",function(){ closeSheet(); });
    sh.appendChild(sul);
    return;
  }
  if(T.sheet==="key"){
    var kh=sheetHead(tr("studio.key.title"));
    kh.className+=" st-sheet-head";
    sheetClose(kh);
    /* twelve keys, four to a row; the scale below is the grid's own (12.14) */
    var kg=el("div","st-key-grid"), k;
    for(k=0;k<SONGS.NAMES.length;k++){
      (function(n){
        var b=el("button","st-key-btn"+(T.song&&n===T.song.key?" on":""),SONGS.NAMES[n]);
        b.type="button";
        b.setAttribute("data-key",String(n));
        b.setAttribute("aria-pressed",T.song&&n===T.song.key?"true":"false");
        b.onclick=function(){ setKey(n); };
        kg.appendChild(b);
      })(k);
    }
    sh.appendChild(kg);
    var sg=el("div","st-scale-grid"), scales=Object.keys(SONGS.SCALES), s;
    for(k=0;k<scales.length;k++){
      (function(name){
        s=el("button","st-scale-btn"+(T.song&&name===T.song.scale?" on":""),tr("studio.scale."+name));
        s.type="button";
        s.setAttribute("data-scale",name);
        s.setAttribute("aria-pressed",T.song&&name===T.song.scale?"true":"false");
        s.onclick=function(){ setScale(name); };
        sg.appendChild(s);
      })(scales[k]);
    }
    sh.appendChild(sg);
    return;
  }
  if(T.sheet==="sound"){
    var shd=sheetHead(tr("studio.sound.title"));
    shd.className+=" st-sheet-head";
    sheetClose(shd);
    sh.appendChild(el("p","st-sheet-label",tr("studio.tape.label")));
    var levels=el("div","st-tape-levels");
    levels.id="studio-tape-levels";
    for(k=0;k<=SONGS.TAPE_MAX;k++){
      (function(n){
        var b=el("button","st-tape-btn"+(T.song&&n===T.song.tape?" on":""),String(n));
        b.type="button";
        b.setAttribute("data-level",String(n));
        b.setAttribute("aria-pressed",T.song&&n===T.song.tape?"true":"false");
        b.onclick=function(){ setTape(n); };
        levels.appendChild(b);
      })(k);
    }
    sh.appendChild(levels);
    var srow=el("div","st-swing-row");
    srow.appendChild(el("span","st-swing-name",tr("studio.swing")));
    var slow=el("button","st-mix-btn st-swing-minus","−"); slow.type="button";
    slow.setAttribute("aria-label",tr("studio.swing.slower"));
    var val=el("span","st-swing-val",Math.round(T.song.swing*100)+"%");
    val.id="studio-swing-val";
    var fast=el("button","st-mix-btn st-swing-plus","+"); fast.type="button";
    fast.setAttribute("aria-label",tr("studio.swing.faster"));
    bindRepeatAction(slow,function(){ setSwing(T.song.swing-0.01); });
    bindRepeatAction(fast,function(){ setSwing(T.song.swing+0.01); });
    srow.appendChild(slow); srow.appendChild(val); srow.appendChild(fast);
    sh.appendChild(srow);
    renderSoundValues();
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
  if(!T.loaded || !T.song || target<0 || target>=SONGS.PATTERNS_MAX || target===T.pat) return;
  T.song=SONGS.copyPattern(T.song,T.pat,target);
  T.sheet="";
  touch();                 /* the target may be a pattern this song did not have yet */
  setPat(target);
  toast(tr("studio.pat.copied",{p:letter(target)}));
}
/* a new or demo tape: same path as a tab tap, drums screen, pattern A, keeps the beat if one is playing (12.9) */
function swapTape(song){
  stopRepeatAll();
  screenTo("drums");            /* the same path as a tab tap: an unfinished tour ends unseen */
  T.pat=0; T.focus=0; T.slot=0; T.kb=false;
  T.noteSel={bass:-1,melody:-1}; T.noteDeg={bass:0,melody:0}; T.chordSel=-1; T.chordDeg=0;
  T.queued=-1; T.pendingPat=-1; T.boundaryGlobal=0; T.chainPat=0; T.playPat=0;
  setSong(song);
  if(T.playing){ T.lastTick=Math.max(T.lastTick,T.heard+1); T.painted=null; }
  T.dirty=true;
  T.sheet="";
  flush();
  renderAll();
  maybeTour();
}
function newTape(){
  if(!T.loaded) return;
  swapTape(SONGS.newSong(Date.now()));
}
function demoTape(){
  if(!T.loaded) return;
  swapTape(SONGS.demoSong(Date.now()));
}
/* ---------- WAV export (12.14) ----------
   One full pass of the chain, rendered offline through the same synth and tape chain as the live player, then written
   as mono 16-bit 22.05 kHz by the pure wav.js writer. A snapshot of the song is rendered, so an edit during the render
   cannot change what is being written. */
function wavName(){
  var d=new Date();
  return "tape4-"+d.getFullYear()+LP.pad2(d.getMonth()+1)+LP.pad2(d.getDate())+"-"+LP.pad2(d.getHours())+LP.pad2(d.getMinutes())+".wav";
}
function renderWav(){
  var OC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!OC || !WAV || !TAPE || !SYNTH || !T.song) return Promise.reject(new Error("unavailable"));
  var song=JSON.parse(JSON.stringify(T.song)), chain=song.song||[0];
  var ticks=SONGS.chainTicks(song,chain);
  if(!(ticks>0)) return Promise.reject(new Error("empty"));
  var bpm=song.bpm, lead=0.05, tail=2.5, seconds=lead+SONGS.ticksToSec(ticks,bpm)+tail;
  var frames=Math.max(1,Math.ceil(seconds*22050));
  var oc, tape, synth, ev, vols={}, i, tr;

  try{ oc=new OC(1,frames,22050); }catch(e){ return Promise.reject(e); }
  tape=TAPE.create(oc,oc.destination);
  tape.set(song.tape);
  tape.start(0,seconds);
  synth=SYNTH.create(oc,tape.input);
  for(i=0;i<song.tracks.length;i++){
    tr=song.tracks[i];
    vols[tr.id]=typeof tr.vol==="number" ? tr.vol : 1;
  }
  ev=SONGS.chainEvents(song,chain,0,ticks);
  for(i=0;i<ev.length;i++){
    soundEvent(song,ev[i],lead+SONGS.ticksToSec(ev[i].tick,bpm),bpm,synth,vols[ev[i].track]);
  }
  return oc.startRendering().then(function(buffer){
    try{ synth.dispose(); }catch(e){}
    try{ tape.dispose(); }catch(e){}
    return new Blob([WAV.encode(buffer.getChannelData(0),22050)],{type:"audio/wav"});
  });
}
function exportWav(){
  if(T.exporting || !T.loaded || !T.song) return;
  if(!(window.OfflineAudioContext||window.webkitOfflineAudioContext) || !WAV || !TAPE || !LP.S.downloads){
    toast(tr("studio.export.fail"));
    return;
  }
  T.sheet="";
  if(T.built) renderSheet();
  if(T.playing) stopPlay();
  T.exporting=true;
  toast(tr("studio.exporting"));
  renderWav().then(function(blob){
    return LP.S.downloads.save({filename:wavName(),data:blob}).then(function(res){
      if(res && res.status==="saved") toast(tr("studio.exported"));
    },function(e){
      if(!(e && e.code==="declined")){ toast(LP.saveErr(e)); }
    });
  }).then(function(){ T.exporting=false; },function(){
    T.exporting=false;
    toast(tr("studio.export.fail"));
  });
}
/* ---------- taps and keys ---------- */
/* the one screen switch: leaving a screen mid-tour ends that tour unseen (it shows again next time) */
function screenTo(s){
  var changed=s!==T.screen;
  if(changed && T.tour) tourEnd(false);
  T.screen=s;
  T.focus=0;
  T.kb=false;
  T.painted=null;
  return changed;
}
function setScreen(s){
  if(["drums","bass","chords","melody","song","mixer"].indexOf(s)<0) return;
  var changed=screenTo(s);
  renderAll();
  if(changed) maybeTour();
}
function setPat(i){
  if(!T.loaded || !T.song || i<0 || i>=SONGS.PATTERNS_MAX) return false;
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
  return true;
}
/* A pattern picked while a pattern plays waits for the next bar of what was already scheduled (12.3).
   The latch rule: if the scheduler has already put the last look-ahead (~0.1 s) into the next bar, lastTick is
   past that boundary, so ceil() sends the pick one bar later, like a real sequencer. */
function queuePat(i){
  if(!T.playing || T.mode!=="pattern") return;
  /* Picking the pattern the ears are hearing cancels a queue the scheduler has not crossed yet (no blink).
     Once the scheduler has crossed the boundary the switch is latched: B's bar is already being scheduled, so
     picking A now queues it for the next boundary instead (it blinks until then). */
  if(i===T.playPat && T.chainPat===T.playPat){
    T.pendingPat=-1; T.queued=-1; T.boundaryGlobal=0;
    renderNav();
    return;
  }
  if(T.pendingPat===i) return;                 /* the same pattern is already the queued one */
  var p=patternTicks(T.chainPat);
  var heard=T.heard>0 ? T.heard : 0;
  var min=Math.max(T.lastTick,heard+1);
  var b=Math.ceil(min/p)*p;
  if(T.pendingPat>=0 && T.chainPat===T.pendingPat){
    /* latched: the scheduler is already inside the queued pattern's bar, so this pick gets the following bar */
    b=Math.max(T.boundaryGlobal+p,b);
  }
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
  var tick=step*SONGS.STEP, note=SONGS.noteAt(T.song,T.pat,track,tick), deg, rest;
  T.focus=step;
  if(note){
    rest=SONGS.isRest(note);
    if(T.noteSel[track]===step){
      T.song=SONGS.removeNote(T.song,T.pat,track,tick);
      T.noteSel[track]=-1;
      touch();
      renderGrid(); renderKeys(); renderNav();
      return;
    }
    T.noteSel[track]=step;
    renderGrid(); renderKeys();
    if(!rest) auditionNote(track,note.deg);
    return;
  }
  deg=T.noteDeg[track]||0;
  T.song=SONGS.setNote(T.song,T.pat,track,tick,deg,SONGS.NOTE_VEL);
  T.noteSel[track]=step;
  touch();
  renderGrid(); renderKeys(); renderNav();
  auditionNote(track,deg);
  tourEvent("note");
}
/* the rest key (12.12): the selected cell becomes a rest; it never changes the track's last-used degree and never
   auditions. With no selection it does nothing. */
function restTap(){
  var track=noteTrack();
  if(track){ restNote(track); return; }
  if(T.screen==="chords") restChord();
}
function restNote(track){
  var sel=T.noteSel[track];
  if(!T.loaded || !T.song || sel<0) return;
  T.song=SONGS.setRest(T.song,T.pat,track,sel*SONGS.STEP);
  touch();
  renderGrid(); renderKeys(); renderNav();
}
function restChord(){
  if(!T.loaded || !T.song || T.chordSel<0) return;
  T.song=SONGS.setRest(T.song,T.pat,"chords",SONGS.CHORD_STEPS[T.chordSel]*SONGS.STEP);
  touch();
  renderChords(); renderNav();
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
      tourEvent("pitch");          /* only a key that actually changed a selected note moves the tour on */
    }
  }
  renderKeys();
  auditionNote(track,deg);
}
function chordTap(half){
  if(!T.loaded || !T.song) return;
  var tick=SONGS.CHORD_STEPS[half]*SONGS.STEP, note=SONGS.noteAt(T.song,T.pat,"chords",tick), deg, rest;
  T.focus=half;
  if(note){
    rest=SONGS.isRest(note);
    if(T.chordSel===half){
      T.song=SONGS.removeNote(T.song,T.pat,"chords",tick);
      T.chordSel=-1;
      touch();
      renderChords(); renderNav();
      return;
    }
    T.chordSel=half;
    renderChords();
    if(!rest) auditionChord(note.deg);
    tourEvent("chord");            /* selecting any occupied cell, a rest too, follows step 1 (12.10) */
    return;
  }
  deg=T.chordDeg||0;
  T.song=SONGS.setNote(T.song,T.pat,"chords",tick,deg,SONGS.NOTE_VEL);
  T.chordSel=half;
  touch();
  renderChords(); renderNav();
  auditionChord(deg);
  tourEvent("chord");
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
  if(!T.loaded || !T.song) return;
  var s=T.song.song||[0];
  i=Math.max(0,Math.min(s.length-1,i));
  /* tapping the slot already selected opens its sheet (12.12); another slot just selects it */
  if(i===T.slot){ T.focus=i; openSheet("slot"); return; }
  T.slot=i;
  T.focus=T.slot;
  renderSong(); renderNav();
}
/* the song screen's ▸ and the slot sheet's first row (12.8): play the chain from this slot to its end, then wrap
   back to the top. A song already playing restarts here, so this is also the way to jump to another bar. */
function playFromSlot(i){
  if(!T.loaded || !T.song) return;
  var s=T.song.song||[0];
  if(!(i>=0) || i>=s.length) i=0;
  T.slot=i;
  T.focus=i;
  T.sheet="";
  renderSong(); renderNav(); renderSheet();
  scrollSlotIntoView();
  if(T.playing) stopPlay();
  startPlay();
}
/* "+" selects the new last slot; the chain is the only scroller, so nudge just its scrollTop */
function scrollSlotIntoView(){
  var chain=$("studio-chain"), cell=chain && chain.children[T.slot];
  if(!chain || !cell) return;
  var cr=chain.getBoundingClientRect(), r=cell.getBoundingClientRect();
  if(r.top<cr.top) chain.scrollTop-=cr.top-r.top;
  else if(r.bottom>cr.bottom) chain.scrollTop+=r.bottom-cr.bottom;
}
/* the slot sheet's letters (12.13): one tap sets the slot, closes the sheet and counts as the tour's letter change.
   The player reads the live chain, so a letter picked while the song plays is heard from the next bar. */
function slotLetter(p){
  if(!T.song || !T.loaded) return;
  T.song=SONGS.setSlot(T.song,T.slot,p);
  touch();
  T.sheet="";
  renderSong(); renderNav(); renderTabs(); renderSheet();
  scrollSlotIntoView();
  tourEvent("slot");
}
function addSongSlot(){
  if(!T.loaded || !T.song) return;
  var s=T.song.song||[0];
  if(s.length>=SONGS.SONG_MAX){ toast(tr("studio.song.full")); return; }
  T.song=SONGS.addSlot(T.song,T.pat);
  T.slot=T.song.song.length-1;
  T.focus=T.slot;
  touch();
  renderSong(); renderNav(); renderTabs();
  scrollSlotIntoView();
}
/* the slot sheet's three edits (12.12): insert the slot's letter before it, copy it after it, or delete it. All three
   close the sheet and save like any other slot edit; the player reads the live chain, so they work while it plays. */
function insertSlotAt(i,p,sel){
  if(!T.loaded || !T.song) return;
  var s=T.song.song||[0];
  if(s.length>=SONGS.SONG_MAX){ toast(tr("studio.song.full")); return; }
  T.song=SONGS.insertSlot(T.song,i,p);
  mapSongEdit("insert",i);
  T.slot=Math.max(0,Math.min(T.song.song.length-1,sel));
  T.focus=T.slot;
  touch();
  T.sheet="";
  renderSong(); renderNav(); renderTabs(); renderSheet();
  scrollSlotIntoView();
}
function insertSlotBefore(){
  var s=(T.song&&T.song.song)||[0], i=T.slot;
  if(i<0 || i>=s.length) return;
  insertSlotAt(i,s[i],i);
}
function copySlotAfter(){
  var s=(T.song&&T.song.song)||[0], i=T.slot;
  if(i<0 || i>=s.length) return;
  insertSlotAt(i+1,s[i],i+1);
}
function deleteSlotAt(){
  var s=(T.song&&T.song.song)||[0], i=T.slot;
  if(!T.loaded || !T.song || s.length<=1 || i<0 || i>=s.length) return;
  T.song=SONGS.removeSlot(T.song,i);
  mapSongEdit("delete",i);
  T.slot=Math.min(i,T.song.song.length-1);
  T.focus=T.slot;
  touch();
  T.sheet="";
  renderSong(); renderNav(); renderTabs(); renderSheet();
  scrollSlotIntoView();
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
function bindRepeatAction(btn,act){
  var wait=0, every=0;
  function end(){ if(wait){ clearTimeout(wait); wait=0; } if(every){ clearInterval(every); every=0; } }
  btn.addEventListener("pointerdown",function(e){
    e.preventDefault();
    try{ btn.setPointerCapture(e.pointerId); }catch(x){}
    end();
    act();
    wait=setTimeout(function(){ every=setInterval(act,80); },400);
  });
  ["pointerup","pointercancel","lostpointercapture"].forEach(function(t){ btn.addEventListener(t,end); });
  T.repeats.push(end);
}
function bindRepeat(btn,delta){
  bindRepeatAction(btn,function(){ if(T.song) setBpm(T.song.bpm+delta); });
}
function moveFocus(key){
  var i=T.focus, s, tr;
  if(T.screen==="mixer"){
    if(key==="ArrowUp") i=Math.max(0,i-1);
    else if(key==="ArrowDown") i=Math.min(MIX_TRACKS.length-1,i+1);
    else if(key==="ArrowLeft"||key==="ArrowRight"){
      tr=trackById(MIX_TRACKS[Math.max(0,Math.min(MIX_TRACKS.length-1,i))]);
      if(tr) setTrackVol(tr.id,(tr.vol||0)+(key==="ArrowRight"?0.1:-0.1));
      T.kb=true;
      return;
    }
    T.focus=i;
    T.kb=true;
    renderMixer();
    return;
  }
  if(T.screen==="chords"){
    i=i===0 ? 1 : 0;
    if(i!==0 && i!==1) i=0;
  } else if(T.screen==="song"){
    s=(T.song&&T.song.song)||[0];
    if(key==="ArrowLeft") i=Math.max(0,i-1);
    else if(key==="ArrowRight") i=Math.min(s.length-1,i+1);
    else if(key==="ArrowUp") i=Math.max(0,i-4);
    else i=Math.min(s.length-1,i+4);
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
  else if(T.screen==="mixer") toggleMute(MIX_TRACKS[Math.max(0,Math.min(MIX_TRACKS.length-1,T.focus))]);
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
    else if(T.sheet==="demo") demoTape();
    else if(T.sheet==="copyask") confirmCopy();
    else if(T.sheet==="slot") insertSlotBefore();   /* A is the sheet's first row, like the other questions' 确认 */
    else if(!T.sheet) tapFocus();
  }
  else if(key==="Enter"){ if(e.repeat) return; togglePlay(); }
  else if(key==="Shift"){ if(e.repeat) return; if(!T.sheet && T.screen==="drums") nextDrum(); }
  else if(key==="z"||key==="Z"){ if(e.repeat) return; if(T.sheet) closeSheet(); else if(T.tour) tourEnd(true); }
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
