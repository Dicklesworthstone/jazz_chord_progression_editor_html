import {expect,test} from "bun:test";
import packet from "../fixtures/band-dropout/cases.json";

// Independent fixture arithmetic, not a production compiler or audio simulation.
function sameFraction(actual:readonly number[],numerator:number,denominator:number):void{
 const [n,d]=actual;if(n===undefined||d===undefined||d<=0)throw new Error("Missing positive-denominator fraction");
 expect(BigInt(n)*BigInt(denominator)).toBe(BigInt(numerator)*BigInt(d));
}
test("literal four-pass epochs retain silent time and exactly one count-in",()=>{
 expect(packet.status).toBe("specified-not-implemented");expect(packet.productionOutputUsed).toBe(false);
 expect(packet.range).toEqual([3840,19200]);expect(packet.offStarts).toBe(11520);
 for(const [i,t]of packet.passStartsSeconds.entries())sameFraction(t,2+8*i,1);
 for(const [i,t]of packet.countInSeconds.entries())sameFraction(t,i,2);
 sameFraction(packet.completionSeconds,34,1);expect(packet.expandedTicks).toBe(16*4*960);
});
test("half-open occurrence selection preserves original attack and gate including tails",()=>{
 const retained=packet.events.filter(e=>e.start>=3840&&e.start<11520);
 expect(retained.map(e=>e.id)).toEqual(packet.retainedIds);
 for(const e of packet.events){expect(retained.includes(e)).toBe(e.retained);if(e.retained){if(e.attack0===null)throw new Error("Missing literal occurrence times");sameFraction(e.attack0,e.start,1920);sameFraction(e.release0,e.start+e.gate,1920);}else{expect(e.attack0).toBeNull();expect(e.release0).toBeNull();}}
 expect(packet.candidateVisits).toBe(packet.events.length*4);expect(packet.retainedOccurrences).toBe(retained.length*4);expect(packet.suppressedOccurrences).toBe((packet.events.length-retained.length)*4);
 const tail=retained.find(e=>e.id==="cross-off-tail");if(tail===undefined)throw new Error("Missing tail witness");expect(tail.start+tail.gate).toBeGreaterThan(packet.offStarts);
 expect(packet.events.filter(e=>e.start<=11520).map(e=>e.id)).not.toEqual(packet.retainedIds);
 expect(packet.events.filter(e=>e.start%15360<7680).map(e=>e.id)).not.toEqual(packet.retainedIds);
 expect(packet.passStartsSeconds[1]).not.toEqual([6,1]);
});
test("audible labels use exact half-open epochs and never promise a fifth return",()=>{
 for(const row of packet.audible){const n=row.now[0],d=row.now[1];if(n===undefined||d===undefined)throw new Error("Missing time");const elapsed=n-2*d;const pass=Math.min(3,Math.max(0,Math.floor(elapsed/(8*d))));const within=elapsed-pass*8*d;const state=elapsed<0?"count-in":elapsed>=32*d?"finished":within<4*d?"in":pass===3?"out-end":"out-return";
  expect(row.pass).toBe(pass);expect(row.state).toBe(state);expect(row.remaining).toBe(state.startsWith("out")?Math.ceil((8*d-within)*2/d):null);
 }
});
test("all declared scope refusals have an honest accepted twin",()=>{
 for(const row of packet.scopeEdges)expect(row.accepted).toBe(row.bars===4&&row.quarterTicks===3840&&row.aligned&&row.sameKey&&row.audible);
 expect(packet.scopeEdges.filter(row=>row.accepted)).toHaveLength(1);
});
test("exact repeated spellings remain separate and lifecycle mutations are future obligations",()=>{
 const semitones:Readonly<Record<string,number>>={C:0,D:2};expect(packet.pitches.map(p=>12*(p.octave+1)+(semitones[p.step]??NaN)+p.alter)).toEqual(packet.midi);
 expect(packet.pitches).toHaveLength(3);expect(packet.pitches[0]).toEqual(packet.pitches[2]);expect(packet.pitches[0]).not.toEqual(packet.pitches[1]);
 expect(new Set(packet.mutationWitnesses).size).toBe(8);expect(packet.lifetime).toHaveLength(10);
});

test("source translation and pitch transposition cannot change the occurrence mask",()=>{
 for(const shift of [-3840,9600])expect(packet.events.filter(e=>e.start+shift>=3840+shift&&e.start+shift<11520+shift).map(e=>e.id)).toEqual(packet.retainedIds);
 for(const semitones of [-12,12]){const moved=packet.midi.map(p=>p+semitones);expect(moved.map(p=>p-semitones)).toEqual(packet.midi);expect(moved).toHaveLength(3);expect(packet.events.filter(e=>e.retained).map(e=>e.id)).toEqual(packet.retainedIds);}
});
