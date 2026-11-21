/* Shared pure helpers for score-model listings and score pages. */
(function(){
"use strict";
var DEFAULT_MODEL="openai/gpt-6.2-sol";
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
window.LopdaScorePages={DEFAULT_MODEL:DEFAULT_MODEL, models:models, cleanModels:cleanModels,
  formatPrice:formatPrice, formatModelPrice:formatModelPrice};
})();
