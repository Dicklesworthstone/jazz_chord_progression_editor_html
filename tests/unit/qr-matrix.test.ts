import {expect,test} from "bun:test";
import {createHash} from "node:crypto";
import masks from "../fixtures/exact-qr/all-masks.json";
import fixture from "../fixtures/exact-qr/vectors.json";
import {encodeQrAscii,qrByteCapacity,qrModulePath} from "../../src/export/qr-matrix";
for(const c of fixture.cases)test(`independent libqrencode matrix ${c.name}`,()=>{
 const r=encodeQrAscii(c.text,{version:c.version,mask:c.mask});expect(r.ok).toBe(true);if(!r.ok)throw new Error(r.message);expect(r.matrix.rows).toEqual(c.rows);expect(r.matrix.size).toBe(c.size);expect(createHash("sha256").update(r.matrix.rows.join("\n")+"\n").digest("hex")).toBe(c.sha256);expect(r.work.maskCandidates).toBe(1);
});
test("all capacities fit exactly, next byte advances or refuses, and work is deterministically bounded",()=>{
 for(let v=1;v<=28;v++){const bytes=qrByteCapacity(v),r=encodeQrAscii("x".repeat(bytes),{version:v});expect(r.ok).toBe(true);if(!r.ok)throw new Error(r.message);expect(r.matrix.version).toBe(v);expect(r.work.maskCandidates).toBe(8);expect(r.work.gfMultiplications).toBeLessThan(100000);expect(r.work.moduleVisits).toBeLessThan(2000000);expect(encodeQrAscii("x".repeat(bytes+1),{version:v}).ok).toBe(false);}
 expect(qrByteCapacity(1)).toBe(14);expect(qrByteCapacity(28)).toBe(1190);
});
test("automatic encoding is immutable and deterministic; changed bytes cannot reuse its matrix",()=>{
 const a=encodeQrAscii("https://jazzchords.org/#zdoc=3.ABCD"),b=encodeQrAscii("https://jazzchords.org/#zdoc=3.ABCD"),c=encodeQrAscii("https://jazzchords.org/#zdoc=3.ABCE");expect(a).toEqual(b);expect(a).not.toEqual(c);if(!a.ok)throw new Error(a.message);expect(Object.isFrozen(a.matrix.rows)).toBe(true);expect(a.work.termination).toBe("complete");expect(qrModulePath(a.matrix)).toStartWith("M4 4h7v1h-7z");
});
test("empty, Unicode, oversized payload and invalid version/mask refuse before matrix work",()=>{
 for(const [text,options]of [["",{}],["é",{}],["a\n",{}],["x".repeat(1191),{}],["x",{version:29}],["x",{version:0}],["x",{version:1.5}],["x",{mask:8}],["x",{mask:-1}]] as const){const r=encodeQrAscii(text,options);expect(r.ok).toBe(false);expect(r.work.moduleVisits).toBe(0);expect(r.work.termination).toBe("refused");}
});

test("all eight masks and 28 capacities agree with supplemental independent C references",()=>{
 for(const c of masks.cases){const r=encodeQrAscii(c.text,{version:c.version,mask:c.mask});expect(r.ok).toBe(true);if(!r.ok)throw new Error(r.message);expect(r.matrix.rows).toEqual(c.rows);}
 expect(Array.from({length:28},(_,i)=>qrByteCapacity(i+1))).toEqual(masks.capacities);
});

test("SVG runs reconstruct every independent module with exactly four white border modules",()=>{
 for(const c of fixture.cases){
  const r=encodeQrAscii(c.text,{version:c.version,mask:c.mask});if(!r.ok)throw new Error(r.message);
  const extent=c.size+8,rows=Array.from({length:extent},()=>Array<number>(extent).fill(0)),path=qrModulePath(r.matrix);
  const runs=[...path.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/gu)];expect(runs.map(m=>m[0]).join("")).toBe(path);
  for(const m of runs){const x=Number(m[1]),y=Number(m[2]),n=Number(m[3]);if(n!==Number(m[4])||x<4||y<4||x+n>extent-4||y>=extent-4)throw new Error("Run escapes the exact quiet zone");for(let i=0;i<n;i++){const row=rows[y];if(row===undefined||row[x+i]!==0)throw new Error("Missing or overlapping SVG row");row[x+i]=1;}}
  const empty="0".repeat(extent);expect(rows.map(row=>row.join(""))).toEqual([...Array<string>(4).fill(empty),...c.rows.map(row=>"0000"+row+"0000"),...Array<string>(4).fill(empty)]);
 }
});
