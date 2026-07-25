/**
 * V2 build-phase test kit.
 *
 * Converts the independently authored fixtures under
 * tests/fixtures/progression-optimizer/ into real production requests and a
 * table-driven stub V1 oracle, and drives the production stepper. Expected
 * values always come from the reviewed fixtures; this kit only translates
 * representations and never derives an expectation from production output.
 */
import { expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  makeChordDegree,
  makeMidiPitch,
  makeSpelledPitch,
  parseStableId,
  type AutoVoicingFamily,
  type ChordDegree,
  type ChordEventId,
  type DocumentId,
  type MidiPitch,
  type SpelledPitch,
} from "../../src/domain";
import {
  PROGRESSION_CONFLICT_SCHEMA,
  PROGRESSION_COST_AXES,
  PROGRESSION_COST_POLICY_ID,
  PROGRESSION_COST_POLICY_VERSION,
  PROGRESSION_DEGRADATION_CODE,
  PROGRESSION_DEGRADATION_SCHEMA,
  PROGRESSION_EVENT_SCHEMA,
  PROGRESSION_OPTIMIZER_ENGINE_ID,
  PROGRESSION_OPTIMIZER_ENGINE_VERSION,
  PROGRESSION_OPTIMIZER_REQUEST_SCHEMA,
  PROGRESSION_SEARCH_POLICY_ID,
  PROGRESSION_SEARCH_POLICY_VERSION,
  PROGRESSION_TIE_BREAK_POLICY_ID,
  PROGRESSION_TIE_BREAK_POLICY_VERSION,
  SEMANTIC_REALIZATION_IDS,
  VOICE_ASSIGNMENT_FRAME_SCHEMA,
  VOICE_ASSIGNMENT_LOCK_SCHEMA,
  VOICE_ASSIGNMENT_RESULT_SCHEMA,
  VOICE_ASSIGNMENT_ROLE_POLICY_ID,
  VOICE_ASSIGNMENT_ROLE_POLICY_VERSION,
  VOICING_TEMPLATE_ROWS,
  advanceProgressionOptimization,
  cancelProgressionOptimization,
  initializeProgressionOptimization,
  type AssignedVoiceFrame,
  type AssignVoiceTransitionResult,
  type InitializeVoiceFrameResult,
  type ProgressionCancelReason,
  type ProgressionConflict,
  type ProgressionCost,
  type ProgressionDegradation,
  type ProgressionEvent,
  type ProgressionEventConstraints,
  type ProgressionOptimizationOutcome,
  type ProgressionOptimizationRequest,
  type ProgressionSearchState,
  type UnassignedVoiceFrame,
  type VoiceArc,
  type VoiceAssignmentCost,
  type VoiceAssignmentLocks,
  type VoiceAssignmentOperations,
  type VoiceAssignmentWorkEvidence,
  type VoicingCandidateId,
} from "../../src/theory";

export type JsonObject = Record<string, unknown>;

const fixtureRoot = resolve(
  import.meta.dirname,
  "../fixtures/progression-optimizer",
);

export const V2_CASE_FILES = Object.freeze([
  "optimization-cases.json",
  "boundary-cases.json",
  "limit-cases.json",
  "stepper-cases.json",
] as const);

export async function loadFixtureFile(name: string): Promise<JsonObject> {
  const raw = await readFile(resolve(fixtureRoot, name), "utf8");
  return JSON.parse(raw) as JsonObject;
}

export type FixtureCase = Readonly<{
  file: string;
  record: JsonObject;
  defaults: JsonObject;
}>;

export async function loadAllCases(): Promise<Map<string, FixtureCase>> {
  const cases = new Map<string, FixtureCase>();
  for (const file of V2_CASE_FILES) {
    const fixture = await loadFixtureFile(file);
    const defaults = (fixture["requestDefaults"] as JsonObject | undefined) ?? {};
    for (const record of (fixture["cases"] as JsonObject[] | undefined) ?? []) {
      cases.set(record["id"] as string, { file, record, defaults });
    }
  }
  return cases;
}

export async function requireCase(id: string): Promise<FixtureCase> {
  const found = (await loadAllCases()).get(id);
  if (!found) throw new Error(`missing fixture case ${id}`);
  return found;
}

/* ------------------------------------------------------------------ */
/* Frame synthesis                                                    */
/* ------------------------------------------------------------------ */

const TEMPLATE_ID_BY_FAMILY: ReadonlyMap<AutoVoicingFamily, string> = (() => {
  const map = new Map<AutoVoicingFamily, string>();
  for (const row of VOICING_TEMPLATE_ROWS) {
    if (!map.has(row.family)) map.set(row.family, row.id);
  }
  return map;
})();

const STEP_BY_PITCH_CLASS: readonly (readonly [string, number])[] = [
  ["C", 0],
  ["C", 1],
  ["D", 0],
  ["D", 1],
  ["E", 0],
  ["F", 0],
  ["F", 1],
  ["G", 0],
  ["G", 1],
  ["A", 0],
  ["A", 1],
  ["B", 0],
];

export function eventIdOf(wire: string): ChordEventId {
  const parsed = parseStableId("event", wire);
  if (!parsed.ok) throw new Error(`invalid event id ${wire}`);
  return parsed.value;
}

export function documentIdOf(wire: string): DocumentId {
  const parsed = parseStableId("document", wire);
  if (!parsed.ok) throw new Error(`invalid document id ${wire}`);
  return parsed.value;
}

function midiOf(value: number): MidiPitch {
  const made = makeMidiPitch(value);
  if (!made.ok) throw new Error(`invalid midi ${String(value)}`);
  return made.value;
}

function spelledOf(midi: number): SpelledPitch {
  const entry = STEP_BY_PITCH_CLASS[((midi % 12) + 12) % 12] ?? ["C", 0];
  const octave = Math.floor(midi / 12) - 1;
  const made = makeSpelledPitch({ step: entry[0], alter: entry[1], octave });
  if (!made.ok) throw new Error(`unspellable midi ${String(midi)}`);
  return made.value;
}

function degreeOf(number: 1 | 3 | 5, alter: 0): ChordDegree {
  const made = makeChordDegree({ number, alter });
  if (!made.ok) throw new Error("invalid degree");
  return made.value;
}

const KIT_DEGREES: readonly ChordDegree[] = [
  degreeOf(1, 0),
  degreeOf(3, 0),
  degreeOf(5, 0),
];

export function buildFrame(
  eventWire: string,
  candidateId: string,
  family: string,
  voiceMidis: readonly number[],
): UnassignedVoiceFrame {
  const templateId = TEMPLATE_ID_BY_FAMILY.get(family as AutoVoicingFamily);
  if (templateId === undefined) throw new Error(`unknown family ${family}`);
  const voices = voiceMidis.map((midi, ordinal) => ({
    ordinal,
    pitch: spelledOf(midi),
    midi: midiOf(midi),
    provenance: "realization" as const,
    degree: KIT_DEGREES[ordinal % KIT_DEGREES.length] ?? degreeOf(1, 0),
    sourceDegreeIndex: ordinal % KIT_DEGREES.length,
    guideTone: false,
    colorTone: false,
  }));
  return {
    schema: VOICE_ASSIGNMENT_FRAME_SCHEMA,
    kind: "unassigned",
    eventId: eventIdOf(eventWire),
    roles: {
      policyId: VOICE_ASSIGNMENT_ROLE_POLICY_ID,
      policyVersion: VOICE_ASSIGNMENT_ROLE_POLICY_VERSION,
      sourceId: templateId,
      sourceVersion: 1,
      candidateId: candidateId as VoicingCandidateId,
      realizationId: SEMANTIC_REALIZATION_IDS[0],
      guideDegrees: [],
      colorDegrees: [],
    },
    voices: voices as unknown as UnassignedVoiceFrame["voices"],
  };
}

/* ------------------------------------------------------------------ */
/* Request synthesis                                                  */
/* ------------------------------------------------------------------ */

function candidateIdOf(index: number): string {
  return `candidate-${String(index).padStart(3, "0")}`;
}

function eventWireOf(index: number): string {
  return `event-${String(index).padStart(4, "0")}`;
}

type GeneratorSpec = Readonly<{
  eventCount: number;
  candidateCount: number;
  costRule: string;
  uniformCost?: readonly number[];
  costTable?: Readonly<Record<string, readonly number[]>>;
}>;

function buildConstraints(raw: JsonObject | undefined): ProgressionEventConstraints {
  const families = (raw?.["families"] as readonly string[] | null | undefined) ?? null;
  const range =
    (raw?.["range"] as { lowMidi: number; highMidi: number } | null | undefined) ??
    null;
  const bassRange =
    (raw?.["bassRange"] as
      | { lowMidi: number; highMidi: number }
      | null
      | undefined) ?? null;
  const locks = ((raw?.["locks"] as JsonObject[] | undefined) ?? []).map(
    (lock, ordinal) => {
      const midi = (lock["midi"] as number | undefined) ?? 60;
      return {
        schema: VOICE_ASSIGNMENT_LOCK_SCHEMA,
        requestId: "kit-lock",
        eventId: eventIdOf((lock["eventId"] as string | undefined) ?? "event-kit"),
        voiceId: (lock["voiceId"] as string | undefined) ?? `voice-${String(ordinal).padStart(4, "0")}`,
        pitch: spelledOf(midi),
        degree: null,
      };
    },
  );
  return {
    families: families as ProgressionEventConstraints["families"],
    range,
    bassRange,
    locks: locks as unknown as VoiceAssignmentLocks,
  };
}

/**
 * Build a production request from a compact fixture case. Intentionally
 * malformed override fields are carried through with casts so refusal
 * near-misses reach production validation unchanged.
 */
export function buildRequest(fixture: FixtureCase): ProgressionOptimizationRequest {
  const caseRequest = fixture.record["request"] as JsonObject;
  const defaults = fixture.defaults;
  const generator = caseRequest["generator"] as GeneratorSpec | undefined;
  const events: ProgressionEvent[] = [];
  if (generator) {
    for (let i = 0; i < generator.eventCount; i += 1) {
      const frames: UnassignedVoiceFrame[] = [];
      for (let j = 0; j < generator.candidateCount; j += 1) {
        frames.push(
          buildFrame(eventWireOf(i), candidateIdOf(j), "balanced", [
            Math.min(127, 48 + j),
            Math.min(127, 52 + j),
            Math.min(127, 59 + j),
          ]),
        );
      }
      events.push({
        schema: PROGRESSION_EVENT_SCHEMA,
        kind: "auto",
        eventId: eventIdOf(eventWireOf(i)),
        chainBoundary: i === 0 ? "reset" : "continue",
        candidates: frames,
        constraints: { families: null, range: null, bassRange: null, locks: [] },
      });
    }
  } else {
    for (const raw of (caseRequest["events"] as JsonObject[] | undefined) ?? []) {
      const kind = raw["kind"] as "auto" | "fixed";
      const eventWire = raw["eventId"] as string;
      const constraintsRaw = raw["constraints"] as JsonObject | undefined;
      const withEvent = (lockRaw: JsonObject): JsonObject => ({
        ...lockRaw,
        eventId: eventWire,
      });
      const constraints = buildConstraints(
        constraintsRaw === undefined
          ? undefined
          : {
              ...constraintsRaw,
              locks: ((constraintsRaw["locks"] as JsonObject[] | undefined) ?? []).map(
                withEvent,
              ),
            },
      );
      const buildOne = (compact: JsonObject): UnassignedVoiceFrame =>
        buildFrame(
          eventWire,
          compact["candidateId"] as string,
          compact["family"] as string,
          compact["voiceMidis"] as readonly number[],
        );
      if (kind === "fixed") {
        events.push({
          schema: PROGRESSION_EVENT_SCHEMA,
          kind: "fixed",
          reason: raw["reason"] as "manual" | "frozen",
          eventId: eventIdOf(eventWire),
          chainBoundary: raw["chainBoundary"] as "continue" | "reset",
          candidate: buildOne(raw["candidate"] as JsonObject),
          constraints,
        });
      } else {
        events.push({
          schema: PROGRESSION_EVENT_SCHEMA,
          kind: "auto",
          eventId: eventIdOf(eventWire),
          chainBoundary: raw["chainBoundary"] as "continue" | "reset",
          candidates: ((raw["candidates"] as JsonObject[] | undefined) ?? []).map(
            buildOne,
          ),
          constraints,
        });
      }
    }
  }
  const request: ProgressionOptimizationRequest = {
    schema: ((caseRequest["schemaOverride"] as string | undefined) ??
      PROGRESSION_OPTIMIZER_REQUEST_SCHEMA) as typeof PROGRESSION_OPTIMIZER_REQUEST_SCHEMA,
    identity: {
      requestId: caseRequest["requestId"] as string,
      documentId: documentIdOf(
        (caseRequest["documentId"] as string | undefined) ??
          (defaults["documentId"] as string),
      ),
      sourceRevision:
        (caseRequest["sourceRevisionOverride"] as number | undefined) ??
        (defaults["sourceRevision"] as number),
      engineId: PROGRESSION_OPTIMIZER_ENGINE_ID,
      engineVersion: ((caseRequest["engineVersionOverride"] as number | undefined) ??
        PROGRESSION_OPTIMIZER_ENGINE_VERSION) as typeof PROGRESSION_OPTIMIZER_ENGINE_VERSION,
      costPolicyId: PROGRESSION_COST_POLICY_ID,
      costPolicyVersion: PROGRESSION_COST_POLICY_VERSION,
      searchPolicyId: PROGRESSION_SEARCH_POLICY_ID,
      searchPolicyVersion: PROGRESSION_SEARCH_POLICY_VERSION,
      tieBreakPolicyId: PROGRESSION_TIE_BREAK_POLICY_ID,
      tieBreakPolicyVersion: PROGRESSION_TIE_BREAK_POLICY_VERSION,
    },
    loopClosure:
      (caseRequest["loopClosure"] as boolean | undefined) ??
      (defaults["loopClosure"] as boolean),
    maxWorkQuanta:
      (caseRequest["maxWorkQuantaOverride"] as number | undefined) ??
      (caseRequest["maxWorkQuanta"] as number | undefined) ??
      (defaults["maxWorkQuanta"] as number),
    events,
  };
  return request;
}

/* ------------------------------------------------------------------ */
/* Stub oracle                                                        */
/* ------------------------------------------------------------------ */

type TableOutcome =
  | Readonly<{ kind: "cost"; cost: readonly number[] }>
  | Readonly<{ kind: "refused"; lockVoiceIds: readonly string[] }>;

function zeroEvidence<
  Termination extends VoiceAssignmentWorkEvidence["termination"],
>(termination: Termination): VoiceAssignmentWorkEvidence &
  Readonly<{ termination: Termination }> {
  return {
    sourceVoicesVisited: 0,
    targetVoicesVisited: 0,
    matrixCellsVisited: 0,
    transitionCandidatesEvaluated: 0,
    scoreComparisons: 0,
    backtraceSteps: 0,
    identityComparisons: 0,
    roleDegreesVisited: 0,
    roleMembershipComparisons: 0,
    roleOrderComparisons: 0,
    relationClassifications: 0,
    lockChecks: 0,
    voiceIdsAllocated: 0,
    arcsProduced: 0,
    peakInputVoiceRecords: 0,
    peakInputRoleDegreeRecords: 0,
    peakMatrixCellRecords: 0,
    peakPredecessorRecords: 0,
    peakScoreRecords: 0,
    peakPathStepRecords: 0,
    peakArcRecords: 0,
    peakArcEndpointRecords: 0,
    peakArcIdentityRecords: 0,
    peakOutputVoiceRecords: 0,
    peakOutputRoleDegreeRecords: 0,
    peakRelationRecords: 0,
    peakLockRecords: 0,
    peakLockEvidenceRecords: 0,
    peakTrackedRecords: 0,
    termination,
  };
}

function assignFrame(
  frame: UnassignedVoiceFrame,
  requestId: string,
): AssignedVoiceFrame {
  const voices = frame.voices.map((voice, index) => ({
    ...voice,
    voiceId: `voice-${String(index).padStart(4, "0")}`,
    voiceSerial: index,
  }));
  return {
    schema: VOICE_ASSIGNMENT_FRAME_SCHEMA,
    kind: "assigned",
    requestId,
    eventId: frame.eventId,
    roles: frame.roles,
    voices: voices as unknown as AssignedVoiceFrame["voices"],
    nextVoiceSerial: voices.length,
  };
}

function stubCost(tuple: readonly number[]): VoiceAssignmentCost {
  return {
    alignmentCost: 0,
    gapCount: 0,
    enteringVoices: 0,
    leavingVoices: 0,
    totalAbsoluteMotion: tuple[0] ?? 0,
    maximumAbsoluteLeap: tuple[1] ?? 0,
    pitchClassCommonTones: 0,
    exactSustains: 0,
    spelledPitchClassContinuities: 0,
    spelledPitchContinuities: 0,
    commonTonesLost: tuple[2] ?? 0,
    guideToneContinuities: 0,
    guideTonesLost: 0,
    crowdedLowIntervals: tuple[3] ?? 0,
    doubledGuideTones: tuple[4] ?? 0,
    omittedColors: tuple[5] ?? 0,
    totalSpan: tuple[6] ?? 0,
  };
}

function ordinalOfEvent(eventId: string): number {
  return Number(eventId.slice("event-".length));
}

/**
 * Table-driven V1 stand-in. Layer lookups key on the from-event ordinal;
 * a call whose target ordinal is not the successor is a loop-closure call.
 */
export function buildStubOperations(fixture: FixtureCase): VoiceAssignmentOperations {
  const caseRequest = fixture.record["request"] as JsonObject;
  const generator = caseRequest["generator"] as GeneratorSpec | undefined;
  const layerTable = new Map<string, TableOutcome>();
  const loopTable = new Map<string, TableOutcome>();
  const toOutcome = (entry: JsonObject): TableOutcome =>
    entry["refusal"] === undefined
      ? { kind: "cost", cost: entry["cost"] as readonly number[] }
      : {
          kind: "refused",
          lockVoiceIds:
            (entry["lockConflictVoiceIds"] as readonly string[] | undefined) ?? [],
        };
  for (const entry of (caseRequest["transitions"] as JsonObject[] | undefined) ?? []) {
    layerTable.set(
      `${String(entry["fromEventOrdinal"])}:${String(entry["from"])}->${String(entry["to"])}`,
      toOutcome(entry),
    );
  }
  for (const entry of (caseRequest["loopTransitions"] as JsonObject[] | undefined) ??
    []) {
    loopTable.set(
      `${String(entry["from"])}->${String(entry["to"])}`,
      toOutcome(entry),
    );
  }
  const generatorOutcome = (from: string, to: string): TableOutcome => {
    if (!generator) throw new Error("no generator");
    if (generator.costRule === "uniform" && generator.uniformCost) {
      return { kind: "cost", cost: generator.uniformCost };
    }
    if (generator.costRule === "table" && generator.costTable) {
      const cost = generator.costTable[`${from}->${to}`];
      if (!cost) throw new Error(`missing generator cost ${from}->${to}`);
      return { kind: "cost", cost };
    }
    const d = Math.abs(Number(from.slice(-3)) - Number(to.slice(-3)));
    return { kind: "cost", cost: [d + 1, d + 1, 0, 0, 0, 0, 12] };
  };
  return {
    initializeVoiceFrame: (request): InitializeVoiceFrameResult => ({
      ok: true,
      value: {
        schema: VOICE_ASSIGNMENT_RESULT_SCHEMA,
        kind: "initialized",
        frame: assignFrame(request.frame, request.requestId),
        explanation: {
          engineId: "changes.voice-assignment",
          engineVersion: 1,
          policyId: "changes.voice-assignment.order-preserving-smooth",
          policyVersion: 1,
          identityPolicyId: "changes.voice-identity",
          identityPolicyVersion: 1,
          tieBreakPolicyId: "changes.voice-assignment.tie-break",
          tieBreakPolicyVersion: 1,
          rolePolicyId: "changes.voice-assignment.v0-template-roles",
          rolePolicyVersion: 1,
          lowRegisterPolicyId: "changes.voicing-low-register-spacing",
          lowRegisterPolicyVersion: 1,
          noncrossingByConstruction: true,
          wallTimeAffectedSelection: false,
          operationPath: [],
        },
      },
      evidence: {
        ...zeroEvidence("complete-initialized"),
      },
    }),
    assignVoiceTransition: (request): AssignVoiceTransitionResult => {
      const fromId = request.from.roles.candidateId;
      const toId = request.to.roles.candidateId;
      const fromOrdinal = ordinalOfEvent(request.from.eventId);
      const toOrdinal = ordinalOfEvent(request.to.eventId);
      const isLoop = toOrdinal !== fromOrdinal + 1;
      let outcome: TableOutcome;
      if (generator) {
        outcome = generatorOutcome(fromId, toId);
      } else if (isLoop) {
        const found = loopTable.get(`${fromId}->${toId}`);
        if (!found) throw new Error(`missing loop transition ${fromId}->${toId}`);
        outcome = found;
      } else {
        const key = `${String(fromOrdinal)}:${fromId}->${toId}`;
        const found = layerTable.get(key);
        if (!found) throw new Error(`missing transition ${key}`);
        outcome = found;
      }
      if (outcome.kind === "refused") {
        return {
          ok: false,
          refusal: {
            code: "voice_assignment.no_assignment",
            reason:
              outcome.lockVoiceIds.length > 0
                ? "lock-conflict"
                : "voice-id-space-exhausted",
            conflictingLockOrdinals: [],
            path: ["locks"],
            partialResult: false,
          },
          locks: [],
          evidence: { ...zeroEvidence("no-assignment") },
        };
      }
      const assigned = assignFrame(request.to, request.requestId);
      const arcs: VoiceArc[] = request.from.voices.slice(0, 3).map(
        (voice, index) => {
          const target = request.to.voices[index] ?? request.to.voices[0];
          const fromMidi: number = voice.midi;
          const toMidi: number = target.midi;
          const semitones = toMidi - fromMidi;
          const { voiceId, voiceSerial, ...fromEndpoint } = voice;
          return {
            schema: "changes.theory.voice-arc.v1",
            kind: "match",
            identityDisposition: "propagated",
            identity: { voiceId, voiceSerial },
            from: fromEndpoint,
            to: target,
            semitones,
            absoluteSemitones: Math.abs(semitones),
            motion:
              semitones === 0
                ? "stationary"
                : semitones > 0
                  ? "ascending"
                  : "descending",
            exactMidiIdentity: semitones === 0,
            pitchClassIdentity: ((semitones % 12) + 12) % 12 === 0,
            spelledPitchClassIdentity: false,
            spelledPitchIdentity: false,
            degreeIdentity: false,
            commonTone: semitones === 0,
            guideTone: false,
            guideToneContinuity: false,
          };
        },
      );
      const operationPath = [
        { kind: "match", sourceOrdinal: 0, targetOrdinal: 0 },
        { kind: "match", sourceOrdinal: 1, targetOrdinal: 1 },
        { kind: "match", sourceOrdinal: 2, targetOrdinal: 2 },
      ] as const;
      const value = {
        schema: VOICE_ASSIGNMENT_RESULT_SCHEMA,
        kind: "assigned-transition",
        requestId: request.requestId,
        fromEventId: request.from.eventId,
        toEventId: request.to.eventId,
        frame: assigned,
        arcs,
        relations: [],
        locks: [],
        cost: stubCost(outcome.cost),
        orderKey: [0, 0, 0, 0, 0, 0, operationPath],
        explanation: {
            engineId: "changes.voice-assignment",
            engineVersion: 1,
            policyId: "changes.voice-assignment.order-preserving-smooth",
            policyVersion: 1,
            identityPolicyId: "changes.voice-identity",
            identityPolicyVersion: 1,
            tieBreakPolicyId: "changes.voice-assignment.tie-break",
            tieBreakPolicyVersion: 1,
            rolePolicyId: "changes.voice-assignment.v0-template-roles",
            rolePolicyVersion: 1,
            lowRegisterPolicyId: "changes.voicing-low-register-spacing",
            lowRegisterPolicyVersion: 1,
            noncrossingByConstruction: true,
            wallTimeAffectedSelection: false,
            operationPath,
          },
      };
      return {
        ok: true,
        value,
        evidence: { ...zeroEvidence("complete-assigned") },
      } as unknown as AssignVoiceTransitionResult;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Drivers and expectation helpers                                    */
/* ------------------------------------------------------------------ */

export type TerminalRun = Readonly<{
  states: readonly ProgressionSearchState[];
  terminal: ProgressionSearchState;
  outcome: ProgressionOptimizationOutcome;
}>;

export function runToTerminal(
  request: ProgressionOptimizationRequest,
  operations: VoiceAssignmentOperations,
): TerminalRun {
  const initialized = initializeProgressionOptimization(request, operations);
  if (!initialized.ok) {
    throw new Error(`unexpected refusal ${initialized.refusal.code}`);
  }
  const states: ProgressionSearchState[] = [initialized.value];
  let current = initialized.value;
  let guard = 0;
  while (current.status === "running") {
    guard += 1;
    if (guard > 10_000) throw new Error("runToTerminal guard tripped");
    const advanced = advanceProgressionOptimization(current, operations);
    if (!advanced.ok) throw new Error(`unexpected refusal ${advanced.refusal.code}`);
    current = advanced.value;
    states.push(current);
  }
  const outcome = current.outcome;
  if (!outcome) throw new Error("terminal state without outcome");
  return { states, terminal: current, outcome };
}

export function cancelAfter(
  request: ProgressionOptimizationRequest,
  operations: VoiceAssignmentOperations,
  advances: number,
  reason: ProgressionCancelReason,
): ProgressionSearchState {
  const initialized = initializeProgressionOptimization(request, operations);
  if (!initialized.ok) {
    throw new Error(`unexpected refusal ${initialized.refusal.code}`);
  }
  let current = initialized.value;
  for (let i = 0; i < advances; i += 1) {
    const advanced = advanceProgressionOptimization(current, operations);
    if (!advanced.ok) throw new Error(`unexpected refusal ${advanced.refusal.code}`);
    current = advanced.value;
  }
  const cancelled = cancelProgressionOptimization(current, reason);
  if (!cancelled.ok) throw new Error(`unexpected refusal ${cancelled.refusal.code}`);
  return cancelled.value;
}

export function namedCostOf(tuple: readonly number[]): ProgressionCost {
  return Object.fromEntries(
    PROGRESSION_COST_AXES.map((axis, i) => [axis, tuple[i] ?? 0]),
  ) as ProgressionCost;
}

export function pathToPointer(path: readonly (string | number)[]): string {
  return `/${path.map(String).join("/")}`;
}

export type ExpectedRealization = Readonly<{
  candidateIds: readonly string[];
  cost: ProgressionCost;
  loopClosureApplied: boolean;
}>;

export function expandExpectedRealizations(
  segment: JsonObject,
): readonly ExpectedRealization[] {
  const pattern = segment["realizationPattern"] as JsonObject | undefined;
  if (!pattern) {
    return ((segment["realizations"] as JsonObject[] | undefined) ?? []).map(
      (row) => ({
        candidateIds: row["candidateIds"] as readonly string[],
        cost: namedCostOf(row["cost"] as readonly number[]),
        loopClosureApplied: row["loopClosureApplied"] as boolean,
      }),
    );
  }
  const kind = pattern["patternKind"] as string;
  const cost = namedCostOf(pattern["cost"] as readonly number[]);
  if (kind === "stay-chains") {
    const count = pattern["count"] as number;
    const length = pattern["length"] as number;
    return Array.from({ length: count }, (_, k) => ({
      candidateIds: Array.from({ length }, () => candidateIdOf(k)),
      cost,
      loopClosureApplied: false,
    }));
  }
  if (kind === "uniform") {
    return [
      {
        candidateIds: Array.from(
          { length: pattern["length"] as number },
          () => pattern["candidateId"] as string,
        ),
        cost,
        loopClosureApplied: false,
      },
    ];
  }
  if (kind === "lexicographic-first") {
    const count = pattern["count"] as number;
    const length = pattern["length"] as number;
    const candidateCount = pattern["candidateCount"] as number;
    const out: ExpectedRealization[] = [];
    const sequence = new Array<number>(length).fill(0);
    for (let n = 0; n < count; n += 1) {
      out.push({
        candidateIds: sequence.map((index) => candidateIdOf(index)),
        cost,
        loopClosureApplied: false,
      });
      for (let position = length - 1; position >= 0; position -= 1) {
        const digit = (sequence[position] ?? 0) + 1;
        if (digit < candidateCount) {
          sequence[position] = digit;
          break;
        }
        sequence[position] = 0;
      }
    }
    return out;
  }
  throw new Error(`unknown realization pattern ${kind}`);
}

export function expectedDegradations(
  expected: JsonObject,
): readonly ProgressionDegradation[] {
  return ((expected["degradations"] as JsonObject[] | undefined) ?? []).map(
    (row) => ({
      schema: PROGRESSION_DEGRADATION_SCHEMA,
      code: PROGRESSION_DEGRADATION_CODE,
      reason: row["reason"] as ProgressionDegradation["reason"],
      segmentOrdinal: row["segmentOrdinal"] as number | null,
      windowOrdinal: row["windowOrdinal"] as number | null,
      eventIds: (row["eventIds"] as readonly string[]).map(eventIdOf),
      constraintRefs: ((row["constraintRefs"] as JsonObject[] | undefined) ?? []).map(
        (ref) => ({
          eventId: eventIdOf(ref["eventId"] as string),
          kind: ref["kind"] as ProgressionDegradation["constraintRefs"][number]["kind"],
          voiceId: ref["voiceId"] as string | null,
        }),
      ),
    }),
  );
}

export type FixtureRun = Readonly<{
  fixture: FixtureCase;
  request: ProgressionOptimizationRequest;
  operations: VoiceAssignmentOperations;
  run: TerminalRun;
}>;

export async function runFixtureCase(id: string): Promise<FixtureRun> {
  const fixture = await requireCase(id);
  const request = buildRequest(fixture);
  const operations = buildStubOperations(fixture);
  const run = runToTerminal(request, operations);
  return { fixture, request, operations, run };
}

/**
 * Assert a terminal production outcome matches the reviewed fixture
 * expectation in kind, termination, realizations, aggregate cost,
 * degradations, conflicts, counters, and memory.
 */
export function expectOutcomeMatchesFixture(
  fixture: FixtureCase,
  outcome: ProgressionOptimizationOutcome,
): void {
  const expected = fixture.record["expected"] as JsonObject;
  expect(outcome.kind).toBe(expected["kind"] as typeof outcome.kind);
  expect(outcome.termination).toBe(
    expected["termination"] as typeof outcome.termination,
  );
  if (outcome.kind === "optimized") {
    const expectedSegments = (expected["segments"] as JsonObject[] | undefined) ?? [];
    expect(outcome.segments).toHaveLength(expectedSegments.length);
    outcome.segments.forEach((segment, index) => {
      const expectedSegment = expectedSegments[index];
      if (!expectedSegment) return;
      for (const key of [
        "segmentOrdinal",
        "windowOrdinal",
        "boundaryCondition",
        "firstEventOrdinal",
        "lastEventOrdinal",
      ] as const) {
        if (key in expectedSegment) {
          expect(segment[key]).toBe(
            expectedSegment[key] as (typeof segment)[typeof key],
          );
        }
      }
      const expectedRealizations = expandExpectedRealizations(expectedSegment);
      expect(
        segment.realizations.map((realization) => ({
          candidateIds: [...realization.candidateIds] as readonly string[],
          cost: realization.cost,
          loopClosureApplied: realization.loopClosureApplied,
        })),
      ).toEqual([...expectedRealizations]);
      segment.realizations.forEach((realization, ordinal) => {
        expect(realization.realizationOrdinal).toBe(ordinal);
      });
    });
    if ("aggregateSelectedCost" in expected) {
      expect(outcome.aggregateSelectedCost).toEqual(
        namedCostOf(expected["aggregateSelectedCost"] as readonly number[]),
      );
    }
  }
  if (outcome.kind === "optimized" || outcome.kind === "no-realization") {
    expect([...outcome.degradations]).toEqual([...expectedDegradations(expected)]);
    expect([...outcome.conflicts]).toEqual([...expectedConflicts(expected)]);
  }
  const expectedCounters = expected["counters"] as
    | Record<string, number>
    | undefined;
  if (expectedCounters) {
    expect({ ...outcome.stats.counters } as Record<string, number>).toEqual(
      expectedCounters,
    );
    const counters = outcome.stats.counters;
    expect(counters.workUnits).toBe(
      counters.seededStates +
        counters.statePairExpansions +
        counters.loopClosureUnits,
    );
  }
  const expectedMemory = expected["memory"] as Record<string, number> | undefined;
  if (expectedMemory) {
    expect({ ...outcome.stats.memory } as Record<string, number>).toEqual(
      expectedMemory,
    );
  }
}

export function expectedConflicts(
  expected: JsonObject,
): readonly ProgressionConflict[] {
  return ((expected["conflicts"] as JsonObject[] | undefined) ?? []).map((row) => ({
    schema: PROGRESSION_CONFLICT_SCHEMA,
    segmentOrdinal: row["segmentOrdinal"] as number,
    windowOrdinal: row["windowOrdinal"] as number,
    eventId: eventIdOf(row["eventId"] as string),
    constraintRefs: ((row["constraintRefs"] as JsonObject[] | undefined) ?? []).map(
      (ref) => ({
        eventId: eventIdOf(ref["eventId"] as string),
        kind: ref["kind"] as ProgressionConflict["constraintRefs"][number]["kind"],
        voiceId: ref["voiceId"] as string | null,
      }),
    ),
    minimality: "bounded-small",
    explicitRelaxations: [],
  }));
}
