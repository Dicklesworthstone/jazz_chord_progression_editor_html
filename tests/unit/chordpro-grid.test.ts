import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {decodeChordProGrid} from "../../src/theory/chordpro-grid";
import fixture from "../fixtures/chordpro-grid/cases.json";
const wrap=(line:string)=>`{title: Test}\n{time: 4/4}\n{sog}\n${line}\n{eog}`;
for(const c of fixture.positive)test(`original real-file transcription: ${c.file}`,()=>{
 const text=readFileSync(`tests/fixtures/chordpro-grid/${c.file}`,"utf8");
 for(const source of [text,"\uFEFF"+text.replaceAll("\n","\r\n")]){
  const r=decodeChordProGrid(source);expect(r.ok).toBe(true);if(!r.ok)throw new Error(r.message);
  expect(r.grid.title).toBe(c.title);expect(r.grid.tempo).toBe(c.tempo);expect(r.grid.comments).toBe(c.comments);
  expect(r.grid.bars.map(b=>b.map(e=>[e.chord.sourceText,e.quarters]))).toEqual(c.bars);
  expect(r.evidence).toMatchObject({termination:"complete",bars:c.bars.length,events:c.bars.flat().length});
  expect(Object.isFrozen(r.grid.bars)).toBe(true);
 }
});
test("every independently specified near miss refuses without a partial candidate",()=>{
 for(const line of fixture.refusedLines){const r=decodeChordProGrid(wrap(line));expect(r.ok).toBe(false);expect(r).not.toHaveProperty("grid");expect(r.evidence.termination).toBe("refused");}
});
test("metadata, hostile directives, lyrics, margins and duplicate songs never silently disappear",()=>{
 const valid=wrap("| C . . . |");
 for(const source of [valid+"\n"+valid,valid+"\n<script>alert(1)</script>",valid.replace("{sog}","{sog label=\"A\"}"),valid.replace("{time: 4/4}","{time: 3/4}"),valid.replace("{time: 4/4}",""),valid.replace("{sog}","{include: https://example.org}\n{sog}"),valid.replace("{eog}","{tempo: 120}\n{eog}"),valid.replace("{sog}","{title: Again}\n{sog}"),valid.replace("C . . .","C . \u0000 ."),valid.replace("{title: Test}","{title: }"),valid.replace("{sog}","{tempo: 19}\n{sog}"),valid.replace("{sog}","{tempo: 401}\n{sog}"),valid.replace("{sog}","{tempo: 120}\n{tempo: 120}\n{sog}"),valid.replace("{sog}","{sog: 3x3}"),valid.replace("| C . . . |","| C . . . |. C . . . |")])expect(decodeChordProGrid(source).ok).toBe(false);
});
test("maximum expanded bars/events are exact, repeats are bounded and shapes never invent silence",()=>{
 const full=Array.from({length:128},()=>"| C / / / |").join("\n"),r=decodeChordProGrid(wrap(full));expect(r.ok).toBe(true);expect(r.evidence).toMatchObject({bars:128,events:512,symbols:128,termination:"complete"});
 const repeats=decodeChordProGrid(wrap("| C# . Db . |\n"+Array.from({length:127},()=>"| % . . . |").join("\n")));
 expect(repeats.ok).toBe(true);if(!repeats.ok)throw new Error(repeats.message);expect(repeats.grid.bars[127]?.map(e=>e.chord.sourceText)).toEqual(["C#","Db"]);expect(repeats.evidence.symbols).toBe(2);
 expect(decodeChordProGrid(wrap(full+"\n| % . . . |")).ok).toBe(false);
 const small=decodeChordProGrid(wrap("| C . . . |").replace("{sog}","{sog: 4}"));expect(small.ok).toBe(true);expect(small.evidence.bars).toBe(1);
 expect(decodeChordProGrid(wrap("| C . . . | G . . . |").replace("{sog}","{sog: 4}")).ok).toBe(false);
});
test("source, Unicode, line and symbol limits refuse deterministically before unbounded delegation",()=>{
 for(const source of ["x".repeat(16385),"é".repeat(8193),"\n".repeat(512),wrap("#"+"x".repeat(1024)),wrap("| "+"C".repeat(65)+" . . . |")]){const r=decodeChordProGrid(source);expect(r.ok).toBe(false);expect(r.evidence.symbols).toBe(0);}
 const title="é".repeat(256),valid=wrap("| C . . . |").replace("Test",title);expect(decodeChordProGrid(valid).ok).toBe(true);expect(decodeChordProGrid(valid.replace(title,title+"é")).ok).toBe(false);
 const source=wrap("| C . . . |");const exact=source+"\n#"+"x".repeat(1000);expect(decodeChordProGrid(exact).ok).toBe(true);
});
test("exact byte/line caps remain usable, with accepted shapes and boundary tempos",()=>{
 const base=wrap("| C . . . |"),lines=[base];let remaining=16384-base.length;
 while(remaining>0){const n=Math.min(remaining,1025);lines.push("#"+"x".repeat(n-2));remaining-=n;}
 const exact=lines.join("\n");expect(exact.length).toBe(16384);expect(decodeChordProGrid(exact).ok).toBe(true);expect(decodeChordProGrid(exact+" ").ok).toBe(false);
 const padded=base+"\n".repeat(512-base.split("\n").length);expect(padded.split("\n").length).toBe(512);expect(decodeChordProGrid(padded).ok).toBe(true);
 for(const shape of ["4","8","12","16","1x4","2x4","3x4","4x4"])for(const marker of [`{sog: ${shape}}`,`{start_of_grid shape="${shape}"}`])expect(decodeChordProGrid(base.replace("{sog}",marker)).ok).toBe(true);
 for(const tempo of [20,400])expect(decodeChordProGrid(base.replace("{sog}",`{tempo: ${String(tempo)}}\n{sog}`)).ok).toBe(true);
});
