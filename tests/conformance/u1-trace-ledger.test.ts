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
 *
 * jcpe-fetq moved `U1-QE-030` from the negative side to the positive side of
 * `U1-EDIT-003` and `U1-EDIT-004`, and off `U1-EDIT-006` entirely: the draft
 * `| C:4 | | ` parses under T0_SYNTAX_CONTRACT 5.2, so it never reached the
 * recovered-chord lane it was pinned as a witness for. The three negative
 * floors below therefore drop by exactly one and four positive floors rise by
 * one. Total evidence did not fall; one case changed sides.
 */
const PINNED_FLOOR: Readonly<Record<string, readonly [number, number]>> =
  Object.freeze({
    "U1-EDIT-001-no-new-mutation-channel": [
      44, 12,
    ],
    "U1-EDIT-002-draft-text-is-caller-owned-and-exact": [
      2, 10,
    ],
    "U1-EDIT-003-preview-status-is-t0-derived": [
      18, 19,
    ],
    "U1-EDIT-004-insertion-plan-statement-exact": [
      22, 19,
    ],
    "U1-EDIT-005-whole-preview-apply-is-one-atomic-command": [
      23, 1,
    ],
    "U1-EDIT-006-recovered-chord-lane-requires-explicit-loss-acknowledgement": [
      3, 8,
    ],
    "U1-EDIT-007-stable-identity-keys-only": [
      3, 1,
    ],
    "U1-EDIT-008-four-independent-bookmarks": [
      10, 4,
    ],
    "U1-EDIT-009-roving-focus-visual-order-stable-across-reorder": [
      6, 2,
    ],
    "U1-EDIT-010-delete-focus-repair-order": [
      4, 2,
    ],
    "U1-EDIT-011-inline-symbol-edit-valid-on-apply": [
      2, 6,
    ],
    "U1-EDIT-012-duration-edit-states-measure-fill-and-explicit-resolution": [
      6, 8,
    ],
    "U1-EDIT-013-pointer-drag-optional-and-threshold-gated": [
      5, 5,
    ],
    "U1-EDIT-014-keyboard-or-menu-alternative-for-every-pointer-operation": [
      20, 1,
    ],
    "U1-EDIT-015-listener-counts-constant-across-mount-reorder-and-mutation": [
      3, 3,
    ],
    "U1-EDIT-016-touch-range-mode-explicit-and-exact": [
      10, 3,
    ],
    "U1-EDIT-017-application-refusals-surfaced-verbatim": [
      1, 8,
    ],
    "U1-EDIT-018-view-modes-render-identical-musical-facts": [
      10, 1,
    ],
  });

describe("U1 evidence ledger", () => {
  /**
   * Every declared state is either driven or declares why it cannot be.
   *
   * A case with no evidence and no explanation is indistinguishable from one
   * that was forgotten, so `reachability` is what separates a decision from a
   * gap. jcpe-bdga declared the four states the product cannot enter; this
   * holds the line by failing on a fifth that appears without one.
   */
  test("every undriven interaction and operation row declares why", () => {
    const undeclared: string[] = [];
    for (const [file, key] of [
      ["interaction-state-matrix.json", "cases"],
      ["edit-operation-matrix.json", "rows"],
    ] as const) {
      for (const row of records(readJson(file)[key])) {
        const id = String(row["id"]);
        if (hasEvidence(id)) continue;
        if (isRecord(row["reachability"])) continue;
        undeclared.push(id);
      }
    }
    expect(undeclared, "rows with neither evidence nor a stated reason").toEqual(
      [],
    );
  });

  /**
   * A deferral must go stale loudly. Once the package a `blocked` row waits on
   * lands and something drives the row, the declaration is no longer true and
   * has to be removed — otherwise the packet keeps claiming a gap it closed.
   *
   * `unreachable-by-design` is deliberately not covered by this: a state the
   * design forbids should have a test that *measures* the impossibility, since
   * "cannot happen" is otherwise indistinguishable from "was never tried".
   */
  test("no blocked row is quietly already driven", () => {
    const stale: string[] = [];
    for (const [file, key] of [
      ["interaction-state-matrix.json", "cases"],
      ["edit-operation-matrix.json", "rows"],
    ] as const) {
      for (const row of records(readJson(file)[key])) {
        const declared = row["reachability"];
        if (!isRecord(declared)) continue;
        if (declared["state"] !== "blocked") continue;
        if (hasEvidence(String(row["id"]))) stale.push(String(row["id"]));
      }
    }
    expect(stale, "rows deferred to a package that already reached them").toEqual(
      [],
    );
  });

  /**
   * And a state the design forbids owes a measured impossibility, not just a
   * sentence saying it is impossible.
   */
  test("every unreachable-by-design row has a test that measures it", () => {
    const unmeasured: string[] = [];
    for (const [file, key] of [
      ["interaction-state-matrix.json", "cases"],
      ["edit-operation-matrix.json", "rows"],
    ] as const) {
      for (const row of records(readJson(file)[key])) {
        const declared = row["reachability"];
        if (!isRecord(declared)) continue;
        if (declared["state"] !== "unreachable-by-design") continue;
        if (!NAMED.has(String(row["id"]))) unmeasured.push(String(row["id"]));
      }
    }
    expect(
      unmeasured,
      "rows asserted impossible with nothing proving the impossibility",
    ).toEqual([]);
  });

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
    expect(payload.totals.operationRowsDriven).toBe(37);
    expect(traces).toHaveLength(8);
    // Every declared law now carries executed evidence on both polarities.
    // This is a floor like the per-law counts: it may rise, never fall.
    expect(payload.lawsWithBothPolarities).toBe(18);
  });
});
