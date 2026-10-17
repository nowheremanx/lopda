/*
 * Lo-PDA runtime: zip files for notes export and import, and the whole-device backup. Pure functions on Uint8Array, no DOM.
 * Writes the "stored" method only (notes are small text; no compressor to carry), names in UTF-8 with general purpose
 * flag bit 11 set. Reads a zip's central directory and its entries: stored ones here, deflated ones through an inflate
 * function the caller passes (DecompressionStream("deflate-raw") in the browser, zlib in the tests).
 * CRC-32 is negative.js's (LopdaNegative.crc32), passed in or found on window. No ZIP64, no encryption.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

function fail(msg){ var e=new Error(msg); e.code="badzip"; return e; }
function crcOf(crc32){
  var f=crc32 || (window.LopdaNegative && window.LopdaNegative.crc32);
  if(typeof f!=="function") throw new Error("zip: no crc32");
  return f;
}
function utf8(s){
  if(typeof TextEncoder!=="undefined") return new TextEncoder().encode(s);
  var b=unescape(encodeURIComponent(s)), u=new Uint8Array(b.length);
  for(var i=0;i<b.length;i++) u[i]=b.charCodeAt(i);
  return u;
}
/* MS-DOS time and date in local time, as zip tools show them; before 1980 there is no such date */
function dosTime(ts){
  var d=new Date(ts==null?Date.now():ts), y=d.getFullYear();
  if(y<1980) return {time:0, date:(1<<5)|1};
  return {time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1), date:((Math.min(y,2107)-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()};
}

/* entries: [{name, data (Uint8Array or string), time, crc}] -> the zip as a list of byte arrays, in order; new Blob(parts)
   makes a big zip (a whole-device backup) without one more copy of it in memory. A known crc saves computing it again */
function writeParts(entries,crc32){
  var crc=crcOf(crc32), parts=[], size=0, files=[];
  if(entries.length>65535) throw new Error("zip: too many files");
  entries.forEach(function(en){
    var name=utf8(en.name), data=typeof en.data==="string" ? utf8(en.data) : en.data, t=dosTime(en.time);
    var c=en.crc!=null ? en.crc>>>0 : crc(data,0,data.length);
    var h=new Uint8Array(30+name.length), v=new DataView(h.buffer);
    v.setUint32(0,0x04034b50,true); v.setUint16(4,20,true); v.setUint16(6,0x0800,true); v.setUint16(8,0,true);
    v.setUint16(10,t.time,true); v.setUint16(12,t.date,true); v.setUint32(14,c,true);
    v.setUint32(18,data.length,true); v.setUint32(22,data.length,true); v.setUint16(26,name.length,true); v.setUint16(28,0,true);
    h.set(name,30);
    files.push({name:name, crc:c, size:data.length, t:t, off:size});
    parts.push(h,data); size+=h.length+data.length;
  });
  var cdStart=size;
  files.forEach(function(f){
    var h=new Uint8Array(46+f.name.length), v=new DataView(h.buffer);
    v.setUint32(0,0x02014b50,true); v.setUint16(4,0x0314,true); v.setUint16(6,20,true); v.setUint16(8,0x0800,true); v.setUint16(10,0,true);
    v.setUint16(12,f.t.time,true); v.setUint16(14,f.t.date,true); v.setUint32(16,f.crc,true);
    v.setUint32(20,f.size,true); v.setUint32(24,f.size,true); v.setUint16(28,f.name.length,true);
    /* made by Unix (3), zip 2.0: with "MS-DOS" there, Debian's unzip reads the names as an OEM code page despite bit 11.
       Unix wants a mode in the external attributes: a plain file, rw-r--r--. Extra, comment, disk, internal attributes stay 0 */
    v.setUint32(38,0x81a40000,true);
    v.setUint32(42,f.off,true);
    h.set(f.name,46);
    parts.push(h); size+=h.length;
  });
  var end=new Uint8Array(22), ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true); ev.setUint16(8,files.length,true); ev.setUint16(10,files.length,true);
  ev.setUint32(12,size-cdStart,true); ev.setUint32(16,cdStart,true);
  parts.push(end);
  return parts;
}
/* entries: [{name, data (Uint8Array or string), time}] -> the zip as one Uint8Array */
function write(entries,crc32){
  var parts=writeParts(entries,crc32), size=0;
  parts.forEach(function(p){ size+=p.length; });
  var out=new Uint8Array(size), o=0;
  parts.forEach(function(p){ out.set(p,o); o+=p.length; });
  return out;
}

/* names: UTF-8 when flag bit 11 says so; without it, still UTF-8 when the bytes are valid UTF-8 (the Mac's Archive Utility
   writes UTF-8 and leaves the flag off), else one byte per character */
function decodeName(b,flagged){
  if(typeof TextDecoder!=="undefined"){
    try{ return new TextDecoder("utf-8",{fatal:!flagged}).decode(b); }catch(e){}
  }
  var s=""; for(var i=0;i<b.length;i++) s+=String.fromCharCode(b[i]);
  return s;
}
/* the central directory: [{name, dir, method, flags, crc, size, csize, offset}]; throws a badzip error on anything it cannot follow */
function list(u8){
  if(!u8 || !u8.buffer || u8.BYTES_PER_ELEMENT!==1) throw fail("zip: not bytes");
  var v=new DataView(u8.buffer,u8.byteOffset,u8.byteLength), n=u8.length, at=-1;
  for(var i=n-22;i>=0 && i>=n-22-65535;i--) if(v.getUint32(i,true)===0x06054b50){ at=i; break; }
  if(at<0) throw fail("zip: no end of central directory");
  var count=v.getUint16(at+10,true), cdSize=v.getUint32(at+12,true), cd=v.getUint32(at+16,true);
  if(count===0xffff || cd===0xffffffff) throw fail("zip: ZIP64 is not supported");
  if(cd+cdSize>at) throw fail("zip: central directory out of range");
  var out=[], p=cd;
  for(var k=0;k<count;k++){
    if(p+46>at || v.getUint32(p,true)!==0x02014b50) throw fail("zip: bad central directory entry");
    var flags=v.getUint16(p+8,true), nl=v.getUint16(p+28,true), xl=v.getUint16(p+30,true), cl=v.getUint16(p+32,true);
    if(p+46+nl>at) throw fail("zip: bad central directory entry");
    var name=decodeName(u8.subarray(p+46,p+46+nl),!!(flags&0x0800));
    out.push({name:name, dir:/\/$/.test(name), method:v.getUint16(p+10,true), flags:flags, crc:v.getUint32(p+16,true),
      csize:v.getUint32(p+20,true), size:v.getUint32(p+24,true), offset:v.getUint32(p+42,true)});
    p+=46+nl+xl+cl;
  }
  return out;
}
/* an entry's bytes (a Promise): stored, or deflated through inflate(Uint8Array) -> Uint8Array or a Promise of one.
   The size and CRC are checked */
function read(u8,entry,inflate,crc32){
  return new Promise(function(resolve){
    var v=new DataView(u8.buffer,u8.byteOffset,u8.byteLength), o=entry.offset;
    if(o+30>u8.length || v.getUint32(o,true)!==0x04034b50) throw fail("zip: bad local header");
    if(entry.flags&1) throw fail("zip: encrypted");
    var start=o+30+v.getUint16(o+26,true)+v.getUint16(o+28,true), end=start+entry.csize;
    if(end>u8.length) throw fail("zip: entry out of range");
    var raw=u8.subarray(start,end);
    if(entry.method===0) resolve(raw);
    else if(entry.method===8){
      if(typeof inflate!=="function"){ var e=new Error("zip: deflate needs an inflate function"); e.code="noinflate"; throw e; }
      resolve(inflate(raw));
    }
    else throw fail("zip: method "+entry.method+" is not supported");
  }).then(function(data){
    if(!(data instanceof Uint8Array)) data=new Uint8Array(data);
    if(data.length!==entry.size) throw fail("zip: wrong size for "+entry.name);
    var crc=crcOf(crc32);
    if(crc(data,0,data.length)!==entry.crc) throw fail("zip: CRC mismatch for "+entry.name);
    return data;
  },function(e){
    if(e && (e.code==="badzip" || e.code==="noinflate")) throw e;
    throw fail("zip: cannot inflate "+entry.name+": "+((e&&e.message)||e));
  });
}

window.LopdaZip={write:write, writeParts:writeParts, list:list, read:read, dosTime:dosTime};
})();
