/**
 * Real-V1 harness for the V2 integration lane: builds musically plausible
 * multi-candidate charts whose frames the production V1 engine accepts,
 * runs the production V2 optimizer over the real oracle, and refolds
 * selected chains through direct public V1 calls so aggregate costs are
 * verified against the real engine rather than any V2 internal.
 */
import {
  PROGRESSION_COST_AGGREGATIONS,
  PROGRESSION_COST_AXES,
  PROGRESSION_COST_POLICY_ID,
  PROGRESSION_COST_POLICY_VERSION,
  PROGRESSION_EVENT_SCHEMA,
  PROGRESSION_OPTIMIZER_ENGINE_ID,
  PROGRESSION_OPTIMIZER_ENGINE_VERSION,
  PROGRESSION_OPTIMIZER_REQUEST_SCHEMA,
  PROGRESSION_SEARCH_POLICY_ID,
  PROGRESSION_SEARCH_POLICY_VERSION,
  PROGRESSION_TIE_BREAK_POLICY_ID,
  PROGRESSION_TIE_BREAK_POLICY_VERSION,
  VOICE_ASSIGNMENT_LOCK_SCHEMA,
  VOICE_ASSIGNMENT_POLICY_ID,
  VOICE_ASSIGNMENT_POLICY_VERSION,
  VOICE_ASSIGNMENT_REQUEST_SCHEMA,
  assignVoiceTransition,
  initializeVoiceFrame,
  type ProgressionCost,
  type ProgressionEvent,
  type ProgressionOptimizationRequest,
  type UnassignedVoiceFrame,
  type VoiceAssignmentLocks,
  type VoiceAssignmentOperations,
} from "../../src/theory";
import {
  buildFrame,
  documentIdOf,
  eventIdOf,
  namedCostOf,
  runToTerminal,
  type TerminalRun,
} from "./progression-optimizer-test-kit";

export { assignVoiceTransition, initializeVoiceFrame };
export type { VoiceAssignmentOperations };

function eventWireOf(index: number): string {
  return `event-${String(index).padStart(4, "0")}`;
}

function candidateIdOf(index: number): string {
  return `candidate-${String(index).padStart(3, "0")}`;
}

export type RealChartOptions = Readonly<{
  impossibleLockOnLastEvent?: boolean;
  voicesPerCandidate?: number;
}>;

/**
 * Candidate j of event i keeps strictly ascending distinct MIDI voices;
 * alternating events shift register slightly so transitions carry real,
 * differentiated motion costs.
 */
export function buildRealChartRequest(
  eventCount: number,
  candidateCount: number,
  requestId: string,
  options: RealChartOptions = {},
): ProgressionOptimizationRequest {
  const voiceCount = options.voicesPerCandidate ?? 3;
  const events: ProgressionEvent[] = [];
  for (let i = 0; i < eventCount; i += 1) {
    const shift = i % 2;
    const frames: UnassignedVoiceFrame[] = [];
    for (let j = 0; j < candidateCount; j += 1) {
      const base = 48 + j + shift;
      const midis = [base, base + 4, base + 11, base + 16].slice(0, voiceCount);
      frames.push(buildFrame(eventWireOf(i), candidateIdOf(j), "balanced", midis));
    }
    const lastWithLock =
      options.impossibleLockOnLastEvent === true && i === eventCount - 1;
    const impossibleLocks = lastWithLock
      ? [
          {
            schema: VOICE_ASSIGNMENT_LOCK_SCHEMA,
            requestId: "kit-lock",
            eventId: eventIdOf(eventWireOf(i)),
            voiceId: "voice-0000",
            pitch: buildFrame(eventWireOf(i), candidateIdOf(0), "balanced", [
              100, 104, 111,
            ]).voices[0].pitch,
            degree: null,
          },
        ]
      : [];
    events.push({
      schema: PROGRESSION_EVENT_SCHEMA,
      kind: "auto",
      eventId: eventIdOf(eventWireOf(i)),
      chainBoundary: i === 0 ? "reset" : "continue",
      candidates: frames,
      constraints: {
        families: null,
        range: null,
        bassRange: null,
        locks: (lastWithLock
          ? impossibleLocks
          : []) as unknown as VoiceAssignmentLocks,
      },
    });
  }
  return {
    schema: PROGRESSION_OPTIMIZER_REQUEST_SCHEMA,
    identity: {
      requestId,
      documentId: documentIdOf("doc-v2-real"),
      sourceRevision: 1,
      engineId: PROGRESSION_OPTIMIZER_ENGINE_ID,
      engineVersion: PROGRESSION_OPTIMIZER_ENGINE_VERSION,
      costPolicyId: PROGRESSION_COST_POLICY_ID,
      costPolicyVersion: PROGRESSION_COST_POLICY_VERSION,
      searchPolicyId: PROGRESSION_SEARCH_POLICY_ID,
      searchPolicyVersion: PROGRESSION_SEARCH_POLICY_VERSION,
      tieBreakPolicyId: PROGRESSION_TIE_BREAK_POLICY_ID,
      tieBreakPolicyVersion: PROGRESSION_TIE_BREAK_POLICY_VERSION,
    },
    loopClosure: false,
    maxWorkQuanta: 8192,
    events,
  };
}

export type RealOracleRun = Readonly<{
  request: ProgressionOptimizationRequest;
  outcome: TerminalRun["outcome"];
  terminal: TerminalRun["terminal"];
  refoldSelected: (candidateIds: readonly string[]) => ProgressionCost;
}>;

export function runToTerminalWithRealOracle(
  operations: VoiceAssignmentOperations,
  eventCount: number,
  candidateCount: number,
  requestId: string,
  options: RealChartOptions = {},
): RealOracleRun {
  const request = buildRealChartRequest(
    eventCount,
    candidateCount,
    requestId,
    options,
  );
  const run = runToTerminal(request, operations);
  const refoldSelected = (candidateIds: readonly string[]): ProgressionCost => {
    const tuple: number[] = PROGRESSION_COST_AXES.map(() => 0);
    for (let k = 1; k < candidateIds.length; k += 1) {
      const fromEvent = request.events[k - 1];
      const toEvent = request.events[k];
      if (!fromEvent || !toEvent || fromEvent.kind !== "auto" || toEvent.kind !== "auto") {
        continue;
      }
      const fromFrame = fromEvent.candidates.find(
        (frame) => frame.roles.candidateId === candidateIds[k - 1],
      );
      const toFrame = toEvent.candidates.find(
        (frame) => frame.roles.candidateId === candidateIds[k],
      );
      if (!fromFrame || !toFrame) continue;
      const refoldRequestId = `refold.${String(k)}`;
      const initialized = initializeVoiceFrame({
        schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
        kind: "initialize",
        requestId: refoldRequestId,
        frame: fromFrame,
      });
      if (!initialized.ok) {
        throw new Error("real V1 refused refold initialize");
      }
      const transition = assignVoiceTransition({
        schema: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
        kind: "transition",
        requestId: refoldRequestId,
        from: initialized.value.frame,
        to: toFrame,
        locks: [],
        policyId: VOICE_ASSIGNMENT_POLICY_ID,
        policyVersion: VOICE_ASSIGNMENT_POLICY_VERSION,
      });
      if (!transition.ok) {
        throw new Error("real V1 refused refold transition");
      }
      const cost = transition.value.cost;
      const reported = [
        cost.totalAbsoluteMotion,
        cost.maximumAbsoluteLeap,
        cost.commonTonesLost,
        cost.crowdedLowIntervals,
        cost.doubledGuideTones,
        cost.omittedColors,
        cost.totalSpan,
      ];
      PROGRESSION_COST_AXES.forEach((axis, index) => {
        tuple[index] =
          PROGRESSION_COST_AGGREGATIONS[axis] === "sum"
            ? (tuple[index] ?? 0) + (reported[index] ?? 0)
            : Math.max(tuple[index] ?? 0, reported[index] ?? 0);
      });
    }
    return namedCostOf(tuple);
  };
  return {
    request,
    outcome: run.outcome,
    terminal: run.terminal,
    refoldSelected,
  };
}
