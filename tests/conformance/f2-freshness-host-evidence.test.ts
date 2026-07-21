import { describe, expect, test } from "bun:test";

import { decodeDocumentShapeWithEvidence } from "../../src/domain/document-decoder";
import { materializeF2AdversarialCases } from "../../src/test-support/f2-adversarial-materializer";
import {
  isRecursivelyFrozen,
  valueAtPath,
} from "../../src/test-support/f2-fixture-core";
import { materializeF2ShapeCases } from "../../src/test-support/f2-shape-materializer";
import adversarialFixture from "../fixtures/decoder/adversarial-cases.json";
import manifestFixture from "../fixtures/decoder/f2-decoder-contract.json";
import shapeFixture from "../fixtures/decoder/shape-cases.json";

const adversarialCells = materializeF2AdversarialCases(
  adversarialFixture,
  shapeFixture,
);
const shapeCells = materializeF2ShapeCases(manifestFixture, shapeFixture);

function descriptorSurface(value: object): ReadonlyMap<PropertyKey, PropertyDescriptor> {
  return new Map(Reflect.ownKeys(value).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) throw new Error("F2_DESCRIPTOR_SURFACE_MISSING");
    return [key, descriptor] as const;
  }));
}

function expectDescriptorSurfaceEqual(
  actualObject: object,
  expected: ReadonlyMap<PropertyKey, PropertyDescriptor>,
): void {
  const actual = descriptorSurface(actualObject);
  expect([...actual.keys()]).toEqual([...expected.keys()]);
  for (const [key, expectedDescriptor] of expected) {
    const actualDescriptor = actual.get(key);
    expect(actualDescriptor, `Object.prototype descriptor ${String(key)}`)
      .toBeDefined();
    if (actualDescriptor === undefined) continue;
    expect(actualDescriptor.configurable).toBe(expectedDescriptor.configurable);
    expect(actualDescriptor.enumerable).toBe(expectedDescriptor.enumerable);
    if ("value" in expectedDescriptor) {
      expect("value" in actualDescriptor).toBe(true);
      expect(actualDescriptor.value).toBe(expectedDescriptor.value);
      expect(actualDescriptor.writable).toBe(expectedDescriptor.writable);
    } else {
      expect("value" in actualDescriptor).toBe(false);
      const actualGetter: unknown = Reflect.get(actualDescriptor, "get");
      const expectedGetter: unknown = Reflect.get(expectedDescriptor, "get");
      const actualSetter: unknown = Reflect.get(actualDescriptor, "set");
      const expectedSetter: unknown = Reflect.get(expectedDescriptor, "set");
      expect(Object.is(actualGetter, expectedGetter)).toBe(true);
      expect(Object.is(actualSetter, expectedSetter)).toBe(true);
    }
  }
}

describe("F2 freshness and hostile-host evidence", () => {
  test("copies shared-DAG tonic locations into distinct frozen output objects", () => {
    const cell = adversarialCells.find(
      (value) => value.cellId === "F2-HOST-009#0002:shared-dag",
    );
    if (cell === undefined) throw new Error("F2_SHARED_DAG_CELL");
    const created = cell.createInput();
    const inputDocumentTonic = valueAtPath(created.input, ["key", "tonic"]);
    const inputSectionTonic = valueAtPath(
      created.input,
      ["sections", 0, "keyOverride", "tonic"],
    );
    expect(inputDocumentTonic).toBe(inputSectionTonic);

    const observation = decodeDocumentShapeWithEvidence(created.input);
    expect(observation.result.ok).toBe(true);
    if (!observation.result.ok) throw new Error("F2_SHARED_DAG_SUCCESS");
    const documentTonic = observation.result.value.key?.tonic;
    const sectionTonic = observation.result.value.sections[0]?.keyOverride?.tonic;
    expect(documentTonic).toBeDefined();
    expect(sectionTonic).toBeDefined();
    expect(documentTonic).not.toBe(sectionTonic);
    expect(documentTonic).toEqual(sectionTonic);
    expect(Object.isFrozen(documentTonic)).toBe(true);
    expect(Object.isFrozen(sectionTonic)).toBe(true);
  });

  test("returns distinct recursively frozen envelopes, results, and evidence per call", () => {
    const cell = shapeCells.find((value) => value.caseId === "F2-SHAPE-001");
    if (cell === undefined) throw new Error("F2_FRESH_MINIMAL_CELL");
    const input = cell.createInput().input;
    const first = decodeDocumentShapeWithEvidence(input);
    const second = decodeDocumentShapeWithEvidence(input);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.result).not.toBe(second.result);
    expect(first.evidence).not.toBe(second.evidence);
    expect(first.result.ok).toBe(true);
    expect(second.result.ok).toBe(true);
    if (!first.result.ok || !second.result.ok) {
      throw new Error("F2_FRESH_SUCCESS_EXPECTED");
    }
    expect(first.result.value).not.toBe(second.result.value);
    expect(isRecursivelyFrozen(first)).toBe(true);
    expect(isRecursivelyFrozen(second)).toBe(true);
  });

  test("leaves the complete Object.prototype own-descriptor fingerprint unchanged", () => {
    const baseline = descriptorSurface(Object.prototype);
    const cells = adversarialCells.filter((value) => value.caseId === "F2-HOST-003");
    expect(cells).toHaveLength(4);
    for (const cell of cells) {
      const created = cell.createInput();
      const observation = decodeDocumentShapeWithEvidence(created.input);
      expect(observation.result.ok, cell.cellId).toBe(false);
      expect(Object.values(created.observations), cell.cellId)
        .toEqual([0, 0, 0, 0, 0, 0, 0]);
      expectDescriptorSurfaceEqual(Object.prototype, baseline);
    }
  });
});
