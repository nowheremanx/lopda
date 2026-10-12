/*
 * Lo-PDA built-in: the cartridge player.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr;
/* the screen's own four tones (the camera's "lcd" tint is the same four) */
var TONES=LP.TONES, SND=LP.SND, audio=LP.audio, own=LP.own, toast=LP.toast, put=LP.put, fmt=LP.fmt, sfx=LP.sfx, show=LP.show,
  showPad=LP.showPad, releaseButtons=LP.releaseButtons, noEmoji=LP.noEmoji, sha256hex=LP.sha256hex;

/* ---------- cartridge player: black-and-white Game Boy (binjgb, MIT, runtime/vendor/binjgb) ----------
   ROMs are the user's own files. Nothing is bundled. Colour carts are refused; dual-mode carts
   are run as black-and-white carts, and Super Game Boy colouring is switched off, so the screen
   only ever shows the four tones. */
var GB={mod:null, loading:null, e:0, rom:0, joy:0, raf:0, last:0, left:0, paused:false,
  cart:null, save:null, ctx:null, img:null, gain:null, aStart:0, dirty:false, timer:0};
var GB_TICKS=4194304, GB_AUDIO_FRAMES=4096, GB_VOL=[0,0.3,0.6,1];
var CARTS=[];
function b64(u8){ var s="", CH=0x8000; for(var i=0;i<u8.length;i+=CH) s+=String.fromCharCode.apply(null,u8.subarray(i,i+CH)); return btoa(s); }
function unb64(s){ var bin=atob(s), u8=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i); return u8; }
function gbModule(){
  if(GB.mod) return Promise.resolve(GB.mod);
  if(GB.loading) return GB.loading;
  GB.loading=new Promise(function(res,rej){
    var sc=document.createElement("script"); sc.src="vendor/binjgb/binjgb.js";
    sc.onload=res; sc.onerror=function(){ rej(new Error(tr("cart.noemu"))); };
    document.head.appendChild(sc);
  }).then(function(){
    return window.Binjgb({locateFile:function(p){ return new URL("vendor/binjgb/"+p,location.href).href; }});
  }).then(function(m){ GB.mod=m; return m; });
  GB.loading.catch(function(){ GB.loading=null; });
  return GB.loading;
}
function heap(ptr,size){ return new Uint8Array(GB.mod.HEAP8.buffer,ptr,size); }
/* Read the cartridge header. Returns {title, ok, why}. */
function cartHeader(u8){
  if(u8.length<0x8000 || u8.length>8*1024*1024) return {ok:false, why:tr("cart.badsize")};
  var cgb=u8[0x143];
  if(cgb===0xC0) return {ok:false, why:tr("cart.gbc")};
  var t="", end=(cgb&0x80)?0x143:0x144;
  for(var i=0x134;i<end;i++){ var c=u8[i]; if(!c) break; if(c>=32&&c<127) t+=String.fromCharCode(c); }
  var x=0; for(i=0x134;i<=0x14C;i++) x=(x-u8[i]-1)&0xFF;
  if(x!==u8[0x14D]) return {ok:false, why:tr("cart.badsum")};
  return {ok:true, title:t.trim(), dual:!!(cgb&0x80)};
}
/* black-and-white only: clear the colour and Super Game Boy flags on our private copy */
function asMono(u8){
  var r=new Uint8Array(u8); if(r[0x143]&0x80) r[0x143]=0; r[0x146]=0;
  var x=0; for(var i=0x134;i<=0x14C;i++) x=(x-r[i]-1)&0xFF; r[0x14D]=x;
  return r;
}
function renderCarts(){
  var ul=$("cart-list"); ul.textContent="";
  if(!CARTS.length){ var e=document.createElement("li"); e.className="empty"; e.textContent=tr(S.db?"cart.empty":"cart.emptynodb"); ul.appendChild(e); return; }
  CARTS.slice().sort(function(a,b){ return (b.played||b.added||0)-(a.played||a.added||0); }).forEach(function(c){
    var li=document.createElement("li"); li.className="store-item";
    var tile=document.createElement("span"); tile.className="tile"; tile.textContent=Array.from(c.name||"?")[0].toUpperCase();
    var body=document.createElement("div"); body.className="store-body";
    var t=document.createElement("b"); t.textContent=c.name;
    var m=document.createElement("small"); m.textContent=(c.title||tr("cart.untitled"))+" · "+Math.round(c.bytes/1024)+" KB"+(c.played?" · "+fmt(c.played):"");
    body.appendChild(t); body.appendChild(m);
    var acts=document.createElement("div"); acts.className="acts";
    var play=document.createElement("button"); play.type="button"; play.className="btn"; play.textContent=tr("cart.play");
    play.onclick=function(){ gbPlay(c); };
    var del=document.createElement("button"); del.type="button"; del.className="btn ghost"; del.textContent=tr("cart.toss");
    del.onclick=function(){
      if(del.dataset.armed){ deleteCart(c); return; }
      del.dataset.armed="1"; del.textContent=tr("cart.tossgo"); setTimeout(function(){ if(del.isConnected){ delete del.dataset.armed; del.textContent=tr("cart.toss"); } },3000);
    };
    acts.appendChild(play); acts.appendChild(del);
    li.appendChild(tile); li.appendChild(body); li.appendChild(acts); ul.appendChild(li);
  });
}
function loadCarts(){
  if(!S.db) return Promise.resolve();
  return S.refs.carts.get().then(function(q){ CARTS=q.docs.map(function(d){ var o=own(d.data()); o.id=d.id; return o; }); renderCarts(); }).catch(function(){ toast(tr("cart.shelffail")); });
}
function deleteCart(c){
  CARTS=CARTS.filter(function(x){ return x.id!==c.id; }); renderCarts();
  if(S.db){ S.refs.carts.doc(c.id).delete(); S.refs.roms.doc(c.id).delete(); S.refs.cartsave.doc(c.id).delete(); }
  toast(tr("cart.tossed",{name:c.name}));
}
$("cart-file").onchange=function(){
  var f=this.files&&this.files[0]; this.value=""; if(!f) return;
  f.arrayBuffer().then(function(buf){
    var u8=new Uint8Array(buf), h=cartHeader(u8);
    if(!h.ok){ toast(h.why); sfx("err"); return; }
    return sha256hex(buf).then(function(hex){
      var id=hex.slice(0,24), name=noEmoji(f.name.replace(/\.(gbc?|bin)$/i,"")).slice(0,40)||h.title||tr("cart.default");
      var have=CARTS.filter(function(x){ return x.id===id; })[0];
      if(have){ toast(tr("cart.dupe")); return; }
      var meta={name:name, title:h.title, bytes:u8.length, added:Date.now(), dual:h.dual};
      var write = S.db ? put(S.refs.roms.doc(id),{rom:b64(u8)}).then(function(ok){ return ok && put(S.refs.carts.doc(id),meta); }) : Promise.resolve(true);
      return write.then(function(ok){
        if(!ok) return;
        meta.id=id; if(!S.db) meta.mem=u8; CARTS.push(meta); renderCarts(); sfx("ok");
        toast(tr(h.dual?"cart.dual":"cart.placed"));
      });
    });
  }).catch(function(e){ toast(tr("cart.badfile",{msg:(e&&e.message)||e})); });
};
function openCart(){
  show("cart"); gbShowLib(); renderCarts(); loadCarts();
}
function gbShowLib(){
  $("cart-lib").hidden=false; $("cart-play").hidden=true; $("cart-tools").hidden=true; $("v-cart").classList.remove("locked");
  $("cart-title").textContent=tr("cart.title"); $("cart-state").textContent=""; showPad(false);
}
function cartLayout(){
  var cv=$("cart-cv"), box=$("cart-play"); if(box.hidden) return;
  var msg=$("cart-msg"), w=box.clientWidth-16, h=box.clientHeight-16-(msg.offsetHeight ? msg.offsetHeight+8 : 0)-6;
  /* every game pixel gets the same whole number of screen pixels, so the picture stays crisp */
  var dpr=window.devicePixelRatio||1, fit=Math.min(w/160,h/144), k=Math.floor(fit*dpr)/dpr;
  if(k<fit*0.9) k=fit;   /* on small screens size wins over perfectly even pixels */
  k=Math.max(1,k); cv.style.width=Math.round(160*k)+"px"; cv.style.height=Math.round(144*k)+"px";
}
window.addEventListener("resize",function(){ if(!$("v-cart").hidden) cartLayout(); });
function gbPlay(c){
  $("cart-state").textContent=tr("cart.reading");
  var romP = c.mem ? Promise.resolve(c.mem) : S.refs.roms.doc(c.id).get().then(function(sn){ if(!sn.exists) throw new Error(tr("cart.norom")); return unb64(own(sn.data()).rom); });
  var saveP = S.db ? S.refs.cartsave.doc(c.id).get().then(function(sn){ return sn.exists ? own(sn.data()) : {}; }).catch(function(){ return {}; }) : Promise.resolve({});
  audio();   /* this tap unlocks sound on phones */
  if(SND.ctx && SND.ctx.state==="suspended") SND.ctx.resume();
  Promise.all([gbModule(),romP,saveP]).then(function(r){
    if($("v-cart").hidden) return;
    gbStart(c,r[1],r[2]);
  }).catch(function(e){ $("cart-state").textContent=""; toast(tr("cart.nopower",{msg:(e&&e.message)||e})); sfx("err"); });
}
function gbStart(c,rom,save){
  gbStop();
  var m=GB.mod, data=asMono(rom), size=(data.length+0x7fff)&~0x7fff, ac=SND.ctx;
  GB.rom=m._malloc(size); var h=heap(GB.rom,size); h.fill(0); h.set(data);
  GB.e=m._emulator_new_simple(GB.rom,size,ac?ac.sampleRate:44100,GB_AUDIO_FRAMES,0);
  if(!GB.e){ m._free(GB.rom); GB.rom=0; throw new Error(tr("cart.badrom")); }
  GB.joy=m._joypad_new(); m._emulator_set_default_joypad_callback(GB.e,GB.joy);
  var col=function(t){ var c=TONES[t]; return ((255<<24)|(c[2]<<16)|(c[1]<<8)|c[0])>>>0; };
  for(var p=0;p<3;p++) m._emulator_set_bw_palette_simple(GB.e,p,col(3),col(2),col(1),col(0));
  GB.cart=c; GB.save=save||{};
  if(GB.save.sram) gbWithFile(m._ext_ram_file_data_new(GB.e),function(fd,buf){ var s=unb64(GB.save.sram); if(s.length===buf.length){ buf.set(s); m._emulator_read_ext_ram(GB.e,fd); } });
  var cv=$("cart-cv"); GB.ctx=cv.getContext("2d"); GB.img=GB.ctx.createImageData(160,144);
  GB.ctx.fillStyle="rgb("+TONES[3].join(",")+")"; GB.ctx.fillRect(0,0,160,144);
  if(ac){ GB.gain=ac.createGain(); GB.gain.gain.value=SND.on?GB_VOL[SND.vol]:0; GB.gain.connect(ac.destination); }
  GB.aStart=0; GB.last=0; GB.left=0; GB.paused=false; GB.dirty=false;
  GB.timer=setInterval(function(){ if(GB.dirty) gbSaveSram(); },1500);
  $("cart-lib").hidden=true; $("cart-play").hidden=false; $("cart-tools").hidden=false; $("v-cart").classList.add("locked"); $("v-cart").scrollTop=0;
  $("cart-title").textContent=c.name; $("cart-state").textContent="";
  resetCartLoad(); showPad(true); cartLayout();
  c.played=Date.now(); if(S.db) put(S.refs.carts.doc(c.id),(function(){ var o={}; for(var k in c) if(k!=="id"&&k!=="mem") o[k]=c[k]; return o; })());
  GB.raf=requestAnimationFrame(gbFrame);
}
function gbWithFile(fd,fn){ var m=GB.mod, buf=heap(m._get_file_data_ptr(fd),m._get_file_data_size(fd)); try{ return fn(fd,buf); } finally { m._file_data_delete(fd); } }
function gbFrame(ms){
  if(!GB.e) return;
  GB.raf=requestAnimationFrame(gbFrame);
  if(GB.paused) return;
  var m=GB.mod, sec=ms/1000, d=Math.max(sec-(GB.last||sec),0); GB.last=sec;
  var until=m._emulator_get_ticks_f64(GB.e)+Math.min(d,5/60)*GB_TICKS-GB.left, frame=false;
  for(;;){
    var ev=m._emulator_run_until_f64(GB.e,until);
    if(ev&1) frame=true;
    if(ev&2) gbAudio();
    if(ev&4) break;
  }
  GB.left=(m._emulator_get_ticks_f64(GB.e)-until)|0;
  if(m._emulator_was_ext_ram_updated(GB.e)) GB.dirty=true;
  if(frame){ GB.img.data.set(heap(m._get_frame_buffer_ptr(GB.e),m._get_frame_buffer_size(GB.e))); GB.ctx.putImageData(GB.img,0,0); }
}
function gbAudio(){
  var ac=SND.ctx; if(!ac || !GB.gain || ac.state!=="running") return;
  var m=GB.mod, src=heap(m._get_audio_buffer_ptr(GB.e),m._get_audio_buffer_capacity(GB.e));
  var now=ac.currentTime;
  if(GB.aStart<now){ GB.aStart=now+0.1; }
  var buf=ac.createBuffer(2,GB_AUDIO_FRAMES,ac.sampleRate), l=buf.getChannelData(0), r=buf.getChannelData(1);
  for(var i=0;i<GB_AUDIO_FRAMES;i++){ l[i]=src[2*i]/255; r[i]=src[2*i+1]/255; }
  var n=ac.createBufferSource(); n.buffer=buf; n.connect(GB.gain); n.start(GB.aStart);
  GB.aStart+=GB_AUDIO_FRAMES/ac.sampleRate;
}
var GB_JOY={up:"_set_joyp_up",down:"_set_joyp_down",left:"_set_joyp_left",right:"_set_joyp_right",a:"_set_joyp_A",b:"_set_joyp_B",start:"_set_joyp_start",select:"_set_joyp_select"};
function gbJoy(b,down){ if(GB.e && GB_JOY[b]) GB.mod[GB_JOY[b]](GB.e,down?1:0); }
function gbSaveSram(){
  if(!GB.e) return; GB.dirty=false;
  var m=GB.mod, s=gbWithFile(m._ext_ram_file_data_new(GB.e),function(fd,buf){ m._emulator_write_ext_ram(GB.e,fd); return b64(buf); });
  if(!s) return;
  GB.save.sram=s; if(S.db) put(S.refs.cartsave.doc(GB.cart.id),GB.save);
}
function gbPause(on){
  if(!GB.e) return;
  GB.paused=on; GB.last=0; GB.aStart=0;
  if(on){ releaseButtons(); if(GB.dirty) gbSaveSram(); }
}
function gbStop(){
  if(!GB.e) return;
  if(GB.dirty) gbSaveSram();
  var m=GB.mod; cancelAnimationFrame(GB.raf); clearInterval(GB.timer);
  if(GB.gain){ try{ GB.gain.disconnect(); }catch(e){} GB.gain=null; }
  m._emulator_delete(GB.e); m._joypad_delete(GB.joy); m._free(GB.rom);
  GB.e=0; GB.joy=0; GB.rom=0; GB.cart=null;
  releaseButtons();
}
$("cart-eject").onclick=function(){ gbStop(); gbShowLib(); renderCarts(); };
$("cart-save").onclick=function(){
  if(!GB.e) return;
  var m=GB.mod, s=gbWithFile(m._state_file_data_new(GB.e),function(fd,buf){ m._emulator_write_state(GB.e,fd); return b64(buf); });
  GB.save.state=s; GB.save.stateAt=Date.now();
  if(GB.dirty){ gbSaveSram(); } else if(S.db) put(S.refs.cartsave.doc(GB.cart.id),GB.save);
  toast(tr("cart.saved")); sfx("ok"); resetCartLoad();
};
function resetCartLoad(){ var b=$("cart-load"); delete b.dataset.armed; b.textContent=tr("cart.load"); b.disabled=!(GB.save&&GB.save.state); }
$("cart-load").onclick=function(){
  var b=this; if(!GB.e || !GB.save.state) return;
  if(!b.dataset.armed){ b.dataset.armed="1"; b.textContent=tr("cart.loadgo"); setTimeout(function(){ if(b.dataset.armed) resetCartLoad(); },3000); return; }
  var m=GB.mod, st=unb64(GB.save.state), ok=false;
  gbWithFile(m._state_file_data_new(GB.e),function(fd,buf){ if(st.length===buf.length){ buf.set(st); ok=m._emulator_read_state(GB.e,fd)===0; } });
  resetCartLoad();
  if(ok){ toast(tr("cart.restored",{when:fmt(GB.save.stateAt)})); sfx("ok"); } else { toast(tr("cart.loadfail")); sfx("err"); }
};

if(window.LOPDA_DEBUG) window.LOPDA_DEBUG.GB=GB;
LP.padRoute("cart",function(b,down){ if(!GB.e) return false; gbJoy(b,down); return true; });
LP.builtin({id:"cart", label:"app.cart", icon:"cart", view:"cart", keepPad:true,
  open:function(){ openCart(); },
  leave:function(){ gbStop(); },
  padLayout:function(){ if(!$("v-cart").hidden) cartLayout(); },
  pause:function(){ gbPause(true); },
  resume:function(){ gbPause(false); }});
})();
