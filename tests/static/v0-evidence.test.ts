import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cpus, platform, release, totalmem } from "node:os";
import {
  constants as zlibConstants,
  deflateRawSync,
  inflateRawSync,
} from "node:zlib";

import { sha256Hex } from "../../scripts/foundation-io";
import { runNodeTool } from "../../scripts/run-node-tool";
import { findRealNode } from "../../scripts/toolchain-doctor";

import {
  V0_APPLICABILITY,
  V0_CORROBORATIVE_MUTATION_LINK_INVENTORY_SHA256,
  V0_DIRECT_MUTATION_LINK_INVENTORY_SHA256,
  V0_EXPECTED_COUNTS,
  V0_EXPANDED_PRODUCTION_CASE_IDS,
  V0_FIXTURE_FILES,
  V0_FOCUSED_TEST_FILES,
  V0_INPUT_GROUPS,
  V0_MUTATION_MARKER,
  V0_MUTATION_PRODUCER,
  V0_MUTATION_SCHEMA,
  V0_PRODUCTION_MARKER,
  V0_PRODUCTION_PRODUCER,
  V0_PRODUCTION_SCHEMA,
  V0_REVIEWED_MUTATION_LINK_INVENTORY_SHA256,
  V0_RUNTIME_PREIMAGE_MAX_CANONICAL_BYTES,
  V0_RUNTIME_PREIMAGE_MAX_ENCODED_BYTES,
  V0_RUNTIME_PREIMAGE_POOL_MAX_ENTRIES,
  V0_RUNTIME_PREIMAGE_POOL_MAX_REFERENCES,
  V0_STATIC_MARKER,
  V0_STATIC_ALLOWED_RUNTIME_IMPORT_PREFIXES,
  V0_STATIC_PRODUCER,
  V0_STATIC_SCHEMA,
  V0_STATIC_SOURCE_FILES,
  buildV0CaseBindings,
  buildV0MutationEvidence,
  buildV0RuntimePreimagePool,
  buildV0TraceEvidence,
  focusedV0SuiteCommand,
  inspectV0JUnit,
  inspectV0MutationLinkPartition,
  inspectV0ObservationRecords,
  inspectV0TestControls,
  parseV0Observations,
  sanitizeV0JUnit,
  signV0EvidenceObservation,
  snapshotV0EvidenceInputs,
  stableV0EvidenceJson,
  v0EvidenceDigest,
  v0EvidencePaths,
  v0EvidenceRunId,
  validateV0EvidenceCandidate,
  validateV0MutationEvidenceRows,
  validateV0TraceEvidenceRows,
  v0RunMetadataValueAccepted,
  v0StaticRuntimeImports,
  type V0JUnitSummary,
} from "../../scripts/verify-v0-evidence";

import packageFixture from "../../package.json";
import contractFixture from "../fixtures/voicing/v0-voicing-contract.json";
import candidateFixture from "../fixtures/voicing/candidate-cases.json";
import lawFixture from "../fixtures/voicing/law-cases.json";
import limitFixture from "../fixtures/voicing/limit-cases.json";
import mutationFixture from "../fixtures/voicing/mutation-controls.json";
import operationFixture from "../fixtures/voicing/operation-state-cases.json";
import transpositionFixture from "../fixtures/voicing/transposition-seeds.json";
import { executeV0LawWitness } from "../support/v0-conformance-harness";

type JsonRecord = Record<string, unknown>;

setDefaultTimeout(900_000);

function clone<Value>(value: Value): Value {
  return structuredClone(value);
}

function signed(value: JsonRecord): JsonRecord {
  return signV0EvidenceObservation(value);
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} missing`);
  }
  return value as JsonRecord;
}

function recordInventory(
  parent: JsonRecord,
  field: string,
  label: string,
): JsonRecord[] {
  const value: unknown = parent[field];
  if (!Array.isArray(value)) throw new Error(`${label} inventory missing`);
  return (value as readonly unknown[]).map((row, index) =>
    requireRecord(row, `${label}[${String(index)}]`)
  );
}

function resignMutationObservation(mutation: JsonRecord): JsonRecord {
  const executions = Array.isArray(mutation["counterfactualExecutions"])
    ? mutation["counterfactualExecutions"].filter(
        (row): row is JsonRecord =>
          typeof row === "object" && row !== null && !Array.isArray(row),
      )
    : [];
  mutation["controlExecutionDigests"] = Object.fromEntries(
    mutationFixture.controls.map(({ id }) => [
      id,
      v0EvidenceDigest(executions.filter(({ controlId }) => controlId === id)),
    ]),
  );
  return signed(Object.fromEntries(
    Object.entries(mutation).filter(([key]) => key !== "semanticDigest"),
  ));
}

function resignMutationCaseObservation(
  mutation: JsonRecord,
  observation: JsonRecord,
): JsonRecord {
  refreshMutationObservationDigest(
    mutation,
    observation,
    "caseObservationDigests",
  );
  return resignMutationObservation(mutation);
}

function refreshMutationObservationDigest(
  mutation: JsonRecord,
  observation: JsonRecord,
  mapField: "caseObservationDigests" | "lawWitnessObservationDigests",
): void {
  observation["observationDigest"] = v0EvidenceDigest(Object.fromEntries(
    Object.entries(observation).filter(([key]) => key !== "observationDigest"),
  ));
  requireRecord(
    mutation[mapField],
    `mutation ${mapField}`,
  )[String(observation["caseId"])] = observation["observationDigest"];
}

function refreshRuntimePreimagePoolTotals(mutation: JsonRecord): void {
  const entries = recordInventory(
    mutation,
    "runtimePreimagePool",
    "runtime preimage pool",
  );
  mutation["runtimePreimagePoolEntries"] = entries.length;
  mutation["runtimePreimagePoolCanonicalBytes"] = entries.reduce(
    (sum, entry) => sum + Number(entry["canonicalBytes"]),
    0,
  );
  mutation["runtimePreimagePoolEncodedBytes"] = entries.reduce(
    (sum, entry) => sum + Number(entry["encodedBytes"]),
    0,
  );
}

function runtimePreimagePayload(
  mutation: JsonRecord,
  digest: unknown,
): unknown {
  if (typeof digest !== "string") {
    throw new Error("runtime preimage digest missing");
  }
  const entry = recordInventory(
    mutation,
    "runtimePreimagePool",
    "runtime preimage pool",
  ).find(({ sha256 }) => sha256 === digest);
  if (entry === undefined || typeof entry["data"] !== "string") {
    throw new Error(`runtime preimage ${digest} missing`);
  }
  return JSON.parse(
    inflateRawSync(Buffer.from(entry["data"], "base64")).toString("utf8"),
  ) as unknown;
}

function replaceRuntimePreimage(
  mutation: JsonRecord,
  oldDigest: string,
  replacementPayload: unknown,
): string {
  const rawPool = mutation["runtimePreimagePool"];
  if (!Array.isArray(rawPool)) throw new Error("runtime preimage pool missing");
  const pool = recordInventory(
    mutation,
    "runtimePreimagePool",
    "runtime preimage pool",
  );
  const oldIndex = pool.findIndex(({ sha256 }) => sha256 === oldDigest);
  if (oldIndex === -1) throw new Error(`runtime preimage ${oldDigest} missing`);
  const replacement = buildV0RuntimePreimagePool([replacementPayload]).entries[0];
  if (replacement === undefined) throw new Error("replacement preimage missing");
  if (pool.some(({ sha256 }, index) =>
    index !== oldIndex && sha256 === replacement.sha256
  )) {
    throw new Error("replacement preimage unexpectedly duplicates pool entry");
  }
  rawPool[oldIndex] = clone(replacement);
  for (const [rowsField, digestMapField] of [
    ["caseObservations", "caseObservationDigests"],
    ["lawWitnessObservations", "lawWitnessObservationDigests"],
  ] as const) {
    for (const row of recordInventory(mutation, rowsField, rowsField)) {
      let changed = false;
      if (row["runtimeRequestSha256"] === oldDigest) {
        row["runtimeRequestSha256"] = replacement.sha256;
        changed = true;
      }
      if (row["runtimeResultSha256"] === oldDigest) {
        row["runtimeResultSha256"] = replacement.sha256;
        changed = true;
      }
      if (changed) {
        refreshMutationObservationDigest(mutation, row, digestMapField);
      }
    }
  }
  rawPool.sort((left, right) => {
    const leftSha = String(requireRecord(left, "left pool row")["sha256"]);
    const rightSha = String(requireRecord(right, "right pool row")["sha256"]);
    return leftSha < rightSha ? -1 : leftSha > rightSha ? 1 : 0;
  });
  refreshRuntimePreimagePoolTotals(mutation);
  return replacement.sha256;
}

function forgeWitnessRuntimePreimage(
  observations: JsonRecord[],
  witnessId: string,
  side: "runtimeRequestSha256" | "runtimeResultSha256",
  forge: (payload: unknown) => void,
): void {
  const mutation = observations[1];
  if (mutation === undefined) throw new Error("mutation missing");
  const witness = recordInventory(
    mutation,
    "lawWitnessObservations",
    "law witness observation",
  ).find(({ caseId }) => caseId === witnessId);
  if (witness === undefined || typeof witness[side] !== "string") {
    throw new Error(`${witnessId}: runtime preimage reference missing`);
  }
  const oldDigest = witness[side];
  const payload = clone(runtimePreimagePayload(mutation, oldDigest));
  forge(payload);
  replaceRuntimePreimage(mutation, oldDigest, payload);
  observations[1] = resignMutationObservation(mutation);
}

function passingJUnit(): V0JUnitSummary {
  const cases = [
    { file: V0_MUTATION_PRODUCER.file, name: V0_MUTATION_PRODUCER.testcase },
    {
      file: V0_PRODUCTION_PRODUCER.file,
      name: V0_PRODUCTION_PRODUCER.testcase,
    },
    { file: V0_STATIC_PRODUCER.file, name: V0_STATIC_PRODUCER.testcase },
  ].sort((left, right) => {
    const leftKey = `${left.file}\u0000${left.name}`;
    const rightKey = `${right.file}\u0000${right.name}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return {
    tests: cases.length,
    assertions: cases.length,
    failures: 0,
    errors: 0,
    skipped: 0,
    files: [...new Set(cases.map(({ file }) => file))].sort(),
    cases,
  };
}

function fixtureObservationDigests(): Record<string, string> {
  return Object.fromEntries(buildV0CaseBindings().map(({ caseId }) => [
    caseId,
    v0EvidenceDigest({ caseId, runtime: "observed" }),
  ]));
}

function expandedObservationDigests(): Record<string, string> {
  const result = fixtureObservationDigests();
  for (const id of V0_EXPANDED_PRODUCTION_CASE_IDS) {
    result[id] = v0EvidenceDigest({
      id,
      kind: id.startsWith("V0-SEMANTIC-")
        ? "semantic-position"
        : "family-bass-state",
    });
  }
  return result;
}

type SyntheticProductionChannel =
  | "availability-cell"
  | "candidate"
  | "family-bass-state"
  | "law-case"
  | "law-witness"
  | "limit"
  | "operation"
  | "semantic-position"
  | "transposition";

function syntheticProductionChannel(
  caseId: string,
  fixturePath: string | null = null,
): SyntheticProductionChannel {
  if (/^V0-SEMANTIC-[0-9]{3}$/u.test(caseId)) return "semantic-position";
  if (/^V0-BASS-[0-9]{3}$/u.test(caseId)) return "family-bass-state";
  switch (fixturePath) {
    case "tests/fixtures/voicing/availability-matrix.json":
      return "availability-cell";
    case "tests/fixtures/voicing/candidate-cases.json":
      return "candidate";
    case "tests/fixtures/voicing/law-cases.json":
      return /^V0-LAW-[0-9]{3}$/u.test(caseId)
        ? "law-case"
        : "law-witness";
    case "tests/fixtures/voicing/limit-cases.json":
      return "limit";
    case "tests/fixtures/voicing/operation-state-cases.json":
      return "operation";
    case "tests/fixtures/voicing/transposition-seeds.json":
      return "transposition";
    default:
      throw new Error(`${caseId}: unknown production observation channel`);
  }
}

function fixtureRows(value: unknown, field: string): JsonRecord[] {
  const root = requireRecord(value, `${field} fixture`);
  const rows = root[field];
  if (!Array.isArray(rows)) throw new Error(`${field} fixture rows missing`);
  return rows.map((row, index) =>
    requireRecord(row, `${field}[${String(index)}]`)
  );
}

function fixtureTermination(
  row: JsonRecord,
  channel: "candidate" | "operation" | "transposition",
): string {
  if (channel === "transposition") {
    const sourceOracle = requireRecord(row["sourceOracle"], "sourceOracle");
    const termination = sourceOracle["expectedTermination"];
    if (typeof termination !== "string") throw new Error("termination missing");
    return termination;
  }
  const expected = requireRecord(row["expected"], "expected");
  if (channel === "candidate") {
    const termination = expected["kind"] === "must-contain-candidate"
      ? "complete-generated"
      : expected["termination"];
    if (typeof termination !== "string") throw new Error("termination missing");
    return termination;
  }
  const evidence = typeof expected["evidence"] === "object" &&
      expected["evidence"] !== null && !Array.isArray(expected["evidence"])
    ? requireRecord(expected["evidence"], "expected.evidence")
    : {};
  const id = String(row["id"]);
  const termination = expected["evidenceTermination"] ??
    evidence["termination"] ?? expected["termination"] ??
    (id.startsWith("V0-OP-NOT-APPLICABLE-") ? "complete-generated" : null);
  if (typeof termination !== "string") throw new Error(`${id} termination missing`);
  return termination;
}

function syntheticFullResultSetAudit(
  caseId: string,
  applicability: unknown,
): JsonRecord {
  const generated = applicability === "generated-candidate";
  const normalizedRange = generated && caseId === "V0-TRANS-017";
  return {
    applicability,
    independentGeneratedResultAudit: generated
      ? syntheticCompleteGeneratedResultAudit()
      : null,
    rawOrdinalTranspositionScope: generated
      ? normalizedRange ? "normalized-range" : "root-local"
      : "not-applicable",
    comparisonScope: generated
      ? normalizedRange
        ? "complete-ordered-list"
        : "shared-inverse-transposed-subsequence"
      : "not-applicable",
    candidateListApplicable: generated,
    completeCandidateListAudited: generated,
    candidateCardinalityClass: generated
      ? "nonempty-bounded"
      : "zero-not-applicable",
    allCandidateShapesAccepted: true,
    allCandidateIdentitiesAccepted: true,
    allCandidateRangesAccepted: true,
    allCandidateFamiliesAccepted: true,
    allCandidateRealizationsAccepted: true,
    allCandidateTemplatesAccepted: true,
    allCandidateBassSemanticsAccepted: true,
    allCandidateProvenanceAccepted: true,
    allCandidateForwardTranspositionsAccepted: true,
    allCandidateInverseTranspositionsAccepted: true,
    candidatesStrictlyOrdered: true,
    candidateIdentityKeysUnique: true,
    candidateIdsAndOrdinalsAligned: true,
    allCandidateRawOrdinalsAccepted: true,
    candidateRawOrdinalsUnique: true,
    cardinalityInvariantAcrossRoots: true,
    orderedIdentityInvariantAcrossRoots: true,
    sharedOrderedIdentityInvariantAcrossRoots: true,
    completeOrderedIdentityInvariantAcrossRoots: normalizedRange ? true : null,
    normalizedRangeRawCountInvariantAcrossRoots: normalizedRange ? true : null,
    normalizedRangeRetainedCountInvariantAcrossRoots: normalizedRange
      ? true
      : null,
    normalizedRangeSelectedRawOrdinalInvariantAcrossRoots: normalizedRange
      ? true
      : null,
    normalizedRangeSelectedRetainedOrdinalInvariantAcrossRoots:
      normalizedRange ? true : null,
  };
}

function syntheticCompleteGeneratedResultAudit(): JsonRecord {
  const ids = lawFixture.lawProofPolicy.completeResultAuditCheckIds;
  return {
    scope: "complete-generated-result-set",
    candidateCountWithinInclusiveBounds: true,
    auditedCandidateCountMatchesReturnedCount: true,
    checkCount: ids.length,
    checks: ids.map((id) => ({ id, accepted: true })),
  };
}

function syntheticResourceRecords(
  caseObservationDigests: Record<string, string>,
): JsonRecord {
  const roots = fixtureRows(transpositionFixture, "roots");
  const channels = [
    {
      channel: "candidate" as const,
      rows: fixtureRows(candidateFixture, "cases"),
    },
    {
      channel: "operation" as const,
      rows: [
        ...fixtureRows(operationFixture, "successCases"),
        ...fixtureRows(operationFixture, "refusalCases"),
        ...fixtureRows(operationFixture, "precedenceCases"),
        ...fixtureRows(operationFixture, "notApplicableCases"),
      ],
    },
    {
      channel: "transposition" as const,
      rows: fixtureRows(transpositionFixture, "seeds"),
    },
  ];
  const terminationCounts: Record<string, number> = Object.fromEntries(
    contractFixture.terminations.map((termination) => [termination, 0]),
  );
  const terminationObservationRecords = channels.flatMap(({ channel, rows }) =>
    rows.map((row) => {
      const caseId = String(row["id"]);
      const termination = fixtureTermination(row, channel);
      const fixtureExpected = channel === "transposition"
        ? {}
        : requireRecord(row["expected"], `${caseId}.expected`);
      const sourceOracle = channel === "transposition"
        ? requireRecord(row["sourceOracle"], `${caseId}.sourceOracle`)
        : {};
      const applicability = sourceOracle["applicability"];
      const actualProjection = channel === "transposition"
        ? {
            caseId,
            rootCellCount: roots.length,
            cells: roots.map((root) => ({
              rootId: root["id"],
              termination,
              fullResultSetAudit: syntheticFullResultSetAudit(
                caseId,
                applicability,
              ),
              ...(applicability === "generated-candidate"
                ? {
                    exactCandidatePresent: true,
                    requestRootObserved: true,
                    forwardProjectionAccepted: true,
                    inverseProjectionRestored: true,
                    inverseRequestProjectionRestored: true,
                  }
                : applicability === "stored-bypass"
                  ? {
                      kind: "stored-bypass",
                      candidateGenerationPerformed: false,
                      sameObjectValue: true,
                      inverseRequestProjectionRestored: true,
                    }
                  : {
                      ok: false,
                      refusal: sourceOracle["refusalProjection"],
                      forwardRefusalProjectionAccepted: true,
                      inverseRequestProjectionRestored: true,
                    }),
            })),
          }
        : channel === "candidate"
          ? fixtureExpected["kind"] === "must-contain-candidate"
            ? {
                caseId,
                ok: true,
                kind: "generated",
                termination,
                completeResultAudit: syntheticCompleteGeneratedResultAudit(),
              }
            : fixtureExpected["kind"] === "stored-bypass"
              ? { caseId, ok: true, kind: "stored-bypass", termination }
              : {
                  caseId,
                  ok: false,
                  code: fixtureExpected["code"],
                  termination,
                }
          : caseId.startsWith("V0-OP-SUCCESS-")
            ? {
                caseId,
                ok: true,
                valueKind: fixtureExpected["valueKind"],
                termination,
                ...(caseId === "V0-OP-SUCCESS-001" ||
                    caseId === "V0-OP-SUCCESS-004"
                  ? {
                      completeResultAudit:
                        syntheticCompleteGeneratedResultAudit(),
                    }
                  : {}),
              }
            : caseId.startsWith("V0-OP-REFUSAL-")
              ? {
                  caseId,
                  ok: false,
                  refusal: fixtureExpected["refusal"],
                  termination,
                }
              : caseId.startsWith("V0-OP-PRECEDENCE-")
                ? {
                    caseId,
                    winningCode: fixtureExpected["winningCode"],
                    termination,
                  }
                : {
                    caseId,
                    applies: false,
                    injectedAmbientFieldIgnored: true,
                    termination,
                  };
      terminationCounts[termination] =
        (terminationCounts[termination] ?? 0) +
        (channel === "transposition" ? roots.length : 1);
      caseObservationDigests[caseId] = v0EvidenceDigest({
        caseId,
        actual: actualProjection,
      });
      return { caseId, channel, actualProjection };
    })
  ).sort((left, right) =>
    left.caseId < right.caseId ? -1 : left.caseId > right.caseId ? 1 : 0
  );

  const counterBoundaryObservationRecords = fixtureRows(
    limitFixture,
    "counterBoundaryCases",
  ).map((row) => {
    const caseId = String(row["id"]);
    const maximum = Number(row["maximum"]);
    const boundary = row["boundary"];
    const exact = boundary === "exact-limit";
    const expected = requireRecord(row["expected"], `${caseId}.expected`);
    const actualProjection = {
      caseId,
      counterKind: row["counterKind"],
      counter: row["counter"],
      maximum,
      boundary,
      beforeExactValue: maximum - 1,
      exactAttempt: { ok: true, value: maximum },
      afterExactValue: maximum,
      plusOneAttempt: exact
        ? null
        : { ok: false, refusal: expected["refusal"] },
      afterPlusOneValue: exact ? null : maximum,
    };
    caseObservationDigests[caseId] = v0EvidenceDigest({
      caseId,
      actual: actualProjection,
    });
    return { caseId, actualProjection };
  }).sort((left, right) =>
    left.caseId < right.caseId ? -1 : left.caseId > right.caseId ? 1 : 0
  );

  const counters = [
    ...Object.keys(contractFixture.workLimits),
    ...Object.keys(contractFixture.memoryLimits),
  ];
  const zeroEvidence = {
    ...Object.fromEntries(counters.map((counter) => [counter, 0])),
    termination: "complete-bypass",
  };
  const storedBypassObservationRecords = fixtureRows(candidateFixture, "cases")
    .filter((row) =>
      requireRecord(row["expected"], `${String(row["id"])}.expected`)["kind"] ===
        "stored-bypass"
    )
    .map((row) => {
      const caseId = String(row["id"]);
      const actualProjection = {
        caseId,
        ok: true,
        kind: "stored-bypass",
        candidateGenerationPerformed: false,
        sameObjectValue: true,
        rawCandidateCount: 0,
        retainedCandidateCount: 0,
        allCounters: 0,
        counterEvidence: zeroEvidence,
        termination: "complete-bypass",
      };
      caseObservationDigests[caseId] = v0EvidenceDigest({
        caseId,
        actual: actualProjection,
      });
      const terminationRecord = terminationObservationRecords.find(
        (candidate) => candidate.caseId === caseId,
      );
      if (terminationRecord !== undefined) {
        terminationRecord.actualProjection = actualProjection;
      }
      return { caseId, actualProjection };
    });
  for (const record of storedBypassObservationRecords) {
    caseObservationDigests[record.caseId] = v0EvidenceDigest({
      caseId: record.caseId,
      actual: record.actualProjection,
    });
  }

  const wallTimeCase = fixtureRows(limitFixture, "wallTimeCases")[0];
  if (wallTimeCase === undefined) throw new Error("wall-time case missing");
  const wallTimeCaseId = String(wallTimeCase["id"]);
  const stableResult = { ok: true, evidence: { termination: "complete-generated" } };
  const stableResultProjection = {
    termination: "complete-generated",
    counterEvidence: Object.fromEntries(counters.map((counter) => [counter, 0])),
    resultKind: "generated",
    refusal: null,
    candidateCount: 1,
    fullResultSemanticDigest: v0EvidenceDigest(stableResult),
  };
  const wallTimeProjection = {
    caseId: wallTimeCaseId,
    perturbations: ["Date.now", "Math.random"],
    baselineProjection: stableResultProjection,
    perturbedProjection: clone(stableResultProjection),
  };
  const wallTimeObservationRecord = {
    caseId: wallTimeCaseId,
    actualProjection: wallTimeProjection,
  };
  caseObservationDigests[wallTimeCaseId] = v0EvidenceDigest({
    caseId: wallTimeCaseId,
    actual: wallTimeProjection,
  });
  return {
    workCounterMaxima: contractFixture.workLimits,
    memoryCounterMaxima: contractFixture.memoryLimits,
    terminationCounts,
    storedBypassZeroCounters: true,
    exactPlusOneLimitsRefuseAtomically: true,
    wallTimeGating: false,
    terminationObservationRecords,
    counterBoundaryObservationRecords,
    storedBypassObservationRecords,
    wallTimeObservationRecord,
  };
}

function syntheticAllCaseRecords(
  caseObservationDigests: Record<string, string>,
  resourceRecords: JsonRecord,
): JsonRecord[] {
  const rowsById = new Map<string, JsonRecord>();
  for (const binding of buildV0CaseBindings()) {
    rowsById.set(binding.caseId, {
      caseId: binding.caseId,
      channel: syntheticProductionChannel(
        binding.caseId,
        binding.fixturePath,
      ),
      actualProjection: {
        caseId: binding.caseId,
        fixtureRecordSha256: binding.fixtureRecordSha256,
        syntheticExecutedProjection: true,
      },
    });
  }
  for (const caseId of V0_EXPANDED_PRODUCTION_CASE_IDS) {
    rowsById.set(caseId, {
      caseId,
      channel: syntheticProductionChannel(caseId),
      actualProjection: {
        caseId,
        syntheticExecutedProjection: true,
      },
    });
  }

  const replaceResourceRows = (
    field: string,
    channel: SyntheticProductionChannel | null,
  ): void => {
    for (const resource of recordInventory(
      resourceRecords,
      field,
      field,
    )) {
      const caseId = String(resource["caseId"]);
      const observedChannel = channel ?? resource["channel"];
      if (typeof observedChannel !== "string") {
        throw new Error(`${field}/${caseId}: channel missing`);
      }
      rowsById.set(caseId, {
        caseId,
        channel: observedChannel,
        actualProjection: resource["actualProjection"],
      });
    }
  };
  replaceResourceRows("terminationObservationRecords", null);
  replaceResourceRows("counterBoundaryObservationRecords", "limit");
  replaceResourceRows("storedBypassObservationRecords", "candidate");
  const wallRecord = requireRecord(
    resourceRecords["wallTimeObservationRecord"],
    "wallTimeObservationRecord",
  );
  rowsById.set(String(wallRecord["caseId"]), {
    caseId: String(wallRecord["caseId"]),
    channel: "limit",
    actualProjection: wallRecord["actualProjection"],
  });

  const requiredStrings = (value: unknown, label: string): string[] => {
    if (!Array.isArray(value) ||
      !value.every((item) => typeof item === "string")) {
      throw new Error(`${label}: string inventory missing`);
    }
    return [...value];
  };
  const boundChildren = (ids: readonly string[]): JsonRecord[] => ids.map(
    (childCaseId) => {
      const child = rowsById.get(childCaseId);
      if (child === undefined) {
        throw new Error(`law child ${childCaseId}: observation missing`);
      }
      return {
        caseId: childCaseId,
        channel: child["channel"],
        projection: child["actualProjection"],
      };
    },
  );
  for (const law of fixtureRows(lawFixture, "cases")) {
    const caseId = String(law["id"]);
    const checkIds = requiredStrings(law["checkIds"], `${caseId}.checkIds`);
    const positiveCaseIds = requiredStrings(
      law["positiveCaseIds"],
      `${caseId}.positiveCaseIds`,
    );
    const negativeCaseIds = requiredStrings(
      law["negativeCaseIds"],
      `${caseId}.negativeCaseIds`,
    );
    const transpositionSeedIds = requiredStrings(
      law["transpositionSeedIds"],
      `${caseId}.transpositionSeedIds`,
    );
    rowsById.set(caseId, {
      caseId,
      channel: "law-case",
      actualProjection: {
        caseId,
        lawId: law["lawId"],
        predicate: law["predicate"],
        traceIds: law["traceIds"],
        authorityIds: law["authorityIds"],
        mutationControlIds: law["mutationControlIds"],
        checks: checkIds.map((id) => ({ id, accepted: true })),
        positiveBindings: boundChildren(positiveCaseIds),
        negativeBindings: boundChildren(negativeCaseIds),
        transpositionBindings: boundChildren(transpositionSeedIds),
      },
    });
  }

  const rows = [...rowsById.values()].sort((left, right) => {
    const leftId = String(left["caseId"]);
    const rightId = String(right["caseId"]);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
  for (const key of Object.keys(caseObservationDigests)) {
    Reflect.deleteProperty(caseObservationDigests, key);
  }
  for (const row of rows) {
    const caseId = String(row["caseId"]);
    caseObservationDigests[caseId] = v0EvidenceDigest({
      caseId,
      actual: row["actualProjection"],
    });
  }
  return rows;
}

const lawWitnessIds = new Set(lawFixture.witnesses.map(({ id }) => id));
const lawWitnessEnvelopeCache = new Map<
  string,
  ReturnType<typeof executeV0LawWitness>
>();

function reviewedLawWitnessEnvelope(
  caseId: string,
): ReturnType<typeof executeV0LawWitness> | null {
  if (!lawWitnessIds.has(caseId)) return null;
  const cached = lawWitnessEnvelopeCache.get(caseId);
  if (cached !== undefined) return cached;
  const envelope = executeV0LawWitness(caseId);
  lawWitnessEnvelopeCache.set(caseId, envelope);
  return envelope;
}

function syntheticCaseObservations(
  caseIds: readonly string[],
): readonly JsonRecord[] {
  const bindings = new Map(buildV0CaseBindings().map((binding) => [
    binding.caseId,
    binding,
  ]));
  return caseIds.map((caseId) => {
    const binding = bindings.get(caseId);
    if (binding === undefined) throw new Error(`missing binding ${caseId}`);
    const witnessEnvelope = reviewedLawWitnessEnvelope(caseId);
    if (witnessEnvelope !== null &&
      (witnessEnvelope.fixturePath !== binding.fixturePath ||
        witnessEnvelope.channel !== "law-witness" ||
        !witnessEnvelope.baselineAccepted)) {
      throw new Error(`${caseId}: reviewed witness envelope mismatch`);
    }
    const runtimeRequest = witnessEnvelope?.runtimeInput ?? {
      caseId,
      phase: "request",
    };
    const runtimeResult = witnessEnvelope?.runtimeOutput ?? {
      caseId,
      phase: "result",
    };
    const runtimeResultSha256 = v0EvidenceDigest(runtimeResult);
    const actualProjection = witnessEnvelope?.actualProjection ?? {
      caseId,
      candidate: {
        constraint: { reason: "reviewed-baseline", code: caseId },
        runtimeResultSha256,
      },
    };
    const expectedProjection = witnessEnvelope?.expectedProjection ??
      clone(actualProjection);
    const preimage = {
      caseId,
      fixturePath: binding.fixturePath,
      channel: syntheticProductionChannel(caseId, binding.fixturePath),
      fixtureRecordSha256: binding.fixtureRecordSha256,
      actualProjection,
      expectedProjection,
      baselineAccepted: true,
      runtimeRequest,
      runtimeResult,
      runtimeRequestSha256: v0EvidenceDigest(runtimeRequest),
      runtimeResultSha256,
    };
    return {
      ...preimage,
      observationDigest: v0EvidenceDigest(preimage),
    };
  });
}

function linkedCaseObservations(): readonly JsonRecord[] {
  return syntheticCaseObservations(
    inspectV0MutationLinkPartition().linkedCaseIds,
  );
}

function syntheticLawWitnessObservations(): readonly JsonRecord[] {
  return syntheticCaseObservations(lawFixture.witnesses.map(({ id }) => id));
}

function pooledCaseObservation(value: JsonRecord): JsonRecord {
  const preimage = Object.fromEntries(Object.entries(value).filter(([key]) =>
    key !== "runtimeRequest" && key !== "runtimeResult" &&
    key !== "observationDigest"
  ));
  return {
    ...preimage,
    observationDigest: v0EvidenceDigest(preimage),
  };
}

type SyntheticLeafMutation = Readonly<{
  path: readonly (string | number)[];
  expected: unknown;
  replacement: unknown;
}>;

function syntheticReplacement(value: unknown): unknown {
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return value + 1;
  if (typeof value === "string") return `${value}:synthetic-mutant`;
  if (value === null) return "synthetic-mutant";
  throw new TypeError("synthetic leaf replacement requires a JSON scalar");
}

function mutateFirstSyntheticLeaf(
  value: unknown,
  path: readonly (string | number)[] = [],
  acceptPath: (path: readonly (string | number)[]) => boolean = () => true,
): SyntheticLeafMutation | null {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      const childPath = [...path, index];
      if (typeof child !== "object" || child === null) {
        if (!acceptPath(childPath)) continue;
        const replacement = syntheticReplacement(child);
        value[index] = replacement;
        return { path: childPath, expected: child, replacement };
      }
      const nested = mutateFirstSyntheticLeaf(child, childPath, acceptPath);
      if (nested !== null) return nested;
    }
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as JsonRecord;
  for (const key of Object.keys(record).sort()) {
    if (key === "caseId") continue;
    const child = record[key];
    const childPath = [...path, key];
    if (typeof child !== "object" || child === null) {
      if (!acceptPath(childPath)) continue;
      const replacement = syntheticReplacement(child);
      record[key] = replacement;
      return { path: childPath, expected: child, replacement };
    }
    const nested = mutateFirstSyntheticLeaf(child, childPath, acceptPath);
    if (nested !== null) return nested;
  }
  return null;
}

function syntheticJsonPath(parts: readonly (string | number)[]): string {
  return parts.reduce<string>((path, part) =>
    typeof part === "number"
      ? `${path}[${String(part)}]`
      : /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(part)
        ? `${path}.${part}`
        : `${path}[${JSON.stringify(part)}]`, "$"
  );
}

function directExecutions(
  observations: readonly JsonRecord[],
): readonly JsonRecord[] {
  const observationMap = new Map(observations.map((row) => [
    String(row["caseId"]),
    row,
  ]));
  const bindings = new Map(buildV0CaseBindings().map((binding) => [
    binding.caseId,
    binding,
  ]));
  return inspectV0MutationLinkPartition().directLinks.map((link) => {
    const observation = observationMap.get(link.caseId);
    const binding = bindings.get(link.caseId);
    const control = mutationFixture.controls.find(({ id }) =>
      id === link.controlId
    );
    if (observation === undefined || binding === undefined ||
      control === undefined) {
      throw new Error(`missing direct evidence ${link.controlId}/${link.caseId}`);
    }
    const beforeProjection = {
      caseId: link.caseId,
      fixtureRecordSha256: binding.fixtureRecordSha256,
      channel: observation["channel"],
      result: observation["actualProjection"],
    };
    const afterProjection = clone(beforeProjection);
    const afterResult = requireRecord(
      afterProjection.result,
      "counterfactual result",
    );
    const leafMutation = mutateFirstSyntheticLeaf(afterResult);
    if (leafMutation === null) {
      throw new Error(`${link.controlId}/${link.caseId}: no mutable result leaf`);
    }
    const expectedProjection = {
      caseId: link.caseId,
      fixtureRecordSha256: binding.fixtureRecordSha256,
      channel: observation["channel"],
      result: observation["expectedProjection"],
    };
    const baselineDetectorProjection = clone(beforeProjection);
    const mutantDetectorProjection = clone(afterProjection);
    const expectedProjectionDigest = v0EvidenceDigest(expectedProjection);
    const reviewedInvariant = "synthetic-exact-runtime-projection-invariant";
    const targetPath = syntheticJsonPath(["result", ...leafMutation.path]);
    const detector = {
      oracleId: "independent-v0-fixture-expectation-v1",
      reviewedInvariant,
      baselineAccepted: true,
      mutantAccepted: false,
      sameReviewedExpectation: true,
      expectedProjectionDigest,
    };
    const preimage = {
      controlId: link.controlId,
      caseId: link.caseId,
      operator: control.operator,
      algorithm: control.operator,
      mutatedFault: control.mutatedFault,
      faultFamily: control.faultFamily,
      reviewedInvariant,
      executionClass: "semantic-output-counterfactual",
      targetPath,
      affectedPaths: [targetPath],
      affectedCount: 1,
      outOfScopeMismatchPaths: [],
      beforeProjection,
      afterProjection,
      beforeDigest: v0EvidenceDigest(beforeProjection),
      afterDigest: v0EvidenceDigest(afterProjection),
      baselineObservationDigest: observation["observationDigest"],
      fixtureRecordSha256: binding.fixtureRecordSha256,
      expectationSource: binding.fixturePath,
      expectedProjection,
      baselineDetectorProjection,
      mutantDetectorProjection,
      expectedProjectionDigest,
      detector,
      detectorDigest: v0EvidenceDigest(detector),
      baselineAccepted: true,
      mutantAccepted: false,
      coherence: {
        accepted: true,
        issues: [],
        caseBindingPreserved: true,
        outOfScopeMismatchPaths: [],
        noCollateralMutationOutsideTarget: true,
      },
      mutationOperation: {
        algorithm: control.operator,
        semanticFault: "synthetic exact semantic fault",
        selectorContract: "synthetic exact selector contract",
        actions: [{
          kind: "replace-exact",
          path: leafMutation.path,
          expected: leafMutation.expected,
          replacement: leafMutation.replacement,
        }],
      },
      killed: true,
    };
    return {
      ...preimage,
      executionDigest: v0EvidenceDigest(preimage),
    };
  });
}

function buildPassingObservations(): readonly JsonRecord[] {
  const preparedCaseObservations = linkedCaseObservations();
  const preparedLawWitnessObservations = syntheticLawWitnessObservations();
  const runtimePreimages = buildV0RuntimePreimagePool([
    ...preparedCaseObservations,
    ...preparedLawWitnessObservations,
  ].flatMap((row) => [row["runtimeRequest"], row["runtimeResult"]]));
  const caseObservations = preparedCaseObservations.map(pooledCaseObservation);
  const caseObservationDigests = Object.fromEntries(caseObservations.map(
    (row) => [String(row["caseId"]), String(row["observationDigest"])],
  ));
  const lawWitnessObservations = preparedLawWitnessObservations.map(
    pooledCaseObservation,
  );
  const lawWitnessObservationDigests = Object.fromEntries(
    lawWitnessObservations.map((row) => [
      String(row["caseId"]),
      String(row["observationDigest"]),
    ]),
  );
  const executions = directExecutions(caseObservations);
  const partition = inspectV0MutationLinkPartition();
  const corroborativeObservations = partition.corroborativeLinks.map((link) => ({
    ...link,
    observationDigest: caseObservationDigests[link.caseId],
  }));
  const controlExecutionDigests = Object.fromEntries(
    mutationFixture.controls.map(({ id }) => [
      id,
      v0EvidenceDigest(executions.filter(({ controlId }) => controlId === id)),
    ]),
  );
  const productionHashes = expandedObservationDigests();
  const resourceRecords = syntheticResourceRecords(productionHashes);
  const caseObservationRecords = syntheticAllCaseRecords(
    productionHashes,
    resourceRecords,
  );
  const production = signed({
    schema: V0_PRODUCTION_SCHEMA,
    suite: "v0-production-conformance",
    producer: V0_PRODUCTION_PRODUCER,
    status: "pass",
    availabilityCellsObserved: 1_295,
    semanticApplicabilityPositionsObserved: 112,
    familyBassStatesObserved: 42,
    candidateCasesObserved: 38,
    lawCasesObserved: 23,
    lawWitnessesObserved: 44,
    operationStateCasesObserved: 32,
    limitCasesObserved: 63,
    transpositionRootCellsObserved: 216,
    transpositionForwardCellsObserved: 216,
    transpositionInverseCellsObserved: 216,
    caseObservationRecords,
    caseObservationDigests: productionHashes,
    caseObservationRecordInventoryDigest: v0EvidenceDigest(
      caseObservationRecords,
    ),
    caseObservationInventoryDigest: v0EvidenceDigest(
      Object.entries(productionHashes).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0
      ),
    ),
    ...resourceRecords,
  });
  const mutation = signed({
    schema: V0_MUTATION_SCHEMA,
    suite: "laws-and-mutation-controls",
    producer: V0_MUTATION_PRODUCER,
    fixtureSchema: mutationFixture.schema,
    fixtureVersion: mutationFixture.fixtureVersion,
    lawFixtureSchema: lawFixture.schema,
    lawFixtureVersion: lawFixture.fixtureVersion,
    claim: "executable-semantic-counterfactuals-not-source-mutants",
    classification:
      "executable-semantic-counterfactuals-with-independent-fixture-oracles-not-source-mutants",
    oracleId: "independent-v0-fixture-expectation-v1",
    seed: "changes.v0-mutation-controls.seed.v2:exact-projections",
    deterministicReplayRuns: 2,
    status: "pass",
    controlIds: mutationFixture.controls.map(({ id }) => id),
    controlsDefined: 51,
    requiredFaultFamilies: mutationFixture.requiredFaultFamilies,
    faultFamiliesObserved: [
      ...new Set(mutationFixture.controls.map(({ faultFamily }) => faultFamily)),
    ].sort(),
    semanticOperatorsExecuted: 51,
    semanticOperatorsKilled: 51,
    semanticOperatorsSurvived: 0,
    directLinksReviewed: 104,
    directLinksExecuted: 104,
    directLinksKilled: 104,
    directLinksSurvived: 0,
    directKillerLinksReviewed: 104,
    directKillerLinksExecuted: 104,
    directKillerLinksKilled: 104,
    directKillerLinksSurvived: 0,
    corroborativeLinksReviewed: 2,
    corroborativeLinksObserved: 2,
    reviewedLinks: 106,
    reviewedCaseLinks: 106,
    totalReviewedLinks: 106,
    linkedCaseIds: partition.linkedCaseIds,
    linkedCasesObserved: 86,
    linkedCasesUnaccounted: [],
    lawWitnessesObserved: lawFixture.witnesses.length,
    lawWitnessObservations,
    lawWitnessObservationDigests,
    sourceMutantsExecuted: 0,
    sourceMutantsKilled: 0,
    runtimePreimagePool: runtimePreimages.entries,
    runtimePreimagePoolEntries: runtimePreimages.entries.length,
    runtimePreimagePoolCanonicalBytes: runtimePreimages.canonicalBytes,
    runtimePreimagePoolEncodedBytes: runtimePreimages.encodedBytes,
    caseObservations,
    caseObservationDigests,
    counterfactualExecutions: executions,
    corroborativeObservations,
    controlExecutionDigests,
    directLinkInventorySha256: partition.directLinkInventorySha256,
    corroborativeLinkInventorySha256:
      partition.corroborativeLinkInventorySha256,
    reviewedLinkInventorySha256: partition.reviewedLinkInventorySha256,
  });
  const staticObservation = signed({
    schema: V0_STATIC_SCHEMA,
    suite: "v0-production-policy",
    producer: V0_STATIC_PRODUCER,
    status: "pass",
    sourceFiles: V0_STATIC_SOURCE_FILES,
    allowedRuntimeImportPrefixes: V0_STATIC_ALLOWED_RUNTIME_IMPORT_PREFIXES,
    inspectedRuntimeImports: v0StaticRuntimeImports(),
    forbiddenImports: [],
    forbiddenRuntimeReferences: [],
    forbiddenRequestFields: [],
    fixtureOrTestSupportImports: [],
    moduleMutableBindings: 0,
    asyncOrGeneratorFunctions: 0,
    operationSynchronous: true,
    ambientReplayDeeplyEqual: true,
    projectSourcePolicy: {
      schema: "jcpe.source-policy.v1",
      traceIds: ["F0-BOUNDARY-01", "F0-DUPLICATE-01"],
      outcome: "pass",
      files: 1,
      findings: [],
    },
    applicability: {
      cancellation: false,
      staleRevision: false,
      browser: false,
      audio: false,
      storage: false,
    },
  });
  return [production, mutation, staticObservation];
}

let passingObservationCache: readonly JsonRecord[] | null = null;

function passingObservations(): readonly JsonRecord[] {
  passingObservationCache ??= buildPassingObservations();
  return clone(passingObservationCache);
}

function syntheticRunEnvironment(
  runId: string,
  compilerNodePath: string,
): JsonRecord {
  return {
    TZ: "UTC",
    LC_ALL: "C",
    LANG: "C",
    BUN_OPTIONS: "",
    NODE_OPTIONS: "",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    JCPE_NODE: compilerNodePath,
    NODE_BINARY: "",
    PATH: "",
    HOME: "",
    TMPDIR: "/tmp",
    V0_EVIDENCE_RUN_ID: runId,
  };
}

async function syntheticLedgerEnvironment(): Promise<JsonRecord> {
  const compilerNode = await findRealNode();
  const compilerNodeBytes = new Uint8Array(await Bun.file(
    compilerNode.path,
  ).arrayBuffer());
  const processors = cpus();
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  return {
    bun: Bun.version,
    nodeCompatibility: process.versions.node,
    compilerNodePath: compilerNode.path,
    compilerNodeVersion: compilerNode.version,
    compilerNodeMajor: compilerNode.major,
    compilerNodeBytes: compilerNodeBytes.byteLength,
    compilerNodeSha256: await sha256Hex(compilerNodeBytes),
    platform: platform(),
    release: release(),
    architecture: process.arch,
    cpuCount: processors.length,
    cpuModel: processors[0]?.model ?? "unavailable",
    totalMemoryBytes: totalmem(),
    locale: resolved.locale,
    timeZone: resolved.timeZone,
  };
}

function syntheticLedgerVersions(environment: JsonRecord): JsonRecord[] {
  const versions = new Map<string, string>();
  for (const dependencies of [
    packageFixture.dependencies,
    packageFixture.devDependencies,
  ]) {
    for (const [name, version] of Object.entries(dependencies)) {
      versions.set(name, version);
    }
  }
  versions.set("bun", String(environment["bun"]));
  versions.set("compiler-node", String(environment["compilerNodeVersion"]));
  versions.set(
    "node-compatibility",
    String(environment["nodeCompatibility"]),
  );
  return [...versions].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0
  ).map(([name, version]) => ({ name, version }));
}

async function syntheticLedgerCandidate(): Promise<Readonly<{
  candidate: JsonRecord;
  currentInputDigest: string;
}>> {
  const { snapshot } = await snapshotV0EvidenceInputs();
  const runId = v0EvidenceRunId(snapshot.digest);
  const paths = v0EvidencePaths(runId);
  const environment = await syntheticLedgerEnvironment();
  const executionEnvironment = syntheticRunEnvironment(
    runId,
    String(environment["compilerNodePath"]),
  );
  const artifact = snapshot.components.find(
    ({ path }) => path === "jazz_chord_progression_editor.html",
  );
  if (artifact === undefined) throw new Error("artifact input missing");
  const rawSha = "0".repeat(64);
  const resourceUsage = {
    measurement: "Bun.Subprocess.resourceUsage",
    maxRssRaw: 1,
    maxRssRawUnit: "kilobytes",
    maxRssBytes: 1_024,
    cpuUserMicros: 1,
    cpuSystemMicros: 1,
    gating: false,
  };
  const junit = passingJUnit();
  const validator = {
    command: ["bun", "scripts/validate-v0-contract.ts"],
    environment: executionEnvironment,
    stdoutPath: paths.validatorStdoutPath,
    stderrPath: paths.validatorStderrPath,
    stdoutSha256: rawSha,
    stderrSha256: rawSha,
    exitCode: 0,
    signal: null,
    elapsedMs: 1,
    resourceUsage,
    schema: "changes.validation.v0-contract.v1",
    outcome: "pass",
    counts: {},
    findings: [],
  };
  const suite = {
    command: focusedV0SuiteCommand(runId),
    environment: executionEnvironment,
    stdoutPath: paths.stdoutPath,
    stderrPath: paths.stderrPath,
    stdoutSha256: rawSha,
    stderrSha256: rawSha,
    exitCode: 0,
    signal: null,
    elapsedMs: 1,
    resourceUsage,
    junitPath: paths.junitPath,
    junitSha256: rawSha,
    ...junit,
    todos: 0,
    retries: 0,
    quarantined: 0,
    expectedFailures: 0,
  };
  const base = {
    schema: "changes.evidence.v0.v1",
    schemaVersion: 1,
    package: "V0",
    traceId: "V0",
    contractVersion: contractFixture.fixtureVersion,
    contractSchema: contractFixture.schema,
    runId,
    toolVersion: "jcpe.verify-v0-evidence.v1",
    mode: "focused-package",
    outcome: "pass",
    findings: [],
    artifact: {
      path: artifact.path,
      sha256: artifact.sha256,
      bytes: artifact.bytes,
    },
    browserVersions: [],
    input: { pre: snapshot, post: snapshot },
    fixtureBindings: snapshot.components.filter(({ group }) =>
      group === "fixtures"
    ),
    caseBindings: buildV0CaseBindings(),
    environment,
    versions: syntheticLedgerVersions(environment),
    reviewedCounts: V0_EXPECTED_COUNTS,
    applicability: V0_APPLICABILITY,
    runMetadata: {
      schema: "changes.evidence.v0.run-metadata.v1",
      path: paths.metadataPath,
      sha256: rawSha,
    },
    validator,
    suite,
    observations: [],
    traces: [],
    mutationEvidence: {},
    terminationEvidence: {},
    semanticResourceEvidence: {},
  };
  return {
    candidate: signed(base),
    currentInputDigest: snapshot.digest,
  };
}

describe("V0 evidence verifier self-controls", () => {
  test("canonicalizes, signs, and detects observation tampering", () => {
    const left = { z: [3, { b: 2, a: 1 }], a: true };
    const right = { a: true, z: [3, { a: 1, b: 2 }] };
    expect(stableV0EvidenceJson(left)).toBe(stableV0EvidenceJson(right));
    expect(v0EvidenceDigest(left)).toBe(v0EvidenceDigest(right));
    const observations = passingObservations();
    expect(inspectV0ObservationRecords(observations)).toEqual([]);
    expect(inspectV0ObservationRecords(
      JSON.parse(stableV0EvidenceJson(observations)) as JsonRecord[],
    )).toEqual([]);
    const tampered = clone(observations) as JsonRecord[];
    const production = tampered[0];
    if (production === undefined) throw new Error("production missing");
    production["availabilityCellsObserved"] = 1_294;
    expect(inspectV0ObservationRecords(tampered).map(({ code }) => code))
      .toContain("V0_EVIDENCE_OBSERVATION_DIGEST");
  }, 900_000);

  test("rejects re-signed production and static inventory substitutions", () => {
    const passing = passingObservations();
    const productionSubstitution = clone(passing) as JsonRecord[];
    const production = productionSubstitution[0];
    if (production === undefined ||
      typeof production["caseObservationDigests"] !== "object" ||
      production["caseObservationDigests"] === null ||
      Array.isArray(production["caseObservationDigests"])) {
      throw new Error("production observation map missing");
    }
    const productionMap = production["caseObservationDigests"] as JsonRecord;
    Reflect.deleteProperty(
      productionMap,
      "V0-SEMANTIC-001",
    );
    productionMap["V0-FORGED-EXTRA"] =
      v0EvidenceDigest({ forged: "replacement" });
    production["caseObservationInventoryDigest"] = v0EvidenceDigest(
      Object.entries(productionMap).sort(
        ([left], [right]) => left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    productionSubstitution[0] = signed(Object.fromEntries(
      Object.entries(production).filter(([key]) => key !== "semanticDigest"),
    ));
    expect(inspectV0ObservationRecords(productionSubstitution)
      .map(({ code }) => code)).toContain("V0_EVIDENCE_PRODUCTION_CASES");

    const validShaSubstitution = clone(passing) as JsonRecord[];
    const validShaProduction = validShaSubstitution[0];
    if (validShaProduction === undefined) throw new Error("production missing");
    const validShaMap = requireRecord(
      validShaProduction["caseObservationDigests"],
      "production case map",
    );
    validShaMap["V0-SEMANTIC-001"] = v0EvidenceDigest({
      forged: "valid-sha-without-projection-preimage",
    });
    validShaProduction["caseObservationInventoryDigest"] = v0EvidenceDigest(
      Object.entries(validShaMap).sort(
        ([left], [right]) => left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    validShaSubstitution[0] = signed(Object.fromEntries(
      Object.entries(validShaProduction).filter(
        ([key]) => key !== "semanticDigest",
      ),
    ));
    expect(inspectV0ObservationRecords(validShaSubstitution)
      .map(({ code }) => code)).toContain("V0_EVIDENCE_PRODUCTION_RECORDS");

    const lawSubstitution = clone(passing) as JsonRecord[];
    const lawProduction = lawSubstitution[0];
    if (lawProduction === undefined) throw new Error("production missing");
    const allCaseRecords = recordInventory(
      lawProduction,
      "caseObservationRecords",
      "all-case records",
    );
    const lawRecord = allCaseRecords.find(
      ({ caseId }) => caseId === "V0-LAW-001",
    );
    if (lawRecord === undefined) throw new Error("law record missing");
    const lawProjection = requireRecord(
      lawRecord["actualProjection"],
      "law projection",
    );
    const checks = recordInventory(lawProjection, "checks", "law checks");
    lawProjection["checks"] = checks.slice(0, -1);
    const positiveBindings = recordInventory(
      lawProjection,
      "positiveBindings",
      "positive bindings",
    );
    if (positiveBindings[0] !== undefined) {
      positiveBindings[0]["projection"] = { forged: "unbound-child" };
    }
    const lawMap = requireRecord(
      lawProduction["caseObservationDigests"],
      "production case map",
    );
    lawMap["V0-LAW-001"] = v0EvidenceDigest({
      caseId: "V0-LAW-001",
      actual: lawProjection,
    });
    lawProduction["caseObservationRecordInventoryDigest"] =
      v0EvidenceDigest(allCaseRecords);
    lawProduction["caseObservationInventoryDigest"] = v0EvidenceDigest(
      Object.entries(lawMap).sort(
        ([left], [right]) => left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    lawSubstitution[0] = signed(Object.fromEntries(
      Object.entries(lawProduction).filter(([key]) => key !== "semanticDigest"),
    ));
    expect(inspectV0ObservationRecords(lawSubstitution)
      .map(({ code }) => code))
      .toContain("V0_EVIDENCE_PRODUCTION_LAW_RECORD");

    const malformedDigestSubstitution = clone(
      passing,
    ) as JsonRecord[];
    const malformedProduction = malformedDigestSubstitution[0];
    if (malformedProduction === undefined) throw new Error("production missing");
    const malformedCaseMap = requireRecord(
      malformedProduction["caseObservationDigests"],
      "production case map",
    );
    malformedCaseMap["V0-FORGED-EXTRA"] = "not-a-sha256";
    malformedDigestSubstitution[0] = signed(Object.fromEntries(
      Object.entries(malformedProduction).filter(
        ([key]) => key !== "semanticDigest",
      ),
    ));
    expect(inspectV0ObservationRecords(malformedDigestSubstitution)
      .map(({ code }) => code)).toContain("V0_EVIDENCE_PRODUCTION_CASES");

    const resourceSubstitution = clone(passing) as JsonRecord[];
    const resourceProduction = resourceSubstitution[0];
    if (resourceProduction === undefined) throw new Error("production missing");
    const terminationRows = recordInventory(
      resourceProduction,
      "terminationObservationRecords",
      "termination records",
    );
    const terminationRow = terminationRows.find(
      ({ caseId }) => caseId === "V0-CAND-001",
    );
    if (terminationRow === undefined) throw new Error("termination row missing");
    const changedProjection = requireRecord(
      terminationRow["actualProjection"],
      "termination projection",
    );
    changedProjection["termination"] = "family-unavailable";
    const resourceCaseMap = requireRecord(
      resourceProduction["caseObservationDigests"],
      "production case map",
    );
    resourceCaseMap["V0-CAND-001"] = v0EvidenceDigest({
      caseId: "V0-CAND-001",
      actual: changedProjection,
    });
    const terminationCounts = requireRecord(
      resourceProduction["terminationCounts"],
      "termination counts",
    );
    terminationCounts["complete-generated"] =
      Number(terminationCounts["complete-generated"]) - 1;
    terminationCounts["family-unavailable"] =
      Number(terminationCounts["family-unavailable"]) + 1;
    resourceProduction["caseObservationInventoryDigest"] = v0EvidenceDigest(
      Object.entries(resourceCaseMap).sort(
        ([left], [right]) => left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    resourceSubstitution[0] = signed(Object.fromEntries(
      Object.entries(resourceProduction).filter(
        ([key]) => key !== "semanticDigest",
      ),
    ));
    expect(inspectV0ObservationRecords(resourceSubstitution)
      .map(({ code }) => code)).toContain("V0_EVIDENCE_PRODUCTION_RESOURCES");

    const transpositionAuditSubstitution = clone(
      passing,
    ) as JsonRecord[];
    const transpositionProduction = transpositionAuditSubstitution[0];
    if (transpositionProduction === undefined) throw new Error("production missing");
    const transpositionRow = recordInventory(
      transpositionProduction,
      "terminationObservationRecords",
      "termination records",
    ).find(({ caseId }) => caseId === "V0-TRANS-001");
    if (transpositionRow === undefined) throw new Error("transposition row missing");
    const transpositionProjection = requireRecord(
      transpositionRow["actualProjection"],
      "transposition projection",
    );
    const firstTranspositionCell = recordInventory(
      transpositionProjection,
      "cells",
      "transposition cells",
    )[0];
    if (firstTranspositionCell === undefined) {
      throw new Error("transposition cell missing");
    }
    Reflect.deleteProperty(firstTranspositionCell, "fullResultSetAudit");
    const transpositionCaseMap = requireRecord(
      transpositionProduction["caseObservationDigests"],
      "production case map",
    );
    transpositionCaseMap["V0-TRANS-001"] = v0EvidenceDigest({
      caseId: "V0-TRANS-001",
      actual: transpositionProjection,
    });
    transpositionProduction["caseObservationInventoryDigest"] = v0EvidenceDigest(
      Object.entries(transpositionCaseMap).sort(
        ([left], [right]) => left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    transpositionAuditSubstitution[0] = signed(Object.fromEntries(
      Object.entries(transpositionProduction).filter(
        ([key]) => key !== "semanticDigest",
      ),
    ));
    expect(inspectV0ObservationRecords(transpositionAuditSubstitution)
      .map(({ code }) => code)).toContain("V0_EVIDENCE_PRODUCTION_RESOURCES");

    const prunedProjectionSubstitution = clone(
      passing,
    ) as JsonRecord[];
    const prunedProduction = prunedProjectionSubstitution[0];
    if (prunedProduction === undefined) throw new Error("production missing");
    const prunedRow = recordInventory(
      prunedProduction,
      "terminationObservationRecords",
      "termination records",
    ).find(({ caseId }) => caseId === "V0-CAND-001");
    if (prunedRow === undefined) throw new Error("termination row missing");
    const prunedProjection = requireRecord(
      prunedRow["actualProjection"],
      "termination projection",
    );
    Reflect.deleteProperty(prunedProjection, "completeResultAudit");
    const prunedCaseMap = requireRecord(
      prunedProduction["caseObservationDigests"],
      "production case map",
    );
    prunedCaseMap["V0-CAND-001"] = v0EvidenceDigest({
      caseId: "V0-CAND-001",
      actual: prunedProjection,
    });
    prunedProduction["caseObservationInventoryDigest"] = v0EvidenceDigest(
      Object.entries(prunedCaseMap).sort(
        ([left], [right]) => left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    prunedProjectionSubstitution[0] = signed(Object.fromEntries(
      Object.entries(prunedProduction).filter(
        ([key]) => key !== "semanticDigest",
      ),
    ));
    expect(inspectV0ObservationRecords(prunedProjectionSubstitution)
      .map(({ code }) => code)).toContain("V0_EVIDENCE_PRODUCTION_RESOURCES");

    const counterSubstitution = clone(passing) as JsonRecord[];
    const counterProduction = counterSubstitution[0];
    if (counterProduction === undefined) throw new Error("production missing");
    const counterRow = recordInventory(
      counterProduction,
      "counterBoundaryObservationRecords",
      "counter records",
    ).find(({ caseId }) => caseId === "V0-LIMIT-WORK-001-PLUS-ONE");
    if (counterRow === undefined) throw new Error("counter row missing");
    const counterProjection = requireRecord(
      counterRow["actualProjection"],
      "counter projection",
    );
    counterProjection["afterPlusOneValue"] =
      Number(counterProjection["maximum"]) + 1;
    const counterCaseMap = requireRecord(
      counterProduction["caseObservationDigests"],
      "production case map",
    );
    counterCaseMap["V0-LIMIT-WORK-001-PLUS-ONE"] = v0EvidenceDigest({
      caseId: "V0-LIMIT-WORK-001-PLUS-ONE",
      actual: counterProjection,
    });
    counterProduction["caseObservationInventoryDigest"] = v0EvidenceDigest(
      Object.entries(counterCaseMap).sort(
        ([left], [right]) => left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    counterSubstitution[0] = signed(Object.fromEntries(
      Object.entries(counterProduction).filter(
        ([key]) => key !== "semanticDigest",
      ),
    ));
    expect(inspectV0ObservationRecords(counterSubstitution)
      .map(({ code }) => code)).toContain("V0_EVIDENCE_PRODUCTION_RESOURCES");

    const wallSubstitution = clone(passing) as JsonRecord[];
    const wallProduction = wallSubstitution[0];
    if (wallProduction === undefined) throw new Error("production missing");
    const wallRecord = requireRecord(
      wallProduction["wallTimeObservationRecord"],
      "wall record",
    );
    const wallProjection = requireRecord(
      wallRecord["actualProjection"],
      "wall projection",
    );
    requireRecord(
      wallProjection["perturbedProjection"],
      "perturbed wall projection",
    )["candidateCount"] = 2;
    const wallCaseId = String(wallRecord["caseId"]);
    const wallCaseMap = requireRecord(
      wallProduction["caseObservationDigests"],
      "production case map",
    );
    wallCaseMap[wallCaseId] = v0EvidenceDigest({
      caseId: wallCaseId,
      actual: wallProjection,
    });
    wallProduction["caseObservationInventoryDigest"] = v0EvidenceDigest(
      Object.entries(wallCaseMap).sort(
        ([left], [right]) => left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    wallSubstitution[0] = signed(Object.fromEntries(
      Object.entries(wallProduction).filter(
        ([key]) => key !== "semanticDigest",
      ),
    ));
    expect(inspectV0ObservationRecords(wallSubstitution)
      .map(({ code }) => code)).toContain("V0_EVIDENCE_PRODUCTION_RESOURCES");

    const staticSubstitution = clone(passing) as JsonRecord[];
    const staticObservation = staticSubstitution[2];
    if (staticObservation === undefined) throw new Error("static observation missing");
    staticObservation["sourceFiles"] = [
      ...V0_STATIC_SOURCE_FILES.slice(0, -1),
      "src/theory/forged-substitute.ts",
    ];
    staticSubstitution[2] = signed(Object.fromEntries(
      Object.entries(staticObservation).filter(
        ([key]) => key !== "semanticDigest",
      ),
    ));
    expect(inspectV0ObservationRecords(staticSubstitution)
      .map(({ code }) => code)).toContain("V0_EVIDENCE_STATIC_POLICY");

    const sourcePolicySubstitution = clone(passing) as JsonRecord[];
    const policyObservation = sourcePolicySubstitution[2];
    if (policyObservation === undefined) throw new Error("static observation missing");
    policyObservation["projectSourcePolicy"] = {
      schema: "jcpe.source-policy.v1",
      traceIds: ["F0-BOUNDARY-01", "F0-DUPLICATE-01"],
      outcome: "fail",
      files: 1,
      findings: [{ code: "forged" }],
    };
    sourcePolicySubstitution[2] = signed(Object.fromEntries(
      Object.entries(policyObservation).filter(
        ([key]) => key !== "semanticDigest",
      ),
    ));
    expect(inspectV0ObservationRecords(sourcePolicySubstitution)
      .map(({ code }) => code)).toContain("V0_EVIDENCE_STATIC_POLICY");

    const observationExtensions = clone(passing) as JsonRecord[];
    for (const [index, observation] of observationExtensions.entries()) {
      observation["unreviewedClaimExtension"] = `forged-${String(index)}`;
      observationExtensions[index] = signed(Object.fromEntries(
        Object.entries(observation).filter(([key]) => key !== "semanticDigest"),
      ));
    }
    expect(inspectV0ObservationRecords(observationExtensions)
      .filter(({ code }) => code === "V0_EVIDENCE_OBSERVATION_SHAPE"))
      .toHaveLength(3);

    const runtimeImportsSubstitution = clone(passing) as JsonRecord[];
    const runtimeImportsObservation = runtimeImportsSubstitution[2];
    if (runtimeImportsObservation === undefined) {
      throw new Error("static observation missing");
    }
    runtimeImportsObservation["inspectedRuntimeImports"] = [
      "src/theory/forged.ts:forged-runtime",
    ];
    runtimeImportsSubstitution[2] = signed(Object.fromEntries(
      Object.entries(runtimeImportsObservation).filter(
        ([key]) => key !== "semanticDigest",
      ),
    ));
    expect(inspectV0ObservationRecords(runtimeImportsSubstitution)
      .map(({ code }) => code)).toContain("V0_EVIDENCE_STATIC_POLICY");
  }, 900_000);

  test("keeps exact suite, input, case, trace, and reviewed-link inventories", async () => {
    expect(V0_FOCUSED_TEST_FILES).toHaveLength(13);
    expect([...V0_FOCUSED_TEST_FILES]).toEqual(
      [...V0_FOCUSED_TEST_FILES].sort(),
    );
    expect(V0_FIXTURE_FILES).toHaveLength(11);
    expect(V0_INPUT_GROUPS.contracts).toContain(
      "tests/conformance/V0_COVERAGE.md",
    );
    expect(V0_INPUT_GROUPS.contracts).toContain(
      "tests/conformance/V0_DISCREPANCIES.md",
    );
    expect(V0_INPUT_GROUPS.configuration).toContain("tsconfig*.json");
    expect(V0_INPUT_GROUPS.production).toEqual(["src/**/*"]);
    expect(V0_INPUT_GROUPS.harness).toEqual([
      "tests/support/v0-conformance-harness.ts",
      "tests/support/v0-mutation-materializer.ts",
      "tests/support/v0-voicing-fixture.ts",
    ]);
    expect(V0_APPLICABILITY).toHaveLength(12);
    expect(V0_EXPANDED_PRODUCTION_CASE_IDS).toHaveLength(154);
    expect(buildV0CaseBindings()).toHaveLength(1_513);

    const partition = inspectV0MutationLinkPartition();
    expect(partition.findings).toEqual([]);
    expect(partition.directLinks).toHaveLength(104);
    expect(partition.corroborativeLinks).toHaveLength(2);
    expect(partition.reviewedLinks).toHaveLength(106);
    expect(partition.linkedCaseIds).toHaveLength(86);
    expect(partition.directLinkInventorySha256).toBe(
      V0_DIRECT_MUTATION_LINK_INVENTORY_SHA256,
    );
    expect(partition.corroborativeLinkInventorySha256).toBe(
      V0_CORROBORATIVE_MUTATION_LINK_INVENTORY_SHA256,
    );
    expect(partition.reviewedLinkInventorySha256).toBe(
      V0_REVIEWED_MUTATION_LINK_INVENTORY_SHA256,
    );
    expect(V0_EXPECTED_COUNTS.mutationReviewedLinks).toBe(106);

    const config = await Bun.file(
      new URL("../../tsconfig.v0-tests.json", import.meta.url),
    ).json() as { include?: unknown; files?: unknown };
    expect(config.include).toEqual([]);
    expect(config.files).toEqual([...V0_FOCUSED_TEST_FILES]);

    const manifest = await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json() as { scripts?: Record<string, string> };
    expect(manifest.scripts?.["verify:v0-evidence"]).toBe(
      "bun scripts/verify-v0-evidence.ts",
    );
    const aggregate = await Bun.file(
      new URL("../../scripts/verify.ts", import.meta.url),
    ).text();
    const t1Gate = aggregate.indexOf('id: "t1-evidence"');
    const v0Gate = aggregate.indexOf('id: "v0-evidence"');
    const f3Gate = aggregate.indexOf('id: "f3-evidence"');
    expect(t1Gate).toBeGreaterThanOrEqual(0);
    expect(v0Gate).toBeGreaterThan(t1Gate);
    expect(f3Gate).toBeGreaterThan(v0Gate);
    const architecture = await Bun.file(
      new URL("../../docs/ARCHITECTURE.md", import.meta.url),
    ).text();
    expect(architecture).toContain("`bun run verify:v0-evidence`");

    const { snapshot } = await snapshotV0EvidenceInputs();
    const v0TestSupport = snapshot.components.filter(
      ({ group }) => group === "harness",
    );
    expect(v0TestSupport.map(({ path }) => path)).toEqual([
      "tests/support/v0-conformance-harness.ts",
      "tests/support/v0-mutation-materializer.ts",
      "tests/support/v0-voicing-fixture.ts",
    ]);
    expect(v0TestSupport.every(({ group }) => group === "harness")).toBe(
      true,
    );
    expect(
      snapshot.components.some(({ path }) =>
        path.startsWith("src/test-support/v0-")
      ),
    ).toBe(false);
    expect(await runNodeTool("tsc", [
      "-p",
      "tsconfig.v0-tests.json",
      "--noEmit",
      "--pretty",
      "false",
    ])).toBe(0);
  }, 600_000);

  test("sanitizes hostnames and rejects forged or duplicate JUnit", () => {
    const valid = '<?xml version="1.0"?><testsuites tests="1" assertions="2" failures="0" errors="0" skipped="0"><testsuite hostname="private-host"><testcase file="tests/proof.test.ts" name="works" /></testsuite></testsuites>';
    const sanitized = sanitizeV0JUnit(valid);
    expect(sanitized).not.toContain("private-host");
    expect(inspectV0JUnit(sanitized).summary).toEqual({
      tests: 1,
      assertions: 2,
      failures: 0,
      errors: 0,
      skipped: 0,
      files: ["tests/proof.test.ts"],
      cases: [{ file: "tests/proof.test.ts", name: "works" }],
    });
    expect(inspectV0JUnit(valid.replace('tests="1"', 'tests="2"')).summary)
      .toBeNull();
    const duplicate = valid.replace(
      "</testsuite>",
      '<testcase file="tests/proof.test.ts" name="works" /></testsuite>',
    ).replace('tests="1"', 'tests="2"');
    expect(inspectV0JUnit(duplicate).summary).toBeNull();
  });

  test("rejects every relaxed test-control spelling", () => {
    const findings = inspectV0TestControls("synthetic.test.ts", `
      import { test as spec, describe } from "bun:test";
      spec.skip("skip", () => {});
      spec.todo("todo");
      describe.only("only", () => {});
      spec.failing("failing", () => {});
      quarantine("known issue");
      spec("retry", () => {}, { retry: 2 });
      expectedFailure("known issue");
      xit("disabled", () => {});
    `);
    const codes = findings.map(({ code }) => code);
    expect(codes).toContain("V0_EVIDENCE_TODO");
    expect(codes).toContain("V0_EVIDENCE_QUARANTINE");
    expect(codes).toContain("V0_EVIDENCE_RETRY");
    expect(codes).toContain("V0_EVIDENCE_EXPECTED_FAILURE");
    expect(findings).toHaveLength(8);
  });

  test("parses exactly three signed marker records", () => {
    const observations = passingObservations();
    const output = [
      `${V0_PRODUCTION_MARKER}${JSON.stringify(observations[0])}`,
      `${V0_MUTATION_MARKER}${JSON.stringify(observations[1])}`,
      `${V0_STATIC_MARKER}${JSON.stringify(observations[2])}`,
    ].join("\n");
    const parsed = parseV0Observations(output);
    expect(parsed.findings).toEqual([]);
    expect(parsed.observations).toHaveLength(3);
    expect(parseV0Observations(output.replace(V0_STATIC_MARKER, "IGNORED "))
      .findings.map(({ code }) => code))
      .toContain("V0_EVIDENCE_OBSERVATION_INVENTORY");
  }, 900_000);

  test("recomputes all 15 traces and rejects missing runtime evidence", () => {
    const observations = passingObservations();
    const traces = buildV0TraceEvidence(
      observations,
      buildV0CaseBindings(),
      passingJUnit(),
      "pass",
    );
    expect(traces).toHaveLength(15);
    expect(traces.every(({ outcome }) => outcome === "pass")).toBe(true);
    expect(validateV0TraceEvidenceRows(traces, traces)).toEqual([]);
    expect(validateV0TraceEvidenceRows([...traces, traces[0]], traces)
      .map(({ code }) => code)).toContain("V0_EVIDENCE_TRACE_INVENTORY");

    const damaged = clone(observations) as JsonRecord[];
    const production = damaged[0];
    if (production === undefined ||
      typeof production["caseObservationDigests"] !== "object" ||
      production["caseObservationDigests"] === null) {
      throw new Error("production case map missing");
    }
    const removedCaseId = traces[0]?.requiredCaseIds[0] ?? "missing";
    Reflect.deleteProperty(production["caseObservationDigests"], removedCaseId);
    const mutation = damaged[1];
    if (mutation !== undefined &&
      typeof mutation["caseObservationDigests"] === "object" &&
      mutation["caseObservationDigests"] !== null &&
      !Array.isArray(mutation["caseObservationDigests"])) {
      Reflect.deleteProperty(mutation["caseObservationDigests"], removedCaseId);
      damaged[1] = resignMutationObservation(mutation);
    }
    damaged[0] = signed(Object.fromEntries(
      Object.entries(production).filter(([key]) => key !== "semanticDigest"),
    ));
    expect(buildV0TraceEvidence(
      damaged,
      buildV0CaseBindings(),
      passingJUnit(),
      "pass",
    ).some(({ outcome }) => outcome === "fail")).toBe(true);
  });

  test("recomputes 51 controls, 104 direct kills, and two corroborations", () => {
    const observations = passingObservations();
    const mutation = buildV0MutationEvidence(observations);
    expect(mutation.reviewedControls).toBe(51);
    expect(mutation.reviewedControlsDischarged).toBe(51);
    expect(mutation.semanticCounterfactualsExecuted).toBe(51);
    expect(mutation.semanticCounterfactualsKilled).toBe(51);
    expect(mutation.directKillerLinksReviewed).toBe(104);
    expect(mutation.directKillerLinksExecuted).toBe(104);
    expect(mutation.directKillerLinksKilled).toBe(104);
    expect(mutation.corroborativeLinksObserved).toBe(2);
    expect(mutation.reviewedCaseLinks).toBe(106);
    expect(mutation.linkedCasesObserved).toBe(86);
    expect(mutation.sourceMutantsExecuted).toBe(0);
    expect(mutation.outcome).toBe("pass");
    expect(validateV0MutationEvidenceRows(mutation, mutation)).toEqual([]);
    expect(validateV0MutationEvidenceRows({
      ...mutation,
      rows: [...mutation.rows, mutation.rows[0]],
    }, mutation).map(({ code }) => code))
      .toContain("V0_EVIDENCE_MUTATION_INVENTORY");

    const forged = clone(passingObservations()) as JsonRecord[];
    const forgedMutation = forged[1];
    if (forgedMutation === undefined) throw new Error("mutation missing");
    const corroboration = recordInventory(
      forgedMutation,
      "corroborativeObservations",
      "corroborative",
    )[0];
    if (corroboration === undefined) {
      throw new Error("corroborative observation missing");
    }
    corroboration["observationDigest"] = v0EvidenceDigest({
      forged: "unbound-corroboration",
    });
    expect(buildV0MutationEvidence(forged).outcome).toBe("fail");

    const unequalCase = clone(observations) as JsonRecord[];
    const unequalMutation = unequalCase[1];
    if (unequalMutation === undefined) throw new Error("mutation missing");
    const unequalObservation = recordInventory(
      unequalMutation,
      "caseObservations",
      "case observation",
    )[0];
    if (unequalObservation === undefined) {
      throw new Error("case observation missing");
    }
    unequalObservation["actualProjection"] = {
      forged: "actual-no-longer-equals-reviewed-expectation",
    };
    unequalObservation["observationDigest"] = v0EvidenceDigest(
      Object.fromEntries(Object.entries(unequalObservation).filter(
        ([key]) => key !== "observationDigest",
      )),
    );
    requireRecord(
      unequalMutation["caseObservationDigests"],
      "mutation case digests",
    )[String(unequalObservation["caseId"])] =
      unequalObservation["observationDigest"];
    unequalCase[1] = resignMutationObservation(unequalMutation);
    expect(inspectV0ObservationRecords(unequalCase).map(({ code }) => code))
      .toContain("V0_EVIDENCE_MUTATION_CASE_INVENTORY");

    const unboundRuntime = clone(observations) as JsonRecord[];
    const unboundRuntimeMutation = unboundRuntime[1];
    if (unboundRuntimeMutation === undefined) {
      throw new Error("mutation missing");
    }
    const unboundRuntimeObservation = recordInventory(
      unboundRuntimeMutation,
      "caseObservations",
      "case observation",
    )[0];
    if (unboundRuntimeObservation === undefined) {
      throw new Error("case observation missing");
    }
    const forgedRuntimeProjection = {
      forged: "equal-but-counterfactual-still-bound-to-old-runtime",
    };
    unboundRuntimeObservation["actualProjection"] = forgedRuntimeProjection;
    unboundRuntimeObservation["expectedProjection"] = clone(
      forgedRuntimeProjection,
    );
    unboundRuntimeObservation["observationDigest"] = v0EvidenceDigest(
      Object.fromEntries(Object.entries(unboundRuntimeObservation).filter(
        ([key]) => key !== "observationDigest",
      )),
    );
    requireRecord(
      unboundRuntimeMutation["caseObservationDigests"],
      "mutation case digests",
    )[String(unboundRuntimeObservation["caseId"])] =
      unboundRuntimeObservation["observationDigest"];
    unboundRuntime[1] = resignMutationObservation(unboundRuntimeMutation);
    expect(inspectV0ObservationRecords(unboundRuntime)
      .map(({ code }) => code))
      .toContain("V0_EVIDENCE_MUTATION_CASE_INVENTORY");
    expect(buildV0MutationEvidence(unboundRuntime).outcome).toBe("fail");
  }, 900_000);

  test("binds execution classes to exact runtime request/result preimages", () => {
    const withoutPreimages = clone(passingObservations()) as JsonRecord[];
    const missingMutation = withoutPreimages[1];
    if (missingMutation === undefined) throw new Error("mutation missing");
    const missingObservation = recordInventory(
      missingMutation,
      "caseObservations",
      "case observation",
    )[0];
    if (missingObservation === undefined) {
      throw new Error("case observation missing");
    }
    missingObservation["runtimeRequestSha256"] = v0EvidenceDigest({
      forged: "valid-sha-without-a-pooled-preimage",
    });
    withoutPreimages[1] = resignMutationCaseObservation(
      missingMutation,
      missingObservation,
    );
    expect(inspectV0ObservationRecords(withoutPreimages)
      .map(({ code }) => code))
      .toContain("V0_EVIDENCE_RUNTIME_PREIMAGE_POOL");

    const substituted = clone(passingObservations()) as JsonRecord[];
    const substitutedMutation = substituted[1];
    if (substitutedMutation === undefined) throw new Error("mutation missing");
    const productionId =
      lawFixture.lawProofPolicy.negativeWitnessExecutionPolicy
        .productionExecutedWitnessIds[0];
    const substitutedObservation = recordInventory(
      substitutedMutation,
      "caseObservations",
      "case observation",
    ).find(({ caseId }) => caseId === productionId);
    if (substitutedObservation === undefined) {
      throw new Error("production-class observation missing");
    }
    const unrelatedObservation = recordInventory(
      substitutedMutation,
      "caseObservations",
      "case observation",
    ).find(({ caseId }) =>
      typeof caseId === "string" && !lawWitnessIds.has(caseId)
    );
    if (unrelatedObservation === undefined) {
      throw new Error("unrelated runtime observation missing");
    }
    substitutedObservation["runtimeRequestSha256"] =
      unrelatedObservation["runtimeRequestSha256"];
    substituted[1] = resignMutationCaseObservation(
      substitutedMutation,
      substitutedObservation,
    );
    expect(inspectV0ObservationRecords(substituted)
      .map(({ code }) => code))
      .toContain("V0_EVIDENCE_MUTATION_CASE_INVENTORY");

    const mismatched = clone(passingObservations()) as JsonRecord[];
    const mismatchedMutation = mismatched[1];
    if (mismatchedMutation === undefined) throw new Error("mutation missing");
    const mixedId = lawFixture.lawProofPolicy.negativeWitnessExecutionPolicy
      .mixedWitnessIds[0];
    const mismatchedObservation = recordInventory(
      mismatchedMutation,
      "caseObservations",
      "case observation",
    ).find(({ caseId }) => caseId === mixedId);
    if (mismatchedObservation === undefined) {
      throw new Error("mixed-class observation missing");
    }
    const detectorOnlyId =
      lawFixture.lawProofPolicy.negativeWitnessExecutionPolicy
        .detectorOnlyWitnessIds[0];
    const detectorOnlyObservation = recordInventory(
      mismatchedMutation,
      "lawWitnessObservations",
      "law witness observation",
    ).find(({ caseId }) => caseId === detectorOnlyId);
    if (detectorOnlyObservation === undefined) {
      throw new Error("detector-only observation missing");
    }
    mismatchedObservation["runtimeRequestSha256"] =
      detectorOnlyObservation["runtimeRequestSha256"];
    mismatchedObservation["runtimeResultSha256"] =
      detectorOnlyObservation["runtimeResultSha256"];
    mismatched[1] = resignMutationCaseObservation(
      mismatchedMutation,
      mismatchedObservation,
    );
    expect(inspectV0ObservationRecords(mismatched)
      .map(({ code }) => code))
      .toContain("V0_EVIDENCE_MUTATION_CASE_INVENTORY");

    const substitutedOperation = clone(passingObservations()) as JsonRecord[];
    const operationMutation = substitutedOperation[1];
    if (operationMutation === undefined) throw new Error("mutation missing");
    const witnessRows = recordInventory(
      operationMutation,
      "lawWitnessObservations",
      "law witness observation",
    );
    const guideRow = witnessRows.find(({ caseId }) =>
      caseId === "V0-GUIDE-NEAR-001"
    );
    const fallbackRow = witnessRows.find(({ caseId }) =>
      caseId === "V0-FALLBACK-NEAR-001"
    );
    if (guideRow === undefined || fallbackRow === undefined) {
      throw new Error("production witness rows missing");
    }
    const guideRequestSha256 = guideRow["runtimeRequestSha256"];
    const guideResultSha256 = guideRow["runtimeResultSha256"];
    guideRow["runtimeRequestSha256"] = fallbackRow["runtimeRequestSha256"];
    guideRow["runtimeResultSha256"] = fallbackRow["runtimeResultSha256"];
    fallbackRow["runtimeRequestSha256"] = guideRequestSha256;
    fallbackRow["runtimeResultSha256"] = guideResultSha256;
    refreshMutationObservationDigest(
      operationMutation,
      guideRow,
      "lawWitnessObservationDigests",
    );
    refreshMutationObservationDigest(
      operationMutation,
      fallbackRow,
      "lawWitnessObservationDigests",
    );
    const linkedGuideRow = recordInventory(
      operationMutation,
      "caseObservations",
      "case observation",
    ).find(({ caseId }) => caseId === "V0-GUIDE-NEAR-001");
    const linkedFallbackRow = recordInventory(
      operationMutation,
      "caseObservations",
      "case observation",
    ).find(({ caseId }) => caseId === "V0-FALLBACK-NEAR-001");
    if (linkedGuideRow === undefined || linkedFallbackRow === undefined) {
      throw new Error("linked production observations missing");
    }
    for (const key of Object.keys(linkedGuideRow)) {
      Reflect.deleteProperty(linkedGuideRow, key);
    }
    Object.assign(linkedGuideRow, clone(guideRow));
    for (const key of Object.keys(linkedFallbackRow)) {
      Reflect.deleteProperty(linkedFallbackRow, key);
    }
    Object.assign(linkedFallbackRow, clone(fallbackRow));
    refreshMutationObservationDigest(
      operationMutation,
      linkedGuideRow,
      "caseObservationDigests",
    );
    refreshMutationObservationDigest(
      operationMutation,
      linkedFallbackRow,
      "caseObservationDigests",
    );
    substitutedOperation[1] = resignMutationObservation(operationMutation);
    expect(inspectV0ObservationRecords(substitutedOperation)
      .map(({ code }) => code))
      .toContain("V0_EVIDENCE_MUTATION_WITNESS_PREIMAGES");

    const omittedWitness = clone(passingObservations()) as JsonRecord[];
    const omittedMutation = omittedWitness[1];
    if (omittedMutation === undefined) throw new Error("mutation missing");
    const omittedRows = omittedMutation["lawWitnessObservations"];
    if (!Array.isArray(omittedRows)) {
      throw new Error("law witness observation inventory missing");
    }
    omittedRows.pop();
    omittedWitness[1] = resignMutationObservation(omittedMutation);
    expect(inspectV0ObservationRecords(omittedWitness)
      .map(({ code }) => code))
      .toContain("V0_EVIDENCE_MUTATION_WITNESS_PREIMAGES");

    const unlistedWitness = clone(passingObservations()) as JsonRecord[];
    const unlistedMutation = unlistedWitness[1];
    if (unlistedMutation === undefined) throw new Error("mutation missing");
    const unlistedRows = unlistedMutation["lawWitnessObservations"];
    if (!Array.isArray(unlistedRows)) {
      throw new Error("law witness observation inventory missing");
    }
    const firstWitness = requireRecord(unlistedRows[0], "law witness");
    unlistedRows.push({
      ...clone(firstWitness),
      caseId: "V0-UNLISTED-WITNESS",
    });
    unlistedWitness[1] = resignMutationObservation(unlistedMutation);
    expect(inspectV0ObservationRecords(unlistedWitness)
      .map(({ code }) => code))
      .toContain("V0_EVIDENCE_MUTATION_WITNESS_PREIMAGES");

    const opaqueDigest = clone(passingObservations()) as JsonRecord[];
    const opaqueMutation = opaqueDigest[1];
    if (opaqueMutation === undefined) throw new Error("mutation missing");
    requireRecord(
      opaqueMutation["lawWitnessObservationDigests"],
      "law witness digests",
    )["V0-DOUBLING-NEAR-002"] = v0EvidenceDigest({
      forged: "valid-sha-without-the-unlinked-witness-preimage",
    });
    opaqueDigest[1] = resignMutationObservation(opaqueMutation);
    expect(inspectV0ObservationRecords(opaqueDigest)
      .map(({ code }) => code))
      .toContain("V0_EVIDENCE_MUTATION_WITNESS_PREIMAGES");
  }, 900_000);

  test("rejects re-signed fixture-pinned semantic execution forgeries", () => {
    const detectorInput = (payload: unknown): JsonRecord => {
      const root = requireRecord(payload, "runtime request");
      const execution = requireRecord(root["execution"], "request execution");
      const detectors = recordInventory(
        execution,
        "detectors",
        "request detectors",
      );
      const first = detectors[0];
      if (first === undefined) throw new Error("request detector missing");
      return requireRecord(first["mutantInput"], "detector mutant input");
    };
    const detectorOutput = (payload: unknown): JsonRecord => {
      const root = requireRecord(payload, "runtime result");
      const execution = requireRecord(root["execution"], "result execution");
      const detectors = recordInventory(
        execution,
        "detectors",
        "result detectors",
      );
      const first = detectors[0];
      if (first === undefined) throw new Error("result detector missing");
      return requireRecord(first["detectorOutput"], "detector output");
    };
    const expectPinnedRejection = (observations: JsonRecord[]): void => {
      const findings = inspectV0ObservationRecords(observations);
      expect(findings.some(({ code }) =>
        code === "V0_EVIDENCE_MUTATION_WITNESS_PREIMAGES"
      )).toBe(true);
      expect(findings.some(({ code }) =>
        code === "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL"
      )).toBe(false);
    };

    const ignoredDetectorField = clone(passingObservations()) as JsonRecord[];
    forgeWitnessRuntimePreimage(
      ignoredDetectorField,
      "V0-ALT-NEAR-001",
      "runtimeRequestSha256",
      (payload) => {
        detectorInput(payload)["ignoredSemanticField"] = true;
      },
    );
    expectPinnedRejection(ignoredDetectorField);

    const oneBitSemanticDrift = clone(passingObservations()) as JsonRecord[];
    forgeWitnessRuntimePreimage(
      oneBitSemanticDrift,
      "V0-ALT-NEAR-001",
      "runtimeRequestSha256",
      (payload) => {
        const input = detectorInput(payload);
        const omittedDegreeNumber = input["omittedDegreeNumber"];
        if (typeof omittedDegreeNumber !== "number") {
          throw new Error("ALT omitted degree missing");
        }
        input["omittedDegreeNumber"] = omittedDegreeNumber ^ 1;
      },
    );
    expectPinnedRejection(oneBitSemanticDrift);

    const emptyAlteredPitchSets = clone(passingObservations()) as JsonRecord[];
    forgeWitnessRuntimePreimage(
      emptyAlteredPitchSets,
      "V0-ALT-NEAR-001",
      "runtimeRequestSha256",
      (payload) => {
        const input = detectorInput(payload);
        input["leftPitchSet"] = [];
        input["rightPitchSet"] = [];
      },
    );
    expectPinnedRejection(emptyAlteredPitchSets);

    const booleanOnlyEnharmonicPairs =
      clone(passingObservations()) as JsonRecord[];
    forgeWitnessRuntimePreimage(
      booleanOnlyEnharmonicPairs,
      "V0-TRANS-NEAR-001",
      "runtimeRequestSha256",
      (payload) => {
        detectorInput(payload)["pairs"] = [0, 1].map(() => ({
          inverseProjectionsEqual: true,
          outputSpellingsDistinct: true,
          rootSpellingsDistinct: true,
          soundingPitchClassEqual: true,
        }));
      },
    );
    expectPinnedRejection(booleanOnlyEnharmonicPairs);

    const arbitraryDetectorResult = clone(passingObservations()) as JsonRecord[];
    forgeWitnessRuntimePreimage(
      arbitraryDetectorResult,
      "V0-ALT-NEAR-001",
      "runtimeResultSha256",
      (payload) => {
        const output = detectorOutput(payload);
        for (const key of Object.keys(output)) Reflect.deleteProperty(output, key);
        output["arbitraryAccepted"] = true;
      },
    );
    expectPinnedRejection(arbitraryDetectorResult);
  }, 900_000);

  test("rejects open, duplicate, noncanonical, and over-bound runtime pools", () => {
    expect(() => buildV0RuntimePreimagePool(Array.from(
      { length: V0_RUNTIME_PREIMAGE_POOL_MAX_REFERENCES + 1 },
      () => null,
    ))).toThrow("reference bound");
    expect(() => buildV0RuntimePreimagePool(Array.from(
      { length: V0_RUNTIME_PREIMAGE_POOL_MAX_ENTRIES + 1 },
      (_, index) => ({ uniquePayloadIndex: index }),
    ))).toThrow("canonical bounds");

    const oversized = clone(passingObservations()) as JsonRecord[];
    const oversizedMutation = oversized[1];
    if (oversizedMutation === undefined) throw new Error("mutation missing");
    oversizedMutation["runtimePreimagePool"] = Array.from(
      { length: V0_RUNTIME_PREIMAGE_POOL_MAX_ENTRIES + 1 },
      () => null,
    );
    oversizedMutation["runtimePreimagePoolEntries"] =
      V0_RUNTIME_PREIMAGE_POOL_MAX_ENTRIES + 1;
    oversizedMutation["runtimePreimagePoolCanonicalBytes"] = 0;
    oversizedMutation["runtimePreimagePoolEncodedBytes"] = 0;
    oversized[1] = resignMutationObservation(oversizedMutation);
    expect(inspectV0ObservationRecords(oversized).some((finding) =>
      finding.code === "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL" &&
      finding.path.endsWith("runtimePreimagePool.preflight")
    )).toBe(true);

    const oversizedReferences = clone(passingObservations()) as JsonRecord[];
    const oversizedReferencesMutation = oversizedReferences[1];
    if (oversizedReferencesMutation === undefined) {
      throw new Error("mutation missing");
    }
    oversizedReferencesMutation["caseObservations"] = Array.from(
      { length: V0_EXPECTED_COUNTS.mutationLinkedCases + 1 },
      () => null,
    );
    oversizedReferencesMutation["lawWitnessObservations"] = Array.from(
      { length: V0_EXPECTED_COUNTS.lawWitnesses + 1 },
      () => null,
    );
    oversizedReferences[1] = resignMutationObservation(
      oversizedReferencesMutation,
    );
    expect(inspectV0ObservationRecords(oversizedReferences).some((finding) =>
      finding.code === "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL" &&
      finding.path.endsWith("runtimePreimagePool.references")
    )).toBe(true);

    const missing = clone(passingObservations()) as JsonRecord[];
    const missingMutation = missing[1];
    if (missingMutation === undefined) throw new Error("mutation missing");
    const missingPool = missingMutation["runtimePreimagePool"];
    if (!Array.isArray(missingPool) || missingPool.length === 0) {
      throw new Error("runtime preimage pool missing");
    }
    missingPool.shift();
    refreshRuntimePreimagePoolTotals(missingMutation);
    missing[1] = resignMutationObservation(missingMutation);
    expect(inspectV0ObservationRecords(missing).map(({ code }) => code))
      .toContain("V0_EVIDENCE_RUNTIME_PREIMAGE_POOL");

    const orphaned = clone(passingObservations()) as JsonRecord[];
    const orphanedMutation = orphaned[1];
    if (orphanedMutation === undefined) throw new Error("mutation missing");
    const orphanedPool = orphanedMutation["runtimePreimagePool"];
    if (!Array.isArray(orphanedPool)) throw new Error("runtime pool missing");
    const orphan = buildV0RuntimePreimagePool([{
      orphaned: "canonical-but-unreferenced",
    }]).entries[0];
    if (orphan === undefined) throw new Error("orphan entry missing");
    orphanedPool.push(clone(orphan));
    orphanedPool.sort((left, right) => {
      const leftSha = String(requireRecord(left, "left pool row")["sha256"]);
      const rightSha = String(requireRecord(right, "right pool row")["sha256"]);
      return leftSha < rightSha ? -1 : leftSha > rightSha ? 1 : 0;
    });
    refreshRuntimePreimagePoolTotals(orphanedMutation);
    orphaned[1] = resignMutationObservation(orphanedMutation);
    expect(inspectV0ObservationRecords(orphaned).map(({ code }) => code))
      .toContain("V0_EVIDENCE_RUNTIME_PREIMAGE_POOL");

    const duplicated = clone(passingObservations()) as JsonRecord[];
    const duplicatedMutation = duplicated[1];
    if (duplicatedMutation === undefined) throw new Error("mutation missing");
    const duplicatedPool = duplicatedMutation["runtimePreimagePool"];
    if (!Array.isArray(duplicatedPool) || duplicatedPool.length === 0) {
      throw new Error("runtime pool missing");
    }
    duplicatedPool.push(clone(duplicatedPool[0]));
    refreshRuntimePreimagePoolTotals(duplicatedMutation);
    duplicated[1] = resignMutationObservation(duplicatedMutation);
    expect(inspectV0ObservationRecords(duplicated).map(({ code }) => code))
      .toContain("V0_EVIDENCE_RUNTIME_PREIMAGE_POOL");

    const alternate = clone(passingObservations()) as JsonRecord[];
    const alternateMutation = alternate[1];
    if (alternateMutation === undefined) throw new Error("mutation missing");
    const alternateEntry = recordInventory(
      alternateMutation,
      "runtimePreimagePool",
      "runtime preimage pool",
    )[0];
    if (alternateEntry === undefined || typeof alternateEntry["data"] !== "string") {
      throw new Error("runtime pool entry missing");
    }
    const decoded = inflateRawSync(
      Buffer.from(alternateEntry["data"], "base64"),
    );
    const alternateEncoding = deflateRawSync(decoded, {
      level: 1,
      strategy: zlibConstants.Z_HUFFMAN_ONLY,
    });
    alternateEntry["data"] = alternateEncoding.toString("base64");
    alternateEntry["encodedBytes"] = alternateEncoding.byteLength;
    refreshRuntimePreimagePoolTotals(alternateMutation);
    alternate[1] = resignMutationObservation(alternateMutation);
    expect(inspectV0ObservationRecords(alternate).map(({ code }) => code))
      .toContain("V0_EVIDENCE_RUNTIME_PREIMAGE_POOL");

    const trailing = clone(passingObservations()) as JsonRecord[];
    const trailingMutation = trailing[1];
    if (trailingMutation === undefined) throw new Error("mutation missing");
    const trailingEntry = recordInventory(
      trailingMutation,
      "runtimePreimagePool",
      "runtime preimage pool",
    )[0];
    if (trailingEntry === undefined || typeof trailingEntry["data"] !== "string") {
      throw new Error("runtime pool entry missing");
    }
    const withTrailingByte = Buffer.concat([
      Buffer.from(trailingEntry["data"], "base64"),
      Buffer.from([0]),
    ]);
    trailingEntry["data"] = withTrailingByte.toString("base64");
    trailingEntry["encodedBytes"] = withTrailingByte.byteLength;
    refreshRuntimePreimagePoolTotals(trailingMutation);
    trailing[1] = resignMutationObservation(trailingMutation);
    expect(inspectV0ObservationRecords(trailing).map(({ code }) => code))
      .toContain("V0_EVIDENCE_RUNTIME_PREIMAGE_POOL");

    const oneBitDrift = clone(passingObservations()) as JsonRecord[];
    const oneBitMutation = oneBitDrift[1];
    if (oneBitMutation === undefined) throw new Error("mutation missing");
    const oneBitEntry = recordInventory(
      oneBitMutation,
      "runtimePreimagePool",
      "runtime preimage pool",
    )[0];
    if (oneBitEntry === undefined || typeof oneBitEntry["data"] !== "string") {
      throw new Error("runtime pool entry missing");
    }
    const bitDriftBytes = Buffer.from(oneBitEntry["data"], "base64");
    if (bitDriftBytes.length === 0) throw new Error("runtime pool entry empty");
    bitDriftBytes[0] = (bitDriftBytes[0] ?? 0) ^ 1;
    oneBitEntry["data"] = bitDriftBytes.toString("base64");
    oneBitDrift[1] = resignMutationObservation(oneBitMutation);
    expect(inspectV0ObservationRecords(oneBitDrift).some((finding) =>
      finding.code === "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL" &&
      finding.path.endsWith("runtimePreimagePool[0]")
    )).toBe(true);

    const malformedUtf8 = clone(passingObservations()) as JsonRecord[];
    const malformedUtf8Mutation = malformedUtf8[1];
    if (malformedUtf8Mutation === undefined) throw new Error("mutation missing");
    const malformedUtf8Entry = recordInventory(
      malformedUtf8Mutation,
      "runtimePreimagePool",
      "runtime preimage pool",
    )[0];
    if (malformedUtf8Entry === undefined) {
      throw new Error("runtime pool entry missing");
    }
    const malformedCanonicalJson = Buffer.from([
      0x22,
      0xf0,
      0x90,
      0x80,
      0x22,
    ]);
    const replacementCharacterJson = malformedCanonicalJson.toString("utf8");
    expect(Buffer.byteLength(replacementCharacterJson, "utf8"))
      .toBe(malformedCanonicalJson.byteLength);
    expect(JSON.parse(replacementCharacterJson)).toBe("\ufffd");
    const malformedEncoding = deflateRawSync(malformedCanonicalJson, {
      level: 9,
      memLevel: 8,
      strategy: zlibConstants.Z_DEFAULT_STRATEGY,
      windowBits: 15,
    });
    malformedUtf8Entry["sha256"] = v0EvidenceDigest("\ufffd");
    malformedUtf8Entry["canonicalBytes"] = malformedCanonicalJson.byteLength;
    malformedUtf8Entry["encodedBytes"] = malformedEncoding.byteLength;
    malformedUtf8Entry["data"] = malformedEncoding.toString("base64");
    const malformedUtf8Pool = malformedUtf8Mutation["runtimePreimagePool"];
    if (!Array.isArray(malformedUtf8Pool)) throw new Error("runtime pool missing");
    malformedUtf8Pool.sort((left, right) => {
      const leftSha = String(requireRecord(left, "left pool row")["sha256"]);
      const rightSha = String(requireRecord(right, "right pool row")["sha256"]);
      return leftSha < rightSha ? -1 : leftSha > rightSha ? 1 : 0;
    });
    refreshRuntimePreimagePoolTotals(malformedUtf8Mutation);
    malformedUtf8[1] = resignMutationObservation(malformedUtf8Mutation);
    expect(inspectV0ObservationRecords(malformedUtf8).some((finding) =>
      finding.code === "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL" &&
      finding.path.includes("runtimePreimagePool[")
    )).toBe(true);

    const overBound = clone(passingObservations()) as JsonRecord[];
    const overBoundMutation = overBound[1];
    if (overBoundMutation === undefined) throw new Error("mutation missing");
    const overBoundEntry = recordInventory(
      overBoundMutation,
      "runtimePreimagePool",
      "runtime preimage pool",
    )[0];
    if (overBoundEntry === undefined) throw new Error("runtime pool entry missing");
    overBoundEntry["canonicalBytes"] =
      V0_RUNTIME_PREIMAGE_MAX_CANONICAL_BYTES + 1;
    refreshRuntimePreimagePoolTotals(overBoundMutation);
    overBound[1] = resignMutationObservation(overBoundMutation);
    expect(inspectV0ObservationRecords(overBound).map(({ code }) => code))
      .toContain("V0_EVIDENCE_RUNTIME_PREIMAGE_POOL");

    const overAggregateCanonical = clone(passingObservations()) as JsonRecord[];
    const canonicalMutation = overAggregateCanonical[1];
    if (canonicalMutation === undefined) throw new Error("mutation missing");
    const canonicalEntries = recordInventory(
      canonicalMutation,
      "runtimePreimagePool",
      "runtime preimage pool",
    );
    if (canonicalEntries.length < 3) throw new Error("runtime pool too small");
    for (const entry of canonicalEntries.slice(0, 3)) {
      entry["canonicalBytes"] = V0_RUNTIME_PREIMAGE_MAX_CANONICAL_BYTES;
    }
    refreshRuntimePreimagePoolTotals(canonicalMutation);
    overAggregateCanonical[1] = resignMutationObservation(canonicalMutation);
    expect(inspectV0ObservationRecords(overAggregateCanonical).some((finding) =>
      finding.code === "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL" &&
      finding.path.endsWith("runtimePreimagePool.preflight")
    )).toBe(true);

    const overAggregateEncoded = clone(passingObservations()) as JsonRecord[];
    const encodedMutation = overAggregateEncoded[1];
    if (encodedMutation === undefined) throw new Error("mutation missing");
    const encodedEntries = recordInventory(
      encodedMutation,
      "runtimePreimagePool",
      "runtime preimage pool",
    );
    if (encodedEntries.length < 3) throw new Error("runtime pool too small");
    const maxEncodedBase64Length =
      4 * Math.ceil(V0_RUNTIME_PREIMAGE_MAX_ENCODED_BYTES / 3);
    for (const entry of encodedEntries.slice(0, 3)) {
      entry["encodedBytes"] = V0_RUNTIME_PREIMAGE_MAX_ENCODED_BYTES;
      entry["data"] = "A".repeat(maxEncodedBase64Length);
    }
    refreshRuntimePreimagePoolTotals(encodedMutation);
    overAggregateEncoded[1] = resignMutationObservation(encodedMutation);
    expect(inspectV0ObservationRecords(overAggregateEncoded).some((finding) =>
      finding.code === "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL" &&
      finding.path.endsWith("runtimePreimagePool.preflight")
    )).toBe(true);

    const tinyDeclaration = clone(passingObservations()) as JsonRecord[];
    const tinyMutation = tinyDeclaration[1];
    if (tinyMutation === undefined) throw new Error("mutation missing");
    const tinyEntry = recordInventory(
      tinyMutation,
      "runtimePreimagePool",
      "runtime preimage pool",
    )[0];
    if (tinyEntry === undefined) throw new Error("runtime pool entry missing");
    tinyEntry["canonicalBytes"] = 1;
    refreshRuntimePreimagePoolTotals(tinyMutation);
    tinyDeclaration[1] = resignMutationObservation(tinyMutation);
    expect(inspectV0ObservationRecords(tinyDeclaration).some((finding) =>
      finding.code === "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL" &&
      finding.path.endsWith("runtimePreimagePool[0]")
    )).toBe(true);

    const encodedSizeLie = clone(passingObservations()) as JsonRecord[];
    const encodedSizeMutation = encodedSizeLie[1];
    if (encodedSizeMutation === undefined) throw new Error("mutation missing");
    const encodedSizeEntry = recordInventory(
      encodedSizeMutation,
      "runtimePreimagePool",
      "runtime preimage pool",
    )[0];
    if (encodedSizeEntry === undefined) {
      throw new Error("runtime pool entry missing");
    }
    encodedSizeEntry["encodedBytes"] = 1;
    refreshRuntimePreimagePoolTotals(encodedSizeMutation);
    encodedSizeLie[1] = resignMutationObservation(encodedSizeMutation);
    expect(inspectV0ObservationRecords(encodedSizeLie).some((finding) =>
      finding.code === "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL" &&
      finding.path.endsWith("runtimePreimagePool.preflight")
    )).toBe(true);

    const expansionBomb = clone(passingObservations()) as JsonRecord[];
    const bombMutation = expansionBomb[1];
    if (bombMutation === undefined) throw new Error("mutation missing");
    const bombEntry = recordInventory(
      bombMutation,
      "runtimePreimagePool",
      "runtime preimage pool",
    )[0];
    if (bombEntry === undefined) throw new Error("runtime pool entry missing");
    const bombPayload = "x".repeat(
      V0_RUNTIME_PREIMAGE_MAX_CANONICAL_BYTES,
    );
    const bombCanonicalJson = JSON.stringify(bombPayload);
    const bombEncoding = deflateRawSync(
      Buffer.from(bombCanonicalJson, "utf8"),
      {
        level: 9,
        memLevel: 8,
        strategy: zlibConstants.Z_DEFAULT_STRATEGY,
        windowBits: 15,
      },
    );
    bombEntry["sha256"] = v0EvidenceDigest(bombPayload);
    bombEntry["canonicalBytes"] =
      V0_RUNTIME_PREIMAGE_MAX_CANONICAL_BYTES;
    bombEntry["encodedBytes"] = bombEncoding.byteLength;
    bombEntry["data"] = bombEncoding.toString("base64");
    const bombPool = bombMutation["runtimePreimagePool"];
    if (!Array.isArray(bombPool)) throw new Error("runtime pool missing");
    bombPool.sort((left, right) => {
      const leftSha = String(requireRecord(left, "left pool row")["sha256"]);
      const rightSha = String(requireRecord(right, "right pool row")["sha256"]);
      return leftSha < rightSha ? -1 : leftSha > rightSha ? 1 : 0;
    });
    refreshRuntimePreimagePoolTotals(bombMutation);
    expansionBomb[1] = resignMutationObservation(bombMutation);
    expect(inspectV0ObservationRecords(expansionBomb).some((finding) =>
      finding.code === "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL" &&
      finding.path.includes("runtimePreimagePool[")
    )).toBe(true);
  }, 900_000);

  test("rejects generic scalar, null-runtime, and collateral counterfactuals", () => {
    const passing = passingObservations();
    const observations = clone(passing) as JsonRecord[];
    const mutation = observations[1];
    if (mutation === undefined) throw new Error("mutation missing");
    const row = recordInventory(
      mutation,
      "counterfactualExecutions",
      "counterfactual",
    )[0];
    if (row === undefined) throw new Error("counterfactual row missing");
    row["targetPath"] = "$.semantic.field";
    row["affectedPaths"] = ["$.semantic.field"];
    row["beforeProjection"] = {
      caseId: row["caseId"],
      fixtureRecordSha256: row["fixtureRecordSha256"],
      semantic: { field: "baseline" },
    };
    row["afterProjection"] = {
      caseId: row["caseId"],
      fixtureRecordSha256: row["fixtureRecordSha256"],
      semantic: { field: "mutant" },
    };
    row["expectedProjection"] = clone(row["beforeProjection"]);
    row["baselineDetectorProjection"] = clone(row["beforeProjection"]);
    row["mutantDetectorProjection"] = clone(row["afterProjection"]);
    row["expectedProjectionDigest"] = v0EvidenceDigest(
      row["expectedProjection"],
    );
    const detector = requireRecord(row["detector"], "detector");
    detector["expectedProjectionDigest"] =
      row["expectedProjectionDigest"];
    row["detectorDigest"] = v0EvidenceDigest(detector);
    row["beforeDigest"] = v0EvidenceDigest(row["beforeProjection"]);
    row["afterDigest"] = v0EvidenceDigest(row["afterProjection"]);
    row["executionDigest"] = v0EvidenceDigest(Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== "executionDigest"),
    ));
    observations[1] = resignMutationObservation(mutation);
    expect(buildV0MutationEvidence(observations).outcome).toBe("fail");

    const nullRuntime = clone(passing) as JsonRecord[];
    const nullMutation = nullRuntime[1];
    if (nullMutation === undefined) throw new Error("mutation missing");
    const firstObservation = recordInventory(
      nullMutation,
      "caseObservations",
      "case observation",
    )[0];
    if (firstObservation === undefined) throw new Error("case observation missing");
    firstObservation["runtimeResultSha256"] = null;
    expect(buildV0MutationEvidence(nullRuntime).outcome).toBe("fail");

    const nullRequest = clone(passing) as JsonRecord[];
    const nullRequestMutation = nullRequest[1];
    if (nullRequestMutation === undefined) throw new Error("mutation missing");
    const requestObservation = recordInventory(
      nullRequestMutation,
      "caseObservations",
      "case observation",
    )[0];
    if (requestObservation === undefined) {
      throw new Error("case observation missing");
    }
    requestObservation["runtimeRequestSha256"] = null;
    expect(buildV0MutationEvidence(nullRequest).outcome).toBe("fail");

    const collateral = clone(passing) as JsonRecord[];
    const collateralMutation = collateral[1];
    if (collateralMutation === undefined) throw new Error("mutation missing");
    const collateralRow = recordInventory(
      collateralMutation,
      "counterfactualExecutions",
      "counterfactual",
    )[0];
    if (collateralRow === undefined) throw new Error("counterfactual row missing");
    const afterProjection = requireRecord(
      collateralRow["afterProjection"],
      "counterfactual projection",
    );
    const afterResult = requireRecord(
      afterProjection["result"],
      "counterfactual result",
    );
    const declaredTargetPath = collateralRow["targetPath"];
    if (typeof declaredTargetPath !== "string") {
      throw new Error("counterfactual target path missing");
    }
    const outsideTargetMutation = mutateFirstSyntheticLeaf(
      afterResult,
      [],
      (path) => {
        const candidatePath = syntheticJsonPath(["result", ...path]);
        return candidatePath !== declaredTargetPath &&
          !candidatePath.startsWith(`${declaredTargetPath}.`) &&
          !candidatePath.startsWith(`${declaredTargetPath}[`);
      },
    );
    if (outsideTargetMutation === null) {
      throw new Error("counterfactual result lacks an outside-target scalar");
    }
    collateralRow["mutantDetectorProjection"] = clone(
      collateralRow["afterProjection"],
    );
    collateralRow["afterDigest"] = v0EvidenceDigest(
      collateralRow["afterProjection"],
    );
    collateralRow["executionDigest"] = v0EvidenceDigest(Object.fromEntries(
      Object.entries(collateralRow).filter(([key]) => key !== "executionDigest"),
    ));
    collateral[1] = resignMutationObservation(collateralMutation);
    expect(buildV0MutationEvidence(collateral).outcome).toBe("fail");

    const expandedCollateral = clone(passing) as JsonRecord[];
    const expandedMutation = expandedCollateral[1];
    if (expandedMutation === undefined) throw new Error("mutation missing");
    const expandedRow = recordInventory(
      expandedMutation,
      "counterfactualExecutions",
      "counterfactual",
    )[0];
    if (expandedRow === undefined) throw new Error("counterfactual row missing");
    const expandedAfter = requireRecord(
      expandedRow["afterProjection"],
      "counterfactual projection",
    );
    const expandedResult = requireRecord(
      expandedAfter["result"],
      "counterfactual result",
    );
    const expandedCandidate = requireRecord(
      expandedResult["candidate"],
      "counterfactual candidate",
    );
    requireRecord(
      expandedCandidate["constraint"],
      "counterfactual constraint",
    )["code"] = "attacker-declared-collateral";
    expandedRow["affectedPaths"] = [
      "$.result.candidate.constraint.code",
      "$.result.candidate.constraint.reason",
    ];
    expandedRow["affectedCount"] = 2;
    expandedRow["mutantDetectorProjection"] = clone(
      expandedRow["afterProjection"],
    );
    expandedRow["afterDigest"] = v0EvidenceDigest(
      expandedRow["afterProjection"],
    );
    expandedRow["executionDigest"] = v0EvidenceDigest(Object.fromEntries(
      Object.entries(expandedRow).filter(([key]) => key !== "executionDigest"),
    ));
    expandedCollateral[1] = resignMutationObservation(expandedMutation);
    expect(buildV0MutationEvidence(expandedCollateral).outcome).toBe("fail");
  }, 900_000);

  test("rejects forged expectation and detector digests", () => {
    const passing = passingObservations();
    const forgedExpectation = clone(passing) as JsonRecord[];
    const expectationMutation = forgedExpectation[1];
    if (expectationMutation === undefined) throw new Error("mutation missing");
    const expectationRow = recordInventory(
      expectationMutation,
      "counterfactualExecutions",
      "counterfactual",
    )[0];
    if (expectationRow === undefined) throw new Error("counterfactual row missing");
    const expectationDetector = requireRecord(
      expectationRow["detector"],
      "counterfactual detector",
    );
    const forgedDigest = v0EvidenceDigest({ forged: "expectation" });
    expectationRow["expectedProjectionDigest"] = forgedDigest;
    expectationDetector["expectedProjectionDigest"] = forgedDigest;
    expectationRow["detectorDigest"] = v0EvidenceDigest(
      expectationDetector,
    );
    expectationRow["executionDigest"] = v0EvidenceDigest(Object.fromEntries(
      Object.entries(expectationRow).filter(
        ([key]) => key !== "executionDigest",
      ),
    ));
    forgedExpectation[1] = resignMutationObservation(expectationMutation);
    expect(buildV0MutationEvidence(forgedExpectation).outcome).toBe("fail");

    const forgedDetector = clone(passing) as JsonRecord[];
    const detectorMutation = forgedDetector[1];
    if (detectorMutation === undefined) throw new Error("mutation missing");
    const detectorRow = recordInventory(
      detectorMutation,
      "counterfactualExecutions",
      "counterfactual",
    )[0];
    if (detectorRow === undefined) throw new Error("counterfactual row missing");
    detectorRow["detectorDigest"] = v0EvidenceDigest({ forged: "detector" });
    detectorRow["executionDigest"] = v0EvidenceDigest(Object.fromEntries(
      Object.entries(detectorRow).filter(([key]) => key !== "executionDigest"),
    ));
    forgedDetector[1] = resignMutationObservation(detectorMutation);
    expect(buildV0MutationEvidence(forgedDetector).outcome).toBe("fail");

    const forgedOracle = clone(passing) as JsonRecord[];
    const oracleMutation = forgedOracle[1];
    if (oracleMutation === undefined) throw new Error("mutation missing");
    const oracleRow = recordInventory(
      oracleMutation,
      "counterfactualExecutions",
      "counterfactual",
    )[0];
    if (oracleRow === undefined) throw new Error("counterfactual row missing");
    const oracleDetector = requireRecord(
      oracleRow["detector"],
      "counterfactual detector",
    );
    oracleDetector["oracleId"] = "forged-self-certifying-oracle";
    oracleRow["detectorDigest"] = v0EvidenceDigest(oracleDetector);
    oracleRow["executionDigest"] = v0EvidenceDigest(Object.fromEntries(
      Object.entries(oracleRow).filter(([key]) => key !== "executionDigest"),
    ));
    forgedOracle[1] = resignMutationObservation(oracleMutation);
    expect(buildV0MutationEvidence(forgedOracle).outcome).toBe("fail");

    const unboundProjection = clone(passing) as JsonRecord[];
    const unboundMutation = unboundProjection[1];
    if (unboundMutation === undefined) throw new Error("mutation missing");
    const unboundRow = recordInventory(
      unboundMutation,
      "counterfactualExecutions",
      "counterfactual",
    )[0];
    if (unboundRow === undefined) throw new Error("counterfactual row missing");
    const unboundBefore = requireRecord(
      unboundRow["beforeProjection"],
      "counterfactual before projection",
    );
    const unboundAfter = requireRecord(
      unboundRow["afterProjection"],
      "counterfactual after projection",
    );
    unboundBefore["unboundDetectorInput"] = true;
    unboundAfter["unboundDetectorInput"] = true;
    unboundRow["beforeDigest"] = v0EvidenceDigest(
      unboundRow["beforeProjection"],
    );
    unboundRow["afterDigest"] = v0EvidenceDigest(
      unboundRow["afterProjection"],
    );
    unboundRow["executionDigest"] = v0EvidenceDigest(Object.fromEntries(
      Object.entries(unboundRow).filter(([key]) => key !== "executionDigest"),
    ));
    unboundProjection[1] = resignMutationObservation(unboundMutation);
    expect(buildV0MutationEvidence(unboundProjection).outcome).toBe("fail");

    const undefinedBypass = clone(passing) as JsonRecord[];
    const bypassMutation = undefinedBypass[1];
    if (bypassMutation === undefined) throw new Error("mutation missing");
    const bypassRow = recordInventory(
      bypassMutation,
      "counterfactualExecutions",
      "counterfactual",
    )[1];
    if (bypassRow === undefined) throw new Error("counterfactual row missing");
    const bypassDetector = requireRecord(
      bypassRow["detector"],
      "counterfactual detector",
    );
    bypassDetector["cacheBypass"] = undefined;
    undefinedBypass[1] = resignMutationObservation(bypassMutation);
    expect(buildV0MutationEvidence(undefinedBypass).outcome).toBe("fail");
    expect(buildV0MutationEvidence(undefinedBypass).outcome).toBe("fail");

    const mutableControl = mutationFixture.controls[0] as unknown as JsonRecord;
    const originalOperator = mutableControl["operator"];
    if (typeof originalOperator !== "string") {
      throw new Error("mutation control operator missing");
    }
    try {
      mutableControl["operator"] = `${originalOperator}-cache-context-bypass`;
      expect(buildV0MutationEvidence(clone(passing)).outcome).toBe("fail");
    } finally {
      mutableControl["operator"] = originalOperator;
    }

    expect(buildV0MutationEvidence(clone(passing)).outcome).toBe("pass");
    const lawRoot = lawFixture as unknown as JsonRecord;
    const lawProofPolicy = requireRecord(
      lawRoot["lawProofPolicy"],
      "law proof policy",
    );
    const negativeWitnessPolicy = requireRecord(
      lawProofPolicy["negativeWitnessExecutionPolicy"],
      "negative witness execution policy",
    );
    const guideSpec = recordInventory(
      negativeWitnessPolicy,
      "executionSpecs",
      "negative witness execution specs",
    ).find(({ witnessId }) => witnessId === "V0-GUIDE-NEAR-001");
    if (guideSpec === undefined ||
      typeof guideSpec["runtimeRequestSha256"] !== "string") {
      throw new Error("guide execution policy missing");
    }
    const originalGuideRequestDigest = guideSpec["runtimeRequestSha256"];
    try {
      guideSpec["runtimeRequestSha256"] = "0".repeat(64);
      const policyChanged = buildV0MutationEvidence(clone(passing));
      expect(policyChanged.outcome).toBe("fail");
      expect(policyChanged.rows.filter(({ killedByCaseIds }) =>
        killedByCaseIds.includes("V0-GUIDE-NEAR-001")
      ).every(({ outcome }) => outcome === "fail")).toBe(true);
    } finally {
      guideSpec["runtimeRequestSha256"] = originalGuideRequestDigest;
    }

    const sameObjectPoolBypass = clone(passing) as JsonRecord[];
    buildV0MutationEvidence(sameObjectPoolBypass);
    const sameObjectMutation = sameObjectPoolBypass[1];
    if (sameObjectMutation === undefined) throw new Error("mutation missing");
    const referencedCase = recordInventory(
      sameObjectMutation,
      "caseObservations",
      "case observation",
    )[0];
    if (referencedCase === undefined ||
      typeof referencedCase["runtimeRequestSha256"] !== "string") {
      throw new Error("referenced runtime request missing");
    }
    const referencedPoolEntry = recordInventory(
      sameObjectMutation,
      "runtimePreimagePool",
      "runtime preimage pool",
    ).find(({ sha256 }) =>
      sha256 === referencedCase["runtimeRequestSha256"]
    );
    if (referencedPoolEntry === undefined ||
      typeof referencedPoolEntry["data"] !== "string" ||
      referencedPoolEntry["data"].length === 0) {
      throw new Error("referenced runtime preimage missing");
    }
    const encoded = referencedPoolEntry["data"];
    referencedPoolEntry["data"] = `${encoded[0] === "A" ? "B" : "A"}${
      encoded.slice(1)
    }`;
    const poolFinding = (finding: Readonly<{ code: string; path: string }>) =>
      finding.code === "V0_EVIDENCE_RUNTIME_PREIMAGE_POOL" &&
      finding.path.includes("runtimePreimagePool[");
    expect(inspectV0ObservationRecords(sameObjectPoolBypass)
      .some(poolFinding)).toBe(true);
    expect(inspectV0ObservationRecords(sameObjectPoolBypass)
      .some(poolFinding)).toBe(true);
  }, 900_000);

  test("rejects re-signed ledger provenance and execution substitutions", async () => {
    const { candidate, currentInputDigest } = await syntheticLedgerCandidate();
    const codes = (value: JsonRecord): string[] =>
      validateV0EvidenceCandidate(value, currentInputDigest)
        .map(({ code }) => code);
    const resign = (value: JsonRecord): JsonRecord => signed(
      Object.fromEntries(Object.entries(value).filter(
        ([key]) => key !== "semanticDigest",
      )),
    );
    const baseCodes = codes(candidate);
    for (const code of [
      "V0_EVIDENCE_ARTIFACT",
      "V0_EVIDENCE_CONTRACT_BINDING",
      "V0_EVIDENCE_ENVIRONMENT",
      "V0_EVIDENCE_VERSIONS",
      "V0_EVIDENCE_RUN_METADATA_BINDING",
      "V0_EVIDENCE_VALIDATOR_EXECUTION_BINDING",
      "V0_EVIDENCE_SUITE_EXECUTION_BINDING",
      "V0_EVIDENCE_LEDGER_SHAPE",
      "V0_EVIDENCE_EXECUTION_SHAPE",
    ]) expect(baseCodes).not.toContain(code);
    const candidateSuite = requireRecord(candidate["suite"], "suite");
    const candidateValidator = requireRecord(
      candidate["validator"],
      "validator",
    );
    const candidateInput = requireRecord(candidate["input"], "input");
    const candidatePre = requireRecord(candidateInput["pre"], "input.pre");
    const rawMetadata = {
      schema: "changes.evidence.v0.run-metadata.v1",
      runId: candidate["runId"],
      commands: {
        validator: candidateValidator["command"],
        suite: candidateSuite["command"],
      },
      environment: candidateValidator["environment"],
      inputDigest: candidatePre["digest"],
    };
    expect(v0RunMetadataValueAccepted(candidate, rawMetadata)).toBe(true);
    const forgedRawMetadata = clone(rawMetadata);
    requireRecord(
      forgedRawMetadata["commands"],
      "raw metadata commands",
    )["validator"] = ["bun", "scripts/forged-validator.ts"];
    expect(v0RunMetadataValueAccepted(candidate, forgedRawMetadata)).toBe(false);

    const artifact = clone(candidate);
    requireRecord(artifact["artifact"], "artifact")["sha256"] = "f".repeat(64);
    expect(codes(resign(artifact))).toContain("V0_EVIDENCE_ARTIFACT");

    const contract = clone(candidate);
    contract["contractVersion"] = "9.9.9-forged";
    expect(codes(resign(contract))).toContain(
      "V0_EVIDENCE_CONTRACT_BINDING",
    );

    const environment = clone(candidate);
    requireRecord(environment["environment"], "environment")["release"] =
      "forged-kernel-release";
    expect(codes(resign(environment))).toContain("V0_EVIDENCE_ENVIRONMENT");

    const versions = clone(candidate);
    const versionRows = recordInventory(versions, "versions", "versions");
    if (versionRows[0] === undefined) throw new Error("version missing");
    versionRows[0]["version"] = "forged-version";
    expect(codes(resign(versions))).toContain("V0_EVIDENCE_VERSIONS");

    const suiteCommand = clone(candidate);
    requireRecord(suiteCommand["suite"], "suite")["command"] = [
      "bun",
      "test",
      "tests/forged-substitute.test.ts",
    ];
    expect(codes(resign(suiteCommand))).toContain(
      "V0_EVIDENCE_SUITE_EXECUTION_BINDING",
    );

    const validatorEnvironment = clone(candidate);
    requireRecord(
      requireRecord(validatorEnvironment["validator"], "validator")[
        "environment"
      ],
      "validator environment",
    )["TZ"] = "Pacific/Honolulu";
    expect(codes(resign(validatorEnvironment))).toContain(
      "V0_EVIDENCE_VALIDATOR_EXECUTION_BINDING",
    );

    const metadata = clone(candidate);
    requireRecord(metadata["runMetadata"], "run metadata")["path"] =
      "test-results/forged-run-metadata.json";
    expect(codes(resign(metadata))).toContain(
      "V0_EVIDENCE_RUN_METADATA_BINDING",
    );

    const extension = clone(candidate);
    extension["unreviewedExtension"] = true;
    expect(codes(resign(extension))).toContain("V0_EVIDENCE_LEDGER_SHAPE");

    const inputExtension = clone(candidate);
    const extendedInput = requireRecord(inputExtension["input"], "input");
    requireRecord(extendedInput["pre"], "input.pre")[
      "unreviewedSnapshotExtension"
    ] = true;
    expect(codes(resign(inputExtension))).toContain("V0_EVIDENCE_INPUT_SHAPE");

    const executionExtension = clone(candidate);
    requireRecord(
      requireRecord(executionExtension["suite"], "suite")["resourceUsage"],
      "resource usage",
    )["forgedUsage"] = 1;
    expect(codes(resign(executionExtension))).toContain(
      "V0_EVIDENCE_EXECUTION_SHAPE",
    );

    const negativeElapsed = clone(candidate);
    requireRecord(negativeElapsed["validator"], "validator")["elapsedMs"] = -1;
    expect(codes(resign(negativeElapsed))).toContain(
      "V0_EVIDENCE_EXECUTION_SHAPE",
    );
  }, 120_000);

  test("rejects malformed and stale ledger candidates", () => {
    expect(validateV0EvidenceCandidate(null, "a".repeat(64))
      .map(({ code }) => code)).toEqual(["V0_EVIDENCE_LEDGER_SHAPE"]);
    const codes = validateV0EvidenceCandidate({}, "a".repeat(64))
      .map(({ code }) => code);
    expect(codes).toContain("V0_EVIDENCE_LEDGER_IDENTITY");
    expect(codes).toContain("V0_EVIDENCE_INPUT_STALE");
    expect(codes).toContain("V0_EVIDENCE_SEMANTIC_DIGEST");
  });
});
