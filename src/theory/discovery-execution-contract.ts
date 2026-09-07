import type { ChordEvent, DocumentId, BeatPosition } from "../domain";

/** Additive protocol specification; no existing engine opts in implicitly. */
export const DISCOVERY_EXECUTION_SCHEMA = "changes.discovery-execution.v1";
export const DISCOVERY_EXECUTION_SPECIFICATION_STATUS = "specified-not-implemented";

/** Primitive units, not elapsed time or the number of calls to step(). */
export const DISCOVERY_EXECUTION_LIMITS = Object.freeze({
  sourceEvents: 256,
  requestBytes: 4_194_304,
  snapshotBytes: 8_388_608,
  resultBytes: 8_388_608,
  valueDepth: 32,
  valueNodes: 262_144,
  textCodeUnits: 65_536,
  identityCodeUnits: 128,
  versions: 64,
  evidenceRows: 128,
  costAxes: 16,
  retainedOptions: 128,
  generatedCandidates: 8_388_608,
  depth: 256,
  stateBytes: 65_536,
  optionBytes: 262_144,
  queuedStates: 100_000,
  expandedStates: 100_000,
  outgoingPerState: 128,
  workUnits: 8_388_608,
  workUnitsPerSemanticQuantum: 64,
  stepMinimum: 1,
  stepMaximum: 1_024,
  trackedBytes: 67_108_864,
  activeJobs: 1,
  scheduledCallbacks: 1,
  preparedResults: 1,
  publicationAttempts: 1,
});

/** Existing engine ceilings are never raised by the common envelope. */
export const DISCOVERY_ENGINE_CEILINGS = Object.freeze({
  H1: Object.freeze({ sourceEvents: 64, lawsPerCandidate: 16, patchOperations: 32 }),
  G0: Object.freeze({ sourceEvents: 256, retainedOptions: 5 }),
  G2: Object.freeze({ sourceEvents: 8, candidatesPerProvider: 32, retainedOptions: 16 }),
  G3: Object.freeze({ routeEvents: 8, outgoingPerState: 64, expandedStates: 50_000,
    retainedOptions: 8, trackedBytes: 67_108_864 }),
  G4: Object.freeze({ slots: 16, candidatesPerSlot: 128, expandedStates: 100_000 }),
  G5: Object.freeze({ depth: 3, outgoingPerState: 8, canonicalNodes: 128 }),
});

/** Closed JSON-shaped data, admitted by a bounded passive-data decoder. */
export type DiscoveryValue = null | boolean | number | string |
  readonly DiscoveryValue[] | Readonly<{ [key: string]: DiscoveryValue }>;

export type DiscoveryVersion = Readonly<{ id: string; version: string }>;
export type DiscoverySourceEvent = Readonly<{
  event: ChordEvent;
  position: BeatPosition;
  /** Exact T1 selected ID, "custom", or null where no choice is required. */
  selectedRealizationId: string | null;
}>;
export type DiscoveryIdentity = Readonly<{
  requestId: string;
  documentId: DocumentId;
  sourceRevision: number;
  engine: DiscoveryVersion;
  policy: DiscoveryVersion;
  laws: readonly DiscoveryVersion[];
  corpora: readonly DiscoveryVersion[];
  /** Null means no random selection. Otherwise an explicit uint32. */
  seed: number | null;
}>;
export type DiscoveryBudgets = Readonly<{
  expandedStates: number;
  generatedCandidates: number;
  retainedOptions: number;
  queuedStates: number;
  outgoingPerState: number;
  depth: number;
  workUnits: number;
  trackedBytes: number;
}>;
export type DiscoveryRequest = Readonly<{
  schema: typeof DISCOVERY_EXECUTION_SCHEMA;
  identity: DiscoveryIdentity;
  source: readonly DiscoverySourceEvent[];
  /** All pins, selected ranges, context, ranking parameters and destinations. */
  constraints: DiscoveryValue;
  input: DiscoveryValue;
  budgets: DiscoveryBudgets;
}>;

export type DiscoveryEvidence = Readonly<{
  kind: "rule" | "corpus" | "context" | "counterevidence" | "missing-premise";
  id: string;
  statement: string;
  sourceEventIds: readonly string[];
}>;
export type DiscoveryCostAxis = Readonly<{
  id: string;
  family: "voice-leading" | "harmony" | "target-fit" | "corpus" | "complexity";
  unit: "semitones" | "count" | "weighted-count" | "ratio" | "rank";
  direction: "minimize" | "maximize" | "target";
  value: number;
  target: number | null;
}>;
export type DiscoveryOptionDraft = Readonly<{
  value: DiscoveryValue;
  /** Engine-specific data; decoded into an existing A0 patch by application. */
  proposal: DiscoveryValue | null;
  evidence: readonly DiscoveryEvidence[];
  counterevidence: readonly DiscoveryEvidence[];
  missingPremises: readonly DiscoveryEvidence[];
  costs: readonly DiscoveryCostAxis[];
  /** Lexicographic policy key, explicitly derived from named cost axes. */
  order: readonly number[];
}>;
export type DiscoveryOption = DiscoveryOptionDraft & Readonly<{
  /** Canonical ordinal scoped by the full admitted request, never a capability. */
  id: string;
}>;

export type DiscoveryCounters = Readonly<{
  workUnits: number;
  /** ceil(workUnits / 64), independent of scheduler partitioning. */
  workQuanta: number;
  expandedStates: number;
  generatedCandidates: number;
  retainedOptions: number;
  queuedStates: number;
  peakQueuedStates: number;
  depthReached: number;
  retainedBytes: number;
  peakTrackedBytes: number;
  allocations: number;
  releases: number;
}>;
export type DiscoveryLimit = "state-cap" | "candidate-cap" | "option-cap" |
  "queue-cap" | "outgoing-cap" | "depth-cap" | "work-cap" | "memory-cap" |
  "result-byte-cap";
export type DiscoveryRefusal = Readonly<{
  code: "discovery.invalid-request" | "discovery.input-limit" |
    "discovery.version-mismatch" | "discovery.invalid-quantum" |
    "discovery.invalid-cursor" | "discovery.invalid-kernel-output" |
    "discovery.invalid-proof" | "discovery.invalid-patch" |
    "discovery.retirement-failed" | "discovery.already-consumed";
  path: readonly (string | number)[];
}>;
type DiscoveryResultBase = Readonly<{
  identity: DiscoveryIdentity;
  /** Complete exact binding, not a digest or request ID alone. */
  request: DiscoveryRequest;
  limits: DiscoveryBudgets;
  counters: DiscoveryCounters;
  evidence: readonly DiscoveryEvidence[];
  counterevidence: readonly DiscoveryEvidence[];
  missingPremises: readonly DiscoveryEvidence[];
}>;
export type DiscoveryResult = DiscoveryResultBase & (
  | Readonly<{ kind: "complete"; termination: "complete"; options: readonly DiscoveryOption[] }>
  | Readonly<{ kind: "no-result"; termination: "complete"; options: readonly [] }>
  | Readonly<{ kind: "bounded-partial"; termination: DiscoveryLimit; options: readonly DiscoveryOption[] }>
  | Readonly<{ kind: "refused"; termination: "refused"; refusal: DiscoveryRefusal; options: readonly [] }>
  | Readonly<{ kind: "cancelled"; termination: "cancelled"; options: readonly [] }>
  | Readonly<{ kind: "stale"; termination: "stale"; options: readonly [] }>
);

/** In-memory cursor: only its issuing stepper may resume its latest position. */
export type DiscoveryCursor = Readonly<{
  requestId: string;
  completedWorkUnits: number;
}>;
export type DiscoveryAdvance =
  | Readonly<{ kind: "yielded"; cursor: DiscoveryCursor; counters: DiscoveryCounters }>
  | Readonly<{ kind: "finished"; result: DiscoveryResult }>;
export type DiscoveryStepper = Readonly<{
  step: (workQuantum: number, cursor: DiscoveryCursor | null) => DiscoveryAdvance;
  cancel: (reason: "cancelled" | "stale") => DiscoveryResult;
}>;

/** A reservation must succeed before allocating the corresponding owned data. */
export type DiscoveryAllocation = Readonly<{ id: number; bytes: number }>;
export type DiscoveryArena = Readonly<{
  reserve: (bytes: number) => DiscoveryAllocation | null;
  /** False for a foreign/already-released handle; balance stays unchanged. */
  release: (allocation: DiscoveryAllocation) => boolean;
  inspect: () => Pick<DiscoveryCounters, "retainedBytes" | "peakTrackedBytes" | "allocations" | "releases">;
}>;

/** Content remains an injected read-only interface, never a compiled import. */
export type DiscoveryContentAdapter = Readonly<{
  versions: readonly DiscoveryVersion[];
  read: (recordId: string) => DiscoveryValue | null;
}>;

export type DiscoveryStepperCreation =
  | Readonly<{ ok: true; stepper: DiscoveryStepper }>
  | Readonly<{ ok: false; refusal: DiscoveryRefusal }>;

/** Registered by composition, never accepted from a result or UI field. */
export type DiscoveryEngine = Readonly<{
  version: DiscoveryVersion;
  policy: DiscoveryVersion;
  laws: readonly DiscoveryVersion[];
  corpora: readonly DiscoveryVersion[];
  /** Fresh job-owned ledger, already charged for the captured application source. */
  create: (request: DiscoveryRequest, arena: DiscoveryArena) => DiscoveryStepperCreation;
}>;
