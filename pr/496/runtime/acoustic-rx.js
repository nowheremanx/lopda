/*
 * Lo-PDA: the acoustic link's incremental receiver. Pure functions only: no DOM, no
 * Web Audio, no timers, no clock. The caller feeds microphone samples and absolute
 * sample positions; the receiver remembers only the last four seconds.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 *
 * The link keeps the microphone open for minutes, so re-decoding a growing recording
 * is not an option. Here every grid point (1/8 symbol) is measured once, when its
 * window has just arrived; a candidate is scored when its 16th preamble symbol does.
 * Payload symbols are read as their windows arrive, so even a 12-second 40 ms frame
 * never has to sit in the ring.
 *
 * One rate reads at a time. A false sync goes back to just after its preamble start,
 * so it cannot hide a real burst later; a real frame makes the other rates skip
 * everything that starts before its end, so one burst is reported once.
 */
(function(root, factory){
  var api=factory(
    (typeof module==="object" && module.exports) ? require("./acoustic.js") : root.LopdaAcoustic,
    (typeof module==="object" && module.exports) ? require("./acoustic-link.js") : root.LopdaAcousticLink
  );
  if(typeof module==="object" && module.exports) module.exports=api;
  root.LopdaAcousticRx=api;
})(typeof window!=="undefined" ? window : (typeof globalThis!=="undefined" ? globalThis : this), function(AC, LINK){
"use strict";

var SECONDS=4, CHUNK=8192, GRID_CAP=512, PREAMBLE_LEN=16, MAX_MUTES=64;
/* Payload bytes that look like the preamble at 12/16 are common enough to ignore;
   at 14/16 a candidate is strong enough to interrupt a false frame already being read. */
var PREEMPT=14;

/* A circular ring of recent samples, addressed by absolute sample number. */
function Ring(cap){
  this.buf=new Float32Array(cap);
  this.cap=cap;
  this.head=0;
  this.count=0;
  this.start=0;
}
Ring.prototype.clear=function(abs){
  this.head=0; this.count=0; this.start=abs;
};
Ring.prototype.dropBefore=function(abs){
  if(abs<=this.start) return;
  if(abs>=this.start+this.count){ this.head=0; this.count=0; this.start=abs; return; }
  var drop=abs-this.start;
  this.head=(this.head+drop)%this.cap;
  this.count-=drop;
  this.start=abs;
};
Ring.prototype.append=function(abs, src, from, to){
  var n=to-from, tail, first, i, cut;
  if(n<=0) return;
  if(n>this.cap){
    cut=n-this.cap;
    from+=cut; n=this.cap;
    this.head=0; this.count=0; this.start=abs+cut;
  }
  tail=(this.head+this.count)%this.cap;
  first=Math.min(n, this.cap-tail);
  if(src.subarray){
    this.buf.set(src.subarray(from, from+first), tail);
    if(first<n) this.buf.set(src.subarray(from+first, to), 0);
  }else{
    for(i=0;i<first;i++) this.buf[tail+i]=src[from+i]||0;
    for(i=first;i<n;i++) this.buf[i-first]=src[from+i]||0;
  }
  this.count+=n;
};
Ring.prototype.copy=function(abs, n, out){
  var idx=(this.head+(abs-this.start))%this.cap, first=Math.min(n, this.cap-idx);
  out.set(this.buf.subarray(idx, idx+first), 0);
  if(first<n) out.set(this.buf.subarray(0, n-first), first);
};
Ring.prototype.zero=function(from, to){
  var a=Math.max(from, this.start), b=Math.min(to, this.start+this.count), n, idx, part;
  if(b<=a) return;
  n=b-a;
  idx=(this.head+(a-this.start))%this.cap;
  while(n>0){
    part=Math.min(n, this.cap-idx);
    this.buf.fill(0, idx, idx+part);
    n-=part;
    idx=0;
  }
};

function create(opts){
  opts=opts||{};
  var sr=opts.sampleRate||48000;
  var list=opts.rates||[10,20,40];
  var cap=Math.floor(sr*SECONDS);
  var ring=new Ring(cap);
  var zeros=new Float32Array(CHUNK);
  var rates=[], out=[], mutes=[];
  var next=0, frontier=0, started=false, i;

  function makeRate(ms){
    var period=sr*ms/1000, win=Math.max(64, Math.round(period));
    return {ms:ms, period:period, win:win, step:period/8,
      nextK:0, minStart:0, scoredThrough:-1, pending:null, reading:null,
      grid:new Array(GRID_CAP), scratch:new Float32Array(win)};
  }
  for(i=0;i<list.length;i++) rates.push(makeRate(list[i]));

  function toneAt(r, pos){
    if(pos<ring.start || pos+r.win>frontier) return null;
    ring.copy(pos, r.win, r.scratch);
    return AC.toneWindow(r.scratch, 0, r.win, sr);
  }

  function scoreAt(r, start){
    var score=0, sep=0, i, t;
    for(i=0;i<PREAMBLE_LEN;i++){
      t=toneAt(r, Math.round(start+i*r.period));
      if(t && t.idx===AC.PREAMBLE[i] && t.sep>=4 && t.rmsDb>AC.MIN_RMS){ score++; sep+=t.sep; }
    }
    return {score:score, sep:sep};
  }

  function refine(r, start){
    var best=scoreAt(r, start), deltas=[-r.step/2, -r.step/4, 0, r.step/4, r.step/2];
    var i, delta, cand;
    for(i=0;i<deltas.length;i++){
      delta=deltas[i];
      if(start+delta<0) continue;
      cand=scoreAt(r, start+delta);
      if(cand.score>best.score || (cand.score===best.score && cand.sep>best.sep)){ best=cand; start+=delta; }
    }
    return start;
  }

  function scoreCandidate(r, k){
    var score=0, sep=0, okRms=0, i, e, kg;
    for(i=0;i<PREAMBLE_LEN;i++){
      kg=k+8*i;
      e=r.grid[kg%GRID_CAP];
      if(!e || e.k!==kg) return null;
      if(e.rmsDb>AC.MIN_RMS) okRms++;
      if(e.idx===AC.PREAMBLE[i] && e.sep>=4 && e.rmsDb>AC.MIN_RMS){ score++; sep+=e.sep; }
    }
    if(okRms<AC.MIN_SYNC) return null;
    return {k:k, score:score, sep:sep};
  }

  function kBeforeSample(r, sample){
    if(sample<=0) return 0;
    var k=Math.ceil(sample/r.step);
    if(k<0) k=0;
    while(Math.round(k*r.step)<sample) k++;
    while(k>0 && Math.round((k-1)*r.step)>=sample) k--;
    return k;
  }

  function abandon(r, rd){
    r.reading=null;
    r.pending=null;
    r.minStart=rd.startSample+1;
    if(!r.rescanning) rescan(r);
  }

  function onFrame(r, rd, bytes, end){
    var i, rr, pstart;
    out.push({rate:r.ms, startSample:rd.startSample, endSample:end, bytes:bytes});
    for(i=0;i<rates.length;i++){
      rr=rates[i];
      if(rr.pending){
        pstart=Math.round(rr.pending.best.k*rr.step);
        if(pstart<end) rr.pending=null;
      }
      if(rr.minStart<end) rr.minStart=end;
      if(rr!==r && rr.reading && rr.reading.startSample<end) rr.reading=null;
    }
    r.reading=null;
  }

  function advanceReading(r){
    var rd=r.reading, pos, tw, h, bytes, total, want, got, end;
    while(rd){
      if(rd.total==null && rd.next>=LINK.HEADER*4){
        h=LINK.header(AC.symbolsToBytes(rd.symbols.slice(0, LINK.HEADER*4)));
        if(!h){ abandon(r, rd); return; }
        rd.total=LINK.frameLength(h.length)*4;
        continue;
      }
      if(rd.total!=null && rd.next>=rd.total){
        bytes=AC.symbolsToBytes(rd.symbols);
        total=bytes.length;
        if(total!==rd.total/4){ abandon(r, rd); return; }
        want=LINK.crc16(bytes, 0, total-2);
        got=((bytes[total-2]&255)<<8)|(bytes[total-1]&255);
        if(want!==got){ abandon(r, rd); return; }
        end=Math.round(rd.start+(PREAMBLE_LEN+rd.total)*r.period);
        onFrame(r, rd, bytes, end);
        return;
      }
      pos=Math.round(rd.start+(PREAMBLE_LEN+rd.next)*r.period);
      tw=toneAt(r, pos);
      if(!tw) return;
      if(!tw.valid){ abandon(r, rd); return; }
      rd.symbols.push(tw.idx);
      rd.next++;
    }
  }

  function startReading(r, best){
    var start=refine(r, Math.round(best.k*r.step));
    r.reading={start:start, startSample:Math.round(start), symbols:[], next:0, total:null};
    advanceReading(r);
  }

  function consider(r, k){
    var start, s, best, until, rd;
    if(k<0) return;
    if(k>r.scoredThrough) r.scoredThrough=k;
    start=Math.round(k*r.step);
    if(start<r.minStart) return;
    s=scoreCandidate(r, k);
    rd=r.reading;
    if(!r.pending){
      if(!s) return;
      if(rd){
        if(s.score>=PREEMPT && start>=rd.start+PREAMBLE_LEN*r.period) r.pending={best:s, until:k+4};
      }else if(s.score>=AC.MIN_SYNC) r.pending={best:s, until:k+4};
      return;
    }
    if(s && (s.score>r.pending.best.score || (s.score===r.pending.best.score && s.sep>r.pending.best.sep))){
      r.pending.best=s;
    }
    if(k>=r.pending.until){
      best=r.pending.best; until=r.pending.until;
      r.pending=null;
      if(until>r.scoredThrough) r.scoredThrough=until;
      if(r.reading) r.reading=null;
      startReading(r, best);
    }
  }

  function rescan(r){
    if(r.rescanning) return;
    r.rescanning=true;
    var last=r.nextK-1-(PREAMBLE_LEN-1)*8;
    var k=Math.max(r.scoredThrough+1, kBeforeSample(r, r.minStart));
    while(k<=last){
      consider(r, k);
      if(r.reading){
        advanceReading(r);
        if(r.reading) break;
        k=Math.max(k+1, kBeforeSample(r, r.minStart));
      }else k++;
    }
    r.rescanning=false;
  }

  function computeGrids(r){
    var pos, tw, k;
    while(true){
      pos=Math.round(r.nextK*r.step);
      if(pos+r.win>frontier) return;
      if(pos<ring.start){ r.nextK++; continue; }
      tw=toneAt(r, pos);
      if(!tw) return;
      r.grid[r.nextK%GRID_CAP]={k:r.nextK, idx:tw.idx, sep:tw.sep, rmsDb:tw.rmsDb};
      k=r.nextK-(PREAMBLE_LEN-1)*8;
      r.nextK++;
      if(k>=0) consider(r, k);
    }
  }

  function advance(){
    var i, r;
    for(i=0;i<rates.length;i++) computeGrids(rates[i]);
    for(i=0;i<rates.length;i++){
      r=rates[i];
      if(r.reading) advanceReading(r);
    }
  }

  function applyMutes(from, to){
    var i, m, a, b;
    for(i=0;i<mutes.length;i++){
      m=mutes[i];
      a=Math.max(from, m.from); b=Math.min(to, m.to);
      if(b>a) ring.zero(a, b);
    }
    boundMutes();
  }

  function boundMutes(){
    var i;
    for(i=mutes.length-1;i>=0;i--) if(mutes[i].to<=ring.start) mutes.splice(i, 1);
    if(mutes.length>MAX_MUTES) mutes.splice(0, mutes.length-MAX_MUTES);
  }

  function feed(src, from, to){
    var n, abs, end;
    while(from<to){
      n=Math.min(CHUNK, to-from);
      abs=next; end=abs+n;
      if(ring.count+n>ring.cap) ring.dropBefore(abs-(ring.cap-n));
      ring.append(abs, src, from, from+n);
      applyMutes(abs, end);
      next=end; frontier=end;
      advance();
      from+=n;
    }
  }

  function feedSilence(n){
    while(n>0){
      var m=Math.min(CHUNK, n);
      feed(zeros, 0, m);
      n-=m;
    }
  }

  function resetRate(r, t0){
    var j;
    r.nextK=Math.ceil(t0/r.step);
    if(r.nextK<0) r.nextK=0;
    r.minStart=t0;
    r.scoredThrough=r.nextK-1;
    r.pending=null;
    r.reading=null;
    r.rescanning=false;
    for(j=0;j<GRID_CAP;j++) r.grid[j]=null;
  }

  function startAt(t0){
    started=true;
    next=t0;
    frontier=t0;
    ring.clear(t0);
    for(var j=0;j<rates.length;j++) resetRate(rates[j], t0);
  }

  var api={
    push:function(samples, t0Sample){
      if(!samples || !samples.length) return api;
      var t0=(typeof t0Sample==="number" && isFinite(t0Sample)) ? Math.round(t0Sample) : (started?next:0);
      var from=0, gap;
      if(!started) startAt(t0);
      else if(t0>next){
        gap=t0-next;
        if(gap>cap) startAt(t0);
        else feedSilence(gap);
      }else if(t0<next-cap){
        /* The audio clock jumped backwards; the old timeline cannot be joined to this one. */
        startAt(t0);
      }
      if(t0<next){
        from=Math.min(samples.length, next-t0);
        if(from>=samples.length) return api;
      }
      feed(samples, from, samples.length);
      return api;
    },
    mute:function(fromSample, toSample){
      var from=Math.round(fromSample), to=Math.round(toSample);
      var i, j, r, e, start;
      if(!(to>from)) return api;
      mutes.push({from:from, to:to});
      boundMutes();
      ring.zero(from, to);
      for(i=0;i<rates.length;i++){
        r=rates[i];
        for(j=0;j<GRID_CAP;j++){
          e=r.grid[j];
          if(!e) continue;
          start=Math.round(e.k*r.step);
          if(start>=from && start<to) r.grid[j]=null;
        }
        if(r.pending){
          start=Math.round(r.pending.best.k*r.step);
          if(start>=from && start<to) r.pending=null;
        }
        if(r.reading && r.reading.startSample>=from && r.reading.startSample<to) r.reading=null;
      }
      for(i=out.length-1;i>=0;i--){
        if(out[i].startSample>=from && out[i].startSample<to) out.splice(i, 1);
      }
      return api;
    },
    frames:function(){
      var done=out;
      out=[];
      done.sort(function(a, b){ return a.startSample-b.startSample; });
      return done;
    }
  };
  return api;
}

return {version:"rx1", create:create};
});
