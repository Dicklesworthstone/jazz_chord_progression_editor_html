import {expect,test} from "bun:test";
import cases from "../fixtures/note-first-keyboard/cases.json";
import type {NoteFirstDraftEdit} from "../../src/application/note-first-keyboard-contract";
test("independent keyboard packet preserves chromatic order, occurrence edits and refusal boundaries",()=>{
 expect(cases.provenance).toContain("Hand-authored");
 expect(cases.columns).toEqual([0,1,1,2,2,3,4,4,5,5,6,6]);expect(cases.black.filter(Boolean)).toHaveLength(5);
 for(const keys of cases.keys){expect(keys.sharps).toHaveLength(12);expect(keys.flats).toHaveLength(12);expect(keys.midi).toHaveLength(12);}
 expect(cases.keys[0]?.midi).toEqual([48,49,50,51,52,53,54,55,56,57,58,59]);
 expect(cases.keys[1]?.midi[0]).toBe(0);expect(cases.keys[2]?.midi.slice(7)).toEqual([127,null,null,null,null]);
 expect(cases.edits[1]?.midi).toEqual([57,60,64,67,57]);expect(cases.edits[4]?.output).toBe("A3 C4 E4");
 expect(cases.refusals.at(-1)?.input.split(" ")).toHaveLength(16);
 const edits:readonly NoteFirstDraftEdit[]=[{kind:"append",note:"A3"},{kind:"remove",index:2},{kind:"clear"}];expect(edits.map(e=>e.kind)).toEqual(["append","remove","clear"]);
});
