/* Lo-PDA runtime: read a score transcription into a Tape4 song. Pure functions; the clock is supplied by the caller.
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var NOTES={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
var SCALE={major:[0,2,4,5,7,9,11],minor:[0,2,3,5,7,8,10]};
var QUALITIES={
  "": "maj", m:"m", "7":"7", maj7:"maj7", M7:"maj7", "Δ":"maj7", m7:"m7", "9":"9", m9:"m9",
  "6":"6", m6:"m6", add9:"add9", add2:"add9", sus2:"sus2", sus4:"sus4", sus:"sus4", dim:"dim", dim7:"dim7",
  aug:"aug", "+":"aug", m7b5:"m7b5", "ø":"m7b5", "5":"5"
};
var FALLBACKS={m7add11:"m7", add11:"maj", "m(add9)":"m", madd9:"m", maj9:"maj7", "11":"7", "13":"9", m11:"m7",
  sus4add9:"sus4", "7sus4":"sus4", mMaj7:"m"};

function plain(x){ return !!x && Object.prototype.toString.call(x)==="[object Object]"; }
function int(x){ return typeof x==="number" && isFinite(x) && Math.floor(x)===x; }
function owns(o,k){ return Object.prototype.hasOwnProperty.call(o,k); }
function mod(n,m){ return ((n%m)+m)%m; }
function shapeKeys(obj,required,optional){
  var k,i;
  if(!plain(obj)) return false;
  for(i=0;i<required.length;i++) if(!owns(obj,required[i])) return false;
  for(k in obj) if(owns(obj,k) && required.indexOf(k)<0 && optional.indexOf(k)<0) return false;
  return true;
}

function parseBeat(str){
  if(typeof str!=="string" || !str.length) return {error:"empty"};
  if(str==="-") return [{deg:0,oct:0,acc:0,len16:4,tie:false,hold:true}];
  var re=/([#b]?)([0-7])([',]*)(\.?)(~?)/g, out=[], m, pos=0, marks, n, i, base;
  while(pos<str.length){
    re.lastIndex=pos; m=re.exec(str);
    if(!m || m.index!==pos) return {error:"token"};
    marks=m[3]; n=0;
    for(i=0;i<marks.length;i++) n+=marks.charAt(i)==="'"?1:-1;
    out.push({deg:Number(m[2]),oct:n,acc:m[1]==="#"?1:(m[1]==="b"?-1:0),len16:0,tie:!!m[5],hold:false,dotted:!!m[4]});
    pos=re.lastIndex;
  }
  if(out.length===3) return {error:"triplet"};
  if(out.length!==1 && out.length!==2 && out.length!==4) return {error:"tokens"};
  base=4/out.length;
  for(i=0;i<out.length;i++) out[i].len16=base;
  for(i=0;i<out.length;i++) if(out[i].dotted){
    if(i+1>=out.length) return {error:"length"};
    if(out[i+1].dotted) return {error:"length"};
    out[i].len16=base*1.5;
    out[i+1].len16=base*0.5;
  }
  var total=0;
  for(i=0;i<out.length;i++){
    delete out[i].dotted;
    if(out[i].len16%1 || out[i].len16<1) return {error:"length"};
    total+=out[i].len16;
  }
  if(total!==4) return {error:"length"};
  return out;
}

function check(obj){
  var score,i,j,b,parsed;
  if(!shapeKeys(obj,["key","meter","bars"],["title","capo","bpm"])) return {error:"shape"};
  if(obj.meter!=="4/4") return {error:"meter"};
  if(typeof obj.key!=="string") return {error:"key"};
  if(typeof obj.capo!=="undefined" && (!int(obj.capo)||obj.capo<0||obj.capo>11)) return {error:"capo"};
  if(typeof obj.bpm!=="undefined" && obj.bpm!==null && (typeof obj.bpm!=="number"||!isFinite(obj.bpm))) return {error:"bpm"};
  if(typeof obj.title!=="undefined" && typeof obj.title!=="string") return {error:"title"};
  if(!Array.isArray(obj.bars)||obj.bars.length<1||obj.bars.length>400) return {error:"bars"};
  score={key:obj.key,meter:obj.meter,bars:[],capo:typeof obj.capo==="undefined"?0:obj.capo,bpm:typeof obj.bpm==="undefined"?null:obj.bpm};
  if(typeof obj.title!=="undefined") score.title=obj.title;
  for(i=0;i<obj.bars.length;i++){
    b=obj.bars[i];
    if(!shapeKeys(b,["chords","beats"],[])) return {error:"bar",at:{bar:i}};
    if(!Array.isArray(b.chords)||b.chords.length>2) return {error:"chords",at:{bar:i}};
    for(j=0;j<b.chords.length;j++) if(typeof b.chords[j]!=="string") return {error:"chords",at:{bar:i}};
    if(!Array.isArray(b.beats)||b.beats.length!==4) return {error:"beats",at:{bar:i}};
    for(j=0;j<4;j++){
      if(typeof b.beats[j]!=="string") return {error:"beat",at:{bar:i,beat:j}};
      parsed=parseBeat(b.beats[j]);
      if(parsed.error) return {error:parsed.error,at:{bar:i,beat:j}};
    }
    score.bars.push({chords:b.chords.slice(),beats:b.beats.slice()});
  }
  return {score:score};
}

function keyPc(name,capo){
  if(typeof name!=="string") return null;
  var m=/^([A-G](?:#|b)?)(m?)$/.exec(name), pc;
  if(!m) return null;
  pc=pitchPc(m[1]);
  if(pc===null) return null;
  capo=typeof capo==="undefined"?0:capo;
  if(!int(capo)||capo<0||capo>11) return null;
  return mod(pc+capo,12);
}

function keyMode(name){ return /m$/.test(name)?"minor":"major"; }
function pitchPc(name){
  var m=/^([A-G])([#b]?)$/.exec(name||""), pc;
  if(!m) return null;
  pc=NOTES[m[1]]+(m[2]==="#"?1:(m[2]==="b"?-1:0));
  return mod(pc,12);
}
function chord(symbol,key){
  if(typeof symbol!=="string" || (typeof key!=="number" && !plain(key))) return {error:"chord"};
  var m=/^([A-Ga-g])([#b]?)(.*?)(?:\/([A-Ga-g][#b]?))?$/.exec(symbol), rootName, bassName, rootPc, bassPc, suffix, q, lost, scale, tonic, deg, acc, i, pc, below=-1, above=-1;
  if(!m) return {error:"chord"};
  rootName=m[1].toUpperCase()+m[2]; rootPc=pitchPc(rootName);
  bassName=m[4]?m[4].charAt(0).toUpperCase()+m[4].slice(1):null;
  bassPc=bassName?pitchPc(bassName):null;
  if(typeof rootPc!=="number" || (bassName && typeof bassPc!=="number")) return {error:"chord"};
  suffix=m[3]; q=owns(QUALITIES,suffix)?QUALITIES[suffix]:null; lost=null;
  if(!q){
    q=owns(FALLBACKS,suffix)?FALLBACKS[suffix]:null;
    if(q) lost="chord:"+symbol+">"+q;
    else {
      if(/^maj|^M/.test(suffix)) q=/\d/.test(suffix)?"maj7":"maj";
      else if(/^m/.test(suffix)||/^min/.test(suffix)) q="m";
      else q="maj";
      lost="chord:"+symbol+">"+q;
    }
  }
  scale=SCALE[keyMode(typeof key==="number"?"":key.name||"")];
  if(!scale) scale=SCALE.major;
  tonic=typeof key==="number"?key:key.pc;
  if(typeof tonic!=="number") return {error:"chord"};
  for(i=0;i<scale.length;i++){
    pc=mod(tonic+scale[i],12);
    if(pc===rootPc){ deg=i; acc=0; break; }
  }
  if(typeof deg==="undefined"){
    var flat=m[2]==="b";
    for(i=0;i<scale.length;i++){
      pc=mod(tonic+scale[i],12);
      if(mod(pc+1,12)===rootPc) below=i;
      if(mod(pc-1,12)===rootPc) above=i;
    }
    if(flat && above>=0){deg=above;acc=-1;}
    else if(below>=0){deg=below;acc=1;}
    else if(above>=0){deg=above;acc=-1;}
    else return {error:"chord"};
  }
  var out={deg:deg,acc:acc,q:q};
  if(bassName) out.bassPc=bassPc;
  if(lost) out.lost=lost;
  return out;
}

function degreeFor(song,track,midi){
  var d,a,accs=[0,1,-1];
  if(!int(midi)) return null;
  for(var i=0;i<accs.length;i++){
    a=accs[i];
    for(d=-32;d<=32;d++) if(LopdaSong.noteMidi(song,track,d,a)===midi) return {deg:d,acc:a};
  }
  return null;
}
function tie(list,end){
  list.sort(function(a,b){return a.t-b.t;});
  for(var i=0;i<list.length;i++) list[i].len=(i+1<list.length?list[i+1].t:end)-list[i].t;
  return list;
}
function nearestMidi(base,prev){
  var k=Math.floor((prev-base)/12), best=base+12*k, dist=Math.abs(best-prev), cand,d;
  for(var j=k-1;j<=k+2;j++){
    cand=base+12*j; d=Math.abs(cand-prev);
    if(d<dist || (d===dist && cand<best)){best=cand;dist=d;}
  }
  return best;
}
function dedupeLost(lost,code){ if(code && lost.indexOf(code)<0) lost.push(code); }
function midiForPc(pc,key,track){
  var tonic=LopdaSong.tonic(track,key), best=null,dist=Infinity,m;
  for(m=tonic-12;m<=tonic+12;m++) if(mod(m,12)===pc){
    var d=Math.abs(m-tonic);
    if(d<dist || (d===dist && m<best)){best=m;dist=d;}
  }
  return best;
}

function toSong(input,now){
  var checked=check(input);
  if(checked.error) return checked;
  var score=checked.score,pc=keyPc(score.key,score.capo), mode=keyMode(score.key), songKey, song, lost=[],patterns=[],lastChords=null,i,j,k,bar,active,previousMidi=null,priorBarMidi=null,melodyPitches=[],barPitches,barLost,barChords,decoded,firstBeat,tokens,cursor,token,midi,pitch,cc,rootPc,keyObj,src,styles,groove,step,drum,notes,barData,signature,patternAt,hasMelody,chain=[];
  if(pc===null) return {error:"key"};
  songKey=pc; keyObj={pc:pc,name:score.key};
  song=LopdaSong.newSong(typeof now==="number"&&isFinite(now)&&now>=0?now:0);
  song.name=Array.from(score.title||"读谱磁带").slice(0,LopdaSong.NAME_MAX).join("");
  song.key=songKey; song.scale=mode; song.bpm=score.bpm===null?80:LopdaSong.clampBpm(score.bpm);
  song.swing=0.5; song.tape=2; song.kit="soft";
  song.tracks[2].voice="guitar"; song.tracks[3].voice="flute";
  song.patterns=[]; song.song=[];
  styles=window.LopdaStudioStyles;
  groove=styles&&styles.GROOVES&&styles.GROOVES["pop-a"];
  if(!groove) return {error:"song"};
  for(i=0;i<score.bars.length;i++){
    bar=score.bars[i]; barChords=[]; barLost=[]; barPitches=[];
    if(bar.chords.length){
      for(j=0;j<bar.chords.length;j++){
        cc=chord(bar.chords[j],keyObj);
        if(cc.error) return {error:"chord",at:{bar:i}};
        dedupeLost(barLost,cc.lost); barChords.push(cc);
      }
      lastChords=barChords;
    } else if(lastChords) barChords=[lastChords[lastChords.length-1]];
    notes={drums:[],bass:[],chords:[],melody:[]};
    for(j=0;j<barChords.length;j++){
      cc=barChords[j]; step=barChords.length===2?j*8:0;
      var chordNote={t:step*LopdaSong.STEP,len:1,deg:cc.deg,q:cc.q,vel:0.6};
      if(cc.acc) chordNote.acc=cc.acc;
      notes.chords.push(chordNote);
      rootPc=cc.bassPc===undefined?mod(pc+SCALE[mode][cc.deg]+cc.acc,12):cc.bassPc;
      midi=midiForPc(rootPc,pc,"bass"); pitch=degreeFor({key:pc,scale:mode},"bass",midi);
      if(!pitch) return {error:"song"};
      var bassNote={t:step*LopdaSong.STEP,len:1,deg:pitch.deg,vel:0.85}, bassNote2={t:(step+6)*LopdaSong.STEP,len:1,deg:pitch.deg,vel:0.6};
      if(pitch.acc){bassNote.acc=pitch.acc;bassNote2.acc=pitch.acc;}
      notes.bass.push(bassNote);
      notes.bass.push(bassNote2);
    }
    active=null;
    firstBeat=parseBeat(bar.beats[0]);
    if(firstBeat.length===1 && firstBeat[0].hold && priorBarMidi!==null){
      notes.melody.push({t:0,len:1,deg:0,vel:LopdaSong.NOTE_VEL,_midi:priorBarMidi});
      active={midi:priorBarMidi,tie:false}; previousMidi=priorBarMidi;
    }
    for(j=0;j<4;j++){
      decoded=parseBeat(bar.beats[j]);
      if(decoded.error) return {error:decoded.error,at:{bar:i,beat:j}};
      tokens=decoded; cursor=j*4;
      for(k=0;k<tokens.length;k++){
        token=tokens[k];
        if(token.hold){cursor+=4;continue;}
        if(token.deg===0){
          notes.melody.push({t:cursor*LopdaSong.STEP,len:1,deg:0,vel:LopdaSong.REST_VEL});
          active=null; cursor+=token.len16; continue;
        }
        midi=LopdaSong.tonic("melody",pc)+SCALE[mode][token.deg-1]+12*token.oct+token.acc;
        if(token.oct===0 && previousMidi!==null){
          midi=nearestMidi(LopdaSong.tonic("melody",pc)+SCALE[mode][token.deg-1]+token.acc,previousMidi);
        }
        if(!(active && active.tie && active.midi===midi)){
          notes.melody.push({t:cursor*LopdaSong.STEP,len:1,deg:0,vel:LopdaSong.NOTE_VEL});
          active={midi:midi,tie:token.tie};
          barPitches.push(midi);
        } else active.tie=token.tie;
        previousMidi=midi;
        /* The temporary pitch is converted after the song-wide octave choice. */
        notes.melody[notes.melody.length-1]._midi=midi;
        cursor+=token.len16;
      }
    }
    priorBarMidi=active?active.midi:null;
    hasMelody=false;
    for(j=0;j<notes.melody.length;j++) if(notes.melody[j].vel!==LopdaSong.REST_VEL){hasMelody=true;break;}
    if(barChords.length || hasMelody){
      for(j=0;j<LopdaSong.DRUMS.length;j++){
        drum=LopdaSong.DRUMS[j]; src=groove.steps[drum]||[];
        for(k=0;k<src.length;k++) notes.drums.push({t:src[k][0]*LopdaSong.STEP,len:LopdaSong.STEP,key:drum,vel:src[k][1]});
      }
      notes.drums.sort(function(a,b){return a.t-b.t||LopdaSong.DRUMS.indexOf(a.key)-LopdaSong.DRUMS.indexOf(b.key);});
    }
    tie(notes.chords,16*LopdaSong.STEP); tie(notes.bass,16*LopdaSong.STEP); tie(notes.melody,16*LopdaSong.STEP);
    barData={len:16,notes:notes};
    signature=JSON.stringify(notes); patternAt=-1;
    for(j=0;j<patterns.length;j++) if(JSON.stringify(patterns[j].notes)===signature){patternAt=j;break;}
    if(chain.length>=LopdaSong.SONG_MAX || (patternAt<0 && patterns.length>=LopdaSong.PATTERNS_MAX)){
      dedupeLost(lost,"bars:"+(i+1)); break;
    }
    if(patternAt<0){patternAt=patterns.length;patterns.push(barData);}
    chain.push(patternAt);
    for(j=0;j<barPitches.length;j++) melodyPitches.push(barPitches[j]);
    for(j=0;j<barLost.length;j++) dedupeLost(lost,barLost[j]);
  }
  if(!chain.length) return {error:"song"};
  var mean=melodyPitches.length?melodyPitches.reduce(function(a,b){return a+b;},0)/melodyPitches.length:60,shift=mean<60?12:0;
  for(i=0;i<patterns.length;i++){
    notes=patterns[i].notes;
    for(j=0;j<notes.melody.length;j++){
      src=notes.melody[j];
      if(src.vel===LopdaSong.REST_VEL){delete src._midi;continue;}
      pitch=degreeFor({key:pc,scale:mode},"melody",src._midi+shift);
      if(!pitch) return {error:"song"};
      src.deg=pitch.deg; if(pitch.acc) src.acc=pitch.acc; delete src._midi;
    }
  }
  song.patterns=patterns;
  song.song=chain;
  var valid=LopdaSong.validate(song);
  if(valid.error) return {error:"song"};
  return {song:valid.song,lost:lost};
}

window.LopdaScore={check:check,parseBeat:parseBeat,keyPc:keyPc,chord:chord,toSong:toSong,degreeFor:degreeFor};
})();
