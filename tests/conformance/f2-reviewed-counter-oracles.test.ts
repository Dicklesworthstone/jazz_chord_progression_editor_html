import { describe, expect, test } from "bun:test";

import { decodeDocumentShapeWithEvidence } from "../../src/domain/document-decoder";
import type { DocumentDecoderEvidence } from "../../src/domain/document-decoder-contract";
import { materializeF2AdversarialCases } from "../../src/test-support/f2-adversarial-materializer";
import {
  ownFixtureValue,
  requireFixtureArray,
  requireFixtureNumber,
  requireFixtureRecord,
  requireFixtureString,
  type FixtureRecord,
  type MaterializedFixtureCell,
} from "../../src/test-support/f2-fixture-core";
import { materializeF2ShapeCases } from "../../src/test-support/f2-shape-materializer";
import adversarialFixture from "../fixtures/decoder/adversarial-cases.json";
import manifestFixture from "../fixtures/decoder/f2-decoder-contract.json";
import shapeFixture from "../fixtures/decoder/shape-cases.json";

type EvidenceKey = keyof DocumentDecoderEvidence;

const shapeCases = requireFixtureArray(
  ownFixtureValue(requireFixtureRecord(shapeFixture, "shape fixture"), "cases"),
  "shape cases",
);
const materialized = materializeF2ShapeCases(manifestFixture, shapeFixture);
const adversarialCases = requireFixtureArray(
  ownFixtureValue(
    requireFixtureRecord(adversarialFixture, "adversarial fixture"),
    "cases",
  ),
  "adversarial cases",
);
const adversarialMaterialized = materializeF2AdversarialCases(
  adversarialFixture,
  shapeFixture,
);

function caseRecord(caseId: string): FixtureRecord {
  for (const value of shapeCases) {
    const record = requireFixtureRecord(value, "shape case");
    if (requireFixtureString(ownFixtureValue(record, "id"), "case id") === caseId) {
      return record;
    }
  }
  throw new Error(`F2_COUNTER_ORACLE_CASE:${caseId}`);
}

function cellsFor(caseId: string): readonly MaterializedFixtureCell[] {
  return materialized.filter((cell) => cell.caseId === caseId);
}

function adversarialCaseRecord(caseId: string): FixtureRecord {
  for (const value of adversarialCases) {
    const record = requireFixtureRecord(value, "adversarial case");
    if (requireFixtureString(ownFixtureValue(record, "id"), "case id") === caseId) {
      return record;
    }
  }
  throw new Error(`F2_COUNTER_ORACLE_ADVERSARIAL_CASE:${caseId}`);
}

function expectedRecord(value: unknown, label: string): FixtureRecord {
  return requireFixtureRecord(
    ownFixtureValue(requireFixtureRecord(value, label), "expected"),
    `${label}.expected`,
  );
}

function verifyEvidence(
  cell: MaterializedFixtureCell | undefined,
  expected: FixtureRecord,
  keys: readonly EvidenceKey[],
  label: string,
): void {
  if (cell === undefined) throw new Error(`F2_COUNTER_ORACLE_CELL:${label}`);
  const observation = decodeDocumentShapeWithEvidence(cell.createInput().input);
  for (const key of keys) {
    const reviewed = requireFixtureNumber(
      ownFixtureValue(expected, key),
      `${label}.${key}`,
    );
    expect(observation.evidence[key], `${label}.${key}`).toBe(reviewed);
  }
}

describe("F2 reviewed counter and tick oracles", () => {
  test("enforces both duplicate-cluster evidence records and invalid-sibling reachability", () => {
    const id3 = caseRecord("F2-ID-003");
    const id3Cells = cellsFor("F2-ID-003");
    const duplicateKeys = [
      "idOccurrences",
      "idClusters",
      "idDuplicateWorkUnits",
    ] as const satisfies readonly EvidenceKey[];
    verifyEvidence(
      id3Cells[0],
      expectedRecord(id3, "F2-ID-003"),
      duplicateKeys,
      "F2-ID-003.expected",
    );
    verifyEvidence(
      id3Cells[1],
      expectedRecord(
        ownFixtureValue(id3, "invalidSiblingCounterpart"),
        "F2-ID-003.invalidSiblingCounterpart",
      ),
      duplicateKeys,
      "F2-ID-003.invalidSiblingCounterpart.expected",
    );

    const id4 = caseRecord("F2-ID-004");
    verifyEvidence(
      cellsFor("F2-ID-004")[0],
      expectedRecord(id4, "F2-ID-004"),
      duplicateKeys,
      "F2-ID-004.expected",
    );

    const id6 = caseRecord("F2-ID-006");
    const id6Oracles = requireFixtureRecord(
      ownFixtureValue(
        requireFixtureRecord(ownFixtureValue(id6, "expected"), "F2-ID-006.expected"),
        "counterOracleByCell",
      ),
      "F2-ID-006.expected.counterOracleByCell",
    );
    const id6Cells = cellsFor("F2-ID-006");
    for (const [index, rawCell] of requireFixtureArray(
      ownFixtureValue(id6, "cells"),
      "F2-ID-006.cells",
    ).entries()) {
      const cellId = requireFixtureString(
        ownFixtureValue(requireFixtureRecord(rawCell, "F2-ID-006 cell"), "id"),
        "F2-ID-006 cell id",
      );
      verifyEvidence(
        id6Cells[index],
        requireFixtureRecord(
          ownFixtureValue(id6Oracles, cellId),
          `F2-ID-006 counter oracle ${cellId}`,
        ),
        duplicateKeys,
        `F2-ID-006.expected.counterOracleByCell.${cellId}`,
      );
    }
  });

  test("enforces every reviewed timeline addition and exact PPQ tick witness", () => {
    const time = caseRecord("F2-TIME-001");
    const timeCells = cellsFor("F2-TIME-001");
    const direct = requireFixtureArray(ownFixtureValue(time, "cells"), "time.cells");
    const aggregates = requireFixtureArray(
      ownFixtureValue(time, "aggregateCells"),
      "time.aggregateCells",
    );

    const obligations = [
      { cell: 9, expected: expectedRecord(direct[9], "time.cells[9]"), keys: ["timelineAdditions", "timelineTicksObserved"] },
      { cell: 15, expected: expectedRecord(direct[15], "time.cells[15]"), keys: ["timelineAdditions"] },
      { cell: 17, expected: expectedRecord(aggregates[0], "time.aggregateCells[0]"), keys: ["timelineAdditions"] },
      { cell: 18, expected: expectedRecord(aggregates[1], "time.aggregateCells[1]"), keys: ["timelineAdditions"] },
      { cell: 19, expected: expectedRecord(aggregates[2], "time.aggregateCells[2]"), keys: ["timelineAdditions", "timelineTicksObserved"] },
      { cell: 20, expected: expectedRecord(aggregates[3], "time.aggregateCells[3]"), keys: ["timelineAdditions", "timelineTicksObserved"] },
      { cell: 21, expected: expectedRecord(aggregates[4], "time.aggregateCells[4]"), keys: ["timelineAdditions"] },
      { cell: 22, expected: expectedRecord(aggregates[5], "time.aggregateCells[5]"), keys: ["timelineAdditions"] },
      { cell: 23, expected: expectedRecord(aggregates[6], "time.aggregateCells[6]"), keys: ["timelineAdditions"] },
    ] as const satisfies readonly Readonly<{
      cell: number;
      expected: FixtureRecord;
      keys: readonly EvidenceKey[];
    }>[];

    for (const obligation of obligations) {
      verifyEvidence(
        timeCells[obligation.cell],
        obligation.expected,
        obligation.keys,
        `F2-TIME-001.cell-${String(obligation.cell)}`,
      );
    }
  });

  test("enforces every reviewed two-symbol raw-diagnostic count before collapse", () => {
    const host6 = adversarialCaseRecord("F2-HOST-006");
    const host6Cells = adversarialMaterialized.filter(
      (cell) => cell.caseId === "F2-HOST-006",
    );
    const sourceCells = requireFixtureArray(
      ownFixtureValue(host6, "cells"),
      "F2-HOST-006.cells",
    );
    const sourceById = new Map(sourceCells.map((value) => {
      const record = requireFixtureRecord(value, "F2-HOST-006 cell");
      return [
        requireFixtureString(ownFixtureValue(record, "id"), "host cell id"),
        record,
      ] as const;
    }));
    const probe = requireFixtureArray(
      ownFixtureValue(host6, "arrayConsumerProbes"),
      "F2-HOST-006.arrayConsumerProbes",
    ).map((value) => requireFixtureRecord(value, "array consumer probe"))
      .find((value) => ownFixtureValue(value, "id") === "two-symbols-collapse");
    if (probe === undefined) throw new Error("F2_HOST_006_TWO_SYMBOL_PROBE");
    const probeExpected = expectedRecord(probe, "F2-HOST-006 two-symbol probe");

    const obligations = [
      {
        cell: host6Cells.find((value) => value.cellId.endsWith(":array-two-symbols-collapse")),
        expected: expectedRecord(
          sourceById.get("array-two-symbols-collapse"),
          "F2-HOST-006.array-two-symbols-collapse",
        ),
      },
      {
        cell: host6Cells.find((value) => value.cellId.endsWith(":record-two-symbols-collapse")),
        expected: expectedRecord(
          sourceById.get("record-two-symbols-collapse"),
          "F2-HOST-006.record-two-symbols-collapse",
        ),
      },
      ...host6Cells
        .filter((value) => /#00(?:20|25|30|35|40|45|50|55|60|65):/.test(value.cellId))
        .map((cell) => ({ cell, expected: probeExpected })),
    ];
    expect(obligations).toHaveLength(12);
    for (const [index, obligation] of obligations.entries()) {
      verifyEvidence(
        obligation.cell,
        obligation.expected,
        ["diagnosticCandidatesProduced"],
        `F2-HOST-006.two-symbol-obligation-${String(index)}`,
      );
    }
  });
});
