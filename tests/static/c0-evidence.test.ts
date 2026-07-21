import { describe, expect, test } from "bun:test";

import {
  C0_APPLICABILITY,
  C0_EXPECTED_COUNTS,
  C0_FOCUSED_TEST_FILES,
  C0_OBSERVATION_MARKERS,
  C0_REQUIRED_RESOLUTION_INPUTS,
  buildC0PresetProof,
  buildC0TraceEvidence,
  c0EvidenceDigest,
  inspectC0JUnit,
  inspectC0RequiredResolutionInputs,
  inspectC0TestControls,
  parseC0Observations,
  sanitizeC0JUnit,
  stableC0EvidenceJson,
  validateC0EvidenceCandidate,
  validateC0ObservationRecords,
} from "../../scripts/verify-c0-evidence";
import adversarialFixture from
  "../fixtures/legacy-migration/adversarial-cases.json";
import contractFixture from
  "../fixtures/legacy-migration/c0-legacy-migration-contract.json";
import mutationFixture from
  "../fixtures/legacy-migration/mutation-controls.json";
import presetFixture from
  "../fixtures/legacy-migration/preset-expectations.json";
import sourceFixture from
  "../fixtures/legacy-migration/legacy-presets-source.json";

type JsonRecord = Record<string, unknown>;

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalRecord(value: unknown, label: string): JsonRecord {
  if (!isJsonRecord(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function sign(value: JsonRecord): JsonRecord {
  const unsigned = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "semanticDigest"),
  );
  return { ...unsigned, semanticDigest: c0EvidenceDigest(unsigned) };
}

function sourceRows(): Readonly<{
  ids: readonly string[];
  hashes: Readonly<Record<string, string>>;
}> {
  const ids: string[] = [];
  const hashes: Record<string, string> = {};
  for (const preset of sourceFixture.presets) {
    for (const [sectionIndex, section] of preset.sections.entries()) {
      for (const [chordIndex, chord] of section.chords.entries()) {
        const id = `${preset.legacyPresetId}:${String(sectionIndex)}:${String(chordIndex)}`;
        ids.push(id);
        hashes[id] = c0EvidenceDigest(chord);
      }
    }
  }
  return { ids, hashes };
}

function expectationHashes(): Readonly<Record<string, string>> {
  const value = canonicalRecord(presetFixture, "preset fixture");
  const categories = [
    "directNameParsedManual",
    "rootTypeFallbackParsedManual",
    "directNameSpellingConflict",
    "directNameSoundingConflict",
    "rootTypeFallbackConflict",
    "noParseableSymbol",
  ] as const;
  const hashes: Record<string, string> = {};
  for (const category of categories) {
    const rows = value[category];
    if (!Array.isArray(rows)) throw new TypeError(`${category} must be an array`);
    for (const rowValue of rows) {
      const row = canonicalRecord(rowValue, category);
      const id = row["id"];
      if (typeof id !== "string") throw new TypeError(`${category} ID missing`);
      hashes[id] = c0EvidenceDigest(row);
    }
  }
  return hashes;
}

function passingProduction(): JsonRecord {
  const caseIds = adversarialFixture.cases.map(({ id }) => id);
  return sign({
    schema: "changes.evidence.c0-production-conformance-observation.v1",
    producer: {
      file: "tests/conformance/c0-production-conformance.test.ts",
      testcase: "executes all 70 reviewed adversarial cases against production",
    },
    caseIds,
    caseHashes: Object.fromEntries(caseIds.map((id) => [id, HASH_A])),
    casesObserved: 70,
    publicExecutions: 70,
    privateExecutions: 70,
    deterministicReplays: 70,
    publicationCalls: 0,
    externalF3PublicationCalls: 3,
    externalF3Accepted: 3,
    validatedBrandReturned: false,
    inputMutations: 0,
    retainedCallerContainers: 0,
    privateTextLeaks: 0,
    status: "pass",
  });
}

function passingPreset(): JsonRecord {
  const source = sourceRows();
  const resultHashes = Object.fromEntries(source.ids.map((id) => [id, HASH_A]));
  return sign({
    schema: "changes.evidence.c0-preset-conformance-observation.v1",
    producer: {
      file: "tests/golden/legacy-presets.test.ts",
      testcase:
        "migrates every preset deterministically and matches all 80 manual classifications",
    },
    chordIds: source.ids,
    sourceRowHashes: source.hashes,
    expectationRowHashes: expectationHashes(),
    resultHashes,
    replayHashes: { ...resultHashes },
    chordsObserved: 80,
    presetsObserved: 3,
    sectionsObserved: 6,
    parsedManual: 35,
    customManual: 45,
    deterministicReplays: 3,
    sourceMutations: 0,
    status: "pass",
  });
}

function passingMutation(): JsonRecord {
  const controlIds = mutationFixture.controls.map(({ id }) => id);
  const linkedCaseIds = [...new Set(
    mutationFixture.controls.map(({ linkedCaseId }) => linkedCaseId),
  )].sort();
  return sign({
    schema: "changes.evidence.c0-mutation-conformance-observation.v1",
    producer: {
      file: "tests/conformance/c0-mutation-controls.test.ts",
      testcase: "kills all 30 reviewed semantic counterfactuals deterministically",
    },
    classification:
      "reviewed-contract-projection mutation; runtime production baselines where applicable",
    controlIds,
    linkedCaseIds,
    semanticOperatorsExecuted: 30,
    semanticOperatorsKilled: 30,
    semanticOperatorsSurvived: 0,
    sourceMutantsExecuted: 0,
    sourceMutantsKilled: 0,
    controlExecutionDigests: Object.fromEntries(
      controlIds.map((id) => [id, HASH_A]),
    ),
    counterfactualExecutions: mutationFixture.controls.map(
      ({ id, linkedCaseId }) => ({
        controlId: id,
        linkedCaseId,
        beforeSha256: HASH_A,
        afterSha256: HASH_B,
        killed: true,
      }),
    ),
    status: "pass",
  });
}

function passingLaw(): JsonRecord {
  const lawIds = ["C0-LAW-001", "C0-LAW-002"];
  return sign({
    schema: "changes.evidence.c0-migration-law-observation.v1",
    producer: {
      file: "tests/property/c0-migration-laws.test.ts",
      testcase: "proves deterministic migration laws and bounded termination",
    },
    lawIds,
    lawHashes: Object.fromEntries(lawIds.map((id) => [id, HASH_A])),
    lawsObserved: lawIds.length,
    deterministicReplays: 2,
    terminalStates: ["complete-candidate", "complete-refusal"],
    workCounterNames: contractFixture.work.counterNames,
    boundaryPairs: 2,
    wallTimeGating: false,
    inputMutations: 0,
    status: "pass",
  });
}

function passingStatic(): JsonRecord {
  return sign({
    schema: "changes.evidence.c0-static-boundary-observation.v1",
    producer: {
      file: "tests/static/c0-production-policy.test.ts",
      testcase:
        "keeps C0 pure, synchronous, candidate-only, and privately evidenced",
    },
    productionFiles: [
      "src/compatibility/index.ts",
      "src/compatibility/legacy-migration-contract.ts",
      "src/compatibility/legacy-migration.ts",
    ],
    allowedImports: ["../domain", "../theory", "./legacy-migration-contract"],
    implementationExports: [
      "legacyMigrationOperations",
      "migrateLegacyJson",
      "migrateLegacyJsonWithEvidence",
    ],
    publicExports: ["legacyMigrationOperations", "migrateLegacyJson"],
    privateEvidenceReexported: false,
    validatedDocumentMentions: 0,
    productionCasts: 0,
    moduleMutableBindings: 0,
    asyncOrGeneratorFunctions: 0,
    forbiddenRuntimeReferences: [],
    forbiddenProjectImports: [],
    fixtureOrTestImports: [],
    status: "pass",
  });
}

function passingObservations(): readonly JsonRecord[] {
  return [
    passingProduction(),
    passingPreset(),
    passingMutation(),
    passingLaw(),
    passingStatic(),
  ];
}

function observationOutput(values: readonly JsonRecord[]): string {
  const bySchema = new Map(values.map((value) => [String(value["schema"]), value]));
  const schemaByMarker = [
    [
      C0_OBSERVATION_MARKERS.production,
      "changes.evidence.c0-production-conformance-observation.v1",
    ],
    [
      C0_OBSERVATION_MARKERS.preset,
      "changes.evidence.c0-preset-conformance-observation.v1",
    ],
    [
      C0_OBSERVATION_MARKERS.mutation,
      "changes.evidence.c0-mutation-conformance-observation.v1",
    ],
    [
      C0_OBSERVATION_MARKERS.law,
      "changes.evidence.c0-migration-law-observation.v1",
    ],
    [
      C0_OBSERVATION_MARKERS.static,
      "changes.evidence.c0-static-boundary-observation.v1",
    ],
  ] as const;
  return schemaByMarker.map(([marker, schema]) =>
    `${marker}${JSON.stringify(bySchema.get(schema))}`
  ).join("\n");
}

function traceJUnit(): string {
  const cases = [
    {
      file: "tests/conformance/c0-production-conformance.test.ts",
      name: "executes all 70 reviewed adversarial cases against production",
    },
    {
      file: "tests/conformance/c0-mutation-controls.test.ts",
      name: "kills all 30 reviewed semantic counterfactuals deterministically",
    },
    {
      file: "tests/golden/legacy-presets.test.ts",
      name:
        "migrates every preset deterministically and matches all 80 manual classifications",
    },
  ];
  return `<testsuites tests="3" assertions="3" failures="0" errors="0" skipped="0"><testsuite>${cases.map(({ file, name }) =>
    `<testcase file="${file}" name="${name}" />`
  ).join("")}</testsuite></testsuites>`;
}

describe("C0 evidence verifier self-controls", () => {
  test("canonicalizes and signs evidence independently of object key order", () => {
    const left = { z: [3, { b: 2, a: 1 }], a: true };
    const right = { a: true, z: [3, { a: 1, b: 2 }] };
    expect(stableC0EvidenceJson(left)).toBe(stableC0EvidenceJson(right));
    expect(c0EvidenceDigest(left)).toBe(c0EvidenceDigest(right));
    expect(c0EvidenceDigest(left)).toMatch(/^[a-f0-9]{64}$/u);
  });

  test("sanitizes exact JUnit and rejects forged counts, hidden failures, and duplicates", () => {
    const valid = '<?xml version="1.0"?><testsuites tests="1" assertions="2" failures="0" errors="0" skipped="0" hostname="private"><testsuite><testcase name="proof" file="tests/proof.test.ts" /></testsuite></testsuites>';
    const sanitized = sanitizeC0JUnit(valid);
    expect(sanitized).not.toContain("hostname");
    expect(inspectC0JUnit(sanitized).summary).toEqual({
      tests: 1,
      assertions: 2,
      failures: 0,
      errors: 0,
      skipped: 0,
      files: ["tests/proof.test.ts"],
      cases: [{ file: "tests/proof.test.ts", name: "proof" }],
    });
    expect(inspectC0JUnit(valid.replace('tests="1"', 'tests="2"')).summary)
      .toBeNull();
    expect(inspectC0JUnit(valid.replace(" />", "><failure /></testcase>"))
      .summary).toBeNull();
    const duplicate = valid.replace(
      "</testsuite>",
      '<testcase name="proof" file="tests/proof.test.ts" /></testsuite>',
    ).replace('tests="1"', 'tests="2"');
    expect(inspectC0JUnit(duplicate).summary).toBeNull();
    expect(inspectC0JUnit(valid.replace("</testsuites>", "")).summary).toBeNull();
  });

  test("rejects skip, todo, only, expected-failure, quarantine, and retry controls", () => {
    const findings = inspectC0TestControls("synthetic.test.ts", `
      import { test as spec, describe } from "bun:test";
      spec.skip("skip", () => {});
      spec.todo("todo");
      describe.only("only", () => {});
      spec.failing("failing", () => {});
      quarantine("known issue");
      spec("retry", () => {}, { retry: 2 });
      xit("disabled", () => {});
    `);
    const codes = findings.map(({ code }) => code);
    expect(codes).toContain("C0_EVIDENCE_TODO");
    expect(codes).toContain("C0_EVIDENCE_QUARANTINE");
    expect(codes).toContain("C0_EVIDENCE_RETRY");
    expect(findings.length).toBeGreaterThanOrEqual(7);
  });

  test("requires five exact signed observations and detects resigned semantic drift", () => {
    const observations = passingObservations();
    expect(validateC0ObservationRecords(observations)).toEqual([]);
    expect(parseC0Observations(observationOutput(observations)).findings).toEqual([]);

    const tampered = structuredClone(observations);
    const production = tampered[0];
    if (production === undefined) throw new TypeError("production missing");
    production["casesObserved"] = 69;
    expect(validateC0ObservationRecords(tampered).map(({ code }) => code))
      .toContain("C0_EVIDENCE_OBSERVATION_DIGEST");

    const resigned = structuredClone([...observations]);
    const resignedProduction = resigned[0];
    if (resignedProduction === undefined) throw new TypeError("production missing");
    resigned[0] = sign({ ...resignedProduction, casesObserved: 69 });
    const resignedCodes = validateC0ObservationRecords(resigned)
      .map(({ code }) => code);
    expect(resignedCodes).toContain("C0_EVIDENCE_PRODUCTION_INVENTORY");
    expect(resignedCodes).not.toContain("C0_EVIDENCE_OBSERVATION_DIGEST");
  });

  test("binds all 80 preset rows to fixture, result, replay, and exact golden testcase hashes", () => {
    const summary = inspectC0JUnit(traceJUnit()).summary;
    const proof = buildC0PresetProof(passingPreset(), summary);
    expect(proof["outcome"]).toBe("pass");
    expect(proof["proofSha256"]).toMatch(/^[a-f0-9]{64}$/u);
    const rows = proof["rows"];
    expect(Array.isArray(rows) ? rows : []).toHaveLength(80);

    const damaged = passingPreset();
    const replay = canonicalRecord(damaged["replayHashes"], "replay hashes");
    const firstId = sourceRows().ids[0];
    if (firstId === undefined) throw new TypeError("first preset ID missing");
    replay[firstId] = HASH_B;
    const resigned = sign(damaged);
    expect(validateC0ObservationRecords([
      passingProduction(),
      resigned,
      passingMutation(),
      passingLaw(),
      passingStatic(),
    ]).map(({ code }) => code)).toContain("C0_EVIDENCE_PRESET_INVENTORY");
  });

  test("discharges all 18 traces and all 30 controls from exact evidence", () => {
    const summary = inspectC0JUnit(traceJUnit()).summary;
    const traces = buildC0TraceEvidence({
      production: passingProduction(),
      preset: passingPreset(),
      mutation: passingMutation(),
    }, summary);
    expect(traces).toHaveLength(18);
    expect(traces.every((trace) => trace["outcome"] === "pass")).toBe(true);
    const controls = new Set<string>();
    for (const trace of traces) {
      const controlIds: unknown = trace["mutationControlIds"];
      if (!Array.isArray(controlIds)) continue;
      for (const controlId of controlIds) {
        if (typeof controlId === "string") controls.add(controlId);
      }
    }
    expect(controls.size).toBe(30);

    const damaged = passingProduction();
    const hashes = canonicalRecord(damaged["caseHashes"], "case hashes");
    Reflect.deleteProperty(hashes, "C0-PRE-001");
    const damagedTraces = buildC0TraceEvidence({
      production: damaged,
      preset: passingPreset(),
      mutation: passingMutation(),
    }, summary);
    expect(damagedTraces.some((trace) => trace["outcome"] === "fail"))
      .toBe(true);
  });

  test("keeps exact focused, authority, trace, applicability, and command inventories", async () => {
    expect([...C0_FOCUSED_TEST_FILES]).toEqual(
      [...C0_FOCUSED_TEST_FILES].sort(),
    );
    expect(C0_FOCUSED_TEST_FILES).toHaveLength(10);
    expect(adversarialFixture.cases).toHaveLength(C0_EXPECTED_COUNTS.adversarialCases);
    expect(sourceRows().ids).toHaveLength(C0_EXPECTED_COUNTS.presetChords);
    expect(mutationFixture.controls).toHaveLength(C0_EXPECTED_COUNTS.mutationControls);
    expect(C0_APPLICABILITY).toHaveLength(7);
    expect(C0_REQUIRED_RESOLUTION_INPUTS).toEqual([
      "src/application/document-validation-contract.ts",
      "src/application/document-validation.ts",
      "src/application/index.ts",
    ]);
    expect(inspectC0RequiredResolutionInputs(
      C0_REQUIRED_RESOLUTION_INPUTS.map((path) => ({
        group: "production",
        path,
      })),
    )).toEqual([]);
    expect(inspectC0RequiredResolutionInputs([
      {
        group: "production",
        path: "src/application/document-validation-contract.ts",
      },
      {
        group: "production",
        path: "src/application/document-validation.ts",
      },
    ]).map(({ code, path }) => ({ code, path }))).toEqual([{
      code: "C0_EVIDENCE_INPUT_CLOSURE",
      path: "src/application/index.ts",
    }]);

    const packageValue: unknown = await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json();
    const packageRecord = canonicalRecord(packageValue, "package");
    const scripts = canonicalRecord(packageRecord["scripts"], "scripts");
    expect(scripts["verify:c0-evidence"])
      .toBe("bun scripts/verify-c0-evidence.ts");
    const aggregate = await Bun.file(
      new URL("../../scripts/verify.ts", import.meta.url),
    ).text();
    expect(aggregate).toContain('id: "c0-evidence"');
  });

  test("rejects malformed, stale, unsigned, and incomplete ledgers", () => {
    const codes = validateC0EvidenceCandidate({}, HASH_A)
      .map(({ code }) => code);
    expect(codes).toContain("C0_EVIDENCE_LEDGER_IDENTITY");
    expect(codes).toContain("C0_EVIDENCE_STATUS");
    expect(codes).toContain("C0_EVIDENCE_LEDGER_DIGEST");
    expect(codes).toContain("C0_EVIDENCE_INPUT_STALE");
    expect(codes).toContain("C0_EVIDENCE_RUN_ID");
    expect(codes).toContain("C0_EVIDENCE_SUITE");
    expect(codes).toContain("C0_EVIDENCE_TRACE");
  });
});
