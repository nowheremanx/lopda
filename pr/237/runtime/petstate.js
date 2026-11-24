/*
 * Lo-PDA runtime: a souvenir's item state. Pure functions only: no DOM, no storage, no clock, no random.
 * The caller passes the item and a ctx built from the room (now, hour, night, weather, season, lunar, onShelf);
 * stateOf() returns the 16 x 16 frame. docs/design/pet-souvenir-state.md.
 *
 * v1 drivers: grow (shelf time only) and match (night / hour / weather / season / stage / lunar / onShelf).
 * cycle is a later batch; event is not planned until there is an intraday weather source.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var WEATHER={sun:1,cloud:1,rain:1,snow:1,wind:1};
var SEASON={spring:1,summer:1,autumn:1,winter:1};
var MAX_LAYERS=4, MAX_GROW=6, MAX_MATCH=6, MAX_FRAMES=8;
var MAX_HOLD=30*86400, MAX_TOTAL=180*86400;

function isGrid(px){ return typeof px==="string" && px.length===256 && /^[0-3]{256}$/.test(px); }
function isObj(v){ return !!v && typeof v==="object" && !Array.isArray(v); }
function isNum(v){ return typeof v==="number" && isFinite(v); }
function isInt(v){ return isNum(v) && Math.floor(v)===v; }
function inList(v,list){ return list.indexOf(v)>=0; }

/* A clean when object, null when invalid. Absent (undefined/null) means "no condition". */
function cleanWhen(w){
  if(w===undefined || w===null) return undefined;
  if(!isObj(w)) return null;
  var out={}, key, v, i, arr;
  var keys=Object.keys(w);
  for(i=0;i<keys.length;i++){
    key=keys[i]; v=w[key];
    if(key==="night" || key==="lunarLeap" || key==="onShelf"){
      if(typeof v!=="boolean") return null;
      out[key]=v;
    } else if(key==="hour"){
      if(!Array.isArray(v) || v.length!==2 || !isInt(v[0]) || !isInt(v[1]) || v[0]<0 || v[0]>23 || v[1]<0 || v[1]>23 || v[0]===v[1]) return null;
      out.hour=[v[0],v[1]];
    } else if(key==="weather" || key==="season" || key==="stage"){
      if(!Array.isArray(v) || !v.length) return null;
      arr=[];
      for(var j=0;j<v.length;j++){
        if(typeof v[j]!=="string" || !v[j]) return null;
        if(key==="weather" && !WEATHER[v[j]]) return null;
        if(key==="season" && !SEASON[v[j]]) return null;
        arr.push(v[j]);
      }
      out[key]=arr;
    } else if(key==="lunarDay" || key==="lunarMonth"){
      if(!Array.isArray(v) || v.length!==2 || !isInt(v[0]) || !isInt(v[1])) return null;
      var hi=key==="lunarDay" ? 30 : 12;
      if(v[0]<1 || v[1]>hi || v[0]>v[1]) return null;
      out[key]=[v[0],v[1]];
    } else {
      return null;                                  /* an unknown condition cannot be guessed */
    }
  }
  return out;
}

function matches(when,ctx,base){
  if(!when) return true;
  if(!ctx) return false;
  if(when.night!==undefined && !!ctx.night!==when.night) return false;
  if(when.hour!==undefined){
    var h=+ctx.hour, from=when.hour[0], to=when.hour[1];
    if(!isNum(h)) return false;
    if(from<to){ if(!(h>=from && h<to)) return false; }
    else if(!(h>=from || h<to)) return false;
  }
  if(when.weather!==undefined && !inList(ctx.weather,when.weather)) return false;
  if(when.season!==undefined && !inList(ctx.season,when.season)) return false;
  if(when.stage!==undefined && !(base && base.stage && inList(base.stage,when.stage))) return false;
  if(when.onShelf!==undefined && !!ctx.onShelf!==when.onShelf) return false;
  if(when.lunarDay!==undefined || when.lunarMonth!==undefined || when.lunarLeap!==undefined){
    if(!ctx.lunar) return false;
    if(when.lunarDay!==undefined && !(+ctx.lunar.day>=when.lunarDay[0] && +ctx.lunar.day<=when.lunarDay[1])) return false;
    if(when.lunarMonth!==undefined && !(+ctx.lunar.month>=when.lunarMonth[0] && +ctx.lunar.month<=when.lunarMonth[1])) return false;
    if(when.lunarLeap!==undefined && !!ctx.lunar.leap!==when.lunarLeap) return false;
  }
  return true;
}

function growView(layer,item,ctx){
  var stages=layer.stages||[];
  if(!stages.length) return null;
  var age=(+item.grownMs||0);
  if(ctx.onShelf && item.plantedAt!==undefined && item.plantedAt!==null) age+=Math.max(0,(+ctx.now||0)-(+item.plantedAt||0));
  var left=age/1000, i, st;
  for(i=0;i<stages.length-1;i++){
    st=stages[i];
    if(left < (+st.hold||0)) return {px:st.px,id:st.id,stage:st.id};
    left-=(+st.hold||0);
  }
  st=stages[stages.length-1];
  return {px:st.px,id:st.id,stage:st.id};
}

function matchView(layer,ctx,base){
  var rules=layer.rules||[], i, r;
  for(i=0;i<rules.length;i++){
    r=rules[i];
    if(!r || !isGrid(r.px)) continue;
    if(!r.when || matches(r.when,ctx,base)) return {px:r.px,id:r.id||"match"};
  }
  return null;
}

function stateOf(item,ctx){
  var base={px:(item && item.px)||"",id:"still",layer:null,stage:null};
  if(!item || !item.state || !Array.isArray(item.state.layers)) return base;
  ctx=ctx||{};
  var layers=item.state.layers, i, l, r;
  for(i=0;i<layers.length;i++){
    l=layers[i];
    if(!l || !l.kind) continue;
    if(l.when && !matches(l.when,ctx,base)) continue;
    if(l.kind==="grow") r=growView(l,item,ctx);
    else if(l.kind==="match") r=matchView(l,ctx,base);
    else r=null;
    if(!r) continue;
    if(r.px) base.px=r.px;
    if(r.id) base.id=r.id;
    if(r.stage!==undefined && r.stage!==null) base.stage=r.stage;
    base.layer=l.kind;
  }
  return base;
}

function cleanStage(st){
  if(!isObj(st) || typeof st.id!=="string" || !/^[a-z0-9-]{1,16}$/.test(st.id) || !isGrid(st.px)) return null;
  if(!isInt(st.hold) || st.hold<0 || st.hold>MAX_HOLD) return null;
  return {id:st.id,px:st.px,hold:st.hold};
}

function cleanRule(r){
  if(!isObj(r) || !isGrid(r.px)) return null;
  var out={px:r.px};
  if(r.id!==undefined){ if(typeof r.id!=="string" || !/^[a-z0-9-]{1,16}$/.test(r.id)) return null; out.id=r.id; }
  if(r.when!==undefined){
    var w=cleanWhen(r.when);
    if(w===null) return null;
    if(w!==undefined) out.when=w;
  }
  return out;
}

function cleanLayer(layer,firstPx){
  if(!isObj(layer)) return null;
  var w=cleanWhen(layer.when);
  if(w===null) return null;
  var out, i, st, r, ids={}, total=0;
  if(layer.kind==="grow"){
    if(!Array.isArray(layer.stages) || layer.stages.length<2 || layer.stages.length>MAX_GROW) return null;
    out={kind:"grow",stages:[]};
    for(i=0;i<layer.stages.length;i++){
      st=cleanStage(layer.stages[i]);
      if(!st || ids[st.id]) return null;
      ids[st.id]=1;
      total+=st.hold;
      out.stages.push(st);
    }
    if(total>MAX_TOTAL) return null;
    if(firstPx && out.stages[0].px!==firstPx) return null;
  } else if(layer.kind==="match"){
    if(!Array.isArray(layer.rules) || !layer.rules.length || layer.rules.length>MAX_MATCH) return null;
    out={kind:"match",rules:[]};
    for(i=0;i<layer.rules.length;i++){
      r=cleanRule(layer.rules[i]);
      if(r) out.rules.push(r);
    }
    if(!out.rules.length) return null;
  } else {
    return null;
  }
  if(w!==undefined) out.when=w;
  return out;
}

function validate(spec,firstPx){
  if(!isObj(spec) || spec.v!==1 || !Array.isArray(spec.layers)) return null;
  if(!spec.layers.length || spec.layers.length>MAX_LAYERS) return null;
  var out={v:1,layers:[]}, frames=0, i, l;
  if(firstPx){
    for(i=0;i<spec.layers.length;i++){
      l=spec.layers[i];
      if(l && l.kind==="grow" && Array.isArray(l.stages) && l.stages[0] && l.stages[0].px!==firstPx) return null;
    }
  }
  for(i=0;i<spec.layers.length;i++){
    l=cleanLayer(spec.layers[i],firstPx);
    if(!l) continue;
    frames+=l.kind==="grow" ? l.stages.length : l.rules.length;
    out.layers.push(l);
  }
  if(!out.layers.length || frames>MAX_FRAMES) return null;
  return out;
}

window.LopdaPetState={stateOf:stateOf,validate:validate,matches:matches};
})();
