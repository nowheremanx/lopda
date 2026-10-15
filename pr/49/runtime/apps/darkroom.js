/*
 * Lo-PDA built-in: the darkroom (冲洗店). Step 1 of docs/design/darkroom.md section 9: the film box, where unloaded
 * rolls wait, named, exported as negatives and imported back. Developing comes in step 2.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * A roll: data/users/local/rolls/items/<id> {id, stock, seed, size, res, loaded, out, name, bytes, frames:[{n, px, taken,
 * dated, lens, exposure, contrast, blank}]}, written by the camera when it unloads (apps/camera.js); its latent images
 * are LopdaPlatform.files "roll/<id>/<nn>.jpg". A negative is a four-tone PNG of the roll laid out like a contact sheet
 * with the whole roll in its lpDa chunk (runtime/negative.js).
 *
 * Keys: the film box ▲▼ pick, A the roll's menu, START import a negative; the menu ▲▼ A B; naming A keeps, B cancels.
 * Export and import open the share sheet and the file picker, so they act on A's release (a press is not a gesture).
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, P=window.LopdaPlatform, NEG=window.LopdaNegative, FILM=LP.film;
var own=LP.own, toast=LP.toast, put=LP.put, pad2=LP.pad2, sfx=LP.sfx, show=LP.show, showPad=LP.showPad, TONES=LP.TONES;

/* the runtime's own import, not PAD's 2 MB: a fine-grain roll of 16 is about 3 MB */
var IMPORT_MAX=4*1024*1024, NAME_MAX=24;

var D={
  rolls:{}, loaded:false, pick:0,
  sheet:"", sel:0,           // over the box: "" | "menu" | "name" | "export" | "discard"; the selected row in it
  busy:null,                 // a line saying what is being done; keys wait until it is done
  neg:null,                  // the negative being made for export: {id, blob, promise}
  armA:false                 // A went down over the sheet now on screen
};

function el(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function visible(){ return !$("v-dark").hidden; }
function softkey(key,label,disabled){
  return {label:tr(label),disabled:!!disabled,fn:function(){ darkButton(key,true); darkButton(key,false); }};
}
/* newest out of the camera on top */
function ids(){ return Object.keys(D.rolls).sort(function(a,b){ return (D.rolls[b].out||0)-(D.rolls[a].out||0); }); }
function current(){ return D.rolls[ids()[D.pick]]||null; }
function title(r){ return r.name || FILM.stockLabel(r.stock); }
function dateOf(ts){ var d=new Date(ts); return d.getFullYear()+"."+pad2(d.getMonth()+1)+"."+pad2(d.getDate()); }
function sizeOf(bytes){ var kb=Math.max(1,Math.round((bytes||0)/1024)); return kb>=1024 ? (kb/1024).toFixed(1)+" MB" : kb+" KB"; }

/* ---------- the film box ---------- */
function load(){
  if(!S.db) { D.loaded=true; return Promise.resolve(); }
  return S.refs.rolls.get().then(function(q){
    var fresh={};
    q.docs.forEach(function(x){ var r=own(x.data()); if(r && r.id===x.id && Array.isArray(r.frames)) fresh[x.id]=r; });
    D.rolls=fresh; D.loaded=true;
  }).catch(function(){ D.loaded=true; });
}
function render(){
  var list=ids(), ul=$("dk-list"); ul.textContent="";
  D.pick=Math.max(0,Math.min(D.pick,list.length-1));
  if(!list.length) ul.appendChild(el("li","label",tr(D.loaded?"dk.empty":"dk.loading")));
  list.forEach(function(id,i){
    var r=D.rolls[id], li=el("li",i===D.pick?"on":"");
    var main=el("span");
    main.appendChild(el("b","",title(r)));
    main.appendChild(el("small","",tr("dk.row",{date:dateOf(r.out||r.loaded), n:r.size, size:sizeOf(r.bytes)})));
    li.appendChild(main);
    li.appendChild(el("em","",tr("dk.undev")));
    li.onclick=function(){ if(D.busy) return; D.pick=i; sfx("tap"); openMenu(); };
    ul.appendChild(li);
  });
  $("dk-status").textContent=D.busy||"";
  LP.softkeys($("dk-keys"),{
    select:null,start:softkey("start","sk.import",!!D.busy),
    b:null,a:softkey("a","sk.open",!!D.busy||!list.length)
  });
  var on=ul.querySelector("li.on"); if(on && on.scrollIntoView) on.scrollIntoView({block:"nearest"});
}

/* ---------- over the box: the roll's menu, naming, and the two confirmations ---------- */
function sheetItems(){
  if(D.sheet==="menu") return [{k:"rename", label:"dk.rename"},{k:"export", label:"dk.export"},{k:"discard", label:"dk.discard"}];
  if(D.sheet==="export") return [{k:"export-go", label:"dk.export.go"},{k:"back", label:"common.cancel"}];
  if(D.sheet==="discard") return [{k:"discard-go", label:"dk.discard.go"},{k:"back", label:"dk.discard.keep"}];
  return [];
}
function openMenu(){ if(!current()) return; D.sheet="menu"; D.sel=0; renderSheet(); }
function closeSheet(){ D.sheet=""; D.neg=null; renderSheet(); render(); }
/* a confirmation opens with the safe choice selected (sdk/UI.md section 8) */
function openConfirm(kind){
  D.sheet=kind; D.sel=1; renderSheet();
  if(kind==="export") makeNegative(current());
}
function renderSheet(){
  var sh=$("dk-sheet"), r=current();
  D.armA=false;
  sh.hidden=!D.sheet || !r; sh.textContent="";
  if(sh.hidden) return;
  var head=el("p","sheet-title"), top=D.sheet==="export"?tr("dk.export.title"):D.sheet==="discard"?tr("dk.discard.title"):title(r);
  head.appendChild(el("span","",top));
  if(top!==FILM.stockLabel(r.stock)) head.appendChild(el("small","",FILM.stockLabel(r.stock)));
  sh.appendChild(head);
  if(D.sheet==="name"){ nameSheet(sh,r); return; }
  if(D.sheet!=="menu") sh.appendChild(el("p","hint dk-note",tr(D.sheet==="export"?"dk.export.note":"dk.discard.note")));
  var ul=el("ul","lcd-menu");
  sheetItems().forEach(function(it,i){
    var li=el("li",i===D.sel?"on":""); li.appendChild(el("span","",tr(it.label)));
    if(it.k==="rename" && r.name) li.appendChild(el("small","",r.name));
    li.onclick=function(){ if(D.busy) return; D.sel=i; pick(); };
    ul.appendChild(li);
  });
  sh.appendChild(ul);
  var keys=el("div");
  LP.softkeys(keys,{
    select:null,start:null,
    b:softkey("b","sk.back",!!D.busy),
    a:softkey("a","sk.confirm",!!D.busy)
  });
  sh.appendChild(keys);
}
function nameSheet(sh,r){
  var form=el("form","dk-name"), input=el("input");
  input.id="dk-name"; input.type="text"; input.maxLength=NAME_MAX; input.value=r.name||""; input.placeholder=tr("dk.name.ph");
  input.autocomplete="off"; input.setAttribute("enterkeyhint","done");
  form.appendChild(input);
  form.onsubmit=function(e){ e.preventDefault(); saveName(); };
  input.addEventListener("keydown",function(e){ if(e.key==="Escape"){ e.preventDefault(); cancelName(); } });
  sh.appendChild(form);
  var keys=el("div");
  LP.softkeys(keys,{
    select:null,start:null,
    b:softkey("b","sk.cancel"),
    a:softkey("a","sk.save")
  });
  sh.appendChild(keys);
  /* inside the tap that chose "name", so a phone opens its keyboard */
  input.focus();
}
function saveName(){
  var r=current(), input=$("dk-name"); if(!r || !input) return;
  var name=LP.noEmoji(input.value).replace(/\s+/g," ").trim().slice(0,NAME_MAX);
  input.blur();
  if(name!==(r.name||"")){
    r.name=name;
    if(S.db) put(S.refs.rolls.doc(r.id),r);
  }
  sfx("ok"); D.sheet="menu"; D.sel=0; renderSheet(); render();
}
function cancelName(){ var input=$("dk-name"); if(input) input.blur(); sfx("miss"); D.sheet="menu"; D.sel=0; renderSheet(); }
function pick(){
  var it=sheetItems()[D.sel]; if(!it) return;
  if(it.k==="rename"){ sfx("tap"); D.sheet="name"; renderSheet(); }
  else if(it.k==="export"){ sfx("tap"); openConfirm("export"); }
  else if(it.k==="discard"){ sfx("tap"); openConfirm("discard"); }
  else if(it.k==="export-go") exportNegative();
  else if(it.k==="discard-go") discard();
  else if(it.k==="back") back();
}
function back(){
  if(D.sheet==="menu"){ sfx("miss"); closeSheet(); }
  else if(D.sheet==="name") cancelName();
  else if(D.sheet){ sfx("miss"); var was=D.sheet; D.sheet="menu"; D.sel=was==="discard"?2:1; D.neg=null; renderSheet(); }
}
function busy(text){ D.busy=text; renderSheet(); render(); }

/* ---------- the negative ---------- */
function rgb(t){ return "rgb("+t.join(",")+")"; }
/* snap every pixel to the nearest of the four tones: the text is drawn with the system's smoothing */
function snap(cv){
  var x=cv.getContext("2d",{willReadFrequently:true}), img=x.getImageData(0,0,cv.width,cv.height), d=img.data;
  for(var i=0;i<d.length;i+=4){
    var best=0, bd=1e9;
    for(var t=0;t<4;t++){ var T=TONES[t], a=d[i]-T[0], b=d[i+1]-T[1], c=d[i+2]-T[2], dd=a*a+b*b+c*c; if(dd<bd){ bd=dd; best=t; } }
    var B=TONES[best]; d[i]=B[0]; d[i+1]=B[1]; d[i+2]=B[2]; d[i+3]=255;
  }
  x.putImageData(img,0,0);
}
/* what goes into the lpDa chunk: the roll without what this handheld adds (its size on disk) */
function packable(r){
  return {id:r.id, no:r.no, stock:r.stock, seed:r.seed, size:r.size, res:r.res, loaded:r.loaded, out:r.out, name:r.name||"", frames:r.frames};
}
function bytesOf(blob){ return blob.arrayBuffer ? blob.arrayBuffer().then(function(b){ return new Uint8Array(b); }) : new Promise(function(res,rej){ var fr=new FileReader(); fr.onload=function(){ res(new Uint8Array(fr.result)); }; fr.onerror=rej; fr.readAsArrayBuffer(blob); }); }
/* lopda-negative-20261011-sunny-200-007.png: the day it was loaded, the stock and the roll's number on the handheld that
   shot it, in plain letters (a roll's own name may be Chinese, which some browsers and chat apps turn into "download");
   the number keeps a day's rolls apart without the system's "(1)" */
function rollNo(r){ return String(r.no).padStart(3,"0"); }
function negFile(r){ return "lopda-negative-"+FILM.fileStamp(r.loaded)+"-"+FILM.stockPrint(r.stock).replace(/\s+/g,"-").toLowerCase()+"-"+rollNo(r)+".png"; }
function buildNegative(r){
  var stock=FILM.stockPrint(r.stock);
  return FILM.fontsReady().then(function(){
    return Promise.all(r.frames.map(function(f){
      return f.blank ? null : P.files.get(FILM.latentKey(r.id,f.n)).then(function(b){ return b ? bytesOf(b) : null; },function(){ return null; });
    }));
  }).then(function(jpegs){
    var cv=FILM.buildCard(r.frames,{pal:TONES, res:r.res, size:r.size, loaded:r.loaded, out:r.out,
      lead:"NEGATIVE "+stock, edges:["LO-PDA NEGATIVE", stock+" "+FILM.stampOf(r.loaded).slice(0,8)],
      paper:rgb(TONES[3]), ink:rgb(TONES[0]), soft:rgb(TONES[1]),
      head:"LO-PDA NEGATIVE", sub:stock+" · "+r.size+" EXP"+(r.name?" · "+r.name:""), foot:"· ROLL "+rollNo(r)+" ·"});
    snap(cv);
    return new Promise(function(resolve,reject){ cv.toBlob(function(b){ if(b) resolve(b); else reject(new Error("png")); },"image/png"); })
      .then(bytesOf).then(function(png){ return new Blob([NEG.pack(png,packable(r),jpegs)],{type:"image/png"}); });
  });
}
/* made as soon as the confirmation opens, so the tap on Export can open the share sheet itself */
function makeNegative(r){
  var job={id:r.id, blob:null};
  job.promise=buildNegative(r).then(function(b){ job.blob=b; return b; });
  job.promise.catch(function(){});
  D.neg=job;
}
function exportNegative(){
  var r=current(), job=D.neg; if(!r) return;
  if(!job || job.id!==r.id){ makeNegative(r); job=D.neg; }
  var name=negFile(r);
  var save=function(blob){
    return S.downloads.save({filename:name, data:blob}).then(function(res){
      if(res && res.status==="saved"){ sfx("ok"); toast(tr("dk.exported")); }
    },function(e){ if(!(e && e.code==="declined")){ toast(LP.saveErr(e)); sfx("err"); } });
  };
  var done=function(){ D.busy=null; D.neg=null; D.sheet="menu"; D.sel=1; renderSheet(); render(); };
  if(job.blob){ done(); save(job.blob); return; }
  busy(tr("dk.exporting"));
  job.promise.then(save,function(e){ toast(tr("save.failed",{code:(e&&e.message)||"?"})); sfx("err"); }).then(done);
}
function discard(){
  var r=current(); if(!r) return;
  delete D.rolls[r.id]; D.sheet=""; renderSheet(); render();
  sfx("ok"); toast(tr("dk.discarded"));
  if(!S.db) return;
  S.refs.rolls.doc(r.id).delete().catch(function(){});
  r.frames.reduce(function(pr,f){ return pr.then(function(){ return P.files.del(FILM.latentKey(r.id,f.n)).catch(function(){}); }); },Promise.resolve());
}

/* ---------- importing a negative: all of it or nothing ---------- */
function startImport(){
  if(D.busy) return;
  if(!S.db){ toast(tr("reader.nodb")); sfx("err"); return; }
  var f=$("dk-file"); f.value=""; f.click();
}
$("dk-file").addEventListener("change",function(){
  var f=this.files && this.files[0]; this.value="";
  if(!f) return;
  if(f.size>IMPORT_MAX){ toast(tr("dk.big")); sfx("err"); return; }
  busy(tr("dk.importing"));
  bytesOf(f).then(function(u8){
    var got;
    try{ got=NEG.unpack(u8); }catch(e){ throw {bad:true}; }
    if(!FILM.STOCKS[got.roll.stock]) throw {bad:true};
    return S.refs.rolls.doc(got.roll.id).get().then(function(sn){
      if(sn.exists || D.rolls[got.roll.id]) throw {have:true};
      return keep(got.roll,got.jpegs);
    });
  }).then(function(r){
    D.rolls[r.id]=r; D.pick=ids().indexOf(r.id);
    sfx("ok"); toast(tr("dk.imported"));
  },function(e){
    sfx("err"); toast(tr(e && e.have ? "dk.have" : e && e.bad ? "dk.bad" : "dk.savefail"));
  }).then(function(){ D.busy=null; render(); });
});
/* the latent images first, then the roll; if any write fails, what was written goes again */
function keep(roll,jpegs){
  var r=packable(roll), bytes=0, written=[];
  r.frames.forEach(function(f){ bytes+=f.px.length; });
  jpegs.forEach(function(j){ if(j) bytes+=j.length; });
  r.bytes=bytes;
  return jpegs.reduce(function(pr,j,k){
    if(!j) return pr;
    return pr.then(function(){
      var key=FILM.latentKey(r.id,r.frames[k].n);
      return P.files.put(key,new Blob([j],{type:"image/jpeg"})).then(function(){ written.push(key); });
    });
  },Promise.resolve()).then(function(){ return S.refs.rolls.doc(r.id).set(r); }).then(function(){ return r; },function(e){
    written.forEach(function(key){ P.files.del(key).catch(function(){}); });
    throw e;
  });
}

/* ---------- chin pad ---------- */
function darkButton(b,down){
  if(D.busy) return;
  if(D.sheet==="name"){ if(!down) return; if(b==="a") saveName(); else if(b==="b") cancelName(); return; }
  if(D.sheet){
    var n=sheetItems().length;
    /* on release (export opens the share sheet), and only for a press that began here: the press that opened the menu is not a pick */
    if(b==="a"){ if(down) D.armA=true; else if(D.armA){ D.armA=false; pick(); } return; }
    if(!down) return;
    if(b==="up"||b==="down"){ D.sel=(D.sel+(b==="down"?1:n-1))%n; sfx("move"); renderSheet(); }
    else if(b==="b") back();
    return;
  }
  var count=ids().length;
  if(b==="start"){ if(!down) startImport(); return; }   /* on release: the file picker */
  if(!down) return;
  if((b==="up"||b==="down") && count){ D.pick=Math.max(0,Math.min(count-1,D.pick+(b==="up"?-1:1))); sfx("move"); render(); }
  else if(b==="a" && count){ sfx("tap"); openMenu(); }
}
LP.padRoute("dark",function(b,down){ if(!visible()) return false; darkButton(b,down); return true; });

/* ---------- home icon: a developing tank, its reel showing ---------- */
var ICON=["................","......0000......","......0110......","..000000000000..","..011111111110..","..000000000000..","...0333333330...","...0330000330...",
  "...0302112030...","...0301001030...","...0302112030...","...0330000330...","...0333333330...","...0322222230...","...0000000000...","................"];

/* what Settings shows next to the storage line */
LP.darkroom={summary:function(){
  if(!S.db) return Promise.resolve({n:0, bytes:0});
  return S.refs.rolls.get().then(function(q){
    var n=0, bytes=0; q.docs.forEach(function(x){ var r=x.data(); if(r){ n++; bytes+=r.bytes||0; } });
    return {n:n, bytes:bytes};
  });
}, size:sizeOf};

LP.builtin({id:"darkroom", label:"app.darkroom", icon:function(){ return ICON; }, view:"dark", keepPad:true,
  open:function(){
    D.sheet=""; D.neg=null; renderSheet();
    show("dark"); showPad(true); render();
    load().then(function(){ if(visible()) render(); });
  },
  leave:function(){ if(D.sheet==="name"){ var i=$("dk-name"); if(i) i.blur(); } D.sheet=""; D.neg=null; $("dk-sheet").hidden=true; },
  lang:function(){ if(visible()){ render(); renderSheet(); } }});
})();
