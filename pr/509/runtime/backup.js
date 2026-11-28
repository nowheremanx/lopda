/*
 * Lo-PDA runtime: the whole-device backup file (Settings → 备份 / 恢复). Pure functions, no DOM, no storage: the caller
 * dumps and loads the databases (LopdaPlatform.dumpAll / replaceAll) and saves or picks the file.
 *
 * lopda-backup-YYYYMMDD.zip, stored entries (zip.js):
 *   manifest.json  {format: 1, runtime, created (ISO), docs: n, files: [{key, type, mime?, name?, size, crc32}]}
 *   docs.json      [{path, data}], every document of the document store
 *   files/<i>      the bytes of manifest.files[i]
 * A file's type says how its bytes become the stored value again: "blob" (a Blob, or a File when it had a name),
 * "ArrayBuffer" or a typed array's name (the raw bytes), "json" (a structured value as JSON with markers, below).
 *
 * Markers: what JSON cannot carry inside a value becomes an object whose only key that matters is "$lp":
 * {"$lp": "blob", type, name?, b64}, {"$lp": "Uint32Array" (any typed array, "DataView", "ArrayBuffer"), b64},
 * {"$lp": "date", v}, {"$lp": "num", v: "NaN" | "Infinity" | "-Infinity" | "-0"}, {"$lp": "undef"}. An object of the
 * data's own whose key is "$lp", "$lp$", ... gets one more "$" on the way out and loses it on the way in.
 * Documents are JSON already (platform.js stores JSON copies), so docs.json holds no markers in practice.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var FORMAT=1, ROOT="data/users/local/";
var VIEWS=["Int8Array","Uint8Array","Uint8ClampedArray","Int16Array","Uint16Array","Int32Array","Uint32Array","Float32Array","Float64Array","BigInt64Array","BigUint64Array"];
var hasOwn=Object.prototype.hasOwnProperty;

function fail(code,msg){ var e=new Error(msg||code); e.code=code; return e; }
function tag(v){ return Object.prototype.toString.call(v).slice(8,-1); }
function isBlob(v){ var t=tag(v); return t==="Blob" || t==="File"; }
function viewName(v){ var t=tag(v); return t==="DataView" || VIEWS.indexOf(t)>=0 ? t : null; }

function utf8(s){ return new TextEncoder().encode(s); }
function unutf8(b){ return new TextDecoder("utf-8",{fatal:true}).decode(b); }

var B64="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", B64I=null;
function b64(u8){
  var out=[], s="", i;
  for(i=0;i+2<u8.length;i+=3){
    var n=(u8[i]<<16)|(u8[i+1]<<8)|u8[i+2];
    s+=B64[n>>18]+B64[(n>>12)&63]+B64[(n>>6)&63]+B64[n&63];
    if(s.length>=8192){ out.push(s); s=""; }
  }
  if(i<u8.length){
    var m=u8[i]<<16 | (i+1<u8.length ? u8[i+1]<<8 : 0);
    s+=B64[m>>18]+B64[(m>>12)&63]+(i+1<u8.length ? B64[(m>>6)&63] : "=")+"=";
  }
  out.push(s);
  return out.join("");
}
function unb64(s){
  if(typeof s!=="string" || s.length%4) throw fail("corrupt","bad base64");
  if(!B64I){ B64I={}; for(var k=0;k<64;k++) B64I[B64[k]]=k; }
  var pad=s.slice(-2)==="==" ? 2 : s.slice(-1)==="=" ? 1 : 0, out=new Uint8Array(s.length/4*3-pad), o=0;
  for(var i=0;i<s.length;i+=4){
    var a=B64I[s[i]], b=B64I[s[i+1]], c=s[i+2]==="=" ? 0 : B64I[s[i+2]], d=s[i+3]==="=" ? 0 : B64I[s[i+3]];
    if(a==null || b==null || c==null || d==null) throw fail("corrupt","bad base64");
    var n=(a<<18)|(b<<12)|(c<<6)|d;
    out[o++]=n>>16; if(o<out.length) out[o++]=(n>>8)&255; if(o<out.length) out[o++]=n&255;
  }
  return out;
}
/* the bytes a view or an ArrayBuffer covers, as a Uint8Array over the same memory */
function bytesOfView(v){ return tag(v)==="ArrayBuffer" ? new Uint8Array(v) : new Uint8Array(v.buffer,v.byteOffset,v.byteLength); }
function blobBytes(b){ return b.arrayBuffer().then(function(ab){ return new Uint8Array(ab); }); }

/* ---------- values to JSON and back ---------- */
function escKey(k){ return /^\$lp\$*$/.test(k) ? k+"$" : k; }
/* every Blob inside v, in the order toTree meets them; throws on a cycle */
function blobsIn(v,list,path){
  if(v===null || typeof v!=="object") return list;
  if(isBlob(v)){ list.push(v); return list; }
  if(viewName(v) || tag(v)==="ArrayBuffer" || tag(v)==="Date") return list;
  if(path.indexOf(v)>=0) throw fail("unsupported","a value refers to itself");
  path.push(v);
  if(Array.isArray(v)) for(var i=0;i<v.length;i++) blobsIn(v[i],list,path);
  else for(var k in v) if(hasOwn.call(v,k)) blobsIn(v[k],list,path);
  path.pop();
  return list;
}
function toTree(v,blobs){
  if(v===undefined) return {"$lp":"undef"};
  if(v===null || typeof v==="string" || typeof v==="boolean") return v;
  if(typeof v==="number"){
    if(v!==v || v===Infinity || v===-Infinity) return {"$lp":"num", v:String(v)};
    if(v===0 && 1/v<0) return {"$lp":"num", v:"-0"};
    return v;
  }
  if(typeof v!=="object") throw fail("unsupported","cannot store a "+typeof v);
  var t=tag(v), vn=viewName(v);
  if(isBlob(v)){
    var b=blobs.shift(), o={"$lp":"blob", type:v.type||"", b64:b64(b)};
    if(t==="File" && typeof v.name==="string") o.name=v.name;
    return o;
  }
  if(vn || t==="ArrayBuffer") return {"$lp":vn||t, b64:b64(bytesOfView(v))};
  if(t==="Date") return {"$lp":"date", v:v.getTime()};
  if(Array.isArray(v)){ var a=[]; for(var i=0;i<v.length;i++) a.push(toTree(v[i],blobs)); return a; }
  if(t!=="Object") throw fail("unsupported","cannot store a "+t);
  /* no prototype: a key "__proto__" stays a plain key */
  var out=Object.create(null);
  for(var k in v) if(hasOwn.call(v,k)) out[escKey(k)]=toTree(v[k],blobs);
  return out;
}
/* v -> Promise of the JSON text */
function encodeJSON(v){
  var list=blobsIn(v,[],[]);
  return Promise.all(list.map(blobBytes)).then(function(bytes){ return JSON.stringify(toTree(v,bytes)); });
}
function makeView(name,u8){
  var C=window[name];
  if(name==="ArrayBuffer") return u8.slice().buffer;
  if(typeof C!=="function" || (name!=="DataView" && VIEWS.indexOf(name)<0)) throw fail("corrupt","unknown type "+name);
  var buf=u8.slice().buffer;
  if(name==="DataView") return new DataView(buf);
  if(buf.byteLength%C.BYTES_PER_ELEMENT) throw fail("corrupt","bad length for "+name);
  return new C(buf);
}
function makeBlob(u8,type,name){
  if(typeof name==="string"){ try{ return new File([u8],name,{type:type||""}); }catch(e){} }
  return new Blob([u8],{type:type||""});
}
var UNDEF={};
function fromMarker(m){
  var k=m["$lp"];
  if(k==="undef") return UNDEF;
  if(k==="num"){ var n={"NaN":NaN, "Infinity":Infinity, "-Infinity":-Infinity, "-0":-0}[m.v]; if(n===undefined) throw fail("corrupt","bad number"); return n; }
  if(k==="date"){ if(typeof m.v!=="number") throw fail("corrupt","bad date"); return new Date(m.v); }
  if(k==="blob") return makeBlob(unb64(m.b64),m.type,m.name);
  if(k==="ArrayBuffer" || k==="DataView" || VIEWS.indexOf(k)>=0) return makeView(k,unb64(m.b64));
  throw fail("corrupt","unknown marker "+k);
}
function dropUndef(v){
  if(v===null || typeof v!=="object" || isBlob(v) || viewName(v) || tag(v)==="ArrayBuffer" || tag(v)==="Date") return v;
  if(Array.isArray(v)){ for(var i=0;i<v.length;i++) v[i]=v[i]===UNDEF ? undefined : dropUndef(v[i]); }
  else for(var k in v) if(hasOwn.call(v,k)) v[k]=v[k]===UNDEF ? undefined : dropUndef(v[k]);
  return v;
}
/* JSON text -> the value; throws a "corrupt" error */
function decodeJSON(text){
  var undef=false, v;
  try{
    v=JSON.parse(text,function(key,x){
      if(x===null || typeof x!=="object" || Array.isArray(x)) return x;
      if(hasOwn.call(x,"$lp")){ var r=fromMarker(x); if(r===UNDEF) undef=true; return r; }
      var esc=Object.keys(x).some(function(k){ return /^\$lp\$+$/.test(k); });
      if(!esc) return x;
      var o={};
      Object.keys(x).forEach(function(k){ Object.defineProperty(o,/^\$lp\$+$/.test(k) ? k.slice(0,-1) : k,{value:x[k], enumerable:true, writable:true, configurable:true}); });
      return o;
    });
  }catch(e){ throw e && e.code==="corrupt" ? e : fail("corrupt","bad JSON"); }
  if(undef) v=v===UNDEF ? undefined : dropUndef(v);
  return v;
}

/* a stored value -> Promise of {type, mime?, name?, bytes} */
function encodeFile(v){
  if(isBlob(v)) return blobBytes(v).then(function(b){
    var o={type:"blob", mime:v.type||"", bytes:b};
    if(tag(v)==="File" && typeof v.name==="string") o.name=v.name;
    return o;
  });
  var vn=viewName(v)||(tag(v)==="ArrayBuffer" ? "ArrayBuffer" : null);
  if(vn) return Promise.resolve({type:vn, bytes:bytesOfView(v).slice()});
  return encodeJSON(v).then(function(s){ return {type:"json", bytes:utf8(s)}; });
}
function decodeFile(m,bytes){
  if(m.type==="blob") return makeBlob(bytes,m.mime,m.name);
  if(m.type==="json"){ var s; try{ s=unutf8(bytes); }catch(e){ throw fail("corrupt","bad text"); } return decodeJSON(s); }
  return makeView(m.type,bytes);
}

/* ---------- the zip ---------- */
function crcOf(crc32){
  var f=crc32 || (typeof window!=="undefined" && window.LopdaNegative && window.LopdaNegative.crc32);
  if(typeof f!=="function") throw new Error("backup: no crc32");
  return f;
}
function zipOf(z){ var Z=z || (typeof window!=="undefined" && window.LopdaZip); if(!Z) throw new Error("backup: no zip"); return Z; }
function pad2(n){ return (n<10?"0":"")+n; }
function fileName(now){ var d=new Date(now==null?Date.now():now); return "lopda-backup-"+d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate())+".zip"; }
/* a document path the backup may carry: under data/users/local, an even number of non-empty segments */
function goodPath(p){
  if(typeof p!=="string" || p.indexOf(ROOT)!==0) return false;
  var seg=p.split("/");
  return seg.length%2===0 && seg.every(function(s){ return s.length>0; });
}
function entrySize(name,len){ return 30+46+2*utf8(name).length+len; }

/* dump {docs, files: [{key, value}]} -> Promise of {manifest, entries, size}; entries go to LopdaZip.writeParts.
   opts: {runtime, now, crc32}. size is the zip's exact length */
function pack(dump,opts){
  opts=opts||{};
  var crc=crcOf(opts.crc32), now=opts.now==null ? Date.now() : opts.now;
  var docs=dump.docs||[], files=dump.files||[];
  var docsJSON=Promise.resolve().then(function(){
    return Promise.all(docs.map(function(d){
      if(!goodPath(d.path)) throw fail("unsupported","document outside "+ROOT+": "+d.path);
      return encodeJSON(d.data).then(function(s){ return '{"path":'+JSON.stringify(d.path)+',"data":'+s+"}"; });
    }));
  }).then(function(list){ return "["+list.join(",\n")+"]"; });
  var enc=files.reduce(function(p,f){
    return p.then(function(acc){
      if(typeof f.key!=="string") throw fail("unsupported","file key is not text");
      return encodeFile(f.value).then(function(e){ e.key=f.key; acc.push(e); return acc; });
    });
  },Promise.resolve([]));
  return Promise.all([docsJSON,enc]).then(function(r){
    var list=r[1], entries=[], size=22;
    var manifest={format:FORMAT, runtime:opts.runtime||"", created:new Date(now).toISOString(), docs:docs.length, files:[]};
    var fileEntries=list.map(function(e,i){
      var m={key:e.key, type:e.type};
      if(e.mime!=null) m.mime=e.mime;
      if(e.name!=null) m.name=e.name;
      m.size=e.bytes.length; m.crc32=crc(e.bytes,0,e.bytes.length);
      manifest.files.push(m);
      return {name:"files/"+i, data:e.bytes, crc:m.crc32, time:now};
    });
    entries.push({name:"manifest.json", data:utf8(JSON.stringify(manifest,null,1)), time:now});
    entries.push({name:"docs.json", data:utf8(r[0]), time:now});
    entries=entries.concat(fileEntries);
    entries.forEach(function(en){ size+=entrySize(en.name,en.data.length); });
    /* no ZIP64 in zip.js: every offset must fit 32 bits */
    if(size>0xFFFFFFFF || entries.length>65535) throw fail("toolarge","backup too large");
    return {manifest:manifest, entries:entries, size:size};
  });
}

/* the backup's bytes -> Promise of {manifest, docs: [{path, data}], files: [{key, value}]}, with every check done first.
   Rejects with code "newer" (a format this runtime does not know) or "corrupt" (anything else). opts: {crc32, zip, inflate} */
function unpack(u8,opts){
  opts=opts||{};
  var crc=crcOf(opts.crc32), Z=zipOf(opts.zip), byName={};
  return Promise.resolve().then(function(){
    var list;
    try{ list=Z.list(u8); }catch(e){ throw fail("corrupt",e.message); }
    list.forEach(function(en){ if(!en.dir) byName[en.name]=en; });
    if(!byName["manifest.json"] || !byName["docs.json"]) throw fail("corrupt","manifest.json or docs.json missing");
    return readText("manifest.json");
  }).then(function(text){
    var m=parse(text);
    if(!m || typeof m!=="object" || typeof m.format!=="number" || m.format!==Math.floor(m.format) || m.format<1) throw fail("corrupt","bad manifest");
    if(m.format>FORMAT) throw fail("newer","format "+m.format);
    if(!Array.isArray(m.files) || typeof m.docs!=="number") throw fail("corrupt","bad manifest");
    var keys={};
    m.files.forEach(function(f,i){
      if(!f || typeof f.key!=="string" || hasOwn.call(keys,"k"+f.key) || typeof f.type!=="string" || typeof f.size!=="number" || typeof f.crc32!=="number")
        throw fail("corrupt","bad manifest entry "+i);
      if(!byName["files/"+i]) throw fail("corrupt","files/"+i+" missing");
      keys["k"+f.key]=1;
    });
    return readText("docs.json").then(function(text){
      var docs;
      try{ docs=decodeJSON(text); }catch(e){ throw fail("corrupt","docs.json: "+e.message); }
      if(!Array.isArray(docs) || docs.length!==m.docs) throw fail("corrupt","docs.json does not match the manifest");
      var seen={};
      docs.forEach(function(d){
        if(!d || typeof d!=="object" || !goodPath(d.path) || hasOwn.call(seen,"p"+d.path)) throw fail("corrupt","bad document path "+(d&&d.path));
        seen["p"+d.path]=1;
      });
      /* one file at a time: the bytes are views into u8, the values copies */
      var files=[];
      return m.files.reduce(function(p,f,i){
        return p.then(function(){ return read("files/"+i); }).then(function(bytes){
          if(bytes.length!==f.size || crc(bytes,0,bytes.length)!==f.crc32>>>0) throw fail("corrupt","files/"+i+" does not match the manifest");
          var v;
          try{ v=decodeFile(f,bytes); }catch(e){ throw e && e.code==="corrupt" ? e : fail("corrupt","files/"+i+": "+((e&&e.message)||e)); }
          files.push({key:f.key, value:v});
        });
      },Promise.resolve()).then(function(){
        return {manifest:m, docs:docs.map(function(d){ return {path:d.path, data:d.data}; }), files:files};
      });
    });
  });
  function read(name){
    return Z.read(u8,byName[name],opts.inflate,crc).then(null,function(e){ throw e && e.code==="corrupt" ? e : fail("corrupt",(e&&e.message)||name); });
  }
  function readText(name){ return read(name).then(function(b){ try{ return unutf8(b); }catch(e){ throw fail("corrupt","bad text in "+name); } }); }
  function parse(text){ try{ return JSON.parse(text); }catch(e){ throw fail("corrupt","bad JSON"); } }
}

window.LopdaBackup={FORMAT:FORMAT, ROOT:ROOT, pack:pack, unpack:unpack, fileName:fileName, goodPath:goodPath,
  encodeFile:encodeFile, decodeFile:decodeFile, encodeJSON:encodeJSON, decodeJSON:decodeJSON};
})();
