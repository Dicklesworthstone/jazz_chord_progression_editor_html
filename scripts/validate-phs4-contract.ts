import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Obj = Record<string, unknown>;
export type Finding = Readonly<{ code: string; path: string; message: string }>;
export type Report = Readonly<{
  schema: "changes.validation.phs4-plucked-string-v2.v1";
  package: "PHS4";
  outcome: "pass" | "fail";
  counts: Readonly<{ targets: number; stringSets: number; bodies: number; physicsCases: number; metricCases: number; metricFamilies: number; authorities: number; traceRequirements: number; mutationControls: number }>;
  findings: readonly Finding[];
}>;
const ROOT = new URL("../tests/fixtures/plucked-string-v2", import.meta.url).pathname;
const LIMITS = { maximumStemEvents:128, maximumStrings:12, maximumFrets:36, maximumStringDelaySamples:65536, maximumBodyModes:64, maximumCqcPairs:32, maximumSympatheticStrings:12, maximumContactIterations:8, maximumSlideTransientFrames:24000, maximumAmpOversampleFactor:4, maximumStateBytes:1048576, maximumStemSeconds:30, maximumSampleRateHz:96000 };
function obj(value: unknown): Obj { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Obj : {}; }
function arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function canon(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`; if (typeof value === "object" && value !== null) return `{${Object.keys(value as Obj).sort().map((key) => `${JSON.stringify(key)}:${canon((value as Obj)[key])}`).join(",")}}`; return JSON.stringify(value); }
async function json(path: string): Promise<Obj> { return obj(JSON.parse(await readFile(path, "utf8")) as unknown); }
function add(findings: Finding[], code: string, path: string, message: string): void { findings.push({ code, path, message }); }
function row(rows: unknown[], id: string): Obj { return obj(rows.find((value) => obj(value)["id"] === id)); }

export async function validatePhs4Contract(fixtureRoot = ROOT): Promise<Report> {
  const root = resolve(fixtureRoot);
  const [contract, packs, physicsDoc, metricsDoc, provenanceDoc, traceDoc, mutationsDoc] = await Promise.all([
    json(resolve(root,"contract.json")), json(resolve(root,"instrument-packs.json")), json(resolve(root,"physics-cases.json")), json(resolve(root,"metric-cases.json")), json(resolve(root,"provenance-ledger.json")), json(resolve(root,"trace-ledger.json")), json(resolve(root,"mutation-controls.json")),
  ]);
  const findings: Finding[] = [], targets = arr(contract["recipeTargets"]), stringSets = arr(packs["stringSets"]), bodies = arr(packs["bodies"]), physics = arr(physicsDoc["cases"]), metrics = arr(metricsDoc["cases"]), authorities = arr(provenanceDoc["authorities"]), traces = arr(traceDoc["requirements"]), mutations = arr(mutationsDoc["controls"]);
  if (contract["schema"] !== "changes.fixtures.phs4-plucked-string-v2.v1" || contract["modelSchema"] !== "changes.dsp.plucked-string-family-v2.v1") add(findings,"PHS4_SCHEMA","/schema","Plucked-string schema changed");
  const target = (instrumentId: string): Obj => obj(targets.find((value) => obj(value)["instrumentId"] === instrumentId));
  if (targets.length !== 5 || target("guitar")["publicLabel"] !== "Clean Archtop" || target("blues-guitar")["publicLabel"] !== "Lightly Driven Electric" || target("physical-upright-bass")["arco"] !== "explicitly-deferred") add(findings,"PHS4_TARGETS","/recipeTargets","Honest target names or comparator scope changed");
  if (contract["waveLaw"] !== "two-polarization-bidirectional-stiff-string-with-frequency-dependent-loss") add(findings,"PHS4_WAVES","/waveLaw","Bidirectional stiff-string law changed");
  if (contract["bridgeLaw"] !== "passive-multiport-scattering-loaded-by-body-mechanical-admittance" || contract["bodyLaw"] !== "geometry-derived-modal-admittance-with-cqc-near-degenerate-pairs-and-feedback-to-all-strings") add(findings,"PHS4_BRIDGE","/bridgeLaw","Bridge/body feedback law changed");
  const controls = obj(contract["controls"]); if (canon(controls["pluckForceN"]) !== canon([0,12]) || canon(controls["slideVelocityMPerS"]) !== canon([-4,4]) || canon(controls["sympatheticAmount"]) !== canon([0,1])) add(findings,"PHS4_CONTROLS","/controls","Gesture units or ranges changed");
  if (arr(contract["retainedState"]).length !== 10) add(findings,"PHS4_STATE","/retainedState","Shared stem state changed");
  if (canon(contract["limits"]) !== canon(LIMITS)) add(findings,"PHS4_LIMITS","/limits","Deterministic bounds changed");
  const independence = obj(contract["independence"]); if (independence["productionImportsForbidden"] !== true || independence["productionOutputUsed"] !== false || independence["expectedValuesGenerated"] !== false || independence["frankensimRuntimeImported"] !== false) add(findings,"PHS4_INDEPENDENCE","/independence","Independent authority or license boundary changed");
  const ukuleleStrings = arr(row(stringSets,"nylon-reentrant-uke")["strings"]);
  if (packs["schema"] !== "changes.fixtures.phs4-plucked-string-packs.v1" || stringSets.length !== 5 || bodies.length !== 5 || arr(row(stringSets,"steel-archtop-12s")["strings"]).length !== 6 || arr(ukuleleStrings[0])[0] !== "g4" || row(bodies,"upright-bass")["helmholtzHz"] !== 75) add(findings,"PHS4_PACKS","/instrument-packs","Reviewed string/body packs changed");
  if (physics.length !== 16) add(findings,"PHS4_CASES","/physics-cases","Physics corpus changed");
  if (obj(row(physics,"ideal-string-e2")["expected"])["frequencyHz"] !== 82.327523683 || row(metrics,"octave-transposition")["expectedRatio"] !== 2) add(findings,"PHS4_KNOWN_ANSWER","/known-answers","Independent known answer changed");
  if (obj(row(physics,"active-bridge-mutation")["expected"])["outcome"] !== "refuse") add(findings,"PHS4_PASSIVITY","/physics-cases/active-bridge-mutation","Active bridge must refuse");
  if (obj(row(physics,"cqc-correlated-pair")["expected"])["combinedEnergy"] !== 3) add(findings,"PHS4_CQC","/physics-cases/cqc-correlated-pair","CQC correlation term changed");
  const metricFamilies = new Set(metrics.map((value) => String(obj(value)["metric"]))); for (const required of ["pitch","inharmonicity","decay-slope","body-admittance","pluck-null","pickup-comb","sympathetic-response","amp-alias","transposition-relations"]) if (!metricFamilies.has(required)) add(findings,"PHS4_METRICS","/metric-cases",`Missing ${required}`);
  if (metrics.length !== 14) add(findings,"PHS4_METRICS","/metric-cases","Metric corpus changed");
  if (authorities.length !== 5 || row(authorities,"string-body-coupling")["location"] !== "https://hal.science/tel-01078150" || row(authorities,"frankensim-solid-contact-concepts")["runtimeAuthority"] !== false) add(findings,"PHS4_PROVENANCE","/provenance-ledger","Authority boundary changed");
  if (traces.length !== 7) add(findings,"PHS4_TRACE","/trace-ledger","Requirement trace changed");
  if (mutations.length !== 15) add(findings,"PHS4_MUTATIONS","/mutation-controls","Mutation count changed");
  return { schema:"changes.validation.phs4-plucked-string-v2.v1", package:"PHS4", outcome:findings.length===0?"pass":"fail", counts:{targets:targets.length,stringSets:stringSets.length,bodies:bodies.length,physicsCases:physics.length,metricCases:metrics.length,metricFamilies:metricFamilies.size,authorities:authorities.length,traceRequirements:traces.length,mutationControls:mutations.length}, findings };
}
if (import.meta.main) { const report = await validatePhs4Contract(process.argv[2]); console.log(JSON.stringify(report,null,2)); if (report.outcome !== "pass") process.exitCode = 1; }
