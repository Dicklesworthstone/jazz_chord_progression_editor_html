import {
  createInitialAppState,
  createStudioApplicationDependencies,
  createStudioControllerOverState,
  STUDIO_BLANK_DOCUMENT_IDS,
  STUDIO_INITIAL_PANELS,
  validateDocumentSemantics,
  type StudioBoundaryInput,
  type StudioController,
} from "../application";
import {
  decodeDocumentShape,
  makeBeatPosition,
  PROGRESSION_DOCUMENT_SCHEMA,
} from "../domain";

/**
 * Host for the reviewed U1 quick-entry corpus.
 *
 * Every scenario runs against the real studio controller over a document
 * published through the same F2 decode and F3 semantic boundary the product
 * uses. The blank studio chart is always 4/4, so this builds the chart the
 * case declares — including its meter — rather than narrowing the corpus to
 * the meters the built-in chart happens to carry. Nothing here classifies a
 * draft, chooses a placement, or computes a capacity: those answers come only
 * from the controller under test.
 */

export type U1ConformanceMeter = Readonly<{
  beatsPerBar: number;
  beatUnit: number;
}>;

export type U1ConformanceDestination = Readonly<{
  level: "measure" | "section" | "document";
  boundaryKind: string;
  measureEventCount: number;
  measureCompletion: string;
}>;

export type U1ConformanceStaleness = Readonly<{
  baseRevisionMatchesState: boolean;
  targetResolvesInDocument: boolean;
}>;

export type U1ConformanceRequest = Readonly<{
  meter: U1ConformanceMeter;
  draftText: string;
  destination: U1ConformanceDestination;
  staleness: U1ConformanceStaleness;
  /**
   * Section names the reference chart must already carry. The corpus states
   * the collision outcome rather than the document, so a case that expects a
   * warning names the section it collides with, and every other case gets
   * reference names no draft in the corpus uses.
   */
  existingSectionNames?: readonly string[];
}>;

/**
 * Exactly the fields the reviewed corpus states, read back from the real
 * controller. `insertionPlan` is null when no plan was claimed at all, which
 * is what the corpus records for an idle draft and for one a U1 preflight
 * guard refused before T0 was called.
 */
export type U1ConformanceObservation = Readonly<{
  /** What the real T0 did, so a scenario built on a different assumed
   * outcome is reported rather than silently compared against it. */
  t0Outcome: "ok" | "failed" | "not-called";
  status: "idle" | "invalid" | "ready";
  lane: "complete-draft" | "recovered-chord" | null;
  tokenStates: readonly string[];
  preflightRefusal: string | null;
  insertionPlan: string | null;
  committable: boolean;
  planKind: string | null;
  placement: string | null;
  blockedReason: string | null;
  resolutions: readonly string[];
  canInsertPreview: boolean;
  canInsertOneChord: boolean;
  sectionNameCollisionWarnings: readonly string[];
}>;

export type U1ConformanceRefusal = Readonly<{
  ok: false;
  reason: string;
}>;

export type U1ConformanceResult =
  | Readonly<{ ok: true; observation: U1ConformanceObservation }>
  | U1ConformanceRefusal;

const SECOND_SECTION_ID = "studio-section-b";
const SECOND_MEASURE_ID = "studio-measure-b-1";

function refuse(reason: string): U1ConformanceRefusal {
  return Object.freeze({ ok: false as const, reason });
}

/**
 * The blank studio chart at a declared meter, plus a second named section so
 * the corpus can aim at `before-section`, `after-section` and `section-end`
 * boundaries that a one-section chart cannot express.
 */
function candidateDocument(
  meter: U1ConformanceMeter,
  sectionNames: readonly string[],
): unknown {
  const firstName = sectionNames[0] ?? "Reference one";
  const secondName = sectionNames[1] ?? "Reference two";
  const emptyMeasure = (id: string) =>
    Object.freeze({
      id,
      events: Object.freeze([]),
      completion: Object.freeze({ kind: "empty" }),
    });
  return Object.freeze({
    schema: PROGRESSION_DOCUMENT_SCHEMA,
    id: STUDIO_BLANK_DOCUMENT_IDS.document,
    title: "U1 conformance chart",
    description: "",
    meter: Object.freeze({ ...meter }),
    tempoBpm: 120,
    key: null,
    sections: Object.freeze([
      Object.freeze({
        id: STUDIO_BLANK_DOCUMENT_IDS.section,
        name: firstName,
        annotation: "",
        keyOverride: null,
        voiceLeadingBoundary: "reset",
        measures: Object.freeze([
          emptyMeasure(STUDIO_BLANK_DOCUMENT_IDS.measure),
        ]),
      }),
      Object.freeze({
        id: SECOND_SECTION_ID,
        name: secondName,
        annotation: "",
        keyOverride: null,
        voiceLeadingBoundary: "reset",
        measures: Object.freeze([emptyMeasure(SECOND_MEASURE_ID)]),
      }),
    ]),
    playback: Object.freeze({
      instrumentId: "mellow-keys",
      masterVolume: 0.8,
      reverbAmount: 0.25,
      countInBars: 0,
    }),
  });
}

function controllerForMeter(
  meter: U1ConformanceMeter,
  sectionNames: readonly string[],
): StudioController | U1ConformanceRefusal {
  const decoded = decodeDocumentShape(candidateDocument(meter, sectionNames));
  if (!decoded.ok) return refuse("conformance-document-structure-refused");
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) return refuse("conformance-document-semantics-refused");
  const zeroBeat = makeBeatPosition({ numerator: 0, denominator: 1 });
  if (!zeroBeat.ok) return refuse("conformance-zero-beat-refused");
  const initialized = createInitialAppState({
    document: published.value,
    zeroBeat: zeroBeat.value,
    initialPanels: STUDIO_INITIAL_PANELS,
  });
  if (!initialized.ok) return refuse("conformance-initial-state-refused");
  let ticks = 0;
  return createStudioControllerOverState(
    initialized.state,
    createStudioApplicationDependencies(),
    {
      nowMs: () => {
        ticks += 2_000;
        return ticks;
      },
    },
  );
}

function firstMeasureId(studio: StudioController): string | null {
  return studio.getSnapshot().sections[0]?.measures[0]?.id ?? null;
}

function firstSectionId(studio: StudioController): string | null {
  return studio.getSnapshot().sections[0]?.id ?? null;
}

/**
 * Fill the first measure through real quick-entry publication, then, when the
 * case wants a measure that stays short, delete one chord with an explicit
 * declared reason. Both are ordinary product paths; no state is hand-built.
 */
function occupyDestination(
  studio: StudioController,
  destination: U1ConformanceDestination,
): U1ConformanceRefusal | null {
  if (destination.measureEventCount === 0) return null;
  const measureId = firstMeasureId(studio);
  if (measureId === null) return refuse("conformance-no-measure");
  const capacity = studio.getSnapshot().sections[0]?.measures[0];
  if (capacity === undefined) return refuse("conformance-no-measure");
  const seeded = studio.setQuickEntryDraft(
    "Dm9:2 G13:2",
    { kind: "measure-start", measureId },
    "ready",
    [],
  );
  if (!seeded.ok) return refuse(`conformance-seed-draft:${seeded.refusal.code}`);
  const applied = studio.applyQuickEntryPreview();
  if (!applied.ok) return refuse(`conformance-seed-apply:${applied.refusal.code}`);
  if (destination.measureCompletion === "complete") return null;

  const events = studio.getSnapshot().sections[0]?.measures[0]?.events ?? [];
  const second = events[1]?.id;
  if (second === undefined) return refuse("conformance-seed-missing-event");
  const selected = studio.selectEvent(second);
  if (!selected.ok) return refuse(`conformance-select:${selected.refusal.code}`);
  const deleted = studio.deleteSelection("Conformance short bar");
  if (!deleted.ok) return refuse(`conformance-delete:${deleted.refusal.code}`);
  return null;
}

function boundaryFor(
  studio: StudioController,
  destination: U1ConformanceDestination,
): StudioBoundaryInput | U1ConformanceRefusal {
  const snapshot = studio.getSnapshot();
  const measureId = firstMeasureId(studio);
  const sectionId = firstSectionId(studio);
  const eventId = snapshot.sections[0]?.measures[0]?.events[0]?.id ?? null;
  switch (destination.boundaryKind) {
    case "measure-start":
    case "measure-end":
      return measureId === null
        ? refuse("conformance-no-measure")
        : { kind: destination.boundaryKind, measureId };
    case "before-measure":
    case "after-measure":
      return measureId === null
        ? refuse("conformance-no-measure")
        : { kind: destination.boundaryKind, measureId };
    case "before-event":
    case "after-event":
      return eventId === null
        ? refuse("conformance-no-event")
        : { kind: destination.boundaryKind, eventId };
    case "section-start":
    case "section-end":
      return sectionId === null
        ? refuse("conformance-no-section")
        : { kind: destination.boundaryKind, sectionId };
    case "before-section":
    case "after-section":
      return sectionId === null
        ? refuse("conformance-no-section")
        : { kind: destination.boundaryKind, sectionId };
    case "document-start":
    case "document-end":
      return { kind: destination.boundaryKind };
    default:
      return refuse(`conformance-unknown-boundary:${destination.boundaryKind}`);
  }
}

/**
 * Run one reviewed scenario against the real controller and read back exactly
 * the facts the corpus states.
 */
export function observeU1QuickEntryCase(
  request: U1ConformanceRequest,
): U1ConformanceResult {
  const created = controllerForMeter(
    request.meter,
    request.existingSectionNames ?? [],
  );
  if ("ok" in created) return created;
  const studio = created;

  const occupied = occupyDestination(studio, request.destination);
  if (occupied !== null) return occupied;

  const boundary = boundaryFor(studio, request.destination);
  if ("ok" in boundary) return boundary;
  /**
   * A target that no longer resolves is a real vanished boundary: an event is
   * published and then deleted, so the stored id names nothing. Nothing here
   * fabricates an identity the document never had.
   */
  const target: StudioBoundaryInput = request.staleness.targetResolvesInDocument
    ? boundary
    : { eventId: "studio-event-conformance-vanished", kind: "before-event" };

  const preview = studio.previewChartText(request.draftText);
  const stored = studio.setQuickEntryDraft(
    request.draftText,
    target,
    preview.status,
    preview.issueCodes,
  );
  if (!stored.ok) {
    // A U1 preflight guard refused before T0 was ever called, so no lane,
    // no plan, and no ephemeral intent exist to observe.
    return Object.freeze({
      ok: true as const,
      observation: Object.freeze({
        t0Outcome: "not-called" as const,
        blockedReason: null,
        canInsertOneChord: false,
        canInsertPreview: false,
        committable: false,
        insertionPlan: null,
        lane: null,
        placement: null,
        planKind: null,
        preflightRefusal: stored.refusal.code,
        resolutions: Object.freeze([]),
        sectionNameCollisionWarnings: Object.freeze([]),
        status: preview.status,
        tokenStates: Object.freeze([]),
      }),
    });
  }

  /**
   * Staleness is produced the way the product meets it: a real document
   * command advances the revision the stored draft was written against. A0
   * clears the quick-entry draft with every publication, so what the caller
   * then observes is an idle field and no claimable plan — recorded here
   * exactly as observed rather than reshaped into the scenario's wording.
   */
  if (!request.staleness.baseRevisionMatchesState) {
    const sectionId = firstSectionId(studio);
    if (sectionId === null) return refuse("conformance-no-section");
    const advanced = studio.insertMeasure(sectionId, null);
    if (!advanced.ok) return refuse(`conformance-advance:${advanced.refusal.code}`);
  }

  const draft = studio.getSnapshot().quickEntry;
  const plan = studio.previewInsertionPlan();
  const preview2 = studio.previewQuickEntryDraft();
  const recoverable = preview2.tokens.some(
    (token) => token.state === "insertable" && token.blockedReason === null,
  );
  /**
   * What the caller can still claim after the chart moved. The apply path is
   * exercised rather than assumed, so the recorded refusal is the real one.
   */
  const claim = request.staleness.baseRevisionMatchesState
    ? null
    : studio.applyQuickEntryPreview();

  return Object.freeze({
    ok: true as const,
    observation: Object.freeze({
      t0Outcome:
        draft.text.length === 0
          ? ("not-called" as const)
          : draft.status === "ready"
            ? ("ok" as const)
            : ("failed" as const),
      blockedReason: plan.blockedReason,
      canInsertOneChord: recoverable,
      canInsertPreview: plan.committable,
      committable: plan.committable,
      insertionPlan: plan.statement === "no-draft" ? null : plan.statement,
      lane: preview2.lane,
      placement: plan.placement,
      planKind: plan.planKind,
      preflightRefusal:
        claim === null || claim.ok ? null : claim.refusal.code,
      resolutions: plan.resolutions,
      sectionNameCollisionWarnings: preview2.sectionNameCollisionWarnings,
      status: draft.status,
      tokenStates: preview2.tokens.map((token) => token.state),
    }),
  });
}
