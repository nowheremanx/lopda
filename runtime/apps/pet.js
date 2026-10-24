/*
 * Lo-PDA runtime: the built-in pet 宠物 / Pet (briefs/pet/design.md; decisions.md section 37).
 * The rules live in petsim.js (window.LopdaPet) and the art in petart.js (window.LopdaPetArt); this file owns the
 * screen, the keys, the timers and the storage. One IIFE, ES5 style, talks to the rest only through window.LP.
 *
 * Screen: the room is an 81 x 60 canvas at 4 CSS pixels a pixel (324 x 240), then eight 44 px icon targets and the
 * soft keys; 328 px of content, so it fits the 331 x 359 LCD with nothing to scroll. Everything on the canvas is
 * putImageData from a Uint8Array of tone indices: never drawImage after putImageData (Safari swaps red and blue).
 * Sub-screens (food, play, look, box) open over the room at the same 324 x 240, on paper with ink text.
 *
 * Storage: data/users/local/pet (design.md 8 plus petsim's lastMeal, awakeHunger, awakeJoy and today, plus boxSeen
 * and today's outing phase/remaining/hour) and data/users/local/pet/souvenirs/<id> {name, line, px, at, ai:false}.
 * A failed read is not "no pet": the program then keeps an in-memory pet and never writes an egg over a save it
 * could not read (the status bar says 未存档).
 */
(function(){
"use strict";

var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, I18N=LP.I18N;
var Pet=window.LopdaPet, Art=window.LopdaPetArt;

var HOUR=3600000, DAY=86400000, SCALE=4;
var ROOM_W=81, ROOM_H=60;
var ICON_NAMES=["food", "play", "wash", "light", "look", "box", "mail", "call"];
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
var SWEEP_MS=1000, EGG_MS=60000, OUT_MS=20000, HOLD_MS=600;

var P={
  save:null, loaded:false, nostore:false, readTried:false, readFailed:false,
  refs:null, souv:[], usage:null, resumeOuting:false,
  sub:null, sel:0, frame:0,
  anim:0, hold:0, roomHold:0, holdFired:false,
  eggMs:0, action:null, actionUntil:0, heartUntil:0,
  washUntil:0, flash:null, outing:null, foodSel:0, play:null, boxPage:0,
  confirmStage:0, panelKey:"",
  saveTimer:0, lastWants:null, bringing:false
};
var ctx=null, buf=null, im=null, iconCvs={}, iconBuilt=false;

function now(){ return Date.now(); }
function tz(){ return -new Date().getTimezoneOffset(); }
function isOpen(){ var v=$("v-pet"); return !!v && !v.hidden; }
function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function beep(name){ if(!document.hidden && isOpen()) LP.sfx(name); }
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
/* an icon or a souvenir picture: every pixel is paper or one of the four tones, so a canvas holds no stray colours */
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
  if(!save.marks || typeof save.marks!=="object") save.marks={ant:0,pat:1,eye:0};
  if(save.light===undefined) save.light=true;
  if(save.boxSeen==null) save.boxSeen=0;
  if(!save.today || typeof save.today!=="object") save.today={day:null,shown:null,out:null,back:false,snacks:0,pats:0,played:0,burp:false};
  return save;
}
function packOf(save){
  var sp=save && save.species;
  return Art.PACKS[sp] || Art.PACKS[defaultSpecies()];
}
function saveSoon(){
  if(P.nostore || !P.refs || !P.save) return;
  if(P.saveTimer) return;
  P.saveTimer=setTimeout(function(){ P.saveTimer=0; saveNow(); },1000);
}
function saveNow(){
  if(P.saveTimer){ clearTimeout(P.saveTimer); P.saveTimer=0; }
  if(P.nostore || !P.refs || !P.save) return;
  var data=JSON.parse(JSON.stringify(P.save));
  P.refs.doc.set(data).catch(function(){ P.nostore=true; LP.setStatus("status.unsaved"); });
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
  if(P.save || !P.loaded || P.nostore) return false;
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
      if(!o.name || !o.line || typeof o.px!=="string" || o.px.length!==256) return;
      list.push({id:doc.id, name:String(o.name), line:String(o.line), px:o.px, at:+o.at||0, ai:!!o.ai});
    });
    list.sort(function(a,b){ return (a.at||0)-(b.at||0); });
    P.souv=list;
  },function(){ bad=true; });
  Promise.all([docP,souvP]).then(function(){
    P.loaded=true;
    if(bad){
      P.readFailed=true; P.nostore=true;
      LP.setStatus("status.unsaved");
      if(!P.save) P.save=freshSave();
    } else if(P.save){
      P.nostore=false;
    }
    readUsage().then(function(){
      backfillForm();
      if(isOpen()){ ensurePet(); refreshTime(); render(); }
      if(!$("v-home").hidden) LP.renderHome();
    });
  });
}

/* ---------- catching up and the day ---------- */
function flash(i){ P.flash={i:i,left:6}; }
function wantsOf(){ return P.save ? Pet.wants(P.save) : null; }
function handleEvents(events){
  var t=now();
  (events||[]).forEach(function(e){
    if(e==="travel") beep("err");
    else if(e==="hungry"){ flash(0); beep("coin"); }
    else if(e==="poop"){ flash(2); beep("coin"); }
    else if(e==="woke"){ P.action="woke"; P.actionUntil=t+2500; beep("ok"); }
  });
  var w=wantsOf();
  if(w && w!==P.lastWants) flash(w==="food"?0:2);
  P.lastWants=w;
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
}

/* ---------- the day's outing ---------- */
function recentNames(){
  return P.souv.slice(Math.max(0,P.souv.length-5)).map(function(s){ return s.name; });
}
/* petsim.builtinSouvenir avoids table entries whose `name` is recent; pack entries carry only an id, so give
   each candidate its localized name before choosing (the id stays for the strings and the picture). */
function souvenirTable(pack){
  return ((pack && pack.souvenirs)||[]).map(function(e){
    var t=dirText(e,e.id);
    return {id:e.id, grid:e.grid, px:e.px, name:t.name, line:t.line};
  });
}
function dirText(entry,id){
  var key="pet.souv."+id, line=tr(key+".line");
  var name=entry && entry.name ? entry.name : tr(key);
  if(name===key) name=entry && entry.id ? entry.id : id;
  if(line==="pet.souv."+id+".line") line=entry && entry.line ? entry.line : "";
  return {name:name, line:line};
}
function pxFromGrid(grid){
  var out="", r, c;
  for(r=0;r<16;r++){
    var line=String((grid||[])[r]||"");
    for(c=0;c<16;c++){ var t=TONE_OF[line.charAt(c)]; out+=t===undefined?"3":String(t); }
  }
  return out;
}
function makeSouvenir(entry){
  var id=(entry && entry.id) || "souv";
  var txt=dirText(entry,id);
  return {
    id:LP.uid(), name:txt.name, line:txt.line,
    px:entry && entry.px ? String(entry.px) : pxFromGrid(entry && entry.grid),
    at:now(), ai:!(entry && entry.ai===false)
  };
}
function pushSouvenir(s){
  P.souv.push(s);
  P.souv.sort(function(a,b){ return (a.at||0)-(b.at||0); });
  if(!$("v-home").hidden) LP.renderHome();
}
/* Returns a promise for the saved souvenir, or null when the write failed. The souvenir enters the box only after
   the document landed: the programme marks the trip/outing done on that promise, so a failed write is retried on
   the next visit instead of losing the souvenir with the day marked complete. */
function addSouvenir(entry){
  if(!entry) return Promise.resolve(null);
  var s=makeSouvenir(entry);
  s.ai=false;
  var data={name:s.name, line:s.line, px:s.px, at:s.at, ai:false};
  if(P.nostore || !P.refs){
    pushSouvenir(s);
    return Promise.resolve(s);
  }
  return P.refs.souv.doc(s.id).set(data).then(function(){
    pushSouvenir(s);
    return s;
  },function(){
    LP.setStatus("status.unsaved");
    if(!$("v-home").hidden) LP.renderHome();
    return null;
  });
}
function outingSouvenir(){
  var seed=(Pet.daySeed(P.save.born,dayKey(now()))^0x5bd1e995)>>>0;
  return Pet.builtinSouvenir(Pet.rng(seed),recentNames(),souvenirTable(packOf(P.save)));
}
/* The outing's phase lives in today so leaving or reloading during the ~20 s does not eat the day's souvenir:
   `outPhase`/`outLeft`/`outHour` are resumed on the next visit; `out`/`back` are written only once the souvenir
   document has landed. */
function persistOuting(){
  if(!P.save || !P.save.today) return;
  if(P.outing){
    P.save.today.outPhase=P.outing.phase;
    P.save.today.outLeft=P.outing.left;
    if(P.outing.hour!=null) P.save.today.outHour=P.outing.hour;
  }
}
function startOuting(hour){
  if(!P.save) return;
  if(!P.save.today) P.save.today={day:dayKey(now()),shown:null,out:null,back:false,snacks:0,pats:0,played:0,burp:false};
  var left=Math.max(1,Math.round(OUT_MS/500));
  P.save.today.outPhase="out"; P.save.today.outLeft=left; P.save.today.outHour=hour;
  P.outing={phase:"out", left:left, souv:null, hour:hour, done:false, day:dayKey(now())};
  P.resumeOuting=false;
  saveSoon(); render();
}
function resumeOuting(){
  var td=P.save && P.save.today;
  if(!td || !td.outPhase || td.back || td.day!==dayKey(now())) return false;
  var left=Math.max(1,+td.outLeft||1), back=td.outPhase==="back";
  P.outing={phase:back?"back":"out", left:back?4:left, souv:back?outingSouvenir():null,
    hour:+td.outHour||hourNow(), done:false, day:td.day};
  render();
  return true;
}
function finishOuting(){
  var o=P.outing; if(!o || o.done) return;
  o.done=true;
  addSouvenir(o.souv).then(function(saved){
    if(saved && P.save && P.save.today){
      P.save.today.out=o.hour;
      P.save.today.back=true;
      P.save.today.outPhase=""; P.save.today.outLeft=0;
      P.outing=null;
      P.action="happy"; P.actionUntil=now()+2000;
      beep("coin"); saveNow(); render();
    } else {
      /* leave the phase in today: the next visit tries the write again */
      P.outing=null; P.resumeOuting=false; render();
    }
  });
}
function stepOuting(){
  if(!P.outing || P.outing.done) return;
  P.outing.left--;
  if(P.outing.phase==="out" && P.outing.left<=0){
    P.outing.phase="back"; P.outing.left=4; P.outing.souv=outingSouvenir();
    persistOuting(); saveSoon(); render();
  } else if(P.outing.phase==="back" && P.outing.left<=0){
    persistOuting();
    finishOuting();
  } else {
    persistOuting(); render();
  }
}
function checkOuting(){
  if(!P.save || P.outing || P.save.travel || P.save.stage==="egg") return;
  var td=P.save.today||{};
  if(td.outPhase && !td.back){
    if(P.resumeOuting){ P.resumeOuting=false; resumeOuting(); }
    return;
  }
  if(td.out!=null) return;
  var key=dayKey(now()), h=hourNow();
  var o=Pet.outingToday(P.save,key);
  if(o && o.hour===h) startOuting(h);
}

/* ---------- actions ---------- */
function patPet(){
  if(document.hidden || !P.save || P.save.travel || P.outing || P.save.stage==="egg") return;
  var before=P.save.today ? P.save.today.pats : 0;
  P.save=Pet.pat(P.save,dayKey(now()));
  if((P.save.today ? P.save.today.pats : 0)!==before){
    P.action="happy"; P.actionUntil=now()+2000; P.heartUntil=now()+2000;
    beep("ok"); saveSoon(); render();
  }
}
function feed(kind){
  if(!P.save) return;
  var t=now(), burp=false;
  P.save=Pet.feed(P.save,kind,t,dayKey(t));
  if(kind==="snack" && P.save.today && P.save.today.burp){ burp=true; P.save.today.burp=false; }
  P.sub=null; P.action=burp?"burp":"eat"; P.actionUntil=t+(burp?1200:2000);
  beep(burp?"err":"ok");
  saveSoon(); renderKeys(); render();
}
function washPet(){
  if(!P.save) return;
  P.save=Pet.wash(P.save);
  P.washUntil=now()+SWEEP_MS; P.action="wash"; P.actionUntil=now()+SWEEP_MS;
  beep("ok"); saveSoon(); render();
}
function toggleLight(){
  if(!P.save) return;
  P.save=Pet.setLight(P.save,!P.save.light);
  P.action=null; P.actionUntil=0;
  beep("tick"); saveSoon(); render();
}
function callPet(){
  var w=wantsOf();
  if(!w) return;
  if(w==="food"){ P.lookAt="food"; P.action="wait"; }
  else { P.lookAt="wash"; P.action="wait"; }
  P.actionUntil=now()+3000;
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
function hatchNow(silent){
  if(!P.save || P.save.stage!=="egg") return;
  P.save=Pet.hatch(P.save);
  P.eggMs=0; P.action="happy"; P.actionUntil=now()+3000;
  if(!silent){
    beep("ok");
    if(isOpen() && LP.chip && LP.chip.music) LP.chip.music({action:"play",song:JINGLE,loop:false});
  }
  saveNow(); render();
  if(!$("v-home").hidden) LP.renderHome();
}
function restartPet(){
  P.save=freshSave();
  P.save.boxSeen=P.souv.length;              /* the box is kept and already seen */
  P.eggMs=0; P.sub=null; P.confirmStage=0; P.action=null; P.outing=null; P.play=null;
  P.lastWants=null; P.boxPage=0; P.bringing=false;
  saveNow(); beep("ok"); LP.toast(tr("pet.restart.done")); renderKeys(); render();
}

/* ---------- the four sub-screens ---------- */
function openLook(){ P.sub="look"; P.confirmStage=0; renderKeys(); beep("tap"); render(); }
function openBox(){
  P.sub="box"; P.boxPage=0;
  if(P.save){ P.save.boxSeen=P.souv.length; saveNow(); }
  if(!$("v-home").hidden) LP.renderHome();
  renderKeys(); beep("tap"); render();
}
function openFood(){ P.sub="food"; P.foodSel=0; renderKeys(); beep("tap"); render(); }
function openPlay(){
  P.sub="play"; P.play={round:1,wins:0,side:0,last:null,done:false};
  renderKeys(); beep("tap"); render();
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
function playRound(){
  var pl=P.play; if(!pl || pl.done) return;
  var guess=pl.side?"right":"left", look=Math.random()<0.5?"left":"right";
  pl.last={guess:guess,look:look,hit:guess===look};
  if(pl.last.hit) pl.wins++;
  if(pl.round>=5){
    P.save=Pet.play(P.save,pl.wins,dayKey(now()));
    pl.done=true; pl.result=pl.wins>=3?2:1;
    P.action="happy"; P.actionUntil=now()+2500; P.heartUntil=now()+2500;
    beep(pl.wins>=3?"win":"ok"); saveSoon();
  } else {
    pl.round++;
    beep("tick");
  }
  render();
}
function pasteSouvenir(){
  var s=P.souv[P.boxPage];
  if(!s || !LP.notes) return;
  LP.notes.append(tr("pet.noteTitle"), s.name+"\n"+s.line).then(function(){
    beep("ok"); LP.toast(tr("pet.box.pasted"));
  },function(){ beep("err"); LP.toast(tr("pet.box.pastefail")); });
}
function pickFood(kind){ feed(kind==="snack"?"snack":"meal"); }
function nav(dir){
  if(P.sub==="food"){ P.foodSel=1-P.foodSel; beep("move"); render(); return; }
  if(P.sub==="play"){ if(P.play && !P.play.done){ P.play.side=1-P.play.side; beep("move"); render(); } return; }
  if(P.sub==="box"){
    if(!P.souv.length) return;
    P.boxPage=Math.max(0,Math.min(P.souv.length-1,P.boxPage+dir));
    beep("move"); render(); return;
  }
  if(P.sub) return;
  P.sel=(P.sel+dir+8)%8;
  beep("move"); render();
}
function useSelected(){
  if(!P.save) return;
  switch(P.sel){
    case 0: openFood(); break;
    case 1: openPlay(); break;
    case 2: washPet(); break;
    case 3: toggleLight(); break;
    case 4: openLook(); break;
    case 5: openBox(); break;
    case 6: /* 信 is dark until Part D */ break;
    case 7: callPet(); break;
  }
}
function pressA(){
  if(P.holdFired){ P.holdFired=false; return; }
  if(!P.save) return;
  if(P.sub==="food"){ pickFood(P.foodSel?"snack":"meal"); return; }
  if(P.sub==="play"){
    if(P.play && P.play.done){ P.sub=null; renderKeys(); render(); return; }
    playRound(); return;
  }
  if(P.sub==="look"){ confirmNext(); return; }
  if(P.sub==="box"){ pasteSouvenir(); return; }
  if(P.sub) return;
  if(P.save.travel){ bringBack(); return; }
  useSelected();
}
function back(){
  if(P.sub){
    P.sub=null; P.confirmStage=0; P.play=null;
    beep("tap"); renderKeys(); render();
  }
}
function mailKey(){ /* START 信: the mail is dark in Part C */ }

/* ---------- room ---------- */
function seasonOf(t){
  var m=localDate(t).getUTCMonth()+1;
  if(m>=3 && m<=5) return "spring";
  if(m>=6 && m<=8) return "summer";
  if(m>=9 && m<=11) return "autumn";
  return "winter";
}
function markNames(save,pack){
  var m=save.marks||{}, out={};
  out.ant=(pack.marks.ant||["ball"])[m.ant|0] || "ball";
  out.pat=(pack.marks.pat||["plain"])[m.pat|0] || "plain";
  out.eye=(pack.marks.eye||["dot"])[m.eye|0] || "dot";
  return out;
}
function petGrid(save,pack,t,asleepNow){
  if(save.stage==="egg") return shift(pack.egg, P.frame?1:0);
  if(save.stage==="baby") return shift(pack.baby, P.frame?1:0);
  if(save.stage==="child") return shift(pack.child, P.frame?1:0);
  var marks=markNames(save,pack), a=P.action || "idle";
  var face="idle1";
  if(a==="eat") face=P.frame?"eat2":"eat1";
  else if(a==="happy" || a==="burp") face="happy";
  else if(a==="sleep" || asleepNow) face="sleep";
  else if(a==="wait") face="wait";
  else if(a==="wash" || a==="woke") face=P.frame?"surprised":"happy";
  else face=P.frame?"idle2":"idle1";
  if(save.stage==="adult"){
    var g=pack.adult(save.form||"plain",marks);
    if(face==="happy") return shift(g,-1);
    if(face==="sleep" || face==="wait") return g;
    return shift(g,P.frame?1:0);
  }
  return shift(pack.frames({
    ant:marks.ant, pat:marks.pat, eye:marks.eye, face:face
  }),0);
}
function roomScene(){
  var save=P.save, t=now(), pack=packOf(save), h=hourNow(), min=localDate(t).getUTCMinutes();
  var night=h<6 || h>=19;
  var asleepNow=save ? Pet.asleep(save,h,min) : false;
  var scene={
    pack:pack, night:night, season:seasonOf(t),
    dayOfMonth:localDate(t).getUTCDate(),
    lightOff:!!(save && save.light===false && asleepNow),
    bowlFull:save ? save.hunger>=2 : true,
    mess:save ? save.mess : 0
  };
  if(!save) return scene;
  if(save.travel){ scene.sign=true; return scene; }
  if(P.outing && P.outing.phase==="out") return scene;

  var px=40, py=36, w=Pet.wants(save);
  scene.pet=petGrid(save,pack,t,asleepNow);
  if(save.stage==="baby"){ px=42; py=40; }
  else if(save.stage==="child"){ px=41; py=38; }
  else if(save.stage==="egg"){ px=40; py=38; }

  if(P.outing && P.outing.phase==="back"){
    px=8+(4-P.outing.left)*9;
    if(save.stage==="egg"){
      scene.pet=shift(pack.egg, P.frame?1:0);
    } else if(save.stage==="baby" || save.stage==="child"){
      scene.pet=shift(save.stage==="baby"?pack.baby:pack.child, P.frame?1:0);
    } else {
      scene.pet=shift(pack.frames({
        ant:markNames(save,pack).ant, pat:markNames(save,pack).pat, eye:markNames(save,pack).eye,
        face:P.frame?"walk2":"walk1"
      }),0);
    }
    scene.prop=P.outing.souv ? P.outing.souv.grid : null;
    px=Math.max(0,px);
  } else if(w==="food" || P.lookAt==="food"){
    px=16; py=40;
  } else if(w==="wash" || P.lookAt==="wash"){
    px=20; py=40;
  }
  scene.petX=px; scene.petY=py;
  if(P.heartUntil>t) scene.prop=(pack.props||{}).heart;
  if(asleepNow && save.stage!=="egg") scene.zz=true;
  return scene;
}
function drawSweep(){
  var x=P.frame?10:20, y;
  for(y=44;y<59;y++){
    if(x+2<ROOM_W) buf[y*ROOM_W+x]=3;
    if(x+3<ROOM_W) buf[y*ROOM_W+x+3]=0;
  }
}
function renderRoom(){
  initCanvas();
  if(!ctx) return;
  var scene=roomScene();
  Art.drawRoom(buf,ROOM_W,ROOM_H,scene);
  if(P.washUntil>now()) drawSweep();
  paintRoomBuffer();
}

/* ---------- icons ---------- */
function iconTone(i){
  if(i===6) return 1;                                   /* 信: dark (disabled until Part D) */
  if(i===7) return wantsOf()?0:2;                        /* 呼唤: ink only when it wants something */
  if(P.flash && P.flash.i===i && P.flash.left%2===0) return 0;
  return 2;
}
function buildIcons(){
  var wrap=$("pet-icons");
  if(!wrap) return;
  wrap.textContent=""; iconCvs={};
  ICON_NAMES.forEach(function(name,i){
    var b=el("button","pet-ikey"); b.type="button";
    b.setAttribute("aria-label",tr("pet.icon."+name));
    b.setAttribute("aria-pressed","false");
    if(name==="mail") b.setAttribute("aria-disabled","true");
    var cv=el("canvas","pet-icv"); cv.width=8; cv.height=8; cv.setAttribute("aria-hidden","true");
    iconCvs[name]=cv; b.appendChild(cv);
    b.onclick=function(){
      if(P.sub) return;                     /* a sub-screen owns A/B; an icon must not act behind it */
      P.sel=i; beep("move");
      if(P.save && P.save.travel){ bringBack(); return; }
      if(P.outing) return;
      useSelected();
    };
    wrap.appendChild(b);
  });
  iconBuilt=true;
}
function renderIcons(){
  if(!iconBuilt) buildIcons();
  var pack=packOf(P.save), icons=(pack&&pack.icons)||{};
  var wrap=$("pet-icons"); if(!wrap) return;
  var kids=wrap.children;
  ICON_NAMES.forEach(function(name,i){
    var cv=iconCvs[name]; if(!cv) return;
    paintGrid(cv,icons[name]||[],iconTone(i),3);
    var b=kids[i]; if(!b) return;
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
  var s=P.save||{};
  return [P.sub,P.foodSel,P.boxPage,P.confirmStage,I18N.lang,P.souv.length,
    JSON.stringify(P.play), s.stage,s.hunger,s.joy,s.opened,s.born,s.close,s.travel,s.light].join("|");
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
function buildPlay(panel){
  var pl=P.play||{round:1,wins:0,side:0,last:null,done:false};
  panel.appendChild(el("p","pet-ptitle",tr("pet.play.title")));
  panel.appendChild(el("p","pet-pinfo",tr("pet.play.round",{n:Math.min(5,pl.round)})));
  if(pl.done){
    panel.appendChild(el("p","pet-presult",pl.result>=2?tr("pet.play.joy2"):tr("pet.play.joy1")));
    panel.appendChild(el("p","pet-phint",tr("pet.play.close")));
    return;
  }
  var row=el("div","pet-leftright");
  [["left",tr("pet.play.left")],["right",tr("pet.play.right")]].forEach(function(o,i){
    var b=el("button","pet-choice"+(pl.side===i?" on":""),o[1]);
    b.type="button";
    b.onclick=function(){ pl.side=i; playRound(); };
    row.appendChild(b);
  });
  panel.appendChild(row);
  if(pl.last){
    panel.appendChild(el("p","pet-plook",tr("pet.play.looked",{side:tr(pl.last.look==="left"?"pet.play.left":"pet.play.right")})));
    panel.appendChild(el("p","pet-presult",pl.last.hit?tr("pet.play.hit"):tr("pet.play.miss")));
  }
  panel.appendChild(el("p","pet-phint",tr("pet.play.hint")));
}
function buildLook(panel){
  var s=P.save||{}, age=Math.max(0,Math.floor((now()-(+s.born||now()))/DAY));
  /* design.md 8 keeps no meal counter, so this display-only weight counts care actions as meals:
     a base plus 10 g for each, less 5 g for every day it has lived (never below 100 g). */
  var weight=Math.max(100,900+(+s.close||0)*10-age*5);
  panel.appendChild(el("p","pet-ptitle",tr("pet.look.title")));
  var a=el("p","pet-prow"); a.appendChild(el("span","",tr("pet.look.age"))); a.appendChild(el("b","",tr("pet.look.agedays",{n:age}))); panel.appendChild(a);
  var w=el("p","pet-prow"); w.appendChild(el("span","",tr("pet.look.weight"))); w.appendChild(el("b","",tr("pet.look.gram",{n:weight}))); panel.appendChild(w);
  var h=el("p","pet-prow"); h.appendChild(el("span","",tr("pet.look.hunger"))); h.appendChild(boxes(+s.hunger||0)); panel.appendChild(h);
  var j=el("p","pet-prow"); j.appendChild(el("span","",tr("pet.look.joy"))); j.appendChild(boxes(+s.joy||0)); panel.appendChild(j);
  panel.appendChild(el("p","pet-phint",tr("pet.look.hint")));
  var c=el("div","pet-confirm"); c.id="pet-confirm"; panel.appendChild(c);
}
function buildBox(panel){
  panel.appendChild(el("p","pet-ptitle",tr("pet.box.title")));
  if(!P.souv.length){ panel.appendChild(el("p","pet-pempty",tr("pet.box.empty"))); return; }
  P.boxPage=Math.max(0,Math.min(P.souv.length-1,P.boxPage));
  var s=P.souv[P.boxPage];
  var card=el("div","pet-souv");
  var cv=el("canvas","pet-souvcv"); cv.width=16; cv.height=16; cv.setAttribute("aria-hidden","true");
  paintSouvenir(cv,s.px);
  card.appendChild(cv);
  var body=el("div","pet-souvtext");
  body.appendChild(el("b","pet-souvname",s.name));
  body.appendChild(el("p","pet-souvline",s.line));
  body.appendChild(el("p","pet-souvdate",LP.fmt(s.at)));
  card.appendChild(body);
  panel.appendChild(card);
  var foot=el("p","pet-souvfoot");
  foot.appendChild(el("span","",tr("pet.box.page",{i:P.boxPage+1,n:P.souv.length})));
  foot.appendChild(el("span","",tr("pet.box.note")));
  panel.appendChild(foot);
}
function renderPanel(){
  var panel=$("pet-panel");
  if(!panel) return;
  if(!P.sub){ panel.hidden=true; P.panelKey=""; return; }
  panel.hidden=false;
  var key=panelKey();
  if(key===P.panelKey) return;
  P.panelKey=key;
  panel.textContent="";
  if(P.sub==="food") buildFood(panel);
  else if(P.sub==="play") buildPlay(panel);
  else if(P.sub==="look") buildLook(panel);
  else if(P.sub==="box") buildBox(panel);
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
  renderRoom();
  renderIcons();
  renderPanel();
  var away=$("pet-away");
  if(away){
    var trv=!!(P.save && P.save.travel);
    away.hidden=!trv;
    if(trv) away.textContent=tr("pet.away")+" · "+tr("pet.away.hint");
  }
}
function aKeyLabel(){
  if(P.sub==="food") return "pet.sk.pick";
  if(P.sub==="play") return "pet.sk.guess";
  if(P.sub==="look") return "pet.sk.hold";
  if(P.sub==="box") return "pet.sk.paste";
  return "pet.sk.use";
}
function renderKeys(){
  var wrap=$("pet-keys");
  if(!wrap) return;
  LP.softkeys(wrap,{
    select:null,
    start:{label:tr("pet.sk.mail"),disabled:true},     /* 信 is wired in Part D */
    b:{label:tr("sk.back"),fn:back},
    a:{label:tr(aKeyLabel()),fn:function(){
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
function startTimer(){
  stopTimer();
  P.anim=setInterval(tick,500);
}
function stopTimer(){ if(P.anim){ clearInterval(P.anim); P.anim=0; } }
function tick(){
  if(!isOpen() || document.hidden) return;
  P.frame=1-P.frame;
  if(P.flash){ P.flash.left--; if(P.flash.left<=0) P.flash=null; }
  var t=now();
  if(P.save && P.save.today && P.save.today.day!==dayKey(t)){
    if(P.outing) P.outing=null;              /* the previous day's outing does not spill into the new one */
    refreshTime();
  }
  if(P.save && P.save.stage==="egg" && !P.sub && !P.save.travel){
    P.eggMs+=500;
    if(P.eggMs>=EGG_MS) hatchNow(false);
  }
  if(P.actionUntil && t>=P.actionUntil){ P.action=""; P.actionUntil=0; P.lookAt=""; }
  if(P.heartUntil && t>=P.heartUntil) P.heartUntil=0;
  if(P.washUntil && t>=P.washUntil) P.washUntil=0;
  if(P.outing){ stepOuting(); }
  else checkOuting();
  render();
}

/* ---------- hooks ---------- */
function enter(){
  initCanvas();
  renderKeys();
  buildIcons();
  P.resumeOuting=true;
  ensurePet();
  refreshTime();
  render();
  startTimer();
}
function leave(){
  persistOuting();
  stopTimer(); clearHold();
  if(P.roomHold){ clearTimeout(P.roomHold); P.roomHold=0; }
  P.holdFired=false;
  P.sub=null; P.confirmStage=0; P.play=null; P.outing=null;
  saveNow();
  if(LP.chip && LP.chip.music) LP.chip.music({action:"stop"});
}
function pause(){
  if(P.roomHold){ clearTimeout(P.roomHold); P.roomHold=0; }
  P.holdFired=false; clearHold();
  persistOuting();
  stopTimer(); saveNow();
  if(LP.chip && LP.chip.music) LP.chip.music({action:"stop"});
}
function resume(){
  if(!isOpen()) return;
  P.resumeOuting=true;
  refreshTime(); render(); startTimer();
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

/* ---------- home icon, tag and registration ---------- */
function icon(){ return ICON_ROWS.slice(); }
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
  cv.addEventListener("contextmenu",function(e){ e.preventDefault(); });
}
bindRoom();

LP.padRoute("pet",function(b,down){
  if(!isOpen()) return false;
  if(b==="a"){
    if(down){ clearHold(); startHold(); }
    else {
      clearHold();
      if(P.holdFired){ P.holdFired=false; return true; }
      pressA();
    }
    return true;
  }
  if(!down) return true;
  if(b==="left" || b==="right"){ nav(b==="left"?-1:1); return true; }
  if(b==="b"){ back(); return true; }
  if(b==="start"){ mailKey(); return true; }
  if(b==="select"){ return true; }
  return true;
});

LP.builtin({
  id:"pet", label:"app.pet", icon:icon, view:"pet",
  open:openPet, enter:enter, leave:leave, tag:tag, lang:lang,
  ready:loadStorage, nostore:function(){
    P.nostore=true; P.readFailed=true;
    if(!P.save) P.save=freshSave();
    LP.setStatus("status.unsaved");
    if(isOpen()) render();
    if(!$("v-home").hidden) LP.renderHome();
  },
  pause:pause, resume:resume
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
    forceOuting:function(){
      if(!P.save || P.save.stage==="egg") return P.save;
      startOuting(hourNow());
      P.outing.left=2;
      return P.save;
    },
    forcePick:function(kind){
      if(!P.save) return null;
      if(P.save.today) P.save.today.shown=kind||null;
      saveSoon(); render();
      return P.save;
    },
    save:function(){ return P.save ? JSON.parse(JSON.stringify(P.save)) : null; }
  };
}
})();
