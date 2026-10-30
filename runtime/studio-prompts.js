/*
 * Lo-PDA runtime: the words the tape machine's AI harness sends (docs/design/studio.md section 12.19). One short system
 * prompt per step, each asking for one small, strictly shaped JSON object, so a fast, small model can answer it; the
 * harness checks every answer and sends a rejected one back with the reason. Kept apart from the harness so the wording
 * can be tuned (tools/studio-ai-trial.mjs) without touching the logic.
 *
 *   LopdaStudioPrompts.plan(o)    -> messages   o: {text, cards:[{name, keyName, scale, bpm:[lo,hi], grooves, bass, form}], allGrooves, allBass}
 *   LopdaStudioPrompts.melody(o)  -> messages   o: {text, card, keyName, scale, bpm, section, place, bars:[{chord, tones}], before}
 *   LopdaStudioPrompts.listen(o)  -> messages   o: {text, overview}
 *   LopdaStudioPrompts.edit(o)    -> messages   o: {text, overview, focus}
 *   LopdaStudioPrompts.reject(reason) -> the user turn that sends a rejected answer back
 *
 * Every system prompt starts with "TAPE4 STEP: <name>", which the tests' fake model reads to know what to answer.
 * The prompts are English (models follow it best); the one sentence for the user is asked in the user's language.
 *
 * Copyright (c) 2026 Haowei Wu. MIT License, see LICENSE.
 */
(function(){
"use strict";

var JSON_ONLY="Answer with exactly ONE JSON object and nothing else: no markdown, no code fence, no words before or after it.";

/* The machine's limits, said once in every step that can touch them, so the model never proposes what cannot be played. */
var MACHINE=[
"Tape4 is a fictional 1986 four-track tape machine: drums, bass, chords, melody. One pattern is one 4/4 bar of 16 steps",
"(step 0 is the downbeat, 4 is beat 2, 8 is beat 3, 12 is beat 4). Patterns are A-P (0-15); the song is a chain of up to",
"96 patterns. Tempo 60-140 BPM, swing is global, no 3/4 or 6/8 yet, no tempo or key change inside a song.",
"Every sound is synthesised, 1986-style: kits soft, chip, rock, electro; bass voices bass (synth), pick (picked), sub",
"(808); chord voices keys (electric piano), guitar (strummed), piano, organ, strings; melody voices flute, square (8-bit",
"lead), pluck (zither or lute-like), reed (harmonica or accordion-like), bowed (erhu or violin-like). A style is made from",
"these sounds, rhythm and harmony: it will sound like the style, played on this machine.",
"Chords may be any type: maj m 7 maj7 m7 9 m9 6 m6 add9 sus2 sus4 dim dim7 aug m7b5 5 (power), on a root that is a",
"scale degree 0-5, optionally shifted a semitone (acc). Melody notes may leave the scale by a semitone (acc) and may",
"carry an ornament: slide (up into the note) or vib (vibrato)."
].join("\n");

function lang(text){
  return /[㐀-鿿]/.test(String(text||"")) ? "Chinese" : "English";
}
function msgs(step,system,user){
  return [{role:"system",content:"TAPE4 STEP: "+step+"\n"+system},{role:"user",content:user}];
}
function list(a){ return (a||[]).join(", "); }

/* Step 2 of a new song: the shape only. Drums, chords and bass are laid by local tools from these choices, so the model
   writes about two hundred tokens instead of a whole song. */
function plan(o){
  var system=[
MACHINE,
"",
"You plan a new song for it: the sound (kit and a voice per track), the sections, one chord per bar, and the drums,",
"bass rhythm and chord strum of each section. The machine lays the drums, chords and bass itself; melodies come in a",
"later step. Style cards are offered as inspiration (card 1 is the machine's random pick, used for a vague request).",
"You may learn a style's rhythm, harmony and sound; never copy a real song's melody, lyrics or title.",
"",
JSON_ONLY,
"Shape:",
'{"card":1,"name":"short title","bpm":84,"key":9,"scale":"minor","swing":0.55,"kit":"soft",',
' "voices":{"bass":"bass","chords":"keys","melody":"flute"},',
' "sections":[{"id":"verse","chords":[0,5,{"root":3,"q":"m7"},{"root":4,"q":"sus4"}],"groove":"<groove id>","energy":1,',
'   "bass":"<bass id>","strum":"hold","melody":true}, ...],',
' "order":[["intro",1],["verse",2],["chorus",2], ...]}',
"",
"Rules:",
"- card: a card number. If the request names no mood, style or tempo (just \"a song\", \"a skeleton\", \"来个骨架\"),",
"  take card 1. If it names a mood, a genre or an artist's style, take the card whose rhythm fits it best (an artist is",
"  only a hint for the feel: never use their songs, titles or melodies).",
"- key (0-11, C=0), scale (major, minor, dorian, major-penta, minor-penta), swing (0.5-0.75), kit and voices: optional;",
"  left out, the card's are kept. Choose them when the style needs it (a Chinese-style ballad: pentatonic, pluck or bowed",
"  lead, piano; a boy-band ballad: minor, strings and square or flute, electro kit; rock: rock kit, guitar, power chords).",
"- chords: one per bar, either a degree 0-5 (the machine voices it as a rich seventh or ninth) or",
"  {\"root\":0-5,\"q\":\"<type>\",\"acc\":-1 or 1} for a chosen type or a borrowed chord (in major, bVII is",
"  {\"root\":5,\"acc\":1,\"q\":\"maj\"}). Plain pop wants maj and m triads, jazz and R&B sevenths and ninths, rock 5 (power).",
"- groove: a groove id (any, not only the card's). Only if none fits the style, leave groove out and write one bar",
"  yourself: \"drums\":{\"kick\":[[0,0.9],[8,0.85]],\"snare\":[[4,0.9],[12,0.9]],\"hat\":[[0,0.4],[2,0.3],...],\"perc\":[]}.",
"- bass: a bass rhythm id (boom = root on beat 1, fifth on beat 3; walk and boom-walk move each beat), or one bar of",
"  your own: [[step, velocity, move], ...] with move root, fifth, third, octave or approach (the note below the next chord).",
"- strum: hold (the chord rings all bar, the default), stabs (short chords on beats 2 and 4, a guitar's chick against",
"  the bass's boom: country, ska, rock and roll), pulse (a short chord on every beat).",
"- bpm: inside the card's range unless the request asks for faster or slower. scale: major, minor or dorian; keep the",
"  card's scale unless the request's mood needs another (sad, rainy, night: minor or dorian; bright, sunny: major).",
"- section id: one of intro, verse, pre, chorus, bridge, outro; each used once in sections and at least once in order.",
"- chords: 1-4 numbers, one per bar; each is a chord root 0-5 of the key's seven-note scale (0=I, 1=ii, 2=iii, 3=IV, 4=V, 5=vi in major; in minor 0=i, 2=III, 3=iv, 4=v, 5=VI).",
"- Each section takes as many patterns as it has chords; all sections together use at most 16 patterns.",
"- order: [section id, repeats 1-4]. The song plays each section's bars that many times, in this order.",
"- The whole song must last 100-200 seconds (aim for about 150): seconds = total bars * 240 / bpm.",
"- energy: 0 calm, 1 normal, 2 full. melody: false for intro and outro, usually true for verse and chorus.",
"- Make the chorus different from the verse: other chords or another order, more energy.",
"- name: in "+lang(o.text)+", at most 24 characters, original (never a real song's title)."
  ].join("\n");
  var cards=[], i, c;
  for(i=0;i<o.cards.length;i++){
    c=o.cards[i];
    cards.push("CARD "+(i+1)+": "+c.name+". Key "+c.keyName+" "+c.scale+", "+c.bpm[0]+"-"+c.bpm[1]+" BPM. Grooves "+list(c.grooves)+
      "; bass "+list(c.bass)+(c.form ? "; form "+c.form : "")+".");
  }
  var user=[
cards.join("\n"),
"Every groove: "+list(o.allGrooves)+". Every bass rhythm: "+list(o.allBass)+".",
"",
"REQUEST: "+(o.text||"a new song")
  ].join("\n");
  return msgs("plan",system,user);
}

/* Step 4, once per section with a melody: one bar per chord, the chord tones given as degrees so the model need not do
   music theory in its head. */
function melody(o){
  var system=[
MACHINE,
"",
"You write the melody of one section. Notes are scale degrees of the key: 0 is the tonic, 1 the next scale note, one",
"octave up is the scale's length (7, or 5 for a pentatonic scale), -1 the scale note below the tonic. A note rings until",
"the next note; a velocity 0 note is a rest. A 4th value 1 or -1 raises or lowers the note a semitone (a blue note, a",
"passing tone, a borrowed chord's tone); a 5th value \"slide\" or \"vib\" adds an ornament (use them like a singer would).",
"",
JSON_ONLY,
'Shape: {"bars":[[[step,degree,velocity], [step,degree,velocity,acc,ornament], ...], ...]}  one inner list per bar.',
"",
"Rules:",
"- Exactly the number of bars asked. 2-8 notes per bar is typical, at most 12. Steps 0-15, rising, no step twice.",
"- Degrees -3..10. Velocity 0.5-1 (accent the first note of a phrase); a rest is velocity 0.",
"- On beats (steps 0, 4, 8, 12) prefer the chord tones given for that bar (\"6#\" means degree 6 with acc 1); between",
"  them, step through the scale.",
"- Write a singable phrase: a short motif, repeated with a change; leave some space; end the last bar on a chord tone.",
"- Do not make every bar the same."
  ].join("\n");
  var bars=[], i;
  for(i=0;i<o.bars.length;i++) bars.push("bar "+(i+1)+": chord "+o.bars[i].chord+", chord tones "+list(o.bars[i].tones));
  var user=[
"STYLE CARD: "+o.card+". Key: "+o.keyName+" "+o.scale+", "+o.bpm+" BPM.",
"SECTION: "+o.section+" ("+o.place+"), "+o.bars.length+" bar"+(o.bars.length>1?"s":"")+":",
bars.join("\n"),
o.before ? "\nMelodies already written (make this one contrast with them, e.g. higher or more rhythmic for a chorus):\n"+o.before : "",
"",
"REQUEST: "+(o.text||"a new song")
  ].join("\n");
  return msgs("melody",system,user);
}

/* the tools the model may call, one line each; shared by the listen and edit steps */
var TOOLS=[
'{"tool":"groove","pattern":0,"style":"<groove id>","energy":1,"fill":false}   lay the drums of a pattern',
'{"tool":"ghost","pattern":0,"amount":2}                ghost snare notes (1-4)',
'{"tool":"fill","pattern":3}                            a snare fill on the last beat',
'{"tool":"chords","pattern":0,"roots":[0,{"root":5,"q":"m7"}],"rhythm":"hold"}   1-4 chords (rhythm: hold, stabs, pulse)',
'{"tool":"bass","pattern":0,"rhythm":"<bass id>"}       the bass from that pattern\'s chords (or "steps":[[0,0.9,"root"],...])',
'{"tool":"melody","pattern":0,"notes":[[0,4,0.8],[4,2,0.7,1,"slide"]]}   replace a pattern\'s melody ([step,deg,vel,acc,orn])',
'{"tool":"copy","from":0,"to":5,"change":"same"}        change: same, sparse, no-melody, lift',
'{"tool":"mix","track":"bass","vol":0.8,"mute":false}  track: drums, bass, chords, melody',
'{"tool":"ops","ops":[{"op":"setDrum","pattern":0,"drum":"snare","step":4,"on":true,"vel":0.9}]}   single notes:',
'   setDrum {pattern,drum (kick snare hat perc),step,on,vel}, setNote {pattern,track (bass chords melody),step,deg,vel},',
'   removeNote {pattern,track,step}, clearTrack {pattern,track},',
'   setNoteExtra {pattern,track,step,acc,gate,orn,q} (null removes one; gate 0.25-1 shortens a note)'
];
var EDIT_ONLY=[
'{"tool":"read","pattern":4}                            see every note of a pattern (answered next turn)',
'{"tool":"set","bpm":96,"key":9,"scale":"minor","swing":0.6,"tape":2,"kit":"soft","name":"...",',
'  "voices":{"chords":"guitar"}}                        any of these; voices as listed above',
'{"tool":"chain","song":[0,0,1,1,2,3]}                  replace the whole song chain'
];

/* Step 5 of a new song: one look at the whole thing, a few touches, and the sentence the user reads. */
function listen(o){
  var system=[
MACHINE,
"",
"The machine has just written a new song (summary below). Listen back as a producer: add at most 8 small touches",
"that make it feel played by people, such as a fill before a chorus, ghost notes, a sparser intro. Do not rewrite it.",
"",
JSON_ONLY,
'Shape: {"reply":"one or two sentences for the user","calls":[ ...0-8 tool calls... ]}',
"The reply is in "+lang(o.text)+", at most 120 characters, like a friend telling what the song feels like and how it",
"moves (calm intro, a fuller chorus...). Never mention pattern letters, step numbers, degrees, swing values or tool names.",
"",
"Tools:",
TOOLS.join("\n")
  ].join("\n");
  return msgs("listen",system,"SONG\n"+o.overview+"\n\nTHE USER ASKED: "+(o.text||"a new song"));
}

/* the edit loop's first turn; later turns are the tool results the harness appends */
function edit(o){
  var system=[
MACHINE,
"",
"You change the user's song with tools. The summary below lists every pattern in use; read a pattern before you change",
"its notes. Make the smallest change that answers the request and keep what already works. If the machine cannot do",
"what is asked (see the limits above), change nothing and say why.",
"",
JSON_ONLY,
'Each turn: {"calls":[...],"done":false}  and you get each call\'s result back.',
'When finished: {"reply":"one sentence for the user","calls":[...last calls, may be empty...],"done":true}',
"The reply is in "+lang(o.text)+", at most 120 characters. At most 5 turns.",
"",
"Tools:",
EDIT_ONLY.concat(TOOLS).join("\n")
  ].join("\n");
  var f=o.focus;
  var where=f ? "\nThe user is looking at pattern "+"ABCDEFGHIJKLMNOP".charAt(f.pattern||0)+" ("+(f.pattern||0)+") on the "+(f.screen||"main")+" screen." : "";
  return msgs("edit",system,"SONG\n"+o.overview+where+"\n\nREQUEST: "+(o.text||""));
}

function reject(reason){
  return "That JSON was rejected: "+reason+". Reply with the corrected JSON only.";
}

window.LopdaStudioPrompts={plan:plan, melody:melody, listen:listen, edit:edit, reject:reject, lang:lang};
})();
