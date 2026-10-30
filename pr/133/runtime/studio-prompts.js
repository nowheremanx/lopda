/*
 * Lo-PDA runtime: the words the tape machine's AI harness sends (docs/design/studio.md section 12.19). One short system
 * prompt per step, each asking for one small, strictly shaped JSON object, so a fast, small model can answer it; the
 * harness checks every answer and sends a rejected one back with the reason. Kept apart from the harness so the wording
 * can be tuned (tools/studio-ai-trial.mjs) without touching the logic.
 *
 *   LopdaStudioPrompts.plan(o)    -> messages   o: {text, card, keyName, scale, bpm:[lo,hi], grooves, bass, form, minutes}
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
"96 patterns. Tempo 60-140 BPM, swing is global, no 3/4, no tempo or key change, no new instruments."
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
"You plan a new song for it. You choose the sections, one chord per bar, and which local drum groove and bass rhythm",
"each section uses. The machine lays the drums, chords and bass itself; melodies come in a later step.",
"",
JSON_ONLY,
"Shape:",
'{"name":"short title","bpm":84,',
' "sections":[{"id":"verse","chords":[0,5,3,4],"groove":"<groove id>","energy":1,"bass":"<bass id>","melody":true}, ...],',
' "order":[["intro",1],["verse",2],["chorus",2], ...]}',
"",
"Rules:",
"- section id: one of intro, verse, pre, chorus, bridge, outro; each used once in sections and at least once in order.",
"- chords: 1-4 numbers, one per bar; each is a chord root 0-5 of the key's seven-note scale (0=I, 1=ii, 2=iii, 3=IV, 4=V, 5=vi in major; in minor 0=i, 2=III, 3=iv, 4=v, 5=VI).",
"- Each section takes as many patterns as it has chords; all sections together use at most 16 patterns.",
"- order: [section id, repeats 1-4]. The song plays each section's bars that many times, in this order.",
"- The whole song must last 100-200 seconds: seconds = total bars * 240 / bpm.",
"- energy: 0 calm, 1 normal, 2 full. melody: false for intro and outro, usually true for verse and chorus.",
"- Make the chorus different from the verse: other chords or another order, more energy.",
"- name: in "+lang(o.text)+", at most 24 characters, original (never a real song's title)."
  ].join("\n");
  var user=[
"STYLE CARD (already chosen by the machine): "+o.card,
"Key: "+o.keyName+" "+o.scale+". Tempo range: "+o.bpm[0]+"-"+o.bpm[1]+" BPM.",
"Grooves for this card: "+list(o.grooves)+". Bass rhythms for this card: "+list(o.bass)+".",
o.allGrooves ? "Other grooves you may use: "+list(o.allGrooves)+"." : "",
o.allBass ? "Other bass rhythms: "+list(o.allBass)+"." : "",
o.form ? "A form that suits it (you may change it): "+o.form+"." : "",
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
"You write the melody of one section. Notes are scale degrees of the key: 0 is the tonic, 1 the next scale note, 7 the",
"tonic an octave up, -1 the scale note below the tonic. A note rings until the next note; a velocity 0 note is a rest.",
"",
JSON_ONLY,
'Shape: {"bars":[[[step,degree,velocity], ...], ...]}  one inner list per bar, in order.',
"",
"Rules:",
"- Exactly the number of bars asked. 2-8 notes per bar is typical, at most 12. Steps 0-15, rising, no step twice.",
"- Degrees -3..10. Velocity 0.5-1 (accent the first note of a phrase); a rest is velocity 0.",
"- On beats (steps 0, 4, 8, 12) prefer the chord tones given for that bar; between them, step through the scale.",
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
'{"tool":"chords","pattern":0,"roots":[0,5]}           1-4 chords in the bar (roots 0-5)',
'{"tool":"bass","pattern":0,"rhythm":"<bass id>"}       write the bass from the chords of that pattern',
'{"tool":"melody","pattern":0,"notes":[[0,4,0.8],[4,2,0.7]]}   replace the melody of a pattern',
'{"tool":"copy","from":0,"to":5,"change":"same"}        change: same, sparse, no-melody, lift',
'{"tool":"mix","track":"bass","vol":0.8,"mute":false}  track: drums, bass, chords, melody',
'{"tool":"ops","ops":[{"op":"setDrum","pattern":0,"drum":"snare","step":4,"on":true,"vel":0.9}]}   single notes:',
'   setDrum {pattern,drum (kick snare hat perc),step,on,vel}, setNote {pattern,track (bass chords melody),step,deg,vel},',
'   removeNote {pattern,track,step}, clearTrack {pattern,track}'
];
var EDIT_ONLY=[
'{"tool":"read","pattern":4}                            see every note of a pattern (answered next turn)',
'{"tool":"set","bpm":96,"key":9,"scale":"minor","swing":0.6,"tape":2,"kit":"soft","name":"..."}   any of these',
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
"The reply is in "+lang(o.text)+", at most 120 characters: say what the song is (style, key, tempo, form), plainly.",
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
