import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * The U1 evidence ledger.
 *
 * The verify leaf owes "a trace ledger showing every parent requirement,
 * invariant and success criterion has evidence". This computes that ledger
 * from what the repository can actually execute, writes it to
 * `test-results/u1-evidence/trace-ledger.json`, and pins it.
 *
 * Coverage is claimed only where a declared case id is genuinely driven:
 * every quick-entry case is replayed by `u1-production-conformance.test.ts`,
 * every positive operation row is driven by
 * `u1-operation-channel-conformance.test.ts`, and any other id counts only
 * when a test source names it. Naming is what links an existing behavioural
 * test to the case it proves, so the remaining gaps below are real
 * traceability work rather than assumed coverage.
 *
 * The per-law counts are pinned. Evidence may be added freely — raise the pin
 * with it — but a law can never quietly lose the evidence it had.
 */

const REPO_ROOT = resolvePath(import.meta.dir, "../..");
const FIXTURES = resolvePath(REPO_ROOT, "tests/fixtures/editing");
const TESTS_ROOT = resolvePath(REPO_ROOT, "tests");
const OUTPUT_DIR = resolvePath(REPO_ROOT, "test-results/u1-evidence");

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(name: string): JsonObject {
  const parsed: unknown = JSON.parse(
    readFileSync(resolvePath(FIXTURES, name), "utf8"),
  );
  if (!isRecord(parsed)) throw new Error(`U1_LEDGER_FIXTURE:${name}`);
  return parsed;
}

function records(value: unknown): readonly JsonObject[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function ids(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** Every case id any test source names, which is how evidence is linked. */
function namedCaseIds(): ReadonlySet<string> {
  const found = new Set<string>();
  const pattern = /U1-(?:QE|OPC|INT)-\d{3}/gu;
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== "node_modules" && entry !== "fixtures") walk(path);
        continue;
      }
      if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
      for (const match of readFileSync(path, "utf8").matchAll(pattern)) {
        found.add(match[0]);
      }
    }
  };
  walk(TESTS_ROOT);
  return found;
}

const LEDGER = readJson("trace-ledger.json");
const QUICK_ENTRY_IDS = new Set(
  records(readJson("quick-entry-cases.json")["cases"]).map((entry) =>
    String(entry["id"]),
  ),
);
const OPERATION_ROWS = records(readJson("edit-operation-matrix.json")["rows"]);
const POSITIVE_OPERATION_IDS = new Set(
  OPERATION_ROWS.filter((row) => row["kind"] === "positive").map((row) =>
    String(row["id"]),
  ),
);
const NAMED = namedCaseIds();

/** A case has evidence when something actually executes it. */
function hasEvidence(caseId: string): boolean {
  if (QUICK_ENTRY_IDS.has(caseId)) return true;
  if (POSITIVE_OPERATION_IDS.has(caseId)) return true;
  return NAMED.has(caseId);
}

type LawCoverage = Readonly<{
  lawId: string;
  positiveCovered: number;
  positiveDeclared: number;
  negativeCovered: number;
  negativeDeclared: number;
}>;

const COVERAGE: readonly LawCoverage[] = records(LEDGER["lawCoverage"]).map(
  (law) => {
    const positive = ids(law["positiveCaseIds"]);
    const negative = ids(law["negativeOrNearMissCaseIds"]);
    return {
      lawId: String(law["lawId"]),
      negativeCovered: negative.filter(hasEvidence).length,
      negativeDeclared: negative.length,
      positiveCovered: positive.filter(hasEvidence).length,
      positiveDeclared: positive.length,
    };
  },
);

/**
 * The evidence floor as measured today. Every number is a count of declared
 * cases that something executes; none may fall.
 */
const PINNED_FLOOR: Readonly<Record<string, readonly [number, number]>> =
  Object.freeze({
    "U1-EDIT-001-no-new-mutation-channel": [
      43, 6,
    ],
    "U1-EDIT-002-draft-text-is-caller-owned-and-exact": [
      2, 8,
    ],
    "U1-EDIT-003-preview-status-is-t0-derived": [
      17, 18,
    ],
    "U1-EDIT-004-insertion-plan-statement-exact": [
      20, 20,
    ],
    "U1-EDIT-005-whole-preview-apply-is-one-atomic-command": [
      22, 0,
    ],
    "U1-EDIT-006-recovered-chord-lane-requires-explicit-loss-acknowledgement": [
      3, 9,
    ],
    "U1-EDIT-007-stable-identity-keys-only": [
      2, 1,
    ],
    "U1-EDIT-008-four-independent-bookmarks": [
      8, 1,
    ],
    "U1-EDIT-009-roving-focus-visual-order-stable-across-reorder": [
      6, 1,
    ],
    "U1-EDIT-010-delete-focus-repair-order": [
      2, 0,
    ],
    "U1-EDIT-011-inline-symbol-edit-valid-on-apply": [
      2, 3,
    ],
    "U1-EDIT-012-duration-edit-states-measure-fill-and-explicit-resolution": [
      6, 5,
    ],
    "U1-EDIT-013-pointer-drag-optional-and-threshold-gated": [
      2, 2,
    ],
    "U1-EDIT-014-keyboard-or-menu-alternative-for-every-pointer-operation": [
      19, 1,
    ],
    "U1-EDIT-015-listener-counts-constant-across-mount-reorder-and-mutation": [
      1, 2,
    ],
    "U1-EDIT-016-touch-range-mode-explicit-and-exact": [
      10, 3,
    ],
    "U1-EDIT-017-application-refusals-surfaced-verbatim": [
      1, 4,
    ],
    "U1-EDIT-018-view-modes-render-identical-musical-facts": [
      10, 1,
    ],
  });

describe("U1 evidence ledger", () => {
  test("every declared law appears exactly once and is pinned", () => {
    expect(COVERAGE).toHaveLength(18);
    const seen = new Set(COVERAGE.map((law) => law.lawId));
    expect(seen.size).toBe(18);
    for (const law of COVERAGE) {
      expect(
        law.lawId in PINNED_FLOOR,
        `${law.lawId} has a pinned evidence floor`,
      ).toBe(true);
    }
  });

  for (const law of COVERAGE) {
    test(`${law.lawId} keeps its evidence`, () => {
      const floor = PINNED_FLOOR[law.lawId];
      if (floor === undefined) throw new Error(`U1_LEDGER_PIN:${law.lawId}`);
      expect(
        law.positiveCovered,
        `${law.lawId} positive evidence`,
      ).toBeGreaterThanOrEqual(floor[0]);
      expect(
        law.negativeCovered,
        `${law.lawId} negative evidence`,
      ).toBeGreaterThanOrEqual(floor[1]);
      // Coverage can never exceed what the ledger declares.
      expect(law.positiveCovered).toBeLessThanOrEqual(law.positiveDeclared);
      expect(law.negativeCovered).toBeLessThanOrEqual(law.negativeDeclared);
    });
  }

  test("the ledger is written for the release record", () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const traces = records(LEDGER["traces"]).map((trace) => ({
      id: String(trace["id"]),
      owner: String(trace["plannedEvidenceOwner"]),
      scope: String(trace["scope"]),
    }));
    const payload = {
      laws: COVERAGE,
      lawsWithBothPolarities: COVERAGE.filter(
        (law) => law.positiveCovered > 0 && law.negativeCovered > 0,
      ).length,
      schema: "changes.evidence.u1-trace-ledger.v1",
      totals: {
        declaredLaws: COVERAGE.length,
        namedCaseIds: NAMED.size,
        operationRowsDriven: POSITIVE_OPERATION_IDS.size,
        quickEntryCasesReplayed: QUICK_ENTRY_IDS.size,
      },
      traces,
    };
    writeFileSync(
      join(OUTPUT_DIR, "trace-ledger.json"),
      `${JSON.stringify(payload, null, 2)}\n`,
      "utf8",
    );
    expect(payload.totals.quickEntryCasesReplayed).toBe(46);
    expect(payload.totals.operationRowsDriven).toBe(36);
    expect(traces).toHaveLength(8);
  });
});
