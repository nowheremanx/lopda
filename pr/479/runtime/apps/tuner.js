/*
 * Lo-PDA built-in: 收音机 / Tuner, the internet radio (decisions.md section 69).
 *
 * A 1986 portable with a dial: the stations you keep sit on the dial like frequencies, LEFT / RIGHT (or a finger on the
 * dial) turn it, and between two stations there is only hiss. Landing on one tunes it. It plays through one <audio>
 * element of the runtime's page, so it goes on when you leave the program, lock the phone or switch apps (tested on an
 * iPhone before this was built: an audio element keeps playing in the background, Web Audio does not), and the lock
 * screen shows the station with play / pause / next / previous. It stops when another program wants the speaker
 * (LP.claimAudio: the tape machine, an app's music, the cartridge, the microphone), on the sleep timer, or on A.
 *
 * Pages, one view: dial (the hardware screen), menu (START), list (my stations), edit, add (a link), find (the
 * radio-browser.info directory) and help. The station list logic is runtime/stations.js (pure); this file draws,
 * fetches and plays.
 *
 * Saved: data/users/local/tuner {v:1, stations:[{id, name, url, home?, cc?, codec?, kbps?}], last?, seeded:true}.
 * Six stations are put on the dial once, the first time (seeded); deleting them is final. The backup carries the
 * document like any other. Only links are kept, never audio.
 *
 * The network: the streams themselves (the stations' own servers, http or https), a station list (.m3u / .pls / .xspf)
 * the user adds by link, and the directory search (the words typed go to radio-browser.info,
 * a free community directory; nothing else is sent). No stream is ever routed into Web Audio: a stream from another
 * site without CORS would come out silent there. The hiss between stations is the runtime's own noise.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, tr=LP.tr, ST=window.LopdaStations;
var toast=LP.toast, sfx=LP.sfx, own=LP.own, put=LP.put;
var DOC="data/users/local/tuner";
var GAP=88;                      /* px between two stations on the dial */
var SLEEP=[0,15,30,60];          /* SELECT steps the sleep timer through these minutes */
var TUNE_MS=15000, STALL_MS=12000, RETRIES=3;
var DIR_HOSTS=["https://all.api.radio-browser.info","https://de1.api.radio-browser.info","https://de2.api.radio-browser.info"];   /* tried in turn */
var FILE_MAX=1024*1024;

/* the stations on the dial the first time (owner, 2026-11-25). Each one played on an iPhone or in desktop Chrome the day
   it was chosen; they are links to the broadcasters' own public streams. */
var SEED=[
  {name:"UFM 100.3", url:"https://playerservices.streamtheworld.com/api/livestream-redirect/UFM_1003AAC.aac", cc:"SG", codec:"AAC"},
  {name:"FIP", url:"https://icecast.radiofrance.fr/fip-midfi.mp3", cc:"FR", codec:"MP3"},
  {name:"Radio Paradise", url:"https://stream.radioparadise.com/aac-128", cc:"US", codec:"AAC", kbps:128},
  {name:"NHK World Radio", url:"https://nhkworld-radio.nhkworld.jp/hls/live/nhkworld-radio-media2/index.m3u8", cc:"JP"},
  {name:"CCTV-13 新闻（伴音）", url:"https://piccpndali.v.myalicdn.com/audio/cctv13_2.m3u8", cc:"CN"},
  {name:"Rti 臺灣之音", url:"https://streamak0138.akamaized.net/live0138lh-mbm9/_definst_/rti3/chunklist.m3u8", cc:"TW"}
];

var T={
  live:false, page:"dial", back:"dial",
  ref:null, loaded:false, loading:null,
  list:[], last:null,
  pos:0, target:null, glide:null, anim:0, drag:null,
  menu:0, sel:0, editId:null, delArm:false,
  find:{q:"", rows:[], sel:0, busy:false, note:"", seq:0, loaded:false},
  addNote:"", ticker:0, scaleKey:""
};
/* the player: st is the station being played (a saved one, or a directory result heard before it is saved: preview) */
var E={el:null, st:null, preview:false, state:"off", err:"", tries:0, since:0, gen:0, watch:0, retry:0,
  sleepAt:0, sleepMin:0, primed:false, stopping:false, muted:false, msReady:false, resolved:{}};

function byId(id){ return document.getElementById(id); }
function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function button(cls,text,fn){ var b=el("button",cls,text); b.type="button"; b.onclick=fn; return b; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function idx(id){ for(var i=0;i<T.list.length;i++) if(T.list[i].id===id) return i; return -1; }
function saved(url){ for(var i=0;i<T.list.length;i++) if(ST.sameUrl(T.list[i].url,url)) return T.list[i]; return null; }
function on(){ return E.state==="tuning" || E.state==="playing" || E.state==="buffering"; }
function hhmmss(ms){
  var s=Math.floor(ms/1000), h=Math.floor(s/3600), m=Math.floor(s/60)%60;
  return (h ? h+":"+LP.pad2(m) : m)+":"+LP.pad2(s%60);
}

/* ---------- the document ---------- */
function ref(){ if(!T.ref && LP.S.db) T.ref=LP.S.db.doc(DOC); return T.ref; }
function save(){
  /* never over a list we could not read: that would replace the user's stations with what this session added */
  var r=ref(); if(!r || !T.loaded) return;
  put(r,{v:1, stations:T.list.map(function(s){ var o={}; for(var k in s) o[k]=s[k]; return o; }), last:T.last||undefined, seeded:true});
}
function load(){
  if(T.loaded) return Promise.resolve();
  if(T.loading) return T.loading;
  var r=ref(); if(!r) return Promise.resolve();
  T.loading=r.get().then(function(sn){
    var d=sn.exists ? own(sn.data()) : null, list=[];
    if(d && Array.isArray(d.stations)) d.stations.forEach(function(x){
      var s=x && ST.make(x,typeof x.id==="string" && x.id ? x.id : LP.uid());
      if(s && list.length<ST.MAX) list.push(s);
    });
    T.list=list;
    T.last=d && typeof d.last==="string" ? d.last : null;
    T.loaded=true; T.loading=null;
    if(!d || !d.seeded){
      T.list=ST.merge(T.list,SEED.map(function(x){ return ST.make(x,""); }),LP.uid).list;
      save();
    }
    var i=idx(T.last); T.pos=i<0 ? 0 : i;
  },function(e){
    /* the list stays unsaved (save() refuses) and the next open reads again */
    T.loading=null;
    toast(tr("common.readfail",{msg:e && e.message || e}));
  });
  return T.loading;
}

/* ---------- the hiss: white noise through a band-pass into the app bus, under the handheld's volume ---------- */
var H={ctx:null, src:null, gain:null, stopAt:0};
function hiss(level){
  var S=LP.SND, ac=S.ctx || (level>0 ? LP.audio() : null);
  if(!ac || !S.app) return;
  if(H.ctx!==ac){ H={ctx:ac, src:null, gain:null, stopAt:0}; }
  if(level>0 && !H.src){
    var n=ac.sampleRate*2, buf=ac.createBuffer(1,n,ac.sampleRate), d=buf.getChannelData(0), x=0x2545f491;
    for(var i=0;i<n;i++){ x^=x<<13; x^=x>>>17; x^=x<<5; d[i]=((x>>>0)/4294967296)*2-1; }
    var src=ac.createBufferSource(), bp=ac.createBiquadFilter(), g=ac.createGain();
    src.buffer=buf; src.loop=true; bp.type="bandpass"; bp.frequency.value=2400; bp.Q.value=0.6; g.gain.value=0;
    src.connect(bp); bp.connect(g); g.connect(S.app);
    try{ src.start(); }catch(e){}
    H.src=src; H.gain=g;
  }
  if(!H.gain) return;
  LP.wake();
  try{ H.gain.gain.setTargetAtTime(level*0.22,ac.currentTime,0.04); }catch(e){}
  clearTimeout(H.stopAt);
  if(level<=0) H.stopAt=setTimeout(function(){
    if(H.src){ try{ H.src.stop(); }catch(e){} try{ H.src.disconnect(); }catch(e){} }
    H.src=null; H.gain=null;
  },400);
}

/* ---------- the player ---------- */
/* 0.1 s of silence, played once inside the tap that opens the program: iOS lets an audio element that has played from a
   touch play again later without one, so A on the chin pad (a pointerdown, which is not a user activation on touch),
   a reconnect and the lock screen's play button all work */
var silentUrl=null;
function silence(){
  if(!silentUrl && window.LopdaWav) silentUrl=URL.createObjectURL(new Blob([window.LopdaWav.encode(new Float32Array(800),8000)],{type:"audio/wav"}));
  return silentUrl;
}
function player(){
  if(E.el) return E.el;
  var a=E.el=new Audio();
  a.preload="none";
  a.setAttribute("playsinline","");
  a.addEventListener("playing",function(){
    if(a.src===silentUrl || !E.st) return;
    clearTimeout(E.watch); clearTimeout(E.retry);
    E.tries=0; E.err=""; E.resuming=false; E.interrupted=false; E.movedAt=Date.now();
    if(!E.since) E.since=Date.now();
    setState("playing");
    hiss(0);
    msState("playing");
  });
  /* only "waiting" (the element has run dry): Safari sends "stalled" on live streams that go on playing */
  a.addEventListener("waiting",function(){
    if(E.state!=="playing") return;
    E.heard=a.currentTime;
    setState("buffering"); hiss(0.25);
    clearTimeout(E.watch); E.watch=setTimeout(function(){ retry("stall"); },STALL_MS);
  });
  a.addEventListener("error",function(){
    /* a late error from the src before the last dial is not this station's */
    if(!on() || a.src===silentUrl || (E.src && a.src!==E.src)) return;
    var c=a.error && a.error.code;
    retry(c===2 ? "net" : c===3 ? "decode" : "format");
  });
  /* a live stream that "ends" has dropped: dial it again */
  a.addEventListener("ended",function(){ if(on()) retry("net"); });
  /* paused by the phone, not by us: a call, Siri, another app taking the audio, headphones unplugged */
  a.addEventListener("pause",function(){
    /* only a station that was sounding: our own pause before a new src arrives while "tuning" */
    if(E.stopping || a.src===silentUrl || (E.state!=="playing" && E.state!=="buffering")) return;
    interrupted();
  });
  a.addEventListener("timeupdate",function(){
    checkSleep();
    if(a.currentTime!==E.lastT){ E.lastT=a.currentTime; E.movedAt=Date.now(); }
    /* sound is moving again without a "playing" event: back to playing, no reconnect */
    if(E.state==="buffering" && a.src!==silentUrl && a.currentTime>E.heard+0.5){
      clearTimeout(E.watch); clearTimeout(E.retry); E.tries=0;
      setState("playing"); hiss(0); msState("playing");
    }
  });
  level();
  return a;
}
function prime(){
  /* never over a station that is sounding or paused on the lock screen */
  if(E.primed || (E.state!=="off" && E.state!=="nosignal")) return;
  var a=player(), url=silence(); if(!url) return;
  E.primed=true;
  /* "ambient" first, so this silence never stops the user's own podcast */
  LP.setSession(LP.SND.session);
  a.src=url;
  var p=null; try{ p=a.play(); }catch(e){}
  if(p && p.then) p.then(function(){ if(a.src===url){ E.stopping=true; a.pause(); E.stopping=false; } },function(){ E.primed=false; });
}
/* the handheld's volume: step 0 is silence (iOS honours muted); the other steps set the element's volume where the
   browser lets a page set it (iOS leaves it to the phone's own buttons) */
function level(){
  var a=E.el, S=LP.SND; if(!a) return;
  a.muted=S.vol===0 || E.muted;
  try{ a.volume=S.vol ? Math.min(1,(LP.VOL_GAIN[S.vol]||0)/LP.VOL_GAIN[LP.VOL_MAX]) : 0; }catch(e){}
}
function setState(s){
  E.state=s;
  if(s==="off" || s==="nosignal" || s==="paused") LP.holdPlayback(false);
  renderReadout();
}
function tune(st,preview){
  if(!st) return;
  E.st=st; E.preview=!!preview; E.tries=0; E.since=0; E.err="";
  if(!preview && T.last!==st.id){ T.last=st.id; save(); }
  dial();
}
/* (re)connect to E.st. A saved .pls / .m3u link is read first (it lists the stream); everything else goes straight to
   the element, synchronously, so a tap's user activation reaches play() */
function dial(){
  var a=player(), st=E.st, gen=++E.gen;
  clearTimeout(E.watch); clearTimeout(E.retry);
  LP.holdPlayback(true);
  setState("tuning"); hiss(0.5);
  mediaMeta();
  clearTimeout(E.watch); E.watch=setTimeout(function(){ if(gen===E.gen && (E.state==="tuning" || E.state==="buffering")) retry("timeout"); },TUNE_MS);
  var url=E.resolved[st.url] || st.url;
  if(ST.kind(url)==="playlist"){
    readList(url).then(function(p){
      if(gen!==E.gen) return;
      var first=p.stations[0];
      if(!first){ fail(p.kind==="hls" ? "format" : "list"); return; }
      E.resolved[st.url]=first.url;
      go(first.url);
    },function(){ if(gen===E.gen) fail("list"); });
    return;
  }
  go(url);
  function go(u){
    E.stopping=true; try{ a.pause(); }catch(e){} E.stopping=false;
    a.src=u; E.src=a.src; E.heard=Infinity;
    var p=null; try{ p=a.play(); }catch(e){}
    if(p && p.catch) p.catch(function(e){
      if(gen!==E.gen) return;
      /* a resume after an interruption the phone does not allow without a tap: stay "interrupted", A or the lock screen brings it back */
      if(e && e.name==="NotAllowedError"){ if(E.resuming){ E.resuming=false; interrupted(); } else fail("tap"); }
    });
  }
}
function retry(why){
  if(!E.st) return;
  clearTimeout(E.watch); clearTimeout(E.retry);
  /* a link that will not play at all ("format") gets one more try (a phone between networks says the same), the rest three */
  if(E.tries>=(why==="format" ? 1 : RETRIES) || navigator.onLine===false){ fail(navigator.onLine===false ? "offline" : why); return; }
  E.tries++;
  setState("buffering"); hiss(0.3);
  var gen=E.gen;
  E.retry=setTimeout(function(){ if(gen===E.gen && on()) dial(); },1500*E.tries);
}
function fail(why){
  E.err=why; E.gen++;
  silenceEl();
  clearTimeout(E.watch); clearTimeout(E.retry);
  hiss(0); E.since=0;
  setState("nosignal");
  msState("paused");
  if(T.live) sfx("err");
}
function silenceEl(){
  var a=E.el; if(!a) return;
  E.stopping=true;
  try{ a.pause(); }catch(e){}
  a.removeAttribute("src");
  try{ a.load(); }catch(e){}
  E.stopping=false;
}
/* how: "pause" keeps the lock screen's card so its play button can bring the station back */
function stop(how){
  E.gen++; E.interrupted=false; E.resuming=false;
  clearTimeout(E.watch); clearTimeout(E.retry);
  /* the lock screen's pause keeps the src (iOS drops the Now Playing card of an element with none); play dials again */
  if(how==="pause" && E.st && E.el){
    E.stopping=true; try{ E.el.pause(); }catch(e){} E.stopping=false;
    hiss(0); E.since=0; E.tries=0; E.err="";
    setState("paused"); msState("paused");
    return;
  }
  silenceEl();
  hiss(0);
  E.since=0; E.tries=0; E.err="";
  if(how!=="pause"){ E.sleepAt=0; E.sleepMin=0; }
  setState("off");
  msState(how==="pause" ? "paused" : "none");
}
/* A: off goes on with the station under the needle, or the one that failed or was paused (a directory one too) */
function power(){
  if(on()){ stop(); sfx("tap"); return; }
  var st=(E.state==="paused" || E.state==="nosignal") && E.st ? E.st : T.list[clamp(Math.round(T.pos),0,T.list.length-1)];
  if(!st){ sfx("err"); toast(tr("tuner.empty")); return; }
  if(st===E.st && E.preview){ tune(st,true); return; }
  var i=idx(st.id); if(i>=0) T.pos=i;
  tune(st,false);
}
/* the needle moved while the radio is off: a failed or paused station is no longer the one shown */
function moved(){
  if(!on() && E.state!=="off") stop();
  if(!on() && E.preview){ E.st=null; E.preview=false; }
}

/* ---------- the lock screen (Media Session) ---------- */
function mediaMeta(){
  if(!("mediaSession" in navigator) || !E.st) return;
  var ms=navigator.mediaSession;
  try{
    ms.metadata=new window.MediaMetadata({title:E.st.name, artist:tr("tuner.title")+" · Lo-PDA",
      artwork:[{src:"icons/icon-512.png", sizes:"512x512", type:"image/png"}]});
  }catch(e){}
  if(E.msReady) return;
  E.msReady=true;
  var set=function(a,fn){ try{ ms.setActionHandler(a,fn); }catch(e){} };
  set("play",function(){ if(!on() && E.st){ E.tries=0; E.since=0; dial(); } });
  set("pause",function(){ stop("pause"); });
  set("stop",function(){ stop(); });
  set("nexttrack",function(){ step(1,true,true); });
  set("previoustrack",function(){ step(-1,true,true); });
}
function msState(s){
  if(!("mediaSession" in navigator)) return;
  try{ navigator.mediaSession.playbackState=s; }catch(e){}
  if(s==="none") try{ navigator.mediaSession.metadata=null; }catch(e){}
}

/* ---------- sleep timer ---------- */
function sleepStep(){
  var i=SLEEP.indexOf(E.sleepMin), m=SLEEP[(i+1)%SLEEP.length];
  E.sleepMin=m; E.sleepAt=m ? Date.now()+m*60000 : 0;
  sfx(m ? "tick" : "tap");
  toast(m ? tr("tuner.sleep.set",{m:m}) : tr("tuner.sleep.off"));
  renderReadout(); if(T.page==="menu") renderMenu();
}
/* checked on every timeupdate of the element (it keeps coming while the stream plays in the background), every second
   while the screen shows the program, and when the page comes back */
function checkSleep(){
  if(!E.sleepAt || Date.now()<E.sleepAt) return;
  E.sleepAt=0; E.sleepMin=0;
  if(on() || E.state==="paused"){ stop(); toast(tr("tuner.sleep.done")); }
}

/* ---------- the dial ---------- */
function hissAt(pos){
  if(!T.list.length) return 0.5;
  var d=Math.abs(pos-Math.round(pos));
  return clamp(d*2.2,0.08,0.6);
}
function buildScale(){
  var sc=byId("tn-scale"), key=T.list.map(function(s){ return s.id+":"+s.name; }).join("|");
  if(key===T.scaleKey && sc.childNodes.length) return;
  T.scaleKey=key;
  sc.textContent="";
  sc.style.width=(Math.max(1,T.list.length)-1)*GAP+"px";
  T.list.forEach(function(s,i){
    var m=el("span","tn-mark"+(i%2?" low":"")); m.style.left=i*GAP+"px";
    /* the button is the 44 px tap area (sdk/UI.md 3); the name inside it keeps the small print of the scale */
    var lab=button("tn-label",null,function(){ if(T.dragged) return; glideTo(i,on()); });
    lab.appendChild(el("span","tn-label-t",s.name));
    lab.setAttribute("aria-label",tr("tuner.dial.tune",{name:s.name}));
    var num=el("i","tn-num",LP.pad2(i+1));
    m.appendChild(lab); m.appendChild(num);
    sc.appendChild(m);
  });
}
function placeScale(){
  var sc=byId("tn-scale"), w=byId("tn-dial").clientWidth||300;
  sc.style.transform="translateX("+Math.round(w/2-T.pos*GAP)+"px)";
  var near=Math.round(T.pos);
  Array.prototype.forEach.call(sc.childNodes,function(m,i){ m.classList.toggle("near",i===near && Math.abs(T.pos-near)<0.08); });
}
/* glide the needle to station i; tune it on arrival when `andTune` (the radio is on, or a station was picked) */
function glideTo(i,andTune){
  if(!T.list.length) return;
  i=clamp(i,0,T.list.length-1);
  T.target=i; T.glide={i:i, andTune:andTune};
  cancelAnimationFrame(T.anim);
  var from=T.pos, dist=Math.abs(i-from), dur=Math.min(600,160+dist*140), t0=performance.now();
  /* no frames come while the phone is locked or another program has the screen (lock-screen next / previous):
     land at once, or the station would never change */
  if(dist<0.01 || document.hidden || !T.live){ arrive(); return; }
  if(on() && E.st && !E.preview){ E.muted=true; level(); }
  if(andTune || on()) hiss(0.45);
  (function frame(now){
    var k=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-k,3);
    var p=from+(i-from)*e;
    if(Math.floor(p+0.5)!==Math.floor(T.pos+0.5)) sfx("tick");
    T.pos=p; placeScale();
    if(k<1){ T.anim=requestAnimationFrame(frame); return; }
    T.anim=0; arrive();
  })(t0);
  function arrive(){
    T.pos=i; T.target=null; T.glide=null; placeScale();
    var st=T.list[i];
    E.muted=false; level();
    if(!andTune){ moved(); hiss(0); renderReadout(); return; }
    if(on() && E.st && E.st.id===st.id){ hiss(E.state==="playing" ? 0 : 0.3); renderReadout(); return; }
    tune(st,false);
  }
}
/* `wrap`: the lock screen's next / previous go round the ends (there is no edge to feel there) */
function step(d,andTune,wrap){
  if(!T.list.length){ sfx("err"); return; }
  var base=T.target!=null ? T.target : Math.round(T.pos), n=T.list.length;
  var next=base+d;
  if(wrap) next=(next+n)%n;
  else if(next<0 || next>=n){ sfx("err"); return; }
  glideTo(next,andTune || on());
}
function bindDial(){
  var d=byId("tn-dial");
  d.addEventListener("pointerdown",function(e){
    if(!T.list.length) return;
    /* a finger stops a glide where it is; a tap (no drag) lets it go on, or the station would stay muted under the
       hiss with nothing left to bring the sound back (issue #454) */
    var resume=T.anim ? T.glide : null;
    cancelAnimationFrame(T.anim); T.anim=0; T.target=null;
    T.drag={id:e.pointerId, x:e.clientX, pos:T.pos, moved:false, resume:resume}; T.dragged=false;
  });
  d.addEventListener("pointermove",function(e){
    var g=T.drag; if(!g || g.id!==e.pointerId) return;
    var dx=e.clientX-g.x;
    if(!g.moved && Math.abs(dx)<6) return;
    if(!g.moved){
      g.moved=true;
      /* captured only once it is a drag, so a plain tap still clicks the station name under the finger */
      try{ d.setPointerCapture(e.pointerId); }catch(x){}
      if(on() && E.st && !E.preview){ E.muted=true; level(); }
    }
    var p=clamp(g.pos-dx/GAP,-0.45,T.list.length-1+0.45);
    if(Math.floor(p+0.5)!==Math.floor(T.pos+0.5)) sfx("tick");
    T.pos=p; placeScale();
    if(on()) hiss(hissAt(p));
  });
  function end(e){
    var g=T.drag; if(!g || g.id!==e.pointerId) return;
    T.drag=null;
    /* the click that follows a drag must not tune the label under the finger */
    T.dragged=g.moved;
    if(g.moved){ setTimeout(function(){ T.dragged=false; },0); glideTo(Math.round(T.pos),on()); }
    else if(g.resume) glideTo(g.resume.i,g.resume.andTune);
  }
  d.addEventListener("pointerup",end);
  d.addEventListener("pointercancel",end);
  /* a sideways swipe over the dial is the dial's, not a page scroll */
  d.addEventListener("touchmove",function(e){ if(e.cancelable) e.preventDefault(); },{passive:false});
}

/* ---------- drawing ---------- */
var PAGES=["dial","menu","list","edit","add","find","help"];
function setPage(p){
  T.page=p;
  PAGES.forEach(function(n){ byId("tn-page-"+n).hidden=n!==p; });
  render();
}
function render(){
  if(!T.live) return;
  byId("v-tuner").classList.toggle("lamp",on() || E.state==="paused");
  if(T.page==="dial"){ buildScale(); placeScale(); renderReadout(); }
  else if(T.page==="menu") renderMenu();
  else if(T.page==="list") renderList();
  else if(T.page==="edit") renderEdit();
  else if(T.page==="add") renderAdd();
  else if(T.page==="find") renderFind();
  else if(T.page==="help") renderHelp();
  renderKeys();
}
function stateText(){
  if(!E.st) return T.list.length ? tr("tuner.state.off") : tr("tuner.empty");
  if(E.state==="tuning") return E.tries ? tr("tuner.state.retry",{n:E.tries,max:RETRIES}) : tr("tuner.state.tuning");
  if(E.state==="buffering") return E.tries ? tr("tuner.state.retry",{n:E.tries,max:RETRIES}) : tr("tuner.state.buffering");
  if(E.state==="playing") return tr("tuner.state.playing");
  if(E.state==="paused") return tr("tuner.state.paused");
  if(E.state==="nosignal") return tr("tuner.err."+(E.err||"net"));
  return tr("tuner.state.off");
}
function bars(){
  if(E.state==="buffering" || E.state==="tuning") return 1;
  if(E.state!=="playing" || !E.el) return 0;
  var a=E.el, t=a.currentTime, b=a.buffered, ahead=0;
  try{ for(var i=0;i<b.length;i++) if(b.start(i)<=t+0.5 && b.end(i)>=t) ahead=Math.max(ahead,b.end(i)-t); }catch(e){}
  return clamp(1+Math.floor(ahead/2),2,5);
}
function renderReadout(){
  if(!T.live) return;
  byId("v-tuner").classList.toggle("lamp",on() || E.state==="paused");
  if(T.page!=="dial"){ if(T.page==="list" || T.page==="find") markPlaying(); renderKeys(); return; }
  var st=(E.state!=="off" || E.preview) && E.st ? E.st : T.list[clamp(Math.round(T.pos),0,T.list.length-1)] || null;
  byId("tn-name").textContent=st ? st.name : tr("tuner.title");
  var meta=[];
  if(st){
    var i=idx(st.id);
    if(E.preview && E.st===st) meta.push(tr("tuner.preview"));
    else if(i>=0) meta.push(tr("tuner.nth",{n:i+1,of:T.list.length}));
    if(st.cc) meta.push(st.cc);
    if(st.codec) meta.push(st.codec+(st.kbps ? " "+st.kbps+"k" : ""));
  }
  byId("tn-meta").textContent=meta.join(" · ");
  var s=byId("tn-status");
  s.textContent=stateText();
  s.classList.toggle("bad",E.state==="nosignal");
  var n=bars(), sig=byId("tn-sig").children;
  for(var k=0;k<sig.length;k++) sig[k].classList.toggle("on",k<n);
  byId("tn-time").textContent=E.state==="playing" && E.since ? hhmmss(Date.now()-E.since) : "";
  var sl=byId("tn-sleep");
  if(E.sleepAt){ sl.hidden=false; sl.textContent=tr("tuner.sleep.left",{m:Math.max(1,Math.ceil((E.sleepAt-Date.now())/60000))}); }
  else sl.hidden=true;
  var pw=byId("tn-power");
  pw.textContent=on() ? tr("tuner.off") : tr("tuner.on");
  pw.classList.toggle("on",on());
  byId("tn-keep").hidden=!(E.preview && E.st && !saved(E.st.url));
  byId("tn-prev").disabled=!T.list.length;
  byId("tn-next").disabled=!T.list.length;
  byId("tn-empty").hidden=!!T.list.length;
  renderKeys();
}
function sk(label,fn,disabled){ return {label:label, disabled:!!disabled, fn:fn}; }
/* LP.softkeys builds new buttons each call; the dial redraws every second, and a button replaced under a finger never
   gets its click. So the keys are only rebuilt when what they show changes (issue #455). Every key calls press(name),
   which reads the page itself, so keeping the old buttons is safe. */
function softkeys(k,keys){
  var sig=["select","start","b","a"].map(function(n){ var v=keys[n]; return v ? v.label+(v.disabled?"\u0000":"") : "\u0001"; }).join("\u0002");
  if(k.dataset.sig===sig && k.childNodes.length) return;
  k.dataset.sig=sig;
  LP.softkeys(k,keys);
}
function renderKeys(){
  var k=byId("tn-keys"), p=T.page, b=function(n){ return function(){ press(n); }; };
  var back=sk(tr("tuner.sk.back"),b("b"));
  if(p==="dial") softkeys(k,{select:sk(E.sleepMin ? tr("tuner.sk.sleepn",{m:E.sleepMin}) : tr("tuner.sk.sleep"),b("select")),
    start:sk(tr("tuner.sk.menu"),b("start")), b:null, a:sk(on() ? tr("tuner.off") : tr("tuner.on"),b("a"),!T.list.length && !E.st)});
  else if(p==="menu") softkeys(k,{select:null,start:null,b:back,a:sk(tr("tuner.sk.open"),b("a"))});
  else if(p==="list") softkeys(k,{select:null,start:sk(tr("tuner.sk.edit"),b("start"),!T.list.length),b:back,a:sk(tr("tuner.sk.listen"),b("a"),!T.list.length)});
  else if(p==="edit") softkeys(k,{select:null,start:null,b:back,a:sk(tr("tuner.sk.save"),b("a"))});
  else if(p==="add") softkeys(k,{select:null,start:null,b:back,a:sk(tr("tuner.sk.add"),b("a"))});
  else if(p==="find"){
    var r=T.find.rows[T.find.sel], has=r && saved(r.url);
    softkeys(k,{select:null,
      start:sk(has ? tr("tuner.sk.kept") : tr("tuner.sk.keep"),b("start"),!r || !!has),b:back,a:sk(tr("tuner.sk.listen"),b("a"),!r)});
  }
  else softkeys(k,{select:null,start:null,b:back,a:null});
}

/* menu (START) */
var MENU=["list","find","add","import","export","sleep","help"];
function renderMenu(){
  var ul=byId("tn-menu"); ul.textContent="";
  MENU.forEach(function(m,i){
    var li=el("li",i===T.menu?"on":"");
    li.setAttribute("role","button"); li.tabIndex=0;
    li.appendChild(el("span","",tr("tuner.menu."+m)));
    var right=m==="list" ? T.list.length+"/"+ST.MAX : m==="sleep" ? (E.sleepMin ? tr("tuner.min",{m:E.sleepMin}) : tr("tuner.sleep.none")) : "";
    if(right) li.appendChild(el("small","",right));
    li.onclick=function(){ T.menu=i; menuGo(m); };
    ul.appendChild(li);
  });
}
function menuGo(m){
  sfx("tap");
  if(m==="list"){ T.sel=Math.max(0,idx(E.st && E.st.id)); setPage("list"); scrollSel("tn-list"); }
  else if(m==="find"){ setPage("find"); if(!T.find.loaded) search(); }
  else if(m==="add"){ T.addNote=""; byId("tn-add-url").value=""; byId("tn-add-name").value=""; setPage("add"); }
  else if(m==="import"){ var f=byId("tn-file"); f.value=""; f.click(); }
  else if(m==="export") exportList();
  else if(m==="sleep") sleepStep();
  else if(m==="help") setPage("help");
}

/* my stations */
function renderList(){
  var ul=byId("tn-list"); ul.textContent="";
  byId("tn-list-count").textContent=T.list.length+"/"+ST.MAX;
  byId("tn-list-note").hidden=!!T.list.length;
  T.sel=clamp(T.sel,0,Math.max(0,T.list.length-1));
  T.list.forEach(function(s,i){
    var li=el("li","tn-row"+(i===T.sel?" on":""));
    var main=button("tn-row-main","",function(){ T.sel=i; listen(i); });
    main.appendChild(el("i","tn-row-num",LP.pad2(i+1)));
    var txt=el("span","tn-row-txt");
    txt.appendChild(el("b","",s.name));
    txt.appendChild(el("small","",[s.cc,s.codec,hostOf(s.url)].filter(Boolean).join(" · ")));
    main.appendChild(txt);
    var air=el("em","tn-air",tr("tuner.air")); air.hidden=!(E.st && E.st.id===s.id && on());
    main.appendChild(air);
    li.appendChild(main);
    var ed=button("tn-row-edit","…",function(){ T.sel=i; openEdit(s.id); });
    ed.setAttribute("aria-label",tr("tuner.sk.edit"));
    li.appendChild(ed);
    ul.appendChild(li);
  });
}
function markPlaying(){
  if(T.page==="list") Array.prototype.forEach.call(byId("tn-list").querySelectorAll(".tn-air"),function(a,i){
    var s=T.list[i]; a.hidden=!(s && E.st && E.st.id===s.id && on());
  });
  if(T.page==="find") Array.prototype.forEach.call(byId("tn-results").querySelectorAll(".tn-air"),function(a,i){
    var r=T.find.rows[i]; a.hidden=!(r && E.st && E.st.url===r.url && on());
  });
}
function hostOf(url){ var m=/^https?:\/\/([^\/?#:]+)/i.exec(url||""); return m ? m[1].replace(/^www\./,"") : ""; }
function scrollSel(id){
  var li=byId(id).children[id==="tn-list" ? T.sel : id==="tn-menu" ? T.menu : T.find.sel];
  if(!li) return;
  /* by hand, on the page's own scroller only: Safari's scrollIntoView also scrolls the screen around it, which slid the
     first row under the title bar (owner, 2026-11-25). The first row goes to the very top, padding included */
  var box=li.parentNode; while(box && box!==document.body && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box=box.parentNode;
  if(!box || box===document.body) return;
  var b=box.getBoundingClientRect(), r=li.getBoundingClientRect();
  if(!li.previousElementSibling) box.scrollTop=0;
  else if(r.top<b.top) box.scrollTop+=r.top-b.top;
  else if(r.bottom>b.bottom) box.scrollTop+=r.bottom-b.bottom;
}
function listen(i){
  var s=T.list[i]; if(!s) return;
  setPage("dial");
  glideTo(i,true);
}

/* edit one station */
function openEdit(id){
  var s=T.list[idx(id)]; if(!s) return;
  T.editId=id; T.delArm=false;
  byId("tn-edit-name").value=s.name;
  byId("tn-edit-url").value=s.url;
  byId("tn-edit-note").textContent="";
  setPage("edit");
}
function renderEdit(){
  var i=idx(T.editId);
  byId("tn-edit-up").disabled=i<=0;
  byId("tn-edit-down").disabled=i<0 || i>=T.list.length-1;
  var del=byId("tn-edit-del");
  del.textContent=T.delArm ? tr("tuner.edit.delsure") : tr("tuner.edit.del");
  del.classList.toggle("armed",T.delArm);
}
function saveEdit(){
  var i=idx(T.editId); if(i<0){ setPage("list"); return; }
  var url=ST.cleanUrl(byId("tn-edit-url").value);
  if(!url){ byId("tn-edit-note").textContent=tr("tuner.add.bad"); sfx("err"); return; }
  var old=T.list[i];
  for(var k=0;k<T.list.length;k++) if(k!==i && ST.sameUrl(T.list[k].url,url)){ byId("tn-edit-note").textContent=tr("tuner.add.dup",{name:T.list[k].name}); sfx("err"); return; }
  var s={}; for(var key in old) s[key]=old[key];
  s.url=url; s.name=ST.cleanName(byId("tn-edit-name").value,url);
  if(url!==old.url){ delete s.codec; delete s.kbps; }
  T.list=T.list.slice(); T.list[i]=s;
  if(E.st && E.st.id===s.id){ var was=on(); E.st=s; if(was && url!==old.url) dial(); else mediaMeta(); }
  T.scaleKey=""; save(); sfx("ok");
  setPage("list");
}
function moveEdit(d){
  var i=idx(T.editId), j=i+d; if(i<0 || j<0 || j>=T.list.length) return;
  /* moving is another action: the next 删除 asks again (issue #456) */
  T.list=ST.move(T.list,i,j); T.sel=j; T.scaleKey=""; T.delArm=false;
  syncPos(); save(); sfx("move"); renderEdit();
}
function delEdit(){
  if(!T.delArm){ T.delArm=true; sfx("tap"); renderEdit(); return; }
  var i=idx(T.editId); if(i<0) return;
  var s=T.list[i];
  T.list=T.list.filter(function(x){ return x.id!==s.id; });
  if(E.st && E.st.id===s.id){ if(on() || E.state==="paused") stop(); E.st=null; }
  if(T.last===s.id) T.last=null;
  T.scaleKey=""; T.sel=Math.min(i,T.list.length-1);
  syncPos(); save(); sfx("ok"); toast(tr("tuner.edit.deleted",{name:s.name}));
  setPage("list");
}
/* keep the needle on the station that plays (or the last one) after the list changed */
function syncPos(){
  var i=E.st ? idx(E.st.id) : idx(T.last);
  T.pos=i>=0 ? i : clamp(Math.round(T.pos),0,Math.max(0,T.list.length-1));
}

/* add a link */
function renderAdd(){ byId("tn-add-note").textContent=T.addNote; }
function readList(url){
  var ctl=window.AbortController ? new AbortController() : null, t=setTimeout(function(){ if(ctl) ctl.abort(); },10000);
  return fetch(url,ctl ? {signal:ctl.signal} : {}).then(function(r){
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.text();
  }).then(function(text){ clearTimeout(t); return ST.parse(text.slice(0,FILE_MAX),url); },function(e){ clearTimeout(t); throw e; });
}
function addLink(){
  var url=ST.cleanUrl(byId("tn-add-url").value), name=byId("tn-add-name").value;
  if(!url){ T.addNote=tr("tuner.add.bad"); sfx("err"); renderAdd(); return; }
  if(ST.kind(url)==="playlist"){
    T.addNote=tr("tuner.add.reading"); renderAdd();
    readList(url).then(function(p){
      if(p.kind==="hls"){ addOne(url,name); return; }
      if(!p.stations.length){ T.addNote=tr("tuner.add.none"); sfx("err"); renderAdd(); return; }
      if(p.stations.length===1){ addOne(p.stations[0].url,name || p.stations[0].name); return; }
      importStations(p.stations);
    },function(){ T.addNote=tr("tuner.add.unreadable"); sfx("err"); renderAdd(); });
    return;
  }
  addOne(url,name);
}
function addOne(url,name){
  var dup=saved(url);
  if(dup){ toast(tr("tuner.add.dup",{name:dup.name})); listen(idx(dup.id)); return; }
  if(T.list.length>=ST.MAX){ T.addNote=tr("tuner.full",{max:ST.MAX}); sfx("err"); renderAdd(); return; }
  var s=ST.make({url:url, name:name},LP.uid()); if(!s) return;
  T.list=T.list.concat([s]); T.scaleKey=""; save(); sfx("ok");
  listen(T.list.length-1);
}
function importStations(arr){
  var r=ST.merge(T.list,arr,LP.uid);
  T.list=r.list; T.scaleKey=""; syncPos(); save();
  var msg=tr("tuner.import.done",{n:r.added});
  if(r.skipped) msg+=tr("tuner.import.skipped",{n:r.skipped});
  if(r.full) msg+=tr("tuner.import.full",{n:r.full});
  toast(msg); sfx(r.added ? "ok" : "err");
  T.sel=Math.max(0,T.list.length-r.added);
  setPage("list"); scrollSel("tn-list");
}
function importFile(f){
  if(!f) return;
  if(f.size>FILE_MAX){ toast(tr("tuner.import.big")); sfx("err"); return; }
  var read=f.text ? f.text() : new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(String(r.result)); }; r.onerror=rej; r.readAsText(f); });
  read.then(function(text){
    var p=ST.parse(text,f.name);
    if(p.kind==="hls"){ toast(tr("tuner.import.hls")); sfx("err"); return; }
    if(!p.stations.length){ toast(tr("tuner.import.none")); sfx("err"); return; }
    importStations(p.stations);
  },function(){ toast(tr("tuner.import.none")); sfx("err"); });
}
function exportList(){
  if(!T.list.length){ toast(tr("tuner.empty")); sfx("err"); return; }
  var d=new Date(), name="lopda-stations-"+d.getFullYear()+LP.pad2(d.getMonth()+1)+LP.pad2(d.getDate())+".m3u";
  LP.saveBlob(new Blob([ST.toM3U(T.list)],{type:"audio/x-mpegurl"}),name).then(function(res){
    if(res && res.status==="saved"){ sfx("ok"); toast(tr("tuner.export.done",{n:T.list.length})); }
  },function(e){ if(!(e && e.code==="declined")){ toast(LP.saveErr(e)); sfx("err"); } });
}

/* find: the radio-browser.info directory */
function renderFind(){
  var f=T.find;
  byId("tn-find-note").textContent=f.busy ? tr("tuner.find.busy") : f.note;
  var ul=byId("tn-results"); ul.textContent="";
  f.rows.forEach(function(r,i){
    var li=el("li","tn-row"+(i===f.sel?" on":""));
    var main=button("tn-row-main","",function(){ f.sel=i; previewRow(); });
    var txt=el("span","tn-row-txt");
    txt.appendChild(el("b","",r.name));
    txt.appendChild(el("small","",[r.cc,r.codec ? r.codec+(r.kbps ? " "+r.kbps+"k" : "") : (r.hls ? "HLS" : "")].filter(Boolean).join(" · ")));
    main.appendChild(txt);
    var air=el("em","tn-air",tr("tuner.air")); air.hidden=!(E.st && E.st.url===r.url && on());
    main.appendChild(air);
    li.appendChild(main);
    var has=saved(r.url);
    var add=button("tn-row-edit"+(has?" done":""),has ? "✓" : "+",function(){ f.sel=i; keepRow(); });
    add.disabled=!!has;
    add.setAttribute("aria-label",has ? tr("tuner.sk.kept") : tr("tuner.sk.keep"));
    li.appendChild(add);
    ul.appendChild(li);
  });
}
function dirFetch(path,hosts){
  hosts=hosts || DIR_HOSTS.slice();
  var host=hosts.shift();
  var ctl=window.AbortController ? new AbortController() : null, t=setTimeout(function(){ if(ctl) ctl.abort(); },8000);
  return fetch(host+path,ctl ? {signal:ctl.signal} : {}).then(function(r){
    clearTimeout(t);
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }).catch(function(e){
    clearTimeout(t);
    if(hosts.length) return dirFetch(path,hosts);
    throw e;
  });
}
function search(){
  var f=T.find, seq=++f.seq;
  f.q=byId("tn-find-q").value.trim().slice(0,60);
  f.busy=true; f.note=""; f.loaded=true; renderFind();
  var q="limit=40&hidebroken=true&order=clickcount&reverse=true";
  if(f.q) q+="&name="+encodeURIComponent(f.q);
  dirFetch("/json/stations/search?"+q).then(function(arr){
    if(seq!==f.seq) return;
    f.rows=ST.fromDirectory(Array.isArray(arr) ? arr : []);
    f.sel=0; f.busy=false;
    f.note=f.rows.length ? tr("tuner.find.src") : tr("tuner.find.nothing");
    render();
  },function(){
    if(seq!==f.seq) return;
    f.busy=false; f.rows=[]; f.note=tr(navigator.onLine===false ? "tuner.err.offline" : "tuner.find.fail");
    sfx("err"); render();
  });
}
function previewRow(){
  var r=T.find.rows[T.find.sel]; if(!r) return;
  var has=saved(r.url);
  if(has){ var i=idx(has.id); T.pos=i; tune(has,false); }
  else tune(r,true);
  renderFind(); renderKeys();
}
function keepRow(){
  var r=T.find.rows[T.find.sel]; if(!r || saved(r.url)) return;
  if(T.list.length>=ST.MAX){ toast(tr("tuner.full",{max:ST.MAX})); sfx("err"); return; }
  var s=ST.make(r,LP.uid()); if(!s) return;
  T.list=T.list.concat([s]); T.scaleKey=""; save();
  /* the station heard as a preview is now a saved one: the dial shows it in its place */
  if(E.st && E.st.url===r.url){ E.st=s; E.preview=false; T.last=s.id; T.pos=T.list.length-1; save(); }
  sfx("ok"); toast(tr("tuner.kept",{name:s.name}));
  renderFind(); renderKeys();
}
/* the readout's 存下 button: keep the station heard from the directory */
function keepPreview(){
  if(!E.preview || !E.st || saved(E.st.url)) return;
  if(T.list.length>=ST.MAX){ toast(tr("tuner.full",{max:ST.MAX})); sfx("err"); return; }
  var s=ST.make(E.st,LP.uid()); if(!s) return;
  T.list=T.list.concat([s]); E.st=s; E.preview=false; T.last=s.id; T.scaleKey="";
  T.pos=T.list.length-1; save(); sfx("ok"); toast(tr("tuner.kept",{name:s.name}));
  render();
}

function renderHelp(){
  var b=byId("tn-help"); b.textContent="";
  ["1","2","3","4","5"].forEach(function(n){ b.appendChild(el("p","",tr("tuner.help."+n))); });
}

/* ---------- buttons ---------- */
function press(b){
  var p=T.page;
  if(p==="dial"){
    if(b==="left") step(-1);
    else if(b==="right") step(1);
    else if(b==="a") power();
    else if(b==="start"){ T.menu=0; sfx("tap"); setPage("menu"); scrollSel("tn-menu"); }
    else if(b==="select") sleepStep();
    return;
  }
  if(p==="menu"){
    if(b==="up" || b==="down"){ T.menu=(T.menu+(b==="up"?-1:1)+MENU.length)%MENU.length; sfx("move"); renderMenu(); scrollSel("tn-menu"); }
    else if(b==="a") menuGo(MENU[T.menu]);
    else if(b==="b"){ sfx("tap"); setPage("dial"); }
    return;
  }
  if(p==="list"){
    if(b==="up" || b==="down"){ if(!T.list.length) return; T.sel=clamp(T.sel+(b==="up"?-1:1),0,T.list.length-1); sfx("move"); renderList(); scrollSel("tn-list"); }
    else if(b==="a") listen(T.sel);
    else if(b==="start"){ if(T.list[T.sel]) openEdit(T.list[T.sel].id); }
    else if(b==="b"){ sfx("tap"); setPage("menu"); }
    return;
  }
  if(p==="edit"){
    if(b==="a") saveEdit();
    else if(b==="b"){ blur(); sfx("tap"); setPage("list"); }
    return;
  }
  if(p==="add"){
    if(b==="a") addLink();
    else if(b==="b"){ blur(); sfx("tap"); setPage("menu"); }
    return;
  }
  if(p==="find"){
    var f=T.find;
    if(b==="up" || b==="down"){ if(!f.rows.length) return; f.sel=clamp(f.sel+(b==="up"?-1:1),0,f.rows.length-1); sfx("move"); renderFind(); renderKeys(); scrollSel("tn-results"); }
    else if(b==="a") previewRow();
    else if(b==="start") keepRow();
    else if(b==="b"){ blur(); sfx("tap"); setPage("menu"); }
    return;
  }
  if(p==="help" && b==="b"){ sfx("tap"); setPage("menu"); }
  /* the help text may be taller than the screen: UP / DOWN scroll it */
  if(p==="help" && (b==="up" || b==="down")){ var hp=byId("tn-page-help"); hp.scrollTop+=(b==="up"?-1:1)*Math.round(hp.clientHeight*0.6); }
}
function blur(){ var a=document.activeElement; if(a && a.blur && /INPUT/.test(a.tagName)) a.blur(); }

function bind(){
  bindDial();
  byId("tn-prev").onclick=function(){ step(-1); };
  byId("tn-next").onclick=function(){ step(1); };
  byId("tn-power").onclick=function(){ power(); };
  byId("tn-keep").onclick=keepPreview;
  byId("tn-empty-find").onclick=function(){ menuGo("find"); };
  byId("tn-list-add").onclick=function(){ menuGo("add"); };
  byId("tn-list-find").onclick=function(){ menuGo("find"); };
  byId("tn-edit-up").onclick=function(){ moveEdit(-1); };
  byId("tn-edit-down").onclick=function(){ moveEdit(1); };
  byId("tn-edit-del").onclick=delEdit;
  byId("tn-edit-form").onsubmit=function(e){ e.preventDefault(); blur(); saveEdit(); };
  byId("tn-add-form").onsubmit=function(e){ e.preventDefault(); blur(); addLink(); };
  byId("tn-find-form").onsubmit=function(e){ e.preventDefault(); blur(); search(); };
  byId("tn-file").addEventListener("change",function(){ var f=this.files && this.files[0]; importFile(f); });
}

/* ---------- interruptions ----------
   Another app's sound (a video, a podcast, a call) takes the phone's audio. iOS often stops our element without a
   "pause" event, so the readout said 收听中 over silence (owner, 2026-11-25). Three signs, whichever comes first: the
   pause event, the audio session going "interrupted" (Safari 16.4+), and time that stops moving while we think it plays.
   When the user comes back to the screen (or the session frees up while they are on it), it dials the station again; where
   the phone wants a tap for that, it stays "interrupted" and A or the lock screen's play brings it back. */
function interrupted(){
  if(E.state!=="playing" && E.state!=="buffering" && E.state!=="tuning") return;
  E.gen++;
  clearTimeout(E.watch); clearTimeout(E.retry);
  E.interrupted=true; E.since=0;
  /* the element may still think it plays: hold it, so it never comes back on its own behind a "paused" readout */
  if(E.el && !E.el.paused){ E.stopping=true; try{ E.el.pause(); }catch(e){} E.stopping=false; }
  hiss(0);
  setState("paused"); msState("paused");
}
function resume(){
  if(!E.interrupted || E.state!=="paused" || !E.st) return;
  E.interrupted=false; E.resuming=true; E.tries=0;
  dial();
}
var STILL_MS=5000;
function onSession(state){
  if(state==="interrupted") interrupted();
  /* only while the user is looking at Lo-PDA: in the background, the session freeing up can be another web page that
     just started its own sound, and the radio grabbed the speaker back from it (owner, 2026-11-25) */
  else if(E.interrupted && !document.hidden) resume();
}
function checkAlive(){
  var a=E.el;
  if(!a || E.state!=="playing" || a.src===silentUrl) return;
  /* time is only trusted on screen: in the background the phone may send timeupdate rarely */
  if(a.paused || (!document.hidden && E.movedAt && Date.now()-E.movedAt>STILL_MS)) interrupted();
}
(function(){
  var S=navigator.audioSession;
  if(S && S.addEventListener) S.addEventListener("statechange",function(){ onSession(S.state); });

  document.addEventListener("visibilitychange",function(){
    if(document.hidden) return;
    var a=E.el;
    if(a && a.paused) checkAlive();
    else E.movedAt=Date.now();   /* a fresh start for the time check: timeupdate may have been rare while hidden */
    if(E.interrupted) resume();
  });
  /* time that stops moving is checked while the radio is on, even with the program off screen (timers may sleep in the
     background; then the check runs when the page wakes) */
  setInterval(function(){ if(E.state==="playing" && !T.live) checkAlive(); },2000);
})();

/* the clock: the listening time, the signal, the sleep countdown */
function tick(){
  checkSleep();
  checkAlive();
  if(T.live && T.page==="dial" && !document.hidden) renderReadout();
}

bind();
if(window.LOPDA_DEBUG) window.LOPDA_DEBUG.tuner={T:T, E:E, SEED:SEED, step:step, onSession:onSession};

LP.padRoute("tuner",function(b,down){
  if(byId("v-tuner").hidden) return false;
  /* import and export open the file picker or the share sheet: on the release of a press that began on that row
     (a pointerdown is not a user activation on touch) */
  var m=T.page==="menu" && b==="a" ? MENU[T.menu] : "";
  if(m==="import" || m==="export"){
    if(down) T.armed=m;
    else if(T.armed===m){ T.armed=""; menuGo(m); }
    return true;
  }
  if(down){ T.armed=""; press(b); }
  return true;
});

LP.builtin({id:"tuner", label:"app.tuner", icon:function(){ return ICON; }, view:"tuner", keepPad:true,
  open:function(){
    T.live=true;
    prime();
    LP.show("tuner");
    LP.showPad(true);
    load().then(function(){
      if(!T.live) return;
      if(E.st && idx(E.st.id)>=0 && !T.anim) T.pos=idx(E.st.id);
      T.scaleKey="";
      setPage("dial");
    });
    setPage("dial");
  },
  enter:function(){
    T.live=true;
    clearInterval(T.ticker); T.ticker=setInterval(tick,1000);
  },
  /* leaving the program does not stop the radio: it plays on, like a real one (owner, 2026-11-25) */
  leave:function(){
    if(!T.live) return;
    T.live=false;
    clearInterval(T.ticker); T.ticker=0;
    var drag=T.drag;
    T.drag=null; T.dragged=false;
    cancelAnimationFrame(T.anim); T.anim=0;
    /* HOME mid-glide: land where it was going (and tune it, as the glide would have); mid-drag: back where it was */
    if(T.target!=null) glideTo(T.target,on());
    else if(drag){ E.muted=false; level(); }
    if(E.state!=="playing") hiss(0);
    blur();
  },
  tag:function(){ return on() ? tr("tuner.tag.on") : ""; },
  lang:function(){ if(T.live) render(); },
  level:level,
  /* another program takes the speaker: the radio stops and says so */
  claim:function(){
    if(!on() && E.state!=="paused") return;
    stop();
    toast(tr("tuner.claimed"));
  },
  /* the old context took the hiss with it */
  audio:function(){ H={ctx:null, src:null, gain:null, stopAt:0}; if(on() && E.state!=="playing") hiss(0.3); },
  pause:function(){ clearInterval(T.ticker); T.ticker=0; },
  resume:function(){
    checkSleep();
    if(E.el && on() && E.state==="playing" && E.el.paused){ setState("paused"); msState("paused"); }
    if(T.live){ clearInterval(T.ticker); T.ticker=setInterval(tick,1000); render(); }
  },
  restore:function(){ stop(); T.loaded=false; T.list=[]; },
  ready:function(){ load(); }
});

var ICON=["............00..","...........0....","..........0.....",".........0......","..000000000000..",".03333333333330.",
  ".03000000000030.",".03021202121030.",".03000000000030.",".03333333333330.",".03121213300330.",".03212123011030.",
  ".03121213011030.",".03212123300330.",".03333333333330.","..000000000000.."];
})();
