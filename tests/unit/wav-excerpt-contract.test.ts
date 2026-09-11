import {expect,test} from "bun:test";
import fixture from "../fixtures/wav-excerpt.json";

test("independently written WAV excerpt endpoints agree with the fixture's integer tick timeline",()=>{
  const bars=fixture.sections.flatMap(section=>section.bars);
  expect(bars.map(bar=>bar.ticks)).toEqual([3840,320,3840,2400,3840,3840]);
  for(const row of fixture.accepted){
    const offset=row.sectionId===null?0:fixture.sections.slice(0,fixture.sections.findIndex(s=>s.id===row.sectionId)).reduce((n,s)=>n+s.bars.length,0);
    const start=offset+row.startBar-1;
    expect(bars.slice(0,start).reduce((n,b)=>n+b.ticks,0)).toBe(row.startTick);
    expect(bars.slice(0,start+row.barCount).reduce((n,b)=>n+b.ticks,0)).toBe(row.endTick);
  }
  expect(fixture.refused).toHaveLength(9);
});
