/*
 * Lo-PDA: the negative file. A roll leaves the handheld as a four-tone PNG (what anyone sees in a photo library)
 * with the whole roll hidden in a private ancillary chunk `lpDa` just before IEND: the metadata, every frame's
 * four-tone pixels and every latent image (the colour JPEG taken with the frame). Pure functions on bytes, no DOM:
 * the darkroom (apps/darkroom.js) draws the PNG and calls pack/unpack, tests/negative.test.mjs runs this in node:vm.
 * docs/design/darkroom.md section 5.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * Chunk data, format version 2:
 *   "LOPDA-NEG" (9 bytes) | version (1 byte) | JSON length (uint32 BE) | JSON (UTF-8) | 2-bit pixels | JPEGs | CRC32 (uint32 BE)
 * The CRC covers everything before it. JSON: {roll, latent}, with px omitted from each frame; pixels are packed
 * four per byte, most significant bits first. latent[k] is [offset, length] into the JPEG area for frame k, or null.
 * Format version 1 stored each frame's px string in the JSON and put JPEGs immediately after it.
 * A developed roll has roll.dev {v, seed, at} (runtime 0.20.0); it needs no new format version, older runtimes ignore it.
 */
(function(){
"use strict";

var MAGIC="LOPDA-NEG", VERSION=2, CHUNK="lpDa";
var SIG=[137,80,78,71,13,10,26,10];

/* every failure is one of three: not a Lo-PDA negative at all, a damaged one, or one from a newer handheld */
function fail(code,msg){ var e=new Error(msg||code); e.code=code; return e; }

var TABLE=null;
function table(){
  if(TABLE) return TABLE;
  TABLE=new Uint32Array(256);
  for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++) c= c&1 ? 0xEDB88320^(c>>>1) : c>>>1; TABLE[n]=c>>>0; }
  return TABLE;
}
/* CRC-32 as PNG and zip use it, over u8[start, end) */
function crc32(u8,start,end){
  var T=table(), c=0xFFFFFFFF;
  start=start||0; end=end==null?u8.length:end;
  for(var i=start;i<end;i++) c=T[(c^u8[i])&255]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
function u32(u8,o){ return ((u8[o]<<24)>>>0)+(u8[o+1]<<16)+(u8[o+2]<<8)+u8[o+3]; }
function setU32(u8,o,v){ u8[o]=(v>>>24)&255; u8[o+1]=(v>>>16)&255; u8[o+2]=(v>>>8)&255; u8[o+3]=v&255; }
function ascii(s){ var u=new Uint8Array(s.length); for(var i=0;i<s.length;i++) u[i]=s.charCodeAt(i)&255; return u; }
function asciiAt(u8,o,n){ var s=""; for(var i=0;i<n;i++) s+=String.fromCharCode(u8[o+i]); return s; }

/* UTF-8 with the platform's coder where there is one; the fallback is plain ES5 */
function utf8(s){
  if(typeof TextEncoder!=="undefined") return new TextEncoder().encode(s);
  var b=unescape(encodeURIComponent(s)); return ascii(b);
}
function fromUtf8(u8){
  if(typeof TextDecoder!=="undefined") return new TextDecoder("utf-8",{fatal:true}).decode(u8);
  var s="", CH=8192;
  for(var i=0;i<u8.length;i+=CH) s+=String.fromCharCode.apply(null,Array.prototype.slice.call(u8,i,i+CH));
  return decodeURIComponent(escape(s));
}

/* walk the PNG's chunks: [{type, start (of the length field), data, end}] */
function chunks(u8){
  if(!u8 || u8.length<8) throw fail("notneg");
  for(var i=0;i<8;i++) if(u8[i]!==SIG[i]) throw fail("notneg");
  var out=[], o=8;
  while(o<u8.length){
    if(o+12>u8.length) throw fail("damaged","truncated chunk");
    var len=u32(u8,o), type=asciiAt(u8,o+4,4), end=o+12+len;
    if(end>u8.length) throw fail("damaged","chunk runs past the end");
    out.push({type:type, start:o, data:o+8, len:len, end:end});
    o=end;
    if(type==="IEND") break;
  }
  if(!out.length || out[out.length-1].type!=="IEND") throw fail("damaged","no IEND");
  return out;
}
function chunkBytes(type,data){
  var c=new Uint8Array(12+data.length);
  setU32(c,0,data.length); c.set(ascii(type),4); c.set(data,8);
  setU32(c,8+data.length,crc32(c,4,8+data.length));
  return c;
}

/* the roll as the darkroom keeps it, checked field by field: an import takes all of it or nothing */
/* tz (minutes east of UTC, runtime 0.39.0) is in the whitelist: runtimes before 0.39.0 refuse a negative whole
   when its frames carry it (one-off; nothing is lost, the file stays as exported and imports on this version). */
var FRAME_KEYS={n:1, px:1, taken:1, tz:1, dated:1, lens:1, exposure:1, contrast:1, blank:1};
function int(v,a,b){ return typeof v==="number" && v===Math.floor(v) && v>=a && v<=b; }
/* a developed roll carries how it was developed (darkroom step 2): the algorithm's version, the develop seed and when.
   A friend who imports the negative prints the same pictures. Older runtimes ignore the key. */
function checkDev(dev){
  if(!dev || typeof dev!=="object" || Array.isArray(dev)) return false;
  for(var key in dev) if(key!=="v" && key!=="seed" && key!=="at") return false;
  return int(dev.v,1,999) && int(dev.seed,0,4294967295) && int(dev.at,0,1e14);
}
function checkRoll(roll){
  var ok=roll && typeof roll==="object" &&
    typeof roll.id==="string" && /^[a-z0-9]{1,40}$/.test(roll.id) &&
    typeof roll.stock==="string" && /^[a-z]{1,20}$/.test(roll.stock) &&
    int(roll.size,1,36) && (roll.res===1 || roll.res===2) &&
    int(roll.no,1,999999) && int(roll.seed,0,4294967295) && int(roll.loaded,0,1e14) && int(roll.out,0,1e14) &&
    typeof roll.name==="string" && roll.name.length<=64 &&
    Array.isArray(roll.frames) && roll.frames.length===roll.size && (roll.dev==null || checkDev(roll.dev));
  if(!ok) return false;
  var want=128*roll.res*112*roll.res;
  for(var k=0;k<roll.frames.length;k++){
    var f=roll.frames[k];
    if(!f || typeof f!=="object" || f.n!==k+1 || typeof f.px!=="string" || f.px.length!==want || !/^[0-3]*$/.test(f.px) || !int(f.taken,0,1e14)) return false;
    for(var key in f) if(!FRAME_KEYS[key]) return false;
    if(f.tz!=null && !int(f.tz,-840,840)) return false;
    if(f.dated!=null && typeof f.dated!=="boolean") return false;
    if(f.lens!=null && !/^(uw|w|t|f)$/.test(f.lens)) return false;
    if(f.exposure!=null && !int(f.exposure,-3,3)) return false;
    if(f.contrast!=null && !int(f.contrast,-3,3)) return false;
    if(f.blank!=null && f.blank!=="light" && f.blank!=="dark") return false;
  }
  return true;
}

function rollWithoutPixels(roll){
  var copy={}, key;
  for(key in roll) if(Object.prototype.hasOwnProperty.call(roll,key)){
    if(key==="frames"){
      copy.frames=[];
      for(var i=0;i<roll.frames.length;i++){
        var frame={}, source=roll.frames[i];
        for(var frameKey in source) if(Object.prototype.hasOwnProperty.call(source,frameKey) && frameKey!=="px") frame[frameKey]=source[frameKey];
        copy.frames.push(frame);
      }
    }else copy[key]=roll[key];
  }
  return copy;
}

/* png: the visible negative (any valid PNG). roll: the roll document. jpegs: per frame a Uint8Array or null.
   Returns a new PNG with the lpDa chunk just before IEND (any lpDa already in it is dropped). */
function pack(png,roll,jpegs){
  if(!checkRoll(roll)) throw fail("badroll","bad roll");
  if(!jpegs || jpegs.length!==roll.frames.length) throw fail("badroll","one latent slot per frame");
  var latent=[], bin=0;
  jpegs.forEach(function(j){
    if(j && j.length){ latent.push([bin,j.length]); bin+=j.length; }
    else latent.push(null);
  });
  var pixelsPerFrame=128*roll.res*112*roll.res, pixelBytes=roll.frames.length*pixelsPerFrame/4;
  var json=utf8(JSON.stringify({roll:rollWithoutPixels(roll), latent:latent}));
  var data=new Uint8Array(MAGIC.length+1+4+json.length+pixelBytes+bin+4), o=0;
  data.set(ascii(MAGIC),0); o=MAGIC.length;
  data[o++]=VERSION;
  setU32(data,o,json.length); o+=4;
  data.set(json,o); o+=json.length;
  for(var k=0;k<roll.frames.length;k++){
    var px=roll.frames[k].px;
    for(var p=0;p<pixelsPerFrame;p+=4){
      data[o++]=((px.charCodeAt(p)-48)<<6)|((px.charCodeAt(p+1)-48)<<4)|((px.charCodeAt(p+2)-48)<<2)|(px.charCodeAt(p+3)-48);
    }
  }
  jpegs.forEach(function(j){ if(j && j.length){ data.set(j,o); o+=j.length; } });
  setU32(data,o,crc32(data,0,o));
  var list=chunks(png), keep=list.filter(function(c){ return c.type!==CHUNK; }), extra=chunkBytes(CHUNK,data);
  var size=8+extra.length; keep.forEach(function(c){ size+=c.end-c.start; });
  var out=new Uint8Array(size); out.set(SIG,0); o=8;
  keep.forEach(function(c){
    if(c.type==="IEND"){ out.set(extra,o); o+=extra.length; }
    out.set(png.subarray(c.start,c.end),o); o+=c.end-c.start;
  });
  return out;
}

function unpackPixels(d,start,want){
  var parts=[], codes=[], end=start+want/4;
  for(var o=start;o<end;o++){
    var b=d[o];
    codes.push(48+(b>>>6),48+((b>>>4)&3),48+((b>>>2)&3),48+(b&3));
    if(codes.length>=8192){ parts.push(String.fromCharCode.apply(null,codes)); codes=[]; }
  }
  if(codes.length) parts.push(String.fromCharCode.apply(null,codes));
  return parts.join("");
}

/* bytes of a picked file -> {roll, jpegs}. Throws {code: "notneg" | "damaged" | "version"}. */
function unpack(u8){
  var list=chunks(u8), c=null;
  for(var i=0;i<list.length;i++) if(list[i].type===CHUNK){ c=list[i]; break; }
  if(!c) throw fail("notneg","no lpDa chunk");
  if(crc32(u8,c.start+4,c.data+c.len)!==u32(u8,c.data+c.len)) throw fail("damaged","chunk CRC");
  var d=u8.subarray(c.data,c.data+c.len), head=MAGIC.length+1+4;
  if(d.length<head+4 || asciiAt(d,0,MAGIC.length)!==MAGIC) throw fail("notneg","magic");
  var version=d[MAGIC.length];
  if(version!==1 && version!==2) throw fail("version","format "+version);
  if(crc32(d,0,d.length-4)!==u32(d,d.length-4)) throw fail("damaged","content CRC");
  var jlen=u32(d,MAGIC.length+1);
  if(head+jlen>d.length-4) throw fail("damaged","JSON length");
  var meta;
  try{ meta=JSON.parse(fromUtf8(d.subarray(head,head+jlen))); }catch(e){ throw fail("damaged","JSON"); }
  var binStart=head+jlen, pixelBytes=0;
  if(version===2){
    if(!meta || !meta.roll || !Array.isArray(meta.roll.frames) || !int(meta.roll.size,1,36) ||
      meta.roll.frames.length!==meta.roll.size || (meta.roll.res!==1 && meta.roll.res!==2)) throw fail("damaged","roll");
    var pixelsPerFrame=128*meta.roll.res*112*meta.roll.res;
    pixelBytes=meta.roll.frames.length*pixelsPerFrame/4;
    if(binStart+pixelBytes>d.length-4) throw fail("damaged","pixels");
    var pixelStart=binStart;
    for(var k=0;k<meta.roll.frames.length;k++){
      if(!meta.roll.frames[k] || typeof meta.roll.frames[k]!=="object") throw fail("damaged","roll");
      meta.roll.frames[k].px=unpackPixels(d,pixelStart,pixelsPerFrame);
      pixelStart+=pixelsPerFrame/4;
    }
  }
  if(!meta || !checkRoll(meta.roll) || !Array.isArray(meta.latent) || meta.latent.length!==meta.roll.frames.length) throw fail("damaged","roll");
  var jpegStart=binStart+pixelBytes, binLen=d.length-4-jpegStart;
  var jpegs=meta.latent.map(function(L){
    if(L===null) return null;
    if(!Array.isArray(L) || !int(L[0],0,binLen) || !int(L[1],4,binLen) || L[0]+L[1]>binLen) throw fail("damaged","latent offsets");
    var j=d.slice(jpegStart+L[0],jpegStart+L[0]+L[1]);
    if(j[0]!==0xFF || j[1]!==0xD8) throw fail("damaged","not a JPEG");
    return j;
  });
  return {roll:meta.roll, jpegs:jpegs};
}

window.LopdaNegative={MAGIC:MAGIC, VERSION:VERSION, CHUNK:CHUNK, crc32:crc32, pack:pack, unpack:unpack, checkRoll:checkRoll};
})();
