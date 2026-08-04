import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, test } from "bun:test";

import { validateX0ListeningEvidence } from
  "../../scripts/verify-x0-listening-evidence";
import rubricFixture from "../fixtures/audio-engine/listening-rubric.json";
import traceFixture from "../fixtures/audio-engine/trace-ledger.json";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const rubricPath = new URL(
  "../fixtures/audio-engine/listening-rubric.json",
  import.meta.url,
).pathname;
const listeningTrace = traceFixture.traces.find(
  (trace) => trace.id === "TR-X0-LISTENING",
);
if (listeningTrace === undefined) throw new Error("X0_LISTENING_TRACE_MISSING");
const listeningCaseIds = listeningTrace.caseIds;
const rubricSha256 = createHash("sha256")
  .update(await readFile(rubricPath))
  .digest("hex");

function evidenceRecords(): JsonRecord[] {
  return listeningCaseIds.flatMap((caseId) =>
    rubricFixture.requiredBrowsers.flatMap((browserName) =>
      rubricFixture.requiredOutputs.map((outputCategory) => ({
        date: "2026-07-14",
        browserName,
        browserVersion: `${browserName}-human-session-version`,
        operatingSystem: "Human-reviewed operating system",
        outputCategory,
        reviewer: "Human Reviewer",
        caseId,
        result: "pass",
        notes: "Physical audition completed against the reviewed row.",
        knownLimitations: "",
      })),
    ),
  );
}

function validEvidence(): JsonRecord {
  return {
    schema: "changes.release-evidence.x0-listening.v1",
    traceId: "TR-X0-LISTENING",
    rubricSchema: rubricFixture.schema,
    rubricSha256,
    attestation: {
      automatedListeningClaim: false,
      reviewerIsHuman: true,
      recordsCreatedAfterAudition: true,
      outputCategoriesPhysicallyVerified: true,
    },
    records: evidenceRecords(),
  };
}

function report(value: unknown) {
  return validateX0ListeningEvidence(
    value,
    rubricFixture,
    traceFixture,
    rubricSha256,
  );
}

describe("X0 human listening evidence honesty", () => {
  test("accepts exactly one attested physical-audition record per traced cell", () => {
    const actual = report(validEvidence());
    expect(actual.outcome).toBe("pass");
    expect(actual.expectedRecords).toBe(72);
    expect(actual.observedRecords).toBe(72);
    expect(actual.passingRecords).toBe(72);
    expect(actual.findings).toEqual([]);
  });

  test("keeps absent and unsupported human rows explicitly incomplete", () => {
    const absent = report(null);
    expect(absent.outcome).toBe("incomplete");
    expect(absent.findings.some(
      (finding) => finding.code === "X0_LISTENING_EVIDENCE_MISSING",
    )).toBe(true);
    expect(absent.findings.filter(
      (finding) => finding.code === "X0_LISTENING_CELL_MISSING",
    )).toHaveLength(72);

    const evidence = validEvidence();
    const records = evidence["records"];
    const first: unknown = Array.isArray(records) ? records[0] : undefined;
    if (!Array.isArray(records) || !isRecord(first)) {
      throw new Error("X0_LISTENING_TEST_RECORD_MISSING");
    }
    records[0] = {
      ...first,
      result: "not-supported-with-recorded-reason",
      notes: "The named physical output was not available; no listening claim was made.",
    };
    const unsupported = report(evidence);
    expect(unsupported.outcome).toBe("incomplete");
    expect(unsupported.unsupportedRecords).toBe(1);
    expect(unsupported.findings.map((finding) => finding.code)).toEqual([
      "X0_LISTENING_UNSUPPORTED",
    ]);
  });

  test("rejects automation identities, duplicate cells, failures, and stale rubric hashes", () => {
    const evidence = validEvidence();
    const records = evidence["records"];
    const first: unknown = Array.isArray(records) ? records[0] : undefined;
    if (!Array.isArray(records) || !isRecord(first)) {
      throw new Error("X0_LISTENING_TEST_RECORD_MISSING");
    }
    records.push({ ...first });
    records[0] = {
      ...first,
      reviewer: "Codex automation",
      result: "fail",
    };
    evidence["rubricSha256"] = "0".repeat(64);
    const actual = report(evidence);
    expect(actual.outcome).toBe("fail");
    const codes = new Set(actual.findings.map((finding) => finding.code));
    expect(codes).toEqual(new Set([
      "X0_LISTENING_CELL_DUPLICATE",
      "X0_LISTENING_FAILED",
      "X0_LISTENING_IDENTITY",
      "X0_LISTENING_REVIEWER",
    ]));
  });
});
