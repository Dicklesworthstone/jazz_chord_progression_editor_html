/**
 * U1 chart-editing contract validator.
 *
 * The validator imports no production module. It re-derives every judgment it
 * checks — meter capacity, draft measure sums, the insertion-plan
 * classification, the recovery-lane availability, token states, and the
 * operation-to-channel binding — from the declared inputs with exact rational
 * arithmetic, then compares its own result with the fixture's declared
 * expectation. Fixture expectations may never be produced by the code they
 * will test.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type JsonObject = Record<string, unknown>;

export type U1ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type U1ContractValidationReport = Readonly<{
  schema: "changes.validation.u1-contract.v1";
  package: "U1";
  outcome: "pass" | "fail";
  reviewState: string;
  productionImplementationClaim: boolean;
  uiCompletionClaim: boolean;
  humanAcceptanceClaim: boolean;
  expertReviewClaim: boolean;
  counts: Readonly<{
    companions: number;
    components: number;
    operations: number;
    quickEntryCases: number;
    operationRows: number;
    interactionCases: number;
    traces: number;
    authorities: number;
    mutationControls: number;
    mutationControlsReplayed: number;
  }>;
  findings: readonly U1ContractFinding[];
}>;

const CONTRACT_FILENAME = "u1-editing-contract.json";

export const U1_REVIEWED_COMPANIONS = [
  "edit-operation-matrix.json",
  "interaction-state-matrix.json",
  "mutation-controls.json",
  "provenance-ledger.json",
  "quick-entry-cases.json",
  "trace-ledger.json",
] as const;

const EXPECTED_FILES = [CONTRACT_FILENAME, ...U1_REVIEWED_COMPANIONS] as const;
type ExpectedFilename = (typeof EXPECTED_FILES)[number];

const EXPECTED_SCHEMAS: Readonly<Record<ExpectedFilename, string>> = {
  "u1-editing-contract.json": "changes.fixtures.u1-editing-contract.v1",
  "edit-operation-matrix.json":
    "changes.fixtures.u1-edit-operation-matrix.v1",
  "interaction-state-matrix.json":
    "changes.fixtures.u1-interaction-matrix.v1",
  "mutation-controls.json": "changes.fixtures.u1-mutation-controls.v1",
  "provenance-ledger.json": "changes.fixtures.u1-provenance-ledger.v1",
  "quick-entry-cases.json": "changes.fixtures.u1-quick-entry-cases.v1",
  "trace-ledger.json": "changes.fixtures.u1-trace-ledger.v1",
};

/** Independently reviewed byte digests of the companion files. */
export const U1_REVIEWED_BYTE_DIGESTS: Readonly<
  Record<(typeof U1_REVIEWED_COMPANIONS)[number], string>
> = {
  "edit-operation-matrix.json":
    "ce29ffd892750e002996ee1b55337243228b37855eefd77c95d176ad098c7e71",
  "interaction-state-matrix.json":
    "4a8fd91eb5c23f6e3f8d8a9ab03c95b4c4a0bff391f5c7eb606fbbc54adbd9ba",
  "mutation-controls.json":
    "c4089f4ba4694e9e8d267e11906c9d567b636383bb7f9cc3c3f9c8b8a86aa0c0",
  "provenance-ledger.json":
    "848ba4174dac0ec9290477ef398984928ea83dbb572a88c3afb8187d5bf72d48",
  "quick-entry-cases.json":
    "f15b5bc60d343afbdd7d73013efd552855ec8bdf7521dc10f14a10e69282e405",
  "trace-ledger.json":
    "57e1ab3bb440d9952a5b26142c0dc70974d2ee4237ec6c9c654fb025ac9743f8",
};

/** Independently reviewed canonical-JSON digest over all seven parsed roots. */
export const U1_REVIEWED_SEMANTIC_DIGEST =
  "58684344f0a04393709f4d888c0207b11bfd4d31329863ca81342716d915f8b7";

export const U1_REVIEWED_COMPONENT_COUNT = 25;

export const U1_REVIEWED_SURFACES = [
  "quick-entry",
  "chart",
  "range",
  "view",
] as const;

export const U1_REVIEWED_MUTATION_CHANNELS = [
  "document-command",
  "ephemeral-intent",
  "presentation-only",
] as const;

export const U1_REVIEWED_AUTHORIZED_COMMAND_KINDS = [
  "insert",
  "delete",
  "move",
  "duplicate",
  "set-text",
  "set-duration",
  "set-measure-completion",
  "set-section",
  "set-chord",
  "apply-edit-plan",
] as const;

export const U1_REVIEWED_UNAUTHORIZED_COMMAND_KINDS = [
  "set-voicing",
  "set-document-settings",
  "transpose",
  "apply-suggestion",
  "apply-reharmonization",
  "replace-document",
] as const;

export const U1_REVIEWED_EPHEMERAL_INTENT_KINDS = [
  "set-bookmarks",
  "set-quick-entry",
] as const;

export const U1_REVIEWED_EDIT_PLAN_KINDS = [
  "insert-fragment",
  "split-event-duration",
  "join-event-durations",
  "split-section",
  "join-sections",
  "split-measure",
] as const;

export const U1_REVIEWED_INSERTION_PLAN_KINDS = [
  "fits-measure",
  "completes-measures",
  "incomplete-requires-confirmation",
  "overfill-requires-split",
  "not-atomic-refusal",
] as const;

export const U1_REVIEWED_MEASURE_FILL_KINDS = [
  "exact-fill",
  "underfill-requires-reason",
  "overfill-requires-resolution",
] as const;

export const U1_REVIEWED_TOKEN_STATES = [
  "valid",
  "invalid",
  "insertable",
] as const;

export const U1_REVIEWED_QUICK_ENTRY_STATUSES = [
  "idle",
  "invalid",
  "ready",
] as const;

export const U1_REVIEWED_QUICK_ENTRY_LANES = [
  "complete-draft",
  "recovered-chord",
] as const;

export const U1_REVIEWED_COVERAGE_FAMILIES = [
  "positive",
  "near-miss",
  "malformed",
  "limit",
  "cancellation",
  "stale",
] as const;

export const U1_REVIEWED_LIMITS = {
  maxDraftCodePoints: 4_096,
  maxDraftUtf8Bytes: 16_384,
  maxPreviewTokens: 2_048,
  maxPreviewMeasures: 2_048,
  maxPreviewSections: 64,
  maxPreviewDiagnostics: 64,
  maxQuickEntryIssueCodes: 64,
  maxIssueCodeCodePoints: 128,
  maxRenderedSections: 64,
  maxRenderedMeasures: 65_536,
  maxRenderedEvents: 8_192,
  maxSelectedEventIds: 8_192,
  maxSymbolDraftCodePoints: 256,
  maxSectionNameCodePoints: 256,
  maxSectionAnnotationCodePoints: 2_000,
  maxCompletionReasonCodePoints: 2_000,
  maxExactBeatCodePoints: 128,
  maxCardMenuItems: 200,
  maxCardMenuDepth: 2,
  maxUndoLabelCodePoints: 160,
  maxRefusalMessageCodePoints: 512,
  maxCommandsPerUserAction: 1,
  maxConcurrentDragSessions: 1,
  maxPointerCapturesPerCard: 1,
  staticListenersPerChordCard: 3,
  staticListenersPerInsertionTarget: 1,
  staticListenersPerChartRegion: 3,
  transientDragListenersPerSession: 3,
  pointerDragThresholdCssPx: 8,
  touchTargetCssPx: 44,
  typeaheadResetMs: 700,
  textCommandCoalesceWindowMs: 1_000,
} as const;

export const U1_REVIEWED_BOUND_ASSIGNMENTS = {
  quickEntryDraftText: "maxDraftCodePoints",
  quickEntryDraftBytes: "maxDraftUtf8Bytes",
  quickEntryPreviewTokens: "maxPreviewTokens",
  quickEntryPreviewMeasures: "maxPreviewMeasures",
  quickEntryPreviewSections: "maxPreviewSections",
  quickEntryDiagnostics: "maxPreviewDiagnostics",
  quickEntryIssueCodes: "maxQuickEntryIssueCodes",
  quickEntryIssueCodeText: "maxIssueCodeCodePoints",
  chartSections: "maxRenderedSections",
  chartMeasures: "maxRenderedMeasures",
  chartEvents: "maxRenderedEvents",
  selectionEventIds: "maxSelectedEventIds",
  inlineSymbolDraft: "maxSymbolDraftCodePoints",
  sectionNameDraft: "maxSectionNameCodePoints",
  sectionAnnotationDraft: "maxSectionAnnotationCodePoints",
  completionReasonDraft: "maxCompletionReasonCodePoints",
  rangeBeatFieldText: "maxExactBeatCodePoints",
  cardMenuItems: "maxCardMenuItems",
  cardMenuDepth: "maxCardMenuDepth",
  undoDescription: "maxUndoLabelCodePoints",
  refusalMessage: "maxRefusalMessageCodePoints",
} as const;

export const U1_REVIEWED_KEYBOARD_ACCESS_KINDS = [
  "shortcut",
  "menu-item",
  "text-entry",
] as const;

export const U1_REVIEWED_REFUSAL_CODES = [
  "u1.draft_code_points_exceeded",
  "u1.draft_unicode_invalid",
  "u1.preview_token_limit",
  "u1.quick_entry_target_missing",
  "u1.quick_entry_stale_revision",
  "u1.quick_entry_lane_mismatch",
  "u1.insertion_plan_requires_confirmation",
  "u1.insertion_plan_overfills_destination",
  "u1.insertion_plan_not_atomic",
  "u1.symbol_draft_invalid",
  "u1.symbol_edit_blocked_manual_voicing",
  "u1.duration_invalid",
  "u1.duration_overfills_measure",
  "u1.completion_reason_required",
  "u1.split_partition_invalid",
  "u1.join_requires_adjacent_events",
  "u1.join_right_annotation_not_empty",
  "u1.section_split_boundary_invalid",
  "u1.measure_split_boundary_invalid",
  "u1.section_join_requires_adjacent_sections",
  "u1.move_destination_invalid",
  "u1.selection_limit",
  "u1.selection_empty",
  "u1.range_boundary_invalid",
  "u1.range_endpoints_unordered",
  "u1.target_missing",
] as const;

export const U1_REVIEWED_LAW_IDS = [
  "U1-EDIT-001-no-new-mutation-channel",
  "U1-EDIT-002-draft-text-is-caller-owned-and-exact",
  "U1-EDIT-003-preview-status-is-t0-derived",
  "U1-EDIT-004-insertion-plan-statement-exact",
  "U1-EDIT-005-whole-preview-apply-is-one-atomic-command",
  "U1-EDIT-006-recovered-chord-lane-requires-explicit-loss-acknowledgement",
  "U1-EDIT-007-stable-identity-keys-only",
  "U1-EDIT-008-four-independent-bookmarks",
  "U1-EDIT-009-roving-focus-visual-order-stable-across-reorder",
  "U1-EDIT-010-delete-focus-repair-order",
  "U1-EDIT-011-inline-symbol-edit-valid-on-apply",
  "U1-EDIT-012-duration-edit-states-measure-fill-and-explicit-resolution",
  "U1-EDIT-013-pointer-drag-optional-and-threshold-gated",
  "U1-EDIT-014-keyboard-or-menu-alternative-for-every-pointer-operation",
  "U1-EDIT-015-listener-counts-constant-across-mount-reorder-and-mutation",
  "U1-EDIT-016-touch-range-mode-explicit-and-exact",
  "U1-EDIT-017-application-refusals-surfaced-verbatim",
  "U1-EDIT-018-view-modes-render-identical-musical-facts",
] as const;

export const U1_REVIEWED_TRACE_IDS = [
  "U1-TRACE-CHANNEL",
  "U1-TRACE-QUICKENTRY",
  "U1-TRACE-IDENTITY",
  "U1-TRACE-BOOKMARKS",
  "U1-TRACE-FOCUS",
  "U1-TRACE-INLINE",
  "U1-TRACE-POINTER",
  "U1-TRACE-VIEW",
] as const;

export const U1_REVIEWED_AUTHORITY_IDS = [
  "U1-AUTH-BEAD",
  "U1-AUTH-PLAN",
  "U1-AUTH-U0",
  "U1-AUTH-T0",
  "U1-AUTH-A0",
  "U1-AUTH-A0U1",
  "U1-AUTH-LEGACY",
  "U1-AUTH-WCAG",
  "U1-AUTH-MECHANICAL",
] as const;

export const U1_REVIEWED_AUTHORITY_CLASSES = [
  "reviewed-project-contract",
  "application-handoff",
  "external-standard-minimum",
  "mechanical-derivation",
] as const;

const CONTRACT_TOP_LEVEL_KEYS = [
  "acceptedUpstreamBoundary",
  "authorizedCommandKinds",
  "authorizedEditPlanKinds",
  "authorizedEphemeralIntentKinds",
  "beadId",
  "bookmarkConcepts",
  "bookmarkIndependencePolicy",
  "companionSha256",
  "companions",
  "components",
  "contractModule",
  "contractVersion",
  "counts",
  "coverageFamilies",
  "deleteFocusRepairOrder",
  "documentPlacementPolicy",
  "expectedValuesGenerated",
  "expertReviewClaim",
  "focusPriority",
  "forbiddenShortcuts",
  "handoff",
  "humanAcceptanceClaim",
  "identityPolicy",
  "implementationStatus",
  "independence",
  "inlineEditPolicy",
  "insertionPlanAuthority",
  "insertionPlanKinds",
  "keyBindings",
  "lawIds",
  "limits",
  "measureFillAuthority",
  "measureFillKinds",
  "mutationChannels",
  "operations",
  "package",
  "pinState",
  "pointerPolicy",
  "policyId",
  "policyVersion",
  "productionImplementationClaim",
  "productionOutputUsedAsOracle",
  "proofRequirements",
  "publicBoundAssignments",
  "quickEntryLanes",
  "quickEntryStatuses",
  "refusalCodes",
  "refusalSurfacingPolicy",
  "restSynthesisPolicy",
  "reviewState",
  "schema",
  "surfaces",
  "textFieldTargetKinds",
  "tokenStates",
  "touchRangeActions",
  "uiCompletionClaim",
  "unauthorizedCommandKinds",
  "upstreamPackages",
  "viewModePolicy",
  "viewModes",
  "workBounds",
] as const;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REFUSAL_TOKEN_PATTERN = /"(u1\.[a-z0-9_]+)"/gu;

/* ------------------------------------------------------------------ */
/* Generic helpers                                                      */
/* ------------------------------------------------------------------ */

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objects(value: unknown): readonly JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readText(record: JsonObject, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readNumber(record: JsonObject, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(record: JsonObject, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function readObject(record: JsonObject, key: string): JsonObject {
  const value = record[key];
  return isObject(value) ? value : {};
}

/** Exact Unicode scalar count without spreading a string. */
function countCodePoints(text: string): number {
  let count = 0;
  const scalars = text[Symbol.iterator]();
  while (!scalars.next().done) count += 1;
  return count;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map(stableJson).join(",") + "]";
  }
  if (isObject(value)) {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + stableJson(value[key]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function finding(
  findings: U1ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, message, path });
}

function findingOrder(
  left: U1ContractFinding,
  right: U1ContractFinding,
): number {
  if (left.path !== right.path) return left.path.localeCompare(right.path);
  if (left.code !== right.code) return left.code.localeCompare(right.code);
  return left.message.localeCompare(right.message);
}

function exactValue(
  actual: unknown,
  expected: unknown,
  code: string,
  path: string,
  findings: U1ContractFinding[],
): void {
  if (stableJson(actual) !== stableJson(expected)) {
    finding(
      findings,
      code,
      path,
      "Value differs from the independently reviewed expectation.",
    );
  }
}

function duplicateJsonKeys(source: string): readonly string[] {
  const duplicates: string[] = [];
  const stack: Set<string>[] = [];
  let index = 0;
  let pendingKey: string | null = null;
  while (index < source.length) {
    const character = source[index] ?? "";
    if (character === '"') {
      let cursor = index + 1;
      let text = "";
      while (cursor < source.length) {
        const inner = source[cursor] ?? "";
        if (inner === "\\") {
          text += inner + (source[cursor + 1] ?? "");
          cursor += 2;
          continue;
        }
        if (inner === '"') break;
        text += inner;
        cursor += 1;
      }
      let after = cursor + 1;
      while (after < source.length && /\s/u.test(source[after] ?? "")) {
        after += 1;
      }
      if ((source[after] ?? "") === ":") pendingKey = text;
      index = cursor + 1;
      continue;
    }
    if (character === "{") {
      stack.push(new Set());
      pendingKey = null;
    } else if (character === "}") {
      stack.pop();
    } else if (character === ":" && pendingKey !== null) {
      const scope = stack.at(-1);
      if (scope !== undefined) {
        let decoded: string;
        try {
          decoded = JSON.parse('"' + pendingKey + '"') as string;
        } catch {
          decoded = pendingKey;
        }
        if (scope.has(decoded)) duplicates.push(decoded);
        scope.add(decoded);
      }
      pendingKey = null;
    }
    index += 1;
  }
  return duplicates;
}

/* ------------------------------------------------------------------ */
/* Exact rational arithmetic                                            */
/* ------------------------------------------------------------------ */

type Rational = Readonly<{ n: bigint; d: bigint }>;

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a === 0n ? 1n : a;
}

function rational(n: bigint, d: bigint): Rational {
  if (d === 0n) return { d: 1n, n: 0n };
  const sign = d < 0n ? -1n : 1n;
  const numerator = n * sign;
  const denominator = d * sign;
  const divisor = gcd(numerator, denominator);
  return { d: denominator / divisor, n: numerator / divisor };
}

function addRational(left: Rational, right: Rational): Rational {
  return rational(left.n * right.d + right.n * left.d, left.d * right.d);
}

function compareRational(left: Rational, right: Rational): number {
  const difference = left.n * right.d - right.n * left.d;
  if (difference < 0n) return -1;
  return difference > 0n ? 1 : 0;
}

const ZERO: Rational = { d: 1n, n: 0n };

function rationalFromRecord(value: unknown): Rational | null {
  if (!isObject(value)) return null;
  const numerator = readNumber(value, "numerator");
  const denominator = readNumber(value, "denominator");
  if (
    numerator === null ||
    denominator === null ||
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    denominator <= 0
  ) {
    return null;
  }
  return rational(BigInt(numerator), BigInt(denominator));
}

function meterCapacity(meter: JsonObject): Rational | null {
  const beatsPerBar = readNumber(meter, "beatsPerBar");
  const beatUnit = readNumber(meter, "beatUnit");
  if (
    beatsPerBar === null ||
    beatUnit === null ||
    !Number.isSafeInteger(beatsPerBar) ||
    !Number.isSafeInteger(beatUnit) ||
    beatsPerBar <= 0 ||
    beatUnit <= 0
  ) {
    return null;
  }
  return rational(BigInt(beatsPerBar) * 4n, BigInt(beatUnit));
}

/* ------------------------------------------------------------------ */
/* Insertion-plan oracle                                                */
/* ------------------------------------------------------------------ */

type PlanKind = (typeof U1_REVIEWED_INSERTION_PLAN_KINDS)[number];

type QuickEntryOracle = Readonly<{
  status: string;
  lane: string | null;
  preflightRefusal: string | null;
  plan: PlanKind | null;
  placement: string | null;
  canInsertPreview: boolean;
  canInsertOneChord: boolean;
}>;

const MEASURE_BOUNDARIES = new Set([
  "measure-start",
  "measure-end",
  "before-event",
  "after-event",
]);
const SECTION_BOUNDARIES = new Set([
  "section-start",
  "section-end",
  "before-measure",
  "after-measure",
]);
const DOCUMENT_BOUNDARIES = new Set([
  "document-start",
  "document-end",
  "before-section",
  "after-section",
]);

/**
 * Packages a `reachability` record may name as the owner of a blocked state.
 * A row may not defer itself to a package the plan does not contain.
 */
const U1_DOWNSTREAM_PACKAGES = new Set([
  "A1",
  "E0",
  "E1",
  "U2",
  "U3",
  "U4",
  "U5",
  "X0",
  "X1",
]);

/**
 * A declared state the product cannot enter must say so, and say why. A row
 * with no `reachability` record is claiming its state is reachable, which the
 * evidence ledger then holds it to; a row that declares one owes a written
 * reason and, when it is merely deferred, the package that will land it.
 */
function checkReachability(
  row: JsonObject,
  path: string,
  findings: U1ContractFinding[],
): void {
  const declared = row["reachability"];
  if (declared === undefined) return;
  if (!isObject(declared)) {
    finding(
      findings,
      "U1_CONTRACT_REACHABILITY",
      path + ".reachability",
      "A reachability declaration must be one object.",
    );
    return;
  }
  const state = readText(declared, "state");
  if (state !== "blocked" && state !== "unreachable-by-design") {
    finding(
      findings,
      "U1_CONTRACT_REACHABILITY",
      path + ".reachability.state",
      "Reachability is either 'blocked' or 'unreachable-by-design'.",
    );
  }
  if ((readText(declared, "reason") ?? "").length < 40) {
    finding(
      findings,
      "U1_CONTRACT_REACHABILITY",
      path + ".reachability.reason",
      "A state the product cannot enter states why in its own words.",
    );
  }
  const owner = readText(declared, "byPackage");
  if (state === "blocked" && (owner === null || !U1_DOWNSTREAM_PACKAGES.has(owner))) {
    finding(
      findings,
      "U1_CONTRACT_REACHABILITY",
      path + ".reachability.byPackage",
      "A blocked state names the downstream package that will reach it.",
    );
  }
  if (state === "unreachable-by-design" && owner !== null) {
    finding(
      findings,
      "U1_CONTRACT_REACHABILITY",
      path + ".reachability.byPackage",
      "A state forbidden by design is not waiting on a package.",
    );
  }
}

/**
 * The total token projection the corpus declares in
 * `classificationPolicy.tokenStateProjection`. A parsed draft shows one `valid`
 * row per parsed event; a refused draft shows one `insertable` row per chord T0
 * published in its recoverable lane, in T0 ordinal order, then one `invalid`
 * row per T0 diagnostic, in T0 order. Counting the insertable rows alone let a
 * case drop its diagnostic rows silently, so the whole ordered sequence is
 * recomputed and compared.
 */
function expectProjectedTokenStates(
  findings: U1ContractFinding[],
  path: string,
  limits: JsonObject,
  declared: readonly string[],
  unbounded: readonly string[],
): void {
  const bound = readNumber(limits, "maxPreviewTokens") ?? unbounded.length;
  const projected = unbounded.slice(0, bound);
  if (declared.length !== projected.length) {
    finding(
      findings,
      "U1_CONTRACT_TOKEN_STATE",
      path + ".expected.tokenStates",
      "Declared token rows differ in count from the recomputed projection: "
        + "declared " + String(declared.length) + ", projected "
        + String(projected.length) + ".",
    );
    return;
  }
  for (const [index, state] of projected.entries()) {
    if (declared[index] === state) continue;
    finding(
      findings,
      "U1_CONTRACT_TOKEN_STATE",
      path + ".expected.tokenStates." + String(index),
      "Declared token row differs from the recomputed projection.",
    );
  }
}

function classifyQuickEntry(
  testCase: JsonObject,
  limits: JsonObject,
): QuickEntryOracle | null {
  const draftText = readText(testCase, "draftText");
  if (draftText === null) return null;
  const meter = readObject(testCase, "meter");
  const capacity = meterCapacity(meter);
  const destination = readObject(testCase, "destination");
  const staleness = readObject(testCase, "staleness");
  const t0 = readObject(testCase, "t0Result");
  if (capacity === null) return null;

  const codePoints = countCodePoints(draftText);
  const maxCodePoints = readNumber(limits, "maxDraftCodePoints") ?? 0;
  const blocked = (refusal: string): QuickEntryOracle => ({
    canInsertOneChord: false,
    canInsertPreview: false,
    lane: null,
    placement: null,
    plan: null,
    preflightRefusal: refusal,
    status: "invalid",
  });

  if (codePoints > maxCodePoints) {
    return blocked("u1.draft_code_points_exceeded");
  }
  for (const unit of draftText) {
    const code = unit.codePointAt(0) ?? 0;
    if (code >= 0xd800 && code <= 0xdfff) {
      return blocked("u1.draft_unicode_invalid");
    }
  }
  if (codePoints === 0) {
    return {
      canInsertOneChord: false,
      canInsertPreview: false,
      lane: null,
      placement: null,
      plan: null,
      preflightRefusal: null,
      status: "idle",
    };
  }
  if (readBoolean(staleness, "baseRevisionMatchesState") === false) {
    return blocked("u1.quick_entry_stale_revision");
  }
  if (readBoolean(staleness, "targetResolvesInDocument") === false) {
    return blocked("u1.quick_entry_target_missing");
  }

  const outcome = readText(t0, "outcome") ?? "";
  const level = readText(destination, "level") ?? "";
  const filled = rationalFromRecord(destination["measureFilled"]) ?? ZERO;
  const declaredCapacity =
    rationalFromRecord(destination["measureCapacity"]) ?? ZERO;
  const eventCount = readNumber(destination, "measureEventCount") ?? 0;
  const completion = readText(destination, "measureCompletion") ?? "";
  const insertable = objects(t0["insertableChords"]);
  const diagnostics = strings(t0["diagnosticCodes"]);

  if (outcome === "failed") {
    let plan: PlanKind = "not-atomic-refusal";
    if (diagnostics.includes("chart.bar_underfilled")) {
      plan = "incomplete-requires-confirmation";
    } else if (diagnostics.includes("chart.bar_overfilled")) {
      plan = "overfill-requires-split";
    }
    const remaining = addRational(declaredCapacity, {
      d: filled.d,
      n: -filled.n,
    });
    const oneFits =
      level === "measure" &&
      compareRational(remaining, ZERO) > 0 &&
      insertable.some((row) => {
        const kind = readText(row, "durationKind");
        if (kind === "requires-caller") return true;
        const duration = rationalFromRecord(row["duration"]);
        return duration !== null && compareRational(duration, remaining) <= 0;
      });
    return {
      canInsertOneChord: oneFits,
      canInsertPreview: false,
      lane: "recovered-chord",
      placement: null,
      plan,
      preflightRefusal: null,
      status: "invalid",
    };
  }

  if (outcome !== "ok") return null;

  const sections = objects(t0["sections"]);
  const named = sections.filter(
    (section) => readText(section, "kind") === "named",
  );
  const implicit = sections.filter(
    (section) => readText(section, "kind") === "implicit",
  );
  const measures = sections.flatMap((section) =>
    objects(section["measures"]),
  );
  const nonEmptyMeasures = measures.filter(
    (row) => objects(row["events"]).length > 0,
  );

  let plan: PlanKind = "not-atomic-refusal";
  let placement: string | null = null;
  if (MEASURE_BOUNDARIES.has(readText(destination, "boundaryKind") ?? "")) {
    const singleMeasureDraft =
      named.length === 0 &&
      implicit.length === 1 &&
      measures.length === 1 &&
      nonEmptyMeasures.length === 1;
    const targetEmpty = eventCount === 0 && completion === "empty";
    if (!singleMeasureDraft && named.length === 0 && measures.length >= 1) {
      plan = nonEmptyMeasures.length === 0
        ? "not-atomic-refusal"
        : "overfill-requires-split";
    } else if (singleMeasureDraft && targetEmpty) {
      plan = "fits-measure";
      placement = "into-measure";
    } else if (singleMeasureDraft) {
      plan = "overfill-requires-split";
    }
  } else if (
    SECTION_BOUNDARIES.has(readText(destination, "boundaryKind") ?? "")
  ) {
    if (named.length === 0 && implicit.length === 1 && measures.length >= 1) {
      plan = "completes-measures";
      placement = "into-section";
    }
  } else if (
    DOCUMENT_BOUNDARIES.has(readText(destination, "boundaryKind") ?? "")
  ) {
    if (named.length === sections.length && named.length >= 1) {
      plan = "completes-measures";
      placement = "into-document";
    }
  }
  void level;

  const committable = plan === "fits-measure" || plan === "completes-measures";
  return {
    canInsertOneChord: false,
    canInsertPreview: committable,
    lane: "complete-draft",
    placement,
    plan,
    preflightRefusal: null,
    status: "ready",
  };
}

/* ------------------------------------------------------------------ */
/* Oracles                                                              */
/* ------------------------------------------------------------------ */

function checkFileShape(
  filename: ExpectedFilename,
  root: JsonObject,
  findings: U1ContractFinding[],
): void {
  const schema = readText(root, "schema");
  if (schema !== EXPECTED_SCHEMAS[filename]) {
    finding(
      findings,
      "U1_CONTRACT_SCHEMA",
      filename + ".schema",
      "Fixture schema is missing or unexpected.",
    );
  }
  if (readText(root, "reviewState") !== "proposed-independent-spec") {
    finding(
      findings,
      "U1_CONTRACT_VERSION",
      filename + ".reviewState",
      "Every U1 fixture must declare the proposed independent review state.",
    );
  }
  if (readText(root, "pinState") !== "reviewed-byte-and-semantic-pinned") {
    finding(
      findings,
      "U1_CONTRACT_VERSION",
      filename + ".pinState",
      "Every U1 fixture must declare the reviewed pin state.",
    );
  }
  if (readBoolean(root, "expectedValuesGenerated") !== false) {
    finding(
      findings,
      "U1_CONTRACT_INDEPENDENCE",
      filename + ".expectedValuesGenerated",
      "Generated expected values cannot certify an independent U1 fixture.",
    );
  }
  if (readBoolean(root, "productionOutputUsedAsOracle") !== false) {
    finding(
      findings,
      "U1_CONTRACT_INDEPENDENCE",
      filename + ".productionOutputUsedAsOracle",
      "Production output may not be used as the U1 oracle.",
    );
  }
}

function checkManifest(
  contract: JsonObject,
  findings: U1ContractFinding[],
): void {
  const actualKeys = Object.keys(contract).sort();
  exactValue(
    actualKeys,
    [...CONTRACT_TOP_LEVEL_KEYS],
    "U1_CONTRACT_KEYS",
    CONTRACT_FILENAME + ".keys",
    findings,
  );
  if (readText(contract, "package") !== "U1") {
    finding(
      findings,
      "U1_CONTRACT_IDENTITY",
      CONTRACT_FILENAME + ".package",
      "Package identity must be U1.",
    );
  }
  if (readNumber(contract, "contractVersion") !== 1) {
    finding(
      findings,
      "U1_CONTRACT_VERSION",
      CONTRACT_FILENAME + ".contractVersion",
      "Contract version must be 1.",
    );
  }
  if (
    readText(contract, "contractModule") !== "src/ui/studio/u1-editing-contract.ts"
  ) {
    finding(
      findings,
      "U1_CONTRACT_IDENTITY",
      CONTRACT_FILENAME + ".contractModule",
      "The declared code-facing contract module is wrong.",
    );
  }
  for (const claim of [
    "productionImplementationClaim",
    "uiCompletionClaim",
    "humanAcceptanceClaim",
    "expertReviewClaim",
  ]) {
    if (readBoolean(contract, claim) !== false) {
      finding(
        findings,
        "U1_CONTRACT_INDEPENDENCE",
        CONTRACT_FILENAME + "." + claim,
        "The U1 specification leaf claims no implementation, UI completion, "
          + "human acceptance, or expert review.",
      );
    }
  }
  exactValue(
    contract["companions"],
    [...U1_REVIEWED_COMPANIONS],
    "U1_CONTRACT_IDENTITY",
    CONTRACT_FILENAME + ".companions",
    findings,
  );
  exactValue(
    contract["limits"],
    U1_REVIEWED_LIMITS,
    "U1_CONTRACT_LIMITS",
    CONTRACT_FILENAME + ".limits",
    findings,
  );
  exactValue(
    contract["refusalCodes"],
    [...U1_REVIEWED_REFUSAL_CODES],
    "U1_CONTRACT_REFUSAL_TOKEN",
    CONTRACT_FILENAME + ".refusalCodes",
    findings,
  );
  exactValue(
    contract["lawIds"],
    [...U1_REVIEWED_LAW_IDS],
    "U1_CONTRACT_LAW_COVERAGE",
    CONTRACT_FILENAME + ".lawIds",
    findings,
  );
  exactValue(
    contract["surfaces"],
    [...U1_REVIEWED_SURFACES],
    "U1_CONTRACT_IDENTITY",
    CONTRACT_FILENAME + ".surfaces",
    findings,
  );
  exactValue(
    contract["mutationChannels"],
    [...U1_REVIEWED_MUTATION_CHANNELS],
    "U1_CONTRACT_CHANNEL_BINDING",
    CONTRACT_FILENAME + ".mutationChannels",
    findings,
  );
  exactValue(
    contract["authorizedCommandKinds"],
    [...U1_REVIEWED_AUTHORIZED_COMMAND_KINDS],
    "U1_CONTRACT_COMMAND_AUTHORIZATION",
    CONTRACT_FILENAME + ".authorizedCommandKinds",
    findings,
  );
  exactValue(
    contract["unauthorizedCommandKinds"],
    [...U1_REVIEWED_UNAUTHORIZED_COMMAND_KINDS],
    "U1_CONTRACT_COMMAND_AUTHORIZATION",
    CONTRACT_FILENAME + ".unauthorizedCommandKinds",
    findings,
  );
  exactValue(
    contract["authorizedEphemeralIntentKinds"],
    [...U1_REVIEWED_EPHEMERAL_INTENT_KINDS],
    "U1_CONTRACT_CHANNEL_BINDING",
    CONTRACT_FILENAME + ".authorizedEphemeralIntentKinds",
    findings,
  );
  exactValue(
    contract["authorizedEditPlanKinds"],
    [...U1_REVIEWED_EDIT_PLAN_KINDS],
    "U1_CONTRACT_CHANNEL_BINDING",
    CONTRACT_FILENAME + ".authorizedEditPlanKinds",
    findings,
  );
  exactValue(
    contract["insertionPlanKinds"],
    [...U1_REVIEWED_INSERTION_PLAN_KINDS],
    "U1_CONTRACT_PLAN_AUTHORITY",
    CONTRACT_FILENAME + ".insertionPlanKinds",
    findings,
  );
  exactValue(
    contract["measureFillKinds"],
    [...U1_REVIEWED_MEASURE_FILL_KINDS],
    "U1_CONTRACT_PLAN_AUTHORITY",
    CONTRACT_FILENAME + ".measureFillKinds",
    findings,
  );
  exactValue(
    contract["tokenStates"],
    [...U1_REVIEWED_TOKEN_STATES],
    "U1_CONTRACT_TOKEN_STATE",
    CONTRACT_FILENAME + ".tokenStates",
    findings,
  );
  exactValue(
    contract["coverageFamilies"],
    [...U1_REVIEWED_COVERAGE_FAMILIES],
    "U1_CONTRACT_CASE_KIND",
    CONTRACT_FILENAME + ".coverageFamilies",
    findings,
  );

  const commandUnion = new Set([
    ...strings(contract["authorizedCommandKinds"]),
    ...strings(contract["unauthorizedCommandKinds"]),
  ]);
  if (commandUnion.size !== 16) {
    finding(
      findings,
      "U1_CONTRACT_COMMAND_AUTHORIZATION",
      CONTRACT_FILENAME + ".authorizedCommandKinds",
      "The authorized and unauthorized command kinds must partition the live "
        + "sixteen-kind A0 tuple.",
    );
  }
  for (const kind of strings(contract["authorizedCommandKinds"])) {
    if (strings(contract["unauthorizedCommandKinds"]).includes(kind)) {
      finding(
        findings,
        "U1_CONTRACT_COMMAND_AUTHORIZATION",
        CONTRACT_FILENAME + ".authorizedCommandKinds." + kind,
        "A command kind cannot be authorized and unauthorized at once.",
      );
    }
  }

  const limits = readObject(contract, "limits");
  const assignments = readObject(contract, "publicBoundAssignments");
  exactValue(
    assignments,
    U1_REVIEWED_BOUND_ASSIGNMENTS,
    "U1_CONTRACT_BOUND_ASSIGNMENT",
    CONTRACT_FILENAME + ".publicBoundAssignments",
    findings,
  );
  for (const [field, limitKey] of Object.entries(assignments)) {
    if (typeof limitKey !== "string" || !(limitKey in limits)) {
      finding(
        findings,
        "U1_CONTRACT_BOUND_ASSIGNMENT",
        CONTRACT_FILENAME + ".publicBoundAssignments." + field,
        "Every bounded public field must name an existing limit.",
      );
    }
  }
  const draftCodePoints = readNumber(limits, "maxDraftCodePoints") ?? 0;
  if ((readNumber(limits, "maxDraftUtf8Bytes") ?? 0) !== draftCodePoints * 4) {
    finding(
      findings,
      "U1_CONTRACT_LIMITS",
      CONTRACT_FILENAME + ".limits.maxDraftUtf8Bytes",
      "The UTF-8 byte bound must be four times the code-point bound.",
    );
  }
  for (const key of ["maxPreviewTokens", "maxPreviewMeasures"]) {
    if ((readNumber(limits, key) ?? 0) * 2 !== draftCodePoints) {
      finding(
        findings,
        "U1_CONTRACT_LIMITS",
        CONTRACT_FILENAME + ".limits." + key,
        "Preview ceilings are derived from the two-code-point minimum token.",
      );
    }
  }
  if (
    (readNumber(readObject(contract, "pointerPolicy"), "dragThresholdCssPx")
      ?? 0) !== (readNumber(limits, "pointerDragThresholdCssPx") ?? -1)
  ) {
    finding(
      findings,
      "U1_CONTRACT_POINTER_POLICY",
      CONTRACT_FILENAME + ".pointerPolicy.dragThresholdCssPx",
      "The pointer policy and the limit table must state one threshold.",
    );
  }
  const pointer = readObject(contract, "pointerPolicy");
  if (
    readBoolean(pointer, "preventDefaultBeforeThreshold") !== false ||
    readBoolean(pointer, "preventDefaultAfterThreshold") !== true ||
    readBoolean(pointer, "pointerCaptureReleasedOnCancel") !== true ||
    readBoolean(pointer, "pointerCaptureReleasedOnUnmount") !== true ||
    readBoolean(pointer, "listenersMultipliedByDocumentMutation") !== false
  ) {
    finding(
      findings,
      "U1_CONTRACT_POINTER_POLICY",
      CONTRACT_FILENAME + ".pointerPolicy",
      "Touch activation may not call preventDefault before a real drag "
        + "threshold, and listeners may not multiply with document mutation.",
    );
  }
  const identity = readObject(contract, "identityPolicy");
  if (
    readText(identity, "chartKeys") !== "stable-domain-ids-only" ||
    readText(identity, "indexKeys") !== "forbidden"
  ) {
    finding(
      findings,
      "U1_CONTRACT_IDENTITY",
      CONTRACT_FILENAME + ".identityPolicy",
      "Chart nodes are keyed by stable identity; index keys stay forbidden.",
    );
  }
  exactValue(
    contract["deleteFocusRepairOrder"],
    ["next-event", "previous-event", "section-insertion-target"],
    "U1_CONTRACT_IDENTITY",
    CONTRACT_FILENAME + ".deleteFocusRepairOrder",
    findings,
  );
  exactValue(
    contract["focusPriority"],
    [
      "selection-focus-event",
      "non-chart-insertion-target",
      "first-inserted-structural-ref",
      "chart",
    ],
    "U1_CONTRACT_IDENTITY",
    CONTRACT_FILENAME + ".focusPriority",
    findings,
  );
  if (readText(contract, "restSynthesisPolicy") !== "forbidden-no-rest-model-in-v1") {
    finding(
      findings,
      "U1_CONTRACT_PLAN_AUTHORITY",
      CONTRACT_FILENAME + ".restSynthesisPolicy",
      "The first release synthesizes no hidden rests.",
    );
  }
}

function checkComponents(
  contract: JsonObject,
  findings: U1ContractFinding[],
): void {
  const components = objects(contract["components"]);
  if (components.length !== U1_REVIEWED_COMPONENT_COUNT) {
    finding(
      findings,
      "U1_CONTRACT_COMPONENT_INVENTORY",
      CONTRACT_FILENAME + ".components",
      "The component inventory is closed at 25 rows.",
    );
  }
  const names = new Set<string>();
  const surfaces = new Set<string>(U1_REVIEWED_SURFACES);
  components.forEach((component, index) => {
    const path = CONTRACT_FILENAME + ".components." + String(index);
    const expectedId = "U1-CMP-" + String(index + 1).padStart(3, "0");
    if (readText(component, "id") !== expectedId) {
      finding(
        findings,
        "U1_CONTRACT_COMPONENT_INVENTORY",
        path + ".id",
        "Component identities are contiguous and ordered.",
      );
    }
    const name = readText(component, "name");
    if (name === null || names.has(name)) {
      finding(
        findings,
        "U1_CONTRACT_DUPLICATE_ID",
        path + ".name",
        "Component names must be present and unique.",
      );
    } else {
      names.add(name);
    }
    if (!surfaces.has(readText(component, "surface") ?? "")) {
      finding(
        findings,
        "U1_CONTRACT_COMPONENT_INVENTORY",
        path + ".surface",
        "Component surface is outside the declared vocabulary.",
      );
    }
  });
}

function checkOperations(
  contract: JsonObject,
  findings: U1ContractFinding[],
): Map<string, JsonObject> {
  const operations = objects(contract["operations"]);
  const authorized = new Set(strings(contract["authorizedCommandKinds"]));
  const unauthorized = new Set(strings(contract["unauthorizedCommandKinds"]));
  const intents = new Set(strings(contract["authorizedEphemeralIntentKinds"]));
  const planKinds = new Set(strings(contract["authorizedEditPlanKinds"]));
  const surfaces = new Set(strings(contract["surfaces"]));
  const byId = new Map<string, JsonObject>();

  operations.forEach((operation, index) => {
    const path = CONTRACT_FILENAME + ".operations." + String(index);
    const expectedId = "U1-OP-" + String(index + 1).padStart(3, "0");
    const id = readText(operation, "id");
    if (id !== expectedId) {
      finding(
        findings,
        "U1_CONTRACT_OPERATION_INVENTORY",
        path + ".id",
        "Operation identities are contiguous and ordered.",
      );
    }
    if (id !== null) byId.set(id, operation);
    if (!surfaces.has(readText(operation, "surface") ?? "")) {
      finding(
        findings,
        "U1_CONTRACT_OPERATION_INVENTORY",
        path + ".surface",
        "Operation surface is outside the declared vocabulary.",
      );
    }
    const channel = readText(operation, "channel");
    const commandKind = readText(operation, "commandKind");
    const planKind = readText(operation, "planKind");
    const intentKind = readText(operation, "intentKind");
    const undoable = readBoolean(operation, "undoable");
    const alternative = readText(operation, "pointerAlternative");

    if (commandKind !== null && unauthorized.has(commandKind)) {
      finding(
        findings,
        "U1_CONTRACT_COMMAND_AUTHORIZATION",
        path + ".commandKind",
        "This command kind is outside the U1 surface.",
      );
    }
    if (channel === "document-command") {
      if (commandKind === null || !authorized.has(commandKind)) {
        finding(
          findings,
          "U1_CONTRACT_COMMAND_AUTHORIZATION",
          path + ".commandKind",
          "A document command must name an authorized A0 command kind.",
        );
      }
      if (intentKind !== null) {
        finding(
          findings,
          "U1_CONTRACT_CHANNEL_BINDING",
          path + ".intentKind",
          "A document command carries no ephemeral intent.",
        );
      }
      if (undoable !== true) {
        finding(
          findings,
          "U1_CONTRACT_CHANNEL_BINDING",
          path + ".undoable",
          "Every document command is undoable.",
        );
      }
    } else if (channel === "ephemeral-intent") {
      if (intentKind === null || !intents.has(intentKind)) {
        finding(
          findings,
          "U1_CONTRACT_CHANNEL_BINDING",
          path + ".intentKind",
          "An ephemeral operation must name an authorized intent kind.",
        );
      }
      if (commandKind !== null || planKind !== null || undoable !== false) {
        finding(
          findings,
          "U1_CONTRACT_CHANNEL_BINDING",
          path + ".channel",
          "An ephemeral operation carries no command, plan, or undo entry.",
        );
      }
    } else if (channel === "presentation-only") {
      if (
        commandKind !== null ||
        planKind !== null ||
        intentKind !== null ||
        undoable !== false
      ) {
        finding(
          findings,
          "U1_CONTRACT_CHANNEL_BINDING",
          path + ".channel",
          "A presentation-only operation reaches the application in no way.",
        );
      }
    } else {
      finding(
        findings,
        "U1_CONTRACT_CHANNEL_BINDING",
        path + ".channel",
        "Operation channel is outside the declared vocabulary.",
      );
    }

    if (commandKind === "apply-edit-plan") {
      if (planKind === null || !planKinds.has(planKind)) {
        finding(
          findings,
          "U1_CONTRACT_CHANNEL_BINDING",
          path + ".planKind",
          "An atomic edit command must name one of the five plan kinds.",
        );
      }
    } else if (planKind !== null) {
      finding(
        findings,
        "U1_CONTRACT_CHANNEL_BINDING",
        path + ".planKind",
        "Only apply-edit-plan carries a plan kind.",
      );
    }

    if (alternative !== "keyboard" && alternative !== "keyboard-and-menu") {
      finding(
        findings,
        "U1_CONTRACT_OPERATION_INVENTORY",
        path + ".pointerAlternative",
        "Every operation keeps a keyboard or menu alternative; drag-required "
          + "authoring is forbidden.",
      );
    }
  });

  const bindings = objects(contract["keyBindings"]);
  bindings.forEach((binding, index) => {
    const path = CONTRACT_FILENAME + ".keyBindings." + String(index);
    const operationId = readText(binding, "operationId");
    if (operationId === null || !byId.has(operationId)) {
      finding(
        findings,
        "U1_CONTRACT_KEY_BINDING",
        path + ".operationId",
        "A key binding must name a declared operation.",
      );
    }
    if ((readText(binding, "keys") ?? "").length === 0) {
      finding(
        findings,
        "U1_CONTRACT_KEY_BINDING",
        path + ".keys",
        "A key binding must name its keys.",
      );
    }
  });
  const bound = new Set(
    bindings
      .map((binding) => readText(binding, "operationId"))
      .filter((value): value is string => value !== null),
  );
  const accessKinds = new Set<string>(U1_REVIEWED_KEYBOARD_ACCESS_KINDS);
  for (const [id, operation] of byId) {
    const access = readText(operation, "keyboardAccess") ?? "";
    const path = CONTRACT_FILENAME + ".operations." + id + ".keyboardAccess";
    if (!accessKinds.has(access)) {
      finding(
        findings,
        "U1_CONTRACT_KEY_BINDING",
        path,
        "Every operation declares how it is reached from the keyboard.",
      );
      continue;
    }
    if (access === "shortcut" && !bound.has(id)) {
      finding(
        findings,
        "U1_CONTRACT_KEY_BINDING",
        path,
        "A shortcut operation must own at least one key binding.",
      );
    }
    if (
      access === "menu-item"
      && readText(operation, "pointerAlternative") !== "keyboard-and-menu"
    ) {
      finding(
        findings,
        "U1_CONTRACT_KEY_BINDING",
        path,
        "A menu-reached operation must offer the menu alternative.",
      );
    }
    if (access === "text-entry" && readText(operation, "channel") === null) {
      finding(
        findings,
        "U1_CONTRACT_KEY_BINDING",
        path,
        "A text-entry operation must still declare its channel.",
      );
    }
  }
  return byId;
}

function checkPlanAuthority(
  contract: JsonObject,
  findings: U1ContractFinding[],
): Map<string, JsonObject> {
  const rows = objects(contract["insertionPlanAuthority"]);
  const kinds = strings(contract["insertionPlanKinds"]);
  const byKind = new Map<string, JsonObject>();
  if (rows.length !== kinds.length) {
    finding(
      findings,
      "U1_CONTRACT_PLAN_AUTHORITY",
      CONTRACT_FILENAME + ".insertionPlanAuthority",
      "The plan authority must carry exactly one row per plan kind.",
    );
  }
  rows.forEach((row, index) => {
    const path = CONTRACT_FILENAME + ".insertionPlanAuthority." + String(index);
    const kind = readText(row, "kind");
    if (kind !== (kinds[index] ?? null)) {
      finding(
        findings,
        "U1_CONTRACT_PLAN_AUTHORITY",
        path + ".kind",
        "Plan authority rows follow the declared plan-kind order.",
      );
    }
    if (kind !== null) byKind.set(kind, row);
    const committable = readBoolean(row, "committableInV1");
    const blocked = readText(row, "blockedReason");
    if (committable === true && blocked !== null) {
      finding(
        findings,
        "U1_CONTRACT_PLAN_AUTHORITY",
        path + ".blockedReason",
        "A committable plan carries no blocked reason.",
      );
    }
    if (committable === false && blocked === null) {
      finding(
        findings,
        "U1_CONTRACT_PLAN_AUTHORITY",
        path + ".blockedReason",
        "A blocked plan must name its reason.",
      );
    }
    if (strings(row["resolutions"]).length === 0) {
      finding(
        findings,
        "U1_CONTRACT_PLAN_AUTHORITY",
        path + ".resolutions",
        "Every plan states at least one explicit resolution.",
      );
    }
  });

  const fillRows = objects(contract["measureFillAuthority"]);
  const fillKinds = strings(contract["measureFillKinds"]);
  fillRows.forEach((row, index) => {
    const path = CONTRACT_FILENAME + ".measureFillAuthority." + String(index);
    if (readText(row, "kind") !== (fillKinds[index] ?? null)) {
      finding(
        findings,
        "U1_CONTRACT_PLAN_AUTHORITY",
        path + ".kind",
        "Measure-fill rows follow the declared fill-kind order.",
      );
    }
    if (strings(row["resolutions"]).length === 0) {
      finding(
        findings,
        "U1_CONTRACT_PLAN_AUTHORITY",
        path + ".resolutions",
        "Every measure-fill state states at least one explicit resolution.",
      );
    }
  });
  return byKind;
}

function checkQuickEntryCases(
  contract: JsonObject,
  quick: JsonObject,
  planAuthority: Map<string, JsonObject>,
  findings: U1ContractFinding[],
): readonly JsonObject[] {
  const limits = readObject(contract, "limits");
  const statuses = new Set(strings(contract["quickEntryStatuses"]));
  const lanes = new Set(strings(contract["quickEntryLanes"]));
  const tokenStates = new Set(strings(contract["tokenStates"]));
  const cases = objects(quick["cases"]);

  /**
   * The corpus must state its total token projection, not just the per-case
   * rows. Without the statement, a case could drop its diagnostic rows and no
   * oracle would name the rule it broke.
   */
  const projection = readObject(
    readObject(quick, "classificationPolicy"),
    "tokenStateProjection",
  );
  for (const [key, required] of [
    ["parsedDraft", "one-valid-row-per-parsed-event-in-draft-order"],
    [
      "refusedDraft",
      "one-insertable-row-per-published-recoverable-chord-in-t0-ordinal-order,"
        + "-then-one-invalid-row-per-t0-diagnostic-in-t0-order",
    ],
    ["unparsedDraft", "no-rows"],
    ["truncation", "maxPreviewTokens"],
  ] as const) {
    if (readText(projection, key) === required) continue;
    finding(
      findings,
      "U1_CONTRACT_TOKEN_STATE",
      "quick-entry-cases.json.classificationPolicy.tokenStateProjection." + key,
      "The declared token projection is missing or restated.",
    );
  }

  cases.forEach((testCase, index) => {
    const path = "quick-entry-cases.json.cases." + String(index);
    const expected = readObject(testCase, "expected");
    const draftText = readText(testCase, "draftText") ?? "";
    if (readNumber(testCase, "draftCodePoints") !== countCodePoints(draftText)) {
      finding(
        findings,
        "U1_CONTRACT_DRAFT_BOUND",
        path + ".draftCodePoints",
        "The declared draft length differs from the exact code-point count.",
      );
    }
    if (!statuses.has(readText(expected, "status") ?? "")) {
      finding(
        findings,
        "U1_CONTRACT_TOKEN_STATE",
        path + ".expected.status",
        "Quick-entry status is outside the declared vocabulary.",
      );
    }
    const lane = readText(expected, "lane");
    if (lane !== null && !lanes.has(lane)) {
      finding(
        findings,
        "U1_CONTRACT_RECOVERY_LANE",
        path + ".expected.lane",
        "Quick-entry lane is outside the declared vocabulary.",
      );
    }
    for (const [tokenIndex, state] of strings(
      expected["tokenStates"],
    ).entries()) {
      if (!tokenStates.has(state)) {
        finding(
          findings,
          "U1_CONTRACT_TOKEN_STATE",
          path + ".expected.tokenStates." + String(tokenIndex),
          "Token state is outside the declared vocabulary.",
        );
      }
    }

    const meter = readObject(testCase, "meter");
    const capacity = meterCapacity(meter);
    const destination = readObject(testCase, "destination");
    const declared = rationalFromRecord(destination["measureCapacity"]);
    if (capacity === null || declared === null) {
      finding(
        findings,
        "U1_CONTRACT_MEASURE_ARITHMETIC",
        path + ".meter",
        "Meter and destination capacity must be exact positive rationals.",
      );
      return;
    }
    if (compareRational(capacity, declared) !== 0) {
      finding(
        findings,
        "U1_CONTRACT_MEASURE_ARITHMETIC",
        path + ".destination.measureCapacity",
        "Declared capacity differs from the recomputed exact meter capacity.",
      );
    }

    const t0 = readObject(testCase, "t0Result");
    if (readText(t0, "outcome") === "ok") {
      for (const [sectionIndex, section] of objects(
        t0["sections"],
      ).entries()) {
        for (const [measureIndex, measure] of objects(
          section["measures"],
        ).entries()) {
          const events = objects(measure["events"]);
          let total = ZERO;
          for (const event of events) {
            const duration = rationalFromRecord(event["duration"]);
            if (duration === null) {
              finding(
                findings,
                "U1_CONTRACT_MEASURE_ARITHMETIC",
                path + ".t0Result.sections." + String(sectionIndex)
                  + ".measures." + String(measureIndex),
                "Every draft event carries one exact positive duration.",
              );
              continue;
            }
            total = addRational(total, duration);
          }
          const target = events.length === 0 ? ZERO : capacity;
          if (compareRational(total, target) !== 0) {
            finding(
              findings,
              "U1_CONTRACT_MEASURE_ARITHMETIC",
              path + ".t0Result.sections." + String(sectionIndex)
                + ".measures." + String(measureIndex),
              "A successfully parsed measure holds exactly the bar capacity, "
                + "or no events at all.",
            );
          }
        }
      }
      const declaredTokens = strings(expected["tokenStates"]);
      const eventCount = objects(t0["sections"]).reduce(
        (total, section) =>
          total
          + objects(section["measures"]).reduce(
            (inner, measure) => inner + objects(measure["events"]).length,
            0,
          ),
        0,
      );
      if (declaredTokens.length !== eventCount) {
        finding(
          findings,
          "U1_CONTRACT_TOKEN_STATE",
          path + ".expected.tokenStates",
          "A successful draft shows exactly one token row per parsed event.",
        );
      }
      if (declaredTokens.some((state) => state !== "valid")) {
        finding(
          findings,
          "U1_CONTRACT_TOKEN_STATE",
          path + ".expected.tokenStates",
          "Every token of a successful draft is valid.",
        );
      }
      expectProjectedTokenStates(
        findings,
        path,
        limits,
        declaredTokens,
        Array.from({ length: eventCount }, () => "valid"),
      );
    }
    if (readText(t0, "outcome") === "failed") {
      const declaredTokens = strings(expected["tokenStates"]);
      const insertableCount = objects(t0["insertableChords"]).length;
      const insertableTokens = declaredTokens.filter(
        (state) => state === "insertable",
      ).length;
      if (insertableTokens !== insertableCount) {
        finding(
          findings,
          "U1_CONTRACT_TOKEN_STATE",
          path + ".expected.tokenStates",
          "Exactly the recoverable tokens are marked insertable.",
        );
      }
      if (declaredTokens.includes("valid")) {
        finding(
          findings,
          "U1_CONTRACT_TOKEN_STATE",
          path + ".expected.tokenStates",
          "A refused draft has no valid token rows.",
        );
      }
      expectProjectedTokenStates(findings, path, limits, declaredTokens, [
        ...objects(t0["insertableChords"]).map(() => "insertable"),
        ...strings(t0["diagnosticCodes"]).map(() => "invalid"),
      ]);
    }

    const oracle = classifyQuickEntry(testCase, limits);
    if (oracle === null) {
      finding(
        findings,
        "U1_CONTRACT_INSERTION_PLAN",
        path,
        "The case does not carry enough declared input to classify.",
      );
      return;
    }
    if (readText(expected, "status") !== oracle.status) {
      finding(
        findings,
        "U1_CONTRACT_INSERTION_PLAN",
        path + ".expected.status",
        "Declared status differs from the recomputed status.",
      );
    }
    if ((readText(expected, "lane") ?? null) !== oracle.lane) {
      finding(
        findings,
        "U1_CONTRACT_RECOVERY_LANE",
        path + ".expected.lane",
        "Declared lane differs from the recomputed lane.",
      );
    }
    if (
      (readText(expected, "preflightRefusal") ?? null)
      !== oracle.preflightRefusal
    ) {
      finding(
        findings,
        "U1_CONTRACT_DRAFT_BOUND",
        path + ".expected.preflightRefusal",
        "Declared preflight refusal differs from the recomputed refusal.",
      );
    }
    if ((readText(expected, "insertionPlan") ?? null) !== oracle.plan) {
      finding(
        findings,
        "U1_CONTRACT_INSERTION_PLAN",
        path + ".expected.insertionPlan",
        "Declared insertion plan differs from the recomputed classification.",
      );
    }
    if ((readText(expected, "placement") ?? null) !== oracle.placement) {
      finding(
        findings,
        "U1_CONTRACT_INSERTION_PLAN",
        path + ".expected.placement",
        "Declared placement differs from the recomputed placement.",
      );
    }
    if (readBoolean(expected, "canInsertPreview") !== oracle.canInsertPreview) {
      finding(
        findings,
        "U1_CONTRACT_PLAN_AUTHORITY",
        path + ".expected.canInsertPreview",
        "Whole-preview availability differs from the recomputed value.",
      );
    }
    if (
      readBoolean(expected, "canInsertOneChord") !== oracle.canInsertOneChord
    ) {
      finding(
        findings,
        "U1_CONTRACT_RECOVERY_LANE",
        path + ".expected.canInsertOneChord",
        "Single-chord recovery availability differs from the recomputed value.",
      );
    }

    const planKind = readText(expected, "insertionPlan");
    if (planKind !== null) {
      const authority = planAuthority.get(planKind);
      if (authority === undefined) {
        finding(
          findings,
          "U1_CONTRACT_PLAN_AUTHORITY",
          path + ".expected.insertionPlan",
          "The declared plan has no authority row.",
        );
      } else {
        if (
          readBoolean(expected, "committable")
          !== readBoolean(authority, "committableInV1")
        ) {
          finding(
            findings,
            "U1_CONTRACT_PLAN_AUTHORITY",
            path + ".expected.committable",
            "Committability must follow the plan authority.",
          );
        }
        if (
          (readText(expected, "blockedReason") ?? null)
          !== (readText(authority, "blockedReason") ?? null)
        ) {
          finding(
            findings,
            "U1_CONTRACT_PLAN_AUTHORITY",
            path + ".expected.blockedReason",
            "The blocked reason must follow the plan authority.",
          );
        }
        exactValue(
          expected["resolutions"],
          authority["resolutions"],
          "U1_CONTRACT_PLAN_AUTHORITY",
          path + ".expected.resolutions",
          findings,
        );
        const expectedPlanKind = readBoolean(authority, "committableInV1")
          ? "insert-fragment"
          : null;
        if ((readText(expected, "planKind") ?? null) !== expectedPlanKind) {
          finding(
            findings,
            "U1_CONTRACT_PLAN_AUTHORITY",
            path + ".expected.planKind",
            "Only a committable plan names an atomic plan kind.",
          );
        }
      }
    } else if (strings(expected["resolutions"]).length !== 0) {
      finding(
        findings,
        "U1_CONTRACT_PLAN_AUTHORITY",
        path + ".expected.resolutions",
        "A case with no plan offers no plan resolutions.",
      );
    }
  });
  return cases;
}

function checkOperationRows(
  contract: JsonObject,
  matrix: JsonObject,
  operations: Map<string, JsonObject>,
  findings: U1ContractFinding[],
): readonly JsonObject[] {
  const rows = objects(matrix["rows"]);
  const refusalCodes = new Set(strings(contract["refusalCodes"]));
  const unauthorized = new Set(strings(contract["unauthorizedCommandKinds"]));
  const authorized = new Set(strings(contract["authorizedCommandKinds"]));
  const policy = readObject(matrix, "dispatchPolicy");
  if (readNumber(policy, "commandsPerUserAction") !== 1) {
    finding(
      findings,
      "U1_CONTRACT_CHANNEL_BINDING",
      "edit-operation-matrix.json.dispatchPolicy.commandsPerUserAction",
      "One user action produces at most one application command.",
    );
  }
  for (const key of ["batchedCommands", "nestedPlans",
    "directDocumentMutation"]) {
    if (readText(policy, key) !== "forbidden") {
      finding(
        findings,
        "U1_CONTRACT_CHANNEL_BINDING",
        "edit-operation-matrix.json.dispatchPolicy." + key,
        "Batching, nesting, and direct document mutation stay forbidden.",
      );
    }
  }

  rows.forEach((row, index) => {
    const path = "edit-operation-matrix.json.rows." + String(index);
    checkReachability(row, path, findings);
    const operationId = readText(row, "operationId");
    const operation = operationId === null
      ? undefined
      : operations.get(operationId);
    if (operation === undefined) {
      finding(
        findings,
        "U1_CONTRACT_UNKNOWN_LINK",
        path + ".operationId",
        "The row names an operation absent from the inventory.",
      );
      return;
    }
    if (readText(row, "operation") !== readText(operation, "operation")) {
      finding(
        findings,
        "U1_CONTRACT_OPERATION_INVENTORY",
        path + ".operation",
        "The row's operation name differs from the inventory.",
      );
    }
    if (readText(row, "surface") !== readText(operation, "surface")) {
      finding(
        findings,
        "U1_CONTRACT_OPERATION_INVENTORY",
        path + ".surface",
        "The row's surface differs from the inventory.",
      );
    }
    const expected = readObject(row, "expected");
    const kind = readText(row, "kind");
    const rowCommandKind = readText(expected, "commandKind");
    if (rowCommandKind !== null && unauthorized.has(rowCommandKind)) {
      finding(
        findings,
        "U1_CONTRACT_COMMAND_AUTHORIZATION",
        path + ".expected.commandKind",
        "This command kind is outside the U1 surface.",
      );
    }
    if (
      rowCommandKind !== null
      && !authorized.has(rowCommandKind)
      && !unauthorized.has(rowCommandKind)
    ) {
      finding(
        findings,
        "U1_CONTRACT_COMMAND_AUTHORIZATION",
        path + ".expected.commandKind",
        "This command kind is not part of the live A0 tuple.",
      );
    }
    const commandCount = readNumber(expected, "commandCount") ?? 0;
    const intentCount = readNumber(expected, "intentCount") ?? 0;
    if (commandCount > 1) {
      finding(
        findings,
        "U1_CONTRACT_CHANNEL_BINDING",
        path + ".expected.commandCount",
        "One gesture dispatches at most one document command.",
      );
    }
    if (commandCount > 0 && intentCount > 0) {
      finding(
        findings,
        "U1_CONTRACT_CHANNEL_BINDING",
        path + ".expected.intentCount",
        "One gesture uses one channel.",
      );
    }
    if (
      (readBoolean(expected, "requiresExpectedDocumentId") ?? false)
      !== commandCount > 0
      || (readBoolean(expected, "requiresExpectedRevision") ?? false)
      !== commandCount > 0
    ) {
      finding(
        findings,
        "U1_CONTRACT_CHANNEL_BINDING",
        path + ".expected.requiresExpectedRevision",
        "Every dispatched document command carries the expected document "
          + "identity and revision.",
      );
    }
    if (commandCount === 0 && readBoolean(expected, "undoable") === true) {
      finding(
        findings,
        "U1_CONTRACT_CHANNEL_BINDING",
        path + ".expected.undoable",
        "Only a dispatched document command is undoable.",
      );
    }
    const refusal = readText(expected, "refusalCode");
    if (
      refusal !== null
      && refusal.startsWith("u1.")
      && !refusalCodes.has(refusal)
    ) {
      finding(
        findings,
        "U1_CONTRACT_REFUSAL_TOKEN",
        path + ".expected.refusalCode",
        "The row names a U1 refusal code outside the declared set.",
      );
    }
    if (refusal !== null && refusal.startsWith("u1.") && commandCount !== 0) {
      finding(
        findings,
        "U1_CONTRACT_REFUSAL_TOKEN",
        path + ".expected.refusalCode",
        "A U1 refusal is a pre-dispatch guard and never accompanies a "
          + "dispatched command.",
      );
    }
    if (kind === "positive" && refusal !== null) {
      finding(
        findings,
        "U1_CONTRACT_CASE_KIND",
        path + ".expected.refusalCode",
        "A positive row carries no refusal.",
      );
    }
    if (kind === "positive") {
      if (readText(expected, "channel") !== readText(operation, "channel")) {
        finding(
          findings,
          "U1_CONTRACT_CHANNEL_BINDING",
          path + ".expected.channel",
          "A positive row must use the inventory channel.",
        );
      }
      if (
        (readText(expected, "commandKind") ?? null)
        !== (readText(operation, "commandKind") ?? null)
        || (readText(expected, "planKind") ?? null)
        !== (readText(operation, "planKind") ?? null)
        || (readText(expected, "intentKind") ?? null)
        !== (readText(operation, "intentKind") ?? null)
      ) {
        finding(
          findings,
          "U1_CONTRACT_CHANNEL_BINDING",
          path + ".expected",
          "A positive row must bind the inventory command, plan, and intent.",
        );
      }
    }
  });
  return rows;
}

function checkInteractionCases(
  contract: JsonObject,
  matrix: JsonObject,
  findings: U1ContractFinding[],
): readonly JsonObject[] {
  const cases = objects(matrix["cases"]);
  const limits = readObject(contract, "limits");
  const policy = readObject(matrix, "listenerPolicy");
  for (const key of [
    "staticListenersPerChordCard",
    "staticListenersPerInsertionTarget",
    "staticListenersPerChartRegion",
    "transientDragListenersPerSession",
    "maxConcurrentDragSessions",
  ]) {
    if (readNumber(policy, key) !== readNumber(limits, key)) {
      finding(
        findings,
        "U1_CONTRACT_LISTENER_POLICY",
        "interaction-state-matrix.json.listenerPolicy." + key,
        "The listener policy must equal the declared limit.",
      );
    }
  }
  if (readBoolean(policy, "documentMutationRegistersListeners") !== false) {
    finding(
      findings,
      "U1_CONTRACT_LISTENER_POLICY",
      "interaction-state-matrix.json.listenerPolicy"
        + ".documentMutationRegistersListeners",
      "Listener counts may not grow with document mutation.",
    );
  }
  const viewports = objects(matrix["viewports"]);
  const required = [320, 390, 768, 1280, 1440];
  const widths = viewports.map((viewport) => readNumber(viewport, "width"));
  for (const width of required) {
    if (!widths.includes(width)) {
      finding(
        findings,
        "U1_CONTRACT_COUNT",
        "interaction-state-matrix.json.viewports",
        "The required viewport " + String(width) + " is missing.",
      );
    }
  }
  cases.forEach((testCase, index) => {
    const path = "interaction-state-matrix.json.cases." + String(index);
    checkReachability(testCase, path, findings);
    if ((readText(testCase, "given") ?? "").length === 0) {
      finding(
        findings,
        "U1_CONTRACT_COUNT",
        path + ".given",
        "Every interaction case states its given conditions.",
      );
    }
    if ((readText(testCase, "expected") ?? "").length === 0) {
      finding(
        findings,
        "U1_CONTRACT_COUNT",
        path + ".expected",
        "Every interaction case states its expected result.",
      );
    }
  });
  return cases;
}

function checkLedgers(
  contract: JsonObject,
  trace: JsonObject,
  provenance: JsonObject,
  allCases: ReadonlyMap<string, string>,
  findings: U1ContractFinding[],
): void {
  const declaredLaws = new Set(strings(contract["lawIds"]));
  const traces = objects(trace["traces"]);
  const authorities = objects(provenance["authorities"]);
  const traceIds = new Set<string>();
  const authorityIds = new Set<string>();

  traces.forEach((row, index) => {
    const path = "trace-ledger.json.traces." + String(index);
    const id = readText(row, "id");
    if (id === null || traceIds.has(id)) {
      finding(
        findings,
        "U1_CONTRACT_DUPLICATE_ID",
        path + ".id",
        "Trace identities must be present and unique.",
      );
    } else {
      traceIds.add(id);
    }
    if ((readText(row, "requirement") ?? "").length === 0) {
      finding(
        findings,
        "U1_CONTRACT_LAW_COVERAGE",
        path + ".requirement",
        "Every trace restates its parent requirement.",
      );
    }
    if (!(readText(row, "plannedEvidenceOwner") ?? "").startsWith("tests/")) {
      finding(
        findings,
        "U1_CONTRACT_LAW_COVERAGE",
        path + ".plannedEvidenceOwner",
        "Every trace names one planned evidence owner under tests/.",
      );
    }
    for (const lawId of strings(row["lawIds"])) {
      if (!declaredLaws.has(lawId)) {
        finding(
          findings,
          "U1_CONTRACT_UNKNOWN_LINK",
          path + ".lawIds",
          "The trace names an undeclared law: " + lawId + ".",
        );
      }
    }
    for (const caseId of strings(row["caseIds"])) {
      if (!allCases.has(caseId)) {
        finding(
          findings,
          "U1_CONTRACT_UNKNOWN_LINK",
          path + ".caseIds",
          "The trace names an unknown case: " + caseId + ".",
        );
      }
    }
    if (strings(row["caseIds"]).length === 0) {
      finding(
        findings,
        "U1_CONTRACT_LAW_COVERAGE",
        path + ".caseIds",
        "Every trace links at least one case.",
      );
    }
  });
  exactValue(
    [...traceIds].sort(),
    [...U1_REVIEWED_TRACE_IDS].sort(),
    "U1_CONTRACT_LAW_COVERAGE",
    "trace-ledger.json.traces",
    findings,
  );

  const classification = readObject(provenance, "classificationPolicy");
  for (const authorityClass of U1_REVIEWED_AUTHORITY_CLASSES) {
    if (typeof classification[authorityClass] !== "string") {
      finding(
        findings,
        "U1_CONTRACT_LAW_COVERAGE",
        "provenance-ledger.json.classificationPolicy." + authorityClass,
        "Every authority class needs a definition.",
      );
    }
  }
  authorities.forEach((row, index) => {
    const path = "provenance-ledger.json.authorities." + String(index);
    const id = readText(row, "id");
    if (id === null || authorityIds.has(id)) {
      finding(
        findings,
        "U1_CONTRACT_DUPLICATE_ID",
        path + ".id",
        "Authority identities must be present and unique.",
      );
    } else {
      authorityIds.add(id);
    }
    const authorityClass = readText(row, "authorityClass") ?? "";
    if (typeof classification[authorityClass] !== "string") {
      finding(
        findings,
        "U1_CONTRACT_UNKNOWN_LINK",
        path + ".authorityClass",
        "Authority class is outside the declared classification policy.",
      );
    }
    if ((readText(row, "sourceRef") ?? "").length === 0) {
      finding(
        findings,
        "U1_CONTRACT_LAW_COVERAGE",
        path + ".sourceRef",
        "Every authority names its source.",
      );
    }
    if (strings(row["caseIds"]).length === 0) {
      finding(
        findings,
        "U1_CONTRACT_LAW_COVERAGE",
        path + ".caseIds",
        "Every authority supports at least one case.",
      );
    }
    for (const caseId of strings(row["caseIds"])) {
      if (!allCases.has(caseId)) {
        finding(
          findings,
          "U1_CONTRACT_UNKNOWN_LINK",
          path + ".caseIds",
          "The authority names an unknown case: " + caseId + ".",
        );
      }
    }
    for (const linked of strings(row["traceIds"])) {
      if (!traceIds.has(linked)) {
        finding(
          findings,
          "U1_CONTRACT_UNKNOWN_LINK",
          path + ".traceIds",
          "The authority names an unknown trace: " + linked + ".",
        );
      }
    }
  });
  exactValue(
    [...authorityIds].sort(),
    [...U1_REVIEWED_AUTHORITY_IDS].sort(),
    "U1_CONTRACT_LAW_COVERAGE",
    "provenance-ledger.json.authorities",
    findings,
  );

  for (const row of traces) {
    const id = readText(row, "id");
    for (const authorityId of strings(row["authorityIds"])) {
      if (!authorityIds.has(authorityId)) {
        finding(
          findings,
          "U1_CONTRACT_UNKNOWN_LINK",
          "trace-ledger.json.traces." + String(id) + ".authorityIds",
          "The trace names an unknown authority: " + authorityId + ".",
        );
        continue;
      }
      const authority = authorities.find(
        (candidate) => readText(candidate, "id") === authorityId,
      );
      if (
        authority !== undefined
        && id !== null
        && !strings(authority["traceIds"]).includes(id)
      ) {
        finding(
          findings,
          "U1_CONTRACT_NONRECIPROCAL_LINK",
          "trace-ledger.json.traces." + id + ".authorityIds",
          "The authority " + authorityId + " does not link back to " + id + ".",
        );
      }
    }
  }

  const coverage = objects(trace["lawCoverage"]);
  const covered = new Set<string>();
  coverage.forEach((row, index) => {
    const path = "trace-ledger.json.lawCoverage." + String(index);
    const lawId = readText(row, "lawId");
    if (lawId === null || !declaredLaws.has(lawId)) {
      finding(
        findings,
        "U1_CONTRACT_UNKNOWN_LINK",
        path + ".lawId",
        "Law coverage names an undeclared law.",
      );
      return;
    }
    covered.add(lawId);
    if (strings(row["positiveCaseIds"]).length === 0) {
      finding(
        findings,
        "U1_CONTRACT_LAW_COVERAGE",
        path + ".positiveCaseIds",
        "Every law needs at least one positive case.",
      );
    }
    if (strings(row["negativeOrNearMissCaseIds"]).length === 0) {
      finding(
        findings,
        "U1_CONTRACT_LAW_COVERAGE",
        path + ".negativeOrNearMissCaseIds",
        "Every law needs at least one negative or near-miss case.",
      );
    }
    for (const caseId of [
      ...strings(row["positiveCaseIds"]),
      ...strings(row["negativeOrNearMissCaseIds"]),
    ]) {
      if (!allCases.has(caseId)) {
        finding(
          findings,
          "U1_CONTRACT_UNKNOWN_LINK",
          path,
          "Law coverage names an unknown case: " + caseId + ".",
        );
      }
    }
    for (const caseId of strings(row["positiveCaseIds"])) {
      if (allCases.get(caseId) !== "positive") {
        finding(
          findings,
          "U1_CONTRACT_CASE_KIND",
          path + ".positiveCaseIds",
          "Only positive cases may prove a law positively: " + caseId + ".",
        );
      }
    }
    for (const caseId of strings(row["negativeOrNearMissCaseIds"])) {
      if (allCases.get(caseId) === "positive") {
        finding(
          findings,
          "U1_CONTRACT_CASE_KIND",
          path + ".negativeOrNearMissCaseIds",
          "A positive case cannot be a negative witness: " + caseId + ".",
        );
      }
    }
  });
  for (const lawId of declaredLaws) {
    if (!covered.has(lawId)) {
      finding(
        findings,
        "U1_CONTRACT_LAW_COVERAGE",
        "trace-ledger.json.lawCoverage." + lawId,
        "Every declared law needs one coverage row.",
      );
    }
  }
}

function checkCaseLinks(
  contract: JsonObject,
  cases: readonly JsonObject[],
  source: string,
  traceIds: ReadonlySet<string>,
  authorityIds: ReadonlySet<string>,
  findings: U1ContractFinding[],
): void {
  const declaredLaws = new Set(strings(contract["lawIds"]));
  const families = new Set(strings(contract["coverageFamilies"]));
  cases.forEach((testCase, index) => {
    const path = source + "." + String(index);
    if (!families.has(readText(testCase, "kind") ?? "")) {
      finding(
        findings,
        "U1_CONTRACT_CASE_KIND",
        path + ".kind",
        "Case kind is outside the declared coverage families.",
      );
    }
    if (strings(testCase["lawIds"]).length === 0) {
      finding(
        findings,
        "U1_CONTRACT_LAW_COVERAGE",
        path + ".lawIds",
        "Every case names at least one law.",
      );
    }
    for (const lawId of strings(testCase["lawIds"])) {
      if (!declaredLaws.has(lawId)) {
        finding(
          findings,
          "U1_CONTRACT_UNKNOWN_LINK",
          path + ".lawIds",
          "The case names an undeclared law: " + lawId + ".",
        );
      }
    }
    for (const traceId of strings(testCase["traceIds"])) {
      if (!traceIds.has(traceId)) {
        finding(
          findings,
          "U1_CONTRACT_UNKNOWN_LINK",
          path + ".traceIds",
          "The case names an unknown trace: " + traceId + ".",
        );
      }
    }
    if (strings(testCase["traceIds"]).length === 0) {
      finding(
        findings,
        "U1_CONTRACT_NONRECIPROCAL_LINK",
        path + ".traceIds",
        "Every case links at least one trace.",
      );
    }
    for (const authorityId of strings(testCase["authorityIds"])) {
      if (!authorityIds.has(authorityId)) {
        finding(
          findings,
          "U1_CONTRACT_UNKNOWN_LINK",
          path + ".authorityIds",
          "The case names an unknown authority: " + authorityId + ".",
        );
      }
    }
    if (strings(testCase["authorityIds"]).length === 0) {
      finding(
        findings,
        "U1_CONTRACT_NONRECIPROCAL_LINK",
        path + ".authorityIds",
        "Every case names at least one authority.",
      );
    }
  });
}

function checkRefusalTokens(
  contract: JsonObject,
  roots: ReadonlyMap<string, JsonObject>,
  findings: U1ContractFinding[],
): void {
  const declared = new Set(strings(contract["refusalCodes"]));
  for (const [filename, root] of roots) {
    const source = JSON.stringify(root);
    for (const match of source.matchAll(REFUSAL_TOKEN_PATTERN)) {
      const token = match[1];
      if (token !== undefined && !declared.has(token)) {
        finding(
          findings,
          "U1_CONTRACT_REFUSAL_TOKEN",
          filename,
          "Undeclared U1 refusal token: " + token + ".",
        );
      }
    }
  }
}

function checkCounts(
  contract: JsonObject,
  quick: readonly JsonObject[],
  rows: readonly JsonObject[],
  interaction: readonly JsonObject[],
  trace: JsonObject,
  provenance: JsonObject,
  controls: JsonObject,
  findings: U1ContractFinding[],
): void {
  const recomputed = {
    authorities: objects(provenance["authorities"]).length,
    companions: strings(contract["companions"]).length,
    components: objects(contract["components"]).length,
    interactionCases: interaction.length,
    keyBindings: objects(contract["keyBindings"]).length,
    lawRows: strings(contract["lawIds"]).length,
    mutationControls: objects(controls["controls"]).length,
    operationRows: rows.length,
    operations: objects(contract["operations"]).length,
    quickEntryCases: quick.length,
    refusalCodes: strings(contract["refusalCodes"]).length,
    traces: objects(trace["traces"]).length,
    viewports: 5,
  };
  const declared = readObject(contract, "counts");
  const normalized: JsonObject = {};
  for (const key of Object.keys(recomputed).sort()) {
    normalized[key] = declared[key];
  }
  const expected: JsonObject = {};
  for (const key of Object.keys(recomputed).sort()) {
    expected[key] = recomputed[key as keyof typeof recomputed];
  }
  exactValue(
    normalized,
    expected,
    "U1_CONTRACT_COUNT",
    CONTRACT_FILENAME + ".counts",
    findings,
  );
}

/* ------------------------------------------------------------------ */
/* Oracle driver                                                        */
/* ------------------------------------------------------------------ */

function runOracles(
  roots: ReadonlyMap<string, JsonObject>,
): U1ContractFinding[] {
  const findings: U1ContractFinding[] = [];
  for (const filename of EXPECTED_FILES) {
    const root = roots.get(filename);
    if (root === undefined) {
      finding(
        findings,
        "U1_CONTRACT_FILE_MISSING",
        filename,
        "The fixture file is missing.",
      );
      continue;
    }
    checkFileShape(filename, root, findings);
  }
  const contract = roots.get(CONTRACT_FILENAME) ?? {};
  const quickRoot = roots.get("quick-entry-cases.json") ?? {};
  const operationRoot = roots.get("edit-operation-matrix.json") ?? {};
  const interactionRoot = roots.get("interaction-state-matrix.json") ?? {};
  const traceRoot = roots.get("trace-ledger.json") ?? {};
  const provenanceRoot = roots.get("provenance-ledger.json") ?? {};
  const controlsRoot = roots.get("mutation-controls.json") ?? {};

  checkManifest(contract, findings);
  checkComponents(contract, findings);
  const operations = checkOperations(contract, findings);
  const planAuthority = checkPlanAuthority(contract, findings);
  const quickCases = checkQuickEntryCases(
    contract,
    quickRoot,
    planAuthority,
    findings,
  );
  const operationRows = checkOperationRows(
    contract,
    operationRoot,
    operations,
    findings,
  );
  const interactionCases = checkInteractionCases(
    contract,
    interactionRoot,
    findings,
  );

  const allCases = new Map<string, string>();
  const register = (rows: readonly JsonObject[], source: string): void => {
    rows.forEach((row, index) => {
      const id = readText(row, "id");
      if (id === null) {
        finding(
          findings,
          "U1_CONTRACT_DUPLICATE_ID",
          source + "." + String(index),
          "Every case needs an identity.",
        );
        return;
      }
      if (allCases.has(id)) {
        finding(
          findings,
          "U1_CONTRACT_DUPLICATE_ID",
          source + "." + String(index),
          "Duplicate case identity: " + id + ".",
        );
        return;
      }
      allCases.set(id, readText(row, "kind") ?? "");
    });
  };
  register(quickCases, "quick-entry-cases.json.cases");
  register(operationRows, "edit-operation-matrix.json.rows");
  register(interactionCases, "interaction-state-matrix.json.cases");

  checkLedgers(contract, traceRoot, provenanceRoot, allCases, findings);

  const traceIds = new Set(
    objects(traceRoot["traces"])
      .map((row) => readText(row, "id"))
      .filter((value): value is string => value !== null),
  );
  const authorityIds = new Set(
    objects(provenanceRoot["authorities"])
      .map((row) => readText(row, "id"))
      .filter((value): value is string => value !== null),
  );
  checkCaseLinks(
    contract,
    quickCases,
    "quick-entry-cases.json.cases",
    traceIds,
    authorityIds,
    findings,
  );
  checkCaseLinks(
    contract,
    operationRows,
    "edit-operation-matrix.json.rows",
    traceIds,
    authorityIds,
    findings,
  );
  checkCaseLinks(
    contract,
    interactionCases,
    "interaction-state-matrix.json.cases",
    traceIds,
    authorityIds,
    findings,
  );

  checkRefusalTokens(contract, roots, findings);
  checkCounts(
    contract,
    quickCases,
    operationRows,
    interactionCases,
    traceRoot,
    provenanceRoot,
    controlsRoot,
    findings,
  );
  return findings;
}

/* ------------------------------------------------------------------ */
/* Mutation replay                                                      */
/* ------------------------------------------------------------------ */

function pointerSegments(pointer: string): readonly string[] {
  return pointer
    .split("/")
    .slice(1)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function resolvePointer(root: unknown, pointer: string): unknown {
  let cursor: unknown = root;
  for (const segment of pointerSegments(pointer)) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return undefined;
      }
      cursor = cursor[index];
      continue;
    }
    if (!isObject(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function applyPointer(root: unknown, pointer: string, value: unknown): boolean {
  const segments = pointerSegments(pointer);
  const last = segments.at(-1);
  if (last === undefined) return false;
  let cursor: unknown = root;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return false;
      }
      cursor = cursor[index];
      continue;
    }
    if (!isObject(cursor)) return false;
    cursor = cursor[segment];
  }
  if (Array.isArray(cursor)) {
    const index = Number(last);
    if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
      return false;
    }
    cursor[index] = value;
    return true;
  }
  if (!isObject(cursor) || !(last in cursor)) return false;
  cursor[last] = value;
  return true;
}

function replayMutationControls(
  roots: ReadonlyMap<string, JsonObject>,
  findings: U1ContractFinding[],
): number {
  const controlsRoot = roots.get("mutation-controls.json") ?? {};
  const controls = objects(controlsRoot["controls"]);
  const identities = new Set<string>();
  let replayed = 0;
  controls.forEach((control, index) => {
    const path = "mutation-controls.json.controls." + String(index);
    const id = readText(control, "id");
    if (id === null || identities.has(id)) {
      finding(
        findings,
        "U1_CONTRACT_DUPLICATE_ID",
        path + ".id",
        "Control identities must be present and unique.",
      );
      return;
    }
    identities.add(id);
    const materialization = readText(control, "materialization");
    const mutation = readObject(control, "mutation");
    const observation = readObject(control, "observation");
    const expectedCode = readText(control, "expectedFindingCode");
    const mutationPointer = readText(mutation, "jsonPointer");
    const observationPointer = readText(observation, "jsonPointer");
    if (
      materialization === null
      || !roots.has(materialization)
      || mutationPointer === null
      || observationPointer === null
      || expectedCode === null
    ) {
      finding(
        findings,
        "U1_CONTRACT_MUTATION_CONTROL",
        path,
        "A control names its file, both pointers, and its expected finding.",
      );
      return;
    }
    if (mutationPointer === observationPointer) {
      finding(
        findings,
        "U1_CONTRACT_MUTATION_CONTROL",
        path + ".observation.jsonPointer",
        "The observation pointer must differ from the mutation target.",
      );
      return;
    }
    if (readNumber(mutation, "exactChangedFieldCount") !== 1) {
      finding(
        findings,
        "U1_CONTRACT_MUTATION_CONTROL",
        path + ".mutation.exactChangedFieldCount",
        "Each control changes exactly one declared field.",
      );
    }
    const source = roots.get(materialization) ?? {};
    const before = resolvePointer(source, mutationPointer);
    if (stableJson(before) !== stableJson(mutation["from"])) {
      finding(
        findings,
        "U1_CONTRACT_MUTATION_CONTROL",
        path + ".mutation.from",
        "The declared baseline value is not present at the mutation pointer.",
      );
      return;
    }
    const observed = resolvePointer(source, observationPointer);
    if (stableJson(observed) !== stableJson(observation["unchangedValue"])) {
      finding(
        findings,
        "U1_CONTRACT_MUTATION_CONTROL",
        path + ".observation.unchangedValue",
        "The declared observation value is not present at its pointer.",
      );
      return;
    }
    const mutated = new Map<string, JsonObject>();
    for (const [filename, root] of roots) {
      mutated.set(
        filename,
        JSON.parse(JSON.stringify(root)) as JsonObject,
      );
    }
    const target = mutated.get(materialization);
    if (target === undefined || !applyPointer(target, mutationPointer, mutation["to"])) {
      finding(
        findings,
        "U1_CONTRACT_MUTATION_CONTROL",
        path + ".mutation.jsonPointer",
        "The mutation pointer could not be applied.",
      );
      return;
    }
    const killed = runOracles(mutated).some(
      (item) => item.code === expectedCode,
    );
    replayed += 1;
    if (!killed) {
      finding(
        findings,
        "U1_CONTRACT_MUTATION_CONTROL",
        path,
        "The mutant survived: no " + expectedCode + " finding was produced.",
      );
    }
  });
  return replayed;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                          */
/* ------------------------------------------------------------------ */

export async function validateU1Contract(
  fixtureRoot = resolve("tests/fixtures/editing"),
  options: Readonly<{ allowPendingFreeze?: boolean }> = {},
): Promise<U1ContractValidationReport> {
  const findings: U1ContractFinding[] = [];
  const roots = new Map<string, JsonObject>();
  const byteDigests = new Map<string, string>();

  let entries: readonly string[] = [];
  try {
    entries = (await readdir(fixtureRoot)).sort();
  } catch {
    finding(
      findings,
      "U1_CONTRACT_ROOT",
      fixtureRoot,
      "The fixture directory could not be read.",
    );
  }
  const expected = [...EXPECTED_FILES].sort();
  if (entries.length > 0 && stableJson(entries) !== stableJson(expected)) {
    finding(
      findings,
      "U1_CONTRACT_FILE_SET",
      fixtureRoot,
      "The fixture directory must contain exactly the seven declared files.",
    );
  }
  for (const filename of EXPECTED_FILES) {
    let source: string;
    try {
      source = await readFile(join(fixtureRoot, filename), "utf8");
    } catch {
      finding(
        findings,
        "U1_CONTRACT_FILE_MISSING",
        filename,
        "The fixture file could not be read.",
      );
      continue;
    }
    for (const duplicate of duplicateJsonKeys(source)) {
      finding(
        findings,
        "U1_CONTRACT_DUPLICATE_KEY",
        filename,
        "Duplicate JSON key: " + duplicate + ".",
      );
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(source);
    } catch {
      finding(
        findings,
        "U1_CONTRACT_JSON",
        filename,
        "The fixture file is not valid JSON.",
      );
      continue;
    }
    if (!isObject(decoded)) {
      finding(
        findings,
        "U1_CONTRACT_SCHEMA",
        filename,
        "The fixture root must be one JSON object.",
      );
      continue;
    }
    roots.set(filename, decoded);
    byteDigests.set(filename, digest(source));
  }

  const allowPending = options.allowPendingFreeze === true;
  const contract = roots.get(CONTRACT_FILENAME) ?? {};
  const declaredHashes = readObject(contract, "companionSha256");
  for (const filename of U1_REVIEWED_COMPANIONS) {
    const actual = byteDigests.get(filename);
    const declared = declaredHashes[filename];
    if (
      typeof declared !== "string"
      || !SHA256_PATTERN.test(declared)
      || declared !== actual
    ) {
      finding(
        findings,
        "U1_CONTRACT_COMPANION_HASH",
        CONTRACT_FILENAME + ".companionSha256." + filename,
        "The reviewed companion byte digest is missing, malformed, or stale.",
      );
    }
    const reviewed = U1_REVIEWED_BYTE_DIGESTS[filename];
    if (!allowPending && reviewed !== actual) {
      finding(
        findings,
        "U1_CONTRACT_COMPANION_HASH",
        "validate-u1-contract.ts.U1_REVIEWED_BYTE_DIGESTS." + filename,
        "The independently pinned companion byte digest is stale.",
      );
    }
  }
  const semantic = digest(
    stableJson(
      Object.fromEntries(
        [...EXPECTED_FILES].map((filename) => [
          filename,
          roots.get(filename) ?? null,
        ]),
      ),
    ),
  );
  if (!allowPending && semantic !== U1_REVIEWED_SEMANTIC_DIGEST) {
    finding(
      findings,
      "U1_CONTRACT_SEMANTIC_DIGEST",
      "validate-u1-contract.ts.U1_REVIEWED_SEMANTIC_DIGEST",
      "Packet semantics differ from the independently reviewed snapshot.",
    );
  }

  findings.push(...runOracles(roots));
  const replayed = replayMutationControls(roots, findings);

  findings.sort(findingOrder);
  const controlsRoot = roots.get("mutation-controls.json") ?? {};
  const traceRoot = roots.get("trace-ledger.json") ?? {};
  const provenanceRoot = roots.get("provenance-ledger.json") ?? {};
  return {
    counts: {
      authorities: objects(provenanceRoot["authorities"]).length,
      companions: U1_REVIEWED_COMPANIONS.length,
      components: objects(contract["components"]).length,
      interactionCases: objects(
        (roots.get("interaction-state-matrix.json") ?? {})["cases"],
      ).length,
      mutationControls: objects(controlsRoot["controls"]).length,
      mutationControlsReplayed: replayed,
      operationRows: objects(
        (roots.get("edit-operation-matrix.json") ?? {})["rows"],
      ).length,
      operations: objects(contract["operations"]).length,
      quickEntryCases: objects(
        (roots.get("quick-entry-cases.json") ?? {})["cases"],
      ).length,
      traces: objects(traceRoot["traces"]).length,
    },
    expertReviewClaim: readBoolean(contract, "expertReviewClaim") ?? false,
    findings,
    humanAcceptanceClaim: readBoolean(contract, "humanAcceptanceClaim") ?? false,
    outcome: findings.length === 0 ? "pass" : "fail",
    package: "U1",
    productionImplementationClaim:
      readBoolean(contract, "productionImplementationClaim") ?? false,
    reviewState: readText(contract, "reviewState") ?? "unknown",
    schema: "changes.validation.u1-contract.v1",
    uiCompletionClaim: readBoolean(contract, "uiCompletionClaim") ?? false,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const allowPendingFreeze = args.includes("--allow-pending-freeze");
  const positional = args.find((value) => !value.startsWith("--"));
  const report = await validateU1Contract(
    positional === undefined ? undefined : positional,
    { allowPendingFreeze },
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exitCode = 1;
}
