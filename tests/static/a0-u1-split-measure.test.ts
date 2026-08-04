import { describe, expect, test } from "bun:test";

import { makeBeatDuration, MAX_LONG_TEXT_CODE_POINTS } from "../../src/domain";
import {
  A0_U1_ATOMIC_EDIT_LAW_IDS,
  A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES,
  A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS,
  A0_U1_ATOMIC_EDIT_PLAN_ID_ALLOCATION_ORDER,
  A0_U1_ATOMIC_EDIT_PLAN_KINDS,
  A0_U1_ATOMIC_EDIT_PLAN_TEXT_SHAPE_POLICY,
  A0_U1_ATOMIC_EDIT_PLAN_TRANSPOSITION_POLICY,
  A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY,
  A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
  type AtomicEditPlan,
  type SplitMeasureEditPlan,
} from "../../src/application/application-edit-plan-contract";

/**
 * The split-measure cutover (`jcpe-pwp2`) moved the sixth atomic plan variant
 * from its proposal module onto the live A0/U1 surface. These assertions pin
 * the two halves of that move: what the sixth variant declares, and the fact
 * that it *extended* the accepted R1 packet rather than editing it. Every
 * accepted index still names the variant the acceptance record cites.
 *
 * Source of truth: `docs/A0_U1_ATOMIC_EDIT_PLAN_CONTRACT.md` section 21.
 */

type Assert<Value extends true> = Value;

/** The sixth variant is a member of the live union, not a parallel type. */
const membership: readonly [
  Assert<SplitMeasureEditPlan extends AtomicEditPlan ? true : false>,
] = [true];

const ACCEPTED_PLAN_KINDS = [
  "insert-fragment",
  "split-event-duration",
  "join-event-durations",
  "split-section",
  "join-sections",
] as const;

describe("A0/U1 split-measure on the live surface", () => {
  test("the closed set is six, appended so accepted indices are stable", () => {
    expect([...membership]).toEqual([true]);
    expect(A0_U1_ATOMIC_EDIT_PLAN_KINDS).toHaveLength(6);
    expect([...A0_U1_ATOMIC_EDIT_PLAN_KINDS]).toEqual([
      ...ACCEPTED_PLAN_KINDS,
      "split-measure",
    ]);
    for (const [index, kind] of ACCEPTED_PLAN_KINDS.entries()) {
      expect(A0_U1_ATOMIC_EDIT_PLAN_KINDS[index]).toBe(kind);
    }
  });

  test("law 001 keeps its accepted identifier and 018 is appended", () => {
    // Renaming 001 would rewrite 109 references inside the byte-pinned packet
    // whose human-acceptance record cites those names; section 21.6 defers it.
    expect(A0_U1_ATOMIC_EDIT_LAW_IDS).toHaveLength(18);
    expect(A0_U1_ATOMIC_EDIT_LAW_IDS[0]).toBe(
      "A0-U1-ATOM-001-command-and-five-closed-variants",
    );
    expect(A0_U1_ATOMIC_EDIT_LAW_IDS[17]).toBe(
      "A0-U1-ATOM-018-split-measure-partition-exact",
    );
  });

  test("each new refusal code sits directly after the code it follows", () => {
    expect(A0_U1_ATOMIC_EDIT_REFUSAL_CODES).toHaveLength(34);
    const anchors = {
      "edit-plan.measure-split-boundary-invalid":
        "edit-plan.section-split-boundary-invalid",
      "edit-plan.measure-partition-mismatch": "edit-plan.duration-sum-mismatch",
    } as const;
    for (const [code, anchor] of Object.entries(anchors)) {
      const anchorIndex = A0_U1_ATOMIC_EDIT_REFUSAL_CODES.indexOf(anchor);
      const codeIndex = A0_U1_ATOMIC_EDIT_REFUSAL_CODES.indexOf(code as never);
      expect(anchorIndex, `${anchor} is an accepted code`).toBeGreaterThan(-1);
      expect(codeIndex, `${code} follows ${anchor}`).toBe(anchorIndex + 1);
    }
  });

  test("the refusal authority stays ordered and densely numbered", () => {
    // The array order and explicit precedence must equal the code tuple, which
    // is what makes a mid-list insertion a mechanical renumber and not a
    // reordering of accepted precedence.
    expect(A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.map((row) => row.code)).toEqual([
      ...A0_U1_ATOMIC_EDIT_REFUSAL_CODES,
    ]);
    for (const [index, row] of A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.entries()) {
      expect(row.precedence, `${row.code} precedence`).toBe(index);
    }
    const boundary = A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.find(
      (row) => row.code === "edit-plan.measure-split-boundary-invalid",
    );
    const partition = A0_U1_ATOMIC_EDIT_REFUSAL_AUTHORITY.find(
      (row) => row.code === "edit-plan.measure-partition-mismatch",
    );
    expect(boundary?.stage).toBe("target-and-destination");
    expect([...(boundary?.pathAuthority ?? [])]).toEqual([
      "/plan/beforeEventId",
    ]);
    expect(partition?.stage).toBe("operation-laws");
    expect([...(partition?.pathAuthority ?? [])]).toEqual([
      "/plan/firstMeasureTotal",
      "/plan/secondMeasureTotal",
    ]);
  });

  test("the allocation step sits at measure granularity", () => {
    // Between the event-level and section-level steps, not appended at the end,
    // so the order stays event, measure, section.
    const order = [...A0_U1_ATOMIC_EDIT_PLAN_ID_ALLOCATION_ORDER];
    const event = order.indexOf("split-event-second-only");
    const measure = order.indexOf("split-measure-suffix-only");
    const section = order.indexOf("split-section-suffix-only");
    expect(event).toBeGreaterThan(-1);
    expect(measure).toBe(event + 1);
    expect(section).toBe(measure + 1);
  });

  test("one bookmark and one transposition policy per plan kind", () => {
    expect(Object.keys(A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES)).toHaveLength(
      A0_U1_ATOMIC_EDIT_PLAN_KINDS.length,
    );
    expect(A0_U1_ATOMIC_EDIT_PLAN_BOOKMARK_POLICIES.splitMeasure).toBe(
      "preserve-node-identities-rewrite-source-measure-end-to-suffix",
    );
    // A bar line carries no spelling, so the structural splits agree exactly.
    expect(A0_U1_ATOMIC_EDIT_PLAN_TRANSPOSITION_POLICY.splitMeasure).toBe(
      A0_U1_ATOMIC_EDIT_PLAN_TRANSPOSITION_POLICY.splitSection,
    );
    expect(
      A0_U1_ATOMIC_EDIT_PLAN_TRANSPOSITION_POLICY.operationPerformsTransposition,
    ).toBe(false);
  });

  test("the plan shape is exactly its declared keys", () => {
    // The type and the key authority must not drift apart. A value that omits
    // or adds a key fails to typecheck; this pins the authority list itself.
    expect([...A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.splitMeasurePlan]).toEqual([
      "kind",
      "measureId",
      "beforeEventId",
      "firstMeasureTotal",
      "secondMeasureTotal",
      "newMeasureCompletion",
      "completionDeclarations",
      "identityPolicy",
      "eventPolicy",
    ]);
    const beats = (numerator: number) => {
      const made = makeBeatDuration({ denominator: 1, numerator });
      if (!made.ok) throw new Error("A0U1_TEST_BEAT");
      return made.value;
    };
    const plan: SplitMeasureEditPlan = {
      beforeEventId: "event-2" as SplitMeasureEditPlan["beforeEventId"],
      completionDeclarations: [
        {
          completion: { kind: "complete" },
          measureId: "measure-1" as SplitMeasureEditPlan["measureId"],
        },
      ],
      eventPolicy: "move-suffix-preserve-identities",
      firstMeasureTotal: beats(4),
      identityPolicy: "retain-source-prefix-allocate-suffix",
      kind: "split-measure",
      measureId: "measure-1" as SplitMeasureEditPlan["measureId"],
      newMeasureCompletion: { kind: "complete" },
      secondMeasureTotal: beats(4),
    };
    expect(Object.keys(plan).sort()).toEqual(
      [...A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.splitMeasurePlan].sort(),
    );
    expect([...A0_U1_ATOMIC_EDIT_PLAN_EXACT_KEYS.splitMeasureIdentitySource])
      .toEqual(["kind", "sourceMeasureId"]);
  });

  test("the suffix measure's own completion reason is declared text", () => {
    // Split-measure declares no section metadata; its only caller-owned text is
    // the fresh measure's completion reason, scanned before the declaration
    // tuple. Section 21.3's row is one expected row, a horizon of two, 2,000
    // metadata code points, 4,000 reason code points, and a 6,000 full scan.
    expect([
      ...A0_U1_ATOMIC_EDIT_PLAN_TEXT_SHAPE_POLICY.splitMeasureMetadataOrder,
    ]).toEqual(["newMeasureCompletion"]);
    expect(
      A0_U1_ATOMIC_EDIT_PLAN_TEXT_SHAPE_POLICY.pathAuthority,
    ).toContain("/plan/newMeasureCompletion/reason");
    const expectedRows = 1;
    const shapeHorizon = expectedRows + 1;
    const maximumMetadataCodePoints = MAX_LONG_TEXT_CODE_POINTS;
    const maximumReasonCodePoints = shapeHorizon * MAX_LONG_TEXT_CODE_POINTS;
    expect(maximumMetadataCodePoints).toBe(2_000);
    expect(maximumReasonCodePoints).toBe(4_000);
    expect(maximumMetadataCodePoints + maximumReasonCodePoints).toBe(6_000);
  });
});
