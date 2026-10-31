/*
 * Lo-PDA runtime: the words the tape machine's AI harness sends (docs/design/studio.md section 12.19). One short system
 * prompt per step, each asking for one small, strictly shaped JSON object, so a fast, small model can answer it; the
 * harness checks every answer and sends a rejected one back with the reason. Kept apart from the harness so the wording
 * can be tuned (tools/studio-ai-trial.mjs) without touching the logic.
 *
 *   LopdaStudioPrompts.plan(o)    -> messages   o: {text, cards:[{name, keyName, scale, bpm:[lo,hi], grooves, bass, form}], allGrooves, allBass}
 *   LopdaStudioPrompts.motif(o)   -> messages   o: {text, card, keyName, scale, bpm, sections:[{id, bars:[chord names], energy}]}
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
"lead), pluck (zither or lute-like), reed (harmonica or accordion-like), bowed (a violin). A style is made from",
"these sounds, rhythm and harmony: it will sound like the style, played on this machine.",
"Chords may be any type: maj m 7 maj7 m7 9 m9 6 m6 add9 sus2 sus4 dim dim7 aug m7b5 5 (power), on a root that is a",
"scale degree 0-5, optionally shifted a semitone (acc). Melody notes may leave the scale by a semitone (acc) and may",
"carry an ornament: slide (up into the note) or vib (vibrato). A request for all twelve notes, the chromatic scale or",
"\"全音阶\" means exactly this: use acc on melody (or bass) notes. There is no separate chromatic or whole-tone scale."
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
'{"card":0,"style":"baroque","name":"short title","bpm":84,"key":9,"scale":"minor","swing":0.55,"kit":"soft","chordStyle":"triad",',
' "voices":{"bass":"bass","chords":"keys","melody":"flute"},',
' "sections":[{"id":"verse","chords":[0,5,{"root":3,"q":"m7"},{"root":4,"q":"sus4"}],"groove":"<groove id>","energy":1,',
'   "bass":"<bass id>","strum":"hold","melody":true}, ...],',
' "order":[["intro",1],["verse",2],["chorus",2], ...]}',
"",
"Rules:",
"- card: if the request names no mood, style or tempo (just \"a song\", \"a skeleton\", \"来个骨架\"), take card 1.",
"  If it names a genre, a form, an era or an artist (classical, a fugue, jazz, Bach, a boy band...), write card 0 and",
"  \"style\": a short name for it in the user's language, and choose the sound yourself. Use another card only when",
"  its name plainly is that style (a card is a mood, not a genre list; never force a request into one). An artist is",
"  only a hint for the feel: never use their songs, titles or melodies.",
"- key (0-11, C=0), scale (major, minor, harmonic-minor, dorian, mixolydian, phrygian, major-penta, minor-penta),",
"  swing (0.5-0.75), kit and voices: optional;",
"  left out, the card's are kept (with card 0: the dice's key, major, swing 0.5, kit soft). Choose them when the style needs it (a Chinese-style ballad: pentatonic, pluck or bowed",
"  lead, piano; a boy-band ballad: minor, strings and square or flute, electro kit; rock: rock kit, guitar, power chords).",
"- scale colour: Russian, Klezmer or East European minor = harmonic-minor (its V is major: i iv V i, VI, III);",
"  flamenco and the darker Middle East = phrygian; rock, Celtic and folk with a flat seventh = mixolydian; Chinese and",
"  Japanese folk = a pentatonic scale; blues = minor-penta with acc notes.",
"- chordStyle: what a bare chord degree becomes: triad (the scale's own major, minor or diminished chord: folk, pop,",
"  rock, marches, most traditional music), seventh (the scale's own 7th chords: soul, bossa, swing) or rich (the",
"  machine's lush sevenths and ninths: lofi, neo-soul, jazz ballads). Default triad.",
"- For the scale's own chord write just the degree: in a minor key 2 is already the MAJOR chord III and 3 the minor iv.",
"  Write an object only for a chord that is not the scale's own (borrowed, a different type, sus, power).",
"- chords: one per bar, either a degree 0-5 (voiced by chordStyle) or",
"  {\"root\":0-5,\"q\":\"<type>\",\"acc\":-1 or 1} for a chosen type or a borrowed chord (in major, bVII is",
"  {\"root\":5,\"acc\":1,\"q\":\"maj\"}). Plain pop wants maj and m triads, jazz and R&B sevenths and ninths, rock 5 (power).",
"- groove: a groove id (any, not only the card's), or none for no drums. Only if none fits the style, leave groove out and write one bar",
"  yourself: \"drums\":{\"kick\":[[0,0.9],[8,0.85]],\"snare\":[[4,0.9],[12,0.9]],\"hat\":[[0,0.4],[2,0.3],...],\"perc\":[]}.",
"- bass: a bass rhythm id (boom = root on beat 1, fifth on beat 3; walk and boom-walk move each beat), or one bar of",
"  your own: [[step, velocity, move], ...] with move root, fifth, third, octave or approach (the note below the next chord).",
"- Solo, classical and baroque pieces: groove \"none\" (no drums), strum \"none\" (no chord pad; the bass and melody",
"  still follow the chords) or hold, bass \"alberti\" or \"arpeggio\" (broken chords), and for a fugue or a canon",
"  \"imitate\": true on a section: the bass answers the melody's motif a bar later, lower. Tape4 has two melodic lines,",
"  so a fugue becomes a two-voice canon, which is fine: say so in the name or not at all.",
"- strum: hold (the chord rings all bar, the default), stabs (short chords on beats 2 and 4, a guitar's chick against",
"  the bass's boom: country, ska, rock and roll), pulse (a short chord on every beat).",
"- bpm: inside the card's range unless the request asks for faster or slower. scale: major, minor or dorian; keep the",
"  card's scale unless the request's mood needs another (sad, rainy, night: minor or dorian; bright, sunny: major).",
"- section id: one of intro, verse, pre, chorus, bridge, outro; each used once in sections and at least once in order.",
"- chords: 1-4 numbers, one per bar; each is a chord root 0-5 of the key's seven-note scale (0=I, 1=ii, 2=iii, 3=IV, 4=V, 5=vi in major; in minor 0=i, 2=III, 3=iv, 4=v, 5=VI).",
"- Each section takes as many patterns as it has chords; all sections together use at most 16 patterns.",
"- order: [section id, repeats 1 or 2]. The song plays each section's bars that many times, in this order. For length,",
"  come back to a section later (verse, chorus, verse, chorus, bridge, chorus) instead of repeating it many times.",
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

/* Step 4: one motif per section with a melody. The machine writes the notes from the chords (studio-compose.js), so
   the model decides only what a songwriter decides first: the rhythm of a bar, the shape of the line, where it sits
   and how it ends. Writing notes one by one, a small model climbed the scale in even eighths (12.20.10). */
function motif(o){
  var system=[
MACHINE,
"",
"You give each section of a new song its melody idea, a motif. The machine turns it into phrases over the chords:",
"strong beats land on chord tones, the line moves by your contour between them, the 2nd bar uses the answer rhythm,",
"the 3rd bar turns the contour upside down, and the last bar ends on a long note.",
"",
JSON_ONLY,
'Shape: {"motifs":{"verse":{"rhythm":[0,3,6,8,12],"answer":[0,4,6,8],"contour":[1,1,-2,1],"register":"mid","ending":"open"}, ...}}',
"",
"Rules:",
"- rhythm and answer: the steps (0-15) where notes start in one bar, rising, 2-7 of them. Mix long and short notes:",
"  [0,3,4,8,12] is a dotted figure, [0,6,8,12] a syncopation, [2,4,8] starts after the beat. Never 8 even eighths.",
"- contour: 2-8 moves in scale steps (-3..3) from note to note, e.g. [1,1,-1,2] climbs and turns. Small steps sing.",
"- register: low, mid or high. A chorus usually sits higher and moves more than its verse.",
"- ending: home (ends on the tonic, the end of a thought) or open (on the third or fifth, wants to go on).",
"- Give each section its own character, fitting the style: a folk tune steps and turns, a march jumps on the beat,",
"  a ballad holds long notes, a rock riff repeats short figures. Write nothing from a real song."
  ].join("\n");
  var lines=[], i, s;
  for(i=0;i<o.sections.length;i++){
    s=o.sections[i];
    lines.push(s.id+": "+s.bars.length+" bar"+(s.bars.length>1?"s":"")+", chords "+s.bars.join(" ")+", energy "+s.energy);
  }
  var user=[
"STYLE: "+o.card+". Key: "+o.keyName+" "+o.scale+", "+o.bpm+" BPM.",
"SECTIONS WITH A MELODY:",
lines.join("\n"),
"",
"REQUEST: "+(o.text||"a new song")
  ].join("\n");
  return msgs("motif",system,user);
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
"Change only the patterns the request is about; do not add patterns or rebuild the chain unless asked.",
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
  return msgs("edit",system,"SONG\n"+o.overview+where+"\n"+chordTable(o.song)+"\n\nREQUEST: "+(o.text||""));
}

/* The scale's own chord on each degree, named, so a model never writes "C minor" in A minor by guessing (owner's
   tape, 2026-10-30: chords Am, Cm, D7 in A minor). */
function chordTable(song){
  var S=window.LopdaSong, T=window.LopdaStudioTools, out=[], d, q, n;
  if(!S || !T || !song) return "";
  for(d=0;d<=5;d++){
    q=T.diatonicQ(song,d,"triad");
    n=S.chordName(song,d,q);
    out.push(d+" = "+(n ? n.name : "?"));
  }
  return "Chords of "+S.NAMES[song.key]+" "+song.scale+" (degree = the scale's own chord): "+out.join(", ")+
    ". Writing q changes the chord: only do it on purpose (a borrowed chord, a seventh), never to guess the scale's chord."+
    (window.LopdaStudioTheory ? " Borrowed chords that sound right in this key: "+window.LopdaStudioTheory.borrowedText(song)+
    ". Other chords off the key, and melody notes off the scale that are neither a chord tone nor a step between neighbours, are refused." : "");
}

function reject(reason){
  return "That JSON was rejected: "+reason+". Reply with the corrected JSON only.";
}

window.LopdaStudioPrompts={chordTable:chordTable, plan:plan, motif:motif, listen:listen, edit:edit, reject:reject, lang:lang};
})();
