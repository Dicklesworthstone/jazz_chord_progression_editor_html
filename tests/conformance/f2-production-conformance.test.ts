import { createHash } from "node:crypto";

import { describe, expect, setDefaultTimeout, test } from "bun:test";

import * as domain from "../../src/domain";
import {
  decodeDocumentShapeWithEvidence,
  preflightDocumentImportBytesWithEvidence,
} from "../../src/domain/document-decoder";
import {
  materializeF2AdversarialCases,
  materializeF2CounterGoldenCases,
} from "../../src/test-support/f2-adversarial-materializer";
import {
  groupF2CaseProjections,
  runF2FixtureCell,
  type F2CellProjection,
} from "../../src/test-support/f2-decoder-harness";
import {
  requireFixtureArray,
  requireFixtureNumber,
  requireFixtureRecord,
  requireFixtureString,
  type FixtureRecord,
} from "../../src/test-support/f2-fixture-core";
import { materializeF2ShapeCases } from "../../src/test-support/f2-shape-materializer";
import adversarialFixture from "../fixtures/decoder/adversarial-cases.json";
import manifestFixture from "../fixtures/decoder/f2-decoder-contract.json";
import shapeFixture from "../fixtures/decoder/shape-cases.json";

setDefaultTimeout(600_000);

const EXPECTED_SEED_DIGESTS = Object.freeze({
  "F2-SEED-BOUNDS": "4d582edc0fd4557c6b5f325e783d7a81a5abe67bbf43f518e09ad91b51970af2",
  "F2-SEED-CHORD": "26a3bd06842c4de0e3310507414651b7c8fe55dd235fc719b293ab660961cc7a",
  "F2-SEED-HOSTILE": "8358103a16311162d9559437f58df0a9466e4434dd69627baa3c5ad3653e6628",
  "F2-SEED-IDS": "76b9ffebf7a7f31242269ea460499d4765e0169fcd7fb6ceeb18241a92667f0a",
  "F2-SEED-ORDER": "8dfa51b0fc1f7c9538a1cb1b8570620cd93cb7bda5930f5e5c6a870d48a2b18c",
  "F2-SEED-SHAPE": "3fd433ba290d8f5a4e626ebaf2a6e94a75cc932b65cf249cd664aba8e1cb4495",
  "F2-SEED-TIME": "b8eb063375ab625bd5b3bbb8f550f35f4cf8b8c4aa93cede9de761961e91b65c",
  "F2-SEED-UNICODE": "f5a00e190955eed19455eb55aeb031919a1b98cb73c2a744a28a14838dce02e0",
});

type StableSeed = Readonly<{
  id: keyof typeof EXPECTED_SEED_DIGESTS;
  value: number;
  prefixes: readonly string[];
}>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [
      key,
      canonicalJsonValue(Reflect.get(value, key)),
    ]),
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}

function xorshift32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    return state;
  };
}

function shuffled<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  const next = xorshift32(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = next() % (index + 1);
    const held = result[index];
    const replacement = result[other];
    if (held === undefined || replacement === undefined) {
      throw new Error("F2_REPLAY_SHUFFLE_INDEX");
    }
    result[index] = replacement;
    result[other] = held;
  }
  return result;
}

function parsedSeeds(value: unknown): readonly StableSeed[] {
  const fixture = requireFixtureRecord(value, "adversarial fixture");
  return requireFixtureArray(fixture["stableSeeds"], "stableSeeds").map((seedValue) => {
    const seed = requireFixtureRecord(seedValue, "stable seed");
    const id = requireFixtureString(seed["id"], "seed.id");
    if (!Object.hasOwn(EXPECTED_SEED_DIGESTS, id)) {
      throw new Error(`F2_REPLAY_SEED:${id}`);
    }
    return {
      id: id as keyof typeof EXPECTED_SEED_DIGESTS,
      value: requireFixtureNumber(seed["value"], "seed.value"),
      prefixes: requireFixtureArray(seed["casePrefixes"], "casePrefixes")
        .map((prefix) => requireFixtureString(prefix, "case prefix")),
    };
  });
}

function caseHash(projections: readonly F2CellProjection[]): string {
  return sha256(canonicalJson({ cells: projections }));
}

function seededDigest(
  seed: StableSeed,
  grouped: ReadonlyMap<string, Readonly<{ cells: readonly F2CellProjection[] }>>,
): string {
  const caseIds = [...grouped.keys()]
    .filter((caseId) => seed.prefixes.some((prefix) => caseId.startsWith(prefix)))
    .sort();
  const schedule = shuffled(caseIds, seed.value);
  const lines = schedule.map((caseId) => {
    const observation = grouped.get(caseId);
    if (observation === undefined) throw new Error(`F2_REPLAY_CASE:${caseId}`);
    return `${caseId}\t${caseHash(observation.cells)}\n`;
  }).join("");
  return sha256(lines);
}

function asFixtureRecord(value: unknown): FixtureRecord {
  return requireFixtureRecord(value, "fixture");
}

const shapeCells = materializeF2ShapeCases(manifestFixture, shapeFixture);
const adversarialCells = materializeF2AdversarialCases(
  adversarialFixture,
  shapeFixture,
);
const counterGoldenCells = materializeF2CounterGoldenCases(
  adversarialFixture,
  shapeFixture,
);

describe("F2 production structural decoder conformance", () => {
  test("publishes the exact frozen public operation surface and private evidence seams", () => {
    expect(domain.DOCUMENT_DECODER_OPERATION_NAMES).toEqual([
      "preflightDocumentImportBytes",
      "decodeDocumentShape",
    ]);
    expect(Object.keys(domain.documentDecodeOperations)).toEqual([
      "preflightDocumentImportBytes",
      "decodeDocumentShape",
    ]);
    expect(Object.isFrozen(domain.documentDecodeOperations)).toBe(true);
    expect(domain.documentDecodeOperations.preflightDocumentImportBytes)
      .toBe(domain.preflightDocumentImportBytes);
    expect(domain.documentDecodeOperations.decodeDocumentShape)
      .toBe(domain.decodeDocumentShape);
    expect(domain.preflightDocumentImportBytes.length).toBe(1);
    expect(domain.decodeDocumentShape.length).toBe(1);
    expect(Object.hasOwn(domain, "preflightDocumentImportBytesWithEvidence"))
      .toBe(false);
    expect(Object.hasOwn(domain, "decodeDocumentShapeWithEvidence")).toBe(false);

    const byteEvidence = preflightDocumentImportBytesWithEvidence(0);
    const minimalCell = shapeCells.find((cell) => cell.caseId === "F2-SHAPE-001");
    if (minimalCell === undefined) throw new Error("F2_MINIMAL_CELL_MISSING");
    const shapeEvidence = decodeDocumentShapeWithEvidence(
      minimalCell.createInput().input,
    );
    for (const observation of [byteEvidence, shapeEvidence]) {
      expect(Object.keys(observation)).toEqual(["result", "evidence"]);
      expect(Object.isFrozen(observation)).toBe(true);
      expect(Object.isFrozen(observation.result)).toBe(true);
      expect(Object.isFrozen(observation.evidence)).toBe(true);
      expect(Object.keys(observation.evidence)).toHaveLength(28);
    }
  });

  test("materializes the reviewed authority with exact atomic counts", () => {
    expect(shapeCells).toHaveLength(1_017);
    expect(adversarialCells).toHaveLength(343);
    expect(counterGoldenCells).toHaveLength(3);
    expect(new Set(shapeCells.map((cell) => cell.caseId)).size).toBe(33);
    expect(new Set(adversarialCells.map((cell) => cell.caseId)).size).toBe(26);
    expect(asFixtureRecord(manifestFixture)["coverageSummary"]).toBeDefined();
  });

  test("keeps byte-preflight failures actionable without reflecting input values", () => {
    const invalidShape = domain.preflightDocumentImportBytes(-1);
    const exceededLimit = domain.preflightDocumentImportBytes(2_097_153);
    expect(invalidShape.ok).toBe(false);
    expect(exceededLimit.ok).toBe(false);
    if (invalidShape.ok || exceededLimit.ok) {
      throw new Error("F2_BYTE_FAILURE_EXPECTED");
    }

    const invalidMessage = invalidShape.errors[0].message;
    const limitMessage = exceededLimit.errors[0].message;
    expect(invalidMessage).toContain("utf8ByteLength");
    expect(invalidMessage).toContain("canonical nonnegative safe integer");
    expect(limitMessage).toContain("utf8ByteLength");
    expect(limitMessage).toContain("2 MiB import byte limit");
    expect(invalidMessage).not.toContain("-1");
    expect(limitMessage).not.toContain("2097153");
    expect(invalidMessage).not.toBe(limitMessage);
  });

  test("matches all counter goldens exactly", () => {
    for (const cell of counterGoldenCells) runF2FixtureCell(cell);
  });

  test("runs every materialized cell through two public and two private fresh inputs", () => {
    const observations = [...shapeCells, ...adversarialCells]
      .map((cell) => runF2FixtureCell(cell, () => {
        Bun.gc(true);
      }));
    expect(observations).toHaveLength(1_360);

    const grouped = groupF2CaseProjections(observations);
    const seeds = parsedSeeds(adversarialFixture);
    const actualSeedIds: readonly string[] = seeds.map((seed) => seed.id);
    expect(actualSeedIds).toEqual(
      Object.keys(EXPECTED_SEED_DIGESTS),
    );
    const seedDigests: Record<string, string> = {};
    for (const seed of seeds) {
      const digest = seededDigest(seed, grouped);
      expect(digest).toBe(EXPECTED_SEED_DIGESTS[seed.id]);
      seedDigests[seed.id] = digest;
    }
    const caseHashes = Object.fromEntries(
      [...grouped].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([caseId, observation]) => [caseId, caseHash(observation.cells)]),
    );
    const evidence = {
      schema: "changes.evidence.f2-conformance-observation.v1",
      runtimeCaseIds: Object.keys(caseHashes),
      caseHashes,
      cells: observations.length,
      seedDigests,
    };
    console.log(`F2_EVIDENCE_OBSERVATION ${JSON.stringify({
      ...evidence,
      semanticDigest: sha256(canonicalJson(evidence)),
    })}`);
  });
});
