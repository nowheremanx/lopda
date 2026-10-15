/*
 * Lo-PDA: which physical lenses a phone has, from what enumerateDevices tells us. Pure functions, no DOM:
 * the camera (apps/camera.js) gathers the devices, tests/lenses.test.mjs runs this in node:vm.
 * docs/decisions.md section 4 and docs/design/darkroom.md 3.1.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

/* ids are what a frame records; mm is the 35mm-equivalent focal length the screen shows.
   Telephotos differ between Pro models (77, 120 mm...): all of them say 77. */
var ORDER=["uw","w","t","f"];
var MM={uw:13, w:26, t:77};

/* Safari names its cameras "Back Ultra Wide Camera", "Back Dual Wide Camera"... in the phone's language.
   English and Chinese are matched by name; any other language falls through to the capabilities. */
function byLabel(label){
  var s=String(label||"").toLowerCase();
  if(/dual|triple|双|三/.test(s)) return "virtual";   /* several lenses behind one name: it switches by itself */
  if(/ultra ?wide|超广角/.test(s)) return "uw";
  if(/tele|长焦/.test(s)) return "t";
  if(/front|前置/.test(s)) return "f";
  if(/\bback\b|\brear\b|后置/.test(s)) return "w";
  return null;
}
function has(list,v){ return list===v || (list && typeof list.indexOf==="function" && list.indexOf(v)>=0); }
function num(v){ return typeof v==="number" && isFinite(v); }
/* by capabilities: a zoom that goes below 1 is a virtual camera (0.5 is its ultra-wide); facingMode tells front from back */
function byCaps(caps){
  if(!caps) return null;
  if(caps.zoom && num(caps.zoom.min) && caps.zoom.min<1) return "virtual";
  if(has(caps.facingMode,"user")) return "f";
  if(has(caps.facingMode,"environment")) return "rear";
  return null;
}

/* devices: [{deviceId, label, caps}] for each videoinput, caps = getCapabilities() or null.
   Returns the lenses in SELECT order, [{id, deviceId}], or null when the phone cannot be read
   (one desktop webcam, unnamed cameras...): the camera then keeps the plain back/front pair. */
function identify(devices){
  var found={}, rears=[];
  (devices||[]).forEach(function(d){
    if(!d || !d.deviceId) return;
    var k=byLabel(d.label) || byCaps(d.caps);
    if(k==="rear") rears.push(d);
    else if(k && k!=="virtual" && !found[k]) found[k]=d;
  });
  /* back cameras the name did not explain: the closest focus is the ultra-wide, then the main camera, then the telephoto */
  if(rears.length===1 && !found.w) found.w=rears[0];
  else if(rears.length>1){
    if(rears.length>3 || !rears.every(function(d){ return d.caps.focusDistance && num(d.caps.focusDistance.min); })) return null;
    rears.sort(function(a,b){ return a.caps.focusDistance.min-b.caps.focusDistance.min; });
    var ids=rears.length===2 ? ["uw","w"] : ["uw","w","t"];
    rears.forEach(function(d,i){ if(!found[ids[i]]) found[ids[i]]=d; });
  }
  if(!found.w) return null;
  return ORDER.filter(function(k){ return found[k]; }).map(function(k){ return {id:k, deviceId:found[k].deviceId}; });
}

/* when the phone cannot be read: what the camera did before, opened by facingMode */
var FALLBACK=[{id:"w", facing:"environment", fallback:true}, {id:"f", facing:"user", fallback:true}];

/* the lens to open: the one asked for, else the main camera (the remembered one is gone), else the first */
function pick(lenses,id){
  var L=lenses||FALLBACK, i;
  for(i=0;i<L.length;i++) if(L[i].id===id) return L[i];
  for(i=0;i<L.length;i++) if(L[i].id==="w") return L[i];
  return L[0];
}
function next(lenses,id){ var L=lenses||FALLBACK, i=L.indexOf(pick(L,id)); return L[(i+1)%L.length]; }

window.LopdaLenses={ORDER:ORDER, MM:MM, FALLBACK:FALLBACK, byLabel:byLabel, byCaps:byCaps, identify:identify, pick:pick, next:next};
})();
