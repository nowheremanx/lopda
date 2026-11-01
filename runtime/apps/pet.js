/*
 * Lo-PDA runtime: the built-in pet 宠物 / Pet (briefs/pet/design.md; decisions.md section 37).
 * The rules live in petsim.js (window.LopdaPet) and the art in petart.js (window.LopdaPetArt); this file owns the
 * screen, the keys, the timers and the storage. One IIFE, ES5 style, talks to the rest only through window.LP.
 *
 * Screen: the room is a 162 x 120 canvas at 2 CSS pixels a pixel (324 x 240), then five 44 px icon targets and the
 * soft keys; 328 px of content, so it fits the 331 x 359 LCD with nothing to scroll. Everything on the canvas is
 * putImageData from a Uint8Array of tone indices: never drawImage after putImageData (Safari swaps red and blue).
 * Sub-screens (food, the play pack list, the START menu, look, box, word, the naming panel) open over the room at the
 * same 324 x 240, on paper with ink text. A play pack runs in the room canvas at 20 fps only while its screen is
 * visible (50 ms fixed ticks in petplay.js), from the same putImageData buffer as the room; leaving, pausing or HOME
 * stops it.
 *
 * Storage: data/users/local/pet (design.md 8 plus petsim's lastMeal, awakeHunger, awakeJoy, today, seenUse and aiUse;
 * boxSeen and today's pick/outing phase/remaining/hour/ai/shelf flag, and outSouv — the souvenir a background trip is
 * bringing in — and data/users/local/pet/souvenirs/<id> {name:{zh,en}, line:{zh,en}, px, at, ai, day}. The pet's
 * `name` is fixed at the hatch and `shelf` is the one souvenir shown on the room's shelf (or null). A failed read is
 * not "no pet": the program then keeps an in-memory pet and never writes an egg over a save it could not read (the
 * status bar says 未存档).
 *
 * The day: on the first open of a day (and after hatching) the program asks the read-only summaries for the day's one
 * pick: an upcoming calendar date (a count of days, never a name), the word book, a book not opened for a week,
 * or waiting film. LopdaPet.pickOfDay chooses (about half the days nothing); the pet holds the matching prop
 * and its row lights. START opens the small menu (the pick's own name / 状态 / 纪念品箱; "今天没有" when empty);
 * A on that row opens the summary's own program, then the pick is used for the day. The AI souvenir, when the line is on, is one call at the day's outing (30 s cap) and silently
 * falls back to the built-in table.
 *
 * From boot: the pet lives without its screen. On storage ready, whenever the home screen draws its icon and on resume,
 * it catches up, rolls the day, decides the pick and the outing and, once the outing hour has come, makes the day's one
 * AI call and saves the souvenir. No sound, toast, popup or animation happens outside the pet's screen; growth days
 * (openDay) and the ~8 s hatch still count only time on the screen.
 */
(function(){
"use strict";

var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, I18N=LP.I18N;
var Pet=window.LopdaPet, Art=window.LopdaPetArt, Play=window.LopdaPetPlay, PS=window.LopdaPetState, L=window.LopdaLunar;
var Souv=window.LopdaPetSouv;

var HOUR=3600000, DAY=86400000, SCALE=2;
var ROOM_W=162, ROOM_H=120;
var ICON_NAMES=["food", "play", "wash", "light", "call"];
var TONE_OF={k:0,d:1,m:2,p:3, "0":0, "1":1, "2":2, "3":3};
var ICON_ROWS=[
  "................",
  ".......00.......",
  "......0330......",
  "...0000000000...",
  "...0333333330...",
  "..003333333300..",
  "..033003300330..",
  "..033003300330..",
  "..033333333330..",
  "..030333330330..",
  "..033333333330..",
  "...0333333330...",
  "...0000000000...",
  "....0.0..0.0....",
  "................",
  "................"];
/* a short, original four-bar hatch tune: p1 the tune, p2 a third below, tri the floor */
var JINGLE={bpm:180, p1:"o6 l8 e g c8 > c < b g e c4", p2:"o5 l8 c e g8 e d c4", tri:"o4 l4 c g c g c"};
var SWEEP_MS=1000, EGG_MS=8000, EGG_CRACK1=3000, EGG_CRACK2=6000, HATCH_ANIM_MS=1500, OUT_MS=20000, HOLD_MS=600;
/* Where it lies at night, where it stands by day, and the floor spot in front of the bowl all come from the
   species pack's room (petart.js `spots`), so a second room can move them without touching this file. Every
   bed <-> floor move walks the same L (petsim.pathPoint), at two room frames a second, a few seconds across. */
function roomNow(){ var p=packOf(P.save); return (p&&p.room)||Art.PACKS.chip.room; }
function spotAt(name){
  var p=Art.spotPoint ? Art.spotPoint(roomNow(),name) : null;
  return p || {x:0,y:0};
}
function useSpotAt(kind,fallback){
  var p=Art.useSpot ? Art.useSpot(roomNow(),kind,fallback) : null;
  return p || spotAt(fallback);
}
var WALK_MS_PER_PX=30, AWAKE_TICKS=240;                 /* 2 minutes of the 500 ms room tick */
/* the small puff of an angry wake: drawn beside the head for the 1.5 s of the grumble */
var PUFF=[".mm..","mppm.",".mm.."];
var NAME_EMOJI=/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

var P={
  save:null, loaded:false, nostore:false, readTried:false, readFailed:false, inView:false,
  refs:null, souv:[], usage:null, resumeOuting:false,
  sub:null, sel:0, menuSel:0, frame:0,
  anim:0, hold:0, roomHold:0, holdFired:false,
  eggMs:0, hatching:null, action:null, actionUntil:0, heartUntil:0,
  washUntil:0, washStart:0, flash:null, outing:null, foodSel:0, boxPage:0, boxSel:0, boxItem:null, boxAsk:null,
  naming:null, task:null, at:null, feeds:[], awakeLeft:0, puffUntil:0, pendingNeed:null, lightReturn:false,
  ignoreAUp:false,
  wasAsleep:null, lastScene:null, flashSeq:0,
  game:null, gameSel:0, gameTimer:0, gameLabel:"", gameHeld:{left:false,right:false,a:false}, gamePress:{left:false,right:false,a:false}, gameTouch:null,
  gameSeed:null,
  moodClearUntil:0,
  idle:null, idleRng:null,
  confirmStage:0, panelKey:"",
  saveTimer:0, lastWants:null, bringing:false,
  pickSeq:0, wordWord:"", wordMeaning:null, wordBusy:false, aiJob:null,
  weatherOverride:null, ambName:null,
  bgTimer:0, bgRun:false, outResolving:null, homeSig:"",
  restoring:false, restoreTimer:0, missing:{}
};
var ctx=null, buf=null, im=null, iconCvs={}, iconBuilt=false;

function now(){ return Date.now(); }
function tz(){ return -new Date().getTimezoneOffset(); }
function isOpen(){ var v=$("v-pet"); return !!v && !v.hidden; }
function isEgg(){ return !!(P.save && P.save.stage==="egg"); }
function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function beep(name){ if(!document.hidden && isOpen() && !inBedSleep()) LP.sfx(name); }
function localDate(t){ return new Date(t+tz()*60000); }
function dayKey(t){ return Pet.dayKey(t,tz()); }
function hourNow(){ return Pet.hourOf(now(),tz()); }
function shift(grid,dy){
  if(!grid || !dy) return grid;
  var h=grid.length, w=String(grid[0]).length, blank="", out=[], y;
  for(var c=0;c<w;c++) blank+=".";
  for(y=0;y<h;y++){
    if(dy>0) out.push(y<dy ? blank : grid[y-dy]);
    else out.push(y-dy>=h ? blank : grid[y-dy]);
  }
  return out;
}
/* a one-pixel sideways shift: the head shake uses the same sprite, never a new drawing */
function shiftX(grid,dx){
  if(!grid || !dx) return grid;
  var w=String(grid[0]).length, blank="", out=[], r;
  for(var c=0;c<w;c++) blank+=".";
  /* move by dx columns, keeping the width: pad on the side it moves away from and cut the other side */
  for(r=0;r<grid.length;r++) out.push(dx>0 ? (blank.slice(0,dx)+grid[r]).slice(0,w) : (String(grid[r]).slice(-dx)+blank).slice(0,w));
  return out;
}
/* ---------- tones and canvases ---------- */
function rgbOf(hex){
  var h=String(hex).replace("#","");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function initCanvas(){
  var cv=$("pet-cv");
  if(!cv || ctx) return;
  ctx=cv.getContext("2d");
  buf=new Uint8Array(ROOM_W*ROOM_H);
  im=ctx.createImageData(ROOM_W,ROOM_H);
}
function paintRoomBuffer(){
  var d=im.data, tones=Art.TONES, rgb=[], i, o, t;
  for(i=0;i<4;i++) rgb.push(rgbOf(tones[i]));
  for(i=0;i<ROOM_W*ROOM_H;i++){
    t=buf[i]|0; if(t<0 || t>3) t=3;
    o=i*4; d[o]=rgb[t][0]; d[o+1]=rgb[t][1]; d[o+2]=rgb[t][2]; d[o+3]=255;
  }
  ctx.putImageData(im,0,0);
}
/* an icon or a souvenir picture: every pixel is paper or one of the four tones, so a canvas holds no stray colours. */
function paintGrid(cv,grid,tone,bg){
  var g=grid||[], w=16, h=16, r, c, line, ch, imd, d, rgb=[], i, t;
  if(g.length && String(g[0]).length===8){ w=8; h=8; }
  if(g.length) h=g.length;
  if(g.length) w=String(g[0]).length;
  cv.width=w; cv.height=h;
  var x=cv.getContext("2d");
  imd=x.createImageData(w,h); d=imd.data;
  for(i=0;i<4;i++) rgb.push(rgbOf(Art.TONES[i]));
  for(r=0;r<h;r++){
    line=String(g[r]||"");
    for(c=0;c<w;c++){
      ch=line.charAt(c);
      t=TONE_OF[ch];
      if(ch==="k" && tone!==undefined) t=tone;      /* the icon grids are all glyph: tone is the icon's state */
      if(t===undefined) t=(bg===undefined?3:bg);
      i=(r*w+c)*4;
      d[i]=rgb[t][0]; d[i+1]=rgb[t][1]; d[i+2]=rgb[t][2]; d[i+3]=255;
    }
  }
  x.putImageData(imd,0,0);
}
function paintSouvenir(cv,px){
  var rows=[], i, r;
  for(r=0;r<16;r++){
    var line="";
    for(i=0;i<16;i++){ var ch=String(px||"").charAt(r*16+i); line+=/[0-3]/.test(ch)?ch:"3"; }
    rows.push(line);
  }
  paintGrid(cv,rows,3,3);
}

/* ---------- the save ---------- */
function defaultSpecies(){
  var ids=Object.keys(Art.PACKS||{});
  return ids.length ? ids[0] : "";
}
function freshSave(){
  var t=now();
  /* marks and trait are rolled from a seed from the clock: a new egg, never the same pet by accident */
  var s=Pet.fresh(t, Pet.rng((t>>>0)^0x9e3779b9), defaultSpecies());
  s.boxSeen=0;
  return s;
}
function normalize(save){
  if(!save || typeof save!=="object") return null;
  if(!save.species) save.species=defaultSpecies();
  if(!save.room){
    var sp=Art.PACKS[save.species];
    save.room=(sp && sp.room && sp.room.id) || save.species;
  }
  if(!save.marks || typeof save.marks!=="object") save.marks={ant:0,eye:0};
  if(save.name===undefined) save.name=null;
  if(save.shelf===undefined) save.shelf=null;
  if(save.light===undefined) save.light=true;
  if(save.boxSeen==null) save.boxSeen=0;
  if(!save.today || typeof save.today!=="object") save.today={day:null,shown:null,picked:false,pick:null,used:false,rewarded:false,ai:false,out:null,back:false,snacks:0,pats:0,played:0,burp:false,shelf:false};
  var td=save.today;
  if(td.picked===undefined) td.picked=!!td.pick;
  if(td.pick===undefined) td.pick=null;
  if(td.used===undefined) td.used=false;
  if(td.rewarded===undefined) td.rewarded=false;
  if(td.ai===undefined) td.ai=false;
  if(td.shownYesterday===undefined) td.shownYesterday=null;
  if(td.outSouv===undefined) td.outSouv=null;
  if(td.outHour===undefined) td.outHour=null;
  if(td.shelf===undefined) td.shelf=false;
  return save;
}
function packOf(save){
  var sp=save && save.species;
  return Art.PACKS[sp] || Art.PACKS[defaultSpecies()];
}
function saveSoon(){
  if(P.restoring || P.nostore || !P.refs || !P.save) return;
  if(P.saveTimer) return;
  P.saveTimer=setTimeout(function(){ P.saveTimer=0; saveNow(); },1000);
}
function saveNow(){
  if(P.saveTimer){ clearTimeout(P.saveTimer); P.saveTimer=0; }
  if(P.restoring || P.nostore || !P.refs || !P.save) return;
  var data=JSON.parse(JSON.stringify(P.save));
  P.refs.doc.set(data).catch(function(){ P.nostore=true; LP.setStatus("status.unsaved"); });
}
/* A failed plantedAt write can leave a grow item on the shelf with no start; begin now rather than lose it. */
function repairShelf(){
  var s=P.save;
  if(!s || !s.shelf) return;
  var it=findSouv(s.shelf);
  if(!it || !it.state || !stateHasGrow(it.state) || it.plantedAt!=null) return;
  it.plantedAt=now();
  if(P.nostore || !P.refs) return;
  P.refs.souv.doc(it.id).update({plantedAt:it.plantedAt}).catch(function(){});
}
function readUsage(){
  if(!S.db) return Promise.resolve(null);
  return S.db.doc("data/users/local/usage").get().then(function(sn){
    var d=sn.exists ? LP.own(sn.data()) : null;
    P.usage=d && d.counts && typeof d.counts==="object" ? d.counts : null;
    return P.usage;
  },function(){ return null; });
}
function backfillForm(){
  if(!P.save || P.save.stage!=="adult" || P.save.form || !P.usage) return;
  P.save.form=Pet.adultForm(P.usage,P.save.species);
  saveSoon();
}
function ensurePet(){
  if(P.save || !P.loaded || P.restoring) return false;
  P.save=freshSave();
  saveNow();
  return true;
}
function loadStorage(){
  if(P.readTried || !S.db) return;
  P.readTried=true;
  var base=S.db.doc("data/users/local/pet"), bad=false;
  P.refs={doc:base, souv:base.collection("souvenirs")};
  var docP=base.get().then(function(sn){
    if(!sn.exists) return;
    var d=normalize(LP.own(sn.data()));
    if(d){ P.save=d; } else { bad=true; }
  },function(){ bad=true; });
  var souvP=P.refs.souv.get().then(function(q){
    var list=[];
    q.docs.forEach(function(doc){
      var o=LP.own(doc.data())||{};
      var name=storedText(o.name), line=storedText(o.line);
      if(!name || !line || typeof o.px!=="string" || o.px.length!==256) return;
      var st=(PS && PS.validate) ? PS.validate(o.state,o.px) : null;
      var it={id:doc.id, name:name, line:line, px:o.px, at:+o.at||0, ai:!!o.ai, day:o.day?String(o.day):""};
      var ref=souvEntry(o.ref) ? o.ref : null;
      if(ref) it.ref=ref;
      var wh=souvWhere(o.where);
      if(wh) it.where=wh;
      if(!it.ref && !it.ai){
        var oldRef=souvRefForName(name);
        if(oldRef) it.ref=oldRef;
      }
      if(st) it.state=st;
      if(isFinite(+o.grownMs) && +o.grownMs>0) it.grownMs=+o.grownMs;
      if(isFinite(+o.plantedAt) && +o.plantedAt>0) it.plantedAt=+o.plantedAt;
      list.push(it);
    });
    list.sort(function(a,b){ return (a.at||0)-(b.at||0); });
    P.souv=list;
  },function(){ bad=true; });
  Promise.all([docP,souvP]).then(function(){
    P.loaded=true;
    if(bad){
      P.readFailed=true; P.nostore=true;
      LP.setStatus("status.unsaved");
    } else if(P.save){
      P.nostore=false;
      repairShelf();
    }
    readUsage().then(function(){
      backfillForm();
      if(isOpen()){ ensurePet(); refreshTime(); maybeNamePrompt(); renderKeys(); render(); }
      else { backgroundDay(); }
      homeMaybeRender();
    });
  });
}

/* ---------- catching up and the day ---------- */
function flash(i){ if(!inBedSleep()){ P.flashSeq++; P.flash={i:i,left:6}; } }
function wantsOf(){ return P.save ? Pet.wants(P.save) : null; }
/* catch-up events never flash or sound over a sleeping pet: a need that arose during a night is kept and shown
   once when it gets up. A threshold crossed while it was awake is one real change, so one flash. */
function handleEvents(events){
  var sleeping=inBedSleep();
  (events||[]).forEach(function(e){
    if(e==="travel") beep("err");
    else if(e==="hungry"){
      if(sleeping) P.pendingNeed=P.pendingNeed||"food";
      else beep("coin");
    } else if(e==="poop"){
      if(sleeping) P.pendingNeed=P.pendingNeed||"wash";
      else beep("coin");
    } else if(e==="woke" && !sleeping && !P.task && !P.outing){
      P.at=useSpotAt("sleep","sleep");
      startChore("wake","walkRug");
    }
  });
  if(sleeping) noteWants();
  else announceNeed(wantsOf());
}
function refreshTime(){
  if(!P.save) return;
  if(P.save.stage==="egg"){
    /* an egg is not left alone for days: it does not age, travel or go out before it hatches */
    P.save.travel=false;
    if(P.save.today && P.save.today.back) P.save.today.back=false;
    P.save.last=now();
    P.save=Pet.openDay(P.save,dayKey(now()),P.usage||null);
    saveSoon();
    return;
  }
  var r=Pet.catchUp(P.save,now(),{tz:tz()});
  P.save=r.save;
  P.save=Pet.openDay(P.save,dayKey(now()),P.usage||null);
  if(P.save.stage==="adult" && !P.save.form && P.usage) P.save.form=Pet.adultForm(P.usage,P.save.species);
  handleEvents(r.events);
  saveSoon();
  checkOuting();
  buildPick();
}

/* ---------- the day without the screen ---------- */
/* On storage ready, whenever the home screen asks for the icon and on resume, the pet catches up, rolls the day,
   decides its pick and its outing, and makes the day's one AI call at the outing hour. No sound, no toast, no
   animation: only a few promises and a save. Growth days stay with the screen (openDay is not called here). */
function dayWork(){
  if(P.restoring || P.nostore || P.readFailed) return Promise.resolve();
  if(!P.save) return Promise.resolve();
  if(P.save.stage==="egg"){ P.save.last=now(); saveSoon(); return Promise.resolve(); }
  var r=Pet.catchUp(P.save,now(),{tz:tz()});
  P.save=r.save;
  if(P.save.stage==="adult" && !P.save.form && P.usage) P.save.form=Pet.adultForm(P.usage,P.save.species);
  noteWants();
  saveSoon();
  buildPick();
  return backgroundOuting();
}
function backgroundDay(){
  if(P.restoring || !P.loaded || !P.save || P.nostore || P.readFailed || isOpen() || document.hidden) return Promise.resolve();
  if(P.bgRun) return P.bgRun;
  P.bgRun=Promise.resolve().then(dayWork).then(function(){
    P.bgRun=null;
    homeMaybeRender();
  },function(){
    P.bgRun=null;
  });
  return P.bgRun;
}
/* The home screen calls icon(): that is the moment the pet notices it is being looked at and runs its day. */
function scheduleBackground(){
  if(P.bgTimer || P.bgRun || !$("v-home") || $("v-home").hidden) return;
  P.bgTimer=setTimeout(function(){ P.bgTimer=0; backgroundDay(); },0);
}

/* ---------- the pick of the day (design.md 6) ---------- */
var USE_KEYS=["reader","dict","notes","darkroom"];
function activePick(){
  var td=P.save && P.save.today;
  return td && !td.used && td.pick && td.pick.kind ? td.pick : null;
}
function dayNumberNow(){
  try{
    var d=localDate(now());
    if(L && L.dayNumber) return L.dayNumber(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());
  }catch(e){}
  return null;
}
/* The usage counts are re-read when the screen opens. Growth since the last look makes it a little happier, once a
   day (today.rewarded), and seenUse then moves to the fresh counts. Never a message. */
function rewardUse(){
  var s=P.save, td=s && s.today, counts=P.usage, seen=s && s.seenUse, grew=false, i;
  if(!s || !td || !counts || s.stage==="egg") return;
  if(!td.rewarded && seen) for(i=0;i<USE_KEYS.length;i++) if((+counts[USE_KEYS[i]]||0)>(+seen[USE_KEYS[i]]||0)) grew=true;
  if(grew){
    var sp=Pet.SPECIES[s.species]||Pet.SPECIES.chip;
    s.joy=Math.min(sp.joyMax,(+s.joy||0)+1);
    td.rewarded=true;
  }
  s.seenUse={};
  for(i=0;i<USE_KEYS.length;i++) s.seenUse[USE_KEYS[i]]=+counts[USE_KEYS[i]]||0;
}
function usageArrived(){
  if(!P.save || !isOpen()) return;
  rewardUse();
  saveSoon();
  if(P.save.today && !P.save.today.picked) buildPick();
}
/* readUsage is the only way the pet learns what happened in other programs; call it on every enter/resume */
function refreshUsage(){
  return readUsage().then(function(){ usageArrived(); },function(){});
}
/* One candidate per source, each guarded: a missing or broken summary just drops its candidate. */
function pickCandidates(){
  var list=[], t=now(), key=dayKey(t);
  try{
    if(LP.calendar && typeof LP.calendar.upcoming==="function"){
      var up=LP.calendar.upcoming(7)||[];
      if(up.length && typeof up[0].in==="number" && up[0].in>=0){
        var todayN=dayNumberNow();
        if(todayN!==null) list.push({kind:"date", urgency:up[0].in<=1?0:up[0].in, in:up[0].in, day:todayN+up[0].in});
      }
    }
  }catch(e){}
  try{
    if(LP.dict && typeof LP.dict.bookSummary==="function" && typeof LP.dict.pickWord==="function"){
      var bs=LP.dict.bookSummary();
      if(bs && bs.n>0){
        var word=LP.dict.pickWord((Pet.daySeed(P.save.born,key)^0x51ed270b)>>>0);
        if(word) list.push({kind:"word", urgency:2, word:String(word)});
      }
    }
  }catch(e){}
  try{
    if(LP.reader && typeof LP.reader.current==="function"){
      var cur=LP.reader.current();
      if(cur && cur.id && (+cur.opened||0)<=t-7*DAY) list.push({kind:"book", urgency:3, id:String(cur.id)});
    }
  }catch(e){}
  return list;
}
function cleanPick(o){
  if(!o || !o.kind) return null;
  var f={kind:o.kind};
  if(typeof o.in==="number") f.in=o.in;
  if(typeof o.day==="number") f.day=o.day;
  if(o.id!=null) f.id=String(o.id);
  if(o.word) f.word=String(o.word);
  return f;
}
/* The film box is the one asynchronous summary; the others are in memory. The decision waits for all of them. */
function buildPick(){
  var save=P.save;
  if(!save || save.stage==="egg") return;
  var td=save.today;
  if(!td) return;
  if(td.picked) return;
  var seq=++P.pickSeq, list=pickCandidates(), film=null;
  try{
    if(LP.darkroom && typeof LP.darkroom.summary==="function"){
      film=Promise.resolve(LP.darkroom.summary()).then(function(s){
        if(s && +s.n>0) list.push({kind:"film", urgency:4});
      },function(){});
    }
  }catch(e){ film=null; }
  Promise.resolve(film).then(function(){
    if(seq!==P.pickSeq || P.restoring) return;
    var cur=P.save && P.save.today;
    /* a care action clones the save while the film summary is in flight: decide against today's new object, not the
       captured one, so the pick is not silently lost */
    if(!cur || cur.picked || cur.day!==td.day) return;
    cur.picked=true;
    var pick=Pet.pickOfDay(list, cur.shownYesterday||null, Pet.daySeed(P.save.born, cur.day));
    cur.pick=cleanPick(pick);
    cur.shown=cur.pick ? cur.pick.kind : null;
    cur.used=false;
    saveSoon();
    if(isOpen()){ renderKeys(); render(); }
    homeMaybeRender();
  });
}
function finishPick(){
  if(!P.save || !P.save.today) return;
  P.save.today.used=true;
  saveNow(); renderKeys(); render();
}

/* ---------- the day's outing ---------- */
/* Souvenirs are stored in both languages. A document written before the pair (or a built-in entry) may still be one
   string; it is shown as it is, in either language, rather than turned into "[object Object]". */
function textPair(v){
  if(!v || typeof v!=="string" && (typeof v!=="object" || Array.isArray(v))) return null;
  if(typeof v==="string") return null;
  var zh=typeof v.zh==="string" ? v.zh : "", en=typeof v.en==="string" ? v.en : "";
  if(!zh && !en) return null;
  return {zh:zh||en, en:en||zh};
}
function storedText(v){
  var p=textPair(v);
  if(p) return p;
  return typeof v==="string" && v ? v : null;
}
/* The catalogue entry behind a document's ref, or null when the id is missing or unknown (an id is never reused,
   so an unknown one means a damaged or hand-edited document). */
function souvEntry(id){
  if(typeof id!=="string" || !id || !Souv || typeof Souv.byId!=="function") return null;
  return Souv.byId(id);
}
/* A stored AI where is only shown when it is still a pair of two strings; anything else is ignored. */
function souvWhere(v){
  if(!v || typeof v!=="object" || Array.isArray(v)) return null;
  if(typeof v.zh!=="string" || typeof v.en!=="string" || !v.zh || !v.en) return null;
  return {zh:v.zh, en:v.en};
}
/* Old built-in documents have no ref: their name, in either language, is matched back to the catalogue. The table
   is built from both language tables, not only the one on screen, so a document written in the other language
   still finds its place. It stays in memory; the document is never written again. */
var SOUV_NAMES=null;
function souvNameIndex(){
  if(SOUV_NAMES) return SOUV_NAMES;
  var idx={}, str=I18N.STR||{}, table=(Souv && Souv.CATALOG)||[];
  table.forEach(function(e){
    ["zh","en"].forEach(function(lang){
      var n=str[lang] && str[lang]["pet.souv."+e.id];
      if(typeof n==="string" && n) idx[n]=e.id;
    });
  });
  SOUV_NAMES=idx;
  return idx;
}
function souvRefForName(name){
  var idx=souvNameIndex();
  if(typeof name==="string") return idx[name] || null;
  if(!name || typeof name!=="object") return null;
  if(typeof name.zh==="string" && idx[name.zh]) return idx[name.zh];
  if(typeof name.en==="string" && idx[name.en]) return idx[name.en];
  return null;
}
/* The card's one origin line, under the date. A postcard always reads as a trip; an AI find without a place
   still says it was found while out. Anything else has no line. */
function souvFrom(s){
  if(!s) return "";
  if(s.ref){
    if(s.ref==="post") return tr("pet.from.trip");
    var e=souvEntry(s.ref);
    if(e && e.where) return tr("pet.from.found",{where:tr("pet.where."+e.where)});
    return "";
  }
  if(s.ai){
    if(s.where){
      var w=s.where[I18N.lang] || s.where.zh || s.where.en || "";
      if(w) return tr("pet.from.out",{where:w});
    }
    return tr("pet.from.outAny");
  }
  return "";
}
function souvText(s,field){
  var v=s && s[field], p=textPair(v);
  if(p) return String(p[I18N.lang] || p.zh || p.en || "");
  return String(v==null ? "" : v);
}
function langText(lang,key,fallback){
  var table=I18N.STR && I18N.STR[lang];
  var s=table ? table[key] : null;
  return s==null ? fallback : s;
}
function recentNames(){
  return P.souv.slice(Math.max(0,P.souv.length-5)).map(function(s){ return souvText(s,"name"); });
}
/* petsim.builtinSouvenir avoids table entries whose `name` is recent; pack entries carry only an id, so give
   each candidate its localized names before choosing (the id stays for the strings and the picture). */
function stateHasGrow(state){
  var layers=(state && state.layers)||[];
  for(var i=0;i<layers.length;i++) if(layers[i] && layers[i].kind==="grow") return true;
  return false;
}
/* The pack writes grids; the document writes the 256-character px strings the rest of the pet uses. */
function packState(st,firstPx){
  if(!PS || !PS.validate || !st || st.v!==1 || !Array.isArray(st.layers)) return null;
  var out={v:1,layers:[]}, i, j, l, r, stages, rules;
  for(i=0;i<st.layers.length;i++){
    l=st.layers[i];
    if(!l || typeof l!=="object") continue;
    if(l.kind==="grow" && Array.isArray(l.stages)){
      stages=[];
      for(j=0;j<l.stages.length;j++){
        var x=l.stages[j];
        if(!x || !x.grid) continue;
        stages.push({id:x.id,px:pxFromGrid(x.grid),hold:x.hold});
      }
      var gl={kind:"grow",stages:stages};
      if(l.when) gl.when=l.when;
      out.layers.push(gl);
    } else if(l.kind==="match" && Array.isArray(l.rules)){
      rules=[];
      for(j=0;j<l.rules.length;j++){
        r=l.rules[j];
        if(!r || !r.grid) continue;
        var rr={px:pxFromGrid(r.grid)};
        if(r.id) rr.id=r.id;
        if(r.when) rr.when=r.when;
        rules.push(rr);
      }
      var ml={kind:"match",rules:rules};
      if(l.when) ml.when=l.when;
      out.layers.push(ml);
    }
  }
  return PS.validate(out, firstPx);
}
function souvenirTable(pack){
  return ((pack && pack.souvenirs)||[]).map(function(e){
    var t=dirText(e,e.id);
    var first=pxFromGrid(e.grid);
    return {id:e.id, season:e.season, where:e.where, grid:e.grid, px:first, name:t.name, line:t.line, state:packState(e.state,first)};
  });
}
function dirText(entry,id){
  var key="pet.souv."+id, lineKey=key+".line";
  var fall = entry && entry.id ? entry.id : id;
  var name={
    zh:langText("zh",key,entry && typeof entry.name==="string" ? entry.name : fall),
    en:langText("en",key,entry && typeof entry.name==="string" ? entry.name : fall)
  };
  var line={
    zh:langText("zh",lineKey,entry && typeof entry.line==="string" ? entry.line : ""),
    en:langText("en",lineKey,entry && typeof entry.line==="string" ? entry.line : "")
  };
  return {name:name, line:line};
}
function pxFromGrid(grid){
  var out="", r, c;
  for(r=0;r<16;r++){
    var line=String((grid||{})[r]||"");
    for(c=0;c<16;c++){ var t=TONE_OF[line.charAt(c)]; out+=t===undefined?"3":String(t); }
  }
  return out;
}
function makeSouvenir(entry){
  var id=(entry && entry.id) || "souv";
  var pairName=textPair(entry && entry.name), pairLine=textPair(entry && entry.line);
  var txt=pairName && pairLine ? {name:pairName, line:pairLine} : dirText(entry,id);
  var s={
    id:LP.uid(), name:txt.name, line:txt.line,
    px:entry && entry.px ? String(entry.px) : pxFromGrid(entry && entry.grid),
    at:now(), ai:!!(entry && entry.ai),
    day:entry && entry.day ? String(entry.day) : dayKey(now())
  };
  if(s.ai){
    var wh=souvWhere(entry && entry.where);
    if(wh) s.where=wh;
  } else if(entry && souvEntry(entry.id)){
    s.ref=entry.id;
  }
  if(entry && entry.state){ s.state=entry.state; s.grownMs=0; }
  return s;
}
function pushSouvenir(s){
  if(P.restoring) return;
  P.souv.push(s);
  P.souv.sort(function(a,b){ return (a.at||0)-(b.at||0); });
  homeMaybeRender();
}
function findSouv(id){
  for(var i=0;i<P.souv.length;i++) if(P.souv[i].id===id) return P.souv[i];
  return null;
}
function souvForDay(day){
  for(var i=P.souv.length-1;i>=0;i--) if(P.souv[i].day && P.souv[i].day===day) return P.souv[i];
  return null;
}
/* The day's outing is on its way back and the walk-back is left in today for the next visit. souvId is the souvenir
   it brings, or null for an empty-handed outing; both write out / back the same way. */
function markDayBack(hour,day,souvId){
  if(!P.save || !P.save.today || P.save.today.day!==day) return false;
  var td=P.save.today;
  td.out=hour; td.outHour=hour; td.back=false;
  td.outPhase="back"; td.outLeft=4; td.outSouv=souvId==null ? null : souvId;
  saveNow();
  return true;
}
/* The souvenir document can land while the pet save does not (quota, a closed page). The next run finds it by its day
   and only marks the day, instead of bringing a second one. */
function markDayWithSouvenir(s,hour,day){
  if(!s) return false;
  return markDayBack(hour,day,s.id);
}
/* Returns a promise for the saved souvenir, or null when the write failed. The souvenir enters the box only after
   the document landed: the programme marks the trip/outing done on that promise, so a failed write is retried on
   the next visit instead of losing the souvenir with the day marked complete. */
function addSouvenir(entry){
  if(P.restoring) return Promise.resolve(null);
  if(!entry) return Promise.resolve(null);
  var s=makeSouvenir(entry);
  var data={name:s.name, line:s.line, px:s.px, at:s.at, ai:s.ai, day:s.day};
  if(s.ref) data.ref=s.ref;
  if(s.where) data.where=s.where;
  if(s.state){ data.state=s.state; data.grownMs=0; }
  if(P.nostore || !P.refs){
    pushSouvenir(s);
    return Promise.resolve(s);
  }
  return P.refs.souv.doc(s.id).set(data).then(function(){
    if(P.restoring) return null;
    pushSouvenir(s);
    return s;
  },function(){
    LP.setStatus("status.unsaved");
    homeMaybeRender();
    return null;
  });
}
/* The refs the box remembers: only catalogue ids, so an AI find or an old unmatched document never counts as seen. */
function souvRefsOf(list){
  var out=[];
  (list||[]).forEach(function(s){ if(s && s.ref && souvEntry(s.ref)) out.push(s.ref); });
  return out;
}
/* An empty-handed outing: the weekly roll said no. This frozen marker is not a souvenir document, so finishOuting
   and decideOuting can tell it from a failed write without a new string or message. */
var EMPTY_SOUV=Object.freeze({empty:true});
function souvIsEmpty(v){ return !!(v && v.empty); }
function outingSouvenir(){
  var seed=(Pet.daySeed(P.save.born,dayKey(now()))^0x5bd1e995)>>>0;
  var r=Pet.rng(seed);
  /* the first draw of the day's own seed decides an empty day, so a reload (or a different box) never turns one
     into a souvenir day; only a yes draws the two pickSouvenir needs */
  if(r()>=Pet.souvenirLocalChance(P.save)) return EMPTY_SOUV;
  var table=souvenirTable(packOf(P.save));
  var opts={
    season:seasonOf(now()),
    seen:souvRefsOf(P.souv),
    recent:souvRefsOf(P.souv.slice(Math.max(0,P.souv.length-5))),
    newChance:1
  };
  return Pet.pickSouvenir(r,table,opts);
}
/* ---------- the AI souvenir (design.md 7; decisions.md section 34 stays: no PAD.ai for apps) ---------- */
var FORM_WORD={book:"bookish",walk:"walker",scholar:"scholar",diary:"diarist",monster:"little monster",plain:"plain"};
function formWord(){
  var s=P.save;
  if(!s) return "";
  return s.stage==="adult" ? (FORM_WORD[s.form]||"plain") : s.stage;
}
function seasonWord(){
  var s=seasonOf(now());
  return I18N.lang==="zh" ? ({spring:"春天",summer:"夏天",autumn:"秋天",winter:"冬天"})[s] : s;
}
/* 立冬 is term index 20; the pet wears the scarf on it and the next six days. 中秋 is lunar 8/15. */
function isLidong(t){
  try{
    var d=localDate(t);
    if(d.getUTCMonth()+1!==11 || !L || !L.termDay) return false;
    var day=L.termDay(d.getUTCFullYear(),20);
    return !!day && d.getUTCDate()>=day && d.getUTCDate()<=day+6;
  }catch(e){ return false; }
}
function lunarToday(t){
  try{
    var d=localDate(t);
    return L && L.fromSolar ? L.fromSolar(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate()) : null;
  }catch(e){ return null; }
}
function isMidAutumn(t){ var lu=lunarToday(t); return !!lu && !lu.leap && lu.month===8 && lu.day===15; }
/* Today's solar-term name, or 中秋; the calendar's holiday-cn files are not exposed to the pet, so nothing else. */
function termName(t){
  try{
    var d=localDate(t);
    if(L && L.term){
      var i=L.term(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());
      if(i>=0){ var names=tr("cal.terms").split("|"); if(names[i]) return names[i]; }
    }
    if(isMidAutumn(t)) return tr("cal.f.midautumn");
  }catch(e){}
  return "";
}
function copyCounts(c){
  var out={};
  if(c) for(var k in c) if(isFinite(+c[k])) out[k]=+c[k];
  return out;
}
function aiContext(){
  var s=P.save, t=now(), key=dayKey(t), zh=I18N.lang==="zh", word=null;
  try{
    if(LP.dict && typeof LP.dict.bookSummary==="function" && typeof LP.dict.pickWord==="function" && LP.dict.bookSummary().n>0)
      word=LP.dict.pickWord((Pet.daySeed(s.born,key)^0x2545f491)>>>0);
  }catch(e){}
  return {
    form:formWord(),
    age:Math.max(0,Math.floor((t-(+s.born||t))/DAY)),
    mood:Pet.moodWord(s.hunger,s.joy,zh),
    hour:hourNow(), season:seasonWord(), term:termName(t),
    categories:Pet.aiCategories(P.save.aiUse||{},P.usage||{}),
    recent:recentNames(), word:word||"", lang:I18N.lang
  };
}
function stripFence(text){
  var s=String(text==null?"":text).trim();
  if(s.slice(0,3)==="```"){
    var nl=s.indexOf("\n");
    s=nl>=0 ? s.slice(nl+1) : s.slice(3);
    var end=s.lastIndexOf("```");
    if(end>=0) s=s.slice(0,end);
  }
  return s.trim();
}
/* One call a day. today.ai is written first, so a reload never asks twice; the answer may arrive while the pet's
   screen is closed (the day's outing is decided in the background too). Anything other than a valid souvenir becomes
   the built-in one; leaving the screen stops a request that is still running. */
function aiAvailable(){
  if(P.restoring || P.nostore || P.readFailed) return false;
  var ai=LP.ai;
  return !!(ai && typeof ai.on==="function" && ai.on() && typeof ai.ask==="function");
}
function stopAiJob(){
  var job=P.aiJob;
  P.aiJob=null;
  if(!job) return;
  if(job.timer){ clearTimeout(job.timer); job.timer=0; }
  if(!job.done){
    job.done=true; job.result=null;
    if(job.stop) job.stop();
    if(job.resolve) job.resolve(null);
  }
}
/* The job stays in P.aiJob until P.aiJob=null by its caller, so the out phase can see the answer. */
function startAiJob(td){
  var ai=LP.ai;
  if(!td || td.ai || !aiAvailable()) return null;
  td.ai=true;
  saveNow();
  var job={done:false,result:null,timer:0,stop:null,resolve:null};
  job.promise=new Promise(function(resolve){ job.resolve=resolve; });
  P.aiJob=job;
  var finish=function(result){
    if(job.done) return;
    if(job.timer){ clearTimeout(job.timer); job.timer=0; }
    job.done=true; job.result=result;
    job.resolve(result);
    if(isOpen()) render();
  };
  var fire=function(){
    if(P.aiJob!==job || job.done || !P.save || !P.save.today || P.save.today.day!==td.day){ finish(null); return; }
    var prompt;
    try{ prompt=Pet.aiPrompt(aiContext()); }catch(e){ finish(null); return; }
    P.save.aiUse=copyCounts(P.usage);
    saveNow();
    var pr;
    try{ pr=ai.ask(prompt); }catch(e){ finish(null); return; }
    job.stop=function(){ try{ if(pr && typeof pr.stop==="function") pr.stop(); }catch(e){} };
    job.timer=setTimeout(function(){
      job.timer=0;
      if(job.stop) job.stop();
      finish(null);
    },30000);
    Promise.resolve(pr).then(function(text){
      if(job.done) return;
      var v=null;
      try{ v=Pet.validateSouvenir(stripFence(text)); }catch(e){ v=null; }
      finish(v ? {name:v.name, line:v.line, px:v.px, ai:true, where:v.where} : null);
    },function(){ finish(null); });
  };
  /* a fresh usage read, so the categories are what happened since the last AI call, not boot */
  readUsage().then(fire, fire);
  return job;
}
function beginAiSouvenir(){
  startAiJob(P.save && P.save.today);
}
/* The outing's phase lives in today so leaving or reloading during the ~20 s does not eat the day's souvenir:
   `outPhase`/`outLeft`/`outHour` are resumed on the next visit; `out`/`back` are written only once the souvenir
   document has landed. `outSouv` names the souvenir a background trip is bringing in. */
function persistOuting(){
  if(!P.save || !P.save.today) return;
  if(P.outing){
    P.save.today.outPhase=P.outing.phase;
    P.save.today.outLeft=P.outing.left;
    if(P.outing.hour!=null) P.save.today.outHour=P.outing.hour;
  }
}
function startOuting(hour){
  if(P.restoring || P.nostore || P.readFailed) return;
  if(!P.save) return;
  var had=souvForDay(dayKey(now()));
  if(had){
    if(markDayWithSouvenir(had,hour,dayKey(now())) && !P.outing) resumeOuting();
    render();
    return;
  }
  if(!P.save.today) P.save.today={day:dayKey(now()),shown:null,picked:false,pick:null,used:false,rewarded:false,ai:false,out:null,back:false,snacks:0,pats:0,played:0,burp:false};
  var left=Math.max(1,Math.round(OUT_MS/500));
  P.save.today.outPhase="out"; P.save.today.outLeft=left; P.save.today.outHour=hour;
  stopAiJob();
  P.outing={phase:"out", left:left, souv:null, hour:hour, done:false, saved:false, day:dayKey(now())};
  P.resumeOuting=false;
  saveSoon();
  beginAiSouvenir();
  render();
}
function resumeOuting(){
  var td=P.save && P.save.today;
  if(!td || !td.outPhase || td.back || td.day!==dayKey(now())) return false;
  var left=Math.max(1,+td.outLeft||1), back=td.outPhase==="back";
  var souv=null, saved=false;
  if(back){
    souv=findSouv(td.outSouv);
    saved=!!souv;
    if(!souv) souv=outingSouvenir();
    left=4;
  }
  P.outing={phase:back?"back":"out", left:left, souv:souv, hour:+td.outHour||hourNow(),
    done:false, saved:saved, day:td.day};
  render();
  return true;
}
function markOutingDone(o){
  if(P.save && P.save.today){
    P.save.today.out=o.hour;
    P.save.today.back=true;
    P.save.today.outPhase=""; P.save.today.outLeft=0; P.save.today.outSouv=null;
  }
  P.outing=null;
  P.action="happy"; P.actionUntil=now()+2000;
  beep("coin"); saveNow(); render(); homeMaybeRender();
}
function finishOuting(){
  var o=P.outing; if(!o || o.done) return;
  o.done=true;
  if(o.saved || souvIsEmpty(o.souv)){ markOutingDone(o); return; }
  addSouvenir(o.souv).then(function(saved){
    if(saved) markOutingDone(o);
    else {
      /* leave the phase in today: the next visit tries the write again */
      P.outing=null; P.resumeOuting=false; render();
    }
  });
}
function stepOuting(){
  if(!P.outing || P.outing.done) return;
  if(P.outing.left>0) P.outing.left--;
  if(P.outing.phase==="out" && P.outing.left<=0){
    /* the room stays empty until the one AI answer is in (or its 30 s cap is up) */
    if(P.aiJob && !P.aiJob.done){ persistOuting(); render(); return; }
    var job=P.aiJob;
    P.outing.phase="back"; P.outing.left=4;
    P.outing.souv=(job && job.result) ? job.result : outingSouvenir();
    P.outing.saved=false;
    P.aiJob=null;
    persistOuting(); saveSoon(); render();
  } else if(P.outing.phase==="back" && P.outing.left<=0){
    persistOuting();
    finishOuting();
  } else {
    persistOuting(); render();
  }
}
/* The day's souvenir decided without the screen: the AI (one call, 30 s cap) or the built-in table, saved through the
   same addSouvenir, then a short walk-back is left in today for the next visit. */
function decideOuting(hour, day){
  if(P.restoring || P.nostore || P.readFailed) return Promise.resolve(false);
  if(P.outResolving) return P.outResolving;
  P.outResolving=Promise.resolve().then(function(){
    var td=P.save && P.save.today;
    if(!td || td.day!==day || td.out!=null || td.back) return {skip:true};
    var had=souvForDay(day);
    if(had) return {skip:true, done:markDayWithSouvenir(had,hour,day)};
    td.outHour=hour;
    saveSoon();
    if(!td.ai && aiAvailable()){
      var job=startAiJob(td);
      if(job) return job.promise.then(function(entry){
        if(P.aiJob===job) P.aiJob=null;
        return {entry:entry};
      });
    }
    return {entry:null};
  }).then(function(res){
    if(res && res.skip) return !!res.done;
    if(P.restoring || P.nostore || P.readFailed) return false;
    var entry=res ? res.entry : null;
    var td=P.save && P.save.today;
    if(!td || td.day!==day || td.out!=null || td.back) return false;
    if(!entry){
      entry=outingSouvenir();
      /* an empty day is marked done at once: no document, and the next visit plays the normal walk-back */
      if(souvIsEmpty(entry)) return markDayBack(hour,day,null);
      if(!entry) return false;
    }
    entry.day=day;
    return addSouvenir(entry).then(function(saved){
      if(!saved){
        td.outPhase=""; td.outLeft=0;
        saveSoon();
        return false;
      }
      return markDayWithSouvenir(saved,hour,day);
    });
  }).then(function(ok){
    P.outResolving=null;
    if(ok && isOpen() && !P.outing && P.resumeOuting){ resumeOuting(); render(); }
    homeMaybeRender();
    return ok;
  },function(){
    P.outResolving=null;
    return false;
  });
  return P.outResolving;
}
function backgroundOuting(){
  if(P.restoring || P.nostore || P.readFailed) return Promise.resolve(false);
  if(!P.save || P.save.travel || P.save.stage==="egg" || P.outResolving) return P.outResolving||Promise.resolve();
  var td=P.save.today||{};
  if(td.back || td.out!=null) return Promise.resolve();
  var key=dayKey(now()), hour=null, o=null;
  if(td.outPhase){
    /* an outing started on the screen, then left: the souvenir is decided now, not after another empty wait */
    if(td.outPhase==="back" && td.outSouv && findSouv(td.outSouv)) return Promise.resolve();
    hour=(+td.outHour>=0) ? +td.outHour : null;
    if(hour==null){ o=Pet.outingToday(P.save,key); hour=o?o.hour:hourNow(); }
  } else {
    o=Pet.outingToday(P.save,key);
    if(!o || hourNow()<o.hour) return Promise.resolve();
    hour=o.hour;
  }
  return decideOuting(hour,key);
}
function checkOuting(){
  if(P.restoring || P.nostore || P.readFailed) return;
  if(!P.save || P.outing || P.save.travel || P.save.stage==="egg" || P.outResolving) return;
  var td=P.save.today||{};
  if(td.outPhase && !td.back){
    if(P.resumeOuting){ P.resumeOuting=false; resumeOuting(); }
    return;
  }
  if(td.out!=null) return;
  var key=dayKey(now()), t=localDate(now());
  var o=Pet.outingToday(P.save,key);
  if(!o) return;
  var mins=t.getUTCHours()*60+t.getUTCMinutes();
  if(mins>o.hour*60){ decideOuting(o.hour,key); return; }        /* already decided: a short walk-back, never a wait */
  if(mins===o.hour*60) startOuting(o.hour);
}

/* ---------- the walk, the waking and the short chores ---------- */
/* The room's one clock is 500 ms; the path is sampled on that clock, so the legs alternate at 2 fps. Any care
   action that would move the pet while it is on its way is queued and happens at the bowl, never at once. */
function naturalAsleep(){
  if(!P.save || P.save.stage==="egg") return false;
  return Pet.asleep(P.save,hourNow(),localDate(now()).getUTCMinutes());
}
/* the pet is in bed and nothing (a wake walk, the forced two minutes) is holding it up */
function inBedSleep(){ return naturalAsleep() && !P.task && !(P.awakeLeft>0); }
function atBed(){ var b=useSpotAt("sleep","sleep"); return !!P.at && Math.abs(P.at.x-b.x)<=2 && Math.abs(P.at.y-b.y)<=2; }
function spotNow(){
  if(P.task && P.task.pos) return {x:P.task.pos.x,y:P.task.pos.y};
  if(P.at) return {x:P.at.x,y:P.at.y};
  return naturalAsleep() ? useSpotAt("sleep","sleep") : useSpotAt("rest","stand");
}
function walkMs(from,to){
  var d=Math.abs(from.x-to.x)+Math.abs(from.y-to.y);
  return Math.max(700,Math.round(d*WALK_MS_PER_PX));
}
function walkFrame(pack,save,left){
  var g=petFrame(pack,save.stage,markNames(save,pack),"side",P.frame?"walk2":"walk1");
  return left && Art.mirror ? Art.mirror(g) : g;
}
function taskAwake(){
  var kind=P.task ? P.task.kind : "";
  P.task=null; P.action=""; P.actionUntil=0; P.puffUntil=0;
  P.at=useSpotAt("rest","stand");
  if(P.feeds.length){ P.awakeLeft=0; startChore("feed","walkBowl"); return; }
  if(kind==="grumpy"){
    if(P.lightReturn){ P.lightReturn=false; P.awakeLeft=0; startChore("bed","walkBed"); return; }
    P.awakeLeft=AWAKE_TICKS;                 /* two minutes on the screen, then back to bed */
  } else {
    P.awakeLeft=0;
    P.lightReturn=false;
  }
  flushPendingNeed();
}
function feedAtBowl(){
  if(P.feeds.length){
    var kind=P.feeds.shift(), sp=Pet.SPECIES[P.save.species]||Pet.SPECIES.chip;
    if(kind==="meal" && (+P.save.hunger||0)>=sp.hungerMax){
      /* full: it still got up, shakes its head at the bowl and goes back */
      beep("err"); taskEnter("shake"); return;
    }
    var burp=false;
    P.save=Pet.feed(P.save,kind,now(),dayKey(now()));
    if(kind==="snack" && P.save.today && P.save.today.burp){ burp=true; P.save.today.burp=false; }
    P.moodClearUntil=now()+8000; P.idle=null;
    beep(burp?"err":"ok");
    taskEnter(burp?"burp":"eat");
    saveSoon(); renderKeys();
    return;
  }
  taskEnter(naturalAsleep()?"walkBed":"walkRug");
}
function taskEnter(phase){
  var task=P.task;
  if(!task) return;
  task.phase=phase; task.t=now();
  if(phase==="walkBowl" || phase==="walkRug" || phase==="walkBed"){
    var to=phase==="walkBowl"?useSpotAt("feed","eat"):phase==="walkRug"?useSpotAt("rest","stand"):useSpotAt("sleep","sleep");
    task.from=spotNow(); task.to={x:to.x,y:to.y};
    task.pos=task.from; task.dur=walkMs(task.from,to);
    P.action=""; P.actionUntil=0;
  } else if(phase==="angry"){ P.action="angry"; P.actionUntil=now()+1500; P.puffUntil=now()+1500; beep("err"); }
  else if(phase==="eat"){ P.action="eat"; P.actionUntil=now()+1800; }
  else if(phase==="burp"){ P.action="burp"; P.actionUntil=now()+1200; }
  else if(phase==="shake"){ P.action="shake"; P.actionUntil=now()+1200; }
  else if(phase==="awake"){ taskAwake(); }
  else if(phase==="settle"){
    P.task=null; P.action=""; P.actionUntil=0; P.puffUntil=0; P.lightReturn=false;
    if(P.feeds.length) startChore("feed","walkBowl");
    else flushPendingNeed();
  }
}
function taskBusy(){
  var task=P.task;
  if(!task) return false;
  var t=now();
  if(task.phase==="walkBowl" || task.phase==="walkRug" || task.phase==="walkBed"){
    var k=task.dur ? Math.min(1,(t-task.t)/task.dur) : 1;
    task.pos=Pet.pathPoint(task.from,task.to,k);
    if(k>=1){
      /* the walk is over, so the pet now stands at its destination. The sleep transition later in the same
         tick reads P.at: leaving it at the last point sampled one frame ago made a completed bed walk start a
         second one from a few pixels short of the bed (and so miss the night's Zz for another second). */
      P.at={x:task.to.x,y:task.to.y};
      if(task.phase==="walkBowl") taskEnter("atBowl");
      else if(task.phase==="walkRug") taskEnter("awake");
      else taskEnter("settle");
    }
    return true;
  }
  if(task.phase==="atBowl"){ feedAtBowl(); return true; }
  if(task.phase==="angry"){ if(t-task.t>=1500) taskEnter("walkRug"); return true; }
  if(task.phase==="eat"){ if(t-task.t>=1800) taskEnter("atBowl"); return true; }
  if(task.phase==="burp" || task.phase==="shake"){ if(t-task.t>=1200) taskEnter("atBowl"); return true; }
  return true;
}
function startChore(kind,phase){
  var from=spotNow();
  P.task={kind:kind, phase:"", t:now(), pos:from, from:null, to:null, dur:0};
  P.action=""; P.actionUntil=0; P.idle=null;
  taskEnter(phase);
}
/* Leaving the screen in the middle of a chore: no animation runs off screen, so the queued food is taken and the
   pet is put at the place the chore was heading for. The two minutes only count while the screen is showing it. */
function finishTaskOnLeave(){
  var task=P.task;
  if(!task) return;
  if(task.kind==="feed"){
    while(P.feeds.length){
      var kind=P.feeds.shift(), sp=Pet.SPECIES[P.save.species]||Pet.SPECIES.chip;
      if(!(kind==="meal" && (+P.save.hunger||0)>=sp.hungerMax)) P.save=Pet.feed(P.save,kind,now(),dayKey(now()));
      if(kind==="snack" && P.save.today && P.save.today.burp) P.save.today.burp=false;
    }
    P.awakeLeft=0; P.at=naturalAsleep()?useSpotAt("sleep","sleep"):useSpotAt("rest","stand");
  } else if(task.kind==="grumpy" || task.kind==="wake"){
    if(P.save.light===false && naturalAsleep()){ P.awakeLeft=0; P.at=useSpotAt("sleep","sleep"); }
    else { P.awakeLeft=Math.max(P.awakeLeft,AWAKE_TICKS); P.at=useSpotAt("rest","stand"); }
  } else {
    P.awakeLeft=0; P.at=useSpotAt("sleep","sleep");
  }
  P.task=null; P.action=""; P.actionUntil=0; P.puffUntil=0; P.lightReturn=false;
}
/* One flash per real change of need. While the pet is asleep nothing flashes or sounds; the need is kept and
   announced once when it gets up, not lost when the home screen's background day looks at it. */
function announceNeed(w){
  if(!w){ P.lastWants=null; P.pendingNeed=null; return; }
  if(w===P.lastWants){ P.pendingNeed=null; return; }
  if(inBedSleep()){ P.pendingNeed=w; return; }
  P.pendingNeed=null;
  P.lastWants=w;
  flash(w==="food"?0:2);
}
function flushPendingNeed(){
  var w=wantsOf();
  if(!w){ P.pendingNeed=null; P.lastWants=null; return; }
  if(P.pendingNeed && w===P.pendingNeed && w!==P.lastWants){
    P.lastWants=w;
    flash(w==="food"?0:2);
  }
  P.pendingNeed=null;
}
function noteWants(){
  var w=wantsOf();
  if(w && w!==P.lastWants) P.pendingNeed=w;
  else if(!w) P.pendingNeed=null;
}

/* ---------- actions ---------- */
function patPet(){
  if(document.hidden || !P.save || P.save.travel || P.outing || P.save.stage==="egg") return;
  /* A sleeping pet is woken by the touch: no joy for that pat, a short grumble, then it walks to the rug. */
  if(inBedSleep()){
    P.at=useSpotAt("sleep","sleep");
    startChore("grumpy","angry");
    return;
  }
  var before=P.save.today ? P.save.today.pats : 0;
  P.save=Pet.pat(P.save,dayKey(now()));
  if((P.save.today ? P.save.today.pats : 0)!==before){
    if(!P.task){ P.action="happy"; P.actionUntil=now()+2000; }
    P.heartUntil=now()+2000;
    P.moodClearUntil=now()+8000; P.idle=null;   /* a pat lifts the low mood at once */
    beep("ok"); saveSoon(); render();
  }
}
function feed(kind){
  if(!P.save || isEgg()) return;
  var t=now(), burp=false, sp=Pet.SPECIES[P.save.species]||Pet.SPECIES.chip;
  /* A sleeping pet is not fed: the light is the way up, and its food icon is disabled in bed. If the food
     panel was already open when it fell asleep, close it instead of queuing a meal. */
  if(inBedSleep()){ P.sub=null; renderKeys(); render(); return; }
  /* A second press while it is walking is accepted and waits for the bowl; nothing jumps there. */
  if(P.task){
    P.feeds.push(kind==="snack"?"snack":"meal");
    P.sub=null;
    renderKeys(); render();
    return;
  }
  /* a full pet does not eat a meal: it shakes its head once and the panel closes. A snack still counts at joy 5. */
  if(kind==="meal" && (+P.save.hunger||0)>=sp.hungerMax){
    P.sub=null;
    P.action="shake"; P.actionUntil=t+1200;
    beep("err"); renderKeys(); render();
    return;
  }
  P.save=Pet.feed(P.save,kind,t,dayKey(t));
  if(kind==="snack" && P.save.today && P.save.today.burp){ burp=true; P.save.today.burp=false; }
  P.sub=null; P.action=burp?"burp":"eat"; P.actionUntil=t+(burp?1200:2000);
  P.moodClearUntil=t+8000; P.idle=null;       /* a meal lifts the low mood at once */
  beep(burp?"err":"ok");
  saveSoon(); renderKeys(); render();
}
function washPet(){
  if(!P.save) return;
  P.save=Pet.wash(P.save);
  P.washStart=now(); P.washUntil=now()+SWEEP_MS; P.action="wash"; P.actionUntil=now()+SWEEP_MS;
  beep("ok"); saveSoon(); render();
}
function toggleLight(){
  if(!P.save) return;
  var t=now(), h=hourNow(), mins=localDate(t).getUTCMinutes();
  var wasAsleep=inBedSleep();
  P.save=Pet.setLight(P.save,!P.save.light);
  P.action=null; P.actionUntil=0; P.idle=null;
  if(P.task){
    /* a light-off during the grumble: it never got up, so it just keeps sleeping; during the walk it turns back */
    if(P.save.light===false && (P.task.kind==="grumpy" || P.task.kind==="wake")){
      if(P.task.phase==="angry"){
        P.task=null; P.awakeLeft=0; P.puffUntil=0; P.action=""; P.actionUntil=0;
      } else if(P.task.phase==="walkRug"){
        startChore("bed","walkBed");
      }
    } else if(P.save.light===false){
      P.lightReturn=true;
    }
  } else if(wasAsleep && P.save.light===true){
    /* light on at night: wakes it, angry, and it walks to the rug (the same walk as every bed <-> floor move) */
    P.at=useSpotAt("sleep","sleep");
    startChore("grumpy","angry");
  } else if(P.save.light===false && Pet.asleep(P.save,h,mins) && !wasAsleep){
    /* light off: back to bed at once, walking */
    P.awakeLeft=0;
    startChore("bed","walkBed");
  } else {
    P.lightReturn=false;
  }
  beep("tick"); saveSoon(); renderKeys(); render();
}
function callPet(){
  var t=now(), w=wantsOf();
  if(!w){
    /* 叫它 when it wants nothing: it looks up for a moment. No hidden anger for tapping again. */
    P.idle=null; P.action="surprised"; P.actionUntil=t+1500;
    beep("tick"); render();
    return;
  }
  if(w==="food"){ P.lookAt="food"; P.action="wait"; }
  else { P.lookAt="wash"; P.action="wait"; }
  P.actionUntil=t+3000;
  beep("tick"); render();
}
function bringBack(){
  if(!P.save || !P.save.travel || P.save.stage==="egg" || P.bringing) return;
  P.bringing=true;
  var post=null, list=packOf(P.save).souvenirs||[];
  for(var i=0;i<list.length;i++) if(list[i].id==="post"){ post=list[i]; break; }
  addSouvenir(post).then(function(saved){
    P.bringing=false;
    if(!saved) return;                       /* stays travelling: A can try the write again */
    P.save.travel=false;
    if(P.save.today) P.save.today.back=true;
    P.action="happy"; P.actionUntil=now()+2500;
    beep("ok"); saveNow(); render();
  });
}
/* the pack's default name in the language the pet is hatched in: 芯仔 / Chip for chip */
function defaultPetName(){
  var pack=packOf(P.save), n=pack && pack.name;
  if(!n) return "";
  if(typeof n==="string") return n;
  return String(n[I18N.lang] || n.zh || n.en || "");
}
/* 6 CJK characters or 12 Latin letters: a CJK character costs 2, everything else 1. Emoji are stripped, never
   counted; the field is trimmed only when the name is confirmed, so a space can be typed between words. */
function nameCost(cp){
  return /[\u3400-\u9fff]/.test(cp) ? 2 : 1;
}
function limitName(v){
  var s=String(v==null?"":v).replace(NAME_EMOJI,""), cp=Array.from(s), out="", cost=0, i, w;
  for(i=0;i<cp.length;i++){
    w=nameCost(cp[i]);
    if(cost+w>12) break;
    out+=cp[i];
    cost+=w;
  }
  return out;
}
function nameFinal(){
  var v=limitName(P.naming ? P.naming.value : "").replace(/\s+/g," ").trim();
  return v || defaultPetName();
}
function openNaming(){
  if(!P.save || P.save.stage==="egg") return;
  P.sub="name";
  P.boxAsk=null;
  P.naming={value:P.save.name || defaultPetName(), confirm:false};
  P.panelKey="";
  renderKeys(); render();
}
/* A/OK from the field: ask once more, then keep the name forever. B from the question goes back to the field. */
function nameNext(){
  if(!P.naming) return;
  if(P.naming.confirm){ finishNaming(); return; }
  P.naming.value=limitName(P.naming.value);
  P.naming.confirm=true;
  P.panelKey="";
  beep("tap"); renderKeys(); render();
}
function nameEdit(){
  if(!P.naming) return;
  P.naming.confirm=false;
  P.panelKey="";
  beep("tap"); renderKeys(); render();
}
function finishNaming(){
  if(!P.save) return;
  P.save.name=nameFinal();
  P.naming=null;
  P.sub=null;
  P.action="happy"; P.actionUntil=now()+2000;
  beep("ok"); saveNow(); renderKeys(); render(); homeMaybeRender();
}
function maybeNamePrompt(){
  if(P.save && P.save.stage!=="egg" && !P.save.name && !P.naming && !P.sub) openNaming();
}
function hatchNow(silent){
  if(!P.save || P.save.stage!=="egg") return;
  P.save=Pet.hatch(P.save);
  P.eggMs=0; P.hatching=null; P.action="happy"; P.actionUntil=now()+3000;
  if(silent && !P.save.name) P.save.name=defaultPetName();
  if(!silent){
    beep("ok");
    if(isOpen() && LP.chip && LP.chip.music){ LP.chip.music({action:"play",song:JINGLE,loop:false}); P.jingle=true; }
  }
  saveNow();
  if(!silent && !P.save.name) openNaming();
  else { renderKeys(); render(); }
  buildPick();
  homeMaybeRender();
}
function restartPet(){
  var old=P.save, shelf=(old && old.shelf && findSouv(old.shelf)) ? old.shelf : null;
  P.save=freshSave();
  P.save.shelf=shelf;                        /* the souvenirs and the one on the shelf are kept */
  P.save.boxSeen=P.souv.length;              /* the box is kept and already seen */
  P.eggMs=0; P.sub=null; P.confirmStage=0; P.action=null; P.outing=null; P.game=null;
  P.hatching=null; P.naming=null; P.boxAsk=null; P.wasAsleep=null;
  P.task=null; P.feeds=[]; P.awakeLeft=0; P.puffUntil=0; P.pendingNeed=null; P.lightReturn=false; P.at=null;
  stopGameTimer();
  P.lastWants=null; P.boxPage=0; P.boxSel=0; P.boxItem=null; P.bringing=false;
  stopAiJob();
  saveNow(); beep("ok"); LP.toast(tr("pet.restart.done")); renderKeys(); render();
}

/* ---------- the four sub-screens ---------- */
function openLook(){ P.sub="look"; P.confirmStage=0; renderKeys(); beep("tap"); render(); }
/* The box is a month index: newest month first, 5 x 5 pictures a page, A opens one. The newest souvenir
   is the first picture, so opening the box after an outing shows what was brought back. */
var SOUV_PER_PAGE=25, SOUV_COLS=5;
function souvDay(s){
  if(s && s.day && /^\d{4}-\d{2}-\d{2}$/.test(s.day)) return s.day;
  return dayKey((s && s.at) || now());
}
function boxPages(){
  var list=P.souv.slice().sort(function(a,b){ return (b.at||0)-(a.at||0); });
  var groups=[], g=null, pages=[], i, n;
  list.forEach(function(s){
    var m=souvDay(s).slice(0,7);
    if(!g || g.key!==m){ g={key:m,items:[]}; groups.push(g); }
    g.items.push(s);
  });
  groups.forEach(function(grp){
    n=Math.ceil(grp.items.length/SOUV_PER_PAGE);
    for(i=0;i<n;i++) pages.push({key:grp.key,items:grp.items.slice(i*SOUV_PER_PAGE,i*SOUV_PER_PAGE+SOUV_PER_PAGE)});
  });
  return pages;
}
function openBoxItem(){
  var pages=boxPages(), pg=pages[P.boxPage], s=pg && pg.items[P.boxSel];
  if(!s) return;
  P.boxItem=s.id; P.boxAsk=null; P.panelKey="";
  beep("tap"); renderKeys(); render();
}
function openBox(){
  P.sub="box"; P.boxPage=0; P.boxSel=0; P.boxItem=null; P.boxAsk=null;
  if(P.save){ P.save.boxSeen=P.souv.length; saveNow(); }
  homeMaybeRender();
  renderKeys(); beep("tap"); render();
}
function openFood(){ P.sub="food"; P.foodSel=0; renderKeys(); beep("tap"); render(); }
function openGames(){
  if(P.outing) return;                       /* the pet is out: the icon does nothing, and so does A */
  stopGameTimer();
  P.sub="games"; P.gameSel=0; P.game=null; renderKeys(); beep("tap"); render();
}
/* A play pack runs on the room canvas: the 20 fps interval exists only while this screen is visible. */
function gameById(id){
  var list=(Play && Play.GAMES)||[];
  for(var i=0;i<list.length;i++) if(list[i].id===id) return list[i];
  return null;
}
function gameState(){ return P.game && P.game.state ? P.game.state : null; }
function gameDone(){ var st=gameState(); return !!(st && st.done); }
function startGameTimer(){ stopGameTimer(); P.gameTimer=setInterval(gameTick,50); }
function startGame(id){
  if(P.outing) return;
  var g=gameById(id) || ((Play && Play.GAMES)||[])[0];
  if(!g) return;
  stopGameTimer();
  P.sub="game";
  /* The round waits on its start card: no timer runs until the first key. The card names the game and one line
     of how to play, so a player never has to remember the pack list's labels. */
  P.game={id:g.id, state:g.init(P.gameSeed!=null ? (P.gameSeed>>>0) : (now()>>>0)), applied:false, started:false};
  P.gameHeld={left:false,right:false,a:false};
  P.gamePress={left:false,right:false,a:false};
  P.gameLabel="";
  silenceWeather();
  beep("tap"); renderKeys(); render();
}
function startRound(){
  if(!P.game || P.game.started) return;
  P.game.started=true;
  P.gameHeld={left:false,right:false,a:false};
  P.gamePress={left:false,right:false,a:false};
  P.panelKey="";
  beep("tap"); renderKeys(); render();
  startGameTimer();
}
function gameTick(){
  if(!isOpen() || document.hidden){ stopGameTimer(); return; }
  if(P.sub!=="game" || !P.game || !P.game.started) return;
  var g=gameById(P.game.id), st=gameState();
  if(!g || !st || st.done) return;
  var input={left:P.gameHeld.left, right:P.gameHeld.right, a:P.gameHeld.a,
    press:{left:P.gamePress.left, right:P.gamePress.right, a:P.gamePress.a}};
  P.gamePress={left:false,right:false,a:false};
  g.step(st,input,50);
  gameSounds(st.events);
  if(st.done){
    stopGameTimer();
    if(!P.game.applied){ P.game.applied=true; applyGameJoy(st); }
    renderKeys();
  } else {
    /* the only label that changes during play: 发球 until the ball is in the air */
    var lab=(P.game.id==="bounce" && !st.ball) ? "serve" : "";
    if(lab!==P.gameLabel){ P.gameLabel=lab; renderKeys(); }
  }
  render();
}
/* the packs name moments, the program names the short original sounds from the four-tone chip */
function gameSounds(events){
  (events||[]).forEach(function(e){
    if(e==="catch" || e==="serve") beep("coin");
    else if(e==="return" || e==="bat") beep("hit");
    else if(e==="petmiss") beep("miss");
    else if(e==="land") beep("tick");
  });
}
function applyGameJoy(st){
  if(!P.save || !st) return;
  P.save=Pet.play(P.save,st.joy,dayKey(now()));
  P.action="happy"; P.actionUntil=now()+2500; P.heartUntil=now()+2500;
  beep(st.joy>1?"win":"ok"); saveSoon();
}
function stopGameTimer(){ if(P.gameTimer){ clearInterval(P.gameTimer); P.gameTimer=0; } }
function exitGame(swallowAUp){
  stopGameTimer();
  P.game=null;
  P.gameHeld={left:false,right:false,a:false};
  P.gamePress={left:false,right:false,a:false};
  P.gameTouch=null;
  P.sub=null;
  /* A leaves the game on keydown; the keyup must not fall through to the selected 玩 icon and open the
     play list with a second sound. A tap on the result card passes no flag. */
  if(swallowAUp) P.ignoreAUp=true;
  beep("tap"); renderKeys(); render();
}
function openRestart(){
  if(P.sub!=="look") return;
  P.confirmStage=1;
  render();
}
function confirmNext(){
  if(P.confirmStage===1){
    var b=$("pet-confirm-btn");
    if(b){ P.confirmStage=2; b.click(); }
  } else if(P.confirmStage===2){
    var wrap=$("pet-confirm"), yes=wrap ? wrap.querySelector(".btn:not(.ghost)") : null;
    if(yes) yes.click();
    else { P.confirmStage=0; render(); }
  } else {
    /* the look screen's A is the long press; a tap alone does nothing */
  }
}
/* A souvenir on the room's shelf: one at a time, replaced from the box; the first change of a day is +1 joy.
   The pet turns happy for a moment when something new is put up. No note is written anywhere. */
function shelfGainJoy(){
  var s=P.save;
  if(!s) return;
  if(!s.today) s.today={shelf:false};
  if(s.today.shelf) return;
  var sp=Pet.SPECIES[s.species]||Pet.SPECIES.chip;
  s.today.shelf=true;
  s.joy=Math.min(sp.joyMax,(+s.joy||0)+1);
}
function applySouvPatch(s,patch){
  if(!s) return;
  for(var k in patch) if(Object.prototype.hasOwnProperty.call(patch,k)) s[k]=patch[k];
}
/* Only the fields we own, never a whole-document set: an older runtime must not wipe a newer field. */
function updateSouv(s,patch,then){
  if(!s || !patch){ if(then) then(true); return; }
  if(P.nostore || !P.refs){ applySouvPatch(s,patch); if(then) then(true); return; }
  P.refs.souv.doc(s.id).update(patch).then(function(){
    applySouvPatch(s,patch);
    if(then) then(true);
  },function(){
    LP.setStatus("status.unsaved");
    if(then) then(false);
  });
}
function shelfTake(s,then){
  if(!s || !s.state || !stateHasGrow(s.state)){ if(then) then(true); return; }
  var grown=(+s.grownMs||0) + (s.plantedAt!=null ? Math.max(0,now()-s.plantedAt) : 0);
  updateSouv(s,{grownMs:grown,plantedAt:null},then);
}
function shelfPut(s,then){
  if(!s || !s.state || !stateHasGrow(s.state)){ if(then) then(true); return; }
  updateSouv(s,{plantedAt:now(),grownMs:+s.grownMs||0},then);
}
function setShelf(id){
  var s=P.save;
  if(!s) return;
  var old=s.shelf||null, next=id||null;
  if(old===next){ P.boxAsk=null; P.panelKey=""; renderKeys(); render(); return; }
  function finish(){
    s.shelf=next;
    shelfGainJoy();
    if(next){ P.action="happy"; P.actionUntil=now()+2500; P.idle=null; }
    P.boxAsk=null; P.panelKey="";
    beep("ok"); saveSoon(); renderKeys(); render();
  }
  function putNew(){
    shelfPut(next?findSouv(next):null,function(){ finish(); });
  }
  if(old){
    shelfTake(findSouv(old),function(ok){
      if(!ok){ P.boxAsk=null; P.panelKey=""; beep("err"); renderKeys(); render(); return; }
      putNew();
    });
  } else {
    putNew();
  }
}
function askShelfAction(){
  var s=findSouv(P.boxItem);
  if(!s || !P.save) return;
  P.boxAsk={id:s.id, take:P.save.shelf===s.id};
  P.panelKey=""; beep("tap"); renderKeys(); render();
}
function answerShelf(yes){
  var ask=P.boxAsk;
  if(!ask) return;
  if(!yes){ P.boxAsk=null; P.panelKey=""; beep("tap"); renderKeys(); render(); return; }
  setShelf(ask.take?null:ask.id);
}
function pickFood(kind){ feed(kind==="snack"?"snack":"meal"); }
/* dir -1 is up / left and +1 is down / right: the food list is vertical, so both pairs move it, the icon row is
   horizontal but a thumb on the cross may use either pair */
function nav(dir,btn){
  if(P.sub==="food"){ P.foodSel=Math.max(0,Math.min(1,P.foodSel+dir)); beep("move"); render(); return; }
  if(P.sub==="games"){
    var list=(Play && Play.GAMES)||[];
    if(!list.length) return;
    P.gameSel=(P.gameSel+dir+list.length)%list.length;
    beep("move"); render(); return;
  }
  if(P.sub==="game") return;
  if(P.sub==="box"){
    if(P.boxItem) return;                    /* one card: B goes back to the grid */
    var pages=boxPages();
    if(!pages.length) return;
    P.boxPage=Math.max(0,Math.min(pages.length-1,P.boxPage));
    var pg=pages[P.boxPage], n=pg.items.length, idx, row, col;
    P.boxSel=Math.max(0,Math.min(n-1,P.boxSel));
    row=Math.floor(P.boxSel/SOUV_COLS); col=P.boxSel%SOUV_COLS;
    if(btn==="up" || btn==="down"){
      row+=btn==="down"?1:-1;
      idx=row*SOUV_COLS+col;
      if(row>=0 && row<SOUV_COLS && idx<n) P.boxSel=idx;
    } else {
      idx=P.boxSel+(btn==="left"?-1:(btn==="right"?1:dir));
      if(idx<0){
        if(P.boxPage>0){ P.boxPage--; P.boxSel=Math.min(SOUV_PER_PAGE-1,boxPages()[P.boxPage].items.length-1); }
      } else if(idx>=n){
        if(P.boxPage<pages.length-1){ P.boxPage++; P.boxSel=0; }
      } else P.boxSel=idx;
    }
    P.boxAsk=null; beep("move"); render(); return;
  }
  if(P.sub==="menu"){
    var items=menuItems(), i=P.menuSel, n=items.length;
    for(var k=0;k<n;k++){ i=(i+dir+n)%n; if(items[i].enabled){ P.menuSel=i; break; } }
    beep("move"); render(); return;
  }
  if(P.sub) return;
  if(isEgg()) return;
  P.sel=(P.sel+dir+ICON_NAMES.length)%ICON_NAMES.length;
  beep("move"); renderKeys(); render();
}
function useSelected(){
  if(!P.save || isEgg()) return;
  /* the state decides: in bed only food and the light answer; traveling only the call; an outing none */
  if(!iconUsable(ICON_NAMES[P.sel])){ beep("err"); return; }
  switch(P.sel){
    case 0: openFood(); break;
    case 1: openGames(); break;
    case 2: washPet(); break;
    case 3: toggleLight(); break;
    case 4: callPet(); break;
  }
}
function pressA(){
  if(P.holdFired){ P.holdFired=false; return; }
  if(!P.save) return;
  if(isEgg()) return;
  if(P.sub==="food"){ pickFood(P.foodSel?"snack":"meal"); return; }
  if(P.sub==="games"){
    var list=(Play && Play.GAMES)||[], g=list[P.gameSel];
    if(g) startGame(g.id);
    return;
  }
  if(P.sub==="game"){
    if(!P.game) return;
    if(gameDone()){ exitGame(); return; }              /* any key returns to the room, never a new round */
    if(!P.game.started){ startRound(); return; }
    P.gamePress.a=true;
    if(P.game.id==="bounce") beep("tick");
    return;
  }
  if(P.sub==="menu"){ chooseMenuItem(P.menuSel); return; }
  if(P.sub==="look"){ confirmNext(); return; }
  if(P.sub==="box"){
    if(P.boxAsk) answerShelf(true);
    else if(!P.boxItem) openBoxItem();
    else askShelfAction();
    return;
  }
  if(P.sub==="name"){ nameNext(); return; }
  if(P.sub==="word"){ lookupWord(); return; }
  if(P.sub) return;
  if(P.save.travel){ bringBack(); return; }
  useSelected();
}
function back(){
  if(P.sub==="game"){ exitGame(); return; }
  if(P.sub==="name"){
    if(P.naming && P.naming.confirm) nameEdit();
    return;
  }
  if(P.sub==="box" && P.boxAsk){ answerShelf(false); return; }
  if(P.sub==="box" && P.boxItem){ P.boxItem=null; P.boxAsk=null; P.panelKey=""; beep("tap"); renderKeys(); render(); return; }
  if(P.sub){
    P.sub=null; P.confirmStage=0; P.boxAsk=null;
    P.wordWord=""; P.wordMeaning=null; P.wordBusy=false;
    beep("tap"); renderKeys(); render();
  }
}
/* START opens the small menu over the room; A on the day's row uses the pick. */
var PICK_NAME={date:"pet.pick.date",word:"pet.pick.word",book:"pet.pick.book",film:"pet.pick.film"};
function menuItems(){
  var pick=activePick();
  if(pick && !PICK_NAME[pick.kind]) pick=null;      /* an old kind with no program is not offered */
  return [
    {id:"mail", enabled:!!pick, label:tr(pick?PICK_NAME[pick.kind]:"pet.menu.none")},
    {id:"look", enabled:true},
    {id:"box", enabled:true}
  ];
}
function openMenu(){
  if(P.sub || !P.save || isEgg()) return;
  P.sub="menu"; P.menuSel=activePick()?0:1; P.confirmStage=0;
  beep("tap"); renderKeys(); render();
}
function chooseMenuItem(i){
  var item=menuItems()[i];
  if(!item || !item.enabled){ beep("err"); return; }
  if(item.id==="mail"){ P.sub=null; renderKeys(); usePick(); }
  else if(item.id==="look") openLook();
  else openBox();
}

/* ---------- the day's pick: its own program, or the word card ---------- */
function usePick(){
  var pick=activePick();
  if(P.sub || !pick || !P.save || P.save.travel || P.outing || P.save.stage==="egg") return;
  if(pick.kind==="date"){
    if(typeof pick.day!=="number" || !LP.calendar || typeof LP.calendar.open!=="function") return;
    finishPick();
    LP.calendar.open(pick.day);
    return;
  }
  if(pick.kind==="word"){
    P.sub="word"; P.wordWord=pick.word||""; P.wordMeaning=null; P.wordBusy=false;
    finishPick(); beep("tap"); renderKeys(); render();
    return;
  }
  if(pick.kind==="book"){
    if(!LP.reader || typeof LP.reader.open!=="function" || !pick.id) return;
    if(LP.reader.open(pick.id)) finishPick();
    return;
  }
  if(pick.kind==="film"){
    var open=null, i;
    for(i=0;LP.builtins && i<LP.builtins.length;i++) if(LP.builtins[i].id==="darkroom"){ open=LP.builtins[i].open; break; }
    if(typeof open!=="function") return;
    finishPick();
    open();
  }
}
function fitText(text,max){
  var s=String(text==null?"":text).replace(/\s+/g," ").trim(), cp=Array.from(s);
  return cp.length>max ? cp.slice(0,max).join("")+"…" : s;
}
function lookupWord(){
  if(!P.wordWord || P.wordBusy) return;
  if(P.wordMeaning!=null) return;
  P.wordBusy=true; render();
  var done=function(text){
    P.wordBusy=false; P.wordMeaning=text; render();
  };
  if(!LP.dict || typeof LP.dict.lookup!=="function"){ done(tr("pet.word.none")); return; }
  LP.dict.lookup(P.wordWord).then(function(results){
    var text=results && results.length ? fitText(results[0].text,260) : "";
    done(text || tr("pet.word.none"));
  },function(){ done(tr("pet.word.none")); });
}

/* ---------- room ---------- */
function seasonOf(t){
  var m=localDate(t).getUTCMonth()+1;
  if(m>=3 && m<=5) return "spring";
  if(m>=6 && m<=8) return "summer";
  if(m>=9 && m<=11) return "autumn";
  return "winter";
}
/* The day's weather by season, seeded by the pet and the day; the debug hook may pin it for a picture.
   A real weather source can replace the seed here later (a system GPS/weather API), once there is one. */
function weatherNow(){
  if(P.weatherOverride) return P.weatherOverride;
  if(!P.save) return "sun";
  return Pet.weatherOf(P.save.born,dayKey(now()),seasonOf(now()));
}
/* Rain and wind have a voice, each its own chip preset. The sound is asked for with the weather of the exact frame
   that was drawn (P.lastScene), never a second reading of the clock, so what you hear is what the window shows,
   and only while the room (and so the window) is on screen: a sub-screen covers it. The
   sound stops on the same frame the weather changes, when it leaves, and while the page is hidden. */
function silenceWeather(){
  if(!P.ambName) return;
  P.ambName=null;
  if(LP.chip && typeof LP.chip.ambience==="function") LP.chip.ambience({name:null,level:0});
}
function syncWeatherSound(weather){
  if(!isOpen() || document.hidden){ silenceWeather(); return; }
  /* the drawn weather and its own preset: rain plays rain, wind plays wind, the rest are quiet */
  var name=weather==="rain" ? "rain" : weather==="wind" ? "wind" : null;
  if(name===P.ambName) return;
  P.ambName=name;
  if(LP.chip && typeof LP.chip.ambience==="function")
    LP.chip.ambience(name ? {name:name,level:0.16} : {name:null,level:0});
}
function markNames(save,pack){
  var m=save.marks||{}, out={};
  out.ant=(pack.marks.ant||["orb"])[m.ant|0] || "orb";
  out.eye=(pack.marks.eye||["round"])[m.eye|0] || "round";
  return out;
}
/* A missing frame must never empty the screen: the stage's idle frame stands in, and ?debug names it once. */
function missingFrame(stage,view,name){
  var key=String(stage)+"|"+String(view)+"|"+String(name);
  if(P.missing[key]) return;
  P.missing[key]=1;
  if(window.LOPDA_DEBUG && window.console) window.console.warn("pet: missing frame "+key);
}
function petFrame(pack,stage,marks,view,name){
  var g=Art.stagePose(pack,stage,marks,view,name);
  if(g && g.length && (!Art.frameInk || Art.frameInk(g)>0)) return g;
  missingFrame(stage,view,name);
  g=Art.stagePose(pack,stage,marks,view,view==="side"?"walk1":"idle");
  if(g && g.length && (!Art.frameInk || Art.frameInk(g)>0)) return g;
  return Art.stagePose(pack,stage,marks,"front","idle");
}
/* the egg over its ~8 visible seconds: whole, a small crack at 3 s, a big crack at 6 s, then the split */
function eggGrid(pack){
  var cracks=(pack && pack.eggCrack)||[], g=(pack && pack.egg) || null;
  if(P.eggMs>=EGG_CRACK2 && cracks[1]) g=cracks[1];
  else if(P.eggMs>=EGG_CRACK1 && cracks[0]) g=cracks[0];
  return g;
}
/* The short hatch: the top of the shell lifts away, then the baby stands in the bottom half. A pure picture made of
   the pack's own egg and baby grids, so a second species hatches without a single new frame name. */
function splitEgg(egg,frame){
  if(!egg || !egg.length) return egg;
  var n=egg.length, w=String(egg[0]).length, out=[], r, lift=frame?4:2, mid=Math.floor(n/2);
  for(r=0;r<n;r++) out.push(new Array(w+1).join("."));
  for(r=0;r<mid;r++){ var to=r-lift; if(to>=0 && to<n) out[to]=String(egg[r]); }
  for(r=mid;r<n;r++) out[r]=String(egg[r]);
  return out;
}
function hatchGrid(pack,elapsed){
  var phone=(pack && pack.eggCrack && pack.eggCrack[1]) || (pack && pack.egg);
  if(elapsed<250) return splitEgg(phone,0);
  if(elapsed>=750){
    var g=Art.stagePose(pack,"baby",markNames(P.save,pack),"front","happy");
    return g || phone;
  }
  return splitEgg(phone,1);
}
/* Moods are read from the two numbers the pet already has, plus the short anger timers. They never last: a pat or
   a meal lifts the low mood at once, and anger is only ever a second and a half. */
function moodFace(t){
  if(!P.save || P.save.stage==="egg") return null;
  if(!P.task && !(P.awakeLeft>0) && Pet.asleep(P.save,Pet.hourOf(t,tz()),localDate(t).getUTCMinutes())) return null;
  if(P.moodClearUntil>t) return null;
  if((+P.save.hunger||0)<=1) return "sad";
  if((+P.save.joy||0)<=1) return "sulk";
  return null;
}
function idleFace(){
  if(!P.idle) return null;
  if(P.idle.kind==="blink") return "blink";
  if(P.idle.kind==="sit") return "idle2";
  return "idle1";
}
function petGrid(save,pack,t,asleepNow){
  if(save.stage==="egg"){
    if(P.hatching) return hatchGrid(pack, t-P.hatching.start);
    return shift(eggGrid(pack), P.frame?1:0);
  }
  var marks=markNames(save,pack), a=P.action || "idle";
  var idle=idleFace(), mood=null;
  var face="idle1";
  if(a==="eat") face=P.frame?"eat2":"eat1";
  else if(a==="happy" || a==="burp") face="happy";
  else if(a==="sleep" || asleepNow) face="sleep";
  else if(a==="wait") face="wait";
  else if(a==="blink") face="blink";
  else if(a==="angry" || a==="sulk") face=a;
  else if(a==="wash" || a==="woke") face=P.frame?"surprised":"happy";
  else {
    mood=(a==="idle") ? moodFace(t) : null;
    face=mood || (P.idle ? (idle||"idle1") : (P.frame?"idle2":"idle1"));
  }
  var look=(P.idle && (P.idle.kind==="lookL"||P.idle.kind==="lookR")) ? (P.idle.kind==="lookL"?-1:1) : 0;
  /* Baby and child have their own small bodies, but the same face vocabulary: moods, blinks and game poses all
     read there too (the owner sees these stages for the first ten days). */
  if(save.stage==="baby" || save.stage==="child"){
    var smallStage=petFrame(pack,save.stage,marks,"front",face);
    if(a==="shake") return shiftX(smallStage,P.frame?1:-1);
    return look ? shiftX(smallStage,look) : smallStage;
  }
  if(save.stage==="adult"){
    var opts={ant:marks.ant, eye:marks.eye, face:face};
    if(mood) opts.face=mood;
    if(face==="blink" && !mood) opts.face="blink";
    var g=pack.adult(save.form||"plain",opts);
    if(!g || !g.length || (Art.frameInk && !Art.frameInk(g))){
      missingFrame("adult",save.form||"plain",face);
      g=Art.stagePose(pack,"adult",marks,"front","idle");
    }
    if(a==="shake") return shiftX(g,P.frame?1:-1);
    if(face==="happy") return shift(g,-1);
    if(face==="sleep" || face==="wait" || mood) return look?shiftX(g,look):g;
    return look?shiftX(g,look):shift(g,P.frame?1:0);
  }
  var small=pack.frames({
    ant:marks.ant, eye:marks.eye, face:face
  });
  if(a==="shake") return shiftX(small,P.frame?1:-1);
  return look ? shiftX(small,look) : shift(small,0);
}
function overlayGrid(base,top,x,y){
  if(!base || !top) return base;
  var out=[], r, c, row, ch;
  for(r=0;r<base.length;r++) out.push(String(base[r]).split(""));
  for(r=0;r<top.length;r++){
    row=String(top[r]);
    if(!out[y+r]) out[y+r]=[];
    for(c=0;c<row.length;c++){
      ch=row.charAt(c);
      if(ch!==".") out[y+r][x+c]=ch;
    }
  }
  return out.map(function(a){ return a.join(""); });
}
/* turn a frame a quarter turn: the sleeping pet lies across the bed, the antenna/head to the left */
function rotateCCW(g){
  if(!g || !g.length) return g;
  var h=g.length, w=String(g[0]).length, out=[], r, c, row;
  for(r=0;r<w;r++){
    row="";
    for(c=0;c<h;c++) row+=String(g[c]).charAt(w-1-r);
    out.push(row);
  }
  return out;
}
/* 立冬's scarf is worn, not held: it is laid over the pet grid, so a pick's prop can sit beside it. */
function wearScarf(pet){
  var scarf=((packOf(P.save).props)||Art.PROPS||{}).scarf;
  if(!pet || !scarf) return pet;
  var w=Art.gridWidth ? Art.gridWidth(pet) : String(pet[0]||"").length;
  var x=Math.max(0,Math.floor((w-String(scarf[0]).length)/2));
  return overlayGrid(pet,scarf,x,Math.floor(pet.length*0.55));
}
/* the little flag: flagBlank with numberGrid laid in its paper; two digits may touch the border, the paper shows */
function flagWithNumber(n){
  var props=(packOf(P.save).props)||Art.PROPS||{};
  var base=props.flagBlank||props.flag;
  if(!base) return null;
  var num=Art.numberGrid ? Art.numberGrid(Math.max(0,Math.min(99,+n||0))) : null;
  if(!num) return base;
  var w=String(num[0]).length, x=1+Math.floor((10-w)/2);
  if(x<1) x=1;
  if(x+w>16) x=16-w;
  return overlayGrid(base,num,x,2);
}
function gridFromPx(px){
  var rows=[], r, c, line, out, map="kdmp";
  for(r=0;r<16;r++){
    line=String(px||""); out="";
    for(c=0;c<16;c++){
      var ch=line.charAt(r*16+c);
      out+=/[0-3]/.test(ch)?map.charAt(+ch):"p";
    }
    rows.push(out);
  }
  return rows;
}
/* The one place the pet builds the item-state context; the room already owns these values. */
function souvenirCtx(onShelf){
  var t=now(), h=hourNow(), lu=null;
  try{ if(L && L.fromSolar) lu=lunarToday(t); }catch(e){}
  return {
    now:t, hour:h, minute:localDate(t).getUTCMinutes(),
    night:h<6 || h>=19, weather:weatherNow(), season:seasonOf(t),
    lunar:lu, onShelf:!!onShelf
  };
}
function souvenirView(s,onShelf){
  if(!s) return null;
  var fallback={px:s.px, id:"still", layer:null, stage:null};
  if(!PS || !PS.stateOf) return fallback;
  try{ return PS.stateOf(s,souvenirCtx(onShelf)); }catch(e){ return fallback; }
}
/* kind -> prop; the date flag counts the days, the rest are single grids */
function pickProp(pick){
  var props=(packOf(P.save).props)||Art.PROPS||{};
  if(!pick || !pick.kind) return null;
  if(pick.kind==="date") return flagWithNumber(typeof pick.in==="number"?pick.in:0);
  if(pick.kind==="word") return props.card||null;
  if(pick.kind==="book") return props.books||null;
  if(pick.kind==="film") return props.film||null;
  return null;
}
function roomScene(){
  var save=P.save, t=now(), pack=packOf(save), h=hourNow(), min=localDate(t).getUTCMinutes();
  var night=h<6 || h>=19;
  var asleepNow=!!(save && save.stage!=="egg" && Pet.asleep(save,h,min));
  if(P.task || P.awakeLeft>0) asleepNow=false;      /* woken for food, by a pat or by the light: it is up */
  var scene={
    pack:pack, night:night, season:seasonOf(t), weather:weatherNow(), phase:Math.floor(t/500),
    dayOfMonth:localDate(t).getUTCDate(),
    lightOff:!!(save && save.light===false && asleepNow),
    bowlFull:save ? save.hunger>=2 : true,
    mess:save ? save.mess : 0
  };
  if(save && save.shelf){
    var onShelf=findSouv(save.shelf);
    if(onShelf){
      var shelfView=souvenirView(onShelf,true);
      if(shelfView) scene.shelf=gridFromPx(shelfView.px);
      scene.shelfId=shelfView ? shelfView.id : "";
    }
  }
  if(!save) return scene;
  if(save.travel){ scene.sign=true; return scene; }
  if(P.outing && P.outing.phase==="out") return scene;

  var stand=useSpotAt("rest","stand"), px=stand.x, py=stand.y, w=Pet.wants(save);
  scene.pet=petGrid(save,pack,t,asleepNow);
  if(save.stage==="baby"){ px+=2; }
  else if(save.stage==="child"){ px+=1; }
  else if(save.stage==="egg"){ py=71; }

  if(P.outing && P.outing.phase==="back"){
    px=16+(4-P.outing.left)*18;
    if(save.stage==="egg"){
      scene.pet=P.hatching ? hatchGrid(pack,t-P.hatching.start) : shift(eggGrid(pack), P.frame?1:0);
    } else if(save.stage==="baby" || save.stage==="child"){
      scene.pet=petFrame(pack,save.stage,markNames(save,pack),"front",P.frame?"walk1":"walk2");
    } else {
      scene.pet=shift(pack.frames({
        ant:markNames(save,pack).ant, eye:markNames(save,pack).eye,
        face:P.frame?"walk2":"walk1"
      }),0);
    }
    scene.prop=P.outing.souv && !souvIsEmpty(P.outing.souv) ? (P.outing.souv.grid || gridFromPx(P.outing.souv.px)) : null;
    if(scene.prop) scene.propFollow=true;
    px=Math.max(0,px);
  } else {
    var pick=activePick();
    if(pick){
      scene.prop=pickProp(pick);
      /* a pick's small prop has a named slot beside the rug; it stands still while the pet walks */
      if(scene.prop) scene.propSlot="pick";
    }
    if(!P.task){
      /* a want points it at the bowl or the piles */
      if(!(P.awakeLeft>0)){
        var eatSpot=useSpotAt("feed","eat"), washSpot=useSpotAt("wash","wash");
        if(w==="food" || P.lookAt==="food"){ px=eatSpot.x; py=eatSpot.y; }
        else if(w==="wash" || P.lookAt==="wash"){ px=washSpot.x; py=washSpot.y; }
      }
    }
  }
  /* The bed <-> floor move: one reusable path, sampled on the room tick; the walking legs use the side frames.
     An upright phase (the grumble, eating) keeps its own face at the current spot.
     The side frames face right; walking left mirrors them (heading to bed used to moonwalk). */
  if(P.task){
    px=Math.round(P.task.pos ? P.task.pos.x : px);
    py=Math.round(P.task.pos ? P.task.pos.y : py);
    if(P.task.phase==="walkBowl" || P.task.phase==="walkRug" || P.task.phase==="walkBed"){
      var left=!!(P.task.from && P.task.to && P.task.to.x < P.task.from.x);
      scene.pet=walkFrame(pack,save,left);
      scene.dir=left?"left":"right";
    } else scene.pet=petGrid(save,pack,t,false);
  }
  /* Night: it lies across its bed, head to the left, with Zz above the bed. */
  if(asleepNow && save.stage!=="egg" && !P.task){
    scene.pet=rotateCCW(scene.pet);
    var bedSpot=useSpotAt("sleep","sleep"); px=bedSpot.x; py=bedSpot.y;
    scene.zz=true; scene.zzSlot="zz";
  }
  scene.petX=px; scene.petY=py;
  if(save.stage!=="egg") P.at={x:px,y:py};
  if(save.stage!=="egg" && isLidong(t)) scene.pet=wearScarf(scene.pet);
  if(P.heartUntil>t){ scene.prop=(pack.props||{}).heart; scene.propSlot=null; scene.propFollow=true; }
  else if(P.puffUntil>t){ scene.prop=PUFF; scene.propSlot=null; scene.propX=px+24; scene.propY=py+4; }
  else if(!scene.prop && isMidAutumn(t)){ scene.prop=(pack.props||{}).mooncake; scene.propSlot=null; scene.propFollow=true; }
  if(asleepNow && save.stage!=="egg") scene.zz=true;
  return scene;
}
/* the water sweeps across the floor where the piles are, from the first to the last, never over the bowl */
function drawSweep(){
  var room=(packOf(P.save)||{}).room||{}, spots=room.poops||[[50,107],[57,108],[64,107]];
  var x0=spots[0][0]-4, x1=spots[spots.length-1][0]+16;
  var done=Math.max(0,Math.min(SWEEP_MS,now()-(P.washStart||P.washUntil-SWEEP_MS)));
  var x=Math.round(x0+(x1-x0)*(done/SWEEP_MS)), y;
  for(y=90;y<118;y++){
    if(x>=0 && x<ROOM_W) buf[y*ROOM_W+x]=3;
    if(x+4>=0 && x+4<ROOM_W) buf[y*ROOM_W+x+4]=0;
  }
}
function renderRoom(){
  initCanvas();
  if(!ctx) return;
  var scene=roomScene();
  P.lastScene=scene;
  Art.drawRoom(buf,ROOM_W,ROOM_H,scene);
  if(P.washUntil>now()) drawSweep();
  paintRoomBuffer();
}
/* a play pack paints the same 162 x 120 buffer as the room; the pack's own poses come through Art.pose */
function renderGame(){
  initCanvas();
  if(!ctx || !P.game) return;
  var g=gameById(P.game.id), st=gameState();
  if(!g || !st) return;
  var pack=packOf(P.save), marks=P.save ? markNames(P.save,pack) : {};
  g.draw(st,buf,ROOM_W,ROOM_H,pack,function(view,name){
    return petFrame(pack,P.save ? P.save.stage : "adult",marks,view,name);
  });
  paintRoomBuffer();
}

/* ---------- icons ---------- */
/* A normal icon is dark, an unavailable one mid (lighter but still a whole, readable glyph), a lit one
   (a need flashing, or 呼唤 when it wants something) ink. Selected is the frame, not a tone.
   `petsim.actionReady` owns which action a state answers. */
function iconTone(i,usable){
  var name=ICON_NAMES[i];
  if(!usable) return 2;
  if(P.flash && P.flash.i===i) return P.flash.left%2===0 ? 0 : 2;
  if(name==="call") return wantsOf()?0:1;
  return 1;
}
function iconUsable(name){
  return Pet.actionReady(P.save,name,{asleep:inBedSleep(),outing:!!P.outing});
}
function buildIcons(){
  var wrap=$("pet-icons");
  if(!wrap) return;
  wrap.textContent=""; iconCvs={};
  ICON_NAMES.forEach(function(name,i){
    var b=el("button","pet-ikey"); b.type="button";
    b.setAttribute("aria-label",tr("pet.icon."+name));
    b.setAttribute("aria-pressed","false");
    var cv=el("canvas","pet-icv"); cv.width=8; cv.height=8; cv.setAttribute("aria-hidden","true");
    iconCvs[name]=cv; b.appendChild(cv);
    b.onclick=function(){
      if(P.sub) return;                     /* a sub-screen owns A/B; an icon must not act behind it */
      if(isEgg()){ beep("err"); return; }   /* an egg has nothing to choose yet */
      P.sel=i; beep("move"); renderKeys();
      if(!iconUsable(name)){ beep("err"); return; }   /* asleep: only the light answers */
      if(P.save && P.save.travel){ bringBack(); return; }
      if(P.outing) return;
      useSelected();
    };
    wrap.appendChild(b);
  });
  iconBuilt=true;
}
function renderIcons(){
  var wrap=$("pet-icons"); if(!wrap) return;
  if(inBedSleep()) P.flash=null;                /* a leftover flash never survives a nap */
  /* An egg has no icon row at all: no buttons. The naming panel owns the screen too. */
  if(isEgg() || P.sub==="name"){ wrap.hidden=true; wrap.textContent=""; iconBuilt=false; iconCvs={}; return; }
  wrap.hidden=false;
  if(!iconBuilt) buildIcons();
  var pack=packOf(P.save), icons=(pack&&pack.icons)||{};
  var kids=wrap.children;
  ICON_NAMES.forEach(function(name,i){
    var cv=iconCvs[name]; if(!cv) return;
    var usable=iconUsable(name);
    paintGrid(cv,icons[name]||[],iconTone(i,usable),3);
    var b=kids[i]; if(!b) return;
    b.setAttribute("aria-disabled",usable?"false":"true");
    if(i===P.sel) b.classList.add("on"); else b.classList.remove("on");
    b.setAttribute("aria-pressed",i===P.sel?"true":"false");
  });
}

/* ---------- sub-screen panels ---------- */
function boxes(n){
  var wrap=el("span","pet-boxes");
  for(var i=0;i<5;i++){ var b=el("i",i<n?"pet-box on":"pet-box"); wrap.appendChild(b); }
  return wrap;
}
function panelKey(){
  var s=P.save||{}, st=gameState();
  return [P.sub,P.foodSel,P.boxPage,P.boxAsk?P.boxAsk.id+P.boxAsk.take:"" ,P.menuSel,P.confirmStage,I18N.lang,P.souv.length,P.boxSel,P.boxItem||"",activePick()?activePick().kind:"",
    P.naming?(P.naming.confirm?1:0):-1,
    P.gameSel,P.game?P.game.id:"",st?st.score:-1,st&&st.done?1:0,P.game&&P.game.applied?1:0,P.game&&P.game.started?1:0,
    P.wordWord,P.wordMeaning,P.wordBusy,
    s.stage,s.name,s.hunger,s.joy,s.opened,s.born,s.close,s.travel,s.light].join("|");
}
function buildMenu(panel){
  panel.appendChild(el("p","pet-ptitle",tr("pet.menu.title")));
  var items=menuItems();
  items.forEach(function(it,i){
    var b=el("button","pet-menu"+(i===P.menuSel?" on":"")+(it.enabled?"":" dim"));
    b.type="button";
    if(it.id==="mail" && it.enabled) b.appendChild(el("i","pet-dot"));
    b.appendChild(el("span","",it.label || tr("pet.menu."+it.id)));
    b.disabled=!it.enabled;
    b.setAttribute("aria-disabled",it.enabled?"false":"true");
    b.onclick=function(){ if(!it.enabled) return; P.menuSel=i; chooseMenuItem(i); };
    panel.appendChild(b);
  });
}
function buildFood(panel){
  panel.appendChild(el("p","pet-ptitle",tr("pet.food.title")));
  [["meal",tr("pet.food.meal")],["snack",tr("pet.food.snack")]].forEach(function(o,i){
    var b=el("button","pet-choice"+(P.foodSel===i?" on":""),o[1]);
    b.type="button";
    b.onclick=function(){ P.foodSel=i; pickFood(o[0]); };
    panel.appendChild(b);
  });
  panel.appendChild(el("p","pet-phint",tr("pet.food.hint")));
}
function buildGames(panel){
  panel.appendChild(el("p","pet-ptitle",tr("pet.game.title")));
  var list=(Play && Play.GAMES)||[];
  list.forEach(function(g,i){
    var b=el("button","pet-menu"+(i===P.gameSel?" on":""));
    b.type="button";
    b.appendChild(el("span","",tr(g.labelKey)));
    b.onclick=function(){ P.gameSel=i; startGame(g.id); };
    panel.appendChild(b);
  });
  panel.appendChild(el("p","pet-phint",tr("pet.game.hint")));
}
/* The start card and the result are HTML cards over the canvas, so their words are the strings' own pixel
   font; the pet's face and the score are painted into small canvases with the same four tones as the room. */
function gameFace(){
  var pack=packOf(P.save), st=gameState();
  var marks=P.save ? markNames(P.save,pack) : {};
  return petFrame(pack,P.save ? P.save.stage : "adult",marks,"front",st&&st.joy>=2?"happy":"idle1");
}
function paintScore(cv,n){
  var num=Art.numberGrid ? Art.numberGrid(n) : null;
  if(!num || !num.length) return;
  paintGrid(cv,num,undefined,3);
  var gw=String(num[0]).length;
  cv.style.width=(gw*6)+"px";
  cv.style.height=(num.length*6)+"px";
}
function buildGameStart(panel){
  panel.className="pet-panel pet-gcard";
  panel.onclick=function(){ startRound(); };
  var g=P.game ? gameById(P.game.id) : null, box=el("div","pet-gbox");
  box.appendChild(el("p","pet-gname",g?tr(g.labelKey):tr("pet.game.title")));
  box.appendChild(el("p","pet-ghow",tr("pet.game.how."+(P.game?P.game.id:"catch"))));
  panel.appendChild(box);
}
function buildGameOver(panel){
  var st=gameState(), g=P.game ? gameById(P.game.id) : null;
  if(!st) return;
  panel.className="pet-panel pet-gcard";
  panel.onclick=function(){ exitGame(); };            /* any tap, any key: back to the room */
  var box=el("div","pet-gbox");
  box.appendChild(el("p","pet-gname",g?tr(g.labelKey):tr("pet.game.title")));
  var face=el("canvas","pet-gface");
  face.setAttribute("aria-hidden","true");
  paintGrid(face,gameFace(),undefined,3);
  box.appendChild(face);
  box.appendChild(el("p","pet-gscorelabel",tr("pet.game.scorelabel")));
  var score=el("canvas","pet-gscore");
  score.setAttribute("aria-label",tr("pet.game.score",{n:st.score}));
  paintScore(score,st.score);
  box.appendChild(score);
  box.appendChild(el("p","pet-gcomment",tr(st.joy>=2?"pet.game.result.fun":"pet.game.result.ok")));
  box.appendChild(el("p","pet-ganykey",tr("pet.game.anykey")));
  panel.appendChild(box);
}
function buildLook(panel){
  var s=P.save||{}, age=Math.max(0,Math.floor((now()-(+s.born||now()))/DAY));
  /* design.md 8 keeps no meal counter, so this display-only weight counts care actions as meals:
     a base plus 10 g for each, less 5 g for every day it has lived (never below 100 g). */
  var weight=Math.max(100,900+(+s.close||0)*10-age*5);
  var name=el("p","pet-pname",s.name || defaultPetName());
  panel.appendChild(name);
  panel.appendChild(el("p","pet-ptitle",tr("pet.look.title")));
  var a=el("p","pet-prow"); a.appendChild(el("span","",tr("pet.look.age"))); a.appendChild(el("b","",tr("pet.look.agedays",{n:age}))); panel.appendChild(a);
  var w=el("p","pet-prow"); w.appendChild(el("span","",tr("pet.look.weight"))); w.appendChild(el("b","",tr("pet.look.gram",{n:weight}))); panel.appendChild(w);
  var h=el("p","pet-prow"); h.appendChild(el("span","",tr("pet.look.hunger"))); h.appendChild(boxes(+s.hunger||0)); panel.appendChild(h);
  var j=el("p","pet-prow"); j.appendChild(el("span","",tr("pet.look.joy"))); j.appendChild(boxes(+s.joy||0)); panel.appendChild(j);
  panel.appendChild(el("p","pet-phint",tr("pet.look.hint")));
  var c=el("div","pet-confirm"); c.id="pet-confirm"; panel.appendChild(c);
}
function buildWord(panel){
  panel.appendChild(el("p","pet-ptitle",tr("pet.word.title")));
  panel.appendChild(el("p","pet-wordbig",P.wordWord||""));
  if(P.wordBusy) panel.appendChild(el("p","pet-pinfo",tr("pet.word.loading")));
  else if(P.wordMeaning!=null) panel.appendChild(el("p","pet-meaning",P.wordMeaning));
  panel.appendChild(el("p","pet-phint",tr(P.wordMeaning!=null?"pet.word.back":"pet.word.hint")));
}
function buildBox(panel){
  panel.appendChild(el("p","pet-ptitle",tr("pet.box.title")));
  if(!P.souv.length){ panel.appendChild(el("p","pet-pempty",tr("pet.box.empty"))); return; }
  if(P.boxItem){
    var one=findSouv(P.boxItem);
    if(!one){ P.boxItem=null; }
    else {
      var card=el("div","pet-souv");
      var cv=el("canvas","pet-souvcv"); cv.width=16; cv.height=16; cv.setAttribute("aria-hidden","true");
      var oneView=souvenirView(one,P.save && P.save.shelf===one.id);
      paintSouvenir(cv,oneView ? oneView.px : one.px);
      card.appendChild(cv);
      var body=el("div","pet-souvtext");
      body.appendChild(el("b","pet-souvname",souvText(one,"name")));
      body.appendChild(el("p","pet-souvline",souvText(one,"line")));
      body.appendChild(el("p","pet-souvdate",LP.fmt(one.at)));
      var from=souvFrom(one);
      if(from) body.appendChild(el("p","pet-souvfrom",from));
      if(P.save && P.save.shelf===one.id) body.appendChild(el("p","pet-souvtag",tr("pet.shelf.on")));
      card.appendChild(body);
      panel.appendChild(card);
      if(P.boxAsk && P.boxAsk.id===one.id){
        var ask=el("div","pet-ask");
        ask.appendChild(el("p","pet-askq",tr(P.boxAsk.take?"pet.shelf.take":"pet.shelf.put")));
        var row=el("div","pet-askrow");
        var yes=el("button","btn",tr("pet.shelf.yes")); yes.type="button"; yes.onclick=function(){ answerShelf(true); };
        var no=el("button","btn ghost",tr("pet.shelf.no")); no.type="button"; no.onclick=function(){ answerShelf(false); };
        row.appendChild(yes); row.appendChild(no); ask.appendChild(row);
        panel.appendChild(ask);
      }
      return;
    }
  }
  var pages=boxPages();
  if(!pages.length){ panel.appendChild(el("p","pet-pempty",tr("pet.box.empty"))); return; }
  P.boxPage=Math.max(0,Math.min(pages.length-1,P.boxPage));
  var pg=pages[P.boxPage];
  P.boxSel=Math.max(0,Math.min(pg.items.length-1,P.boxSel));
  var grid=el("div","pet-souv-grid");
  pg.items.forEach(function(s,i){
    var b=el("button","pet-tile"+(i===P.boxSel?" on":""));
    b.type="button";
    b.setAttribute("aria-label",souvText(s,"name")+" · "+LP.fmt(s.at));
    var cv=el("canvas",""); cv.width=16; cv.height=16; cv.setAttribute("aria-hidden","true");
    var tileView=souvenirView(s,P.save && P.save.shelf===s.id);
    paintSouvenir(cv,tileView ? tileView.px : s.px);
    b.appendChild(cv);
    b.onclick=function(){ P.boxSel=i; openBoxItem(); };
    grid.appendChild(b);
  });
  panel.appendChild(grid);
  var foot=el("p","pet-souvfoot");
  foot.appendChild(el("span","",tr("pet.box.month",{y:pg.key.slice(0,4),m:+pg.key.slice(5,7)})));
  foot.appendChild(el("span","",tr("pet.box.page",{i:P.boxPage+1,n:pages.length})));
  panel.appendChild(foot);
}
function buildName(panel){
  var confirming=!!(P.naming && P.naming.confirm);
  panel.appendChild(el("p","pet-ptitle",tr("pet.name.title")));
  if(!confirming){
    var inp=el("input","pet-nameinput");
    inp.id="pet-name"; inp.type="text"; inp.maxLength=24;
    inp.setAttribute("autocomplete","off"); inp.setAttribute("autocorrect","off");
    inp.setAttribute("autocapitalize","off"); inp.setAttribute("spellcheck","false");
    inp.setAttribute("enterkeyhint","done");
    inp.setAttribute("aria-label",tr("pet.name.title"));
    inp.value=P.naming ? P.naming.value : defaultPetName();
    inp.addEventListener("input",function(){
      var v=limitName(inp.value);
      if(v!==inp.value) inp.value=v;
      if(P.naming) P.naming.value=v;
    });
    inp.addEventListener("keydown",function(e){
      if(e.key!=="Enter") return;
      e.preventDefault(); e.stopPropagation();
      nameNext();
    });
    panel.appendChild(inp);
    panel.appendChild(el("p","pet-phint",tr("pet.name.hint")));
    var row=el("div","pet-name-actions");
    var ok=el("button","btn",tr("pet.name.ok"));
    ok.type="button"; ok.id="pet-name-ok"; ok.onclick=function(){ nameNext(); };
    row.appendChild(ok);
    panel.appendChild(row);
  } else {
    panel.appendChild(el("p","pet-pinfo",tr("pet.name.confirm",{name:nameFinal()})));
    panel.appendChild(el("p","pet-phint",tr("pet.name.hint")));
    var crow=el("div","pet-name-actions");
    var yes=el("button","btn",tr("pet.name.yes"));
    yes.type="button"; yes.id="pet-name-yes"; yes.onclick=function(){ finishNaming(); };
    var edit=el("button","btn ghost",tr("pet.name.edit"));
    edit.type="button"; edit.id="pet-name-edit"; edit.onclick=function(){ nameEdit(); };
    crow.appendChild(yes); crow.appendChild(edit);
    panel.appendChild(crow);
  }
}
function renderPanel(){
  var panel=$("pet-panel");
  if(!panel) return;
  if(!P.sub){ panel.hidden=true; P.panelKey=""; return; }
  var startCard=P.sub==="game" && P.game && !P.game.started;
  if(P.sub==="game" && !startCard && !gameDone()){ panel.hidden=true; P.panelKey=""; return; }
  panel.hidden=false;
  var key=panelKey();
  if(key===P.panelKey) return;
  P.panelKey=key;
  panel.className="pet-panel";
  panel.onclick=null;
  panel.textContent="";
  if(P.sub==="food") buildFood(panel);
  else if(P.sub==="games") buildGames(panel);
  else if(P.sub==="game" && startCard) buildGameStart(panel);
  else if(P.sub==="game") buildGameOver(panel);
  else if(P.sub==="menu") buildMenu(panel);
  else if(P.sub==="look") buildLook(panel);
  else if(P.sub==="box") buildBox(panel);
  else if(P.sub==="name") buildName(panel);
  else if(P.sub==="word") buildWord(panel);
  if(P.sub==="look" && P.confirmStage){
    LP.resetConfirm("pet-confirm","pet-confirm-btn",tr("pet.look.restart"),restartPet);
    if(P.confirmStage===2){
      var arm=$("pet-confirm-btn");
      if(arm) arm.click();
    }
  }
}

/* ---------- the screen ---------- */
function render(){
  if(P.sub==="game" && P.game) renderGame();
  else { renderRoom(); renderIcons(); }
  renderEggLine();
  renderPanel();
  var away=$("pet-away");
  if(away){
    var trv=!!(P.save && P.save.travel);
    away.hidden=!trv || P.sub==="game";
    if(trv) away.textContent=tr("pet.away")+" · "+tr("pet.away.hint");
  }
  if(P.sub==="game") silenceWeather();
  else if(!P.sub && P.lastScene) syncWeatherSound(P.lastScene.weather);
  else silenceWeather();
}
/* The main screen's A names what the selected icon will do; a sub-screen keeps its own A. */
function aKeyLabel(){
  if(P.sub==="food") return "pet.sk.pick";
  if(P.sub==="games") return "pet.sk.start";
  if(P.sub==="game"){
    if(gameDone()) return "pet.game.room";
    if(P.game && !P.game.started) return "pet.sk.start";
    var st=gameState();
    return P.game && P.game.id==="bounce" && st && !st.ball ? "pet.game.serve" : "";
  }
  if(P.sub==="menu") return "pet.sk.open";
  if(P.sub==="look") return "pet.sk.hold";
  if(P.sub==="box"){
    if(P.boxAsk) return "pet.shelf.yes";
    if(!P.boxItem) return "pet.sk.open";
    return P.save && P.save.shelf===P.boxItem ? "pet.sk.take" : "pet.sk.put";
  }
  if(P.sub==="name") return P.naming && P.naming.confirm ? "pet.name.yes" : "pet.name.ok";
  if(P.sub==="word") return "pet.sk.lookup";
  if(!P.save || isEgg()) return "";
  if(P.save.travel) return "pet.act.call";
  switch(P.sel){
    case 0: return "pet.act.feed";
    case 1: return "pet.act.play";
    case 2: return "pet.act.wash";
    case 3: return P.save.light===false ? "pet.act.lighton" : "pet.act.lightoff";
    case 4: return "pet.act.call";
  }
  return "pet.sk.use";
}
function renderEggLine(){
  var line=$("pet-eggline");
  if(!line) return;
  var egg=isEgg();
  line.hidden=!egg;
  line.textContent=egg ? tr("pet.eggline") : "";
}
function renderKeys(){
  var wrap=$("pet-keys");
  if(!wrap) return;
  var label=aKeyLabel(), egg=isEgg();
  /* While it is an egg the soft keys are hidden, not greyed: a calm screen with HOME as the only way out. The
     naming field needs the room for the phone's keyboard, so the keys only come back on the confirm question. */
  var hide=egg || (P.sub==="name" && !(P.naming && P.naming.confirm));
  if(hide){ wrap.hidden=true; wrap.textContent=""; return; }
  wrap.hidden=false;
  var inGame=P.sub==="game" && !gameDone();
  var blabel=tr(inGame?"pet.game.exit":"sk.back");
  if(P.sub==="box" && P.boxAsk) blabel=tr("pet.shelf.no");
  else if(P.sub==="name") blabel=tr("pet.name.edit");
  LP.softkeys(wrap,{
    select:null,                           /* reserved for switching rooms when more species come (visits) */
    start:{label:egg ? "" : tr("pet.sk.menu"),disabled:!!P.sub || egg,fn:openMenu},
    b:{label:blabel,fn:back},
    a:{label:label?tr(label):"",disabled:egg,fn:function(){
      if(P.holdFired){ P.holdFired=false; clearHold(); return; }
      clearHold(); pressA();
    }}
  });
  var a=wrap.querySelector(".sk-a");
  if(a){
    a.addEventListener("pointerdown",startHold);
    ["pointerup","pointercancel","pointerleave"].forEach(function(t){ a.addEventListener(t,clearHold); });
  }
}
function startHold(){
  clearHold();
  if(P.sub && P.sub!=="look") return;
  P.hold=setTimeout(function(){
    P.hold=0;
    if(document.hidden){ return; }
    P.holdFired=true;
    if(P.sub==="look") openRestart();
    else if(!P.sub) patPet();
  },HOLD_MS);
}
function clearHold(){ if(P.hold){ clearTimeout(P.hold); P.hold=0; } }

/* ---------- timers ---------- */
/* Idle variety: a blink, a look to one side, or a short sit, seeded from the pet so a session has its own rhythm.
   The room tick is 500 ms (2 fps), and every action is one or two frames, so nothing ever flickers. */
function idleAllowed(){
  return !!(P.save && P.save.stage!=="egg" && !P.sub && !P.action && !P.idle && !P.save.travel && !P.outing &&
    !P.task && !inBedSleep());
}
function idleRoll(t){
  if(!idleAllowed()) return;
  if(!P.idleRng) P.idleRng=Pet.rng(((+P.save.born||1)^0x6d2b79f5)>>>0);
  if(P.idleRng()>=0.22) return;
  var r=P.idleRng();
  var kind=r<0.45?"blink":r<0.7?"lookL":r<0.9?"lookR":"sit";
  P.idle={kind:kind, until:t+(kind==="blink"?500:1000)};
}
function startTimer(){
  stopTimer();
  P.anim=setInterval(tick,500);
}
function stopTimer(){ if(P.anim){ clearInterval(P.anim); P.anim=0; } }
function tick(){
  if(!isOpen() || document.hidden) return;
  if(P.sub==="game"){ render(); return; }      /* the play pack's own 20 fps tick is the only clock it needs */
  P.frame=1-P.frame;
  if(inBedSleep()) P.flash=null;               /* nothing flashes while it is asleep */
  if(P.flash){ P.flash.left--; if(P.flash.left<=0) P.flash=null; }
  var t=now();
  if(P.save && P.save.today && P.save.today.day!==dayKey(t)){
    if(P.outing) P.outing=null;              /* the previous day's outing does not spill into the new one */
    refreshTime();
  }
  if(P.save && P.save.stage==="egg" && !P.sub && !P.save.travel){
    if(!P.hatching){
      P.eggMs+=500;
      if(P.eggMs>=EGG_MS) P.hatching={start:t};
    } else if(t-P.hatching.start>=HATCH_ANIM_MS){
      hatchNow(false);
    }
  }
  if(P.actionUntil && t>=P.actionUntil){ P.action=""; P.actionUntil=0; P.lookAt=""; }
  if(P.action) P.idle=null;
  if(P.idle && t>=P.idle.until) P.idle=null;
  idleRoll(t);
  if(P.heartUntil && t>=P.heartUntil) P.heartUntil=0;
  if(P.washUntil && t>=P.washUntil) P.washUntil=0;
  if(P.outing){ stepOuting(); }
  else checkOuting();
  if(P.task) taskBusy();
  if(!P.task && P.awakeLeft>0){
    if(!naturalAsleep()) P.awakeLeft=0;        /* morning came: it stays up */
    else if(--P.awakeLeft<=0) startChore("bed","walkBed");
  }
  /* Falling asleep walks to the bed; waking in bed walks back to the rug (never a teleport). */
  var sleepNow=inBedSleep();
  if(P.save && P.save.stage!=="egg"){
    if(P.wasAsleep===null) P.wasAsleep=sleepNow;
    else if(P.wasAsleep && !sleepNow && !P.task && !P.outing){
      P.at=useSpotAt("sleep","sleep");
      startChore("wake","walkRug");
      P.wasAsleep=false;
    } else if(!P.wasAsleep && sleepNow && !P.task && !P.outing && !atBed()){
      startChore("bed","walkBed");
      P.wasAsleep=false;
    } else {
      P.wasAsleep=sleepNow;
    }
  }
  render();
}

/* ---------- hooks ---------- */
function enter(){
  P.inView=true;
  initCanvas();
  P.resumeOuting=true;
  /* the save decides the A label and the egg state, so it is read before the keys are built */
  ensurePet();
  refreshTime();
  P.wasAsleep=inBedSleep();
  maybeNamePrompt();
  renderKeys();
  buildIcons();
  render();
  startTimer();
  refreshUsage();
}
/* show() calls every built-in's leave when any view opens: only the pet's own leaving does anything */
function leave(){
  if(!P.inView) return;
  P.inView=false;
  persistOuting();
  stopTimer(); stopGameTimer(); clearHold();
  if(P.roomHold){ clearTimeout(P.roomHold); P.roomHold=0; }
  P.holdFired=false;
  P.sub=null; P.confirmStage=0; P.game=null; P.outing=null;
  P.naming=null; P.boxAsk=null; P.wasAsleep=null;
  finishTaskOnLeave();
  P.gameHeld={left:false,right:false,a:false};
  P.gamePress={left:false,right:false,a:false};
  P.gameTouch=null;
  P.wordWord=""; P.wordMeaning=null; P.wordBusy=false;
  stopAiJob();
  silenceWeather();
  saveNow();
  stopJingle();
}
/* only the pet's own jingle: music calls are rate-limited, and another program's song is not the pet's to stop */
function stopJingle(){
  if(!P.jingle) return;
  P.jingle=false;
  if(LP.chip && LP.chip.music) LP.chip.music({action:"stop"});
}
function pause(){
  if(!P.inView) return;
  if(P.roomHold){ clearTimeout(P.roomHold); P.roomHold=0; }
  P.holdFired=false; clearHold();
  persistOuting();
  stopTimer(); stopGameTimer(); saveNow();
  stopAiJob();
  silenceWeather();
  stopJingle();
}
function resume(){
  P.resumeOuting=true;
  if(isOpen()){
    refreshTime(); P.wasAsleep=inBedSleep(); maybeNamePrompt(); render(); startTimer(); refreshUsage();
    if(P.sub==="game" && P.game && P.game.started && !gameDone()) startGameTimer();
  } else {
    backgroundDay();
  }
}
function openPet(){
  LP.show("pet");
  LP.showPad(true);
}
function lang(){
  renderKeys();
  buildIcons();
  P.panelKey="";
  render();
}

/* ---------- home icon and the background day ---------- */
function iconState(){
  var s=P.save;
  if(!s || s.stage==="egg") return "egg";
  if(s.travel) return "away";
  if(inBedSleep()) return "sleep";
  if(Pet.wants(s)) return "need";
  return "face";
}
/* The pack's grids are k/d/m/p; the home screen's icon function wants 0-3 and dots. */
function coreRows(grid){
  var out=[], r, c, ch, t;
  if(!grid || grid.length!==16) return null;
  for(r=0;r<16;r++){
    var line=String(grid[r]), row="";
    if(line.length!==16) return null;
    for(c=0;c<16;c++){
      ch=line.charAt(c);
      t=ch==="." ? "." : TONE_OF[ch];
      if(t===undefined) t=".";
      row+=String(t);
    }
    out.push(row);
  }
  return out;
}
function homeState(){
  var s=P.save;
  if(!s) return "none";
  return [s.stage,s.travel,iconState(),P.souv.length,+s.boxSeen||0].join("|");
}
function homeMaybeRender(){
  var h=$("v-home");
  if(!h || h.hidden) return;
  var sig=homeState();
  if(sig===P.homeSig) return;
  P.homeSig=sig;
  LP.renderHome();
}
function icon(){
  var pack=packOf(P.save), set=(pack && pack.homeIcons)||{};
  var rows=set[iconState()] || null;
  if(!rows || rows.length!==16) rows=ICON_ROWS;
  P.homeSig=homeState();
  scheduleBackground();
  return coreRows(rows) || ICON_ROWS.slice();
}
function tag(){
  if(!P.save) return "";
  return P.souv.length > (+P.save.boxSeen||0) ? tr("pet.tag") : "";
}
function bindRoom(){
  var cv=$("pet-cv");
  if(!cv || cv.getAttribute("data-bound")) return;
  cv.setAttribute("data-bound","1");
  cv.addEventListener("pointerdown",function(){
    if(document.hidden || !isOpen() || P.sub || P.save && (P.save.travel || P.outing)) return;
    if(P.roomHold){ clearTimeout(P.roomHold); }
    P.roomHold=setTimeout(function(){
      P.roomHold=0;
      if(!document.hidden) patPet();
    },HOLD_MS);
  });
  ["pointerup","pointercancel","pointerleave"].forEach(function(t){
    cv.addEventListener(t,function(){ if(P.roomHold){ clearTimeout(P.roomHold); P.roomHold=0; } });
  });
  /* The play field itself moves catch and climb: hold the left or right half, in addition to the chin pad. */
  cv.style.touchAction="none";
  function gameSide(e){
    var r=cv.getBoundingClientRect();
    var left=e.clientX < r.left + r.width/2;
    P.gameHeld.left=left; P.gameHeld.right=!left;
  }
  function gameTouch(e){
    if(document.hidden || !isOpen() || P.sub!=="game" || !P.game) return;
    if(gameDone()){ exitGame(); return; }
    if(!P.game.started){ startRound(); return; }
    P.gameTouch=e.pointerId;
    gameSide(e);
    try{ if(cv.setPointerCapture) cv.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
  }
  function gameTouchEnd(e){
    if(P.gameTouch==null || (e && e.pointerId!==P.gameTouch)) return;
    P.gameTouch=null;
    P.gameHeld.left=false; P.gameHeld.right=false;
  }
  cv.addEventListener("pointerdown",gameTouch);
  cv.addEventListener("pointermove",function(e){
    if(P.gameTouch==null || e.pointerId!==P.gameTouch) return;
    gameSide(e);
    e.preventDefault();
  });
  ["pointerup","pointercancel","pointerleave"].forEach(function(t){ cv.addEventListener(t,gameTouchEnd); });
  cv.addEventListener("contextmenu",function(e){ e.preventDefault(); });
}
bindRoom();
/* normal boots also get pause/resume from core; this keeps a game's 20 fps loop stopped in nostore mode too */
document.addEventListener("visibilitychange",function(){
  if(document.hidden){ stopGameTimer(); return; }
  if(P.inView && isOpen() && P.sub==="game" && P.game && P.game.started && !gameDone()) startGameTimer();
});

LP.padRoute("pet",function(b,down){
  if(!isOpen()) return false;
  if(P.sub==="game"){
    if(gameDone()){ if(down) exitGame(b==="a"); return true; } /* any key: back to the room */
    if(!P.game || !P.game.started){
      if(b==="b"){ if(down) exitGame(); return true; }         /* B is still back, not a start */
      if(down) startRound();                                   /* any other first key starts the round */
      return true;
    }
    if(b==="a"){ if(down) pressA(); return true; }
    if(b==="b"){ if(down) exitGame(); return true; }
    if(b==="left" || b==="right"){ P.gameHeld[b]=!!down; return true; }
    return true;                                  /* up/down/start/select do nothing in a play pack */
  }
  if(b==="a"){
    if(down){ P.ignoreAUp=false; clearHold(); startHold(); }
    else {
      if(P.ignoreAUp){ P.ignoreAUp=false; return true; }
      clearHold();
      if(P.holdFired){ P.holdFired=false; return true; }
      pressA();
    }
    return true;
  }
  if(!down) return true;
  if(b==="up" || b==="left" || b==="down" || b==="right"){ nav(b==="up" || b==="left"?-1:1,b); return true; }
  if(b==="b"){ back(); return true; }
  if(b==="start"){ openMenu(); return true; }
  /* SELECT stays empty: reserved for switching rooms when more species come (visits) */
  if(b==="select"){ return true; }
  return true;
});

/* The home screen stays visible across 22:00 and the day's outing hour; the runtime's existing clock tick is the
   only timer, and on it we ask for the pet's day only when the icon or the day has actually changed. No new timer. */
function clockHome(){
  if(P.restoring || P.bgRun || !$("v-home") || $("v-home").hidden) return;
  var s=P.save;
  if(!s || s.stage==="egg") return;
  var key=dayKey(now()), td=s.today||{}, need=false;
  if(td.day!==key) need=true;
  if(!need && !P.outing && !td.back && td.out==null){
    var o=Pet.outingToday(s,key);
    if(o && hourNow()>=o.hour) need=true;
  }
  if(!need && homeState()!==P.homeSig) need=true;
  if(!need) return;
  backgroundDay();
  homeMaybeRender();
}

LP.builtin({
  id:"pet", label:"app.pet", icon:icon, view:"pet",
  open:openPet, enter:enter, leave:leave, tag:tag, lang:lang,
  ready:loadStorage, nostore:function(){
    P.nostore=true; P.readFailed=true; P.loaded=true; P.readTried=true;
    LP.setStatus("status.unsaved");
    if(isOpen()){ ensurePet(); render(); }
    homeMaybeRender();
  },
  clock:clockHome,
  pause:pause, resume:resume,
  restore:function(){
    /* the restore is about to replace every document: nothing may write the old or a fresh pet over it */
    P.restoring=true;
    if(P.restoreTimer) clearTimeout(P.restoreTimer);
    /* a successful restore reloads at once; if it fails instead, let writes come back rather than leave the pet mute forever */
    P.restoreTimer=setTimeout(function(){ P.restoring=false; P.restoreTimer=0; },60000);
    if(P.saveTimer){ clearTimeout(P.saveTimer); P.saveTimer=0; }
    if(P.bgTimer){ clearTimeout(P.bgTimer); P.bgTimer=0; }
    P.pickSeq++;
    P.outing=null;
    stopAiJob();
  }
});

/* ---------- ?debug: see every state without waiting days ---------- */
if(/[?&]debug\b/.test(location.search)){
  window.LOPDA_DEBUG=window.LOPDA_DEBUG||{};
  window.LOPDA_DEBUG.pet={
    advance:function(hours){
      if(!P.save) return null;
      var h=+hours||0;
      P.save.last=now()-h*HOUR;
      if(P.save.today) P.save.today.day=dayKey(P.save.last);
      P.eggMs=0;
      refreshTime(); render();
      return P.save;
    },
    setDay:function(n){
      if(!P.save) return null;
      n=Math.max(0,Math.floor(+n||0));
      var key=dayKey(now()), sp=Pet.SPECIES[P.save.species]||null;
      P.save.opened=n;
      P.save.lastDay=key;
      if(sp && sp.growth && P.save.stage!=="egg"){
        if(n>=sp.growth.adult){
          P.save.stage="adult";
          if(!P.save.form) P.save.form=Pet.adultForm(P.usage||{},P.save.species);
        } else if(n>=sp.growth.child && P.save.stage==="baby"){
          P.save.stage="child";
        }
      }
      saveNow(); render();
      return P.save;
    },
    hatch:function(){ hatchNow(true); return P.save; },
    /* a fixed seed for a play pack (tests and the owner can replay the same round) */
    gameSeed:function(n){ P.gameSeed=(n==null?null:(+n>>>0)); return P.gameSeed; },
    gameState:function(){ var st=gameState(); return st?JSON.parse(JSON.stringify(st)):null; },
    mood:function(){ return moodFace(now()); },
    setStats:function(h,j,awakeH,awakeJ){
      if(!P.save) return null;
      if(h!=null) P.save.hunger=Math.max(0,Math.min(5,Math.floor(+h||0)));
      if(j!=null) P.save.joy=Math.max(0,Math.min(5,Math.floor(+j||0)));
      if(awakeH!=null) P.save.awakeHunger=Math.max(0,+awakeH||0);
      if(awakeJ!=null) P.save.awakeJoy=Math.max(0,+awakeJ||0);
      P.moodClearUntil=0; saveSoon(); render();
      return P.save;
    },
    forceOuting:function(){
      if(!P.save || P.save.stage==="egg") return P.save;
      startOuting(hourNow());
      if(P.outing) P.outing.left=2;
      return P.save;
    },
    forcePick:function(kind){
      if(!P.save) return null;
      P.pickSeq++;
      var td=P.save.today;
      if(!td) return null;
      td.picked=true; td.used=false; td.shown=null; td.pick=null;
      if(kind==="date" || kind==="word" || kind==="book" || kind==="film"){
        var pick={kind:kind};
        if(kind==="date"){
          var n=dayNumberNow();
          pick.in=2; pick.day=(n===null?0:n+2);
        } else if(kind==="word"){
          var w=null;
          try{ if(LP.dict && LP.dict.bookSummary && LP.dict.bookSummary().n>0 && LP.dict.pickWord) w=LP.dict.pickWord(1); }catch(e){}
          pick.word=w||tr("pet.word.demo");
        } else if(kind==="book"){
          try{ var cur=LP.reader && LP.reader.current && LP.reader.current(); if(cur && cur.id) pick.id=cur.id; }catch(e){}
          if(!pick.id) pick.id="demo";
        }
        td.pick=pick; td.shown=kind;
      }
      saveSoon(); renderKeys(); render();
      return P.save;
    },
    setWeather:function(w){
      P.weatherOverride=(w==="sun"||w==="cloud"||w==="rain"||w==="snow"||w==="wind") ? w : null;
      render();
      return weatherNow();
    },
    souv:function(id){
      var s=findSouv(id);
      return s ? JSON.parse(JSON.stringify(s)) : null;
    },
    souvShelf:function(id){ setShelf(id||null); return P.save ? P.save.shelf : null; },
    souvState:function(id){
      var s=findSouv(id);
      if(!s) return null;
      var v=souvenirView(s,P.save && P.save.shelf===s.id);
      return v ? JSON.parse(JSON.stringify(v)) : null;
    },
    /* Move one souvenir's shelf age without waiting days; e2e and the owner's debug screen use this. */
    souvAge:function(id,hours){
      var s=findSouv(id);
      if(!s) return null;
      var ms=Math.round((+hours||0)*HOUR);
      if(s.plantedAt!=null && P.save && P.save.shelf===s.id) s.plantedAt-=ms;
      else s.grownMs=Math.max(0,(+s.grownMs||0)+ms);
      if(P.refs && !P.nostore) P.refs.souv.doc(s.id).update({grownMs:+s.grownMs||0,plantedAt:s.plantedAt!=null?s.plantedAt:null}).catch(function(){});
      render();
      return JSON.parse(JSON.stringify(s));
    },
    finishGame:function(score){
      if(P.sub!=="game" || !P.game) return null;
      var st=gameState();
      if(!st) return null;
      st.score=Math.max(0,Math.floor(+score||0));
      st.done=true;
      st.joy=Play && Play.joyFor ? Play.joyFor(P.game.id,st.score) : 1;
      stopGameTimer();
      if(!P.game.applied){ P.game.applied=true; applyGameJoy(st); }
      renderKeys(); render();
      return st;
    },
    save:function(){ return P.save ? JSON.parse(JSON.stringify(P.save)) : null; },
    spot:function(){
      var s=P.lastScene;
      if(!s) return null;
      var out={x:s.petX,y:s.petY,zz:!!s.zz,stage:P.save?P.save.stage:null,act:P.action||"",phase:P.task?P.task.phase:"",dir:s.dir||"",awake:P.awakeLeft,flashes:P.flashSeq,outing:!!P.outing};
      var at=Art.resolve ? Art.resolve(s,roomNow()) : null;
      if(at && at.prop) out.prop={x:at.prop.x,y:at.prop.y,w:at.prop.w,h:at.prop.h};
      return out;
    },
    room:function(){
      var r=roomNow();
      return {id:r.id,spots:r.spots,slots:r.slots,solids:r.solids};
    },
    flag:function(n){ return flagWithNumber(n); }
  };
}
})();
