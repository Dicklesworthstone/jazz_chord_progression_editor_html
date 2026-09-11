import {expect,test} from "bun:test";
import packet from "../fixtures/note-first-guitar/cases.json";
test("draft guitar packet independently pins unisons, spelling, exact tuning and near misses",()=>{
  expect(packet.provenance).toContain("Hand-authored");
  expect(packet.cases[0]?.midi).toEqual([64,64]);
  expect(packet.cases[1]?.text).toBe("E4 Fb4");
  const base=packet.cases[2],shifted=packet.cases[3];
  if(base===undefined||shifted===undefined)throw new Error("Missing transposition twins");
  expect(shifted.midi).toEqual(base.midi.map(n=>n+1));
  expect(base.firstFrets).toEqual([0,0,0,0,0,0]);expect(shifted.firstFrets).toEqual([1,1,1,1,1,1]);
  expect(packet.cases[4]?.midi).toEqual([40,41]);expect(packet.cases[6]?.midi).toHaveLength(7);
  for(const row of packet.cases)expect(row.text.split(" ")).toHaveLength(row.midi.length);
  expect(packet.invalid).toContain("E4 F");
});
