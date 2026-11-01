/*
 * Lo-PDA: the acoustic link's frame, M3. Pure functions only: no audio, no DOM.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * Frame, big-endian:
 *   version(1) type(1) session(2) seq(2) length(2) payload(length) crc16(2)
 * CRC-16/CCITT-FALSE over every byte before the CRC (init 0xFFFF, poly 0x1021, no reflection).
 * The 4-FSK preamble/sync and the symbol mapping live in runtime/acoustic.js.
 */
(function(root, factory){
  var api=factory();
  if(typeof module==="object" && module.exports) module.exports=api;
  root.LopdaAcousticLink=api;
})(typeof window!=="undefined" ? window : (typeof globalThis!=="undefined" ? globalThis : this), function(){
"use strict";

var VERSION=1, HEADER=8, MAX_PAYLOAD=64;
var TYPES={HELLO:1, HELLO_ACK:2, DATA:3, ACK:4, NACK:5, FIN:6};
var NAMES={1:"HELLO",2:"HELLO_ACK",3:"DATA",4:"ACK",5:"NACK",6:"FIN"};

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

function encode(type, session, seq, payload){
  payload=payload||[];
  if(!NAMES[type]) throw new Error("unknown frame type");
  if(payload.length>MAX_PAYLOAD) throw new Error("payload too long");
  session=session&0xFFFF; seq=seq&0xFFFF;
  var out=[VERSION, type, (session>>8)&255, session&255, (seq>>8)&255, seq&255, (payload.length>>8)&255, payload.length&255];
  var i;
  for(i=0;i<payload.length;i++) out.push(payload[i]&255);
  var c=crc16(out,0,out.length);
  out.push((c>>8)&255, c&255);
  return out;
}

function header(bytes){
  if(!bytes || bytes.length<HEADER) return null;
  var version=bytes[0]&255, type=bytes[1]&255;
  if(version!==VERSION || !NAMES[type]) return null;
  var session=((bytes[2]&255)<<8)|(bytes[3]&255);
  var seq=((bytes[4]&255)<<8)|(bytes[5]&255);
  var length=((bytes[6]&255)<<8)|(bytes[7]&255);
  if(length>MAX_PAYLOAD) return null;
  return {version:version, type:type, typeName:NAMES[type], session:session, seq:seq, length:length};
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
  return {ok:true, frame:{version:h.version, type:h.type, typeName:h.typeName, session:h.session, seq:h.seq, payload:payload}, header:h};
}

function typeName(type){ return NAMES[type]||"?"; }

return {
  version:"m3",
  VERSION:VERSION,
  HEADER:HEADER,
  MAX_PAYLOAD:MAX_PAYLOAD,
  TYPES:TYPES,
  crc16:crc16,
  frameLength:frameLength,
  encode:encode,
  header:header,
  parse:parse,
  typeName:typeName
};
});
