/* Shared pure helpers for score-model listings and score pages. */
(function(){
"use strict";
var DEFAULT_MODEL="openai/gpt-6.2-sol";
var MAX_PAGES=6;
function tokenPrice(value){
  var n=typeof value==="number" ? value : parseFloat(value);
  return isFinite(n) && n>=0 ? Math.round(n*1000000*100000000)/100000000 : null;
}
function models(payload){
  var source=Array.isArray(payload) ? payload : payload && Array.isArray(payload.data) ? payload.data : [], out=[];
  source.forEach(function(m){
    if(!m || !m.id) return;
    var mods=m.architecture && m.architecture.input_modalities, pricing=m.pricing||{};
    out.push({id:String(m.id), name:String(m.name||m.id), in:tokenPrice(pricing.prompt), out:tokenPrice(pricing.completion),
      vision:Array.isArray(mods) && mods.indexOf("image")>=0});
  });
  out.sort(function(a,b){
    var ap=a.in==null ? Infinity : a.in, bp=b.in==null ? Infinity : b.in;
    return ap-bp || (a.name<b.name?-1:a.name>b.name?1:0) || (a.id<b.id?-1:a.id>b.id?1:0);
  });
  return out;
}
/* the models a picture can go to; everything else is text only */
function visionOnly(list){
  return (Array.isArray(list) ? list : []).filter(function(m){ return !!(m && m.vision); });
}
/* A provider whose list is only ids ({data:[{id}]}) still fills the picker: no name, no prices, nothing known about pictures */
function idModels(payload){
  var source=Array.isArray(payload) ? payload : payload && Array.isArray(payload.data) ? payload.data : [], out=[];
  source.forEach(function(m){
    if(!m || typeof m.id!=="string" || !m.id) return;
    out.push({id:m.id, name:m.id, in:null, out:null, vision:false});
  });
  out.sort(function(a,b){ return a.id<b.id?-1:a.id>b.id?1:0; });
  return out;
}
function cleanModels(list){
  if(!Array.isArray(list)) return [];
  return list.filter(function(m){ return m && typeof m.id==="string" && m.id; }).map(function(m){
    var input=typeof m.in==="number" && isFinite(m.in) && m.in>=0 ? m.in : null;
    var output=typeof m.out==="number" && isFinite(m.out) && m.out>=0 ? m.out : null;
    return {id:m.id, name:typeof m.name==="string" && m.name ? m.name : m.id, in:input, out:output, vision:m.vision===true};
  }).sort(function(a,b){
    var ap=a.in==null ? Infinity : a.in, bp=b.in==null ? Infinity : b.in;
    return ap-bp || (a.name<b.name?-1:a.name>b.name?1:0) || (a.id<b.id?-1:a.id>b.id?1:0);
  });
}
function formatPrice(value){
  if(typeof value!=="number" || !isFinite(value) || value<0) return "—";
  if(value>0 && Number(value.toFixed(4))===0) return "<$0.0001";
  var s=value<0.01 ? value.toFixed(4).replace(/0+$/ ,"").replace(/\.$/,"") : value.toFixed(2);
  return "$"+(s||"0");
}
function formatModelPrice(model){ return formatPrice(model && model.in)+" / "+formatPrice(model && model.out); }
function scaleSize(w,h,maxLong){
  w=Math.max(1,+w||1); h=Math.max(1,+h||1); maxLong=Math.max(1,+maxLong||1600);
  var scale=Math.min(1,maxLong/Math.max(w,h));
  return {w:Math.max(1,Math.round(w*scale)),h:Math.max(1,Math.round(h*scale))};
}
/* area average, not nearest: a score is thin dark lines on paper, and point samples of a photo miss most of them */
function scaleLuma(gray,w,h,maxLong){
  var size=scaleSize(w,h,maxLong), out=new Uint8Array(size.w*size.h), x,y,sx,sy,x0,x1,y0,y1,sum;
  for(y=0;y<size.h;y++){
    y0=Math.floor(y*h/size.h); y1=Math.max(y0+1,Math.min(h,Math.floor((y+1)*h/size.h)));
    for(x=0;x<size.w;x++){
      x0=Math.floor(x*w/size.w); x1=Math.max(x0+1,Math.min(w,Math.floor((x+1)*w/size.w)));
      sum=0;
      for(sy=y0;sy<y1;sy++) for(sx=x0;sx<x1;sx++) sum+=gray[sy*w+sx];
      out[y*size.w+x]=Math.round(sum/((y1-y0)*(x1-x0)));
    }
  }
  return {w:size.w,h:size.h,gray:out};
}
function grayRgba(gray){
  var out=new Uint8ClampedArray(gray.length*4), i, value;
  for(i=0;i<gray.length;i++){ value=gray[i]; out[i*4]=out[i*4+1]=out[i*4+2]=value; out[i*4+3]=255; }
  return out;
}
function rgbaLuma(rgba){
  var out=new Uint8Array(rgba.length/4), i;
  for(i=0;i<out.length;i++) out[i]=Math.round(0.2126*rgba[i*4]+0.7152*rgba[i*4+1]+0.0722*rgba[i*4+2]);
  return out;
}
function appendPage(pages,page){
  if(!Array.isArray(pages) || pages.length>=MAX_PAGES) return null;
  var out=pages.slice(); out.push(page); return out;
}
function movePage(pages,index,delta){
  var out=Array.isArray(pages)?pages.slice():[], to=index+delta;
  if(index<0 || index>=out.length || to<0 || to>=out.length) return out;
  var page=out.splice(index,1)[0]; out.splice(to,0,page); return out;
}
function moveIndex(index,delta,length){ return Math.max(0,Math.min(length-1,index+delta)); }
window.LopdaScorePages={DEFAULT_MODEL:DEFAULT_MODEL, MAX_PAGES:MAX_PAGES, models:models, visionOnly:visionOnly,
  idModels:idModels, cleanModels:cleanModels,
  formatPrice:formatPrice, formatModelPrice:formatModelPrice, scaleSize:scaleSize, scaleLuma:scaleLuma,
  grayRgba:grayRgba, rgbaLuma:rgbaLuma, appendPage:appendPage, movePage:movePage, moveIndex:moveIndex};
})();
