import { expect, test } from "bun:test";
import { createE0InterchangeOperations } from "../../src/application/e0-interchange";
import { materializeE0WorkflowValues } from "../support/e0-interchange-fixture";

const unused = (): never => { throw new Error("Unexpected downstream port"); };
const request = materializeE0WorkflowValues().retainedTransportHandoffs.canonical.ready.commitRequest;
const preparationCodes = ["import.confirmation_stale", "import.confirmation_wrong_document", "import.replacement_impact_unavailable", "import.confirmation_impact_mismatch", "import.confirmation_identity_mismatch", "history.nonundoable_confirmation_required"] as const;
const retirementCodes = ["transport.replacement_retirement_unavailable", "transport.replacement_retirement_failed", "transport.replacement_retirement_stale"] as const;
// Script only the external ports to exercise the real legacy consumer's refusal boundary.
function setup(stage: "prepare" | "retire", reply: unknown) {
  let retirements = 0;
  const invalidations: string[] = [];
  const operations = createE0InterchangeOperations({
    prepareImportPreview: { preflightDocumentImportBytes: unused, decodeUtf8Fatal: unused, classifyJsonLexically: unused, parseJsonData: unused, decodeDocumentShape: unused, validateDocumentSemantics: unused, migrateLegacyJson: unused, legacyMigrationDependencies: { idFactory: { next: unused }, parseChordSymbol: unused, resolveChord: unused }, parseChartText: unused, buildChartDocumentCandidate: unused, assessImportReplacementImpact: unused, chartIdFactory: { next: unused } },
    prepareImportReplacementPublication: () => stage === "prepare" ? reply : { ok: true, value: { expectedTransportGeneration: request.currentState.transport.generation } },
    retireImportReplacement: () => { retirements++; return Promise.resolve(reply); },
    discardImportReplacementPublication: r => { invalidations.push(r.reason); return { outcome: "invalidated-by-request", identity: r.identity, liveForRequest: 0 }; },
    publishImportReplacement: unused, prepareCanonicalJsonExport: unused, readCurrentApplicationDocumentIdentity: unused, readExportTimestamp: unused, startPreparedExportDelivery: unused,
    settlementAdapters: { publishCanonicalExportRevision: unused, queueCanonicalExportMarkerPersistence: unused },
  });
  return { run: () => operations.commitImportReplacement(request), counts: () => ({ retirements, invalidations }) };
}
for (const stage of ["prepare", "retire"] as const) {
  const honest = () => stage === "prepare" ? { ok: false, code: preparationCodes[0] } : { ok: false, code: retirementCodes[0], retirementEffect: "none" };
  for (const code of stage === "prepare" ? preparationCodes : retirementCodes) test(`${stage}: preserve literal refusal ${code}`, async () => {
    const s = setup(stage, { ...honest(), code }); const result = await s.run();
    expect(result.ok).toBe(false); if (result.ok) throw Error("Unexpected publication");
    expect(result.refusal.code).toBe(code); expect(result.retirementDisposition).toBe("unchanged"); expect("state" in result && result.state).toBe(request.currentState);
    expect(s.counts()).toEqual({ retirements: stage === "prepare" ? 0 : 1, invalidations: stage === "prepare" ? [] : ["retirement-refused"] });
  });
  test(`${stage}: accept own data fields on a null prototype`, async () => {
    const raw: Record<string, unknown> = { ...honest() }; Object.setPrototypeOf(raw, null);
    const result = await setup(stage, raw).run(); expect(result.ok).toBe(false);
    if (result.ok) throw Error("Unexpected publication"); expect(result.refusal.code).toBe(honest().code);
  });
  test(`${stage}: snapshot discriminant exactly once`, async () => {
    let reads = 0; const raw = new Proxy(honest(), { getOwnPropertyDescriptor(target, key) {
      if (key === "ok") reads++; return Object.getOwnPropertyDescriptor(target, key);
    } });
    const result = await setup(stage, raw).run(); expect(result.ok).toBe(false); expect(reads).toBe(1);
  });
  const malformed: readonly [string, () => unknown][] = [
    ["unknown code", () => ({ ...honest(), code: "invented" })],
    ["missing code", () => ({ ok: false })],
    ["extra authority", () => ({ ...honest(), value: {} })],
    ["wrong discriminant", () => ({ ...honest(), ok: 0 })],
    ["inherited fields", () => { const value: unknown = Object.create(honest()); return value; }],
    ["throwing prototype", () => new Proxy(honest(), { getPrototypeOf: unused })],
    ["throwing descriptors", () => new Proxy(honest(), { getOwnPropertyDescriptor: unused })],
    ["symbol field", () => ({ ...honest(), [Symbol("authority")]: true })],
  ];
  for (const [name, make] of malformed) test(`${stage}: reject ${name}`, async () => {
    const s = setup(stage, make()); const result = await s.run(); expect(result.ok).toBe(false);
    if (result.ok) throw Error("Unexpected publication");
    expect(result.refusal.code).toBe(stage === "prepare" ? "import.replacement_preparation_result_invalid" : "transport.replacement_retirement_evidence_invalid");
    expect(s.counts()).toEqual({ retirements: stage === "prepare" ? 0 : 1, invalidations: [stage === "prepare" ? "preparation-protocol-invalid" : "retirement-protocol-invalid"] });
  });
  for (const field of stage === "prepare" ? ["ok", "code"] : ["ok", "code", "retirementEffect"]) test(`${stage}: never read ${field} accessor`, async () => {
    let reads = 0; const raw = Object.defineProperty(honest(), field, { get() { reads++; throw Error("getter"); } });
    const result = await setup(stage, raw).run(); expect(result.ok).toBe(false); expect(reads).toBe(0);
  });
  test(`${stage}: never coerce refusal code`, async () => {
    let coercions = 0; const code = { toString() { coercions++; return honest().code; } };
    const result = await setup(stage, { ...honest(), code }).run(); expect(result.ok).toBe(false); expect(coercions).toBe(0);
  });
}
for (const retirementEffect of [undefined, "retired", null]) test(`retire: refuse unproven no-effect ${String(retirementEffect)}`, async () => {
  const s = setup("retire", { ok: false, code: retirementCodes[0], retirementEffect }); const result = await s.run();
  expect(result.ok).toBe(false); if (result.ok) throw Error("Unexpected publication");
  expect(result.refusal.code).toBe("transport.replacement_retirement_evidence_invalid"); expect(result.retirementDisposition).toBe("reconciliation-required");
});
