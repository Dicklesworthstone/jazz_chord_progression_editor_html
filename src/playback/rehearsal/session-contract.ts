/** September rehearsal specification. No production compiler is provided by
 * this file; runtime implementation and native proof are separate Beads. */
import type { BeatRange, DocumentId, KeyContext } from "../../domain";
import type { PlaybackPlan } from "../playback-plan-contract";

export const REHEARSAL_SEQUENCE_SCHEMA = "changes.playback.rehearsal-sequence.v1";
export const REHEARSAL_SEQUENCE_POLICY = "changes.rehearsal-sequence@1";
export const REHEARSAL_SPECIFICATION_STATUS = "specified-not-implemented";
export const REHEARSAL_LIMITS = Object.freeze({
  templates: 12,
  passes: 64,
  sourceEventsPerTemplate: 8_192,
  inputEventsVisited: 786_432,
  retainedEvents: 65_536,
  retainedPitchSlots: 262_144,
  passEventVisits: 4_194_304,
  sourceTimelineTicks: 960_000_000,
  expandedTicks: 61_440_000_000,
  tempoMinimum: 20,
  tempoMaximum: 400,
  countInBars: 1,
  pendingPreparation: 1,
  activeSession: 1,
});

export const REHEARSAL_FAILURE_CODES = Object.freeze([
  "rehearsal.request_invalid", "rehearsal.source_stale",
  "rehearsal.range_invalid", "rehearsal.range_empty",
  "rehearsal.pass_limit", "rehearsal.tempo_invalid",
  "rehearsal.key_sequence_unavailable", "rehearsal.key_invalid",
  "rehearsal.transposition_refused", "rehearsal.performance_refused",
  "rehearsal.plan_invalid", "rehearsal.work_limit",
  "rehearsal.cancelled", "rehearsal.audio_refused",
  "rehearsal.session_active", "rehearsal.session_inactive",
] as const);
export type RehearsalFailureCode = (typeof REHEARSAL_FAILURE_CODES)[number];

export type RehearsalSourceBinding = Readonly<{
  documentId: DocumentId;
  /** Nonnegative safe integer; the application also owns the exact document
   * reference that supplied this binding and rechecks it before admission. */
  revision: number;
}>;
export type RehearsalWork = Readonly<{
  templatesVisited: number;
  inputEventsVisited: number;
  projectedEvents: number;
  retainedPitchSlots: number;
  passesProduced: number;
  passEventVisits: number;
}>;
export type RehearsalFailure = Readonly<{
  ok: false;
  code: RehearsalFailureCode;
  templateIndex: number | null;
  passIndex: number | null;
  /** Exact upstream refusal, when one owns the failure; never a replacement
   * musical diagnosis or a reason to fall back to a different arrangement. */
  causeCode: string | null;
  limit: Readonly<{ resource: string; maximum: number; attempted: number }> | null;
  work: RehearsalWork;
}>;
export type RehearsalTemplate = Readonly<{
  key: KeyContext | null;
  /** Full, loop-free performed chart, before selecting its passage. */
  plan: PlaybackPlan;
}>;
export type RehearsalCompileRequest = Readonly<{
  schema: typeof REHEARSAL_SEQUENCE_SCHEMA;
  source: RehearsalSourceBinding;
  range: BeatRange;
  /** Explicit order; same-key preparation supplies exactly one template.
   * H1's dependent leaf owns transposed templates, never this compiler. */
  templates: readonly RehearsalTemplate[];
  passesPerKey: number;
  startTempoBpm: number;
  endTempoBpm: number;
  countIn: boolean;
}>;
export type RehearsalPass = Readonly<{
  /** Zero-based, contiguous across the expanded key/tempo sequence. */
  ordinal: number;
  templateIndex: number;
  /** Integer20..400, admitted through the existing domain tempo factory. */
  tempoBpm: number;
}>;
export type RehearsalSequence = Readonly<{
  schema: typeof REHEARSAL_SEQUENCE_SCHEMA;
  policy: typeof REHEARSAL_SEQUENCE_POLICY;
  source: RehearsalSourceBinding;
  range: BeatRange;
  rangeTicks: Readonly<{ start: number; end: number }>;
  /** Projected immutable plans retain absolute source time and full-chart
   * totals. Passes reference them without duplicating their event arrays. */
  templates: readonly RehearsalTemplate[];
  passes: readonly RehearsalPass[];
  countIn: boolean;
  expandedTicks: number;
}>;
export type RehearsalCompileResult = RehearsalFailure | Readonly<{
  ok: true;
  sequence: RehearsalSequence;
  work: RehearsalWork;
}>;
export type CompileRehearsalSequence = (request: RehearsalCompileRequest) => RehearsalCompileResult;

/** Proposed additive X1 play payload field. Absence retains every v1 play
 * law. The existing command queue/scheduler owns this finite sequence; the
 * application cannot turn these descriptors into repeated Play commands. */
export type RehearsalPlayExtension = Readonly<{
  rehearsalSequence: RehearsalSequence;
}>;
export type RehearsalTransportProgress = Readonly<{
  source: RehearsalSourceBinding;
  /** Actual audible pass, not the pass being scheduled in lookahead. */
  audiblePass: number;
  totalPasses: number;
  tempoBpm: number;
  countingIn: boolean;
  state: "playing" | "paused" | "interrupted" | "complete" | "stopped" | "failed";
}>;
export type ReadRehearsalTransportProgress = () => RehearsalTransportProgress | null;
