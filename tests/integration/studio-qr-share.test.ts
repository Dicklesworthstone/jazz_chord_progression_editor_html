import {expect,test} from "bun:test";
import {deflateSync,inflateSync} from "node:zlib";
import {createStudioBootstrap,createStudioCompositionOverState,createStudioDocumentImport,createX1SerializedTransportRetirementAdapter} from "../../src/application";
import {createStudioExactShare} from "../../src/application/studio-exact-share";
import {createStudioLifecycle} from "../../src/application/studio-lifecycle";
import {decodeSharedStartupWithQr,encodeQrShareText} from "../../src/application/qr-share";
import {applyExactSharedStartup} from "../../src/application/exact-share-startup";
import {createRecoveryHarness} from "../support/recovery-test-kit";
import {createTransportHarness} from "../support/transport-test-kit";
import type {BoundedCompressionPort} from "../../src/export/browser-compression";
import fixture from "../fixtures/exact-share/document.changes.json";
const native:BoundedCompressionPort=bytes=>Promise.resolve(deflateSync(bytes));
function harness(compress:BoundedCompressionPort=native){
 const bootstrap=createStudioBootstrap();if(!bootstrap.ok)throw new Error("bootstrap");const composition=createStudioCompositionOverState(bootstrap.value.state,bootstrap.value.dependencies),recovery=createRecoveryHarness(),transport=createTransportHarness();
 const retirement=createX1SerializedTransportRetirementAdapter(transport.service,transport.nextRequestId,{beforeSubmit:composition.replacementWorkflow.expectTransportRetirement,settled:composition.replacementWorkflow.settleTransportRetirement});
 const lifecycle=createStudioLifecycle({composition,recovery:recovery.service,hashBytes:bytes=>Promise.resolve(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")),nowIso:()=>"2026-09-10T12:00:00Z",startDelivery:()=>{throw new Error("Unexpected download");}});
 const importer=createStudioDocumentImport({composition,recovery:recovery.service,retirement,exportCurrent:()=>{void lifecycle.openExport();}}),copied:string[]=[];
 const sharing=createStudioExactShare({composition,lifecycle,readLocation:()=>"file:///private/studio.html",writeClipboard:text=>{copied.push(text);return Promise.resolve();},compress});return{composition,sharing,copied,importer};
}
test("QR is explicit, immutable, source-bound and changes no document/history/export marker",async()=>{
 let calls=0;const h=harness(bytes=>{calls++;return native(bytes,880);}),s=h.sharing,before=h.composition.readApplicationState();await s.prepareQr();expect(calls).toBe(0);s.open();expect(calls).toBe(0);await s.prepareQr();expect(calls).toBe(1);const qr=s.getSnapshot().qr;expect(qr).not.toBeNull();expect(s.getSnapshot().qrPhase).toBe("ready");expect(qr?.url).toContain("#zdoc=3.");expect(s.getSnapshot().url).toContain("#zdoc=2.");expect(h.composition.readApplicationState().document).toBe(before.document);expect(h.composition.readApplicationState().history).toBe(before.history);expect(h.composition.readApplicationState().exportRevision).toBe(before.exportRevision);await s.copy();const copied:unknown=h.copied[0];expect(copied).toBe(s.getSnapshot().url);s.cancel();expect(s.getSnapshot().qr).toBeNull();
});
test("source edit immediately removes an old code and requires fresh preparation consent",async()=>{
 const h=harness(),s=h.sharing;s.open();await s.prepareQr();expect(s.getSnapshot().qr).not.toBeNull();h.composition.controller.setTitle("Edited");expect(s.getSnapshot().qr).toBeNull();expect(s.getSnapshot().qrPhase).toBe("stale");await s.prepareQr();expect(s.getSnapshot().qr).toBeNull();await s.prepareQr();expect(s.getSnapshot().qrPhase).toBe("ready");
});
for(const action of ["edit","cancel-reopen","overlay"] as const)test(`late preparation cannot cross ${action} and does not block a fresh attempt`,async()=>{
 const inputs:Uint8Array[]=[];let settle:((bytes:Uint8Array)=>void)|undefined,calls=0,signal:AbortSignal|undefined;
 const h=harness((bytes,_limit,s)=>{calls++;if(calls>1)return native(bytes,880);inputs.push(bytes);signal=s;return new Promise<Uint8Array>(r=>{settle=r;});}),service=h.sharing;service.open();const pending=service.prepareQr();await service.prepareQr();expect(calls).toBe(1);
 if(action==="edit")h.composition.controller.setTitle("New chart revision");else if(action==="cancel-reopen"){service.cancel();service.open();}else{expect(h.composition.replacementWorkflow.applyLifecycleIntent({kind:"push-dialog",dialog:{id:"other-share",kind:"exact-share",phase:"open",blocksHistory:false,requestId:null}}).ok).toBe(true);expect(h.composition.replacementWorkflow.applyLifecycleIntent({kind:"pop-dialog",dialogId:"other-share"}).ok).toBe(true);}
 expect(signal?.aborted).toBe(true);expect(service.getSnapshot().qr).toBeNull();const input=inputs[0];if(input===undefined)throw new Error("No compression");settle?.(deflateSync(input));await pending;expect(service.getSnapshot().qr).toBeNull();await service.prepareQr();if(action==="edit")await service.prepareQr();expect(service.getSnapshot().qrPhase).toBe("ready");
});
test("compression refusal retains ordinary copy and JSON workflows",async()=>{
 const h=harness(()=>Promise.resolve(new Uint8Array(881))),s=h.sharing;s.open();await s.prepareQr();expect(s.getSnapshot().qrPhase).toBe("refused");expect(s.getSnapshot().qr).toBeNull();await s.copy();expect(h.copied[0]).toContain("#zdoc=2.");s.downloadJson();expect(h.composition.readApplicationState().dialogs.at(-1)?.kind).toBe("lifecycle-export");
});
test("compressed receiver still publishes only through exact E0/F2/F3 validation",async()=>{
 for(const invalid of [false,true]){const h=harness(),before=h.composition.readApplicationState(),text=JSON.stringify(fixture).replace('"numerator":5',invalid?'"numerator":0':'"numerator":5');const wire=await encodeQrShareText(text,native);if(!wire.ok)throw new Error(wire.message);const decoded=await decodeSharedStartupWithQr(wire.value.fragment,bytes=>Promise.resolve(inflateSync(bytes)));if(!decoded.ok||decoded.value.version!==2)throw new Error("Decode failed");const result=await applyExactSharedStartup(h.composition,h.importer,decoded.value.text);expect(result.applied).toBe(!invalid);if(invalid){expect(h.composition.readApplicationState().document).toBe(before.document);expect(h.composition.readApplicationState().history).toBe(before.history);}else{const observed:unknown=h.composition.readApplicationState().document;expect(observed).toEqual(fixture);expect(h.composition.controller.undo().ok).toBe(true);expect(h.composition.readApplicationState().document).toEqual(before.document);}}
});
