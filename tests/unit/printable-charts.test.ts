import {expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {decodeDocumentShape} from "../../src/domain";
import {validateDocumentSemantics} from "../../src/application/document-validation";
import {layoutPrintableChart,encodePrintSvg,printTextWidth,wrapPrintText,escapePrintXml} from "../../src/export/printable-chart";
import {PRINT_FONT_DATA,PRINT_FONT_SHA256} from "../../src/export/print-font";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";
import fixture from "../fixtures/printable-charts/cases.json";
function document(bars:readonly number[],symbol="Cmaj7",title="Print chart",duration={numerator:4,denominator:1},eventCount=1){
 const base=loopArrangementFixture().state.document,s=base.sections[0],m=s?.measures[0],e=m?.events[0];if(!s||!m||!e)throw new Error("Fixture");
 const raw={...base,title,sections:bars.map((count,i)=>({...s,id:`section-${String(i)}`,name:`Section ${String(i)}`,measures:Array.from({length:count},(_v,j)=>({...m,id:`bar-${String(i)}-${String(j)}`,completion:duration.numerator/duration.denominator===4?{kind:"complete"}:{kind:"incomplete",expectedDuration:duration,reason:"Exact partial bar fixture"},events:Array.from({length:eventCount},(_v,k)=>({...e,id:`event-${String(i)}-${String(j)}-${String(k)}`,duration:eventCount===1?duration:{numerator:1,denominator:eventCount/4},chord:{kind:"custom",sourceText:symbol,label:symbol,pitchNames:[{step:"C",alter:0}],bass:null},voicing:{mode:"manual",bassPolicy:"included",pitches:[{step:"C",alter:0,octave:4}]}}))}))}))};
 const d=decodeDocumentShape(raw);if(!d.ok)throw new Error(JSON.stringify(d.errors));const v=validateDocumentSemantics(d.value);if(!v.ok)throw new Error(JSON.stringify(v.errors));return v.value;
}
test("independent geometry, pagination boundaries and section-orphan fixtures",()=>{
 for(const c of fixture.pagination){const r=layoutPrintableChart(document(c.sectionBars),c.paper==="a4"?"a4":"letter");if(!r.ok)throw new Error(r.message);expect(r.pages.length).toBe(c.pages);expect(r.evidence.bars).toBe(c.sectionBars.reduce((a,b)=>a+b,0));}
 for(const c of fixture.geometry){const r=layoutPrintableChart(document([1]),c.paper==="a4"?"a4":"letter");if(!r.ok)throw new Error(r.message);expect(r.pages[0]?.width).toBe(c.width);expect(r.pages[0]?.height).toBe(c.height);expect(r.pages[0]?.boxes[0]?.width).toBeCloseTo(c.column,9);}
});
test("literal font advances and independently enumerated wrap retain every character",()=>{
 for(const [char,advance]of Object.entries(fixture.fontAdvances))expect(printTextWidth(char,1)).toBe(advance);
 expect([...wrapPrintText(fixture.wrap.input,fixture.wrap.width)]).toEqual(fixture.wrap.lines);
 expect(wrapPrintText(fixture.wrap.input,fixture.wrap.width).join("")).toBe(fixture.wrap.input);
});
test("source symbols, rational duration, escape hostility and embedded font bytes are exact",()=>{
 for(const c of fixture.escaping)expect(escapePrintXml(c.input)).toBe(c.xml);
 for(const symbol of fixture.sourceSymbols){const r=layoutPrintableChart(document([1],symbol),"a4");if(!r.ok)throw new Error(r.message);const page=r.pages[0];if(!page)throw new Error("Page");expect(page.texts.some(t=>t.text===`${symbol} [4/1 q]`)).toBe(true);const svg=encodePrintSvg(page);if(!svg.ok)throw new Error(svg.message);const text=new TextDecoder().decode(svg.bytes);expect(text).toContain(escapePrintXml(symbol));expect(text).not.toContain("<script");expect(text).toContain("SIL OPEN FONT LICENSE");}
 const bytes=Buffer.from(PRINT_FONT_DATA.split(",")[1]??"","base64");expect(bytes.equals(readFileSync("assets/fonts/archivo-latin.woff2"))).toBe(true);expect(createHash("sha256").update(bytes).digest("hex")).toBe(PRINT_FONT_SHA256);
});
test("unsupported glyphs and source/line caps refuse without a partial page",()=>{
 for(const value of [...fixture.unsupported,"\u00ad"]){expect(()=>printTextWidth(value,4)).toThrow();if(value!=="\u0000"){const r=layoutPrintableChart(document([1],"C",value),"a4");expect(r.ok).toBe(false);expect("pages"in r).toBe(false);}}
 for(const doc of [document([257]),document([1],"W".repeat(32),"Dense",{numerator:4,denominator:1},16)]){const r=layoutPrintableChart(doc,"letter");expect(r.ok).toBe(false);expect("pages"in r).toBe(false);}
 expect(()=>document([1],"W".repeat(512))).toThrow("limit.symbol_code_points_exceeded");
 expect(()=>document(Array.from({length:65},()=>1))).toThrow("limit.sections_exceeded");
 const valid=layoutPrintableChart(document([256]),"a4");expect(valid.ok).toBe(true);expect(valid.evidence.bars).toBe(256);
});

test("partial bars retain independently authored rational durations",()=>{for(const d of fixture.durations){const r=layoutPrintableChart(document([1],"Cmaj7","Fractional chart",{numerator:d.numerator,denominator:d.denominator}),"a4");if(!r.ok)throw new Error(r.message);expect(r.pages[0]?.texts.some(t=>t.text===`Cmaj7 [${d.text}]`)).toBe(true);expect(r.pages[0]?.texts.some(t=>t.text===`1. ${d.numerator/d.denominator===4?"complete":"incomplete"}`)).toBe(true);}});
