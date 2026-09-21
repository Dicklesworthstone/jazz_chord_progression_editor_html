import {expect,test} from "bun:test";
import {createE0InterchangeOperations} from "../../src/application/e0-interchange";
import {CANONICAL_JSON_ARTIFACT_SCHEMA,CANONICAL_JSON_MEDIA_TYPE,type CanonicalJsonArtifact,type SemanticDocumentHash} from "../../src/export";
import {loopArrangementFixture} from "../support/loop-arrangement-fixture";

const unused=():never=>{throw new Error("Unexpected import port");};
// Script only the external delivery/owner ports; use the real operations and registry.
async function setup(reply:(documentId:string,revision:number)=>unknown){
  const {state}=loopArrangementFixture();let publications=0,persistence=0,starts=0;
  const artifact:CanonicalJsonArtifact={schema:CANONICAL_JSON_ARTIFACT_SCHEMA,kind:"canonical-json" as const,mediaType:CANONICAL_JSON_MEDIA_TYPE,filename:"JazzChords.org.changes.json",text:"{}\n",byteLength:3,semanticDocumentHash:"a".repeat(64) as SemanticDocumentHash,sourceDocumentId:state.document.id};
  const operations=createE0InterchangeOperations({
    prepareImportPreview:{preflightDocumentImportBytes:unused,decodeUtf8Fatal:unused,classifyJsonLexically:unused,parseJsonData:unused,decodeDocumentShape:unused,validateDocumentSemantics:unused,migrateLegacyJson:unused,legacyMigrationDependencies:{idFactory:{next:unused},parseChordSymbol:unused,resolveChord:unused},parseChartText:unused,buildChartDocumentCandidate:unused,assessImportReplacementImpact:unused,chartIdFactory:{next:unused}},
    prepareImportReplacementPublication:unused,retireImportReplacement:unused,discardImportReplacementPublication:unused,publishImportReplacement:unused,
    prepareCanonicalJsonExport:()=>Promise.resolve({ok:true,value:artifact}),
    readCurrentApplicationDocumentIdentity:()=>({documentId:state.document.id,revision:state.revision}),readExportTimestamp:()=>"2026-09-20T00:00:00.000Z",
    startPreparedExportDelivery:r=>{starts++;return {completion:Promise.resolve({ok:true,outcome:"handed-off",channel:"object-url-download",artifact:r.binding,cleanup:"complete",objectUrlsCreated:1,objectUrlsRevoked:1,outstandingOwnedResources:0,bytesOffered:r.binding.byteLength})};},
    settlementAdapters:{publishCanonicalExportRevision:()=>{publications++;return reply(state.document.id,state.revision);},queueCanonicalExportMarkerPersistence:()=>{persistence++;return Promise.resolve({ok:true,outcome:"persisted",durability:"recovery-persisted"});}},
  });
  const prepared=await operations.prepareCanonicalExportDelivery({state});if(!prepared.ok)throw Error(prepared.outcome);
  const complete=()=>operations.completeCanonicalExportMarkerSettlement({state,preparationId:prepared.binding.preparationId,deliveryPreference:"download-only"});
  return {complete,operations,state,counts:()=>({publications,persistence,starts})};
}

const published=(documentId:string,revision:number)=>({ok:true,outcome:"published",documentId,revision});
const refused=(code:string)=>({ok:false,outcome:"refused",code,observedDocumentId:"new-document",observedRevision:7});
for(const code of ["export.marker_publication_stale","export.marker_publication_failed"])test(`legacy marker snapshots honest ${code}`,async()=>{
 const raw=refused(code),s=await setup(()=>raw),r=await s.complete();
 expect(r.outcome).toBe("publication-refused");if(r.outcome!=="publication-refused")throw Error("Wrong outcome");
 const snapshot:unknown=r.a0Publication.result;expect(snapshot).toEqual(raw);expect(snapshot).not.toBe(raw);expect(Object.isFrozen(snapshot)).toBe(true);
 raw.observedDocumentId="changed";expect(r.a0Publication.result.observedDocumentId).toBe("new-document");expect(s.counts()).toEqual({starts:1,publications:1,persistence:0});
});
test("legacy marker snapshots matching published receipt",async()=>{
 let raw=published("",0);const s=await setup((id,revision)=>{raw=published(id,revision);return raw;});const r=await s.complete();
 expect(r.outcome).toBe("advanced");if(r.outcome!=="advanced")throw Error("Wrong outcome");const snapshot:unknown=r.a0Publication.result;
 expect(snapshot).toEqual(raw);expect(snapshot).not.toBe(raw);expect(Object.isFrozen(snapshot)).toBe(true);
 raw.documentId="changed";expect(r.a0Publication.result.documentId).toBe(s.state.document.id);expect(s.counts()).toEqual({starts:1,publications:1,persistence:1});
});
const cases:readonly [string,(id:string,revision:number)=>unknown][]=[
 ["missing success fields",()=>({ok:true})],
 ["wrong outcome",(id,r)=>({...published(id,r),outcome:"refused"})],
 ["wrong document",(_,r)=>published("other-document",r)],
 ["wrong revision",(id,r)=>published(id,r+1)],
 ["extra state",(id,r)=>({...published(id,r),state:{}})],
 ["symbol key",(id,r)=>({...published(id,r),[Symbol("state")]:{}})],
 ["inherited fields",(id,r)=>{const raw:unknown=Object.create(published(id,r));return raw;}],
 ["unknown refusal code",()=>refused("invented")],
 ["missing refusal fields",()=>({ok:false})],
 ["contradictory refusal outcome",()=>({...refused("export.marker_publication_failed"),outcome:"published"})],
 ["invalid observed id",()=>({...refused("export.marker_publication_stale"),observedDocumentId:""})],
 ["invalid observed revision",()=>({...refused("export.marker_publication_stale"),observedRevision:-1})],
 ["fractional observed revision",()=>({...refused("export.marker_publication_stale"),observedRevision:0.5})],
 ["unsafe observed revision",()=>({...refused("export.marker_publication_stale"),observedRevision:Number.MAX_SAFE_INTEGER+1})],
 ["throwing reflection",(id,r)=>new Proxy(published(id,r),{getPrototypeOf(){throw Error("hostile");}})],
];
for(const [name,reply]of cases)test(`legacy marker refuses ${name} before persistence`,async()=>{
 const s=await setup(reply),r=await s.complete();expect(r.outcome).toBe("publication-protocol-invalid");
 if(r.outcome!=="publication-protocol-invalid")throw Error("Wrong outcome");
 expect(r.applicationReconciliation).toBe("required");expect(r.durability).toBe("unchanged");expect(r.a1Persistence).toBeNull();expect(r.a0Publication.protocolDiagnostic.rawResultRetained).toBe(false);
 expect(s.counts()).toEqual({starts:1,publications:1,persistence:0});expect((await s.complete()).outcome).toBe("prepared-export-unavailable");
});
for(const key of ["ok","outcome","documentId","revision","code","observedDocumentId","observedRevision"])test(`legacy marker never invokes ${key} getter`,async()=>{
 let reads=0;const s=await setup((id,r)=>Object.defineProperty(["code","observedDocumentId","observedRevision"].includes(key)?refused("export.marker_publication_stale"):published(id,r),key,{get(){reads++;throw Error("getter");}}));
 expect((await s.complete()).outcome).toBe("publication-protocol-invalid");expect(reads).toBe(0);expect(s.counts().persistence).toBe(0);
});
test("legacy marker accepts null-prototype own-data receipt",async()=>{
 const s=await setup((id,r)=>{const raw=published(id,r);Object.setPrototypeOf(raw,null);return raw;});expect((await s.complete()).outcome).toBe("advanced");
});
test("legacy marker contains synchronous adapter failure",async()=>{
 const s=await setup(()=>{throw Error("external failure");});const r=await s.complete();expect(r.outcome).toBe("publication-protocol-invalid");expect(s.counts().persistence).toBe(0);
});
