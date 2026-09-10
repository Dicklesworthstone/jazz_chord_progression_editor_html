import {expect,test} from "bun:test";
import {deflateSync,inflateSync} from "node:zlib";
import fixture from "../fixtures/exact-qr/compression.json";
import document from "../fixtures/exact-share/document.changes.json";
import {encodeQrShareText,decodeSharedStartupWithQr,prepareExactQr} from "../../src/application/qr-share";
import {compactCanonicalShareDocument,decodeSharedStartup} from "../../src/application/exact-share";
import {decodeDocumentShape} from "../../src/domain";
import {validateDocumentSemantics} from "../../src/application/document-validation";
import {compressBrowserBytes,inflateBrowserBytes} from "../../src/export/browser-compression";
import type {BoundedCompressionPort} from "../../src/export/browser-compression";
const compress:BoundedCompressionPort=bytes=>Promise.resolve(deflateSync(bytes)),inflate:BoundedCompressionPort=bytes=>Promise.resolve(inflateSync(bytes));
async function rejects(promise:Promise<unknown>){let rejected=false;try{await promise;}catch(error){expect(error).toBeInstanceOf(Error);rejected=true;}expect(rejected).toBe(true);}
for(const c of fixture.cases)test(`independent zlib wire: ${c.name}`,async()=>{
 expect(await decodeSharedStartupWithQr(c.fragment,inflate)).toEqual({ok:true,value:{version:2,text:c.text}});
 const encoded=await encodeQrShareText(c.text,compress);expect(encoded.ok).toBe(true);if(!encoded.ok)throw new Error(encoded.message);expect(inflateSync(Buffer.from(encoded.value.fragment.slice(8),"base64url")).toString("utf8")).toBe(c.text);expect(encoded.value.jsonBytes).toBe(new TextEncoder().encode(c.text).length);
});
test("exact JSON lexical representation, negative zero, Unicode and repeated notes survive QR",async()=>{
 const decoded=decodeDocumentShape({...document,playback:{...document.playback,masterVolume:-0}});if(!decoded.ok)throw new Error("Invalid fixture");const validated=validateDocumentSemantics(decoded.value);if(!validated.ok)throw new Error("Invalid fixture semantics");
 const text=compactCanonicalShareDocument(validated.value),encoded=await encodeQrShareText(text,compress);expect(text).toContain('"masterVolume":-0');expect(encoded.ok).toBe(true);if(!encoded.ok)throw new Error(encoded.message);
 expect(await decodeSharedStartupWithQr(encoded.value.fragment,inflate)).toEqual({ok:true,value:{version:2,text}});
 const qr=await prepareExactQr(validated.value,"file:///private/name.html",compress);expect(qr.ok).toBe(true);if(!qr.ok)throw new Error(qr.message);expect(qr.value.url).toStartWith("https://jazzchords.org/#zdoc=3.");expect(qr.value.url.length).toBeLessThanOrEqual(1190);expect(qr.value.matrix.version).toBeLessThanOrEqual(28);
});
test("v1/v2/absent/unsupported routes retain their existing exact outcomes",async()=>{
 for(const fragment of ["#section","#zdoc=2.e30","#zdoc=4.e30","#zdoc=1.e30"]){let calls=0;expect(await decodeSharedStartupWithQr(fragment,()=>{calls++;return Promise.resolve(new Uint8Array());})).toEqual(decodeSharedStartup(fragment));expect(calls).toBe(0);}
});
test("wire near misses refuse before inflation; dishonest ports cannot bypass decoded or packed caps",async()=>{
 for(const payload of ["","a","Zh","e30=","e30?x","e30\n","x".repeat(1175)]){let calls=0;expect((await decodeSharedStartupWithQr("#zdoc=3."+payload,()=>{calls++;return Promise.resolve(new Uint8Array());})).ok).toBe(false);expect(calls).toBe(0);}
 const valid=fixture.cases[0]?.fragment??"";
 for(const bytes of [new Uint8Array(6139),new Uint8Array(),new Uint8Array([0xc3,0x28])])expect((await decodeSharedStartupWithQr(valid,()=>Promise.resolve(bytes))).ok).toBe(false);
 for(const bytes of [new Uint8Array(881),new Uint8Array()])expect((await encodeQrShareText("{}",()=>Promise.resolve(bytes))).ok).toBe(false);
 let calls=0;expect((await encodeQrShareText("é".repeat(3070),()=>{calls++;return Promise.resolve(new Uint8Array([1]));})).ok).toBe(false);expect(calls).toBe(0);
});
test("native bounded streams preserve the exact cap and refuse checksum, UTF-8 and expansion bombs",async()=>{
 const exact="x".repeat(6138),packed=await compressBrowserBytes(new TextEncoder().encode(exact),880);expect(new TextDecoder().decode(await inflateBrowserBytes(packed,6138))).toBe(exact);
 for(const bytes of [deflateSync(Buffer.from("x".repeat(6139))),deflateSync(Buffer.from("x".repeat(100000))),new Uint8Array([1,2,3])])await rejects(inflateBrowserBytes(bytes,6138));
 const corrupt=Uint8Array.from(packed);corrupt[corrupt.length-1]=(corrupt.at(-1)??0)^1;await rejects(inflateBrowserBytes(corrupt,6138));
 const abort=new AbortController();abort.abort();await rejects(compressBrowserBytes(new Uint8Array([1]),880,abort.signal));
 expect((await decodeSharedStartupWithQr("#zdoc=3."+Buffer.from(deflateSync(new Uint8Array([0xc3,0x28]))).toString("base64url"),inflateBrowserBytes)).ok).toBe(false);
});
