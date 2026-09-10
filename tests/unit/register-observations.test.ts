import {expect,test} from "bun:test";
import {makeSpelledPitch,type SpelledPitch} from "../../src/domain";
import {observeVoicingRegister} from "../../src/theory";
import fixture from "../fixtures/register-observations/cases.json";
function notes(rows:readonly (readonly (string|number)[])[]):SpelledPitch[]{return rows.map(row=>{
  const [step,alter,octave]=row;if(typeof step!=="string"||typeof alter!=="number"||typeof octave!=="number")throw new Error("Bad fixture fields");
  const made=makeSpelledPitch({step,alter,octave});if(!made.ok)throw new Error("Bad fixture pitch");return made.value;
});}
for(const c of fixture.cases)test(`register observations: ${c.id}`,()=>{
  const input=notes(c.notes),r=observeVoicingRegister(input);if(!r.ok)throw new Error(r.message);
  expect(r.value.notes.map(n=>n.pitch)).toEqual(input);expect(r.value.notes.map(n=>n.occurrence)).toEqual(input.map((_n,i)=>i));
  expect(r.value.notes.map(n=>n.midi)).toEqual(c.midi);
  expect([r.value.minimumMidi,r.value.maximumMidi,r.value.span,r.value.belowC3]).toEqual([c.min,c.max,c.span,c.below]);
  expect(r.value.unisons.map(p=>[p.first,p.second,p.semitones])).toEqual(c.unisons);
  expect(r.value.lowClosePairs.map(p=>[p.first,p.second,p.semitones])).toEqual(c.close);
  expect(r.evidence).toEqual({pitchValidations:input.length,pairVisits:input.length*(input.length-1)/2,retainedRecords:input.length+c.unisons.length+c.close.length,termination:"complete"});
  expect(Object.isFrozen(r.value.notes)).toBe(true);expect(r.value.notes.every(Object.isFrozen)).toBe(true);
  expect(Object.isFrozen(r.value)).toBe(true);expect(Object.isFrozen(r.value.unisons)).toBe(true);
  expect(observeVoicingRegister(input)).toEqual(r);
});
test("all twelve transpositions preserve spans, source pairs and exact octave inverse",()=>{
  const spelling:readonly (readonly [string,number])[]=[["C",0],["C",1],["D",0],["E",-1],["E",0],["F",0],["F",1],["G",0],["A",-1],["A",0],["B",-1],["B",0]];
  for(let shift=0;shift<12;shift++){
    const midi=[36,36,40,43].map(n=>n+shift),input=notes(midi.map(n=>{const p=spelling[n%12];if(p===undefined)throw new Error("Pitch class");return [p[0],p[1],Math.floor(n/12)-1];}));
    const r=observeVoicingRegister(input);if(!r.ok)throw new Error(r.message);
    expect(r.value.span).toBe(7);expect(r.value.unisons).toEqual([{first:0,second:1,semitones:0}]);
    expect(r.value.belowC3).toBe(midi.filter(n=>n<48).length);
    const expected:number[][]=[];for(let i=0;i<midi.length;i++)for(let j=i+1;j<midi.length;j++){const a=midi[i],b=midi[j];if(a===undefined||b===undefined)throw new Error("Fixture");const d=Math.abs(a-b);if(a<48&&b<48&&d>=1&&d<=4)expected.push([i,j,d]);}
    expect(r.value.lowClosePairs.map(p=>[p.first,p.second,p.semitones])).toEqual(expected);
    const up=notes(input.map(p=>[p.step,p.alter,p.octave+1]));const down=notes(up.map(p=>[p.step,p.alter,p.octave-1]));
    expect(down).toEqual(input);expect(observeVoicingRegister(down)).toEqual(r);
  }
});
test("16 duplicate occurrences retain all 120 pairs; 17 refuses before work",()=>{
  const input=notes(Array.from({length:16},()=>["E",0,2]));const r=observeVoicingRegister(input);if(!r.ok)throw new Error(r.message);
  expect(r.value.notes.length).toBe(16);expect(r.value.unisons.length).toBe(120);expect(r.value.belowC3).toBe(16);
  expect(r.evidence).toEqual({pitchValidations:16,pairVisits:120,retainedRecords:136,termination:"complete"});
  const bad=observeVoicingRegister([...input,...notes([["E",0,2]])]);expect(bad.ok).toBe(false);expect(bad.evidence.pitchValidations).toBe(0);
});
test("empty, sparse, malformed and out-of-range input never expose partial facts",()=>{
  const badInputs:unknown[]=[[],null,[null],Array(2),[{step:"C",alter:0,octave:4},{step:"H",alter:0,octave:4}],[{step:"C",alter:0,octave:10}],[{step:"C",alter:NaN,octave:4}]];
  for(const input of badInputs){const r=observeVoicingRegister(input as readonly SpelledPitch[]);expect(r.ok).toBe(false);expect("value"in r).toBe(false);expect(r.evidence.pairVisits).toBe(0);expect(r.evidence.retainedRecords).toBe(0);expect(r.evidence.termination).toBe("input-refused");}
});
