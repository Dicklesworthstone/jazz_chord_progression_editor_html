import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Obj = Record<string, unknown>;
export type Finding = Readonly<{code:string;path:string;message:string}>;
export type Report = Readonly<{schema:"changes.validation.phs2-clarinet-v2.v1";package:"PHS2";outcome:"pass"|"fail";counts:Readonly<{physicsCases:number;metricCases:number;metricFamilies:number;authorities:number;mutationControls:number}>;findings:readonly Finding[]}>;
const ROOT = new URL("../tests/fixtures/clarinet-v2", import.meta.url).pathname;
const LIMITS = {maximumEvents:128,maximumPointsPerCurve:64,maximumPointsPerGesture:256,maximumBoreSections:24,maximumToneHoles:24,maximumNonlinearIterations:8,maximumFallbackBisections:16,maximumStateBytes:262144,maximumPhraseSeconds:30,maximumSampleRateHz:96000};
const METRICS = ["reed-equilibrium","reed-flow","impedance-peaks","fingering-pitch","attack-time","odd-even-balance","harmonic-to-noise","spectral-centroid","decay-slopes","register-transition","transposition-relations","legato-continuity","energy-residual"];
function obj(v:unknown):Obj{return typeof v==="object"&&v!==null&&!Array.isArray(v)?v as Obj:{}}
function arr(v:unknown):unknown[]{return Array.isArray(v)?v:[]}
function canon(v:unknown):string{if(Array.isArray(v))return`[${v.map(canon).join(",")}]`;if(typeof v==="object"&&v!==null)return`{${Object.keys(v as Obj).sort().map(k=>`${JSON.stringify(k)}:${canon((v as Obj)[k])}`).join(",")}}`;return JSON.stringify(v)}
async function json(path:string):Promise<Obj>{return obj(JSON.parse(await readFile(path,"utf8")) as unknown)}
function add(f:Finding[],code:string,path:string,message:string):void{f.push({code,path,message})}
function row(rows:unknown[],id:string):Obj{return obj(rows.find(v=>obj(v)["id"]===id))}

export async function validatePhs2Contract(fixtureRoot=ROOT):Promise<Report>{
 const root=resolve(fixtureRoot);const [contract,physicsDoc,metricsDoc,provenanceDoc,mutationsDoc]=await Promise.all([
  json(resolve(root,"contract.json")),json(resolve(root,"physics-cases.json")),
  json(resolve(root,"metric-cases.json")),json(resolve(root,"provenance-ledger.json")),
  json(resolve(root,"mutation-controls.json")),
 ]);
 const findings:Finding[]=[];const physics=arr(physicsDoc["cases"]);const metrics=arr(metricsDoc["cases"]);const authorities=arr(provenanceDoc["authorities"]);const mutations=arr(mutationsDoc["controls"]);
 if(contract["schema"]!=="changes.fixtures.phs2-clarinet-v2.v1"||contract["modelSchema"]!=="changes.dsp.clarinet-v2.v1")add(findings,"PHS2_SCHEMA","/schema","Clarinet schema changed");
 if(canon(contract["signs"])!==canon({pressure:"positive-compression",flow:"mouth-to-bore",reedOpening:"away-from-lay",deltaPressure:"mouth-minus-mouthpiece"}))add(findings,"PHS2_SIGNS","/signs","Pressure, flow, or reed sign changed");
 if(contract["vocalTractImpedance"]!=="explicitly-deferred")add(findings,"PHS2_SCOPE","/vocalTractImpedance","Deferred vocal tract may not be claimed");
 if(canon(obj(contract["controls"])["mouthPressurePa"])!==canon([0,8000])||canon(obj(contract["controls"])["tongueContact"])!==canon([0,1]))add(findings,"PHS2_CONTROLS","/controls","Control units or reviewed ranges changed");
 if(canon(contract["retainedLegatoState"])!==canon(["reed-displacement","reed-velocity","bore-waves","loss-filters","radiation"]))add(findings,"PHS2_STATE","/retainedLegatoState","Legato state continuity changed");
 if(canon(contract["limits"])!==canon(LIMITS))add(findings,"PHS2_LIMITS","/limits","Deterministic bounds changed");
 if(canon(contract["requiredMetrics"])!==canon(METRICS))add(findings,"PHS2_METRICS","/requiredMetrics","Metric obligations changed");
 const independence=obj(contract["independence"]);if(independence["productionImportsForbidden"]!==true||independence["productionOutputUsed"]!==false||independence["expectedValuesGenerated"]!==false)add(findings,"PHS2_INDEPENDENCE","/independence","Independent authority changed");
 if(physics.length!==12||row(physics,"solver-plus-one")["expected"]===undefined)add(findings,"PHS2_CASES","/physics-cases","Physics boundary corpus changed");
 if(obj(row(physics,"reed-static-open")["expected"])["openingM"]!==0.0002)add(findings,"PHS2_KNOWN_ANSWER","/physics-cases/reed-static-open","Static reed answer changed");
 if(obj(row(physics,"active-collision-mutation")["expected"])["outcome"]!=="refuse")add(findings,"PHS2_COLLISION","/physics-cases/active-collision-mutation","Active collision must refuse");
 if(metrics.length!==12||row(metrics,"twelfth-relation")["expectedRatio"]!==3)add(findings,"PHS2_KNOWN_ANSWER","/metric-cases/twelfth-relation","Clarinet twelfth relation changed");
 const metricFamilies=new Set(metrics.map(v=>String(obj(v)["metric"])));for(const required of ["fingering-pitch","odd-even-balance","harmonic-to-noise","spectral-centroid","attack-time","decay-slopes","transposition-relations","register-transition"])if(!metricFamilies.has(required))add(findings,"PHS2_METRICS","/metric-cases",`Missing ${required}`);
 if(authorities.length!==3||row(authorities,"tone-hole-lattice")["location"]!=="https://arxiv.org/abs/0901.1640")add(findings,"PHS2_PROVENANCE","/provenance-ledger","Primary authority changed");
 if(mutations.length!==11)add(findings,"PHS2_MUTATIONS","/mutation-controls","Mutation count changed");
 return{schema:"changes.validation.phs2-clarinet-v2.v1",package:"PHS2",outcome:findings.length===0?"pass":"fail",counts:{physicsCases:physics.length,metricCases:metrics.length,metricFamilies:metricFamilies.size,authorities:authorities.length,mutationControls:mutations.length},findings};
}
if(import.meta.main){const report=await validatePhs2Contract(process.argv[2]);console.log(JSON.stringify(report,null,2));if(report.outcome!=="pass")process.exitCode=1}
