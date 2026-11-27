/*
 * Lo-PDA: the place of a picture. A fix is picked from the last two minutes of readings, a key turns into a
 * readable text ("XXXX-XXXX-...-CCCC") and the place travels in the negative sealed with AES-GCM, so only a
 * handheld holding the key can read it. Pure functions on bytes, no DOM, no storage, no network: WebCrypto is
 * passed in as `subtle` (the browser's crypto.subtle) and randomness comes from the caller, never from here.
 * tests/geotag.test.mjs runs this in node:vm; decisions.md section 40.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var MAX_AGE_GOOD=30000, MAX_ACC_GOOD=100, MAX_AGE_ANY=120000, MAX_ACC_ANY=1000;
var B64="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function isNum(v){ return typeof v==="number" && isFinite(v); }
function hex2(v){ return (v<16?"0":"")+v.toString(16); }

/* CRC-32 as PNG and zip use it (polynomial 0xEDB88320); kept here so the file works alone in the vm */
var TABLE=null;
function table(){
  if(TABLE) return TABLE;
  TABLE=new Uint32Array(256);
  for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++) c= c&1 ? 0xEDB88320^(c>>>1) : c>>>1; TABLE[n]=c>>>0; }
  return TABLE;
}
function crc32(u8){
  var T=table(), c=0xFFFFFFFF;
  for(var i=0;i<u8.length;i++) c=T[(c^u8[i])&255]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}

/* the newest fix is good enough while it is fresh; otherwise the most accurate one of the last two minutes */
function pick(fixes,now){
  if(!Array.isArray(fixes)) return null;
  var i, f, age, best=null;
  for(i=0;i<fixes.length;i++){
    f=fixes[i];
    if(!f || !isNum(f.lat) || !isNum(f.lon) || !isNum(f.acc) || !isNum(f.at)) continue;
    age=now-f.at; if(age<0) age=0;   /* a clock a little ahead is still a fresh fix */
    if(age<=MAX_AGE_GOOD && f.acc<=MAX_ACC_GOOD && (best===null || f.at>best.at)){ best=f; }
  }
  if(best) return {lat:best.lat, lon:best.lon, acc:best.acc, at:best.at};
  best=null;
  for(i=0;i<fixes.length;i++){
    f=fixes[i];
    if(!f || !isNum(f.lat) || !isNum(f.lon) || !isNum(f.acc) || !isNum(f.at)) continue;
    age=now-f.at; if(age<0) age=0;
    if(age>MAX_AGE_ANY || f.acc>MAX_ACC_ANY) continue;
    if(best===null || f.acc<best.acc || (f.acc===best.acc && f.at>best.at)){ best=f; }
  }
  return best ? {lat:best.lat, lon:best.lon, acc:best.acc, at:best.at} : null;
}

function toHex(bytes){
  var s="", i;
  for(i=0;i<bytes.length;i++) s+=hex2(bytes[i]);
  return s;
}
function fromHex(hex){
  if(typeof hex!=="string" || !/^[0-9a-fA-F]{32}$/.test(hex)) return null;
  var u=new Uint8Array(16), i;
  for(i=0;i<16;i++) u[i]=parseInt(hex.substr(i*2,2),16);
  return u;
}

/* "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-CCCC": the check group is the top 16 bits of the key's CRC-32 */
function keyText(bytes){
  var hex=toHex(bytes).toUpperCase(), groups=[], crc=crc32(bytes), i;
  for(i=0;i<8;i++) groups.push(hex.substr(i*4,4));
  groups.push(hex2((crc>>>24)&255).toUpperCase()+hex2((crc>>>16)&255).toUpperCase());
  return groups.join("-");
}
function parseKey(text){
  if(typeof text!=="string") return null;
  var s=text.replace(/[\s-]/g,"");
  if(!/^[0-9a-fA-F]{36}$/.test(s)) return null;
  var bytes=fromHex(s.substr(0,32));
  if(!bytes) return null;
  if(((crc32(bytes)>>>16)&0xFFFF)!==parseInt(s.substr(32,4),16)) return null;
  return bytes;
}

function keyId(subtle,bytes){
  return subtle.digest("SHA-256",bytes).then(function(buf){
    var u=new Uint8Array(buf), s="", i;
    for(i=0;i<4;i++) s+=hex2(u[i]);
    return s;
  });
}

/* UTF-8 by hand: the vm has no TextEncoder and the JSON here is ASCII anyway */
function utf8(s){
  var out=[], i, c, cp;
  for(i=0;i<s.length;i++){
    c=s.charCodeAt(i);
    if(c<0x80) out.push(c);
    else if(c<0x800) out.push(0xC0|(c>>6),0x80|(c&63));
    else if(c>=0xD800 && c<=0xDBFF && i+1<s.length){
      cp=0x10000+((c-0xD800)<<10)+(s.charCodeAt(++i)-0xDC00);
      out.push(0xF0|(cp>>18),0x80|((cp>>12)&63),0x80|((cp>>6)&63),0x80|(cp&63));
    }else out.push(0xE0|(c>>12),0x80|((c>>6)&63),0x80|(c&63));
  }
  return new Uint8Array(out);
}
function fromUtf8(u8){
  var s="", i=0, b, b2, b3, b4, cp;
  while(i<u8.length){
    b=u8[i++];
    if(b<0x80){ s+=String.fromCharCode(b); continue; }
    if(b>=0xC0 && b<0xE0 && i<u8.length){
      b2=u8[i++]; s+=String.fromCharCode(((b&31)<<6)|(b2&63)); continue;
    }
    if(b>=0xE0 && b<0xF0 && i+1<u8.length){
      b2=u8[i++]; b3=u8[i++]; s+=String.fromCharCode(((b&15)<<12)|((b2&63)<<6)|(b3&63)); continue;
    }
    if(b>=0xF0 && i+2<u8.length){
      b2=u8[i++]; b3=u8[i++]; b4=u8[i++];
      cp=((b&7)<<18)|((b2&63)<<12)|((b3&63)<<6)|(b4&63);
      cp-=0x10000; s+=String.fromCharCode(0xD800+(cp>>10),0xDC00+(cp&1023)); continue;
    }
    return null;
  }
  return s;
}

/* standard base64 with = padding; decoding is strict so a damaged string never looks like a ciphertext */
function b64encode(u8){
  var out="", i, n=u8.length, x;
  for(i=0;i+2<n;i+=3){
    x=(u8[i]<<16)|(u8[i+1]<<8)|u8[i+2];
    out+=B64.charAt((x>>>18)&63)+B64.charAt((x>>>12)&63)+B64.charAt((x>>>6)&63)+B64.charAt(x&63);
  }
  if(n-i===1){ x=u8[i]<<16; out+=B64.charAt((x>>>18)&63)+B64.charAt((x>>>12)&63)+"=="; }
  else if(n-i===2){ x=(u8[i]<<16)|(u8[i+1]<<8); out+=B64.charAt((x>>>18)&63)+B64.charAt((x>>>12)&63)+B64.charAt((x>>>6)&63)+"="; }
  return out;
}
function b64char(c){
  var n=B64.indexOf(c);
  return n<0 ? -1 : n;
}
function b64decode(s){
  if(typeof s!=="string" || s.length%4!==0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  var pad=s.slice(-2)==="==" ? 2 : s.slice(-1)==="=" ? 1 : 0;
  var out=new Uint8Array(s.length/4*3-pad), o=0, i, a, b, c, d, x;
  for(i=0;i<s.length;i+=4){
    a=b64char(s.charAt(i)); b=b64char(s.charAt(i+1));
    c=s.charAt(i+2)==="=" ? 0 : b64char(s.charAt(i+2));
    d=s.charAt(i+3)==="=" ? 0 : b64char(s.charAt(i+3));
    if(a<0 || b<0 || c<0 || d<0) return null;
    x=(a<<18)|(b<<12)|(c<<6)|d;
    out[o++]=(x>>>16)&255;
    if(o<out.length) out[o++]=(x>>>8)&255;
    if(o<out.length) out[o++]=x&255;
  }
  return out;
}

function seal(subtle,keyBytes,ivBytes,place){
  return Promise.resolve().then(function(){
    var plain={lat:Math.round(place.lat*1e6)/1e6, lon:Math.round(place.lon*1e6)/1e6, acc:Math.round(place.acc)};
    var data=utf8(JSON.stringify(plain));
    return subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["encrypt"]).then(function(key){
      return subtle.encrypt({name:"AES-GCM",iv:ivBytes,tagLength:128},key,data);
    }).then(function(buf){
      return keyId(subtle,keyBytes).then(function(id){
        return {k:id, iv:b64encode(ivBytes), ct:b64encode(new Uint8Array(buf))};
      });
    });
  });
}

function placeFromBytes(u8){
  var text=fromUtf8(u8);
  if(text==null) return null;
  var p;
  try{ p=JSON.parse(text); }catch(e){ return null; }
  if(!p || typeof p!=="object") return null;
  if(!isNum(p.lat) || !isNum(p.lon) || !isNum(p.acc)) return null;
  if(p.lat<-90 || p.lat>90 || p.lon<-180 || p.lon>180 || p.acc<0) return null;
  return {lat:p.lat, lon:p.lon, acc:p.acc};
}

/* a keyring document from storage or a backup, or anything else, reduced to the keys this runtime can use: 8 hex ids,
   32 hex keys, no duplicate id, and a current id that names a key. null when nothing usable is left. */
function cleanRing(doc){
  if(!doc || typeof doc!=="object" || !Array.isArray(doc.keys)) return null;
  var keys=[], seen={}, i, k, id, key;
  for(i=0;i<doc.keys.length;i++){
    k=doc.keys[i];
    if(!k || typeof k!=="object") continue;
    id=typeof k.id==="string" ? k.id.toLowerCase() : "";
    key=typeof k.key==="string" ? k.key.toLowerCase() : "";
    if(!/^[0-9a-f]{8}$/.test(id) || !/^[0-9a-f]{32}$/.test(key) || seen[id]) continue;
    seen[id]=true;
    keys.push({id:id, key:key, added:isNum(k.added) ? k.added : 0});
  }
  if(!keys.length) return null;
  var current=typeof doc.current==="string" ? doc.current.toLowerCase() : "";
  if(!seen[current]) current=keys[0].id;
  return {keys:keys, current:current};
}

/* a restore adds a backup's keys to this phone's own, never the other way: union by id, mine's order first, then
   theirs' new ones; the backup's current key wins when it is in the union. null when neither side holds a valid key. */
function mergeRing(mine, theirs){
  var a=cleanRing(mine), b=cleanRing(theirs), keys=[], seen={}, i, k;
  if(!a && !b) return null;
  /* the raw current ids, before cleanRing falls back to a ring's first key, so "theirs' current if it is in the
     union, else mine's" still holds when a current id names a key cleanRing dropped */
  var acur=mine && typeof mine.current==="string" ? mine.current.toLowerCase() : "";
  var bcur=theirs && typeof theirs.current==="string" ? theirs.current.toLowerCase() : "";
  if(a) for(i=0;i<a.keys.length;i++){ k=a.keys[i]; keys.push(k); seen[k.id]=true; }
  if(b) for(i=0;i<b.keys.length;i++){ k=b.keys[i]; if(seen[k.id]) continue; keys.push(k); seen[k.id]=true; }
  var current=keys[0].id;
  if(b && seen[bcur]) current=bcur;
  else if(a && seen[acur]) current=acur;
  return {keys:keys, current:current};
}

/* try the named key first, then the rest in order; any failure (including a bad key) is just "not this one" */
function open(subtle,keyring,sealed){
  return Promise.resolve().then(function(){
    if(!sealed || typeof sealed!=="object") return null;
    var iv=b64decode(sealed.iv), ct=b64decode(sealed.ct);
    if(!iv || iv.length!==12 || !ct) return null;
    var order=[], chosen=null, i, k;
    if(Array.isArray(keyring)){
      for(i=0;i<keyring.length;i++){
        k=keyring[i];
        if(!k || typeof k!=="object" || !k.bytes) continue;
        if(!chosen && k.id===sealed.k) chosen=k;
        else order.push(k);
      }
      if(chosen) order.unshift(chosen);
    }
    function attempt(n){
      if(n>=order.length) return null;
      var bytes=order[n].bytes;
      return subtle.importKey("raw",bytes,{name:"AES-GCM"},false,["decrypt"]).then(function(key){
        return subtle.decrypt({name:"AES-GCM",iv:iv,tagLength:128},key,ct);
      }).then(function(buf){
        var place=placeFromBytes(new Uint8Array(buf));
        return place ? place : attempt(n+1);
      }).catch(function(){
        return attempt(n+1);
      });
    }
    return attempt(0);
  }).catch(function(){ return null; });
}

window.LopdaGeotag={pick:pick, keyText:keyText, parseKey:parseKey, keyId:keyId, toHex:toHex, fromHex:fromHex,
  cleanRing:cleanRing, mergeRing:mergeRing, seal:seal, open:open};
})();
