/*
 * Lo-PDA runtime: the words the tape machine's AI harness sends (docs/design/studio.md section 12.19). One short system
 * prompt per step, each asking for one small, strictly shaped JSON object, so a fast, small model can answer it; the
 * harness checks every answer and sends a rejected one back with the reason. Kept apart from the harness so the wording
 * can be tuned (tools/studio-ai-trial.mjs) without touching the logic.
 *
 *   LopdaStudioPrompts.plan(o)    -> messages   o: {text, cards:[{name, keyName, scale, bpm:[lo,hi], grooves, bass, form}], allGrooves, allBass}
 *   LopdaStudioPrompts.melody(o)  -> messages   o: {text, style, keyName, scale, bpm, section, energy, bars:[{chord, tones}], before}
 *   LopdaStudioPrompts.listen(o)  -> messages   o: {text, overview}
 *   LopdaStudioPrompts.edit(o)    -> messages   o: {text, overview, focus}
 *   LopdaStudioPrompts.reject(reason) -> the user turn that sends a rejected answer back
 *
 * Every system prompt names its step with "TAPE4 STEP: <name>", which the tests' fake model reads to know what to answer.
 * The prompts are English (models follow it best); the one sentence for the user is asked in the user's language.
 *
 * Prompt caching (OpenRouter, DeepSeek): a provider bills the part of a request that repeats the start of an earlier
 * one as cached tokens, at a fraction of the price and faster. So every system prompt begins with the same MACHINE
 * block, then the step's name, then the step's fixed rules, and depends on nothing but the step: no language, no dice,
 * no date. Everything that changes (the cards, the song, the request, the user's language) goes in the user message,
 * after it. tests/studio-harness.test.mjs keeps it so.
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
  return [{role:"system",content:MACHINE+"\n\nTAPE4 STEP: "+step+"\n"+system},{role:"user",content:user}];
}
/* the user's language, said in the user message so the system prompt stays the same for both */
function language(text){ return "LANGUAGE: "+lang(text); }
function list(a){ return (a||[]).join(", "); }

/* Step 2 of a new song: the shape only. Drums, chords and bass are laid by local tools from these choices, so the model
   writes about two hundred tokens instead of a whole song. */
function plan(o){
  var system=[
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
"  left out, the card's are kept (with card 0: the dice's key, major, swing 0.5, kit soft). Choose them when the style needs it (a Mandopop,",
"  Cantopop or J-pop love ballad: major, piano or keys, flute or square lead, soft kit, I V vi iii IV or I vi IV V, never a",
"  Middle Eastern colour; 中国风 or a Chinese folk ballad, only when asked for: pentatonic, pluck or bowed lead, piano; a",
"  boy-band ballad: minor, strings and square or flute, electro kit; rock: rock kit, guitar, power chords).",
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
"- end (optional): how a section's last bar leads on: fill (a drum fill, the default before a new section), stop (the",
"  whole band hits beat 3 and leaves two beats of silence: use it once or twice, before a chorus or the last section),",
"  or none. The second time a section is heard its last bar already ends with a stop.",
"- strum: hold (the chord rings all bar, the default), stabs (short chords on beats 2 and 4, a guitar's chick against",
"  the bass's boom: country, ska, rock and roll), pulse (a short chord on every beat).",
"- bpm: inside the card's range unless the request asks for faster or slower. scale: major, minor or dorian; keep the",
"  card's scale unless the request's mood needs another (sad, rainy, night: minor or dorian; bright, sunny: major).",
"- section id: one of intro, verse, pre, chorus, bridge, outro; each used once in sections and at least once in order.",
"- chords: 1-4 numbers, one per bar; each is a chord root 0-5 of the key's seven-note scale (0=I, 1=ii, 2=iii, 3=IV, 4=V, 5=vi in major; in minor 0=i, 2=III, 3=iv, 4=v, 5=VI).",
"- Each section takes as many patterns as it has chords; all sections together use at most 16 patterns.",
"- order: [section id, repeats 1 or 2]. The song plays each section's bars that many times, in this order. For length,",
"  come back to a section later (verse, chorus, verse, chorus, bridge, chorus) instead of repeating it many times.",
"- The whole song must last 75-150 seconds (aim for about 110): seconds = total bars * 240 / bpm. Keep it moving:",
"  intro and outro 1-2 bars, no section more than twice in a row.",
"- Tempo: lively unless the request asks for slow, sad, a ballad or a lullaby. Pop 100-124, rock 110-140, folk and",
"  marches 100-120, classical allegro 108-132, funk and disco 100-120, lofi 80-92. A slow tempo with long notes drags.",
"- Bass: whole and half notes only for an intro, an outro or a ballad; under a melody choose a moving rhythm.",
"- energy: 0 calm, 1 normal, 2 full. melody: false for intro and outro, usually true for verse and chorus.",
"- Make the chorus different from the verse: other chords or another order, more energy.",
"- name: in the LANGUAGE given with the request, at most 24 characters, original (never a real song's title).",
"",
"Every groove: "+list(o.allGrooves)+". Every bass rhythm: "+list(o.allBass)+"."
  ].join("\n");
  var cards=[], i, c;
  for(i=0;i<o.cards.length;i++){
    c=o.cards[i];
    cards.push("CARD "+(i+1)+": "+c.name+". Key "+c.keyName+" "+c.scale+", "+c.bpm[0]+"-"+c.bpm[1]+" BPM. Grooves "+list(c.grooves)+
      "; bass "+list(c.bass)+(c.form ? "; form "+c.form : "")+".");
  }
  var user=[
cards.join("\n"),
"",
language(o.text),
"REQUEST: "+(o.text||"a new song")
  ].join("\n");
  return msgs("plan",system,user);
}

/* Step 4, once per section with a melody: the model writes the tune (owner, 2026-10-31: the melody must be the AI's,
   not the machine's), with a songwriter's moves to develop its own bars, and the critic answers with a teacher's
   notes (12.20.13). */
function melody(o){
  var system=[
"You write the melody of one section of a new song. Notes are scale degrees of the key: 0 is the tonic, 1 the next",
"scale note, one octave up is the scale's length (7, or 5 for a pentatonic scale), -1 the scale note below the tonic.",
"A note rings until the next one; velocity 0 is a rest. A 4th value 1 or -1 raises or lowers a note a semitone, a",
"5th value \"slide\" or \"vib\" adds an ornament.",
"",
JSON_ONLY,
'Shape: {"bars":[ bar, bar, ... ]}  one entry per bar. A bar is either its notes [[step,degree,velocity], ...]',
"or a move that develops an earlier bar of this section (k counts bars from 1):",
'  {"repeat":k}                    the same bar again',
'  {"repeat":k,"end":[[8,4,0.9]]}  the same bar, from step 8 on replaced by these notes (a new ending)',
'  {"sequence":k,"by":1}           the same bar a scale step higher (by -4..4)',
'  {"invert":k}                    the same rhythm, the line turned upside down',
'  {"rest":true}                   a bar of silence (a dramatic stop; rarely)',
"",
"How a good tune works (a teacher will check these and send it back):",
"- Start from a short idea (a motif) and develop it: repeat it with a changed ending, move it up a step, answer it.",
"- Mostly steps, with a few leaps; after a leap, step back the other way. One high point in the section.",
"- Mix long and short notes: dotted notes, a held note, a syncopation (a note on step 3, 6, 10 or 14). Not all even.",
"- Breathe: a held note or a rest at the end of each two-bar half phrase.",
"- The first note of a bar and long notes sit on the chord tones given; quick notes between them may pass.",
"- Do not circle a note by a semitone (up a semitone and straight back, or down and back): it sounds Middle Eastern.",
"  At most once a section, unless the style asks for that colour. Prefer neighbours a whole tone away.",
"- Ornaments are rare: at most one per two bars, only on a note held a beat or longer. Most notes carry none.",
"- Do not just arpeggiate the chord, and do not climb the scale for six notes or more.",
"- Steps 0-15, rising in a bar, 2-8 notes is typical. Degrees -3..12. Never copy a real song."
  ].join("\n");
  var bars=[], i;
  for(i=0;i<o.bars.length;i++) bars.push("bar "+(i+1)+": chord "+o.bars[i].chord+", chord tones "+list(o.bars[i].tones));
  var user=[
"STYLE: "+o.style+". Key: "+o.keyName+" "+o.scale+", "+o.bpm+" BPM.",
"SECTION: "+o.section+", energy "+o.energy+" (0 calm, 2 full), "+o.bars.length+" bar"+(o.bars.length>1?"s":"")+":",
bars.join("\n"),
o.before ? "\nSections already written (give this one its own character, e.g. a chorus higher and busier):\n"+o.before : "",
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
'{"tool":"stop","pattern":3}                            the band stops on beat 3: two beats of silence',
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
"The machine has just written a new song (summary below). Listen back as a producer: add at most 8 small touches",
"that make it feel played by people, such as a fill before a chorus, ghost notes, a sparser intro. Do not rewrite it.",
"",
JSON_ONLY,
'Shape: {"reply":"one or two sentences for the user","calls":[ ...0-8 tool calls... ]}',
"The reply is in the LANGUAGE given below, at most 120 characters, like a friend telling what the song feels like and how it",
"moves (calm intro, a fuller chorus...). Never mention pattern letters, step numbers, degrees, swing values or tool names.",
"",
"Tools:",
TOOLS.join("\n")
  ].join("\n");
  return msgs("listen",system,"SONG\n"+o.overview+"\n\n"+language(o.text)+"\nTHE USER ASKED: "+(o.text||"a new song"));
}

/* the edit loop's first turn; later turns are the tool results the harness appends */
function edit(o){
  var system=[
"You change the user's song with tools. The summary below lists every pattern in use; read a pattern before you change",
"its notes. Make the smallest change that answers the request and keep what already works. If the machine cannot do",
"what is asked (see the limits above), change nothing and say why.",
"Change only the patterns the request is about; do not add patterns or rebuild the chain unless asked.",
"",
JSON_ONLY,
'Each turn: {"calls":[...],"done":false}  and you get each call\'s result back.',
'When finished: {"reply":"one sentence for the user","calls":[...last calls, may be empty...],"done":true}',
"The reply is in the LANGUAGE given below, at most 120 characters. At most 5 turns.",
"",
"Tools:",
EDIT_ONLY.concat(TOOLS).join("\n")
  ].join("\n");
  var f=o.focus;
  var where=f ? "\nThe user is looking at pattern "+"ABCDEFGHIJKLMNOP".charAt(f.pattern||0)+" ("+(f.pattern||0)+") on the "+(f.screen||"main")+" screen." : "";
  return msgs("edit",system,"SONG\n"+o.overview+where+"\n"+chordTable(o.song)+"\n\n"+language(o.text)+"\nREQUEST: "+(o.text||""));
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

window.LopdaStudioPrompts={chordTable:chordTable, plan:plan, melody:melody, listen:listen, edit:edit, reject:reject, lang:lang};
})();
