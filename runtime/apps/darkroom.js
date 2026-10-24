/*
 * Lo-PDA built-in: the darkroom (冲洗店), docs/design/darkroom.md. The film box, where unloaded rolls wait, named,
 * exported as negatives and imported back (step 1); developing a roll, looking at its pictures and printing them (step 2).
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * A roll: data/users/local/rolls/items/<id> {id, stock, seed, size, res, loaded, out, name, bytes, dev, frames:[{n, px,
 * taken, dated, lens, exposure, contrast, blank}]}, written by the camera when it unloads (apps/camera.js); its latent
 * images are LopdaPlatform.files "roll/<id>/<nn>.jpg". A negative is a four-tone PNG of the roll laid out like a contact
 * sheet with the whole roll in its lpDa chunk (runtime/negative.js). Developing (runtime/develop.js) writes
 * dev {v, seed, at} once; the pictures are never stored, every look and every print develops them again from the latent
 * images with the same seeds, so a reprint is the first print (decisions.md section 19).
 *
 * The viewer is the one place where the LCD shows colour: the print laid on the glass. Everything else here is four-tone.
 *
 * Keys: the film box ▲▼ pick, A or START the roll's menu, SELECT import a negative; the menu ▲▼ A B; naming A keeps,
 * B cancels. Developing ignores every key. The viewer: ◀▶ previous / next frame, START prints, B back to the box,
 * A nothing. The print follows a horizontal drag 1:1: past a quarter of its width, or a flick, it slides to the next
 * frame, otherwise it springs back; at either end it moves a third of the finger and springs back with err. A tap on
 * the left or right third turns a page the same way, and reduced motion skips the slide. The print menu ▲▼ A B.
 * Export, import and prints open the share sheet or the file picker, so they act on a release (a press is not a gesture).
 *
 * One key row (#dk-keys) at the bottom of every darkroom screen: the box, the viewer, developing and every sheet.
 * The overlays stop 44 px above it, so its four cells never move (owner 2026-10-21).
 */
(function(){
"use strict";
var LP=window.LP, $=LP.$, S=LP.S, tr=LP.tr, P=window.LopdaPlatform, NEG=window.LopdaNegative, DEV=window.LopdaDevelop, FILM=LP.film;
var own=LP.own, toast=LP.toast, put=LP.put, pad2=LP.pad2, sfx=LP.sfx, show=LP.show, showPad=LP.showPad, TONES=LP.TONES;

/* the runtime's own import, not PAD's 2 MB: a fine-grain roll of 16 is about 3 MB */
var IMPORT_MAX=4*1024*1024, NAME_MAX=24;

var D={
  rolls:{}, loaded:false, pick:0,
  sheet:"", sel:0,           // over the box: "" | "menu" | "name" | "export" | "discard" | "print"; the selected row in it
  busy:null,                 // a line saying what is being done; keys wait until it is done
  neg:null,                  // the negative being made for export: {id, blob, promise}
  armA:false,                // A went down over the sheet now on screen
  mode:"box",                // "box" | "dev" (developing, keys ignored) | "view" (the pictures, in colour)
  gen:0,                     // bumped when the darkroom closes: work started before then stops
  pics:null,                 // the open roll's developed 800x700 pictures: {id, img:[], job:[]}; never stored
  prints:null,               // the three prints being made for the print menu: {key, jobs}
  idx:0                      // the frame on the viewer
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
/*
 * The one key row. Every screen draws it through here, so the four cells keep their box: the box, the viewer,
 * developing (no keys) and the sheets (A confirms, B goes back; naming saves or cancels).
 */
function renderKeys(){
  var empty=!ids().length, keys;
  if(D.mode==="dev"){
    keys={select:null,start:null,b:null,a:null};
  }else if(D.sheet==="name"){
    keys={select:null,start:null,b:softkey("b","sk.cancel"),a:softkey("a","sk.save")};
  }else if(D.sheet){
    keys={select:null,start:null,b:softkey("b",D.sheet==="print"?"sk.cancel":"sk.back",!!D.busy),a:softkey("a","sk.confirm",!!D.busy)};
  }else if(D.mode==="view"){
    keys={select:null,start:softkey("start","sk.print",!!D.busy),b:softkey("b","sk.back",!!D.busy),a:null};
  }else{
    keys={select:softkey("select","sk.import",!!D.busy),start:softkey("start","sk.open",!!D.busy||empty),
      b:null,a:softkey("a","sk.open",!!D.busy||empty)};
  }
  LP.softkeys($("dk-keys"),keys);
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
    li.appendChild(el("em","",tr(r.dev?"dk.dev":"dk.undev")));
    li.onclick=function(){ if(D.busy) return; D.pick=i; sfx("tap"); openMenu(); };
    ul.appendChild(li);
  });
  $("dk-status").textContent=D.busy||"";
  renderKeys();
  var on=ul.querySelector("li.on"); if(on && on.scrollIntoView) on.scrollIntoView({block:"nearest"});
}

/* ---------- over the box: the roll's menu, naming, and the two confirmations ---------- */
function sheetItems(){
  if(D.sheet==="menu"){
    var r=current(), items=[r && r.dev ? {k:"view", label:"dk.view"} : {k:"develop", label:"dk.develop"},
      {k:"rename", label:"dk.rename"},{k:"export", label:"dk.export"},{k:"discard", label:"dk.discard"}];
    /* debug only (?debug): the owner tunes the stocks on his own photos */
    if(window.LOPDA_DEBUG) items.push({k:"compare", label:"dk.compare"});
    return items;
  }
  if(D.sheet==="print") return [{k:"p-single", label:"dk.p.single"},{k:"p-card", label:"dk.p.card"},{k:"p-strip", label:"dk.p.strip"}];
  if(D.sheet==="export") return [{k:"export-go", label:"dk.export.go"},{k:"back", label:"common.cancel"}];
  if(D.sheet==="discard") return [{k:"discard-go", label:"dk.discard.go"},{k:"back", label:"dk.discard.keep"}];
  return [];
}
function openMenu(){ if(!current()) return; D.sheet="menu"; D.sel=0; renderSheet(); }
/* back to the roll's menu with the row of `k` selected */
function toMenu(k){ D.sheet="menu"; D.sel=Math.max(0,sheetItems().map(function(it){ return it.k; }).indexOf(k)); }
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
  var head=el("p","sheet-title"), top=D.sheet==="export"?tr("dk.export.title"):D.sheet==="discard"?tr("dk.discard.title"):D.sheet==="print"?tr("dk.print.title",{n:pad2(D.idx+1)}):title(r);
  head.appendChild(el("span","",top));
  if(top!==FILM.stockLabel(r.stock)) head.appendChild(el("small","",FILM.stockLabel(r.stock)));
  sh.appendChild(head);
  if(D.sheet==="name"){ nameSheet(sh,r); renderKeys(); return; }
  if(D.sheet==="export" || D.sheet==="discard") sh.appendChild(el("p","hint dk-note",tr(D.sheet==="export"?"dk.export.note":"dk.discard.note")));
  var ul=el("ul","lcd-menu");
  sheetItems().forEach(function(it,i){
    var li=el("li",i===D.sel?"on":""); li.appendChild(el("span","",tr(it.label)));
    if(it.k==="rename" && r.name) li.appendChild(el("small","",r.name));
    li.onclick=function(){ if(D.busy) return; D.sel=i; pick(); };
    ul.appendChild(li);
  });
  sh.appendChild(ul);
  renderKeys();
}
function nameSheet(sh,r){
  var form=el("form","dk-name"), input=el("input");
  input.id="dk-name"; input.type="text"; input.maxLength=NAME_MAX; input.value=r.name||""; input.placeholder=tr("dk.name.ph");
  input.autocomplete="off"; input.setAttribute("enterkeyhint","done");
  form.appendChild(input);
  form.onsubmit=function(e){ e.preventDefault(); saveName(); };
  input.addEventListener("keydown",function(e){ if(e.key==="Escape"){ e.preventDefault(); cancelName(); } });
  sh.appendChild(form);
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
  sfx("ok"); toMenu("rename"); renderSheet(); render();
}
function cancelName(){ var input=$("dk-name"); if(input) input.blur(); sfx("miss"); toMenu("rename"); renderSheet(); }
function pick(){
  var it=sheetItems()[D.sel]; if(!it) return;
  if(it.k==="develop"){ sfx("tap"); startDevelop(current()); }
  else if(it.k==="view"){ sfx("tap"); openViewer(current()); }
  else if(it.k==="compare") compareStocks(current());
  else if(it.k==="p-single" || it.k==="p-card" || it.k==="p-strip") printOut(it.k);
  else if(it.k==="rename"){ sfx("tap"); D.sheet="name"; renderSheet(); }
  else if(it.k==="export"){ sfx("tap"); openConfirm("export"); }
  else if(it.k==="discard"){ sfx("tap"); openConfirm("discard"); }
  else if(it.k==="export-go") exportNegative();
  else if(it.k==="discard-go") discard();
  else if(it.k==="back") back();
}
function back(){
  if(D.sheet==="menu"){ sfx("miss"); closeSheet(); }
  else if(D.sheet==="name") cancelName();
  else if(D.sheet==="print"){ sfx("miss"); D.sheet=""; renderSheet(); renderKeys(); }
  else if(D.sheet){ sfx("miss"); var was=D.sheet; toMenu(was); D.neg=null; renderSheet(); }
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
  var o={id:r.id, no:r.no, stock:r.stock, seed:r.seed, size:r.size, res:r.res, loaded:r.loaded, out:r.out, name:r.name||"", frames:r.frames};
  if(r.dev) o.dev={v:r.dev.v, seed:r.dev.seed, at:r.dev.at};
  return o;
}
function bytesOf(blob){ return blob.arrayBuffer ? blob.arrayBuffer().then(function(b){ return new Uint8Array(b); }) : new Promise(function(res,rej){ var fr=new FileReader(); fr.onload=function(){ res(new Uint8Array(fr.result)); }; fr.onerror=rej; fr.readAsArrayBuffer(blob); }); }
/* lopda-negative-20261011-sunny-200-007.png: the day it was loaded, the stock and the roll's number on the handheld that
   shot it, in plain letters (a roll's own name may be Chinese, which some browsers and chat apps turn into "download");
   the number keeps a day's rolls apart without the system's "(1)" */
function rollNo(r){ return String(r.no).padStart(3,"0"); }
function negFile(r){ return fileBase("negative",r)+".png"; }
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
  var done=function(){ D.busy=null; D.neg=null; toMenu("export"); renderSheet(); render(); };
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

/* ---------- developing (runtime/develop.js): the latent images become pictures ---------- */
var LENS=window.LopdaLenses, DEV_MIN=3600, ANIM={W:128, H:112};
/* the animation's clock: not Date, which is the calendar (and stands still in tests/runtime-shots.mjs) */
function now(){ return window.performance && performance.now ? performance.now() : Date.now(); }
function css(c){ return "rgb("+c.join(",")+")"; }
function extend(a,b){ var o={}, k; for(k in a) o[k]=a[k]; for(k in b) o[k]=b[k]; return o; }
function devOpts(r,f,dev,scale,stock){
  return {stock:stock||r.stock, rollSeed:r.seed, size:r.size, res:r.res, n:f.n, exposure:f.exposure|0, contrast:f.contrast|0,
    dated:!!f.dated, taken:f.taken, blank:f.blank||null, devSeed:dev.seed, v:dev.v, scale:scale};
}
/* a JPEG to RGBA: drawn onto a fresh canvas and read back (the one canvas path that is safe on Safari) */
function decode(blob){
  return new Promise(function(resolve){
    var url=URL.createObjectURL(blob), img=new Image();
    img.onload=function(){
      URL.revokeObjectURL(url);
      try{
        var c=document.createElement("canvas"); c.width=img.naturalWidth; c.height=img.naturalHeight;
        var x=c.getContext("2d",{willReadFrequently:true}); x.drawImage(img,0,0);
        resolve({data:x.getImageData(0,0,c.width,c.height).data, w:c.width, h:c.height});
      }catch(e){ resolve(null); }
    };
    img.onerror=function(){ URL.revokeObjectURL(url); resolve(null); };
    img.src=url;
  });
}
/* a frame's latent image, or null: a blank frame, or one whose latent was lost, develops as bare film */
function latent(r,f){
  if(f.blank) return Promise.resolve(null);
  return P.files.get(FILM.latentKey(r.id,f.n)).then(function(b){ return b ? decode(b) : null; },function(){ return null; });
}
function developFrame(r,dev,k,scale,stock){
  var f=r.frames[k];
  return latent(r,f).then(function(src){ return DEV.develop(src,devOpts(r,f,dev,scale,stock)); });
}
function lensMark(f){ return !f.lens ? "" : f.lens==="f" ? "FRONT" : LENS.MM[f.lens]+"mm"; }
function lensText(f){ return !f.lens ? "" : f.lens==="f" ? tr("cam.lens.front") : tr("cam.lens.mm",{mm:LENS.MM[f.lens]}); }

/* the four-tone animation: developer, fixer, drying, at least DEV_MIN long, longer if the pictures take longer */
function animFrame(t,phase,p){
  var w=ANIM.W, h=ANIM.H, px=new Uint8Array(w*h), x, y;
  px.fill(3);
  var box=function(x0,y0,bw,bh,tone){ for(var yy=Math.max(0,y0);yy<Math.min(h,y0+bh);yy++) for(var xx=Math.max(0,x0);xx<Math.min(w,x0+bw);xx++) px[yy*w+xx]=tone; };
  /* the film: a dark strip with lighter frames on it */
  var strip=function(x0,y0,len,vertical,from){
    for(var i=from||0;i<(from||0)+len;i++){
      var a=vertical?x0:x0+i-(from||0), b=vertical?y0+i-(from||0):y0;
      for(var j=0;j<14;j++){ var X=vertical?a+j:a, Y=vertical?b:b+j; if(X<0||Y<0||X>=w||Y>=h) continue;
        var edge=j<3||j>10, hole=edge && (i%6)<2 && j!==0 && j!==13;
        px[Y*w+X]= hole ? 3 : edge ? 0 : (i%16)<2 ? 0 : 1; }
    }
  };
  if(phase<2){
    /* a tray, the liquid swaying, the strip under it, bubbles rising */
    box(10,46,108,40,0); box(13,46,102,37,3);
    var tone=phase===0?1:2;
    for(x=13;x<115;x++){ var top=56+Math.round(Math.sin(x/9+t/260)*2*(1+Math.sin(t/700))); box(x,top,1,83-top,tone); }
    strip(22,64+Math.round(Math.sin(t/300)*2),84,false);
    for(var b=0;b<5;b++){ var bx=24+b*19+Math.round(Math.sin(t/400+b)*2), by=80-((t/18+b*13)%24); if(by>58) { box(bx,by|0,2,2,3); } }
  }else{
    /* drying: the strip hangs from a line by a clip, swaying; a drop falls now and then */
    box(0,12,w,2,0);
    var sway=Math.round(Math.sin(t/500)*3);
    box(59,9,10,8,0); box(61,11,6,4,2);
    for(var i=0;i<74;i++){ var dx=Math.round(sway*i/74); strip(57+dx,17+i,1,true,i); }
    var dt=(t%1400)/1400, dy=92+Math.round(dt*dt*18);
    if(dy<h) box(63+sway,dy,2,3,1);
  }
  /* how far it has got */
  box(10,100,108,6,0); box(12,102,104,2,3); box(12,102,Math.round(104*p),2,1);
  return px;
}
function drawAnim(px){
  var cv=$("dk-dev-cv"), x=cv.getContext("2d"), img=x.createImageData(ANIM.W,ANIM.H), d=img.data;
  for(var i=0;i<px.length;i++){ var T=TONES[px[i]]; d[i*4]=T[0]; d[i*4+1]=T[1]; d[i*4+2]=T[2]; d[i*4+3]=255; }
  x.putImageData(img,0,0);
}
var STEPS=["dk.step.dev","dk.step.fix","dk.step.dry"];
/* A roll develops once (darkroom.md decision 8): the seed is the roll's id and this moment, written when every frame
   is done. HOME before then leaves the roll undeveloped. */
function startDevelop(r){
  if(!r || r.dev) return;
  var gen=++D.gen, at=Date.now(), dev={v:DEV.VERSION, seed:DEV.devSeed(r.id,at), at:at};
  var pics={id:r.id, img:[], job:[]}, work={done:0, total:r.frames.length, end:false}, t0=now(), last=-1;
  D.sheet=""; renderSheet(); D.mode="dev"; D.pics=pics;
  $("dk-dev").hidden=false; $("dk-view").hidden=true; renderKeys();
  (function next(k){
    if(gen!==D.gen) return;
    if(k>=work.total){
      r.dev=dev; if(S.db) put(S.refs.rolls.doc(r.id),r);
      work.end=true; return;
    }
    developFrame(r,dev,k,1).then(null,function(){ return DEV.develop(null,devOpts(r,r.frames[k],dev,1)); }).then(function(img){
      if(gen!==D.gen) return;
      pics.img[k]=img; work.done=k+1;
      setTimeout(function(){ next(k+1); },0);   /* let the animation draw between frames */
    });
  })(0);
  (function tick(){
    if(gen!==D.gen) return;
    var t=now()-t0, p=Math.min(t/DEV_MIN, work.done/work.total), phase=Math.min(2,Math.floor(p*3));
    if(phase!==last){ last=phase; sfx("tick"); }
    drawAnim(animFrame(t,phase,p));
    $("dk-dev-step").textContent=tr("dk.step",{step:tr(STEPS[phase]), n:pad2(work.done), size:pad2(work.total)});
    if(work.end && t>=DEV_MIN){ sfx("ok"); openViewer(r); return; }
    requestAnimationFrame(tick);
  })();
}

/* ---------- the viewer: the print laid on the glass, the LCD's one place in colour ---------- */
function openViewer(r){
  if(!r || !r.dev) return;
  if(r.dev.v!==DEV.VERSION){ toast(tr("dk.newer")); sfx("err"); return; }
  D.sheet=""; renderSheet();
  if(!D.pics || D.pics.id!==r.id) D.pics={id:r.id, img:[], job:[]};
  D.mode="view"; D.idx=0;
  $("dk-dev").hidden=true; $("dk-view").hidden=false; renderKeys();
  showFrame(); prefetch(r);
}
/* the pictures are developed again each time the roll is opened, never stored: one at a time, the one on screen first */
function pic(r,k){
  var pics=D.pics;
  if(pics.img[k]) return Promise.resolve(pics.img[k]);
  if(!pics.job[k]) pics.job[k]=developFrame(r,r.dev,k,1).then(null,function(){ return DEV.develop(null,devOpts(r,r.frames[k],r.dev,1)); }).then(function(img){ pics.img[k]=img; return img; });
  return pics.job[k];
}
/* the frame on the glass, then the two that can slide in next, then the rest of the roll */
function prefetch(r){
  var pics=D.pics, gen=D.gen, order=[D.idx], i;
  if(D.idx>0) order.push(D.idx-1);
  if(D.idx+1<r.frames.length) order.push(D.idx+1);
  for(i=0;i<r.frames.length;i++) if(order.indexOf(i)<0) order.push(i);
  (function next(j){
    if(gen!==D.gen || D.pics!==pics || j>=order.length) return;
    pic(r,order[j]).then(function(){ setTimeout(function(){ next(j+1); },0); });
  })(0);
}
function viewWait(text){ var w=$("dk-vwait"); w.hidden=!text; w.textContent=text||""; }

/* ---------- pushing the print: the one on the glass and its neighbours, moved together ---------- */
/* the three cards are siblings 800x700 canvases; #dk-vcv is the middle one (tests read it) */
var VCARD=[$("dk-vprev"), $("dk-vcv").parentNode, $("dk-vnext")];
var STILL=!!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
var V={on:false, id:null, x0:0, y0:0, lastX:0, lastT:0, v:0, horiz:null, slide:false, timer:null};

function vCanvas(card){ return card.getElementsByTagName("canvas")[0]; }
function putImg(cv,im){ var x=cv.getContext("2d"), img=x.createImageData(im.w,im.h); img.data.set(im.data); x.putImageData(img,0,0); }
function paper(cv){ var x=cv.getContext("2d"); x.fillStyle="#f1ece1"; x.fillRect(0,0,cv.width,cv.height); }
/* a card is a whole photo box wide, the 12 px gap is what the next one is offset by */
function span(){ return $("dk-photo").clientWidth+12; }
function placeCards(off,ms){
  var sp=span(), i;
  for(i=0;i<VCARD.length;i++){
    VCARD[i].style.transition=ms?"transform "+ms+"ms cubic-bezier(.2,.7,.3,1)":"none";
    VCARD[i].style.transform="translateX("+((i-1)*sp+off)+"px)";
  }
}
function showHead(){
  var r=current(); if(!r) return;
  var k=D.idx, f=r.frames[k];
  $("dk-vno").textContent=pad2(k+1)+"/"+pad2(r.size);
  $("dk-vinfo").textContent=[lensText(f), f.blank ? tr(f.blank==="dark"?"cam.unexposed":"cam.fogged") : FILM.stampOf(f.taken).slice(0,8)].filter(Boolean).join(" · ");
}
/* paint what is developed, bare paper where it is not; the ends have no card at all */
function fillCards(){
  var r=current(), i, k, card, cv, im;
  for(i=0;i<VCARD.length;i++){
    card=VCARD[i]; cv=vCanvas(card); k=D.idx+i-1;
    if(!r || k<0 || k>=r.frames.length){ card.style.visibility="hidden"; continue; }
    card.style.visibility="";
    im=D.pics && D.pics.img[k];
    if(im){ putImg(cv,im); continue; }
    paper(cv);
    /* ask for the neighbour itself, so a frame that arrives while we look paints the card it will slide from */
    if(i!==1) (function(i,k){
      pic(r,k).then(function(im){ if(D.mode==="view" && D.idx+i-1===k && D.pics && D.pics.img[k]) putImg(vCanvas(VCARD[i]),im); });
    })(i,k);
  }
}
function showFrame(){
  var r=current(); if(!r || D.mode!=="view") return;
  var k=D.idx;
  showHead();
  /* the one on the glass is asked for before fillCards asks for its neighbours, so it develops first */
  if(D.pics.img[k]) viewWait(D.busy);
  else {
    viewWait(D.busy||"…");
    pic(r,k).then(function(im){ if(D.mode==="view" && D.idx===k){ putImg($("dk-vcv"),im); viewWait(D.busy); } });
  }
  fillCards();
  placeCards(0,0);
}
/* the slide has landed: the new print is on the glass, so refill and reset without a transition.
   Called by the transition's end or by its timer, whichever comes first. */
function finishSlide(){
  if(!V.slide) return;
  V.slide=false;
  if(V.timer){ clearTimeout(V.timer); V.timer=null; }
  showFrame();
}
function slideTo(d){
  var r=current(), n=D.idx+d;
  if(!r || n<0 || n>=r.frames.length){ sfx("err"); return false; }
  /* the header follows the print as it leaves; the canvases catch up when the slide lands */
  D.idx=n; sfx("move"); showHead();
  if(STILL){ showFrame(); return true; }
  V.slide=true;
  placeCards(-d*span(),200);
  V.timer=setTimeout(finishSlide,220);
  return true;
}
function step(d){ finishSlide(); slideTo(d); }
function closeViewer(){ D.mode="box"; $("dk-view").hidden=true; render(); }
/* HOME, or reopening: everything developing or printing stops, nothing is kept */
function closeFull(){ D.gen++; D.mode="box"; D.pics=null; D.prints=null; $("dk-dev").hidden=true; $("dk-view").hidden=true; }
function viewButton(b,down){
  if(!down) return;
  finishSlide();                                   /* a key during a slide lands it first, so none is dropped */
  if(b==="left"||b==="right") step(b==="right"?1:-1);
  else if(b==="b"){ sfx("miss"); closeViewer(); }
  else if(b==="start"){ sfx("tap"); D.sheet="print"; D.sel=0; renderSheet(); preparePrints(current()); }
}
/* touch: push the print across the glass. The card follows the finger 1:1, a quarter of the width or a flick turns the
   page, and the ends are heavy paper (dx/3, then err and spring back). A tap on the left or right third still turns. */
function dragOff(r,dx){
  if(!r) return dx;
  if((D.idx===0 && dx>0) || (D.idx===r.frames.length-1 && dx<0)) return dx/3;
  return dx;
}
$("dk-photo").addEventListener("pointerdown",function(e){
  if(D.mode!=="view" || D.sheet || D.busy) return;
  if(e.button && e.button!==0) return;
  finishSlide();                                   /* a press while the last slide runs lands on the new print */
  V.on=true; V.id=e.pointerId; V.x0=e.clientX; V.y0=e.clientY; V.v=0; V.horiz=null;
  V.lastX=e.clientX; V.lastT=now();
  try{ this.setPointerCapture(e.pointerId); }catch(_){}
});
$("dk-photo").addEventListener("pointermove",function(e){
  if(!V.on || e.pointerId!==V.id) return;
  var dx=e.clientX-V.x0, dy=e.clientY-V.y0, t=now();
  if(V.horiz===null && (Math.abs(dx)>8 || Math.abs(dy)>8)) V.horiz=Math.abs(dx)>Math.abs(dy);
  if(!V.horiz) return;
  /* px/ms of the last move, the same reading as the prototype's flick */
  if(t>V.lastT){ V.v=(e.clientX-V.lastX)/(t-V.lastT); V.lastT=t; }
  V.lastX=e.clientX;
  placeCards(dragOff(current(),dx),0);
});
$("dk-photo").addEventListener("pointerup",function(e){
  if(!V.on || e.pointerId!==V.id) return;
  V.on=false;
  var r=current(), dx=e.clientX-V.x0, dy=e.clientY-V.y0, box=this.getBoundingClientRect();
  if(Math.abs(dx)<12 && Math.abs(dy)<12){
    var at=(e.clientX-box.left)/box.width;
    if(at<1/3) slideTo(-1); else if(at>2/3) slideTo(1); else placeCards(0,0);
    return;
  }
  if(V.horiz!==true){ placeCards(0,0); return; }
  /* a flick only counts in the direction the finger was already going */
  var fling=Math.abs(V.v)>0.5 && (V.v>0)===(dx>0);
  if(Math.abs(dx)>span()/4 || fling){
    if(!slideTo(dx<0?1:-1)) placeCards(0,STILL?0:180);
  }else{
    if(r && ((D.idx===0 && dx>0) || (D.idx===r.frames.length-1 && dx<0))) sfx("err");
    placeCards(0,STILL?0:180);
  }
});
$("dk-photo").addEventListener("pointercancel",function(e){
  if(!V.on || e.pointerId!==V.id) return;
  V.on=false;
  placeCards(0,STILL?0:180);
});
VCARD.forEach(function(c){ c.addEventListener("transitionend",function(e){ if(e.propertyName==="transform") finishSlide(); }); });
window.addEventListener("resize",function(){ if(D.mode==="view" && !V.slide && !V.on) placeCards(0,0); });

/* ---------- prints (darkroom.md "出片"): single 1600x1400, the contact sheet, the film strip ---------- */
function fileBase(kind,r){ return "lopda-"+kind+"-"+FILM.fileStamp(r.loaded)+"-"+FILM.stockPrint(r.stock).replace(/\s+/g,"-").toLowerCase()+"-"+rollNo(r); }
function canvasOf(im){
  var c=document.createElement("canvas"); c.width=im.w; c.height=im.h;
  var x=c.getContext("2d"), img=x.createImageData(im.w,im.h); img.data.set(im.data); x.putImageData(img,0,0);
  return c;
}
/* every frame at strip size, in order */
function smalls(r){
  var out=[];
  return r.frames.reduce(function(pr,f,k){
    return pr.then(function(){ return pic(r,k); }).then(function(im){ out[k]=DEV.shrink(im,FILM.STRIP.FW,FILM.STRIP.FH); });
  },Promise.resolve()).then(function(){ return out; });
}
/* the strip and the sheet in the stock's colours: the edge print in its colour (darkroom.md section 4), the focal length by each number */
function colourStrip(r,small){
  var e=DEV.edgeOf(r.stock), stock=FILM.stockPrint(r.stock);
  return {pal:[e.base,e.holes,e.text,e.text], res:r.res, size:r.size, loaded:r.loaded, out:r.out, lead:stock,
    edges:[stock, "LO-PDA "+stock], edgeInk:css(e.edge), marks:r.frames.map(lensMark), colour:small};
}
function buildPrint(kind,r,k){
  if(kind==="p-single") return developFrame(r,r.dev,k,2).then(function(im){ return {cv:canvasOf(im), name:fileBase("print",r)+"-"+pad2(k+1)+".png"}; });
  return Promise.all([smalls(r),FILM.fontsReady()]).then(function(got){
    var o=colourStrip(r,got[0]), stock=FILM.stockPrint(r.stock);
    if(kind==="p-strip") return {cv:FILM.buildStrip(r.frames,o), name:fileBase("strip",r)+".png"};
    var C=FILM.CARD;
    return {cv:FILM.buildCard(r.frames,extend(o,{paper:css(C.PAPER), ink:C.INK, soft:C.SOFT,
      head:stock, sub:(r.name?r.name+" · ":"")+r.size+" EXP", foot:"· LO-PDA LAB · ROLL "+rollNo(r)+" ·"})), name:fileBase("contact",r)+".png"};
  });
}
/* made as soon as the print menu opens, single first, so a tap can usually open the share sheet itself */
function preparePrints(r){
  var key=r.id+"-"+D.idx, k=D.idx;
  if(D.prints && D.prints.key===key) return;
  var jobs={}, gen=D.gen;
  D.prints={key:key, jobs:jobs};
  ["p-single","p-card","p-strip"].reduce(function(pr,kind){
    return pr.then(function(){
      if(gen!==D.gen || !D.prints || D.prints.jobs!==jobs) return;
      var job=jobs[kind]={out:null};
      job.promise=buildPrint(kind,r,k).then(function(o){ job.out=o; return o; });
      return job.promise.then(null,function(){});
    });
  },Promise.resolve());
}
function printOut(kind){
  var r=current(); if(!r || !r.dev) return;
  var gen=D.gen, job=D.prints && D.prints.key===r.id+"-"+D.idx && D.prints.jobs[kind];
  var save=function(o){
    if(gen!==D.gen) return;
    return LP.saveCanvas(o.cv,o.name).then(function(res){
      if(res && res.status==="saved"){ sfx("ok"); toast(tr("dk.printed")); }
    },function(e){ if(!(e && e.code==="declined")){ toast(LP.saveErr(e)); sfx("err"); } });
  };
  D.sheet=""; renderSheet();
  if(job && job.out){ sfx("tap"); renderKeys(); save(job.out); return; }
  sfx("tap"); D.busy=tr("dk.printing"); viewWait(D.busy); renderKeys();
  (job ? job.promise : buildPrint(kind,r,D.idx)).then(save,function(e){ toast(tr("save.failed",{code:(e&&e.message)||"?"})); sfx("err"); }).then(function(){
    D.busy=null; if(D.mode==="view") viewWait(D.pics && D.pics.img[D.idx] ? null : "…"); renderKeys();
  });
}

/* ---------- debug (?debug): this roll's first 4 frames under all 7 stocks, same seeds, one picture ---------- */
function compareStocks(r){
  var dev=r.dev || {v:DEV.VERSION, seed:DEV.devSeed(r.id,r.out), at:r.out}, gen=D.gen;
  var CW=400, CH=350, GAP=10, LW=250, TOP=70, cols=[];
  D.sheet=""; busy(tr("dk.comparing"));
  var fin=function(){ D.busy=null; render(); renderSheet(); };
  r.frames.reduce(function(pr,f,k){
    return pr.then(function(){
      if(cols.length>=4 || f.blank) return;
      return latent(r,f).then(function(src){ if(src) cols.push({k:k, src:src}); });
    });
  },Promise.resolve()).then(function(){
    if(!cols.length) throw new Error("no frames");
    return FILM.fontsReady();
  }).then(function(){
    var c=document.createElement("canvas"); c.width=LW+cols.length*(CW+GAP)+GAP; c.height=TOP+DEV.ORDER.length*(CH+GAP)+GAP;
    var x=c.getContext("2d");
    x.fillStyle="#26241f"; x.fillRect(0,0,c.width,c.height);
    x.fillStyle="#f1ece1"; x.font='34px "VT323", monospace'; x.textBaseline="middle";
    x.fillText("LO-PDA LAB · v"+dev.v+" · "+FILM.stockPrint(r.stock)+" ROLL "+rollNo(r),GAP,TOP/2);
    cols.forEach(function(col,i){ x.fillText(pad2(col.k+1)+" "+lensMark(r.frames[col.k]),LW+i*(CW+GAP)+GAP,TOP-16); });
    DEV.ORDER.forEach(function(id,j){
      var e=DEV.edgeOf(id); x.fillStyle=css(e.edge==null?[241,236,225]:e.edge);
      if(id==="noir") x.fillStyle="#f1ece1";
      x.fillText(FILM.stockPrint(id),GAP,TOP+j*(CH+GAP)+GAP+CH/2);
    });
    /* the pictures last, each with putImageData (never a canvas drawn onto a canvas) */
    return DEV.ORDER.reduce(function(pr,id,j){
      return pr.then(function(){
        cols.forEach(function(col,i){
          if(gen!==D.gen) return;
          var im=DEV.shrink(DEV.develop(col.src,devOpts(r,r.frames[col.k],dev,1,id)),CW,CH), img=x.createImageData(CW,CH);
          img.data.set(im.data); x.putImageData(img,LW+i*(CW+GAP)+GAP,TOP+j*(CH+GAP)+GAP);
        });
        return new Promise(function(res){ setTimeout(res,0); });
      });
    },Promise.resolve()).then(function(){ return c; });
  }).then(function(c){
    if(gen!==D.gen) return;
    fin();
    return LP.saveCanvas(c,fileBase("compare",r)+".png").then(function(res){ if(res && res.status==="saved") sfx("ok"); },function(e){ if(!(e && e.code==="declined")){ toast(LP.saveErr(e)); sfx("err"); } });
  },function(){ fin(); toast(tr("dk.nocompare")); sfx("err"); });
}

/* ---------- chin pad ---------- */
function darkButton(b,down){
  if(D.mode==="dev" || D.busy) return;   /* developing and printing ignore every key */
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
  if(D.mode==="view"){ viewButton(b,down); return; }
  var count=ids().length;
  if(b==="select"){ if(!down) startImport(); return; }   /* on release: the file picker */
  if(b==="start"){ if(down && count){ sfx("tap"); openMenu(); } return; }
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
    D.sheet=""; D.neg=null; closeFull(); renderSheet();
    show("dark"); showPad(true); render();
    load().then(function(){ if(visible()) render(); });
  },
  leave:function(){ if(D.sheet==="name"){ var i=$("dk-name"); if(i) i.blur(); } D.sheet=""; D.neg=null; D.busy=null; closeFull(); $("dk-sheet").hidden=true; },
  lang:function(){ if(visible()){ render(); renderSheet(); if(D.mode==="view") showFrame(); } }});
})();
