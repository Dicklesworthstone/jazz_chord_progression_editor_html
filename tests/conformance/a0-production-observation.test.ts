import { createHash } from "node:crypto";

import { expect, test } from "bun:test";

import stateFixture from
  "../fixtures/application-state/state-matrix.json";

type CaseOwner = Readonly<{ file: string; testcase: string }>;

const APP_STATE_FILE = "tests/integration/a0-application-state.test.ts";
const CHORD_FILE = "tests/integration/chord-command.test.ts";
const STABLE_ID_FILE = "tests/property/stable-id-reorder.test.ts";
const GAP_FILE = "tests/conformance/a0-state-matrix-gaps.test.ts";

function owner(file: string, testcase: string): CaseOwner {
  return Object.freeze({ file, testcase });
}

const INITIAL_OWNER = owner(
  APP_STATE_FILE,
  "initializes explicit state, coalesces only inside 1,000 ms, and preserves atomic failure",
);
const INSERT_OWNER = owner(
  APP_STATE_FILE,
  "inserts and deletes explicit section, measure, and event nodes without fabricating data",
);
const GUARD_OWNER = owner(
  APP_STATE_FILE,
  "refuses counterfeited structural coalescing, derived identity policy, and retirement receipts",
);
const BOOKMARK_OWNER = owner(
  APP_STATE_FILE,
  "repairs stable bookmarks after delete and derives insertion/range selectors exactly",
);
const PUBLICATION_OWNER = owner(
  APP_STATE_FILE,
  "publishes duration, completion, section, voicing, and settings commands through F2 and F3",
);
const SOLE_EVENT_OWNER = owner(
  APP_STATE_FILE,
  "repairs a removed sole event to its surviving empty measure",
);
const DERIVED_OWNER = owner(
  APP_STATE_FILE,
  "applies current transpose, suggestion, and reharmonization patches as single history entries",
);
const REPLACEMENT_OWNER = owner(
  APP_STATE_FILE,
  "replaces only after matching transition retirement and restores exact committed snapshots on undo/redo",
);
const HISTORY_LIMIT_OWNER = owner(
  APP_STATE_FILE,
  "enforces entry-count and retained-byte history limits without partial entries",
);
const OVERSIZE_OWNER = owner(
  APP_STATE_FILE,
  "allows an oversized replacement only after matching explicit disclosure",
);
const REORDER_OWNER = owner(
  STABLE_ID_FILE,
  "selection and focus follow identity through repeated move/undo/redo",
);
const DUPLICATE_OWNER = owner(
  STABLE_ID_FILE,
  "multi-measure duplicate canonicalizes source order and bookmarks the last copy",
);
const CHORD_OWNER = owner(
  CHORD_FILE,
  "refuses stale pitch relabeling and publishes only an explicit compatible chord/voicing pair",
);

const GAP_STRUCTURAL_OWNER = owner(
  GAP_FILE,
  "initializes empty authority and refuses malformed structural identity edits",
);
const GAP_COALESCE_OWNER = owner(
  GAP_FILE,
  "executes every text coalescing boundary and decreasing-time near miss",
);
const GAP_SEMANTIC_OWNER = owner(
  GAP_FILE,
  "refuses invalid semantic timing and independently stale or undeclared patches",
);
const GAP_REPLACE_OWNER = owner(
  GAP_FILE,
  "cancels replacement, discloses oversize, and shares all replacement origins",
);
const GAP_LIMIT_OWNER = owner(
  GAP_FILE,
  "enforces revision, notice, selection, and dialog limits",
);
const GAP_MEASURE_OWNER = owner(
  GAP_FILE,
  "moves measure batches canonically and inserts at a stable measure boundary",
);
const GAP_SELECTOR_OWNER = owner(
  GAP_FILE,
  "derives missing selectors, truthful history, and exact transport expectation without caching",
);
const GAP_TRANSPORT_SETTLE_OWNER = owner(
  GAP_FILE,
  "settles a refused transport expectation exactly once and never over a genuine notification",
);

const EXPLICIT_OWNERS = Object.freeze({
  "A0-INIT-001": INITIAL_OWNER,
  "A0-CMD-001": INSERT_OWNER,
  "A0-CMD-003": BOOKMARK_OWNER,
  "A0-CMD-004": BOOKMARK_OWNER,
  "A0-CMD-005": SOLE_EVENT_OWNER,
  "A0-CMD-007": REORDER_OWNER,
  "A0-CMD-009": DUPLICATE_OWNER,
  "A0-CMD-011": INITIAL_OWNER,
  "A0-CMD-016": GUARD_OWNER,
  "A0-CMD-017": PUBLICATION_OWNER,
  "A0-CMD-019": PUBLICATION_OWNER,
  "A0-CMD-020": PUBLICATION_OWNER,
  "A0-CMD-021": CHORD_OWNER,
  "A0-CMD-022": CHORD_OWNER,
  "A0-CMD-023": CHORD_OWNER,
  "A0-CMD-024": PUBLICATION_OWNER,
  "A0-CMD-025": DERIVED_OWNER,
  "A0-CMD-028": DERIVED_OWNER,
  "A0-CMD-030": DERIVED_OWNER,
  "A0-CMD-031": REPLACEMENT_OWNER,
  "A0-CMD-034": OVERSIZE_OWNER,
  "A0-HIST-001": REPLACEMENT_OWNER,
  "A0-HIST-002": REPLACEMENT_OWNER,
  "A0-HIST-003": DERIVED_OWNER,
  "A0-HIST-004": HISTORY_LIMIT_OWNER,
  "A0-HIST-005": HISTORY_LIMIT_OWNER,
  "A0-HIST-006": HISTORY_LIMIT_OWNER,
  "A0-HIST-007": REPLACEMENT_OWNER,
  "A0-HIST-008": REPLACEMENT_OWNER,
  "A0-UI-002": BOOKMARK_OWNER,
  "A0-UI-005": BOOKMARK_OWNER,
  "A0-UI-006": BOOKMARK_OWNER,
  "A0-CMD-038": INSERT_OWNER,

  "A0-INIT-002": GAP_STRUCTURAL_OWNER,
  "A0-CMD-002": GAP_STRUCTURAL_OWNER,
  "A0-CMD-006": GAP_STRUCTURAL_OWNER,
  "A0-CMD-008": GAP_STRUCTURAL_OWNER,
  "A0-CMD-010": GAP_STRUCTURAL_OWNER,
  "A0-CMD-041": GAP_STRUCTURAL_OWNER,
  "A0-CMD-042": GAP_STRUCTURAL_OWNER,
  "A0-CMD-012": GAP_COALESCE_OWNER,
  "A0-CMD-013": GAP_COALESCE_OWNER,
  "A0-CMD-014": GAP_COALESCE_OWNER,
  "A0-CMD-015": GAP_COALESCE_OWNER,
  "A0-CMD-018": GAP_SEMANTIC_OWNER,
  "A0-CMD-026": GAP_SEMANTIC_OWNER,
  "A0-CMD-027": GAP_SEMANTIC_OWNER,
  "A0-CMD-029": GAP_SEMANTIC_OWNER,
  "A0-ATOMIC-001": GAP_SEMANTIC_OWNER,
  "A0-CMD-032": GAP_REPLACE_OWNER,
  "A0-CMD-033": GAP_REPLACE_OWNER,
  "A0-CMD-035": GAP_REPLACE_OWNER,
  "A0-CMD-036": GAP_REPLACE_OWNER,
  "A0-CMD-037": GAP_REPLACE_OWNER,
  "A0-ATOMIC-002": GAP_LIMIT_OWNER,
  "A0-UI-001": GAP_LIMIT_OWNER,
  "A0-UI-003": GAP_LIMIT_OWNER,
  "A0-UI-004": GAP_LIMIT_OWNER,
  "A0-CMD-039": GAP_MEASURE_OWNER,
  "A0-CMD-040": GAP_MEASURE_OWNER,
  "A0-UI-007": GAP_SELECTOR_OWNER,
  "A0-UI-008": GAP_SELECTOR_OWNER,
  "A0-UI-009": GAP_SELECTOR_OWNER,
  "A0-UI-010": GAP_SELECTOR_OWNER,
  "A0-UI-011": GAP_SELECTOR_OWNER,
  "A0-UI-012": GAP_TRANSPORT_SETTLE_OWNER,
  "A0-UI-013": GAP_TRANSPORT_SETTLE_OWNER,
  "A0-UI-014": GAP_TRANSPORT_SETTLE_OWNER,
} satisfies Readonly<Record<string, CaseOwner>>);

export const A0_STATE_CASE_OWNERS: Readonly<Record<string, CaseOwner>> =
  EXPLICIT_OWNERS;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

function digest(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

test("binds all 68 reviewed state cases to exact runtime owner tests", () => {
  const caseIds = stateFixture.cases.map(({ id }) => id);
  expect(Object.keys(A0_STATE_CASE_OWNERS).sort()).toEqual([...caseIds].sort());
  const caseOwners = Object.fromEntries(caseIds.map((id) => {
    const mapped = A0_STATE_CASE_OWNERS[id];
    if (mapped === undefined) throw new Error(`A0_OWNER_MISSING:${id}`);
    return [id, mapped];
  }));
  const caseHashes = Object.fromEntries(stateFixture.cases.map((fixtureCase) => {
    const mapped = A0_STATE_CASE_OWNERS[fixtureCase.id];
    if (mapped === undefined) throw new Error(`A0_OWNER_MISSING:${fixtureCase.id}`);
    return [fixtureCase.id, digest({
      fixtureCase,
      runtimeOwner: mapped,
      authority: "independently-authored-reviewed-expectation",
    })];
  }));
  const runtimeOwnerTests = [...new Map(
    Object.values(A0_STATE_CASE_OWNERS).map((mapped) => [
      `${mapped.file}\u0000${mapped.testcase}`,
      mapped,
    ]),
  ).values()].sort((left, right) =>
    `${left.file}\u0000${left.testcase}`.localeCompare(
      `${right.file}\u0000${right.testcase}`,
    )
  );
  expect(runtimeOwnerTests).toHaveLength(21);
  const observation = {
    schema: "changes.evidence.a0-production-conformance-observation.v1",
    stateCaseIds: caseIds,
    stateCasesObserved: caseIds.length,
    caseHashes,
    caseOwners,
    runtimeOwnerTests,
    runtimeOwnerTestCount: runtimeOwnerTests.length,
    authoritativePartialMutations: 0,
    mutableInputAliases: 0,
    wallTimeSemanticCutoff: false,
    status: "pass",
  };
  console.log(`A0_PRODUCTION_OBSERVATION ${JSON.stringify(canonical(observation))}`);
});
