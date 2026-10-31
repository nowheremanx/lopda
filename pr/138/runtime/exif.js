/*
 * Lo-PDA: EXIF for a single print. The darkroom's 单张 leaves as a JPEG; this writes one APP1 "Exif" segment just
 * after SOI (dropping an Exif segment the encoder wrote) so a photo library sorts it by the day it was shot.
 * When the darkroom passes a place, a GPS IFD follows the Exif IFD: version, the latitude/longitude refs and
 * degrees-minutes-seconds, and the horizontal error. Pure functions on bytes, no DOM: the darkroom
 * (apps/darkroom.js) calls insert, tests/exif.test.mjs runs this in node:vm. Big-endian ("MM") TIFF, IFD0, the
 * Exif IFD and the GPS IFD; the IFD writer is generic. decisions.md sections 38 and 40,
 * docs/design/darkroom.md section 6.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var TYPE_BYTE=1, TYPE_ASCII=2, TYPE_LONG=4, TYPE_RATIONAL=5, TYPE_UNDEFINED=7;
var TAG_MAKE=0x010F, TAG_MODEL=0x0110, TAG_SOFTWARE=0x0131, TAG_DATETIME=0x0132, TAG_EXIF_IFD=0x8769, TAG_GPS_IFD=0x8825;
var TAG_EXIF_VERSION=0x9000, TAG_DATETIME_ORIGINAL=0x9003, TAG_DATETIME_DIGITIZED=0x9004;
var TAG_OFFSET_TIME=0x9010, TAG_OFFSET_TIME_ORIGINAL=0x9011, TAG_OFFSET_TIME_DIGITIZED=0x9012;
var GPS_VERSION=0x0000, GPS_LAT_REF=0x0001, GPS_LAT=0x0002, GPS_LON_REF=0x0003, GPS_LON=0x0004, GPS_ACC=0x001F;

function fail(msg){ var e=new Error(msg); e.code="badjpeg"; return e; }
function be16(u8,o){ return (u8[o]<<8)|u8[o+1]; }
function be32(u8,o){ return ((u8[o]<<24)>>>0)+(u8[o+1]<<16)+(u8[o+2]<<8)+u8[o+3]; }
function put16(u8,o,v){ u8[o]=(v>>>8)&255; u8[o+1]=v&255; }
function put32(u8,o,v){ u8[o]=(v>>>24)&255; u8[o+1]=(v>>>16)&255; u8[o+2]=(v>>>8)&255; u8[o+3]=v&255; }
function pad2(n){ return (n<10?"0":"")+n; }

/* ASCII values in EXIF are null-terminated, count included (EXIF 2.32, 4.6.2) */
function ascii(s){
  var out=new Uint8Array(s.length+1);
  for(var i=0;i<s.length;i++) out[i]=s.charCodeAt(i)&255;
  return out;
}
/* the local wall clock at taken + tz, "YYYY:MM:DD HH:MM:SS" */
function wall(taken,tz){
  var d=new Date(taken+tz*60000);
  return d.getUTCFullYear()+":"+pad2(d.getUTCMonth()+1)+":"+pad2(d.getUTCDate())+" "+
    pad2(d.getUTCHours())+":"+pad2(d.getUTCMinutes())+":"+pad2(d.getUTCSeconds());
}
/* tz is minutes east of UTC, so +480 is "+08:00" */
function offsetText(tz){
  var sign=tz<0?"-":"+", m=Math.abs(tz);
  return sign+pad2(Math.floor(m/60))+":"+pad2(m%60);
}

/* One IFD at byte `at` of the TIFF block, its values over 4 bytes after it; `next` is the next IFD offset (0 = end).
   entry.value is a byte array or a number (LONG/SHORT written inline). */
function entry(tag,type,count,value){ return {tag:tag, type:type, count:count, value:value}; }
/* TIFF 6.0 wants every out-of-line value on an even offset: pad each one to an even length */
function padded(n){ return (n+1)&~1; }
function buildIfd(entries,at,next){
  var head=2+entries.length*12+4, tail=0, i, v;
  for(i=0;i<entries.length;i++){
    v=entries[i].value;
    if(typeof v!=="number" && v.length>4) tail+=padded(v.length);
  }
  var out=new Uint8Array(head+tail), dataAt=at+head;
  put16(out,0,entries.length);
  for(i=0;i<entries.length;i++){
    var e=entries[i], o=2+i*12;
    put16(out,o,e.tag); put16(out,o+2,e.type); put32(out,o+4,e.count);
    if(typeof e.value==="number") put32(out,o+8,e.value);
    else if(e.value.length<=4) out.set(e.value,o+8);
    else { put32(out,o+8,dataAt); out.set(e.value,dataAt-at); dataAt+=padded(e.value.length); }
  }
  put32(out,2+entries.length*12,next);
  return out;
}

/* a RATIONAL is two big-endian u32: numerator, denominator */
function rational(num,den){
  var u=new Uint8Array(8);
  put32(u,0,num); put32(u,4,den);
  return u;
}
/* |degrees| as degrees/1, minutes/1, seconds/10000; carry when rounding reaches 60 seconds or minutes.
   /10000 keeps finer than the six decimals the sealed place keeps. */
function dmsValue(v){
  var a=Math.abs(v), d=Math.floor(a), mf=(a-d)*60, m=Math.floor(mf), sec=Math.round((mf-m)*60*10000);
  if(sec>=600000){ sec-=600000; m+=1; }
  if(m>=60){ m-=60; d+=1; }
  var u=new Uint8Array(24);
  put32(u,0,d); put32(u,4,1);
  put32(u,8,m); put32(u,12,1);
  put32(u,16,sec); put32(u,20,10000);
  return u;
}
/* only a real place gets a GPS IFD; undefined, null or out of range leaves the bytes exactly as before */
function gpsInfo(info){
  var g=info && info.gps;
  if(!g || typeof g!=="object") return null;
  if(typeof g.lat!=="number" || !isFinite(g.lat) || g.lat<-90 || g.lat>90) return null;
  if(typeof g.lon!=="number" || !isFinite(g.lon) || g.lon<-180 || g.lon>180) return null;
  var acc=typeof g.acc==="number" && isFinite(g.acc) && g.acc>=0 ? g.acc : undefined;
  return {lat:g.lat, lon:g.lon, acc:acc};
}

/* the whole APP1 segment: FF E1, length, "Exif\0\0", TIFF */
function exifSegment(taken,tz,software,gps){
  var time=wall(taken,tz), offset=offsetText(tz);
  var make=ascii("Lo-PDA"), model=ascii("Lo-PDA"), soft=ascii(software), dt=ascii(time), off=ascii(offset);
  /* build IFD0 once with a placeholder to learn its padded length, then with the real Exif IFD offset:
     a tag added later cannot move the pointer by hand */
  function ifd0Entries(exifAt,gpsAt){
    var list=[
      entry(TAG_MAKE,TYPE_ASCII,make.length,make),
      entry(TAG_MODEL,TYPE_ASCII,model.length,model),
      entry(TAG_SOFTWARE,TYPE_ASCII,soft.length,soft),
      entry(TAG_DATETIME,TYPE_ASCII,dt.length,dt),
      entry(TAG_EXIF_IFD,TYPE_LONG,1,exifAt)
    ];
    if(gpsAt!==undefined) list.push(entry(TAG_GPS_IFD,TYPE_LONG,1,gpsAt));
    return list;
  }
  function exifIfd(at){
    return buildIfd([
      entry(TAG_EXIF_VERSION,TYPE_UNDEFINED,4,new Uint8Array([0x30,0x32,0x33,0x32])),
      entry(TAG_DATETIME_ORIGINAL,TYPE_ASCII,dt.length,dt),
      entry(TAG_DATETIME_DIGITIZED,TYPE_ASCII,dt.length,dt),
      entry(TAG_OFFSET_TIME,TYPE_ASCII,off.length,off),
      entry(TAG_OFFSET_TIME_ORIGINAL,TYPE_ASCII,off.length,off),
      entry(TAG_OFFSET_TIME_DIGITIZED,TYPE_ASCII,off.length,off)
    ],at,0);
  }
  function gpsIfd(at){
    var latRef=ascii(gps.lat<0?"S":"N"), lonRef=ascii(gps.lon<0?"W":"E");
    var list=[
      entry(GPS_VERSION,TYPE_BYTE,4,new Uint8Array([2,3,0,0])),
      entry(GPS_LAT_REF,TYPE_ASCII,latRef.length,latRef),
      entry(GPS_LAT,TYPE_RATIONAL,3,dmsValue(gps.lat)),
      entry(GPS_LON_REF,TYPE_ASCII,lonRef.length,lonRef),
      entry(GPS_LON,TYPE_RATIONAL,3,dmsValue(gps.lon))
    ];
    if(gps.acc!==undefined) list.push(entry(GPS_ACC,TYPE_RATIONAL,1,rational(Math.round(gps.acc),1)));
    return buildIfd(list,at,0);
  }
  var ifd0, exifAt, exif, gpsAt, gpsBlock=null;
  if(gps){
    ifd0=buildIfd(ifd0Entries(0,0),8,0);
    exifAt=8+ifd0.length;
    exif=exifIfd(exifAt);
    gpsAt=exifAt+exif.length;
    gpsBlock=gpsIfd(gpsAt);
    ifd0=buildIfd(ifd0Entries(exifAt,gpsAt),8,0);
  }else{
    ifd0=buildIfd(ifd0Entries(0),8,0);
    exifAt=8+ifd0.length;
    ifd0=buildIfd(ifd0Entries(exifAt),8,0);
    exif=exifIfd(exifAt);
  }
  var tiff=new Uint8Array(8+ifd0.length+exif.length+(gpsBlock?gpsBlock.length:0));
  tiff[0]=0x4D; tiff[1]=0x4D; put16(tiff,2,42); put32(tiff,4,8);
  tiff.set(ifd0,8); tiff.set(exif,8+ifd0.length);
  if(gpsBlock) tiff.set(gpsBlock,8+ifd0.length+exif.length);
  var seg=new Uint8Array(10+tiff.length);
  seg[0]=0xFF; seg[1]=0xE1; put16(seg,2,8+tiff.length);
  seg[4]=0x45; seg[5]=0x78; seg[6]=0x69; seg[7]=0x66; seg[8]=0; seg[9]=0;   /* "Exif\0\0" */
  seg.set(tiff,10);
  return seg;
}

/* minutes east of UTC, an integer in -840..840; anything else is the device's offset at that instant */
function frameTz(info){
  var tz=info.tz;
  return typeof tz==="number" && isFinite(tz) && tz===Math.floor(tz) && tz>=-840 && tz<=840
    ? tz : -new Date(info.taken).getTimezoneOffset();
}

function isExif(u8,o){
  return o+10<=u8.length && u8[o+4]===0x45 && u8[o+5]===0x78 && u8[o+6]===0x69 && u8[o+7]===0x66 && u8[o+8]===0 && u8[o+9]===0;
}

/* The same JPEG with one Exif APP1 after SOI. Existing Exif APP1s are dropped, not duplicated; everything from SOS
   (the scan data) to EOI is copied untouched. */
function insert(jpeg,info){
  if(!info || typeof info.taken!=="number" || !isFinite(info.taken)) throw new Error("exif: no shooting time");
  var src=jpeg, len=src.length;
  if(len<4 || src[0]!==0xFF || src[1]!==0xD8) throw fail("not a JPEG");
  var tz=frameTz(info);
  var software=typeof info.software==="string" && info.software ? info.software : "Lo-PDA";
  var seg=exifSegment(info.taken,tz,software,gpsInfo(info));
  var chunks=[src.subarray(0,2),seg], total=2+seg.length, o=2;
  while(o+1<len){
    if(src[o]!==0xFF){ chunks.push(src.subarray(o)); total+=len-o; o=len; break; }
    var m=src[o+1];
    if(m===0xDA || m===0xD9){ chunks.push(src.subarray(o)); total+=len-o; o=len; break; }   /* SOS and the rest */
    if(m===0x01 || (m>=0xD0 && m<=0xD7)){ chunks.push(src.subarray(o,o+2)); total+=2; o+=2; continue; }
    if(o+4>len){ chunks.push(src.subarray(o)); total+=len-o; o=len; break; }
    var sl=be16(src,o+2);
    if(sl<2 || o+2+sl>len){ chunks.push(src.subarray(o)); total+=len-o; o=len; break; }
    var end=o+2+sl;
    if(!(m===0xE1 && isExif(src,o))){ chunks.push(src.subarray(o,end)); total+=end-o; }
    o=end;
  }
  if(o<len){ chunks.push(src.subarray(o)); total+=len-o; }
  var out=new Uint8Array(total), at=0;
  for(var i=0;i<chunks.length;i++){ out.set(chunks[i],at); at+=chunks[i].length; }
  return out;
}

/* the TIFF block of the first Exif APP1, or null */
function findExif(src){
  var len=src.length, o=2;
  while(o+1<len){
    if(src[o]!==0xFF) return null;
    var m=src[o+1];
    if(m===0xDA || m===0xD9) return null;
    if(m===0x01 || (m>=0xD0 && m<=0xD7)){ o+=2; continue; }
    if(o+4>len) return null;
    var sl=be16(src,o+2);
    if(sl<2 || o+2+sl>len) return null;
    if(m===0xE1 && isExif(src,o)) return src.subarray(o+10,o+2+sl);
    o+=2+sl;
  }
  return null;
}

/* Big-endian only: it reads the files insert wrote. ASCII tags come back as strings, BYTE as an array and
   RATIONAL as a number (count 1) or an array of numbers. */
function readIfd(t,at){
  if(at<0 || at+2>t.length) return null;
  var n=be16(t,at), map={}, i, j;
  if(at+2+n*12>t.length) return null;
  for(i=0;i<n;i++){
    var o=at+2+i*12, tag=be16(t,o), type=be16(t,o+2), count=be32(t,o+4);
    if(type===TYPE_ASCII){
      var start=count<=4 ? o+8 : be32(t,o+8);
      if(start+count>t.length) continue;
      var s="";
      for(j=0;j<count;j++){ var c=t[start+j]; if(c===0) break; s+=String.fromCharCode(c); }
      map[tag]=s;
    }else if(type===TYPE_BYTE){
      var startB=count<=4 ? o+8 : be32(t,o+8);
      if(startB+count>t.length) continue;
      var bytes=[];
      for(j=0;j<count;j++) bytes.push(t[startB+j]);
      map[tag]=bytes;
    }else if(type===TYPE_RATIONAL){
      var size=count*8, startR=size<=4 ? o+8 : be32(t,o+8);
      if(startR+size>t.length) continue;
      var vals=[];
      for(j=0;j<count;j++){
        var num=be32(t,startR+j*8), den=be32(t,startR+j*8+4);
        vals.push(den ? num/den : 0);
      }
      map[tag]=count===1 ? vals[0] : vals;
    }else if(type===TYPE_LONG && count===1){
      map[tag]=be32(t,o+8);
    }
  }
  return map;
}

function readGps(t,pointer){
  var g=readIfd(t,pointer);
  if(!g) return null;
  var lat=g[GPS_LAT], lon=g[GPS_LON];
  if(!lat || !lon || lat.length<3 || lon.length<3) return null;
  for(var i=0;i<3;i++) if(typeof lat[i]!=="number" || typeof lon[i]!=="number") return null;
  var latSign=g[GPS_LAT_REF]==="S" ? -1 : 1, lonSign=g[GPS_LON_REF]==="W" ? -1 : 1;
  var out={lat:latSign*(lat[0]+lat[1]/60+lat[2]/3600), lon:lonSign*(lon[0]+lon[1]/60+lon[2]/3600)};
  if(typeof g[GPS_ACC]==="number") out.acc=g[GPS_ACC];
  return out;
}

function read(jpeg){
  var t=findExif(jpeg);
  if(!t || t.length<8 || t[0]!==0x4D || t[1]!==0x4D) return null;
  var ifd0=readIfd(t,be32(t,4));
  if(!ifd0) return null;
  var exif=typeof ifd0[TAG_EXIF_IFD]==="number" ? readIfd(t,ifd0[TAG_EXIF_IFD]) : null;
  var out={make:ifd0[TAG_MAKE], model:ifd0[TAG_MODEL], software:ifd0[TAG_SOFTWARE],
    dateTimeOriginal:exif && exif[TAG_DATETIME_ORIGINAL], offsetTimeOriginal:exif && exif[TAG_OFFSET_TIME_ORIGINAL]};
  if(!out.dateTimeOriginal) return null;
  if(typeof ifd0[TAG_GPS_IFD]==="number"){
    var gps=readGps(t,ifd0[TAG_GPS_IFD]);
    if(gps) out.gps=gps;
  }
  return out;
}

window.LopdaExif={insert:insert, read:read};
})();
