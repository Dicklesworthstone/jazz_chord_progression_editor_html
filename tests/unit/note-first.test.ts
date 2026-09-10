import { expect, test } from "bun:test";
import cases from "../fixtures/note-first/cases.json";
import { analyzeNoteFirst, REVERSE_CHORD_TEMPLATES } from "../../src/theory";
import { MIDI_IMPORT_MATCH_TEMPLATES } from "../../src/export/midi-import-contract";

for(const c of cases.positive)test(`literal notes: ${c.text}`,()=>{
 const r=analyzeNoteFirst(c.text);expect(r.ok).toBe(true);if(!r.ok)return;
 expect(r.midi).toEqual(c.midi);expect(r.pitches.length).toBe(c.midi.length);
 const exact=r.candidates.filter(n=>n.spellingExact).map(n=>n.name),enharmonic=r.candidates.filter(n=>!n.spellingExact).map(n=>n.name);
 if(c.exactNames.length===0)expect(exact).toEqual([]);else for(const name of c.exactNames)expect(exact).toContain(name);
 if("enharmonicNames"in c)for(const name of c.enharmonicNames)expect(enharmonic).toContain(name);
 if(c.exactNames.length===0&&"enharmonicNames"in c&&c.enharmonicNames.length===0)expect(r.candidates).toEqual([]);
 expect(r.evidence.roots).toBe(35);expect(r.evidence.cells).toBe(560);expect(r.evidence.retained).toBe(r.candidates.length);
 expect(analyzeNoteFirst(c.text)).toEqual(r);
});
for(const text of cases.invalid)test(`invalid notes refuse: ${text.slice(0,24)}`,()=>{expect(analyzeNoteFirst(text).ok).toBe(false);});
test("M0 reuses the identical frozen24-entry table",()=>{expect(MIDI_IMPORT_MATCH_TEMPLATES).toBe(REVERSE_CHORD_TEMPLATES);expect(REVERSE_CHORD_TEMPLATES.length).toBe(24);expect(Object.isFrozen(REVERSE_CHORD_TEMPLATES)).toBe(true);});
test("all16 complete families have an exact C-root spelling witness",()=>{
 const families=[
  ["C4 E4 G4","M0-TPL-02"],["C4 Eb4 G4","M0-TPL-03"],["C4 Eb4 Gb4","M0-TPL-04"],["C4 E4 G#4","M0-TPL-05"],
  ["C4 D4 G4","M0-TPL-06"],["C4 F4 G4","M0-TPL-07"],["C4 E4 G4 A4","M0-TPL-08"],["C4 Eb4 G4 A4","M0-TPL-09"],
  ["C4 E4 G4 B4","M0-TPL-10"],["C4 E4 G4 Bb4","M0-TPL-11"],["C4 Eb4 G4 Bb4","M0-TPL-12"],["C4 Eb4 G4 B4","M0-TPL-13"],
  ["C4 Eb4 Gb4 Bb4","M0-TPL-14"],["C4 Eb4 Gb4 Bbb4","M0-TPL-15"],["C4 E4 G#4 B4","M0-TPL-16"],["C4 F4 G4 Bb4","M0-TPL-17"],
 ];
 for(const [text,template]of families){if(text===undefined)throw new Error("fixture");const r=analyzeNoteFirst(text);if(!r.ok)throw new Error(r.message);
 expect(r.candidates.some(c=>c.templateId===template&&c.spellingExact&&c.chord.root.step==="C"&&c.chord.root.alter===0)).toBe(true);}
});
test("lexical conveniences preserve actual written spelling, duplicates and crossed octaves",()=>{
 const r=analyzeNoteFirst("b#3, E4 G4 b#3,");if(!r.ok)throw new Error(r.message);
 expect(r.normalizedText).toBe("B#3 E4 G4 B#3");expect(r.midi).toEqual([60,64,67,60]);
 const x=analyzeNoteFirst("Fx4 A#4 C#5");if(!x.ok)throw new Error(x.message);expect(x.pitches[0]).toEqual({step:"F",alter:2,octave:4});
});
test("naming never inserts a missing root or fifth",()=>{
 const r=analyzeNoteFirst("E4 G4 B4");if(!r.ok)throw new Error(r.message);expect(r.candidates.some(c=>c.name==="Cmaj7")).toBe(false);expect(r.candidates.some(c=>c.name==="Em")).toBe(true);
 const short=analyzeNoteFirst("C4 E4 Bb4");if(!short.ok)throw new Error(short.message);expect(short.candidates.some(c=>c.name==="C7")).toBe(false);
});
