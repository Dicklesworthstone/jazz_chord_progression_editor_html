import {expect,test} from "bun:test";
import {encodePcm16Wav} from "../../src/export/wav";
import fixture from "../fixtures/short-piano-wav/cases.json";
test("independent RIFF header and signed interleaved PCM16 vector",()=>{
 const p=fixture.pcm,result=encodePcm16Wav(new Float32Array(p.left),new Float32Array(p.right));if(!result.ok)throw new Error(result.message);
 const bytes=result.bytes,d=new DataView(bytes.buffer),ascii=(at:number,n:number)=>String.fromCharCode(...bytes.slice(at,at+n));
 expect(bytes.length).toBe(64);expect(ascii(0,4)).toBe("RIFF");expect(ascii(8,4)).toBe("WAVE");expect(ascii(12,4)).toBe("fmt ");expect(ascii(36,4)).toBe("data");
 expect([d.getUint32(4,true),d.getUint32(16,true),d.getUint16(20,true),d.getUint16(22,true),d.getUint32(24,true),d.getUint32(28,true),d.getUint16(32,true),d.getUint16(34,true),d.getUint32(40,true)]).toEqual([56,16,1,2,32000,128000,4,16,20]);
 expect(Array.from({length:10},(_v,i)=>d.getInt16(44+2*i,true))).toEqual(p.interleavedInt16);
});
test("WAV exact frame ceiling admits maximum and refuses oversize/invalid samples",()=>{
 const good=encodePcm16Wav(new Float32Array(518400),new Float32Array(518400));if(!good.ok)throw new Error(good.message);expect(good.bytes.length).toBe(2073644);
 for(const [l,r]of [[new Float32Array(),new Float32Array()],[new Float32Array(518401),new Float32Array(518401)],[new Float32Array(1),new Float32Array(2)],[new Float32Array([NaN]),new Float32Array(1)],[new Float32Array([1.01]),new Float32Array(1)],[new Float32Array(1),new Float32Array([-Infinity])]]){if(l===undefined||r===undefined)throw new Error("Bad fixture");expect(encodePcm16Wav(l,r).ok).toBe(false);}
});
