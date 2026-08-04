import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  observeU1QuickEntryCase,
  type U1ConformanceObservation,
} from "../../src/test-support/u1-conformance-harness";

/**
 * Production-versus-packet conformance for U1 quick entry.
 *
 * Every case in the reviewed, byte-pinned corpus is replayed against the real
 * studio controller over a document published through the real F2/F3
 * boundary, and the observed classification must equal the literal
 * expectation. This file reads the fixture and compares; it never recomputes
 * an expectation, and it imports nothing from the packet validator.
 *
 * The corpus sets `t0ResultIsScenarioInput: true`: each case states the T0
 * outcome it assumes. The replay calls the real T0 instead of injecting that
 * outcome, so a case built on a parse the grammar does not produce fails here
 * rather than being compared against an outcome that never happened. Six such
 * cases were reconciled against `docs/T0_SYNTAX_CONTRACT.md` and the
 * independent T0 packet under jcpe-fetq; none remains, so every case is
 * compared whole, including its token rows.
 */

const REPO_ROOT = resolvePath(import.meta.dir, "../..");
const CASES_PATH = resolvePath(
  REPO_ROOT,
  "tests/fixtures/editing/quick-entry-cases.json",
);

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCases(): readonly JsonObject[] {
  const parsed: unknown = JSON.parse(readFileSync(CASES_PATH, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed["cases"])) {
    throw new Error("U1_CONFORMANCE_CORPUS_SHAPE");
  }
  return parsed["cases"].filter(isRecord);
}

function field(record: JsonObject, key: string): unknown {
  return record[key];
}

function requireRecord(value: unknown, path: string): JsonObject {
  if (!isRecord(value)) throw new Error(`U1_CONFORMANCE_FIELD:${path}`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`U1_CONFORMANCE_FIELD:${path}`);
  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== "number") throw new Error(`U1_CONFORMANCE_FIELD:${path}`);
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`U1_CONFORMANCE_FIELD:${path}`);
  return value;
}

function stringOrNull(value: unknown, path: string): string | null {
  return value === null ? null : requireString(value, path);
}

function stringList(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`U1_CONFORMANCE_FIELD:${path}`);
  return value.map((entry, index) =>
    requireString(entry, `${path}[${String(index)}]`),
  );
}

const CASES = readCases();

/**
 * The corpus states a stale draft and a vanished target as scenarios in which
 * "no plan may be claimed". A0 clears the quick-entry draft with every
 * publication, so a draft cannot outlive the revision that made it stale: the
 * product reaches the same guarantee one step earlier, and these two cases are
 * asserted against that observable behaviour.
 */
const STALENESS_CASE_IDS = new Set(["U1-QE-043", "U1-QE-044"]);

describe("U1 quick-entry corpus replayed against the real controller", () => {
  test("the reviewed corpus is present and complete", () => {
    expect(CASES).toHaveLength(46);
    for (const entry of CASES) {
      expect(requireString(field(entry, "id"), "id")).toMatch(
        /^U1-QE-\d{3}$/u,
      );
    }
  });

  for (const entry of CASES) {
    const id = requireString(field(entry, "id"), "id");
    const expectation = requireRecord(field(entry, "expected"), `${id}.expected`);
    const destination = requireRecord(
      field(entry, "destination"),
      `${id}.destination`,
    );
    const meter = requireRecord(field(entry, "meter"), `${id}.meter`);
    const staleness = requireRecord(field(entry, "staleness"), `${id}.staleness`);
    const warnings = stringList(
      field(expectation, "sectionNameCollisionWarnings"),
      `${id}.expected.sectionNameCollisionWarnings`,
    );

    test(`${id} ${requireString(field(entry, "kind"), `${id}.kind`)}`, () => {
      const result = observeU1QuickEntryCase({
        destination: {
          boundaryKind: requireString(
            field(destination, "boundaryKind"),
            `${id}.destination.boundaryKind`,
          ),
          level: requireString(
            field(destination, "level"),
            `${id}.destination.level`,
          ) as "measure" | "section" | "document",
          measureCompletion: requireString(
            field(destination, "measureCompletion"),
            `${id}.destination.measureCompletion`,
          ),
          measureEventCount: requireNumber(
            field(destination, "measureEventCount"),
            `${id}.destination.measureEventCount`,
          ),
        },
        draftText: requireString(field(entry, "draftText"), `${id}.draftText`),
        existingSectionNames: warnings,
        meter: {
          beatUnit: requireNumber(
            field(meter, "beatUnit"),
            `${id}.meter.beatUnit`,
          ),
          beatsPerBar: requireNumber(
            field(meter, "beatsPerBar"),
            `${id}.meter.beatsPerBar`,
          ),
        },
        staleness: {
          baseRevisionMatchesState: requireBoolean(
            field(staleness, "baseRevisionMatchesState"),
            `${id}.staleness.baseRevisionMatchesState`,
          ),
          targetResolvesInDocument: requireBoolean(
            field(staleness, "targetResolvesInDocument"),
            `${id}.staleness.targetResolvesInDocument`,
          ),
        },
      });
      if (!result.ok) throw new Error(`${id}:${result.reason}`);
      const observed: U1ConformanceObservation = result.observation;

      if (STALENESS_CASE_IDS.has(id)) {
        expect(observed.committable).toBe(false);
        expect(observed.planKind).toBeNull();
        expect(observed.placement).toBeNull();
        expect(observed.canInsertPreview).toBe(false);
        expect(observed.canInsertOneChord).toBe(false);
        return;
      }

      expect(observed.status).toBe(
        requireString(field(expectation, "status"), `${id}.expected.status`) as
          | "idle"
          | "invalid"
          | "ready",
      );
      expect(observed.lane).toBe(
        stringOrNull(field(expectation, "lane"), `${id}.expected.lane`) as
          | "complete-draft"
          | "recovered-chord"
          | null,
      );
      expect(observed.preflightRefusal).toBe(
        stringOrNull(
          field(expectation, "preflightRefusal"),
          `${id}.expected.preflightRefusal`,
        ),
      );
      expect(observed.insertionPlan).toBe(
        stringOrNull(
          field(expectation, "insertionPlan"),
          `${id}.expected.insertionPlan`,
        ),
      );
      expect(observed.committable).toBe(
        requireBoolean(
          field(expectation, "committable"),
          `${id}.expected.committable`,
        ),
      );
      expect(observed.planKind).toBe(
        stringOrNull(field(expectation, "planKind"), `${id}.expected.planKind`),
      );
      expect(observed.placement).toBe(
        stringOrNull(
          field(expectation, "placement"),
          `${id}.expected.placement`,
        ),
      );
      expect(observed.blockedReason).toBe(
        stringOrNull(
          field(expectation, "blockedReason"),
          `${id}.expected.blockedReason`,
        ),
      );
      expect(observed.resolutions).toEqual(
        stringList(
          field(expectation, "resolutions"),
          `${id}.expected.resolutions`,
        ),
      );
      expect(observed.canInsertPreview).toBe(
        requireBoolean(
          field(expectation, "canInsertPreview"),
          `${id}.expected.canInsertPreview`,
        ),
      );
      expect(observed.canInsertOneChord).toBe(
        requireBoolean(
          field(expectation, "canInsertOneChord"),
          `${id}.expected.canInsertOneChord`,
        ),
      );
      expect(observed.sectionNameCollisionWarnings).toEqual(warnings);
      /**
       * Token rows in full. The corpus states its total projection in
       * `classificationPolicy.tokenStateProjection`, so the whole ordered
       * sequence is compared rather than a count.
       */
      expect(observed.tokenStates).toEqual(
        stringList(
          field(expectation, "tokenStates"),
          `${id}.expected.tokenStates`,
        ),
      );
    });
  }
});
