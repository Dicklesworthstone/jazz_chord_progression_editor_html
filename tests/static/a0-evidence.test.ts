import { describe, expect, test } from "bun:test";

import {
  A0_EXPECTED_COUNTS,
  a0EvidenceDigest,
  buildA0TraceEvidence,
  inspectA0JUnit,
  inspectA0TestControls,
  parseA0Observations,
  sanitizeA0JUnit,
  stableA0EvidenceJson,
  validateA0EvidenceCandidate,
} from "../../scripts/verify-a0-evidence";
import mutationFixture from
  "../fixtures/application-state/mutation-controls.json";
import sequenceFixture from
  "../fixtures/application-state/sequence-cases.json";
import staleFixture from
  "../fixtures/application-state/stale-and-transport-cases.json";
import stateFixture from
  "../fixtures/application-state/state-matrix.json";

const HASH = "a".repeat(64);

describe("A0 evidence verifier self-controls", () => {
  test("canonicalizes and hashes evidence independently of object key order", () => {
    const left = { z: [3, { b: 2, a: 1 }], a: true };
    const right = { a: true, z: [3, { a: 1, b: 2 }] };
    expect(stableA0EvidenceJson(left)).toBe(stableA0EvidenceJson(right));
    expect(a0EvidenceDigest(left)).toBe(a0EvidenceDigest(right));
    expect(a0EvidenceDigest(left)).toMatch(/^[a-f0-9]{64}$/u);
  });

  test("parses exact JUnit and rejects forged counts or duplicate identities", () => {
    const valid = '<?xml version="1.0"?><testsuites tests="1" assertions="2" failures="0" errors="0" skipped="0"><testsuite hostname="private-host"><testcase name="proof" file="tests/proof.test.ts" /></testsuite></testsuites>';
    const sanitized = sanitizeA0JUnit(valid);
    expect(sanitized).not.toContain("private-host");
    expect(inspectA0JUnit(sanitized).summary).toEqual({
      tests: 1,
      assertions: 2,
      failures: 0,
      errors: 0,
      skipped: 0,
      files: ["tests/proof.test.ts"],
      cases: [{ file: "tests/proof.test.ts", name: "proof" }],
    });
    expect(inspectA0JUnit(valid.replace('tests="1"', 'tests="2"')).summary)
      .toBeNull();
    expect(inspectA0JUnit(valid.replace('skipped="0"', 'skipped="1"')).summary)
      .toBeNull();
    const duplicate = valid.replace(
      "</testsuite>",
      '<testcase name="proof" file="tests/proof.test.ts" /></testsuite>',
    ).replace('tests="1"', 'tests="2"');
    expect(inspectA0JUnit(duplicate).summary).toBeNull();
  });

  test("detects skip, todo, only, quarantine, and retry relaxations", () => {
    const findings = inspectA0TestControls("synthetic.test.ts", `
      import { test as spec, describe } from "bun:test";
      spec.skip("skip", () => {});
      spec.todo("todo");
      describe.only("only", () => {});
      quarantine("known issue");
      spec("retry", () => {}, { retry: 2 });
      xit("disabled", () => {});
    `);
    const codes = findings.map(({ code }) => code);
    expect(codes).toContain("A0_EVIDENCE_TODO");
    expect(codes).toContain("A0_EVIDENCE_QUARANTINE");
    expect(codes).toContain("A0_EVIDENCE_RETRY");
    expect(findings).toHaveLength(6);
  });

  test("requires exactly one of every observation marker", () => {
    const parsed = parseA0Observations(
      'A0_RANDOM_OBSERVATION {"schema":"incomplete"}\n',
    );
    expect(parsed.findings.filter(({ code }) =>
      code === "A0_EVIDENCE_OBSERVATION_INVENTORY"
    )).toHaveLength(6);
  });

  test("binds every trace to reviewed case and mutation digests", () => {
    const stateHashes = Object.fromEntries(
      stateFixture.cases.map(({ id }) => [id, HASH]),
    );
    const staleHashes = Object.fromEntries(
      staleFixture.cases.map(({ id }) => [id, HASH]),
    );
    const sequenceHashes = Object.fromEntries(
      sequenceFixture.namedSequences.map(({ id }) => [id, HASH]),
    );
    const controlHashes = Object.fromEntries(
      mutationFixture.controls.map(({ id }) => [id, HASH]),
    );
    const traces = buildA0TraceEvidence({
      production: { caseHashes: stateHashes },
      gaps: {},
      stale: { caseHashes: staleHashes },
      named: { sequenceHashes },
      random: { sequenceDigestSha256: HASH },
      mutation: { controlExecutionDigests: controlHashes },
      static: {},
    });
    expect(traces).toHaveLength(A0_EXPECTED_COUNTS.traces);
    expect(traces.every((trace) => trace["outcome"] === "pass")).toBe(true);

    const damaged = structuredClone(stateHashes);
    Reflect.deleteProperty(damaged, "A0-CMD-001");
    const damagedTraces = buildA0TraceEvidence({
      production: { caseHashes: damaged },
      gaps: {},
      stale: { caseHashes: staleHashes },
      named: { sequenceHashes },
      random: { sequenceDigestSha256: HASH },
      mutation: { controlExecutionDigests: controlHashes },
      static: {},
    });
    expect(damagedTraces.some((trace) => trace["outcome"] === "fail"))
      .toBe(true);
  });

  test("rejects malformed or unsigned stored ledgers", () => {
    const findings = validateA0EvidenceCandidate({}, "b".repeat(64));
    const codes = findings.map(({ code }) => code);
    expect(codes).toContain("A0_EVIDENCE_LEDGER_IDENTITY");
    expect(codes).toContain("A0_EVIDENCE_RUN_ID");
    expect(codes).toContain("A0_EVIDENCE_INPUT_STALE");
    expect(codes).toContain("A0_EVIDENCE_DIGEST");

    const partialObservations = validateA0EvidenceCandidate(
      { observations: {} },
      "b".repeat(64),
    );
    expect(partialObservations.map(({ code }) => code))
      .toContain("A0_EVIDENCE_PRODUCTION");
    expect(partialObservations.map(({ code }) => code))
      .toContain("A0_EVIDENCE_STATIC");
  });
});
