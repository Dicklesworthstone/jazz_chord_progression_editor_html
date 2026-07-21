import publicationFixtureValue from "../fixtures/publication/document-cases.json";
import limitFixtureValue from "../fixtures/playback-plan/limit-cases.json";
import loopFixtureValue from "../fixtures/playback-plan/loop-cases.json";
import realizationFixtureValue from "../fixtures/playback-plan/realization-cases.json";
import sourceCatalogValue from "../fixtures/playback-plan/source-catalog.json";
import timelineFixtureValue from "../fixtures/playback-plan/timeline-cases.json";

import {
  validateDocumentSemantics,
} from "../../src/application";
import {
  decodeDocumentShape,
  makeAutoVoicing,
  makeBeatPosition,
  makeBeatRange,
  type AutoVoicing,
  type BeatRange,
  type ChordEvent,
  type ChordEventId,
  type ChordSpec,
  type FrozenVoicing,
  type ManualVoicing,
  type SpelledPitch,
  type ValidatedDocument,
  type Voicing,
} from "../../src/domain";
import {
  materializeF3Input,
  requireF3Array,
  requireF3Record,
  stableF3Json,
  type F3FixturePath,
  type F3FixtureRecord,
} from "../../src/test-support/f3-publication-materializer";
import {
  PLAYBACK_ARTICULATION_POLICY_ID,
  PLAYBACK_ARTICULATION_POLICY_VERSION,
  PLAYBACK_LOOP_POLICY_ID,
  PLAYBACK_LOOP_POLICY_VERSION,
  PLAYBACK_PLAN_COMPILER_ID,
  PLAYBACK_PLAN_COMPILER_VERSION,
  PLAYBACK_PLAN_REALIZATION_SCHEMA,
  PLAYBACK_PLAN_REQUEST_SCHEMA,
  PLAYBACK_REALIZATION_BINDING_POLICY_ID,
  PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
  PLAYBACK_VELOCITY_POLICY_ID,
  PLAYBACK_VELOCITY_POLICY_VERSION,
  type CompilePlaybackPlanRequest,
  type GeneratedPlaybackRealizationBinding,
  type PlaybackRealizationBinding,
} from "../../src/playback";
import {
  VOICING_REQUEST_SCHEMA,
  parseChordSymbol,
  realizeVoicing,
  resolveChord,
  type AutoVoicingRequest,
  type StoredVoicingBypass,
  type StoredVoicingRequest,
  type VoicingCandidate,
  type VoicingFailure,
} from "../../src/theory";
import {
  buildV0AutoCandidateRequest,
  findV0CandidateWithExpectedVoices,
  v0CandidateCase,
  v0DegreeToken,
  type V0CandidateSuccessExpectation,
} from "./v0-voicing-fixture";

export type P0BeatRecipe = Readonly<{
  numerator: number;
  denominator: number;
}>;

export type P0MeterRecipe = Readonly<{
  beatsPerBar: number;
  beatUnit: number;
}>;

export type P0MeasureCompletionRecipe =
  | Readonly<{ kind: "complete" | "empty" }>
  | Readonly<{
      kind: "pickup" | "incomplete";
      expectedDuration: P0BeatRecipe;
      reason: string;
    }>;

export type P0EventRecipe = Readonly<{
  eventId: string;
  duration: P0BeatRecipe;
  sourceRef: string;
}>;

export type P0MeasureRecipe = Readonly<{
  measureId: string;
  completion: P0MeasureCompletionRecipe;
  events: readonly P0EventRecipe[];
}>;

export type P0SectionRecipe = Readonly<{
  sectionId: string;
  voiceLeadingBoundary: "continue" | "reset";
  measures: readonly P0MeasureRecipe[];
}>;

export type P0SingleEventRecipe = P0EventRecipe &
  Readonly<{
    sectionId: string;
    measureId: string;
    completion: P0MeasureCompletionRecipe;
  }>;

export type P0DocumentRecipe = Readonly<{
  documentId: string;
  tempoBpm: number;
  meter: P0MeterRecipe;
  sections?: readonly P0SectionRecipe[];
  singleEvent?: P0SingleEventRecipe;
  loop?: P0LoopRecipe | null;
}>;

export type P0LoopRecipe = Readonly<{
  start: P0BeatRecipe;
  end: P0BeatRecipe;
  brandClaim?: string;
  upstreamConstructorBypassed?: boolean;
}>;

type P0GeneratedCandidateSeed = Readonly<{
  id: string;
  candidateFixtureRef: string;
  schema: VoicingCandidate["schema"];
  engineId: VoicingCandidate["engineId"];
  engineVersion: VoicingCandidate["engineVersion"];
  family: VoicingCandidate["family"];
  realizationId: VoicingCandidate["realizationId"];
  voices: VoicingCandidate["voices"];
  pitches: VoicingCandidate["pitches"];
}>;

type P0GeneratedSource = Readonly<{
  id: string;
  description: string;
  chord: Extract<ChordSpec, { readonly kind: "parsed" }>;
  voicing: AutoVoicing;
  bindingKind: "generated";
  autoRequestSeed: Readonly<{
    schema: AutoVoicingRequest["schema"];
    kind: "auto";
    resolvedFixtureRef: string;
    resolvedSourceMustEqualChord: true;
    realizationId: AutoVoicingRequest["realizationId"];
    policyRef: "voicing";
    quartalContext: AutoVoicingRequest["quartalContext"];
  }>;
  candidateSeed: P0GeneratedCandidateSeed;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

type P0StoredSource = Readonly<{
  id: string;
  description: string;
  chord: ChordSpec;
  voicing: ManualVoicing | FrozenVoicing;
  bindingKind: "stored";
  storedBypassSeed: Readonly<{
    schema: StoredVoicingBypass["schema"];
    kind: "stored-bypass";
    voicingRef: "voicing";
    candidateGenerationPerformed: false;
    rawCandidateCount: 0;
    retainedCandidateCount: 0;
  }>;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

export type P0SourceRecord = P0GeneratedSource | P0StoredSource;

type P0SourceCatalogFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  status: string;
  productionOutputUsed: false;
  expectedValuesGenerated: false;
  materializationPolicy: Readonly<Record<string, string>>;
  sources: readonly P0SourceRecord[];
}>;

export type P0TimelineCaseRecipe = Readonly<{
  id: string;
  description: string;
  documentRecipe?: P0DocumentRecipe;
  pairedDocumentRecipes?: readonly [P0DocumentRecipe, P0DocumentRecipe];
  expectedPlan?: Readonly<Record<string, unknown>>;
  expectedRelation?: Readonly<Record<string, unknown>>;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

type P0TimelineFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  status: string;
  productionOutputUsed: false;
  expectedValuesGenerated: false;
  sourceCatalog: string;
  projectionPolicy: Readonly<Record<string, unknown>>;
  cases: readonly P0TimelineCaseRecipe[];
}>;

export type P0LoopCaseRecipe = Readonly<{
  id: string;
  description: string;
  loop: P0LoopRecipe | null;
  expected: Readonly<Record<string, unknown>>;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

type P0LoopFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  status: string;
  productionOutputUsed: false;
  expectedValuesGenerated: false;
  sourceCatalog: string;
  baseDocumentRecipe: P0DocumentRecipe;
  sourceTimeline: readonly Readonly<Record<string, unknown>>[];
  emissionExpansionPolicy: Readonly<Record<string, unknown>>;
  commonExpectedPlan: Readonly<Record<string, unknown>>;
  cases: readonly P0LoopCaseRecipe[];
}>;

export type P0RealizationMutation = Readonly<{
  op: string;
  path?: F3FixturePath;
  mapPath?: F3FixturePath;
  value?: unknown;
  length?: number;
  key?: string;
  bindingFromEvent?: string;
  replaceBindingEventId?: string;
  sourceBeforeDeletion?: boolean;
  sourceRef?: string;
  candidateSeedRef?: string;
  candidateFixtureRef?: string;
  preserveManualSourceSnapshot?: boolean;
  voicingFailureFixtureRef?: string;
  voicingFailureProjection?: Readonly<{
    refusalCode: string;
    termination: string;
  }>;
}>;

export type P0RealizationCaseRecipe = Readonly<{
  id: string;
  description: string;
  sourceRef?: string;
  baseSourceRef?: string;
  mutations?: readonly P0RealizationMutation[];
  expected: Readonly<Record<string, unknown>>;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

type P0RealizationFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  status: string;
  productionOutputUsed: false;
  expectedValuesGenerated: false;
  sourceCatalog: string;
  baseRecipe: P0DocumentRecipe;
  mutationProtocol: Readonly<Record<string, string>>;
  cases: readonly P0RealizationCaseRecipe[];
}>;

type P0LimitCaseCommon<
  Id extends string,
  Expected extends Readonly<Record<string, unknown>>,
> = Readonly<{
  id: Id;
  description: string;
  expected: Expected;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

export type P0LimitMaxEventsRecipe = Readonly<{
  documentId: string;
  meter: P0MeterRecipe;
  tempoBpm: number;
  sectionCount: 1;
  measuresPerSection: number;
  eventsPerMeasure: number;
  eventDuration: P0BeatRecipe;
  eventCount: number;
  eventIdPattern: string;
  source: Readonly<{
    kind: "stored-manual";
    chordRef: string;
    pitchCount: number;
    pitches: readonly SpelledPitch[];
  }>;
  bindingCount: number;
  loop: null;
}>;

export type P0LimitMaxMeasuresRecipe = Readonly<{
  documentId: string;
  meter: P0MeterRecipe;
  tempoBpm: number;
  sectionCount: number;
  measuresPerSection: number;
  allMeasures: Readonly<{
    completion: Readonly<{ kind: "empty" }>;
    events: readonly [];
  }>;
  loop: null;
}>;

export type P0LimitMaxTimeRecipe = Readonly<{
  documentId: string;
  meter: P0MeterRecipe;
  tempoBpm: number;
  emptyMeasureCount: number;
  distribution: Readonly<{
    fullSections: number;
    measuresPerFullSection: number;
    finalSectionMeasures: number;
  }>;
  loop: null;
}>;

export type P0LimitTimelinePlusOneRecipe = Readonly<{
  baseRef: "P0-LIMIT-STRUCT-003";
  appendMeasure: Readonly<{
    sectionIndex: number;
    measureIndex: number;
    measureId: string;
    completion: P0MeasureCompletionRecipe;
    events: readonly [P0EventRecipe];
  }>;
  realizedVoicings: "deliberately-empty-to-prove-precedence";
}>;

export type P0LimitBindingPlusOneRecipe = Readonly<{
  baseRef: "P0-LIMIT-STRUCT-001";
  appendBinding: Readonly<{
    eventId: string;
    bindingRef: string;
  }>;
}>;

export type P0LimitMaxEventsExpected = Readonly<{
  ok: true;
  eventCount: number;
  outputPitchCount: number;
  totalBeats: P0BeatRecipe;
  totalTicks: number;
  selectedEvidence: Readonly<{
    eventsVisited: number;
    bindingsVisited: number;
    bindingLookups: number;
    tickProjections: number;
    gateCalculations: number;
    pitchRecordsCopied: number;
    eventsProduced: number;
    peakSourceEventIdentityRecords: number;
    peakBindingRecords: number;
    peakOutputEventRecords: number;
    peakOutputPitchRecords: number;
    peakTrackedRecords: number;
    termination: "complete";
  }>;
}>;

export type P0LimitMaxMeasuresExpected = Readonly<{
  ok: true;
  events: readonly [];
  totalBeats: P0BeatRecipe;
  totalTicks: number;
  selectedEvidence: Readonly<{
    sectionsVisited: number;
    measuresVisited: number;
    eventsVisited: number;
    bindingsVisited: number;
    bindingLookups: number;
    exactBeatOperations: number;
    tickProjections: number;
    loopIntersectionChecks: number;
    gateCalculations: number;
    pitchRecordsCopied: number;
    eventsProduced: number;
    termination: "complete";
  }>;
}>;

export type P0LimitMaxTimeExpected = Readonly<{
  ok: true;
  events: readonly [];
  totalBeats: P0BeatRecipe;
  totalTicks: number;
  termination: "complete";
}>;

export type P0LimitTimelinePlusOneExpected = Readonly<{
  ok: false;
  code: "playback.timeline_total_exceeded";
  path: F3FixturePath;
  measureId: string;
  maximumQuarterNoteBeats: number;
  termination: "timeline-invalid";
  partialResult: false;
  missingBindingDidNotWin: true;
}>;

export type P0LimitMaxBindingsExpected = Readonly<{
  bindingCount: number;
  bindingPreflightAccepted: true;
}>;

export type P0LimitBindingPlusOneExpected = Readonly<{
  ok: false;
  code: "playback.realization_binding_limit";
  path: F3FixturePath;
  received: number;
  maximum: number;
  termination: "realization-invalid";
  partialResult: false;
}>;

export type P0LimitStructuralCaseRecipe =
  | (P0LimitCaseCommon<
      "P0-LIMIT-STRUCT-001",
      P0LimitMaxEventsExpected
    > & Readonly<{ recipe: P0LimitMaxEventsRecipe }>)
  | (P0LimitCaseCommon<
      "P0-LIMIT-STRUCT-002",
      P0LimitMaxMeasuresExpected
    > & Readonly<{ recipe: P0LimitMaxMeasuresRecipe }>)
  | (P0LimitCaseCommon<
      "P0-LIMIT-STRUCT-003",
      P0LimitMaxTimeExpected
    > & Readonly<{ recipe: P0LimitMaxTimeRecipe }>)
  | (P0LimitCaseCommon<
      "P0-LIMIT-STRUCT-004",
      P0LimitTimelinePlusOneExpected
    > & Readonly<{ recipe: P0LimitTimelinePlusOneRecipe }>)
  | (P0LimitCaseCommon<
      "P0-LIMIT-STRUCT-005",
      P0LimitMaxBindingsExpected
    > & Readonly<{ recipeRef: "P0-LIMIT-STRUCT-001" }>)
  | (P0LimitCaseCommon<
      "P0-LIMIT-STRUCT-006",
      P0LimitBindingPlusOneExpected
    > & Readonly<{ recipe: P0LimitBindingPlusOneRecipe }>);

type P0LimitFixture = Readonly<{
  schema: string;
  fixtureVersion: string;
  status: string;
  productionOutputUsed: false;
  expectedValuesGenerated: false;
  limitPolicy: Readonly<Record<string, string>>;
  limits: Readonly<Record<string, unknown>>;
  structuralCases: readonly P0LimitStructuralCaseRecipe[];
  counterBoundaries: readonly Readonly<Record<string, unknown>>[];
  counterPlusOneCommonExpectation: Readonly<Record<string, unknown>>;
  traceIds: readonly string[];
  authorityIds: readonly string[];
}>;

export const P0_SOURCE_CATALOG =
  sourceCatalogValue as unknown as P0SourceCatalogFixture;
export const P0_TIMELINE_FIXTURE =
  timelineFixtureValue as unknown as P0TimelineFixture;
export const P0_TIMELINE_CASES = P0_TIMELINE_FIXTURE.cases;
export const P0_LOOP_FIXTURE = loopFixtureValue as unknown as P0LoopFixture;
export const P0_LOOP_CASES = P0_LOOP_FIXTURE.cases;
export const P0_REALIZATION_FIXTURE =
  realizationFixtureValue as unknown as P0RealizationFixture;
export const P0_REALIZATION_CASES = P0_REALIZATION_FIXTURE.cases;
export const P0_LIMIT_FIXTURE = limitFixtureValue as unknown as P0LimitFixture;
export const P0_LIMIT_STRUCTURAL_CASES = P0_LIMIT_FIXTURE.structuralCases;

function fixtureFailure(
  fixtureId: string,
  phase: string,
  detail: string,
): never {
  throw new Error(`P0_TEST_FIXTURE:${fixtureId}:${phase}:${detail}`);
}

function clone<Value>(value: Value): Value {
  return structuredClone(value);
}

function sameFixtureValue(left: unknown, right: unknown): boolean {
  return stableF3Json(left) === stableF3Json(right);
}

export function p0Source(sourceRef: string): P0SourceRecord {
  const source = P0_SOURCE_CATALOG.sources.find(({ id }) => id === sourceRef);
  if (source === undefined) {
    fixtureFailure(sourceRef, "source", "missing-source-ref");
  }
  return source;
}

export function p0TimelineCase(caseId: string): P0TimelineCaseRecipe {
  const recipe = P0_TIMELINE_CASES.find(({ id }) => id === caseId);
  if (recipe === undefined) fixtureFailure(caseId, "lookup", "timeline-case");
  return recipe;
}

export function p0LoopCase(caseId: string): P0LoopCaseRecipe {
  const recipe = P0_LOOP_CASES.find(({ id }) => id === caseId);
  if (recipe === undefined) fixtureFailure(caseId, "lookup", "loop-case");
  return recipe;
}

export function p0RealizationCase(caseId: string): P0RealizationCaseRecipe {
  const recipe = P0_REALIZATION_CASES.find(({ id }) => id === caseId);
  if (recipe === undefined) {
    fixtureFailure(caseId, "lookup", "realization-case");
  }
  return recipe;
}

export type P0LimitStructuralCaseId = P0LimitStructuralCaseRecipe["id"];

export function p0LimitStructuralCase<Id extends P0LimitStructuralCaseId>(
  caseId: Id,
): Extract<P0LimitStructuralCaseRecipe, Readonly<{ id: Id }>> {
  const recipe = P0_LIMIT_STRUCTURAL_CASES.find(({ id }) => id === caseId);
  if (recipe === undefined) {
    fixtureFailure(caseId, "lookup", "limit-structural-case");
  }
  return recipe as Extract<
    P0LimitStructuralCaseRecipe,
    Readonly<{ id: Id }>
  >;
}

function documentSections(recipe: P0DocumentRecipe): readonly P0SectionRecipe[] {
  if (recipe.sections !== undefined && recipe.singleEvent !== undefined) {
    return fixtureFailure(recipe.documentId, "document", "two-section-shapes");
  }
  if (recipe.sections !== undefined) return recipe.sections;
  if (recipe.singleEvent === undefined) {
    return fixtureFailure(recipe.documentId, "document", "missing-sections");
  }
  return [
    {
      sectionId: recipe.singleEvent.sectionId,
      voiceLeadingBoundary: "continue",
      measures: [
        {
          measureId: recipe.singleEvent.measureId,
          completion: recipe.singleEvent.completion,
          events: [recipe.singleEvent],
        },
      ],
    },
  ];
}

function materializeRawEvent(recipe: P0EventRecipe): F3FixtureRecord {
  const source = p0Source(recipe.sourceRef);
  return {
    id: recipe.eventId,
    duration: clone(recipe.duration),
    annotation: "",
    chord: clone(source.chord),
    voicing: clone(source.voicing),
  };
}

function materializeRawSections(
  recipe: P0DocumentRecipe,
): readonly F3FixtureRecord[] {
  return documentSections(recipe).map((section, sectionIndex) => ({
    id: section.sectionId,
    name: `P0 ${String(sectionIndex + 1)}`,
    annotation: "",
    keyOverride: null,
    voiceLeadingBoundary: section.voiceLeadingBoundary,
    measures: section.measures.map((measure) => ({
      id: measure.measureId,
      events: measure.events.map(materializeRawEvent),
      completion: clone(measure.completion),
    })),
  }));
}

export function materializeP0DocumentCandidate(
  recipe: P0DocumentRecipe,
): F3FixtureRecord {
  const root = materializeF3Input(publicationFixtureValue, {
    template: "representativeParsedAuto",
    operations: [],
  });
  root["id"] = recipe.documentId;
  root["title"] = `P0 fixture ${recipe.documentId}`;
  root["description"] = "";
  root["meter"] = clone(recipe.meter);
  root["tempoBpm"] = recipe.tempoBpm;
  root["sections"] = materializeRawSections(recipe);
  return root;
}

export type P0DocumentMaterialization = Readonly<{
  document: ValidatedDocument;
  sourceByEventId: ReadonlyMap<ChordEventId, P0SourceRecord>;
  sourceRefByEventId: ReadonlyMap<ChordEventId, string>;
}>;

function recipeEvents(recipe: P0DocumentRecipe): readonly P0EventRecipe[] {
  return documentSections(recipe).flatMap((section) =>
    section.measures.flatMap((measure) => measure.events)
  );
}

function publishedEvents(document: ValidatedDocument): readonly ChordEvent[] {
  return document.sections.flatMap((section) =>
    section.measures.flatMap((measure) => measure.events)
  );
}

/**
 * Publishes a fresh document through the real F2 decoder and F3 semantic gate.
 * This helper never casts or manufactures the opaque ValidatedDocument brand.
 */
export function materializeP0DocumentRecipe(
  recipe: P0DocumentRecipe,
): P0DocumentMaterialization {
  const decoded = decodeDocumentShape(materializeP0DocumentCandidate(recipe));
  if (!decoded.ok) {
    return fixtureFailure(
      recipe.documentId,
      "f2",
      `${decoded.errors[0].code}:${decoded.errors[0].path.join(".")}`,
    );
  }
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    return fixtureFailure(
      recipe.documentId,
      "f3",
      `${published.errors[0].code}:${published.errors[0].path.join(".")}`,
    );
  }

  const authoredEvents = recipeEvents(recipe);
  const events = publishedEvents(published.value);
  if (events.length !== authoredEvents.length) {
    return fixtureFailure(recipe.documentId, "publication", "event-count");
  }
  const sourceByEventId = new Map<ChordEventId, P0SourceRecord>();
  const sourceRefByEventId = new Map<ChordEventId, string>();
  events.forEach((event, index) => {
    const authored = authoredEvents[index];
    if (authored === undefined || event.id !== authored.eventId) {
      fixtureFailure(recipe.documentId, "publication", `event-order-${String(index)}`);
    }
    const source = p0Source(authored.sourceRef);
    sourceByEventId.set(event.id, source);
    sourceRefByEventId.set(event.id, source.id);
  });

  return Object.freeze({
    document: published.value,
    sourceByEventId,
    sourceRefByEventId,
  });
}

function expectedCandidateVoices(
  seed: P0GeneratedCandidateSeed,
): Pick<V0CandidateSuccessExpectation, "voices"> {
  return {
    voices: seed.voices.map((voice) => ({
      spelling: { ...voice.pitch },
      midi: voice.midi,
      degree: voice.degree === null ? null : v0DegreeToken(voice.degree),
      sourceDegreeIndex: voice.sourceDegreeIndex,
      provenance: voice.provenance,
    })),
  };
}

function requireGeneratedEvent(
  event: ChordEvent,
  source: P0GeneratedSource,
): asserts event is ChordEvent & Readonly<{ voicing: AutoVoicing }> {
  if (event.voicing.mode !== "auto") {
    fixtureFailure(source.id, "binding", `event-${event.id}-not-auto`);
  }
  if (
    !sameFixtureValue(event.chord, source.chord) ||
    !sameFixtureValue(event.voicing, source.voicing)
  ) {
    fixtureFailure(source.id, "binding", `event-${event.id}-source-drift`);
  }
}

function generatedBinding(
  event: ChordEvent,
  source: P0GeneratedSource,
): GeneratedPlaybackRealizationBinding {
  requireGeneratedEvent(event, source);
  const parsed = parseChordSymbol(source.chord.sourceText, "ascii");
  if (!parsed.ok) {
    return fixtureFailure(source.id, "t0", parsed.diagnostics[0].code);
  }
  if (!sameFixtureValue(parsed.chord, source.chord)) {
    return fixtureFailure(source.id, "t0", "source-chord-drift");
  }
  const resolved = resolveChord(parsed.chord);
  if (!resolved.ok) {
    return fixtureFailure(source.id, "t1", resolved.refusal.code);
  }
  if (
    !sameFixtureValue(resolved.value.source, event.chord) ||
    !resolved.value.realizations.some(
      ({ id }) => id === source.autoRequestSeed.realizationId,
    )
  ) {
    return fixtureFailure(source.id, "t1", "resolved-seed-drift");
  }
  const policy = makeAutoVoicing(source.voicing, resolved.value.bass);
  if (!policy.ok) {
    return fixtureFailure(source.id, "f1-policy", policy.refusal.code);
  }
  if (!sameFixtureValue(policy.value, event.voicing)) {
    return fixtureFailure(source.id, "f1-policy", "published-policy-drift");
  }
  if (!sameFixtureValue(
    {
      schema: source.autoRequestSeed.schema,
      kind: source.autoRequestSeed.kind,
      policyRef: source.autoRequestSeed.policyRef,
      resolvedSourceMustEqualChord:
        source.autoRequestSeed.resolvedSourceMustEqualChord,
    },
    {
      schema: VOICING_REQUEST_SCHEMA,
      kind: "auto",
      policyRef: "voicing",
      resolvedSourceMustEqualChord: true,
    },
  )) {
    return fixtureFailure(source.id, "request-seed", "identity");
  }

  const request = Object.freeze({
    schema: source.autoRequestSeed.schema,
    kind: source.autoRequestSeed.kind,
    resolved: resolved.value,
    realizationId: source.autoRequestSeed.realizationId,
    policy: policy.value,
    quartalContext: source.autoRequestSeed.quartalContext,
  }) as unknown as AutoVoicingRequest;
  const result = realizeVoicing(request);
  if (!result.ok) {
    return fixtureFailure(source.id, "v0", result.refusal.code);
  }
  if (
    !sameFixtureValue(result.value.policy, event.voicing) ||
    result.value.realizationId !== source.autoRequestSeed.realizationId
  ) {
    return fixtureFailure(source.id, "v0", "generated-result-correlation");
  }
  const candidate = findV0CandidateWithExpectedVoices(
    result.value.candidates,
    expectedCandidateVoices(source.candidateSeed),
  );
  if (candidate === undefined) {
    return fixtureFailure(
      source.id,
      "v0",
      `authored-seed-${source.candidateSeed.id}-absent`,
    );
  }
  const candidateProjection = {
    schema: candidate.schema,
    engineId: candidate.engineId,
    engineVersion: candidate.engineVersion,
    family: candidate.family,
    realizationId: candidate.realizationId,
    voices: candidate.voices,
    pitches: candidate.pitches,
  };
  const seedProjection = {
    schema: source.candidateSeed.schema,
    engineId: source.candidateSeed.engineId,
    engineVersion: source.candidateSeed.engineVersion,
    family: source.candidateSeed.family,
    realizationId: source.candidateSeed.realizationId,
    voices: source.candidateSeed.voices,
    pitches: source.candidateSeed.pitches,
  };
  if (!sameFixtureValue(candidateProjection, seedProjection)) {
    return fixtureFailure(source.id, "v0", "authored-seed-projection-drift");
  }

  return Object.freeze({
    schema: PLAYBACK_PLAN_REALIZATION_SCHEMA,
    eventId: event.id,
    kind: "generated",
    request,
    outcome: Object.freeze({ ok: true, candidate }),
  });
}

function storedBinding(
  event: ChordEvent,
  source: P0StoredSource,
): PlaybackRealizationBinding {
  if (event.voicing.mode === "auto") {
    return fixtureFailure(source.id, "binding", `event-${event.id}-is-auto`);
  }
  if (
    !sameFixtureValue(event.chord, source.chord) ||
    !sameFixtureValue(event.voicing, source.voicing)
  ) {
    return fixtureFailure(source.id, "binding", `event-${event.id}-source-drift`);
  }
  const request: StoredVoicingRequest<ManualVoicing | FrozenVoicing> =
    Object.freeze({
      schema: VOICING_REQUEST_SCHEMA,
      kind: "stored",
      voicing: event.voicing,
    });
  const result = realizeVoicing(request);
  if (
    result.value.voicing !== event.voicing ||
    !sameFixtureValue(
      {
        schema: result.value.schema,
        kind: result.value.kind,
        candidateGenerationPerformed:
          result.value.candidateGenerationPerformed,
        rawCandidateCount: result.value.rawCandidateCount,
        retainedCandidateCount: result.value.retainedCandidateCount,
      },
      {
        schema: source.storedBypassSeed.schema,
        kind: source.storedBypassSeed.kind,
        candidateGenerationPerformed:
          source.storedBypassSeed.candidateGenerationPerformed,
        rawCandidateCount: source.storedBypassSeed.rawCandidateCount,
        retainedCandidateCount:
          source.storedBypassSeed.retainedCandidateCount,
      },
    )
  ) {
    return fixtureFailure(source.id, "v0", "stored-bypass-drift");
  }
  return Object.freeze({
    schema: PLAYBACK_PLAN_REALIZATION_SCHEMA,
    eventId: event.id,
    kind: "stored",
    result: result.value,
  });
}

function materializeBinding(
  event: ChordEvent,
  source: P0SourceRecord,
): PlaybackRealizationBinding {
  return source.bindingKind === "generated"
    ? generatedBinding(event, source)
    : storedBinding(event, source);
}

export type P0BindingOrder =
  | "source"
  | "reverse-source"
  | readonly string[];

function bindingForWire(
  bindings: ReadonlyMap<ChordEventId, PlaybackRealizationBinding>,
  eventId: string,
): PlaybackRealizationBinding | undefined {
  for (const [key, binding] of bindings) {
    if (key === eventId) return binding;
  }
  return undefined;
}

export function freshP0RealizationMap(
  document: ValidatedDocument,
  sourceByEventId: ReadonlyMap<ChordEventId, P0SourceRecord>,
  order: P0BindingOrder = "source",
): Map<ChordEventId, PlaybackRealizationBinding> {
  const sourceBindings = new Map<ChordEventId, PlaybackRealizationBinding>();
  for (const event of publishedEvents(document)) {
    const source = sourceByEventId.get(event.id);
    if (source === undefined) {
      fixtureFailure(document.id, "binding", `missing-source-${event.id}`);
    }
    sourceBindings.set(event.id, materializeBinding(event, source));
  }

  const wires = (() => {
    const sourceWires = [...sourceBindings.keys()].map(String);
    if (order === "source") return sourceWires;
    if (order === "reverse-source") return sourceWires.reverse();
    return [...order];
  })();
  if (
    wires.length !== sourceBindings.size ||
    new Set(wires).size !== sourceBindings.size
  ) {
    return fixtureFailure(document.id, "binding-order", "not-exact-coverage");
  }
  const ordered = new Map<ChordEventId, PlaybackRealizationBinding>();
  for (const wire of wires) {
    const binding = bindingForWire(sourceBindings, wire);
    if (binding === undefined) {
      return fixtureFailure(document.id, "binding-order", `unknown-${wire}`);
    }
    ordered.set(binding.eventId, binding);
  }
  return ordered;
}

export type P0FreshCompileRequest = Omit<
  CompilePlaybackPlanRequest,
  "realizedVoicings"
> &
  Readonly<{
    realizedVoicings: Map<ChordEventId, PlaybackRealizationBinding>;
  }>;

export function freshP0CompileRequest(
  document: ValidatedDocument,
  realizedVoicings: ReadonlyMap<ChordEventId, PlaybackRealizationBinding>,
  loop: BeatRange | null = null,
): P0FreshCompileRequest {
  return Object.freeze({
    schema: PLAYBACK_PLAN_REQUEST_SCHEMA,
    compilerId: PLAYBACK_PLAN_COMPILER_ID,
    compilerVersion: PLAYBACK_PLAN_COMPILER_VERSION,
    articulationPolicyId: PLAYBACK_ARTICULATION_POLICY_ID,
    articulationPolicyVersion: PLAYBACK_ARTICULATION_POLICY_VERSION,
    loopPolicyId: PLAYBACK_LOOP_POLICY_ID,
    loopPolicyVersion: PLAYBACK_LOOP_POLICY_VERSION,
    velocityPolicyId: PLAYBACK_VELOCITY_POLICY_ID,
    velocityPolicyVersion: PLAYBACK_VELOCITY_POLICY_VERSION,
    realizationBindingPolicyId: PLAYBACK_REALIZATION_BINDING_POLICY_ID,
    realizationBindingPolicyVersion:
      PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
    document,
    realizedVoicings: new Map(realizedVoicings),
    loop,
  });
}

export type P0PlaybackFixture = Readonly<{
  documentRecipe: P0DocumentRecipe;
  document: ValidatedDocument;
  sourceByEventId: ReadonlyMap<ChordEventId, P0SourceRecord>;
  sourceRefByEventId: ReadonlyMap<ChordEventId, string>;
  realizedVoicings: Map<ChordEventId, PlaybackRealizationBinding>;
  request: P0FreshCompileRequest;
}>;

export type P0PlaybackFixtureOptions = Readonly<{
  loop?: BeatRange | null;
  bindingOrder?: P0BindingOrder;
}>;

export function materializeP0PlaybackFixture(
  documentRecipe: P0DocumentRecipe,
  options: P0PlaybackFixtureOptions = {},
): P0PlaybackFixture {
  const published = materializeP0DocumentRecipe(documentRecipe);
  const bindings = freshP0RealizationMap(
    published.document,
    published.sourceByEventId,
    options.bindingOrder,
  );
  const request = freshP0CompileRequest(
    published.document,
    bindings,
    options.loop ?? null,
  );
  return Object.freeze({
    documentRecipe,
    document: published.document,
    sourceByEventId: published.sourceByEventId,
    sourceRefByEventId: published.sourceRefByEventId,
    realizedVoicings: request.realizedVoicings,
    request,
  });
}

function materializeLoopRecipe(
  recipe: P0LoopRecipe | null | undefined,
  fixtureId: string,
): BeatRange | null {
  if (recipe === null || recipe === undefined) return null;
  if (recipe.upstreamConstructorBypassed === true) {
    return Object.freeze({
      start: clone(recipe.start),
      end: clone(recipe.end),
    }) as unknown as BeatRange;
  }
  const start = makeBeatPosition(recipe.start);
  const end = makeBeatPosition(recipe.end);
  if (!start.ok || !end.ok) {
    return fixtureFailure(fixtureId, "loop", "position-invalid");
  }
  const range = makeBeatRange(start.value, end.value);
  if (range.ok) return range.value;
  return Object.freeze({ start: start.value, end: end.value });
}

export function materializeP0TimelineCase(
  caseId: string,
  options: Omit<P0PlaybackFixtureOptions, "loop"> = {},
): P0PlaybackFixture {
  const recipe = p0TimelineCase(caseId);
  if (recipe.documentRecipe === undefined) {
    return fixtureFailure(caseId, "timeline", "paired-case-use-pair-helper");
  }
  return materializeP0PlaybackFixture(recipe.documentRecipe, {
    ...options,
    loop: materializeLoopRecipe(recipe.documentRecipe.loop, caseId),
  });
}

export function materializeP0TimelinePair(
  caseId = "P0-TIME-010",
  options: Omit<P0PlaybackFixtureOptions, "loop"> = {},
): readonly [P0PlaybackFixture, P0PlaybackFixture] {
  const recipe = p0TimelineCase(caseId);
  if (recipe.pairedDocumentRecipes === undefined) {
    return fixtureFailure(caseId, "timeline", "not-a-paired-case");
  }
  return Object.freeze([
    materializeP0PlaybackFixture(recipe.pairedDocumentRecipes[0], options),
    materializeP0PlaybackFixture(recipe.pairedDocumentRecipes[1], options),
  ]);
}

export function materializeP0LoopCase(
  caseId: string,
  options: Omit<P0PlaybackFixtureOptions, "loop"> = {},
): P0PlaybackFixture {
  const recipe = p0LoopCase(caseId);
  return materializeP0PlaybackFixture(P0_LOOP_FIXTURE.baseDocumentRecipe, {
    ...options,
    loop: materializeLoopRecipe(recipe.loop, caseId),
  });
}

function realizationSourceRef(recipe: P0RealizationCaseRecipe): string {
  const base = P0_REALIZATION_FIXTURE.baseRecipe.singleEvent;
  if (base === undefined) {
    return fixtureFailure(recipe.id, "realization", "base-not-single-event");
  }
  return recipe.sourceRef ?? recipe.baseSourceRef ?? base.sourceRef;
}

function realizationDocumentRecipe(
  recipe: P0RealizationCaseRecipe,
): P0DocumentRecipe {
  const base = P0_REALIZATION_FIXTURE.baseRecipe;
  if (base.singleEvent === undefined) {
    return fixtureFailure(recipe.id, "realization", "base-not-single-event");
  }
  return {
    ...base,
    singleEvent: {
      ...base.singleEvent,
      sourceRef: realizationSourceRef(recipe),
    },
  };
}

export function materializeP0RealizationBaseline(
  caseId: string,
  options: Omit<P0PlaybackFixtureOptions, "loop"> = {},
): P0PlaybackFixture {
  const recipe = p0RealizationCase(caseId);
  return materializeP0PlaybackFixture(realizationDocumentRecipe(recipe), options);
}

function valueAtPath(root: unknown, path: F3FixturePath): unknown {
  let current = root;
  for (const segment of path) {
    if (current instanceof Map) {
      current = current.get(segment);
    } else if (Array.isArray(current)) {
      if (typeof segment !== "number") {
        return fixtureFailure("mutation", "path", "array-key");
      }
      current = current[segment];
    } else {
      current = requireF3Record(current, "P0 mutation path")[String(segment)];
    }
  }
  return current;
}

function replaceAtPath(
  root: unknown,
  path: F3FixturePath,
  value: unknown,
): void {
  if (path.length === 0) fixtureFailure("mutation", "path", "root-replace");
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  if (key === undefined) fixtureFailure("mutation", "path", "missing-key");
  const parent = valueAtPath(root, parentPath);
  const replacement = clone(value);
  if (parent instanceof Map) {
    parent.set(key, replacement);
    return;
  }
  if (Array.isArray(parent)) {
    if (typeof key !== "number") {
      fixtureFailure("mutation", "path", "array-key");
    }
    parent[key] = replacement;
    return;
  }
  if (!Reflect.set(requireF3Record(parent, "P0 mutation parent"), key, replacement)) {
    fixtureFailure("mutation", "replace", "reflect-set");
  }
}

function mapAtPath(root: unknown, path: F3FixturePath): Map<unknown, unknown> {
  const value = valueAtPath(root, path);
  if (!(value instanceof Map)) {
    return fixtureFailure("mutation", "map", "not-map");
  }
  return value;
}

function stringField(
  mutation: P0RealizationMutation,
  field: keyof P0RealizationMutation,
): string {
  const value = mutation[field];
  if (typeof value !== "string") {
    return fixtureFailure("mutation", "field", field);
  }
  return value;
}

function pathField(
  mutation: P0RealizationMutation,
  field: "path" | "mapPath",
): F3FixturePath {
  const value = mutation[field];
  if (value === undefined) {
    return fixtureFailure("mutation", "field", field);
  }
  return value;
}

function realV0ConstraintFailure(
  mutation: P0RealizationMutation,
): VoicingFailure {
  if (
    mutation.voicingFailureFixtureRef !==
    "tests/fixtures/voicing/operation-state-cases.json#V0-OP-REFUSAL-014"
  ) {
    return fixtureFailure("mutation", "v0-failure", "fixture-ref");
  }
  const candidateRecipe = v0CandidateCase("V0-CAND-019");
  if (!("sourceSymbol" in candidateRecipe)) {
    return fixtureFailure("mutation", "v0-failure", "candidate-recipe-kind");
  }
  const request = buildV0AutoCandidateRequest(candidateRecipe);
  const result = realizeVoicing(request);
  if (result.ok) {
    return fixtureFailure("mutation", "v0-failure", "unexpected-success");
  }
  const projection = mutation.voicingFailureProjection;
  if (
    projection === undefined ||
    result.refusal.code !== projection.refusalCode ||
    result.evidence.termination !== projection.termination
  ) {
    return fixtureFailure("mutation", "v0-failure", "projection-drift");
  }
  return result;
}

function generatedSeedBinding(
  candidateSeedRef: string,
  eventId: string,
): PlaybackRealizationBinding {
  const source = P0_SOURCE_CATALOG.sources.find(
    (entry): entry is P0GeneratedSource =>
      entry.bindingKind === "generated" &&
      entry.candidateSeed.id === candidateSeedRef,
  );
  if (source === undefined) {
    return fixtureFailure(candidateSeedRef, "candidate-seed", "missing");
  }
  const base = P0_REALIZATION_FIXTURE.baseRecipe;
  if (base.singleEvent === undefined) {
    return fixtureFailure(candidateSeedRef, "candidate-seed", "base-shape");
  }
  const fixture = materializeP0PlaybackFixture({
    ...base,
    singleEvent: {
      ...base.singleEvent,
      eventId,
      sourceRef: source.id,
    },
  });
  const binding = bindingForWire(fixture.realizedVoicings, eventId);
  if (binding === undefined || binding.kind !== "generated") {
    return fixtureFailure(candidateSeedRef, "candidate-seed", "binding");
  }
  return clone(binding);
}

function v0CandidateFromFixtureRef(candidateFixtureRef: string): VoicingCandidate {
  const prefix = "tests/fixtures/voicing/candidate-cases.json#";
  if (!candidateFixtureRef.startsWith(prefix)) {
    return fixtureFailure(candidateFixtureRef, "candidate-fixture", "reference");
  }
  const caseId = candidateFixtureRef.slice(prefix.length);
  if (caseId.length === 0) {
    return fixtureFailure(candidateFixtureRef, "candidate-fixture", "case-id");
  }
  const recipe = v0CandidateCase(caseId);
  if (
    !("sourceSymbol" in recipe) ||
    recipe.expected.kind !== "must-contain-candidate"
  ) {
    return fixtureFailure(candidateFixtureRef, "candidate-fixture", "case-kind");
  }
  const request = buildV0AutoCandidateRequest(recipe);
  if (request.kind !== "auto") {
    return fixtureFailure(candidateFixtureRef, "candidate-fixture", "request-kind");
  }
  const result = realizeVoicing(request);
  if (!result.ok) {
    return fixtureFailure(
      candidateFixtureRef,
      "candidate-fixture",
      result.refusal.code,
    );
  }
  const candidate = findV0CandidateWithExpectedVoices(
    result.value.candidates,
    recipe.expected,
  );
  if (candidate === undefined) {
    return fixtureFailure(candidateFixtureRef, "candidate-fixture", "missing");
  }
  return clone(candidate);
}

function applyRealizationMutation(
  request: CompilePlaybackPlanRequest,
  mutation: P0RealizationMutation,
  originalBindings: ReadonlyMap<string, PlaybackRealizationBinding>,
): void {
  switch (mutation.op) {
    case "replace":
    case "replace-branded-runtime-value":
      replaceAtPath(request, pathField(mutation, "path"), mutation.value);
      return;
    case "truncate": {
      const target = valueAtPath(request, pathField(mutation, "path"));
      const length = mutation.length;
      if (
        !Array.isArray(target) ||
        typeof length !== "number" ||
        !Number.isSafeInteger(length)
      ) {
        fixtureFailure("mutation", "truncate", "shape");
      }
      target.splice(length);
      return;
    }
    case "delete-map-entry": {
      const map = mapAtPath(request, pathField(mutation, "mapPath"));
      map.delete(stringField(mutation, "key"));
      return;
    }
    case "insert-map-entry": {
      const map = mapAtPath(request, pathField(mutation, "mapPath"));
      const key = stringField(mutation, "key");
      const sourceWire = stringField(mutation, "bindingFromEvent");
      const source = mutation.sourceBeforeDeletion === true
        ? originalBindings.get(sourceWire)
        : map.get(sourceWire);
      if (source === undefined) {
        fixtureFailure("mutation", "insert-map-entry", "source-binding");
      }
      const binding = clone(source);
      if (mutation.replaceBindingEventId !== undefined) {
        replaceAtPath(binding, ["eventId"], mutation.replaceBindingEventId);
      }
      map.set(key, binding);
      return;
    }
    case "replace-generated-outcome-with-voicing-failure": {
      const key = stringField(mutation, "key");
      const map = mapAtPath(request, pathField(mutation, "mapPath"));
      const binding = map.get(key);
      const record = requireF3Record(binding, "P0 generated failure binding");
      record["outcome"] = realV0ConstraintFailure(mutation);
      return;
    }
    case "replace-stored-binding-with-generated-seed": {
      const key = stringField(mutation, "key");
      const candidateSeedRef = stringField(mutation, "candidateSeedRef");
      const map = mapAtPath(request, pathField(mutation, "mapPath"));
      map.set(key, generatedSeedBinding(candidateSeedRef, key));
      return;
    }
    case "replace-generated-candidate-from-v0-fixture": {
      const key = stringField(mutation, "key");
      const candidateFixtureRef = stringField(
        mutation,
        "candidateFixtureRef",
      );
      const map = mapAtPath(request, pathField(mutation, "mapPath"));
      const binding = requireF3Record(
        map.get(key),
        "P0 generated candidate fixture binding",
      );
      if (binding["kind"] !== "generated") {
        return fixtureFailure(
          candidateFixtureRef,
          "candidate-fixture",
          "binding-kind",
        );
      }
      const outcome = requireF3Record(
        binding["outcome"],
        "P0 generated candidate fixture outcome",
      );
      if (outcome["ok"] !== true) {
        return fixtureFailure(
          candidateFixtureRef,
          "candidate-fixture",
          "outcome-kind",
        );
      }
      outcome["candidate"] = v0CandidateFromFixtureRef(candidateFixtureRef);
      return;
    }
    case "replace-map-entry-with-malformed-custom-unavailable": {
      const key = stringField(mutation, "key");
      const map = mapAtPath(request, pathField(mutation, "mapPath"));
      map.set(key, {
        schema: PLAYBACK_PLAN_REALIZATION_SCHEMA,
        eventId: key,
        kind: "custom-unavailable",
      });
      return;
    }
    default:
      return fixtureFailure("mutation", "operation", mutation.op);
  }
}

/**
 * Applies the reviewed runtime mutations to an ordinary structured clone. The
 * source document was genuinely F2/F3-published before any defensive boundary
 * corruption, so no test helper manufactures the opaque publication brand.
 */
export function materializeP0RealizationCase(
  caseId: string,
  options: Omit<P0PlaybackFixtureOptions, "loop"> = {},
): Readonly<{
  case: P0RealizationCaseRecipe;
  baseline: P0PlaybackFixture;
  request: CompilePlaybackPlanRequest;
}> {
  const recipe = p0RealizationCase(caseId);
  const baseline = materializeP0RealizationBaseline(caseId, options);
  const request: CompilePlaybackPlanRequest = {
    ...baseline.request,
    document: clone(baseline.request.document),
    realizedVoicings: new Map(
      [...baseline.request.realizedVoicings].map(([eventId, binding]) => [
        eventId,
        clone(binding),
      ]),
    ),
    loop: clone(baseline.request.loop),
  };
  const originalBindings = new Map<string, PlaybackRealizationBinding>();
  for (const [eventId, binding] of request.realizedVoicings) {
    originalBindings.set(eventId, clone(binding));
  }
  for (const mutation of recipe.mutations ?? []) {
    applyRealizationMutation(request, mutation, originalBindings);
  }
  return Object.freeze({ case: recipe, baseline, request });
}

export function p0RequestEventIds(
  request: Pick<CompilePlaybackPlanRequest, "document">,
): readonly ChordEventId[] {
  return Object.freeze(publishedEvents(request.document).map(({ id }) => id));
}

export function p0RequestBindingsByWire(
  request: Pick<CompilePlaybackPlanRequest, "realizedVoicings">,
): Readonly<Record<string, PlaybackRealizationBinding>> {
  return Object.freeze(Object.fromEntries(
    [...request.realizedVoicings].map(([eventId, binding]) => [eventId, binding]),
  ));
}

export function p0DocumentEventSource(
  fixture: Pick<P0PlaybackFixture, "sourceByEventId">,
  eventId: ChordEventId,
): P0SourceRecord {
  const source = fixture.sourceByEventId.get(eventId);
  if (source === undefined) {
    return fixtureFailure(eventId, "source", "event-not-found");
  }
  return source;
}

export function p0VoicingFromSource(sourceRef: string): Voicing {
  return clone(p0Source(sourceRef).voicing);
}

export function p0FixtureSections(
  candidate: F3FixtureRecord,
): unknown[] {
  return requireF3Array(candidate["sections"], "P0 candidate sections");
}

function p0LimitCandidate(
  documentId: string,
  meter: P0MeterRecipe,
  tempoBpm: number,
  sections: readonly F3FixtureRecord[],
): F3FixtureRecord {
  const root = materializeF3Input(publicationFixtureValue, {
    template: "representativeParsedAuto",
    operations: [],
  });
  root["id"] = documentId;
  root["title"] = `P0 limit ${documentId}`;
  root["description"] = "";
  root["meter"] = clone(meter);
  root["tempoBpm"] = tempoBpm;
  root["sections"] = sections;
  return root;
}

function publishP0LimitDocument(
  fixtureId: P0LimitStructuralCaseId,
  candidate: F3FixtureRecord,
): ValidatedDocument {
  const decoded = decodeDocumentShape(candidate);
  if (!decoded.ok) {
    return fixtureFailure(
      fixtureId,
      "f2",
      `${decoded.errors[0].code}:${decoded.errors[0].path.join(".")}`,
    );
  }
  const published = validateDocumentSemantics(decoded.value);
  if (!published.ok) {
    return fixtureFailure(
      fixtureId,
      "f3",
      `${published.errors[0].code}:${published.errors[0].path.join(".")}`,
    );
  }
  return published.value;
}

function paddedOrdinal(value: number): string {
  return value.toString().padStart(4, "0");
}

function maxEventsDocument(
  fixtureId: P0LimitStructuralCaseId,
  recipe: P0LimitMaxEventsRecipe,
): ValidatedDocument {
  const source = p0Source("P0-SOURCE-MANUAL-LEGACY");
  if (
    source.bindingKind !== "stored" ||
    source.voicing.mode !== "manual" ||
    recipe.source.chordRef !== "P0-SOURCE-MANUAL-LEGACY.chord" ||
    recipe.source.pitchCount !== recipe.source.pitches.length ||
    !sameFixtureValue(
      { sourceKind: recipe.source.kind, sectionCount: recipe.sectionCount },
      { sourceKind: "stored-manual", sectionCount: 1 },
    ) ||
    recipe.measuresPerSection * recipe.eventsPerMeasure !== recipe.eventCount ||
    recipe.bindingCount !== recipe.eventCount
  ) {
    return fixtureFailure(fixtureId, "max-events", "recipe-drift");
  }

  let eventOrdinal = 0;
  const measures = Array.from(
    { length: recipe.measuresPerSection },
    (_, measureIndex): F3FixtureRecord => ({
      id: `measure-p0-max-${paddedOrdinal(measureIndex)}`,
      events: Array.from(
        { length: recipe.eventsPerMeasure },
        (): F3FixtureRecord => {
          const currentOrdinal = eventOrdinal;
          eventOrdinal += 1;
          return {
            id: `event-p0-max-${paddedOrdinal(currentOrdinal)}`,
            duration: clone(recipe.eventDuration),
            annotation: "",
            chord: clone(source.chord),
            voicing: {
              mode: "manual",
              pitches: clone(recipe.source.pitches),
              bassPolicy: source.voicing.bassPolicy,
            },
          };
        },
      ),
      completion: { kind: "complete" },
    }),
  );
  if (eventOrdinal !== recipe.eventCount) {
    return fixtureFailure(fixtureId, "max-events", "event-count");
  }
  return publishP0LimitDocument(
    fixtureId,
    p0LimitCandidate(recipe.documentId, recipe.meter, recipe.tempoBpm, [
      {
        id: "section-p0-max-events",
        name: "P0 maximum events",
        annotation: "",
        keyOverride: null,
        voiceLeadingBoundary: "continue",
        measures,
      },
    ]),
  );
}

function maxMeasuresDocument(
  fixtureId: P0LimitStructuralCaseId,
  recipe: P0LimitMaxMeasuresRecipe,
): ValidatedDocument {
  if (!sameFixtureValue(
    recipe.allMeasures,
    { completion: { kind: "empty" }, events: [] },
  )) {
    return fixtureFailure(fixtureId, "max-measures", "recipe-drift");
  }
  let measureOrdinal = 0;
  const sections = Array.from(
    { length: recipe.sectionCount },
    (_, sectionIndex): F3FixtureRecord => ({
      id: `section-p0-measures-${paddedOrdinal(sectionIndex)}`,
      name: `P0 measures ${String(sectionIndex + 1)}`,
      annotation: "",
      keyOverride: null,
      voiceLeadingBoundary: "continue",
      measures: Array.from(
        { length: recipe.measuresPerSection },
        (): F3FixtureRecord => {
          const currentOrdinal = measureOrdinal;
          measureOrdinal += 1;
          return {
            id: `measure-p0-empty-${currentOrdinal.toString().padStart(5, "0")}`,
            completion: { kind: "empty" },
            events: [],
          };
        },
      ),
    }),
  );
  if (measureOrdinal !== recipe.sectionCount * recipe.measuresPerSection) {
    return fixtureFailure(fixtureId, "max-measures", "measure-count");
  }
  return publishP0LimitDocument(
    fixtureId,
    p0LimitCandidate(recipe.documentId, recipe.meter, recipe.tempoBpm, sections),
  );
}

function maxTimeDocument(
  fixtureId: P0LimitStructuralCaseId,
  recipe: P0LimitMaxTimeRecipe,
  appendMeasure: P0LimitTimelinePlusOneRecipe["appendMeasure"] | null,
): ValidatedDocument {
  const distribution = recipe.distribution;
  const expectedEmptyMeasures =
    distribution.fullSections * distribution.measuresPerFullSection +
    distribution.finalSectionMeasures;
  if (expectedEmptyMeasures !== recipe.emptyMeasureCount) {
    return fixtureFailure(fixtureId, "max-time", "distribution-drift");
  }
  let measureOrdinal = 0;
  const sectionCount = distribution.fullSections + 1;
  const sections = Array.from(
    { length: sectionCount },
    (_, sectionIndex): F3FixtureRecord => {
      const emptyCount = sectionIndex < distribution.fullSections
        ? distribution.measuresPerFullSection
        : distribution.finalSectionMeasures;
      const measures: F3FixtureRecord[] = Array.from(
        { length: emptyCount },
        (): F3FixtureRecord => {
          const currentOrdinal = measureOrdinal;
          measureOrdinal += 1;
          return {
            id: `measure-p0-time-${currentOrdinal.toString().padStart(5, "0")}`,
            completion: { kind: "empty" },
            events: [],
          };
        },
      );
      if (appendMeasure !== null && sectionIndex === appendMeasure.sectionIndex) {
        if (measures.length !== appendMeasure.measureIndex) {
          fixtureFailure(fixtureId, "max-time", "append-location");
        }
        measures.push({
          id: appendMeasure.measureId,
          completion: clone(appendMeasure.completion),
          events: appendMeasure.events.map(materializeRawEvent),
        });
      }
      return {
        id: `section-p0-time-${paddedOrdinal(sectionIndex)}`,
        name: `P0 time ${String(sectionIndex + 1)}`,
        annotation: "",
        keyOverride: null,
        voiceLeadingBoundary: "continue",
        measures,
      };
    },
  );
  if (measureOrdinal !== recipe.emptyMeasureCount) {
    return fixtureFailure(fixtureId, "max-time", "measure-count");
  }
  return publishP0LimitDocument(
    fixtureId,
    p0LimitCandidate(recipe.documentId, recipe.meter, recipe.tempoBpm, sections),
  );
}

function freshLimitStoredRealizationMap(
  fixtureId: P0LimitStructuralCaseId,
  document: ValidatedDocument,
): Map<ChordEventId, PlaybackRealizationBinding> {
  const bindings = new Map<ChordEventId, PlaybackRealizationBinding>();
  for (const event of publishedEvents(document)) {
    if (event.voicing.mode === "auto") {
      return fixtureFailure(fixtureId, "stored-bindings", `auto-${event.id}`);
    }
    const request: StoredVoicingRequest<ManualVoicing | FrozenVoicing> =
      Object.freeze({
        schema: VOICING_REQUEST_SCHEMA,
        kind: "stored",
        voicing: event.voicing,
      });
    const result = realizeVoicing(request);
    bindings.set(event.id, Object.freeze({
      schema: PLAYBACK_PLAN_REALIZATION_SCHEMA,
      eventId: event.id,
      kind: "stored",
      result: result.value,
    }));
  }
  return bindings;
}

export type P0LimitMaterializationKind =
  | "published-exact"
  | "published-timeline-precedence"
  | "post-publication-defensive-binding-plus-one";

export type P0LimitStructuralMaterialization = Readonly<{
  case: P0LimitStructuralCaseRecipe;
  materializationKind: P0LimitMaterializationKind;
  document: ValidatedDocument;
  realizedVoicings: Map<ChordEventId, PlaybackRealizationBinding>;
  request: P0FreshCompileRequest;
}>;

function limitMaterialization(
  recipe: P0LimitStructuralCaseRecipe,
  materializationKind: P0LimitMaterializationKind,
  document: ValidatedDocument,
  bindings: ReadonlyMap<ChordEventId, PlaybackRealizationBinding>,
): P0LimitStructuralMaterialization {
  const request = freshP0CompileRequest(document, bindings, null);
  return Object.freeze({
    case: recipe,
    materializationKind,
    document,
    realizedVoicings: request.realizedVoicings,
    request,
  });
}

function maxEventsMaterialization(
  recipe: P0LimitStructuralCaseRecipe,
  maxEventsRecipe: P0LimitMaxEventsRecipe,
): P0LimitStructuralMaterialization {
  const document = maxEventsDocument(recipe.id, maxEventsRecipe);
  const bindings = freshLimitStoredRealizationMap(recipe.id, document);
  if (bindings.size !== maxEventsRecipe.bindingCount) {
    return fixtureFailure(recipe.id, "max-events", "binding-count");
  }
  return limitMaterialization(recipe, "published-exact", document, bindings);
}

/**
 * Materializes one reviewed structural boundary. Cases 001 through 005 are
 * ordinary requests whose documents cross the real F2 and F3 publication
 * gates. Case 006 alone appends an impossible 8,193rd Map entry after that
 * publication so it can exercise P0's defensive preflight boundary.
 */
export function materializeP0LimitStructuralCase(
  caseId: P0LimitStructuralCaseId,
): P0LimitStructuralMaterialization {
  const recipe = p0LimitStructuralCase(caseId);
  switch (recipe.id) {
    case "P0-LIMIT-STRUCT-001":
      return maxEventsMaterialization(recipe, recipe.recipe);
    case "P0-LIMIT-STRUCT-002": {
      const document = maxMeasuresDocument(recipe.id, recipe.recipe);
      return limitMaterialization(recipe, "published-exact", document, new Map());
    }
    case "P0-LIMIT-STRUCT-003": {
      const document = maxTimeDocument(recipe.id, recipe.recipe, null);
      return limitMaterialization(recipe, "published-exact", document, new Map());
    }
    case "P0-LIMIT-STRUCT-004": {
      const base = p0LimitStructuralCase(recipe.recipe.baseRef);
      const document = maxTimeDocument(
        recipe.id,
        {
          ...base.recipe,
          documentId: `${base.recipe.documentId}-plus-one`,
        },
        recipe.recipe.appendMeasure,
      );
      return limitMaterialization(
        recipe,
        "published-timeline-precedence",
        document,
        new Map(),
      );
    }
    case "P0-LIMIT-STRUCT-005": {
      const base = p0LimitStructuralCase(recipe.recipeRef);
      return maxEventsMaterialization(recipe, base.recipe);
    }
    case "P0-LIMIT-STRUCT-006": {
      const base = p0LimitStructuralCase(recipe.recipe.baseRef);
      const exact = maxEventsMaterialization(recipe, base.recipe);
      const source = bindingForWire(
        exact.realizedVoicings,
        recipe.recipe.appendBinding.bindingRef,
      );
      if (source === undefined) {
        return fixtureFailure(recipe.id, "binding-plus-one", "binding-ref");
      }
      const defensiveBinding = clone(source);
      replaceAtPath(
        defensiveBinding,
        ["eventId"],
        recipe.recipe.appendBinding.eventId,
      );
      mapAtPath(exact.request, ["realizedVoicings"]).set(
        recipe.recipe.appendBinding.eventId,
        defensiveBinding,
      );
      if (exact.request.realizedVoicings.size !== base.recipe.bindingCount + 1) {
        return fixtureFailure(recipe.id, "binding-plus-one", "binding-count");
      }
      return Object.freeze({
        ...exact,
        materializationKind: "post-publication-defensive-binding-plus-one",
      });
    }
  }
}
