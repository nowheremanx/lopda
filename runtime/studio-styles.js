/*
 * Lo-PDA runtime: the tape machine's style cards, original drum patterns and bass rhythms (docs/design/studio.md
 * section 12.19.2). A card names a mood, not a song: the AI draws one before it plans a tape, and roll() is the only
 * place the dice are thrown, so a skeleton can differ from the last one without asking the model for variety.
 *
 *   LopdaStudioStyles.roll(rand) -> {card, key, scale, bpm, swing, tape, kit, grooves, bass, form}
 *   LopdaStudioStyles.seeded(n)  -> a small deterministic rand() for tests and the trial tool
 *
 * Every groove is 0-based 16 steps with a velocity per hit; every bass rhythm is one bar of [step, velocity, move].
 * The material is original, so no name here is a real song, artist, game or brand. No DOM, no LP: Node tests run it.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

/* Energy 0/1/2 is derived by studio-tools.js: these are the shapes at full energy. Ghosts sit near 0.2 and accents
   near 0.9 so a run of steps reads as a player, not a machine. */
var GROOVES={
  "lofi-a":{steps:{
    kick:[[0,0.9],[6,0.7],[10,0.85]],
    snare:[[4,0.9],[12,0.9],[7,0.2]],
    hat:[[0,0.45],[2,0.3],[4,0.4],[6,0.3],[8,0.45],[10,0.3],[12,0.4],[14,0.3]],
    perc:[[15,0.25]]}},
  "lofi-b":{steps:{
    kick:[[0,0.92],[3,0.6],[10,0.85]],
    snare:[[4,0.9],[12,0.9],[14,0.2]],
    hat:[[0,0.42],[2,0.28],[4,0.38],[6,0.28],[8,0.42],[10,0.28],[11,0.2],[12,0.38],[14,0.28]],
    perc:[[15,0.3]]}},
  "pop-a":{steps:{
    kick:[[0,0.95],[6,0.8]],
    snare:[[4,0.95],[12,0.95],[15,0.2]],
    hat:[[0,0.45],[2,0.32],[4,0.42],[6,0.32],[8,0.45],[10,0.32],[12,0.42],[14,0.32]],
    perc:[[7,0.22]]}},
  "pop-b":{steps:{
    kick:[[0,0.95],[6,0.8],[8,0.7]],
    snare:[[4,0.95],[12,0.95],[10,0.2]],
    hat:[[0,0.45],[1,0.3],[2,0.4],[3,0.3],[4,0.42],[5,0.3],[6,0.4],[7,0.3],
         [8,0.45],[9,0.3],[10,0.4],[11,0.3],[12,0.42],[13,0.3],[14,0.4],[15,0.3]],
    perc:[[7,0.25],[15,0.3]]}},
  "soul-a":{steps:{
    kick:[[0,0.9],[3,0.65],[10,0.85]],
    snare:[[4,0.88],[12,0.88],[9,0.2]],
    hat:[[0,0.4],[2,0.25],[4,0.35],[5,0.2],[6,0.3],[8,0.4],[10,0.25],[12,0.35],[14,0.3]],
    perc:[[7,0.2],[15,0.25]]}},
  "soul-b":{steps:{
    kick:[[0,0.9],[7,0.6],[11,0.85]],
    snare:[[4,0.9],[12,0.9],[9,0.2]],
    hat:[[0,0.36],[2,0.22],[4,0.32],[6,0.24],[8,0.36],[10,0.22],[12,0.32],[14,0.24]],
    perc:[[3,0.2],[15,0.3]]}},
  "boom-a":{steps:{
    kick:[[0,1],[7,0.7],[10,0.9]],
    snare:[[4,0.95],[12,0.95],[14,0.2]],
    hat:[[0,0.5],[2,0.35],[4,0.45],[6,0.35],[8,0.5],[10,0.35],[12,0.45],[14,0.35]],
    perc:[[15,0.4]]}},
  "boom-b":{steps:{
    kick:[[0,1],[3,0.6],[8,0.75]],
    snare:[[4,0.95],[12,0.95],[15,0.22]],
    hat:[[0,0.45],[2,0.3],[4,0.4],[6,0.3],[8,0.45],[10,0.3],[12,0.4],[14,0.3]],
    perc:[[11,0.2]]}},
  "bossa-a":{steps:{
    kick:[[0,0.8],[6,0.6],[8,0.75]],
    snare:[[4,0.55],[12,0.6],[14,0.2]],
    hat:[[0,0.3],[2,0.22],[4,0.3],[6,0.22],[8,0.3],[10,0.22],[12,0.3],[14,0.22]],
    perc:[[3,0.35],[7,0.3],[11,0.35],[15,0.3]]}},
  "march-a":{steps:{
    kick:[[0,0.95],[4,0.8],[8,0.95],[12,0.8]],
    snare:[[2,0.4],[4,0.9],[6,0.4],[10,0.22],[12,0.9],[14,0.4]],
    hat:[[0,0.4],[4,0.35],[8,0.4],[12,0.35]],
    perc:[[15,0.5]]}},
  /* the train beat: the snare (played soft, like brushes) runs straight eighths with the backbeat on top, the kick on 1
     and 3. Room is left for the bass's root-fifth "boom" under it. */
  "train-a":{steps:{
    kick:[[0,0.9],[8,0.85]],
    snare:[[0,0.25],[2,0.35],[4,0.85],[6,0.35],[8,0.25],[10,0.35],[12,0.85],[14,0.35]],
    hat:[[4,0.25],[12,0.25]],
    perc:[]}},
  "train-b":{steps:{
    kick:[[0,0.9],[6,0.45],[8,0.85]],
    snare:[[1,0.2],[2,0.4],[3,0.2],[4,0.85],[5,0.2],[6,0.4],[7,0.2],[9,0.2],[10,0.4],[11,0.2],[12,0.85],[13,0.2],[14,0.4],[15,0.2]],
    hat:[],
    perc:[[15,0.3]]}},
  "chip-a":{steps:{
    kick:[[0,1],[8,1]],
    snare:[[4,0.95],[12,0.95],[10,0.2]],
    hat:[[0,0.5],[1,0.3],[2,0.45],[3,0.3],[4,0.5],[5,0.3],[6,0.45],[7,0.3],
         [8,0.5],[9,0.3],[10,0.45],[11,0.3],[12,0.5],[13,0.3],[14,0.45],[15,0.3]],
    perc:[[15,0.35]]}},
  "chip-b":{steps:{
    kick:[[0,1],[4,0.8],[8,1],[12,0.8]],
    snare:[[4,0.95],[10,0.2],[12,0.95],[14,0.3]],
    hat:[[0,0.5],[1,0.35],[2,0.45],[3,0.35],[4,0.5],[5,0.35],[6,0.45],[7,0.35],
         [8,0.5],[9,0.35],[10,0.45],[11,0.35],[12,0.5],[13,0.35],[14,0.45],[15,0.35]],
    perc:[[2,0.3],[6,0.3],[10,0.3],[14,0.3]]}}
};

/* A bass rhythm says what each note does against the chord under it: stay on the root, move to the fifth or the octave,
   or lean into the next chord. The tool turns a move into a grid degree. */
var BASS={
  whole:[[0,0.9,"root"]],
  half:[[0,0.85,"root"],[8,0.8,"root"]],
  pulse:[[0,0.82,"root"],[4,0.7,"root"],[8,0.82,"root"],[12,0.7,"root"]],
  eighths:[[0,0.85,"root"],[2,0.6,"root"],[4,0.7,"fifth"],[6,0.6,"root"],
           [8,0.85,"root"],[10,0.6,"root"],[12,0.7,"fifth"],[14,0.6,"root"]],
  octaves:[[0,0.85,"root"],[4,0.7,"octave"],[8,0.8,"root"],[12,0.7,"octave"]],
  walk:[[0,0.85,"root"],[4,0.7,"fifth"],[8,0.75,"octave"],[12,0.65,"approach"]],
  boom:[[0,0.9,"root"],[8,0.8,"fifth"]],
  /* broken chords for keyboard-like and classical pieces: the left hand of a sonatina, a rising arpeggio */
  alberti:[[0,0.8,"root"],[2,0.55,"fifth"],[4,0.65,"third"],[6,0.55,"fifth"],[8,0.75,"root"],[10,0.55,"fifth"],[12,0.65,"third"],[14,0.55,"fifth"]],
  arpeggio:[[0,0.8,"root"],[4,0.65,"third"],[8,0.7,"fifth"],[12,0.65,"octave"]],
  "boom-walk":[[0,0.9,"root"],[4,0.65,"fifth"],[8,0.85,"root"],[12,0.65,"approach"]],
  syncopated:[[0,0.85,"root"],[3,0.6,"root"],[6,0.7,"fifth"],[8,0.8,"root"],[11,0.6,"octave"],[14,0.65,"approach"]]
};

var FORMS={
  pop:{order:["intro","verse","chorus","verse","chorus","outro"]},
  lofi:{order:["intro","verse","verse","chorus","bridge","chorus","outro"]},
  arcade:{order:["intro","verse","chorus","verse","chorus","outro"]},
  ballad:{order:["intro","verse","chorus","bridge","chorus","outro"]}
};

/* Cards describe a mood, not a track: the model may change the name and tempo, but the card decides key material,
   swing, tape, kit and the palette of grooves and bass rhythms. */
var CARDS=[
  {id:"rainy-lofi", zh:"雨夜", en:"Rainy lofi", bpm:[80,92], scales:["minor","dorian"],
   swing:[0.56,0.66], tape:[2,4], kit:"soft", grooves:["lofi-a","lofi-b"], bass:["whole","half","walk"], form:"lofi"},
  {id:"sunny-pop", zh:"晴天", en:"Sunny pop", bpm:[96,120], scales:["major"],
   swing:[0.5,0.56], tape:[0,2], kit:"soft", grooves:["pop-a","pop-b"], bass:["eighths","pulse","octaves"], form:"pop"},
  {id:"city-neo", zh:"城市夜行", en:"City nights", bpm:[86,100], scales:["dorian","minor"],
   swing:[0.58,0.68], tape:[1,3], kit:"soft", grooves:["soul-a","soul-b"], bass:["walk","syncopated","pulse"], form:"lofi"},
  {id:"old-boom", zh:"旧唱片", en:"Old record", bpm:[86,98], scales:["minor","dorian"],
   swing:[0.54,0.62], tape:[2,4], kit:"soft", grooves:["boom-a","boom-b"], bass:["half","walk"], form:"lofi"},
  {id:"coast-bossa", zh:"海边", en:"Seaside", bpm:[96,112], scales:["major","dorian"],
   swing:[0.5,0.56], tape:[0,2], kit:"soft", grooves:["bossa-a"], bass:["half","syncopated"], form:"pop"},
  {id:"march-band", zh:"进行曲", en:"March", bpm:[100,124], scales:["major"],
   swing:[0.5,0.5], tape:[0,2], kit:"soft", grooves:["march-a"], bass:["whole","half"], form:"pop"},
  {id:"arcade-chip", zh:"游戏厅", en:"Arcade", bpm:[112,140], scales:["major","minor"],
   swing:[0.5,0.56], tape:[0,2], kit:"chip", grooves:["chip-a","chip-b"], bass:["eighths","octaves"], form:"arcade"},
  {id:"slow-rock", zh:"慢摇", en:"Slow rock", bpm:[78,92], scales:["minor","dorian"],
   swing:[0.52,0.6], tape:[1,3], kit:"soft", grooves:["boom-a","lofi-b"], bass:["whole","pulse"], form:"ballad"},
  {id:"dawn-folk", zh:"清晨民谣", en:"Dawn folk", bpm:[96,116], scales:["major","dorian"],
   swing:[0.5,0.56], tape:[0,2], kit:"soft", grooves:["pop-a","bossa-a"], bass:["half","walk"], form:"pop"},
  {id:"blue-ballad", zh:"蓝调叙事", en:"Blue tale", bpm:[70,84], scales:["minor","dorian"],
   swing:[0.54,0.64], tape:[2,4], kit:"soft", grooves:["lofi-a","soul-b"], bass:["whole","half","walk"], form:"ballad"},
  {id:"dusty-hop", zh:"尘声节拍", en:"Dusty beat", bpm:[88,100], scales:["minor","dorian"],
   swing:[0.54,0.62], tape:[2,4], kit:"soft", grooves:["boom-b","lofi-b"], bass:["syncopated","walk"], form:"lofi"},
  {id:"night-drive", zh:"夜路", en:"Night drive", bpm:[100,120], scales:["minor","dorian"],
   swing:[0.5,0.58], tape:[1,3], kit:"soft", grooves:["soul-a","pop-b"], bass:["eighths","octaves"], form:"pop"},
  {id:"soft-jazz", zh:"软爵士", en:"Soft jazz", bpm:[84,104], scales:["dorian","major"],
   swing:[0.6,0.7], tape:[1,3], kit:"soft", grooves:["soul-b","bossa-a"], bass:["walk","syncopated"], form:"lofi"},
  {id:"warm-soul", zh:"暖灵魂", en:"Warm soul", bpm:[84,98], scales:["dorian","minor"],
   swing:[0.58,0.68], tape:[1,3], kit:"soft", grooves:["soul-a","boom-a"], bass:["pulse","syncopated"], form:"ballad"},
  {id:"glass-dream", zh:"玻璃梦", en:"Glass dream", bpm:[78,92], scales:["major","dorian"],
   swing:[0.5,0.58], tape:[0,2], kit:"soft", grooves:["bossa-a","lofi-a"], bass:["whole","half"], form:"ballad"},
  {id:"train-beat", zh:"火车节奏", en:"Train beat", bpm:[100,124], scales:["major"],
   swing:[0.5,0.54], tape:[1,3], kit:"soft", grooves:["train-a","train-b"], bass:["boom","boom-walk"], form:"pop"},
  {id:"dust-road", zh:"尘土路", en:"Dust road", bpm:[92,112], scales:["minor","major"],
   swing:[0.5,0.56], tape:[2,4], kit:"soft", grooves:["train-a","march-a"], bass:["boom","half"], form:"ballad"},
  {id:"toy-box", zh:"玩具盒", en:"Toy box", bpm:[108,132], scales:["major","minor"],
   swing:[0.5,0.54], tape:[0,1], kit:"chip", grooves:["chip-b","chip-a"], bass:["octaves","eighths"], form:"arcade"}
];

function pick(rand,list){
  var i=Math.floor(rand()*list.length);
  if(i<0) i=0;
  if(i>=list.length) i=list.length-1;
  return list[i];
}

/* Two different entries when the card offers two; a one-entry palette repeats it so the result always has two. */
function two(rand,list){
  var a=Math.floor(rand()*list.length);
  if(a<0) a=0;
  if(a>=list.length) a=list.length-1;
  if(list.length<2) return [list[a],list[a]];
  var b=Math.floor(rand()*(list.length-1));
  if(b<0) b=0;
  if(b>=a) b++;
  return [list[a],list[b]];
}

function evenBpm(rand,lo,hi){
  if(lo%2) lo++;
  if(hi%2) hi--;
  if(hi<lo) hi=lo;
  var n=Math.floor((hi-lo)/2)+1;
  return lo+2*Math.floor(rand()*n);
}

function roll(rand){
  return rollCard(rand,pick(rand,CARDS));
}

/* one card's dice: the key and the details inside its ranges */
function rollCard(rand,card){
  var key=Math.floor(rand()*12);
  if(key<0) key=0;
  if(key>11) key=11;
  var lo=card.swing[0]+rand()*(card.swing[1]-card.swing[0]);
  var tape=card.tape[0]+Math.floor(rand()*(card.tape[1]-card.tape[0]+1));
  if(tape>card.tape[1]) tape=card.tape[1];
  return {
    card:card,
    key:key,
    scale:pick(rand,card.scales),
    bpm:evenBpm(rand,card.bpm[0],card.bpm[1]),
    swing:Math.round(lo*100)/100,
    tape:tape,
    kit:card.kit,
    grooves:two(rand,card.grooves),
    bass:two(rand,card.bass),
    form:card.form
  };
}

/* mulberry32: a tiny deterministic generator, so a trial run can be replayed and the tests are not flaky. */
function seeded(n){
  var a=(n>>>0)||1;
  return function(){
    a=(a+0x6D2B79F5)>>>0;
    var t=a;
    t=Math.imul(t^(t>>>15),1|t);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

window.LopdaStudioStyles={CARDS:CARDS, GROOVES:GROOVES, BASS:BASS, FORMS:FORMS, roll:roll, rollCard:rollCard, seeded:seeded};
})();
