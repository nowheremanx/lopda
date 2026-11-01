/*
 * Lo-PDA: the acoustic link's session layer (docs/design/radio.md 7.1, 7.3, 8.3).
 * Pure state machine: no DOM, no audio, no timers, no clock and no Math.random.
 * The host (runtime/link.js) owns the microphone, the speaker and the clock; it
 * passes time and random numbers in, and plays the {do:"tx"} bursts we hand it.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * Two phones, half duplex, one slow lossy channel. Pairing is symmetric: nobody
 * picks master or slave. Each side listens for a random while, then says HELLO;
 * the side that hears a HELLO answers HELLO_ACK and is the responder, the side
 * that gets its HELLO_ACK is the initiator. If both talk at once neither hears
 * the other (the channel is half duplex), and the random listen times separate
 * them next round.
 *
 * Once open, each direction numbers its DATA frames from 1; every frame carries
 * the last in-order number heard from the other side, so the answer to one frame
 * acknowledges the previous one. A message is split into <= 60-byte DATA frames,
 * sent one at a time (stop and wait) with a random backoff and five tries.
 *
 * The HELLO we send keeps its session id for the whole pairing attempt so a
 * responder that already opened on our HELLO but whose HELLO_ACK we missed can
 * recognise us; each attempt gets a fresh nonce, so a late ACK for an older
 * attempt is ignored.
 *
 * Actions, all through poll():
 *   {do:"tx", bytes, rate}        play this burst, then call sent()
 *   {do:"status", phase:"listen"|"hello"|"reply", rate, attempt}
 *   {do:"open", initiator, rate}  paired; `rate` below is the truth
 *   {do:"rate", rate}             the responder followed a repeated HELLO to a
 *                                 new rate; the host must switch its receiver
 *   {do:"message", data}          one complete message from the peer
 *   {do:"result", id, v}          v is "sent", "lost" or "closed"
 *   {do:"close", reason}          "bye"|"lost"|"other-app"|"timeout"|"local"
 */
(function(root, factory){
  var api=factory(
    (typeof module==="object" && module.exports) ? require("./acoustic-link.js") : root.LopdaAcousticLink
  );
  if(typeof module==="object" && module.exports) module.exports=api;
  root.LopdaAcousticSession=api;
})(typeof window!=="undefined" ? window : (typeof globalThis!=="undefined" ? globalThis : this), function(LINK){
"use strict";

var REPLY_MS=1500;             /* one turn of the channel: answer a frame after this. An iPhone sends with its microphone
                                  closed (link.js, playback) and needs 1-2 s to have it running again (two-iPhone test,
                                  iOS 27), so a quicker answer lands while the sender is still deaf */
var QUIET_MS=300;              /* carrier sense: nothing goes out this soon after energy */
var LISTEN_MIN=800, LISTEN_MAX=2400, BACKOFF_MIN=300, BACKOFF_MAX=1200;
var TRIES=5, HELLO_TRIES_PER_RATE=3;
var PAIR_MS=60000, PING_MS=25000, PING_MISSES=3;
var QUEUE=4, MAX_MESSAGE=200, CHUNK=60;
var RATES=[10,20,40];
/* A host that forgets sent() must not freeze the link: after this grace beyond
   the burst's own air time we carry on as if it had called it. */
var SENT_GRACE_MS=2000;

var TYPES=LINK.TYPES, HEADER=LINK.HEADER;

/* A burst's air time: the synth's 150 ms lead, 16 preamble symbols then 4
   symbols per byte, and the 150 ms tail (radio.md 8.4, acoustic.synth). */
function airMs(frameBytes, rate){
  return (16+4*frameBytes)*rate+300;
}

/* Sequence numbers are 16-bit and wrap. 0 is never a DATA seq ("ack 0" means
   "nothing yet"), so 65535 is followed by 1. */
function nextSeq(v){
  var n=(v+1)&0xFFFF;
  return n===0?1:n;
}
function isNext(seq, last){
  var d=(seq-last)&0xFFFF;
  return d===1 || (last===0xFFFF && seq===1);
}
function isAcked(ack, seq){
  return ((ack-seq)&0xFFFF)<0x8000;
}

/* UTF-8 by hand: the runtime is ES5 and acoustic-link.js already avoids
   TextEncoder, so this file does too. A lone surrogate becomes U+FFFD rather
   than throwing: the peer must never crash on a message we were given. */
function utf8Encode(text){
  var out=[], i, c, c2, cp;
  for(i=0;i<text.length;i++){
    c=text.charCodeAt(i);
    if(c>=0xD800 && c<=0xDBFF){
      if(i+1<text.length){
        c2=text.charCodeAt(i+1);
        if(c2>=0xDC00 && c2<=0xDFFF){
          cp=0x10000+((c-0xD800)<<10)+(c2-0xDC00);
          out.push(0xF0|(cp>>18), 0x80|((cp>>12)&63), 0x80|((cp>>6)&63), 0x80|(cp&63));
          i++;
          continue;
        }
      }
      out.push(0xEF, 0xBF, 0xBD);
    }else if(c>=0xDC00 && c<=0xDFFF){
      out.push(0xEF, 0xBF, 0xBD);
    }else if(c<0x80){
      out.push(c);
    }else if(c<0x800){
      out.push(0xC0|(c>>6), 0x80|(c&63));
    }else{
      out.push(0xE0|(c>>12), 0x80|((c>>6)&63), 0x80|(c&63));
    }
  }
  return out;
}

/* null on anything that is not well-formed UTF-8: a text message that did not
   survive the channel is dropped, never shown as mojibake. */
function utf8Decode(bytes){
  var out="", i=0, n=bytes.length, b, c, d, e, cp;
  while(i<n){
    b=bytes[i]&255;
    if(b<0x80){ out+=String.fromCharCode(b); i++; continue; }
    if((b&0xE0)===0xC0){
      if(i+1>=n) return null;
      c=bytes[i+1]&255;
      if((c&0xC0)!==0x80) return null;
      cp=((b&0x1F)<<6)|(c&0x3F);
      if(cp<0x80) return null;
      out+=String.fromCharCode(cp); i+=2; continue;
    }
    if((b&0xF0)===0xE0){
      if(i+2>=n) return null;
      c=bytes[i+1]&255; d=bytes[i+2]&255;
      if((c&0xC0)!==0x80 || (d&0xC0)!==0x80) return null;
      cp=((b&0x0F)<<12)|((c&0x3F)<<6)|(d&0x3F);
      if(cp<0x800) return null;
      if(cp>=0xD800 && cp<=0xDFFF) return null;
      out+=String.fromCharCode(cp); i+=3; continue;
    }
    if((b&0xF8)===0xF0){
      if(i+3>=n) return null;
      c=bytes[i+1]&255; d=bytes[i+2]&255; e=bytes[i+3]&255;
      if((c&0xC0)!==0x80 || (d&0xC0)!==0x80 || (e&0xC0)!==0x80) return null;
      cp=((b&0x07)<<18)|((c&0x3F)<<12)|((d&0x3F)<<6)|(e&0x3F);
      if(cp<0x10000 || cp>0x10FFFF) return null;
      out+=String.fromCharCode(0xD800+((cp-0x10000)>>10), 0xDC00+((cp-0x10000)&0x3FF));
      i+=4; continue;
    }
    return null;
  }
  return out;
}

function create(opts){
  opts=opts||{};
  if(typeof opts.random!=="function") throw new Error("LopdaAcousticSession.create: random() is required");
  var rnd=opts.random;
  var PORT=(opts.port||0)>>>0;
  var PROTO=opts.proto==null?"":String(opts.proto);
  LINK.hello({port:PORT, nonce:0, proto:PROTO}); /* validates proto: ASCII, <= 16 */
  /* firstSeq is a test hook for the 16-bit wrap; real sessions start at 1. */
  var firstSeq=opts.firstSeq==null?1:(opts.firstSeq&0xFFFF);
  if(firstSeq===0) firstSeq=1;
  var baseSeq=(firstSeq-1)&0xFFFF;

  var state="pairing", initiator=null, rate=null;
  var actions=[], started=false, startedAt=0, lastBusy=null;
  var airBusy=false, txInfo=null, txDeadline=0, txAirEnd=0;

  /* pairing */
  var phase="idle", listenUntil=0, attempt=0, rateIdx=0;
  var sid=0, nonce=0, helloRate=null, helloDeadline=0;
  var pendingAck=null, respAck=null, repeatAck=null, replyDue=null;

  /* open */
  var session=0, lastRecv=0, lastSent=0, lastHeard=0, lastActivity=0;
  var queue=[], rx={parts:[], total:0, dropped:false};
  var pingActive=false, pingSent=false, pingMisses=0, pingDueAt=0;
  var nextId=0;

  function rand(lo, hi){ return lo+(hi-lo)*rnd(); }
  function backoff(){ return rand(BACKOFF_MIN, BACKOFF_MAX); }
  function quiet(now){ return lastBusy===null || now-lastBusy>=QUIET_MS; }
  function emit(a){ actions.push(a); }

  function emitTx(bytes, r, kind, now){
    airBusy=true;
    txInfo={kind:kind};
    txAirEnd=now+airMs(bytes.length, r);
    txDeadline=txAirEnd+SENT_GRACE_MS;
    emit({do:"tx", bytes:bytes, rate:r});
  }

  /* Both ACK waits are generous by one burst: the peer answers after REPLY_MS,
     and its frame has to play out before we hear anything. HELLO_ACK's length is
     sized for the longest proto (16 bytes) since the peer's may be longer than
     ours; a PING can be answered by a full DATA frame. */
  function dataWait(r){ return REPLY_MS+airMs(HEADER+CHUNK+2, r)+700; }
  function helloWait(r){ return REPLY_MS+airMs(HEADER+7+16+2, r)+700; }

  function helloAckBytes(id, n){
    return LINK.encode(TYPES.HELLO_ACK, id, 0, 0,
      LINK.hello({port:PORT, nonce:n, proto:PROTO}), false);
  }

  /* ---- pairing ---------------------------------------------------------- */

  function beginListen(now){
    phase="listen";
    listenUntil=now+rand(LISTEN_MIN, LISTEN_MAX);
    emit({do:"status", phase:"listen", rate:RATES[rateIdx], attempt:attempt+1});
  }

  function sendHello(now){
    attempt++;
    if(!sid){
      /* The session id names this pairing attempt so a responder can recognise
         our HELLO retries; the nonce is fresh each try. */
      sid=1+Math.floor(rnd()*65535);
    }
    nonce=Math.floor(rnd()*65536);
    helloRate=RATES[rateIdx];
    var bytes=LINK.encode(TYPES.HELLO, sid, 0, 0,
      LINK.hello({port:PORT, nonce:nonce, proto:PROTO}), false);
    phase="helloWait";
    helloDeadline=0;
    emit({do:"status", phase:"hello", rate:helloRate, attempt:attempt});
    emitTx(bytes, helloRate, "hello", now);
  }

  function pairingTick(now){
    if(now-startedAt>=PAIR_MS){ finish("timeout"); return; }
    if(airBusy) return;

    if(phase==="listen"){
      if(now<listenUntil || !quiet(now)) return;
      sendHello(now);
      return;
    }
    if(phase==="helloWait"){
      if(helloDeadline && now>=helloDeadline){
        helloDeadline=0;
        if(attempt>=HELLO_TRIES_PER_RATE){ attempt=0; rateIdx=(rateIdx+1)%RATES.length; }
        beginListen(now);
      }
      return;
    }
    if(phase==="reply" && pendingAck){
      if(now<replyDue || !quiet(now)) return;
      phase="replyTx";
      replyDue=null;
      emitTx(helloAckBytes(pendingAck.session, pendingAck.nonce), pendingAck.rate, "helloack", now);
    }
    /* phase "replyTx" ends in sent() */
  }

  function pairingHeard(f, now, r){
    /* Our own burst is still playing; the host mutes the microphone for it, so
       this frame is a collision, not something we can answer. A burst whose
       sent() is merely late is over on air: accept what arrives after it. */
    if(airBusy && now<txAirEnd) return;

    if(f.type===TYPES.HELLO){
      /* A HELLO wins even while we wait for the ACK to our own: the peer is the
         one still asking, so we drop our attempt and answer as responder. */
      if(phase!=="listen" && phase!=="helloWait") return;
      var h=LINK.parseHello(f.payload);
      if(!h) return;
      pendingAck={session:f.session, nonce:h.nonce, rate:r,
        mismatch:(h.port!==PORT)||(h.proto!==PROTO)};
      phase="reply";
      helloDeadline=0;
      replyDue=now+REPLY_MS;
      emit({do:"status", phase:"reply", rate:r, attempt:attempt+1});
      return;
    }

    if(f.type===TYPES.HELLO_ACK){
      if(phase!=="helloWait" || f.session!==sid) return;
      var a=LINK.parseHello(f.payload);
      if(!a || a.nonce!==nonce) return;
      if(a.port!==PORT || a.proto!==PROTO){ finish("other-app"); return; }
      openAs(true, helloRate, sid, now);
    }
  }

  /* ---- open ------------------------------------------------------------- */

  function openAs(isInitiator, r, id, now){
    state="open";
    initiator=isInitiator;
    rate=r;
    session=id;
    lastRecv=baseSeq;
    lastSent=baseSeq;
    lastHeard=now;
    lastActivity=now;
    pingActive=false; pingSent=false; pingMisses=0;
    phase="open";
    emit({do:"open", initiator:isInitiator, rate:r});
  }

  function scheduleReply(now){
    /* A reply already on its way answers this frame too; don't push it back. */
    if(replyDue===null) replyDue=now+REPLY_MS;
  }

  function emitAck(now){
    emitTx(LINK.encode(TYPES.ACK, session, lastSent, lastRecv, [], false), rate, "ack", now);
    lastActivity=now;
  }

  function emitData(now){
    var m=queue[0];
    if(!m) return;
    if(m.seq===null){ lastSent=nextSeq(lastSent); m.seq=lastSent; }
    var chunk=m.chunks[m.index];
    var more=m.index<m.chunks.length-1;
    var bytes=LINK.encode(TYPES.DATA, session, m.seq, lastRecv, chunk, more);
    m.tries++;
    m.inFlight=true;
    m.nextAt=0;
    emitTx(bytes, rate, "data", now);
    lastActivity=now;
    pingActive=false; pingSent=false;
  }

  function emitReply(now){
    replyDue=null;
    if(repeatAck){
      var a=repeatAck;
      repeatAck=null;
      emitTx(a.bytes, a.rate, "ack", now);
      lastActivity=now;
      return;
    }
    var m=queue[0];
    if(m && !m.inFlight && m.nextAt<=now){ emitData(now); return; }
    emitAck(now);
  }

  function ackIn(ack, now){
    var m=queue[0];
    if(!m || !m.inFlight || !isAcked(ack, m.seq)) return;
    m.inFlight=false;
    if(m.index>=m.chunks.length-1){
      emit({do:"result", id:m.id, v:"sent"});
      queue.shift();
      m=queue[0];
      /* A turn of silence before the next message: the peer may want to speak. */
      if(m) m.nextAt=now+REPLY_MS;
    }else{
      m.index++;
      m.seq=null;
      m.tries=0; /* five tries per fragment, not for the whole message */
      m.nextAt=now+REPLY_MS;
    }
  }

  function deliver(bundle){
    var all=[], i, j, kind, body, text;
    for(i=0;i<bundle.parts.length;i++){
      for(j=0;j<bundle.parts[i].length;j++) all.push(bundle.parts[i][j]);
    }
    if(!all.length) return;
    kind=all[0]&255;
    body=all.slice(1);
    if(kind===0){
      text=utf8Decode(body);
      if(text!==null) emit({do:"message", data:text});
    }else if(kind===1){
      emit({do:"message", data:new Uint8Array(body)});
    }
    /* Any other kind is a frame from a newer peer: drop the whole message. */
  }

  function onData(f, now){
    if(isNext(f.seq, lastRecv)){
      lastRecv=f.seq;
      if(rx.dropped){
        if(!f.more) rx={parts:[], total:0, dropped:false};
      }else{
        rx.parts.push(f.payload);
        rx.total+=f.payload.length;
        if(rx.total>MAX_MESSAGE+1){
          /* Overlong reassembly: keep acking so the sender moves on, but never
             hand a truncated message to the app. */
          rx={parts:[], total:0, dropped:true};
        }else if(!f.more){
          deliver(rx);
          rx={parts:[], total:0, dropped:false};
        }
      }
      scheduleReply(now);
      return;
    }
    /* A duplicate (our ACK was lost) or a gap: ack what we have and drop it.
       Stop-and-wait means the sender can only be retrying its current frame. */
    scheduleReply(now);
  }

  function maybeRepeatAck(f, now, r){
    if(initiator || !respAck) return;
    /* The repeat window closes when the initiator's first DATA is accepted.
       Our own queued or already-sent frames do not close it: otherwise a lost
       first HELLO_ACK plus a message on our side would strand the initiator. */
    if(lastRecv!==baseSeq) return;
    var h=LINK.parseHello(f.payload);
    if(!h || f.session!==session) return;
    /* The initiator retried with a fresh nonce (possibly at a new rate). Answer
       that HELLO, and tell the host when the channel rate has moved. */
    if(r!==rate){
      rate=r;
      emit({do:"rate", rate:r});
    }
    respAck={nonce:h.nonce};
    repeatAck={bytes:helloAckBytes(session, h.nonce), rate:r};
    scheduleReply(now);
  }

  function openHeard(f, now, r){
    if(f.session!==session) return;
    lastHeard=now;
    lastActivity=now;
    pingActive=false; pingSent=false; pingMisses=0;
    ackIn(f.ack, now);

    if(f.type===TYPES.BYE){ finish("bye"); return; }
    if(f.type===TYPES.HELLO){ maybeRepeatAck(f, now, r); return; }
    if(f.type===TYPES.PING){ scheduleReply(now); return; }
    if(f.type===TYPES.DATA){ onData(f, now); return; }
    /* ACK and a late HELLO_ACK: the ack above was all they had to say. */
  }

  function pingTick(now){
    if(queue.length){ pingActive=false; return; }
    /* A PING's wait starts at sent(): while our burst plays, nothing can have
       answered it yet, and counting that as a miss would burn the three tries. */
    if(airBusy) return;
    if(!pingActive){
      if(now-lastActivity<PING_MS) return;
      pingActive=true; pingSent=false; pingMisses=0; pingDueAt=now;
    }
    if(pingSent){
      if(now<pingDueAt) return;
      pingSent=false;
      pingMisses++;
      if(pingMisses>=PING_MISSES){ finish("lost"); return; }
      /* Back off before the retry, so the next two PINGs never land on top of
         each other or on top of a slow ACK. */
      pingDueAt=now+backoff();
      return;
    }
    if(now<pingDueAt) return;
    if(airBusy || replyDue!==null || !quiet(now)) return;
    emitTx(LINK.encode(TYPES.PING, session, lastSent, lastRecv, [], false), rate, "ping", now);
    pingSent=true;
    lastActivity=now;
  }

  function openTick(now){
    if(!initiator && now-lastHeard>=PING_MS*(PING_MISSES+1)){
      finish("lost");
      return;
    }
    if(initiator){
      pingTick(now);
      if(state==="closed" || airBusy) return;
    }
    if(airBusy) return;

    var m=queue[0];
    if(m && m.inFlight && now>=m.deadline){
      m.inFlight=false;
      if(m.tries>=TRIES){ finish("lost"); return; }
      m.nextAt=now+backoff();
    }
    if(replyDue!==null){
      if(now>=replyDue && quiet(now)) emitReply(now);
      return;
    }
    if(m && !m.inFlight && now>=m.nextAt && quiet(now)) emitData(now);
  }

  /* ---- inputs ----------------------------------------------------------- */

  function tick(now){
    if(state==="closed") return;
    /* A missing sent() is a host bug, but it must not wedge the link. */
    if(airBusy && txDeadline && now>=txDeadline) onSent(now);
    if(!started){
      started=true;
      startedAt=now;
      beginListen(now);
      return;
    }
    if(state==="pairing") pairingTick(now);
    else openTick(now);
  }

  function heard(bytes, now, r){
    if(state==="closed") return;
    var p=LINK.parse(bytes);
    if(!p.ok) return; /* a bad CRC is indistinguishable from noise */
    if(state==="pairing") pairingHeard(p.frame, now, r);
    else openHeard(p.frame, now, r);
  }

  function busy(now){
    if(state==="closed") return;
    lastBusy=now;
  }

  function sent(now){
    if(!airBusy) return;
    onSent(now);
  }

  /* Shared by sent() and the watchdog: everything that happens when a burst's
     air time is over. */
  function onSent(now){
    airBusy=false;
    txDeadline=0;
    txAirEnd=0;
    var info=txInfo;
    txInfo=null;
    if(!info || state==="closed") return;

    if(info.kind==="hello"){
      if(state==="pairing") helloDeadline=now+helloWait(helloRate);
      return;
    }
    if(info.kind==="helloack"){
      var pa=pendingAck;
      pendingAck=null;
      if(!pa) return;
      if(pa.mismatch){
        finish("other-app");
        return;
      }
      respAck={nonce:pa.nonce};
      openAs(false, pa.rate, pa.session, now);
      return;
    }
    if(state!=="open") return;

    if(info.kind==="data"){
      var m=queue[0];
      if(m && m.inFlight) m.deadline=now+dataWait(rate);
      return;
    }
    if(info.kind==="ping"){
      /* The peer may answer with a full DATA frame (up to 71 bytes), so use
         the same window as for DATA before calling the PING unanswered. */
      if(pingSent) pingDueAt=now+dataWait(rate);
    }
  }

  function send(data){
    if(state==="closed") return "closed";
    var kind, body=[], i;
    if(typeof data==="string"){
      kind=0;
      body=utf8Encode(data);
    }else if(data && typeof data==="object" && typeof data.length==="number"){
      kind=1;
      for(i=0;i<data.length;i++) body.push(data[i]&255);
    }else{
      throw new TypeError("send: a string or a Uint8Array");
    }
    if(body.length>MAX_MESSAGE) return "big";
    if(queue.length>=QUEUE) return "busy";

    var all=[kind].concat(body), chunks=[];
    for(i=0;i<all.length;i+=CHUNK) chunks.push(all.slice(i, i+CHUNK));
    nextId++;
    queue.push({id:nextId, chunks:chunks, index:0, seq:null,
      inFlight:false, tries:0, nextAt:0, deadline:0});
    return nextId;
  }

  function finish(reason){
    if(state==="closed") return;
    var lost=reason==="lost", i, m, v;
    for(i=0;i<queue.length;i++){
      m=queue[i];
      v=(lost && i===0 && m.seq!==null)?"lost":"closed";
      emit({do:"result", id:m.id, v:v});
    }
    queue=[];
    rx={parts:[], total:0, dropped:false};
    pendingAck=null; repeatAck=null; replyDue=null; respAck=null;
    airBusy=false;
    txInfo=null;
    txDeadline=0;
    txAirEnd=0;
    state="closed";
    emit({do:"close", reason:reason});
  }

  function close(){
    if(state==="closed") return;
    /* One BYE, not waited for: the peer closes on it or on its own timeout. */
    if(state==="open"){
      emit({do:"tx", bytes:LINK.encode(TYPES.BYE, session, lastSent, lastRecv, [], false), rate:rate});
    }
    finish("local");
  }

  function poll(){
    var out=actions;
    actions=[];
    return out;
  }

  var api={tick:tick, heard:heard, busy:busy, sent:sent, send:send, close:close, poll:poll};
  Object.defineProperty(api, "state", {get:function(){ return state; }});
  Object.defineProperty(api, "initiator", {get:function(){ return initiator; }});
  Object.defineProperty(api, "rate", {get:function(){ return rate; }});
  return api;
}

return {
  version:"v1",
  create:create,
  airMs:airMs,
  RATES:RATES,
  MAX_MESSAGE:MAX_MESSAGE
};
});
