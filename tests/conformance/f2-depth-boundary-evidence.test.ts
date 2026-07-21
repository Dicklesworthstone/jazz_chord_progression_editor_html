import { describe, expect, test } from "bun:test";

import { decodeDocumentShape } from "../../src/domain";
import { decodeDocumentShapeWithEvidence } from "../../src/domain/document-decoder";
import { materializeF2ShapeCases } from "../../src/test-support/f2-shape-materializer";
import manifestFixture from "../fixtures/decoder/f2-decoder-contract.json";
import shapeFixture from "../fixtures/decoder/shape-cases.json";

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`F2_DEPTH_WITNESS_RECORD:${label}`);
  }
  return value as Record<string, unknown>;
}

function defineData(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function exactDepthInput(depth: 32 | 33): unknown {
  const minimal = materializeF2ShapeCases(manifestFixture, shapeFixture)
    .find((cell) => cell.caseId === "F2-SHAPE-001");
  if (minimal === undefined) throw new Error("F2_DEPTH_WITNESS_MINIMAL");
  const input = minimal.createInput().input;
  const root = requireRecord(input, "root");

  let current: object = {};
  defineData(root, "extra", current);
  for (let containerDepth = 3; containerDepth <= depth; containerDepth += 1) {
    const next: object = containerDepth % 2 === 0 ? {} : [];
    if (Array.isArray(current)) defineData(current, 0, next);
    else defineData(current, "next", next);
    current = next;
  }
  if (Array.isArray(current)) defineData(current, 0, "[[not graph depth]]");
  else defineData(current, "tail", "[[not graph depth]]");
  return input;
}

describe("F2 exact depth-boundary evidence", () => {
  test("accepts depth 32 preflight with arrays counted and string brackets scalar", () => {
    const privateObservation = decodeDocumentShapeWithEvidence(exactDepthInput(32));
    const publicResult = decodeDocumentShape(exactDepthInput(32));

    expect(privateObservation.result).toEqual(publicResult);
    expect(privateObservation.result).toMatchObject({
      ok: false,
      errors: [{ code: "shape.unknown_field", path: ["extra"] }],
    });
    expect(privateObservation.evidence.maxDepthObserved).toBe(32);
    expect(privateObservation.evidence.arraysInspected).toBeGreaterThan(0);
  });

  test("refuses depth 33 before candidate allocation", () => {
    const privateObservation = decodeDocumentShapeWithEvidence(exactDepthInput(33));
    const publicResult = decodeDocumentShape(exactDepthInput(33));

    expect(privateObservation.result).toEqual(publicResult);
    expect(privateObservation.result).toMatchObject({
      ok: false,
      errors: [{ code: "limit.json_depth_exceeded", path: [] }],
    });
    expect(privateObservation.evidence.maxDepthObserved).toBe(33);
    expect(privateObservation.evidence.candidateObjectsAllocated).toBe(0);
    expect(privateObservation.evidence.candidateArraysAllocated).toBe(0);
  });
});
