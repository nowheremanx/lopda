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
    var mods=m && m.architecture && m.architecture.input_modalities;
    if(!Array.isArray(mods) || mods.indexOf("image")<0 || !m.id) return;
    var pricing=m.pricing||{};
    out.push({id:String(m.id), name:String(m.name||m.id), in:tokenPrice(pricing.prompt), out:tokenPrice(pricing.completion)});
  });
  out.sort(function(a,b){
    var ap=a.in==null ? Infinity : a.in, bp=b.in==null ? Infinity : b.in;
    return ap-bp || (a.name<b.name?-1:a.name>b.name?1:0) || (a.id<b.id?-1:a.id>b.id?1:0);
  });
  return out;
}
function cleanModels(list){
  if(!Array.isArray(list)) return [];
  return list.filter(function(m){ return m && typeof m.id==="string" && m.id; }).map(function(m){
    var input=typeof m.in==="number" && isFinite(m.in) && m.in>=0 ? m.in : null;
    var output=typeof m.out==="number" && isFinite(m.out) && m.out>=0 ? m.out : null;
    return {id:m.id, name:typeof m.name==="string" && m.name ? m.name : m.id, in:input, out:output};
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
function scaleLuma(gray,w,h,maxLong){
  var size=scaleSize(w,h,maxLong), out=new Uint8Array(size.w*size.h), x,y,sx,sy;
  for(y=0;y<size.h;y++){
    sy=Math.min(h-1,Math.floor((y+0.5)*h/size.h));
    for(x=0;x<size.w;x++){
      sx=Math.min(w-1,Math.floor((x+0.5)*w/size.w));
      out[y*size.w+x]=gray[sy*w+sx];
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
window.LopdaScorePages={DEFAULT_MODEL:DEFAULT_MODEL, MAX_PAGES:MAX_PAGES, models:models, cleanModels:cleanModels,
  formatPrice:formatPrice, formatModelPrice:formatModelPrice, scaleSize:scaleSize, scaleLuma:scaleLuma,
  grayRgba:grayRgba, rgbaLuma:rgbaLuma, appendPage:appendPage, movePage:movePage, moveIndex:moveIndex};
})();
