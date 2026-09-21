import {expect,test} from "bun:test";
import {createE0InterchangeOperations} from "../../src/application/e0-interchange";
import {CANONICAL_JSON_ARTIFACT_SCHEMA,CANONICAL_JSON_MEDIA_TYPE,type CanonicalJsonArtifact,type SemanticDocumentHash} from "../../src/export";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";

const unused=():never=>{throw new Error("Unexpected import port");};
// Script only the external delivery/owner ports; use the real operations and registry.
async function setup(reply:()=>unknown){
  const {state}=loopArrangementFixture();let publications=0,persistence=0,starts=0;
  const artifact:CanonicalJsonArtifact={schema:CANONICAL_JSON_ARTIFACT_SCHEMA,kind:"canonical-json" as const,mediaType:CANONICAL_JSON_MEDIA_TYPE,filename:"JazzChords.org.changes.json",text:"{}\n",byteLength:3,semanticDocumentHash:"a".repeat(64) as SemanticDocumentHash,sourceDocumentId:state.document.id};
  const operations=createE0InterchangeOperations({
    prepareImportPreview:{preflightDocumentImportBytes:unused,decodeUtf8Fatal:unused,classifyJsonLexically:unused,parseJsonData:unused,decodeDocumentShape:unused,validateDocumentSemantics:unused,migrateLegacyJson:unused,legacyMigrationDependencies:{idFactory:{next:unused},parseChordSymbol:unused,resolveChord:unused},parseChartText:unused,buildChartDocumentCandidate:unused,assessImportReplacementImpact:unused,chartIdFactory:{next:unused}},
    prepareImportReplacementPublication:unused,retireImportReplacement:unused,discardImportReplacementPublication:unused,publishImportReplacement:unused,
    prepareCanonicalJsonExport:()=>Promise.resolve({ok:true,value:artifact}),
    readCurrentApplicationDocumentIdentity:()=>({documentId:state.document.id,revision:state.revision}),readExportTimestamp:()=>"2026-09-20T00:00:00.000Z",
    startPreparedExportDelivery:r=>{starts++;return {completion:Promise.resolve({ok:true,outcome:"handed-off",channel:"object-url-download",artifact:r.binding,cleanup:"complete",objectUrlsCreated:1,objectUrlsRevoked:1,outstandingOwnedResources:0,bytesOffered:r.binding.byteLength})};},
    settlementAdapters:{publishCanonicalExportRevision:()=>{publications++;return {ok:true,outcome:"published",documentId:state.document.id,revision:state.revision};},queueCanonicalExportMarkerPersistence:()=>{persistence++;return Promise.resolve(reply());}},
  });
  const prepared=await operations.prepareCanonicalExportDelivery({state});if(!prepared.ok)throw Error(prepared.outcome);
  const complete=()=>operations.completeCanonicalExportMarkerSettlement({state,preparationId:prepared.binding.preparationId,deliveryPreference:"download-only"});
  return {complete,operations,state,counts:()=>({publications,persistence,starts})};
}

const persisted=()=>({ok:true,outcome:"persisted",durability:"recovery-persisted"});
const unavailable=()=>({ok:false,outcome:"unavailable",code:"recovery.marker_persistence_unavailable",durability:"pending-failed"});
const failed=()=>({ok:false,outcome:"failed",code:"recovery.marker_persistence_failed",durability:"pending-failed"});
for(const make of [persisted,unavailable,failed])test(`legacy persistence snapshots honest ${make().outcome}`,async()=>{
 const raw=make(),s=await setup(()=>raw),result=await s.complete();
 expect(result.outcome).toBe("advanced");expect<string>(result.durability).toBe(raw.durability);
 if(result.outcome!=="advanced")throw Error("Wrong outcome");
 const snapshot:unknown=result.a1Persistence.result;expect(snapshot).toEqual(raw);expect(result.a1Persistence.result).not.toBe(raw);expect(Object.isFrozen(result.a1Persistence.result)).toBe(true);
 raw.durability="changed";expect(result.a1Persistence.result.durability).not.toBe("changed");expect(s.counts()).toEqual({publications:1,persistence:1,starts:1});
});
const cases:readonly [string,()=>unknown][]=[
 ["missing receipt",()=>({ok:true})],
 ["contradictory outcome",()=>({...persisted(),outcome:"failed"})],
 ["contradictory durability",()=>({...persisted(),durability:"pending-failed"})],
 ["wrong failure code",()=>({...failed(),code:"recovery.marker_persistence_unavailable"})],
 ["wrong unavailable code",()=>({...unavailable(),code:"invented"})],
 ["extra state",()=>({...persisted(),state:{}})],
 ["missing code",()=>({ok:false,outcome:"failed",durability:"pending-failed"})],
 ["symbol authority",()=>({...persisted(),[Symbol("state")]:{}})],
 ["inherited fields",()=>{const raw:unknown=Object.create(persisted());return raw;}],
 ["throwing reflection",()=>new Proxy(persisted(),{getPrototypeOf(){throw Error("hostile");}})],
];
for(const [name,make]of cases)test(`legacy persistence refuses ${name}`,async()=>{
 const s=await setup(make),result=await s.complete();expect(result.outcome).toBe("persistence-protocol-invalid");expect(result.durability).toBe("reconciliation-required");expect(s.counts()).toEqual({publications:1,persistence:1,starts:1});
 expect((await s.complete()).outcome).toBe("prepared-export-unavailable");
});
for(const key of ["ok","outcome","durability","code"])test(`legacy persistence never invokes ${key} getter`,async()=>{
 let reads=0;const s=await setup(()=>Object.defineProperty(failed(),key,{get(){reads++;throw Error("getter");}}));
 expect((await s.complete()).outcome).toBe("persistence-protocol-invalid");expect(reads).toBe(0);
});
test("legacy persistence accepts a null-prototype data receipt",async()=>{
 const raw=persisted();Object.setPrototypeOf(raw,null);const s=await setup(()=>raw);expect((await s.complete()).durability).toBe("recovery-persisted");
});
test("legacy persistence contains adapter rejection",async()=>{
 const s=await setup(()=>{throw Error("external failure");});const result=await s.complete();expect(result.outcome).toBe("persistence-protocol-invalid");
 if(result.outcome!=="persistence-protocol-invalid")throw Error("Wrong outcome");expect(result.a1Persistence.protocolDiagnostic.reason).toBe("threw-or-rejected");
});
