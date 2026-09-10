import {expect,test} from "bun:test";
import {makeSpelledPitch,type SpelledPitch} from "../../src/domain";
import {findExactGuitarPositions} from "../../src/theory";
import fixture from "../fixtures/guitar-positions/cases.json";
function notes(rows:readonly (readonly (string|number)[])[]):SpelledPitch[]{return rows.map(row=>{
  const [step,alter,octave]=row;if(typeof step!=="string"||typeof alter!=="number"||typeof octave!=="number")throw new Error("Bad independent pitch fields");
  const made=makeSpelledPitch({step,alter,octave});if(!made.ok)throw new Error("Bad independent fixture");return made.value;
});}
for(const c of fixture.cases)test(`exact guitar: ${c.id}`,()=>{
  const input=notes(c.notes),r=findExactGuitarPositions(input);
  expect(r.evidence.termination).toBe("complete");expect(r.midi).toEqual(c.midi);expect(r.pitches).toEqual(input);
  if("noPosition"in c){expect(r.status).toBe("no-position");expect(r.positions).toEqual([]);}
  else {expect(r.status).toBe("positions");expect(r.positions.some(p=>JSON.stringify(p.frets)===JSON.stringify(c.position))).toBe(true);}
  if(c.id==="six-e4-only-five-strings"){expect(r.evidence.states).toBe(326);expect(r.evidence.trials).toBe(1956);expect(r.evidence.completeAssignments).toBe(0);}
  expect(r.evidence.states).toBeLessThanOrEqual(1957);expect(r.evidence.trials).toBeLessThanOrEqual(7422);
  expect(r.evidence.completeAssignments).toBeLessThanOrEqual(720);expect(r.positions.length).toBeLessThanOrEqual(3);
  for(const position of r.positions){
    expect(position.assignments.map(a=>a.occurrence)).toEqual(c.midi.map((_n,i)=>i));
    expect(new Set(position.assignments.map(a=>a.string)).size).toBe(c.midi.length);
    for(const a of position.assignments){
      const open=fixture.tuningMidi[6-a.string];if(open===undefined)throw new Error("Invalid string");
      const expectedMidi=c.midi[a.occurrence],expectedPitch=input[a.occurrence];if(expectedMidi===undefined||expectedPitch===undefined)throw new Error("Unexpected occurrence");
      expect(a.fret>=0&&a.fret<=20).toBe(true);expect(open+a.fret).toBe(expectedMidi);expect(a.pitch).toEqual(expectedPitch);
      expect(position.frets[6-a.string]).toBe(a.fret);
    }
  }
  expect(new Set(r.positions.map(p=>JSON.stringify(p.frets))).size).toBe(r.positions.length);
  expect(findExactGuitarPositions(input)).toEqual(r);
});
test("positive fret shifts and inverse restore exact register without octave folding",()=>{
  const e=notes([["E",0,2]]),f=notes([["F",0,2]]);
  expect(findExactGuitarPositions(e).positions[0]?.frets[0]).toBe(0);
  expect(findExactGuitarPositions(f).positions[0]?.frets[0]).toBe(1);
  expect(findExactGuitarPositions(e).positions[0]?.frets[0]).toBe(0);
  expect(findExactGuitarPositions(notes([["E",0,1]])).status).toBe("no-position");
});
test("invalid and empty input refuse with bounded work",()=>{
  expect(findExactGuitarPositions([]).status).toBe("unavailable");
  const pitch=notes([["E",0,4]])[0];if(pitch===undefined)throw new Error("Missing pitch");
  expect(findExactGuitarPositions(Array.from({length:17},()=>pitch)).evidence.states).toBe(0);
});
