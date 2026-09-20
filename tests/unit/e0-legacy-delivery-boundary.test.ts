import {expect,test} from "bun:test";
import {createE0InterchangeOperations} from "../../src/application/e0-interchange";
import {CANONICAL_JSON_ARTIFACT_SCHEMA,CANONICAL_JSON_MEDIA_TYPE,type ExportDeliveryArtifactBinding} from "../../src/export";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";

const unused=():never=>{throw new Error("Unexpected import port");};
// Script only the external delivery/owner ports; use the real operations and registry.
async function setup(reply:(binding:ExportDeliveryArtifactBinding)=>unknown,envelope:(raw:unknown)=>unknown=raw=>({completion:Promise.resolve(raw)})){
  const {state}=loopArrangementFixture();let publications=0,persistence=0,starts=0;
  const artifact={schema:CANONICAL_JSON_ARTIFACT_SCHEMA,kind:"canonical-json" as const,mediaType:CANONICAL_JSON_MEDIA_TYPE,filename:"JazzChords.org.changes.json",text:"{}\n",byteLength:3,semanticDocumentHash:"a".repeat(64),sourceDocumentId:state.document.id};
  const operations=createE0InterchangeOperations({
    prepareImportPreview:{preflightDocumentImportBytes:unused,decodeUtf8Fatal:unused,classifyJsonLexically:unused,parseJsonData:unused,decodeDocumentShape:unused,validateDocumentSemantics:unused,migrateLegacyJson:unused,legacyMigrationDependencies:{idFactory:{next:unused},parseChordSymbol:unused,resolveChord:unused},parseChartText:unused,buildChartDocumentCandidate:unused,assessImportReplacementImpact:unused,chartIdFactory:{next:unused}},
    prepareImportReplacementPublication:unused,retireImportReplacement:unused,discardImportReplacementPublication:unused,publishImportReplacement:unused,
    prepareCanonicalJsonExport:()=>Promise.resolve({ok:true,value:artifact}),
    readCurrentApplicationDocumentIdentity:()=>({documentId:state.document.id,revision:state.revision}),readExportTimestamp:()=>"2026-09-20T00:00:00.000Z",
    startPreparedExportDelivery:r=>{starts++;return envelope(reply(r.binding));},
    settlementAdapters:{publishCanonicalExportRevision:()=>{publications++;return {ok:false,outcome:"refused",code:"export.marker_publication_stale",observedDocumentId:state.document.id,observedRevision:state.revision};},queueCanonicalExportMarkerPersistence:()=>{persistence++;throw Error("Unexpected persistence");}},
  });
  const prepared=await operations.prepareCanonicalExportDelivery({state});if(!prepared.ok)throw Error(prepared.outcome);
  const complete=()=>operations.completeCanonicalExportMarkerSettlement({state,preparationId:prepared.binding.preparationId,deliveryPreference:"download-only"});
  return {complete,operations,state,counts:()=>({publications,persistence,starts})};
}
const cancelled=(artifact:ExportDeliveryArtifactBinding)=>({ok:true,outcome:"cancelled",channel:"file-system-access",artifact,cleanup:"complete",objectUrlsCreated:0,objectUrlsRevoked:0,outstandingOwnedResources:0});
const cleanup=()=>({ok:false,outcome:"cleanup-failed",channel:"object-url-download",artifact:null,cleanup:"reconciliation-required",code:"export.delivery_cleanup_failed",cleanupFailureKinds:["object-url-revoke"],objectUrlsCreated:1,objectUrlsRevoked:0,outstandingOwnedResources:1});
for(const kind of ["cancelled","failed","cleanup-failed","completed","handed-off"] as const)test(`legacy delivery admits honest ${kind} only once`,async()=>{
  const s=await setup(binding=>kind==="cleanup-failed"?cleanup():kind==="failed"?{...cancelled(binding),ok:false,outcome:kind,code:"export.delivery_write_failed"}:kind==="cancelled"?cancelled(binding):{...cancelled(binding),outcome:kind,channel:kind==="completed"?"file-system-access":"object-url-download",objectUrlsCreated:kind==="completed"?0:1,objectUrlsRevoked:kind==="completed"?0:1,bytesOffered:binding.byteLength});
  const result=await s.complete();expect(result.outcome).toBe(kind==="cancelled"?"unchanged-cancelled":kind==="failed"?"unchanged-failed":kind==="cleanup-failed"?"delivery-cleanup-reconciliation-required":"publication-refused");
  expect((await s.complete()).outcome).toBe("prepared-export-unavailable");expect(s.counts()).toEqual({starts:1,publications:kind==="completed"||kind==="handed-off"?1:0,persistence:0});
});
const malformed:readonly [string,(binding:ExportDeliveryArtifactBinding)=>unknown][]=[
  ["missing fields",()=>({ok:true,outcome:"cancelled"})],
  ["contradictory ok",b=>({...cancelled(b),ok:false})],
  ["wrong binding",b=>({...cancelled(b),artifact:{...b,filename:"other.json"}})],
  ["invalid resource count",b=>({...cancelled(b),outstandingOwnedResources:1})],
  ["wrong failure code",b=>({...cancelled(b),ok:false,outcome:"failed",code:"invented"})],
  ["false cleanup ledger",()=>({...cleanup(),outstandingOwnedResources:0})],
  ["wrong successful byte count",b=>({...cancelled(b),outcome:"completed",bytesOffered:b.byteLength+1})],
  ["extra authority",b=>({...cancelled(b),state:{exportRevision:999}})],
  ["throwing reflection",()=>new Proxy({},{getPrototypeOf(){throw Error("hostile");}})],
];
for(const [name,reply]of malformed)test(`legacy delivery refuses ${name}`,async()=>{
  const s=await setup(reply);const result=await s.complete();expect(result.outcome).toBe("delivery-protocol-invalid");expect(result.delivery).toBeNull();expect(s.counts()).toEqual({starts:1,publications:0,persistence:0});expect((await s.complete()).outcome).toBe("prepared-export-unavailable");
});
test("legacy delivery never invokes result getters or retains mutable receipts",async()=>{
  let reads=0;const s=await setup(b=>Object.defineProperty(cancelled(b),"ok",{get(){reads++;return true;}}));expect((await s.complete()).outcome).toBe("delivery-protocol-invalid");expect(reads).toBe(0);
  const raw=cleanup(),good=await setup(()=>raw),result=await good.complete();raw.cleanupFailureKinds[0]="anchor-remove";raw.outstandingOwnedResources=2;
  expect(result.delivery).toMatchObject({cleanupFailureKinds:["object-url-revoke"],outstandingOwnedResources:1});expect(result.delivery).not.toBe(raw);expect(Object.isFrozen(result.delivery)).toBe(true);
});
for(const shape of ["bare promise","direct result","getter envelope","extra envelope"] as const)test(`legacy delivery refuses ${shape}`,async()=>{
  let reads=0;const s=await setup(cancelled,raw=>shape==="bare promise"?Promise.resolve(raw):shape==="direct result"?raw:shape==="extra envelope"?{completion:Promise.resolve(raw),state:{}}:Object.defineProperty({},"completion",{get(){reads++;return Promise.resolve(raw);}}));
  expect((await s.complete()).outcome).toBe("delivery-protocol-invalid");expect(reads).toBe(0);expect(s.counts()).toEqual({starts:1,publications:0,persistence:0});
});
