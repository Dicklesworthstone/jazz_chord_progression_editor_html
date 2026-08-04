import {
  AUTO_VOICING_FAMILIES,
  type AutoVoicingFamily,
  type ChordEventId,
} from "../domain";
import {
  VOICE_ASSIGNMENT_POLICY_ID,
  VOICE_ASSIGNMENT_POLICY_VERSION,
  VOICE_ASSIGNMENT_REQUEST_SCHEMA,
  type UnassignedVoiceFrame,
  type VoiceAssignmentLocks,
  type VoiceAssignmentOperations,
  type VoiceLock,
} from "./voice-assignment-contract";
import { VOICING_TEMPLATE_ROWS } from "./voicing-family-authority";
import type { VoicingCandidateId } from "./voicing-candidates-contract";
import {
  MAX_PROGRESSION_CANDIDATES_PER_EVENT,
  MAX_PROGRESSION_LOCKS_PER_EVENT,
  MAX_PROGRESSION_REQUEST_EVENTS,
  MAX_PROGRESSION_TOTAL_WORK_UNITS,
  MAX_PROGRESSION_WINDOW_EVENTS,
  MAX_PROGRESSION_WORK_QUANTA,
  PROGRESSION_BEAM_WIDTH,
  PROGRESSION_CONFLICT_SCHEMA,
  PROGRESSION_COST_AXES,
  PROGRESSION_COST_AGGREGATIONS,
  PROGRESSION_COST_POLICY_ID,
  PROGRESSION_COST_POLICY_VERSION,
  PROGRESSION_DEGRADATION_CODE,
  PROGRESSION_DEGRADATION_SCHEMA,
  PROGRESSION_MEMORY_COUNTER_NAMES,
  PROGRESSION_OPTIMIZER_ENGINE_ID,
  PROGRESSION_OPTIMIZER_ENGINE_VERSION,
  PROGRESSION_OPTIMIZER_ENGINE_VERSION_TAG,
  PROGRESSION_OPTIMIZER_REQUEST_SCHEMA,
  PROGRESSION_OPTIMIZER_RESULT_SCHEMA,
  PROGRESSION_OPTIMIZER_STATE_SCHEMA,
  PROGRESSION_REALIZATION_SCHEMA,
  PROGRESSION_REQUEST_ID_PATTERN_SOURCE,
  PROGRESSION_SEARCH_POLICY_ID,
  PROGRESSION_SEARCH_POLICY_VERSION,
  PROGRESSION_TIE_BREAK_POLICY_ID,
  PROGRESSION_TIE_BREAK_POLICY_VERSION,
  PROGRESSION_WORK_COUNTER_NAMES,
  PROGRESSION_WORK_QUANTUM_UNITS,
  type AdvanceProgressionOptimizationResult,
  type CancelProgressionOptimizationResult,
  type InitializeProgressionOptimizationResult,
  type ProgressionCancelReason,
  type ProgressionConflict,
  type ProgressionConstraintRef,
  type ProgressionCost,
  type ProgressionDegradation,
  type ProgressionEvent,
  type ProgressionExplanation,
  type ProgressionInputRefusal,
  type ProgressionMemoryCounters,
  type ProgressionOptimizationOutcome,
  type ProgressionOptimizationRequest,
  type ProgressionOptimizerOperations,
  type ProgressionRealization,
  type ProgressionResumeRefusal,
  type ProgressionSearchState,
  type ProgressionSegmentOutcome,
  type ProgressionWorkCounters,
  type ProgressionWorkLimitRefusal,
} from "./progression-optimizer-contract";

/**
 * V2 production bounded progression voicing optimizer.
 *
 * A pure, unit-resumable phase machine over immutable snapshots: every
 * consumed work unit is one seeded state, one (state, target-candidate)
 * expansion attempt, or one loop-closure attempt, in the frozen order of
 * the contract. Bookkeeping that the reference semantics attach to the
 * following unit (layer retention, front assembly, window transitions) is
 * modeled as zero-unit phases executed at the start of the next step, so
 * counters observed at quantum boundaries match the contract exactly.
 * Transition facts come only from the injected V1 operations, memoized per
 * (window, layer, from-candidate, to-candidate); V2 never re-derives or
 * edits a motion fact and never mutates a request or document value.
 */

const REQUEST_ID_PATTERN = new RegExp(PROGRESSION_REQUEST_ID_PATTERN_SOURCE, "u");

const TEMPLATE_FAMILY_BY_ID: ReadonlyMap<string, AutoVoicingFamily> = new Map(
  VOICING_TEMPLATE_ROWS.map((row) => [row.id, row.family]),
);

const IDENTITY_PIN_FIELDS = Object.freeze([
  "engineId",
  "engineVersion",
  "costPolicyId",
  "costPolicyVersion",
  "searchPolicyId",
  "searchPolicyVersion",
  "tieBreakPolicyId",
  "tieBreakPolicyVersion",
] as const);

const IDENTITY_PIN_VALUES: Readonly<Record<string, unknown>> = Object.freeze({
  engineId: PROGRESSION_OPTIMIZER_ENGINE_ID,
  engineVersion: PROGRESSION_OPTIMIZER_ENGINE_VERSION,
  costPolicyId: PROGRESSION_COST_POLICY_ID,
  costPolicyVersion: PROGRESSION_COST_POLICY_VERSION,
  searchPolicyId: PROGRESSION_SEARCH_POLICY_ID,
  searchPolicyVersion: PROGRESSION_SEARCH_POLICY_VERSION,
  tieBreakPolicyId: PROGRESSION_TIE_BREAK_POLICY_ID,
  tieBreakPolicyVersion: PROGRESSION_TIE_BREAK_POLICY_VERSION,
});

type CostTuple = readonly number[];

type Chain = Readonly<{
  path: readonly VoicingCandidateId[];
  cost: CostTuple;
}>;

type MemoOutcome =
  | Readonly<{ kind: "cost"; cost: CostTuple }>
  | Readonly<{ kind: "refused"; lockRelated: boolean }>;

/**
 * Content signatures let repeated chord shapes across a chart share one
 * real V1 evaluation. The cache is append-only and keyed purely by frame
 * and lock content, so it can never change an observable value: V1 is
 * deterministic, and the per-layer memo (and its counters) stay exactly as
 * the contract defines them.
 */
const FRAME_SIGNATURES = new WeakMap<UnassignedVoiceFrame, string>();

function frameSignature(frame: UnassignedVoiceFrame): string {
  const cached = FRAME_SIGNATURES.get(frame);
  if (cached !== undefined) return cached;
  const voices = frame.voices
    .map(
      (voice) =>
        `${String(voice.ordinal)}:${String(voice.midi)}:${voice.pitch.step}${String(voice.pitch.alter)}o${String(voice.pitch.octave)}:${voice.provenance}:${voice.degree === null ? "-" : `${String(voice.degree.number)}a${String(voice.degree.alter)}`}:${voice.guideTone ? "g" : "."}${voice.colorTone ? "c" : "."}`,
    )
    .join("|");
  const roles = `${frame.roles.sourceId}#${String(frame.roles.sourceVersion)}#${frame.roles.realizationId}#${frame.roles.guideDegrees.map((degree) => `${String(degree.number)}a${String(degree.alter)}`).join(",")}#${frame.roles.colorDegrees.map((degree) => `${String(degree.number)}a${String(degree.alter)}`).join(",")}`;
  const signature = `${voices}//${roles}`;
  FRAME_SIGNATURES.set(frame, signature);
  return signature;
}

function locksSignature(locks: VoiceAssignmentLocks): string {
  return locks
    .map(
      (lock) =>
        `${lock.voiceId}:${lock.pitch.step}${String(lock.pitch.alter)}o${String(lock.pitch.octave)}:${lock.degree === null ? "-" : `${String(lock.degree.number)}a${String(lock.degree.alter)}`}`,
    )
    .join("|");
}

type MemoRecord = Readonly<{ key: string; outcome: MemoOutcome }>;

type Phase =
  | "begin"
  | "segment-start"
  | "window-start"
  | "boundary-seed"
  | "boundary-retain"
  | "seeding"
  | "seed-retain"
  | "layer-start"
  | "expanding"
  | "retain"
  | "loop-start"
  | "looping"
  | "loop-finish"
  | "window-dead"
  | "front"
  | "segment-end"
  | "complete";

type Snapshot = Readonly<{
  phase: Phase;
  seg: number;
  win: number;
  layerIndex: number;
  seedIndex: number;
  frontierIndex: number;
  targetIndex: number;
  loopIndex: number;
  boundaryId: VoicingCandidateId | null;
  survivorIndices: readonly number[];
  seedChains: readonly Chain[];
  frontier: readonly Chain[];
  layerMemo: readonly MemoRecord[];
  layerBuckets: readonly (readonly [string, readonly Chain[]])[];
  sawLockRefusal: boolean;
  sawPlainRefusal: boolean;
  evictionEventIds: readonly ChordEventId[];
  loopChains: readonly Chain[];
  loopMemo: readonly MemoRecord[];
  loopApplied: boolean;
  deadConflict: ProgressionConflict | null;
  arena: number;
  layerGenerated: number;
  counters: ProgressionWorkCounters;
  memory: ProgressionMemoryCounters;
  windows: readonly ProgressionSegmentOutcome[];
  degradations: readonly ProgressionDegradation[];
  conflicts: readonly ProgressionConflict[];
  exhausted: boolean;
  anyConflict: boolean;
  segmentDead: boolean;
  loopEligible: boolean;
  realizationCount: number;
}>;

type SegmentPlan = Readonly<{ start: number; length: number }>;

const EXPLANATION: ProgressionExplanation = Object.freeze({
  wallTimeAffectedSelection: false,
  documentMutated: false,
  hardConstraintsRelaxed: false,
  manualFrozenPitchesRewritten: false,
  deterministicForIdenticalInputs: true,
});

function zeroCounters(): ProgressionWorkCounters {
  return Object.fromEntries(
    PROGRESSION_WORK_COUNTER_NAMES.map((name) => [name, 0]),
  ) as Record<(typeof PROGRESSION_WORK_COUNTER_NAMES)[number], number>;
}

function zeroMemory(): ProgressionMemoryCounters {
  return Object.fromEntries(
    PROGRESSION_MEMORY_COUNTER_NAMES.map((name) => [name, 0]),
  ) as Record<(typeof PROGRESSION_MEMORY_COUNTER_NAMES)[number], number>;
}

function zeroCost(): CostTuple {
  return PROGRESSION_COST_AXES.map(() => 0);
}

function foldCost(base: CostTuple, transition: CostTuple): CostTuple {
  return PROGRESSION_COST_AXES.map((axis, i) =>
    PROGRESSION_COST_AGGREGATIONS[axis] === "sum"
      ? (base[i] ?? 0) + (transition[i] ?? 0)
      : Math.max(base[i] ?? 0, transition[i] ?? 0),
  );
}

function dominates(a: CostTuple, b: CostTuple): boolean {
  let strict = false;
  for (let i = 0; i < PROGRESSION_COST_AXES.length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return false;
    if (left < right) strict = true;
  }
  return strict;
}

function compareChains(a: Chain, b: Chain): number {
  for (let i = 0; i < PROGRESSION_COST_AXES.length; i += 1) {
    const delta = (a.cost[i] ?? 0) - (b.cost[i] ?? 0);
    if (delta !== 0) return delta;
  }
  for (let i = 0; i < Math.max(a.path.length, b.path.length); i += 1) {
    const left = a.path[i] ?? "";
    const right = b.path[i] ?? "";
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

function namedCost(tuple: CostTuple): ProgressionCost {
  return Object.fromEntries(
    PROGRESSION_COST_AXES.map((axis, i) => [axis, tuple[i] ?? 0]),
  ) as Record<(typeof PROGRESSION_COST_AXES)[number], number>;
}

function candidatesOf(event: ProgressionEvent): readonly UnassignedVoiceFrame[] {
  return event.kind === "auto" ? event.candidates : [event.candidate];
}

function candidateFamily(frame: UnassignedVoiceFrame): AutoVoicingFamily | null {
  return TEMPLATE_FAMILY_BY_ID.get(frame.roles.sourceId) ?? null;
}

/* ------------------------------------------------------------------ */
/* Request validation (contract section 4 precedence)                 */
/* ------------------------------------------------------------------ */

function refuse(
  code: ProgressionInputRefusal["code"],
  path: readonly (string | number)[],
): ProgressionInputRefusal {
  return { code, path, partialResult: false };
}

function validateRequest(
  request: ProgressionOptimizationRequest,
): ProgressionInputRefusal | null {
  const requestSchema: string = request.schema;
  if (requestSchema !== PROGRESSION_OPTIMIZER_REQUEST_SCHEMA) {
    return refuse("progression.schema_invalid", ["schema"]);
  }
  const identity = request.identity as unknown as Record<string, unknown>;
  for (const field of IDENTITY_PIN_FIELDS) {
    if (identity[field] !== IDENTITY_PIN_VALUES[field]) {
      return refuse("progression.policy_invalid", ["identity", field]);
    }
  }
  if (
    !Number.isInteger(request.identity.sourceRevision) ||
    request.identity.sourceRevision < 0
  ) {
    return refuse("progression.identity_invalid", ["identity", "sourceRevision"]);
  }
  if (
    typeof request.identity.documentId !== "string" ||
    request.identity.documentId.length === 0
  ) {
    return refuse("progression.identity_invalid", ["identity", "documentId"]);
  }
  if (!REQUEST_ID_PATTERN.test(request.identity.requestId)) {
    return refuse("progression.request_id_invalid", ["identity", "requestId"]);
  }
  if (
    !Number.isInteger(request.maxWorkQuanta) ||
    request.maxWorkQuanta < 1 ||
    request.maxWorkQuanta > MAX_PROGRESSION_WORK_QUANTA
  ) {
    return refuse("progression.quantum_budget_invalid", ["maxWorkQuanta"]);
  }
  if (request.events.length > MAX_PROGRESSION_REQUEST_EVENTS) {
    return refuse("progression.event_count_exceeded", ["events"]);
  }
  if (request.events.length === 0) {
    return refuse("progression.event_invalid", ["events"]);
  }
  const seenEventIds = new Set<string>();
  for (let i = 0; i < request.events.length; i += 1) {
    const event = request.events[i];
    if (!event) continue;

    const eventSchema: string = event.schema;
    if (eventSchema !== "changes.theory.progression-event.v1") {
      return refuse("progression.event_invalid", ["events", i, "schema"]);
    }
    if (i === 0 && event.chainBoundary !== "reset") {
      return refuse("progression.event_invalid", ["events", i, "chainBoundary"]);
    }
    if (seenEventIds.has(event.eventId)) {
      return refuse("progression.event_invalid", ["events", i, "eventId"]);
    }
    seenEventIds.add(event.eventId);
    const candidates = candidatesOf(event);
    if (
      event.kind === "auto" &&
      (candidates.length < 1 ||
        candidates.length > MAX_PROGRESSION_CANDIDATES_PER_EVENT)
    ) {
      return refuse("progression.candidate_invalid", ["events", i, "candidates"]);
    }
    const familiesConstrained = event.constraints.families !== null;
    const ids: string[] = [];
    for (const frame of candidates) {
      if (frame.eventId !== event.eventId) {
        return refuse("progression.candidate_invalid", ["events", i, "candidates"]);
      }
      if (familiesConstrained && candidateFamily(frame) === null) {
        return refuse("progression.candidate_invalid", ["events", i, "candidates"]);
      }
      ids.push(frame.roles.candidateId);
    }
    for (let k = 1; k < ids.length; k += 1) {
      if ((ids[k] ?? "") <= (ids[k - 1] ?? "")) {
        return refuse("progression.candidate_invalid", ["events", i, "candidates"]);
      }
    }
    const constraints = event.constraints;
    if (constraints.families !== null) {
      const families = constraints.families;
      const canonical = AUTO_VOICING_FAMILIES.filter((family) =>
        families.includes(family),
      );
      const valid =
        families.length > 0 &&
        new Set(families).size === families.length &&
        families.every((family) =>
          (AUTO_VOICING_FAMILIES as readonly string[]).includes(family),
        ) &&
        families.every((family, index) => canonical[index] === family);
      if (!valid) {
        return refuse("progression.constraint_invalid", [
          "events",
          i,
          "constraints",
          "families",
        ]);
      }
    }
    for (const key of ["range", "bassRange"] as const) {
      const range = constraints[key];
      if (range !== null) {
        const valid =
          Number.isInteger(range.lowMidi) &&
          Number.isInteger(range.highMidi) &&
          range.lowMidi >= 0 &&
          range.highMidi <= 127 &&
          range.lowMidi <= range.highMidi;
        if (!valid) {
          return refuse("progression.constraint_invalid", [
            "events",
            i,
            "constraints",
            key,
          ]);
        }
      }
    }
    if (constraints.locks.length > MAX_PROGRESSION_LOCKS_PER_EVENT) {
      return refuse("progression.constraint_invalid", [
        "events",
        i,
        "constraints",
        "locks",
      ]);
    }
    for (const lock of constraints.locks) {
      if (lock.eventId !== event.eventId) {
        return refuse("progression.constraint_invalid", [
          "events",
          i,
          "constraints",
          "locks",
        ]);
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Working state                                                      */
/* ------------------------------------------------------------------ */

type Working = {
  phase: Phase;
  seg: number;
  win: number;
  layerIndex: number;
  seedIndex: number;
  frontierIndex: number;
  targetIndex: number;
  loopIndex: number;
  boundaryId: VoicingCandidateId | null;
  survivorIndices: number[];
  seedChains: Chain[];
  frontier: Chain[];
  layerMemo: Map<string, MemoOutcome>;
  layerBuckets: Map<string, Chain[]>;
  sawLockRefusal: boolean;
  sawPlainRefusal: boolean;
  evictionEventIds: ChordEventId[];
  loopChains: Chain[];
  loopMemo: Map<string, MemoOutcome>;
  loopApplied: boolean;
  deadConflict: ProgressionConflict | null;
  arena: number;
  layerGenerated: number;
  counters: Record<(typeof PROGRESSION_WORK_COUNTER_NAMES)[number], number>;
  memory: Record<(typeof PROGRESSION_MEMORY_COUNTER_NAMES)[number], number>;
  windows: ProgressionSegmentOutcome[];
  degradations: ProgressionDegradation[];
  conflicts: ProgressionConflict[];
  exhausted: boolean;
  anyConflict: boolean;
  segmentDead: boolean;
  loopEligible: boolean;
  realizationCount: number;
};

function thaw(snapshot: Snapshot): Working {
  return {
    phase: snapshot.phase,
    seg: snapshot.seg,
    win: snapshot.win,
    layerIndex: snapshot.layerIndex,
    seedIndex: snapshot.seedIndex,
    frontierIndex: snapshot.frontierIndex,
    targetIndex: snapshot.targetIndex,
    loopIndex: snapshot.loopIndex,
    boundaryId: snapshot.boundaryId,
    survivorIndices: [...snapshot.survivorIndices],
    seedChains: [...snapshot.seedChains],
    frontier: [...snapshot.frontier],
    layerMemo: new Map(snapshot.layerMemo.map((row) => [row.key, row.outcome])),
    layerBuckets: new Map(
      snapshot.layerBuckets.map(([key, chains]) => [key, [...chains]]),
    ),
    sawLockRefusal: snapshot.sawLockRefusal,
    sawPlainRefusal: snapshot.sawPlainRefusal,
    evictionEventIds: [...snapshot.evictionEventIds],
    loopChains: [...snapshot.loopChains],
    loopMemo: new Map(snapshot.loopMemo.map((row) => [row.key, row.outcome])),
    loopApplied: snapshot.loopApplied,
    deadConflict: snapshot.deadConflict,
    arena: snapshot.arena,
    layerGenerated: snapshot.layerGenerated,
    counters: { ...snapshot.counters },
    memory: { ...snapshot.memory },
    windows: [...snapshot.windows],
    degradations: [...snapshot.degradations],
    conflicts: [...snapshot.conflicts],
    exhausted: snapshot.exhausted,
    anyConflict: snapshot.anyConflict,
    segmentDead: snapshot.segmentDead,
    loopEligible: snapshot.loopEligible,
    realizationCount: snapshot.realizationCount,
  };
}

function freeze(working: Working): Snapshot {
  return Object.freeze({
    phase: working.phase,
    seg: working.seg,
    win: working.win,
    layerIndex: working.layerIndex,
    seedIndex: working.seedIndex,
    frontierIndex: working.frontierIndex,
    targetIndex: working.targetIndex,
    loopIndex: working.loopIndex,
    boundaryId: working.boundaryId,
    survivorIndices: Object.freeze([...working.survivorIndices]),
    seedChains: Object.freeze([...working.seedChains]),
    frontier: Object.freeze([...working.frontier]),
    layerMemo: Object.freeze(
      [...working.layerMemo.entries()].map(([key, outcome]) =>
        Object.freeze({ key, outcome }),
      ),
    ),
    layerBuckets: Object.freeze(
      [...working.layerBuckets.entries()].map(
        ([key, chains]) => [key, Object.freeze([...chains])] as const,
      ),
    ),
    sawLockRefusal: working.sawLockRefusal,
    sawPlainRefusal: working.sawPlainRefusal,
    evictionEventIds: Object.freeze([...working.evictionEventIds]),
    loopChains: Object.freeze([...working.loopChains]),
    loopMemo: Object.freeze(
      [...working.loopMemo.entries()].map(([key, outcome]) =>
        Object.freeze({ key, outcome }),
      ),
    ),
    loopApplied: working.loopApplied,
    deadConflict: working.deadConflict,
    arena: working.arena,
    layerGenerated: working.layerGenerated,
    counters: Object.freeze({ ...working.counters }),
    memory: Object.freeze({ ...working.memory }),
    windows: Object.freeze([...working.windows]),
    degradations: Object.freeze([...working.degradations]),
    conflicts: Object.freeze([...working.conflicts]),
    exhausted: working.exhausted,
    anyConflict: working.anyConflict,
    segmentDead: working.segmentDead,
    loopEligible: working.loopEligible,
    realizationCount: working.realizationCount,
  });
}

/* ------------------------------------------------------------------ */
/* Engine                                                             */
/* ------------------------------------------------------------------ */

class Engine {
  private readonly segments: readonly SegmentPlan[];

  constructor(
    private readonly request: ProgressionOptimizationRequest,
    private readonly operations: VoiceAssignmentOperations,
    private readonly contentCache: Map<string, MemoOutcome>,
  ) {
    const segments: { start: number; length: number }[] = [];
    request.events.forEach((event, index) => {
      if (event.chainBoundary === "reset" || segments.length === 0) {
        segments.push({ start: index, length: 0 });
      }
      const current = segments[segments.length - 1];
      if (current) current.length += 1;
    });
    this.segments = segments.map((segment) => Object.freeze({ ...segment }));
  }

  private windowCount(seg: number): number {
    const segment = this.segments[seg];
    if (!segment) return 0;
    return Math.ceil(segment.length / MAX_PROGRESSION_WINDOW_EVENTS);
  }

  private windowEvents(seg: number, win: number): readonly ProgressionEvent[] {
    const segment = this.segments[seg];
    if (!segment) return [];
    const from = segment.start + win * MAX_PROGRESSION_WINDOW_EVENTS;
    const to = Math.min(
      segment.start + segment.length,
      from + MAX_PROGRESSION_WINDOW_EVENTS,
    );
    return this.request.events.slice(from, to);
  }

  private windowFirstOrdinal(seg: number, win: number): number {
    const segment = this.segments[seg];
    return (segment?.start ?? 0) + win * MAX_PROGRESSION_WINDOW_EVENTS;
  }

  private trackGenerated(w: Working): void {
    w.layerGenerated += 1;
    w.memory.peakLayerGeneratedStates = Math.max(
      w.memory.peakLayerGeneratedStates,
      w.layerGenerated,
    );
    w.memory.peakTrackedStates = Math.max(
      w.memory.peakTrackedStates,
      w.arena + w.layerGenerated,
    );
  }

  private retainFrontier(w: Working, frontier: readonly Chain[]): void {
    w.frontier = [...frontier];
    w.arena += frontier.length;
    w.layerGenerated = 0;
    w.memory.peakFrontierStates = Math.max(
      w.memory.peakFrontierStates,
      frontier.length,
    );
  }

  /**
   * Filter an event's candidates by the frozen order (families, range,
   * bassRange), charging each filtered candidate to its first failing
   * kind. Fixed events are never filtered; their violations degrade.
   */
  private filterEvent(
    w: Working,
    event: ProgressionEvent,
  ): Readonly<{ survivors: readonly number[]; failedKinds: readonly string[] }> {
    const constraints = event.constraints;
    const frames = candidatesOf(event);
    if (event.kind === "fixed") {
      const frame = frames[0];
      const violated: string[] = [];
      if (frame) {
        const family = candidateFamily(frame);
        if (
          constraints.families !== null &&
          (family === null || !constraints.families.includes(family))
        ) {
          violated.push("families");
        }
        const range = constraints.range;
        if (
          range !== null &&
          !frame.voices.every(
            (voice) => voice.midi >= range.lowMidi && voice.midi <= range.highMidi,
          )
        ) {
          violated.push("range");
        }
        const bassRange = constraints.bassRange;
        const bass = frame.voices[0].midi;
        if (
          bassRange !== null &&
          (bass < bassRange.lowMidi || bass > bassRange.highMidi)
        ) {
          violated.push("bassRange");
        }
      }
      if (violated.length > 0) {
        w.degradations.push({
          schema: PROGRESSION_DEGRADATION_SCHEMA,
          code: PROGRESSION_DEGRADATION_CODE,
          reason: "fixed-candidate-constraint-conflict",
          segmentOrdinal: w.seg,
          windowOrdinal: w.win,
          eventIds: [event.eventId],
          constraintRefs: violated.map((kind) => ({
            eventId: event.eventId,
            kind: kind as ProgressionConstraintRef["kind"],
            voiceId: null,
          })),
        });
      }
      return { survivors: frames.map((_, index) => index), failedKinds: [] };
    }
    const survivors: number[] = [];
    const failedKinds: string[] = [];
    frames.forEach((frame, index) => {
      let failed: string | null = null;
      const family = candidateFamily(frame);
      if (
        constraints.families !== null &&
        (family === null || !constraints.families.includes(family))
      ) {
        failed = "families";
      } else {
        const range = constraints.range;
        if (
          range !== null &&
          !frame.voices.every(
            (voice) => voice.midi >= range.lowMidi && voice.midi <= range.highMidi,
          )
        ) {
          failed = "range";
        } else {
          const bassRange = constraints.bassRange;
          const bass = frame.voices[0].midi;
          if (
            bassRange !== null &&
            (bass < bassRange.lowMidi || bass > bassRange.highMidi)
          ) {
            failed = "bassRange";
          }
        }
      }
      if (failed === null) survivors.push(index);
      else {
        w.counters.constraintFilteredCandidates += 1;
        if (!failedKinds.includes(failed)) failedKinds.push(failed);
      }
    });
    const order = ["families", "range", "bassRange"];
    failedKinds.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return { survivors, failedKinds };
  }

  private frameFor(
    event: ProgressionEvent,
    candidateId: string,
  ): UnassignedVoiceFrame | null {
    return (
      candidatesOf(event).find(
        (frame) => frame.roles.candidateId === candidateId,
      ) ?? null
    );
  }

  /**
   * Memoized V1 call for one candidate pair. The derived V1 request id is
   * shared by the frame initialization and every transition out of that
   * frame, so V1's request-id agreement laws hold; locks are re-labeled to
   * that id and otherwise forwarded verbatim.
   */
  private callOracle(
    w: Working,
    memo: Map<string, MemoOutcome>,
    namespace: string,
    fromEvent: ProgressionEvent,
    fromId: string,
    toEvent: ProgressionEvent,
    toId: string,
  ): MemoOutcome {
    const key = `${fromId}->${toId}`;
    const existing = memo.get(key);
    if (existing) return existing;
    w.counters.oracleTransitionCalls += 1;
    const outcome = this.evaluatePair(namespace, fromEvent, fromId, toEvent, toId);
    memo.set(key, outcome);
    return outcome;
  }

  private evaluatePair(
    namespace: string,
    fromEvent: ProgressionEvent,
    fromId: string,
    toEvent: ProgressionEvent,
    toId: string,
  ): MemoOutcome {
    const fromFrame = this.frameFor(fromEvent, fromId);
    const toFrame = this.frameFor(toEvent, toId);
    if (!fromFrame || !toFrame) return { kind: "refused", lockRelated: false };
    const contentKey = `${frameSignature(fromFrame)}->${frameSignature(toFrame)}@${locksSignature(toEvent.constraints.locks)}`;
    const cached = this.contentCache.get(contentKey);
    if (cached) return cached;
    const requestId = `v2.${namespace}.${fromId}`;
    const initialized = this.operations.initializeVoiceFrame({
      schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
      kind: "initialize",
      requestId,
      frame: fromFrame,
    });
    if (!initialized.ok) {
      const outcome: MemoOutcome = { kind: "refused", lockRelated: false };
      this.contentCache.set(contentKey, outcome);
      return outcome;
    }
    const locks = toEvent.constraints.locks.map(
      (lock): VoiceLock => ({ ...lock, requestId }),
    ) as unknown as VoiceAssignmentLocks;
    const transition = this.operations.assignVoiceTransition({
      schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
      kind: "transition",
      requestId,
      from: initialized.value.frame,
      to: toFrame,
      locks,
      policyId: VOICE_ASSIGNMENT_POLICY_ID,
      policyVersion: VOICE_ASSIGNMENT_POLICY_VERSION,
    });
    if (!transition.ok) {
      const reason =
        "reason" in transition.refusal
          ? (transition.refusal as { reason?: string }).reason
          : undefined;
      const outcome: MemoOutcome = {
        kind: "refused",
        lockRelated:
          reason === "lock-conflict" ||
          reason === "locked-order-crossing" ||
          transition.refusal.code === "voice_assignment.lock_invalid",
      };
      this.contentCache.set(contentKey, outcome);
      return outcome;
    }
    const cost = transition.value.cost;
    const outcome: MemoOutcome = {
      kind: "cost",
      cost: Object.freeze([
        cost.totalAbsoluteMotion,
        cost.maximumAbsoluteLeap,
        cost.commonTonesLost,
        cost.crowdedLowIntervals,
        cost.doubledGuideTones,
        cost.omittedColors,
        cost.totalSpan,
      ]),
    };
    this.contentCache.set(contentKey, outcome);
    return outcome;
  }

  private markDead(
    w: Working,
    eventId: ChordEventId,
    refs: readonly ProgressionConstraintRef[],
  ): void {
    w.deadConflict = {
      schema: PROGRESSION_CONFLICT_SCHEMA,
      segmentOrdinal: w.seg,
      windowOrdinal: w.win,
      eventId,
      constraintRefs: refs,
      minimality: "bounded-small",
      explicitRelaxations: [],
    };
    w.phase = "window-dead";
  }

  /** Run zero-unit bookkeeping, then either consume one unit or finish. */
  step(w: Working): "unit" | "done" {
    for (;;) {
      switch (w.phase) {
        case "begin": {
          const single =
            this.segments.length === 1 &&
            (this.segments[0]?.length ?? 0) <= MAX_PROGRESSION_WINDOW_EVENTS;
          w.loopEligible = this.request.loopClosure && single;
          if (this.request.loopClosure && !single) {
            w.degradations.push({
              schema: PROGRESSION_DEGRADATION_SCHEMA,
              code: PROGRESSION_DEGRADATION_CODE,
              reason: "loop-closure-skipped",
              segmentOrdinal: null,
              windowOrdinal: null,
              eventIds: [],
              constraintRefs: [],
            });
          }
          w.seg = 0;
          w.phase = "segment-start";
          break;
        }
        case "segment-start": {
          if (w.seg >= this.segments.length) {
            w.phase = "complete";
            break;
          }
          const windowCount = this.windowCount(w.seg);
          if (windowCount > 1) {
            const boundaryIds: ChordEventId[] = [];
            for (let win = 1; win < windowCount; win += 1) {
              const first = this.windowEvents(w.seg, win)[0];
              if (first) boundaryIds.push(first.eventId);
            }
            w.degradations.push({
              schema: PROGRESSION_DEGRADATION_SCHEMA,
              code: PROGRESSION_DEGRADATION_CODE,
              reason: "window-partition",
              segmentOrdinal: w.seg,
              windowOrdinal: null,
              eventIds: boundaryIds,
              constraintRefs: [],
            });
            w.exhausted = true;
          }
          w.win = 0;
          w.boundaryId = null;
          w.segmentDead = false;
          w.phase = "window-start";
          break;
        }
        case "window-start": {
          if (w.segmentDead || w.win >= this.windowCount(w.seg)) {
            w.phase = "segment-end";
            break;
          }
          w.arena = 0;
          w.layerGenerated = 0;
          w.evictionEventIds = [];
          w.loopApplied = false;
          w.deadConflict = null;
          if (w.boundaryId !== null) {
            w.phase = "boundary-seed";
            break;
          }
          const first = this.windowEvents(w.seg, w.win)[0];
          if (!first) {
            w.phase = "segment-end";
            break;
          }
          const { survivors, failedKinds } = this.filterEvent(w, first);
          if (survivors.length === 0) {
            this.markDead(
              w,
              first.eventId,
              failedKinds.map((kind) => ({
                eventId: first.eventId,
                kind: kind as ProgressionConstraintRef["kind"],
                voiceId: null,
              })),
            );
            break;
          }
          w.survivorIndices = [...survivors];
          w.seedChains = [];
          w.seedIndex = 0;
          w.phase = "seeding";
          break;
        }
        case "boundary-seed": {
          w.counters.workUnits += 1;
          w.counters.seededStates += 1;
          w.counters.generatedStates += 1;
          this.trackGenerated(w);
          w.seedChains = [Object.freeze({ path: [], cost: zeroCost() })];
          w.phase = "boundary-retain";
          return "unit";
        }
        case "boundary-retain": {
          this.retainFrontier(w, w.seedChains);
          w.seedChains = [];
          w.layerIndex = 0;
          w.phase = "layer-start";
          break;
        }
        case "seeding": {
          if (w.seedIndex >= w.survivorIndices.length) {
            w.phase = "seed-retain";
            break;
          }
          const first = this.windowEvents(w.seg, w.win)[0];
          const frames = first ? candidatesOf(first) : [];
          const index = w.survivorIndices[w.seedIndex] ?? 0;
          const frame = frames[index];
          w.counters.workUnits += 1;
          w.counters.seededStates += 1;
          w.counters.generatedStates += 1;
          this.trackGenerated(w);
          if (frame) {
            w.seedChains.push(
              Object.freeze({
                path: Object.freeze([frame.roles.candidateId]),
                cost: zeroCost(),
              }),
            );
          }
          w.seedIndex += 1;
          return "unit";
        }
        case "seed-retain": {
          const sorted = [...w.seedChains].sort(compareChains);
          this.retainFrontier(w, sorted);
          w.seedChains = [];
          w.layerIndex = 1;
          w.phase = "layer-start";
          break;
        }
        case "layer-start": {
          const events = this.windowEvents(w.seg, w.win);
          if (w.layerIndex >= events.length) {
            w.phase = w.loopEligible ? "loop-start" : "front";
            break;
          }
          const target = events[w.layerIndex];
          if (!target) {
            w.phase = "front";
            break;
          }
          const { survivors, failedKinds } = this.filterEvent(w, target);
          if (target.kind === "auto" && survivors.length === 0) {
            this.markDead(
              w,
              target.eventId,
              failedKinds.map((kind) => ({
                eventId: target.eventId,
                kind: kind as ProgressionConstraintRef["kind"],
                voiceId: null,
              })),
            );
            break;
          }
          w.survivorIndices = [...survivors];
          w.layerMemo = new Map();
          w.layerBuckets = new Map();
          w.sawLockRefusal = false;
          w.sawPlainRefusal = false;
          w.frontierIndex = 0;
          w.targetIndex = 0;
          w.phase = "expanding";
          break;
        }
        case "expanding": {
          if (w.frontierIndex >= w.frontier.length) {
            w.phase = "retain";
            break;
          }
          if (w.targetIndex >= w.survivorIndices.length) {
            w.frontierIndex += 1;
            w.targetIndex = 0;
            break;
          }
          const events = this.windowEvents(w.seg, w.win);
          const target = events[w.layerIndex];
          const fromEvent =
            w.layerIndex === 0
              ? this.previousWindowLastEvent(w.seg, w.win)
              : events[w.layerIndex - 1];
          const state = w.frontier[w.frontierIndex];
          if (!target || !fromEvent || !state) {
            w.targetIndex += 1;
            break;
          }
          const frames = candidatesOf(target);
          const toFrame = frames[w.survivorIndices[w.targetIndex] ?? 0];
          if (!toFrame) {
            w.targetIndex += 1;
            break;
          }
          const toId = toFrame.roles.candidateId;
          const fromId =
            state.path.length === 0
              ? (w.boundaryId ?? "")
              : (state.path[state.path.length - 1] ?? "");
          w.counters.workUnits += 1;
          w.counters.statePairExpansions += 1;
          const layerOrdinal =
            this.windowFirstOrdinal(w.seg, w.win) + w.layerIndex - 1;
          const before = w.layerMemo.size;
          const outcome = this.callOracle(
            w,
            w.layerMemo,
            `s${String(w.seg)}.w${String(w.win)}.l${String(layerOrdinal)}`,
            fromEvent,
            fromId,
            target,
            toId,
          );
          if (w.layerMemo.size > before && outcome.kind === "refused") {
            w.counters.oracleRefusedTransitions += 1;
            if (outcome.lockRelated) w.sawLockRefusal = true;
            else w.sawPlainRefusal = true;
          }
          if (outcome.kind === "cost") {
            w.counters.generatedStates += 1;
            this.trackGenerated(w);
            const next: Chain = Object.freeze({
              path: Object.freeze([...state.path, toId]),
              cost: foldCost(state.cost, outcome.cost),
            });
            const bucketKey = w.loopEligible
              ? `${next.path[0] ?? ""}|${toId}`
              : toId;
            const bucket = w.layerBuckets.get(bucketKey) ?? [];
            bucket.push(next);
            w.layerBuckets.set(bucketKey, bucket);
          }
          w.targetIndex += 1;
          return "unit";
        }
        case "retain": {
          const events = this.windowEvents(w.seg, w.win);
          const target = events[w.layerIndex];
          const retainedPerBucket: Chain[] = [];
          for (const key of [...w.layerBuckets.keys()].sort()) {
            const bucket = w.layerBuckets.get(key) ?? [];
            for (const chain of bucket) {
              const dominated = bucket.some(
                (other) => other !== chain && dominates(other.cost, chain.cost),
              );
              if (dominated) w.counters.dominancePrunes += 1;
              else retainedPerBucket.push(chain);
            }
          }
          retainedPerBucket.sort(compareChains);
          let retained = retainedPerBucket;
          if (retained.length > PROGRESSION_BEAM_WIDTH) {
            w.counters.beamEvictions += retained.length - PROGRESSION_BEAM_WIDTH;
            retained = retained.slice(0, PROGRESSION_BEAM_WIDTH);
            w.exhausted = true;
            if (target && !w.evictionEventIds.includes(target.eventId)) {
              w.evictionEventIds.push(target.eventId);
            }
          }
          if (retained.length === 0) {
            const refs: ProgressionConstraintRef[] = [];
            if (target && w.sawLockRefusal) {
              const voiceIds = [
                ...new Set(
                  target.constraints.locks.map((lock) => lock.voiceId),
                ),
              ].sort();
              for (const voiceId of voiceIds) {
                refs.push({ eventId: target.eventId, kind: "lock", voiceId });
              }
            }
            if (target && refs.length === 0 && w.sawPlainRefusal) {
              refs.push({
                eventId: target.eventId,
                kind: "transition-no-assignment",
                voiceId: null,
              });
            }
            this.markDead(w, target?.eventId ?? ("" as ChordEventId), refs);
            break;
          }
          this.retainFrontier(w, retained);
          w.layerBuckets = new Map();
          w.layerMemo = new Map();
          w.layerIndex += 1;
          w.phase = "layer-start";
          break;
        }
        case "loop-start": {
          w.loopIndex = 0;
          w.loopChains = [];
          w.loopMemo = new Map();
          w.phase = "looping";
          break;
        }
        case "looping": {
          if (w.loopIndex >= w.frontier.length) {
            w.phase = "loop-finish";
            break;
          }
          const chain = w.frontier[w.loopIndex];
          const events = this.windowEvents(w.seg, w.win);
          const lastEvent = events[events.length - 1];
          const firstEvent = events[0];
          if (!chain || !lastEvent || !firstEvent) {
            w.loopIndex += 1;
            break;
          }
          w.counters.workUnits += 1;
          w.counters.loopClosureUnits += 1;
          const fromId = chain.path[chain.path.length - 1] ?? "";
          const toId = chain.path[0] ?? "";
          const outcome = this.callOracle(
            w,
            w.loopMemo,
            `s${String(w.seg)}.w${String(w.win)}.loop`,
            lastEvent,
            fromId,
            firstEvent,
            toId,
          );
          if (outcome.kind === "refused") {
            w.counters.loopClosureRefusals += 1;
          } else {
            w.loopChains.push(
              Object.freeze({
                path: chain.path,
                cost: foldCost(chain.cost, outcome.cost),
              }),
            );
          }
          w.loopIndex += 1;
          return "unit";
        }
        case "loop-finish": {
          if (w.loopChains.length === 0) {
            const first = this.windowEvents(w.seg, w.win)[0];
            this.markDead(w, first?.eventId ?? ("" as ChordEventId), [
              {
                eventId: first?.eventId ?? ("" as ChordEventId),
                kind: "loop-closure",
                voiceId: null,
              },
            ]);
            break;
          }
          w.frontier = [...w.loopChains];
          w.loopChains = [];
          w.loopApplied = true;
          w.phase = "front";
          break;
        }
        case "window-dead": {
          if (w.evictionEventIds.length > 0) {
            w.degradations.push({
              schema: PROGRESSION_DEGRADATION_SCHEMA,
              code: PROGRESSION_DEGRADATION_CODE,
              reason: "beam-eviction",
              segmentOrdinal: w.seg,
              windowOrdinal: w.win,
              eventIds: [...w.evictionEventIds],
              constraintRefs: [],
            });
          }
          if (w.deadConflict) w.conflicts.push(w.deadConflict);
          w.deadConflict = null;
          w.anyConflict = true;
          w.segmentDead = true;
          w.counters.windowsOptimized += 1;
          w.win += 1;
          w.phase = "window-start";
          break;
        }
        case "front": {
          if (w.evictionEventIds.length > 0) {
            w.degradations.push({
              schema: PROGRESSION_DEGRADATION_SCHEMA,
              code: PROGRESSION_DEGRADATION_CODE,
              reason: "beam-eviction",
              segmentOrdinal: w.seg,
              windowOrdinal: w.win,
              eventIds: [...w.evictionEventIds],
              constraintRefs: [],
            });
          }
          const front = w.frontier.filter(
            (chain) =>
              !w.frontier.some(
                (other) => other !== chain && dominates(other.cost, chain.cost),
              ),
          );
          front.sort(compareChains);
          const events = this.windowEvents(w.seg, w.win);
          const firstOrdinal = this.windowFirstOrdinal(w.seg, w.win);
          const realizations: ProgressionRealization[] = front.map(
            (chain, ordinal) => ({
              schema: PROGRESSION_REALIZATION_SCHEMA,
              realizationOrdinal: ordinal,
              eventIds: events.map((event) => event.eventId),
              candidateIds: chain.path,
              cost: namedCost(chain.cost),
              loopClosureApplied: w.loopApplied,
            }),
          );
          w.windows.push({
            segmentOrdinal: w.seg,
            windowOrdinal: w.win,
            firstEventOrdinal: firstOrdinal,
            lastEventOrdinal: firstOrdinal + events.length - 1,
            boundaryCondition: w.boundaryId !== null ? "fixed-start" : "open",
            realizations,
          });
          w.realizationCount += front.length;
          w.memory.peakRealizationRecords = w.realizationCount;
          w.counters.windowsOptimized += 1;
          const selected = front[0];
          if (selected && w.win < this.windowCount(w.seg) - 1) {
            w.boundaryId = selected.path[selected.path.length - 1] ?? null;
          } else {
            w.boundaryId = null;
          }
          w.win += 1;
          w.phase = "window-start";
          break;
        }
        case "segment-end": {
          w.counters.segmentsOptimized += 1;
          w.seg += 1;
          w.phase = "segment-start";
          break;
        }
        case "complete": {
          return "done";
        }
        default: {
          return "done";
        }
      }
    }
  }

  private previousWindowLastEvent(
    seg: number,
    win: number,
  ): ProgressionEvent | undefined {
    if (win === 0) return undefined;
    const previous = this.windowEvents(seg, win - 1);
    return previous[previous.length - 1];
  }

  buildOutcome(
    w: Working,
    identity: ProgressionOptimizationRequest["identity"],
  ): ProgressionOptimizationOutcome {
    const stats = {
      counters: Object.freeze({ ...w.counters }),
      memory: Object.freeze({ ...w.memory }),
    };
    const termination = w.exhausted ? ("exhausted" as const) : ("complete" as const);
    if (w.anyConflict) {
      return {
        schema: PROGRESSION_OPTIMIZER_RESULT_SCHEMA,
        kind: "no-realization",
        identity,
        termination,
        conflicts: Object.freeze([...w.conflicts]),
        degradations: Object.freeze([...w.degradations]),
        stats,
        explanation: EXPLANATION,
      };
    }
    let aggregate = zeroCost();
    for (const window of w.windows) {
      const selected = window.realizations[0];
      if (selected) {
        aggregate = foldCost(
          aggregate,
          PROGRESSION_COST_AXES.map((axis) => selected.cost[axis]),
        );
      }
    }
    return {
      schema: PROGRESSION_OPTIMIZER_RESULT_SCHEMA,
      kind: "optimized",
      identity,
      termination,
      segments: Object.freeze([...w.windows]),
      aggregateSelectedCost: namedCost(aggregate),
      degradations: Object.freeze([...w.degradations]),
      conflicts: Object.freeze([...w.conflicts]),
      stats,
      explanation: EXPLANATION,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Stepper operations                                                 */
/* ------------------------------------------------------------------ */

type ContinuationPayload = Readonly<{
  request: ProgressionOptimizationRequest;
  snapshot: Snapshot;
  oracleContentCache: Map<string, MemoOutcome>;
}>;

function initialSnapshot(): Snapshot {
  return Object.freeze({
    phase: "begin",
    seg: 0,
    win: 0,
    layerIndex: 0,
    seedIndex: 0,
    frontierIndex: 0,
    targetIndex: 0,
    loopIndex: 0,
    boundaryId: null,
    survivorIndices: Object.freeze([]),
    seedChains: Object.freeze([]),
    frontier: Object.freeze([]),
    layerMemo: Object.freeze([]),
    layerBuckets: Object.freeze([]),
    sawLockRefusal: false,
    sawPlainRefusal: false,
    evictionEventIds: Object.freeze([]),
    loopChains: Object.freeze([]),
    loopMemo: Object.freeze([]),
    loopApplied: false,
    deadConflict: null,
    arena: 0,
    layerGenerated: 0,
    counters: Object.freeze(zeroCounters()),
    memory: Object.freeze(zeroMemory()),
    windows: Object.freeze([]),
    degradations: Object.freeze([]),
    conflicts: Object.freeze([]),
    exhausted: false,
    anyConflict: false,
    segmentDead: false,
    loopEligible: false,
    realizationCount: 0,
  });
}

function makeState(
  request: ProgressionOptimizationRequest,
  snapshot: Snapshot,
  quantaConsumed: number,
  outcome: ProgressionOptimizationOutcome | null,
  oracleContentCache: Map<string, MemoOutcome>,
): ProgressionSearchState {
  const payload: ContinuationPayload = Object.freeze({
    request,
    snapshot,
    oracleContentCache,
  });
  return Object.freeze({
    schema: PROGRESSION_OPTIMIZER_STATE_SCHEMA,
    status: outcome === null ? ("running" as const) : ("terminal" as const),
    identity: request.identity,
    quantaConsumed,
    stats: Object.freeze({
      counters: snapshot.counters,
      memory: snapshot.memory,
    }),
    outcome,
    continuation:
      outcome === null
        ? Object.freeze({
            schema: PROGRESSION_OPTIMIZER_STATE_SCHEMA,
            engineVersionTag: PROGRESSION_OPTIMIZER_ENGINE_VERSION_TAG,
            payload,
          })
        : null,
  });
}

function resumeRefusal(
  code: ProgressionResumeRefusal["code"],
  path: readonly (string | number)[],
): ProgressionResumeRefusal {
  return { code, path, partialResult: false };
}

export const initializeProgressionOptimization = (
  request: ProgressionOptimizationRequest,
  operations: VoiceAssignmentOperations,
): InitializeProgressionOptimizationResult => {
  void operations;
  const refusal = validateRequest(request);
  if (refusal) return { ok: false, refusal };
  return {
    ok: true,
    value: makeState(request, initialSnapshot(), 0, null, new Map()),
  };
};

export const advanceProgressionOptimization = (
  state: ProgressionSearchState,
  operations: VoiceAssignmentOperations,
): AdvanceProgressionOptimizationResult => {
  const stateSchema: string = state.schema;
  if (stateSchema !== PROGRESSION_OPTIMIZER_STATE_SCHEMA) {
    return { ok: false, refusal: resumeRefusal("progression.resume_stale", ["schema"]) };
  }
  if (state.status === "terminal") {
    return {
      ok: false,
      refusal: resumeRefusal("progression.resume_invalid", ["status"]),
    };
  }
  const continuation = state.continuation;
  const continuationTag: string | null =
    continuation === null ? null : continuation.engineVersionTag;
  if (
    continuation === null ||
    continuationTag !== PROGRESSION_OPTIMIZER_ENGINE_VERSION_TAG
  ) {
    return {
      ok: false,
      refusal: resumeRefusal("progression.resume_stale", [
        "continuation",
        "engineVersionTag",
      ]),
    };
  }
  const payload = continuation.payload as ContinuationPayload;
  const engine = new Engine(
    payload.request,
    operations,
    payload.oracleContentCache,
  );
  const working = thaw(payload.snapshot);
  let consumed = 0;
  let done = false;
  while (consumed < PROGRESSION_WORK_QUANTUM_UNITS) {
    const step = engine.step(working);
    if (step === "done") {
      done = true;
      break;
    }
    consumed += 1;
    if (working.counters.workUnits > MAX_PROGRESSION_TOTAL_WORK_UNITS) {
      const refusal: ProgressionWorkLimitRefusal = {
        code: "limit.progression_work_exceeded",
        counter: "workUnits",
        observed: working.counters.workUnits,
        limit: MAX_PROGRESSION_TOTAL_WORK_UNITS,
        path: ["stats", "counters", "workUnits"],
        partialResult: false,
      };
      return { ok: false, refusal };
    }
  }
  const quantaConsumed = state.quantaConsumed + 1;
  working.counters.workQuanta = quantaConsumed;
  if (done) {
    const outcome = engine.buildOutcome(working, payload.request.identity);
    return {
      ok: true,
      value: makeState(
        payload.request,
        freeze(working),
        quantaConsumed,
        outcome,
        payload.oracleContentCache,
      ),
    };
  }
  if (quantaConsumed >= payload.request.maxWorkQuanta) {
    const snapshot = freeze(working);
    const outcome: ProgressionOptimizationOutcome = {
      schema: PROGRESSION_OPTIMIZER_RESULT_SCHEMA,
      kind: "unfinished",
      identity: payload.request.identity,
      termination: "work-quanta-cap",
      stats: Object.freeze({
        counters: snapshot.counters,
        memory: snapshot.memory,
      }),
      explanation: EXPLANATION,
    };
    return {
      ok: true,
      value: makeState(
        payload.request,
        snapshot,
        quantaConsumed,
        outcome,
        payload.oracleContentCache,
      ),
    };
  }
  return {
    ok: true,
    value: makeState(
      payload.request,
      freeze(working),
      quantaConsumed,
      null,
      payload.oracleContentCache,
    ),
  };
};

export const cancelProgressionOptimization = (
  state: ProgressionSearchState,
  reason: ProgressionCancelReason,
): CancelProgressionOptimizationResult => {
  const stateSchema: string = state.schema;
  if (stateSchema !== PROGRESSION_OPTIMIZER_STATE_SCHEMA) {
    return { ok: false, refusal: resumeRefusal("progression.resume_stale", ["schema"]) };
  }
  if (state.status === "terminal") {
    return {
      ok: false,
      refusal: resumeRefusal("progression.resume_invalid", ["status"]),
    };
  }
  const outcome: ProgressionOptimizationOutcome = {
    schema: PROGRESSION_OPTIMIZER_RESULT_SCHEMA,
    kind: "cancelled",
    identity: state.identity,
    termination: "cancelled",
    cancelReason: reason,
    stats: state.stats,
    explanation: EXPLANATION,
  };
  return {
    ok: true,
    value: Object.freeze({
      schema: PROGRESSION_OPTIMIZER_STATE_SCHEMA,
      status: "terminal" as const,
      identity: state.identity,
      quantaConsumed: state.quantaConsumed,
      stats: state.stats,
      outcome,
      continuation: null,
    }),
  };
};

export const progressionOptimizerOperations: ProgressionOptimizerOperations =
  Object.freeze({
    initializeProgressionOptimization,
    advanceProgressionOptimization,
    cancelProgressionOptimization,
  });
