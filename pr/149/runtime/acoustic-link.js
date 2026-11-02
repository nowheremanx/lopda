/*
 * Lo-PDA: the acoustic link's frame, version 2. Pure functions only: no audio, no DOM.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * Frame, big-endian:
 *   version(1)=2 type(1) session(2) seq(2) ack(2) length(1) payload(length<=60) crc16(2)
 * The type's low 4 bits name the frame; 0x80 says more fragments follow. The other
 * type bits are reserved and must be zero, so a garbled type cannot pass as a frame.
 * The ack field rides on every frame: it is the last complete sequence number heard
 * from the other side, which saves a whole burst per message on a slow link.
 * HELLO's payload carries the link protocol, the app's FNV-1a port and its protocol
 * string so two phones can refuse to pair when they are running different programs.
 * CRC-16/CCITT-FALSE over every byte before the CRC (init 0xFFFF, poly 0x1021, no reflection).
 * The 4-FSK preamble/sync and the symbol mapping live in runtime/acoustic.js.
 */
(function(root, factory){
  var api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  root.LopdaAcousticLink=api;
})(typeof window!=="undefined" ? window : (typeof globalThis!=="undefined" ? globalThis : this), function(){
"use strict";

var VERSION=2, HEADER=9, MAX_PAYLOAD=60, MORE=0x80;
var TYPES={HELLO:1, HELLO_ACK:2, DATA:3, ACK:4, BYE:5, PING:6};
var NAMES={1:"HELLO",2:"HELLO_ACK",3:"DATA",4:"ACK",5:"BYE",6:"PING"};

function crc16(bytes, start, end){
  var crc=0xFFFF, i, j, b;
  if(start==null) start=0;
  if(end==null) end=bytes.length;
  for(i=start;i<end;i++){
    b=bytes[i]&255;
    crc^=(b<<8);
    for(j=0;j<8;j++) crc=((crc&0x8000)?((crc<<1)^0x1021):(crc<<1))&0xFFFF;
  }
  return crc;
}

function frameLength(payloadLength){ return HEADER+payloadLength+2; }

/* A type argument may carry MORE too; the separate flag is the readable form. */
function encode(type, session, seq, ack, payload, more){
  type=type&255;
  if((type&0x70) || !NAMES[type&0x0F]) throw new Error("unknown frame type");
  if((more || (type&MORE)) && (type&0x0F)!==TYPES.DATA) throw new Error("MORE is only for DATA");
  payload=payload||[];
  if(payload.length>MAX_PAYLOAD) throw new Error("payload too long");
  session=session&0xFFFF; seq=seq&0xFFFF; ack=(ack||0)&0xFFFF;
  var wire=(type&0x0F)|((more || (type&MORE))?MORE:0);
  var out=[VERSION, wire, (session>>8)&255, session&255, (seq>>8)&255, seq&255,
    (ack>>8)&255, ack&255, payload.length&255];
  var i;
  for(i=0;i<payload.length;i++) out.push(payload[i]&255);
  var c=crc16(out,0,out.length);
  out.push((c>>8)&255, c&255);
  return out;
}

function header(bytes){
  if(!bytes || bytes.length<HEADER) return null;
  var version=bytes[0]&255, raw=bytes[1]&255, type=raw&0x0F;
  if(version!==VERSION || (raw&0x70) || !NAMES[type]) return null;
  if((raw&MORE) && type!==TYPES.DATA) return null;
  var session=((bytes[2]&255)<<8)|(bytes[3]&255);
  var seq=((bytes[4]&255)<<8)|(bytes[5]&255);
  var ack=((bytes[6]&255)<<8)|(bytes[7]&255);
  var length=bytes[8]&255;
  if(length>MAX_PAYLOAD) return null;
  return {version:version, type:type, typeName:NAMES[type], more:!!(raw&MORE),
    session:session, seq:seq, ack:ack, length:length};
}

function parse(bytes){
  var h=header(bytes);
  if(!h) return {ok:false, reason:"header"};
  var total=frameLength(h.length);
  if(bytes.length!==total) return {ok:false, reason:"length", header:h};
  var want=crc16(bytes,0,total-2);
  var got=((bytes[total-2]&255)<<8)|(bytes[total-1]&255);
  if(want!==got) return {ok:false, reason:"crc", header:h, crc:{want:want, got:got}};
  var payload=[], i;
  for(i=HEADER;i<HEADER+h.length;i++) payload.push(bytes[i]&255);
  return {ok:true, frame:{type:h.type, typeName:h.typeName, more:h.more, session:h.session,
    seq:h.seq, ack:h.ack, payload:payload}, header:h};
}

function typeName(type){ return NAMES[type&0x0F]||"?"; }

/* HELLO payload: link protocol 1, port, nonce, app protocol string. */
function hello(opts){
  opts=opts||{};
  var proto=opts.proto==null?"":String(opts.proto), i, c;
  if(proto.length>16) throw new Error("proto too long");
  for(i=0;i<proto.length;i++){
    c=proto.charCodeAt(i);
    if(c>0x7F) throw new Error("proto must be ASCII");
  }
  var port=(opts.port||0)>>>0, nonce=(opts.nonce||0)&0xFFFF;
  var out=[1, (port>>>24)&255, (port>>>16)&255, (port>>>8)&255, port&255,
    (nonce>>8)&255, nonce&255];
  for(i=0;i<proto.length;i++) out.push(proto.charCodeAt(i));
  return out;
}

function parseHello(payload){
  if(!payload || payload.length<7 || payload.length>23) return null;
  if((payload[0]&255)!==1) return null;
  var i, c, proto="";
  for(i=7;i<payload.length;i++){
    c=payload[i]&255;
    if(c>0x7F) return null;
    proto+=String.fromCharCode(c);
  }
  var port=(((payload[1]&255)<<24)|((payload[2]&255)<<16)|((payload[3]&255)<<8)|(payload[4]&255))>>>0;
  var nonce=((payload[5]&255)<<8)|(payload[6]&255);
  return {linkProto:payload[0]&255, port:port, nonce:nonce, proto:proto};
}

/* UTF-8 by hand: acoustic-link.js also runs in the vm, which has no TextEncoder. */
function utf8(s){
  var out=[], i, c, cp;
  for(i=0;i<s.length;i++){
    c=s.charCodeAt(i);
    if(c<0x80) out.push(c);
    else if(c<0x800) out.push(0xC0|(c>>6), 0x80|(c&63));
    else if(c>=0xD800 && c<=0xDBFF && i+1<s.length){
      cp=0x10000+((c-0xD800)<<10)+(s.charCodeAt(++i)-0xDC00);
      out.push(0xF0|(cp>>18), 0x80|((cp>>12)&63), 0x80|((cp>>6)&63), 0x80|(cp&63));
    }else out.push(0xE0|(c>>12), 0x80|((c>>6)&63), 0x80|(c&63));
  }
  return out;
}

/* FNV-1a 32 over the app id's UTF-8 bytes; the port is the app's short name on air. */
function port(appId){
  var b=utf8(appId==null?"":String(appId)), h=0x811C9DC5, i;
  for(i=0;i<b.length;i++){ h^=b[i]; h=Math.imul(h, 0x01000193)>>>0; }
  return h>>>0;
}

return {
  version:"v2",
  VERSION:VERSION,
  HEADER:HEADER,
  MAX_PAYLOAD:MAX_PAYLOAD,
  TYPES:TYPES,
  MORE:MORE,
  crc16:crc16,
  frameLength:frameLength,
  encode:encode,
  header:header,
  parse:parse,
  typeName:typeName,
  hello:hello,
  parseHello:parseHello,
  port:port
};
});
