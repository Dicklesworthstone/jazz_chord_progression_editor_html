import { describe, expect, test } from "bun:test";

import type { CompilePlaybackPlanRequest } from "../../src/playback";
import { compilePlaybackPlan } from "../../src/playback/compile-playback-plan";
import {
  materializeP0RealizationBaseline,
} from "../support/p0-playback-fixtures";

type MutableRecord = Record<string, unknown>;

function record(value: unknown, label: string): MutableRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`P0_CANDIDATE_RECORD:${label}`);
  }
  return value as MutableRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`P0_CANDIDATE_ARRAY:${label}`);
  }
  return value;
}

function generatedCandidate(
  request: CompilePlaybackPlanRequest,
): MutableRecord {
  const binding = [...request.realizedVoicings.values()][0];
  const bindingRecord = record(binding, "binding");
  const outcome = record(bindingRecord["outcome"], "outcome");
  return record(outcome["candidate"], "candidate");
}

function mutatedRequest(
  mutate: (candidate: MutableRecord) => void,
): CompilePlaybackPlanRequest {
  const baseline = materializeP0RealizationBaseline("P0-REAL-001");
  const request = structuredClone(baseline.request);
  mutate(generatedCandidate(request));
  return request;
}

function expectCandidateInvalid(
  request: CompilePlaybackPlanRequest,
  reason:
    | "candidate-identity"
    | "voice-record"
    | "constraint-evidence"
    | "score-or-explanation",
): void {
  const result = compilePlaybackPlan(request);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error(`P0_CANDIDATE_EXPECTED_${reason}`);
  expect(result.refusal).toMatchObject({
    code: "playback.generated_candidate_invalid",
    eventId: "event-p0-realization",
    reason,
  });
  expect(result.evidence.termination).toBe("realization-invalid");
}

describe("P0 request-aware generated-candidate validation", () => {
  test("raw generation ordinal remains inside the public V0 bound", () => {
    expectCandidateInvalid(
      mutatedRequest((candidate) => {
        candidate["rawGenerationOrdinal"] = 96;
      }),
      "candidate-identity",
    );
  });

  test("voice source-degree index must point into the selected realization", () => {
    expectCandidateInvalid(
      mutatedRequest((candidate) => {
        const voice = record(array(candidate["voices"], "voices")[1], "voice");
        voice["sourceDegreeIndex"] = 99;
      }),
      "voice-record",
    );
  });

  test("bass semantics cannot be rewritten as an invented slash bass", () => {
    expectCandidateInvalid(
      mutatedRequest((candidate) => {
        const voice = record(array(candidate["voices"], "voices")[0], "voice");
        voice["provenance"] = "slash-bass";
        voice["degree"] = null;
        voice["sourceDegreeIndex"] = null;
      }),
      "voice-record",
    );
  });

  test("evidence source identifiers must match public V0 authority", () => {
    expectCandidateInvalid(
      mutatedRequest((candidate) => {
        const evidence = record(
          array(candidate["evidence"], "evidence")[0],
          "evidence record",
        );
        evidence["sourceId"] = "valid-but-unrelated-authority";
      }),
      "constraint-evidence",
    );
  });

  test("explanation external bass must agree with the exact request", () => {
    expectCandidateInvalid(
      mutatedRequest((candidate) => {
        const explanation = record(candidate["explanation"], "explanation");
        explanation["externalBass"] = { step: "C", alter: 0 };
      }),
      "score-or-explanation",
    );
  });
});
