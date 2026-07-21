import { describe, expect, test } from "bun:test";

import { runNodeTool } from "../../scripts/run-node-tool";
import {
  T0_APPLICABILITY,
  T0_EXPECTED_COUNTS,
  T0_EXPECTED_OBSERVATION_COUNTS,
  T0_FIXTURE_FILES,
  T0_FOCUSED_TEST_FILES,
  T0_INPUT_GROUPS,
  buildT0CaseBindings,
  buildT0MutationEvidence,
  buildT0TraceEvidence,
  inspectT0JUnit,
  inspectT0ObservationRecords,
  inspectT0TestControls,
  parseT0Observations,
  sanitizeT0JUnit,
  validateT0EvidenceCandidate,
  validateT0MutationEvidenceRows,
  validateT0TraceEvidenceRows,
} from "../../scripts/verify-t0-evidence";

import mutationFixture from "../fixtures/theory/mutation-controls.json";
import roundtripFixture from "../fixtures/theory/roundtrip-cases.json";

type JsonRecord = Record<string, unknown>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonical(item)]),
  );
}

function digest(value: unknown): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(JSON.stringify(canonical(value)));
  return hasher.digest("hex");
}

function signed(value: JsonRecord): JsonRecord {
  return { ...value, semanticDigest: digest(value) };
}

function resigned(value: JsonRecord): JsonRecord {
  return signed(Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "semanticDigest"),
  ));
}

function passingObservations(): JsonRecord[] {
  const bindings = buildT0CaseBindings();
  const production = bindings.filter(({ caseId }) => !caseId.startsWith("T0-META-"));
  const lawIds = bindings.filter(({ caseId }) => caseId.startsWith("T0-META-"))
    .map(({ caseId }) => caseId);
  const controlIds = Array.from(
    { length: T0_EXPECTED_COUNTS.mutationControls },
    (_, index) => `T0-MUT-${String(index + 1).padStart(3, "0")}`,
  );
  const bindingMap = new Map(bindings.map((binding) => [binding.caseId, binding.fixtureRecordSha256]));
  const linkedCaseIds = [...new Set(mutationFixture.controls.flatMap(({ killedByCaseIds }) => killedByCaseIds))].sort();
  const observationDigests = Object.fromEntries(linkedCaseIds.map((caseId) => [
    caseId,
    bindingMap.get(caseId) ?? digest({ caseId }),
  ]));
  const controlObservationDigests = Object.fromEntries(mutationFixture.controls.map((control) => {
    const killedCaseObservationDigests = control.killedByCaseIds.map((caseId) => ({
      caseId,
      observationSha256: observationDigests[caseId],
    }));
    return [control.id, digest({
      controlId: control.id,
      operator: control.operator,
      mutatedFault: control.mutatedFault,
      expectedDetection: control.expectedDetection,
      killedByCaseIds: control.killedByCaseIds,
      observationEvidenceIds: killedCaseObservationDigests.map(({ observationSha256 }) => observationSha256),
      killedCaseObservationDigests,
      dischargeStatus: "discharged-by-reviewed-exact-case-implication",
    })];
  }));
  return [
    signed({
      schema: "changes.evidence.t0-production-conformance-observation.v1",
      fixtureCaseIds: production.map(({ caseId }) => caseId),
      fixtureCaseHashes: Object.fromEntries(production.map(({ caseId, fixtureRecordSha256 }) => [caseId, fixtureRecordSha256])),
      fixtureCases: production.length,
      executions: T0_EXPECTED_OBSERVATION_COUNTS.productionExecutions,
      categoryCounts: { symbol: 111, chart: 82 },
    }),
    signed({
      schema: "changes.evidence.t0-conformance-observation.v1",
      suite: "roundtrip-laws",
      seeds: roundtripFixture.seeds,
      lawIds,
      lawsObserved: lawIds.length,
      caseObservations: T0_EXPECTED_OBSERVATION_COUNTS.lawCaseObservations,
      lawDigests: Object.fromEntries(lawIds.map((lawId) => [lawId, digest({ lawId })])),
      status: "pass",
    }),
    signed({
      schema: "changes.evidence.t0-conformance-observation.v1",
      suite: "mutation-controls",
      claim: "reviewed-exact-case-implication",
      controlIds,
      controlsDefined: controlIds.length,
      reviewedControlsDischarged: controlIds.length,
      mappedButUnobserved: 0,
      sourceMutantsExecuted: 0,
      sourceMutantsKilled: 0,
      linkedCaseIds,
      linkedCasesObserved: T0_EXPECTED_OBSERVATION_COUNTS.mutationLinkedCases,
      linkedCasesUnaccounted: [],
      runtimeExecutions: T0_EXPECTED_OBSERVATION_COUNTS.mutationRuntimeExecutions,
      observationDigests,
      controlObservationDigests,
      status: "pass",
    }),
  ];
}

describe("T0 evidence verifier self-controls", () => {
  test("binds the dedicated TypeScript project to the exact focused suite", async () => {
    const config = await Bun.file(new URL("../../tsconfig.t0-tests.json", import.meta.url)).json() as { include?: unknown; files?: unknown };
    expect(config.include).toEqual([]);
    expect(config.files).toEqual([...T0_FOCUSED_TEST_FILES]);
    const manifest = await Bun.file(new URL("../../package.json", import.meta.url)).json() as { scripts?: Record<string, string> };
    expect(manifest.scripts?.["verify:t0-evidence"]).toBe("bun scripts/verify-t0-evidence.ts");
    const aggregate = await Bun.file(new URL("../../scripts/verify.ts", import.meta.url)).text();
    const buildGate = aggregate.indexOf('id: "build"');
    const f2Gate = aggregate.indexOf('id: "f2-evidence"');
    const t0Gate = aggregate.indexOf('id: "t0-evidence"');
    expect(buildGate).toBeGreaterThanOrEqual(0);
    expect(f2Gate).toBeGreaterThan(buildGate);
    expect(t0Gate).toBeGreaterThan(f2Gate);
    const architecture = await Bun.file(new URL("../../docs/ARCHITECTURE.md", import.meta.url)).text();
    expect(architecture).toContain("`bun run verify:t0-evidence`");
    expect(await runNodeTool("tsc", ["-p", "tsconfig.t0-tests.json", "--noEmit", "--pretty", "false"])).toBe(0);
  }, 180_000);

  test("keeps the focused files, fixtures, coverage authority, and applicability explicit", () => {
    expect(T0_FOCUSED_TEST_FILES).toHaveLength(11);
    expect([...T0_FOCUSED_TEST_FILES]).toEqual([...T0_FOCUSED_TEST_FILES].sort());
    expect(T0_FIXTURE_FILES).toHaveLength(7);
    expect(mutationFixture.controls).toHaveLength(T0_EXPECTED_COUNTS.mutationControls);
    expect(T0_EXPECTED_OBSERVATION_COUNTS).toEqual({
      productionExecutions: 324,
      lawCaseObservations: 514,
      mutationLinkedCases: 135,
      mutationRuntimeExecutions: 246,
    });
    expect(mutationFixture.controls.at(-1)?.id).toBe("T0-MUT-060");
    expect(T0_INPUT_GROUPS.contracts).toContain("tests/conformance/T0_COVERAGE.md");
    expect(T0_INPUT_GROUPS.contracts).toContain("tests/conformance/T0_DISCREPANCIES.md");
    expect(T0_APPLICABILITY.find(({ id }) => id === "browser")?.applicability).toBe("not-applicable");
    expect(T0_APPLICABILITY.find(({ id }) => id === "chart-import-byte-binding")?.owner).toBe("E0");
  });

  test("removes hostnames and rejects forged JUnit summaries", () => {
    const raw = '<?xml version="1.0"?><testsuites tests="1" assertions="2" failures="0" errors="0" skipped="0"><testsuite name="proof" hostname="private-host"><testcase file="tests/proof.test.ts" name="works" /></testsuite></testsuites>';
    const sanitized = sanitizeT0JUnit(raw);
    expect(sanitized).not.toContain("private-host");
    expect(inspectT0JUnit(sanitized)).toEqual({
      summary: {
        tests: 1,
        assertions: 2,
        failures: 0,
        errors: 0,
        skipped: 0,
        files: ["tests/proof.test.ts"],
        cases: [{ file: "tests/proof.test.ts", name: "works" }],
      },
      findings: [],
    });
    expect(inspectT0JUnit(raw.replace('failures="0"', 'failures="1"')).summary).toBeNull();
    expect(inspectT0JUnit(raw.replace("</testsuites>", "")).summary).toBeNull();
  });

  test("rejects skipped, todo, exclusive, expected-failure, quarantine, and retry controls", () => {
    const findings = inspectT0TestControls("synthetic.test.ts", `
      import { test as spec } from "bun:test";
      import * as bt from "bun:test";
      const alias = spec;
      alias.skip("skip", () => {});
      spec.todo("todo");
      bt.test["only"]("only", () => {});
      spec.failing("xfail", () => {});
      quarantine("known flaky");
      spec("retry", () => {}, { retry: 2 });
      spec("expected", () => {}, { expectedFailure: true });
    `);
    expect(findings.map(({ code }) => code)).toContain("T0_EVIDENCE_TODO");
    expect(findings.map(({ code }) => code)).toContain("T0_EVIDENCE_QUARANTINE");
    expect(findings.map(({ code }) => code)).toContain("T0_EVIDENCE_RETRY");
    expect(findings.map(({ code }) => code)).toContain("T0_EVIDENCE_EXPECTED_FAILURE");
  });

  test("requires exact hash-bound production, law, and mutation observations", () => {
    const records = passingObservations();
    expect(inspectT0ObservationRecords(records)).toEqual([]);
    const output = [
      `T0_EVIDENCE_OBSERVATION ${JSON.stringify(records[0])}`,
      `T0_CONFORMANCE_OBSERVATION ${JSON.stringify(records[1])}`,
      `T0_CONFORMANCE_OBSERVATION ${JSON.stringify(records[2])}`,
    ].join("\n");
    expect(parseT0Observations(output).findings).toEqual([]);
    const productionTampered = structuredClone(records);
    const productionRecord = productionTampered[0];
    if (productionRecord === undefined) throw new Error("production observation missing");
    productionTampered[0] = resigned({
      ...productionRecord,
      executions: T0_EXPECTED_OBSERVATION_COUNTS.productionExecutions - 1,
    });
    const productionCodes = inspectT0ObservationRecords(productionTampered).map(({ code }) => code);
    expect(productionCodes).toContain("T0_EVIDENCE_PRODUCTION_CASES");
    expect(productionCodes).not.toContain("T0_EVIDENCE_OBSERVATION_DIGEST");

    const lawTampered = structuredClone(records);
    const lawRecord = lawTampered[1];
    if (lawRecord === undefined) throw new Error("law observation missing");
    lawTampered[1] = resigned({
      ...lawRecord,
      caseObservations: T0_EXPECTED_OBSERVATION_COUNTS.lawCaseObservations - 1,
    });
    const lawCodes = inspectT0ObservationRecords(lawTampered).map(({ code }) => code);
    expect(lawCodes).toContain("T0_EVIDENCE_LAW_INVENTORY");
    expect(lawCodes).not.toContain("T0_EVIDENCE_OBSERVATION_DIGEST");

    const runtimeTampered = structuredClone(records);
    const runtimeRecord = runtimeTampered[2];
    if (runtimeRecord === undefined) throw new Error("mutation observation missing");
    runtimeTampered[2] = resigned({
      ...runtimeRecord,
      runtimeExecutions: T0_EXPECTED_OBSERVATION_COUNTS.mutationRuntimeExecutions - 1,
    });
    const runtimeCodes = inspectT0ObservationRecords(runtimeTampered).map(({ code }) => code);
    expect(runtimeCodes).toContain("T0_EVIDENCE_MUTATION_INVENTORY");
    expect(runtimeCodes).not.toContain("T0_EVIDENCE_OBSERVATION_DIGEST");

    const linkedCountTampered = structuredClone(records);
    const linkedCountRecord = linkedCountTampered[2];
    if (linkedCountRecord === undefined) throw new Error("mutation observation missing");
    linkedCountTampered[2] = resigned({
      ...linkedCountRecord,
      linkedCasesObserved: T0_EXPECTED_OBSERVATION_COUNTS.mutationLinkedCases - 1,
    });
    const linkedCountCodes = inspectT0ObservationRecords(linkedCountTampered).map(({ code }) => code);
    expect(linkedCountCodes).toContain("T0_EVIDENCE_MUTATION_INVENTORY");
    expect(linkedCountCodes).not.toContain("T0_EVIDENCE_OBSERVATION_DIGEST");

    const linkedIdentityTampered = structuredClone(records);
    const linkedIdentityRecord = linkedIdentityTampered[2];
    if (linkedIdentityRecord === undefined) throw new Error("mutation observation missing");
    const linkedIds = linkedIdentityRecord["linkedCaseIds"];
    const digestRecord = linkedIdentityRecord["observationDigests"];
    if (!Array.isArray(linkedIds)) throw new Error("linked case inventory missing");
    const stringLinkedIds = linkedIds.map((value: unknown) => {
      if (typeof value !== "string") throw new Error("linked case ID is not a string");
      return value;
    });
    if (typeof digestRecord !== "object" || digestRecord === null || Array.isArray(digestRecord)) {
      throw new Error("observation digest inventory missing");
    }
    const removedId = stringLinkedIds.at(-1);
    if (removedId === undefined) throw new Error("linked case inventory empty");
    const substitutedIds = [...stringLinkedIds.slice(0, -1), "T0-NOT-A-CASE"].sort();
    const substitutedDigests = Object.fromEntries([
      ...Object.entries(digestRecord).filter(([caseId]) => caseId !== removedId),
      ["T0-NOT-A-CASE", "a".repeat(64)],
    ]);
    linkedIdentityTampered[2] = resigned({
      ...linkedIdentityRecord,
      linkedCaseIds: substitutedIds,
      observationDigests: substitutedDigests,
    });
    const linkedIdentityCodes = inspectT0ObservationRecords(linkedIdentityTampered).map(({ code }) => code);
    expect(linkedIdentityCodes).toContain("T0_EVIDENCE_MUTATION_INVENTORY");
    expect(linkedIdentityCodes).not.toContain("T0_EVIDENCE_OBSERVATION_DIGEST");
    expect(inspectT0ObservationRecords(records.slice(0, 2)).map(({ code }) => code)).toContain("T0_EVIDENCE_OBSERVATION_INVENTORY");
  });

  test("hashes all 210 cases and recomputes 25 passing traces", () => {
    const bindings = buildT0CaseBindings();
    expect(bindings).toHaveLength(T0_EXPECTED_COUNTS.totalCases);
    expect(new Set(bindings.map(({ caseId }) => caseId)).size).toBe(bindings.length);
    expect(bindings.every(({ fixtureRecordSha256 }) => /^[a-f0-9]{64}$/.test(fixtureRecordSha256))).toBe(true);
    const cases = [
      { file: "tests/conformance/t0-mutation-controls.test.ts", name: "mutation observation" },
      { file: "tests/conformance/t0-production-conformance.test.ts", name: "production observation" },
      { file: "tests/conformance/t0-roundtrip-laws.test.ts", name: "roundtrip observation" },
    ];
    const summary = { tests: 3, assertions: 3, failures: 0, errors: 0, skipped: 0, files: cases.map(({ file }) => file), cases };
    const traces = buildT0TraceEvidence(passingObservations(), bindings, summary, "pass");
    expect(traces).toHaveLength(T0_EXPECTED_COUNTS.traces);
    expect(traces.every(({ outcome }) => outcome === "pass")).toBe(true);
    const dropped = passingObservations();
    const production = dropped[0];
    if (production !== undefined) {
      const ids = production["fixtureCaseIds"];
      if (Array.isArray(ids)) {
        const stringIds = ids.filter((item): item is string =>
          typeof item === "string"
        );
        const removed = stringIds[0];
        production["fixtureCaseIds"] = stringIds.slice(1);
        const hashes = production["fixtureCaseHashes"];
        if (typeof hashes === "object" && hashes !== null && removed !== undefined) {
          production["fixtureCaseHashes"] = Object.fromEntries(
            Object.entries(hashes).filter(([caseId]) => caseId !== removed),
          );
        }
      }
    }
    expect(buildT0TraceEvidence(dropped, bindings, summary, "pass").some(({ outcome }) => outcome === "fail")).toBe(true);
  });

  test("discharges all reviewed controls without claiming source-mutant execution", () => {
    const mutation = buildT0MutationEvidence(passingObservations(), buildT0CaseBindings());
    expect(mutation.classification).toBe("reviewed-exact-case-implication-not-source-mutant-execution");
    expect(mutation.reviewedControls).toBe(T0_EXPECTED_COUNTS.mutationControls);
    expect(mutation.reviewedControlsDischarged).toBe(T0_EXPECTED_COUNTS.mutationControls);
    expect(mutation.reviewedControlsSurvived).toBe(0);
    expect(mutation.reviewedControlsUnobserved).toBe(0);
    expect(mutation.sourceMutantsExecuted).toBe(0);
    expect(mutation.sourceMutantsKilled).toBe(0);
    expect(mutation.outcome).toBe("pass");
  });

  test("rejects one tampered per-case or per-control digest without collapsing sibling identity", () => {
    const observations = passingObservations();
    const bindings = buildT0CaseBindings();
    const cases = [
      { file: "tests/conformance/t0-mutation-controls.test.ts", name: "mutation observation" },
      { file: "tests/conformance/t0-production-conformance.test.ts", name: "production observation" },
      { file: "tests/conformance/t0-roundtrip-laws.test.ts", name: "roundtrip observation" },
    ];
    const summary = { tests: 3, assertions: 3, failures: 0, errors: 0, skipped: 0, files: cases.map(({ file }) => file), cases };
    const traces = buildT0TraceEvidence(observations, bindings, summary, "pass");
    const firstTrace = traces.find(({ caseEvidence }) => caseEvidence.length > 0);
    if (firstTrace === undefined) throw new Error("expected trace case evidence");
    const tamperedTraces = traces.map((row) => row.traceId !== firstTrace.traceId
      ? row
      : {
          ...row,
          caseEvidence: row.caseEvidence.map((item, index) => index === 0
            ? { ...item, observationSha256: "f".repeat(64) }
            : item),
        });
    const traceFindings = validateT0TraceEvidenceRows(tamperedTraces, traces);
    expect(traceFindings).toHaveLength(1);
    expect(traceFindings[0]?.traceId).toBe(firstTrace.traceId);
    expect(new Set(firstTrace.caseEvidence.map(({ observationSha256 }) => observationSha256)).size).toBeGreaterThan(1);

    const mutation = buildT0MutationEvidence(observations, bindings);
    const controlDigests = mutation.rows.map(({ controlObservationSha256 }) => controlObservationSha256);
    expect(new Set(controlDigests).size).toBe(T0_EXPECTED_COUNTS.mutationControls);
    const tamperedMutation = {
      ...mutation,
      rows: mutation.rows.map((row, index) => index === 0
        ? { ...row, controlObservationSha256: "e".repeat(64) }
        : row),
    };
    const mutationFindings = validateT0MutationEvidenceRows(tamperedMutation, mutation);
    expect(mutationFindings).toHaveLength(1);
    expect(mutationFindings[0]?.path).toContain(mutation.rows[0]?.controlId ?? "missing");
  });

  test("rejects duplicate trace and control rows before Map identity collapse", () => {
    const observations = passingObservations();
    const bindings = buildT0CaseBindings();
    const cases = [
      { file: "tests/conformance/t0-mutation-controls.test.ts", name: "mutation observation" },
      { file: "tests/conformance/t0-production-conformance.test.ts", name: "production observation" },
      { file: "tests/conformance/t0-roundtrip-laws.test.ts", name: "roundtrip observation" },
    ];
    const summary = { tests: 3, assertions: 3, failures: 0, errors: 0, skipped: 0, files: cases.map(({ file }) => file), cases };
    const traces = buildT0TraceEvidence(observations, bindings, summary, "pass");
    const duplicateTrace = traces[0];
    if (duplicateTrace === undefined) throw new Error("expected trace evidence");
    expect(validateT0TraceEvidenceRows([...traces, duplicateTrace], traces).map(({ code }) => code))
      .toContain("T0_EVIDENCE_TRACE_INVENTORY");

    const mutation = buildT0MutationEvidence(observations, bindings);
    const duplicateControl = mutation.rows[0];
    if (duplicateControl === undefined) throw new Error("expected mutation control evidence");
    expect(validateT0MutationEvidenceRows({
      ...mutation,
      rows: [...mutation.rows, duplicateControl],
    }, mutation).map(({ code }) => code)).toContain("T0_EVIDENCE_MUTATION_INVENTORY");
  });

  test("rejects malformed or identity-free stored ledgers", () => {
    expect(validateT0EvidenceCandidate({}, "a".repeat(64)).map(({ code }) => code)).toContain("T0_EVIDENCE_LEDGER_IDENTITY");
    expect(validateT0EvidenceCandidate(null, "a".repeat(64)).map(({ code }) => code)).toEqual(["T0_EVIDENCE_LEDGER_SHAPE"]);
  });
});
