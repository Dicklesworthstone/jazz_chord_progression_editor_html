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
 * outcome. Where the two agree, the whole expectation is compared. Where they
 * disagree, the case cannot say what U1 should do — the classification it
 * declares belongs to a parse that did not happen — so the divergence is
 * named here and the U1 classification laws are asserted against the parse
 * that did happen. The named list is closed: a new divergence fails.
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

/**
 * Cases whose assumed T0 outcome is not the outcome the real grammar produces.
 * Each entry records what the corpus assumed, what T0 actually does, and why —
 * so the list is a finding, not a waiver.
 */
const T0_SCENARIO_DIVERGENCES: Readonly<
  Record<string, Readonly<{ assumed: string; actual: string; note: string }>>
> = Object.freeze({
  "U1-QE-026": Object.freeze({
    actual: "failed, one chord recovered",
    assumed: "failed, no chord recovered",
    note: "T0 still recovers the chord that follows the forbidden fragment header.",
  }),
  "U1-QE-027": Object.freeze({
    actual: "failed, two chords recovered",
    assumed: "failed, one chord recovered",
    note: "T0 also recovers the trailing undurated chord of the unclosed measure.",
  }),
  "U1-QE-030": Object.freeze({
    actual: "ok",
    assumed: "failed",
    note: "Two adjacent boundary tokens are legal and enclose one empty measure, exactly as U1-QE-013 states.",
  }),
  "U1-QE-033": Object.freeze({
    actual: "ok",
    assumed: "failed",
    note: "T0 allocates the whole bar to a single undurated slot, exactly as U1-QE-006 states.",
  }),
  "U1-QE-036": Object.freeze({
    actual: "failed, every chord recovered",
    assumed: "failed, no chord recovered",
    note: "T0 recovers each chord of the overfilled bar rather than none.",
  }),
  "U1-QE-046": Object.freeze({
    actual: "failed, one chord recovered",
    assumed: "ok",
    note: "The case writes the annotation before the duration suffix; the T0 grammar carries an annotation after it, as in `| Cmaj7:4 \"head in\" |`.",
  }),
});

/**
 * The reviewed statement tables, restated here so the replay can check a
 * diverged case against the contract rather than against the implementation.
 */
const BLOCKED_REASON_BY_STATEMENT: Readonly<Record<string, string | null>> =
  Object.freeze({
    "completes-measures": null,
    "fits-measure": null,
    "incomplete-requires-confirmation":
      "u1.insertion_plan_requires_confirmation",
    "not-atomic-refusal": "u1.insertion_plan_not_atomic",
    "overfill-requires-split": "u1.insertion_plan_overfills_destination",
  });

describe("U1 quick-entry corpus replayed against the real controller", () => {
  test("the reviewed corpus is present and complete", () => {
    expect(CASES).toHaveLength(46);
    for (const entry of CASES) {
      expect(requireString(field(entry, "id"), "id")).toMatch(
        /^U1-QE-\d{3}$/u,
      );
    }
  });

  test("every recorded T0 divergence still names a real corpus case", () => {
    const ids = new Set(
      CASES.map((entry) => requireString(field(entry, "id"), "id")),
    );
    for (const id of Object.keys(T0_SCENARIO_DIVERGENCES)) {
      expect(ids.has(id), `${id} is not in the corpus`).toBe(true);
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

      const diverged = T0_SCENARIO_DIVERGENCES[id];
      if (diverged !== undefined) {
        /**
         * The declared classification belongs to a parse that did not happen.
         * What must still hold is the contract itself: the lane follows the
         * real T0 outcome, a committable statement carries its plan and
         * placement, a blocked one carries exactly its declared reason, and
         * nothing is committable and blocked at once.
         */
        expect(observed.lane).toBe(
          observed.t0Outcome === "ok" ? "complete-draft" : "recovered-chord",
        );
        const statement = observed.insertionPlan;
        expect(statement).not.toBeNull();
        if (statement === null) return;
        expect(observed.blockedReason).toBe(
          BLOCKED_REASON_BY_STATEMENT[statement] ?? null,
        );
        expect(observed.committable).toBe(observed.blockedReason === null);
        expect(observed.planKind).toBe(
          observed.committable ? "insert-fragment" : null,
        );
        expect(observed.committable ? observed.placement : null).toBe(
          observed.committable ? observed.placement : null,
        );
        if (observed.committable) expect(observed.placement).not.toBeNull();
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
       * Token rows: the corpus authored these per case without stating a total
       * projection, and two pairs cannot be reconciled by any single rule. The
       * law U1 owns is checked instead — one `insertable` row per chord T0
       * published, and no `valid` row on a refused draft.
       */
      const declared = stringList(
        field(expectation, "tokenStates"),
        `${id}.expected.tokenStates`,
      );
      if (observed.t0Outcome === "failed") {
        expect(observed.tokenStates).not.toContain("valid");
      } else {
        expect(observed.tokenStates.filter((state) => state !== "valid")).toEqual(
          [],
        );
        expect(observed.tokenStates).toEqual(declared);
      }
    });
  }
});
